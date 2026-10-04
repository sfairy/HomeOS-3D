"""Home Assistant 集成的主接口面：连接配置、目录查询、历史、同步与设备控制，按 api / ha.control / ha.sync / ha.configure 四档能力码放行。"""

from __future__ import annotations

import asyncio
import json
import math
import time
import traceback
from datetime import UTC, datetime, timedelta
from typing import Any
from urllib.parse import urlsplit
from uuid import uuid4

from anyio import create_task_group
from fastapi import APIRouter, HTTPException, Query, Request, WebSocket, WebSocketDisconnect, status
from sqlalchemy import func, or_, select

from ..database import Database
from ..dependencies import (
    DatabaseSession,
    LicensedUser,
    LicensedViewer,
    ViewerPrincipal,
    require_viewer_entity,
    viewer_entity_ids,
)
from ..display_access import active_display_device
from ..embedding import embedded_devices
from ..global_log import event_context
from ..ha.client import HAClientError
from ..ha.connection_setup import addresses_label, failed_endpoint_summary, probe_endpoints
from ..ha.crypto import CredentialCipherError
from ..ha.endpoints import endpoint_candidates
from ..ha.errors import connection_error_message
from ..ha.numeric_sources import numeric_sources
from ..ha.percentage_sources import percentage_sources
from ..models import HAArea, HAConnection, HADevice, HAEntity, HASyncState, LoginSession, User
from ..panel.action_rules import TOGGLE_ENTITY_DOMAINS
from ..schemas import HABrowseMediaRequest, HAConnectionInput, HAServiceCallRequest, HATestRequest
from ..security import session_token_hash

router = APIRouter(prefix='/ha', tags=['home-assistant'])
runtime_router = APIRouter(tags=['runtime'])
MAX_RUNTIME_ENTITIES = 1000
DISPLAY_BINDING_CACHE_SECONDS = 1
ALLOWED_SERVICES: dict[tuple[str, str], set[str]] = {
    ('lock', 'lock'): {'code'},
    ('lock', 'unlock'): {'code'},
    ('lock', 'open'): {'code'},
    ('homeassistant', 'toggle'): set(),
    ('button', 'press'): set(),
    ('input_button', 'press'): set(),
    ('input_boolean', 'turn_on'): set(),
    ('input_boolean', 'turn_off'): set(),
    ('input_select', 'select_option'): {'option'},
    ('script', 'turn_on'): set(),
    ('light', 'turn_on'): {'white', 'hs_color', 'rgb_color', 'brightness', 'transition', 'brightness_pct', 'color_temp_kelvin'},
    ('light', 'turn_off'): {'transition'},
    ('switch', 'turn_on'): set(),
    ('switch', 'turn_off'): set(),
    ('cover', 'open_cover'): set(),
    ('cover', 'close_cover'): set(),
    ('cover', 'stop_cover'): set(),
    
        ('cover', 'set_cover_position'): {'position'},
        ('cover', 'open_cover_tilt'): set(),
        ('cover', 'close_cover_tilt'): set(),
        ('cover', 'stop_cover_tilt'): set(),
        ('cover', 'set_cover_tilt_position'): {'tilt_position'},
        ('climate', 'set_temperature'): {'temperature', 'target_temp_low', 'target_temp_high'},
        ('climate', 'turn_on'): set(),
        ('climate', 'turn_off'): set(),
        ('climate', 'set_swing_horizontal_mode'): {'swing_horizontal_mode'},
        ('climate', 'set_hvac_mode'): {'hvac_mode'},
        ('climate', 'set_fan_mode'): {'fan_mode'},
        ('climate', 'set_swing_mode'): {'swing_mode'},
        ('climate', 'set_preset_mode'): {'preset_mode'},
        ('water_heater', 'turn_on'): set(),
        ('water_heater', 'turn_off'): set(),
        ('water_heater', 'set_temperature'): {'temperature'},
        ('water_heater', 'set_operation_mode'): {'operation_mode'}
    ,
    
        ('water_heater', 'set_away_mode'): {'away_mode'},
        ('fan', 'set_percentage'): {'percentage'},
        ('fan', 'oscillate'): {'oscillating'},
        ('fan', 'set_direction'): {'direction'},
        ('fan', 'set_preset_mode'): {'preset_mode'},
        ('fan', 'turn_on'): set(),
        ('fan', 'turn_off'): set(),
        ('number', 'set_value'): {'value'},
        ('input_number', 'set_value'): {'value'},
        ('media_player', 'media_play_pause'): set(),
        ('media_player', 'media_play'): set(),
        ('media_player', 'media_pause'): set(),
        ('media_player', 'media_stop'): set(),
        ('media_player', 'media_previous_track'): set(),
        ('media_player', 'media_next_track'): set(),
        ('media_player', 'volume_up'): set(),
        ('media_player', 'volume_down'): set()
    ,
    
        ('media_player', 'media_seek'): {'seek_position'},
        ('media_player', 'shuffle_set'): {'shuffle'},
        ('media_player', 'repeat_set'): {'repeat'},
        ('media_player', 'volume_set'): {'volume_level'},
        ('media_player', 'volume_mute'): {'is_volume_muted'},
        ('media_player', 'select_source'): {'source'},
        ('media_player', 'select_sound_mode'): {'sound_mode'},
        ('media_player', 'play_media'): {'media_content_id', 'media_content_type'},
        ('media_player', 'turn_on'): set(),
        ('media_player', 'turn_off'): set(),
        ('vacuum', 'start'): set(),
        ('vacuum', 'pause'): set(),
        ('vacuum', 'stop'): set(),
        ('vacuum', 'locate'): set(),
        ('vacuum', 'clean_spot'): set(),
        ('vacuum', 'turn_on'): set(),
        ('vacuum', 'turn_off'): set()
    ,
    
        ('vacuum', 'return_to_base'): set(),
        ('vacuum', 'set_fan_speed'): {'fan_speed'},
        ('select', 'select_option'): {'option'}
    ,
}


