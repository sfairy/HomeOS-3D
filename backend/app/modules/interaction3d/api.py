"""3D 交互增量包的全部 HTTP 路由，统一挂在 /modules/interaction3d 前缀下。

四类资源：
- 户型快照：把 studio 草稿冻结成不可变的 sceneId 快照（含底图副本），供舞台页长期读取；
- 舞台页：下发 3d-studio.html，并注入样式与「灯光历史作用域」；
- 设备控制：灯光 / 开关直接转发 HA，电视、空调、窗帘先做配置与能力校验；
- 渲染缓存：舞台页回传的灯光合图 PNG，按 (项目, 户型, 缓存键) 分目录存放。

鉴权口径：读接口用 LicensedViewer（认证 + api 授权 + sceneId 归属校验），
写接口（建快照）用 LicensedUser（必须管理员登录），两者都再叠一层 require_access。
"""
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
from ...panel.documents import parse_document, require_document
from ...schemas import HAServiceCallRequest
from ...api.ha import active_connection, call_service
from ...api.assets import user_asset_file, UPLOAD_CONTENT_TYPES
from .access import access_grant, module_components, require_access
from .climate import require_air_conditioner_model, validate_climate_command
from .cover import require_curtain_model, validate_cover_command
from .render_cache import MAX_ENTRY_BYTES, cache_path, read_cache, write_cache
from .scene_store import scenes_dir, sweep_scenes_for_app
from starlette.concurrency import run_in_threadpool

# 这个前缀必须与前端请求、舞台页注入的样式链接保持一致。
router = APIRouter(prefix='/modules/interaction3d', tags=['3D interaction'])


class Interaction3dControlRequest(HAServiceCallRequest):
    """3D 舞台页的设备控制请求：在 HA 服务调用之上补三个定位字段。

    projectId / componentId 用来反查控件配置（确认实体确实配到了这个控件上），
    deviceKind 由前端声明设备种类（如 television），后端仍会独立校验，不信任它。
    """
    project_id: str = Field(default='', alias='projectId', max_length=128)
    component_id: str = Field(default='', alias='componentId', max_length=128)
    # 长度上限与前端约定一致；空串表示未声明，后端不据此放宽任何校验。
    device_kind: str = Field(default='', alias='deviceKind', max_length=32)


def light_history_scope(connection, viewer, project_id: str) -> str:
    """算出一块屏的灯光历史作用域标识（sha256 十六进制摘要）。

    前端用它给本地缓存的灯光历史分桶，避免同一块屏的多个项目、或不同屏之间串数据。
    参与摘要的是 access_token 的哈希而不是令牌本身：换 HA 连接或换令牌即视为新作用域，
    旧历史自然失效，但摘要里不会泄露令牌。

    返回:
        64 位十六进制字符串；任一前提缺失（无项目、无主体、无连接）时返回空串，
        前端拿到空串即认为不分桶。
    """
    principal = viewer.user or viewer.display
    # 缺项目、缺主体身份或缺连接都退化到空作用域：宁可前端不缓存，也不共用错的分桶。
    if not project_id or principal is None or not principal.id or connection is None:
        return ''
    base_url = (connection.base_url or '').strip().rstrip('/')
    encrypted_token = connection.encrypted_access_token or ''
    # 连接必须处于活跃状态且要素齐全，否则同样返回空作用域。
    if not (connection.is_active and connection.id and base_url and encrypted_token):
        return ''
    # 固定顺序的列表而不是集合：摘要必须稳定可复现，顺序一变所有屏都会重新分桶。
    identity = [
        # 版本前缀：分桶算法变更时改这一段，等于无声废弃所有旧分桶。
        'i3d-light-history-v1',
        'user' if viewer.user else 'display',
        principal.id,
        project_id,
        connection.id,
        base_url,
        hashlib.sha256(encrypted_token.encode('utf-8')).hexdigest(),
    ]
    # separators 去掉多余空格，保证同一份输入在任何 Python 版本下摘要一致。
    return hashlib.sha256(json.dumps(identity, separators=(',', ':')).encode('utf-8')).hexdigest()


