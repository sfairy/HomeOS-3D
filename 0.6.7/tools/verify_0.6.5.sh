#!/usr/bin/env bash
#
# One-click verification for the ha-bridge 0.6.5 restoration.
#
# Mirrors the 16 gates the 0.5.4 restoration used (RESTORE-REPORT-0.5.4.md),
# retargeted at this release: 80 PyArmor modules and 153 obfuscated scripts.
#
# Usage: tools/verify_0.6.5.sh [--boot]
#   --boot  also start the app and exercise the request flow (needs a free port)
#
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# The sandbox python3 is 3.9.6, whose tokenize predates PEP 701: identifiers
# inside f-string expressions are invisible to it.  The gate needs >= 3.12.
PY="${HB_PYTHON:-}"
if [ -z "$PY" ]; then
  for candidate in "$ROOT/.venv-store/bin/python3" /Users/sfairy/项目/HomeOS/HomeOS-3D/.venv-store/bin/python3; do
    if [ -x "$candidate" ]; then PY="$candidate"; break; fi
  done
fi
[ -z "$PY" ] && PY="$(command -v python3.12 || command -v python3)"
NODE="${HB_NODE:-/usr/local/bin/node}"
FRONT_ORIG=".restore/orig-frontend/frontend"

pass=0; fail=0
section() { printf "\n== %s\n" "$1"; }
ok()   { printf "  PASS %s\n" "$1"; pass=$((pass+1)); }
bad()  { printf "  FAIL %s\n" "$1"; fail=$((fail+1)); }

section "0. interpreter"
"$PY" -c "import sys,tokenize; assert hasattr(tokenize,'FSTRING_START'), 'needs Python >= 3.12'; print('  using', sys.version.split()[0])" \
  && ok "python >= 3.12 (f-string identifiers are visible to the gate)" || bad "python too old"

section "1. no PyArmor artefacts in the app tree"
left=$(find backend migrations -name "*.1shot.*" 2>/dev/null | wc -l | tr -d " ")
rt=$(find . -maxdepth 3 -name "pyarmor_runtime_*" -not -path "./.restore/*" -not -path "./tools/*" 2>/dev/null | wc -l | tr -d " ")
[ "$left" = "0" ] && [ "$rt" = "0" ] && ok "0 .1shot.*, 0 pyarmor_runtime_*" || bad "$left .1shot.* / $rt pyarmor_runtime_* remain"

section "2. Python syntax"
out=$("$PY" - <<'PYEOF'
import pathlib
files = sorted(p for p in list(pathlib.Path("backend").rglob("*.py")) + list(pathlib.Path("migrations").rglob("*.py"))
               if ".1shot." not in p.name and "pyarmor_runtime" not in str(p))
bad = []
for p in files:
    try: compile(p.read_text(encoding="utf-8"), str(p), "exec")
    except Exception as e: bad.append((p, e))
print(f"{len(files)} files, {len(bad)} failures")
for p, e in bad: print("   ", p, e)
PYEOF
)
echo "$out" | grep -q ", 0 failures" && ok "$(echo "$out" | head -1)" || bad "$out"

section "3. backend imports match the disassembly"
o=$({ "$PY" tools/verify_imports.py 2>&1 || true; } | tail -1)
echo "$o" | grep -q "clean=80 with-differences=0" && ok "$o" || bad "$o"

section "4. backend names/strings match the disassembly"
o=$({ "$PY" tools/verify_restore.py 2>&1 || true; } | tail -1)
echo "$o" | grep -q "clean=80 with-differences=0 errors=0" && ok "$o" || bad "$o"

section "5. with-blocks match the disassembly"
o=$({ "$PY" tools/verify_with_blocks.py 2>&1 || true; } | tail -1)
echo "$o" | grep -q "checked 80 file(s): clean=80 with-differences=0" && ok "$o" || bad "$o"

section "5b. typed except-clauses and leftovers match the disassembly"
o=$({ "$PY" tools/verify_try_blocks.py 2>&1 || true; } | tail -1)
echo "$o" | grep -q "checked 80 file(s): clean=80 with-differences=0 files-with-todo=0" && ok "$o" || bad "$o"

