"""Alembic 环境：从 Settings 推导 URL，目标元数据为 src.core.models 的全部模型。

脚本目录仅用于开发期生成/应用增量迁移；发行产物不带脚本时，启动流程走
``migrations.run_migrations`` 的 ORM 建库路径（见 src/platform/core/migrations.py）。
"""

from __future__ import annotations

import sys
from logging.config import fileConfig
from pathlib import Path

from alembic import context
from sqlalchemy import engine_from_config, pool

# 允许 `alembic` 在仓库根直接执行时导入 src 包。
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.platform.core import models  # noqa: F401  # 注册所有模型到 Base.metadata
from src.platform.core.database import Base

# 放在 src 导入之后：``homeos_shared`` 的源码态挂载由 ``src/__init__.py`` 完成。
from homeos_shared.logging_noise import install_alembic_noise_filter

config = context.config

if config.config_file_name is not None:
    # disable_existing_loggers=False 是**必需**的，不是可选修饰：fileConfig 的默认值是 True，
    # 而 ``logging.config`` 的实现会把「此刻已存在、且不在 alembic.ini 里」的日志器
    # 全部 ``disabled = True`` —— 这包括 ``homeos.*``、``uvicorn.access``、``uvicorn.error``。
    # 本应用的迁移在 **lifespan 启动期**跑（见 platform/core/migrations.py），也就是
    # 「日志器早就装好了」之后才执行这一步，于是从这一行往后整条日志链路全哑：
    # 控制台看不到「应用启动完成」「服务运行在」，访问日志与全部业务日志（含 ERROR）
    # 一条不出，``/system/runtime-logs`` 的缓冲也收不到任何记录。
    # 实测（``python -m src.run`` + 一次请求）：迁移后 ``uvicorn.access.disabled = True``，
    # 日志停在「正在等待应用启动...」。商店侧 ``migrations/env.py`` 早就带了这个开关，
    # 主应用这一侧漏了。alembic 自己需要的等级仍由它自己的 ``[logger_alembic]`` 决定。
    fileConfig(config.config_file_name, disable_existing_loggers=False)

# alembic 每次启动都打的常量行（「Context impl SQLiteImpl.」等）只对 alembic 自己有意义，
# 却会以另一套格式混进启动日志 —— 过滤规则与取舍见 homeos_shared/logging_noise.py 第二节。
install_alembic_noise_filter()

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
