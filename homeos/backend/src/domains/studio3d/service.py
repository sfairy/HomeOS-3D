"""Studio 3D 草稿读写业务：乐观并发 + 删除级联清理确认。

一次 PUT 的完整语义（顺序即约束）：

1. 序列化并卡 64MB —— 在开事务前做，避免大对象持有写锁；
2. ``BEGIN IMMEDIATE`` —— 先把写锁拿到手，再读当前 revision。旧实现先读文件、
   再扫全表跑 ``plan_cleanup``、最后写文件，两个并发保存会双双通过 revision 比对，
   后写的那个静默覆盖前一个；
3. 比对 revision，不等就 409，并把 ``currentRevision`` 带回去让前端弹冲突框；
4. 只在「模型身份集合」变化时才跑级联清理（挪家具、调灯光也会触发保存，是常态）；
5. 影响面非空时要求客户端回传一次性 ``confirmation_token``，否则 428；
6. CAS 写草稿 → 逐份项目草稿更新 → 写回归档 → 提交。

失败的每一条分支都显式 ``rollback``：SQLite 的写锁不释放，后续请求会全部撞
``database is locked``，表现成「保存一次失败后整个工作台再也存不上」。
"""

from __future__ import annotations

import json
from contextlib import nullcontext
from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from . import cleanup as cleanup_service
from . import draft_repository
from .doors import validate_door_openings
from .windows import validate_window_designs
from ...panel.asset_refs import validate_assets
from ...platform.core.db.models import Project, ProjectDraft
from ...schemas import Studio3DDraftUpdate


def get_draft(database: Session) -> dict:
    """读当前草稿。只读：不建行、不提交。"""
    snapshot = draft_repository.read_snapshot(database)
    if snapshot is None:
        return {"revision": 0, "scene": None, "updatedAt": None}
    return {"revision": snapshot.revision, "scene": snapshot.scene, "updatedAt": snapshot.updated_at}


def save_draft(database: Session, settings, user, payload: Studio3DDraftUpdate, catalog=None) -> dict:
    # 户型图里的图片引用（``user:`` / ``studio3d:``）必须先校验存在：草稿一旦写进去，
    # 后续删除 / 覆盖图片时它就会成为「删除不掉的引用」，而用户其实只是选了一张已删的图。
    #
    # 窗型设计同理：分格树 / 窗扇 id / 洞口尺寸都要在写入前校验，否则前端绘制器会在
    # 渲染阶段抛异常，表现为整层楼消失。它只读 payload，先于素材校验跑。
    #
    # 校验与写入必须共用素材目录的 mutation lock：否则「校验通过」与「提交草稿」之间
    # 可以插进一次删除，草稿里就留下指向不存在图片的 assetId。
    lock = catalog.mutation_lock if catalog is not None else nullcontext()
    with lock:
        validate_window_designs(payload.scene)
        validate_door_openings(payload.scene)
        if catalog is not None:
            validate_assets(catalog, payload.scene)
        scene_json = draft_repository.encode_scene(payload.scene)
        database.commit()
        database.execute(text("BEGIN IMMEDIATE"))
        try:
            return _save_draft_locked(database, settings, user, payload, scene_json, catalog)
        except Exception:
            database.rollback()
            raise


def _save_draft_locked(
    database: Session,
    settings,
    user,
    payload: Studio3DDraftUpdate,
    scene_json: str,
    catalog=None,
) -> dict:
    snapshot = draft_repository.read_snapshot(database)
    current_revision = snapshot.revision if snapshot is not None else 0
    if payload.revision != current_revision:
        raise _conflict(current_revision)
    previous_scene = snapshot.scene if snapshot is not None else {}
    schema_version = _schema_version(payload.scene, snapshot)
    documents, changed, archive, impacts = _plan_interaction_cleanup(
        database, settings, previous_scene, payload.scene, catalog
    )
    if impacts:
        token = cleanup_service.confirmation_token(current_revision, payload.scene, documents, impacts)
        if payload.interactionConfirmation != token:
            raise _confirmation_required(database, token, impacts)
    timestamp = datetime.now(UTC)
    next_revision = current_revision + 1
    written = _write_snapshot(
        database,
        snapshot,
        revision=next_revision,
        schema_version=schema_version,
        scene_json=scene_json,
        updated_at=timestamp.strftime("%Y-%m-%d %H:%M:%S.%f"),
        updated_by=getattr(user, "id", None),
    )
    if not written:
        latest = draft_repository.read_snapshot(database)
        raise _conflict(latest.revision if latest is not None else 0)
    _apply_cleanup(database, changed, archive, getattr(user, "id", None))
    database.commit()
    return {"revision": next_revision, "scene": payload.scene, "updatedAt": timestamp.isoformat()}


