#!/usr/bin/env python3
"""Studio 目录同名冲突 KPI：量「根与 studio 用同一个桶名」的个数，目标归零。

为什么需要它
------------
``src/studio/`` 是一个自带多入口、自带 ``@app``/``@runtime`` 别名的**嵌套子系统**，
但它内部沿用了应用根的通用桶名，于是同一个名字在两层出现、语义完全不同：

    src/components/   (148, 应用级 UI)   vs  src/studio/components/   (3, studio 局部)
    src/composables/  (143, 应用级 hooks) vs  src/studio/composables/  (1, 只有一个文件)
    src/views/        (10, 路由页)        vs  src/studio/views/        (7, 也是路由页！)
    src/utils/        (160, 应用级纯函数) vs  src/studio/app/utils/    (8, studio 局部)

光看路径无法判断「这是应用级还是 studio 级」，是目录结构「感觉重复」的根因。
本脚本把这件事变成**可量化、只减不增**的指标，而不是靠肉眼评审。

门禁口径
--------
- 记录基线 ``BASELINE``；当前冲突数**超过**基线 → 硬失败（ratchet）。
- 达到 ``TARGET``（0）→ 提示达成。
- ``--update`` 在收敛后重记基线（只允许往小改；变大直接拒绝）。

用法（仓库根执行）::

    python3 ops/studio_layout_kpi.py
    python3 ops/studio_layout_kpi.py --update
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "homeos" / "frontend" / "src"

#: 应用根的通用桶名 —— 这些名字出现在 studio 里就会造成歧义。
GENERIC_BUCKETS = (
    "components",
    "composables",
    "views",
    "utils",
    "stores",
    "services",
    "features",
    "constants",
    "types",
    "layouts",
    "directives",
    "workers",
    "router",
    "assets",
)

#: 冲突数基线（2026-10-11 实测 4：components/composables/views/utils）。只减不增。
BASELINE = 0

#: 目标
TARGET = 0


def _count(path: Path) -> int:
    return sum(1 for p in path.rglob("*") if p.is_file())


def conflicts() -> list[tuple[str, Path, Path]]:
    """返回 ``(桶名, 根目录, studio 目录)`` 冲突列表。"""
    out: list[tuple[str, Path, Path]] = []
    for name in GENERIC_BUCKETS:
        root_dir = SRC / name
        if not root_dir.is_dir():
            continue
        # studio 下同名的两种位置：顶层 studio/<name>，以及叶子层 studio/app/<name>。
        for candidate in (SRC / "studio" / name, SRC / "studio" / "app" / name):
            if candidate.is_dir():
                out.append((name, root_dir, candidate))
    return out


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--update", action="store_true", help="把当前冲突数写回脚本作为新基线")
    args = parser.parse_args()

    found = conflicts()

    if args.update:
        if len(found) > BASELINE:
            print(f"拒绝：当前 {len(found)} 个冲突多于基线 {BASELINE}，请先收敛。", file=sys.stderr)
            return 1
        text = Path(__file__).read_text(encoding="utf-8")
        old = f"BASELINE = {BASELINE}"
        Path(__file__).write_text(text.replace(old, f"BASELINE = {len(found)}", 1), encoding="utf-8")
        print(f"基线已更新：{BASELINE} → {len(found)}")
        return 0

    print(f"{'桶名':<14}{'根':>10}{'studio':>10}   studio 位置")
    print("-" * 62)
    for name, root_dir, studio_dir in found:
        print(
            f"{name:<14}{_count(root_dir):>10}{_count(studio_dir):>10}   "
            f"{studio_dir.relative_to(SRC).as_posix()}/"
        )

    print()
    if len(found) > BASELINE:
        print(f"Studio 同名冲突 KPI 失败：{len(found)} 个 > 基线 {BASELINE}（只减不增）", file=sys.stderr)
        return 1

    if len(found) <= TARGET:
        print("Studio 同名冲突 KPI 达成：0 个（根与 studio 不再共享通用桶名）。")
        return 0

    remaining = len(found)
    print(
        f"Studio 同名冲突 KPI：{remaining} 个（基线 {BASELINE} → 目标 {TARGET}，未增长）。"
        " 收敛动作见计划 P6-1/P6-2。"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
