"""运营后台的 orders 资源组。
"""
from __future__ import annotations

import logging
from collections.abc import Callable
from datetime import datetime

from fastapi import APIRouter, BackgroundTasks, HTTPException, Request, status
from sqlalchemy import delete, or_, select, update
from sqlalchemy.orm import Session

from ..commerce import coupons, delivery, fulfill, money, referrals
from ..commerce.order_status import (
    FAILURE_MARKABLE_STATUSES as ORDER_FAILURE_MARKABLE_STATUSES,
)
from ..commerce.order_status import (
    FULFILLABLE_STATUSES as ORDER_FULFILLABLE_STATUSES,
)
from ..commerce.order_status import (
    REFUNDABLE_STATUSES as ORDER_REFUNDABLE_STATUSES,
)
from ..commerce.order_status import (
    order_status_label,
    refundable_cents,
)
from ..core.deps import AdminAccount, DbSession, order_or_404
from ..core.models import (
    DeviceBinding,
    Entitlement,
    License,
    LicenseSession,
    Order,
    OrderRefund,
    Product,
    RecoveryToken,
    StoreSetting,
)
from ..core.schemas import (
    AdminOrderActionRequest,
    AdminOrderReviewRequest,
)
from ..core.serializers import (
    order_payload,
)
from ..ops import incidents
from ..ops import site_settings as site_config
from ..payments import PROVIDER_NAMES, normalize_provider_name, refunds
from ..payments.base import PaymentError
from ..payments.channels import provider_label
from ..payments.reconcile import RECONCILE_LOOKBACK_HOURS, channel_still_payable
from ..payments.refunds import (
    claim_refund_amount,
    record_refund_audit,
    refund_lock,
)
from ..security.security import (
    iso_z,
    new_uuid,
    utcnow,
)

logger = logging.getLogger("src.admin")


from .admin_shared import (
    _FULFILLABLE_STATUS_TEXT,
    _admin_actor,
    _audit,
    _naive_utc,
    _page,
)
from .store_shared import close_order_channel_best_effort

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
    """订单列表（分页 + 筛选）。过期收尾由支付巡检负责，列表读路径不再同步过期。
    """
    base = select(Order)
    wanted = [part.strip() for part in (status_filter or "").split(",") if part.strip()]
    if wanted:
        base = base.where(Order.status.in_(wanted))
    if keyword:
        like = f"%{keyword.strip()}%"
        base = base.where(
            or_(Order.order_no.like(like), Order.email.like(like), Order.product_name.like(like))
        )
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
        previous = (
            session.execute(
                select(Order.review_note).where(Order.id == order.id)
            ).scalar_one_or_none()
            or ""
        )
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
) -> dict:
    """人工补记：把订单放行（发码），但**不计入营收**。
    """
    return _manual_payment(
        session,
        order_no,
        admin=admin,
        manual_settlement=True,
        on_fulfilled=_delivery_scheduler(request, background),
    )


@router.post("/orders/{order_no}/settle-offline")
def admin_settle_offline(
    order_no: str,
    request: Request,
    session: DbSession,
    background: BackgroundTasks,
    admin: AdminAccount,
) -> dict:
    """线下收款入账：人工确认这笔钱**已经收到**（转账/现金），计入营收。
    """
    return _manual_payment(
        session,
        order_no,
        admin=admin,
        manual_settlement=False,
        on_fulfilled=_delivery_scheduler(request, background),
    )


