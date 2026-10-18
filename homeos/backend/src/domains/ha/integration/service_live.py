"""常驻运行循环：取启用连接、全量同步、WebSocket 长连与指数退避重连。"""

from __future__ import annotations

import asyncio
import json
import time
import traceback
from typing import Any

from .live_events import (
    LIVE_EVENT_BATCH_WINDOW_MS,
    LiveStateEventQueue,
    live_state_change,
)
from .service_contract import HAConnectorHost
from .service_support import (
    DISCONNECT_REASON_HINTS,
    FAILURE_DISCONNECTED,
    FAILURE_UNEXPECTED,
    LIVE_EVENT_TYPES,
    LOGGER,
    OFFLINE_LOG_INTERVAL_SECONDS,
    classify_connector_failure,
    classify_disconnect_reason,
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
                # 原因分类与日志档位正交：决定重连提示里给用户什么建议（换令牌 / 等网络 / 改地址）。
                reason = classify_disconnect_reason(error)
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
                # 本轮实际等待时间：指数退避加抖动。墙屏、手机、家里多个 HomeOS 进程在同一个
                # HA 重启后往往同时重连，固定间隔会让它们每一轮都撞在一起（同刻 SYN、同刻超时）。
                delay = self._next_backoff(backoff)
                self._log_cycle_failure(error, kind, attempt, delay, first_of_kind, reason = reason)
                if connection_id:
                    await self._run_database(self._safe_record_error, connection_id, str(error))
                await asyncio.sleep(delay)
                await self._notify_connection('reconnecting', attempt = attempt, reason = reason)
                # 重连退避取自 haConnector（reconnectBaseMs / maxReconnectDelayMs），
                # 每次失败都重读，用户改参数后下一轮即生效。
                backoff = min(backoff * 2, self._reconnect_max_backoff())

    def _reset_failure_state(self) -> None:
        """连接真正建立后清空失败状态，下一次故障重新完整说明一次。"""
        self._failure_kind = None
        self._failure_logged_at = 0.0
        self._offline_since = None

    def _log_cycle_failure(
        self,
        error: BaseException,
        kind: str,
        attempt: int,
        delay: float,
        first_of_kind: bool,
        *,
        reason: str | None = None,
    ) -> None:
        """写一行重连失败摘要：断连 / 离线不打堆栈，同一原因按分钟限流。

        delay 是本轮实际等待秒数（已带抖动）；reason 是给用户的下一步建议。
        """
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
        delay_text = f'{delay:.0f} 秒' if delay >= 1 else f'{delay * 1000:.0f} 毫秒'
        if kind == FAILURE_DISCONNECTED:
            LOGGER.info('Home Assistant 断开了实时连接，%s后重连（第 %d 次）', delay_text, attempt)
            return
        # 认证失败重试一万次也不会成功、网络断了等着就好 —— 提示语必须不一样。
        hint = DISCONNECT_REASON_HINTS.get(reason) if reason else None
        suffix = f'。{hint}' if hint else ''
        summary = _safe_text(str(error), limit = 300).rstrip('。')
        # 端点汇总等文案自身已经点名 Home Assistant，这里只兜没有主语的短原因（超时、拒绝连接…）。
        headline = summary if 'Home Assistant' in summary else f'Home Assistant 连接失败：{summary}'
        if first_of_kind:
            LOGGER.warning('%s；%s后自动重连（第 %d 次）%s', headline, delay_text, attempt, suffix)
        else:
            elapsed = int(now - self._offline_since)
            LOGGER.warning('%s；已持续 %d 秒，仍在重试（第 %d 次）%s', headline, elapsed, attempt, suffix)

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

    def _next_backoff(self, backoff: float) -> float:
        """本轮重连等待秒数：指数退避乘 0.5~1.0 的抖动，上限仍由 maxReconnectDelayMs 封顶。

        抖动是刚需而不是美化：墙屏、手机、家里多个 HomeOS 进程常常在同一个 HA 重启后同时
        重连，固定间隔会让它们每一轮都撞在同一时刻（同刻 SYN、同刻超时），把恢复拖慢。
        抖动只向下取，因此等待时间永远不会超过配置的上限。
        """
        maximum = self._reconnect_max_backoff()
        jittered = min(backoff, maximum) * self._jitter_random.uniform(0.5, 1.0)
        return min(max(jittered, 0.05), maximum)

    def _live_event_batch_window(self) -> float:
        """实时状态合并窗口秒数：haConnector.liveEventBatchWindowMs（默认 50ms，0 表示不合并）。"""
        connector = self._ha_tuning()['haConnector']
        raw = connector.get('liveEventBatchWindowMs')
        if raw is None:
            return LIVE_EVENT_BATCH_WINDOW_MS / 1000.0
        try:
            return max(int(raw), 0) / 1000.0
        except (TypeError, ValueError):
            return LIVE_EVENT_BATCH_WINDOW_MS / 1000.0

    async def _live_connection(self, connection_id: str) -> None:
        connection = await self._run_database(self._load_connection, connection_id)
        client = await self.client_for(connection)
        websocket = await client.connect_websocket()
        # 状态事件先合批再落地：HA 场景切换 / 全屋开关会一次推几十上百条 state_changed，
        # 逐条各开一次数据库事务 + 逐条广播，读写两端都会被放大成卡顿。
        events = LiveStateEventQueue(
            lambda changes: self._flush_live_state_changes(connection_id, changes),
            window_seconds = self._live_event_batch_window(),
        )
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
            events.start()
            for message in buffered_events:
                await self._dispatch_live_event(events, connection_id, message)
            reconcile_at = time.monotonic() + self.settings.ha_reconcile_interval_seconds
            while True:
                wait_seconds = max(0.1, reconcile_at - time.monotonic())
                try:
                    raw_message = await asyncio.wait_for(websocket.recv(), timeout = wait_seconds)
                except TimeoutError:
                    await self.sync_once(connection_id, reconciled = True)
                    reconcile_at = time.monotonic() + self.settings.ha_reconcile_interval_seconds
                    continue
                await self._dispatch_live_event(events, connection_id, json.loads(raw_message))
                if time.monotonic() >= reconcile_at:
                    await self.sync_once(connection_id, reconciled = True)
                    reconcile_at = time.monotonic() + self.settings.ha_reconcile_interval_seconds
        finally:
            self._connected = False
            # 断开前把已收到但还没落地的变化冲出去：最后一帧也要进读模型与广播。
            await events.aclose()
            await self._notify_connection('disconnected')
            await websocket.close()

    async def _dispatch_live_event(self, events: LiveStateEventQueue, connection_id: str, message: dict[str, Any]) -> None:
        """分派一条 WS 消息：state_changed 进合并队列，其余事件保持即时处理。"""
        change = live_state_change(message)
        if change is None:
            await self._handle_live_event(connection_id, message)
            return
        entity_id = str(change.get('entity_id') or change.get('removed_entity_id') or '')
        events.enqueue(change, entity_id = entity_id or None)

    async def _flush_live_state_changes(self, connection_id: str, changes: list[dict[str, Any]]) -> None:
        """把一批合并后的状态变化落地。

        外发仍逐条：监听器契约（kind=change，载荷含 entity_id / old_state / new_state /
        time_fired）不变，homeos 读模型与 socket.io 广播的语义与逐条路径完全一致；
        数据库写入与目录计数则按批处理 —— 一批一次事务、最多一次 catalog_counts。
        """
        states: list[dict[str, Any]] = []
        removed_entity_ids: list[str] = []
        for change in changes:
            removed_entity_id = str(change.get('removed_entity_id') or '')
            if removed_entity_id:
                removed_entity_ids.append(removed_entity_id)
            new_state = change.get('new_state')
            await self._notify_state('change', {
                'entity_id': change.get('entity_id'),
                'old_state': change.get('old_state'),
                'new_state': new_state,
                'time_fired': change.get('time_fired'),
            })
            if isinstance(new_state, dict):
                states.append(new_state)
        watched = await self.watched_entity_ids()
        for new_state in states:
            if str(new_state.get('entity_id') or '') in watched:
                await self.state_hub.update(new_state)
        for removed_entity_id in removed_entity_ids:
            await self.state_hub.remove(removed_entity_id)
        if not states:
            return
        catalog_changed = await self._run_database(self._apply_incremental_states, connection_id, states)
        if catalog_changed:
            await self.state_hub.publish({
                'type': 'entity_catalog_changed',
                'operation': 'added',
                'counts': await self._run_database(self.catalog_counts, connection_id) })

    async def _handle_live_event(self, connection_id: str, message: dict[str, Any]) -> None:
        """非状态类事件（三类注册表变更）的即时处理。"""
        if message.get('type') != 'event':
            return
        event = message.get('event') or { }
        event_type = event.get('event_type')
        event_data = event.get('data') or { }
        if event_type in {'entity_registry_updated', 'device_registry_updated', 'area_registry_updated'}:
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
