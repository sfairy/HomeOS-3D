"""订单履约：发放激活码、追加减量包、记邀请奖励。

无论支付渠道是模拟收银台还是真实支付宝，最终都汇聚到这里，
保证切换 provider 时履约行为完全一致。
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from store import referrals
from store.config import StoreSettings
from store.models import (
    Customer,
    Entitlement,
    License,
    Order,
    Product,
    StoreSetting,
)
from store.security import (
    activation_code_hint,
    new_activation_code,
    utcnow,
)
from store.serializers import json_list

logger = logging.getLogger("store.fulfill")


def _unique_activation_code(session: Session) -> str:
    for _ in range(32):
        candidate = new_activation_code()
        exists = session.scalars(
            select(License.id).where(License.activation_code == candidate)
        ).first()
        if exists is None:
            return candidate
    raise RuntimeError("无法生成唯一激活码。")


def create_license_for_order(
    session: Session,
    *,
    order: Order,
    product: Product,
    customer: Customer,
    now: datetime | None = None,
) -> License:
    moment = now or utcnow()
    code = _unique_activation_code(session)
    validity_days = product.validity_days
    license = License(
        activation_code=code,
        code_hint=activation_code_hint(code),
        customer_id=customer.id,
        account_id=order.account_id,
        product_id=product.id,
        order_id=order.id,
        product_name=product.name,
        product_type=product.product_type,
        price_cents=order.amount_cents,
        validity_days=validity_days,
        issuance_source="manual" if product.fulfillment_mode == "manual" else "payment_automatic",
        active=True,
        issued_at=moment,
        access_started_at=moment,
        access_expires_at=(
            moment + timedelta(days=int(validity_days)) if validity_days else None
        ),
    )
    session.add(license)
    session.flush()
    order.license_id = license.id
    return license


def apply_addon_to_license(
    session: Session,
    *,
    order: Order,
    product: Product,
    license: License,
    customer: Customer,
    now: datetime | None = None,
) -> int:
    """把增量包的功能码写成该授权上的权益，返回新增/更新的权益条数。"""
    moment = now or utcnow()
    validity_days = product.validity_days
    expires_at = (
        moment + timedelta(days=int(validity_days)) if validity_days else None
    )
    created = 0
    for feature_code in json_list(product.feature_codes_json):
        feature_code = str(feature_code)
        existing = session.scalars(
            select(Entitlement)
            .where(Entitlement.license_id == license.id)
            .where(Entitlement.feature_code == feature_code)
        ).first()
        if existing is not None:
            existing.active = True
            existing.product_id = product.id
            existing.product_name = product.name
            existing.product_type = product.product_type
            existing.starts_at = moment
            existing.expires_at = expires_at
        else:
            session.add(
                Entitlement(
                    customer_id=customer.id,
                    license_id=license.id,
                    product_id=product.id,
                    product_name=product.name,
                    product_type=product.product_type,
                    feature_code=feature_code,
                    active=True,
                    starts_at=moment,
                    expires_at=expires_at,
                )
            )
        created += 1
    # 追加购买视为续期：若授权本身有时限，一并延后
    if validity_days and license.access_expires_at is not None:
        license.access_expires_at = license.access_expires_at + timedelta(
            days=int(validity_days)
        )
    license.access_started_at = license.access_started_at or moment
    order.license_id = license.id
    session.flush()
    return created


def release_reserved_stock(session: Session, product: Product | None, quantity: int = 1) -> None:
    if product is None:
        return
    product.reserved_stock = max(0, int(product.reserved_stock or 0) - max(0, quantity))
    session.flush()


def reserve_stock(session: Session, product: Product, quantity: int = 1) -> None:
    product.reserved_stock = int(product.reserved_stock or 0) + max(0, quantity)
    session.flush()


def consume_stock(session: Session, product: Product | None, quantity: int = 1) -> None:
    """把已卖出的数量从 ``stock_quantity`` 里真正扣掉。

    库存口径：``available_stock = stock_quantity - reserved_stock``。

    ``stock_quantity`` 是**还剩多少件没卖出去**，不是"历史总发行量"；一件商品
    只有在履约那一刻才算真正卖出，所以扣减只能发生在这里：

      · 下单 → ``reserved_stock`` +1（available 立刻少 1）
      · 履约 → ``stock_quantity`` -1 且 ``reserved_stock`` -1（一进一出，available 不变）
      · 取消/超时/退款未发码 → ``reserved_stock`` -1（available 还回去）

    少了这一步的话，"下单占预留"与"履约释放预留"会互相抵消，available 永远
    回到原值——限量 1 件的商品可以无限次卖出。
    """
    if product is None or product.stock_quantity is None:
        return
    remaining = int(product.stock_quantity or 0) - max(0, quantity)
    if remaining < 0:
        # 只可能是"订单关掉后又被支付复活"这类越卖：预留早还回去了，货其实已超卖。
        # 夹到 0 让商品直接显示售罄，而不是露出一个负数库存。
        logger.warning(
            "商品 %s 库存不足，已按 0 计（说明存在超卖，请核对订单与预留）",
            product.id,
        )
        remaining = 0
    product.stock_quantity = remaining
    session.flush()


#: 真正持有库存预留的订单状态。``reserved_stock`` 只是这张表的缓存，
#: 真实依据是处于这两个状态的订单条数，见 ``recompute_reserved_stock``。
RESERVING_STATUSES = ("pending", "paid")


def recompute_reserved_stock(session: Session) -> dict[str, int]:
    """按订单表重算每个商品的 ``reserved_stock``，返回「商品 id → 修正量」。

    历史上「对已取消订单履约」会重复释放预留，把计数扣低并直接放开超卖；
    这里以订单表为准把缓存拉回真实值，用于自愈存量数据。
    """
    counted = {
        product_id: int(count or 0)
        for product_id, count in session.execute(
            select(Order.product_id, func.count(Order.id))
            .where(Order.status.in_(RESERVING_STATUSES))
            .group_by(Order.product_id)
        ).all()
    }
    changes: dict[str, int] = {}
    for product in session.scalars(select(Product)):
        expected = counted.get(product.id, 0)
        current = int(product.reserved_stock or 0)
        if current != expected:
            product.reserved_stock = expected
            changes[product.id] = expected - current
    session.flush()
    return changes


def fulfill_order(
    session: Session,
    *,
    order: Order,
    setting: StoreSetting,
    settings: StoreSettings | None = None,
    now: datetime | None = None,
    release_stock: bool = True,
) -> dict:
    """履约。幂等：已履约的订单直接返回。

    ``release_stock`` 由调用方**显式声明**「这张订单此刻是否还占着库存预留」。
    不能用订单状态反推：``settle_paid_order`` 会把 expired / cancelled /
    payment_failed 的订单复活成 paid 再履约（钱确实到账了），而这些状态在
    进入终态时预留早已释放。若此时再扣一次，扣掉的其实是**其它待支付订单**
    的预留，会把 ``reserved_stock`` 算低并直接放开超卖。
    """
    moment = now or utcnow()
    if order.status == "fulfilled":
        return {"alreadyFulfilled": True, "licenseId": order.license_id}
    if order.status == "refunded":
        # 退款已收回授权并退回奖励，重新履约等于凭空补一张码。这里是兜底，
        # 正常入口（admin / 支付宝结算）都会在更早的位置拒绝。
        raise RuntimeError(f"订单 {order.order_no} 已退款，不能重新履约。")

    product = session.get(Product, order.product_id) if order.product_id else None
    if product is None:
        raise RuntimeError(f"订单 {order.order_no} 对应的商品不存在。")

    customer = session.get(Customer, order.customer_id) if order.customer_id else None
    if customer is None:
        raise RuntimeError(f"订单 {order.order_no} 对应的客户不存在。")

    if order.license_action == "patch":
        license = session.get(License, order.target_license_id) if order.target_license_id else None
        if license is None:
            raise RuntimeError(f"订单 {order.order_no} 缺少可追加的目标授权。")
        apply_addon_to_license(
            session, order=order, product=product, license=license, customer=customer, now=moment
        )
    else:
        create_license_for_order(
            session, order=order, product=product, customer=customer, now=moment
        )

    order.status = "fulfilled"
    order.fulfilled_at = moment
    if release_stock:
        release_reserved_stock(session, product, 1)
    # 发码即售出：无论走哪条路径（正常支付 / 关单后复活补发），都要把这一件
    # 从 stock_quantity 里扣掉，否则"预留释放"会把可用量还回去，等于白送一件。
    consume_stock(session, product, 1)

    reward = referrals.grant_order_reward(
        session,
        order=order,
        rate_percent=float(setting.referral_rate_percent or 0.0),
        enabled=bool(setting.referral_enabled),
    )
    session.flush()

    logger.info(
        "订单已履约 order=%s type=%s license=%s reward=%s",
        order.order_no,
        order.order_type,
        order.license_id,
        reward,
    )
    return {
        "alreadyFulfilled": False,
        "licenseId": order.license_id,
        "referralRewardPoints": reward,
    }
