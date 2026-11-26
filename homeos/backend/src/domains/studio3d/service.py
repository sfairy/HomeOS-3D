"""Studio 3D 草稿读写业务：乐观并发 + 删除级联清理确认。

一次 PUT 的完整语义（顺序即约束）：

1. 序列化并卡 64MB —— 在开事务前做，避免大对象持有写锁；
2. **读侧计划全在写锁之外**：读快照、扫全表草稿、跑 ``plan_cleanup`` 都是几百毫秒级的
   读 + JSON 解析。SQLite 的 ``BEGIN IMMEDIATE`` 是库级写锁，把这些夹在里面会让所有
   并发写（事件日志、通知、任何 ``commit``）排队甚至 ``database is locked``；
3. ``BEGIN IMMEDIATE`` 之后**重新**读一次 revision 并比对：不等就 409，并把
   ``currentRevision`` 带回去让前端弹冲突框。并发保存靠这一步 + CAS 写入收敛，
   后写的那个不会静默覆盖前一个；
4. 只在「模型身份集合」变化时才跑级联清理（挪家具、调灯光也会触发保存，是常态）；
5. 影响面非空时要求客户端回传一次性 ``confirmation_token``，否则 428；
6. CAS 写草稿 → 逐份项目草稿更新（并校验计划期间的草稿 revision）→ 写回归档 → 提交。

失败的每一条分支都显式 ``rollback``：SQLite 的写锁不释放，后续请求会全部撞
``database is locked``，表现成「保存一次失败后整个工作台再也存不上」。
"""

from __future__ import annotations

import json
from contextlib import nullcontext
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from . import cleanup as cleanup_service
from . import draft_repository
from .doors import validate_door_openings
from .floor_regions import retain_omitted_floor_finishes, validate_floor_regions
from .lighting import (
    valid_base_lighting_by_theme,
    valid_light_range_archive,
    valid_light_region_overrides,
)
from .projects.schema import Project, ProjectDraft
from .schemas import Studio3DDraftUpdate
from .windows import validate_window_designs
from ...panel.asset_refs import validate_assets
from ...platform.core.http.errors import BusinessException, ErrorCode, api_error

#: 保存成功后回给客户端 / 写进日志的持久化状态（一档，见 ``_save_draft_locked``）。
DRAFT_PERSISTED_STATE = "草稿已保存"


def get_draft(database: Session) -> dict:
    """读当前草稿。只读：不建行、不提交。"""
    snapshot = draft_repository.read_snapshot(database)
    if snapshot is None:
        return {"revision": 0, "scene": None, "updatedAt": None}
    return {"revision": snapshot.revision, "scene": snapshot.scene, "updatedAt": snapshot.updated_at}


def merge_light_ranges(scene: dict, payload) -> dict:
    """把一次「只改柔光范围」的局部更新合进当前场景，返回新场景（不改入参）。

    语义与前端 ``studio-light-ranges.ts`` 一致：
    - ``changes is None`` → 删除该场景条目（清空）；
    - ``changes == {}`` → 同样视为清空（等价于「没有自定义」）；
    - ``archive`` 非空时追加到 ``lightRangeArchive[sceneId]`` 尾部。

    不在这里做区间校验：合并后的场景会走 ``save_draft`` 的完整校验，
    免得「局部更新」与「整份保存」出现两套判定。
    """
    merged = dict(scene) if isinstance(scene, dict) else {}
    overrides = dict(merged.get("lightRegionOverrides") or {})
    if payload.changes:
        overrides[payload.sceneId] = payload.changes
    else:
        overrides.pop(payload.sceneId, None)
    if overrides:
        merged["lightRegionOverrides"] = overrides
    else:
        merged.pop("lightRegionOverrides", None)
    if payload.archive:
        archive = dict(merged.get("lightRangeArchive") or {})
        entries = list(archive.get(payload.sceneId) or [])
        entries.extend(payload.archive)
        archive[payload.sceneId] = entries
        merged["lightRangeArchive"] = archive
    return merged


def validate_base_lighting_by_theme(scene: Any) -> None:
    """草稿里的分主题基础光照必须合法（0.8.7 起每个风格各自保存一份）。"""
    if not isinstance(scene, dict) or "baseLightingByTheme" not in scene:
        return
    if not valid_base_lighting_by_theme(scene["baseLightingByTheme"]):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="户型图的主题光照设置无效。",
        )


