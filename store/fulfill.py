"""订单履约：发放激活码、追加减量包、记邀请奖励。

无论支付渠道是模拟收银台还是真实支付宝，最终都汇聚到这里，
保证切换 provider 时履约行为完全一致。
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta

from sqlalchemy import func, or_, select, update
from sqlalchemy.exc import IntegrityError
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


#: ``Order.license_state_before_json`` 里记录的授权字段。顺序无所谓，但必须是
#: 一份**白名单**：快照要能被原样写回去，多记一个不该还原的字段（比如 ``active``）
#: 就会在退款时把「用户自己停用过的授权」重新点亮。
_LICENSE_SNAPSHOT_FIELDS = (
    "product_id",
    "product_name",
    "product_type",
    "price_cents",
    "validity_days",
    "issuance_source",
    "access_started_at",
)

#: 快照里按时间还原的字段。JSON 存的是 ISO **字符串**，写回 ORM 前必须转回
#: ``datetime`` —— SQLite 的 DateTime 列只接受 datetime/date，直接写字符串会在
#: 退款那一刻抛 TypeError，而那时钱已经退给用户了（漏掉这一步的代价是
#: 「退款成功、后台报 500、授权状态停在半路」）。
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

    不覆盖是关键：升级单被重复履约（重推通知、后台重试）时第二次会拿到一张
    已经改过的授权，用它覆盖快照等于把「升级前」记成了「升级后」，
    退款就再也还原不回去了。
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
    的（他是买升级，不是买新码），整张作废等于没收了他原来那笔消费。
    还原的粒度是：

    * 恢复商品、价格、有效期与签发来源 —— 时限授权回到原来的到期时间，
      永久授权收回「永久」；
    * 停用**本单**带进来的权益（``product_id`` 是升级商品的那些行）；
    * 若还原后的商品是套餐，按套餐重新发放一次权益，把升级时被覆盖掉的
      ``product_id`` / ``expires_at`` 拉回来。

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
    # 命中的权益行改写成升级商品的 product_id，光靠上面那轮「停用本单权益」
    # 会把用户原本就有的套餐功能一起关掉。此处必须在还原完字段之后再做。
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

    刻意不只看列名：``activation_code`` 这个字符串也会出现在**非空约束**的消息里
    （``NOT NULL constraint failed: licenses.activation_code``），只按列名判断的话，
    一个恒为 NULL 的 bug 会被当成碰撞重试 8 次，最后报「连续 8 次生成的激活码都已
    被占用」—— 把真正的缺陷藏得严严实实。所以要求同时命中 ``UNIQUE``。
    """
    text = str(getattr(error, "orig", error)).upper()
    return "UNIQUE" in text and "ACTIVATION_CODE" in text


