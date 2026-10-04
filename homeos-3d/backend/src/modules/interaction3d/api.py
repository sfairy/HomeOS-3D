"""3D 交互增量包的全部 HTTP 路由，统一挂在 /modules/interaction3d 前缀下。"""

from __future__ import annotations

import hashlib
import json
import logging
import re
import shutil
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from pydantic import Field
from sqlalchemy import select
from starlette.concurrency import run_in_threadpool

from .access import access_grant, is_scene_id, module_components, require_access, scene_snapshot_file
from .climate import require_air_conditioner_model, validate_climate_command
from .cover import require_curtain_model, validate_cover_command
from .render_cache import MAX_ENTRY_BYTES, cache_path, read_cache, write_cache
from ...api.assets import UPLOAD_CONTENT_TYPES, user_asset_file
from ...api.ha import active_connection, call_service
from ...config import Settings
from ...dependencies import DatabaseSession, LicensedUser, LicensedViewer, require_viewer_project
from ...models import HAEntity, ProjectDraft
from ...request_origin import require_same_origin_write
from ...schemas import HAServiceCallRequest

router = APIRouter(prefix='/modules/interaction3d', tags=['3D interaction'])

LOGGER = logging.getLogger(__name__)

SCENE_SOURCE_KEY = 'interaction3dSource'

_runtime_media_type_cache: dict[tuple[str, int], dict[str, str]] = {}


def find_module_component(document: dict, component_id: str) -> dict | None:
    return next((item for _, item in module_components(document) if item.get('id') == component_id), None)


def component_properties(database, project_id: str | None, component_id: str | None) -> dict:
    if not project_id or not component_id:
        return {}
    draft = database.get(ProjectDraft, project_id)
    document = decode_draft_document(draft)
    if document is None:
        return {}
    component = find_module_component(document, component_id)
    return component.get('properties', {}) if component else {}


def scene_snapshot(request: Request, database, scene_id: str) -> dict:
    snapshot = load_scene_document(request, scene_id)
    return current_scene_payload(request, database, scene_id, snapshot)['scene']

class Interaction3dControlRequest(HAServiceCallRequest):
    project_id: str = Field(default='', alias='projectId', max_length=128)
    component_id: str = Field(default='', alias='componentId', max_length=128)
    device_kind: str = Field(default='', alias='deviceKind', max_length=32)
    binding_id: str = Field(default='', alias='bindingId', max_length=128)
    binding_floor_id: str = Field(default='', alias='bindingFloorId', max_length=128)
    binding_model_id: str = Field(default='', alias='bindingModelId', max_length=128)


def light_history_scope(connection, viewer, project_id: str) -> str:
    principal = viewer.user or viewer.display
    if not project_id or principal is None or not principal.id or connection is None:
        return ''
    base_url = (connection.base_url or '').strip().rstrip('/')
    encrypted_token = connection.encrypted_access_token or ''
    if not (connection.is_active and connection.id and base_url and encrypted_token):
        return ''
    identity = [
        'i3d-light-history-v1',
        'user' if viewer.user else 'display',
        principal.id,
        project_id,
        connection.id,
        base_url,
        hashlib.sha256(encrypted_token.encode('utf-8')).hexdigest(),
    ]
    return hashlib.sha256(json.dumps(identity, separators=(',', ':')).encode('utf-8')).hexdigest()


def scene_path(request: Request, scene_id: str):
    if not is_scene_id(scene_id):
        raise HTTPException(404, detail='户型快照不存在。')
    path = scene_snapshot_file(request.app.state.settings, scene_id)
    if path is None:
        raise HTTPException(404, detail='户型快照不存在，请重新载入户型。')
    return path


def load_scene_document(request: Request, scene_id: str) -> dict:
    try:
        payload = json.loads(scene_path(request, scene_id).read_text(encoding='utf-8'))
    except (OSError, ValueError) as error:
        raise HTTPException(409, detail='户型快照损坏或无法读取，请重新保存后再试。') from error
    if not isinstance(payload, dict):
        raise HTTPException(409, detail='户型快照损坏或无法读取，请重新保存后再试。')
    return payload


