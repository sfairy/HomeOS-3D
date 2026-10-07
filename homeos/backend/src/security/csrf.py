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

#: 公开预认证端点 / 实时通道豁免表（逐条对齐 Nest，另见下方匿名上报端点）。
#: 收敛到 homeos-3d 机制后，初始化 / 登录 / 登出与授权激活系列端点改为公开预认证语义
#: （3D 前端不带 CSRF 头），因此整体豁免；其余业务写请求仍受双提交校验保护。
#:
#: 授权端点中只有**变更类**才需要列在这里：``/license/status``、``/license/availability``
#: 是 GET，已被 ``SAFE_METHODS`` 覆盖。``/license/activate|reactivate|retry`` 的写保护由
#: ``security/request_origin.py#require_same_origin_write``（``Sec-Fetch-Site`` + ``Origin``
#: / ``Referer`` 同源校验）在同一端点内承担 —— 激活页在未激活时可能还没有会话，拿不到
#: ``csrf_token`` Cookie，双提交校验会把唯一的修复入口锁死。
CSRF_SKIP_PATHS = frozenset(
    {
        "/health",
        "/api/v1/setup/admin",
        "/api/v1/auth/login",
        "/api/v1/auth/logout",
        "/api/v1/license/activate",
        "/api/v1/license/reactivate",
        "/api/v1/license/retry",
        "/api/v1/channels/wecom/callback",
        # 未登录页面的异常上报（并入 homeos-3d）：上报方是构建期产出的经典 IIFE
        # `/static/logging/client-log.js`，用裸 fetch 发送、只带 Content-Type，**不会**
        # 也不能带 X-CSRF-Token（首屏可能尚无 csrf_token Cookie）。路由自身已做同源
        # Origin/Host 校验 + 仅允许 error/warning + 页面白名单 + 匿名限流，跨站写入被
        # 同源校验挡住，CSRF 在此无额外保护价值；若不放行，未登录页的异常上报恒定 403
        # 并被客户端静默丢弃（用户报错时恰恰拿不到日志）。
        "/api/v1/logs/public-events",
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
