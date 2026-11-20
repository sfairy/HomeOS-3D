"""全局事件日志：JSONL 落盘、敏感信息遮盖、查询与自动清理。"""

from __future__ import annotations

import asyncio
import json
import os
import re
import sys
import threading
import time
from collections import deque
from contextvars import ContextVar
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any
from uuid import uuid4

event_context: ContextVar[dict[str, Any]] = ContextVar("global_log_context")

CONTEXT_KEYS = frozenset(
    {
        "code",
        "line",
        "page",
        "path",
        "actor",
        "phase",
        "column",
        "method",
        "status",
        "service",
        "entityId",
        "projectId",
        "requestId",
        "userAgent",
        "durationMs",
        "componentId",
        # 0.8.7 新增：请求关联、对象名、模型/事件类型、性能与存储状态。
        "hint",
        "reason",
        "reasonCode",
        "peer",
        "hours",
        "revision",
        "previousRevision",
        "eventType",
        "operation",
        "modelType",
        "appVersion",
        "frontendRevision",
        "clientFrontendRevision",
        "entityName",
        "projectName",
        "componentName",
        "componentIds",
        "pairingId",
        "displayId",
        "displayName",
        "bindingId",
        "bindingFloorId",
        "bindingModelId",
        "connectionName",
        "connectionRevision",
        "correlationId",
        "requestIds",
        "firstRequestId",
        "lastRequestId",
        "pageSessionId",
        "droppedEvents",
        "durationMinMs",
        "durationMaxMs",
        "parameterFields",
        "persistenceState",
        "retryAfterSeconds",
        # 0.8.7：控件操作的状态来源（本地下发 / 实时状态同步）。
        "state_source",
        # 0.8.7：授权事件的中文原因与稳定诊断代码。
        "chinese_reason",
        "diagnostic_code",
    }
)

#: 参与「同一条故障」判定的键要排除这些**每次请求都变**的字段，否则关联永远合不到一起。
SIGNATURE_EXCLUDED_KEYS = frozenset(
    {
        "requestId",
        "requestIds",
        "correlationId",
        "firstRequestId",
        "lastRequestId",
        "pageSessionId",
        "droppedEvents",
        "durationMs",
        "durationMinMs",
        "durationMaxMs",
        "retryAfterSeconds",
        "status",
    }
)

#: 合并计数时保留的近期请求编号条数。
RECENT_REQUEST_IDS = 6

# 上下文键的中文标签：仅用于把诊断日志渲染成人能读的段落（api/global_logs 导出）。
# 未在表内的键回退成键名本身，保证新增字段不会静默丢失。
CONTEXT_LABELS = {
    "requestId": "请求编号",
    "path": "请求路径",
    "method": "请求方法",
    "status": "响应状态",
    "durationMs": "耗时（毫秒）",
    "page": "页面",
    "projectId": "仪表盘编号",
    "componentId": "控件编号",
    "entityId": "实体",
    "service": "服务",
    "actor": "操作账号",
    "userAgent": "浏览器信息",
    "code": "原因代码",
    "line": "行号",
    "column": "列号",
    "phase": "发生阶段",
    "hint": "建议检查",
    "reason": "失败原因",
    "reasonCode": "具体原因代码",
    "peer": "请求来源地址（服务端观察）",
    "hours": "历史范围（小时）",
    "revision": "当前修订",
    "previousRevision": "原修订",
    "eventType": "事件类型",
    "operation": "相关操作",
    "modelType": "模型类型",
    "appVersion": "程序版本",
    "frontendRevision": "服务端前端修订",
    "clientFrontendRevision": "浏览器前端修订",
    "entityName": "实体名称",
    "projectName": "仪表盘名称",
    "componentName": "控件名称",
    "componentIds": "关联控件编号（最多 6 项）",
    "pairingId": "配对入口编号",
    "displayId": "显示设备编号",
    "displayName": "显示设备",
    "bindingId": "三维绑定编号",
    "bindingFloorId": "楼层编号",
    "bindingModelId": "三维模型编号",
    "connectionName": "HA 连接名称",
    "connectionRevision": "HA 配置版本指纹（不含凭据）",
    "correlationId": "关联事件编号",
    "requestIds": "近期请求编号",
    "firstRequestId": "首次请求编号",
    "lastRequestId": "最近请求编号",
    "pageSessionId": "本次页面编号",
    "droppedEvents": "浏览器丢失条数",
    "durationMinMs": "最短耗时（毫秒）",
    "durationMaxMs": "最长耗时（毫秒）",
    "parameterFields": "服务参数字段（不含值）",
    "persistenceState": "保存进度",
    "retryAfterSeconds": "计划重试间隔（秒）",
    "state_source": "状态来源",
    "chinese_reason": "中文原因",
    "diagnostic_code": "诊断代码",
}


