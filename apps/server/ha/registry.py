"""实体注册表与增量状态落地：注册表事件/快照怎么并进本地缓存
"""
from __future__ import annotations
import asyncio
import json
import time
import traceback
from typing import Any
from sqlalchemy import select
from ..core.models import HAArea, HAConnection, HADevice, HAEntity, HASyncState, utc_now
from ..observability.global_log import _safe_text
# 当前端点的复用窗口（秒）。在用的这一路每隔这么久复探一次：内网可能已经恢复（回家、
HA_ENDPOINT_RECHECK_SECONDS = 60
# 补拉状态的重试退避（秒）：共尝试 3 次（首次 + 两次重试），
STATE_FETCH_RETRY_DELAYS = (0.2, 0.6)
HISTORY_FETCH_CONCURRENCY = 2
HISTORY_CACHE_SECONDS = 30
# 判断「状态是否不完整、值得再拉一次」的关键属性表。HA 启动初期或集成重载时会先返回
STATE_FETCH_REQUIRED_ATTRIBUTES = {
    'climate': {
        'fan_modes',
        'hvac_modes',
        'swing_modes',
        'temperature',
        'preset_modes',
        'supported_features',
        'current_temperature'} }

def state_requires_fetch_retry(entity_id: str, state: dict | None) -> bool:
    """判断某个实体的状态是否缺失或残缺、需要重新拉取。"""
    domain = entity_id.partition('.')[0]
    required_attributes = STATE_FETCH_REQUIRED_ATTRIBUTES.get(domain)
    if required_attributes is None:
        if state is None:
            return True
        # 不在白名单里的域只要有状态就算完整；sensor 例外：unknown / unavailable 是
        return domain == 'sensor' and str(state.get('state') or '').strip().casefold() in frozenset({'unknown', 'unavailable'})
    attributes = state.get('attributes') if isinstance(state, dict) else None
    # 属性表缺失，或必备属性一个都没有 —— 两种情况都按残缺处理。
    return not isinstance(attributes, dict) or not required_attributes.intersection(attributes)

from .contracts import (
    INCREMENTAL_FLUSH_SECONDS,
    LOGGER,
    REGISTRY_REFRESH_DEBOUNCE_SECONDS,
)


