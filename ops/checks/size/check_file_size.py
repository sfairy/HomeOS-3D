#!/usr/bin/env python3
"""文件行数审计（只读，纯标准库，手动入口）。

这不是门禁
----------
「多少行算巨型文件」是一个项目取舍，不是能由门禁固化的客观阈值。这条脚本因此不再
进 `gate:*` / `pre-push`，只保留为手动审计 `audit:file-size`：需要取证、评估拆分收益
或对比拆分前后体量时运行。默认门槛只是**审计的筛选参数**，
不代表项目对「巨型文件」给出了定义。

口径
----
- 扫描 `homeos` 与 `homeos-store` 下的源码（`.py` / `.ts` / `.vue` / `.mjs` / `.js`）；
- 只统计**代码文件**，`.css` 不计（样式文件的体量由 bundle 预算管，且天然是顺序追加）；
- 排除 `node_modules` / `dist` / `data` / `public` / `__pycache__` 等产物与运行数据。

判定语义
--------
基线记录所有 **≥ `THRESHOLD` 行**的文件及其行数：

- 基线里的文件可以变小（允许并鼓励），变大即报出；
- 超过 `THRESHOLD` 且基线里没有的文件会报 `NEW-OVERSIZE`，供人工判断是否需要关注；
- 低于 `THRESHOLD` 的文件不进基线，不产生噪音。

清理后跑 `--update` 压低基线；基线只能变小。`--report` 只打印不判定，供分析取证使用。

用法
----
    bun run audit:file-size                                  # 对比基线（默认）
    bun run audit:file-size -- --update                      # 重写基线
    bun run audit:file-size -- --report                      # 只打印统计
    bun run audit:file-size -- --json                        # 机器可读
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_BASELINE = REPO_ROOT / "ops/checks/baselines/size/file-size-baseline.json"

#: 审计默认筛选门槛：只报告 ≥ 3000 行的文件。它**不是**「巨型文件」的定义，
#: 只是让报告不淹没在几千个中小文件里的一个默认参数，不需要也不应该被门禁钉成项目级定义。
THRESHOLD = 3000

CODE_EXTENSIONS = frozenset({".py", ".ts", ".vue", ".mjs", ".js"})
SKIP_DIRS = frozenset(
    {
        "node_modules",
        "__pycache__",
        ".git",
        "dist",
        "build",
        ".ruff_cache",
        ".graphflow",
        ".venv-store",
        ".tmp-probe",
        "public",
        "data",
        "keys",
        "backups",
        "assets",
        "assets-default",
        # 共享库与工具链不在「两个产品项目」的度量口径内，另由各自的复杂度门禁看。
        "packages",
        "ops",
    }
)

PROJECTS = ("homeos", "homeos-store")


def iter_code_files() -> list[Path]:
    files: list[Path] = []
    for project in PROJECTS:
        root = REPO_ROOT / project
        if not root.is_dir():
            continue
        for dirpath, dirnames, filenames in os.walk(root):
            dirnames[:] = [name for name in dirnames if name not in SKIP_DIRS]
            for name in filenames:
                path = Path(dirpath) / name
                if path.suffix in CODE_EXTENSIONS:
                    files.append(path)
    return sorted(files)


def count_lines(path: Path) -> int:
    try:
        with path.open(encoding="utf-8", errors="ignore") as handle:
            return sum(1 for _ in handle)
    except OSError:
        return 0


def measure() -> dict[str, int]:
    """返回 {相对路径: 行数}，仅包含 ≥ THRESHOLD 的文件。"""
    result: dict[str, int] = {}
    for path in iter_code_files():
        lines = count_lines(path)
        if lines >= THRESHOLD:
            result[path.relative_to(REPO_ROOT).as_posix()] = lines
    return dict(sorted(result.items()))


def summarize(measured: dict[str, int]) -> dict[str, dict[str, int]]:
    per_project: dict[str, dict[str, int]] = {}
    for project in PROJECTS:
        rows = {path: lines for path, lines in measured.items() if path.startswith(f"{project}/")}
        per_project[project] = {
            "files": len(rows),
            "lines": sum(rows.values()),
            "gt1000": sum(1 for lines in rows.values() if lines > 1000),
            "max": max(rows.values()) if rows else 0,
        }
    return per_project


def compare(expected: dict[str, int], actual: dict[str, int]) -> list[str]:
    problems: list[str] = []
    for path, lines in expected.items():
        current = actual.get(path)
        if current is None:
            continue
        if current > lines:
            problems.append(f"GROWTH {path}: {lines} → {current} 行（+{current - lines}）")
    for path, lines in actual.items():
        if path not in expected:
            problems.append(f"NEW-OVERSIZE {path}: {lines} 行（超过审计门槛 {THRESHOLD}，基线里没有）")
    return problems


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline", type=Path, default=DEFAULT_BASELINE)
    parser.add_argument("--update", action="store_true", help="重写基线（只能变小）")
    parser.add_argument("--report", action="store_true", help="只打印统计，不判定")
    parser.add_argument("--json", action="store_true", help="机器可读输出")
    args = parser.parse_args()

    measured = measure()
    stats = summarize(measured)

    if args.update:
        payload = {
            "description": (
                f"文件行数审计基线（手动 audit:file-size）：记录全部 ≥ {THRESHOLD} 行的代码文件，不参与门禁"
            ),
            "threshold": THRESHOLD,
            "stats": stats,
            "files": measured,
        }
        args.baseline.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"baseline written: {args.baseline}（{len(measured)} 个文件）")
        return 0

    if args.json:
        print(
            json.dumps(
                {"threshold": THRESHOLD, "stats": stats, "files": measured},
                ensure_ascii=False,
                indent=2,
            )
        )
        if args.report:
            return 0

    for project, bucket in stats.items():
        print(
            f"{project}: ≥{THRESHOLD} 行文件 {bucket['files']} 个"
            f"（>1000 行 {bucket['gt1000']} 个，最大 {bucket['max']} 行，合计 {bucket['lines']} 行）"
        )

    if args.report:
        return 0

    if not args.baseline.is_file():
        print(f"baseline missing: {args.baseline}", file=sys.stderr)
        return 2
    payload = json.loads(args.baseline.read_text(encoding="utf-8"))
    problems = compare({str(k): int(v) for k, v in payload.get("files", {}).items()}, measured)
    if problems:
        for problem in problems:
            print(problem, file=sys.stderr)
        return 1
    print("file size audit ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
