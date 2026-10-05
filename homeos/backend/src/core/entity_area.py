"""实体房间（Area）解析与筛选（对齐 ``@homeos/shared`` ``entity/area.ts``）。

HomeOS 后端在实体同步阶段把 HA registry 的 ``area_id`` / ``area_name`` 合并进实体
``attributes``，前端与 REST 过滤直接消费，无需再次查表。

约定：
- ``area_id`` 与 ``area_name`` 至少存在其一即视为有房间归属；
- 二者可互为兜底（缺哪个用另一个补）。
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class EntityAreaInfo:
    """解析后的房间信息（id / name / display 均为非空字符串）。"""

    id: str
    name: str
    display: str


def resolve_entity_area(attrs: dict[str, Any] | None) -> EntityAreaInfo | None:
    """从实体 attributes 解析房间；无房间归属返回 None。"""
    attrs = attrs if isinstance(attrs, dict) else {}
    area_id = str(attrs.get("area_id") or "").strip()
    area_name = str(attrs.get("area_name") or "").strip()
    if not area_id and not area_name:
        return None
    resolved_id = area_id or area_name
    resolved_name = area_name or area_id
    return EntityAreaInfo(id=resolved_id, name=resolved_name, display=resolved_name)


def entity_matches_area_filter(attrs: dict[str, Any] | None, filter_area_id: str) -> bool:
    """实体是否匹配房间筛选（area_id 或 area_name 任一命中；空筛选放行）。"""
    target = str(filter_area_id or "").strip()
    if not target:
        return True
    area = resolve_entity_area(attrs)
    if area is None:
        return False
    return area.id == target or area.name == target


__all__ = ["EntityAreaInfo", "entity_matches_area_filter", "resolve_entity_area"]
