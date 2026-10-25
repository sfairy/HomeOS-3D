"""仪表盘（项目）与其草稿的接口，编辑器的所有读写都落在这里。 路由前缀 /api/v1/projects。"""

from __future__ import annotations

import json
import re
from contextlib import nullcontext
from uuid import uuid4

from fastapi import APIRouter, BackgroundTasks, HTTPException, Request, Response, status
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError

from .go2rtc import validate_camera_source_addresses
from ..dependencies import (
    DatabaseSession,
    LicensedUser,
    LicensedViewer,
    require_license_feature,
    require_viewer_project,
)
from ..domains.license import features as feature_codes
from ..domains.ui_config.global_popups import (
    clear_popup_references,
    global_popup_state,
    global_popups,
    hydrate_document_popups,
    strip_document_popups,
)
from ..modules.interaction3d.access import require_document_changes as require_interaction3d_changes
from ..panel.documents import create_blank_project
from ..panel.schema import validate_panel_document
from ..platform.core.db_exec import run_db
from ..platform.core.models import GlobalCustomPopupState, Project, ProjectDraft
from ..platform.http_cache import make_etag, not_modified, request_etag_matches, set_private_revalidate
from ..schemas import ProjectCreateRequest, ProjectDeleteRequest, ProjectDraftUpdate, ProjectDuplicateRequest

router = APIRouter(prefix='/projects', tags=['projects'])


def require_project_write(request: Request) -> None:
    if not request.app.state.license_service.allows(feature_codes.FEATURE_PROJECTS_WRITE):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='当前授权不允许修改仪表盘。')


def document_asset_ids(value) -> set[str]:
    result = set()
    if isinstance(value, dict):
        for key, item in value.items():
            if isinstance(item, str) and key.lower().endswith('assetid') and item.startswith(('builtin:', 'user:')):
                result.add(item)
                continue
            result.update(document_asset_ids(item))
    elif isinstance(value, list):
        for item in value:
            result.update(document_asset_ids(item))
    return result


def validate_document_assets(request: Request, document: dict) -> set[str]:
    catalog = request.app.state.asset_catalog
    user_asset_ids = set()
    for asset_id in document_asset_ids(document):
        if not catalog.asset_exists(asset_id):
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail={
                'code': 'ASSET_MISSING',
                'message': f'仪表盘引用的图片已不存在：{asset_id}'})
        if not asset_id.startswith('user:'):
            continue
        user_asset_ids.add(asset_id)
    return user_asset_ids


def serialize_document(document: object) -> str:
    return json.dumps(document, ensure_ascii=False, sort_keys=True, separators=(',', ':'))


def project_body(project: Project, draft: ProjectDraft | None = None) -> dict:
    body = {
        'id': project.id,
        'name': project.name,
        'slug': project.slug,
        'description': project.description,
        'createdAt': project.created_at,
        'updatedAt': project.updated_at}
    if draft is not None:
        body['draftRevision'] = draft.revision
        body['schemaVersion'] = draft.schema_version
    return body


def unique_slug(database: DatabaseSession, name: str) -> str:
    base = re.sub('[^a-z0-9]+', '-', name.lower()).strip('-')[:96] or 'dashboard'
    candidate = base
    suffix = 2
    while database.scalar(select(Project.id).where(Project.slug == candidate)):
        candidate = f'{base}-{suffix}'
        suffix += 1
    return candidate


def ensure_unique_project_name(database: DatabaseSession, name: str, exclude_project_id: str | None = None) -> None:
    query = select(Project.id).where(Project.name == name)
    if exclude_project_id:
        query = query.where(Project.id != exclude_project_id)
    if database.scalar(query):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail='仪表盘名称已存在。')


def commit_project_name(database: DatabaseSession) -> None:
    try:
        database.commit()
    except IntegrityError as error:
        database.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail='仪表盘名称已存在。') from error


@router.get('')
def list_projects(database: DatabaseSession, viewer: LicensedViewer) -> dict:
    # 查看者恒为登录会话，可见全部仪表盘（与编辑器同权限）。
    projects = list(database.scalars(select(Project).order_by(Project.updated_at.desc())))
    drafts = {
        item.project_id: item
        for item in database.scalars(select(ProjectDraft).where(ProjectDraft.project_id.in_([project.id for project in projects])))
    } if projects else {}
    return {'items': [project_body(project, drafts.get(project.id)) for project in projects]}


