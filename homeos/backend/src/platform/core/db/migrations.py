"""主应用数据库结构真源：**ORM 元数据**，不再有历史迁移链。

## 为什么只有一条基线

表结构由 `platform/core/db/` 下的 SQLAlchemy 模型定义，全新装机时 `create_all` 直接按模型
建库（`prepare_schema` → `run_migrations` 的 fresh 分支），**一条迁移都不执行**。历史迁移
（曾经的 1–27 条）只做一件事：把更早的库补到当前结构。

那些升级路径是为「从 0.7.x 一路升级上来」的部署准备的。作为全新系统交付时它们没有消费者，
却持续带来成本：

- 754 行里 500+ 行是「某字段曾叫另一个名字」「某张表曾缺某列」的补丁；
- 每条迁移都要求作者不改语义（checksum 冻结），旧代码无法随模型一起演进；
- 排查结构问题要同时读模型和 27 段补丁，才能知道「现在长什么样」。

现在只剩 **1 号基线**（空操作）：作用是给 `schema_migrations` 写一行可读记录，让「结构由谁
负责」在库里可见。后续结构变更从 2 号开始追加，规则见文末。

## 升级到此版本的一次性动作

库里留有 2–27 号记录、或者根本没有版本记录时会因「结构来历无法证明」拒绝启动（刻意如此：
宁可拒绝，也不要按错的假设继续跑）。处理方式只有一条 —— 先确认库结构与模型一致，再重置
版本表：

```bash
node ops/lib/py.mjs ops/scripts/reset-schema-version.py --app homeos --dry-run   # 比对结构与模型
node ops/lib/py.mjs ops/scripts/reset-schema-version.py --app homeos            # 一致才允许重置
```

脚本先做逐表/逐列/逐索引比对，不一致就拒绝执行 —— 否则「重置版本」会把一个真的缺列的库
伪装成最新版本，之后再也无人发现。

## 新增迁移的规则

1. 版本号连续递增，从 2 开始；`checksum` 一旦发布不得修改（改了要加新版本号）；
2. `apply` 内**必须**用 `connection.execute()` 逐条执行 —— 不要用 `executescript()`，
   它会隐式 COMMIT，破坏事务原子性；
3. 迁移必须幂等（`IF NOT EXISTS` / 先查 `PRAGMA table_info`）：`create_all` 建出的新库与
   「迁移升上来的库」必须落到同一形状；
4. 同时改模型与迁移，并跑 `ops/scripts/reset-schema-version.py --dry-run` —— 它会告诉你
   模型与库是否已经同源。
"""

from __future__ import annotations

import json
import logging
import sqlite3

from homeos_shared.schema_migrate import Migration, MigrationContext
from homeos_shared.sqlite_schema import table_columns, table_indexes

LOGGER = logging.getLogger("homeos.platform.core.migrations")

#: 1 号基线：空操作。表结构由 ORM 模型负责（见模块说明）。
BASELINE_VERSION = 1
BASELINE_NAME = "baseline-0.8.8"
BASELINE_CHECKSUM = "h0001-baseline"


def _noop(connection: sqlite3.Connection, _context: MigrationContext) -> None:
    """基线不做事：结构由 ``create_all`` 按 ORM 元数据建立。"""


#: 2 号：时序表的「未结束行」查询索引。
#:
#: 时序写入每次都要找同实体最后一条 ``endedAt IS NULL`` 的记录来结算（批量后仍是一条 IN 查询），
#: 没有这个复合索引时只能沿 ``entityId`` 索引反向扫该实体的全部历史（实测单实体 6.6 万行）。
#: ``create_all`` 不会为已存在的表补索引，因此升级路径必须显式建（幂等）。
_TIMELINE_OPEN_INDEX_SQL = (
    "CREATE INDEX IF NOT EXISTS agent_context_timeline_open_idx ON agent_context_timeline (entityId, endedAt)"
)


