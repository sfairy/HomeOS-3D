"""天气预警后台监听（对齐 ``weather/weather-watch.service.ts``）。

启动延迟后按配置间隔轮询 OpenWeather 预警（复用 ``ExternalApiService``）：

- Redis 已通知预警 key 去重（``homeos:weather:alert-notified-ids``，cap 200）；
- 新预警按等级阈值（默认 ≥ 橙色）经 ``NotificationService`` 推送；
- 广播 ``weather.alert`` 领域事件供天气联动服务消费。
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

logger = logging.getLogger("homeos.weather.watch")

#: 事件名（对齐 ``HOMEOS_EVENTS.WEATHER_ALERT``）
WEATHER_ALERT_EVENT = "weather.alert"

#: 启动延迟（对齐 ``BOOT_DELAY_MS``）
BOOT_DELAY_MS = 20_000
#: 已通知预警 key 集合
SEEN_KEY = "homeos:weather:alert-notified-ids"
SEEN_MAX = 200

#: 预警等级优先级
LEVEL_PRIORITY: dict[str, int] = {"yellow": 1, "orange": 2, "red": 3}
#: 预警等级 → 通知级别
ALERT_LEVEL_TO_NOTIFY: dict[str, str] = {"yellow": "info", "orange": "warn", "red": "danger"}


def alert_dedup_key(alert: dict[str, Any]) -> str:
    """预警去重键：级别 + 类型/标题 + 生效起始时间（去除空白，截断 120 字符）。"""
    import re

    base = f"{alert.get('level')}:{alert.get('type') or alert.get('title')}:{alert.get('effectiveFrom') or ''}"
    return re.sub(r"\s+", "", base)[:120]


class WeatherWatchService:
    """天气预警轮询监听服务。"""

    def __init__(
        self,
        *,
        external_api: Any,
        notification: Any,
        redis: Any,
        jobs: Any,
        app_config: Any,
        event_bus: Any,
    ) -> None:
        self._external_api = external_api
        self._notification = notification
        self._redis = redis
        self._jobs = jobs
        self._app_config = app_config
        self._event_bus = event_bus
        self._stop = False
        self._task: asyncio.Task[Any] | None = None
        #: Redis 不可用时的进程内去重回退：否则每轮轮询都会把同一条预警
        #: 重新推送并重复触发天气联动（空调/关窗等）。
        self._memory_seen: list[str] = []

    # ------------------------------------------------------------------ #
    # 生命周期
    # ------------------------------------------------------------------ #
    def _external_cfg(self) -> dict[str, Any]:
        value = self._app_config.get("external")
        return value if isinstance(value, dict) else {}

    def poll_ms(self) -> int:
        """轮询间隔（毫秒），下限 60s 防止误配置过频请求 OpenWeather。"""
        try:
            configured = int(self._external_cfg().get("weatherAlertRefreshMs") or 0)
        except (TypeError, ValueError):
            configured = 0
        return max(60_000, configured or 30 * 60_000)

    async def start(self) -> None:
        self._stop = False
        self._task = asyncio.create_task(self._loop())

    async def stop(self) -> None:
        self._stop = True
        if self._task is not None:
            self._task.cancel()
            try:
                await self._task
            except (asyncio.CancelledError, Exception):
                pass
            self._task = None

    async def _loop(self) -> None:
        # 启动延迟：避开应用启动高峰
        try:
            await asyncio.sleep(BOOT_DELAY_MS / 1000)
        except asyncio.CancelledError:
            return
        if self._stop:
            return
        await self._tick()
        while not self._stop:
            interval = self.poll_ms() / 1000
            try:
                await asyncio.sleep(interval)
            except asyncio.CancelledError:
                return
            if self._stop:
                return
            try:
                await self._jobs.run(
                    "weather-watch",
                    {"description": "天气预警轮询监听", "intervalMs": self.poll_ms()},
                    self._tick,
                )
            except Exception as exc:
                logger.debug("天气预警轮询任务调度失败: %s", exc)

    async def _tick(self) -> None:
        try:
            await self.check_new_alerts()
        except Exception as exc:
            logger.debug("天气预警轮询失败: %s", exc)

    # ------------------------------------------------------------------ #
    # 核心
    # ------------------------------------------------------------------ #
    async def check_new_alerts(self) -> None:
        """拉取 → 去重 → 阈值过滤 → 通知 + 广播 ``weather.alert``。"""
        cfg = self._external_cfg()
        if cfg.get("weatherAlertEnabled") is False:
            return
        lat = cfg.get("weatherLat")
        lon = cfg.get("weatherLon")
        api_key = cfg.get("openWeatherApiKey")
        if not lat or not lon or not api_key:
            return

        result = await self._external_api.fetch_open_weather_alerts(lat, lon, api_key)
        alerts = result.get("alerts") if isinstance(result, dict) else None
        alerts = alerts if isinstance(alerts, list) else []
        if not alerts:
            return

        seen = await self.load_seen_ids()
        threshold_priority = LEVEL_PRIORITY.get(
            str(cfg.get("weatherAlertNotifyLevel") or ""), LEVEL_PRIORITY["orange"]
        )

        new_keys: list[str] = []
        for alert in alerts:
            key = alert_dedup_key(alert)
            if key in seen:
                continue
            new_keys.append(key)

            priority = LEVEL_PRIORITY.get(str(alert.get("level") or ""), LEVEL_PRIORITY["yellow"])
            if priority < threshold_priority:
                continue

            description = alert.get("description")
            message = f"{alert.get('title')}{f'：{description}' if description else ''}"
            await self._notification.notify(
                ALERT_LEVEL_TO_NOTIFY.get(str(alert.get("level") or ""), "warn"),
                message,
                "weather-alert",
                key,
                {"channels": ["in_app", "socket"]},
            )
            if self._event_bus is not None:
                await self._event_bus.emit(
                    WEATHER_ALERT_EVENT, {"alert": alert, "level": alert.get("level")}
                )
            logger.info("天气预警推送:%s %s", alert.get("level"), alert.get("title"))

        if new_keys:
            await self.save_seen_ids([*seen, *new_keys])
            logger.info("天气预警监听:发现 %s 条新预警", len(new_keys))

    # ------------------------------------------------------------------ #
    # 去重集合
    # ------------------------------------------------------------------ #
    async def load_seen_ids(self) -> set[str]:
        if not self._redis.is_ready():
            return set(self._memory_seen)
        try:
            raw = await self._redis.get(SEEN_KEY)
            if not raw:
                return set(self._memory_seen)
            text = raw.decode("utf-8") if isinstance(raw, (bytes, bytearray)) else str(raw)
            parsed = json.loads(text)
            if not isinstance(parsed, list):
                return set(self._memory_seen)
            stored = {item for item in parsed if isinstance(item, str) and item.strip()}
        except Exception:
            return set(self._memory_seen)
        # 与进程内回退合并：Redis 曾不可用期间记录过的预警，恢复后不得重复推送
        return stored | set(self._memory_seen)

    async def save_seen_ids(self, ids: Any) -> None:
        unique: list[str] = []
        for item in ids or []:
            if item and item not in unique:
                unique.append(item)
        trimmed = unique[-SEEN_MAX:]
        # 无论 Redis 是否可用都维护进程内回退集合
        self._memory_seen = trimmed
        if not self._redis.is_ready():
            return
        try:
            await self._redis.set(SEEN_KEY, json.dumps(trimmed), 7 * 24 * 3600)
        except Exception as exc:
            logger.debug("天气预警已通知写入失败: %s", exc)


__all__ = [
    "ALERT_LEVEL_TO_NOTIFY",
    "BOOT_DELAY_MS",
    "LEVEL_PRIORITY",
    "SEEN_KEY",
    "SEEN_MAX",
    "WEATHER_ALERT_EVENT",
    "WeatherWatchService",
    "alert_dedup_key",
]
