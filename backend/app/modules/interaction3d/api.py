from __future__ import annotations

import hashlib
import json
import re
import shutil
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse, HTMLResponse
from pydantic import Field
from sqlalchemy import select

from ...dependencies import DatabaseSession, LicensedViewer, LicensedUser, require_viewer_project
from ...models import HAEntity, ProjectDraft
from ...schemas import HAServiceCallRequest
from ...api.ha import active_connection, call_service
from ...api.assets import user_asset_file, UPLOAD_CONTENT_TYPES
from .access import access_grant, module_components, require_access
from .climate import require_air_conditioner_model, validate_climate_command
from .cover import require_curtain_model, validate_cover_command
from .render_cache import MAX_ENTRY_BYTES, cache_path, read_cache, write_cache
from starlette.concurrency import run_in_threadpool

router = APIRouter(prefix='/modules/interaction3d', tags=['3D interaction'])


class Interaction3dControlRequest(HAServiceCallRequest):
    project_id: str = Field(default='', alias='projectId', max_length=128)
    component_id: str = Field(default='', alias='componentId', max_length=128)
    device_kind: str = Field(default='', alias='deviceKind', max_length=32)


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
    if not re.fullmatch('[0-9a-f]{32}', scene_id):
        raise HTTPException(404, detail='户型快照不存在。')
    path = request.app.state.settings.data_dir / 'modules' / 'interaction3d' / 'scenes' / f'{scene_id}.json'
    if not path.is_file():
        raise HTTPException(404, detail='户型快照不存在，请重新载入户型。')
    return path


def require_scene_viewer(request, database, viewer, scene_id, project_id):
    require_access(request)
    if viewer.is_admin_session:
        return None
    require_viewer_project(viewer, project_id)
    draft = database.get(ProjectDraft, project_id)
    if draft is None or not any(
        c.get('properties', {}).get('sceneId') == scene_id
        for _, c in module_components(json.loads(draft.document_json))
    ):
        raise HTTPException(403, detail='此户型未配置到当前仪表盘。')
    return None


def require_scene_transfer(request, viewer, scene_id, project_id):
    database = request.app.state.database.session_factory()
    with database:
        require_scene_viewer(request, database, viewer, scene_id, project_id)
    return None


@router.post('/scenes', status_code=201)
def snapshot_scene(request: Request, _user: LicensedUser):
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
    scene_id = uuid4().hex
    folder = request.app.state.settings.data_dir / 'modules' / 'interaction3d' / 'scenes'
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / f'{scene_id}.json'
    with path.open('x', encoding='utf-8') as output:
        json.dump(payload, output, ensure_ascii=False)
    path.chmod(384)
    scene = payload['scene']
    for floor in scene.get('floors', [{'scene': scene}]):
        background = floor.get('scene', {}).get('background') or {}
        asset_id = str(background.get('assetId', '')).removeprefix('user:')
        asset = user_asset_file(request.app.state.settings.user_assets_dir.resolve(), asset_id)
        if not asset:
            continue
        shutil.copyfile(asset, folder / f'{scene_id}-{asset_id}{asset.suffix.lower()}')
    return {'sceneId': scene_id}


@router.get('/scenes/{scene_id}')
def get_scene(scene_id: str, request: Request, viewer: LicensedViewer, projectId: str = ''):
    require_scene_transfer(request, viewer, scene_id, projectId)
    payload = json.loads(scene_path(request, scene_id).read_text(encoding='utf-8'))
    scene = payload['scene']
    from urllib.parse import urlencode
    for floor in scene.get('floors', [{'scene': scene}]):
        background = floor.get('scene', {}).get('background') or {}
        asset_id = str(background.get('assetId', '')).removeprefix('user:')
        if not re.fullmatch('[0-9a-f]{32}', asset_id):
            continue
        background['url'] = f'/api/v1/modules/interaction3d/scenes/{scene_id}/background/{asset_id}?{urlencode({"projectId": projectId})}'
    return JSONResponse(payload, headers={'Cache-Control': 'no-store'})


