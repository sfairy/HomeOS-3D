"""实时连接与快照：WebSocket 生命周期、事件分派与整表快照
"""
# pyright: reportUninitializedInstanceVariable=false
# 本模块是混入类（mixin）：属性由宿主类 HAConnectorService 提供，下面只用
# TYPE_CHECKING 契约向类型检查器声明，因此必然「有声明、不在本文件初始化」。
# 这是该规则设计之外的场景，按文件关闭；其它文件仍受该规则保护。
from __future__ import annotations

import asyncio
import json
import time
import traceback
from typing import TYPE_CHECKING, Any

from sqlalchemy import select

from .client import HAClient, HASnapshot, is_transient_disconnect
from .contracts import (
    HA_ENDPOINT_PROBE_TIMEOUT_SECONDS,
    LIVE_EVENT_TYPES,
    LOGGER,
)
from .endpoints import HAEndpoint
from ..core.ha_url import HAClientError
from ..core.models import HAArea, HAConnection, HADevice, HAEntity, HASyncState
from ..core.time_utils import utc_now
from ..observability.global_log import _safe_text

if TYPE_CHECKING:
    # Mixin 契约：HALiveMixin 不持有这些属性，由 host 类 HAConnectorService 提供。
    # 在类型检查期声明契约，让 self.<attr> 的访问能被识别；运行期不影响。
    from .state_hub import StateHub
    from ..config import Settings
    from ..core.database import Database


#: 同一个失败原因连续出现时，摘要日志的最小续报间隔（秒）。
#: 刻意大于重连退避上限（60s）：否则退避到达上限后每次重试都会补一行，又变成刷屏。
#: 这个间隔只决定「还在重试」的心跳频率，不丢失任何信息（原因变化仍会立刻完整重记）。
CYCLE_FAILURE_RELOG_SECONDS = 300


