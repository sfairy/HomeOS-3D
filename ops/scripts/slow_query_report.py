#!/usr/bin/env python3
"""慢查询排查脚本：把「哪条 SQL 慢」从进程内埋点里取出来。

## 数据从哪来

后端在 ``after_cursor_execute`` 上为每条语句计时（见
``platform/core/db/database.py`` 与 ``platform/core/runtime/observability.py``）：

- 超过阈值（默认 100ms，``HOMEOS_SLOW_DB_QUERY_MS`` 可覆盖）的语句会计入
  ``homeos_db_slow_queries_total``，并输出一条固定前缀的 WARNING：
  ``[slow-sql] 123.4ms SELECT ...``；
- ``/metrics`` 只暴露三个标量（总数 / 最大耗时 / 当前阈值），**不带 SQL 文本** ——
  SQL 文本的基数不可控，做标签会让指标体积随业务增长。

因此本脚本提供两种取数方式，二选一：

1. ``--metrics <url|file>``：读 Prometheus 文本，报告慢查询总数与阈值
   （适合巡检：只要 >0 就说明有语句越线）；
2. ``--log <file>``：扫描进程 stdout/stderr 落盘日志里的 ``[slow-sql]`` 行，
   按语句归并出前 N 条（适合定位：到底是哪条语句）。

## 用法

```bash
node ops/lib/py.mjs ops/scripts/slow_query_report.py --metrics http://127.0.0.1:8801/metrics
node ops/lib/py.mjs ops/scripts/slow_query_report.py --log /var/log/homeos/app.log --top 10
node ops/lib/py.mjs ops/scripts/slow_query_report.py --metrics ./metrics.txt --fail-on-slow
```
"""

from __future__ import annotations

import argparse
import re
import sys
import urllib.request
from collections import Counter
from pathlib import Path

#: 与后端 ``[slow-sql]`` 日志前缀保持一致；改一处必须改两处（有 check:silent-except 之外的人工约定）。
SLOW_LOG_PATTERN = re.compile(r"\[slow-sql\]\s+([\d.]+)ms\s+(.*)$")
SLOW_METRIC = "homeos_db_slow_queries_total"
MAX_METRIC = "homeos_db_slow_query_max_ms"
THRESHOLD_METRIC = "homeos_db_slow_query_threshold_ms"


def _read_metrics(source: str) -> str:
    if source.startswith(("http://", "https://")):
        with urllib.request.urlopen(source, timeout=10) as response:  # noqa: S310 - 只允许显式传入的地址
            return response.read().decode("utf-8", errors="replace")
    return Path(source).read_text(encoding="utf-8", errors="replace")


def _metric_value(text: str, name: str) -> float:
    for line in text.splitlines():
        if line.startswith(name + " "):
            try:
                return float(line.split(None, 1)[1])
            except IndexError, ValueError:
                return 0.0
    return 0.0


def report_metrics(text: str, *, fail_on_slow: bool) -> int:
    total = _metric_value(text, SLOW_METRIC)
    peak = _metric_value(text, MAX_METRIC)
    threshold = _metric_value(text, THRESHOLD_METRIC)
    print(f"慢查询阈值：{threshold or '未上报'} ms")
    print(f"慢查询总数：{int(total)}")
    print(f"历史最大耗时：{peak or '未上报'} ms")
    if total <= 0:
        print("结论：没有语句超过阈值。")
        return 0
    print("结论：存在超过阈值的语句；用 --log 扫描进程日志可定位具体 SQL。")
    return 1 if fail_on_slow else 0


def report_log(path: Path, *, top: int) -> int:
    if not path.exists():
        print(f"日志不存在：{path}", file=sys.stderr)
        return 2
    durations: list[float] = []
    statements: Counter[str] = Counter()
    peak_by_statement: dict[str, float] = {}
    with path.open(encoding="utf-8", errors="replace") as handle:
        for line in handle:
            match = SLOW_LOG_PATTERN.search(line)
            if match is None:
                continue
            duration = float(match.group(1))
            statement = match.group(2).strip()
            durations.append(duration)
            statements[statement[:200]] += 1
            peak_by_statement[statement[:200]] = max(peak_by_statement.get(statement[:200], 0.0), duration)
    if not durations:
        print(f"{path} 中没有 [slow-sql] 记录。")
        return 0
    ordered = sorted(durations)
    p95 = ordered[min(len(ordered) - 1, int(len(ordered) * 0.95))]
    print(f"共 {len(durations)} 条慢查询；p95 {p95:.1f} ms，最大 {ordered[-1]:.1f} ms")
    print(f"按语句归并（前 {top}）：")
    for statement, count in statements.most_common(top):
        print(f"  {count:4d} 次  峰值 {peak_by_statement[statement]:.1f} ms  {statement}")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="慢查询排查")
    parser.add_argument("--metrics", help="Prometheus 文本地址（http(s):// 或本地文件）")
    parser.add_argument("--log", type=Path, help="进程日志文件（含 [slow-sql] 行）")
    parser.add_argument("--top", type=int, default=10)
    parser.add_argument("--fail-on-slow", action="store_true", help="存在慢查询时以非零退出（用于巡检）")
    args = parser.parse_args(argv)

    if not args.metrics and not args.log:
        parser.error("至少给一个数据源：--metrics 或 --log")

    code = 0
    if args.metrics:
        code = report_metrics(_read_metrics(args.metrics), fail_on_slow=args.fail_on_slow)
    if args.log:
        code = max(code, report_log(args.log, top=args.top))
    return code


if __name__ == "__main__":
    raise SystemExit(main())
