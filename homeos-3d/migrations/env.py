from __future__ import annotations

from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

from backend.src.database import Base
from backend.src import models  # noqa: F401  # 确保模型注册到 Base.metadata  # pyright: ignore[reportUnusedImport]

# Alembic Config 对象，对应 alembic.ini 里的取值。
config = context.config

# 有配置文件时按它初始化日志。
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# autogenerate 需要比对的目标元数据。
target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """离线模式：只需要一个 URL，不需要真正的连接。"""
    url = config.get_main_option('sqlalchemy.url')
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={'paramstyle': 'named'},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """在线模式：建连接后按事务跑迁移。"""
    connectable = engine_from_config(
        config.get_section(config.config_ini_section),
        prefix='sqlalchemy.',
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
