"""后台退款全流程。

这里的真正难点不是「调一次渠道 API」，而是**渠道侧已经退出去了钱、本地却没能记账**
之后会发生什么。整条链路被拆成可单独阅读的阶段：

``_plan_refund`` → ``_open_refund_record`` → ``_attempt_channel_refund`` →
``_claim_refund_settlement`` → ``_apply_refund_order_state`` → ``_audit_refund``

每个阶段的进入条件、幂等号口径、以及「结果未知」时的文案都写在各自的 docstring 里。
改任何一个阶段之前先读 ``_claim_refund_settlement``：它是唯一能产生「钱已退、账没记」
的出口，也是所有 409 文案的来源。
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime  # noqa: F401  # 供类型读者参考 payload 时间字段

from fastapi import APIRouter, HTTPException, Request, status
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from ..shared import _admin_actor, _audit
from ....commerce import coupons, fulfill, money, referrals
from ....commerce.order_status import (
    REFUNDABLE_STATUSES as ORDER_REFUNDABLE_STATUSES,
)
from ....commerce.order_status import order_status_label, refundable_cents
from ....core.deps import AdminAccount, DbSession, order_or_404
from ....core.models import (
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
from ....core.schemas import AdminOrderActionRequest
from ....core.serializers import order_payload
from ....ops import incidents
from ....ops import site_settings as site_config
from ....payments import PROVIDER_NAMES, normalize_provider_name
from ....payments.common import refunds
from ....payments.common.base import PaymentError
from ....payments.common.refunds import (
    claim_refund_amount,
    record_refund_audit,
    refund_lock,
)
from ....security.security import new_uuid, utcnow

logger = logging.getLogger("src.admin")

router = APIRouter()


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


@dataclass(frozen=True)
class _RefundPlan:
    """一次后台退款的校验结论、金额口径与幂等号。"""

    total_cents: int
    refunded_cents: int
    amount_cents: int
    reason: str
    out_request_no: str
    offline: bool
    forced_offline: str
    free_order: bool


@dataclass(frozen=True)
class _RefundAttempt:
    """一次退款在渠道侧的尝试结果，以及流水行是否已在本地占位。"""

    settled_cents: int
    trade_no: str | None
    detail: str
    ledger_booked: bool


@dataclass(frozen=True)
class _RefundBooking:
    """退款入账后的累计口径与奖励扣回结果（供审计文案使用）。"""

    cumulative_cents: int
    reversed_centi: int
    referral_shortfall_centi: int


def _plan_refund(
    order: Order,
    requested_cents: int | None,
    note: str,
    offline_requested: bool,
) -> _RefundPlan:
    """校验可退余额与本次退款金额，并算出幂等号与线下 / 免费订单口径。"""
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
        amount_cents = remaining_cents if requested_cents is None else int(requested_cents)
        if amount_cents > remaining_cents:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail=(
                    f"退款金额超出可退余额：本次最多可退 ¥{money.format_centi(remaining_cents)}"
                    f"（订单 ¥{money.format_centi(total_cents)}，已退 ¥{money.format_centi(refunded_cents)}）。"
                ),
            )

    refund_reason = (note or f"订单 {order.order_no} 后台退款")[:255]

    target_cents = refunded_cents + amount_cents
    out_request_no = refunds.refund_request_no(order.order_no, target_cents)

    forced_offline = _offline_refund_reason(order)
    if free_order:
        forced_offline = "免费订单无渠道交易"
    offline_refund = bool(offline_requested) or bool(forced_offline)
    if forced_offline and not offline_requested:
        logger.warning("退款按线下处理 order=%s：%s（未走任何支付渠道）", order.order_no, forced_offline)
        refund_reason = f"{refund_reason}｜{forced_offline}，按线下退款记账"[:255]

    return _RefundPlan(
        total_cents=total_cents,
        refunded_cents=refunded_cents,
        amount_cents=amount_cents,
        reason=refund_reason,
        out_request_no=out_request_no,
        offline=offline_refund,
        forced_offline=forced_offline,
        free_order=free_order,
    )


def _open_refund_record(
    session: Session,
    order: Order,
    plan: _RefundPlan,
    operator: str,
) -> OrderRefund:
    """线下退款先做幂等查重，再建一条 ``failed`` 状态的占位流水。"""
    if plan.offline:
        existing = refunds.refund_by_request_no(session, plan.out_request_no)
        if existing is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    f"本订单已有一条金额相同的退款记录（幂等号 {plan.out_request_no}，"
                    f"状态 {existing.status}），请勿重复提交。"
                ),
            )
    return OrderRefund(
        order_id=order.id,
        order_no=order.order_no,
        out_request_no=plan.out_request_no,
        amount_cents=plan.amount_cents,
        reason=plan.reason,
        offline=plan.offline,
        operator=operator,
        status="failed",
        id=new_uuid(),
        created_at=utcnow(),
    )


def _attempt_channel_refund(
    session: Session,
    request: Request,
    order: Order,
    setting: StoreSetting,
    plan: _RefundPlan,
    refund: OrderRefund,
) -> _RefundAttempt:
    """走渠道退款（线下 / 免费订单跳过），返回本次实际退出的金额与流水状态。"""
    if plan.amount_cents <= 0 or plan.offline:
        return _RefundAttempt(
            settled_cents=plan.amount_cents,
            trade_no=None,
            detail="",
            ledger_booked=False,
        )

    other = refunds.unsettled_refund(session, order_id=order.id)
    if other is not None and other.out_request_no != plan.out_request_no:
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
                f"该笔退款（¥{money.format_centi(plan.amount_cents)}，幂等号 {plan.out_request_no}）"
                "已经退款成功并记账，不需要重复退款。请刷新订单查看累计已退金额。"
            ),
        )
    if gate == "in_flight":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"该笔退款（幂等号 {plan.out_request_no}）正在处理中，请稍后刷新订单再看结果。",
        )
    return _invoke_refund_provider(session, request, order, setting, plan)


def _invoke_refund_provider(
    session: Session,
    request: Request,
    order: Order,
    setting: StoreSetting,
    plan: _RefundPlan,
) -> _RefundAttempt:
    """调用渠道退款，并处理「成功 / 失败 / 结果未知」三条出口。"""
    provider = _refund_provider(
        request.app.state.resolve_payment_provider,
        order=order,
        setting=setting,
    )
    try:
        result = provider.refund_payment(
            order=order,
            amount_cents=plan.amount_cents,
            reason=plan.reason,
            out_request_no=plan.out_request_no,
            settings=request.app.state.settings,
            setting=setting,
        )
    except PaymentError as error:
        persisted = refunds.persist_refund_result(
            session,
            out_request_no=plan.out_request_no,
            status="processing",
            amount_cents=plan.amount_cents,
            detail=f"渠道调用异常，退款结果未知：{error}",
        )
        logger.warning("渠道退款调用异常 order=%s: %s", order.order_no, error)
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"渠道退款调用异常，本次结果未知（幂等号 {plan.out_request_no}）：{error}"
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
            out_request_no=plan.out_request_no,
            status=status_text,
            amount_cents=plan.amount_cents,
            trade_no=result.trade_no,
            detail=failed_detail,
        )
        if result.processing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    f"{failed_detail}（幂等号 {plan.out_request_no}）"
                    "请稍后用**相同的金额**重试，渠道会按同一幂等号去重。"
                ),
            )
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=failed_detail)

    return _RefundAttempt(
        settled_cents=max(0, plan.amount_cents - int(result.unrefunded_cents or 0)),
        trade_no=result.trade_no,
        detail=result.detail,
        ledger_booked=True,
    )


def _finalize_unchanged_refund(
    session: Session,
    order: Order,
    actor: str,
    plan: _RefundPlan,
    attempt: _RefundAttempt,
    refund: OrderRefund,
) -> dict:
    """渠道确认「没有新增资金变动」时的收尾：流水记成 0 元成功并返回订单。"""
    no_change_detail = (attempt.detail or "渠道确认本次无新增资金变动。")[:255]
    refund.detail = no_change_detail
    if attempt.ledger_booked:
        refunds.write_refund_result(
            session,
            out_request_no=plan.out_request_no,
            status="succeeded",
            amount_cents=0,
            trade_no=attempt.trade_no,
            detail=no_change_detail,
        )
    else:
        refund.status = "succeeded"
        refund.amount_cents = 0
        refund.trade_no = attempt.trade_no
        session.add(refund)
    session.flush()
    _audit(
        session,
        actor,
        "order.refund",
        order.order_no,
        f"未产生资金变动（{attempt.detail or '该笔可能已退过款'}）"
        + ("（线下退款）" if plan.offline else "")
        + (f" 幂等号 {plan.out_request_no}" if not plan.offline else "")
        + (f" 渠道单号 {attempt.trade_no}" if attempt.trade_no else ""),
    )
    session.refresh(order)
    return order_payload(order)


def _claim_refund_settlement(
    session: Session,
    order: Order,
    plan: _RefundPlan,
    attempt: _RefundAttempt,
    refund: OrderRefund,
) -> int:
    """把本次退款金额累加到订单上；抢单失败时登记待人工核对并抛 409。"""
    cumulative_cents = plan.refunded_cents + attempt.settled_cents
    if not claim_refund_amount(session, order, seen_cents=plan.refunded_cents, add_cents=attempt.settled_cents):
        session.rollback()
        conflict_detail = (
            f"{attempt.detail} 本地记账冲突：累计值已不是 ¥{money.format_centi(plan.refunded_cents)}，"
            f"本次渠道退款 ¥{money.format_centi(attempt.settled_cents)} 待人工核对。"
        )[:255]
        if attempt.ledger_booked:
            ledger_recorded = refunds.persist_refund_result(
                session,
                out_request_no=plan.out_request_no,
                status="succeeded",
                amount_cents=attempt.settled_cents,
                trade_no=attempt.trade_no,
                detail=conflict_detail,
            )
        else:
            refund.status = "succeeded"
            refund.amount_cents = attempt.settled_cents
            refund.trade_no = attempt.trade_no
            refund.detail = conflict_detail
            ledger_recorded = record_refund_audit(session, refund)
        logger.error(
            "退款记账抢单失败（渠道已退款）order=%s out_request_no=%s settled=%s",
            order.order_no,
            plan.out_request_no,
            attempt.settled_cents,
        )
        ledger_note = "" if ledger_recorded else "（退款流水行也没能写入，已计入「入账异常」，请优先处理）"
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"渠道已退出 ¥{money.format_centi(attempt.settled_cents)}，但本地退款累计值被并发改动，"
                "为避免重复记账已中止。"
                f"{ledger_note}请到「退款流水」核对这笔后手工处理。"
            ),
        )

    if attempt.ledger_booked:
        refunds.write_refund_result(
            session,
            out_request_no=plan.out_request_no,
            status="succeeded",
            amount_cents=attempt.settled_cents,
            trade_no=attempt.trade_no,
            detail=attempt.detail,
        )
    else:
        refund.status = "succeeded"
        refund.amount_cents = attempt.settled_cents
        refund.trade_no = attempt.trade_no
        refund.detail = attempt.detail[:255]
        session.add(refund)
    if attempt.trade_no:
        order.refund_trade_no = attempt.trade_no
    return cumulative_cents


def _apply_refund_order_state(
    session: Session,
    order: Order,
    plan: _RefundPlan,
    cumulative_cents: int,
) -> _RefundBooking:
    """按累计退款额落订单终态：全额则撤权益、退奖励，部分则只记部分退款。

    「部分退款」**不能**把一笔还没发货的订单推进终态：``partially_refunded`` 既不在
    ``FULFILLABLE_STATUSES`` 里（``admin_fulfill`` / ``mark-paid`` 一律 409），也不在
    巡检重试的过滤条件里，而库存预留却已被释放。结果是「客户付了未退的那部分钱、
    永远拿不到权益、库存还被退回可售池」。未交付订单的部分退款必须保持可履约状态，
    退款额本身已记在 ``order.refund_amount_cents`` 上，不依赖状态名表达。
    """
    fully_refunded = cumulative_cents >= plan.total_cents
    undelivered = order.status in {"paid", "fulfillment_failed"}

    if fully_refunded and undelivered:
        # 全额退款且未发货：预留不再需要，释放回可售池。
        product = session.get(Product, order.product_id) if order.product_id else None
        fulfill.release_order_reservation(session, order=order, product=product)

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
    elif not undelivered:
        # 已交付的订单被部分退款：权益不退，状态仅作账目标记。
        order.status = "partially_refunded"

    session.flush()
    return _RefundBooking(
        cumulative_cents=cumulative_cents,
        reversed_centi=reversed_centi,
        referral_shortfall_centi=referral_shortfall_centi,
    )


def _audit_refund(
    session: Session,
    order: Order,
    actor: str,
    plan: _RefundPlan,
    attempt: _RefundAttempt,
    booking: _RefundBooking,
    note: str,
) -> None:
    """写退款审计：金额、累计、渠道单号与奖励扣回都收在同一条里。"""
    _audit(
        session,
        actor,
        "order.refund",
        order.order_no,
        (
            f"退款 ¥{money.format_centi(attempt.settled_cents)}"
            f"（累计 ¥{money.format_centi(booking.cumulative_cents)}"
            f" / 订单 ¥{money.format_centi(plan.total_cents)}）"
            + ("（线下退款）" if plan.offline else "")
            + (f" 幂等号 {plan.out_request_no}" if not plan.offline else "")
            + (f" 渠道单号 {attempt.trade_no}" if attempt.trade_no else "")
            + (f" {attempt.detail}" if attempt.detail else "")
            + (
                f" 邀请奖励已扣回 {money.format_centi(booking.reversed_centi)} 积分"
                if (booking.reversed_centi or booking.referral_shortfall_centi)
                else ""
            )
            + (
                f"，另有 {money.format_centi(booking.referral_shortfall_centi)} 积分余额不足，已登记人工追偿"
                if booking.referral_shortfall_centi
                else ""
            )
            + (f" 备注：{plan.reason}" if (note or plan.forced_offline) else "")
        ),
    )


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

    refund_plan = _plan_refund(order, payload.amount_cents, payload.note, payload.offline)
    refund = _open_refund_record(session, order, refund_plan, _admin_actor(admin))
    attempt = _attempt_channel_refund(session, request, order, setting, refund_plan, refund)
    if attempt.settled_cents <= 0 and not refund_plan.free_order:
        return _finalize_unchanged_refund(session, order, _admin_actor(admin), refund_plan, attempt, refund)

    cumulative_cents = _claim_refund_settlement(session, order, refund_plan, attempt, refund)
    booking = _apply_refund_order_state(session, order, refund_plan, cumulative_cents)
    _audit_refund(session, order, _admin_actor(admin), refund_plan, attempt, booking, payload.note)
    session.refresh(order)
    return order_payload(order)


def _revoke_order_entitlements(session, order: Order) -> None:
    """收回订单产生的激活码与权益（全额退款时调用）。"""
    if (
        order.license_action in {"upgrade", "patch"}
        and order.license_id
        and (order.license_state_before_json or "").strip()
    ):
        license = session.get(License, order.license_id)
        if license is not None and fulfill.revert_license_change(session, order=order, license=license):
            session.flush()
            return

    for license in session.scalars(select(License).where(License.order_id == order.id)):
        license.active = False
        license.revoked_at = utcnow()
        for binding in session.scalars(select(DeviceBinding).where(DeviceBinding.license_id == license.id)):
            binding.active = False
            binding.released_at = utcnow()
            session.execute(delete(LicenseSession).where(LicenseSession.binding_id == binding.id))
            session.execute(delete(RecoveryToken).where(RecoveryToken.binding_id == binding.id))
    for entitlement in session.scalars(select(Entitlement).where(Entitlement.license_id == order.license_id)):
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
    """按**订单下单时**的渠道退款，而不是当前站点配置的渠道。"""
    order_provider = normalize_provider_name(order.payment_provider)
    if order_provider in PROVIDER_NAMES:
        return resolver(setting, name=order_provider)
    return resolver(setting)
