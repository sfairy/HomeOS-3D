#!/usr/bin/env python3
"""Rewrite intra-package imports of the restored modules to their original form.

The obfuscated release was built from a real ``backend.app`` package that used
*relative* imports for every project-internal module and absolute imports only
for stdlib/third-party code.  pycdas and pycdc both drop the leading dots, so
the automatic reconstruction produced absolute imports such as
``from dependencies import DatabaseSession`` where the original had
``from .dependencies import DatabaseSession``.

The level is recovered from the bytecode (see :mod:`tools.verify_imports`) and
this tool patches the source text accordingly.  Only the ``from <module>``
prefix is rewritten, so aliases, parenthesised name lists and comments are left
untouched.

Usage::

    python3 tools/fix_import_levels.py --dry-run
    python3 tools/fix_import_levels.py
"""

from __future__ import annotations

import ast
import sys
from dataclasses import dataclass
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from reference import das_for  # noqa: E402
from verify_imports import DasImport, das_imports  # noqa: E402


@dataclass
class Patch:
    line: int
    start: int
    end: int
    original: str
    replacement: str


def _match_levels(
    expected: list[DasImport], actual: list[tuple[ast.AST, int, str]]
) -> list[tuple[ast.AST, int, str, int]]:
    """Pair source imports with disassembly imports, returning level changes."""
    remaining_expected = list(expected)
    pending: list[tuple[ast.AST, int, str]] = []
    for node, level, module in actual:
        # Prefer an exact (level, module) match so duplicated modules such as
        # ``urllib.parse`` are not shuffled between statements.
        for index, want in enumerate(remaining_expected):
            if want.level == level and want.module == module:
                remaining_expected.pop(index)
                break
        else:
            pending.append((node, level, module))

    changes: list[tuple[ast.AST, int, str, int]] = []
    for node, level, module in pending:
        for index, want in enumerate(remaining_expected):
            if want.module == module:
                remaining_expected.pop(index)
                if want.level != level:
                    changes.append((node, level, module, want.level))
                break
    return changes


def _import_prefix(source_lines: list[str], node: ast.AST, module: str) -> Patch | None:
    """Locate the ``from <module>`` text of an import statement."""
    if not isinstance(node, ast.ImportFrom):
        return None
    line_index = node.lineno - 1
    if line_index >= len(source_lines):
        return None
    text = source_lines[line_index]
    start = node.col_offset
    prefix = f"from {module}"
    if not text.startswith(prefix, start):
        # Statements spanning lines or formatted unusually: skip rather than
        # risk corrupting the source.
        stripped = text[start:].lstrip()
        if not stripped.startswith(f"from {module}"):
            return None
        start = node.col_offset + (len(text) - node.col_offset - len(stripped))
    return Patch(
        line=line_index,
        start=start,
        end=start + len(prefix),
        original=prefix,
        replacement=f"from {'.' * node.level}{module}",
    )


def fix(target: Path, dry_run: bool) -> int:
    das_path = das_for(target)
    if das_path is None:
        return 0
    source = target.read_text(encoding="utf-8")
    try:
        tree = ast.parse(source)
    except SyntaxError as error:
        print(f"SKIP  {target} :: cannot parse ({error})")
        return 0

    actual = [(node, level, module) for node, level, module in _walk(tree)]
    changes = _match_levels(das_imports(das_path), actual)
    if not changes:
        return 0

    source_lines = source.splitlines(keepends=True)
    # ``ast.ImportFrom`` node carries the level in ``node.level`` only after the
    # level is applied below, so rebuild the prefix from the target level.
    patches: list[Patch] = []
    for node, level, module, target_level in changes:
        if not isinstance(node, ast.ImportFrom):
            # The disassembly records a relative 'from .X import Y' but pycdc
            # rendered it as a bare 'import X' (function-local imports are
            # mangled this way).  An ast.Import has no level to rewrite, so
            # record it for the manual reconciliation pass instead of guessing.
            print(
                f"NOTE  {target}: disassembly has level-{target_level} import "
                f"{module!r}, source has a bare 'import {module}' (manual pass)"
            )
            continue
        node.level = target_level
        patch = _import_prefix(source_lines, node, module)
        if patch is not None:
            patches.append(patch)

    if not patches:
        return 0

    for patch in sorted(patches, key=lambda p: (p.line, p.start), reverse=True):
        text = source_lines[patch.line]
        source_lines[patch.line] = (
            text[: patch.start] + patch.replacement + text[patch.end :]
        )

    applied = len(patches)
    print(f"{'WOULD FIX' if dry_run else 'FIXED'} {target}: {applied} import(s)")
    for patch in sorted(patches, key=lambda p: p.line):
        print(
            f"        line {patch.line + 1}: "
            f"{patch.original} -> {patch.replacement}"
        )
    if not dry_run:
        target.write_text("".join(source_lines), encoding="utf-8")
    return applied


def _walk(node: ast.AST):
    for child in ast.iter_child_nodes(node):
        if isinstance(child, ast.Import):
            for alias in child.names:
                yield child, 0, alias.name
        elif isinstance(child, ast.ImportFrom):
            yield child, child.level or 0, child.module or ""
        yield from _walk(child)


def main(argv: list[str]) -> int:
    root = Path(__file__).resolve().parents[1]
    dry_run = "--dry-run" in argv
    wants = [a for a in argv[1:] if not a.startswith("-")]
    targets = [p for p in sorted(root.rglob("*.py")) if ".1shot." not in p.name]
    targets = [p for p in targets if das_for(p) is not None]
    if wants:
        targets = [t for t in targets if any(w in str(t) for w in wants)]
    total = 0
    touched = 0
    for target in targets:
        applied = fix(target, dry_run)
        total += applied
        touched += 1 if applied else 0
    print(f"# {total} import(s) in {touched} file(s)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
