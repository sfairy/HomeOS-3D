"""库结构自检：把实际库结构对到 ORM 元数据上，**只读**。

结构由 Alembic 负责（见 ``core/migrations.py``），本模块只如实报告差异：漏写的迁移
会让差异以一个显式的状态被看见，而不是被悄悄补掉。
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field

from sqlalchemy import inspect
from sqlalchemy.engine import Engine

from ..core import models, models_engagement  # noqa: F401  # pyright: ignore[reportUnusedImport]
from ..core.database import Base

logger = logging.getLogger("src.schema")


@dataclass(frozen=True)
class SchemaDrift:
    """库结构与 ORM 元数据之间的差异。全部字段为空 = 完全一致。"""

    missing_tables: tuple[str, ...] = ()
    missing_columns: tuple[str, ...] = ()
    missing_indexes: tuple[str, ...] = ()
    notes: tuple[str, ...] = field(default=())

    @property
    def clean(self) -> bool:
        return not (self.missing_tables or self.missing_columns or self.missing_indexes)

    def summary(self) -> str:
        """一行中文摘要，供日志与 /healthz 使用。"""
        if self.clean:
            return "库结构与 ORM 元数据一致"
        parts: list[str] = []
        for label, values in (
            ("缺表", self.missing_tables),
            ("缺列", self.missing_columns),
            ("缺索引", self.missing_indexes),
        ):
            if values:
                preview = "、".join(values[:4])
                suffix = f" 等 {len(values)} 项" if len(values) > 4 else ""
                parts.append(f"{label}：{preview}{suffix}")
        return "；".join(parts)

    def as_dict(self) -> dict[str, list[str]]:
        return {
            "missingTables": list(self.missing_tables),
            "missingColumns": list(self.missing_columns),
            "missingIndexes": list(self.missing_indexes),
        }


def inspect_schema(engine: Engine) -> SchemaDrift:
    """把库结构对到 ``Base.metadata`` 上，返回差异（不做任何写操作）。

    比较口径：
    - 表：ORM 表全集 vs 库内表（忽略 ``alembic_version`` 与 ``sqlite_*`` 内部表）
    - 列：逐表按名字比较
    - 索引：只比**有名字的**索引。主键与表级 UNIQUE 约束在 SQLite 里是
      ``sqlite_autoindex_*``（无名字、不可寻址），ORM 侧没有对应的 ``Index`` 对象，
      因此天然不参与比较。
    """
    inspector = inspect(engine)
    live_tables = {
        name
        for name in inspector.get_table_names()
        if name != "alembic_version" and not name.startswith("sqlite_")
    }

    missing_tables: list[str] = []
    missing_columns: list[str] = []
    missing_indexes: list[str] = []

    expected_tables = Base.metadata.tables
    for name in sorted(set(expected_tables) - live_tables):
        missing_tables.append(name)

    for table in expected_tables.values():
        if table.name not in live_tables:
            continue
        live_columns = {column["name"] for column in inspector.get_columns(table.name)}
        expected_columns = {column.name for column in table.columns}
        missing_columns.extend(
            f"{table.name}.{name}" for name in sorted(expected_columns - live_columns)
        )
        live_indexes = {
            index_name
            for index in inspector.get_indexes(table.name)
            if (index_name := index.get("name"))
        }
        expected_indexes = {index.name for index in table.indexes if index.name}
        missing_indexes.extend(
            f"{table.name}.{name}" for name in sorted(expected_indexes - live_indexes)
        )

    return SchemaDrift(
        missing_tables=tuple(missing_tables),
        missing_columns=tuple(missing_columns),
        missing_indexes=tuple(missing_indexes),
    )


def log_drift(drift: SchemaDrift) -> None:
    """把差异写日志。"""
    if drift.clean:
        logger.debug("库结构自检通过：与 ORM 元数据一致。")
        return
    logger.error("库结构与 ORM 元数据不一致（缺项会让相关查询直接失败）：%s", drift.summary())
    logger.debug("结构差异明细：%s", drift.as_dict())
