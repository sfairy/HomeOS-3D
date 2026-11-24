#!/usr/bin/env python3
"""后端语句覆盖率基线（只用标准库，不引入 pytest / coverage.py）。

## 为什么不用 coverage.py

`requirements.lock` 里没有 coverage；为了「看一眼覆盖率」去改依赖锁、重建镜像，
成本远大于收益。标准库的 ``trace`` 已经能给出「哪些行被执行过」，再配合
``trace`` 自己的可执行行判定，就得到与 coverage.py 同一量级的行覆盖率。

代价要说清楚：``trace`` 是逐行回调，比 coverage.py 慢一个数量级。因此本脚本
**不进 gate**，只在需要时手工跑一次并更新基线：

```bash
node ops/lib/py.mjs ops/checks/quality/coverage.py            # 报告
node ops/lib/py.mjs ops/checks/quality/coverage.py --update   # 录制基线
node ops/lib/py.mjs ops/checks/quality/coverage.py --check    # 与基线比对（允许 -1pp）
```

## 口径

- 分母：``homeos/backend/src`` 下所有 ``.py`` 的可执行行（``trace`` 的判定）；
- 分子：本次 unittest 套件（``ops/checks/unittests``）实际执行到的行；
- 业务自检（``ops/checks/business/*_selftest.py``）不并入：它们是独立进程，合并统计会
  把「同一条 import 被打到」算两次，且会让覆盖率数字与「测试套件」失去对应关系。

结论的正确用法：**只看趋势**。72 个测试覆盖 11 万行后端，绝对值一定很低；
它的价值是「这次重构有没有把原来覆盖到的路径弄丢」。
"""

from __future__ import annotations

import argparse
import json
import sys
import trace
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
BACKEND_SRC = ROOT / "homeos" / "backend" / "src"
UNIT_DIR = ROOT / "ops" / "checks" / "unittests"
BASELINE_PATH = ROOT / "ops" / "checks" / "baselines" / "quality" / "coverage.json"

#: 允许的覆盖率下降（百分点）。低于它视为「丢路径」。
TOLERANCE_PP = 1.0


def _is_backend_file(filename: str) -> bool:
    try:
        return Path(filename).resolve().is_relative_to(BACKEND_SRC)
    except OSError, ValueError:
        return False


def _executable_lines(filename: str) -> set[int]:
    """可执行行集合：优先用 trace 自己的判定，失败时退回 ``ast`` 语句行。"""
    finder = getattr(trace, "_find_executable_linenos", None)
    if callable(finder):
        try:
            return set(finder(filename))
        except OSError, SyntaxError:
            pass
    import ast

    try:
        tree = ast.parse(Path(filename).read_text(encoding="utf-8", errors="replace"))
    except OSError, SyntaxError:
        return set()
    return {node.lineno for node in ast.walk(tree) if hasattr(node, "lineno")}


def run_suite() -> trace.Trace:
    """跑一遍 unittest 套件，返回带 counts 的 tracer。"""
    loader = unittest.TestLoader()
    suite = loader.discover(str(UNIT_DIR), pattern="test_*.py", top_level_dir=str(UNIT_DIR))
    tracer = trace.Trace(count=1, trace=0, ignoredirs=[sys.prefix, sys.exec_prefix])
    runner = unittest.TextTestRunner(verbosity=1)
    tracer.runfunc(runner.run, suite)
    return tracer


def collect(tracer: trace.Trace) -> dict:
    counts = tracer.results().counts
    covered: dict[str, set[int]] = {}
    for (filename, lineno), hits in counts.items():
        if hits <= 0 or not _is_backend_file(filename):
            continue
        covered.setdefault(str(Path(filename).resolve()), set()).add(lineno)

    files: dict[str, dict[str, int]] = {}
    per_area: dict[str, dict[str, int]] = {}
    totals = {"covered": 0, "executable": 0}
    for filename in sorted(BACKEND_SRC.rglob("*.py")):
        if "__pycache__" in filename.parts:
            continue
        executable = _executable_lines(str(filename))
        if not executable:
            continue
        hit = covered.get(str(filename), set()) & executable
        rel = filename.relative_to(BACKEND_SRC).as_posix()
        area = rel.split("/", 1)[0] if "/" in rel else "(root)"
        files[rel] = {"covered": len(hit), "executable": len(executable)}
        bucket = per_area.setdefault(area, {"covered": 0, "executable": 0})
        bucket["covered"] += len(hit)
        bucket["executable"] += len(executable)
        totals["covered"] += len(hit)
        totals["executable"] += len(executable)

    percentage = round(100.0 * totals["covered"] / totals["executable"], 2) if totals["executable"] else 0.0
    areas = {
        area: round(100.0 * value["covered"] / value["executable"], 2) if value["executable"] else 0.0
        for area, value in sorted(per_area.items())
    }
    return {"totalPercent": percentage, "areas": areas, "files": files}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="后端语句覆盖率基线")
    parser.add_argument("--update", action="store_true", help="录制基线")
    parser.add_argument("--check", action="store_true", help="与基线比对")
    args = parser.parse_args(argv)

    current = collect(run_suite())
    print(f"语句覆盖率：{current['totalPercent']}%")
    for area, percent in current["areas"].items():
        print(f"  {area}: {percent}%")

    if args.update:
        BASELINE_PATH.parent.mkdir(parents=True, exist_ok=True)
        BASELINE_PATH.write_text(
            json.dumps(current, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8"
        )
        print(f"已录制基线：{BASELINE_PATH.relative_to(ROOT)}")
        return 0

    if args.check:
        try:
            baseline = json.loads(BASELINE_PATH.read_text(encoding="utf-8"))
        except OSError, ValueError:
            print(f"缺少基线 {BASELINE_PATH.relative_to(ROOT)}；先跑一次 --update。", file=sys.stderr)
            return 2
        drop = baseline["totalPercent"] - current["totalPercent"]
        if drop > TOLERANCE_PP:
            print(
                f"覆盖率下降 {drop:.2f}pp（基线 {baseline['totalPercent']}%，当前 {current['totalPercent']}%）",
                file=sys.stderr,
            )
            return 1
        print("覆盖率通过（未超过允许下降幅度）")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
