"""HTTP 传输与响应落地：发请求、解析错误、把状态写进 self._state
"""
from __future__ import annotations

import json
import os
from abc import ABC
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx
from sqlalchemy import select

from .base import LicenseServiceBase
from .contracts import (
    BASE_FEATURES,
    LicenseClientError,
)
from .crypto import LicenseCryptoError, parse_timestamp
from .hardware import hardware_instance_id
from ..core.canonical_json import canonical_json
from ..core.models import LicenseState
from ..core.time_utils import ensure_aware


class LicenseTransportMixin(LicenseServiceBase, ABC):
    """HTTP 传输与响应落地：发请求、解析错误、把状态写进 self._state"""

    @staticmethod
    def _valid_instance_id(value: str) -> bool:
        """校验实例 ID 的字符集与长度。
        """
        # 允许 ':'，兼容 fallback-machine:xxx 派生格式的诊断片段（正式 ID 仍是纯 hex）。
        return 16 <= len(value) <= 64 and all(character.isalnum() or character in '-_.:' for character in value)
    def _instance_id(self) -> str:
        """取出本机硬件指纹派生的安装实例 ID，并持久化到 data/instance-id。
        """
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
            # 同目录原子替换：写一半崩溃也不会留下半截 ID 被当成有效值。
            os.replace(temporary, path)
        # 兜底修正权限：文件可能是别的工具创建的，权限未必正确。
        os.chmod(path, 0o600)
        self._cached_instance_id = value
        return value
    @asynccontextmanager
    async def _credential_operation(self):
        """凭证读写的临界区：串行化续租，并保证进程内只有一个凭证写入者。
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
                if temporary:
                    self._process_lock.release()
    def _state(self, database) -> LicenseState:
        """取（或初始化）单行授权状态，并处理实例 ID 变化。
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
    def _activation_instance_id(self) -> str:
        """取当前实例 ID（同步，供 ``activate`` 放线程池）。"""
        with self.database.session_factory() as database:
            return self._state(database).instance_id
    def _activation_credentials(self) -> tuple[bool, str | None, str]:
        """取自动重激活要用的本地凭证（同步，供 ``reactivate`` 放线程池）。
        """
        with self.database.session_factory() as database:
            state = self._state(database)
            return (bool(state.license_id), state.encrypted_activation_code, state.activation_email or '')
    def _recovery_credentials(self) -> tuple[str | None, str, int]:
        """取租约恢复要用的本地凭证（同步，供 ``_recover_unlocked`` 放线程池）。
        """
        with self.database.session_factory() as database:
            state = self._state(database)
            return (state.encrypted_recovery_token, state.instance_id, state.lease_sequence)
    def _lease_expired(self, expires_at: datetime, *, now: datetime) -> bool:
        """租约是否**确实**已到期（含时钟偏移容差）。
        """
        return expires_at <= now - timedelta(seconds=self.settings.license_clock_skew_seconds)
    def _lease_sequence_ok(self, payload_sequence: int, state: LicenseState) -> bool:
        """租约序号判据：手上这份租约不能比已经记下的更旧。
        """
        if payload_sequence < state.lease_sequence:
            return False
        state.lease_sequence = max(state.lease_sequence, payload_sequence)
        return True
    def _validate_saved_state(self, state: LicenseState, database) -> None:
        """启动时的离线校验：只信签名租约，不信库里的 status。
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
    async def _post(self, path: str, payload: dict[str, Any]) -> dict[str, Any]:
        """向授权服务发送加密请求，按候选列表依次重试。
        """
        candidates = self._endpoint_pool.candidates()
        # 未配置是配置问题（重试无用），全部不可用是暂时问题，两者给出不同文案。
        if not self._endpoint_pool.configured:
            raise LicenseClientError('尚未配置授权服务器地址。')
        if not candidates:
            raise LicenseClientError('授权服务器暂时不可用，请稍后重试。')
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
    def _apply_response(self, response: dict[str, Any], *, activation_code_hint: str | None = None, activation_code: str | None = None, email: str | None = None) -> dict[str, Any]:
        """把一次成功的授权响应落库（验签通过后才算成功）。
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
                # 先落到局部变量：state.last_error 是可空列，直接拿去构造异常会被静态检查判成 str | None。
                message = '授权服务器时间明显晚于本机时间，请先校准系统时间。'
                state.status = 'CLOCK_ROLLBACK'
                state.last_error = message
                database.commit()
                self._record_status(state.status, state.last_error)
                raise LicenseClientError(message)
            if self._lease_expired(expires_at, now=now):
                message = '授权服务器返回了已到期租约。'
                state.status = 'LEASE_EXPIRED'
                state.last_error = message
                database.commit()
                self._record_status(state.status, state.last_error)
                raise LicenseClientError(message)
            if payload['activationCodeId'] == state.license_id and lease_sequence <= state.lease_sequence and state.signed_lease != signed_lease:
                # 序号须递增防重放；只有内容完全相同的重试响应才允许相等。
                message = '授权服务器返回了未递增的租约序号。'
                state.status = 'INVALID'
                state.last_error = message
                database.commit()
                self._record_status(state.status, state.last_error)
                raise LicenseClientError(message)
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
                message = '授权服务器返回的权益列表无效。'
                state.status = 'INVALID'
                state.last_error = message
                database.commit()
                self._record_status(state.status, state.last_error)
                raise LicenseClientError(message)
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
    def _payload(self, state: LicenseState) -> dict[str, Any]:
        """组装对外状态字典（字段名与前端约定死，逐字不可改）。
        """
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
            'errorCode': self._error_code or {
                'RECOVERY_RETRY': 'RECOVERY_TOKEN_INVALID',
                'RECOVERY_REQUIRED': 'LICENSE_REMOTE_REJECTED',
                'REMOTE_REJECTED': 'LICENSE_REMOTE_REJECTED',
                'REVOKED': 'LICENSE_REVOKED',
                'INVALID': 'CREDENTIAL_INVALID',
                'CLOCK_ROLLBACK': 'CLOCK_INVALID',
                'INSTANCE_MISMATCH': 'INSTANCE_MISMATCH',
                'LEASE_EXPIRED': 'LEASE_EXPIRED'}.get(effective_status),
            'retryable': self._retry_scheduled(),
            'canRetry': self._can_retry(effective_status),
            'retrying': self._retry_in_flight(),
            'retryAttempt': self._failures,
            'nextRetryAt': self._next_retry_at(),
            'lastError': effective_error}
