"""3D 交互增量包的全部 HTTP 路由，统一挂在 /modules/interaction3d 前缀下。
"""
from __future__ import annotations

import hashlib
import json
import re
import shutil
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Request, status
from fastapi.responses import FileResponse, JSONResponse, HTMLResponse
from sqlalchemy import select

from ...core.canonical_json import canonical_json_bytes
from ...core.static_revision import file_revision
from ...security.dependencies import DatabaseSession, LicensedViewer, LicensedUser, require_viewer_project
from ...core.models import HAEntity, ProjectDraft
from ...panel.documents import require_document
from ...http.http_cache import NO_STORE
from ...api.ha import call_service
from ...api.ha_shared import active_connection
from ...api.assets_catalog import user_asset_file
from ...api.assets_uploads import UPLOAD_CONTENT_TYPES
from .access import access_grant, module_components, require_access
from .climate import require_air_conditioner_model, validate_climate_command
from .cover import require_curtain_model, validate_cover_command
from .device import require_device_model
from .lock import require_lock_model, validate_lock_command
from .purifier import require_purifier_model, validate_extra_command, validate_purifier_command
from .render_cache import MAX_ENTRY_BYTES, cache_path, read_cache, write_cache
from .runtime_manifest import load_runtime_manifest
from .scene_store import scenes_dir, sweep_scenes_for_app
from starlette.concurrency import run_in_threadpool

# 这个前缀必须与前端请求、舞台页注入的样式链接保持一致。
from .api_support import (
    Interaction3dControlRequest,
    _BODY_TAG_PATTERN,
    _active_entity,
    _background_asset_ids,
    _find_device_extra,
    control_scope,
    light_history_scope,
    load_live_scene,
    require_scene_transfer,
    require_scene_viewer,
    scene_path,
)

router = APIRouter(prefix='/modules/interaction3d', tags=['3D interaction'])

























@router.post('/scenes', status_code=status.HTTP_201_CREATED)
def snapshot_scene(request: Request, _user: LicensedUser):
    """把 studio 的户型草稿冻结成一个不可变快照，返回 sceneId。
    """
    require_access(request)
    # 没有草稿说明用户还没在 3D 户型图绘制里保存过，属于可预期状态，用 409 而非 404。
    source = request.app.state.settings.studio3d_draft_path
    if not source.is_file():
        raise HTTPException(409, detail='请先在 3D 户型图绘制中绘制并保存户型。')
    try:
        payload = json.loads(source.read_text(encoding='utf-8'))
        # 顶层必须有 scene 字典：studio 可能只写出了半成品或空文件。
        if not isinstance(payload, dict) or not isinstance(payload.get('scene'), dict):
            raise HTTPException(409, detail='户型数据为空，请先在 3D 户型图绘制中保存户型。')
    except (OSError, ValueError) as error:
        raise HTTPException(409, detail='户型暂时无法读取，请检查保存状态。') from error
    # uuid4().hex 即 32 位十六进制，天然满足 scene_path 对 sceneId 的格式校验。
    scene_id = uuid4().hex
    folder = scenes_dir(request.app.state.settings)
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / f'{scene_id}.json'
    # 'x' 独占创建：sceneId 是新的，万一撞名也宁可报错，不覆盖已有快照。
    with path.open('x', encoding='utf-8') as output:
        # 原样落盘 studio 草稿的 JSON，不裁剪也不另加版本号：快照与草稿共用同一份
        json.dump(payload, output, ensure_ascii=False)
    # 384（八进制 600）：快照含户型细节，只给属主读写。
    path.chmod(384)
    scene = payload['scene']
    for floor in scene.get('floors', [{'scene': scene}]):
        background = floor.get('scene', {}).get('background') or {}
        # 底图资源 ID 形如 user:<hash>，去掉前缀后才是素材目录里的文件名。
        asset_id = str(background.get('assetId', '')).removeprefix('user:')
        asset = user_asset_file(request.app.state.settings.user_assets_dir.resolve(), asset_id)
        if not asset:
            continue
        # 复制成 <sceneId>-<assetId><后缀>，与快照同目录，清理场景时可一并删除。
        shutil.copyfile(asset, folder / f'{scene_id}-{asset_id}{asset.suffix.lower()}')
    # 冻结成功后顺带回收一轮：只碰「没有任何仪表盘引用、且已过保留期」的快照。
    try:
        sweep_scenes_for_app(request.app)
    except Exception as error:  # noqa: BLE001 - 清理是附加工作，绝不能连累冻结本身
        request.app.state.global_log.append(
            'warning', '3D 舞台', '系统', f'户型快照回收失败：{error}',
        )
    return {'sceneId': scene_id}


