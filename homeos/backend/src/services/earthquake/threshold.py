"""地震阈值与用户偏好匹配工具（对齐 ``earthquake/threshold.util.ts``）。

判定事件是否达到本地关注阈值（震级 ∧ 距离 ∧ 预估本地烈度三项同时满足）。
"""

from __future__ import annotations

import math
from typing import Any

from .geo import estimate_local_intensity, haversine_distance_km


def _to_float(value: Any) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return float("nan")


def _fmt(value: float) -> str:
    """对齐 JS 数字转字符串语义（``Number.isFinite`` 判定 + 原样输出）。"""
    if not math.isfinite(value):
        return "?"
    return str(int(value)) if float(value).is_integer() else str(value)


def evaluate_local_quake_thresholds(
    input_data: dict[str, Any], cfg: dict[str, Any]
) -> dict[str, Any]:
    """判定事件是否达到本地关注阈值。

    返回 ``{pass, distanceKm, localIntensity, reason?}``。
    """
    mag = _to_float(input_data.get("magnitude"))
    distance_raw = input_data.get("distanceKm")
    distance_km: float
    if distance_raw is not None and math.isfinite(_to_float(distance_raw)):
        distance_km = _to_float(distance_raw)
    else:
        distance_km = haversine_distance_km(
            float(cfg["homeLat"]),
            float(cfg["homeLon"]),
            _to_float(input_data.get("latitude")),
            _to_float(input_data.get("longitude")),
        )

    local_intensity = estimate_local_intensity(
        mag,
        distance_km,
        {
            "homeLat": cfg["homeLat"],
            "homeLon": cfg["homeLon"],
            "epicenterLat": input_data.get("latitude"),
            "epicenterLon": input_data.get("longitude"),
        },
    )

    min_magnitude = _to_float(cfg["minMagnitude"])
    max_distance = _to_float(cfg["maxDistanceKm"])
    min_intensity = _to_float(cfg["minLocalIntensity"])

    if not math.isfinite(mag) or mag < min_magnitude:
        return {
            "pass": False,
            "distanceKm": distance_km,
            "localIntensity": local_intensity,
            "reason": f"震级 M{_fmt(mag) if math.isfinite(mag) else '?'} 低于下限 M{_fmt(min_magnitude)}",
        }
    if distance_km > max_distance:
        return {
            "pass": False,
            "distanceKm": distance_km,
            "localIntensity": local_intensity,
            "reason": f"距离 {distance_km:.1f}km 超过上限 {_fmt(max_distance)}km",
        }
    if local_intensity < min_intensity:
        return {
            "pass": False,
            "distanceKm": distance_km,
            "localIntensity": local_intensity,
            "reason": f"烈度 {_fmt(local_intensity)} 低于下限 {_fmt(min_intensity)}",
        }
    return {"pass": True, "distanceKm": distance_km, "localIntensity": local_intensity}


__all__ = ["evaluate_local_quake_thresholds"]