def _manual_payment(
    session: Session,
    order_no: str,
    *,
    admin: AdminAccount,
    manual_settlement: bool,
    on_fulfilled: Callable[[str], None] | None = None,
) -> dict:
    """``mark-paid`` / ``settle-offline`` 的共用实现。
    """
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
    if result.rowcount == 0:  # type: ignore[reportAttributeAccessIssue]  # SQLAlchemy CursorResult.rowcount 动态属性
        session.refresh(order)
        logger.info("标记支付重复提交，已忽略 order=%s status=%s", order.order_no, order.status)
        return order_payload(order)
    session.refresh(order)
    _audit(
        session,
        _admin_actor(admin),
        "order.mark_paid" if manual_settlement else "order.settle_offline",
        order.order_no,
        "" if manual_settlement else "人工确认已收到钱（线下），计入营收",
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
    """把订单的「待复核」标记清掉（人工已处理）。
    """
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
    order.review_note = (
        f"{previous}｜{stamp} 已处理：{note}" if note else f"{previous}｜{stamp} 已处理"
    )[:255]
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


@router.post("/orders/{order_no}/refund")
def admin_refund(
    order_no: str,
    payload: AdminOrderActionRequest,
    request: Request,
    session: DbSession,
    admin: AdminAccount,
) -> dict:
    """后台退款。真正的逻辑在 ``_refund_order``，这里只负责把同一订单的退款串行化。"""
    with refund_lock(order_no):
        result = _refund_order(order_no, payload, request, session, admin)
        session.commit()
        return result


def _refund_order(
    order_no: str,
    payload: AdminOrderActionRequest,
    request: Request,
    session: Session,
    admin: AdminAccount,
) -> dict:
    setting = site_config.get_setting(session)
    order = order_or_404(session, order_no)
    if order.status not in ORDER_REFUNDABLE_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"订单状态为{order_status_label(order.status)}，无法退款。",
        )

    total_cents = max(0, int(order.amount_cents or 0))
    refunded_cents = max(0, int(order.refund_amount_cents or 0))
    remaining_cents = refundable_cents(total_cents, refunded_cents)
    free_order = total_cents == 0
    if remaining_cents <= 0 and not free_order:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"该订单已全额退款 ¥{money.format_centi(refunded_cents)}，没有可退余额。",
        )

    if free_order:
        amount_cents = 0
    else:
        amount_cents = remaining_cents if payload.amount_cents is None else int(payload.amount_cents)
        if amount_cents > remaining_cents:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail=(
                    f"退款金额超出可退余额：本次最多可退 ¥{money.format_centi(remaining_cents)}"
                    f"（订单 ¥{money.format_centi(total_cents)}，已退 ¥{money.format_centi(refunded_cents)}）。"
                ),
            )

    refund_reason = (payload.note or f"订单 {order.order_no} 后台退款")[:255]

    target_cents = refunded_cents + amount_cents
    out_request_no = refunds.refund_request_no(order.order_no, target_cents)

    forced_offline = _offline_refund_reason(order)
    if free_order:
        forced_offline = "免费订单无渠道交易"
    offline_refund = bool(payload.offline) or bool(forced_offline)
    if forced_offline and not payload.offline:
        logger.warning(
            "退款按线下处理 order=%s：%s（未走任何支付渠道）", order.order_no, forced_offline
        )
        refund_reason = f"{refund_reason}｜{forced_offline}，按线下退款记账"[:255]

    if offline_refund:
        existing = refunds.refund_by_request_no(session, out_request_no)
        if existing is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    f"本订单已有一条金额相同的退款记录（幂等号 {out_request_no}，"
                    f"状态 {existing.status}），请勿重复提交。"
                ),
            )
    refund = OrderRefund(
        order_id=order.id,
        order_no=order.order_no,
        out_request_no=out_request_no,
        amount_cents=amount_cents,
        reason=refund_reason,
        offline=offline_refund,
        operator=_admin_actor(admin),
        status="failed",
        id=new_uuid(),
        created_at=utcnow(),
    )

    refund_trade_no: str | None = None
    refund_detail = ""
    settled_cents = amount_cents
    ledger_booked = False

    if amount_cents > 0 and not offline_refund:
        other = refunds.unsettled_refund(session, order_id=order.id)
        if other is not None and other.out_request_no != out_request_no:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    f"该订单有一笔退款结果未确认（¥{money.format_centi(int(other.amount_cents or 0))}，"
                    f"幂等号 {other.out_request_no}）：它可能已经在渠道侧退了钱。"
                    "请先用**相同的金额**重试那一笔，或到渠道后台确认后再操作，不要改成别的金额。"
                ),
            )
        session.commit()
        gate, _gate_row = refunds.open_refund_gate(session, refund)
        if gate == "settled":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    f"该笔退款（¥{money.format_centi(amount_cents)}，幂等号 {out_request_no}）"
                    "已经退款成功并记账，不需要重复退款。请刷新订单查看累计已退金额。"
                ),
            )
        if gate == "in_flight":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"该笔退款（幂等号 {out_request_no}）正在处理中，请稍后刷新订单再看结果。",
            )
        ledger_booked = True
        provider = _refund_provider(
            request.app.state.resolve_payment_provider,
            order=order,
            setting=setting,
        )
        try:
            result = provider.refund_payment(
                order=order,
                amount_cents=amount_cents,
                reason=refund_reason,
                out_request_no=out_request_no,
                settings=request.app.state.settings,
                setting=setting,
            )
        except PaymentError as error:
            persisted = refunds.persist_refund_result(
                session,
                out_request_no=out_request_no,
                status="processing",
                amount_cents=amount_cents,
                detail=f"渠道调用异常，退款结果未知：{error}",
            )
            logger.warning("渠道退款调用异常 order=%s: %s", order.order_no, error)
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    f"渠道退款调用异常，本次结果未知（幂等号 {out_request_no}）：{error}"
                    "请先用**相同的金额**重试，或到渠道后台确认这笔是否已经退出；"
                    "不要改成别的金额，否则可能重复退款。"
                    + ("" if persisted else "（退款流水也未能落库，请立即人工核对。）")
                ),
            ) from error
        if not result.ok:
            failed_detail = (result.detail or "支付渠道未确认退款成功。")[:255]
            status_text = "processing" if result.processing else "failed"
            refunds.persist_refund_result(
                session,
                out_request_no=out_request_no,
                status=status_text,
                amount_cents=amount_cents,
                trade_no=result.trade_no,
                detail=failed_detail,
            )
            if result.processing:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=(
                        f"{failed_detail}（幂等号 {out_request_no}）"
                        "请稍后用**相同的金额**重试，渠道会按同一幂等号去重。"
                    ),
                )
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=failed_detail)
        refund_trade_no = result.trade_no
        refund_detail = result.detail
        settled_cents = max(0, amount_cents - int(result.unrefunded_cents or 0))

    if settled_cents <= 0 and not free_order:
        no_change_detail = (refund_detail or "渠道确认本次无新增资金变动。")[:255]
        refund.detail = no_change_detail
        if ledger_booked:
            refunds.write_refund_result(
                session,
                out_request_no=out_request_no,
                status="succeeded",
                amount_cents=0,
                trade_no=refund_trade_no,
                detail=no_change_detail,
            )
        else:
            refund.status = "succeeded"
            refund.amount_cents = 0
            refund.trade_no = refund_trade_no
            session.add(refund)
        session.flush()
        _audit(
            session,
            _admin_actor(admin),
            "order.refund",
            order.order_no,
            f"未产生资金变动（{refund_detail or '该笔可能已退过款'}）"
            + ("（线下退款）" if offline_refund else "")
            + (f" 幂等号 {out_request_no}" if not offline_refund else "")
            + (f" 渠道单号 {refund_trade_no}" if refund_trade_no else ""),
        )
        session.refresh(order)
        return order_payload(order)

    cumulative_cents = refunded_cents + settled_cents
    if not claim_refund_amount(
        session, order, seen_cents=refunded_cents, add_cents=settled_cents
    ):
        session.rollback()
        conflict_detail = (
            f"{refund_detail} 本地记账冲突：累计值已不是 ¥{money.format_centi(refunded_cents)}，"
            f"本次渠道退款 ¥{money.format_centi(settled_cents)} 待人工核对。"
        )[:255]
        if ledger_booked:
            ledger_recorded = refunds.persist_refund_result(
                session,
                out_request_no=out_request_no,
                status="succeeded",
                amount_cents=settled_cents,
                trade_no=refund_trade_no,
                detail=conflict_detail,
            )
        else:
            refund.status = "succeeded"
            refund.amount_cents = settled_cents
            refund.trade_no = refund_trade_no
            refund.detail = conflict_detail
            ledger_recorded = record_refund_audit(session, refund)
        logger.error(
            "退款记账抢单失败（渠道已退款）order=%s out_request_no=%s settled=%s",
            order.order_no,
            out_request_no,
            settled_cents,
        )
        ledger_note = (
            ""
            if ledger_recorded
            else "（退款流水行也没能写入，已计入「入账异常」，请优先处理）"
        )
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"渠道已退出 ¥{money.format_centi(settled_cents)}，但本地退款累计值被并发改动，"
                "为避免重复记账已中止。"
                f"{ledger_note}请到「退款流水」核对这笔后手工处理。"
            ),
        )

    if ledger_booked:
        refunds.write_refund_result(
            session,
            out_request_no=out_request_no,
            status="succeeded",
            amount_cents=settled_cents,
            trade_no=refund_trade_no,
            detail=refund_detail,
        )
    else:
        refund.status = "succeeded"
        refund.amount_cents = settled_cents
        refund.trade_no = refund_trade_no
        refund.detail = refund_detail[:255]
        session.add(refund)
    if refund_trade_no:
        order.refund_trade_no = refund_trade_no

    if order.status in {"paid", "fulfillment_failed"}:
        product = session.get(Product, order.product_id) if order.product_id else None
        fulfill.release_order_reservation(session, order=order, product=product)

    fully_refunded = cumulative_cents >= total_cents
    reversed_centi = 0
    referral_shortfall_centi = 0
    if fully_refunded:
        _revoke_order_entitlements(session, order)
        reversed_centi, referral_shortfall_centi = referrals.reverse_order_reward(
            session, order=order, note=f"订单 {order.order_no} 退款，奖励退回"
        )
        if referral_shortfall_centi > 0:
            incidents.note(
                "referral.reversal_shortfall",
                order_no=order.order_no,
                error=(
                    f"邀请奖励扣回短差 {money.format_centi(referral_shortfall_centi)} 积分，"
                    "推荐人钱包余额不足，需人工追偿"
                ),
            )
        order.status = "refunded"
        order.refunded_at = utcnow()
        coupons.release_coupon(session, order, reason="全额退款，归还优惠码名额")
    else:
        order.status = "partially_refunded"

    session.flush()
    _audit(
        session,
        _admin_actor(admin),
        "order.refund",
        order.order_no,
        (
            f"退款 ¥{money.format_centi(settled_cents)}（累计 ¥{money.format_centi(cumulative_cents)}"
            f" / 订单 ¥{money.format_centi(total_cents)}）"
            + ("（线下退款）" if offline_refund else "")
            + (f" 幂等号 {out_request_no}" if not offline_refund else "")
            + (f" 渠道单号 {refund_trade_no}" if refund_trade_no else "")
            + (f" {refund_detail}" if refund_detail else "")
            + (f" 邀请奖励已扣回 {money.format_centi(reversed_centi)} 积分" if (reversed_centi or referral_shortfall_centi) else "")
            + (
                f"，另有 {money.format_centi(referral_shortfall_centi)} 积分余额不足，已登记人工追偿"
                if referral_shortfall_centi
                else ""
            )
            + (f" 备注：{refund_reason}" if (payload.note or forced_offline) else "")
        ),
    )
    session.refresh(order)
    return order_payload(order)


