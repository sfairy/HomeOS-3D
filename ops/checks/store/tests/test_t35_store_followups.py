"""T35 商店后续修复回归：DB 渠道 TTL 告警与未知发码用途。"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[4]
BACKEND_ROOT = REPO_ROOT / "homeos-store" / "backend"
SHARED_ROOT = REPO_ROOT / "packages" / "shared-py"
sys.path.insert(0, str(BACKEND_ROOT))
sys.path.insert(0, str(SHARED_ROOT))

from fastapi import HTTPException
from src.api.store.shared import _assert_purpose_allowed
from src.config import _warn_order_ttl_against_qr, load_settings


class OrderTtlWarningTest(unittest.TestCase):
    def test_db_selected_alipay_triggers_ttl_warning(self) -> None:
        settings = load_settings(order_ttl_seconds=120, payment_provider="")
        with self.assertLogs("src.config", level="WARNING") as captured:
            _warn_order_ttl_against_qr(settings, enabled_providers=("alipay",))
        self.assertTrue(any("STORE_ORDER_TTL_SECONDS" in line for line in captured.output))

    def test_non_alipay_does_not_warn(self) -> None:
        settings = load_settings(order_ttl_seconds=120, payment_provider="")
        with self.assertNoLogs("src.config", level="WARNING"):
            _warn_order_ttl_against_qr(settings, enabled_providers=("wechat",))


class PurposeAllowlistTest(unittest.TestCase):
    def test_unknown_purpose_is_rejected(self) -> None:
        with self.assertRaises(HTTPException) as raised:
            _assert_purpose_allowed(None, purpose="no-such-purpose", email="a@example.com", account=None)
        self.assertEqual(raised.exception.status_code, 400)

    def test_register_purpose_is_allowed(self) -> None:
        _assert_purpose_allowed(None, purpose="register", email="a@example.com", account=None)


if __name__ == "__main__":
    unittest.main()
