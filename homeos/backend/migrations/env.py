"""Alembic 环境：从 Settings 推导 URL，目标元数据为 src.core.models 的全部模型。

脚本目录仅用于开发期生成/应用增量迁移；发行产物不带脚本时，启动流程走
``migrations.run_migrations`` 的 ORM 建库路径（见 src/core/migrations.py）。
"""

from __future__ import annotations

import sys
from logging.config import fileConfig
from pathlib import Path

from alembic import context
from sqlalchemy import engine_from_config, pool

# 允许 `alembic` 在仓库根直接执行时导入 src 包。
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.core import models  # noqa: F401  # 注册所有模型到 Base.metadata
from src.core.database import Base

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def _database_url() -> str:
    configured = config.get_main_option("sqlalchemy.url")
    if configured:
        return configured
    from src.config import load_settings

    return load_settings().database_url


def run_migrations_offline() -> None:
    context.configure(
        url=_database_url(),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        render_as_batch=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    section = config.get_section(config.config_ini_section, {})
    section["sqlalchemy.url"] = _database_url()
    connectable = engine_from_config(section, prefix="sqlalchemy.", poolclass=pool.NullPool)
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            render_as_batch=True,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
