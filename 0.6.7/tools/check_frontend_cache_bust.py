#!/usr/bin/env python3
"""Independent cross-check of the frontend cache-busting query strings.

Every "?v=..." query string that appears in the restored frontend must also
appear verbatim in the corresponding 0.6.7 original file.  The originals are
javascript-obfuscated: their literals live in a (rotated) string array, so a
verbatim substring search proves the exact token survived the rewrite.  The
full import-specifier comparison is AC-F3 in tools/validate_js.mjs; this script
is the cheap, independent second opinion.

Usage:  python3 tools/check_frontend_cache_bust.py
Exit status is non-zero when a token is missing.
"""
import pathlib
import re
import sys

WORKSPACE = pathlib.Path(__file__).resolve().parents[2]
SRC = WORKSPACE / "frontend"
DST = WORKSPACE / "recovered" / "frontend"
TOKEN = re.compile(r"[^\"'\s]*\?v=[A-Za-z0-9._\-]+")


def main() -> int:
    missing: list[tuple[str, str]] = []
    files = 0
    total = 0
    for out in sorted(DST.rglob("*.js")):
        if not out.is_file():
            continue
        rel = out.relative_to(DST)
        tokens = set(TOKEN.findall(out.read_text(encoding="utf-8", errors="replace")))
        if not tokens:
            continue
        files += 1
        src = SRC / rel
        source_text = src.read_text(encoding="utf-8", errors="replace") if src.exists() else ""
        for token in sorted(tokens):
            total += 1
            if token not in source_text:
                missing.append((str(rel), token))
    print(f"# files-with-cache-bust={files} tokens={total} missing-in-original={len(missing)}")
    for rel, token in missing[:20]:
        print(f"MISSING {rel}: {token}")
    return 1 if missing else 0


if __name__ == "__main__":
    sys.exit(main())