def format_log_context(context: dict[str, Any]) -> str:
    """把日志上下文渲染成「中文标签（键）：值」逐行排列的文本。"""
    return "\n".join(
        f"{CONTEXT_LABELS.get(key, key)}（{key}）：{value}"
        for key, value in context.items()
    )

_SECRET_PATTERNS = (
    re.compile('(?is)-----BEGIN [^-]*PRIVATE KEY-----.*?(?:-----END [^-]*PRIVATE KEY-----|$)'),
    re.compile('(?im)(["\']?(?:cookie|set-cookie)["\']?\\s*[:=]\\s*)(?:"(?:\\\\.|[^"\\\\\\r\\n])*"|\'(?:\\\\.|[^\'\\\\\\r\\n])*\'|[^\\r\\n]*)'),
    re.compile('(?ix)(["\']?(?:authorization|(?:access|session|recovery|refresh)[_-]?token|token|password(?:[_-]?confirmation)?|passwd|secret|(?:activation|pairing)[_-]?code|(?:api|private)[_-]?key|signed[_-]?lease)["\']?\\s*[:=]\\s*)(?:"(?:\\\\.|[^"\\\\\\r\\n])*"|\'(?:\\\\.|[^\'\\\\\\r\\n])*\'|[^,;\\r\\n]+)'),
    re.compile('(?i)(\\bBearer\\s+)[^\\s,;"\']+'),
    re.compile('(?i)(\\b(?:rtsp|rtsps|http|https)://)[^/@\\s:]+:[^/@\\s]+@'),
    re.compile('(?i)\\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}\\b'),
    re.compile('\\beyJ[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+\\b'),
)


def _utc_now() -> datetime:
    return datetime.now(UTC)


def _storage_diagnostic(message: str) -> None:
    try:
        sys.stderr.write(f"{_utc_now().isoformat()} {message}\n")
        sys.stderr.flush()
    except OSError:
        pass


def _safe_text(value: Any, *, limit: int) -> str:
    text = str(value or "").replace("\x00", "").strip()
    text = re.sub("/embed/[A-Za-z0-9_-]{43}(?=/|\\b)", "/embed/[session]", text)
    for pattern in _SECRET_PATTERNS:
        text = pattern.sub(
            lambda match: f"{match.group(1) if match.lastindex else ''}***", text
        )
    # 一次性的业务票据同样是凭据：备份检查单、备份工作目录都不该进日志。
    text = re.sub("(/api/v1/backups/jobs/)[A-Za-z0-9_-]+", "\\1[inspection]", text)
    text = re.sub("([/\\\\]backup-work[/\\\\])[0-9a-f]{32}", "\\1[inspection]", text)
    # 协议从 http/rtsp 扩到含 ws/wss：实时通道的地址同样带一次性凭据。
    text = re.sub(
        "((?:https?|rtsps?|wss?)://[^\\s?#]+)[?#][^\\s]*", "\\1?***", text, flags=re.IGNORECASE
    )
    text = re.sub('/api/hls/[^\\s\\"\'<>]*', "/api/hls/[stream]", text)
    return text[:limit]


def _event_matches(
    event: dict[str, Any],
    *,
    cutoff: datetime,
    level: str | None,
    category: str | None,
    search_key: str,
) -> bool:
    """单条事件是否落在保留期内且满足 level/category/search 过滤。"""
    try:
        timestamp = datetime.fromisoformat(str(event.get("lastTimestamp") or event["timestamp"]))
    except (TypeError, ValueError, KeyError):
        return False
    if timestamp.tzinfo is None:
        timestamp = timestamp.replace(tzinfo=UTC)
    if timestamp < cutoff:
        return False
    if level and event.get("level") != level:
        return False
    if category and event.get("category") != category:
        return False
    if search_key:
        haystack = " ".join(
            str(event.get(key) or "") for key in ("source", "category", "message", "context", "details")
        ).casefold()
        if search_key not in haystack:
            return False
    return True


