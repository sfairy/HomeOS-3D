from __future__ import annotations

from collections import defaultdict
from typing import Any

from sqlalchemy import select

from ..models import HAConnection, HADevice, HAEntity

TEMPLATE_ENTITY_BINDINGS_KEY = '_templateEntityBindings'


def _normalize_name(value: Any) -> str:
    return ' '.join(str(value or '').split()).casefold()


def _metadata_item(source_id: str, value: Any) -> tuple[str, str, str, str] | None:
    domain = source_id.partition('.')[0]
    name = ''
    device_id = ''
    device_name = ''
    if isinstance(value, str):
        name = value
    elif isinstance(value, dict):
        name = str(value.get('name') or value.get('originalName') or '')
        domain = str(value.get('domain') or domain)
        device_id = str(value.get('deviceId') or '')
        device_name = str(value.get('deviceName') or '')
    name_key = _normalize_name(name)
    return (name_key, domain, device_id, device_name) if name_key else None


def _entity_replacements(
    bindings: dict[str, Any], database
) -> tuple[dict[str, str], dict[str, str], dict[str, str]]:
    '''Build deterministic entity/device replacements for one active HA catalog.'''
    if database is None or not isinstance(bindings, dict):
        return ({}, {}, {})
    connection = database.scalar(
        select(HAConnection).where(HAConnection.is_active.is_(True))
    )
    if connection is None:
        return ({}, {}, {})
    entities = list(
        database.scalars(
            select(HAEntity)
            .where(
                HAEntity.connection_id == connection.id,
                HAEntity.sync_status == 'active',
                HAEntity.disabled_by.is_(None),
            )
            .order_by(HAEntity.entity_id)
        )
    )
    by_id = {item.entity_id: item for item in entities}
    by_name = defaultdict(list)
    for item in entities:
        name_key = _normalize_name(item.name or item.original_name)
        if not name_key:
            continue
        by_name[item.domain, name_key].append(item)
    device_ids = {item.device_id for item in entities if item.device_id}
    devices = (
        {
            item.device_id: item
            for item in database.scalars(
                select(HADevice).where(
                    HADevice.connection_id == connection.id,
                    HADevice.device_id.in_(device_ids) if device_ids else False,
                    HADevice.sync_status == 'active',
                    HADevice.disabled_by.is_(None),
                )
            )
        }
        if device_ids
        else {}
    )
    entity_replacements = {}
    device_candidates = defaultdict(set)
    device_name_replacements = {}
    for source_id, value in bindings.items():
        if not isinstance(source_id, str) or '.' not in source_id:
            continue
        parsed = _metadata_item(source_id, value)
        if parsed is None:
            continue
        name_key, domain, source_device_id, source_device_name = parsed
        candidates = by_name.get((domain, name_key), [])
        current = by_id.get(source_id)
        target = candidates[0] if len(candidates) == 1 else None
        if target is None and current is not None and current.domain == domain:
            target = current
        if target is None:
            continue
        if target.entity_id != source_id:
            entity_replacements[source_id] = target.entity_id
        if source_device_id and target.device_id:
            device_candidates[source_device_id].add(target.device_id)
        if not source_device_name:
            continue
        target_device = devices.get(target.device_id or '')
        target_name = (
            (target_device.name_by_user or target_device.name)
            if target_device
            else ''
        )
        if not target_name:
            continue
        if target_name != source_device_name:
            device_name_replacements[source_device_name] = target_name
    device_replacements = {
        source: next(iter(targets))
        for source, targets in device_candidates.items()
        if len(targets) == 1 and source != next(iter(targets))
    }
    return (entity_replacements, device_replacements, device_name_replacements)


def replace_template_entity_bindings(
    value: dict[str, Any], bindings: dict[str, Any], database
) -> dict[str, Any]:
    '''Replace entity references by exact template name/domain matches.'''
    (entity_replacements, device_replacements, device_name_replacements) = (
        _entity_replacements(bindings, database)
    )
    if (
        not entity_replacements
        and not device_replacements
        and not device_name_replacements
    ):
        return value

    def visit(item: Any) -> None:
        if isinstance(item, dict):
            for key, child in list(item.items()):
                mapped_key = (
                    entity_replacements.get(key, key) if isinstance(key, str) else key
                )
                if mapped_key != key:
                    item.pop(key)
                    item[mapped_key] = child
                    key = mapped_key
                normalized = str(key).casefold()
                if normalized.endswith('entityid') and isinstance(child, str):
                    item[key] = entity_replacements.get(child, child)
                    continue
                if normalized.endswith('entityids') and isinstance(child, list):
                    item[key] = [
                        (
                            entity_replacements.get(entity_id, entity_id)
                            if isinstance(entity_id, str)
                            else entity_id
                        )
                        for entity_id in child
                    ]
                    continue
                if normalized == 'deviceid' and isinstance(child, str):
                    item[key] = device_replacements.get(child, child)
                    continue
                if normalized == 'devicename' and isinstance(child, str):
                    item[key] = device_name_replacements.get(child, child)
                    continue
                visit(child)
        elif isinstance(item, list):
            for child in item:
                visit(child)

    visit(value)
    return value
