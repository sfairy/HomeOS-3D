"""可观测性：请求级 traceId、结构化日志、Prometheus 指标与访问判定。

等价移植 Nest 侧：
- ``observability/trace-context.ts``（contextvars 版）；
- ``observability/prometheus-metrics.util.ts`` + ``ha-sync-latency.util``（指标文本）；
- ``common/http-security/metrics-access.util.ts``（/metrics 访问判定）。
"""

from __future__ import annotations

import asyncio
import contextvars
import hashlib
import hmac
import math
import os
import threading
from collections import deque
from dataclasses import dataclass
from typing import Any

# traceId（contextvars，等价 AsyncLocalStorage）
_trace_id: contextvars.ContextVar[str | None] = contextvars.ContextVar("trace_id", default=None)


def get_trace_id() -> str | None:
    return _trace_id.get()


def set_trace_id(value: str | None) -> contextvars.Token:
    return _trace_id.set(value)


def reset_trace_id(token: contextvars.Token) -> None:
    _trace_id.reset(token)


# 结构化日志（含 traceId）
_LEVEL_ORDER = {"debug": 10, "info": 20, "warn": 30, "error": 40}
_configured_level = os.getenv("LOG_LEVEL", "info").strip().lower()


def log(level: str, message: str, **context: Any) -> None:
    """输出单行结构化日志；traceId 自动附加。"""
    if _LEVEL_ORDER.get(level, 20) < _LEVEL_ORDER.get(_configured_level, 20):
        return
    trace_id = get_trace_id()
    parts = [f"[{level.upper()}]", message]
    if trace_id:
        parts.append(f"trace={trace_id}")
    for key, value in context.items():
        if value is not None:
            parts.append(f"{key}={value}")
    try:
        print(" ".join(parts), flush=True)
    except OSError:
        pass


# HA 同步延迟快照（供 /metrics）
@dataclass
class LatencySnapshot:
    stage: str
    p50: float
    p99: float
    max: float
    count: int


#: HA 同步管线全部阶段（顺序与 Nest ``ALL_STAGES`` 一致，计数为 0 也要出现在快照/指标中）。
ALL_HA_SYNC_STAGES: tuple[str, ...] = (
    "ha_receive",
    "ha_deferred_dwell",
    # 关键控制域单独一段：常规 50ms 合并窗对灯光/开关是纯延迟，这里只统计关键域，
    # 用来证明「点灯反馈」这条链路的停留时间（详见 live_events 的 critical 短窗口）。
    "ha_deferred_dwell_critical",
    "ingress_coalesce_dwell",
    "ingress_flush",
    "hot_apply",
    "full_sync",
    "ws_emit",
    "fe_critical_apply",
    "fe_sensor_apply",
    "fe_e2e_apply",
)
#: 前端上报阶段白名单（Socket ``ha_sync_fe_latency`` 只接受这三类）
FE_LATENCY_STAGES = frozenset({"fe_critical_apply", "fe_sensor_apply", "fe_e2e_apply"})


_latency_lock = threading.Lock()
_latency_samples: dict[str, list[float]] = {}
_ha_ws_deferred_dropped_total = 0


def record_ha_sync_latency(stage: str, milliseconds: float) -> None:
    with _latency_lock:
        bucket = _latency_samples.setdefault(stage, [])
        bucket.append(milliseconds)
        if len(bucket) > 512:
            del bucket[: len(bucket) - 512]


def get_ha_ws_deferred_dropped_total() -> int:
    with _latency_lock:
        return _ha_ws_deferred_dropped_total


#: 实时链路的计数指标（固定一份名单，无事件时也导出 0，便于建基线/告警）。
HA_COUNTER_NAMES: tuple[str, ...] = (
    "recv",
    "reconnect",
    "queue_dropped",
    "resync",
    "fast_reconnect",
    "subscribe_entities_fallback",
    "reconcile",
    "full_sync",
    "decode_resync",
    "shadow_compare",
    "shadow_mismatch",
)

_ha_counter_lock = threading.Lock()
_ha_counters: dict[str, int] = {}


def record_ha_counter(name: str, value: int = 1) -> None:
    """累加一个实时链路计数（丢弃 / 重连 / 重同步 / 快速重连 …）。"""
    with _ha_counter_lock:
        _ha_counters[name] = _ha_counters.get(name, 0) + int(value)


