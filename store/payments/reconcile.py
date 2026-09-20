"""主动查单对账 + 过期订单关单。

回调地址要求公网可达，隧道掉线、支付宝重推延迟很常见，只依赖通知会出现「用户付了钱、
订单一直显示待支付」。两条兜底：前端轮询顺带查单（同订单节流）+ 后台周期巡检。

网络调用与写库刻意分两段（先收集动作、再统一落库）：SQLite 写锁跨整个事务持有，
在写事务里等一次 15 秒的网关超时会把所有写请求拖成 ``database is locked``。
"""

from __future__ import annotations

import logging
import threading
import time
from dataclasses import dataclass, field
from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from store.commerce import fulfill
from store.config import StoreSettings
from store.commerce.expiry import EXPIRE_BATCH_LIMIT, expire_stale_orders, prune_expired_sessions
from store.core.models import Order, Product, StoreSetting, utcnow
from store.payments import resolve_provider
from store.payments.alipay import SUCCESS_TRADE_STATUSES, cents_from_yuan
from store.payments.base import PaymentError
from store.payments.settlement import settle_paid_order

logger = logging.getLogger("store.payments.reconcile")

#: 同一订单两次主动查单的最小间隔（秒）
MIN_QUERY_INTERVAL_SECONDS = 3.0

#: 节流表上限，超过就整体清空（订单号不会长期复用）
_MAX_TRACKED_ORDERS = 1024

#: 巡检只处理多久以内创建的订单；更早的早该人工介入，反复查只会白耗网关配额。
SWEEP_LOOKBACK_HOURS = 24

#: 一轮巡检最多做多少笔本地过期收尾；这段不在用户请求里，比请求路径的限额大得多。
SWEEP_EXPIRE_LIMIT = EXPIRE_BATCH_LIMIT * 5

#: 关单环节的回溯窗口，比查单更长：过期订单可能过几小时才被重新扫到。
CLOSE_LOOKBACK_HOURS = 72

_last_query_at: dict[str, float] = {}
_lock = threading.Lock()


def channel_still_payable(order: Order, *, now: datetime | None = None) -> bool:
    """这笔订单的渠道交易是否**仍可能被付款**。

    支付宝预下单后不关单，旧二维码一直能扫；本地进入 expired/cancelled **不等于**渠道
    交易结束。这里用 ``CLOSE_LOOKBACK_HOURS`` 同一窗口，与后台删除订单的守卫保持同口径。
    """
    if order.payment_provider != "alipay" or order.channel_closed_at is not None:
        return False
    created = order.created_at
    if created is None:
        # 老数据可能没有创建时间；这只是附加守卫，拿不到依据时宁可放行。
        return False
    moment = now or utcnow()
    return created >= moment - timedelta(hours=CLOSE_LOOKBACK_HOURS)



def _allow_query(order_no: str) -> bool:
    now = time.monotonic()
    with _lock:
        previous = _last_query_at.get(order_no, 0.0)
        if now - previous < MIN_QUERY_INTERVAL_SECONDS:
            return False
        if len(_last_query_at) >= _MAX_TRACKED_ORDERS:
            _last_query_at.clear()
        _last_query_at[order_no] = now
        return True


def _reconcile_alipay_provider(settings: StoreSettings, setting: StoreSetting):
    """按渠道名强制解析出支付宝渠道，**绕过当前的渠道开关**（含后台配置的凭据）。

    巡检打的是「这单当时用的渠道」：运营今天把渠道切成模拟收银台，昨天真实付款的订单
    仍必须被认领。本函数**允许抛出** ``PaymentError``（调用方是后台线程，坏了要让
    ``/healthz`` 报 failing，而不是静默返回 None 假装没有支付宝订单）。
    """
    return resolve_provider(settings, setting, name_override="alipay")


