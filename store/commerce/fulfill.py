"""订单履约：发放激活码、追加减量包、记邀请奖励。

无论支付渠道是模拟收银台还是真实支付宝，最终都汇聚到这里，保证履约行为一致。
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta

from sqlalchemy import func, or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from store.commerce import coupons, referrals
from store.config import StoreSettings
from store.core.models import (
    Customer,
    Entitlement,
    License,
    Order,
    Product,
    StoreSetting,
)
from store.commerce.order_status import RESERVING_STATUSES as RESERVING_STATUS_FROM_ORDER
from store.security.security import (
    activation_code_hint,
    new_activation_code,
    utcnow,
)
from store.core.serializers import json_list

logger = logging.getLogger("store.commerce.fulfill")


#: ``Order.license_state_before_json`` 里记录的授权字段白名单：快照要能原样写回去，
#: 多记一个不该还原的字段（比如 ``active``）会在退款时把用户停用过的授权重新点亮。
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
#: SQLite 的 DateTime 列只接受 datetime/date，直接写字符串会在退款那一刻抛 TypeError。
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

    升级单被重复履约时第二次会拿到一张已改过的授权，覆盖快照等于把「升级前」记成了
    「升级后」，退款就再也还原不回去。
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


def revert_license_change(session: Session, *, order: Order, license: License) -> bool:
    """把升级 / 增量包改过的授权还原成快照里的样子。返回是否真的还原过。

    退款时必须走这一步，而不是「把授权作废」：被改的这张授权是用户**此前已经付过钱**
    的（他买的是升级，不是买新码），整张作废等于没收了他原来那笔消费。

    幂等：重复调用只会重复做同一件事（快照不会被清空），所以退款重试是安全的。
    """
    snapshot = json.loads(order.license_state_before_json or "{}")
    if not isinstance(snapshot, dict) or not snapshot:
        return False

    for entitlement in session.scalars(
        select(Entitlement).where(Entitlement.license_id == license.id)
    ):
        if entitlement.product_id == order.product_id:
            entitlement.active = False

    for field in (*_LICENSE_SNAPSHOT_FIELDS, "access_expires_at"):
        if field not in snapshot:
            continue
        value = snapshot[field]
        if field in _LICENSE_MOMENT_FIELDS:
            value = _parse_moment(value)
        setattr(license, field, value)

    # 套餐权益要按**还原后**的商品重新展开：升级时 grant_bundled_entitlements 会把
    # 命中的权益行改写成升级商品的 product_id，只停用本单权益会关掉用户原有的套餐功能。
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


def _is_activation_code_collision(error: IntegrityError) -> bool:
    """这个 ``IntegrityError`` 是不是「激活码撞了唯一约束」。

    刻意不只看列名：``activation_code`` 也会出现在**非空约束**的消息里，只按列名判断
    会把恒为 NULL 的 bug 当成碰撞重试 8 次，把真正的缺陷藏起来。要求同时命中 UNIQUE。
    """
    text = str(getattr(error, "orig", error)).upper()
    return "UNIQUE" in text and "ACTIVATION_CODE" in text


def insert_license_with_unique_code(
    session: Session, build, *, attempts: int = 8
) -> License:
    """插入一行授权，激活码撞唯一约束就换一个码重试。

    不能只靠「先查后插」（并发下仍会撞唯一约束并冒到接口层变成 500）；插入包在
    SAVEPOINT 里，撞了只撤销这一次插入、重新调 ``build`` 换码重试；只对「激活码
    重复」重试，其它 ``IntegrityError`` 直接抛出。
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
            if not _is_activation_code_collision(error):
                raise
            # 96 位随机码撞车几乎不可能，真撞上了就重试，而不是变成一次人工工单。
            logger.warning(
                "激活码 %s 撞上唯一约束，换一个码重试", activation_code_hint(code)
            )
            continue
        else:
            # 主键是 flush 时生成的；少了这一句，``build`` 忘了 ``session.add``
            # 也会静默发出一个 id 为 None 的授权 —— 这种失败比崩溃难查得多。
            if license.id is None:
                raise RuntimeError("授权插入后没有主键：build 必须把对象加进 session。")
            return license
    raise RuntimeError(f"连续 {attempts} 次生成的激活码都已被占用。")


