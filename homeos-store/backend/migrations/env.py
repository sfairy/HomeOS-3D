"""Alembic 环境：把商店 ORM 元数据接到迁移脚本上。

只支持在线模式；迁移在应用内执行（见 ``backend/src/core/migrations.py``）。
"""
from __future__ import annotations

import sys
import warnings
from logging.config import fileConfig
from pathlib import Path

_BACKEND = Path(__file__).resolve().parents[1]
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

from alembic import context
from sqlalchemy import engine_from_config, pool
from sqlalchemy.exc import SAWarning
from src.core import models, models_engagement  # noqa: F401  # pyright: ignore[reportUnusedImport]
from src.core.database import BUSY_TIMEOUT_SECONDS, Base

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name, disable_existing_loggers=False)

target_metadata = Base.metadata

warnings.filterwarnings("ignore", message=".*unresolvable cycles.*", category=SAWarning)


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
        connect_args={"timeout": BUSY_TIMEOUT_SECONDS},
    )

    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


def run_migrations_offline() -> None:
    raise RuntimeError(
        "本仓库不支持 alembic 离线模式（--sql）：迁移只在应用内以在线方式执行"
    )


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
