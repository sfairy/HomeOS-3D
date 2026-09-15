"""仪表盘（项目）与其草稿的接口，编辑器的所有读写都落在这里。

路由前缀 /api/v1/projects。项目与草稿共用同一个 id（ProjectDraft.project_id 即 Project.id）。
并发控制靠草稿行上的递增 revision：保存时必须带回读取时的 revision，
不匹配即 409，避免两个页面互相覆盖；全局组合弹窗另有自己的 revision 与冲突码。
"""
from __future__ import annotations

import json
import re
from contextlib import nullcontext
from uuid import uuid4

from fastapi import APIRouter, BackgroundTasks, HTTPException, Request, status
from sqlalchemy import select, update

from ..dependencies import DatabaseSession, LicensedUser, LicensedViewer, require_viewer_project
from ..global_popups import clear_popup_references, global_popup_state, global_popups, hydrate_document_popups, strip_document_popups
from ..models import GlobalCustomPopupState, Project, ProjectDraft
from ..panel.documents import create_blank_project
from ..panel.schema import validate_panel_document
from ..modules.interaction3d.access import require_document_changes as require_interaction3d_changes
from ..schemas import ProjectCreateRequest, ProjectDeleteRequest, ProjectDraftUpdate, ProjectDuplicateRequest

router = APIRouter(prefix='/projects', tags=['projects'])


def require_project_write(request: Request) -> None:
    """写操作的授权门禁：要求授权允许 projects.write，否则 403。

    认证由 LicensedUser 依赖完成，这里只叠一层能力码；
    读接口与写接口共用同一个 router，所以门禁写在各个写路由里而不是挂在依赖上。
    """
    if not request.app.state.license_service.allows('projects.write'):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='当前授权不允许修改仪表盘。')


def document_asset_ids(value) -> set[str]:
    """递归收集文档里引用的全部素材 ID（只认 builtin: 与 user: 两种前缀）。"""
    result = set()
    if isinstance(value, dict):
        # 键名按 assetId 后缀识别（大小写不敏感），并限定前缀，避免把普通 URL 误当素材。
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
    """校验文档引用的图片都还在素材目录里，并返回其中用户上传图片的 ID 集合。

    会抛 422，detail 为 ASSET_MISSING：图片已被删掉，仪表盘不能再引用它。
    返回值供保存接口加锁使用（见 update_project_draft 的 asset_guard）。
    """
    catalog = request.app.state.asset_catalog
    user_asset_ids = set()
    for asset_id in document_asset_ids(document):
        if not catalog.asset_exists(asset_id):
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail={
                'code': 'ASSET_MISSING',
                'message': f'仪表盘引用的图片已不存在：{asset_id}'})
        # 只统计用户上传的图片：内置素材不存在「哪块屏不该看到」的越权问题，交给目录统一把关。
        if not asset_id.startswith('user:'):
            continue
        user_asset_ids.add(asset_id)
    return user_asset_ids


def serialize_document(document: dict) -> str:
    """把文档序列化成落库字符串。

    键排序 + 紧凑分隔符，保证同一份文档每次序列化结果完全一致，
    这样比较「内容是否变化」时可以直接比字符串，不必逐字段 diff。
    """
    return json.dumps(document, ensure_ascii=False, sort_keys=True, separators=(',', ':'))


def project_payload(project: Project, draft: ProjectDraft | None = None) -> dict:
    """把项目行拼成前端使用的 JSON（camelCase 出）。

    传入 draft 时额外带上 draftRevision 与 schemaVersion。
    """
    payload = {
        'id': project.id,
        'name': project.name,
        'slug': project.slug,
        'description': project.description,
        'createdAt': project.created_at,
        'updatedAt': project.updated_at}
    if draft is not None:
        payload['draftRevision'] = draft.revision
        payload['schemaVersion'] = draft.schema_version
    return payload


def unique_slug(database: DatabaseSession, name: str) -> str:
    """由名称生成 URL 用的 slug，已被占用时追加 -2、-3 …。

    slug 只用于展示路径，因此可以随意变形；唯一性必须保证，
    因为路径要靠它定位到唯一的仪表盘。
    """
    # 只保留小写字母与数字，其余折叠成连字符；中文名会被清空，故兜底成 dashboard。截断到 96 字符避免超长 slug。
    base = re.sub('[^a-z0-9]+', '-', name.lower()).strip('-')[:96] or 'dashboard'
    candidate = base
    suffix = 2
    # 逐个试后缀：名称虽唯一，但不同名称仍可能折叠出同一个 slug。
    while database.scalar(select(Project.id).where(Project.slug == candidate)):
        candidate = f'{base}-{suffix}'
        suffix += 1
    return candidate


