"""请求体大小门禁（对齐 Nest ``main.ts`` 的 body-parser limit）。

Nest 全局 JSON/urlencoded 解析器限 50MB；对一组「未鉴权即解析」的端点单独挂 1MB
小解析器（``PUBLIC_BODY_LIMIT_PATHS``），避免未认证请求在限流拒绝前用巨型 JSON body
耗尽解析 CPU / 内存。FastAPI 默认不限制请求体大小，故在此补齐。

行为：
- 有 ``Content-Length`` 且超过限额 → 立即返回 413（不读取 body）；
- 分块 / 无长度：包装 ``receive`` 累计字节，超限时抛出业务异常（由应用层异常处理器
  渲染为 413 信封），并向下游返回 ``http.disconnect`` 阻断后续读取。
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from starlette.requests import Request
from starlette.responses import JSONResponse

from ..core.errors import BusinessException, ErrorCode, api_error

#: ``main.ts`` 中挂 1MB 解析器的公共端点前缀（精确匹配或 ``prefix/`` 子路径）。
PUBLIC_BODY_LIMIT_PATHS: tuple[str, ...] = (
    "/api/v1/auth/login",
    "/api/v1/auth/setup",
    "/api/v1/auth/guest-login",
    "/api/v1/auth/status",
    "/api/v1/system/config/public",
    "/api/v1/ha/status",
    "/api/v1/entities",
    "/api/v1/mcp",
)

PAYLOAD_TOO_LARGE_STATUS = 413

PayloadBuilder = Callable[..., dict[str, Any]]


def is_public_body_limit_path(path: str) -> bool:
    return any(path == prefix or path.startswith(f"{prefix}/") for prefix in PUBLIC_BODY_LIMIT_PATHS)


def _content_length(scope: dict[str, Any]) -> int | None:
    for raw_key, raw_value in scope.get("headers", []):
        if raw_key.lower() == b"content-length":
            try:
                return int(raw_value.decode("latin-1").strip())
            except (ValueError, UnicodeDecodeError):
                return None
    return None


class BodyLimitMiddleware:
    """纯 ASGI 中间件：按端点分级限制请求体字节数。"""

    def __init__(
        self,
        app: Any,
        *,
        public_max_bytes: int,
        authenticated_max_bytes: int,
        build_payload: PayloadBuilder,
    ) -> None:
        self.app = app
        self.public_max_bytes = max(1, int(public_max_bytes))
        self.authenticated_max_bytes = max(1, int(authenticated_max_bytes))
        self.build_payload = build_payload

    def _limit_for(self, path: str) -> int:
        return self.public_max_bytes if is_public_body_limit_path(path) else self.authenticated_max_bytes

    async def _reject(self, scope: dict[str, Any], receive: Any, send: Any) -> None:
        request = Request(scope)
        payload = self.build_payload(
            status=PAYLOAD_TOO_LARGE_STATUS,
            error_code=str(ErrorCode.VALIDATION_FAILED),
            message=api_error("PAYLOAD_TOO_LARGE"),
            error="PayloadTooLargeError",
            request=request,
            trace_id=request.headers.get("x-trace-id"),
        )
        response = JSONResponse(status_code=PAYLOAD_TOO_LARGE_STATUS, content=payload)
        await response(scope, receive, send)

    async def __call__(self, scope: dict[str, Any], receive: Any, send: Any) -> None:
        if scope.get("type") != "http":
            await self.app(scope, receive, send)
            return

        path = str(scope.get("path") or "")
        limit = self._limit_for(path)
        declared = _content_length(scope)
        if declared is not None and declared > limit:
            await self._reject(scope, receive, send)
            return

        received = 0

        async def guarded_receive() -> Any:
            nonlocal received
            message = await receive()
            if message.get("type") == "http.request":
                received += len(message.get("body", b"") or b"")
                if received > limit:
                    # 抛给应用层异常处理器渲染 413；随后断开 body 读取
                    raise BusinessException(
                        ErrorCode.VALIDATION_FAILED,
                        api_error("PAYLOAD_TOO_LARGE"),
                        PAYLOAD_TOO_LARGE_STATUS,
                    )
            return message

        await self.app(scope, guarded_receive, send)


__all__ = [
    "BodyLimitMiddleware",
    "PAYLOAD_TOO_LARGE_STATUS",
    "PUBLIC_BODY_LIMIT_PATHS",
    "is_public_body_limit_path",
]