section "6. frontend parses"
badjs=0; n=0
while IFS= read -r f; do
  n=$((n+1)); "$NODE" --check "$f" >/dev/null 2>&1 || { badjs=$((badjs+1)); echo "    $f"; }
done < <(find frontend -name "*.js" -type f)
[ "$badjs" = "0" ] && ok "$n files parse" || bad "$badjs of $n files fail to parse"

section "7. no obfuscator residue"
r=$(grep -rho "_0x[0-9a-f]\{4,\}" frontend --include="*.js" 2>/dev/null | wc -l | tr -d " ")
[ "$r" = "0" ] && ok "0 obfuscated identifiers" || bad "$r obfuscated identifier(s) left"

section "8. frontend strings are faithful to the original obfuscated sources"
o=$({ "$NODE" tools/verify_frontend_strings.mjs "$FRONT_ORIG" frontend 2>&1 || true; } | tail -1)
echo "$o" | grep -q "lost-strings=0" && ok "$o" || bad "$o"

section "9. frontend ES module graph resolves"
o=$({ "$NODE" tools/verify_frontend_imports.mjs 2>&1 || true; } | tail -1)
echo "$o" | grep -q "unresolved=0 bare=0" && ok "$o" || bad "$o"

section "10. the restored app imports and registers its routes"
o=$("$PY" -c "import sys; sys.path.insert(0,'.'); import backend.app.main as m; print('routes=', len(m.app.routes))" 2>&1 | tail -1)
echo "$o" | grep -q "routes= 33" && ok "$o" || bad "$o"

if [ "${1:-}" = "--boot" ]; then
  section "11. runtime: boot, migrate, login"
  # An ambient `no_proxy` containing "[::1]" makes httpx build a URLPattern it
  # cannot parse, and the app's update checker then raises
  # `InvalidURL: Invalid port: ':1]'` during lifespan shutdown.  That is an
  # environment leak, not an application fault: clear the proxy variables if this
  # section reports "Invalid port".
  export APP_DATA_DIR="$(mktemp -d)/data"
  mkdir -p "$APP_DATA_DIR"
  "$PY" -m uvicorn backend.app.main:app --host 127.0.0.1 --port "${HB_PORT:-18765}" --log-level warning > /tmp/hb-verify.log 2>&1 &
  srv=$!
  for _ in $(seq 1 30); do sleep 1; curl -s -m 2 -o /dev/null "http://127.0.0.1:${HB_PORT:-18765}/health/ready" && break; done
  h=$(curl -s -m 5 -o /dev/null -w "%{http_code}" "http://127.0.0.1:${HB_PORT:-18765}/health/ready")
  [ "$h" = "200" ] && ok "GET /health/ready -> 200" || bad "GET /health/ready -> $h (see /tmp/hb-verify.log)"
  s=$(curl -s -m 8 -o /dev/null -w "%{http_code}" -X POST "http://127.0.0.1:${HB_PORT:-18765}/api/v1/setup/admin" -H "content-type: application/json" \
      -d '{"username":"admin","password":"Passw0rd!23","passwordConfirmation":"Passw0rd!23"}')
  [ "$s" = "201" ] && ok "POST /api/v1/setup/admin -> 201" || bad "POST /api/v1/setup/admin -> $s"
  l=$(curl -s -m 8 -o /dev/null -w "%{http_code}" -X POST "http://127.0.0.1:${HB_PORT:-18765}/api/v1/auth/login" -H "content-type: application/json" \
      -d '{"username":"admin","password":"Passw0rd!23"}' -c /tmp/hb-cookies)
  [ "$l" = "200" ] && ok "POST /api/v1/auth/login -> 200" || bad "POST /api/v1/auth/login -> $l"
  m=$(curl -s -m 5 -o /dev/null -w "%{http_code}" -b /tmp/hb-cookies "http://127.0.0.1:${HB_PORT:-18765}/api/v1/auth/me")
  [ "$m" = "200" ] && ok "GET /api/v1/auth/me -> 200" || bad "GET /api/v1/auth/me -> $m"
  kill $srv 2>/dev/null; wait $srv 2>/dev/null
fi

