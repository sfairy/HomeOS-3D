"""3D 交互增量包的全部 HTTP 路由，统一挂在 /modules/interaction3d 前缀下。"""

from __future__ import annotations

import hashlib
import json
import logging
import re
import shutil
from dataclasses import dataclass
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
from ...config import Settings
from ...dependencies import (
    DatabaseSession,
    LicensedUser,
    LicensedViewer,
    require_viewer_entity,
    require_viewer_project,
)
from ...domains.ha.integration.connection_query import active_connection
from ...domains.ha.integration.service_call import ServiceCallRejected, execute_service_call
from ...platform.core.asset_paths import UPLOAD_CONTENT_TYPES, user_asset_file
from ...platform.core.models import HAEntity, ProjectDraft
from ...platform.security.request_origin import require_same_origin_write
from ...schemas import HAServiceCallRequest

router = APIRouter(prefix='/modules/interaction3d', tags=['3D interaction'])

LOGGER = logging.getLogger("homeos.interaction3d")

SCENE_SOURCE_KEY = 'interaction3dSource'

_runtime_media_type_cache: dict[tuple[str, int], dict[str, str]] = {}


def find_module_component(document: dict, component_id: str) -> dict | None:
    return next((component for _, component in module_components(document) if component.get('id') == component_id), None)


