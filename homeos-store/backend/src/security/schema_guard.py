"""库结构自检：把实际库结构对到 ORM 元数据上，**只读**。

这里曾经是一段会在每次启动时改表结构的代码（补列、补索引、合并重复行），因为商店当时
没有版本化迁移。现在结构由 Alembic 负责（见 ``core/migrations.py``），本模块只剩一件事：
**如实报告差异**。

之所以把「改」彻底删掉而不是留着兜底：补出来的结构是不受版本控制的，一旦它悄悄兜住
了某个漏写的迁移，问题就不会再暴露 —— 直到某天在另一台机器上启动、拿到的结构与这台
不一致。宁可让差异以一个显式的 ``degraded`` 状态被看见。
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field

from sqlalchemy import inspect
from sqlalchemy.engine import Engine

#: 副作用导入：把 ORM 模型注册进 Base.metadata。
from ..core import (
    models,  # noqa: F401
    models_engagement,  # noqa: F401
)
from ..core.database import Base

logger = logging.getLogger("src.schema")


@dataclass(frozen=True)
class SchemaDrift:
    """库结构与 ORM 元数据之间的差异。全部字段为空 = 完全一致。
    """

    #: ORM 里有、库里没有（缺表通常意味着迁移没跑成功）
    missing_tables: tuple[str, ...] = ()
    #: 库里有、ORM 里没有（历史遗留表，应由迁移删除）
    extra_tables: tuple[str, ...] = ()
    #: ``表.列``，ORM 里有、库里没有
    missing_columns: tuple[str, ...] = ()
    #: ``表.列``，库里有、ORM 里没有（幽灵列）
    extra_columns: tuple[str, ...] = ()
    #: ``表.索引``，ORM 里有、库里没有
    missing_indexes: tuple[str, ...] = ()
    #: ``表.索引``，库里有、ORM 里没有（遗留索引）
    extra_indexes: tuple[str, ...] = ()
    #: 结构性差异之外的补充说明（例如列类型不一致），只报不判
    notes: tuple[str, ...] = field(default=())

    @property
    def clean(self) -> bool:
        return not any(
            (
                self.missing_tables,
                self.extra_tables,
                self.missing_columns,
                self.extra_columns,
                self.missing_indexes,
                self.extra_indexes,
            )
        )

    def summary(self) -> str:
        """一行中文摘要，供日志与 /healthz 使用。"""
        if self.clean:
            return "库结构与 ORM 元数据一致"
        parts: list[str] = []
        for label, values in (
            ("缺表", self.missing_tables),
            ("多余表", self.extra_tables),
            ("缺列", self.missing_columns),
            ("幽灵列", self.extra_columns),
            ("缺索引", self.missing_indexes),
            ("多余索引", self.extra_indexes),
        ):
            if values:
                preview = "、".join(values[:4])
                suffix = f" 等 {len(values)} 项" if len(values) > 4 else ""
                parts.append(f"{label}：{preview}{suffix}")
        return "；".join(parts)

    def as_dict(self) -> dict[str, list[str]]:
        return {
            "missingTables": list(self.missing_tables),
            "extraTables": list(self.extra_tables),
            "missingColumns": list(self.missing_columns),
            "extraColumns": list(self.extra_columns),
            "missingIndexes": list(self.missing_indexes),
            "extraIndexes": list(self.extra_indexes),
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
    extra_tables: list[str] = []
    missing_columns: list[str] = []
    extra_columns: list[str] = []
    missing_indexes: list[str] = []
    extra_indexes: list[str] = []

    expected_tables = Base.metadata.tables
    for name in sorted(set(expected_tables) - live_tables):
        missing_tables.append(name)
    for name in sorted(live_tables - set(expected_tables)):
        extra_tables.append(name)

    for table in expected_tables.values():
        if table.name not in live_tables:
            continue
        live_columns = {column["name"] for column in inspector.get_columns(table.name)}
        expected_columns = {column.name for column in table.columns}
        missing_columns.extend(
            f"{table.name}.{name}" for name in sorted(expected_columns - live_columns)
        )
        extra_columns.extend(
            f"{table.name}.{name}" for name in sorted(live_columns - expected_columns)
        )

        live_indexes = {
            index["name"]
            for index in inspector.get_indexes(table.name)
            if index.get("name")
        }
        expected_indexes = {index.name for index in table.indexes if index.name}
        missing_indexes.extend(
            f"{table.name}.{name}" for name in sorted(expected_indexes - live_indexes)
        )
        extra_indexes.extend(
            f"{table.name}.{name}" for name in sorted(live_indexes - expected_indexes)
        )

    return SchemaDrift(
        missing_tables=tuple(missing_tables),
        extra_tables=tuple(extra_tables),
        missing_columns=tuple(missing_columns),
        extra_columns=tuple(extra_columns),
        missing_indexes=tuple(missing_indexes),
        extra_indexes=tuple(extra_indexes),
    )


def log_drift(drift: SchemaDrift) -> None:
    """把差异按严重程度分级写日志。

    分级依据是「后果」而不是「差异大小」：缺表/缺列会让查询直接报错（critical），
    幽灵列不参与任何查询（warning），多余索引只影响写入（info）。
    """
    if drift.clean:
        logger.debug("库结构自检通过：与 ORM 元数据一致。")
        return
    if drift.missing_tables or drift.missing_columns or drift.missing_indexes:
        logger.error(
            "库结构与 ORM 元数据不一致（缺项会让相关查询直接失败）：%s",
            drift.summary(),
        )
    else:
        logger.warning(
            "库结构有历史遗留（不影响运行，建议用迁移清理）：%s", drift.summary()
        )
    logger.debug("结构差异明细：%s", drift.as_dict())