def require_admin(user: User) -> None:
    if user.role != 'admin':
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='仅管理员可以修改 Home Assistant 连接。')


def active_connection(database: DatabaseSession) -> HAConnection | None:
    return database.scalar(select(HAConnection).where(HAConnection.is_active.is_(True)))


def load_active_connection_snapshot(database_manager: Database) -> HAConnection | None:
    with database_manager.session_factory() as database:
        connection = active_connection(database)
        if connection is not None:
            database.expunge(connection)
        return connection


def load_translation_context(database_manager: Database) -> tuple[HAConnection | None, set[str]]:
    with database_manager.session_factory() as database:
        connection = active_connection(database)
        if connection is None:
            return None, set()
        integrations = {
            platform
            for platform in database.scalars(
                select(HAEntity.platform)
                .where(
                    HAEntity.connection_id == connection.id,
                    HAEntity.sync_status == 'active',
                    HAEntity.platform.is_not(None),
                    HAEntity.translation_key.is_not(None),
                )
                .distinct()
            )
            if platform is not None
        }
        database.expunge(connection)
        return connection, integrations


def load_authorized_entity_context(
    database_manager: Database,
    viewer: ViewerPrincipal,
    entity_id: str,
) -> tuple[HAConnection | None, bool]:
    with database_manager.session_factory() as database:
        require_viewer_entity(database, viewer, entity_id)
        connection = active_connection(database)
        if connection is None:
            return None, False
        entity_exists = (
            database.scalar(
                select(HAEntity.id).where(
                    HAEntity.connection_id == connection.id,
                    HAEntity.entity_id == entity_id,
                    HAEntity.sync_status == 'active',
                    HAEntity.disabled_by.is_(None),
                )
            )
            is not None
        )
        database.expunge(connection)
        return connection, entity_exists


def connection_payload(connection: HAConnection | None, request: Request) -> dict[str, Any]:
    connector = request.app.state.ha_connector
    live_error = None if connector.connected else connector.runtime_error
    if connection is None:
        return {
            'configured': False,
            'hasToken': False,
            'connected': False,
            'baseUrl': '',
            'externalBaseUrl': None,
            'activeEndpoint': None,
            'activeBaseUrl': None,
            'name': 'Home Assistant',
            'verifyTls': True,
            'externalVerifyTls': True,
            'version': None,
            'lastConnectedAt': None,
            'lastError': connection_error_message(live_error),
        }
    return {
        'configured': True,
        'hasToken': bool(connection.encrypted_access_token),
        'connected': connector.connected,
        'baseUrl': connection.base_url,
        'externalBaseUrl': connection.external_base_url,
        'activeEndpoint': connector.endpoint_kind or connection.active_endpoint,
        'activeBaseUrl': connector.active_base_url or connection.base_url,
        'name': connection.name,
        'verifyTls': connection.verify_tls,
        'externalVerifyTls': connection.external_verify_tls,
        'version': connection.ha_version,
        'lastConnectedAt': connection.last_connected_at,
        'lastError': None if connector.connected else connection_error_message(live_error or connection.last_error),
    }


@router.get('/connection')
def get_connection(request: Request, database: DatabaseSession, _user: LicensedUser) -> dict[str, Any]:
    return connection_payload(active_connection(database), request)


@router.delete('/connection', status_code=status.HTTP_204_NO_CONTENT)
async def delete_connection(request: Request, database: DatabaseSession, user: LicensedUser) -> None:
    require_admin(user)
    connection = active_connection(database)
    if connection is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Home Assistant 连接不存在。')
    connector = request.app.state.ha_connector
    await connector.stop()
    try:
        database.delete(connection)
        database.commit()
        await connector.state_hub.replace([])
        await connector.state_hub.publish(
            {
                'type': 'entity_catalog_changed',
                'operation': 'cleared',
                'counts': {'entities': 0, 'devices': 0, 'areas': 0},
            }
        )
    except Exception:
        database.rollback()
        raise
    finally:
        await connector.restart()
    request.app.state.global_log.append('warning', 'Home Assistant', '连接', 'Home Assistant 连接配置已删除')


