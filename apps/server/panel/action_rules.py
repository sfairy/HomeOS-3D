"""实体 ID 的合法性规则，以及控件动作用到的少量口径常量。
"""
from __future__ import annotations

import re

ENTITY_ID = re.compile(r"^[a-z0-9_]{1,200}\.[a-z0-9_]{1,200}$")
# 渲染器自造的虚拟实体：在原生格式前多一段固定的 virtual 前缀，
VIRTUAL_ENTITY_ID = re.compile(r"^virtual\.[a-z0-9_]{1,200}\.[a-z0-9_]{1,200}$")

# more-info 弹窗的三种来源：custom 打开组合弹窗，entity 打开指定实体的原生弹窗，
POPUP_SOURCES = frozenset({"custom", "entity", "current"})
# 这些域下的实体「开关」语义成立，才允许把 toggle 动作挂上去；
TOGGLE_ENTITY_DOMAINS = frozenset(
    {
        "fan",
        "cover",
        "light",
        "button",
        "remote",
        "script",
        "switch",
        "climate",
        "automation",
        "media_player",
        "water_heater",
        "input_boolean",
    }
)


def valid_ha_entity_id(value: str) -> bool:
    """判断是否为 Home Assistant 原生实体 ID（不接受虚拟实体）。"""
    return bool(ENTITY_ID.fullmatch(value))


def valid_entity_id(value: str) -> bool:
    """判断是否为合法实体 ID：Home Assistant 原生 ID 或渲染器的作用域虚拟 ID。"""
    return valid_ha_entity_id(value) or bool(VIRTUAL_ENTITY_ID.fullmatch(value))
