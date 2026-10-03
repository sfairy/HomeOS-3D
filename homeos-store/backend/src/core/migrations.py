"""启动时的数据库迁移。

与主应用 ``homeos-3d/backend/src/migrations.py`` 同一套约定（锁 → 备份 → upgrade）。
"""
from __future__ import annotations

import logging
import sqlite3
from datetime import UTC, datetime
from pathlib import Path

from alembic import command
from alembic.config import Config
from alembic.script import ScriptDirectory

from .file_lock import locked_file
from ..config import StoreSettings

logger = logging.getLogger("src.migrations")

MIGRATION_LOCK_SUFFIX = ".migrate.lock"
MIGRATION_BACKUP_LABEL = "migrate"
MIGRATION_BACKUP_KEEP = 3


class MigrationBackupError(RuntimeError):
    """迁移前的快照写不出来，因此拒绝继续迁移。"""


class LegacyDatabaseError(RuntimeError):
    """库是压缩基线之前的老结构，不能直升，也不会被自动改写。"""


def _migration_config(settings: StoreSettings) -> Config:
    """构造 Alembic 配置：脚本目录与数据库 URL 都从 Settings 推导。
    """
    config = Config(str(settings.project_root / "alembic.ini"))
    config.set_main_option("script_location", str(settings.project_root / "db" / "migrations"))
    config.set_main_option("sqlalchemy.url", settings.database_url)
    return config


def _head_revision(config: Config) -> str:
    """当前脚本目录的 head revision。"""
    return str(ScriptDirectory.from_config(config).get_current_head())


def _has_business_tables(connection: sqlite3.Connection) -> bool:
    """库里除 Alembic 自己的版本表之外，还有没有别的表。"""
    row = connection.execute(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' "
        "AND name != 'alembic_version' LIMIT 1"
    ).fetchone()
    return row is not None


def _recorded_revision(database_path: Path) -> str | None:
    """读取库内记录的 revision。

    ``None`` 表示全新安装（没有库文件，或文件里连业务表都没有）；``"unversioned"`` 表示
    Alembic 之前的老结构（有业务表，却没有 alembic_version 记录）。
    """
    if not database_path.is_file() or database_path.stat().st_size == 0:
        return None
    with sqlite3.connect(f"file:{database_path}?mode=ro", uri=True) as connection:
        table = connection.execute(
            "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'alembic_version'"
        ).fetchone()
        if table is None:
            return "unversioned" if _has_business_tables(connection) else None
        row = connection.execute("SELECT version_num FROM alembic_version LIMIT 1").fetchone()
        if row:
            return str(row[0])
        return "unversioned" if _has_business_tables(connection) else None


def _set_recorded_revision(database_path: Path, revision: str) -> None:
    """直接改写 ``alembic_version``。

    库内记录的旧 revision 已不在脚本目录里，``alembic stamp`` 会因为解析不了它而失败，所以这里
    只改那一行记录 —— 前提是调用方已经确认过库结构与 ORM 一致（见 :func:`_schema_matches_orm`）。
    """
    with sqlite3.connect(database_path) as connection:
        connection.execute("DELETE FROM alembic_version")
        connection.execute("INSERT INTO alembic_version (version_num) VALUES (?)", (revision,))
        connection.commit()


def _script_knows_revision(config: Config, revision: str) -> bool:
    """当前脚本目录里是否存在这个 revision。"""
    try:
        ScriptDirectory.from_config(config).get_revision(revision)
        return True
    except Exception:
        return False


def _schema_matches_orm(settings: StoreSettings) -> bool:
    """库结构是否已满足 ORM 元数据（只查「缺表 / 缺列 / 缺索引」，多出来的历史对象不算差异）。

    结构链压缩后，老链末端建出来的库与本基线 ``0001`` 在 ORM 口径上是同一个结构，只是
    ``alembic_version`` 记录还停在旧编号。这种情况可以安全接管：只改记录、不动结构。
    """
    from .database import Database
    from ..security.schema_guard import inspect_schema

    database = Database(settings)
    try:
        return inspect_schema(database.engine).clean
    finally:
        database.dispose()


