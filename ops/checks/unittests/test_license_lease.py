"""授权域纯逻辑单元测试：版本推导 / 心跳间隔 / 状态推算。

这些函数决定「面板上显示哪个版本」「多久向商店要一次状态」「到期和吊销该怎么解释」——
都是**纯函数**，但它们此前没有独立测试：只能靠整条链路的手工验证。
"""

from __future__ import annotations

import os
import unittest
from datetime import UTC, datetime, timedelta
from unittest import mock

from homeos.backend.src.domains.license.heartbeat import (
    DEFAULT_MIN_HEARTBEAT_SECONDS,
    heartbeat_seconds,
    min_heartbeat_seconds,
)
from homeos.backend.src.domains.license.service import edition_from_products, lease_product_edition
from homeos.backend.src.domains.license.status_view import (
    decide_effective_status,
    downgrade_if_unverified,
    lease_features_and_products,
    mask_email,
    signed_timestamp,
)


class EditionFromProductsTest(unittest.TestCase):
    def test_takes_first_non_addon_type(self) -> None:
        products = [{"type": "module", "name": "安防"}, {"type": "pro", "name": "专业版"}]
        self.assertEqual(edition_from_products(products), "pro")

    def test_addons_are_skipped(self) -> None:
        """附加项（module / template）描述加购模块，不是授权版本。"""
        self.assertEqual(edition_from_products([{"type": "template"}]), "base")

    def test_case_and_whitespace_normalized(self) -> None:
        self.assertEqual(edition_from_products([{"type": "  Pro  "}]), "Pro")

    def test_empty_or_malformed_falls_back_to_base(self) -> None:
        for products in ([], [None], [{"type": 3}], [{"type": ""}], ["pro"]):
            self.assertEqual(edition_from_products(products), "base", products)

    def test_lease_without_products_list(self) -> None:
        self.assertEqual(lease_product_edition({}), "base")
        self.assertEqual(lease_product_edition({"products": "pro"}), "base")
        self.assertEqual(lease_product_edition({"products": [{"type": "base"}]}), "base")


class HeartbeatSecondsTest(unittest.TestCase):
    def test_numeric_and_string_values(self) -> None:
        self.assertEqual(heartbeat_seconds(120), 120)
        self.assertEqual(heartbeat_seconds("120"), 120)
        self.assertEqual(heartbeat_seconds(1.9), 1)

    def test_invalid_values_fall_back(self) -> None:
        for raw in (None, "5m", [], {}, True, False, 0, -5, ""):
            self.assertEqual(heartbeat_seconds(raw, 300), 300, raw)

    def test_min_heartbeat_env_override(self) -> None:
        with mock.patch.dict(os.environ, {"HOMEOS_LICENSE_HEARTBEAT_SECONDS": "5"}, clear=False):
            self.assertEqual(min_heartbeat_seconds(), 5)
        with mock.patch.dict(os.environ, {"HOMEOS_LICENSE_HEARTBEAT_SECONDS": "abc"}, clear=False):
            self.assertEqual(min_heartbeat_seconds(), DEFAULT_MIN_HEARTBEAT_SECONDS)

    def test_min_heartbeat_never_below_one(self) -> None:
        with mock.patch.dict(os.environ, {"HOMEOS_LICENSE_HEARTBEAT_SECONDS": "0"}, clear=False):
            self.assertEqual(min_heartbeat_seconds(), 1)


