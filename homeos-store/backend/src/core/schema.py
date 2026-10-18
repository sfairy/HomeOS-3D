"""启动期建库、迁移与结构自检。

启动顺序与主应用一致：迁移注册表 → ORM 补新增 → 结构缺口检查。
"""

from __future__ import annotations

import logging

from sqlalchemy.schema import MetaData

from homeos_shared.schema_core import (
    SchemaError,
    ensure_schema,
    missing_schema_objects,
    validate_database,
)
from homeos_shared.schema_migrate import run_migrations

from .migrations import MIGRATIONS
from ..config import StoreSettings

LOGGER = logging.getLogger(__name__)


def _metadata() -> MetaData:
    from . import (  # noqa: F401  # 注册模型到 Base.metadata  # pyright: ignore[reportUnusedImport]
        models,
        models_engagement,
    )
    from .database import Base

    return Base.metadata


def prepare_schema(settings: StoreSettings) -> None:
    """把数据库迁移到当前版本、补齐 ORM 新增结构，并校验完整性。"""
    from .database import create_store_engine

    metadata = _metadata()
    engine = create_store_engine(settings)
    try:
        report = run_migrations(
            database_path=settings.database_path,
            app="store",
            migrations=MIGRATIONS,
            create_schema=lambda: ensure_schema(metadata, engine),
            data_dir=settings.data_dir,
            mode=settings.schema_mode,
            logger=LOGGER,
        )
        LOGGER.info("商店数据库迁移完成：%s → v%s（applied=%s）", report.from_version, report.to_version, report.applied)
        if settings.schema_mode == "check":
            # check 是只读探测：不仅不能执行迁移，也不能用 create_all 顺手补表。
            missing = missing_schema_objects(engine, metadata)
            if missing:
                raise SchemaError(
                    "check 模式发现库结构缺口（未做任何修改）：\n  - " + "\n  - ".join(missing)
                )
        else:
            ensure_schema(metadata, engine)
            missing = missing_schema_objects(engine, metadata)
            if missing:
                raise SchemaError("库结构与 ORM 元数据不一致：\n  - " + "\n  - ".join(missing))
    finally:
        engine.dispose()
    validate_database(settings.database_path, metadata.tables)
