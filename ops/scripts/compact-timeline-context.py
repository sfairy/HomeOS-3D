#!/usr/bin/env python3
"""压缩时序表里「存了但没人读」的 context 字段（P23 的最终形态）。

## 为什么不是 entity_ref

实测结论（``analyze-timeline-storage.py --simulate``）：把 45 字符的 ``entityId``
换成整数外键，全库只省 **18.4%**（855 MB → 850 MB），却要改写入、查询、保留、备份
四条路径 —— 不值得。

真正的浪费在 ``context``：227 万行里它平均 72 字节，而**去重后仍是 227 万条**
（每行都不一样）。原因很具体：HA 的 ``context`` 带一个逐事件唯一的 ``id``（ULID），
而这个字段从来没有任何消费方 —— 归因只读 ``user_id`` / ``parent_id``
（见 ``timeline._resolve_source``）。

所以口径是：**只保留归因字段**。两个都为空时就是 ``{}``（2 字节），
单行省约 70 字节；227 万行量级约 150–160 MB。

写入侧已经在 ``timeline._prepare`` 里做了（新行不会再胖）；本脚本负责历史行。

## 用法（仓库根）

```bash
# 1) 只看会改多少（只读）
node ops/lib/py.mjs ops/scripts/compact-timeline-context.py --dry-run

# 2) 真正执行（建议先停 dev / 容器）
node ops/lib/py.mjs ops/scripts/compact-timeline-context.py --apply

# 3) 执行并顺带 VACUUM（会重写整库、持排他锁，只能低峰跑）
node ops/lib/py.mjs ops/scripts/compact-timeline-context.py --apply --vacuum
```

脚本只改 ``context`` 列，不动任何其它字段；重复执行是幂等的（已经是瘦形态的行会被跳过）。
"""

from __future__ import annotations

import json
import sqlite3
import sys
import time
from contextlib import closing
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from _db_util import assert_no_active_writer, db_arg_parser, human_bytes

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DB = ROOT / "homeos" / "data" / "homeos.db"
TABLE = "agent_context_timeline"
KEEP_KEYS = ("user_id", "parent_id")


def slim(raw: str) -> str:
    """把一行 context 收敛成只含归因字段的 JSON 文本。"""
    try:
        parsed = json.loads(raw) if raw else {}
    except TypeError, json.JSONDecodeError:
        return "{}"
    if not isinstance(parsed, dict):
        return "{}"
    kept = {key: parsed[key] for key in KEEP_KEYS if parsed.get(key) not in (None, "")}
    return json.dumps(kept, ensure_ascii=False, separators=(",", ":"))


def main() -> int:
    parser = db_arg_parser("压缩时序表的 context 字段", DEFAULT_DB)
    parser.add_argument("--vacuum", action="store_true", help="完成后 VACUUM 收缩文件（低峰）")
    parser.add_argument("--batch", type=int, default=5000, help="每批提交行数（默认 5000）")
    args = parser.parse_args()

    db = Path(args.db).resolve()
    if not db.is_file():
        raise SystemExit(f"数据库不存在：{db}")
    if args.apply:
        assert_no_active_writer(db, args.force)
        if args.vacuum:
            assert_no_active_writer(db, args.force)

    dsn = str(db) if args.apply else f"file:{db}?mode=ro"
    with closing(sqlite3.connect(dsn, uri=not args.apply, timeout=30)) as connection:
        connection.execute("PRAGMA busy_timeout=30000")
        total = connection.execute(f"SELECT COUNT(*) FROM {TABLE}").fetchone()[0]  # noqa: S608
        rows = connection.execute(
            f"SELECT id, context FROM {TABLE} WHERE context <> '{{}}'"  # noqa: S608
        )
        planned: list[tuple[str, int]] = []
        saved_bytes = 0
        scanned = 0
        while True:
            chunk = rows.fetchmany(max(1, args.batch))
            if not chunk:
                break
            for row_id, raw in chunk:
                scanned += 1
                compact = slim(raw)
                if compact != (raw or ""):
                    planned.append((compact, row_id))
                    saved_bytes += len(raw or "") - len(compact)
            if not args.apply:
                continue
            if planned:
                connection.executemany(f"UPDATE {TABLE} SET context = ? WHERE id = ?", planned)  # noqa: S608
                connection.commit()
                planned.clear()

        print(
            f"扫描 {scanned:,} / 全表 {int(total):,} 行；"
            f"可压缩 {scanned:,} 行，预计省 {human_bytes(max(0, saved_bytes))}（文本层面）"
        )
        if not args.apply:
            print("未写库（预览模式）。加 --apply 执行。")
            return 0

        if planned:
            connection.executemany(f"UPDATE {TABLE} SET context = ? WHERE id = ?", planned)  # noqa: S608
            connection.commit()

        if args.vacuum:
            before = db.stat().st_size
            print("VACUUM 中（重写整库，持排他锁）…")
            started = time.perf_counter()
            connection.execute("VACUUM")
            print(
                f"完成，用时 {time.perf_counter() - started:.1f}s："
                f"{human_bytes(before)} → {human_bytes(db.stat().st_size)}"
            )
        else:
            print("已写库。文件不会自动变小 —— 加 --vacuum 在低峰收缩，或跑 compact-db.py。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