def get_ha_counters() -> dict[str, int]:
    with _ha_counter_lock:
        return dict(_ha_counters)


# 数据库查询计数（Phase 3 观测）：按语句首关键字分 select / write / other。
# SQLAlchemy 的 before_cursor_execute 在 DB 线程回调，锁只保护三个整数，开销可忽略。
_db_query_lock = threading.Lock()
_db_query_counts: dict[str, int] = {"select": 0, "write": 0, "other": 0}


def record_db_query(statement: str | None) -> None:
    keyword = ""
    if statement:
        stripped = statement.lstrip()
        keyword = stripped.split(None, 1)[0].upper() if stripped else ""
    if keyword in {"SELECT", "WITH", "EXPLAIN"}:
        kind = "select"
    elif keyword in {"INSERT", "UPDATE", "DELETE", "REPLACE"}:
        kind = "write"
    else:
        kind = "other"
    with _db_query_lock:
        _db_query_counts[kind] += 1


def get_db_query_counts() -> dict[str, int]:
    with _db_query_lock:
        return dict(_db_query_counts)


# HTTP 路由延迟直方图（Phase 4 观测）：按路由模板 / 方法 / 状态聚合，避免把路径参数
# 变成指标标签（基数会随项目、商品、实体 id 线性膨胀）。路由种类超过上限后统一归入
# __other__，代价是少量精度，换来 /metrics 文本大小可控。
HTTP_DURATION_BUCKETS: tuple[float, ...] = (
    0.005,
    0.01,
    0.025,
    0.05,
    0.1,
    0.25,
    0.5,
    1.0,
    2.5,
    5.0,
    10.0,
)
_HTTP_MAX_SERIES = 100
_http_lock = threading.Lock()
_http_series: dict[tuple[str, str, str], list[float]] = {}


def record_http_request(
    route: str, method: str, status_code: int, seconds: float
) -> None:
    """记录一次 HTTP 请求耗时；route 已是路由模板而不是原始 path。"""
    if seconds < 0:
        return
    method_value = (method or "GET").upper()
    status_value = str(int(status_code))
    key = (route or "__unmatched__", method_value, status_value)
    with _http_lock:
        series = _http_series.get(key)
        if series is None:
            if len(_http_series) >= _HTTP_MAX_SERIES:
                key = ("__other__", method_value, status_value)
                series = _http_series.get(key)
            if series is None:
                series = [0.0, 0.0] + [0.0] * len(HTTP_DURATION_BUCKETS)
                _http_series[key] = series
        series[0] += 1.0
        series[1] += seconds
        for index, boundary in enumerate(HTTP_DURATION_BUCKETS):
            if seconds <= boundary:
                series[index + 2] += 1.0


def get_http_metrics() -> dict[tuple[str, str, str], list[float]]:
    with _http_lock:
        return {key: list(value) for key, value in _http_series.items()}



# 事件循环延迟采样（Phase 3 观测）：每 interval 秒测一次实际唤醒相对计划时间的偏差。
@dataclass(frozen=True)
class LoopLagSnapshot:
    p50: float
    p99: float
    max: float
    count: int


class EventLoopLagMonitor:
    """采样事件循环调度延迟；只保留最近 window 个样本，供 /metrics 导出。"""

    def __init__(self, interval_seconds: float = 1.0, window: int = 120) -> None:
        self.interval_seconds = max(0.05, float(interval_seconds))
        self._samples: deque[float] = deque(maxlen=max(1, int(window)))
        self._lock = threading.Lock()
        self._task: asyncio.Task[None] | None = None

    async def start(self) -> None:
        if self._task is None or self._task.done():
            self._task = asyncio.create_task(self._run(), name="homeos-loop-lag")

    async def stop(self) -> None:
        task = self._task
        self._task = None
        if task is None:
            return
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass

    async def _run(self) -> None:
        loop = asyncio.get_running_loop()
        interval = self.interval_seconds
        expected = loop.time() + interval
        while True:
            await asyncio.sleep(max(0.0, expected - loop.time()))
            now = loop.time()
            lag_ms = max(0.0, (now - expected) * 1000.0)
            with self._lock:
                self._samples.append(lag_ms)
            expected += interval
            # 事件循环被长时间阻塞时不要补采样，直接跳到下一个周期，避免虚假尖峰。
            if expected < now:
                expected = now + interval

    def snapshot(self) -> LoopLagSnapshot:
        with self._lock:
            values = sorted(self._samples)
        if not values:
            return LoopLagSnapshot(p50=0.0, p99=0.0, max=0.0, count=0)
        return LoopLagSnapshot(
            p50=_round2(_percentile(values, 50)),
            p99=_round2(_percentile(values, 99)),
            max=_round2(values[-1]),
            count=len(values),
        )


