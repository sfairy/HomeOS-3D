from __future__ import annotations

import asyncio
import json
import traceback
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, HTTPException, Query, Request, status
from sqlalchemy import func, or_, select

from . import ha_connection
from .ha_shared import (
    active_connection,
    failed_endpoint_summary,
    history_state_value,
    load_active_connection_snapshot,
    load_authorized_entity_context,
    probe_endpoints,
)
from .ha_translations import (
    load_translation_context,
)
from ..core.models import HAArea, HADevice, HAEntity, HASyncState
from ..core.schemas import HABrowseMediaRequest, HAServiceCallRequest, HATestRequest
from ..ha.client import HAClientError
from ..ha.crypto import CredentialCipherError
from ..ha.endpoints import endpoint_candidates
from ..panel.action_rules import TOGGLE_ENTITY_DOMAINS
from ..security.dependencies import DatabaseSession, LicensedUser, LicensedViewer, require_admin, viewer_entity_ids

router = APIRouter(prefix='/ha', tags=['home-assistant'])
HA_TEST_LIMIT = (20, 60, 120)
#: 键空间上限：键是账号 id，外部造不出来；仍用带键上限的计数器，与其它键来自外部的
HA_TEST_KEYS = 1024
# 服务调用白名单：键为 (domain, service)，值为允许透传的参数名（空集表示不接受参数）。
ALLOWED_SERVICES: dict[tuple[str, str], set[str]] = {
    # 门锁：modules/interaction3d/api.py 的 lock 分支放行这三个服务（另有一道
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
    ('light', 'turn_on'): {'rgb_color', 'hs_color', 'brightness', 'transition', 'brightness_pct', 'color_temp_kelvin'},
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
    ('climate', 'set_temperature'): {'temperature'},
    ('climate', 'set_hvac_mode'): {'hvac_mode'},
    ('climate', 'set_fan_mode'): {'fan_mode'},
    ('climate', 'set_swing_mode'): {'swing_mode'},
    # 上下摆风与左右摆风是两条独立服务，不是同一件事的别名。2D 空调面板在实体上报
    ('climate', 'set_swing_horizontal_mode'): {'swing_horizontal_mode'},
    ('climate', 'set_preset_mode'): {'preset_mode'},
    # 3D 面板在「没有可恢复模式」时发它，让设备自己回到默认模式（见
    ('climate', 'turn_on'): set(),
    ('water_heater', 'turn_on'): set(),
    ('water_heater', 'turn_off'): set(),
    ('water_heater', 'set_temperature'): {'temperature'},
    ('water_heater', 'set_operation_mode'): {'operation_mode'},
    ('fan', 'set_percentage'): {'percentage'},
    ('fan', 'set_preset_mode'): {'preset_mode'},
    ('fan', 'oscillate'): {'oscillating'},
    ('fan', 'set_direction'): {'direction'},
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
        ('media_player', 'volume_set'): {'volume_level'},
        ('media_player', 'volume_mute'): {'is_volume_muted'},
        ('media_player', 'select_source'): {'source'},
        ('media_player', 'select_sound_mode'): {'sound_mode'},
        ('media_player', 'play_media'): {'media_content_id', 'media_content_type'},
        ('media_player', 'turn_on'): set(),
        ('media_player', 'turn_off'): set(),
        ('vacuum', 'start'): set(),
        ('vacuum', 'pause'): set(),
        # 停止 / 定位 / 局部清扫：2D 扫地机面板按 supported_features 决定是否显示这几枚
        ('vacuum', 'stop'): set(),
        ('vacuum', 'locate'): set(),
        ('vacuum', 'clean_spot'): set(),
        ('vacuum', 'return_to_base'): set(),
        ('vacuum', 'turn_on'): set(),
        ('vacuum', 'turn_off'): set(),
        ('vacuum', 'set_fan_speed'): {'fan_speed'},
        ('select', 'select_option'): {'option'}
    ,
}


