"""发码一致性守则的回归测试：退款精确撤销、营销副作用不阻塞发码、漏配商品不发码。"""

from __future__ import annotations

import json

import pytest

from src.commerce import fulfill, referrals
from src.core.models import Account, Entitlement, License, Order, Product
from src.security.security import new_activation_code, utcnow
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
FEATURE = "module.3d_interaction"


@pytest.fixture
def store(make_settings, make_app, alipay_keys):
    private_pem, public_pem = alipay_keys
    settings = make_settings(
        payment_provider="alipay",
        alipay_app_id=APP_ID,
        alipay_app_private_key=private_pem,
        alipay_public_key=public_pem,
        alipay_seller_id=SELLER_ID,
        mail_mode="log",
    )
    return make_app(settings), private_pem


def _addon_product(session) -> Product:
    product = Product(
        name="3D 增量包",
        product_code="homeos",
        product_type="module",
        price_cents=3990,
        feature_codes_json=json.dumps([FEATURE]),
        active=True,
        fulfillment_mode="automatic",
        requires_license=True,
    )
    session.add(product)
    session.flush()
    return product






def test_paid_upgrade_flips_manual_license_to_payment_source(make_settings, make_app):
    """付费升级后，原本「后台手动发放」的授权来源要变成「支付自动」。

    这段判据曾经拿 "payment_manual" 比较 —— 而库里只存在 "manual" 与
    "payment_automatic" 两个值，于是整段空转：前台会一直显示「该授权由后台手动发放，
    因此没有支付订单」，可订单就在那里。字符串判据不会被类型系统拦住，所以必须有测试。
    """
    app = make_app(make_settings(mail_mode="log"))
    database = app.state.database
    account_id = create_account(database, email="upgrade@example.com")
    product_id = first_product(database)

    with database.session() as session:
        account = session.get(Account, account_id)
        license_row = License(
            activation_code=new_activation_code(),
            code_hint="hint",
            customer_id=account.customer.id,
            account_id=account.id,
            product_id=product_id,
            product_name="后台手动发的授权",
            product_type="base",
            issuance_source="manual",
            active=True,
            issued_at=utcnow(),
            access_started_at=utcnow(),
        )
        session.add(license_row)
        session.flush()
        license_id = license_row.id

    _order_no, order_id = create_order(
        database, account_id=account_id, product_id=product_id, provider="manual", status="fulfilled"
    )

    with database.session() as session:
        order = session.get(Order, order_id)
        product = session.get(Product, product_id)
        license_row = session.get(License, license_id)
        order.license_id = license_row.id
        fulfill.upgrade_license_in_place(
            session,
            order=order,
            product=product,
            license=license_row,
            customer=session.get(Account, account_id).customer,
        )

    with database.session() as session:
        assert session.get(License, license_id).issuance_source == "payment_automatic"
def test_fulfillment_failure_appends_to_existing_review_note(make_settings, make_app):
    """履约失败只在复核备注后**追加**，不覆盖复活单的「可能超卖」警示。

    复活单（订单过期后才收到支付）在入账那一步写过一条需要人工核对库存的警示。
    用一句「履约失败」把它盖掉，运营就再也看不到那一单可能超卖了。
    """
    from src.payments.settlement import _mark_fulfillment_failed

    app = make_app(make_settings(mail_mode="log"))
    database = app.state.database
    account_id = create_account(database, email="revived@example.com")
    product_id = first_product(database)
    _order_no, order_id = create_order(
        database, account_id=account_id, product_id=product_id, provider="alipay", status="paid"
    )

    with database.session() as session:
        session.get(Order, order_id).review_note = (
            "订单过期后才收到支付（alipay.notify），库存预留此前已释放，请核对是否需要补货或退款。"
        )

    with database.session() as session:
        _mark_fulfillment_failed(
            session, order_id=order_id, error=RuntimeError("商品没有配置任何功能码")
        )

    with database.session() as session:
        order = session.get(Order, order_id)
        assert order.status == "fulfillment_failed"
        assert "库存预留此前已释放" in order.review_note
        assert "履约失败" in order.review_note
        assert len(order.review_note) <= 255
