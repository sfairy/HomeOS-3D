"""后台支付巡检：定时对账 + 关闭过期交易 + 本地超时单收尾。
"""

from __future__ import annotations

import logging
import threading
from dataclasses import dataclass
from datetime import datetime, timedelta

from sqlalchemy import select, update

from apps.store.commerce import fulfill
from apps.store.ops import incidents, site_settings as site_config
from apps.store.config import StoreSettings
from apps.store.core.database import Database
from apps.store.core.models import Order, utcnow
from apps.store.payments.reconcile import SweepResult, reconcile_due_orders
from apps.store.security.security import iso_z

logger = logging.getLogger("apps.store.payments.sweeper")

#: 最近一次错误信息最多留多少字符。它是给后台一行提示用的，不是日志替身。
_MAX_ERROR_CHARS = 300

# 巡检状态
HEALTH_OK = "ok"
HEALTH_DISABLED = "disabled"
HEALTH_PENDING = "pending"
HEALTH_NEVER = "never"
HEALTH_FAILING = "failing"
HEALTH_STOPPED = "stopped"

#: 健康值 → 中文名。**后端是唯一出处**，概览接口随状态一起下发（同 incidents 的 label 做法）。
SWEEP_HEALTH_LABELS: dict[str, str] = {
    HEALTH_OK: "正常",
    HEALTH_DISABLED: "已关闭",
    HEALTH_PENDING: "尚未启动",
    HEALTH_NEVER: "从未成功",
    HEALTH_FAILING: "连续失败",
    HEALTH_STOPPED: "已停止",
}


@dataclass
class _SweepState:
    #: 当前这份状态属于哪一次循环。同一个进程里可能先后起过多个 app（测试就是这么
    generation: int = 0
    configured: bool = False
    enabled: bool = False
    interval_seconds: int = 0
    stopped: bool = False
    rounds: int = 0
    last_started_at: datetime | None = None
    last_success_at: datetime | None = None
    last_error_at: datetime | None = None
    last_error: str = ""
    consecutive_failures: int = 0
    last_result: dict[str, int] | None = None


#: 循环跑在 asyncio.to_thread 的线程里，状态却是被请求线程读的（后台概览 / healthz），
_state = _SweepState()
_lock = threading.Lock()


def configure_sweep_loop(interval_seconds: int) -> int:
    """由巡检循环启动时调用，声明「要跑、间隔多少」。
    """
    with _lock:
        _state.generation += 1
        _state.configured = True
        _state.enabled = int(interval_seconds) > 0
        _state.interval_seconds = int(interval_seconds)
        _state.stopped = False
        _state.rounds = 0
        _state.last_started_at = None
        _state.last_success_at = None
        _state.last_error_at = None
        _state.last_error = ""
        _state.consecutive_failures = 0
        _state.last_result = None
        return _state.generation


def _current_generation() -> int:
    with _lock:
        return _state.generation


def _is_current(generation: int | None) -> bool:
    """这份写入是否属于当前这轮循环。None 表示「不校验」。"""
    if generation is None:
        return True
    with _lock:
        return generation == _state.generation


def mark_sweep_loop_stopped(generation: int | None = None) -> None:
    """循环退出时调用。
    """
    with _lock:
        if generation is not None and generation != _state.generation:
            return
        _state.stopped = True


def _record_success(result: SweepResult | None, generation: int | None = None) -> None:
    with _lock:
        if generation is not None and generation != _state.generation:
            return
        _state.last_success_at = utcnow()
        _state.consecutive_failures = 0
        _state.last_error = ""
        _state.last_result = {
            "queried": int(result.queried) if result else 0,
            "settled": int(result.settled) if result else 0,
            "closed": int(result.closed) if result else 0,
            "failed": int(result.failed) if result else 0,
            "expired": int(result.expired) if result else 0,
        }


def _record_failure(error: BaseException, generation: int | None = None) -> None:
    with _lock:
        if generation is not None and generation != _state.generation:
            return
        _state.consecutive_failures += 1
        _state.last_error_at = utcnow()
        _state.last_error = f"{type(error).__name__}: {error}"[:_MAX_ERROR_CHARS]


def sweep_round(
    database: Database,
    settings: StoreSettings,
    generation: int | None = None,
) -> SweepResult | None:
    """跑一轮巡检并登记状态。异常照旧往上抛。
    """
    if generation is None:
        generation = _current_generation()
    live = _is_current(generation)
    if live:
        with _lock:
            _state.rounds += 1
            _state.last_started_at = utcnow()
    try:
        result = sweep_once(database, settings)
    except BaseException as error:
        if live:
            _record_failure(error, generation)
        raise
    if live:
        _record_success(result, generation)
    return result


