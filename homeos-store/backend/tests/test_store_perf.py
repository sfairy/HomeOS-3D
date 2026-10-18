"""商店性能回归：订单列表有界对账、验证码/激活码邮件后台发送。

这组用例锁两件事：

- 账号中心订单列表不再对每笔 pending 串行查单（单次 HTTP 15s 超时会拖垮响应），
  而是有界并发 + 总预算，超出预算的订单交给既有巡检补账；响应字段与排序不变。
- 注册验证码与激活码重发邮件排到响应之后发送（FastAPI BackgroundTasks），
  请求不再等 SMTP（最坏 20s），但投递结果仍然写回记录、响应语义保持兼容。

数据库用与 test_store_hardening 相同的临时目录 + 独立 app（SQLite），
不依赖真实 SMTP / 支付渠道：provider、mailer、settle 全部在用例里打桩。
"""

from __future__ import annotations

import sys
import threading
import time
import unittest
from datetime import timedelta
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

TESTS_ROOT = Path(__file__).resolve().parent
if str(TESTS_ROOT) not in sys.path:
    sys.path.insert(0, str(TESTS_ROOT))

from sqlalchemy import select
from src.api import store as store_api
from src.api import store_catalog
from src.core.models import EmailVerification, Order, Product
from src.ops.mailer import MailResult
from src.payments import reconcile as reconcile_mod
from src.security.security import new_token, utcnow
from test_store_hardening import LOCAL_ORIGIN, StoreApiTestCase


class _FakeProvider:
    """线程安全的假渠道：记录查了哪些单，可选延迟 / 事件阻塞。"""

    def __init__(
        self,
        *,
        delay: float = 0.0,
        node: dict | None = None,
        release: threading.Event | None = None,
    ) -> None:
        self.delay = delay
        self.node = node
        self.release = release
        self.calls: list[str] = []

    def is_configured(self, settings) -> bool:
        return True

    def query_payment(self, settings, order):
        self.calls.append(order.order_no)
        if self.release is not None:
            self.release.wait(5.0)
        elif self.delay:
            time.sleep(self.delay)
        return dict(self.node) if self.node else None

    def is_success_node(self, node: dict) -> bool:
        return bool(node.get("success"))

    def trade_no_of(self, node: dict) -> str:
        return str(node.get("trade_no", ""))


class BoundedReconcileTests(unittest.TestCase):
    """reconcile_pending_orders_bounded 本身的并发 / 预算 / 容错语义。"""

    def _orders(self, count: int) -> list[SimpleNamespace]:
        return [
            SimpleNamespace(
                status="pending",
                payment_provider="alipay",
                order_no=f"PERF-{index}",
                amount_cents=100,
            )
            for index in range(count)
        ]

    def _run(
        self,
        orders,
        provider: _FakeProvider,
        *,
        allow: bool = True,
        settle_side_effect=None,
        limit: int = 3,
        budget: float = 2.0,
    ):
        settle = mock.MagicMock(return_value={"changed": True})
        if settle_side_effect is not None:
            settle.side_effect = settle_side_effect
        with (
            mock.patch.object(reconcile_mod, "_reconcile_provider", return_value=provider),
            mock.patch.object(reconcile_mod, "_allow_query", return_value=allow),
            mock.patch.object(reconcile_mod, "_amount_matches", return_value=True),
            mock.patch.object(reconcile_mod, "settle_paid_order", settle),
            mock.patch.object(reconcile_mod.incidents, "note") as note,
        ):
            started = time.monotonic()
            settled = reconcile_mod.reconcile_pending_orders_bounded(
                object(),
                orders=list(orders),
                settings=object(),
                setting=object(),
                limit=limit,
                budget_seconds=budget,
            )
            elapsed = time.monotonic() - started
        return settled, elapsed, provider.calls, settle, note

    def test_queries_at_most_limit_orders_concurrently(self) -> None:
        orders = self._orders(5)
        provider = _FakeProvider(
            delay=0.25, node={"success": True, "trade_no": "TRADE-1"}
        )
        settled, elapsed, calls, settle, _note = self._run(orders, provider, limit=3)

        self.assertEqual(settled, 3)
        self.assertEqual(len(calls), 3)
        self.assertEqual(settle.call_count, 3)
        # 3 笔 x 0.25s 串行要 0.75s；并发应接近 0.25s（留足 CI 抖动余量）。
        self.assertLess(elapsed, 0.65)
        self.assertGreaterEqual(elapsed, 0.2)

    def test_gives_up_after_budget_and_leaves_rest_to_sweep(self) -> None:
        orders = self._orders(2)
        release = threading.Event()
        provider = _FakeProvider(
            release=release, node={"success": True, "trade_no": "TRADE-1"}
        )
        try:
            settled, elapsed, calls, settle, _note = self._run(
                orders, provider, budget=0.2
            )
        finally:
            release.set()

        # 预算内没回来：不入账、不等线程，直接返回，交给 payment_sweep_loop。
        self.assertEqual(settled, 0)
        self.assertEqual(settle.call_count, 0)
        self.assertEqual(len(calls), 2)
        self.assertLess(elapsed, 1.2)

    def test_skips_orders_that_must_not_be_queried(self) -> None:
        orders = [
            SimpleNamespace(
                status="paid", payment_provider="alipay", order_no="PAID", amount_cents=1
            ),
            SimpleNamespace(
                status="pending", payment_provider="cash", order_no="CASH", amount_cents=1
            ),
            SimpleNamespace(
                status="pending", payment_provider="alipay", order_no="OK", amount_cents=1
            ),
        ]
        provider = _FakeProvider(node=None)
        settled, _elapsed, calls, _settle, _note = self._run(orders, provider, allow=False)
        self.assertEqual((settled, calls), (0, []))

    def test_single_settle_failure_does_not_block_other_orders(self) -> None:
        orders = self._orders(3)
        provider = _FakeProvider(node={"success": True, "trade_no": "T"})
        settled, _elapsed, calls, _settle, note = self._run(
            orders,
            provider,
            settle_side_effect=[RuntimeError("入账写库失败"), None, None],
        )
        self.assertEqual(settled, 2)
        self.assertEqual(len(calls), 3)
        self.assertEqual(note.call_count, 1)


