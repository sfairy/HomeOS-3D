"""商店日志脱敏回归：激活码不得以明文写入日志。"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[4]
BACKEND_ROOT = REPO_ROOT / "homeos-store" / "backend"
sys.path.insert(0, str(BACKEND_ROOT))

from src.security.security import log_fingerprint


class ActivationLogRedactionTest(unittest.TestCase):
    def test_fingerprint_is_stable_and_not_plaintext(self) -> None:
        code = "HOMEOS-0123-4567-89AB-CDEF-0123-4567"
        fingerprint = log_fingerprint(code)
        self.assertEqual(len(fingerprint), 12)
        self.assertTrue(all(ch in "0123456789abcdef" for ch in fingerprint))
        self.assertEqual(fingerprint, log_fingerprint(code))
        self.assertNotIn(code, fingerprint)

    def test_activation_log_uses_fingerprint(self) -> None:
        source = (BACKEND_ROOT / "src" / "licensing" / "service.py").read_text("utf-8")
        self.assertIn("log_fingerprint(code)", source)
        self.assertNotIn("激活成功 code=%s", source)


if __name__ == "__main__":
    unittest.main()
