"""优惠码核销的记账口径。
"""

from __future__ import annotations

import logging

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from ..core.models import Account, Coupon, CouponRedemption, Order
from ..security.security import utcnow

logger = logging.getLogger("src.commerce.coupons")

#: 合法的折扣类型白名单。结算逻辑（``src.api.store``）只区分 ``fixed``
DISCOUNT_TYPES = frozenset({"percent", "fixed"})

#: 「名额已归还」的订单状态：这些路径都调用 :func:`release_coupon`，核销记录不再占名额，
#: 全额退款也归还名额：钱已经退回去了，这笔单不该再占着一个折扣额度。
#: 库存预留的归还在退款路径里本来就会做（admin_orders 的 _release_...），唯独
#: 优惠码名额过去没有跟着走，于是「退了款的名额」会一直被锁着。
RELEASED_STATUSES = frozenset(
    {"cancelled", "expired", "payment_failed", "refunded"}
)


class CouponUnavailable(RuntimeError):
    """名额在「校验」与「占用」之间被别的请求抢光了。"""


def holds_slot_conditions() -> tuple:
    """「此刻仍占着名额」的 SQL 判据 —— 所有判定点的**唯一来源**。
    """
    return (
        CouponRedemption.voided_at.is_(None),
        CouponRedemption.order_id.is_not(None),
        Order.status.notin_(RELEASED_STATUSES),
    )


def holds_slot(record: CouponRedemption, order: Order | None) -> bool:
    """:func:`holds_slot_conditions` 的 Python 版（后台列表逐行渲染用）。
    """
    if record.voided_at is not None:
        return False
    if record.order_id is None:
        return False
    return order is not None and order.status not in RELEASED_STATUSES


def active_redemption_count(session: Session, *, coupon_id: str, account_id: str) -> int:
    """该账号在这个码上**仍占着名额**的核销记录数。
    """
    return int(
        session.execute(
            select(func.count(CouponRedemption.id))
            .select_from(CouponRedemption)
            .outerjoin(Order, Order.id == CouponRedemption.order_id)
            .where(CouponRedemption.coupon_id == coupon_id)
            .where(CouponRedemption.account_id == account_id)
            .where(*holds_slot_conditions())
        ).scalar_one()
        or 0
    )


def redeem_coupon(
    session: Session, order: Order, coupon: Coupon, account: Account, discount: int
) -> None:
    """下单成功创建订单时占用一个名额：计数 +1 并写入核销记录。
    """
    statement = (
        update(Coupon)
        .where(Coupon.id == coupon.id)
        .values(redeemed_count=func.coalesce(Coupon.redeemed_count, 0) + 1)
        .execution_options(synchronize_session=False)
    )
    if coupon.max_redemptions is not None:
        statement = statement.where(
            func.coalesce(Coupon.redeemed_count, 0) < int(coupon.max_redemptions)
        )
    if coupon.per_account_limit:
        # 该账号仍占用中的核销记录数，作为**相关标量子查询**参与 WHERE；整个判断与自增在同一条
        used_subquery = (
            select(func.count(CouponRedemption.id))
            .select_from(CouponRedemption)
            .outerjoin(Order, Order.id == CouponRedemption.order_id)
            .where(CouponRedemption.coupon_id == Coupon.id)
            .where(CouponRedemption.account_id == account.id)
            .where(*holds_slot_conditions())
            .scalar_subquery()
        )
        statement = statement.where(used_subquery < int(coupon.per_account_limit))
    result = session.execute(statement)
    if result.rowcount == 0:  # type: ignore[reportAttributeAccessIssue]  # SQLAlchemy CursorResult.rowcount 动态属性
        if coupon.per_account_limit and (
            active_redemption_count(session, coupon_id=coupon.id, account_id=account.id)
            >= int(coupon.per_account_limit)
        ):
            raise CouponUnavailable("你已使用过该优惠码。")
        raise CouponUnavailable("优惠码已被领完。")
    session.expire(coupon, ["redeemed_count"])
    session.add(
        CouponRedemption(
            coupon_id=coupon.id,
            account_id=account.id,
            order_id=order.id,
            discount_cents=discount,
        )
    )
    session.flush()


