"""3D 交互接口的支撑件：控件寻址、场景加载与鉴权、请求体模型。
"""
from __future__ import annotations

import hashlib
import re
from collections.abc import Callable

from fastapi import HTTPException, Request
from pydantic import Field
from sqlalchemy import select

from .access import module_components, require_access
from .device import DEVICE_PROFILES
from .scene_store import scenes_dir
from ...core.canonical_json import canonical_json_bytes
from ...core.models import HAEntity, ProjectDraft
from ...core.schemas import HAServiceCallRequest
from ...panel.documents import parse_document
from ...security.dependencies import require_viewer_project

#: 舞台页的 ``<body>`` 开标签。匹配整枚标签而不是写死 ``'<body>'``：舞台页与工作室
_BODY_TAG_PATTERN = re.compile(r'<body(?P<attributes>[^>]*)>', re.IGNORECASE)
class Interaction3dControlRequest(HAServiceCallRequest):
    """3D 舞台页的设备控制请求：在 HA 服务调用之上补三个定位字段。
    """
    project_id: str = Field(default='', alias='projectId', max_length=128)
    component_id: str = Field(default='', alias='componentId', max_length=128)
    # 长度上限与前端约定一致；空串表示未声明，后端不据此放宽任何校验。
    device_kind: str = Field(default='', alias='deviceKind', max_length=32)
def light_history_scope(connection, viewer, project_id: str) -> str:
    principal = viewer.user or viewer.display
    # 缺项目、缺主体身份或缺连接都退化到空作用域：宁可前端不缓存，也不共用错的分桶。
    if not project_id or principal is None or not principal.id or connection is None:
        return ''
    # 两个地址都进摘要：这段摘要的语义是「换连接 / 换地址即视为新作用域」，而**当前在用哪一路
    internal_url = (connection.base_url or '').strip().rstrip('/')
    external_url = (connection.external_base_url or '').strip().rstrip('/')
    encrypted_token = connection.encrypted_access_token or ''
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
    return hashlib.sha256(canonical_json_bytes(identity)).hexdigest()
def scene_path(request: Request, scene_id: str):
    """把 sceneId 解析成磁盘上的快照路径，并确认文件存在。
    """
    if not re.fullmatch('[0-9a-f]{32}', scene_id):
        raise HTTPException(404, detail='户型快照不存在。')
    path = scenes_dir(request.app.state.settings) / f'{scene_id}.json'
    if not path.is_file():
        raise HTTPException(404, detail='户型快照不存在，请重新载入户型。')
    return path
def load_live_scene(request: Request, scene_id: str, validate: Callable[[dict], None] | None = None) -> dict:
    """取「实时草稿优先、冻结快照兜底」的场景段，可选地就地校验一次。
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
    require_access(request)
    # 管理员不受项目限制，也不校验引用关系：后台需要能预览任意快照。
    if viewer.is_admin_session:
        return
    require_viewer_project(viewer, project_id)
    # 关键一步：快照文件躺在共享目录里，必须确认当前项目的文档确实引用了它，
    draft = database.get(ProjectDraft, project_id)
    # 草稿损坏时按「没配到」拒绝（403）而不是 500：这是一道门禁，脏数据的答案
    document = parse_document(draft.document_json) if draft is not None else None
    if not any(
        c.get('properties', {}).get('sceneId') == scene_id
        for _, c in module_components(document or {})
    ):
        raise HTTPException(403, detail='此户型未配置到当前仪表盘。')
    return
def require_scene_transfer(request, viewer, scene_id, project_id):
    """require_scene_viewer 的「自建会话」版本，供同步路由直接调用。
    """
    database = request.app.state.database.session_factory()
    with database:
        require_scene_viewer(request, database, viewer, scene_id, project_id)
def control_component(database, project_id: str, component_id: str) -> dict:
    """取出某个 3D 交互控件的配置块（电视 / 空调窗帘 / 灯光开关三个分支共用）。
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
    """
    if not (payload.project_id and payload.component_id):
        raise HTTPException(422, detail=f'{label}控制缺少仪表盘或控件信息。')
    require_viewer_project(viewer, payload.project_id)
    component = control_component(database, payload.project_id, payload.component_id)
    return component, component.get('properties', {})
def _active_entity(database, connection, entity_id: str, domain: str):
    """取活跃连接下这台「同步正常且未被用户禁用」的实体记录，取不到回 None。
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