@router.get('/scenes/{scene_id}')
def get_scene(scene_id: str, request: Request, viewer: LicensedViewer, projectId: str = ''):
    """读取一份户型快照（底图 URL 已注入）。
    """
    require_scene_transfer(request, viewer, scene_id, projectId)
    payload = json.loads(scene_path(request, scene_id).read_text(encoding='utf-8'))
    scene = payload['scene']
    # 局部导入：只有本路由与 get_current_scene 用到 urlencode，放模块顶部属于噪音。
    from urllib.parse import urlencode
    for floor in scene.get('floors', [{'scene': scene}]):
        background = floor.get('scene', {}).get('background') or {}
        asset_id = str(background.get('assetId', '')).removeprefix('user:')
        # 只给本模块冻结过来的哈希底图补 url；其它素材走别的通道，不在这里兜底。
        if not re.fullmatch('[0-9a-f]{32}', asset_id):
            continue
        # url 上带 projectId：中控设备取图时要用它过 require_viewer_project。
        background['url'] = f'/api/v1/modules/interaction3d/scenes/{scene_id}/background/{asset_id}?{urlencode({"projectId": projectId})}'
    return JSONResponse(payload, headers={'Cache-Control': NO_STORE})


@router.get('/scenes/{scene_id}/current')
def get_current_scene(scene_id: str, request: Request, viewer: LicensedViewer, projectId: str = '', since: str = ''):
    """对比 studio 草稿与参考快照，返回最新场景；无变化时返回 204。
    """
    require_scene_transfer(request, viewer, scene_id, projectId)
    reference = json.loads(scene_path(request, scene_id).read_text(encoding='utf-8'))
    source = request.app.state.settings.studio3d_draft_path
    try:
        # 带 since 说明前端正在跟踪同步：读不出草稿必须报错让它重试，
        if since and not source.is_file():
            raise ValueError('saved source unavailable')
        # 不带 since 的首次加载：草稿不可用时用快照兜底，保证舞台页能渲染出来。
        payload = json.loads(source.read_text(encoding='utf-8')) if source.is_file() else reference
        if not isinstance(payload.get('scene'), dict):
            raise ValueError('missing scene')
    except (OSError, ValueError, AttributeError) as error:
        # 已在同步中却读到坏草稿：给 409，让前端按既定节奏稍后自动重试。
        if since:
            raise HTTPException(409, detail='户型保存尚未完成，稍后自动重试。') from error
        payload = reference
    # syncKey 只对 scene 本身做规范化哈希：包装字段（如本地临时状态）变化不算改动。
    key = hashlib.sha256(canonical_json_bytes(payload['scene'])).hexdigest()
    # 无变化：回 204 空响应，前端什么都不用做，这是轮询的主路径。
    if key == since:
        from fastapi.responses import Response
        return Response(status_code=status.HTTP_204_NO_CONTENT, headers={'Cache-Control': NO_STORE})
    payload['syncKey'] = key
    # referenceScene 是快照里的对照版本，供前端做本地比对与回滚。
    payload['referenceScene'] = reference['scene']
    from urllib.parse import urlencode
    # 与 get_scene 相同的底图 URL 注入，只是这里的场景来自实时草稿。
    for floor in payload['scene'].get('floors', [{'scene': payload['scene']}]):
        background = floor.get('scene', {}).get('background') or {}
        asset_id = str(background.get('assetId', '')).removeprefix('user:')
        if not re.fullmatch('[0-9a-f]{32}', asset_id):
            continue
        background['url'] = f'/api/v1/modules/interaction3d/scenes/{scene_id}/background/{asset_id}?{urlencode({"projectId": projectId})}'
    # 同样 no-store：场景来自草稿、随时会变，更不能让浏览器缓存。
    return JSONResponse(payload, headers={'Cache-Control': NO_STORE})


