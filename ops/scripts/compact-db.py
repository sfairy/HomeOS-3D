#!/usr/bin/env python3
"""数据库空间回收：把删行后留下的空闲页还给文件系统。

## 为什么需要

SQLite 的 ``DELETE`` 只把页标成空闲，**文件不会变小**。实测时序表占库 96%
（表 513 MB + 三个索引 333 MB，共 855 MB），保留策略删完行文件仍是 855 MB。
回收有两种方式：

- ``PRAGMA incremental_vacuum(N)``：按页逐步归还，**不重写整库、不长时间持锁**，
  但要求库处于 ``auto_vacuum=INCREMENTAL``（新库建表前已设；存量库需先做一次
  ``VACUUM`` 才切过去）。清理线程默认的 ``incremental`` 模式就跑这条。
- ``VACUUM``：重写整个库文件，905 MB 实测数分钟且全程持排他锁 —— 只能低峰手工跑。

本脚本把两者收成一条命令：先诊断（大小 / 空闲页 / auto_vacuum 模式），再按选择执行，
最后打印回收了多少。

## 用法（仓库根）

```bash
# 1) 只诊断（只读，随时可跑）
node ops/lib/py.mjs ops/scripts/compact-db.py

# 2) 增量回收（需 auto_vacuum=INCREMENTAL；库若还是 NONE 会提示先跑 --full）
node ops/lib/py.mjs ops/scripts/compact-db.py --incremental

# 3) 整库重写（低峰执行；会持排他锁，先停 dev / 容器）
node ops/lib/py.mjs ops/scripts/compact-db.py --full --force
```
"""

from __future__ import annotations

import argparse
import sqlite3
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from _db_util import assert_no_active_writer, human_bytes

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DB = ROOT / "homeos" / "data" / "homeos.db"


def _diagnose(connection: sqlite3.Connection, db: Path) -> dict[str, object]:
    page_size = connection.execute("PRAGMA page_size").fetchone()[0]
    page_count = connection.execute("PRAGMA page_count").fetchone()[0]
    freelist = connection.execute("PRAGMA freelist_count").fetchone()[0]
    auto_vacuum = connection.execute("PRAGMA auto_vacuum").fetchone()[0]
    mode = {0: "NONE", 1: "FULL", 2: "INCREMENTAL"}.get(int(auto_vacuum), str(auto_vacuum))
    return {
        "file": db.stat().st_size if db.is_file() else 0,
        "logical": int(page_size) * int(page_count),
        "free": int(page_size) * int(freelist),
        "freelist": int(freelist),
        "auto_vacuum": mode,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="数据库空间回收")
    parser.add_argument("--db", default=str(DEFAULT_DB), help="数据库路径（默认 homeos/data/homeos.db）")
    parser.add_argument("--incremental", action="store_true", help="跑 PRAGMA incremental_vacuum")
    parser.add_argument("--full", action="store_true", help="跑 VACUUM（重写整库，需低峰）")
    parser.add_argument("--pages", type=int, default=0, help="增量回收页数，0 = 全部空闲页")
    parser.add_argument("--force", action="store_true", help="即使检测到活动写入也继续")
    args = parser.parse_args()

    db = Path(args.db).resolve()
    if not db.is_file():
        raise SystemExit(f"数据库不存在：{db}")

    write_mode = args.incremental or args.full
    if write_mode:
        assert_no_active_writer(db, args.force)
    connection = sqlite3.connect(str(db) if write_mode else f"file:{db}?mode=ro", uri=not write_mode, timeout=30)
    try:
        connection.execute("PRAGMA busy_timeout=30000")
        before = _diagnose(connection, db)
        print(
            f"文件 {human_bytes(int(before['file']))} / 逻辑页 {human_bytes(int(before['logical']))} / "
            f"空闲 {human_bytes(int(before['free']))}（{before['freelist']} 页）/ auto_vacuum={before['auto_vacuum']}"
        )

        if not write_mode:
            print("只诊断（未写库）。加 --incremental 或 --full 执行回收。")
            return 0

        if args.full:
            print("执行 VACUUM（重写整库，期间持排他锁）…")
            started = time.monotonic()
            connection.execute("VACUUM")
            print(f"完成，用时 {time.monotonic() - started:.1f}s")
        else:
            if before["auto_vacuum"] != "INCREMENTAL":
                print(
                    "库当前不是 auto_vacuum=INCREMENTAL：增量回收不会减小文件。\n"
                    "先跑一次 --full（会顺带切到增量模式），之后每轮清理都能逐步归还空闲页。"
                )
                return 1
            print("执行 PRAGMA incremental_vacuum …")
            started = time.monotonic()
            connection.execute(f"PRAGMA incremental_vacuum({max(0, args.pages)})")
            print(f"完成，用时 {time.monotonic() - started:.1f}s")

        after = _diagnose(connection, db)
        reclaimed = int(before["file"]) - int(after["file"])
        print(
            f"回收后 文件 {human_bytes(int(after['file']))} / 空闲 {human_bytes(int(after['free']))}"
            f"（{after['freelist']} 页）/ 已归还 {human_bytes(max(0, reclaimed))}"
        )
        return 0
    finally:
        connection.close()


if __name__ == "__main__":
    raise SystemExit(main())
