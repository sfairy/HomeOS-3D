#!/usr/bin/env python3
"""Structural gate: every typed except-clause in the disassembly must exist in the source.

pycdc loses try/except as readily as it loses with-statements, and the
name/string gate cannot see it: the exception names survive as imports, so a
missing handler looks identical to a present one.

The comparison is disassembly against disassembly: the restored source is
compiled and its code objects are scanned for CHECK_EXC_MATCH, then compared
with the count the PyArmor disassembly shows.  Counting AST handlers instead
would mis-report any typed handler that sits inside a finally body, because the
compiler emits that handler twice (inline copy + exception-handler copy) while
the AST holds it once.

It also counts leftover TODO(restore) markers, which are the visible residue of
a structure pycdc failed to render: the exit criterion is zero.

Usage: python3 tools/verify_try_blocks.py [path ...]
"""
from __future__ import annotations

import dis
import re
import sys
import types
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(Path(__file__).resolve().parent))

from reference import das_for  # noqa: E402
CHECK_EXC_MATCH = re.compile(r"^\s*(\d+)\s+CHECK_EXC_MATCH\b", re.M)


def targets(argv):
    wanted = [a for a in argv if not a.startswith("-")]
    if wanted:
        out = []
        for arg in wanted:
            p = (ROOT / arg).resolve()
            if p.is_dir():
                out.extend(sorted(x for x in p.rglob("*.py") if ".1shot." not in x.name))
            else:
                out.append(p)
        return out
    return sorted(
        p
        for p in list((ROOT / "backend").rglob("*.py")) + list((ROOT / "migrations").rglob("*.py"))
        if ".1shot." not in p.name and "pyarmor_runtime" not in str(p)
    )


def compiled_check_exc_match(path):
    try:
        code = compile(path.read_text(encoding="utf-8", errors="replace"), str(path), "exec")
    except SyntaxError as error:
        return None, str(error)
    total = 0
    stack = [code]
    while stack:
        current = stack.pop()
        for instruction in dis.get_instructions(current):
            if instruction.opname == "CHECK_EXC_MATCH":
                total += 1
        stack.extend(c for c in current.co_consts if isinstance(c, types.CodeType))
    return total, None


def main(argv):
    bad = []
    todos = []
    checked = 0
    for path in targets(argv):
        das = das_for(path)
        if das is None or not path.is_file():
            continue
        checked += 1
        expected = len(CHECK_EXC_MATCH.findall(das.read_text(encoding="utf-8", errors="replace")))
        found, error = compiled_check_exc_match(path)
        if error:
            bad.append((path, expected, -1, error))
            continue
        if expected != found:
            bad.append((path, expected, found, ""))
        count = path.read_text(encoding="utf-8", errors="replace").count("TODO(restore)")
        if count:
            todos.append((path, count))
    for path, expected, found, error in bad:
        rel = path.relative_to(ROOT)
        if found < 0:
            print("ERROR " + str(rel) + " :: " + error)
        else:
            print("DIFF  " + str(rel) + ": disassembly has " + str(expected)
                  + " typed except-clause(s), compiled source has " + str(found))
    for path, count in todos:
        print("TODO  " + str(path.relative_to(ROOT)) + ": " + str(count) + " TODO(restore) marker(s)")
    print("# checked " + str(checked) + " file(s): clean=" + str(checked - len(bad))
          + " with-differences=" + str(len(bad)) + " files-with-todo=" + str(len(todos)))
    return 1 if bad or todos else 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))