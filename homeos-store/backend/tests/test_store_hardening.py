"""商店侧加固回归：初始化三态、后台管理员会话、解绑语义、权益窗口。

覆盖这批改动的四组语义：

- 初始化：远程访问必须带引导密钥、本机直连放行、守卫缺失时 fail-closed 503，
  且守卫校验发生在输入校验之前（不通过守卫就问不出账号是否存在）；
- 后台：账号 is_admin 之外，还要求本次会话 is_admin_session（提权要刷新旧会话标记）；
- 解绑：自助解绑在「没有可解绑设备」时 409 且不写释放事件；后台重复释放不写第二条事件；
  后台物理删除 live 绑定前先落一条 source=admin 的释放事件；
- 权益：永久不被限时降级、限时从既有到期时间顺延；已作废授权不允许追加/升级。
"""

from __future__ import annotations

import tempfile
import unittest
from contextlib import ExitStack
from datetime import datetime, timedelta
from pathlib import Path
from types import SimpleNamespace

from fastapi.testclient import TestClient
from sqlalchemy import func, select, update
from src.api.admin_shared import _mark_admin_sessions
from src.app import create_app
from src.commerce.fulfill import _apply_license_action, _merge_entitlement_window
from src.config import StoreSettings
from src.core.models import (
    Account,
    AccountSession,
    Customer,
    DeviceBinding,
    DeviceReleaseEvent,
    License,
    Order,
    Product,
)
from src.security.security import hash_password, new_token, token_hash, utcnow

#: 本机直连的 base_url 与 peer：初始化与后台用例都靠它绕开引导密钥。
LOCAL_BASE_URL = "http://127.0.0.1:8802"
LOCAL_CLIENT = ("127.0.0.1", 51234)
LOCAL_ORIGIN = {"origin": LOCAL_BASE_URL}
PASSWORD = "Home0sAudit!2024"
ADMIN_USERNAME = "audit-admin"
ADMIN_EMAIL = "audit-admin@example.com"


class StoreApiTestCase(unittest.TestCase):
    """每个用例一套临时目录 + 独立 app；客户端统一在 tearDown 关闭。"""

    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name)
        self._stack = ExitStack()
        self.app = create_app(self.build_settings())

    def tearDown(self) -> None:
        self._stack.close()
        self.app.state.database.dispose()
        self._tmp.cleanup()

    def build_settings(self) -> StoreSettings:
        data_dir = self.root / "data"
        static_dir = self.root / "static"
        shell_dir = self.root / "shell"
        # StaticFiles 要求目录先存在；密钥目录必须显式指向临时目录，
        # 否则 create_app 会走「默认密钥目录缺密钥」的 RuntimeError。
        for directory in (data_dir, static_dir / "fonts", shell_dir):
            directory.mkdir(parents=True, exist_ok=True)
        return StoreSettings(
            data_dir=data_dir,
            static_dir=static_dir,
            shell_dir=shell_dir,
            license_keys_dir=self.root / "keys",
            mail_mode="log",
            payment_sweep_interval_seconds=0,
            release_sync_interval_seconds=0,
        )

    def client(self, *, local: bool = True) -> TestClient:
        if local:
            return self._stack.enter_context(
                TestClient(self.app, base_url=LOCAL_BASE_URL, client=LOCAL_CLIENT)
            )
        # 默认 peer 是 "testclient"：既非 loopback，也没有转发头 → 走「远程」分支。
        return self._stack.enter_context(TestClient(self.app))

    # ---- 数据构造 -------------------------------------------------------

    def create_account(
        self,
        session,
        *,
        email: str,
        password: str = PASSWORD,
        is_admin: bool = False,
    ) -> Account:
        account = Account(
            username=email.split("@", maxsplit=1)[0],
            email=email,
            password_hash=hash_password(password),
            is_admin=is_admin,
        )
        session.add(account)
        session.flush()
        return account

    def create_customer(self, session, account: Account) -> Customer:
        customer = Customer(account_id=account.id, email=account.email)
        session.add(customer)
        session.flush()
        return customer

    def create_license(
        self, session, *, account: Account, customer: Customer, active: bool = True
    ) -> License:
        license = License(
            activation_code=f"HOMEOS-{new_token(10).upper()}",
            customer_id=customer.id,
            account_id=account.id,
            product_name="审计测试授权",
            product_type="base",
            feature_codes_json="[]",
            price_cents=0,
            active=active,
        )
        session.add(license)
        session.flush()
        return license

    def bind_device(self, session, license: License) -> DeviceBinding:
        binding = DeviceBinding(
            license_id=license.id,
            instance_id=f"device-{new_token(6)}",
            active=True,
            activated_at=utcnow(),
        )
        session.add(binding)
        session.flush()
        return binding

    def event_count(self, license_id: str) -> int:
        with self.app.state.database.session() as session:
            return int(
                session.scalar(
                    select(func.count())
                    .select_from(DeviceReleaseEvent)
                    .where(DeviceReleaseEvent.license_id == license_id)
                )
                or 0
            )

    # ---- 登录 -----------------------------------------------------------

    def login(self, client: TestClient, *, account: str, password: str = PASSWORD):
        response = client.post(
            "/store/v1/auth/login",
            json={"account": account, "password": password},
            headers=LOCAL_ORIGIN,
        )
        self.assertEqual(response.status_code, 200, response.text)
        return response

    def create_admin(self, client: TestClient) -> None:
        response = client.post(
            "/store/v1/setup/admin",
            json={
                "username": ADMIN_USERNAME,
                "email": ADMIN_EMAIL,
                "password": PASSWORD,
                "confirm_password": PASSWORD,
            },
        )
        self.assertEqual(response.status_code, 201, response.text)


