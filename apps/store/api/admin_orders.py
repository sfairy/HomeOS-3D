"""运营后台的 orders 资源组（从 api/admin.py 拆出）。
"""
from __future__ import annotations

from __future__ import annotations

import logging
import threading
from contextlib import contextmanager
from datetime import datetime
from typing import Iterator

from fastapi import APIRouter, HTTPException, Request, status
from sqlalchemy import func, or_, select, update
from sqlalchemy.orm import Session

from apps.store.commerce import fulfill, referrals
from apps.store.ops import site_settings as site_config
from apps.store.core.deps import AdminAccount, DbSession, SettingsDep, order_or_404
from apps.store.commerce.expiry import expire_stale_orders
from apps.store.commerce.order_status import (
    order_status_label,
)
from apps.store.commerce.order_status import (
    FULFILLABLE_STATUSES as ORDER_FULFILLABLE_STATUSES,
)
from apps.store.commerce.order_status import (
    REFUNDABLE_STATUSES as ORDER_REFUNDABLE_STATUSES,
)
from apps.store.commerce.order_status import refundable_cents
from apps.store.payments import PROVIDER_NAMES, normalize_provider_name
from apps.store.payments.base import PaymentError
from apps.store.payments.reconcile import CLOSE_LOOKBACK_HOURS, channel_still_payable
from apps.store.payments.refunds import record_refund_in_new_session
from apps.store.core.models import (
    DeviceBinding,
    Entitlement,
    License,
    Order,
    OrderRefund,
    Product,
    StoreSetting,
)
from apps.store.core.schemas import (
    AdminOrderActionRequest,
    AdminOrderReviewRequest,
)
from apps.store.security.security import (
    iso_z,
    new_uuid,
    utcnow,
)  # noqa: F401
from apps.store.core.serializers import (
    order_payload,
)

logger = logging.getLogger("apps.store.admin")


# 共享助手在 admin_shared.py；这里再导入一次，
from .admin_shared import (
    _FULFILLABLE_STATUS_TEXT,
    _admin_actor,
    _audit,
    _naive_utc,
    _page,
)


router = APIRouter()


@router.get("/orders")
def admin_list_orders(
    session: DbSession,
    _admin: AdminAccount,
    settings: SettingsDep,
    status_filter: str | None = None,
    keyword: str | None = None,
    needs_review: bool | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    limit: int = 100,
    offset: int = 0,
) -> dict:
    """订单列表（分页 + 筛选）。
    """
    expire_stale_orders(session, settings)
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
        # 删除守卫的第三条判据（渠道交易是否已确认关闭）前端拿不到，这里补进列表，
        render=lambda row: {
            **order_payload(row),
            "channelPayable": channel_still_payable(row),
            "paymentProvider": row.payment_provider or "",
        },
    )