def safe_context(value: dict[str, Any] | None) -> dict[str, Any]:
    result = {}
    # 先落到局部变量再迭代：Cython 3.3.0 会在 `(value or {}).items()` 这种
    # 「带 `dict[...] | None` 注解的参数 + or 兜底 + 直接 .items()」的组合上崩在
    # AnalyseExpressionsTransform（SimpleCallNode.args 为 None），构建期直接失败。
    source = value or {}
    for key, item in source.items():
        if key not in CONTEXT_KEYS or item is None:
            continue
        if isinstance(item, (int, float, bool)):
            result[key] = item
            continue
        if not isinstance(item, str):
            continue
        if key in {"page", "path"}:
            item = item.split("?", 1)[0].split("#", 1)[0]
        result[key] = _safe_text(item, limit=256 if key != "userAgent" else 384)
    return result


def _build_log_event(
    level: str,
    source: str,
    category: str,
    message: str,
    context: dict[str, Any] | None,
    details: str | None,
    client_timestamp: str | None,
) -> tuple[dict[str, Any], dict[str, Any]]:
    """构造一条规范化的日志事件，并返回其（用于去重的）上下文副本。"""
    normalized_level = (
        level if level in {"info", "error", "success", "warning"} else "info"
    )
    event = {
        "id": str(uuid4()),
        "timestamp": _utc_now().isoformat(),
        "level": normalized_level,
        "source": _safe_text(source, limit=64) or "系统后台",
        "category": _safe_text(category, limit=64) or "系统",
        "message": _safe_text(message, limit=1000) or "未提供说明",
        "repeatCount": 1,
    }
    metadata = safe_context({**event_context.get({}), **(context or {})})
    if metadata:
        event["context"] = metadata
    if details:
        event["details"] = _safe_text(details, limit=8000)
    if client_timestamp:
        try:
            event["clientTimestamp"] = datetime.fromisoformat(client_timestamp).isoformat()
        except (ValueError, TypeError):
            pass
    return event, metadata


def signature_context(metadata: dict[str, Any]) -> dict[str, Any]:
    """用于「同一条故障」判定的上下文副本（剔除每次请求都变的字段）。"""
    return {key: value for key, value in metadata.items() if key not in SIGNATURE_EXCLUDED_KEYS}


def _event_signature(event: dict[str, Any], metadata: dict[str, Any]) -> str:
    """事件去重签名：同级别 / 来源 / 分类 / 正文 / 稳定上下文 / 明细视为同一条。

    `metadata` 里剔除 ``SIGNATURE_EXCLUDED_KEYS`` 后才参与签名 —— 否则带 ``requestId`` 的
    两条记录永远签不上，前端「关联日志」也就永远只能看到一条。
    """
    return json.dumps(
        [
            event["level"],
            event["source"],
            event["category"],
            event["message"],
            signature_context(metadata),
            event.get("details"),
        ],
        ensure_ascii=False,
        sort_keys=True,
    )


def _as_number(value: Any) -> float | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    return float(value)


def _accumulate_request_ids(context: dict[str, Any], previous: dict[str, Any]) -> None:
    """把「首次 / 最近 / 近期」请求编号累积到合并后的事件上。"""
    request_id = str(context.get("requestId") or "")
    first = previous.get("firstRequestId") or previous.get("requestId") or request_id
    recent = [str(item) for item in (previous.get("requestIds") or []) if item]
    if request_id:
        recent = [request_id, *[item for item in recent if item != request_id]][:RECENT_REQUEST_IDS]
    if first:
        context["firstRequestId"] = first
    if request_id:
        context["lastRequestId"] = request_id
    if recent:
        context["requestIds"] = recent


def _accumulate_durations(context: dict[str, Any], previous: dict[str, Any]) -> None:
    """耗时区间：合并后保留最短 / 最长，而不是只留最后一条。"""
    current = _as_number(context.get("durationMs"))
    if current is None:
        return
    candidates = [current, _as_number(previous.get("durationMinMs")), _as_number(previous.get("durationMaxMs"))]
    numbers = [value for value in candidates if value is not None]
    context["durationMinMs"] = round(min(numbers), 1)
    context["durationMaxMs"] = round(max(numbers), 1)


