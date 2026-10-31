"""关注实体集合维护、全量同步与快照/增量落库、目录计数。"""

from __future__ import annotations

import asyncio
import json
import time
import traceback
from typing import Any

from sqlalchemy import (
    func,
    select,
    update,
)

from .client import (
    HAClientError,
    HASnapshot,
)
from .live_entities import build_state_seed
from .service_contract import HAConnectorHost
from .service_support import (
    INCREMENTAL_FLUSH_SECONDS,
    LOGGER,
    STATE_FETCH_RETRY_DELAYS,
    state_requires_fetch_retry,
)
from ..display_precision import apply_sensor_display_precision
from ...logs.global_log import _safe_text
from ...ui_config.global_popups import global_popups
from ....platform.core.db.models import (
    HAArea,
    HAConnection,
    HADevice,
    HAEntity,
    HASyncState,
    ProjectDraft,
    utc_now,
)
from ....platform.core.entity.entity_refs import document_entity_ids
from ....platform.core.runtime.observability import record_ha_counter, record_ha_sync_latency

#: 单次 ``IN (...)`` 参数上限：SQLite 旧版本变量上限 999，取 400 留出其余条件的位置。
_SQL_IN_CHUNK = 400


def _chunked(items: list[str], size: int = _SQL_IN_CHUNK) -> list[list[str]]:
    """把实体 id 列表切成若干块，供 ``IN (...)`` 使用。"""
    if len(items) <= size:
        return [items] if items else []
    return [items[index : index + size] for index in range(0, len(items), size)]


