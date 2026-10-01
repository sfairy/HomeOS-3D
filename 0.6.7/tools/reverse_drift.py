#!/usr/bin/env python3
"""Reverse-drift aid: module-level names that nothing in the tree references.

The fidelity gate is one-way (.das -> source), so a later-version leftover that
the disassembly never mentions still passes.  A whole function carried over from
the newer revision shows up here as a definition with zero references, which is
the cheapest signal that it is drift rather than restored 0.6.5 code.
"""
from __future__ import annotations
import ast, re, sys
from pathlib import Path

ROOT = Path("/Users/sfairy/项目/HomeOS/HA-Bridge").resolve()
FILES = sorted(
    p for p in list((ROOT / "backend").rglob("*.py")) + list((ROOT / "migrations").rglob("*.py"))
    if ".1shot." not in p.name and "pyarmor_runtime" not in str(p)
)

defs: dict[str, list[tuple[str, int]]] = {}
texts: dict[Path, str] = {}
for path in FILES:
    text = path.read_text(encoding="utf-8", errors="replace")
    texts[path] = text
    try:
        tree = ast.parse(text)
    except SyntaxError:
        continue
    for node in tree.body:
        names = []
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            names = [node.name]
        elif isinstance(node, ast.Assign):
            names = [t.id for t in node.targets if isinstance(t, ast.Name)]
        for name in names:
            if name.startswith("__"):
                continue
            defs.setdefault(name, []).append((str(path.relative_to(ROOT)), node.lineno))

whole = {p: t for p, t in texts.items()}
unused = []
for name, sites in defs.items():
    pat = re.compile(r"(?<![\w$.])" + re.escape(name) + r"(?![\w$])")
    total = 0
    for path, text in whole.items():
        total += len(pat.findall(text))
    # one occurrence = the definition itself
    if total <= len(sites):
        unused.append((name, sites, total))

unused.sort()
print(f"module-level definitions: {len(defs)}; unreferenced: {len(unused)}")
for name, sites, total in unused:
    where = "; ".join(f"{p}:{l}" for p, l in sites)
    print(f"  {name:42s} refs={total:2d}  {where}")
