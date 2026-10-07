"""WS 握手鉴权：从 Cookie 提取令牌并按 ``sessions`` 表解析用户。

会话真相源与 HTTP 侧一致（homeos-3d ``LoginSession``）：令牌落库形态为 sha256，
会话记录即代表「已通过登录校验」，且可服务端吊销。
"""

from __future__ import annotations

from http.cookies import SimpleCookie
from typing import Any

from sqlalchemy.orm import Session

from ..core.errors import api_error
from ..security.session_store import resolve_login_session
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


def resolve_db_session_user(session: Session, token: str) -> dict[str, Any] | None:
    """按 DB 会话令牌（homeos-3d ``LoginSession``）解析 WS 用户。"""
    user = resolve_login_session(session, token)
    if user is None:
        return None
    role = user.role or "user"
    return {
        "userId": user.id,
        "username": user.username,
        "role": role,
        "restrictions": resolve_entity_restrictions({"role": role, "restrictions": None}),
    }


def resolve_ws_user(token: str, session: Session) -> dict[str, Any]:
    """解析 WS 用户；会话无效/过期时抛 ``ValueError``。

    单一凭证：``sessions`` 表里的 DB 会话（无 JWT、无 tokenVersion 旁路）。
    """
    db_user = resolve_db_session_user(session, token)
    if db_user is None:
        raise ValueError(api_error("AUTH_SESSION_EXPIRED"))
    return db_user
