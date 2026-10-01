#!/usr/bin/env bash
#
# Full verification of the restored HA Bridge project.
#
# Runs every check that guards the de-obfuscation:
#
#   1. no PyArmor artefacts left in the tree
#   2. every Python file compiles
#   3. backend imports match the disassembly (including the relative-import
#      level, which pycdas/pycdc drop)
#   4. backend identifiers/string constants match the disassembly
#   5. every JavaScript file parses
#   6. no obfuscated identifier or string-array decoder survives
#   7. every frontend ES module import resolves to a file
#   8. no string content was lost by the frontend de-obfuscation
#   9. the app boots: migrations, lifespan, setup, login, authenticated routes
#  10. residual mechanically-named bindings (non-regression gate)
#  11. formatting-sensitive contracts (backend string-injection anchors)
#  12. frontend public API (exported names) matches the frozen lockfile
#  13. the name classifier's self-test (its failure modes are silent)
#  14. classic-script globals still reachable across files
#  15. the frontend is still Prettier-formatted (see the note on section 15)
#  16. the eight frontend documents are byte-identical to the release manifest
#  17. backend bindings match the disassembly in both directions
#  18. the rename and string tooling self-tests (their failures are silent)
#  19. the pages load in a real browser (SKIP when no browser or no server)
#
# Usage:
#   tools/verify_all.sh [project-root]
#
# Exit status is non-zero if any check fails.

set -uo pipefail

ROOT="${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
cd "$ROOT"

VENV_PYTHON="$ROOT/.venv-store/bin/python"
if [ ! -x "$VENV_PYTHON" ]; then
  # The sibling checkout carries the interpreter that actually has fastapi,
  # uvicorn and alembic installed; without it section 9 cannot boot the app.
  if [ -x "$HOME/项目/HomeOS/HomeOS-3D/.venv-store/bin/python3" ]; then
    VENV_PYTHON="$HOME/项目/HomeOS/HomeOS-3D/.venv-store/bin/python3"
  else
    VENV_PYTHON="$(command -v python3)"
  fi
fi

# Node is not always on PATH (this checkout ships it at /usr/local/bin/node
# on macOS); HB_NODE pins an explicit binary.
NODE="${HB_NODE:-$(command -v node 2>/dev/null || true)}"
if [ -z "$NODE" ]; then
  for candidate in /usr/local/bin/node /opt/homebrew/bin/node /usr/bin/node; do
    if [ -x "$candidate" ]; then NODE="$candidate"; break; fi
  done
fi
if [ -z "$NODE" ]; then
  echo "node not found; set HB_NODE=/path/to/node" >&2
  exit 2
fi

pass=0
fail=0
section() { printf '\n\033[1m== %s\033[0m\n' "$1"; }
ok()   { printf '  \033[32mPASS\033[0m %s\n' "$1"; pass=$((pass + 1)); }
bad()  { printf '  \033[31mFAIL\033[0m %s\n' "$1"; fail=$((fail + 1)); }
skip() { printf '  \033[33mSKIP\033[0m %s\n' "$1"; }

section "1. PyArmor artefacts removed"
leftovers=$(find backend migrations store tools -name "*.1shot.*" -not -path "*/.extracted/*" 2>/dev/null | wc -l | tr -d ' ')
runtime_dirs=$(find . -maxdepth 3 -name "pyarmor_runtime_*" -not -path "./.venv-store/*" 2>/dev/null | wc -l | tr -d ' ')
if [ "$leftovers" = "0" ] && [ "$runtime_dirs" = "0" ]; then
  ok "no .1shot.* files, no pyarmor_runtime_* directory"
else
  bad "$leftovers .1shot.* file(s), $runtime_dirs pyarmor_runtime_* dir(s) remain"
fi

section "2. Python syntax"
if "$VENV_PYTHON" - "$ROOT" <<'PY'
import pathlib, sys
root = pathlib.Path(sys.argv[1])
files = sorted(list((root / 'backend').rglob('*.py')) + list((root / 'migrations').rglob('*.py')))
bad = []
for path in files:
    source = path.read_text(encoding='utf-8')
    try:
        # Compile in memory so no __pycache__ is written into the tree.
        compile(source, str(path), 'exec')
    except (SyntaxError, ValueError) as error:
        bad.append(f'{path}: {error}')
