"""授权客户端：激活、心跳续租、租约恢复与能力门禁。

激活换回签名租约 + 会话/恢复令牌（加密落库）；心跳按单调递增的 leaseSequence
续租（不增即拒绝，防重放）；会话 401 时用恢复令牌换新租约，两者都失效才要求
重新激活。门禁每次都对签名租约离线验签，不信任库里的 status。

网络约定：请求体经 LicenseTransportCipher 加密，端点按批次依次尝试并拉黑失败地址。
"""
from __future__ import annotations

import asyncio
import json
import os
import secrets
import threading
import time
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone

import httpx
from sqlalchemy import select

from ..core.canonical_json import canonical_json
from ..config import Settings
from ..core.database import Database
from ..observability.global_log import GlobalLogStore
from ..core.models import LicenseState
from ..core.time_utils import ensure_aware
from .crypto import LeaseVerifier, LicenseCryptoError, LicenseTransportCipher, SecretCipher, parse_timestamp
from .endpoints import LicenseEndpointPool
from .hardware import hardware_instance_id
from .process_lock import LicenseProcessLock
from .trust import verify_license_trust_anchors

#: 服务端结构化吊销码；仅凭 ``code`` / ``revoked`` 判定「确认吊销」。
CONFIRMED_REVOCATION_CODES = frozenset({'REVOKED', 'LICENSE_REVOKED'})
#: 服务端只发中文文案、不发结构化 code 时的吊销文案。仅作 ``code`` 之外的兜底：
#: 有的部署版本（或前置网关）会把 ``code`` 吃掉，只留 detail，漏掉这几句会让已吊销的
#: 安装被当成「网络故障」一直重试，用户看到「正在重试」但永远不会恢复。
CONFIRMED_REVOCATION_MESSAGES = (
    '实例绑定已停用',
    '客户授权或激活码已停用',
    '客户、激活码或实例绑定已停用',
    '商品授权有效期已结束')

# 自动重试的退避阶梯（秒）：失败次数越多等得越久，第 5 次之后固定 300 秒。
# 阶梯而不是固定间隔，是因为「刚断网」和「服务端长时间故障」要区分对待：
# 前者几秒内就能恢复，等 5 分钟会让用户以为程序坏了；后者密集重打只会把限流窗口填满。
RETRY_DELAYS = (2, 5, 10, 30, 60, 300)
#: 终态集合：落到这些状态就不再自动重试，必须有人介入（重新激活 / 校准时间 / 检查安装数据）。
#: 判定用「集合」而不是逐处 if，是因为「哪些状态该停」会被多处引用，漏一处就会出现
#: 「明明要人工处理，后台还在无限重试」的静默错配。
TERMINAL_STATES = frozenset({
    'INVALID',
    'REVOKED',
    'DEACTIVATED',
    'CLOCK_ROLLBACK',
    'REMOTE_REJECTED',
    'INSTANCE_MISMATCH',
    'RECOVERY_REQUIRED'})

#: 会要求用户手动重新激活的错误码（前端据此隐藏「重试」并引导去激活页）。
REAUTH_REQUIRED = 'LICENSE_REAUTH_REQUIRED'
#: 重试被节流（点得太快）：与「需要人工介入」不同，稍等即可再次尝试。
RETRY_THROTTLED = 'LICENSE_RETRY_THROTTLED'
# 手动重试的最小间隔（秒）。存在的理由是「连点」：按钮每点一次都会触发一轮真实的
# 令牌轮换，没有任何间隔的话，用户因为着急而连点会把授权服务的限流窗口直接填满。
MANUAL_RETRY_THROTTLE_SECONDS = 2.0


class LicenseClientError(RuntimeError):
    """授权客户端对外抛出的统一错误。

    中文文案可直接展示给用户；status_code 与 code 供调用方（路由层 / 前端）
    区分「临时失败」「需要人工重新激活」等情形。
    """

    def __init__(
        self,
        message: str,
        *,
        status_code: int | None = None,
        code: str | None = None,
        retry_after_seconds: float | None = None,
    ) -> None:
        """参数:
            code: 业务错误码，前端据此切换界面（如 REVOKED / MANUAL_ACTIVATION_REQUIRED）。
            retry_after_seconds: 仅 429 上有值，来自 ``Retry-After`` 的剩余秒数，调用方据此冷却。
        """
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.retry_after_seconds = retry_after_seconds

    @property
    def is_rate_limited(self) -> bool:
        """是否被授权服务的限流挡下（429）。

        429 不能像其它失败那样降级本地状态：它只说明「这一小时打多了」，对绑定是否
        有效一个字都没说，按普通失败处理会把过期租约翻成 LEASE_EXPIRED 并锁死编辑器。
        """
        return self.status_code == 429

    @property
    def is_confirmed_revocation(self) -> bool:
        """仅在授权服务「确认吊销」时返回 True。

        401/403 也可能是会话过期或同步竞态，此时必须保留本地授权以便自动重试恢复。
        判据两条，任一命中即算确认吊销：
        - 结构化 ``code``（``REVOKED`` / ``LICENSE_REVOKED``），最可靠；
        - 中文 detail 命中吊销文案（``CONFIRMED_REVOCATION_MESSAGES``），
          兜住服务端没带 ``code`` 的版本 —— 漏掉它会把已吊销当成网络故障无限重试。
        """
        # 只有 401/403 才可能是吊销；网络错误、5xx 一律不算。
        if self.status_code not in frozenset({401, 403}):
            return False
        if self.code in CONFIRMED_REVOCATION_CODES:
            return True
        detail = str(self)
        return any(message in detail for message in CONFIRMED_REVOCATION_MESSAGES)


