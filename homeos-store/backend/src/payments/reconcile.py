"""主动查单对账 + 过期订单关单。
"""

from __future__ import annotations

import logging
import threading
import time
from concurrent.futures import ThreadPoolExecutor, wait
from dataclasses import dataclass, field
from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from . import refunds
from .base import PaymentError
from .settlement import settle_paid_order
from ..commerce import fulfill
from ..commerce.expiry import EXPIRE_BATCH_LIMIT, expire_stale_orders, prune_expired_sessions
from ..config import StoreSettings
from ..core.models import Order, Product, StoreSetting, utcnow
from ..ops import incidents
from ..payments import PROVIDER_NAMES, normalize_provider_name, resolve_provider

logger = logging.getLogger("src.payments.reconcile")

MIN_QUERY_INTERVAL_SECONDS = 3.0

#: 账号中心订单列表最多当场查单几笔：列表是交互路径，宁可少查几笔也不能让顾客等。
LIST_RECONCILE_LIMIT = 3

#: 订单列表查单的总预算（秒）；预算内没回来的查单直接放弃，交给后台巡检补账。
LIST_RECONCILE_BUDGET_SECONDS = 2.0

_MAX_TRACKED_ORDERS = 1024

RECONCILE_LOOKBACK_HOURS = 72

SWEEP_EXPIRE_LIMIT = EXPIRE_BATCH_LIMIT * 5

_last_query_at: dict[str, float] = {}
_lock = threading.Lock()


def channel_still_payable(order: Order, *, now: datetime | None = None) -> bool:
    """这笔订单的渠道交易是否**仍可能被付款**。
    """
    if (
        normalize_provider_name(order.payment_provider) not in PROVIDER_NAMES
        or order.channel_closed_at is not None
    ):
        return False
    created = order.created_at
    if created is None:
        return False
    moment = now or utcnow()
    return created >= moment - timedelta(hours=RECONCILE_LOOKBACK_HOURS)


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


def _reconcile_provider(settings: StoreSettings, setting: StoreSetting, name: str):
    """按**订单上冻结的渠道名**解析 provider，绕过「现在默认收款的是哪个渠道」。

    运营把默认渠道从支付宝换成微信（或临时清空）之后，在途的那批支付宝订单仍然必须
    能被对账 —— 所以回调与巡检一律按订单自己的渠道名解析，而不是看当前配置。
    """
    return resolve_provider(settings, setting, name_override=name)


def _amount_matches(order: Order, node: dict, provider) -> bool:
    expected = int(order.amount_cents or 0)
    actual = provider.paid_cents_of(node)
    if actual is None or actual != expected:
        logger.error(
            "查单金额不符，拒绝入账 order=%s 期望=%s 实际=%s",
            order.order_no,
            expected,
            node.get("total_amount"),
        )
        return False
    return True


@dataclass(frozen=True)
class _QueryOrder:
    """线程池只需要的订单快照：避免把 ORM 实例带出请求线程。"""

    order_no: str


def _query_payment_without_session(
    provider, settings: StoreSettings, order_no: str
) -> dict | None:
    """线程池里的查单探针：只发出 HTTP，绝不碰 ORM 会话或 ORM 实例。

    SQLAlchemy 的 Session 不是线程安全的，所以并发只允许发生在「查单」这一步；
    金额校验与入账（会写库）一律回到请求线程里串行执行。查单只依赖订单号，
    线程内用不可变快照，请求结束/会话 expire 都不会影响在途查单。
    """
    order = _QueryOrder(order_no=order_no)
    try:
        return provider.query_payment(settings, order)
    except PaymentError as error:
        logger.warning("主动查单失败 order=%s error=%s", order.order_no, error)
        return None
    except Exception:
        # 探针里的意外异常不能拖垮列表：记下来，剩下的交给后台巡检重试。
        logger.exception("主动查单出现未预期异常 order=%s", order.order_no)
        return None


def _settle_paid_node(
    session: Session,
    *,
    order: Order,
    setting: StoreSetting,
    channel: str,
    provider,
    node: dict,
) -> bool:
    """把一次已成功查单的结果入账；必须在持有会话的请求线程里调用。"""
    if not provider.is_success_node(node):
        return False
    if not _amount_matches(order, node, provider):
        return False
    settle_paid_order(
        session,
        order=order,
        setting=setting,
        trade_no=provider.trade_no_of(node),
        source=f"{channel}.query",
    )
    return True


