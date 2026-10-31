"""Home Assistant 集成的主接口面：连接配置、目录查询、历史、同步与设备控制，按 api / ha.control / ha.sync / ha.configure 四档能力码放行。"""

from __future__ import annotations

import asyncio
import contextlib
import json
import time
import traceback
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any
from urllib.parse import urlsplit
from uuid import uuid4

from anyio import CancelScope, create_task_group
from fastapi import APIRouter, HTTPException, Query, Request, WebSocket, WebSocketDisconnect, status
from sqlalchemy import func, or_, select

from ...config import DEFAULT_RUNTIME_ACCESS_CACHE_SECONDS
from ...dependencies import (
    DatabaseSession,
    LicensedUser,
    LicensedViewer,
    ViewerPrincipal,
    require_viewer_entity,
    viewer_entity_ids,
)
from ...domains.ha.integration.client import HAClientError
from ...domains.ha.integration.connection_query import active_connection, load_active_connection_snapshot
from ...domains.ha.integration.connection_setup import addresses_label, failed_endpoint_summary, probe_endpoints
from ...domains.ha.integration.crypto import CredentialCipherError
from ...domains.ha.integration.endpoints import HAEndpoint, endpoint_candidates
from ...domains.ha.integration.errors import connection_error_message
from ...domains.ha.integration.numeric_sources import numeric_sources
from ...domains.ha.integration.percentage_sources import percentage_sources
from ...domains.ha.integration.service_call import (
    ServiceCallRejected,
    execute_service_call,
    load_ha_entity_context,
)
from ...domains.license import features as feature_codes
from ...domains.logs.global_log import event_context
from ...platform.core.database import Database
from ...platform.core.db_exec import run_db
from ...platform.core.models import HAArea, HAConnection, HADevice, HAEntity, HASyncState, LoginSession, User
from ...platform.security.session_store import session_token_hash
from ...schemas import (
    HABrowseMediaRequest,
    HAConnectionInput,
    HAServiceCallRequest,
    HATestRequest,
)

router = APIRouter(prefix='/ha', tags=['home-assistant'])
runtime_router = APIRouter(tags=['runtime'])
MAX_RUNTIME_ENTITIES = 1000
# 实时连接的授权复检间隔（秒）：连接建立后授权仍可能到期或被吊销，
# 长连必须周期性回看，否则一份过期授权可以靠一条已建立的连接无限用下去。
RUNTIME_LICENSE_CHECK_SECONDS = 30
#: `/ws/runtime` 出站合并窗口（秒）。只吸收「同一瞬间到达」的事件（场景切换 / 全屋开关），
#: 小于一帧（16ms），不会让单条状态更新多等一帧。
RUNTIME_STATE_BATCH_WINDOW_SECONDS = 0.012
#: 出站合并的「探测窗口」：先只等这么久判断是否处于突发，孤立事件只付这点延迟。
RUNTIME_DRAIN_PROBE_SECONDS = 0.002


def _runtime_access_cache_seconds(websocket: WebSocket) -> float:
    """实时连接出站帧复用授权复检结果的秒数；非法值回落到默认 30 秒。"""
    settings = getattr(websocket.app.state, 'settings', None)
    value = getattr(settings, 'runtime_access_cache_seconds', DEFAULT_RUNTIME_ACCESS_CACHE_SECONDS)
    try:
        seconds = float(value)
    except (TypeError, ValueError):
        return DEFAULT_RUNTIME_ACCESS_CACHE_SECONDS
    return seconds if seconds >= 0 else DEFAULT_RUNTIME_ACCESS_CACHE_SECONDS


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
    enabled_only: bool = False,
) -> tuple[HAConnection | None, bool]:
    """连接 + 实体是否可用（带查看者 ACL）。

    默认**不**排除已禁用实体（0.7.8 的 `enabled_only=False`）：配置校验时，
    绑定了稍后被禁用的实体不应该让保存失败（否则用户连"把这台设备删掉"都做不到），
    只要实体在库里存在且未被删除即可。
    需要严格"实体存在、已启用且未失联"的运行时控制路径，显式传 `enabled_only=True`。

    判定条件本身在 ``service_call.ha_entity_conditions`` —— 本函数只做「把查看者
    ACL 注入进去」，不再自带一份 SQL 条件（旧实现三处各写一遍，容易漂移）。
    """
    return load_ha_entity_context(
        database_manager,
        entity_id,
        access_check=lambda database, target: require_viewer_entity(database, viewer, target),
        enabled_only=enabled_only,
    )


