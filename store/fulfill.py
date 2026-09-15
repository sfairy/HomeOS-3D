"""订单履约：发放激活码、追加减量包、记邀请奖励。

无论支付渠道是模拟收银台还是真实支付宝，最终都汇聚到这里，
保证切换 provider 时履约行为完全一致。
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta

from sqlalchemy import func, or_, select, update
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
from store.order_status import RESERVING_STATUSES as RESERVING_STATUS_FROM_ORDER
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


def bundled_feature_codes(session: Session, product: Product) -> list[str]:
    """套餐 ``included_product_ids`` 展开出的功能码。

    过去 ``included_product_ids`` 只被后台读来展示「套餐包含什么」，履约时
    **完全没有人发放它**：``create_license_for_order`` 只认商品自己的
    ``feature_codes``，``LicenseAuthority.features_for`` 也只读商品自己的功能码。
    于是运营在后台把三个商品的 id 填进套餐、却没把功能码再抄一遍，用户付款后
    什么也没拿到（甚至因为功能码为空，落进 ``REQUIRED_FEATURES_FALLBACK`` 的
    兜底分支，看起来「能用」但其实是走了失败放行）。

    这里把包含商品的功能码展开出来，由履约写入 ``Entitlement``，从而与增量包
    走同一套「权益叠加」机制。
    """
    included = [str(item) for item in json_list(product.included_product_ids_json)]
    if not included:
        return []
    own = {str(code) for code in json_list(product.feature_codes_json)}
    codes: list[str] = []
    for bundled in session.scalars(select(Product).where(Product.id.in_(included))):
        for code in json_list(bundled.feature_codes_json):
            text = str(code)
            if text and text not in own and text not in codes:
                codes.append(text)
    return codes


def grant_bundled_entitlements(
    session: Session,
    *,
    license: License,
    product: Product,
    customer: Customer,
    now: datetime | None = None,
) -> int:
    """把套餐包含商品的功能码写成该授权上的权益，返回新增条数。"""
    moment = now or utcnow()
    created = 0
    for feature_code in bundled_feature_codes(session, product):
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
            existing.expires_at = license.access_expires_at
            continue
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
                expires_at=license.access_expires_at,
            )
        )
        created += 1
    if created:
        session.flush()
    return created


def upgrade_license_in_place(
    session: Session,
    *,
    order: Order,
    product: Product,
    license: License,
    customer: Customer,
    now: datetime | None = None,
) -> License:
    """把一张有时限的授权就地升级为订单上的商品（通常是永久授权）。

    保留激活码与设备绑定，因此用户已配好的客户端不需要重新激活 —— 这正是
    「升级」与「再买一张新码」的区别。前台升级链接一直存在，但服务端从没消费
    过它，等于点了按钮只是又买了一张新授权。
    """
    moment = now or utcnow()
    validity_days = product.validity_days
    license.product_id = product.id
    license.product_name = product.name
    license.product_type = product.product_type
    license.price_cents = int(order.amount_cents or 0)
    license.validity_days = validity_days
    license.access_started_at = license.access_started_at or moment
    license.access_expires_at = (
        moment + timedelta(days=int(validity_days)) if validity_days else None
    )
    if license.issuance_source in {"payment_automatic", "payment_manual"}:
        license.issuance_source = "payment_automatic"
    order.license_id = license.id
    grant_bundled_entitlements(
        session, license=license, product=product, customer=customer, now=moment
    )
    session.flush()
    return license


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
    # 套餐包含的商品必须在这里落成权益，否则「套餐」只是一张价格牌。
    grant_bundled_entitlements(
        session, license=license, product=product, customer=customer, now=moment
    )
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
    """归还预留。SQL 原子递减并夹到 0，避免「读-改-写」丢更新或写出负数。"""
    if product is None:
        return
    amount = max(0, int(quantity))
    if not amount:
        return
    result = session.execute(
        update(Product)
        .where(Product.id == product.id)
        .where(func.coalesce(Product.reserved_stock, 0) >= amount)
        .values(reserved_stock=Product.reserved_stock - amount)
        .execution_options(synchronize_session=False)
    )
    if result.rowcount == 0:
        # 预留本来就是 0：只可能是「同一次预留被归还了两次」（例如订单已被
        # _expire_stale_orders 归还，后续取消/退款路径又归还一次）。负数预留会
        # 让 available = stock - reserved 虚高，直接放开超卖，所以这里夹到 0
        # 并留一条告警 —— 不报错，但必须能被发现。
        clamped = session.execute(
            update(Product)
            .where(Product.id == product.id)
            .where(func.coalesce(Product.reserved_stock, 0) != 0)
            .values(reserved_stock=0)
            .execution_options(synchronize_session=False)
        )
        if clamped.rowcount:
            logger.warning("商品 %s 的预留已被归还过，已夹到 0（请核对订单状态）", product.id)
    session.expire(product, ["reserved_stock"])
    session.flush()


def reserve_stock(session: Session, product: Product, quantity: int = 1) -> bool:
    """占用预留。返回是否成功（库存不足时返回 False 且不做任何改动）。

    这里必须是「带条件的原子 UPDATE」而不是 ``product.reserved_stock += 1``：
    下单流程在更早的位置读了一次 ``soldOut``，两个并发请求会**同时通过那次检查**，
    然后各自基于同一份旧值写入 —— 限量 1 件的商品被卖出两份。把判断和自增放进
    同一条 UPDATE，由数据库保证只有一条能改到行。
    """
    amount = max(0, int(quantity))
    if not amount:
        return True
    statement = (
        update(Product)
        .where(Product.id == product.id)
        .values(reserved_stock=func.coalesce(Product.reserved_stock, 0) + amount)
        .execution_options(synchronize_session=False)
    )
    # stock_quantity 为 NULL 表示不限量，无需判可用量。
    statement = statement.where(
        or_(
            Product.stock_quantity.is_(None),
            func.coalesce(Product.stock_quantity, 0)
            - func.coalesce(Product.reserved_stock, 0)
            >= amount,
        )
    )
    result = session.execute(statement)
    session.expire(product, ["reserved_stock"])
    session.flush()
    return result.rowcount > 0


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
    amount = max(0, int(quantity))
    if not amount:
        return
    result = session.execute(
        update(Product)
        .where(Product.id == product.id)
        .where(Product.stock_quantity >= amount)
        .values(stock_quantity=Product.stock_quantity - amount)
        .execution_options(synchronize_session=False)
    )
    if result.rowcount == 0:
        # 只可能是"订单关掉后又被支付复活"这类越卖：预留早还回去了，货其实已超卖。
        # 夹到 0 让商品直接显示售罄，而不是露出一个负数库存。
        session.execute(
            update(Product)
            .where(Product.id == product.id)
            .where(Product.stock_quantity != 0)
            .values(stock_quantity=0)
            .execution_options(synchronize_session=False)
        )
        logger.warning(
            "商品 %s 库存不足，已按 0 计（说明存在超卖，请核对订单与预留）",
            product.id,
        )
    session.expire(product, ["stock_quantity"])
    session.flush()


#: 真正持有库存预留的订单状态。``reserved_stock`` 只是这张表的缓存，
#: 真实依据是处于这两个状态的订单条数，见 ``recompute_reserved_stock``。
RESERVING_STATUSES = RESERVING_STATUS_FROM_ORDER


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
    if order.status == "fulfilled" or order.fulfilled_at is not None:
        return {"alreadyFulfilled": True, "licenseId": order.license_id}
    if order.status == "refunded":
        # 退款已收回授权并退回奖励，重新履约等于凭空补一张码。这里是兜底，
        # 正常入口（admin / 支付宝结算）都会在更早的位置拒绝。
        raise RuntimeError(f"订单 {order.order_no} 已退款，不能重新履约。")

    # 并发幂等闸门：把「订单是否已履约」的判断与标记合并成一条带条件的 UPDATE。
    # 只靠上面的 ``order.status == "fulfilled"`` 读判断挡不住并发 —— 支付宝会
    # 重复推送通知，查单又可能同时到达，两个线程各自读到「未履约」就会重复发码
    # （重复的激活码会一起写进库里）。谁把 fulfilled_at 从 NULL 改掉谁履约。
    claimed = session.execute(
        update(Order)
        .where(Order.id == order.id)
        .where(Order.fulfilled_at.is_(None))
        .where(Order.status != "refunded")
        .values(fulfilled_at=moment)
        .execution_options(synchronize_session=False)
    )
    if claimed.rowcount == 0:
        session.refresh(order)
        if order.status == "refunded":
            raise RuntimeError(f"订单 {order.order_no} 已退款，不能重新履约。")
        return {"alreadyFulfilled": True, "licenseId": order.license_id}
    session.refresh(order)

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
    elif order.license_action == "upgrade":
        license = session.get(License, order.target_license_id) if order.target_license_id else None
        if license is None:
            raise RuntimeError(f"订单 {order.order_no} 缺少可升级的目标授权。")
        upgrade_license_in_place(
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
