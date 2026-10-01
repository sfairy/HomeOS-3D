/**
 * Self-test for the shared name classifier.
 *
 * The classifier decides what counts as mechanical residue, which in turn sets
 * the progress gate and decides which bindings the rename tools are willing to
 * touch.  Both failure modes are silent:
 *
 *   - too narrow -> residue is filed as "semantic", the gate under-reports, and
 *     the applier refuses to rename names that need renaming (this actually
 *     happened: `weakMap1` and `resizeObserver1` were unmovable);
 *   - too wide   -> real names are shredded.  `sha256` is exported public API
 *     and `alignTo16` carries meaning in its digits.
 *
 * Run directly (`node tools/lib/name-buckets.selftest.mjs`, exit 1 on failure)
 * or through `tools/verify_all.sh`, which wires it into the non-regression gate.
 */

import process from 'node:process';

import { MECHANICAL_RE, classifyName } from './name-buckets.mjs';

/** @type {Array<[string, 'mechanical' | 'short' | 'semantic']>} */
const cases = [
  // Residue the fixed prefix vocabulary covers.
  ['value1234', 'mechanical'],
  ['arg56', 'mechanical'],
  ['fn7', 'mechanical'],
  ['element9', 'mechanical'],
  ['ClassName3', 'mechanical'],
  // Residue from `toCamelCase(callee.name)`.  These are the ones the original
  // 15-prefix whitelist missed; each must stay classified as renameable.
  ['weakMap1', 'mechanical'],
  ['resizeObserver1', 'mechanical'],
  ['uint8Array4', 'mechanical'],
  ['abortController2', 'mechanical'],
  ['uRL1', 'mechanical'],
  ['uRLSearchParams1', 'mechanical'],
  ['date1', 'mechanical'],
  ['orbitControls1', 'mechanical'],
  ['option1', 'mechanical'],
  ['hc1', 'mechanical'],
  // The 0.6.7 re-derivation: word prefixes the 0.6.6 measurement predates.
  // Before these were listed, `max3` and `now10` were filed as semantic and the
  // applier refused to rename them.
  ['max3', 'mechanical'],
  ['min12', 'mechanical'],
  ['num87', 'mechanical'],
  ['options87', 'mechanical'],
  ['closest10', 'mechanical'],
  ['selector10', 'mechanical'],
  ['filter10', 'mechanical'],
  ['vector11', 'mechanical'],
  ['boundingClientRect10', 'mechanical'],
  ['includes10', 'mechanical'],
  ['context10', 'mechanical'],
  ['target10', 'mechanical'],
  ['atan22', 'mechanical'],
  ['trim10', 'mechanical'],
  ['index10', 'mechanical'],
  ['material10', 'mechanical'],
  ['stringify10', 'mechanical'],
  ['now10', 'mechanical'],
  ['localeLowerCase10', 'mechanical'],
  ['setTimeout10', 'mechanical'],
  ['deviceProfile10', 'mechanical'],
  // The counter-only bindings, covered by the short-prefix shape rule.  `v10`
  // is the single largest block of residue in the project (9,698 bindings, all
  // in the four minified giants).
  ['v10', 'mechanical'],
  ['v1452', 'mechanical'],
  ['w70', 'mechanical'],
  // Two characters total is the *short* bucket, which is renameable too - the
  // shape rule only needs to catch the three-character-and-up cases.
  ['w7', 'short'],
  ['f02', 'mechanical'],
  ['q02', 'mechanical'],
  ['at17', 'mechanical'],
  ['wn10', 'mechanical'],
  ['ft10', 'mechanical'],
  ['xo10', 'mechanical'],
  ['ae10', 'mechanical'],
  ['pe10', 'mechanical'],
  ['_10', 'mechanical'],
  ['$e10', 'mechanical'],
  ['Ie10', 'mechanical'],
  ['A02', 'mechanical'],
  // ... but the shape rule must stay narrow enough to leave these alone.  The
  // first five are the documented false positives; `uv2`/`mat4`/`vec3` are
  // THREE attribute and type names whose single digit is part of the name.
  ['uv2', 'semantic'],
  ['mat4', 'semantic'],
  ['vec3', 'semantic'],
  ['gl2', 'semantic'],
  // Short leftovers.
  ['r', 'short'],
  ['KC', 'short'],
  ['$', 'short'],
  ['_', 'short'],
  // Meaningful names that merely *look* like role+counter.  Widen the shape
  // regex to `^[a-z]...\d+$` and these three break.
  ['sha256', 'semantic'],
  ['alignTo16', 'semantic'],
  ['base64', 'semantic'],
  // The same trap in a different disguise: `temp` and `word` read like generic
  // filler, so it is tempting to add them to ROLE_PREFIXES - at which point the
  // SHA-256 implementation in interaction3d/render-cache.js becomes renameable
  // and its spec vocabulary gets rewritten.  Those names are not filler: FIPS
  // 180-4 calls the message-schedule entries "words" (`W[t-15]`, `W[t-2]`) and
  // reference implementations have always named the working variables
  // `temp1`/`temp2`.  They sit beside `messageSchedule`, `rotateRight` and
  // `stateA`, which is what gives the file its meaning.
  ['temp1', 'semantic'],
  ['temp2', 'semantic'],
  ['word2', 'semantic'],
  ['word15', 'semantic'],
  // Ordinary semantic names.
  ['editorHeaderElement', 'semantic'],
  ['isCoverActive', 'semantic'],
  ['RENDER_QUEUE', 'semantic'],
  ['resolveGroundReflection', 'semantic'],
];

let failed = 0;
for (const [name, expected] of cases) {
  const actual = classifyName(name);
  if (actual !== expected) {
    console.error(`FAIL ${name}: expected ${expected}, got ${actual}`);
    failed += 1;
  }
}

// The regex must be anchored, or `value` would be counted inside `myvalue12`.
if (MECHANICAL_RE.test('myvalue12') || MECHANICAL_RE.test('value')) {
  console.error('FAIL: MECHANICAL_RE must match the whole name, not a suffix');
  failed += 1;
}

if (failed > 0) {
  console.error(`# name-buckets selftest: ${failed} failure(s)`);
  process.exit(1);
}
console.log(`# name-buckets selftest: ${cases.length} case(s) pass`);
