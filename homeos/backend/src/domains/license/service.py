"""授权客户端：激活、心跳续租、租约恢复与能力门禁。"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import secrets
import threading
import time
from collections.abc import Collection
from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx
from sqlalchemy import select

from .crypto import LeaseVerifier, LicenseCryptoError, LicenseTransportCipher, SecretCipher, parse_timestamp
from .endpoints import LICENSE_RETRY_SECONDS, LicenseEndpoint, LicenseEndpointPool
from .features import (
    FEATURE_EDITOR,
    FEATURE_INTERACTION_3D,
    MODULE_FEATURES,
    active_entitlement_codes,
    expand,
    granted,
)
from .hardware import hardware_instance_id
from .process_lock import LicenseProcessLock
from .trust import verify_license_trust_anchors
from ...config import Settings
from ...platform.core.database import Database
from ...platform.core.models import LicenseState

# 事件日志是可选的：由 GlobalLogStore 注入；未注入时授权服务只做本地状态记录，
# 不阻塞任何流程。
EventLogLike = Any

logger = logging.getLogger("homeos.license.service")

RETRY_DELAYS = (2, 5, 10, 30, 60, 300)

#: 心跳间隔下限（秒）：商店下发的 heartbeatIn 再小也不能低于这个值，否则会把商店打爆。
#: 允许用 HOMEOS_LICENSE_HEARTBEAT_SECONDS 覆盖（现场排障时想更频繁地拉状态）。
DEFAULT_MIN_HEARTBEAT_SECONDS = 30


def min_heartbeat_seconds() -> int:
    """心跳间隔下限（秒）：环境变量优先，缺失或非法值回落到 30，且至少 1 秒。"""
    raw = os.getenv('HOMEOS_LICENSE_HEARTBEAT_SECONDS')
    if not raw:
        return DEFAULT_MIN_HEARTBEAT_SECONDS
    try:
        value = int(raw)
    except (TypeError, ValueError):
        return DEFAULT_MIN_HEARTBEAT_SECONDS
    return max(1, value)


TERMINAL_STATES = {
    'INVALID',
    'REVOKED',
    'DEACTIVATED',
    'CLOCK_ROLLBACK',
    'REMOTE_REJECTED',
    'INSTANCE_CHANGED',
    'INSTANCE_MISMATCH',
    'RECOVERY_REQUIRED'}


CONFIRMED_REVOCATION_CODES = frozenset({'REVOKED', 'LICENSE_REVOKED'})
BINDING_RELEASED_CODES = frozenset({'BINDING_RELEASED'})
INSTANCE_MISMATCH_CODES = frozenset({'INSTANCE_MISMATCH'})
#: 「授权到期」码：商店不再用吊销语义回报到期，客户端据此按「续费即恢复」处理。
ACCESS_EXPIRED_CODES = frozenset({'ACCESS_EXPIRED'})

#: 商店重放保护拒收随机数时用的文案。线上协议的一部分：靠它才认得出
#: 「上一次其实已经受理、只是响应丢了」这种可以换随机数自愈的情况。
NONCE_REPLAY_DETAIL = '请求随机数已使用，请重新发起请求。'

#: 租约商品里「附加项」的类型：它们描述的是加购模块 / 模板，不是授权版本本身。
_ADDON_PRODUCT_TYPES = frozenset({'module', 'template'})


def edition_from_products(products: list[Any]) -> str:
    """从租约商品列表推导「授权版本」。

    取第一个**非附加项**的 ``type``（商店侧形如 ``base`` / ``pro``）。租约里没有可判定
    的商品时回落 ``'base'`` —— ``_lease_features_and_products`` 在空列表时补的「基础版」
    与之一致。``lease_product_edition`` 与 ``/status`` 读路径共用本函数：老库的
    ``product_edition`` 仍是 NULL 时，也能按当前租约给出正确版本，而不是硬编码 ``full``。
    """
    for entry in products:
        if not isinstance(entry, dict):
            continue
        product_type = entry.get('type')
        if not isinstance(product_type, str):
            continue
        normalized = product_type.strip()
        if normalized and normalized.lower() not in _ADDON_PRODUCT_TYPES:
            return normalized
    return 'base'


def lease_product_edition(lease: dict) -> str:
    """从签名租约推导「授权版本」（写进 ``LicenseState.product_edition``）。

    取租约 ``products`` 里第一个**非附加项**的 ``type``（商店侧形如 ``base`` / ``pro``），
    不能固定写 ``'full'``，否则只买了基础版的机器也会显示「完整版」。
    """
    products = lease.get('products')
    return edition_from_products(products) if isinstance(products, list) else 'base'


class LicenseClientError(RuntimeError):

    def __init__(
        self,
        message: str,
        *,
        status_code: int | None = None,
        code: str | None = None,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code

    @property
    def is_confirmed_revocation(self) -> bool:
        """仅当授权服务确认吊销时才返回 true。

        401/403 也可能表示会话过期、恢复令牌失效，或授权节点收敛期间的瞬时竞态。
        这些情况必须保留本地授权，以便客户端重试恢复。
        """
        if self.status_code not in {401, 403}:
            return False
        return self.code in CONFIRMED_REVOCATION_CODES

    @property
    def is_nonce_replay(self) -> bool:
        """仅当授权服务明确拒绝了被重放的随机数时为真。

        ``code`` 是结构化判据；文案比对留给还没有这个码的商店（409 也可能是并发请求撞在
        同一个随机数上，两种判据都不认就说明不是重放保护拦下的）。
        """
        if self.status_code != 409:
            return False
        return self.code == 'NONCE_REPLAY' or str(self) == NONCE_REPLAY_DETAIL

    @property
    def is_instance_mismatch(self) -> bool:
        """商店说这份会话属于另一台机器：授权还在，重新激活即可。

        与 :attr:`is_confirmed_revocation` 分开，是因为商店一度把这种情况也按「已吊销」
        回给了客户端（``revoked=True`` 且不给码，兜底成 ``REVOKED``），客户端于是把它当
        「授权没了」处理，用户被卡在只能联系管理员的死局里；实际动作是重新激活。
        """
        return self.status_code in {401, 403, 409} and self.code in INSTANCE_MISMATCH_CODES

    @property
    def requires_rebind(self) -> bool:
        """商店已解除本机绑定：授权本身仍在，重新激活即可继续用。

        与 :attr:`is_confirmed_revocation` 分开，是因为两者的下一步动作不同：
        吊销是「这份授权没了，要找管理员」；被解绑是「这台机器不再绑在它上面，
        重新激活即可」。只按 revoked 布尔值处理，会把被解绑的安装说成「请联系管理员」。
        """
        return self.status_code in {401, 403} and self.code in BINDING_RELEASED_CODES

    @property
    def is_access_expired(self) -> bool:
        """商店说这份授权的有效期已结束。

        与 :attr:`is_confirmed_revocation` 分开：到期是**可恢复**的 —— 到商店续费后
        下一次心跳即恢复，客户端不该清本地数据、也不该停止自动重试。
        """
        return self.status_code in {403, 409} and self.code in ACCESS_EXPIRED_CODES


MANUAL_ACTIVATION_REQUIRED = 'LICENSE_ACTIVATION_REQUIRED'
RATE_LIMIT_COOLDOWN_SECONDS = 120.0

#: 状态 → 中文文案（事件日志与 ``_payload`` 的 ``statusLabel`` 共用一份，避免两处漂移）。
STATUS_LABELS = {
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
    'ACCESS_EXPIRED': '授权已到期',
    'STARTUP_VALIDATION_REQUIRED': '等待启动联网验证',
}


def aware(value):
    if value is None or value.tzinfo is not None:
        return value
    return value.replace(tzinfo=UTC)


class LicenseService:

    def __init__(self, settings: Settings, database: Database, transport: httpx.AsyncBaseTransport | None, *, endpoint_pool: LicenseEndpointPool | None = None, event_log: EventLogLike | None = None) -> None:
        self.settings = settings
        self.database = database
        self.event_log = event_log
        verify_license_trust_anchors(settings)
        self._event_lock = threading.RLock()
        self._observed_status = None
        self._event_failures = {}
        self.verifier = LeaseVerifier(trusted_keys=settings.license_trusted_public_keys)
        self.cipher = SecretCipher(settings.license_secret_key_path)
        self.transport_cipher = LicenseTransportCipher(settings.license_transport_public_key_path, settings.license_transport_key_id, settings.license_transport_public_key_sha256)
        self._transport = transport
        self._endpoint_pool = endpoint_pool or LicenseEndpointPool(settings.effective_license_server_batches)
        self._task = None
        self._heartbeat_lock = asyncio.Lock()
        self._stop = asyncio.Event()
        self._schedule_changed = asyncio.Event()
        self._cached_instance_id = None
        self._startup_validation_pending = False
        self._process_lock = LicenseProcessLock(settings.data_dir)
        self._retry_task = None
        self._failures = 0
        self._next_attempt = None
        self._manual_retry_after = 0.0
        self._error_code = None
        self._success_generation = 0
        self._last_binding_confirm_at = 0.0
        self._rate_limited_until = 0.0
        # allows() 热路径缓存：key=(lease_id, sequence, feature) → (monotonic_deadline, allowed)
        self._allow_cache: dict[tuple[str, int, str], tuple[float, bool]] = {}
        self._allow_cache_ttl_seconds = 2.0
        #: ``allows()`` 快路径用的租约身份快照 ``(expires_at, lease_id, lease_sequence)``。
        #: 只在 TTL 内可信，语义等同 ``_allow_cache`` 的陈旧窗口。
        self._identity_snapshot: tuple[float, str, int] | None = None
        #: 授权状态变化监听器（同步回调，在状态真正变化时才触发）。WebSocket 网关靠它把
        #: 「授权已被吊销」这类终态第一时间推给在线连接，而不必等下一次心跳轮询。
        self._status_listeners: list[Any] = []

    def add_status_listener(self, listener) -> None:
        """注册状态变化回调；同一回调只注册一次（网关重连时不会越积越多）。"""
        with self._event_lock:
            if listener not in self._status_listeners:
                self._status_listeners.append(listener)

    def _rate_limit_remaining(self) -> float:
        return max(0.0, self._rate_limited_until - time.monotonic())

    BINDING_CONFIRM_THROTTLE_SECONDS = 60.0

    def _binding_needs_confirm(self) -> bool:
        with self.database.session_factory() as database:
            state = self._state(database)
            return bool(
                state.license_id
                and state.signed_lease
                and state.status
                in frozenset({'ACTIVE', 'CONNECTION_WARNING', 'STARTUP_VALIDATION_REQUIRED', 'LEASE_EXPIRED'}))

    async def confirm_binding(self, *, force: bool = False) -> None:
        if not self.settings.license_required or not self._endpoint_pool.configured:
            return
        if self._rate_limit_remaining() > 0:
            return
        now = time.monotonic()
        if not force and (now - self._last_binding_confirm_at) < self.BINDING_CONFIRM_THROTTLE_SECONDS:
            return
        self._last_binding_confirm_at = now
        if not await asyncio.to_thread(self._binding_needs_confirm):
            return
        try:
            await self.heartbeat()
        except LicenseClientError as error:
            if error.is_confirmed_revocation:
                self._log_event('warning', f'''联网确认绑定失败（已吊销）：{error}''')

    def _log_event(self, level: str, message: str) -> None:
        if self.event_log is None:
            return
        try:
            self.event_log.append(level, '授权服务', '授权', message)
        except Exception as exc:
            # 授权事件写不进日志不阻塞授权流程，但必须留痕：否则「授权失败」会查无实据。
            logger.warning('授权事件写入失败 level=%s message=%s: %s', level, message, exc)

    def _record_status(self, status: str, reason: str | None = None) -> None:
        labels = STATUS_LABELS
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
            level = 'success' if status == 'ACTIVE' else 'info' if status in {'DEACTIVATED', 'UNACTIVATED'} else 'warning'
            if status in {'INVALID', 'REVOKED', 'CLOCK_ROLLBACK', 'INSTANCE_MISMATCH', 'RECOVERY_REQUIRED', 'REMOTE_REJECTED'}:
                level = 'error'
            self._log_event(level, message)
            # 锁内只取快照：监听器可能做 I/O（如断开 WebSocket），不能一直占着事件日志的锁。
            listeners = tuple(self._status_listeners)
        for listener in listeners:
            try:
                listener(status)
            except Exception as exc:
                logger.warning('授权状态监听器执行失败 status=%s: %s', status, exc)

    def _record_failure(self, operation: str, error: Exception | str, *, sensitive_values: tuple[str, ...] = ()) -> None:
        reason = str(error)
        for value in sorted(set(sensitive_values), key=len, reverse=True):
            if not value:
                continue
            reason = reason.replace(value, '***')
        with self._event_lock:
            now = time.monotonic()
            failure = self._event_failures.setdefault(operation, {
                'count': 0,
                'logged_at': None,
                'reason': None})
            failure['count'] += 1
            if failure['reason'] == reason and failure['logged_at'] is not None and now - failure['logged_at'] < 300:
                return
            failure.update(logged_at=now, reason=reason)
            status_code = getattr(error, 'status_code', None)
            suffix = f'''，HTTP {status_code}''' if status_code else ''
            self._log_event('error' if operation in {'激活', '本地校验'} else 'warning', f'''授权{operation}失败（累计 {failure['count']} 次{suffix}）：{reason}''')

    def _record_online_success(self, operation: str) -> None:
        self._rate_limited_until = 0.0
        with self._event_lock:
            failures = [(name, self._event_failures.pop(name)) for name in ('心跳', '租约恢复') if name in self._event_failures]
            if failures:
                counts = '、'.join(f'''{name}失败 {failure['count']} 次''' for name, failure in failures)
                self._log_event('success', f'''授权连接已恢复，{operation}成功；此前{counts}。''')
            if operation == '激活':
                self._event_failures.pop('激活', None)
                self._log_event('success', '授权激活成功。')

    def _record_local_success(self) -> None:
        with self._event_lock:
            failure = self._event_failures.pop('本地校验', None)
            if failure:
                self._log_event('success', f'''授权本地校验已恢复；此前校验失败 {failure['count']} 次。''')

    @staticmethod
    def _valid_instance_id(value: str) -> bool:
        return 16 <= len(value) <= 64 and all(character.isalnum() or character in '-_.' for character in value)

    def _instance_id(self) -> str:
        if self._cached_instance_id:
            return self._cached_instance_id
        path = self.settings.instance_id_path
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
        if saved != value:
            temporary = path.with_name(f'''.{path.name}.tmp''')
            descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
            with os.fdopen(descriptor, 'w', encoding='utf-8') as output:
                output.write(value + '\n')
            os.replace(temporary, path)
        os.chmod(path, 0o600)
        self._cached_instance_id = value
        return value

    def _activation_credentials(self) -> tuple[bool, str | None, str]:
        with self.database.session_factory() as database:
            state = self._state(database)
            return (bool(state.license_id), state.encrypted_activation_code, state.activation_email or '')

    @asynccontextmanager
    async def _credential_operation(self):
        async with self._heartbeat_lock:
            temporary = self._process_lock.fd is None
            if temporary:
                self._process_lock.acquire()
            try:
                yield
            finally:
                if temporary:
                    self._process_lock.release()

    def _state(self, database) -> LicenseState:
        state = database.scalar(select(LicenseState).limit(1))
        instance_id = self._instance_id()
        if state is None:
            state = LicenseState(id=1, instance_id=instance_id)
            database.add(state)
            database.commit()
            database.refresh(state)
        elif state.instance_id != instance_id:
            state.instance_id = instance_id
            state.lease_id = None
            state.session_id = None
            state.lease_sequence = 0
            state.signed_lease = None
            state.encrypted_session_token = None
            state.encrypted_recovery_token = None
            state.lease_issued_at = None
            state.lease_expires_at = None
            state.status = 'INSTANCE_CHANGED' if state.license_id else 'UNACTIVATED'
            state.last_error = (
                '本机安装标识已变化，需要重新激活授权。'
                if state.license_id
                else None
            )
            self._error_code = 'INSTANCE_CHANGED' if state.license_id else None
            database.commit()
            self._record_status(state.status, state.last_error)
        return state

    async def start(self) -> None:
        if self._task is not None and not self._task.done():
            return
        self._process_lock.acquire()
        with self.database.session_factory() as database:
            state = self._state(database)
            self._validate_saved_state(state, database)
            self._startup_validation_pending = bool(
                self.settings.license_required
                and state.license_id
                and state.signed_lease
                and state.status not in TERMINAL_STATES
            )
            self._record_status('STARTUP_VALIDATION_REQUIRED' if self._startup_validation_pending else state.status)
        if self._startup_validation_pending:
            self._next_attempt = time.monotonic()
        if self._endpoint_pool.configured:
            self._stop.clear()
            self._task = asyncio.create_task(self._heartbeat_loop(), name='license-heartbeat')

    async def stop(self) -> None:
        self._stop.set()
        self._schedule_changed.set()
        tasks = [task for task in (self._task, self._retry_task) if task is not None]
        for task in tasks:
            task.cancel()
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)
        self._task = None
        self._process_lock.release()

    def _validate_saved_state(self, state: LicenseState, database) -> None:
        if not state.signed_lease or state.status in TERMINAL_STATES | {'UNACTIVATED'}:
            return
        try:
            body = self.verifier.verify(state.signed_lease, state.instance_id)
            if body['leaseSequence'] != state.lease_sequence:
                raise LicenseCryptoError('本地租约序号与签名租约不一致。')
            if (
                body['activationCodeId'] != state.license_id
                or body['leaseId'] != state.lease_id
                or body['sessionId'] != state.session_id
            ):
                raise LicenseCryptoError('本地授权会话与签名租约不一致。')
            expires = parse_timestamp(body['expiresAt'])
            now = datetime.now(UTC)
            # 时间回拨只认签名租约里的 ``issuedAt``（商店私钥签的），不再叠加本地
            # ``last_verified_at``：后者可写，抹掉就能绕过回拨判定。
            if parse_timestamp(body['issuedAt']) > now + timedelta(seconds=self.settings.license_clock_skew_seconds):
                state.status = 'CLOCK_ROLLBACK'
                state.last_error = '检测到系统时间回拨，请校准系统时间后重新验证授权。'
            else:
                if state.status != 'RECOVERY_RETRY':
                    state.status = 'ACTIVE' if expires > now else 'LEASE_EXPIRED'
                state.last_verified_at = now
                state.last_error = None
        except LicenseCryptoError as error:
            if '当前实例' in str(error):
                state.status = 'INSTANCE_CHANGED'
                state.last_error = '本机安装标识已变化，需要重新激活授权。'
            else:
                state.status = 'INVALID'
                state.last_error = str(error)
            self._record_failure('本地校验', error, sensitive_values=(state.signed_lease,))
        database.commit()
        self._record_status(state.status)

    async def _post(self, path: str, payload: dict) -> dict:
        candidates = self._endpoint_pool.candidates()
        if not self._endpoint_pool.configured:
            raise LicenseClientError('尚未配置授权服务器地址。')
        if not candidates:
            raise LicenseClientError('授权服务器暂时不可用，请稍后重试。')
        current = dict(payload)
        failure: LicenseClientError | None = None
        # 服务端重放保护只让一个随机数生效一次。线路轮询（esa → eo → 直连）会把同一份载荷
        # 原样重发：若前一条线其实已经受理、只是响应在路上丢了，后一条线必然收到
        # 409「随机数已使用」。随机数不是凭据，换一个重发就能接着走；把它当成授权失败，
        # 会把「上一次其实成功了」误报成失败给用户看。
        for attempt in range(2):
            if attempt:
                if 'nonce' not in current:
                    break
                current = {**current, 'nonce': secrets.token_urlsafe(24)}
            result, failure, replayed = await self._post_round(candidates, path, current)
            if result is not None:
                return result
            if not replayed:
                break
        raise failure or LicenseClientError('无法连接授权服务器。')

    async def _post_round(
        self, candidates: list[LicenseEndpoint], path: str, payload: dict
    ) -> tuple[dict | None, LicenseClientError | None, bool]:
        """发一轮：按线路顺序试同一份载荷。

        返回 ``(响应, 失败原因, 是否被重放保护拦下)``；第三项为真时调用方应换随机数重试。
        """
        last_failure = None
        async with httpx.AsyncClient(transport=self._transport, timeout=self.settings.license_request_timeout_seconds) as client:
            for endpoint in candidates:
                request_payload, response_key = self.transport_cipher.encrypt_request(payload, path)
                try:
                    response = await client.post(f'''{endpoint.base_url}{path}''', json=request_payload)
                    if response.status_code >= 500:
                        self._endpoint_pool.mark_failed(endpoint.base_url)
                        last_failure = LicenseClientError(
                            self._response_error_body(response)[0],
                            status_code=response.status_code,
                            code='LICENSE_SERVER_UNAVAILABLE')
                        continue
                    if response.status_code >= 400:
                        detail, response_code = self._response_error_body(response)
                        error = LicenseClientError(
                            detail,
                            status_code=response.status_code,
                            code='LICENSE_RATE_LIMITED' if response.status_code == 429 else response_code)
                        if error.is_nonce_replay:
                            return None, error, True
                        raise error
                    if not response.content:
                        return {}, None, False
                    parsed = response.json()
                    if not isinstance(parsed, dict):
                        self._endpoint_pool.mark_failed(endpoint.base_url)
                        last_failure = LicenseClientError('授权服务器响应格式无效。')
                        continue
                    parsed = self.transport_cipher.decrypt_response(parsed, path, response_key)
                    return parsed, None, False
                except httpx.HTTPError as error:
                    self._endpoint_pool.mark_failed(endpoint.base_url)
                    last_failure = LicenseClientError(
                        '无法连接授权服务器。',
                        code='NETWORK_TIMEOUT' if isinstance(error, httpx.TimeoutException) else 'NETWORK_UNAVAILABLE')
                except ValueError:
                    self._endpoint_pool.mark_failed(endpoint.base_url)
                    last_failure = LicenseClientError('授权服务器响应格式无效。')
                except LicenseCryptoError as error:
                    self._endpoint_pool.mark_failed(endpoint.base_url)
                    last_failure = LicenseClientError(str(error))
        return None, last_failure, False

    @staticmethod
    def _response_error_body(response: httpx.Response) -> tuple[str, str | None]:
        try:
            parsed = response.json()
        except ValueError:
            return '授权服务器拒绝请求。', None
        if not isinstance(parsed, dict):
            return '授权服务器拒绝请求。', None
        detail = parsed.get('detail', '授权服务器拒绝请求。')
        code = parsed.get('code')
        return str(detail), code if isinstance(code, str) and code else None

    def _apply_response(self, response: dict, *, activation_code_hint: str | None = None, activation_code: str | None = None, email: str | None = None, account_name: str | None = None) -> dict:
        signed_lease = response.get('signedLease', '')
        with self.database.session_factory() as database:
            state = self._state(database)
            try:
                body = self.verifier.verify(signed_lease, state.instance_id)
            except LicenseCryptoError as error:
                state.status = 'INSTANCE_MISMATCH' if '当前实例' in str(error) else 'INVALID'
                state.last_error = str(error)
                database.commit()
                self._record_status(state.status)
                self._record_failure('本地校验', error, sensitive_values=(signed_lease,))
                raise LicenseClientError(str(error)) from error
            expires_at = parse_timestamp(body['expiresAt'])
            issued_at = parse_timestamp(body['issuedAt'])
            lease_sequence = body['leaseSequence']
            now = datetime.now(UTC)
            if issued_at > now + timedelta(seconds=self.settings.license_clock_skew_seconds):
                state.status = 'CLOCK_ROLLBACK'
                state.last_error = '授权服务器时间明显晚于本机时间，请先校准系统时间。'
                database.commit()
                self._record_status(state.status, state.last_error)
                raise LicenseClientError(state.last_error or '')
            if expires_at <= now:
                state.status = 'INVALID'
                state.last_error = '授权服务器返回了已到期租约。'
                database.commit()
                self._record_status(state.status, state.last_error)
                raise LicenseClientError(state.last_error or '')
            if body['activationCodeId'] == state.license_id and lease_sequence <= state.lease_sequence and state.signed_lease != signed_lease:
                state.status = 'INVALID'
                state.last_error = '授权服务器返回了未递增的租约序号。'
                database.commit()
                self._record_status(state.status, state.last_error)
                raise LicenseClientError(state.last_error or '')
            state.license_id = body['activationCodeId']
            state.lease_id = body['leaseId']
            state.session_id = body['sessionId']
            state.lease_sequence = lease_sequence
            state.signed_lease = signed_lease
            state.status = 'ACTIVE'
            state.lease_issued_at = parse_timestamp(body['issuedAt'])
            state.lease_expires_at = expires_at
            state.last_heartbeat_at = now
            state.last_verified_at = now
            state.product_edition = lease_product_edition(body)
            features = body.get('features')
            if not isinstance(features, list) or not all(isinstance(item, str) for item in features):
                state.status = 'INVALID'
                state.last_error = '授权服务器返回的权益列表无效。'
                database.commit()
                self._record_status(state.status, state.last_error)
                raise LicenseClientError(state.last_error or '')
            state.feature_set = json.dumps(features)
            state.heartbeat_interval_seconds = max(min_heartbeat_seconds(), int(response.get('heartbeatIn', 300)))
            state.last_error = None
            state.deactivated_at = None
            if state.activated_at is None:
                state.activated_at = datetime.now(UTC)
            if activation_code_hint:
                state.activation_code_hint = activation_code_hint
            if activation_code:
                state.encrypted_activation_code = self.cipher.encrypt(activation_code)
            if email:
                state.activation_email = email
            if account_name:
                state.activated_by = account_name
            if response.get('sessionToken'):
                state.encrypted_session_token = self.cipher.encrypt(response['sessionToken'])
            if response.get('recoveryToken'):
                state.encrypted_recovery_token = self.cipher.encrypt(response['recoveryToken'])
            database.commit()
            self.invalidate_allow_cache()
            self._startup_validation_pending = False
            self._failures = 0
            self._next_attempt = None
            self._error_code = None
            self._success_generation += 1
            self._schedule_changed.set()
            return self._payload(state)

    async def activate(self, activation_code: str, email: str | None = None, account_name: str | None = None) -> dict:
        async with self._credential_operation():
            return await self._activate_unlocked(activation_code, email, account_name)

    async def _activate_unlocked(self, activation_code: str, email: str | None = None, account_name: str | None = None) -> dict:
        with self.database.session_factory() as database:
            state = self._state(database)
            instance_id = state.instance_id
        body = {
            'activationCode': activation_code.strip().upper(),
            'instanceId': instance_id,
            'product': 'homeos',
            'clientVersion': self.settings.version,
            'nonce': secrets.token_urlsafe(24)}
        normalized_email = (email or '').strip().lower()
        if not normalized_email:
            self._record_failure('激活', '请输入购买授权时使用的邮箱。')
            raise LicenseClientError('请输入购买授权时使用的邮箱。', status_code=422)
        body['email'] = normalized_email
        # 「授权用户增设账户名」：本机账号名随激活上报，商店写入设备绑定。
        normalized_account = (account_name or '').strip()
        if normalized_account:
            body['accountName'] = normalized_account
        try:
            try:
                response = await self._post('/v2/activate', body)
            except LicenseClientError as error:
                # 随机数被服务端的重放保护拦下（多为上一次响应丢失后原样重发）：
                # 换一个新随机数重发一次即可，不必打扰用户重新输入激活码。
                if not error.is_nonce_replay:
                    raise
                body['nonce'] = secrets.token_urlsafe(24)
                response = await self._post('/v2/activate', body)
            result = self._apply_response(
                response,
                activation_code_hint=activation_code.strip()[:-9],
                activation_code=body['activationCode'],
                email=normalized_email,
                account_name=normalized_account or None)
        except (LicenseClientError, LicenseCryptoError) as error:
            self._record_failure('激活', error, sensitive_values=(activation_code, activation_code.strip(), body['activationCode'], email or '', normalized_email))
            # 只认「实例不匹配」这个码：409 也可能是重放保护拒了随机数，那跟绑定没关系，
            # 按实例冲突记下来会让用户看到「该授权已绑定其他设备」这种牛头不对马嘴的提示。
            if isinstance(error, LicenseClientError) and error.is_instance_mismatch:
                self._mark_instance_conflict(str(error))
            raise
        self._record_online_success('激活')
        self._schedule_changed.set()
        return result

    async def reactivate(self, account_name: str | None = None) -> dict:
        (licensed, encrypted_activation_code, email) = await asyncio.to_thread(self._activation_credentials)
        if not licensed:
            raise LicenseClientError(
                '当前安装尚未激活，请填写激活码完成激活。',
                status_code=409,
                code=MANUAL_ACTIVATION_REQUIRED)
        try:
            return await self.heartbeat()
        except LicenseClientError as error:
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
            return await self.activate(activation_code, email, account_name)
        except LicenseClientError as error:
            self._record_failure('重新激活', error, sensitive_values=(activation_code, email))
            raise

    async def heartbeat(self) -> dict:
        generation = self._success_generation
        async with self._credential_operation():
            if generation != self._success_generation:
                return self.status()
            with self.database.session_factory() as database:
                if self._state(database).status in TERMINAL_STATES:
                    return self._payload(self._state(database))
            return await self._heartbeat_unlocked()

    async def _heartbeat_unlocked(self) -> dict:
        with self.database.session_factory() as database:
            state = self._state(database)
            encrypted = state.encrypted_session_token
            instance_id = state.instance_id
            lease_sequence = state.lease_sequence
        if not encrypted:
            return await self._recover_unlocked()
        session_token = ''
        try:
            session_token = self.cipher.decrypt(encrypted)
            response = await self._post('/v2/heartbeat', {
                'sessionToken': session_token,
                'instanceId': instance_id,
                'leaseSequence': lease_sequence,
                'clientVersion': self.settings.version,
                'nonce': secrets.token_urlsafe(24)})
            result = self._apply_response(response)
            self._record_online_success('心跳')
            return result
        except (LicenseClientError, LicenseCryptoError) as error:
            self._record_failure('心跳', error, sensitive_values=(session_token, encrypted))
            if isinstance(error, LicenseClientError) and error.requires_rebind:
                self._mark_binding_released(str(error))
                raise LicenseClientError(str(error), status_code=error.status_code, code=error.code) from error
            if isinstance(error, LicenseClientError) and error.is_instance_mismatch:
                self._mark_instance_conflict(str(error))
                raise LicenseClientError(str(error), status_code=error.status_code, code=error.code) from error
            if isinstance(error, LicenseClientError) and error.is_access_expired:
                self._mark_access_expired(str(error))
                raise LicenseClientError(str(error), status_code=error.status_code, code='ACCESS_EXPIRED') from error
            if isinstance(error, LicenseClientError) and error.is_confirmed_revocation:
                self._mark_revoked(str(error))
                raise LicenseClientError(str(error), status_code=error.status_code) from error
            if isinstance(error, LicenseClientError) and (error.status_code == 401 or error.is_nonce_replay):
                # 401 与「随机数已使用」都说明手上的会话令牌不能用：前者是会话过期/失效，
                # 后者说明这次心跳被服务端的重放保护拦下，直接换一份新租约即可恢复。
                return await self._recover_unlocked()
            self._mark_failure(error)
            raise LicenseClientError(str(error), status_code=getattr(error, 'status_code', None), code=self._error_code) from error

    async def recover(self) -> dict:
        generation = self._success_generation
        async with self._credential_operation():
            if generation != self._success_generation:
                return self.status()
            with self.database.session_factory() as database:
                state = self._state(database)
                if state.status in TERMINAL_STATES:
                    return self._payload(state)
            return await self._recover_unlocked()

    async def retry_now(self) -> dict:
        """并发点击共用同一个任务，令牌轮换从不排队。"""
        if self._retry_task is not None and not self._retry_task.done():
            await asyncio.shield(self._retry_task)
            return self.status()
        if time.monotonic() < self._manual_retry_after:
            return self.status()
        self._manual_retry_after = time.monotonic() + 2
        self._retry_task = asyncio.create_task(self._manual_retry(), name='license-manual-retry')
        await asyncio.shield(self._retry_task)
        return self.status()

    async def _manual_retry(self) -> dict | None:
        generation = self._success_generation
        async with self._credential_operation():
            if generation != self._success_generation:
                return self.status()
            with self.database.session_factory() as database:
                state = self._state(database)
                if state.status == 'CLOCK_ROLLBACK':
                    state.status = 'ACTIVE'
                    self._validate_saved_state(state, database)
                if state.status in {'ACTIVE', 'LEASE_EXPIRED', 'CONNECTION_WARNING'}:
                    self._validate_saved_state(state, database)
                if state.status in TERMINAL_STATES - {'RECOVERY_REQUIRED', 'REMOTE_REJECTED'} or not state.license_id:
                    return self._payload(state)
            self._endpoint_pool.retry_failed()
            try:
                await self._recover_unlocked()
            except LicenseClientError:
                pass
            finally:
                self._manual_retry_after = time.monotonic() + 2
            return self.status()

    async def _recover_unlocked(self) -> dict:
        with self.database.session_factory() as database:
            state = self._state(database)
            encrypted = state.encrypted_recovery_token
            instance_id = state.instance_id
            lease_sequence = state.lease_sequence
        if not encrypted:
            self._record_failure('租约恢复', '没有可用的租约恢复凭证，请重新激活。')
            error = LicenseClientError('没有可用的租约恢复凭证，请重新激活。', code='CREDENTIAL_MISSING')
            if self._keep_valid_session('没有可用的租约恢复凭证'):
                return self.status()
            self._mark_failure(error)
            raise error
        recovery_token = ''
        try:
            recovery_token = self.cipher.decrypt(encrypted)
            response = await self._post('/v2/recover', {
                'recoveryToken': recovery_token,
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
                self._mark_binding_released(str(error))
                raise LicenseClientError(str(error), status_code=error.status_code, code=error.code) from error
            if isinstance(error, LicenseClientError) and error.is_instance_mismatch:
                self._mark_instance_conflict(str(error))
                raise LicenseClientError(str(error), status_code=error.status_code, code=error.code) from error
            if isinstance(error, LicenseClientError) and error.is_access_expired:
                self._mark_access_expired(str(error))
                raise LicenseClientError(str(error), status_code=error.status_code, code='ACCESS_EXPIRED') from error
            if isinstance(error, LicenseClientError) and error.is_confirmed_revocation:
                self._mark_revoked(str(error))
                raise LicenseClientError(str(error), status_code=error.status_code) from error
            # 恢复请求被拒 / 网络失败但本地签名租约仍有效：保持现状，不把可用授权打成终态。
            if self._keep_valid_session(str(error)):
                return self.status()
            self._mark_failure(error)
            raise LicenseClientError(str(error), status_code=getattr(error, 'status_code', None), code=self._error_code) from error

    def _keep_valid_session(self, reason: str) -> bool:
        """恢复票据不可用、但本地签名租约仍有效时，不让授权状态降级。

        恢复流程依赖商店下发的 recoveryToken：令牌在服务端被清理、或本地解密失败时，
        旧实现会把状态直接打成 RECOVERY_REQUIRED（终态），于是「授权其实还在有效期内、
        只是暂时拿不到新租约」的机器会立刻停摆。这里改为：只要本地签名租约验签通过
        且未到期，就保持现状继续提供服务，只记一条警告等下一次恢复尝试。
        """
        with self.database.session_factory() as database:
            state = self._state(database)
            if state.status not in {'ACTIVE', 'CONNECTION_WARNING', 'LEASE_EXPIRED'}:
                return False
            signed_lease = state.signed_lease or ''
            instance_id = state.instance_id
        if not signed_lease:
            return False
        try:
            body = self.verifier.verify(signed_lease, instance_id)
            expires_at = parse_timestamp(body['expiresAt'])
            issued_at = parse_timestamp(body['issuedAt'])
        except (LicenseCryptoError, KeyError, TypeError, ValueError):
            return False
        now = datetime.now(UTC)
        if issued_at > now + timedelta(seconds=self.settings.license_clock_skew_seconds):
            return False
        if expires_at <= now:
            return False
        self._error_code = None
        self._next_attempt = None
        self._log_event(
            'warning',
            f'授权租约恢复失败（{reason}），但本地租约仍有效，继续提供服务。',
        )
        return True

    def _mark_revoked(self, message: str) -> None:
        with self.database.session_factory() as database:
            state = self._state(database)
            state.status = 'REVOKED'
            state.last_error = message[:1000]
            database.commit()
        # 吊销是终态：允许缓存必须立刻失效，否则最坏情况下还能再放行 2 秒。
        self.invalidate_allow_cache()
        self._error_code = 'LICENSE_REVOKED'
        self._startup_validation_pending = False
        self._next_attempt = None
        self._record_status('REVOKED')
        self._schedule_changed.set()

    def _mark_instance_conflict(self, message: str) -> None:
        with self.database.session_factory() as database:
            state = self._state(database)
            state.status = 'INSTANCE_MISMATCH'
            state.last_error = message[:1000]
            database.commit()
        self._error_code = 'INSTANCE_MISMATCH'
        self._next_attempt = None
        self._record_status('INSTANCE_MISMATCH', message[:200])
        self._schedule_changed.set()

    def _mark_binding_released(self, message: str) -> None:
        with self.database.session_factory() as database:
            state = self._state(database)
            state.status = 'INSTANCE_CHANGED'
            state.last_error = '该授权已在商店解除设备绑定，请重新激活授权。'
            database.commit()
        self.invalidate_allow_cache()
        self._error_code = 'INSTANCE_CHANGED'
        self._next_attempt = None
        self._record_status('INSTANCE_CHANGED', message[:200])
        self._schedule_changed.set()

    def _mark_access_expired(self, message: str) -> None:
        """授权到期：不停自动重试、不清本地授权 —— 商店侧续费后下一次心跳即恢复。"""
        with self.database.session_factory() as database:
            state = self._state(database)
            state.status = 'ACCESS_EXPIRED'
            state.last_error = message[:1000]
            database.commit()
        self.invalidate_allow_cache()
        self._error_code = 'ACCESS_EXPIRED'
        self._failures = 0
        self._startup_validation_pending = False
        self._next_attempt = time.monotonic() + LICENSE_RETRY_SECONDS
        self._record_status('ACCESS_EXPIRED', message[:200])
        self._schedule_changed.set()

    def _mark_failure(self, error: Exception) -> None:
        message = str(error)
        http_status = getattr(error, 'status_code', None)
        code = getattr(error, 'code', None)
        # 服务端 409「随机数已使用」说明这次请求被重放保护拦下（多为上一次响应丢失后客户端
        # 原样重发）。错误码单列出来，前端据此重新发起，而不是提示用户重新激活。
        nonce_replay = isinstance(error, LicenseClientError) and error.is_nonce_replay
        if nonce_replay:
            code = 'LICENSE_NONCE_REPLAY'
        if code == 'LICENSE_RATE_LIMITED':
            self._rate_limited_until = time.monotonic() + RATE_LIMIT_COOLDOWN_SECONDS
        self._failures += 1
        retry = True
        delay = 2 if http_status == 401 else RETRY_DELAYS[min(self._failures - 1, len(RETRY_DELAYS) - 1)]
        with self.database.session_factory() as database:
            state = self._state(database)
            if state.status in TERMINAL_STATES - {'RECOVERY_REQUIRED', 'REMOTE_REJECTED'}:
                retry = False
                code = code or state.status
            elif isinstance(error, LicenseCryptoError) or code == 'CREDENTIAL_MISSING':
                state.status = 'INVALID' if isinstance(error, LicenseCryptoError) else 'RECOVERY_REQUIRED'
                code = code or 'CREDENTIAL_INVALID'
                retry = False
            elif http_status == 401:
                retry = state.status not in {'RECOVERY_RETRY', 'RECOVERY_REQUIRED'}
                state.status = 'RECOVERY_RETRY' if retry else 'RECOVERY_REQUIRED'
                code = code or 'RECOVERY_TOKEN_INVALID'
            elif http_status is not None and 400 <= http_status < 500 and http_status not in {408, 429} and not nonce_replay:
                state.status = 'REMOTE_REJECTED'
                code = code or 'LICENSE_REMOTE_REJECTED'
                retry = False
            elif state.status in {'RECOVERY_RETRY', 'REMOTE_REJECTED', 'RECOVERY_REQUIRED'}:
                code = code or 'NETWORK_UNAVAILABLE'
                retry = state.status == 'RECOVERY_RETRY'
            else:
                expires = aware(state.lease_expires_at)
                state.status = 'CONNECTION_WARNING' if expires and expires > datetime.now(UTC) else 'LEASE_EXPIRED'
                code = code or 'NETWORK_UNAVAILABLE'
            state.last_error = message[:1000]
            database.commit()
            self._record_status(state.status)
        self._error_code = code
        self._next_attempt = time.monotonic() + delay if retry else None
        self._startup_validation_pending = False
        self._schedule_changed.set()

    @staticmethod
    def _heartbeat_wait_seconds(state: LicenseState, now: datetime | None = None) -> float | None:
        if not state.license_id or state.status in TERMINAL_STATES:
            return None
        if state.status == 'RECOVERY_RETRY':
            return 2
        if state.status == 'LEASE_EXPIRED':
            return float(LICENSE_RETRY_SECONDS)
        interval = float(LICENSE_RETRY_SECONDS if state.status == 'CONNECTION_WARNING' else max(min_heartbeat_seconds(), state.heartbeat_interval_seconds))
        expires = aware(state.lease_expires_at)
        if expires is None:
            return interval
        remaining = (expires - (now or datetime.now(UTC))).total_seconds()
        return max(0, min(interval, remaining))

    def _scheduled_wait_seconds(self, state: LicenseState) -> float | None:
        if not state.license_id or state.status in TERMINAL_STATES:
            return None
        if self._next_attempt is not None:
            return max(0.0, self._next_attempt - time.monotonic())
        return self._heartbeat_wait_seconds(state)

    async def _heartbeat_loop(self) -> None:
        while not self._stop.is_set():
            self._schedule_changed.clear()
            with self.database.session_factory() as database:
                wait_seconds = self._scheduled_wait_seconds(self._state(database))
            try:
                await asyncio.wait_for(self._schedule_changed.wait(), timeout=wait_seconds)
            except TimeoutError:
                with self.database.session_factory() as database:
                    state = self._state(database)
                    if not state.license_id or state.status in TERMINAL_STATES:
                        continue
                    if self._schedule_changed.is_set():
                        continue
                    recover = self._startup_validation_pending or state.status in {'LEASE_EXPIRED', 'RECOVERY_RETRY'}
                    expires = aware(state.lease_expires_at)
                    recover = recover or bool(expires and expires <= datetime.now(UTC))
                self._endpoint_pool.retry_failed()
                try:
                    if recover:
                        await self.recover()
                    else:
                        await self.heartbeat()
                except LicenseClientError:
                    continue
                except Exception as error:
                    error_name = type(error).__name__
                    self._log_event('error', f'''授权检查发生异常（{error_name}），后台稍后重试。''')
                    self._mark_failure(LicenseClientError('授权检查暂时失败，请稍后重试。', code='LICENSE_CHECK_FAILED'))
                if self._stop.is_set():
                    break

    @staticmethod
    def _signed_timestamp(payload: dict, key: str) -> datetime | None:
        """读签名租约里的时间戳；缺失或格式异常时返回 ``None``（由调用方决定降级口径）。"""
        raw = payload.get(key)
        if not isinstance(raw, str) or not raw:
            return None
        try:
            return aware(parse_timestamp(raw))
        except (LicenseCryptoError, TypeError, ValueError):
            return None

    @staticmethod
    def _mask_email(email: str | None) -> str | None:
        """邮箱脱敏：``ab***@example.com``。状态面板要展示又不宜全明文。"""
        value = (email or '').strip()
        if not value or '@' not in value:
            return value or None
        local, _, domain = value.partition('@')
        if len(local) <= 2:
            masked_local = local[:1] + '***'
        else:
            masked_local = local[:2] + '***'
        return f'{masked_local}@{domain}'

    def _public_key_fingerprint(self) -> str:
        """授权公钥指纹（只给前后缀），供状态页核对是否与商店发布一致。"""
        raw = (self.settings.license_public_key_sha256 or '').strip()
        if not raw:
            return ''
        if len(raw) <= 20:
            return raw
        return f'{raw[:8]}…{raw[-8:]}'

    def _public_key_fingerprint_full(self) -> str:
        """完整公钥 SHA-256 指纹（64 位十六进制），仅供已登录的本机管理页比对。"""
        return (self.settings.license_public_key_sha256 or '').strip()

    def _full_activation_code(self, state: LicenseState) -> str | None:
        """解密库里的完整激活码，供已登录的本机管理页展示 / 抄录。

        激活码只以 Fernet 密文落库（密钥在本机 ``license_secret_key_path``），这里解密失败
        （密钥轮换、密文损坏）时返回 ``None``，由前端回落到 ``activationCodeHint``，
        不能让凭证问题连带把整个状态接口打挂。
        """
        if not state.encrypted_activation_code:
            return None
        try:
            return self.cipher.decrypt(state.encrypted_activation_code)
        except LicenseCryptoError:
            return None

    def _resolve_signed_lease_dict(self, state: LicenseState) -> dict:
        """校验签名租约；失败时返回空 dict（与原先内联逻辑一致）。"""
        # 时间锚点用**服务端签名的时间**，不用可变的本地 ``last_verified_at``：租约的
        # ``issuedAt``/``expiresAt`` 由商店私钥签名，本机改不动，所以它才是「现在到底
        # 该不该有效」的可信起点。以前靠 ``last_verified_at``（本地列）判时间回拨，
        # 清空这一列就能绕过，而签名时间戳绕不过去。
        if not state.signed_lease:
            return {}
        try:
            return self.verifier.verify(state.signed_lease, state.instance_id)
        except LicenseCryptoError:
            return {}

    def _resolve_effective_license_status(
        self,
        state: LicenseState,
        *,
        signed_lease: dict,
        now: datetime,
    ) -> tuple[str, str | None, bool]:
        """推算面板用的有效状态 / 错误文案 / 是否已验证通过。"""
        effective_status = state.status
        effective_error = state.last_error
        skew = timedelta(seconds=self.settings.license_clock_skew_seconds)
        server_issued_at = self._signed_timestamp(signed_lease, 'issuedAt')
        if server_issued_at is not None and server_issued_at > now + skew:
            effective_status = 'CLOCK_ROLLBACK'
            effective_error = '授权服务器签发的租约时间晚于本机时间，请校准系统时间后重试。'
        lease_expires = self._signed_timestamp(signed_lease, 'expiresAt') or aware(state.lease_expires_at)
        if effective_status != 'CLOCK_ROLLBACK' and lease_expires and lease_expires <= now and effective_status in {'ACTIVE', 'CONNECTION_WARNING'}:
            effective_status = 'LEASE_EXPIRED'
            if not effective_error:
                effective_error = '授权租约已到期。'
        if self.settings.license_required and self._startup_validation_pending and effective_status in {'ACTIVE', 'CONNECTION_WARNING'}:
            effective_status = 'STARTUP_VALIDATION_REQUIRED'
            effective_error = state.last_error or '服务重启后正在等待授权后台确认最新租约。'
        self._record_status(effective_status)
        allowed = self._verified_access(state)
        if not allowed and effective_status in {'ACTIVE', 'CONNECTION_WARNING', 'STARTUP_VALIDATION_REQUIRED'}:
            effective_status = 'INVALID'
            effective_error = '本地授权签名或会话记录校验失败，请联系管理员检查。'
        return effective_status, effective_error, allowed

    def _lease_features_and_products(
        self,
        state: LicenseState,
        *,
        signed_lease: dict,
        allowed: bool,
    ) -> tuple[list, list[dict]]:
        """从签名租约（或本地缓存）取出 features 列表与可见商品。"""
        # 能力清单同样以**签名租约**为准（服务端签的 features/entitlements 不可被改），
        # ``feature_set`` 只是本地缓存，租约不可读时才退回它。
        lease_features = signed_lease.get('features')
        if not isinstance(lease_features, list):
            try:
                lease_features = json.loads(state.feature_set or '[]')
            except json.JSONDecodeError:
                lease_features = []
        visible_products: list[dict] = []
        raw_products = signed_lease.get('products')
        if isinstance(raw_products, list):
            for product_entry in raw_products:
                if not isinstance(product_entry, dict) or not isinstance(product_entry.get('name'), str):
                    continue
                product_name = product_entry['name'].strip()
                if not product_name:
                    continue
                product_type = product_entry.get('type') if isinstance(product_entry.get('type'), str) else 'module'
                expires_at = product_entry.get('expiresAt') if isinstance(product_entry.get('expiresAt'), str) else None
                visible_products.append({
                    'name': product_name,
                    'type': product_type,
                    'expiresAt': expires_at})
        if allowed and not visible_products:
            visible_products = [{
                'name': '基础版',
                'type': 'base',
                'expiresAt': None}]
        return lease_features, visible_products

    def _build_license_status_body(
        self,
        state: LicenseState,
        *,
        now: datetime,
        status_triple: tuple[str, str | None, bool],
        lease_bundle: tuple[list, list[dict], Any],
    ) -> dict:
        """装配 ``/status`` 响应体（含能力码、商品、重试字段）。"""
        effective_status, effective_error, allowed = status_triple
        lease_features, visible_products, entitlements = lease_bundle
        entitlement_codes = active_entitlement_codes(entitlements, now=now)
        granted_codes = expand(
            feature_code for feature_code in lease_features if isinstance(feature_code, str)
        )

        def _granted(code: str) -> bool:
            """单码判定：未验证通过（无授权 / 校验失败）时一律 false。

            直接委托 ``features.granted``（路由门禁 ``require_license_feature`` 的同一实现）。
            """
            if not (state.license_id and allowed):
                return False
            return granted(lease_features, entitlements, code, now=now)

        # 面板展示「这台上现在可用的码」：租约 features 与权益码的并集，再逐码过同一判定。
        # 目录里没有的未知码也如实列出（商店签了新码时便于排查），可见性由 allowed 收口。
        available_codes = granted_codes | expand(entitlement_codes)
        visible_features = [code for code in sorted(available_codes) if _granted(code)]
        return {
            'required': self.settings.license_required,
            'allowed': allowed,
            'editorAllowed': _granted(FEATURE_EDITOR),
            'status': effective_status,
            'statusLabel': STATUS_LABELS.get(effective_status, effective_status),
            'instanceId': state.instance_id,
            'activationCodeId': state.license_id,
            'activationCodeHint': state.activation_code_hint,
            # 完整凭证 / 标识：只随 ``/status``（登录会话）下发，``availability()`` 会过滤掉。
            'activationCode': self._full_activation_code(state),
            'activationEmailFull': state.activation_email or None,
            'publicKeyFingerprintFull': self._public_key_fingerprint_full(),
            'activationEmail': self._mask_email(state.activation_email),
            'accountName': state.activated_by,
            'publicKeyFingerprint': self._public_key_fingerprint(),
            'leaseId': state.lease_id,
            'leaseSequence': state.lease_sequence,
            'edition': (
                state.product_edition or edition_from_products(visible_products)
            ) if allowed else None,
            'features': visible_features if allowed else [],
            'featureAccess': {
                'editor': _granted(FEATURE_EDITOR),
                'interaction3d': _granted(FEATURE_INTERACTION_3D),
                # 增量模块统一展开：前端导航/视图按标志显隐，不必各自硬编码码串。
                **{
                    code: _granted(code)
                    for code in sorted(MODULE_FEATURES)
                },
            },
            'products': visible_products if allowed else [],
            'entitlements': (
                [
                    {
                        'code': entitlement_entry.get('code'),
                        'startsAt': entitlement_entry.get('startsAt'),
                        'expiresAt': entitlement_entry.get('expiresAt')}
                    for entitlement_entry in entitlements
                    if isinstance(entitlement_entry, dict) and isinstance(entitlement_entry.get('code'), str)
                ]
                if allowed and isinstance(entitlements, list)
                else []
            ),
            'heartbeatIn': state.heartbeat_interval_seconds,
            'leaseIssuedAt': aware(state.lease_issued_at),
            'leaseExpiresAt': aware(state.lease_expires_at),
            'lastHeartbeatAt': aware(state.last_heartbeat_at),
            'lastVerifiedAt': aware(state.last_verified_at),
            'lastError': effective_error,
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
            'canRetry': bool(state.license_id and effective_status not in TERMINAL_STATES - {'CLOCK_ROLLBACK', 'REMOTE_REJECTED', 'RECOVERY_REQUIRED'}),
            'retrying': self._heartbeat_lock.locked(),
            'retryAttempt': self._failures,
            'nextRetryAt': (now + timedelta(seconds=max(0, self._next_attempt - time.monotonic()))).isoformat() if self._next_attempt is not None and effective_status not in TERMINAL_STATES else None,
            'startupValidationPending': self._startup_validation_pending,
        }

    def _payload(self, state: LicenseState) -> dict:
        now = datetime.now(UTC)
        signed_lease = self._resolve_signed_lease_dict(state)
        status_triple = self._resolve_effective_license_status(
            state, signed_lease=signed_lease, now=now
        )
        lease_features, visible_products = self._lease_features_and_products(
            state, signed_lease=signed_lease, allowed=status_triple[2]
        )
        return self._build_license_status_body(
            state,
            now=now,
            status_triple=status_triple,
            lease_bundle=(lease_features, visible_products, signed_lease.get('entitlements')),
        )

    def status(self) -> dict:
        with self.database.session_factory() as database:
            return self._payload(self._state(database))

    def earliest_entitlement_expiry(self, codes: Collection[str]) -> datetime:
        """取「租约整体到期时间」与指定权益到期时间中最早的一个。"""
        with self.database.session_factory() as database:
            state = self._state(database)
            payload = self.verifier.verify(state.signed_lease or '', state.instance_id)
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

    def availability(self) -> dict:
        """公开的恢复外壳不返回任何标识、凭证或原始错误。"""
        result = self.status()
        output = {key: result[key] for key in ('status', 'errorCode', 'retryable', 'canRetry', 'retrying', 'retryAttempt', 'nextRetryAt')}
        output['displayAllowed'] = self.allows('display')
        return output

    def _verified_access(self, state: LicenseState, feature: str | None = None) -> bool:
        """重新校验签名租约，而不是信任可变的 SQLite 状态字段。"""
        if not self.settings.license_required:
            return True
        if state.status not in {'ACTIVE', 'CONNECTION_WARNING'}:
            return False
        if not (state.signed_lease and state.license_id and state.lease_id and state.session_id):
            self._record_failure('本地校验', '授权记录缺少签名租约或租约关联信息。')
            return False
        try:
            body = self.verifier.verify(state.signed_lease, state.instance_id)
            issued_at = parse_timestamp(body['issuedAt'])
            expires_at = parse_timestamp(body['expiresAt'])
        except LicenseCryptoError as error:
            self._record_failure('本地校验', error, sensitive_values=(state.signed_lease,))
            return False
        now = datetime.now(UTC)
        # 时间回拨只以签名租约为锚：``issuedAt`` 晚于本机就说明本机时钟落后。
        # 这里不再参考本地 ``last_verified_at`` —— 那是可写列，抹掉它就能让回拨检测失效，
        # 而签名时间戳必须拿到商店私钥才能伪造。
        if issued_at > now + timedelta(seconds=self.settings.license_clock_skew_seconds):
            self._record_failure('本地校验', '授权服务器时间明显晚于本机时间，请先校准系统时间。')
            return False
        if expires_at <= now:
            self._record_failure('本地校验', '授权租约已到期。')
            return False
        if body['activationCodeId'] != state.license_id:
            self._record_failure('本地校验', '本地授权标识与签名租约不一致。')
            return False
        if body['leaseId'] != state.lease_id or body['sessionId'] != state.session_id:
            self._record_failure('本地校验', '本地租约或会话标识与签名租约不一致。')
            return False
        if body['leaseSequence'] != state.lease_sequence:
            self._record_failure('本地校验', '本地租约序号与签名租约不一致。')
            return False
        features = body.get('features')
        if not isinstance(features, list) or not all(isinstance(item, str) for item in features):
            self._record_failure('本地校验', '签名租约中的权益列表无效。')
            return False
        self._record_local_success()
        if feature is None:
            return True
        # 判定只走 features.granted（``all`` 展开 + 蕴含 + 未过期 entitlements）。
        return granted(features, body.get('entitlements'), feature, now=now)

    def invalidate_allow_cache(self) -> None:
        self._allow_cache.clear()
        self._identity_snapshot = None

    def allows(self, feature: str | None = None, *, database=None) -> bool:
        feature_key = feature or "*"
        # 快路径：授权判定本身已有 2s 缓存，但缓存键里带着 (lease_id, lease_sequence)，
        # 而这两个值原先只能靠每条受保护请求读一次 LicenseState 才拿得到 —— 于是
        # 每个请求都固定多出 1 次 SQLite 读（基线里 /assets/*、/ha/entities 的
        # DB/req = 3 就是这么来的）。这里把最近一次读到的租约身份连同一个短 TTL 记下来，
        # 命中的请求直接返回缓存判定，不再开 session。
        # 陈旧窗口与 _allow_cache 的 TTL 相同（2s），不额外放宽任何语义。
        now = time.monotonic()
        if database is None:
            snapshot = self._identity_snapshot
            if snapshot is not None and snapshot[0] > now:
                cached = self._allow_cache.get((snapshot[1], snapshot[2], feature_key))
                if cached is not None and cached[0] > now:
                    return cached[1]

        def _evaluate(state: LicenseState) -> bool:
            cache_key = (str(state.lease_id or ""), int(state.lease_sequence or 0), feature_key)
            now = time.monotonic()
            cached = self._allow_cache.get(cache_key)
            if cached is not None and cached[0] > now:
                self._remember_identity(cache_key, now)
                return cached[1]
            allowed = self._verified_access(state, feature)
            self._allow_cache[cache_key] = (now + self._allow_cache_ttl_seconds, allowed)
            # 粗暴限长，避免特征组合膨胀
            if len(self._allow_cache) > 64:
                self._allow_cache.clear()
                self._allow_cache[cache_key] = (now + self._allow_cache_ttl_seconds, allowed)
            self._remember_identity(cache_key, now)
            return allowed

        if database is not None:
            state = database.scalar(select(LicenseState).limit(1))
            if state is None or state.instance_id != self._instance_id():
                return False
            return _evaluate(state)
        with self.database.session_factory() as session:
            return _evaluate(self._state(session))

    def _remember_identity(self, cache_key: tuple[str, int, str], now: float) -> None:
        """记下本次判定所用的租约身份，供 :meth:`allows` 的快路径在 TTL 内复用。"""
        self._identity_snapshot = (now + self._allow_cache_ttl_seconds, cache_key[0], cache_key[1])