def insert_license_with_unique_code(
    session: Session, build, *, attempts: int = 8
) -> License:
    """插入一行授权，激活码撞唯一约束就换一个码重试（S35）。

    为什么不能只靠上面那次「先查后插」：两个请求可以同时查到「这个码没人用」，
    然后一起去插 —— 一个成功，另一个撞上 ``licenses.activation_code`` 的唯一约束。
    过去这个异常会一路冒到接口层变成 500，而调用方（支付入账 / 后台发码）都是
    「失败就要人来收拾」的路径：用户付过钱的订单停在 ``fulfillment_failed``。

    现在把插入包在 SAVEPOINT 里：撞了就回滚到保存点、换一个码重试。SAVEPOINT 的
    关键作用是**只撤销这一次插入**，不牵连外层事务已经写好的东西（订单状态、
    库存、邀请奖励都还在同一个事务里）。

    只对「激活码重复」重试：其它 ``IntegrityError``（外键、非空、别的唯一约束）
    换再多个码也没用，直接抛出去 —— 把真正的 bug 当成碰撞来重试，只会换来 8 次
    同样的失败和一份看不出原因的日志。

    ``build`` 是「拿到码之后怎么造这一行」，必须在重试时重新调用：上一轮那个
    License 对象已经随保存点回滚了，继续往上加等于往一个作废的对象上写。
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
            # 96 位随机码撞车在实践中几乎不可能，但它是唯一约束在替我们兜底 ——
            # 真的撞上了就重试，而不是把一次「运气不好」变成一次人工工单。
            logger.warning(
                "激活码 %s 撞上唯一约束，换一个码重试", activation_code_hint(code)
            )
            continue
        else:
            # 主键是 flush 时生成的。少了这一句，``build`` 忘了 ``session.add``
            # 也不会报错，只会让调用方拿到一个 id 为 None 的授权 —— 表现是「订单已经
            # 履约、却没有发码」，而且整条链路上没有任何异常。这种静默失败比崩溃难查得多。
            if license.id is None:
                raise RuntimeError("授权插入后没有主键：build 必须把对象加进 session。")
            return license
    raise RuntimeError(f"连续 {attempts} 次生成的激活码都已被占用。")


def bundled_feature_codes(session: Session, product: Product) -> list[str]:
    """套餐 ``included_product_ids`` 展开出的功能码。

    过去 ``included_product_ids`` 只被后台读来展示「套餐包含什么」，履约时
    **完全没有人发放它**：``create_license_for_order`` 只认商品自己的
    ``feature_codes``，``LicenseAuthority.features_for`` 也只读商品自己的功能码。
    于是运营在后台把三个商品的 id 填进套餐、却没把功能码再抄一遍，用户付款后
    什么也没拿到；激活时 ``features_for`` 会因空功能集以 422 拒绝签发。

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

    之所以收成一处：套餐捆绑（:func:`grant_bundled_entitlements`）与增量包
    （:func:`apply_addon_to_license`）原先各抄了一遍「查 → 有则更新 / 无则插入」，
    字段清单一改就得改两处，漏一处就会出现「同一种权益、两条路径给不同默认值」。

    插入放在 SAVEPOINT 内并关掉自动 flush：``(license_id, feature_code)`` 上有唯一
    索引，两笔并发履约（重复支付回调、多 worker 同时处理同一订单）可能都走完「查不到」
    这一步，此时撞索引不该让整单履约失败 —— 撞了说明别处刚插好，回滚这一条、改成
    「更新既有行」即可，与「查得到」分支语义完全一致。

    flush 必须**在 SAVEPOINT 内**（先建 SAVEPOINT 再显式 flush）：提前 flush 会把会话
    打成 needs-rollback，之后连读都读不了。
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

    保留激活码与设备绑定，因此用户已配好的客户端不需要重新激活 —— 这正是
    「升级」与「再买一张新码」的区别。前台升级链接一直存在，但服务端从没消费
    过它，等于点了按钮只是又买了一张新授权。
    """
    moment = now or utcnow()
    validity_days = product.validity_days
    #: 先留快照再动字段 —— 顺序反了就等于把「升级前」记成了「升级后」，
    #: 退款时再也还原不回去（这正是「退了钱、永久授权还在」的根因）。
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

    # 激活码撞车在这里被吃成一次重试（S35），而不是把异常甩给「钱已经收了」的调用方。
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
    #: 增量包对授权本身的影响只有「续期」（下面按 validity_days 延后到期时间），
    #: 但退款必须能把这段延长收回去，所以同样要留快照。
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
        # 预留本来就是 0：只可能是「同一次预留被归还了两次」（例如订单已被
        # expire_stale_orders 归还，后续取消/退款路径又归还一次）。负数预留会
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


def release_order_reservation(
    session: Session, *, order: Order, product: Product | None, quantity: int = 1
) -> bool:
    """归还这一单占用的预留，并在订单上打上「已归还」的标记。返回本次是否真的归还。

    **所有释放点都必须走这里**（下单超时、用户取消、渠道关单、后台核销……）：
    过去每处都直接调 ``release_reserved_stock``，而「这一单此刻还占不占预留」
    没有任何记录，于是调用方只能各自按 ``order.status`` 反推 —— 复活单
    （expired 之后才收到支付）的预留其实早已释放，按状态反推会再释放一次，
    扣掉的是**别人**的预留，直接把超卖放开。

    标记与释放顺序很重要：先打标记再扣减。极端情况下（进程在两者之间崩掉）
    留下的是「标记已释放、计数没减」，``recompute_reserved_stock`` 会把它纠正回来；
    反过来则会重复扣减 —— 那正是会放开超卖的方向。
    """
    if order.stock_reservation_released_at is not None:
        return False
    claim = session.execute(
        update(Order)
        .where(Order.id == order.id)
        #: 用数据库里的当前值做比较并交换，而不是信内存里的对象：这些调用点刚刚
        #: 用条件 UPDATE 抢过订单状态（``synchronize_session=False``），
        #: 内存里的字段本来就是旧值，据此判断等于没判断。
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


def recompute_reserved_stock(session: Session) -> dict[str, int]:
    """按订单表重算每个商品的 ``reserved_stock``，返回「商品 id → 修正量」。

    历史上「对已取消订单履约」会重复释放预留，把计数扣低并直接放开超卖；
    这里以订单表为准把缓存拉回真实值，用于自愈存量数据。

    计数条件必须带上 ``stock_reservation_released_at IS NULL``：只看状态会把
    **复活单**算成仍然占着预留（它们从 expired 复活成 paid，预留那时就已经还了），
    于是这个「自愈」动作反而把占用虚增上去，让本来还能下单的商品被误判成售罄。
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

    ``release_stock`` 表示「这张订单此刻是否还占着库存预留」，默认由
    ``order.stock_reservation_released_at is None`` **推导** —— 这是唯一的事实来源。
    过去它由调用方按订单状态声明，而状态与预留的生命周期并不一致：
    ``settle_paid_order`` 会把 expired / cancelled / payment_failed 的订单复活成
    paid 再履约（钱确实到账了），而这些状态在进入终态时预留早已释放。若此时再扣
    一次，扣掉的其实是**其它待支付订单**的预留，会把 ``reserved_stock`` 算低并直接
    放开超卖。

    仍保留显式传参的口子给确实知道更多的调用方，但默认值不再是猜测。
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
    #: 默认按「这一单还占不占预留」的真实来源推导，而不是让调用方按状态猜。
    should_release = (
        release_stock
        if release_stock is not None
        else order.stock_reservation_released_at is None
    )
    if should_release:
        release_order_reservation(session, order=order, product=product, quantity=1)
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
        #: 单位是**厘**（1 积分 = 100 厘）——与 ``ReferralLedger`` / 钱包同口径。
        #: 目前没有调用方读这个字段（``fulfill_order`` 的返回值被各处忽略），
        #: 保留它只是为了不改变既有返回结构；键名带 Centi 是为了不让后来人
        #: 误以为它是「积分」而按元/点去用。
        "referralRewardPointsCenti": reward,
    }
