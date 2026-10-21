"""SQLite 迁移里的「email 归一化 + 唯一索引」步骤。

主后端（``users``）与商店（``accounts``）各写了一份结构完全相同的迁移：补列 → 读出非空
email → 归一化为 ``strip().lower()`` → 发现「不同 id 映射到同一 email」就抛
``SchemaMigrationError`` → 批量 UPDATE → 建唯一索引。差异只有表名、补列 SQL 与错误文案里的
表名前缀，因此参数化到此。

行为等价要点：
- 只在表存在时执行；表存在但没有 ``email`` 列时先补列（补列 SQL 由调用方给出，两个项目
  的 NOT NULL/DEFAULT 约束不同）；
- 重复检测先于 UPDATE：出现重复时不修改任何数据，异常类型与消息逐字保留；
- 索引名按调用方给的名字创建，与两份原实现一致。
"""

from __future__ import annotations

import sqlite3

from .schema_migrate import SchemaMigrationError


def _columns(connection: sqlite3.Connection, table: str) -> set[str]:
    return {str(row[1]) for row in connection.execute(f'PRAGMA table_info("{table}")')}


def _table_exists(connection: sqlite3.Connection, table: str) -> bool:
    return (
        connection.execute(
            "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?", (table,)
        ).fetchone()
        is not None
    )


def normalize_email_column(
    connection: sqlite3.Connection,
    *,
    table: str,
    add_column_sql: str,
    index_name: str,
) -> None:
    """把 ``<table>.email`` 归一化为小写去空格，并建立唯一索引。

    ``add_column_sql`` 是各项目自己的补列语句：主应用为可空列，商店为
    ``NOT NULL DEFAULT ''``；``index_name`` 也由调用方给出（主应用 ``users_email_idx``、
    商店 ``ix_accounts_email``），两边建的都是同一列上的唯一索引。
    表名只来自迁移注册表内的常量，不来自外部输入。
    """
    if not _table_exists(connection, table):
        return
    columns = _columns(connection, table)
    if "email" not in columns:
        connection.execute(add_column_sql)
        columns.add("email")
    rows = connection.execute(
        f"SELECT id, email FROM {table} WHERE email IS NOT NULL AND trim(email) != ''"  # noqa: S608
    ).fetchall()
    normalized: dict[str, str] = {}
    for row_id, email in rows:
        value = str(email).strip().lower()
        previous = normalized.get(value)
        if previous is not None and previous != str(row_id):
            raise SchemaMigrationError(
                f"{table}.email 归一化后出现重复，请先人工处理："
                f"{previous} 与 {row_id} 都映射到 {value}"
            )
        normalized[value] = str(row_id)
    connection.execute(
        f"UPDATE {table} SET email = lower(trim(email)) "  # noqa: S608
        "WHERE email IS NOT NULL AND email <> lower(trim(email))"
    )
    connection.execute(
        f"CREATE UNIQUE INDEX IF NOT EXISTS {index_name} ON {table}(email)"
    )
