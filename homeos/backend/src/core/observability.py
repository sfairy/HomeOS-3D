"""可观测性：请求级 traceId、结构化日志去重、Prometheus 指标与访问判定。

等价移植 Nest 侧：
- ``observability/trace-context.ts``（contextvars 版）；
- ``observability/status-log-dedupe.util.ts``（状态日志去重）；
- ``observability/prometheus-metrics.util.ts`` + ``ha-sync-latency.util``（指标文本）；
- ``common/http-security/metrics-access.util.ts``（/metrics 访问判定）。
"""

from __future__ import annotations

import contextvars
import hashlib
import math
import os
import threading
import time
from dataclasses import dataclass, field
from typing import Any

# --------------------------------------------------------------------------- #
# traceId（contextvars，等价 AsyncLocalStorage）
# --------------------------------------------------------------------------- #
_trace_id: contextvars.ContextVar[str | None] = contextvars.ContextVar("trace_id", default=None)


def get_trace_id() -> str | None:
    return _trace_id.get()


def set_trace_id(value: str | None) -> contextvars.Token:
    return _trace_id.set(value)


def reset_trace_id(token: contextvars.Token) -> None:
    _trace_id.reset(token)


# --------------------------------------------------------------------------- #
# 状态日志去重（同一「key + 状态」在窗口内只打印一次，避免 HA 断连刷屏）
# --------------------------------------------------------------------------- #
class StatusLogDeduper:
    """按 ``key`` 记忆上次日志状态与时间，抑制重复输出。"""

    def __init__(self, window_seconds: float = 30.0) -> None:
        self._window = window_seconds
        self._seen: dict[str, tuple[str, float]] = {}
        self._lock = threading.Lock()

    def should_log(self, key: str, status: str) -> bool:
        now = time.monotonic()
        with self._lock:
            previous = self._seen.get(key)
            if previous is not None and previous[0] == status and now - previous[1] < self._window:
                return False
            self._seen[key] = (status, now)
            return True

    def reset(self) -> None:
        with self._lock:
            self._seen.clear()


# --------------------------------------------------------------------------- #
# 结构化日志（含 traceId）
# --------------------------------------------------------------------------- #
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


# --------------------------------------------------------------------------- #
# HA 同步延迟快照（供 /metrics）
# --------------------------------------------------------------------------- #
@dataclass
class LatencySnapshot:
    stage: str
    p50: float
    p99: float
    max: float
    count: int


#: HA 同步管线全部阶段（顺序与 Nest ``ALL_STAGES`` 一致，计数为 0 也要出现在快照/指标中）。
ALL_HA_SYNC_STAGES: tuple[str, ...] = (
    "ha_deferred_dwell",
    "ha_receive",
    "ingress_coalesce_dwell",
    "ingress_flush",
    "hot_apply",
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


def record_ha_ws_deferred_dropped(count: int = 1) -> None:
    global _ha_ws_deferred_dropped_total
    with _latency_lock:
        _ha_ws_deferred_dropped_total += count


def get_ha_ws_deferred_dropped_total() -> int:
    with _latency_lock:
        return _ha_ws_deferred_dropped_total


def record_ha_sync_fe_latency_samples(samples: Any) -> int:
    """批量接收前端上报的 apply 样本（白名单阶段 + 上限 60s + 最多 64 条）。"""
    if not isinstance(samples, list) or not samples:
        return 0
    accepted = 0
    for sample in samples[:64]:
        if not isinstance(sample, dict):
            continue
        stage = sample.get("stage")
        try:
            milliseconds = float(sample.get("ms"))
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


# --------------------------------------------------------------------------- #
# Prometheus 文本指标（指标名与 Nest 版逐字对齐）
# --------------------------------------------------------------------------- #
def format_homeos_prometheus_metrics(
    *,
    ha_connected: bool,
    entity_count: int,
    socket_clients: int,
    uptime_seconds: int,
    latency: list[LatencySnapshot] | None = None,
    ha_ws_deferred_dropped_total: int | None = None,
) -> str:
    ha = 1 if ha_connected else 0
    deferred = (
        ha_ws_deferred_dropped_total
        if ha_ws_deferred_dropped_total is not None
        else get_ha_ws_deferred_dropped_total()
    )
    lines = [
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
        "# HELP homeos_ha_ws_deferred_dropped_total HA WS deferred ingress events dropped under overload",
        "# TYPE homeos_ha_ws_deferred_dropped_total counter",
        f"homeos_ha_ws_deferred_dropped_total {deferred}",
    ]

    snapshots = latency if latency is not None else get_ha_sync_latency_snapshots()
    lines.extend(
        [
            "# HELP homeos_ha_sync_latency_ms HA sync pipeline stage latency milliseconds",
            "# TYPE homeos_ha_sync_latency_ms gauge",
            "# HELP homeos_ha_sync_latency_samples HA sync latency sample count",
            "# TYPE homeos_ha_sync_latency_samples gauge",
        ]
    )
    for snap in snapshots:
        p50, p99, peak = _metric_number(snap.p50), _metric_number(snap.p99), _metric_number(snap.max)
        lines.append(f'homeos_ha_sync_latency_ms{{stage="{snap.stage}",quantile="p50"}} {p50}')
        lines.append(f'homeos_ha_sync_latency_ms{{stage="{snap.stage}",quantile="p99"}} {p99}')
        lines.append(f'homeos_ha_sync_latency_ms{{stage="{snap.stage}",quantile="max"}} {peak}')
        lines.append(f'homeos_ha_sync_latency_samples{{stage="{snap.stage}"}} {snap.count}')

    lines.append("")
    return "\n".join(lines)


def _metric_number(value: float) -> str:
    """指标数值文本：整数值去掉 ``.0``（对齐 JS 模板字符串数字格式）。"""
    if float(value).is_integer():
        return str(int(value))
    return repr(float(value))


# --------------------------------------------------------------------------- #
# /metrics 访问判定
# --------------------------------------------------------------------------- #
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
    return "allow" if provided == token else "unauthorized"


# --------------------------------------------------------------------------- #
# 请求 ID 生成
# --------------------------------------------------------------------------- #
def new_request_id() -> str:
    return hashlib.sha256(os.urandom(16)).hexdigest()[:32]


@dataclass
class LogContext:
    request_id: str
    method: str
    path: str
    extra: dict[str, Any] = field(default_factory=dict)
