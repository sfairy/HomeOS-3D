"""全局事件日志：JSONL 落盘、敏感信息遮盖、查询与自动清理。

落盘走「后台写线程 + 内存队列」：请求路径只入队，磁盘 I/O 全在唯一写线程（磁盘不可用
时只留最近 200 条并告警）。裁剪是全量重写，必须由写线程按最小间隔做，绝不随每次写入
触发 —— 否则外部刷满日志就能把每次请求放大成全量重写（自造 DoS）。写进日志的字符串
一律先过 `_safe_text`（日志会被导出上报），同一事件 5 秒内重复则折叠计数。
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
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

from .time_utils import ensure_aware

# 请求级上下文：由中间件写入 requestId / method / path 等，深层代码 append 时不必透传。
#
# 默认值必须是 None 而不是 {}（B44）：ContextVar 的默认值是**同一个对象**，任何一处
# 「拿到就原地改」都会改掉所有未 set 过的上下文（其他任务、后台线程）看到的那份，
# 表现为字段串到无关日志上且不报错。返回 None 后这种写法立刻抛 TypeError（位置准）。
# 读处统一 ``or {}``。
event_context: ContextVar[dict[str, Any] | None] = ContextVar("global_log_context", default=None)

# 去重签名要剔除的「每次不同」字段：requestId / durationMs 逐请求变化，留着会让同一处
# 刷屏永远算「不重复」，5 秒折叠失效（另一处写入放大来源）。
_VOLATILE_CONTEXT_KEYS = frozenset({"requestId", "durationMs"})

# 允许进入日志的上下文键白名单：名单外的键一律丢弃，防止某处误把整个请求体或实体属性
# 塞进 context 而泄露敏感内容。
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
# Bearer、带账号密码的 URL、邮箱、JWT。带捕获组的规则只替换第 1 组之后的内容，
# 保留字段名（如 ``password=``）便于排障时辨认。
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

    只用 stderr：此时日志系统本身已不可用。写失败静默忽略，告警不该反过来把进程搞崩。
    """
    try:
        sys.stderr.write(f"{_utc_now().isoformat()} {message}\n")
        sys.stderr.flush()
    except OSError:
        pass


