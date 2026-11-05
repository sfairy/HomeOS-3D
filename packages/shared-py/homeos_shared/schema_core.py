"""两个后端共享的启动期建库与结构自检。

只放与业务语义无关的叶子逻辑：按 ORM 元数据建表、校验库文件完整性、列出结构缺口。
两个后端的拓扑差异（连接参数、启动编排）留在各自包内。
"""

from __future__ import annotations

import logging
import os
import re
import sqlite3
import time
import warnings
from collections.abc import Iterable
from contextlib import closing
from dataclasses import dataclass
from datetime import UTC, datetime
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


#: 「上次干净关闭」标记的后缀。标记紧挨库文件放：路径能从库路径推导，不必再多记一份配置，
#: 也不会因为换了数据目录而读到别处的陈旧结论。
CLEAN_SHUTDOWN_SUFFIX = ".clean-shutdown"

#: 体检强度的环境变量覆盖：``auto``（默认，按上次是否干净关闭选档）/ ``full`` / ``quick``。
#: 默认 auto 已把「干净关闭」做成跳过逐页扫描；需要强制全查时把它设成 ``full``。
INTEGRITY_TIER_ENV = "HOMEOS_SCHEMA_INTEGRITY"
_INTEGRITY_TIERS = frozenset({"auto", "full", "quick"})


@dataclass(frozen=True, slots=True)
class IntegrityReport:
    """一次启动体检的结论；调用方据此写日志（本模块的 logger 不在宿主日志树下）。"""

    #: 实际执行的 PRAGMA 名：``integrity_check`` / ``quick_check`` /
    #: ``skipped``（上次干净关闭，按 auto 档跳过逐页扫描）
    pragma: str
    #: 体检耗时（毫秒），含外键校验与必需表核对
    elapsed_ms: float
    #: 上次是否干净关闭；``None`` 表示调用方显式指定了强度，没有参考标记
    clean_shutdown: bool | None


def integrity_tier_from_env() -> str | None:
    """读取 ``HOMEOS_SCHEMA_INTEGRITY``；未设置或非法值返回 ``None``（走自动档）。

    非法值不报错：体检强度是排障开关，不是业务配置，写错一个字就拒绝启动的代价
    （起不来）远大于多扫一遍库。
    """
    raw = os.environ.get(INTEGRITY_TIER_ENV)
    if raw is None:
        return None
    tier = raw.strip().lower()
    return tier if tier in _INTEGRITY_TIERS else None


def clean_shutdown_marker(database_path: Path) -> Path:
    """干净关闭标记的路径（与库同级）。"""
    return database_path.with_name(database_path.name + CLEAN_SHUTDOWN_SUFFIX)


def consume_clean_shutdown_marker(database_path: Path) -> bool:
    """读走「上次干净关闭」标记：返回本次启动是否可以只做轻量体检。

    **读即删**是这套机制的关键：标记只在上次停机收尾跑完后才存在，本次启动一开始就消费掉，
    之后无论崩在启动的哪一步（含体检自己），下次都不会被误判成「干净关闭」。
    删不掉（只读挂载等）同样当作没有标记：多付一次完整体检，好过把坏库当健康库。
    """
    try:
        clean_shutdown_marker(database_path).unlink()
    except OSError:
        return False
    return True


def mark_clean_shutdown(database_path: Path) -> None:
    """停机收尾成功后落标记（幂等）。

    写失败只影响下次启动的体检强度（退化成完整校验），不影响本次退出 —— 所以这里吞掉
    ``OSError``：停机路径上再抛异常会让「已经收尾完成」的进程以非零码退出。
    """
    marker = clean_shutdown_marker(database_path)
    stamp = datetime.now(UTC).isoformat(timespec="seconds")
    try:
        marker.write_text(stamp + "\n", encoding="utf-8")
    except OSError:
        LOGGER.debug("干净关闭标记写入失败，下次启动将做完整体检:%s", marker)


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


def validate_database(
    database_path: Path,
    required_tables: Iterable[str],
    *,
    integrity: str | None = None,
) -> IntegrityReport:
    """校验库文件的完整性、外键约束与必需业务表，返回本次体检的结论。

    ``integrity`` 只决定**逐页扫描强度**，不影响外键校验与必需表核对：

    - ``"full"``：``PRAGMA integrity_check`` —— 逐页校验表 B-tree 与全部索引；
    - ``"quick"``：``PRAGMA quick_check`` —— 跳过索引一致性，耗时约为 ``full`` 的 1/4；
    - ``None``（默认）：按「上次是否干净关闭」+ 环境变量 ``HOMEOS_SCHEMA_INTEGRITY``
      自动选档：

      * 环境变量显式给 ``full`` / ``quick`` 时按它执行（排障用，仍消费干净关闭标记）；
      * 否则 ``auto``：干净关闭 → **跳过**逐页扫描（``pragma="skipped"``），
        异常退出 → ``quick_check``。

    为什么干净关闭可以直接跳过：``integrity_check`` 是 O(库文件大小) 的全盘扫描（291 MB 的库
    实测约 800 ms，占了整个启动的 80%），而停机路径已经正常关库、WAL 收尾完成，
    每次正常重启都重扫一遍拿不到新信息。异常退出后的首启才是半写页 / 缺页的高危时刻，
    这时仍做 ``quick_check`` 兜住页级损坏（索引一致性属可重建的派生结构，代价不对称）。
    需要回到旧的全查行为时设 ``HOMEOS_SCHEMA_INTEGRITY=full``。
    """
    if integrity not in (None, "full", "quick"):
        raise ValueError(f"未知的完整性体检强度：{integrity}")
    clean_shutdown: bool | None = None
    skipped = False
    if integrity is None:
        # 标记读即删：无论走哪一档都必须消费掉它，否则本次启动中途崩溃后，
        # 下次会被误判成「上次干净关闭」而跳过扫描。
        clean_shutdown = consume_clean_shutdown_marker(database_path)
        tier = integrity_tier_from_env() or "auto"
        if tier == "auto":
            skipped = clean_shutdown
            integrity = "quick"
        else:
            # 环境变量显式指定强度：报告里 clean_shutdown 记 None，
            # 调用方日志据此说「显式指定强度」；标记已在上面消费掉。
            clean_shutdown = None
            integrity = tier
    pragma = "skipped" if skipped else ("quick_check" if integrity == "quick" else "integrity_check")
    if not database_path.is_file():
        raise SchemaError(f"数据库文件不存在：{database_path}")
    started = time.perf_counter()
    with closing(sqlite3.connect(f"file:{database_path}?mode=ro", uri=True)) as connection:
        if not skipped:
            result = connection.execute(f"PRAGMA {pragma}").fetchone()
            if result is None or result[0] != "ok":
                detail = result[0] if result else "no result"
                raise SchemaError(f"SQLite {pragma} 失败：{detail}")
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
    return IntegrityReport(
        pragma=pragma,
        elapsed_ms=round((time.perf_counter() - started) * 1000.0, 2),
        clean_shutdown=clean_shutdown,
    )