def ensure_unique_project_name(database: DatabaseSession, name: str, exclude_project_id: str | None = None) -> None:
    """确认项目名未被占用（可排除自身），重名则抛 409「仪表盘名称已存在。」。

    名称与 slug 分开校验：名称是用户看到并用来区分仪表盘的唯一依据，
    不能因为 slug 能自动加后缀就允许重名。
    """
    query = select(Project.id).where(Project.name == name)
    if exclude_project_id:
        query = query.where(Project.id != exclude_project_id)
    if database.scalar(query):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail='仪表盘名称已存在。')


@router.get('')
def list_projects(database: DatabaseSession, viewer: LicensedViewer) -> dict:
    """列出当前主体可见的仪表盘，附带各自的草稿版本信息。

    管理员身份看到全部，按更新时间倒序；中控设备身份只会看到自己绑定的那一个项目。
    返回 {items: [...]}。
    """
    query = select(Project).order_by(Project.updated_at.desc())
    # 中控设备被限定在单个项目上：即使知道别的项目 id 也列不出来。
    if viewer.project_id is not None:
        query = query.where(Project.id == viewer.project_id)
    projects = list(database.scalars(query))
    # 一次性把这批项目的草稿查出来，避免每个项目单独查一次（N+1）。
    drafts = {
        item.project_id: item
        for item in database.scalars(select(ProjectDraft).where(ProjectDraft.project_id.in_([project.id for project in projects])))
    # 列表为空时跳过查询：IN () 恒假，白跑一次数据库。
    } if projects else {}
    return {'items': [project_payload(project, drafts.get(project.id)) for project in projects]}


@router.post('', status_code=status.HTTP_201_CREATED)
def create_project(payload: ProjectCreateRequest, request: Request, database: DatabaseSession, user: LicensedUser) -> dict:
    """新建一个空白仪表盘，同时写入它的第一版草稿。

    身份与能力码：LicensedUser（认证 + api），另需 projects.write，否则 403
    「当前授权不允许修改仪表盘。」。
    请求字段：name、description、canvas_width、canvas_height。
    返回：项目 JSON（含 draftRevision = 1）。
    重名时抛 409「仪表盘名称已存在。」。
    """
    require_project_write(request)
    # 命名冲突属于最常见的输入错误，先查一次以便尽早返回中文提示。
    ensure_unique_project_name(database, payload.name)
    # id 在本进程先生成：项目与草稿必须共用同一个 id，不能等 flush 之后再取。
    project_id = str(uuid4())
    document = create_blank_project(project_id, payload.name, payload.canvas_width, payload.canvas_height)
    project = Project(id=project_id, name=payload.name, slug=unique_slug(database, payload.name), description=payload.description.strip(), created_by=user.id)
    draft = ProjectDraft(project_id=project_id, schema_version=document['schemaVersion'], revision=1, document_json=serialize_document(strip_document_popups(document)), updated_by=user.id)
    # 项目与草稿同事务写入：只有项目没有草稿的中间态会让编辑器打不开。
    database.add_all([project, draft])
    database.commit()
    database.refresh(project)
    request.app.state.global_log.append('success', '仪表盘编辑器', '配置', f'已创建仪表盘：{project.name}')
    return project_payload(project, draft)


@router.get('/{project_id}')
def get_project(project_id: str, database: DatabaseSession, viewer: LicensedViewer) -> dict:
    """读取单个项目的基本信息与草稿版本号。

    中控设备只能读自己绑定的项目，越权由 require_viewer_project 抛 403
    「该中控设备未绑定此仪表盘。」；项目不存在抛 404「项目不存在。」。
    """
    require_viewer_project(viewer, project_id)
    project = database.get(Project, project_id)
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='项目不存在。')
    return project_payload(project, database.get(ProjectDraft, project_id))


