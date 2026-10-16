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


def resolve_session_cookie_secure(request: Request, settings) -> bool:
    """会话 Cookie 的 ``Secure``：与 CSRF Cookie 共用同一套三态判定。

    此前会话 Cookie 直接吃 ``settings.cookie_secure``（布尔），而 ``COOKIE_SECURE=auto``
    会被 ``_environment_bool`` 判成 False —— HTTPS 部署下同一次响应里 ``csrf_token`` 带
    Secure、``auth_token`` 不带，属性互相矛盾，会话 Cookie 的传输要求反而更弱。

    这里统一口径：显式置真/置假照旧，``auto``（含未设置）跟随请求实际协议
    （含反向代理下的 ``X-Forwarded-Proto``）。
    """
    if getattr(settings, "cookie_secure", False):
        return True
    return resolve_cookie_secure_for_request(request)


def is_https_deploy_mode() -> bool:
    return get_cookie_secure_mode() == "true"


# CORS 来源判定（与 Nest cookie-cors.util 等价）
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
    if host.startswith(("10.", "192.168.", "169.254.")):
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


# Cookie 写入 / 清除
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
