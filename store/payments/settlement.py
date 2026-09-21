"""支付到账后的统一入账逻辑。

支付宝有两条确认到账的路径 —— 异步通知与主动查单 —— 必须收敛到同一段代码，否则很容易出现
「一个会发码、另一个不会」的差异。

两个关键取舍：① 订单已超时关闭但钱确实收到了仍照常发码（钱在用户那边已扣，丢掉就得走人工客服）；
这类「复活」单的库存预留在进终态时已释放过，所以判据不是调用方读到的状态，而是订单上持久化的
``stock_reservation_released_at``。② 用条件 UPDATE 做幂等：支付宝会重复推送、查单也可能与通知同时
到达，状态流转交给带条件的 UPDATE，谁抢到谁入账。
"""

from __future__ import annotations

import logging

from sqlalchemy import update
from sqlalchemy.orm import Session

from store.commerce import coupons, fulfill
from store.ops import incidents
from store.core.models import Order, StoreSetting
from store.commerce.order_status import RESERVING_STATUSES, order_status_label
from store.security.security import utcnow

logger = logging.getLogger("store.payments.settlement")

#: 允许被入账的状态。fulfilled / refunded 不在其中，保证幂等。
#: ``fulfillment_failed`` 在列：上一轮发货失败时预留与名额都还挂着，收到
#: 渠道通知（含重推）应当重新尝试履约。
_SETTLEABLE_STATUSES = (
    "pending",
    "paid",
    "expired",
    "cancelled",
    "payment_failed",
    "fulfillment_failed",
)

#: 允许被标记为「发货失败」的状态。刻意收得很窄：``paid``（入账刚改到 paid，履约抛异常时就是这个
#: 状态）与 ``fulfillment_failed``（人工重试又失败，保持原状并刷新原因）。
#: 过去这里只排除 ``refunded``，于是并发的**成功**履约或一笔部分退款都会被这句 UPDATE 覆盖成
#: ``fulfillment_failed``、连 ``fulfilled_at`` 也被清空 —— 码已发出、账面却显示待重试，而且重试闸门
#: （``fulfilled_at IS NULL``）被打开，再点一次就会**重复发码**。
_FAILURE_MARKABLE_STATUSES = ("paid", "fulfillment_failed")


