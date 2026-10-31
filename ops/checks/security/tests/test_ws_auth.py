"""WS 鉴权守卫的单元回归：AST 扫描要能识别直连与一层转发。"""

from __future__ import annotations

import sys
import tempfile
import textwrap
import unittest
from pathlib import Path

SECURITY_CHECKS = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SECURITY_CHECKS))

from check_ws_auth import scan


class WsAuthScanTest(unittest.TestCase):
    def _scan(self, source: str):
        with tempfile.TemporaryDirectory() as tmp:
            (Path(tmp) / "routes.py").write_text(textwrap.dedent(source), encoding="utf-8")
            return scan(Path(tmp))

    def test_unauthenticated_handler_has_no_symbols(self) -> None:
        routes = self._scan(
            """
            @router.websocket("/open")
            async def open_socket(websocket):
                await websocket.accept()
            """
        )
        self.assertEqual(len(routes), 1)
        self.assertEqual(routes[0].path, "/open")
        self.assertEqual(routes[0].auth_symbols, ())

    def test_direct_and_transitive_auth_are_detected(self) -> None:
        routes = self._scan(
            """
            async def _guard(websocket):
                return _runtime_authorize(websocket)

            @router.websocket("/direct")
            async def direct(websocket):
                if not verify_embed_ws_auth(None, None):
                    return
                await websocket.accept()

            @router.websocket("/nested")
            async def nested(websocket):
                await _guard(websocket)
                await websocket.accept()
            """
        )
        by_path = {route.path: route.auth_symbols for route in routes}
        self.assertEqual(by_path["/direct"], ("verify_embed_ws_auth",))
        self.assertEqual(by_path["/nested"], ("_runtime_authorize",))


if __name__ == "__main__":
    unittest.main()
