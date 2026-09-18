"""授权客户端：激活、心跳续租、租约恢复与能力门禁。

整体流程：
1. 激活（activate）：把激活码 + 实例 ID 交给授权服务，换回 Ed25519 签名租约
   与两个令牌（会话令牌、恢复令牌）；令牌用 SecretCipher 加密后落库。
2. 心跳（heartbeat）：用会话令牌周期续租；leaseSequence 必须单调递增，
   序号不增的响应一律拒绝，用于防重放。
3. 恢复（recover）：会话令牌失效（401）后用恢复令牌换新租约；
   恢复令牌也失效则要求用户重新激活（reactivate / MANUAL_ACTIVATION_REQUIRED）。
4. 门禁（_verified_access）：每次判权都重新对本地签名租约做离线验签，
   不信任数据库里的 status 字段 —— 库被改也不能凭状态字段放行。

网络约定：请求体经 LicenseTransportCipher 加密（X25519 + HKDF-SHA256 + AES-256-GCM），
端点按 esa / eo / direct 批次依次尝试，失败地址临时拉黑。
"""
from __future__ import annotations

import asyncio
import json
import os
import secrets
import threading
import time
from datetime import datetime, timedelta, timezone

import httpx
from sqlalchemy import select

from ..config import Settings
from ..database import Database
from ..global_log import GlobalLogStore
from ..models import LicenseState
from .crypto import LeaseVerifier, LicenseCryptoError, LicenseTransportCipher, SecretCipher, parse_timestamp
from .endpoints import LicenseEndpointPool
from .hardware import hardware_instance_id
from .trust import verify_license_trust_anchors

#: 服务端结构化吊销码；仅凭 ``code`` / ``revoked`` 判定「确认吊销」。
CONFIRMED_REVOCATION_CODES = frozenset({'REVOKED', 'LICENSE_REVOKED'})


class LicenseClientError(RuntimeError):
    """授权客户端对外抛出的统一错误。

    中文文案可直接展示给用户；status_code 与 code 供调用方（路由层 / 前端）
    区分「临时失败」「需要人工重新激活」等情形。
    """

    def __init__(self, message: str, *, status_code: int | None = None, code: str | None = None) -> None:
        """参数:
            message: 面向用户的错误文案。
            status_code: 授权服务返回的 HTTP 状态码；本地错误为 None。
            code: 业务错误码，例如 MANUAL_ACTIVATION_REQUIRED / REVOKED，前端据此切换界面。
        """
        super().__init__(message)
        self.status_code = status_code
        self.code = code

    @property
    def is_confirmed_revocation(self) -> bool:
        """仅在授权服务「确认吊销」时返回 True。

        401/403 也可能是会话过期、恢复令牌失效，或授权节点同步过程中的瞬时竞态；
        这些情况必须保留本地授权，让客户端还有机会自动重试恢复。

        仅认结构化 ``code``（``REVOKED`` / ``LICENSE_REVOKED``）；
        ``revoked: true`` 无 code 时由 ``_parse_error_response`` 注入 ``REVOKED``。
        """
        # 只有 401/403 才可能是吊销；网络错误、5xx 一律不算。
        if self.status_code not in frozenset({401, 403}):
            return False
        return self.code in CONFIRMED_REVOCATION_CODES


# 租约已到期时的重试间隔：比常规心跳更密，尽量缩短功能不可用的窗口。
EXPIRED_LEASE_RETRY_SECONDS = 30
#: 本机拿不出可用激活凭证时返回的错误码，前端据此展开手动激活表单。
MANUAL_ACTIVATION_REQUIRED = 'LICENSE_ACTIVATION_REQUIRED'
# 基础权益集合：当租约 features 里出现 'all' 时按这份清单展开，
# 前端据此渲染可用的功能开关（'all' 只是服务端的合集简写）。
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


def aware(value: datetime | None) -> datetime | None:
    """给缺少时区的 datetime 补上 UTC。

    SQLite 取回的 datetime 常常没有 tzinfo，直接与带时区的 now 比较会抛 TypeError；
    统一按 UTC 解释，与写库时的假设保持一致。
    """
    # 已有 tzinfo 或本身是 None 时原样返回，避免重复转换。
    if value is None or value.tzinfo is not None:
        return value
    return value.replace(tzinfo=timezone.utc)