def _accumulate_aggregates(event: dict[str, Any], previous: dict[str, Any]) -> None:
    """合并重复事件时补齐聚合字段（关联编号与耗时区间）。"""
    context = dict(event.get("context") or {})
    previous_context = previous.get("context") or {}
    _accumulate_request_ids(context, previous_context)
    _accumulate_durations(context, previous_context)
    if context:
        event["context"] = context


class GlobalLogStore:
    """存储在持久化数据目录中的 JSONL 事件日志。"""

    def __init__(
        self, data_dir: Path, *, retention_days: int = 7, max_bytes: int = 5242880
    ) -> None:
        self.directory = Path(data_dir) / "logs"
        self.path = self.directory / "global-events.jsonl"
        self.retention_days = max(1, int(retention_days))
        self.max_bytes = max(65536, int(max_bytes))
        self._lock = threading.RLock()
        #: 后台落盘线程唤醒事件：append() 只入内存队列并置位，绝不在调用线程（通常是
        #: 事件循环）里做 open/write/fsync。旧实现每条日志同步写盘，一个请求路径上的
        #: 多条日志会直接叠加成事件循环的阻塞时间。
        self._wake = threading.Event()
        #: 落盘尝试计数 + 条件变量：flush() 用它等待「至少尝试过一次落盘」。
        self._flush_attempts = 0
        self._idle = threading.Condition()
        self._closed = False
        self._last_pruned_at = None
        self._recent_events = {}
        self._pending = deque(maxlen=2000)
        self._write_failures = 0
        self._dropped_events = 0
        self._last_error = None
        self._last_warning_at = None
        self._tail_checked = False
        try:
            self._prepare_directory()
        except OSError as error:
            self._io_failure(error)
        self._writer = threading.Thread(
            target=self._writer_loop, name="global-log-writer", daemon=True
        )
        self._writer.start()

    #: 写盘失败后的重试间隔（秒）：内存队列里的事件在下次 append 前不会丢。
    _WRITE_RETRY_SECONDS = 5.0

    def _writer_loop(self) -> None:
        """单写线程按序落盘；顺序由「单线程 + 同一把锁」保证。"""
        retry_wait: float | None = None
        while True:
            self._wake.wait(retry_wait)
            self._wake.clear()
            with self._lock:
                pending = bool(self._pending)
                if pending:
                    self._flush_pending()
                    self._flush_attempts += 1
                    pending = bool(self._pending)
                closed = self._closed
            with self._idle:
                self._idle.notify_all()
            if closed:
                return
            # 失败时定时重试；成功后阻塞到下一次 append 置位唤醒。
            retry_wait = self._WRITE_RETRY_SECONDS if pending else None

    def flush(self, timeout: float | None = 5.0) -> None:
        """阻塞等待待写队列落盘（供停机 / 测试；不在事件循环内调用）。"""
        with self._lock:
            target = self._flush_attempts + 1
        deadline = None if timeout is None else time.monotonic() + timeout
        with self._idle:
            self._wake.set()
            while True:
                with self._lock:
                    if not self._pending or self._flush_attempts >= target:
                        return
                if deadline is None:
                    self._idle.wait(0.05)
                    continue
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    return
                self._idle.wait(remaining)

    def close(self, timeout: float | None = 5.0) -> None:
        """停机：最后一次落盘后结束写线程（幂等）。"""
        with self._idle:
            self._closed = True
            self._wake.set()
        writer = getattr(self, "_writer", None)
        if (
            writer is not None
            and writer.is_alive()
            and threading.current_thread() is not writer
        ):
            writer.join(timeout)

    def _prepare_directory(self) -> None:
        self.directory.mkdir(parents=True, exist_ok=True, mode=0o700)
        os.chmod(self.directory, 0o700)
        if self.path.exists():
            os.chmod(self.path, 0o600)

    def _io_failure(self, error: OSError) -> None:
        self._tail_checked = False
        self._write_failures += 1
        self._last_error = _safe_text(error, limit=500)
        now = _utc_now()
        if self._last_warning_at is None or now - self._last_warning_at >= timedelta(
            seconds=30
        ):
            _storage_diagnostic(f"全局日志存储不可用，暂存最近 2000 条事件：{self._last_error}")
            self._last_warning_at = now

    def storage_status(self) -> dict[str, Any]:
        with self._lock:
            return {
                "healthy": self._last_error is None,
                "retentionDays": self.retention_days,
                "maxBytes": self.max_bytes,
                "writeFailures": self._write_failures,
                "pendingEvents": len(self._pending),
                "droppedEvents": self._dropped_events,
                "lastError": self._last_error,
            }

    def _merge_recent_event(
        self, signature: str, event: dict[str, Any], now: datetime
    ) -> None:
        """5 秒内的同签名事件合并计数（保留首条 id / 时间戳），并顺带裁剪缓存。"""
        recent = self._recent_events.get(signature)
        if recent and (now - recent[0]) < timedelta(seconds=5):
            event["id"] = recent[1]["id"]
            event["timestamp"] = recent[1]["timestamp"]
            event["repeatCount"] = recent[1].get("repeatCount", 1) + 1
            event["lastTimestamp"] = now.isoformat()
            _accumulate_aggregates(event, recent[1])
            if event.get("clientTimestamp"):
                event["lastClientTimestamp"] = event["clientTimestamp"]
                event["clientTimestamp"] = recent[1].get(
                    "clientTimestamp", event["clientTimestamp"]
                )
        self._recent_events[signature] = (now, event.copy())
        if len(self._recent_events) > 1000:
            cutoff = now - timedelta(seconds=5)
            self._recent_events = {
                key: value
                for key, value in self._recent_events.items()
                if value[0] >= cutoff
            }
            while len(self._recent_events) > 1000:
                self._recent_events.pop(next(iter(self._recent_events)))

    def _needs_separator_line(self) -> bool:
        """尾部若不是换行，落盘前得先补一个换行，避免两条 JSON 粘成一行。"""
        if self._tail_checked or not self.path.exists() or not self.path.stat().st_size:
            return False
        with self.path.open("rb") as source_file:
            source_file.seek(-1, os.SEEK_END)
            return source_file.read(1) != b"\n"

    def _flush_pending(self) -> None:
        """把待写队列原子落盘；失败时降级为内存暂存并记录 IO 故障。"""
        try:
            self._prepare_directory()
            separate_partial_line = self._needs_separator_line()
            descriptor = os.open(
                self.path, os.O_WRONLY | os.O_APPEND | os.O_CREAT, 0o600
            )
            with os.fdopen(descriptor, "ab") as output:
                if separate_partial_line:
                    output.write(b"\n")
                for pending in self._pending:
                    output.write(
                        (
                            json.dumps(
                                pending, ensure_ascii=False, separators=(",", ":")
                            )
                            + "\n"
                        ).encode("utf-8")
                    )
                output.flush()
            self._pending.clear()
            self._tail_checked = True
            was_unavailable = self._last_error is not None
            self._last_error = None
            self._prune_if_needed()
            if was_unavailable:
                _storage_diagnostic(
                    f"全局日志存储已恢复，已补写缓存事件；累计未能保留 {self._dropped_events} 条"
                )
        except OSError as error:
            self._io_failure(error)

    def append(
        self,
        level: str,
        source: str,
        category: str,
        message: str,
        *,
        context: dict[str, Any] | None = None,
        details: str | None = None,
        client_timestamp: str | None = None,
    ) -> dict[str, Any]:
        event, metadata = _build_log_event(
            level, source, category, message, context, details, client_timestamp
        )

        with self._lock:
            signature = _event_signature(event, metadata)
            now = _utc_now()
            self._merge_recent_event(signature, event, now)
            if len(self._pending) == self._pending.maxlen:
                self._dropped_events += 1
            self._pending.append(event)
            # 只置位唤醒写线程：查询路径（list_events）会合并 pending，立即可见。
            self._wake.set()
        return event

    async def append_async(
        self,
        level: str,
        source: str,
        category: str,
        message: str,
        *,
        context: dict[str, Any] | None = None,
        details: str | None = None,
        client_timestamp: str | None = None,
    ) -> dict[str, Any]:
        """在事件循环里安全地写一条日志（把同步写入搬到线程池）。

        - 用 ``asyncio.to_thread`` 而不是 ``run_in_executor``：前者会把当前
          ``contextvars``（``event_context`` 里的请求 id / 会话）复制进线程，日志的关联
          字段才不会丢；
        - 不 ``create_task``：写入已经开始就让它写完（它持有锁）。取消一个正持锁的任务会
          留下「锁没人释放」，而下一次写入会永久等下去。
        """
        return await asyncio.to_thread(
            self.append,
            level,
            source,
            category,
            message,
            context=context,
            details=details,
            client_timestamp=client_timestamp,
        )

    def list_events(
        self,
        *,
        level: str | None = None,
        category: str | None = None,
        search: str | None = None,
        limit: int | None = 500,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        with self._lock:
            events = self._read_events()
        return self._filter_events(events, level=level, category=category, search=search, limit=limit, offset=offset)

    def list_events_with_categories(
        self,
        *,
        level: str | None = None,
        category: str | None = None,
        search: str | None = None,
        limit: int | None = 500,
        offset: int = 0,
    ) -> tuple[list[dict[str, Any]], list[str]]:
        """一次读取同时返回过滤结果与分类清单。

        ``/logs`` 页面两者都要：旧实现先 ``list_events(limit=None)`` 再
        ``list_events(limit=None)`` 取分类 —— 每个请求两次全量 JSONL 解析 + 两次加锁，
        而写线程也用同一把锁。
        """
        with self._lock:
            events = self._read_events()
        categories = sorted({str(item.get("category") or "") for item in events if item.get("category")})
        filtered = self._filter_events(
            events, level=level, category=category, search=search, limit=limit, offset=offset
        )
        return filtered, categories

    def _filter_events(
        self,
        events: list[dict[str, Any]],
        *,
        level: str | None,
        category: str | None,
        search: str | None,
        limit: int | None,
        offset: int,
    ) -> list[dict[str, Any]]:
        search_key = _safe_text(search, limit=128).casefold() if search else ""
        result: list[dict[str, Any]] = []
        cutoff = _utc_now() - timedelta(days=self.retention_days)
        max_items = max(1, min(int(limit), 2000)) if limit is not None else None
        for event in reversed(events):
            if not _event_matches(event, cutoff=cutoff, level=level, category=category, search_key=search_key):
                continue
            if offset > 0:
                offset -= 1
                continue
            result.append(event)
            if max_items is not None and len(result) >= max_items:
                break
        return result

    def clear(self) -> None:
        with self._lock:
            self._write_events([])
            self._recent_events.clear()
            self._pending.clear()

    def _read_events(self, *, strict: bool = False) -> list[dict[str, Any]]:
        events = {}

        def collect(event: Any) -> None:
            if not isinstance(event, dict) or not isinstance(
                event.get("timestamp"), str
            ):
                return
            event_id = str(event.get("id") or uuid4())
            events.pop(event_id, None)
            events[event_id] = event

        try:
            with self.path.open("rb") as source:
                for line in source:
                    try:
                        event = json.loads(line)
                    except (TypeError, json.JSONDecodeError, UnicodeDecodeError):
                        continue
                    collect(event)
        except FileNotFoundError:
            if strict:
                raise
        except OSError as error:
            if strict:
                raise
            self._io_failure(error)

        for event in self._pending:
            collect(event)
        return list(events.values())

    def _write_events(self, events: list[dict[str, Any]]) -> None:
        self.directory.mkdir(parents=True, exist_ok=True, mode=0o700)
        temporary = self.path.with_suffix(".tmp")
        descriptor = os.open(temporary, os.O_WRONLY | os.O_TRUNC | os.O_CREAT, 0o600)
        with os.fdopen(descriptor, "w", encoding="utf-8") as output:
            for event in events:
                output.write(
                    json.dumps(event, ensure_ascii=False, separators=(",", ":")) + "\n"
                )
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary, self.path)
        os.chmod(self.path, 0o600)

    def _prune_if_needed(self) -> None:
        now = _utc_now()
        oversized = self.path.exists() and self.path.stat().st_size > self.max_bytes
        if not oversized and self._last_pruned_at and now - self._last_pruned_at < timedelta(
            minutes=5
        ):
            return
        cutoff = now - timedelta(days=self.retention_days)
        retained = []
        retained_bytes = 0
        for event in reversed(self._read_events(strict=True)):
            try:
                timestamp = datetime.fromisoformat(
                    str(event.get("lastTimestamp") or event.get("timestamp"))
                )
                if timestamp.tzinfo is None:
                    timestamp = timestamp.replace(tzinfo=UTC)
                if timestamp < cutoff:
                    continue
            except (TypeError, ValueError):
                continue
            event_bytes = len(json.dumps(event, ensure_ascii=False).encode("utf-8")) + 1
            if retained and retained_bytes + event_bytes > self.max_bytes:
                break
            retained.append(event)
            retained_bytes += event_bytes
        retained.reverse()
        self._write_events(retained)
        self._last_pruned_at = now
