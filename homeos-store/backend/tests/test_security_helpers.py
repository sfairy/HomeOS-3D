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
    new_order_no,
    normalize_email,
    normalize_username,
    token_hash,
)
from src.security.setup_guard import SetupGuard, token_fingerprint


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


class OrderNoTest(unittest.TestCase):
    """订单号会直接当支付网关的 ``out_trade_no`` 用，长度与 PII 都是硬约束。"""

    def test_fixed_length_within_gateway_limit(self) -> None:
        # 微信 out_trade_no 只接受 6–32 字符；orders.orderNo 列是 String(64)
        for _ in range(20):
            order_no = new_order_no()
            self.assertLessEqual(len(order_no), 32)
            self.assertGreaterEqual(len(order_no), 6)
            self.assertRegex(order_no, re.compile(r"^[0-9A-Za-z_-]+$"))

    def test_does_not_embed_customer_email(self) -> None:
        from datetime import UTC, datetime

        moment = datetime(2026, 1, 2, 3, 4, 5, tzinfo=UTC)
        order_no = new_order_no(now=moment)
        self.assertNotIn("owner", order_no.lower())
        self.assertFalse(any(ch in order_no for ch in "@. "))

    def test_order_numbers_are_unique(self) -> None:
        self.assertEqual(len({new_order_no() for _ in range(50)}), 50)


class LicenseRollbackSnapshotTest(unittest.TestCase):
    """退款还原必须连功能码一起还原，否则「升级后退款」仍留着升级版权益。"""

    def test_snapshot_fields_cover_feature_codes(self) -> None:
        from src.commerce.fulfill import _LICENSE_SNAPSHOT_FIELDS

        self.assertIn("feature_codes_json", _LICENSE_SNAPSHOT_FIELDS)

    def test_snapshot_serializes_feature_codes(self) -> None:
        import json
        from datetime import UTC, datetime
        from types import SimpleNamespace

        from src.commerce.fulfill import _snapshot_license

        license = SimpleNamespace(
            product_id="prod-basic",
            product_name="基础版",
            product_type="license",
            price_cents=9900,
            validity_days=365,
            issuance_source="purchase",
            access_started_at=datetime(2026, 1, 2, tzinfo=UTC),
            access_expires_at=datetime(2027, 1, 2, tzinfo=UTC),
            feature_codes_json=["basic.read"],
        )
        payload = json.loads(_snapshot_license(license))
        self.assertEqual(payload["feature_codes_json"], ["basic.read"])
        self.assertEqual(payload["access_started_at"], "2026-01-02T00:00:00+00:00")


class SetupMarkerTest(unittest.TestCase):
    """标记文件指纹比对必须走常量时间比较（避免逐字节时间侧信道）。"""

    def test_fingerprint_match_uses_compare_digest(self) -> None:
        import inspect

        source = inspect.getsource(SetupGuard._is_ours)
        self.assertIn("compare_digest", source)
        self.assertEqual(token_fingerprint("abc"), token_fingerprint("abc"))
        self.assertNotEqual(token_fingerprint("abc"), token_fingerprint("abd"))

