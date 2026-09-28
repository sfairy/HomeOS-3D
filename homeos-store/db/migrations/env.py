"""Alembic 环境：把商店 ORM 元数据接到迁移脚本上。

与主应用的 ``homeos-3d/db/migrations/env.py`` 保持同一套约定：只支持在线模式，
迁移只在应用内执行（见 ``backend/src/core/migrations.py``），不提供 ``--sql``。
"""
from __future__ import annotations

import sys
import warnings
from logging.config import fileConfig
from pathlib import Path

# ``homeos-store/db/migrations`` → 把 ``backend`` 放进 path，才能 ``import src``。
_BACKEND = Path(__file__).resolve().parents[2] / "backend"
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

from alembic import context
from sqlalchemy import engine_from_config, pool
from sqlalchemy.exc import SAWarning
from src.core import (
    models,  # noqa: F401 - registers the mapped tables
    models_engagement,  # noqa: F401 - registers the mapped tables
)
from src.core.database import BUSY_TIMEOUT_SECONDS, Base

config = context.config

if config.config_file_name is not None:
    # ``disable_existing_loggers=False`` 是**承重**的，不是风格选择：应用启动时就地跑迁移，
    # 默认的 fileConfig 会把已经装配好的 ``src`` logger 全部禁用，迁移日志与后续启动日志
    # 会一起消失。
    fileConfig(config.config_file_name, disable_existing_loggers=False)

target_metadata = Base.metadata

#: ``orders`` 与 ``licenses`` 互相持有外键（一笔订单产生一张授权，一张授权又指回它是被哪笔
#: 订单改过的），于是 alembic 建表前的拓扑排序无解，它会把这两张表涉及的外键排除在**结构比较**
#: 之外、并且每次运行都告警。这个环是刻意的建模选择（见 models.py 里 ``post_update`` 的说明），
#: 在 SQLite 上也没有出路：``use_alter=True`` 会把外键改写成
#: ``ALTER TABLE ... ADD CONSTRAINT``，而 SQLite 不支持这条语句。
#: 排序对 SQLite 本身无害 —— 建表时的前向引用不会被校验。所以这里只对这条**已知且已确认**的
#: 告警降噪，其余警告照常抛出（不要把它放宽成忽略整个 SAWarning 类别）。
warnings.filterwarnings("ignore", message=".*unresolvable cycles.*", category=SAWarning)


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
        #: 迁移期间可能有人在读写同一个库文件（例如另一个还在跑的旧进程）。没有等待上限时
        #: 一次锁冲突就直接报 "database is locked"，把一次可自愈的启动变成起不来。
        connect_args={"timeout": BUSY_TIMEOUT_SECONDS},
    )
    with connectable.connect() as connection:
        #: **显式关掉外键强制**，这是迁移连接与运行期连接的关键差别：0002 会用
        #: ``batch_alter_table`` 重建表（CREATE 新表 → 拷数据 → DROP 旧表 → RENAME），
        #: 开着外键时 DROP 会按 CASCADE 连带删掉子表数据 —— 那是不可逆的数据损失。
        #: 结构一致性由迁移脚本自己保证，不依赖这里的开关。
        connection.exec_driver_sql("PRAGMA foreign_keys=OFF")
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()
        #: **这一行是承重的。** SQLite 的 ``transactional_ddl`` 是 False，于是
        #: ``begin_transaction()`` 在上面这一步直接返回 ``nullcontext()``（除非是
        #: ``transaction_per_migration``）—— 也就是说那个 with 块什么都没管。
        #: ``upgrade`` 之所以能落库，是因为它内部逐条迁移时走的是
        #: ``begin_transaction(_per_migration=True)``（那条路径会真的开事务并提交）；
        #: 而 ``stamp`` **不经过那条路径**，它写 alembic_version 用的是连接的隐式事务，
        #: 出了 ``with connection`` 就被 SQLAlchemy 回滚 —— 表现为「stamp 报成功、
        #: 库里版本表却是空的」，紧接着 upgrade 会从基线重放，在存量库上直接
        #: ``table ... already exists`` 起不来。显式提交一次把两条路径拉平。
        connection.commit()


# 只支持在线模式。alembic 的离线模式（``--sql``：不连库、只打印 SQL）在这里没有调用方：
# 迁移由应用启动流程驱动，目标库路径也只有 StoreSettings 知道。多一条「打印 SQL 给人看」
# 的通道，就多一种「看起来迁移了、其实没落库」的可能。
if context.is_offline_mode():
    raise RuntimeError(
        "本仓库不支持 alembic 离线模式（--sql）：迁移只在应用内以在线方式执行"
        "（见 backend/src/core/migrations.py）。"
    )
run_migrations_online()
