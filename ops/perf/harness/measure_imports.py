#!/usr/bin/env python3
"""后端启动期导入耗时的可复现采集（路线图 `startup-imports`）。

为什么要这个脚本
----------------
「启动期惰性导入能省 200~350ms」这类结论只有在**同一台机器、同一个解释器、同一份
pyc 缓存状态**下才能比较；手工跑 `python -X importtime` 再肉眼看会漏掉两件事：

1. **cum / self 的区别**：`src.app` 累计 1.6s，其中 `src.bootstrap.lifespan` 占 1.2s。
   真正「只属于某个模块自己」的开销要看 self 列；只盯累计值会把「被别人拖累」
   当成「自己很贵」。
2. **首次 vs 二次导入**：`.pyc` 缺失时第一次导入要编译字节码，比稳态慢数倍。脚本默认
   先跑一次热身（暖缓存）再采样，避免把「首次编译」算成启动成本。

口径
----
- `--module src.app`：被测导入目标（默认 `src.app`，即服务进程的装配入口）；
- 采样都在**子进程**里跑 `python -X importtime -c "import <module>"`，与真实启动同构；
- 输出 `total_import_ms`（该进程里目标的累计导入耗时）、`top_cumulative`、`top_self`
  两张表，写入 `ops/perf/results/<label>/imports.json`；
- 给 `--budget-ms` 才在超限时退出 1；默认只报告（导入耗时对机器状态很敏感，
  适合当趋势门禁而不是硬红线）。

用法
----
```bash
node ops/lib/py.mjs ops/perf/harness/measure_imports.py --label before
node ops/lib/py.mjs ops/perf/harness/measure_imports.py --label after --budget-ms 1500
```
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
BACKEND_ROOT = REPO_ROOT / "homeos" / "backend"

#: importtime 的一行形如 `import time:      1234 |       5678 |   module.name`。
#: 第一列是**自身**开销（不含子模块），第二列是**累计**。
_LINE = "import time:"


def run_import(module: str, *, warm_bytecode: bool) -> tuple[str, float]:
    """在子进程里导入一次，返回 (importtime 的 stderr 文本, 进程墙钟毫秒)。

    `warm_bytecode=True` 时先跑一次并把输出丢掉：只用来生成 / 刷新 `.pyc`。
    """
    env = dict(os.environ)
    # 子进程用同一个解释器、同一个导入根（homeos/backend 才能 `import src.app`）。
    env["PYTHONPATH"] = str(BACKEND_ROOT) + (os.pathsep + env["PYTHONPATH"] if env.get("PYTHONPATH") else "")
    code = f"import {module}"
    if warm_bytecode:
        subprocess.run(
            [sys.executable, "-c", code],
            cwd=str(REPO_ROOT),
            env=env,
            capture_output=True,
            check=False,
        )
    started = time.perf_counter()
    completed = subprocess.run(
        [sys.executable, "-X", "importtime", "-c", code],
        cwd=str(REPO_ROOT),
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )
    elapsed_ms = (time.perf_counter() - started) * 1000
    if completed.returncode != 0:
        sys.exit(f"导入 {module} 失败：\n{completed.stderr[-2000:]}")
    return completed.stderr, elapsed_ms


def parse_importtime(raw: str) -> list[dict[str, object]]:
    """解析 importtime 输出为 [{name, cumulative_us, self_us}]。"""
    rows: list[dict[str, object]] = []
    for line in raw.splitlines():
        if not line.startswith(_LINE):
            continue
        parts = line.split("|", 2)
        if len(parts) != 3:
            continue
        try:
            self_us = int(parts[0][len(_LINE) :].strip())
            cumulative_us = int(parts[1].strip())
        except ValueError:
            continue
        name = parts[2].strip()
        if not name:
            continue
        rows.append({"name": name, "cumulative_us": cumulative_us, "self_us": self_us})
    return rows


def main() -> int:
    parser = argparse.ArgumentParser(description="后端启动期导入耗时采集")
    parser.add_argument("--module", default="src.app", help="被测导入目标")
    parser.add_argument("--label", default="latest", help="结果子目录名（before / after …）")
    parser.add_argument("--out", default="", help="结果文件路径；留空用 ops/perf/results/<label>/")
    parser.add_argument("--top", type=int, default=20, help="两张表各取前 N 项")
    parser.add_argument("--budget-ms", type=float, default=0.0, help="累计导入耗时上限；0 表示只报告")
    parser.add_argument("--no-warm", action="store_true", help="跳过预热（测量冷 .pyc 的首启成本）")
    args = parser.parse_args()

    raw, wall_ms = run_import(args.module, warm_bytecode=not args.no_warm)
    rows = parse_importtime(raw)
    target = next((row for row in rows if row["name"] == args.module), None)
    if target is None:
        sys.exit(f"importtime 输出里找不到 {args.module}，解析规则可能已失效。")

    def ms(value: object) -> float:
        return round(int(value) / 1000, 1)

    by_cumulative = sorted(rows, key=lambda row: int(row["cumulative_us"]), reverse=True)[: args.top]
    by_self = sorted(rows, key=lambda row: int(row["self_us"]), reverse=True)[: args.top]
    total_import_ms = ms(target["cumulative_us"])

    payload = {
        "label": args.label,
        "target": args.module,
        "measured_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        "python": sys.version.split()[0],
        "warm_bytecode": not args.no_warm,
        "total_import_ms": total_import_ms,
        "total_self_ms": ms(target["self_us"]),
        "process_wall_ms": round(wall_ms, 1),
        "top_cumulative": [
            {"name": row["name"], "cumulative_ms": ms(row["cumulative_us"]), "self_ms": ms(row["self_us"])}
            for row in by_cumulative
        ],
        "top_self": [
            {"name": row["name"], "self_ms": ms(row["self_us"]), "cumulative_ms": ms(row["cumulative_us"])}
            for row in by_self
        ],
    }

    out_path = Path(args.out) if args.out else REPO_ROOT / "ops" / "perf" / "results" / args.label / "imports.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"{args.module} 累计导入 {total_import_ms}ms（进程墙钟 {payload['process_wall_ms']}ms）")
    print("累计耗时 Top:")
    for row in payload["top_cumulative"][:10]:
        print(f"  {row['cumulative_ms']:>8}ms  {row['name']}")
    print("自身耗时 Top:")
    for row in payload["top_self"][:10]:
        print(f"  {row['self_ms']:>8}ms  {row['name']}")
    print(f"已写入 {out_path.relative_to(REPO_ROOT) if out_path.is_relative_to(REPO_ROOT) else out_path}")

    if args.budget_ms > 0 and total_import_ms > args.budget_ms:
        print(f"导入耗时超预算：{total_import_ms}ms > {args.budget_ms}ms", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
