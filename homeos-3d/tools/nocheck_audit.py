#!/usr/bin/env python3
"""Measure the TypeScript debt hidden behind `// @ts-nocheck` pragmas.

TypeScript offers no flag to ignore `@ts-nocheck`, so the only way to see the
hidden errors is to physically remove the pragmas and re-run the compiler.  This
script does that inside a throwaway shadow copy of the source tree, so the real
working tree is never touched.

It reports, per file, how many errors appear once the pragma is dropped.  Use
that ranking to pick cheap batches instead of guessing.

Usage:
    python3 tools/nocheck_audit.py                  # table, all files, by count
    python3 tools/nocheck_audit.py --json           # machine-readable
    python3 tools/nocheck_audit.py --top 30         # only the cheapest 30 files
    python3 tools/nocheck_audit.py --codes          # error code histogram
    python3 tools/nocheck_audit.py --samples TS2339 # sample real error messages
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import sys
import tempfile
from collections import Counter, defaultdict
from pathlib import Path

APP = Path(__file__).resolve().parents[1]          # homeos-3d/
REPO = APP.parent                                   # repo root
SRC = APP / "frontend" / "src"
TS_CONFIG = APP / "tsconfig.json"

# Files referenced by tsconfig `include` besides frontend/src.
EXTRA_INCLUDES = [
    "frontend/vite.config.ts",
    "frontend/vite.runtime.config.ts",
    "frontend/vite-quiet-logger.ts",
]

PRAGMA = re.compile(r"^[ \t]*//[ \t]*@ts-nocheck\b.*$\n?", re.MULTILINE)
ERROR_LINE = re.compile(
    r"^(?P<file>.+?)\((?P<line>\d+),(?P<col>\d+)\): error (?P<code>TS\d+): (?P<msg>.*)$"
)


def files_with_pragma() -> list[Path]:
    return sorted(p for p in SRC.rglob("*.ts") if PRAGMA.search(p.read_text(encoding="utf-8")))


def build_shadow(dest: Path) -> None:
    """Copy the compiler inputs into `dest` without the @ts-nocheck pragmas."""
    shutil.copytree(SRC, dest / "frontend" / "src", dirs_exist_ok=True)
    shutil.copy2(TS_CONFIG, dest / "tsconfig.json")
    for rel in EXTRA_INCLUDES:
        target = dest / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(APP / rel, target)

    # The shadow lives outside the project, so bare specifiers ('vite', 'three',
    # ...) would not resolve by walking up the directory tree.  Link the real
    # node_modules in so only the pragma removal affects the result.
    nm = APP / "node_modules"
    if nm.is_dir():
        (dest / "node_modules").symlink_to(nm, target_is_directory=True)

    stripped = 0
    for path in (dest / "frontend" / "src").rglob("*.ts"):
        text = path.read_text(encoding="utf-8")
        new = PRAGMA.sub("", text)
        if new != text:
            path.write_text(new, encoding="utf-8")
            stripped += 1
    print(f"[audit] shadow tree ready, stripped {stripped} pragmas", file=sys.stderr)


def run_tsc(shadow: Path) -> list[dict]:
    tsc = REPO / "node_modules" / ".bin" / "tsc"
    proc = subprocess.run(
        [str(tsc), "-p", str(shadow / "tsconfig.json"), "--pretty", "false"],
        capture_output=True,
        text=True,
        cwd=str(shadow),
    )
    errors = []
    # tsc runs with cwd=shadow and may print either absolute paths or paths
    # relative to that cwd; macOS also symlinks /var -> /private/var, so resolve
    # both sides before computing the relative name.
    shadow_real = shadow.resolve()
    for raw in proc.stdout.splitlines():
        m = ERROR_LINE.match(raw)
        if not m:
            continue
        reported = Path(m.group("file"))
        if not reported.is_absolute():
            reported = shadow / reported
        try:
            rel = str(reported.resolve().relative_to(shadow_real))
        except ValueError:
            rel = str(reported)
        errors.append(
            {
                "file": rel,
                "line": int(m.group("line")),
                "col": int(m.group("col")),
                "code": m.group("code"),
                "message": m.group("msg"),
            }
        )
    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--json", action="store_true", help="emit JSON instead of a table")
    parser.add_argument("--top", type=int, default=0, help="only the N files with fewest errors")
    parser.add_argument("--codes", action="store_true", help="print the error-code histogram")
    parser.add_argument("--samples", metavar="TSCODE", help="print sample messages for one error code")
    parser.add_argument("--file", metavar="SUBSTR", help="show every error in files matching SUBSTR")
    parser.add_argument("--context", type=int, default=0, metavar="N", help="with --file, print N lines of source context")
    parser.add_argument("--dump", metavar="PATH", help="write the full error list as JSON to PATH")
    args = parser.parse_args()

    pragma_files = files_with_pragma()
    print(f"[audit] {len(pragma_files)} files carry @ts-nocheck", file=sys.stderr)

    shadow = Path(tempfile.mkdtemp(prefix="nocheck-shadow-"))
    try:
        build_shadow(shadow)
        errors = run_tsc(shadow)
    finally:
        shutil.rmtree(shadow, ignore_errors=True)

    per_file: Counter[str] = Counter()
    per_code: Counter[str] = Counter()
    by_code: dict[str, list[dict]] = defaultdict(list)
    for err in errors:
        per_file[err["file"]] += 1
        per_code[err["code"]] += 1
        by_code[err["code"]].append(err)

    print(
        f"[audit] {len(errors)} errors across {len(per_file)} files "
        f"(of which {len(pragma_files)} had pragmas)",
        file=sys.stderr,
    )

    if args.dump:
        Path(args.dump).write_text(
            json.dumps({"errors": errors, "codes": dict(per_code)}, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        print(f"[audit] wrote {len(errors)} errors to {args.dump}", file=sys.stderr)

    if args.file:
        sel = [e for e in errors if args.file in e["file"]]
        for path in sorted({e["file"] for e in sel}):
            print(f"--- {path} ---")
            source = (APP / path).read_text(encoding="utf-8").splitlines()
            for err in [e for e in sel if e["file"] == path]:
                print(f"  {err['line']:>6}:{err['col']:<4} {err['code']}  {err['message'][:200]}")
                if args.context:
                    lo = max(0, err["line"] - args.context - 1)
                    hi = min(len(source), err["line"] + args.context)
                    for n in range(lo, hi):
                        mark = ">>" if n == err["line"] - 1 else "  "
                        print(f"      {mark} {n + 1:>5}| {source[n]}")
        if not sel:
            print(f"no errors match {args.file!r}")
        return 0

    if args.samples:
        print(f"--- samples for {args.samples} ---")
        for err in by_code.get(args.samples, [])[:15]:
            print(f"{err['file']}:{err['line']}  {err['message'][:160]}")
        return 0

    if args.codes:
        print(f"{'count':>7}  code")
        for code, count in per_code.most_common():
            print(f"{count:>7}  {code}")
        return 0

    rows = sorted(per_file.items(), key=lambda kv: (kv[1], kv[0]))
    if args.top:
        rows = rows[: args.top]

    if args.json:
        print(
            json.dumps(
                {
                    "totalErrors": len(errors),
                    "pragmaFiles": len(pragma_files),
                    "files": [{"file": f, "errors": c} for f, c in rows],
                    "codes": dict(per_code),
                },
                ensure_ascii=False,
                indent=2,
            )
        )
        return 0

    print(f"{'errors':>7}  file")
    for path, count in rows:
        marker = " " if path in {str(p.relative_to(APP)) for p in pragma_files} else "*"
        print(f"{count:>7} {marker} {path}")

    clean = [p for p in pragma_files if per_file.get(str(p.relative_to(APP)), 0) == 0]
    print(
        f"\n[audit] {len(clean)} pragma files compile with ZERO errors once the pragma is dropped",
        file=sys.stderr,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