# connection 资源组第 1 段（include 放在原位置以保持顺序）。
router.include_router(ha_connection.router)


@router.post('/test')
async def test_connection(payload: HATestRequest, request: Request, user: LicensedUser) -> dict[str, Any]:
    """用请求里给的地址与 Token 试连 HA（需管理员 + 授权允许 api）。
    """
    require_admin(user, detail='仅管理员可以修改 Home Assistant 连接。')
    # 限流键用账号 id：本端点要求管理员，而它唯一能被滥用的方式就是「同一个管理员反复点」——
    limiter = request.app.state.ha_test_limiter
    remaining = limiter.retry_after(user.id)
    if remaining > 0:
        raise HTTPException(
            status_code = status.HTTP_429_TOO_MANY_REQUESTS,
            detail = f'试连过于频繁，请 {remaining} 秒后再试。',
            headers = {'Retry-After': str(remaining)})
    limiter.record_failure(user.id)
    endpoints = endpoint_candidates(
        payload.base_url, payload.verify_tls, payload.external_base_url, payload.external_verify_tls
    )
    # 试连是用户主动点的一次诊断，用常规超时耐心等结果，而不是端点解析那种「快点判死好回落」。
    results = await probe_endpoints(
        endpoints, payload.access_token, request.app.state.settings.ha_request_timeout_seconds
    )
    reachable = [item for item in results if item['ok']]
    if not reachable:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=failed_endpoint_summary(results))
    primary = reachable[0]
    return {
        'ok': True,
        'endpoints': results,
        'version': primary.get('version'),
        'locationName': primary.get('locationName'),
    }


# connection 资源组第 2 段（include 放在原位置以保持顺序）。
router.include_router(ha_connection.router_extra)


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
    """分页查询实体目录（需已认证 + 授权允许 api）。
    """
    connection = active_connection(database)
    if connection is None:
        # 未配置 HA 时返回空页而不是报错：「有没有配置」由 /connection 接口负责表达。
        return {'items': [], 'total': 0, 'limit': limit, 'offset': offset}
    filters = [HAEntity.connection_id == connection.id]
    allowed_entity_ids = viewer_entity_ids(database, viewer)
    if allowed_entity_ids is not None:
        if not allowed_entity_ids:
            return {'items': [], 'total': 0, 'limit': limit, 'offset': offset}
        filters.append(HAEntity.entity_id.in_(allowed_entity_ids))
    if search:
        # 两端模糊匹配：entity_id 与显示名都查，前端搜索框不必区分。
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
            # 窗口函数把「过滤后的总数」和「当页数据」一次查出来，省掉一次单独的 count。
            select(HAEntity, func.count().over().label('total_count'))
            .where(*filters)
            # 按域、实体 ID 排序：固定顺序才能让分页结果稳定可复现。
            .order_by(HAEntity.domain, HAEntity.entity_id)
            .offset(offset)
            .limit(limit)
        ).all()
    )
    items = [row[0] for row in rows]
    # 当页为空（例如 offset 越界）时窗口函数无可读行，退回补一次 count 拿真实总数。
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


@router.get('/translations')
async def entity_translations(
    request: Request,
    _viewer: LicensedViewer,
) -> dict[str, Any]:
    """拉取实体枚举值的简体中文翻译（需已认证 + 授权允许 api）。
    """
    # 同步查库交给线程执行：本路由是 async，不能阻塞事件循环。
    connection, integrations = await asyncio.to_thread(load_translation_context, request.app.state.database)
    if connection is None:
        return {'language': 'zh-Hans', 'resources': {}}
    translation_cache = request.app.state.entity_translations
    cache_key = translation_cache.key(connection.id, 'zh-Hans', integrations)

    async def fetch_resources() -> dict[str, str]:
        # 这一段只由「拿到那把锁的那一个调用」执行：同键的并发请求共用它的结果，
        client = await request.app.state.ha_connector.client_for(connection)
        return await client.fetch_entity_translations(integrations, language='zh-Hans')

    try:
        resources = await translation_cache.get_or_fetch(cache_key, fetch_resources)
    except (HAClientError, CredentialCipherError) as error:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(error)) from error
    return {'language': 'zh-Hans', 'resources': resources}