@router.get('/scenes/{scene_id}/current')
def get_current_scene(scene_id: str, request: Request, viewer: LicensedViewer, projectId: str = '', since: str = ''):
    require_scene_transfer(request, viewer, scene_id, projectId)
    reference = json.loads(scene_path(request, scene_id).read_text(encoding='utf-8'))
    source = request.app.state.settings.studio3d_draft_path
    try:
        if since and not source.is_file():
            raise ValueError('saved source unavailable')
        payload = json.loads(source.read_text(encoding='utf-8')) if source.is_file() else reference
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
    for floor in payload['scene'].get('floors', [{'scene': payload['scene']}]):
        background = floor.get('scene', {}).get('background') or {}
        asset_id = str(background.get('assetId', '')).removeprefix('user:')
        if not re.fullmatch('[0-9a-f]{32}', asset_id):
            continue
        background['url'] = f'/api/v1/modules/interaction3d/scenes/{scene_id}/background/{asset_id}?{urlencode({"projectId": projectId})}'
    return JSONResponse(payload, headers={'Cache-Control': 'no-store'})


@router.get('/scenes/{scene_id}/background/{asset_id}')
def get_background(scene_id: str, asset_id: str, request: Request, viewer: LicensedViewer, projectId: str = ''):
    require_scene_transfer(request, viewer, scene_id, projectId)
    folder = scene_path(request, scene_id).parent
    if re.fullmatch('[0-9a-f]{32}', asset_id):
        for suffix, media_type in UPLOAD_CONTENT_TYPES.items():
            path = folder / f'{scene_id}-{asset_id}{suffix}'
            if not path.is_file():
                continue
            return FileResponse(path, media_type=media_type, headers={'Cache-Control': 'no-store'})
    try:
        scene = json.loads(request.app.state.settings.studio3d_draft_path.read_text(encoding='utf-8'))['scene']
        referenced = any(
            str((floor.get('scene', {}).get('background') or {}).get('assetId', '')).removeprefix('user:') == asset_id
            for floor in scene.get('floors', [{'scene': scene}])
        )
        asset = user_asset_file(request.app.state.settings.user_assets_dir.resolve(), asset_id) if referenced else None
        if asset:
            return FileResponse(asset, headers={'Cache-Control': 'no-store'})
    except (OSError, ValueError, KeyError, AttributeError):
        pass
    raise HTTPException(404, detail='户型底图不存在。')


