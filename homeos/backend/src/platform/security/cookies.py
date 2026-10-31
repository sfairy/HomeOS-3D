"""Cookie 属性解析与写入（auth_token / csrf_token）。

复刻 Nest ``cookie-cors.util`` 的 ``COOKIE_SECURE`` 三态语义（true/false/auto，auto 时
按 ``X-Forwarded-Proto`` 判定），以及 auth 控制器里 auth/csrf Cookie 的写入与清除属性。
"""

from __future__ import annotations

import os
from urllib.parse import urlparse

from fastapi import Request, Response

from .client_address import resolve_client_address_from_request
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
    # X-Forwarded-Proto 是客户端可伪造的头：只有 TCP 对端确实是可信代理时才采信。
    # 否则直连客户端发一个 ``X-Forwarded-Proto: https`` 就能让本应 Secure 的 Cookie
    # 变成非 Secure（或反过来让 http 部署写 Secure 后浏览器不回传）。
    if not resolve_client_address_from_request(request).via_proxy:
        return False
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


def resolve_session_cookie_secure(request: Request) -> bool:
    """会话 Cookie 的 ``Secure``：与 CSRF Cookie 共用同一套三态判定。"""
    return resolve_cookie_secure_for_request(request)


def is_https_deploy_mode() -> bool:
    return get_cookie_secure_mode() == "true"


# CORS 来源判定（与 Nest cookie-cors.util 等价）
def _origin_of(url: str) -> str:
    """把 ``https://host:port/path`` 收敛成浏览器 ``Origin`` 的口径 ``scheme://host[:port]``。

    统一小写：浏览器发出的 ``Origin`` 里 scheme / host 一定是小写，配置里手写的
    ``https://HomeOS.Example.com`` 若原样比较就会永远不匹配。
    """
    try:
        parsed = urlparse((url or "").strip())
    except ValueError:
        return ""
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        return ""
    return f"{parsed.scheme}://{parsed.netloc}".lower()


def resolve_allowed_origins() -> list[str]:
    raw = os.getenv("CORS_ORIGINS", "")
    origins = [item.strip() for item in raw.split(",") if item.strip()] if raw else []
    # ``APP_BASE_URL`` 自动算一条白名单。反代 / 内网穿透部署里对外域名通常只写在那里
    # （同源校验、WebSocket 来源、绝对链接都按它），若还要在 ``CORS_ORIGINS`` 里再抄一遍，
    # 就是同一个值两处维护。漏抄的直接症状是 **socket.io 握手被拒**：浏览器 WebSocket
    # 一定带 ``Origin``，engineio 会拿它比对白名单，而白名单为空时只放行局域网来源
    # （见 :func:`is_lan_origin`），公网域名会被判「Not an accepted origin」。
    base = _origin_of(os.getenv("APP_BASE_URL", ""))
    if base and base not in origins:
        origins.append(base)
    return origins


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
    # 显式白名单一旦配置，就只认白名单：此时再放行任意私网 / `.local` 来源，
    # 等于让同网段的任意页面携带凭据跨源读写（CORS 会回写
    # `Access-Control-Allow-Credentials: true`）。仅当白名单为空（客户机默认
    # 部署）才走局域网兜底，避免把「没配域名」误判成「拒绝一切」。
    if not allowed_origins:
        return is_lan_origin(origin)
    return False


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