def connection_payload(connection: HAConnection | None, request: Request) -> dict[str, Any]:
    connector = request.app.state.studio_ha
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
async def delete_connection(request: Request, database: DatabaseSession, _user: LicensedUser) -> None:
    connection = active_connection(database)
    if connection is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Home Assistant 连接不存在。')
    connector = request.app.state.studio_ha
    await connector.stop()
    try:
        def _delete_connection_row() -> None:
            database.delete(connection)
            database.commit()

        await run_db(_delete_connection_row)
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
    await request.app.state.global_log.append_async('warning', 'Home Assistant', '连接', 'Home Assistant 连接配置已删除')


@router.post('/test')
async def test_connection(
    command: HATestRequest,
    request: Request,
    database: DatabaseSession,
    _user: LicensedUser,
) -> dict[str, Any]:
    connection = active_connection(database)
    try:
        token = command.access_token or (
            request.app.state.studio_ha.cipher.decrypt(connection.encrypted_access_token)
            if connection
            else None
        )
        if not token:
            raise HAClientError('首次连接必须输入 Home Assistant 访问令牌。')
        # 与「保存连接」走同一个开关推导：未显式提交就沿用已保存值，
        # 避免测试连接和保存后的实际连接用两套 TLS 口径。
        verify_tls, external_verify_tls = _connection_verify_flags(command, connection)
        endpoints = endpoint_candidates(command.base_url, verify_tls, command.external_base_url, external_verify_tls)
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


@dataclass(frozen=True)
class _ConnectionTargets:
    """探测后确定的内网 / 外网地址与版本摘要。"""

    internal: str
    external: str | None
    tested: dict[str, Any]


def _connection_verify_flags(
    connection_input: HAConnectionInput, connection: HAConnection | None
) -> tuple[bool, bool]:
    """未显式提交时沿用已保存的 TLS 校验开关。"""
    verify_tls = (
        connection.verify_tls
        if connection and 'verify_tls' not in connection_input.model_fields_set
        else connection_input.verify_tls
    )
    external_verify_tls = (
        connection.external_verify_tls
        if connection and 'external_verify_tls' not in connection_input.model_fields_set
        else connection_input.external_verify_tls
    )
    return verify_tls, external_verify_tls


def _connection_access_token(
    connection_input: HAConnectionInput,
    connection: HAConnection | None,
    connector: Any,
    new_addresses: tuple[str, str | None],
    previous_addresses: tuple[str, str | None] | None,
) -> str:
    """确定本次保存使用的令牌：显式提交优先，否则判断已保存令牌能否复用。"""
    if connection_input.access_token:
        return connection_input.access_token
    if connection is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail='首次连接必须输入 Home Assistant 访问令牌。',
        )
    if new_addresses != previous_addresses and not connection_input.reuse_token_for_new_url:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                'code': 'HA_URL_CHANGED_TOKEN_REUSE',
                'message': '地址已变更：复用已保存的 Home Assistant 令牌前请确认新地址可信（确认后重发 reuseTokenForNewUrl=true，或直接重新输入令牌）。',
            },
        )
    try:
        return connector.cipher.decrypt(connection.encrypted_access_token)
    except CredentialCipherError as error:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(error),
        ) from error


async def _probe_connection_endpoints(
    request: Request, endpoints: Sequence[HAEndpoint], token: str
) -> list[dict[str, Any]]:
    """探测候选端点；连接层异常按原样转 422。"""
    try:
        return await probe_endpoints(
            endpoints, token, request.app.state.settings.ha_request_timeout_seconds
        )
    except HAClientError as error:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=connection_error_message(error),
        ) from error


def _resolved_connection_targets(
    test_results: list[dict[str, Any]], connection_input: HAConnectionInput
) -> _ConnectionTargets:
    """从探测结果里取主端点、最终内网 / 外网地址与版本摘要。"""
    reachable = [probe_entry for probe_entry in test_results if probe_entry['ok']]
    if not reachable:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=failed_endpoint_summary(test_results))
    primary = reachable[0]
    resolved_internal = next(
        (probe_entry['baseUrl'] for probe_entry in test_results if probe_entry['kind'] == 'internal'),
        connection_input.base_url,
    )
    resolved_external = next(
        (probe_entry['baseUrl'] for probe_entry in test_results if probe_entry['kind'] == 'external'),
        None,
    )
    tested = {'version': primary.get('version'), 'locationName': primary.get('locationName')}
    return _ConnectionTargets(internal=resolved_internal, external=resolved_external, tested=tested)


