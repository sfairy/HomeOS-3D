"""两个后端共享的启动期建库与结构自检。

只放与业务语义无关的叶子逻辑：按 ORM 元数据建表、校验库文件完整性、列出结构缺口。
两个后端的拓扑差异（连接参数、启动编排）留在各自包内。
"""

from __future__ import annotations

import logging
import re
import sqlite3
import warnings
from collections.abc import Iterable
from contextlib import closing
from pathlib import Path
from typing import Any

from sqlalchemy import inspect
from sqlalchemy.engine import Engine
from sqlalchemy.exc import SAWarning
from sqlalchemy.schema import MetaData

LOGGER = logging.getLogger(__name__)

#: SQLAlchemy 拒绝反射表达式索引时的文案（``sqlite/base.py`` 的 ``util.warn``）。
#: 认的是「被跳过的那个索引名」：只有这一类告警可以从启动日志里收走。
_EXPRESSION_INDEX_WARNING_RE = re.compile(r"expression-based index (\S+)$")


class SchemaError(RuntimeError):
    """库文件不可用，或结构与 ORM 元数据不一致。"""


def ensure_schema(metadata: MetaData, engine: Engine) -> None:
    """按 ORM 元数据建出缺失的表与索引。"""
    metadata.create_all(engine)


def listed_index_names(inspector: Any, table_name: str) -> set[str]:
    """反射某张表已有的索引名；表达式索引的告警收成一行中文调试日志。

    为什么要单独处理：SQLite 允许 ``CREATE UNIQUE INDEX … ON accounts(lower(trim(email)))``
    这类**表达式索引**，而 SQLAlchemy 的反射只还原「按列」的索引 —— 碰到表达式索引会发一条
    ``SAWarning: Skipped unsupported reflection of expression-based index …``，并把该索引从
    结果里剔掉。这条告警默认由 ``warnings`` 直接写 stderr：英文、多行、还带一行源码位置，
    正好夹在启动日志中间，读起来像报错（实际是「已跳过」）。

    为什么不直接改成「忽略一切 SAWarning」：``catch_warnings`` 一旦 ``record=True`` 就接管了
    **所有**告警的输出，漏掉别的告警等于把真正的反射问题藏起来。所以只扣下命中表达式索引
    文案的那几条，其余原样按原文件位置重新抛出（fail-open）。

    扣下来的索引名走 DEBUG：它不是缺陷（ORM 元数据里没有表达式索引，缺索引判定本就不会
    把它们算进去），但 ``LOG_LEVEL=debug`` 时仍能看见「跳过了谁」，不必靠翻源码才知道。
    """
    with warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter("always", SAWarning)
        names = {
            index["name"] for index in inspector.get_indexes(table_name) if index.get("name")
        }
    skipped: list[str] = []
    deferred: list[warnings.WarningMessage] = []
    for item in caught:
        matched = _EXPRESSION_INDEX_WARNING_RE.search(str(item.message))
        if matched is not None and issubclass(item.category, SAWarning):
            skipped.append(matched.group(1))
        else:
            deferred.append(item)
    # 重放放在 ``catch_warnings`` 之外：此时外层过滤器（含 ``-W error``）已恢复，
    # 别的告警该抛就抛，不会因为在上下文里被判成「always」而降级成一行打印。
    for item in deferred:
        warnings.warn_explicit(item.message, item.category, item.filename, item.lineno)
    if skipped:
        LOGGER.debug(
            "已跳过表达式索引的反射校验（ORM 元数据不含此类索引）:%s", ", ".join(sorted(skipped))
        )
    return names


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
        live_indexes = listed_index_names(inspector, table.name)
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