def _legacy_error(revision: str) -> LegacyDatabaseError:
    return LegacyDatabaseError(
        f"数据库记录的是压缩基线之前的迁移版本（{revision}），且结构与当前 ORM 不一致："
        "当前版本只保留了 0001 基线，不能从老库直接升级，也不会自动改写老结构。请从数据目录里的 "
        "store.db.pre-migrate-*.bak 快照恢复，或先用旧版本导出数据后再在全新安装上导入。"
    )


def backup_database(database_path: Path) -> Path | None:
    """迁移前留一份可还原的快照；库文件不存在时返回 None。
    """
    if not database_path.is_file() or database_path.stat().st_size == 0:
        return None
    stamp = datetime.now(UTC).strftime("%Y%m%d-%H%M%S")
    destination = database_path.parent / f"{database_path.name}.pre-{MIGRATION_BACKUP_LABEL}-{stamp}.bak"
    suffix = 1
    while destination.exists():
        destination = (
            database_path.parent
            / f"{database_path.name}.pre-{MIGRATION_BACKUP_LABEL}-{stamp}-{suffix}.bak"
        )
        suffix += 1

    connection = sqlite3.connect(database_path, isolation_level=None)
    try:
        connection.execute("VACUUM INTO ?", (str(destination),))
    except sqlite3.Error as error:
        destination.unlink(missing_ok=True)
        raise MigrationBackupError(
            f"迁移前备份数据库失败（{database_path} → {destination}）：{error}。"
            "为免在没有退路的情况下改动库结构，本次启动已中止；"
            "请确认该目录可写后重试。"
        ) from error
    finally:
        connection.close()
    logger.warning("改动库结构前已备份数据库：%s（确认结果无误后可自行删除）", destination)
    return destination


def prune_database_backups(
    database_path: Path,
    keep: int = MIGRATION_BACKUP_KEEP,
) -> list[Path]:
    """删掉同库同标签的旧快照，只留最近 ``keep`` 份；返回被删掉的路径。
    """
    pattern = f"{database_path.name}.pre-{MIGRATION_BACKUP_LABEL}-*.bak"
    existing = sorted(database_path.parent.glob(pattern))
    removed: list[Path] = []
    for stale in existing[: max(0, len(existing) - keep)]:
        try:
            stale.unlink()
        except OSError as error:
            logger.warning("迁移前的旧快照删不掉（不影响本次迁移）：%s（%s）", stale, error)
            continue
        removed.append(stale)
    return removed


def run_migrations(settings: StoreSettings) -> list[str]:
    """把数据库带到 head 结构（串行化 + 动结构前留快照），返回本次做过的事。
    """
    database_path = settings.database_path
    lock_path = database_path.parent / f"{database_path.name}{MIGRATION_LOCK_SUFFIX}"
    performed: list[str] = []

    with locked_file(lock_path):
        config = _migration_config(settings)
        recorded = _recorded_revision(database_path)
        head = _head_revision(config)

        if recorded == "unversioned":
            raise LegacyDatabaseError(
                "数据库是老版本的旧结构：库里已经有业务表，却没有 alembic_version 记录。"
                "当前版本只支持全新安装的 0001 基线，不能从老库直接升级，也不会自动改写老结构。"
                "请先备份数据目录；需要保留数据时，用旧版本启动导出数据后，再在全新安装上导入。"
            )

        if recorded != head:
            known = recorded is not None and _script_knows_revision(config, recorded)
            if recorded is not None and not known and not _schema_matches_orm(settings):
                raise _legacy_error(str(recorded))
            backup_database(database_path)
            prune_database_backups(database_path)
            if recorded is None or known:
                command.upgrade(config, "head")
                performed.append(f"应用迁移 {recorded} → {head}")
            else:
                _set_recorded_revision(database_path, head)
                if _recorded_revision(database_path) != head:
                    raise LegacyDatabaseError(f"改写版本记录失败：仍读到 {_recorded_revision(database_path)!r}")
                performed.append(f"接管压缩前的版本记录 {recorded} → {head}（结构已与 ORM 一致，只改记录）")

    return performed