@router.post('/control')
async def control_light(payload: Interaction3dControlRequest, request: Request, database: DatabaseSession, viewer: LicensedViewer):
    require_access(request)
    if payload.device_kind == 'television' or payload.domain == 'media_player':
        if not (payload.project_id and payload.component_id):
            raise HTTPException(422, detail='电视控制缺少仪表盘或控件信息。')
        require_viewer_project(viewer, payload.project_id)
        draft = database.get(ProjectDraft, payload.project_id)
        component = next((item for _, item in module_components(json.loads(draft.document_json)) if item.get('id') == payload.component_id), None) if draft else None
        bindings = (component or {}).get('properties', {}).get('devices', {}).get('televisions', [])
        power_command = payload.service in {'turn_on', 'turn_off'}
        matches = [
            item for item in bindings
            if (item.get('powerEntityId') or item.get('entityId') if power_command else item.get('entityId')) == payload.entity_id
        ]
        if not matches:
            raise HTTPException(403, detail='此电源实体未配置到当前电视。')
        source = request.app.state.settings.studio3d_draft_path
        reference = scene_path(request, component['properties'].get('sceneId', ''))
        try:
            scene = json.loads((source if source.is_file() else reference).read_text(encoding='utf-8'))['scene']
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
            'media_pause': 1}
        if payload.domain not in {
            'switch',
            'media_player'} or payload.service not in media_features or payload.data or payload.domain == 'switch' and not power_command:
            raise HTTPException(422, detail='电视不支持此控制操作或参数。')
        states = await request.app.state.ha_connector.state_hub.snapshot({payload.entity_id})
        state = states[0] if states else {}
        if state.get('available') is False or state.get('state') in {
            None,
            '',
            'unknown',
            'unavailable'}:
            raise HTTPException(409, detail='电视电源状态不可用，请稍后重试。')
        if payload.domain == 'media_player':
            features = state.get('attributes', {}).get('supported_features', 0)
            if not isinstance(features, int) or isinstance(features, bool) or not features & media_features[payload.service]:
                raise HTTPException(422, detail='此媒体实体不支持该操作。')
            if not power_command and state.get('state') in {
                'off',
                'standby'}:
                raise HTTPException(409, detail='请先开启电视。')
        return await call_service(payload, request, database, viewer)
    elif payload.domain in {
        'cover',
        'climate'}:
        is_cover = payload.domain == 'cover'
        name = '窗帘' if is_cover else '空调'
        if not (payload.project_id and payload.component_id):
            raise HTTPException(422, detail=f'{name}控制缺少仪表盘或控件信息。')
        require_viewer_project(viewer, payload.project_id)
        draft = database.get(ProjectDraft, payload.project_id)
        component = next((item for _, item in module_components(json.loads(draft.document_json)) if item.get('id') == payload.component_id), None) if draft else None
        properties = component.get('properties', {}) if component else {}
        bindings = properties.get('environment', {}).get('curtains' if is_cover else 'airConditioners', [])
        if not any(item.get('entityId') == payload.entity_id for item in bindings):
            raise HTTPException(403, detail=f'此{name}未配置到当前 3D 交互控件。')
        reference = scene_path(request, properties.get('sceneId', ''))
        source = request.app.state.settings.studio3d_draft_path
        try:
            scene = json.loads((source if source.is_file() else reference).read_text(encoding='utf-8'))['scene']
            (require_curtain_model if is_cover else require_air_conditioner_model)(bindings, payload.entity_id, scene)
        except (OSError, ValueError, KeyError, TypeError, AttributeError) as error:
            raise HTTPException(409, detail='户型暂时无法读取，请稍后重试。') from error
        connection = active_connection(database)
        if connection is None:
            raise HTTPException(409, detail='请先配置 Home Assistant 连接。')
        entity = database.scalar(
            select(HAEntity).where(
                HAEntity.connection_id == connection.id,
                HAEntity.entity_id == payload.entity_id,
                HAEntity.domain == payload.domain,
                HAEntity.sync_status == 'active',
                HAEntity.disabled_by.is_(None),
            )
        )
        if entity is None:
            raise HTTPException(404, detail=f'{name}实体不存在、已禁用或已失联。')
        states = await request.app.state.ha_connector.state_hub.snapshot({payload.entity_id})
        if is_cover:
            dream = any(item.get('entityId') == payload.entity_id and item.get('coverKind') == 'dream' for item in bindings)
            validate_cover_command(payload.service, payload.data, states[0] if states else None, dream=dream)
        else:
            validate_climate_command(payload.service, payload.data, states[0] if states else None)
        return await call_service(payload, request, database, viewer)
    else:
        if payload.domain not in {
            'light',
            'switch'} or payload.service not in {
            'turn_on',
            'turn_off'}:
            raise HTTPException(422, detail='3D 交互控制只支持已配置的灯光、开关、空调或窗帘。')
        return await call_service(payload, request, database, viewer)


