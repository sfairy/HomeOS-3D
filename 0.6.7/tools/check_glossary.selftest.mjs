#!/usr/bin/env node
/**
 * Self-test for tools/check_glossary.mjs.
 *
 * The gate has two ways to be useless - firing on everything (the first version called
 * all 232 names of climate-panel.json neologisms) or firing on nothing - and one way to
 * be wrong: the collision rule reads the file, so on a map that has already been applied
 * every target name collides by definition.  These fixtures pin each hard rule, the
 * --applied escape, and the fact that an unknown-but-plausible name is only a warning.
 *
 * Usage: node tools/check_glossary.selftest.mjs
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CHECKER = path.join(HERE, 'check_glossary.mjs');
const REPO = path.dirname(HERE);

/** The identifiers of this file are what the collision rule compares against. */
const SOURCE = [
  'export function sample(hostElement) {',
  "  const panelElement = hostElement.querySelector('#x');",
  '  return { hostElement, panelElement };',
  '}',
  '',
].join('\n');

/**
 * A destructured parameter whose property key already states the meaning: the key
 * `component` is not a reference, so it must not block `arg1` from taking that name
 * - while `document`, which the body really reads as a global, still must.
 */
const PATTERN_SOURCE = [
  'export function createEditor({ component: arg1, document: arg2 }) {',
  '  return { component: arg1, document: arg2, node: document.createElement("i") };',
  '}',
  '',
].join('\n');
const cases = [
  {
    name: 'a destructured parameter may take its own property key as its name',
    source: PATTERN_SOURCE,
    map: { 'sample.js': { 'arg1@1': 'component' } },
    expect: { code: 0, contains: ['errors=0', 'PASS'] },
  },
  {
    name: 'a name the file reads as a global is still a collision',
    source: PATTERN_SOURCE,
    map: { 'sample.js': { 'arg1@1': 'document' } },
    expect: { code: 1, contains: ['already binds or references', 'errors=1'] },
  },
  {
    name: 'a sanctioned canonical passes',
    map: { 'sample.js': { 'zz1@1': 'entityId' } },
    expect: { code: 0, contains: ['sanctioned=1', 'errors=0', 'PASS'] },
  },
  {
    name: 'a unit-suffixed canonical passes through T6',
    map: { 'sample.js': { 'zz1@1': 'retryDelayMs' } },
    expect: { code: 0, contains: ['sanctioned=1', 'errors=0', 'PASS'] },
  },
  {
    name: 'a compressed name is a hard error',
    map: { 'sample.js': { 'zz1@1': 'ab' } },
    expect: { code: 1, contains: ['two characters or fewer', 'errors=1', 'FAIL'] },
  },
  {
    name: 'a word+digits name is a hard error',
    map: { 'sample.js': { 'zz1@1': 'counter1' } },
    expect: { code: 1, contains: ['word+digits', 'errors=1'] },
  },
  {
    name: 'a banned disambiguator is a hard error',
    map: { 'sample.js': { 'zz1@1': 'panelContext' } },
    expect: { code: 1, contains: ['banned disambiguator', 'errors=1'] },
  },
  {
    name: 'one name for two bindings is a hard error',
    map: { 'sample.js': { 'zz1@1': 'entityId', 'zz2@2': 'entityId' } },
    expect: { code: 1, contains: ['is used by 2 entries', 'errors=1'] },
  },
  {
    name: 'a name the file already uses is a hard error',
    map: { 'sample.js': { 'zz1@1': 'panelElement' } },
    expect: { code: 1, contains: ['already binds or references', 'errors=1'] },
  },
  {
    name: '--applied drops the collision rule and keeps the rest',
    map: { 'sample.js': { 'zz1@1': 'panelElement', 'zz2@2': 'panelContext' } },
    args: ['--applied'],
    expect: { code: 1, contains: ['(applied)', 'banned disambiguator', 'errors=1'] },
  },
  {
    name: '--applied leaves a clean applied map clean',
    map: { 'sample.js': { 'zz1@1': 'panelElement' } },
    args: ['--applied'],
    expect: { code: 0, contains: ['(applied)', 'errors=0', 'PASS'] },
  },
  {
    name: 'an unknown but plausible name is only a warning',
    map: { 'sample.js': { 'zz1@1': 'widgetTelemetrySnapshot' } },
    expect: { code: 0, contains: ['warnings=1', 'no canonical covers this name', 'PASS'] },
  },
  {
    name: 'a transform the glossary never sanctioned stays a warning',
    map: { 'sample.js': { 'zz1@1': 'rawEntityId' } },
    expect: { code: 0, contains: ['warnings=1', 'PASS'] },
  },
  {
    name: 'a name mapped to itself is refused',
    map: { 'sample.js': { 'zz1@1': 'zz1' } },
    expect: { code: 1, contains: ['maps a name to itself'] },
  },
];

let passed = 0;
let failed = 0;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hb-glossary-'));

for (const testCase of cases) {
  fs.writeFileSync(path.join(dir, 'sample.js'), testCase.source || SOURCE);
  fs.writeFileSync(path.join(dir, 'map.json'), JSON.stringify(testCase.map, null, 2));
  const args = [CHECKER, 'map.json', '--glossary', path.join(REPO, 'tools/rename-glossary.json'), '--exceptions', path.join(REPO, 'tools/rename-maps/exceptions.json'), '--show', '5'].concat(testCase.args || []);
  const result = spawnSync(process.execPath, args, { cwd: dir, encoding: 'utf8' });
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

fs.writeFileSync(path.join(dir, 'two.json'), JSON.stringify({ 'sample.js': {}, 'other.js': {} }));
const two = spawnSync(process.execPath, [CHECKER, 'two.json', '--glossary', path.join(REPO, 'tools/rename-glossary.json')], { cwd: dir, encoding: 'utf8' });
if (two.status === 2) {
  passed += 1;
  console.log('ok   a map declaring two files is refused');
} else {
  failed += 1;
  console.log('FAIL a map declaring two files is refused: exit ' + two.status);
}

fs.writeFileSync(path.join(dir, 'missing.json'), JSON.stringify({ 'nope.js': { 'zz1@1': 'entityId' } }));
const missing = spawnSync(process.execPath, [CHECKER, 'missing.json', '--glossary', path.join(REPO, 'tools/rename-glossary.json')], { cwd: dir, encoding: 'utf8' });
if (missing.status === 1 && (missing.stdout + missing.stderr).includes('does not exist')) {
  passed += 1;
  console.log('ok   a map naming a missing file is refused');
} else {
  failed += 1;
  console.log('FAIL a map naming a missing file is refused: exit ' + missing.status);
}

fs.rmSync(dir, { recursive: true, force: true });
console.log('# ' + passed + '/' + (passed + failed) + ' passed');
process.exitCode = failed > 0 ? 1 : 0;
