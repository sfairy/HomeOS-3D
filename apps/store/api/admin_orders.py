"""运营后台的 orders 资源组（从 api/admin.py 拆出）。

子路由不带前缀（路径本身就是绝对路径），由父路由 admin.py 在**原来的位置**
router.include_router() 套上 /store-admin/v1 —— 位置决定注册顺序，FastAPI 按注册序匹配路由，
所以每拆一组都要用 72 条路由基线逐项比对（含顺序）。
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
# 于是本文件剩下的 57 条路由不用改任何一处调用。
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
    ``status_filter`` 支持逗号分隔的多状态（如 ``paid,fulfillment_failed``），概览看板的「待发货」
    待办靠它一次带出两类订单。日期区间按 ``created_at`` 过滤、边界都含；时间参数由前端按本地时区算好
    再转 UTC，服务端只做 naive UTC 归一。
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
        # 让「能不能删」只有一个口径，否则按钮照常显示、点下去才 409。``paymentProvider`` 同理：
        # manual 订单只能线下退款，退款确认框的文案要据此换掉，不能把钱记成已退。
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
    用 SAVEPOINT 包住履约，失败只回滚这一段的写入（半张授权、库存、邀请奖励），订单本身仍占着库存
    预留与优惠码名额（货没发出去）。这样状态机自洽：``fulfillment_failed`` 既在预留未归还集合里，
    也在可重试集合里，运营点「履约」能重来、点「退款」也能正常退。
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
                # 库里已是旧值；这里再显式清一次，避免重试被判成「已完成」。
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
    「客户催单先放行」「赠送补偿」时账上并没有钱，而营收按 ``paid_at`` 汇总 —— 只盖 ``paid_at`` 会
    凭空多出一笔营收且事后分不清，所以它同时置 ``manual_settlement`` 并被营收口径排除、概览里单列。
    **钱确实收到了**（线下转账、现金）请用 ``settle-offline``；两个入口分开，让「算不算营收」写在 URL 里。
    """
    return _manual_payment(session, order_no, admin=admin, manual_settlement=True)


@router.post("/orders/{order_no}/settle-offline")
def admin_settle_offline(
    order_no: str, session: DbSession, admin: AdminAccount
) -> dict:
    """线下收款入账：人工确认这笔钱**已经收到**（转账/现金），计入营收。

    与 ``mark-paid`` 的唯一差别是营收口径：``manual_settlement=False``。金额仍按
    订单实付记，审计动作是独立的 ``order.settle_offline``，所以「某笔营收是人确认过
    的」在审计日志里查得到 —— 渠道确认过钱的订单不会留下这条动作。
    """
    return _manual_payment(session, order_no, admin=admin, manual_settlement=False)


