#!/usr/bin/env python3
"""Verify the import statements of the restored modules against the disassembly.

Neither pycdc nor pycdas can render the *level* of a relative import: both emit
``from schema import PanelDocument`` for ``from .schema import PanelDocument``.
The level is only visible in the bytecode, as the ``LOAD_CONST`` that is pushed
just before the ``fromlist``:

    LOAD_CONST    4: 1                                  <- relative level
    LOAD_CONST    5: ('PanelDocument', '...')           <- fromlist
    IMPORT_NAME   2: schema
    IMPORT_FROM   3: PanelDocument

    LOAD_CONST    0: 0                                  <- absolute
    LOAD_CONST    8: ('Base',)
    IMPORT_NAME  10: backend.app.database

This tool recovers ``(level, module)`` for every import in a ``.das`` file and
compares it against the ``ast.Import`` / ``ast.ImportFrom`` nodes of the
restored source, so a wrong absolute/relative choice is caught.

Usage::

    python3 tools/verify_imports.py [--verbose] [path ...]
"""

from __future__ import annotations

import ast
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from reference import das_for  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]

# --------------------------------------------------------------------------
# Reviewed additions
# --------------------------------------------------------------------------
#
# This gate answers "was the de-obfuscation faithful?", so a deliberate change
# to the restored source surfaces here as an unexpected import.  Such a change
# is registered below, per file and per exact ``(level, module)`` pair, so that
# a real regression cannot hide behind a blanket ignore, exactly like
# :data:`tools.verify_restore.INTENTIONAL_DROPS`.  Keep it minimal and explain
# every entry.
REVIEWED_ADDITIONS: dict[str, set[tuple[int, str]]] = {
    # The Home Assistant WebSocket resolves its proxy through
    # ``urllib.request.getproxies``/``proxy_bypass``; both live in that module.
    "backend/app/ha/client.py": {
        (0, "urllib.request"),
    },
}


def reviewed_additions(target: Path) -> set[tuple[int, str]]:
    try:
        key = str(target.resolve().relative_to(ROOT))
    except ValueError:
        return set()
    return REVIEWED_ADDITIONS.get(key, set())


IMPORT_NAME_RE = re.compile(r"^\s*\d+\s+IMPORT_NAME\s+\d+:\s*(.+?)\s*$")
LOAD_CONST_RE = re.compile(r"^\s*\d+\s+LOAD_CONST\s+\d+:\s*(.*?)\s*$")
INSTRUCTION_RE = re.compile(r"^\s*(\d+)\s+([A-Z][A-Z0-9_]*)\s*(.*?)\s*$")
INT_RE = re.compile(r"^-?\d+$")


@dataclass
class DasImport:
    level: int
    module: str


def _iter_instructions(path: Path):
    """Yield ``(opname, operand)`` for every instruction line, in order."""
    for raw in path.read_text(encoding="utf-8", errors="replace").splitlines():
        stripped = raw.strip()
        if not stripped or stripped.startswith("#") or stripped.startswith("["):
            continue
        match = INSTRUCTION_RE.match(stripped)
        if match:
            yield match.group(2), match.group(3)


def das_imports(path: Path) -> list[DasImport]:
    """Recover ``(level, module)`` for every import in a disassembly file.

    CPython pushes the relative-import level and the ``fromlist`` as constants
    immediately before ``IMPORT_NAME``::

        LOAD_CONST   4: 1          <- level (0 = absolute)
        LOAD_CONST   5: ('Base',)  <- fromlist
        IMPORT_NAME 10: backend.app.database

    Neither pycdas nor pycdc print the level in the import rendering, so it has
    to be read back off these two instructions.
    """
    imports: list[DasImport] = []
    pending: list[str] = []
    for opname, operand in _iter_instructions(path):
        if opname == "IMPORT_NAME":
            module = operand.partition(":")[2].strip()
            level = 0
            if len(pending) >= 2 and pending[-1].startswith(("(", "[")):
                level_text = pending[-2]
                if INT_RE.match(level_text):
                    level = int(level_text)
            imports.append(DasImport(level=level, module=module))
            pending.clear()
            continue
        if opname == "LOAD_CONST":
            value = operand.partition(":")[2].strip()
            pending.append(value)
            if len(pending) > 3:
                pending.pop(0)
        else:
            pending.clear()
    return imports


def iter_imports(node: ast.AST):
    """Yield every import node in source order (module level and nested)."""
    for child in ast.iter_child_nodes(node):
        if isinstance(child, ast.Import):
            for alias in child.names:
                yield 0, alias.name
            yield from iter_imports(child)
        elif isinstance(child, ast.ImportFrom):
            yield child.level or 0, child.module or ""
            yield from iter_imports(child)
        else:
            yield from iter_imports(child)


def source_imports(path: Path) -> list[tuple[int, str]]:
    tree = ast.parse(path.read_text(encoding="utf-8", errors="replace"))
    return list(iter_imports(tree))


@dataclass
class Result:
    target: str
    missing: list[DasImport] = field(default_factory=list)
    unexpected: list[tuple[int, str]] = field(default_factory=list)
    reviewed: list[tuple[int, str]] = field(default_factory=list)
    error: str | None = None
    checked: int = 0


def verify(target: Path) -> Result:
    das_path = das_for(target)
    if das_path is None or not target.is_file():
        return Result(str(target), error="missing file")
    result = Result(str(target))
    expected = das_imports(das_path)
    try:
        actual = source_imports(target)
    except (SyntaxError, ValueError) as error:
        result.error = f"source parse failed: {error}"
        return result
    result.checked = len(expected)

    remaining = list(actual)
    for want in expected:
        match = None
        for index, have in enumerate(remaining):
            if have == (want.level, want.module):
                match = index
                break
        if match is None:
            result.missing.append(want)
        else:
            remaining.pop(match)
    reviewed = reviewed_additions(target)
    result.unexpected = [item for item in remaining if item not in reviewed]
    result.reviewed = [item for item in remaining if item in reviewed]
    return result


def discover(root: Path) -> list[Path]:
    targets = [p for p in sorted(root.rglob("*.py")) if ".1shot." not in p.name]
    return [p for p in targets if das_for(p) is not None]


def _format(level: int, module: str) -> str:
    if level:
        return f"from {'.' * level}{module} import ..."
    return f"import/from {module} import ..."


def main(argv: list[str]) -> int:
    root = Path(__file__).resolve().parents[1]
    verbose = "--verbose" in argv or "-v" in argv
    wants = [a for a in argv[1:] if not a.startswith("-")]
    targets = discover(root)
    if wants:
        targets = [t for t in targets if any(w in str(t) for w in wants)]
    clean = 0
    total_mismatch = 0
    for target in targets:
        result = verify(target)
        rel = target.relative_to(root)
        if result.error:
            print(f"ERROR {rel} :: {result.error}")
            total_mismatch += 1
            continue
        if not result.missing and not result.unexpected:
            clean += 1
            if verbose:
                print(f"OK    {rel} ({result.checked} imports)")
            # Reviewed deviations stay visible even when the check passes.
            for level, module in result.reviewed:
                print(f"NOTE  {rel}: reviewed addition {_format(level, module)}")
            continue
        total_mismatch += 1
        print(f"DIFF  {rel}")
        for want in result.missing:
            print(f"        disassembly has {_format(want.level, want.module)}")
        for level, module in result.unexpected:
            print(f"        source has      {_format(level, module)}")
    print(
        f"# checked {len(targets)} file(s): clean={clean} "
        f"with-differences={total_mismatch}"
    )
    return 1 if total_mismatch else 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