def _active_dashboard_id(request: Request) -> str:
    """读取「当前展示的仪表盘」偏好键；未设置 / app_config 未就绪时返回空串。"""
    app_config = getattr(request.app.state, 'app_config', None)
    if app_config is None:
        return ''
    try:
        profiles = app_config.get('profiles')
    except Exception:
        return ''
    if not isinstance(profiles, dict):
        return ''
    return str(profiles.get('activeDashboardId') or '').strip()


@router.get('/active')
def get_active_project(request: Request, database: DatabaseSession, viewer: LicensedViewer) -> dict:
    """展示端要展示的那一个仪表盘（单源解析）。

    解析规则只有一条、且完全落在 ``projects`` 这个 id 空间内：

    1. 偏好键 ``appConfig.profiles.activeDashboardId`` 命中一个真实项目 → 用它；
    2. 否则用最近更新的项目（与 ``GET /projects`` 的首项一致）。

    为什么单独开这个端点：展示端原先要自己把 ``/projects`` 的 id 与
    ``/config/project/active`` 的 ``activeProfileId`` 对一遍 —— 但那是**布局方案**的
    id 空间（`project_configs.projectId`，取值如 ``default``），与仪表盘 id
    （``projects.id``，UUID）根本不是一回事，比对几乎必然落空、静默退化成「列表第一项」。
    两个轴各自单源：仪表盘看这里，布局方案看 ``/config/project/active``。

    无仪表盘时返回 ``{'active': None}``（全新安装的正常空状态，不是错误）。

    这里额外判 ``display`` 能力码：本端点**只被展示端使用**（``display.ts`` 的
    ``resolveOverviewProject``，全仓库唯一调用点），是「墙屏能看到哪个仪表盘」的数据出口。
    在此之前它只挂了 ``LicensedViewer``（只判「授权整体可用」，不判具体能力），于是没买
    ``display`` 的授权照样能直接调 API 读到展示数据 —— 页面级门禁拦得住浏览器，拦不住
    直连。其余 ``/projects/*`` 读写端点是编辑器与展示共用，不能挂 ``display``。
    """
    require_license_feature(request, feature_codes.FEATURE_DISPLAY)
    wanted = _active_dashboard_id(request)
    project = database.get(Project, wanted) if wanted else None
    if project is None:
        project = database.scalars(select(Project).order_by(Project.updated_at.desc()).limit(1)).first()
    return {'active': project_body(project) if project is not None else None}


@router.put('/{project_id}/active', status_code=status.HTTP_200_OK)
def set_active_project(project_id: str, request: Request, database: DatabaseSession, user: LicensedUser) -> dict:
    """把某个仪表盘设为「当前展示」。"""
    project = database.get(Project, project_id)
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='仪表盘不存在。')
    app_config = getattr(request.app.state, 'app_config', None)
    if app_config is None:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail='配置服务尚未就绪。')
    app_config.update({'profiles': {'activeDashboardId': project.id}})
    return {'active': project_body(project)}


@router.post('', status_code=status.HTTP_201_CREATED)
def create_project(body: ProjectCreateRequest, request: Request, database: DatabaseSession, user: LicensedUser) -> dict:
    require_project_write(request)
    ensure_unique_project_name(database, body.name)
    project_id = str(uuid4())
    document = create_blank_project(project_id, body.name, body.canvas_width, body.canvas_height)
    project = Project(
        id=project_id,
        name=body.name,
        slug=unique_slug(database, body.name),
        description=body.description.strip(),
        created_by=user.id,
    )
    draft = ProjectDraft(
        project_id=project_id,
        schema_version=document['schemaVersion'],
        revision=1,
        document_json=serialize_document(strip_document_popups(document)),
        updated_by=user.id,
    )
    database.add_all([project, draft])
    commit_project_name(database)
    database.refresh(project)
    request.app.state.global_log.append('success', '仪表盘编辑器', '配置', f'已创建仪表盘：{project.name}')
    return project_body(project, draft)


