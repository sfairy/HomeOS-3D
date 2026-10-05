"""地震地理计算工具（对齐 ``@homeos/shared/earthquake/geo.util`` + ``eew-countdown-lead``）。

- Haversine 大圆距离；
- S 波到达倒计时；
- 本地烈度估算（含四川盆地软土放大修正）；
- EEW payload 的距离/倒计时/烈度精细化；
- 演练倒计时阈值归一化与演练事件判定。
"""

from __future__ import annotations

import math
from typing import Any

#: 地球平均半径（km）
EARTH_RADIUS_KM = 6371.0
#: S 波平均速度（km/s）
S_WAVE_SPEED_KM_S = 3.4
#: 四川盆地近似 bbox（软土放大有感烈度）
SICHUAN_BASIN = {"latMin": 28.0, "latMax": 33.0, "lonMin": 102.0, "lonMax": 108.0}

#: 模拟演练可选倒计时阈值（60s / 30s / 0=横波已到达）
EEW_COUNTDOWN_LEAD_OPTIONS = (60, 30, 0)


def haversine_distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Haversine 大圆距离（km）；浮点误差夹紧到 [0,1] 保证极值仍返回有限距离。"""
    d_lat = math.radians(lat2 - lat1)
    d_lon = math.radians(lon2 - lon1)
    a = (
        math.sin(d_lat / 2) * math.sin(d_lat / 2)
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(d_lon / 2)
        * math.sin(d_lon / 2)
    )
    clamped = min(1.0, max(0.0, a))
    c = 2 * math.atan2(math.sqrt(clamped), math.sqrt(1 - clamped))
    return EARTH_RADIUS_KM * c


def compute_s_wave_countdown(distance_km: float, origin_time_ms: float, now_ms: float) -> float:
    """横波到达倒计时（秒）；负值表示横波已到达。"""
    travel_time = distance_km / S_WAVE_SPEED_KM_S
    elapsed = (now_ms - origin_time_ms) / 1000
    return travel_time - elapsed


def is_in_sichuan_basin(lat: Any, lon: Any) -> bool:
    """坐标是否落在四川盆地近似范围内（非数返回 False）。"""
    try:
        lat_f, lon_f = float(lat), float(lon)
    except (TypeError, ValueError):
        return False
    if math.isnan(lat_f) or math.isnan(lon_f) or math.isinf(lat_f) or math.isinf(lon_f):
        return False
    return (
        SICHUAN_BASIN["latMin"] <= lat_f <= SICHUAN_BASIN["latMax"]
        and SICHUAN_BASIN["lonMin"] <= lon_f <= SICHUAN_BASIN["lonMax"]
    )


def _opt_coord(value: Any) -> float | None:
    if value is None:
        return None
    try:
        num = float(value)
    except (TypeError, ValueError):
        return None
    if math.isnan(num) or math.isinf(num):
        return None
    return num


def estimate_local_intensity(
    magnitude: float,
    distance_km: float,
    opts: dict[str, Any] | None = None,
) -> float:
    """估算本地烈度（保留 1 位小数，范围 [1.0, 12.0]）。

    家庭位于四川盆地时使用更缓的距离衰减，震中亦在盆地内时再略增幅。
    """
    opts = opts or {}
    home_lat = _opt_coord(opts.get("homeLat"))
    home_lon = _opt_coord(opts.get("homeLon"))
    home_in_basin = (
        home_lat is not None and home_lon is not None and is_in_sichuan_basin(home_lat, home_lon)
    )
    log_coef = 3.15 if home_in_basin else 3.49
    raw = 0.92 + 1.63 * magnitude - log_coef * math.log10(max(0.0, distance_km) + 6)
    if home_in_basin:
        epi_lat = _opt_coord(opts.get("epicenterLat"))
        epi_lon = _opt_coord(opts.get("epicenterLon"))
        epi_in_basin = (
            epi_lat is not None
            and epi_lon is not None
            and is_in_sichuan_basin(epi_lat, epi_lon)
        )
        raw += 0.5 if epi_in_basin else 0.3
    return max(1.0, min(12.0, round(raw * 10) / 10))


def refine_alert_countdown(
    payload: dict[str, Any],
    home_lat: float,
    home_lon: float,
    now_ms: float,
) -> dict[str, float]:
    """基于 EEW payload 与家庭坐标计算距离 / 倒计时 / 本地烈度（各保留 1 位小数）。"""
    distance = haversine_distance_km(
        home_lat, home_lon, float(payload["latitude"]), float(payload["longitude"])
    )
    countdown = compute_s_wave_countdown(distance, float(payload["originTime"]), now_ms)
    local_intensity = estimate_local_intensity(
        float(payload["magnitude"]),
        distance,
        {
            "homeLat": home_lat,
            "homeLon": home_lon,
            "epicenterLat": payload["latitude"],
            "epicenterLon": payload["longitude"],
        },
    )
    return {
        "distance": round(distance * 10) / 10,
        "countdown": round(countdown * 10) / 10,
        "localIntensity": local_intensity,
    }


def normalize_eew_countdown_lead(raw: Any) -> int:
    """规范化演练 lead 秒数；缺失/非法回退 60（0 表示横波已到达）。"""
    if raw is None or raw is False:
        return 60
    if isinstance(raw, str) and raw.strip() == "":
        return 60
    try:
        num = float(raw)
    except (TypeError, ValueError):
        return 60
    if num in EEW_COUNTDOWN_LEAD_OPTIONS:
        return int(num)
    return 60


def is_eew_simulation_event_id(event_id: Any) -> bool:
    """eventId 是否为模拟演练事件（前缀 ``test_``）。"""
    return str(event_id or "").strip().startswith("test_")


def is_valid_home_coordinate(lat: Any, lon: Any) -> bool:
    """校验家庭坐标是否合法（非空、有限数、经纬度范围内）。"""
    lat_f, lon_f = _opt_coord(lat), _opt_coord(lon)
    if lat_f is None or lon_f is None:
        return False
    return -90 <= lat_f <= 90 and -180 <= lon_f <= 180


__all__ = [
    "EEW_COUNTDOWN_LEAD_OPTIONS",
    "compute_s_wave_countdown",
    "estimate_local_intensity",
    "haversine_distance_km",
    "is_eew_simulation_event_id",
    "is_in_sichuan_basin",
    "is_valid_home_coordinate",
    "normalize_eew_countdown_lead",
    "refine_alert_countdown",
]
