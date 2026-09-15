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
from store.security import utcnow

logger = logging.getLogger("store.payments.settlement")

#: 允许被入账的状态。fulfilled / refunded 不在其中，保证幂等
_SETTLEABLE_STATUSES = ("pending", "paid", "expired", "cancelled", "payment_failed")


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
        if order.status == "refunded":
            # 已退款订单不能再发码；但也不能报错，否则支付宝会一直重推通知
            logger.error(
                "收到支付成功但订单已退款，已忽略 order=%s trade_no=%s source=%s",
                order.order_no,
                trade_no,
                source,
            )
            return {"changed": False, "skipped": "refunded"}
        logger.info("订单已由其它路径入账，跳过 order=%s source=%s", order.order_no, source)
        return {"changed": False, "alreadyFulfilled": True, "licenseId": order.license_id}

    session.refresh(order)
    if original_status in {"expired", "cancelled"}:
        logger.warning(
            "订单 %s 已关闭（原状态 %s）但确认收到支付，按已支付处理并补发授权",
            order.order_no,
            original_status,
        )

    # 手动发卡商品只标记已支付，等管理员核对后发码
    if order.fulfillment_mode != "manual":
        # expired / cancelled / payment_failed 在进入终态时已经释放过库存预留，
        # 这里是「钱到账了所以补发」，不能再扣一次预留（否则等于偷走其它待支付
        # 订单占的额度，直接放开超卖）。
        fulfill.fulfill_order(
            session,
            order=order,
            setting=setting,
            release_stock=original_status not in {"expired", "cancelled", "payment_failed"},
        )

    session.refresh(order)
    logger.info(
        "订单入账 order=%s source=%s trade_no=%s status=%s",
        order.order_no,
        source,
        trade_no or "-",
        order.status,
    )
    return {"changed": True, "alreadyFulfilled": False, "licenseId": order.license_id}

