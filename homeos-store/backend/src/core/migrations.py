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


def _recorded_revision(database_path: Path) -> str | None:
    """读取库内记录的 revision；库文件不存在或没有版本表时返回 None。
    """
    if not database_path.is_file() or database_path.stat().st_size == 0:
        return None
    with sqlite3.connect(f"file:{database_path}?mode=ro", uri=True) as connection:
        table = connection.execute(
            "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'alembic_version'"
        ).fetchone()
        if table is None:
            return None
        row = connection.execute("SELECT version_num FROM alembic_version LIMIT 1").fetchone()
    return str(row[0]) if row else None


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

        if recorded != head:
            backup_database(database_path)
            prune_database_backups(database_path)
            command.upgrade(config, "head")
            performed.append(f"应用迁移 {recorded} → {head}")

    return performed
