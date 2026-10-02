#!/usr/bin/env python3
"""Remove `// @ts-nocheck` pragmas one batch at a time.

The pragma must be the *first* line of the file; anything else is refused, so a
mistyped path can never silently rewrite code.  Run with no arguments to list
what is left.

Usage:
    python3 tools/strip_nocheck.py --list
    python3 tools/strip_nocheck.py app/bridge/access-monitor.ts runtime/light/light-stream.ts
    python3 tools/strip_nocheck.py --all --dry-run
"""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

APP = Path(__file__).resolve().parents[1]
SRC = APP / "frontend" / "src"
PRAGMA_PREFIX = "// @ts-nocheck"


def remaining() -> list[Path]:
    return sorted(p for p in SRC.rglob("*.ts") if p.read_text(encoding="utf-8").startswith(PRAGMA_PREFIX))


def strip(path: Path) -> None:
    text = path.read_text(encoding="utf-8")
    first, _, rest = text.partition("\n")
    if not first.startswith(PRAGMA_PREFIX):
        raise SystemExit(f"refusing {path}: first line is not a @ts-nocheck pragma")
    if not first.rstrip().endswith(")"):
        raise SystemExit(f"refusing {path}: unexpected pragma text: {first!r}")
    path.write_text(rest, encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("files", nargs="*", help="paths relative to frontend/src")
    parser.add_argument("--list", action="store_true", help="list files still carrying the pragma")
    parser.add_argument("--all", action="store_true", help="strip every remaining pragma")
    parser.add_argument("--dry-run", action="store_true", help="show what would change")
    parser.add_argument("--typecheck", action="store_true", help="run tsc afterwards")
    parser.add_argument("--build-runtime", action="store_true", help="run the runtime build afterwards")
    args = parser.parse_args()

    if args.list:
        files = remaining()
        print(f"{len(files)} files still carry {PRAGMA_PREFIX}")
        for path in files:
            print(f"  {path.relative_to(SRC)}")
        return 0

    if args.all:
        targets = remaining()
    elif args.files:
        targets = [SRC / rel for rel in args.files]
    else:
        parser.print_help()
        return 2

    missing = [p for p in targets if not p.is_file()]
    if missing:
        raise SystemExit("not found: " + ", ".join(str(p) for p in missing))

    for path in targets:
        if args.dry_run:
            print(f"would strip  {path.relative_to(SRC)}")
        else:
            strip(path)
            print(f"stripped      {path.relative_to(SRC)}")
    print(f"\n{len(targets)} file(s) {'previewed' if args.dry_run else 'updated'}")
    if not args.dry_run:
        print(f"{len(remaining())} files still carry the pragma")

    if args.typecheck and not args.dry_run:
        proc = subprocess.run(
            [str(APP.parent / "node_modules" / ".bin" / "tsc"), "-p", str(APP / "tsconfig.json"), "--pretty", "false"],
            cwd=str(APP),
        )
        if proc.returncode != 0:
            print("\n[strip_nocheck] typecheck FAILED", file=sys.stderr)
            return proc.returncode
        print("\n[strip_nocheck] typecheck clean")

    if args.build_runtime and not args.dry_run:
        proc = subprocess.run(["bun", "run", "build:runtime"], cwd=str(APP))
        if proc.returncode != 0:
            print("\n[strip_nocheck] build:runtime FAILED", file=sys.stderr)
            return proc.returncode
        print("\n[strip_nocheck] build:runtime clean")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
