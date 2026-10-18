"""HomeOS Store 数据库迁移注册表。

版本号从 1 开始；基线由 schema_migrate 以 version=0 记录。空库先由 ORM 建出最新
结构，再执行全部迁移，因此每条迁移在空库上必须能安全 no-op。
"""

from __future__ import annotations

import sqlite3
from datetime import UTC, datetime

from homeos_shared.schema_migrate import Migration, MigrationContext, SchemaMigrationError


def _columns(connection: sqlite3.Connection, table: str) -> set[str]:
    return {str(row[1]) for row in connection.execute(f'PRAGMA table_info("{table}")')}


def _table_exists(connection: sqlite3.Connection, table: str) -> bool:
    return connection.execute(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?", (table,)
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
    if not _table_exists(connection, "accounts"):
        return
    columns = _columns(connection, "accounts")
    if "email" not in columns:
        connection.execute("ALTER TABLE accounts ADD COLUMN email VARCHAR(255) NOT NULL DEFAULT ''")
        columns.add("email")
    rows = connection.execute(
        "SELECT id, email FROM accounts WHERE email IS NOT NULL AND trim(email) != ''"
    ).fetchall()
    normalized: dict[str, str] = {}
    for account_id, email in rows:
        value = str(email).strip().lower()
        previous = normalized.get(value)
        if previous is not None and previous != str(account_id):
            raise SchemaMigrationError(
                "accounts.email 归一化后出现重复，请先人工处理："
                f"{previous} 与 {account_id} 都映射到 {value}"
            )
        normalized[value] = str(account_id)
    connection.execute(
        "UPDATE accounts SET email = lower(trim(email)) "
        "WHERE email IS NOT NULL AND email <> lower(trim(email))"
    )
    # 已有 ix_accounts_email 就是唯一索引；老库可能缺它，这里补齐。写入侧统一 lower/trim，
    # 因此不需要表达式索引（SQLAlchemy 反射表达式索引会告警）。
    connection.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS ix_accounts_email ON accounts(email)"
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


MIGRATIONS = (
    Migration(1, "accounts-email-normalize-unique", "s0002-v1", _normalize_accounts_email),
    Migration(2, "account-sessions-expiry-index", "s0003-v1", _index_account_sessions),
    Migration(3, "device-bindings-single-live", "s0004-v1", _dedupe_live_device_bindings),
    Migration(4, "ops-indexes", "s0005-v1", lambda connection, _ctx: _create_ops_indexes(connection)),
    Migration(5, "recovery-tokens-revoked-at", "s0006-v1", lambda connection, _ctx: _add_recovery_revoked_at(connection)),
    Migration(6, "normalize-all-datetimes", "s0007-v1", _normalize_all_datetimes),
)
