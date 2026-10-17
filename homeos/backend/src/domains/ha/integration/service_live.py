"""常驻运行循环：取启用连接、全量同步、WebSocket 长连与指数退避重连。"""

from __future__ import annotations

import asyncio
import json
import time
import traceback
from typing import Any

from .service_contract import HAConnectorHost
from .service_support import (
    FAILURE_DISCONNECTED,
    FAILURE_UNEXPECTED,
    LIVE_EVENT_TYPES,
    LOGGER,
    OFFLINE_LOG_INTERVAL_SECONDS,
    classify_connector_failure,
)
from ...logs.global_log import _safe_text


class HALiveMixin(HAConnectorHost):
    """常驻运行循环：取启用连接、全量同步、WebSocket 长连与指数退避重连。"""

    async def _run(self) -> None:
        attempt = 0
        backoff = self._reconnect_base_backoff()
        self._reset_failure_state()
        # HA 停机 / 网络切换 / 反代重启时，一轮轮重连失败是常态而不是故障：
        #   - 实时连接被对端关掉、地址连不上，控制台只留一行中文摘要，不打 12k 堆栈；
        #   - 同一个原因持续存在时每 OFFLINE_LOG_INTERVAL_SECONDS 秒才提示一次
        #     （退避封顶 10s ≈ 每分钟 6 轮，逐轮打会让控制台变成心跳）；
        #   - 只有意外异常才保留完整堆栈；堆栈始终由 _log_event 入库。
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
                await self._live_connection(connection_id)
                backoff = self._reconnect_base_backoff()
            except asyncio.CancelledError:
                raise
            except Exception as error:
                self._connected = False
                self._runtime_error = str(error)
                self.invalidate_endpoint()
                # 计数从「上一次真正连上」起算：断连后看到的是第 1 次重试，不再是进程启动
                # 以来的累计次数（那会让「第 87 次」这种数字失去意义）。
                attempt = 1 if self._failure_kind is None else attempt + 1
                await self._notify_connection('disconnected', error = str(error))
                kind = classify_connector_failure(error)
                first_of_kind = kind != self._failure_kind
                if first_of_kind and kind != FAILURE_DISCONNECTED:
                    # 只有原因变了才入库：同一种离线每 10s 记一条，日志页同样会被刷满，
                    # 而连接状态与 last_error 已由 _safe_record_error 每轮更新。正常断开不算异常，
                    # 恢复时那条「已连接」success 已经说明了整段经过。
                    self._log_event(
                        'error' if kind == FAILURE_UNEXPECTED else 'warning',
                        '连接',
                        f'Home Assistant 连接异常：{error}',
                        details = traceback.format_exc(),
                    )
                self._failure_kind = kind
                self._log_cycle_failure(error, kind, attempt, backoff, first_of_kind)
                if connection_id:
                    await self._run_database(self._safe_record_error, connection_id, str(error))
                await asyncio.sleep(backoff)
                await self._notify_connection('reconnecting', attempt = attempt)
                # 重连退避取自 haConnector（reconnectBaseMs / maxReconnectDelayMs），
                # 每次失败都重读，用户改参数后下一轮即生效。
                backoff = min(backoff * 2, self._reconnect_max_backoff())

    def _reset_failure_state(self) -> None:
        """连接真正建立后清空失败状态，下一次故障重新完整说明一次。"""
        self._failure_kind = None
        self._failure_logged_at = 0.0
        self._offline_since = None

    def _log_cycle_failure(self, error: BaseException, kind: str, attempt: int, backoff: float, first_of_kind: bool) -> None:
        """写一行重连失败摘要：断连 / 离线不打堆栈，同一原因按分钟限流。"""
        now = time.monotonic()
        if self._offline_since is None:
            self._offline_since = now
        within_window = now - self._failure_logged_at < OFFLINE_LOG_INTERVAL_SECONDS
        if kind == FAILURE_UNEXPECTED:
            # 意外异常保留堆栈，但同一类原因也只给一次：重复的堆栈对排障没有新增信息。
            if first_of_kind or not within_window:
                self._failure_logged_at = now
                LOGGER.error('Home Assistant 连接循环出现未预期异常\n%s', _safe_text(traceback.format_exc(), limit = 12000))
            else:
                LOGGER.debug('HA 连接重试失败（第 %d 次）：%s', attempt, error)
            return
        if not first_of_kind and within_window:
            LOGGER.debug('HA 连接重试失败（第 %d 次）：%s', attempt, error)
            return
        self._failure_logged_at = now
        delay = f'{backoff:.0f} 秒' if backoff >= 1 else f'{backoff * 1000:.0f} 毫秒'
        if kind == FAILURE_DISCONNECTED:
            LOGGER.info('Home Assistant 断开了实时连接，%s后重连（第 %d 次）', delay, attempt)
            return
        summary = _safe_text(str(error), limit = 300).rstrip('。')
        # 端点汇总等文案自身已经点名 Home Assistant，这里只兜没有主语的短原因（超时、拒绝连接…）。
        headline = summary if 'Home Assistant' in summary else f'Home Assistant 连接失败：{summary}'
        if first_of_kind:
            LOGGER.warning('%s；%s后自动重连（第 %d 次）', headline, delay, attempt)
        else:
            elapsed = int(now - self._offline_since)
            LOGGER.warning('%s；已持续 %d 秒，仍在重试（第 %d 次）', headline, elapsed, attempt)

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
            # 真正连上才算恢复：同步成功但 WebSocket 被反代挡住时，失败原因并没有变，
            # 不该因此每轮都重新打一遍完整说明。
            self._reset_failure_state()
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