def _create_connection_row(
    connection_input: HAConnectionInput,
    connector: Any,
    token: str,
    verify_tls: bool,
    external_verify_tls: bool,
    targets: _ConnectionTargets,
) -> HAConnection:
    """首次保存：构造 HAConnection 行。"""
    return HAConnection(
        name=connection_input.name.strip(),
        base_url=targets.internal,
        external_base_url=targets.external,
        encrypted_access_token=connector.cipher.encrypt(token),
        verify_tls=verify_tls,
        external_verify_tls=external_verify_tls,
        ha_version=targets.tested.get('version'),
    )


def _update_connection_row(
    connection: HAConnection,
    connection_input: HAConnectionInput,
    connector: Any,
    verify_tls: bool,
    external_verify_tls: bool,
    targets: _ConnectionTargets,
) -> None:
    """覆盖已保存连接的地址 / 证书开关 / 版本，并清掉上次错误状态。"""
    connection.name = connection_input.name.strip()
    connection.base_url = targets.internal
    connection.external_base_url = targets.external
    connection.verify_tls = verify_tls
    connection.external_verify_tls = external_verify_tls
    connection.ha_version = targets.tested.get('version')
    connection.last_error = None
    connection.active_endpoint = None
    if connection_input.access_token:
        connection.encrypted_access_token = connector.cipher.encrypt(connection_input.access_token)


async def _log_connection_address_change(
    request: Request,
    connection_input: HAConnectionInput,
    previous_addresses: tuple[str, str | None] | None,
    connection: HAConnection,
) -> None:
    """地址变更时写一条 warning 日志（区分是否同时更新了令牌）。"""
    if previous_addresses is None or previous_addresses == (connection.base_url, connection.external_base_url):
        return
    previous_label = addresses_label(*previous_addresses)
    current_label = addresses_label(connection.base_url, connection.external_base_url)
    await request.app.state.global_log.append_async(
        'warning',
        'Home Assistant',
        '连接',
        f'Home Assistant 地址已变更：{previous_label} → {current_label}（令牌已复用，请确认新地址可信）'
        if not connection_input.access_token
        else f'Home Assistant 地址已变更：{previous_label} → {current_label}（同时更新了令牌）',
    )


async def _log_connection_endpoint_warnings(
    request: Request, test_results: list[dict[str, Any]], connection: HAConnection
) -> None:
    """保存成功后记录不可达备用地址与整体成功日志。"""
    if [probe_entry for probe_entry in test_results if not probe_entry['ok']]:
        await request.app.state.global_log.append_async(
            'warning',
            'Home Assistant',
            '连接',
            f'Home Assistant 连接已保存，但以下地址当前不通（将作为备用，不通时自动跳过）：{failed_endpoint_summary(test_results)}',
        )
    await request.app.state.global_log.append_async(
        'success',
        'Home Assistant',
        '连接',
        f'Home Assistant 连接配置已保存（{connection.name}，版本 {connection.ha_version or "未知"}）',
    )


