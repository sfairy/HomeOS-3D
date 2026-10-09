"""天气预警解析与缓存（对齐 ``external-weather-alerts.helper.ts``）。

- 预警类型中英文映射（OpenWeather event 关键词 → 中文）；
- tags → 级别映射（red/extreme → red，orange/severe → orange，其余 yellow）；
- ``fetch_open_weather_alerts_with_cache``：Redis 缓存 → 内存缓存 → 实际请求的三级策略。
"""

from __future__ import annotations

import json
import logging
import re
import time
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime
from typing import Any

logger = logging.getLogger("homeos.system.ops.weather")

#: OpenWeather / 通用预警类型 → 中英文映射（key 为小写英文关键词，用于 includes 匹配）
WEATHER_ALERT_TYPE_MAP: dict[str, dict[str, str]] = {
    "rain": {"zh": "暴雨", "en": "Rain"},
    "thunderstorm": {"zh": "雷暴", "en": "Thunderstorm"},
    "wind": {"zh": "大风", "en": "Wind"},
    "snow": {"zh": "暴雪", "en": "Snow"},
    "fog": {"zh": "大雾", "en": "Fog"},
    "heat": {"zh": "高温", "en": "Heat"},
    "cold": {"zh": "寒潮", "en": "Cold"},
    "tornado": {"zh": "龙卷风", "en": "Tornado"},
    "flood": {"zh": "洪水", "en": "Flood"},
    "hurricane": {"zh": "台风", "en": "Hurricane"},
    "typhoon": {"zh": "台风", "en": "Typhoon"},
}


def _iso_from_epoch_seconds(seconds: float) -> str:
    moment = datetime.fromtimestamp(seconds, tz=UTC)
    return moment.isoformat(timespec="milliseconds").replace("+00:00", "Z")


def map_weather_alert_type(raw: str) -> dict[str, str]:
    """原始事件名 → 中英文类型（转小写去非字母后 includes 匹配）。"""

    key = re.sub(r"[^a-z]", "", str(raw or "").lower())
    for name, mapped in WEATHER_ALERT_TYPE_MAP.items():
        if name in key:
            return dict(mapped)
    return {"zh": raw or "未知", "en": raw or "Unknown"}


def map_open_weather_alert_level(tags: list[str]) -> str:
    """tags → 级别：red/extreme → red；orange/severe → orange；其余 yellow。"""
    text = " ".join(str(tag) for tag in tags).lower()
    if "red" in text or "extreme" in text:
        return "red"
    if "orange" in text or "severe" in text:
        return "orange"
    return "yellow"


def parse_open_weather_alerts(payload: dict[str, Any]) -> list[dict[str, Any]]:
    """解析 OpenWeather OneCall ``alerts`` 字段。"""
    alerts = payload.get("alerts")
    if not isinstance(alerts, list):
        return []
    out: list[dict[str, Any]] = []
    for raw in alerts:
        item = raw if isinstance(raw, dict) else {}
        mapped = map_weather_alert_type(str(item.get("event") or ""))
        tags = [str(tag) for tag in item.get("tags")] if isinstance(item.get("tags"), list) else []
        start = item.get("start") if isinstance(item.get("start"), (int, float)) else 0
        end = item.get("end") if isinstance(item.get("end"), (int, float)) else 0
        out.append(
            {
                "level": map_open_weather_alert_level(tags),
                "type": mapped["zh"],
                "typeEn": mapped["en"],
                "title": mapped["zh"] or str(item.get("event") or "天气预警"),
                "description": str(item.get("description") or ""),
                "effectiveFrom": _iso_from_epoch_seconds(float(start)),
                "effectiveTo": _iso_from_epoch_seconds(float(end)),
                "source": "OpenWeatherMap",
            }
        )
    return out


async def fetch_open_weather_alerts_with_cache(
    lat: float,
    lon: float,
    api_key: str,
    *,
    cache_key: str,
    cache_get: Callable[[str], Awaitable[Any]],
    cache_set: Callable[[str, str, int], Awaitable[Any]],
    fetch_one_call: Callable[[float, float, str], Awaitable[dict[str, Any]]],
    get_cached_alerts: Callable[[], list[dict[str, Any]]],
    set_cached_alerts: Callable[[list[dict[str, Any]]], None],
    get_last_alert_check: Callable[[], float],
    set_last_alert_check: Callable[[float], None],
    alert_refresh_ms: Callable[[], float],
    weather_alerts_ttl_sec: Callable[[], int],
    on_cache_read_error: Callable[[Any], None] | None = None,
    on_fetch_error: Callable[[Any], None] | None = None,
) -> dict[str, Any]:
    """带缓存的预警拉取（未配置 / 命中缓存 / 内存降级 / 实际请求 / 失败降级）。"""
    if not api_key:
        return {
            "alerts": [],
            "configured": False,
            "message": "未配置 OpenWeather API Key（高级参数 → external）",
        }

    # 步骤 2：尝试 Redis 缓存
    try:
        cached = await cache_get(cache_key)
        if cached:
            text = cached.decode("utf-8") if isinstance(cached, (bytes, bytearray)) else str(cached)
            parsed = json.loads(text)
            alerts = parsed.get("alerts") or []
            set_cached_alerts(alerts)
            set_last_alert_check(parsed.get("fetchedAt") or time.time() * 1000)
            return {"alerts": alerts, "configured": True, "cached": True}
    except Exception as err:
        if on_cache_read_error is not None:
            on_cache_read_error(err)

    # 步骤 3：Redis 未命中 + 距上次拉取不足间隔 + 内存有缓存 → 用内存缓存
    now = time.time() * 1000
    cached_alerts = get_cached_alerts()
    if now - get_last_alert_check() < alert_refresh_ms() and cached_alerts:
        return {"alerts": cached_alerts, "configured": True}

    # 步骤 4：实际请求 API
    try:
        payload = await fetch_one_call(lat, lon, api_key)
        alerts = parse_open_weather_alerts(payload)
        set_cached_alerts(alerts)
        set_last_alert_check(now)
        await cache_set(
            cache_key,
            json.dumps({"alerts": alerts, "fetchedAt": now}, ensure_ascii=False),
            weather_alerts_ttl_sec(),
        )
        return {"alerts": alerts, "configured": True}
    except Exception as err:
        if on_fetch_error is not None:
            on_fetch_error(err)
        return {"alerts": get_cached_alerts(), "configured": True}


__all__ = [
    "WEATHER_ALERT_TYPE_MAP",
    "fetch_open_weather_alerts_with_cache",
    "map_open_weather_alert_level",
    "map_weather_alert_type",
    "parse_open_weather_alerts",
]