def scene_path(request: Request, scene_id: str):
    """把 sceneId 解析成磁盘上的快照路径，并确认文件存在。

    sceneId 用 32 位十六进制（uuid4().hex）而不是原始字符串：既能直接拼进文件名，
    也不会带来路径穿越风险。

    异常:
        HTTPException: 404，ID 格式非法，或快照已被清理。
    """
    if not re.fullmatch('[0-9a-f]{32}', scene_id):
        raise HTTPException(404, detail='户型快照不存在。')
    path = scenes_dir(request.app.state.settings) / f'{scene_id}.json'
    if not path.is_file():
        raise HTTPException(404, detail='户型快照不存在，请重新载入户型。')
    return path


def require_scene_viewer(request, database, viewer, scene_id, project_id):
    """要求当前主体有权读取这个户型快照，否则 403。

    门禁顺序（先松后紧，逐层收口）：
    1. 先过增量包授权，没买包的一律拒绝；
    2. 管理员会话直接放行 —— 只有中控设备需要被限制在绑定项目内；
    3. 中控设备必须是请求里声明的那个项目；
    4. 最后确认该项目此刻的仪表盘文档里，确实有控件引用了这个 sceneId。
    """
    require_access(request)
    # 管理员不受项目限制，也不校验引用关系：后台需要能预览任意快照。
    if viewer.is_admin_session:
        return None
    require_viewer_project(viewer, project_id)
    # 关键一步：快照文件躺在共享目录里，必须确认当前项目的文档确实引用了它，
    # 否则任一已配对设备换掉 URL 里的 sceneId 就能读到别人的户型。
    draft = database.get(ProjectDraft, project_id)
    # 草稿损坏时按「没配到」拒绝（403）而不是 500：这是一道门禁，脏数据的答案
    # 只能是「不放行」（B54 的统一入口）。
    document = parse_document(draft.document_json) if draft is not None else None
    if not any(
        c.get('properties', {}).get('sceneId') == scene_id
        for _, c in module_components(document or {})
    ):
        raise HTTPException(403, detail='此户型未配置到当前仪表盘。')
    return None


def require_scene_transfer(request, viewer, scene_id, project_id):
    """require_scene_viewer 的「自建会话」版本，供同步路由直接调用。

    这些路由已经通过 DatabaseSession 依赖拿到了会话，而 sceneId 归属校验要读草稿表，
    这里另开一个短会话用完即关，避免把校验查询挂在请求级会话上延长它的生命周期。
    """
    database = request.app.state.database.session_factory()
    with database:
        require_scene_viewer(request, database, viewer, scene_id, project_id)
    return None


def control_component(database, project_id: str, component_id: str) -> dict:
    """取出某个 3D 交互控件的配置块（电视 / 空调窗帘 / 灯光开关三个分支共用）。

    取不到一律回空 ``dict``（项目草稿不存在、`document_json` 是脏数据、控件已被删掉），
    让调用方按「这个实体没配到这个控件」拒绝：脏数据回 500 会把一条本该是 403 的拒绝
    变成 5xx（B9 的同一类问题），而这里要的答案是拒绝，不是崩。
    """
    draft = database.get(ProjectDraft, project_id) if project_id else None
    if draft is None:
        return {}
    return next(
        (
            item
            for _, item in module_components(parse_document(draft.document_json) or {})
            if item.get('id') == component_id
        ),
        {},
    ) or {}


def _background_asset_ids(scene: object) -> set[str]:
    """收集一份场景里所有楼层背景引用过的素材 ID（已去掉 ``user:`` 前缀）。

    楼层结构有两代：新版是 ``scene.floors[].scene.background``，老版没有 floors，
    整份 scene 就是唯一一层。读取端一律兼容两代 —— 这里漏掉老格式，会把老快照的
    底图判成「没被引用」，从而把本该能显示的底图挡成 404。
    """
    if not isinstance(scene, dict):
        return set()
    floors = scene.get('floors', [{'scene': scene}])
    if not isinstance(floors, list):
        return set()
    return {
        str((floor.get('scene', {}).get('background') or {}).get('assetId', '')).removeprefix('user:')
        for floor in floors
        if isinstance(floor, dict)
    }