def _revoke_order_entitlements(session, order: Order) -> None:
    """收回订单产生的激活码与权益（全额退款时调用）。
    """
    if (
        order.license_action in {"upgrade", "patch"}
        and order.license_id
        and (order.license_state_before_json or "").strip()
    ):
        license = session.get(License, order.license_id)
        if license is not None and fulfill.revert_license_change(
            session, order=order, license=license
        ):
            session.flush()
            return

    for license in session.scalars(select(License).where(License.order_id == order.id)):
        license.active = False
        license.revoked_at = utcnow()
        for binding in session.scalars(
            select(DeviceBinding).where(DeviceBinding.license_id == license.id)
        ):
            binding.active = False
            binding.released_at = utcnow()
            session.execute(
                delete(LicenseSession).where(LicenseSession.binding_id == binding.id)
            )
            session.execute(
                delete(RecoveryToken).where(RecoveryToken.binding_id == binding.id)
            )
    for entitlement in session.scalars(
        select(Entitlement).where(Entitlement.license_id == order.license_id)
    ):
        if entitlement.product_id != order.product_id:
            continue
        if fulfill.has_other_live_grant(
            session,
            order=order,
            license_id=order.license_id,
            product_id=order.product_id,
        ):
            continue
        entitlement.active = False


def _offline_refund_reason(order: Order) -> str:
    provider = normalize_provider_name(order.payment_provider)
    if provider == "manual":
        return "该订单是后台人工标记支付的（渠道侧没有这笔交易）"
    if not provider:
        return "该订单没有记录下单渠道，无从判断该退到哪个渠道"
    if provider not in PROVIDER_NAMES:
        return f"该订单的下单渠道「{provider}」不是受支持的渠道"
    return ""