@router.get('/stage.html')
def get_stage(request: Request, viewer: LicensedViewer, sceneId: str, projectId: str = ''):
    database = request.app.state.database.session_factory()
    with database:
        require_scene_viewer(request, database, viewer, sceneId, projectId)
        scope = light_history_scope(active_connection(database), viewer, projectId)
    scene_path(request, sceneId)
    html = (request.app.state.settings.frontend_dir / '3d-studio.html').read_text(encoding='utf-8')
    html = html.replace('</head>', '<link rel="stylesheet" href="/api/v1/modules/interaction3d/stage.css?v=20260915211726"></head>')
    html = html.replace('<body>', f'<body class="interaction3d-stage" data-i3d-light-history-scope="{scope}">')
    return HTMLResponse(html, headers={'Cache-Control': 'no-store'})


@router.get('/scenes/{scene_id}/render-cache/{cache_key}')
def get_render_cache(scene_id: str, cache_key: str, request: Request, viewer: LicensedViewer, projectId: str = ''):
    require_scene_transfer(request, viewer, scene_id, projectId)
    scene_path(request, scene_id)
    path = cache_path(request.app.state.settings.data_dir, scene_id, projectId, cache_key)
    content = read_cache(path)
    from fastapi.responses import Response
    if content is None:
        return Response(status_code=204, headers={'Cache-Control': 'no-store'})
    return Response(content, media_type='image/png', headers={'Cache-Control': 'private, no-cache'})


@router.put('/scenes/{scene_id}/render-cache/{cache_key}', status_code=204)
async def put_render_cache(scene_id: str, cache_key: str, request: Request, viewer: LicensedViewer, projectId: str = ''):
    await run_in_threadpool(require_scene_transfer, request, viewer, scene_id, projectId)
    scene_path(request, scene_id)
    path = cache_path(request.app.state.settings.data_dir, scene_id, projectId, cache_key)
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
    component = next((item for _, item in module_components(json.loads(draft.document_json)) if item.get('id') == component_id), None)
    if component is None:
        raise HTTPException(404, detail='3D 交互控件不存在。')
    return {'projectId': project_id, 'componentId': component_id, 'phase': 'authorization-shell', 'component': component}


@router.get('/{filename}')
def get_resource(filename: str, request: Request, _viewer: LicensedViewer) -> FileResponse:
    require_access(request)
    media_types = {
        name: 'text/javascript'
        for name in (
            'background-theme.js',
            'security-editor.js',
            'presence-focus-editor.js',
            'presence-character.js',
            'presence-motion.js',
            'presence-scene.js',
            'presence-editor.js',
            'floor-navigation.js',
            'vacuum-motion.js',
            'vacuum-map.js',
            'vacuum-map-editor.js',
            'runtime.js',
            'popup-preview.js',
            'stage.js',
            'television-state.js',
            'television-panel.js',
            'television-screen.js',
            'nas-status.js',
            'camera-status.js',
            'nas-panel.js',
            'config-editor.js',
            'editor-save-status.js',
            'range-dialog.js',
            'light-range-editor.js',
            'light-state.js',
            'light-stream.js',
            'camera-motion.js',
            'idle-rotation.js',
            'scene-sync.js',
            'climate-state.js',
            'climate-panel.js',
            'environment-scene.js',
            'environment-halos.js',
            'environment-airflow.js',
            'cover-state.js',
            'cover-panel.js',
            'cover-feedback.js',
            'curtain-motion.js')
    }
    media_types.update({
        'presence-editor.css': 'text/css',
        'runtime.css': 'text/css',
        'stage.css': 'text/css',
        'climate-panel.css': 'text/css',
        'nas-panel.css': 'text/css',
        'cover-panel.css': 'text/css'})
    if filename not in media_types:
        raise HTTPException(404, detail='3D 交互资源不存在。')
    root = (request.app.state.settings.frontend_dir / 'modules' / 'interaction3d').resolve()
    path = (root / filename).resolve()
    if not path.is_relative_to(root) or not path.is_file():
        raise HTTPException(404, detail='3D 交互资源不存在。')
    return FileResponse(path, media_type=media_types[filename], headers={'Cache-Control': 'no-store'})
