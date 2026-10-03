"""运营后台的 orders 资源组（从 api/admin.py 拆出）。
"""
from __future__ import annotations

import logging
from collections.abc import Callable
from datetime import datetime

from fastapi import APIRouter, BackgroundTasks, HTTPException, Request, status
from sqlalchemy import or_, select, update
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
    Order,
    OrderRefund,
    Product,
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

#: 退款的三个助手（锁 / 额度 CAS / 流水留痕）住在 payments/refunds.py：它们是
#: 「渠道侧真的动过钱」之后的记账口径，与本文件的接口层职责不同，也该能单独被
#: 回调与巡检路径复用。
from ..payments import PROVIDER_NAMES, normalize_provider_name, refunds
from ..payments.base import PaymentError
from ..payments.channels import provider_label
from ..payments.reconcile import CLOSE_LOOKBACK_HOURS, channel_still_payable
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


# 共享助手在 admin_shared.py；这里再导入一次，
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
        # 删除守卫的第三条判据（渠道交易是否已确认关闭）前端拿不到，这里补进列表，
        render=lambda row: {
            **order_payload(row),
            "channelPayable": channel_still_payable(row),
            "paymentProvider": row.payment_provider or "",
            #: 中文名由服务端给（口径与报错文案共用 channels.provider_label），
            #: 前端只负责显示 —— 两个地方各写一份映射迟早会走散。
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
        # 守卫**必须**与入账路径同一口径（payments/settlement.py 的 _mark_fulfillment_failed）：
        # 两套判据会让「同一张单从哪个入口点进去行为不同」，而这里过去只排除 refunded。
        previous = (
            session.execute(
                select(Order.review_note).where(Order.id == order.id)
            ).scalar_one_or_none()
            or ""
        )
        note = f"履约失败：{reason[:230]}"
        if previous and note not in previous:
            # 与结算路径同理：复活单的「可能超卖」警示不能被这一句盖掉。
            keep = max(0, 255 - len(note) - 1)
            note = f"{previous[:keep]}｜{note}"
        session.execute(
            update(Order)
            .where(Order.id == order.id)
            .where(Order.status.in_(ORDER_FAILURE_MARKABLE_STATUSES))
            .values(
                status="fulfillment_failed",
                # 履约入口会把 fulfilled_at 抢先写上做幂等闸门，SAVEPOINT 回滚后
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
    # 自动发卡商品立刻履约（发码 / 追加增量包 / 邀请奖励）；手动发卡商品只标记已支付，
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
    # 免费单（0 元商品 / 100% 优惠码）没有可退资金，但退款仍承担「撤销」语义：
    # 要收回授权、归还优惠码名额并把订单置为已退款，不能被「可退余额为 0」挡死在外面。
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

    #: 幂等号 = 确定性键（订单号 + **累计目标金额**），同一笔退款的重试必须逐字复用。
    #: 以前每次点击都随机生成，渠道去重失效：运营看到「失败」再点一次就是真的再退一笔。
    target_cents = refunded_cents + amount_cents
    out_request_no = refunds.refund_request_no(order.order_no, target_cents)

    #: 人工标记支付的订单（以及没记渠道 / 渠道名已失效的老订单）在渠道侧没有可退交易，
    forced_offline = _offline_refund_reason(order)
    if free_order:
        # 免费单即使建单时冻结过渠道名，也从未产生真实交易：强制线下记账，
        # 绝不允许拿 FREE 开头的伪交易号去调用渠道退款 API。
        forced_offline = "免费订单无渠道交易"
    offline_refund = bool(payload.offline) or bool(forced_offline)
    if forced_offline and not payload.offline:
        logger.warning(
            "退款按线下处理 order=%s：%s（未走任何支付渠道）", order.order_no, forced_offline
        )
        refund_reason = f"{refund_reason}｜{forced_offline}，按线下退款记账"[:255]

    if offline_refund:
        # 线下退款不碰渠道，没有闸门可占；但同一笔（同一幂等号）也不该被记两次。
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
    # 先不加进请求事务：失败路径要靠独立事务落库，而已经绑在请求会话上的对象

    refund_trade_no: str | None = None
    refund_detail = ""
    #: 渠道**实际**退回的金额。渠道可能只退了一部分（unrefunded_cents > 0），
    settled_cents = amount_cents
    #: 走渠道退款时，流水行由闸门（refunds.open_refund_gate）在调渠道之前就落库了：
    #: 后续只能 UPDATE 它，绝不能再 session.add 出一条同幂等号的新行。
    ledger_booked = False

    if amount_cents > 0 and not offline_refund:
        # 还没定论的另一笔退款（换金额重发会超额退款）——先拦住。
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
        # 请求会话此前只做过读。先收掉读事务：WAL 下在读过的事务里做「读→写」升级会
        # SQLITE_BUSY_SNAPSHOT（而闸门那条流水正是另一个连接刚提交的）。
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
        # gate == "open"（首次占位）或 "retry"（旧的 processing/failed 尝试）：
        # 同一个幂等号重发在渠道侧是幂等的，可以安全继续。
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
            # 渠道调用异常（含超时）时**结果未知**：钱可能已经退出去了。必须把它标成
            # processing 挡住「换个金额再退一笔」，并要求运营用同一个幂等号原样重试。
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
            # 「已受理但未到账」与「渠道明确拒绝」必须分开记：前者是钱在路上，
            # 换个幂等号重发就会真的再退一笔。
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
        # 渠道只退了一部分时按实际金额入账，并把差额如实告诉运营 ——
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

    # 走到这里渠道已经确认退款（或本来就是线下退款），可以安全地并入请求事务。
    cumulative_cents = refunded_cents + settled_cents
    if not claim_refund_amount(
        session, order, seen_cents=refunded_cents, add_cents=settled_cents
    ):
        # 抢单失败：本次渠道退款**已经发出去了**，但本地累计值被另一笔退款改动过（进程内锁
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

    # 预留归还的判定必须用**退款前**的状态，且对部分退款同样生效：
    if order.status in {"paid", "fulfillment_failed"}:
        product = session.get(Product, order.product_id) if order.product_id else None
        fulfill.release_order_reservation(session, order=order, product=product)

    # 付费单与旧口径一致（累计达到订单额即全额）；免费单累计恒为 0，同样成立，
    # 从而走到下面的授权收回 / 优惠码归还 / 状态置 refunded 分支。
    fully_refunded = cumulative_cents >= total_cents
    reversed_centi = 0
    referral_shortfall_centi = 0
    if fully_refunded:
        _revoke_order_entitlements(session, order)
        reversed_centi, referral_shortfall_centi = referrals.reverse_order_reward(
            session, order=order, note=f"订单 {order.order_no} 退款，奖励退回"
        )
        if referral_shortfall_centi > 0:
            # 推荐人钱包余额不足时只能扣回部分：台账明细已留「请人工追偿」，
            # 这里必须再登记运营事件，不能让短差只躺在台账文本里。
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
        # 同 license.deactivate：多设备绑定要全部释放，不能只处理 .first()
        for binding in session.scalars(
            select(DeviceBinding).where(DeviceBinding.license_id == license.id)
        ):
            binding.active = False
            binding.released_at = utcnow()
    for entitlement in session.scalars(
        select(Entitlement).where(Entitlement.license_id == order.license_id)
    ):
        # 与 fulfill.revert_license_change 同一口径：只有「没有别的有效订单在给它付款」
        # 时才收回。详见 fulfill.has_other_live_grant 的说明。
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

    # 与买家自助取消（store_orders.cancel_order）同一口径：先 best-effort 关渠道，
    # 再做本地收尾。否则旧二维码在巡检关单前（最长 CLOSE_LOOKBACK_HOURS）仍可被支付，
    # 一笔迟到的成功付款会把已取消单「复活」并自动发码，管理员的取消意图被静默推翻。
    channel_closed = close_order_channel_best_effort(
        request,
        session,
        order,
        log_context="后台取消订单时",
        already_paid_detail="该订单已有付款记录，无法取消；请改用退款流程。",
    )

    product = session.get(Product, order.product_id) if order.product_id else None
    # 条件 UPDATE 抢单：取消与超时扫描/支付入账可能同时发生，只有把订单从
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
