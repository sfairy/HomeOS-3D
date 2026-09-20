"""启动时的数据库迁移。

本项目按首个发布版本维护，不再提供「从更早版本升级上来」的迁移链路：库里的 revision
若已下线，直接认领基线即可（结构本来就是基线形态）。

**但「只有一条基线」不等于「迁移一定没风险」（B37）**：``upgrade`` 会真的动库结构
（SQLite 的 DDL 在 Alembic 眼里还是「非事务性」的，半途失败不会自己回滚），而启动是
并发的（容器编排器可能同时拉起两个实例、运维也可能手滑双击），因此两条底线在这里补齐：
整段迁移串行化（文件锁）与动结构之前留一份可还原的快照。
"""
from __future__ import annotations

import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from alembic import command
from alembic.config import Config
from alembic.script import ScriptDirectory

from ..config import Settings
from .file_lock import locked_file

#: 唯一的基线迁移。更早的 0001-0015 已合并到它，项目按首个发布版本维护，
#: 不再提供「从更早版本升级上来」的迁移链路。
BASE_REVISION = '0001'
#: 迁移锁文件名（与库文件同目录）。内核在进程结束时自动释放，因此进程被 kill 之后
#: 不需要任何清理动作，下一次启动照样能拿到锁。
MIGRATION_LOCK_SUFFIX = '.migrate.lock'
#: 迁移前快照的标签，出现在文件名里（``<库名>.pre-<标签>-<时间戳>.bak``）。
MIGRATION_BACKUP_LABEL = 'migrate'


class MigrationBackupError(RuntimeError):
    """迁移前的快照写不出来，因此拒绝继续迁移。"""


def _migration_config(settings: Settings) -> Config:
    """构造 Alembic 配置：脚本目录与数据库 URL 都从 Settings 推导。

    显式覆盖 script_location 与 sqlalchemy.url，让迁移不依赖当前工作目录，
    也不依赖 alembic.ini 里可能被改动的默认值。
    """
    config = Config(settings.project_root / 'alembic.ini')
    config.set_main_option('script_location', str(settings.project_root / 'migrations'))
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


def backup_database(database_path: Path) -> Path | None:
    """迁移前留一份可还原的快照；库文件不存在时返回 None。

    用 ``VACUUM INTO`` 而不是 ``shutil.copy2``：库跑在 WAL 模式下（见 ``database.Database``），
    新写入的行先在 ``<库名>-wal`` 里，checkpoint 之前主库文件可能还是「一张表都没有」的状态 ——
    直接复制会得到一份打不开的空壳 ``.bak``，而它看起来完全正常（文件名对、大小不为零）。
    这是最坏的一类保险：「以为有备份」比「知道自己没有备份」危险得多。

    快照写不出来时抛 ``MigrationBackupError``，此时**不继续迁移** —— 迁移会改库结构，
    没有退路的改动宁可不做。
    """
    if not database_path.is_file() or database_path.stat().st_size == 0:
        return None
    stamp = datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')
    destination = database_path.parent / f'{database_path.name}.pre-{MIGRATION_BACKUP_LABEL}-{stamp}.bak'
    # isolation_level=None（autocommit）：VACUUM 不能在事务里执行，
    # 而 sqlite3 模块默认会为部分语句隐式开事务。
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


def run_migrations(settings: Settings) -> None:
    """把数据库带到基线结构（串行化 + 动结构前留快照）。

    唯一需要照顾的升级情况是库由更早的构建创建、alembic_version 里还写着已下线的 revision ——
    那种库的结构已经是基线形态，直接认领基线即可，否则启动会因「找不到该 revision」而失败。
    这一步不读写任何业务数据。需要真的动结构但快照写不出来时抛 ``MigrationBackupError``。
    """
    database_path = settings.database_path
    # 锁与库文件同目录：从读 revision 到 upgrade 结束是一段「只能一个人做」的临界区。
    # 两个实例同时启动时，先到者迁移、后到者等它做完再照常往下走（此时已是最新结构）。
    with locked_file(database_path.parent / f'{database_path.name}{MIGRATION_LOCK_SUFFIX}'):
        config = _migration_config(settings)
        recorded = (
            _recorded_revision(database_path)
            if database_path.is_file() and database_path.stat().st_size > 0
            else None
        )
        known = _known_revisions(config)
        if recorded is not None and recorded not in known:
            # purge 必须先清掉未知的 revision 记录，否则 stamp 自己也会去解析它。
            command.stamp(config, BASE_REVISION, purge=True)
            recorded = BASE_REVISION
        # 只有真的要动结构才备份：每次启动都复制一份库，很快就变成一个没人清理的
        # 「快照垃圾场」，而真正需要的那一份反而会被淹没。
        if recorded != _head_revision(config):
            backup_database(database_path)
        command.upgrade(config, 'head')
    return None
