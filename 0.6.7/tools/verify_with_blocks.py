#!/usr/bin/env python3
"""Structural gate: every with-block in the disassembly must exist in the source.

pycdc frequently flattens with-statements (it keeps the body and drops the context
manager), which the name/string fidelity gate cannot see: the names are all still
present, the code just no longer enters the context.  The disassembly is exact
here -- a with-statement compiles to BEFORE_WITH / BEFORE_ASYNC_WITH -- so the two
counts must agree, and no placeholder "with None:" may survive.

Usage: python3 tools/verify_with_blocks.py [path ...]
"""
from __future__ import annotations

import ast
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(Path(__file__).resolve().parent))

from reference import das_for  # noqa: E402
BEFORE_WITH = re.compile(r"^\s*(\d+)\s+(BEFORE_WITH|BEFORE_ASYNC_WITH)\b", re.M)


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


def source_withs(path):
    """Count with-blocks and flag pycdc placeholder context expressions.

    Counting alone is not enough: pycdc replaces a lost context manager with a
    placeholder constant, so "with None:" keeps the count right while the code no
    longer enters the real context.
    """
    try:
        tree = ast.parse(path.read_text(encoding="utf-8", errors="replace"))
    except SyntaxError as error:
        return None, None, str(error)
    total = 0
    degenerate = 0
    for node in ast.walk(tree):
        if not isinstance(node, (ast.With, ast.AsyncWith)):
            continue
        # A compound with-statement emits one BEFORE_WITH per item, so count
        # items rather than nodes; only a single-item with is a plain block.
        total += len(node.items)
        for item in node.items:
            expr = item.context_expr
            if isinstance(expr, ast.Constant) and not (
                isinstance(expr.value, str) and expr.value
            ):
                degenerate += 1
                break
    return total, degenerate, None


def main(argv):
    bad = []
    checked = 0
    for path in targets(argv):
        das = das_for(path)
        if das is None or not path.is_file():
            continue
        checked += 1
        expected = len(BEFORE_WITH.findall(das.read_text(encoding="utf-8", errors="replace")))
        found, degenerate, error = source_withs(path)
        if error:
            bad.append((path, expected, -1, 0, error))
            continue
        if expected != found or degenerate:
            bad.append((path, expected, found, degenerate, ""))
    for path, expected, found, degenerate, error in bad:
        rel = path.relative_to(ROOT)
        if found < 0:
            print("ERROR " + str(rel) + " :: " + error)
        else:
            note = ""
            if degenerate:
                note = "  [" + str(degenerate) + " placeholder context with-block(s)]"
            print("DIFF  " + str(rel) + ": disassembly has " + str(expected)
                  + " with-block(s), source has " + str(found) + note)
    print("# checked " + str(checked) + " file(s): clean=" + str(checked - len(bad))
          + " with-differences=" + str(len(bad)))
    return 1 if bad else 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))