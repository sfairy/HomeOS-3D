#!/usr/bin/env python3
"""重建事件日志的小时汇总表（``event_log_stats_hourly``）。

## 什么时候要跑

- **首次升级**：老库只有 ``event_logs``，汇总表是新建的空表 → 报表会显示 0。
- **改了家庭时区**（``ops.homeTimezone``）：``bucketKey`` 存的是当地墙钟文本，
  时区变了旧行的日/小时归属就不对；必须清空重建。
- **怀疑汇总与原始表不一致**（崩溃、手工删过原始表）：用 ``--verify`` 对账。

## 用法（仓库根）

```bash
# 1) 对账：比较汇总总数与原始表行数（只读，先跑这个）
node ops/lib/py.mjs ops/scripts/rebuild-event-stats.py --verify

# 2) 重建（会先清空汇总表；建议停 dev / 容器，避免与写入争锁）
node ops/lib/py.mjs ops/scripts/rebuild-event-stats.py --rebuild

# 3) 只重建最近 N 天（大库首次升级时可以先补近几天，历史交给保留策略）
node ops/lib/py.mjs ops/scripts/rebuild-event-stats.py --rebuild --days 7
```

安全约束：默认只操作 ``homeos/data/homeos.db``；其它路径必须 ``--db`` 显式给出；
``--rebuild`` 前会检测 ``-wal`` 是否在增长，检测到活动写入要求加 ``--force``。
"""

from __future__ import annotations

import argparse
import sqlite3
import sys
from datetime import UTC, datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from zoneinfo import ZoneInfo

from _db_util import assert_no_active_writer

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DB = ROOT / "homeos" / "data" / "homeos.db"
BUSINESS_TIME_ZONE = "Asia/Shanghai"


def _resolve_timezone(connection: sqlite3.Connection) -> ZoneInfo:
    """从 ``system_configs.data`` 读 ``ops.homeTimezone``；读不到用默认值。"""
    try:
        row = connection.execute("SELECT data FROM system_configs WHERE id='default'").fetchone()
        if row and row[0]:
            import json

            config = json.loads(row[0])
            name = str((config.get("ops") or {}).get("homeTimezone") or "").strip()
            if name:
                return ZoneInfo(name)
    except sqlite3.Error, ValueError, KeyError, TypeError:
        pass
    return ZoneInfo(BUSINESS_TIME_ZONE)


def _hour_keys(moment_utc: datetime, tz: ZoneInfo) -> tuple[str, str]:
    aware = moment_utc if moment_utc.tzinfo is not None else moment_utc.replace(tzinfo=UTC)
    return aware.astimezone(tz).strftime("%Y-%m-%d %H"), aware.astimezone(UTC).strftime("%Y-%m-%d %H")


def verify(connection: sqlite3.Connection) -> int:
    raw = connection.execute("SELECT COUNT(*) FROM event_logs").fetchone()[0]
    try:
        rolled = connection.execute("SELECT COALESCE(SUM(count), 0) FROM event_log_stats_hourly").fetchone()[0]
    except sqlite3.OperationalError:
        print("汇总表不存在（尚未跑过 --rebuild）")
        return 1
    print(f"原始表 {raw} 行 / 汇总 {rolled} 条")
    if int(raw) == int(rolled):
        print("对账一致")
        return 0
    print(f"差 {int(rolled) - int(raw):+d} 条：跑 --rebuild 重建")
    return 1


def rebuild(connection: sqlite3.Connection, days: int | None, batch: int) -> int:
    tz = _resolve_timezone(connection)
    connection.execute("DELETE FROM event_log_stats_hourly")
    connection.commit()

    sql = "SELECT id, entityId, domain, createdAt FROM event_logs"
    params: tuple[object, ...] = ()
    if days is not None:
        cutoff = (datetime.now(UTC) - timedelta(days=days)).strftime("%Y-%m-%d %H:%M:%S")
        sql += " WHERE createdAt >= ?"
        params = (cutoff,)
    sql += " ORDER BY id"

    counts: dict[tuple[str, str, str, str], int] = {}
    scanned = 0
    cursor = connection.execute(sql, params)
    while True:
        rows = cursor.fetchmany(batch)
        if not rows:
            break
        for _row_id, entity_id, domain, created_at in rows:
            moment = _parse_created_at(created_at)
            local, utc = _hour_keys(moment, tz)
            key = (local, utc, domain or "", entity_id)
            counts[key] = counts.get(key, 0) + 1
            scanned += 1
        if len(counts) >= 50000:
            _flush(connection, counts)
            counts.clear()
    _flush(connection, counts)
    connection.commit()
    print(f"重建完成：扫描 {scanned} 行（时区 {tz.key}）")
    return 0


def _parse_created_at(raw: object) -> datetime:
    if isinstance(raw, datetime):
        return raw
    text = str(raw or "").strip()
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        return datetime.now(UTC)
    return parsed if parsed.tzinfo is not None else parsed.replace(tzinfo=UTC)


def _flush(connection: sqlite3.Connection, counts: dict[tuple[str, str, str, str], int]) -> None:
    if not counts:
        return
    connection.executemany(
        "INSERT INTO event_log_stats_hourly (bucketKey, bucketUtc, domain, entityId, count) "
        "VALUES (?, ?, ?, ?, ?) "
        "ON CONFLICT(bucketKey, domain, entityId) DO UPDATE SET count = count + excluded.count",
        [(local, utc, domain, entity_id, count) for (local, utc, domain, entity_id), count in counts.items()],
    )
    connection.commit()


def main() -> int:
    parser = argparse.ArgumentParser(description="重建事件日志小时汇总")
    parser.add_argument("--db", default=str(DEFAULT_DB), help="数据库路径（默认 homeos/data/homeos.db）")
    parser.add_argument("--verify", action="store_true", help="只对账（默认动作）")
    parser.add_argument("--rebuild", action="store_true", help="清空并重建汇总表")
    parser.add_argument("--days", type=int, default=None, help="只重建最近 N 天（默认全量）")
    parser.add_argument("--batch", type=int, default=5000, help="每批扫描行数（默认 5000）")
    parser.add_argument("--force", action="store_true", help="即使检测到活动写入也继续")
    args = parser.parse_args()

    db = Path(args.db).resolve()
    if not db.is_file():
        raise SystemExit(f"数据库不存在：{db}")
    if args.rebuild:
        assert_no_active_writer(db, args.force)

    connection = sqlite3.connect(str(db) if args.rebuild else f"file:{db}?mode=ro", uri=not args.rebuild, timeout=10)
    try:
        connection.execute("PRAGMA busy_timeout=10000")
        if args.rebuild:
            return rebuild(connection, args.days, max(1, args.batch))
        return verify(connection)
    finally:
        connection.close()


if __name__ == "__main__":
    raise SystemExit(main())