def record_ha_sync_fe_latency_samples(samples: Any) -> int:
    """批量接收前端上报的 apply 样本（白名单阶段 + 上限 60s + 最多 64 条）。"""
    if not isinstance(samples, list) or not samples:
        return 0
    accepted = 0
    for sample in samples[:64]:
        if not isinstance(sample, dict):
            continue
        stage = sample.get("stage")
        raw_ms = sample.get("ms")
        if raw_ms is None:
            continue
        try:
            milliseconds = float(raw_ms)
        except (TypeError, ValueError):
            continue
        if stage not in FE_LATENCY_STAGES or not math.isfinite(milliseconds):
            continue
        if milliseconds < 0 or milliseconds > 60_000:
            continue
        record_ha_sync_latency(str(stage), milliseconds)
        accepted += 1
    return accepted


def _percentile(sorted_values: list[float], percentile_rank: float) -> float:
    """与 Nest ``percentile`` 同口径：``ceil(p/100*n)-1`` 索引；空数组返回 0。"""
    if not sorted_values:
        return 0.0
    index = min(
        len(sorted_values) - 1,
        max(0, math.ceil(percentile_rank / 100 * len(sorted_values)) - 1),
    )
    return sorted_values[index]


def _round2(value: float) -> float:
    return round(value * 100) / 100


def get_ha_sync_latency_snapshots() -> list[LatencySnapshot]:
    """导出各阶段延迟快照（固定 9 个阶段，无样本的阶段计数为 0）。"""
    with _latency_lock:
        samples = {stage: list(values) for stage, values in _latency_samples.items()}
    out: list[LatencySnapshot] = []
    for stage in ALL_HA_SYNC_STAGES:
        values = samples.get(stage) or []
        if not values:
            out.append(LatencySnapshot(stage=stage, p50=0.0, p99=0.0, max=0.0, count=0))
            continue
        ordered = sorted(values)
        out.append(
            LatencySnapshot(
                stage=stage,
                p50=_round2(_percentile(ordered, 50)),
                p99=_round2(_percentile(ordered, 99)),
                max=_round2(ordered[-1]),
                count=len(ordered),
            )
        )
    return out


# Prometheus 文本指标（指标名与 Nest 版逐字对齐）
def _process_metric_lines(
    *,
    ha_connected: bool,
    entity_count: int,
    socket_clients: int,
    uptime_seconds: int,
) -> list[str]:
    """进程态指标块：up / HA 连接 / 缓存实体量 / Socket 客户端 / 运行时长。"""
    ha = 1 if ha_connected else 0
    return [
        "# HELP homeos_up HomeOS process is up",
        "# TYPE homeos_up gauge",
        "homeos_up 1",
        "# HELP homeos_ha_connected Home Assistant WebSocket connected (1/0)",
        "# TYPE homeos_ha_connected gauge",
        f"homeos_ha_connected {ha}",
        "# HELP homeos_entity_count Cached HA entity count",
        "# TYPE homeos_entity_count gauge",
        f"homeos_entity_count {entity_count}",
        "# HELP homeos_socket_clients Connected Socket.IO clients",
        "# TYPE homeos_socket_clients gauge",
        f"homeos_socket_clients {socket_clients}",
        "# HELP homeos_uptime_seconds Process uptime in seconds",
        "# TYPE homeos_uptime_seconds gauge",
        f"homeos_uptime_seconds {uptime_seconds}",
    ]


