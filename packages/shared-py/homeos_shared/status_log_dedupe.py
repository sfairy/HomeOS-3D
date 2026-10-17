"""状态日志去重（对齐 Nest ``common/observability/status-log-dedupe.util.ts``）。

同一 ``级别 | 上下文 | 归一化消息`` 在活跃窗口内只输出一次，避免轮询 / 配置热重载 /
外部依赖抖动刷屏。

**为什么需要它（实测）**：给商店连打 110 次错误请求（80 次激活 + 30 次错误引导密钥），
日志新增 224 行，其中 80 行是**逐字相同**的告警（``授权请求解密失败 …`` 60 条、
``授权端点限流：来源 IP 触顶 …`` 20 条），有效信息只有 4 行 —— 约 50:1 的信噪比。
逐条打出来并不会让谁知道得更多：第一次已经说清是什么事了，第 60 次只说明它还在继续。

**折叠而不是静默丢弃**：抑制次数按**数量级**放行一次（第 10 / 100 / 1000 … 次），并在该行
尾部补一句 ``（同类已折叠 N 条）``。纯静默会带来一个真实的损失 —— 安全类告警（限流触顶、
解密失败）成规模时反而看不出规模；按数量级放行后，量级越大越看得见，而条数仍是 O(log N)。

规则细节：

- ``error`` / ``fatal`` 不走此逻辑（与 Nest 一致，恒放行）；
- 连接生命周期文案（正在连接 / 已连接 / 重连 / 切换外网…）始终放行，
  避免 HA / EEW 重连成功被吞；
- 抑制期间会刷新 ``seen_at``：相同状态仍在反复打印时，不会因 TTL 到期周期性漏出；
- 窗口到期后重新放行一次，并带上窗口内折叠了多少条；
- 窗口由环境变量选择（主应用 ``LOG_STATUS_DEDUPE_MS``、商店 ``STORE_LOG_STATUS_DEDUPE_MS``），
  ``0`` 可关闭；未设置时默认 30 分钟。

判定结果缓存在 ``LogRecord`` 上（见 :class:`StatusLogDedupeFilter`），因此**多个 handler
共享同一次判定**，不会各判一次（否则先判的 handler 会刷新窗口，后判的会误丢行）。

为什么在共享包里
----------------
两个后端的判定逐字相同，差别只有环境变量名。主应用此前单独有一份实现，商店侧**没有** ——
代价正是上面那组实测数字：同一条告警在商店按请求数刷屏。共享后两侧语义不会再分叉。
本模块不依赖 FastAPI、不读任何一方的配置，故可安全共享。
"""

from __future__ import annotations

import logging
import os
import re
import threading
import time
from typing import NamedTuple

#: 默认去重窗口：30 分钟
DEFAULT_DEDUPE_MS = 30 * 60 * 1000

#: 去重表容量上限
MAX_ENTRIES = 2_000

#: 抑制到这些次数时放行一次并注明折叠了多少条（数量级放行，见模块 docstring）
FOLD_REPORT_AT = (10, 100, 1_000, 10_000, 100_000)

#: 放行时补在行尾的说明
FOLD_NOTE = "（同类已折叠 {count} 条）"

#: 访问日志的日志器名：其详略由 ``http_access_log`` 单独决定，本模块一律放行
#: （见 :class:`StatusLogDedupeFilter` 的说明）
ACCESS_LOGGER = "uvicorn.access"

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

#: 记录级标记：需要补写的折叠说明（缓存位，保证多 handler 只补一次）
_FOLDED_ATTR = "_homeos_status_dedupe_folded"

#: key → [最近出现时刻(ms, monotonic), 窗口内已折叠条数]
_recent: dict[str, list[float]] = {}
_lock = threading.Lock()


class DedupeDecision(NamedTuple):
    """一条状态日志的判定结果：``emit`` 是否输出；``folded`` 窗口内已折叠条数（放行时补注）。"""

    emit: bool
    folded: int


def resolve_dedupe_ms(env_var: str) -> int:
    """解析去重窗口：``<env_var>``（毫秒），非法或未设置回退默认值。"""
    raw = os.getenv(env_var)
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


def dedupe_decision(
    level: str,
    context: str,
    message: str,
    env_var: str,
    *,
    normalize: bool = True,
) -> DedupeDecision:
    """判断一条状态日志该怎么处理：输出（可选带折叠注记）还是抑制。

    ``normalize=False`` 供调用方使用**自带头部归一化**的键（如访问日志的
    ``<来源> "GET /x" 404`` 归纳键）。必须能关掉：通用归一化会折叠小数，而来源 IP 正是小数形态 ——
    实测 ``127.0.0.1`` 与 ``10.0.0.7`` 都被折成 ``#.#``，两个不同客户端会被并成一条。
    """
    if level in ("error", "fatal"):
        return DedupeDecision(True, 0)

    ttl_ms = resolve_dedupe_ms(env_var)
    if ttl_ms <= 0:
        return DedupeDecision(True, 0)

    text = message or ""
    # 空 / 过短消息不去重
    if len(text) < 4:
        return DedupeDecision(True, 0)
    if _LIFECYCLE_RE.search(text):
        return DedupeDecision(True, 0)

    stabilized = stabilize_status_message(text) if normalize else text
    key = f"{level}|{context}|{stabilized}"
    now_ms = time.monotonic() * 1000.0
    with _lock:
        prev = _recent.get(key)
        if prev is not None and now_ms - prev[0] < ttl_ms:
            # 轮询期间持续刷新，避免 TTL 与轮询周期对齐时周期性漏出相同状态
            prev[0] = now_ms
            prev[1] += 1
            folded = int(prev[1])
            # 按数量级放行一次（见模块 docstring）：量级越大事越看得见，条数仍是 O(log N)
            return DedupeDecision(folded in FOLD_REPORT_AT, folded)
        prev_folded = int(prev[1]) if prev is not None else 0
        _recent[key] = [now_ms, 0.0]
        _prune(now_ms, ttl_ms)
        # 窗口到期后重新放行，并把上一窗口折叠掉多少条带出来
        return DedupeDecision(True, prev_folded)


