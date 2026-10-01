#!/usr/bin/env node
/**
 * Self-test for tools/check_name_kinds.mjs.
 *
 * The oracle decides a value's shape from the pre-batch AST and then judges the new
 * name.  Its dangerous failure modes are silence and noise: a rule that is not wired
 * reports errors=0 exactly like a clean file, and a rule that guesses reports errors
 * that cost a reviewer a real name.  These fixtures pin both directions for every
 * rule - element, Map, Set, boolean - plus the unknown-shape path, which must stay
 * silent, and the two-file refusal.
 *
 * Usage: node tools/check_name_kinds.selftest.mjs
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CHECKER = path.join(HERE, 'check_name_kinds.mjs');

const SOURCE = [
  'export function buildPanel(host) {',
  '  const makeRow = (tag) => document.createElement(tag);',
  "  const value1 = document.createElement('div');",
  "  const value2 = document.createElement('span');",
  '  const value3 = host;',
  '  const value4 = new Map();',
  '  const value5 = new Set();',
  '  const value6 = true;',
  "  const value7 = JSON.parse('{}');",
  "  const value8 = makeRow('tr');",
  '  value1.append(value2);',
  '  value3.append(value6);',
  '  const value9 = recordTable.get(key);',
  '  value9.style.scale = 1;',
  '  const value10 = document.createElement("div");',
  '  value10.style.left = "0px";',
  '  return { value1, value2, value3, value4, value5, value6, value7, value8 };',
  '}',
  '',
].join('\n');

const cases = [
  {
    name: 'an element named for what it is passes',
    map: { 'sample.js': { 'value1@3': 'contentElement' } },
    expect: { code: 0, contains: ['resolved=1', 'errors=0', 'PASS'] },
  },
  {
    name: 'an element named after a scalar fails',
    map: { 'sample.js': { 'value1@3': 'contentText' } },
    expect: { code: 1, contains: ['holds an element', 'contentText', 'FAIL'] },
  },
  {
    name: 'a tag role word counts as saying what the node is',
    map: { 'sample.js': { 'value2@4': 'meterRow' } },
    expect: { code: 0, contains: ['errors=0', 'PASS'] },
  },
  {
    name: 'a factory call is element evidence',
    map: { 'sample.js': { 'value8@10': 'metricCell' } },
    expect: { code: 0, contains: ['resolved=1', 'errors=0'] },
  },
  {
    name: 'a factory result named like a scalar fails',
    map: { 'sample.js': { 'value8@10': 'metricValue' } },
    expect: { code: 1, contains: ['holds an element', 'metricValue'] },
  },
  {
    name: 'a use as a node is element evidence even when the init is opaque',
    map: { 'sample.js': { 'value3@5': 'panelHost' } },
    expect: { code: 0, contains: ['shape-undecided=1', 'errors=0'] },
  },
  {
    name: 'an opaque binding used as a node still has to say what it is',
    map: { 'sample.js': { 'value3@5': 'panelContent' } },
    expect: { code: 1, contains: ['holds an element', 'uses append'] },
  },
  {
    name: 'a Map named By<Key> passes',
    map: { 'sample.js': { 'value4@6': 'fieldsByEntityId' } },
    expect: { code: 0, contains: ['errors=0', 'PASS'] },
  },
  {
    name: 'a Map named like a plain object fails',
    map: { 'sample.js': { 'value4@6': 'fieldTable' } },
    expect: { code: 1, contains: ['does not say Map'] },
  },
  {
    name: 'a Set named *Set passes',
    map: { 'sample.js': { 'value5@7': 'selectedIdSet' } },
    expect: { code: 0, contains: ['errors=0'] },
  },
  {
    name: 'a Set named with a plural fails',
    map: { 'sample.js': { 'value5@7': 'selectedIds' } },
    expect: { code: 1, contains: ['does not say Set'] },
  },
  {
    name: 'a boolean named is* passes',
    map: { 'sample.js': { 'value6@8': 'isReady' } },
    expect: { code: 0, contains: ['errors=0'] },
  },
  {
    name: 'a boolean named as a noun fails',
    map: { 'sample.js': { 'value6@8': 'ready' } },
    expect: { code: 1, contains: ['not is/has/should/can'] },
  },
  {
    name: 'a non-element may not be named as an element',
    map: { 'sample.js': { 'value7@9': 'payloadElement' } },
    expect: { code: 1, contains: ['says Element but the initialiser'] },
  },
  {
    name: 'a non-element with a scalar name is left alone',
    map: { 'sample.js': { 'value7@9': 'parsedPayload' } },
    expect: { code: 0, contains: ['errors=0', 'PASS'] },
  },
  {
    name: 'a plain record read only through .style is not a node',
    map: { 'sample.js': { 'value9@13': 'componentRecord' } },
    expect: { code: 0, contains: ['errors=0', 'PASS'] },
  },
  {
    name: 'a created element is still evidence when named like a scalar',
    map: { 'sample.js': { 'value10@15': 'contentText' } },
    expect: { code: 1, contains: ['holds an element', 'contentText'] },
  },
  {
    name: 'a key no binding carries is counted unresolved',
    map: { 'sample.js': { 'zz9@99': 'nothingElement' } },
    expect: { code: 0, contains: ['resolved=0', 'unresolved=1'] },
  },
];

let passed = 0;
let failed = 0;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hb-kinds-'));

function run(map) {
  fs.writeFileSync(path.join(dir, 'sample.js'), SOURCE);
  fs.writeFileSync(path.join(dir, 'map.json'), JSON.stringify(map, null, 2));
  return spawnSync(process.execPath, [CHECKER, 'map.json', '--before', 'sample.js', '--show', '5'], { cwd: dir, encoding: 'utf8' });
}

for (const testCase of cases) {
  const result = run(testCase.map);
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

fs.writeFileSync(path.join(dir, 'two-files.json'), JSON.stringify({ 'a.js': {}, 'b.js': {} }));
const two = spawnSync(process.execPath, [CHECKER, 'two-files.json', '--before', 'sample.js'], { cwd: dir, encoding: 'utf8' });
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