@router.post('/test')
async def test_connection(
    payload: HATestRequest,
    request: Request,
    database: DatabaseSession,
    user: LicensedUser,
) -> dict[str, Any]:
    require_admin(user)
    connection = active_connection(database)
    try:
        token = payload.access_token or (
            request.app.state.ha_connector.cipher.decrypt(connection.encrypted_access_token)
            if connection
            else None
        )
        if not token:
            raise HAClientError('首次连接必须输入 Home Assistant 访问令牌。')
        verify_tls = (
            connection.verify_tls
            if connection and 'verify_tls' not in payload.model_fields_set
            else payload.verify_tls
        )
        external_verify_tls = (
            connection.external_verify_tls
            if connection and 'external_verify_tls' not in payload.model_fields_set
            else payload.external_verify_tls
        )
        endpoints = endpoint_candidates(payload.base_url, verify_tls, payload.external_base_url, external_verify_tls)
        results = await probe_endpoints(
            endpoints, token, request.app.state.settings.ha_request_timeout_seconds
        )
    except (HAClientError, CredentialCipherError) as error:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=connection_error_message(error),
        ) from error
    reachable = [item for item in results if item['ok']]
    if not reachable:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=failed_endpoint_summary(results),
        )
    primary = reachable[0]
    return {
        'ok': True,
        'endpoints': results,
        'baseUrl': primary['baseUrl'],
        'version': primary.get('version'),
        'locationName': primary.get('locationName'),
    }


@router.put('/connection')
async def save_connection(
    payload: HAConnectionInput,
    request: Request,
    database: DatabaseSession,
    user: LicensedUser,
) -> dict[str, Any]:
    if not request.app.state.license_service.allows('ha.configure'):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='当前授权不允许配置 Home Assistant。')
    require_admin(user)
    connector = request.app.state.ha_connector
    connection = active_connection(database)
    verify_tls = (
        connection.verify_tls
        if connection and 'verify_tls' not in payload.model_fields_set
        else payload.verify_tls
    )
    external_verify_tls = (
        connection.external_verify_tls
        if connection and 'external_verify_tls' not in payload.model_fields_set
        else payload.external_verify_tls
    )
    endpoints = endpoint_candidates(payload.base_url, verify_tls, payload.external_base_url, external_verify_tls)
    new_addresses = (payload.base_url, payload.external_base_url)
    previous_addresses = (
        (connection.base_url, connection.external_base_url) if connection is not None else None
    )
    if payload.access_token:
        token = payload.access_token
    elif connection is not None:
        if new_addresses != previous_addresses and not payload.reuse_token_for_new_url:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={
                    'code': 'HA_URL_CHANGED_TOKEN_REUSE',
                    'message': '地址已变更：复用已保存的 Home Assistant 令牌前请确认新地址可信（确认后重发 reuseTokenForNewUrl=true，或直接重新输入令牌）。',
                },
            )
        try:
            token = connector.cipher.decrypt(connection.encrypted_access_token)
        except CredentialCipherError as error:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail=str(error),
            ) from error
    else:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail='首次连接必须输入 Home Assistant 访问令牌。',
        )
    try:
        test_results = await probe_endpoints(
            endpoints, token, request.app.state.settings.ha_request_timeout_seconds
        )
    except HAClientError as error:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=connection_error_message(error),
        ) from error
    reachable = [item for item in test_results if item['ok']]
    if not reachable:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=failed_endpoint_summary(test_results))
    primary = reachable[0]
    resolved_internal = next(
        (item['baseUrl'] for item in test_results if item['kind'] == 'internal'),
        payload.base_url,
    )
    resolved_external = next(
        (item['baseUrl'] for item in test_results if item['kind'] == 'external'),
        None,
    )
    tested = {'version': primary.get('version'), 'locationName': primary.get('locationName')}
    if connection is None:
        connection = HAConnection(
            name=payload.name.strip(),
            base_url=resolved_internal,
            external_base_url=resolved_external,
            encrypted_access_token=connector.cipher.encrypt(token),
            verify_tls=verify_tls,
            external_verify_tls=external_verify_tls,
            ha_version=tested.get('version'),
        )
        database.add(connection)
    else:
        connection.name = payload.name.strip()
        connection.base_url = resolved_internal
        connection.external_base_url = resolved_external
        connection.verify_tls = verify_tls
        connection.external_verify_tls = external_verify_tls
        connection.ha_version = tested.get('version')
        connection.last_error = None
        connection.active_endpoint = None
        if payload.access_token:
            connection.encrypted_access_token = connector.cipher.encrypt(token)
    database.commit()
    database.refresh(connection)
    await connector.restart()
    if previous_addresses is not None and previous_addresses != (connection.base_url, connection.external_base_url):
        previous_label = addresses_label(*previous_addresses)
        current_label = addresses_label(connection.base_url, connection.external_base_url)
        request.app.state.global_log.append(
            'warning',
            'Home Assistant',
            '连接',
            f'Home Assistant 地址已变更：{previous_label} → {current_label}（令牌已复用，请确认新地址可信）'
            if not payload.access_token
            else f'Home Assistant 地址已变更：{previous_label} → {current_label}（同时更新了令牌）',
        )
    disconnected = [item for item in test_results if not item['ok']]
    if disconnected:
        request.app.state.global_log.append(
            'warning',
            'Home Assistant',
            '连接',
            f'Home Assistant 连接已保存，但以下地址当前不通（将作为备用，不通时自动跳过）：{failed_endpoint_summary(test_results)}',
        )
    request.app.state.global_log.append(
        'success',
        'Home Assistant',
        '连接',
        f'Home Assistant 连接配置已保存（{connection.name}，版本 {connection.ha_version or "未知"}）',
    )
    return {**connection_payload(connection, request), 'test': tested, 'endpoints': test_results}


