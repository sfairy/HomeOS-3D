"""HomeOS 数据库迁移注册表。

版本号从 1 开始；基线由 schema_migrate 以 version=0 记录。每条迁移必须幂等：
空库先由 ORM 建出最新结构，再执行全部迁移，因此迁移在空库上要能安全 no-op。
"""

from __future__ import annotations

import json
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
    """把 ISO 时间统一成 SQLite/ORM 使用的 UTC-naive 26 字符格式。"""
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


def _normalize_users_email(connection: sqlite3.Connection, _context: MigrationContext) -> None:
    if not _table_exists(connection, "users"):
        return
    columns = _columns(connection, "users")
    if "email" not in columns:
        connection.execute("ALTER TABLE users ADD COLUMN email VARCHAR(255)")
        columns.add("email")
    rows = connection.execute(
        "SELECT id, email FROM users WHERE email IS NOT NULL AND trim(email) != ''"
    ).fetchall()
    normalized: dict[str, str] = {}
    for user_id, email in rows:
        value = str(email).strip().lower()
        previous = normalized.get(value)
        if previous is not None and previous != str(user_id):
            raise SchemaMigrationError(
                "users.email 归一化后出现重复，请先人工处理："
                f"{previous} 与 {user_id} 都映射到 {value}"
            )
        normalized[value] = str(user_id)
    connection.execute(
        "UPDATE users SET email = lower(trim(email)) "
        "WHERE email IS NOT NULL AND email <> lower(trim(email))"
    )
    connection.execute("CREATE UNIQUE INDEX IF NOT EXISTS users_email_idx ON users(email)")


def _dedupe_active_ha_connections(connection: sqlite3.Connection, context: MigrationContext) -> None:
    if not _table_exists(connection, "ha_connections"):
        return
    columns = _columns(connection, "ha_connections")
    if "is_active" not in columns:
        return
    order_columns = [name for name in ("last_connected_at", "updated_at", "created_at") if name in columns]
    order_sql = ", ".join(f'"{name}" IS NULL, "{name}" DESC' for name in order_columns)
    rows = connection.execute(
        "SELECT id FROM ha_connections WHERE is_active = 1 "  # noqa: S608
        f"ORDER BY {order_sql or 'rowid DESC'}, rowid DESC"
    ).fetchall()
    if len(rows) <= 1:
        pass
    else:
        keep = str(rows[0][0])
        stale = [str(row[0]) for row in rows[1:]]
        placeholders = ",".join("?" for _ in stale)
        connection.execute(
            f"UPDATE ha_connections SET is_active = 0 WHERE id IN ({placeholders})", stale  # noqa: S608
        )
        context.logger.warning("HA 连接存在多行 active，已保留 %s，降级其余 %s 行", keep, len(stale))
    try:
        connection.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS ha_connections_single_active_uidx "
            "ON ha_connections(is_active) WHERE is_active = 1"
        )
    except sqlite3.IntegrityError as error:
        raise SchemaMigrationError(
            "无法建立 HA 连接单 active 唯一索引，库中仍存在重复 active 行。"
        ) from error


def _create_studio_drafts(connection: sqlite3.Connection, context: MigrationContext) -> None:
    connection.execute(
        "CREATE TABLE IF NOT EXISTS studio_drafts ("
        "id INTEGER PRIMARY KEY CHECK (id = 1), "
        "revision INTEGER NOT NULL DEFAULT 0, "
        "schema_version INTEGER NOT NULL DEFAULT 8, "
        "scene_json TEXT NOT NULL CHECK (json_valid(scene_json)), "
        "updated_at DATETIME NOT NULL, "
        "updated_by VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL)"
    )
    connection.execute(
        "CREATE INDEX IF NOT EXISTS ix_studio_drafts_updated_by ON studio_drafts(updated_by)"
    )
    existing = connection.execute("SELECT 1 FROM studio_drafts WHERE id = 1").fetchone()
    if existing is not None:
        return
    path = context.data_dir / "studio3d" / "draft.json"
    if not path.is_file():
        return
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as error:
        raise SchemaMigrationError(f"3D 户型草稿无法解析，迁移中止：{path}：{error}") from error
    if not isinstance(payload, dict):
        raise SchemaMigrationError(f"3D 户型草稿根节点不是对象，迁移中止：{path}")
    scene = payload.get("scene")
    if scene is None and isinstance(payload.get("floors"), list):
        scene = payload
    if not isinstance(scene, dict):
        raise SchemaMigrationError(f"3D 户型草稿缺少 scene 对象，迁移中止：{path}")
    try:
        revision = int(payload.get("revision") or 0)
    except (TypeError, ValueError):
        revision = 0
    try:
        schema_version = int(scene.get("schemaVersion") or 8)
    except (TypeError, ValueError):
        schema_version = 8
    updated_at = _normalize_datetime(
        payload.get("updatedAt") if isinstance(payload.get("updatedAt"), str) else None
    )
    if not updated_at:
        updated_at = datetime.now(UTC).strftime("%Y-%m-%d %H:%M:%S.%f")
    connection.execute(
        "INSERT INTO studio_drafts (id, revision, schema_version, scene_json, updated_at, updated_by) "
        "VALUES (1, ?, ?, ?, ?, NULL)",
        (revision, schema_version, json.dumps(scene, ensure_ascii=False, separators=(",", ":")), updated_at),
    )
    context.logger.warning("已把旧 3D 草稿导入数据库：%s（revision=%s）", path, revision)


