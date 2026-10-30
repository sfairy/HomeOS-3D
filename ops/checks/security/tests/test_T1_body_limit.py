"""T1 回归：分块请求体超限必须返回 413 信封，而不是断连。

背景（审计发现 T1-004）：`BodyLimitMiddleware` 在 `guarded_receive` 里累计分块请求体，
超限时抛 `BusinessException`，注释声称「由应用层异常处理器渲染为 413 信封」。
但该中间件位于 FastAPI 异常处理器（`ExceptionMiddleware` / `ServerErrorMiddleware`）之外，
异常会冒到服务器层；服务器在请求体尚未读完时关闭连接，客户端只看到 RST，
既拿不到 413 信封，也会在服务端日志里留下「未处理异常」噪声。

修复后语义：
- 分块超限：直接写出 413 信封，再用内部哨兵异常中止下游读取，哨兵由中间件吞掉；
- 有 Content-Length 且超限：仍是立即 413（不读 body）；
- 未超限：正常透传给下游应用。
"""

from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace

BACKEND_ROOT = Path(__file__).resolve().parents[4] / "homeos" / "backend"

# 后端是 `python -m src.run` 的 `src` 包；只把 backend 根目录放进 path。
sys.path.insert(0, str(BACKEND_ROOT))

from src.platform.security.body_limit import BodyLimitMiddleware


def build_payload(**kwargs: object) -> dict[str, object]:
    """复刻 app 侧 nest_error_payload 的最小形状，便于断言信封字段。"""
    return {
        "statusCode": kwargs["status"],
        "errorCode": kwargs["error_code"],
        "message": kwargs["message"],
    }


def make_scope(*, headers: list[tuple[bytes, bytes]] | None = None) -> dict[str, object]:
    request_headers = headers or []
    return {
        "type": "http",
        "http_version": "1.1",
        "method": "POST",
        "scheme": "http",
        "path": "/api/v1/auth/login",
        "raw_path": b"/api/v1/auth/login",
        "query_string": b"",
        "root_path": "",
        "headers": request_headers,
        "client": ("127.0.0.1", 42424),
        "server": ("127.0.0.1", 18910),
        "app": SimpleNamespace(state=SimpleNamespace(settings=SimpleNamespace())),
    }


async def read_body_app(scope: object, receive: object, send: object) -> None:
    """模拟路由处理：先读完整请求体，再回 200。"""
    while True:
        message = await receive()
        if not message.get("more_body", False):
            break
    await send({"type": "http.response.start", "status": 200, "headers": []})
    await send({"type": "http.response.body", "body": b"{}"})


def chunked_receive(body: bytes, chunk_size: int):
    messages = []
    position = 0
    while position < len(body):
        part = body[position : position + chunk_size]
        position += chunk_size
        messages.append(
            {
                "type": "http.request",
                "body": part,
                "more_body": position < len(body),
            }
        )
    messages.append({"type": "http.request", "body": b"", "more_body": False})
    iterator = iter(messages)

    async def receive() -> dict[str, object]:
        return next(iterator)

    return receive


