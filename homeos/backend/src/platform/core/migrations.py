"""HomeOS 数据库迁移注册表。

版本号从 1 开始；基线由 schema_migrate 以 version=0 记录。每条迁移必须幂等：
空库先由 ORM 建出最新结构，再执行全部迁移，因此迁移在空库上要能安全 no-op。
"""

from __future__ import annotations

import json
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
    normalize_email_column(
        connection,
        table="users",
        add_column_sql="ALTER TABLE users ADD COLUMN email VARCHAR(255)",
        index_name="users_email_idx",
    )

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


#: 本迁移落地时的 3D 设备分类快照（迁移必须冻结口径，不随后续版本变化）。
_DEVICE_COLLECTIONS = frozenset({
    'nas',
    'televisions',
    'speakers',
    'vacuums',
    'airFryers',
    'aromaDiffusers',
    'beds',
    'breadMakers',
    'cars',
    'coffeeMachines',
    'computers',
    'dishwashers',
    'disinfectionCabinets',
    'dryers',
    'fridges',
    'humidifiers',
    'juicers',
    'microwaves',
    'networkCabinets',
    'petDryers',
    'petFeeders',
    'petFountains',
    'pipelineWaterPurifiers',
    'plants',
    'powerBlenders',
    'pressureCookers',
    'printers',
    'printers3d',
    'rangehoods',
    'riceCookers',
    'routers',
    'smartSockets86',
    'steamOvens',
    'teaBarMachines',
    'toilets',
    'washers',
    'waterPurifiers',
})


def _wrap_status_values(rule) -> bool:
    """把旧的单值状态条件收紧成列表；返回是否发生改动。"""
    if not isinstance(rule, dict):
        return False
    changed = False
    for key in ('active', 'inactive'):
        if isinstance(rule.get(key), str):
            rule[key] = [rule[key]]
            changed = True
    return changed


def _normalize_status_rules(status_rules) -> bool:
    """状态灯规则：``active`` / ``inactive`` 由单值改为列表。"""
    if not isinstance(status_rules, dict):
        return False
    changed = False
    for rule in status_rules.values():
        if isinstance(rule, list):
            for item in rule:
                changed |= _wrap_status_values(item)
        else:
            changed |= _wrap_status_values(rule)
    return changed


def _normalize_3d_properties(properties: dict) -> bool:
    """清理 3D 组件 properties 中已不再支持的历史结构；幂等。"""
    changed = False
    devices = properties.get('devices')
    if isinstance(devices, dict):
        # 只删不带数据的未知分类；带内容的保留，让校验显式报错而不是静默丢数据。
        for collection in [
            name for name in devices
            if name not in _DEVICE_COLLECTIONS and not devices[name]
        ]:
            del devices[collection]
            changed = True
    environment = properties.get('environment')
    if isinstance(environment, dict):
        for sensor in environment.get('temperatureHumidity') or []:
            if isinstance(sensor, dict) and 'sizingVersion' in sensor:
                del sensor['sizingVersion']
                changed = True
    return changed


def _walk_3d_components(value) -> bool:
    """递归遍历文档，收紧 ``type == 'interaction3d'`` 组件的配置；返回是否发生改动。"""
    changed = False
    if isinstance(value, dict):
        if value.get('type') == 'interaction3d':
            properties = value.get('properties')
            if isinstance(properties, dict):
                changed |= _normalize_3d_properties(properties)
        for key, item in value.items():
            if key == 'statusRules':
                changed |= _normalize_status_rules(item)
            changed |= _walk_3d_components(item)
        return changed
    if isinstance(value, list):
        for item in value:
            changed |= _walk_3d_components(item)
    return changed


def _drop_legacy_sync_pending(connection: sqlite3.Connection, context: MigrationContext) -> None:
    """删除 ``studio_interaction_sync.document_json.pending``（旧「待写文件」指针）。"""
    if not _table_exists(connection, 'studio_interaction_sync'):
        return
    row = connection.execute(
        'SELECT document_json FROM studio_interaction_sync WHERE id = 1'
    ).fetchone()
    if row is None:
        return
    try:
        document = json.loads(row[0])
    except (TypeError, json.JSONDecodeError):
        return
    if not isinstance(document, dict) or 'pending' not in document:
        return
    document.pop('pending')
    connection.execute(
        'UPDATE studio_interaction_sync SET document_json = ? WHERE id = 1',
        (json.dumps(document, ensure_ascii=False, separators=(',', ':')),),
    )
    context.logger.warning('已删除 3D 草稿同步表中的历史 pending 指针')


def _normalize_project_draft_3d_config(
    connection: sqlite3.Connection, context: MigrationContext
) -> None:
    """把项目草稿里的 3D 增量配置收紧到当前契约（一次性数据清理）。"""
    if not _table_exists(connection, 'project_drafts'):
        return
    rows = connection.execute('SELECT project_id, document_json FROM project_drafts').fetchall()
    migrated = 0
    for project_id, document_json in rows:
        try:
            document = json.loads(document_json)
        except (TypeError, json.JSONDecodeError):
            continue
        if not isinstance(document, dict) or not _walk_3d_components(document):
            continue
        # 修订号 +1：持有旧结构的客户端必须重新拉取，否则会用旧载荷覆盖回历史字段。
        connection.execute(
            'UPDATE project_drafts SET document_json = ?, revision = revision + 1 '
            'WHERE project_id = ?',
            (
                json.dumps(document, ensure_ascii=False, separators=(',', ':')),
                project_id,
            ),
        )
        migrated += 1
    if migrated:
        context.logger.warning('已清理 %s 份项目草稿中的 3D 历史配置结构', migrated)


MIGRATIONS = (
    Migration(1, "users-email-normalize-unique", "h0002-v1", _normalize_users_email),
    Migration(2, "sessions-user-expires-index", "h0003-v1", _index_sessions_user_expires),
    Migration(3, "ha-connections-single-active", "h0004-v1", _dedupe_active_ha_connections),
    Migration(4, "studio-drafts-and-import", "h0005-v1", _create_studio_drafts),
    Migration(5, "json-validity-size-guards", "h0006-v1", lambda connection, _ctx: _create_json_guards(connection)),
    Migration(6, "singleton-table-guards", "h0008-v1", lambda connection, _ctx: _create_singleton_guards(connection)),
    Migration(7, "projects-updated-at-index", "h0007-v1", _index_projects_updated_at),
    Migration(8, "normalize-all-datetimes", "h0001-v1", _normalize_all_datetimes),
    Migration(9, "project-draft-3d-strict-config", "h0009-v1", _normalize_project_draft_3d_config),
    Migration(10, "drop-studio-sync-pending", "h0010-v1", _drop_legacy_sync_pending),
)
