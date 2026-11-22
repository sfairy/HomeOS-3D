#!/usr/bin/env python3
"""事件日志历史去重（一次性维护脚本，不是启动逻辑）。

## 为什么需要

2026-11-18 13:02 → 11-21 20:56 之间，能耗副作用的一个 KeyError 让
``EventLogService.flush`` 每轮都回灌整批并重写显示行（详见
``ops/checks/event_log_selftest.py`` 的说明）。结果是 ``event_logs`` 涨到 1222 万行，
而真正不同的事件只有 4365 条 —— 单条最多被写了 12614 次，库文件因此 9.9 GB。

代码侧已经修好（energy 全量隔离 + 批内去重），但存量垃圾不会自己消失：
它继续占磁盘、拖慢每次备份的 VACUUM、并让「近 7 天事件」报表全是同一批噪声。

## 为什么是独立脚本

``VACUUM`` 会重写整个库文件并持排他锁（9.9 GB 实测数十秒），放进启动流程等于每次升级
都卡一次启动。这里与 ``ops/scripts/prune-agent-timeline.py`` 同一口径：可手工 / 低峰执行，
参数全部显式，默认只打印计划。

## 去重口径

``(entityId, createdAt, stateDiff)`` 相同视为同一条事件，只保留 **id 最小**的那一行
（最早写入的那份；事件内容逐字段相同，保留哪份都不影响语义）。

## 为什么按 id 区间分批

应用可能正在运行（每 5 秒一次 flush）。``DELETE ... WHERE id NOT IN (4365 个 id)``
每批都要全表判断，1200 万行 × 上百批不可接受。按主键区间切分后每批只扫 10 万行，
几十毫秒一批，与在线写入互不阻塞（配合 ``busy_timeout``）。

用法（仓库根）::

    # 1) 先看会删多少（不写库）
    node ops/lib/py.mjs ops/scripts/dedup-event-logs.py --dry-run

    # 2) 真正执行
    node ops/lib/py.mjs ops/scripts/dedup-event-logs.py

    # 3) 顺带回收磁盘（慢，且持排他锁；建议低峰加 --vacuum）
    node ops/lib/py.mjs ops/scripts/dedup-event-logs.py --vacuum
"""

from __future__ import annotations

import argparse
import sqlite3
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DB = ROOT / "homeos" / "data" / "homeos.db"
#: 每批删除的行数（按主键区间）。10 万行约几十毫秒，能与在线写入共存。
BATCH = 100_000


def _connect(path: Path) -> sqlite3.Connection:
    connection = sqlite3.connect(path, isolation_level=None, timeout=5.0)
    connection.execute("PRAGMA busy_timeout=5000")
    return connection


def measure(connection: sqlite3.Connection) -> tuple[int, int]:
    total = int(connection.execute("SELECT COUNT(*) FROM event_logs").fetchone()[0])
    unique = int(
        connection.execute(
            "SELECT COUNT(*) FROM (SELECT 1 FROM event_logs GROUP BY entityId, createdAt, stateDiff)"
        ).fetchone()[0]
    )
    return total, unique


def keep_ids(connection: sqlite3.Connection) -> list[int]:
    """每个 (entityId, createdAt, stateDiff) 组合里 id 最小的那行（最早写入）。"""
    rows = connection.execute("SELECT MIN(id) FROM event_logs GROUP BY entityId, createdAt, stateDiff").fetchall()
    return [int(row[0]) for row in rows]


def plan(connection: sqlite3.Connection, ids: list[int]) -> list[tuple[int, int]]:
    """把要处理的 id 区间切出来（覆盖全表范围，删除时再排除保留 id）。"""
    minimum, maximum = connection.execute("SELECT MIN(id), MAX(id) FROM event_logs").fetchone()
    if minimum is None:
        return []
    return [(start, min(start + BATCH, int(maximum) + 1)) for start in range(int(minimum), int(maximum) + 1, BATCH)]


def _vacuum(connection: sqlite3.Connection, db: Path) -> None:
    """回收磁盘（重写库文件，持排他锁）。"""
    print("VACUUM：重写库文件以回收磁盘（持排他锁，可能需要数十秒）…")
    started = time.monotonic()
    connection.execute("VACUUM")
    print(f"VACUUM 完成（{time.monotonic() - started:.1f}s），当前 {db.stat().st_size / 1024**3:.2f} GB")


def dedup(db: Path, *, apply: bool, vacuum: bool) -> int:
    if not db.is_file():
        print(f"数据库不存在：{db}", file=sys.stderr)
        return 2
    connection = _connect(db)
    try:
        total, unique = measure(connection)
        print(f"库：{db}（{db.stat().st_size / 1024**3:.2f} GB）")
        print(f"事件日志 {total} 行，其中 {unique} 条唯一事件（可删 {total - unique} 行）")
        if total == unique:
            # 已经没有重复，但 --vacuum 仍要执行：删行不缩文件，上一次清理的空白页
            # 只有 VACUUM 能还给磁盘。早期版本在这里直接 return，于是「先删后收」的
            # 两步流程第二步会静默什么都不做。
            print("无需去重。")
            if apply and vacuum:
                _vacuum(connection, db)
            return 0
        if not apply:
            print("dry-run：未修改。去掉 --dry-run 执行。")
            return 0

        ids = keep_ids(connection)
        # 保留 id 放临时表：删除语句里用 ``NOT IN (子查询)`` 时 SQLite 会建自动索引，
        # 比把几千个 id 拼进 SQL 文本安全得多（也不会撞 SQLITE_MAX_VARIABLE_NUMBER）。
        connection.execute("DROP TABLE IF EXISTS temp.keep_event_ids")
        connection.execute("CREATE TEMP TABLE keep_event_ids (id INTEGER PRIMARY KEY)")
        connection.executemany("INSERT INTO keep_event_ids (id) VALUES (?)", [(value,) for value in ids])

        ranges = plan(connection, ids)
        deleted = 0
        started = time.monotonic()
        for index, (start, end) in enumerate(ranges, start=1):
            connection.execute("BEGIN IMMEDIATE")
            try:
                cursor = connection.execute(
                    "DELETE FROM event_logs WHERE id >= ? AND id < ? AND id NOT IN (SELECT id FROM keep_event_ids)",
                    (start, end),
                )
                removed = int(cursor.rowcount or 0)
                connection.commit()
            except BaseException:
                connection.rollback()
                raise
            deleted += removed
            if index % 20 == 0 or index == len(ranges):
                elapsed = time.monotonic() - started
                print(f"  已处理 {index}/{len(ranges)} 批，删除 {deleted} 行（{elapsed:.1f}s）")

        after_total, after_unique = measure(connection)
        print(f"完成：删除 {deleted} 行，剩余 {after_total} 行（唯一 {after_unique} 条）")
        if after_total != after_unique:
            print("警告：仍有重复，请重跑一次（在线写入可能与清理交错）。", file=sys.stderr)
        if vacuum:
            _vacuum(connection, db)
        else:
            print("未回收磁盘：删行不会缩小文件。低峰时加 --vacuum 回收。")
        return 0
    finally:
        connection.close()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--db", type=Path, default=DEFAULT_DB, help="数据库路径（默认 homeos/data/homeos.db）")
    parser.add_argument("--dry-run", action="store_true", help="只统计，不写库")
    parser.add_argument("--vacuum", action="store_true", help="删除后 VACUUM 回收磁盘（慢，持排他锁）")
    args = parser.parse_args()
    return dedup(args.db, apply=not args.dry_run, vacuum=args.vacuum)


if __name__ == "__main__":
    raise SystemExit(main())
