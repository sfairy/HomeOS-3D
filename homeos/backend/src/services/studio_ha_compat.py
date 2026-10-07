"""在并入的 3D ``HAConnectorService`` 之上，提供 homeos 既有 ``HaConnectorService`` 接口。

阶段 3 的目标是「单一 HA 连接 + 消费者改接新 HA 层」。homeos 有约 190 处消费者依赖
既有连接器的接口（``fetch_entities_by_domain`` / ``call_service`` / ``get_status`` /
``resync_from_ha`` / 实体与区域注册表 / 服务调用 …），逐一改写这些调用点成本高且易回归。
本适配器把这些接口**映射到 3D 的 HA 连接**上，于是：

- 事实来源：3D 的 ``HAConnectorService``（持有 ``StateHub``，维护 ``ha_connections`` /
  ``ha_entities`` / ``ha_devices`` / ``ha_areas`` 目录）——**不再有第二条 HA 连接**；
- 消费方：``app.state.ha_connector`` 指向本适配器，既有调用点保持原样即可工作；
- 状态读模型：连接器把全量快照与全量增量直接交给 homeos 状态监听写入 ``StateStore``。

因此「全量迁移」在这里落地为：**连接与写入面切到 3D，读取面保留 homeos 兼容接口**。
"""

from __future__ import annotations

import logging
from typing import Any

from sqlalchemy import select

from ..core.errors import BusinessException, ErrorCode, api_error
from ..core.models import HAConnection
from ..ha.client import HAClientError

logger = logging.getLogger("homeos.studio_ha_compat")


