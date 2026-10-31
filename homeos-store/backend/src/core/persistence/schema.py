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
from ...config import StoreSettings

LOGGER = logging.getLogger(__name__)


def _metadata() -> MetaData:
    # 纯副作用导入：把模型注册到 Base.metadata。pyright 的忽略要写在名字所在行。
    from .. import (  # noqa: F401
        models,  # pyright: ignore[reportUnusedImport]
        models_engagement,  # pyright: ignore[reportUnusedImport]
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
        if report.applied:
            LOGGER.info(
                "商店数据库迁移完成：v%s → v%s（本次执行 %s 条：%s）",
                report.from_version,
                report.to_version,
                len(report.applied),
                ", ".join(f"v{item}" for item in report.applied),
            )
        else:
            # 每次启动都是这个分支：库里已经是当前版本，没有待执行的迁移。
            LOGGER.info("商店数据库结构已是最新：v%s（无需迁移）", report.to_version)
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
