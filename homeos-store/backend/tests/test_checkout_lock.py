"""下单写锁与支付失败补偿回归。

两处历史缺陷：

1. checkout 在写事务里调用支付网关（15s 的 HTTP），SQLite 的库级写锁被一路占住，
   并发写（含授权心跳 nonce 插入）在 ``busy_timeout`` 后失败。修复方式是把订单与
   库存/优惠码预留**先提交**，再调渠道。
2. 支付失败分支在同一请求会话里写 ``payment_failed`` 并 ``flush``，随后抛
   ``HTTPException`` —— 依赖的 ``Database.session()`` 会 rollback，补偿等于没写。
   现在改由独立事务落库。
"""

from __future__ import annotations

import contextlib
import inspect
import sys
import unittest
from datetime import datetime
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from src.api.store import orders as orders_api
from src.core.models import Base, Order, Product


class _FakeDatabase:
    """只实现 ``_mark_payment_failed`` 用到的 ``session()`` 上下文语义。"""

    def __init__(self) -> None:
        self.engine = create_engine("sqlite://", connect_args={"check_same_thread": False})
        Base.metadata.create_all(self.engine)
        self.session_factory = sessionmaker(bind=self.engine, expire_on_commit=False)
        self._seq = 0

    def _id(self, prefix: str) -> str:
        self._seq += 1
        return f"{prefix}{self._seq:04d}"

    @contextlib.contextmanager
    def session(self):
        session = self.session_factory()
        try:
            yield session
            session.commit()
        except Exception:
            session.rollback()
            raise
        finally:
            session.close()

    def seed(self, *, reserved_stock: int = 1) -> tuple[str, str]:
        product_id = self._id("prod")
        order_id = self._id("order")
        with self.session() as session:
            session.add(
                Product(
                    id=product_id,
                    name="测试商品",
                    product_type="base",
                    price_cents=1000,
                    stock_quantity=1,
                    reserved_stock=reserved_stock,
                    active=True,
                )
            )
            session.add(
                Order(
                    id=order_id,
                    order_no=f"HOMEOS-{self._seq}",
                    lookup_token="test-lookup-token",  # noqa: S106 — 测试固定值，不是真实凭据
                    account_id=None,
                    customer_id=None,
                    email="buyer@example.com",
                    product_id=product_id,
                    product_name="测试商品",
                    product_type="base",
                    order_type="base",
                    license_action="issue",
                    original_amount_cents=1000,
                    amount_cents=1000,
                    status="pending",
                    fulfillment_mode="automatic",
                    payment_provider="alipay",
                    created_at=datetime(2026, 1, 1, 0, 0, 0),
                )
            )
        return product_id, order_id


class PaymentFailedMarkerTest(unittest.TestCase):
    def test_marks_failed_and_releases_stock(self) -> None:
        database = _FakeDatabase()
        product_id, order_id = database.seed(reserved_stock=1)
        orders_api._mark_payment_failed(database, order_id=order_id, product_id=product_id)

        with database.session() as session:
            order = session.get(Order, order_id)
            product = session.get(Product, product_id)
            if order is None or product is None:
                self.fail("订单或商品未落库")
            self.assertEqual(order.status, "payment_failed")
            self.assertIsNotNone(order.stock_reservation_released_at)
            self.assertEqual(int(product.reserved_stock or 0), 0)

    def test_idempotent_for_already_closed_order(self) -> None:
        database = _FakeDatabase()
        product_id, order_id = database.seed(reserved_stock=0)
        with database.session() as session:
            pending = session.get(Order, order_id)
            if pending is None:
                self.fail("订单未落库")
            pending.status = "cancelled"
        orders_api._mark_payment_failed(database, order_id=order_id, product_id=product_id)
        with database.session() as session:
            # 不是 pending 的单子不能被覆盖成 payment_failed
            closed = session.get(Order, order_id)
            if closed is None:
                self.fail("订单未落库")
            self.assertEqual(closed.status, "cancelled")


class CheckoutLockOrderingTest(unittest.TestCase):
    def test_commit_happens_before_channel_call(self) -> None:
        source = inspect.getsource(orders_api.create_order)
        commit_at = source.find("session.commit()")
        channel_at = source.find("_open_channel_payment(")
        self.assertGreaterEqual(commit_at, 0, "create_order 必须在调渠道前提交订单")
        self.assertGreater(channel_at, commit_at, "支付网关调用必须发生在一次 commit 之后")


if __name__ == "__main__":
    unittest.main()
