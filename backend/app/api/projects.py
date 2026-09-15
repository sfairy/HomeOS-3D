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
    if not request.app.state.license_service.allows('projects.write'):
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


def serialize_document(document: dict) -> str:
    return json.dumps(document, ensure_ascii=False, sort_keys=True, separators=(',', ':'))


def project_payload(project: Project, draft: ProjectDraft | None = None) -> dict:
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


@router.get('')
def list_projects(database: DatabaseSession, viewer: LicensedViewer) -> dict:
    query = select(Project).order_by(Project.updated_at.desc())
    if viewer.project_id is not None:
        query = query.where(Project.id == viewer.project_id)
    projects = list(database.scalars(query))
    drafts = {
        item.project_id: item
        for item in database.scalars(select(ProjectDraft).where(ProjectDraft.project_id.in_([project.id for project in projects])))
    } if projects else {}
    return {'items': [project_payload(project, drafts.get(project.id)) for project in projects]}


@router.post('', status_code=status.HTTP_201_CREATED)
def create_project(payload: ProjectCreateRequest, request: Request, database: DatabaseSession, user: LicensedUser) -> dict:
    require_project_write(request)
    ensure_unique_project_name(database, payload.name)
    project_id = str(uuid4())
    document = create_blank_project(project_id, payload.name, payload.canvas_width, payload.canvas_height)
    project = Project(id=project_id, name=payload.name, slug=unique_slug(database, payload.name), description=payload.description.strip(), created_by=user.id)
    draft = ProjectDraft(project_id=project_id, schema_version=document['schemaVersion'], revision=1, document_json=serialize_document(strip_document_popups(document)), updated_by=user.id)
    database.add_all([project, draft])
    database.commit()
    database.refresh(project)
    request.app.state.global_log.append('success', '仪表盘编辑器', '配置', f'已创建仪表盘：{project.name}')
    return project_payload(project, draft)


@router.get('/{project_id}')
def get_project(project_id: str, database: DatabaseSession, viewer: LicensedViewer) -> dict:
    require_viewer_project(viewer, project_id)
    project = database.get(Project, project_id)
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='项目不存在。')
    return project_payload(project, database.get(ProjectDraft, project_id))


@router.post('/{project_id}/duplicate', status_code=status.HTTP_201_CREATED)
def duplicate_project(project_id: str, payload: ProjectDuplicateRequest, request: Request, database: DatabaseSession, user: LicensedUser) -> dict:
    require_project_write(request)
    source = database.get(Project, project_id)
    source_draft = database.get(ProjectDraft, project_id)
    if source is None or source_draft is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='项目或草稿不存在。')
    ensure_unique_project_name(database, payload.name)
    duplicate_id = str(uuid4())
    document = hydrate_document_popups(database, json.loads(source_draft.document_json))
    document.pop('studio3d', None)
    require_interaction3d_changes(request, document, database=database)
    validate_document_assets(request, document)
    document['projectId'] = duplicate_id
    document['name'] = payload.name
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
    require_project_write(request)
    if user.role != 'admin':
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='仅管理员可以删除项目。')
    project = database.get(Project, project_id)
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='项目不存在。')
    if payload.confirmation != project.name:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail='确认文字与项目名称不一致。')
    project_name = project.name
    database.delete(project)
    database.commit()
    request.app.state.global_log.append('warning', '仪表盘编辑器', '配置', f'已删除仪表盘：{project_name}')
    background_tasks.add_task(request.app.state.ha_connector.refresh_persistent_entity_ids, ensure_states=False)


@router.get('/{project_id}/draft')
def get_project_draft(project_id: str, request: Request, database: DatabaseSession, viewer: LicensedViewer) -> dict:
    require_viewer_project(viewer, project_id)
    draft = database.get(ProjectDraft, project_id)
    if draft is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='项目草稿不存在。')
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
    """Return the lightweight dashboard revision used by display clients."""
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
    require_project_write(request)
    draft = database.get(ProjectDraft, project_id)
    if draft is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='项目草稿不存在。')
    if draft.revision != payload.revision:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail={
            'code': 'PROJECT_REVISION_CONFLICT',
            'message': '草稿已被其他页面更新。',
            'currentRevision': draft.revision})
    popup_state = global_popup_state(database)
    document_value = dict(payload.document)
    stored_global_popups = global_popups(database)
    if not payload.global_popups_dirty:
        document_value['customPopups'] = stored_global_popups
    submitted_popup_ids = {
        popup.get('id')
        for popup in (document_value.get('customPopups') or [])
        if isinstance(popup, dict) and isinstance(popup.get('id'), str)
    }
    removed_popup_ids = (
        submitted_popup_ids - {
            popup.get('id')
            for popup in stored_global_popups
            if isinstance(popup, dict) and isinstance(popup.get('id'), str)
        }
        if payload.global_popups_dirty
        else set()
    )
    clear_popup_references(document_value, removed_popup_ids)
    document_value.pop('studio3d', None)
    try:
        document = validate_panel_document(document_value)
    except ValueError as error:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(error)) from error
    require_interaction3d_changes(request, document, hydrate_document_popups(database, json.loads(draft.document_json)), database=database)
    user_asset_ids = validate_document_assets(request, document)
    if document['projectId'] != project_id:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail='文档 projectId 与项目不匹配。')
    ensure_unique_project_name(database, document['name'], exclude_project_id=project_id)
    submitted_popups = document.get('customPopups') or []
    global_popups_changed = payload.global_popups_dirty and serialize_document(submitted_popups) != serialize_document(stored_global_popups)
    expected_global_popup_revision = payload.global_popup_revision or popup_state.revision
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
                    if referenced_result.rowcount != 1:
                        database.rollback()
                        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail={
                            'code': 'PROJECT_REVISION_CONFLICT',
                            'message': '其他仪表盘正在更新，组合弹窗尚未删除，请重试。'})
        result = database.execute(
            update(ProjectDraft)
            .where(ProjectDraft.project_id == project_id, ProjectDraft.revision == payload.revision)
            .values(document_json=serialized_document, schema_version=document['schemaVersion'], revision=ProjectDraft.revision + 1, updated_by=user.id)
            .execution_options(synchronize_session=False)
        )
        if result.rowcount != 1:
            database.rollback()
            current_revision = database.scalar(select(ProjectDraft.revision).where(ProjectDraft.project_id == project_id))
            if current_revision is None:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='项目草稿不存在。')
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail={
                'code': 'PROJECT_REVISION_CONFLICT',
                'message': '草稿已被其他页面更新。',
                'currentRevision': current_revision})
        database.execute(update(Project).where(Project.id == project_id).values(name=document['name']))
        database.commit()
    background_tasks.add_task(request.app.state.ha_connector.refresh_persistent_entity_ids, ensure_states=False)
    database.expire_all()
    draft = database.get(ProjectDraft, project_id)
    request.app.state.global_log.append('success', '仪表盘编辑器', '配置', f"仪表盘已保存：{document['name']}（修订 {draft.revision}）")
    hydrated_document = hydrate_document_popups(database, json.loads(draft.document_json))
    result = {
        'projectId': project_id,
        'schemaVersion': draft.schema_version,
        'revision': draft.revision,
        'globalPopupRevision': global_popup_state(database).revision,
        'document': hydrated_document,
        'updatedAt': draft.updated_at,
    }
    database.close()
    return result