def reconcile_channel_order(
    session: Session,
    *,
    order: Order,
    settings: StoreSettings,
    setting: StoreSetting,
    force: bool = False,
) -> bool:
    """若订单待支付且走某个真实渠道，则查单确认；已确认到账返回 True。

    渠道由**订单自己**的 ``payment_provider`` 决定，不看当前默认渠道 —— 运营切换渠道
    不该让在途订单失去对账能力。
    """
    if order.status != "pending":
        return False
    channel = normalize_provider_name(order.payment_provider)
    if channel not in PROVIDER_NAMES:
        return False
    if not force and not _allow_query(order.order_no):
        return False

    provider = _reconcile_provider(settings, setting, channel)
    if not provider.is_configured(settings):
        return False

    try:
        node = provider.query_payment(settings, order)
    except PaymentError as error:
        logger.warning("主动查单失败 order=%s error=%s", order.order_no, error)
        return False

    if not node:
        return False

    return _settle_paid_node(
        session,
        order=order,
        setting=setting,
        channel=channel,
        provider=provider,
        node=node,
    )


def reconcile_pending_orders_bounded(
    session: Session,
    *,
    orders: list[Order],
    settings: StoreSettings,
    setting: StoreSetting,
    limit: int = LIST_RECONCILE_LIMIT,
    budget_seconds: float = LIST_RECONCILE_BUDGET_SECONDS,
) -> int:
    """账号中心订单列表的主动对账：有界并发 + 总预算，返回实际入账笔数。

    列表是交互路径：若对每笔待支付订单串行查单，一笔慢渠道（HTTP 单次默认 15s 超时）
    就能把响应时间拖到几十秒。这里只并发查最多的 limit 笔、最多等 budget_seconds；
    预算内没回来的查单直接放弃，订单状态交给既有的 payment_sweep_loop 巡检查单补账。
    响应字段与排序不变，只是不再保证「每次列表都当场对完所有 pending」。
    """
    candidates: list[tuple[Order, str, object]] = []
    wanted = max(0, int(limit))
    if wanted <= 0 or not orders:
        return 0
    for order in orders:
        if order.status != "pending":
            continue
        channel = normalize_provider_name(order.payment_provider)
        if channel not in PROVIDER_NAMES:
            continue
        provider = _reconcile_provider(settings, setting, channel)
        if not provider.is_configured(settings):
            continue
        if not _allow_query(order.order_no):
            continue
        candidates.append((order, channel, provider))
        if len(candidates) >= wanted:
            break
    if not candidates:
        return 0

    settled = 0
    executor = ThreadPoolExecutor(
        max_workers=len(candidates), thread_name_prefix="store-reconcile"
    )
    try:
        futures = {
            executor.submit(
                _query_payment_without_session, provider, settings, order.order_no
            ): (
                order,
                channel,
                provider,
            )
            for order, channel, provider in candidates
        }
        done, not_done = wait(futures, timeout=max(0.0, float(budget_seconds)))
        for future in done:
            order, channel, provider = futures[future]
            node = future.result()
            if not node:
                continue
            try:
                if _settle_paid_node(
                    session,
                    order=order,
                    setting=setting,
                    channel=channel,
                    provider=provider,
                    node=node,
                ):
                    settled += 1
            except Exception as error:
                # 单笔入账失败只影响这一笔：记 incident，列表照常返回。
                incidents.note("reconcile.poll", order_no=order.order_no, error=error)
                logger.exception("列表查单入账失败 order=%s", order.order_no)
        if not_done:
            # wait() 返回的是 future 集合，订单信息要经 futures 映射回查。
            logger.info(
                "订单列表查单超出 %.2fs 预算，%d 笔交给后台巡检 order=%s",
                budget_seconds,
                len(not_done),
                ",".join(futures[future][0].order_no for future in not_done),
            )
    finally:
        executor.shutdown(wait=False, cancel_futures=True)
    return settled