def _startup_metric_lines(
    *,
    startup_duration_ms: float | None,
    boot_import_ms: float | None,
    startup_phases: list[tuple[str, float]],
) -> list[str]:
    """启动耗时指标块：总耗时 / 应用模块导入耗时 / 各顶层阶段耗时。"""
    return [
        "# HELP homeos_startup_duration_ms Time spent in application startup",
        "# TYPE homeos_startup_duration_ms gauge",
        f"homeos_startup_duration_ms {_metric_number(startup_duration_ms or 0.0)}",
        "# HELP homeos_boot_import_ms Time spent importing the ASGI application module",
        "# TYPE homeos_boot_import_ms gauge",
        f"homeos_boot_import_ms {_metric_number(boot_import_ms or 0.0)}",
        "# HELP homeos_startup_phase_duration_ms Time spent in each top-level startup phase",
        "# TYPE homeos_startup_phase_duration_ms gauge",
        *[
            f'homeos_startup_phase_duration_ms{{phase="{name}"}} {_metric_number(value)}'
            for name, value in startup_phases
        ],
    ]


def _runtime_metric_lines(
    *,
    deferred_dropped: int,
    lag: LoopLagSnapshot,
    queries: dict[str, int],
) -> list[str]:
    """运行期指标块：WS 过载丢弃 / 事件环延迟分位 / DB 语句计数。"""
    return [
        "# HELP homeos_ha_ws_deferred_dropped_total HA WS deferred ingress events dropped under overload",
        "# TYPE homeos_ha_ws_deferred_dropped_total counter",
        f"homeos_ha_ws_deferred_dropped_total {deferred_dropped}",
        "# HELP homeos_event_loop_lag_ms Event loop scheduling lag milliseconds",
        "# TYPE homeos_event_loop_lag_ms gauge",
        f'homeos_event_loop_lag_ms{{quantile="p50"}} {_metric_number(lag.p50)}',
        f'homeos_event_loop_lag_ms{{quantile="p99"}} {_metric_number(lag.p99)}',
        f'homeos_event_loop_lag_ms{{quantile="max"}} {_metric_number(lag.max)}',
        "# HELP homeos_event_loop_lag_samples Event loop lag sample count",
        "# TYPE homeos_event_loop_lag_samples gauge",
        f"homeos_event_loop_lag_samples {lag.count}",
        "# HELP homeos_db_queries_total Database statements executed since process start",
        "# TYPE homeos_db_queries_total counter",
        f'homeos_db_queries_total{{kind="select"}} {queries.get("select", 0)}',
        f'homeos_db_queries_total{{kind="write"}} {queries.get("write", 0)}',
        f'homeos_db_queries_total{{kind="other"}} {queries.get("other", 0)}',
    ]


def _base_metric_lines(
    *,
    ha_connected: bool,
    entity_count: int,
    socket_clients: int,
    uptime_seconds: int,
    startup_duration_ms: float | None,
    boot_import_ms: float | None,
    startup_phases: list[tuple[str, float]],
    deferred_dropped: int,
    lag: LoopLagSnapshot,
    queries: dict[str, int],
) -> list[str]:
    """进程级基础指标块（up / HA 连接 / 缓存量 / 启动耗时 / 环延迟 / DB 计数）。

    这些指标**没有**标签维度，顺序即输出顺序；`help`/`type` 行与 Nest 版逐字对齐，
    改动会破坏抓取端的同名 series，需同步改 `ops` 侧面板。
    三个子块的首尾相接就是最终顺序，因此拆分不改任何一行的相对位置。
    """
    return [
        *_process_metric_lines(
            ha_connected=ha_connected,
            entity_count=entity_count,
            socket_clients=socket_clients,
            uptime_seconds=uptime_seconds,
        ),
        *_startup_metric_lines(
            startup_duration_ms=startup_duration_ms,
            boot_import_ms=boot_import_ms,
            startup_phases=startup_phases,
        ),
        *_runtime_metric_lines(
            deferred_dropped=deferred_dropped,
            lag=lag,
            queries=queries,
        ),
    ]


def _ha_counter_metric_lines(counters: dict[str, int]) -> list[str]:
    """HA 实时管道计数器（事件名固定取自 `HA_COUNTER_NAMES`）。"""
    lines = [
        "# HELP homeos_ha_events_total HA realtime pipeline counters",
        "# TYPE homeos_ha_events_total counter",
    ]
    for name in HA_COUNTER_NAMES:
        lines.append(f'homeos_ha_events_total{{event="{name}"}} {int(counters.get(name, 0))}')
    return lines