class BodyLimitMiddlewareTests(unittest.IsolatedAsyncioTestCase):
    async def _run(self, middleware: BodyLimitMiddleware, scope, receive, sent):
        async def send(message):
            sent.append(message)

        await middleware(scope, receive, send)
        return sent

    async def test_chunked_overrun_returns_413_envelope(self) -> None:
        middleware = BodyLimitMiddleware(
            read_body_app,
            public_max_bytes=1024,
            authenticated_max_bytes=2048,
            build_payload=build_payload,
        )
        scope = make_scope()
        body = b"x" * 4096
        sent: list[dict[str, object]] = []
        await self._run(
            middleware, scope, chunked_receive(body, 512), sent
        )
        starts = [item for item in sent if item["type"] == "http.response.start"]
        self.assertEqual(len(starts), 1)
        self.assertEqual(starts[0]["status"], 413)
        payload = json.loads(b"".join(
            item["body"] for item in sent if item["type"] == "http.response.body"
        ).decode("utf-8"))
        self.assertEqual(payload["statusCode"], 413)
        # 不能把 200 再发一遍；也不能出现两个响应头。
        self.assertEqual(len([item for item in sent if item["type"] == "http.response.start"]), 1)

    async def test_content_length_overrun_rejected_without_reading_body(self) -> None:
        middleware = BodyLimitMiddleware(
            read_body_app,
            public_max_bytes=1024,
            authenticated_max_bytes=2048,
            build_payload=build_payload,
        )
        scope = make_scope(headers=[(b"content-length", b"4096")])
        reads: list[object] = []

        async def receive() -> dict[str, object]:
            reads.append(object())
            return {"type": "http.request", "body": b"", "more_body": False}

        sent: list[dict[str, object]] = []
        await self._run(middleware, scope, receive, sent)
        self.assertEqual(reads, [], "Content-Length 超限时必须拒绝读取 body")
        starts = [item for item in sent if item["type"] == "http.response.start"]
        self.assertEqual(starts[0]["status"], 413)

    async def test_wecom_callback_uses_public_limit(self) -> None:
        """企微回调是未鉴权端点：验签前读 body，必须走 1MB 公共上限而不是 50MB。"""
        scope = make_scope()
        scope["path"] = "/api/v1/channels/wecom/callback"
        scope["headers"] = [(b"content-length", b"4096")]
        middleware = BodyLimitMiddleware(
            read_body_app,
            public_max_bytes=1024,
            authenticated_max_bytes=2048,
            build_payload=build_payload,
        )
        sent: list[dict[str, object]] = []
        await self._run(middleware, scope, chunked_receive(b"", 0), sent)
        starts = [item for item in sent if item["type"] == "http.response.start"]
        self.assertEqual(starts[0]["status"], 413)

    async def test_downstream_response_after_413_is_swallowed(self) -> None:
        """413 之后下游再尝试写响应（FastAPI 会转成 400）必须被吞掉。

        真实链路上 FastAPI routing 把「读 body 时抛出的异常」转成 HTTPException(400)
        并试图回包；此时 413 已经写出，若不吞掉就会触发 uvicorn
        「Unexpected ASGI message 'http.response.start' ... after response already completed」。
        """
        async def app_catching_and_responding(scope, receive, send) -> None:
            try:
                while True:
                    message = await receive()
                    if not message.get("more_body", False):
                        break
            except Exception:
                await send({"type": "http.response.start", "status": 400, "headers": []})
                await send({"type": "http.response.body", "body": b"bad request"})

        middleware = BodyLimitMiddleware(
            app_catching_and_responding,
            public_max_bytes=1024,
            authenticated_max_bytes=2048,
            build_payload=build_payload,
        )
        scope = make_scope()
        sent: list[dict[str, object]] = []
        await self._run(middleware, scope, chunked_receive(b"x" * 4096, 512), sent)
        starts = [item for item in sent if item["type"] == "http.response.start"]
        self.assertEqual(len(starts), 1)
        self.assertEqual(starts[0]["status"], 413)
        bodies = [item for item in sent if item["type"] == "http.response.body"]
        self.assertEqual(len(bodies), 1, "下游 400 的响应帧不应被转发")
        self.assertNotEqual(bodies[0]["body"], b"bad request")

    async def test_overlimit_drain_is_bounded(self) -> None:
        """超限排空必须有界：恶意客户端不能靠持续发送把中间件拖住。"""
        middleware = BodyLimitMiddleware(
            read_body_app,
            public_max_bytes=1024,
            authenticated_max_bytes=2048,
            build_payload=build_payload,
        )
        scope = make_scope()
        reads = 0

        async def receive() -> dict[str, object]:
            nonlocal reads
            reads += 1
            return {"type": "http.request", "body": b"z" * 65536, "more_body": True}

        sent: list[dict[str, object]] = []
        await self._run(middleware, scope, receive, sent)
        starts = [item for item in sent if item["type"] == "http.response.start"]
        self.assertEqual(starts[0]["status"], 413)
        # 1 次触发超限 + 1MiB / 64KiB = 16 次排空；允许少量余量。
        self.assertLessEqual(reads, 1 + 16 + 2)

    async def test_chunked_under_limit_reaches_downstream(self) -> None:
        middleware = BodyLimitMiddleware(
            read_body_app,
            public_max_bytes=4096,
            authenticated_max_bytes=4096,
            build_payload=build_payload,
        )
        scope = make_scope()
        sent: list[dict[str, object]] = []
        await self._run(middleware, scope, chunked_receive(b"y" * 1024, 256), sent)
        starts = [item for item in sent if item["type"] == "http.response.start"]
        self.assertEqual(starts[0]["status"], 200)


if __name__ == "__main__":
    unittest.main()
