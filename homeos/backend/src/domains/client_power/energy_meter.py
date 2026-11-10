"""能耗计量读数校验、归并与业务日/月键（对齐 energy/meter.util.ts + local-date.util.ts）。

角色判定（电量 / 功率）与统计口径常量已下沉到 ``platform/core/energy/roles.py``：
``domains/app_config`` 的绑定校验也要用它们，而从 app_config 反向 import 本包会成环
（``check:backend-deps`` B4）。这里 re-export，保持既有 import 点不变。
"""

from __future__ import annotations

import math
from datetime import datetime
from typing import Any
from zoneinfo import ZoneInfo

from ...platform.core.energy.roles import (
    METER_SCOPES,
    SCOPE_DAY,
    SCOPE_MONTH,
    SCOPE_TOTAL,
    SCOPE_YEAR,
    classify_energy_entity,
    is_cumulative_energy_meter,
    normalize_unit,
)

#: 家庭业务时区（与 ops.homeTimezone 默认一致），用于日切/月切。
BUSINESS_TIME_ZONE = "Asia/Shanghai"

#: 兼容旧调用点：模块内原本的私有名现在指向平台实现
_normalize_unit = normalize_unit


def describe_energy_entity(attrs: dict[str, Any] | None) -> dict[str, Any]:
    """返回前端展示所需的最小实体类型描述（不泄漏整份 attributes）。"""
    resolved = attrs or {}
    return {
        "kind": classify_energy_entity(resolved),
        "deviceClass": str(resolved.get("device_class") or ""),
        "unit": str(resolved.get("unit_of_measurement") or ""),
    }


# ---- 统计口径（scope）----
#: 口径 → 该粒度能否「直接读表」（否则只能靠读数差分/求和）
_SCOPE_DIRECT_GRAINS: dict[str, tuple[str, ...]] = {
    SCOPE_TOTAL: (),
    SCOPE_YEAR: ("year",),
    SCOPE_MONTH: ("month",),
    SCOPE_DAY: ("day",),
}

#: 口径 → 清零说明（前端/向导展示用）
_SCOPE_RESET_LABELS: dict[str, str] = {
    SCOPE_TOTAL: "终身累计，不清零",
    SCOPE_YEAR: "每年 1 月 1 日清零",
    SCOPE_MONTH: "每月 1 日清零",
    SCOPE_DAY: "每日 0 点清零",
}

#: 实体名/entity_id 关键词 → 口径（仅作建议，用户可改；顺序即优先级）
_SCOPE_NAME_HINTS: tuple[tuple[str, str], ...] = (
    ("today", SCOPE_DAY),
    ("daily", SCOPE_DAY),
    ("today_energy", SCOPE_DAY),
    ("日", SCOPE_DAY),
    ("今日", SCOPE_DAY),
    ("当天", SCOPE_DAY),
    ("monthly", SCOPE_MONTH),
    ("month", SCOPE_MONTH),
    ("月", SCOPE_MONTH),
    ("本年", SCOPE_YEAR),
    ("yearly", SCOPE_YEAR),
    ("annual", SCOPE_YEAR),
    ("year", SCOPE_YEAR),
    ("年", SCOPE_YEAR),
    ("total", SCOPE_TOTAL),
    ("lifetime", SCOPE_TOTAL),
    ("累计", SCOPE_TOTAL),
)


def normalize_meter_scope(raw: Any) -> str:
    """把配置值收敛到合法口径，未知值回落到 ``total``（不清零最保守）。"""
    scope = str(raw or "").strip().lower()
    return scope if scope in METER_SCOPES else SCOPE_TOTAL


def suggest_meter_scope(*texts: Any) -> str:
    """从 entity_id / friendly_name 猜口径，供向导预填（猜错也能手动改）。"""
    haystack = " ".join(str(text or "").lower() for text in texts).strip()
    if not haystack:
        return SCOPE_TOTAL
    for keyword, scope in _SCOPE_NAME_HINTS:
        if keyword in haystack:
            return scope
    return SCOPE_TOTAL


