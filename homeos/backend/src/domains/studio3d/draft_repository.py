"""Studio 3D 草稿仓储：studio_drafts 单行表的 CAS 读写。

并发模型：草稿全局只有一行（``id = 1``），每次保存都必须在**同一事务**里完成
「读当前 revision → 比对 → 条件更新」。这里刻意不用 ORM 实体做读取后写回，
而是把比对压进 SQL 的 ``WHERE revision = :expected``：

- ``update_with_cas`` 只有命中当前 revision 才写，rowcount=0 就说明有人抢先提交；
- ``insert_initial`` 用 ``ON CONFLICT(id) DO NOTHING``，让并发首保只有一方能插入；
- 调用方必须已开 ``BEGIN IMMEDIATE``（见 service.save_draft），否则两个读到的
  快照可能都通过比对，第二个写会覆盖第一个 —— 这正是旧单文件实现里最隐蔽的丢写路径：
  ``_read_draft`` 与写文件之间隔着一次全表扫描与 ``plan_cleanup``，窗口可达数百毫秒。

旧单文件 ``data/studio3d/draft.json`` 仅由迁移（migration 4）一次性导入本表，
运行期不再读取。
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any, cast

from fastapi import HTTPException
from sqlalchemy import CursorResult, text
from sqlalchemy.orm import Session

from ...platform.core.models import StudioInteractionSync
from ...platform.core.upload_limits import MAX_STUDIO3D_DRAFT_BYTES

logger = logging.getLogger(__name__)

STUDIO_DRAFT_ROW_ID = 1
DEFAULT_SCHEMA_VERSION = 8


@dataclass(frozen=True)
class StudioDraftSnapshot:
    """``studio_drafts`` 的一行快照（已解析 scene）。"""

    revision: int
    schema_version: int
    scene: dict
    updated_at: str | None


def encode_scene(scene: dict) -> str:
    """把 scene 序列化为入库文本，并在此处执行 64MB 上限。

    上限放在序列化这一刻而不是依赖数据库触发器：触发器只会抛 IntegrityError，
    路由层拿不到「是体积超了」这个语义，用户看到的会是 500。
    """
    try:
        encoded = json.dumps(scene, ensure_ascii=False, separators=(",", ":"))
    except (TypeError, ValueError) as error:
        raise HTTPException(422, "户型图数据无法序列化。") from error
    if len(encoded.encode("utf-8")) > MAX_STUDIO3D_DRAFT_BYTES:
        raise HTTPException(413, "户型图数据过大，无法保存。")
    return encoded


def _parse_datetime(value) -> datetime | None:
    if isinstance(value, datetime):
        return value if value.tzinfo is not None else value.replace(tzinfo=UTC)
    if not isinstance(value, str) or not value.strip():
        return None
    candidate = value.strip().replace("T", " ")
    for pattern in ("%Y-%m-%d %H:%M:%S.%f", "%Y-%m-%d %H:%M:%S"):
        try:
            return datetime.strptime(candidate, pattern).replace(tzinfo=UTC)
        except ValueError:
            continue
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError:
        return None
    return parsed if parsed.tzinfo is not None else parsed.replace(tzinfo=UTC)


def _isoformat(value) -> str | None:
    parsed = _parse_datetime(value)
    return parsed.isoformat() if parsed is not None else None


def read_snapshot(database: Session) -> StudioDraftSnapshot | None:
    """读单行草稿；无行返回 None（不是 revision 0 —— 0 与「没有草稿」语义不同）。"""
    row = database.execute(
        text(
            "SELECT revision, schema_version, scene_json, updated_at "
            "FROM studio_drafts WHERE id = :row_id"
        ),
        {"row_id": STUDIO_DRAFT_ROW_ID},
    ).mappings().first()
    if row is None:
        return None
    try:
        scene = json.loads(row["scene_json"])
    except (TypeError, ValueError) as error:
        raise HTTPException(500, "户型图草稿已损坏，请从 NAS 备份恢复。") from error
    if not isinstance(scene, dict):
        raise HTTPException(500, "户型图草稿格式无效，请从 NAS 备份恢复。")
    return StudioDraftSnapshot(
        revision=int(row["revision"]),
        schema_version=int(row["schema_version"]),
        scene=scene,
        updated_at=_isoformat(row["updated_at"]),
    )


def insert_initial(
    database: Session,
    *,
    revision: int,
    schema_version: int,
    scene_json: str,
    updated_at: str,
    updated_by: str | None,
) -> bool:
    """插入唯一一行；并发首保只有一方能插入（另一方 rowcount=0）。"""
    result = database.execute(
        text(
            "INSERT INTO studio_drafts "
            "(id, revision, schema_version, scene_json, updated_at, updated_by) "
            "VALUES (:row_id, :revision, :schema_version, :scene_json, :updated_at, :updated_by) "
            "ON CONFLICT(id) DO NOTHING"
        ),
        {
            "row_id": STUDIO_DRAFT_ROW_ID,
            "revision": revision,
            "schema_version": schema_version,
            "scene_json": scene_json,
            "updated_at": updated_at,
            "updated_by": updated_by,
        },
    )
    # DML 一定返回 CursorResult，而 Session.execute 的标注是宽泛的 Result（没有 rowcount）。
    return cast('CursorResult[Any]', result).rowcount == 1


def update_with_cas(
    database: Session,
    *,
    expected_revision: int,
    revision: int,
    schema_version: int,
    scene_json: str,
    updated_at: str,
    updated_by: str | None,
) -> bool:
    """条件更新：只有当前 revision 仍是 expected 才写。rowcount=0 = 有人抢先提交。"""
    result = database.execute(
        text(
            "UPDATE studio_drafts SET revision = :revision, schema_version = :schema_version, "
            "scene_json = :scene_json, updated_at = :updated_at, updated_by = :updated_by "
            "WHERE id = :row_id AND revision = :expected_revision"
        ),
        {
            "row_id": STUDIO_DRAFT_ROW_ID,
            "revision": revision,
            "schema_version": schema_version,
            "scene_json": scene_json,
            "updated_at": updated_at,
            "updated_by": updated_by,
            "expected_revision": expected_revision,
        },
    )
    # 同 insert_initial：DML 的结果是 CursorResult，Session.execute 的标注里没有 rowcount。
    return cast('CursorResult[Any]', result).rowcount == 1


def read_sync_document(database: Session) -> dict:
    """读 Studio↔interaction3d 同步文档（仅 ``archive``）。"""
    state = database.get(StudioInteractionSync, 1)
    if state is None:
        return {}
    try:
        value = json.loads(state.document_json)
    except (TypeError, ValueError):
        logger.warning("studio_interaction_sync.document_json 无法解析，按空文档处理")
        return {}
    return value if isinstance(value, dict) else {}


def read_archive(database: Session) -> list:
    """读级联删除归档（用于「删掉又加回来」的自动恢复）。"""
    archive = read_sync_document(database).get("archive")
    return archive if isinstance(archive, list) else []


def write_archive(database: Session, archive: list) -> None:
    """写回归档。"""
    state = database.get(StudioInteractionSync, 1)
    if state is None:
        state = StudioInteractionSync(id=1)
        database.add(state)
    state.document_json = json.dumps({"archive": archive}, ensure_ascii=False)
    if len(state.document_json.encode("utf-8")) > MAX_STUDIO3D_DRAFT_BYTES:
        raise HTTPException(413, "户型及撤销记录过大，未执行关联清理。")
