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


def _email_not_null(connection: sqlite3.Connection, table: str) -> bool:
    """email 列是否 NOT NULL（决定空串该转 NULL 还是用部分索引排除）。"""
    for row in connection.execute(f'PRAGMA table_info("{table}")'):
        if str(row[1]) == "email":
            return bool(row[3])
    return False


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
    updates: list[tuple[str, object]] = []
    for row_id, email in rows:
        # 归一化口径必须与上面的重复检测完全一致：SQLite 的 lower() 只折叠 ASCII，
        # 直接用它 UPDATE 会让非 ASCII 大写邮箱（如 "Ü@X.com"）检测成 "ü@x.com"、
        # 写回却仍是 "Ü@x.com"，两条读路径（Python 小写 vs DB 值）从此对不上。
        # 统一用 Python 的 str.strip().lower() 的结果写回，逐行更新。
        value = str(email).strip().lower()
        previous = normalized.get(value)
        if previous is not None and previous != str(row_id):
            raise SchemaMigrationError(
                f"{table}.email 归一化后出现重复，请先人工处理："
                f"{previous} 与 {row_id} 都映射到 {value}"
            )
        normalized[value] = str(row_id)
        if str(email) != value:
            updates.append((value, row_id))
    if updates:
        connection.executemany(
            f"UPDATE {table} SET email = ? WHERE id = ?",  # noqa: S608
            updates,
        )
    if _email_not_null(connection, table):
        # NOT NULL 列不能把空串转 NULL；只对非空邮箱建唯一索引，空串（损坏/占位数据）
        # 不参与唯一性。否则两行空串会让整次迁移在 CREATE UNIQUE INDEX 处失败，应用起不来。
        connection.execute(
            f"CREATE UNIQUE INDEX IF NOT EXISTS {index_name} ON {table}(email) "
            "WHERE trim(email) != ''"
        )
        return
    # 可空列：空串统一转 NULL（SQLite 唯一索引允许多个 NULL），再建全列唯一索引。
    connection.execute(
        f"UPDATE {table} SET email = NULL WHERE email IS NOT NULL AND trim(email) = ''"  # noqa: S608
    )
    connection.execute(
        f"CREATE UNIQUE INDEX IF NOT EXISTS {index_name} ON {table}(email)"
    )
