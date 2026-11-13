"""Socket.IO 传输层 500 兜底的回归测试。

背景（复现方法与原实现一致）：``python-engineio`` 4.15.1 的 ``AsyncServer.handle_request``
中，GET 分支对 ``_get_socket(sid)`` 做了 ``try/except KeyError``，**POST 分支没有**。会话被
关闭后（断线 / 心跳超时 / 客户端 abort），客户端最后一发 polling POST 会以
``KeyError('Session is disconnected')`` 冒到 uvicorn → 500；socket.io-client 记成
``connect_error: xhr post error``，随后拿同一个死 sid 做 upgrade，控制台再补一句
``WebSocket is closed``。

本文件锁两个不变量：
1. 「会话已失效」的 KeyError 只降级成 400，且只在 ``/socket.io`` 范围内；
2. 其它 KeyError / 已开始发送的响应仍然冒泡 —— 真正的 bug 不能被兜底吞掉，否则下次
   排障连 traceback 都看不到。
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path
from typing import Any

BACKEND_ROOT = Path(__file__).resolve().parents[4] / "homeos" / "backend"
# 本用例要直接实例化真实 engineio（复现线上那条 500），因此必须能 import src.*：
# 与其它门禁测试同一惯例，把 backend 根目录放进 path，且重复执行不叠加。
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from src.platform.core.http.socketio_transport import (
    SocketIOTransportGuard,
    is_socketio_path,
    is_stale_session_error,
)


def _http_scope(path: str, *, method: str = "POST", sid: str = "abc123") -> dict[str, Any]:
    return {
        "type": "http",
        "http_version": "1.1",
        "method": method,
        "scheme": "https",
        "path": path,
        "query_string": f"EIO=4&transport=polling&sid={sid}".encode(),
        "headers": [(b"host", b"homeos.local:8803")],
    }


class _RaisingApp:
    """按需抛异常，并可选择在抛之前先发一个响应头。"""

    def __init__(self, error: BaseException, *, start_first: bool = False) -> None:
        self.error = error
        self.start_first = start_first

    async def __call__(self, scope: Any, receive: Any, send: Any) -> None:
        if self.start_first:
            await send({"type": "http.response.start", "status": 200, "headers": []})
        raise self.error


class _Recorder:
    """ASGI send 的最小记录器。"""

    def __init__(self) -> None:
        self.messages: list[dict[str, Any]] = []

    async def __call__(self, message: dict[str, Any]) -> None:
        self.messages.append(message)

    @property
    def status(self) -> int | None:
        for message in self.messages:
            if message["type"] == "http.response.start":
                return int(message["status"])
        return None

    @property
    def body(self) -> bytes:
        return b"".join(message.get("body") or b"" for message in self.messages)


async def _no_messages() -> dict[str, Any]:
    return {"type": "http.request", "body": b"3", "more_body": False}


class StaleSessionDetectionTest(unittest.TestCase):
    def test_engineio_session_messages_are_recognized(self) -> None:
        for message in ("Session not found", "Session is disconnected"):
            with self.subTest(message=message):
                self.assertTrue(is_stale_session_error(KeyError(message)))

    def test_unrelated_errors_are_not_recognized(self) -> None:
        # 其它 KeyError 是真正的 bug；非 KeyError 的异常更不该被这层接手。
        for error in (
            KeyError("user:42"),
            KeyError(),
            KeyError("Session is disconnected", "extra"),
            ValueError("Session is disconnected"),
            RuntimeError("boom"),
        ):
            with self.subTest(error=error):
                self.assertFalse(is_stale_session_error(error))

    def test_path_detection_only_matches_socketio_mount(self) -> None:
        for path in ("/socket.io", "/socket.io/", "/socket.io/engine.io"):
            with self.subTest(path=path):
                self.assertTrue(is_socketio_path(path))
        for path in ("/socket.iofoo", "/api/v1/socket.io", "/", ""):
            with self.subTest(path=path):
                self.assertFalse(is_socketio_path(path))


class GuardTest(unittest.IsolatedAsyncioTestCase):
    async def test_stale_session_post_becomes_400(self) -> None:
        guard = SocketIOTransportGuard(_RaisingApp(KeyError("Session is disconnected")))
        recorder = _Recorder()
        await guard(_http_scope("/socket.io/"), _no_messages, recorder)

        self.assertEqual(recorder.status, 400)
        self.assertEqual(recorder.body, b"Invalid session")

    async def test_stale_session_get_is_also_guarded(self) -> None:
        # GET 分支本身就捕获了 KeyError，但一旦上游版本行为变化，这层仍要兜住。
        guard = SocketIOTransportGuard(_RaisingApp(KeyError("Session not found")))
        recorder = _Recorder()
        await guard(_http_scope("/socket.io/", method="GET"), _no_messages, recorder)

        self.assertEqual(recorder.status, 400)

    async def test_business_paths_are_untouched(self) -> None:
        guard = SocketIOTransportGuard(_RaisingApp(KeyError("Session is disconnected")))
        with self.assertRaises(KeyError):
            await guard(_http_scope("/api/v1/entities"), _no_messages, _Recorder())

    async def test_unrelated_key_error_still_raises(self) -> None:
        guard = SocketIOTransportGuard(_RaisingApp(KeyError("user:42")))
        with self.assertRaises(KeyError):
            await guard(_http_scope("/socket.io/"), _no_messages, _Recorder())

    async def test_does_not_write_a_second_response_start(self) -> None:
        guard = SocketIOTransportGuard(_RaisingApp(KeyError("Session is disconnected"), start_first=True))
        with self.assertRaises(KeyError):
            await guard(_http_scope("/socket.io/"), _no_messages, _Recorder())

    async def test_normal_response_passes_through(self) -> None:
        class _OkApp:
            async def __call__(self, scope: Any, receive: Any, send: Any) -> None:
                await send({"type": "http.response.start", "status": 200, "headers": []})
                await send({"type": "http.response.body", "body": b"OK"})

        recorder = _Recorder()
        await SocketIOTransportGuard(_OkApp())(_http_scope("/socket.io/"), _no_messages, recorder)
        self.assertEqual(recorder.status, 200)
        self.assertEqual(recorder.body, b"OK")


class RealEngineIOReplicationTest(unittest.IsolatedAsyncioTestCase):
    """用真实的 socketio.ASGIApp 复现线上那条 500，并确认兜底后不再是 5xx。

    不绑死具体状态码：未来 engineio 自己补上 try/except 时（POST 直接回 200/400），
    这个用例仍应通过 —— 它守的不变量是「不得以未处理异常变成 5xx」。
    """

    @staticmethod
    def _build_app(guarded: bool) -> tuple[Any, Any]:
        import socketio

        sio = socketio.AsyncServer(
            async_mode="asgi",
            serializer="msgpack",
            cors_allowed_origins=lambda origin, environ=None: True,
            cors_credentials=True,
        )

        @sio.on("connect")
        async def _on_connect(sid: str, environ: dict[str, Any], auth: Any) -> None:
            return None

        asgi_app = socketio.ASGIApp(sio, socketio_path="socket.io")
        return (SocketIOTransportGuard(asgi_app) if guarded else asgi_app), sio

    async def _stale_post(self, app: Any, sio: Any) -> int | None:
        """握手 → 把会话置为 closed 但仍留在 sockets 中 → 同一 sid 再 POST。"""
        recorder = _Recorder()
        await app(_http_scope("/socket.io/", method="GET", sid=""), _no_messages, recorder)
        self.assertEqual(recorder.status, 200)
        sid = next(iter(sio.eio.sockets))

        # 线上 500 的触发条件：已关闭、却仍在 sockets 里（service_task / abort 的窗口）
        await sio.eio.sockets[sid].close(wait=False, abort=True)
        sio.eio.sockets[sid].closed = True

        recorder = _Recorder()
        await app(_http_scope("/socket.io/", method="POST", sid=sid), _no_messages, recorder)
        return recorder.status

    async def test_uncovered_engineio_really_raises(self) -> None:
        # 负向对照：不套兜底时，同一序列确实以未处理 KeyError 冒泡（uvicorn 500）。
        # 没有这条，「兜底生效」的断言可能只是碰巧通过。
        try:
            app, sio = self._build_app(guarded=False)
        except ImportError:  # pragma: no cover - 依赖缺失时跳过，不伪装通过
            self.skipTest("未安装 python-socketio")
        with self.assertRaises(KeyError):
            await self._stale_post(app, sio)

    async def test_closed_session_post_does_not_produce_5xx(self) -> None:
        try:
            app, sio = self._build_app(guarded=True)
        except ImportError:  # pragma: no cover - 依赖缺失时跳过，不伪装通过
            self.skipTest("未安装 python-socketio")

        # 不绑死具体状态码：未来 engineio 自己补上 try/except 时（POST 直接回 200/400），
        # 这个用例仍应通过 —— 它守的不变量是「不得以未处理异常变成 5xx」。
        status = await self._stale_post(app, sio)
        self.assertIsNotNone(status)
        self.assertLess(status, 500)


if __name__ == "__main__":
    unittest.main()
