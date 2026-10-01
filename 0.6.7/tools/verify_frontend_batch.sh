#!/usr/bin/env bash
#
# Frontend batch gate: everything that must hold after a rename batch.
#
# This is the script `frontend/NAMING.md` section 3.4 has always referred to.
# It used to be "compare against HEAD"; this repository has no git, so every
# comparison is made against a *directory* baseline instead:
#
#   .restore/frontend-baseline/   a copy of frontend/ taken before the first
#                                 wave (frontend/**/*.{js,css,html}, 217 files)
#   .restore/orig-frontend/       the original obfuscated sources, used by the
#                                 string-fidelity check
#
# The baseline is what makes a rename reviewable without a VCS: the checks below
# are all "same program up to bound names / same strings / same interface",
# which is exactly what a directory-to-directory comparison can prove.
#
# Usage:
#   tools/verify_frontend_batch.sh [--full]
#
#   --full   also run tools/verify_0.6.5.sh afterwards (slower).
#
# Environment:
#   HB_NODE             node binary                       (default /usr/local/bin/node)
#   HB_BASELINE         baseline directory                (default .restore/frontend-baseline)
#   HB_ORIG             original obfuscated frontend      (default .restore/orig-frontend/frontend)
#   HB_PRETTIER         prettier command                  (default: the offline copy below, else npx)
#   HB_MAX_MECHANICAL   ratchet for mechanical residue    (tools/rename-ratchet.json)
#   HB_MAX_SHORT        ratchet for short residue         (tools/rename-ratchet.json)
#   HB_MAX_UNFORMATTED  ratchet for unformatted files     (tools/rename-ratchet.json)
#   HB_BATCH_PRE        whole-tree sha256 manifest taken before the batch
#                       (tools/verify_frontend_batch_delta.mjs snapshot <file>)
#   HB_BATCH_ID         id of the batch in flight; its rollback copies live in
#                       .restore/batch-snapshots/<id>/ (sections 13/14)
#   HB_BATCH_DECLARED   the batch's declared file list
#                       (default tools/rename-maps/declared-files.txt)
#   HB_BATCH_MAP        this batch's rename map, spent by section 16
#                       (tools/check_glossary.mjs --applied, tools/check_name_anchors.mjs)
#
# Sections 13 to 16 describe the batch rather than the tree, so they only run when
# the batch is in flight.  They report SKIP otherwise and the summary counts the
# skips: a plain run of this script proves nothing about what the batch touched.
#
# The three ratchets track the *actual* residue, not a comfortable bound, and are
# ratcheted to 0 as the waves land.  The numbers themselves live in exactly one
# file now - tools/rename-ratchet.json, written by tools/ratchet_frontend_names.mjs
# and read below through tools/print_rename_ratchet.mjs.  They used to be literals
# in this file, tools/verify_0.6.5.sh sections 12/13 and tools/verify_all.sh
# sections 10/15, and those copies had drifted.
#
# Exit status is non-zero if any check fails.

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

NODE="${HB_NODE:-/usr/local/bin/node}"
BASELINE="${HB_BASELINE:-.restore/frontend-baseline}"
ORIG="${HB_ORIG:-.restore/orig-frontend/frontend}"

# Prettier is not vendored.  The two candidates are the offline copy that ships
# with the sibling checkout and whatever npx can fetch; npx cannot be used as the
# only route because it needs write access to ~/.npm, which the sandbox refuses.
PRETTIER="${HB_PRETTIER:-}"
if [ -z "$PRETTIER" ]; then
  OFFLINE_PRETTIER="$HOME/项目/HomeOS/HomeOS/node_modules/prettier/bin/prettier.cjs"
  if [ -f "$OFFLINE_PRETTIER" ]; then
    PRETTIER="$NODE $OFFLINE_PRETTIER"
  elif command -v npx >/dev/null 2>&1 && npx --yes prettier@3 --version >/dev/null 2>&1; then
    PRETTIER="npx --yes prettier@3"
  fi
fi

