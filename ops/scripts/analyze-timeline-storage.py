#!/usr/bin/env python3
"""时序表存储分析 / 归一化推演（P23 的**可执行部分**）。

``# noqa: S608`` 说明：下面所有 f-string SQL 只拼接本文件内的表名 / 列名常量，
没有任何外部输入参与，不构成注入面。


## 这份脚本解决什么

``agent_context_timeline`` 占库 96%（表 + 三个索引）。审计给出的优化方向是
「把 45 字符的 ``entityId`` 换成一个整数外键」。但那是一次**改表结构 + 改读写路径**的
迁移，不能凭感觉上：要先知道能省多少、查询会不会变慢。

本脚本在**副本**上把迁移真跑一遍并量出结果，生产库只读。

## 用法（仓库根）

```bash
# 1) 只分析（生产库只读）：表/索引体积、列宽、查询耗时
node ops/lib/py.mjs ops/scripts/analyze-timeline-storage.py

# 2) 在副本上推演归一化（会复制一份库，约等于库大小；结束后可 --keep 保留副本）
node ops/lib/py.mjs ops/scripts/analyze-timeline-storage.py --simulate

# 3) 推演并保留副本，便于人工检查
node ops/lib/py.mjs ops/scripts/analyze-timeline-storage.py --simulate --keep /tmp/timeline-normalized.db
```

## 推演做了什么（与将来正式迁移同一套 SQL）

1. 建 ``entity_ref(id INTEGER PK, entityId TEXT UNIQUE)`` 并从现有行填充；
2. 给时序表加 ``entityRefId INTEGER`` 并回填；
3. 建 ``(entityRefId, changedAt)`` / ``(entityRefId, endedAt)`` 索引；
4. 删掉原来的 ``entityIdx``（文本前缀那个）；
5. ``VACUUM`` 后量体积，并跑同一批查询量耗时。

正式迁移还必须改应用读写路径（写入解析/复用 ref、查询按 ref 过滤），
那部分不在本脚本范围内 —— 本脚本只证明「值不值得做」以及「SQL 是否可行」。
"""

from __future__ import annotations

import argparse
import shutil
import sqlite3
import sys
import tempfile
import time
from contextlib import closing
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from _db_util import human_bytes

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DB = ROOT / "homeos" / "data" / "homeos.db"
TABLE = "agent_context_timeline"


def _table_sizes(connection: sqlite3.Connection) -> list[tuple[str, int]]:
    """各对象占用字节；``dbstat`` 虚拟表不可用（部分 Python 构建未启用）时返回空列表。"""
    try:
        rows = connection.execute(
            "SELECT name, SUM(pgsize) AS bytes FROM dbstat GROUP BY name ORDER BY bytes DESC"
        ).fetchall()
    except sqlite3.OperationalError:
        return []
    return [(str(name), int(size or 0)) for name, size in rows]


def _file_stats(connection: sqlite3.Connection) -> tuple[int, int, int]:
    page_size = int(connection.execute("PRAGMA page_size").fetchone()[0])
    page_count = int(connection.execute("PRAGMA page_count").fetchone()[0])
    freelist = int(connection.execute("PRAGMA freelist_count").fetchone()[0])
    return page_size, page_count, freelist


def _report_sizes(connection: sqlite3.Connection, title: str) -> dict[str, int]:
    sizes = dict(_table_sizes(connection))
    if not sizes:
        # 没有 dbstat：退化为「文件大小 + 空闲页」，足够判断收益量级。
        page_size, page_count, freelist = _file_stats(connection)
        total = page_size * page_count
        print(
            f"\n== {title} ==  逻辑 {human_bytes(total)}（dbstat 不可用，仅文件级统计；"
            f"空闲 {human_bytes(freelist * page_size)}）"
        )
        return {TABLE: total}
    total = sum(sizes.values())
    print(f"\n== {title} ==  库合计 {human_bytes(total)}")
    for name, size in _table_sizes(connection)[:12]:
        if size < 1024 * 1024:
            continue
        print(f"  {human_bytes(size):>9}  {name}")
    return sizes


def _column_widths(connection: sqlite3.Connection) -> None:
    row = connection.execute(
        f"SELECT COUNT(*), AVG(LENGTH(entityId)), AVG(LENGTH(context)), "  # noqa: S608
        f"AVG(LENGTH(peerSnapshot)), AVG(LENGTH(newState)), "
        f"SUM(CASE WHEN areaId <> '' THEN 1 ELSE 0 END) FROM {TABLE}"
    ).fetchone()
    if not row:
        return
    total, entity_len, context_len, peer_len, state_len, area_filled = row
    print(
        f"\n行数 {int(total):,} / entityId 平均 {float(entity_len or 0):.1f} 字符 / "
        f"context 平均 {float(context_len or 0):.1f} 字节 / peerSnapshot {float(peer_len or 0):.1f} / "
        f"newState {float(state_len or 0):.1f} / areaId 非空 {int(area_filled or 0):,}"
    )


