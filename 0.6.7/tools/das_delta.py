#!/usr/bin/env python3
"""Compare a restored module tree against a reference build's .das files.

PyArmor's static unpacker embeds two classes of build noise in the exact
pycdas disassembly, neither of which is a semantic difference:

* `__pyarmor_assert_NNNN__` / `__pyarmor_enter_NNNN__` / `__pyarmor_exit_NNNN__`
  / `__pyarmor_bcc_NNNN__` carry a per-build counter suffix.
* `b'<COAddr>\\xNN\\xNN...'` blobs are runtime code-object cookies whose bytes
  differ on every build.

Once both are normalised away, two builds of the same module are usually
byte-identical even though the raw .das files differ.  This tool reports that
normalised view so the restoration can tell "same source, different build" from
"the source actually changed", and keeps the per-module ratio for the manual
reconciliation pass.

Usage:
    tools/das_delta.py [--root DIR] [--ref DIR] [--diff MODULE]
"""

from __future__ import annotations

import argparse
import difflib
import re
import sys
from pathlib import Path

MARKER = re.compile(r"__pyarmor_(assert|enter|exit|bcc)_[0-9]+__")
COADDR = re.compile(r"b'<COAddr>[^']*'")

# A disassembly line: indentation, byte offset, opcode, rest.
INSN = re.compile(r"^\s*(\d+)\s+(\S+)\s*(.*)$")
# Trailing jump annotation: "247 (to 532)".
JUMP_ANN = re.compile(r"\s*\(to \d+\)\s*$")
# Operand indexes: "4: 'entity_id'" -- the number is a per-build table index.
ARG_IDX = re.compile(r"^(\d+):\s?(.*)$")
# Exception-table rows: "28 to 450 -> 558 [0]".
EXC_ROW = re.compile(r"^\s*\d+ to \d+ -> \d+ \[(\d+)\][^\S\n]*$")


def normalise(line: str) -> str:
    line = MARKER.sub(lambda m: "__pyarmor_" + m.group(1) + "__", line)
    line = COADDR.sub("b'<COAddr>'", line)
    return line


def semantic(line: str) -> str:
    """Reduce a disassembly line to opcode + payload, dropping per-build offsets.

    A one-line source change shifts every later byte offset and jump target, which
    makes a line diff of the raw disassembly useless for large modules.  Dropping the
    offsets, the operand table indexes and the exception-table offsets keeps the
    opcode stream, the referenced names/constants and the handler nesting depth, so a
    small source change produces a small diff.
    """
    m = EXC_ROW.match(line)
    if m:
        return f"        EXC-TABLE-ENTRY depth=[{m.group(1)}]"
    m = INSN.match(line)
    if not m:
        return line
    rest, op = m.group(3), m.group(2)
    rest = JUMP_ANN.sub("", rest).strip()
    m2 = ARG_IDX.match(rest)
    if m2:
        rest = m2.group(2).strip()
    return (op + " " + rest).rstrip()


def normalised_lines(path: Path, use_semantic: bool = False) -> list[str]:
    lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
    if use_semantic:
        return [semantic(normalise(l)) for l in lines]
    return [normalise(l) for l in lines]


def das_files(root: Path) -> list[Path]:
    return sorted(list(root.glob("backend/**/*.1shot.das")) + list(root.glob("migrations/**/*.1shot.das")))


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", default=".")
    parser.add_argument("--ref", default="/tmp/ref065")
    parser.add_argument("--diff", default=None, help="print the normalised unified diff for one module")
    parser.add_argument("--top", type=float, default=0.0, help="only show modules with ratio >= this")
    parser.add_argument("--semantic", action="store_true", help="ignore per-build byte offsets and operand indexes")
    args = parser.parse_args(argv)

    root = Path(args.root).resolve()
    ref = Path(args.ref).resolve()

    if args.diff:
        target = Path(args.diff)
        other = ref / str(target)
        left = normalised_lines(other, args.semantic)
        right = normalised_lines(target, args.semantic)
        for line in difflib.unified_diff(left, right, str(other), str(target), lineterm="", n=3):
            print(line)
        return 0

    identical: list[str] = []
    near: list[tuple[float, str]] = []
    missing: list[str] = []
    for das in das_files(root):
        other = ref / str(das.relative_to(root))
        if not other.exists():
            missing.append(str(das.relative_to(root)))
            continue
        left = normalised_lines(other, args.semantic)
        right = normalised_lines(das, args.semantic)
        if left == right:
            identical.append(str(das.relative_to(root)))
            continue
        ratio = 1.0 - difflib.SequenceMatcher(None, left, right, autojunk=False).ratio()
        near.append((ratio, str(das.relative_to(root))))

    near.sort()
    print(f"# normalised-identical: {len(identical)}")
    for x in identical:
        print(f"  IDENTICAL      {x}")
    print(f"# changed: {len(near)}   # absent from reference: {len(missing)}")
    for ratio, name in near:
        if args.top and ratio < args.top:
            continue
        print(f"  {ratio:6.3f}         {name}")
    for x in missing:
        print(f"  NEW-IN-THIS    {x}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