# The three ceilings live in tools/rename-ratchet.json - the one place
# tools/ratchet_frontend_names.mjs writes.  They used to be literals copied
# into this file, tools/verify_0.6.5.sh and tools/verify_all.sh, and the copies
# had already drifted from the measured residue by 80 mechanical / 2 short
# names: a gate tolerating the regression it exists to catch.  The environment
# still overrides every value.  A missing or unreadable file is a hard failure
# on purpose - falling back to a literal here is the drift this removes.
if ! RATCHET_DEFAULTS="$("$NODE" tools/print_rename_ratchet.mjs)"; then
  printf '  \033[31mFAIL\033[0m tools/rename-ratchet.json is missing or unreadable\n'
  exit 1
fi
eval "$RATCHET_DEFAULTS"

pass=0
fail=0
skipped=0
section() { printf '\n\033[1m== %s\033[0m\n' "$1"; }
ok()   { printf '  \033[32mPASS\033[0m %s\n' "$1"; pass=$((pass + 1)); }
bad()  { printf '  \033[31mFAIL\033[0m %s\n' "$1"; fail=$((fail + 1)); }
skip() { printf '  \033[33mSKIP\033[0m %s\n' "$1"; skipped=$((skipped + 1)); }

if [ ! -d "$BASELINE" ]; then
  printf '  \033[31mFAIL\033[0m baseline directory %s is missing - see frontend/NAMING.md, Wave 0\n' "$BASELINE"
  exit 1
fi

# Section 0 exists because sections 2, 4 and 9 all *trust* $BASELINE: they prove the
# working tree still matches the pre-wave copy, so a stray edit inside the baseline
# would make several checks agree on the wrong answer at once.  The anchor file lists
# every baseline file with its sha256; it is the baseline's own root of trust and was
# verified by nothing at all before this section was added.
BASELINE_ANCHOR="${HB_BASELINE_ANCHOR:-$BASELINE.sha256}"
case "$BASELINE_ANCHOR" in /*) ANCHOR_ABS="$BASELINE_ANCHOR" ;; *) ANCHOR_ABS="$ROOT/$BASELINE_ANCHOR" ;; esac

section "0. the baseline directory matches its sha256 anchor"
if [ ! -f "$ANCHOR_ABS" ]; then
  bad "baseline anchor $BASELINE_ANCHOR is missing - the baseline is unverified"
else
  listed=$(wc -l < "$ANCHOR_ABS" | tr -d ' ')
  if out=$(cd "$BASELINE" && shasum -a 256 -c "$ANCHOR_ABS" 2>&1) \
    && ! printf '%s\n' "$out" | grep -q 'FAILED'; then
    ok "$listed baseline file(s) match $BASELINE_ANCHOR"
  else
    bad "the baseline directory was modified after its anchor was written"
    printf '%s\n' "$out" | grep -v ': OK$' | head -10
  fi
fi

section "1. every frontend module parses"
if out=$("$NODE" tools/report_frontend_names.mjs 2>&1); then
  if echo "$out" | grep -q 'parse-failures=0'; then
    ok "$(echo "$out" | grep '^# files=' | sed 's/^# //')"
  else
    bad "a frontend module failed to parse"; echo "$out" | grep '^PARSEFAIL' | head -10
  fi
else
  bad "name inventory could not run"; echo "$out" | head -20
fi

section "2. alpha-equivalence against the baseline"
if out=$("$NODE" tools/verify_frontend_rename.mjs "$BASELINE" frontend 2>&1) \
  && echo "$out" | grep -q 'mismatched=0 missing-or-extra=0'; then
  ok "$(echo "$out" | grep '^# ')"
else
  bad "a rename changed more than bound names"; echo "$out" | grep -E 'MISMATCH|MISSING|EXTRA|PARSEFAIL' | head -10
fi

section "3. public API unchanged"
# Dir-vs-dir mode reports "changed=0"; the lockfile mode reports "drifted=0".
if out=$("$NODE" tools/verify_frontend_public_api.mjs "$BASELINE" frontend 2>&1) \
  && echo "$out" | grep -q 'changed=0'; then
  ok "$(echo "$out" | grep '^# ')"
else
  bad "an exported name or import specifier drifted"; echo "$out" | grep -E 'DRIFT|MISSING|NEW' | head -10
fi

section "4. module graph resolves"
if out=$("$NODE" tools/verify_frontend_imports.mjs 2>&1) && echo "$out" | grep -q 'unresolved=0'; then
  ok "$(echo "$out" | grep '^# scanned')"
else
  bad "unresolved module imports"; echo "$out" | grep -E 'UNRESOLVED|BARE' | head -10
fi

section "5. no string content lost"
if [ -d "$ORIG" ]; then
  if out=$("$NODE" tools/verify_frontend_strings.mjs "$ORIG" frontend 2>&1) \
    && echo "$out" | grep -q 'lost-strings=0'; then
    ok "$(echo "$out" | grep '^# checked')"
  else
    bad "a rename ate a string literal"; echo "$out" | grep -E 'LOST' | head -10
  fi
else
  bad "original obfuscated sources not found at $ORIG"
fi

section "6. classic-script globals still reachable"
# The self-test first: this check reports PASS on a healthy tree either way, so
# its value depends entirely on being able to fail.
if out=$("$NODE" tools/lib/verify_frontend_globals.selftest.mjs 2>&1); then
  if out2=$("$NODE" tools/verify_frontend_globals.mjs --baseline-dir "$BASELINE" --frontend-root frontend 2>&1) \
    && echo "$out2" | grep -q '^PASS '; then
    ok "$(echo "$out2" | grep '^PASS ')"
  else
    bad "a classic script stopped publishing a global name it used to publish"
    echo "$out2" | grep -E 'VANISHED|MISSING|^PASS |^FAIL ' | head -10
  fi
else
  bad "globals check cannot detect the breakage it exists for"; echo "$out" | tail -10
fi

section "7. residual mechanically-named bindings"
if out=$("$NODE" tools/report_frontend_names.mjs 2>&1) && echo "$out" | grep -q '^# files='; then
  summary=$(echo "$out" | grep '^# files=' | sed 's/^# //')
  mechanical=$(echo "$summary" | sed -n 's/.* mechanical=\([0-9]*\).*/\1/p')
  short=$(echo "$summary" | sed -n 's/.*short=\([0-9]*\).*/\1/p')
  if [ "${mechanical:-0}" -le "$HB_MAX_MECHANICAL" ] && [ "${short:-0}" -le "$HB_MAX_SHORT" ]; then
    ok "$summary (ratchet $HB_MAX_MECHANICAL/$HB_MAX_SHORT)"
  else
    bad "mechanical=$mechanical (max $HB_MAX_MECHANICAL), short=$short (max $HB_MAX_SHORT) - names regressed"
  fi
