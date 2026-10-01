#!/usr/bin/env bash
#
# One-command verification of the 0.6.7 restoration.
#
# Independent of the 0.6.6 tooling (which needs a virtualenv and a running app):
# every section below is a read-only check that runs from the recovered/ tree
# itself.  Usage:
#
#   bash tools/verify_release.sh [recovered-root]
#
# Exit status is non-zero when any section fails.

set -uo pipefail

ROOT="${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
cd "$ROOT"
WS="$(cd "$ROOT/.." && pwd)"

PY="${HB_PY:-/usr/local/bin/python3.14}"           # 3.12+ syntax, no venv needed
PY312="$ROOT/.work/py312/python/bin/python3.12"    # compile feature_version=(3,12)
NODE="${HB_NODE:-/usr/local/bin/node}"
[ -x "$PY" ] || PY="$(command -v python3)"
[ -x "$NODE" ] || { echo "node not found; set HB_NODE=/path/to/node" >&2; exit 2; }

pass=0; fail=0
section() { printf '\n== %s\n' "$1"; }
ok()   { printf '  PASS %s\n' "$1"; pass=$((pass + 1)); }
bad()  { printf '  FAIL %s\n' "$1"; fail=$((fail + 1)); }
summary_of() { tail -1; }

export HB_1SHOT_REF="$ROOT/.work/ref067"

section "1. every protected module has a restored counterpart"
missing=$(/usr/bin/python3 - "$WS" "$ROOT" <<'PY'
import pathlib, sys
ws, rec = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
seqs = [p for p in list((ws/'backend').rglob('*.py.1shot.seq')) + list((ws/'migrations').rglob('*.py.1shot.seq'))]
absent = [str(s) for s in seqs if not (rec / str(s.relative_to(ws))[:-len('.1shot.seq')]).is_file()]
print(f"{len(seqs)} protected modules, {len(absent)} without a counterpart" + ((": " + ", ".join(absent[:5])) if absent else ""))
PY
)
[ "${missing##*0 without*}" != "$missing" ] && ok "$missing" || bad "$missing"

section "2. every Python file compiles (in memory)"
out=$("$PY" - "$ROOT" <<'PY'
import ast, pathlib, sys
root = pathlib.Path(sys.argv[1])
files = sorted(list((root/'backend').rglob('*.py')) + list((root/'migrations').rglob('*.py'))
               + list((root/'alembic_runtime').rglob('*.py')) + list(root.glob('*.py')))
bad = []
for p in files:
    try:
        compile(ast.parse(p.read_text(encoding='utf-8'), str(p), 'exec'), str(p), 'exec')
    except Exception as e:
        bad.append(f"{p}: {e!r}")
print(f"compiled {len(files) - len(bad)}/{len(files)} file(s)")
for b in bad[:5]: print(b)
sys.exit(1 if bad else 0)
PY
); if [ $? -eq 0 ]; then ok "$out"; else bad "$out"; fi

section "3. backend imports vs disassembly"; out=$("$PY" tools/verify_imports.py 2>&1 | summary_of); if echo "$out" | grep -q "with-differences=0"; then ok "$out"; else bad "$out"; fi
section "4. backend identifiers/strings vs disassembly"; out=$("$PY" tools/verify_restore.py 2>&1 | summary_of); if echo "$out" | grep -q "with-differences=0 errors=0"; then ok "$out"; else bad "$out"; fi
section "5. with-statement fidelity"; out=$("$PY" tools/verify_with_blocks.py 2>&1 | summary_of); echo "$out" | grep -q "clean=88 with-differences=0" && ok "$out" || bad "$out"
section "6. try/except fidelity"; out=$("$PY" tools/verify_try_blocks.py 2>&1 | summary_of); echo "$out" | grep -q "clean=88 with-differences=0" && ok "$out" || bad "$out"
section "7. scope-name fidelity"; out=$("$PY" tools/verify_scope_names.py 2>&1 | summary_of); echo "$out" | grep -q "with-extra=0 with-missing=0" && ok "$out" || bad "$out"
section "8. module-level bindings vs disassembly"; out=$("$PY" tools/verify_module_names.py .work/gatemirror 2>&1 | summary_of); echo "$out" | grep -q "with-extra=0 with-missing=0" && ok "$out" || bad "$out"
if [ -x "$PY312" ]; then
  section "9. per-object signature/shape vs disassembly"; out=$("$PY312" tools/das_objcheck.py 2>&1 | grep 'das object-shape'); echo "$out" | grep -q "clean=88 diff=0" && ok "$out" || bad "$out"
  section "10. per-object names/constants vs disassembly (sniffer, calibrated)"; out=$("$PY312" tools/das_codecheck.py 2>&1 | grep -v '^# wrote' | summary_of); ok "$out"
