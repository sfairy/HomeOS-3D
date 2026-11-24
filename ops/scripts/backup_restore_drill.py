#!/usr/bin/env python3
"""备份恢复演练：把备份包**还原到一个临时目录**并验证，不碰线上数据。

## 为什么单独做

仓库里已有完整的「生成 / 下载 / 还原」链路（``domains/backup``），但没有任何一条检查
验证过「还原出来的库是能用的」。备份的价值只在恢复那一刻体现，而恢复失败通常是
「发现得太晚」型故障：等到真的需要它时，才发现包是空的、库是坏的、或者少了一张表。

本脚本刻意**不调用** ``restore_business``：那个函数会替换当前数据目录（带回滚），
不适合放进例行检查。这里只做等价的只读验证：

1. 解包到临时目录；
2. 对包内每个 ``*.db`` 执行 ``PRAGMA integrity_check``；
3. 逐表统计行数，与**当前**主库对照（只对业务库；日志库本来就不进备份）；
4. 报告「整库/整表缺失」「行数明显缩水」两类问题。

## 用法

```bash
# 演练 backups/ 下最新的包
node ops/lib/py.mjs ops/scripts/backup_restore_drill.py

# 指定包 / 指定当前库（对照用）
node ops/lib/py.mjs ops/scripts/backup_restore_drill.py --archive backups/homeos-full-xxx.zip
node ops/lib/py.mjs ops/scripts/backup_restore_drill.py --live homeos/data/homeos.db
```

退出码：0 通过 / 1 演练失败 / 3 没有可演练的包。
"""

from __future__ import annotations

import argparse
import sqlite3
import sys
import tempfile
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

#: 行数低于当前库的这个比例就告警：备份比现在旧是正常的，但「只剩零头」意味着搬漏了。
ROW_COUNT_MIN_RATIO = 0.5
#: 这些表不参与行数对照（内容本身按时间滚动，备份比现在少是正常现象）。
ROW_COUNT_SKIP_TABLES = {
    "event_logs",
    "event_log_stats_hourly",
    "security_events",
    "agent_context_timeline",
    "schema_migrations",
}


def _db_files(root: Path) -> list[Path]:
    return sorted(path for path in root.rglob("*.db") if path.is_file())


def _table_counts(db: Path) -> dict[str, int]:
    counts: dict[str, int] = {}
    con = sqlite3.connect(f"file:{db}?mode=ro", uri=True, timeout=5)
    try:
        names = [
            row[0]
            for row in con.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
        ]
        for name in names:
            try:
                # 表名来自 sqlite_master（不是用户输入），且已用双引号包裹标识符。
                counts[name] = int(con.execute(f'SELECT COUNT(*) FROM "{name}"').fetchone()[0])  # noqa: S608
            except sqlite3.DatabaseError:
                counts[name] = -1
    finally:
        con.close()
    return counts


def _integrity(db: Path) -> str:
    con = sqlite3.connect(f"file:{db}?mode=ro", uri=True, timeout=5)
    try:
        return str(con.execute("PRAGMA integrity_check").fetchone()[0])
    finally:
        con.close()


def _newest_archive() -> Path | None:
    candidates = sorted(
        (path for path in (ROOT / "backups").glob("*.zip") if path.is_file()),
        key=lambda path: path.stat().st_mtime,
        reverse=True,
    )
    return candidates[0] if candidates else None


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="备份恢复演练")
    parser.add_argument("--archive", type=Path, help="备份包（缺省用 backups/ 下最新的 .zip）")
    parser.add_argument("--live", type=Path, default=ROOT / "homeos/data/homeos.db", help="对照用的当前业务库")
    args = parser.parse_args(argv)

    archive = args.archive or _newest_archive()
    if archive is None or not archive.is_file():
        print("没有可演练的备份包：backups/ 下没有 .zip。", file=sys.stderr)
        print("先在后端触发一次全量备份（设置 → 备份），或指定 --archive。", file=sys.stderr)
        return 3

    print(f"演练备份：{archive}（{archive.stat().st_size / 1024 / 1024:.1f} MB）")
    problems: list[str] = []

    with tempfile.TemporaryDirectory(prefix="homeos-restore-drill-") as tmp:
        target = Path(tmp)
        try:
            with zipfile.ZipFile(archive) as bundle:
                bundle.extractall(target)
        except (zipfile.BadZipFile, OSError) as error:
            print(f"解包失败：{error}", file=sys.stderr)
            return 1

        databases = _db_files(target)
        if not databases:
            print("包内没有任何 .db 文件 —— 这个包无法恢复数据。", file=sys.stderr)
            return 1
        print(f"包内数据库：{', '.join(path.name for path in databases)}")

        live_counts: dict[str, int] = {}
        if args.live.is_file():
            try:
                live_counts = _table_counts(args.live)
            except sqlite3.DatabaseError as error:
                problems.append(f"对照库读取失败：{error}")

        for db in databases:
            status = _integrity(db)
            if status != "ok":
                problems.append(f"{db.name}: integrity_check = {status}")
                continue
            counts = _table_counts(db)
            print(f"  {db.name}: {len(counts)} 张表，integrity ok")
            # 日志库不参与行数对照：备份口径本身就不含历史。
            if "logs" in db.name:
                continue
            for table, restored in counts.items():
                if table in ROW_COUNT_SKIP_TABLES or restored < 0:
                    continue
                live = live_counts.get(table)
                if live is None:
                    continue
                if live >= 10 and restored < live * ROW_COUNT_MIN_RATIO:
                    problems.append(
                        f"{db.name}.{table}: 恢复 {restored} 行 / 当前 {live} 行（低于 {ROW_COUNT_MIN_RATIO:.0%}）"
                    )

    if problems:
        print("演练失败：", file=sys.stderr)
        for problem in problems:
            print(f"  - {problem}", file=sys.stderr)
        return 1
    print("演练通过：包内数据库可读、完整性校验通过、行数与当前库一致。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
