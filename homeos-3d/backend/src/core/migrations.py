"""启动时的数据库迁移。
"""
from __future__ import annotations

import logging
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from alembic import command
from alembic.config import Config
from alembic.script import ScriptDirectory

from ..config import Settings
from .file_lock import locked_file

#: 迁移锁文件名（与库文件同目录）。内核在进程结束时自动释放，因此进程被 kill 之后
MIGRATION_LOCK_SUFFIX = '.migrate.lock'
#: 迁移前快照的标签，出现在文件名里（``<库名>.pre-<标签>-<时间戳>.bak``）。
MIGRATION_BACKUP_LABEL = 'migrate'
#: 同库同标签只留最近这几份快照。
MIGRATION_BACKUP_KEEP = 3

_logger = logging.getLogger(__name__)


class MigrationBackupError(RuntimeError):
    """迁移前的快照写不出来，因此拒绝继续迁移。"""


class UnknownRevisionError(RuntimeError):
    """库内 revision 不在当前脚本目录中（需删库重建）。"""


def _migration_config(settings: Settings) -> Config:
    """构造 Alembic 配置：脚本目录与数据库 URL 都从 Settings 推导。
    """
    config = Config(settings.project_root / 'alembic.ini')
    config.set_main_option('script_location', str(settings.project_root / 'db' / 'migrations'))
    config.set_main_option('sqlalchemy.url', settings.database_url)
    return config


def _known_revisions(config: Config) -> set[str]:
    """取出脚本目录里全部已知 revision。"""
    return {script.revision for script in ScriptDirectory.from_config(config).walk_revisions()}


def _head_revision(config: Config) -> str:
    """当前脚本目录的 head revision。"""
    return str(ScriptDirectory.from_config(config).get_current_head())


def _recorded_revision(database_path: Path) -> str | None:
    """读取库内记录的 revision；库里没有版本表时返回 None。
    """
    with sqlite3.connect(f'file:{database_path}?mode=ro', uri=True) as connection:
        table = connection.execute(
            "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'alembic_version'"
        ).fetchone()
        if table is None:
            return None
        row = connection.execute('SELECT version_num FROM alembic_version LIMIT 1').fetchone()
    return str(row[0]) if row else None


def backup_database(database_path: Path) -> Path | None:
    """迁移前留一份可还原的快照；库文件不存在时返回 None。
    """
    if not database_path.is_file() or database_path.stat().st_size == 0:
        return None
    stamp = datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')
    destination = database_path.parent / f'{database_path.name}.pre-{MIGRATION_BACKUP_LABEL}-{stamp}.bak'
    # isolation_level=None（autocommit）：VACUUM 不能在事务里执行，
    connection = sqlite3.connect(database_path, isolation_level=None)
    try:
        connection.execute('VACUUM INTO ?', (str(destination),))
    except sqlite3.Error as error:
        # 半截文件比没有文件更危险（文件名、大小都像那么回事），先删掉再报错。
        destination.unlink(missing_ok=True)
        raise MigrationBackupError(
            f'迁移前备份数据库失败（{database_path} → {destination}）：{error}。'
            '为免在没有退路的情况下改动库结构，本次启动已中止；'
            '请确认该目录可写后重试。'
        ) from error
    finally:
        connection.close()
    return destination


def prune_database_backups(
    database_path: Path,
    keep: int = MIGRATION_BACKUP_KEEP,
) -> list[Path]:
    """删掉同库同标签的旧快照，只留最近 ``keep`` 份；返回被删掉的路径。
    """
    pattern = f'{database_path.name}.pre-{MIGRATION_BACKUP_LABEL}-*.bak'
    existing = sorted(database_path.parent.glob(pattern))
    removed: list[Path] = []
    for stale in existing[: max(0, len(existing) - keep)]:
        try:
            stale.unlink()
        except OSError as error:
            _logger.warning('迁移前的旧快照删不掉（不影响本次迁移）：%s（%s）', stale, error)
            continue
        removed.append(stale)
    return removed


def run_migrations(settings: Settings) -> None:
    """把数据库带到基线结构（串行化 + 动结构前留快照）。
    """
    database_path = settings.database_path
    # 锁与库文件同目录：从读 revision 到 upgrade 结束是一段「只能一个人做」的临界区。
    with locked_file(database_path.parent / f'{database_path.name}{MIGRATION_LOCK_SUFFIX}'):
        config = _migration_config(settings)
        recorded = (
            _recorded_revision(database_path)
            if database_path.is_file() and database_path.stat().st_size > 0
            else None
        )
        known = _known_revisions(config)
        if recorded is not None and recorded not in known:
            raise UnknownRevisionError(
                f'数据库 revision「{recorded}」不在当前迁移脚本中（已知：{sorted(known)}）。'
                '本项目仅支持从空库建立唯一基线；请备份后删除数据库文件再启动。'
            )
        # 只有真的要动结构才备份：每次启动都复制一份库，很快就变成一个没人清理的
        if recorded != _head_revision(config):
            backup_database(database_path)
            # 剪枝排在新快照**写成功之后**：顺序反了会在「新快照写不出来」的那次启动里
            prune_database_backups(database_path)
        command.upgrade(config, 'head')
    return None