def _ha_sync_latency_metric_lines(snapshots: list[LatencySnapshot]) -> list[str]:
    """HA 同步管道各阶段的分位延迟与样本数。"""
    lines = [
        "# HELP homeos_ha_sync_latency_ms HA sync pipeline stage latency milliseconds",
        "# TYPE homeos_ha_sync_latency_ms gauge",
        "# HELP homeos_ha_sync_latency_samples HA sync latency sample count",
        "# TYPE homeos_ha_sync_latency_samples gauge",
    ]
    for snap in snapshots:
        p50, p99, peak = _metric_number(snap.p50), _metric_number(snap.p99), _metric_number(snap.max)
        lines.append(f'homeos_ha_sync_latency_ms{{stage="{snap.stage}",quantile="p50"}} {p50}')
        lines.append(f'homeos_ha_sync_latency_ms{{stage="{snap.stage}",quantile="p99"}} {p99}')
        lines.append(f'homeos_ha_sync_latency_ms{{stage="{snap.stage}",quantile="max"}} {peak}')
        lines.append(f'homeos_ha_sync_latency_samples{{stage="{snap.stage}"}} {snap.count}')
    return lines


def _http_histogram_metric_lines(http: dict[tuple[str, str, str], list[float]]) -> list[str]:
    """HTTP 请求时长直方图（桶边界取自 `HTTP_DURATION_BUCKETS`，`+Inf` 桶单独补）。"""
    lines = [
        "# HELP homeos_http_request_duration_seconds HTTP request duration seconds",
        "# TYPE homeos_http_request_duration_seconds histogram",
    ]
    for (route, method, status), series in sorted(http.items()):
        count, total = series[0], series[1]
        for index, boundary in enumerate(HTTP_DURATION_BUCKETS):
            lines.append(
                f'homeos_http_request_duration_seconds_bucket{{route="{route}",method="{method}",status="{status}",le="{boundary:g}"}} {int(series[index + 2])}'
            )
        lines.append(
            f'homeos_http_request_duration_seconds_bucket{{route="{route}",method="{method}",status="{status}",le="+Inf"}} {int(count)}'
        )
        lines.append(
            f'homeos_http_request_duration_seconds_sum{{route="{route}",method="{method}",status="{status}"}} {_metric_number(total)}'
        )
        lines.append(
            f'homeos_http_request_duration_seconds_count{{route="{route}",method="{method}",status="{status}"}} {int(count)}'
        )
    return lines


@dataclass(frozen=True, slots=True)
class _MetricInputs:
    """一次渲染所需的运行期快照（可选入参为 `None` 时回落到进程全局值）。"""

    deferred: int
    lag: LoopLagSnapshot
    queries: dict[str, int]
    phases: list[tuple[str, float]]
    http: dict[tuple[str, str, str], list[float]]


def _resolve_metric_inputs(
    *,
    ha_ws_deferred_dropped_total: int | None,
    loop_lag: LoopLagSnapshot | None,
    db_query_counts: dict[str, int] | None,
    startup_phases: list[tuple[str, float]] | None,
    http_metrics: dict[tuple[str, str, str], list[float]] | None,
) -> _MetricInputs:
    """把「可选入参」解析成具体快照：显式传参优先，否则取进程全局值。

    显式传参只在测试与离线渲染时使用，线上请求一律走全局快照；`startup_phases`
    例外——它没有全局来源，缺省即空列表。
    """
    return _MetricInputs(
        deferred=(
            ha_ws_deferred_dropped_total
            if ha_ws_deferred_dropped_total is not None
            else get_ha_ws_deferred_dropped_total()
        ),
        lag=loop_lag or LoopLagSnapshot(p50=0.0, p99=0.0, max=0.0, count=0),
        queries=db_query_counts if db_query_counts is not None else get_db_query_counts(),
        phases=startup_phases if startup_phases is not None else [],
        http=http_metrics if http_metrics is not None else get_http_metrics(),
    )