@router.get('/{project_id}')
def get_project(project_id: str, database: DatabaseSession, viewer: LicensedViewer) -> dict:
    require_viewer_project(viewer, project_id)
    project = database.get(Project, project_id)
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='项目不存在。')
    return project_body(project, database.get(ProjectDraft, project_id))


@router.post('/{project_id}/duplicate', status_code=status.HTTP_201_CREATED)
def duplicate_project(project_id: str, body: ProjectDuplicateRequest, request: Request, database: DatabaseSession, user: LicensedUser) -> dict:
    require_project_write(request)
    source = database.get(Project, project_id)
    source_draft = database.get(ProjectDraft, project_id)
    if source is None or source_draft is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='项目或草稿不存在。')
    ensure_unique_project_name(database, body.name)
    duplicate_id = str(uuid4())
    document = hydrate_document_popups(database, json.loads(source_draft.document_json))
    require_interaction3d_changes(request, document, database=database)
    validate_document_assets(request, document)
    document['projectId'] = duplicate_id
    document['name'] = body.name
    document = validate_panel_document(document)
    duplicate = Project(
        id=duplicate_id,
        name=body.name,
        slug=unique_slug(database, body.name),
        description=source.description,
        created_by=user.id,
    )
    duplicate_draft = ProjectDraft(
        project_id=duplicate_id,
        schema_version=document['schemaVersion'],
        revision=1,
        document_json=serialize_document(strip_document_popups(document)),
        updated_by=user.id,
    )
    database.add_all([duplicate, duplicate_draft])
    commit_project_name(database)
    database.refresh(duplicate)
    request.app.state.global_log.append('success', '仪表盘编辑器', '配置', f'已复制仪表盘：{source.name} → {duplicate.name}')
    return project_body(duplicate, duplicate_draft)


@router.delete('/{project_id}', status_code=status.HTTP_204_NO_CONTENT)
def delete_project(project_id: str, body: ProjectDeleteRequest, request: Request, background_tasks: BackgroundTasks, database: DatabaseSession, _user: LicensedUser) -> None:
    require_project_write(request)
    project = database.get(Project, project_id)
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='项目不存在。')
    if body.confirmation != project.name:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail='确认文字与项目名称不一致。')
    project_name = project.name
    database.delete(project)
    database.commit()
    request.app.state.global_log.append('warning', '仪表盘编辑器', '配置', f'已删除仪表盘：{project_name}')
    background_tasks.add_task(request.app.state.studio_ha.refresh_persistent_entity_ids, ensure_states=False)


@router.get('/{project_id}/draft', response_model=None)
async def get_project_draft(project_id: str, request: Request, response: Response, database: DatabaseSession, viewer: LicensedViewer) -> dict | Response:
    await request.app.state.license_service.confirm_binding()
    require_viewer_project(viewer, project_id)
    def _load_draft_payload() -> tuple[ProjectDraft | None, dict | None, int, str]:
        draft = database.get(ProjectDraft, project_id)
        if draft is None:
            return None, None, 0, ''
        popup_revision = global_popup_state(database).revision
        # 校验器只依赖修订号等稳定字段，命中时完全不解析 30~40KB 的 document_json。
        etag = make_etag(
            'project-draft', project_id, draft.schema_version, draft.revision,
            popup_revision, draft.updated_at)
        if request_etag_matches(request, etag):
            return draft, None, popup_revision, etag
        document = hydrate_document_popups(database, json.loads(draft.document_json))
        return draft, document, popup_revision, etag

    draft, document, popup_revision, draft_etag = await run_db(_load_draft_payload)
    if draft is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='项目草稿不存在。')
    if document is None:
        return not_modified(draft_etag)
    set_private_revalidate(response, draft_etag)
    return {
        'projectId': project_id,
        'schemaVersion': draft.schema_version,
        'revision': draft.revision,
        'globalPopupRevision': popup_revision,
        'document': document,
        'updatedAt': draft.updated_at}