@router.get('/entities')
def list_entities(
    database: DatabaseSession,
    viewer: LicensedViewer,
    search: str | None = Query(None, max_length=128),
    domain: str | None = Query(None, max_length=64),
    area_id: str | None = Query(None, alias='areaId', max_length=255),
    sync_status: str | None = Query(None, alias='status', max_length=32),
    limit: int = Query(200, ge=1, le=500),
    offset: int = Query(0, ge=0),
) -> dict[str, Any]:
    connection = active_connection(database)
    if connection is None:
        return {'items': [], 'total': 0, 'limit': limit, 'offset': offset}
    filters = [HAEntity.connection_id == connection.id]
    allowed_entity_ids = viewer_entity_ids(database, viewer)
    if allowed_entity_ids is not None:
        if not allowed_entity_ids:
            return {'items': [], 'total': 0, 'limit': limit, 'offset': offset}
        filters.append(HAEntity.entity_id.in_(allowed_entity_ids))
    if search:
        pattern = f'%{search.strip()}%'
        filters.append(or_(HAEntity.entity_id.ilike(pattern), HAEntity.name.ilike(pattern)))
    if domain:
        filters.append(HAEntity.domain == domain)
    if area_id:
        filters.append(HAEntity.area_id == area_id)
    if sync_status:
        filters.append(HAEntity.sync_status == sync_status)
    rows = (
        database.execute(
            select(HAEntity, func.count().over().label('total_count'))
            .where(*filters)
            .order_by(HAEntity.domain, HAEntity.entity_id)
            .offset(offset)
            .limit(limit)
        ).all()
    )
    items = [row[0] for row in rows]
    total = int(rows[0][1]) if rows else int(database.scalar(select(func.count()).select_from(HAEntity).where(*filters)) or 0)
    return {
        'items': [
            {
                'entityId': item.entity_id,
                'domain': item.domain,
                'name': item.name,
                'icon': item.icon,
                'deviceId': item.device_id,
                'areaId': item.area_id,
                'platform': item.platform,
                'translationKey': item.translation_key,
                'hasEntityName': item.has_entity_name,
                'uniqueId': item.unique_id,
                'originalName': item.original_name,
                'disabledBy': item.disabled_by,
                'status': item.sync_status,
                'lastSeenAt': item.last_seen_at,
                'missingSince': item.missing_since,
            }
            for item in items
        ],
        'total': total,
        'limit': limit,
        'offset': offset,
    }


@router.get('/percentage-sources')
async def list_percentage_sources(
    request: Request,
    database: DatabaseSession,
    _user: LicensedUser,
) -> dict[str, Any]:
    connection = active_connection(database)
    if connection is None:
        return {'items': []}
    allowed_ids = set(
        database.scalars(
            select(HAEntity.entity_id).where(
                HAEntity.connection_id == connection.id,
                HAEntity.sync_status != 'missing',
                HAEntity.disabled_by.is_(None),
            )
        ).all()
    )
    try:
        states = await (await request.app.state.ha_connector.client_for(connection)).fetch_all_states()
    except (HAClientError, CredentialCipherError) as error:
        raise HTTPException(status_code=502, detail=str(error)) from error
    return {'items': percentage_sources(states, allowed_ids)}


@router.get('/numeric-sources')
async def list_numeric_sources(
    request: Request,
    database: DatabaseSession,
    _user: LicensedUser,
) -> dict[str, Any]:
    connection = active_connection(database)
    if connection is None:
        return {'items': []}
    allowed_ids = set(
        database.scalars(
            select(HAEntity.entity_id).where(
                HAEntity.connection_id == connection.id,
                HAEntity.sync_status.notin_(['missing', 'disabled']),
                HAEntity.disabled_by.is_(None),
                HAEntity.domain.in_(['sensor', 'number', 'input_number']),
            )
        ).all()
    )
    try:
        states = await (await request.app.state.ha_connector.client_for(connection)).fetch_all_states()
    except (HAClientError, CredentialCipherError) as error:
        raise HTTPException(status_code=502, detail=str(error)) from error
    return {'items': numeric_sources(states, allowed_ids)}


