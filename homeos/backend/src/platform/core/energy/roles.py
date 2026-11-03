"""能源实体角色判定与统计口径常量（app_config 校验与 client_power 共用）。

为什么放在 ``platform``：``domains/app_config`` 的绑定校验需要判断「这个实体是累计电量
还是瞬时功率」，但 import ``domains/client_power`` 会让
``app_config → client_power → security → proxy → ha → app_config`` 成环
（``check:backend-deps`` B4，即使写成函数内延迟导入也照样判环）。这里只放纯函数与
常量，不依赖任何域；``domains/client_power/energy_meter.py`` 原样 re-export，既有
import 点与测试都不用改。
"""

from __future__ import annotations

from typing import Any

#: 能源绑定实体类型（与前端 ``EnergyEntityKind`` 对齐）。
KIND_ENERGY = "energy"
KIND_POWER = "power"
KIND_OTHER = "other"

# ---- 统计口径（scope）----
#: 主电表的清零周期。``total`` 终身累计；其余按自然年/月/日清零。
SCOPE_TOTAL = "total"
SCOPE_YEAR = "year"
SCOPE_MONTH = "month"
SCOPE_DAY = "day"
METER_SCOPES = (SCOPE_TOTAL, SCOPE_YEAR, SCOPE_MONTH, SCOPE_DAY)

#: 瞬时量单位 / 设备类型：拒绝作为「可差分累计电量」
_REJECT_DEVICE_CLASSES = {"power", "current", "voltage", "apparent_power"}
_REJECT_UNITS = {"w", "kw", "mw", "va", "kva", "a", "v"}
#: 瞬时功率单位：可用于「当前负荷 / 功率异常」但不能做电量差分。
_POWER_UNITS = {"w", "kw", "mw"}


def normalize_unit(unit: Any) -> str:
    """把 HA 的单位字符串收敛成小写无空格形式（``kWh`` → ``kwh``）。"""
    return str(unit or "").lower().replace(" ", "")


def is_cumulative_energy_meter(attrs: dict[str, Any] | None) -> bool:
    """是否为可差分累计的电量实体（排除功率/电流/电压等瞬时量）。"""
    if not attrs:
        return False
    device_class = str(attrs.get("device_class") or "").lower()
    unit = normalize_unit(attrs.get("unit_of_measurement"))
    if device_class in _REJECT_DEVICE_CLASSES:
        return False
    if unit in _REJECT_UNITS:
        return False
    if device_class == "energy":
        return True
    return unit in ("kwh", "wh", "mwh")


def is_power_sensor(attrs: dict[str, Any] | None) -> bool:
    """是否为瞬时功率实体（W/kW/MW 或 ``device_class=power``）。

    与 :func:`is_cumulative_energy_meter` 互斥：功率只能反映「此刻」，
    不能按读数差分出用电量，绑到主电表上会把趋势算成负数或 0。
    """
    if not attrs:
        return False
    device_class = str(attrs.get("device_class") or "").lower()
    unit = normalize_unit(attrs.get("unit_of_measurement"))
    if device_class in ("power", "apparent_power"):
        return True
    return unit in _POWER_UNITS


def classify_energy_entity(attrs: dict[str, Any] | None) -> str:
    """把实体归到能源绑定角色：``energy`` / ``power`` / ``other``。

    首装向导用它给出「已识别为累计电量 / 功率」的即时反馈，
    并在保存时拒绝主电表绑定功率传感器这类必然算错趋势的组合。
    """
    if is_cumulative_energy_meter(attrs):
        return KIND_ENERGY
    if is_power_sensor(attrs):
        return KIND_POWER
    return KIND_OTHER


__all__ = [
    "KIND_ENERGY",
    "KIND_OTHER",
    "KIND_POWER",
    "METER_SCOPES",
    "SCOPE_DAY",
    "SCOPE_MONTH",
    "SCOPE_TOTAL",
    "SCOPE_YEAR",
    "classify_energy_entity",
    "is_cumulative_energy_meter",
    "is_power_sensor",
    "normalize_unit",
]