@router.get('/{project_id}/revision')
def get_project_revision(project_id: str, database: DatabaseSession, viewer: LicensedViewer) -> dict:
    """返回 display 客户端使用的轻量仪表盘修订版本。"""
    require_viewer_project(viewer, project_id)
    draft = database.get(ProjectDraft, project_id)
    if draft is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='项目草稿不存在。')
    return {
        'projectId': project_id,
        'revision': draft.revision,
        'globalPopupRevision': global_popup_state(database).revision,
        'updatedAt': draft.updated_at}


def _collect_removed_popup_ids(
    document_value: dict, stored_global_popups: list, popups_dirty: bool
) -> set[str]:
    """本次提交相对已存全局弹窗被移除的 id 集合（未标记 dirty 时为空）。"""
    submitted_popup_ids = {
        popup_id
        for popup in (document_value.get('customPopups') or [])
        if isinstance(popup, dict) and isinstance((popup_id := popup.get('id')), str)
    }
    if not popups_dirty:
        return set()
    stored_popup_ids = {
        popup_id
        for popup in stored_global_popups
        if isinstance(popup, dict) and isinstance((popup_id := popup.get('id')), str)
    }
    return submitted_popup_ids - stored_popup_ids


def _write_global_popups(
    database: DatabaseSession, user_id: str, submitted_popups: list, expected_revision: int
) -> None:
    """乐观锁写入全局弹窗表；修订号被并发改动时回滚并抛 409。"""
    popup_result = database.execute(
        update(GlobalCustomPopupState)
        .where(GlobalCustomPopupState.id == 1, GlobalCustomPopupState.revision == expected_revision)
        .values(popups_json=serialize_document(submitted_popups), revision=GlobalCustomPopupState.revision + 1, updated_by=user_id)
        .execution_options(synchronize_session=False)
    )
    if popup_result.rowcount != 1:  # pyright: ignore[reportAttributeAccessIssue]
        database.rollback()
        current_popup_revision = database.scalar(select(GlobalCustomPopupState.revision).where(GlobalCustomPopupState.id == 1))
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail={
            'code': 'GLOBAL_POPUP_REVISION_CONFLICT',
            'message': '全局组合弹窗已在其他仪表盘中更新，请刷新后重试。',
            'currentRevision': current_popup_revision})


def _remove_popup_refs_from_drafts(
    database: DatabaseSession, user_id: str, removed_popup_ids: set[str], project_id: str
) -> None:
    """把已删除的全局弹窗引用从其余仪表盘草稿中摘除（逐草稿乐观锁）。"""
    for referenced_draft in database.scalars(select(ProjectDraft).where(ProjectDraft.project_id != project_id)):
        try:
            referenced_document = json.loads(referenced_draft.document_json)
        except (TypeError, json.JSONDecodeError):
            continue
        if not clear_popup_references(referenced_document, removed_popup_ids):
            continue
        referenced_result = database.execute(
            update(ProjectDraft)
            .where(ProjectDraft.project_id == referenced_draft.project_id, ProjectDraft.revision == referenced_draft.revision)
            .values(document_json=serialize_document(referenced_document), revision=ProjectDraft.revision + 1, updated_by=user_id)
            .execution_options(synchronize_session=False)
        )
        if referenced_result.rowcount != 1:  # pyright: ignore[reportAttributeAccessIssue]
            database.rollback()
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail={
                'code': 'PROJECT_REVISION_CONFLICT',
                'message': '其他仪表盘正在更新，组合弹窗尚未删除，请重试。'})


def _write_draft_document(
    database: DatabaseSession,
    user_id: str,
    project_id: str,
    draft_revision: int,
    serialized_document: str,
    schema_version: object,
) -> None:
    """乐观锁写入项目草稿文档；修订号被并发改动时回滚并抛 409/404。"""
    write_result = database.execute(
        update(ProjectDraft)
        .where(ProjectDraft.project_id == project_id, ProjectDraft.revision == draft_revision)
        .values(document_json=serialized_document, schema_version=schema_version, revision=ProjectDraft.revision + 1, updated_by=user_id)
        .execution_options(synchronize_session=False)
    )
    if write_result.rowcount != 1:  # pyright: ignore[reportAttributeAccessIssue]
        database.rollback()
        current_revision = database.scalar(select(ProjectDraft.revision).where(ProjectDraft.project_id == project_id))
        if current_revision is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='项目草稿不存在。')
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail={
            'code': 'PROJECT_REVISION_CONFLICT',
            'message': '草稿已被其他页面更新。',
            'currentRevision': current_revision})