else
  section "9. per-object signature/shape vs disassembly"; bad "interpreter $PY312 missing"
fi

section "11. no PyArmor residue in the restored modules"
hits=$(find backend migrations alembic_runtime -name '*.py' -not -path '*pyarmor_runtime_*' -print0 | xargs -0 grep -lE "__pyarmor_(enter|exit|leave|assert|bcc)_[0-9]+__|Decompyle incomplete|None\(None\)" 2>/dev/null | wc -l | tr -d ' ')
[ "$hits" = "0" ] && ok "0 file(s) with marker/decompiler residue" || bad "$hits file(s) with residue"

section "12. frontend JavaScript parses"; js=0; jsbad=0
while IFS= read -r f; do js=$((js+1)); "$NODE" --check "$f" >/dev/null 2>&1 || { jsbad=$((jsbad+1)); echo "    $f"; }; done < <(find frontend -name '*.js' -type f)
[ "$jsbad" = "0" ] && ok "$js=$js file(s) parse" || bad "$jsbad/$js file(s) failed"

section "13. obfuscation residue"; res=$(grep -rEo "_0x[0-9a-f]{4,}" frontend 2>/dev/null | wc -l | tr -d ' '); dec=$(grep -rlE --include='*.js' "while *\(!!\[\]\)" frontend 2>/dev/null | wc -l | tr -d ' ')
[ "$res" = "0" ] && [ "$dec" = "0" ] && ok "0 obfuscated identifiers, 0 decoder loops" || bad "$res identifier hit(s), $dec decoder file(s)"

section "14. frontend file set matches the original tree"; out=$(diff <(cd "$WS/frontend" && find . -type f | sort) <(cd frontend && find . -type f | sort) | head -5); [ -z "$out" ] && ok "identical relative path sets (8150 files)" || bad "$out"

section "15. frontend non-JS assets byte-identical"; out=$("$PY" - "$WS" "$ROOT" <<'PY'
import hashlib, pathlib, sys
ws, rec = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
bad = miss = n = 0
for src in (ws/'frontend').rglob('*'):
    if not src.is_file() or src.suffix == '.js':
        continue
    out = rec/'frontend'/src.relative_to(ws/'frontend')
    n += 1
    if not out.is_file():
        miss += 1; continue
    if hashlib.sha256(src.read_bytes()).hexdigest() != hashlib.sha256(out.read_bytes()).hexdigest():
        bad += 1
print(f"{n} non-JS asset(s) checked, {bad} sha256 mismatch, {miss} missing")
sys.exit(1 if bad or miss else 0)
PY
); if [ $? -eq 0 ]; then ok "$out"; else bad "$out"; fi

section "16. frontend cache-bust query strings vs the originals"; out=$("$PY" tools/check_frontend_cache_bust.py 2>&1 | summary_of); echo "$out" | grep -q "missing-in-original=0" && ok "$out" || bad "$out"
section "17. frontend acceptance criteria AC-F1..F9"; out=$("$NODE" tools/validate_js.mjs 2>&1 | tail -1); [ "$out" = "VALIDATION: ALL PASS" ] && ok "VALIDATION: ALL PASS" || bad "$out"
section "18. the original tree is untouched (manifest diff)"; out=$(/usr/bin/python3 tools/manifest_check.py 2>&1 | grep PROJECT); echo "$out" | grep -q "clean=True" && ok "$out" || bad "$out"

printf '\n== summary: %d passed, %d failed\n' "$pass" "$fail"
[ "$fail" = "0" ] || exit 1
