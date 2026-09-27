"""优惠码核销的记账口径。
"""

from __future__ import annotations

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from apps.store.core.models import Account, Coupon, CouponRedemption, Order

#: 合法的折扣类型白名单。结算逻辑（``apps.store.api.store``）只区分 ``fixed``
DISCOUNT_TYPES = frozenset({"percent", "fixed"})

#: 「名额已归还」的订单状态：这些路径都调用 :func:`release_coupon`，核销记录不再占名额，
RELEASED_STATUSES = frozenset({"cancelled", "expired", "payment_failed"})


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
    if result.rowcount == 0:
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


def release_coupon(session: Session, order: Order) -> None:
    """订单未成交时归还名额（取消 / 超时 / 支付失败）。
    """
    if not order.coupon_code:
        return
    coupon = session.scalars(
        select(Coupon).where(func.lower(Coupon.code) == order.coupon_code.lower())
    ).first()
    if coupon is None:
        return
    session.execute(
        update(Coupon)
        .where(Coupon.id == coupon.id)
        .where(func.coalesce(Coupon.redeemed_count, 0) > 0)
        .values(redeemed_count=Coupon.redeemed_count - 1)
        .execution_options(synchronize_session=False)
    )
    session.expire(coupon, ["redeemed_count"])
    session.flush()


def reoccupy_coupon(session: Session, order: Order) -> bool:
    """订单「复活」成交时把名额重新占回来，返回是否真的占回。
    """
    if not order.coupon_code:
        return True
    coupon = session.scalars(
        select(Coupon).where(func.lower(Coupon.code) == order.coupon_code.lower())
    ).first()
    if coupon is None:
        return True
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
    result = session.execute(statement)
    session.expire(coupon, ["redeemed_count"])
    session.flush()
    return result.rowcount > 0