@router.get('/translations')
async def entity_translations(
    request: Request,
    _database: DatabaseSession,
    _viewer: LicensedViewer,
) -> dict[str, Any]:
    connection, integrations = await asyncio.to_thread(load_translation_context, request.app.state.database)
    if connection is None:
        return {'language': 'zh-Hans', 'resources': {}}
    try:
        resources = await (await request.app.state.ha_connector.client_for(connection)).fetch_entity_translations(
            integrations,
            language='zh-Hans',
        )
    except (HAClientError, CredentialCipherError) as error:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(error)) from error
    return {'language': 'zh-Hans', 'resources': resources}


@router.get('/history')
async def entity_history(
    request: Request,
    _database: DatabaseSession,
    viewer: LicensedViewer,
    entity_id: str = Query(alias='entityId', min_length=3, max_length=255),
    hours: int = Query(24, ge=1, le=168),
) -> dict[str, Any]:
    connection, entity_exists = await asyncio.to_thread(
        load_authorized_entity_context,
        request.app.state.database,
        viewer,
        entity_id,
    )
    if connection is None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail='请先配置 Home Assistant 连接。')
    if not entity_exists:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='实体不存在、已禁用或已失联。')
    start_time = (datetime.now(UTC) - timedelta(hours=hours)).isoformat()
    try:
        history = await request.app.state.ha_connector.fetch_history(connection, entity_id, start_time, hours)
    except (HAClientError, CredentialCipherError) as error:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(error)) from error
    points = []
    for item in history:
        value = history_state_value(item.get('state'))
        if value is None:
            continue
        timestamp = item.get('last_updated') or item.get('last_changed')
        if not timestamp:
            continue
        points.append({'timestamp': str(timestamp), 'value': value})
    if len(points) > 480:
        step = len(points) / 480
        points = [points[min(len(points) - 1, int(index * step))] for index in range(480)]
    return {'entityId': entity_id, 'hours': hours, 'points': points}


def history_state_value(raw_state: Any) -> float | str | None:
    try:
        return float(raw_state)
    except (TypeError, ValueError):
        value = str(raw_state or '').strip()
        return value or None


@router.get('/areas')
def list_areas(database: DatabaseSession, _user: LicensedUser) -> dict[str, Any]:
    connection = active_connection(database)
    if connection is None:
        return {'items': []}
    areas = database.scalars(
        select(HAArea).where(HAArea.connection_id == connection.id, HAArea.sync_status == 'active').order_by(HAArea.name)
    )
    return {
        'items': [
            {
                'areaId': item.area_id,
                'name': item.name,
                'aliases': json.loads(item.aliases_json),
                'status': item.sync_status,
            }
            for item in areas
        ]
    }


@router.get('/devices')
def list_devices(database: DatabaseSession, viewer: LicensedViewer) -> dict[str, Any]:
    connection = active_connection(database)
    if connection is None:
        return {'items': []}
    filters = [
        HADevice.connection_id == connection.id,
        HADevice.sync_status == 'active',
        HADevice.disabled_by.is_(None),
    ]
    allowed_entity_ids = viewer_entity_ids(database, viewer)
    if allowed_entity_ids is not None:
        if not allowed_entity_ids:
            return {'items': []}
        allowed_device_ids = select(HAEntity.device_id).where(
            HAEntity.connection_id == connection.id,
            HAEntity.entity_id.in_(allowed_entity_ids),
            HAEntity.device_id.is_not(None),
        )
        filters.append(HADevice.device_id.in_(allowed_device_ids))
    devices = database.scalars(
        select(HADevice).where(*filters).order_by(HADevice.name_by_user, HADevice.name)
    )
    return {
        'items': [
            {
                'deviceId': item.device_id,
                'name': item.name_by_user or item.name,
                'manufacturer': item.manufacturer,
                'model': item.model,
                **({'registryMetadata': json.loads(item.registry_metadata_json)} if item.registry_metadata_json else {}),
                'areaId': item.area_id,
                'status': item.sync_status,
            }
            for item in devices
        ]
    }


@router.get('/sync/status')
def sync_status(request: Request, database: DatabaseSession, _viewer: LicensedViewer) -> dict[str, Any]:
    connection = active_connection(database)
    if connection is None:
        return {'configured': False, 'status': 'not_configured', 'connected': False}
    state = database.get(HASyncState, connection.id)
    return {
        'configured': True,
        'connected': request.app.state.ha_connector.connected,
        'status': state.status if state else 'idle',
        'phase': state.phase if state else None,
        'lastFullSyncAt': state.last_full_sync_at if state else None,
        'lastIncrementalAt': state.last_incremental_at if state else None,
        'lastReconciledAt': state.last_reconciled_at if state else None,
        'catalogRevision': state.catalog_revision if state else 0,
        'counts': {
            'entities': state.entity_count if state else 0,
            'devices': state.device_count if state else 0,
            'areas': state.area_count if state else 0,
        },
        'lastError': None
        if request.app.state.ha_connector.connected
        else connection_error_message(
            request.app.state.ha_connector.runtime_error or (state.last_error if state else None)
        ),
    }


