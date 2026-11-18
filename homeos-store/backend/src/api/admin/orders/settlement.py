"""「钱已经到账」侧的订单动作：人工补记、线下入账、履约、复核。

``manual_settlement`` 是**是否排除出营收**的标记（与 ``api/admin/shared.py`` 的
``_billable_money_clause() = Order.manual_settlement.is_(False)`` 配套）：

- 人工补记（``mark-paid``）→ ``manual_settlement=True``，**不计入营收**；
- 线下收款入账（``settle-offline``）→ ``manual_settlement=False``，**计入营收**。

这个标记直接决定财务报表，所以两条路由共用 ``_manual_payment``，并加了两道守卫：
渠道已入账的订单不允许人工改写口径；已入账订单的口径翻转需要显式
``overrideRevenue=true`` 并写进审计。
"""

from __future__ import annotations

import logging
from collections.abc import Callable
from typing import Any

from fastapi import APIRouter, BackgroundTasks, HTTPException, Request, status
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from ..shared import (
    _FULFILLABLE_STATUS_TEXT,
    _admin_actor,
    _audit,
)
from ....commerce import delivery, fulfill
from ....commerce.order_status import (
    FAILURE_MARKABLE_STATUSES as ORDER_FAILURE_MARKABLE_STATUSES,
)
from ....commerce.order_status import (
    FULFILLABLE_STATUSES as ORDER_FULFILLABLE_STATUSES,
)
from ....commerce.order_status import order_status_label
from ....core.deps import AdminAccount, DbSession, order_or_404
from ....core.models import Order, StoreSetting
from ....core.schemas import AdminOrderReviewRequest
from ....core.serializers import order_payload
from ....ops import site_settings as site_config
from ....payments.common.channels import provider_label
from ....security.security import utcnow

logger = logging.getLogger("src.admin")

router = APIRouter()


def _fulfill_with_failure_state(
    session: Session,
    *,
    order: Order,
    setting: StoreSetting,
    actor: str,
    on_fulfilled: Callable[[str], None] | None = None,
) -> dict:
    """履约并处理失败：抛异常时把订单标记为 fulfillment_failed 而不是 500。

    ``on_fulfilled`` 在**履约成功**时被调用，用来把发码邮件排到响应之后。
    失败的路径不调用它：那种情况下本来就没有码可发。
    """
    try:
        with session.begin_nested():
            fulfill.fulfill_order(session, order=order, setting=setting)
    except Exception as error:
        reason = str(error).strip() or error.__class__.__name__
        previous = session.execute(select(Order.review_note).where(Order.id == order.id)).scalar_one_or_none() or ""
        note = f"履约失败：{reason[:230]}"
        if previous and note not in previous:
            keep = max(0, 255 - len(note) - 1)
            note = f"{previous[:keep]}｜{note}"
        session.execute(
            update(Order)
            .where(Order.id == order.id)
            .where(Order.status.in_(ORDER_FAILURE_MARKABLE_STATUSES))
            .values(
                status="fulfillment_failed",
                fulfilled_at=None,
                needs_review=True,
                review_note=note[:255],
            )
            .execution_options(synchronize_session=False)
        )
        session.flush()
        _audit(session, actor, "order.fulfill_failed", order.order_no, reason[:200])
        logger.exception("后台履约失败 order=%s", order.order_no)
        session.refresh(order)
        return order_payload(order)
    session.refresh(order)
    _audit(session, actor, "order.fulfill", order.order_no)
    if on_fulfilled is not None:
        on_fulfilled(order.id)
    return order_payload(order)


def _delivery_scheduler(request: Request, background: BackgroundTasks):
    """把「发码邮件」排到响应之后执行。

    必须等到响应之后：DbSession 的提交发生在响应发出之前，而后台任务在响应之后运行，
    这样发信看到的一定是已经落库的授权；反过来（在请求里直接发）会让邮件与授权共用
    同一个未提交事务，既可能发出一个「还不存在」的授权，也会把 SMTP 的秒级等待塞进
    持锁的写事务里。
    """
    database = request.app.state.database

    def schedule(order_id: str) -> None:
        background.add_task(delivery.notify_license_issued, database, order_id=order_id)

    return schedule


@router.post("/orders/{order_no}/mark-paid")
def admin_mark_paid(
    order_no: str,
    request: Request,
    session: DbSession,
    background: BackgroundTasks,
    admin: AdminAccount,
    overrideRevenue: bool = False,
) -> dict:
    """人工补记：把订单放行（发码），但**不计入营收**。"""
    return _manual_payment(
        session,
        order_no,
        admin=admin,
        manual_settlement=True,
        on_fulfilled=_delivery_scheduler(request, background),
        override_revenue=overrideRevenue,
    )


@router.post("/orders/{order_no}/settle-offline")
def admin_settle_offline(
    order_no: str,
    request: Request,
    session: DbSession,
    background: BackgroundTasks,
    admin: AdminAccount,
    overrideRevenue: bool = False,
) -> dict:
    """线下收款入账：人工确认这笔钱**已经收到**（转账/现金），计入营收。"""
    return _manual_payment(
        session,
        order_no,
        admin=admin,
        manual_settlement=False,
        on_fulfilled=_delivery_scheduler(request, background),
        override_revenue=overrideRevenue,
    )