class SetupBootstrapTests(StoreApiTestCase):
    """初始化三态：未初始化 / 已初始化 / 服务未就绪。"""

    def test_remote_status_requires_setup_token(self) -> None:
        body = self.client(local=False).get("/store/v1/setup/status").json()
        self.assertFalse(body["initialized"])
        self.assertTrue(body["canInitialize"])
        self.assertFalse(body["localAccess"])
        self.assertTrue(body["requiresSetupToken"])
        self.assertIn("引导密钥", body["setupTokenHint"])

    def test_local_access_bootstraps_then_reports_initialized(self) -> None:
        client = self.client()
        before = client.get("/store/v1/setup/status").json()
        self.assertTrue(before["localAccess"])
        self.assertFalse(before["requiresSetupToken"])
        self.assertEqual(before["setupTokenHint"], "")

        self.create_admin(client)

        after = client.get("/store/v1/setup/status").json()
        self.assertTrue(after["initialized"])
        self.assertFalse(after["canInitialize"])
        self.assertFalse(after["requiresSetupToken"])

    def test_remote_guard_precedes_input_validation(self) -> None:
        """守卫先于输入校验：非法邮箱也应先拿到 403，而不是 422 的信箱格式提示。"""
        client = self.client(local=False)
        response = client.post(
            "/store/v1/setup/admin",
            json={
                "username": ADMIN_USERNAME,
                "email": "not-an-email",
                "password": PASSWORD,
                "confirm_password": PASSWORD,
            },
        )
        self.assertEqual(response.status_code, 403, response.text)
        self.assertIn("引导密钥", response.json()["detail"])

    def test_remote_setup_with_token_from_file(self) -> None:
        client = self.client(local=False)
        token_file = self.root / "data" / "setup-token"
        self.assertTrue(token_file.is_file())
        token = token_file.read_text(encoding="utf-8").strip()

        response = client.post(
            "/store/v1/setup/admin",
            json={
                "username": ADMIN_USERNAME,
                "email": ADMIN_EMAIL,
                "password": PASSWORD,
                "confirm_password": PASSWORD,
                "setup_token": token,
            },
        )
        self.assertEqual(response.status_code, 201, response.text)
        # 生成的引导密钥在初始化成功后作废（运营预置的那份会保留）。
        self.assertFalse(token_file.exists())

    def test_missing_guard_fails_closed(self) -> None:
        client = self.client(local=False)
        guard = self.app.state.setup_guard
        self.assertIsNotNone(guard)
        del self.app.state.setup_guard

        response = client.post(
            "/store/v1/setup/admin",
            json={
                "username": ADMIN_USERNAME,
                "email": ADMIN_EMAIL,
                "password": PASSWORD,
                "confirm_password": PASSWORD,
            },
        )
        self.assertEqual(response.status_code, 503, response.text)
        status = client.get("/store/v1/setup/status")
        self.assertEqual(status.status_code, 503, status.text)