class HASyncMixin(HAConnectorHost):
    """关注实体集合维护、全量同步与快照/增量落库、目录计数。"""

    def _load_persistent_entity_ids(self) -> set[str]:
        result = set()
        with self.database.session_factory() as database:
            documents = database.scalars(select(ProjectDraft.document_json)).all()
            popup_document = {
                'customPopups': global_popups(database) }
            for document_json in documents:
                try:
                    document = json.loads(document_json)
                except (TypeError, ValueError):
                    continue
                result.update(document_entity_ids(document))
            result.update(document_entity_ids(popup_document))
        return result

    async def watched_entity_ids(self) -> set[str]:
        async with self._watch_lock:
            return set(self._persistent_entity_ids) | set(self._runtime_entity_watch_counts)

    async def refresh_persistent_entity_ids(self, *, ensure_states: bool = True) -> set[str]:
        next_ids = await self._run_database(self._load_persistent_entity_ids)
        async with self._watch_lock:
            added = next_ids - self._persistent_entity_ids
            self._persistent_entity_ids = next_ids
            retained = set(self._persistent_entity_ids) | set(self._runtime_entity_watch_counts)
        await self.state_hub.retain(retained)
        if ensure_states and added:
            await self.ensure_entity_states(added)
        return retained

    async def add_runtime_entity_watch(self, entity_ids: set[str], *, ensure_states: bool = True) -> None:
        normalized = {
            str(value) for value in entity_ids if str(value) }
        if not normalized:
            return
        async with self._watch_lock:
            self._runtime_entity_watch_counts.update(normalized)
        if ensure_states:
            await self.ensure_entity_states(normalized)

    async def remove_runtime_entity_watch(self, entity_ids: set[str]) -> None:
        normalized = {
            str(value) for value in entity_ids if str(value) }
        async with self._watch_lock:
            for entity_id in normalized:
                remaining = self._runtime_entity_watch_counts.get(entity_id, 0) - 1
                if remaining > 0:
                    self._runtime_entity_watch_counts[entity_id] = remaining
                    continue
                self._runtime_entity_watch_counts.pop(entity_id, None)
            retained = set(self._persistent_entity_ids) | set(self._runtime_entity_watch_counts)
        await self.state_hub.retain(retained)

    async def ensure_entity_states(self, entity_ids: set[str]) -> None:
        normalized = {
            str(entity_id) for entity_id in entity_ids if str(entity_id) }
        existing = {
            str(state.get('entityId') or ''): state
            for state in await self.state_hub.snapshot(normalized)
            if isinstance(state, dict) }
        pending = {
            entity_id
            for entity_id in normalized
            if state_requires_fetch_retry(entity_id, existing.get(entity_id)) }
        if not pending:
            return
        connection = await self._run_database(self.active_connection)
        if connection is None:
            return
        client = await self.client_for(connection)
        for index, delay in enumerate((0, *STATE_FETCH_RETRY_DELAYS)):
            if delay:
                await asyncio.sleep(delay)
            requested = set(pending)
            # track_fetch_changes 记录本轮请求期间 StateHub 自己发生的变更（事件推送等），
            # 交给 merge 判断「HA 返回的旧快照」能不能覆盖内存里更新的值。
            async with self.state_hub.track_fetch_changes(requested) as invalidated:
                try:
                    states = await client.fetch_states(requested)
                except HAClientError as error:
                    # 兜底：fetch_states 内部已逐实体容错，这里防的是连接级失败（如 Client 建连即失败）。
                    # 不能把异常抛到实时推送链路上（会拆掉整条 runtime WebSocket）；
                    # 按「本轮无数据」处理，下面的 returned 为空集，所有实体留在 pending 里退避重试。
                    # 重试期间只写 DEBUG，三轮都失败才给一行 WARNING：HA 掉线时每轮刷三行太吵。
                    if index == len(STATE_FETCH_RETRY_DELAYS):
                        LOGGER.warning(
                            '批量拉取实体状态失败，本轮已跳过（重试 %d 次后仍失败）：%s',
                            len(STATE_FETCH_RETRY_DELAYS),
                            error,
                        )
                    else:
                        LOGGER.debug('批量拉取实体状态失败，稍后重试：%s', error)
                    states = []
                await self.state_hub.merge(states, invalidated = invalidated)
            # 本轮「请求了但没返回」的实体 = 网络失败，或 HA 侧暂时还没有这个实体（404）。
            # 必须保留在 pending 里，否则 pending 被清空后立刻 break，退避重试（共 3 轮）
            # 一次都跑不到——正是「HA 刚启动 / 集成未就绪」最需要重试的时刻。
            # 注：本层无法区分「已删除」与「尚未注册」，两者都会重试；每实体最多 3 次请求，有界。
            returned = {str(state.get('entity_id') or '') for state in states}
            pending = {entity_id for entity_id in requested if entity_id not in returned}
            if states:
                # 重试判据必须基于「合并后」的状态：HA 刚返回的那份可能仍残缺。
                current = await self.state_hub.snapshot({
                    str(state.get('entity_id') or '') for state in states })
                pending.update(
                    entity_id
                    for state in current
                    if isinstance(state, dict) and
                    (entity_id := str(state.get('entityId') or '')) in requested and
                    # 只对本轮请求过、且拿回来仍残缺的实体继续重试。
                    state_requires_fetch_retry(entity_id, state))
            if not pending:
                break

    # 连接生命周期外发：homeos 侧（app.py）依赖它维护 ``app.state.ha_connected``
    # 与 ``ha.connected`` / ``ha.disconnected`` / ``ha.reconnecting`` 事件。
    # 融合后本连接器是唯一 HA 连接，所以它必须是「HA 是否在线」的唯一事实源。

    def schedule_reconcile(self, connection_id: str) -> None:
        """把一次周期对账排到后台，收包循环立即返回去读下一帧。

        实时链路的 SLA 由「recv 循环多快能把帧读出来」决定，而全量对账是最长的同步阻塞点
        （建连 + get_states + 注册表 + 大事务）。这里改成 fire-and-forget：

        - 同一时刻只允许一次对账在跑（重入直接跳过），避免慢对账排队堆积；
        - 失败只记日志，下一轮周期 / 下一条实时事件都会自然补上；
        - 停机时由 ``_stop_tasks`` 取消，不留下孤儿任务。
        """
        running = getattr(self, '_reconcile_task', None)
        if isinstance(running, asyncio.Task) and not running.done():
            return
        self._reconcile_task = asyncio.create_task(
            self._reconcile(connection_id), name = 'ha-reconcile'
        )

    async def _cancel_reconcile(self) -> None:
        """取消在途的周期对账（重连 / 停机前调用），避免它和新一轮同步互相等锁。"""
        reconcile = getattr(self, '_reconcile_task', None)
        self._reconcile_task = None
        if reconcile is None or reconcile.done():
            return
        reconcile.cancel()
        await asyncio.gather(reconcile, return_exceptions = True)

    async def _reconcile(self, connection_id: str) -> None:
        record_ha_counter('reconcile')
        try:
            await self.sync_once(connection_id, reconciled = True)
        except asyncio.CancelledError:
            raise
        except Exception:
            # 对账失败不是致命错误：连接仍然活着，内存状态仍在实时更新，
            # 下一轮（或下一次重连）会重新对账。这里只留 DEBUG，避免刷屏。
            LOGGER.debug('HA 周期对账失败，下一轮重试', exc_info = True)

    async def sync_once(self, connection_id: str | None = None, reconciled: bool = False) -> dict[str, int]:
        async with self._sync_lock:
            if connection_id:
                connection = await self._run_database(self._load_connection, connection_id)
            else:
                connection = await self._run_database(self.active_connection)
            if connection is None:
                raise HAClientError('请先配置 Home Assistant 连接。')
            await self._run_database(self._mark_sync_started, connection.id)
            started = time.monotonic()
            try:
                # 整段对账都在「变更追踪」窗口内：期间实时事件带来的状态更新会被记下，
                # 让 replace 知道哪些实体的内存值比这份快照新，从而不被旧值覆盖。
                async with self.state_hub.track_fetch_changes() as invalidated:
                    snapshot = await (await self.client_for(connection)).fetch_snapshot()
                    # 给 subscribe_entities 解码器留一份「刚同步过什么」的轻量基线：
                    # 重连后的首帧全量里，与它一致的实体不再重复派发，避免一次全屋广播。
                    self._live_seed = build_state_seed(snapshot.states)
                    counts = await self._run_database(self._apply_snapshot, connection.id, snapshot, reconciled = reconciled)
                    # homeos 读模型的全量来源：StateHub 只保留 3D「watched」实体
                    # （见 refresh_persistent_entity_ids 的 retain），拿不到全量；
                    # 所以全量直接交给 homeos 状态监听去 set_all。
                    await self._notify_state('initial', list(snapshot.states))
                    await self.refresh_persistent_entity_ids(ensure_states = False)
                    watched = await self.watched_entity_ids()
                    await self.state_hub.replace(
                        (
                            raw for raw in snapshot.states
                            if str(raw.get('entity_id') or '') in watched
                        ),
                        invalidated = invalidated)
                await self.state_hub.publish({
                    'type': 'entity_catalog_changed',
                    'operation': 'refreshed',
                    'counts': counts })
                if not self._initial_sync_logged:
                    await self._log_event('success', '实体同步', f'''实体目录同步完成：{counts.get('entities', 0)} 个实体、{counts.get('devices', 0)} 个设备、{counts.get('areas', 0)} 个区域''')
                    self._initial_sync_logged = True
                # 记录最近一次全量成功时刻：重连时据此决定能否跳过全量（fast reconnect）。
                self._last_full_sync_at = time.monotonic()
                record_ha_counter('full_sync')
                record_ha_sync_latency('full_sync', (self._last_full_sync_at - started) * 1000)
                return counts
            except Exception as error:
                await self._run_database(self._safe_record_error, connection.id, str(error))
                raise

    def _load_connection(self, connection_id: str) -> HAConnection:
        with self.database.session_factory() as database:
            connection = database.get(HAConnection, connection_id)
            if connection is None or not connection.is_active:
                raise HAClientError('Home Assistant 连接不存在或已停用。')
            database.expunge(connection)
            return connection

    def _mark_sync_started(self, connection_id: str) -> None:
        with self.database.session_factory() as database:
            state = database.get(HASyncState, connection_id) or HASyncState(connection_id = connection_id)
            state.status = 'syncing'
            state.phase = 'full_snapshot'
            state.last_started_at = utc_now()
            state.last_error = None
            database.add(state)
            database.commit()

    def _record_error(self, connection_id: str, message: str) -> None:
        safe_message = message[:2000]
        with self.database.session_factory() as database:
            connection = database.get(HAConnection, connection_id)
            if connection:
                connection.last_error = safe_message
            state = database.get(HASyncState, connection_id) or HASyncState(connection_id = connection_id)
            state.status = 'error'
            state.phase = None
            state.last_error = safe_message
            database.add(state)
            database.commit()

    def _safe_record_error(self, connection_id: str, message: str) -> None:
        try:
            self._record_error(connection_id, message)
        except Exception:
            LOGGER.error('Home Assistant 连接错误写入失败\n%s', _safe_text(traceback.format_exc(), limit = 12000))

    def _mark_connected(self, connection_id: str) -> None:
        with self.database.session_factory() as database:
            connection = database.get(HAConnection, connection_id)
            if connection:
                connection.last_connected_at = utc_now()
                connection.last_error = None
            state = database.get(HASyncState, connection_id)
            if state:
                state.status = 'connected'
                state.phase = None
                state.last_error = None
            database.commit()
        self._runtime_error = None

    @staticmethod

    def _device_registry_metadata(item: dict) -> str:
        return json.dumps({
            'integrations': sorted({
                value[0] for value in item.get('identifiers') or []
                if isinstance(value, (list, tuple)) and len(value) == 2 and isinstance(value[0], str)}),
            'configEntryIds': sorted({
                value for value in item.get('config_entries') or []
                if isinstance(value, str)}),
            'viaDeviceId': item.get('via_device_id'),
            'entryType': item.get('entry_type') }, ensure_ascii = False)

    @staticmethod

    def _status(disabled_by: str | None) -> str:
        return 'disabled' if disabled_by else 'active'

    def _sync_snapshot_entities(
        self,
        database,
        *,
        connection_id: str,
        seen_entities: set[str],
        state_by_id: dict[str, dict],
        registry_by_id: dict[str, dict],
        now,
    ) -> None:
        """按快照 upsert 实体并标记缺失。"""
        existing_entities = {
            entity.entity_id: entity
            for entity in database.scalars(select(HAEntity).where(HAEntity.connection_id == connection_id))
        }
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
                apply_sensor_display_precision(record, registry)
            else:
                record.name = record.name or attributes.get('friendly_name')
                record.icon = attributes.get('icon') or record.icon
            record.sync_status = self._status(record.disabled_by)
            record.last_seen_at = now
            record.missing_since = None
        for entity_id, record in existing_entities.items():
            if entity_id not in seen_entities:
                if record.sync_status != 'missing':
                    record.sync_status = 'missing'
                    record.missing_since = now

    def _sync_snapshot_devices(
        self,
        database,
        *,
        connection_id: str,
        snapshot: HASnapshot,
        now,
    ) -> set[str]:
        """按快照 upsert 设备并标记缺失，返回 seen_devices。"""
        existing_devices = {
            device.device_id: device
            for device in database.scalars(select(HADevice).where(HADevice.connection_id == connection_id))
        }
        seen_devices = {
            device_id for device_id, device in existing_devices.items() if device.sync_status != 'missing'
        } if snapshot.devices is None else set()
        for device_entry in snapshot.devices or []:
            device_id = str(device_entry.get('id') or '')
            if not device_id:
                continue
            seen_devices.add(device_id)
            record = existing_devices.get(device_id)
            if record is None:
                record = HADevice(connection_id = connection_id, device_id = device_id)
                database.add(record)
            record.name = device_entry.get('name')
            record.name_by_user = device_entry.get('name_by_user')
            record.registry_metadata_json = self._device_registry_metadata(device_entry)
            record.manufacturer = device_entry.get('manufacturer')
            record.model = device_entry.get('model')
            record.area_id = device_entry.get('area_id')
            record.disabled_by = device_entry.get('disabled_by')
            record.sync_status = self._status(record.disabled_by)
            record.last_seen_at = now
            record.missing_since = None
        if snapshot.devices is not None:
            for device_id, record in existing_devices.items():
                if device_id not in seen_devices:
                    if record.sync_status != 'missing':
                        record.sync_status = 'missing'
                        record.missing_since = now
        return seen_devices

    def _sync_snapshot_areas(
        self,
        database,
        *,
        connection_id: str,
        snapshot: HASnapshot,
        now,
    ) -> set[str]:
        """按快照 upsert 区域并标记缺失，返回 seen_areas。"""
        existing_areas = {
            area.area_id: area
            for area in database.scalars(select(HAArea).where(HAArea.connection_id == connection_id))
        }
        seen_areas = {
            area_id for area_id, area in existing_areas.items() if area.sync_status != 'missing'
        } if snapshot.areas is None else set()
        for area_entry in snapshot.areas or []:
            area_id = str(area_entry.get('area_id') or area_entry.get('id') or '')
            if not area_id:
                continue
            seen_areas.add(area_id)
            record = existing_areas.get(area_id)
            if record is None:
                record = HAArea(connection_id = connection_id, area_id = area_id, name = str(area_entry.get('name') or area_id))
                database.add(record)
            record.name = str(area_entry.get('name') or area_id)
            record.aliases_json = json.dumps(area_entry.get('aliases') or [], ensure_ascii = False)
            record.sync_status = 'active'
            record.last_seen_at = now
            record.missing_since = None
        if snapshot.areas is not None:
            for area_id, record in existing_areas.items():
                if area_id not in seen_areas:
                    if record.sync_status != 'missing':
                        record.sync_status = 'missing'
                        record.missing_since = now
        return seen_areas

    def _finalize_snapshot_sync(
        self,
        database,
        *,
        connection_id: str,
        snapshot: HASnapshot,
        reconciled: bool,
        now,
        seen_counts: tuple[set[str], set[str], set[str]],
    ) -> None:
        """更新连接与 sync_state 计数并提交。"""
        seen_entities, seen_devices, seen_areas = seen_counts
        connection = database.get(HAConnection, connection_id)
        if connection:
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
        sync_state.entity_count = len(seen_entities)
        sync_state.device_count = len(seen_devices)
        sync_state.area_count = len(seen_areas)
        sync_state.last_error = None
        database.add(sync_state)
        database.commit()

    def _apply_snapshot(self, connection_id: str, snapshot: HASnapshot, reconciled: bool) -> dict[str, int]:
        now = utc_now()
        state_by_id = {
            str(state_entry.get('entity_id')): state_entry
            for state_entry in snapshot.states
            if state_entry.get('entity_id') }
        registry_by_id = {
            str(registry_entry.get('entity_id')): registry_entry
            for registry_entry in snapshot.entities or []
            if registry_entry.get('entity_id') }
        seen_entities = set(state_by_id) | set(registry_by_id)
        with self.database.session_factory() as database:
            self._sync_snapshot_entities(
                database,
                connection_id=connection_id,
                seen_entities=seen_entities,
                state_by_id=state_by_id,
                registry_by_id=registry_by_id,
                now=now,
            )
            seen_devices = self._sync_snapshot_devices(
                database, connection_id=connection_id, snapshot=snapshot, now=now
            )
            seen_areas = self._sync_snapshot_areas(
                database, connection_id=connection_id, snapshot=snapshot, now=now
            )
            self._finalize_snapshot_sync(
                database,
                connection_id=connection_id,
                snapshot=snapshot,
                reconciled=reconciled,
                now=now,
                seen_counts=(seen_entities, seen_devices, seen_areas),
            )
        self._known_entity_ids = {
            key for key in self._known_entity_ids if key[0] != connection_id}
        self._known_entity_ids.update((connection_id, entity_id) for entity_id in seen_entities)
        return {
            'entities': len(seen_entities),
            'devices': len(seen_devices),
            'areas': len(seen_areas) }

    def _apply_incremental_state(self, connection_id: str, raw_state: dict[str, Any]) -> bool:
        """单条入口（供一次性调用方使用；实时链路走批量版）。"""
        return self._apply_incremental_states(connection_id, [raw_state])

    def _apply_incremental_states(self, connection_id: str, raw_states: list[dict[str, Any]]) -> bool:
        """批量落库一批增量状态，返回实体目录是否有变化。

        `_apply_incremental_state` 的批量化版本：WS 场景切换 / 全屋开关时 HA 一次推送几十上百条
        `state_changed`，逐条各开一次 session + commit 就是 N 次 fsync，这里合成一次事务。
        逐条语义不变：只更新「未登记」或「到了刷盘窗口」的实体，目录版本号按新增条数累加。
        """
        monotonic_now = time.monotonic()
        flush_incremental = monotonic_now - self._incremental_flushed_at.get(connection_id, 0) >= INCREMENTAL_FLUSH_SECONDS
        targets: list[tuple[str, dict[str, Any]]] = []
        for raw_state in raw_states:
            entity_id = str(raw_state.get('entity_id') or '')
            if not entity_id:
                continue
            if (connection_id, entity_id) in self._known_entity_ids and not flush_incremental:
                continue
            targets.append((entity_id, raw_state))
        if not targets:
            return False
        catalog_changed = False
        added_count = 0
        now = utc_now()
        with self.database.session_factory() as database:
            # 一次取回本批所有仍需落库的实体行：此前循环里逐条 ``select(HAEntity)``，
            # 全屋场景变化（几十上百条）在刷盘窗口就是 N 次查询。
            existing: dict[str, HAEntity] = {}
            for chunk in _chunked([entity_id for entity_id, _ in targets]):
                for record in database.scalars(
                    select(HAEntity).where(
                        HAEntity.connection_id == connection_id,
                        HAEntity.entity_id.in_(chunk),
                    )
                ):
                    existing[record.entity_id] = record
            touched_known_ids: list[str] = []
            new_records: list[HAEntity] = []
            for entity_id, raw_state in targets:
                if (connection_id, entity_id) in self._known_entity_ids:
                    # 已登记且到了刷盘窗口：只更新同步时间，不动实体行（与逐条实现一致）。
                    touched_known_ids.append(entity_id)
                    continue
                attributes = raw_state.get('attributes') or { }
                record = existing.get(entity_id)
                if record is None:
                    record = HAEntity(connection_id = connection_id, entity_id = entity_id, domain = entity_id.partition('.')[0], name = attributes.get('friendly_name'), icon = attributes.get('icon'))
                    new_records.append(record)
                    catalog_changed = True
                    added_count += 1
                elif record.sync_status == 'missing':
                    catalog_changed = True
                record.sync_status = 'active'
                record.name = attributes.get('friendly_name') or record.name
                record.icon = attributes.get('icon') or record.icon
                record.last_seen_at = now
                record.missing_since = None
                self._known_entity_ids.add((connection_id, entity_id))
            if new_records:
                database.add_all(new_records)
            # 已登记实体只改时间戳：合并成按批的 UPDATE，而不是逐行 ORM 刷新。
            if touched_known_ids:
                for chunk in _chunked(touched_known_ids):
                    database.execute(
                        update(HAEntity)
                        .where(
                            HAEntity.connection_id == connection_id,
                            HAEntity.entity_id.in_(chunk),
                        )
                        .values(last_seen_at = now)
                        .execution_options(synchronize_session = False)
                    )
            if flush_incremental or catalog_changed:
                state = database.get(HASyncState, connection_id) or HASyncState(connection_id = connection_id, status = 'connected')
                if flush_incremental:
                    state.last_incremental_at = utc_now()
                if catalog_changed:
                    state.catalog_revision = (state.catalog_revision or 0) + 1
                    state.entity_count = (state.entity_count or 0) + max(added_count, 1)
                database.add(state)
            if flush_incremental:
                self._incremental_flushed_at[connection_id] = monotonic_now
            database.commit()
        return catalog_changed
    def catalog_counts(self, connection_id: str) -> dict[str, int]:
        with self.database.session_factory() as database:
            return self._active_catalog_counts(database, connection_id)

    @staticmethod

    def _active_catalog_counts(database, connection_id: str) -> dict[str, int]:
        return {
            'entities': int(database.scalar(select(func.count()).select_from(HAEntity).where(HAEntity.connection_id == connection_id, HAEntity.sync_status != 'missing')) or 0),
            'devices': int(database.scalar(select(func.count()).select_from(HADevice).where(HADevice.connection_id == connection_id, HADevice.sync_status != 'missing')) or 0),
            'areas': int(database.scalar(select(func.count()).select_from(HAArea).where(HAArea.connection_id == connection_id, HAArea.sync_status != 'missing')) or 0) }
