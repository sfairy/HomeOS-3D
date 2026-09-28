"""清理历史遗留：幽灵列，并补回被写坏的可空性。

两类问题，都来自「结构没有版本控制」的年代：

1. **幽灵列** —— 下线功能留下的列（主题偏好、在线心跳），没有任何代码引用它们，
   却跟着每条 UPDATE 一起写、跟着每次备份一起拷。
2. **可空性被写坏** —— ``project_drafts.entity_ids_json`` 在 ORM 里是 ``nullable=True``
   （NULL 是一个有含义的值，见下），但线上库里是 ``NOT NULL``。SQLite 改不了列约束，
   于是这个偏差一直留在库里：代码里那条「回退全文扫描」的分支在线上永远不会被走到。

本迁移对每个对象都先查存在性再动手，因此全新库上它什么都不做，存量库上按清单纠正。

Revision ID: 0002
Revises: 0001
Create Date: 2026-09-28

"""
from __future__ import annotations

import logging

import sqlalchemy as sa
from alembic import op

logger = logging.getLogger("alembic.runtime.migration")

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None

#: 库里多出来、ORM 不再认识的列：``{表: (列, ...)}``。
GHOST_COLUMNS: dict[str, tuple[str, ...]] = {
    # 界面主题模式：主题后来改由前端本地存储决定
    "users": ("editor_theme_mode",),
    # 授权在线心跳：离线宽限期改由租约自身表达
    "license_state": ("last_online_at", "last_online_monotonic"),
}

#: 需要「放宽为可空」的列：``(表, 列)``。
#:
#: ``entity_ids_json`` 存的是草稿引用到的 HA 实体 ID（JSON 数组）。ORM 与 0001 基线都声明
#: 它可为 NULL，且代码把 NULL 当成一个**有含义**的值 —— 「这份草稿还没有索引，回退去扫全文」
#: （见 ``ha/service.py`` 的 ``_entity_ids_from_index``：读到 None 返回 None，调用方转入全文
#: 解析）。线上库里它却是 NOT NULL，于是那条回退分支在部署环境里永远不可达，而一旦有代码
#: 真的写 None，会以一条 IntegrityError 收场。这里把库改回 ORM 与代码共同约定的语义。
#:
#: 方向是安全的：放宽约束不可能让已有数据违反它（NOT NULL 的行全都满足 nullable）。
NULLABLE_COLUMNS: tuple[tuple[str, str], ...] = (("project_drafts", "entity_ids_json"),)


def _inspector():
    return sa.inspect(op.get_bind())


def _table_names() -> set[str]:
    return set(_inspector().get_table_names())


def _column(table: str, name: str) -> dict | None:
    for column in _inspector().get_columns(table):
        if column["name"] == name:
            return column
    return None


def upgrade() -> None:
    tables = _table_names()
    changes: list[str] = []

    for table, names in GHOST_COLUMNS.items():
        if table not in tables:
            continue
        for name in names:
            if _column(table, name) is None:
                continue
            # SQLite 不能直接删列，只能整表重建；batch 模式负责 CREATE 新表 → 拷数据 →
            # DROP 旧表 → RENAME。用反射模式（不传 table 对象），因此它作用于库里的实际
            # 结构，而不是对着 ORM 定义操作。
            with op.batch_alter_table(table) as batch:
                batch.drop_column(name)
            changes.append(f"{table}.{name}（列）")

    for table, name in NULLABLE_COLUMNS:
        if table not in tables:
            continue
        live = _column(table, name)
        if live is None or live.get("nullable"):
            continue
        with op.batch_alter_table(table) as batch:
            batch.alter_column(name, nullable=True, existing_type=sa.Text())
        changes.append(f"{table}.{name}（放宽为可空）")

    if changes:
        # 用 warning 而不是 info：这是一次**改结构**的迁移，运维应当在日志里看到它。
        logger.warning("0002 结构清理 %d 项：%s", len(changes), "、".join(changes))
    else:
        logger.info("0002 无可清理项：本库结构与 ORM 元数据已经一致。")


def downgrade() -> None:
    """不可逆。

    删掉的列没有任何代码会读写，重建空列没有意义；而把 ``entity_ids_json`` 收紧回
    ``NOT NULL`` 会在存在 NULL 行的库上直接失败 —— 那正是这条迁移要修掉的状态。
    需要回退请从 ``app.db.pre-migrate-*.bak`` 快照恢复。
    """
    raise RuntimeError(
        "0002 不可降级：它删除的是无代码引用的历史列，并把一处错误约束改回 ORM 声明的语义。"
        "需要回退请从 app.db.pre-migrate-*.bak 快照恢复。"
    )