def _conflict(current_revision: int) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail={
            "code": "STUDIO3D_REVISION_CONFLICT",
            "message": "户型图草稿已在其他页面更新。",
            "currentRevision": current_revision,
        },
    )


def _confirmation_required(database: Session, token: str, impacts: list) -> HTTPException:
    names = {project.id: project.name for project in database.scalars(select(Project)).all()}
    return HTTPException(
        428,
        {
            "code": "STUDIO3D_INTERACTION_CONFIRMATION",
            "token": token,
            "message": "删除将同步移除关联的 3D 交互配置。",
            "impacts": impacts,
            "projects": [names.get(key, key) for key in dict.fromkeys(impact["projectId"] for impact in impacts)],
        },
    )


def _write_snapshot(database: Session, snapshot, **values) -> bool:
    if snapshot is None:
        return draft_repository.insert_initial(database, **values)
    return draft_repository.update_with_cas(database, expected_revision=snapshot.revision, **values)


def _apply_cleanup(database: Session, changed: dict, archive: list | None, updated_by) -> None:
    if changed:
        drafts = database.scalars(select(ProjectDraft).where(ProjectDraft.project_id.in_(list(changed)))).all()
        for draft in drafts:
            draft.document_json = json.dumps(changed[draft.project_id], ensure_ascii=False)
            draft.revision += 1
            # updated_by 是非空列：没有登录用户时（内部投递/测试）保留原值，
            # 不能把 NOT NULL 列写成 NULL。
            if updated_by is not None:
                draft.updated_by = updated_by
    if archive is not None:
        draft_repository.write_archive(database, archive)


def _schema_version(scene: dict, snapshot) -> int:
    value = scene.get("schemaVersion")
    if isinstance(value, int) and not isinstance(value, bool):
        return value
    if snapshot is not None:
        return snapshot.schema_version
    return draft_repository.DEFAULT_SCHEMA_VERSION


def _plan_interaction_cleanup(
    database: Session,
    settings,
    previous_scene: dict,
    scene: dict,
    catalog=None,
):
    """只有「绑定身份集合」变了才值得扫全表；返回 (documents, changed, archive, impacts)。

    ``asset_exists`` 交给清理逻辑：撤消删除时要把此前摘掉的条目放回去，但被引用
    的屏幕图片可能已经被删了 —— 那种情况下只恢复条目、丢掉失效的 ``screenImage``，
    而不是把一条点了就 404 的配置放回用户面板。
    """
    if cleanup_service.identities(previous_scene) == cleanup_service.identities(scene):
        return {}, {}, None, []
    archive = draft_repository.read_archive(database)
    documents = {}
    for draft in database.scalars(select(ProjectDraft)).all():
        document = _decode_document(draft.document_json)
        if document is not None:
            documents[draft.project_id] = document
    asset_exists = catalog.asset_exists if catalog is not None else None
    changed, saved, impacts = cleanup_service.plan_cleanup(
        documents, previous_scene, scene, archive, settings, asset_exists=asset_exists
    )
    return documents, changed, saved, impacts


def _decode_document(raw) -> dict | None:
    try:
        value = json.loads(raw) if raw else {}
    # `# fmt: skip`：括号不能省，否则 ruff format（target py314）会按 PEP 758
    # 改写成无括号形式，而 Cython 3.3.0 会把后者按 `except TypeError as ValueError:`
    # 误解析 —— 只捕获 TypeError 且把异常绑到名为 ValueError 的局部变量（编译通过、
    # 语义悄悄变了）。守卫见 gate:infra 的 check:cython。
    except (TypeError, ValueError):  # fmt: skip
        return None
    return value if isinstance(value, dict) else None