# 租约已到期时的重试间隔：比常规心跳更密，尽量缩短功能不可用的窗口。
EXPIRED_LEASE_RETRY_SECONDS = 30
#: 本机拿不出可用激活凭证时返回的错误码，前端据此展开手动激活表单。
MANUAL_ACTIVATION_REQUIRED = 'LICENSE_ACTIVATION_REQUIRED'
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


class LicenseService:
    """授权服务客户端。

    start() 读库做离线校验、必要时联网确认后拉起心跳循环，stop() 停循环；状态全部
    落在单行 LicenseState 表里，进程重启后只靠「签名租约 + 实例 ID」恢复判定。
    """

    def __init__(self, settings: Settings, database: Database, transport: httpx.AsyncBaseTransport | None, *, endpoint_pool: LicenseEndpointPool | None = None, event_log: GlobalLogStore | None = None) -> None:
        """参数:
            transport: httpx 传输层，测试可注入 MockTransport。
            event_log: 全局日志存储，授权状态变化写入「授权」分类事件。
        """
        self.settings = settings
        self.database = database
        self.event_log = event_log
        # 启动期先钉死信任锚：指纹错了立刻失败并给出密钥准备指引，不拖到首次激活。
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

    #: 打开编辑器等入口强制联网确认，状态轮询走节流。
    #: 取 60 秒：服务端额度按「300 秒心跳 = 12 次/小时」定，60 秒把稳态压到同量级。
    BINDING_CONFIRM_THROTTLE_SECONDS = 60.0

    def _rate_limit_remaining(self) -> float:
        """冷却还剩多少秒（单调时钟）；不在冷却里返回 0。"""
        return max(0.0, self._rate_limited_until - time.monotonic())

    def _note_rate_limit(self, error: LicenseClientError) -> None:
        """记下这次 429 的冷却。

        服务端没回 ``Retry-After`` 时兜底 120 秒：限流器是小时窗口，但不必等满一小时 ——
        只要不再持续重打，窗口自己会滑动。
        """
        seconds = error.retry_after_seconds
        self._rate_limited_until = time.monotonic() + (seconds if seconds else 120.0)

    def _binding_needs_confirm(self) -> bool:
        """读本地凭证判断这次调用是否真需要联网（同步，调用方放进工作线程）。

        条件：已激活、有签名租约、状态处在「心跳还在续租」的那几个值上；终态不需联网。
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

        打开编辑器、读授权状态前调用，避免解绑后要等一个心跳间隔才跳激活页；网络失败
        保留离线租约，仅「确认吊销」清空。429 既不算吊销也不算网络失败，冷却期内返回。
        """
        if not self.settings.license_required or not self._endpoint_pool.configured:
            return
        # 冷却期内不联网（状态轮询正是触发限流的那股流量）；放在节流判定之前，否则冷却结束后还要再等一个窗口。
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
            level = 'success' if status == 'ACTIVE' else 'info' if status in frozenset({'DEACTIVATED', 'UNACTIVATED'}) else 'warning'
            if status in frozenset({'INVALID', 'REVOKED', 'CLOCK_ROLLBACK', 'INSTANCE_MISMATCH', 'RECOVERY_REQUIRED', 'REMOTE_REJECTED'}):
                level = 'error'
            self._log_event(level, message)

    def _record_failure(self, operation: str, error: Exception | str, *, sensitive_values: tuple[str, ...] = ()) -> None:
        """记录一次失败，并按「同因去重」策略决定是否写日志。"""
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
        # 联网通了，限流冷却即失效；留着它会让心跳循环多睡一轮、confirm_binding 少确认一次。
        self._rate_limited_until = 0.0
        # 重试计划一并归零：失败计数、错误码、计划时刻描述的都只是「上一次失败」，
        # 成功后还留着，下一次偶发失败就会从一个很高的退避档开始。
        self._failures = 0
        self._error_code = None
        self._next_attempt = None
        # 成功代数自增：正在飞行的手动重试据此得知「本轮期间已经成功了，不必再来一轮」。
        self._success_generation += 1
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

    @asynccontextmanager
    async def _credential_operation(self):
        """凭证读写的临界区：串行化续租，并保证进程内只有一个凭证写入者。

        两层锁各有分工，缺一不可：
        - ``_heartbeat_lock`` 管**本进程内**的并发（手动重试 vs 心跳 vs 恢复）；
        - 进程锁管**跨进程**（同机被误启动两份服务）。进程锁通常在 start() 就已长期持有，
          此时这里只是复用；若本实例不是长期持有者，就临时加锁、用完即放。
        """
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

    def _next_retry_delay(self, http_status: int | None) -> float:
        """按失败次数取退避间隔（秒）。

        401 固定 2 秒：它多半是会话/恢复令牌轮换的瞬时竞态，重试越快恢复越快；
        其余按 RETRY_DELAYS 递增，次数超出阶梯长度就停在最后一档。
        """
        if http_status == 401:
            return 2.0
        return float(RETRY_DELAYS[min(self._failures - 1, len(RETRY_DELAYS) - 1)])

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

    # 以下同步方法只做查库 / 落库，供 async 调用方用 asyncio.to_thread 转交：同步会话跑在事件循环上会阻塞所有请求。
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

        返回: (加密的会话令牌, 本地租约序号, 实例 ID)。实例 ID 必须回传：服务端靠它
        识别「同一张授权已被另一台设备重新激活」，少了它解绑对旧设备等于没生效。
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
            # 三者同时成立才要求联网确认：配置要求授权、已有激活记录、本地有签名租约。纯离线部署不受影响。
            # 再排除终态：已吊销 / 校验无效 / 时间异常都不是「联网就能确认」的事，
            # 把它们算成待确认会让每次启动都白等一轮联网，还会盖掉本该显示的失败原因。
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

        副作用: 可能修改数据库状态字段；会长期持有数据目录的进程锁；会创建后台心跳任务。
        异常:
            RuntimeError: 同一数据目录已有实例在运行（进程锁抢不到）。
        """
        # 已在运行就直接返回：重复 start() 会拉起第二个心跳循环，两条循环并发续租。
        if self._task is not None and not self._task.done():
            return
        # 抢进程锁必须在校验之前：抢不到说明同一份 data/ 已有一个实例在跑，此时两条心跳会
        # 各自续租出并行租约，先写的那份被判成重放而作废。让它明确失败，而不是进入「半个实例」状态。
        self._process_lock.acquire()
        # 离线校验要读写 LicenseState：放线程池，别在事件循环里做同步查库。
        self._startup_validation_pending = await asyncio.to_thread(self._begin_startup_validation)
        # 有待确认就先排一次「立刻重试」：心跳循环据此不必等一个完整间隔才开始恢复。
        if self._startup_validation_pending:
            self._next_attempt = time.monotonic()
        # 没配置端点就没法联网确认，直接跳过（保持离线验签给出的判定）。
        if self._startup_validation_pending and self._endpoint_pool.configured:
            try:
                await self.recover()
            except LicenseClientError as error:
                # 启动联网确认失败：确认吊销已由 recover() 清空本地授权，必须保持拦截；
                # 其余失败不锁死有效租约，交回离线验签判定（未过期放行，过期拦截）。
                # 心跳循环会持续重试，服务器恢复后自动续租回到 ACTIVE。
                if not error.is_confirmed_revocation:
                    await asyncio.to_thread(self._clear_startup_validation)
        if self._endpoint_pool.configured:
            # 复位停信号：先 stop() 再 start() 时要能重新工作。
            self._stop.clear()
            # 具名任务便于在调试器与日志里辨认。
            self._task = asyncio.create_task(self._heartbeat_loop(), name='license-heartbeat')

    async def stop(self) -> None:
        """停止心跳循环、取消在飞的手动重试，并释放进程锁。"""
        self._stop.set()
        # 两个事件都要 set：心跳循环可能正卡在 wait 上，必须被唤醒才能看到停信号。
        self._schedule_changed.set()
        # 手动重试也要收掉：它可能正卡在一次网络请求上，不取消就会在 stop() 之后继续
        # 持有凭证锁，甚至把状态写回一个已经停下来的服务。
        if self._retry_task is not None and not self._retry_task.done():
            self._retry_task.cancel()
        tasks = [task for task in (self._task, self._retry_task) if task is not None]
        if tasks:
            # return_exceptions：取消会以 CancelledError 收尾，不该据此让 stop() 失败。
            await asyncio.gather(*tasks, return_exceptions=True)
        # 置空句柄，避免重复 stop() 时 await 一个已结束的任务。
        self._task = None
        self._retry_task = None
        # 最后才释放进程锁：要等任务真的停下，否则新实例可能在旧实例还在写凭证时启动。
        self._process_lock.release()

    def _lease_expired(self, expires_at: datetime, *, now: datetime) -> bool:
        """租约是否**确实**已到期（含时钟偏移容差）。

        本机时钟快几秒就会在租约仍可用时提前判过期，而心跳间隔是分钟级，会造出
        「服务端认为有效、本机完全受限」的窗口；代价是多用 ``license_clock_skew_seconds`` 秒。
        """
        return expires_at <= now - timedelta(seconds=self.settings.license_clock_skew_seconds)

    def _lease_sequence_ok(self, payload_sequence: int, state: LicenseState) -> bool:
        """租约序号判据：手上这份租约不能比已经记下的更旧。

        防重放要求「不比备忘更旧」；若写成完全相等，任何让两个字段不同步的状态
        （库被回滚、行被外部修过）都会变成终局 INVALID。更大的值回写成新备忘（自愈）。
        """
        if payload_sequence < state.lease_sequence:
            return False
        if payload_sequence > state.lease_sequence:
            state.lease_sequence = payload_sequence
        return True

    def _validate_saved_state(self, state: LicenseState, database) -> None:
        """启动时的离线校验：只信签名租约，不信库里的 status。

        校验顺序为验签 → 序号不比备忘更旧 → 到期时间 → 时钟回拨，
        任一步失败都写回明确状态与中文原因，供前端展示。
        """
        # 没有租约，或已处于终态（停用/未激活）时无需校验。
        if not state.signed_lease or state.status in frozenset({'DEACTIVATED', 'UNACTIVATED'}):
            return
        try:
            payload = self.verifier.verify(state.signed_lease, state.instance_id)
            # 序号比备忘更旧：库里的记录被改过，或这份租约是被换下来的旧货（重放）。
            if not self._lease_sequence_ok(payload['leaseSequence'], state):
                raise LicenseCryptoError('本地签名租约的序号比记录更旧，授权记录可能被回滚或替换过。')
            expires = parse_timestamp(payload['expiresAt'])
            now = datetime.now(timezone.utc)
            last_verified = ensure_aware(state.last_verified_at)
            # 时钟回拨检测：本机时间比上次校验时间还早，会让已过期的租约「复活」，必须拦下。
            if last_verified and now + timedelta(seconds=self.settings.license_clock_skew_seconds) < last_verified:
                state.status = 'CLOCK_ROLLBACK'
                state.last_error = '检测到系统时间回拨，请校准系统时间后重新验证授权。'
            else:
                # 验签通过后按租约到期时间给出离线结论（含时钟偏移容差）。
                state.status = 'LEASE_EXPIRED' if self._lease_expired(expires, now=now) else 'ACTIVE'
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

        未配置端点或全部候选失败抛 ``LicenseClientError``；4xx 业务拒绝直接抛出，不重试。
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
                    raise LicenseClientError(
                        detail,
                        status_code=response.status_code,
                        code=code,
                        # 429 才有意义：服务端回的是**剩余**等待秒数，调用方据此进入冷却。
                        retry_after_seconds=self._parse_retry_after(response),
                    )
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
                    # 解密失败可能是该端点密钥不同：拉黑换一个，而不是判成「服务端拒绝」（会给用户误导）。
                    self._endpoint_pool.mark_failed(endpoint.base_url)
                    last_failure = LicenseClientError(str(error))
                    continue
                return parsed
        # 所有候选都试过：抛出最后一次失败，保留 status_code 等信息。
        raise last_failure or LicenseClientError('无法连接授权服务器。')

    @staticmethod
    def _parse_retry_after(response: httpx.Response) -> float | None:
        """从 429 响应头取 ``Retry-After``（秒）。

        只认秒数写法：服务端发的就是限流器算出的剩余秒数。钳到 ``[1, 3600]``，
        下界避免「回 0 就不休避」变成热循环，上界防止伪造头把客户端长期钉死在冷却里。
        """
        raw = response.headers.get('Retry-After')
        if raw is None:
            return None
        try:
            seconds = float(str(raw).strip())
        except (TypeError, ValueError):
            return None
        return min(3600.0, max(1.0, seconds))

    @staticmethod
    def _parse_error_response(response: httpx.Response) -> tuple[str, str | None]:
        """从错误响应取出 detail 与可选业务 code。

        协议：``{"detail": ..., "code": "REVOKED", "revoked": true}``；
        ``revoked: true`` 且无 code 时补 ``REVOKED``。
        """
        try:
            # 非 JSON 或顶层不是字典时回落通用文案，绝不把原始 body 透传给用户。
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

        ``activation_code`` 加密落库供自动重激活；``activation_code_hint`` 截掉后 9 位作界面提示。
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
                # 签发时间明显超前本机 → 时钟偏慢或服务端异常，到期判断不可信，先要求校准时间。
                state.status = 'CLOCK_ROLLBACK'
                state.last_error = '授权服务器时间明显晚于本机时间，请先校准系统时间。'
                database.commit()
                self._record_status(state.status, state.last_error)
                raise LicenseClientError(state.last_error)
            if self._lease_expired(expires_at, now=now):
                # 服务端返回已过期租约：不写入可用状态，避免刚「激活成功」就拿到失效凭证。
                # 判据含时钟偏移容差，本机快几秒不会让刚签发的租约被判成过期。
                state.status = 'LEASE_EXPIRED'
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
            state.feature_set = canonical_json(features)
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

        邮箱缺失（422）、激活码被拒或租约校验失败抛 ``LicenseClientError``。
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
        '''用户主动触发的「重新激活」，返回与 ``/license/activate`` 同构的状态。

        心跳与恢复凭证双双过期后客户端会卡在 401 循环且不能自愈，这里给用户显式出口：
        先试一次心跳（内部自动回落到恢复凭证），再用本地激活码重跑 ``/v2/activate``；
        确认吊销不可自愈直接上抛，无可用凭证时返回 ``MANUAL_ACTIVATION_REQUIRED``。
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

    async def heartbeat(self) -> dict:
        """对外的心跳入口：串行化，避免与恢复流程并发续租。"""
        # 走凭证临界区而不是只取 _heartbeat_lock：续租会写凭证，必须在「本进程唯一写入者」
        # 的保护下进行（生产里 start() 已持有进程锁，这里只是复用同一把临界区）。
        async with self._credential_operation():
            return await self._heartbeat_unlocked()

    async def _heartbeat_unlocked(self) -> dict:
        """心跳的实际实现（调用方须已持有 _heartbeat_lock）。

        优先用会话令牌续租，无令牌或 401 时回落到恢复令牌；确认吊销清空本地授权，
        429 只记冷却不改状态，其余失败只降级状态并保留租约等重试。
        """
        # 同步查库放线程池：心跳也会被请求路径 await，不能让读写占着事件循环。
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
                # 回传本机实例 ID：服务端据此拒绝不属于当前实例的旧会话。少了它，
                # 管理员刚做的解绑对旧设备等于没生效，旧会话仍能一直续租下去。
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
            # 被限流（429）：只记冷却，**不降级本地状态** —— 429 对绑定是否有效一个字都
            # 没说，按普通失败处理会把过期租约翻成 LEASE_EXPIRED、把编辑器锁死。
            # 也不在这里转 recover：那只会对同一个桶再打一次。
            if isinstance(error, LicenseClientError) and error.is_rate_limited:
                self._note_rate_limit(error)
                raise LicenseClientError(
                    str(error),
                    status_code=error.status_code,
                    code=error.code,
                    retry_after_seconds=error.retry_after_seconds,
                ) from error
            # 其它失败按租约剩余有效期降级为 CONNECTION_WARNING 或 LEASE_EXPIRED，等下一轮重试。
            await asyncio.to_thread(self._mark_failure, error)
            raise LicenseClientError(str(error), status_code=getattr(error, 'status_code', None), code=getattr(error, 'code', None)) from error

    async def recover(self) -> dict:
        """对外恢复入口：串行化，与心跳共用同一把锁。"""
        async with self._credential_operation():
            return await self._recover_unlocked()

    async def retry_now(self) -> dict:
        '''用户 / 展示端显式触发的「立刻重试」，返回最新状态。

        与后台心跳的差别就是本方法存在的理由：它**当场**发起一轮恢复，并清掉端点黑名单，
        所以手动点击不会被上一轮失败留下的冷却直接挡回（否则点了等于没点）。

        并发语义（三个细节都是有意的）：
        - 同一时刻只跑一个重试任务：多个页面同时点就共用它，而不是排队做多轮令牌轮换；
        - 节流窗口内直接返回当前状态、不发请求 —— 连点不该变成对授权服务的压测；
        - ``shield`` 保证等待方被取消时不会把共享任务一起取消（否则先点的那台设备一刷新，
          后点的那台就永远等不到结果）。
        '''
        if self._retry_task is not None and not self._retry_task.done():
            await asyncio.shield(self._retry_task)
            return await asyncio.to_thread(self.status)
        if time.monotonic() < self._manual_retry_after:
            return await asyncio.to_thread(self.status)
        # 先占住节流窗口再建任务：窗口要在请求之前占住，否则并发点击会一起通过判定。
        self._manual_retry_after = time.monotonic() + MANUAL_RETRY_THROTTLE_SECONDS
        self._retry_task = asyncio.create_task(self._manual_retry(), name='license-manual-retry')
        await asyncio.shield(self._retry_task)
        return await asyncio.to_thread(self.status)

    async def _manual_retry(self) -> None:
        """手动重试的实现（在凭证临界区里执行）。

        异常:
            LicenseClientError: 本机已进入终态、联网重试没有意义时抛 REAUTH_REQUIRED，
                由路由层转成 409，前端据此隐藏重试按钮、引导去激活页。
        """
        generation = self._success_generation
        async with self._credential_operation():
            # 本轮开始后已经有别的路径成功了：直接返回，不必再用旧租约发一轮请求。
            if generation != self._success_generation:
                return
            with self.database.session_factory() as database:
                state = self._state(database)
                # 时钟异常是本机时间的问题：重试前按当前时间重新校验一次，
                # 已校准时间的用户点一下就能自己恢复，不必走激活流程。
                if state.status == 'CLOCK_ROLLBACK':
                    state.status = 'ACTIVE'
                    self._validate_saved_state(state, database)
                if state.status in frozenset({'ACTIVE', 'LEASE_EXPIRED', 'CONNECTION_WARNING'}):
                    self._validate_saved_state(state, database)
                if state.status in TERMINAL_STATES - {'RECOVERY_REQUIRED', 'REMOTE_REJECTED'} or not state.license_id:
                    # 终态或压根未激活：联网也不会有结果，只能让人来处理。
                    raise LicenseClientError(
                        state.last_error or '当前授权需要重新激活。',
                        status_code=409,
                        code=REAUTH_REQUIRED)
            # 清黑名单：用户明确要求「现在就再试」，沿用上一轮的冷却会让这一下必然无效。
            self._endpoint_pool.retry_failed()
            try:
                await self._recover_unlocked()
            except LicenseClientError:
                # 失败已在底层记好状态与重试计划，这里不再上抛：手动重试的返回值统一走
                # status()，让前端看到真实状态与倒计时，而不是一个错误页。
                pass

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
            raise LicenseClientError(str(error), status_code=getattr(error, 'status_code', None), code=getattr(error, 'code', None)) from error

    def _mark_revoked(self, message: str) -> None:
        """确认吊销后的清理：清空所有本地凭证并把状态置为 REVOKED。

        清得彻底是有意的：残留租约或令牌会让下次启动仍用已吊销的授权续租，而自动
        重新激活还可能把厂商刚释放的绑定悄悄抢回来。
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

    def _mark_failure(self, error: Exception) -> None:
        """非吊销类失败：分类记录状态、定下错误码，并排下一次自动重试。

        分三档处置：
        - **终局**（本地凭证解不开 / 缺凭证 / 4xx 明确拒绝）→ 不再自动重试，
          前端要引导人工介入（重新激活、检查授权）；
        - **会话失效**（401）→ 先记 RECOVERY_RETRY（下轮重试），连续失败才升成 RECOVERY_REQUIRED；
        - **网络类** → 按租约剩余有效期降级为 CONNECTION_WARNING（仍可用）或 LEASE_EXPIRED（拦截）。
        """
        message = str(error)
        http_status = getattr(error, 'status_code', None)
        code = getattr(error, 'code', None)
        self._failures += 1
        retry = True
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
                retry = state.status not in frozenset({'RECOVERY_RETRY', 'RECOVERY_REQUIRED'})
                state.status = 'RECOVERY_RETRY' if retry else 'RECOVERY_REQUIRED'
                code = code or 'RECOVERY_TOKEN_INVALID'
            elif http_status is not None and 400 <= http_status < 500 and http_status not in frozenset({408, 429}):
                # 4xx 是业务拒绝（除超时/限流）：换地址、换时间都不会变，直接判终局。
                state.status = 'REMOTE_REJECTED'
                code = code or 'LICENSE_REMOTE_REJECTED'
                retry = False
            elif state.status in frozenset({'RECOVERY_RETRY', 'REMOTE_REJECTED', 'RECOVERY_REQUIRED'}):
                # 已经处在恢复流程里：保持该状态语义，只更新错误码与重试计划。
                code = code or 'NETWORK_UNAVAILABLE'
                retry = state.status == 'RECOVERY_RETRY'
            else:
                expires = ensure_aware(state.lease_expires_at)
                # 租约未到期只是联系不上服务器，功能继续可用；已到期则必须拦截等恢复。
                state.status = 'CONNECTION_WARNING' if expires and expires > datetime.now(timezone.utc) else 'LEASE_EXPIRED'
                code = code or 'NETWORK_UNAVAILABLE'
            # 同样截断，避免超长错误进库。
            state.last_error = message[:1000]
            database.commit()
            # 启动确认未完成时对外仍显示「等待启动联网验证」，不因一次失败改变门禁语义。
            self._record_status('STARTUP_VALIDATION_REQUIRED' if self._startup_validation_pending else state.status)
        self._error_code = code
        # 只有「可重试」才排计划时刻；终态排了会让后台对着一个注定失败的状态无限重试。
        self._next_attempt = time.monotonic() + self._next_retry_delay(http_status) if retry else None
        # 计划可能变了，唤醒心跳循环立刻重算等待时间（否则要等当前这一觉睡完）。
        self._schedule_changed.set()

    def _clear_startup_validation(self) -> None:
        """联网确认失败但非确认吊销时，把判定权交回离线验签。

        状态按本地租约剩余有效期重算：未过期 → ``CONNECTION_WARNING``（放行），
        已过期 → ``LEASE_EXPIRED``（拦截）。真正生效的仍是 :meth:`_verified_access`。
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

    @staticmethod
    def _heartbeat_wait_seconds(state: LicenseState, now: datetime | None = None) -> float | None:
        """算出心跳循环下一次该等多久；未激活时返回 None（调用方据此跳过本轮）。

        租约已到期 → 固定 30 秒重试；否则取 min(心跳间隔, 距到期剩余时间)，
        保证租约一到点就被处理。
        """
        if not state.license_id:
            # 未激活无需心跳。
            return None
        if state.status == 'LEASE_EXPIRED':
            return float(EXPIRED_LEASE_RETRY_SECONDS)
        # 再兜一次 30 秒下限：库里的值可能被手工改小。
        interval = float(max(30, state.heartbeat_interval_seconds))
        expires = ensure_aware(state.lease_expires_at)
        if expires is None:
            return interval
        remaining = (expires - (now or datetime.now(timezone.utc))).total_seconds()
        # 不允许负等待；到期时间比间隔更近时提前唤醒。
        return max(0, min(interval, remaining))

    def _scheduled_wait_seconds(self, state: LicenseState) -> float | None:
        """算出本轮该等多久：优先听「计划重试时刻」，没有计划才按常规心跳节奏。

        计划时刻存在意味着上一轮失败已经算好了退避（见 :meth:`_mark_failure`）；此时必须
        以它为准，否则「失败退避」和「心跳间隔」会各走各的，退避形同虚设。
        未激活或已进入终态时返回 None，调用方据此一直等到有变更为止。
        """
        if not state.license_id or state.status in TERMINAL_STATES:
            return None
        if self._next_attempt is not None:
            # 已过计划时刻就返回 0（立刻试），而不是再等一个完整的心跳间隔。
            return max(0.0, self._next_attempt - time.monotonic())
        return self._heartbeat_wait_seconds(state)

    def _heartbeat_wait(self) -> float | None:
        """读库算出本轮该等多久（同步，供心跳循环放线程池）。"""
        with self.database.session_factory() as database:
            wait_seconds = self._scheduled_wait_seconds(self._state(database))
        if wait_seconds is None:
            # 未激活 / 终态无需联网，冷却不改变这一点（调用方据此一直等到有变更为止）。
            return None
        # 冷却期内不再重打：等待至少覆盖冷却剩余，否则每次撞 429 都在把窗口重新填满。
        return max(wait_seconds, self._rate_limit_remaining())

    def _due_state(self) -> tuple[bool, str, bool]:
        """超时醒来后重新读一次状态（同步，供心跳循环放线程池）。

        返回: (是否仍有授权, 状态, 租约是否已到期)。
        """
        with self.database.session_factory() as database:
            state = self._state(database)
            expires = ensure_aware(state.lease_expires_at)
            now = datetime.now(timezone.utc)
            # 到期用同一个带容差判据：这里决定续租还是走恢复令牌，硬比会在时钟稍快时多走恢复分支。
            return (bool(state.license_id), state.status, bool(expires and self._lease_expired(expires, now=now)))

    async def _heartbeat_loop(self) -> None:
        """心跳主循环：等一个「计划变更」或超时，然后续租或恢复。

        每轮都重新读库计算等待时间，因此激活、停用、租约变化都能立刻生效。
        """
        while not self._stop.is_set():
            # 先清后等：清掉上一轮遗留的信号，避免本轮空转。
            self._schedule_changed.clear()
            # 每轮读库也放线程池：常驻任务占住事件循环就是让所有请求为它让路。
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
                    # 非授权异常不再吞掉：记日志并让任务结束，否则会变成无声死循环一直刷错误日志。
                    self._log_event('error', f'''授权自动续租任务意外停止（{type(error).__name__}）。''')
                    raise
                if self._stop.is_set():
                    break

    def _payload(self, state: LicenseState) -> dict:
        """组装对外状态字典（字段名与前端约定死，逐字不可改）。

        会在落库状态之上做实时修正：时钟回拨、租约到期、启动联网确认未完成都会覆盖
        effective_status，保证前端看到的与门禁口径一致。
        """
        # 先复制库值再实时修正：修正不写库，避免把与时间相关的瞬时判断固化成持久状态。
        effective_status = state.status
        effective_error = state.last_error
        now = datetime.now(timezone.utc)
        last_verified = ensure_aware(state.last_verified_at)
        lease_expires = ensure_aware(state.lease_expires_at)
        if last_verified and now + timedelta(seconds=self.settings.license_clock_skew_seconds) < last_verified:
            # 时钟回拨时租约到期判断不可信，直接覆盖为 CLOCK_ROLLBACK。
            effective_status = 'CLOCK_ROLLBACK'
            effective_error = '检测到系统时间回拨，请校准系统时间后重新验证授权。'
        elif lease_expires and self._lease_expired(lease_expires, now=now) and effective_status in frozenset({'ACTIVE', 'CONNECTION_WARNING', 'RECOVERY_RETRY'}):
            # 库里写着 ACTIVE 但租约已到期：覆盖为 LEASE_EXPIRED，避免前端显示正常却被门禁拦下。
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
            # featureAccess 额外乘上验签结果：租约不合法（被改、过期、实例不符）也不放行。
            'featureAccess': {
                'editor': bool(state.license_id and 'editor' in visible_features and editor_allowed),
                'interaction3d': bool(state.license_id and 'module.3d_interaction' in visible_features and self._verified_access(state, 'module.3d_interaction'))},
            'products': visible_products if state.license_id else [],
            # 心跳间隔（秒），前端据此展示刷新节奏。
            'heartbeatIn': state.heartbeat_interval_seconds,
            'leaseIssuedAt': ensure_aware(state.lease_issued_at),
            'leaseExpiresAt': ensure_aware(state.lease_expires_at),
            'lastHeartbeatAt': ensure_aware(state.last_heartbeat_at),
            'lastVerifiedAt': ensure_aware(state.last_verified_at),
            # 重试相关字段：前端据此决定提示文案、按钮可见性与倒计时。
            'errorCode': self._error_code,
            'retryable': self._retry_scheduled(),
            'canRetry': self._can_retry(effective_status),
            'retrying': self._retry_in_flight(),
            'retryAttempt': self._failures,
            'nextRetryAt': self._next_retry_at(),
            'lastError': effective_error}

    def status(self) -> dict:
        """取当前状态（开一个短事务，读单行状态后组装成字典）。"""
        with self.database.session_factory() as database:
            return self._payload(self._state(database))

    #: availability() 对外暴露的字段白名单。用白名单而不是黑名单，是为了日后往 status()
    #: 加字段时不会「顺手」把它泄露给匿名页面。
    AVAILABILITY_FIELDS = ('status', 'errorCode', 'retryable', 'canRetry', 'retrying', 'retryAttempt', 'nextRetryAt')

    def availability(self) -> dict:
        '''公开的可用性摘要：给恢复页与展示端，不含任何标识、凭证或原始错误。

        与 status() 的分工：status() 面向管理员，含激活码提示、租约 / 会话标识与原始
        lastError；恢复页（可能未登录）绝不能拿到这些，所以另出一个只含「状态 + 能否重试」
        的响应体，由字段白名单保证不泄露。
        '''
        result = self.status()
        output = {key: result[key] for key in self.AVAILABILITY_FIELDS if key in result}
        # displayAllowed 现算而不是从 status 里取：它由签名租约 + 权益集合共同决定，
        # 复用 lastError 之类的字段推断会把「文件坏了」误判成「没权限」。
        output['displayAllowed'] = self.allows('display')
        return output

    def _retry_in_flight(self) -> bool:
        """是否有手动重试正在执行（前端据此显示「正在验证」而不是倒计时）。"""
        return self._retry_task is not None and not self._retry_task.done()

    def _retry_scheduled(self) -> bool:
        """是否已排好下一轮自动重试（前端据此决定要不要显示倒计时）。"""
        return self._next_attempt is not None

    def _next_retry_at(self) -> str | None:
        """下一轮计划重试的墙钟时刻（ISO 串）；没排重试则为 None。

        返回绝对时刻而不是「还剩几秒」：前端自己算倒计时，才不会因为一次网络往返
        把剩余时间算少、显示成「0 秒后重试」却迟迟不动。
        """
        if self._next_attempt is None:
            return None
        remaining = max(0.0, self._next_attempt - time.monotonic())
        return (datetime.now(timezone.utc) + timedelta(seconds=remaining)).isoformat()

    def _can_retry(self, effective_status: str) -> bool:
        """现在点「重试」是否有意义。

        终态返回 False，前端据此隐藏按钮：留一个必然失败的按钮，用户只会反复点，
        而真正该做的是去激活页。
        """
        if not self.settings.license_required:
            return False
        if effective_status in TERMINAL_STATES or effective_status == 'UNACTIVATED':
            return False
        return bool(effective_status)

    def _verified_access(self, state: LicenseState, feature: str | None = None) -> bool:
        """重新校验签名租约，而不是信任可被改写的 SQLite 状态字段。

        参数: feature 为要判定的能力码；None 表示只判「授权整体是否可用」。
        """
        if not self.settings.license_required:
            # 关闭授权校验的部署形态直接放行。
            return True
        if self._startup_validation_pending or state.status not in frozenset({'ACTIVE', 'CONNECTION_WARNING', 'RECOVERY_RETRY'}):
            # 启动确认未完成，或状态不在可放行集合内时短路，避免无谓的验签开销。
            # RECOVERY_RETRY 也在放行集合里：它表示「会话在重试、本地租约仍有效」，
            # 与 429 同理 —— 一次会话失败不足以把正在正常使用的编辑器锁死，
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

        参数: feature 为能力码；None 表示只判授权是否整体可用。
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