async def call_service(command: HAServiceCallRequest, request: Request, database, viewer) -> dict:
    """本模块的 HA 服务调用入口：转调域内唯一出口，把域内拒绝映射成 ``HTTPException``。

    参数顺序与原先 ``api/ha.py`` 的同名函数一致，故 6 个控制分支无需改动；
    差别在于这里不再复用「带 FastAPI 依赖注入签名的路由处理函数」，而是走
    ``domains/ha/integration/service_call.py``（校验 + 下发 + 日志的唯一实现）。
    ``database`` 入参保留是为了不换调用点签名，实际由域内按 ``request`` 自取。
    """
    del database  # 连接/实体读取在域内按同一 request 作用域完成，避免两次开库。
    try:
        return await execute_service_call(
            request,
            command,
            access_check=lambda session, entity_id: require_viewer_entity(session, viewer, entity_id),
        )
    except ServiceCallRejected as error:
        raise HTTPException(status_code=error.status_code, detail=error.detail) from error


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
    principal = viewer.user
    if not project_id or principal is None or not principal.id or connection is None:
        return ''
    base_url = (connection.base_url or '').strip().rstrip('/')
    encrypted_token = connection.encrypted_access_token or ''
    if not (connection.is_active and connection.id and base_url and encrypted_token):
        return ''
    identity = [
        'i3d-light-history-v1',
        'user',
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
        command = json.loads(scene_path(request, scene_id).read_text(encoding='utf-8'))
    except (OSError, ValueError) as error:
        raise HTTPException(409, detail='户型快照损坏或无法读取，请重新保存后再试。') from error
    if not isinstance(command, dict):
        raise HTTPException(409, detail='户型快照损坏或无法读取，请重新保存后再试。')
    return command


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
    # 配对码机制移除后，编辑器与展示页共用同一登录会话；管理员视角本就允许预览
    # 尚未挂到仪表盘的户型快照，因此这里不做「场景 ↔ 仪表盘」归属收敛。
    # 保留函数与参数，便于将来重新引入按项目隔离。


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
def snapshot_scene(request: Request, database: DatabaseSession, _user: LicensedUser):
    require_same_origin_write(request)
    require_access(request)
    source = request.app.state.settings.studio3d_draft_path
    if not source.is_file():
        raise HTTPException(409, detail='请先在 3D 户型图绘制中绘制并保存户型。')
    try:
        command = json.loads(source.read_text(encoding='utf-8'))
        if not isinstance(command, dict) or not isinstance(command.get('scene'), dict):
            raise HTTPException(409, detail='户型数据为空，请先在 3D 户型图绘制中保存户型。')
    except (OSError, ValueError) as error:
        raise HTTPException(409, detail='户型暂时无法读取，请检查保存状态。') from error
    command[SCENE_SOURCE_KEY] = 'studio'
    scene_id = uuid4().hex
    folder = request.app.state.settings.data_dir / 'modules' / 'interaction3d' / 'scenes'
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / f'{scene_id}.json'
    with path.open('x', encoding='utf-8') as output:
        json.dump(command, output, ensure_ascii=False)
    path.chmod(384)
    scene = command['scene']
    for floor in scene.get('floors', []):
        background = floor.get('scene', {}).get('background') or {}
        asset_id = str(background.get('assetId', '')).removeprefix('user:')
        asset = user_asset_file(request.app.state.settings.user_assets_dir.resolve(), asset_id)
        if not asset:
            continue
        suffix = asset.suffix.lower()
        shutil.copyfile(asset, folder / f'{scene_id}-{asset_id}{suffix}')
    prune_scene_snapshots(request, database)
    return {'sceneId': scene_id}


#: 场景快照保留份数：编辑器每次保存都会新建一份快照，并把每层户型底图整套复制过来
#: （底图是照片级位图，单个项目几 MB 起），而在此之前没有任何清理入口 —— 长期使用
#: 会把磁盘吃满。只保留最近的若干份**且已不被任何项目引用**的快照。
SCENE_SNAPSHOT_KEEP = 5


def _collect_scene_ids(node: object, out: set[str]) -> None:
    """递归收集文档里出现的任何 ``sceneId``。

    比只认 ``模块 → 组件 → properties`` 路径更保守：宁可少删，也不能删掉一个仍在被
    引用的场景（那会让项目打不开户型）。
    """
    if isinstance(node, dict):
        for key, value in node.items():
            if key == 'sceneId' and isinstance(value, str) and value:
                out.add(value.removeprefix('user:'))
                continue
            _collect_scene_ids(value, out)
    elif isinstance(node, list):
        for item in node:
            _collect_scene_ids(item, out)


def referenced_scene_ids(request: Request, database: DatabaseSession) -> set[str] | None:
    """仍被项目草稿 / 编辑器草稿引用的场景 id；无法判定时返回 ``None``（调用方跳过清理）。"""
    settings = request.app.state.settings
    try:
        documents = list(database.scalars(select(ProjectDraft.document_json)))
    except Exception:
        LOGGER.warning("读取项目草稿失败，无法判定场景引用", exc_info=True)
        return None
    referenced: set[str] = set()
    for document_json in documents:
        if not isinstance(document_json, str):
            continue
        try:
            _collect_scene_ids(json.loads(document_json), referenced)
        except ValueError:
            continue
    draft = getattr(settings, 'studio3d_draft_path', None)
    try:
        if draft is not None and Path(draft).is_file():
            _collect_scene_ids(json.loads(Path(draft).read_text(encoding='utf-8')), referenced)
    except (OSError, ValueError):
        pass
    return referenced


def prune_scene_snapshots(request: Request, database: DatabaseSession) -> None:
    """按 ``SCENE_SNAPSHOT_KEEP`` 清理旧快照及其底图副本（保留仍被引用的快照）。"""
    settings = request.app.state.settings
    folder = settings.data_dir / 'modules' / 'interaction3d' / 'scenes'
    if not folder.is_dir():
        return
    try:
        snapshots = sorted(
            (
                entry
                for entry in folder.glob('*.json')
                if entry.is_file() and re.fullmatch('[0-9a-f]{32}', entry.stem)
            ),
            key=lambda entry: entry.stat().st_mtime_ns,
            reverse=True,
        )
    except OSError:
        return
    stale = snapshots[SCENE_SNAPSHOT_KEEP:]
    if not stale:
        return
    # 项目草稿表的 document_json 是场景引用的唯一事实源。
    referenced = referenced_scene_ids(request, database)
    if referenced is None:
        LOGGER.warning("场景引用不可判定，跳过本次快照清理")
        return
    for entry in stale:
        scene_id = entry.stem
        if scene_id in referenced:
            continue
        try:
            entry.unlink()
        except OSError:
            continue
        # 底图副本形如 {scene_id}-{asset_id}.{ext}：快照没了它们就是纯占位。
        for copy in folder.glob(f'{scene_id}-*'):
            try:
                if copy.is_file():
                    copy.unlink()
            except OSError:
                continue
        LOGGER.info("已清理场景快照:%s", scene_id)


@router.get('/scenes/{scene_id}')
def get_scene(scene_id: str, request: Request, viewer: LicensedViewer, projectId: str = ''):
    require_scene_transfer(request, viewer, scene_id, projectId)
    command = load_scene_document(request, scene_id)
    scene = command['scene']
    from urllib.parse import urlencode
    for floor in scene.get('floors', []):
        background = floor.get('scene', {}).get('background') or {}
        asset_id = str(background.get('assetId', '')).removeprefix('user:')
        if not re.fullmatch('[0-9a-f]{32}', asset_id):
            continue
        background['url'] = f'/api/v1/modules/interaction3d/scenes/{scene_id}/background/{asset_id}?{urlencode({"projectId": projectId})}'
    command.pop(SCENE_SOURCE_KEY, None)
    return JSONResponse(command, headers={'Cache-Control': 'no-store'})


@router.get('/scenes/{scene_id}/current')
def get_current_scene(scene_id: str, request: Request, database: DatabaseSession, viewer: LicensedViewer, projectId: str = '', since: str = ''):
    require_scene_transfer(request, viewer, scene_id, projectId)
    reference = load_scene_document(request, scene_id)
    try:
        command = current_scene_payload(request, database, scene_id, reference, since=since)
        if not isinstance(command.get('scene'), dict):
            raise ValueError('missing scene')
    except (OSError, ValueError, AttributeError) as error:
        if since:
            raise HTTPException(409, detail='户型保存尚未完成，稍后自动重试。') from error
        command = reference
    key = hashlib.sha256(json.dumps(command['scene'], sort_keys=True, separators=(',', ':')).encode()).hexdigest()
    if key == since:
        from fastapi.responses import Response
        return Response(status_code=204, headers={'Cache-Control': 'no-store'})
    command['syncKey'] = key
    command['referenceScene'] = reference['scene']
    from urllib.parse import urlencode
    for floor in command['scene'].get('floors', []):
        background = floor.get('scene', {}).get('background') or {}
        asset_id = str(background.get('assetId', '')).removeprefix('user:')
        if not re.fullmatch('[0-9a-f]{32}', asset_id):
            continue
        background['url'] = f'/api/v1/modules/interaction3d/scenes/{scene_id}/background/{asset_id}?{urlencode({"projectId": projectId})}'
    command.pop(SCENE_SOURCE_KEY, None)
    return JSONResponse(command, headers={'Cache-Control': 'no-store'})


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

    from ...domains.ha.integration.client import HAClientError

    try:
        config = await (await request.app.state.studio_ha.client_for(connection)).test_connection(
            include_temperature_unit=True)
        unit = config.get('temperatureUnit')
    except HAClientError:
        unit = None
    unit = unit if unit in {'K', '°C', '°F'} else None
    request.app.state.water_heater_units = (key, now, unit)
    return {'temperatureUnit': unit}


@dataclass(frozen=True)
class _EnvironmentDeviceFlags:
    """环境类设备分支的布尔开关（由 device_kind / domain 派生）。"""

    is_climate_extra: bool
    is_bath_heater: bool
    is_airer: bool
    is_fan: bool
    is_cover: bool
    is_water_heater: bool
    generic_device: bool
    extra_domain: bool
    is_purifier: bool


@dataclass
class _EnvironmentControlContext:
    """环境类设备控制上下文：绑定、实体状态与模型校验所需数据。"""

    name: str
    flags: _EnvironmentDeviceFlags
    bindings: list[dict]
    generic_bindings: list[tuple[dict, dict]]
    primary: dict | None
    valid_owners: list[dict]
    entity: HAEntity
    states: list[dict]


def _scene_has_model(scene: dict, bindings: list[dict], model_type: str) -> bool:
    """绑定的 modelId 是否仍能在户型对应楼层里找到指定类型的模型。"""
    return any(
        model.get('id') == binding.get('modelId') and model.get('type') == model_type
        for binding in bindings
        for floor in scene.get('floors', [])
        if floor.get('id') == binding.get('floorId')
        for model in floor.get('scene', {}).get('items', [])
    )


def _environment_device_flags(command: Interaction3dControlRequest) -> _EnvironmentDeviceFlags:
    """派生环境类设备分支的布尔开关。"""
    is_climate_extra = command.device_kind == 'climate-extra'
    is_bath_heater = command.device_kind == 'bath-heater'
    is_airer = command.device_kind in {'airer', 'airer-extra'}
    is_fan = command.device_kind in {'fan', 'fan-extra'}
    is_cover = command.domain == 'cover'
    is_water_heater = command.domain == 'water_heater' or command.device_kind == 'water-heater-extra'
    generic_device = command.device_kind == 'device-extra'
    extra_domain = command.device_kind in {
        'fan-extra',
        'airer-extra',
        'device-extra',
        'climate-extra',
        'purifier-extra',
        'water-heater-extra',
    }
    is_purifier = not (
        is_climate_extra
        or is_bath_heater
        or is_airer
        or is_fan
        or is_water_heater
        or generic_device
        or is_cover
    ) and (command.domain == 'fan' or command.device_kind == 'purifier-extra')
    return _EnvironmentDeviceFlags(
        is_climate_extra=is_climate_extra,
        is_bath_heater=is_bath_heater,
        is_airer=is_airer,
        is_fan=is_fan,
        is_cover=is_cover,
        is_water_heater=is_water_heater,
        generic_device=generic_device,
        extra_domain=extra_domain,
        is_purifier=is_purifier,
    )


def _environment_device_name(
    command: Interaction3dControlRequest, flags: _EnvironmentDeviceFlags
) -> str:
    """错误文案里使用的设备中文名。"""
    if flags.is_climate_extra:
        return '空调'
    if flags.is_bath_heater:
        return '浴霸'
    if flags.is_airer:
        return '晾衣架'
    if flags.is_fan:
        return '电风扇'
    if flags.is_water_heater:
        return '热水器'
    if flags.generic_device:
        return '设备'
    if flags.is_cover:
        return '窗帘'
    if command.domain == 'fan' or flags.extra_domain:
        return '空气净化器'
    return '空调'


def _environment_bindings_collection(
    command: Interaction3dControlRequest, flags: _EnvironmentDeviceFlags
) -> str:
    """按设备类型选择 environment 下的绑定集合名。"""
    if flags.is_climate_extra or flags.is_bath_heater:
        return 'airConditioners'
    if flags.is_airer:
        return 'airers'
    if flags.is_fan:
        return 'fans'
    if flags.is_water_heater:
        return 'waterHeaters'
    if flags.is_cover:
        return 'curtains'
    if command.domain == 'fan' or flags.extra_domain:
        return 'airPurifiers'
    return 'airConditioners'


def _environment_declared_bindings(
    properties: dict, command: Interaction3dControlRequest, flags: _EnvironmentDeviceFlags
) -> list[dict]:
    """取控件声明的绑定列表，浴霸再按 climateType 过滤。"""
    collection = _environment_bindings_collection(command, flags)
    bindings = properties.get('environment', {}).get(collection, [])
    if flags.is_bath_heater:
        bindings = [binding for binding in bindings if binding.get('climateType') == 'bath-heater']
    return bindings


def _filter_environment_bindings(
    bindings: list[dict], command: Interaction3dControlRequest
) -> list[dict]:
    """按 binding_id / floor / model 过滤绑定；三者都未提供时原样返回。"""
    if not (command.binding_id or command.binding_floor_id or command.binding_model_id):
        return bindings
    return [
        binding
        for binding in bindings
        if (not command.binding_id or binding.get('id') == command.binding_id)
        and (not command.binding_floor_id or binding.get('floorId') == command.binding_floor_id)
        and (not command.binding_model_id or binding.get('modelId') == command.binding_model_id)
    ]


def _primary_environment_binding(
    bindings: list[dict], command: Interaction3dControlRequest, flags: _EnvironmentDeviceFlags
) -> dict | None:
    """主绑定：extra 分支没有主实体。"""
    if flags.extra_domain:
        return None
    return next((binding for binding in bindings if binding.get('entityId') == command.entity_id), None)


def _extra_environment_owners(
    bindings: list[dict], command: Interaction3dControlRequest, flags: _EnvironmentDeviceFlags
) -> list[dict]:
    """附加实体所属的绑定列表（仅 extra 分支）。"""
    if not flags.extra_domain:
        return []
    return [
        binding
        for binding in bindings
        if any(extra.get('entityId') == command.entity_id for extra in binding.get('extraControls', []))
    ]


@dataclass(frozen=True)
class _EnvironmentBindingScope:
    """模型校验所需的绑定视图：声明绑定、通用设备画像与主绑定。"""

    flags: _EnvironmentDeviceFlags
    bindings: list[dict]
    generic_bindings: list[tuple[dict, dict]]
    primary: dict | None


def _require_environment_binding_model(
    command: Interaction3dControlRequest,
    scene: dict,
    scope: _EnvironmentBindingScope,
    owner: dict | None = None,
) -> None:
    """校验绑定（含附加实体 owner）对应模型是否仍存在于户型中。"""
    flags = scope.flags
    bindings = scope.bindings
    try:
        if flags.generic_device:
            from .device import require_device_model

            profile = next(profile for profile, binding in scope.generic_bindings if binding is owner)
            require_device_model(owner, scene, profile['model_type'])
        elif flags.is_airer:
            target = owner or scope.primary
            if target is None:
                raise ValueError('晾衣架绑定缺失。')
            require_curtain_model([target], target['entityId'], scene, model_type='airer')
        elif flags.is_fan:
            require_air_conditioner_model(
                [owner] if owner else bindings,
                owner.get('entityId', '') if owner else command.entity_id,
                scene,
                model_type=('fan', 'ceiling-fan'),
            )
        elif flags.is_purifier:
            require_air_conditioner_model(
                [owner] if owner else bindings,
                owner.get('entityId', '') if owner else command.entity_id,
                scene,
                model_type='airpurifier',
            )
        elif flags.is_water_heater:
            require_air_conditioner_model(
                [owner] if owner else bindings,
                owner.get('entityId', '') if owner else command.entity_id,
                scene,
                model_type=('storagewaterheater', 'gaswaterheater'),
            )
        else:
            (require_curtain_model if flags.is_cover else require_air_conditioner_model)(
                [owner] if owner else bindings,
                owner.get('entityId', '') if owner else command.entity_id,
                scene,
            )
    except (ValueError, KeyError, TypeError, AttributeError) as error:
        raise HTTPException(409, detail='户型暂时无法读取，请稍后重试。') from error


def _validate_environment_command(
    command: Interaction3dControlRequest,
    name: str,
    flags: _EnvironmentDeviceFlags,
    bindings: list[dict],
    states: list[dict],
) -> None:
    """按设备类型分发到空调 / 窗帘 / 热水器 / 净化器的命令参数校验。"""
    state_row = states[0] if states else None
    if flags.is_water_heater:
        from .water_heater import validate_water_heater_command

        validate_water_heater_command(command.service, command.data, state_row)
    elif flags.is_cover:
        dream = any(
            binding.get('entityId') == command.entity_id and binding.get('coverKind') == 'dream'
            for binding in bindings
        )
        validate_cover_command(
            command.service,
            command.data,
            state_row,
            dream=dream,
            airer=flags.is_airer,
        )
    elif command.domain == 'fan':
        from .purifier import validate_purifier_command

        validate_purifier_command(command.service, command.data, state_row, name=name)
    else:
        validate_climate_command(command.service, command.data, state_row)


async def _control_extra_environment_entity(
    command: Interaction3dControlRequest,
    request: Request,
    database: DatabaseSession,
    viewer: LicensedViewer,
    context: _EnvironmentControlContext,
    connection,
) -> dict:
    """附加实体分支：逐个校验归属与命令参数，首个通过的下发。"""
    from .purifier import validate_extra_command

    flags = context.flags
    entity = context.entity
    states = context.states
    failures: list[HTTPException] = []
    for owner in context.valid_owners:
        try:
            if flags.generic_device or (
                (flags.is_purifier or flags.is_water_heater or (flags.is_climate_extra and owner.get('climateType') == 'bath-heater'))
                and owner.get('deviceId')
            ):
                if not owner.get('deviceId') or entity.device_id != owner['deviceId']:
                    raise HTTPException(403, detail='此实体不属于当前绑定设备，请重新选择。')
            else:
                primary_id = owner.get('entityId', '')
                primary_entity = (
                    database.scalar(
                        select(HAEntity).where(
                            HAEntity.connection_id == connection.id,
                            HAEntity.entity_id == primary_id,
                            HAEntity.domain == (
                                primary_id.split('.')[0]
                                if flags.is_climate_extra and owner.get('climateType') == 'bath-heater'
                                else 'climate'
                                if flags.is_climate_extra
                                else 'cover'
                                if flags.is_airer
                                else 'water_heater'
                                if flags.is_water_heater
                                else 'fan'
                            ),
                            HAEntity.sync_status == 'active',
                            HAEntity.disabled_by.is_(None),
                        )
                    )
                    if primary_id
                    else None
                )
                if primary_entity is not None and primary_entity.device_id and entity.device_id != primary_entity.device_id:
                    raise HTTPException(403, detail=f'附加实体已不属于当前{context.name}，请重新绑定。')
            extra = next((extra for extra in owner['extraControls'] if extra.get('entityId') == command.entity_id), None)
            validate_extra_command(extra, command.domain, command.service, command.data, states[0] if states else None)
        except HTTPException as error:
            failures.append(error)
        else:
            return await call_service(command, request, database, viewer)
    raise failures[0]


async def _control_speaker(
    command: Interaction3dControlRequest,
    request: Request,
    database: DatabaseSession,
    viewer: LicensedViewer,
) -> dict:
    """智能音响分支：校验绑定、模型与命令参数后下发。"""
    from .speaker import validate_speaker_command

    if command.domain != 'media_player' or not command.project_id or not command.component_id:
        raise HTTPException(422, detail='智能音响控制缺少仪表盘、控件或媒体实体信息。')
    require_viewer_project(viewer, command.project_id)
    properties = component_properties(database, command.project_id, command.component_id)
    matches = [
        binding
        for binding in properties.get('devices', {}).get('speakers', [])
        if binding.get('entityId') == command.entity_id
    ]
    if not matches:
        raise HTTPException(403, detail='此媒体实体未绑定到当前智能音响。')
    scene_id = properties.get('sceneId', '')
    try:
        scene = scene_snapshot(request, database, scene_id)
        valid = _scene_has_model(scene, matches, 'speaker')
    except (OSError, ValueError, KeyError, TypeError, AttributeError) as error:
        raise HTTPException(409, detail='户型暂时无法读取，请稍后重试。') from error
    if not valid:
        raise HTTPException(409, detail='智能音响模型已失联，请重新配置。')
    states = await request.app.state.studio_ha.state_hub.snapshot({command.entity_id})
    validate_speaker_command(command.service, command.data, states[0] if states else None)
    return await call_service(command, request, database, viewer)


async def _control_television(
    command: Interaction3dControlRequest,
    request: Request,
    database: DatabaseSession,
    viewer: LicensedViewer,
) -> dict:
    """电视分支：校验电源实体绑定、模型与 supported_features。"""
    if not command.project_id or not command.component_id:
        raise HTTPException(422, detail='电视控制缺少仪表盘或控件信息。')
    require_viewer_project(viewer, command.project_id)
    properties = component_properties(database, command.project_id, command.component_id)
    bindings = properties.get('devices', {}).get('televisions', [])
    power_command = command.service in {'turn_on', 'turn_off'}
    matches = [
        binding
        for binding in bindings
        if (
            (binding.get('powerEntityId') or binding.get('entityId'))
            if power_command
            else binding.get('entityId')
        )
        == command.entity_id
    ]
    if not matches:
        raise HTTPException(403, detail='此电源实体未配置到当前电视。')
    scene_id = properties.get('sceneId', '')
    try:
        scene = scene_snapshot(request, database, scene_id)
        valid = _scene_has_model(scene, matches, 'tv')
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
    if (
        command.domain not in {'switch', 'media_player'}
        or command.service not in media_features
        or command.data
        or (command.domain == 'switch' and not power_command)
    ):
        raise HTTPException(422, detail='电视不支持此控制操作或参数。')
    states = await request.app.state.studio_ha.state_hub.snapshot({command.entity_id})
    state = states[0] if states else {}
    if state.get('available') is False or state.get('state') in {None, '', 'unknown', 'unavailable'}:
        raise HTTPException(409, detail='电视电源状态不可用，请稍后重试。')
    if command.domain == 'media_player':
        features = state.get('attributes', {}).get('supported_features', 0)
        if not isinstance(features, int) or isinstance(features, bool) or not features & media_features[command.service]:
            raise HTTPException(422, detail='此媒体实体不支持该操作。')
        if not power_command and state.get('state') in {'off', 'standby'}:
            raise HTTPException(409, detail='请先开启电视。')
    return await call_service(command, request, database, viewer)


async def _control_lock(
    command: Interaction3dControlRequest,
    request: Request,
    database: DatabaseSession,
    viewer: LicensedViewer,
) -> dict:
    """门锁分支：校验绑定模型、实体归属与命令参数。"""
    from .lock import require_lock_model, validate_lock_command

    if command.domain != 'lock' or not command.project_id or not command.component_id:
        raise HTTPException(422, detail='门锁控制缺少仪表盘或控件信息。')
    require_viewer_project(viewer, command.project_id)
    properties = component_properties(database, command.project_id, command.component_id)
    binding = next(
        (
            entry
            for entry in properties.get('security', {}).get('locks', [])
            if entry.get('entityId') == command.entity_id
        ),
        None,
    )
    if not binding:
        raise HTTPException(403, detail='此门锁未绑定到当前控件。')
    scene_id = properties.get('sceneId', '')
    try:
        require_lock_model(binding, scene_snapshot(request, database, scene_id))
    except (OSError, ValueError, KeyError, TypeError, AttributeError) as error:
        raise HTTPException(409, detail='户型暂时无法读取。') from error
    connection = active_connection(database)
    entity = (
        database.scalar(
            select(HAEntity).where(
                HAEntity.connection_id == connection.id,
                HAEntity.entity_id == command.entity_id,
                HAEntity.domain == 'lock',
                HAEntity.sync_status == 'active',
                HAEntity.disabled_by.is_(None),
            )
        )
        if connection
        else None
    )
    if not entity:
        raise HTTPException(404, detail='门锁实体不存在、已禁用或已失联。')
    if binding.get('deviceId') and entity.device_id != binding['deviceId']:
        raise HTTPException(403, detail='门锁实体已不属于所选设备，请重新绑定。')
    states = await request.app.state.studio_ha.state_hub.snapshot({command.entity_id})
    validate_lock_command(command.service, command.data, states[0] if states else None)
    return await call_service(command, request, database, viewer)


async def _control_environment_device(
    command: Interaction3dControlRequest,
    request: Request,
    database: DatabaseSession,
    viewer: LicensedViewer,
) -> dict:
    """风扇 / 窗帘 / 空调 / 热水器 / 净化器 / 通用设备分支的校验与下发编排。"""
    flags = _environment_device_flags(command)
    name = _environment_device_name(command, flags)
    if not command.project_id or not command.component_id:
        raise HTTPException(422, detail=f'{name}控制缺少仪表盘或控件信息。')
    require_viewer_project(viewer, command.project_id)
    properties = component_properties(database, command.project_id, command.component_id)
    bindings = _environment_declared_bindings(properties, command, flags)
    generic_bindings: list[tuple[dict, dict]] = []
    if flags.generic_device:
        from .device import DEVICE_PROFILES

        generic_bindings = [
            (profile, binding)
            for profile in DEVICE_PROFILES.values()
            for binding in properties.get('devices', {}).get(profile['collection'], [])
        ]
        bindings = [binding for _, binding in generic_bindings]
    bindings = _filter_environment_bindings(bindings, command)
    primary = _primary_environment_binding(bindings, command, flags)
    owners = _extra_environment_owners(bindings, command, flags)
    if not primary and not owners:
        raise HTTPException(403, detail=f'此{name}未配置到当前 3D 交互控件。')
    scene_id = properties.get('sceneId', '')
    try:
        scene = scene_snapshot(request, database, scene_id)
    except (OSError, ValueError, KeyError, TypeError, AttributeError) as error:
        raise HTTPException(409, detail='户型暂时无法读取，请稍后重试。') from error

    valid_owners: list[dict] = []
    scope = _EnvironmentBindingScope(
        flags=flags, bindings=bindings, generic_bindings=generic_bindings, primary=primary
    )
    if flags.extra_domain:
        failures = []
        for owner in owners:
            try:
                _require_environment_binding_model(command, scene, scope, owner)
            except HTTPException as error:
                failures.append(error)
            else:
                valid_owners.append(owner)
        if not valid_owners:
            raise failures[0]
    else:
        _require_environment_binding_model(command, scene, scope)
    connection = active_connection(database)
    if connection is None:
        raise HTTPException(409, detail='请先配置 Home Assistant 连接。')
    entity = database.scalar(
        select(HAEntity).where(
            HAEntity.connection_id == connection.id,
            HAEntity.entity_id == command.entity_id,
            HAEntity.domain == command.domain,
            HAEntity.sync_status == 'active',
            HAEntity.disabled_by.is_(None),
        )
    )
    if entity is None:
        raise HTTPException(404, detail=f'{name}实体不存在、已禁用或已失联。')
    states = await request.app.state.studio_ha.state_hub.snapshot({command.entity_id})

    if flags.extra_domain:
        context = _EnvironmentControlContext(
            name=name,
            flags=flags,
            bindings=bindings,
            generic_bindings=generic_bindings,
            primary=primary,
            valid_owners=valid_owners,
            entity=entity,
            states=states,
        )
        return await _control_extra_environment_entity(
            command, request, database, viewer, context, connection
        )
    if primary is not None and (flags.is_purifier or flags.is_water_heater or primary.get('climateType') == 'bath-heater') and primary.get('deviceId') and entity.device_id != primary['deviceId']:
        raise HTTPException(403, detail='主实体已不属于当前绑定设备，请重新绑定。')
    _validate_environment_command(command, name, flags, bindings, states)
    return await call_service(command, request, database, viewer)


@router.post('/control')
async def control_light(command: Interaction3dControlRequest, request: Request, database: DatabaseSession, viewer: LicensedViewer):
    require_access(request)
    if command.device_kind == 'speaker':
        return await _control_speaker(command, request, database, viewer)
    if command.device_kind == 'television' or command.domain == 'media_player':
        return await _control_television(command, request, database, viewer)
    if command.domain == 'lock' or command.device_kind == 'lock':
        return await _control_lock(command, request, database, viewer)
    if command.domain in {'fan', 'cover', 'climate', 'water_heater'} or command.device_kind in {'fan-extra', 'airer-extra', 'device-extra', 'climate-extra', 'purifier-extra', 'water-heater-extra'}:
        return await _control_environment_device(command, request, database, viewer)
    if command.domain not in {'light', 'switch'} or command.service not in {'turn_on', 'turn_off'}:
        raise HTTPException(422, detail='3D 交互控制只支持已配置的灯光、开关、空调或窗帘。')
    return await call_service(command, request, database, viewer)



@router.get('/stage.html')
def get_stage(request: Request, viewer: LicensedViewer, sceneId: str, projectId: str = ''):
    database = request.app.state.database.session_factory()
    with database:
        require_scene_viewer(request, database, viewer, sceneId, projectId)
        scope = light_history_scope(active_connection(database), viewer, projectId)
    scene_path(request, sceneId)
    settings = request.app.state.settings
    index_path = settings.frontend_dir / 'index.html'
    if not index_path.is_file():
        # watch-build / 首次构建窗口里 dist 可能尚未就绪；回 503 而不是 ASGI 裸异常。
        raise HTTPException(503, detail='前端产物尚未就绪，请稍后重试。')
    html = index_path.read_text(encoding='utf-8')
    html = html.replace(
        '</head>',
        '<link rel="stylesheet" href="/api/v1/modules/interaction3d/core/stage.css"></head>',
    )
    html = html.replace(
        '<body>',
        f'<body class="interaction3d-stage" data-i3d-light-history-scope="{scope}">',
    )
    # 给外壳脚本（/static/boot-guard.js）一个稳定的「本页是 3D 舞台」标记：
    # 舞台的 interaction3d-stage 是页面档位、不是残留 body class，自愈逻辑必须跳过它，
    # 否则会在舞台内容尚未可见的窗口里把 class 移除，导致总览退回「3D 户型图绘制页面」。
    html = re.sub(r'<html([^>]*)>', r'<html\1 data-homeos-stage="1">', html, count=1)
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
    require_same_origin_write(request)
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
    return FileResponse(path, media_type=media_types[filename], headers={'Cache-Control': 'private, no-cache'})


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
        command = json.loads(manifest_path.read_text(encoding='utf-8'))
    except (OSError, json.JSONDecodeError):
        return {}
    suffixes = command.get('mediaTypes') if isinstance(command, dict) else None
    suffixes = suffixes if isinstance(suffixes, dict) else {'.js': 'text/javascript', '.css': 'text/css'}
    entries = command.get('files') if isinstance(command, dict) else None
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