@router.post('/sync')
async def run_sync(request: Request, _database: DatabaseSession, user: LicensedUser) -> dict[str, Any]:
    if not request.app.state.license_service.allows('ha.sync'):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='当前授权不允许同步 Home Assistant。')
    require_admin(user)
    connection = await asyncio.to_thread(load_active_connection_snapshot, request.app.state.database)
    if connection is None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail='请先配置 Home Assistant 连接。')
    try:
        counts = await request.app.state.ha_connector.sync_once(connection.id, reconciled=True)
    except (HAClientError, CredentialCipherError) as error:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(error)) from error
    return {'ok': True, 'counts': counts}


@router.get('/health')
def ha_health(request: Request, _database: DatabaseSession, _viewer: LicensedViewer) -> dict[str, Any]:
    connection = active_connection(_database)
    connected = request.app.state.ha_connector.connected
    return {
        'configured': connection is not None,
        'connected': connected,
        'lastError': None
        if connected
        else connection_error_message(
            request.app.state.ha_connector.runtime_error or (connection.last_error if connection else None)
        ),
    }


@router.post('/services/call')
async def call_service(
    payload: HAServiceCallRequest,
    request: Request,
    _database: DatabaseSession,
    viewer: LicensedViewer,
) -> dict[str, Any]:
    if not request.app.state.license_service.allows('ha.control'):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='当前授权不允许控制 Home Assistant。')
    allowed_fields = ALLOWED_SERVICES.get((payload.domain, payload.service))
    if allowed_fields is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail='该 Home Assistant 服务不在允许列表中。',
        )
    unknown_fields = set(payload.data) - allowed_fields
    if unknown_fields:
        unknown = ', '.join(sorted(unknown_fields))
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f'服务参数不允许：{unknown}',
        )
    if payload.domain == 'light' and payload.service == 'turn_on':
        color_fields = {'white', 'hs_color', 'rgb_color', 'color_temp_kelvin'} & set(payload.data)
        if len(color_fields) > 1:
            raise HTTPException(422, detail='一次灯光指令只能指定一种颜色或色温。')
        if 'white' in payload.data:
            white = payload.data['white']
            if not (isinstance(white, bool) or (isinstance(white, int) and 0 <= white <= 255)):
                raise HTTPException(422, detail='白光亮度参数无效。')
        for field, bounds in (('hs_color', (360, 100)), ('rgb_color', (255, 255, 255))):
            if field not in payload.data:
                continue
            values = payload.data[field]
            if (
                not isinstance(values, list)
                or len(values) != len(bounds)
                or any(
                    isinstance(v, bool)
                    or not isinstance(v, (int, float))
                    or not math.isfinite(v)
                    or not (0 <= v <= bound)
                    for v, bound in zip(values, bounds, strict=True)
                )
            ):
                raise HTTPException(422, detail=f'灯光颜色参数无效：{field}')

    entity_domain = payload.entity_id.partition('.')[0]
    if payload.domain == 'homeassistant' and payload.service == 'toggle' and entity_domain not in TOGGLE_ENTITY_DOMAINS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail='该实体类型不支持切换动作。',
        )
    if payload.domain != 'homeassistant' and entity_domain != payload.domain:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail='服务域与实体域不匹配。',
        )
    connection, entity_exists = await asyncio.to_thread(
        load_authorized_entity_context,
        request.app.state.database,
        viewer,
        payload.entity_id,
    )
    if connection is None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail='请先配置 Home Assistant 连接。')
    if not entity_exists:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='实体不存在、已禁用或已失联。')
    try:
        result = await (await request.app.state.ha_connector.client_for(connection)).call_service(
            payload.domain,
            payload.service,
            payload.entity_id,
            payload.data,
        )
    except (HAClientError, CredentialCipherError) as error:
        request.state.diagnostic_error_logged = True
        request.app.state.global_log.append(
            'error',
            '仪表盘编辑器' if viewer.is_admin_session else '展示设备',
            '设备操作',
            f'操作失败：{payload.entity_id} · {payload.domain}.{payload.service} · {error}',
            context={
                'entityId': payload.entity_id,
                'service': f'{payload.domain}.{payload.service}',
                'status': 502,
            },
            details=traceback.format_exc(),
        )
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(error)) from error
    request.app.state.global_log.append(
        'success',
        '仪表盘编辑器' if viewer.is_admin_session else '展示设备',
        '设备操作',
        f'操作成功：{payload.entity_id} · {payload.domain}.{payload.service}',
        context={
            'entityId': payload.entity_id,
            'service': f'{payload.domain}.{payload.service}',
        },
    )
    return {'ok': True, 'result': result}


@router.post('/media/browse')
async def browse_media(
    payload: HABrowseMediaRequest,
    request: Request,
    _database: DatabaseSession,
    viewer: LicensedViewer,
) -> dict[str, Any]:
    if not request.app.state.license_service.allows('ha.control'):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='当前授权不允许控制 Home Assistant。')
    entity_domain = payload.entity_id.partition('.')[0]
    if entity_domain != 'media_player':
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail='媒体浏览只能用于媒体播放器实体。',
        )
    connection, entity_exists = await asyncio.to_thread(
        load_authorized_entity_context,
        request.app.state.database,
        viewer,
        payload.entity_id,
    )
    if connection is None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail='请先配置 Home Assistant 连接。')
    if not entity_exists:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='实体不存在、已禁用或已失联。')
    try:
        client = await request.app.state.ha_connector.client_for(connection)
        browse = client.browse_player_media if payload.player_library else client.browse_media
        result = await browse(
            payload.entity_id,
            payload.media_content_id,
            payload.media_content_type or None,
        )
    except (HAClientError, CredentialCipherError) as error:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(error)) from error
    return {'ok': True, 'result': result}


