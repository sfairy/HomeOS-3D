"""商店安全叶子的最小回归：日志指纹与账号归一化。

日志指纹是"激活码不落明文"的落点；账号归一化决定登录比对是否一致。
两者都是纯函数，不启动 app、不建库，适合作为商店产品测试的第一批 case。
运行：node ops/lib/py.mjs -m unittest discover -s homeos-store/backend/tests -t homeos-store/backend -v
"""

from __future__ import annotations

import re
import sys
import unittest
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from src.security.security import (
    is_valid_email,
    log_fingerprint,
    normalize_email,
    normalize_username,
    token_hash,
)


class LogFingerprintTest(unittest.TestCase):
    def test_fingerprint_is_stable_and_does_not_leak_secret(self) -> None:
        secret = "HOMEOS-ABCDEFGHIJKLMNOPQRSTUVWX"
        fingerprint = log_fingerprint(secret)
        self.assertEqual(fingerprint, log_fingerprint(secret))
        self.assertNotIn(secret, fingerprint)
        self.assertEqual(len(fingerprint), 12)
        self.assertRegex(fingerprint, re.compile(r"^[0-9a-f]{12}$"))
        self.assertEqual(fingerprint, token_hash(secret)[:12])

    def test_distinct_secrets_have_distinct_fingerprints(self) -> None:
        self.assertNotEqual(log_fingerprint("code-a"), log_fingerprint("code-b"))


class AccountNormalizationTest(unittest.TestCase):
    def test_email_is_trimmed_and_lowercased(self) -> None:
        self.assertEqual(normalize_email("  Owner@Example.COM "), "owner@example.com")
        self.assertTrue(is_valid_email("owner@example.com"))
        self.assertFalse(is_valid_email("not-an-email"))

    def test_username_rejects_reserved_and_short_values(self) -> None:
        self.assertEqual(normalize_username("  Alice "), "alice")
        for bad in ("ab", "has space", "a@b.com", "x" * 65):
            with self.assertRaises(ValueError):
                normalize_username(bad)
