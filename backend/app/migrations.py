from __future__ import annotations

import sqlite3
from pathlib import Path

from alembic import command
from alembic.config import Config
from alembic.script import ScriptDirectory

from .config import Settings

#: 唯一的基线迁移。更早的 0001-0015 已合并到它，项目按首个发布版本维护，
#: 不再提供「从更早版本升级上来」的迁移链路。
BASE_REVISION = '0001'


def _migration_config(settings: Settings) -> Config:
    config = Config(settings.project_root / 'alembic.ini')
    config.set_main_option('script_location', str(settings.project_root / 'migrations'))
    config.set_main_option('sqlalchemy.url', settings.database_url)
    return config


def _recorded_revision(database_path: Path) -> str | None:
    """读取库内记录的 revision；库里没有版本表时返回 None。"""
    with sqlite3.connect(f'file:{database_path}?mode=ro', uri=True) as connection:
        table = connection.execute(
            "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'alembic_version'"
        ).fetchone()
        if table is None:
            return None
        row = connection.execute('SELECT version_num FROM alembic_version LIMIT 1').fetchone()
    return str(row[0]) if row else None


def run_migrations(settings: Settings) -> None:
    """把数据库带到基线结构。

    不做升级前备份与失败回滚：项目只有一条基线迁移，没有可回退的历史版本。
    唯一需要照顾的情况是库由更早的构建创建、alembic_version 里还写着已下线的
    revision —— 那种库的结构已经是基线形态，直接认领基线即可，否则启动就会因
    「找不到该 revision」而失败。这一步不读写任何业务数据。
    """
    config = _migration_config(settings)
    database_path = settings.database_path
    if database_path.is_file() and database_path.stat().st_size > 0:
        recorded = _recorded_revision(database_path)
        known = {
            script.revision for script in ScriptDirectory.from_config(config).walk_revisions()
        }
        if recorded is not None and recorded not in known:
            # purge 必须先清掉未知的 revision 记录，否则 stamp 自己也会去解析它。
            command.stamp(config, BASE_REVISION, purge=True)
    command.upgrade(config, 'head')
    return None
