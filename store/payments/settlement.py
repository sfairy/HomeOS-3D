"""支付到账后的统一入账逻辑。

支付宝有两条确认到账的路径——异步通知和主动查单——必须收敛到同一段代码，
否则两条路很容易出现「一个会发码、另一个不会」的差异。

两个关键取舍：

1. **订单已超时关闭但钱确实收到了，仍然照常发码。** 钱在用户那边已经扣了，
   如果这里把订单当过期丢掉，用户就得走人工客服。这类「复活」单的库存预留
   在进入终态时就已经释放过，所以必须给 ``fulfill_order`` 传
   ``release_stock=False``——否则会扣掉其它待支付订单的预留额度。
2. **用条件 UPDATE 做幂等。** 支付宝会重复推送通知，而查单可能和通知同时到达；
   两个线程各自读到「未履约」就会重复发码。所以状态流转交给带条件的
   UPDATE，谁抢到谁入账。
"""

from __future__ import annotations

import logging

from sqlalchemy import update
from sqlalchemy.orm import Session

from store import fulfill
from store.models import Order, StoreSetting
from store.order_status import ORDER_STATUS_LABELS
from store.security import utcnow

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

    values: dict[str, object] = {"status": "paid", "paid_at": order.paid_at or moment}
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
    if original_status in {"expired", "cancelled"}:
        # 钱在用户那边已经扣了，码照发（否则用户只能找人工客服）。但这件库存
        # 的预留早已在订单进终态时还给别人，属于刻意保留的例外 —— 必须打上
        # 「待人工复核」标记并在后台告警，否则没人知道发生了超卖。
        order.needs_review = True
        order.review_note = (
            f"订单已{_status_text(original_status)}后支付才到账（{source}），"
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
        # expired / cancelled / payment_failed 在进入终态时已经释放过库存预留，
        # 这里是「钱到账了所以补发」，不能再扣一次预留（否则等于偷走其它待支付
        # 订单占的额度，直接放开超卖）。
        try:
            # SAVEPOINT 包住履约：失败时只回滚这一段的写入（发出去的半张授权、
            # 扣掉的库存、记上的邀请奖励），「已入账」这一状态本身保留 ——
            # 钱确实收到了，订单不能被当成没付过。
            with session.begin_nested():
                fulfill.fulfill_order(
                    session,
                    order=order,
                    setting=setting,
                    release_stock=original_status
                    not in {"expired", "cancelled", "payment_failed"},
                )
        except Exception as error:  # noqa: BLE001
            # 不能把 500 抛给支付宝：那会让它无限重推通知，而每次重推都会再走
            # 一遍同样的失败。这里把订单显式推到 fulfillment_failed 交后台人工
            # 处理（重试或退款），并把失败原因写进复核备注。
            _mark_fulfillment_failed(session, order_id=order.id, error=error)
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
    """把订单标记为发货失败并请求人工介入（独立事务段，不再受失败的履约影响）。"""
    session.execute(
        update(Order)
        .where(Order.id == order_id)
        .where(Order.status != "refunded")
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


def _status_text(status: str) -> str:
    return ORDER_STATUS_LABELS.get(status, status)

