"""全局事件日志：JSONL 落盘、敏感信息遮盖、查询与自动清理。

设计要点：
- 落盘走「后台线程 + 内存队列」：请求路径只做入队，不阻塞事件循环；
  磁盘不可用时降级为只留最近 200 条，并定期往 stderr 告警。
- 所有写进日志的字符串都必须先过 `_safe_text`，因为日志会被导出与上报，
  令牌、私钥、Cookie、邮箱、摄像头带密 URL 都不能原样留下。
- 同一事件 5 秒内重复出现会被折叠成一条并累加 repeatCount，
  避免前端轮询类错误把日志文件刷爆。
"""
from __future__ import annotations

import json
import os
import re
import sys
import threading
from collections import deque
from contextvars import ContextVar
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

# 请求级上下文：由中间件写入 requestId / method / path 等，
# 这样深层代码 append 日志时不必一路透传这些字段。
event_context: ContextVar[dict[str, Any]] = ContextVar("global_log_context", default={})

# 允许进入日志的上下文键白名单：不在名单里的键一律丢弃，
# 防止某处误把整个请求体或实体属性塞进 context 而泄露敏感内容。
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

# 敏感信息遮盖规则，按顺序应用：
# 私钥整段、Cookie / Set-Cookie、口令与各类令牌、Bearer、
# 带账号密码的 URL、邮箱地址、JWT。
# 带捕获组的规则只替换第 1 组之后的内容，保留「字段名」便于排障时辨认。
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
    """统一的时间来源：日志内所有时间戳都必须是 UTC aware。"""
    return datetime.now(timezone.utc)


def _storage_diagnostic(message: str) -> None:
    """日志存储自身出问题时往 stderr 告警。

    只用 stderr 不用日志系统：这时日志系统本身已经不可用了。
    写失败静默忽略，告警不该反过来把进程搞崩。
    """
    try:
        sys.stderr.write(f"{_utc_now().isoformat()} {message}\n")
        sys.stderr.flush()
    except OSError:
        pass


def _safe_text(value: Any, *, limit: int) -> str:
    """把任意值转成可安全落盘的短文本。

    处理顺序：转字符串 → 去掉 NUL 字节（JSONL 里非法）→ 应用遮盖规则 →
    把 URL 的查询串与 HLS 流地址整体打码 → 截断到 limit。

    参数:
        value: 任意待写入日志的值。
        limit: 最大保留字符数，超出部分直接截断。

    返回:
        已遮盖并截断的字符串。
    """
    text = str(value or "").replace("\x00", "").strip()
    for pattern in _SECRET_PATTERNS:
        # 有捕获组时只替换组后的敏感部分，保住「password=」这类字段名。
        text = pattern.sub(
            lambda match: f"{match.group(1)}***" if match.lastindex else "***", text
        )
    # URL 的查询串可能带令牌，整段打码，只保留？之前的部分。
    text = re.sub("((?:https?|rtsps?)://[^\\s?#]+)[?#][^\\s]*", "\\1?***", text, flags=re.I)
    # HLS 流地址里的 token 参数由路径携带，统一收敛成一个占位符再进日志。
    text = re.sub('/api/hls/[^\\s\\"\'<>]*', "/api/hls/[stream]", text)
    return text[:limit]