def describe_meter_scope(scope: Any) -> dict[str, Any]:
    """口径的可读说明与「哪些粒度能直接读表」。

    ``directGrains`` 之外粒度的数据只能由差分/求和得到，精度依赖设备不丢读数，
    向导据此提示用户「接日累计当主表，跨零点离线会缺当天数据」这类取舍。
    """
    resolved = normalize_meter_scope(scope)
    return {
        "scope": resolved,
        "resetLabel": _SCOPE_RESET_LABELS[resolved],
        "directGrains": list(_SCOPE_DIRECT_GRAINS[resolved]),
    }


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


def _meter_values(old_state: Any, new_state: Any) -> tuple[float, float, dict[str, Any] | None] | None:
    old_raw = _extract_state(old_state)
    new_raw = _extract_state(new_state)
    if old_raw is None or new_raw is None:
        return None
    try:
        old_val = float(old_raw)
        new_val = float(new_raw)
    except (TypeError, ValueError):
        return None
    if math.isnan(old_val) or math.isnan(new_val):  # NaN
        return None
    attrs = None
    if isinstance(new_state, dict) and isinstance(new_state.get("attributes"), dict):
        attrs = new_state["attributes"]
    elif isinstance(old_state, dict) and isinstance(old_state.get("attributes"), dict):
        attrs = old_state["attributes"]
    if attrs is not None and not is_cumulative_energy_meter(attrs):
        return None
    return reading_to_kwh(old_val, attrs), reading_to_kwh(new_val, attrs), attrs


def latest_reading_kwh(state: Any) -> float:
    """单条状态的表底读数（kWh）；状态无效或不是累计电量表时返回 0。

    供能耗聚合在「同一周期取最大读数」时使用：不复用差分口径，避免把清零前后的
    两次读数当成一次增量。
    """
    values = _meter_values(state, state)
    return max(values[1], 0.0) if values is not None else 0.0


def is_meter_reset(old_state: Any, new_state: Any) -> bool:
    """是否发生表底重置/换表（新读数小于旧读数）。"""
    values = _meter_values(old_state, new_state)
    if values is None:
        return False
    old_kwh, new_kwh, _attrs = values
    return new_kwh < old_kwh


def compute_meter_delta(old_state: Any, new_state: Any) -> float:
    """两次读数间的正向 kWh 增量。

    表底重置（新读数小于旧读数）按「重置后累积量」计入 ``new_kwh``，而不是丢弃整段 ——
    否则每次清零都会漏掉一段真实用电。累加口径上是自洽的：重置后首段取 ``new_kwh``，
    后续再走正常差分，总和恰等于重置后的最终读数；调用方如需感知重置可配合
    :func:`is_meter_reset`（用于告警/标注，而非篡改数值）。不可解析时返回 0。
    """
    values = _meter_values(old_state, new_state)
    if values is None:
        return 0.0
    old_kwh, new_kwh, _attrs = values
    if new_kwh >= old_kwh:
        return new_kwh - old_kwh
    # 负跳变 = 表底清零：把重置后的读数作为本段增量（不会为负，也不会整段丢弃）。
    return max(0.0, new_kwh)


def resolve_business_timezone(timezone_name: str | None) -> ZoneInfo:
    """解析家庭业务时区；无效或未配置时回落到默认 ``Asia/Shanghai``。"""
    normalized = str(timezone_name or "").strip()
    if normalized:
        try:
            return ZoneInfo(normalized)
        except Exception:  # 非法时区名回退默认时区，脏配置不该带塌计量
            pass
    return ZoneInfo(BUSINESS_TIME_ZONE)


def business_day_key(when: datetime, timezone_name: str | None = None) -> str:
    tz = resolve_business_timezone(timezone_name)
    local = when.astimezone(tz) if when.tzinfo is not None else when.replace(tzinfo=ZoneInfo("UTC")).astimezone(tz)
    return local.strftime("%Y-%m-%d")


def business_month_key(when: datetime, timezone_name: str | None = None) -> str:
    return business_day_key(when, timezone_name)[:7]
