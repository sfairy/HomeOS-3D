#!/usr/bin/env python3
"""修复 ``agent_context_timeline`` 的「未结束行」：同实体多条 ``endedAt IS NULL`` 只应保留最新一条。

## 为什么会有脏数据

``timeline._write_row`` 结算上一条时靠 ``SELECT … endedAt IS NULL``；而会话工厂是
``autoflush=False``，同一批里连续变化的两条记录之间没有 flush，第二条 SELECT 看不到
第一条刚 add 的 INSERT —— 前一条因此永远停在「仍在持续」。写入侧已改为逐条 flush
（见 ``domains/agent/memory/timeline.py``），本脚本只负责清理历史存量。

## 口径

- 按 ``entityId`` 取全部行并按 ``changedAt`` 升序；
- 对每条 ``endedAt IS NULL`` 的行：若它后面还有行，就用下一行的 ``changedAt`` 结算，
  ``durationSeconds`` 取差值（不小于 0）；
- 只有「该实体最新一行」允许保持未结束；
- 没有后继行可结算的行一律不动（那是真的仍在持续）。

## 用法（仓库根）

```bash
# 1) 只看会改多少（不写库）
node ops/lib/py.mjs ops/scripts/fix-timeline-open-rows.py --dry-run

# 2) 真正执行（建议先停掉 dev / 容器，避免与写入侧争锁）
node ops/lib/py.mjs ops/scripts/fix-timeline-open-rows.py --apply
```

安全约束：默认只操作 ``homeos/data/homeos.db``；其它路径必须 ``--db`` 显式给出；
``--apply`` 前会检测 ``-wal`` 是否在增长，检测到活动写入要求加 ``--force``。
"""

from __future__ import annotations

import argparse
import sqlite3
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from _db_util import assert_no_active_writer

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DB = ROOT / "homeos" / "data" / "homeos.db"


def plan_fixes(connection: sqlite3.Connection) -> list[tuple[int, str, str, int]]:
    """返回 ``(id, entityId, 新的 endedAt, durationSeconds)`` 列表。"""
    rows = connection.execute(
        "SELECT id, entityId, changedAt, endedAt FROM agent_context_timeline ORDER BY entityId, changedAt"
    ).fetchall()
    fixes: list[tuple[int, str, str, int]] = []
    index = 0
    total = len(rows)
    while index < total:
        entity = rows[index][1]
        start = index
        while index < total and rows[index][1] == entity:
            index += 1
        segment = rows[start:index]
        for position, (_row_id, _entity, changed_at, ended_at) in enumerate(segment):
            if ended_at is not None:
                continue
            if position + 1 >= len(segment):
                continue  # 最新一行允许保持未结束
            next_changed_at = segment[position + 1][2]
            duration = max(0, _seconds_between(changed_at, next_changed_at))
            fixes.append((_row_id, entity, next_changed_at, duration))
    return fixes


def _seconds_between(start: str, end: str) -> int:
    from datetime import datetime

    def parse(value: str) -> datetime:
        text = str(value or "").strip()
        if text.endswith("Z"):
            text = text[:-1] + "+00:00"
        return datetime.fromisoformat(text)

    try:
        return int((parse(end) - parse(start)).total_seconds())
    except TypeError, ValueError:
        return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="修复 agent_context_timeline 的未结束行")
    parser.add_argument("--db", default=str(DEFAULT_DB), help="数据库路径（默认 homeos/data/homeos.db）")
    parser.add_argument("--apply", action="store_true", help="真正写库（默认只预览）")
    parser.add_argument("--dry-run", action="store_true", help="只预览（默认行为，显式写法）")
    parser.add_argument("--force", action="store_true", help="即使检测到活动写入也继续")
    parser.add_argument("--batch", type=int, default=500, help="每批提交行数（默认 500）")
    args = parser.parse_args()

    db = Path(args.db).resolve()
    if not db.is_file():
        raise SystemExit(f"数据库不存在：{db}")
    if args.apply:
        assert_no_active_writer(db, args.force)

    if args.apply:
        connection = sqlite3.connect(str(db), timeout=10)
    else:
        connection = sqlite3.connect(f"file:{db}?mode=ro", uri=True, timeout=10)
    try:
        connection.execute("PRAGMA busy_timeout=10000")
        fixes = plan_fixes(connection)
        affected_entities = len({item[1] for item in fixes})
        print(f"待修复未结束行：{len(fixes)} 条（涉及 {affected_entities} 个实体）")
        for row_id, entity, ended_at, duration in fixes[:5]:
            print(f"  例：id={row_id} {entity} → endedAt={ended_at} duration={duration}s")

        if not args.apply:
            print("未写库（预览模式）。加 --apply 执行。")
            return 0

        written = 0
        for offset in range(0, len(fixes), max(1, args.batch)):
            chunk = fixes[offset : offset + max(1, args.batch)]
            connection.executemany(
                "UPDATE agent_context_timeline SET endedAt = ?, durationSeconds = ? WHERE id = ? AND endedAt IS NULL",
                [(ended_at, duration, row_id) for row_id, _entity, ended_at, duration in chunk],
            )
            connection.commit()
            written += len(chunk)
            print(f"  已提交 {written}/{len(fixes)}")
        print(f"完成：修复 {written} 条")
        return 0
    finally:
        connection.close()


if __name__ == "__main__":
    raise SystemExit(main())
