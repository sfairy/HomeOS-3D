"""启动期建库与结构自检。

新库按 ORM 元数据建表；已有库补建缺失的表与索引，随后核对结构与元数据一致。
"""

from __future__ import annotations

from sqlalchemy.schema import MetaData

from homeos_shared.schema_core import (
    SchemaError,
    ensure_schema,
    missing_schema_objects,
)

from ..config import StoreSettings


def _metadata() -> MetaData:
    from . import (  # noqa: F401  # 注册模型到 Base.metadata  # pyright: ignore[reportUnusedImport]
        models,
        models_engagement,
    )
    from .database import Base

    return Base.metadata


def prepare_schema(settings: StoreSettings) -> None:
    """把数据库补到当前 ORM 结构，并校验完整性。"""
    from .database import create_store_engine

    metadata = _metadata()
    engine = create_store_engine(settings)
    try:
        ensure_schema(metadata, engine)
        missing = missing_schema_objects(engine, metadata)
        if missing:
            raise SchemaError("库结构与 ORM 元数据不一致：\n  - " + "\n  - ".join(missing))
    finally:
        engine.dispose()