print(f'  compiled {len(files) - len(bad)}/{len(files)} file(s)')
for item in bad:
    print(f'  {item}')
sys.exit(1 if bad else 0)
PY
then ok "all Python files compile"; else bad "Python compilation errors"; fi

section "3. Backend imports vs disassembly"
if out=$("$VENV_PYTHON" tools/verify_imports.py 2>&1) && echo "$out" | grep -qE "with-differences=0"; then
  ok "$(echo "$out" | grep -E '^# checked')"
  # Reviewed behaviour changes must stay visible even when the check passes.
  while IFS= read -r note; do
    [ -n "$note" ] && printf '  \033[33mNOTE\033[0m %s\n' "${note#NOTE  }"
  done < <(echo "$out" | grep -E '^NOTE' || true)
else
  bad "import mismatches"; echo "$out" | grep -E "DIFF|ERROR|#" | head -30
fi

section "4. Backend fidelity vs disassembly"
if out=$("$VENV_PYTHON" tools/verify_restore.py 2>&1) && echo "$out" | grep -qE "with-differences=0"; then
  ok "$(echo "$out" | grep -E '^# verified')"
  # Reviewed behaviour changes must stay visible even when the check passes.
  while IFS= read -r note; do
    [ -n "$note" ] && printf '  \033[33mNOTE\033[0m %s\n' "${note#NOTE  }"
  done < <(echo "$out" | grep -E '^NOTE' || true)
else
  bad "fidelity mismatches"; echo "$out" | tail -30
fi

section "5. JavaScript syntax"
js_fail=0
js_total=0
while IFS= read -r file; do
  js_total=$((js_total + 1))
  if ! "$NODE" --check "$file" >/dev/null 2>&1; then
    echo "  $file"
    js_fail=$((js_fail + 1))
  fi
done < <(find frontend -name "*.js" -type f)
if [ "$js_fail" = "0" ]; then
  ok "$js_total JavaScript file(s) parse"
else
  bad "$js_fail/$js_total JavaScript file(s) failed to parse"
fi

section "6. Obfuscation residue"
residue=$(grep -roE "_0x[0-9a-f]{4,}" frontend 2>/dev/null | wc -l | tr -d ' ')
decoders=$(grep -rlE --include='*.js' "while *\(!!\[\]\)" frontend 2>/dev/null | wc -l | tr -d ' ')
if [ "$residue" = "0" ] && [ "$decoders" = "0" ]; then
  ok "no obfuscated identifiers, no string-array decoders"
else
  bad "$residue obfuscated identifier occurrence(s), $decoders decoder file(s)"
fi

section "7. Frontend module graph"
if out=$("$NODE" tools/verify_frontend_imports.mjs 2>&1) && echo "$out" | grep -qE "unresolved=0"; then
  ok "$(echo "$out" | grep -E '^# scanned')"
else
  bad "unresolved module imports"; echo "$out" | grep -E "UNRESOLVED|BARE|#" | head -30
fi

section "8. Frontend string preservation vs original"
# Resolves the original obfuscated sources from tools/reference/frontend-orig.tar.gz.
# webcrack rewrites the whole module body, so a renamed identifier can hide a
# mangled string literal; this check replays the original string decoder and
# requires every string it produces to still exist in the output.
if out=$("$NODE" tools/verify_frontend_strings.mjs 2>&1) && echo "$out" | grep -qE "lost-strings=0"; then
  ok "$(echo "$out" | grep -E '^# checked')"
else
  bad "de-obfuscation lost string content"; echo "$out" | grep -E "LOST|MISSING|checked=" | head -30
fi

section "9. Application boot and request flow"
rm -rf /tmp/ha-bridge-verify
mkdir -p /tmp/ha-bridge-verify
if PYTHONPATH="$ROOT" APP_DATA_DIR=/tmp/ha-bridge-verify "$VENV_PYTHON" - <<'PY'
import sys, warnings
warnings.filterwarnings('ignore')
from fastapi.testclient import TestClient
import backend.app.main as app_module