@router.get('/scenes/{scene_id}/background/{asset_id}')
def get_background(scene_id: str, asset_id: str, request: Request, viewer: LicensedViewer, projectId: str = ''):
    """读取户型快照的底图。
    """
    require_scene_transfer(request, viewer, scene_id, projectId)
    path = scene_path(request, scene_id)
    folder = path.parent
    # 只接受 32 位十六进制（user: 前缀后的哈希），排除路径穿越与任意文件名猜测。
    if re.fullmatch('[0-9a-f]{32}', asset_id):
        for suffix, media_type in UPLOAD_CONTENT_TYPES.items():
            copy_path = folder / f'{scene_id}-{asset_id}{suffix}'
            if not copy_path.is_file():
                continue
            return FileResponse(copy_path, media_type=media_type, headers={'Cache-Control': NO_STORE})
    try:
        scene = json.loads(path.read_text(encoding='utf-8'))['scene']
        # 必须被**本场景**的某个楼层背景引用才放行，等于「底图跟着这个户型走」。
        referenced = asset_id in _background_asset_ids(scene)
        if not referenced and viewer.is_admin_session:
            draft_payload = json.loads(
                request.app.state.settings.studio3d_draft_path.read_text(encoding='utf-8')
            )
            referenced = asset_id in _background_asset_ids(draft_payload.get('scene', {}))
        asset = user_asset_file(request.app.state.settings.user_assets_dir.resolve(), asset_id) if referenced else None
        if asset:
            return FileResponse(asset, headers={'Cache-Control': NO_STORE})
    except (OSError, ValueError, KeyError, AttributeError):
        # 草稿损坏或不存在时直接落到 404，不向调用方暴露内部状态。
        pass
    raise HTTPException(404, detail='户型底图不存在。')


