"""3D 交互接口的支撑件：控件寻址、场景加载与鉴权、请求体模型。

从 modules/interaction3d/api.py 拆出来：那一份只留「路由 + 逐请求的编排」，而这一份是
**所有路由共用**的判定与取数（场景路径怎么拼、这条连接能不能看这个场景、控件指向哪个实体）。
拆开之后路由文件回到 800 行预算内，两边的改动也互不打扰。

依赖方向是单向的：api.py 从这里 import，本模块**不** import api.py —— 否则就是一个模块级环，
两个文件谁先加载都会炸（第 43 条守卫管的是跨项目 import，模块级环得靠这条纪律挡）。
"""
from __future__ import annotations

import hashlib
import re
from collections.abc import Callable

from fastapi import HTTPException, Request
from pydantic import Field
from sqlalchemy import select

from ...core.canonical_json import canonical_json_bytes
from ...security.dependencies import require_viewer_project
from ...core.models import HAEntity, ProjectDraft
from ...panel.documents import parse_document
from ...core.schemas import HAServiceCallRequest
from .access import module_components, require_access
from .device import DEVICE_PROFILES
from .scene_store import scenes_dir


#: 舞台页的 ``<body>`` 开标签。匹配整枚标签而不是写死 ``'<body>'``：舞台页与工作室
#: 共用同一份 HTML，工作室的 ``<body>`` 带 ``data-tone``，一旦模板再加上任何属性，
#: 写死的字符串就会**静默替换 0 次** —— 页面照常返回 200，但少了 ``.interaction3d-stage``
#: 前缀，stage.css 里每一条作用域样式全部失效，顶栏、素材库与户型画布会整片漏进舞台。
_BODY_TAG_PATTERN = re.compile(r'<body(?P<attributes>[^>]*)>', re.IGNORECASE)
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
    """
    principal = viewer.user or viewer.display
    # 缺项目、缺主体身份或缺连接都退化到空作用域：宁可前端不缓存，也不共用错的分桶。
    if not project_id or principal is None or not principal.id or connection is None:
        return ''
    # 两个地址都进摘要：这段摘要的语义是「换连接 / 换地址即视为新作用域」，而**当前在用哪一路
    # 不进摘要** —— 内外网切换只是同一台 HA 的两种走法，数据相同，不该让所有屏的历史缓存作废。
    internal_url = (connection.base_url or '').strip().rstrip('/')
    external_url = (connection.external_base_url or '').strip().rstrip('/')
    encrypted_token = connection.encrypted_access_token or ''
    # 连接必须处于活跃状态且要素齐全，否则同样返回空作用域。
    if not (connection.is_active and connection.id and (internal_url or external_url) and encrypted_token):
        return ''
    # 固定顺序的列表而不是集合：摘要必须稳定可复现，顺序一变所有屏都会重新分桶。
    identity = [
        # 版本前缀：分桶算法变更时改这一段，等于无声废弃所有旧分桶。
        'i3d-light-history-v1',
        'user' if viewer.user else 'display',
        principal.id,
        project_id,
        connection.id,
        internal_url,
        external_url,
        hashlib.sha256(encrypted_token.encode('utf-8')).hexdigest(),
    ]
    # 规范序列化去掉多余空格并保持键序稳定，保证同一份输入在任何 Python 版本下摘要一致；
    # 它同时钉住 ``ensure_ascii=False`` —— 手写 ``json.dumps`` 最易漏掉这一项，一旦某字段
    # 含中文就会与规范形式产生两套字节、摘要随之分叉。
    return hashlib.sha256(canonical_json_bytes(identity)).hexdigest()
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
def load_live_scene(request: Request, scene_id: str, validate: Callable[[dict], None] | None = None) -> dict:
    """取「实时草稿优先、冻结快照兜底」的场景段，可选地就地校验一次。

    控制类接口的六个分支都要这一件事：先解析出场景，再用它核对"这次要控制的模型还在不在"。
    原先每处各写一遍「拼路径 → 读文件 → json.loads → try/except → 409」，五份逐字相同，
    现在只剩这一处。

    为什么 ``validate`` 在同一个 try 里跑：错误场景（``floors`` 不是列表、模型项缺字段）会让
    校验函数抛 ``KeyError``/``AttributeError``/``TypeError``，这些原先就被同一条 except 兜成
    「户型暂时无法读取」。把校验留在 try 内，语义与拆分前逐字一致。校验自己抛的
    ``HTTPException``（如"门锁模型已失联"）不在捕获范围内，照原样向上抛。

    参数:
        request: 用于取 ``app.state``（草稿路径、解析缓存）。
        scene_id: 控件配置里的 sceneId；实时草稿不存在时回落到这个冻结快照。
        validate: 可选的校验函数，入参是场景字典。
    异常:
        HTTPException: 404 冻结快照不存在（沿用 ``scene_path``）；
            409 场景读不出来或结构坏了（文案与拆分前一致）。
    """
    # 冻结快照先解析：快照不存在时应当照旧回 404，而不是被下面的 409 吞掉。
    reference = scene_path(request, scene_id)
    source = request.app.state.settings.studio3d_draft_path
    try:
        # 实时草稿优先、快照兜底，与 get_current_scene 同一口径；解析结果按文件指纹缓存。
        payload = request.app.state.live_scenes.load(source if source.is_file() else reference)
        scene = payload['scene']
        if validate is not None:
            validate(scene)
        return scene
    except (OSError, ValueError, KeyError, TypeError, AttributeError) as error:
        raise HTTPException(409, detail='户型暂时无法读取，请稍后重试。') from error
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
    # 只能是「不放行」（统一入口）。
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
    变成 5xx（同一类问题），而这里要的答案是拒绝，不是崩。
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
def control_scope(database, payload, viewer, label: str) -> tuple[dict, dict]:
    """定位控件并校验「当前主体能看这个项目」，返回 ``(component, properties)``。

    六个控制分支的前导逐字相同，只有提示文案的前缀不同（电视 / 门锁 / 附加实体 / 窗帘·空调 /
    空气净化器 / 设备）。收在这里之后，「缺控件信息 → 422」「越权项目 → 403」这两条口径
    只存在一处，不会再出现某个分支漏掉其中一步。

    异常:
        HTTPException: 422 请求没带仪表盘或控件；403 当前主体看不到这个项目。
    """
    if not (payload.project_id and payload.component_id):
        raise HTTPException(422, detail=f'{label}控制缺少仪表盘或控件信息。')
    require_viewer_project(viewer, payload.project_id)
    component = control_component(database, payload.project_id, payload.component_id)
    return component, component.get('properties', {})
def _active_entity(database, connection, entity_id: str, domain: str):
    """取活跃连接下这台「同步正常且未被用户禁用」的实体记录，取不到回 None。

    只信数据库里的实体记录，不接受前端声明的 domain：前端能改 URL，数据库不能。
    """
    return database.scalar(
        select(HAEntity).where(
            HAEntity.connection_id == connection.id,
            HAEntity.entity_id == entity_id,
            HAEntity.domain == domain,
            HAEntity.sync_status == 'active',
            HAEntity.disabled_by.is_(None),
        )
    )
def _find_device_extra(properties: dict, entity_id: str, *, purifier: bool):
    """在设备宿主里找出配了这个附加实体的那台设备。

    返回 ``(宿主, 模型类型, 附加项)``；这台控件上没有任何设备配到这个实体时三项都是 ``None``。

    通用设备按 ``DEVICE_PROFILES`` 逐集合扫描并带上各自的模型类型；空气净化器单列
    （它的外观族是 ``airpurifier`` / ``freshair``，与通用设备不是同一套）。``purifier``
    决定这次只认空气净化器还是只认通用设备，防止拿通用设备的附加实体去走净化器的文案。

    注意净化器那一支的「模型类型」**不被调用方消费** —— 它的存活校验走
    ``purifier.require_purifier_model``（那里认的是两个类型的集合），这里带上只是为了与
    通用设备分支同形。
    """
    if purifier:
        hosts = [
            ('airpurifier', host)
            for host in properties.get('environment', {}).get('airPurifiers', [])
        ]
    else:
        hosts = [
            (profile['model_type'], host)
            for profile in DEVICE_PROFILES.values()
            for host in properties.get('devices', {}).get(profile['collection'], [])
        ]
    for model_type, host in hosts:
        extra = next(
            (
                candidate
                for candidate in host.get('extraControls', [])
                if isinstance(candidate, dict) and candidate.get('entityId') == entity_id
            ),
            None,
        )
        if extra is not None:
            return host, model_type, extra
    return None, None, None
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