def recount_coupon_slots(session: Session, coupon_id: str) -> int:
    """按核销表重算 redeemed_count，返回重算后的占用名额数。

    计数列是反规范化的快照，**真相在 coupon_redemptions**（判据见
    holds_slot_conditions）。所有增删占用名额的路径都收口到这里，
    这样「两个入口口径不一致」与「计数漂移」是同一类问题，只需要修一次。
    """
    coupon = session.get(Coupon, coupon_id)
    if coupon is None:
        return 0
    used = int(
        session.execute(
            select(func.count(CouponRedemption.id))
            .select_from(CouponRedemption)
            .outerjoin(Order, Order.id == CouponRedemption.order_id)
            .where(CouponRedemption.coupon_id == coupon_id)
            .where(*holds_slot_conditions())
        ).scalar_one()
        or 0
    )
    coupon.redeemed_count = used
    session.flush()
    return used


def recompute_coupon_slots(session: Session) -> dict[str, int]:
    """按核销表重算**所有**优惠码的 ``redeemed_count``，返回「码 id → 修正量」。

    与 :func:`src.commerce.fulfill.recompute_reserved_stock` 同一角色：计数列是
    反规范化的快照，**真相在 coupon_redemptions**（判据见 :func:`holds_slot_conditions`），
    漂移由后台维护动作统一纠回。改券、归还名额、复活占用这些常规路径各自已经调用
    :func:`recount_coupon_slots`，这里是兜底入口。
    """
    changes: dict[str, int] = {}
    for coupon_id, current in session.execute(
        select(Coupon.id, func.coalesce(Coupon.redeemed_count, 0))
    ).all():
        before = int(current or 0)
        expected = recount_coupon_slots(session, coupon_id)
        if before != expected:
            changes[coupon_id] = expected - before
    session.flush()
    return changes


def release_coupon(
    session: Session, order: Order, *, reason: str = "订单未成交，自动归还名额"
) -> bool:
    """订单未成交或全额退款时归还名额。返回本次是否真的归还过。

    **幂等**：重复调用只归还一次，不会把计数越减越少。
    """
    if not order.coupon_code:
        return False
    record = session.scalars(
        select(CouponRedemption)
        .where(CouponRedemption.order_id == order.id)
        .where(CouponRedemption.voided_at.is_(None))
    ).first()
    if record is None:
        return False
    record.voided_at = utcnow()
    record.void_reason = reason[:255]
    session.flush()
    recount_coupon_slots(session, record.coupon_id)
    return True


def reoccupy_coupon(session: Session, order: Order) -> bool:
    """订单「复活」成交时把名额重新占回来，返回是否真的占回。

    守卫必须与下单时的 redeem_coupon 一致：旧实现只重查 max_redemptions，
    于是「超时关闭期间码被后台停用」「该账号本已用满 per_account_limit」这两种
    情况下的后到账会被照常放行，等于绕过运营刚设下的限制。
    """
    if not order.coupon_code:
        return True
    coupon = session.scalars(
        select(Coupon).where(func.lower(Coupon.code) == order.coupon_code.lower())
    ).first()
    if coupon is None:
        # 码已经被删除：历史行为是放行（钱已经收了，不能因为码没了就不入账）。
        return True

    record = session.scalars(
        select(CouponRedemption).where(CouponRedemption.order_id == order.id)
    ).first()
    if record is not None and record.voided_at is None:
        # 这一单本来就还占着名额（没有走过归还路径），不必再占用。
        return True

    if not coupon.active:
        return False
    if coupon.max_redemptions is not None and int(
        coupon.redeemed_count or 0
    ) >= int(coupon.max_redemptions):
        return False
    if order.account_id and coupon.per_account_limit:
        used = active_redemption_count(
            session, coupon_id=coupon.id, account_id=order.account_id
        )
        if used >= int(coupon.per_account_limit):
            return False

    if record is None:
        # 没有核销行可复活（例如订单建单时就失败了）。不能凭这一条凭空造一行：
        # 那需要折扣额等建单时才有的信息。记账按现状重算，并留下痕迹。
        logger.warning(
            "复活单找不到核销记录，名额未重新占用 order=%s code=%s",
            order.order_no,
            order.coupon_code,
        )
        return True

    record.voided_at = None
    record.void_reason = ""
    session.flush()
    recount_coupon_slots(session, coupon.id)
    return True
