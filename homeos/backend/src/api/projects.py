"""仪表盘（项目）与其草稿的接口，编辑器的所有读写都落在这里。 路由前缀 /api/v1/projects。"""

from __future__ import annotations

import json
import re
from contextlib import nullcontext
from uuid import uuid4

from fastapi import APIRouter, BackgroundTasks, HTTPException, Request, Response, status
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError

from .proxy.go2rtc import validate_camera_source_addresses
from ..dependencies import (
    DatabaseSession,
    LicensedUser,
    LicensedViewer,
    require_license_feature,
    require_viewer_project,
)
from ..domains.license import features as feature_codes
from ..domains.studio3d.cleanup import (
    new_binding_references,
    repair_binding_document,
    require_current_binding_references,
)
from ..domains.ui_config.global_popups import (
    GLOBAL_POPUP_STATE_ID,
    apply_popups_to_document,
    clear_popup_references,
    global_popup_state,
    global_popups,
    hydrate_document_popups,
    parse_popups_json,
    strip_document_popups,
)
from ..modules.interaction3d.access import (
    require_access as require_interaction3d_access,
)
from ..modules.interaction3d.access import (
    require_document_changes as require_interaction3d_changes,
)
from ..panel.asset_refs import validate_assets
from ..panel.documents import create_blank_project
from ..panel.schema import validate_panel_document
from ..platform.core.db.db_exec import run_db
from ..platform.core.db.models import GlobalCustomPopupState, Project, ProjectDraft
from ..platform.http_cache import make_etag, not_modified, request_etag_matches, set_private_revalidate
from ..schemas import (
    ProjectBindingCheckRequest,
    ProjectCreateRequest,
    ProjectDeleteRequest,
    ProjectDraftUpdate,
    ProjectDuplicateRequest,
)

router = APIRouter(prefix='/projects', tags=['projects'])


def require_project_write(request: Request) -> None:
    if not request.app.state.license_service.allows(feature_codes.FEATURE_PROJECTS_WRITE):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='当前授权不允许修改仪表盘。')


def require_current_bindings(request: Request, database: DatabaseSession, document: dict, previous: dict | None = None) -> None:
    """新增的 3D 绑定必须能在当前户型图里找到对应身份（0.8.1 的 409 守卫）。

    撤销 / 粘贴 / 复制会把「已经从户型里删掉的模型或楼层」重新绑回来；这里只拦**新出现**
    的绑定，历史遗留的失效绑定不阻断普通保存（否则一次保存都过不去）。
    """
    references = new_binding_references(document, previous)
    if not references:
        return
    with request.app.state.asset_catalog.mutation_lock:
        require_current_binding_references(request.app.state.settings, database, references)


def validate_document_assets(request: Request, document: dict) -> set[str]:
    """校验文档引用的图片仍存在，返回其中的可变素材 id（``user:`` / ``studio3d:``）。

    实体在 ``panel.asset_refs``（0.8.1 把仪表盘 / 户型图 / 弹窗三处引用收敛到一处），
    这里只保留「从 request 取 catalog」这一层绑定。
    """
    return validate_assets(request.app.state.asset_catalog, document)


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
    # 复制出来的仪表盘同样要把 3D 绑定带过去：目标户型已经删掉的模型不许再绑回来。
    require_current_bindings(request, database, document)
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


def select_draft_with_popups(project_id: str):
    """构造「草稿行 + 全局弹窗状态行」的单条查询。

    两行没有外键关系（弹窗状态是全局单行表），所以用显式 onclause 的 LEFT JOIN：
    弹窗行不存在时后两列为 NULL，调用方按 `global_popup_state()` 的默认值
    （revision=1 / `[]`）处理。抽出成模块级函数是为了让测试能对着同一条 SQL 断言
    "一次查询、且不触发写事务"，而不是复制一份 join 条件去测一个不存在的实现。
    """
    return (
        select(
            ProjectDraft.schema_version,
            ProjectDraft.revision,
            ProjectDraft.document_json,
            ProjectDraft.updated_at,
            GlobalCustomPopupState.revision.label('popup_revision'),
            GlobalCustomPopupState.popups_json,
        )
        .outerjoin(GlobalCustomPopupState, GlobalCustomPopupState.id == GLOBAL_POPUP_STATE_ID)
        .where(ProjectDraft.project_id == project_id)
    )