class AdminSessionGateTests(StoreApiTestCase):
    """后台门槛：账号 is_admin + 本次会话 is_admin_session。"""

    def test_admin_endpoint_requires_admin_session_flag(self) -> None:
        client = self.client()
        self.create_admin(client)
        self.assertEqual(client.get("/store-admin/v1/bindings").status_code, 200)

        # 模拟「账号仍是管理员，但这次登录不是管理员会话」：例如降权后遗留的旧会话。
        with self.app.state.database.session() as session:
            session.execute(update(AccountSession).values(is_admin_session=False))

        response = client.get("/store-admin/v1/bindings")
        self.assertEqual(response.status_code, 403, response.text)
        self.assertEqual(response.json()["detail"], "管理员登录状态已失效，请重新登录。")

    def test_mark_admin_sessions_upgrades_live_sessions_only(self) -> None:
        with self.app.state.database.session() as session:
            account = self.create_account(session, email="promoted@example.com")
            live_token = new_token(32)
            expired_token = new_token(32)
            moment = utcnow()
            session.add_all(
                [
                    AccountSession(
                        id_hash=token_hash(live_token),
                        account_id=account.id,
                        is_admin_session=False,
                        expires_at=moment + timedelta(days=1),
                        last_seen_at=moment,
                    ),
                    AccountSession(
                        id_hash=token_hash(expired_token),
                        account_id=account.id,
                        is_admin_session=False,
                        expires_at=moment - timedelta(days=1),
                        last_seen_at=moment,
                    ),
                ]
            )
            session.flush()

            self.assertEqual(_mark_admin_sessions(session, account.id), 1)
            session.flush()

            live = session.get(AccountSession, token_hash(live_token))
            expired = session.get(AccountSession, token_hash(expired_token))
            self.assertTrue(live.is_admin_session)
            self.assertFalse(expired.is_admin_session)
            # 幂等：已标记过的会话不会被再次统计。
            self.assertEqual(_mark_admin_sessions(session, account.id), 0)


class DeviceReleaseTests(StoreApiTestCase):
    """解绑语义：没有 live 绑定不写事件，后台删除前先落释放事件。"""

    def test_self_release_without_live_binding_conflicts(self) -> None:
        client = self.client()
        with self.app.state.database.session() as session:
            account = self.create_account(session, email="buyer@example.com")
            customer = self.create_customer(session, account)
            license = self.create_license(session, account=account, customer=customer)
            license_id = license.id
        self.login(client, account=account.email)

        response = client.post(
            f"/store/v1/account/licenses/{license_id}/release",
            json={"password": PASSWORD},
            headers=LOCAL_ORIGIN,
        )
        self.assertEqual(response.status_code, 409, response.text)
        self.assertIn("无需解绑", response.json()["detail"])
        self.assertEqual(self.event_count(license_id), 0)

    def test_self_release_of_live_binding_writes_self_service_event(self) -> None:
        client = self.client()
        with self.app.state.database.session() as session:
            account = self.create_account(session, email="owner@example.com")
            customer = self.create_customer(session, account)
            license = self.create_license(session, account=account, customer=customer)
            binding = self.bind_device(session, license)
            license_id = license.id
            binding_id = binding.id
        self.login(client, account=account.email)

        response = client.post(
            f"/store/v1/account/licenses/{license_id}/release",
            json={"password": PASSWORD},
            headers=LOCAL_ORIGIN,
        )
        self.assertEqual(response.status_code, 200, response.text)
        self.assertTrue(response.json()["released"])

        with self.app.state.database.session() as session:
            stored = session.get(DeviceBinding, binding_id)
            self.assertFalse(stored.is_live)
        with self.app.state.database.session() as session:
            events = list(
                session.scalars(
                    select(DeviceReleaseEvent).where(DeviceReleaseEvent.license_id == license_id)
                )
            )
        self.assertEqual(len(events), 1)
        self.assertEqual(events[0].source, "self_service")

    def test_admin_release_twice_writes_single_event(self) -> None:
        client = self.client()
        self.create_admin(client)
        with self.app.state.database.session() as session:
            account = self.create_account(session, email="admin-release@example.com")
            customer = self.create_customer(session, account)
            license = self.create_license(session, account=account, customer=customer)
            binding = self.bind_device(session, license)
            binding_id = binding.id
            license_id = license.id

        first = client.post(
            f"/store-admin/v1/bindings/{binding_id}/release",
            json={"note": "运营手工解绑"},
            headers=LOCAL_ORIGIN,
        )
        self.assertEqual(first.status_code, 200, first.text)
        self.assertTrue(first.json()["released"])
        self.assertNotIn("alreadyReleased", first.json())

        second = client.post(
            f"/store-admin/v1/bindings/{binding_id}/release",
            json={"note": "重复点击"},
            headers=LOCAL_ORIGIN,
        )
        self.assertEqual(second.status_code, 200, second.text)
        self.assertTrue(second.json()["alreadyReleased"])
        # 释放事件决定冷却窗口：重复请求不能再写一条。
        self.assertEqual(self.event_count(license_id), 1)

    def test_admin_delete_releases_live_binding_first(self) -> None:
        client = self.client()
        self.create_admin(client)
        with self.app.state.database.session() as session:
            account = self.create_account(session, email="delete-binding@example.com")
            customer = self.create_customer(session, account)
            license = self.create_license(session, account=account, customer=customer)
            binding = self.bind_device(session, license)
            binding_id = binding.id
            license_id = license.id

        response = client.delete(
            f"/store-admin/v1/bindings/{binding_id}", headers=LOCAL_ORIGIN
        )
        self.assertEqual(response.status_code, 200, response.text)
        body = response.json()
        self.assertTrue(body["deleted"])
        self.assertTrue(body["released"])

        with self.app.state.database.session() as session:
            self.assertIsNone(session.get(DeviceBinding, binding_id))
            events = list(
                session.scalars(
                    select(DeviceReleaseEvent).where(DeviceReleaseEvent.license_id == license_id)
                )
            )
        self.assertEqual(len(events), 1)
        self.assertEqual(events[0].source, "admin")
        self.assertEqual(events[0].instance_id, binding.instance_id)