class HARegistryMixin:
    """实体注册表与增量状态落地：注册表事件/快照怎么并进本地缓存"""

    async def _debounced_registry_refresh(self, connection_id: str) -> None:
        """防抖计时结束后真正拉取三份注册表并落库。
        """
        try:
            # 睡在最前面：睡眠期间排队的同类事件会取消本任务并重新计时。
            await asyncio.sleep(REGISTRY_REFRESH_DEBOUNCE_SECONDS)
            # 与 sync_once 共用同一把锁：注册表快照和全量快照不能交叉写库。
            async with self._sync_lock:
                connection = await self._run_database(self._load_connection, connection_id)
                entities, devices, areas = await (await self.client_for(connection)).fetch_registries()
                counts = await self._run_database(self._apply_registry_snapshot, connection_id, entities, devices, areas)
            # counts 为 None 表示三份注册表一个都没取到，这种「无信息」结果不通知前端。
            if counts is not None:
                await self.state_hub.publish({
                    'type': 'entity_catalog_changed',
                    'operation': 'metadata_refreshed',
                    'counts': counts })
        except asyncio.CancelledError:
            # 被新一轮防抖取消属于正常流程，必须原样抛出。
            raise
        except Exception as error:
            self._log_event('error', '实体同步', f'Home Assistant 实体目录刷新失败：{error}', details = traceback.format_exc())
            LOGGER.error('HA registry metadata refresh failed\n%s', _safe_text(traceback.format_exc(), limit = 12000))
        finally:
            current = self._registry_refresh_tasks.get(connection_id)
            if current is asyncio.current_task():
                self._registry_refresh_tasks.pop(connection_id, None)
    def _apply_registry_event(self, connection_id: str, event_type: str, event_data: dict[str, Any]) -> str | None:
        """把一条注册表变更事件增量写库。
        """
        action = str(event_data.get('action') or 'update')
        # 白名单外的 action 一律忽略，等一次全量对账兜底。
        if action not in frozenset({'create', 'remove', 'update'}):
            return None
        now = utc_now()
        changes = event_data.get('changes') if isinstance(event_data.get('changes'), dict) else { }
        with self.database.session_factory() as database:
            if event_type == 'entity_registry_updated':
                entity_id = str(event_data.get('entity_id') or '')
                if not entity_id:
                    return None
                old_entity_id = str(changes.get('entity_id') or '')
                record = database.scalar(select(HAEntity).where(HAEntity.connection_id == connection_id, HAEntity.entity_id == entity_id))
                if old_entity_id and old_entity_id != entity_id:
                    old_record = database.scalar(select(HAEntity).where(HAEntity.connection_id == connection_id, HAEntity.entity_id == old_entity_id))
                    if old_record is not None and record is None:
                        # 改名：复用旧行（保留 first_seen_at 与仪表盘绑定），只换 ID 与域。
                        old_record.entity_id = entity_id
                        old_record.domain = entity_id.partition('.')[0]
                        record = old_record
                    elif old_record is not None:
                        # 新旧 ID 同时存在（重复行）：新的已经是权威记录，把旧的标缺失。
                        old_record.sync_status = 'missing'
                        old_record.missing_since = now
                    # 旧 ID 已不再是有效实体，从内存中的「已知实体」里摘掉。
                    self._known_entity_ids.discard((connection_id, old_entity_id))
                if record is None:
                    record = HAEntity(connection_id = connection_id, entity_id = entity_id, domain = entity_id.partition('.')[0])
                    database.add(record)
                if action == 'remove':
                    record.sync_status = 'missing'
                    record.missing_since = now
                    self._known_entity_ids.discard((connection_id, entity_id))
                else:
                    if 'disabled_by' in event_data:
                        # 顶层直接给了新值的载荷，直接用。
                        record.disabled_by = event_data.get('disabled_by')
                    elif 'disabled_by' in changes:
                        # changes 里是旧值：旧值 None 表示原来启用、现在被禁用；禁用来源推不出来，统一写 'registry'。
                        record.disabled_by = 'registry' if changes.get('disabled_by') is None else None
                    for field in ('platform', 'translation_key', 'unique_id', 'device_id', 'area_id', 'name', 'original_name', 'icon'):
                        if field in event_data:
                            setattr(record, field, event_data.get(field))
                    if 'has_entity_name' in event_data:
                        record.has_entity_name = event_data.get('has_entity_name')
                    record.domain = entity_id.partition('.')[0]
                    record.sync_status = self._status(record.disabled_by)
                    record.last_seen_at = now
                    record.missing_since = None
                    self._known_entity_ids.add((connection_id, entity_id))
            elif event_type == 'device_registry_updated':
                # 设备事件里 id 可能叫 device_id，也可能叫 id（不同事件来源写法不同）。
                device_id = str(event_data.get('device_id') or event_data.get('id') or '')
                if not device_id:
                    return None
                record = database.scalar(select(HADevice).where(HADevice.connection_id == connection_id, HADevice.device_id == device_id))
                if record is None:
                    record = HADevice(connection_id = connection_id, device_id = device_id)
                    database.add(record)
                if action == 'remove':
                    record.sync_status = 'missing'
                    record.missing_since = now
                else:
                    for field in ('name', 'name_by_user', 'manufacturer', 'model', 'area_id', 'disabled_by'):
                        if field in event_data:
                            setattr(record, field, event_data.get(field))
                    record.sync_status = self._status(record.disabled_by)
                    record.last_seen_at = now
                    record.missing_since = None
            else:
                area_id = str(event_data.get('area_id') or event_data.get('id') or '')
                if not area_id:
                    return None
                record = database.scalar(select(HAArea).where(HAArea.connection_id == connection_id, HAArea.area_id == area_id))
                if record is None:
                    # 区域没有注册表事件时可能只带 area_id，名称先用 ID 顶上，等下次刷新覆盖。
                    record = HAArea(connection_id = connection_id, area_id = area_id, name = str(event_data.get('name') or area_id))
                    database.add(record)
                if action == 'remove':
                    record.sync_status = 'missing'
                    record.missing_since = now
                else:
                    if 'name' in event_data:
                        record.name = str(event_data.get('name') or area_id)
                    if 'aliases' in event_data:
                        # ensure_ascii=False：别名是中文，落库保持可读，方便直接查库排查。
                        record.aliases_json = json.dumps(event_data.get('aliases') or [], ensure_ascii = False)
                    record.sync_status = 'active'
                    record.last_seen_at = now
                    record.missing_since = None
            database.flush()
            # 计数统一按「非 missing」统计，与目录接口的口径保持一致。
            counts = self._active_catalog_counts(database, connection_id)
            state = database.get(HASyncState, connection_id) or HASyncState(connection_id = connection_id)
            state.status = 'connected'
            state.phase = None
            state.last_incremental_at = now
            # 目录确实变了才自增 revision，前端据此判断要不要重新拉实体列表。
            state.catalog_revision = (state.catalog_revision or 0) + 1
            state.entity_count = counts['entities']
            state.device_count = counts['devices']
            state.area_count = counts['areas']
            state.last_error = None
            database.add(state)
            database.commit()
        return action
    def _apply_registry_snapshot(self, connection_id: str, entities: list[dict[str, Any]] | None, devices: list[dict[str, Any]] | None, areas: list[dict[str, Any]] | None) -> dict[str, int] | None:
        """用三份注册表快照刷新元数据（新增 + 更新，不做缺失标记）。
        """
        if entities is None and devices is None and areas is None:
            return None
        now = utc_now()
        with self.database.session_factory() as database:
            existing_entities = {
                record.entity_id: record
                for record in database.scalars(select(HAEntity).where(HAEntity.connection_id == connection_id))} if entities else { }
            for item in entities or []:
                entity_id = str(item.get('entity_id') or '')
                if not entity_id:
                    continue
                record = existing_entities.get(entity_id)
                if record is None:
                    record = HAEntity(connection_id = connection_id, entity_id = entity_id, domain = entity_id.partition('.')[0])
                    database.add(record)
                    existing_entities[entity_id] = record
                record.domain = entity_id.partition('.')[0]
                record.platform = item.get('platform')
                record.translation_key = item.get('translation_key')
                record.has_entity_name = item.get('has_entity_name')
                record.unique_id = item.get('unique_id')
                record.device_id = item.get('device_id')
                record.area_id = item.get('area_id')
                record.name = item.get('name') or item.get('original_name') or record.name
                record.original_name = item.get('original_name')
                record.icon = item.get('icon') or record.icon
                record.disabled_by = item.get('disabled_by')
                record.sync_status = self._status(record.disabled_by)
                record.last_seen_at = now
                record.missing_since = None
                self._known_entity_ids.add((connection_id, entity_id))
            existing_devices = {
                record.device_id: record
                for record in database.scalars(select(HADevice).where(HADevice.connection_id == connection_id))} if devices else { }
            for item in devices or []:
                device_id = str(item.get('id') or '')
                if not device_id:
                    continue
                record = existing_devices.get(device_id)
                if record is None:
                    record = HADevice(connection_id = connection_id, device_id = device_id)
                    database.add(record)
                    existing_devices[device_id] = record
                record.name = item.get('name')
                record.name_by_user = item.get('name_by_user')
                # 原始元数据整份存 JSON：前端以后要用到新字段时不必加列、也不必重跑同步。
                record.registry_metadata_json = self._device_registry_metadata(item)
                record.manufacturer = item.get('manufacturer')
                record.model = item.get('model')
                record.area_id = item.get('area_id')
                record.disabled_by = item.get('disabled_by')
                record.sync_status = self._status(record.disabled_by)
                record.last_seen_at = now
                record.missing_since = None
            existing_areas = {
                record.area_id: record
                for record in database.scalars(select(HAArea).where(HAArea.connection_id == connection_id))} if areas else { }
            for item in areas or []:
                area_id = str(item.get('area_id') or item.get('id') or '')
                if not area_id:
                    continue
                record = existing_areas.get(area_id)
                if record is None:
                    record = HAArea(connection_id = connection_id, area_id = area_id, name = str(item.get('name') or area_id))
                    database.add(record)
                    existing_areas[area_id] = record
                record.name = str(item.get('name') or area_id)
                record.aliases_json = json.dumps(item.get('aliases') or [], ensure_ascii = False)
                # 区域没有 disabled 概念，凡是出现在注册表里的都算启用。
                record.sync_status = 'active'
                record.last_seen_at = now
                record.missing_since = None
            database.flush()
            counts = self._active_catalog_counts(database, connection_id)
            state = database.get(HASyncState, connection_id) or HASyncState(connection_id = connection_id)
            state.status = 'connected'
            state.phase = None
            state.last_incremental_at = now
            state.catalog_revision = (state.catalog_revision or 0) + 1
            state.entity_count = counts['entities']
            state.device_count = counts['devices']
            state.area_count = counts['areas']
            state.last_error = None
            database.add(state)
            database.commit()
        return counts
    def _record_error(self, connection_id: str, message: str) -> None:
        """把错误写进连接与同步状态（供界面展示）。"""
        # 截断到 2000 字符：错误里常带整段响应/堆栈，无上限会把状态表撑大，
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
    def _mark_connected(self, connection_id: str) -> None:
        """记录一次成功连接：刷新 last_connected_at 并清掉错误信息。"""
        with self.database.session_factory() as database:
            connection = database.get(HAConnection, connection_id)
            if connection:
                connection.last_connected_at = utc_now()
                connection.last_error = None
            state = database.get(HASyncState, connection_id)
            # 注意这里不用「不存在就新建」：同步状态由同步流程负责创建，
            if state:
                state.status = 'connected'
                state.phase = None
                state.last_error = None
            database.commit()
        self._runtime_error = None
    @staticmethod
    def _device_registry_metadata(item: dict) -> str:
        """把设备注册表条目压成一份精简 JSON，供前端按集成/入口筛选设备。
        """
        return json.dumps({
            'integrations': sorted({
                value[0] for value in item.get('identifiers') or []
                # 只认 [集成名, 唯一 ID] 这种两元组且首元素是字符串，HA 各集成写法不一致，不校验会写脏数据。
                if isinstance(value, (list, tuple)) and len(value) == 2 and isinstance(value[0], str)}),
            'configEntryIds': sorted({
                value for value in item.get('config_entries') or []
                if isinstance(value, str)}),
            'viaDeviceId': item.get('via_device_id'),
            'entryType': item.get('entry_type') }, ensure_ascii = False)
    def _apply_incremental_state(self, connection_id: str, raw_state: dict[str, Any]) -> bool:
        """把一条实时状态事件增量落库。
        """
        entity_id = str(raw_state.get('entity_id') or '')
        if not entity_id:
            return False
        key = (connection_id, entity_id)
        known = key in self._known_entity_ids
        monotonic_now = time.monotonic()
        flush_incremental = monotonic_now - self._incremental_flushed_at.get(connection_id, 0) >= INCREMENTAL_FLUSH_SECONDS
        if known and not flush_incremental:
            # 已知实体的高频状态更新：本窗口内只更新内存，不写库。
            return False
        attributes = raw_state.get('attributes') or { }
        catalog_changed = False
        with self.database.session_factory() as database:
            if not known:
                record = database.scalar(select(HAEntity).where(HAEntity.connection_id == connection_id, HAEntity.entity_id == entity_id))
                if record is None:
                    # 全新实体：注册表还没同步到它，先用状态里的运行时字段顶上。
                    record = HAEntity(connection_id = connection_id, entity_id = entity_id, domain = entity_id.partition('.')[0], name = attributes.get('friendly_name'), icon = attributes.get('icon'))
                    database.add(record)
                    catalog_changed = True
                elif record.sync_status == 'missing':
                    # 之前判为消失、现在又回来了，也算目录变化。
                    catalog_changed = True
                record.sync_status = 'active'
                record.name = attributes.get('friendly_name') or record.name
                record.icon = attributes.get('icon') or record.icon
                record.last_seen_at = utc_now()
                record.missing_since = None
                self._known_entity_ids.add(key)
            if flush_incremental or catalog_changed:
                state = database.get(HASyncState, connection_id) or HASyncState(connection_id = connection_id, status = 'connected')
                if flush_incremental:
                    # 这个时间戳是「增量通道还活着」的心跳，供界面判断同步是否正常。
                    state.last_incremental_at = utc_now()
                if catalog_changed:
                    state.catalog_revision = (state.catalog_revision or 0) + 1
                    # 只做 +1 的近似计数，精确值由下一次全量对账覆盖。
                    state.entity_count += 1
                database.add(state)
            if flush_incremental:
                self._incremental_flushed_at[connection_id] = monotonic_now
            database.commit()
        return catalog_changed