def validate_light_ranges(scene: Any) -> None:
    """草稿里的柔光范围与撤销记录必须合法（0.8.9 起绘制页与 3D 控件共用）。

    这里保留 ``HTTPException`` 之外的结构，是因为这两张表**不是**互斥的用户输入：
    撤销记录里允许出现「已经不再生效的旧范围」，所以校验只做形状与区间，不做引用检查。
    """
    if not isinstance(scene, dict):
        return
    if "lightRegionOverrides" in scene and not valid_light_region_overrides(scene["lightRegionOverrides"]):
        raise BusinessException(
            ErrorCode.VALIDATION_FAILED,
            api_error("STUDIO3D_LIGHT_RANGE_INVALID", "范围字段或区间不合法。"),
            422,
        )
    if "lightRangeArchive" in scene and not valid_light_range_archive(scene["lightRangeArchive"]):
        raise BusinessException(
            ErrorCode.VALIDATION_FAILED,
            api_error("STUDIO3D_LIGHT_RANGE_INVALID", "撤销记录格式不合法。"),
            422,
        )


def save_draft(database: Session, settings, user, payload: Studio3DDraftUpdate, catalog=None) -> dict:
    # 户型图里的图片引用（``user:`` / ``studio3d:``）必须先校验存在：草稿一旦写进去，
    # 后续删除 / 覆盖图片时它就会成为「删除不掉的引用」，而用户其实只是选了一张已删的图。
    #
    # 窗型设计同理：分格树 / 窗扇 id / 洞口尺寸都要在写入前校验，否则前端绘制器会在
    # 渲染阶段抛异常，表现为整层楼消失。它只读 payload，先于素材校验跑。
    #
    # 校验与写入必须共用素材目录的 mutation lock：否则「校验通过」与「提交草稿」之间
    # 可以插进一次删除，草稿里就留下指向不存在图片的 assetId。
    # 先拿素材 mutation lock，再清会话：绝不能在 lock 外用 commit()「冲掉」隐式事务，
    # 那会把请求里无关的脏对象一并持久化（并发保存会丢别人的稿）。
    lock = catalog.mutation_lock if catalog is not None else nullcontext()
    with lock:
        validate_base_lighting_by_theme(payload.scene)
        validate_light_ranges(payload.scene)
        validate_window_designs(payload.scene)
        validate_door_openings(payload.scene)
        validate_floor_regions(payload.scene)
        if catalog is not None:
            validate_assets(catalog, payload.scene)
        # 读侧计划（快照 / 全表草稿扫描 / 影响面计算）先做完，再开写事务。
        # 注意：计划阶段会把「旧写入方省略的地面分区 / 色档」按上一版补回，
        # 因此**必须用 plan.scene 落盘**，不能用 payload.scene。
        try:
            plan = _plan_draft_save(database, settings, user, payload, catalog)
        except Exception:
            database.rollback()
            raise
        scene_json = draft_repository.encode_scene(plan.scene)
        # rollback 结束隐式事务且丢弃无关脏写；commit 会误落盘。
        database.rollback()
        database.execute(text("BEGIN IMMEDIATE"))
        try:
            return _save_draft_locked(database, user, plan, scene_json)
        except Exception:
            database.rollback()
            raise


@dataclass(frozen=True)
class _DraftPlan:
    """写锁之外算好的保存计划（不持有 ORM 对象，避免会话回滚后失效）。"""

    expected_revision: int
    schema_version: int
    changed: dict[str, dict]
    archive: list | None
    #: 计划期间读到的 ``ProjectDraft.revision``，仅含本次会被改写的项目。
    draft_revisions: dict[str, int]
    #: 实际要落盘的场景：已按上一版补回「新写入方省略的地面分区 / 色档」。
    scene: dict


