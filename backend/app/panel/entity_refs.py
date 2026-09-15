"""从仪表盘文档里收集它引用到的 Home Assistant 实体。

用途：实体被删除或重命名时判断哪些仪表盘受影响，以及同步时只订阅真正用到的实体。
扫描是「按键名猜」的启发式遍历，不依赖文档结构版本，因此前端加字段不用改这里。
"""
from __future__ import annotations

from typing import Any


def is_virtual_entity_id(value: str) -> bool:
    """判断是否为渲染器自造的虚拟实体 ID（virtual. 前缀）。"""
    return value.startswith("virtual.")


def document_entity_ids(value: Any) -> set[str]:
    """收集文档中显式或隐式用到的全部 HA 实体 ID。

    遍历规则（按优先级）：
    1. weather 控件即使没写 sun 绑定，也隐式依赖 `sun.sun`，必须补上；
    2. 键名以 `entityId` 结尾的字符串值；
    3. 键名以 `entityIds` 结尾的列表值；
    4. 其余键继续向下递归。

    虚拟实体（`virtual.*`）由渲染器自行维护，不属于 HA，全部剔除。

    参数:
        value: 任意文档片段，通常是整个仪表盘文档字典。

    返回:
        去重后的实体 ID 集合；文档没有引用任何实体时返回空集合。
    """
    result = set()

    def walk(item: Any) -> None:
        """递归遍历 dict / list，把命中的实体 ID 收进外层 result。"""
        if isinstance(item, dict):
            # 天气控件隐式依赖太阳实体：没显式绑定 sun 时按约定用 sun.sun，
            # 否则日出日落、昼夜图标会因为漏订阅而停在初始值。
            if item.get("type") == "weather":
                sun_id = ((item.get("bindings") or {}).get("sun") or {}).get(
                    "entityId"
                )
                result.add(str(sun_id or "sun.sun"))
            for key, child in item.items():
                # 键名大小写不敏感：文档里既有 entityId 也有 EntityId 的历史写法。
                normalized_key = str(key).casefold()
                if (
                    normalized_key.endswith("entityid")
                    and isinstance(child, str)
                    and "." in child
                ):
                    # 含点才像实体 ID，避免把普通字符串（如标题）误判成实体。
                    if not is_virtual_entity_id(child):
                        result.add(child)
                    # 命中明确规则的键不再递归，防止把它的值当容器重复扫描。
                    continue
                if normalized_key.endswith("entityids") and isinstance(child, list):
                    result.update(
                        str(entity_id)
                        for entity_id in child
                        if isinstance(entity_id, str)
                        and "." in entity_id
                        and not is_virtual_entity_id(entity_id)
                    )
                    continue
                walk(child)
        elif isinstance(item, list):
            for child in item:
                walk(child)
        return None

    walk(value)
    return result
