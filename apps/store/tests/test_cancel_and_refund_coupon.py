"""取消关单按订单渠道执行；全额退款归还优惠码名额。"""

from __future__ import annotations

import pytest
from sqlalchemy import select

from apps.store.commerce import coupons
from apps.store.core.models import Coupon, CouponRedemption, Order
from apps.store.ops import site_settings as site_config
from apps.store.payments.base import CloseResult
from apps.store.tests.support import create_account, create_order, first_product

BUYER = "buyer-cancel@example.com"
ADMIN = "admin-cancel@example.com"


class _RecordingProvider:
    def __init__(self, name: str):
        self.name = name
        self.closed_orders: list[str] = []

    def close_payment(self, settings, order):
        self.closed_orders.append(order.order_no)
        return CloseResult(closed=True)


@pytest.fixture
def both_channels(make_settings, make_app, merchant_keys, platform_keys):
    merchant_private, merchant_public = merchant_keys
    _platform_private, platform_public = platform_keys
    settings = make_settings(
        payment_provider="alipay",
        alipay_app_id="2021000000000000",
        alipay_seller_id="2088000000000000",
        alipay_app_private_key=merchant_private,
        alipay_public_key=merchant_public,
        wechat_mch_id="1900000001",
        wechat_app_id="wx1234567890abcdef",
        wechat_api_v3_key="0123456789abcdef0123456789abcdef",
        wechat_merchant_private_key=merchant_private,
        wechat_merchant_serial_no="49B1C2D3E4F5A6B7",
        wechat_platform_public_key=platform_public,
        mail_mode="log",
    )
    app = make_app(settings)
    with app.state.database.session() as session:
        site_config.update_setting(session, payment_channels_json='["alipay","wechat"]')
    return app


def test_cancel_closes_wechat_when_order_channel_is_wechat(
    both_channels, make_client, monkeypatch
) -> None:
    app = both_channels
    account_id = create_account(app.state.database, email=BUYER)
    product_id = first_product(app.state.database)
    order_no, _order_id = create_order(
        app.state.database,
        account_id=account_id,
        product_id=product_id,
        provider="wechat",
    )
    provider = _RecordingProvider("wechat")
    monkeypatch.setattr(
        app.state,
        "resolve_payment_provider",
        lambda setting=None, *, name=None: provider if name == "wechat" else _RecordingProvider(name or "alipay"),
    )

    with make_client(app) as client:
        login = client.post(
            "/store/v1/auth/login", json={"email": BUYER, "password": "pw123456"}
        )
        assert login.status_code == 200, login.text
        response = client.post(f"/store/v1/orders/{order_no}/cancel")
        assert response.status_code == 200, response.text
        assert response.json()["status"] == "cancelled"

    assert provider.closed_orders == [order_no]


def test_cancel_uses_order_channel_not_site_default(
    both_channels, make_client, monkeypatch
) -> None:
    """站点默认支付宝时，微信订单取消仍必须关微信。"""
    app = both_channels
    account_id = create_account(app.state.database, email=BUYER)
    product_id = first_product(app.state.database)
    order_no, _order_id = create_order(
        app.state.database,
        account_id=account_id,
        product_id=product_id,
        provider="wechat",
    )
    seen: list[str | None] = []
    wechat = _RecordingProvider("wechat")
    alipay = _RecordingProvider("alipay")

    def resolve(setting=None, *, name=None):
        seen.append(name)
        return wechat if name == "wechat" else alipay

    monkeypatch.setattr(app.state, "resolve_payment_provider", resolve)

    with make_client(app) as client:
        login = client.post(
            "/store/v1/auth/login", json={"email": BUYER, "password": "pw123456"}
        )
        assert login.status_code == 200, login.text
        response = client.post(f"/store/v1/orders/{order_no}/cancel")
        assert response.status_code == 200, response.text

    assert seen == ["wechat"]
    assert wechat.closed_orders == [order_no]
    assert alipay.closed_orders == []


def test_full_refund_reclaims_coupon_redeemed_count(make_settings, make_app, make_client) -> None:
    settings = make_settings(payment_provider="alipay", mail_mode="log")
    app = make_app(settings)
    account_id = create_account(app.state.database, email=BUYER)
    create_account(app.state.database, email=ADMIN, admin=True)
    product_id = first_product(app.state.database)

    with app.state.database.session() as session:
        coupon = Coupon(
            code="SAVE10",
            discount_type="fixed",
            amount_cents=100,
            max_redemptions=1,
            redeemed_count=0,
            active=True,
        )
        session.add(coupon)
        session.flush()
        coupon_id = coupon.id

    order_no, order_id = create_order(
        app.state.database,
        account_id=account_id,
        product_id=product_id,
        provider="alipay",
        status="paid",
        amount_cents=3890,
    )
    with app.state.database.session() as session:
        order = session.get(Order, order_id)
        assert order is not None
        order.coupon_code = "SAVE10"
        order.discount_cents = 100
        session.add(
            CouponRedemption(
                coupon_id=coupon_id,
                order_id=order.id,
                account_id=account_id,
                discount_cents=100,
            )
        )
        session.flush()
        coupons.recount_coupon_slots(session, coupon_id)
        coupon = session.get(Coupon, coupon_id)
        assert coupon is not None and coupon.redeemed_count == 1

    with make_client(app) as client:
        login = client.post(
            "/store/v1/auth/login", json={"email": ADMIN, "password": "pw123456"}
        )
        assert login.status_code == 200, login.text
        response = client.post(
            f"/store-admin/v1/orders/{order_no}/refund",
            json={"offline": True, "note": "测试全额退款归还优惠码"},
        )
        assert response.status_code == 200, response.text
        assert response.json()["status"] == "refunded"

    with app.state.database.session() as session:
        coupon = session.get(Coupon, coupon_id)
        assert coupon is not None
        assert coupon.redeemed_count == 0
        record = session.scalars(
            select(CouponRedemption).where(CouponRedemption.order_id == order_id)
        ).first()
        assert record is not None
        assert record.voided_at is not None
