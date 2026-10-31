"""平台安全叶子的最小回归：CORS 来源判定。

放在产品目录而不是 ops/checks，是为了让"产品测试"从零到一有一个可运行的入口：
以后新增的安全叶子可以就近补 case，而不用先理解门禁编排。
运行：node ops/lib/py.mjs -m unittest discover -s homeos/backend/tests -t homeos/backend -v
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from src.platform.security.cookies import is_lan_origin, is_origin_allowed


class OriginAllowListTest(unittest.TestCase):
    def test_explicit_allow_list_rejects_private_network(self) -> None:
        allowed = ["https://app.example.com"]
        self.assertTrue(is_origin_allowed("https://app.example.com", allowed))
        self.assertFalse(is_origin_allowed("https://evil.com", allowed))
        for origin in (
            "http://192.168.1.50:8801",
            "http://10.0.0.9:8801",
            "http://172.20.1.9:8801",
            "http://evil.local:8801",
            "http://169.254.169.254",
        ):
            self.assertFalse(is_origin_allowed(origin, allowed), origin)

    def test_empty_allow_list_keeps_lan_fallback(self) -> None:
        self.assertTrue(is_origin_allowed("http://192.168.1.50:8801", []))
        self.assertFalse(is_origin_allowed("https://evil.com", []))

    def test_lan_origin_predicate(self) -> None:
        self.assertTrue(is_lan_origin("http://localhost:5173"))
        self.assertTrue(is_lan_origin("http://172.20.1.9:8801"))
        self.assertFalse(is_lan_origin("https://evil.com"))
        self.assertFalse(is_lan_origin(""))
