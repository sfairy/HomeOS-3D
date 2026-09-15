"""启动时的数据库迁移。

本项目按首个发布版本维护，只有一条基线迁移（0001），
因此这里不做升级前备份与失败回滚，只处理「库内记录了已下线的 revision」这一种情况。
"""
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
    """构造 Alembic 配置：脚本目录与数据库 URL 都从 Settings 推导。

    显式覆盖 script_location 与 sqlalchemy.url，让迁移不依赖当前工作目录，
    也不依赖 alembic.ini 里可能被改动的默认值。
    """
    config = Config(settings.project_root / 'alembic.ini')
    config.set_main_option('script_location', str(settings.project_root / 'migrations'))
    config.set_main_option('sqlalchemy.url', settings.database_url)
    return config


def _recorded_revision(database_path: Path) -> str | None:
    """读取库内记录的 revision；库里没有版本表时返回 None。

    用只读 URI 打开，避免在校验阶段意外创建或修改数据库文件
    （库文件不存在时 sqlite3.connect 默认会新建）。
    """
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
