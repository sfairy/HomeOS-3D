"""认证服务：登录、会话、MFA、访客、用户管理与偏好。

逐条对齐 Nest ``auth/service.ts`` 及其 helper（session / login-audit / login-alert /
user-admin / guest / guest-share-code / mfa / preferences / user-auth-resolve）的行为。
"""

from __future__ import annotations

import json
import logging
import secrets
import time
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import uuid4

import pyotp
from sqlalchemy import delete, func, select, update
from sqlalchemy.orm import Session

from ..core.app_config import get_auth_config
from ..core.errors import BusinessException, ErrorCode, api_error, bad_request, forbidden, not_found, unauthorized
from ..core.models import GuestShareCode, LoginAudit, ProjectConfig, SystemConfig, User
from ..security.passwords import DUMMY_HASH, assert_password_policy, hash_password, verify_password
from ..security.tokens import (
    get_session_cookie_max_age_ms,
    get_session_expire_days,
    get_session_expires_in_seconds,
    sign_token,
    verify_token,
)

logger = logging.getLogger("homeos.auth")

DEFAULT_USER_PREFERENCES: dict[str, Any] = {
    "defaultTemperature": 24,
    "preferredLightKelvin": 4000,
    "autoNightMode": True,
    "nightModeTime": "22:00",
    "presencePersonId": "",
    "temperatureUnit": "celsius",
}

#: external_url 缓存 TTL（毫秒）：/auth/status 高频轮询，避免逐次查 DB。
_EXTERNAL_URL_TTL_MS = 30_000
_external_url_cache: dict[str, Any] = {"value": "", "at": 0.0}


# --------------------------------------------------------------------------- #
# 会话 / Token
# --------------------------------------------------------------------------- #
def session_expire_days(session: Session) -> int:
    return get_session_expire_days(get_auth_config(session).session_expire_days)


def sign_access_token(secret: str, payload: dict[str, Any], expire_days: int) -> str:
    return sign_token(payload, secret, get_session_expires_in_seconds(expire_days))


def cookie_max_age_ms(session: Session) -> int:
    return get_session_cookie_max_age_ms(session_expire_days(session))


def count_users(session: Session) -> int:
    return int(session.scalar(select(func.count()).select_from(User)) or 0)


def _prefs_of(user: User) -> dict[str, Any]:
    if not user.preferences:
        return {}
    try:
        value = json.loads(user.preferences)
    except (TypeError, ValueError):
        return {}
    return value if isinstance(value, dict) else {}


def build_token_payload(
    session: Session, user: User, *, mfa_verified: bool = False
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "username": user.username,
        "sub": user.id,
        "role": user.role,
        "tv": user.token_version,
        "jti": str(uuid4()),
    }
    if mfa_verified:
        payload["mfa"] = True
    if user.role != "admin":
        prefs = _prefs_of(user)
        restrictions = prefs.get("entityRestrictions")
        if isinstance(restrictions, list) and restrictions:
            payload["restrictions"] = restrictions
    return payload


def get_external_url(session: Session) -> str:
    now = time.monotonic() * 1000
    if _external_url_cache["value"] and now - _external_url_cache["at"] < _EXTERNAL_URL_TTL_MS:
        return str(_external_url_cache["value"])
    value = ""
    try:
        row = session.get(SystemConfig, "default")
        profiles = {}
        if row and row.data:
            try:
                data = json.loads(row.data)
                profiles = data.get("profiles") if isinstance(data.get("profiles"), dict) else {}
            except (TypeError, ValueError):
                profiles = {}
        profile_id = str(profiles.get("activeProfileId") or "").strip() or "default"
        config = session.scalar(select(ProjectConfig).where(ProjectConfig.project_id == profile_id))
        if config and config.layout:
            try:
                layout = json.loads(config.layout)
            except (TypeError, ValueError):
                layout = {}
            raw = layout.get("externalUrl") if isinstance(layout, dict) else None
            value = "" if raw is None else str(raw).strip()
    except Exception as error:  # noqa: BLE001 - 网络配置问题不得拖垮登录/状态接口
        logger.warning(f"读取 external_url 失败: {error}")
    _external_url_cache["value"] = value
    _external_url_cache["at"] = now
    return value


