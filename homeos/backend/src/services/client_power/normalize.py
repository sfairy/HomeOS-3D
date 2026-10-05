"""客户端系统信息归一化工具（对齐 ``client-power/client-system-normalize.util.ts``）。"""

from __future__ import annotations

import math
from datetime import UTC, datetime
from typing import Any

#: 上报未携带 systemInfo 时使用的最小默认结构。
DEFAULT_SYSTEM_INFO: dict[str, Any] = {
    "hardware": {"cores": 0, "deviceMemory": None, "tier": "unknown", "tierReason": ""},
    "platform": {"userAgent": "", "platform": "", "language": "", "vendor": "", "mobile": False},
    "display": {
        "width": 0,
        "height": 0,
        "screenWidth": 0,
        "screenHeight": 0,
        "pixelRatio": 1,
        "colorScheme": "unknown",
        "phoneLike": False,
        "tabletLike": False,
    },
    "capabilities": {
        "touch": False,
        "standalone": False,
        "serviceWorker": False,
        "reducedMotion": False,
    },
    "network": None,
}


def _iso_now() -> str:
    now = datetime.now(UTC)
    return now.strftime("%Y-%m-%dT%H:%M:%S.") + f"{now.microsecond // 1000:03d}Z"


def normalize_level(level: Any) -> float | None:
    """归一化电量到 0–100 的两位小数百分比（契约单位为百分比，不做 <=1 启发式）。

    历史 ``<= 1`` 启发式会把整数 1% 误判为 100%，导致低电告警与充电联动失效。
    """
    if level is None or isinstance(level, bool):
        return None
    try:
        value = float(level)
    except (TypeError, ValueError):
        return None
    if math.isnan(value) or math.isinf(value):
        return None
    return max(0.0, min(100.0, round(value * 100) / 100))


def battery_from_dto(system_info: dict[str, Any] | None) -> dict[str, Any]:
    """提取并归一化电池信息；未携带 battery 时返回 ``supported=False`` 默认结构。"""
    raw = (system_info or {}).get("battery") if isinstance(system_info, dict) else None
    if not isinstance(raw, dict):
        return {
            "supported": False,
            "level": None,
            "charging": None,
            "chargingTime": None,
            "dischargingTime": None,
        }
    result = dict(raw)
    result["level"] = normalize_level(raw.get("level"))
    return result


def normalize_client_system_report(dto: dict[str, Any]) -> dict[str, Any]:
    """统一上报格式为 ``systemInfo`` + 扁平电量字段。"""
    system_info_raw = dto.get("systemInfo") if isinstance(dto, dict) else None
    battery = battery_from_dto(system_info_raw)
    if isinstance(system_info_raw, dict):
        system_info = {**DEFAULT_SYSTEM_INFO, **system_info_raw}
        system_info.setdefault("reportedAt", _iso_now())
    else:
        system_info = {**DEFAULT_SYSTEM_INFO, "reportedAt": _iso_now()}
    system_info["battery"] = battery
    return {
        "systemInfo": system_info,
        "level": battery["level"],
        "charging": battery.get("charging"),
        "chargingTime": battery.get("chargingTime"),
        "dischargingTime": battery.get("dischargingTime"),
        # 仅当 API 支持且 level 有效时才视为电量支持
        "batterySupported": bool(battery.get("supported")) and battery["level"] is not None,
    }


__all__ = [
    "DEFAULT_SYSTEM_INFO",
    "battery_from_dto",
    "normalize_client_system_report",
    "normalize_level",
]
