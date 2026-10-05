"""Cookie 属性解析与写入（auth_token / csrf_token）。

复刻 Nest ``cookie-cors.util`` 的 ``COOKIE_SECURE`` 三态语义（true/false/auto，auto 时
按 ``X-Forwarded-Proto`` 判定），以及 auth 控制器里 auth/csrf Cookie 的写入与清除属性。
"""

from __future__ import annotations

import os
from urllib.parse import urlparse

from fastapi import Request, Response

from .csrf import CSRF_COOKIE, generate_csrf_token

CookieSecureMode = str  # 'true' | 'false' | 'auto'


def get_cookie_secure_mode() -> CookieSecureMode:
    value = (os.getenv("COOKIE_SECURE") or "").strip().lower()
    if value == "true":
        return "true"
    if value == "false":
        return "false"
    return "auto"


def is_request_secure(request: Request) -> bool:
    if request.url.scheme == "https":
        return True
    proto = request.headers.get("x-forwarded-proto", "")
    first = proto.split(",")[0].strip().lower() if proto else ""
    return first == "https"


def resolve_cookie_secure_for_request(request: Request) -> bool:
    mode = get_cookie_secure_mode()
    if mode == "true":
        return True
    if mode == "false":
        return False
    return is_request_secure(request)


def is_https_deploy_mode() -> bool:
    return get_cookie_secure_mode() == "true"


# --------------------------------------------------------------------------- #
# CORS 来源判定（与 Nest cookie-cors.util 等价）
# --------------------------------------------------------------------------- #
def resolve_allowed_origins() -> list[str]:
    raw = os.getenv("CORS_ORIGINS", "")
    return [item.strip() for item in raw.split(",") if item.strip()] if raw else []


def is_lan_origin(origin: str) -> bool:
    try:
        host = (urlparse(origin).hostname or "").lower().strip("[]")
    except ValueError:
        return False
    if host in {"localhost", "127.0.0.1", "::1", "::ffff:127.0.0.1"}:
        return True
    if host.startswith("10.") or host.startswith("192.168.") or host.startswith("169.254."):
        return True
    if host.startswith("172."):
        try:
            second = int(host.split(".")[1])
            if 16 <= second <= 31:
                return True
        except (IndexError, ValueError):
            pass
    return host.endswith(".local")


def is_origin_allowed(origin: str, allowed_origins: list[str]) -> bool:
    if origin in allowed_origins:
        return True
    if not allowed_origins:
        return is_lan_origin(origin)
    return is_lan_origin(origin)


# --------------------------------------------------------------------------- #
# Cookie 写入 / 清除
# --------------------------------------------------------------------------- #
def set_auth_cookie(
    response: Response,
    request: Request,
    token: str,
    cookie_name: str,
    max_age_ms: int,
) -> None:
    response.set_cookie(
        key=cookie_name,
        value=token,
        max_age=max_age_ms // 1000,
        httponly=True,
        samesite="lax",
        secure=resolve_cookie_secure_for_request(request),
        path="/",
    )


def set_csrf_cookie(
    response: Response,
    request: Request,
    cookie_name: str = CSRF_COOKIE,
    max_age_ms: int = 30 * 24 * 3600 * 1000,
) -> str:
    token = generate_csrf_token()
    response.set_cookie(
        key=cookie_name,
        value=token,
        max_age=max_age_ms // 1000,
        httponly=False,
        samesite="lax",
        secure=resolve_cookie_secure_for_request(request),
        path="/",
    )
    return token


def ensure_csrf_cookie(
    response: Response,
    request: Request,
    cookie_name: str = CSRF_COOKIE,
    max_age_ms: int = 30 * 24 * 3600 * 1000,
) -> None:
    """仅在缺少 csrf_token 时下发（避免与并发写请求抢写导致 Header≠Cookie）。"""
    existing = request.cookies.get(cookie_name)
    if isinstance(existing, str) and existing:
        return
    set_csrf_cookie(response, request, cookie_name, max_age_ms)


def clear_auth_cookies(
    response: Response, request: Request, auth_cookie_name: str, csrf_cookie_name: str
) -> None:
    secure = resolve_cookie_secure_for_request(request)
    response.delete_cookie(
        auth_cookie_name, path="/", httponly=True, samesite="lax", secure=secure
    )
    response.delete_cookie(csrf_cookie_name, path="/", samesite="lax", secure=secure)
