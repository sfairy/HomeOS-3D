#!/usr/bin/env python3
"""把 `grid-template-columns` 里的裸 `1fr` 收成 `minmax(0, 1fr)`。

为什么要做：`1fr` 的最小尺寸是 `auto`（= min-content），中文长串 / 长实体 ID
没有断行机会时会撑破列宽；而设置页等滚动容器是 `overflow-x: hidden`，于是内容被
**静默裁掉**（宽屏验收看不出来）。`minmax(0, 1fr)` 允许列宽压到内容以下，配合
`overflow-wrap` 才能真正「装得下」。

跳过已含 `minmax(` 的行（避免重复包裹）与注释行。

用法：
    python3 ops/scripts/fix-naked-fr.py --dry-run
    python3 ops/scripts/fix-naked-fr.py --apply
"""

from __future__ import annotations

import argparse
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TARGET = ROOT / "homeos/frontend/src"

DECLARATION_RE = re.compile(r"grid-template-columns\s*:[^;{}]*1fr")
FR_TOKEN_RE = re.compile(r"(?<![\w-])1fr(?![\w-])")


def iter_css() -> list[Path]:
    files: list[Path] = []
    for path in TARGET.rglob("*.css"):
        if "third-party" in path.parts or "node_modules" in path.parts:
            continue
        files.append(path)
    return sorted(files)


def transform_line(line: str) -> str:
    """把一行声明里的裸 `1fr` 包成 `minmax(0, 1fr)`；不适用时原样返回。"""
    if not DECLARATION_RE.search(line):
        return line
    if "minmax(" in line:
        return line
    return FR_TOKEN_RE.sub("minmax(0, 1fr)", line)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="真正写文件（默认只预览）")
    parser.add_argument("--dry-run", action="store_true", help="只预览（默认行为）")
    args = parser.parse_args()

    changed_files = 0
    changed_lines = 0
    for path in iter_css():
        lines = path.read_text(encoding="utf-8").split("\n")
        out: list[str] = []
        touched = 0
        for line in lines:
            updated = transform_line(line)
            if updated != line:
                touched += 1
            out.append(updated)
        if not touched:
            continue
        changed_files += 1
        changed_lines += touched
        rel = path.relative_to(ROOT)
        print(f"{rel}: {touched} 行")
        if args.apply:
            path.write_text("\n".join(out), encoding="utf-8")
    print(f"\n合计：{changed_files} 个文件 / {changed_lines} 行")
    if not args.apply:
        print("未写盘（预览模式）。加 --apply 执行。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