@router.post('/scenes', status_code=201)
def snapshot_scene(request: Request, _user: LicensedUser):
    """把 studio 的户型草稿冻结成一个不可变快照，返回 sceneId。

    冻结的意义：studio 草稿会被继续编辑，而舞台页的 sceneId 必须长期指向同一份数据，
    否则同一块屏刷新前后布局就变了。底图也复制一份，之后在 studio 里删掉素材
    也不影响已有快照。

    落盘后顺带做一轮快照回收（见 scene_store）：冻结是低频操作，正好是清理的好时机；
    回收只碰「没有任何仪表盘引用、且已过保留期」的快照，正在用的绝不会被删。

    异常:
        HTTPException: 409，草稿不存在、为空或 JSON 损坏。
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
        # 场景格式，兼容性靠读取端容错（例如缺 floors 时兜底成单层）。
        json.dump(payload, output, ensure_ascii=False)
    # 384（八进制 600）：快照含户型细节，只给属主读写。
    path.chmod(384)
    scene = payload['scene']
    # 老格式的快照没有 floors 字段，这里用 [{'scene': scene}] 兜底成「整份 scene 即唯一一层」。
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
    # 回收失败不影响这次冻结（文件已落盘、sceneId 已经可用），但要让运维看见。
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

    返回快照原文，只在每个楼层的背景上补一个指向本模块 background 路由的 url，
    让前端统一按 url 取图，不必自己拼路径与鉴权参数。
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
    return JSONResponse(payload, headers={'Cache-Control': 'no-store'})


@router.get('/scenes/{scene_id}/current')
def get_current_scene(scene_id: str, request: Request, viewer: LicensedViewer, projectId: str = '', since: str = ''):
    """对比 studio 草稿与参考快照，返回最新场景；无变化时返回 204。

    since 是前端上次拿到的 syncKey，两者一致说明没有改动，直接回 204 ——
    这是舞台页轮询的主路径，避免每次轮询都回传整份户型。

    异常:
        HTTPException: 409，前端带了 since（说明正在跟踪同步）但草稿读不出来或写了一半。
    """
    require_scene_transfer(request, viewer, scene_id, projectId)
    reference = json.loads(scene_path(request, scene_id).read_text(encoding='utf-8'))
    source = request.app.state.settings.studio3d_draft_path
    try:
        # 带 since 说明前端正在跟踪同步：读不出草稿必须报错让它重试，
        # 不能悄悄退化成快照，否则前端会以为「没有变化」而一直停在旧画面上。
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
    key = hashlib.sha256(json.dumps(payload['scene'], sort_keys=True, separators=(',', ':')).encode()).hexdigest()
    # 无变化：回 204 空响应，前端什么都不用做，这是轮询的主路径。
    if key == since:
        from fastapi.responses import Response
        return Response(status_code=204, headers={'Cache-Control': 'no-store'})
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
    return JSONResponse(payload, headers={'Cache-Control': 'no-store'})


@router.get('/scenes/{scene_id}/background/{asset_id}')
def get_background(scene_id: str, asset_id: str, request: Request, viewer: LicensedViewer, projectId: str = ''):
    """读取户型快照的底图。

    两个来源，都以**本场景**为准：先找随快照一起冻结的本地副本
    （``<sceneId>-<assetId><后缀>``）；副本缺失（冻结时复制失败、素材后来才补上）时，
    再回退到用户素材库，此时要求该素材是本场景自己引用过的底图。

    回退路径过去信的是全局草稿（``studio3d_draft_path``）——那份文件是全机共用的，
    它此刻编辑的可能是**别的项目**的户型，于是绑项目 A 的展示页只要猜中/枚举
    ``asset_id`` 就能把别的项目的底图取走（B24）。改为只认本场景：

    - 快照 JSON 自己记着每个楼层的 ``assetId``，因此「复制失败」这个真实场景依然可取；
    - 管理员会话额外保留「当前草稿引用过就放行」这条：管理员本来就不受素材可见范围
      限制（``viewer_user_asset_ids`` 对它返回 None），这条只让编辑器刚换、还没冻结的
      底图也能显示，不会让它多拿到任何东西。

    异常:
        HTTPException: 404，两种来源都取不到底图。
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
            return FileResponse(copy_path, media_type=media_type, headers={'Cache-Control': 'no-store'})
    try:
        # 回退路径：快照建立时复制失败，或素材是后来才补上的，就从用户素材库直读。
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
            return FileResponse(asset, headers={'Cache-Control': 'no-store'})
    except (OSError, ValueError, KeyError, AttributeError):
        # 草稿损坏或不存在时直接落到 404，不向调用方暴露内部状态。
        pass
    raise HTTPException(404, detail='户型底图不存在。')


