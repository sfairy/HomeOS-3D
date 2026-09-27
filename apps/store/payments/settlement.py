"""支付到账后的统一入账逻辑。
"""

from __future__ import annotations

import logging

from sqlalchemy import update
from sqlalchemy.orm import Session

from apps.store.commerce import coupons, fulfill
from apps.store.ops import incidents
from apps.store.core.models import Order, StoreSetting
from apps.store.commerce.order_status import RESERVING_STATUSES, order_status_label
from apps.store.security.security import utcnow

logger = logging.getLogger("apps.store.payments.settlement")

#: 允许被入账的状态。fulfilled / refunded 不在其中，保证幂等。
_SETTLEABLE_STATUSES = (
    "pending",
    "paid",
    "expired",
    "cancelled",
    "payment_failed",
    "fulfillment_failed",
)

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
        "manual_settlement": False,
    }
    if trade_no:
        values["payment_trade_no"] = trade_no

    # 条件更新：只有仍处于可入账状态的行才会被改写。
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
    revived = order.stock_reservation_released_at is not None or (
        original_status not in RESERVING_STATUSES
    )
    if revived:
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
        try:
            # SAVEPOINT 包住履约：失败时只回滚这一段的写入（发出去的半张授权、
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
    """
    session.execute(
        update(Order)
        .where(Order.id == order_id)
        .where(Order.status.in_(_FAILURE_MARKABLE_STATUSES))
        .values(
            status="fulfillment_failed",
            # 履约中途抛异常时 fulfilled_at 可能已被抢单语句写上，必须清掉，
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