def _amount_matches(order: Order, node: dict) -> bool:
    expected = int(order.amount_cents or 0)
    actual = cents_from_yuan(node.get("total_amount"))
    if actual is None or actual != expected:
        logger.error(
            "查单金额不符，拒绝入账 order=%s 期望=%s 实际=%s",
            order.order_no,
            expected,
            node.get("total_amount"),
        )
        return False
    return True


def reconcile_alipay_order(
    session: Session,
    *,
    order: Order,
    settings: StoreSettings,
    setting: StoreSetting,
    force: bool = False,
) -> bool:
    """若订单待支付且走支付宝，则查单确认；已确认到账返回 True。"""
    if order.status != "pending":
        return False
    if (order.payment_provider or "").lower() != "alipay":
        return False
    if not force and not _allow_query(order.order_no):
        return False

    provider = _reconcile_alipay_provider(settings, setting)
    if not provider.is_configured(settings):
        return False

    try:
        node = provider.query_payment(settings, order)
    except PaymentError as error:
        # 查单失败绝不影响用户：可能只是网络抖动，下次轮询会重试
        logger.warning("主动查单失败 order=%s error=%s", order.order_no, error)
        return False

    if not node:
        return False

    trade_status = str(node.get("trade_status", ""))
    if trade_status not in SUCCESS_TRADE_STATUSES:
        return False

    if not _amount_matches(order, node):
        return False

    settle_paid_order(
        session,
        order=order,
        setting=setting,
        trade_no=str(node.get("trade_no") or ""),
        source="alipay.query",
    )
    return True


@dataclass
class _Action:
    """巡检阶段收集到的待执行动作（此时**还没有**写库）。"""

    order: Order
    kind: str  #: settle | close
    trade_no: str = ""
    detail: str = ""
    #: 关单时是否也把本地订单推进终态（用于「已过期但仍是 pending」那一类）。
    expire_local: bool = False


@dataclass
class SweepResult:
    """一次巡检的结果，仅用于日志与测试断言。"""

    queried: int = 0
    settled: int = 0
    closed: int = 0
    failed: int = 0
    #: 与渠道无关的部分：本地超时单被推进终态的笔数；未配渠道的站点也会有值。
    expired: int = 0
    settled_orders: list[str] = field(default_factory=list)

    @property
    def changed(self) -> bool:
        return bool(self.settled or self.closed or self.expired)


def _confirm_paid_after_close(
    *,
    provider,
    settings: StoreSettings,
    order: Order,
    actions: list[_Action],
    result: SweepResult,
) -> bool:
    """关单接口报「已付款」时的兜底核实：重新查单，核对状态与金额后才入账。

    不能把关单接口的一句话当收款凭证 —— 金额不符或状态其实是退款/关闭的交易会被
    当成全额付款入账（发码、记营收、发邀请奖励）。核实不通过就什么都不动。
    """
    try:
        node = provider.query_payment(settings, order)
    except PaymentError as error:
        result.failed += 1
        logger.warning("关单后复核查单失败 order=%s error=%s", order.order_no, error)
        return False
    if not node:
        # 关单接口说已付款，查单却说交易不存在 —— 两者矛盾，绝不入账。
        result.failed += 1
        logger.error("关单接口称已付款，但查单查不到该交易 order=%s", order.order_no)
        return False
    trade_status = str(node.get("trade_status", ""))
    if trade_status not in SUCCESS_TRADE_STATUSES:
        result.failed += 1
        logger.error(
            "关单接口称已付款，但查单状态为 %s，已跳过 order=%s",
            trade_status or "（空）",
            order.order_no,
        )
        return False
    if not _amount_matches(order, node):
        result.failed += 1
        return False
    actions.append(
        _Action(order=order, kind="settle", trade_no=str(node.get("trade_no") or ""))
    )
    return True


def _expire_local_order(session: Session, order: Order) -> bool:
    """把「已过期但仍是 pending」的订单推进终态，归还预留与优惠码名额。

    与其它取消路径共用 ``fulfill.close_pending_order``：同样是条件 UPDATE 抢单
    （支付回调可能正好在这一瞬间认了钱），只是目标状态为 ``expired``。
    """
    product = session.get(Product, order.product_id) if order.product_id else None
    if not fulfill.close_pending_order(
        session, order=order, product=product, status="expired"
    ):
        return False
    session.refresh(order)
    return True


