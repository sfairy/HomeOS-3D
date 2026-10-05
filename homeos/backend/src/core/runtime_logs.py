"""进程内运行日志环形缓冲（对齐 ``common/observability/runtime-log-buffer.helper.ts``）。

仅保存在内存，进程重启后清空；不替代 stdout/stderr 采集。
类型契约由 ``@homeos/shared/observability`` 统一维护（与前端 ``/system/runtime-logs`` 对齐）。
"""

from __future__ import annotations

import json
import logging
import threading
from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any

from .log import localize_log_record, localize_logger_context
from .observability import get_trace_id
from .status_log_dedupe import StatusLogDedupeFilter

#: 环形缓冲默认容量：保留最近 2000 条运行日志
DEFAULT_CAPACITY = 2000
#: 单次查询返回条数上限
MAX_QUERY_LIMIT = 1000
#: 未指定 limit 时的默认查询条数
DEFAULT_QUERY_LIMIT = 200

#: Python logging 级别 → Nest RuntimeLogLevel
_LEVEL_MAP = {
    logging.CRITICAL: "error",
    logging.ERROR: "error",
    logging.WARNING: "warn",
    logging.INFO: "log",
    logging.DEBUG: "debug",
    logging.NOTSET: "verbose",
}


def _now_iso() -> str:
    now = datetime.now(UTC)
    return now.strftime("%Y-%m-%dT%H:%M:%S.") + f"{now.microsecond // 1000:03d}Z"


def format_log_message(message: Any) -> str:
    """将任意类型的日志 message 规范化为字符串（异常取堆栈，对象 JSON 序列化）。"""
    if isinstance(message, str):
        return message
    if isinstance(message, BaseException):
        import traceback  # noqa: PLC0415

        return "".join(traceback.format_exception(type(message), message, message.__traceback__))
    if message is None:
        return "None"
    try:
        return json.dumps(message, ensure_ascii=False)
    except (TypeError, ValueError):
        return str(message)


def _parse_level_set(level: str | None) -> set[str] | None:
    raw = (level or "").strip()
    if not raw:
        return None
    levels = {item.strip().lower() for item in raw.split(",") if item.strip()}
    return levels or None


def matches_runtime_log_filter(entry: dict[str, Any], opts: dict[str, Any] | None = None) -> bool:
    """与 ``query_runtime_logs`` 相同的单条过滤规则（供 SSE 推送复用）。"""
    options = opts or {}
    levels = _parse_level_set(options.get("level"))
    if levels and entry["level"] not in levels:
        return False

    context_q = str(options.get("context") or "").strip().lower()
    if context_q and context_q not in str(entry.get("context") or "").lower():
        return False

    q = str(options.get("q") or "").strip().lower()
    if q:
        haystack = "\n".join(
            [str(entry.get("message") or ""), str(entry.get("context") or ""), str(entry.get("traceId") or "")]
        ).lower()
        if q not in haystack:
            return False
    return True


