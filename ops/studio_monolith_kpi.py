#!/usr/bin/env python3
"""Studio 单体 KPI 门禁：量的是真实体，且拒绝把 compat 桩当成目标。

为什么需要它
------------
``studio/MONOLITH_BASELINE.md`` 曾把 ``app/renderer/core/renderer.ts``（7188 行）与
``runtime/editor/config-editor/panel-rendering.ts`` 列为待收敛目标。后来这两个文件被拆空、
只留 ``export * from`` 的兼容桩（各 3 / 2 行），正文搬到了 ``panel-renderer.ts`` 与
``runtime/config-ui/config-editor/panel-rendering.ts`` —— 但文档里的路径没跟着改：

- 照着文档复测，得到的是「7188 → 3」这种假收敛，KPI 一眼看着完成了，实际一行没减；
- 真正 35k 行的 ``studio-app.ts`` 反而没人盯。

所以度量口径必须是**可执行、且会自我校验**的：本脚本把目标清单固化成代码，并且
**通过「桩检测」把上述失效模式变成硬失败** —— 目标文件一旦退化成纯 re-export 桩，
或行数掉到不合理的小值，就直接报错提示改指向真实体，而不是安静地报一个小数字。

用法（仓库根执行）::

    python3 ops/studio_monolith_kpi.py            # 打印表并做门禁
    python3 ops/studio_monolith_kpi.py --update   # 把当前行数写回本脚本作为新基线

门禁口径：

- **硬失败**：目标是 compat 桩 / 行数低于下限 ``STUB_FLOOR``；
- **硬失败**：行数超过记录的基线（ratchet，只减不增）；
- 未达目标（``target``）只提示，不算失败 —— 收敛是持续工作，不是一个 PR 的事。
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STUDIO = ROOT / "homeos" / "frontend" / "src" / "studio"

#: 低于此值即认为是 compat 桩（真实体都在千行以上）。
STUB_FLOOR = 100

#: 纯 re-export 桩的特征：整份文件只有 export ... from '...' 之类的转发。
_PURE_REEXPORT = re.compile(r"^\s*export\s+(?:\*|\{[^}]*\})\s+from\s+['\"].+['\"]\s*;?\s*$")


class Target:
    """一个待收敛的单体文件：相对 studio/ 的路径、当前基线、期望目标行数。"""

    def __init__(self, label: str, rel: str, baseline: int, target: int) -> None:
        self.label = label
        self.rel = rel
        self.baseline = baseline
        self.target = target

    @property
    def path(self) -> Path:
        return STUDIO / self.rel

    def lines(self) -> int:
        return len(self.path.read_text(encoding="utf-8", errors="ignore").splitlines())

    def is_stub(self) -> bool:
        """整份文件只有 re-export 行（注释与空行不计）。"""
        text = self.path.read_text(encoding="utf-8", errors="ignore")
        text = re.sub(r"/\*[\s\S]*?\*/", "", text)
        body = [line for line in text.splitlines() if line.strip() and not line.strip().startswith("//")]
        if not body:
            return True
        return all(_PURE_REEXPORT.match(line) for line in body)


#: 度量目标 —— 与 studio/MONOLITH_BASELINE.md 的表格一一对应，改这里同时改文档。
#: baseline 由 2026-10-11 实测；`--update` 可重记。
TARGETS = [
    Target("creator 编排宿主", "app/3d-studio/studio/studio-app.ts", 20681, 3000),
    Target("panel 编排宿主", "app/editor/home.ts", 17037, 3000),
    Target("面板渲染器", "app/renderer/core/panel-renderer.ts", 1888, 3000),
    Target("舞台宿主", "runtime/core/stage.ts", 5702, 3000),
    Target("舞台配置渲染", "runtime/config-ui/config-editor/panel-rendering.ts", 590, 3000),
]


def _update(todos: list[tuple[Target, int]]) -> None:
    text = Path(__file__).read_text(encoding="utf-8")
    for target, lines in todos:
        old = f'"{target.rel}", {target.baseline},'
        new = f'"{target.rel}", {lines},'
        if old not in text:
            print(f"警告：找不到基线字面量 {old!r}，跳过 {target.label}", file=sys.stderr)
            continue
        text = text.replace(old, new, 1)
    Path(__file__).write_text(text, encoding="utf-8")
    print("基线已更新。")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--update", action="store_true", help="把当前行数写回脚本作为新基线")
    args = parser.parse_args()

    measured: list[tuple[Target, int]] = []
    problems: list[str] = []
    for target in TARGETS:
        if not target.path.is_file():
            problems.append(f"{target.label}：找不到 {target.rel}（路径已失效，请改指向真实体）")
            continue
        lines = target.lines()
        measured.append((target, lines))
        if target.is_stub() or lines < STUB_FLOOR:
            problems.append(
                f"{target.label}：{target.rel} 只有 {lines} 行，像是 compat 桩 —— "
                "真实体搬到别处了，请改指向真实体（这正是旧文档踩过的坑）"
            )

    if args.update:
        if problems:
            print("存在失效目标，先修好再更新基线：", file=sys.stderr)
            for item in problems:
                print(f"  - {item}", file=sys.stderr)
            return 1
        _update(measured)
        return 0

    print(f"{'单体':<16}{'当前':>8}{'基线':>8}{'目标':>8}   状态")
    print("-" * 58)
    for target, lines in measured:
        if lines > target.baseline:
            status = f"增长 +{lines - target.baseline}（违反只减不增）"
            problems.append(f"{target.label}：{target.rel} 从 {target.baseline} 涨到 {lines} 行")
        elif lines <= target.target:
            status = "已达目标"
        else:
            done = (target.baseline - lines) / max(1, target.baseline - target.target) * 100
            status = f"收敛 {done:.0f}%"
        print(f"{target.label:<16}{lines:>8}{target.baseline:>8}{target.target:>8}   {status}")

    print()
    if problems:
        print(f"Studio 单体 KPI 门禁失败：{len(problems)} 项", file=sys.stderr)
        for item in problems:
            print(f"  - {item}", file=sys.stderr)
        return 1

    total = sum(lines for _, lines in measured)
    print(f"Studio 单体 KPI 门禁通过（{len(measured)} 个目标，合计 {total} 行，无增长、无桩）。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
