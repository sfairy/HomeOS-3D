#!/usr/bin/env node
/**
 * Read a rename brief in slices.
 *
 * A brief for one 400-binding chunk is ~220 KB of JSON.  Reading it whole costs more
 * context than the naming decisions it supports, so this prints the decision-relevant
 * part of each entry - key, kind, the declaration line, and the first few references -
 * and nothing else.
 *
 * Usage: node tools/dump_rename_brief.mjs <brief.json> [from] [count] [refsPer]
 */

import fs from 'node:fs';
import process from 'node:process';

const [briefPath, fromArg, countArg, refsArg] = process.argv.slice(2);
if (!briefPath) {
  console.error('usage: dump_rename_brief.mjs <brief.json> [from] [count] [refsPer]');
  process.exit(2);
}
const from = Number(fromArg || '0') || 0;
const count = Number(countArg || '60') || 60;
const refsPer = Number(refsArg === undefined ? '2' : refsArg);
const brief = JSON.parse(fs.readFileSync(briefPath, 'utf8'));
const slice = brief.entries.slice(from, from + count);
console.log('# ' + brief.file + ' entries ' + from + '..' + (from + slice.length - 1) + ' of ' + brief.entries.length);
for (const entry of slice) {
  console.log('');
  console.log(entry.key + '  [' + entry.kind + ']');
  console.log('  decl: ' + String(entry.declaration || '').trim());
  for (const ref of (entry.references || []).slice(0, refsPer)) {
    console.log('  ref' + String(ref.line).padStart(5) + ': ' + String(ref.text).trim());
  }
}
