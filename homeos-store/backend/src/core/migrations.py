"""HomeOS Store 数据库迁移注册表。

版本号从 1 开始；基线由 schema_migrate 以 version=0 记录。空库先由 ORM 建出最新
结构，再执行全部迁移，因此每条迁移在空库上必须能安全 no-op。
"""

from __future__ import annotations

import sqlite3
from datetime import UTC, datetime

from homeos_shared.schema_migrate import Migration, MigrationContext, SchemaMigrationError
from homeos_shared.sqlite_email import normalize_email_column


def _columns(connection: sqlite3.Connection, table: str) -> set[str]:
    return {str(row[1]) for row in connection.execute(f'PRAGMA table_info("{table}")')}


def _table_exists(connection: sqlite3.Connection, table: str) -> bool:
    return connection.execute(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?", (table,)
    ).fetchone() is not None


def _index_exists(connection: sqlite3.Connection, index: str) -> bool:
    return connection.execute(
        "SELECT 1 FROM sqlite_master WHERE type = 'index' AND name = ?", (index,)
    ).fetchone() is not None


def _normalize_datetime(value: str | None) -> str | None:
    if not value or not isinstance(value, str):
        return value
    text = value.strip()
    if not text:
        return value
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        return value
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=UTC)
    parsed = parsed.astimezone(UTC)
    return parsed.strftime("%Y-%m-%d %H:%M:%S.%f")


def _normalize_accounts_email(connection: sqlite3.Connection, _context: MigrationContext) -> None:
    # 已有 ix_accounts_email 就是唯一索引；老库可能缺它，这里补齐。写入侧统一 lower/trim，
    # 因此不需要表达式索引（SQLAlchemy 反射表达式索引会告警）。
    normalize_email_column(
        connection,
        table="accounts",
        add_column_sql="ALTER TABLE accounts ADD COLUMN email VARCHAR(255) NOT NULL DEFAULT ''",
        index_name="ix_accounts_email",
    )

def _index_account_sessions(connection: sqlite3.Connection, _context: MigrationContext) -> None:
    if not _table_exists(connection, "account_sessions"):
        return
    columns = _columns(connection, "account_sessions")
    if {"account_id", "expires_at"} <= columns:
        connection.execute(
            "CREATE INDEX IF NOT EXISTS ix_account_sessions_account_expires "
            "ON account_sessions(account_id, expires_at)"
        )


def _dedupe_live_device_bindings(connection: sqlite3.Connection, context: MigrationContext) -> None:
    if not _table_exists(connection, "device_bindings"):
        return
    columns = _columns(connection, "device_bindings")
    if not {"license_id", "active", "released_at"} <= columns:
        return
    order_columns = [name for name in ("activated_at", "created_at") if name in columns]
    order_sql = ", ".join(f'"{name}" DESC' for name in order_columns)
    rows = connection.execute(
        "SELECT id, license_id FROM device_bindings "  # noqa: S608
        "WHERE active = 1 AND released_at IS NULL "
        f"ORDER BY license_id, {order_sql or 'rowid DESC'}, rowid DESC"
    ).fetchall()
    seen: set[str] = set()
    stale: list[str] = []
    for binding_id, license_id in rows:
        key = str(license_id)
        if key in seen:
            stale.append(str(binding_id))
        else:
            seen.add(key)
    if stale:
        placeholders = ",".join("?" for _ in stale)
        connection.execute(
            f"UPDATE device_bindings SET active = 0 WHERE id IN ({placeholders})", stale  # noqa: S608
        )
        context.logger.warning("同一授权存在多行 live 绑定，已降级 %s 行", len(stale))
    try:
        connection.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS device_bindings_single_live_uidx "
            "ON device_bindings(license_id) WHERE active = 1 AND released_at IS NULL"
        )
    except sqlite3.IntegrityError as error:
        raise SchemaMigrationError(
            "无法建立设备绑定单 live 唯一索引，库中仍存在重复 live 行。"
        ) from error


def _create_ops_indexes(connection: sqlite3.Connection) -> None:
    indexes = (
        ("orders", "ix_orders_status_created_at", "status, created_at"),
        ("licenses", "ix_licenses_access_expires_at", "access_expires_at"),
        ("recovery_tokens", "ix_recovery_tokens_expires_at", "expires_at"),
        ("license_sessions", "ix_license_sessions_expires_at", "expires_at"),
    )
    for table, name, columns in indexes:
        if not _table_exists(connection, table):
            continue
        connection.execute(f"CREATE INDEX IF NOT EXISTS {name} ON {table}({columns})")


def _add_recovery_revoked_at(connection: sqlite3.Connection) -> None:
    if not _table_exists(connection, "recovery_tokens"):
        return
    if "revoked_at" not in _columns(connection, "recovery_tokens"):
        connection.execute("ALTER TABLE recovery_tokens ADD COLUMN revoked_at DATETIME")


