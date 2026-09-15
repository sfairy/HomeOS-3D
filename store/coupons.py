"""优惠码核销的记账口径。

``Coupon.redeemed_count`` 是反规范化计数，必须与订单的成交结果同步增减：
它参与 ``max_redemptions`` 名额校验，一旦「占用」多于「归还」，名额就会被
永久占用，用户随后下单只能收到「优惠码已被领完」。

注意它与 ``coupon_redemptions`` 的语义**刻意不同**：核销记录是「这笔单曾
占用过名额」的历史凭证，订单取消后依然保留（用于对账）；而 ``redeemed_count``
表示「此刻仍被占用的名额」。后台的删除守卫数记录、名额校验数计数，两者不冲突。
"""

from __future__ import annotations

from sqlalchemy import func, select
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


def redeem_coupon(
    session: Session, order: Order, coupon: Coupon, account: Account, discount: int
) -> None:
    """下单成功创建订单时占用一个名额：计数 +1 并写入核销记录。"""
    coupon.redeemed_count = int(coupon.redeemed_count or 0) + 1
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
    发生一次，所以每条订单的名额至多被归还一次。
    """
    if not order.coupon_code:
        return
    coupon = session.scalars(
        select(Coupon).where(func.lower(Coupon.code) == order.coupon_code.lower())
    ).first()
    if coupon is None:
        return
    coupon.redeemed_count = max(0, int(coupon.redeemed_count or 0) - 1)
    session.flush()
