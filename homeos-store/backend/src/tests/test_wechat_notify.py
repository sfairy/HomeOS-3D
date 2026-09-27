"""微信支付回调 → 入账 → 发码 → 个人中心可见（与支付宝那条对称的端到端用例）。

回调报文是**真签名 + 真 AES-256-GCM 加密**的：只验签不解密、或只解密不验签的实现，
都会在这里挂掉。
"""

from __future__ import annotations

import base64
import json
import time

import pytest
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from src.core.models import License, Order
from src.payments import wechat_signing as signing
from src.tests.support import create_account, create_order, first_product

NOTIFY = "/store/v1/payments/wechat/notify"
MCH_ID = "1900000001"
APP_ID = "wx1234567890abcdef"
API_V3_KEY = "0123456789abcdef0123456789abcdef"
SERIAL_NO = "49B1C2D3E4F5A6B7"
BUYER = "buyer@example.com"


@pytest.fixture
def store(make_settings, make_app, make_client, merchant_keys, platform_keys):
    merchant_private, _merchant_public = merchant_keys
    _platform_private, platform_public = platform_keys
    settings = make_settings(
        payment_provider="wechat",
        wechat_mch_id=MCH_ID,
        wechat_app_id=APP_ID,
        wechat_api_v3_key=API_V3_KEY,
        wechat_merchant_private_key=merchant_private,
        wechat_merchant_serial_no=SERIAL_NO,
        wechat_platform_public_key=platform_public,
        mail_mode="log",
    )
    return make_app(settings), platform_keys[0]


def _notification(
    platform_private: str,
    order_no: str,
    *,
    total_cents: int = 3990,
    trade_state: str = "SUCCESS",
    mch_id: str = MCH_ID,
    app_id: str = APP_ID,
) -> tuple[dict, str]:
    """造一条与微信发出来的一模一样的通知：加密的 resource + 三行签名。"""
    payload = {
        "out_trade_no": order_no,
        "transaction_id": "4200001234202609271234567890",
        "trade_state": trade_state,
        "mchid": mch_id,
        "appid": app_id,
        "amount": {"total": total_cents, "payer_total": total_cents, "currency": "CNY"},
    }
    nonce = "abcdef123456"
    associated_data = "transaction"
    ciphertext = AESGCM(API_V3_KEY.encode("utf-8")).encrypt(
        nonce.encode("utf-8"),
        json.dumps(payload).encode("utf-8"),
        associated_data.encode("utf-8"),
    )
    body = json.dumps(
        {
            "id": "evt-1",
            "create_time": "2026-09-27T12:00:00+08:00",
            "event_type": "TRANSACTION.SUCCESS" if trade_state == "SUCCESS" else "TRANSACTION.CLOSED",
            "resource_type": "encrypt-resource",
            "resource": {
                "algorithm": "AEAD_AES_256_GCM",
                "ciphertext": base64.b64encode(ciphertext).decode("ascii"),
                "nonce": nonce,
                "associated_data": associated_data,
            },
        }
    )
    timestamp = str(int(time.time()))
    signature = signing.sign(
        signing.build_sign_message(timestamp=timestamp, nonce="N1", body=body), platform_private
    )
    headers = {
        "Wechatpay-Timestamp": timestamp,
        "Wechatpay-Nonce": "N1",
        "Wechatpay-Signature": signature,
        "Wechatpay-Serial": "PUB_KEY_ID_1",
        "Content-Type": "application/json",
    }
    return headers, body


def _setup_order(app, *, provider="wechat", amount_cents=3990):
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


def test_valid_notification_settles_and_shows_in_account_center(store, make_client):
    app, platform_private = store
    _account_id, order_no, order_id = _setup_order(app)
    headers, body = _notification(platform_private, order_no)

    with make_client(app) as client:
        response = client.post(NOTIFY, content=body, headers=headers)
        assert response.status_code == 200, response.text
        assert response.json()["code"] == "SUCCESS"

        login = client.post(
            "/store/v1/auth/login", json={"email": BUYER, "password": "pw123456"}
        )
        assert login.status_code == 200, login.text
        licenses = client.get("/store/v1/account").json()["licenses"]
        assert len(licenses) == 1
        code = licenses[0]["activationCode"]
        assert code.startswith("HOMEOS-")

    order = _order_row(app, order_id)
    assert order.status == "fulfilled"
    with app.state.database.session() as session:
        license_row = session.get(License, order.license_id)
        assert license_row.activation_code == code
        assert license_row.account_id == order.account_id