def settle_paid_order(
    session: Session,
    *,
    order: Order,
    setting: StoreSetting,
    trade_no: str = "",
    source: str = "alipay",
) -> dict:
    """把订单标记为已支付并履约。幂等：重复/并发调用都不会重复发码。"""
    original_status = order.status
    moment = utcnow()

    values: dict[str, object] = {
        "status": "paid",
        "paid_at": order.paid_at or moment,
        # 走到这里就是**渠道**说钱收到了（异步通知 / 主动查单 / 同步跳转），是全系统最强的
        # 证据。因此顺手清掉人工补记标记：先被人工补记放行、钱随后真到账的订单从此计入营收，
        # 否则「补记过」会永久把真实收入挡在 KPI 之外，运营也没办法加回来。
        "manual_settlement": False,
    }
    if trade_no:
        values["payment_trade_no"] = trade_no

    # 条件更新：只有仍处于可入账状态的行才会被改写。
    # 并发下 rowcount 为 0 说明另一个路径（通知/查单）已经处理过了。
    result = session.execute(
        update(Order)
        .where(Order.id == order.id)
        .where(Order.status.in_(_SETTLEABLE_STATUSES))
        .values(**values)
        .execution_options(synchronize_session=False)
    )
    if result.rowcount == 0:
        session.refresh(order)
        if order.status in {"refunded", "partially_refunded"}:
            # 已退款订单不能再发码；但也不能报错，否则支付宝会一直重推通知。
            # 部分退款同样是「已经算过账」的单：再入账一次会重复发码。
            logger.error(
                "收到支付成功但订单已退款（%s），已忽略 order=%s trade_no=%s source=%s",
                order.status,
                order.order_no,
                trade_no,
                source,
            )
            return {"changed": False, "skipped": order.status}
        logger.info("订单已由其它路径入账，跳过 order=%s source=%s", order.order_no, source)
        return {"changed": False, "alreadyFulfilled": True, "licenseId": order.license_id}

    session.refresh(order)
    #: 「复活单」判据必须与库存预留的**实际**状态一致，而不是入账前读到的 ``original_status``
    #: （可能已过期——读到 pending、期间被过期扫描改成 expired，会漏掉复核标记）。
    #: ``stock_reservation_released_at`` 非空 ⟺ 此前进过终态，即「复活单」；存量订单该列为 NULL，回落状态比较。
    revived = order.stock_reservation_released_at is not None or (
        original_status not in RESERVING_STATUSES
    )
    if revived:
        # 钱在用户那边已经扣了，码照发，但库存预留早在进终态时已还给别人，属于刻意保留的例外，
        # 必须打「待人工复核」标记并告警。优惠码名额同理：release_coupon 已还名额但核销记录还在，
        # 复活成交要重新占回，否则 redeemed_count 少算、max_redemptions 会被后来者突破。
        if order.coupon_code and not coupons.reoccupy_coupon(session, order):
            logger.warning(
                "复活单未能重新占用优惠码名额（名额已满）order=%s code=%s",
                order.order_no,
                order.coupon_code,
            )
        order.needs_review = True
        order.review_note = (
            f"订单{order_status_label(original_status)}后才收到支付（{source}），"
            "库存预留此前已释放，请核对是否需要补货或退款。"
        )
        session.flush()
        logger.warning(
            "订单 %s 已关闭（原状态 %s）但确认收到支付，按已支付处理并补发授权，"
            "已标记待人工复核",
            order.order_no,
            original_status,
        )

    # 手动发卡商品只标记已支付，等管理员核对后发码
    if order.fulfillment_mode != "manual":
        # expired / cancelled / payment_failed 进终态时已释放过库存预留，这里是「钱到账了所以
        # 补发」，不能再扣一次预留（否则偷走其它待支付订单的额度，直接放开超卖）。该判断交给
        # ``fulfill_order`` 读持久化的 ``stock_reservation_released_at``，避免两处两套写法漂移。
        try:
            # SAVEPOINT 包住履约：失败时只回滚这一段的写入（发出去的半张授权、
            # 扣掉的库存、记上的邀请奖励），「已入账」这一状态本身保留 ——
            # 钱确实收到了，订单不能被当成没付过。
            with session.begin_nested():
                fulfill.fulfill_order(
                    session,
                    order=order,
                    setting=setting,
                )
        except Exception as error:  # noqa: BLE001
            # 不能把 500 抛给支付宝：那会让它无限重推通知，而每次重推都会再走
            # 一遍同样的失败。这里把订单显式推到 fulfillment_failed 交后台人工
            # 处理（重试或退款），并把失败原因写进复核备注。
            _mark_fulfillment_failed(session, order_id=order.id, error=error)
            # 除了日志，还要留下**能被接口读到**的计数：这一条是本文件里最重
            # 的失败 —— 钱已经入账，授权却没发出去。只写日志时它和「巡检一切正常」
            # 在后台长得一模一样，运维得先知道去翻日志才可能发现。
            incidents.note("fulfillment", order_no=order.order_no, error=error)
            logger.exception("订单入账后履约失败 order=%s source=%s", order.order_no, source)
            return {"changed": True, "alreadyFulfilled": False, "licenseId": None}

    session.refresh(order)
    logger.info(
        "订单入账 order=%s source=%s trade_no=%s status=%s",
        order.order_no,
        source,
        trade_no or "-",
        order.status,
    )
    return {"changed": True, "alreadyFulfilled": False, "licenseId": order.license_id}


def _mark_fulfillment_failed(session: Session, *, order_id: str, error: Exception) -> None:
    """把订单标记为发货失败并请求人工介入（独立事务段，不再受失败的履约影响）。
    状态守卫必须收窄（见 ``_FAILURE_MARKABLE_STATUSES``）：履约抛异常时，另一个线程或另一次重推可能
    已经把这单履约成功、或运营已经退了款；无条件地写 ``fulfillment_failed`` 会覆盖这些结果，并顺手
    清空 ``fulfilled_at`` —— 那正是重试的幂等闸门，被打开意味着下一次重试会重复发码。
    """
    session.execute(
        update(Order)
        .where(Order.id == order_id)
        .where(Order.status.in_(_FAILURE_MARKABLE_STATUSES))
        .values(
            status="fulfillment_failed",
            # 履约中途抛异常时 fulfilled_at 可能已被抢单语句写上，必须清掉，
            # 否则重试会被幂等闸门直接判成「已完成」。
            fulfilled_at=None,
            needs_review=True,
            review_note=f"履约失败：{_short_error(error)}",
        )
        .execution_options(synchronize_session=False)
    )
    session.flush()


def _short_error(error: Exception) -> str:
    text = str(error).strip() or error.__class__.__name__
    return text[:230]

