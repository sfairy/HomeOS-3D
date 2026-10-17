"""常驻运行循环：取启用连接、全量同步、WebSocket 长连与指数退避重连。"""

from __future__ import annotations

import asyncio
import json
import time
import traceback
from typing import Any

from .service_contract import HAConnectorHost
from .service_support import (
    LIVE_EVENT_TYPES,
    LOGGER,
)
from ...logs.global_log import _safe_text


class HALiveMixin(HAConnectorHost):
    """常驻运行循环：取启用连接、全量同步、WebSocket 长连与指数退避重连。"""

    async def _run(self) -> None:
        attempt = 0
        backoff = self._reconnect_base_backoff()
        # 重连期间只在「一轮全量同步成功之后」或「异常类型变了」时打完整堆栈：
        # HA 停机时每轮都打一次 12k 堆栈（退避封顶 10s ≈ 每分钟 6 条），把控制台刷满却
        # 没有新增信息。同一类故障的第二轮起降为一行摘要，堆栈仍由 _log_event 入库。
        failure_kind: str | None = None
        while True:
            connection_id = None
            try:
                connection = await self._run_database(self.active_connection)
                if connection is None:
                    self._connected = False
                    await asyncio.sleep(3)
                    continue
                connection_id = connection.id
                await self.refresh_persistent_entity_ids(ensure_states = False)
                await self.sync_once(connection_id)
                # 同步成功即视为已恢复：下一次失败重新给完整堆栈。
                failure_kind = None
                await self._live_connection(connection_id)
                backoff = self._reconnect_base_backoff()
                attempt = 0
            except asyncio.CancelledError:
                raise
            except Exception as error:
                self._connected = False
                self._runtime_error = str(error)
                self.invalidate_endpoint()
                attempt += 1
                await self._notify_connection('disconnected', error = str(error))
                self._log_event('error', '连接', f'Home Assistant 连接异常：{error}', details = traceback.format_exc())
                kind = type(error).__name__
                if kind == failure_kind:
                    LOGGER.warning('HA connector cycle failed (attempt %d): %s', attempt, _safe_text(str(error), limit = 500))
                else:
                    LOGGER.error('HA connector cycle failed\n%s', _safe_text(traceback.format_exc(), limit = 12000))
                    failure_kind = kind
                if connection_id:
                    await self._run_database(self._safe_record_error, connection_id, str(error))
                await asyncio.sleep(backoff)
                await self._notify_connection('reconnecting', attempt = attempt)
                # 重连退避取自 haConnector（reconnectBaseMs / maxReconnectDelayMs），
                # 每次失败都重读，用户改参数后下一轮即生效。
                backoff = min(backoff * 2, self._reconnect_max_backoff())

    def _reconnect_base_backoff(self) -> float:
        """首次重连等待秒数：haConnector.reconnectBaseMs（默认 1000ms）。"""
        connector = self._ha_tuning()['haConnector']
        try:
            return max(int(connector.get('reconnectBaseMs') or 0), 100) / 1000.0
        except (TypeError, ValueError):
            return 1.0

    def _reconnect_max_backoff(self) -> float:
        """退避上限秒数：haConnector.maxReconnectDelayMs（默认 10000ms），不小于起点。"""
        connector = self._ha_tuning()['haConnector']
        try:
            value = max(int(connector.get('maxReconnectDelayMs') or 0), 100) / 1000.0
        except (TypeError, ValueError):
            value = 10.0
        return max(value, self._reconnect_base_backoff())

    async def _live_connection(self, connection_id: str) -> None:
        connection = await self._run_database(self._load_connection, connection_id)
        client = await self.client_for(connection)
        websocket = await client.connect_websocket()
        try:
            buffered_events = await client.subscribe_events(websocket, LIVE_EVENT_TYPES, required_event_types={'state_changed'})
            await self._run_database(self._mark_connected, connection_id)
            self._connected = True
            self._runtime_error = None
            self._log_event('success', '连接', '已连接 Home Assistant，实时状态同步正常')
            await self._notify_connection(
                'connected', ha_version = getattr(connection, 'ha_version', None)
            )
            for message in buffered_events:
                await self._handle_live_event(connection_id, message)
            reconcile_at = time.monotonic() + self.settings.ha_reconcile_interval_seconds
            while True:
                wait_seconds = max(0.1, reconcile_at - time.monotonic())
                try:
                    raw_message = await asyncio.wait_for(websocket.recv(), timeout = wait_seconds)
                except TimeoutError:
                    await self.sync_once(connection_id, reconciled = True)
                    reconcile_at = time.monotonic() + self.settings.ha_reconcile_interval_seconds
                    continue
                await self._handle_live_event(connection_id, json.loads(raw_message))
                if time.monotonic() >= reconcile_at:
                    await self.sync_once(connection_id, reconciled = True)
                    reconcile_at = time.monotonic() + self.settings.ha_reconcile_interval_seconds
        finally:
            self._connected = False
            await self._notify_connection('disconnected')
            await websocket.close()

    async def _handle_live_event(self, connection_id: str, message: dict[str, Any]) -> None:
        if message.get('type') != 'event':
            return
        event = message.get('event') or { }
        event_type = event.get('event_type')
        event_data = event.get('data') or { }
        if event_type == 'state_changed' and isinstance(event_data, dict):
            # 全量增量转发给 homeos 状态监听：读模型与广播不能只覆盖 3D watched 子集。
            new_state = event_data.get('new_state')
            await self._notify_state('change', {
                'entity_id': (new_state or { }).get('entity_id') if isinstance(new_state, dict) else None,
                'old_state': event_data.get('old_state'),
                'new_state': new_state,
                'time_fired': event.get('time_fired'),
            })
        if event_type == 'state_changed':
            new_state = event_data.get('new_state')
            if isinstance(new_state, dict):
                entity_id = str(new_state.get('entity_id') or '')
                watched = await self.watched_entity_ids()
                if entity_id in watched:
                    await self.state_hub.update(new_state)
                known = (connection_id, entity_id) in self._known_entity_ids
                if not known and await self._run_database(self._apply_incremental_state, connection_id, new_state):
                    await self.state_hub.publish({
                        'type': 'entity_catalog_changed',
                        'operation': 'added',
                        'counts': await self._run_database(self.catalog_counts, connection_id) })
            else:
                entity_id = str(event_data.get('entity_id') or '')
                if entity_id:
                    await self.state_hub.remove(entity_id)
        elif event_type in {'entity_registry_updated', 'device_registry_updated', 'area_registry_updated'}:
            operation = await self._run_database(self._apply_registry_event, connection_id, event_type, event_data)
            if operation:
                if event_type == 'entity_registry_updated':
                    action = str(event_data.get('action') or 'update')
                    entity_id = str(event_data.get('entity_id') or '')
                    changes_value = event_data.get('changes')
                    changes = changes_value if isinstance(changes_value, dict) else { }
                    old_entity_id = str(changes.get('entity_id') or '')
                    removed_entity_ids = set()
                    if old_entity_id and old_entity_id != entity_id:
                        removed_entity_ids.add(old_entity_id)
                    if action == 'remove':
                        removed_entity_ids.add(entity_id)
                    elif 'disabled_by' in event_data:
                        if event_data.get('disabled_by'):
                            removed_entity_ids.add(entity_id)
                    elif 'disabled_by' in changes and changes.get('disabled_by') is None:
                        removed_entity_ids.add(entity_id)
                    for removed_entity_id in sorted(removed_entity_ids - {''}):
                        await self.state_hub.remove(removed_entity_id)
                await self.state_hub.publish({
                    'type': 'entity_catalog_changed',
                    'operation': operation,
                    'counts': await self._run_database(self.catalog_counts, connection_id) })
                self._schedule_registry_refresh(connection_id)
