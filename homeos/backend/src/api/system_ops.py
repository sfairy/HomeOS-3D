"""外部 API / 设备健康路由（``/api/v1/system/external/*``、``/system/device-health/*``）。

对齐 Nest ``SystemOpsController``：
- 天气预警 / 日历事件 / 分时电价 / 动态电价 / 设备健康摘要：admin | adult；
- 立即同步动态电价：仅 admin；
- 天气预警 API Key 经请求头 ``x-openweather-key`` 传递（避免落入访问日志）。
"""

from __future__ import annotations

import os
import re
from typing import Any

from fastapi import Depends, Header, Query, Request

from .router import NestRouter
from ..security.auth_context import require_roles

router = NestRouter(prefix="/system", tags=["system"])

_PREFIXED_FLOAT = re.compile(r"^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?")

def _js_parse_float(value: Any, fallback: float = 0.0) -> float:
    """对齐 JS ``parseFloat``：解析前缀数字，无法解析时返回 NaN。"""
    text = str(value or "").strip()
    match = _PREFIXED_FLOAT.match(text)
    if not match:
        return float("nan") if text else fallback
    try:
        return float(match.group(0))
    except ValueError:
        return float("nan")

def _number_or_zero(value: Any) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0

def _external_service(request: Request) -> Any:
    return request.app.state.external_api

@router.get("/external/weather-alerts")
async def get_weather_alerts(
    request: Request,
    lat: str | None = Query(default=None),
    lon: str | None = Query(default=None),
    x_openweather_key: str | None = Header(default=None, alias="x-openweather-key"),
    user: dict[str, Any] = Depends(require_roles("admin", "adult")),
):
    service = _external_service(request)
    external = service.external_cfg
    use_lat = _js_parse_float(lat) if lat else _number_or_zero(external.get("weatherLat"))
    use_lon = _js_parse_float(lon) if lon else _number_or_zero(external.get("weatherLon"))
    use_key = (
        x_openweather_key
        or external.get("openWeatherApiKey")
        or os.getenv("OPENWEATHER_API_KEY", "")
        or ""
    )
    return await service.fetch_open_weather_alerts(float(use_lat), float(use_lon), str(use_key))

@router.get("/external/calendar-events")
async def get_calendar_events(
    request: Request,
    user: dict[str, Any] = Depends(require_roles("admin", "adult")),
):
    """已同步的日历事件列表 + 当前是否外出 + 即将到来的外出事件。"""
    return _external_service(request).get_calendar_events()

@router.get("/external/electricity-price")
async def get_electricity_price(
    request: Request,
    user: dict[str, Any] = Depends(require_roles("admin", "adult")),
):
    """当前分时电价（峰谷平）。"""
    return _external_service(request).get_current_price()

@router.get("/external/dynamic-pricing")
async def get_dynamic_pricing(
    request: Request,
    user: dict[str, Any] = Depends(require_roles("admin", "adult")),
):
    """动态电价 API：今日时段表 + 当前时段（配置后可用）。"""
    return _external_service(request).get_dynamic_pricing()

@router.post("/external/dynamic-pricing/sync", status_code=201)
async def sync_dynamic_pricing(
    request: Request,
    user: dict[str, Any] = Depends(require_roles("admin")),
):
    """立即同步一次动态电价 API。"""
    return await _external_service(request).sync_dynamic_pricing()

@router.get("/device-health/summary")
async def get_device_health_summary(
    request: Request,
    user: dict[str, Any] = Depends(require_roles("admin", "adult")),
):
    """设备健康摘要（离线 + 固件更新）。"""
    return request.app.state.device_health.get_summary()
