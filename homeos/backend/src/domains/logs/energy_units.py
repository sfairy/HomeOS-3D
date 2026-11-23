"""用能单位（kWh / m³）的唯一判定入口。

## 为什么按**实体**推单位，而不是加一列配置

``EnergyUsageDaily`` / ``EnergyUsageMonthly`` 存的是「某实体某天用了多少」。单位是实体的
固有属性（``sensor.gas_8107_daily_gas_num`` 永远是立方米），不是每次写行的参数。把它做成
写入参数就得在四条写入路径（实时差分、账户回填、月聚、迁移脚本）各自记得传对，漏一处就会
出现「同一块气表一部分行是 kWh」的脏数据，而且**没有任何报错**。

按实体名推导只有一个实现点：命名约定本身就是 ``sensor.<ele|gas|water>_<户号>_*``
（前端 ``ENERGY_CONVENTION_PREFIX`` 是同一份约定）。推算不出来的一律按 ``kWh`` —— 那是
历史行为，也是绝对多数场景。

## 限制（必须如实说明）

只有「日/月列表」这类成品数据能可靠区分水气电；**累计型读数**（``state_class:
total_increasing`` 的流量表）也走这里，但它们的 ``device_class`` 更可靠。因此
:func:`unit_for_entity` 优先读实体属性，属性缺失才回落到命名约定。
"""

from __future__ import annotations

from typing import Any

KWH = "kWh"
CUBIC_METER = "m³"

#: 立方米的常见写法（HA 里 ``m³`` / ``m3`` / ``m³/h`` 都出现过，统一成 ``m³``）。
_CUBIC_ALIASES = frozenset({"m³", "m3", "m^3", "立方米", "立方"})

#: 命名约定里的水气前缀（``sensor.gas_`` / ``sensor.water_``）。
_GAS_NAME_HINTS = ("_gas", "gas_", "gas.")
_WATER_NAME_HINTS = ("_water", "water_", "water.")
#: 名字里出现这些片段的是**设备**而不是表计（``sensor.water_heater_power`` 是电，不是水）。
#: 单位属性优先，因此只有「没报单位」时才依赖这层排除。
_DEVICE_NAME_HINTS = ("water_heater", "waterheater", "gas_boiler", "boiler", "heater")


def normalize_unit(raw: Any) -> str | None:
    """把属性里的单位归一成 ``kWh`` / ``m³``；不认识时返回 ``None``。"""
    text = str(raw or "").strip().lower().replace(" ", "")
    if not text:
        return None
    if text in _CUBIC_ALIASES:
        return CUBIC_METER
    if text in ("kwh", "kw·h", "度", "千瓦时"):
        return KWH
    if text in ("wh", "mwh", "gwh"):
        # 依旧按电处理：换算在 ``energy_guard`` 的读数归一里完成，这里只管分类。
        return KWH
    return None


def unit_for_entity(entity_id: str, attributes: Any = None) -> str:
    """实体 → 用能单位。属性优先，命名约定兜底，未知按 ``kWh``。"""
    if isinstance(attributes, dict):
        explicit = normalize_unit(attributes.get("unit_of_measurement"))
        if explicit is not None:
            return explicit
    lowered = str(entity_id or "").lower()
    if any(hint in lowered for hint in _DEVICE_NAME_HINTS):
        # 设备本体（热水器/锅炉）的功率、温度不是水气用量，按历史行为归到电。
        return KWH
    if any(hint in lowered for hint in _GAS_NAME_HINTS):
        return CUBIC_METER
    if any(hint in lowered for hint in _WATER_NAME_HINTS):
        return CUBIC_METER
    return KWH


def is_utility_unit(unit: str) -> bool:
    return unit in (KWH, CUBIC_METER)


__all__ = ["CUBIC_METER", "KWH", "is_utility_unit", "normalize_unit", "unit_for_entity"]
