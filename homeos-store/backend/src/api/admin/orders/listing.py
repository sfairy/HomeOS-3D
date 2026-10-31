"""订单只读视图：列表与某张订单的退款流水。

读路径刻意不做任何写入：过期收尾交给支付巡检，列表接口不在这里「顺手」改状态 ——
否则一次翻页就会在一批订单上持有写锁。
"""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter
from sqlalchemy import or_, select

from ..shared import _naive_utc, _page
from ....core.deps import AdminAccount, DbSession, order_or_404
from ....core.models import Order, OrderRefund
from ....core.serializers import order_payload
from ....payments.common.channels import provider_label
from ....payments.common.reconcile import channel_still_payable
from ....security.security import iso_z

router = APIRouter()


@router.get("/orders")
def admin_list_orders(
    session: DbSession,
    _admin: AdminAccount,
    status_filter: str | None = None,
    keyword: str | None = None,
    needs_review: bool | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    limit: int = 100,
    offset: int = 0,
) -> dict:
    """订单列表（分页 + 筛选）。过期收尾由支付巡检负责，列表读路径不再同步过期。"""
    base = select(Order)
    wanted = [part.strip() for part in (status_filter or "").split(",") if part.strip()]
    if wanted:
        base = base.where(Order.status.in_(wanted))
    if keyword:
        like = f"%{keyword.strip()}%"
        base = base.where(or_(Order.order_no.like(like), Order.email.like(like), Order.product_name.like(like)))
    if needs_review:
        base = base.where(Order.needs_review.is_(True))
    start = _naive_utc(date_from)
    if start is not None:
        base = base.where(Order.created_at >= start)
    end = _naive_utc(date_to)
    if end is not None:
        base = base.where(Order.created_at <= end)
    return _page(
        session,
        base,
        (Order.created_at.desc(),),
        limit=limit,
        offset=offset,
        render=lambda row: {
            **order_payload(row),
            "channelPayable": channel_still_payable(row),
            "paymentProvider": row.payment_provider or "",
            "paymentProviderLabel": provider_label(row.payment_provider),
        },
    )


@router.get("/orders/{order_no}/refunds")
def admin_list_order_refunds(order_no: str, session: DbSession, _admin: AdminAccount) -> dict:
    """某张订单的退款流水（含被渠道拒绝的尝试）。"""
    order = order_or_404(session, order_no)
    rows = session.scalars(
        select(OrderRefund).where(OrderRefund.order_id == order.id).order_by(OrderRefund.created_at.desc())
    ).all()
    total_cents = int(order.amount_cents or 0)
    refunded_cents = int(order.refund_amount_cents or 0)
    return {
        "orderNo": order.order_no,
        "amountCents": total_cents,
        "refundedCents": refunded_cents,
        "refundableCents": max(0, total_cents - refunded_cents),
        "items": [
            {
                "id": row.id,
                "amountCents": int(row.amount_cents or 0),
                "status": row.status,
                "offline": bool(row.offline),
                "tradeNo": row.trade_no,
                "outRequestNo": row.out_request_no,
                "reason": row.reason,
                "detail": row.detail,
                "operator": row.operator,
                "createdAt": iso_z(row.created_at),
            }
            for row in rows
        ],
    }
