"""状态日志去重（对齐 Nest ``common/observability/status-log-dedupe.util.ts``）。

同一 ``级别 | 上下文 | 归一化消息`` 在活跃窗口内只输出一次，避免轮询 / 配置热重载刷屏。

- ``error`` / ``fatal`` 不走此逻辑（与 Nest 一致，``error`` 恒放行）；
- 连接生命周期文案（正在连接 / 已连接 / 重连 / 切换外网…）始终放行，
  避免 HA / EEW 重连成功被吞；
- 抑制期间会刷新 ``seen_at``：相同状态仍在反复打印时，不会因 TTL 到期周期性漏出；
- ``LOG_STATUS_DEDUPE_MS=0`` 可关闭；未设置时默认 30 分钟。

判定结果会缓存在 ``LogRecord`` 上（见 :class:`StatusLogDedupeFilter`），
因此控制台 handler 与运行日志缓冲 handler 共享同一次判定，不会各判一次。
"""

from __future__ import annotations

import logging
import os
import re
import threading
import time

#: 默认去重窗口：30 分钟
DEFAULT_DEDUPE_MS = 30 * 60 * 1000

#: 去重表容量上限
MAX_ENTRIES = 2_000

#: 连接 / 启停生命周期文案：允许重复出现
_LIFECYCLE_RE = re.compile(
    r"正在连接|已连接|连接已建立|已关闭|断开|重连|未连通|将在.*后重试|切换到外网|切换到局域网"
)

#: 折叠易波动的小数（坐标 / 耗时 / 比例），保留较长 ID 类整数
_DECIMAL_RE = re.compile(r"\d+\.\d+")

#: 折叠易波动的计数，保留单位（``3条`` / ``2次`` / ``500ms`` 归一为 ``#条`` / ``#次`` / ``#ms``）
_COUNT_RE = re.compile(r"\d+\s*(ms|s|m|秒|次|条|个|台|房间)", re.IGNORECASE)

#: Python ``LogRecord.levelname`` → Nest 语义级别名
_LEVELNAME_TO_NEST = {
    "DEBUG": "debug",
    "VERBOSE": "verbose",
    "INFO": "log",
    "WARNING": "warn",
    "ERROR": "error",
    "CRITICAL": "fatal",
}

#: 记录级标记：判定结果缓存位（``None`` 表示尚未判定）
_DECIDED_ATTR = "_homeos_status_dedupe_emitted"

#: key → [最近出现时刻(ms, monotonic), 已抑制次数]
_recent: dict[str, list[float]] = {}
_lock = threading.Lock()


def _resolve_dedupe_ms() -> int:
    """解析去重窗口：``LOG_STATUS_DEDUPE_MS``（毫秒），非法或未设置回退默认值。"""
    raw = os.getenv("LOG_STATUS_DEDUPE_MS")
    if raw is None or raw == "":
        return DEFAULT_DEDUPE_MS
    try:
        value = int(float(raw))
    except (TypeError, ValueError):
        return DEFAULT_DEDUPE_MS
    return value if value >= 0 else DEFAULT_DEDUPE_MS


def stabilize_status_message(text: str) -> str:
    """归一化消息：折叠易波动数值，减少「同状态不同数字」导致的漏去重。"""
    return _COUNT_RE.sub(lambda match: f"#{match.group(1)}", _DECIMAL_RE.sub("#", text))


def _prune(now_ms: float, ttl_ms: float) -> None:
    """裁剪过期与超量条目：先按 TTL 清理，仍超量则按插入序删除最旧条目。"""
    if len(_recent) <= MAX_ENTRIES:
        return
    for key in [key for key, entry in _recent.items() if now_ms - entry[0] >= ttl_ms]:
        _recent.pop(key, None)
    while len(_recent) > MAX_ENTRIES:
        oldest = next(iter(_recent), None)
        if oldest is None:
            break
        _recent.pop(oldest, None)


def should_emit_status_log(level: str, context: str, message: str) -> bool:
    """判断一条状态日志是否应输出。

    :returns: ``True`` 应输出；``False`` 应抑制
    """
    if level in ("error", "fatal"):
        return True

    ttl_ms = _resolve_dedupe_ms()
    if ttl_ms <= 0:
        return True

    text = message or ""
    # 空 / 过短消息不去重
    if len(text) < 4:
        return True
    if _LIFECYCLE_RE.search(text):
        return True

    key = f"{level}|{context}|{stabilize_status_message(text)}"
    now_ms = time.monotonic() * 1000.0
    with _lock:
        prev = _recent.get(key)
        if prev is not None and now_ms - prev[0] < ttl_ms:
            # 轮询期间持续刷新，避免 TTL 与轮询周期对齐时周期性漏出相同状态
            prev[0] = now_ms
            prev[1] += 1
            return False
        _recent[key] = [now_ms, 0.0]
        _prune(now_ms, ttl_ms)
        return True


def suppressed_count(level: str, context: str, message: str) -> int:
    """查询某条状态消息当前被抑制的次数（诊断用）。"""
    key = f"{level}|{context}|{stabilize_status_message(message or '')}"
    with _lock:
        entry = _recent.get(key)
        return int(entry[1]) if entry is not None else 0


def reset_status_dedupe() -> None:
    """清空去重表（测试 / 诊断用）。"""
    with _lock:
        _recent.clear()


class StatusLogDedupeFilter(logging.Filter):
    """把去重判定结果缓存到 ``LogRecord`` 上，保证多 handler 只判定一次。

    若直接在每个 handler 上独立判定，先判定的 handler 会刷新 ``seen_at``，
    后判定的 handler 就会把同一条记录误判为重复并丢弃（运行日志缓冲将丢行）。
    """

    def filter(self, record: logging.LogRecord) -> bool:
        decided = getattr(record, _DECIDED_ATTR, None)
        if decided is None:
            try:
                message = record.getMessage()
            except Exception:
                message = str(record.msg)
            decided = should_emit_status_log(
                _LEVELNAME_TO_NEST.get(record.levelname, "log"),
                record.name,
                message,
            )
            setattr(record, _DECIDED_ATTR, decided)
        return bool(decided)


__all__ = [
    "DEFAULT_DEDUPE_MS",
    "MAX_ENTRIES",
    "StatusLogDedupeFilter",
    "reset_status_dedupe",
    "should_emit_status_log",
    "stabilize_status_message",
    "suppressed_count",
]