@router.post('/{project_id}/duplicate', status_code=status.HTTP_201_CREATED)
def duplicate_project(project_id: str, payload: ProjectDuplicateRequest, request: Request, database: DatabaseSession, user: LicensedUser) -> dict:
    """复制一个仪表盘（连同它的文档内容）为新项目。

    身份与能力码：LicensedUser + projects.write。
    请求字段：name（新项目名）。
    返回：新项目 JSON，草稿 revision 从 1 重新开始。
    会抛的错误：404「项目或草稿不存在。」、409「仪表盘名称已存在。」、
    422 ASSET_MISSING（源文档引用的图片已被删除）。
    """
    require_project_write(request)
    source = database.get(Project, project_id)
    source_draft = database.get(ProjectDraft, project_id)
    if source is None or source_draft is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='项目或草稿不存在。')
    ensure_unique_project_name(database, payload.name)
    duplicate_id = str(uuid4())
    document = hydrate_document_popups(database, json.loads(source_draft.document_json))
    # 3D 场景不随复制走：户型图与导出的图片属于原项目，复制过去会指向不存在的素材。
    document.pop('studio3d', None)
    # 目标文档若含 3D 内容，同样要过 3D 模块的授权校验。
    require_interaction3d_changes(request, document, database=database)
    validate_document_assets(request, document)
    document['projectId'] = duplicate_id
    document['name'] = payload.name
    # 改名后的副本走一遍完整校验，避免源文档里的历史脏字段被原样带过去。
    document = validate_panel_document(document)
    duplicate = Project(id=duplicate_id, name=payload.name, slug=unique_slug(database, payload.name), description=source.description, created_by=user.id)
    duplicate_draft = ProjectDraft(project_id=duplicate_id, schema_version=document['schemaVersion'], revision=1, document_json=serialize_document(strip_document_popups(document)), updated_by=user.id)
    database.add_all([duplicate, duplicate_draft])
    database.commit()
    database.refresh(duplicate)
    request.app.state.global_log.append('success', '仪表盘编辑器', '配置', f'已复制仪表盘：{source.name} → {duplicate.name}')
    return project_payload(duplicate, duplicate_draft)


@router.delete('/{project_id}', status_code=status.HTTP_204_NO_CONTENT)
def delete_project(project_id: str, payload: ProjectDeleteRequest, request: Request, background_tasks: BackgroundTasks, database: DatabaseSession, user: LicensedUser) -> None:
    """删除仪表盘及其草稿，返回 204。

    身份与能力码：LicensedUser + projects.write，且必须 role == admin，
    否则 403「仅管理员可以删除项目。」。
    请求字段：confirmation —— 必须与项目名逐字相同，否则 422
    「确认文字与项目名称不一致。」；项目不存在抛 404「项目不存在。」。
    """
    require_project_write(request)
    # 删除不可逆，在能力码之上再加一道管理员角色门禁。
    if user.role != 'admin':
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='仅管理员可以删除项目。')
    project = database.get(Project, project_id)
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='项目不存在。')
    # 要求逐字回填项目名：前端误点或脚本误调都不会把仪表盘删掉。
    if payload.confirmation != project.name:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail='确认文字与项目名称不一致。')
    project_name = project.name
    database.delete(project)
    database.commit()
    request.app.state.global_log.append('warning', '仪表盘编辑器', '配置', f'已删除仪表盘：{project_name}')
    # 删了项目后实体绑定变了：放到后台任务里重算持久实体集合，不拖慢响应。
    background_tasks.add_task(request.app.state.ha_connector.refresh_persistent_entity_ids, ensure_states=False)


@router.get('/{project_id}/draft')
def get_project_draft(project_id: str, request: Request, database: DatabaseSession, viewer: LicensedViewer) -> dict:
    """读取项目草稿：文档本体 + schemaVersion / revision / 全局弹窗版本。

    中控设备只能读自己绑定的项目，越权 403「该中控设备未绑定此仪表盘。」；
    草稿不存在抛 404「项目草稿不存在。」。
    """
    require_viewer_project(viewer, project_id)
    draft = database.get(ProjectDraft, project_id)
    if draft is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='项目草稿不存在。')
    # 中控设备视角只水合文档真正引用到的组合弹窗，避免把整个弹窗库下发到墙面屏。
    document = hydrate_document_popups(database, json.loads(draft.document_json), referenced_only=viewer.project_id is not None)
    return {
        'projectId': project_id,
        'schemaVersion': draft.schema_version,
        'revision': draft.revision,
        'globalPopupRevision': global_popup_state(database).revision,
        'document': document,
        'updatedAt': draft.updated_at,
    }