def test_refunding_second_addon_keeps_the_first_entitlement(make_settings, make_app):
    """同一主授权上买两次同一增量包：退掉后一单不能收回前一单买下的权益。

    权益行按 (license_id, feature_code) 唯一，两次购买写的是**同一行**；只按
    (product_id, license_id) 撤销会让退第二单误杀第一单（仍然有效）花钱买的权益。
    """
    app = make_app(make_settings(mail_mode="log"))
    database = app.state.database
    account_id = create_account(database, email="addon@example.com")
    base_product_id = first_product(database)

    # 第一段事务：建增量包商品与主授权，并提交（后面 create_order 用的是新会话）。
    with database.session() as session:
        account = session.get(Account, account_id)
        product = _addon_product(session)
        license_row = License(
            activation_code=new_activation_code(),
            code_hint="hint",
            customer_id=account.customer.id,
            account_id=account.id,
            product_id=base_product_id,
            product_name="主授权",
            product_type="base",
            active=True,
            issued_at=utcnow(),
            access_started_at=utcnow(),
        )
        session.add(license_row)
        session.flush()
        product_id = product.id
        license_id = license_row.id

    order_ids = [
        create_order(
            database,
            account_id=account_id,
            product_id=product_id,
            provider="manual",
            status="fulfilled",
        )[1]
        for _ in range(2)
    ]

    # 第二段事务：两笔订单各追加一次同一增量包，写的都是同一行权益。
    with database.session() as session:
        license_row = session.get(License, license_id)
        product = session.get(Product, product_id)
        customer = session.get(Account, account_id).customer
        first = session.get(Order, order_ids[0])
        second = session.get(Order, order_ids[1])
        first.license_id = license_row.id
        second.license_id = license_row.id
        for order in (first, second):
            fulfill.apply_addon_to_license(
                session, order=order, product=product, license=license_row, customer=customer
            )
        session.flush()
        entitlement = session.query(Entitlement).filter_by(
            license_id=license_id, feature_code=FEATURE
        ).one()
        assert entitlement.active is True

        # 退第二单：还有第一单在给它付款，权益必须留着。
        assert fulfill.revert_license_change(session, order=second, license=license_row) is True
        session.flush()
        assert entitlement.active is True

        # 再把第一单也退掉：这时没人付款了，权益才收回。
        first.status = "refunded"
        second.status = "refunded"
        session.flush()
        assert fulfill.revert_license_change(session, order=first, license=license_row) is True
        session.flush()
        assert entitlement.active is False


def test_referral_failure_does_not_block_license_issuance(store, make_client, monkeypatch):
    """邀请奖励失败不能把订单打成发货失败 —— 营销副作用不该拖垮发码。"""
    app, private_pem = store
    account_id = create_account(app.state.database, email=BUYER)
    product_id = first_product(app.state.database)
    order_no, order_id = create_order(
        app.state.database, account_id=account_id, product_id=product_id, amount_cents=3990
    )

    def exploding_reward(*args, **kwargs):
        raise RuntimeError("钱包写入失败")

    monkeypatch.setattr(referrals, "grant_order_reward", exploding_reward)

    with make_client(app) as client:
        payload = sign_notify(
            {
                "out_trade_no": order_no,
                "trade_no": "2026092722001400000000000003",
                "trade_status": "TRADE_SUCCESS",
                "total_amount": "39.90",
                "app_id": APP_ID,
                "seller_id": SELLER_ID,
            },
            private_pem,
        )
        assert client.post(NOTIFY, data=payload).text == "success"

    with app.state.database.session() as session:
        order = session.get(Order, order_id)
        assert order.status == "fulfilled"
        assert order.license_id is not None
        assert session.query(License).count() == 1


def test_product_without_feature_codes_is_not_issued(store, make_client):
    """漏配功能码的商品不能签出授权：那样买家付了钱也激活不了。"""
    app, private_pem = store
    account_id = create_account(app.state.database, email=BUYER)

    with app.state.database.session() as session:
        broken = Product(
            name="漏配功能码的商品",
            product_code="homeos",
            product_type="base",
            price_cents=3990,
            feature_codes_json="[]",
            included_product_ids_json="[]",
            active=True,
            fulfillment_mode="automatic",
        )
        session.add(broken)
        session.flush()
        broken_id = broken.id

    order_no, order_id = create_order(
        app.state.database, account_id=account_id, product_id=broken_id, amount_cents=3990
    )

    with make_client(app) as client:
        payload = sign_notify(
            {
                "out_trade_no": order_no,
                "trade_no": "2026092722001400000000000004",
                "trade_status": "TRADE_SUCCESS",
                "total_amount": "39.90",
                "app_id": APP_ID,
                "seller_id": SELLER_ID,
            },
            private_pem,
        )
        # 对支付宝必须回 success（钱确实收到了），但本地要留下可运营的状态。
        assert client.post(NOTIFY, data=payload).text == "success"

    with app.state.database.session() as session:
        order = session.get(Order, order_id)
        assert order.status == "fulfillment_failed"
        assert order.needs_review is True
        assert "功能码" in (order.review_note or "")
        assert session.query(License).count() == 0
