"""全局事件日志：JSONL 落盘、敏感信息遮盖、查询与自动清理。
"""
from __future__ import annotations

import json
import os
import re
import sys
import threading
import time
from collections import deque
from contextvars import ContextVar
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any
from uuid import uuid4

from ..core.time_utils import ensure_aware, utc_now

# 请求级上下文：中间件写入 requestId / method / path 等，深层代码 append 时不必透传。
event_context: ContextVar[dict[str, Any] | None] = ContextVar("global_log_context", default=None)

# 去重签名要剔除的「每次不同」字段：requestId / durationMs 逐请求变化，留着会让同一处
_VOLATILE_CONTEXT_KEYS = frozenset({"requestId", "durationMs"})

# 允许进入日志的上下文键白名单：名单外的键一律丢弃，防止某处误把整个请求体或实体属性
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

# 敏感信息遮盖规则，按顺序应用：私钥整段、Cookie / Set-Cookie、口令与各类令牌、
_SECRET_PATTERNS = (
    re.compile('(?is)-----BEGIN [^-]*PRIVATE KEY-----.*?(?:-----END [^-]*PRIVATE KEY-----|$)'),
    re.compile('(?im)(["\']?(?:cookie|set-cookie)["\']?\\s*[:=]\\s*)(?:"(?:\\\\.|[^"\\\\\\r\\n])*"|\'(?:\\\\.|[^\'\\\\\\r\\n])*\'|[^\\r\\n]*)'),
    re.compile('(?ix)(["\']?(?:authorization|(?:access|session|recovery|refresh)[_-]?token|token|password(?:[_-]?confirmation)?|passwd|secret|(?:activation|pairing)[_-]?code|(?:api|private)[_-]?key|signed[_-]?lease)["\']?\\s*[:=]\\s*)(?:"(?:\\\\.|[^"\\\\\\r\\n])*"|\'(?:\\\\.|[^\'\\\\\\r\\n])*\'|[^,;\\r\\n]+)'),
    re.compile('(?i)(\\bBearer\\s+)[^\\s,;"\']+'),
    re.compile('(?i)(\\b(?:rtsp|rtsps|http|https)://)[^/@\\s:]+:[^/@\\s]+@'),
    re.compile('(?i)\\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}\\b'),
    re.compile('\\beyJ[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+\\b'),
)


def _storage_diagnostic(message: str) -> None:
    """日志存储自身出问题时往 stderr 告警。
    """
    try:
        sys.stderr.write(f"{utc_now().isoformat()} {message}\n")
        sys.stderr.flush()
    except OSError:
        pass


def _safe_text(value: Any, *, limit: int) -> str:
    """把任意值转成可安全落盘的短文本。
    """
    text = str(value or "").replace("\x00", "").strip()
    for pattern in _SECRET_PATTERNS:
        # 有捕获组时只替换组后的敏感部分，保住「password=」这类字段名。
        text = pattern.sub(
            lambda match: f"{match.group(1)}***" if match.lastindex else "***", text
        )
    # URL 的查询串可能带令牌，整段打码，只保留？之前的部分。
    text = re.sub("((?:https?|rtsps?)://[^\\s?#]+)[?#][^\\s]*", "\\1?***", text, flags=re.IGNORECASE)
    # HLS 流地址里的 token 参数由路径携带，统一收敛成一个占位符再进日志。
    text = re.sub('/api/hls/[^\\s\\"\'<>]*', "/api/hls/[stream]", text)
    return text[:limit]


def safe_context(value: dict[str, Any] | None) -> dict[str, Any]:
    """过滤并遮盖日志上下文，只保留白名单内的键。
    """
    result = {}
    for key, item in (value or {}).items():
        if key not in CONTEXT_KEYS or item is None:
            continue
        if isinstance(item, (int, float, bool)):
            result[key] = item
            continue
        if not isinstance(item, str):
            continue
        if key in frozenset({"page", "path"}):
            item = item.split("?", 1)[0].split("#", 1)[0]
        result[key] = _safe_text(item, limit=256 if key != "userAgent" else 384)
    return result