@dataclass
class _Action:
    """巡检阶段收集到的待执行动作（此时**还没有**写库）。"""

    order: Order
    kind: str
    trade_no: str = ""
    detail: str = ""
    expire_local: bool = False


@dataclass
class SweepResult:
    """一次巡检的结果，仅用于日志与测试断言。"""

    queried: int = 0
    settled: int = 0
    closed: int = 0
    failed: int = 0
    expired: int = 0
    stale_refunds: int = 0
    settled_orders: list[str] = field(default_factory=list)

    @property
    def changed(self) -> bool:
        return bool(self.settled or self.closed or self.expired or self.stale_refunds)


def _confirm_paid_after_close(
    *,
    provider,
    settings: StoreSettings,
    order: Order,
    actions: list[_Action],
    result: SweepResult,
) -> bool:
    """关单接口报「已付款」时的兜底核实：重新查单，核对状态与金额后才入账。
    """
    try:
        node = provider.query_payment(settings, order)
    except PaymentError as error:
        result.failed += 1
        logger.warning("关单后复核查单失败 order=%s error=%s", order.order_no, error)
        return False
    if not node:
        result.failed += 1
        logger.error("关单接口称已付款，但查单查不到该交易 order=%s", order.order_no)
        return False
    if not provider.is_success_node(node):
        result.failed += 1
        logger.error(
            "关单接口称已付款，但查单状态为 %s，已跳过 order=%s",
            provider.trade_state_of(node) or "（空）",
            order.order_no,
        )
        return False
    if not _amount_matches(order, node, provider):
        result.failed += 1
        return False
    actions.append(
        _Action(order=order, kind="settle", trade_no=provider.trade_no_of(node))
    )
    return True


def _expire_local_order(session: Session, order: Order) -> bool:
    """把「已过期但仍是 pending」的订单推进终态，归还预留与优惠码名额。
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
    """
    result = _sweep_channel_orders(session, settings=settings, setting=setting, limit=limit)
    expired = expire_stale_orders(session, settings, limit=SWEEP_EXPIRE_LIMIT)
    if expired:
        result.expired = expired
        logger.info(
            "支付巡检：本地过期收尾 %d 笔（已归还库存预留与优惠码名额）", expired
        )
    pruned = prune_expired_sessions(session)
    if pruned:
        logger.info("支付巡检：清理过期登录会话 %d 条", pruned)
    stale_refunds = refunds.reconcile_stale_running_refunds(session)
    if stale_refunds:
        result.stale_refunds = stale_refunds
        logger.error("支付巡检：%d 笔退款占位长期未定论，已标记需人工核对", stale_refunds)
    return result


def _collect_pending_sweep_actions(
    *,
    pending_orders: list[Order],
    moment: datetime,
    provider_for,
    settings: StoreSettings,
    actions: list[_Action],
    sweep: SweepResult,
) -> None:
    """对待支付订单查单：已付则入账，过期未付则关单。"""
    for order in pending_orders:
        is_expired = order.expires_at is not None and order.expires_at <= moment
        if not _allow_query(order.order_no):
            continue
        provider = provider_for(normalize_provider_name(order.payment_provider))
        sweep.queried += 1
        try:
            node = provider.query_payment(settings, order)
        except PaymentError as error:
            sweep.failed += 1
            logger.warning("巡检查单失败 order=%s error=%s", order.order_no, error)
            continue

        if node is not None and provider.is_success_node(node):
            if not _amount_matches(order, node, provider):
                sweep.failed += 1
                continue
            actions.append(
                _Action(order=order, kind="settle", trade_no=provider.trade_no_of(node))
            )
            continue

        if not is_expired:
            continue

        if node is None:
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
            sweep.failed += 1
            logger.warning("过期单关单失败 order=%s error=%s", order.order_no, error)
            continue
        if outcome.already_paid:
            if _confirm_paid_after_close(
                provider=provider, settings=settings, order=order, actions=actions, result=sweep
            ):
                continue
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
            sweep.failed += 1
            logger.warning(
                "过期单关单未成功 order=%s reason=%s", order.order_no, outcome.reason
            )