def decode_draft_document(draft: ProjectDraft | None) -> dict | None:
    if draft is None:
        return None
    try:
        document = json.loads(draft.document_json)
    except (TypeError, ValueError):
        LOGGER.warning('仪表盘草稿 %s 的 document_json 无法解析，按空文档处理。', draft.project_id)
        return None
    return document if isinstance(document, dict) else None


def require_scene_viewer(request, database, viewer, scene_id, project_id):
    require_access(request)
    if viewer.is_admin_session:
        return
    require_viewer_project(viewer, project_id)
    draft = database.get(ProjectDraft, project_id)
    document = decode_draft_document(draft)
    if not any(
        c.get('properties', {}).get('sceneId') == scene_id
        for _, c in module_components(document or {})
    ):
        raise HTTPException(403, detail='此户型未配置到当前仪表盘。')
    return


def require_scene_transfer(request, viewer, scene_id, project_id):
    database = request.app.state.database.session_factory()
    with database:
        require_scene_viewer(request, database, viewer, scene_id, project_id)


def current_scene_payload(request: Request, database, scene_id: str, reference: dict, *, since: str = '') -> dict:
    settings = request.app.state.settings
    source = settings.studio3d_draft_path
    if since and not source.is_file():
        raise ValueError('saved source unavailable')
    if source.is_file():
        return json.loads(source.read_text(encoding='utf-8'))
    return reference


@router.post('/scenes', status_code=201)
def snapshot_scene(request: Request, _user: LicensedUser):
    require_same_origin_write(request)
    require_access(request)
    source = request.app.state.settings.studio3d_draft_path
    if not source.is_file():
        raise HTTPException(409, detail='请先在 3D 户型图绘制中绘制并保存户型。')
    try:
        payload = json.loads(source.read_text(encoding='utf-8'))
        if not isinstance(payload, dict) or not isinstance(payload.get('scene'), dict):
            raise HTTPException(409, detail='户型数据为空，请先在 3D 户型图绘制中保存户型。')
    except (OSError, ValueError) as error:
        raise HTTPException(409, detail='户型暂时无法读取，请检查保存状态。') from error
    payload[SCENE_SOURCE_KEY] = 'studio'
    scene_id = uuid4().hex
    folder = request.app.state.settings.data_dir / 'modules' / 'interaction3d' / 'scenes'
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / f'{scene_id}.json'
    with path.open('x', encoding='utf-8') as output:
        json.dump(payload, output, ensure_ascii=False)
    path.chmod(384)
    scene = payload['scene']
    for floor in scene.get('floors', []):
        background = floor.get('scene', {}).get('background') or {}
        asset_id = str(background.get('assetId', '')).removeprefix('user:')
        asset = user_asset_file(request.app.state.settings.user_assets_dir.resolve(), asset_id)
        if not asset:
            continue
        suffix = asset.suffix.lower()
        shutil.copyfile(asset, folder / f'{scene_id}-{asset_id}{suffix}')
    return {'sceneId': scene_id}


@router.get('/scenes/{scene_id}')
def get_scene(scene_id: str, request: Request, viewer: LicensedViewer, projectId: str = ''):
    require_scene_transfer(request, viewer, scene_id, projectId)
    payload = load_scene_document(request, scene_id)
    scene = payload['scene']
    from urllib.parse import urlencode
    for floor in scene.get('floors', []):
        background = floor.get('scene', {}).get('background') or {}
        asset_id = str(background.get('assetId', '')).removeprefix('user:')
        if not re.fullmatch('[0-9a-f]{32}', asset_id):
            continue
        background['url'] = f'/api/v1/modules/interaction3d/scenes/{scene_id}/background/{asset_id}?{urlencode({"projectId": projectId})}'
    payload.pop(SCENE_SOURCE_KEY, None)
    return JSONResponse(payload, headers={'Cache-Control': 'no-store'})


