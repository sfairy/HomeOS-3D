"""订单履约：发放激活码、追加减量包、记邀请奖励。
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta

from sqlalchemy import func, or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..commerce import coupons, referrals
from ..commerce.order_status import RESERVING_STATUSES as RESERVING_STATUS_FROM_ORDER
from ..config import StoreSettings
from ..core.models import (
    Customer,
    Entitlement,
    License,
    Order,
    Product,
    StoreSetting,
)
from ..core.serializers import json_list, list_json
from ..ops import incidents
from ..security.security import (
    activation_code_hint,
    new_activation_code,
    utcnow,
)

logger = logging.getLogger("src.commerce.fulfill")


_LICENSE_SNAPSHOT_FIELDS = (
    "product_id",
    "product_name",
    "product_type",
    "price_cents",
    "validity_days",
    "issuance_source",
    "access_started_at",
)

_LICENSE_MOMENT_FIELDS = frozenset({"access_started_at", "access_expires_at"})


def _snapshot_license(license: License) -> str:
    """把一张授权的可还原字段序列化成 JSON（时间统一用 ISO 字符串）。"""
    payload: dict[str, object] = {}
    for field in _LICENSE_SNAPSHOT_FIELDS:
        value = getattr(license, field)
        payload[field] = value.isoformat() if isinstance(value, datetime) else value
    payload["access_expires_at"] = (
        license.access_expires_at.isoformat() if license.access_expires_at else None
    )
    return json.dumps(payload, ensure_ascii=False)


def _capture_license_state(session: Session, order: Order, license: License) -> None:
    """首次改动这张授权时留下快照。**幂等**：已经拍过就不覆盖。
    """
    if (order.license_state_before_json or "").strip():
        return
    order.license_state_before_json = _snapshot_license(license)


def _parse_moment(value: object) -> datetime | None:
    if not value or not isinstance(value, str):
        return None
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        return None


def has_other_live_grant(
    session: Session, *, order: Order, license_id: str | None, product_id: str | None
) -> bool:
    """除了这张订单，还有别的**仍然有效**的订单也在给同一个商品付款吗？

    权益行按 (license_id, feature_code) 唯一，所以「谁拥有它」这类归属字段天然只能存
    一个 —— 同一主授权上重复购买同一增量包时，后一次购买会把归属改写成自己。因此
    退款时不能只看归属或只看 (product_id, license_id)：那张行仍然在被另一笔依然有效
    的订单付款。判据只能是「还有没有别的活着的授予订单」。
    """
    if not product_id:
        return False
    return (
        session.scalars(
            select(Order.id)
            .where(Order.id != order.id)
            .where(Order.license_id == license_id)
            .where(Order.product_id == product_id)
            .where(Order.status == "fulfilled")
            .limit(1)
        ).first()
        is not None
    )

def revert_license_change(session: Session, *, order: Order, license: License) -> bool:
    """把升级 / 增量包改过的授权还原成快照里的样子。返回是否真的还原过。
    """
    snapshot = json.loads(order.license_state_before_json or "{}")
    if not isinstance(snapshot, dict) or not snapshot:
        return False

    for entitlement in session.scalars(
        select(Entitlement).where(Entitlement.license_id == license.id)
    ):
        if entitlement.product_id != order.product_id:
            continue
        if has_other_live_grant(
            session, order=order, license_id=license.id, product_id=order.product_id
        ):
            continue
        entitlement.active = False

    for field in (*_LICENSE_SNAPSHOT_FIELDS, "access_expires_at"):
        if field not in snapshot:
            continue
        value = snapshot[field]
        if field in _LICENSE_MOMENT_FIELDS:
            value = _parse_moment(value)
        setattr(license, field, value)

    restored = session.get(Product, license.product_id) if license.product_id else None
    if (
        restored is not None
        and restored.id != order.product_id
        and bundled_feature_codes(session, restored)
    ):
        customer = session.get(Customer, license.customer_id) if license.customer_id else None
        if customer is not None:
            grant_bundled_entitlements(
                session, license=license, product=restored, customer=customer
            )

    logger.warning(
        "订单 %s 退款：已把授权 %s 还原为升级前的状态（%s）",
        order.order_no,
        license.code_hint or license.id,
        snapshot.get("product_name") or snapshot.get("product_id"),
    )
    session.flush()
    return True


def _unique_activation_code(session: Session) -> str:
    for _ in range(32):
        candidate = new_activation_code()
        exists = session.scalars(
            select(License.id).where(License.activation_code == candidate)
        ).first()
        if exists is None:
            return candidate
    raise RuntimeError("无法生成唯一激活码。")


def _is_activation_code_collision(
    session: Session, *, code: str, error: IntegrityError
) -> bool:
    """这个 IntegrityError 是不是「激活码撞了唯一约束」。

    先认驱动文案（便宜且足够准），认不出来就**回查**这个码是不是已经存在。
    只嗅探文案是脆的：约束被改名、换了方言、或驱动换了措辞，一次本该重试的碰撞就会
    变成一次 fulfillment_failed —— 钱收了、码没发、等人工。而 96 位随机码撞车本身
    几乎不可能，所以这条路径平时根本不跑，坏了也没人会立刻发现。
    """
    text = str(getattr(error, "orig", error)).upper()
    if "ACTIVATION_CODE" in text:
        return True
    return (
        session.scalars(
            select(License.id).where(License.activation_code == code)
        ).first()
        is not None
    )


def insert_license_with_unique_code(
    session: Session, build, *, attempts: int = 8
) -> License:
    """插入一行授权，激活码撞唯一约束就换一个码重试。
    """
    for _ in range(attempts):
        code = _unique_activation_code(session)
        savepoint = session.begin_nested()
        try:
            license = build(code)
            session.add(license)
            session.flush()
        except IntegrityError as error:
            savepoint.rollback()
            if not _is_activation_code_collision(session, code=code, error=error):
                raise
            logger.warning(
                "激活码 %s 撞上唯一约束，换一个码重试", activation_code_hint(code)
            )
            continue
        else:
            if license.id is None:
                raise RuntimeError("授权插入后没有主键：build 必须把对象加进 session。")
            return license
    raise RuntimeError(f"连续 {attempts} 次生成的激活码都已被占用。")


def bundled_feature_codes(session: Session, product: Product) -> list[str]:
    """套餐 ``included_product_ids`` 展开出的功能码。
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


