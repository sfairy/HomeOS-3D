"""能源绑定的角色校验：写库前拦住「主表填了功率」这类语义错误。

为什么不在 ``energy.py`` 里做：字段格式校验是纯函数，而「这个 entity 是累计电量还是
瞬时功率」要看 HA 实时状态。这里把两类信息分开 —— 本模块只负责规则，
取属性由调用方注入 ``resolve_attrs``，既保持可测，也不让校验层直接依赖 HA 连接器。

失败即「保存成功但趋势永远算不对」的错误（主表填功率 → 曲线 0/负数；总功率填电量
→ 实时负荷恒为 0），所以在服务端必须再拦一次，不能只靠首装向导前端。
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from .core import FieldError

#: 字段 → 期望的实体角色（energy=累计电量 / power=瞬时功率）
ROLE_RULES: tuple[tuple[str, str, str], ...] = (
    ("meterEntityId", "energy", "主电表须为累计电量（kWh/Wh）传感器，不能选功率（W）"),
    ("mainPowerEntityId", "power", "总功率须为瞬时功率（W/kW）传感器，不能选累计电量"),
    ("monthMeterEntityId", "energy", "月累计电量须为累计电量传感器，不能填功率（W）"),
    ("dayMeterEntityId", "energy", "日累计电量须为累计电量传感器，不能填功率（W）"),
)

#: 同一块表被填两次会重复计费/重复统计
DUPLICATE_RULES: tuple[tuple[str, str, str], ...] = (
    ("monthMeterEntityId", "meterEntityId", "月累计不能与主电表填同一个实体，它们是同一块表的其它口径"),
    ("dayMeterEntityId", "meterEntityId", "日累计不能与主电表填同一个实体，它们是同一块表的其它口径"),
    ("dayMeterEntityId", "monthMeterEntityId", "日累计与月累计不能填同一个实体"),
)

AttrsResolver = Callable[[str], dict[str, Any] | None]


def _text(value: Any) -> str:
    return str(value or "").strip()


def _role_errors(
    touched: dict[str, Any],
    merged: dict[str, Any],
    resolve_attrs: AttrsResolver,
    classify,
) -> list[FieldError]:
    errors: list[FieldError] = []
    for key, expected, message in ROLE_RULES:
        if key not in touched:
            continue
        entity_id = _text(merged.get(key))
        if not entity_id:
            continue
        attrs = resolve_attrs(entity_id)
        if attrs is None:
            continue
        kind = classify(attrs)
        if kind in ("energy", "power") and kind != expected:
            errors.append({"section": "energy", "key": key, "message": message})
    return errors


def _duplicate_errors(touched: dict[str, Any], merged: dict[str, Any]) -> list[FieldError]:
    errors: list[FieldError] = []
    touched_keys = set(touched)
    for left, right, message in DUPLICATE_RULES:
        if not touched_keys & {left, right}:
            continue
        left_id = _text(merged.get(left))
        if left_id and left_id == _text(merged.get(right)):
            errors.append({"section": "energy", "key": left, "message": message})
    meter = _text(merged.get("meterEntityId"))
    if "circuitEntityIds" in touched and meter:
        circuits = {_text(item) for item in (merged.get("circuitEntityIds") or [])}
        if meter in circuits:
            errors.append(
                {
                    "section": "energy",
                    "key": "circuitEntityIds",
                    "message": "分路不能包含主电表，否则同一度电会被计两次",
                }
            )
    return errors


def energy_role_errors(
    touched: dict[str, Any],
    merged: dict[str, Any],
    resolve_attrs: AttrsResolver,
) -> list[FieldError]:
    """校验本次改动的能源绑定；``touched`` 是本次提交的字段，``merged`` 是合并后的全量。

    只检查本次动过的字段：存量配置里已有的错误值不应该把「改电价」这类无关操作也锁死。
    取不到实体属性（未同步 / 已删除）时跳过角色判断 —— 由前端/向导做「实体不存在」的提示，
    这里不把「查不到」误判成「填错了」。
    """
    from ....platform.core.energy.roles import classify_energy_entity

    return _role_errors(touched, merged, resolve_attrs, classify_energy_entity) + _duplicate_errors(touched, merged)
