"""支付宝异步通知 → 自动发码 → 个人中心可见（需求 A 的回归保护）。

这些用例刻意用**真 RSA2 密钥**签名，而不是打桩验签：验签、金额比对、渠道归属、
幂等这几条只有走完整路径才有意义。
"""

from __future__ import annotations

import pytest

from src.core.models import License, Order
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
def store(make_settings, make_app, make_client, alipay_keys):
    private_pem, public_pem = alipay_keys
    settings = make_settings(
        payment_provider="alipay",
        alipay_app_id=APP_ID,
        alipay_app_private_key=private_pem,
        alipay_public_key=public_pem,
        alipay_seller_id=SELLER_ID,
        mail_mode="log",
    )
    app = make_app(settings)
    return app, private_pem


def _notify_fields(
    order_no,
    *,
    amount_cents,
    trade_status="TRADE_SUCCESS",
    app_id=APP_ID,
    seller_id=SELLER_ID,
) -> dict:
    return {
        "out_trade_no": order_no,
        "trade_no": "2026092722001400000000000001",
        "trade_status": trade_status,
        "total_amount": f"{amount_cents / 100:.2f}",
        "app_id": app_id,
        "seller_id": seller_id,
        "gmt_create": "2026-09-27 12:00:00",
    }


def _setup_order(app, *, provider="alipay", amount_cents=3990):
    account_id = create_account(app.state.database, email=BUYER)
    product_id = first_product(app.state.database)
    order_no, order_id = create_order(
        app.state.database,
        account_id=account_id,
        product_id=product_id,
        provider=provider,
        amount_cents=amount_cents,
    )
    return account_id, order_no, order_id


def _order_row(app, order_id) -> Order:
    with app.state.database.session() as session:
        return session.get(Order, order_id)


def test_valid_notify_issues_license_visible_in_account_center(store, make_client):
    app, private_pem = store
    _account_id, order_no, order_id = _setup_order(app)

    with make_client(app) as client:
        response = client.post(
            NOTIFY, data=sign_notify(_notify_fields(order_no, amount_cents=3990), private_pem)
        )
        assert response.status_code == 200
        assert response.text == "success"

        # 需求 A：付款后个人中心**立刻**能看到激活码。
        login = client.post(
            "/store/v1/auth/login", json={"email": BUYER, "password": "pw123456"}
        )
        assert login.status_code == 200, login.text
        center = client.get("/store/v1/account")
        assert center.status_code == 200, center.text
        licenses = center.json()["licenses"]
        assert len(licenses) == 1
        code = licenses[0]["activationCode"]
        assert code and code.startswith("HOMEOS-")

    order = _order_row(app, order_id)
    assert order.status == "fulfilled"
    assert order.license_id is not None
    with app.state.database.session() as session:
        license_row = session.get(License, order.license_id)
        assert license_row.activation_code == code
        assert license_row.account_id == order.account_id


def test_duplicate_notify_issues_exactly_one_license(store, make_client):
    app, private_pem = store
    _account_id, order_no, order_id = _setup_order(app)
    payload = sign_notify(_notify_fields(order_no, amount_cents=3990), private_pem)

    with make_client(app) as client:
        assert client.post(NOTIFY, data=payload).text == "success"
        assert client.post(NOTIFY, data=payload).text == "success"

    with app.state.database.session() as session:
        assert session.query(License).count() == 1


def test_amount_mismatch_is_rejected(store, make_client):
    app, private_pem = store
    _account_id, order_no, order_id = _setup_order(app)

    with make_client(app) as client:
        payload = sign_notify(_notify_fields(order_no, amount_cents=1), private_pem)
        response = client.post(NOTIFY, data=payload)
        assert response.status_code == 200
        assert response.text == "failure"

    assert _order_row(app, order_id).status == "pending"
    with app.state.database.session() as session:
        assert session.query(License).count() == 0


def test_tampered_signature_is_rejected(store, make_client):
    app, _private_pem = store
    _account_id, order_no, order_id = _setup_order(app)

    with make_client(app) as client:
        payload = _notify_fields(order_no, amount_cents=3990)
        payload["sign"] = "aW52YWxpZA=="
        response = client.post(NOTIFY, data=payload)
        assert response.status_code == 200
        assert response.text == "failure"

    assert _order_row(app, order_id).status == "pending"


def test_unparseable_public_key_returns_plain_failure_not_500(make_settings, make_app, make_client):
    """公钥填错时**必须**回纯文本 failure。

    以前它会抛 PaymentError 逃出验签函数，端点返回 HTTP 500 JSON —— 支付宝看到的
    是「商户故障」，于是重推数小时，而订单永远停在待支付。
    """
    settings = make_settings(
        payment_provider="alipay",
        alipay_app_id=APP_ID,
        alipay_app_private_key="not-a-private-key",
        alipay_public_key="not-a-public-key",
        alipay_seller_id=SELLER_ID,
        mail_mode="log",
    )
    app = make_app(settings)
    _account_id, order_no, _order_id = _setup_order(app)

    with make_client(app) as client:
        response = client.post(NOTIFY, data=_notify_fields(order_no, amount_cents=3990))
        assert response.status_code == 200
        assert response.text == "failure"


def test_closed_trade_releases_local_reservation(store, make_client):
    """渠道已关单（TRADE_CLOSED）时，本地订单也必须收尾。

    只回 success 而不动本地状态的话，这笔单会一直占着库存预留与优惠码名额，
    直到本地 TTL 或巡检才回收。
    """
    app, private_pem = store
    _account_id, order_no, order_id = _setup_order(app)

    with make_client(app) as client:
        payload = sign_notify(
            _notify_fields(order_no, amount_cents=3990, trade_status="TRADE_CLOSED"),
            private_pem,
        )
        response = client.post(NOTIFY, data=payload)
        assert response.status_code == 200
        assert response.text == "success"

    order = _order_row(app, order_id)
    assert order.status == "expired"
    assert order.channel_closed_at is not None
    assert order.stock_reservation_released_at is not None


def test_foreign_provider_order_is_refused(store, make_client):
    """验签通过但订单不是走支付宝建的：绝不能拿这笔钱去结它。"""
    app, private_pem = store
    # manual（人工线下收款）代表「非支付宝渠道」：mock 渠道已整块删除。
    _account_id, order_no, order_id = _setup_order(app, provider="manual")

    with make_client(app) as client:
        payload = sign_notify(_notify_fields(order_no, amount_cents=3990), private_pem)
        response = client.post(NOTIFY, data=payload)
        assert response.status_code == 200
        assert response.text == "failure"

    assert _order_row(app, order_id).status == "pending"
