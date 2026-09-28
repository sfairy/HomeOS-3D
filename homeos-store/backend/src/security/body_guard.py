"""请求体的字节上限（ASGI 中间件）。
"""
from __future__ import annotations

from fastapi import status
from fastapi.responses import JSONResponse

#: 大多数写路由的请求体上限。
MAX_DEFAULT_BODY_BYTES = 1024 * 1024

#: multipart 请求按 ``Content-Length`` 提前拒绝的阈值（见模块说明）。
MAX_MULTIPART_DECLARED_BYTES = 16 * 1024 * 1024

#: 不带请求体的方法：整体跳过。
_BODYLESS_METHODS = frozenset({"GET", "HEAD", "OPTIONS"})


def _declared_length(scope) -> int | None:
    """``Content-Length`` 声明的字节数；缺失或不是非负整数时返回 ``None``。"""
    for name, value in scope.get("headers") or ():
        if name != b"content-length":
            continue
        try:
            parsed = int(value)
        except ValueError:
            return None
        return parsed if parsed >= 0 else None
    return None


def _content_type(scope) -> str:
    """本次请求的 ``Content-Type``（小写、去参数）；缺失时返回空串。"""
    for name, value in scope.get("headers") or ():
        if name == b"content-type":
            return value.decode("latin-1").split(";")[0].strip().lower()
    return ""


async def _read_capped_body(receive, limit: int) -> tuple[bytes, bool]:
    """逐块读请求体，累计超过 ``limit`` 就停下。
    """
    chunks: list[bytes] = []
    total = 0
    while True:
        message = await receive()
        if message.get("type") != "http.request":
            # http.disconnect：客户端已经走了，没必要再往路由里送。
            return b"", False
        body = message.get("body") or b""
        total += len(body)
        if total > limit:
            while message.get("more_body"):
                message = await receive()
                if message.get("type") != "http.request":
                    break
            return b"", True
        chunks.append(body)
        if not message.get("more_body"):
            return b"".join(chunks), False


def _human_size(size: int) -> str:
    """人类可读的字节数（只用来拼错误文案，取值都是 2 的幂的整数倍）。"""
    if size and size % (1024 * 1024) == 0:
        return f"{size // (1024 * 1024)} MiB"
    return f"{max(1, size // 1024)} KiB"


async def _send_too_large(send, limit: int) -> None:
    """直接回一个 JSON 413（走真正的 Response，保证头部与 JSON 体一致）。"""
    response = JSONResponse(
        {"detail": f"请求体超过 {_human_size(limit)}，无法处理。"},
        status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
        headers={"Cache-Control": "no-store"},
    )
    await response({"type": "http"}, None, send)  # type: ignore[reportArgumentType]  # ASGI Response 发送预构建响应时不读 receive，传 None 是运行期约定


class RequestBodyGuard:
    """给全部非流式请求加请求体字节上限（默认 1 MiB，multipart 见模块说明）。
    """

    def __init__(self, app) -> None:
        self.app = app

    async def __call__(self, scope, receive, send) -> None:
        if scope.get("type") != "http" or scope.get("method", "").upper() in _BODYLESS_METHODS:
            await self.app(scope, receive, send)
            return
        if _content_type(scope) == "multipart/form-data":
            # 上传路由自己管流（spool 到磁盘 + 成品上限），这一层只做声明长度的快速拒绝。
            declared = _declared_length(scope)
            if declared is not None and declared > MAX_MULTIPART_DECLARED_BYTES:
                await _send_too_large(send, MAX_MULTIPART_DECLARED_BYTES)
                return
            await self.app(scope, receive, send)
            return

        limit = MAX_DEFAULT_BODY_BYTES
        declared = _declared_length(scope)
        if declared is not None and declared > limit:
            await _send_too_large(send, limit)
            return
        (body, too_large) = await _read_capped_body(receive, limit)
        if too_large:
            await _send_too_large(send, limit)
            return

        async def replay() -> dict:
            """把已读到的请求体交给下游（可被反复调用，返回同一份内容）。"""
            return {"type": "http.request", "body": body, "more_body": False}

        await self.app(scope, replay, send)
