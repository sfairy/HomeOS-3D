"""能源分区校验：电价模式、TOU 时段、时钟字段（对齐 ``validate/energy.ts``）。"""

from __future__ import annotations

import re
from typing import Any

from .core import (
    FieldError,
    num_in,
    validate_entity_id_list,
    validate_optional_entity_id,
)
from ....platform.core.runtime.zoned_time import normalize_home_mode_time_at


def _clock_to_minutes(raw: str) -> int | None:
    normalized = normalize_home_mode_time_at(raw)
    if not normalized:
        return None
    hour, minute = (int(x) for x in normalized.split(":"))
    return hour * 60 + minute

def _range_to_segments(start_min: int, end_min: int) -> list[tuple[int, int]]:
    if start_min == end_min:
        return []
    if end_min > start_min:
        return [(start_min, end_min)]
    return [(start_min, 1440), (0, end_min)]

def _segments_overlap(left: list[tuple[int, int]], right: list[tuple[int, int]]) -> bool:
    for a0, a1 in left:
        for b0, b1 in right:
            if a0 < b1 and b0 < a1:
                return True
    return False

def clock_ranges_overlap(a_start: str, a_end: str, b_start: str, b_end: str) -> bool:
    a0 = _clock_to_minutes(a_start)
    a1 = _clock_to_minutes(a_end)
    b0 = _clock_to_minutes(b_start)
    b1 = _clock_to_minutes(b_end)
    if a0 is None or a1 is None or b0 is None or b1 is None:
        return False
    return _segments_overlap(_range_to_segments(a0, a1), _range_to_segments(b0, b1))