def sweep_status() -> dict:
    """巡检状态快照，供后台概览与 /healthz 读取。"""
    with _lock:
        configured = _state.configured
        enabled = _state.enabled
        stopped = _state.stopped
        rounds = _state.rounds
        last_started_at = _state.last_started_at
        last_success_at = _state.last_success_at
        last_error_at = _state.last_error_at
        last_error = _state.last_error
        consecutive_failures = _state.consecutive_failures
        last_result = dict(_state.last_result) if _state.last_result else None
        interval_seconds = _state.interval_seconds

    if not configured:
        # 循环还没启动（或被独立导入本模块使用）。不能报成「已关闭」——那是在
        health = HEALTH_PENDING
    elif not enabled:
        health = HEALTH_DISABLED
    elif stopped:
        health = HEALTH_STOPPED
    elif last_success_at is None:
        health = HEALTH_PENDING if rounds == 0 else HEALTH_NEVER
    elif consecutive_failures:
        health = HEALTH_FAILING
    else:
        health = HEALTH_OK

    moment = utcnow()
    return {
        "health": health,
        # 中文名由后端下发：前端自存一份会在新增健康值时静默落到兜底（见 SWEEP_HEALTH_LABELS）。
        "healthLabel": SWEEP_HEALTH_LABELS.get(health, health),
        "enabled": enabled,
        "intervalSeconds": interval_seconds,
        "rounds": rounds,
        "lastStartedAt": iso_z(last_started_at),
        "lastSuccessAt": iso_z(last_success_at),
        "lastErrorAt": iso_z(last_error_at),
        "lastError": last_error,
        "consecutiveFailures": consecutive_failures,
        "lastResult": last_result,
        "secondsSinceSuccess": (
            None if last_success_at is None else max(0, int((moment - last_success_at).total_seconds()))
        ),
    }


#: 履约失败的单自动重试上限。用尽后停下来等人工：无限重试既刷日志，也会掩盖
#: 「这个商品配置本身有问题」这类必须有人看的事实。
MAX_FULFILLMENT_RETRIES = 5

#: 只自动重试最近这段时间内失败的单。更老的单人工早已处理或不再处理。
FULFILLMENT_RETRY_LOOKBACK_HOURS = 24


def _retry_failed_fulfillments(
    database: Database, settings: StoreSettings, *, limit: int = 10
) -> int:
    """自动重试「已收款但发码失败」的订单，返回本轮成功的笔数。

    没有这一段时，履约失败就是一个死胡同：入账时异常被刻意吞掉（对，不然支付宝会
    无限重推），订单被推到 fulfillment_failed，然后**没有任何东西会再碰它** ——
    钱收了、码没发、买家只在页面上看到一句「已支付，正在人工处理」，而唯一知道
    这件事的人只有恰好在看后台的运营。
    """
    recovered = 0
    with database.session() as session:
        setting = site_config.get_setting(session)
        moment = utcnow()
        order_ids = list(
            session.scalars(
                select(Order.id)
                .where(Order.status == "fulfillment_failed")
                .where(Order.fulfillment_attempts < MAX_FULFILLMENT_RETRIES)
                .where(
                    Order.created_at
                    >= moment - timedelta(hours=FULFILLMENT_RETRY_LOOKBACK_HOURS)
                )
                .order_by(Order.paid_at.asc())
                .limit(max(1, int(limit)))
            )
        )
        for order_id in order_ids:
            order = session.get(Order, order_id)
            if order is None or order.fulfillment_mode == "manual":
                # 手动发卡的商品本来就该等人来点，不是失败。
                continue
            # 先记一次尝试：用尽上限的单自然退出候选集，避免每轮都重试同一笔。
            session.execute(
                update(Order)
                .where(Order.id == order.id)
                .values(fulfillment_attempts=Order.fulfillment_attempts + 1)
                .execution_options(synchronize_session=False)
            )
            session.flush()
            try:
                with session.begin_nested():
                    fulfill.fulfill_order(session, order=order, setting=setting)
            except Exception as error:  # noqa: BLE001 - 单笔失败不能让整轮巡检退出
                incidents.note("fulfillment.retry", order_no=order.order_no, error=error)
                logger.warning("履约重试仍失败 order=%s：%s", order.order_no, error)
                session.refresh(order)
                continue
            session.refresh(order)
            recovered += 1
            logger.warning(
                "履约失败订单已自动补发 order=%s status=%s", order.order_no, order.status
            )
    return recovered


def sweep_once(database: Database, settings: StoreSettings) -> SweepResult | None:
    with database.session() as session:
        setting = site_config.get_setting(session)
        result = reconcile_due_orders(
            session,
            settings=settings,
            setting=setting,
            limit=max(1, int(settings.payment_sweep_batch or 25)),
        )
    # 履约失败的单自动补发：入账事务里那次失败被刻意吞掉了（否则支付宝会无限重推），
    # 没有这一段就再没有任何东西会碰它。放在入账之后，新失败的单当轮就能被捞到。
    recovered = _retry_failed_fulfillments(
        database, settings, limit=max(1, int(settings.payment_sweep_batch or 25))
    )
    if recovered:
        logger.warning("支付巡检：履约失败订单已自动补发 %d 笔", recovered)

    # 发码邮件的兜底补发：即时发送跑在响应之后的后台任务里，进程重启或当时 SMTP
    # 抖动都会让它没发生。这里放在入账与补发之后 —— 本轮刚入账 / 刚补发的单也能捞到。
    from apps.store.commerce import delivery

    delivered = delivery.sweep_undelivered(database, limit=max(1, int(settings.payment_sweep_batch or 25)))
    if delivered:
        logger.info("支付巡检：补发激活码邮件 %d 封", delivered)
    if result.queried or result.expired:
        logger.info(
            "支付巡检：查单 %d 笔，入账 %d 笔，关单 %d 笔，本地过期 %d 笔，失败 %d 笔",
            result.queried,
            result.settled,
            result.closed,
            result.expired,
            result.failed,
        )
    return result if result.changed else None
