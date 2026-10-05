"""HA 连接器服务（对齐 HaConnectorService 的核心能力，Phase 3）。

统一封装：
- WebSocket 通道（``HaWebSocketClient``）：服务调用、状态订阅、WebRTC 信令；
- REST 通道（``HaRestClient``）：WS 不可用 / 断连时的降级路径与媒体代理；
- 断连命令队列（``HaCommandQueue``）：非高危指令入队，重连后 flush；
- climate 调温自动补 ``turn_on``（所有联动路径共用）。

路由策略（对齐 call-service.helper.ts）：
1. WS 已连接 → ``callServiceImmediate``（WebSocket 即时调用，weather 预报失败回退 REST）；
2. WS 断连 → weather 预报走 REST；否则入队等待重连。
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any

from ..core.errors import BusinessException, ErrorCode, api_error
from .state_store.entity_sync_filter import build_blocked_entity_ids

logger = logging.getLogger("homeos.ha_connector")

#: HA 次要事件订阅（对齐 Nest bootstrap 的 subscribeToEntityRegistryUpdates /
#: subscribeToAutomationTriggered）：失败仅告警，不阻塞实时状态推送。
SECONDARY_HA_EVENTS = ("entity_registry_updated", "automation.triggered")

CLIMATE_SERVICES_NEED_ON = {
    "set_temperature",
    "set_hvac_mode",
    "set_fan_mode",
    "set_swing_mode",
    "set_preset_mode",
}


def climate_needs_auto_turn_on(
    domain: str, service: str, current_state: str | None, service_data: dict[str, Any] | None = None
) -> bool:
    if domain != "climate" or service not in CLIMATE_SERVICES_NEED_ON:
        return False
    state = str(current_state or "").strip().lower()
    if not state or state in ("unavailable", "unknown"):
        return False
    if service == "set_hvac_mode":
        mode = str((service_data or {}).get("hvac_mode") or "").lower()
        if mode == "off":
            return False
    return state == "off"


def _call_timeout_ms(domain: str, service: str, return_response: bool | None) -> int:
    if domain == "weather" and service == "get_forecasts":
        return 45_000
    if return_response:
        return 25_000
    return 10_000


def _iso_now() -> str:
    now = datetime.now(UTC)
    return now.strftime("%Y-%m-%dT%H:%M:%S.") + f"{now.microsecond // 1000:03d}Z"


class HaConnectorService:
    def __init__(self, ws_client, rest_client, *, state_store=None, command_queue=None) -> None:
        self._ws = ws_client
        self._rest = rest_client
        self._state_store = state_store
        self._queue = command_queue
        self._state_listener: Callable[[str, Any], Any] | None = None
        self._initial_sync_lock = asyncio.Lock()
        self._initial_states_ready = False
        self._started = False
        #: 实体同步过滤共享视图（HaEntitySyncFilterService）与开关读取器。
        self._sync_filter: Any = None
        self._get_sync_only: Callable[[], bool] | None = None
        #: 事件总线（用于广播 ha.entity_registry_updated / ha.automation.triggered）
        self._event_bus: Any = None

    # ------------------------------------------------------------------ #
    # 生命周期
    # ------------------------------------------------------------------ #
    def attach_event_bus(self, event_bus: Any) -> None:
        """注入事件总线（注册表变更 / 自动化回读事件外发）。"""
        self._event_bus = event_bus
    def set_state_listener(self, listener: Callable[[str, Any], Any]) -> None:
        """注册状态监听：listener('initial', states) / listener('change', event)。"""
        self._state_listener = listener

    def attach_sync_filter(self, sync_filter: Any, get_sync_only: Callable[[], bool]) -> None:
        """注入实体同步过滤共享视图与 ``haConnector.syncOnlyEnabledEntities`` 读取器。"""
        self._sync_filter = sync_filter
        self._get_sync_only = get_sync_only

    def is_entity_syncable(self, entity_id: str) -> bool:
        """委托同步过滤器；未注入时放行。"""
        if self._sync_filter is None:
            return True
        return bool(self._sync_filter.is_entity_syncable(entity_id))

    def filter_syncable_states(self, entities: list[dict[str, Any]]) -> list[dict[str, Any]]:
        if self._sync_filter is None:
            return entities
        return self._sync_filter.filter_syncable_states(entities)

    async def fetch_display_hidden_entity_ids(self) -> set[str]:
        """拉取「列表展示隐藏」实体集合（``config/entity_registry/list_for_display``）。"""
        if not self.is_connected():
            return set()
        try:
            result = await self._ws.send_request(
                "config/entity_registry/list_for_display", {}, 15_000
            )
        except Exception as exc:  # noqa: BLE001 - 接口不可用时返回空集
            logger.debug("列表展示接口不可用: %s", exc)
            return set()
        hidden: set[str] = set()
        entities = result.get("entities") if isinstance(result, dict) else None
        for row in entities or []:
            if isinstance(row, dict) and row.get("entity_id") and row.get("hidden"):
                hidden.add(str(row["entity_id"]))
        return hidden

    async def refresh_entity_sync_filter(self) -> None:
        """重建屏蔽索引并推送到共享过滤视图（对齐 Nest 注册表加载后的回调）。"""
        if self._sync_filter is None:
            return
        sync_only = bool(self._get_sync_only()) if self._get_sync_only is not None else False
        if not sync_only:
            self._sync_filter.configure(False, set(), False)
            return
        try:
            rows = await self.fetch_entity_registry()
        except Exception as exc:  # noqa: BLE001
            logger.warning("实体注册表拉取失败，同步过滤暂不生效: %s", exc)
            rows = []
        display_hidden = await self.fetch_display_hidden_entity_ids()
        blocked = build_blocked_entity_ids(rows, display_hidden)
        self._sync_filter.configure(True, blocked, bool(rows))


    async def start(self) -> None:
        if self._started:
            return
        self._started = True
        await self._ws.start()

    async def stop(self) -> None:
        await self._ws.stop()

    # ------------------------------------------------------------------ #
    # 状态
    # ------------------------------------------------------------------ #
    def is_connected(self) -> bool:
        return self._ws.is_connected()

    def is_initial_states_ready(self) -> bool:
        return self._initial_states_ready

    def get_status_snapshot(self) -> dict[str, Any]:
        """HA 连接状态快照（同步版，供健康评分等高频读取）。"""
        queue_length = 0
        dropped_total = 0
        if self._queue is not None:
            queue_length = self._queue.length()
            dropped_total = self._queue.dropped_total()
        return {
            "connected": self.is_connected(),
            "ha_url": self._rest._resolve().ha_url_primary,  # noqa: SLF001
            "ha_version": getattr(self._ws, "ha_version", ""),
            "last_connected_at": getattr(self._ws, "last_connected_at", None),
            "reconnect_count": getattr(self._ws, "reconnect_count", 0),
            "ha_ws_leader": True,
            "ha_ws_mode": "standalone",
            "queue_length": queue_length,
            "queue_dropped_total": dropped_total,
            "initialStatesReady": self._initial_states_ready,
        }

    async def get_status(self) -> dict[str, Any]:
        """HA 连接状态：连接 / 版本 / 重连次数 / Leader 模式 / 命令队列（对齐 Nest getStatus）。"""
        endpoints = self._rest._resolve()  # noqa: SLF001 - 与 Nest 状态口径一致
        queue_length = 0
        dropped_total = 0
        dropped_commands: list[dict[str, Any]] = []
        if self._queue is not None:
            queue_length = self._queue.length()
            dropped_commands = self._queue.get_dropped_recent()
            dropped_total = self._queue.dropped_total()
        return {
            "connected": self.is_connected(),
            "ha_url": endpoints.ha_url_primary,
            "ha_version": getattr(self._ws, "ha_version", ""),
            "last_connected_at": getattr(self._ws, "last_connected_at", None),
            "reconnect_count": getattr(self._ws, "reconnect_count", 0),
            # 单实例部署：始终为 Leader（standalone 模式）
            "ha_ws_leader": True,
            "ha_ws_mode": "standalone",
            "queue_length": queue_length,
            "queue_dropped_total": dropped_total,
            "dropped_commands": dropped_commands,
            "initialStatesReady": self._initial_states_ready,
        }

    def is_registry_degraded(self) -> bool:
        """HA 实体注册表是否处于降级状态（WS 不可用时按注册表快照处理）。"""
        return not self.is_connected()

    def get_registry_degraded_reason(self) -> str | None:
        return None if self.is_connected() else "HA 未连接"

    async def on_ws_connected(self) -> None:
        await self._ws.send_request("subscribe_events", {"event_type": "state_changed"}, 15_000)
        # 次要订阅（注册表变更 / 自动化触发回读）：与 Nest bootstrap 一致，
        # 失败不阻塞 live，相关能力待重连后生效。
        for event_type in SECONDARY_HA_EVENTS:
            try:
                await asyncio.wait_for(
                    self._ws.send_request("subscribe_events", {"event_type": event_type}, 15_000),
                    timeout=20,
                )
            except Exception as exc:  # noqa: BLE001
                logger.warning("%s 订阅失败（相关能力需重连后生效）: %s", event_type, exc)
        # 同步过滤屏蔽索引：连接后尽力重建（超时/失败不阻塞首推）。
        try:
            await asyncio.wait_for(self.refresh_entity_sync_filter(), timeout=45)
        except Exception as exc:  # noqa: BLE001
            logger.warning("实体同步过滤刷新失败（放行全量）: %s", exc)
        states = await self._ws.send_request("get_states", {}, 30_000)
        self._initial_states_ready = True
        if self._state_listener is not None and isinstance(states, list):
            result = self._state_listener("initial", states)
            if asyncio.iscoroutine(result):
                await result
        if self._queue is not None:
            try:
                await self._queue.flush()
            except Exception as exc:  # noqa: BLE001
                logger.warning("断连命令队列 flush 失败: %s", exc)

    async def dispatch_state_event(self, event: dict[str, Any]) -> None:
        """HA WS 全局事件入口：按 ``event_type`` 路由（状态变更 / 注册表 / 自动化）。"""
        event_type = event.get("event_type")
        if event_type == "entity_registry_updated":
            await self.handle_entity_registry_updated()
            return
        if event_type == "automation.triggered":
            await self._emit_automation_triggered(event)
            return
        if self._state_listener is None:
            return
        if event_type != "state_changed":
            return
        result = self._state_listener("change", event)
        if asyncio.iscoroutine(result):
            await result

    # ------------------------------------------------------------------ #
    # 实体注册表变更（对齐 Nest handleEntityRegistryUpdated）
    # ------------------------------------------------------------------ #
    async def handle_entity_registry_updated(self) -> None:
        """实体注册表变更：失效区域索引缓存 → 刷新同步过滤 → 清理不可同步实体。

        触发场景：用户在 HA 中分配/调整实体区域、隐藏或禁用实体。
        """
        if self._event_bus is not None:
            try:
                await self._event_bus.emit("ha.entity_registry_updated", {})
            except Exception as exc:  # noqa: BLE001 - 缓存失效失败不影响主流程
                logger.debug("广播 ha.entity_registry_updated 失败: %s", exc)
        sync_only = bool(self._get_sync_only()) if self._get_sync_only is not None else False
        if not sync_only:
            return
        try:
            await self.refresh_entity_sync_filter()
        except Exception as exc:  # noqa: BLE001
            logger.warning("注册表变更后刷新同步过滤失败: %s", exc)
        purged = await self.purge_non_syncable_from_state_store()
        if purged > 0:
            logger.info("实体注册表变更:已从状态缓存移除 %s 个禁用/隐藏实体", purged)

    async def purge_non_syncable_from_state_store(self) -> int:
        """从状态缓存中移除所有不可同步（禁用/隐藏）实体，并广播删除事件。

        对齐 Nest ``purgeNonSyncableFromStateStore``：以 ``new_state=null`` 的
        ``ha.state_changed`` 通知前端移除（走既有热路径 fan-out，含跨副本桥接）。
        """
        if self._state_store is None:
            return 0
        changed_at = _iso_now()
        purged = 0
        for entity in list(self._state_store.get_all()):
            entity_id = entity.get("entity_id")
            if not entity_id or self.is_entity_syncable(str(entity_id)):
                continue
            self._state_store.apply_change(str(entity_id), None, changed_at)
            if self._event_bus is not None:
                try:
                    await self._event_bus.emit(
                        "ha.state_changed",
                        {
                            "entity_id": str(entity_id),
                            "old_state": entity,
                            "new_state": None,
                            "changed_at": changed_at,
                        },
                    )
                except Exception as exc:  # noqa: BLE001
                    logger.debug("广播实体移除失败 %s: %s", entity_id, exc)
            purged += 1
        return purged

    async def _emit_automation_triggered(self, event: dict[str, Any]) -> None:
        """HA ``automation.triggered`` 回读：转换为 ``ha.automation.triggered`` 事件。"""
        if self._event_bus is None:
            return
        data = event.get("data") if isinstance(event.get("data"), dict) else {}
        payload = {
            "name": data.get("name") if isinstance(data.get("name"), str) else None,
            "entity_id": data.get("entity_id") if isinstance(data.get("entity_id"), str) else None,
            "source": data.get("source") if isinstance(data.get("source"), str) else None,
            "trigger": data.get("trigger"),
            "time_fired": event.get("time_fired") or _iso_now(),
        }
        try:
            await self._event_bus.emit("ha.automation.triggered", payload)
        except Exception as exc:  # noqa: BLE001
            logger.debug("广播 ha.automation.triggered 失败: %s", exc)

    def on_ws_disconnected(self) -> None:
        self._initial_states_ready = False

    # ------------------------------------------------------------------ #
    # 命令
    # ------------------------------------------------------------------ #
    async def _call_service_immediate(
        self,
        domain: str,
        service: str,
        entity_id: str,
        service_data: dict[str, Any] | None = None,
        return_response: bool | None = None,
    ) -> Any:
        message_id = self._ws.next_message_id()
        payload: dict[str, Any] = {
            "id": message_id,
            "type": "call_service",
            "domain": domain,
            "service": service,
            "target": {"entity_id": entity_id},
            "service_data": {**(service_data or {}), "entity_id": entity_id},
        }
        if return_response:
            payload["return_response"] = True
        timeout_ms = _call_timeout_ms(domain, service, return_response)

        if not self.is_connected():
            raise BusinessException(ErrorCode.SERVICE_UNAVAILABLE, api_error("HA_NOT_CONNECTED"))
        future: asyncio.Future = asyncio.get_running_loop().create_future()
        self._ws.add_pending_result(message_id, future, "call_service")
        sent = await self._ws.send_json(payload)
        if not sent:
            self._ws.delete_pending_result(message_id)
            raise BusinessException(ErrorCode.EXTERNAL_ERROR, api_error("HA_WS_REQUEST_FAILED"))
        try:
            return await asyncio.wait_for(future, timeout=timeout_ms / 1000)
        except TimeoutError as exc:
            self._ws.delete_pending_result(message_id)
            raise BusinessException(
                ErrorCode.EXTERNAL_ERROR, api_error("HA_CALL_SERVICE_TIMEOUT", domain, service)
            ) from exc
        finally:
            self._ws.delete_pending_result(message_id)

    def _rest_payload(
        self, entity_id: str, service_data: dict[str, Any] | None, return_response: bool
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {**(service_data or {}), "entity_id": entity_id}
        if return_response:
            payload["return_response"] = True
        return payload

    async def call_service(
        self,
        domain: str,
        service: str,
        entity_id: str,
        service_data: dict[str, Any] | None = None,
        return_response: bool | None = None,
        request_id: str | None = None,
    ) -> Any:
        fresh = await self._fresh_entity_state(entity_id)
        if climate_needs_auto_turn_on(domain, service, fresh, service_data):
            logger.info("温控自动开启: %s 当前 %s，先 turn_on 再执行 %s", entity_id, fresh, service)
            try:
                await self.call_service("climate", "turn_on", entity_id, {}, False, None)
            except Exception as exc:  # noqa: BLE001
                logger.warning("温控自动开启失败（继续原命令）: %s", exc)

        weather_forecast_rest = domain == "weather" and service == "get_forecasts" and bool(return_response)
        if not self.is_connected():
            if weather_forecast_rest:
                return await self.call_service_via_rest(
                    domain, service, entity_id, self._rest_payload(entity_id, service_data, True), 45_000
                )
            if self._queue is None:
                raise BusinessException(ErrorCode.SERVICE_UNAVAILABLE, api_error("HA_NOT_CONNECTED"))
            queued = await self._queue.enqueue(
                domain,
                service,
                entity_id,
                service_data,
                bool(return_response),
                ttl_ms=None if return_response else 5_000,
                request_id=request_id,
            )
            return {**(queued if isinstance(queued, dict) else {"result": queued}), "queued": True}

        if weather_forecast_rest:
            try:
                return await self._call_service_immediate(
                    domain, service, entity_id, service_data, return_response
                )
            except Exception as exc:  # noqa: BLE001
                logger.warning("天气预报 WS 失败，REST 回退: %s", exc)
                return await self.call_service_via_rest(
                    domain, service, entity_id, self._rest_payload(entity_id, service_data, True), 45_000
                )
        return await self._call_service_immediate(domain, service, entity_id, service_data, return_response)

    async def _fresh_entity_state(self, entity_id: str) -> str | None:
        if self._state_store is None:
            return None
        entity = self._state_store.get(entity_id)
        return str(entity.get("state")) if isinstance(entity, dict) and entity.get("state") is not None else None

    async def call_service_via_rest(
        self,
        domain: str,
        service: str,
        entity_id: str | None = None,
        payload: dict[str, Any] | None = None,
        timeout_ms: int = 10_000,
    ) -> Any:
        return await self._rest.call_service_via_rest(domain, service, entity_id, payload, timeout_ms)

    # ------------------------------------------------------------------ #
    # 队列 / 历史 / 注册表 / 媒体
    # ------------------------------------------------------------------ #
    def get_dropped_commands(self) -> list[dict[str, Any]]:
        return self._queue.get_dropped_recent() if self._queue is not None else []

    async def retry_dropped_commands(self) -> dict[str, int]:
        if self._queue is None:
            raise BusinessException(ErrorCode.SERVICE_UNAVAILABLE, api_error("HA_COMMAND_QUEUE_EMPTY"))
        return await self._queue.retry_dropped()

    async def fetch_history(self, entity_ids: list[str], hours: int) -> Any:
        return await self._rest.fetch_history(entity_ids, hours)

    async def fetch_entity_state(self, entity_id: str) -> dict[str, Any] | None:
        """拉取单个实体实时状态（对齐 Nest ``HaConnectorService.fetchEntityState``）。"""
        return await self._rest.fetch_entity_state(entity_id)

    async def resync_from_ha(self, timeout_ms: int = 120_000) -> dict[str, Any]:
        """重新拉取全量实体刷新 state-store（对齐 Nest ``requestStateResync``）。

        返回 ``{haCount, storeCount, haSynced}``；HA 未连接时抛 503。
        """
        if not self.is_connected():
            raise BusinessException(ErrorCode.SERVICE_UNAVAILABLE, api_error("HA_NOT_CONNECTED"))
        self._initial_states_ready = False
        try:
            states = await self._ws.send_request("get_states", {}, timeout_ms)
        except Exception as err:  # noqa: BLE001 - 统一转换为 503
            raise BusinessException(
                ErrorCode.SERVICE_UNAVAILABLE, api_error("HA_STATE_RESYNC_FAILED", str(err))
            ) from err
        if not isinstance(states, list):
            raise BusinessException(
                ErrorCode.SERVICE_UNAVAILABLE,
                api_error("HA_STATE_RESYNC_FAILED", api_error("HA_GET_STATES_INVALID_RESPONSE")),
            )
        if self._state_listener is not None:
            result = self._state_listener("initial", states)
            if asyncio.iscoroutine(result):
                await result
        return {
            "haCount": len(states),
            "storeCount": self._state_store.get_count() if self._state_store is not None else 0,
            "haSynced": (
                self._state_store.is_ha_synced()
                if self._state_store is not None
                else self._initial_states_ready
            ),
        }

    async def fetch_entity_registry(self) -> list[dict[str, Any]]:
        if self.is_connected():
            try:
                rows = await self._ws.send_request("config/entity_registry/list", {}, 15_000)
                if isinstance(rows, list):
                    return rows
            except Exception as exc:  # noqa: BLE001
                logger.warning("WS 获取实体注册表失败，REST 回退: %s", exc)
        return await self._rest.fetch_entity_registry()

    async def request_registry(self, type_: str) -> list[dict[str, Any]]:
        """通过 WS 拉取 HA 注册表（``config/area_registry/list`` 等）；未连接时返回空列表。"""
        if not self.is_connected():
            return []
        try:
            rows = await self._ws.send_request(type_, {}, 15_000)
        except Exception as exc:  # noqa: BLE001 - 注册表不可用不应影响主流程
            logger.debug("WS 获取注册表 %s 失败: %s", type_, exc)
            return []
        return rows if isinstance(rows, list) else []

    async def fetch_area_registry(self) -> list[dict[str, Any]]:
        """拉取 HA 区域注册表（``config/area_registry/list``）。"""
        return await self.request_registry("config/area_registry/list")

    async def update_entity_area(self, entity_id: str, area_id: str) -> None:
        """更新实体所属区域（HA ``config/entity_registry/update``；空 area_id → null）。"""
        if not self.is_connected():
            raise BusinessException(ErrorCode.SERVICE_UNAVAILABLE, api_error("HA_NOT_CONNECTED"))
        await self._ws.send_request(
            "config/entity_registry/update",
            {"entity_id": entity_id, "area_id": area_id or None},
            15_000,
        )

    async def fetch_all_states(self) -> list[dict[str, Any]]:
        if self.is_connected():
            try:
                states = await self._ws.send_request("get_states", {}, 30_000)
                if isinstance(states, list):
                    return states
            except Exception as exc:  # noqa: BLE001
                logger.warning("WS 获取全部状态失败，REST 回退: %s", exc)
        return await self._rest.fetch_all_states()

    async def fetch_entities_by_domain(self, domain: str) -> list[dict[str, Any]]:
        """按 HA 域筛选实体（对齐 Nest ``fetchEntitiesByDomain``）。

        优先读 L1 状态存储；为空时回退到 WS/REST 全量状态查询。
        """
        prefix = f"{domain}."
        if self._state_store is not None:
            cached = [
                entity
                for entity in self._state_store.get_all()
                if str(entity.get("entity_id") or "").startswith(prefix)
            ]
            if cached:
                return cached
        states = await self.fetch_all_states()
        return [
            entity
            for entity in states
            if str(entity.get("entity_id") or "").startswith(prefix)
        ]

    async def test_ha_connection(self, url: str, token: str) -> dict[str, Any]:
        return await self._rest.test_connection(url, token)

    async def fetch_media_image(self, path: str) -> tuple[bytes, str]:
        return await self._rest.fetch_media_image(path)

    def open_media_stream(self, path: str):
        return self._rest.open_media_stream(path)

    def _resolve(self):
        return self._rest._resolve()  # noqa: SLF001
