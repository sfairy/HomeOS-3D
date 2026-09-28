"""授权客户端：激活、心跳续租、租约恢复与能力门禁。
"""
from __future__ import annotations

import asyncio
import logging
import secrets
import threading
import time
from collections.abc import Collection
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx
from sqlalchemy import select

from ..config import Settings
from ..core.database import Database
from ..observability.global_log import GlobalLogStore
from ..core.models import LicenseState
from ..core.time_utils import ensure_aware
from .crypto import LeaseVerifier, LicenseCryptoError, LicenseTransportCipher, SecretCipher, parse_timestamp

logger = logging.getLogger(__name__)
from .endpoints import LicenseEndpointPool
from .process_lock import LicenseProcessLock
from .trust import verify_license_trust_anchors
from .heartbeat import LicenseHeartbeatMixin
from .transport import LicenseTransportMixin


#: 本机拿不出可用激活凭证时返回的错误码，前端据此展开手动激活表单。
MANUAL_ACTIVATION_REQUIRED = 'LICENSE_ACTIVATION_REQUIRED'


from .contracts import (
    BASE_FEATURES,
    LicenseClientError,
    TERMINAL_STATES,
)


class LicenseService(LicenseHeartbeatMixin, LicenseTransportMixin):
    """授权服务客户端。
    """


    def _record_status(self, status: str, reason: str | None = None) -> None:
        """记录对外可见的授权状态；只在状态发生变化时写一条中文事件。"""
        # 状态码到中文文案的映射：事件日志与最终用户看到的都是这份文案。
        labels = {
            'UNACTIVATED': '未激活',
            'ACTIVE': '正常',
            'CONNECTION_WARNING': '连接异常',
            'LEASE_EXPIRED': '租约已到期',
            'REVOKED': '已吊销',
            'INVALID': '校验无效',
            'INSTANCE_MISMATCH': '硬件指纹不匹配',
            'CLOCK_ROLLBACK': '系统时间异常',
            'DEACTIVATED': '已停用',
            'RECOVERY_RETRY': '授权会话重试中',
            'RECOVERY_REQUIRED': '授权会话需人工恢复',
            'REMOTE_REJECTED': '授权后台明确拒绝',
            'STARTUP_VALIDATION_REQUIRED': '等待启动联网验证'}
        with self._event_lock:
            previous = self._observed_status
            if previous == status:
                return
            self._observed_status = status
            message = f'''授权状态：{labels.get(status, status)}'''
            if previous is not None:
                message = f'''授权状态变化：{labels.get(previous, previous)} → {labels.get(status, status)}'''
            if reason:
                message += f'''；原因：{reason}'''
            # 级别：正常 success，停用/未激活 info，其余 warning；不可恢复错误再升 error。
            level = 'success' if status == 'ACTIVE' else 'info' if status in frozenset({'DEACTIVATED', 'UNACTIVATED'}) else 'warning'
            if status in frozenset({'INVALID', 'REVOKED', 'CLOCK_ROLLBACK', 'INSTANCE_MISMATCH', 'RECOVERY_REQUIRED', 'REMOTE_REJECTED'}):
                level = 'error'
            self._log_event(level, message)
    def __init__(self, settings: Settings, database: Database, transport: httpx.AsyncBaseTransport | None, *, endpoint_pool: LicenseEndpointPool | None = None, event_log: GlobalLogStore | None = None) -> None:
        """参数:
        """
        self.settings = settings
        self.database = database
        self.event_log = event_log
        # 启动期先钉死信任锚：指纹错了立刻失败并给出密钥准备指引，不拖到首次激活。
        verify_license_trust_anchors(settings)
        # 事件去重状态可能被心跳协程与请求线程同时访问，用可重入锁保护。
        self._event_lock = threading.RLock()
        self._observed_status = None
        # 按操作名累计失败次数，用于「恢复成功」时汇报此前失败了多少次。
        self._event_failures = {}
        # 验签器构造失败（配置里没有可用公钥）会在启动期直接抛错，属于快速失败。
        self.verifier = LeaseVerifier(trusted_keys=settings.license_trusted_public_keys, default_key_id=settings.license_key_id)
        self.cipher = SecretCipher(settings.license_secret_key_path)
        # 传输公钥的指纹在构造时即校验：配置错了不会拖到第一次请求才暴露。
        self.transport_cipher = LicenseTransportCipher(settings.license_transport_public_key_path, settings.license_transport_key_id, settings.license_transport_public_key_sha256)
        self._transport = transport
        self._endpoint_pool = endpoint_pool or LicenseEndpointPool(settings.effective_license_server_batches)
        # 心跳任务句柄，仅在 start() 与 stop() 之间有效。
        self._task = None
        # 心跳与恢复共用这把锁：并发续租会让旧序号租约覆盖新租约（判为 INVALID）。
        self._heartbeat_lock = asyncio.Lock()
        # 停信号：用 Event 而不是 bool，是为了让正在等待的协程能被立刻唤醒。
        self._stop = asyncio.Event()
        # 语义是「计划可能变了，立即重算等待时间」：激活成功后用它打断当前长等待。
        self._schedule_changed = asyncio.Event()
        # 实例 ID 读一次就缓存：硬件指纹运行期不变。
        self._cached_instance_id = None
        # 本次进程启动后是否还没完成联网确认；为真时门禁暂不放行。
        self._startup_validation_pending = False
        # 最近一次 confirm_binding 的单调时钟；用于非强制调用的节流。
        self._last_binding_confirm_at = 0.0
        # 429 冷却截止（单调时钟，0 表示不在冷却）：与「失败降级」分开记，429 不说明绑定有效与否。
        self._rate_limited_until = 0.0
        # 授权凭证的进程锁：既保证「同一 data/ 只跑一个服务」，也保证本进程内同一时刻
        self._process_lock = LicenseProcessLock(settings.data_dir)
        # 手动重试任务句柄：多个页面同时点「重试」共用同一个任务，不排队做多轮令牌轮换。
        self._retry_task = None
        # 启动联网确认的后台任务句柄：它**不在** start() 里被 await（见 start 的说明）。
        self._startup_validation_task = None
        # 连续失败次数：决定退避阶梯 RETRY_DELAYS 取到第几级。
        self._failures = 0
        # 下一次计划重试的单调时刻；None 表示不排重试（刚成功，或已进入终态）。
        self._next_attempt = None
        # 手动重试的节流截止（单调时钟）：连点两次不该真的发起两轮令牌轮换。
        self._manual_retry_after = 0.0
        # 最近一次失败的业务错误码：供 availability() 与前端区分「等一会儿」与「要人工介入」。
        self._error_code = None
        self._success_generation = 0

    #: 打开编辑器等入口强制联网确认，状态轮询走节流。
    BINDING_CONFIRM_THROTTLE_SECONDS = 60.0



    def _binding_needs_confirm(self) -> bool:
        """读本地凭证判断这次调用是否真需要联网（同步，调用方放进工作线程）。
        """
        with self.database.session_factory() as database:
            state = self._state(database)
            return bool(
                state.license_id
                and state.signed_lease
                and state.status
                in frozenset({'ACTIVE', 'CONNECTION_WARNING', 'STARTUP_VALIDATION_REQUIRED', 'LEASE_EXPIRED'})
            )

    async def confirm_binding(self, *, force: bool = False) -> None:
        """联网确认设备绑定仍有效；商店解绑 / 停用后清空本地授权。
        """
        if not self.settings.license_required or not self._endpoint_pool.configured:
            return
        if self._rate_limit_remaining() > 0:
            return
        now = time.monotonic()
        # 节流窗口在发起联网之前占住：窗口内的并发调用只有一个真的发请求，其余带本地状态返回。
        if not force and (now - self._last_binding_confirm_at) < self.BINDING_CONFIRM_THROTTLE_SECONDS:
            return
        self._last_binding_confirm_at = now
        # 同步查库放线程池：SQLAlchemy 的同步会话跑在事件循环上会拖住所有请求。
        if not await asyncio.to_thread(self._binding_needs_confirm):
            return
        try:
            # heartbeat 在 401 时会转 recover；确认吊销时内部已清空本地凭证。
            await self.heartbeat()
        except LicenseClientError as error:
            if error.is_confirmed_revocation:
                # 本地已是 REVOKED；调用方随后 allows() / status() 会拦截并引导重激活。
                self._log_event('warning', f'联网确认绑定失败（已吊销）：{error}')
            # 网络 / 临时故障 / 限流：保留离线租约，等心跳循环重试。

    def _begin_startup_validation(self) -> bool:
        """启动期离线校验（同步，调用方放进工作线程）；返回是否还需联网确认。
        """
        with self.database.session_factory() as database:
            state = self._state(database)
            self._validate_saved_state(state, database)
            # 三者同时成立才要求联网确认：配置要求授权、已有激活记录、本地有签名租约。纯离线部署不受影响。
            pending = bool(
                self.settings.license_required
                and state.license_id
                and state.signed_lease
                and state.status not in TERMINAL_STATES
            )
            self._record_status('STARTUP_VALIDATION_REQUIRED' if pending else state.status)
            return pending

    async def start(self) -> None:
        """启动授权服务：抢数据目录进程锁、离线校验本地状态，必要时联网确认，然后拉起心跳循环。
        """
        # 已在运行就直接返回：重复 start() 会拉起第二个心跳循环，两条循环并发续租。
        if self._task is not None and not self._task.done():
            return
        # 抢进程锁必须在校验之前：抢不到说明同一份 data/ 已有一个实例在跑，此时两条心跳会
        self._process_lock.acquire()
        # 离线校验要读写 LicenseState：放线程池，别在事件循环里做同步查库。
        self._startup_validation_pending = await asyncio.to_thread(self._begin_startup_validation)
        # 有待确认就先排一次「立刻重试」：心跳循环据此不必等一个完整间隔才开始恢复。
        if self._startup_validation_pending:
            self._next_attempt = time.monotonic()
        # 没配置端点就没法联网确认，直接跳过（保持离线验签给出的判定）。
        if self._startup_validation_pending and self._endpoint_pool.configured:
            self._startup_validation_task = asyncio.create_task(
                self._run_startup_validation(), name='license-startup-validation'
            )
        if self._endpoint_pool.configured:
            # 复位停信号：先 stop() 再 start() 时要能重新工作。
            self._stop.clear()
            # 具名任务便于在调试器与日志里辨认。
            self._task = asyncio.create_task(self._heartbeat_loop(), name='license-heartbeat')

    async def _run_startup_validation(self) -> None:
        """启动联网确认的后台实现：失败处理与原先内联在 start() 里时逐字一致。
        """
        try:
            await self.recover()
        except LicenseClientError as error:
            # 启动联网确认失败：确认吊销已由 recover() 清空本地授权，必须保持拦截；
            if not error.is_confirmed_revocation:
                await asyncio.to_thread(self._clear_startup_validation)
        except asyncio.CancelledError:
            raise
        except Exception:  # noqa: BLE001 - 后台任务里的未捕获异常只会变成
            # "Task exception was never retrieved" 告警，而这一步本来就是可重试的：
            # 记一条 warning 留痕，把判定交回心跳循环。
            logger.warning('授权服务的启动联网确认失败，交由心跳循环重试', exc_info = True)

    async def stop(self) -> None:
        """停止心跳循环、取消在飞的手动重试与启动确认，并释放进程锁。"""
        self._stop.set()
        # 两个事件都要 set：心跳循环可能正卡在 wait 上，必须被唤醒才能看到停信号。
        self._schedule_changed.set()
        # 手动重试也要收掉：它可能正卡在一次网络请求上，不取消就会在 stop() 之后继续
        if self._retry_task is not None and not self._retry_task.done():
            self._retry_task.cancel()
        # 启动确认也要收掉：它可能正卡在一次网络请求上，不取消就会在 stop() 之后
        if self._startup_validation_task is not None and not self._startup_validation_task.done():
            self._startup_validation_task.cancel()
        tasks = [
            task
            for task in (self._task, self._retry_task, self._startup_validation_task)
            if task is not None
        ]
        if tasks:
            # return_exceptions：取消会以 CancelledError 收尾，不该据此让 stop() 失败。
            await asyncio.gather(*tasks, return_exceptions=True)
        self._task = None
        self._retry_task = None
        self._startup_validation_task = None
        self._process_lock.release()

    async def activate(self, activation_code: str, email: str | None = None) -> dict[str, Any]:
        """用激活码激活当前安装。
        """
        # 同步查库（可能新建那一行状态）放线程池，别占着事件循环。
        instance_id = await asyncio.to_thread(self._activation_instance_id)
        payload = {
            # 归一化激活码：去掉空白并转大写，容忍用户输入的格式差异。
            'activationCode': activation_code.strip().upper(),
            'instanceId': instance_id,
            'product': 'homeos',
            'clientVersion': self.settings.version,
            # nonce 每次请求随机：服务端据此拒绝重复请求（与租约序号共同防重放）。
            'nonce': secrets.token_urlsafe(24)}
        normalized_email = (email or '').strip().lower()
        if not normalized_email:
            # 本地先拦：省掉一次必然失败的联网请求，同时与后端的 422 语义保持一致。
            self._record_failure('激活', '请输入购买授权时使用的邮箱。')
            raise LicenseClientError('请输入购买授权时使用的邮箱。', status_code=422)
        payload['email'] = normalized_email
        try:
            response = await self._post('/v2/activate', payload)
            # 落库要验签、写多个字段并 commit：一并放线程池。
            result = await asyncio.to_thread(
                self._apply_response,
                response,
                # 只保留前段作为界面提示：截掉后 9 位，界面上不暴露完整激活码。
                activation_code_hint = activation_code.strip()[:-9],
                activation_code = payload['activationCode'],
                email = normalized_email)
        except (LicenseClientError, LicenseCryptoError) as error:
            # 敏感值把用户原始输入与归一化后的码都列上 —— 错误文案里可能命中任意一种写法。
            self._record_failure('激活', error, sensitive_values=(activation_code, activation_code.strip(), payload['activationCode'], email or '', normalized_email))
            raise
        self._record_online_success('激活')
        # 通知心跳循环：立刻按新租约重排等待时间。
        self._schedule_changed.set()
        return result

    async def reactivate(self) -> dict[str, Any]:
        '''用户主动触发的「重新激活」，返回与 ``/license/activate`` 同构的状态。
        '''
        # 同步查库放线程池：授权路径上的每一段同步读写都不留在事件循环里。
        (licensed, encrypted_activation_code, email) = await asyncio.to_thread(self._activation_credentials)
        if not licensed:
            raise LicenseClientError('当前安装尚未激活，请填写激活码完成激活。', status_code=409, code=MANUAL_ACTIVATION_REQUIRED)
        try:
            return await self.heartbeat()
        except LicenseClientError as error:
            if error.is_confirmed_revocation:
                raise
            renewal_error = error
        if not encrypted_activation_code:
            raise LicenseClientError('本机没有保存激活凭证，请重新输入激活码完成激活。', status_code=409, code=MANUAL_ACTIVATION_REQUIRED) from renewal_error
        try:
            activation_code = self.cipher.decrypt(encrypted_activation_code)
        except LicenseCryptoError as error:
            self._record_failure('重新激活', error, sensitive_values=(encrypted_activation_code,))
            raise LicenseClientError('本机保存的激活凭证无法解密，请重新输入激活码完成激活。', status_code=409, code=MANUAL_ACTIVATION_REQUIRED) from error
        try:
            return await self.activate(activation_code, email)
        except LicenseClientError as error:
            self._record_failure('重新激活', error, sensitive_values=(activation_code, email))
            raise



    async def recover(self) -> dict[str, Any]:
        """对外恢复入口：串行化，与心跳共用同一把锁。"""
        async with self._credential_operation():
            return await self._recover_unlocked()



    async def _recover_unlocked(self) -> dict[str, Any]:
        """用恢复令牌重新换取租约（调用方须已持有 _heartbeat_lock）。"""
        (encrypted, instance_id, lease_sequence) = await asyncio.to_thread(self._recovery_credentials)
        if not encrypted:
            # 连恢复令牌都没有：本地已无任何可用凭证，只能让用户重新激活。
            self._record_failure('租约恢复', '没有可用的租约恢复凭证，请重新激活。')
            raise LicenseClientError('没有可用的租约恢复凭证，请重新激活。', code='CREDENTIAL_MISSING')
        # 同心跳：保证异常路径能安全引用它做敏感值抹除。
        recovery_token = ''
        try:
            recovery_token = self.cipher.decrypt(encrypted)
            response = await self._post('/v2/recover', {
                'recoveryToken': recovery_token,
                # 回传 instanceId：恢复请求要证明是本机在续租，而不是别处拿走了令牌。
                'instanceId': instance_id,
                'leaseSequence': lease_sequence,
                'clientVersion': self.settings.version,
                'nonce': secrets.token_urlsafe(24)})
            result = await asyncio.to_thread(self._apply_response, response)
            self._record_online_success('租约恢复')
            return result
        except (LicenseClientError, LicenseCryptoError) as error:
            self._record_failure('租约恢复', error, sensitive_values=(recovery_token, encrypted))
            if isinstance(error, LicenseClientError) and error.is_confirmed_revocation:
                await asyncio.to_thread(self._mark_revoked, str(error))
                raise LicenseClientError(str(error), status_code=error.status_code, code=error.code) from error
            # 同心跳：限流只记冷却、不降级状态（见 ``_heartbeat_unlocked`` 里的说明）。
            if isinstance(error, LicenseClientError) and error.is_rate_limited:
                self._note_rate_limit(error)
                raise LicenseClientError(
                    str(error),
                    status_code=error.status_code,
                    code=error.code,
                    retry_after_seconds=error.retry_after_seconds,
                ) from error
            await asyncio.to_thread(self._mark_failure, error)
            # 错误码必须取 _mark_failure 归一化后的值：直接透传异常自身的 code 会丢掉
            raise LicenseClientError(str(error), status_code=getattr(error, 'status_code', None), code=self._error_code) from error

    def _mark_revoked(self, message: str) -> None:
        """确认吊销后的清理：清空所有本地凭证并把状态置为 REVOKED。
        """
        with self.database.session_factory() as database:
            state = self._state(database)
            # 授权标识清空后 _state 会按「未激活」处理，后续必须重新输入激活码。
            state.license_id = None
            state.lease_id = None
            state.session_id = None
            state.lease_sequence = 0
            # 提示、激活码与邮箱一并清掉：不给自动重激活留任何凭证。
            state.activation_code_hint = None
            state.encrypted_activation_code = None
            state.activation_email = None
            state.signed_lease = None
            state.encrypted_session_token = None
            state.encrypted_recovery_token = None
            state.lease_issued_at = None
            state.lease_expires_at = None
            state.last_heartbeat_at = None
            state.product_edition = None
            state.feature_set = '[]'
            state.max_projects = 0
            state.max_displays = 0
            state.status = 'REVOKED'
            # 解绑场景服务端文案是「实例绑定已停用」；统一成可操作的重激活说明。
            detail = (message or '').strip()
            if '实例绑定已停用' in detail:
                state.last_error = (
                    '设备绑定已解除，本地授权已失效。请使用商店购买邮箱与激活码重新激活。'
                )
            else:
                # 截断到 1000 字符：文案会进数据库并展示在界面上，防止超长内容撑爆字段。
                state.last_error = (detail or '授权已吊销，请重新激活。')[:1000]
            state.deactivated_at = datetime.now(timezone.utc)
            database.commit()
            self._record_status(state.status)
        # 已确认吊销，不再需要启动联网确认。
        self._startup_validation_pending = False
        # 记下终局错误码并清掉重试计划：吊销必须人工处理，后台不该继续排重试。
        self._error_code = 'LICENSE_REVOKED'
        self._next_attempt = None
        # 唤醒心跳循环重算等待（此时无授权，会转入空转等待）。
        self._schedule_changed.set()


    def _clear_startup_validation(self) -> None:
        """联网确认失败但非确认吊销时，把判定权交回离线验签。
        """
        self._startup_validation_pending = False
        with self.database.session_factory() as database:
            state = self._state(database)
            if state.license_id and state.signed_lease:
                expires = ensure_aware(state.lease_expires_at)
                state.status = 'CONNECTION_WARNING' if expires and expires > datetime.now(timezone.utc) else 'LEASE_EXPIRED'
                database.commit()
            self._record_status(state.status)
        self._schedule_changed.set()

    def status(self) -> dict[str, Any]:
        """取当前状态（开一个短事务，读单行状态后组装成字典）。"""
        with self.database.session_factory() as database:
            return self._payload(self._state(database))

    def earliest_entitlement_expiry(self, codes: Collection[str]) -> datetime:
        """取「租约整体到期时间」与指定权益到期时间中最早的一个。
        """
        with self.database.session_factory() as database:
            state = self._state(database)
            payload = self.verifier.verify(state.signed_lease or '', state.instance_id)
        # 起算点取「租约整体到期时间」与「各相关权益到期时间」中最早的那个。
        deadlines = [parse_timestamp(payload['expiresAt'])]
        for item in payload.get('entitlements', []):
            if not isinstance(item, dict):
                continue
            if item.get('code') not in codes:
                continue
            if not item.get('expiresAt'):
                continue
            deadlines.append(parse_timestamp(item['expiresAt']))
        return min(deadlines)

    #: availability() 对外暴露的字段白名单。用白名单而不是黑名单，是为了日后往 status()
    AVAILABILITY_FIELDS = ('status', 'errorCode', 'retryable', 'canRetry', 'retrying', 'retryAttempt', 'nextRetryAt')

    def availability(self) -> dict[str, Any]:
        '''公开的可用性摘要：给恢复页与展示端，不含任何标识、凭证或原始错误。
        '''
        result = self.status()
        output = {key: result[key] for key in self.AVAILABILITY_FIELDS if key in result}
        # displayAllowed 现算而不是从 status 里取：它由签名租约 + 权益集合共同决定，
        output['displayAllowed'] = self.allows('display')
        return output

    def _verified_access(self, state: LicenseState, feature: str | None = None) -> bool:
        """重新校验签名租约，而不是信任可被改写的 SQLite 状态字段。
        """
        if not self.settings.license_required:
            # 关闭授权校验的部署形态直接放行。
            return True
        if self._startup_validation_pending or state.status not in frozenset({'ACTIVE', 'CONNECTION_WARNING', 'RECOVERY_RETRY'}):
            return False
        if not (state.signed_lease and state.license_id and state.lease_id and state.session_id):
            self._record_failure('本地校验', '授权记录缺少签名租约或租约关联信息。')
            return False
        try:
            # 验签是唯一信任来源：库里的 status 可以被改，签名伪造不了。
            payload = self.verifier.verify(state.signed_lease, state.instance_id)
            issued_at = parse_timestamp(payload['issuedAt'])
            expires_at = parse_timestamp(payload['expiresAt'])
        except LicenseCryptoError as error:
            self._record_failure('本地校验', error, sensitive_values=(state.signed_lease,))
            return False
        now = datetime.now(timezone.utc)
        last_verified = ensure_aware(state.last_verified_at)
        # 时钟回拨会让已过期的租约重新「有效」，必须拒绝。
        if last_verified and now + timedelta(seconds=self.settings.license_clock_skew_seconds) < last_verified:
            self._record_failure('本地校验', '检测到系统时间回拨，请校准系统时间后重新验证授权。')
            return False
        if issued_at > now + timedelta(seconds=self.settings.license_clock_skew_seconds):
            self._record_failure('本地校验', '授权服务器时间明显晚于本机时间，请先校准系统时间。')
            return False
        if self._lease_expired(expires_at, now=now):
            self._record_failure('本地校验', '授权租约已到期。')
            return False
        # 逐字段比对库里的关联标识与租约载荷：不一致说明记录被改过或租约被换过。
        if payload['activationCodeId'] != state.license_id:
            self._record_failure('本地校验', '本地授权标识与签名租约不一致。')
            return False
        if payload['leaseId'] != state.lease_id or payload['sessionId'] != state.session_id:
            self._record_failure('本地校验', '本地租约或会话标识与签名租约不一致。')
            return False
        # 序号只要求不比备忘更旧：相等常态、更大回写自愈；更旧说明是被换下来的旧货。
        if not self._lease_sequence_ok(payload['leaseSequence'], state):
            self._record_failure('本地校验', '本地签名租约的序号比记录更旧，授权记录可能被回滚或替换过。')
            return False
        features = payload.get('features')
        if not isinstance(features, list) or not all(isinstance(item, str) for item in features):
            self._record_failure('本地校验', '签名租约中的权益列表无效。')
            return False
        # 走到这里说明本次校验通过：若此前有失败记录，顺带记一条恢复日志。
        self._record_local_success()
        if feature is None:
            return True
        if 'all' in features:
            # 'all' 只展开为基础权益集合；模块级能力仍必须在 entitlements 里明确声明。
            return feature in BASE_FEATURES
        entitlements = payload.get('entitlements')
        if isinstance(entitlements, list):
            # 细粒度权益走 entitlements：逐条检查 code 与过期时间，已过期的条目不参与判定。
            active_features = set()
            for entitlement in entitlements:
                if not isinstance(entitlement, dict) or not isinstance(entitlement.get('code'), str):
                    continue
                expires_at = entitlement.get('expiresAt')
                try:
                    # 权益到期与租约到期同为「服务端签的时间 vs 本机时钟」，共用同一个带容差判据。
                    if expires_at and self._lease_expired(parse_timestamp(expires_at), now=now):
                        continue
                except (LicenseCryptoError, TypeError, ValueError):
                    # 时间格式非法的条目跳过（视为未授权），不让一条脏数据打挂整次判定。
                    continue
                active_features.add(entitlement['code'])
            return feature in active_features
        # 老租约没有 entitlements 段：退回只看 features 列表。
        return feature in features

    def allows(self, feature: str | None = None, *, database=None) -> bool:
        """对外门禁入口：判断当前安装是否有权使用某能力。
        """
        if database is not None:
            # 复用外部会话，但仍要核对实例 ID：换了数据卷后不能沿用旧判定。
            state = database.scalar(select(LicenseState).limit(1))
            # 实例 ID 与本地不一致时直接拒绝：那份租约必然不属于当前安装，无需验签。
            if state is None or state.instance_id != self._instance_id():
                return False
            return self._verified_access(state, feature)
        with self.database.session_factory() as database:
            return self._verified_access(self._state(database), feature)
