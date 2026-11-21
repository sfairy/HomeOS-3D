"""按画像 kind 校验 climate / water_heater 命令：能力 + 形态语义。

画像把 ``climate`` 实体分成挂机 / 中央 / 锅炉 / 地暖 / 热水器 / 浴霸。差异不只在
「怎么选目标」，还在「哪些服务与字段发得出去」：

- 挂机 / 中央空调接受风速、摆风与全部自报模式；
- 锅炉 / 地暖只有温度与制热类模式，没有风速 / 摆风 / 制冷；
- 热水器 / 浴霸只接受开关与设定温度。

HA 原生 ``water_heater`` 域是另一套服务（``set_operation_mode``），同样按
``operation_list`` 校验，并拒绝风速 / 摆风。

判定顺序是「实体自报能力优先」：``hvac_modes`` / ``operation_list`` / ``fan_modes`` /
``swing_modes`` 里没有的值一律拒绝；实体没有自报这些属性时，才退到 kind 的形态约束。
这样既不会因为画像没确认就放松校验，也不会把 HA 里真实存在的模式误判成不支持。
"""

from __future__ import annotations

import logging
import math
from typing import Any

logger = logging.getLogger("homeos.device_profile.climate")

#: 只有制冷类形态接受风速 / 摆风
_AIRFLOW_KINDS = frozenset({"ac_split", "ac_central", "unknown"})
#: 制热类形态允许的模式（仍须出现在实体自报的 ``hvac_modes`` 里）
_HEATING_MODES = frozenset({"off", "heat", "heat_cool", "auto"})
#: 热水器 / 浴霸允许的模式
_WATER_MODES = frozenset({"off", "heat", "auto"})
#: 形态 → 允许的模式子集；空调形态不在此表（全量按实体自报）
_KIND_MODE_SUBSET: dict[str, frozenset[str]] = {
    "floor_heating": _HEATING_MODES,
    "boiler": _HEATING_MODES,
    "water_heater": _WATER_MODES,
    "bath_heater": _WATER_MODES,
}


def _text(value: Any) -> str:
    return str(value or "").strip()


def _number(value: Any) -> float | None:
    if value is None or value == "":
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):  # fmt: skip
        logger.debug("climate 数值字段不是数字: %r", value)
        return None
    return number if math.isfinite(number) else None


def _str_list(value: Any) -> list[str]:
    return [str(item) for item in value] if isinstance(value, list) else []


def _device_name(attributes: dict[str, Any], entity_id: str) -> str:
    return _text(attributes.get("friendly_name")) or entity_id


def _temperature_error(attributes: dict[str, Any], data: dict[str, Any], name: str) -> str | None:
    requested = _number(data.get("temperature"))
    if requested is None:
        return "目标温度无效，请提供有效的温度数值。"
    minimum = _number(attributes.get("min_temp"))
    maximum = _number(attributes.get("max_temp"))
    if minimum is not None and requested < minimum:
        return f"设备「{name}」支持的温度范围为 {_range_text(minimum, maximum)}。"
    if maximum is not None and requested > maximum:
        return f"设备「{name}」支持的温度范围为 {_range_text(minimum, maximum)}。"
    return None


def _range_text(minimum: float | None, maximum: float | None) -> str:
    if minimum is not None and maximum is not None:
        return f"{minimum:g}–{maximum:g}°C"
    if minimum is not None:
        return f"不低于 {minimum:g}°C"
    if maximum is not None:
        return f"不高于 {maximum:g}°C"
    return "未知"


def _hvac_mode_error(attributes: dict[str, Any], kind: str, data: dict[str, Any], name: str) -> str | None:
    requested = _text(data.get("hvac_mode"))
    if not requested:
        return None
    supported = _str_list(attributes.get("hvac_modes"))
    if supported and requested not in supported:
        return f"设备「{name}」不支持「{requested}」模式；支持的模式：{'、'.join(supported)}。"
    subset = _KIND_MODE_SUBSET.get(kind)
    if subset is not None and requested not in subset:
        label = "地暖 / 锅炉" if kind in ("floor_heating", "boiler") else "热水器 / 浴霸"
        return f"设备「{name}」是{label}，不支持「{requested}」模式。"
    return None


def _option_error(
    attributes: dict[str, Any],
    kind: str,
    service: str,
    data: dict[str, Any],
    name: str,
) -> str | None:
    if service not in ("set_fan_mode", "set_swing_mode"):
        return None
    if kind not in _AIRFLOW_KINDS:
        return f"设备「{name}」是{_heating_label(kind)}，没有风速 / 摆风。"
    field = "fan_mode" if service == "set_fan_mode" else "swing_mode"
    requested = _text(data.get(field))
    supported = _str_list(attributes.get("fan_modes" if field == "fan_mode" else "swing_modes"))
    if requested and supported and requested not in supported:
        return f"设备「{name}」不支持「{requested}」；可选：{'、'.join(supported)}。"
    return None


def _heating_label(kind: str) -> str:
    return "地暖 / 锅炉" if kind in ("floor_heating", "boiler") else "热水器 / 浴霸"


def _operation_mode_error(attributes: dict[str, Any], kind: str, data: dict[str, Any], name: str) -> str | None:
    """HA 原生 ``water_heater.set_operation_mode``：只认 ``operation_list`` 里的值。"""
    requested = _text(data.get("operation_mode"))
    if not requested:
        return None
    supported = _str_list(attributes.get("operation_list"))
    if supported and requested not in supported:
        return f"设备「{name}」不支持「{requested}」模式；支持的模式：{'、'.join(supported)}。"
    if kind in ("water_heater", "bath_heater") and requested not in _WATER_MODES:
        return f"设备「{name}」是{_heating_label(kind)}，不支持「{requested}」模式。"
    return None


def validate_climate_command(
    entity_id: str,
    attributes: dict[str, Any],
    kind: str | None,
    service: str,
    data: dict[str, Any] | None,
) -> str | None:
    """校验一条 climate / water_heater 命令；返回给用户看的中文说明，``None`` 表示可以下发。

    ``kind`` 为 ``None``（画像还没建）时只做实体能力校验，行为与改造前一致。
    """
    domain = _text(entity_id).split(".", 1)[0]
    if domain not in ("climate", "water_heater"):
        return None
    payload = data if isinstance(data, dict) else {}
    name = _device_name(attributes, entity_id)
    resolved_kind = kind or "unknown"
    if service == "set_temperature":
        return _temperature_error(attributes, payload, name)
    if service == "set_hvac_mode":
        return _hvac_mode_error(attributes, resolved_kind, payload, name)
    if service == "set_operation_mode":
        return _operation_mode_error(attributes, resolved_kind, payload, name)
    return _option_error(attributes, resolved_kind, service, payload, name)


__all__ = ["validate_climate_command"]
