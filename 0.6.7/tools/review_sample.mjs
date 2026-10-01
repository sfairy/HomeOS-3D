#!/usr/bin/env node
/**
 * Draw a blind review sample from a rename brief.
 *
 * A batch gate proves a rename is mechanically safe: the map covers the range,
 * the file is alpha-equivalent to its pre-batch copy, no string moved, nothing
 * outside the declared list changed.  It cannot see the one failure that matters
 * most - a name that is unique, legal and *wrong*.  So the plan reviews a
 * stratified sample by hand, blind: the reviewer gets the new name and the
 * declaration it replaced with the old name masked out, and has to say what the
 * value is.  If the reading does not match the value, the rename failed even
 * though every gate is green.
 *
 * Sampling is deterministic.  Each stratum is shuffled with a Fisher-Yates pass
 * seeded by sha256(seed), so the same batch always draws the same cards and a
 * rerun cannot shop for an easier sample.  Cards never print the old name; the
 * key file holds it, and it stays closed until the verdicts are written down.
 *
 * Usage:
 *   node tools/review_sample.mjs <brief.json> <map.json> [--n 30] [--seed s]
 *                                [--out cards.json] [--key key.json]
 *
 * --n defaults to 30: the rule of three for a claimed defect rate of <=10%.
 * A closing or frozen-dense batch uses 59 for <=5%.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import crypto from 'node:crypto';

const USAGE =
  'usage: review_sample.mjs <brief.json> <map.json> [--n 30] [--seed s] [--out cards.json] [--key key.json]';

function argValue(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  const value = process.argv[index + 1];
  if (value === undefined || value.startsWith('--')) throw new Error(name + ' needs a value');
  return value;
}

function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

/** Deterministic 32-bit PRNG (mulberry32). */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled(items, rng) {
  const copy = items.slice();
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = copy[i];
    copy[i] = copy[j];
    copy[j] = tmp;
  }
  return copy;
}

/** Declaration shape: the stratum the plan calls 'declaration form'. */
function shapeOf(declaration) {
  const text = declaration || '';
  if (/querySelector|getElementById|querySelectorAll/.test(text)) return 'dom-query';
  if (/new THREE\.|THREE\./.test(text)) return 'three';
  if (/^\s*\(|^\s*async\s*\(/.test(text)) return 'function-parameter';
  if (/^\s*(const|let|var)\s*\{/.test(text)) return 'destructured-object';
  if (/^\s*(const|let|var)\s*\[/.test(text)) return 'destructured-array';
  if (/^\s*(const|let|var)\s/.test(text)) return 'module-binding';
  if (/^\s*(function|class)\b/.test(text)) return 'function-or-class';
  if (/=>/.test(text)) return 'arrow';
  return 'other';
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Mask the old name, and only the old name: the mask must not hint at it. */
function mask(text, oldName) {
  if (!text || !oldName) return text || '';
  return text.replace(new RegExp('\\b' + escapeRegExp(oldName) + '\\b', 'g'), '???');
}

function main() {
  const positional = process.argv.slice(2).filter((a, i, all) => {
    if (a.startsWith('--')) return false;
    return !(i > 0 && all[i - 1].startsWith('--'));
  });
  const briefPath = positional[0];
  const mapPath = positional[1];
  if (!briefPath || !mapPath) {
    console.error(USAGE);
    process.exit(2);
  }
  const size = Number(argValue('--n', '30'));
  if (!Number.isInteger(size) || size <= 0) throw new Error('--n must be a positive integer');
  const seed = argValue('--seed', path.basename(mapPath, '.json'));
  const outPath = argValue('--out', '');
  const keyPath = argValue('--key', '');

  const brief = JSON.parse(fs.readFileSync(briefPath, 'utf8'));
  const map = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
  const mapFiles = Object.keys(map);
  if (mapFiles.length !== 1) {
    console.error('FAIL this map declares ' + mapFiles.length + ' files; a batch is one file');
    process.exit(2);
  }
  if (brief.file !== mapFiles[0]) {
    console.error('FAIL brief covers ' + brief.file + ' but the map covers ' + mapFiles[0]);
    process.exit(2);
  }
  const renames = map[mapFiles[0]];

  const byStratum = new Map();
  for (const entry of brief.entries) {
    const newName = renames[entry.key];
    if (!newName) continue;
    const stratum = entry.kind + '/' + shapeOf(entry.declaration);
    if (!byStratum.has(stratum)) byStratum.set(stratum, []);
    byStratum.get(stratum).push({ entry, newName });
  }
  const candidates = [...byStratum.values()].reduce((sum, list) => sum + list.length, 0);

  const rng = mulberry32(parseInt(sha256(seed).slice(0, 8), 16));
  const strata = [...byStratum.keys()].sort();
  const pools = new Map(strata.map((name) => [name, shuffled(byStratum.get(name), rng)]));
  const taken = new Map(strata.map((name) => [name, 0]));
  const cards = [];
  let exhausted = false;
  while (cards.length < size && !exhausted) {
    exhausted = true;
    for (const stratum of strata) {
      if (cards.length >= size) break;
      const pool = pools.get(stratum);
      const index = taken.get(stratum);
      if (index >= pool.length) continue;
      exhausted = false;
      taken.set(stratum, index + 1);
      const picked = pool[index];
      const id = 'card-' + String(cards.length + 1).padStart(2, '0');
      cards.push({
        id,
        stratum,
        newName: picked.newName,
        declaration: mask(picked.entry.declaration, picked.entry.name),
        references: (picked.entry.references || [])
          .slice(0, 3)
          .map((ref) => 'L' + ref.line + ': ' + mask(ref.text, picked.entry.name)),
        oldName: picked.entry.name,
        key: picked.entry.key,
      });
    }
  }

  console.log('# file=' + brief.file + ' candidates=' + candidates + ' sample=' + cards.length + ' seed=' + seed);
  for (const card of cards) {
    console.log('');
    console.log(card.id + '  [' + card.stratum + ']  ' + card.newName);
    console.log('  declares: ' + card.declaration);
    for (const ref of card.references) console.log('  ' + ref);
  }
  console.log('');
  console.log('# the old name is not printed above.  Write a reading for every card first, then open the key.');

  if (outPath) {
    fs.writeFileSync(outPath, JSON.stringify({ file: brief.file, seed, size, candidates, cards: cards.map((c) => ({ id: c.id, stratum: c.stratum, newName: c.newName, declaration: c.declaration, references: c.references })) }, null, 2) + '\n');
  }
  if (keyPath) {
    fs.writeFileSync(keyPath, JSON.stringify({ file: brief.file, seed, key: cards.map((c) => ({ id: c.id, stratum: c.stratum, oldName: c.oldName, newName: c.newName, key: c.key })) }, null, 2) + '\n');
  }
}

main();