else
  bad "frontend name inventory failed"; echo "$out" | head -20
fi
# The ratchet above only knows the whole-tree total, so a batch that burns 400 names
# in one file passes even if something else put 400 back in another.  The budget is
# the per-file floor: no file may hold more than it held when the wave began.
if out=$("$NODE" tools/verify_frontend_name_budget.mjs 2>&1); then
  ok "$(echo "$out" | grep '^# budget')"
else
  bad "a file holds more leftover names than it held at wave start"
  echo "$out" | grep -E '^OVER|^NEW|^GONE|^FAIL' | head -10
fi

section "8. Prettier formatting"
if [ -z "$PRETTIER" ]; then
  bad "Prettier unavailable - set HB_PRETTIER, or install prettier@3 so npx can reach it"
else
  out=$($PRETTIER --check "frontend/**/*.{js,css}" 2>&1) && rc=0 || rc=$?
  if [ "$rc" = "0" ]; then
    ok "all frontend JS and CSS match Prettier"
  else
    # Prettier's closing line also starts with "[warn] ", so count file lines only.
    unformatted=$(printf '%s\n' "$out" | grep -c '^\[warn\] frontend/' || true)
    unformatted=${unformatted:-0}
    if [ "$unformatted" -le "$HB_MAX_UNFORMATTED" ]; then
      ok "$unformatted file(s) off-canonical (max $HB_MAX_UNFORMATTED)"
    else
      bad "$unformatted file(s) not Prettier-formatted (max $HB_MAX_UNFORMATTED)"
      printf '%s\n' "$out" | grep '^\[warn\] frontend/' | head -10
    fi
  fi
fi

section "9. markup held byte-identical"
# HTML is deliberately outside the format scope (see .prettierignore).  Prove it
# stayed that way rather than assuming it.
if out=$("$NODE" tools/verify_frontend_format_equiv.mjs "$BASELINE" frontend 2>&1) \
  && echo "$out" | grep -q 'mismatched=0 missing-or-extra=0'; then
  ok "$(echo "$out" | grep '^# ')"