failures = []
with TestClient(app_module.app) as client:
    status = client.get('/health/ready')
    if status.status_code != 200:
        failures.append(f'/health/ready -> {status.status_code}')
    setup = client.post('/api/v1/setup/admin', json={
        'username': 'admin',
        'password': 'Passw0rd!23',
        'passwordConfirmation': 'Passw0rd!23',
    })
    if setup.status_code != 201:
        failures.append(f'POST /api/v1/setup/admin -> {setup.status_code}')
    login = client.post('/api/v1/auth/login', json={
        'username': 'admin', 'password': 'Passw0rd!23',
    })
    if login.status_code != 200:
        failures.append(f'POST /api/v1/auth/login -> {login.status_code}')
    for path, expected in [
        ('/', 200),
        ('/login', 200),
        ('/setup', 200),
        ('/license', 200),
        ('/3d-studio', 200),
        ('/api/v1/auth/me', 200),
        ('/api/v1/logs', 200),
        ('/api/v1/license/status', 200),
        ('/api/v1/projects', 403),
        ('/api/v1/icons', 403),
        ('/api/v1/modules/interaction3d/access', 403),
    ]:
        response = client.get(path)
        if response.status_code != expected:
            failures.append(f'GET {path} -> {response.status_code} (expected {expected})')

for item in failures:
    print(f'  {item}')
sys.exit(1 if failures else 0)
PY
then ok "14 migrations applied, lifespan started, setup/login/routes behaved as expected"; else bad "runtime request flow"; fi

section "10. Residual mechanically-named bindings"
# The `_0x` obfuscation is gone (checks 5-8), but the de-obfuscation renamed
# every lexical binding mechanically (`value1234`, `arg56`) or left webcrack's
# one/two-character names (`m`, `qe`).  This measures that remaining readability
# job and acts as a non-regression gate: the count must never grow.
# Lower HB_MAX_MECHANICAL / HB_MAX_SHORT as the renaming phases land.
#
# These must track the *actual* residue, not a comfortable bound: the gate's job
# is to notice a regression, and a ceiling of 9970 while the tree holds 2675 lets
# a bad apply silently revert thousands of renames.  Ratchet both down with every
# batch until they reach 0.
# The three ceilings live in tools/rename-ratchet.json - the one place
# tools/ratchet_frontend_names.mjs writes.  They used to be literals copied
# into this file, tools/verify_0.6.5.sh and tools/verify_all.sh, and the copies
# had already drifted from the measured residue by 80 mechanical / 2 short
# names: a gate tolerating the regression it exists to catch.  The environment
# still overrides every value.  A missing or unreadable file is a hard failure
# on purpose - falling back to a literal here is the drift this removes.
if ! RATCHET_DEFAULTS="$("$NODE" tools/print_rename_ratchet.mjs)"; then
  printf 'FAIL tools/rename-ratchet.json is missing or unreadable\n' >&2
  exit 1
fi
eval "$RATCHET_DEFAULTS"
if out=$("$NODE" tools/report_frontend_names.mjs 2>&1) \
  && echo "$out" | grep -qE "^# files="; then
  summary=$(echo "$out" | grep -E '^# files=' | sed 's/^# //')
  mechanical=$(echo "$summary" | sed -n 's/.* mechanical=\([0-9]*\).*/\1/p')
  short=$(echo "$summary" | sed -n 's/.*short=\([0-9]*\).*/\1/p')
  if [ "${mechanical:-0}" -le "$HB_MAX_MECHANICAL" ] && [ "${short:-0}" -le "$HB_MAX_SHORT" ]; then
    ok "$summary"
  else
    bad "mechanical=$mechanical (max $HB_MAX_MECHANICAL), short=$short (max $HB_MAX_SHORT) - names regressed"
  fi
else
  bad "frontend name inventory failed"; echo "$out" | head -20
fi

