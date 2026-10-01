#!/usr/bin/env node
/**
 * Self-test for tools/lib/string-fingerprint.mjs.
 *
 * The contract the batch gate depends on has two halves, and both are tested here:
 * whatever a rename does to a file must leave the digest alone, and *anything* that
 * touches a string must move it.  A digest that fails the first half would block
 * every batch; one that fails the second would be worthless.
 */

import assert from 'node:assert/strict';
import { stringDigest, stringMultiset } from './string-fingerprint.mjs';

const cases = [];
function test(name, fn) {
  try {
    fn();
    cases.push({ name, ok: true });
  } catch (error) {
    cases.push({ name, ok: false, error: error.message });
  }
}

// --- must NOT move (a rename is allowed to do all of this) --------------------

test('identical code', () => {
  const code = 'const a = "x"; export function f() { return "y"; }';
  assert.equal(stringDigest(code), stringDigest(code));
});

test('identifiers renamed', () => {
  const before = 'function render(value1) { return value1 + "suffix"; }';
  const after = 'function paint(paintTarget) { return paintTarget + "suffix"; }';
  assert.equal(stringDigest(before), stringDigest(after));
});

test('re-indented and re-wrapped', () => {
  const before = 'const a = "x";\nconst b = "y";';
  const after = 'const a = "x";\n\nif (true) {\n  const b = "y";\n}';
  assert.equal(stringDigest(before), stringDigest(after));
});

test('quote style and escape spelling', () => {
  const before = "const a = 'x';";
  const after = 'const a = "x";';
  assert.equal(stringDigest(before), stringDigest(after));
});

test('string order', () => {
  const before = 'const a = "one"; const b = "two";';
  const after = 'const b = "two"; const a = "one";';
  assert.equal(stringDigest(before), stringDigest(after));
});

// --- MUST move (these are the edits the gate exists to catch) -----------------

test('an edited string literal', () => {
  const before = 'const label = "主卧吸顶灯";';
  const after = 'const label = "主卧灯";';
  assert.notEqual(stringDigest(before), stringDigest(after));
});

test('a duplicated literal (one site became two)', () => {
  const before = 'const a = n("type");';
  const after = 'const a = "type"; const b = "type";';
  assert.notEqual(stringDigest(before), stringDigest(after));
});

test('a deleted literal', () => {
  const before = 'const a = "kept"; const b = "dropped";';
  const after = 'const a = "kept";';
  assert.notEqual(stringDigest(before), stringDigest(after));
});

test('a changed version stamp', () => {
  const before = 'import("./m.js?v=9a41c2");';
  const after = 'import("./m.js?v=1b77de");';
  assert.notEqual(stringDigest(before), stringDigest(after));
});

test('template literal content', () => {
  const before = 'const t = `a${x}b`;';
  const after = 'const t = `a ${x}b`;';
  assert.notEqual(stringDigest(before), stringDigest(after));
});

// --- failure modes ------------------------------------------------------------

test('a file that does not parse throws instead of comparing equal', () => {
  assert.throws(() => stringDigest('function ('));
});

test('multiset keeps counts', () => {
  const counts = stringMultiset('const a = "x"; const b = "x"; const c = "y";');
  assert.equal(counts.get('x'), 2);
  assert.equal(counts.get('y'), 1);
});

const failed = cases.filter((c) => !c.ok);
for (const c of cases) {
  console.log(`${c.ok ? 'ok  ' : 'FAIL'} ${c.name}${c.ok ? '' : ` :: ${c.error}`}`);
}
console.log(`# ${cases.length - failed.length}/${cases.length} passed`);
if (failed.length > 0) process.exitCode = 1;