def _collect_closing_sweep_actions(
    *,
    closing_orders: list[Order],
    provider_for,
    settings: StoreSettings,
    actions: list[_Action],
    sweep: SweepResult,
) -> None:
    """对已过期/已取消但渠道未关的订单：已付入账，否则关单。"""
    for order in closing_orders:
        if not _allow_query(order.order_no):
            continue
        provider = provider_for(normalize_provider_name(order.payment_provider))
        sweep.queried += 1
        try:
            node = provider.query_payment(settings, order)
        except PaymentError as error:
            sweep.failed += 1
            logger.warning("关单前查单失败 order=%s error=%s", order.order_no, error)
            continue

        if node is None:
            actions.append(
                _Action(order=order, kind="close", detail="渠道无此交易，直接标记已关闭")
            )
            continue

        if provider.is_success_node(node) and _amount_matches(order, node, provider):
            actions.append(
                _Action(
                    order=order,
                    kind="settle",
                    trade_no=provider.trade_no_of(node),
                )
            )
            continue

        try:
            outcome = provider.close_payment(settings, order)
        except PaymentError as error:
            sweep.failed += 1
            logger.warning("关单失败 order=%s error=%s", order.order_no, error)
            continue

        if outcome.already_paid:
            _confirm_paid_after_close(
                provider=provider, settings=settings, order=order, actions=actions, result=sweep
            )
            continue
        if outcome.closed:
            actions.append(_Action(order=order, kind="close", detail=outcome.reason))
        else:
            sweep.failed += 1
            logger.warning(
                "关单未成功 order=%s reason=%s", order.order_no, outcome.reason
            )


def _apply_sweep_actions(
    session: Session,
    *,
    setting: StoreSetting,
    actions: list[_Action],
    sweep: SweepResult,
) -> None:
    """把巡检收集到的 settle/close 动作落到本地库。"""
    for action in actions:
        if action.kind == "settle":
            outcome = settle_paid_order(
                session,
                order=action.order,
                setting=setting,
                trade_no=action.trade_no,
                source=f"{normalize_provider_name(action.order.payment_provider)}.sweep",
            )
            if outcome.get("changed"):
                sweep.settled += 1
                sweep.settled_orders.append(action.order.order_no)
            continue

        if action.expire_local and not _expire_local_order(session, action.order):
            continue
        action.order.channel_closed_at = utcnow()
        if action.detail:
            logger.info(
                "已关闭渠道交易 order=%s 说明=%s", action.order.order_no, action.detail
            )
        sweep.closed += 1

    if actions:
        session.flush()


def _sweep_channel_orders(
    session: Session,
    *,
    settings: StoreSettings,
    setting: StoreSetting,
    limit: int = 25,
) -> SweepResult:
    """巡检一次：认领「已付款但本地还是待支付」的单，并关闭过期未付的渠道交易。
    """
    sweep = SweepResult()
    providers: dict = {}

    def provider_for(name: str):
        if name not in providers:
            providers[name] = _reconcile_provider(settings, setting, name)
        return providers[name]

    active = [name for name in PROVIDER_NAMES if provider_for(name).is_configured(settings)]
    if not active:
        return sweep

    moment = utcnow()
    actions: list[_Action] = []

    pending = session.scalars(
        select(Order)
        .where(Order.status == "pending")
        .where(Order.payment_provider.in_(active))
        .where(Order.created_at >= moment - timedelta(hours=RECONCILE_LOOKBACK_HOURS))
        .order_by(Order.created_at.desc())
        .limit(limit)
    ).all()
    _collect_pending_sweep_actions(
        pending_orders=list(pending),
        moment=moment,
        provider_for=provider_for,
        settings=settings,
        actions=actions,
        sweep=sweep,
    )

    closing = session.scalars(
        select(Order)
        .where(Order.status.in_(("expired", "cancelled")))
        .where(Order.payment_provider.in_(active))
        .where(Order.channel_closed_at.is_(None))
        .where(Order.created_at >= moment - timedelta(hours=RECONCILE_LOOKBACK_HOURS))
        .order_by(Order.created_at.desc())
        .limit(limit)
    ).all()
    _collect_closing_sweep_actions(
        closing_orders=list(closing),
        provider_for=provider_for,
        settings=settings,
        actions=actions,
        sweep=sweep,
    )

    _apply_sweep_actions(session, setting=setting, actions=actions, sweep=sweep)
    return sweep