section "11. Formatting-sensitive contracts"
# `backend/app/modules/interaction3d/api.py` builds the `/stage.html` response by
# literal string replacement on `frontend/3d-studio.html`:
#     html.replace('</head>', ...)   html.replace('<body>', ...)
# A reformat or a rename that perturbs those substrings would silently drop the
# stage stylesheet and the stage body class.  Guard the exact anchors.
anchor_fail=0
stage_html="frontend/3d-studio.html"
for anchor in "</head>" "<body>"; do
  count=$(grep -oF "$anchor" "$stage_html" 2>/dev/null | wc -l | tr -d ' ')
  if [ "$count" != "1" ]; then
    echo "  $stage_html :: expected exactly 1 '$anchor', found $count"
    anchor_fail=$((anchor_fail + 1))
  fi
done
if [ "$anchor_fail" = "0" ]; then
  ok "$stage_html still exposes the '</head>' and '<body>' injection anchors exactly once"
else
  bad "$anchor_fail injection anchor(s) broken - /stage.html would lose stage.css or the body class"
fi

section "12. Frontend public API frozen"
# `verify_frontend_rename.mjs` renders bound identifiers as binding identities,
# which makes it blind to a renamed *export*: the exported name is a binding, so
# the module stays alpha-equivalent while every consumer breaks.  The lockfile
# freezes each module's exported names instead.
if out=$("$NODE" tools/verify_frontend_public_api.mjs --check-lock tools/frontend-public-api.json 2>&1) \
  && echo "$out" | grep -qE "drifted=0"; then
  ok "$(echo "$out" | grep -E '^# frozen=')"
else
  bad "frontend public API drifted"; echo "$out" | grep -E "DRIFT|MISSING|NEW|#" | head -20
fi

section "13. Name classifier self-test"
# Section 10's gate is only as good as `tools/lib/name-buckets.mjs`, and both of
# its failure modes are silent.  Too narrow a prefix list files residue as
# "semantic": the gate under-reports and the applier refuses to rename names that
# need renaming (this is how `weakMap1` and `resizeObserver1` became unmovable).
# Too wide a shape rule shreds real names - `sha256` is exported public API and
# `alignTo16` carries meaning in its digits.  Lock both directions down.
if out=$("$NODE" tools/lib/name-buckets.selftest.mjs 2>&1); then
  ok "$(echo "$out" | grep -E '^# name-buckets selftest:')"
else
  bad "name classifier regressed"; echo "$out" | head -20
fi

section "14. Classic-script globals still reachable"
# A classic script publishes its program-level bindings to the global scope, so a
# bare name in a *different* file resolves to them.  Those declarations are
# lexically bound, so lexical renaming is entitled to rename them, and no
# single-file gate can object - the evidence is in the file that consumes them.
# Sections 1-13 all read one file at a time, so this coupling was invisible.
#
# The self-test runs first: a check for a silent failure mode is worthless if it
# cannot be shown to fail, and this one reports PASS on a healthy tree either
# way.
if out=$("$NODE" tools/lib/verify_frontend_globals.selftest.mjs 2>&1); then
  ok "$(echo "$out" | grep -E '^all [0-9]+ cases passed$')"
else
  bad "globals check cannot detect the breakage it exists for"; echo "$out" | tail -20
fi
if out=$("$NODE" tools/verify_frontend_globals.mjs --baseline-dir ".restore/frontend-baseline" --frontend-root frontend 2>&1); then
  ok "$(echo "$out" | grep -E '^PASS ')"
else
  bad "a classic script stopped publishing a global name"; echo "$out" | head -20
fi

