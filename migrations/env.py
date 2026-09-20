from __future__ import annotations

from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

from backend.app.database import Base
from backend.app import models  # noqa: F401 - registers the mapped tables

config = context.config

if config.config_file_name is not None:
    # ``disable_existing_loggers=False`` 是**承重**的，不是风格选择。
    #
    # 默认值是 True，而 ``fileConfig`` 会把「此刻已经存在、又没写进 alembic.ini 的
    # logger」逐个置 ``disabled = True`` —— 我们恰恰是在**应用进程内**跑迁移的
    # （``backend/app/migrations.py`` 的 ``run_migrations`` 在启动时调用），此时应用
    # 各模块在 import 阶段创建的 logger 全都已经存在，于是启动一次迁移就把它们
    # **永久静默**：``logger.warning(...)`` 从此什么都不写，全局日志也跟着空掉
    # （日志记录在 ``logger.isEnabledFor`` 就被挡掉了，handler 再对也没用）。
    #
    # 症状是「日志整个消失」而不是报错，只在「迁移之前先创建一个 logger、迁移之后
    # 再问它还能不能用」这种观测下才看得见 —— 改动这一行后请手工这样验一遍：
    # 仓库已没有自动化闸门能替你发现它。
    fileConfig(config.config_file_name, disable_existing_loggers=False)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