def _manual_payment(
    session: Session, order_no: str, *, admin: AdminAccount, manual_settlement: bool
) -> dict:
    """``mark-paid`` / ``settle-offline`` 的共用实现。

    两处必须逐字节一致：状态守卫、条件 UPDATE 抢单、履约分流（``manual`` 模式停在
    ``paid`` 等人核对）—— 任何一处只改一个入口，就会出现「同样一张单，从哪个按钮点
    进去行为不同」。
    """
    setting = site_config.get_setting(session)
    order = order_or_404(session, order_no)
    if order.status == "fulfilled":
        return order_payload(order)
    # payment_failed 不在这里补标记：该状态在支付失败时已释放库存预留与优惠码
    # 名额，再标记支付并履约会造成二次扣减。
    if order.status not in ORDER_FULFILLABLE_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"订单状态为{order_status_label(order.status)}，无法标记支付；"
                f"只有{_FULFILLABLE_STATUS_TEXT}的订单可以标记支付。"
            ),
        )
    # 条件 UPDATE 抢单：后台按钮可以双击、也可能与「履约」按钮并发点击。
    # 只靠上面的读判断的话，两个请求各自把订单标成 paid 并各发一次码。
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
    # 把发码留给「履约」按钮——两条支付路径必须一致：真实支付宝到账（settle_paid_order）
    # 见 manual 也停在 paid 等人核对，后台一按就发码的话「人工发卡」这道闸门等于不存在。
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
    # refunded 的授权已收回。放行会凭空发码，并重复扣减预留造成超卖。
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
        # 同时置人工补记标记，因为这里也是「没收到钱就放行」的一条路（例如手动发卡订单
        # 直接点「履约」）；不标记的话，钱没到的订单会因为这个按钮进入营收。
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
    ``needs_review`` 目前只来自「订单超时关闭后支付才到账」的复活单（钱收了、码发了，但库存早已还给
    别人）。只有置位路径而没有清除路径时，概览页那条待办会永久挂着、告警失效；刻意不在履约成功时
    自动清除，因为复活单的价值就是让人看见「这单超卖过」。清标记同时把复核结论追加进 ``review_note``。
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
    #: 保留原始原因而不是清空：这一栏是「这单为什么被标出来」的唯一记录，
    #: 清掉之后几天后回头看就只剩一句「已处理」，等于把线索删了。
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
#: 两个并发请求会各自读到同一个 ``refund_amount_cents``、把钱退两次而累计值只加一次。
#: 不用「条件 UPDATE 抢单」是因为闸门必须在**调渠道之前**取得，而那一刻事务还没写过东西，条件
#: UPDATE 会把 SQLite 写锁攥到请求结束、阻塞整个网络往返期间的所有下单。用进程内锁（每单一把、
#: 带引用计数以免字典只增不减）不占数据库写锁，跨进程残余窗口由 ``_claim_refund_amount`` 兜住。
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

    与 ``expire_stale_orders`` 同一套抢单套路：只有还能看到 ``seen_cents`` 的
    一方才有资格写。``refund_amount_cents`` 是可空列，用 ``coalesce`` 兜住历史
    数据里的 NULL（``NULL = 0`` 在 SQL 里不成立，漏掉会让老订单永远抢不到）。
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
        # teardown（见 apps.store.core.database.Database.session），那时锁早已释放，第二笔并发
        # 退款会读到同一旧累计值，两次抢单都成立、钱多退一倍；teardown 的 commit 是空操作。
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

    # 不传金额 = 退掉剩余全部（与历史上「一退就退全款」的行为保持一致）
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
    #: 必须按**线下退款**记账，绝不能回落到「当前站点配置的渠道」——配模拟收银台时会
    #: 「退成功」却分文未动。这里不抛 409（这类订单只能线下退），改为自动改走线下并记审计。
    forced_offline = _offline_refund_reason(order)
    offline_refund = bool(payload.offline) or bool(forced_offline)
    if forced_offline and not payload.offline:
        logger.warning(
            "退款按线下处理 order=%s：%s（未走任何支付渠道）", order.order_no, forced_offline
        )
        refund_reason = f"{refund_reason}｜{forced_offline}，按线下退款记账"[:255]

    # 幂等键必须**每次退款动作都不同**。写成 RF{订单号} 的话，支付宝会把第二次
    # 部分退款当成「同一笔退款」直接返回上次结果 —— 钱没退出去，本地却记成已退。
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
    # 再挂到新会话会报「object already attached to session」。

    refund_trade_no: str | None = None
    refund_detail = ""
    #: 渠道**实际**退回的金额。渠道可能只退了一部分（unrefunded_cents > 0），
    #: 记账必须按实际数字，否则账面营收会被多减。
    settled_cents = amount_cents

    if amount_cents > 0 and not offline_refund:
        # 关键：退款必须真的把钱退回去。这里过去只改本地状态，界面显示「已退款」
        # 而钱仍在商户账户：账面上营收消失了，用户却没收到退款。
        # 网关/渠道失败一律 409 且**不改任何状态**，绝不出现「状态改了、钱没退」。
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
            # 失败也要留痕：否则「退了几次都没成功」这件事在库里查不出来。
            # 注意这里必须用独立事务 —— 下面抛的 409 会让请求事务整体回滚，
            # 共用事务的话这条流水会被一起抹掉，等于没记。
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
        # 过去这种情况直接 409 拒绝，连「退了多少」都没记下来。
        settled_cents = max(0, amount_cents - int(result.unrefunded_cents or 0))

    # 渠道确认「本次没有新增资金变动」时 settled_cents 会是 0（fund_change=N / refund_fee=0）：
    # 这不是成功退款，而是「这笔钱早就退过了」——绝不能因此把订单推进 partially_refunded
    # （会让资金未动的订单显示成退过钱，还连带归还预留）。只留一条流水，订单状态保持原样。
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
    # 先抢单把本次金额并进累计值，再落流水 —— 两者必须同生共死，否则审计流水会
    # 与订单上的累计值对不上。
    cumulative_cents = refunded_cents + settled_cents
    if not _claim_refund_amount(
        session, order, seen_cents=refunded_cents, add_cents=settled_cents
    ):
        # 抢单失败：本次渠道退款**已经发出去了**，但本地累计值被另一笔退款改动过（进程内锁
        # 没覆盖到的跨进程并发）。绝不能静默覆盖（那笔钱会从账面上消失），也不能只回 409。
        # 先回滚请求事务（它可能持有写锁，独立事务写不进去），再把流水写进独立事务并报人工核对。
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
    # ``partially_refunded`` 不在 RESERVING_STATUSES 里，订单一旦离开那些状态，
    # 就再没人负责归还这一件预留了（漏掉等于这件货永久卖不出去）。
    if order.status in {"paid", "fulfillment_failed"}:
        product = session.get(Product, order.product_id) if order.product_id else None
        fulfill.release_order_reservation(session, order=order, product=product)

    fully_refunded = total_cents > 0 and cumulative_cents >= total_cents
    if fully_refunded:
        # 全额退完才收回授权、回退邀请奖励、把订单推进终态。
        # 部分退款只记录资金流出：客户仍然持有（且我们仍然欠着）那张授权。
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
    两种情况权属不同：``issue``（本单发的新授权）整张作废；``upgrade`` / ``patch``（改的是用户此前
    付过钱的那张授权）只能还原成改动前的样子 —— 整张作废等于没收他原来的消费，什么都不做又变成
    「钱退了、永久授权还在手里」（这类授权的 ``License.order_id`` 指向最早那张订单，按单号找不到）。
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
    """这笔退款为什么**只能**按线下处理（渠道侧没有可退的交易）；无需强制时返回空串。
    「标记支付」的订单把 ``payment_provider`` 记成 ``manual``，这类单在渠道侧根本不存在交易，过去却
    会回落到当前站点渠道去退：配支付宝报「交易不存在」，配模拟收银台则直接「退成功」、账面凭空多出
    一笔已退款却无资金流动。没记下单渠道或渠道名已不受支持的老订单同理，只能按线下如实记账。
    """
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
    运营中途切换渠道后，用当前渠道去退老订单会打到错误网关（报「交易不存在」，或模拟渠道直接「退
    成功」），所以优先按 ``order.payment_provider`` 找渠道实现。能走到这里的订单渠道名必然受支持：
    ``manual`` / 未知渠道已由 :func:`_offline_refund_reason` 拦下改走线下。
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

    支持多次部分退款之后，「这张单到底退了几次、每次多少钱」必须能一眼查到，
    否则对账只能靠翻审计日志里的自由文本。
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
    # pending 推走的那一个请求才释放预留与优惠码名额。
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
    订单是营收与授权来源的凭证，只允许删**确定没动过任何授权**的历史单据：状态必须是终态
    ``cancelled`` / ``expired``、``license_id`` 为空、``license_state_before_json`` 为空、渠道交易已确认
    关闭。不能拿 ``target_license_id`` 当判据 —— 增量包与升级单在下单时就会写这一列，它表达「打算改谁」
    而非「已经改过谁」，当成判据会让所有增购/升级垃圾单永远删不掉。已付款/已履约请走「退款」保留流水。
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
        # 巡检的回看窗口也已覆盖过它（见 ``channel_still_payable``）。
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