class EffectiveStatusTest(unittest.TestCase):
    """面板状态推算：三条降级路径各自独立，顺序不能乱。"""

    NOW = datetime(2026, 5, 1, 12, 0, tzinfo=UTC)

    def _decide(self, **overrides):
        kwargs = {
            "base_status": "ACTIVE",
            "base_error": None,
            "signed_lease": {},
            "now": self.NOW,
            "skew_seconds": 30,
            "lease_expires": None,
            "license_required": True,
            "startup_pending": False,
        }
        kwargs.update(overrides)
        return decide_effective_status(**kwargs)

    def test_active_lease_stays_active(self) -> None:
        self.assertEqual(self._decide(), ("ACTIVE", None))

    def test_clock_rollback_detected_from_signed_lease(self) -> None:
        future = (self.NOW + timedelta(hours=2)).isoformat()
        status, error = self._decide(signed_lease={"issuedAt": future})
        self.assertEqual(status, "CLOCK_ROLLBACK")
        self.assertIn("校准系统时间", error or "")

    def test_issued_at_within_skew_is_tolerated(self) -> None:
        near = (self.NOW + timedelta(seconds=5)).isoformat()
        self.assertEqual(self._decide(signed_lease={"issuedAt": near})[0], "ACTIVE")

    def test_expired_lease_downgrades(self) -> None:
        status, error = self._decide(lease_expires=self.NOW - timedelta(minutes=1))
        self.assertEqual(status, "LEASE_EXPIRED")
        self.assertTrue(error)

    def test_existing_error_is_preserved_on_expiry(self) -> None:
        _, error = self._decide(base_error="上次失败原因", lease_expires=self.NOW - timedelta(minutes=1))
        self.assertEqual(error, "上次失败原因")

    def test_expired_lease_does_not_override_revoked(self) -> None:
        """吊销是更强的结论：租约刚好过期也不能把它改写成「到期」。"""
        status, _ = self._decide(base_status="REVOKED", lease_expires=self.NOW - timedelta(minutes=1))
        self.assertEqual(status, "REVOKED")

    def test_startup_pending_forces_validation(self) -> None:
        status, error = self._decide(startup_pending=True)
        self.assertEqual(status, "STARTUP_VALIDATION_REQUIRED")
        self.assertTrue(error)

    def test_startup_pending_ignored_when_license_not_required(self) -> None:
        self.assertEqual(self._decide(startup_pending=True, license_required=False)[0], "ACTIVE")

    def test_unverified_downgrades_to_invalid(self) -> None:
        status, error = downgrade_if_unverified("ACTIVE", None, verified=False)
        self.assertEqual(status, "INVALID")
        self.assertTrue(error)

    def test_unverified_keeps_terminal_status(self) -> None:
        """已判定为吊销/到期时不要被 INVALID 覆盖 —— 终端态才是用户该看到的解释。"""
        self.assertEqual(downgrade_if_unverified("REVOKED", "已吊销", verified=False), ("REVOKED", "已吊销"))

    def test_verified_is_unchanged(self) -> None:
        self.assertEqual(downgrade_if_unverified("ACTIVE", None, verified=True), ("ACTIVE", None))


class LeaseProjectionTest(unittest.TestCase):
    def test_features_prefer_signed_lease(self) -> None:
        features, _ = lease_features_and_products(
            signed_lease={"features": ["agent"]}, cached_feature_set='["old"]', allowed=True
        )
        self.assertEqual(features, ["agent"])

    def test_features_fall_back_to_cache(self) -> None:
        features, _ = lease_features_and_products(signed_lease={}, cached_feature_set='["cached"]', allowed=True)
        self.assertEqual(features, ["cached"])

    def test_broken_cache_yields_empty_list(self) -> None:
        self.assertEqual(lease_features_and_products(signed_lease={}, cached_feature_set="{", allowed=True)[0], [])

    def test_products_normalized_and_filtered(self) -> None:
        _, products = lease_features_and_products(
            signed_lease={
                "products": [{"name": " 专业版 ", "type": "pro", "expiresAt": "2027-01-01"}, {"type": "x"}, "junk"]
            },
            cached_feature_set=None,
            allowed=True,
        )
        self.assertEqual(products, [{"name": "专业版", "type": "pro", "expiresAt": "2027-01-01"}])

    def test_basic_edition_synthesized_only_when_allowed(self) -> None:
        _, allowed_products = lease_features_and_products(signed_lease={}, cached_feature_set=None, allowed=True)
        self.assertEqual(allowed_products, [{"name": "基础版", "type": "base", "expiresAt": None}])
        self.assertEqual(lease_features_and_products(signed_lease={}, cached_feature_set=None, allowed=False)[1], [])


class PresentationTest(unittest.TestCase):
    def test_mask_email(self) -> None:
        self.assertEqual(mask_email("ab@example.com"), "a***@example.com")
        self.assertEqual(mask_email("abcd@example.com"), "ab***@example.com")
        self.assertIsNone(mask_email(""))
        self.assertEqual(mask_email("not-an-email"), "not-an-email")

    def test_signed_timestamp_parses_and_tolerates_garbage(self) -> None:
        stamp = signed_timestamp({"issuedAt": "2026-05-01T00:00:00Z"}, "issuedAt")
        self.assertIsNotNone(stamp)
        self.assertIsNotNone(stamp.tzinfo)
        for payload in ({}, {"issuedAt": 1}, {"issuedAt": ""}):
            self.assertIsNone(signed_timestamp(payload, "issuedAt"), payload)
        # 格式坏掉的时间戳要留痕（否则时钟回拨永远查不出来），同时仍返回 None 让上层降级。
        with self.assertLogs("homeos.license.service", level="WARNING") as captured:
            self.assertIsNone(signed_timestamp({"issuedAt": "nonsense"}, "issuedAt"))
        self.assertTrue(any("issuedAt" in line for line in captured.output))


if __name__ == "__main__":
    unittest.main()
