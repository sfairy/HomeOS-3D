"""清理历史遗留：幽灵列、孤儿表、遗留索引。

这些对象都来自「Alembic 之前」的年代：库结构由 ``create_all()`` + ``ensure_schema()``
维护，而那一套**只加不减** —— 改过名的索引留在库里、下线功能的列留在表里，没有任何
机制回收。它们是纯粹的死重量：不参与任何查询，却跟着每一条 UPDATE 一起写、跟着每次
备份一起拷。

本迁移对每个对象都先查存在性再动手，因此：
- **全新库**（基线 ``0001`` 建出来的）上它几乎什么都不做 —— 基线本来就没有这些对象；
- **存量库**上它按清单清理。

清单是逐个核对 ``sqlite_master`` 与 ORM 元数据得出的，不是凭代码历史猜的
（比对方法见 ``backend/src/security/schema_guard.py`` 的 ``inspect_schema``）。

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
    # 曾经的二次验证（TOTP）与后台角色字段，功能已下线
    "accounts": ("totp_secret", "totp_enabled_at", "totp_last_step", "admin_role"),
    # 后台二次验证的「最近一次重新认证」时间戳
    "account_sessions": ("admin_reauth_at",),
    # 审计日志曾计划记录前后镜像，以及来源 IP / UA
    "audit_logs": ("before_json", "after_json", "ip", "user_agent"),
    # 验证码请求来源 IP（重放防护的早期形态）
    "email_verifications": ("request_ip",),
    # 发布记录曾计划带签名与摘要
    "releases": ("digest", "signature", "signature_key_id"),
}

#: 库里多出来、ORM 不再认识的索引：``{表: (索引名, ...)}``。
GHOST_INDEXES: dict[str, tuple[str, ...]] = {
    # 索引改名后遗留的旧副本（现行名字以 ORM 为准）
    "orders": ("uq_orders_pending_account",),
    "device_bindings": ("uq_device_bindings_active_license",),
    # 建在幽灵列 request_ip 上的索引
    "email_verifications": ("ix_email_verifications_ip_created",),
}

#: 孤儿表（全仓代码零引用，但库里有数据）。
ORPHAN_TABLES: tuple[str, ...] = ("license_request_nonces",)

#: 存量库里**缺失**的外键：``(表, 约束名, 本表列, 目标表, 目标列, ondelete)``。
#:
#: 这一条是 ``ensure_schema`` 时代最隐蔽的一类偏差。SQLite 的 ``ALTER TABLE ADD COLUMN``
#: 加不了外键，所以任何「后来才补上的列」在存量库里都是**没有约束**的 —— 而 ORM 声明了它，
#: 于是「本地全新库有约束、线上库没有」这种差异既不会报错、也查不出来，直到出现一个
#: 指向已删订单的 ``source_order_id``。逐表比对 ``pragma_foreign_key_list`` 才看得到它。
MISSING_FOREIGN_KEYS: tuple[tuple[str, str, str, str, str, str | None], ...] = (
    (
        "entitlements",
        "fk_entitlements_source_order_id",
        "source_order_id",
        "orders",
        "id",
        "SET NULL",
    ),
)


def _inspector():
    return sa.inspect(op.get_bind())


def _table_names() -> set[str]:
    return set(_inspector().get_table_names())


def _column_names(table: str) -> set[str]:
    return {column["name"] for column in _inspector().get_columns(table)}


def _index_names(table: str) -> set[str]:
    return {index["name"] for index in _inspector().get_indexes(table) if index.get("name")}


def _drop_index_if_exists(table: str, name: str) -> bool:
    if name not in _index_names(table):
        return False
    op.drop_index(name, table_name=table)
    return True


def _drop_column_if_exists(table: str, name: str) -> bool:
    if name not in _column_names(table):
        return False
    # SQLite 不能直接删列，只能整表重建；batch 模式负责 CREATE 新表 → 拷数据 →
    # DROP 旧表 → RENAME。这里用反射模式（不传 table 对象），因此它对存量库的实际
    # 结构生效，而不是对着 ORM 定义操作。
    with op.batch_alter_table(table) as batch:
        batch.drop_column(name)
    return True


def _has_foreign_key(table: str, columns: tuple[str, ...], referred_table: str) -> bool:
    for fk in _inspector().get_foreign_keys(table):
        if fk.get("referred_table") != referred_table:
            continue
        if tuple(fk.get("constrained_columns") or ()) == columns:
            return True
    return False


def _add_foreign_key_if_missing(
    table: str,
    name: str,
    column: str,
    referred_table: str,
    referred_column: str,
    ondelete: str | None,
) -> bool:
    if _has_foreign_key(table, (column,), referred_table):
        return False
    # 同样是整表重建：SQLite 无法给已有表追加外键。
    with op.batch_alter_table(table) as batch:
        batch.create_foreign_key(
            name, referred_table, [column], [referred_column], ondelete=ondelete
        )
    return True


def upgrade() -> None:
    tables = _table_names()
    changes: list[str] = []

    # 顺序有讲究：先删索引，再重建表。batch 重建会把反射到的索引一并重建，
    # 先删可以让幽灵索引不会被「复活」。
    for table, names in GHOST_INDEXES.items():
        if table not in tables:
            continue
        for name in names:
            if _drop_index_if_exists(table, name):
                changes.append(f"{table}.{name}（索引）")

    for table, names in GHOST_COLUMNS.items():
        if table not in tables:
            continue
        for name in names:
            if _drop_column_if_exists(table, name):
                changes.append(f"{table}.{name}（列）")

    # 再补回缺失的外键。放在最后：它同样会重建表，先让幽灵列/索引清干净，
    # 重建时才不会把已经删掉的东西又照原样带回来。
    for table, name, column, referred_table, referred_column, ondelete in MISSING_FOREIGN_KEYS:
        if table not in tables:
            continue
        if _add_foreign_key_if_missing(
            table, name, column, referred_table, referred_column, ondelete
        ):
            changes.append(f"{table}.{column} → {referred_table}（补回外键）")

    for name in ORPHAN_TABLES:
        if name in tables:
            op.drop_table(name)
            changes.append(f"{name}（表）")

    if changes:
        # 用 warning 而不是 info：这一次会**删数据**，运维应当在日志里看到它。
        logger.warning("0002 结构清理 %d 项：%s", len(changes), "、".join(changes))
    else:
        logger.info("0002 无可清理项：本库结构与 ORM 元数据已经一致。")


def downgrade() -> None:
    """不可逆。

    这里删掉的是**没有任何代码会读写的列与表**，因此「回滚」在语义上没有意义：
    即使把空列加回去，也只会得到一堆永远为 NULL 的列。真要恢复，请用迁移前
    自动生成的 ``store.db.pre-migrate-*.bak`` 快照。
    """
    raise RuntimeError(
        "0002 不可降级：它删除的是无代码引用的历史列与孤儿表，重建空列没有意义。"
        "需要回退请从 store.db.pre-migrate-*.bak 快照恢复。"
    )