def _plan_draft_save(
    database: Session,
    settings,
    user,
    payload: Studio3DDraftUpdate,
    catalog=None,
) -> _DraftPlan:
    """在写锁之外完成全部读操作与校验（revision 比对留到写事务里再做一次）。"""
    snapshot = draft_repository.read_snapshot(database)
    current_revision = snapshot.revision if snapshot is not None else 0
    if payload.revision != current_revision:
        raise _conflict(current_revision)
    previous_scene = snapshot.scene if snapshot is not None else {}
    # 0.8.9：老写入方省略 `floorRegions` / `floorFinishTones` 时按上一版补回；
    # 显式空值仍然表示「用户清空了」。必须在计算身份集合之前合并 ——
    # 分区不影响 3D 交互身份，但同一份 scene 要贯穿校验 / 清理 / 落盘三处。
    merged_scene = retain_omitted_floor_finishes(previous_scene, payload.scene)
    schema_version = _schema_version(merged_scene, snapshot)
    documents, changed, archive, impacts, draft_revisions = _plan_interaction_cleanup(
        database, settings, previous_scene, merged_scene, catalog
    )
    if impacts:
        token = cleanup_service.confirmation_token(current_revision, merged_scene, documents, impacts)
        if payload.interactionConfirmation != token:
            raise _confirmation_required(database, token, impacts)
    return _DraftPlan(
        expected_revision=current_revision,
        schema_version=schema_version,
        changed=changed,
        archive=archive,
        draft_revisions={key: value for key, value in draft_revisions.items() if key in changed},
        scene=merged_scene,
    )


def _save_draft_locked(
    database: Session,
    user,
    plan: _DraftPlan,
    scene_json: str,
) -> dict:
    """写事务内：重读 revision → 校验项目草稿未被并发改写 → CAS 写 → 提交。"""
    snapshot = draft_repository.read_snapshot(database)
    current_revision = snapshot.revision if snapshot is not None else 0
    if current_revision != plan.expected_revision:
        # 计划到拿锁之间有人保存过：让客户端拿最新 revision 重试。
        raise _conflict(current_revision)
    _assert_draft_revisions_unchanged(database, plan.draft_revisions)
    timestamp = datetime.now(UTC)
    next_revision = current_revision + 1
    written = _write_snapshot(
        database,
        snapshot,
        revision=next_revision,
        schema_version=plan.schema_version,
        scene_json=scene_json,
        updated_at=timestamp.strftime("%Y-%m-%d %H:%M:%S.%f"),
        updated_by=getattr(user, "id", None),
    )
    if not written:
        latest = draft_repository.read_snapshot(database)
        raise _conflict(latest.revision if latest is not None else 0)
    _apply_cleanup(database, plan.changed, plan.archive, getattr(user, "id", None))
    database.commit()
    return {
        "revision": next_revision,
        # 回给客户端的是**实际落盘**的那份（含按上一版补回的分区 / 色档），
        # 否则前端本地状态会和服务端分叉，下次保存再把补回的值当新增提交。
        "scene": plan.scene,
        "updatedAt": timestamp.isoformat(),
        # 0.8.7 的保存响应带「上一修订」与「持久化状态」：全局日志据此显示
        # 「原修订 / 持久化状态」两列（前端 `global-log.ts` 已有这两个标签）。
        # 本项目的草稿是 ``studio_drafts`` 单行，提交即生效，没有上游那种
        # 「DB 已提交、镜像文件待补写」的中间态，所以状态只有一档。
        "previousRevision": current_revision,
        "persistenceState": DRAFT_PERSISTED_STATE,
    }


def _assert_draft_revisions_unchanged(database: Session, expected: dict[str, int]) -> None:
    """计划期间被改写的项目草稿要整体作废，否则级联清理会用旧文档覆盖别人的编辑。"""
    if not expected:
        return
    rows: Any = database.execute(
        select(ProjectDraft.project_id, ProjectDraft.revision).where(ProjectDraft.project_id.in_(list(expected)))
    ).all()
    current = dict(rows)
    if any(current.get(project_id) != revision for project_id, revision in expected.items()):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "STUDIO3D_REVISION_CONFLICT",
                "message": "关联的 3D 交互配置已被其它页面更新，请刷新后重试。",
                "currentRevision": None,
            },
        )


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
        return {}, {}, None, [], {}
    archive = draft_repository.read_archive(database)
    documents = {}
    revisions: dict[str, int] = {}
    for draft in database.scalars(select(ProjectDraft)).all():
        document = _decode_document(draft.document_json)
        if document is not None:
            documents[draft.project_id] = document
            revisions[draft.project_id] = int(draft.revision or 0)
    asset_exists = catalog.asset_exists if catalog is not None else None
    changed, saved, impacts = cleanup_service.plan_cleanup(
        documents, previous_scene, scene, archive, settings, asset_exists=asset_exists
    )
    return documents, changed, saved, impacts, revisions


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
