"""主动查单对账 + 过期订单关单。
"""

from __future__ import annotations

import logging
import threading
import time
from dataclasses import dataclass, field
from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..commerce import fulfill
from ..commerce.expiry import EXPIRE_BATCH_LIMIT, expire_stale_orders, prune_expired_sessions
from ..config import StoreSettings
from ..core.models import Order, Product, StoreSetting, utcnow
from ..payments import PROVIDER_NAMES, normalize_provider_name, resolve_provider
from ..payments.base import PaymentError
from ..payments.settlement import settle_paid_order

logger = logging.getLogger("src.payments.reconcile")

MIN_QUERY_INTERVAL_SECONDS = 3.0

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
    return result


def _sweep_channel_orders(
    session: Session,
    *,
    settings: StoreSettings,
    setting: StoreSetting,
    limit: int = 25,
) -> SweepResult:
    """巡检一次：认领「已付款但本地还是待支付」的单，并关闭过期未付的渠道交易。
    """
    result = SweepResult()
    providers: dict = {}

    def provider_for(name: str):
        if name not in providers:
            providers[name] = _reconcile_provider(settings, setting, name)
        return providers[name]

    active = [name for name in PROVIDER_NAMES if provider_for(name).is_configured(settings)]
    if not active:
        return result

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

    for order in pending:
        is_expired = order.expires_at is not None and order.expires_at <= moment
        if not _allow_query(order.order_no):
            continue
        provider = provider_for(normalize_provider_name(order.payment_provider))
        result.queried += 1
        try:
            node = provider.query_payment(settings, order)
        except PaymentError as error:
            result.failed += 1
            logger.warning("巡检查单失败 order=%s error=%s", order.order_no, error)
            continue

        if node is not None and provider.is_success_node(node):
            if not _amount_matches(order, node, provider):
                result.failed += 1
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
            result.failed += 1
            logger.warning("过期单关单失败 order=%s error=%s", order.order_no, error)
            continue
        if outcome.already_paid:
            if _confirm_paid_after_close(
                provider=provider, settings=settings, order=order, actions=actions, result=result
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
            result.failed += 1
            logger.warning(
                "过期单关单未成功 order=%s reason=%s", order.order_no, outcome.reason
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

    for order in closing:
        if not _allow_query(order.order_no):
            continue
        provider = provider_for(normalize_provider_name(order.payment_provider))
        result.queried += 1
        try:
            node = provider.query_payment(settings, order)
        except PaymentError as error:
            result.failed += 1
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
                result.settled += 1
                result.settled_orders.append(action.order.order_no)
            continue

        if action.expire_local and not _expire_local_order(session, action.order):
            continue
        action.order.channel_closed_at = utcnow()
        if action.detail:
            logger.info(
                "已关闭渠道交易 order=%s 说明=%s", action.order.order_no, action.detail
            )
        result.closed += 1

    if actions:
        session.flush()
    return result
