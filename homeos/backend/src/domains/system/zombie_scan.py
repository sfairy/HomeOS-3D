"""僵尸绑定扫描判定与绑定路径工具（对齐 ``device-management.util.ts``）。

扫描口径：本地引用 −（状态库 ∪ HA 注册表）= 僵尸。这里只放三类纯函数：

- 存活集合 / 是否跳过扫描；
- 从任意配置对象里递归发现实体引用（含逗号分隔的多实体字段）；
- 按路径摘除单条引用（解绑时用，带「删的确实是指向该实体的那一项」校验）。
"""

from __future__ import annotations

import re
from collections.abc import Iterable, Iterator
from typing import Any

#: 合法 entity_id：``domain.object_id``（HA 只允许小写字母、数字与下划线）
ENTITY_ID_PATTERN = re.compile(r"^[a-z][a-z0-9_]*\.[a-z0-9_]+$")

#: 绑定的路径片段：对象键为 ``str``，数组下标为 ``int``
PathSegment = str | int
BindingPath = tuple[PathSegment, ...]


def is_entity_id(value: Any) -> bool:
    """是否为形如 ``light.kitchen`` 的实体 ID。"""
    return isinstance(value, str) and bool(ENTITY_ID_PATTERN.match(value.strip()))


def split_entity_id_list(raw: str) -> list[str]:
    """把逗号分隔的多实体字段（如 ``hazardExhaustFanEntityIds``）拆成单个 entity_id。

    只有每一段都是合法 entity_id 时才拆：``camera.a,camera.b`` 是绑定，
    URL、路径或普通文本不是。
    """
    if "," not in raw:
        return []
    parts = [part.strip() for part in raw.split(",") if part.strip()]
    if len(parts) > 1 and all(is_entity_id(part) for part in parts):
        return parts
    return []


def iter_entity_refs(value: Any, path: BindingPath = ()) -> Iterator[tuple[BindingPath, str]]:
    """递归遍历配置对象，产出 ``(路径, entity_id)``。

    路径指向**值本身**：数组里的字符串给下标（如 ``("sensors", 2)``），
    逗号分隔的多实体字段给字段名（同一条路径会出现多次）。
    """
    if isinstance(value, str):
        if is_entity_id(value):
            yield path, value.strip()
            return
        for entity_id in split_entity_id_list(value):
            yield path, entity_id
        return
    if isinstance(value, list):
        for index, item in enumerate(value):
            yield from iter_entity_refs(item, (*path, index))
        return
    if isinstance(value, dict):
        for key, item in value.items():
            yield from iter_entity_refs(item, (*path, str(key)))


def encode_path(path: BindingPath) -> str:
    """把路径编码进 ``refId``：``/temperatureEntities/0``。"""
    return "/" + "/".join(str(segment) for segment in path)


def decode_path(raw: str) -> BindingPath:
    """``refId`` 里的路径还原成片段元组；数字段还原成下标。"""
    segments: list[PathSegment] = []
    for part in str(raw or "").split("/"):
        if not part:
            continue
        segments.append(int(part) if part.isdigit() else part)
    return tuple(segments)


#: 整张表都是「属性名 → 实体 ID」的绑定映射：解绑要删键，不能留 ``key: ""``
BINDING_MAP_KEYS = frozenset({"entityMap"})


def _step(node: Any, segment: PathSegment) -> Any:
    if isinstance(node, dict) and isinstance(segment, str):
        return node.get(segment)
    if isinstance(node, list) and isinstance(segment, int) and 0 <= segment < len(node):
        return node[segment]
    return None


def _references(node: Any, entity_id: str) -> bool:
    """被摘除的节点是否确实引用该实体（数组项 / 对象项）。"""
    if isinstance(node, str):
        return node.strip() == entity_id or entity_id in split_entity_id_list(node)
    if isinstance(node, dict):
        return any(_references(value, entity_id) for value in node.values())
    return False


def _remove_from_list(items: list[Any], index: Any, target: str) -> bool:
    """数组元素：确认该下标确实引用目标实体后移除。"""
    if not isinstance(index, int) or not 0 <= index < len(items):
        return False
    if not _references(items[index], target):
        return False
    items.pop(index)
    return True


def _remove_from_dict(node: dict[str, Any], key: str, target: str, map_key: Any) -> bool:
    """对象字段：数组去元素、绑定映射删键、普通字段置空。"""
    if key not in node:
        return False
    current = node[key]
    if not _references(current, target):
        return False
    if isinstance(current, list):
        node[key] = [item for item in current if not _references(item, target)]
        return True
    if not isinstance(current, str):
        return False
    parts = split_entity_id_list(current)
    if parts:
        node[key] = ",".join(part for part in parts if part != target)
    elif map_key in BINDING_MAP_KEYS:
        node.pop(key)
    else:
        node[key] = ""
    return True


def remove_entity_at_path(root: Any, path: BindingPath, entity_id: Any) -> bool:
    """按 ``iter_entity_refs`` 给出的路径摘除一条引用（原地修改）。

    语义按容器区分，避免把「整个部件的入口实体」误删成空壳：

    - 数组里的元素：移除该元素（多实体传感器列表、摄像头绑定项）；
    - 映射表里的键（``entityMap`` 这类整表都是绑定的）：删键；
    - 普通字段：置空字符串（``securityCamera`` / ``entityId`` 等），
      逗号分隔的多实体字段只摘掉命中的那一段。

    仅当路径末端确实指向 ``entity_id`` 时才动手，返回是否真的删掉了。
    """
    target = str(entity_id or "").strip()
    if not target or not path:
        return False
    parent: Any = root
    for segment in path[:-1]:
        parent = _step(parent, segment)
        if parent is None:
            return False
    if isinstance(parent, list):
        return _remove_from_list(parent, path[-1], target)
    if isinstance(parent, dict) and isinstance(path[-1], str):
        map_key = path[-2] if len(path) >= 2 else None
        return _remove_from_dict(parent, path[-1], target, map_key)
    return False


# 存活实体来源：状态库 ∪ HA 注册表（注册表有条目即视为仍存在于 HA）
def build_alive_entity_id_set(store_ids: Iterable[str], registry_ids: Iterable[str]) -> set[str]:
    alive: set[str] = set()
    for raw in store_ids:
        entity_id = str(raw or "").strip()
        if entity_id:
            alive.add(entity_id)
    for raw in registry_ids:
        entity_id = str(raw or "").strip()
        if entity_id:
            alive.add(entity_id)
    return alive


def should_skip_zombie_scan(snapshot: dict[str, Any]) -> bool:
    """HA 尚未同步完成时，本地绑定无法判断是否已在 HA 删除，必须跳过扫描。

    已同步且两侧都空：HA 确实没有实体，本地引用才是真僵尸。
    """
    return (
        int(snapshot.get("storeCount") or 0) == 0
        and int(snapshot.get("registryCount") or 0) == 0
        and not bool(snapshot.get("haSynced"))
    )


__all__ = [
    "ENTITY_ID_PATTERN",
    "BindingPath",
    "build_alive_entity_id_set",
    "decode_path",
    "encode_path",
    "is_entity_id",
    "iter_entity_refs",
    "remove_entity_at_path",
    "should_skip_zombie_scan",
    "split_entity_id_list",
]
