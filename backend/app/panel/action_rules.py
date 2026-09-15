"""控件动作与实体 ID 的判定规则。

这里集中放「动作怎么解释」和「什么样的实体 ID 算合法」两类纯函数，
校验层（`schema.py`）与运行期都从这里取口径，避免同一规则写两份。
本模块不依赖 pydantic，也不碰数据库，因此可以被任意层安全导入。
"""
from __future__ import annotations

import re
from typing import Any

# Home Assistant 原生实体 ID：域 + 点 + 对象 ID，两段都只允许小写字母、数字与下划线。
ENTITY_ID = re.compile(r"^[a-z0-9_]+\.[a-z0-9_]+$")
# 渲染器自造的虚拟实体：在原生格式前多一段固定的 virtual 前缀，
# 例如 virtual.light.abc，用于把同一个 HA 实体在不同页面作用域下区分开。
VIRTUAL_ENTITY_ID = re.compile(r"^virtual\.[a-z0-9_]+\.[a-z0-9_]+$")

# 控件动作的全部合法类型：none 表示无动作，由各模型自己的默认值决定是否出现。
ACTION_TYPES = frozenset({"toggle", "navigate", "more-info"})
# more-info 弹窗的三种来源：custom 打开组合弹窗，entity 打开指定实体的原生弹窗，
# current 打开控件自身绑定实体的弹窗。
POPUP_SOURCES = frozenset({"custom", "entity", "current"})
# 这些域下的实体「开关」语义成立，才允许把 toggle 动作挂上去；
# 列表之外的域（例如 sensor、camera）只能做 more-info 或跳转。
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


def action_popup_source(action: Any) -> str:
    """取出动作声明的弹窗来源，非法或缺失一律回落到 current。

    参数:
        action: 既支持 pydantic 模型（取属性），也支持尚未校验的原始字典。

    返回:
        保证落在 POPUP_SOURCES 内的来源字符串。
    """
    data = getattr(action, "data", None)
    # 原始字典没有 .data 属性，回退到按下标取，保证校验前也能调用。
    if not isinstance(data, dict) and isinstance(action, dict):
        data = action.get("data")
    source = str((data or {}).get("popupSource") or "current")
    return source if source in POPUP_SOURCES else "current"


def action_needs_current_entity(action: Any) -> bool:
    """判断动作是否需要目标控件自身绑定的实体。

    toggle 一律需要；more-info 只在弹窗来源为 current 时需要 ——
    来源是 entity 或 custom 时弹窗另有目标，不依赖控件自己的绑定。
    """
    action_type = getattr(action, "type", None)
    if action_type is None and isinstance(action, dict):
        action_type = action.get("type")
    # 这里的优先级是刻意的：and 先于 or，等价于 toggle 或 (more-info 且来源为 current)。
    return (
        action_type == "toggle"
        or action_type == "more-info"
        and action_popup_source(action) == "current"
    )


def entity_id_supports_toggle(entity_id: str) -> bool:
    """判断某实体是否可以响应开关动作。

    虚拟实体由渲染器自行维护开关状态，一律放行；原生实体只看域是否在白名单里。
    """
    # 统一转成字符串并兜底空值，避免调用方传 None 时抛 AttributeError。
    normalized = str(entity_id or "")
    return (
        bool(VIRTUAL_ENTITY_ID.fullmatch(normalized))
        # 只取「域」部分比较，不校验实体是否真的存在 —— 存在性由 HA 同步负责。
        or normalized.partition(".")[0] in TOGGLE_ENTITY_DOMAINS
    )
