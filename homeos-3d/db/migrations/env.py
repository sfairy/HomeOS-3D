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

from src.core.database import Base
from src.core import models  # noqa: F401 - registers the mapped tables

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
    )
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


# 只支持在线模式。alembic 的离线模式（``--sql``：不连库、只打印 SQL）在这里没有调用方：
if context.is_offline_mode():
    raise RuntimeError(
        "本仓库不支持 alembic 离线模式（--sql）：迁移只在应用内以在线方式执行"
        "（见 backend/src/core/migrations.py）。"
    )
run_migrations_online()