class ListOrdersReconcileTests(StoreApiTestCase):
    """GET /store/v1/orders 只调用一次批量对账，且对账失败不影响列表。"""

    def setUp(self) -> None:
        super().setUp()
        with self.app.state.database.session() as session:
            account = self.create_account(session, email="perf-list@example.com")
            account.email_verified_at = utcnow()
            customer = self.create_customer(session, account)
            product = Product(
                name="性能测试商品",
                product_code="perf",
                price_cents=100,
            )
            session.add(product)
            session.flush()
            session.add(
                Order(
                    order_no="PERF-LIST-1",
                    email=account.email,
                    account_id=account.id,
                    customer_id=customer.id,
                    product_id=product.id,
                    product_name=product.name,
                    amount_cents=100,
                    status="pending",
                    payment_provider="alipay",
                    expires_at=utcnow() + timedelta(hours=1),
                )
            )
        self.email = account.email

    def _client(self):
        client = self.client()
        self.login(client, account=self.email)
        return client

    def test_list_orders_uses_one_bounded_reconcile_batch(self) -> None:
        client = self._client()
        with mock.patch.object(
            store_catalog, "reconcile_pending_orders_bounded", return_value=0
        ) as bounded:
            response = client.get("/store/v1/orders?limit=20", headers=LOCAL_ORIGIN)

        self.assertEqual(response.status_code, 200, response.text)
        body = response.json()
        self.assertEqual(set(body), {"items", "ordersTotal", "limit", "offset"})
        self.assertEqual(body["ordersTotal"], 1)
        self.assertEqual(body["limit"], 20)
        self.assertEqual(body["offset"], 0)
        self.assertEqual([item["orderNo"] for item in body["items"]], ["PERF-LIST-1"])
        self.assertEqual(body["items"][0]["status"], "pending")

        # 关键回归：批量 helper 只调一次，而不是按 pending 逐笔调。
        bounded.assert_called_once()
        pending = bounded.call_args.kwargs["orders"]
        self.assertEqual([order.order_no for order in pending], ["PERF-LIST-1"])

    def test_list_orders_survives_reconcile_exception(self) -> None:
        client = self._client()
        with mock.patch.object(
            store_catalog,
            "reconcile_pending_orders_bounded",
            side_effect=RuntimeError("渠道不可用"),
        ):
            response = client.get("/store/v1/orders?limit=20", headers=LOCAL_ORIGIN)

        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["ordersTotal"], 1)


