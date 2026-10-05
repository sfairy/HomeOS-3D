"""实体区域（Area）补全服务（对齐 ``state-store/entity-area-enrichment.service.ts`` 的后端子集）。

职责：
- 基于 HA entity_registry / area_registry / device_registry 构建 ``entity_id -> {area_id, area_name, device_id}`` 索引；
- 维护带 TTL 的 HA 区域列表（供 ``/system/config/public`` 的房间元信息使用）；
- 在实体对外暴露前注入 ``attributes.area_id / area_name / device_id``。

注册表拉取失败时静默降级为空索引，不影响主流程。
"""

from __future__ import annotations

import asyncio
import inspect
import logging
import time
from datetime import UTC, datetime
from typing import Any

logger = logging.getLogger("homeos.state_store.entity_area")

#: 区域索引缓存有效期（毫秒）。
ENTITY_AREA_CACHE_MS = 30_000

#: 公开配置等待区域索引的上限（毫秒），避免 HA 慢时卡登录。
PUBLIC_CONFIG_AREA_WAIT_MS = 2_000


def build_area_name_map(areas: list[dict[str, Any]]) -> dict[str, str]:
    out: dict[str, str] = {}
    for area in areas or []:
        area_id = str((area or {}).get("area_id") or "").strip()
        if not area_id:
            continue
        name = str((area or {}).get("name") or area_id).strip() or area_id
        out[area_id] = name
    return out


def build_device_area_map(devices: list[dict[str, Any]]) -> dict[str, str]:
    out: dict[str, str] = {}
    for device in devices or []:
        device_id = str((device or {}).get("device_id") or "").strip()
        area_id = str((device or {}).get("area_id") or "").strip()
        if device_id and area_id:
            out[device_id] = area_id
    return out


def build_entity_area_index(
    registry: list[dict[str, Any]],
    area_name_by_id: dict[str, str],
    device_area_by_id: dict[str, str] | None = None,
) -> dict[str, dict[str, str]]:
    device_area_by_id = device_area_by_id or {}
    index: dict[str, dict[str, str]] = {}
    for entry in registry or []:
        entity_id = str((entry or {}).get("entity_id") or "").strip()
        if not entity_id:
            continue
        device_id = str((entry or {}).get("device_id") or "").strip()
        area_id = str((entry or {}).get("area_id") or "").strip()
        if not area_id and device_id:
            area_id = str(device_area_by_id.get(device_id) or "").strip()
        if not area_id and not device_id:
            continue
        row: dict[str, str] = {
            "area_id": area_id,
            "area_name": area_name_by_id.get(area_id, area_id) if area_id else "",
        }
        if device_id:
            row["device_id"] = device_id
        index[entity_id] = row
    return index


def enrich_entity_areas(entity: dict[str, Any], index: dict[str, dict[str, str]]) -> dict[str, Any]:
    """用区域索引增强单个实体的 attributes（返回同一对象表示未变更）。"""
    from_registry = index.get(str(entity.get("entity_id") or ""))
    attributes = entity.get("attributes")
    attrs = attributes if isinstance(attributes, dict) else {}
    attr_id = str(attrs.get("area_id") or "").strip()
    attr_name = str(attrs.get("area_name") or "").strip()
    attr_device = str(attrs.get("device_id") or "").strip()

    if from_registry is not None:
        area_id = str(from_registry.get("area_id") or "").strip()
        area_name = str(from_registry.get("area_name") or area_id).strip()
        device_id = str(from_registry.get("device_id") or "").strip()
        area_ok = not area_id or (attr_id == area_id and attr_name == area_name)
        device_ok = not device_id or attr_device == device_id
        if area_ok and device_ok:
            return entity
        next_attrs = dict(attrs)
        if area_id:
            next_attrs["area_id"] = area_id
            next_attrs["area_name"] = area_name or area_id
        if device_id:
            next_attrs["device_id"] = device_id
        return {**entity, "attributes": next_attrs}

    if not attr_id and not attr_name:
        return entity
    area_id = attr_id or attr_name
    area_name = attr_name or attr_id
    if attr_id == area_id and attr_name == area_name:
        return entity
    return {**entity, "attributes": {**attrs, "area_id": area_id, "area_name": area_name}}


def enrich_entities_areas(
    entities: list[dict[str, Any]], index: dict[str, dict[str, str]]
) -> list[dict[str, Any]]:
    if not index:
        return entities
    changed = False
    next_entities: list[dict[str, Any]] = []
    for entity in entities:
        enriched = enrich_entity_areas(entity, index)
        if enriched is not entity:
            changed = True
        next_entities.append(enriched)
    return next_entities if changed else entities


