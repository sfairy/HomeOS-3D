"""需求 B：激活码必须由邮件送达，且与个人中心显示的是同一个码。

投递路径用假 SMTP 捕获报文（不打真网络），但走的是**真实的**发信函数、
领取标记与结果落库。
"""

from __future__ import annotations

import pytest

from src.core.models import License, Order
from src.ops import mailer as mailer_module
from src.ops import site_settings as site_config
from src.tests.support import (
    create_account,
    create_order,
    first_product,
    sign_notify,
)

NOTIFY = "/store/v1/payments/alipay/notify"
APP_ID = "2021000000000000"
SELLER_ID = "2088000000000000"
BUYER = "buyer@example.com"


@pytest.fixture
def sent_mail(monkeypatch):
    """把 SMTP 发送换成捕获器：返回 (已捕获报文列表, 假发送函数)。"""
    captured: list[dict] = []

    def fake_send(settings, *, email, subject, plain, rich):
        captured.append({"email": email, "subject": subject, "plain": plain, "rich": rich})
        return True, 1, ""

    monkeypatch.setattr(mailer_module, "_send_smtp", fake_send)
    return captured


@pytest.fixture
def store(make_settings, make_app, make_client, alipay_keys, sent_mail):
    private_pem, public_pem = alipay_keys
    settings = make_settings(
        payment_provider="alipay",
        alipay_app_id=APP_ID,
        alipay_app_private_key=private_pem,
        alipay_public_key=public_pem,
        alipay_seller_id=SELLER_ID,
        # smtp_ready 需要 host +（有用户名时有授权码）；真实发信已被 sent_mail 换掉。
        mail_mode="smtp",
        smtp_host="smtp.example.com",
        smtp_username="sender@example.com",
        smtp_password="secret",
    )
    app = make_app(settings)
    return app, private_pem, sent_mail


def _buy(app):
    account_id = create_account(app.state.database, email=BUYER)
    product_id = first_product(app.state.database)
    order_no, order_id = create_order(
        app.state.database,
        account_id=account_id,
        product_id=product_id,
        amount_cents=3990,
    )
    return order_no, order_id


def _notify_fields(order_no, amount_cents=3990):
    return {
        "out_trade_no": order_no,
        "trade_no": "2026092722001400000000000002",
        "trade_status": "TRADE_SUCCESS",
        "total_amount": f"{amount_cents / 100:.2f}",
        "app_id": APP_ID,
        "seller_id": SELLER_ID,
    }


def test_paid_order_mails_the_same_code_shown_in_account_center(store, make_client):
    app, private_pem, captured = store
    order_no, order_id = _buy(app)

    with make_client(app) as client:
        payload = sign_notify(_notify_fields(order_no), private_pem)
        assert client.post(NOTIFY, data=payload).text == "success"

        client.post("/store/v1/auth/login", json={"email": BUYER, "password": "pw123456"})
        center = client.get("/store/v1/account").json()
        code = center["licenses"][0]["activationCode"]

    # 恰好一封，且收件人是下单时冻结的邮箱。
    assert len(captured) == 1
    letter = captured[0]
    assert letter["email"] == BUYER
    # 同源：邮件正文里的激活码与个人中心显示的**逐字符相同**（纯文本与 HTML 都要）。
    assert code in letter["plain"]
    assert code in letter["rich"]
    assert order_no in letter["plain"]

    with app.state.database.session() as session:
        order = session.get(Order, order_id)
        assert order.license_email_sent_at is not None
        assert order.license_email_error == ""


def test_duplicate_notify_sends_only_one_letter(store, make_client):
    app, private_pem, captured = store
    order_no, _order_id = _buy(app)
    payload = sign_notify(_notify_fields(order_no), private_pem)

    with make_client(app) as client:
        assert client.post(NOTIFY, data=payload).text == "success"
        assert client.post(NOTIFY, data=payload).text == "success"

    assert len(captured) == 1


def test_delivery_failure_is_recorded_and_hides_nothing(store, make_client, monkeypatch):
    app, private_pem, _captured = store
    order_no, order_id = _buy(app)

    def failing_send(settings, *, email, subject, plain, rich):
        return False, 1, "SMTPAuthenticationError: 授权码不对"

    monkeypatch.setattr(mailer_module, "_send_smtp", failing_send)

    with make_client(app) as client:
        payload = sign_notify(_notify_fields(order_no), private_pem)
        assert client.post(NOTIFY, data=payload).text == "success"
        # 邮件失败**不影响**授权与个人中心。
        client.post("/store/v1/auth/login", json={"email": BUYER, "password": "pw123456"})
        assert client.get("/store/v1/account").json()["licenses"][0]["activationCode"]

    with app.state.database.session() as session:
        order = session.get(Order, order_id)
        assert order.status == "fulfilled"
        assert order.license_email_sent_at is None
        assert "SMTPAuthenticationError" in order.license_email_error
        assert session.query(License).count() == 1


def test_resend_endpoint_delivers_again(store, make_client):
    app, private_pem, captured = store
    order_no, _order_id = _buy(app)

    with make_client(app) as client:
        payload = sign_notify(_notify_fields(order_no), private_pem)
        assert client.post(NOTIFY, data=payload).text == "success"
        client.post("/store/v1/auth/login", json={"email": BUYER, "password": "pw123456"})
        license_id = client.get("/store/v1/account").json()["licenses"][0]["activationCodeId"]

        response = client.post(f"/store/v1/account/licenses/{license_id}/email")
        assert response.status_code == 200, response.text
        assert response.json()["sent"] is True
        assert response.json()["email"] == BUYER

    assert len(captured) == 2


def test_resend_is_rate_limited(store, make_client):
    app, private_pem, _captured = store
    order_no, _order_id = _buy(app)

    with make_client(app) as client:
        payload = sign_notify(_notify_fields(order_no), private_pem)
        assert client.post(NOTIFY, data=payload).text == "success"
        client.post("/store/v1/auth/login", json={"email": BUYER, "password": "pw123456"})
        license_id = client.get("/store/v1/account").json()["licenses"][0]["activationCodeId"]

        # 预算 5 次/小时：第 6 次必须被挡下。
        codes = [
            client.post(f"/store/v1/account/licenses/{license_id}/email").status_code
            for _ in range(6)
        ]
        assert codes[-1] == 429
        assert 429 not in codes[:5]


def test_site_switch_disables_delivery_but_keeps_license(store, make_client):
    app, private_pem, captured = store
    with app.state.database.session() as session:
        site_config.update_setting(session, delivery_email_enabled=False)

    order_no, order_id = _buy(app)
    with make_client(app) as client:
        payload = sign_notify(_notify_fields(order_no), private_pem)
        assert client.post(NOTIFY, data=payload).text == "success"

    assert captured == []
    with app.state.database.session() as session:
        assert session.get(Order, order_id).status == "fulfilled"
        assert session.query(License).count() == 1