def _create_json_guards(connection: sqlite3.Connection) -> None:
    guards = (
        ("project_drafts", "document_json", 16 * 1024 * 1024),
        ("studio_interaction_sync", "document_json", 16 * 1024 * 1024),
        ("global_custom_popup_state", "popups_json", 16 * 1024 * 1024),
        ("studio_drafts", "scene_json", 64 * 1024 * 1024),
    )
    for table, column, limit in guards:
        if not _table_exists(connection, table):
            continue
        if column not in _columns(connection, table):
            continue
        for operation in ("INSERT", "UPDATE OF " + column):
            trigger = f"trg_{table}_{column}_{operation.split()[0].lower()}_valid"
            connection.execute(
                f"CREATE TRIGGER IF NOT EXISTS {trigger} BEFORE {operation} ON {table} "
                f"WHEN NOT json_valid(NEW.{column}) "
                f"BEGIN SELECT RAISE(ABORT, '{table}.{column} is not valid JSON'); END"
            )
            trigger_size = f"trg_{table}_{column}_{operation.split()[0].lower()}_size"
            connection.execute(
                f"CREATE TRIGGER IF NOT EXISTS {trigger_size} BEFORE {operation} ON {table} "
                f"WHEN length(CAST(NEW.{column} AS BLOB)) > {limit} "
                f"BEGIN SELECT RAISE(ABORT, '{table}.{column} is too large'); END"
            )


def _create_singleton_guards(connection: sqlite3.Connection) -> None:
    for table in ("license_state", "studio_interaction_sync", "global_custom_popup_state"):
        if not _table_exists(connection, table):
            continue
        if "id" not in _columns(connection, table):
            continue
        connection.execute(
            f"CREATE TRIGGER IF NOT EXISTS trg_{table}_singleton_insert "
            f"BEFORE INSERT ON {table} WHEN NEW.id <> 1 "
            f"BEGIN SELECT RAISE(ABORT, '{table} is a singleton table'); END"
        )
        connection.execute(
            f"CREATE TRIGGER IF NOT EXISTS trg_{table}_singleton_update "
            f"BEFORE UPDATE OF id ON {table} WHEN NEW.id <> 1 "
            f"BEGIN SELECT RAISE(ABORT, '{table} is a singleton table'); END"
        )


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
        for column in _columns(connection, table):
            declared = connection.execute(f'PRAGMA table_info("{table}")').fetchall()
            types = {str(row[1]): str(row[2]).upper() for row in declared}
            if "DATE" not in types.get(column, "") and "TIME" not in types.get(column, ""):
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


def _index_sessions_user_expires(connection: sqlite3.Connection, _context: MigrationContext) -> None:
    connection.execute(
        "CREATE INDEX IF NOT EXISTS sessions_user_expires_idx ON sessions(userId, expiresAt)"
    )


def _index_projects_updated_at(connection: sqlite3.Connection, _context: MigrationContext) -> None:
    connection.execute("CREATE INDEX IF NOT EXISTS ix_projects_updated_at ON projects(updated_at)")


MIGRATIONS = (
    Migration(1, "users-email-normalize-unique", "h0002-v1", _normalize_users_email),
    Migration(2, "sessions-user-expires-index", "h0003-v1", _index_sessions_user_expires),
    Migration(3, "ha-connections-single-active", "h0004-v1", _dedupe_active_ha_connections),
    Migration(4, "studio-drafts-and-import", "h0005-v1", _create_studio_drafts),
    Migration(5, "json-validity-size-guards", "h0006-v1", lambda connection, _ctx: _create_json_guards(connection)),
    Migration(6, "singleton-table-guards", "h0008-v1", lambda connection, _ctx: _create_singleton_guards(connection)),
    Migration(7, "projects-updated-at-index", "h0007-v1", _index_projects_updated_at),
    Migration(8, "normalize-all-datetimes", "h0001-v1", _normalize_all_datetimes),
)
