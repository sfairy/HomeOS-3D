"""JWT 签发/校验与会话时长（HS256，与 Nest ``jsonwebtoken`` 同口径）。

载荷字段与 Nest 侧一致：``username`` / ``sub`` / ``role`` / ``tv`` / ``jti``，
可选 ``mfa`` / ``restrictions`` / ``allowedSceneIds``；``iat`` / ``exp`` 自动写入。
"""

from __future__ import annotations

import time
from typing import Any

import jwt
from fastapi import Request

from ..core.errors import unauthorized

#: 会话有效期天数缺省（DEFAULT_AUTH_SECURITY.sessionExpireDays）。
DEFAULT_SESSION_EXPIRE_DAYS = 30

_COOKIE_NAME = "auth_token"


def get_session_expire_days(raw: Any) -> int:
    try:
        value = float(raw)
    except (TypeError, ValueError):
        return DEFAULT_SESSION_EXPIRE_DAYS
    if value != value or value in (float("inf"), float("-inf")):
        return DEFAULT_SESSION_EXPIRE_DAYS
    return min(365, max(1, round(value)))


def get_session_expires_in_seconds(session_expire_days: int) -> int:
    return session_expire_days * 24 * 60 * 60


def get_session_cookie_max_age_ms(session_expire_days: int) -> int:
    return session_expire_days * 24 * 60 * 60 * 1000


def sign_token(payload: dict[str, Any], secret: str, expires_in_seconds: int) -> str:
    now = int(time.time())
    claims = {**payload, "iat": now, "exp": now + expires_in_seconds}
    return jwt.encode(claims, secret, algorithm="HS256")


def verify_token(token: str, secret: str) -> dict[str, Any]:
    """校验 JWT；过期或签名不符时抛 401（文案与 Nest 一致）。"""
    try:
        return jwt.decode(token, secret, algorithms=["HS256"])
    except jwt.ExpiredSignatureError:
        unauthorized("未登录或登录已过期")
    except jwt.PyJWTError:
        unauthorized("未登录或登录已过期")
    raise AssertionError("unreachable")  # pragma: no cover


def decode_unverified(token: str) -> dict[str, Any]:
    return jwt.decode(token, options={"verify_signature": False, "verify_exp": False})


# --------------------------------------------------------------------------- #
# Token 提取（签名策略顺序：Cookie 优先 → Bearer）
# --------------------------------------------------------------------------- #
def extract_jwt_from_cookie(request: Request, cookie_name: str = _COOKIE_NAME) -> str | None:
    token = request.cookies.get(cookie_name)
    return token if isinstance(token, str) and token else None


def extract_jwt_from_bearer(request: Request) -> str | None:
    header = request.headers.get("authorization")
    if not header or not header.lower().startswith("bearer "):
        return None
    token = header[7:].strip()
    return token or None


def extract_jwt_from_request(request: Request, cookie_name: str = _COOKIE_NAME) -> str | None:
    return extract_jwt_from_cookie(request, cookie_name) or extract_jwt_from_bearer(request)
