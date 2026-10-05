"""可控实体域判定（对齐 ``@homeos/shared`` ``entity/controllable.ts``）。

维护「可在控制弹窗 / 服务调用中操作」的 HA domain 白名单，供 REST 实体列表的
``controllable`` 过滤、语音候选筛选、自动化动作实体过滤复用。

约定：传感器类（sensor / binary_sensor）默认不可控，仅作展示。
"""

from __future__ import annotations

#: 支持控制弹窗 / 服务调用的实体域（与前端 entity-popup-registry 对齐）
CONTROLLABLE_DOMAINS: frozenset[str] = frozenset(
    {
        "light",
        "switch",
        "input_boolean",
        "climate",
        "fan",
        "media_player",
        "water_heater",
        "cover",
        "lock",
        "vacuum",
        "camera",
        "humidifier",
        "alarm_control_panel",
        "siren",
        "valve",
        "remote",
        "select",
        "input_select",
        "number",
        "input_number",
        "button",
        "input_button",
        "timer",
        "counter",
        "input_text",
    }
)


def is_controllable_entity_domain(domain: str) -> bool:
    """判断指定 domain 是否属于可控域。"""
    return str(domain or "").lower() in CONTROLLABLE_DOMAINS


def is_controllable_entity_id(entity_id: str) -> bool:
    """判断指定 entity_id 是否属于可控实体（取 "." 首段为 domain）。"""
    domain = str(entity_id or "").split(".")[0]
    return is_controllable_entity_domain(domain)


__all__ = [
    "CONTROLLABLE_DOMAINS",
    "is_controllable_entity_domain",
    "is_controllable_entity_id",
]
