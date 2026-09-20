"""后台支付巡检：定时对账 + 关闭过期交易 + 本地超时单收尾。

必须由服务端定时跑，前端轮询靠不住：用户扫码付完款直接关掉页面就再没人查单，钱付了订单却停在
pending，库存预留与优惠码名额一直挂着；本地订单过期/取消只是我们自己的状态，支付宝那笔预下单交易
仍然开着、旧二维码还能扫；商店整天没人访问（或没配渠道）时超时单连本地都不会清理。

巡检把这三件事收尾，最后一件与渠道无关所以没配支付宝也照跑；它跑在独立线程里（``asyncio.to_thread``），
因为对渠道的调用是阻塞 I/O，直接在事件循环里 await 会把整个服务卡住。
"""

from __future__ import annotations

import logging
import threading
from dataclasses import dataclass
from datetime import datetime

from store.ops import site_settings as site_config
from store.config import StoreSettings
from store.core.database import Database
from store.core.models import utcnow
from store.payments.reconcile import SweepResult, reconcile_due_orders
# 时间戳归一只有一份实现（``store.security.iso_z``）：本文件原先自带的副本口径不同 —— 对带时区的
# 输入会把当地时间贴上 ``Z`` 后缀（东八区差 8 小时），而现在库里存的都是 naive UTC 才恰好没出错。
# 一旦上游传进带时区的值，它会静默把一个错误的「UTC 时刻」交给后台与 /healthz。
from store.security.security import iso_z

logger = logging.getLogger("store.payments.sweeper")

#: 最近一次错误信息最多留多少字符。它是给后台一行提示用的，不是日志替身。
_MAX_ERROR_CHARS = 300

# 巡检状态
# 为什么需要它：巡检坏掉时**只往日志刷 traceback**，服务照常启动、下单照常成功，于是「用户付了钱、
# 订单停在待支付」慢慢堆成工单而运维只有翻日志才知道。所以巡检必须留下可被接口读到的状态：上次成功
# 是什么时候、连着失败几次、最近一次错在哪。状态只放进程内存、不落库 —— 重启后「本进程从未成功巡检」
# 本身就是最该看到的信号。词表六档，**不要**与 ``store/ops/incidents.py`` 的 ``HEALTH_*`` 合并。
HEALTH_OK = "ok"
HEALTH_DISABLED = "disabled"  # 配置关掉了巡检（间隔 0）
HEALTH_PENDING = "pending"  # 循环还没跑完第一轮
HEALTH_NEVER = "never"  # 跑过，但一次都没成功
HEALTH_FAILING = "failing"  # 成功过，但当前正在连续失败
HEALTH_STOPPED = "stopped"  # 循环已退出（进程还在跑）


@dataclass
class _SweepState:
    #: 当前这份状态属于哪一次循环。同一个进程里可能先后起过多个 app（测试就是这么
    #: 用的），光看状态本身分不出「这是那个还在跑的循环写的」还是「上一次循环迟到的
    #: 收尾写的」——代号就是用来回答这个问题的。
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
#: 所以读写都要过锁——否则后台可能读到「成功时间已写、失败次数还没清」的中间态。
_state = _SweepState()
_lock = threading.Lock()


def configure_sweep_loop(interval_seconds: int) -> int:
    """由巡检循环启动时调用，声明「要跑、间隔多少」。

    返回本次循环的**代号**（generation）。调用方要把它一路带到
    ``sweep_round`` / ``mark_sweep_loop_stopped``：重复建 app、或上一个循环的
    收尾迟到时，只有当前代号的写入才算数。
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
    没有这一步，循环一旦静默退出（例如任务被取消），后台会一直显示「上次成功 xx 分钟前」，看起来还
    活着、实际早就没人对账。``generation`` 用来确认退出的是当前这轮循环：旧循环的 finally 跑得晚一点
    时，它**不能**把已经接上来的新循环标成「已停止」。不传表示不校验（手工调用）。
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
        # 刻意**不**动 last_success_at：运维要看的正是「上次成功已经过去多久」，
        # 失败时把它清掉，等于把「坏了多久」这个信息也一起抹掉了。


def sweep_round(
    database: Database,
    settings: StoreSettings,
    generation: int | None = None,
) -> SweepResult | None:
    """跑一轮巡检并登记状态。异常照旧往上抛。
    异常的**登记**在这里、**处置**在调用方（``app.py`` 的循环负责打完整 traceback），这样「谁记录
    状态」只有一处。``generation`` 表示这轮属于哪次循环，传 None 即「当前这轮」（手工调用不必取代号）；
    不属于当前这轮的残留线程照样把巡检跑完（对账幂等），但不许写快照，以免把运维带偏。
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
        # 陈述一个我们并不知道的结论。
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
    """跑一轮巡检。返回 None 表示本轮无事可做。

    每个轮次用**自己的会话**：巡检写库的时间和请求线程完全解耦，绝不能复用
    某个请求的会话（那一事务可能已经持有写锁并卡在别处）。
    """
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