section "12. frontend residual names"
# The de-obfuscation renamed every lexical binding mechanically (value1234,
# arg56) or left webcrack's one/two-character names (m, qe).  Section 6 proves
# they parse; nothing proved the readability job was done.  The ratchets start at
# the 0.6.5 inventory and drop to 0 as the semantic-renaming waves land - see
# frontend/NAMING.md.  The numbers themselves live in tools/rename-ratchet.json
# now, not in a literal here; see tools/print_rename_ratchet.mjs.
if ! RATCHET_DEFAULTS="$("$NODE" tools/print_rename_ratchet.mjs)"; then
  printf 'FAIL tools/rename-ratchet.json is missing or unreadable\n' >&2
  exit 1
fi
eval "$RATCHET_DEFAULTS"
o=$({ "$NODE" tools/report_frontend_names.mjs 2>&1 || true; } | grep '^# files=')
mechanical=$(echo "$o" | sed -n 's/.* mechanical=\([0-9]*\).*/\1/p')
short=$(echo "$o" | sed -n 's/.*short=\([0-9]*\).*/\1/p')
if [ -n "$o" ] && [ "${mechanical:-1}" -le "$HB_MAX_MECHANICAL" ] && [ "${short:-1}" -le "$HB_MAX_SHORT" ]; then
  ok "mechanical=$mechanical (max $HB_MAX_MECHANICAL), short=$short (max $HB_MAX_SHORT)"
else
  bad "mechanical=${mechanical:-?} (max $HB_MAX_MECHANICAL), short=${short:-?} (max $HB_MAX_SHORT) - names regressed"
fi

section "13. frontend formatting (Prettier)"
# Names and formatting pull against each other: semantic names are longer than
# the mechanical ones they replace, so a rename re-wraps lines.  Every other
# check here is whitespace-insensitive by design, which is right for each of them
# and leaves the suite blind to formatting.  HTML is excluded on evidence - see
# .prettierignore - so the scope is JS and CSS.
HB_PRETTIER="${HB_PRETTIER:-}"
if [ -z "$HB_PRETTIER" ]; then
  OFFLINE_PRETTIER="$HOME/项目/HomeOS/HomeOS/node_modules/prettier/bin/prettier.cjs"
  if [ -f "$OFFLINE_PRETTIER" ]; then
    HB_PRETTIER="$NODE $OFFLINE_PRETTIER"
  elif command -v npx >/dev/null 2>&1 && npx --yes prettier@3 --version >/dev/null 2>&1; then
    HB_PRETTIER="npx --yes prettier@3"
  fi
fi
if [ -z "$HB_PRETTIER" ]; then
  bad "Prettier unavailable - set HB_PRETTIER to a working prettier@3 command"
else
  o=$($HB_PRETTIER --check "frontend/**/*.{js,css}" 2>&1) && rc=0 || rc=$?
  unformatted=$(printf '%s\n' "$o" | grep -c '^\[warn\] frontend/' || true)
  unformatted=${unformatted:-0}
  if [ "$rc" = "0" ]; then
    ok "all frontend JS and CSS match Prettier"
  elif [ "$unformatted" -le "$HB_MAX_UNFORMATTED" ]; then
    ok "$unformatted file(s) off-canonical (max $HB_MAX_UNFORMATTED)"
  else
    bad "$unformatted file(s) not Prettier-formatted (max $HB_MAX_UNFORMATTED)"
    printf '%s\n' "$o" | grep '^\[warn\] frontend/' | head -10
  fi
fi

section "14. numeric literal artefacts"
# 0x… / !0x0 / -0x1 / 0x0 / void 0x0 are the obfuscator's constant folding.  The
# rewrite is value-preserving and total, so this is a hard gate: no ratchet.
o=$({ "$NODE" tools/normalize_frontend_literals.mjs --check 2>&1 || true; } | grep '^# hex=')
if echo "$o" | grep -q 'hex=0 not=0 infinity=0 void=0'; then
  ok "$o"
else
  bad "obfuscator literal artefacts remain: $o"
fi

printf "\n%d passed, %d failed\n" "$pass" "$fail"
[ "$fail" = "0" ]