@router.post('/control')
async def control_light(payload: Interaction3dControlRequest, request: Request, database: DatabaseSession, viewer: LicensedViewer):
    """3D 舞台页的设备控制入口，按 domain 走四条不同的校验路径。
    """
    require_access(request)
    if payload.device_kind == 'television' or payload.domain == 'media_player':
        component, properties = control_scope(database, payload, viewer, '电视')
        # 取控件配置：实体必须真配在这个控件的电视列表里（properties.devices.televisions）。
        bindings = properties.get('devices', {}).get('televisions', [])
        # 开关机走 powerEntityId 字段：电视的电源实体常常与媒体播放器不是同一个。
        power_command = payload.service in {'turn_on', 'turn_off'}
        matches = [
            item for item in bindings
            if (item.get('powerEntityId') or item.get('entityId') if power_command else item.get('entityId')) == payload.entity_id
        ]
        if not matches:
            raise HTTPException(403, detail='此电源实体未配置到当前电视。')
        # 场景取实时草稿优先、快照兜底，与 get_current_scene 同一口径。
        scene = load_live_scene(request, properties.get('sceneId', ''))
        try:
            # 三重条件同时成立才算模型在线：楼层 ID、模型 ID 与模型类型 tv；
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
        # HA media_player 的 supported_features 位掩码，位值取自 HA 官方定义。
        media_features = {
            'turn_on': 128,
            'turn_off': 256,
            'media_previous_track': 16,
            'media_next_track': 32,
            'media_play': 16384,
            'media_pause': 1}
        # domain 必须是 switch 或 media_player；data 必须为空（电视控制不接受透传参数）；
        if payload.domain not in {
            'switch',
            'media_player'} or payload.service not in media_features or payload.data or payload.domain == 'switch' and not power_command:
            raise HTTPException(422, detail='电视不支持此控制操作或参数。')
        states = await request.app.state.ha_connector.state_hub.snapshot({payload.entity_id})
        state = states[0] if states else {}
        # 状态缺失 / unknown / unavailable 一律按不可用处理，不做乐观放行。
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
            # 非开关机指令要求电视已开机：off / standby 下 HA 会静默失败。
            if not power_command and state.get('state') in {
                'off',
                'standby'}:
                raise HTTPException(409, detail='请先开启电视。')
        return await call_service(payload, request, viewer)
    elif payload.domain == 'lock' or payload.device_kind == 'lock':
        # 门锁：先证明这把锁真的配在当前控件上，再证明它绑定的门模型还在场景里。
        component, properties = control_scope(database, payload, viewer, '门锁')
        bindings = properties.get('security', {}).get('locks', [])
        matches = [item for item in bindings if item.get('entityId') == payload.entity_id]
        if not matches:
            raise HTTPException(403, detail='此门锁未绑定到当前控件。')
        load_live_scene(
            request,
            properties.get('sceneId', ''),
            # 门模型被删掉或改类型后不应还能控制，判据见 require_lock_model。
            lambda scene: require_lock_model(matches[0], scene),
        )
        connection = active_connection(database)
        if connection is None:
            raise HTTPException(409, detail='请先配置 Home Assistant 连接。')
        # 实体必须属于活跃连接、域正确、同步正常且未被禁用。
        entity = database.scalar(
            select(HAEntity).where(
                HAEntity.connection_id == connection.id,
                HAEntity.entity_id == payload.entity_id,
                HAEntity.domain == 'lock',
                HAEntity.sync_status == 'active',
                HAEntity.disabled_by.is_(None),
            )
        )
        if entity is None:
            raise HTTPException(404, detail='门锁实体不存在、已禁用或已失联。')
        # 门锁实体在 HA 里可能被换到别的设备名下，此时控件上的绑定已经过期。
        binding = matches[0]
        if binding.get('deviceId') and entity.device_id and binding['deviceId'] != entity.device_id:
            raise HTTPException(409, detail='门锁实体已不属于所选设备，请重新绑定。')
        states = await request.app.state.ha_connector.state_hub.snapshot({payload.entity_id})
        validate_lock_command(payload.service, payload.data, states[0] if states else None)
        return await call_service(payload, request, viewer)
    elif payload.device_kind in {
        'device-extra',
        'purifier-extra'}:
        # 设备附加实体（开关 / 下拉 / 数值 / 按钮）：这些实体不属于控件的绑定表本身，
        is_purifier = payload.device_kind == 'purifier-extra'
        name = '附加实体'
        component, properties = control_scope(database, payload, viewer, name)
        host, model_type, extra = _find_device_extra(properties, payload.entity_id, purifier=is_purifier)
        if extra is None:
            detail = '附加实体已不属于当前空气净化器，请重新绑定。' if is_purifier else '此实体不属于当前绑定设备，请重新选择。'
            raise HTTPException(403, detail=detail)
        def validate_extra_model(scene) -> None:
            """附加实体该用哪套「模型还在不在」的判据，取决于它挂在净化器还是通用设备上。"""
            if is_purifier:
                # 净化器自己的实体挂在宿主绑定上。模型存活必须用净化器自己的判据：
                require_purifier_model([host], host.get('entityId', ''), scene)
            else:
                require_device_model(host, scene, model_type)

        load_live_scene(request, properties.get('sceneId', ''), validate_extra_model)
        connection = active_connection(database)
        if connection is None:
            raise HTTPException(409, detail='请先配置 Home Assistant 连接。')
        entity = _active_entity(database, connection, payload.entity_id, payload.domain)
        if entity is None:
            raise HTTPException(404, detail='实体不存在、已禁用或已失联。')
        if is_purifier:
            # 净化器的附加实体必须与净化器本体挂在同一台 HA 设备下：宿主实体换绑到别的
            primary_id = host.get('entityId', '') if host is not None else ''
            primary = database.scalar(
                select(HAEntity).where(
                    HAEntity.connection_id == connection.id,
                    HAEntity.entity_id == primary_id,
                    HAEntity.domain == 'fan',
                    HAEntity.sync_status == 'active',
                    HAEntity.disabled_by.is_(None),
                )
            ) if primary_id else None
            if primary is None or not primary.device_id or entity.device_id != primary.device_id:
                raise HTTPException(403, detail='附加实体已不属于当前空气净化器，请重新绑定。')
        states = await request.app.state.ha_connector.state_hub.snapshot({payload.entity_id})
        validate_extra_command(extra, payload.domain, payload.service, payload.data, states[0] if states else None)
        return await call_service(payload, request, viewer)
    elif payload.domain in {
        'cover',
        'climate'}:
        is_cover = payload.domain == 'cover'
        # 设备名只用于拼提示文案，不参与任何判断。
        name = '窗帘' if is_cover else '空调'
        # 空调 / 窗帘同样要定位到控件，才能核对环境配置里的实体绑定。
        component, properties = control_scope(database, payload, viewer, name)
        bindings = properties.get('environment', {}).get('curtains' if is_cover else 'airConditioners', [])
        # 实体必须真的配在该控件的环境列表里，配置之外的一律拒绝。
        if not any(item.get('entityId') == payload.entity_id for item in bindings):
            raise HTTPException(403, detail=f'此{name}未配置到当前 3D 交互控件。')
        load_live_scene(
            request,
            properties.get('sceneId', ''),
            # 再确认场景里对应的 3D 模型仍在：模型被删掉后不该还能控制它。
            lambda scene: (require_curtain_model if is_cover else require_air_conditioner_model)(
                bindings, payload.entity_id, scene
            ),
        )
        connection = active_connection(database)
        if connection is None:
            raise HTTPException(409, detail='请先配置 Home Assistant 连接。')
        # 实体必须属于活跃连接、域与请求一致、同步正常且未被用户禁用；
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
            # 梦幻帘对整体位置与叶片角度有额外互斥约束，见 validate_cover_command。
            dream = any(item.get('entityId') == payload.entity_id and item.get('coverKind') == 'dream' for item in bindings)
            validate_cover_command(payload.service, payload.data, states[0] if states else None, dream=dream)
        else:
            validate_climate_command(payload.service, payload.data, states[0] if states else None)
        return await call_service(payload, request, viewer)
    elif payload.domain == 'fan':
        # 空气净化器本体（校验见 purifier.py）：实体配在 environment.airPurifiers 下，
        component, properties = control_scope(database, payload, viewer, '空气净化器')
        bindings = properties.get('environment', {}).get('airPurifiers', [])
        # 实体必须真的配在该控件的环境列表里，配置之外的一律拒绝。
        if not any(item.get('entityId') == payload.entity_id for item in bindings):
            raise HTTPException(403, detail='此空气净化器未配置到当前 3D 交互控件。')
        load_live_scene(
            request,
            properties.get('sceneId', ''),
            # 模型被删掉或改类型后不该还能控制，判据见 require_purifier_model。
            lambda scene: require_purifier_model(bindings, payload.entity_id, scene),
        )
        connection = active_connection(database)
        if connection is None:
            raise HTTPException(409, detail='请先配置 Home Assistant 连接。')
        # 实体必须属于活跃连接、域为 fan、同步正常且未被禁用。
        entity = database.scalar(
            select(HAEntity).where(
                HAEntity.connection_id == connection.id,
                HAEntity.entity_id == payload.entity_id,
                HAEntity.domain == 'fan',
                HAEntity.sync_status == 'active',
                HAEntity.disabled_by.is_(None),
            )
        )
        if entity is None:
            raise HTTPException(404, detail='空气净化器实体不存在、已禁用或已失联。')
        states = await request.app.state.ha_connector.state_hub.snapshot({payload.entity_id})
        validate_purifier_command(payload.service, payload.data, states[0] if states else None)
        return await call_service(payload, request, viewer)
    else:
        # 兜底分支只放行灯光与开关的开关动作；其余域（含未声明的）一律拒绝。
        if payload.domain not in {
            'light',
            'switch'} or payload.service not in {
            'turn_on',
            'turn_off'}:
            raise HTTPException(422, detail='3D 交互控制只支持已配置的灯光、开关、空调或窗帘。')
        # 与前三个分支同一口径：中控设备必须证明这个实体**真的配在当前控件上**。少了这一步，
        if not viewer.is_admin_session:
            component, _properties = control_scope(database, payload, viewer, '设备')
            # 灯光表里 entityId 可以为空（纯装饰的灯），因此这里比的是「有没有一条绑到它」。
            if not any(item.get('entityId') == payload.entity_id for item in _properties.get('lights', [])):
                raise HTTPException(403, detail='此设备未配置到当前 3D 交互控件。')
        return await call_service(payload, request, viewer)


