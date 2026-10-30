"""请求体大小门禁（对齐 Nest ``main.ts`` 的 body-parser limit）。

Nest 全局 JSON/urlencoded 解析器限 50MB；对一组「未鉴权即解析」的端点单独挂 1MB
小解析器（``PUBLIC_BODY_LIMIT_PATHS``），避免未认证请求在限流拒绝前用巨型 JSON body
耗尽解析 CPU / 内存。FastAPI 默认不限制请求体大小，故在此补齐。

行为：
- 有 ``Content-Length`` 且超过限额 → 立即返回 413（不读取 body）；
- 分块 / 无长度：包装 ``receive`` 累计字节，超限时先有界排空剩余体，再直接写出
  413 信封并中止下游读取。注意不能在这里抛业务异常：本中间件位于 FastAPI 异常处理器
  之外，异常会冒到服务器层；也不能带着未读请求体关连接，否则 RST 会把 413 丢掉。
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Callable, Iterable
from contextlib import suppress
from typing import Any

from starlette.requests import Request
from starlette.responses import JSONResponse

from ..core.errors import ErrorCode, api_error

logger = logging.getLogger("homeos.platform.security.body_limit")

#: ``main.ts`` 中挂 1MB 解析器的公共端点前缀（精确匹配或 ``prefix/`` 子路径）。
PUBLIC_BODY_LIMIT_PATHS: tuple[str, ...] = (
    "/api/v1/auth/login",
    "/api/v1/auth/register",
    "/api/v1/auth/verification",
    "/api/v1/setup/status",
    "/api/v1/system/config/public",
    "/api/v1/ha/status",
    "/api/v1/entities",
    "/api/v1/mcp",
    # 企微回调（@Public，无 JWT）在验签前就读取整段 body：未鉴权端点必须套 1MB 公共上限，
    # 否则验签前可被要求解析到已鉴权上限（50MB）。字节上限只挡体量，重放保护另见回调逻辑。
    "/api/v1/channels/wecom/callback",
)

PAYLOAD_TOO_LARGE_STATUS = 413

#: 分块请求体超限后，响应 413 之前最多再「吞掉」多少字节。
#: 服务器在请求体未读完时关闭 socket 会向客户端发 RST，已写出的 413 可能因此丢失；
#: 先有界排空剩余体，正常客户端（含本机 curl/浏览器）就能干净地收到 413。
OVERLIMIT_DRAIN_MAX_BYTES = 1024 * 1024

#: 排空剩余体的总时间预算：恶意客户端不能靠持续发送把中间件拖住。
OVERLIMIT_DRAIN_TIMEOUT_SECONDS = 1.0

PayloadBuilder = Callable[..., dict[str, Any]]


class _BodyLimitExceeded(Exception):
    """内部哨兵：分块请求体超限。

    413 信封已经在 guarded_receive 里直接发出，异常只用于中止下游读取；
    BodyLimitMiddleware 自己会吞掉它，绝不能让它冒到服务器层 —— 那会变成
    「未处理异常 → 连接被 RST」，客户端反而收不到 413。
    """


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
        path_overrides: Iterable[tuple[str, int]] = (),
    ) -> None:
        self.app = app
        self.public_max_bytes = max(1, int(public_max_bytes))
        self.authenticated_max_bytes = max(1, int(authenticated_max_bytes))
        self.build_payload = build_payload
        #: 端点级覆盖：前缀 → 上限。按前缀**从长到短**排序后再匹配，否则 ``/api/v1/studio3d``
        #: 会把更具体的 ``/api/v1/studio3d/exports`` 一起吃掉，导出包就只能按草稿的上限算。
        self.path_overrides = tuple(
            sorted(
                ((str(prefix), max(1, int(limit))) for prefix, limit in path_overrides),
                key=lambda item: len(item[0]),
                reverse=True,
            )
        )

    def _limit_for(self, path: str) -> int:
        # 未鉴权即可解析的公共端点始终用最小限额：即便有人给它们配了覆盖，也不该放大——
        # 这里的意义正是「拒绝得越早越省」，不是让调用方自定义。
        if is_public_body_limit_path(path):
            return self.public_max_bytes
        for prefix, limit in self.path_overrides:
            if path == prefix or path.startswith(f"{prefix}/"):
                return limit
        return self.authenticated_max_bytes

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

    async def _drain_overlimit_body(self, receive: Any) -> None:
        """有界排空超限后剩余的请求体，避免 413 因 RST 丢失。

        字节上限 OVERLIMIT_DRAIN_MAX_BYTES、时间上限 OVERLIMIT_DRAIN_TIMEOUT_SECONDS：
        正常客户端能在额度内读完；恶意客户端最多只能多消耗这点带宽与时间，不会变成
        无上限读取。
        """
        loop = asyncio.get_running_loop()
        deadline = loop.time() + OVERLIMIT_DRAIN_TIMEOUT_SECONDS
        drained = 0
        while drained < OVERLIMIT_DRAIN_MAX_BYTES:
            remaining = deadline - loop.time()
            if remaining <= 0:
                return
            try:
                message = await asyncio.wait_for(receive(), timeout=min(remaining, 0.5))
            except (TimeoutError, RuntimeError) as exc:
                logger.debug("排空超限请求体时提前结束: %s", exc)
                return
            if message.get("type") != "http.request":
                return
            drained += len(message.get("body", b"") or b"")
            if not message.get("more_body", False):
                return

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
        response_started = False
        rejected = False

        async def guarded_send(message: dict[str, Any]) -> None:
            nonlocal response_started
            if rejected:
                # 413 已完整写出。下游（例如 FastAPI 把请求体读取异常转成的 400）
                # 可能还会尝试写响应：直接吞掉，避免服务器报「响应已完成后又发
                # http.response.start」并在日志里留下未处理异常。
                return
            if message.get("type") == "http.response.start":
                response_started = True
            await send(message)

        async def guarded_receive() -> Any:
            nonlocal received, rejected
            message = await receive()
            if message.get("type") == "http.request":
                received += len(message.get("body", b"") or b"")
                if received > limit:
                    # 本中间件在 FastAPI 异常处理器之外：若在这里抛业务异常，它会冒到
                    # 服务器层变成未处理异常，连接被 RST，客户端拿到的是断连而不是 413。
                    # 因此：先有界排空剩余体（否则服务器带未读数据关连接会发 RST，把
                    # 413 一起丢掉），再直接写信封，然后置 rejected 吞掉下游后续响应帧；
                    # 哨兵异常由本中间件吞掉，不落到服务器层。
                    await self._drain_overlimit_body(receive)
                    if not response_started:
                        await self._reject(scope, receive, guarded_send)
                    rejected = True
                    raise _BodyLimitExceeded
            return message

        # 413 已由 guarded_receive 发出；这里只负责让请求干净结束，
        # 不让哨兵异常继续冒泡成「未处理异常」。
        with suppress(_BodyLimitExceeded):
            await self.app(scope, guarded_receive, guarded_send)


__all__ = [
    "PAYLOAD_TOO_LARGE_STATUS",
    "PUBLIC_BODY_LIMIT_PATHS",
    "BodyLimitMiddleware",
    "is_public_body_limit_path",
]
