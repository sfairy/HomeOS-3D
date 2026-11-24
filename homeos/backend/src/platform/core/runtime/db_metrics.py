"""数据库指标：语句计数、慢查询、文件 / WAL 容量。

从 ``observability`` 拆出来的第二块（第一块是 trace / 日志，第三块是 HTTP 直方图）。
拆的理由不是「文件太长」本身，而是这三块**变化原因不同**：改 HTTP 分桶不该碰 SQL 计数，
改慢查询阈值也不该重跑 HTTP 相关的测试。

## 计数为什么按线程分桶

``after_cursor_execute`` 落在**每一条** SQL 上，写线程与 HTTP 线程池会在同一把锁上
互相争用；而计数只需要「最终能加总」。因此每线程一个累加桶（SQLAlchemy 的线程池是固定
规模，登记表有上限，超出上限的临时线程不计数，避免登记表无界增长），
``get_db_query_counts()`` 负责跨线程求和。

## 慢查询为什么只暴露标量

SQL 文本的基数不可控（每张表 / 每个 where 都不同），做成指标标签会让 /metrics 体积随
业务增长。这里只记总数 / 最大值 / 阈值，具体语句走 WARNING 日志
（``[slow-sql] <ms> <statement>``），由 ``ops/scripts/slow_query_report.py`` 解析。
"""

from __future__ import annotations

import logging
import os
import threading
from collections import deque
from typing import Any

logger = logging.getLogger("homeos.db_metrics")

# 数据库查询计数 + 慢查询（Phase 0 观测）：
# - 计数按语句首关键字分 select / write / other；
# - 每条语句记一次耗时，超过阈值的单独计数并打一条 WARNING（可被运维脚本解析）。
#
# 为什么不用一把全局锁：``before_cursor_execute`` 落在**每一条** SQL 上，写线程与
# HTTP 线程池会在这把锁上互相争用；而计数本身只需要「最终能加总」。因此改成每线程
# 一个累加桶（SQLAlchemy 的线程池是固定规模，登记表有上限，超出上限的临时线程不计数，
# 避免登记表无界增长）。``get_db_query_counts()`` 负责跨线程求和。
_db_local = threading.local()
_db_registry_lock = threading.Lock()
_db_thread_counters: list[dict[str, int]] = []
#: 登记表上限。HTTP 线程池（8+4）+ 日志写线程 + 启动线程远小于这个数。
_DB_COUNTER_MAX_THREADS = 64
#: 慢查询阈值默认值（毫秒）。实际值由 ``configure_slow_query_threshold`` 在启动时注入
#: （来源是 ``Settings.slow_db_query_ms``，即 ``HOMEOS_SLOW_DB_QUERY_MS``）。
#:
#: 为什么不在每次 ``record_db_query`` 里读环境变量：那条路径落在**每一条** SQL 上，
#: 而 ``os.getenv`` 是一次 str 哈希 + 字典查找，纯属白付。
DEFAULT_SLOW_DB_QUERY_MS = 100.0
_slow_query_threshold_cache: float = DEFAULT_SLOW_DB_QUERY_MS
#: 慢查询保留的最近样本数（只用于日志/排查，不做指标标签 —— SQL 文本基数会爆炸）。
_SLOW_QUERY_RECENT = 10
_slow_query_lock = threading.Lock()
_slow_query_total = 0
_slow_query_max_ms = 0.0
_slow_query_recent: deque[tuple[float, str]] = deque(maxlen=_SLOW_QUERY_RECENT)


def configure_slow_query_threshold(milliseconds: float | None) -> None:
    """设置慢查询阈值（启动时调用；``None`` / 非正数回落到默认值）。"""
    global _slow_query_threshold_cache
    if milliseconds is None or milliseconds <= 0:
        _slow_query_threshold_cache = DEFAULT_SLOW_DB_QUERY_MS
        return
    _slow_query_threshold_cache = float(milliseconds)


def _slow_query_threshold_ms() -> float:
    return _slow_query_threshold_cache


