from __future__ import annotations

import sys
from logging.config import fileConfig
from pathlib import Path

# ``homeos-3d/db/migrations`` → 把 ``backend`` 放进 path，才能 ``import src``。
_BACKEND = Path(__file__).resolve().parents[2] / "backend"
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

from alembic import context
from sqlalchemy import engine_from_config, pool

#: 副作用导入：必须导入到，否则 ORM 映射表不会注册进 ``Base.metadata``，
#: ``alembic check`` 会以为那些表是「库里多出来的」而生成删除迁移。
from src.core import models  # noqa: F401  # pyright: ignore[reportUnusedImport]
from src.core.database import BUSY_TIMEOUT_SECONDS, Base

config = context.config

if config.config_file_name is not None:
    # ``disable_existing_loggers=False`` 是**承重**的，不是风格选择。
    fileConfig(config.config_file_name, disable_existing_loggers=False)

target_metadata = Base.metadata


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
        #: 迁移期间可能还有别的进程在读写同一个库文件。没有等待上限时一次锁冲突就直接
        #: 报 "database is locked"，把一次可自愈的启动变成起不来。
        connect_args={"timeout": BUSY_TIMEOUT_SECONDS},
    )
    with connectable.connect() as connection:
        #: **显式关掉外键强制**，这是迁移连接与运行期连接的关键差别：迁移里会用
        #: ``batch_alter_table`` 重建表（CREATE 新表 → 拷数据 → DROP 旧表 → RENAME），
        #: 开着外键时 DROP 会按 CASCADE 连带删掉子表数据 —— 那是不可逆的数据损失。
        connection.exec_driver_sql("PRAGMA foreign_keys=OFF")
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()
        #: **这一行是承重的。** SQLite 的 ``transactional_ddl`` 是 False，于是
        #: ``begin_transaction()`` 返回的是 ``nullcontext()`` —— 那个 with 块什么都没管。
        #: ``upgrade`` 之所以能落库，是因为它逐条迁移时走的是
        #: ``begin_transaction(_per_migration=True)``（那条路径会真的开事务并提交）；
        #: 而 ``stamp`` 不经过那条路径，它写 alembic_version 用的是连接的隐式事务，
        #: 出了 ``with connection`` 就被回滚 —— 表现为「stamp 报成功、库里版本表却是空的」。
        #: 本仓库目前只在启动时 ``upgrade``，所以还没踩到；显式提交一次把两条路径拉平。
        connection.commit()


# 只支持在线模式。alembic 的离线模式（``--sql``：不连库、只打印 SQL）在这里没有调用方：
if context.is_offline_mode():
    raise RuntimeError(
        "本仓库不支持 alembic 离线模式（--sql）：迁移只在应用内以在线方式执行"
        "（见 backend/src/core/migrations.py）。"
    )
run_migrations_online()