@router.get('/scenes/{scene_id}/current')
def get_current_scene(scene_id: str, request: Request, database: DatabaseSession, viewer: LicensedViewer, projectId: str = '', since: str = ''):
    require_scene_transfer(request, viewer, scene_id, projectId)
    reference = load_scene_document(request, scene_id)
    try:
        payload = current_scene_payload(request, database, scene_id, reference, since=since)
        if not isinstance(payload.get('scene'), dict):
            raise ValueError('missing scene')
    except (OSError, ValueError, AttributeError) as error:
        if since:
            raise HTTPException(409, detail='户型保存尚未完成，稍后自动重试。') from error
        payload = reference
    key = hashlib.sha256(json.dumps(payload['scene'], sort_keys=True, separators=(',', ':')).encode()).hexdigest()
    if key == since:
        from fastapi.responses import Response
        return Response(status_code=204, headers={'Cache-Control': 'no-store'})
    payload['syncKey'] = key
    payload['referenceScene'] = reference['scene']
    from urllib.parse import urlencode
    for floor in payload['scene'].get('floors', []):
        background = floor.get('scene', {}).get('background') or {}
        asset_id = str(background.get('assetId', '')).removeprefix('user:')
        if not re.fullmatch('[0-9a-f]{32}', asset_id):
            continue
        background['url'] = f'/api/v1/modules/interaction3d/scenes/{scene_id}/background/{asset_id}?{urlencode({"projectId": projectId})}'
    payload.pop(SCENE_SOURCE_KEY, None)
    return JSONResponse(payload, headers={'Cache-Control': 'no-store'})


@router.get('/scenes/{scene_id}/background/{asset_id}')
def get_background(scene_id: str, asset_id: str, request: Request, viewer: LicensedViewer, projectId: str = ''):
    require_scene_transfer(request, viewer, scene_id, projectId)
    path = scene_path(request, scene_id)
    folder = path.parent
    if re.fullmatch('[0-9a-f]{32}', asset_id):
        for suffix, media_type in UPLOAD_CONTENT_TYPES.items():
            copy_path = folder / f'{scene_id}-{asset_id}{suffix}'
            if not copy_path.is_file():
                continue
            return FileResponse(copy_path, media_type=media_type, headers={'Cache-Control': 'no-store'})
    try:
        scene = json.loads(
            request.app.state.settings.studio3d_draft_path.read_text(encoding='utf-8')
        )['scene']
        referenced = any(
            str((floor.get('scene', {}).get('background') or {}).get('assetId', '')).removeprefix('user:') == asset_id
            for floor in scene.get('floors', [])
        )
        asset = user_asset_file(request.app.state.settings.user_assets_dir.resolve(), asset_id) if referenced else None
        if asset:
            return FileResponse(asset, headers={'Cache-Control': 'no-store'})
    except (OSError, ValueError, KeyError, AttributeError):
        pass
    raise HTTPException(404, detail='户型底图不存在。')


@router.get('/climate-capabilities')
@router.get('/water-heater-capabilities')
async def water_heater_capabilities(
        request: Request,
        database: DatabaseSession,
        viewer: LicensedViewer):
    """气候和热水器数值使用 HA 配置的显示单位。"""
    require_access(request)
    connection = active_connection(database)
    if connection is None:
        return {'temperatureUnit': None}
    import time

    now = time.monotonic()
    key = (connection.id, connection.base_url, connection.encrypted_access_token)
    cached = getattr(request.app.state, 'water_heater_units', None)
    if cached and cached[0] == key and now - cached[1] < 60:
        return {'temperatureUnit': cached[2]}

    from ...ha.client import HAClientError

    try:
        config = await (await request.app.state.ha_connector.client_for(connection)).test_connection(
            include_temperature_unit=True)
        unit = config.get('temperatureUnit')
    except HAClientError:
        unit = None
    unit = unit if unit in {'K', '°C', '°F'} else None
    request.app.state.water_heater_units = (key, now, unit)
    return {'temperatureUnit': unit}