def _refund_provider(resolver, *, order: Order, setting):
    """按**订单下单时**的渠道退款，而不是当前站点配置的渠道。
    """
    order_provider = normalize_provider_name(order.payment_provider)
    if order_provider in PROVIDER_NAMES:
        return resolver(setting, name=order_provider)
    return resolver(setting)


@router.get("/orders/{order_no}/refunds")
def admin_list_order_refunds(
    order_no: str, session: DbSession, _admin: AdminAccount
) -> dict:
    """某张订单的退款流水（含被渠道拒绝的尝试）。
    """
    order = order_or_404(session, order_no)
    rows = session.scalars(
        select(OrderRefund)
        .where(OrderRefund.order_id == order.id)
        .order_by(OrderRefund.created_at.desc())
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
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="订单状态已变更，请刷新后重试。"
        )
    if channel_closed:
        order.channel_closed_at = utcnow()
    session.flush()
    _audit(session, _admin_actor(admin), "order.cancel", order.order_no, payload.note)
    session.refresh(order)
    return order_payload(order)


@router.delete("/orders/{order_no}")
def admin_delete_order(order_no: str, session: DbSession, admin: AdminAccount) -> dict:
    """删除订单（用于清理测试单 / 垃圾单）。
    """
    order = order_or_404(session, order_no)

    if order.status not in {"cancelled", "expired"}:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"状态为 {order.status} 的订单不能删除；待支付请先取消，已支付请走退款。",
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