def _product_grants_features(session: Session, product: Product) -> bool:
    """这个商品签出来的授权，激活时能不能拿到至少一个能力码。

    判据必须与 licensing/service.py 的 features_for 一致：能力来自**商品自己的**
    feature_codes，加上「套餐包含商品」展开出的功能码（bundled_feature_codes 只算后者，
    这正是不能直接拿它当判据的原因）。
    """
    if json_list(product.feature_codes_json):
        return True
    return bool(bundled_feature_codes(session, product))


def _license_grants_features(session: Session, license: License) -> bool:
    """这张授权当前能不能开出至少一个能力码（与 licensing/service.features_for 同口径）。

    能力 = 授权当前商品的 feature_codes ∪ 该授权上仍 active 的权益。
    履约后用它做兜底断言：商品改配/权益写入静默失败时，宁可把订单打成
    ``fulfillment_failed`` 让巡检捞起来，也不要发出「钱收了、能力没开通」的成功单。
    """
    if license.product_id:
        product = session.get(Product, license.product_id)
        if product is not None and json_list(product.feature_codes_json):
            return True
    return (
        session.scalars(
            select(Entitlement.id)
            .where(Entitlement.license_id == license.id)
            .where(Entitlement.active.is_(True))
        ).first()
        is not None
    )


def _entitlement_for(
    session: Session, license_id: str, feature_code: str
) -> Entitlement | None:
    """读该授权上某个功能码的权益（``None`` 表示还没有）。"""
    return session.scalars(
        select(Entitlement)
        .where(Entitlement.license_id == license_id)
        .where(Entitlement.feature_code == feature_code)
    ).first()


def _apply_grant(
    entry: Entitlement,
    *,
    product: Product,
    starts_at: datetime,
    expires_at: datetime | None,
    source_order_id: str | None = None,
) -> None:
    """刷新一条既有权益：重新点亮并指向本次发放的商品与有效期。"""
    entry.active = True
    entry.product_id = product.id
    entry.product_name = product.name
    entry.product_type = product.product_type
    entry.starts_at = starts_at
    entry.expires_at = expires_at
    if source_order_id is not None:
        entry.source_order_id = source_order_id