else
  bad "a stylesheet or document changed content"; echo "$out" | grep -E 'DIFF|MISSING|EXTRA' | head -10
fi

section "10. numeric literal artefacts"
# The obfuscator's constant folding left its spellings behind: 0xA for 10, !0x0
# for true, -0x1 / 0x0 for -Infinity, void 0x0 for undefined.  They parse and run
# fine, which is exactly why they survived three de-obfuscation rounds.  This is
# a hard gate rather than a ratchet: the rewrite is total and value-preserving,
# so there is no ceiling to come down from.
if out=$("$NODE" tools/normalize_frontend_literals.mjs --check 2>&1); then
  ok "$(echo "$out" | grep '^# hex=')"
else
  bad "obfuscator literal artefacts remain"; echo "$out" | tail -3
fi

section "11. HTML documents match the release manifest"
# Section 9 proves the markup is *content*-equivalent; this proves the eight
# documents are byte-identical to the bytes the release shipped, as recorded in
# .restore/baseline.sha256.  They are the one part of the frontend a formatter
# must never touch (see .prettierignore), and "content-equivalent" is not enough:
# a whitespace-only rewrite still changes the rendered text of adjacent inline
# elements.  A formatter did rewrite all eight once during this restoration, and
# one of them again minutes later, which is why this is a hash check rather than
# a normalized diff.
MANIFEST="${HB_MANIFEST:-.restore/baseline.sha256}"
if [ ! -f "$MANIFEST" ]; then
  bad "release manifest $MANIFEST is missing"
else
  html_list=$(mktemp)
  grep -E 'frontend/[^ ]*[.]html$' "$MANIFEST" > "$html_list" || true
  listed=$(wc -l < "$html_list" | tr -d ' ')
  if out=$(shasum -a 256 -c "$html_list" 2>&1) && ! printf '%s\n' "$out" | grep -q 'FAILED'; then
    ok "$listed document(s) byte-identical to the release manifest"
  else
    bad "an HTML document no longer matches the release bytes"
    printf '%s\n' "$out" | grep -v ': OK$' | head -10
  fi
  rm -f "$html_list"
fi

section "12. computed member access is normalised"
# The obfuscator spelled every property access `obj["prop"]`.  That spelling is
# opaque to everything downstream: `grep prop` misses it, the rename pass refuses
# to touch a computed member or key by design, and the formatter cannot re-wrap
# the chain it hides in.  Folding it back onto the dot form is total and
# value-preserving - section 2 folds the two spellings to the same token, so the
# rewrite is provably invisible to a semantic diff - which is why the only
# correct surviving count is zero.  A ratchet would bless exactly the residue
# this removes, so this is a hard gate.
#
# It is numbered 12 rather than slotted in beside section 10 because sections
# 1-11 are cited by name in RESTORE-REPORT-0.6.6.md and
# frontend/NAMING.md section 3.4; new checks get appended, not inserted.
if out=$("$NODE" tools/normalize_frontend_members.mjs --check 2>&1); then
  ok "$(echo "$out" | grep '^# ')"
else
  bad "obfuscator-style computed member access survives"
  echo "$out" | grep '^# ' | head -3
fi

section "13. the batch touched only its declared files"
# Sections 2, 3 and 5 all compare the frontend against a baseline, so none of them
# can see an edit to a file the batch never meant to touch - backend/app/main.py
# (which serves /bridge-static/**), tools/, .prettierrc.  This repository has no
# git, so without this section nothing would report it at all.  The manifest is
# taken before the batch writes anything:
#
#   node tools/verify_frontend_batch_delta.mjs snapshot /tmp/batch-pre.json
#
# and the declared list is one repository-relative path per line.
if [ -z "${HB_BATCH_PRE:-}" ]; then
  skip "HB_BATCH_PRE unset - no batch in flight, the delta gate did not run"
