"""启动期建库与结构自检。

新库按 ORM 元数据建表；已有库补建缺失的表与索引，随后核对结构与元数据一致。
"""

from __future__ import annotations

from sqlalchemy.schema import MetaData

from homeos_shared.schema_core import (
    SchemaError,
    ensure_schema,
    missing_schema_objects,
    validate_database,
)

from ...config import Settings


def _metadata() -> MetaData:
    from . import models  # noqa: F401  # 注册模型到 Base.metadata
    from .database import Base

    return Base.metadata


def prepare_schema(settings: Settings) -> None:
    """把数据库补到当前 ORM 结构，并校验完整性。"""
    from .database import Database

    metadata = _metadata()
    database = Database(settings.database_url)
    try:
        ensure_schema(metadata, database.engine)
        missing = missing_schema_objects(database.engine, metadata)
        if missing:
            raise SchemaError("库结构与 ORM 元数据不一致：\n  - " + "\n  - ".join(missing))
    finally:
        database.dispose()
    validate_database(settings.database_path, metadata.tables)


def inspect_schema(settings: Settings) -> list[str]:
    """只读检查库相对 ORM 元数据缺少的表、列与索引。"""
    from .database import Database

    metadata = _metadata()
    database = Database(settings.database_url)
    try:
        return missing_schema_objects(database.engine, metadata)
    finally:
        database.dispose()
