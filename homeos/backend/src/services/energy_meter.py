"""能耗计量读数校验、归并与业务日/月键（对齐 energy/meter.util.ts + local-date.util.ts）。"""

from __future__ import annotations

import math
from datetime import datetime
from typing import Any
from zoneinfo import ZoneInfo

#: 家庭业务时区（与 ops.homeTimezone 默认一致），用于日切/月切。
BUSINESS_TIME_ZONE = "Asia/Shanghai"

_REJECT_DEVICE_CLASSES = {"power", "current", "voltage", "apparent_power"}
_REJECT_UNITS = {"w", "kw", "mw", "va", "kva", "a", "v"}


def _normalize_unit(unit: Any) -> str:
    return str(unit or "").lower().replace(" ", "")


def is_cumulative_energy_meter(attrs: dict[str, Any] | None) -> bool:
    """是否为可差分累计的电量实体（排除功率/电流/电压等瞬时量）。"""
    if not attrs:
        return False
    device_class = str(attrs.get("device_class") or "").lower()
    unit = _normalize_unit(attrs.get("unit_of_measurement"))
    if device_class in _REJECT_DEVICE_CLASSES:
        return False
    if unit in _REJECT_UNITS:
        return False
    if device_class == "energy":
        return True
    return unit in ("kwh", "wh", "mwh")


def reading_to_kwh(value: float, attrs: dict[str, Any] | None) -> float:
    unit = _normalize_unit((attrs or {}).get("unit_of_measurement"))
    if unit == "wh":
        return value / 1000
    if unit == "mwh":
        return value * 1000
    return value


def _extract_state(state: Any) -> str | None:
    if not isinstance(state, dict):
        return None
    value = state.get("state")
    if isinstance(value, str):
        return value
    return None if value is None else str(value)


def compute_meter_delta(old_state: Any, new_state: Any) -> float:
    """两次读数间的正向 kWh 增量。

    表底重置（新读数小于旧读数）按「重置后累积量」计入 ``new_kwh``，而不是丢弃整段 —— 
    否则每次清零都会漏掉一段真实用电。不可解析时返回 0。
    """
    old_raw = _extract_state(old_state)
    new_raw = _extract_state(new_state)
    if old_raw is None or new_raw is None:
        return 0.0
    try:
        old_val = float(old_raw)
        new_val = float(new_raw)
    except (TypeError, ValueError):
        return 0.0
    if math.isnan(old_val) or math.isnan(new_val):  # NaN
        return 0.0
    attrs = None
    if isinstance(new_state, dict) and isinstance(new_state.get("attributes"), dict):
        attrs = new_state["attributes"]
    elif isinstance(old_state, dict) and isinstance(old_state.get("attributes"), dict):
        attrs = old_state["attributes"]
    if attrs is not None and not is_cumulative_energy_meter(attrs):
        return 0.0
    old_kwh = reading_to_kwh(old_val, attrs)
    new_kwh = reading_to_kwh(new_val, attrs)
    if new_kwh >= old_kwh:
        return new_kwh - old_kwh
    # 负跳变 = 表底清零：把重置后的读数作为本段增量（不会为负，也不会整段丢弃）。
    return max(0.0, new_kwh)


def _resolve_business_timezone(timezone_name: str | None) -> ZoneInfo:
    normalized = str(timezone_name or "").strip()
    if normalized:
        try:
            return ZoneInfo(normalized)
        except Exception:
            pass
    return ZoneInfo(BUSINESS_TIME_ZONE)


def business_day_key(when: datetime, timezone_name: str | None = None) -> str:
    tz = _resolve_business_timezone(timezone_name)
    local = when.astimezone(tz) if when.tzinfo is not None else when.replace(tzinfo=ZoneInfo("UTC")).astimezone(tz)
    return local.strftime("%Y-%m-%d")


def business_month_key(when: datetime, timezone_name: str | None = None) -> str:
    return business_day_key(when, timezone_name)[:7]
