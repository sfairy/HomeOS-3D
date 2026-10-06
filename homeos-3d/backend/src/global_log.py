"""全局事件日志：JSONL 落盘、敏感信息遮盖、查询与自动清理。"""

from __future__ import annotations

import json
import os
import re
import sys
import threading
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
        "displayId",
        "projectId",
        "requestId",
        "userAgent",
        "durationMs",
        "componentId",
        "displayName",
    }
)

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
    "displayId": "展示设备编号",
    "displayName": "展示设备名称",
    "actor": "操作账号",
    "userAgent": "浏览器信息",
    "code": "原因代码",
    "line": "行号",
    "column": "列号",
    "phase": "发生阶段",
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
    text = re.sub("((?:https?|rtsps?)://[^\\s?#]+)[?#][^\\s]*", "\\1?***", text, flags=re.IGNORECASE)
    text = re.sub('/api/hls/[^\\s\\"\'<>]*', "/api/hls/[stream]", text)
    return text[:limit]


def safe_context(value: dict[str, Any] | None) -> dict[str, Any]:
    result = {}
    for key, item in (value or {}).items():
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


class GlobalLogStore:
    """存储在持久化数据目录中的免迁移 JSONL 事件日志。"""

    def __init__(
        self, data_dir: Path, *, retention_days: int = 7, max_bytes: int = 5242880
    ) -> None:
        self.directory = Path(data_dir) / "logs"
        self.path = self.directory / "global-events.jsonl"
        self.retention_days = max(1, int(retention_days))
        self.max_bytes = max(65536, int(max_bytes))
        self._lock = threading.RLock()
        self._last_pruned_at = None
        self._recent_events = {}
        self._pending = deque(maxlen=200)
        self._write_failures = 0
        self._dropped_events = 0
        self._last_error = None
        self._last_warning_at = None
        self._tail_checked = False
        try:
            self._prepare_directory()
        except OSError as error:
            self._io_failure(error)

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
            _storage_diagnostic(f"全局日志存储不可用，暂存最近 200 条事件：{self._last_error}")
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

        with self._lock:
            signature = json.dumps(
                [
                    normalized_level,
                    event["source"],
                    event["category"],
                    event["message"],
                    metadata,
                    event.get("details"),
                ],
                ensure_ascii=False,
                sort_keys=True,
            )
            now = _utc_now()
            recent = self._recent_events.get(signature)
            if recent and (now - recent[0]) < timedelta(seconds=5):
                event["id"] = recent[1]["id"]
                event["timestamp"] = recent[1]["timestamp"]
                event["repeatCount"] = recent[1].get("repeatCount", 1) + 1
                event["lastTimestamp"] = now.isoformat()
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
            if len(self._pending) == self._pending.maxlen:
                self._dropped_events += 1
            self._pending.append(event)
            try:
                self._prepare_directory()
                separate_partial_line = False
                if (
                    not self._tail_checked
                    and self.path.exists()
                    and self.path.stat().st_size
                ):
                    with self.path.open("rb") as source_file:
                        source_file.seek(-1, os.SEEK_END)
                        separate_partial_line = source_file.read(1) != b"\n"
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
        return event

    def list_events(
        self,
        *,
        level: str | None = None,
        category: str | None = None,
        search: str | None = None,
        limit: int | None = 500,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        search_key = _safe_text(search, limit=128).casefold() if search else ""
        with self._lock:
            events = self._read_events()
        result = []
        cutoff = _utc_now() - timedelta(days=self.retention_days)
        for event in reversed(events):
            try:
                timestamp = datetime.fromisoformat(
                    str(event.get("lastTimestamp") or event["timestamp"])
                )
                if timestamp.tzinfo is None:
                    timestamp = timestamp.replace(tzinfo=UTC)
                if timestamp < cutoff:
                    continue
            except (TypeError, ValueError, KeyError):
                continue
            if level and event.get("level") != level:
                continue
            if category and event.get("category") != category:
                continue
            if search_key:
                haystack = " ".join(
                    str(event.get(key) or "")
                    for key in ("source", "category", "message", "context", "details")
                ).casefold()
                if search_key not in haystack:
                    continue
            if offset > 0:
                offset -= 1
                continue
            result.append(event)
            if limit is None:
                continue
            if len(result) >= max(1, min(int(limit), 2000)):
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