section "15. Frontend formatting (Prettier canonical)"
# Section 11 checks the one formatting contract the backend depends on; nothing
# checked that the tree is still *formatted*.  It stopped being formatted the
# moment the semantic rename landed: semantic names are longer than the
# mechanical ones they replaced (`responseBody` vs `value1234`), so lines that
# used to fit printWidth=100 had to be re-wrapped.  Every other check here is
# whitespace-insensitive by design - alpha-equivalence tokenises, the API lock
# reads names, string fidelity reads literals - which is right for each of them
# and left the suite as a whole blind to this.
#
# Runs Prettier from npx's cache.  If Prettier cannot be obtained this FAILS
# instead of skipping: a check that quietly passes is worse than no check.  Set
# HB_PRETTIER to an existing binary to keep the suite offline.
#
# The scope is JS and CSS, not HTML: running Prettier over the eight frontend
# documents is not content-neutral (it rewraps long Chinese text runs, injecting a
# space the markup never had) and proves nothing about the rename.  Those files are
# held byte-identical instead - see .prettierignore.
#
PRETTIER="${HB_PRETTIER:-}"
# Prefer the offline copy: npx needs write access to ~/.npm, which the sandbox
# refuses, so npx alone would make this check unrunnable rather than failing it.
OFFLINE_PRETTIER="$HOME/项目/HomeOS/HomeOS/node_modules/prettier/bin/prettier.cjs"
if [ -z "$PRETTIER" ] && [ -f "$OFFLINE_PRETTIER" ]; then
  PRETTIER="$NODE $OFFLINE_PRETTIER"
fi
if [ -z "$PRETTIER" ] && npx --yes prettier@3 --version >/dev/null 2>&1; then
  PRETTIER="npx --yes prettier@3"
fi
if [ -z "$PRETTIER" ]; then
  bad "Prettier unavailable - allow npx to fetch prettier@3, or set HB_PRETTIER"
elif out=$($PRETTIER --check "frontend/**/*.{js,css}" 2>&1); then
  ok "all frontend JS and CSS match Prettier"
else
  # Count only file lines: Prettier's closing line also starts with "[warn] "
  # ("[warn] Code style issues found in N files..."), which would inflate this.
  unformatted=$(printf '%s\n' "$out" | grep -cE '^\[warn\] frontend/' || true)
  unformatted=${unformatted:-0}
  if [ "$unformatted" -le "$HB_MAX_UNFORMATTED" ]; then
    ok "$unformatted file(s) off-canonical (max $HB_MAX_UNFORMATTED)"
  else
    bad "$unformatted file(s) not Prettier-formatted (max $HB_MAX_UNFORMATTED)"
    printf '%s\n' "$out" | grep -E '^\[warn\] frontend/' | head -10
  fi
fi

section "16. Release documents byte-identical"
# Section 15 deliberately keeps the eight frontend documents out of Prettier's
# scope.  That exemption is only safe if something else holds them to the bytes
# the release shipped: .restore/baseline.sha256 was taken from the published
# build, and an earlier, unlogged formatter run rewrapped all eight into
# multi-line markup.  Section 11 would have noticed one of those (it watches the
# '</head>' anchor of 3d-studio.html); nothing noticed the other seven.
#
# The manifest is a full-tree inventory, so filter it down to the documents and
# let shasum verify them against what is on disk.
MANIFEST="${HB_MANIFEST:-.restore/baseline.sha256}"
if [ -f "$MANIFEST" ]; then
  doc_list=$(mktemp)
  grep -E 'frontend/[^ ]*[.]html$' "$MANIFEST" > "$doc_list"
  listed=$(wc -l < "$doc_list" | tr -d ' ')
  if [ "$listed" = "0" ]; then
    bad "$MANIFEST lists no frontend document"
  elif out=$(shasum -a 256 -c "$doc_list" 2>&1) && ! printf '%s\n' "$out" | grep -qE 'FAILED'; then
    ok "$listed document(s) byte-identical to the release manifest"
  else
    bad "a release document was reformatted"
    printf '%s\n' "$out" | grep -E 'FAILED' | head -8
  fi
  rm -f "$doc_list"
else
  bad "release manifest $MANIFEST is missing - cannot prove the documents are untouched"
fi

section "17. Backend bindings match the disassembly (both directions)"
# Sections 3 and 4 are one-directional: they report what the .das has and the
# restored source lacks.  A name the *source invented* passes both, and that is
# exactly what carrying a later version's source into an older .das produces:
# 0.6.5 shipped 15 such names in license/service.py, a link_local_address
# helper in ha/client.py, a whole link-local-address warning in api/ha.py and a
# debug_skip_auth settings field in config.py.  verify_scope_names.py compares
# the scope-level STORE_NAME sets in both directions, so run it over the whole
# tree and require zero.
if out=$("$VENV_PYTHON" tools/verify_scope_names.py backend migrations 2>&1); then
  ok "$(echo "$out" | grep -E '^# checked ')"