else
  if [ -n "${HB_BATCH_DECLARED:-}" ]; then
    out=$("$NODE" tools/verify_frontend_batch_delta.mjs check "$HB_BATCH_PRE" --declared "$HB_BATCH_DECLARED" 2>&1) && rc=0 || rc=$?
  else
    out=$("$NODE" tools/verify_frontend_batch_delta.mjs check "$HB_BATCH_PRE" 2>&1) && rc=0 || rc=$?
  fi
  if [ "$rc" = "0" ] && echo "$out" | grep -q 'outside-declared=0'; then
    ok "$(echo "$out" | grep '^# files=')"
  else
    bad "a path outside the batch declaration changed"
    echo "$out" | grep -E '^OUT |^FAIL' | head -10
  fi
fi

section "14. rollback snapshots exist for this batch"
# No git: the only way back from a bad batch is the copies taken before it wrote.
# .restore/batch-snapshots/ has held such copies since the first wave and nothing
# ever checked they were made, so a batch that forgot looked exactly like one that
# did not.  Taken with:
#
#   node tools/verify_frontend_batch_snapshots.mjs --take <batchId>
#
# which refuses to overwrite an earlier batch's rollback point.
if [ -z "${HB_BATCH_ID:-}" ]; then
  skip "HB_BATCH_ID unset - no batch in flight, the snapshot gate did not run"
else
  # HB_BATCH_DECLARED lets a batch keep its declared list somewhere other than the
  # default tools/rename-maps/declared-files.txt; sections 13 and 15 already honour
  # it, and a gate that checked one list while the batch edited another would be
  # worse than no gate at all.
  snapshot_args=(--batch "$HB_BATCH_ID")
  if [ -n "${HB_BATCH_DECLARED:-}" ]; then
    snapshot_args+=(--declared "$HB_BATCH_DECLARED")
  fi
  if out=$("$NODE" tools/verify_frontend_batch_snapshots.mjs "${snapshot_args[@]}" 2>&1); then
    ok "$(echo "$out" | grep '^# batch=')"
  else
    bad "a declared file has no usable pre-batch rollback copy"
    echo "$out" | grep -E '^FAIL|^  ' | head -10
  fi
fi

section "15. the batch changed no string content"
# Sections 3 and 5 compare the frontend against the pre-de-obfuscation original,
# and section 9 against the release bytes - none of them can see a rewrite of a
# string *inside* a de-obfuscated module.  Section 5 in particular only reports a
# string as lost when it is no longer even a substring of the file, so a rename
# that also edited a label would sail through it (gov/PLAN.md records exactly this
# blind spot).
#
# The pre-batch rollback copies of section 14 are the only "before" that exists for
# these files, so this section spends them: `--strings` compares each declared
# file's string multiset against its own copy.  Written as a separate section rather
# than folded into section 14 because a missing copy and an edited string are
# different failures with different fixes.
# Self-test first.  A check for a silent failure mode is worthless if it cannot be
# shown to fail, and the fingerprint reports "no change" on a healthy tree whether
# or not it would notice an edited literal.
if out=$("$NODE" tools/lib/string-fingerprint.selftest.mjs 2>&1) && echo "$out" | grep -qE "^# [0-9]+/[0-9]+ passed$"; then
  ok "string fingerprint self-test: $(echo "$out" | grep -E '^# [0-9]+/[0-9]+ passed$')"
else
  bad "the fingerprint cannot detect the string edits this section exists for"
  echo "$out" | tail -10
fi
if [ -z "${HB_BATCH_ID:-}" ]; then
  skip "HB_BATCH_ID unset - no batch in flight, the string gate did not run"
else
  strings_args=(--strings "$HB_BATCH_ID")
  if [ -n "${HB_BATCH_DECLARED:-}" ]; then
    strings_args+=(--declared "$HB_BATCH_DECLARED")
  fi
  if out=$("$NODE" tools/verify_frontend_batch_snapshots.mjs "${strings_args[@]}" 2>&1); then
    ok "$(echo "$out" | grep '^# batch=')"
  else
    bad "a declared file no longer has the string content it had before the batch"
    echo "$out" | grep -E '^FAIL|^  ' | head -10
  fi
fi