@router.put('/connection')
async def save_connection(
    command: HAConnectionInput,
    request: Request,
    database: DatabaseSession,
    _user: LicensedUser,
) -> dict[str, Any]:
    if not request.app.state.license_service.allows(feature_codes.FEATURE_HA_CONFIGURE):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='当前授权不允许配置 Home Assistant。')
    connector = request.app.state.studio_ha
    connection = active_connection(database)
    verify_tls, external_verify_tls = _connection_verify_flags(command, connection)
    endpoints = endpoint_candidates(command.base_url, verify_tls, command.external_base_url, external_verify_tls)
    new_addresses = (command.base_url, command.external_base_url)
    previous_addresses = (
        (connection.base_url, connection.external_base_url) if connection is not None else None
    )
    token = _connection_access_token(command, connection, connector, new_addresses, previous_addresses)
    test_results = await _probe_connection_endpoints(request, endpoints, token)
    targets = _resolved_connection_targets(test_results, command)
    def _persist_connection() -> HAConnection:
        row = connection
        if row is None:
            row = _create_connection_row(command, connector, token, verify_tls, external_verify_tls, targets)
            database.add(row)
        else:
            _update_connection_row(row, command, connector, verify_tls, external_verify_tls, targets)
        database.commit()
        database.refresh(row)
        return row

    connection = await run_db(_persist_connection)
    await connector.restart()
    await _log_connection_address_change(request, command, previous_addresses, connection)
    await _log_connection_endpoint_warnings(request, test_results, connection)
    return {**connection_payload(connection, request), 'test': targets.tested, 'endpoints': test_results}


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
                'displayPrecision': item.display_precision,
                'suggestedDisplayPrecision': item.suggested_display_precision,
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
    allowed_ids = await run_db(
        lambda: set(
            database.scalars(
                select(HAEntity.entity_id).where(
                    HAEntity.connection_id == connection.id,
                    HAEntity.sync_status != 'missing',
                    HAEntity.disabled_by.is_(None),
                )
            ).all()
        )
    )
    try:
        states = await (await request.app.state.studio_ha.client_for(connection)).fetch_all_states()
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
    allowed_ids = await run_db(
        lambda: set(
            database.scalars(
                select(HAEntity.entity_id).where(
                    HAEntity.connection_id == connection.id,
                    HAEntity.sync_status.notin_(['missing', 'disabled']),
                    HAEntity.disabled_by.is_(None),
                    HAEntity.domain.in_(['sensor', 'number', 'input_number']),
                )
            ).all()
        )
    )
    try:
        states = await (await request.app.state.studio_ha.client_for(connection)).fetch_all_states()
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
        resources = await request.app.state.studio_ha.entity_translations(
            connection,
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
        history = await request.app.state.studio_ha.fetch_history(connection, entity_id, start_time, hours)
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
        'connected': request.app.state.studio_ha.connected,
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
        if request.app.state.studio_ha.connected
        else connection_error_message(
            request.app.state.studio_ha.runtime_error or (state.last_error if state else None)
        ),
    }


@router.post('/sync')
async def run_sync(request: Request, _database: DatabaseSession, _user: LicensedUser) -> dict[str, Any]:
    if not request.app.state.license_service.allows(feature_codes.FEATURE_HA_SYNC):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='当前授权不允许同步 Home Assistant。')
    connection = await asyncio.to_thread(load_active_connection_snapshot, request.app.state.database)
    if connection is None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail='请先配置 Home Assistant 连接。')
    try:
        counts = await request.app.state.studio_ha.sync_once(connection.id, reconciled=True)
    except (HAClientError, CredentialCipherError) as error:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(error)) from error
    return {'ok': True, 'counts': counts}


@router.get('/health')
def ha_health(request: Request, _database: DatabaseSession, _viewer: LicensedViewer) -> dict[str, Any]:
    connection = active_connection(_database)
    connected = request.app.state.studio_ha.connected
    return {
        'configured': connection is not None,
        'connected': connected,
        'lastError': None
        if connected
        else connection_error_message(
            request.app.state.studio_ha.runtime_error or (connection.last_error if connection else None)
        ),
    }


@router.post('/services/call')
async def call_service(
    command: HAServiceCallRequest,
    request: Request,
    _database: DatabaseSession,
    viewer: LicensedViewer,
) -> dict[str, Any]:
    # 校验与下发全部住在 ``domains/ha/integration/service_call.py``（唯一出口）：
    # HTTP 语义只在这一行转换，状态码与 detail 文案保持字节级不变。
    try:
        result = await execute_service_call(
            request,
            command,
            access_check=lambda database, entity_id: require_viewer_entity(database, viewer, entity_id),
        )
    except ServiceCallRejected as error:
        raise HTTPException(status_code=error.status_code, detail=error.detail) from error
    _mark_agent_local_control(request, command.entity_id)
    return result


def _mark_agent_local_control(request: Request, entity_id: str) -> None:
    """把 App / 网页下发的控制标记成「手动操作」。

    智能管家时序服务据此把随后的状态翻转归因为 ``MANUAL_APP``，而不是外部设备；
    时序服务未装配（关闭 / 精简部署）时静默跳过。
    """
    if not entity_id:
        return
    timeline = getattr(request.app.state, 'agent_timeline', None)
    marker = getattr(timeline, 'mark_local_control', None)
    if not callable(marker):
        return
    # 归因属旁路观测：失败不能影响控制结果
    with contextlib.suppress(Exception):
        marker(entity_id)