def reconcile_due_orders(
    session: Session,
    *,
    settings: StoreSettings,
    setting: StoreSetting,
    limit: int = 25,
) -> SweepResult:
    """巡检一次：先做渠道对账，再做**与渠道无关**的本地过期收尾。

    渠道对账在前：已过期却还是 pending 的支付宝单先有机会被认领（钱可能已付、只是通知
    丢了），确认没付才轮到关单/本地过期。本地收尾在后且不受渠道配置约束，否则没配支付宝
    的站点连本地超时单都不清理，它们会永远占着库存预留。
    """
    result = _sweep_channel_orders(session, settings=settings, setting=setting, limit=limit)
    #: 本地过期一次多清一些：这段不在用户请求里，巡检间隔以分钟计。
    expired = expire_stale_orders(session, settings, limit=SWEEP_EXPIRE_LIMIT)
    if expired:
        result.expired = expired
        logger.info(
            "支付巡检：本地过期收尾 %d 笔（已归还库存预留与优惠码名额）", expired
        )
    #: 过期登录会话的清理原本在认证依赖里做，而那是读路径 —— 每个带旧 Cookie 的 GET
    #: 都会开写事务并持有 SQLite 写锁。搬到巡检后仍会发生，但只在一个后台线程里。
    #: 不并进 ``result``：它不是订单动作，混进 ``expired`` 会让给运营看的数字含义漂移。
    pruned = prune_expired_sessions(session)
    if pruned:
        logger.info("支付巡检：清理过期登录会话 %d 条", pruned)
    return result