class EntityAreaEnrichmentService:
    """HA 注册表 → 实体区域索引（带 TTL 缓存与并发去重）。"""

    def __init__(self, connector: Any, state_store: Any = None, event_bus: Any = None) -> None:
        self._connector = connector
        self._state_store = state_store
        self._event_bus = event_bus
        self._index: dict[str, dict[str, str]] = {}
        self._ha_areas: list[dict[str, str]] = []
        self._index_at = 0.0
        self._inflight: asyncio.Task[dict[str, dict[str, str]]] | None = None
        self._load_gen = 0

    # ------------------------------------------------------------------ #
    # 缓存
    # ------------------------------------------------------------------ #
    @property
    def cache_ttl_ms(self) -> int:
        return ENTITY_AREA_CACHE_MS

    def invalidate(self) -> None:
        self._index = {}
        self._ha_areas = []
        self._index_at = 0.0
        self._load_gen += 1
        self._inflight = None

    # ------------------------------------------------------------------ #
    # 事件处理器（对齐 Nest @OnEvent(HA_ENTITY_REGISTRY_UPDATED / INITIAL_STATES)）
    # ------------------------------------------------------------------ #
    def on_entity_registry_updated(self, _payload: Any = None) -> None:
        """实体注册表变更（分配区域 / 重命名 / 隐藏）→ 失效缓存并异步重建索引。"""
        self.invalidate()
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            return
        loop.create_task(self._reload_safely())

    async def _reload_safely(self) -> None:
        try:
            await self.ensure_loaded()
        except Exception:  # noqa: BLE001 - 注册表不可用不应影响主流程
            pass

    def on_initial_states(self, _payload: Any = None) -> None:
        """初始全量状态到达 → 后台对账 store 中各实体的区域信息。"""
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            return
        loop.create_task(self._reconcile_store_areas_safely())

    async def _reconcile_store_areas_safely(self) -> None:
        try:
            await self.reconcile_store_areas()
        except Exception as exc:  # noqa: BLE001
            logger.debug("初始状态区域对账失败: %s", exc)

    async def reconcile_store_areas(self) -> None:
        """按注册表索引对账 store 实体区域，仅对区域发生变化者补发状态变更。"""
        if self._state_store is None:
            return
        await self.ensure_loaded()
        if not self._index:
            return
        entity_ids = [
            str(entity.get("entity_id"))
            for entity in self._state_store.get_all()
            if entity.get("entity_id") and str(entity.get("entity_id")) in self._index
        ]
        if not entity_ids:
            return
        await self.publish_entity_area_updates(entity_ids)

    def bind_events(self) -> None:
        """订阅注册表变更 / 初始状态事件（app 生命周期装配时调用）。"""
        if self._event_bus is None:
            return
        self._event_bus.on("ha.entity_registry_updated", self.on_entity_registry_updated)
        self._event_bus.on("ha.initial_states", self.on_initial_states)

    def attach_event_bus(self, event_bus: Any) -> None:
        """注入事件总线并订阅（总线晚于本服务创建时使用）。"""
        self._event_bus = event_bus
        self.bind_events()

    async def ensure_loaded(self) -> dict[str, dict[str, str]]:
        if self._index and (time.monotonic() * 1000 - self._index_at) < self.cache_ttl_ms:
            return self._index
        if self._inflight is not None and not self._inflight.done():
            return await self._inflight
        task = asyncio.ensure_future(self._load_index())
        self._inflight = task

        def _clear(_: Any) -> None:
            if self._inflight is task:
                self._inflight = None

        task.add_done_callback(_clear)
        return await task

    def get_cached_ha_areas(self) -> list[dict[str, str]]:
        return [dict(area) for area in self._ha_areas]

    def has_index(self) -> bool:
        return bool(self._index)

    def get_entity_ids_by_area_id(self, area_id: str) -> list[str]:
        """返回某区域下的实体 ID（依赖 ensure_loaded 后的注册表索引）。"""
        ident = str(area_id or "").strip()
        if not ident or not self._index:
            return []
        return [
            entity_id
            for entity_id, info in self._index.items()
            if str(info.get("area_id") or "") == ident
        ]

    # ------------------------------------------------------------------ #
    # 加载
    # ------------------------------------------------------------------ #
    async def _load_index(self) -> dict[str, dict[str, str]]:
        gen = self._load_gen
        try:
            registry, areas, devices = await asyncio.gather(
                self._fetch_entity_registry(),
                self._fetch_registry("config/area_registry/list"),
                self._fetch_registry("config/device_registry/list"),
            )
            if gen != self._load_gen:
                return self._index
            area_name_by_id = build_area_name_map(areas)
            device_area_by_id = build_device_area_map(devices)
            self._ha_areas = [
                {
                    "id": str((area or {}).get("area_id") or ""),
                    "name": str((area or {}).get("name") or (area or {}).get("area_id") or ""),
                }
                for area in areas or []
            ]
            self._index = build_entity_area_index(registry, area_name_by_id, device_area_by_id)
            self._index_at = time.monotonic() * 1000
            if self._index:
                logger.info("实体区域索引已加载: %s 条", len(self._index))
        except Exception as exc:  # noqa: BLE001 - 注册表不可用不应影响主流程
            if gen != self._load_gen:
                return self._index
            logger.warning("实体区域索引加载失败: %s", exc)
            self._index = {}
            self._index_at = time.monotonic() * 1000
        return self._index

    async def _fetch_entity_registry(self) -> list[dict[str, Any]]:
        try:
            rows = await self._connector.fetch_entity_registry()
        except Exception as exc:  # noqa: BLE001
            logger.debug("拉取实体注册表失败: %s", exc)
            return []
        return rows if isinstance(rows, list) else []

    async def _fetch_registry(self, type_: str) -> list[dict[str, Any]]:
        try:
            rows = await self._connector.request_registry(type_)
        except Exception as exc:  # noqa: BLE001
            logger.debug("拉取 %s 失败: %s", type_, exc)
            return []
        return rows if isinstance(rows, list) else []

    # ------------------------------------------------------------------ #
    # 同步增强
    # ------------------------------------------------------------------ #
    def enrich_entity_sync(self, entity: dict[str, Any]) -> dict[str, Any]:
        if not self._index:
            return entity
        return enrich_entity_areas(entity, self._index)

    def enrich_entities_sync(self, entities: list[dict[str, Any]]) -> list[dict[str, Any]]:
        if not self._index:
            return entities
        return enrich_entities_areas(entities, self._index)

    async def enrich_entities(self, entities: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """异步补全（注册表慢时最多等 400ms，超时用已有索引，避免列表接口卡顿）。"""
        try:
            await asyncio.wait_for(self.ensure_loaded(), timeout=0.4)
        except TimeoutError:
            pass
        return enrich_entities_areas(entities, self._index)

    def enrich_state_change_event_sync(self, event: dict[str, Any]) -> dict[str, Any]:
        """同步补全状态变更事件中 new_state 的区域信息。"""
        new_state = event.get("new_state")
        if not new_state:
            return event
        enriched = self.enrich_entity_sync(new_state)
        if enriched is new_state:
            return event
        return {**event, "new_state": enriched}

    async def publish_entity_area_updates(self, entity_ids: list[str]) -> None:
        """对外广播指定实体的区域变更（分批比对 area_id/area_name 后补发变更）。"""
        if not entity_ids or self._state_store is None:
            return
        await self.ensure_loaded()
        changed_at = _iso_now()
        batch_size = 40
        for index in range(0, len(entity_ids), batch_size):
            batch = entity_ids[index : index + batch_size]
            self._publish_entity_area_batch(batch, changed_at)
            await asyncio.sleep(0)

    def _publish_entity_area_batch(self, entity_ids: list[str], changed_at: str) -> None:
        for entity_id in entity_ids:
            current = self._state_store.get(entity_id)
            if not current:
                continue
            enriched = self.enrich_entity_sync(current)
            current_attrs = current.get("attributes") if isinstance(current.get("attributes"), dict) else {}
            enriched_attrs = (
                enriched.get("attributes") if isinstance(enriched.get("attributes"), dict) else {}
            )
            before_id = str(current_attrs.get("area_id") or "").strip()
            before_name = str(current_attrs.get("area_name") or "").strip()
            after_id = str(enriched_attrs.get("area_id") or "").strip()
            after_name = str(enriched_attrs.get("area_name") or "").strip()
            if before_id == after_id and before_name == after_name:
                continue
            self._state_store.apply_change(entity_id, enriched, changed_at)
            self._emit_state_changed(
                {
                    "entity_id": entity_id,
                    "old_state": current,
                    "new_state": enriched,
                    "changed_at": changed_at,
                }
            )

    def _emit_state_changed(self, payload: dict[str, Any]) -> None:
        """从同步上下文广播状态变更（优先 emit_soon，回退到调度协程）。

        LocalEventBus.emit 是协程，直接调用会「coroutine never awaited」而丢失事件，
        因此必须走 emit_soon 或显式调度。
        """
        if self._event_bus is None:
            return
        emit_soon = getattr(self._event_bus, "emit_soon", None)
        if callable(emit_soon):
            emit_soon("ha.state_changed", payload)
            return
        emit = getattr(self._event_bus, "emit", None) or getattr(self._event_bus, "publish", None)
        if not callable(emit):
            return
        result = emit("ha.state_changed", payload)
        if inspect.isawaitable(result):
            try:
                asyncio.get_running_loop().create_task(result)
            except RuntimeError:
                pass


def _iso_now() -> str:
    now = datetime.now(UTC)
    return now.strftime("%Y-%m-%dT%H:%M:%S.") + f"{now.microsecond // 1000:03d}Z"


__all__ = [
    "ENTITY_AREA_CACHE_MS",
    "PUBLIC_CONFIG_AREA_WAIT_MS",
    "EntityAreaEnrichmentService",
    "build_area_name_map",
    "build_device_area_map",
    "build_entity_area_index",
    "enrich_entity_areas",
    "enrich_entities_areas",
]