def _safe_text(value: Any, *, limit: int) -> str:
    """把任意值转成可安全落盘的短文本。

    处理顺序：转字符串 → 去 NUL 字节（JSONL 里非法）→ 遮盖规则 → URL 查询串与 HLS 流
    地址整体打码 → 截断到 limit 个字符。
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

    键必须在 CONTEXT_KEYS 内；值只接受数字、布尔与字符串（嵌套结构丢弃，避免把整个文档
    塞进日志）；page / path 去掉查询串与锚点；userAgent 放宽到 384 字符，其余截断到 256。
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

    审计 B62：原先每个 ``>= 400`` 的 ``/api/`` 响应都写一条日志、说明里带完整请求路径，而
    4xx 的两大来源（目录扫描、接口探测）路径都由外部随手编 —— 「一次请求一行」把扫描量直接
    放大成磁盘写入量，日志文件 5 MB 上限被占满，真正的业务错误反被裁剪掉。

    合并按「形态」而非原路径：``/api/v1/hls/abc123`` 与 ``/api/v1/hls/def456`` 归成一个键，
    才不会被「每次编新 id」绕开。键上限 64 —— 键本身也是外部可控输入，不封顶就是另一条内存
    放大路径；键满后统一进「其他形态」。

    窗口内首次出现立刻写一条（运维要马上看见），之后只累加，窗口滚动时补写最终次数。
    窗口 300 秒，最坏写入量是「64 个形态 + 1 条其他」/ 5 分钟，与请求量无关。

    刻意不识别已登录请求：中间件跑在路由之前拿不到身份，靠 Cookie 判断等于让外部自己声明。
    代价是业务侧 4xx 也只剩计数与形态，需要逐请求排查时请调低中间件日志级别。
    """

    #: 同一形态多久滚动一次窗口（秒）。
    WINDOW_SECONDS = 300
    #: 记忆的形态数上限；超出后统一记进 `_OVERFLOW_KEY`。
    MAX_KEYS = 64
    #: 路径参与归并的段数上限（更深的段一律丢弃）。
    MAX_SEGMENTS = 5
    #: 段内被视作「标识符」的段：整段由 8 位以上十六进制（uuid / 哈希 / 长数字）或纯数字组成。
    #: 必须整段匹配：否则 ``/api/v1/v2/things`` 的版本号段会被误折叠成 ``v{id}``。
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
                # 形态表已满：新形态一律并进「其他形态」，标签随之泛化，免得把「其他」的累计次数记到
                # 某个具体路径名下。
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

    线程安全（内部 RLock）：日志可能从请求线程、后台写线程与启动流程同时写入；请求线程只
    入队，磁盘 I/O 全部由 _writer_loop 单线程完成。
    """

    # 后台写线程的节奏：最多每 0.5 秒把队列里的写入合并成一次追加；被唤醒后再多等
    # LINGER_SECONDS，把这一瞬间涌进来的写入攒成一批。
    FLUSH_INTERVAL_SECONDS = 0.5
    LINGER_SECONDS = 0.02
    # 裁剪的最小间隔（文件超限时）与常规间隔（未超限时）。两个都远大于请求间隔：裁剪是
    # 全量重写，绝不能挂在写入路径上。
    PRUNE_MIN_INTERVAL_SECONDS = 10
    PRUNE_INTERVAL_SECONDS = 300
    # 折叠窗口：同一签名在此窗口内重复出现会被折叠成一条；同时也是「同一签名最多多久写
    # 一行」的间隔（见 append 与 _expire_recent_locked）。
    FOLD_WINDOW_SECONDS = 5
    FOLD_WRITE_INTERVAL_SECONDS = 5
    # 去重表与「上次入队时间」表的硬上限，防止海量不同签名把内存撑大。
    MAX_TRACKED_SIGNATURES = 1000
    MAX_TRACKED_IDS = 1000

    def __init__(
        self, data_dir: Path, *, retention_days: int = 7, max_bytes: int = 5242880
    ) -> None:
        """初始化存储目录与内存状态。retention_days 至少 1 天，max_bytes 至少 64 KiB。"""
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
        # 落盘频率压到窗口级别。
        self._last_queued_at = {}
        # 待写入队列（同时也是磁盘不可用时的兜底缓存），超过 200 条丢弃最旧的。
        self._pending = deque(maxlen=200)
        self._write_failures = 0
        self._dropped_events = 0
        self._last_error = None
        self._last_warning_at = None
        self._tail_checked = False
        # 文件解析结果的缓存：(mtime_ns, size, 重写代数) → 事件列表（最旧在前）。日志接口一次
        # 请求要「筛选后的 + 未筛选的」两份列表，不缓存会把同一个文件整份解析两三遍（B13）。
        # 重写代数由 _write_events 递增，因此 mtime 精度只到秒级的文件系统也不会读到过期内容。
        self._file_cache: tuple[tuple[int, int, int], list[dict[str, Any]]] | None = None
        self._file_revision = 0
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

    def _writer_loop(self) -> None:
        """后台写线程主体：批量刷盘 + 节流裁剪，直到 stop() 被调用。

        合并同一次唤醒期间的所有写入：外部请求再多，一次唤醒也只做一次 open/append，以及
        （最多）一次裁剪。
        """
        while True:
            self._wake.wait(self.FLUSH_INTERVAL_SECONDS)
            self._wake.clear()
            try:
                # 被唤醒后先攒一小会儿：突发写入（例如一次 401 刷屏）会在这段时间里合并成一批，
                # 而不是每次 append 都触发一次 open/write/close。
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
            except Exception as error:  # noqa: BLE001 —— 写线程绝不能因异常静默死掉
                try:
                    with self._lock:
                        self._io_failure(error)
                except Exception:  # noqa: BLE001 —— 连告警都失败时只能放弃这一轮
                    pass

    def _expire_recent_locked(self) -> None:
        """折叠窗口结束时收尾：把需要落盘的最终计数补写一次。调用方必须已持锁。

        折叠期间同一签名不再逐条落盘，文件里那条的 repeatCount 会偏小；窗口一结束就把最终
        快照推回待写队列，读接口按 id 去重后拿到的就是准确计数。只补写过「被折叠过」的事件。
        """
        cutoff = _utc_now() - timedelta(seconds=self.FOLD_WINDOW_SECONDS)
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
            # 在队列满时挤掉另一条真实事件（B45）。
            self._queue_event_locked(event)
            self._last_queued_at[event["id"]] = _utc_now()

    def _queue_event_locked(self, event: dict[str, Any]) -> None:
        """把一条事件放进待写队列；同 id 已在队列里就**原地替换**。调用方必须已持锁。

        不能一律 append（B45）：折叠快照与队列里那条是**同一个 id**，追加只会让队列多一份同 id
        的旧快照。刷盘按 id 去重取最新，多出来的那份不会写进文件，却会占掉一格 —— 队列已满时它
        把最旧的一条**别的**事件挤掉（永久丢失，而且 `_dropped_events` 还把它记成「本条被丢」，
        与事实相反）。替换则既不丢别人，磁盘上的 repeatCount 也是最终值。
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

        timeout 内没等到写线程退出也会补刷一次，避免丢事件。
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

        单次 open + 顺序写入，不 seek、不重写：追加成本与文件大小无关。
        """
        if self._pending:
            # 同一 id 在一次刷盘里只写一条（取最新快照）：折叠期间 id 不变，队列里会堆着同一条
            # 事件的多个版本，逐条写等于按请求量放大文件行数。
            batch = {}
            for pending in self._pending:
                batch[pending["id"]] = pending
            try:
                self._prepare_directory()
                separate_partial_line = False
                # 首次写入前检查文件末尾是不是换行：进程被强杀时可能留下半行 JSON，不补换行会让新事件
                # 和残行粘成一条非法记录。
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
                # 写失败：事件留在 _pending 里等下次补写，本轮不再裁剪。
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

        事件本身已经进了 _pending，所以磁盘恢复后会自动补写；这里只负责计数与告警，不抛异常。
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

    def prune_now(self) -> None:
        """立刻按保留天数与文件上限裁剪一次（跳过节流），只给排障 / 运维用。

        会加锁，因此不会和后台写线程撞在一起。常规路径不要调它 —— 裁剪是全量重写。
        """
        with self._lock:
            self._last_pruned_at = None
            self._prune_if_needed()

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

        级别非 info/error/success/warning 时归一为 info；context 与请求级 event_context 合并后
        过滤遮盖；details 截断到 8000 字符。若与 5 秒内的同签名事件重复，返回被折叠后的那条
        （沿用原 id 与首次时间戳）。
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
        metadata = safe_context({**(event_context.get() or {}), **(context or {})})
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
            # 去重签名只取会影响可读性的字段，不含 id 与时间戳，这样同一处反复报错才会被识别成
            # 「重复」。requestId / durationMs 逐请求变化必须剔除，否则刷屏时每条都算「不重复」，
            # 折叠失效 → 日志写入量被请求量直接放大。
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
            now = _utc_now()
            recent = self._recent_events.get(signature)
            # FOLD_WINDOW_SECONDS 窗口内同签名事件折叠：保留首次的 id 与时间戳，叠加计数并记录最后
            # 一次发生时间，前端据此显示「重复 N 次」。窗口随每次命中向后滑动：只要还在持续刷屏，
            # 就始终是同一 id。
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
            # 兜底清理：正常情况下超窗的签名由写线程收尾（_expire_recent_locked），但海量不同签名
            # 涌进来时表不会自己缩小，因此超过上限就按最旧淘汰。
            while len(self._recent_events) > self.MAX_TRACKED_SIGNATURES:
                self._recent_events.pop(next(iter(self._recent_events)))
            # 折叠命中时不必每条都落盘：同一 id 在 FOLD_WRITE_INTERVAL_SECONDS 内最多写一行，否则
            # 文件行数会被请求量直接放大（JSONL 是 append-only，行数就是磁盘占用与后续裁剪的成本）。
            # 代价是窗口内那行的 repeatCount 会小于内存里的最终值 —— 窗口结束时写线程补写最终快照，
            # 读接口按 id 去重后看到的仍是准确计数。
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
                # 循环里的中间件，绝不能在这里等磁盘）。
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

        search 在来源、分类、说明、上下文与细节中做大小写不敏感的子串搜索；limit 为 None 时
        最多 2000 条、下限 1；offset 在筛选之后应用。events 可复用 :meth:`events_snapshot` 的结果 ——
        日志列表接口要同时给出「筛选后的」与「未筛选的（分类清单）」，不传就是两次全量解析（B13）。
        """
        search_key = _safe_text(search, limit=128).casefold() if search else ""
        if events is None:
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
                # offset 在筛选之后生效：先把命中的结果减掉，避免边筛边跳。
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

        给「一次请求要看好几遍日志」的接口用（见 :meth:`list_events` 的 events 参数）：
        调用方拿这一份快照自己筛选，文件只解析一次。
        """
        with self._lock:
            return self._read_events()

    def _file_events(self, *, strict: bool = False) -> list[dict[str, Any]]:
        """文件里的事件（按写入顺序，最旧在前），按 mtime/size/重写代数缓存。

        strict=True 时读写失败直接抛出（裁剪路径需要，避免误把读失败当成「没有事件」而清空
        日志）。返回的条目与缓存共享同一批对象，调用方不得原地修改。
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

        strict 语义同 :meth:`_read_events`。同一 id 以最后收集到的那条为准 —— 顺序是
        「文件 → 待写队列 → 折叠表」，越靠后的越新。
        """
        events = {}

        def collect(event: Any) -> None:
            """把一条事件并入结果表；缺时间戳的脏数据直接忽略。"""
            if not isinstance(event, dict) or not isinstance(
                event.get("timestamp"), str
            ):
                return
            event_id = str(event.get("id") or uuid4())
            # 先删再插：dict 保序，这样被更新的同 id 事件会移到末尾，结果顺序天然与「最后一次
            # 写入」一致。
            events.pop(event_id, None)
            events[event_id] = event

        for event in self._file_events(strict=strict):
            collect(event)

        # 磁盘上还没有的事件必须算进来：否则磁盘不可用期间，前端刷新日志会完全看不到刚刚
        # 发生的问题。
        for event in self._pending:
            collect(event)
        # 折叠表里的是最新快照（repeatCount 比已落盘那行更大，但按行数节流的原因还没写盘），
        # 放最后收集 —— 同 id 时它赢，前端看到的计数才是最新的。
        for _seen_at, event in self._recent_events.values():
            collect(event)
        return list(events.values())

    def _write_events(self, events: list[dict[str, Any]]) -> None:
        """全量重写日志文件（临时文件 + fsync + rename，保证原子性）。

        只用于 clear 与裁剪；追加写入走后台写线程的 _flush_locked 快路径。调用方必须持有 _lock：
        临时文件名是固定的，两个重写叠在一起会互相把对方的临时文件 rename 走（ENOENT + 丢事件）。
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
        # mtime 只到秒级，同秒内的两次重写会撞在一起。
        self._file_revision += 1
        self._file_cache = None

    def _prune_if_needed(self) -> None:
        """按保留天数与文件上限裁剪日志（只应由后台写线程调用）。

        裁剪是一次「读全量 + 全量重写 + fsync」，必须带最小间隔：文件超限时最密
        PRUNE_MIN_INTERVAL_SECONDS 一次，未超限时 PRUNE_INTERVAL_SECONDS 一次。绝不在每次写入
        时触发 —— 那等于让请求量直接放大成磁盘读写量。两次裁剪之间文件可能略高于 max_bytes，
        这是刻意的取舍。裁剪从最新往旧保留，累计字节超限即停止。

        日志文件还不存在时（进程起来后一条都没写过）不是故障，必须自己吞掉 FileNotFoundError：
        `_read_events(strict=True)` 会把它抛出来，而调用链上游是写线程的兜底 except，那会把
        「空日志」记成一次存储故障（healthy 变 false、stderr 每 30 秒告警一次），直到第一条事件
        落盘。顺手记下这次时间，免得每次唤醒（0.5 秒）都去读一个不存在的文件。
        """
        now = _utc_now()
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
            # 日志也不会被裁成空文件。
            if retained and retained_bytes + event_bytes > self.max_bytes:
                break
            retained.append(event)
            retained_bytes += event_bytes
        retained.reverse()
        self._write_events(retained)
        self._last_pruned_at = now
