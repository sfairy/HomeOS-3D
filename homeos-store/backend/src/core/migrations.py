"""启动时的数据库迁移。

与主应用 ``homeos-3d/backend/src/core/migrations.py`` 同一套约定（锁 → 备份 → upgrade），
外加一步商店独有的**存量库认领**：

商店在引入 Alembic 之前，库结构由 ``create_all()`` + ``ensure_schema()`` 建成，库里
没有 ``alembic_version``。这种库不能直接 ``upgrade head`` —— 基线会试图重建已存在的表。
所以：只要发现「库里有业务表、却没有版本表」，就先把它 ``stamp`` 成基线 revision
（认领为「结构等于基线」），再往后应用增量。存量库里多出来的历史列/索引由
``0002`` 负责清理。
"""
from __future__ import annotations

import logging
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from alembic import command
from alembic.config import Config
from alembic.script import ScriptDirectory

from . import models  # noqa: F401 - 副作用导入：把 ORM 表注册进 Base.metadata
from .database import Base
from .file_lock import locked_file
from ..config import StoreSettings

logger = logging.getLogger("src.migrations")

#: 迁移锁文件名（与库文件同目录）。内核在进程结束时自动释放，因此进程被 kill 之后
#: 不会留下需要人工清理的「死锁」。
MIGRATION_LOCK_SUFFIX = ".migrate.lock"
#: 迁移前快照的标签，出现在文件名里（``<库名>.pre-<标签>-<时间戳>.bak``）。
MIGRATION_BACKUP_LABEL = "migrate"
#: 同库同标签只留最近这几份快照。
MIGRATION_BACKUP_KEEP = 3


class MigrationBackupError(RuntimeError):
    """迁移前的快照写不出来，因此拒绝继续迁移。"""


class UnknownRevisionError(RuntimeError):
    """库内 revision 不在当前脚本目录中（说明代码回退到了更早的版本）。"""


def _migration_config(settings: StoreSettings) -> Config:
    """构造 Alembic 配置：脚本目录与数据库 URL 都从 Settings 推导。
    """
    config = Config(str(settings.project_root / "alembic.ini"))
    config.set_main_option("script_location", str(settings.project_root / "db" / "migrations"))
    config.set_main_option("sqlalchemy.url", settings.database_url)
    return config


def _known_revisions(config: Config) -> set[str]:
    """取出脚本目录里全部已知 revision。"""
    return {script.revision for script in ScriptDirectory.from_config(config).walk_revisions()}


def _head_revision(config: Config) -> str:
    """当前脚本目录的 head revision。"""
    return str(ScriptDirectory.from_config(config).get_current_head())


def _baseline_revision(config: Config) -> str:
    """基线 revision：整条链上 ``down_revision`` 为空的那个（即 ``0001``）。
    """
    for script in ScriptDirectory.from_config(config).walk_revisions():
        if not script.down_revision:
            return str(script.revision)
    raise RuntimeError("迁移脚本目录里没有基线 revision（找不到 down_revision 为空的脚本）。")


def _recorded_revision(database_path: Path) -> str | None:
    """读取库内记录的 revision；库文件不存在或没有版本表时返回 None。
    """
    #: 全新安装时库文件都还不存在，而 ``mode=ro`` 打不开不存在的文件 —— 这里先挡一道，
    #: 否则「第一次启动」会以一个「无法打开数据库」的报错收场，而不是正常建库。
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


def _has_application_tables(database_path: Path) -> bool:
    """库里是否已有本应用的业务表（用于识别「Alembic 之前建的老库」）。
    """
    if not database_path.is_file() or database_path.stat().st_size == 0:
        return False
    expected = set(Base.metadata.tables)
    with sqlite3.connect(f"file:{database_path}?mode=ro", uri=True) as connection:
        rows = connection.execute(
            "SELECT name FROM sqlite_master WHERE type = 'table'"
        ).fetchall()
    return any(name in expected for (name,) in rows)


def backup_database(database_path: Path) -> Path | None:
    """迁移前留一份可还原的快照；库文件不存在时返回 None。
    """
    if not database_path.is_file() or database_path.stat().st_size == 0:
        return None
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    destination = database_path.parent / f"{database_path.name}.pre-{MIGRATION_BACKUP_LABEL}-{stamp}.bak"
    #: 同一秒内的第二次备份会撞上这个名字，而 ``VACUUM INTO`` 撞名是**直接报错**的。
    suffix = 1
    while destination.exists():
        destination = (
            database_path.parent
            / f"{database_path.name}.pre-{MIGRATION_BACKUP_LABEL}-{stamp}-{suffix}.bak"
        )
        suffix += 1

    # isolation_level=None（autocommit）：VACUUM 不能在事务里执行。
    connection = sqlite3.connect(database_path, isolation_level=None)
    try:
        connection.execute("VACUUM INTO ?", (str(destination),))
    except sqlite3.Error as error:
        #: 半截文件比没有文件更危险（文件名、大小都像那么回事），先删掉再报错。
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
    #: 锁与库文件同目录：从读 revision 到 upgrade 结束是一段「只能一个人做」的临界区。
    lock_path = database_path.parent / f"{database_path.name}{MIGRATION_LOCK_SUFFIX}"
    performed: list[str] = []

    with locked_file(lock_path):
        config = _migration_config(settings)
        recorded = _recorded_revision(database_path)
        known = _known_revisions(config)
        if recorded is not None and recorded not in known:
            raise UnknownRevisionError(
                f"数据库 revision「{recorded}」不在当前迁移脚本中（已知：{sorted(known)}）。"
                "这通常意味着代码回退到了更早的版本；请用对应版本的代码启动，"
                "或从迁移前的快照恢复数据库。"
            )

        head = _head_revision(config)
        baseline = _baseline_revision(config)
        #: 存量库（有业务表、没有版本表）需要先被「认领」成基线，不能重放基线。
        adoption = recorded is None and _has_application_tables(database_path)
        structure_changes = adoption or recorded != head

        #: 备份必须先于**任何**结构改动，且只做一次：认领（stamp）本身也会写 alembic_version。
        if structure_changes:
            backup_database(database_path)
            prune_database_backups(database_path)

        if adoption:
            command.stamp(config, baseline)
            recorded = baseline
            performed.append(f"认领存量库为基线 {baseline}")

        if recorded != head:
            command.upgrade(config, "head")
            performed.append(f"应用迁移 {recorded} → {head}")

    return performed
