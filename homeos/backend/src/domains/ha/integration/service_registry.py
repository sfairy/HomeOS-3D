"""HA 注册表事件订阅与防抖刷新。"""

from __future__ import annotations

import asyncio
import json
import traceback
from typing import Any

from sqlalchemy import select

from .service_contract import HAConnectorHost
from .service_support import (
    LOGGER,
    REGISTRY_REFRESH_DEBOUNCE_SECONDS,
)
from ...logs.global_log import _safe_text
from ....platform.core.models import (
    HAArea,
    HADevice,
    HAEntity,
    HASyncState,
    utc_now,
)


class HARegistryMixin(HAConnectorHost):
    """HA 注册表事件订阅与防抖刷新。"""

    def _apply_registry_event(self, connection_id: str, event_type: str, event_data: dict[str, Any]) -> str | None:
        action = str(event_data.get('action') or 'update')
        if action not in {'create', 'remove', 'update'}:
            return None
        now = utc_now()
        changes_value = event_data.get('changes')
        changes = changes_value if isinstance(changes_value, dict) else { }
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
                        old_record.entity_id = entity_id
                        old_record.domain = entity_id.partition('.')[0]
                        record = old_record
                    elif old_record is not None:
                        old_record.sync_status = 'missing'
                        old_record.missing_since = now
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
                        record.disabled_by = event_data.get('disabled_by')
                    elif 'disabled_by' in changes:
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
                    record = HAArea(connection_id = connection_id, area_id = area_id, name = str(event_data.get('name') or area_id))
                    database.add(record)
                if action == 'remove':
                    record.sync_status = 'missing'
                    record.missing_since = now
                else:
                    if 'name' in event_data:
                        record.name = str(event_data.get('name') or area_id)
                    if 'aliases' in event_data:
                        record.aliases_json = json.dumps(event_data.get('aliases') or [], ensure_ascii = False)
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
        return action

    def _apply_registry_snapshot(self, connection_id: str, entities: list[dict[str, Any]] | None, devices: list[dict[str, Any]] | None, areas: list[dict[str, Any]] | None) -> dict[str, int] | None:
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

    def _schedule_registry_refresh(self, connection_id: str) -> None:
        current = self._registry_refresh_tasks.get(connection_id)
        if current is not None and not current.done():
            current.cancel()
        self._registry_refresh_tasks[connection_id] = asyncio.create_task(self._debounced_registry_refresh(connection_id), name = f'ha-registry-refresh-{connection_id}')

    async def _debounced_registry_refresh(self, connection_id: str) -> None:
        try:
            await asyncio.sleep(REGISTRY_REFRESH_DEBOUNCE_SECONDS)
            async with self._sync_lock:
                connection = await self._run_database(self._load_connection, connection_id)
                entities, devices, areas = await (await self.client_for(connection)).fetch_registries()
                counts = await self._run_database(self._apply_registry_snapshot, connection_id, entities, devices, areas)
            if counts is not None:
                await self.state_hub.publish({
                    'type': 'entity_catalog_changed',
                    'operation': 'metadata_refreshed',
                    'counts': counts })
        except asyncio.CancelledError:
            raise
        except Exception as error:
            self._log_event('error', '实体同步', f'Home Assistant 实体目录刷新失败：{error}', details = traceback.format_exc())
            LOGGER.error('HA registry metadata refresh failed\n%s', _safe_text(traceback.format_exc(), limit = 12000))
        finally:
            current = self._registry_refresh_tasks.get(connection_id)
            if current is asyncio.current_task():
                self._registry_refresh_tasks.pop(connection_id, None)
