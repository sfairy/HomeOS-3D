#!/usr/bin/env python3
"""Read PyArmor/pycdas ``.das`` disassembly files.

The Pyarmor-Static-Unpack-1shot output is complete but verbose: every code
object carries the ``__pyarmor_enter_*`` / ``__pyarmor_exit_*`` prologue and
epilogue instructions plus assertion-marker residue.  This helper strips that
noise so the real bytecode can be read quickly while reconstructing source.

Usage::

    python3 tools/das_view.py <file.das> [ObjectName ...]

With no object name, the module-level (``<module>``) disassembly is shown.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

CODE_START = "[Code]"
PYARMOR_INSN_RE = re.compile(r"__pyarmor_(?:enter|exit|assert)_\d+__")
CALL_HEADER_RE = re.compile(r"^(\s*)(\d+)\s+(\S+)\s*(.*)$")

# Instructions that only exist to serve the PyArmor runtime wrapper.
NOISE_INSNS = {"NOP"}


def split_code_objects(text: str) -> dict[str, list[str]]:
    """Return ``{object name: [lines]}`` for every code object in the file.

    Code objects are nested (a module contains functions, a class body contains
    methods), so a block runs until the next ``[Code]`` at the same or lower
    indentation.
    """
    starts: list[tuple[int, int, str]] = []
    lines = text.splitlines()
    for idx, line in enumerate(lines):
        if line.strip() == CODE_START:
            indent = len(line) - len(line.lstrip())
            name = "<unknown>"
            for follow in lines[idx + 1 : idx + 6]:
                m = re.match(r"\s*Object Name: (.+?)\s*$", follow)
                if m:
                    name = m.group(1)
                    break
            starts.append((idx, indent, name))
    objects: dict[str, list[str]] = {}
    for pos, (idx, indent, name) in enumerate(starts):
        end = len(lines)
        for nxt_idx, nxt_indent, _ in starts[pos + 1 :]:
            if nxt_indent <= indent:
                end = nxt_idx
                break
        objects.setdefault(name, lines[idx:end])
    return objects


def clean_lines(lines: list[str]) -> list[str]:
    out: list[str] = []
    in_disasm = False
    for line in lines:
        if "[Disassembly]" in line:
            in_disasm = True
            out.append(line)
            continue
        if not in_disasm:
            out.append(line)
            continue
        m = CALL_HEADER_RE.match(line)
        if not m:
            out.append(line)
            continue
        opname = m.group(3)
        rest = m.group(4)
        if opname in NOISE_INSNS:
            continue
        if PYARMOR_INSN_RE.search(line):
            out.append(f"{m.group(1)}{m.group(2):<8}{'BYTECODE':<32}# pyarmor marker")
            continue
        out.append(line)
    # Collapse runs of pyarmor markers.
    collapsed: list[str] = []
    for line in out:
        if line.endswith("# pyarmor marker") and collapsed and collapsed[-1].endswith(
            "# pyarmor marker"
        ):
            continue
        collapsed.append(line)
    return collapsed


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        print(__doc__)
        return 2
    path = Path(argv[1])
    text = path.read_text(encoding="utf-8", errors="replace")
    objects = split_code_objects(text)
    wanted = argv[2:]
    if not wanted:
        wanted = ["<module>"]
    for name in wanted:
        lines = objects.get(name)
        if lines is None:
            matches = [k for k in objects if name in k]
            if len(matches) == 1:
                lines = objects[matches[0]]
                name = matches[0]
            else:
                print(f"### no code object {name!r}; candidates: {matches[:10]}")
                continue
        print(f"######## {name} ########")
        print("\n".join(clean_lines(lines)))
        print()
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