def _render_metric_lines(
    *,
    inputs: _MetricInputs,
    ha_connected: bool,
    entity_count: int,
    socket_clients: int,
    uptime_seconds: int,
    startup_duration_ms: float | None,
    boot_import_ms: float | None,
    latency: list[LatencySnapshot] | None,
    ha_counters: dict[str, int] | None,
) -> list[str]:
    """按固定顺序拼出四块指标行：基础 → HA 计数 → HA 同步延迟 → HTTP 直方图。

    顺序不能调整：抓取端按 series 名比对，重排会让 diff 变成「全量抖动」。
    其中 HTTP 直方图是唯一可整块省略的一段（没有 HTTP 采样时不输出 HELP/TYPE）。
    """
    lines = _base_metric_lines(
        ha_connected=ha_connected,
        entity_count=entity_count,
        socket_clients=socket_clients,
        uptime_seconds=uptime_seconds,
        startup_duration_ms=startup_duration_ms,
        boot_import_ms=boot_import_ms,
        startup_phases=inputs.phases,
        deferred_dropped=inputs.deferred,
        lag=inputs.lag,
        queries=inputs.queries,
    )

    counters = ha_counters if ha_counters is not None else get_ha_counters()
    lines.extend(_ha_counter_metric_lines(counters))

    snapshots = latency if latency is not None else get_ha_sync_latency_snapshots()
    lines.extend(_ha_sync_latency_metric_lines(snapshots))

    if inputs.http:
        lines.extend(_http_histogram_metric_lines(inputs.http))
    return lines


def format_homeos_prometheus_metrics(
    *,
    ha_connected: bool,
    entity_count: int,
    socket_clients: int,
    uptime_seconds: int,
    latency: list[LatencySnapshot] | None = None,
    ha_ws_deferred_dropped_total: int | None = None,
    loop_lag: LoopLagSnapshot | None = None,
    db_query_counts: dict[str, int] | None = None,
    startup_duration_ms: float | None = None,
    startup_phases: list[tuple[str, float]] | None = None,
    boot_import_ms: float | None = None,
    http_metrics: dict[tuple[str, str, str], list[float]] | None = None,
    ha_counters: dict[str, int] | None = None,
) -> str:
    """渲染 `/metrics` 的 Prometheus 文本。

    所有可选入参为 `None` 时取进程全局快照（`get_*` 系列）；显式传参只在测试与
    离线渲染时使用。输出末尾固定多一个换行（`""` + `join`），抓取端依赖该结尾。
    """
    inputs = _resolve_metric_inputs(
        ha_ws_deferred_dropped_total=ha_ws_deferred_dropped_total,
        loop_lag=loop_lag,
        db_query_counts=db_query_counts,
        startup_phases=startup_phases,
        http_metrics=http_metrics,
    )
    lines = _render_metric_lines(
        inputs=inputs,
        ha_connected=ha_connected,
        entity_count=entity_count,
        socket_clients=socket_clients,
        uptime_seconds=uptime_seconds,
        startup_duration_ms=startup_duration_ms,
        boot_import_ms=boot_import_ms,
        latency=latency,
        ha_counters=ha_counters,
    )
    lines.append("")
    return "\n".join(lines)


def _metric_number(value: float) -> str:
    """指标数值文本：整数值去掉 ``.0``（对齐 JS 模板字符串数字格式）。"""
    if float(value).is_integer():
        return str(int(value))
    return repr(float(value))


# /metrics 访问判定
MetricsAccessDecision = str  # 'allow' | 'not_found' | 'unauthorized'


def is_loopback_remote_address(raw: str | None) -> bool:
    if not raw:
        return False
    ip = raw.removeprefix("::ffff:")
    return ip in {"127.0.0.1", "::1", "localhost"}


def decide_metrics_access(
    *,
    metrics_token: str | None,
    is_production: bool,
    remote_address: str | None,
    authorization_header: str | None,
    query_token: str | None,
) -> MetricsAccessDecision:
    token = (metrics_token or "").strip()
    if not token:
        if not is_production:
            return "allow"
        return "allow" if is_loopback_remote_address(remote_address) else "not_found"
    bearer = (
        authorization_header[7:]
        if authorization_header and authorization_header.startswith("Bearer ")
        else ""
    )
    provided = bearer or (query_token or "")
    # 常数时间比较：虽然 token 泄漏面很小，但这是认证判定，不能留下时序侧信道。
    return "allow" if hmac.compare_digest(provided, token) else "unauthorized"


# 请求 ID 生成
def new_request_id() -> str:
    return hashlib.sha256(os.urandom(16)).hexdigest()[:32]