def websocket_viewer(websocket: WebSocket) -> ViewerPrincipal | None:
    settings = websocket.app.state.settings
    token = websocket.cookies.get(settings.cookie_name, '')
    with websocket.app.state.database.session_factory() as database:
        if token:
            record = database.scalar(select(LoginSession).where(LoginSession.id_hash == session_token_hash(token)))
            now = datetime.now(UTC)
            if record is not None and record.expires_at.replace(tzinfo=UTC) > now:
                user = database.get(User, record.user_id)
                if user is not None and user.is_active:
                    database.expunge(user)
                    return ViewerPrincipal(user=user)
        display_token = websocket.cookies.get(settings.display_cookie_name, '')
        device = active_display_device(database, display_token)
        devices = list(embedded_devices(websocket, database))
        if device is not None:
            devices = [device] + [item for item in devices if item.id != device.id]
        if not devices:
            return None
        for item in devices:
            database.expunge(item)
        return ViewerPrincipal(
            display=devices[0],
            additional_displays=tuple(devices[1:]),
        )


def websocket_origin_allowed(websocket: WebSocket) -> bool:
    """要求浏览器 WebSocket 必须源自本应用主机。"""
    origin = websocket.headers.get('origin', '').strip()
    if not origin:
        return False
    configured_base_url = websocket.app.state.settings.app_base_url
    if configured_base_url:
        parsed = urlsplit(configured_base_url)
        expected_origin = f'{parsed.scheme}://{parsed.netloc}' if parsed.scheme in {'http', 'https'} and parsed.netloc else ''
        return bool(expected_origin) and origin == expected_origin
    parsed_origin = urlsplit(origin)
    host = websocket.headers.get('host', '').strip()
    if parsed_origin.scheme not in {'http', 'https'} or not parsed_origin.netloc or parsed_origin.username is not None or parsed_origin.password is not None or parsed_origin.path not in {'', '/'} or parsed_origin.query or parsed_origin.fragment or not host:
        return False
    return parsed_origin.netloc.casefold() == host.casefold()


@runtime_router.websocket('/ws/runtime')
async def runtime_websocket(websocket: WebSocket) -> None:
    context = {
        'requestId': uuid4().hex,
        'path': '/api/v1/ws/runtime',
        'method': 'WEBSOCKET',
    }
    token = event_context.set(context)
    try:
        await _runtime_websocket(websocket, context)
    except Exception as error:
        _runtime_log(
            websocket,
            'error',
            f'实时连接异常：{error}',
            context,
            details=traceback.format_exc(),
        )
        raise
    finally:
        event_context.reset(token)


def _runtime_log(
    websocket: WebSocket,
    level: str,
    message: str,
    context: dict,
    *,
    details: str | None = None,
) -> None:
    log = getattr(websocket.app.state, 'global_log', None)
    if log is not None:
        source = (
            '展示设备'
            if context.get('displayId')
            else ('仪表盘编辑器' if context.get('actor') else '系统后台')
        )
        log.append(level, source, '实时连接', message, context=context, details=details)


async def _runtime_send_json(websocket: WebSocket, payload: dict) -> None:
    try:
        await websocket.send_json(payload)
    except RuntimeError as error:
        if str(error) in {
            'Cannot call "send" once a close message has been sent.',
            "Unexpected ASGI message 'websocket.send', after sending 'websocket.close'.",
            "Unexpected ASGI message 'websocket.send', after sending 'websocket.close' or response already completed.",
        }:
            raise WebSocketDisconnect(code=1006) from error
        raise


