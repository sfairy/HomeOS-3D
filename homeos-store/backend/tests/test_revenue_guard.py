"""营收口径守卫与金额口径回归。

历史缺陷：对已通过支付宝/微信入账的订单点「标记支付」，会把 ``manual_settlement``
翻成 ``True``；而营收统计的条件是 ``manual_settlement.is_(False)`` —— 一笔真实收款
就此从报表里消失。反向地，对人工补记的订单点「线下入账」会凭空增加营收。
"""

from __future__ import annotations

import sys
import unittest
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from fastapi import HTTPException
from src.api.admin.orders.settlement import _revenue_guard
from src.core.order_status import refundable_cents


@dataclass
class _Order:
    paid_at: datetime | None
    payment_provider: str
    manual_settlement: bool


class RevenueGuardTest(unittest.TestCase):
    def test_channel_paid_order_cannot_be_remarked(self) -> None:
        order = _Order(paid_at=datetime.now(UTC), payment_provider="alipay", manual_settlement=False)
        with self.assertRaises(HTTPException) as caught:
            _revenue_guard(order, manual_settlement=True, override_revenue=True)
        self.assertEqual(caught.exception.status_code, 409)

    def test_flip_requires_override(self) -> None:
        order = _Order(paid_at=datetime.now(UTC), payment_provider="manual", manual_settlement=True)
        with self.assertRaises(HTTPException) as caught:
            _revenue_guard(order, manual_settlement=False, override_revenue=False)
        self.assertEqual(caught.exception.status_code, 409)

    def test_flip_allowed_with_override(self) -> None:
        order = _Order(paid_at=datetime.now(UTC), payment_provider="manual", manual_settlement=True)
        self.assertTrue(_revenue_guard(order, manual_settlement=False, override_revenue=True))

    def test_unpaid_order_never_flips(self) -> None:
        order = _Order(paid_at=None, payment_provider="", manual_settlement=False)
        self.assertFalse(_revenue_guard(order, manual_settlement=True, override_revenue=False))

    def test_same_flag_is_noop(self) -> None:
        order = _Order(paid_at=datetime.now(UTC), payment_provider="manual", manual_settlement=True)
        self.assertFalse(_revenue_guard(order, manual_settlement=True, override_revenue=False))


class MoneyTest(unittest.TestCase):
    def test_refundable_never_negative(self) -> None:
        self.assertEqual(refundable_cents(1000, 0), 1000)
        self.assertEqual(refundable_cents(1000, 400), 600)
        self.assertEqual(refundable_cents(1000, 1000), 0)
        self.assertEqual(refundable_cents(1000, 1200), 0)
        self.assertEqual(refundable_cents(None, None), 0)


if __name__ == "__main__":
    unittest.main()