@router.get('/{project_id}/draft', response_model=None)
async def get_project_draft(project_id: str, request: Request, response: Response, database: DatabaseSession, viewer: LicensedViewer) -> dict | Response:
    await request.app.state.license_service.confirm_binding()
    require_viewer_project(viewer, project_id)

    def _load_draft_response() -> tuple[int, bytes, str]:
        """读库 + 组装 + 序列化，一整段都在 `run_db` 的线程里跑。

        三处与旧实现的差别（都只影响成本，不影响字节）：
        1. **一条 SELECT**：草稿行与全局弹窗状态行用 LEFT JOIN 一次取回。旧实现是两次
           `database.get`，第二次（`global_popup_state`）在行缺失时还会 **INSERT + flush**
           —— 一个 GET 草稿的请求因此可能产生写事务。
        2. **不深拷贝整篇文档**：`document_json` 是本次请求刚解析出来的临时对象，
           直接原地挂上 `customPopups` 即可（`apply_popups_to_document` 只深拷贝弹窗本身）。
        3. **序列化也在这里做**：`json.dumps(..., separators=(',', ':'))` 与 Starlette
           `JSONResponse` 的渲染参数逐字一致，但省掉了 FastAPI `jsonable_encoder` 对
           30~40KB 文档的递归类型巡检，而且不会把这段 CPU 留在事件循环线程上。
        """
        row = database.execute(select_draft_with_popups(project_id)).first()
        if row is None:
            return 404, b'', ''
        # 弹窗状态行不存在时按 `global_popup_state()` 会创建出来的默认值处理，且不写库。
        popup_revision = int(row.popup_revision or 1)
        etag = make_etag(
            'project-draft', project_id, row.schema_version, row.revision,
            popup_revision, row.updated_at)
        if request_etag_matches(request, etag):
            return 304, b'', etag
        try:
            document = json.loads(row.document_json)
        except (TypeError, ValueError) as error:
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail='仪表盘草稿已损坏，请从备份恢复。') from error
        payload = {
            'projectId': project_id,
            'schemaVersion': row.schema_version,
            'revision': row.revision,
            'globalPopupRevision': popup_revision,
            'document': apply_popups_to_document(document, parse_popups_json(row.popups_json)),
            'updatedAt': row.updated_at.isoformat() if row.updated_at is not None else None}
        body = json.dumps(payload, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
        return 200, body, etag

    status_code, body, draft_etag = await run_db(_load_draft_response)
    if status_code == 404:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='项目草稿不存在。')
    if status_code == 304:
        return not_modified(draft_etag)
    set_private_revalidate(response, draft_etag)
    return Response(content=body, media_type='application/json', headers=dict(response.headers))


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


@router.post('/{project_id}/binding-check')
def check_project_bindings(
    project_id: str,
    payload: ProjectBindingCheckRequest,
    request: Request,
    database: DatabaseSession,
    _user: LicensedUser,
) -> dict:
    """检查调用方**工作副本**里的失效 3D 绑定，并给出只读修复提案。

    三个「不」：不落库、不静默迁移旧数据、不动没被选中的组件。
    真正保存仍走 ``PUT /{project_id}/draft``，历史、乐观锁与资产校验都留在原处。
    """
    require_project_write(request)
    require_interaction3d_access(request, database=database)
    require_interaction3d_changes(request, payload.document, database=database)
    draft = database.get(ProjectDraft, project_id)
    if draft is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='项目草稿不存在。')
    document = validate_panel_document(payload.document)
    if document.get('projectId') != project_id:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail='文档 projectId 与项目不匹配。')
    # 与素材目录的增删共用一把锁：修复预览会按「素材是否还在」决定丢掉失效封面图，
    # 读到的必须是同一时刻的素材目录。
    with request.app.state.asset_catalog.mutation_lock:
        try:
            repaired, issues = repair_binding_document(
                document,
                request.app.state.settings,
                database,
                payload.component_ids,
            )
        except ValueError as error:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(error)) from error
    return {'document': repaired, 'issues': issues, 'revision': draft.revision}


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
    previous_document = hydrate_document_popups(database, json.loads(draft.document_json))
    require_interaction3d_changes(
        request,
        document,
        previous_document,
        database = database,
    )
    require_current_bindings(request, database, document, previous_document)
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
