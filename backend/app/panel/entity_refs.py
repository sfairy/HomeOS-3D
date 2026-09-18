"""从仪表盘文档里收集它引用到的 Home Assistant 实体 / 场景标识。

用途：实体被删除或重命名时判断哪些仪表盘受影响、同步时只订阅真正用到的实体，
以及户型快照「还有没有人在用」（决定能不能回收磁盘）。
扫描是「按键名猜」的启发式遍历，不依赖文档结构版本，因此前端加字段不用改这里。
"""
from __future__ import annotations

from collections.abc import Callable
from typing import Any


def is_virtual_entity_id(value: str) -> bool:
    """判断是否为渲染器自造的虚拟实体 ID（virtual. 前缀）。"""
    return value.startswith("virtual.")


def document_keyed_values(
    value: Any,
    suffix: str,
    keep: Callable[[str], bool] | None = None,
) -> set[str]:
    """收集文档里「键名以 suffix 结尾」的字符串值，以及 suffix 复数形式的字符串列表。

    遍历规则：
    1. 键名以 ``suffix`` 结尾且值是字符串 —— 收下（``keep`` 返回 False 则跳过）；
    2. 键名以 ``suffix`` + ``s`` 结尾且值是列表 —— 逐个收下其中的字符串；
    3. 命中的键不再向下递归，防止把它的值当容器重复扫描；
    4. 其余键继续向下递归。

    大小写不敏感：文档里既有 ``entityId`` 也有 ``EntityId`` 的历史写法。

    参数:
        value: 任意文档片段，通常是整个仪表盘文档字典。
        suffix: 键名后缀，例如 ``entityId`` / ``sceneId``。
        keep: 可选的过滤器；不传则全部收下。

    返回:
        去重后的字符串集合。
    """
    found: set[str] = set()
    normalized_suffix = suffix.casefold()
    normalized_plural = f"{normalized_suffix}s"

    def accepts(candidate: Any) -> bool:
        """值是否算一次引用：必须是非空字符串，并满足调用方的过滤条件。"""
        if not isinstance(candidate, str) or not candidate:
            return False
        return keep is None or keep(candidate)

    def walk(item: Any) -> None:
        """递归遍历 dict / list，把命中的值收进外层 found。"""
        if isinstance(item, dict):
            for key, child in item.items():
                normalized_key = str(key).casefold()
                if normalized_key.endswith(normalized_suffix) and accepts(child):
                    found.add(child)
                    continue
                if normalized_key.endswith(normalized_plural) and isinstance(child, list):
                    found.update(entry for entry in child if accepts(entry))
                    continue
                walk(child)
        elif isinstance(item, list):
            for child in item:
                walk(child)
        return None

    walk(value)
    return found


def document_entity_ids(value: Any) -> set[str]:
    """收集文档中显式或隐式用到的全部 HA 实体 ID。

    遍历规则（按优先级）：
    1. weather 控件即使没写 sun 绑定，也隐式依赖 `sun.sun`，必须补上；
    2. 键名以 `entityId` 结尾的字符串值；
    3. 键名以 `entityIds` 结尾的列表值；
    4. 其余键继续向下递归。

    虚拟实体（`virtual.*`）由渲染器自行维护，不属于 HA，全部剔除；
    值里必须含点才像实体 ID，避免把普通字符串（如标题）误判成实体。

    参数:
        value: 任意文档片段，通常是整个仪表盘文档字典。

    返回:
        去重后的实体 ID 集合；文档没有引用任何实体时返回空集合。
    """

    def looks_like_entity_id(candidate: str) -> bool:
        """含点才像实体 ID；虚拟实体由渲染器维护，不算 HA 实体。"""
        return "." in candidate and not is_virtual_entity_id(candidate)

    result = document_keyed_values(value, "entityId", keep=looks_like_entity_id)

    def walk_for_implicit_sun(item: Any) -> None:
        """补上天气控件隐式依赖的太阳实体。

        没显式绑定 sun 时按约定用 sun.sun，否则日出日落、昼夜图标会因为漏订阅
        而停在初始值。
        """
        if isinstance(item, dict):
            if item.get("type") == "weather":
                sun_id = ((item.get("bindings") or {}).get("sun") or {}).get(
                    "entityId"
                )
                result.add(str(sun_id or "sun.sun"))
            for child in item.values():
                walk_for_implicit_sun(child)
        elif isinstance(item, list):
            for child in item:
                walk_for_implicit_sun(child)
        return None

    walk_for_implicit_sun(value)
    return result


def document_scene_ids(value: Any) -> set[str]:
    """收集文档引用到的户型快照 sceneId。

    键名以 `sceneId` 结尾（含 `sceneIds` 列表）的值都算引用。这里**不过滤格式**：
    快照回收只看「有没有人引用」，多留一个认不出的字符串最多让一个文件多活一阵，
    而漏认一个引用就会把正在用的户型删掉（看板黑屏），两个方向的代价不对称。
    """
    return document_keyed_values(value, "sceneId")