@router.post('/control')
async def control_light(payload: Interaction3dControlRequest, request: Request, database: DatabaseSession, viewer: LicensedViewer):
    """3D 舞台页的设备控制入口，按 domain 走三条不同的校验路径。

    - media_player / 前端声明为 television：确认实体确实配在该控件的电视列表里，
      且对应电视模型仍在场景中，再按 supported_features 位掩码核对能力；
    - cover / climate：确认环境配置里的绑定与场景中的窗帘 / 空调模型，
      再取 HA 实时状态做能力校验；
    - 其余（light / switch）：只允许 turn_on / turn_off，直接转发 HA 服务调用。

    参数:
        payload: 控制请求，含 domain / service / entity_id / data 与定位字段。
        request: 当前请求。
        database: 请求级数据库会话。
        viewer: 已认证且通过 api 授权的主体。

    返回:
        HA 服务调用的结果（由 call_service 透传）。

    异常:
        HTTPException: 403 实体未配置到当前控件；404 实体不存在或已禁用；
            409 状态不可用或模型失联；415 / 413 / 422 参数或能力不匹配。
    """
    require_access(request)
    if payload.device_kind == 'television' or payload.domain == 'media_player':
        # 必须能定位到具体控件，否则无从校验实体到底配在哪块屏上。
        if not (payload.project_id and payload.component_id):
            raise HTTPException(422, detail='电视控制缺少仪表盘或控件信息。')
        require_viewer_project(viewer, payload.project_id)
        # 取控件配置：实体必须真配在这个控件的电视列表里（properties.devices.televisions）。
        component = control_component(database, payload.project_id, payload.component_id)
        bindings = component.get('properties', {}).get('devices', {}).get('televisions', [])
        # 开关机走 powerEntityId 字段：电视的电源实体常常与媒体播放器不是同一个。
        power_command = payload.service in {'turn_on', 'turn_off'}
        matches = [
            item for item in bindings
            if (item.get('powerEntityId') or item.get('entityId') if power_command else item.get('entityId')) == payload.entity_id
        ]
        if not matches:
            raise HTTPException(403, detail='此电源实体未配置到当前电视。')
        source = request.app.state.settings.studio3d_draft_path
        # 场景取实时草稿优先、快照兜底，与 get_current_scene 同一口径。
        reference = scene_path(request, component['properties'].get('sceneId', ''))
        try:
            scene = json.loads((source if source.is_file() else reference).read_text(encoding='utf-8'))['scene']
            # 三重条件同时成立才算模型在线：楼层 ID、模型 ID 与模型类型 tv；
            # 只比 ID 不够 —— 同一 ID 可能在别的楼层，也可能已被改成其它类型。
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
        # 用 switch 控制时只允许开关机，不能拿开关实体去调播放控制。
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
            # bool 是 int 的子类必须单独排除，否则 True 会被当成「支持全部低位能力」。
            if not isinstance(features, int) or isinstance(features, bool) or not features & media_features[payload.service]:
                raise HTTPException(422, detail='此媒体实体不支持该操作。')
            # 非开关机指令要求电视已开机：off / standby 下 HA 会静默失败。
            if not power_command and state.get('state') in {
                'off',
                'standby'}:
                raise HTTPException(409, detail='请先开启电视。')
        return await call_service(payload, request, database, viewer)
    elif payload.domain in {
        'cover',
        'climate'}:
        is_cover = payload.domain == 'cover'
        # 设备名只用于拼提示文案，不参与任何判断。
        name = '窗帘' if is_cover else '空调'
        # 空调 / 窗帘同样要定位到控件，才能核对环境配置里的实体绑定。
        if not (payload.project_id and payload.component_id):
            raise HTTPException(422, detail=f'{name}控制缺少仪表盘或控件信息。')
        require_viewer_project(viewer, payload.project_id)
        component = control_component(database, payload.project_id, payload.component_id)
        properties = component.get('properties', {})
        # 窗帘与空调分别放在 properties.environment.curtains / airConditioners 下。
        bindings = properties.get('environment', {}).get('curtains' if is_cover else 'airConditioners', [])
        # 实体必须真的配在该控件的环境列表里，配置之外的一律拒绝。
        if not any(item.get('entityId') == payload.entity_id for item in bindings):
            raise HTTPException(403, detail=f'此{name}未配置到当前 3D 交互控件。')
        reference = scene_path(request, properties.get('sceneId', ''))
        source = request.app.state.settings.studio3d_draft_path
        try:
            scene = json.loads((source if source.is_file() else reference).read_text(encoding='utf-8'))['scene']
            # 再确认场景里对应的 3D 模型仍在：模型被删掉后不该还能控制它。
            (require_curtain_model if is_cover else require_air_conditioner_model)(bindings, payload.entity_id, scene)
        except (OSError, ValueError, KeyError, TypeError, AttributeError) as error:
            raise HTTPException(409, detail='户型暂时无法读取，请稍后重试。') from error
        # 只认当前活跃的 HA 连接，避免旧连接下的同名实体被误用。
        connection = active_connection(database)
        if connection is None:
            raise HTTPException(409, detail='请先配置 Home Assistant 连接。')
        # 实体必须属于活跃连接、域与请求一致、同步正常且未被用户禁用；
        # 只信数据库里的实体记录，不接受前端声明的 domain。
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
        return await call_service(payload, request, database, viewer)
    else:
        # 兜底分支只放行灯光与开关的开关动作；其余域（含未声明的）一律拒绝。
        if payload.domain not in {
            'light',
            'switch'} or payload.service not in {
            'turn_on',
            'turn_off'}:
            raise HTTPException(422, detail='3D 交互控制只支持已配置的灯光、开关、空调或窗帘。')
        # 与前三个分支同一口径：中控设备必须证明这个实体**真的配在当前控件上**（B25）。
        # 少了这一步，凡是这块屏可见的实体都能被控制 —— 同一设备上的兄弟实体（灯具的
        # 第二路、窗帘电机的反向开关等由 viewer_entity_ids 按设备放行的那些）、别的控件
        # 配的灯，全都可以用。前端 runtime 也做了同样的比对，但那只是体验（省一次往返），
        # 不是边界：直接调接口就能绕过。
        #
        # 管理员会话不设这道：它本来就是全权主体（可以直接调 /ha/service 控制任意实体），
        # 而编辑器里的 3D 预览挂载未必带上项目与控件标识，卡在这里只会误伤预览。
        if not viewer.is_admin_session:
            if not (payload.project_id and payload.component_id):
                raise HTTPException(422, detail='设备控制缺少仪表盘或控件信息。')
            require_viewer_project(viewer, payload.project_id)
            component = control_component(database, payload.project_id, payload.component_id)
            # 灯光表里 entityId 可以为空（纯装饰的灯），因此这里比的是「有没有一条绑到它」。
            if not any(item.get('entityId') == payload.entity_id for item in component.get('properties', {}).get('lights', [])):
                raise HTTPException(403, detail='此设备未配置到当前 3D 交互控件。')
        return await call_service(payload, request, database, viewer)