def _fulfill_with_failure_state(
    session: Session, *, order: Order, setting: StoreSetting, actor: str
) -> dict:
    """履约并处理失败：抛异常时把订单标记为 ``fulfillment_failed`` 而不是 500。
    """
    try:
        with session.begin_nested():
            fulfill.fulfill_order(session, order=order, setting=setting)
    except Exception as error:  # noqa: BLE001 - 兜底转成可运营的状态
        reason = str(error).strip() or error.__class__.__name__
        session.execute(
            update(Order)
            .where(Order.id == order.id)
            .where(Order.status != "refunded")
            .values(
                status="fulfillment_failed",
                # 履约入口会把 fulfilled_at 抢先写上做幂等闸门，SAVEPOINT 回滚后
                fulfilled_at=None,
                needs_review=True,
                review_note=f"履约失败：{reason[:230]}",
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
    return order_payload(order)


@router.post("/orders/{order_no}/mark-paid")
def admin_mark_paid(
    order_no: str, session: DbSession, admin: AdminAccount
) -> dict:
    """人工补记：把订单放行（发码），但**不计入营收**。
    """
    return _manual_payment(session, order_no, admin=admin, manual_settlement=True)


@router.post("/orders/{order_no}/settle-offline")
def admin_settle_offline(
    order_no: str, session: DbSession, admin: AdminAccount
) -> dict:
    """线下收款入账：人工确认这笔钱**已经收到**（转账/现金），计入营收。
    """
    return _manual_payment(session, order_no, admin=admin, manual_settlement=False)


def _manual_payment(
    session: Session, order_no: str, *, admin: AdminAccount, manual_settlement: bool
) -> dict:
    """``mark-paid`` / ``settle-offline`` 的共用实现。
    """
    setting = site_config.get_setting(session)
    order = order_or_404(session, order_no)
    if order.status == "fulfilled":
        return order_payload(order)
    # payment_failed 不在这里补标记：该状态在支付失败时已释放库存预留与优惠码
    if order.status not in ORDER_FULFILLABLE_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"订单状态为{order_status_label(order.status)}，无法标记支付；"
                f"只有{_FULFILLABLE_STATUS_TEXT}的订单可以标记支付。"
            ),
        )
    # 条件 UPDATE 抢单：后台按钮可以双击、也可能与「履约」按钮并发点击。
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
    if result.rowcount == 0:
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
    # 自动发卡商品立刻履约（发码 / 追加增量包 / 邀请奖励）；手动发卡商品只标记已支付，
    if order.fulfillment_mode != "manual":
        return _fulfill_with_failure_state(
            session, order=order, setting=setting, actor=_admin_actor(admin)
        )
    session.refresh(order)
    return order_payload(order)