section "16. the batch speaks the controlled vocabulary"
# Naming is the one property a rename gate cannot check by equivalence: alpha
# equivalence is exactly what an unreadable name satisfies, so every other section in
# this file would pass a batch that renamed everything to value17.  This section spends
# the batch map on the two naming rules that are decidable from the source:
#
#   - the controlled vocabulary: no compressed name, no word+digits shape, no banned
#     disambiguator, no name the file already uses for something else
#   - the selector oracle: a binding initialised from querySelector("#id") or
#     getElementById("id") must contain that id in camel case
#
# Both self-tests run first, for the reason sections 14 and 15 give: a gate that cannot
# be shown to fail is a gate that will pass.  HB_BATCH_MAP has no default - a
# vocabulary gate that silently finds no map to check is the failure this repo has
# already paid for once.
if out=$("$NODE" tools/check_glossary.selftest.mjs 2>&1) && echo "$out" | grep -qE "^# [0-9]+/[0-9]+ passed$"; then
  ok "vocabulary self-test: $(echo "$out" | grep -E '^# [0-9]+/[0-9]+ passed$')"
else
  bad "the vocabulary gate cannot detect the names it exists for"
  echo "$out" | tail -10
fi
if out=$("$NODE" tools/check_name_anchors.selftest.mjs 2>&1) && echo "$out" | grep -qE "^# [0-9]+/[0-9]+ passed$"; then
  ok "selector oracle self-test: $(echo "$out" | grep -E '^# [0-9]+/[0-9]+ passed$')"
else
  bad "the selector oracle cannot detect the names it exists for"
  echo "$out" | tail -10
fi
if out=$("$NODE" tools/check_name_kinds.selftest.mjs 2>&1) && echo "$out" | grep -qE "^# [0-9]+/[0-9]+ passed$"; then
  ok "shape oracle self-test: $(echo "$out" | grep -E '^# [0-9]+/[0-9]+ passed$')"
else
  bad "the shape oracle cannot detect the names it exists for"
  echo "$out" | tail -10
fi
if [ -z "${HB_BATCH_MAP:-}" ]; then
  skip "HB_BATCH_MAP unset - no batch map to check, the vocabulary gate did not run"
else
  # --applied: this gate runs after the apply, and the collision rule asks whether the
  # file already uses the target name for something else - after an apply, it does.
  if out=$("$NODE" tools/check_glossary.mjs "$HB_BATCH_MAP" --applied 2>&1); then
    ok "$(echo "$out" | grep '^# file=')"
  else
    bad "the batch map does not speak the controlled vocabulary"
    echo "$out" | grep -E '^ERR|^FAIL' | head -10
  fi
  if out=$("$NODE" tools/check_name_anchors.mjs "$HB_BATCH_MAP" 2>&1); then
    ok "$(echo "$out" | grep '^# file=')"
  else
    bad "a selector-derived name disagrees with the selector it was derived from"
    echo "$out" | grep -E '^ERR|^FAIL' | head -10
  fi
  # The third rule needs the pre-batch copy of the file, which is exactly the
  # rollback snapshot section 14 proves exists.  Without a batch id there is no
  # before-tree, so the check is skipped rather than run against the applied file
  # (where every shape question is already answered).
  if [ -z "${HB_BATCH_ID:-}" ]; then
    skip "HB_BATCH_ID unset - no pre-batch copy, the shape oracle did not run"
  elif out=$("$NODE" tools/check_name_kinds.mjs "$HB_BATCH_MAP" --batch "$HB_BATCH_ID" 2>&1); then
    ok "$(echo "$out" | grep '^# file=')"
  else
    bad "a name does not match the shape of the value it replaced"
    echo "$out" | grep -E '^ERR|^FAIL' | head -10
  fi
fi

if [ "${1:-}" = "--full" ]; then
  section "17. full 0.6.5 gate"
  if out=$(bash tools/verify_0.6.5.sh 2>&1) && ! echo "$out" | grep -q "FAIL"; then
    ok "$(echo "$out" | tail -1)"
  else
    bad "tools/verify_0.6.5.sh reported a failure"; echo "$out" | grep 'FAIL' | head -10
  fi
fi

printf '\n\033[1m== summary\033[0m\n'
printf '  checks passed: %d\n  checks failed: %d\n' "$pass" "$fail"
if [ "$skipped" != "0" ]; then
  printf '  \033[33mchecks skipped: %d\033[0m - sections 13/14/15/16 only run inside a batch\n' "$skipped"
fi
[ "$fail" = "0" ] || exit 1
printf '  \033[32mbatch gate green\033[0m\n'
