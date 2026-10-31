"""订单的破坏性变更：取消与删除。

两者都只在**很窄**的状态窗口里允许，且都先尝试关掉渠道侧的交易 —— 删掉一条本地订单
不会让用户手上的二维码失效，那笔延迟到账的钱就失去了凭证。
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request, status

from ..shared import _admin_actor, _audit
from ...store.shared import close_order_channel_best_effort
from ....commerce import fulfill
from ....commerce.order_status import order_status_label
from ....core.deps import AdminAccount, DbSession, order_or_404
from ....core.models import Product
from ....core.schemas import AdminOrderActionRequest
from ....core.serializers import order_payload
from ....payments.common.reconcile import RECONCILE_LOOKBACK_HOURS, channel_still_payable
from ....security.security import utcnow

router = APIRouter()


@router.post("/orders/{order_no}/cancel")
def admin_cancel(
    order_no: str,
    payload: AdminOrderActionRequest,
    request: Request,
    session: DbSession,
    admin: AdminAccount,
) -> dict:
    order = order_or_404(session, order_no)
    if order.status != "pending":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="只有待支付订单可以取消。")

    channel_closed = close_order_channel_best_effort(
        request,
        session,
        order,
        log_context="后台取消订单时",
        already_paid_detail="该订单已有付款记录，无法取消；请改用退款流程。",
    )

    product = session.get(Product, order.product_id) if order.product_id else None
    if not fulfill.close_pending_order(session, order=order, product=product):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="订单状态已变更，请刷新后重试。")
    if channel_closed:
        order.channel_closed_at = utcnow()
    session.flush()
    _audit(session, _admin_actor(admin), "order.cancel", order.order_no, payload.note)
    session.refresh(order)
    return order_payload(order)


@router.delete("/orders/{order_no}")
def admin_delete_order(order_no: str, session: DbSession, admin: AdminAccount) -> dict:
    """删除订单（用于清理测试单 / 垃圾单）。"""
    order = order_or_404(session, order_no)

    if order.status not in {"cancelled", "expired"}:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"状态为 {order_status_label(order.status)} 的订单不能删除；待支付请先取消，已支付请走退款。",
        )
    if order.license_id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="该订单已关联授权，不能删除；如需收回授权请使用退款。",
        )
    if order.license_state_before_json:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="该订单改动过一张已有授权（升级/增量包），不能删除；如需还原请使用退款。",
        )
    if channel_still_payable(order):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "该订单的支付宝交易尚未确认关闭，用户手上那个旧二维码仍可能被付款；"
                "删除会让一笔延迟到账的付款失去凭证。请等对账巡检关单后再删除"
                f"（下单后 {RECONCILE_LOOKBACK_HOURS} 小时内巡检会持续重试）。"
            ),
        )

    session.delete(order)
    session.flush()
    _audit(session, _admin_actor(admin), "order.delete", order_no, f"状态 {order.status}")
    return {"orderNo": order_no, "deleted": True}