def _upsert_entitlement(
    session: Session,
    *,
    customer: Customer,
    license: License,
    product: Product,
    feature_code: str,
    starts_at: datetime,
    expires_at: datetime | None,
    source_order_id: str | None = None,
) -> bool:
    """确保该授权上存在 ``feature_code`` 的权益并刷新有效期；返回是否**新建**。
    """
    existing = _entitlement_for(session, license.id, feature_code)
    if existing is not None:
        _apply_grant(
            existing,
            product=product,
            starts_at=starts_at,
            expires_at=expires_at,
            source_order_id=source_order_id,
        )
        return False

    entry = Entitlement(
        customer_id=customer.id,
        license_id=license.id,
        product_id=product.id,
        product_name=product.name,
        product_type=product.product_type,
        feature_code=feature_code,
        source_order_id=source_order_id,
        active=True,
        starts_at=starts_at,
        expires_at=expires_at,
    )
    try:
        with session.no_autoflush, session.begin_nested():
            session.add(entry)
            session.flush()
    except IntegrityError:
        if entry in session:
            session.expunge(entry)
        existing = _entitlement_for(session, license.id, feature_code)
        if existing is None:
            raise
        _apply_grant(existing, product=product, starts_at=starts_at, expires_at=expires_at)
        return False
    return True


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
        if _upsert_entitlement(
            session,
            customer=customer,
            license=license,
            product=product,
            feature_code=feature_code,
            starts_at=moment,
            expires_at=license.access_expires_at,
        ):
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
    """
    moment = now or utcnow()
    validity_days = product.validity_days
    _capture_license_state(session, order, license)
    license.product_id = product.id
    license.product_name = product.name
    license.product_type = product.product_type
    license.price_cents = int(order.amount_cents or 0)
    license.validity_days = validity_days
    license.access_started_at = license.access_started_at or moment
    license.access_expires_at = (
        moment + timedelta(days=int(validity_days)) if validity_days else None
    )
    if (license.issuance_source or "") == "manual":
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
    validity_days = product.validity_days

    def build(code: str) -> License:
        return License(
            activation_code=code,
            code_hint=activation_code_hint(code),
            customer_id=customer.id,
            account_id=order.account_id,
            product_id=product.id,
            order_id=order.id,
            product_name=product.name,
            product_type=product.product_type,
            feature_codes_json=list_json(json_list(product.feature_codes_json)),
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

    license = insert_license_with_unique_code(session, build)
    order.license_id = license.id
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
    _capture_license_state(session, order, license)
    own_codes = [str(code) for code in json_list(product.feature_codes_json)]
    codes = own_codes + [
        code for code in bundled_feature_codes(session, product) if code not in own_codes
    ]
    for feature_code in codes:
        _upsert_entitlement(
            session,
            customer=customer,
            license=license,
            product=product,
            feature_code=feature_code,
            starts_at=moment,
            expires_at=expires_at,
            source_order_id=order.id,
        )
        created += 1
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
    if result.rowcount == 0:  # type: ignore[reportAttributeAccessIssue]  # SQLAlchemy CursorResult.rowcount 动态属性
        clamped = session.execute(
            update(Product)
            .where(Product.id == product.id)
            .where(func.coalesce(Product.reserved_stock, 0) != 0)
            .values(reserved_stock=0)
            .execution_options(synchronize_session=False)
        )
        if clamped.rowcount:  # type: ignore[reportAttributeAccessIssue]  # SQLAlchemy CursorResult.rowcount 动态属性
            logger.warning("商品 %s 的预留已被归还过，已夹到 0（请核对订单状态）", product.id)
    session.expire(product, ["reserved_stock"])
    session.flush()


def reserve_stock(session: Session, product: Product, quantity: int = 1) -> bool:
    """占用预留。返回是否成功（库存不足时返回 False 且不做任何改动）。
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
    return result.rowcount > 0  # type: ignore[reportAttributeAccessIssue]  # SQLAlchemy CursorResult.rowcount 动态属性


