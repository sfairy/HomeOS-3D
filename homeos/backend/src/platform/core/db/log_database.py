"""日志 / 观测量数据库（``homeos-logs.db``）：与业务库**分文件**，独立 WAL 与 checkpoint。

为什么拆
--------
``event_logs`` / ``event_log_stats_hourly`` / ``security_events`` /
``agent_context_timeline`` 有四类共同特征，与业务表完全相反：

- **写入是事件驱动的**：HA 刷屏时一秒几百行，安静时可以几分钟没有一条；
- **可丢**：全量备份本来就把它们整体排除（见 ``backup/scope.EXCLUDED_DB_TABLES``）；
- **按时间扫描**：查询几乎都带 ``createdAt >= ?``，与业务表的按主键点查完全不同；
- **体积占绝大部分**：模块注释记录时间序列表占库 96%（表 513 MB + 索引 333 MB）。

放在同一个 ``homeos.db`` 里的代价是**写者与 checkpoint 共享**：一次日志洪峰或保留策略
的大删除，会和「用户点了开关 → 写一条自动化状态」抢同一把写锁、同一个 WAL；
checkpoint 也被迫在两边之间做取舍。拆成独立文件后两边各自 WAL、各自 checkpoint，
互不阻塞，而且 DROP/清理只影响自己那份文件。

刻意**不拆**的东西
------------------
``energy_usage_hourly`` / ``_daily`` / ``_monthly`` 留在业务库：它们与回路、绑定、账单
口径在同一条事务里读写（``energy_store`` 一次会话里同时写小时与日/月聚合），拆开会让
「一次记账跨两个库」变成跨库事务。它们的写入量是「每表每小时几行」，不是热点。

迁移口径
--------
老库里的行必须搬到新文件，不能静默丢历史：``move_legacy_rows`` 用 ``ATTACH`` + 按 rowid
分块搬（每块一个事务，插入 **和** 删除同事务提交），因此断电/被杀之后下次启动从断点继续，
既不会重复也不会丢。搬运完成后主库里的表**保留但清空** —— 回退到旧版本时表还在，
只是历史为空（与环境里已有的「备份不含历史」口径一致）。
"""

from __future__ import annotations

import logging
import sqlite3
from pathlib import Path
from typing import Any

from .database import Database
from .log_base import LOG_DB_NAME, LOG_TABLE_NAMES

LOGGER = logging.getLogger("homeos.platform.core.schema")

#: 搬运分块大小。5000 行 ≈ 一次几 MB 的事务；再大只会让 WAL 与回滚成本变高。
MOVE_CHUNK_ROWS = 5000

#: 日志库连接池：写全是批处理，读是报表式短查询，不需要主库那么大。
DEFAULT_LOG_POOL_SIZE = 3
DEFAULT_LOG_MAX_OVERFLOW = 1


def log_database_path(data_dir: Path) -> Path:
    return data_dir / LOG_DB_NAME


class LogDatabase(Database):
    """日志库连接封装：复用主库那套 PRAGMA（WAL / busy_timeout / mmap / 页缓存）。"""

    def __init__(self, database_url: str) -> None:
        super().__init__(
            database_url,
            pool_size=DEFAULT_LOG_POOL_SIZE,
            max_overflow=DEFAULT_LOG_MAX_OVERFLOW,
        )


def _table_columns(connection: sqlite3.Connection, schema: str, table: str) -> list[str]:
    try:
        # schema 只取 "main" / "logs" 两个字面量；table 来自 LOG_TABLE_NAMES 常量。
        rows = connection.execute(f'PRAGMA {schema}.table_info("{table}")').fetchall()
    except sqlite3.Error:
        LOGGER.debug("读取 %s.%s 列信息失败（按无公共列处理）", schema, table, exc_info=True)
        return []
    return [str(row[1]) for row in rows]


def _has_table(connection: sqlite3.Connection, schema: str, table: str) -> bool:
    row = connection.execute(
        f"SELECT 1 FROM {schema}.sqlite_master WHERE type='table' AND name=? LIMIT 1",  # noqa: S608
        (table,),
    ).fetchone()
    return row is not None


