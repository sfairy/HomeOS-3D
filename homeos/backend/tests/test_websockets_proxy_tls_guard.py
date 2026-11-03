"""``websockets`` 走代理 + TLS 握手失败时的 ``connection_lost`` 兜底。

背景：走 HTTP 代理时 websockets 先 ``transport.set_protocol(connection)`` 再
``loop.start_tls(...)``，``connection_made()`` 是握手成功之后才手动调用的；uvloop 在
握手失败 / 超时取消时却会直接回调 ``connection_lost()``，那里的 ``self.recv_messages``
尚未创建 —— 结果是每个失败的 wss 请求都在日志里留一坨 ``AttributeError`` traceback
（真实错误已正确抛给调用方，所以只是噪音，但会淹没真正的告警）。

这套测试钉住两件事：
- 兜底之后，未建立就 ``connection_lost`` 的连接能正常收尾（不抛、waiter 收敛）；
- 真实链路（uvloop + 假 HTTP 代理 + TLS 握手失败）在兜底后不再往 stderr 写 traceback，
  且调用方拿到的仍是 ``ConnectionResetError``。

运行：node ops/lib/py.mjs -m unittest discover -s homeos/backend/tests -t homeos/backend -v
"""

from __future__ import annotations

import subprocess
import sys
import textwrap
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from src.platform.core.http import websockets_compat


def _uninstall_guard() -> None:
    """把打过补丁的方法还原成上游实现，让每个用例都从「未安装」开始。"""
    from websockets.asyncio import connection as ws_connection

    current = ws_connection.Connection.connection_lost
    original = getattr(current, "__wrapped__", None)
    if original is not None:
        ws_connection.Connection.connection_lost = original


def _guard_installed() -> bool:
    from websockets.asyncio import connection as ws_connection

    return bool(getattr(ws_connection.Connection.connection_lost, "_homeos_connection_lost_guard", False))


class ConnectionLostGuardTest(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        _uninstall_guard()
        self.addCleanup(_uninstall_guard)

    async def test_never_connected_connection_lost_is_tolerated(self) -> None:
        from websockets.asyncio.client import ClientConnection, ClientProtocol
        from websockets.protocol import State
        from websockets.uri import parse_uri

        self.assertTrue(websockets_compat.install_connection_lost_guard())
        # 复刻代理路径：协议准备好，但 connection_made 从未被调用
        protocol = ClientProtocol(parse_uri("wss://example.com/"), state=State.CONNECTING)
        connection = ClientConnection(protocol)

        connection.connection_lost(None)

        self.assertIs(protocol.state, State.CLOSED)
        self.assertTrue(connection.connection_lost_waiter.done())
        # 兜底塞进去的空队列必须已收口：后续取帧立刻结束，而不是挂死等一帧永远不来的数据
        with self.assertRaises(EOFError):
            await connection.recv_messages.get(False)

    def test_install_is_idempotent(self) -> None:
        self.assertTrue(websockets_compat.install_connection_lost_guard())
        self.assertFalse(websockets_compat.install_connection_lost_guard())
        from websockets.asyncio import connection as ws_connection

        current = ws_connection.Connection.connection_lost
        # 只包一层：重复安装不该叠成洋葱
        self.assertFalse(getattr(getattr(current, "__wrapped__", None), "_homeos_connection_lost_guard", False))

    async def test_edge_tts_synthesis_installs_guard(self) -> None:
        """edge-tts 是这条代理链路的实际使用者，合成入口必须带上兜底。"""
        from src.domains.agent.speech.edge_tts import EdgeTtsProvider

        self.assertFalse(_guard_installed())
        provider = EdgeTtsProvider(env={})
        with patch.object(EdgeTtsProvider, "_hedged", new=AsyncMock(return_value=b"ID3fake")):
            audio = await provider.synthesize("你好", voice="zh-CN-XiaoxiaoNeural")
        self.assertEqual(audio, b"ID3fake")
        self.assertTrue(_guard_installed())


_PROXY_REPRO = textwrap.dedent(
    """
    import asyncio
    import sys

    import uvloop
    from websockets.asyncio.client import connect

    sys.path.insert(0, {backend!r})
    from src.platform.core.http.websockets_compat import install_connection_lost_guard

    install_connection_lost_guard()
    install_connection_lost_guard()  # 幂等


    async def fake_proxy():
        \"\"\"最小 HTTP 代理：回应 CONNECT 后立刻断开，让 TLS 握手必然失败。\"\"\"

        async def handler(reader, writer):
            while True:
                line = await reader.readline()
                if not line or line in (b'\\r\\n', b'\\n'):
                    break
            writer.write(b'HTTP/1.1 200 Connection established\\r\\n\\r\\n')
            await writer.drain()
            writer.close()

        server = await asyncio.start_server(handler, '127.0.0.1', 0)
        return server, server.sockets[0].getsockname()[1]


    async def main():
        server, port = await fake_proxy()
        try:
            async with connect('wss://example.com/', proxy=f'http://127.0.0.1:{{port}}', open_timeout=3):
                pass
        except ConnectionResetError as exc:
            print('RESULT', type(exc).__name__)
        finally:
            server.close()
            await server.wait_closed()


    uvloop.run(main())
    """
)


class ProxyTlsHandshakeRegressionTest(unittest.TestCase):
    """真实链路回归：uvloop + HTTP 代理 + TLS 握手失败。"""

    def test_no_traceback_on_proxy_tls_failure(self) -> None:
        try:
            import uvloop  # noqa: F401
        except ImportError:  # pragma: no cover - dev 环境必装
            self.skipTest("uvloop 未安装：该缺陷只在 uvloop 的 TLS 实现下出现")

        proc = subprocess.run(
            [sys.executable, "-c", _PROXY_REPRO.format(backend=str(BACKEND_ROOT))],
            check=False,  # 退出码不看：验的是 stderr 有没有 traceback
            capture_output=True,
            text=True,
            timeout=60,
        )
        self.assertIn("RESULT ConnectionResetError", proc.stdout)
        self.assertNotIn("AttributeError", proc.stderr)
        self.assertNotIn("recv_messages", proc.stderr)


if __name__ == "__main__":
    unittest.main()
