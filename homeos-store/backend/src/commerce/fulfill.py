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
from ..config import StoreSettings
from ..ops import incidents
from ..core.models import (
    Customer,
    Entitlement,
    License,
    Order,
    Product,
    StoreSetting,
)
from ..commerce.order_status import RESERVING_STATUSES as RESERVING_STATUS_FROM_ORDER
from ..security.security import (
    activation_code_hint,
    new_activation_code,
    utcnow,
)
from ..core.serializers import json_list

logger = logging.getLogger("src.commerce.fulfill")


#: ``Order.license_state_before_json`` 里记录的授权字段白名单：快照要能原样写回去，
_LICENSE_SNAPSHOT_FIELDS = (
    "product_id",
    "product_name",
    "product_type",
    "price_cents",
    "validity_days",
    "issuance_source",
    "access_started_at",
)

#: 快照里按时间还原的字段。JSON 存的是 ISO 字符串，写回 ORM 前必须转回 ``datetime``：
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
    session: Session, *, order: Order, license_id: str, product_id: str | None
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
            # 这张权益不是本商品开的，退款不该碰它。
            continue
        if has_other_live_grant(
            session, order=order, license_id=license.id, product_id=order.product_id
        ):
            # 另有一笔仍然有效的订单在给同一个商品付款（重复购买同一增量包），
            # 关掉它等于把别人已经付过钱的东西收回。
            continue
        entitlement.active = False

    for field in (*_LICENSE_SNAPSHOT_FIELDS, "access_expires_at"):
        if field not in snapshot:
            continue
        value = snapshot[field]
        if field in _LICENSE_MOMENT_FIELDS:
            value = _parse_moment(value)
        setattr(license, field, value)

    # 套餐权益要按**还原后**的商品重新展开：升级时 grant_bundled_entitlements 会把
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
            # 96 位随机码撞车几乎不可能，真撞上了就重试，而不是变成一次人工工单。
            logger.warning(
                "激活码 %s 撞上唯一约束，换一个码重试", activation_code_hint(code)
            )
            continue
        else:
            # 主键是 flush 时生成的；少了这一句，``build`` 忘了 ``session.add``
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
        # 记下「是谁把这条权益点亮的」：退款要按它精确撤销。
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
            # 撞的不是这条唯一性：让上层看见真实错误，别把结构问题藏起来。
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
    # 付费履约后，手动签发的授权来源改为支付自动。
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

    # 激活码撞车在这里被吃成一次重试，而不是把异常甩给「钱已经收了」的调用方。
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
    for feature_code in json_list(product.feature_codes_json):
        feature_code = str(feature_code)
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
    # 追加购买视为续期：若授权本身有时限，一并延后。
    #
    # 注意：**当前从商店下单走不到这里** —— 下单时会拒绝「把增量包加到有时限的授权上」
    # （api/store_orders.py：「增量包只能添加到永不过期的主授权上」），所以
    # access_expires_at 必然是 None。保留它是因为这条限制一旦放宽，续期就是唯一
    # 说得通的语义；把它删掉会让那次放宽变成「买了增量包，主授权却不顺延」。
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
    if result.rowcount == 0:
        # 预留本来就是 0：多半是同一次预留被归还了两次。负数预留会让
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
        # 只可能是「订单关掉后又被支付复活」这类越卖；夹到 0 让商品直接显示售罄。
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


#: 真正持有库存预留的订单状态；``reserved_stock`` 只是缓存，真实依据见
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
        #: 用数据库里的当前值做比较并交换，而不是信内存对象：这些调用点刚用条件
        .where(Order.stock_reservation_released_at.is_(None))
        .values(stock_reservation_released_at=utcnow())
        .execution_options(synchronize_session=False)
    )
    if claim.rowcount == 0:
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
    if claimed.rowcount == 0:
        return False
    release_order_effects(session, order=order, product=product)
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
        # 兜底：正常入口（admin / 支付宝结算）都会在更早的位置拒绝。
        raise RuntimeError(f"订单 {order.order_no} 已退款，不能重新履约。")

    # 并发幂等闸门：把「是否已履约」的判断与标记合并成一条带条件的 UPDATE ——
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

    # 新增授权的商品必须真的能开出功能码。licensing/service.py 的 features_for 是
    # fail-closed 的（没有功能码就 422），但那是**激活**时才发生的检查：一个漏配的
    # 商品会先卖出去、先签出授权，买家在最后一步才发现自己拿到的是一张激活不了的码。
    # 拦住发码换成「发货失败 + 待人工复核」是可运营的状态：修好商品再点履约即可。
    #    能开出的能力 = 商品自己的 feature_codes ∪ 它包含商品的功能码。
    #    两者都空才叫「签出去也激活不了」。
    if order.license_action == "issue" and not _product_grants_features(session, product):
        raise RuntimeError(
            f"商品「{product.name}」没有配置任何功能码，签发出去也无法激活。"
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

    order.status = "fulfilled"
    order.fulfilled_at = moment
    #: 预留是否释放以订单行 CAS 标记为准。
    if order.stock_reservation_released_at is None:
        release_order_reservation(session, order=order, product=product, quantity=1)
    # 发码即售出：哪条路径（正常支付 / 关单后复活补发）都要把这一件从
    consume_stock(session, product, 1)

    # 邀请奖励是**可选的营销副作用**，绝不能让它的失败回滚刚签发的授权。
    # 以前它直接跑在调用方（入账）的 SAVEPOINT 里：钱包取用-创建连续失败 8 次、
    # 或一次数据库锁冲突，就会把订单打成 fulfillment_failed —— 钱收了、码没了，
    # 而原因只是「积分没记上」。这里用内层 SAVEPOINT 把它隔离成独立事务段。
    try:
        with session.begin_nested():
            reward = referrals.grant_order_reward(
                session,
                order=order,
                rate_percent=float(setting.referral_rate_percent or 0.0),
                enabled=bool(setting.referral_enabled),
            )
    except Exception as error:  # noqa: BLE001 - 奖励失败不能拖垮发码
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
        #: 单位是**厘**（1 积分 = 100 厘），与 ``ReferralLedger`` / 钱包同口径；
        "referralRewardPointsCenti": reward,
    }