@router.post('/control')
async def control_light(payload: Interaction3dControlRequest, request: Request, database: DatabaseSession, viewer: LicensedViewer):
    require_access(request)
    if payload.device_kind == 'speaker':
        from .speaker import validate_speaker_command

        if payload.domain != 'media_player' or not payload.project_id or not payload.component_id:
            raise HTTPException(422, detail='智能音响控制缺少仪表盘、控件或媒体实体信息。')
        require_viewer_project(viewer, payload.project_id)
        properties = component_properties(database, payload.project_id, payload.component_id)
        matches = [item for item in properties.get('devices', {}).get('speakers', []) if item.get('entityId') == payload.entity_id]
        if not matches:
            raise HTTPException(403, detail='此媒体实体未绑定到当前智能音响。')
        scene_id = properties.get('sceneId', '')
        try:
            scene = scene_snapshot(request, database, scene_id)
            valid = any(
                model.get('id') == item.get('modelId') and model.get('type') == 'speaker'
                for item in matches
                for floor in scene.get('floors', [])
                if floor.get('id') == item.get('floorId')
                for model in floor.get('scene', {}).get('items', [])
            )
        except (OSError, ValueError, KeyError, TypeError, AttributeError) as error:
            raise HTTPException(409, detail='户型暂时无法读取，请稍后重试。') from error
        if not valid:
            raise HTTPException(409, detail='智能音响模型已失联，请重新配置。')
        states = await request.app.state.ha_connector.state_hub.snapshot({payload.entity_id})
        validate_speaker_command(payload.service, payload.data, states[0] if states else None)
        return await call_service(payload, request, database, viewer)
    elif payload.device_kind == 'television' or payload.domain == 'media_player':
        if not payload.project_id or not payload.component_id:
            raise HTTPException(422, detail='电视控制缺少仪表盘或控件信息。')
        require_viewer_project(viewer, payload.project_id)
        properties = component_properties(database, payload.project_id, payload.component_id)
        bindings = properties.get('devices', {}).get('televisions', [])
        power_command = payload.service in {'turn_on', 'turn_off'}
        matches = [
            item for item in bindings
            if ((item.get('powerEntityId') or item.get('entityId')) if power_command else item.get('entityId')) == payload.entity_id
        ]
        if not matches:
            raise HTTPException(403, detail='此电源实体未配置到当前电视。')
        scene_id = properties.get('sceneId', '')
        try:
            scene = scene_snapshot(request, database, scene_id)
            valid = any(
                model.get('id') == item.get('modelId') and model.get('type') == 'tv'
                for item in matches
                for floor in scene.get('floors', [])
                if floor.get('id') == item.get('floorId')
                for model in floor.get('scene', {}).get('items', [])
            )
        except (OSError, ValueError, KeyError, TypeError, AttributeError) as error:
            raise HTTPException(409, detail='户型暂时无法读取，请稍后重试。') from error
        if not valid:
            raise HTTPException(409, detail='电视模型已失联，请重新配置。')
        media_features = {
            'turn_on': 128,
            'turn_off': 256,
            'media_previous_track': 16,
            'media_next_track': 32,
            'media_play': 16384,
            'media_pause': 1,
        }
        if payload.domain not in {'switch', 'media_player'} or payload.service not in media_features or payload.data or (payload.domain == 'switch' and not power_command):
            raise HTTPException(422, detail='电视不支持此控制操作或参数。')
        states = await request.app.state.ha_connector.state_hub.snapshot({payload.entity_id})
        state = states[0] if states else {}
        if state.get('available') is False or state.get('state') in {None, '', 'unknown', 'unavailable'}:
            raise HTTPException(409, detail='电视电源状态不可用，请稍后重试。')
        if payload.domain == 'media_player':
            features = state.get('attributes', {}).get('supported_features', 0)
            if not isinstance(features, int) or isinstance(features, bool) or not features & media_features[payload.service]:
                raise HTTPException(422, detail='此媒体实体不支持该操作。')
            if not power_command and state.get('state') in {'off', 'standby'}:
                raise HTTPException(409, detail='请先开启电视。')
        return await call_service(payload, request, database, viewer)
    elif payload.domain == 'lock' or payload.device_kind == 'lock':
        from .lock import require_lock_model, validate_lock_command

        if payload.domain != 'lock' or not payload.project_id or not payload.component_id:
            raise HTTPException(422, detail='门锁控制缺少仪表盘或控件信息。')
        require_viewer_project(viewer, payload.project_id)
        properties = component_properties(database, payload.project_id, payload.component_id)
        binding = next((item for item in properties.get('security', {}).get('locks', []) if item.get('entityId') == payload.entity_id), None)
        if not binding:
            raise HTTPException(403, detail='此门锁未绑定到当前控件。')
        scene_id = properties.get('sceneId', '')
        try:
            require_lock_model(binding, scene_snapshot(request, database, scene_id))
        except (OSError, ValueError, KeyError, TypeError, AttributeError) as error:
            raise HTTPException(409, detail='户型暂时无法读取。') from error
        connection = active_connection(database)
        entity = database.scalar(select(HAEntity).where(HAEntity.connection_id == connection.id, HAEntity.entity_id == payload.entity_id, HAEntity.domain == 'lock', HAEntity.sync_status == 'active', HAEntity.disabled_by.is_(None))) if connection else None
        if not entity:
            raise HTTPException(404, detail='门锁实体不存在、已禁用或已失联。')
        if binding.get('deviceId') and entity.device_id != binding['deviceId']:
            raise HTTPException(403, detail='门锁实体已不属于所选设备，请重新绑定。')
        states = await request.app.state.ha_connector.state_hub.snapshot({payload.entity_id})
        validate_lock_command(payload.service, payload.data, states[0] if states else None)
        return await call_service(payload, request, database, viewer)
    elif payload.domain in {'fan', 'cover', 'climate', 'water_heater'} or payload.device_kind in {'fan-extra', 'airer-extra', 'device-extra', 'climate-extra', 'purifier-extra', 'water-heater-extra'}:
        is_climate_extra = payload.device_kind == 'climate-extra'
        is_bath_heater = payload.device_kind == 'bath-heater'
        is_airer = payload.device_kind in {'airer', 'airer-extra'}
        is_fan = payload.device_kind in {'fan', 'fan-extra'}
        is_cover = payload.domain == 'cover'
        is_water_heater = payload.domain == 'water_heater' or payload.device_kind == 'water-heater-extra'
        generic_device = payload.device_kind == 'device-extra'
        extra_domain = payload.device_kind in {'fan-extra', 'airer-extra', 'device-extra', 'climate-extra', 'purifier-extra', 'water-heater-extra'}
        is_purifier = not (is_climate_extra or is_bath_heater or is_airer or is_fan or is_water_heater or generic_device or is_cover) and (payload.domain == 'fan' or payload.device_kind == 'purifier-extra')
        if is_climate_extra:
            name = '空调'
        elif is_bath_heater:
            name = '浴霸'
        elif is_airer:
            name = '晾衣架'
        elif is_fan:
            name = '电风扇'
        elif is_water_heater:
            name = '热水器'
        elif generic_device:
            name = '设备'
        elif is_cover:
            name = '窗帘'
        elif payload.domain == 'fan' or extra_domain:
            name = '空气净化器'
        else:
            name = '空调'
        if not payload.project_id or not payload.component_id:
            raise HTTPException(422, detail=f'{name}控制缺少仪表盘或控件信息。')
        require_viewer_project(viewer, payload.project_id)
        properties = component_properties(database, payload.project_id, payload.component_id)
        bindings = properties.get('environment', {}).get('airConditioners' if is_climate_extra or is_bath_heater else 'airers' if is_airer else 'fans' if is_fan else 'waterHeaters' if is_water_heater else 'curtains' if is_cover else 'airPurifiers' if payload.domain == 'fan' or extra_domain else 'airConditioners', [])
        generic_bindings = []
        valid_owners = []
        if is_bath_heater:
            bindings = [item for item in bindings if item.get('climateType') == 'bath-heater']
        if generic_device:
            from .device import DEVICE_PROFILES

            generic_bindings = [(profile, item) for profile in DEVICE_PROFILES.values() for item in properties.get('devices', {}).get(profile['collection'], [])]
            bindings = [item for _, item in generic_bindings]
        if payload.binding_id or payload.binding_floor_id or payload.binding_model_id:
            bindings = [item for item in bindings if (not payload.binding_id or item.get('id') == payload.binding_id) and (not payload.binding_floor_id or item.get('floorId') == payload.binding_floor_id) and (not payload.binding_model_id or item.get('modelId') == payload.binding_model_id)]
        primary = next((item for item in bindings if item.get('entityId') == payload.entity_id), None) if not extra_domain else None
        owners = [item for item in bindings if any(extra.get('entityId') == payload.entity_id for extra in item.get('extraControls', []))] if extra_domain else []
        if not primary and not owners:
            raise HTTPException(403, detail=f'此{name}未配置到当前 3D 交互控件。')
        scene_id = properties.get('sceneId', '')
        try:
            scene = scene_snapshot(request, database, scene_id)
        except (OSError, ValueError, KeyError, TypeError, AttributeError) as error:
            raise HTTPException(409, detail='户型暂时无法读取，请稍后重试。') from error

        def require_binding_model(owner=None):
            try:
                if generic_device:
                    from .device import require_device_model

                    profile = next(profile for profile, item in generic_bindings if item is owner)
                    require_device_model(owner, scene, profile['model_type'])
                elif is_airer:
                    target = owner or primary
                    if target is None:
                        raise ValueError('晾衣架绑定缺失。')
                    require_curtain_model([target], target['entityId'], scene, model_type='airer')
                elif is_fan:
                    require_air_conditioner_model([owner] if owner else bindings, owner.get('entityId', '') if owner else payload.entity_id, scene, fan_model='fan')
                elif is_purifier:
                    require_air_conditioner_model([owner] if owner else bindings, owner.get('entityId', '') if owner else payload.entity_id, scene, model_type='airpurifier')
                elif is_water_heater:
                    require_air_conditioner_model([owner] if owner else bindings, owner.get('entityId', '') if owner else payload.entity_id, scene, model_type=('storagewaterheater', 'gaswaterheater'))
                else:
                    (require_curtain_model if is_cover else require_air_conditioner_model)([owner] if owner else bindings, owner.get('entityId', '') if owner else payload.entity_id, scene)
            except (ValueError, KeyError, TypeError, AttributeError) as error:
                raise HTTPException(409, detail='户型暂时无法读取，请稍后重试。') from error

        if extra_domain:
            failures = []
            for owner in owners:
                try:
                    require_binding_model(owner)
                except HTTPException as error:
                    failures.append(error)
                else:
                    valid_owners.append(owner)
            if not valid_owners:
                raise failures[0]
        else:
            require_binding_model()
        connection = active_connection(database)
        if connection is None:
            raise HTTPException(409, detail='请先配置 Home Assistant 连接。')
        entity = database.scalar(select(HAEntity).where(HAEntity.connection_id == connection.id, HAEntity.entity_id == payload.entity_id, HAEntity.domain == payload.domain, HAEntity.sync_status == 'active', HAEntity.disabled_by.is_(None)))
        if entity is None:
            raise HTTPException(404, detail=f'{name}实体不存在、已禁用或已失联。')
        states = await request.app.state.ha_connector.state_hub.snapshot({payload.entity_id})
        if extra_domain:
            from .purifier import validate_extra_command

            failures = []
            for owner in valid_owners:
                try:
                    if generic_device or ((is_purifier or is_water_heater or (is_climate_extra and owner.get('climateType') == 'bath-heater')) and owner.get('deviceId')):
                        if not owner.get('deviceId') or entity.device_id != owner['deviceId']:
                            raise HTTPException(403, detail='此实体不属于当前绑定设备，请重新选择。')
                    else:
                        primary_id = owner.get('entityId', '')
                        primary_entity = database.scalar(select(HAEntity).where(HAEntity.connection_id == connection.id, HAEntity.entity_id == primary_id, HAEntity.domain == (primary_id.split('.')[0] if is_climate_extra and owner.get('climateType') == 'bath-heater' else 'climate' if is_climate_extra else 'cover' if is_airer else 'water_heater' if is_water_heater else 'fan'), HAEntity.sync_status == 'active', HAEntity.disabled_by.is_(None))) if primary_id else None
                        if primary_entity is not None and primary_entity.device_id and entity.device_id != primary_entity.device_id:
                            raise HTTPException(403, detail=f'附加实体已不属于当前{name}，请重新绑定。')
                    extra = next((extra for extra in owner['extraControls'] if extra.get('entityId') == payload.entity_id), None)
                    validate_extra_command(extra, payload.domain, payload.service, payload.data, states[0] if states else None)
                except HTTPException as error:
                    failures.append(error)
                else:
                    return await call_service(payload, request, database, viewer)
            raise failures[0]
        if primary is not None and (is_purifier or is_water_heater or primary.get('climateType') == 'bath-heater') and primary.get('deviceId') and entity.device_id != primary['deviceId']:
            raise HTTPException(403, detail='主实体已不属于当前绑定设备，请重新绑定。')
        if is_water_heater:
            from .water_heater import validate_water_heater_command

            validate_water_heater_command(payload.service, payload.data, states[0] if states else None)
        elif is_cover:
            dream = any(item.get('entityId') == payload.entity_id and item.get('coverKind') == 'dream' for item in bindings)
            validate_cover_command(payload.service, payload.data, states[0] if states else None, dream=dream)
        elif payload.domain == 'fan':
            from .purifier import validate_purifier_command

            validate_purifier_command(payload.service, payload.data, states[0] if states else None, name=name)
        else:
            validate_climate_command(payload.service, payload.data, states[0] if states else None)
        return await call_service(payload, request, database, viewer)
    else:
        if payload.domain not in {'light', 'switch'} or payload.service not in {'turn_on', 'turn_off'}:
            raise HTTPException(422, detail='3D 交互控制只支持已配置的灯光、开关、空调或窗帘。')
        return await call_service(payload, request, database, viewer)