class HALiveMixin:
    """实时连接与快照：WebSocket 生命周期、事件分派与整表快照"""

    if TYPE_CHECKING:
        # 以下属性/方法均由 HAConnectorService（host 类）提供，详见 ha/service.py。
        settings: Settings
        database: Database
        state_hub: StateHub
        _connected: bool
        _runtime_error: str | None
        _known_entity_ids: set[tuple[str, str]]
        _failure_signature: str | None
        _failure_count: int
        _failure_logged_at: float

        def _log_event(self, level: str, category: str, message: str, *, details: str | None = None) -> None: ...
        def _safe_record_error(self, connection_id: str, message: str) -> None: ...
        def _load_connection(self, connection_id: str) -> HAConnection: ...
        def invalidate_endpoint(self) -> None: ...
        def active_connection(self) -> HAConnection | None: ...
        def catalog_counts(self, connection_id: str) -> dict[str, int]: ...
        def _schedule_registry_refresh(self, connection_id: str) -> None: ...
        def _apply_incremental_state(self, connection_id: str, raw_state: dict[str, Any]) -> bool: ...
        def _apply_registry_event(self, connection_id: str, event_type: str, event_data: dict[str, Any]) -> str | None: ...
        def _apply_registry_snapshot(self, connection_id: str, entities: list[dict[str, Any]] | None, devices: list[dict[str, Any]] | None, areas: list[dict[str, Any]] | None) -> dict[str, int] | None: ...
        def _record_error(self, connection_id: str, message: str) -> None: ...
        def _mark_connected(self, connection_id: str) -> None: ...
        @staticmethod
        def _device_registry_metadata(item: dict) -> str: ...
        @staticmethod
        def _status(disabled_by: str | None) -> str: ...
        async def _run_database(self, operation: Any, *args: Any, **kwargs: Any) -> Any: ...
        async def client_for(self, connection: HAConnection) -> HAClient: ...
        async def refresh_persistent_entity_ids(self, *, ensure_states: bool = True) -> set[str]: ...
        async def sync_once(self, connection_id: str | None = None, reconciled: bool = False) -> dict[str, int]: ...
        async def watched_entity_ids(self) -> set[str]: ...

    async def _probe_endpoint(self, connection: HAConnection, endpoint: HAEndpoint, token: str) -> None:
        """探一次端点是否可用（REST /api/config，带令牌）。不可用则抛 HAClientError。
        """
        await HAClient(
            endpoint.base_url,
            token,
            verify_tls = endpoint.verify_tls,
            timeout = HA_ENDPOINT_PROBE_TIMEOUT_SECONDS,
            websocket_max_size_bytes = self.settings.ha_websocket_max_size_bytes,
        ).test_connection()

    def _log_cycle_failure(self, error: BaseException) -> None:
        """按「同因去重」记一次连接周期失败。

        内网/外网都连不上属于运维态而非代码缺陷，而且往往持续很久。若每轮重试都打一遍
        完整堆栈，终端会被同一段文字刷屏，真正的新问题反而被埋掉。这里的口径：
        - 失败原因变化时立刻完整记一次，转折点不会被漏掉；
        - 同一原因连续失败则静默到 DEBUG，每隔 CYCLE_FAILURE_RELOG_SECONDS 续报一行摘要，
          保留「仍在重试」的可见性；
        - 预期内的 HAClientError 不带堆栈（堆栈只是重复调用链，读不出额外信息）；
          意外异常仍带堆栈，便于定位真实缺陷。
        """
        # 压成一行：错误里可能带换行，多行会破坏「一条日志一行」的聚合。
        reason = _safe_text(' '.join(str(error).split()), limit = 2000)
        now = time.monotonic()
        if reason != self._failure_signature:
            # 原因变了（或本轮首次失败）：完整记一次，转折点不能被去重吞掉。
            self._failure_signature = reason
            self._failure_count = 1
            self._failure_logged_at = now
            if isinstance(error, HAClientError):
                LOGGER.error('HA 连接周期失败：%s', reason)
            else:
                LOGGER.error(
                    'HA 连接周期失败（意外异常，附堆栈）：%s\n%s',
                    reason,
                    _safe_text(traceback.format_exc(), limit = 12000),
                )
            return
        self._failure_count += 1
        if now - self._failure_logged_at >= CYCLE_FAILURE_RELOG_SECONDS:
            self._failure_logged_at = now
            LOGGER.warning('HA 连接仍失败（已连续 %s 次）：%s', self._failure_count, reason)
        else:
            LOGGER.debug('HA 连接仍失败（第 %s 次）：%s', self._failure_count, reason)

    def _reset_failure_streak(self) -> None:
        """成功一轮后清空失败记账：下次再失败要重新完整记一次。"""
        self._failure_signature = None
        self._failure_count = 0

    async def _run(self) -> None:
        """连接器主循环：连接 → 全量同步 → 长连收事件 → 断开后重连。
        """
        backoff = 1
        while True:
            connection_id = None
            established = False
            try:
                connection = await self._run_database(self.active_connection)
                if connection is None:
                    # 还没配置 / 已停用连接：固定 3 秒轮询，用户在设置页保存后不用重启也能自动接上。
                    self._connected = False
                    await asyncio.sleep(3)
                    continue
                connection_id = connection.id
                # 先按草稿刷新关注列表（ensure_states=False：随后的快照会带上状态）。
                await self.refresh_persistent_entity_ids(ensure_states = False)
                await self.sync_once(connection_id)
                established = True
                await self._live_connection(connection_id)
                # 长连正常结束（对端关闭）也算一次成功周期，重置退避。
                backoff = 1
                self._reset_failure_streak()
            except asyncio.CancelledError:
                # 必须原样抛出：stop() 依赖它来结束这个任务。
                raise
            except Exception as error:
                self._connected = False
                self._runtime_error = str(error)
                # 失败就丢掉端点结论：内网不通要能退到外网、外网不通要能回到内网，
                self.invalidate_endpoint()
                # 已经连上之后才断的链路（心跳超时 / 对端重启 / TCP 被掐）按 warning 记：
                transient = established and is_transient_disconnect(error)
                if transient:
                    self._log_event('warning', '连接', f'Home Assistant 连接已断开，正在重连：{error}')
                    LOGGER.warning('HA 实时链路已断开，正在重连：%s', _safe_text(str(error), limit = 2000))
                else:
                    self._log_event('error', '连接', f'Home Assistant 连接异常：{error}', details = traceback.format_exc())
                    self._log_cycle_failure(error)
                if connection_id:
                    await self._run_database(self._safe_record_error, connection_id, str(error))
                await asyncio.sleep(backoff)
                backoff = min(backoff * 2, 60)
    async def _live_connection(self, connection_id: str) -> None:
        """建立实时连接并持续处理事件，直到连接断开。
        """
        connection = await self._run_database(self._load_connection, connection_id)
        client = await self.client_for(connection)
        websocket = await client.connect_websocket()
        try:
            # 只有 state_changed 必需；注册表事件订阅失败不应因此断掉整条实时链路。
            buffered_events = await client.subscribe_events(websocket, LIVE_EVENT_TYPES, required_event_types={'state_changed'})
            await self._run_database(self._mark_connected, connection_id)
            self._connected = True
            self._runtime_error = None
            self._log_event('success', '连接', '已连接 Home Assistant，实时状态同步正常')
            # 订阅确认期间到达的事件按到达顺序先处理，早于随后的循环处理。
            for message in buffered_events:
                await self._handle_live_event(connection_id, message)
            reconcile_at = time.monotonic() + self.settings.ha_reconcile_interval_seconds
            while True:
                # 下限 0.1 秒，防止已过对账时刻时 wait_for 收到 0/负数而忙循环。
                wait_seconds = max(0.1, reconcile_at - time.monotonic())
                try:
                    raw_message = await asyncio.wait_for(websocket.recv(), timeout = wait_seconds)
                except TimeoutError:
                    # 空闲超时即对账时刻：没有事件也要做一次全量核对。
                    await self.sync_once(connection_id, reconciled = True)
                    reconcile_at = time.monotonic() + self.settings.ha_reconcile_interval_seconds
                    continue
                await self._handle_live_event(connection_id, json.loads(raw_message))
                # 事件密集时 TimeoutError 永不触发，每条消息后都要补一次对账时刻检查。
                if time.monotonic() >= reconcile_at:
                    await self.sync_once(connection_id, reconciled = True)
                    reconcile_at = time.monotonic() + self.settings.ha_reconcile_interval_seconds
        finally:
            # 无论正常断开还是抛异常，都先标记为未连接，让接口立刻反映状态。
            self._connected = False
            await websocket.close()
    async def _handle_live_event(self, connection_id: str, message: dict[str, Any]) -> None:
        """处理一条 HA 实时事件。
        """
        if message.get('type') != 'event':
            return
        event = message.get('event') or { }
        event_type = event.get('event_type')
        event_data = event.get('data') or { }
        if event_type == 'state_changed':
            new_state = event_data.get('new_state')
            if isinstance(new_state, dict):
                entity_id = str(new_state.get('entity_id') or '')
                watched = await self.watched_entity_ids()
                if entity_id in watched:
                    await self.state_hub.update(new_state)
                known = (connection_id, entity_id) in self._known_entity_ids
                if not known and await self._run_database(self._apply_incremental_state, connection_id, new_state):
                    # 首次见到的实体才会改变目录计数，前端据此刷新实体选择器。
                    await self.state_hub.publish({
                        'type': 'entity_catalog_changed',
                        'operation': 'added',
                        'counts': await self._run_database(self.catalog_counts, connection_id) })
            else:
                # new_state 为 None 表示实体已被移除；此时 event_data 里只剩 entity_id。
                entity_id = str(event_data.get('entity_id') or '')
                if entity_id:
                    await self.state_hub.remove(entity_id)
        elif event_type in frozenset({'entity_registry_updated', 'device_registry_updated', 'area_registry_updated'}):
            operation = await self._run_database(self._apply_registry_event, connection_id, event_type, event_data)
            # operation 为 None 表示这条事件无需处理（例如 action 非法）。
            if operation:
                if event_type == 'entity_registry_updated':
                    action = str(event_data.get('action') or 'update')
                    entity_id = str(event_data.get('entity_id') or '')
                    raw_changes = event_data.get('changes')
                    changes = raw_changes if isinstance(raw_changes, dict) else { }
                    # HA 的 changes 放的是「变更前的旧值」，因此 entity_id 出现在这里
                    old_entity_id = str(changes.get('entity_id') or '')
                    removed_entity_ids = set()
                    if old_entity_id and old_entity_id != entity_id:
                        removed_entity_ids.add(old_entity_id)
                    if action == 'remove':
                        removed_entity_ids.add(entity_id)
                    elif 'disabled_by' in event_data:
                        # 兼容把新值内联在事件顶层的载荷。
                        if event_data.get('disabled_by'):
                            removed_entity_ids.add(entity_id)
                    elif 'disabled_by' in changes and changes.get('disabled_by') is None:
                        # changes 里 disabled_by 旧值为 None：原来是启用，现在被禁用，同样要移除。
                        removed_entity_ids.add(entity_id)
                    for removed_entity_id in sorted(removed_entity_ids - {''}):
                        await self.state_hub.remove(removed_entity_id)
                await self.state_hub.publish({
                    'type': 'entity_catalog_changed',
                    'operation': operation,
                    'counts': await self._run_database(self.catalog_counts, connection_id) })
                self._schedule_registry_refresh(connection_id)
    def _apply_snapshot(self, connection_id: str, snapshot: HASnapshot, reconciled: bool) -> dict[str, int]:
        """把一次全量快照写库，并标记「本次没出现的」实体 / 设备 / 区域为缺失。
        """
        now = utc_now()
        state_by_id = {
            str(item.get('entity_id')): item
            for item in snapshot.states
            if item.get('entity_id') }
        registry_by_id = {
            str(item.get('entity_id')): item
            for item in snapshot.entities or []
            if item.get('entity_id') }
        seen_entities = set(state_by_id) | set(registry_by_id)
        with self.database.session_factory() as database:
            existing_entities = {
                item.entity_id: item for item in database.scalars(select(HAEntity).where(HAEntity.connection_id == connection_id))}
            for entity_id in seen_entities:
                registry = registry_by_id.get(entity_id, { })
                state = state_by_id.get(entity_id, { })
                attributes = state.get('attributes') or { }
                record = existing_entities.get(entity_id)
                if record is None:
                    record = HAEntity(connection_id = connection_id, entity_id = entity_id, domain = entity_id.partition('.')[0])
                    database.add(record)
                record.domain = entity_id.partition('.')[0]
                if registry:
                    # 注册表是权威元数据来源：名称、图标、所属设备/区域都优先取它。
                    record.platform = registry.get('platform')
                    record.translation_key = registry.get('translation_key')
                    record.has_entity_name = registry.get('has_entity_name')
                    record.unique_id = registry.get('unique_id')
                    record.device_id = registry.get('device_id')
                    record.area_id = registry.get('area_id')
                    record.name = registry.get('name') or attributes.get('friendly_name') or registry.get('original_name')
                    record.original_name = registry.get('original_name')
                    record.icon = registry.get('icon') or attributes.get('icon')
                    record.disabled_by = registry.get('disabled_by')
                else:
                    # 没有注册表条目时退回状态里的运行时字段，只在库里还没名字时才写入（不覆盖用户改过的）。
                    record.name = record.name or attributes.get('friendly_name')
                    record.icon = attributes.get('icon') or record.icon
                record.sync_status = self._status(record.disabled_by)
                record.last_seen_at = now
                record.missing_since = None
            for entity_id, record in existing_entities.items():
                if entity_id in seen_entities:
                    continue
                if record.sync_status == 'missing':
                    # 已是 missing 就不刷新时间，让 missing_since 保持「首次发现消失」的语义。
                    continue
                record.sync_status = 'missing'
                record.missing_since = now
            existing_devices = {
                item.device_id: item for item in database.scalars(select(HADevice).where(HADevice.connection_id == connection_id))}
            # 快照为 None 时把已有记录全部视为「已见过」，一次接口失败不会清空设备目录。
            seen_devices = {
                device_id for device_id, item in existing_devices.items() if item.sync_status != 'missing'} if snapshot.devices is None else set()
            for item in snapshot.devices or []:
                device_id = str(item.get('id') or '')
                if not device_id:
                    continue
                seen_devices.add(device_id)
                record = existing_devices.get(device_id)
                if record is None:
                    record = HADevice(connection_id = connection_id, device_id = device_id)
                    database.add(record)
                record.name = item.get('name')
                record.name_by_user = item.get('name_by_user')
                record.registry_metadata_json = self._device_registry_metadata(item)
                record.manufacturer = item.get('manufacturer')
                record.model = item.get('model')
                record.area_id = item.get('area_id')
                record.disabled_by = item.get('disabled_by')
                record.sync_status = self._status(record.disabled_by)
                record.last_seen_at = now
                record.missing_since = None
            if snapshot.devices is not None:
                for device_id, record in existing_devices.items():
                    if device_id in seen_devices:
                        continue
                    if record.sync_status == 'missing':
                        continue
                    record.sync_status = 'missing'
                    record.missing_since = now
            existing_areas = {
                item.area_id: item for item in database.scalars(select(HAArea).where(HAArea.connection_id == connection_id))}
            seen_areas = {
                area_id for area_id, item in existing_areas.items() if item.sync_status != 'missing'} if snapshot.areas is None else set()
            for item in snapshot.areas or []:
                area_id = str(item.get('area_id') or item.get('id') or '')
                if not area_id:
                    continue
                seen_areas.add(area_id)
                record = existing_areas.get(area_id)
                if record is None:
                    record = HAArea(connection_id = connection_id, area_id = area_id, name = str(item.get('name') or area_id))
                    database.add(record)
                record.name = str(item.get('name') or area_id)
                record.aliases_json = json.dumps(item.get('aliases') or [], ensure_ascii = False)
                record.sync_status = 'active'
                record.last_seen_at = now
                record.missing_since = None
            if snapshot.areas is not None:
                for area_id, record in existing_areas.items():
                    if area_id in seen_areas:
                        continue
                    if record.sync_status == 'missing':
                        continue
                    record.sync_status = 'missing'
                    record.missing_since = now
            connection = database.get(HAConnection, connection_id)
            if connection:
                # ha_version 只在 HA 给出了新值时才覆盖，重连时取不到配置也不会清空。
                connection.ha_version = snapshot.config.get('version') or connection.ha_version
                connection.last_connected_at = now
                connection.last_error = None
            sync_state = database.get(HASyncState, connection_id) or HASyncState(connection_id = connection_id)
            sync_state.status = 'connected'
            sync_state.phase = None
            sync_state.last_completed_at = now
            sync_state.last_full_sync_at = now
            sync_state.catalog_revision = (sync_state.catalog_revision or 0) + 1
            if reconciled:
                sync_state.last_reconciled_at = now
            # 用「本次看见的」数量而非库里的 active 计数：快照刚写入，两者一致且不必再查库。
            sync_state.entity_count = len(seen_entities)
            sync_state.device_count = len(seen_devices)
            sync_state.area_count = len(seen_areas)
            sync_state.last_error = None
            database.add(sync_state)
            database.commit()
        # 内存中的「已知实体」按本连接整体重建，保证与刚提交的数据库状态一致。
        self._known_entity_ids = {
            key for key in self._known_entity_ids if key[0] != connection_id}
        self._known_entity_ids.update((connection_id, entity_id) for entity_id in seen_entities)
        return {
            'entities': len(seen_entities),
            'devices': len(seen_devices),
            'areas': len(seen_areas) }