class EntitlementWindowTests(unittest.TestCase):
    """权益窗口合并规则（纯函数，不需要 app）。"""

    def test_permanent_window_never_downgraded(self) -> None:
        entry = SimpleNamespace(starts_at=datetime(2024, 1, 1), expires_at=None)
        starts, expires = _merge_entitlement_window(
            entry, starts_at=datetime(2024, 5, 1), expires_at=datetime(2024, 6, 1)
        )
        self.assertEqual(starts, datetime(2024, 1, 1))
        self.assertIsNone(expires)

    def test_limited_window_extends_from_existing_expiry(self) -> None:
        entry = SimpleNamespace(starts_at=datetime(2024, 1, 1), expires_at=datetime(2024, 2, 1))
        starts, expires = _merge_entitlement_window(
            entry, starts_at=datetime(2024, 1, 15), expires_at=datetime(2024, 2, 15)
        )
        self.assertEqual(starts, datetime(2024, 1, 1))
        # 本次时长 31 天，从既有到期时间 2024-02-01 往后顺延，而不是重置到「现在」。
        self.assertEqual(expires, datetime(2024, 2, 1) + timedelta(days=31))

    def test_expired_window_starts_from_now(self) -> None:
        entry = SimpleNamespace(starts_at=datetime(2024, 1, 1), expires_at=datetime(2024, 1, 10))
        _, expires = _merge_entitlement_window(
            entry, starts_at=datetime(2024, 6, 1), expires_at=datetime(2024, 7, 1)
        )
        self.assertEqual(expires, datetime(2024, 7, 1))


class InvalidLicenseActionTests(StoreApiTestCase):
    """已作废授权不允许追加权益或升级（RuntimeError → 履约告警，不发码）。"""

    def _prepare(self, *, license_action: str) -> tuple:
        with self.app.state.database.session() as session:
            account = self.create_account(session, email="voided@example.com")
            customer = self.create_customer(session, account)
            product = session.scalars(select(Product)).first()
            self.assertIsNotNone(product)
            license = self.create_license(
                session, account=account, customer=customer, active=False
            )
            order = Order(
                order_no=f"ORD-{new_token(8)}",
                email=account.email,
                product_id=product.id,
                customer_id=customer.id,
                license_action=license_action,
                target_license_id=license.id,
                product_name=product.name,
                product_type="base",
                amount_cents=0,
            )
            return session, order, product, customer

    def test_inactive_license_rejects_patch(self) -> None:
        session, order, product, customer = self._prepare(license_action="patch")
        with self.assertRaises(RuntimeError) as raised:
            _apply_license_action(
                session, order=order, product=product, customer=customer, moment=utcnow()
            )
        self.assertIn("不能追加权益", str(raised.exception))

    def test_inactive_license_rejects_upgrade(self) -> None:
        session, order, product, customer = self._prepare(license_action="upgrade")
        with self.assertRaises(RuntimeError) as raised:
            _apply_license_action(
                session, order=order, product=product, customer=customer, moment=utcnow()
            )
        self.assertIn("不能升级", str(raised.exception))


if __name__ == "__main__":
    unittest.main()
