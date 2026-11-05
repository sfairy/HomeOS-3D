"""断连（ClientDisconnect）回归：必须归 499，不能变成 500。

线上实测：3D 舞台刷新 / 进 bfcache 时，正在上传的渲染缓存瓦片会在
``request.stream()`` 途中触发 ``ClientDisconnect``，旧实现把它当未处理异常，
一条断连同时写「未处理异常」ERROR 与 uvicorn「Exception in ASGI application」，
Prometheus 5xx 也跟着涨。

运行：node ops/lib/py.mjs -m unittest discover -s homeos/backend/tests -t homeos/backend -v
"""

from __future__ import annotations

import asyncio
import json
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from fastapi import FastAPI
from src.bootstrap.exception_handlers import (
    CLIENT_CLOSED_REQUEST_STATUS,
    client_disconnect_json,
    register_exception_handlers,
)
from starlette.requests import ClientDisconnect, Request
from starlette.testclient import TestClient

_PATH = "/api/v1/modules/interaction3d/scenes/scene-1/render-cache/" + "a" * 64


def _request_scope() -> dict[str, object]:
    return {
        "type": "http",
        "http_version": "1.1",
        "method": "PUT",
        "scheme": "https",
        "path": _PATH,
        "raw_path": _PATH.encode(),
        "query_string": b"",
        "root_path": "",
        "headers": [(b"content-type", b"image/png")],
        "client": ("127.0.0.1", 50000),
        "server": ("127.0.0.1", 8801),
    }


class ClientDisconnectPayloadTest(unittest.TestCase):
    def test_payload_is_nest_shaped_499(self) -> None:
        response = client_disconnect_json(Request(_request_scope()))
        self.assertEqual(response.status_code, CLIENT_CLOSED_REQUEST_STATUS)
        payload = json.loads(response.body)
        self.assertEqual(payload["statusCode"], 499)
        self.assertEqual(payload["path"], _PATH)
        self.assertEqual(payload["message"], "客户端已断开连接。")


class ClientDisconnectHandlerTest(unittest.TestCase):
    def _app(self) -> FastAPI:
        app = FastAPI()
        register_exception_handlers(app, SimpleNamespace(is_production=True))
        return app

    def test_handler_registered_on_app_not_server_error_middleware(self) -> None:
        """必须注册到 ExceptionMiddleware（内层）：挂到 ServerErrorMiddleware 会继续 re-raise。"""
        self.assertIn(ClientDisconnect, self._app().exception_handlers)

    def test_disconnect_returns_499_instead_of_500(self) -> None:
        app = self._app()

        @app.put("/upload")
        async def upload() -> None:
            raise ClientDisconnect()

        with TestClient(app, raise_server_exceptions=False) as client:
            response = client.put("/upload")
        self.assertEqual(response.status_code, 499)

    def test_other_unhandled_exception_still_500(self) -> None:
        """收紧判定范围：只有断连降级为 499，真正的服务端异常仍是 500。"""
        app = self._app()

        @app.put("/boom")
        async def boom() -> None:
            raise RuntimeError("boom")

        # assertLogs 同时收走未处理异常的 ERROR 行，避免测试输出被堆栈刷屏。
        with self.assertLogs("homeos.app", level="ERROR"), TestClient(app, raise_server_exceptions=False) as client:
            response = client.put("/boom")
        self.assertEqual(response.status_code, 500)


class StreamBodyDisconnectTest(unittest.TestCase):
    """复现线上现场：请求体传到一半客户端关连接（``request.stream()`` 抛断连）。"""

    @staticmethod
    def _call(app: FastAPI, path: str, chunks: list[dict[str, object]]) -> list[dict[str, object]]:
        pending = list(chunks)
        sent: list[dict[str, object]] = []

        async def receive() -> dict[str, object]:
            if pending:
                return pending.pop(0)
            # 客户端已经走了：uvicorn 在断连后对每次 receive 都回 http.disconnect。
            return {"type": "http.disconnect"}

        async def send(message: dict[str, object]) -> None:
            sent.append(message)

        scope = _request_scope()
        scope["path"] = path
        scope["raw_path"] = path.encode()
        asyncio.run(app(scope, receive, send))
        return sent

    def test_partial_body_then_disconnect_is_499_without_raising(self) -> None:
        app = FastAPI()
        register_exception_handlers(app, SimpleNamespace(is_production=True))
        seen: list[int] = []

        @app.put("/upload")
        async def upload(request: Request):
            from starlette.responses import Response

            async for chunk in request.stream():
                seen.append(len(chunk))
            return Response(status_code=204)

        # 未捕获断连时 ServerErrorMiddleware 会 re-raise —— 这里能正常返回本身就是回归点。
        sent = self._call(
            app,
            "/upload",
            [
                {"type": "http.request", "body": b"\x89PNG", "more_body": True},
                {"type": "http.disconnect"},
            ],
        )
        self.assertEqual(seen, [4])
        self.assertEqual(sent[0]["type"], "http.response.start")
        self.assertEqual(sent[0]["status"], 499)
        self.assertEqual(sent[-1]["type"], "http.response.body")


if __name__ == "__main__":
    unittest.main()