def _draft_update_response(
    request: Request,
    background_tasks: BackgroundTasks,
    database: DatabaseSession,
    project_id: str,
    project_name: object,
) -> dict:
    """写入成功后的收尾：刷新实体缓存、记录日志并返回回显载荷。"""
    background_tasks.add_task(request.app.state.studio_ha.refresh_persistent_entity_ids, ensure_states=False)
    database.expire_all()
    draft = database.get(ProjectDraft, project_id)
    if draft is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='项目草稿不存在。')
    request.app.state.global_log.append('success', '仪表盘编辑器', '配置', f'仪表盘已保存：{project_name}（修订 {draft.revision}）')
    hydrated_document = hydrate_document_popups(database, json.loads(draft.document_json))
    draft_body = {
        'projectId': project_id,
        'schemaVersion': draft.schema_version,
        'revision': draft.revision,
        'globalPopupRevision': global_popup_state(database).revision,
        'document': hydrated_document,
        'updatedAt': draft.updated_at,
    }
    database.close()
    return draft_body


@router.put('/{project_id}/draft')
def update_project_draft(project_id: str, body: ProjectDraftUpdate, request: Request, background_tasks: BackgroundTasks, database: DatabaseSession, user: LicensedUser) -> dict:
    require_project_write(request)
    draft = database.get(ProjectDraft, project_id)
    if draft is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='项目草稿不存在。')
    if draft.revision != body.revision:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail={
            'code': 'PROJECT_REVISION_CONFLICT',
            'message': '草稿已被其他页面更新。',
            'currentRevision': draft.revision})
    popup_state = global_popup_state(database)
    document_value = dict(body.document)
    stored_global_popups = global_popups(database)
    if not body.global_popups_dirty:
        document_value['customPopups'] = stored_global_popups
    removed_popup_ids = _collect_removed_popup_ids(document_value, stored_global_popups, body.global_popups_dirty)
    clear_popup_references(document_value, removed_popup_ids)
    try:
        document = validate_panel_document(document_value)
        # 摄像头地址在这里把关：保存期只做字面量/格式校验（不连摄像头），
        # 已停用的地址保留下来，切回 go2rtc 时不必重填。
        validate_camera_source_addresses(document)
    except ValueError as error:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(error)) from error
    require_interaction3d_changes(
        request,
        document,
        hydrate_document_popups(database, json.loads(draft.document_json)),
        database = database,
    )
    user_asset_ids = validate_document_assets(request, document)
    if document['projectId'] != project_id:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail='文档 projectId 与项目不匹配。')
    ensure_unique_project_name(database, document['name'], exclude_project_id=project_id)
    submitted_popups = document.get('customPopups') or []
    global_popups_changed = body.global_popups_dirty and serialize_document(submitted_popups) != serialize_document(stored_global_popups)
    expected_global_popup_revision = body.global_popup_revision or popup_state.revision
    if global_popups_changed and expected_global_popup_revision != popup_state.revision:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail={
            'code': 'GLOBAL_POPUP_REVISION_CONFLICT',
            'message': '全局组合弹窗已在其他仪表盘中更新，请刷新后重试。',
            'currentRevision': popup_state.revision})
    serialized_document = serialize_document(strip_document_popups(document))
    asset_guard = request.app.state.asset_catalog.mutation_lock if user_asset_ids else nullcontext()
    with asset_guard:
        if user_asset_ids:
            validate_document_assets(request, document)
        if global_popups_changed:
            _write_global_popups(database, user.id, submitted_popups, expected_global_popup_revision)
            if removed_popup_ids:
                _remove_popup_refs_from_drafts(database, user.id, removed_popup_ids, project_id)
        _write_draft_document(database, user.id, project_id, body.revision, serialized_document, document['schemaVersion'])
        database.execute(update(Project).where(Project.id == project_id).values(name=document['name']))
        commit_project_name(database)
    return _draft_update_response(request, background_tasks, database, project_id, document['name'])
