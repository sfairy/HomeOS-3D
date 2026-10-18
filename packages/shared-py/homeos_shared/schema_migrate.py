"""SQLite 版本化迁移内核（两个后端共用）。

设计目标：
- 运行期只依赖标准库与 homeos_shared.file_lock，因此可被 Cython 编译进 .so；
- 迁移前用 VACUUM INTO 留快照；迁移在 BEGIN IMMEDIATE 事务内执行；
- 每次启动只做一次基线判定，之后按版本号增量执行；
- 失败即抛错并阻止应用启动，绝不空库重建；
- 不提供 down migration：回滚 = 恢复迁移前快照 + 旧镜像。
"""

from __future__ import annotations

import logging
import sqlite3
from collections.abc import Callable, Iterable, Sequence
from contextlib import closing
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path

from .file_lock import locked_file

LOGGER = logging.getLogger(__name__)

#: 版本表结构；app 参与主键，允许同一个 SQLite 文件未来被不同应用复用（当前不会）。
MIGRATIONS_TABLE = "schema_migrations"
MIGRATION_LOCK_SUFFIX = ".migrate.lock"
BASELINE_VERSION = 0
BASELINE_NAME = "baseline"
BASELINE_CHECKSUM = "baseline"
#: 迁移前快照默认保留份数。
MIGRATION_BACKUP_KEEP = 10


class SchemaMigrationError(RuntimeError):
    """迁移无法继续；调用方必须让进程启动失败。"""


class MigrationPending(SchemaMigrationError):
    """check 模式发现待执行迁移或结构缺口。"""


@dataclass(frozen=True)
class MigrationContext:
    """迁移函数可用的只读上下文。"""

    app: str
    database_path: Path
    data_dir: Path
    logger: logging.Logger = field(default=LOGGER)


@dataclass(frozen=True)
class Migration:
    """一条迁移。

    checksum 由迁移作者显式维护（改名/改语义时递增），用于发现“版本号已记录但
    代码又被改过”的漂移。不要用文件哈希——Cython 产物里没有源码文件。

    注意：apply 内必须用 ``connection.execute()`` 逐条执行；不要用
    ``executescript()``——它会隐式 COMMIT，破坏迁移的事务原子性。
    """

    version: int
    name: str
    checksum: str
    apply: Callable[[sqlite3.Connection, MigrationContext], None]


@dataclass(frozen=True)
class MigrationReport:
    """一次迁移运行的结果。"""

    app: str
    database_path: Path
    mode: str
    fresh: bool
    adopted: bool
    from_version: int
    to_version: int
    applied: tuple[int, ...]
    pending: tuple[int, ...]
    backup_path: Path | None


def _utc_stamp() -> str:
    return datetime.now(UTC).strftime("%Y%m%d-%H%M%S")


def _iso_now() -> str:
    return datetime.now(UTC).isoformat()


def _validate_mode(mode: str) -> str:
    normalized = (mode or "auto").strip().lower()
    if normalized not in {"auto", "check", "off"}:
        raise SchemaMigrationError(f"未知的数据库迁移模式：{mode!r}（可选 auto/check/off）")
    return normalized


def has_business_tables(connection: sqlite3.Connection) -> bool:
    """库里除迁移版本表外是否已有业务表。"""
    rows = connection.execute(
        "SELECT name FROM sqlite_master WHERE type = 'table' "
        "AND name NOT LIKE 'sqlite_%' AND name != ?",
        (MIGRATIONS_TABLE,),
    ).fetchall()
    return bool(rows)


def ensure_migrations_table(connection: sqlite3.Connection) -> None:
    connection.execute(
        f"CREATE TABLE IF NOT EXISTS {MIGRATIONS_TABLE} ("
        "app TEXT NOT NULL, "
        "version INTEGER NOT NULL, "
        "name TEXT NOT NULL, "
        "checksum TEXT NOT NULL, "
        "applied_at TEXT NOT NULL, "
        "duration_ms INTEGER NOT NULL, "
        "PRIMARY KEY (app, version))"
    )
    connection.commit()


def migrations_table_exists(connection: sqlite3.Connection) -> bool:
    """只读探测版本表是否存在；check 模式绝不能顺手建表。"""
    row = connection.execute(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?",
        (MIGRATIONS_TABLE,),
    ).fetchone()
    return row is not None


def read_applied(connection: sqlite3.Connection, app: str) -> dict[int, tuple[str, str]]:
    """返回 version -> (name, checksum)。"""
    rows = connection.execute(
        f"SELECT version, name, checksum FROM {MIGRATIONS_TABLE} WHERE app = ? ORDER BY version",  # noqa: S608
        (app,),
    ).fetchall()
    return {int(row[0]): (str(row[1]), str(row[2])) for row in rows}


