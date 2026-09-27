"""后台支付巡检：定时对账 + 关闭过期交易 + 本地超时单收尾。
"""

from __future__ import annotations

import logging
import threading
from dataclasses import dataclass
from datetime import datetime

from apps.store.ops import site_settings as site_config
from apps.store.config import StoreSettings
from apps.store.core.database import Database
from apps.store.core.models import utcnow
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


def sweep_once(database: Database, settings: StoreSettings) -> SweepResult | None:
    with database.session() as session:
        setting = site_config.get_setting(session)
        result = reconcile_due_orders(
            session,
            settings=settings,
            setting=setting,
            limit=max(1, int(settings.payment_sweep_batch or 25)),
        )
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
