"""前端 Web Vitals / 错误 / 重连的匿名上报聚合（`/api/v1/logs/public-metrics`）。

浏览器端无法把 LCP / INP / CLS 这类指标写进后端直方图，因此由 RUM 采集器上报单条
样本，这里做进程内有界聚合，再由 `/metrics` 以 Prometheus 格式暴露。约束：

- 只保留白名单指标，页面标签截断并限制基数（<=64 个页面），避免匿名上报撑爆内存；
- 时间类指标用毫秒桶（50ms..25.6s），CLS 单独用 0.01..1 的桶；
- 错误 / WS 重连只做计数，不保留原始样本；
- 线程安全：上报来自请求线程池，抓取来自事件循环。
"""

from __future__ import annotations

import math
import threading
from collections import OrderedDict

#: 时间类指标（毫秒）：LCP/FCP/TTFB/INP/长任务。
TIME_VITAL_NAMES = frozenset({"lcp", "fcp", "ttfb", "inp", "longtask"})
#: 无单位指标：布局偏移。
CLS_NAME = "cls"
#: 只计数的指标：JS 错误、WS 重连。
COUNTER_NAMES = frozenset({"error", "ws_reconnect"})
#: 允许的指标全集。
CLIENT_METRIC_NAMES = TIME_VITAL_NAMES | COUNTER_NAMES | {CLS_NAME}

_TIME_BUCKETS: tuple[float, ...] = (
    50.0,
    100.0,
    200.0,
    400.0,
    800.0,
    1600.0,
    3200.0,
    6400.0,
    12800.0,
    25600.0,
)
_CLS_BUCKETS: tuple[float, ...] = (0.01, 0.05, 0.1, 0.15, 0.25, 0.5, 1.0)
_MAX_PAGES = 64


class _Histogram:
    __slots__ = ("buckets", "count", "counts", "sum_value")

    def __init__(self, buckets: tuple[float, ...]) -> None:
        self.buckets = buckets
        self.counts = [0] * len(buckets)
        self.sum_value = 0.0
        self.count = 0

    def observe(self, value: float) -> None:
        self.sum_value += value
        self.count += 1
        # Prometheus 直方图的桶是累计语义：每个 >= value 的桶都要 +1。
        for index, bound in enumerate(self.buckets):
            if value <= bound:
                self.counts[index] += 1


_lock = threading.Lock()
_histograms: OrderedDict[tuple[str, str], _Histogram] = OrderedDict()
_counters: OrderedDict[tuple[str, str], int] = OrderedDict()


def normalize_page(raw: str | None) -> str:
    """页面标签归一：去 query/hash，限制 64 字符，空值回退 `/`。"""
    page = (raw or "").split("?", 1)[0].split("#", 1)[0].strip()
    if not page:
        return "/"
    return page[:64]


def record_client_metric(name: str, page: str | None, value: float) -> bool:
    """记录一条样本；未知指标 / 非有限值返回 False（调用方据此 204 静默）。"""
    metric = (name or "").strip().lower()
    if metric not in CLIENT_METRIC_NAMES:
        return False
    if not math.isfinite(value) or value < 0:
        return False
    label = normalize_page(page)
    with _lock:
        if metric in COUNTER_NAMES:
            key = (metric, label)
            if key not in _counters and len(_counters) >= _MAX_PAGES * len(COUNTER_NAMES):
                return False
            _counters[key] = _counters.get(key, 0) + 1
            return True
        key = (metric, label)
        histogram = _histograms.get(key)
        if histogram is None:
            if len(_histograms) >= _MAX_PAGES * len(TIME_VITAL_NAMES | {CLS_NAME}):
                return False
            buckets = _CLS_BUCKETS if metric == CLS_NAME else _TIME_BUCKETS
            histogram = _Histogram(buckets)
            _histograms[key] = histogram
        histogram.observe(value)
        return True


def reset_client_metrics() -> None:
    """测试用：清空聚合器。"""
    with _lock:
        _histograms.clear()
        _counters.clear()


def _format_number(value: float) -> str:
    if float(value).is_integer():
        return str(int(value))
    return repr(float(value))


def client_metric_lines() -> list[str]:
    """渲染 `/metrics` 的前端指标块；没有样本时返回空列表。"""
    with _lock:
        histograms = [(key, item) for key, item in _histograms.items() if item.count]
        counters = list(_counters.items())
    if not histograms and not counters:
        return []
    lines = [
        "# HELP homeos_client_web_vitals_milliseconds Frontend time-based web vitals",
        "# TYPE homeos_client_web_vitals_milliseconds histogram",
    ]
    for (metric, page), histogram in histograms:
        if metric == CLS_NAME:
            continue
        for bound, count in zip(histogram.buckets, histogram.counts, strict=True):
            lines.append(
                f'homeos_client_web_vitals_milliseconds_bucket{{metric="{metric}",'
                f'page="{page}",le="{_format_number(bound)}"}} {count}'
            )
        lines.append(
            f'homeos_client_web_vitals_milliseconds_bucket{{metric="{metric}",'
            f'page="{page}",le="+Inf"}} {histogram.count}'
        )
        lines.append(
            f'homeos_client_web_vitals_milliseconds_sum{{metric="{metric}",'
            f'page="{page}"}} {_format_number(histogram.sum_value)}'
        )
        lines.append(
            f'homeos_client_web_vitals_milliseconds_count{{metric="{metric}",page="{page}"}} {histogram.count}'
        )
    cls_entries = [(page, histogram) for (metric, page), histogram in histograms if metric == CLS_NAME]
    if cls_entries:
        lines.extend(
            [
                "# HELP homeos_client_cls Cumulative layout shift",
                "# TYPE homeos_client_cls histogram",
            ]
        )
        for page, histogram in cls_entries:
            for bound, count in zip(histogram.buckets, histogram.counts, strict=True):
                lines.append(f'homeos_client_cls_bucket{{page="{page}",le="{_format_number(bound)}"}} {count}')
            lines.append(f'homeos_client_cls_bucket{{page="{page}",le="+Inf"}} {histogram.count}')
            lines.append(f'homeos_client_cls_sum{{page="{page}"}} {_format_number(histogram.sum_value)}')
            lines.append(f'homeos_client_cls_count{{page="{page}"}} {histogram.count}')
    error_total = sum(count for (metric, _page), count in counters if metric == "error")
    reconnect_total = sum(count for (metric, _page), count in counters if metric == "ws_reconnect")
    lines.extend(
        [
            "# HELP homeos_client_errors_total Frontend JS errors reported by RUM",
            "# TYPE homeos_client_errors_total counter",
            f"homeos_client_errors_total {error_total}",
            "# HELP homeos_client_ws_reconnects_total WebSocket reconnects reported by RUM",
            "# TYPE homeos_client_ws_reconnects_total counter",
            f"homeos_client_ws_reconnects_total {reconnect_total}",
        ]
    )
    return lines


__all__ = [
    "CLIENT_METRIC_NAMES",
    "client_metric_lines",
    "normalize_page",
    "record_client_metric",
    "reset_client_metrics",
]