@router.get('/stage.html')
def get_stage(request: Request, viewer: LicensedViewer, sceneId: str, projectId: str = ''):
    database = request.app.state.database.session_factory()
    with database:
        require_scene_viewer(request, database, viewer, sceneId, projectId)
        scope = light_history_scope(active_connection(database), viewer, projectId)
    scene_path(request, sceneId)
    settings = request.app.state.settings
    html = (settings.frontend_dir / 'index.html').read_text(encoding='utf-8')
    html = html.replace(
        '</head>',
        '<link rel="stylesheet" href="/api/v1/modules/interaction3d/core/stage.css?v=20260927-follow-ui-v1-20260926-label-opacity-v1-20260925-touch-target-v1-light-menu-v1-20260926-speaker-clean-v6-20260926-airer-v2"></head>',
    )
    html = html.replace(
        '<body>',
        f'<body class="interaction3d-stage" data-i3d-light-history-scope="{scope}">',
    )
    return HTMLResponse(html, headers={'Cache-Control': 'no-store'})


@router.get('/scenes/{scene_id}/render-cache/{cache_key}')
def get_render_cache(scene_id: str, cache_key: str, request: Request, viewer: LicensedViewer, projectId: str = ''):
    require_scene_transfer(request, viewer, scene_id, projectId)
    scene_path(request, scene_id)
    scope = f'display:{viewer.display.id}' if viewer.display else 'admin'
    path = cache_path(request.app.state.settings.data_dir, scene_id, projectId, cache_key, principal=scope)
    content = read_cache(path)
    if content is None and viewer.display:
        content = read_cache(cache_path(request.app.state.settings.data_dir, scene_id, projectId, cache_key))
    from fastapi.responses import Response
    if content is None:
        return Response(status_code=204, headers={'Cache-Control': 'no-store'})
    return Response(content, media_type='image/png', headers={'Cache-Control': 'private, no-cache'})


