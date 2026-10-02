# [补充说明] 授权客户端：激活、心跳续租、租约恢复与能力门禁。
#
# 激活换回签名租约 + 会话/恢复令牌（加密落库）；心跳按单调递增的 leaseSequence
# 续租（不增即拒绝，防重放）；会话 401 时用恢复令牌换新租约，两者都失效才要求
# 重新激活。门禁每次都对签名租约离线验签，不信任库里的 status。
#
# 网络约定：请求体经 LicenseTransportCipher 加密，端点按批次依次尝试并拉黑失败地址。
from __future__ import annotations

import asyncio
import json
import os
import secrets
import threading
import time
from collections.abc import Collection
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone

import httpx
from sqlalchemy import select

from ..config import Settings
from ..database import Database
from ..global_log import GlobalLogStore
from ..models import LicenseState
from .crypto import LeaseVerifier, LicenseCryptoError, LicenseTransportCipher, SecretCipher, parse_timestamp
from .endpoints import LICENSE_RETRY_SECONDS, LicenseEndpointPool
from .hardware import hardware_instance_id
from .process_lock import LicenseProcessLock
from .trust import verify_license_trust_anchors

# 自动重试的退避阶梯（秒）：失败次数越多等得越久，第 5 次之后固定 300 秒。
# 阶梯而不是固定间隔，是因为「刚断网」和「服务端长时间故障」要区分对待：
# 前者几秒内就能恢复，等 5 分钟会让用户以为程序坏了；后者密集重打只会把限流窗口填满。
RETRY_DELAYS = (2, 5, 10, 30, 60, 300)
#: 终态集合：落到这些状态就不再自动重试，必须有人介入（重新激活 / 校准时间 / 检查安装数据）。
#: 判定用「集合」而不是逐处 if，是因为「哪些状态该停」会被多处引用，漏一处就会出现
#: 「明明要人工处理，后台还在无限重试」的静默错配。
TERMINAL_STATES = {
    'INVALID',
    'REVOKED',
    'DEACTIVATED',
    'CLOCK_ROLLBACK',
    'REMOTE_REJECTED',
    'INSTANCE_CHANGED',
    'INSTANCE_MISMATCH',
    'RECOVERY_REQUIRED'}


#: 服务端结构化吊销码；命中即为「确认吊销」，不必再猜文案。
CONFIRMED_REVOCATION_CODES = frozenset({'REVOKED', 'LICENSE_REVOKED'})
#: 服务端只发中文文案、不带结构化 code 时的吊销措辞，作为 code 之外的兜底。
CONFIRMED_REVOCATION_MESSAGES = (
    '实例绑定已停用',
    '客户授权或激活码已停用',
    '客户、激活码或实例绑定已停用',
    '商品授权有效期已结束')
#: 服务端结构化「本机需要重新建立绑定」码：被解绑（后台强制 / 账号中心自助）时下发。
#: 与吊销的区别只在**下一步动作**：吊销要找管理员，被解绑重新激活即可。
#: 两者都让客户端立刻停止自动恢复，但只有前者该被展示成「授权已撤销」。
BINDING_RELEASED_CODES = frozenset({'BINDING_RELEASED'})


class LicenseClientError(RuntimeError):
    # [补充说明] 授权客户端对外抛出的统一错误。
    #
    # 中文文案可直接展示给用户；status_code 与 code 供调用方（路由层 / 前端）
    # 区分「临时失败」「需要人工重新激活」等情形。

    def __init__(
        self,
        message: str,
        *,
        status_code: int | None = None,
        code: str | None = None,
    ) -> None:
        # [补充说明] 参数:
        # code: 业务错误码，前端据此切换界面（如 REVOKED / MANUAL_ACTIVATION_REQUIRED）。
        super().__init__(message)
        self.status_code = status_code
        self.code = code

    @property
    def is_confirmed_revocation(self) -> bool:
        """Return true only when the authorization service confirms revocation.

        A 401/403 can also mean an expired session, a stale recovery token, or
        a transient race while authorization nodes converge.  Those cases must
        preserve the local license so the client can retry recovery.
        """
        # 只有 401/403 才可能是吊销；网络错误、5xx 一律不算。
        if self.status_code not in {401, 403}:
            return False
        # 先看结构化 code：服务端给了准话就不必猜文案。
        # 只认文案会漏判 —— 服务端换了措辞、或只带 code 不带那句话时，
        # 已吊销的安装会被当成「网络故障」无限重试，正是这里要防的事。
        if self.code in CONFIRMED_REVOCATION_CODES:
            return True
        # 兜底兼容只发中文文案的老节点：detail 命中吊销措辞同样算确认。
        detail = str(self)
        return any(message in detail for message in CONFIRMED_REVOCATION_MESSAGES)

    @property
    def requires_rebind(self) -> bool:
        """商店已解除本机绑定：授权本身仍在，重新激活即可继续用。

        与 :attr:`is_confirmed_revocation` 分开，是因为两者的下一步动作不同：
        吊销是「这份授权没了，要找管理员」；被解绑是「这台机器不再绑在它上面，
        重新激活即可」。只按 revoked 布尔值处理，会把被解绑的安装说成「请联系管理员」。
        """
        return self.status_code in {401, 403} and self.code in BINDING_RELEASED_CODES


# 基础权益集合：租约 features 里出现 'all' 时按此展开（'all' 只是服务端的合集简写）。
BASE_FEATURES = {
    'api',
    'assets',
    'editor',
    'display',
    'ha.sync',
    'ha.control',
    'ha.configure',
    'projects.write',
    'runtime.websocket'}

# 用户主动触发的「重新激活」在本地缺凭证（未激活 / 没存激活码 / 解不开）时用的错误码：
# 前端据此把用户引导回激活码输入，而不是笼统提示「授权失败」。
MANUAL_ACTIVATION_REQUIRED = 'LICENSE_ACTIVATION_REQUIRED'
# 429 限流后的默认冷却（秒）：服务端没给 Retry-After 时按此计。
RATE_LIMIT_COOLDOWN_SECONDS = 120.0


def aware(value):
    # SQLite 不保留时区，读出来的 datetime 是 naive 的；统一补成 UTC 再参与比较。
    if value is None or value.tzinfo is not None:
        return value
    return value.replace(tzinfo=timezone.utc)