@router.post('/media/browse')
async def browse_media(
    command: HABrowseMediaRequest,
    request: Request,
    _database: DatabaseSession,
    viewer: LicensedViewer,
) -> dict[str, Any]:
    if not request.app.state.license_service.allows(feature_codes.FEATURE_HA_CONTROL):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='当前授权不允许控制 Home Assistant。')
    entity_domain = command.entity_id.partition('.')[0]
    if entity_domain != 'media_player':
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail='媒体浏览只能用于媒体播放器实体。',
        )
    connection, entity_exists = await asyncio.to_thread(
        load_authorized_entity_context,
        request.app.state.database,
        viewer,
        command.entity_id,
    )
    if connection is None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail='请先配置 Home Assistant 连接。')
    if not entity_exists:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='实体不存在、已禁用或已失联。')
    try:
        client = await request.app.state.studio_ha.client_for(connection)
        browse = client.browse_player_media if command.player_library else client.browse_media
        result = await browse(
            command.entity_id,
            command.media_content_id,
            command.media_content_type or None,
        )
    except (HAClientError, CredentialCipherError) as error:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(error)) from error
    return {'ok': True, 'result': result}


def websocket_viewer(websocket: WebSocket) -> ViewerPrincipal | None:
    settings = websocket.app.state.settings
    token = websocket.cookies.get(settings.cookie_name, '')
    with websocket.app.state.database.session_factory() as database:
        if not token:
            return None
        record = database.scalar(select(LoginSession).where(LoginSession.id_hash == session_token_hash(token)))
        now = datetime.now(UTC)
        if (
            record is None
            or record.expires_at.replace(tzinfo=UTC) <= now
        ):
            return None
        user = database.get(User, record.user_id)
        if user is None or not user.is_active:
            return None
        database.expunge(user)
        return ViewerPrincipal(user=user)


def websocket_origin_allowed(websocket: WebSocket) -> bool:
    """要求浏览器 WebSocket 必须源自本应用（配置的对外地址，或本请求的 Host）。"""
    origin = websocket.headers.get('origin', '').strip()
    if not origin:
        return False
    parsed_origin = urlsplit(origin)
    if (
        parsed_origin.scheme not in {'http', 'https'}
        or not parsed_origin.netloc
        or parsed_origin.username is not None
        or parsed_origin.password is not None
        or parsed_origin.path not in {'', '/'}
        or parsed_origin.query
        or parsed_origin.fragment
    ):
        return False
    configured_base_url = websocket.app.state.settings.app_base_url
    if configured_base_url:
        parsed = urlsplit(configured_base_url)
        if parsed.scheme in {'http', 'https'} and parsed.netloc:
            if origin.casefold() == f'{parsed.scheme}://{parsed.netloc}'.casefold():
                return True
    # 内网穿透部署里 ``APP_BASE_URL`` 写的是公网域名，但同一套服务仍可能从局域网 IP 直接
    # 访问：那条连接的 Origin 与 Host 同值，也是同源。只认配置值会让这种访问的实时通道
    # 一律 403（表现为面板连上又掉、状态不刷新）。
    host = websocket.headers.get('host', '').strip()
    return bool(host) and parsed_origin.netloc.casefold() == host.casefold()


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
        await _runtime_log(
            websocket,
            'error',
            f'实时连接异常：{error}',
            context,
            details=traceback.format_exc(),
        )
        raise
    finally:
        event_context.reset(token)


