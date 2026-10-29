#!/usr/bin/env python3
"""Pyarmor 发行树的后端还原。

上游后端每个模块有三份产物：
  ``foo.py.1shot.seq``     密文
  ``foo.py.1shot.das``     pycdas 反汇编（含 Pyarmor 官方的还原指引）
  ``foo.py.1shot.cdc.py``  pycdc 反编译（**可能不完整**，断点处写 ``# WARNING: Decompyle incomplete``）

本脚本只做「能自动做对」的那部分：按 ``.das`` 头部的官方指引剥掉 Pyarmor 标记、
丢掉反编译噪声，并给不完整的函数打上明确标记，同时把配套的 ``.das`` 落到旁边 ——
需要重建的地方必须人（或 agent）对照反汇编写，不能猜。

用法：
    python3 ops/port/lib/py-deobf.py --version 0.8.2
    python3 ops/port/lib/py-deobf.py --version 0.8.2 --only dependencies

输出：``.port-cache/<ver>/backend/**/*.py``（镜像上游相对路径），
不完整模块额外输出 ``<name>.das``，以及 ``.port-cache/<ver>/backend/_deobf-report.json``。
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SOURCE = ROOT / "源代码"
CACHE = ROOT / ".port-cache"

CDC_SUFFIX = ".1shot.cdc.py"
DAS_SUFFIX = ".1shot.das"

# `'__pyarmor_enter_26882__(...)'` 这类标记：pycdc 把 Pyarmor 的运行时钩子当成字符串
# 表达式保留下来了，语义上什么都不做。它**不一定独占一行** —— 函数体被压成一行时，
# 标记会嵌在中间（`normalize = (lambda raw: '__pyarmor_enter_11955__(...)'entity_id = …`），
# 只按整行匹配会漏掉，而里面的序号每次发版都不同，足以把「没改的模块」算成改动。
PYARMOR_INLINE = re.compile(r"'__pyarmor_(?:enter|exit|bcc)_\d+__\([^']*\)'")
# pycdc 的固定噪声：`None(None)`（把空操作当成函数调用）。
NONE_NOISE = re.compile(r"^\s*None\(None\)\s*$")
INCOMPLETE = re.compile(r"^# WARNING: Decompyle incomplete\s*$")
# 反编译失败时 pycdc 会把缺失的表达式写成 `<NODE:12>`，保留但标注出来。
NODE_PLACEHOLDER = re.compile(r"<NODE:\d+>")
# 模块级 `return None` 是「函数体被截断后漏到顶层」的残骸，不是合法模块代码。
TOP_LEVEL_RETURN = re.compile(r"^return None\s*$")


@dataclass
class Result:
    module: str
    source: str
    output: str
    incomplete: int = 0
    placeholders: int = 0
    needs_manual: bool = False
    notes: list[str] = field(default_factory=list)


def clean(text: str, module: str) -> tuple[str, int, int]:
    """剥掉 Pyarmor 标记与反编译噪声；返回 (文本, 不完整处数, 占位符数)。"""
    text = PYARMOR_INLINE.sub("", text)
    lines: list[str] = []
    incomplete = 0
    placeholders = 0
    for line in text.splitlines():
        if NONE_NOISE.match(line):
            continue
        if INCOMPLETE.match(line):
            incomplete += 1
            lines.append(f"# FIXME(decompyle): 反编译不完整，须对照 {module}{DAS_SUFFIX} 重建")
            continue
        if TOP_LEVEL_RETURN.match(line):
            continue
        placeholders += len(NODE_PLACEHOLDER.findall(line))
        lines.append(line)

    out = "\n".join(lines)
    out = re.sub(r"\n{3,}", "\n\n", out)
    out = out.strip("\n") + "\n"
    return out, incomplete, placeholders


def convert(version: str, only: str | None) -> list[Result]:
    backend = SOURCE / version / "backend"
    target_root = CACHE / version / "backend"
    results: list[Result] = []

    for cdc in sorted(backend.rglob(f"*{CDC_SUFFIX}")):
        rel = cdc.relative_to(backend)
        if only and only not in str(rel):
            continue
        module = cdc.name[: -len(CDC_SUFFIX)]
        out_path = target_root / rel.with_name(module)
        out_path.parent.mkdir(parents=True, exist_ok=True)

        text, incomplete, placeholders = clean(cdc.read_text(encoding="utf-8", errors="replace"), module)
        out_path.write_text(text, encoding="utf-8")

        result = Result(
            module=str(rel.with_name(module)),
            source=str(cdc.relative_to(ROOT)),
            output=str(out_path.relative_to(ROOT)),
        )
        result.incomplete = incomplete
        result.placeholders = placeholders
        result.needs_manual = incomplete > 0 or placeholders > 0
        if incomplete:
            result.notes.append(f"{incomplete} 处反编译不完整，需按 .das 重建")
        if placeholders:
            result.notes.append(f"{placeholders} 处 <NODE:n> 占位，需按 .das 补回表达式")

        das = cdc.with_name(f"{module}{DAS_SUFFIX}")
        if result.needs_manual and das.exists():
            shutil.copy2(das, out_path.with_suffix(".das"))
            result.notes.append(f"已附带 {out_path.with_suffix('.das').name} 供重建")
        results.append(result)

    # 非 pyarmor 产物（`__init__.py` 等已经是明文的）直接复制，保持副本目录完整。
    for py in sorted(backend.rglob("*.py")):
        if str(py).endswith(CDC_SUFFIX):
            continue
        rel = py.relative_to(backend)
        if only and only not in str(rel):
            continue
        dst = target_root / rel
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(py, dst)

    return results


def main() -> None:
    parser = argparse.ArgumentParser(description="Pyarmor 后端还原")
    parser.add_argument("--version", required=True)
    parser.add_argument("--only", default=None)
    args = parser.parse_args()

    results = convert(args.version, args.only)
    report_path = CACHE / args.version / "backend" / "_deobf-report.json"
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(
        json.dumps(
            [
                {
                    "module": r.module,
                    "source": r.source,
                    "output": r.output,
                    "incomplete": r.incomplete,
                    "placeholders": r.placeholders,
                    "needsManual": r.needs_manual,
                    "notes": r.notes,
                }
                for r in results
            ],
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )

    manual = [r for r in results if r.needs_manual]
    print(f"[py-deobf] {args.version}: 还原 {len(results)} 个模块，其中 {len(manual)} 个需人工重建")
    for r in manual:
        print(f"  - {r.module}: {'; '.join(r.notes)}")


if __name__ == "__main__":
    main()