class LicenseService:
    # [补充说明] 授权服务客户端。
    #
    # start() 读库做离线校验、必要时联网确认后拉起心跳循环，stop() 停循环；状态全部
    # 落在单行 LicenseState 表里，进程重启后只靠「签名租约 + 实例 ID」恢复判定。

    def __init__(self, settings: Settings, database: Database, transport: httpx.AsyncBaseTransport | None, *, endpoint_pool: LicenseEndpointPool | None = None, event_log: GlobalLogStore | None = None) -> None:
        # [补充说明] 参数:
        # transport: httpx 传输层，测试可注入 MockTransport。
        # event_log: 全局日志存储，授权状态变化写入「授权」分类事件。
        self.settings = settings
        self.database = database
        self.event_log = event_log
        # 启动期先钉死信任锚：指纹错了立刻失败并给出密钥准备指引，不拖到首次激活才暴露。
        verify_license_trust_anchors(settings)
        # 事件去重状态可能被心跳协程与请求线程同时访问，用可重入锁保护。
        self._event_lock = threading.RLock()
        # 记住上一次对外可见的状态：只在状态真正变化时写事件日志，避免刷屏。
        self._observed_status = None
        # 按操作名累计失败次数，用于「恢复成功」时汇报此前失败了多少次。
        self._event_failures = {}
        # 验签器构造失败（配置里没有可用公钥）会在启动期直接抛错，属于快速失败。
        self.verifier = LeaseVerifier(trusted_keys=settings.license_trusted_public_keys, legacy_key_id=settings.license_legacy_key_id)
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
        # 授权凭证的进程锁：既保证「同一 data/ 只跑一个服务」，也保证本进程内同一时刻
        # 只有一处能写凭证 —— 手动重试与心跳并发续租会写出两份并行租约。
        self._process_lock = LicenseProcessLock(settings.data_dir)
        # 手动重试任务句柄：多个页面同时点「重试」共用同一个任务，不排队做多轮令牌轮换。
        self._retry_task = None
        # 连续失败次数：决定退避阶梯 RETRY_DELAYS 取到第几级。
        self._failures = 0
        # 下一次计划重试的单调时刻；None 表示不排重试（刚成功，或已进入终态）。
        self._next_attempt = None
        # 手动重试的节流截止（单调时钟）：连点两次不该真的发起两轮令牌轮换。
        self._manual_retry_after = 0.0
        # 最近一次失败的业务错误码：供 availability() 与前端区分「等一会儿」与「要人工介入」。
        self._error_code = None
        # 成功代数：每次成功落库自增。手动重试据此判断「本轮开始后已有人成功」，
        # 从而跳过一轮必然拿到旧租约的重复请求。
        self._success_generation = 0
        # 最近一次「联网确认绑定」的单调时刻：打开编辑器等入口会高频触发，必须节流。
        self._last_binding_confirm_at = 0.0
        # 429 限流后的冷却截止（单调时刻）：冷却期内 confirm_binding 直接返回，不再打服务端。
        self._rate_limited_until = 0.0

    def _rate_limit_remaining(self) -> float:
        # [补充说明] 限流冷却还剩多少秒（单调时钟）；不在冷却里返回 0。
        return max(0.0, self._rate_limited_until - time.monotonic())

    #: 打开编辑器等入口强制联网确认，状态轮询走节流。
    BINDING_CONFIRM_THROTTLE_SECONDS = 60.0

    def _binding_needs_confirm(self) -> bool:
        # [补充说明] 读本地凭证判断这次调用是否真需要联网（同步，调用方放进工作线程）。
        #
        # 只有「已激活 + 有签名租约 + 处于可联网确认的状态」才值得打一次服务端：
        # 未激活本就无绑定可确认，终态（吊销 / 无效）联网也只会拿到同样的拒绝。
        with self.database.session_factory() as database:
            state = self._state(database)
            return bool(
                state.license_id
                and state.signed_lease
                and state.status
                in frozenset({'ACTIVE', 'CONNECTION_WARNING', 'STARTUP_VALIDATION_REQUIRED', 'LEASE_EXPIRED'}))

    async def confirm_binding(self, *, force: bool = False) -> None:
        # [补充说明] 联网确认设备绑定仍有效；商店解绑 / 停用后清空本地授权。
        #
        # 与 heartbeat 的差别在于「节流」：本方法由用户操作（打开编辑器等）触发，
        # 同一秒可能被多个入口调用，必须先用时间窗口把它们合并成一次联网。
        if not self.settings.license_required or not self._endpoint_pool.configured:
            return
        if self._rate_limit_remaining() > 0:
            # 刚被限流：冷却期内不再打服务端，否则只会换来又一个 429。
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
                self._log_event('warning', f'''联网确认绑定失败（已吊销）：{error}''')
            # 网络 / 临时故障 / 限流：保留离线租约，等心跳循环重试。

    def _log_event(self, level: str, message: str) -> None:
        # [补充说明] 写一条授权事件日志。
        #
        # 日志失败绝不能影响授权主流程（例如磁盘写满），因此整体兜底吞掉异常。
        if self.event_log is None:
            return
        try:
            # 分类固定为「授权」，前端事件列表按此过滤。
            self.event_log.append(level, '授权服务', '授权', message)
        except Exception:
            # 有意静默：日志是旁路，不能反向影响授权判定。
            pass

    def _record_status(self, status: str, reason: str | None = None) -> None:
        # [补充说明] 记录对外可见的授权状态；只在状态发生变化时写一条中文事件。
        # 状态码到中文文案的映射：事件日志与最终用户看到的都是这份文案。
        labels = {
            'UNACTIVATED': '未激活',
            'ACTIVE': '正常',
            'CONNECTION_WARNING': '连接异常',
            'LEASE_EXPIRED': '租约已到期',
            'REVOKED': '已吊销',
            'INVALID': '校验无效',
            'INSTANCE_CHANGED': '安装标识已变化',
            'INSTANCE_MISMATCH': '安装标识不匹配',
            'CLOCK_ROLLBACK': '系统时间异常',
            'DEACTIVATED': '已停用',
            'RECOVERY_RETRY': '授权会话重试中',
            'RECOVERY_REQUIRED': '授权会话需人工恢复',
            'REMOTE_REJECTED': '授权后台明确拒绝',
            'STARTUP_VALIDATION_REQUIRED': '等待启动联网验证'}
        with self._event_lock:
            previous = self._observed_status
            # 状态未变就不重复记日志：心跳每次都会调用这里，否则日志会被刷爆。
            if previous == status:
                return
            self._observed_status = status
            message = f'''授权状态：{labels.get(status, status)}'''
            if previous is not None:
                message = f'''授权状态变化：{labels.get(previous, previous)} → {labels.get(status, status)}'''
            if reason:
                message += f'''；原因：{reason}'''
            # 级别：正常 success，停用/未激活 info，其余 warning；不可恢复错误再升 error。
            level = 'success' if status == 'ACTIVE' else 'info' if status in {'DEACTIVATED', 'UNACTIVATED'} else 'warning'
            if status in {'INVALID', 'REVOKED', 'CLOCK_ROLLBACK', 'INSTANCE_MISMATCH', 'RECOVERY_REQUIRED', 'REMOTE_REJECTED'}:
                level = 'error'
            self._log_event(level, message)

    def _record_failure(self, operation: str, error: Exception | str, *, sensitive_values: tuple[str, ...] = ()) -> None:
        # [补充说明] 记录一次失败，并按「同因去重」策略决定是否写日志。
        reason = str(error)
        # 按长度降序替换：短值可能是长值的子串，先长后短才不会把长值截断成残留片段。
        for value in sorted(set(sensitive_values), key=len, reverse=True):
            if not value:
                continue
            reason = reason.replace(value, '***')
        with self._event_lock:
            # 用单调时钟计去重窗口：系统时间回拨也不会让窗口失灵。
            now = time.monotonic()
            failure = self._event_failures.setdefault(operation, {
                'count': 0,
                'logged_at': None,
                'reason': None})
            # 累计次数即使不写日志也要加，供恢复成功时汇报。
            failure['count'] += 1
            # 同一原因 300 秒内只记一次：离线部署会持续失败，逐次记录会淹没日志。
            if failure['reason'] == reason and failure['logged_at'] is not None and now - failure['logged_at'] < 300:
                return
            failure.update(logged_at=now, reason=reason)
            # 异常可能是字符串，用 getattr 兼容没有 status_code 的情况。
            status_code = getattr(error, 'status_code', None)
            suffix = f'''，HTTP {status_code}''' if status_code else ''
            # 激活与本地校验失败直接影响可用性，定为 error；心跳/恢复失败只算 warning。
            self._log_event('error' if operation in {'激活', '本地校验'} else 'warning', f'''授权{operation}失败（累计 {failure['count']} 次{suffix}）：{reason}''')

    def _record_online_success(self, operation: str) -> None:
        # [补充说明] 联网成功：汇报此前累计的心跳/恢复失败次数，并清掉对应的失败计数。
        # 联网通了限流冷却即失效：留着它会让 confirm_binding 白等一整个窗口。
        self._rate_limited_until = 0.0
        with self._event_lock:
            # 只汇报并清理这两类：本地校验与激活各自有独立的成功路径。
            failures = [(name, self._event_failures.pop(name)) for name in ('心跳', '租约恢复') if name in self._event_failures]
            if failures:
                counts = '、'.join(f'''{name}失败 {failure['count']} 次''' for name, failure in failures)
                self._log_event('success', f'''授权连接已恢复，{operation}成功；此前{counts}。''')
            if operation == '激活':
                # 激活成功额外清掉激活失败计数，并单独记一条成功日志。
                self._event_failures.pop('激活', None)
                self._log_event('success', '授权激活成功。')

    def _record_local_success(self) -> None:
        # [补充说明] 本地校验恢复成功：清计数并写一条恢复日志。
        with self._event_lock:
            failure = self._event_failures.pop('本地校验', None)
            if failure:
                self._log_event('success', f'''授权本地校验已恢复；此前校验失败 {failure['count']} 次。''')

    @staticmethod
    def _valid_instance_id(value: str) -> bool:
        # [补充说明] 校验实例 ID 的字符集与长度。
        #
        # 硬件指纹为 SHA-256 十六进制（64 字符）；下限 16 挡住占位/手填短串，
        # 上限 64 与服务端字段对齐。
        # 允许 ':'，兼容 fallback-machine:xxx 派生格式的诊断片段（正式 ID 仍是纯 hex）。
        return 16 <= len(value) <= 64 and all(character.isalnum() or character in '-_.:' for character in value)

    def _instance_id(self) -> str:
        # [补充说明] 取出本机硬件指纹派生的安装实例 ID，并持久化到 data/instance-id。
        #
        # 硬件指纹是**唯一真相源**：machine-id / 主板 / 产品 UUID 任一变化都会算出不同的
        # instance_id，从而在 ``_state`` 里被判为 ``INSTANCE_CHANGED``，实现「一机一码」。
        # data/instance-id 只是缓存，绝不作为身份来源 —— 否则整盘拷贝 data/ 就能把授权
        # 带到另一台机器上。
        # 读不到真实硬件时按配置走 ``data/hardware-fallback-id`` 兜底（见 hardware.py）。
        # 缓存命中直接返回，避免每次门禁判定都重读磁盘。
        if self._cached_instance_id:
            return self._cached_instance_id
        path = self.settings.instance_id_path
        # 目录 0700、文件 0600：实例 ID 参与授权绑定，不应对其它账号可读。
        path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        try:
            saved = path.read_text(encoding='utf-8').strip()
        except OSError:
            saved = ''
        value = hardware_instance_id(
            machine_override=self.settings.hardware_machine_id_override,
            board_override=self.settings.hardware_board_id_override,
            required=True,
            fallback_path=self.settings.hardware_fallback_id_path,
        )
        if not self._valid_instance_id(value):
            raise RuntimeError('硬件指纹派生的实例标识无效，无法建立设备绑定。')
        # 只在内容真的变了才写盘，避免每次启动都做无谓的写入与 rename。
        if saved != value:
            temporary = path.with_name(f'''.{path.name}.tmp''')
            descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
            with os.fdopen(descriptor, 'w', encoding='utf-8') as output:
                output.write(value + '\n')
            # 同目录原子替换：写一半崩溃也不会留下半截 ID 被当成有效值。
            os.replace(temporary, path)
        # 兜底修正权限：文件可能是别的工具创建的，权限未必正确。
        os.chmod(path, 0o600)
        self._cached_instance_id = value
        return value

    def _activation_credentials(self) -> tuple[bool, str | None, str]:
        # [补充说明] 取自动重新激活要用的本地凭证（同步，供 ``reactivate`` 放线程池）。
        #
        # 返回 (是否已激活, 加密后的完整激活码, 绑定邮箱)；激活码为空即代表本机
        # 只有截断后的提示码，用户必须重新输入才能激活。
        with self.database.session_factory() as database:
            state = self._state(database)
            return (bool(state.license_id), state.encrypted_activation_code, state.activation_email or '')

    @asynccontextmanager
    async def _credential_operation(self):
        # [补充说明] 凭证读写的临界区：串行化续租，并保证进程内只有一个凭证写入者。
        #
        # 两层锁各有分工，缺一不可：
        # - ``_heartbeat_lock`` 管**本进程内**的并发（手动重试 vs 心跳 vs 恢复）；
        # - 进程锁管**跨进程**（同机被误启动两份服务）。进程锁通常在 start() 就已长期持有，
        # 此时这里只是复用；若本实例不是长期持有者，就临时加锁、用完即放。
        async with self._heartbeat_lock:
            # 只有「当前没持锁」时才临时加：长期持有者已经锁住了，重复 acquire 是空操作。
            temporary = self._process_lock.fd is None
            if temporary:
                self._process_lock.acquire()
            try:
                yield
            finally:
                # 只释放自己临时取得的那一次：把 start() 拿到的长期锁放掉会让
                # 单实例保护在运行中途失效。
                if temporary:
                    self._process_lock.release()

    def _state(self, database) -> LicenseState:
        # [补充说明] 取（或初始化）单行授权状态，并处理安装标识变化。
        #
        # 单例表：全库只有一行 LicenseState，因此直接 limit(1) 取。
        # 实例 ID 一律由本机硬件指纹现算，绝不沿用库里的旧值 —— 否则把 data/ 拷到另一台
        # 机器就能带着授权跑，绑定形同虚设。库里的值只用来和现算值比对。
        state = database.scalar(select(LicenseState).limit(1))
        instance_id = self._instance_id()
        if state is None:
            # 首次运行：建一行空状态。
            state = LicenseState(id=1, instance_id=instance_id)
            database.add(state)
            database.commit()
            database.refresh(state)
        elif state.instance_id != instance_id:
            # 硬件指纹变化说明授权绑定已失效：租约 / 令牌都是原机的，必须整体作废。
            state.instance_id = instance_id
            state.lease_id = None
            state.session_id = None
            state.lease_sequence = 0
            state.signed_lease = None
            state.encrypted_session_token = None
            state.encrypted_recovery_token = None
            state.lease_issued_at = None
            state.lease_expires_at = None
            # 已激活却指纹变了 → 需要重新激活；本来就未激活 → 只是一个新安装。
            # 这里**不能**直接说「去商店后台解绑」：指纹变化可能只是重装 / 迁数据目录 /
            # 指纹算法升级，本机根本不知道商店那边有没有绑定。真正的绑定冲突由服务端在
            # 激活时回答（409），到那时才落 INSTANCE_MISMATCH 并给出解绑指引。
            state.status = 'INSTANCE_CHANGED' if state.license_id else 'UNACTIVATED'
            state.last_error = (
                '本机安装标识已变化，需要重新激活授权。'
                if state.license_id
                else None
            )
            # 覆盖上一次失败留下的错误码：否则前端可能拿着 NETWORK_UNAVAILABLE 之类的
            # 陈旧码去解释一个「安装标识变化」状态。
            self._error_code = 'INSTANCE_CHANGED' if state.license_id else None
            database.commit()
            self._record_status(state.status, state.last_error)
        return state

    async def start(self) -> None:
        # [补充说明] 启动授权服务：抢数据目录进程锁、离线校验本地状态，然后拉起心跳循环。
        #
        # 副作用: 可能修改数据库状态字段；会长期持有数据目录的进程锁；会创建后台心跳任务。
        # 异常:
        # RuntimeError: 同一数据目录已有实例在运行（进程锁抢不到）。
        # 已在运行就直接返回：重复 start() 会拉起第二个心跳循环，两条循环并发续租。
        if self._task is not None and not self._task.done():
            return
        # 抢进程锁必须在校验之前：抢不到说明同一份 data/ 已有一个实例在跑，此时两条心跳会
        # 各自续租出并行租约，先写的那份被判成重放而作废。让它明确失败，而不是进入「半个实例」状态。
        self._process_lock.acquire()
        with self.database.session_factory() as database:
            state = self._state(database)
            self._validate_saved_state(state, database)
            # 三者同时成立才要求联网确认：配置要求授权、已有激活记录、本地有签名租约。纯离线部署不受影响。
            # 再排除终态：已吊销 / 校验无效 / 时间异常都不是「联网就能确认」的事，
            # 把它们算成待确认会让每次启动都白等一轮联网，还会盖掉本该显示的失败原因。
            self._startup_validation_pending = bool(
                self.settings.license_required
                and state.license_id
                and state.signed_lease
                and state.status not in TERMINAL_STATES
            )
            self._record_status('STARTUP_VALIDATION_REQUIRED' if self._startup_validation_pending else state.status)
        # 有待确认就先排一次「立刻重试」：心跳循环据此不必等一个完整间隔才开始恢复。
        if self._startup_validation_pending:
            self._next_attempt = time.monotonic()
        if self._endpoint_pool.configured:
            # 复位停信号：先 stop() 再 start() 时要能重新工作。
            self._stop.clear()
            # 具名任务便于在调试器与日志里辨认。
            self._task = asyncio.create_task(self._heartbeat_loop(), name='license-heartbeat')

    async def stop(self) -> None:
        # [补充说明] 停止心跳循环、取消在飞的任务，并释放进程锁。
        self._stop.set()
        # 两个事件都要 set：心跳循环可能正卡在 wait 上，必须被唤醒才能看到停信号。
        self._schedule_changed.set()
        # 心跳与手动重试一并收掉：它们可能正卡在 wait 或一次网络请求上，
        # 不取消就会在 stop() 之后继续持有凭证锁。
        tasks = [task for task in (self._task, self._retry_task) if task is not None]
        for task in tasks:
            task.cancel()
        if tasks:
            # return_exceptions：取消会以 CancelledError 收尾，不该据此让 stop() 失败。
            await asyncio.gather(*tasks, return_exceptions=True)
        # 置空心跳句柄，避免重复 stop() 时 await 一个已结束的任务。
        self._task = None
        # 最后才释放进程锁：要等任务真的停下，否则新实例可能在旧实例还在写凭证时启动。
        self._process_lock.release()

    def _validate_saved_state(self, state: LicenseState, database) -> None:
        # [补充说明] 启动时的离线校验：只信签名租约，不信库里的 status。
        #
        # 校验顺序为验签 → 序号不比备忘更旧 → 到期时间 → 时钟回拨，
        # 任一步失败都写回明确状态与中文原因，供前端展示。
        # 没有租约，或已处于终态（含停用/吊销/被拒/时钟回拨等，外加未激活）时无需校验。
        # 用 TERMINAL_STATES 而不是只列 DEACTIVATED/UNACTIVATED：任何被判定为终局的状态都不该
        # 在这一步被重新改写（下面的分支会把状态覆写成 ACTIVE / LEASE_EXPIRED）。
        if not state.signed_lease or state.status in TERMINAL_STATES | {'UNACTIVATED'}:
            return
        try:
            payload = self.verifier.verify(state.signed_lease, state.instance_id)
            # 序号比备忘更旧：库里的记录被改过，或这份租约是被换下来的旧货（重放）。
            if payload['leaseSequence'] != state.lease_sequence:
                raise LicenseCryptoError('本地租约序号与签名租约不一致。')
            # 身份三件套：激活码、租约、会话任一与库里记录不符，都说明这份租约不是当前这份授权。
            if (
                payload['activationCodeId'] != state.license_id
                or payload['leaseId'] != state.lease_id
                or payload['sessionId'] != state.session_id
            ):
                raise LicenseCryptoError('本地授权会话与签名租约不一致。')
            expires = parse_timestamp(payload['expiresAt'])
            now = datetime.now(timezone.utc)
            last_verified = aware(state.last_verified_at)
            # 时钟回拨检测：本机时间比上次校验时间还早，会让已过期的租约「复活」，必须拦下；
            # issuedAt 明显晚于本机同样是「本机时钟不可信」，此时按本机时间判到期只会得出错误结论。
            if (last_verified and now + timedelta(seconds=self.settings.license_clock_skew_seconds) < last_verified) or parse_timestamp(payload['issuedAt']) > now + timedelta(seconds=self.settings.license_clock_skew_seconds):
                state.status = 'CLOCK_ROLLBACK'
                state.last_error = '检测到系统时间回拨，请校准系统时间后重新验证授权。'
            else:
                # RECOVERY_RETRY 是「会话在重试、本地租约仍有效」的中间态，心跳还要靠它接着重试，
                # 在这里被覆写成 ACTIVE / LEASE_EXPIRED 会提前终止重试路径。
                if state.status != 'RECOVERY_RETRY':
                    # 严格按租约到期时间判 expires > now：启动校验不加时钟容差，避免把已到期租约放行。
                    state.status = 'ACTIVE' if expires > now else 'LEASE_EXPIRED'
                state.last_verified_at = now
                state.last_error = None
        except LicenseCryptoError as error:
            # 实例不匹配单独归类：本机安装标识变了，需要重新激活；其余归「校验无效」。
            # 这里同样不引导去商店解绑 —— 是否真为绑定冲突由激活时的 409 决定。
            if '当前实例' in str(error):
                state.status = 'INSTANCE_CHANGED'
                state.last_error = '本机安装标识已变化，需要重新激活授权。'
            else:
                state.status = 'INVALID'
                state.last_error = str(error)
            # 把整条租约当敏感值抹掉：错误文案里可能带出载荷片段。
            self._record_failure('本地校验', error, sensitive_values=(state.signed_lease,))
        database.commit()
        self._record_status(state.status)

    async def _post(self, path: str, payload: dict) -> dict:
        # [补充说明] 向授权服务发送加密请求，按候选列表依次重试。
        #
        # 未配置端点或全部候选失败抛 ``LicenseClientError``；4xx 业务拒绝直接抛出，不重试。
        candidates = self._endpoint_pool.candidates()
        # 未配置是配置问题（重试无用），全部不可用是暂时问题，两者给出不同文案。
        if not self._endpoint_pool.configured:
            raise LicenseClientError('尚未配置授权服务器地址。')
        if not candidates:
            raise LicenseClientError('授权服务器暂时不可用，请稍后重试。')
        # 记住最后一次失败原因：全部候选都失败时抛出它，保留最有信息量的文案与状态码。
        last_failure = None
        async with httpx.AsyncClient(transport=self._transport, timeout=self.settings.license_request_timeout_seconds) as client:
            for endpoint in candidates:
                # 每个候选都重新加密：临时密钥与 AAD 里的 keyId / 路径绑定，密文不能跨端点复用。
                request_payload, response_key = self.transport_cipher.encrypt_request(payload, path)
                try:
                    response = await client.post(f'''{endpoint.base_url}{path}''', json=request_payload)
                    if response.status_code >= 500:
                        # 5xx 视为服务端暂时故障：换候选的同时拉黑，避免每次都先撞同一台坏机器。
                        self._endpoint_pool.mark_failed(endpoint.base_url)
                        last_failure = LicenseClientError(
                            self._response_error_body(response)[0],
                            status_code=response.status_code,
                            code='LICENSE_SERVER_UNAVAILABLE')
                        continue
                    if response.status_code >= 400:
                        # 4xx 是业务拒绝（激活码错误、确认吊销等），换地址也不会变，直接抛出。
                        detail, response_code = self._response_error_body(response)
                        raise LicenseClientError(
                            detail,
                            status_code=response.status_code,
                            # 429 是限流：单独给码，调用方据此进入冷却而不是当作普通业务拒绝。
                            # 其余透传服务端的结构化 code（如 BINDING_RELEASED），调用方据此
                            # 区分「被解绑，重新激活即可」与「被吊销，要找管理员」。
                            code='LICENSE_RATE_LIMITED' if response.status_code == 429 else response_code)
                    # 204 / 空响应是合法的成功返回（个别接口无 body）。
                    if not response.content:
                        return {}
                    parsed = response.json()
                    if not isinstance(parsed, dict):
                        # 顶层不是字典就无法当作信封处理，同样换候选。
                        self._endpoint_pool.mark_failed(endpoint.base_url)
                        last_failure = LicenseClientError('授权服务器响应格式无效。')
                        continue
                    parsed = self.transport_cipher.decrypt_response(parsed, path, response_key)
                    return parsed
                except httpx.HTTPError as error:
                    # 连接/超时类错误：拉黑该地址并换下一个候选，网络问题值得换地址再试。
                    self._endpoint_pool.mark_failed(endpoint.base_url)
                    last_failure = LicenseClientError(
                        '无法连接授权服务器。',
                        # 超时与「连不上」分开报码：前者多为网络抖动，后者多为地址不可达。
                        code='NETWORK_TIMEOUT' if isinstance(error, httpx.TimeoutException) else 'NETWORK_UNAVAILABLE')
                except ValueError:
                    # 响应不是 JSON：可能被中断或被中间设备改写，换下一个候选。
                    self._endpoint_pool.mark_failed(endpoint.base_url)
                    last_failure = LicenseClientError('授权服务器响应格式无效。')
                except LicenseCryptoError as error:
                    # 解密失败可能是该端点密钥不同：拉黑换一个，而不是判成「服务端拒绝」（会给用户误导）。
                    self._endpoint_pool.mark_failed(endpoint.base_url)
                    last_failure = LicenseClientError(str(error))
        # 所有候选都试过：抛出最后一次失败，保留 status_code 等信息。
        raise last_failure or LicenseClientError('无法连接授权服务器。')

    @staticmethod
    def _response_error_body(response: httpx.Response) -> tuple[str, str | None]:
        # [补充说明] 从错误响应里取可展示的 detail 与结构化 code；解析不了就回落通用文案。
        #
        # code 是服务端的「准话」：``BINDING_RELEASED`` 表示这台机器已不再绑在该授权上
        # （重新激活即可），``REVOKED`` 表示授权本身被停用 / 到期。没有 code 时返回 None，
        # 由调用方按状态码兜底 —— 只认中文文案会在服务端换措辞时静默失效。
        try:
            # 非 JSON 或顶层不是字典时回落通用文案，绝不把原始 body 透传给用户。
            parsed = response.json()
        except ValueError:
            return '授权服务器拒绝请求。', None
        if not isinstance(parsed, dict):
            return '授权服务器拒绝请求。', None
        detail = parsed.get('detail', '授权服务器拒绝请求。')
        code = parsed.get('code')
        return str(detail), code if isinstance(code, str) and code else None

    def _apply_response(self, response: dict, *, activation_code_hint: str | None = None, activation_code: str | None = None, email: str | None = None) -> dict:
        # [补充说明] 把一次成功的授权响应落库（验签通过后才算成功）。
        #
        # ``activation_code_hint`` 截掉后 9 位作界面提示；``activation_code`` 是完整码，
        # 加密落库供「重新激活」自动重放；``email`` 是绑定邮箱，重新激活时要一并回传。
        # 缺字段时留空串，交给 verifier 统一按「格式无效」拒绝。
        signed_lease = response.get('signedLease', '')
        with self.database.session_factory() as database:
            state = self._state(database)
            try:
                payload = self.verifier.verify(signed_lease, state.instance_id)
            except LicenseCryptoError as error:
                state.status = 'INSTANCE_MISMATCH' if '当前实例' in str(error) else 'INVALID'
                state.last_error = str(error)
                database.commit()
                self._record_status(state.status)
                self._record_failure('本地校验', error, sensitive_values=(signed_lease,))
                raise LicenseClientError(str(error)) from error
            expires_at = parse_timestamp(payload['expiresAt'])
            issued_at = parse_timestamp(payload['issuedAt'])
            lease_sequence = payload['leaseSequence']
            now = datetime.now(timezone.utc)
            if issued_at > now + timedelta(seconds=self.settings.license_clock_skew_seconds):
                # 签发时间明显超前本机 → 时钟偏慢或服务端异常，到期判断不可信，先要求校准时间。
                state.status = 'CLOCK_ROLLBACK'
                state.last_error = '授权服务器时间明显晚于本机时间，请先校准系统时间。'
                database.commit()
                self._record_status(state.status, state.last_error)
                raise LicenseClientError(state.last_error)
            if expires_at <= now:
                # 服务端返回已过期租约：不写入可用状态，避免刚「激活成功」就拿到失效凭证。
                # 严格比较（不加时钟容差）：服务端签的到期时间已到就是不可用。
                # 状态写 INVALID 而不是 LEASE_EXPIRED —— 这份租约从未生效过，不是「用着用着到期」。
                state.status = 'INVALID'
                state.last_error = '授权服务器返回了已到期租约。'
                database.commit()
                self._record_status(state.status, state.last_error)
                raise LicenseClientError(state.last_error)
            if payload['activationCodeId'] == state.license_id and lease_sequence <= state.lease_sequence and state.signed_lease != signed_lease:
                # 序号须递增防重放；只有内容完全相同的重试响应才允许相等。
                state.status = 'INVALID'
                state.last_error = '授权服务器返回了未递增的租约序号。'
                database.commit()
                self._record_status(state.status, state.last_error)
                raise LicenseClientError(state.last_error)
            state.license_id = payload['activationCodeId']
            state.lease_id = payload['leaseId']
            state.session_id = payload['sessionId']
            state.lease_sequence = lease_sequence
            state.signed_lease = signed_lease
            state.status = 'ACTIVE'
            state.lease_issued_at = parse_timestamp(payload['issuedAt'])
            state.lease_expires_at = expires_at
            state.last_heartbeat_at = now
            state.last_verified_at = now
            # 目前只有完整版一种授权形态，字段保留给后续分层版本。
            state.product_edition = 'full'
            features = payload.get('features')
            # 权益必须是字符串数组，类型不对说明响应被篡改，整体置 INVALID 而不放行看不懂的权益。
            if not isinstance(features, list) or not all(isinstance(item, str) for item in features):
                state.status = 'INVALID'
                state.last_error = '授权服务器返回的权益列表无效。'
                database.commit()
                self._record_status(state.status, state.last_error)
                raise LicenseClientError(state.last_error)
            # 紧凑序列化存库：内容由验签通过的租约决定，不需要可读性。
            state.feature_set = json.dumps(features)
            # 0 表示不限；配额目前由租约权益控制，不再单独下发数字。
            state.max_projects = 0
            state.max_displays = 0
            # 下限 30 秒：服务端若给出过小的值，防止把客户端变成心跳风暴。
            state.heartbeat_interval_seconds = max(30, int(response.get('heartbeatIn', 300)))
            state.last_error = None
            # 重新激活成功后清掉停用时间戳。
            state.deactivated_at = None
            # 首次激活时间只写一次：重新激活不覆盖，便于统计设备生命周期。
            if state.activated_at is None:
                state.activated_at = datetime.now(timezone.utc)
            if activation_code_hint:
                state.activation_code_hint = activation_code_hint
            if activation_code:
                # 完整激活码加密落库：它是用户下次点「重新激活」时唯一的本地凭证。
                state.encrypted_activation_code = self.cipher.encrypt(activation_code)
            if email:
                # 邮箱随激活一起记住：重新激活要回传同一个邮箱做绑定校验。
                state.activation_email = email
            if response.get('sessionToken'):
                # 会话令牌用于心跳续租。
                state.encrypted_session_token = self.cipher.encrypt(response['sessionToken'])
            if response.get('recoveryToken'):
                # 恢复令牌用于会话失效后重新换租约。
                state.encrypted_recovery_token = self.cipher.encrypt(response['recoveryToken'])
            database.commit()
            # 联网成功即视为通过启动确认，门禁恢复常规判定。
            self._startup_validation_pending = False
            # 成功即把上一轮失败留下的重试计划全部归零：失败计数、错误码与计划时刻
            # 描述的都只是「上一次失败」，留着会让下一次偶发失败从很高的退避档开始。
            self._failures = 0
            self._next_attempt = None
            self._error_code = None
            # 成功代数自增：正在飞行的手动重试据此得知「本轮已经有成功结果，不必再来一轮」。
            self._success_generation += 1
            # 通知心跳循环：计划已变，立刻重排等待。
            self._schedule_changed.set()
            return self._payload(state)

    async def activate(self, activation_code: str, email: str | None = None) -> dict:
        # [补充说明] 用激活码激活当前安装（串行化，与心跳共用凭证临界区）。
        async with self._credential_operation():
            return await self._activate_unlocked(activation_code, email)

    async def _activate_unlocked(self, activation_code: str, email: str | None = None) -> dict:
        # [补充说明] 激活的实现（在凭证临界区里执行）。
        #
        # 邮箱缺失（422）、激活码被拒或租约校验失败抛 ``LicenseClientError``。
        # 取实例 ID：可能顺带新建那一行状态，读法与原实现一致。
        with self.database.session_factory() as database:
            state = self._state(database)
            instance_id = state.instance_id
        payload = {
            # 归一化激活码：去掉空白并转大写，容忍用户输入的格式差异。
            'activationCode': activation_code.strip().upper(),
            'instanceId': instance_id,
            'product': 'homeos',
            'clientVersion': self.settings.version,
            # nonce 每次请求随机：服务端据此拒绝重复请求（与租约序号共同防重放）。
            'nonce': secrets.token_urlsafe(24)}
        # 邮箱同样归一化：匹配时大小写不敏感，避免用户输入差异导致失败。
        normalized_email = (email or '').strip().lower()
        if not normalized_email:
            # 本地先拦：省掉一次必然失败的联网请求，同时与后端的 422 语义保持一致。
            self._record_failure('激活', '请输入购买授权时使用的邮箱。')
            raise LicenseClientError('请输入购买授权时使用的邮箱。', status_code=422)
        payload['email'] = normalized_email
        try:
            response = await self._post('/v2/activate', payload)
            # 落库要验签、写多个字段并 commit（同步方法，不走线程池）。
            result = self._apply_response(
                response,
                # 只保留前段作为界面提示：截掉后 9 位，界面上不暴露完整激活码。
                activation_code_hint=activation_code.strip()[:-9],
                # 完整码与邮箱一并落库：前者支撑自动「重新激活」，后者是绑定校验的一部分。
                activation_code=payload['activationCode'],
                email=normalized_email)
        except (LicenseClientError, LicenseCryptoError) as error:
            # 敏感值把用户原始输入与归一化后的码都列上 —— 错误文案里可能命中任意一种写法。
            self._record_failure('激活', error, sensitive_values=(activation_code, activation_code.strip(), payload['activationCode'], email or '', normalized_email))
            # 商店后台确认的绑定冲突（409「该授权已绑定其他设备」）：这是**唯一**需要
            # 用户去商店解绑的路径，落成 INSTANCE_MISMATCH，前端才会给出解绑步骤。
            if isinstance(error, LicenseClientError) and error.status_code == 409:
                self._mark_instance_conflict(str(error))
            raise
        self._record_online_success('激活')
        # 通知心跳循环：立刻按新租约重排等待时间。
        self._schedule_changed.set()
        return result

    async def reactivate(self) -> dict:
        # [补充说明] 用户主动触发的「重新激活」，返回与 ``/license/activate`` 同构的状态。
        #
        # 三条降级路径按「先省一次联网、再省一次用户输入」排：
        # 1. 先尝试普通续租 —— 商店解绑后重新绑定、租约被换掉等情况靠它自愈，用户无感；
        # 2. 续租不行且本地存着完整激活码 → 用它自动重放一次激活；
        # 3. 本地没有激活码（或解不开）→ 只能请用户重新输入，回 MANUAL_ACTIVATION_REQUIRED。
        # 确认吊销直接上抛：那是人工介入才能解决的状态，自动重放激活也会被同样拒绝。
        (licensed, encrypted_activation_code, email) = await asyncio.to_thread(self._activation_credentials)
        if not licensed:
            raise LicenseClientError(
                '当前安装尚未激活，请填写激活码完成激活。',
                status_code=409,
                code=MANUAL_ACTIVATION_REQUIRED)
        try:
            return await self.heartbeat()
        except LicenseClientError as error:
            # 被商店解绑不是吊销：本地存着激活码就往下走自动重放激活，这正是用户点
            # 「重新激活」的意图（重放成功即重新绑定本机）。吊销仍然直接上抛。
            if error.is_confirmed_revocation and not error.requires_rebind:
                raise
            renewal_error = error
        if not encrypted_activation_code:
            raise LicenseClientError(
                '本机没有保存激活凭证，请重新输入激活码完成激活。',
                status_code=409,
                code=MANUAL_ACTIVATION_REQUIRED) from renewal_error
        try:
            activation_code = self.cipher.decrypt(encrypted_activation_code)
        except LicenseCryptoError as error:
            self._record_failure('重新激活', error, sensitive_values=(encrypted_activation_code,))
            raise LicenseClientError(
                '本机保存的激活凭证无法解密，请重新输入激活码完成激活。',
                status_code=409,
                code=MANUAL_ACTIVATION_REQUIRED) from error
        try:
            return await self.activate(activation_code, email)
        except LicenseClientError as error:
            self._record_failure('重新激活', error, sensitive_values=(activation_code, email))
            raise

    async def heartbeat(self) -> dict:
        # [补充说明] 对外的心跳入口：串行化，避免与恢复流程并发续租。
        generation = self._success_generation
        # 走凭证临界区而不是只取 _heartbeat_lock：续租会写凭证，必须在「本进程唯一写入者」
        # 的保护下进行（生产里 start() 已持有进程锁，这里只是复用同一把临界区）。
        async with self._credential_operation():
            # 临界区里已经有别的路径成功过：再来一轮只会拿旧租约去撞序号，直接回报最新状态。
            if generation != self._success_generation:
                return self.status()
            with self.database.session_factory() as database:
                # 终态不联网：重试不会有结果，把当前状态原样回报给调用方。
                if self._state(database).status in TERMINAL_STATES:
                    return self._payload(self._state(database))
            return await self._heartbeat_unlocked()

    async def _heartbeat_unlocked(self) -> dict:
        # [补充说明] 心跳的实际实现（调用方须已持有 _heartbeat_lock）。
        #
        # 优先用会话令牌续租，无令牌或 401 时回落到恢复令牌；确认吊销清空本地授权，
        # 429 只记冷却不改状态，其余失败只降级状态并保留租约等重试。
        with self.database.session_factory() as database:
            state = self._state(database)
            encrypted = state.encrypted_session_token
            instance_id = state.instance_id
            lease_sequence = state.lease_sequence
        # 没有会话令牌说明从未激活成功或刚被清空，直接走恢复流程。
        if not encrypted:
            return await self._recover_unlocked()
        # 先赋空串：解密失败时错误路径仍能安全地把 session_token 当作敏感值抹除。
        session_token = ''
        try:
            session_token = self.cipher.decrypt(encrypted)
            response = await self._post('/v2/heartbeat', {
                'sessionToken': session_token,
                # 回传 instanceId：与 recover 同理，服务端的 DeviceBinding 会比对它，
                # 缺省即被判定「会话不属于当前实例」并按已吊销处理（403 + revoked）。
                'instanceId': instance_id,
                # 回传本地序号：服务端据此判断客户端是否落后于最新租约。
                'leaseSequence': lease_sequence,
                'clientVersion': self.settings.version,
                'nonce': secrets.token_urlsafe(24)})
            result = self._apply_response(response)
            self._record_online_success('心跳')
            return result
        except (LicenseClientError, LicenseCryptoError) as error:
            self._record_failure('心跳', error, sensitive_values=(session_token, encrypted))
            # 商店已解除本机绑定（后台强制或账号中心自助解绑）：不是吊销 —— 重新激活即可。
            # 必须先于吊销分支判定：这条 403 的文案也命中吊销兜底短语（见 requires_rebind）。
            if isinstance(error, LicenseClientError) and error.requires_rebind:
                self._mark_binding_released(str(error))
                raise LicenseClientError(str(error), status_code=error.status_code, code=error.code) from error
            # 确认吊销：清空本地授权后原样上抛（保留状态码，reactivate 据此判定不可自愈）。
            if isinstance(error, LicenseClientError) and error.is_confirmed_revocation:
                self._mark_revoked(str(error))
                raise LicenseClientError(str(error), status_code=error.status_code) from error
            # 401 视为会话过期：立刻用恢复令牌换新会话，对调用方透明。
            if isinstance(error, LicenseClientError) and error.status_code == 401:
                return await self._recover_unlocked()
            # 其它失败按租约剩余有效期降级为 CONNECTION_WARNING 或 LEASE_EXPIRED，等下一轮重试。
            self._mark_failure(error)
            # 用 _mark_failure 归一化后的错误码：原始异常常常没有 code（如解密失败），
            # 透传 None 会让前端丢掉「要人工介入 / 可重试」的判据。
            raise LicenseClientError(str(error), status_code=getattr(error, 'status_code', None), code=self._error_code) from error

    async def recover(self) -> dict:
        # [补充说明] 对外恢复入口：串行化，与心跳共用同一把锁。
        generation = self._success_generation
        async with self._credential_operation():
            # 同心跳：临界区里已经成功过就不再发请求，直接回报最新状态。
            if generation != self._success_generation:
                return self.status()
            with self.database.session_factory() as database:
                state = self._state(database)
                # 终态不联网：重试不会有结果，把当前状态原样回报给调用方。
                if state.status in TERMINAL_STATES:
                    return self._payload(state)
            return await self._recover_unlocked()

    async def retry_now(self) -> dict:
        """One shared task for simultaneous clicks; never queue token rotations."""
        # [补充说明] 与后台心跳的差别就是本方法存在的理由：它**当场**发起一轮恢复，并清掉端点黑名单，
        # 所以手动点击不会被上一轮失败留下的冷却直接挡回（否则点了等于没点）。
        #
        # 并发语义（三个细节都是有意的）：
        # - 同一时刻只跑一个重试任务：多个页面同时点就共用它，而不是排队做多轮令牌轮换；
        # - 节流窗口内直接返回当前状态、不发请求 —— 连点不该变成对授权服务的压测；
        # - ``shield`` 保证等待方被取消时不会把共享任务一起取消（否则先点的那台设备一刷新，
        # 后点的那台就永远等不到结果）。
        if self._retry_task is not None and not self._retry_task.done():
            await asyncio.shield(self._retry_task)
            return self.status()
        if time.monotonic() < self._manual_retry_after:
            return self.status()
        # 先占住节流窗口再建任务：窗口要在请求之前占住，否则并发点击会一起通过判定。
        self._manual_retry_after = time.monotonic() + 2
        self._retry_task = asyncio.create_task(self._manual_retry(), name='license-manual-retry')
        await asyncio.shield(self._retry_task)
        return self.status()

    async def _manual_retry(self) -> None:
        # [补充说明] 手动重试的实现（在凭证临界区里执行）。
        #
        # 终态或压根未激活时不再联网：直接把当前状态回报给调用方，由前端按状态引导重新激活。
        generation = self._success_generation
        async with self._credential_operation():
            # 本轮开始后已经有别的路径成功了：直接返回，不必再用旧租约发一轮请求。
            if generation != self._success_generation:
                return self.status()
            with self.database.session_factory() as database:
                state = self._state(database)
                # 时钟异常是本机时间的问题：重试前按当前时间重新校验一次，
                # 已校准时间的用户点一下就能自己恢复，不必走激活流程。
                if state.status == 'CLOCK_ROLLBACK':
                    state.status = 'ACTIVE'
                    self._validate_saved_state(state, database)
                if state.status in {'ACTIVE', 'LEASE_EXPIRED', 'CONNECTION_WARNING'}:
                    self._validate_saved_state(state, database)
                if state.status in TERMINAL_STATES - {'RECOVERY_REQUIRED', 'REMOTE_REJECTED'} or not state.license_id:
                    # 终态或压根未激活：联网也不会有结果，直接把当前状态回报给调用方。
                    return self._payload(state)
            # 清黑名单：用户明确要求「现在就再试」，沿用上一轮的冷却会让这一下必然无效。
            self._endpoint_pool.retry_failed()
            try:
                await self._recover_unlocked()
            except LicenseClientError:
                # 失败已在底层记好状态与重试计划，这里不再上抛：手动重试的返回值统一走
                # status()，让前端看到真实状态与倒计时，而不是一个错误页。
                pass
            finally:
                # 无论成败都重置节流窗口：失败后马上再点应当能再试一次。
                self._manual_retry_after = time.monotonic() + 2
            return self.status()

    async def _recover_unlocked(self) -> dict:
        # [补充说明] 用恢复令牌重新换取租约（调用方须已持有 _heartbeat_lock）。
        with self.database.session_factory() as database:
            state = self._state(database)
            encrypted = state.encrypted_recovery_token
            instance_id = state.instance_id
            lease_sequence = state.lease_sequence
        if not encrypted:
            # 连恢复令牌都没有：本地已无任何可用凭证，只能让用户重新激活。
            self._record_failure('租约恢复', '没有可用的租约恢复凭证，请重新激活。')
            error = LicenseClientError('没有可用的租约恢复凭证，请重新激活。', code='CREDENTIAL_MISSING')
            self._mark_failure(error)
            raise error
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
            result = self._apply_response(response)
            self._record_online_success('租约恢复')
            return result
        except (LicenseClientError, LicenseCryptoError) as error:
            self._record_failure('租约恢复', error, sensitive_values=(recovery_token, encrypted))
            if isinstance(error, LicenseClientError) and error.requires_rebind:
                # 与心跳同一条判定：被解绑不是吊销，落到「需要重新激活」。
                self._mark_binding_released(str(error))
                raise LicenseClientError(str(error), status_code=error.status_code, code=error.code) from error
            if isinstance(error, LicenseClientError) and error.is_confirmed_revocation:
                self._mark_revoked(str(error))
                raise LicenseClientError(str(error), status_code=error.status_code) from error
            self._mark_failure(error)
            # 同心跳：透传 _mark_failure 归一化后的错误码，而不是原始异常上可能为 None 的 code。
            raise LicenseClientError(str(error), status_code=getattr(error, 'status_code', None), code=self._error_code) from error

    def _mark_revoked(self, message: str) -> None:
        # [补充说明] 确认吊销：状态置为 REVOKED、截断记录服务端文案，并落终局错误码。
        with self.database.session_factory() as database:
            state = self._state(database)
            state.status = 'REVOKED'
            # 截断到 1000 字符：文案会进数据库并展示在界面上，防止超长内容撑爆字段。
            state.last_error = message[:1000]
            database.commit()
        # 记下终局错误码；吊销必须人工处理，后台不该继续排重试。
        self._error_code = 'LICENSE_REVOKED'
        # 已确认吊销，不再需要启动联网确认。
        self._startup_validation_pending = False
        self._next_attempt = None
        self._record_status('REVOKED')
        # 唤醒心跳循环重算等待（此时无授权，会转入空转等待）。
        self._schedule_changed.set()

    def _mark_instance_conflict(self, message: str) -> None:
        # [补充说明] 商店后台确认「该授权已绑定其他设备」：唯一需要用户去商店解绑的路径。
        #
        # 与 ``_state()`` 里本机指纹变化的区分：那是本地凭证作废（INSTANCE_CHANGED，
        # 只需重新激活），这里是服务端明确拒绝（INSTANCE_MISMATCH，必须先在商店解绑）。
        # 混用会让「本机根本没有绑定关系」的机器收到一条无法执行的指引。
        with self.database.session_factory() as database:
            state = self._state(database)
            state.status = 'INSTANCE_MISMATCH'
            state.last_error = message[:1000]
            database.commit()
        # 终局错误码：前端据此展示「去商店解绑」而不是「重新激活」。
        self._error_code = 'INSTANCE_MISMATCH'
        # 已进终态：不再排自动重试，等用户去商店解绑后重新激活。
        self._next_attempt = None
        self._record_status('INSTANCE_MISMATCH', message[:200])
        # 唤醒心跳循环重算等待（终态会转入空转等待）。
        self._schedule_changed.set()

    def _mark_binding_released(self, message: str) -> None:
        # [补充说明] 商店已解除本机绑定：状态落 INSTANCE_CHANGED，等用户重新激活。
        #
        # 为什么不落 REVOKED：REVOKED 的语义是「这份授权被停用 / 到期」，下一步是找管理员；
        # 被解绑只是「这台机器不再绑在它上面」，重新激活就能自愈。判据从服务端的结构化
        # code（BINDING_RELEASED）来，不猜文案 —— 见 requires_rebind。
        with self.database.session_factory() as database:
            state = self._state(database)
            state.status = 'INSTANCE_CHANGED'
            # 存面向用户的可执行说法，而不是服务端那句只有五个字的「实例绑定已停用。」
            state.last_error = '该授权已在商店解除设备绑定，请重新激活授权。'
            database.commit()
        # 终局错误码与状态同名：前端据此展开激活表单而不是显示「重试」。
        self._error_code = 'INSTANCE_CHANGED'
        # 不再排自动重试：解绑是人工动作，自动重打只会把失败日志刷满。
        self._next_attempt = None
        self._record_status('INSTANCE_CHANGED', message[:200])
        # 唤醒心跳循环重算等待（终态会转入空转等待）。
        self._schedule_changed.set()

    def _mark_failure(self, error: Exception) -> None:
        # [补充说明] 非吊销类失败：分类记录状态、定下错误码，并排下一次自动重试。
        #
        # 分三档处置：
        # - **终局**（本地凭证解不开 / 缺凭证 / 4xx 明确拒绝）→ 不再自动重试，
        # 前端要引导人工介入（重新激活、检查授权）；
        # - **会话失效**（401）→ 先记 RECOVERY_RETRY（下轮重试），连续失败才升成 RECOVERY_REQUIRED；
        # - **网络类** → 按租约剩余有效期降级为 CONNECTION_WARNING（仍可用）或 LEASE_EXPIRED（拦截）。
        message = str(error)
        http_status = getattr(error, 'status_code', None)
        code = getattr(error, 'code', None)
        if code == 'LICENSE_RATE_LIMITED':
            # 429 是服务端限流：单独记冷却窗口，期间 confirm_binding 不联网，等窗口过了再试。
            self._rate_limited_until = time.monotonic() + RATE_LIMIT_COOLDOWN_SECONDS
        self._failures += 1
        retry = True
        # 401 固定 2 秒：它多半是会话/恢复令牌轮换的瞬时竞态，重试越快恢复越快；
        # 其余按 RETRY_DELAYS 递增，失败次数超出阶梯长度就停在最后一档。
        delay = 2 if http_status == 401 else RETRY_DELAYS[min(self._failures - 1, len(RETRY_DELAYS) - 1)]
        with self.database.session_factory() as database:
            state = self._state(database)
            if state.status in TERMINAL_STATES - {'RECOVERY_REQUIRED', 'REMOTE_REJECTED'}:
                # 已经是终态：保留原状态与原因为准，不因为一次新的失败改写成别的说法。
                retry = False
                code = code or state.status
            elif isinstance(error, LicenseCryptoError) or code == 'CREDENTIAL_MISSING':
                # 凭证本身坏了，重试不会变好：本机已无法证明身份，必须人工重新激活。
                state.status = 'INVALID' if isinstance(error, LicenseCryptoError) else 'RECOVERY_REQUIRED'
                code = code or 'CREDENTIAL_INVALID'
                retry = False
            elif http_status == 401:
                # 会话与恢复令牌都失效（调用方先试过恢复才走到这里）：第一次按「重试中」，
                # 再失败一次就认为自动恢复无望，转人工。
                retry = state.status not in {'RECOVERY_RETRY', 'RECOVERY_REQUIRED'}
                state.status = 'RECOVERY_RETRY' if retry else 'RECOVERY_REQUIRED'
                code = code or 'RECOVERY_TOKEN_INVALID'
            elif http_status is not None and 400 <= http_status < 500 and http_status not in {408, 429}:
                # 4xx 是业务拒绝（除超时/限流）：换地址、换时间都不会变，直接判终局。
                state.status = 'REMOTE_REJECTED'
                code = code or 'LICENSE_REMOTE_REJECTED'
                retry = False
            elif state.status in {'RECOVERY_RETRY', 'REMOTE_REJECTED', 'RECOVERY_REQUIRED'}:
                # 已经处在恢复流程里：保持该状态语义，只更新错误码与重试计划。
                code = code or 'NETWORK_UNAVAILABLE'
                retry = state.status == 'RECOVERY_RETRY'
            else:
                expires = aware(state.lease_expires_at)
                # 租约未到期只是联系不上服务器，功能继续可用；已到期则必须拦截等恢复。
                state.status = 'CONNECTION_WARNING' if expires and expires > datetime.now(timezone.utc) else 'LEASE_EXPIRED'
                code = code or 'NETWORK_UNAVAILABLE'
            # 同样截断，避免超长错误进库。
            state.last_error = message[:1000]
            database.commit()
            self._record_status(state.status)
        self._error_code = code
        # 只有「可重试」才排计划时刻；终态排了会让后台对着一个注定失败的状态无限重试。
        self._next_attempt = time.monotonic() + delay if retry else None
        # 一次失败就交回离线验签判定：联网确认不成功不等于授权无效，把门禁锁在
        # 「等待启动联网验证」会让持有有效租约的离线用户永远进不去（放行与否仍由
        # _verified_access 按签名租约现算）。
        self._startup_validation_pending = False
        # 计划可能变了，唤醒心跳循环立刻重算等待时间（否则要等当前这一觉睡完）。
        self._schedule_changed.set()

    @staticmethod
    def _heartbeat_wait_seconds(state: LicenseState, now: datetime | None = None) -> float | None:
        # [补充说明] 算出心跳循环下一次该等多久；未激活或已进入终态时返回 None。
        #
        # 租约已到期 → 固定 LICENSE_RETRY_SECONDS 重试；否则取 min(心跳间隔, 距到期剩余时间)，
        # 保证租约一到点就被处理。
        if not state.license_id or state.status in TERMINAL_STATES:
            # 未激活 / 终态无需心跳。
            return None
        if state.status == 'RECOVERY_RETRY':
            # 会话恢复的瞬时竞态：等 2 秒就重来，别拖到常规心跳间隔。
            return 2
        if state.status == 'LEASE_EXPIRED':
            return float(LICENSE_RETRY_SECONDS)
        # 断连时也按 LICENSE_RETRY_SECONDS 复查；常规情况再兜一次 30 秒下限。
        interval = float(LICENSE_RETRY_SECONDS if state.status == 'CONNECTION_WARNING' else max(30, state.heartbeat_interval_seconds))
        expires = aware(state.lease_expires_at)
        if expires is None:
            return interval
        remaining = (expires - (now or datetime.now(timezone.utc))).total_seconds()
        # 不允许负等待；到期时间比间隔更近时提前唤醒。
        return max(0, min(interval, remaining))

    def _scheduled_wait_seconds(self, state: LicenseState) -> float | None:
        # [补充说明] 算出本轮该等多久：优先听「计划重试时刻」，没有计划才按常规心跳节奏。
        #
        # 计划时刻存在意味着上一轮失败已经算好了退避（见 :meth:`_mark_failure`）；此时必须
        # 以它为准，否则「失败退避」和「心跳间隔」会各走各的，退避形同虚设。
        # 未激活或已进入终态时返回 None，调用方据此一直等到有变更为止。
        if not state.license_id or state.status in TERMINAL_STATES:
            return None
        if self._next_attempt is not None:
            # 已过计划时刻就返回 0（立刻试），而不是再等一个完整的心跳间隔。
            return max(0.0, self._next_attempt - time.monotonic())
        return self._heartbeat_wait_seconds(state)

    async def _heartbeat_loop(self) -> None:
        # [补充说明] 心跳主循环：等一个「计划变更」或超时，然后续租或恢复。
        #
        # 每轮都重新读库计算等待时间，因此激活、停用、租约变化都能立刻生效。
        while not self._stop.is_set():
            # 先清后等：清掉上一轮遗留的信号，避免本轮空转。
            self._schedule_changed.clear()
            # 每轮读库算等待时间：未激活 / 终态返回 None，表示一直等到有变更为止。
            with self.database.session_factory() as database:
                wait_seconds = self._scheduled_wait_seconds(self._state(database))
            try:
                # 用事件等待代替 sleep：激活成功后能立刻打断长等待。
                # wait_seconds 为 None 表示一直等到有变更为止。
                await asyncio.wait_for(self._schedule_changed.wait(), timeout=wait_seconds)
            except TimeoutError:
                # 超时才是「该续租了」；被事件唤醒则说明计划已变，直接进入下一轮重算。
                with self.database.session_factory() as database:
                    state = self._state(database)
                    # 状态可能在等待期间被清空（吊销 / 重新激活），此时无需联网。
                    if not state.license_id or state.status in TERMINAL_STATES:
                        continue
                    # 等待期间计划又被改过（例如刚激活成功）：直接重算，不必联网。
                    if self._schedule_changed.is_set():
                        continue
                    # 启动确认未完成、或状态本身就要求重试：都用恢复令牌换新租约。
                    recover = self._startup_validation_pending or state.status in {'LEASE_EXPIRED', 'RECOVERY_RETRY'}
                    expires = aware(state.lease_expires_at)
                    # 租约已到期（即使状态字段还说 ACTIVE）也必须走恢复。
                    recover = recover or bool(expires and expires <= datetime.now(timezone.utc))
                # 清黑名单：每一轮计划重试都要能重新探测全部地址，否则整轮会撞在冷却里，
                # 把「自动恢复」拖成「干等一个冷却周期」。
                self._endpoint_pool.retry_failed()
                try:
                    if recover:
                        await self.recover()
                    else:
                        await self.heartbeat()
                except LicenseClientError:
                    # 失败已在 *_unlocked 内部记录并降级状态，这里只等下一轮重试。
                    continue
                except Exception as error:
                    # 非授权异常记日志并按「检查失败」降级重试：直接抛出会让心跳任务静默死掉，
                    # 之后就再没有任何自动恢复的机会。
                    error_name = type(error).__name__
                    self._log_event('error', f'''授权检查发生异常（{error_name}），后台稍后重试。''')
                    self._mark_failure(LicenseClientError('授权检查暂时失败，请稍后重试。', code='LICENSE_CHECK_FAILED'))
                if self._stop.is_set():
                    break

    def _payload(self, state: LicenseState) -> dict:
        # [补充说明] 组装对外状态字典（字段名与前端约定死，逐字不可改）。
        #
        # 会在落库状态之上做实时修正：时钟回拨、租约到期、启动联网确认未完成都会覆盖
        # effective_status，保证前端看到的与门禁口径一致。
        # 先复制库值再实时修正：修正不写库，避免把与时间相关的瞬时判断固化成持久状态。
        effective_status = state.status
        effective_error = state.last_error
        now = datetime.now(timezone.utc)
        last_verified = aware(state.last_verified_at)
        lease_expires = aware(state.lease_expires_at)
        if last_verified and now + timedelta(seconds=self.settings.license_clock_skew_seconds) < last_verified:
            # 时钟回拨时租约到期判断不可信，直接覆盖为 CLOCK_ROLLBACK。
            effective_status = 'CLOCK_ROLLBACK'
            effective_error = '检测到系统时间回拨，请校准系统时间后重新验证授权。'
        elif lease_expires and lease_expires <= now and effective_status in {'ACTIVE', 'CONNECTION_WARNING'}:
            # 库里写着 ACTIVE 但租约已到期：覆盖为 LEASE_EXPIRED，避免前端显示正常却被门禁拦下。
            effective_status = 'LEASE_EXPIRED'
            if not effective_error:
                effective_error = '授权租约已到期。'
        if self.settings.license_required and self._startup_validation_pending and effective_status in {'ACTIVE', 'CONNECTION_WARNING'}:
            # 服务重启后尚未联网确认：对外显示等待验证（仅在配置要求授权时）。
            effective_status = 'STARTUP_VALIDATION_REQUIRED'
            # 已有更具体的原因就保留，没有才用「等待联网确认」的通用说明。
            effective_error = state.last_error or '服务重启后正在等待授权后台确认最新租约。'
        self._record_status(effective_status)
        # 权限口径与状态字段解耦：allowed 一律由离线验签现算，不读 status。
        allowed = self._verified_access(state)
        editor_allowed = self._verified_access(state, 'editor')
        if not allowed and effective_status in {'ACTIVE', 'CONNECTION_WARNING', 'STARTUP_VALIDATION_REQUIRED'}:
            # 验签没过（租约被改 / 实例不符）：状态必须跟着变 INVALID，不能只挡门禁而不报错。
            effective_status = 'INVALID'
            effective_error = '本地授权签名或会话记录校验失败，请联系管理员检查。'
        try:
            stored_features = json.loads(state.feature_set or '[]')
        except json.JSONDecodeError:
            # 库里存的是 JSON 文本，损坏时按空列表处理而不是让整个状态接口报错。
            stored_features = []
        if not isinstance(stored_features, list):
            stored_features = []
        if 'all' in stored_features:
            # 'all' 是服务端的合集简写，展开成 BASE_FEATURES，前端不必硬编码清单。
            visible_features = sorted(BASE_FEATURES)
        else:
            visible_features = [item for item in stored_features if isinstance(item, str)]
        visible_products = []
        if state.signed_lease:
            # 产品清单只从「验签通过的租约」里取，避免把库里的脏数据透给前端。
            try:
                signed_payload = self.verifier.verify(state.signed_lease, state.instance_id)
            except LicenseCryptoError:
                signed_payload = {}
            raw_products = signed_payload.get('products')
            if isinstance(raw_products, list):
                for item in raw_products:
                    if not isinstance(item, dict) or not isinstance(item.get('name'), str):
                        continue
                    product_name = item['name'].strip()
                    if not product_name:
                        continue
                    # 类型与到期时间容错：缺失或不对时退默认值，不让个别脏条目丢掉整个产品列表。
                    product_type = item.get('type') if isinstance(item.get('type'), str) else 'module'
                    expires_at = item.get('expiresAt') if isinstance(item.get('expiresAt'), str) else None
                    visible_products.append({
                        'name': product_name,
                        'type': product_type,
                        'expiresAt': expires_at})
        if allowed and not visible_products:
            # 验签通过的授权却没有产品明细时才兜底展示「基础版」。
            # 判据必须是 allowed 而不是「库里有 license_id」：被吊销 / 安装标识变化 / 租约无效
            # 时验签本就不通过，此时凭残留记录编一个「基础版 / 永久」出来是假信息，
            # 用户会以为自己的商品（例如 3D 版）变成了基础版。
            visible_products = [{
                'name': '基础版',
                'type': 'base',
                'expiresAt': None}]
        return {
            'required': self.settings.license_required,
            'allowed': allowed,
            'editorAllowed': editor_allowed,
            'status': effective_status,
            'instanceId': state.instance_id,
            'activationCodeId': state.license_id,
            'leaseId': state.lease_id,
            'leaseSequence': state.lease_sequence,
            # edition / features / products 一律跟着验签结果走：只有签名租约真的验过，
            # 才对外宣称「有授权、有这些权益、是这个商品」。库里残留的 license_id 只说明
            # 「本机曾激活过」，用它当判据会把被吊销 / 指纹变化的安装说成已授权。
            'edition': 'full' if allowed else None,
            'features': visible_features if allowed else [],
            # featureAccess 额外乘上验签结果：租约不合法（被改、过期、实例不符）也不放行。
            'featureAccess': {
                'editor': bool(state.license_id and 'editor' in visible_features and editor_allowed),
                'interaction3d': bool(state.license_id and 'module.3d_interaction' in visible_features and self._verified_access(state, 'module.3d_interaction'))},
            'products': visible_products if allowed else [],
            # 心跳间隔（秒），前端据此展示刷新节奏。
            'heartbeatIn': state.heartbeat_interval_seconds,
            'leaseIssuedAt': aware(state.lease_issued_at),
            'leaseExpiresAt': aware(state.lease_expires_at),
            'lastHeartbeatAt': aware(state.last_heartbeat_at),
            'lastVerifiedAt': aware(state.last_verified_at),
            # 重试相关字段：前端据此决定提示文案、按钮可见性与倒计时。
            **{
                'lastError': effective_error,
                # 没有显式错误码时按状态补一个：前端只认 errorCode，缺码会让提示退化成空白。
                'errorCode': self._error_code or {
                    'RECOVERY_RETRY': 'RECOVERY_TOKEN_INVALID',
                    'RECOVERY_REQUIRED': 'LICENSE_REMOTE_REJECTED',
                    'REMOTE_REJECTED': 'LICENSE_REMOTE_REJECTED',
                    'REVOKED': 'LICENSE_REVOKED',
                    'INVALID': 'CREDENTIAL_INVALID',
                    'CLOCK_ROLLBACK': 'CLOCK_INVALID',
                    'INSTANCE_CHANGED': 'INSTANCE_CHANGED',
                    'INSTANCE_MISMATCH': 'INSTANCE_MISMATCH',
                    'LEASE_EXPIRED': 'LEASE_EXPIRED'}.get(effective_status),
                'retryable': bool(state.license_id and effective_status not in TERMINAL_STATES),
                # canRetry 再排除「必须人工介入」的三种状态：这些状态点重试按钮没有意义。
                'canRetry': bool(state.license_id and effective_status not in TERMINAL_STATES - {'CLOCK_ROLLBACK', 'REMOTE_REJECTED', 'RECOVERY_REQUIRED'}),
                'retrying': self._heartbeat_lock.locked(),
                'retryAttempt': self._failures,
                'nextRetryAt': (now + timedelta(seconds=max(0, self._next_attempt - time.monotonic()))).isoformat() if self._next_attempt is not None and effective_status not in TERMINAL_STATES else None,
                'startupValidationPending': self._startup_validation_pending,
            }}

    def status(self) -> dict:
        # [补充说明] 取当前状态（开一个短事务，读单行状态后组装成字典）。
        with self.database.session_factory() as database:
            return self._payload(self._state(database))

    def earliest_entitlement_expiry(self, codes: Collection[str]) -> datetime:
        """取「租约整体到期时间」与指定权益到期时间中最早的一个。"""
        # [补充说明] 给「短时效授权」用的到期基准：调用方拿它减去当前时间，就知道还能撑多久。
        #
        # 为什么要单独开这个公开方法，而不是让调用方自己去读租约：
        # 读租约要同时碰 _state() 与 verifier 两个内部成员（前者是私有读写、后者要配对
        # instance_id 才能验签），散落在授权包之外既容易漏掉 instance_id，也会把
        # 「租约怎么读、怎么验」的知识复制到每个调用点。这里收口一次，调用方只面对语义。
        #
        # 参数:
        #     codes：需要参与的权益码集合（如 {'editor', 'module.3d_interaction'}）。
        #         租约里的权益码不在此集合内时不计入 —— 别的模块的到期时间不该拖累本模块。
        # 异常:
        #     LicenseCryptoError / KeyError / TypeError / ValueError：租约损坏或签名不匹配。
        #         调用方应当据此拒绝放行，而不是退化成「当没开授权强制」。
        with self.database.session_factory() as database:
            state = self._state(database)
            # signed_lease 可能是空串（还没下发租约），交给 verify 按签名失败处理。
            payload = self.verifier.verify(state.signed_lease or '', state.instance_id)
        # 起算点取「租约整体到期时间」与「各相关权益到期时间」中最早的那个：
        # 整体租约到期、或任一相关权益到期，都会让这次授权失去依据，取 min 才是安全侧。
        deadlines = [parse_timestamp(payload['expiresAt'])]
        for item in payload.get('entitlements', []):
            if not isinstance(item, dict):
                continue
            if item.get('code') not in codes:
                continue
            # 老租约的权益条目可能没有 expiresAt：没有到期时间就没有约束，跳过而不是当成 0。
            if not item.get('expiresAt'):
                continue
            deadlines.append(parse_timestamp(item['expiresAt']))
        return min(deadlines)

    def availability(self) -> dict:
        """Public recovery shell gets no identifiers, credentials or raw errors."""
        # [补充说明] 公开的可用性摘要：给恢复页与展示端，不含任何标识、凭证或原始错误。
        #
        # 与 status() 的分工：status() 面向管理员，含激活码提示、租约 / 会话标识与原始
        # lastError；恢复页（可能未登录）绝不能拿到这些，所以另出一个只含「状态 + 能否重试」
        # 的响应体，由字段白名单保证不泄露。
        result = self.status()
        # 只取白名单里的七个字段：其余（激活码提示、租约 / 会话标识、原始错误）绝不外泄。
        output = {key: result[key] for key in ('status', 'errorCode', 'retryable', 'canRetry', 'retrying', 'retryAttempt', 'nextRetryAt')}
        # displayAllowed 现算而不是从 status 里取：它由签名租约 + 权益集合共同决定，
        # 复用 lastError 之类的字段推断会把「文件坏了」误判成「没权限」。
        output['displayAllowed'] = self.allows('display')
        return output

    def _verified_access(self, state: LicenseState, feature: str | None = None) -> bool:
        """Re-verify the signed lease instead of trusting mutable SQLite status fields."""
        # [补充说明] 参数: feature 为要判定的能力码；None 表示只判「授权整体是否可用」。
        if not self.settings.license_required:
            # 关闭授权校验的部署形态直接放行。
            return True
        if state.status not in {'ACTIVE', 'CONNECTION_WARNING'}:
            # 状态不在可放行集合内时短路，避免无谓的验签开销。
            # 真正决定放不放行的仍是下面的签名租约验签与到期判定。
            return False
        if not (state.signed_lease and state.license_id and state.lease_id and state.session_id):
            # 四个字段（租约、授权标识、租约标识、会话标识）缺一不可，否则记录不完整。
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
        last_verified = aware(state.last_verified_at)
        # 时钟回拨会让已过期的租约重新「有效」，必须拒绝。
        if last_verified and now + timedelta(seconds=self.settings.license_clock_skew_seconds) < last_verified:
            self._record_failure('本地校验', '检测到系统时间回拨，请校准系统时间后重新验证授权。')
            return False
        if issued_at > now + timedelta(seconds=self.settings.license_clock_skew_seconds):
            self._record_failure('本地校验', '授权服务器时间明显晚于本机时间，请先校准系统时间。')
            return False
        if expires_at <= now:
            # 严格比较（不加时钟容差）：服务端签的到期时间一到就不可用。
            self._record_failure('本地校验', '授权租约已到期。')
            return False
        # 逐字段比对库里的关联标识与租约载荷：不一致说明记录被改过或租约被换过。
        if payload['activationCodeId'] != state.license_id:
            self._record_failure('本地校验', '本地授权标识与签名租约不一致。')
            return False
        if payload['leaseId'] != state.lease_id or payload['sessionId'] != state.session_id:
            self._record_failure('本地校验', '本地租约或会话标识与签名租约不一致。')
            return False
        # 序号必须与库里的记录一致：不一致说明记录被改过或租约被换过。
        if payload['leaseSequence'] != state.lease_sequence:
            self._record_failure('本地校验', '本地租约序号与签名租约不一致。')
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
                    # 权益到期与租约到期同为「服务端签的时间 vs 本机时钟」，同为严格比较、不加密容差。
                    if expires_at and parse_timestamp(expires_at) <= now:
                        continue
                except (LicenseCryptoError, TypeError, ValueError):
                    # 时间格式非法的条目跳过（视为未授权），不让一条脏数据打挂整次判定。
                    continue
                active_features.add(entitlement['code'])
            return feature in active_features
        # 老租约没有 entitlements 段：退回只看 features 列表。
        return feature in features

    def allows(self, feature: str | None = None, *, database=None) -> bool:
        # [补充说明] 对外门禁入口：判断当前安装是否有权使用某能力。
        #
        # 参数: feature 为能力码；None 表示只判授权是否整体可用。
        if database is not None:
            # 复用外部会话，但仍要核对实例 ID：换了数据卷后不能沿用旧判定。
            state = database.scalar(select(LicenseState).limit(1))
            # 用本机硬件指纹现算值与库里的实例 ID 比对：不一致说明那份租约不属于当前安装，无需验签。
            if state is None or state.instance_id != self._instance_id():
                return False
            return self._verified_access(state, feature)
        with self.database.session_factory() as database:
            return self._verified_access(self._state(database), feature)