@router.post("/orders/{order_no}/fulfill")
def admin_fulfill(order_no: str, session: DbSession, admin: AdminAccount) -> dict:
    setting = site_config.get_setting(session)
    order = order_or_404(session, order_no)
    if order.status == "fulfilled":
        return order_payload(order)
    # 终态订单不能履约：cancelled / expired 的库存与优惠码名额早已释放，
    if order.status not in ORDER_FULFILLABLE_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"订单状态为{order_status_label(order.status)}，不能履约；"
                f"只有{_FULFILLABLE_STATUS_TEXT}的订单可以履约。"
            ),
        )
    if order.paid_at is None:
        # 只补时间戳，不碰状态：状态流转与幂等由 fulfill_order 的条件 UPDATE 负责。
        session.execute(
            update(Order)
            .where(Order.id == order.id)
            .where(Order.paid_at.is_(None))
            .values(paid_at=utcnow(), manual_settlement=True)
            .execution_options(synchronize_session=False)
        )
        session.refresh(order)
    return _fulfill_with_failure_state(
        session, order=order, setting=setting, actor=_admin_actor(admin)
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
        #: 幂等：重复点击（两个标签页、误触）不该报错，也不该覆盖上一个人的结论。
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


#: 同一订单的退款必须串行：渠道退款不可逆，而退款接口是「读累计值 → 调渠道 → 写累计值」的形状，
_refund_locks: dict[str, list] = {}
_refund_locks_guard = threading.Lock()


@contextmanager
def _refund_lock(order_no: str) -> Iterator[None]:
    """按订单号取一把进程内互斥锁，保证同一订单的退款不会交叠。"""
    with _refund_locks_guard:
        entry = _refund_locks.get(order_no)
        if entry is None:
            entry = [threading.Lock(), 0]
            _refund_locks[order_no] = entry
        lock, holders = entry[0], entry[1]
        entry[1] = holders + 1
    lock.acquire()
    try:
        yield
    finally:
        lock.release()
        with _refund_locks_guard:
            entry = _refund_locks.get(order_no)
            #: 只在「还是同一把锁」时才动计数：期间可能有人把表项删掉重建了。
            if entry is not None and entry[0] is lock:
                if entry[1] <= 1:
                    del _refund_locks[order_no]
                else:
                    entry[1] -= 1


def _claim_refund_amount(
    session: Session, order: Order, *, seen_cents: int, add_cents: int
) -> bool:
    """把本次退款金额并进累计值，条件是「累计值仍是本次读到的那个」。
    """
    claimed = session.execute(
        update(Order)
        .where(Order.id == order.id)
        .where(func.coalesce(Order.refund_amount_cents, 0) == seen_cents)
        .values(refund_amount_cents=seen_cents + add_cents)
        .execution_options(synchronize_session=False)
    )
    return claimed.rowcount == 1


@router.post("/orders/{order_no}/refund")
def admin_refund(
    order_no: str,
    payload: AdminOrderActionRequest,
    request: Request,
    session: DbSession,
    admin: AdminAccount,
) -> dict:
    """后台退款。真正的逻辑在 ``_refund_order``，这里只负责把同一订单的退款串行化。"""
    with _refund_lock(order_no):
        result = _refund_order(order_no, payload, request, session, admin)
        # 必须在本进程锁**之内**把抢单结果与流水落库：请求会话的 commit 发生在依赖
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
    if remaining_cents <= 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"该订单已全额退款 ¥{refunded_cents / 100:.2f}，没有可退余额。",
        )

    amount_cents = remaining_cents if payload.amount_cents is None else int(payload.amount_cents)
    if amount_cents > remaining_cents:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=(
                f"退款金额超出可退余额：本次最多可退 ¥{remaining_cents / 100:.2f}"
                f"（订单 ¥{total_cents / 100:.2f}，已退 ¥{refunded_cents / 100:.2f}）。"
            ),
        )

    refund_reason = (payload.note or f"订单 {order.order_no} 后台退款")[:255]

    #: 人工标记支付的订单（以及没记渠道 / 渠道名已失效的老订单）在渠道侧没有可退交易，
    forced_offline = _offline_refund_reason(order)
    offline_refund = bool(payload.offline) or bool(forced_offline)
    if forced_offline and not payload.offline:
        logger.warning(
            "退款按线下处理 order=%s：%s（未走任何支付渠道）", order.order_no, forced_offline
        )
        refund_reason = f"{refund_reason}｜{forced_offline}，按线下退款记账"[:255]

    # 幂等键必须**每次退款动作都不同**。写成 RF{订单号} 的话，支付宝会把第二次
    out_request_no = f"RF{order.order_no}-{new_uuid()[:8]}"[:128]
    refund = OrderRefund(
        order_id=order.id,
        order_no=order.order_no,
        out_request_no=out_request_no,
        amount_cents=amount_cents,
        reason=refund_reason,
        offline=offline_refund,
        operator=_admin_actor(admin),
        status="failed",
    )
    # 先不加进请求事务：失败路径要靠独立事务落库，而已经绑在请求会话上的对象

    refund_trade_no: str | None = None
    refund_detail = ""
    #: 渠道**实际**退回的金额。渠道可能只退了一部分（unrefunded_cents > 0），
    settled_cents = amount_cents

    if amount_cents > 0 and not offline_refund:
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
            refund.detail = str(error)[:255]
            record_refund_in_new_session(session, refund)
            logger.warning("退款被渠道拒绝 order=%s: %s", order.order_no, error)
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(error)) from error
        if not result.ok:
            refund.detail = (result.detail or "支付渠道未确认退款成功。")[:255]
            record_refund_in_new_session(session, refund)
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=result.detail or "支付渠道未确认退款成功。",
            )
        refund_trade_no = result.trade_no
        refund_detail = result.detail
        # 渠道只退了一部分时按实际金额入账，并把差额如实告诉运营 ——
        settled_cents = max(0, amount_cents - int(result.unrefunded_cents or 0))

    if settled_cents <= 0:
        refund.status = "succeeded"
        refund.amount_cents = 0
        refund.trade_no = refund_trade_no
        refund.detail = (refund_detail or "渠道确认本次无新增资金变动。")[:255]
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

    # 走到这里渠道已经确认退款（或本来就是线下退款），可以安全地并入请求事务。
    cumulative_cents = refunded_cents + settled_cents
    if not _claim_refund_amount(
        session, order, seen_cents=refunded_cents, add_cents=settled_cents
    ):
        # 抢单失败：本次渠道退款**已经发出去了**，但本地累计值被另一笔退款改动过（进程内锁
        session.rollback()
        refund.status = "succeeded"
        refund.amount_cents = settled_cents
        refund.trade_no = refund_trade_no
        refund.detail = (
            f"{refund_detail} 本地记账冲突：累计值已不是 ¥{refunded_cents / 100:.2f}，"
            f"本次渠道退款 ¥{settled_cents / 100:.2f} 待人工核对。"
        )[:255]
        record_refund_in_new_session(session, refund)
        logger.error(
            "退款记账抢单失败（渠道已退款）order=%s out_request_no=%s settled=%s",
            order.order_no,
            out_request_no,
            settled_cents,
        )
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"渠道已退出 ¥{settled_cents / 100:.2f}，但本地退款累计值被并发改动，"
                "为避免重复记账已中止。请到「退款流水」核对这笔后手工处理。"
            ),
        )

    session.add(refund)
    refund.status = "succeeded"
    refund.amount_cents = settled_cents
    refund.trade_no = refund_trade_no
    refund.detail = refund_detail[:255]
    if refund_trade_no:
        order.refund_trade_no = refund_trade_no

    # 预留归还的判定必须用**退款前**的状态，且对部分退款同样生效：
    if order.status in {"paid", "fulfillment_failed"}:
        product = session.get(Product, order.product_id) if order.product_id else None
        fulfill.release_order_reservation(session, order=order, product=product)

    fully_refunded = total_cents > 0 and cumulative_cents >= total_cents
    if fully_refunded:
        _revoke_order_entitlements(session, order)
        referrals.reverse_order_reward(
            session, order=order, note=f"订单 {order.order_no} 退款，奖励退回"
        )
        order.status = "refunded"
        order.refunded_at = utcnow()
    else:
        order.status = "partially_refunded"

    session.flush()
    _audit(
        session,
        _admin_actor(admin),
        "order.refund",
        order.order_no,
        (
            f"退款 ¥{settled_cents / 100:.2f}（累计 ¥{cumulative_cents / 100:.2f}"
            f" / 订单 ¥{total_cents / 100:.2f}）"
            + ("（线下退款）" if offline_refund else "")
            + (f" 幂等号 {out_request_no}" if not offline_refund else "")
            + (f" 渠道单号 {refund_trade_no}" if refund_trade_no else "")
            + (f" {refund_detail}" if refund_detail else "")
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
        # 同 license.deactivate：多设备绑定要全部释放，不能只处理 .first()
        for binding in session.scalars(
            select(DeviceBinding).where(DeviceBinding.license_id == license.id)
        ):
            binding.active = False
            binding.released_at = utcnow()
    for entitlement in session.scalars(
        select(Entitlement).where(Entitlement.product_id == order.product_id)
    ):
        if entitlement.license_id and entitlement.license_id == order.license_id:
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
    order_no: str, payload: AdminOrderActionRequest, session: DbSession, admin: AdminAccount
) -> dict:
    order = order_or_404(session, order_no)
    if order.status != "pending":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="只有待支付订单可以取消。")
    product = session.get(Product, order.product_id) if order.product_id else None
    # 条件 UPDATE 抢单：取消与超时扫描/支付入账可能同时发生，只有把订单从
    if not fulfill.close_pending_order(session, order=order, product=product):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="订单状态已变更，请刷新后重试。"
        )
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
        # 删掉之后钱进来就再没有任何凭证：异步通知找不到订单号只会打 error 日志，
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "该订单的支付宝交易尚未确认关闭，用户手上那个旧二维码仍可能被付款；"
                "删除会让一笔延迟到账的付款失去凭证。请等对账巡检关单后再删除"
                f"（下单后 {CLOSE_LOOKBACK_HOURS} 小时内巡检会持续重试）。"
            ),
        )

    session.delete(order)
    session.flush()
    _audit(session, _admin_actor(admin), "order.delete", order_no, f"状态 {order.status}")
    return {"orderNo": order_no, "deleted": True}
