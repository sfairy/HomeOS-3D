"""两个后端共享的启动期建库与结构自检。

只放与业务语义无关的叶子逻辑：按 ORM 元数据建表、校验库文件完整性、列出结构缺口。
两个后端的拓扑差异（连接参数、启动编排）留在各自包内。
"""

from __future__ import annotations

import sqlite3
from collections.abc import Iterable
from contextlib import closing
from pathlib import Path

from sqlalchemy import inspect
from sqlalchemy.engine import Engine
from sqlalchemy.schema import MetaData


class SchemaError(RuntimeError):
    """库文件不可用，或结构与 ORM 元数据不一致。"""


def ensure_schema(metadata: MetaData, engine: Engine) -> None:
    """按 ORM 元数据建出缺失的表与索引。"""
    metadata.create_all(engine)


def missing_schema_objects(engine: Engine, metadata: MetaData) -> list[str]:
    """列出库相对 ORM 元数据缺少的表、列与索引；已满足时返回空列表。"""
    inspector = inspect(engine)
    live_tables = set(inspector.get_table_names())
    missing: list[str] = []
    for table in metadata.tables.values():
        if table.name not in live_tables:
            missing.append(f"缺表 {table.name}")
            continue
        live_columns = {column["name"] for column in inspector.get_columns(table.name)}
        missing_columns = sorted({column.name for column in table.columns} - live_columns)
        if missing_columns:
            missing.append(f"{table.name} 缺列 {', '.join(missing_columns)}")
        live_indexes = {
            index["name"] for index in inspector.get_indexes(table.name) if index.get("name")
        }
        missing_indexes = sorted(
            {index.name for index in table.indexes if index.name} - live_indexes
        )
        if missing_indexes:
            missing.append(f"{table.name} 缺索引 {', '.join(missing_indexes)}")
    return missing


def validate_database(database_path: Path, required_tables: Iterable[str]) -> None:
    """校验库文件的完整性、外键约束与必需业务表。"""
    if not database_path.is_file():
        raise SchemaError(f"数据库文件不存在：{database_path}")
    with closing(sqlite3.connect(f"file:{database_path}?mode=ro", uri=True)) as connection:
        integrity = connection.execute("PRAGMA integrity_check").fetchone()
        if integrity is None or integrity[0] != "ok":
            detail = integrity[0] if integrity else "no result"
            raise SchemaError(f"SQLite integrity_check 失败：{detail}")
        violations = connection.execute("PRAGMA foreign_key_check").fetchall()
        if violations:
            sample = "; ".join(str(row) for row in violations[:5])
            raise SchemaError(f"SQLite foreign_key_check 失败：{sample}")
        live_tables = {
            str(row[0])
            for row in connection.execute("SELECT name FROM sqlite_master WHERE type = 'table'")
        }
    missing = sorted(set(required_tables) - live_tables)
    if missing:
        raise SchemaError(f"数据库缺少业务表：{', '.join(missing)}")
