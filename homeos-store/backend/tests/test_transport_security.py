"""商店传输配置回归：Secure Cookie 与显式 http base URL 不得自相矛盾。"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from src.config import transport_security_error


class TransportSecurityTest(unittest.TestCase):
    def test_secure_cookie_with_http_base_url_is_rejected(self) -> None:
        message = transport_security_error("http://store.example.com", "true")
        self.assertIsNotNone(message)
        self.assertIn("STORE_COOKIE_SECURE=true", message or "")

    def test_secure_cookie_with_https_base_url_is_allowed(self) -> None:
        self.assertIsNone(transport_security_error("https://store.example.com", "true"))

    def test_auto_mode_with_http_base_url_is_allowed(self) -> None:
        self.assertIsNone(transport_security_error("http://192.168.1.10:8802", "auto"))

    def test_unset_base_url_is_not_judged(self) -> None:
        self.assertIsNone(transport_security_error("", "true"))


if __name__ == "__main__":
    unittest.main()