def _latest_version(migrations: Sequence[Migration]) -> int:
    return max((item.version for item in migrations), default=BASELINE_VERSION)


def _assert_migration_versions(migrations: Sequence[Migration]) -> None:
    versions = [item.version for item in migrations]
    if len(versions) != len(set(versions)):
        raise SchemaMigrationError("迁移版本号重复。")
    if any(version <= BASELINE_VERSION for version in versions):
        raise SchemaMigrationError("迁移版本号必须从 1 开始递增。")
    if versions != sorted(versions):
        raise SchemaMigrationError("迁移列表必须按版本号升序排列。")


def _stamp_baseline(connection: sqlite3.Connection, app: str) -> None:
    connection.execute(
        f"INSERT OR REPLACE INTO {MIGRATIONS_TABLE} "  # noqa: S608
        "(app, version, name, checksum, applied_at, duration_ms) VALUES (?, ?, ?, ?, ?, 0)",
        (app, BASELINE_VERSION, BASELINE_NAME, BASELINE_CHECKSUM, _iso_now()),
    )
    connection.commit()


def backup_database(database_path: Path, backup_dir: Path, *, label: str = "before-migrate") -> Path:
    """用 VACUUM INTO 生成一致性快照；失败即中止迁移。"""
    backup_dir.mkdir(parents=True, exist_ok=True)
    destination = backup_dir / f"{database_path.stem}-{label}-{_utc_stamp()}.db"
    suffix = 1
    while destination.exists():
        destination = backup_dir / f"{database_path.stem}-{label}-{_utc_stamp()}-{suffix}.db"
        suffix += 1
    try:
        connection = sqlite3.connect(database_path)
        try:
            connection.execute("VACUUM INTO ?", (str(destination),))
        finally:
            connection.close()
    except sqlite3.Error as error:
        destination.unlink(missing_ok=True)
        raise SchemaMigrationError(f"迁移前快照失败：{database_path} → {destination}：{error}") from error
    return destination


def prune_backups(backup_dir: Path, database_stem: str, *, keep: int = MIGRATION_BACKUP_KEEP) -> None:
    if keep < 1:
        return
    backups = sorted(backup_dir.glob(f"{database_stem}-before-migrate-*.db"))
    for stale in backups[:-keep]:
        stale.unlink(missing_ok=True)


def _integrity_check(connection: sqlite3.Connection) -> None:
    result = connection.execute("PRAGMA integrity_check").fetchone()
    if result is None or result[0] != "ok":
        raise SchemaMigrationError(f"SQLite integrity_check 失败：{result[0] if result else 'no result'}")
    violations = connection.execute("PRAGMA foreign_key_check").fetchall()
    if violations:
        sample = "; ".join(str(row) for row in violations[:5])
        raise SchemaMigrationError(f"SQLite foreign_key_check 失败：{sample}")


def _apply_one(
    connection: sqlite3.Connection,
    migration: Migration,
    context: MigrationContext,
) -> int:
    started = datetime.now(UTC)
    connection.execute("BEGIN IMMEDIATE")
    try:
        migration.apply(connection, context)
        elapsed_ms = int((datetime.now(UTC) - started).total_seconds() * 1000)
        connection.execute(
            f"INSERT INTO {MIGRATIONS_TABLE} "  # noqa: S608
            "(app, version, name, checksum, applied_at, duration_ms) VALUES (?, ?, ?, ?, ?, ?)",
            (context.app, migration.version, migration.name, migration.checksum, _iso_now(), elapsed_ms),
        )
        connection.commit()
        return elapsed_ms
    except BaseException:
        connection.rollback()
        raise


