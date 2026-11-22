"""SQLite 结构读取：两个后端的迁移注册表与结构比对脚本共用。

这里只有「读」没有「写」：把 ``PRAGMA`` / ``sqlite_master`` 的解析收在一处，避免
「迁移注册表写一套、reset 脚本再写一套」后各自漂移。历史实现分散在
``sqlite_introspect``（已随迁移链塌缩删除）与两个 ``migrations.py`` 里。
"""

from __future__ import annotations

import sqlite3


def table_columns(connection: sqlite3.Connection) -> dict[str, set[str]]:
    """``{表名: {列名}}``。"""
    tables = [
        str(row[0])
        for row in connection.execute(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"
        )
    ]
    return {name: {str(row[1]) for row in connection.execute(f'PRAGMA table_info("{name}")')} for name in tables}


def table_indexes(connection: sqlite3.Connection) -> dict[str, set[str]]:
    """``{表名: {索引名}}``，忽略 SQLite 为 UNIQUE 自动生成的 ``sqlite_autoindex_*``。"""
    rows = connection.execute(
        "SELECT tbl_name, name FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'sqlite_autoindex_%'"
    ).fetchall()
    result: dict[str, set[str]] = {}
    for table, name in rows:
        result.setdefault(str(table), set()).add(str(name))
    return result


__all__ = ["table_columns", "table_indexes"]