@router.get('/history')
async def entity_history(
    request: Request,
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
    start_time = (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat()
    try:
        history = await request.app.state.ha_connector.fetch_history(connection, entity_id, start_time, hours)
    except (HAClientError, CredentialCipherError) as error:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(error)) from error
    points = []
    for item in history:
        value = history_state_value(item.get('state'))
        # 非数值状态（unavailable、unknown 等）画不出曲线，直接跳过该点。
        if value is None:
            continue
        # 优先用 last_updated；某些集成只回 last_changed，作为兜底。
        timestamp = item.get('last_updated') or item.get('last_changed')
        if not timestamp:
            continue
        points.append({'timestamp': str(timestamp), 'value': value})
    if len(points) > 480:
        # 最多 480 个点：等间隔抽稀，既保留曲线形状又不把响应体撑大。
        step = len(points) / 480
        points = [points[min(len(points) - 1, int(index * step))] for index in range(480)]
    return {'entityId': entity_id, 'hours': hours, 'points': points}


@router.get('/areas')
def list_areas(database: DatabaseSession, _user: LicensedUser) -> dict[str, Any]:
    """列出 HA 区域（需已登录 + 授权允许 api）。
    """
    connection = active_connection(database)
    if connection is None:
        return {'items': []}
    areas = database.scalars(select(HAArea).where(HAArea.connection_id == connection.id).order_by(HAArea.name))
    return {
        'items': [
            {
                'areaId': item.area_id,
                'name': item.name,
                # 别名以 JSON 字符串入库，出参转回数组给前端。
                'aliases': json.loads(item.aliases_json),
                'status': item.sync_status,
            }
            for item in areas
        ]
    }


@router.get('/devices')
def list_devices(database: DatabaseSession, viewer: LicensedViewer) -> dict[str, Any]:
    """列出 HA 设备（需已认证 + 授权允许 api）。
    """
    connection = active_connection(database)
    if connection is None:
        return {'items': []}
    filters = [HADevice.connection_id == connection.id]
    allowed_entity_ids = viewer_entity_ids(database, viewer)
    if allowed_entity_ids is not None:
        if not allowed_entity_ids:
            # 没有可见实体就没有可见设备。
            return {'items': []}
        # 用子查询而不是把 ID 拉回 Python：条件规模不会随实体数量增长。
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
                # 用户改过的名字优先，其次才是集成注册的原始名。
                'name': item.name_by_user or item.name,
                'manufacturer': item.manufacturer,
                'model': item.model,
                # 元数据为空时不输出该键，前端不必额外判 null。
                **({'registryMetadata': json.loads(item.registry_metadata_json)} if item.registry_metadata_json else {}),
                'areaId': item.area_id,
                'status': item.sync_status,
            }
            for item in devices
        ]
    }


@router.get('/sync/status')
def sync_status(request: Request, database: DatabaseSession, _viewer: LicensedViewer) -> dict[str, Any]:
    """读取目录同步状态（需已认证 + 授权允许 api）。
    """
    connection = active_connection(database)
    if connection is None:
        return {'configured': False, 'status': 'not_configured', 'connected': False}
    # 同步状态行以连接 ID 为主键，直接 get 即可。
    state = database.get(HASyncState, connection.id)
    return {
        'configured': True,
        'connected': request.app.state.ha_connector.connected,
        # 还没建状态行时按 idle 处理，前端不必区分「空行」与「空闲」。
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
        else (
            request.app.state.ha_connector.runtime_error or (state.last_error if state else None)
        ),
    }