def bundled_feature_codes(session: Session, product: Product) -> list[str]:
    """套餐 ``included_product_ids`` 展开出的功能码。

    ``included_product_ids`` 必须在这里展开：履约与 ``features_for`` 都只认商品自己的
    ``feature_codes``，运营把商品 id 填进套餐却没抄功能码时，用户付款后就什么都拿不到。
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
) -> None:
    """刷新一条既有权益：重新点亮并指向本次发放的商品与有效期。"""
    entry.active = True
    entry.product_id = product.id
    entry.product_name = product.name
    entry.product_type = product.product_type
    entry.starts_at = starts_at
    entry.expires_at = expires_at


def _upsert_entitlement(
    session: Session,
    *,
    customer: Customer,
    license: License,
    product: Product,
    feature_code: str,
    starts_at: datetime,
    expires_at: datetime | None,
) -> bool:
    """确保该授权上存在 ``feature_code`` 的权益并刷新有效期；返回是否**新建**。

    插入放在 SAVEPOINT 内且 flush 也在其内：``(license_id, feature_code)`` 有唯一索引，
    并发履约可能都走完「查不到」，撞索引时回滚这一条并改成更新既有行；提前 flush 会把
    会话打成 needs-rollback。
    """
    existing = _entitlement_for(session, license.id, feature_code)
    if existing is not None:
        _apply_grant(existing, product=product, starts_at=starts_at, expires_at=expires_at)
        return False

    entry = Entitlement(
        customer_id=customer.id,
        license_id=license.id,
        product_id=product.id,
        product_name=product.name,
        product_type=product.product_type,
        feature_code=feature_code,
        active=True,
        starts_at=starts_at,
        expires_at=expires_at,
    )
    try:
        with session.no_autoflush, session.begin_nested():
            session.add(entry)
            session.flush()
    except IntegrityError:
        # 失败的那条不能留在会话里：否则提交时会再插一次、再次撞索引。
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

    保留激活码与设备绑定，用户已配好的客户端不需要重新激活 —— 这正是「升级」与
    「再买一张新码」的区别。
    """
    moment = now or utcnow()
    validity_days = product.validity_days
    #: 先留快照再动字段，否则退款时再也还原不回去（「退了钱、永久授权还在」的根因）。
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
    # 历史数据归一：早期版本写过 ``payment_manual``，现在已无任何写入方（全仓只有
    # ``manual`` 与 ``payment_automatic`` 两个写入点）。升级后的这张码由订单驱动，
    # 所以把它归到自动发码。
    #
    # 条件只判这一个值：原先写的是 ``in {"payment_automatic", "payment_manual"}``，
    # 但对 ``payment_automatic`` 而言赋值与现值完全相同 —— 那半个条件是个空操作，
    # 读起来却像在「调整来源」，容易让人以为升级会改动别的来源。
    if license.issuance_source == "payment_manual":
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
    #: 增量包对授权只做「续期」，但退款必须能收回这段延长，所以同样要留快照。
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
        # 预留本来就是 0：多半是同一次预留被归还了两次。负数预留会让
        # available = stock - reserved 虚高、直接放开超卖，所以夹到 0 并告警。
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

    必须是「带条件的原子 UPDATE」：并发请求会同时通过更早处的 ``soldOut`` 检查再各写
    同一份旧值，限量 1 件的商品被卖两份；判断与自增放进同一条 UPDATE 才安全。
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

    库存口径：``available_stock = stock_quantity - reserved_stock``；下单只加预留，
    履约才扣 ``stock_quantity``。少了这一步两者会互相抵消，限量 1 件的商品可以无限次卖出。
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
#: ``recompute_reserved_stock``。
RESERVING_STATUSES = RESERVING_STATUS_FROM_ORDER


def release_order_reservation(
    session: Session, *, order: Order, product: Product | None, quantity: int = 1
) -> bool:
    """归还这一单占用的预留，并在订单上打上「已归还」的标记。返回本次是否真的归还。

    **所有释放点都必须走这里**：若各处直接调 ``release_reserved_stock``，就无法知道
    「这一单此刻还占不占预留」，只能按状态反推 —— 复活单会再释放一次，扣掉**别人**的预留。
    """
    if order.stock_reservation_released_at is not None:
        return False
    claim = session.execute(
        update(Order)
        .where(Order.id == order.id)
        #: 用数据库里的当前值做比较并交换，而不是信内存对象：这些调用点刚用条件
        #: UPDATE 抢过订单状态（``synchronize_session=False``），内存里是旧值。
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

    两件事必须成对发生，所以收成一个函数：漏归还预留会把 ``reserved_stock`` 越算越高
    （商品误判售罄），漏归还优惠码会让名额被永久占用。函数自身幂等，但调用方仍只该在
    真正抢到状态迁移的那一次调用它。
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

    返回本次是否真的推动了状态（``False`` = 已被别的路径处理）。只有抢到状态迁移的
    那一次才释放副作用 —— 拿到 ``False`` 时不要再自己释放，那会把预留扣两次并放开超卖。
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

    以订单表为准把缓存拉回真实值，用于自愈存量数据。计数条件必须带上
    ``stock_reservation_released_at IS NULL``：只看状态会把**复活单**算成仍占着预留，
    反而把占用虚增、让本可下单的商品被误判售罄。
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
    release_stock: bool | None = None,
) -> dict:
    """履约。幂等：已履约的订单直接返回。

    ``release_stock`` 默认由 ``stock_reservation_released_at is None`` 推导（唯一事实
    来源）：``settle_paid_order`` 会把 expired/cancelled 的订单复活成 paid 再履约，这些
    状态进入终态时预留早已释放，按订单状态猜会扣掉**其它**订单的预留并放开超卖。
    """
    moment = now or utcnow()
    if order.status == "fulfilled" or order.fulfilled_at is not None:
        return {"alreadyFulfilled": True, "licenseId": order.license_id}
    if order.status == "refunded":
        # 兜底：正常入口（admin / 支付宝结算）都会在更早的位置拒绝。
        raise RuntimeError(f"订单 {order.order_no} 已退款，不能重新履约。")

    # 并发幂等闸门：把「是否已履约」的判断与标记合并成一条带条件的 UPDATE ——
    # 支付宝会重复推送通知，查单也可能同时到达，只靠读判断会重复发码。
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
    #: 默认按「这一单还占不占预留」的真实来源推导，而不是让调用方按状态猜。
    should_release = (
        release_stock
        if release_stock is not None
        else order.stock_reservation_released_at is None
    )
    if should_release:
        release_order_reservation(session, order=order, product=product, quantity=1)
    # 发码即售出：哪条路径（正常支付 / 关单后复活补发）都要把这一件从
    # stock_quantity 扣掉，否则「预留释放」会把可用量还回去，等于白送一件。
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
        #: 单位是**厘**（1 积分 = 100 厘），与 ``ReferralLedger`` / 钱包同口径；
        #: 目前无调用方读取，保留只为不改变既有返回结构，键名带 Centi 防误解。
        "referralRewardPointsCenti": reward,
    }
