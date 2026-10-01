#!/usr/bin/env node
//
// A frozen-set implementation is only worth trusting if it can fail.  Each case
// below is a small module source plus the exact set of local names that must be
// frozen; the disagreements the four tools used to have are all represented.
//
// Usage: node tools/lib/exported-names.selftest.mjs

import { createRequire } from 'node:module';
import { exportedLocalNames } from './exported-names.mjs';
import { resolveBabelRoot } from './babel-root.mjs';

const require = createRequire(import.meta.url);
const parser = require(`${resolveBabelRoot()}/@babel/parser`);

const CASES = [
  ['export const count = 1;', ['count']],
  ['export let a = 1, b = 2;', ['a', 'b']],
  ['export var renamed = 1;', ['renamed']],
  ['export function render() {}', ['render']],
  ['export class Panel {}', ['Panel']],
  ['export default handler;', ['handler']],
  ['export default function () {}', []],
  ['export default function named() {}', ['named']],
  ['export default class {}', []],
  ['export default class Named {}', ['Named']],
  ['export default 42;', []],
  ['const local = 1; export { local };', ['local']],
  ['const local = 1; export { local as publicName };', ['local']],
  ['export { x } from "./other.js";', []],
  ['export * from "./other.js";', []],
  ['export * as ns from "./other.js";', []],
  ['const plain = 1;', []],
  ['export const { a, b: renamed, c: { d } } = source;', ['a', 'renamed', 'd']],
  ['export const [first, , ...rest] = list;', ['first', 'rest']],
  ['export const { e = 1 } = source;', ['e']],
  ['export const { f: { g } = {} } = source;', ['g']],
  ['export const only = 1; export { only as alias };', ['only']],
  ['import { imported } from "./m.js"; export { imported as out };', ['imported']],
  ['import { imported } from "./m.js"; export { imported };', ['imported']],
];

let failures = 0;
for (const [source, expected] of CASES) {
  let ast;
  try {
    ast = parser.parse(source, { sourceType: 'module', errorRecovery: false });
  } catch (error) {
    console.log(`FAIL cannot parse case: ${source} :: ${error.message}`);
    failures += 1;
    continue;
  }
  const actual = [...exportedLocalNames(ast)].sort();
  const want = [...expected].sort();
  const same = actual.length === want.length && actual.every((name, i) => name === want[i]);
  if (same) console.log(`ok   ${source} -> {${actual.join(', ')}}`);
  else {
    failures += 1;
    console.log(`FAIL ${source} -> got {${actual.join(', ')}} want {${want.join(', ')}}`);
  }
}

if (failures > 0) {
  console.log(`# exported-names selftest: ${failures} case(s) failed`);
  process.exit(1);
}
console.log(`# exported-names selftest: ${CASES.length}/${CASES.length} cases behave as specified`);