@router.get('/stage.html')
def get_stage(request: Request, viewer: LicensedViewer, sceneId: str, projectId: str = ''):
    database = request.app.state.database.session_factory()
    with database:
        require_scene_viewer(request, database, viewer, sceneId, projectId)
        # 作用域要在会话关闭前算完，它依赖 HA 连接表。
        scope = light_history_scope(active_connection(database), viewer, projectId)
    scene_path(request, sceneId)
    settings = request.app.state.settings
    html = (settings.frontend_dir / '3d-studio.html').read_text(encoding='utf-8')
    if '</head>' not in html:
        raise RuntimeError('3d-studio.html 缺少 </head>，舞台样式挂不上去（舞台会退化成工作室界面）')
    # 样式表按文件 mtime 带版本号（与页面里其它服务端拼出来的静态链接同一口径，见
    style_revision = file_revision(settings.frontend_dir / 'modules' / 'runtime' / 'core' / 'stage.css')
    html = html.replace(
        '</head>',
        f'<link rel="stylesheet" href="/api/v1/modules/interaction3d/core/stage.css?v={style_revision}"></head>',
    )
    # 舞台作用域按整枚开标签注入（保留 data-tone 等既有属性），命中数必须为 1。
    html, body_injections = _BODY_TAG_PATTERN.subn(
        lambda match: f'<body{match.group("attributes")} class="interaction3d-stage" data-i3d-light-history-scope="{scope}">',
        html,
        count = 1,
    )
    if body_injections != 1:
        raise RuntimeError('3d-studio.html 里找不到 <body> 开标签，舞台作用域无处可挂（舞台会退化成工作室界面）')
    return HTMLResponse(html, headers={'Cache-Control': NO_STORE})


