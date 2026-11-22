#!/usr/bin/env python3
"""设备时序表的磁盘回收：VACUUM 收缩文件（删行由定时清理负责）。

## 为什么还要这个脚本

``agent_context_timeline`` 已经有**自动清理**：它以 ``deviceTimeline`` 为键进入
``DatabaseRetentionService.run_cleanup`` 的定时批次，按配置的保留天数分批删行。
但 SQLite 删行只把页标成空闲，**文件不会变小** —— 2 个月涨到 0.94 GB 的库，删完仍是
0.94 GB。真正把磁盘还回去的是 ``VACUUM``，而它要重写整个库文件、期间持有排他锁
（905MB 实测数分钟），既不能放进启动流程，也不该塞进定时任务里赌用户没在用。

所以分工是：**删行 = 自动定时**；**收缩 = 本脚本，低峰手工执行**。

用法（仓库根）::

    # 1) 先看会删多少（不写库）
    node ops/lib/py.mjs ops/scripts/prune-agent-timeline.py --days 14 --dry-run

    # 2) 真正执行（分批删除 + 可选 VACUUM）
    node ops/lib/py.mjs ops/scripts/prune-agent-timeline.py --days 14 --vacuum

    # 3) 只删不收缩（SQLite 删行不会缩小文件，但空闲页会被复用）
    node ops/lib/py.mjs ops/scripts/prune-agent-timeline.py --days 14

安全约束：

- 默认只操作 ``homeos/data/homeos.db``；其它路径必须 ``--db`` 显式给出。
- 应用运行中执行会让写请求撞 ``busy_timeout``；脚本开头会检测 ``-wal`` 是否在变，
  检测到活动写入就要求 ``--force`` 才继续。
- 分批删除，单批 ``--batch``（默认 5000）行，每批独立事务，随时可中断。
"""

from __future__ import annotations

import argparse
import sqlite3
import sys
import time
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DB = REPO_ROOT / "homeos" / "data" / "homeos.db"
TABLE = "agent_context_timeline"
#: 表名是模块内常量；SQL 里直接写字面量，避免 S608 把常量插值当成注入面。
_COUNT_SQL = 'SELECT COUNT(*) FROM "agent_context_timeline" WHERE "changedAt" < ?'
_TOTAL_SQL = 'SELECT COUNT(*) FROM "agent_context_timeline"'
_DELETE_SQL = (
    'DELETE FROM "agent_context_timeline" WHERE rowid IN ('
    '  SELECT rowid FROM "agent_context_timeline" WHERE "changedAt" < ? LIMIT ?)'
)


def _table_exists(connection: sqlite3.Connection, name: str) -> bool:
    row = connection.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (name,)).fetchone()
    return row is not None


def _count_before(connection: sqlite3.Connection, cutoff: str) -> int:
    return int(connection.execute(_COUNT_SQL, (cutoff,)).fetchone()[0])


def _db_bytes(path: Path) -> int:
    total = 0
    for suffix in ("", "-wal", "-shm"):
        candidate = Path(f"{path}{suffix}")
        if candidate.is_file():
            total += candidate.stat().st_size
    return total


def _wal_is_active(path: Path, window: float = 1.0) -> bool:
    """``-wal`` 在 ``window`` 秒内变大 → 有进程正在写库。"""
    wal = Path(f"{path}-wal")
    if not wal.is_file():
        return False
    first = wal.stat().st_size
    time.sleep(window)
    if not wal.is_file():
        return False
    return wal.stat().st_size != first


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description="按天数裁剪设备时序表并可选 VACUUM")
    parser.add_argument("--db", type=Path, default=DEFAULT_DB, help="数据库路径")
    parser.add_argument("--days", type=int, default=14, help="保留最近多少天（默认 14）")
    parser.add_argument("--batch", type=int, default=5000, help="单批删除行数（默认 5000）")
    parser.add_argument("--vacuum", action="store_true", help="删除后执行 VACUUM 回收磁盘")
    parser.add_argument("--dry-run", action="store_true", help="只统计，不写库")
    parser.add_argument("--force", action="store_true", help="检测到活动写入时仍然执行")
    args = parser.parse_args(argv)

    path: Path = args.db
    if not path.is_file():
        print(f"数据库不存在：{path}", file=sys.stderr)
        return 2
    if args.days < 1:
        print("--days 必须 >= 1", file=sys.stderr)
        return 2

    if not args.dry_run and _wal_is_active(path) and not args.force:
        print(
            "检测到数据库正在被写入（-wal 仍在增长）。\n"
            "请先停止应用（bun run dev 或容器），或确认可以短暂锁库后加 --force。",
            file=sys.stderr,
        )
        return 3

    cutoff = time.strftime("%Y-%m-%d %H:%M:%S", time.gmtime(time.time() - args.days * 86400))
    before_bytes = _db_bytes(path)
    connection = sqlite3.connect(str(path), timeout=10, isolation_level=None)
    try:
        if not _table_exists(connection, TABLE):
            print(f"表 {TABLE} 不存在，无需处理。")
            return 0
        connection.execute("PRAGMA busy_timeout=10000")
        total_rows = int(connection.execute(_TOTAL_SQL).fetchone()[0])
        stale_rows = _count_before(connection, cutoff)
        print(f"数据库：{path}（{before_bytes / 1024 / 1024:.1f} MB）")
        print(f"表 {TABLE}：共 {total_rows:,} 行，早于 {cutoff}（保留 {args.days} 天）的有 {stale_rows:,} 行")

        if args.dry_run:
            print("--dry-run：未做任何改动。")
            return 0
        if stale_rows == 0 and not args.vacuum:
            print("无需删除。")
            return 0

        removed = 0
        while True:
            connection.execute("BEGIN IMMEDIATE")
            try:
                cursor = connection.execute(_DELETE_SQL, (cutoff, args.batch))
                deleted = int(cursor.rowcount or 0)
                connection.execute("COMMIT")
            except Exception:
                connection.execute("ROLLBACK")
                raise
            removed += deleted
            print(f"  已删除 {removed:,} 行…", end="\r", flush=True)
            if deleted < args.batch:
                break
        print(f"  已删除 {removed:,} 行。            ")

        if args.vacuum:
            print("VACUUM 中（期间独占数据库，请勿中断）…")
            connection.execute("VACUUM")
            print("VACUUM 完成。")
    finally:
        connection.close()

    after_bytes = _db_bytes(path)
    print(
        f"完成：{before_bytes / 1024 / 1024:.1f} MB → {after_bytes / 1024 / 1024:.1f} MB"
        f"（{'回收' if after_bytes < before_bytes else '变化'} "
        f"{abs(before_bytes - after_bytes) / 1024 / 1024:.1f} MB）"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
