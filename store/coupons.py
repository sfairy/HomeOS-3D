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


def holds_slot_conditions() -> tuple:
    """「此刻仍占着名额」的 SQL 判据 —— 所有判定点的**唯一来源**。

    四个地方要回答同一个问题（读时校验、原子占用、后台重算、自检），过去各写
    一遍 ``or_(order_id.is_(None), status.notin_(RELEASED))``。任何一处写歪都会
    产生「读时放行、写时拒绝」的莫名 400，或者反过来超发折扣，所以收在这里。

    三个条件缺一不可：

    * ``voided_at IS NULL`` —— 作废过的记录不占名额；
    * ``order_id IS NOT NULL`` —— **订单已被删除的记录不占名额**。这一条曾经是
      反过来的（``order_id IS NULL`` 也算占用，理由是「订单没了不代表没用过」），
      但能走到 ``order_id IS NULL`` 的路径只有 ``admin_delete_order``，而它只允许
      删除 ``cancelled`` / ``expired`` 的订单 —— 这两种状态在归还名额时就已经
      调用过 ``release_coupon``。把删除后的记录重新算成「占用」，等于「清理一张
      垃圾单就会把一个名额永久钉死」：``per_account_limit=1`` 的账号从此再也用不了
      这个码，而且后台界面显示的占用数是对的、没有任何线索指向那次删除。
    * 订单不在 ``RELEASED_STATUSES`` 里 —— 取消/超时/失败后名额已归还。
    """
    return (
        CouponRedemption.voided_at.is_(None),
        CouponRedemption.order_id.is_not(None),
        Order.status.notin_(RELEASED_STATUSES),
    )


def holds_slot(record: CouponRedemption, order: Order | None) -> bool:
    """:func:`holds_slot_conditions` 的 Python 版（后台列表逐行渲染用）。

    两份实现必须同口径 —— ``smoke.py::check_coupon_redemption_ledger`` 用一张
    状态矩阵把两边逐格对比，任何一边改了规则都会立刻变红。
    """
    if record.voided_at is not None:
        return False
    if record.order_id is None:
        return False
    #: 外键是 ``ON DELETE SET NULL``，所以 ``order_id`` 非空就必然能查到订单；
    #: 真查不到时按「证明不了它占名额」处理（失败方向是宽松的，与 SQL 侧的
    #: 内连接语义一致 —— 连不上的行不会出现在结果里）。
    return order is not None and order.status not in RELEASED_STATUSES


def active_redemption_count(session: Session, *, coupon_id: str, account_id: str) -> int:
    """该账号在这个码上**仍占着名额**的核销记录数。

    「仍占着」的判据见 :func:`holds_slot_conditions`，与读时校验、原子占用
    完全一致 —— 三处必须同一口径，否则会出现「读时放行、写时拒绝」的莫名 400。
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

    名额校验（``_evaluate_coupon``）与本函数之间隔着「创建订单」等若干次读写，
    两个并发请求会同时看到「还有名额」。所以这里用**带条件的原子 UPDATE** 占用：
    把 ``max_redemptions`` 与 ``per_account_limit`` 的判断都和自增放进同一条语句，
    由数据库决定谁抢到。抢不到就抛 :class:`CouponUnavailable`，由调用方转成 400 ——
    绝不能出现 ``redeemed_count`` 超过 ``max_redemptions`` 的情况（那意味着超发优惠）。

    ``per_account_limit`` 必须在这里也拦一道，不能只靠读时那次 ``SELECT COUNT``：
    ``redeem_coupon`` 的原子条件过去只覆盖 ``max_redemptions``，对 ``account_id``
    没有任何约束，于是同账号两个并发 ``POST /orders`` 各自读到
    ``used=0`` 并双双通过 —— ``per_account_limit=1`` 形同虚设，100% 折扣码
    可以直接刷出免费授权（而 S41 的待付单竞态正好提供了这条并发路径）。
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
        # 该账号仍占用中的核销记录数，作为**相关标量子查询**参与 WHERE。
        # 整个判断与自增在同一条 UPDATE 里完成，并发下只有一个能成功。
        #
        # 这里刻意不用 ``EXISTS(... HAVING count(...) >= limit)``：没有 GROUP BY 时
        # SQLite 会判定为「非聚合查询」并直接报
        # ``OperationalError: HAVING clause on a non-aggregate query``。
        # 标量子查询既避开这个方言坑，读起来也更直接：count < limit 才放行。
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
        # 走到这里说明名额在「读时校验」之后被抢走了。区分两种原因只是为了给出
        # 可操作的文案：错误路径上多查一次不影响正确性。
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


def reoccupy_coupon(session: Session, order: Order) -> bool:
    """订单「复活」成交时把名额重新占回来，返回是否真的占回。

    ``release_coupon`` 只递减 ``redeemed_count``，刻意**不删**核销记录（记录要
    留着回答「这个账号用没用过这个码」，见模块开头）。于是超时/取消后又收到钱的
    复活单会出现「核销记录在、名额不算数」的错位：该码看起来还有名额，能被别人
    再领一次，``max_redemptions`` 实际被突破。

    ``max_redemptions`` 是硬约束，所以名额已被抢光时不再加码 —— 但订单照常入账
    （用户钱都付了，不能因为优惠码名额没了就不给授权），返回 ``False`` 让调用方
    记一条告警告诉运营「这单的折扣没有再占用名额」。
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