def consume_stock(session: Session, product: Product | None, quantity: int = 1) -> None:
    """把已卖出的数量从 ``stock_quantity`` 里真正扣掉。
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
    if result.rowcount == 0:  # type: ignore[reportAttributeAccessIssue]  # SQLAlchemy CursorResult.rowcount 动态属性
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


RESERVING_STATUSES = RESERVING_STATUS_FROM_ORDER


def release_order_reservation(
    session: Session, *, order: Order, product: Product | None, quantity: int = 1
) -> bool:
    """归还这一单占用的预留，并在订单上打上「已归还」的标记。返回本次是否真的归还。
    """
    if order.stock_reservation_released_at is not None:
        return False
    claim = session.execute(
        update(Order)
        .where(Order.id == order.id)
        .where(Order.stock_reservation_released_at.is_(None))
        .values(stock_reservation_released_at=utcnow())
        .execution_options(synchronize_session=False)
    )
    if claim.rowcount == 0:  # type: ignore[reportAttributeAccessIssue]  # SQLAlchemy CursorResult.rowcount 动态属性
        return False
    release_reserved_stock(session, product, quantity)
    session.expire(order, ["stock_reservation_released_at"])
    session.flush()
    return True


def release_order_effects(
    session: Session, *, order: Order, product: Product | None
) -> None:
    """归还这一单占用的库存预占与优惠码名额。
    """
    release_order_reservation(session, order=order, product=product)
    coupons.release_coupon(session, order)


def close_pending_order(
    session: Session,
    *,
    order: Order,
    product: Product | None,
    status: str = "cancelled",
    moment: datetime | None = None,
) -> bool:
    """把**待支付**订单原子地推入终态，并释放它的库存预留与优惠码名额。
    """
    claimed = session.execute(
        update(Order)
        .where(Order.id == order.id)
        .where(Order.status == "pending")
        .values(status=status, cancelled_at=moment or utcnow())
        .execution_options(synchronize_session=False)
    )
    if claimed.rowcount == 0:  # type: ignore[reportAttributeAccessIssue]  # SQLAlchemy CursorResult.rowcount 动态属性
        return False
    release_order_effects(session, order=order, product=product)
    return True


def close_pending_after_channel_close(session: Session, *, order: Order) -> bool:
    """渠道已明确关单时，把本地待支付订单推进终态并记下 ``channel_closed_at``。

    不这么做的话订单会一直停在 pending：库存预留与优惠码名额继续被占着，直到本地
    TTL 或巡检才回收。
    """
    product = session.get(Product, order.product_id) if order.product_id else None
    closed = close_pending_order(
        session, order=order, product=product, status="expired"
    )
    if not closed:
        return False
    session.execute(
        update(Order)
        .where(Order.id == order.id)
        .values(channel_closed_at=utcnow())
        .execution_options(synchronize_session=False)
    )
    session.flush()
    logger.warning("渠道已关单，本地订单同步过期 order=%s", order.order_no)
    return True


def recompute_reserved_stock(session: Session) -> dict[str, int]:
    """按订单表重算每个商品的 ``reserved_stock``，返回「商品 id → 修正量」。
    """
    counted = {
        product_id: int(count or 0)
        for product_id, count in session.execute(
            select(Order.product_id, func.count(Order.id))
            .where(Order.status.in_(RESERVING_STATUSES))
            .where(Order.stock_reservation_released_at.is_(None))
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
) -> dict:
    """履约。幂等：已履约的订单直接返回。
    """
    moment = now or utcnow()
    if order.status == "fulfilled" or order.fulfilled_at is not None:
        return {"alreadyFulfilled": True, "licenseId": order.license_id}
    if order.status == "refunded":
        raise RuntimeError(f"订单 {order.order_no} 已退款，不能重新履约。")

    claimed = session.execute(
        update(Order)
        .where(Order.id == order.id)
        .where(Order.fulfilled_at.is_(None))
        .where(Order.status != "refunded")
        .values(fulfilled_at=moment)
        .execution_options(synchronize_session=False)
    )
    if claimed.rowcount == 0:  # type: ignore[reportAttributeAccessIssue]  # SQLAlchemy CursorResult.rowcount 动态属性
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

    if order.license_action in {"issue", "patch", "upgrade"} and not _product_grants_features(
        session, product
    ):
        raise RuntimeError(
            f"商品「{product.name}」没有配置任何功能码，履约后无法开通任何能力。"
            "请先在后台给商品勾选功能码（或把它下架）后再履约。"
        )

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

    if order.license_action in {"issue", "patch", "upgrade"}:
        session.flush()
        fulfilled_license = (
            session.get(License, order.license_id) if order.license_id else None
        )
        if fulfilled_license is not None and not _license_grants_features(
            session, fulfilled_license
        ):
            raise RuntimeError(
                f"订单 {order.order_no} 履约后未产生任何可用能力，请检查商品与包含商品的功能码配置。"
            )

    order.status = "fulfilled"
    order.fulfilled_at = moment
    if order.stock_reservation_released_at is None:
        release_order_reservation(session, order=order, product=product, quantity=1)
    consume_stock(session, product, 1)

    try:
        with session.begin_nested():
            reward = referrals.grant_order_reward(
                session,
                order=order,
                rate_percent=float(setting.referral_rate_percent or 0.0),
                enabled=bool(setting.referral_enabled),
            )
    except Exception as error:
        incidents.note("referral.reward", order_no=order.order_no, error=error)
        logger.exception("邀请奖励发放失败（不影响已签发的授权）order=%s", order.order_no)
        reward = 0
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
        "referralRewardPointsCenti": reward,
    }