@router.post('/sync')
async def run_sync(request: Request, user: LicensedUser) -> dict[str, Any]:
    """触发一次全量同步（需管理员 + 授权允许 api 与 ha.sync）。
    """
    if not await asyncio.to_thread(request.app.state.license_service.allows, 'ha.sync'):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='当前授权不允许同步 Home Assistant。')
    require_admin(user, detail='仅管理员可以修改 Home Assistant 连接。')
    connection = await asyncio.to_thread(load_active_connection_snapshot, request.app.state.database)
    if connection is None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail='请先配置 Home Assistant 连接。')
    try:
        # reconciled=True：这次同步会顺带回收目录里已经消失的实体、设备与区域。
        counts = await request.app.state.ha_connector.sync_once(connection.id, reconciled=True)
    except (HAClientError, CredentialCipherError) as error:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(error)) from error
    return {'ok': True, 'counts': counts}


@router.get('/health')
def ha_health(request: Request, database: DatabaseSession, _viewer: LicensedViewer) -> dict[str, Any]:
    """HA 连接健康检查（需已认证 + 授权允许 api）。
    """
    connection = active_connection(database)
    connected = request.app.state.ha_connector.connected
    return {
        'configured': connection is not None,
        'connected': connected,
        'lastError': None
        if connected
        else (
            request.app.state.ha_connector.runtime_error or (connection.last_error if connection else None)
        ),
    }


@router.post('/services/call')
async def call_service(
    payload: HAServiceCallRequest,
    request: Request,
    viewer: LicensedViewer,
) -> dict[str, Any]:
    """调用 HA 服务控制设备（需已认证 + 授权允许 api 与 ha.control）。
    """
    if not await asyncio.to_thread(request.app.state.license_service.allows, 'ha.control'):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='当前授权不允许控制 Home Assistant。')
    # 白名单里没有这个 (domain, service) 就直接拒绝，不做任何回源尝试。
    allowed_fields = ALLOWED_SERVICES.get((payload.domain, payload.service))
    if allowed_fields is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail='该 Home Assistant 服务不在允许列表中。',
        )
    # 未知参数一律拒绝：防止借 data 把任意高层字段塞给 HA 服务。
    unknown_fields = set(payload.data) - allowed_fields
    if unknown_fields:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f'服务参数不允许：{", ".join(sorted(unknown_fields))}',
        )
    # 实体 ID 的域就是第一个点之前的部分。
    entity_domain = payload.entity_id.partition('.')[0]
    # homeassistant.toggle 是跨域服务，必须额外确认实体域本身支持开关。
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
        client = await request.app.state.ha_connector.client_for(connection)
        result = await client.call_service(
            payload.domain,
            payload.service,
            payload.entity_id,
            payload.data,
        )
    except (HAClientError, CredentialCipherError) as error:
        request.state.diagnostic_error_logged = True
        request.app.state.global_log.append(
            'error',
            # 来源按操作主体区分，便于判断是哪块屏出的问题。
            '仪表盘编辑器' if viewer.is_admin_session else '展示设备',
            '设备操作',
            f'操作失败：{payload.entity_id} · {payload.domain}.{payload.service} · {error}',
            context={
                'entityId': payload.entity_id,
                'service': f'{payload.domain}.{payload.service}',
                'status': 502,
            },
            # 失败栈也一并记下，排障时不必再复现一次。
            details=traceback.format_exc(),
        )
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(error)) from error
    # 成功也记一条：设备操作属于审计重点，只记失败会缺一半上下文。
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
    viewer: LicensedViewer,
) -> dict[str, Any]:
    """浏览媒体播放器的可播放内容（需已认证 + 授权允许 api 与 ha.control）。
    """
    if not await asyncio.to_thread(request.app.state.license_service.allows, 'ha.control'):
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
        result = await client.browse_media(
            payload.entity_id,
            payload.media_content_id,
            payload.media_content_type or None,
        )
    except (HAClientError, CredentialCipherError) as error:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(error)) from error
    return {'ok': True, 'result': result}