def safe_context(value: dict[str, Any] | None) -> dict[str, Any]:
    """过滤并遮盖日志上下文，只保留白名单内的键。

    规则：键必须在 CONTEXT_KEYS 内；值只接受数字、布尔与字符串
    （嵌套结构一律丢弃，避免把整个文档塞进日志）；page / path 去掉查询串与
    锚点；userAgent 放宽到 384 字符，其余截断到 256。
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


class GlobalLogStore:
    """事件日志存储：JSONL 文件 + 内存兜底，无需数据库迁移。

    线程安全（内部 RLock）：日志可能从请求线程、后台线程与启动流程同时写入。
    """

    def __init__(
        self, data_dir: Path, *, retention_days: int = 7, max_bytes: int = 5242880
    ) -> None:
        """初始化存储目录与内存状态。

        参数:
            data_dir: 应用数据目录，日志落在其下的 logs/ 子目录。
            retention_days: 保留天数，至少 1 天。
            max_bytes: 单个日志文件上限，至少 64 KiB；超出后触发裁剪。
        """
        self.directory = Path(data_dir) / "logs"
        self.path = self.directory / "global-events.jsonl"
        self.retention_days = max(1, int(retention_days))
        self.max_bytes = max(65536, int(max_bytes))
        # RLock 而非 Lock：append 内部会调用同样加锁的辅助方法，需要可重入。
        self._lock = threading.RLock()
        # 上次裁剪时间，用于把裁剪节流到最多 5 分钟一次。
        self._last_pruned_at = None
        # 去重签名 -> (首次时间, 事件副本)，用于折叠 5 秒内的重复事件。
        self._recent_events = {}
        # 待写入队列（同时也是磁盘不可用时的兜底缓存），超过 200 条丢弃最旧的。
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
        """确保目录与文件存在且权限收紧（目录 0700、文件 0600）。"""
        self.directory.mkdir(parents=True, exist_ok=True, mode=0o700)
        os.chmod(self.directory, 0o700)
        if self.path.exists():
            os.chmod(self.path, 0o600)

    def _io_failure(self, error: OSError) -> None:
        """记录一次磁盘故障，并把告警节流到每 30 秒最多一条。

        事件本身已经进了 _pending，所以磁盘恢复后会自动补写，
        这里只负责计数与告警，不向外抛异常。
        """
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

        参数:
            level: 级别，非 info/error/success/warning 时归一为 info。
            source: 来源模块（如「系统后台」「仪表盘编辑器」）。
            category: 分类（如「接口」「配置」「性能」）。
            message: 人类可读的说明。
            context: 附加上下文，会与请求级 event_context 合并后过滤遮盖。
            details: 长文本细节（如堆栈），截断到 8000 字符。
            client_timestamp: 前端上报的原始时间，解析失败则丢弃该字段。

        返回:
            最终写入的事件字典；若与 5 秒内的同签名事件重复，
            则返回的是被折叠后的那条（沿用原 id 与首次时间戳）。
        """
        normalized_level = (
            level if level in frozenset({"info", "error", "success", "warning"}) else "info"
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
        # 调用方传入的 context 优先于请求级上下文（同名键以后者为准的反面）。
        metadata = safe_context({**event_context.get(), **(context or {})})
        if metadata:
            event["context"] = metadata
        if details:
            event["details"] = _safe_text(details, limit=8000)
        if client_timestamp:
            try:
                event["clientTimestamp"] = datetime.fromisoformat(
                    client_timestamp.replace("Z", "+00:00")
                ).isoformat()
            except (ValueError, TypeError):
                pass

        with self._lock:
            # 去重签名只取会影响可读性的字段，不含 id 与时间戳，
            # 这样同一处反复报错才会被识别成"重复"。
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
            # 5 秒窗口内同签名事件折叠：保留首次的 id 与时间戳，
            # 叠加计数并记录最后一次发生时间，前端据此显示「重复 N 次」。
            if recent and now - recent[0] < timedelta(seconds=5):
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
            # 兜底清理：正常情况下 5 秒后旧签名就被视作过期，
            # 但持续高频写入时表不会自己缩小，因此超过 1000 条就强制瘦身。
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
                # 队列已满：deque 会自动丢弃最旧一条，这里只统计丢弃数量。
                self._dropped_events += 1
            self._pending.append(event)
            try:
                self._prepare_directory()
                separate_partial_line = False
                # 首次写入前检查文件末尾是不是换行：进程被强杀时可能留下
                # 半行 JSON，不补换行会让新事件和残行粘成一条非法记录。
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
                    # 每次写入都把整个待写队列刷出去：
                    # 队列里既有本次事件，也有磁盘故障期间积压的事件。
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
        """按级别 / 分类 / 关键词筛选事件，按时间倒序返回。

        参数:
            level: 精确匹配级别，None 表示不限。
            category: 精确匹配分类，None 表示不限。
            search: 在来源、分类、说明、上下文与细节中做子串搜索（大小写不敏感）。
            limit: 返回上限，None 表示不限（实际最多 2000 条）；下限 1。
            offset: 跳过的条数，在筛选之后应用，用于翻页。

        返回:
            事件字典列表，最新的排在最前。
        """
        search_key = _safe_text(search, limit=128).casefold() if search else ""
        with self._lock:
            events = self._read_events()
        result = []
        cutoff = _utc_now() - timedelta(days=self.retention_days)
        # reversed：文件里是追加写的，倒着遍历即最新的在前。
        for event in reversed(events):
            try:
                timestamp = datetime.fromisoformat(
                    str(event.get("lastTimestamp") or event["timestamp"])
                )
                if timestamp.tzinfo is None:
                    timestamp = timestamp.replace(tzinfo=timezone.utc)
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
                # offset 在筛选之后生效：先把命中的结果减掉，避免边筛边跳。
                offset -= 1
                continue
            result.append(event)
            if limit is None:
                continue
            # 上限硬编码 2000：即使调用方传了更大的值也不放行，
            # 防止一次把整个日志文件序列化进响应。
            if len(result) >= max(1, min(int(limit), 2000)):
                break
        return result

    def clear(self) -> None:
        """清空日志文件，并丢弃内存中的去重表与待写队列。"""
        with self._lock:
            self._write_events([])
            self._recent_events.clear()
            self._pending.clear()

    def _read_events(self, *, strict: bool = False) -> list[dict[str, Any]]:
        """读取全部事件，按 id 去重后返回。

        参数:
            strict: True 时读写失败直接抛出（裁剪路径需要，避免误把
                读失败当成"没有事件"而清空日志）；False 时降级为告警。

        返回:
            去重后的事件列表；同一 id 以文件中最后出现的那条为准，
            并把内存待写队列里的事件追加在末尾。
        """
        events = {}

        def collect(event: Any) -> None:
            """把一条事件并入结果表；缺时间戳的脏数据直接忽略。"""
            if not isinstance(event, dict) or not isinstance(
                event.get("timestamp"), str
            ):
                return
            event_id = str(event.get("id") or uuid4())
            # 先删再插：dict 保序，这样被更新的同 id 事件会移到末尾，
            # 结果顺序天然与"最后一次写入"一致。
            events.pop(event_id, None)
            events[event_id] = event

        try:
            with self.path.open("rb") as source:
                for line in source:
                    try:
                        event = json.loads(line)
                    except (TypeError, json.JSONDecodeError, UnicodeDecodeError):
                        # 单行损坏（例如进程被杀留下的半行）不影响其它事件。
                        continue
                    collect(event)
        except FileNotFoundError:
            if strict:
                raise
        except OSError as error:
            if strict:
                raise
            self._io_failure(error)

        # 磁盘上还没有的事件必须算进来：否则磁盘不可用期间，
        # 前端刷新日志会完全看不到刚刚发生的问题。
        for event in self._pending:
            collect(event)
        return list(events.values())

    def _write_events(self, events: list[dict[str, Any]]) -> None:
        """全量重写日志文件（临时文件 + fsync + rename，保证原子性）。

        只用于 clear 与裁剪，追加写入走 append 的快路径。
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

    def _prune_if_needed(self) -> None:
        """按保留天数与文件上限裁剪日志。

        两个触发条件：文件超过 max_bytes，或距上次裁剪已过 5 分钟。
        裁剪从最新往旧保留，累计字节超限即停止 —— 也就是宁可多留新事件，
        也要保证文件不超上限。
        """
        now = _utc_now()
        oversized = self.path.exists() and self.path.stat().st_size > self.max_bytes
        # 未超限时按 5 分钟节流：裁剪要全量重写文件，不能每次 append 都做。
        if (
            not oversized
            and self._last_pruned_at
            and now - self._last_pruned_at < timedelta(minutes=5)
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
                    timestamp = timestamp.replace(tzinfo=timezone.utc)
                if timestamp < cutoff:
                    continue
            except (TypeError, ValueError):
                continue
            event_bytes = len(json.dumps(event, ensure_ascii=False).encode("utf-8")) + 1
            # +1 是换行符；已保留至少一条时才检查上限，
            # 保证即使单条事件就超过 max_bytes，日志也不会被裁成空文件。
            if retained and retained_bytes + event_bytes > self.max_bytes:
                break
            retained.append(event)
            retained_bytes += event_bytes
        retained.reverse()
        self._write_events(retained)
        self._last_pruned_at = now