@router.get('/{project_id}/revision')
def get_project_revision(project_id: str, database: DatabaseSession, viewer: LicensedViewer) -> dict:
    """只返回草稿修订号，供展示端轮询判断是否需要整份重新拉取。

    比 get_project_draft 少读一次完整文档，是展示页高频轮询专用的轻量接口。
    返回 projectId / revision / globalPopupRevision / updatedAt。
    """
    require_viewer_project(viewer, project_id)
    draft = database.get(ProjectDraft, project_id)
    if draft is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='项目草稿不存在。')
    return {
        'projectId': project_id,
        'revision': draft.revision,
        'globalPopupRevision': global_popup_state(database).revision,
        'updatedAt': draft.updated_at,
    }


@router.put('/{project_id}/draft')
def update_project_draft(project_id: str, payload: ProjectDraftUpdate, request: Request, background_tasks: BackgroundTasks, database: DatabaseSession, user: LicensedUser) -> dict:
    """保存仪表盘草稿（编辑器最核心的写接口）。

    身份与能力码：LicensedUser + projects.write。
    请求关键字段：document（整份文档）、revision（客户端读到的版本）、
    globalPopupsDirty（本次是否改动了全局组合弹窗）、globalPopupRevision。
    返回：保存后的文档（含新 revision）与投影给前端的字段。
    会抛的中文错误：
    - 404「项目草稿不存在。」；
    - 409 PROJECT_REVISION_CONFLICT「草稿已被其他页面更新。」；
    - 409 GLOBAL_POPUP_REVISION_CONFLICT「全局组合弹窗已在其他仪表盘中更新，请刷新后重试。」；
    - 409「其他仪表盘正在更新，组合弹窗尚未删除，请重试。」；
    - 422（校验层原始中文文案，如 ASSET_MISSING、名称重复）。
    """
    require_project_write(request)
    draft = database.get(ProjectDraft, project_id)
    if draft is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='项目草稿不存在。')
    # 乐观并发控制的第一道闸：提交的 revision 必须是客户端读取时的值。
    if draft.revision != payload.revision:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail={
            'code': 'PROJECT_REVISION_CONFLICT',
            'message': '草稿已被其他页面更新。',
            'currentRevision': draft.revision})
    popup_state = global_popup_state(database)
    document_value = dict(payload.document)
    stored_global_popups = global_popups(database)
    # 前端没动全局弹窗时，用库里的最新值覆盖回去，防止旧页面把别人的改动顶掉。
    if not payload.global_popups_dirty:
        document_value['customPopups'] = stored_global_popups
    submitted_popup_ids = {
        popup.get('id')
        for popup in (document_value.get('customPopups') or [])
        if isinstance(popup, dict) and isinstance(popup.get('id'), str)
    }
    # 本次被删掉的全局弹窗：要给其它引用它们的草稿做级联清理。
    removed_popup_ids = (
        submitted_popup_ids - {
            popup.get('id')
            for popup in stored_global_popups
            if isinstance(popup, dict) and isinstance(popup.get('id'), str)
        }
        if payload.global_popups_dirty
        else set()
    )
    # 先摘掉本份文档里指向已删弹窗的引用，再交校验层，避免校验时判为悬空引用。
    clear_popup_references(document_value, removed_popup_ids)
    # studio3d 内容由 3D 模块单独存盘，不进仪表盘文档。
    document_value.pop('studio3d', None)
    # 校验失败按 422 返回校验层写好的中文文案，前端直接展示。
    try:
        document = validate_panel_document(document_value)
    except ValueError as error:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(error)) from error
    require_interaction3d_changes(request, document, hydrate_document_popups(database, json.loads(draft.document_json)), database=database)
    user_asset_ids = validate_document_assets(request, document)
    # 防止把 A 项目的文档保存到 B 项目：文档里的 projectId 必须与路径一致。
    if document['projectId'] != project_id:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail='文档 projectId 与项目不匹配。')
    # 文档里的 name 就是项目名：改名同样要过唯一性校验，并排除自己。
    ensure_unique_project_name(database, document['name'], exclude_project_id=project_id)
    submitted_popups = document.get('customPopups') or []
    global_popups_changed = payload.global_popups_dirty and serialize_document(submitted_popups) != serialize_document(stored_global_popups)
    expected_global_popup_revision = payload.global_popup_revision or popup_state.revision
    # 乐观锁的第二道闸在全局弹窗上：别人先改过就让本次保存失败，避免覆盖。
    if global_popups_changed and expected_global_popup_revision != popup_state.revision:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail={
            'code': 'GLOBAL_POPUP_REVISION_CONFLICT',
            'message': '全局组合弹窗已在其他仪表盘中更新，请刷新后重试。',
            'currentRevision': popup_state.revision})
    serialized_document = serialize_document(strip_document_popups(document))
    # 文档引用了用户图片时，整段「校验 + 落库」与删除图片的上传接口互斥；
    # 否则删除请求可能在校验通过之后、提交之前把图片删掉，留下悬空引用。
    asset_guard = request.app.state.asset_catalog.mutation_lock if user_asset_ids else nullcontext()
    with asset_guard:
        # 拿到锁后再校验一次：加锁之前的校验结果可能已经过期。
        if user_asset_ids:
            validate_document_assets(request, document)
        if global_popups_changed:
            popup_result = database.execute(
                update(GlobalCustomPopupState)
                .where(GlobalCustomPopupState.id == 1, GlobalCustomPopupState.revision == expected_global_popup_revision)
                .values(popups_json=serialize_document(submitted_popups), revision=GlobalCustomPopupState.revision + 1, updated_by=user.id)
                .execution_options(synchronize_session=False)
            )
            if popup_result.rowcount != 1:
                database.rollback()
                current_popup_revision = database.scalar(select(GlobalCustomPopupState.revision).where(GlobalCustomPopupState.id == 1))
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail={
                    'code': 'GLOBAL_POPUP_REVISION_CONFLICT',
                    'message': '全局组合弹窗已在其他仪表盘中更新，请刷新后重试。',
                    'currentRevision': current_popup_revision})
            # 级联更新其它草稿：同样用行级 revision 做条件更新，失败就整笔回滚。
            if removed_popup_ids:
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
                        .values(document_json=serialize_document(referenced_document), revision=ProjectDraft.revision + 1, updated_by=user.id)
                        .execution_options(synchronize_session=False)
                    )
                    # 别的仪表盘正好在保存：回滚本次请求，让用户重试，而不是留下半清理状态。
                    if referenced_result.rowcount != 1:
                        database.rollback()
                        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail={
                            'code': 'PROJECT_REVISION_CONFLICT',
                            'message': '其他仪表盘正在更新，组合弹窗尚未删除，请重试。'})
        # 条件更新（revision 相等）而不是先读后写：并发下由数据库保证只有一个请求能生效。
        result = database.execute(
            update(ProjectDraft)
            .where(ProjectDraft.project_id == project_id, ProjectDraft.revision == payload.revision)
            .values(document_json=serialized_document, schema_version=document['schemaVersion'], revision=ProjectDraft.revision + 1, updated_by=user.id)
            .execution_options(synchronize_session=False)
        )
        # rowcount != 1 说明 revision 已被别人推进：回滚并回带当前版本，前端据此提示刷新。
        if result.rowcount != 1:
            database.rollback()
            current_revision = database.scalar(select(ProjectDraft.revision).where(ProjectDraft.project_id == project_id))
            if current_revision is None:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='项目草稿不存在。')
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail={
                'code': 'PROJECT_REVISION_CONFLICT',
                'message': '草稿已被其他页面更新。',
                'currentRevision': current_revision})
        # 文档名即项目名：草稿保存成功后同步到项目表，列表页才会显示新名字。
        database.execute(update(Project).where(Project.id == project_id).values(name=document['name']))
        database.commit()
    # 文档里新绑定的实体也要进持久集合：同样丢到后台，不在请求里同步刷新。
    background_tasks.add_task(request.app.state.ha_connector.refresh_persistent_entity_ids, ensure_states=False)
    # 清掉会话缓存，下面重新查一次草稿才能读到刚提交的新 revision。
    database.expire_all()
    draft = database.get(ProjectDraft, project_id)
    request.app.state.global_log.append('success', '仪表盘编辑器', '配置', f"仪表盘已保存：{document['name']}（修订 {draft.revision}）")
    # 回给编辑器的文档带完整弹窗：编辑器要能编辑所有组合弹窗，而不只是被引用到的那些。
    hydrated_document = hydrate_document_popups(database, json.loads(draft.document_json))
    result = {
        'projectId': project_id,
        'schemaVersion': draft.schema_version,
        'revision': draft.revision,
        'globalPopupRevision': global_popup_state(database).revision,
        'document': hydrated_document,
        'updatedAt': draft.updated_at,
    }
    # 本接口持有连接的时间最长，这里手动关掉，尽早归还连接池。
    database.close()
    return result
