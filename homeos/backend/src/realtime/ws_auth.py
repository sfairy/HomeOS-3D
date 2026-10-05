"""WS 握手鉴权：从 Cookie 提取 token 并解析用户（复用 HTTP 侧 tokenVersion/吊销语义）。"""

from __future__ import annotations

from http.cookies import SimpleCookie
from typing import Any

from sqlalchemy.orm import Session

from ..core.errors import api_error
from ..core.models import User
from ..security.sessions import SessionRevocation, TokenVersionCache
from ..security.tokens import verify_token
from ..services.auth import _prefs_of  # noqa: PLC2701 - 复用偏好解析
from .access import resolve_entity_restrictions


def extract_auth_token_from_cookie(cookie_header: str | None, cookie_name: str = "auth_token") -> str | None:
    if not cookie_header:
        return None
    try:
        jar = SimpleCookie()
        jar.load(cookie_header)
    except Exception:  # noqa: BLE001
        return None
    morsel = jar.get(cookie_name)
    return morsel.value if morsel and morsel.value else None


def resolve_ws_user(
    token: str,
    secret: str,
    session: Session,
    token_cache: TokenVersionCache | None,
    revocation: SessionRevocation | None,
) -> dict[str, Any]:
    """解析 WS 用户；token 无效/被吊销/版本不符时抛 ``ValueError``。"""
    payload = verify_token(token, secret)
    role = payload.get("role") or "user"

    if role == "guest":
        return {
            "userId": payload.get("sub"),
            "username": payload.get("username") or "guest",
            "role": "guest",
            "restrictions": payload.get("restrictions") if isinstance(payload.get("restrictions"), list) else None,
            "allowedSceneIds": payload.get("allowedSceneIds") if isinstance(payload.get("allowedSceneIds"), list) else None,
        }

    token_version = payload.get("tv") if isinstance(payload.get("tv"), int) else 0
    cached = token_cache.get_snapshot(payload["sub"]) if token_cache is not None else None
    if cached is not None and cached.token_version == token_version:
        return {
            "userId": payload["sub"],
            "username": cached.username or payload.get("username"),
            "role": cached.role or role,
            "restrictions": resolve_entity_restrictions({"role": cached.role or role, "restrictions": _prefs_restrictions(cached.preferences)}),
        }

    user = session.get(User, payload["sub"])
    if user is None or token_version != user.token_version:
        raise ValueError(api_error("AUTH_SESSION_EXPIRED"))
    prefs = _prefs_of(user)
    restrictions = prefs.get("entityRestrictions") if isinstance(prefs.get("entityRestrictions"), list) else None
    if token_cache is not None:
        token_cache.set_snapshot(
            payload["sub"],
            token_version=user.token_version,
            username=user.username,
            role=user.role,
            preferences=prefs,
        )
    return {
        "userId": payload["sub"],
        "username": user.username,
        "role": user.role or role,
        "restrictions": resolve_entity_restrictions({"role": user.role or role, "restrictions": restrictions}),
    }


def _prefs_restrictions(preferences: Any) -> list[str] | None:
    if isinstance(preferences, dict):
        value = preferences.get("entityRestrictions")
        if isinstance(value, list):
            return value
    return None