@router.get('/scenes/{scene_id}/render-cache/{cache_key}')
def get_render_cache(scene_id: str, cache_key: str, request: Request, viewer: LicensedViewer, projectId: str = ''):
    """取一份灯光渲染缓存；不存在时返回 204，让前端自己重新渲染。
    """
    require_scene_transfer(request, viewer, scene_id, projectId)
    scene_path(request, scene_id)
    path = cache_path(request.app.state.settings.data_dir, scene_id, projectId, cache_key)
    content = read_cache(path)
    from fastapi.responses import Response
    # 返回空体而不是错误：前端据此直接走渲染流程，不必额外处理一种失败态。
    if content is None:
        return Response(status_code=status.HTTP_204_NO_CONTENT, headers={'Cache-Control': NO_STORE})
    # private + no-cache：允许浏览器存，但每次都要回源确认（内容可能已被别的屏覆盖）。
    return Response(content, media_type='image/png', headers={'Cache-Control': 'private, no-cache'})


@router.put('/scenes/{scene_id}/render-cache/{cache_key}', status_code=status.HTTP_204_NO_CONTENT)
async def put_render_cache(scene_id: str, cache_key: str, request: Request, viewer: LicensedViewer, projectId: str = ''):
    """接收舞台页回传的灯光合图 PNG 并写入缓存。
    """
    await run_in_threadpool(require_scene_transfer, request, viewer, scene_id, projectId)
    scene_path(request, scene_id)
    path = cache_path(request.app.state.settings.data_dir, scene_id, projectId, cache_key)
    # content-type 可能带参数，取分号前的部分比较即可。
    if request.headers.get('content-type', '').split(';')[0].strip() != 'image/png':
        raise HTTPException(415, detail='缓存仅接受 PNG 图层。')
    content = bytearray()
    async for chunk in request.stream():
        # 边收边计数，超限立刻中断：等收完再判断，畸形请求的体积会先被放大一轮。
        if len(content) + len(chunk) > MAX_ENTRY_BYTES:
            raise HTTPException(413, detail='缓存图层过大。')
        content.extend(chunk)
    # 写入同样丢线程池：内部要加 flock、校验图片并清理整目录。
    await run_in_threadpool(write_cache, path, bytes(content))
    from fastapi.responses import Response
    return Response(status_code=status.HTTP_204_NO_CONTENT, headers={'Cache-Control': NO_STORE})


