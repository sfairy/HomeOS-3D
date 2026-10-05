"""天气域（``modules/weather`` 的 Python 等价实现）。

- ``WeatherWatchService``：OpenWeather 预警轮询 + Redis 去重 + 通知 + ``weather.alert`` 事件；
- ``WeatherAutoLinkageService``：极端天气安全联动（场景 + 家庭模式 + 冷却 + 安全审计）。
"""

from __future__ import annotations

from .linkage import WeatherAutoLinkageService
from .watch import WEATHER_ALERT_EVENT, WeatherWatchService, alert_dedup_key

__all__ = [
    "WEATHER_ALERT_EVENT",
    "WeatherAutoLinkageService",
    "WeatherWatchService",
    "alert_dedup_key",
]
