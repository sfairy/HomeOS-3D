"""SQLite 迁移注册表要反复用到的三条 introspect + 一条时间归一化。

为什么收敛到这里
----------------
主后端（``users``）与商店（``accounts``）的迁移注册表此前各自抄了一份 ``_columns`` /
``_table_exists``（商店还多一份 ``_index_exists``）与 ``_normalize_datetime``，
``sqlite_email`` 里另有第三份私有 ``_columns`` / ``_table_exists``。四份实现逐字相同，
但「SQLite 的 PRAGMA / sqlite_master 语义」只有一套 —— 抄成多份时，改动任何一处
（例如表名需要转义、或 PRAGMA 返回值解读）都要记得改全部，漏掉一处就是「A 库迁移成功、
B 库同一迁移静默跳过」。

约定
----
- 表名 / 索引名只来自迁移注册表内的常量，不来自外部输入；因此这里用 f-string 拼 SQL，
  并对拼接点标 ``# noqa: S608``（与 ``sqlite_email`` 的既有做法一致）。
- 所有函数都是**只读探测**，不改库；表不存在一律返回空集 / ``False``，让调用方自行短路。
"""

from __future__ import annotations

import sqlite3
from datetime import UTC, datetime


def table_columns(connection: sqlite3.Connection, table: str) -> set[str]:
    """返回表的列名集合；表不存在时 SQLite 给空结果，于是自然返回空集。"""
    return {str(row[1]) for row in connection.execute(f'PRAGMA table_info("{table}")')}


def table_exists(connection: sqlite3.Connection, table: str) -> bool:
    return (
        connection.execute("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?", (table,)).fetchone()
        is not None
    )


def index_exists(connection: sqlite3.Connection, index: str) -> bool:
    return (
        connection.execute("SELECT 1 FROM sqlite_master WHERE type = 'index' AND name = ?", (index,)).fetchone()
        is not None
    )


def normalize_datetime(value: str | None) -> str | None:
    """把 ISO 时间统一成 SQLite/ORM 使用的 UTC-naive 26 字符格式。

    解析失败或空值原样返回：迁移只负责「能归一就归一」，不该因为一条脏数据让整库升级失败。
    """
    if not value or not isinstance(value, str):
        return value
    text = value.strip()
    if not text:
        return value
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        return value
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=UTC)
    parsed = parsed.astimezone(UTC)
    return parsed.strftime("%Y-%m-%d %H:%M:%S.%f")
