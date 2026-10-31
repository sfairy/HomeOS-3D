"""CORS 来源白名单回归：显式白名单存在时不得再放行任意私网来源。

背景：``is_origin_allowed`` 曾把"白名单为空"和"白名单非空"两个分支都落到
``is_lan_origin``，于是配置了公网域名后，同网段任意页面仍可携带凭据跨源读写。
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[4] / "homeos" / "backend"
sys.path.insert(0, str(BACKEND_ROOT))

from src.platform.security.cookies import is_lan_origin, is_origin_allowed


class OriginAllowlistTest(unittest.TestCase):
    def test_explicit_allowlist_rejects_foreign_and_lan_origins(self) -> None:
        allowed = ["https://app.example.com"]
        self.assertTrue(is_origin_allowed("https://app.example.com", allowed))
        self.assertFalse(is_origin_allowed("https://evil.example.com", allowed))
        # 私网 / 链路本地 / .local 是历史上的"局域网兜底"，显式白名单下必须关闭。
        for origin in (
            "http://192.168.1.50:8801",
            "http://10.0.0.9:8801",
            "http://172.20.1.9:8801",
            "http://169.254.169.254",
            "http://evil.local:8801",
            "http://localhost:5173",
        ):
            with self.subTest(origin=origin):
                self.assertFalse(is_origin_allowed(origin, allowed))

    def test_empty_allowlist_keeps_lan_fallback(self) -> None:
        for origin in (
            "http://192.168.1.50:8801",
            "http://10.0.0.9:8801",
            "http://172.20.1.9:8801",
            "http://localhost:5173",
        ):
            with self.subTest(origin=origin):
                self.assertTrue(is_origin_allowed(origin, []))

    def test_lan_detector_still_used_for_empty_allowlist(self) -> None:
        self.assertTrue(is_lan_origin("http://192.168.1.2:8801"))
        self.assertFalse(is_lan_origin("https://app.example.com"))


if __name__ == "__main__":
    unittest.main()
