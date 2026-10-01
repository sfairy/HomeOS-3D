#!/usr/bin/env node
/**
 * Self-test for tools/check_name_anchors.mjs.
 *
 * The oracle has a nasty failure mode: on a file whose selectors are all class or
 * data-attribute selectors it reports anchored=0 and PASS, which looks identical to a
 * file that has no selectors at all.  These fixtures pin the cases that must be
 * distinguishable - a satisfied '#id', a violated '#id', an unanchored class
 * selector, a fresh unapplied map (old name + line), and a stale line whose shift
 * must not hide the check.
 *
 * Usage: node tools/check_name_anchors.selftest.mjs
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CHECKER = path.join(HERE, 'check_name_anchors.mjs');

const SOURCE = [
  'export function bindUi(root) {',
  "  const Dv = document.querySelector('#panel-frame-glow-color');",
  "  const q1 = root.querySelector('#vacuum-status-name');",
  "  const k2 = document.getElementById('climate-mode-icon');",
  "  const t3 = root.querySelector('.i3d-meter-unit');",
  '  return { Dv, q1, k2, t3 };',
  '}',
  '',
].join('\n');

/** The same file after an apply: the target names are in place and the lines shifted. */
const APPLIED_SOURCE = SOURCE.replace('const Dv =', 'const panelFrameGlowColorElement =')
  .split('\n')
  .flatMap((line) => (line.includes('panelFrameGlowColorElement') ? ['', '  // a comment the wave did not count on', line] : [line]))
  .join('\n');

const cases = [
  {
    name: 'a satisfying #id name passes',
    map: { 'sample.js': { 'Dv@2': 'panelFrameGlowColorElement' } },
    expect: { code: 0, contains: ['resolved=1', 'anchored=1', 'satisfied=1', 'unsatisfied=0', 'PASS'] },
  },
  {
    name: 'a name that ignores its #id fails',
    map: { 'sample.js': { 'Dv@2': 'glowColorElement' } },
    expect: { code: 1, contains: ['anchored=1', 'satisfied=0', 'unsatisfied=1', 'panelFrameGlowColor', 'FAIL'] },
  },
  {
    name: 'an applied map resolves by name even when Prettier moved the line',
    source: APPLIED_SOURCE,
    map: { 'sample.js': { 'Dv@2': 'panelFrameGlowColorElement' } },
    expect: { code: 0, contains: ['resolved=1', 'anchored=1', 'satisfied=1'] },
  },
  {
    name: 'getElementById anchors too',
    map: { 'sample.js': { 'k2@4': 'climateModeIconElement' } },
    expect: { code: 0, contains: ['anchored=1', 'satisfied=1'] },
  },
  {
    name: 'an unapplied map resolves by old name and line',
    map: { 'sample.js': { 'q1@3': 'vacuumStatusNameElement' } },
    expect: { code: 0, contains: ['resolved=1', 'anchored=1', 'satisfied=1'] },
  },
  {
    name: 'a class selector is reported, not guessed at',
    map: { 'sample.js': { 't3@5': 'meterUnitElement' } },
    expect: { code: 0, contains: ['anchored=0', 'unanchored-selectors=1', 'no single camel spelling'] },
  },
  {
    name: 'a name no binding carries is counted unresolved',
    map: { 'sample.js': { 'zz9@7': 'nothingElement' } },
    expect: { code: 0, contains: ['resolved=0', 'unresolved=1'] },
  },
];

let passed = 0;
let failed = 0;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hb-anchors-'));

function run(map, source) {
  fs.writeFileSync(path.join(dir, 'sample.js'), source || SOURCE);
  fs.writeFileSync(path.join(dir, 'map.json'), JSON.stringify(map, null, 2));
  return spawnSync(process.execPath, [CHECKER, 'map.json'], { cwd: dir, encoding: 'utf8' });
}

for (const testCase of cases) {
  const result = run(testCase.map, testCase.source);
  const output = result.stdout + result.stderr;
  const problems = [];
  if (result.status !== testCase.expect.code) problems.push('exit ' + result.status + ' (wanted ' + testCase.expect.code + ')');
  for (const needle of testCase.expect.contains) {
    if (!output.includes(needle)) problems.push('missing ' + JSON.stringify(needle));
  }
  if (problems.length === 0) {
    passed += 1;
    console.log('ok   ' + testCase.name);
  } else {
    failed += 1;
    console.log('FAIL ' + testCase.name + ': ' + problems.join('; '));
    console.log(output.split('\n').map((l) => '     ' + l).join('\n'));
  }
}

const mapFile = path.join(dir, 'two-files.json');
fs.writeFileSync(mapFile, JSON.stringify({ 'a.js': {}, 'b.js': {} }));
const two = spawnSync(process.execPath, [CHECKER, 'two-files.json'], { cwd: dir, encoding: 'utf8' });
if (two.status === 2) {
  passed += 1;
  console.log('ok   a map declaring two files is refused');
} else {
  failed += 1;
  console.log('FAIL a map declaring two files is refused: exit ' + two.status);
}

fs.rmSync(dir, { recursive: true, force: true });
console.log('# ' + passed + '/' + (passed + failed) + ' passed');
process.exitCode = failed > 0 ? 1 : 0;