def should_emit_status_log(level: str, context: str, message: str, env_var: str) -> bool:
    """判断一条状态日志是否应输出（忽略折叠注记；需要注记时用 :func:`dedupe_decision`）。"""
    return dedupe_decision(level, context, message, env_var).emit


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


def annotate_fold_note(record: logging.LogRecord, folded: int) -> None:
    """把「同类已折叠 N 条」补到记录的文案尾部（供访问日志这类自家判定复用）。

    直接改 ``record.msg`` / 清空 ``record.args``：记录已经在格式化前，改文案是让
    **所有** handler 看到同一份文本的唯一办法。调用方负责只调用一次（日志器级过滤器天然只跑一次）。
    """
    if folded <= 0:
        return
    try:
        message = record.getMessage()
    except Exception:
        return
    record.msg = f"{message}{FOLD_NOTE.format(count=folded)}"
    record.args = ()


class StatusLogDedupeFilter(logging.Filter):
    """把去重判定结果缓存到 ``LogRecord`` 上，保证多 handler 只判定一次。

    若直接在每个 handler 上独立判定，先判定的 handler 会刷新 ``seen_at``，
    后判定的 handler 就会把同一条记录误判为重复并丢弃（运行日志缓冲将丢行）。

    ``env_var`` 由调用方给（主应用 ``LOG_STATUS_DEDUPE_MS``、商店 ``STORE_LOG_STATUS_DEDUPE_MS``）：
    共享模块不替任何一方决定读哪个变量名。

    两类记录**一律放行**（各自有更明确的策略，本过滤器不该插手）：

    - ``ACCESS_LOGGER``（``uvicorn.access``）：访问日志的详略由 ``http_access_log`` 决定。
      实测漏掉这条的后果是 ``LOG_HTTP_ACCESS=all`` 也只剩 3 行 —— 浏览器 keep-alive 下
      「同一条连接 = 同一个客户端端口」，30 次请求的归纳键相同，于是被这里折成一行，
      而 ``all`` 的契约是「恢复 uvicorn 原样、逐条可见」（排障时要能逐条核对重试节奏）。
    - ``never_fold_prefixes``：调用方点名的日志树（商店侧是支付与巡检：每一条都对应一笔
      真实资金动作，条数本身就是信息，不能折）。
    """

    def __init__(
        self,
        env_var: str,
        name: str = "homeos-status-dedupe",
        never_fold_prefixes: tuple[str, ...] = (),
    ) -> None:
        super().__init__(name)
        self._env_var = env_var
        self._never_fold_prefixes = never_fold_prefixes

    def _passes_through(self, record: logging.LogRecord) -> bool:
        if record.name == ACCESS_LOGGER:
            return True
        return any(record.name.startswith(prefix) for prefix in self._never_fold_prefixes)

    def filter(self, record: logging.LogRecord) -> bool:
        if self._passes_through(record):
            return True
        decided = getattr(record, _DECIDED_ATTR, None)
        if decided is None:
            try:
                message = record.getMessage()
            except Exception:
                message = str(record.msg)
            decision = dedupe_decision(
                _LEVELNAME_TO_NEST.get(record.levelname, "log"),
                record.name,
                message,
                self._env_var,
            )
            decided = decision.emit
            setattr(record, _DECIDED_ATTR, decided)
            if decided and decision.folded > 0:
                setattr(record, _FOLDED_ATTR, decision.folded)
        if decided:
            self._annotate_folded(record)
        return bool(decided)

    @staticmethod
    def _annotate_folded(record: logging.LogRecord) -> None:
        """把「折叠了多少条」补到消息尾部（幂等：注记取走即清，多 handler 只补一次）。"""
        folded = getattr(record, _FOLDED_ATTR, 0)
        if not folded:
            return
        setattr(record, _FOLDED_ATTR, 0)
        annotate_fold_note(record, int(folded))


__all__ = [
    "ACCESS_LOGGER",
    "DEFAULT_DEDUPE_MS",
    "FOLD_NOTE",
    "FOLD_REPORT_AT",
    "MAX_ENTRIES",
    "DedupeDecision",
    "StatusLogDedupeFilter",
    "annotate_fold_note",
    "dedupe_decision",
    "reset_status_dedupe",
    "resolve_dedupe_ms",
    "should_emit_status_log",
    "stabilize_status_message",
    "suppressed_count",
]