def reset_log_database(settings: Any) -> None:
    """删掉日志库文件与 sidecar（整库还原后调用）。

    备份里**不含**日志库（它的表全部在 ``EXCLUDED_DB_TABLES``），所以还原后必须把它
    清掉：否则会出现「配置回到备份时刻、历史还停在新版本」的撕裂状态，而且旧实体 id
    可能已经不存在。删文件后由 ``prepare_schema`` 重建空库。
    """
    path: Path = settings.log_database_path
    for suffix in ("", "-wal", "-shm", "-journal"):
        candidate = path.with_name(path.name + suffix) if suffix else path
        candidate.unlink(missing_ok=True)


def _move_table(
    connection: sqlite3.Connection,
    table: str,
    *,
    chunk_rows: int,
    logger: logging.Logger,
) -> int:
    """把单张表按 rowid 分块搬进 ``logs.<table>``，返回搬移行数。

    每块「插入 + 删除」同事务提交：中断后重跑只会继续搬剩余行，``INSERT OR IGNORE``
    兜住「已插入但还没删掉」的那个窗口。
    """
    if not _has_table(connection, "main", table):
        return 0
    if not _has_table(connection, "logs", table):
        # 日志库还没建出这张表（理论上 ensure_schema 已建）：跳过而不是报错，
        # 让启动继续；下一次重启会再试。
        logger.warning("日志库缺少表 %s，本次跳过搬运", table)
        return 0
    log_columns = set(_table_columns(connection, "logs", table))
    columns = [name for name in _table_columns(connection, "main", table) if name in log_columns]
    if not columns:
        logger.warning("表 %s 两侧没有公共列，本次跳过搬运", table)
        return 0
    column_sql = ", ".join(f'"{name}"' for name in columns)
    last_rowid = 0
    total = 0
    chunks = 0
    while True:
        candidate = connection.execute(
            f'SELECT MAX(rowid) FROM (SELECT rowid FROM main."{table}" '  # noqa: S608
            "WHERE rowid > ? ORDER BY rowid LIMIT ?)",
            (last_rowid, chunk_rows),
        ).fetchone()
        high = candidate[0] if candidate else None
        if high is None:
            break
        try:
            connection.execute("BEGIN IMMEDIATE")
            cursor = connection.execute(
                f'INSERT OR IGNORE INTO logs."{table}" ({column_sql}) '  # noqa: S608
                f'SELECT {column_sql} FROM main."{table}" WHERE rowid > ? AND rowid <= ?',
                (last_rowid, high),
            )
            inserted = max(int(cursor.rowcount or 0), 0)
            connection.execute(
                f'DELETE FROM main."{table}" WHERE rowid > ? AND rowid <= ?',  # noqa: S608
                (last_rowid, high),
            )
            connection.execute("COMMIT")
        except sqlite3.Error:
            connection.execute("ROLLBACK")
            raise
        total += inserted
        chunks += 1
        last_rowid = high
    if chunks:
        logger.info("日志库搬运完成：%s 共 %s 行（%s 个分块）", table, total, chunks)
    return total


def move_legacy_rows(
    main_path: Path,
    log_path: Path,
    *,
    chunk_rows: int = MOVE_CHUNK_ROWS,
    logger: logging.Logger | None = None,
) -> dict[str, int]:
    """把老库里的日志行搬进日志库；返回每张表搬了多少行。

    幂等：分块按 rowid 推进，每块「插入 + 删除」同事务提交。中断后重跑只会继续搬剩余行
    （``INSERT OR IGNORE`` 兜住「已搬过但没删掉」的窗口）。
    """
    log = logger or LOGGER
    moved: dict[str, int] = {}
    if not main_path.exists() or main_path.stat().st_size == 0:
        return moved
    if main_path.resolve() == log_path.resolve():
        return moved
    log_path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(str(main_path), isolation_level=None)
    try:
        connection.execute("PRAGMA busy_timeout=5000")
        connection.execute("ATTACH DATABASE ? AS logs", (str(log_path),))
        connection.execute("PRAGMA logs.journal_mode=WAL")
        connection.execute("PRAGMA logs.synchronous=NORMAL")
        for table in LOG_TABLE_NAMES:
            total = _move_table(connection, table, chunk_rows=chunk_rows, logger=log)
            if total:
                moved[table] = total
    finally:
        connection.close()
    return moved
