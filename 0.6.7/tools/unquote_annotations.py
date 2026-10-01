#!/usr/bin/env python3
"""Un-quote PEP 563 annotations.

"from __future__ import annotations" stores every annotation as its *source
text*, so "id: Mapped[str]" and "id: 'Mapped[str]'" are not equivalent: the
first records "Mapped[str]", the second records "'Mapped[str]'".  pycdc
rendered the disassembly's annotation constants back as quoted string
literals, which is invisible to the fidelity gate (the constant is present
either way) but breaks anything that evaluates annotations at runtime --
SQLAlchemy 2.x resolves Mapped[...] and fails with MappedAnnotationError.

This tool un-quotes annotation nodes that are plain string constants, but only
in files that actually import the future feature (elsewhere a quoted annotation
is a real forward reference and must stay quoted).

Usage: python3 tools/unquote_annotations.py [--dry] [path ...]
"""
from __future__ import annotations

import ast
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def targets_from(argv):
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


def has_future_annotations(tree):
    for node in tree.body:
        if isinstance(node, ast.ImportFrom) and node.module == "__future__":
            if any(a.name == "annotations" for a in node.names):
                return True
    return False


def unquote(path, dry):
    text = path.read_text(encoding="utf-8")
    try:
        tree = ast.parse(text)
    except SyntaxError:
        return (0, 0)
    if not has_future_annotations(tree):
        return (0, 0)
    lines = text.splitlines(keepends=True)
    offsets = [0]
    for line in lines:
        offsets.append(offsets[-1] + len(line))

    edits = []
    for node in ast.walk(tree):
        ann_nodes = []
        if isinstance(node, ast.AnnAssign):
            ann_nodes = [node.annotation]
        elif isinstance(node, ast.arg) and node.annotation is not None:
            ann_nodes = [node.annotation]
        elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            args = node.args
            ann_nodes = [
                a.annotation
                for a in (*args.posonlyargs, *args.args, *args.kwonlyargs, args.vararg, args.kwarg)
                if a is not None and a.annotation is not None
            ]
            if node.returns is not None:
                ann_nodes.append(node.returns)
        for ann in ann_nodes:
            if isinstance(ann, ast.Constant) and isinstance(ann.value, str):
                start = offsets[ann.lineno - 1] + ann.col_offset
                end = offsets[ann.end_lineno - 1] + ann.end_col_offset
                edits.append((start, end, ann.value))

    edits = sorted(set(edits))
    applied = 0
    for start, end, value in reversed(edits):
        candidate = text[:start] + value + text[end:]
        try:
            ast.parse(candidate)
        except SyntaxError:
            continue
        text = candidate
        applied += 1

    if applied and not dry:
        path.write_text(text, encoding="utf-8")
    return (applied, len(edits))


def main(argv):
    dry = "--dry" in argv
    total = 0
    files = 0
    for path in targets_from(argv):
        if not path.is_file():
            continue
        applied, found = unquote(path, dry)
        if found:
            files += 1
            total += applied
            tag = "DRY " if dry else ""
            print(tag + str(path.relative_to(ROOT)) + ": unquoted " + str(applied) + "/" + str(found))
    verb = "would unquote" if dry else "unquoted"
    print("# " + verb + " " + str(total) + " annotation(s) in " + str(files) + " file(s)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