def test_duplicate_notification_issues_exactly_one_license(store, make_client):
    app, platform_private = store
    _account_id, order_no, _order_id = _setup_order(app)
    headers, body = _notification(platform_private, order_no)

    with make_client(app) as client:
        assert client.post(NOTIFY, content=body, headers=headers).json()["code"] == "SUCCESS"
        assert client.post(NOTIFY, content=body, headers=headers).json()["code"] == "SUCCESS"

    with app.state.database.session() as session:
        assert session.query(License).count() == 1


def test_amount_mismatch_is_rejected(store, make_client):
    """拿一笔 1 分钱的支付换一张授权 —— 唯一防线就是金额比对。"""
    app, platform_private = store
    _account_id, order_no, order_id = _setup_order(app)
    headers, body = _notification(platform_private, order_no, total_cents=1)

    with make_client(app) as client:
        response = client.post(NOTIFY, content=body, headers=headers)
        assert response.status_code == 400
        assert response.json()["code"] == "FAIL"

    assert _order_row(app, order_id).status == "pending"
    with app.state.database.session() as session:
        assert session.query(License).count() == 0


def test_tampered_body_is_rejected(store, make_client):
    app, platform_private = store
    _account_id, order_no, order_id = _setup_order(app)
    headers, body = _notification(platform_private, order_no)
    tampered = body.replace("evt-1", "evt-2")

    with make_client(app) as client:
        response = client.post(NOTIFY, content=tampered, headers=headers)
        assert response.status_code == 400
        assert "不可信" in response.json()["message"]

    assert _order_row(app, order_id).status == "pending"


def test_foreign_provider_order_is_refused(store, make_client):
    """验签通过但订单是走支付宝建的：绝不能拿微信的钱去结它。"""
    app, platform_private = store
    _account_id, order_no, order_id = _setup_order(app, provider="alipay")
    headers, body = _notification(platform_private, order_no)

    with make_client(app) as client:
        response = client.post(NOTIFY, content=body, headers=headers)
        assert response.status_code == 400
        assert "不是微信支付订单" in response.json()["message"]

    assert _order_row(app, order_id).status == "pending"


def test_closed_trade_releases_local_reservation(store, make_client):
    """渠道已终结（CLOSED）：本地也要收尾，否则名额一直被占着。"""
    app, platform_private = store
    _account_id, order_no, order_id = _setup_order(app)
    headers, body = _notification(platform_private, order_no, trade_state="CLOSED")

    with make_client(app) as client:
        response = client.post(NOTIFY, content=body, headers=headers)
        assert response.status_code == 200, response.text
        assert response.json()["code"] == "SUCCESS"

    order = _order_row(app, order_id)
    assert order.status == "expired"
    assert order.channel_closed_at is not None
    assert order.stock_reservation_released_at is not None


def test_waiting_payment_keeps_pending(store, make_client):
    """NOTPAY 是「顾客还没付」，绝不能动本地状态。"""
    app, platform_private = store
    _account_id, order_no, order_id = _setup_order(app)
    headers, body = _notification(platform_private, order_no, trade_state="NOTPAY")

    with make_client(app) as client:
        response = client.post(NOTIFY, content=body, headers=headers)
        assert response.status_code == 200
        assert response.json()["code"] == "SUCCESS"

    assert _order_row(app, order_id).status == "pending"


def test_wrong_mchid_is_rejected(store, make_client):
    """别的商户号推过来的（合法签名但不是我方的）：必须拒。"""
    app, platform_private = store
    _account_id, order_no, order_id = _setup_order(app)
    headers, body = _notification(platform_private, order_no, mch_id="1900009999")

    with make_client(app) as client:
        response = client.post(NOTIFY, content=body, headers=headers)
        assert response.status_code == 400
        assert "商户号不匹配" in response.json()["message"]

    assert _order_row(app, order_id).status == "pending"
