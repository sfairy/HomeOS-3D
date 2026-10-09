"""HA 实体同步过滤策略（对齐 ``shared/ha/entity-sync-filter.service.ts``）。

维护屏蔽实体 ID 集合（已禁用 / 已隐藏）与注册表加载状态：
- 由 HaConnector 在实体注册表加载后调用 ``configure`` 写入屏蔽集；
- StateStore / event-log / entities refresh 只读使用 ``is_entity_syncable`` 过滤。

采用共享内存视图，避免 StateStore 与 HaConnector 的双向依赖。当
``syncOnlyEnabledEntities`` 关闭时不过滤（全量同步）。
"""

from __future__ import annotations

from typing import Any


def filter_ha_entities_by_blocked_ids(
    entities: list[dict[str, Any]], blocked_ids: set[str]
) -> list[dict[str, Any]]:
    """按屏蔽集过滤（O(1) 查找）；屏蔽集为空时返回原列表。"""
    if not blocked_ids:
        return entities
    return [e for e in entities if e.get("entity_id") and e.get("entity_id") not in blocked_ids]


def build_blocked_entity_ids(
    rows: list[dict[str, Any]], display_hidden: set[str] | None = None
) -> set[str]:
    """从实体注册表构建屏蔽集（对齐 Nest ``rebuildBlockedIndex``）。

    ``disabled_by`` → 禁用；``hidden_by`` / ``hidden`` → 注册表隐藏；
    再补充 ``list_for_display`` 中尚未标记的「列表展示隐藏」实体。
    """
    blocked: set[str] = set()
    for entry in rows or []:
        entity_id = str((entry or {}).get("entity_id") or "")
        if not entity_id:
            continue
        if (entry or {}).get("disabled_by") or (entry or {}).get("hidden_by") or (entry or {}).get("hidden"):
            blocked.add(entity_id)
    for entity_id in display_hidden or set():
        blocked.add(entity_id)
    return blocked



class HaEntitySyncFilterService:
    """HA 实体同步过滤策略（共享内存视图）。"""

    def __init__(self) -> None:
        self._blocked_entity_ids: set[str] = set()
        self._sync_only_enabled_entities = False
        self._registry_loaded = False

    def configure(self, sync_only_enabled: bool, blocked: set[str], loaded: bool) -> None:
        """配置过滤策略（由 HaConnector 在注册表加载后调用）。"""
        self._sync_only_enabled_entities = bool(sync_only_enabled)
        self._blocked_entity_ids = set(blocked or set())
        self._registry_loaded = bool(loaded)

    def invalidate(self) -> None:
        """使过滤策略失效（注册表更新或断连时调用）。"""
        self._registry_loaded = False
        self._blocked_entity_ids.clear()

    def filter_syncable_states(self, entities: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """过滤可同步实体状态（短路：未开启 / 注册表未加载 / 屏蔽集为空）。"""
        if not self._sync_only_enabled_entities:
            return entities
        if not self._registry_loaded or not self._blocked_entity_ids:
            return entities
        return filter_ha_entities_by_blocked_ids(entities, self._blocked_entity_ids)

    def is_entity_syncable(self, entity_id: str) -> bool:
        """单个实体是否可同步（未开启 / 注册表未加载时默认放行）。"""
        if not self._sync_only_enabled_entities:
            return True
        if not self._registry_loaded:
            return True
        return entity_id not in self._blocked_entity_ids

    @property
    def sync_only_enabled(self) -> bool:
        return self._sync_only_enabled_entities

    def is_registry_loaded(self) -> bool:
        return self._registry_loaded

    def get_blocked_entity_ids(self) -> set[str]:
        """当前屏蔽集快照（供配置热更新时重推共享过滤视图）。"""
        return set(self._blocked_entity_ids)


__all__ = [
    "HaEntitySyncFilterService",
    "build_blocked_entity_ids",
    "filter_ha_entities_by_blocked_ids",
]
