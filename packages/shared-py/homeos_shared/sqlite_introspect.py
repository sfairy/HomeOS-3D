"""SQLite 迁移注册表要反复用到的三条 introspect + 两条时间归一化。

为什么收敛到这里
----------------
主后端（``users``）与商店（``accounts``）的迁移注册表此前各自抄了一份 ``_columns`` /
``_table_exists``（商店还多一份 ``_index_exists``）与 ``_normalize_datetime``，
``sqlite_email`` 里另有第三份私有 ``_columns`` / ``_table_exists``。四份实现逐字相同，
但「SQLite 的 PRAGMA / sqlite_master 语义」只有一套 —— 抄成多份时，改动任何一处
（例如表名需要转义、或 PRAGMA 返回值解读）都要记得改全部，漏掉一处就是「A 库迁移成功、
B 库同一迁移静默跳过」。

``normalize_all_datetimes`` 同理：两个注册表曾各有一份逐字相同的全库归一化循环，
只有「先取列名再 PRAGMA」和「先 PRAGMA 再遍历」这点差别，现在只留后者（每表一次 PRAGMA，
且按声明顺序遍历，结果确定）。

约定
----
- 表名 / 索引名只来自迁移注册表内的常量，不来自外部输入；因此这里用 f-string 拼 SQL，
  并对拼接点标 ``# noqa: S608``（与 ``sqlite_email`` 的既有做法一致）。
- 除 ``normalize_all_datetimes`` 会按需 UPDATE 那些「明显不是归一形态」的字段外，
  其余函数都是**只读探测**：表不存在一律返回空集 / ``False``，让调用方自行短路。
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


#: 只改「看着就不是归一形态」的值：带时区偏移（``+``）、带 ``T`` 分隔符、或长度不是 19/26。
#: 全表重写会把每行都变成一次 UPDATE，在几万行的历史上是不可接受的写放大。
_DIRTY_DATETIME_PREDICATE = (
    'AND (instr("{column}", "+") > 0 OR instr("{column}", "T") > 0 OR length("{column}") NOT IN (19, 26))'
)


def normalize_all_datetimes(
    connection: sqlite3.Connection,
    *,
    skip_tables: tuple[str, ...] = ("schema_migrations",),
) -> int:
    """把库里所有 DATE/TIME 列上的非 UTC-naive 文本改写掉，返回改动的字段数。

    为什么放在这里：主后端与商店的迁移注册表此前**各有一份逐字相同的实现**（只有「先取列名
    再 PRAGMA」还是「先 PRAGMA 再遍历」这点差别）。同一套 SQLite PRAGMA 语义抄成两份，
    改动任何一处（比如表名需要转义、或要跳过新的元数据表）都得记得改全部。

    实现取「每表一次 PRAGMA」那条：主后端那版在列循环里重复 PRAGMA，表的列越多越亏，
    而且它按 ``set`` 顺序遍历列，同一份数据在不同进程里可能以不同顺序被更新。
    这里按 PRAGMA 的声明顺序走，结果确定。

    只读探测之外的唯一副作用就是那些 UPDATE；表不存在则自然 no-op（迁移在空库上必须能跑）。
    """
    skip = set(skip_tables)
    tables = [
        str(row[0])
        for row in connection.execute(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"
        )
        if str(row[0]) not in skip
    ]

    changed = 0
    for table in tables:
        declared = connection.execute(f'PRAGMA table_info("{table}")').fetchall()
        for row in declared:
            column = str(row[1])
            declared_type = str(row[2]).upper()
            if "DATE" not in declared_type and "TIME" not in declared_type:
                continue
            rows = connection.execute(
                f'SELECT rowid, "{column}" FROM "{table}" WHERE "{column}" IS NOT NULL '  # noqa: S608
                + _DIRTY_DATETIME_PREDICATE.format(column=column)
            ).fetchall()
            for rowid, value in rows:
                normalized = normalize_datetime(str(value))
                if normalized != value:
                    connection.execute(
                        f'UPDATE "{table}" SET "{column}" = ? WHERE rowid = ?',  # noqa: S608
                        (normalized, rowid),
                    )
                    changed += 1
    return changed