def _timings(connection: sqlite3.Connection) -> dict[str, float]:
    """同一批代表性查询的耗时（毫秒）。"""
    queries = {
        "按实体取最近 50 条": (
            f"SELECT * FROM {TABLE} WHERE entityId = (SELECT entityId FROM {TABLE} LIMIT 1) "  # noqa: S608
            f"ORDER BY changedAt DESC LIMIT 50"
        ),
        "按时间窗分组（日）": (
            f"SELECT substr(changedAt,1,10), COUNT(*) FROM {TABLE} "  # noqa: S608
            f"WHERE changedAt >= datetime('now','-7 day') GROUP BY 1"
        ),
        "找同实体最后一条未结束": (
            f"SELECT id FROM {TABLE} WHERE entityId = (SELECT entityId FROM {TABLE} LIMIT 1) "  # noqa: S608
            f"AND endedAt IS NULL ORDER BY changedAt DESC LIMIT 1"
        ),
    }
    results: dict[str, float] = {}
    for label, sql in queries.items():
        started = time.perf_counter()
        connection.execute(sql).fetchall()
        results[label] = (time.perf_counter() - started) * 1000
        print(f"  {label}: {results[label]:.1f} ms")
    return results


def _simulate(source: Path, keep: Path | None) -> int:
    """在副本上跑归一化并量收益。"""
    workdir = Path(tempfile.mkdtemp(prefix="homeos-timeline-sim-"))
    copy = keep or (workdir / "normalized.db")
    print(f"\n复制数据库 → {copy}（{human_bytes(source.stat().st_size)}）")
    shutil.copy2(source, copy)

    with closing(sqlite3.connect(str(copy))) as connection:
        connection.execute("PRAGMA journal_mode=WAL")
        connection.execute("PRAGMA busy_timeout=30000")
        before = _report_sizes(connection, "归一化前")

        print("\n建 entity_ref 并回填 …")
        started = time.perf_counter()
        connection.execute(
            "CREATE TABLE IF NOT EXISTS entity_ref (id INTEGER PRIMARY KEY AUTOINCREMENT, entityId TEXT NOT NULL UNIQUE)"
        )
        connection.execute(
            f"INSERT OR IGNORE INTO entity_ref (entityId) SELECT DISTINCT entityId FROM {TABLE}"  # noqa: S608
        )
        connection.commit()
        refs = connection.execute("SELECT COUNT(*) FROM entity_ref").fetchone()[0]
        print(f"  去重后实体数 {int(refs):,}（原表 {before.get(TABLE, 0) and human_bytes(before[TABLE])}）")

        connection.execute(f"ALTER TABLE {TABLE} ADD COLUMN entityRefId INTEGER")
        connection.execute(
            f"UPDATE {TABLE} SET entityRefId = (SELECT id FROM entity_ref WHERE entity_ref.entityId = {TABLE}.entityId)"  # noqa: S608
        )
        connection.commit()
        print(f"  回填用时 {time.perf_counter() - started:.1f}s")

        print("建整数前缀索引并删掉文本前缀索引 …")
        connection.execute(f"CREATE INDEX IF NOT EXISTS {TABLE}_ref_changed_idx ON {TABLE} (entityRefId, changedAt)")
        connection.execute(f"CREATE INDEX IF NOT EXISTS {TABLE}_ref_open_idx ON {TABLE} (entityRefId, endedAt)")
        connection.execute(f"DROP INDEX IF EXISTS {TABLE}_entity_idx")
        connection.execute(f"DROP INDEX IF EXISTS {TABLE}_open_idx")
        connection.commit()

        print("VACUUM 收缩文件 …")
        started = time.perf_counter()
        connection.execute("VACUUM")
        print(f"  用时 {time.perf_counter() - started:.1f}s")
        after = _report_sizes(connection, "归一化后")

        print("\n查询耗时（归一化后，仍在同一副本上）：")
        _timings(connection)

        saved = max(0, sum(before.values()) - sum(after.values()))
        print(
            f"\n结论：库 {human_bytes(sum(before.values()))} → {human_bytes(sum(after.values()))}"
            f"，回收 {human_bytes(saved)}（{saved / max(1, sum(before.values())) * 100:.1f}%）"
        )

    if keep:
        print(f"副本已保留：{copy}")
    else:
        shutil.rmtree(workdir, ignore_errors=True)
        print("副本已删除（需要保留请用 --keep <path>）")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="时序表存储分析与归一化推演")
    parser.add_argument("--db", default=str(DEFAULT_DB), help="数据库路径（默认 homeos/data/homeos.db）")
    parser.add_argument("--simulate", action="store_true", help="在副本上推演归一化")
    parser.add_argument("--keep", default="", help="推演副本保存路径（不给则用完即删）")
    args = parser.parse_args()

    source = Path(args.db).resolve()
    if not source.is_file():
        raise SystemExit(f"数据库不存在：{source}")

    if args.simulate:
        return _simulate(source, Path(args.keep).resolve() if args.keep else None)

    with closing(sqlite3.connect(f"file:{source}?mode=ro", uri=True)) as connection:
        _report_sizes(connection, "当前")
        _column_widths(connection)
        print("\n查询耗时（当前）：")
        _timings(connection)
        print("\n加 --simulate 在副本上推演归一化（不改动本库）。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