class RepeatedErrorTally:
    """把「同形态的 4xx」合并成计数，只在窗口边界各写一条。
    """

    #: 同一形态多久滚动一次窗口（秒）。
    WINDOW_SECONDS = 300
    #: 记忆的形态数上限；超出后统一记进 `_OVERFLOW_KEY`。
    MAX_KEYS = 64
    #: 路径参与归并的段数上限（更深的段一律丢弃）。
    MAX_SEGMENTS = 5
    #: 段内被视作「标识符」的段：整段由 8 位以上十六进制（uuid / 哈希 / 长数字）或纯数字组成。
    _IDENTIFIER = re.compile(r"[0-9a-fA-F]{8,}|[0-9]+")
    _OVERFLOW_KEY = ("*", 0, "*")

    def __init__(self, clock=time.monotonic) -> None:
        """初始化形态表与保护它的锁（clock 默认 monotonic，注入后可控制窗口滚动）。"""
        self.clock = clock
        # 键 -> [窗口起点, 窗口内次数, 该键的展示标签]；键与标签都只由形态派生。
        self._entries: dict[tuple[str, int, str], list] = {}
        self._lock = threading.Lock()

    @classmethod
    def shape_path(cls, path: str) -> str:
        """把请求路径归一成「形态」：数字与长十六进制段替换成占位符，根路径返回 ``/``。"""
        segments = [segment for segment in path.split("/") if segment][: cls.MAX_SEGMENTS]
        if not segments:
            return "/"
        return "/" + "/".join(
            "{id}" if cls._IDENTIFIER.fullmatch(segment) else segment for segment in segments
        )

    def note(self, method: str, status: int, path: str) -> str | None:
        """记一次 4xx，返回该写入日志的说明；None 表示同形态在本窗口内已写过。"""
        shaped = self.shape_path(path)
        label = f"{method} {shaped}"
        key = (method, status, shaped)
        now = self.clock()
        with self._lock:
            if key not in self._entries and len(self._entries) >= self.MAX_KEYS:
                # 形态表已满：新形态一律并进「其他形态」，标签泛化，免得把累计次数记到某个具体路径名下。
                key = ("*", 0, "*")
                label = "其他形态的请求"
            entry = self._entries.get(key)
            if entry is None:
                self._entries[key] = [now, 1, label]
                return f"接口返回错误：{label} · HTTP {status}（本窗口内后续只计数）"
            if now - entry[0] >= self.WINDOW_SECONDS:
                (previous, entry[0], entry[1]) = (entry[1], now, 1)
                return (
                    f"接口返回错误：{entry[2]} · HTTP {status}"
                    f"（上一个 {self.WINDOW_SECONDS} 秒窗口内累计 {previous} 次）"
                )
            entry[1] += 1
            return None