def _revenue_guard(order: Any, *, manual_settlement: bool, override_revenue: bool) -> bool:
    """营收口径守卫；返回本次是否真的翻转了口径（供审计记录）。

    - 渠道已入账（``paid_at`` 有值且 provider 不是 ``manual``）：营收口径由渠道流水
      决定，人工动作一律 409 —— 否则一次误点就能把真实收款从报表里抹掉。
    - 已入账订单的人工口径翻转：需要显式 ``overrideRevenue=true``，并写审计。
    """
    provider = str(getattr(order, "payment_provider", "") or "").strip()
    if getattr(order, "paid_at", None) is not None and provider not in ("", "manual"):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"该订单已通过「{provider_label(provider)}」入账，营收口径由渠道决定，不能人工改写。",
        )
    previous_flag = bool(getattr(order, "manual_settlement", False))
    flips = getattr(order, "paid_at", None) is not None and previous_flag != manual_settlement
    if flips and not override_revenue:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "该订单已入账，本操作会改写营收口径（"
                + ("移出营收" if manual_settlement else "计入营收")
                + "）。确认要更正报表请重试并带上 overrideRevenue=true。"
            ),
        )
    return flips


def _manual_payment(
    session: Session,
    order_no: str,
    *,
    admin: AdminAccount,
    manual_settlement: bool,
    on_fulfilled: Callable[[str], None] | None = None,
    override_revenue: bool = False,
) -> dict:
    """``mark-paid`` / ``settle-offline`` 的共用实现。"""
    setting = site_config.get_setting(session)
    order = order_or_404(session, order_no)
    if order.status == "fulfilled":
        return order_payload(order)
    if order.status not in ORDER_FULFILLABLE_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"订单状态为{order_status_label(order.status)}，无法标记支付；"
                f"只有{_FULFILLABLE_STATUS_TEXT}的订单可以标记支付。"
            ),
        )
    previous_flag = bool(order.manual_settlement)
    flips_revenue = _revenue_guard(
        order,
        manual_settlement=manual_settlement,
        override_revenue=override_revenue,
    )
    result = session.execute(
        update(Order)
        .where(Order.id == order.id)
        .where(Order.status.in_(ORDER_FULFILLABLE_STATUSES))
        .values(
            status="paid",
            paid_at=order.paid_at or utcnow(),
            payment_provider=order.payment_provider or "manual",
            manual_settlement=manual_settlement,
        )
        .execution_options(synchronize_session=False)
    )
    if result.rowcount == 0:  # pyright: ignore[reportAttributeAccessIssue]  # SQLAlchemy CursorResult.rowcount 动态属性
        session.refresh(order)
        logger.info("标记支付重复提交，已忽略 order=%s status=%s", order.order_no, order.status)
        return order_payload(order)
    session.refresh(order)
    note = "" if manual_settlement else "人工确认已收到钱（线下），计入营收"
    if flips_revenue:
        delta = f"覆盖营收口径：manual_settlement {previous_flag} → {manual_settlement}"
        note = f"{note}；{delta}" if note else delta
    _audit(
        session,
        _admin_actor(admin),
        "order.mark_paid" if manual_settlement else "order.settle_offline",
        order.order_no,
        note,
    )
    if order.fulfillment_mode != "manual":
        return _fulfill_with_failure_state(
            session,
            order=order,
            setting=setting,
            actor=_admin_actor(admin),
            on_fulfilled=on_fulfilled,
        )
    session.refresh(order)
    return order_payload(order)


@router.post("/orders/{order_no}/fulfill")
def admin_fulfill(
    order_no: str,
    request: Request,
    session: DbSession,
    background: BackgroundTasks,
    admin: AdminAccount,
) -> dict:
    setting = site_config.get_setting(session)
    order = order_or_404(session, order_no)
    if order.status == "fulfilled":
        return order_payload(order)
    if order.status not in ORDER_FULFILLABLE_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"订单状态为{order_status_label(order.status)}，不能履约；"
                f"只有{_FULFILLABLE_STATUS_TEXT}的订单可以履约。"
            ),
        )
    if order.paid_at is None:
        session.execute(
            update(Order)
            .where(Order.id == order.id)
            .where(Order.paid_at.is_(None))
            .values(paid_at=utcnow(), manual_settlement=True)
            .execution_options(synchronize_session=False)
        )
        session.refresh(order)
    return _fulfill_with_failure_state(
        session,
        order=order,
        setting=setting,
        actor=_admin_actor(admin),
        on_fulfilled=_delivery_scheduler(request, background),
    )


@router.post("/orders/{order_no}/review")
def admin_review_order(
    order_no: str, payload: AdminOrderReviewRequest, session: DbSession, admin: AdminAccount
) -> dict:
    """把订单的「待复核」标记清掉（人工已处理）。"""
    order = order_or_404(session, order_no)
    if order.status == "pending":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="订单尚未支付，没有需要处理的复核事项。",
        )
    if not order.needs_review:
        return order_payload(order)

    previous = (order.review_note or "").strip()
    note = (payload.note or "").strip()
    stamp = utcnow().strftime("%Y-%m-%d %H:%M UTC")
    order.needs_review = False
    order.review_note = (f"{previous}｜{stamp} 已处理：{note}" if note else f"{previous}｜{stamp} 已处理")[:255]
    session.flush()
    _audit(
        session,
        _admin_actor(admin),
        "order.review",
        order.order_no,
        note[:200] or "标记为已处理",
    )
    session.refresh(order)
    return order_payload(order)
