"""系统运维域（``modules/system/ops`` 的 Python 等价实现）。

覆盖：
- 外部数据源聚合（天气预警 / 电价 / CalDAV 日历）：``ExternalApiService``；
- MoviePilot 透明代理：``MoviePilotProxyService``；
- 内嵌页反向代理：``EmbedProxyService``（见 ``services/system/embed_proxy.py``）。
"""

from __future__ import annotations

from .calendar_sync import CalendarSyncDeps, sync_calendar_from_url
from .external_api import WEATHER_ALERTS_CACHE_KEY, ExternalApiService
from .moviepilot_proxy import MoviePilotProxyService
from .upstream import UpstreamResponse, fetch_raw, open_stream
from .weather_alerts import fetch_open_weather_alerts_with_cache, parse_open_weather_alerts

__all__ = [
    "WEATHER_ALERTS_CACHE_KEY",
    "CalendarSyncDeps",
    "ExternalApiService",
    "MoviePilotProxyService",
    "UpstreamResponse",
    "fetch_open_weather_alerts_with_cache",
    "fetch_raw",
    "open_stream",
    "parse_open_weather_alerts",
    "sync_calendar_from_url",
]
