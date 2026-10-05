"""CSRF Double-submit Cookie 防护（含 ASGI 中间件）。

复刻 Nest ``csrf.util`` 的豁免表与 ``csrf.middleware`` 的 403 行为；失败时直接返回
Nest 结构错误信封，避免依赖中间件与异常处理器的执行顺序。
"""

from __future__ import annotations

import hmac
import secrets
from datetime import UTC, datetime
from typing import Any

from fastapi import Request
from starlette.responses import JSONResponse

from ..core.errors import api_error, resolve_api_error_code

#: CSRF token 在 Cookie / 请求头中的名字（与 Nest 一致）。
CSRF_COOKIE = "csrf_token"
CSRF_HEADER = "x-csrf-token"

#: 公开预认证端点 / 实时通道豁免表（逐条对齐 Nest）。
CSRF_SKIP_PATHS = frozenset(
    {
        "/health",
        "/api/v1/auth/status",
        "/api/v1/auth/setup",
        "/api/v1/auth/login",
        "/api/v1/auth/mfa/verify",
        "/api/v1/auth/guest-login",
        "/api/v1/auth/guest-exchange",
        "/api/v1/license/status",
        "/api/v1/license/activate",
        "/api/v1/channels/wecom/callback",
    }
)

SAFE_METHODS = frozenset({"GET", "HEAD", "OPTIONS"})


def generate_csrf_token() -> str:
    return secrets.token_bytes(24).hex()


def is_csrf_exempt_path(path: str) -> bool:
    if path in CSRF_SKIP_PATHS:
        return True
    if path == "/socket.io" or path.startswith("/socket.io/"):
        return True
    if path == "/api/v1/mcp" or path.startswith("/api/v1/mcp/"):
        return True
    return path.startswith("/api/v1/ha/webrtc-ws")


def validate_csrf(method: str, path: str, cookie_token: str | None, header_token: str | None) -> bool:
    if method.upper() in SAFE_METHODS:
        return True
    if is_csrf_exempt_path(path):
        return True
    if not cookie_token or not header_token:
        return False
    if len(cookie_token) != len(header_token):
        return False
    return hmac.compare_digest(cookie_token.encode(), header_token.encode())


def _csrf_error_payload(request: Request) -> dict[str, Any]:
    message = api_error("CSRF_INVALID")
    now = datetime.now(UTC)
    payload: dict[str, Any] = {
        "statusCode": 403,
        "errorCode": "FORBIDDEN",
        "error": "Forbidden",
        "message": message,
        "timestamp": now.strftime("%Y-%m-%dT%H:%M:%S.") + f"{now.microsecond // 1000:03d}Z",
        "path": f"{request.url.path}?{request.url.query}" if request.url.query else request.url.path,
    }
    code = resolve_api_error_code(message)
    if code:
        payload["apiErrorCode"] = code
    return payload


class CsrfMiddleware:
    """纯 ASGI 中间件：变更类请求校验 Cookie/Header 双提交。"""

    def __init__(self, app, cookie_name: str = CSRF_COOKIE, header_name: str = CSRF_HEADER) -> None:
        self.app = app
        self.cookie_name = cookie_name
        self.header_name = header_name.lower()

    async def __call__(self, scope, receive, send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        request = Request(scope, receive)
        if not validate_csrf(
            request.method,
            request.url.path,
            request.cookies.get(self.cookie_name),
            request.headers.get(self.header_name),
        ):
            response = JSONResponse(status_code=403, content=_csrf_error_payload(request))
            await response(scope, receive, send)
            return
        await self.app(scope, receive, send)