class GlobalLogStore:
    """事件日志存储：JSONL 文件 + 内存兜底，无需数据库迁移。
    """

    # 后台写线程的节奏：最多每 0.5 秒把队列里的写入合并成一次追加；被唤醒后再多等
    FLUSH_INTERVAL_SECONDS = 0.5
    LINGER_SECONDS = 0.02
    # 裁剪的最小间隔（文件超限时）与常规间隔（未超限时）。两个都远大于请求间隔：裁剪是
    PRUNE_MIN_INTERVAL_SECONDS = 10
    PRUNE_INTERVAL_SECONDS = 300
    # 折叠窗口：同一签名在此窗口内重复出现会被折叠成一条；同时也是「同一签名最多多久写
    FOLD_WINDOW_SECONDS = 5
    FOLD_WRITE_INTERVAL_SECONDS = 5
    # 去重表与「上次入队时间」表的硬上限，防止海量不同签名把内存撑大。
    MAX_TRACKED_SIGNATURES = 1000
    MAX_TRACKED_IDS = 1000

    def __init__(
        self, data_dir: Path, *, retention_days: int = 7, max_bytes: int = 5242880
    ) -> None:
        self.directory = Path(data_dir) / "logs"
        self.path = self.directory / "global-events.jsonl"
        self.retention_days = max(1, int(retention_days))
        self.max_bytes = max(65536, int(max_bytes))
        # RLock 而非 Lock：append 与后台写线程会调用同样加锁的辅助方法，需要可重入。
        self._lock = threading.RLock()
        # 上次裁剪时间；None 表示「还没裁过」，允许立刻裁一次以清掉超期旧数据。
        self._last_pruned_at = None
        # 去重签名 -> (首次时间, 事件副本)，用于折叠 5 秒内的重复事件。
        self._recent_events = {}
        # 事件 id -> 上次真正入队（准备落盘）的时间：折叠期间不再逐条写盘，靠它把同一签名的
        self._last_queued_at = {}
        # 待写入队列（同时也是磁盘不可用时的兜底缓存），超过 200 条丢弃最旧的。
        self._pending = deque(maxlen=200)
        self._write_failures = 0
        self._dropped_events = 0
        self._last_error = None
        self._last_warning_at = None
        self._tail_checked = False
        # 文件解析结果的缓存：(mtime_ns, size, 重写代数) → 事件列表（最旧在前）。日志接口一次
        self._file_cache: tuple[tuple[int, int, int], list[dict[str, Any]]] | None = None
        self._file_revision = 0
        # 挂在日志对象上的附加状态（如客户端日志限流器）：与日志对象同生共死，因而
        self._auxiliary: dict[str, object] = {}
        try:
            self._prepare_directory()
        except OSError as error:
            self._io_failure(error)
        # 唯一的写盘者：append 只入队并唤醒它，磁盘 I/O 一律不出现在调用方线程里。
        self._wake = threading.Event()
        self._stopping = False
        self._writer = threading.Thread(
            target=self._writer_loop, name="global-log-writer", daemon=True
        )
        self._writer.start()

    def shared_auxiliary(self, key: str, factory):
        """取挂在日志对象上的附加状态；第一次调用时用 ``factory()`` 建。
        """
        with self._lock:
            state = self._auxiliary.get(key)
            if state is None:
                state = self._auxiliary[key] = factory()
            return state

    def _writer_loop(self) -> None:
        """后台写线程主体：批量刷盘 + 节流裁剪，直到 stop() 被调用。
        """
        while True:
            self._wake.wait(self.FLUSH_INTERVAL_SECONDS)
            self._wake.clear()
            try:
                # 被唤醒后先攒一小会儿：突发写入（例如一次 401 刷屏）会在这段时间里合并成一批，
                if self._pending:
                    time.sleep(self.LINGER_SECONDS)
                    self._wake.clear()
                with self._lock:
                    stopping = self._stopping
                    # 正常运行时每次都试一次（空队列时只是空转）；停止时只要有剩余事件就先刷完再退出。
                    if not stopping or self._pending:
                        self._flush_locked()
                        self._expire_recent_locked()
                    if stopping and not self._pending:
                        return
            except Exception as error:
                try:
                    with self._lock:
                        self._io_failure(error)
                except Exception:
                    pass

    def _expire_recent_locked(self) -> None:
        """折叠窗口结束时收尾：把需要落盘的最终计数补写一次。调用方必须已持锁。
        """
        cutoff = utc_now() - timedelta(seconds=self.FOLD_WINDOW_SECONDS)
        expired = [
            signature
            for signature, (seen_at, _event) in self._recent_events.items()
            if seen_at < cutoff
        ]
        for signature in expired:
            _seen_at, event = self._recent_events.pop(signature)
            if event.get("repeatCount", 1) <= 1:
                continue
            # 走统一的入队口：这一条常常与队列里那条同 id（同一签名的首个快照），原地替换才不会
            self._queue_event_locked(event)
            self._last_queued_at[event["id"]] = utc_now()

    def _queue_event_locked(self, event: dict[str, Any]) -> None:
        """把一条事件放进待写队列；同 id 已在队列里就**原地替换**。调用方必须已持锁。
        """
        for index, pending in enumerate(self._pending):
            if pending.get("id") == event.get("id"):
                # deque 支持按下标赋值，长度不变 → 不会触发 maxlen 淘汰。
                self._pending[index] = event
                return
        if len(self._pending) == self._pending.maxlen:
            # 队列已满：deque 会自动丢弃最旧一条，这里只统计丢弃数量。
            self._dropped_events += 1
        self._pending.append(event)

    def stop(self, *, timeout: float = 2.0) -> None:
        """停止后台写线程并把队列里剩下的事件刷盘（进程关闭 / 测试收尾时调用）。
        """
        with self._lock:
            self._stopping = True
        self._wake.set()
        writer = self._writer
        if writer is not None and writer.is_alive():
            writer.join(timeout)
        # 线程退出（或超时）后可能还有最后几条没落盘，这里补一次。
        with self._lock:
            self._flush_locked()

    def _flush_locked(self) -> None:
        """把待写队列整体追加上盘，并按需裁剪；调用方必须已持有 _lock。
        """
        if self._pending:
            # 同一 id 只写最新快照：折叠期间队列里会堆着同一条的多个版本，逐条写等于按请求量放大行数。
            batch = {}
            for pending in self._pending:
                batch[pending["id"]] = pending
            try:
                self._prepare_directory()
                separate_partial_line = False
                # 首次写入前检查文件末尾是不是换行：进程被强杀时可能留下半行 JSON，不补换行会让新事件
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
                    # 每次唤醒都把整个待写队列刷出去：队列里既有本次事件，也有磁盘故障期间积压的事件。
                    for pending in batch.values():
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
                if was_unavailable:
                    _storage_diagnostic(
                        f"全局日志存储已恢复，已补写缓存事件；累计未能保留 {self._dropped_events} 条"
                    )
            except OSError as error:
                self._io_failure(error)
                return
        self._prune_if_needed()

    def _prepare_directory(self) -> None:
        """确保目录与文件存在且权限收紧（目录 0700、文件 0600）。"""
        self.directory.mkdir(parents=True, exist_ok=True, mode=0o700)
        os.chmod(self.directory, 0o700)
        if self.path.exists():
            os.chmod(self.path, 0o600)

    def _io_failure(self, error: Exception) -> None:
        """记录一次落盘故障（含写线程里出现的意外异常），告警节流到每 30 秒最多一条。
        """
        self._tail_checked = False
        self._write_failures += 1
        self._last_error = _safe_text(error, limit=500)
        now = utc_now()
        if self._last_warning_at is None or now - self._last_warning_at >= timedelta(
            seconds=30
        ):
            _storage_diagnostic(f"全局日志存储不可用，暂存最近 200 条事件：{self._last_error}")
            self._last_warning_at = now

    def storage_status(self) -> dict[str, Any]:
        """当前存储健康状况，供 /api/v1/logs 的运维视图展示。"""
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
        """写入一条事件，返回实际落库的事件字典。
        """
        normalized_level = (
            level if level in frozenset({"info", "error", "success", "warning"}) else "info"
        )
        event: dict[str, Any] = {
            "id": str(uuid4()),
            "timestamp": utc_now().isoformat(),
            "level": normalized_level,
            "source": _safe_text(source, limit=64) or "系统后台",
            "category": _safe_text(category, limit=64) or "系统",
            "message": _safe_text(message, limit=1000) or "未提供说明",
            "repeatCount": 1,
        }
        # 调用方传入的 context 优先于请求级上下文（同名键以后者为准的反面）。
        metadata = safe_context({**(event_context.get() or {}), **(context or {})})
        if metadata:
            event["context"] = metadata
        if details:
            event["details"] = _safe_text(details, limit=8000)
        if client_timestamp:
            # 客户端时间戳格式不对就丢掉这一项，事件本身仍按服务端时间入库。
            try:
                event["clientTimestamp"] = datetime.fromisoformat(
                    client_timestamp.replace("Z", "+00:00")
                ).isoformat()
            except (ValueError, TypeError):
                pass

        with self._lock:
            # 去重签名只取影响可读性的字段，不含 id 与时间戳；requestId / durationMs 逐请求变化，
            signature = json.dumps(
                [
                    normalized_level,
                    event["source"],
                    event["category"],
                    event["message"],
                    {
                        key: value
                        for key, value in metadata.items()
                        if key not in _VOLATILE_CONTEXT_KEYS
                    },
                    event.get("details"),
                ],
                ensure_ascii=False,
                sort_keys=True,
            )
            now = utc_now()
            recent = self._recent_events.get(signature)
            # FOLD_WINDOW_SECONDS 窗口内同签名折叠：保留首次的 id 与时间戳，叠加计数并记录最后
            if recent and (now - recent[0]).total_seconds() < self.FOLD_WINDOW_SECONDS:
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
            # 兜底清理：正常情况下由写线程收尾（_expire_recent_locked），但海量不同签名涌入时表不会自己缩小。
            while len(self._recent_events) > self.MAX_TRACKED_SIGNATURES:
                self._recent_events.pop(next(iter(self._recent_events)))
            queued_at = self._last_queued_at.get(event["id"])
            if (
                event["repeatCount"] <= 1
                or queued_at is None
                or (now - queued_at).total_seconds() >= self.FOLD_WRITE_INTERVAL_SECONDS
            ):
                self._last_queued_at[event["id"]] = now
                while len(self._last_queued_at) > self.MAX_TRACKED_IDS:
                    self._last_queued_at.pop(next(iter(self._last_queued_at)))
                self._queue_event_locked(event)
                # 请求路径到此为止：这里只入队并唤醒后台写线程，不做任何磁盘 I/O（调用方可能是事件
                self._wake.set()
        return event

    def list_events(
        self,
        *,
        level: str | None = None,
        category: str | None = None,
        search: str | None = None,
        limit: int | None = 500,
        offset: int = 0,
        events: list[dict[str, Any]] | None = None,
    ) -> list[dict[str, Any]]:
        """按级别 / 分类 / 关键词筛选事件，按时间倒序返回。
        """
        search_key = _safe_text(search, limit=128).casefold() if search else ""
        if events is None:
            with self._lock:
                events = self._read_events()
        result = []
        cutoff = utc_now() - timedelta(days=self.retention_days)
        # reversed：文件里是追加写的，倒着遍历即最新的在前。
        for event in reversed(events):
            try:
                timestamp = datetime.fromisoformat(
                    str(event.get("lastTimestamp") or event["timestamp"])
                )
                # 落库/落盘时间没有时区，按 UTC 解释后再与 cutoff 比较。
                timestamp = ensure_aware(timestamp)
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
            # 上限硬编码 2000：即使调用方传了更大的值也不放行，防止一次把整个日志文件序列化进响应。
            if len(result) >= max(1, min(int(limit), 2000)):
                break
        return result

    def clear(self) -> None:
        """清空日志文件，并丢弃内存中的去重表与待写队列。"""
        with self._lock:
            self._write_events([])
            self._recent_events.clear()
            self._last_queued_at.clear()
            self._pending.clear()

    def events_snapshot(self) -> list[dict[str, Any]]:
        """一次读出全部事件（含内存里尚未落盘的），按写入顺序（最旧在前）。
        """
        with self._lock:
            return self._read_events()

    def _file_events(self, *, strict: bool = False) -> list[dict[str, Any]]:
        """文件里的事件（按写入顺序，最旧在前），按 mtime/size/重写代数缓存。
        """
        try:
            info = self.path.stat()
        except FileNotFoundError:
            if strict:
                raise
            self._file_cache = None
            return []
        except OSError as error:
            if strict:
                raise
            self._io_failure(error)
            return []
        key = (info.st_mtime_ns, info.st_size, self._file_revision)
        cached = self._file_cache
        if cached is not None and cached[0] == key:
            return cached[1]
        events: list[dict[str, Any]] = []
        try:
            with self.path.open("rb") as source:
                for line in source:
                    try:
                        event = json.loads(line)
                    except (TypeError, json.JSONDecodeError, UnicodeDecodeError):
                        # 单行损坏（例如进程被杀留下的半行）不影响其它事件。
                        continue
                    if isinstance(event, dict) and isinstance(event.get("timestamp"), str):
                        events.append(event)
        except FileNotFoundError:
            if strict:
                raise
            self._file_cache = None
            return []
        except OSError as error:
            if strict:
                raise
            self._io_failure(error)
            return []
        self._file_cache = (key, events)
        return events

    def _read_events(self, *, strict: bool = False) -> list[dict[str, Any]]:
        """读取全部事件，按 id 去重后返回。
        """
        events = {}

        def collect(event: Any) -> None:
            """把一条事件并入结果表；缺时间戳的脏数据直接忽略。"""
            if not isinstance(event, dict) or not isinstance(
                event.get("timestamp"), str
            ):
                return
            event_id = str(event.get("id") or uuid4())
            # 先删再插：dict 保序，被更新的同 id 事件移到末尾，顺序天然与「最后一次写入」一致。
            events.pop(event_id, None)
            events[event_id] = event

        for event in self._file_events(strict=strict):
            collect(event)

        for event in self._pending:
            collect(event)
        for _seen_at, event in self._recent_events.values():
            collect(event)
        return list(events.values())

    def _write_events(self, events: list[dict[str, Any]]) -> None:
        """全量重写日志文件（临时文件 + fsync + rename，保证原子性）。
        """
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
        # 重写后文件变了：代数 +1 让旧缓存立刻失效。mtime/size 通常也变了，但某些文件系统的
        self._file_revision += 1
        self._file_cache = None

    def _prune_if_needed(self) -> None:
        """按保留天数与文件上限裁剪日志（只应由后台写线程调用）。
        """
        now = utc_now()
        # 首次（_last_pruned_at 为 None）允许立刻裁一次，清掉超过保留期的旧数据。
        if self._last_pruned_at is not None:
            elapsed = now - self._last_pruned_at
            if elapsed < timedelta(seconds=self.PRUNE_MIN_INTERVAL_SECONDS):
                return
            oversized = (
                self.path.exists() and self.path.stat().st_size > self.max_bytes
            )
            if not oversized and elapsed < timedelta(
                seconds=self.PRUNE_INTERVAL_SECONDS
            ):
                return
        cutoff = now - timedelta(days=self.retention_days)
        retained = []
        retained_bytes = 0
        try:
            events = list(reversed(self._read_events(strict=True)))
        except FileNotFoundError:
            # 文件不存在（还没写过，或刚被清空）：空日志不需要裁剪，更不是存储故障。
            self._last_pruned_at = now
            return
        for event in events:
            # 时间戳缺失 / 解析不了：这条记录无法参与按时间裁剪，直接丢弃。
            try:
                timestamp = datetime.fromisoformat(
                    str(event.get("lastTimestamp") or event.get("timestamp"))
                )
                timestamp = ensure_aware(timestamp)
                if timestamp < cutoff:
                    continue
            except (TypeError, ValueError):
                continue
            event_bytes = len(json.dumps(event, ensure_ascii=False).encode("utf-8")) + 1
            # +1 是换行符；已保留至少一条时才检查上限，保证即使单条事件就超过 max_bytes，
            if retained and retained_bytes + event_bytes > self.max_bytes:
                break
            retained.append(event)
            retained_bytes += event_bytes
        retained.reverse()
        self._write_events(retained)
        self._last_pruned_at = now