class VerificationEmailBackgroundTests(StoreApiTestCase):
    """注册验证码：SMTP 投递排到响应之后，响应先返回「已受理」。"""

    def test_smtp_delivery_is_queued_and_recorded(self) -> None:
        client = self.client()
        merged = SimpleNamespace(
            smtp_ready=True,
            verification_ttl_seconds=600,
            verification_cooldown_seconds=60,
            verification_global_hourly_limit=5000,
        )
        delivered = MailResult(delivered=True, mode="smtp", attempts=1, error="")
        with (
            mock.patch.object(
                store_api.mail_settings, "merge_mail_settings", return_value=merged
            ),
            mock.patch.object(
                store_api.mailer, "send_verification_email", return_value=delivered
            ) as send,
        ):
            response = client.post(
                "/store/v1/verifications",
                json={"email": "perf-code@example.com", "purpose": "register"},
                headers=LOCAL_ORIGIN,
            )

        self.assertEqual(response.status_code, 200, response.text)
        body = response.json()
        self.assertEqual(body["deliveryMode"], "smtp")
        self.assertTrue(body["delivered"])
        self.assertTrue(body["deliveryPending"])
        self.assertEqual(body["deliveryAttempts"], 0)
        self.assertNotIn("deliveryError", body)

        # TestClient 会同步执行 BackgroundTasks：后台确实发了信，且投递结果写回了记录。
        send.assert_called_once()
        kwargs = send.call_args.kwargs
        self.assertEqual(kwargs["email"], "perf-code@example.com")
        self.assertEqual(kwargs["purpose"], "register")
        self.assertTrue(kwargs["code"])

        with self.app.state.database.session() as session:
            record = session.scalars(
                select(EmailVerification).where(
                    EmailVerification.email == "perf-code@example.com"
                )
            ).first()
            self.assertIsNotNone(record)
            self.assertEqual(record.delivery_mode, "smtp")
            self.assertEqual(record.delivery_attempts, 1)
            self.assertIs(record.delivered, True)
            self.assertIsNotNone(record.delivered_at)


class LicenseEmailBackgroundTests(StoreApiTestCase):
    """激活码重发：请求只做便宜预检，发信排到响应之后。"""

    def _prepare(self, *, status: str) -> None:
        with self.app.state.database.session() as session:
            account = self.create_account(session, email="perf-resend@example.com")
            account.email_verified_at = utcnow()
            customer = self.create_customer(session, account)
            license_row = self.create_license(session, account=account, customer=customer)
            product = Product(name="性能测试授权", product_code="perf", price_cents=100)
            session.add(product)
            session.flush()
            session.add(
                Order(
                    order_no=f"PERF-RESEND-{new_token(6)}",
                    email=account.email,
                    account_id=account.id,
                    customer_id=customer.id,
                    product_id=product.id,
                    product_name=product.name,
                    amount_cents=100,
                    status=status,
                    license_id=license_row.id,
                    license_action="issue",
                    fulfilled_at=utcnow() if status == "fulfilled" else None,
                )
            )
            self.license_id = license_row.id
            self.email = account.email

    def _client(self):
        client = self.client()
        self.login(client, account=self.email)
        return client

    def test_resend_queues_background_delivery(self) -> None:
        self._prepare(status="fulfilled")
        client = self._client()
        with mock.patch.object(
            store_api.delivery,
            "notify_license_issued",
            return_value={"sent": True, "attempts": 1, "mode": "smtp"},
        ) as notify:
            response = client.post(
                f"/store/v1/account/licenses/{self.license_id}/email",
                headers=LOCAL_ORIGIN,
            )

        self.assertEqual(response.status_code, 200, response.text)
        body = response.json()
        self.assertEqual(body["email"], self.email)
        self.assertIsNone(body["sent"])
        self.assertTrue(body["queued"])
        self.assertEqual(body["deliveryError"], "")
        notify.assert_called_once()
        self.assertIs(notify.call_args.kwargs.get("force"), True)

    def test_resend_precheck_failure_does_not_queue(self) -> None:
        self._prepare(status="pending")
        client = self._client()
        with mock.patch.object(
            store_api.delivery, "notify_license_issued"
        ) as notify:
            response = client.post(
                f"/store/v1/account/licenses/{self.license_id}/email",
                headers=LOCAL_ORIGIN,
            )

        self.assertEqual(response.status_code, 200, response.text)
        body = response.json()
        self.assertIs(body["sent"], False)
        self.assertIn("履约", body["deliveryError"])
        notify.assert_not_called()


if __name__ == "__main__":
    unittest.main()
