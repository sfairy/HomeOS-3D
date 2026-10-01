#!/usr/bin/env python3
"""Scope-level binding fidelity check (.py <-> .das STORE_NAME).

verify_restore only reports names/strings the .das has and the source lacks.
It never reports the opposite direction, so an *invented* name -- e.g.
lock.py's module-level `_OPTIONAL_FIELDS` or database.py's
`Database._enable_wal` -- passes every other gate.  This checker compares the
scope-level bindings of the restored source (module scope + class bodies;
function locals compile to STORE_FAST, not STORE_NAME) against the STORE_NAME
set of the .das and prints both directions.

Usage:
    python3 tools/verify_scope_names.py [path ...]     # files or dirs, default: repo tree

Exits non-zero when any file binds an extra name, misses a name, or fails to
parse.  The counts in the final line are the gate: this is the only check that
reports names the *source* invented.
"""
from __future__ import annotations

import ast
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))

from reference import das_for  # noqa: E402

STORE_NAME = re.compile(r"^\s*\d+\s+STORE_NAME\s+\d+:\s+(\S+)\s*$")
SKIP = ("__pyarmor", "__assert", "__doc__", "__module__", "__qualname__", "__classcell__", "annotations")


def das_store_names(das: Path) -> set[str]:
    """Every STORE_NAME target in a .das file (module scope + class bodies)."""
    names: set[str] = set()
    for line in das.read_text(encoding="utf-8", errors="replace").splitlines():
        m = STORE_NAME.match(line)
        if m:
            names.add(m.group(1))
    return names


def _bindings(stmts) -> set[str]:
    """Names bound by a statement list, including nested if/try/with branches."""
    found: set[str] = set()
    for node in stmts:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            found.add(node.name)
        elif isinstance(node, ast.Assign):
            for t in node.targets:
                found |= {n.id for n in ast.walk(t) if isinstance(n, ast.Name)}
        elif isinstance(node, ast.AnnAssign):
            # annotation-only attributes never emit STORE_NAME (they go through
            # SETUP_ANNOTATIONS / STORE_SUBSCR on __annotations__)
            if node.value is not None and isinstance(node.target, ast.Name):
                found.add(node.target.id)
        elif isinstance(node, (ast.Import, ast.ImportFrom)):
            for a in node.names:
                found.add(a.asname or a.name.split(".")[0])
        elif isinstance(node, (ast.If, ast.Try, ast.With)):
            body = list(node.body) + list(getattr(node, "orelse", []))
            body += [h for h in getattr(node, "handlers", []) for h in h.body]
            body += list(getattr(node, "finalbody", []))
            found |= _bindings(body)
    return found


def _class_body_bindings(stmts) -> set[str]:
    """Names bound in class bodies (all nesting levels); function bodies are skipped."""
    found: set[str] = set()
    for node in stmts:
        if isinstance(node, ast.ClassDef):
            found |= _bindings(node.body)
            found |= _class_body_bindings(node.body)
        elif isinstance(node, (ast.If, ast.Try, ast.With)):
            body = list(node.body) + list(getattr(node, "orelse", []))
            body += [h for h in getattr(node, "handlers", []) for h in h.body]
            body += list(getattr(node, "finalbody", []))
            found |= _class_body_bindings(body)
    return found


def source_bindings(py: Path) -> set[str]:
    tree = ast.parse(py.read_text(encoding="utf-8"))
    names = _bindings(tree.body) | _class_body_bindings(tree.body)
    return {n for n in names if not n.startswith(SKIP)}


def check(py: Path) -> tuple[set[str], set[str]]:
    das = das_for(py)
    if das is None:
        return set(), set()
    store = {n for n in das_store_names(das) if not n.startswith(SKIP)}
    bind = source_bindings(py)
    return bind - store, store - bind


def _label(p: Path) -> str:
    try:
        return str(p.relative_to(ROOT))
    except ValueError:
        return str(p)


def main(argv: list[str]) -> int:
    targets: list[Path] = []
    for raw in argv or [str(ROOT)]:
        p = Path(raw)
        if not p.is_absolute():
            p = ROOT / p
        if p.is_dir():
            targets += [q for q in sorted(p.rglob("*.py"))
                        if ".1shot." not in q.name
                        and "pyarmor_runtime" not in q.parts
                        and das_for(q) is not None]
        else:
            targets.append(p)
    extra = missing = failures = 0
    for py in targets:
        try:
            ex, mi = check(py)
        except SyntaxError as error:
            # A module that does not parse is not "clean": report it and keep
            # going, so one broken file cannot hide the state of the rest.
            failures += 1
            print("PARSE-FAIL " + _label(py) + ": " + str(error))
            continue
        if ex:
            extra += 1
            print("EXTRA   " + _label(py) + ": " + ", ".join(sorted(ex)))
        if mi:
            missing += 1
            print("MISSING " + _label(py) + ": " + ", ".join(sorted(mi)))
    print("# checked " + str(len(targets)) + " file(s): with-extra=" + str(extra)
          + " with-missing=" + str(missing)
          + (" parse-failures=" + str(failures) if failures else ""))
    # Non-zero on either direction: an invented name and a lost name are both
    # damage, and a gate that always returns 0 only documents it.
    return 1 if extra or missing or failures else 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