class StudioHAConnectorCompat:
    """把 3D ``HAConnectorService`` 包装成 homeos ``HaConnectorService`` 的接口形状。"""

    def __init__(self, connector: Any, database: Any, *, state_store: Any = None) -> None:
        self._connector = connector
        self._database = database
        self._store = state_store
        self._sync_filter: Any = None
        self._get_sync_only: Any = None
        self._event_bus: Any = None
        self._state_listener: Any = None

    @property
    def state_hub(self):
        """透出 3D 的 StateHub（部分消费方/端点直接读取）。"""
        return self._connector.state_hub

    @property
    def connected(self) -> bool:
        return bool(self._connector.connected)

    # ------------------------------------------------------------------ #
    # 生命周期：连接由 ``studio3d_plane`` 统一启停，这里只转发 stop。
    # ------------------------------------------------------------------ #
    async def start(self) -> None:  # pragma: no cover - 由平面统一启动
        return None

    async def stop(self) -> None:
        await self._connector.stop()

    async def restart(self) -> None:
        await self._connector.restart()

    # ------------------------------------------------------------------ #
    # 同步过滤 / 事件总线 / 状态监听（装配期注入，行为与 homeos 版一致）
    # ------------------------------------------------------------------ #
    def attach_sync_filter(self, sync_filter: Any, get_sync_only: Any) -> None:
        self._sync_filter = sync_filter
        self._get_sync_only = get_sync_only

    def attach_event_bus(self, event_bus: Any) -> None:
        self._event_bus = event_bus

    def set_state_listener(self, listener: Any) -> None:
        self._state_listener = listener

    def is_entity_syncable(self, entity_id: str) -> bool:
        if self._sync_filter is None:
            return True
        return bool(self._sync_filter.is_entity_syncable(entity_id))

    def filter_syncable_states(self, entities: list[dict[str, Any]]) -> list[dict[str, Any]]:
        if self._sync_filter is None:
            return entities
        return self._sync_filter.filter_syncable_states(entities)

    async def purge_non_syncable_from_state_store(self) -> int:
        """从读模型移除不可同步实体（注册表变更后的清理），并广播删除事件。"""
        if self._store is None or self._sync_filter is None:
            return 0
        purged = 0
        for entity in list(self._store.get_all()):
            entity_id = entity.get("entity_id")
            if not entity_id or self.is_entity_syncable(str(entity_id)):
                continue
            self._store.apply_change(str(entity_id), None)
            if self._event_bus is not None:
                try:
                    await self._event_bus.emit(
                        "ha.state_changed",
                        {"entity_id": str(entity_id), "old_state": entity, "new_state": None},
                    )
                except Exception as exc:  # noqa: BLE001
                    logger.debug("广播实体移除失败 %s: %s", entity_id, exc)
            purged += 1
        return purged

    async def handle_entity_registry_updated(self) -> None:
        if self._event_bus is not None:
            try:
                await self._event_bus.emit("ha.entity_registry_updated", {})
            except Exception as exc:  # noqa: BLE001
                logger.debug("广播 ha.entity_registry_updated 失败: %s", exc)
        await self.purge_non_syncable_from_state_store()

    async def dispatch_state_event(self, event: dict[str, Any]) -> None:
        """兼容入口：3D 连接器自行处理 WS 事件，这里转发给 homeos 状态监听（若已注册）。"""
        if self._state_listener is None:
            return
        result = self._state_listener("change", event)
        if hasattr(result, "__await__"):
            await result

    async def on_ws_connected(self) -> None:
        return None

    def on_ws_disconnected(self) -> None:
        return None

    # ------------------------------------------------------------------ #
    # 连接状态
    # ------------------------------------------------------------------ #
    def is_connected(self) -> bool:
        return self.connected

    def is_registry_degraded(self) -> bool:
        return not self.connected

    def get_registry_degraded_reason(self) -> str | None:
        return None if self.connected else "HA 未连接"

    def _status_dict(self) -> dict[str, Any]:
        base_url = ""
        try:
            base_url = self._connector.active_base_url or ""
        except Exception:  # noqa: BLE001 - 传输细节不可用时留空
            base_url = ""
        return {
            "connected": self.connected,
            "ha_url": base_url,
            "ha_version": getattr(self._connector, "ha_version", "") or "",
            "last_connected_at": getattr(self._connector, "last_connected_at", None),
            "reconnect_count": getattr(self._connector, "reconnect_count", 0),
            # 单实例部署：3D 连接器为唯一通道，始终视为 standalone / leader。
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
        with self._database.session_factory() as database:
            return database.scalar(
                select(HAConnection).where(HAConnection.is_active.is_(True))
            )

    async def _client(self):
        connection = self._active_connection()
        if connection is None:
            return None
        return await self._connector.client_for(connection)

    def _require_connected(self) -> None:
        if not self.connected:
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
        del request_id  # 请求 id 由 3D 客户端内部管理（REST 语义无对应概念）
        client = await self._client()
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

    async def _call_service_immediate(
        self,
        domain: str,
        service: str,
        entity_id: str,
        service_data: dict[str, Any] | None = None,
        return_response: bool | None = None,
    ) -> Any:
        return await self.call_service(
            domain, service, entity_id, service_data, return_response
        )

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
        client = await self._client()
        if client is None:
            return []
        return await client.fetch_all_states()

    async def fetch_entities_by_domain(self, domain: str) -> list[dict[str, Any]]:
        """按 HA 域筛选实体：优先读 ``StateHub`` 快照，空则回退全量拉取。"""
        prefix = f"{domain}."
        snapshot = await self._connector.state_hub.snapshot()
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
        client = await self._client()
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
        client = await self._client()
        if client is None:
            return []
        entities, _devices, _areas = await client.fetch_registries()
        return list(entities or [])

    async def fetch_area_registry(self) -> list[dict[str, Any]]:
        client = await self._client()
        if client is None:
            return []
        _entities, _devices, areas = await client.fetch_registries()
        return list(areas or [])

    async def request_registry(self, type_: str) -> list[dict[str, Any]]:
        client = await self._client()
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
        client = await self._client()
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
        self._require_connected()
        counts = await self._connector.sync_once(reconciled=True)
        store_count = self._store.get_count() if self._store is not None else 0
        return {
            "haCount": counts.get("entities", 0),
            "storeCount": store_count,
            "haSynced": True,
        }

    async def fetch_history(self, entity_ids: list[str], hours: int) -> Any:
        client = await self._client()
        if client is None:
            return []
        return await client.fetch_history(entity_ids, hours)

    async def test_ha_connection(self, url: str, token: str) -> dict[str, Any]:
        """兼容接口：3D 侧连接测试走 ``HAClient.test_connection``。"""
        from ..ha.client import HAClient

        client = HAClient(url, token)
        return await client.test_connection(include_temperature_unit=True)
