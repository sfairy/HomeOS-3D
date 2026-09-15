from __future__ import annotations

import asyncio
import json
import os
import secrets
import threading
import time
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import httpx
from sqlalchemy import select

from ..config import Settings
from ..database import Database
from ..global_log import GlobalLogStore
from ..models import LicenseState
from .crypto import LeaseVerifier, LicenseCryptoError, LicenseTransportCipher, SecretCipher, parse_timestamp
from .endpoints import LicenseEndpointPool


class LicenseClientError(RuntimeError):

    def __init__(self, message: str, *, status_code: int | None = None) -> None:
        super().__init__(message)
        self.status_code = status_code

    @property
    def is_confirmed_revocation(self) -> bool:
        """Return true only when the authorization service confirms revocation.

        A 401/403 can also mean an expired session, a stale recovery token, or
        a transient race while authorization nodes converge.  Those cases must
        preserve the local license so the client can retry recovery.
        """
        if self.status_code not in frozenset({401, 403}):
            return False
        detail = str(self)
        return any(message in detail for message in ('实例绑定已停用', '客户授权或激活码已停用', '客户、激活码或实例绑定已停用', '商品授权有效期已结束'))


EXPIRED_LEASE_RETRY_SECONDS = 30
BASE_FEATURES = {
    'api',
    'assets',
    'editor',
    'display',
    'ha.sync',
    'ui.base',
    'ha.control',
    'ha.configure',
    'projects.write',
    'runtime.websocket'}


def aware(value: datetime | None) -> datetime | None:
    if value is None or value.tzinfo is not None:
        return value
    return value.replace(tzinfo=timezone.utc)


