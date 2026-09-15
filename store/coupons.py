"""优惠码核销的记账口径。

``Coupon.redeemed_count`` 是反规范化计数，必须与订单的成交结果同步增减：
它参与 ``max_redemptions`` 名额校验，一旦「占用」多于「归还」，名额就会被
永久占用，用户随后下单只能收到「优惠码已被领完」。

注意它与 ``coupon_redemptions`` 的语义**刻意不同**：核销记录是「这笔单曾
占用过名额」的历史凭证，订单取消后依然保留（用于对账）；而 ``redeemed_count``
表示「此刻仍被占用的名额」。后台的删除守卫数记录、名额校验数计数，两者不冲突。
"""

from __future__ import annotations

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from store.models import Account, Coupon, CouponRedemption, Order

#: 合法的折扣类型白名单。结算逻辑（``store.api.store``）只区分 ``fixed``
#: （立减固定金额）与其余（按百分比），所以取值必须收口在这里，后台校验复用同一份，
#: 避免出现「能存进库、但结算时按 percent 处理」的意外组合。
DISCOUNT_TYPES = frozenset({"percent", "fixed"})

#: 「名额已归还」的订单状态：这些路径都会调用 :func:`release_coupon`，所以它们的
#: 核销记录**不再占用名额**，既不该算进 ``max_redemptions``，也不该算进
#: ``per_account_limit``。
#:
#: 刻意不包含 ``refunded``：退款发生在付款成功之后，码确实被用掉了，名额不还给用户
#: （与库存口径一致 —— 退款不退名额，只退还预留）。
#:
#: 判定「这个账号还用没用过该码」必须排除这些状态，否则用户只要有一单被取消，
#: 就会永久失去这个优惠码：名额明明已经还回去了，却永远提示「你已使用过」。
RELEASED_STATUSES = frozenset({"cancelled", "expired", "payment_failed"})


class CouponUnavailable(RuntimeError):
    """名额在「校验」与「占用」之间被别的请求抢光了。"""


def redeem_coupon(
    session: Session, order: Order, coupon: Coupon, account: Account, discount: int
) -> None:
    """下单成功创建订单时占用一个名额：计数 +1 并写入核销记录。

    名额校验（``_evaluate_coupon``）与本函数之间隔着「创建订单」等若干次读写，
    两个并发请求会同时看到「还有名额」。所以这里用**带条件的原子 UPDATE** 占用：
    把 ``max_redemptions`` 的判断和自增放进同一条语句，由数据库决定谁抢到。
    抢不到就抛 :class:`CouponUnavailable`，由调用方转成 400 —— 绝不能出现
    ``redeemed_count`` 超过 ``max_redemptions`` 的情况（那意味着超发优惠）。
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
    result = session.execute(statement)
    if result.rowcount == 0:
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

    调用方都是把订单从 ``pending`` 推向终态的路径，而离开 ``pending`` 只会
    发生一次，所以每条订单的名额至多被归还一次。用带条件的原子递减兜底：
    即使某个异常路径重复归还，也不会把计数写成负数（负数会让名额凭空变多）。
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
