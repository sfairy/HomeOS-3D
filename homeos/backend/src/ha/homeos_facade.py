"""并入 HA 层之上的 homeos 兼容门面。

homeos 侧约 190 处消费者调用 ``HaConnectorService`` 形状的接口
（``fetch_entities_by_domain`` / ``call_service`` / ``get_status`` / ``resync_from_ha`` /
实体与区域注册表读写 …）：这些门面方法直接并入 ``HAConnectorService``（本 mixin），
于是 ``app.state.studio_ha`` 与 ``app.state.ha_connector`` 指向**同一个对象**，
消费点无需改名，也不再存在第二条 HA 连接、第二个状态源或第二跳转发。

设计要点（避免踩坑）：

- 本 mixin **不定义** ``connected`` / ``state_hub`` / ``start`` / ``stop`` / ``restart`` /
  ``set_state_listener`` / ``fetch_history``：连接器自身的实现按 MRO 优先，既不会覆盖
  活逻辑，也避免把 ``state_hub`` 这个**实例属性**变成 property —— 那会让连接器
  ``__init__`` 里的 ``self.state_hub = StateHub()`` 直接 ``AttributeError``。
- 装配期注入的三个钩子（``attach_sync_filter`` / ``attach_event_bus`` /
  ``attach_state_store``）在读取处用 ``getattr`` 兜底，因此无需改动连接器的 ``__init__``。
- 宿主成员（``database`` / ``state_hub`` / ``client_for`` / ``sync_once`` / ``connected`` /
  ``active_base_url``）一律经 ``_host`` 视图按 ``Any`` 访问：mixin 与宿主同体，若直接写
  ``self.database`` 会在 mixin 上找不到符号。装配期钩子（``_sync_filter`` 等）在类体给
  ``None`` 默认值，既满足 ``reportUninitializedInstanceVariable``，也让读取处不必再
  ``getattr`` 兜底。
- ``fetch_history`` 的旧适配器实现把 ``hours: int`` 当 ``start_time: str`` 传给了客户端
  （``filter_entity_id`` 收到 ``list``、``quote(6)`` 必抛 ``TypeError``），且全仓无人调用，
  故不再迁移；历史读取一律走连接器自身的 ``fetch_history(connection, entity_id,
  start_time, hours)``。
"""

from __future__ import annotations

import logging
from typing import Any

from sqlalchemy import select

from .client import HAClientError
from ..core.errors import BusinessException, ErrorCode, api_error
from ..core.models import HAConnection

logger = logging.getLogger("homeos.ha.facade")