class LicenseService:

    def __init__(self, settings: Settings, database: Database, transport: httpx.AsyncBaseTransport | None, *, endpoint_pool: LicenseEndpointPool | None = None, event_log: GlobalLogStore | None = None) -> None:
        self.settings = settings
        self.database = database
        self.event_log = event_log
        self._event_lock = threading.RLock()
        self._observed_status = None
        self._event_failures = {}
        self.verifier = LeaseVerifier(trusted_keys=settings.license_trusted_public_keys, legacy_key_id=settings.license_legacy_key_id)
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

    def _log_event(self, level: str, message: str) -> None:
        if self.event_log is None:
            return
        try:
            self.event_log.append(level, '授权服务', '授权', message)
        except Exception:
            pass

    def _record_status(self, status: str, reason: str | None = None) -> None:
        labels = {
            'UNACTIVATED': '未激活',
            'ACTIVE': '正常',
            'CONNECTION_WARNING': '连接异常',
            'LEASE_EXPIRED': '租约已到期',
            'REVOKED': '已吊销',
            'INVALID': '校验无效',
            'INSTANCE_MISMATCH': '安装标识不匹配',
            'CLOCK_ROLLBACK': '系统时间异常',
            'DEACTIVATED': '已停用',
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
            level = 'success' if status == 'ACTIVE' else 'info' if status in frozenset({'DEACTIVATED', 'UNACTIVATED'}) else 'warning'
            if status in frozenset({'INVALID', 'REVOKED', 'CLOCK_ROLLBACK', 'INSTANCE_MISMATCH'}):
                level = 'error'
            self._log_event(level, message)

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
            self._log_event('error' if operation in frozenset({'激活', '本地校验'}) else 'warning', f'''授权{operation}失败（累计 {failure['count']} 次{suffix}）：{reason}''')

    def _record_online_success(self, operation: str) -> None:
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
        return 16 <= len(value) <= 64 and all(character.isalnum() or character in '-_.:' for character in value)

    def _instance_id(self, preferred_instance_id: str | None = None) -> str:
        if self._cached_instance_id:
            return self._cached_instance_id
        path = self.settings.instance_id_path
        path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        try:
            saved = path.read_text(encoding='utf-8').strip()
        except OSError:
            saved = ''
        preferred = (preferred_instance_id or '').strip()
        if self._valid_instance_id(preferred):
            value = preferred
        elif self._valid_instance_id(saved):
            value = saved
        else:
            value = str(uuid4())
        if saved != value:
            temporary = path.with_name(f'''.{path.name}.tmp''')
            descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
            with os.fdopen(descriptor, 'w', encoding='utf-8') as output:
                output.write(value + '\n')
            os.replace(temporary, path)
        os.chmod(path, 0o600)
        self._cached_instance_id = value
        return value

    def _state(self, database) -> LicenseState:
        state = database.scalar(select(LicenseState).limit(1))
        instance_id = self._instance_id(state.instance_id if state and state.license_id else None)
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
            state.status = 'INSTANCE_MISMATCH' if state.license_id else 'UNACTIVATED'
            state.last_error = '检测到安装 UUID 与授权记录不一致，请重新绑定当前安装。' if state.license_id else None
            database.commit()
            self._record_status(state.status, state.last_error)
        return state

    async def start(self) -> None:
        with self.database.session_factory() as database:
            state = self._state(database)
            self._validate_saved_state(state, database)
            self._startup_validation_pending = bool(self.settings.license_required and state.license_id and state.signed_lease)
            self._record_status('STARTUP_VALIDATION_REQUIRED' if self._startup_validation_pending else state.status)
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
                    self._clear_startup_validation()
        if self._endpoint_pool.configured:
            self._stop.clear()
            self._task = asyncio.create_task(self._heartbeat_loop(), name='license-heartbeat')

    async def stop(self) -> None:
        self._stop.set()
        self._schedule_changed.set()
        tasks = [task for task in (self._task,) if task is not None]
        if tasks:
            await asyncio.gather(*tasks)
        self._task = None

    def _validate_saved_state(self, state: LicenseState, database) -> None:
        if not state.signed_lease or state.status in frozenset({'DEACTIVATED', 'UNACTIVATED'}):
            return
        try:
            payload = self.verifier.verify(state.signed_lease, state.instance_id)
            if payload['leaseSequence'] != state.lease_sequence:
                raise LicenseCryptoError('本地租约序号与签名租约不一致。')
            expires = parse_timestamp(payload['expiresAt'])
            now = datetime.now(timezone.utc)
            last_verified = aware(state.last_verified_at)
            if last_verified and now + timedelta(seconds=self.settings.license_clock_skew_seconds) < last_verified:
                state.status = 'CLOCK_ROLLBACK'
                state.last_error = '检测到系统时间回拨，请校准系统时间后重新验证授权。'
            else:
                state.status = 'ACTIVE' if expires > now else 'LEASE_EXPIRED'
                state.last_verified_at = now
                state.last_error = None
        except LicenseCryptoError as error:
            state.status = 'INSTANCE_MISMATCH' if '当前实例' in str(error) else 'INVALID'
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
        last_failure = None
        async with httpx.AsyncClient(transport=self._transport, timeout=self.settings.license_request_timeout_seconds) as client:
            for endpoint in candidates:
                request_payload, response_key = self.transport_cipher.encrypt_request(payload, path)
                try:
                    response = await client.post(f'''{endpoint.base_url}{path}''', json=request_payload)
                except httpx.HTTPError:
                    self._endpoint_pool.mark_failed(endpoint.base_url)
                    last_failure = LicenseClientError('无法连接授权服务器。')
                    continue
                if response.status_code >= 500:
                    self._endpoint_pool.mark_failed(endpoint.base_url)
                    last_failure = LicenseClientError(self._response_error_detail(response), status_code=response.status_code)
                    continue
                if response.status_code >= 400:
                    raise LicenseClientError(self._response_error_detail(response), status_code=response.status_code)
                if not response.content:
                    return {}
                try:
                    parsed = response.json()
                except ValueError:
                    self._endpoint_pool.mark_failed(endpoint.base_url)
                    last_failure = LicenseClientError('授权服务器响应格式无效。')
                    continue
                if not isinstance(parsed, dict):
                    self._endpoint_pool.mark_failed(endpoint.base_url)
                    last_failure = LicenseClientError('授权服务器响应格式无效。')
                    continue
                try:
                    parsed = self.transport_cipher.decrypt_response(parsed, path, response_key)
                except LicenseCryptoError as error:
                    self._endpoint_pool.mark_failed(endpoint.base_url)
                    last_failure = LicenseClientError(str(error))
                    continue
                return parsed
        raise last_failure or LicenseClientError('无法连接授权服务器。')

    @staticmethod
    def _response_error_detail(response: httpx.Response) -> str:
        try:
            parsed = response.json()
            detail = parsed.get('detail', '授权服务器拒绝请求。') if isinstance(parsed, dict) else '授权服务器拒绝请求。'
        except ValueError:
            detail = '授权服务器拒绝请求。'
        return str(detail)

    def _apply_response(self, response: dict, *, activation_code_hint: str | None = None) -> dict:
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
                state.status = 'CLOCK_ROLLBACK'
                state.last_error = '授权服务器时间明显晚于本机时间，请先校准系统时间。'
                database.commit()
                self._record_status(state.status, state.last_error)
                raise LicenseClientError(state.last_error)
            if expires_at <= now:
                state.status = 'LEASE_EXPIRED'
                state.last_error = '授权服务器返回了已到期租约。'
                database.commit()
                self._record_status(state.status, state.last_error)
                raise LicenseClientError(state.last_error)
            if payload['activationCodeId'] == state.license_id and lease_sequence <= state.lease_sequence and state.signed_lease != signed_lease:
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
            state.product_edition = 'full'
            features = payload.get('features')
            if not isinstance(features, list) or not all(isinstance(item, str) for item in features):
                state.status = 'INVALID'
                state.last_error = '授权服务器返回的权益列表无效。'
                database.commit()
                self._record_status(state.status, state.last_error)
                raise LicenseClientError(state.last_error)
            state.feature_set = json.dumps(features, ensure_ascii=False, separators=(',', ':'))
            state.max_projects = 0
            state.max_displays = 0
            state.heartbeat_interval_seconds = max(30, int(response.get('heartbeatIn', 300)))
            state.last_error = None
            state.deactivated_at = None
            if state.activated_at is None:
                state.activated_at = datetime.now(timezone.utc)
            if activation_code_hint:
                state.activation_code_hint = activation_code_hint
            if response.get('sessionToken'):
                state.encrypted_session_token = self.cipher.encrypt(response['sessionToken'])
            if response.get('recoveryToken'):
                state.encrypted_recovery_token = self.cipher.encrypt(response['recoveryToken'])
            database.commit()
            self._startup_validation_pending = False
            return self._payload(state)

    async def activate(self, activation_code: str, email: str | None = None) -> dict:
        with self.database.session_factory() as database:
            state = self._state(database)
            instance_id = state.instance_id
        payload = {
            'activationCode': activation_code.strip().upper(),
            'instanceId': instance_id,
            'product': 'homeos',
            'clientVersion': self.settings.version,
            'nonce': secrets.token_urlsafe(24)}
        normalized_email = (email or '').strip().lower()
        if not normalized_email:
            self._record_failure('激活', '请输入购买授权时使用的邮箱。')
            raise LicenseClientError('请输入购买授权时使用的邮箱。', status_code=422)
        payload['email'] = normalized_email
        try:
            response = await self._post('/v2/activate', payload)
            result = self._apply_response(response, activation_code_hint=activation_code.strip()[:-9])
        except (LicenseClientError, LicenseCryptoError) as error:
            self._record_failure('激活', error, sensitive_values=(activation_code, activation_code.strip(), payload['activationCode'], email or '', normalized_email))
            raise
        self._record_online_success('激活')
        self._schedule_changed.set()
        return result

    async def heartbeat(self) -> dict:
        async with self._heartbeat_lock:
            return await self._heartbeat_unlocked()

    async def _heartbeat_unlocked(self) -> dict:
        with self.database.session_factory() as database:
            state = self._state(database)
            encrypted = state.encrypted_session_token
            lease_sequence = state.lease_sequence
        if not encrypted:
            return await self._recover_unlocked()
        session_token = ''
        try:
            session_token = self.cipher.decrypt(encrypted)
            response = await self._post('/v2/heartbeat', {
                'sessionToken': session_token,
                'leaseSequence': lease_sequence,
                'clientVersion': self.settings.version,
                'nonce': secrets.token_urlsafe(24)})
            result = self._apply_response(response)
            self._record_online_success('心跳')
            return result
        except (LicenseClientError, LicenseCryptoError) as error:
            self._record_failure('心跳', error, sensitive_values=(session_token, encrypted))
            if isinstance(error, LicenseClientError) and error.status_code == 401:
                return await self._recover_unlocked()
            if isinstance(error, LicenseClientError) and error.is_confirmed_revocation:
                self._mark_revoked(str(error))
                raise LicenseClientError(str(error), status_code=error.status_code) from error
            self._mark_failure(str(error))
            raise LicenseClientError(str(error)) from error

    async def recover(self) -> dict:
        async with self._heartbeat_lock:
            return await self._recover_unlocked()

    async def _recover_unlocked(self) -> dict:
        with self.database.session_factory() as database:
            state = self._state(database)
            encrypted = state.encrypted_recovery_token
            instance_id = state.instance_id
            lease_sequence = state.lease_sequence
        if not encrypted:
            self._record_failure('租约恢复', '没有可用的租约恢复凭证，请重新激活。')
            raise LicenseClientError('没有可用的租约恢复凭证，请重新激活。')
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
            if isinstance(error, LicenseClientError) and error.is_confirmed_revocation:
                self._mark_revoked(str(error))
                raise LicenseClientError(str(error), status_code=error.status_code) from error
            self._mark_failure(str(error))
            raise LicenseClientError(str(error)) from error

    def _mark_revoked(self, message: str) -> None:
        with self.database.session_factory() as database:
            state = self._state(database)
            state.license_id = None
            state.lease_id = None
            state.session_id = None
            state.lease_sequence = 0
            state.activation_code_hint = None
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
            state.last_error = message[:1000]
            state.deactivated_at = datetime.now(timezone.utc)
            database.commit()
            self._record_status(state.status)
        self._startup_validation_pending = False
        self._schedule_changed.set()

    def _mark_failure(self, message: str) -> None:
        with self.database.session_factory() as database:
            state = self._state(database)
            expires = aware(state.lease_expires_at)
            state.status = 'CONNECTION_WARNING' if expires and expires > datetime.now(timezone.utc) else 'LEASE_EXPIRED'
            state.last_error = message[:1000]
            database.commit()
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
        if not state.license_id:
            return None
        if state.status == 'LEASE_EXPIRED':
            return float(EXPIRED_LEASE_RETRY_SECONDS)
        interval = float(max(30, state.heartbeat_interval_seconds))
        expires = aware(state.lease_expires_at)
        if expires is None:
            return interval
        remaining = (expires - (now or datetime.now(timezone.utc))).total_seconds()
        return max(0, min(interval, remaining))

    async def _heartbeat_loop(self) -> None:
        while not self._stop.is_set():
            self._schedule_changed.clear()
            with self.database.session_factory() as database:
                state = self._state(database)
                wait_seconds = self._heartbeat_wait_seconds(state)
            try:
                await asyncio.wait_for(self._schedule_changed.wait(), timeout=wait_seconds)
            except TimeoutError:
                with self.database.session_factory() as database:
                    state = self._state(database)
                    status = state.status
                    has_license = bool(state.license_id)
                    expires = aware(state.lease_expires_at)
                    lease_expired = bool(expires and expires <= datetime.now(timezone.utc))
                if not has_license:
                    continue
                try:
                    if status == 'LEASE_EXPIRED' or lease_expired:
                        await self.recover()
                    else:
                        await self.heartbeat()
                except LicenseClientError:
                    continue
                except Exception as error:
                    self._log_event('error', f'''授权自动续租任务意外停止（{type(error).__name__}）。''')
                    raise
                if self._stop.is_set():
                    break

    def _payload(self, state: LicenseState) -> dict:
        effective_status = state.status
        effective_error = state.last_error
        now = datetime.now(timezone.utc)
        last_verified = aware(state.last_verified_at)
        lease_expires = aware(state.lease_expires_at)
        if last_verified and now + timedelta(seconds=self.settings.license_clock_skew_seconds) < last_verified:
            effective_status = 'CLOCK_ROLLBACK'
            effective_error = '检测到系统时间回拨，请校准系统时间后重新验证授权。'
        elif lease_expires and lease_expires <= now and effective_status in frozenset({'ACTIVE', 'CONNECTION_WARNING'}):
            effective_status = 'LEASE_EXPIRED'
            if not effective_error:
                effective_error = '授权租约已到期。'
        if self.settings.license_required and self._startup_validation_pending:
            effective_status = 'STARTUP_VALIDATION_REQUIRED'
            effective_error = '服务重启后必须先连接授权后台确认最新租约；联网成功后会自动恢复。'
        self._record_status(effective_status)
        allowed = self._verified_access(state)
        editor_allowed = self._verified_access(state, 'editor')
        try:
            stored_features = json.loads(state.feature_set or '[]')
        except json.JSONDecodeError:
            stored_features = []
        if not isinstance(stored_features, list):
            stored_features = []
        if 'all' in stored_features:
            visible_features = sorted(BASE_FEATURES)
        else:
            visible_features = [item for item in stored_features if isinstance(item, str)]
        visible_products = []
        if state.signed_lease:
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
                    product_type = item.get('type') if isinstance(item.get('type'), str) else 'module'
                    expires_at = item.get('expiresAt') if isinstance(item.get('expiresAt'), str) else None
                    visible_products.append({
                        'name': product_name,
                        'type': product_type,
                        'expiresAt': expires_at})
        if state.license_id and not visible_products:
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
            'features': visible_features if state.license_id else [],
            'featureAccess': {
                'editor': bool(state.license_id and 'editor' in visible_features and editor_allowed),
                'interaction3d': bool(state.license_id and 'module.3d_interaction' in visible_features and self._verified_access(state, 'module.3d_interaction')),
                'uiPack': bool(state.license_id and any(code.startswith('ui.') and code != 'ui.base' and self._verified_access(state, code) for code in visible_features))},
            'products': visible_products if state.license_id else [],
            'heartbeatIn': state.heartbeat_interval_seconds,
            'leaseIssuedAt': aware(state.lease_issued_at),
            'leaseExpiresAt': aware(state.lease_expires_at),
            'lastHeartbeatAt': aware(state.last_heartbeat_at),
            'lastVerifiedAt': aware(state.last_verified_at),
            'lastError': effective_error}

    def status(self) -> dict:
        with self.database.session_factory() as database:
            return self._payload(self._state(database))

    def _verified_access(self, state: LicenseState, feature: str | None = None) -> bool:
        """Re-verify the signed lease instead of trusting mutable SQLite status fields."""
        if not self.settings.license_required:
            return True
        if self._startup_validation_pending or state.status not in frozenset({'ACTIVE', 'CONNECTION_WARNING'}):
            return False
        if not (state.signed_lease and state.license_id and state.lease_id and state.session_id):
            self._record_failure('本地校验', '授权记录缺少签名租约或租约关联信息。')
            return False
        try:
            payload = self.verifier.verify(state.signed_lease, state.instance_id)
            issued_at = parse_timestamp(payload['issuedAt'])
            expires_at = parse_timestamp(payload['expiresAt'])
        except LicenseCryptoError as error:
            self._record_failure('本地校验', error, sensitive_values=(state.signed_lease,))
            return False
        now = datetime.now(timezone.utc)
        last_verified = aware(state.last_verified_at)
        if last_verified and now + timedelta(seconds=self.settings.license_clock_skew_seconds) < last_verified:
            self._record_failure('本地校验', '检测到系统时间回拨，请校准系统时间后重新验证授权。')
            return False
        if issued_at > now + timedelta(seconds=self.settings.license_clock_skew_seconds):
            self._record_failure('本地校验', '授权服务器时间明显晚于本机时间，请先校准系统时间。')
            return False
        if expires_at <= now:
            self._record_failure('本地校验', '授权租约已到期。')
            return False
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
        self._record_local_success()
        if feature is None:
            return True
        if 'all' in features:
            return feature in BASE_FEATURES
        entitlements = payload.get('entitlements')
        if isinstance(entitlements, list):
            active_features = set()
            for entitlement in entitlements:
                if not isinstance(entitlement, dict) or not isinstance(entitlement.get('code'), str):
                    continue
                expires_at = entitlement.get('expiresAt')
                try:
                    if expires_at and parse_timestamp(expires_at) <= now:
                        continue
                except (LicenseCryptoError, TypeError, ValueError):
                    continue
                active_features.add(entitlement['code'])
            return feature in active_features
        return feature in features

    def allows(self, feature: str | None = None, *, database=None) -> bool:
        if database is not None:
            state = database.scalar(select(LicenseState).limit(1))
            if state is None or state.instance_id != self._instance_id(state.instance_id if state.license_id else None):
                return False
            return self._verified_access(state, feature)
        with self.database.session_factory() as database:
            return self._verified_access(self._state(database), feature)