async def _runtime_websocket(websocket: WebSocket, context: dict) -> None:
    async def close_with_log(code: int, reason: str, *, send_reason: bool = True) -> None:
        _runtime_log(
            websocket,
            'warning',
            f'实时连接已关闭：{reason}',
            {**context, 'code': str(code), 'phase': 'rejected'},
        )
        await websocket.close(code=code, reason=reason if send_reason else None)

    if not websocket_origin_allowed(websocket):
        await close_with_log(4403, 'origin not allowed')
        return
    viewer = await asyncio.to_thread(websocket_viewer, websocket)
    if viewer is None:
        await close_with_log(4401, 'authentication required', send_reason=False)
        return
    if viewer.user is not None:
        context['actor'] = getattr(viewer.user, 'username', None)
    if viewer.display is not None:
        context.update(
            displayId=viewer.display.id,
            displayName=getattr(viewer.display, 'name', None),
            projectId=viewer.display.project_id,
        )
    if not await asyncio.to_thread(websocket.app.state.license_service.allows, 'runtime.websocket'):
        await close_with_log(4403, 'license restricted', send_reason=False)
        return
    await websocket.accept()
    _runtime_log(websocket, 'info', '实时连接已建立', {**context, 'phase': 'accepted'})
    queue = websocket.app.state.ha_connector.state_hub.subscribe()
    entity_ids = set()
    watching = False
    display_binding_cache = None

    async def display_binding_matches() -> bool:
        nonlocal display_binding_cache
        if viewer.display is None:
            return True
        now = time.monotonic()
        if display_binding_cache is not None and now - display_binding_cache[0] < DISPLAY_BINDING_CACHE_SECONDS:
            return display_binding_cache[1]

        def load_binding_match() -> bool:
            with websocket.app.state.database.session_factory() as database:
                current_display = active_display_device(database, websocket.cookies.get(websocket.app.state.settings.display_cookie_name, ''))
                current = list(embedded_devices(websocket, database))
                if current_display is not None:
                    current.append(current_display)
                return {(item.id, item.project_id) for item in current} == {
                    (item.id, item.project_id) for item in viewer.displays
                }

        matches = await asyncio.to_thread(load_binding_match)
        display_binding_cache = (time.monotonic(), matches)
        return matches

    try:
        subscribe = await asyncio.wait_for(websocket.receive_json(), timeout=30)
        if subscribe.get('type') != 'subscribe' or not isinstance(subscribe.get('entityIds'), list):
            await close_with_log(4400, 'subscribe message required')
            return
        entity_ids = {str(value) for value in subscribe['entityIds'] if isinstance(value, str)}
        if viewer.project_id is not None:

            def load_allowed_entity_ids() -> set[str]:
                """中控设备可见的实体集合。"""
                with websocket.app.state.database.session_factory() as database:
                    return viewer_entity_ids(database, viewer) or set()

            allowed_entity_ids = await asyncio.to_thread(load_allowed_entity_ids)
            entity_ids.intersection_update(allowed_entity_ids)
        if len(entity_ids) > MAX_RUNTIME_ENTITIES:
            await close_with_log(4400, 'too many entities')
            return
        websocket.app.state.ha_connector.state_hub.set_subscription_entities(queue, entity_ids)
        await websocket.app.state.ha_connector.add_runtime_entity_watch(entity_ids, ensure_states=False)
        watching = True

        async def send_updates() -> None:
            """推送初始快照，然后持续转发状态事件并保活。"""
            initial_snapshot = await websocket.app.state.ha_connector.state_hub.snapshot(entity_ids)
            await _runtime_send_json(websocket, {'type': 'snapshot', 'states': initial_snapshot})
            await websocket.app.state.ha_connector.ensure_entity_states(entity_ids)
            hydrated_snapshot = await websocket.app.state.ha_connector.state_hub.snapshot(entity_ids)
            if hydrated_snapshot != initial_snapshot:
                await _runtime_send_json(websocket, {'type': 'snapshot', 'states': hydrated_snapshot})
            while True:
                if not await display_binding_matches():
                    await close_with_log(4401, 'display pairing changed')
                    return
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=5 if viewer.display else 25)
                except TimeoutError:
                    if not await display_binding_matches():
                        await close_with_log(4401, 'display pairing changed')
                        return
                    await _runtime_send_json(websocket, {'type': 'ping'})
                    continue
                if not await display_binding_matches():
                    await close_with_log(4401, 'display pairing changed')
                    return
                await _runtime_send_json(websocket, event)
            return

        async def receive_disconnect() -> None:
            """另一路任务只负责感知客户端断开。"""
            while True:
                message = await websocket.receive()
                if message['type'] == 'websocket.disconnect':
                    raise WebSocketDisconnect(code=message.get('code', 1000))

        async def run_until_closed(operation) -> None:
            """跑一路任务，结束后取消另一路，并把真正的异常留给外层分流。"""
            nonlocal failure
            try:
                await operation()
            except Exception as error:
                if failure is None or not isinstance(error, WebSocketDisconnect):
                    failure = error
            finally:
                tasks.cancel_scope.cancel()

        failure = None
        async with create_task_group() as tasks:
            tasks.start_soon(run_until_closed, send_updates)
            tasks.start_soon(run_until_closed, receive_disconnect)
        if failure is not None:
            raise failure
    except WebSocketDisconnect as error:
        if error.code not in {1000, 1001, 1005}:
            _runtime_log(
                websocket,
                'warning',
                '实时连接异常断开',
                {**context, 'code': str(error.code), 'phase': 'disconnected'},
            )
    except TimeoutError:
        _runtime_log(
            websocket,
            'warning',
            '实时连接等待订阅超时',
            {**context, 'code': 'SUBSCRIBE_TIMEOUT', 'phase': 'subscribe'},
        )
    finally:
        try:
            if watching:
                await websocket.app.state.ha_connector.remove_runtime_entity_watch(entity_ids)
        finally:
            websocket.app.state.ha_connector.state_hub.unsubscribe(queue)
    return