def _normalize_all_datetimes(connection: sqlite3.Connection, context: MigrationContext) -> None:
    tables = [
        str(row[0])
        for row in connection.execute(
            "SELECT name FROM sqlite_master WHERE type = 'table' "
            "AND name NOT LIKE 'sqlite_%' AND name != 'schema_migrations'"
        )
    ]
    changed = 0
    for table in tables:
        declared = connection.execute(f'PRAGMA table_info("{table}")').fetchall()
        types = {str(row[1]): str(row[2]).upper() for row in declared}
        for column, declared_type in types.items():
            if "DATE" not in declared_type and "TIME" not in declared_type:
                continue
            rows = connection.execute(
                f'SELECT rowid, "{column}" FROM "{table}" WHERE "{column}" IS NOT NULL '  # noqa: S608
                f'AND (instr("{column}", "+") > 0 OR instr("{column}", "T") > 0 '
                f'OR length("{column}") NOT IN (19, 26))'
            ).fetchall()
            for rowid, value in rows:
                normalized = _normalize_datetime(str(value))
                if normalized != value:
                    connection.execute(
                        f'UPDATE "{table}" SET "{column}" = ? WHERE rowid = ?',  # noqa: S608
                        (normalized, rowid),
                    )
                    changed += 1
    if changed:
        context.logger.warning("已归一化 %s 个时间字段为 UTC-naive", changed)


def _drop_releases_table(connection: sqlite3.Connection, context: MigrationContext) -> None:
    """删掉已废弃的 ``releases`` 表。

    商店不再做任何版本发布/升级检测（升级由开发者手动部署），这张表与相关模型已移除，
    这里把老库里剩下的表一并清掉。空库上本就由 ORM 建表、不含此表，故安全 no-op。
    """
    if not _table_exists(connection, "releases"):
        return
    connection.execute("DROP TABLE releases")
    context.logger.warning("已删除废弃的 releases 表（版本发布同步功能已移除）。")


#: 手工遗留的表达式索引：``CREATE UNIQUE INDEX … ON accounts(lower(trim(email)))``。
#: 仓库里没有任何代码创建它（``git log -S`` 查无此名），只出现在早期手工调试过的开发库。
REDUNDANT_EMAIL_INDEX = "accounts_email_normalized_uidx"


def _drop_redundant_email_index(connection: sqlite3.Connection, context: MigrationContext) -> None:
    """删掉手工遗留的表达式索引 ``accounts_email_normalized_uidx``，让库回到 ORM 声明的形状。

    为什么要删：它不在任何迁移与 ORM 元数据里，新建库永远不会有它，于是同一个版本的
    两个库结构不同；SQLAlchemy 反射不认表达式索引，每次启动都会往 stderr 打一段英文
    ``SAWarning: Skipped unsupported reflection of expression-based index …``（多行、带源码
    位置），夹在中文启动日志中间像是报错。

    为什么删了不会丢唯一性：唯一性由第 1 条迁移建的 ``ix_accounts_email`` 保证，而写入侧
    所有入口都做 ``strip().lower()``（``core/schemas.py`` 的 pydantic 校验器、``setup.py``、
    ``store_auth.py``、``security.normalize_email``），所以两行 ``email`` 在原值上不同、
    归一化后相同时不可能出现 —— 表达式索引拦的是同一件事，属于重复约束。

    顺序是刻意的：先跑一遍 ``_normalize_accounts_email``（它会把历史值归一化，并在归一化后
    出现重复时抛错中止），确保 ``ix_accounts_email`` 真的在且能建得起来，再删表达式索引 ——
    反过来就会出现「唯一索引已删、新的还没建」的窗口。空库与没有该索引的库上均安全 no-op。
    """
    if not _table_exists(connection, "accounts"):
        return
    if not _index_exists(connection, REDUNDANT_EMAIL_INDEX):
        return
    _normalize_accounts_email(connection, context)
    connection.execute(f"DROP INDEX {REDUNDANT_EMAIL_INDEX}")
    context.logger.warning("已删除冗余的表达式索引 %s（唯一性由 ix_accounts_email 保证）。", REDUNDANT_EMAIL_INDEX)


MIGRATIONS = (
    Migration(1, "accounts-email-normalize-unique", "s0002-v1", _normalize_accounts_email),
    Migration(2, "account-sessions-expiry-index", "s0003-v1", _index_account_sessions),
    Migration(3, "device-bindings-single-live", "s0004-v1", _dedupe_live_device_bindings),
    Migration(4, "ops-indexes", "s0005-v1", lambda connection, _ctx: _create_ops_indexes(connection)),
    Migration(5, "recovery-tokens-revoked-at", "s0006-v1", lambda connection, _ctx: _add_recovery_revoked_at(connection)),
    Migration(6, "normalize-all-datetimes", "s0007-v1", _normalize_all_datetimes),
    Migration(7, "drop-releases-table", "s0008-v1", _drop_releases_table),
    Migration(8, "drop-redundant-email-expression-index", "s0009-v1", _drop_redundant_email_index),
)
