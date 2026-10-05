"""智能管家房间视图服务。

职责：从 HA area_registry（经 EntityAreaEnrichmentService 补全的实体区域索引）构建
 房间 → 设备视图，供 HomeToolsService / FastPathService 使用。
依赖：EntityAreaEnrichmentService、StateStore。

说明：原「本地 DB Area 优先、HA 回退」的双真相源已移除；房间目录统一以 HA 为准，
 避免本地影子数据盖住 HA 中更新的区域绑定。
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class AgentAreaEntity:
    """房间内的实体引用。"""

    #: 实体 ID，形如 light.living_room
    entity_id: str


@dataclass
class AgentAreaSummary:
    """房间摘要：含 ID、名称、可选图标与关联实体列表。"""

    #: 房间 ID（HA area_registry.area_id）
    id: str
    #: 房间名称，如“客厅”“主卧”
    name: str
    #: 房间图标，可选
    icon: str | None = None
    #: 房间内关联实体列表（find_all / find_one 均尽量填充，避免 N+1）
    entities: list[AgentAreaEntity] = field(default_factory=list)


class AgentAreaService:
    """房间视图服务：数据源为 HA area_registry 与实体区域索引。"""

    def __init__(self, enrichment: Any, state_store: Any) -> None:
        self._enrichment = enrichment
        self._state_store = state_store

    async def find_all(self) -> list[AgentAreaSummary]:
        """列出全部房间（含实体列表），一次遍历带齐实体，避免调用方再逐房 find_one。"""
        await self._enrichment.ensure_loaded()
        ha_areas = self._enrichment.get_cached_ha_areas()
        out: list[AgentAreaSummary] = []
        for area in ha_areas:
            entity_ids = await self._resolve_ha_entity_ids(str(area.get("id") or ""), False)
            out.append(
                AgentAreaSummary(
                    id=str(area.get("id") or ""),
                    name=str(area.get("name") or ""),
                    entities=[AgentAreaEntity(entity_id=eid) for eid in entity_ids],
                )
            )
        return out

    async def find_one(self, id_or_name: str) -> AgentAreaSummary | None:
        """按 ID 或名称查询单个房间及关联实体（名称匹配复用 find_all）。"""
        trimmed = str(id_or_name or "").strip()
        if not trimmed:
            return None

        all_areas = await self.find_all()
        lower = trimmed.lower()
        for area in all_areas:
            if area.id == trimmed:
                return area
        for area in all_areas:
            if area.name.lower() == lower:
                return area
        for area in all_areas:
            if lower in area.name.lower():
                return area
        return None

    async def _resolve_ha_entity_ids(self, ha_area_id: str, ensure: bool = True) -> list[str]:
        if ensure:
            await self._enrichment.ensure_loaded()
        # dict 保持插入顺序，对齐 Nest Set 的插入序（索引命中在前，状态存储补充在后）
        seen: dict[str, None] = dict.fromkeys(self._enrichment.get_entity_ids_by_area_id(ha_area_id))
        for entity in self._state_store.get_all():
            enriched = self._enrichment.enrich_entity_sync(entity)
            attributes = enriched.get("attributes")
            area_id = str((attributes or {}).get("area_id") or "").strip()
            entity_id = str(entity.get("entity_id") or "")
            if area_id == ha_area_id and entity_id and entity_id not in seen:
                seen[entity_id] = None
        return list(seen)


__all__ = ["AgentAreaEntity", "AgentAreaService", "AgentAreaSummary"]