def _sweep_channel_orders(
    session: Session,
    *,
    settings: StoreSettings,
    setting: StoreSetting,
    limit: int = 25,
) -> SweepResult:
    """巡检一次：认领「已付款但本地还是待支付」的单，并关闭过期未付的渠道交易。

    只处理支付宝订单；模拟渠道没有真实资金流。未配置渠道时**直接返回空结果** ——
    本地过期收尾由 ``reconcile_due_orders`` 完成，不能因这里返回而一起跳过。
    """
    result = SweepResult()
    provider = _reconcile_alipay_provider(settings, setting)
    if not provider.is_configured(settings):
        return result

    moment = utcnow()
    actions: list[_Action] = []

    # ---- 阶段一：网络调用（不持有写锁） ----
    pending = session.scalars(
        select(Order)
        .where(Order.status == "pending")
        .where(Order.payment_provider == "alipay")
        .where(Order.created_at >= moment - timedelta(hours=SWEEP_LOOKBACK_HOURS))
        .order_by(Order.created_at.desc())
        .limit(limit)
    ).all()

    for order in pending:
        is_expired = order.expires_at is not None and order.expires_at <= moment
        if not _allow_query(order.order_no):
            continue
        result.queried += 1
        try:
            node = provider.query_payment(settings, order)
        except PaymentError as error:
            # 查单失败 ≠ 交易不存在：本轮什么都不做，下一轮再来。过去把失败当 None
            # 处理，关单环节据此打上 channel_closed_at，一次网关抖动就永久关错单。
            result.failed += 1
            logger.warning("巡检查单失败 order=%s error=%s", order.order_no, error)
            continue

        if node is not None and str(node.get("trade_status", "")) in SUCCESS_TRADE_STATUSES:
            if not _amount_matches(order, node):
                result.failed += 1
                continue
            actions.append(
                _Action(order=order, kind="settle", trade_no=str(node.get("trade_no") or ""))
            )
            continue

        if not is_expired:
            # 未到期的 pending 单查单只为发现「钱已到账但通知丢了」，没付属正常。
            continue

        # 已过期但仍是 pending：必须收尾，否则一直占预留，渠道交易也一直开着。
        if node is None:
            # 渠道确认没有这笔交易：没有远端交易要关，只把本地订单推进终态。
            actions.append(
                _Action(
                    order=order,
                    kind="close",
                    expire_local=True,
                    detail="渠道无此交易，本地直接过期",
                )
            )
            continue

        try:
            outcome = provider.close_payment(settings, order)
        except PaymentError as error:
            result.failed += 1
            logger.warning("过期单关单失败 order=%s error=%s", order.order_no, error)
            continue
        if outcome.already_paid:
            if _confirm_paid_after_close(
                provider=provider, settings=settings, order=order, actions=actions, result=result
            ):
                continue
            # 核实不过：不关单也不过期，留给人工与下一轮（渠道状态可能正在变）。
            continue
        if outcome.closed:
            actions.append(
                _Action(
                    order=order,
                    kind="close",
                    expire_local=True,
                    detail=outcome.reason,
                )
            )
        else:
            result.failed += 1
            logger.warning(
                "过期单关单未成功 order=%s reason=%s", order.order_no, outcome.reason
            )

    closing = session.scalars(
        select(Order)
        .where(Order.status.in_(("expired", "cancelled")))
        .where(Order.payment_provider == "alipay")
        .where(Order.channel_closed_at.is_(None))
        .where(Order.created_at >= moment - timedelta(hours=CLOSE_LOOKBACK_HOURS))
        .order_by(Order.created_at.desc())
        .limit(limit)
    ).all()

    for order in closing:
        if not _allow_query(order.order_no):
            continue
        result.queried += 1
        try:
            node = provider.query_payment(settings, order)
        except PaymentError as error:
            result.failed += 1
            logger.warning("关单前查单失败 order=%s error=%s", order.order_no, error)
            continue

        if node is None:
            # 渠道**确认**没有这笔交易（查单失败会抛异常，不会走到这）—— 无需关单。
            actions.append(
                _Action(order=order, kind="close", detail="渠道无此交易，直接标记已关闭")
            )
            continue

        if (
            str(node.get("trade_status", "")) in SUCCESS_TRADE_STATUSES
            and _amount_matches(order, node)
        ):
            # 钱其实已经付了（用户扫的还是那个旧码）。不能关单，要把它认回来。
            actions.append(
                _Action(
                    order=order,
                    kind="settle",
                    trade_no=str(node.get("trade_no") or ""),
                )
            )
            continue

        try:
            outcome = provider.close_payment(settings, order)
        except PaymentError as error:
            result.failed += 1
            logger.warning("关单失败 order=%s error=%s", order.order_no, error)
            continue

        if outcome.already_paid:
            _confirm_paid_after_close(
                provider=provider, settings=settings, order=order, actions=actions, result=result
            )
            continue
        if outcome.closed:
            actions.append(_Action(order=order, kind="close", detail=outcome.reason))
        else:
            result.failed += 1
            logger.warning(
                "关单未成功 order=%s reason=%s", order.order_no, outcome.reason
            )

    # ---- 阶段二：落库 ----
    for action in actions:
        if action.kind == "settle":
            outcome = settle_paid_order(
                session,
                order=action.order,
                setting=setting,
                trade_no=action.trade_no,
                source="alipay.sweep",
            )
            # 只有真的改动了才记数：``settle_paid_order`` 在已被其它路径入账时返回
            # ``changed=False``；无条件 +1 会让运维按巡检日志判断欠单时永远对不上。
            if outcome.get("changed"):
                result.settled += 1
                result.settled_orders.append(action.order.order_no)
            continue

        if action.expire_local and not _expire_local_order(session, action.order):
            # 状态已被别的路径改走（支付回调 / 其它扫描），副作用由它负责。
            continue
        action.order.channel_closed_at = utcnow()
        # 记一笔说明，方便排查「为什么这笔单被关掉了」
        if action.detail:
            logger.info(
                "已关闭渠道交易 order=%s 说明=%s", action.order.order_no, action.detail
            )
        result.closed += 1

    if actions:
        session.flush()
    return result