@router.get('/stage.html')
def get_stage(request: Request, viewer: LicensedViewer, sceneId: str, projectId: str = ''):
    """下发舞台页 HTML，并注入阶段样式与灯光历史作用域。

    用字符串替换而不是改静态文件：这份页面与编辑器共用同一个文件，这里只做两处追加 ——
    <head> 末尾挂本模块样式，<body> 上挂 class 与 data-* 作用域。
    页面本身 no-store，保证改版后前端立刻拿到新版本。
    """
    database = request.app.state.database.session_factory()
    with database:
        require_scene_viewer(request, database, viewer, sceneId, projectId)
        # 作用域要在会话关闭前算完，它依赖 HA 连接表。
        scope = light_history_scope(active_connection(database), viewer, projectId)
    scene_path(request, sceneId)
    html = (request.app.state.settings.frontend_dir / '3d-studio.html').read_text(encoding='utf-8')
    # v= 缓存戳需要手动维护：页面本身 no-store，只有 URL 变了浏览器才会重新取样式。
    html = html.replace('</head>', '<link rel="stylesheet" href="/api/v1/modules/interaction3d/stage.css?v=20260918224928"></head>')
    html = html.replace('<body>', f'<body class="interaction3d-stage" data-i3d-light-history-scope="{scope}">')
    return HTMLResponse(html, headers={'Cache-Control': 'no-store'})