class RuntimeLogBuffer:
    """进程内环形缓冲（线程安全：ASGI 线程池与事件循环均可能写入）。"""

    def __init__(self, capacity: int = DEFAULT_CAPACITY) -> None:
        self.capacity = capacity
        self._seq = 0
        self._dropped = 0
        self._buffer: list[dict[str, Any]] = []
        self._listeners: set[Callable[[dict[str, Any]], None]] = set()
        self._lock = threading.Lock()

    # ------------------------------------------------------------------ #
    # 写入 / 订阅
    # ------------------------------------------------------------------ #
    def push(
        self,
        *,
        level: str,
        message: Any,
        context: str | None = None,
        trace_id: str | None = None,
        ts: str | None = None,
    ) -> dict[str, Any]:
        with self._lock:
            self._seq += 1
            entry: dict[str, Any] = {
                "id": self._seq,
                "level": level,
                "message": format_log_message(message),
                "ts": ts or _now_iso(),
            }
            if context:
                entry["context"] = context
            if trace_id:
                entry["traceId"] = trace_id
            self._buffer.append(entry)
            while len(self._buffer) > self.capacity:
                self._buffer.pop(0)
                self._dropped += 1
            listeners = list(self._listeners)
        for listener in listeners:
            try:
                listener(entry)
            except Exception:  # noqa: BLE001 - 订阅方异常不影响写缓冲
                pass
        return entry

    def subscribe(self, listener: Callable[[dict[str, Any]], None]) -> Callable[[], None]:
        """订阅新日志写入（SSE / 测试用）。返回取消订阅函数。"""
        self._listeners.add(listener)

        def _unsubscribe() -> None:
            self._listeners.discard(listener)

        return _unsubscribe

    # ------------------------------------------------------------------ #
    # 查询 / 元信息 / 清空
    # ------------------------------------------------------------------ #
    def meta(self) -> dict[str, int]:
        with self._lock:
            newest = self._buffer[-1]["id"] if self._buffer else 0
            buffered = len(self._buffer)
        return {
            "capacity": self.capacity,
            "buffered": buffered,
            "newestId": newest,
            "dropped": self._dropped,
        }

    def query(self, opts: dict[str, Any] | None = None) -> dict[str, Any]:
        options = opts or {}
        after_raw = options.get("afterId")
        try:
            after_id = int(after_raw) if after_raw is not None else 0
        except (TypeError, ValueError):
            after_id = 0

        with self._lock:
            items = list(self._buffer)
        if after_id > 0:
            items = [entry for entry in items if entry["id"] > after_id]
        items = [entry for entry in items if matches_runtime_log_filter(entry, options)]

        limit_raw = options.get("limit")
        try:
            limit = int(limit_raw) if limit_raw is not None else DEFAULT_QUERY_LIMIT
        except (TypeError, ValueError):
            limit = DEFAULT_QUERY_LIMIT
        limit = min(max(limit, 1), MAX_QUERY_LIMIT)

        # 全量模式取最近 N 条；增量模式取最早的 N 条（按时间正序）
        if after_id <= 0:
            items = items[-limit:]
        elif len(items) > limit:
            items = items[:limit]

        return {"items": items, **self.meta()}

    def clear(self) -> dict[str, int]:
        with self._lock:
            cleared = len(self._buffer)
            self._buffer.clear()
        return {"cleared": cleared}


class RuntimeLogHandler(logging.Handler):
    """将 Python 日志镜像到 :class:`RuntimeLogBuffer`（供 /system/runtime-logs 查询）。"""

    def __init__(self, buffer: RuntimeLogBuffer, min_level: int = logging.INFO) -> None:
        super().__init__(level=min_level)
        self._buffer = buffer
        # 与控制台 handler 同源去重：判定结果缓存在 record 上，两个 handler 只判一次
        self.addFilter(StatusLogDedupeFilter())

    def emit(self, record: logging.LogRecord) -> None:
        try:
            level = _LEVEL_MAP.get(record.levelno, "log")
            # 与控制台/前端展示统一：缓冲里存**本地化后**的 context 与 message
            # （对齐 Nest ``capture(level, localized, ctx)`` 的入库内容）。
            message = localize_log_record(record.name, record.getMessage())
            if record.exc_info and not record.exc_text:
                record.exc_text = logging.Formatter().formatException(record.exc_info)
            if record.exc_text:
                message = f"{message}\n{record.exc_text}"
            self._buffer.push(
                level=level,
                message=message,
                context=localize_logger_context(record.name),
                trace_id=get_trace_id(),
                ts=_now_iso(),
            )
        except Exception:  # noqa: BLE001 - 日志镜像失败不得影响主流程
            pass


def install_runtime_log_handler(buffer: RuntimeLogBuffer) -> RuntimeLogHandler:
    """把运行日志缓冲挂到 ``homeos`` 日志树（幂等）。"""
    handler = RuntimeLogHandler(buffer)
    target = logging.getLogger("homeos")
    for existing in target.handlers:
        if isinstance(existing, RuntimeLogHandler):
            return existing
    target.addHandler(handler)
    return handler


__all__ = [
    "DEFAULT_CAPACITY",
    "DEFAULT_QUERY_LIMIT",
    "MAX_QUERY_LIMIT",
    "RuntimeLogBuffer",
    "RuntimeLogHandler",
    "format_log_message",
    "install_runtime_log_handler",
    "matches_runtime_log_filter",
]
