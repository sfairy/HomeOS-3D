"""主动查单对账 + 过期订单关单。

异步通知要求回调地址公网可达。本地开发靠内网穿透时，隧道掉线、支付宝重推延迟
都很常见，只依赖通知会出现「用户付了钱、订单一直显示待支付」。

所以这里有两条兜底路径：

1. **查单**：订单被前端轮询时顺带向支付宝查一次单（``reconcile_alipay_order``），
   同订单做节流，避免把网关打爆（真实环境有频率限制）。
2. **巡检**（``reconcile_due_orders``）：由后台任务周期性调用。它补上了前端轮询
   覆盖不到的场景 ——

   - 用户扫完码直接关掉页面：没人再轮询，订单会永远停在 pending；
   - 本地订单已过期/取消，但支付宝那笔预下单交易**还开着**，旧二维码仍可付款；
   - 本地订单**过了期却还是 pending**（``_expire_stale_orders`` 只在有流量的
     接口里顺带调用，商店没人访问时它根本不会跑），既不查单也不关单：
     渠道那笔交易一直开着，本地订单又卡在 pending 占着库存预留与优惠码名额。

网络调用与写库刻意分两段执行（先收集动作、再统一落库），因为 SQLite 的写锁
会跨整个事务持有，而 ``busy_timeout`` 只有 5 秒：在写事务里等一次 15 秒的
网关超时，会把同一时刻所有其它写请求全部拖成 ``database is locked``。
"""

from __future__ import annotations

import logging
import threading
import time
from dataclasses import dataclass, field
from datetime import datetime, timedelta

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from store import coupons, fulfill
from store.config import StoreSettings
from store.models import Order, Product, StoreSetting, utcnow
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


def channel_still_payable(order: Order, *, now: datetime | None = None) -> bool:
    """这笔订单的渠道交易是否**仍可能被付款**。

    支付宝预下单成功后不主动关单，用户手机上那个旧二维码就一直能扫、能付款；
    本地订单进入 ``expired`` / ``cancelled`` **不等于**渠道那笔交易结束。这正是
    「复活单」的来源：钱到账时本地已是终态，只能靠异步通知 / 巡检把它认回来。

    ``CLOSE_LOOKBACK_HOURS`` 之后巡检不再回看，也就再没有任何机制能认领这笔钱，
    所以这里用的是同一个窗口 —— 后台删除订单的守卫与巡检必须同一口径，否则会
    出现「守卫说可以删、但巡检其实还在盯着这笔单」的错位。

    非支付宝渠道（模拟收银台）没有远端交易，永远返回 False。
    """
    if order.payment_provider != "alipay" or order.channel_closed_at is not None:
        return False
    created = order.created_at
    if created is None:
        # 老数据可能没有创建时间。判断不了就别拦 —— 这只是一道**附加**守卫，
        # 拿不到依据时宁可放行，也不要造出一条永远删不掉的记录。
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
    #: 关单动作是否还要把**本地订单**推进终态。仅用于「已过期但仍是 pending」
    #: 那一类：既要关掉渠道交易，也要让本地订单离开 pending，否则它会一直占着
    #: 库存预留与优惠码名额。已经在 expired / cancelled 的订单不需要这一步。
    expire_local: bool = False


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


def _confirm_paid_after_close(
    *,
    provider,
    settings: StoreSettings,
    order: Order,
    actions: list[_Action],
    result: SweepResult,
) -> bool:
    """关单接口报「已付款」时的兜底核实：重新查单，核对状态与金额后才入账。

    过去这里直接排一条 ``settle``（``trade_no=""``）就完事 —— 等于把关单接口的
    一句话当成收款凭证，既不核对 ``trade_status`` 也不核对金额。一笔金额不符
    （或状态其实是退款/关闭）的交易会被当成全额付款入账：发码、记营收、发邀请
    奖励。核实不通过就什么都不动，交给人工与下一轮巡检。
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

    条件 UPDATE 抢单（与 ``_expire_stale_orders`` 同一套路）：支付回调可能正好在
    巡检这一瞬间把钱认了，谁先把状态从 ``pending`` 改走谁负责副作用。返回本次
    调用是否真的完成了过期。
    """
    claimed = session.execute(
        update(Order)
        .where(Order.id == order.id)
        .where(Order.status == "pending")
        .values(status="expired", cancelled_at=utcnow())
        .execution_options(synchronize_session=False)
    )
    if claimed.rowcount == 0:
        return False
    product = session.get(Product, order.product_id) if order.product_id else None
    fulfill.release_order_reservation(session, order=order, product=product)
    coupons.release_coupon(session, order)
    session.refresh(order)
    return True


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
        is_expired = order.expires_at is not None and order.expires_at <= moment
        if not _allow_query(order.order_no):
            continue
        result.queried += 1
        try:
            node = provider.query_payment(settings, order)
        except PaymentError as error:
            # 查单失败 ≠ 交易不存在（见 ``query_payment`` 的三态说明）：本轮什么
            # 都不做，下一轮再来。过去这里把失败当成 None 处理，关单环节据此给
            # 订单打上 channel_closed_at，一次网关抖动就能让一笔还开着的交易
            # 被永久标记成「已关闭」。
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
            # 还没到期的 pending 单查单只是为了发现「钱已到账但通知丢了」，
            # 没付款属于正常，不该有任何写动作。
            continue

        # 已过期但本地仍是 pending —— 必须收尾，否则这笔单会一直占着库存预留与
        # 优惠码名额，渠道侧那笔交易也一直开着（旧二维码永远能付款）。
        if node is None:
            # 渠道确认没有这笔交易（预下单就没成功）：没有需要关的远端交易，
            # 只把本地订单推进终态。
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
            # 渠道**确认**没有这笔交易（预下单失败 / 已自行关闭）—— 无需关单。
            # 这里依赖的正是 query_payment 的三态：查单失败会抛异常，不会走到这。
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
            # 只有真的改动了才记数：``settle_paid_order`` 在「已被通知或其它路径
            # 入账」时返回 ``changed=False``。无条件 +1 会把没做的事记成做了，
            # 运维拿巡检日志判断「还欠多少单没认领」就永远对不上。
            if outcome.get("changed"):
                result.settled += 1
                result.settled_orders.append(action.order.order_no)
            continue

        if action.expire_local and not _expire_local_order(session, action.order):
            # 状态已被别的路径改走（支付回调认了钱 / 其它扫描过期了），副作用由它负责。
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
