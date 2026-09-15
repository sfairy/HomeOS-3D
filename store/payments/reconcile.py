"""主动查单对账 + 过期订单关单。

异步通知要求回调地址公网可达。本地开发靠内网穿透时，隧道掉线、支付宝重推延迟
都很常见，只依赖通知会出现「用户付了钱、订单一直显示待支付」。

所以这里有两条兜底路径：

1. **查单**：订单被前端轮询时顺带向支付宝查一次单（``reconcile_alipay_order``），
   同订单做节流，避免把网关打爆（真实环境有频率限制）。
2. **巡检**（``reconcile_due_orders``）：由后台任务周期性调用。它补上了前端轮询
   覆盖不到的两个场景 ——
   - 用户扫完码直接关掉页面：没人再轮询，订单会永远停在 pending；
   - 本地订单已过期/取消，但支付宝那笔预下单交易**还开着**，旧二维码仍可付款。

网络调用与写库刻意分两段执行（先收集动作、再统一落库），因为 SQLite 的写锁
会跨整个事务持有，而 ``busy_timeout`` 只有 5 秒：在写事务里等一次 15 秒的
网关超时，会把同一时刻所有其它写请求全部拖成 ``database is locked``。
"""

from __future__ import annotations

import logging
import threading
import time
from dataclasses import dataclass, field
from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from store.config import StoreSettings
from store.models import Order, StoreSetting, utcnow
from store.payments import resolve_provider
from store.payments.alipay import SUCCESS_TRADE_STATUSES, cents_from_yuan
from store.payments.base import PaymentError
from store.payments.settlement import settle_paid_order

logger = logging.getLogger("store.payments.reconcile")

#: 同一订单两次主动查单的最小间隔（秒）
MIN_QUERY_INTERVAL_SECONDS = 3.0

#: 节流表上限，超过就整体清空（订单号不会长期复用）
_MAX_TRACKED_ORDERS = 1024

#: 巡检只处理多久以内创建的订单。更早的订单早就该人工介入了，
#: 反复去查只会白白消耗网关配额。
SWEEP_LOOKBACK_HOURS = 24

#: 巡检里「关单」环节的回溯窗口。比查单更长：过期订单可能过几个小时
#: 才被重新扫到（例如服务刚重启）。
CLOSE_LOOKBACK_HOURS = 72

_last_query_at: dict[str, float] = {}
_lock = threading.Lock()


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


def _alipay_provider(settings: StoreSettings, setting: StoreSetting):
    """按站点配置构造支付宝渠道（含后台配置的凭据）。"""
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

    provider = _alipay_provider(settings, setting)
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


@dataclass
class SweepResult:
    """一次巡检的结果，仅用于日志与测试断言。"""

    queried: int = 0
    settled: int = 0
    closed: int = 0
    failed: int = 0
    settled_orders: list[str] = field(default_factory=list)

    @property
    def changed(self) -> bool:
        return bool(self.settled or self.closed)


def reconcile_due_orders(
    session: Session,
    *,
    settings: StoreSettings,
    setting: StoreSetting,
    limit: int = 25,
) -> SweepResult:
    """巡检一次：认领「已付款但本地还是待支付」的单，并关闭过期未付的渠道交易。

    只处理支付宝订单；模拟渠道没有真实资金流，也没有需要关闭的远端交易。
    """
    result = SweepResult()
    provider = _alipay_provider(settings, setting)
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
        if order.expires_at is not None and order.expires_at <= moment:
            # 已过期的交给下面的「关单」环节：那里会先查单，付款了就认领、
            # 没付款就关单，比在这里再查一次更省一次调用。
            continue
        if not _allow_query(order.order_no):
            continue
        result.queried += 1
        try:
            node = provider.query_payment(settings, order)
        except PaymentError as error:
            result.failed += 1
            logger.warning("巡检查单失败 order=%s error=%s", order.order_no, error)
            continue
        if not node:
            continue
        if str(node.get("trade_status", "")) not in SUCCESS_TRADE_STATUSES:
            continue
        if not _amount_matches(order, node):
            result.failed += 1
            continue
        actions.append(
            _Action(order=order, kind="settle", trade_no=str(node.get("trade_no") or ""))
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
            # 支付宝那边根本没有这笔交易（预下单失败 / 已自行关闭）——无需关单
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
            # 关单接口自己发现已付款：兜底再走一次查单认领
            actions.append(_Action(order=order, kind="settle", trade_no=""))
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
            settle_paid_order(
                session,
                order=action.order,
                setting=setting,
                trade_no=action.trade_no,
                source="alipay.sweep",
            )
            result.settled += 1
            result.settled_orders.append(action.order.order_no)
        else:
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