def _table_exists(connection: sqlite3.Connection, table: str) -> bool:
    """表是否还在主库。

    日志 / 观测量的三张表已经搬到 ``homeos-logs.db``（见 ``log_database`` 模块）：
    全新库里主库**没有**这些表，而 ``ensure_schema(LogBase.metadata)`` 已经按模型建好了
    正确结构（含索引与唯一约束）。这些迁移只服务「升级上来的老库」，表不在就跳过 ——
    否则会在全新安装的第一步直接 ``no such table``。
    """
    row = connection.execute(
        "SELECT 1 FROM main.sqlite_master WHERE type='table' AND name=? LIMIT 1", (table,)
    ).fetchone()
    return row is not None


def _timeline_open_index(connection: sqlite3.Connection, _context: MigrationContext) -> None:
    if not _table_exists(connection, "agent_context_timeline"):
        return
    connection.execute(_TIMELINE_OPEN_INDEX_SQL)


#: 3 号：事件日志的库级幂等索引。
#:
#: 先按 ``(entityId, createdAt, stateDiff)`` 去重（保留最小 id），再建唯一索引；
#: 两步都幂等，重复执行不会失败。``stateDiff`` 为 NULL 的行 SQLite 视为彼此不同，
#: 这类行仍需应用层批内去重兜底（见 ``event_log._write_display_rows``）。
_EVENT_LOG_DEDUPE_SQL = (
    "DELETE FROM event_logs WHERE id NOT IN (SELECT MIN(id) FROM event_logs GROUP BY entityId, createdAt, stateDiff)"
)
_EVENT_LOG_UNIQUE_INDEX_SQL = (
    "CREATE UNIQUE INDEX IF NOT EXISTS event_logs_entity_created_diff_uq ON event_logs (entityId, createdAt, stateDiff)"
)


def _event_log_dedupe(connection: sqlite3.Connection, _context: MigrationContext) -> None:
    # 老库才有这张表；新库里它由 LogBase.metadata 直接建成带唯一索引的形状。
    if not _table_exists(connection, "event_logs"):
        return
    connection.execute(_EVENT_LOG_DEDUPE_SQL)
    connection.execute(_EVENT_LOG_UNIQUE_INDEX_SQL)


#: 4 号：事件统计表的 UTC 分桶索引。
#:
#: ``event_log_stats_hourly`` 先有了 ``bucketKey`` / ``entityId`` 两条索引，``bucketUtc``
#: 的索引是后补的；而 ``create_all`` 对**已存在**的表整体跳过，不会补索引，于是老库启动时
#: 会卡在 ``prepare_schema`` 的结构自检（``缺索引 event_log_stats_hourly_utc_idx``）而拒绝启动。
_EVENT_STATS_UTC_INDEX_SQL = (
    "CREATE INDEX IF NOT EXISTS event_log_stats_hourly_utc_idx ON event_log_stats_hourly (bucketUtc)"
)


def _event_stats_utc_index(connection: sqlite3.Connection, _context: MigrationContext) -> None:
    if not _table_exists(connection, "event_log_stats_hourly"):
        return
    connection.execute(_EVENT_STATS_UTC_INDEX_SQL)


#: 5 号：能耗日/月行的用能单位列（电 kWh / 燃气、水 m³）。
#:
#: 加列而不是新建表：历史行全部是电，默认值 ``kWh`` 正好是它们的真实单位，
#: 不需要回填脚本。用 ``PRAGMA table_info`` 判存在性，保证与 ``create_all`` 建出的新库同形。
_ENERGY_UNIT_COLUMNS: tuple[tuple[str, str], ...] = (
    ("energy_usage_daily", "unit"),
    ("energy_usage_monthly", "unit"),
)


def _energy_unit_columns(connection: sqlite3.Connection, _context: MigrationContext) -> None:
    for table, column in _ENERGY_UNIT_COLUMNS:
        existing = {row[1] for row in connection.execute(f"PRAGMA table_info({table})")}
        if column not in existing:
            connection.execute(f"ALTER TABLE {table} ADD COLUMN {column} VARCHAR(8) NOT NULL DEFAULT 'kWh'")


