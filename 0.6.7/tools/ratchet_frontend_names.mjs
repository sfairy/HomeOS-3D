#!/usr/bin/env node
/**
 * Ratchet the frontend naming/formatting gates down to the current residue.
 *
 * `frontend/NAMING.md` section 6 requires every rename batch to lower the ceiling
 * it just moved under, and to write the new number back "into the scripts" so the
 * ceiling becomes a non-regression gate.  Doing that by hand is exactly the kind
 * of step that silently rots: one batch forgets, the gate then tolerates a
 * regression it was built to catch.
 *
 * Until 2026-09-30 this script rewrote the same two/three literals in three shell
 * scripts, and it had already rotted: the copies said 27961 / 3609 while the tree
 * held 27881 / 3607, i.e. the gate would have accepted a regression of 80
 * mechanical names.  The numbers now live in exactly one place,
 *
 *   tools/rename-ratchet.json
 *
 * which the three gate scripts read through tools/print_rename_ratchet.mjs.  This
 * script measures the residue and lowers that file.  It no longer edits any shell
 * script.
 *
 * The ratchet only ever goes DOWN.  A rise means a regression landed (or a new
 * mechanically-named file appeared); raising the ceiling would hide it, so the
 * run fails instead and you have to pass --allow-increase deliberately.
 *
 * Usage:
 *   node tools/ratchet_frontend_names.mjs [--dry] [--allow-increase]
 *
 * --dry              report what would change, write nothing
 * --allow-increase   permit a rise (only for a deliberate, explained regression)
 *
 * Exit status is non-zero on a refused increase or a measurement failure.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NODE = process.env.HB_NODE || process.execPath;
const STORE = path.join(ROOT, 'tools/rename-ratchet.json');

/** measurement key -> the JSON field it is stored in. */
const FIELDS = ['mechanical', 'short', 'unformatted'];

function measureNames() {
  const out = execFileSync(NODE, ['tools/report_frontend_names.mjs'], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 1 << 28,
  });
  const summary = out.split('\n').find((line) => line.startsWith('# files='));
  if (!summary) throw new Error('name inventory produced no summary line');
  return {
    mechanical: Number(/ mechanical=(\d+)/.exec(summary)[1]),
    short: Number(/short=(\d+)/.exec(summary)[1]),
  };
}

function resolvePrettier() {
  if (process.env.HB_PRETTIER) return process.env.HB_PRETTIER;
  const offline = path.join(process.env.HOME || '', '项目/HomeOS/HomeOS/node_modules/prettier/bin/prettier.cjs');
  if (fs.existsSync(offline)) return `${NODE} ${offline}`;
  return 'npx --yes prettier@3';
}

function measureUnformatted() {
  const [command, ...args] = resolvePrettier().split(' ');
  let out = '';
  try {
    execFileSync(command, [...args, '--check', 'frontend/**/*.{js,css}'], {
      cwd: ROOT,
      encoding: 'utf8',
      maxBuffer: 1 << 28,
    });
    return 0;
  } catch (error) {
    out = `${error.stdout || ''}${error.stderr || ''}`;
  }
  return out.split('\n').filter((line) => line.startsWith('[warn] frontend/')).length;
}

/**
 * Read the store.  A missing store is fatal rather than recreated: silently
 * minting a fresh ceiling from whatever the tree happens to hold is how a
 * regression gets blessed instead of caught.
 */
function readStore() {
  if (!fs.existsSync(STORE)) {
    console.error(`missing ${path.relative(ROOT, STORE)} - restore it from the last commit/copy; refusing to invent ceilings`);
    process.exit(1);
  }
  const data = JSON.parse(fs.readFileSync(STORE, 'utf8'));
  for (const field of FIELDS) {
    if (!Number.isInteger(data[field]) || data[field] < 0) {
      console.error(`${path.relative(ROOT, STORE)}: ${field} must be a non-negative integer, got ${JSON.stringify(data[field])}`);
      process.exit(1);
    }
  }
  return data;
}

/** Re-read through the shell-facing printer, so the gate path is exercised too. */
function roundTrip() {
  const out = execFileSync(NODE, ['tools/print_rename_ratchet.mjs'], { cwd: ROOT, encoding: 'utf8' });
  const parsed = Object.fromEntries(
    out
      .split('\n')
      .map((line) => /: "\$\{HB_MAX_(\w+):=(\d+)\}"/.exec(line))
      .filter(Boolean)
      .map((match) => [`HB_MAX_${match[1]}`, Number(match[2])]),
  );
  return parsed;
}

const args = process.argv.slice(2);
const dry = args.includes('--dry');
const allowIncrease = args.includes('--allow-increase');

const measured = { ...measureNames(), unformatted: measureUnformatted() };
const store = readStore();

let refused = 0;
const next = { ...store };
const changes = [];
for (const field of FIELDS) {
  const current = store[field];
  const value = measured[field];
  if (value > current && !allowIncrease) {
    console.error(`REFUSE ${field} would rise ${current} -> ${value} (pass --allow-increase to bless it)`);
    refused += 1;
    continue;
  }
  if (value !== current) {
    changes.push(`${field} ${current} -> ${value}`);
    next[field] = value;
  }
}

if (changes.length > 0) {
  const at = new Date().toISOString();
  next.updatedAt = at;
  next.history = [
    ...(Array.isArray(store.history) ? store.history : []),
    { at, mechanical: next.mechanical, short: next.short, unformatted: next.unformatted, note: changes.join(', ') },
  ];
  if (!dry) fs.writeFileSync(STORE, JSON.stringify(next, null, 2) + '\n');
  console.log(`${dry ? 'would update' : 'updated'} ${path.relative(ROOT, STORE)}: ${changes.join(', ')}`);
} else {
  console.log(`${path.relative(ROOT, STORE)} already at the measured residue`);
}

const emitted = roundTrip();
for (const field of FIELDS) {
  const expected = dry ? store[field] : next[field];
  const variable = `HB_MAX_${field.toUpperCase()}`;
  if (emitted[variable] !== expected) {
    console.error(`tools/print_rename_ratchet.mjs emits ${variable}=${emitted[variable]}, expected ${expected}`);
    process.exit(1);
  }
}

console.log(
  `# measured mechanical=${measured.mechanical} short=${measured.short} ` +
    `unformatted=${measured.unformatted} :: changed=${changes.length} refused=${refused} :: printer round-trip ok`,
);
if (refused > 0) process.exitCode = 1;