def _statement_kind(statement: str | None) -> str:
    """只看前 8 个字符判语句类型（避免每条 SQL 都 lstrip+split）。"""
    if not statement:
        return "other"
    head = statement[:8].lstrip()[:6].upper()
    if head.startswith(("SELECT", "WITH", "EXPLAI")):
        return "select"
    if head.startswith(("INSERT", "UPDATE", "DELETE", "REPLAC")):
        return "write"
    return "other"


def _thread_counters() -> dict[str, int]:
    counters = getattr(_db_local, "counters", None)
    if counters is not None:
        return counters
    counters = {"select": 0, "write": 0, "other": 0}
    _db_local.counters = counters
    with _db_registry_lock:
        if len(_db_thread_counters) < _DB_COUNTER_MAX_THREADS:
            _db_thread_counters.append(counters)
    return counters


def record_db_query(statement: str | None, *, duration_ms: float | None = None) -> None:
    """累加一条语句；``duration_ms`` 超过阈值时额外计入慢查询并记一条 WARNING。"""
    _thread_counters()[_statement_kind(statement)] += 1
    if duration_ms is None:
        return
    threshold = _slow_query_threshold_ms()
    if duration_ms < threshold:
        return
    global _slow_query_total, _slow_query_max_ms
    snapshot = " ".join((statement or "").split())[:400]
    with _slow_query_lock:
        _slow_query_total += 1
        _slow_query_max_ms = max(_slow_query_max_ms, duration_ms)
        _slow_query_recent.append((round(duration_ms, 1), snapshot))
    # 稳定前缀供脚本解析：``[slow-sql] 123.4ms <statement>``。
    logger.warning("[slow-sql] %.1fms %s", duration_ms, snapshot)


def get_db_query_counts() -> dict[str, int]:
    totals = {"select": 0, "write": 0, "other": 0}
    with _db_registry_lock:
        buckets = list(_db_thread_counters)
    for bucket in buckets:
        for kind, value in bucket.items():
            totals[kind] = totals.get(kind, 0) + int(value)
    current = getattr(_db_local, "counters", None)
    if current is not None and not any(current is bucket for bucket in buckets):
        for kind, value in current.items():
            totals[kind] = totals.get(kind, 0) + int(value)
    return totals


def get_slow_query_stats() -> dict[str, Any]:
    """慢查询快照：总数、历史最大耗时、最近样本（供 /metrics 与排查脚本使用）。"""
    with _slow_query_lock:
        return {
            "total": _slow_query_total,
            "max_ms": round(_slow_query_max_ms, 1),
            "recent": list(_slow_query_recent),
            "threshold_ms": _slow_query_threshold_ms(),
        }


# 数据库容量指标（Phase 1 观测）：文件大小 / WAL 大小。
#
# 为什么要它：库文件与 WAL 的增长是**静默**的 —— 保留策略删干净了行，文件仍然占着
# 空闲页；WAL 在长时间只读后会一直保持高水位。没有这两个数，「磁盘怎么又满了」
# 只能靠人肉 `du`。启动时登记一次路径，之后每次 /metrics 抓取各做一次 stat（微秒级）。
_db_capacity_paths: dict[str, str] = {}


def configure_db_capacity(**paths: str) -> None:
    """登记数据库文件路径（``main=`` / ``logs=``）；传空串表示移除。"""
    for name, value in paths.items():
        if value:
            _db_capacity_paths[name] = value
        else:
            _db_capacity_paths.pop(name, None)


def get_db_capacity() -> dict[str, dict[str, int]]:
    """返回 ``{name: {file, wal}}`` 字节数；文件不存在时为 0。"""
    result: dict[str, dict[str, int]] = {}
    for name, path in sorted(_db_capacity_paths.items()):
        file_size = 0
        wal_size = 0
        try:
            file_size = os.path.getsize(path)
        except OSError:
            logger.debug("数据库文件不存在，容量按 0 处理: %s", path)
            file_size = 0
        try:
            wal_size = os.path.getsize(f"{path}-wal")
        except OSError:
            # 没有 WAL 是常态（刚 checkpoint 过 / 只读连接），不值得 WARNING。
            logger.debug("WAL 文件不存在，容量按 0 处理: %s-wal", path)
            wal_size = 0
        result[name] = {"file": file_size, "wal": wal_size}
    return result
