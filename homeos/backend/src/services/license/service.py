"""授权客户端服务（对齐 ``modules/license/license.service.ts``）。

联网租约模型：激活码 + 邮箱经加密传输换取 Ed25519 签名租约，按 ``heartbeatIn`` 续期。
不信任可变的落盘字段，每次放行都重新验签租约。
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import os
import secrets
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import httpx
from fastapi import HTTPException

from ...core.errors import BusinessException, ErrorCode, api_error, unauthorized
from .constants import DEFAULT_LICENSE_SERVER_URL, is_license_required_from_env
from .crypto import (
    LICENSE_PRODUCT,
    LeaseVerifier,
    LicenseCryptoError,
    LicenseTransportCipher,
    SecretCipher,
    derive_key_id,
    parse_timestamp,
)
from .fingerprint import generate_hardware_fingerprint
from .key_bootstrap import (
    SIGNING_PUBLIC_KEY_FILENAME,
    TRANSPORT_PUBLIC_KEY_FILENAME,
    ensure_client_keys,
    keys_ready,
)

logger = logging.getLogger("homeos.license")

RETRY_DELAYS_MS = [2_000, 5_000, 10_000, 30_000, 60_000, 300_000]
TERMINAL_STATES = {
    "DEACTIVATED",
    "REVOKED",
    "INVALID",
    "CLOCK_ROLLBACK",
    "REMOTE_REJECTED",
    "INSTANCE_CHANGED",
    "INSTANCE_MISMATCH",
    "RECOVERY_REQUIRED",
}
RETRYABLE_TERMINAL = {"RECOVERY_REQUIRED", "REMOTE_REJECTED"}
CLOCK_SKEW_SECONDS = 300
DEFAULT_HEARTBEAT_SECONDS = 300
MANUAL_RETRY_THROTTLE_MS = 2_000

STATUS_LABELS: dict[str, str] = {
    "UNACTIVATED": "未激活",
    "ACTIVE": "正常",
    "CONNECTION_WARNING": "连接异常",
    "STARTUP_VALIDATION_REQUIRED": "等待启动联网验证",
    "LEASE_EXPIRED": "租约已到期",
    "RECOVERY_RETRY": "授权会话重试中",
    "RECOVERY_REQUIRED": "授权会话需人工恢复",
    "REMOTE_REJECTED": "授权后台明确拒绝",
    "REVOKED": "已吊销",
    "INVALID": "校验无效",
    "INSTANCE_CHANGED": "安装标识已变化",
    "INSTANCE_MISMATCH": "安装标识不匹配",
    "CLOCK_ROLLBACK": "系统时间异常",
    "DEACTIVATED": "已停用",
}


def _iso(dt: datetime | None = None) -> str:
    value = dt or datetime.now(UTC)
    return value.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%S.") + f"{value.microsecond // 1000:03d}Z"


def _epoch_ms(dt: datetime) -> int:
    return int(dt.timestamp() * 1000)


def _safe_parse_ms(value: Any) -> float:
    try:
        return float(_epoch_ms(parse_timestamp(value)))
    except LicenseCryptoError:
        return 0.0


class LicenseClientError(Exception):
    """授权 HTTP 客户端错误：携带 HTTP 状态码与商店返回的结构化 code。"""

    def __init__(
        self,
        message: str,
        status_code: int | None = None,
        code: str | None = None,
        revoked: bool = False,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.revoked = revoked

    @property
    def is_confirmed_revocation(self) -> bool:
        if self.status_code not in (401, 403):
            return False
        return self.revoked or self.code in ("REVOKED", "LICENSE_REVOKED")

    @property
    def requires_rebind(self) -> bool:
        return self.status_code in (401, 403) and self.code == "BINDING_RELEASED"


class LicenseService:
    """授权激活、心跳续租、租约恢复与能力门禁。"""

    def __init__(
        self,
        *,
        internal_dir: str,
        keys_dir: str | None = None,
        state_path: str | None = None,
        secret_key_path: str | None = None,
        client_version: str | None = None,
    ) -> None:
        self._internal_dir = Path(internal_dir)
        self._state_path = Path(
            os.getenv("LICENSE_STATE_FILE", "").strip()
            or (state_path or str(self._internal_dir / "license-state.json"))
        )
        self._keys_dir = Path(
            os.getenv("APP_CLIENT_KEYS_DIR", "").strip()
            or (keys_dir or str(self._internal_dir.parent.parent / "keys" / "client"))
        )
        self._secret_key_path = Path(
            os.getenv("APP_LICENSE_CREDENTIAL_FILE", "").strip()
            or (secret_key_path or str(self._internal_dir / "license-credentials.key"))
        )
        self._server_url = (
            os.getenv("APP_LICENSE_SERVER_URL", "").strip() or DEFAULT_LICENSE_SERVER_URL
        ).rstrip("/")
        self._client_version = client_version or self._resolve_client_version()

        self._license_required = False
        self._bypass = False
        self._current_fingerprint = ""
        self.public_key_fingerprint: str | None = None

        self.state: dict[str, Any] = self._empty_state()
        self._verifier: LeaseVerifier | None = None
        self._transport: LicenseTransportCipher | None = None
        self._cipher: SecretCipher | None = None
        self._keys_ready = False

        self._timer: asyncio.Task[None] | None = None
        self._failures = 0
        self._retry_at: int | None = None
        self._manual_retry_at = 0
        self._rate_limited_until = 0
        self._error_code: str | None = None
        self._startup_validation_pending = False
        self._observed_status: str | None = None

    # ── 生命周期 ──────────────────────────────────────────────
    async def start(self) -> None:
        """等价 Nest ``onModuleInit``。"""
        self._license_required = is_license_required_from_env()
        self._assert_production_bypass_safe()
        self._bypass = self._is_bypass_active()
        self._current_fingerprint = self._build_fingerprint()
        self._load_state()
        await self._ensure_keys()
        self._validate_saved_state()
        if not self._license_required:
            logger.info("LICENSE_REQUIRED 未启用,跳过商业授权门禁.")
        elif self._bypass:
            logger.warning("商业授权已通过 ALLOW_LICENSE_BYPASS 绕过(仅 test 环境).")
        elif not self.is_access_allowed():
            logger.warning("商业授权未激活:除引导/授权接口外 API 将拒绝访问.")
        else:
            logger.info("商业授权已激活.")
        self._start_loop()

    async def stop(self) -> None:
        """等价 Nest ``onModuleDestroy``。"""
        self._clear_timer()

    # ── 对外查询 ──────────────────────────────────────────────
    def is_license_required(self) -> bool:
        return self._license_required

    def is_access_allowed(self) -> bool:
        if not self._license_required:
            return True
        if self._bypass:
            return True
        self._refresh_derived_status()
        return self._verified_access()

    def validate_access(self) -> bool:
        if self.is_access_allowed():
            return True
        unauthorized(api_error("LICENSE_INACTIVE"))
        return False

    def get_activation_status(self) -> dict[str, Any]:
        self._refresh_derived_status()
        allowed = not self._license_required or self._bypass or self._verified_access()
        products = self._products_from_lease()
        status = self._effective_status()
        now = int(datetime.now(UTC).timestamp() * 1000)
        return {
            "required": self._license_required,
            "allowed": allowed,
            "editorAllowed": allowed,
            "status": status,
            "statusLabel": STATUS_LABELS.get(status, status),
            "instanceId": self._current_fingerprint,
            "activationCodeId": self.state["licenseId"],
            "leaseId": self.state["leaseId"],
            "leaseSequence": self.state["leaseSequence"],
            "edition": "full" if allowed else None,
            "features": self.state["featureSet"] if allowed else [],
            "products": products if allowed else [],
            "heartbeatIn": self.state["heartbeatIntervalSeconds"],
            "leaseIssuedAt": self.state["leaseIssuedAt"],
            "leaseExpiresAt": self.state["leaseExpiresAt"],
            "lastHeartbeatAt": self.state["lastHeartbeatAt"],
            "lastVerifiedAt": self.state["lastVerifiedAt"],
            "lastError": self.state["lastError"],
            "errorCode": self._effective_error_code(status),
            "retryable": bool(self.state["licenseId"] and status not in TERMINAL_STATES),
            "canRetry": bool(
                self.state["licenseId"]
                and (status not in TERMINAL_STATES or status in RETRYABLE_TERMINAL)
                and status != "CLOCK_ROLLBACK"
            ),
            "retrying": self._timer is not None,
            "retryAttempt": self._failures,
            "nextRetryAt": (
                _iso(datetime.fromtimestamp(self._retry_at / 1000, tz=UTC))
                if self._retry_at is not None and status not in TERMINAL_STATES
                else None
            ),
            "startupValidationPending": self._startup_validation_pending,
            "activationCodeHint": self.state["activationCodeHint"],
            "activationEmail": self.state["activationEmail"],
            "publicKeyFingerprint": self.public_key_fingerprint,
            "rateLimitedUntil": (
                _iso(datetime.fromtimestamp(self._rate_limited_until / 1000, tz=UTC))
                if self._rate_limited_until > now
                else None
            ),
        }

    # ── 激活 / 重试 ───────────────────────────────────────────
    async def activate(self, email: str, activation_code: str) -> dict[str, Any]:
        if not self._license_required or self._bypass:
            return self.get_activation_status()
        normalized_email = str(email or "").strip().lower()
        code = str(activation_code or "").strip().upper()
        if not normalized_email:
            raise HTTPException(status_code=400, detail="请输入购买授权时使用的邮箱。")
        if not code:
            raise HTTPException(status_code=400, detail="请输入激活码。")
        if not await self._ensure_keys():
            raise BusinessException(
                ErrorCode.SERVICE_UNAVAILABLE,
                "授权公钥尚未就绪，请确认能访问授权商店后重试。",
            )
        try:
            response = await self._post(
                "/v2/activate",
                {
                    "activationCode": code,
                    "instanceId": self._current_fingerprint,
                    "product": LICENSE_PRODUCT,
                    "clientVersion": self._client_version,
                    "nonce": _nonce(),
                    "email": normalized_email,
                },
            )
            self._apply_lease(
                response,
                {
                    "activationCode": code,
                    "email": normalized_email,
                    "hint": code[: max(0, len(code) - 9)],
                },
            )
            self._record_online_success()
            logger.info("商业授权激活成功: %s", self.state.get("activationCodeHint") or code)
        except BusinessException:
            raise
        except Exception as exc:  # noqa: BLE001
            self._record_failure(exc)
            raise self._to_business_exception(exc, "激活失败") from exc
        self._start_loop()
        return self.get_activation_status()

    async def retry_now(self) -> dict[str, Any]:
        if not self._license_required or self._bypass:
            return self.get_activation_status()
        now = int(datetime.now(UTC).timestamp() * 1000)
        if now < self._manual_retry_at:
            raise BusinessException(ErrorCode.CONFLICT, "请稍候再试。")
        self._manual_retry_at = now + MANUAL_RETRY_THROTTLE_MS
        if not self.state["licenseId"]:
            raise BusinessException(
                ErrorCode.CONFLICT,
                "当前安装尚未激活，请填写购买邮箱与激活码完成激活。",
            )
        if not await self._ensure_keys():
            raise BusinessException(
                ErrorCode.SERVICE_UNAVAILABLE,
                "授权公钥尚未就绪，请确认能访问授权商店后重试。",
            )
        try:
            if (
                self._startup_validation_pending
                or self._lease_expired()
                or self.state["status"] in ("LEASE_EXPIRED", "RECOVERY_RETRY", "RECOVERY_REQUIRED", "REMOTE_REJECTED")
            ):
                self.state["status"] = "RECOVERY_RETRY"
                self._save_state()
                await self._recover()
            else:
                await self._heartbeat()
        except Exception as exc:  # noqa: BLE001
            self._record_failure(exc)
            raise self._to_business_exception(exc, "重试失败") from exc
        self._start_loop()
        return self.get_activation_status()

    def _to_business_exception(self, error: Exception, prefix: str) -> BusinessException:
        message = str(error)
        if isinstance(error, LicenseCryptoError):
            return BusinessException(
                ErrorCode.VALIDATION_FAILED, f"{prefix}：{message}", 422
            )
        if isinstance(error, LicenseClientError):
            if error.is_confirmed_revocation or error.requires_rebind or error.status_code == 409:
                return BusinessException(ErrorCode.CONFLICT, f"{prefix}：{message}", 409)
            if error.status_code in (401, 403):
                return BusinessException(ErrorCode.UNAUTHORIZED, f"{prefix}：{message}", 401)
            if error.status_code and error.status_code >= 500:
                return BusinessException(
                    ErrorCode.SERVICE_UNAVAILABLE, f"{prefix}：{message}", 503
                )
            return BusinessException(ErrorCode.VALIDATION_FAILED, f"{prefix}：{message}", 422)
        return BusinessException(ErrorCode.EXTERNAL_ERROR, f"{prefix}：{message}", 502)

    # ── 心跳 / 恢复 / 循环 ────────────────────────────────────
    def _start_loop(self) -> None:
        self._clear_timer()
        if not self._license_required or self._bypass:
            return
        if not self._server_url:
            return
        if not self.state["licenseId"] or self.state["status"] in TERMINAL_STATES:
            return
        immediate = self._startup_validation_pending
        self._schedule(0 if immediate else self._success_delay_ms())

    def _schedule(self, delay_ms: int) -> None:
        self._clear_timer()
        wait = max(0, delay_ms)
        self._retry_at = int(datetime.now(UTC).timestamp() * 1000) + wait

        async def _runner() -> None:
            try:
                await asyncio.sleep(wait / 1000)
            except asyncio.CancelledError:
                return
            await self._tick()

        try:
            self._timer = asyncio.get_running_loop().create_task(_runner())
        except RuntimeError:
            # 无运行中的事件循环（同步上下文）：退化为不调度
            self._timer = None

    def _clear_timer(self) -> None:
        if self._timer is not None:
            self._timer.cancel()
            self._timer = None

    async def _tick(self) -> None:
        self._timer = None
        self._retry_at = None
        if not self._license_required or self._bypass:
            return
        if not self.state["licenseId"] or self.state["status"] in TERMINAL_STATES:
            return
        now = int(datetime.now(UTC).timestamp() * 1000)
        if self._rate_limited_until > now:
            self._schedule(RETRY_DELAYS_MS[0])
            return
        if not self._keys_ready:
            if not await self._ensure_keys():
                self._failures += 1
                self._schedule(self._failure_delay_ms())
                return
        self._refresh_derived_status()
        try:
            recover = (
                self._startup_validation_pending
                or self._lease_expired()
                or self.state["status"] in ("LEASE_EXPIRED", "RECOVERY_RETRY")
            )
            if recover:
                self.state["status"] = "RECOVERY_RETRY"
                self._save_state()
                await self._recover()
            else:
                await self._heartbeat()
            self._record_online_success()
            self._schedule(self._success_delay_ms())
        except Exception as exc:  # noqa: BLE001
            if isinstance(exc, LicenseClientError) and exc.status_code == 429:
                self._rate_limited_until = int(datetime.now(UTC).timestamp() * 1000) + 120_000
            if self.state["status"] in TERMINAL_STATES:
                return
            self._failures += 1
            self._schedule(self._failure_delay_ms())

    async def _heartbeat(self) -> None:
        if not self.state["encryptedSessionToken"]:
            await self._recover()
            return
        try:
            session_token = self._require_cipher().decrypt(self.state["encryptedSessionToken"])
        except LicenseCryptoError:
            await self._recover()
            return
        try:
            response = await self._post(
                "/v2/heartbeat",
                {
                    "sessionToken": session_token,
                    "instanceId": self._current_fingerprint,
                    "leaseSequence": self.state["leaseSequence"],
                    "clientVersion": self._client_version,
                    "nonce": _nonce(),
                },
            )
            self._apply_lease(response, {})
        except Exception as exc:  # noqa: BLE001
            if (
                isinstance(exc, LicenseClientError)
                and exc.status_code == 401
                and not exc.is_confirmed_revocation
                and not exc.requires_rebind
            ):
                await self._recover()
                return
            self._classify_failure(exc)
            raise

    async def _recover(self) -> None:
        if not self.state["encryptedRecoveryToken"]:
            self._mark_failure("没有可用的租约恢复凭证，请重新激活。", "CREDENTIAL_MISSING")
            raise LicenseClientError("没有可用的租约恢复凭证，请重新激活。", None, "CREDENTIAL_MISSING")
        try:
            recovery_token = self._require_cipher().decrypt(self.state["encryptedRecoveryToken"])
        except LicenseCryptoError as exc:
            self._mark_failure("本机保存的租约恢复凭证无法解密，请重新激活。", "CREDENTIAL_INVALID")
            raise LicenseClientError("本机保存的租约恢复凭证无法解密，请重新激活。") from exc
        try:
            response = await self._post(
                "/v2/recover",
                {
                    "recoveryToken": recovery_token,
                    "instanceId": self._current_fingerprint,
                    "leaseSequence": self.state["leaseSequence"],
                    "clientVersion": self._client_version,
                    "nonce": _nonce(),
                },
            )
            self._apply_lease(response, {})
        except Exception as exc:  # noqa: BLE001
            self._classify_failure(exc)
            raise

    def _classify_failure(self, error: Exception) -> None:
        if isinstance(error, LicenseClientError):
            if error.requires_rebind:
                self._mark_status("INSTANCE_CHANGED", "该授权已在商店解除设备绑定，请重新激活授权。", "INSTANCE_CHANGED")
                return
            if error.is_confirmed_revocation:
                self._mark_status("REVOKED", str(error), "LICENSE_REVOKED")
                return
            if error.status_code == 401:
                self._mark_status("RECOVERY_RETRY", str(error), "RECOVERY_TOKEN_INVALID")
                return
            if (
                error.status_code
                and 400 <= error.status_code < 500
                and error.status_code not in (408, 429)
            ):
                self._mark_status("REMOTE_REJECTED", str(error), "LICENSE_REMOTE_REJECTED")
                return
        self._mark_failure(str(error))

    def _mark_failure(self, message: str, code: str | None = None) -> None:
        status = "LEASE_EXPIRED"
        if not self._lease_expired():
            status = "CONNECTION_WARNING"
        if self.state["status"] in ("RECOVERY_RETRY", "RECOVERY_REQUIRED", "REMOTE_REJECTED"):
            status = self.state["status"]
        self._mark_status(status, message, code or "NETWORK_UNAVAILABLE")

    def _mark_status(self, status: str, message: str, code: str | None) -> None:
        self.state["status"] = status
        self.state["lastError"] = message[:1000]
        self._error_code = code
        self._startup_validation_pending = False
        if status in TERMINAL_STATES:
            self._clear_timer()
        self._save_state()
        self._record_status(status)

    # ── HTTP ─────────────────────────────────────────────────
    async def _post(self, path: str, payload: dict[str, Any]) -> dict[str, Any]:
        transport = self._require_transport()
        envelope, key = transport.encrypt_request(payload, path)
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.post(
                    f"{self._server_url}{path}",
                    json=envelope,
                    headers={"Content-Type": "application/json", "Accept": "application/json"},
                )
        except Exception as exc:  # noqa: BLE001
            raise LicenseClientError("无法连接授权服务器。", None, "NETWORK_UNAVAILABLE") from exc
        if response.status_code >= 400:
            detail = "授权服务器拒绝请求。"
            code: str | None = None
            revoked = False
            try:
                body = response.json()
                if isinstance(body, dict):
                    if isinstance(body.get("detail"), str) and body["detail"]:
                        detail = body["detail"]
                    if isinstance(body.get("code"), str) and body["code"]:
                        code = body["code"]
                    if body.get("revoked") is True:
                        revoked = True
            except Exception:  # noqa: BLE001
                pass
            if response.status_code >= 500:
                raise LicenseClientError(detail, response.status_code, "LICENSE_SERVER_UNAVAILABLE", revoked)
            if response.status_code == 429:
                raise LicenseClientError(detail, response.status_code, "LICENSE_RATE_LIMITED", revoked)
            raise LicenseClientError(detail, response.status_code, code, revoked)
        try:
            body = response.json()
        except Exception as exc:  # noqa: BLE001
            raise LicenseClientError("授权服务器响应格式无效。") from exc
        if not isinstance(body, dict):
            raise LicenseClientError("授权服务器响应格式无效。")
        return transport.decrypt_response(body, path, key)

    # ── 租约应用与校验 ────────────────────────────────────────
    def _apply_lease(self, response: dict[str, Any], meta: dict[str, Any]) -> None:
        signed_lease = response.get("signedLease") if isinstance(response.get("signedLease"), str) else ""
        if not signed_lease:
            self._mark_status("INVALID", "授权服务器未返回签名租约。", "INVALID")
            raise LicenseClientError("授权服务器未返回签名租约。")
        try:
            payload = self._verify_lease(signed_lease)
        except Exception as exc:  # noqa: BLE001
            message = str(exc)
            if "当前实例" in message:
                self._mark_status("INSTANCE_MISMATCH", message, "INSTANCE_MISMATCH")
            else:
                self._mark_status("INVALID", message, "CREDENTIAL_INVALID")
            raise
        now = datetime.now(UTC)
        expires_at = parse_timestamp(payload.get("expiresAt"))
        issued_at = parse_timestamp(payload.get("issuedAt"))
        if _epoch_ms(issued_at) > _epoch_ms(now) + CLOCK_SKEW_SECONDS * 1000:
            self._mark_status("CLOCK_ROLLBACK", "授权服务器时间明显晚于本机时间，请先校准系统时间。", "CLOCK_INVALID")
            raise LicenseClientError("授权服务器时间明显晚于本机时间，请先校准系统时间。")
        if _epoch_ms(expires_at) <= _epoch_ms(now):
            self._mark_status("INVALID", "授权服务器返回了已到期租约。", "CREDENTIAL_INVALID")
            raise LicenseClientError("授权服务器返回了已到期租约。")
        if (
            payload.get("activationCodeId") == self.state["licenseId"]
            and int(payload.get("leaseSequence") or 0) <= int(self.state["leaseSequence"] or 0)
            and self.state["signedLease"] != signed_lease
        ):
            self._mark_status("INVALID", "授权服务器返回了未递增的租约序号。", "CREDENTIAL_INVALID")
            raise LicenseClientError("授权服务器返回了未递增的租约序号。")
        raw_features = payload.get("features")
        features = (
            [item for item in raw_features if isinstance(item, str)]
            if isinstance(raw_features, list)
            else []
        )
        if not isinstance(raw_features, list) or len(features) != len(raw_features):
            self._mark_status("INVALID", "授权服务器返回的权益列表无效。", "CREDENTIAL_INVALID")
            raise LicenseClientError("授权服务器返回的权益列表无效。")

        self.state["licenseId"] = str(payload.get("activationCodeId"))
        self.state["leaseId"] = str(payload.get("leaseId"))
        self.state["sessionId"] = str(payload.get("sessionId"))
        self.state["leaseSequence"] = int(payload.get("leaseSequence"))
        self.state["signedLease"] = signed_lease
        self.state["status"] = "ACTIVE"
        self.state["leaseIssuedAt"] = _iso(issued_at)
        self.state["leaseExpiresAt"] = _iso(expires_at)
        self.state["lastHeartbeatAt"] = _iso(now)
        self.state["lastVerifiedAt"] = _iso(now)
        self.state["lastError"] = None
        self.state["featureSet"] = features
        raw_heartbeat = response.get("heartbeatIn")
        heartbeat_in = (
            float(raw_heartbeat)
            if isinstance(raw_heartbeat, (int, float)) and not isinstance(raw_heartbeat, bool)
            else DEFAULT_HEARTBEAT_SECONDS
        )
        self.state["heartbeatIntervalSeconds"] = max(30, int(heartbeat_in))
        if meta.get("activationCode"):
            self.state["encryptedActivationCode"] = self._require_cipher().encrypt(meta["activationCode"])
            self.state["activationCodeHint"] = meta.get("hint")
        if meta.get("email"):
            self.state["activationEmail"] = meta["email"]
        if isinstance(response.get("sessionToken"), str) and response["sessionToken"]:
            self.state["encryptedSessionToken"] = self._require_cipher().encrypt(response["sessionToken"])
        if isinstance(response.get("recoveryToken"), str) and response["recoveryToken"]:
            self.state["encryptedRecoveryToken"] = self._require_cipher().encrypt(response["recoveryToken"])
        if not self.state["activatedAt"]:
            self.state["activatedAt"] = _iso(now)
        self._startup_validation_pending = False
        self._failures = 0
        self._error_code = None
        self._save_state()
        self._record_status("ACTIVE")

    def _verify_lease(self, signed_lease: str) -> dict[str, Any]:
        if self._verifier is None:
            raise LicenseCryptoError("授权公钥尚未就绪。")
        return self._verifier.verify(signed_lease, self._current_fingerprint)

    def _verified_access(self, feature: str | None = None) -> bool:
        if not self._license_required or self._bypass:
            return True
        if self.state["status"] not in ("ACTIVE", "CONNECTION_WARNING"):
            return False
        if not (
            self.state["signedLease"]
            and self.state["licenseId"]
            and self.state["leaseId"]
            and self.state["sessionId"]
        ):
            return False
        try:
            payload = self._verify_lease(self.state["signedLease"])
        except Exception:  # noqa: BLE001
            return False
        now = datetime.now(UTC)
        issued_at = parse_timestamp(payload.get("issuedAt"))
        expires_at = parse_timestamp(payload.get("expiresAt"))
        last_verified = (
            parse_timestamp(self.state["lastVerifiedAt"]) if self.state["lastVerifiedAt"] else None
        )
        if last_verified and _epoch_ms(now) + CLOCK_SKEW_SECONDS * 1000 < _epoch_ms(last_verified):
            return False
        if _epoch_ms(issued_at) > _epoch_ms(now) + CLOCK_SKEW_SECONDS * 1000:
            return False
        if _epoch_ms(expires_at) <= _epoch_ms(now):
            return False
        if payload.get("activationCodeId") != self.state["licenseId"]:
            return False
        if payload.get("leaseId") != self.state["leaseId"] or payload.get("sessionId") != self.state["sessionId"]:
            return False
        if int(payload.get("leaseSequence") or 0) != int(self.state["leaseSequence"] or 0):
            return False
        if not isinstance(payload.get("features"), list) or not all(
            isinstance(item, str) for item in payload["features"]
        ):
            return False
        if feature is None:
            return True
        features = payload["features"]
        if "all" in features:
            return True
        entitlements = payload.get("entitlements")
        if isinstance(entitlements, list):
            active: set[str] = set()
            for entitlement in entitlements:
                if not isinstance(entitlement, dict):
                    continue
                code = entitlement.get("code")
                if not isinstance(code, str):
                    continue
                expires_raw = entitlement.get("expiresAt")
                try:
                    if expires_raw and _epoch_ms(parse_timestamp(expires_raw)) <= _epoch_ms(now):
                        continue
                except LicenseCryptoError:
                    continue
                active.add(code)
            return feature in active
        return feature in features

    # ── 状态派生 ─────────────────────────────────────────────
    def _refresh_derived_status(self) -> None:
        if not self.state["licenseId"]:
            return
        if not self._license_required or self._bypass:
            return
        if self.state["status"] == "UNACTIVATED":
            return
        if self.state["status"] in TERMINAL_STATES and self.state["status"] != "RECOVERY_REQUIRED":
            return
        last_verified = (
            parse_timestamp(self.state["lastVerifiedAt"]) if self.state["lastVerifiedAt"] else None
        )
        now_ms = int(datetime.now(UTC).timestamp() * 1000)
        if last_verified and now_ms + CLOCK_SKEW_SECONDS * 1000 < _epoch_ms(last_verified):
            self.state["status"] = "CLOCK_ROLLBACK"
            self.state["lastError"] = "检测到系统时间回拨，请校准系统时间后重新验证授权。"
            return
        if (
            self.state["signedLease"]
            and self.state["status"] in ("ACTIVE", "CONNECTION_WARNING", "STARTUP_VALIDATION_REQUIRED")
            and self._lease_expired()
        ):
            self.state["status"] = "LEASE_EXPIRED"
            if not self.state["lastError"]:
                self.state["lastError"] = "授权租约已到期。"
            return
        if (
            self._license_required
            and self._startup_validation_pending
            and self.state["status"] in ("ACTIVE", "CONNECTION_WARNING")
        ):
            self.state["status"] = "STARTUP_VALIDATION_REQUIRED"
            self.state["lastError"] = (
                self.state["lastError"] or "服务重启后正在等待授权后台确认最新租约。"
            )

    def _effective_status(self) -> str:
        if not self._license_required or self._bypass:
            return "ACTIVE"
        if self.state["status"] == "ACTIVE" and not self._verified_access():
            return "INVALID"
        return self.state["status"]

    def _effective_error_code(self, status: str) -> str | None:
        if self._error_code:
            return self._error_code
        return {
            "RECOVERY_RETRY": "RECOVERY_TOKEN_INVALID",
            "RECOVERY_REQUIRED": "LICENSE_REMOTE_REJECTED",
            "REMOTE_REJECTED": "LICENSE_REMOTE_REJECTED",
            "REVOKED": "LICENSE_REVOKED",
            "INVALID": "CREDENTIAL_INVALID",
            "CLOCK_ROLLBACK": "CLOCK_INVALID",
            "INSTANCE_CHANGED": "INSTANCE_CHANGED",
            "INSTANCE_MISMATCH": "INSTANCE_MISMATCH",
            "LEASE_EXPIRED": "LEASE_EXPIRED",
        }.get(status)

    def _lease_expired(self) -> bool:
        if not self.state["leaseExpiresAt"]:
            return False
        return _safe_parse_ms(self.state["leaseExpiresAt"]) <= int(datetime.now(UTC).timestamp() * 1000)

    def _products_from_lease(self) -> list[dict[str, Any]]:
        if not self.state["signedLease"]:
            return []
        try:
            payload = self._verify_lease(self.state["signedLease"])
        except Exception:  # noqa: BLE001
            return []
        raw = payload.get("products")
        if not isinstance(raw, list):
            return []
        products: list[dict[str, Any]] = []
        for item in raw:
            if not isinstance(item, dict):
                continue
            name = item.get("name")
            if not isinstance(name, str) or not name.strip():
                continue
            products.append(
                {
                    "name": name.strip(),
                    "type": item.get("type") if isinstance(item.get("type"), str) else "module",
                    "expiresAt": item.get("expiresAt") if isinstance(item.get("expiresAt"), str) else None,
                }
            )
        return products

    def _success_delay_ms(self) -> int:
        interval = max(30, int(self.state["heartbeatIntervalSeconds"] or DEFAULT_HEARTBEAT_SECONDS)) * 1000
        if not self.state["leaseExpiresAt"]:
            return interval
        remaining = _safe_parse_ms(self.state["leaseExpiresAt"]) - int(datetime.now(UTC).timestamp() * 1000)
        return max(0, int(min(interval, remaining)))

    def _failure_delay_ms(self) -> int:
        return RETRY_DELAYS_MS[min(self._failures, len(RETRY_DELAYS_MS) - 1)]

    # ── 状态存取 ─────────────────────────────────────────────
    def _empty_state(self) -> dict[str, Any]:
        return {
            "instanceId": self._current_fingerprint,
            "licenseId": None,
            "leaseId": None,
            "sessionId": None,
            "leaseSequence": 0,
            "signedLease": None,
            "encryptedSessionToken": None,
            "encryptedRecoveryToken": None,
            "encryptedActivationCode": None,
            "activationEmail": None,
            "activationCodeHint": None,
            "status": "UNACTIVATED",
            "lastError": None,
            "featureSet": [],
            "heartbeatIntervalSeconds": DEFAULT_HEARTBEAT_SECONDS,
            "leaseIssuedAt": None,
            "leaseExpiresAt": None,
            "lastHeartbeatAt": None,
            "lastVerifiedAt": None,
            "activatedAt": None,
            "updatedAt": _iso(),
        }

    def _load_state(self) -> None:
        empty = self._empty_state()
        loaded: dict[str, Any] = {}
        if self._state_path.exists():
            try:
                parsed = json.loads(self._state_path.read_text(encoding="utf-8"))
                if isinstance(parsed, dict):
                    loaded = parsed
            except Exception:  # noqa: BLE001
                logger.warning("授权状态文件无法解析,将重新初始化:%s", self._state_path)
        self.state = {**empty, **loaded}
        if not isinstance(self.state.get("featureSet"), list):
            self.state["featureSet"] = []
        if self.state.get("instanceId") != self._current_fingerprint:
            had_license = bool(self.state.get("licenseId"))
            self.state = {**empty}
            self.state["status"] = "INSTANCE_CHANGED" if had_license else "UNACTIVATED"
            self.state["lastError"] = "本机安装标识已变化，需要重新激活授权。" if had_license else None
            self._error_code = "INSTANCE_CHANGED" if had_license else None
            self._save_state()
            self._record_status(self.state["status"], self.state["lastError"] or None)

    def _save_state(self) -> None:
        self.state["updatedAt"] = _iso()
        try:
            self._state_path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
            temporary = self._state_path.with_name(self._state_path.name + ".tmp")
            temporary.write_text(json.dumps(self.state, ensure_ascii=False, indent=2), encoding="utf-8")
            os.chmod(temporary, 0o600)
            os.replace(temporary, self._state_path)
        except Exception as exc:  # noqa: BLE001
            logger.error("授权状态写入失败:%s", exc)

    def _validate_saved_state(self) -> None:
        if not self.state["signedLease"] or self.state["status"] in ({"UNACTIVATED"} | TERMINAL_STATES):
            return
        try:
            payload = self._verify_lease(self.state["signedLease"])
            if (
                int(payload.get("leaseSequence") or 0) != int(self.state["leaseSequence"] or 0)
                or payload.get("activationCodeId") != self.state["licenseId"]
                or payload.get("leaseId") != self.state["leaseId"]
                or payload.get("sessionId") != self.state["sessionId"]
            ):
                raise LicenseCryptoError("本地授权会话与签名租约不一致。")
            expires_at = parse_timestamp(payload.get("expiresAt"))
            issued_at = parse_timestamp(payload.get("issuedAt"))
            now = datetime.now(UTC)
            last_verified = (
                parse_timestamp(self.state["lastVerifiedAt"]) if self.state["lastVerifiedAt"] else None
            )
            if (
                last_verified
                and _epoch_ms(now) + CLOCK_SKEW_SECONDS * 1000 < _epoch_ms(last_verified)
            ) or _epoch_ms(issued_at) > _epoch_ms(now) + CLOCK_SKEW_SECONDS * 1000:
                self.state["status"] = "CLOCK_ROLLBACK"
                self.state["lastError"] = "检测到系统时间回拨，请校准系统时间后重新验证授权。"
            else:
                if self.state["status"] != "RECOVERY_RETRY":
                    self.state["status"] = "ACTIVE" if _epoch_ms(expires_at) > _epoch_ms(now) else "LEASE_EXPIRED"
                self.state["lastVerifiedAt"] = _iso(now)
                self.state["lastError"] = None
        except Exception as exc:  # noqa: BLE001
            message = str(exc)
            if "当前实例" in message:
                self.state["status"] = "INSTANCE_CHANGED"
                self.state["lastError"] = "本机安装标识已变化，需要重新激活授权。"
            else:
                self.state["status"] = "INVALID"
                self.state["lastError"] = message
        self._save_state()
        self._record_status(self.state["status"])
        self._startup_validation_pending = (
            self._license_required
            and bool(self.state["licenseId"])
            and bool(self.state["signedLease"])
            and self.state["status"] not in TERMINAL_STATES
        )

    # ── 公钥 / 密码学装配 ────────────────────────────────────
    async def _ensure_keys(self) -> bool:
        if self._bypass:
            return True
        try:
            await ensure_client_keys(
                self._keys_dir,
                license_server_url=self._server_url,
                log=logger.info,
            )
        except Exception as exc:  # noqa: BLE001
            logger.error("授权公钥未就绪:%s", exc)
        self._keys_ready = keys_ready(self._keys_dir)
        if self._keys_ready:
            try:
                self._build_crypto()
            except Exception as exc:  # noqa: BLE001
                self._keys_ready = False
                logger.error("授权公钥装配失败:%s", exc)
        return self._keys_ready

    def _build_crypto(self) -> None:
        signing_path = self._keys_dir / SIGNING_PUBLIC_KEY_FILENAME
        transport_path = self._keys_dir / TRANSPORT_PUBLIC_KEY_FILENAME
        signing_key_id = os.getenv("APP_LICENSE_KEY_ID", "").strip() or derive_key_id(signing_path)
        transport_key_id = os.getenv("APP_LICENSE_TRANSPORT_KEY_ID", "").strip() or derive_key_id(
            transport_path
        )
        signing_sha = os.getenv("APP_LICENSE_PUBLIC_KEY_SHA256", "").strip() or None
        transport_sha = os.getenv("APP_LICENSE_TRANSPORT_PUBLIC_KEY_SHA256", "").strip() or hashlib.sha256(
            transport_path.read_bytes()
        ).hexdigest()
        self._verifier = LeaseVerifier(
            {signing_key_id: {"path": str(signing_path), "sha256": signing_sha}},
            LICENSE_PRODUCT,
        )
        self._transport = LicenseTransportCipher(str(transport_path), transport_key_id, transport_sha)
        self._cipher = SecretCipher(str(self._secret_key_path))
        self.public_key_fingerprint = hashlib.sha256(signing_path.read_bytes()).hexdigest()[:16]

    def _require_transport(self) -> LicenseTransportCipher:
        if self._transport is None:
            raise LicenseClientError("授权公钥尚未就绪。", None, "KEYS_MISSING")
        return self._transport

    def _require_cipher(self) -> SecretCipher:
        if self._cipher is None:
            raise LicenseClientError("授权凭证密钥尚未就绪。", None, "KEYS_MISSING")
        return self._cipher

    # ── 指纹 / 门禁开关 ──────────────────────────────────────
    def _build_fingerprint(self) -> str:
        bypass = "HOMEOS_BYPASS_DEVICE" if self._is_bypass_active() else None
        return generate_hardware_fingerprint(
            internal_dir=str(self._internal_dir), bypass_fingerprint=bypass
        )

    def _resolve_license_required(self) -> bool:
        return is_license_required_from_env()

    def _resolve_client_version(self) -> str:
        env_version = os.getenv("APP_VERSION", "").strip()
        if env_version:
            return env_version
        try:
            from ..._version import __version__  # noqa: PLC0415

            if isinstance(__version__, str) and __version__.strip():
                return __version__.strip()
        except Exception:  # noqa: BLE001
            pass
        return "homeos"

    def _is_bypass_active(self) -> bool:
        if str(os.getenv("NODE_ENV") or "").strip() != "test":
            return False
        return str(os.getenv("ALLOW_LICENSE_BYPASS") or "").strip() == "true"

    def _assert_production_bypass_safe(self) -> None:
        if str(os.getenv("NODE_ENV") or "").strip() == "production":
            if str(os.getenv("ALLOW_LICENSE_BYPASS") or "").strip() == "true" or str(
                os.getenv("HOMEOS_LICENSE_BYPASS") or ""
            ).strip():
                raise BusinessException(
                    ErrorCode.CONFIG_ERROR,
                    api_error("LICENSE_BYPASS_FORBIDDEN_IN_PRODUCTION"),
                )

    def _record_online_success(self) -> None:
        self._rate_limited_until = 0
        self._failures = 0

    def _record_failure(self, error: Exception) -> None:
        logger.warning("授权操作失败:%s", error)

    def _record_status(self, status: str, reason: str | None = None) -> None:
        if self._observed_status == status:
            return
        previous = self._observed_status
        self._observed_status = status
        label = STATUS_LABELS.get(status, status)
        text = (
            f"授权状态：{label}"
            if previous is None
            else f"授权状态变化：{STATUS_LABELS.get(previous, previous)} → {label}"
        )
        logger.info("%s", f"{text}；原因：{reason}" if reason else text)


def _nonce() -> str:
    return secrets.token_urlsafe(18)[:24]


#: 授权严格路径豁免（精确匹配），与 Nest ``LICENSE_EXEMPT_EXACT`` 一致。
LICENSE_EXEMPT_EXACT = frozenset(
    {
        "/health",
        "/metrics",
        "/api/v1/auth/status",
        "/api/v1/auth/setup",
        "/api/v1/auth/login",
        "/api/v1/auth/mfa/verify",
        "/api/v1/auth/guest-login",
        "/api/v1/auth/guest-exchange",
        "/api/v1/system/config/public",
    }
)

LICENSE_EXEMPT_PREFIX = "/api/v1/license"


__all__ = [
    "LICENSE_EXEMPT_EXACT",
    "LICENSE_EXEMPT_PREFIX",
    "LicenseClientError",
    "LicenseService",
    "STATUS_LABELS",
    "TERMINAL_STATES",
]