class LicenseService:
    """授权服务客户端。

    生命周期：start() 读库做离线校验、必要时联网确认，然后拉起心跳循环；
    stop() 停循环。所有状态都落在 LicenseState 单行表里，进程重启后
    只靠「签名租约 + 实例 ID」恢复判定，不依赖任何内存状态。
    """

    def __init__(self, settings: Settings, database: Database, transport: httpx.AsyncBaseTransport | None, *, endpoint_pool: LicenseEndpointPool | None = None, event_log: GlobalLogStore | None = None) -> None:
        """参数:
            settings: 全局配置，提供公钥/密钥路径、超时、时钟容差等。
            database: 会话工厂来源，所有状态读写都经由它开短事务。
            transport: httpx 传输层，测试可注入 MockTransport。
            endpoint_pool: 端点池，缺省时按配置的批次构建。
            event_log: 全局日志存储，把授权状态变化写进「授权」分类事件。
        """
        self.settings = settings
        self.database = database
        self.event_log = event_log
        # 启动期先钉死信任锚：指纹错了立刻失败并提示 gen_keys，不拖到首次激活。
        verify_license_trust_anchors(settings)
        # 事件去重状态可能被心跳协程与请求线程同时访问，用可重入锁保护。
        self._event_lock = threading.RLock()
        # 记住上一次对外可见的状态：只在状态真正变化时写事件日志，避免刷屏。
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
        # 心跳与恢复共用这一把锁：避免两条路径并发续租，
        # 导致后到的旧序号租约把新租约覆盖掉（会被判为 INVALID）。
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

    #: 打开编辑器等入口强制联网确认；状态轮询走节流，避免打爆授权服务。
    BINDING_CONFIRM_THROTTLE_SECONDS = 15.0

    def _binding_needs_confirm(self) -> bool:
        """读本地凭证判断这次调用是否真需要联网（同步，调用方放进工作线程）。

        条件：已激活、有签名租约、且状态处在「心跳还在续租」的那几个值上。
        终态（未激活 / 已停用）不需要也不该联网。
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

        打开编辑器、读取授权状态前调用：不能只靠离线签名租约继续放行，
        否则解绑后最长要等心跳间隔（默认 300 秒）才能跳转到激活页。

        参数:
            force: True 时忽略节流（页面入口）；False 时最多每
                ``BINDING_CONFIRM_THROTTLE_SECONDS`` 确认一次（状态轮询）。

        网络失败不清空本地租约（保持离线可用）；仅「确认吊销」会 ``_mark_revoked``。

        并发语义：节流窗口在**发起联网之前**就被占住，因此窗口期内的并发调用
        （多标签页同时刷新、页面与轮询一起到）里只有一个真的发请求，其余立刻
        带着本地状态返回。否则它们会一起排在 ``_heartbeat_lock`` 后面，
        等待时间随标签页数量无界增长 —— 这正是 B55 里「刷新几下面板就卡住」的成因。
        """
        if not self.settings.license_required or not self._endpoint_pool.configured:
            return
        now = time.monotonic()
        if not force and (now - self._last_binding_confirm_at) < self.BINDING_CONFIRM_THROTTLE_SECONDS:
            return
        self._last_binding_confirm_at = now
        # 同步查库放线程池：SQLAlchemy 的同步会话跑在事件循环上会拖住所有请求（B4）。
        if not await asyncio.to_thread(self._binding_needs_confirm):
            return
        try:
            # heartbeat 在 401 时会转 recover；确认吊销时内部已清空本地凭证。
            await self.heartbeat()
        except LicenseClientError as error:
            if error.is_confirmed_revocation:
                # 本地已是 REVOKED；调用方随后 allows() / status() 会拦截并引导重激活。
                self._log_event('warning', f'联网确认绑定失败（已吊销）：{error}')
            # 网络 / 临时故障：保留离线租约，等心跳循环重试。

    def _log_event(self, level: str, message: str) -> None:
        """写一条授权事件日志。

        日志失败绝不能影响授权主流程（例如磁盘写满），因此整体兜底吞掉异常。
        """
        if self.event_log is None:
            return
        try:
            # 分类固定为「授权」，前端事件列表按此过滤。
            self.event_log.append(level, '授权服务', '授权', message)
        except Exception:
            # 有意静默：日志是旁路，不能反向影响授权判定。
            pass

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
            # 日志级别：正常为 success，已停用/未激活为 info，其余告警；
            # 不可恢复的错误再单独升为 error。
            level = 'success' if status == 'ACTIVE' else 'info' if status in frozenset({'DEACTIVATED', 'UNACTIVATED'}) else 'warning'
            if status in frozenset({'INVALID', 'REVOKED', 'CLOCK_ROLLBACK', 'INSTANCE_MISMATCH'}):
                level = 'error'
            self._log_event(level, message)

    def _record_failure(self, operation: str, error: Exception | str, *, sensitive_values: tuple[str, ...] = ()) -> None:
        """记录一次失败，并按「同因去重」策略决定是否真的写日志。

        参数:
            operation: 操作名（激活 / 心跳 / 租约恢复 / 本地校验 / 重新激活）。
            error: 异常对象或错误文案。
            sensitive_values: 需要从文案里抹掉的敏感值（令牌、激活码）。
        """
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
            self._log_event('error' if operation in frozenset({'激活', '本地校验'}) else 'warning', f'''授权{operation}失败（累计 {failure['count']} 次{suffix}）：{reason}''')

    def _record_online_success(self, operation: str) -> None:
        """联网成功：汇报此前累计的心跳/恢复失败次数，并清掉对应的失败计数。"""
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
        """本地校验恢复成功：清计数并写一条恢复日志。"""
        with self._event_lock:
            failure = self._event_failures.pop('本地校验', None)
            if failure:
                self._log_event('success', f'''授权本地校验已恢复；此前校验失败 {failure['count']} 次。''')

    @staticmethod
    def _valid_instance_id(value: str) -> bool:
        """校验实例 ID 的字符集与长度。

        硬件指纹为 SHA-256 十六进制（64 字符）；下限 16 挡住占位/手填短串，
        上限 64 与服务端字段对齐。
        """
        # 允许 ':'，兼容 fallback-machine:xxx 派生格式的诊断片段（正式 ID 仍是纯 hex）。
        return 16 <= len(value) <= 64 and all(character.isalnum() or character in '-_.:' for character in value)

    def _instance_id(self) -> str:
        """取出本机硬件指纹派生的安装实例 ID，并持久化到 data/instance-id。

        身份以硬件为准（见 ``hardware.hardware_instance_id``），不再使用可拷贝的
        uuid4 安装文件。``data/`` 整盘拷贝到另一台机器时：真实硬件不同，或兜底
        文件的本机封印不匹配，都会得到新的 instance_id；``_state`` 随之判为
        ``INSTANCE_MISMATCH``，用户需在商店解绑后用同一激活码重新激活。

        返回:
            合法的硬件派生实例 ID。
        """
        # 缓存命中直接返回，避免每次门禁判定都重读硬件标识。
        if self._cached_instance_id:
            return self._cached_instance_id
        path = self.settings.instance_id_path
        # 目录 0700、文件 0600：实例 ID 参与授权绑定，不应对其它账号可读。
        path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        try:
            saved = path.read_text(encoding='utf-8').strip()
        except OSError:
            saved = ''
        # 硬件指纹是唯一真相源；读不到真实硬件时走「本机封印 + data/ 内熵」兜底，
        # 单独拷贝 data/ 不能把绑定带到另一台机器。
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

    def _state(self, database) -> LicenseState:
        """取（或初始化）单行授权状态，并处理实例 ID 变化。

        单例表：全库只有一行 LicenseState，因此直接 limit(1) 取。
        若实例 ID 变了（换机 / 硬件指纹升级替换旧 UUID），清空全部租约相关字段并要求重新绑定。
        """
        state = database.scalar(select(LicenseState).limit(1))
        instance_id = self._instance_id()
        if state is None:
            # 首次运行：建一行空状态。
            state = LicenseState(id=1, instance_id=instance_id)
            database.add(state)
            database.commit()
            database.refresh(state)
        elif state.instance_id != instance_id:
            # 实例 ID 变化说明授权绑定已失效：必须清空租约与全部令牌，
            # 不能把旧值留着继续参与门禁判定。
            state.instance_id = instance_id
            state.lease_id = None
            state.session_id = None
            state.lease_sequence = 0
            state.signed_lease = None
            state.encrypted_session_token = None
            state.encrypted_recovery_token = None
            state.lease_issued_at = None
            state.lease_expires_at = None
            # 已激活却被判不匹配 → 需要重新绑定；本来就未激活 → 只是一个新安装。
            state.status = 'INSTANCE_MISMATCH' if state.license_id else 'UNACTIVATED'
            state.last_error = (
                '检测到硬件指纹与授权绑定不一致（含从安装 UUID 升级到硬件绑定），'
                '请先在商店账号中心解绑后重新激活。'
                if state.license_id
                else None
            )
            database.commit()
            self._record_status(state.status, state.last_error)
        return state

    # ------------------------------------------------------------------ #
    # 下列方法都只做同步查库 / 落库，供 async 调用方用 asyncio.to_thread 转交。
    # SQLAlchemy 的同步会话跑在事件循环上会阻塞所有请求（B4），因此授权路径里
    # 每一段「读状态 → 联网 → 写状态」之间的同步部分都收敛成这些私有方法。
    # ------------------------------------------------------------------ #
    def _activation_instance_id(self) -> str:
        """取当前实例 ID（同步，供 ``activate`` 放线程池）。"""
        with self.database.session_factory() as database:
            return self._state(database).instance_id

    def _activation_credentials(self) -> tuple[bool, str | None, str]:
        """取自动重激活要用的本地凭证（同步，供 ``reactivate`` 放线程池）。

        返回: (是否已激活, 加密的激活码, 授权邮箱)。
        """
        with self.database.session_factory() as database:
            state = self._state(database)
            return (bool(state.license_id), state.encrypted_activation_code, state.activation_email or '')

    def _heartbeat_credentials(self) -> tuple[str | None, int, str]:
        """取心跳要用的本地凭证（同步，供 ``_heartbeat_unlocked`` 放线程池）。

        返回: (加密的会话令牌, 本地租约序号, 实例 ID)。

        实例 ID 是必须回传的一项：服务端靠它识别「同一张授权已被另一台设备重新
        激活」，少了它就认不出旧会话，解绑对旧设备等于没生效。
        """
        with self.database.session_factory() as database:
            state = self._state(database)
            return (state.encrypted_session_token, state.lease_sequence, state.instance_id)

    def _recovery_credentials(self) -> tuple[str | None, str, int]:
        """取租约恢复要用的本地凭证（同步，供 ``_recover_unlocked`` 放线程池）。

        返回: (加密的恢复令牌, 实例 ID, 本地租约序号)。
        """
        with self.database.session_factory() as database:
            state = self._state(database)
            return (state.encrypted_recovery_token, state.instance_id, state.lease_sequence)

    def _begin_startup_validation(self) -> bool:
        """启动期离线校验（同步，调用方放进工作线程）；返回是否还需联网确认。

        副作用: 可能修改数据库中的状态字段。
        """
        with self.database.session_factory() as database:
            state = self._state(database)
            self._validate_saved_state(state, database)
            # 三个条件同时成立才要求联网确认：配置要求授权、已有激活记录、且本地有签名租约。
            # 纯离线部署（未激活）不受影响。
            pending = bool(self.settings.license_required and state.license_id and state.signed_lease)
            self._record_status('STARTUP_VALIDATION_REQUIRED' if pending else state.status)
            return pending

    async def start(self) -> None:
        """启动授权服务：离线校验本地状态，必要时联网确认，然后拉起心跳循环。

        副作用:
            可能修改数据库中的状态字段；会创建后台心跳任务。
        """
        # 离线校验要读写 LicenseState：放线程池，别在事件循环里做同步查库（B4）。
        self._startup_validation_pending = await asyncio.to_thread(self._begin_startup_validation)
        # 没配置端点就没法联网确认，直接跳过（保持离线验签给出的判定）。
        if self._startup_validation_pending and self._endpoint_pool.configured:
            try:
                await self.recover()
            except LicenseClientError as error:
                # 启动联网确认失败。确认吊销已由 recover() 内部清空本地授权（_mark_revoked），
                # 此时必须保持拦截；其余情况（网络不可达、服务端故障）不应把「持有未过期
                # 有效租约」的安装锁死——那与离线验签相矛盾。交回离线验签判定：
                # 租约未过期 → CONNECTION_WARNING（门禁放行），已过期 → LEASE_EXPIRED（拦截）。
                # 心跳循环会持续重试，服务器恢复后自动续租回到 ACTIVE。
                if not error.is_confirmed_revocation:
                    await asyncio.to_thread(self._clear_startup_validation)
        if self._endpoint_pool.configured:
            # 复位停信号：先 stop() 再 start() 时要能重新工作。
            self._stop.clear()
            # 具名任务便于在调试器与日志里辨认。
            self._task = asyncio.create_task(self._heartbeat_loop(), name='license-heartbeat')

    async def stop(self) -> None:
        """停止心跳循环并等待其退出。"""
        self._stop.set()
        # 两个事件都要 set：心跳循环可能正卡在 wait 上，必须被唤醒才能看到停信号。
        self._schedule_changed.set()
        tasks = [task for task in (self._task,) if task is not None]
        if tasks:
            await asyncio.gather(*tasks)
        # 置空句柄，避免重复 stop() 时 await 一个已结束的任务。
        self._task = None

    def _validate_saved_state(self, state: LicenseState, database) -> None:
        """启动时的离线校验：只信签名租约，不信库里的 status。

        校验顺序：验签 → 租约序号一致 → 到期时间 → 时钟回拨。
        任何一步失败都写回明确的状态与中文原因，供前端展示。
        """
        # 没有租约，或已处于终态（停用/未激活）时无需校验。
        if not state.signed_lease or state.status in frozenset({'DEACTIVATED', 'UNACTIVATED'}):
            return
        try:
            payload = self.verifier.verify(state.signed_lease, state.instance_id)
            # 序号回落说明库里的记录被改过、或来自一份更旧的租约，属于篡改信号。
            if payload['leaseSequence'] != state.lease_sequence:
                raise LicenseCryptoError('本地租约序号与签名租约不一致。')
            expires = parse_timestamp(payload['expiresAt'])
            now = datetime.now(timezone.utc)
            last_verified = aware(state.last_verified_at)
            # 时钟回拨检测：本机时间比上次校验时间还早，会让已过期的租约「复活」，必须拦下。
            if last_verified and now + timedelta(seconds=self.settings.license_clock_skew_seconds) < last_verified:
                state.status = 'CLOCK_ROLLBACK'
                state.last_error = '检测到系统时间回拨，请校准系统时间后重新验证授权。'
            else:
                # 验签通过后按租约到期时间给出离线结论。
                state.status = 'ACTIVE' if expires > now else 'LEASE_EXPIRED'
                state.last_verified_at = now
                state.last_error = None
        except LicenseCryptoError as error:
            # 实例不匹配单独归类：提示用户重新绑定，而不是笼统报「校验无效」。
            state.status = 'INSTANCE_MISMATCH' if '当前实例' in str(error) else 'INVALID'
            state.last_error = str(error)
            # 把整条租约当敏感值抹掉：错误文案里可能带出载荷片段。
            self._record_failure('本地校验', error, sensitive_values=(state.signed_lease,))
        database.commit()
        self._record_status(state.status)

    async def _post(self, path: str, payload: dict) -> dict:
        """向授权服务发送加密请求，按候选列表依次重试。

        参数:
            path: 接口路径，如 /v2/activate。
            payload: 明文请求体，由调用方组装。

        返回:
            解密后的响应字典；服务端返回空 body 时返回 {}。

        异常:
            LicenseClientError: 未配置端点、全部候选失败，或遇到 4xx 业务拒绝。
        """
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
                except httpx.HTTPError:
                    # 连接/超时类错误：拉黑该地址并换下一个候选，网络问题值得换地址再试。
                    self._endpoint_pool.mark_failed(endpoint.base_url)
                    last_failure = LicenseClientError('无法连接授权服务器。')
                    continue
                if response.status_code >= 500:
                    # 5xx 视为服务端暂时故障：换候选的同时拉黑，避免每次都先撞同一台坏机器。
                    self._endpoint_pool.mark_failed(endpoint.base_url)
                    detail, code = self._parse_error_response(response)
                    last_failure = LicenseClientError(detail, status_code=response.status_code, code=code)
                    continue
                if response.status_code >= 400:
                    # 4xx 是业务拒绝（激活码错误、确认吊销等），换地址也不会变，直接抛出。
                    detail, code = self._parse_error_response(response)
                    raise LicenseClientError(detail, status_code=response.status_code, code=code)
                # 204 / 空响应是合法的成功返回（个别接口无 body）。
                if not response.content:
                    return {}
                try:
                    parsed = response.json()
                except ValueError:
                    # 响应不是 JSON：可能被中断或被中间设备改写，换下一个候选。
                    self._endpoint_pool.mark_failed(endpoint.base_url)
                    last_failure = LicenseClientError('授权服务器响应格式无效。')
                    continue
                if not isinstance(parsed, dict):
                    # 顶层不是字典就无法当作信封处理，同样换候选。
                    self._endpoint_pool.mark_failed(endpoint.base_url)
                    last_failure = LicenseClientError('授权服务器响应格式无效。')
                    continue
                try:
                    parsed = self.transport_cipher.decrypt_response(parsed, path, response_key)
                except LicenseCryptoError as error:
                    # 解密失败可能是该端点用了另一把密钥：拉黑并换一个，
                    # 而不是立刻判成「服务端拒绝」（那会让用户看到误导性提示）。
                    self._endpoint_pool.mark_failed(endpoint.base_url)
                    last_failure = LicenseClientError(str(error))
                    continue
                return parsed
        # 所有候选都试过：抛出最后一次失败，保留 status_code 等信息。
        raise last_failure or LicenseClientError('无法连接授权服务器。')

    @staticmethod
    def _parse_error_response(response: httpx.Response) -> tuple[str, str | None]:
        """从错误响应取出 detail 与可选业务 code。

        协议：``{"detail": "...", "code": "REVOKED", "revoked": true}``。
        ``revoked: true`` 且无 code 时补 ``REVOKED``（现行字段，非旧版 detail 兼容）。
        """
        try:
            # 非 JSON 或顶层不是字典时统一回落到通用文案，
            # 绝不把原始 body 直接透传给用户。
            parsed = response.json()
            if not isinstance(parsed, dict):
                return '授权服务器拒绝请求。', None
            detail = str(parsed.get('detail', '授权服务器拒绝请求。'))
            code = parsed.get('code')
            if isinstance(code, str) and code.strip():
                return detail, code.strip()
            if parsed.get('revoked') is True:
                return detail, 'REVOKED'
            return detail, None
        except ValueError:
            return '授权服务器拒绝请求。', None

    def _apply_response(self, response: dict, *, activation_code_hint: str | None = None, activation_code: str | None = None, email: str | None = None) -> dict:
        """把一次成功的授权响应落库（验签通过后才算成功）。

        参数:
            response: 解密后的响应字典，须含 signedLease。
            activation_code_hint: 激活码脱敏提示（保留前段，截掉后 9 位）。
            activation_code: 完整激活码，加密后落库，供自动重新激活使用。
            email: 授权邮箱，自动重新激活时需要再次提交。
        """
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
                # 服务端签发时间明显超前于本机 → 本机时钟偏慢或服务端异常；
                # 此时租约的到期判断不可信，先要求校准时间而不是写入可用状态。
                state.status = 'CLOCK_ROLLBACK'
                state.last_error = '授权服务器时间明显晚于本机时间，请先校准系统时间。'
                database.commit()
                self._record_status(state.status, state.last_error)
                raise LicenseClientError(state.last_error)
            if expires_at <= now:
                # 服务端返回一份已过期的租约：不写入可用状态，
                # 避免刚「激活成功」就拿到一个当场失效的凭证。
                state.status = 'LEASE_EXPIRED'
                state.last_error = '授权服务器返回了已到期租约。'
                database.commit()
                self._record_status(state.status, state.last_error)
                raise LicenseClientError(state.last_error)
            if payload['activationCodeId'] == state.license_id and lease_sequence <= state.lease_sequence and state.signed_lease != signed_lease:
                # 序号防重放：同一授权下序号必须递增。只有「内容完全相同」才允许相等
                # （网络重试拿到同一响应属于正常情况，换个内容就是重放攻击）。
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
            # 权益列表必须是字符串数组：类型不对说明响应被篡改或服务端版本不兼容，
            # 宁可整体置为 INVALID，也不要放行一份看不懂的权益。
            if not isinstance(features, list) or not all(isinstance(item, str) for item in features):
                state.status = 'INVALID'
                state.last_error = '授权服务器返回的权益列表无效。'
                database.commit()
                self._record_status(state.status, state.last_error)
                raise LicenseClientError(state.last_error)
            # 紧凑序列化存库：内容由验签通过的租约决定，不需要可读性。
            state.feature_set = json.dumps(features, ensure_ascii=False, separators=(',', ':'))
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
                # 完整激活码加密落库：它是自动重新激活的唯一凭证。
                state.encrypted_activation_code = self.cipher.encrypt(activation_code)
            if email:
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
            return self._payload(state)

    async def activate(self, activation_code: str, email: str | None = None) -> dict:
        """用激活码激活当前安装。

        参数:
            activation_code: 用户输入的激活码。
            email: 购买时使用的邮箱；授权服务要求邮箱与激活码匹配。

        返回:
            激活成功后的状态字典。

        异常:
            LicenseClientError: 邮箱缺失（422）、激活码被拒或租约校验失败。
        """
        # 同步查库（可能新建那一行状态）放线程池，别占着事件循环（B4）。
        instance_id = await asyncio.to_thread(self._activation_instance_id)
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

    async def reactivate(self) -> dict:
        '''用户主动触发的「重新激活」，成功后返回与 ``/license/activate`` 同构的状态。

        会话与租约恢复凭证双双过期后，客户端会卡在「心跳 401 → 恢复 401」的循环里：
        本地租约尚未到期时状态是 ``CONNECTION_WARNING``（功能仍可用），到期后变成
        ``LEASE_EXPIRED`` 被门禁拦死，而这条路径不会自己恢复。这里给用户一个显式
        出口，按代价从低到高尝试：

        1. 一次心跳 —— ``_heartbeat_unlocked`` 会在会话失效时自动回落到恢复凭证，
           所以这一步同时覆盖「网络抖动」与「只有会话过期」两种情况，且不动本地凭证。
        2. 用本地加密保存的激活码重跑 ``/v2/activate`` —— 授权服务对「已绑定当前
           安装」的授权是幂等放行的（``ensure_binding`` 命中 ``already_bound_here``
           时不消耗解绑冷却），会重新签发会话与恢复凭证。

        确认吊销（403 + ``code=REVOKED`` / 吊销短语）不属于可自愈的故障：那种情况下本地授权已被清空，
        且自动重激活会把厂商刚释放的绑定悄悄抢回来，因此直接上抛由用户处理。
        本机没有可用激活凭证时返回 ``MANUAL_ACTIVATION_REQUIRED``，前端据此展开
        激活表单让用户手动输入。
        '''
        # 同步查库放线程池（B4）：授权路径上的每一段同步读写都不留在事件循环里。
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

    async def heartbeat(self) -> dict:
        """对外的心跳入口：串行化，避免与恢复流程并发续租。"""
        async with self._heartbeat_lock:
            return await self._heartbeat_unlocked()

    async def _heartbeat_unlocked(self) -> dict:
        """心跳的实际实现（调用方须已持有 _heartbeat_lock）。

        优先用会话令牌续租；没有会话令牌或服务端回 401 时回落到恢复令牌；
        确认吊销则清空本地授权；其余失败只降级状态（保留租约，等待重试）。
        """
        # 同步查库放线程池（B4）：心跳是请求路径也会 await 的（confirm_binding /
        # activate / 页面门禁），不能让这段读写占着事件循环。
        (encrypted, lease_sequence, instance_id) = await asyncio.to_thread(self._heartbeat_credentials)
        # 没有会话令牌说明从未激活成功或刚被清空，直接走恢复流程。
        if not encrypted:
            return await self._recover_unlocked()
        # 先赋空串：解密失败时错误路径仍能安全地把 session_token 当作敏感值抹除。
        session_token = ''
        try:
            session_token = self.cipher.decrypt(encrypted)
            response = await self._post('/v2/heartbeat', {
                'sessionToken': session_token,
                # 回传本地序号：服务端据此判断客户端是否落后于最新租约。
                'leaseSequence': lease_sequence,
                # 回传本机实例 ID：服务端据此拒绝「不属于当前实例」的旧会话。
                # 少了这一项，管理员刚做的解绑对旧设备等于没生效 —— 另一台设备重新
                # 激活会复用同一行 DeviceBinding 并改写 instance_id，而旧设备的
                # session token 仍指向该行，于是能一直续租下去。
                'instanceId': instance_id,
                'clientVersion': self.settings.version,
                'nonce': secrets.token_urlsafe(24)})
            result = await asyncio.to_thread(self._apply_response, response)
            self._record_online_success('心跳')
            return result
        except (LicenseClientError, LicenseCryptoError) as error:
            self._record_failure('心跳', error, sensitive_values=(session_token, encrypted))
            # 401 视为会话过期：立刻用恢复令牌换新会话，对调用方透明。
            if isinstance(error, LicenseClientError) and error.status_code == 401:
                return await self._recover_unlocked()
            # 确认吊销：清空本地授权后原样上抛（保留状态码与 code，reactivate 据此判定不可自愈）。
            if isinstance(error, LicenseClientError) and error.is_confirmed_revocation:
                await asyncio.to_thread(self._mark_revoked, str(error))
                raise LicenseClientError(str(error), status_code=error.status_code, code=error.code) from error
            # 其它失败（网络不可达、5xx）：按租约剩余有效期降级为
            # CONNECTION_WARNING 或 LEASE_EXPIRED，等下一轮心跳重试。
            await asyncio.to_thread(self._mark_failure, str(error))
            raise LicenseClientError(str(error), status_code=getattr(error, 'status_code', None), code=getattr(error, 'code', None)) from error

    async def recover(self) -> dict:
        """对外恢复入口：串行化，与心跳共用同一把锁。"""
        async with self._heartbeat_lock:
            return await self._recover_unlocked()

    async def _recover_unlocked(self) -> dict:
        """用恢复令牌重新换取租约（调用方须已持有 _heartbeat_lock）。"""
        (encrypted, instance_id, lease_sequence) = await asyncio.to_thread(self._recovery_credentials)
        if not encrypted:
            # 连恢复令牌都没有：本地已无任何可用凭证，只能让用户重新激活。
            self._record_failure('租约恢复', '没有可用的租约恢复凭证，请重新激活。')
            raise LicenseClientError('没有可用的租约恢复凭证，请重新激活。')
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
            await asyncio.to_thread(self._mark_failure, str(error))
            raise LicenseClientError(str(error), status_code=getattr(error, 'status_code', None), code=getattr(error, 'code', None)) from error

    def _mark_revoked(self, message: str) -> None:
        """确认吊销后的清理：清空所有本地凭证并把状态置为 REVOKED。

        清得彻底是有意的：残留的租约或令牌会让下次启动仍尝试用已吊销的授权续租，
        而自动重新激活还可能把厂商刚释放的绑定悄悄抢回来。
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
        # 唤醒心跳循环重算等待（此时无授权，会转入空转等待）。
        self._schedule_changed.set()

    def _mark_failure(self, message: str) -> None:
        """非吊销类失败：按租约剩余有效期把状态降级为「连接异常」或「已到期」。"""
        with self.database.session_factory() as database:
            state = self._state(database)
            expires = aware(state.lease_expires_at)
            # 租约还没到期就只是「联系不上服务器」，功能继续可用；
            # 已经到期则必须拦截，等恢复或重新激活。
            state.status = 'CONNECTION_WARNING' if expires and expires > datetime.now(timezone.utc) else 'LEASE_EXPIRED'
            # 同样截断，避免超长错误进库。
            state.last_error = message[:1000]
            database.commit()
            # 启动确认未完成时对外继续显示「等待启动联网验证」，
            # 不因一次失败就改变门禁语义。
            self._record_status('STARTUP_VALIDATION_REQUIRED' if self._startup_validation_pending else state.status)

    def _clear_startup_validation(self) -> None:
        """联网确认失败但非确认吊销时，把判定权交回离线验签。

        状态按本地租约的剩余有效期重算，而不是沿用可能已过期的旧值：
        未过期 → ``CONNECTION_WARNING``（门禁放行，直到租约到期）；
        已过期 → ``LEASE_EXPIRED``（拦截，等待恢复或重新激活）。
        真正生效的仍是 :meth:`_verified_access` 的离线验签结果，
        因此这条路径不会放行被篡改或实例不符的租约。
        """
        self._startup_validation_pending = False
        with self.database.session_factory() as database:
            state = self._state(database)
            if state.license_id and state.signed_lease:
                expires = aware(state.lease_expires_at)
                state.status = 'CONNECTION_WARNING' if expires and expires > datetime.now(timezone.utc) else 'LEASE_EXPIRED'
                database.commit()
            self._record_status(state.status)
        self._schedule_changed.set()

    @staticmethod
    def _heartbeat_wait_seconds(state: LicenseState, now: datetime | None = None) -> float | None:
        """算出心跳循环下一次该等多久。

        返回:
            等待秒数；未激活时返回 None（调用方据此跳过本轮）。

        规则:
            租约已到期 → 固定 30 秒重试，尽快拿回可用租约；
            否则取 min(心跳间隔, 距到期剩余时间)，保证租约一到点就被处理。
        """
        if not state.license_id:
            # 未激活无需心跳。
            return None
        if state.status == 'LEASE_EXPIRED':
            return float(EXPIRED_LEASE_RETRY_SECONDS)
        # 再兜一次 30 秒下限：库里的值可能被手工改小。
        interval = float(max(30, state.heartbeat_interval_seconds))
        expires = aware(state.lease_expires_at)
        if expires is None:
            return interval
        remaining = (expires - (now or datetime.now(timezone.utc))).total_seconds()
        # 不允许负等待；到期时间比间隔更近时提前唤醒。
        return max(0, min(interval, remaining))

    def _heartbeat_wait(self) -> float | None:
        """读库算出本轮该等多久（同步，供心跳循环放线程池）。"""
        with self.database.session_factory() as database:
            return self._heartbeat_wait_seconds(self._state(database))

    def _due_state(self) -> tuple[bool, str, bool]:
        """超时醒来后重新读一次状态（同步，供心跳循环放线程池）。

        返回: (是否仍有授权, 状态, 租约是否已到期)。
        """
        with self.database.session_factory() as database:
            state = self._state(database)
            expires = aware(state.lease_expires_at)
            return (bool(state.license_id), state.status, bool(expires and expires <= datetime.now(timezone.utc)))

    async def _heartbeat_loop(self) -> None:
        """心跳主循环：等一个「计划变更」或超时，然后续租或恢复。

        每轮都重新读库计算等待时间，因此激活、停用、租约变化都能立刻生效。
        """
        while not self._stop.is_set():
            # 先清后等：清掉上一轮遗留的信号，避免本轮空转。
            self._schedule_changed.clear()
            # 每轮都要读库，同样放线程池：这是常驻后台任务，占住事件循环就是
            # 让所有请求为它让路（B4）。
            wait_seconds = await asyncio.to_thread(self._heartbeat_wait)
            try:
                # 用事件等待代替 sleep：激活成功后能立刻打断长等待。
                # wait_seconds 为 None 表示一直等到有变更为止。
                await asyncio.wait_for(self._schedule_changed.wait(), timeout=wait_seconds)
            except TimeoutError:
                # 超时才是「该续租了」；被事件唤醒则说明计划已变，直接进入下一轮重算。
                (has_license, status, lease_expired) = await asyncio.to_thread(self._due_state)
                # 状态可能在等待期间被清空（吊销 / 重新激活），此时无需联网。
                if not has_license:
                    continue
                try:
                    if status == 'LEASE_EXPIRED' or lease_expired:
                        # 租约已到期：会话很可能也失效了，直接用恢复令牌更稳。
                        await self.recover()
                    else:
                        await self.heartbeat()
                except LicenseClientError:
                    # 失败已在 *_unlocked 内部记录并降级状态，这里只等下一轮重试。
                    continue
                except Exception as error:
                    # 非授权异常（例如编码 bug）不再吞掉：记日志并让任务结束，
                    # 否则会变成无声的死循环、一直刷错误日志。
                    self._log_event('error', f'''授权自动续租任务意外停止（{type(error).__name__}）。''')
                    raise
                if self._stop.is_set():
                    break

    def _payload(self, state: LicenseState) -> dict:
        """组装对外状态字典（字段名与前端约定死，逐字不可改）。

        这里会在落库状态之上做一次实时修正：时钟回拨、租约到期、启动联网确认
        未完成都会覆盖 effective_status，保证前端看到的与门禁口径一致。
        """
        # 先复制库里的值再做实时修正：修正结果不写库，
        # 避免把「与当前时间相关的瞬时判断」固化成持久状态。
        effective_status = state.status
        effective_error = state.last_error
        now = datetime.now(timezone.utc)
        last_verified = aware(state.last_verified_at)
        lease_expires = aware(state.lease_expires_at)
        if last_verified and now + timedelta(seconds=self.settings.license_clock_skew_seconds) < last_verified:
            # 时钟回拨时租约到期判断不可信，直接覆盖为 CLOCK_ROLLBACK。
            effective_status = 'CLOCK_ROLLBACK'
            effective_error = '检测到系统时间回拨，请校准系统时间后重新验证授权。'
        elif lease_expires and lease_expires <= now and effective_status in frozenset({'ACTIVE', 'CONNECTION_WARNING'}):
            # 库里还写着 ACTIVE，但租约按实时时间已经到期：覆盖为 LEASE_EXPIRED，
            # 避免前端显示「正常」而实际请求被门禁拦下。
            effective_status = 'LEASE_EXPIRED'
            if not effective_error:
                effective_error = '授权租约已到期。'
        if self.settings.license_required and self._startup_validation_pending:
            # 服务重启后尚未联网确认：对外显示等待验证（仅在配置要求授权时）。
            effective_status = 'STARTUP_VALIDATION_REQUIRED'
            effective_error = '服务重启后必须先连接授权后台确认最新租约；联网成功后会自动恢复。'
        self._record_status(effective_status)
        # 权限口径与状态字段解耦：allowed 一律由离线验签现算，不读 status。
        allowed = self._verified_access(state)
        editor_allowed = self._verified_access(state, 'editor')
        try:
            stored_features = json.loads(state.feature_set or '[]')
        except json.JSONDecodeError:
            # 库里存的是 JSON 文本，损坏时按空列表处理而不是让整个状态接口报错。
            stored_features = []
        if not isinstance(stored_features, list):
            stored_features = []
        if 'all' in stored_features:
            # 'all' 是服务端的合集简写，在这里展开成 BASE_FEATURES，
            # 前端不必硬编码这份清单。
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
                    # 类型与到期时间容错处理：缺失或类型不对时退化为默认值，
                    # 不让个别脏条目把整个产品列表丢掉。
                    product_type = item.get('type') if isinstance(item.get('type'), str) else 'module'
                    expires_at = item.get('expiresAt') if isinstance(item.get('expiresAt'), str) else None
                    visible_products.append({
                        'name': product_name,
                        'type': product_type,
                        'expiresAt': expires_at})
        if state.license_id and not visible_products:
            # 有授权但没有产品明细时兜底展示「基础版」。
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
            'edition': 'full' if state.license_id else None,
            # 未激活时一律返回空权益与空产品，避免前端误判为已授权。
            'features': visible_features if state.license_id else [],
            # featureAccess 额外乘上租约验签结果：即使权益列表里有该能力，
            # 租约不合法（被改、过期、实例不符）也不放行。
            'featureAccess': {
                'editor': bool(state.license_id and 'editor' in visible_features and editor_allowed),
                'interaction3d': bool(state.license_id and 'module.3d_interaction' in visible_features and self._verified_access(state, 'module.3d_interaction'))},
            'products': visible_products if state.license_id else [],
            # 心跳间隔（秒），前端据此展示刷新节奏。
            'heartbeatIn': state.heartbeat_interval_seconds,
            'leaseIssuedAt': aware(state.lease_issued_at),
            'leaseExpiresAt': aware(state.lease_expires_at),
            'lastHeartbeatAt': aware(state.last_heartbeat_at),
            'lastVerifiedAt': aware(state.last_verified_at),
            'lastError': effective_error}

    def status(self) -> dict:
        """取当前状态（开一个短事务，读单行状态后组装成字典）。"""
        with self.database.session_factory() as database:
            return self._payload(self._state(database))

    def _verified_access(self, state: LicenseState, feature: str | None = None) -> bool:
        """重新校验签名租约，而不是信任可被改写的 SQLite 状态字段。

        参数:
            state: 当前授权状态行。
            feature: 要判定的能力码；None 表示只判「授权整体是否可用」。

        返回:
            是否放行。任何一步校验失败都返回 False，并记录一条中文原因。
        """
        if not self.settings.license_required:
            # 关闭授权校验的部署形态直接放行。
            return True
        if self._startup_validation_pending or state.status not in frozenset({'ACTIVE', 'CONNECTION_WARNING'}):
            # 启动确认未完成，或状态不在可放行集合内时短路，避免无谓的验签开销。
            return False
        if not (state.signed_lease and state.license_id and state.lease_id and state.session_id):
            # 四个字段缺一不可：租约本身、授权标识、租约标识、会话标识，
            # 任一缺失都说明这条记录不完整，不能据此放行。
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
            self._record_failure('本地校验', '授权租约已到期。')
            return False
        # 逐字段比对库里的关联标识与租约载荷：
        # 不一致说明记录被改过，或租约被换成了另一份。
        if payload['activationCodeId'] != state.license_id:
            self._record_failure('本地校验', '本地授权标识与签名租约不一致。')
            return False
        if payload['leaseId'] != state.lease_id or payload['sessionId'] != state.session_id:
            self._record_failure('本地校验', '本地租约或会话标识与签名租约不一致。')
            return False
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
            # 细粒度权益走 entitlements：逐条检查 code 与过期时间，
            # 已过期的条目不参与判定。
            active_features = set()
            for entitlement in entitlements:
                if not isinstance(entitlement, dict) or not isinstance(entitlement.get('code'), str):
                    continue
                expires_at = entitlement.get('expiresAt')
                try:
                    if expires_at and parse_timestamp(expires_at) <= now:
                        continue
                except (LicenseCryptoError, TypeError, ValueError):
                    # 时间格式非法的条目直接跳过（视为未授权），
                    # 不让一条脏数据把整次判定打挂。
                    continue
                active_features.add(entitlement['code'])
            return feature in active_features
        # 老租约没有 entitlements 段：退回只看 features 列表。
        return feature in features

    def allows(self, feature: str | None = None, *, database=None) -> bool:
        """对外门禁入口：判断当前安装是否有权使用某能力。

        参数:
            feature: 能力码；None 表示只判授权是否整体可用。
            database: 可选，复用调用方已开启的会话（避免同一次请求里重复开连接）。

        返回:
            是否放行。
        """
        if database is not None:
            # 复用外部会话，但仍要核对实例 ID：换了数据卷后不能沿用旧判定。
            state = database.scalar(select(LicenseState).limit(1))
            # 实例 ID 与本地不一致时直接拒绝，连验签都不必做 ——
            # 那份租约必然不属于当前安装。
            if state is None or state.instance_id != self._instance_id():
                return False
            return self._verified_access(state, feature)
        with self.database.session_factory() as database:
            return self._verified_access(self._state(database), feature)