@router.put('/scenes/{scene_id}/render-cache/{cache_key}', status_code=204)
async def put_render_cache(scene_id: str, cache_key: str, request: Request, viewer: LicensedViewer, projectId: str = ''):
    require_same_origin_write(request)
    await run_in_threadpool(require_scene_transfer, request, viewer, scene_id, projectId)
    scene_path(request, scene_id)
    scope = f'display:{viewer.display.id}' if viewer.display else 'admin'
    path = cache_path(request.app.state.settings.data_dir, scene_id, projectId, cache_key, principal=scope)
    if request.headers.get('content-type', '').split(';')[0].strip() != 'image/png':
        raise HTTPException(415, detail='缓存仅接受 PNG 图层。')
    content = bytearray()
    async for chunk in request.stream():
        if len(content) + len(chunk) > MAX_ENTRY_BYTES:
            raise HTTPException(413, detail='缓存图层过大。')
        content.extend(chunk)
    await run_in_threadpool(write_cache, path, bytes(content))
    from fastapi.responses import Response
    return Response(status_code=204, headers={'Cache-Control': 'no-store'})


@router.get('/access')
def get_access(request: Request, _viewer: LicensedViewer) -> JSONResponse:
    return JSONResponse(access_grant(request), headers={'Cache-Control': 'no-store'})