@router.get('/access')
def get_access(request: Request, _viewer: LicensedViewer) -> JSONResponse:
    """返回前端授权凭据（短时效，仅供界面判断元素显隐）。
    """
    return JSONResponse(access_grant(request), headers={'Cache-Control': NO_STORE})


@router.get('/projects/{project_id}/components/{component_id}/config')
def get_config(project_id: str, component_id: str, request: Request, database: DatabaseSession, viewer: LicensedViewer) -> dict:
    """读取单个 3D 交互控件的完整配置（含位置与全部 properties）。
    """
    require_viewer_project(viewer, project_id)
    require_access(request)
    draft = database.get(ProjectDraft, project_id)
    if draft is None:
        raise HTTPException(404, detail='仪表盘不存在。')
    component = next(
        (
            item
            for _, item in module_components(
                require_document(draft, on_error='当前仪表盘草稿内容已损坏，无法读取控件配置。')
            )
            if item.get('id') == component_id
        ),
        None,
    )
    if component is None:
        raise HTTPException(404, detail='3D 交互控件不存在。')
    return {'projectId': project_id, 'componentId': component_id, 'phase': 'authorization-shell', 'component': component}


@router.get('/{filename:path}')
def get_resource(filename: str, request: Request, _viewer: LicensedViewer) -> FileResponse:
    """下发 3D 交互前端资源（JS / CSS），按白名单限定可访问文件。
    """
    require_access(request)
    # 可下发清单的唯一事实来源是 frontend/modules/runtime/manifest.json
    allowed_files, media_types = load_runtime_manifest(request.app.state.settings.frontend_dir)
    media_type = media_types.get(Path(filename).suffix)
    if filename not in allowed_files or media_type is None:
        raise HTTPException(404, detail='3D 交互资源不存在。')
    root = (request.app.state.settings.frontend_dir / 'modules' / 'runtime').resolve()
    path = (root / filename).resolve()
    # resolve 之后比对前缀：filename 里的 .. 或符号链接都不能逃出资源目录。
    if not path.is_relative_to(root) or not path.is_file():
        raise HTTPException(404, detail='3D 交互资源不存在。')
    # no-store：前端资源迭代频繁，宁可每次回源，也不要出现「改完没生效」。
    return FileResponse(path, media_type=media_type, headers={'Cache-Control': NO_STORE})
