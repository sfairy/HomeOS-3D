#!/usr/bin/env python3
"""性能基准的批量入口：一个解释器跑完 ``ops/bench/bench_*.py``。

与 ``ops/checks/run_*_checks.py`` 同一套约定：单项脚本可直接跑（调试用），批量入口只在
**一个进程**里依次调用各自的 ``run()``，共用一次 ``homeos.backend`` 导入 —— 否则每个基准
都要重新 import 一遍后端（实测 0.4–1.2s），比基准本身还慢。

用法：
    node ops/lib/py.mjs ops/bench/run_bench.py                     # 默认规模
    node ops/lib/py.mjs ops/bench/run_bench.py --list
    node ops/lib/py.mjs ops/bench/run_bench.py --module fanout --iterations 5
    node ops/lib/py.mjs ops/bench/run_bench.py --output ops/checks/baselines/perf/backend-hotpaths.json
"""

from __future__ import annotations

import argparse
import json
import sys
from collections.abc import Callable
from pathlib import Path
from typing import Any

BENCH_DIR = Path(__file__).resolve().parent
if str(BENCH_DIR) not in sys.path:
    sys.path.insert(0, str(BENCH_DIR))

import _support
import bench_eventlog
import bench_fanout
import bench_json

Runner = Callable[[int], dict[str, Any]]

MODULES: tuple[tuple[str, Runner], ...] = (
    ("fanout", lambda iterations: bench_fanout.run(200, 5, iterations)),
    ("eventlog", lambda _iterations: bench_eventlog.run(500, 8)),
    ("json", bench_json.run),
)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="性能基准批量入口")
    parser.add_argument("--list", action="store_true", help="只列出可用模块")
    parser.add_argument("--module", action="append", default=[], help="只跑名字匹配的模块（子串，可重复）")
    parser.add_argument("--iterations", type=int, default=20)
    parser.add_argument("--output", type=Path, default=None, help="把结果写成 JSON 基线文件")
    parser.add_argument("--json", action="store_true", help="只输出合并后的 JSON（不打印人读摘要）")
    args = parser.parse_args(argv)

    if args.list:
        for name, _ in MODULES:
            print(name)
        return 0

    selected = [(name, run) for name, run in MODULES if not args.module or any(token in name for token in args.module)]
    if not selected:
        print(f"没有匹配的基准模块：{args.module}", file=sys.stderr)
        return 2

    results: dict[str, Any] = {}
    for name, run in selected:
        payload = run(args.iterations)
        results[name] = payload
        if not args.json:
            print(json.dumps({"bench": name, **payload}, ensure_ascii=False, sort_keys=True))

    if args.output is not None:
        _support.write_baseline(args.output, {"iterations": args.iterations, "benches": results})
        if not args.json:
            print(f"基线已写入 {args.output}", file=sys.stderr)
    if args.json:
        print(json.dumps({"benches": results}, ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