def run_migrations(
    *,
    database_path: Path,
    app: str,
    migrations: Iterable[Migration],
    create_schema: Callable[[], None],
    data_dir: Path | None = None,
    mode: str = "auto",
    backup_dir: Path | None = None,
    logger: logging.Logger | None = None,
) -> MigrationReport:
    """按模式把数据库带到最新版本。

    - auto：需要时建库/补基线/执行迁移；失败抛 SchemaMigrationError。
    - check：只读探测；有待执行迁移时抛 MigrationPending，不写库。
    - off：直接返回当前状态，不做任何写操作（仅测试/紧急逃生）。
    """
    normalized_mode = _validate_mode(mode)
    migration_list = tuple(sorted(migrations, key=lambda item: item.version))
    _assert_migration_versions(migration_list)
    latest = _latest_version(migration_list)
    log = logger or LOGGER
    database_path = database_path.resolve()
    data_dir = (data_dir or database_path.parent).resolve()
    backup_dir = (backup_dir or data_dir / "backups" / "schema").resolve()
    lock_path = database_path.with_name(database_path.name + MIGRATION_LOCK_SUFFIX)
    lock_path.parent.mkdir(parents=True, exist_ok=True)

    with locked_file(lock_path):
        fresh = not database_path.is_file() or database_path.stat().st_size == 0
        if fresh:
            if normalized_mode == "check":
                raise MigrationPending(
                    f"{app} 数据库尚未创建；待执行迁移："
                    + ", ".join(str(item.version) for item in migration_list)
                )
            if normalized_mode == "off":
                return MigrationReport(
                    app, database_path, normalized_mode, True, False, 0, 0, (),
                    tuple(item.version for item in migration_list), None,
                )
            create_schema()
            with closing(sqlite3.connect(database_path)) as connection:
                connection.execute("PRAGMA journal_mode=WAL")
                ensure_migrations_table(connection)
                _stamp_baseline(connection, app)
            log.info("已按 ORM 元数据创建空库并写入基线：%s", database_path)
        elif normalized_mode == "off":
            return MigrationReport(app, database_path, normalized_mode, False, False, 0, 0, (), (), None)

        with closing(sqlite3.connect(database_path)) as connection:
            connection.execute("PRAGMA foreign_keys=ON")
            connection.execute("PRAGMA busy_timeout=5000")
            if normalized_mode == "check" and not migrations_table_exists(connection):
                if has_business_tables(connection):
                    raise MigrationPending(f"{app} 旧库缺少迁移版本表；请以 auto 模式启动一次。")
                raise MigrationPending(f"{app} 数据库没有版本表；请以 auto 模式启动一次。")
            ensure_migrations_table(connection)
            applied = read_applied(connection, app)
            adopted = False
            if not applied:
                if has_business_tables(connection):
                    if normalized_mode == "check":
                        raise MigrationPending(f"{app} 旧库缺少迁移版本表；请以 auto 模式启动一次。")
                    _stamp_baseline(connection, app)
                    adopted = True
                    log.warning("检测到未版本化的旧库，已接管为基线：%s", database_path)
                else:
                    _stamp_baseline(connection, app)
            else:
                for version, (name, checksum) in applied.items():
                    migration = next((item for item in migration_list if item.version == version), None)
                    if migration is None:
                        if version <= BASELINE_VERSION:
                            continue
                        raise SchemaMigrationError(
                            f"数据库记录的迁移版本 {version}（{name}）在当前代码中不存在；拒绝启动。"
                        )
                    if checksum != migration.checksum:
                        raise SchemaMigrationError(
                            f"迁移 {version}（{name}）的 checksum 与数据库记录不一致；"
                            "说明代码被改动但版本号未递增。"
                        )
                current_now = max(applied)
                if current_now > latest:
                    raise SchemaMigrationError(
                        f"数据库版本 {current_now} 高于当前程序支持的 {latest}；请升级程序后再启动。"
                    )

            current_version = max(read_applied(connection, app), default=BASELINE_VERSION)
            pending = tuple(item for item in migration_list if item.version not in applied)
            if normalized_mode == "check":
                if pending:
                    raise MigrationPending(
                        f"{app} 待执行迁移：" + ", ".join(str(item.version) for item in pending)
                    )
                _integrity_check(connection)
                return MigrationReport(
                    app, database_path, normalized_mode, fresh, adopted,
                    current_version, current_version, (), (), None,
                )

            backup_path: Path | None = None
            if pending and not fresh and has_business_tables(connection):
                connection.commit()
                backup_path = backup_database(database_path, backup_dir)
                prune_backups(backup_dir, database_path.stem)
                log.warning("迁移前已生成数据库快照：%s", backup_path)

            context = MigrationContext(app=app, database_path=database_path, data_dir=data_dir, logger=log)
            applied_now: list[int] = []
            for migration in pending:
                log.info("应用数据库迁移 %s v%s：%s", app, migration.version, migration.name)
                _apply_one(connection, migration, context)
                applied_now.append(migration.version)
            if applied_now:
                _integrity_check(connection)
                connection.execute(f"PRAGMA user_version = {max(applied_now)}")
                connection.commit()
            to_version = max(read_applied(connection, app), default=BASELINE_VERSION)
            return MigrationReport(
                app=app,
                database_path=database_path,
                mode=normalized_mode,
                fresh=fresh,
                adopted=adopted,
                from_version=current_version,
                to_version=to_version,
                applied=tuple(applied_now),
                pending=tuple(item.version for item in pending if item.version not in applied_now),
                backup_path=backup_path,
            )