def login_response(
    session: Session, secret: str, user: User, *, mfa_verified: bool = False
) -> dict[str, Any]:
    payload = build_token_payload(session, user, mfa_verified=mfa_verified)
    token = sign_access_token(secret, payload, session_expire_days(session))
    return {
        "access_token": token,
        "username": user.username,
        "role": user.role,
        "restrictions": payload.get("restrictions") if isinstance(payload.get("restrictions"), list) else [],
        "external_url": get_external_url(session),
    }


def revoke_user_sessions(session: Session, user_id: str, token_cache: Any) -> None:
    session.execute(
        update(User).where(User.id == user_id).values(token_version=User.token_version + 1)
    )
    session.commit()
    if token_cache is not None:
        token_cache.invalidate(user_id)


async def revoke_session_by_token(
    session: Session, secret: str, token: str, revocation: Any, token_cache: Any
) -> None:
    """仅吊销当前 token（按 jti）；Redis 不可用时回退 tokenVersion 全设备失效。"""
    try:
        payload = verify_token(token, secret)
    except BusinessException:
        return
    now_sec = int(time.time())
    ttl = int(payload.get("exp", now_sec)) - now_sec
    if ttl <= 0:
        return
    is_guest = payload.get("role") == "guest"
    revoke_key = payload.get("jti") or (payload.get("sub") if is_guest else None)
    if not revoke_key:
        return
    persisted = await revocation.revoke(revoke_key, ttl) if revocation is not None else False
    if not persisted and payload.get("sub") and not is_guest:
        revoke_user_sessions(session, payload["sub"], token_cache)


# --------------------------------------------------------------------------- #
# 登录审计 / 告警
# --------------------------------------------------------------------------- #
def record_login_audit(
    session: Session,
    username: str,
    user_id: str | None,
    ip: str | None,
    success: bool,
    reason: str | None = None,
) -> None:
    try:
        session.add(
            LoginAudit(
                username=username,
                user_id=user_id,
                ip=(ip or "")[:64] or None,
                success=success,
                reason=reason,
            )
        )
        session.commit()
    except Exception as error:  # noqa: BLE001 - 审计失败不得影响登录主流程
        session.rollback()
        logger.warning(f"登录审计写入失败: {error}")