@router.get('/scenes/{scene_id}/render-cache/{cache_key}')
def get_render_cache(scene_id: str, cache_key: str, request: Request, viewer: LicensedViewer, projectId: str = ''):
    """取一份灯光渲染缓存；不存在时返回 204，让前端自己重新渲染。

    204 而不是 404：缓存缺失是正常状态（首次打开、刚被清理过），
    前端按「无缓存」处理即可，不必区分两种情况。
    """
    require_scene_transfer(request, viewer, scene_id, projectId)
    scene_path(request, scene_id)
    path = cache_path(request.app.state.settings.data_dir, scene_id, projectId, cache_key)
    content = read_cache(path)
    from fastapi.responses import Response
    # 返回空体而不是错误：前端据此直接走渲染流程，不必额外处理一种失败态。
    if content is None:
        return Response(status_code=204, headers={'Cache-Control': 'no-store'})
    # private + no-cache：允许浏览器存，但每次都要回源确认（内容可能已被别的屏覆盖）。
    return Response(content, media_type='image/png', headers={'Cache-Control': 'private, no-cache'})


@router.put('/scenes/{scene_id}/render-cache/{cache_key}', status_code=204)
async def put_render_cache(scene_id: str, cache_key: str, request: Request, viewer: LicensedViewer, projectId: str = ''):
    """接收舞台页回传的灯光合图 PNG 并写入缓存。

    鉴权与磁盘 IO 都放到线程池执行：文件锁（flock）是阻塞调用，
    直接留在事件循环里会拖住其它请求。
    请求体边收边计数，超限立刻中断，避免畸形请求先把体积放大一轮。

    异常:
        HTTPException: 415 不是 PNG；413 超出单条缓存体积上限。
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
    return Response(status_code=204, headers={'Cache-Control': 'no-store'})


@router.get('/access')
def get_access(request: Request, _viewer: LicensedViewer) -> JSONResponse:
    """返回前端授权凭据（短时效，仅供界面判断元素显隐）。

    响应不缓存：授权状态随时可能变化。
    """
    return JSONResponse(access_grant(request), headers={'Cache-Control': 'no-store'})


@router.get('/projects/{project_id}/components/{component_id}/config')
def get_config(project_id: str, component_id: str, request: Request, database: DatabaseSession, viewer: LicensedViewer) -> dict:
    """读取单个 3D 交互控件的完整配置（含位置与全部 properties）。

    先查项目归属再查增量包授权：无权限的调用方不该从错误码里
    推断出「这个仪表盘 / 控件是否存在」。
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


@router.get('/{filename}')
def get_resource(filename: str, request: Request, _viewer: LicensedViewer) -> FileResponse:
    """下发 3D 交互前端资源（JS / CSS），按白名单限定可访问文件。

    异常:
        HTTPException: 404，文件不在白名单内，或解析后落在资源目录之外。
    """
    require_access(request)
    # 白名单同时充当媒体类型表与可访问清单：没登记的文件一律 404，
    # 前缀 /{filename} 不会退化成任意文件读取。新增资源必须在这里登记 ——
    # 漏登记不会报错，只会在浏览器里表现为「某个模块 404、整条 import 链断掉」，
    # 排查时先看这里。stage.js 的每一个相对 import 都必须与下面的名单保持同步。
    media_types = {
        name: 'text/javascript'
        for name in (
            'scene-background.js',
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
    # CSS 单独登记：两类白名单合并后就是本模块可下发的全部资源。
    media_types.update({
        'presence-editor.css': 'text/css',
        'runtime.css': 'text/css',
        'stage.css': 'text/css',
        'climate-panel.css': 'text/css',
        'nas-panel.css': 'text/css',
        'cover-panel.css': 'text/css'})
    # 先按白名单拒绝，再落盘检查，避免无权限的探测走到文件系统。
    if filename not in media_types:
        raise HTTPException(404, detail='3D 交互资源不存在。')
    root = (request.app.state.settings.frontend_dir / 'modules' / 'interaction3d').resolve()
    path = (root / filename).resolve()
    # resolve 之后比对前缀：filename 里的 .. 或符号链接都不能逃出资源目录。
    if not path.is_relative_to(root) or not path.is_file():
        raise HTTPException(404, detail='3D 交互资源不存在。')
    # no-store：前端资源迭代频繁，宁可每次回源，也不要出现「改完没生效」。
    return FileResponse(path, media_type=media_types[filename], headers={'Cache-Control': 'no-store'})