else
  bad "restored source binds names the .das does not (or vice versa)"
  echo "$out" | grep -E '^(EXTRA|MISSING|PARSE-FAIL)' | head -20
fi

section "18. Rename and string tooling self-tests"
# The two libraries the rename batch gate now leans on are both silent-failure
# shaped.  `tools/lib/exported-names.mjs` decides which names are frozen public API:
# get it wrong in one direction and the applier renames an export, breaking every
# consumer with no gate able to see it (the exported name is a binding, so the
# module stays alpha-equivalent); wrong in the other and it refuses names that
# needed renaming - which is how `weakMap1` became unmovable.  `tools/lib/string-fingerprint.mjs`
# backs the section that proves a batch edited no string content; if it cannot
# detect an edited literal, that section passes on exactly the batch it exists to
# catch.  Neither can be checked against the tree - both are correct on a healthy
# tree by construction, which is the definition of a check that needs a self-test.
if out=$("$NODE" tools/lib/exported-names.selftest.mjs 2>&1); then
  ok "exported-names: $(echo "$out" | grep -E '^# exported-names selftest: [0-9]+/[0-9]+ ')"
else
  bad "export set classifier regressed"; echo "$out" | tail -20
fi
if out=$("$NODE" tools/lib/string-fingerprint.selftest.mjs 2>&1); then
  ok "string-fingerprint: $(echo "$out" | grep -E '^# [0-9]+/[0-9]+ passed$')"
else
  bad "string fingerprint regressed"; echo "$out" | tail -20
fi

# The naming gates are all the same shape: tools/check_glossary.mjs can be made to
# pass by rejecting nothing, tools/check_name_anchors.mjs by resolving nothing (its
# first version reported anchored=0 on a file with nine selectors) and
# tools/check_name_kinds.mjs by deciding no shape at all.  Those cases look identical
# to a clean tree, so all three are pinned here.
if out=$("$NODE" tools/check_glossary.selftest.mjs 2>&1); then
  ok "check-glossary: $(echo "$out" | grep -E '^# [0-9]+/[0-9]+ passed$')"
else
  bad "controlled vocabulary gate regressed"; echo "$out" | tail -20
fi
if out=$("$NODE" tools/check_name_anchors.selftest.mjs 2>&1); then
  ok "check-name-anchors: $(echo "$out" | grep -E '^# [0-9]+/[0-9]+ passed$')"
else
  bad "selector oracle regressed"; echo "$out" | tail -20
fi
if out=$("$NODE" tools/check_name_kinds.selftest.mjs 2>&1); then
  ok "check-name-kinds: $(echo "$out" | grep -E '^# [0-9]+/[0-9]+ passed$')"
else
  bad "shape oracle regressed"; echo "$out" | tail -20
fi

section "19. The pages load in a real browser"
# Every check above is an equivalence check, and a rename that is internally
# consistent satisfies all of them by construction - which is why gov/PLAN.md
# records a restore where an inverted condition ("device is None or ...") stayed
# v4-gates-green.  This is the only section that loads the pages and looks at them.
#
# It SKIPs when no Chromium-family browser is installed or no server answers at
# HB_SMOKE_URL (default http://127.0.0.1:8791).  A SKIP is reported as a SKIP, never
# as a PASS: a smoke test that did not run is not evidence that the pages work.
if out=$("$NODE" tools/verify_frontend_smoke.mjs 2>&1); then
  if printf '%s' "$out" | grep -q '^# SKIP'; then
    skip "$(printf '%s' "$out" | grep -m1 '^# SKIP')"
    skip "a skipped smoke test is not coverage; nothing here proves the pages run"
  else
    ok "$(printf '%s' "$out" | grep -E '^PASS ')"
  fi
else
  bad "a page no longer loads or runs"; printf '%s\n' "$out" | tail -20
fi
printf '\n\033[1m== summary\033[0m\n'
printf '  checks passed: %d\n  checks failed: %d\n' "$pass" "$fail"
[ "$fail" = "0" ] || exit 1
printf '  \033[32mall checks passed\033[0m\n'