async def _runtime_log(
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
        await log.append_async(level, source, '实时连接', message, context=context, details=details)


async def _runtime_send_json(websocket: WebSocket, command: dict) -> None:
    try:
        await websocket.send_json(command)
    except RuntimeError as error:
        if str(error) in {
            'Cannot call "send" once a close message has been sent.',
            "Unexpected ASGI message 'websocket.send', after sending 'websocket.close'.",
            "Unexpected ASGI message 'websocket.send', after sending 'websocket.close' or response already completed.",
        }:
            raise WebSocketDisconnect(code=1006) from error
        raise


async def _runtime_close_with_log(
    websocket: WebSocket, context: dict, code: int, reason: str, *, send_reason: bool = True
) -> None:
    # 关闭原因码 → 人话。日志里只出现原因码对排查毫无帮助，而这段文案会进入全局日志导出。
    close_explanations = {
        'origin not allowed': '页面来源未获允许',
        'authentication required': '需要登录或重新配对',
        'authentication expired': '登录会话已失效，请重新登录',
        'license restricted': '授权不可用或已到期',
        'subscribe message required': '未收到有效的实体订阅消息',
        'too many entities': '订阅实体数量超过上限',
    }
    await _runtime_log(
        websocket,
        'warning',
        f'实时连接已关闭：{close_explanations.get(reason, reason)}',
        {**context, 'code': str(code), 'phase': 'rejected'},
    )
    await websocket.close(code=code, reason=reason if send_reason else None)


async def _runtime_authorize(websocket: WebSocket, context: dict) -> ViewerPrincipal | None:
    """来源 / 登录 / 授权三重校验；未通过时按原样关闭连接并返回 None。"""
    if not websocket_origin_allowed(websocket):
        await _runtime_close_with_log(websocket, context, 4403, 'origin not allowed')
        return None
    viewer = await asyncio.to_thread(websocket_viewer, websocket)
    if viewer is None:
        await _runtime_close_with_log(websocket, context, 4401, 'authentication required', send_reason=False)
        return None
    if viewer.user is not None:
        context['actor'] = getattr(viewer.user, 'username', None)
    if not await asyncio.to_thread(websocket.app.state.license_service.allows, feature_codes.FEATURE_RUNTIME_WEBSOCKET):
        await _runtime_close_with_log(websocket, context, 4403, 'license restricted', send_reason=False)
        return None
    return viewer


class _RuntimeSubscriptionState:
    """运行时长连的订阅状态：事件队列、订阅实体与是否已建立订阅。"""

    def __init__(self, queue: Any) -> None:
        self.queue = queue
        self.entity_ids: set[str] = set()
        self.watching = False
        #: 客户端是否声明能处理 ``state_changed_batch``（新前端在 subscribe 帧里带上）。
        #: 旧的 SPA 缓存不认识批量帧，所以批量下发必须显式协商，否则会静默不更新。
        self.supports_state_batch = False


async def _drain_runtime_queue(queue: Any) -> list[dict]:
    """在合并窗口内把队列里已经到达的事件一次性取空。

    分两段等，避免给「稳态下的孤立事件」白加 12ms：

    - 第一段只等 ``RUNTIME_DRAIN_PROBE_SECONDS``（2ms）：这一小段就能判断出当前是否
      处于突发（场景切换 / 全屋开关会把几十上百条同步塞进队列）；
    - 一旦确认有后续事件，再放宽到 ``RUNTIME_STATE_BATCH_WINDOW_SECONDS``（12ms），
      把整波都收进来按实体合并；收不到就立即返回，不再等满窗口。
    """
    events: list[dict] = []
    deadline = time.monotonic() + RUNTIME_STATE_BATCH_WINDOW_SECONDS
    probing = True
    while True:
        wait = RUNTIME_DRAIN_PROBE_SECONDS if probing else deadline - time.monotonic()
        if wait <= 0:
            return events
        try:
            events.append(await asyncio.wait_for(queue.get(), timeout=wait))
        except TimeoutError:
            return events
        probing = False


def _merge_runtime_state_events(events: list[dict]) -> list[dict]:
    """按实体合并：同一实体只保留窗口内的最后一条，非状态事件保持原顺序。"""
    merged: list[dict] = []
    positions: dict[str, int] = {}
    for event in events:
        if event.get('type') == 'state_changed':
            entity_id = str(event.get('entityId') or '')
            if entity_id and entity_id in positions:
                merged[positions[entity_id]] = event
                continue
            if entity_id:
                positions[entity_id] = len(merged)
        merged.append(event)
    return merged


async def _runtime_subscribe_and_stream(
    websocket: WebSocket,
    context: dict,
    subscription: _RuntimeSubscriptionState,
    close_with_log,
    send_licensed,
) -> None:
    """等订阅帧 → 建立订阅 → 持续推送，直到两路协作任务任一路结束。"""
    subscribe = await asyncio.wait_for(websocket.receive_json(), timeout=30)
    if not isinstance(subscribe, dict) or subscribe.get('type') != 'subscribe' or not isinstance(subscribe.get('entityIds'), list):
        await close_with_log(4400, 'subscribe message required')
        return
    entity_ids = {str(value) for value in subscribe['entityIds'] if isinstance(value, str)}
    subscription.entity_ids = entity_ids
    subscription.supports_state_batch = subscribe.get('supportsStateBatch') is True
    if len(entity_ids) > MAX_RUNTIME_ENTITIES:
        await close_with_log(4400, 'too many entities')
        return
    websocket.app.state.studio_ha.state_hub.set_subscription_entities(subscription.queue, entity_ids)
    await websocket.app.state.studio_ha.add_runtime_entity_watch(entity_ids, ensure_states=False)
    subscription.watching = True

    async def send_updates() -> None:
        """推送初始快照，然后持续转发状态事件并保活。"""
        initial_snapshot = await websocket.app.state.studio_ha.state_hub.snapshot(entity_ids)
        if not await send_licensed({'type': 'snapshot', 'states': initial_snapshot}):
            return
        # 首个状态帧必须无条件下发（不依赖订阅队列里是否残留过事件）：墙屏需要立刻知道
        # 中枢此刻是否在线，否则「HA 掉线」与「设备关着」在界面上完全一样。
        connector = websocket.app.state.studio_ha
        if not await send_licensed({
            'type': 'ha_status',
            'status': 'connected' if connector.connected else 'disconnected',
        }):
            return
        # 状态补全是「尽力而为」：初始快照已经发出，补全失败不该拆掉整条实时推送。
        # ensure_entity_states 内部已逐实体容错并带退避重试，这里再兜一层，防的是
        # 未预期的异常（如取连接 / 合并阶段出错）把 send_updates 整体带崩。
        try:
            await websocket.app.state.studio_ha.ensure_entity_states(entity_ids)
        except Exception:
            await _runtime_log(
                websocket,
                'warning',
                '实时连接初始状态补全失败，继续转发事件',
                {**context, 'phase': 'hydrate'},
                details=traceback.format_exc(),
            )
        hydrated_snapshot = await websocket.app.state.studio_ha.state_hub.snapshot(entity_ids)
        if hydrated_snapshot != initial_snapshot:
            if not await send_licensed({'type': 'snapshot', 'states': hydrated_snapshot}):
                return
        while True:
            try:
                event = await asyncio.wait_for(subscription.queue.get(), timeout=25)
            except TimeoutError:
                if not await send_licensed({'type': 'ping'}):
                    return
                continue
            # 出站合并：一次场景切换/全屋开关会在同一瞬间产生几十上百条状态事件，
            # 逐条一帧会让墙屏解析 + 逐组件重绘的成本被放大同样的倍数。
            # 这里只等一个 12ms 的网络抖动级窗口（比一帧 16ms 还短），
            # 然后按实体取最后一条，把「N 条同一实体的中间态」压成一条。
            batch = [event] + await _drain_runtime_queue(subscription.queue)
            merged = _merge_runtime_state_events(batch)
            state_events = [item for item in merged if item.get('type') == 'state_changed']
            for item in merged:
                if item.get('type') == 'state_changed':
                    continue
                if not await send_licensed(item):
                    return
            if len(state_events) >= 2 and subscription.supports_state_batch:
                if not await send_licensed({'type': 'state_changed_batch', 'events': state_events}):
                    return
                continue
            for item in state_events:
                if not await send_licensed(item):
                    return
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
    # shield=True：这一段的收尾（推送尾包 / 摘除订阅）不能被外层的取消打断，
    # 否则连接断开时会把内存里的订阅登记留成孤儿。
    with CancelScope(shield=True):
        async with create_task_group() as tasks:
            tasks.start_soon(run_until_closed, send_updates)
            tasks.start_soon(run_until_closed, receive_disconnect)
    if failure is not None:
        raise failure


async def _runtime_run_until_closed(
    websocket: WebSocket,
    context: dict,
    subscription: _RuntimeSubscriptionState,
    monitor_access,
    subscribe_and_stream,
) -> None:
    """三路任务编排：订阅推送、授权周期复检、连接断开感知；并处理断开与超时。"""
    failure = None
    try:
        async with create_task_group() as tasks:
            # 三路：订阅并推送、授权周期复检、连接断开感知。任一路结束都会取消其余两路。
            async def run_until_closed(operation) -> None:
                nonlocal failure
                try:
                    await operation()
                except Exception as error:
                    if failure is None or not isinstance(error, WebSocketDisconnect):
                        failure = error
                finally:
                    tasks.cancel_scope.cancel()

            tasks.start_soon(run_until_closed, monitor_access)
            tasks.start_soon(run_until_closed, subscribe_and_stream)
        if failure is not None:
            raise failure
    except WebSocketDisconnect as error:
        if error.code not in {1000, 1001, 1005}:
            await _runtime_log(
                websocket,
                'warning',
                '实时连接异常断开',
                {**context, 'code': str(error.code), 'phase': 'disconnected'},
            )
    except TimeoutError:
        await _runtime_log(
            websocket,
            'warning',
            '实时连接等待订阅超时',
            {**context, 'code': 'SUBSCRIBE_TIMEOUT', 'phase': 'subscribe'},
        )
    finally:
        try:
            if subscription.watching:
                await websocket.app.state.studio_ha.remove_runtime_entity_watch(subscription.entity_ids)
        finally:
            websocket.app.state.studio_ha.state_hub.unsubscribe(subscription.queue)


async def _runtime_websocket(websocket: WebSocket, context: dict) -> None:
    viewer = await _runtime_authorize(websocket, context)
    if viewer is None:
        return
    await websocket.accept()
    await _runtime_log(websocket, 'info', '实时连接已建立', {**context, 'phase': 'accepted'})
    subscription = _RuntimeSubscriptionState(websocket.app.state.studio_ha.state_hub.subscribe())
    # 授权与登录态在长连期间仍会变化：access_closed 记住「已经因为授权/登录问题关过连接」，
    # 之后所有发送一律短路，避免在关闭途中继续往外推数据。
    access_closed = False
    # 授权复检缓存：_runtime_authorize 刚刚做过「授权 + 登录会话」的权威校验，先 seed 缓存。
    # 稳态下每条出站帧不再 to_thread 查库；周期复检任务仍按 RUNTIME_LICENSE_CHECK_SECONDS
    # 做权威复检，因此吊销 / 会话失效的收敛延迟上限 = 缓存窗口 + 该间隔。
    access_cache_seconds = _runtime_access_cache_seconds(websocket)
    access_checked_at = time.monotonic()

    async def recheck_access() -> bool:
        """权威复检：能力码仍有效，且登录会话还是同一个人；失败即关闭连接。"""
        nonlocal access_closed, access_checked_at
        if access_closed:
            return False
        allowed = await asyncio.to_thread(
            websocket.app.state.license_service.allows, feature_codes.FEATURE_RUNTIME_WEBSOCKET)
        if not allowed:
            if not access_closed:
                access_closed = True
                await close_with_log(4403, 'license restricted', send_reason=False)
            return False
        if access_closed:
            return False
        current = await asyncio.to_thread(websocket_viewer, websocket)
        if current is None or current.user is None or current.user.id != viewer.user.id:
            if not access_closed:
                access_closed = True
                await close_with_log(4401, 'authentication expired', send_reason=False)
            return False
        access_checked_at = time.monotonic()
        return True

    async def access_allowed() -> bool:
        """出站帧的授权判定：缓存窗口内直接放行，过期后回落到权威复检。"""
        if access_closed:
            return False
        if (
            access_cache_seconds > 0
            and access_checked_at > 0
            and time.monotonic() - access_checked_at < access_cache_seconds
        ):
            return True
        return await recheck_access()

    async def send_licensed(command: dict) -> bool:
        """所有出站消息的唯一出口：先确认还有效，再发送。"""
        if not await access_allowed():
            return False
        await _runtime_send_json(websocket, command)
        return True

    async def monitor_access() -> None:
        """单独一路任务周期性复检授权，断开已经失效的长连（不复用缓存）。"""
        if not await recheck_access():
            return
        while True:
            await asyncio.sleep(RUNTIME_LICENSE_CHECK_SECONDS)
            if not await recheck_access():
                return

    async def close_with_log(code: int, reason: str, *, send_reason: bool = True) -> None:
        await _runtime_close_with_log(websocket, context, code, reason, send_reason=send_reason)

    async def subscribe_and_stream() -> None:
        """等订阅帧 → 建立订阅 → 持续推送。"""
        await _runtime_subscribe_and_stream(
            websocket, context, subscription, close_with_log, send_licensed
        )

    await _runtime_run_until_closed(
        websocket, context, subscription, monitor_access, subscribe_and_stream
    )
    return