def validate_tou_windows(input_: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    windows = [
        (input_.get("peakStart1"), input_.get("peakEnd1"), "峰段1"),
        (input_.get("peakStart2"), input_.get("peakEnd2"), "峰段2"),
        (input_.get("valleyStart"), input_.get("valleyEnd"), "谷段"),
    ]
    parsed: list[tuple[str, str, str]] = []
    for start_raw, end_raw, label in windows:
        start_s = str(start_raw or "").strip()
        end_s = str(end_raw or "").strip()
        if not start_s and not end_s:
            continue
        ns = normalize_home_mode_time_at(start_s)
        ne = normalize_home_mode_time_at(end_s)
        if not ns or not ne:
            errors.append(f"{label}须为 HH:MM（如 08:00）")
            continue
        if ns == ne:
            errors.append(f"{label}起止不能相同")
            continue
        parsed.append((label, ns, ne))
    for i in range(len(parsed)):
        for j in range(i + 1, len(parsed)):
            if clock_ranges_overlap(parsed[i][1], parsed[i][2], parsed[j][1], parsed[j][2]):
                errors.append(f"{parsed[i][0]}与{parsed[j][0]}时段重叠")
    return errors


# 分区校验函数

def _validate_energy(section: str, payload: dict[str, Any], errors: list[FieldError]) -> None:
    if "learningPeriodDays" in payload:
        num_in(section, "learningPeriodDays", payload["learningPeriodDays"], 0, 90, errors)
    if "budgetAlertCooldownMin" in payload:
        num_in(section, "budgetAlertCooldownMin", payload["budgetAlertCooldownMin"], 30, 10080, errors)
    if "anomalyCooldownMin" in payload:
        num_in(section, "anomalyCooldownMin", payload["anomalyCooldownMin"], 1, 1440, errors)
    if "meterEntityId" in payload:
        validate_optional_entity_id(section, "meterEntityId", payload["meterEntityId"], errors)
    if "circuitEntityIds" in payload:
        validate_entity_id_list(section, "circuitEntityIds", payload["circuitEntityIds"], errors)


_CLOCK_RE = re.compile(r"^(\d{1,2}):(\d{2})$")

def _validate_clock_time(section: str, key: str, val: Any, errors: list[FieldError]) -> None:
    if not isinstance(val, str):
        errors.append({"section": section, "key": key, "message": "须为 HH:MM 时刻字符串"})
        return
    m = _CLOCK_RE.match(val.strip())
    if not m:
        errors.append({"section": section, "key": key, "message": "格式须为 HH:MM（如 08:00）"})
        return
    hour = int(m.group(1))
    minute = int(m.group(2))
    if hour > 23 or minute > 59:
        errors.append({"section": section, "key": key, "message": "小时须 0–23，分钟须 0–59"})

def _is_fixed_pricing_mode(payload: dict[str, Any], context: dict[str, Any] | None) -> bool:
    mode = payload.get("pricingMode")
    if mode is None and isinstance(context, dict):
        ctx_pricing = context.get("pricing")
        if isinstance(ctx_pricing, dict):
            mode = ctx_pricing.get("pricingMode")
    return mode == "fixed"

def _validate_pricing(
    section: str, payload: dict[str, Any], errors: list[FieldError], context: dict[str, Any] | None
) -> None:
    for key in ("peakStart1", "peakEnd1", "peakStart2", "peakEnd2", "valleyStart", "valleyEnd"):
        if key in payload:
            _validate_clock_time(section, key, payload[key], errors)
    if "timeOfUseEnabled" in payload and not isinstance(payload["timeOfUseEnabled"], bool):
        errors.append({"section": section, "key": "timeOfUseEnabled", "message": "须为布尔值"})
    if "pricingMode" in payload:
        mode = payload["pricingMode"]
        if mode not in ("tiered", "fixed"):
            errors.append({"section": section, "key": "pricingMode", "message": "须为 tiered 或 fixed"})
    if "fixedPrice" in payload:
        num_in(section, "fixedPrice", payload["fixedPrice"], 0, 10, errors)
    if "regionLabel" in payload and payload["regionLabel"] is not None and not isinstance(payload["regionLabel"], str):
        errors.append({"section": section, "key": "regionLabel", "message": "须为字符串"})
    fixed_mode = _is_fixed_pricing_mode(payload, context)

    def merged_value(key: str) -> Any:
        if key in payload:
            return payload[key]
        if isinstance(context, dict):
            ctx_pricing = context.get("pricing")
            if isinstance(ctx_pricing, dict):
                return ctx_pricing.get(key)
        return None

    if fixed_mode and "fixedPrice" in payload:
        try:
            if float(payload["fixedPrice"]) <= 0:
                errors.append({"section": section, "key": "fixedPrice", "message": "固定单价须大于 0"})
        except (TypeError, ValueError):
            pass
    if "tier1Kwh" in payload:
        num_in(section, "tier1Kwh", payload["tier1Kwh"], 0, 100_000, errors)
    if "tier1Price" in payload:
        num_in(section, "tier1Price", payload["tier1Price"], 0, 10, errors)
    if "tier2Price" in payload:
        num_in(section, "tier2Price", payload["tier2Price"], 0, 10, errors)
    if "tier3Price" in payload:
        num_in(section, "tier3Price", payload["tier3Price"], 0, 10, errors)
    for key in ("peakPrice", "valleyPrice", "flatPrice"):
        if key in payload:
            num_in(section, key, payload[key], 0, 10, errors)
    tou_enabled = merged_value("timeOfUseEnabled") is not False
    tou_keys = (
        "peakStart1",
        "peakEnd1",
        "peakStart2",
        "peakEnd2",
        "valleyStart",
        "valleyEnd",
        "timeOfUseEnabled",
    )
    if tou_enabled and any(k in payload for k in tou_keys):
        for message in validate_tou_windows(
            {
                "peakStart1": str(merged_value("peakStart1") or ""),
                "peakEnd1": str(merged_value("peakEnd1") or ""),
                "peakStart2": str(merged_value("peakStart2") or ""),
                "peakEnd2": str(merged_value("peakEnd2") or ""),
                "valleyStart": str(merged_value("valleyStart") or ""),
                "valleyEnd": str(merged_value("valleyEnd") or ""),
            }
        ):
            errors.append({"section": section, "key": "peakStart1", "message": message})

def normalize_pricing_patch(partial: dict[str, Any]) -> dict[str, Any]:
    """切换为 fixed 且本次未指定分时时，默认关闭峰谷平。"""
    if (
        partial.get("pricingMode") == "fixed"
        and "pricingMode" in partial
        and "timeOfUseEnabled" not in partial
    ):
        return {**partial, "timeOfUseEnabled": False}
    return partial