def get_login_audit(session: Session, limit: int = 50, page: int = 1) -> dict[str, Any]:
    take = min(max(int(limit or 50), 1), 200)
    page_num = max(int(page or 1), 1)
    skip = (page_num - 1) * take
    rows = list(
        session.scalars(
            select(LoginAudit).order_by(LoginAudit.created_at.desc()).offset(skip).limit(take)
        )
    )
    total = int(session.scalar(select(func.count()).select_from(LoginAudit)) or 0)
    items = [
        {
            "id": row.id,
            "username": row.username,
            "userId": row.user_id,
            "ip": row.ip,
            "success": row.success,
            "reason": row.reason,
            "createdAt": _iso(row.created_at),
        }
        for row in rows
    ]
    return {"items": items, "total": total, "page": page_num, "totalPages": max(1, -(-total // take)), "limit": take}


def _iso(value: datetime | None) -> str:
    if value is None:
        return ""
    if value.tzinfo is None:
        value = value.replace(tzinfo=UTC)
    return value.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%S.") + f"{value.microsecond // 1000:03d}Z"


# --------------------------------------------------------------------------- #
# 用户校验 / 登录
# --------------------------------------------------------------------------- #
def validate_user(
    session: Session, username: str, password: str, ip: str | None, user_agent: str | None
) -> User:
    cfg = get_auth_config(session)
    user = session.scalar(select(User).where(User.username == username))
    now = datetime.now(UTC)

    if user is not None and user.locked_until is not None and _aware(user.locked_until) > now:
        record_login_audit(session, username, user.id, ip, False, "account_locked")
        forbidden(api_error("AUTH_ACCOUNT_LOCKED"))

    if user is not None and user.locked_until is not None and _aware(user.locked_until) <= now:
        user.locked_until = None
        user.failed_login_attempts = 0
        session.commit()

    if user is not None and verify_password(password, user.password):
        user.failed_login_attempts = 0
        user.locked_until = None
        session.commit()
        record_login_audit(session, username, user.id, ip, True)
        _check_new_device_login(session, username, user.id, ip, user_agent, cfg)
        return user

    if user is not None:
        locked_until = record_failed_login_attempt(session, user.id, username, ip, cfg)
        record_login_audit(
            session, username, user.id, ip, False, "invalid_password_locked" if locked_until else "invalid_password"
        )
    else:
        verify_password(password, DUMMY_HASH)
        record_login_audit(session, username, None, ip, False, "invalid_credentials")

    unauthorized(api_error("AUTH_INVALID_CREDENTIALS"))
    raise AssertionError("unreachable")  # pragma: no cover


def _aware(value: datetime) -> datetime:
    return value if value.tzinfo is not None else value.replace(tzinfo=UTC)


def record_failed_login_attempt(
    session: Session, user_id: str, username: str, ip: str | None, cfg: Any
) -> datetime | None:
    session.execute(
        update(User)
        .where(User.id == user_id, User.failed_login_attempts < cfg.lockout_max_attempts)
        .values(failed_login_attempts=User.failed_login_attempts + 1)
    )
    session.commit()
    row = session.get(User, user_id)
    attempts = row.failed_login_attempts if row is not None else cfg.lockout_max_attempts
    locked_until: datetime | None = None
    if attempts >= cfg.lockout_max_attempts and row is not None and row.locked_until is None:
        locked_until = datetime.now(UTC) + timedelta(minutes=cfg.lockout_minutes)
        session.execute(
            update(User).where(User.id == user_id, User.locked_until.is_(None)).values(locked_until=locked_until)
        )
        session.commit()
        if cfg.brute_force_alert_enabled and cfg.login_alert_enabled:
            logger.warning(f"暴力破解告警：username={username} ip={ip} attempts={attempts}")
    return locked_until


def _check_new_device_login(
    session: Session, username: str, user_id: str, ip: str | None, user_agent: str | None, cfg: Any
) -> None:
    """新设备/新 UA 首次登录检测：仅告警，不阻断登录。"""
    if not cfg.login_alert_enabled:
        return
    try:
        cutoff = datetime.now(UTC) - timedelta(days=30)
        previous = session.scalar(
            select(func.count())
            .select_from(LoginAudit)
            .where(
                LoginAudit.user_id == user_id,
                LoginAudit.success.is_(True),
                LoginAudit.ip == (ip or "")[:64],
                LoginAudit.created_at >= cutoff,
            )
        )
        if not previous:
            logger.warning(f"新设备登录告警：username={username} ip={ip} ua={(user_agent or '')[:64]}")
    except Exception as error:  # noqa: BLE001
        logger.warning(f"新设备登录检测失败: {error}")


def refresh_session(session: Session, secret: str, user_ctx: dict[str, Any]) -> dict[str, Any]:
    user = session.get(User, user_ctx["userId"])
    if user is None:
        unauthorized(api_error("AUTH_USER_OR_SESSION_INVALID"))
    if user.totp_enabled and user_ctx.get("mfa") is not True:
        unauthorized(api_error("AUTH_MFA_RELOGIN_REQUIRED"))
    payload = build_token_payload(session, user, mfa_verified=user_ctx.get("mfa") is True)
    return {
        "access_token": sign_access_token(secret, payload, session_expire_days(session)),
        "username": user.username,
        "role": user.role,
        "restrictions": payload.get("restrictions") if isinstance(payload.get("restrictions"), list) else [],
    }


# --------------------------------------------------------------------------- #
# 首装 / 资料
# --------------------------------------------------------------------------- #
def register_first_user(session: Session, username: str, password: str) -> User:
    normalized = username.strip()
    if not normalized:
        bad_request(api_error("AUTH_USERNAME_REQUIRED"))
    assert_password_policy(password)
    if count_users(session) > 0:
        forbidden(api_error("AUTH_SYSTEM_INITIALIZED"))
    user = User(username=normalized, password=hash_password(password), role="admin")
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def update_profile(
    session: Session, user_id: str, data: dict[str, Any], token_cache: Any
) -> dict[str, Any]:
    user = session.get(User, user_id)
    if user is None:
        not_found(api_error("AUTH_USER_NOT_FOUND"))
    if data.get("username"):
        user.username = data["username"]
    bump = False
    if data.get("password"):
        assert_password_policy(data["password"])
        if not (data.get("currentPassword") or "").strip():
            bad_request(api_error("AUTH_NEED_CURRENT_PASSWORD"))
        if not verify_password(data["currentPassword"], user.password):
            unauthorized(api_error("AUTH_PASSWORD_WRONG"))
        user.password = hash_password(data["password"])
        bump = True
    if bump:
        user.token_version += 1
    session.commit()
    session.refresh(user)
    if bump and token_cache is not None:
        token_cache.invalidate(user_id)
    return _sanitize_full_user(user)


def _sanitize_full_user(user: User) -> dict[str, Any]:
    return {
        "id": user.id,
        "username": user.username,
        "role": user.role,
        "tokenVersion": user.token_version,
        "totpEnabled": user.totp_enabled,
        "failedLoginAttempts": user.failed_login_attempts,
        "lockedUntil": _iso(user.locked_until) if user.locked_until else None,
        "createdAt": _iso(user.created_at),
        "updatedAt": _iso(user.updated_at),
    }


# --------------------------------------------------------------------------- #
# 用户管理
# --------------------------------------------------------------------------- #
def _sanitize_user(user: User) -> dict[str, Any]:
    prefs = _prefs_of(user)
    return {
        "id": user.id,
        "username": user.username,
        "role": user.role,
        "entityRestrictions": prefs.get("entityRestrictions") if isinstance(prefs.get("entityRestrictions"), list) else [],
        "createdAt": _iso(user.created_at),
    }


def list_users(session: Session) -> list[dict[str, Any]]:
    rows = list(session.scalars(select(User).order_by(User.created_at.asc()).limit(500)))
    return [_sanitize_user(u) for u in rows]


def create_user(session: Session, data: dict[str, Any]) -> dict[str, Any]:
    assert_password_policy(data["password"])
    if session.scalar(select(User).where(User.username == data["username"])) is not None:
        forbidden(api_error("AUTH_USER_EXISTS"))
    role = data.get("role") or "adult"
    if role not in ("admin", "adult", "child"):
        forbidden(api_error("AUTH_INVALID_ROLE"))
    user = User(
        username=data["username"],
        password=hash_password(data["password"]),
        role=role,
        preferences=json.dumps({"entityRestrictions": data.get("entityRestrictions") or []}, ensure_ascii=False),
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return _sanitize_user(user)


def update_user(
    session: Session, user_id: str, data: dict[str, Any], actor_role: str, token_cache: Any
) -> dict[str, Any]:
    user = session.get(User, user_id)
    if user is None:
        not_found(api_error("AUTH_USER_NOT_FOUND"))
    if user.role == "admin" and actor_role != "admin":
        forbidden(api_error("AUTH_CANNOT_MODIFY_ADMIN"))
    bump = False
    if data.get("username"):
        user.username = data["username"]
    if data.get("password"):
        assert_password_policy(data["password"])
        user.password = hash_password(data["password"])
        bump = True
    if data.get("role"):
        if data["role"] not in ("admin", "adult", "child"):
            forbidden(api_error("AUTH_INVALID_ROLE"))
        if data["role"] != user.role:
            if user.role == "admin" and data["role"] != "admin":
                admin_count = int(session.scalar(select(func.count()).select_from(User).where(User.role == "admin")) or 0)
                if admin_count <= 1:
                    bad_request(api_error("AUTH_CANNOT_DEMOTE_LAST_ADMIN"))
            user.role = data["role"]
            bump = True
    if data.get("entityRestrictions") is not None:
        prefs = _prefs_of(user)
        prev = prefs.get("entityRestrictions") if isinstance(prefs.get("entityRestrictions"), list) else []
        nxt = data["entityRestrictions"]
        if prev != nxt:
            bump = True
        prefs["entityRestrictions"] = nxt
        user.preferences = json.dumps(prefs, ensure_ascii=False)
    if bump:
        user.token_version += 1
    session.commit()
    session.refresh(user)
    if bump and token_cache is not None:
        token_cache.invalidate(user_id)
    return _sanitize_user(user)


def delete_user(session: Session, user_id: str, actor_id: str, token_cache: Any) -> dict[str, Any]:
    if user_id == actor_id:
        forbidden(api_error("AUTH_CANNOT_DELETE_SELF"))
    user = session.get(User, user_id)
    if user is None:
        not_found(api_error("AUTH_USER_NOT_FOUND"))
    admin_count = int(session.scalar(select(func.count()).select_from(User).where(User.role == "admin")) or 0)
    if user.role == "admin" and admin_count <= 1:
        forbidden(api_error("AUTH_CANNOT_DELETE_LAST_ADMIN"))
    session.delete(user)
    session.commit()
    if token_cache is not None:
        token_cache.invalidate(user_id)
    return {"success": True}


# --------------------------------------------------------------------------- #
# 偏好
# --------------------------------------------------------------------------- #
def get_user_preferences(session: Session, user_id: str) -> dict[str, Any]:
    user = session.get(User, user_id)
    prefs = _prefs_of(user) if user is not None else {}
    return {**DEFAULT_USER_PREFERENCES, **prefs}


def update_user_preferences(
    session: Session, user_id: str, prefs: dict[str, Any], token_cache: Any
) -> dict[str, Any]:
    user = session.get(User, user_id)
    existing = _prefs_of(user) if user is not None else {}
    sanitized = {key: prefs[key] for key in DEFAULT_USER_PREFERENCES if key in prefs and prefs[key] is not None}
    merged = {**existing, **sanitized}
    if user is not None:
        user.preferences = json.dumps(merged, ensure_ascii=False)
        session.commit()
    if token_cache is not None:
        token_cache.invalidate(user_id)
    return get_user_preferences(session, user_id)


# --------------------------------------------------------------------------- #
# MFA
# --------------------------------------------------------------------------- #
def get_mfa_status(session: Session, user_id: str) -> dict[str, Any]:
    user = session.get(User, user_id)
    if user is None or user.role != "admin":
        forbidden(api_error("AUTH_MFA_ADMIN_ONLY"))
    return {"enabled": user.totp_enabled}


def start_mfa_setup(session: Session, user_id: str) -> dict[str, Any]:
    user = session.get(User, user_id)
    if user is None or user.role != "admin":
        forbidden(api_error("AUTH_MFA_ADMIN_ONLY"))
    secret = pyotp.random_base32()
    user.totp_secret = secret
    user.totp_enabled = False
    session.commit()
    uri = pyotp.TOTP(secret).provisioning_uri(name=user.username, issuer_name="HomeOS")
    qr_data_url = ""
    try:
        import base64
        import io

        import qrcode
        import qrcode.image.svg  # noqa: F401

        img = qrcode.make(uri)
        buffer = io.BytesIO()
        img.save(buffer, format="PNG")
        qr_data_url = "data:image/png;base64," + base64.b64encode(buffer.getvalue()).decode()
    except Exception as error:  # noqa: BLE001
        logger.warning(f"生成 MFA 二维码失败: {error}")
    return {"secret": secret, "uri": uri, "qrDataUrl": qr_data_url}


def _verify_totp(secret: str, code: str) -> bool:
    try:
        return bool(pyotp.TOTP(secret).verify(code, valid_window=1))
    except Exception:  # noqa: BLE001
        return False


def confirm_mfa_setup(
    session: Session, user_id: str, code: str, token_cache: Any
) -> dict[str, Any]:
    user = session.get(User, user_id)
    if user is None or not user.totp_secret:
        bad_request(api_error("AUTH_MFA_SETUP_REQUIRED"))
    if not _verify_totp(user.totp_secret, code):
        bad_request(api_error("AUTH_MFA_TOTP_INVALID"))
    user.totp_enabled = True
    user.token_version += 1
    session.commit()
    if token_cache is not None:
        token_cache.invalidate(user_id)
    return {"enabled": True}


def disable_mfa(session: Session, user_id: str, code: str, token_cache: Any) -> dict[str, Any]:
    user = session.get(User, user_id)
    if user is None or not user.totp_secret or not user.totp_enabled:
        return {"enabled": False}
    if not _verify_totp(user.totp_secret, code):
        bad_request(api_error("AUTH_MFA_TOTP_INVALID"))
    user.totp_enabled = False
    user.totp_secret = None
    user.token_version += 1
    session.commit()
    if token_cache is not None:
        token_cache.invalidate(user_id)
    return {"enabled": False}


def login_with_mfa(
    session: Session,
    secret: str,
    username: str,
    password: str,
    code: str,
    ip: str | None,
    user_agent: str | None,
) -> dict[str, Any]:
    cfg = get_auth_config(session)
    user = validate_user(session, username, password, ip, user_agent)
    if not user.totp_enabled or not user.totp_secret:
        bad_request(api_error("AUTH_MFA_NOT_ENABLED"))
    if not _verify_totp(user.totp_secret, code):
        locked = record_failed_login_attempt(session, user.id, username, ip, cfg)
        record_login_audit(
            session, username, user.id, ip, False, "invalid_mfa_locked" if locked else "invalid_mfa"
        )
        unauthorized(api_error("AUTH_MFA_TOTP_INVALID"))
    return login_response(session, secret, user, mfa_verified=True)


def user_requires_mfa(user: User) -> bool:
    return user.role == "admin" and user.totp_enabled is True


# --------------------------------------------------------------------------- #
# 访客
# --------------------------------------------------------------------------- #
def _prune_guest_codes(session: Session) -> None:
    try:
        session.execute(delete(GuestShareCode).where(GuestShareCode.expires_at < datetime.now(UTC)))
        session.commit()
    except Exception as error:  # noqa: BLE001
        session.rollback()
        logger.warning(f"清理访客短码失败: {error}")


def generate_guest_token(
    session: Session, secret: str, issuer_id: str, valid_hours: float, restrictions: list[str] | None, allowed_scene_ids: list[str] | None
) -> dict[str, Any]:
    _prune_guest_codes(session)
    token_id = secrets.token_hex(8)
    payload = {
        "sub": f"guest:{token_id}",
        "role": "guest",
        "iss": issuer_id,
        "restrictions": restrictions or [],
        "allowedSceneIds": [s for s in (allowed_scene_ids or []) if s],
    }
    token = sign_token(payload, secret, int(valid_hours * 3600))
    code = secrets.token_hex(12)
    expires = datetime.now(UTC) + timedelta(hours=valid_hours)
    session.add(GuestShareCode(code=code, payload=json.dumps(payload, ensure_ascii=False), expires_at=expires))
    session.commit()
    return {
        "token": token,
        "code": code,
        "tokenId": token_id,
        "expiresAt": _iso(expires),
        "validHours": valid_hours,
        "shareUrl": f"/guest?code={code}",
    }


def verify_guest_token(secret: str, token: str) -> dict[str, Any]:
    payload = verify_token(token, secret)
    if payload.get("role") != "guest":
        unauthorized(api_error("AUTH_NOT_GUEST_TOKEN"))
    return {
        "valid": True,
        "issuerId": payload.get("iss"),
        "restrictions": payload.get("restrictions") or [],
        "allowedSceneIds": payload.get("allowedSceneIds") if isinstance(payload.get("allowedSceneIds"), list) else [],
        "expiresAt": _iso(datetime.fromtimestamp(int(payload.get("exp", 0)), tz=UTC)),
    }


def guest_login(secret: str, token: str) -> dict[str, Any]:
    info = verify_guest_token(secret, token)
    return {
        "role": "guest",
        "restrictions": info["restrictions"],
        "allowedSceneIds": info["allowedSceneIds"],
        "expiresAt": info["expiresAt"],
        "access_token": token,
    }


def exchange_guest_code(session: Session, secret: str, code: str) -> dict[str, Any]:
    if not code or not code.strip():
        raise BusinessException(ErrorCode.VALIDATION_FAILED, api_error("AUTH_GUEST_SHARE_CODE_MISSING"))
    _prune_guest_codes(session)
    trimmed = code.strip()
    entry = session.get(GuestShareCode, trimmed)
    if entry is None:
        raise BusinessException(ErrorCode.NOT_FOUND, api_error("AUTH_GUEST_SHARE_CODE_INVALID"))
    expires_at = _aware(entry.expires_at)
    payload_raw = entry.payload
    session.delete(entry)
    session.commit()
    if expires_at < datetime.now(UTC):
        raise BusinessException(ErrorCode.NOT_FOUND, api_error("AUTH_GUEST_SHARE_CODE_INVALID"))
    try:
        payload = json.loads(payload_raw) if payload_raw else None
    except (TypeError, ValueError):
        payload = None
    if not isinstance(payload, dict):
        raise BusinessException(ErrorCode.VALIDATION_FAILED, api_error("AUTH_GUEST_SHARE_CODE_PAYLOAD_INVALID"))
    remaining = max(60, int((expires_at - datetime.now(UTC)).total_seconds()))
    token = sign_token(payload, secret, remaining)
    return guest_login(secret, token)