class HomeOSFacadeMixin:
    """homeos 兼容门面：把既有调用面直接映射到本连接器（无第二跳）。"""

    # 装配期注入的钩子：类体给 ``None`` 默认值，满足
    # ``reportUninitializedInstanceVariable``（CI 硬门禁）；``attach_*`` 在 lifespan 里覆写。
    _sync_filter: Any = None
    _get_sync_only: Any = None
    _event_bus: Any = None
    _state_store: Any = None

    @property
    def _host(self) -> Any:
        """宿主视图：本 mixin 与 ``HAConnectorService`` 同体，宿主成员据此按 ``Any`` 访问。"""
        return self

    # ------------------------------------------------------------------ #
    # 装配期注入（app.py 在 lifespan 中调用）
    # ------------------------------------------------------------------ #
    def attach_sync_filter(self, sync_filter: Any, get_sync_only: Any) -> None:
        """注入实体同步过滤器。

        ``get_sync_only`` 维持签名兼容：原适配器也只存不用，读取面按实体粒度过滤。
        """
        self._sync_filter = sync_filter
        self._get_sync_only = get_sync_only

    def attach_event_bus(self, event_bus: Any) -> None:
        self._event_bus = event_bus

    def attach_state_store(self, state_store: Any) -> None:
        """注入 homeos 读模型：``resync_from_ha`` 回报 ``storeCount`` 需要它。"""
        self._state_store = state_store

    def _facade_sync_filter(self) -> Any:
        return self._sync_filter

    def is_entity_syncable(self, entity_id: str) -> bool:
        sync_filter = self._facade_sync_filter()
        if sync_filter is None:
            return True
        return bool(sync_filter.is_entity_syncable(entity_id))

    def filter_syncable_states(self, entities: list[dict[str, Any]]) -> list[dict[str, Any]]:
        sync_filter = self._facade_sync_filter()
        if sync_filter is None:
            return entities
        return sync_filter.filter_syncable_states(entities)

    # ------------------------------------------------------------------ #
    # 连接状态
    # ------------------------------------------------------------------ #
    def is_connected(self) -> bool:
        return bool(self._host.connected)

    def is_registry_degraded(self) -> bool:
        return not self.is_connected()

    def get_registry_degraded_reason(self) -> str | None:
        return None if self.is_connected() else "HA 未连接"

    def _status_dict(self) -> dict[str, Any]:
        try:
            base_url = self._host.active_base_url or ""
        except Exception:
            base_url = ""
        return {
            "connected": bool(self._host.connected),
            "ha_url": base_url,
            "ha_version": getattr(self._host, "ha_version", "") or "",
            "last_connected_at": getattr(self._host, "last_connected_at", None),
            "reconnect_count": getattr(self._host, "reconnect_count", 0),
            # 单实例部署：本连接器为唯一通道，始终视为 standalone / leader。
            "ha_ws_leader": True,
            "ha_ws_mode": "standalone",
        }

    def get_status_snapshot(self) -> dict[str, Any]:
        return self._status_dict()

    async def get_status(self) -> dict[str, Any]:
        return self._status_dict()

    # ------------------------------------------------------------------ #
    # 连接 / 客户端解析
    # ------------------------------------------------------------------ #
    def _active_connection(self) -> HAConnection | None:
        with self._host.database.session_factory() as database:
            return database.scalar(
                select(HAConnection).where(HAConnection.is_active.is_(True))
            )

    async def _facade_client(self) -> Any:
        connection = self._active_connection()
        if connection is None:
            return None
        return await self._host.client_for(connection)

    def _require_connected(self) -> None:
        if not self.is_connected():
            raise BusinessException(ErrorCode.SERVICE_UNAVAILABLE, api_error("HA_NOT_CONNECTED"))

    # ------------------------------------------------------------------ #
    # 服务调用
    # ------------------------------------------------------------------ #
    async def call_service(
        self,
        domain: str,
        service: str,
        entity_id: str,
        service_data: dict[str, Any] | None = None,
        return_response: bool | None = None,
        request_id: str | None = None,
    ) -> Any:
        del request_id  # 请求 id 由连接器内部管理（REST 语义无对应概念）
        client = await self._facade_client()
        if client is None:
            raise BusinessException(
                ErrorCode.SERVICE_UNAVAILABLE, api_error("HA_NOT_CONNECTED")
            )
        try:
            return await client.call_service(
                domain,
                service,
                entity_id,
                dict(service_data or {}),
                return_response=bool(return_response),
            )
        except HAClientError as exc:
            raise BusinessException(ErrorCode.EXTERNAL_ERROR, str(exc)) from exc

    async def call_service_via_rest(
        self,
        domain: str,
        service: str,
        entity_id: str | None = None,
        payload: dict[str, Any] | None = None,
        timeout_ms: int = 10_000,
    ) -> Any:
        del timeout_ms
        if entity_id is None:
            raise BusinessException(ErrorCode.VALIDATION_FAILED, "缺少实体 ID")
        data = dict(payload or {})
        # homeos 侧 ``_rest_payload`` 会把 ``return_response`` 塞进 payload（原生栈在那里把它
        # 挪到查询串）。这里同样取出，否则它会被当成 service_data 的多余键发给 HA 而 400。
        return_response = data.pop("return_response", False) is True
        return await self.call_service(domain, service, entity_id, data, return_response)

    # ------------------------------------------------------------------ #
    # 状态 / 注册表
    # ------------------------------------------------------------------ #
    async def fetch_all_states(self) -> list[dict[str, Any]]:
        client = await self._facade_client()
        if client is None:
            return []
        return await client.fetch_all_states()

    async def fetch_entities_by_domain(self, domain: str) -> list[dict[str, Any]]:
        """按 HA 域筛选实体：优先读 ``StateHub`` 快照，空则回退全量拉取。"""
        prefix = f"{domain}."
        snapshot = await self._host.state_hub.snapshot()
        cached = [
            entity
            for entity in (self._hub_to_raw(item) for item in snapshot)
            if entity is not None and str(entity.get("entity_id", "")).startswith(prefix)
        ]
        if cached:
            return cached
        states = await self.fetch_all_states()
        return [
            entity for entity in states if str(entity.get("entity_id", "")).startswith(prefix)
        ]

    @staticmethod
    def _hub_to_raw(item: dict[str, Any]) -> dict[str, Any] | None:
        entity_id = str(item.get("entityId") or "")
        if not entity_id:
            return None
        return {
            "entity_id": entity_id,
            "state": item.get("state", "unknown"),
            "attributes": item.get("attributes") or {},
            "last_changed": item.get("lastChanged"),
            "last_updated": item.get("updatedAt"),
        }

    async def fetch_entity_state(self, entity_id: str) -> dict[str, Any] | None:
        client = await self._facade_client()
        if client is None:
            return None
        try:
            states = await client.fetch_states({entity_id})
        except HAClientError:
            return None
        for state in states:
            if str(state.get("entity_id")) == entity_id:
                return state
        return None

    async def fetch_entity_registry(self) -> list[dict[str, Any]]:
        client = await self._facade_client()
        if client is None:
            return []
        entities, _devices, _areas = await client.fetch_registries()
        return list(entities or [])

    async def fetch_area_registry(self) -> list[dict[str, Any]]:
        client = await self._facade_client()
        if client is None:
            return []
        _entities, _devices, areas = await client.fetch_registries()
        return list(areas or [])

    async def request_registry(self, type_: str) -> list[dict[str, Any]]:
        client = await self._facade_client()
        if client is None:
            return []
        websocket = await client.connect_websocket()
        try:
            result = await client.command(websocket, 1, type_)
        except HAClientError:
            return []
        finally:
            await websocket.close()
        return list(result or []) if isinstance(result, list) else []

    async def update_entity_area(self, entity_id: str, area_id: str) -> None:
        self._require_connected()
        client = await self._facade_client()
        if client is None:
            raise BusinessException(
                ErrorCode.SERVICE_UNAVAILABLE, api_error("HA_NOT_CONNECTED")
            )
        websocket = await client.connect_websocket()
        try:
            await client.command(
                websocket,
                1,
                "config/entity_registry/update",
                entity_id=entity_id,
                area_id=area_id or None,
            )
        except HAClientError as exc:
            raise BusinessException(ErrorCode.EXTERNAL_ERROR, str(exc)) from exc
        finally:
            await websocket.close()

    async def resync_from_ha(self, timeout_ms: int = 120_000) -> dict[str, Any]:
        """重新同步 HA 全量目录/状态（对齐 homeos ``resync_from_ha`` 返回结构）。"""
        del timeout_ms
        self._require_connected()
        counts = await self._host.sync_once(reconciled=True)
        state_store = getattr(self, "_state_store", None)
        store_count = state_store.get_count() if state_store is not None else 0
        return {
            "haCount": counts.get("entities", 0),
            "storeCount": store_count,
            "haSynced": True,
        }

    # ------------------------------------------------------------------ #
    # WS 生命周期钩子（连接状态已由连接器自身维护，这里保留为兼容空实现）
    # ------------------------------------------------------------------ #
    async def on_ws_connected(self) -> None:
        return None

    def on_ws_disconnected(self) -> None:
        return None

    # ------------------------------------------------------------------ #
    # 连接测试
    # ------------------------------------------------------------------ #
    async def test_ha_connection(self, url: str, token: str) -> dict[str, Any]:
        """兼容接口：连接测试走 ``HAClient.test_connection``（不落库、不影响活跃连接）。"""
        from .client import HAClient

        client = HAClient(url, token)
        return await client.test_connection(include_temperature_unit=True)
