"""CORS 中间件：复刻 Nest ``isOriginAllowed``（显式白名单 + 局域网默认放行）。

预检（OPTIONS）直接返回 204；实际请求回写 ``Access-Control-Allow-Origin`` 与凭证头。
"""

from __future__ import annotations

from starlette.datastructures import Headers
from starlette.responses import Response
from starlette.types import ASGIApp, Receive, Scope, Send

from .cookies import is_origin_allowed, resolve_allowed_origins


class CorsMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app
        self.allowed_origins = resolve_allowed_origins()
        self.allow_headers = "Content-Type, Authorization, X-CSRF-Token, X-Requested-With, X-Trace-Id"
        self.allow_methods = "GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD"

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        headers = Headers(scope=scope)
        origin = headers.get("origin")
        allowed = bool(origin) and is_origin_allowed(origin, self.allowed_origins)

        if scope["method"] == "OPTIONS" and headers.get("access-control-request-method"):
            response = Response(status_code=204)
            self._apply(response, origin, allowed, preflight=True)
            await response(scope, receive, send)
            return

        async def send_wrapper(message):
            if message["type"] == "http.response.start":
                response_headers = list(message.get("headers", []))
                self._inject(response_headers, origin, allowed)
                message = {**message, "headers": response_headers}
            await send(message)

        await self.app(scope, receive, send_wrapper)

    def _apply(self, response: Response, origin: str | None, allowed: bool, *, preflight: bool) -> None:
        if origin and allowed:
            response.headers["Access-Control-Allow-Origin"] = origin
            response.headers["Access-Control-Allow-Credentials"] = "true"
            response.headers["Vary"] = "Origin"
        if preflight:
            response.headers["Access-Control-Allow-Methods"] = self.allow_methods
            response.headers["Access-Control-Allow-Headers"] = self.allow_headers
            response.headers["Access-Control-Max-Age"] = "600"

    @staticmethod
    def _inject(headers: list, origin: str | None, allowed: bool) -> None:
        if not origin or not allowed:
            return
        headers.append((b"access-control-allow-origin", origin.encode()))
        headers.append((b"access-control-allow-credentials", b"true"))
        headers.append((b"vary", b"Origin"))
