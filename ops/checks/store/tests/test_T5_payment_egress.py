"""T5 回归：代理环境变量异常时支付出口与自检探测不得抛未捕获异常。

缺陷背景：本机/部分部署环境把 NO_PROXY 写成 "192.168.31.53,.local,localhost,127.0.0.1,::1,[::1]"。
httpx 解析 "[::1]" 时在 Client 构造阶段就抛 InvalidURL（不是 httpx.HTTPError，也不是
ValueError），于是：
1. payments.http_pool.shared_client() 抛 InvalidURL → 每次支付调用都变 500；
2. ops.net_probe.probe_http() 抛 InvalidURL → 后台「回调地址自检」变 500。
修复后两者都在构造失败时降级 trust_env=False 重试（代理正常时行为不变）。
"""

from __future__ import annotations

import http.server
import os
import sys
import threading
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[4]
BACKEND_ROOT = REPO_ROOT / "homeos-store" / "backend"
SHARED_ROOT = REPO_ROOT / "packages" / "shared-py"

sys.path.insert(0, str(BACKEND_ROOT))
sys.path.insert(0, str(SHARED_ROOT))

import httpx
from src.ops import net_probe
from src.payments.common import http_pool

BAD_NO_PROXY = "192.168.31.53,.local,localhost,127.0.0.1,::1,[::1]"


class _Handler(http.server.BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        self.send_response(204)
        self.end_headers()

    def log_message(self, *args: object) -> None:
        return


class MalformedNoProxyTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.server = http.server.HTTPServer(("127.0.0.1", 0), _Handler)
        cls.port = cls.server.server_address[1]
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls) -> None:
        cls.server.shutdown()
        cls.server.server_close()

    def setUp(self) -> None:
        self._saved_env = {
            name: os.environ.get(name)
            for name in ("NO_PROXY", "no_proxy", "STORE_NET_PROBE_ALLOW_PRIVATE")
        }
        os.environ["NO_PROXY"] = BAD_NO_PROXY
        os.environ["no_proxy"] = BAD_NO_PROXY
        # 探针默认拒绝 loopback；本测试要验证的是坏代理下的降级直连，显式打开 mock 逃生门。
        os.environ["STORE_NET_PROBE_ALLOW_PRIVATE"] = "1"
        self._saved_client = http_pool._client
        http_pool._client = None

    def tearDown(self) -> None:
        closed = http_pool._client
        if closed is not None and closed is not self._saved_client:
            closed.close()
        http_pool._client = self._saved_client
        for name, value in self._saved_env.items():
            if value is None:
                os.environ.pop(name, None)
            else:
                os.environ[name] = value

    def test_premise_plain_client_rejects_malformed_no_proxy(self) -> None:
        """先钉住前提：坏 NO_PROXY 确实会让 trust_env=True 的客户端构造失败。"""
        with self.assertRaises(httpx.InvalidURL):
            httpx.Client()

    def test_shared_client_falls_back_to_direct_connection(self) -> None:
        client = http_pool.shared_client()
        self.assertIsInstance(client, httpx.Client)
        response = http_pool.request("GET", f"http://127.0.0.1:{self.port}/")
        self.assertEqual(response.status_code, 204)

    def test_probe_http_falls_back_to_direct_connection(self) -> None:
        reachable, detail = net_probe.probe_http(f"http://127.0.0.1:{self.port}/")
        self.assertTrue(reachable, detail)
        self.assertIn("HTTP 204", detail)

    def test_probe_http_blocks_loopback_without_explicit_opt_in(self) -> None:
        os.environ.pop("STORE_NET_PROBE_ALLOW_PRIVATE", None)
        reachable, detail = net_probe.probe_http(f"http://127.0.0.1:{self.port}/")
        self.assertFalse(reachable)
        self.assertIn("内网", detail)


if __name__ == "__main__":
    unittest.main()