@router.get('/projects/{project_id}/components/{component_id}/config')
def get_config(project_id: str, component_id: str, request: Request, database: DatabaseSession, viewer: LicensedViewer) -> dict:
    require_viewer_project(viewer, project_id)
    require_access(request)
    draft = database.get(ProjectDraft, project_id)
    if draft is None:
        raise HTTPException(404, detail='仪表盘不存在。')
    component = find_module_component(decode_draft_document(draft) or {}, component_id)
    if component is None:
        raise HTTPException(404, detail='3D 交互控件不存在。')
    return {'projectId': project_id, 'componentId': component_id, 'phase': 'authorization-shell', 'component': component}


@router.get('/{filename:path}')
def get_resource(filename: str, request: Request, _viewer: LicensedViewer) -> FileResponse:
    require_access(request)
    media_types = _runtime_resource_media_types(request.app.state.settings)
    if filename not in media_types:
        raise HTTPException(404, detail='3D 交互资源不存在。')
    root = request.app.state.settings.runtime_dir.resolve()
    path = (root / filename).resolve()
    if not path.is_relative_to(root) or not path.is_file():
        raise HTTPException(404, detail='3D 交互资源不存在。')
    return FileResponse(path, media_type=media_types[filename], headers={'Cache-Control': 'no-store'})


def _runtime_resource_media_types(settings: Settings) -> dict[str, str]:
    manifest_path = settings.runtime_manifest_path
    try:
        stamp = manifest_path.stat().st_mtime_ns
    except OSError:
        return {}
    cache_key = (str(manifest_path), stamp)
    cached = _runtime_media_type_cache.get(cache_key)
    if cached is not None:
        return cached
    try:
        payload = json.loads(manifest_path.read_text(encoding='utf-8'))
    except (OSError, json.JSONDecodeError):
        return {}
    suffixes = payload.get('mediaTypes') if isinstance(payload, dict) else None
    suffixes = suffixes if isinstance(suffixes, dict) else {'.js': 'text/javascript', '.css': 'text/css'}
    entries = payload.get('files') if isinstance(payload, dict) else None
    table: dict[str, str] = {}
    if isinstance(entries, list):
        for entry in entries:
            if not isinstance(entry, str) or not entry:
                continue
            media_type = suffixes.get(Path(entry).suffix.lower(), 'application/octet-stream')
            table[entry] = media_type
    _runtime_media_type_cache.clear()
    _runtime_media_type_cache[cache_key] = table
    return table