#: 6 号：能耗小时聚合表（峰谷计价的精确来源）。
#:
#: ``create_all`` 只建**缺失的表**，所以升级路径必须显式建；``IF NOT EXISTS`` 保证与
#: 新库同形、重复执行不失败。索引与唯一约束在表定义里，这里一并写全。
_ENERGY_HOURLY_SQL: tuple[str, ...] = (
    """
    CREATE TABLE IF NOT EXISTS energy_usage_hourly (
        id VARCHAR(36) NOT NULL PRIMARY KEY,
        entityId VARCHAR(255) NOT NULL,
        hour VARCHAR(16) NOT NULL,
        kwh FLOAT NOT NULL DEFAULT 0,
        unit VARCHAR(8) NOT NULL DEFAULT 'kWh',
        sampleCount INTEGER NOT NULL DEFAULT 0,
        updatedAt DATETIME NOT NULL,
        CONSTRAINT energy_usage_hourly_key UNIQUE (entityId, hour)
    )
    """,
    "CREATE INDEX IF NOT EXISTS energy_usage_hourly_hour_idx ON energy_usage_hourly (hour)",
)


def _energy_hourly_table(connection: sqlite3.Connection, _context: MigrationContext) -> None:
    for statement in _ENERGY_HOURLY_SQL:
        connection.execute(statement)


#: 7 号：用水日用量表（用水「日用量异常」判定的数据源）。
_WATER_USAGE_SQL: tuple[str, ...] = (
    """
    CREATE TABLE IF NOT EXISTS water_usage_daily (
        id VARCHAR(36) NOT NULL PRIMARY KEY,
        entityId VARCHAR(255) NOT NULL,
        day VARCHAR(16) NOT NULL,
        cubicMeters FLOAT NOT NULL DEFAULT 0,
        sampleCount INTEGER NOT NULL DEFAULT 0,
        updatedAt DATETIME NOT NULL,
        CONSTRAINT water_usage_daily_key UNIQUE (entityId, day)
    )
    """,
    "CREATE INDEX IF NOT EXISTS water_usage_daily_day_idx ON water_usage_daily (day)",
)


def _water_usage_table(connection: sqlite3.Connection, _context: MigrationContext) -> None:
    for statement in _WATER_USAGE_SQL:
        connection.execute(statement)


#: 8 号：删掉 ``event_logs`` 上与唯一索引重复的实体索引。
#:
#: 3 号建的 ``event_logs_entity_created_diff_uq`` 前缀正好是 ``(entityId, createdAt)``，
#: 与 ``event_logs_entityId_createdAt_idx`` 对同一查询形状完全等价。两条并存时：
#:
#: - 每次插入多维护一棵 B-tree（日志是高频写入表）；
#: - 实测时间序列表占库 96%（表 513 MB + 索引 333 MB），其中一条是纯重复；
#: - ``query_history`` 的 ``WHERE entityId = ?`` 仍能走唯一索引的前缀。
#:
#: ``DROP INDEX IF EXISTS`` 对「表还不存在」（全新库先跑迁移再 ``create_all``）是空操作。
_EVENT_LOG_REDUNDANT_INDEX_SQL = "DROP INDEX IF EXISTS event_logs_entityId_createdAt_idx"


def _drop_event_log_redundant_index(connection: sqlite3.Connection, _context: MigrationContext) -> None:
    connection.execute(_EVENT_LOG_REDUNDANT_INDEX_SQL)


#: 9 号：草稿实体引用派生表 + 两个高频过滤索引。
#:
#: 三件事放在同一个迁移里，都属于「升级上来的库缺少、而 ``create_all`` 不会补」的结构：
#:
#: 1. ``project_draft_entity_refs``：把「草稿文档里出现哪些实体」物化。原先
#:    ``_load_persistent_entity_ids`` 每次都要读全部 ``document_json`` 并逐个解析，
#:    而保存草稿 / 删仪表盘 / HA 同步都会触发。表建好后立刻按现存草稿回填一次。
#: 2. ``notifications(source, createdAt)``：通知列表按来源过滤 + 倒序分页，
#:    现有索引只有 ``(createdAt)`` 与 ``(read, createdAt)``，带来源时仍需回表过滤。
#: 3. ``energy_usage_daily(day)``：保留期清理与跨实体按天范围查询只能扫
#:    唯一索引 ``(entityId, day)`` 的第二列，等于全表。
_PROJECT_DRAFT_REFS_SQL: tuple[str, ...] = (
    """
    CREATE TABLE IF NOT EXISTS project_draft_entity_refs (
        project_id VARCHAR(36) NOT NULL,
        entity_id VARCHAR(255) NOT NULL,
        PRIMARY KEY (project_id, entity_id),
        FOREIGN KEY (project_id) REFERENCES project_drafts (project_id) ON DELETE CASCADE
    )
    """,
    "CREATE INDEX IF NOT EXISTS ix_project_draft_entity_refs_entity_id ON project_draft_entity_refs (entity_id)",
)

