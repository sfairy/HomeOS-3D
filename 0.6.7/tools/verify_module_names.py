#!/usr/bin/env python3
"""Module-level binding fidelity check (.py <-> .das <module> STORE_NAME).

verify_restore only reports names/strings the .das has and the source lacks.
It never reports the opposite direction, so an *invented* module-level constant
(e.g. lock.py's _OPTIONAL_FIELDS, which no build ever had) passes every
existing gate.  This checker compares the module-level bindings of the restored
source against the STORE_NAME set of the <module> code object in its .das and
prints both directions.

Usage:
    python3 tools/verify_module_names.py [path ...]     # files or dirs, default: repo tree
"""
from __future__ import annotations

import ast
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

MODULE_DISASM = re.compile(r"^ {4}\[Disassembly\]\s*$")
STORE_NAME = re.compile(r"^\s*\d+\s+STORE_NAME\s+\d+:\s+(\S+)\s*$")
SKIP = ("__pyarmor", "__assert", "__doc__", "annotations")


def das_module_stores(das: Path) -> set[str]:
    """STORE_NAME names of the first code object (= <module>) in a .das file."""
    names: set[str] = set()
    inside = False
    for line in das.read_text(encoding="utf-8", errors="replace").splitlines():
        if not inside:
            # pycdas emits a code object's nested code objects inside its
            # [Constants] block and the object's own [Disassembly] afterwards,
            # so the outermost (4-space indented) [Disassembly] is the <module> one.
            inside = bool(MODULE_DISASM.match(line))
            continue
        if line.strip() and not line.startswith("        "):
            break
        m = STORE_NAME.match(line)
        if m:
            names.add(m.group(1))
    return names


def _bindings(stmts) -> set[str]:
    found: set[str] = set()
    for node in stmts:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            found.add(node.name)
        elif isinstance(node, ast.Assign):
            for t in node.targets:
                found |= {n.id for n in ast.walk(t) if isinstance(n, ast.Name)}
        elif isinstance(node, ast.AnnAssign):
            if isinstance(node.target, ast.Name):
                found.add(node.target.id)
        elif isinstance(node, ast.Import):
            for a in node.names:
                found.add(a.asname or a.name.split(".")[0])
        elif isinstance(node, ast.ImportFrom):
            for a in node.names:
                found.add(a.asname or a.name)
        elif isinstance(node, (ast.If, ast.Try, ast.With)):
            body = list(node.body) + list(getattr(node, "orelse", []))
            body += [h for h in getattr(node, "handlers", []) for h in h.body]
            body += list(getattr(node, "finalbody", []))
            found |= _bindings(body)
    return found


def source_bindings(py: Path) -> set[str]:
    tree = ast.parse(py.read_text(encoding="utf-8"))
    return {n for n in _bindings(tree.body) if not n.startswith(SKIP)}


def check(py: Path) -> tuple[set[str], set[str]]:
    das = py.with_name(py.name + ".1shot.das")
    if not das.exists():
        return set(), set()
    store = {n for n in das_module_stores(das) if not n.startswith(SKIP)}
    bind = source_bindings(py)
    return bind - store, store - bind


def main(argv: list[str]) -> int:
    targets: list[Path] = []
    for raw in argv or [str(ROOT)]:
        p = Path(raw)
        if p.is_dir():
            targets += [q for q in sorted(p.rglob("*.py"))
                        if q.with_name(q.name + ".1shot.das").exists()
                        and "pyarmor_runtime" not in q.parts]
        else:
            targets.append(p)
    extra = missing = 0
    for py in targets:
        ex, mi = check(py)
        if ex:
            extra += 1
            print("EXTRA   " + str(py.relative_to(ROOT)) + ": " + ", ".join(sorted(ex)))
        if mi:
            missing += 1
            print("MISSING " + str(py.relative_to(ROOT)) + ": " + ", ".join(sorted(mi)))
    print("# checked " + str(len(targets)) + " file(s): with-extra=" + str(extra)
          + " with-missing=" + str(missing))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
