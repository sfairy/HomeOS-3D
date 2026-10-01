#!/bin/sh
# run_all.sh -- end-to-end frontend deobfuscation + verification for HA-Bridge 0.6.7.
# Never writes outside recovered/. Fully re-runnable from scratch: deobfuscate_all
# regenerates the ground-truth output, adoption and normalisation are applied on
# top of it. Every step runs even if an earlier one fails, so the log always
# carries the complete evidence; the script exits 1 if any step failed.

ROOT=/Users/sfairy/项目/HA-Bridge/源代码/0.6.7
export PATH=/usr/local/bin:$PATH
cd "$ROOT" || exit 1

FAILED=""

step() {
  name="$1"; shift
  echo ""
  echo "== $name =="
  "$@"
  rc=$?
  if [ "$rc" -ne 0 ]; then
    echo "!! $name FAILED (exit $rc)"
    FAILED="$FAILED $name(exit=$rc)"
  fi
  return 0
}

step "1/8 deobfuscate every JS under frontend/"        node recovered/tools/deobfuscate_all.mjs --jobs 3
step "2/8 copy every non-JS asset byte-for-byte"       python3 recovered/tools/copy_assets.py
step "3/8 adopt the 0.6.6 donor (+ ?v= re-patch)"      node recovered/tools/adapt/adopt_donor.mjs
step "4/8 P1 mechanical normalisation"                 node recovered/tools/normalize_frontend.mjs
step "5/8 residue measurement"                         node recovered/tools/adapt/count_residue.mjs
step "6/8 per-file donor verdict table"                node recovered/tools/adapt/verify_adoption.mjs
step "7/8 gates AC-F7 / AC-F8 / AC-F9"                 node recovered/tools/adapt/gate_ac.mjs
step "8/8 validator AC-F1..F6 + F4b + F7b"             node recovered/tools/validate_js.mjs

echo ""
if [ -n "$FAILED" ]; then
  echo "RUN COMPLETE WITH FAILURES:$FAILED"
  exit 1
fi
echo "ALL STEPS COMPLETE"