_ADDITIONAL_INDEX_SQL: tuple[str, ...] = (
    "CREATE INDEX IF NOT EXISTS notifications_source_createdAt_idx ON notifications (source, createdAt)",
    "CREATE INDEX IF NOT EXISTS energy_usage_daily_day_idx ON energy_usage_daily (day)",
)


def _draft_entity_refs_table(connection: sqlite3.Connection, _context: MigrationContext) -> None:
    for statement in _PROJECT_DRAFT_REFS_SQL:
        connection.execute(statement)
    for statement in _ADDITIONAL_INDEX_SQL:
        # 表可能还不存在（全新库先迁移后 create_all）：``IF NOT EXISTS`` 不覆盖「无此表」，
        # 这里先判存在性，避免在空库上 ``no such table``。
        table = statement.split(" ON ", 1)[1].split(" ", 1)[0]
        if _table_exists(connection, table):
            connection.execute(statement)

    # 回填：只在表为空时做一次。文档 JSON 是唯一真源，解析失败的行跳过（下次保存会补齐）。
    existing = connection.execute("SELECT COUNT(*) FROM project_draft_entity_refs").fetchone()[0]
    if existing:
        return
    # 延迟导入：迁移模块在启动早期被导入，避免把实体遍历的依赖一并拉进这条链路。
    from ..entity.entity_refs import document_entity_ids

    rows = connection.execute("SELECT project_id, document_json FROM project_drafts").fetchall()
    payload: list[tuple[str, str]] = []
    for project_id, document_json in rows:
        try:
            document = json.loads(document_json)
        except (TypeError, ValueError) as error:  # fmt: skip
            LOGGER.warning("草稿文档 JSON 解析失败，回填跳过：project=%s（%s）", project_id, error)
            continue
        payload.extend((str(project_id), str(entity_id)) for entity_id in document_entity_ids(document))
    if payload:
        connection.executemany(
            "INSERT OR IGNORE INTO project_draft_entity_refs (project_id, entity_id) VALUES (?, ?)",
            payload,
        )


MIGRATIONS: tuple[Migration, ...] = (
    Migration(BASELINE_VERSION, BASELINE_NAME, BASELINE_CHECKSUM, _noop),
    Migration(2, "agent-timeline-open-index", "h0002-timeline-open-index", _timeline_open_index),
    Migration(3, "event-log-dedupe-unique", "h0003-event-log-unique", _event_log_dedupe),
    Migration(4, "event-stats-utc-index", "h0004-event-stats-utc-index", _event_stats_utc_index),
    Migration(5, "energy-usage-unit", "h0005-energy-usage-unit", _energy_unit_columns),
    Migration(6, "energy-usage-hourly", "h0006-energy-usage-hourly", _energy_hourly_table),
    Migration(7, "water-usage-daily", "h0007-water-usage-daily", _water_usage_table),
    Migration(8, "event-log-drop-redundant-index", "h0008-event-log-drop-dup-index", _drop_event_log_redundant_index),
    Migration(9, "draft-entity-refs-and-indexes", "h0009-draft-refs", _draft_entity_refs_table),
)


#: 结构比对脚本用的兼容别名：真源在 ``homeos_shared.sqlite_schema``。
schema_columns = table_columns
schema_indexes = table_indexes

__all__ = [
    "BASELINE_CHECKSUM",
    "BASELINE_NAME",
    "BASELINE_VERSION",
    "MIGRATIONS",
    "schema_columns",
    "schema_indexes",
]
