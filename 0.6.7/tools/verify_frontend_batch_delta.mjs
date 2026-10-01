#!/usr/bin/env node
/**
 * "This batch only touched the files it declared."
 *
 * Sections 2/3/5 of tools/verify_frontend_batch.sh prove the frontend is
 * equivalent to the baseline and that no string or export moved.  None of them
 * can see a change to a file the batch never intended to touch: an edit to
 *
 *   backend/app/main.py      (the file that serves /bridge-static/**)
 *   tools/apply_frontend_renames.mjs
 *   .prettierrc
 *
 * is invisible to a frontend-vs-frontend comparison, and this repository has no
 * git, so nothing else would report it either.  That is what this gate is for.
 *
 * The signing key is the back pressure: -`shasum -a 256` over the whole tree is
 * too slow to run casually, so the hash is taken once before the batch and once
 * after it, and only hashes that moved are examined.
 *
 * Usage:
 *   node tools/verify_frontend_batch_delta.mjs snapshot <out.json> [--root .]
 *   node tools/verify_frontend_batch_delta.mjs check <pre.json> [--declared <list>] [--root .]
 *
 * The declared list defaults to tools/rename-maps/declared-files.txt (one
 * repository-relative path per line, '#' comments and blank lines allowed).
 *
 * Exit status is non-zero if anything outside the declared list changed.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { scanTree, readDeclaredFiles } from './lib/scan-tree.mjs';

/**
 * Per-batch bookkeeping that a batch is allowed to write without declaring it:
 * the rename map itself, its audit sidecar, the append-only ledger, and the
 * ratchet store the batch is required to lower.  Source code is never here.
 */
const BATCH_ARTEFACTS = [
  'tools/rename-maps',
  'tools/rename-ratchet.json',
  'tools/frontend-name-budget.json',
  // The controlled vocabulary is versioned *with* the batch (the sidecar records
  // the glossary version it ran under), and ratification adds concepts as the wave
  // discovers them, so it changes during a batch by design.
  'tools/rename-glossary.json',
  // Quality tooling that is built and revised *while* batches run: the blind-review
  // sampler and the shape oracle (plus its self-test).  They are allow-listed by
  // explicit path, so the gate still refuses anything a human did not name here.
  'tools/review_sample.mjs',
  'tools/check_name_kinds.mjs',
  'tools/check_name_kinds.selftest.mjs',
];

const USAGE = 'usage: verify_frontend_batch_delta.mjs snapshot <out.json> | check <pre.json> [--declared <list>] [--root <dir>]';
const FLAGS_WITH_VALUE = new Set(['--root', '--declared']);

function argValue(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  const value = process.argv[index + 1];
  if (value === undefined || value.startsWith('--')) throw new Error(name + ' needs a value');
  return value;
}

/** Positionals only: flag values are consumed by their flag, so a path can never be mistaken for a subcommand. */
function positionals() {
  const argv = process.argv.slice(2);
  const out = [];
  for (let i = 0; i < argv.length; i += 1) {
    if (FLAGS_WITH_VALUE.has(argv[i])) i += 1;
    else if (argv[i].startsWith('--')) throw new Error('unknown flag ' + argv[i]);
    else out.push(argv[i]);
  }
  return out;
}

let positional;
try {
  positional = positionals();
} catch (error) {
  console.error('FAIL ' + error.message + '\n' + USAGE);
  process.exit(2);
}

const root = argValue('--root', '.');
const [subcommand, target] = positional;

if (subcommand === 'snapshot') {
  if (!target) {
    console.error('FAIL snapshot needs an output path\n' + USAGE);
    process.exit(2);
  }
  const files = scanTree(root);
  fs.writeFileSync(target, JSON.stringify({ root: path.resolve(root), files: Object.fromEntries(files) }, null, 2) + '\n');
  console.log(`# snapshot files=${files.size} -> ${target}`);
  process.exit(0);
}

if (subcommand !== 'check') {
  console.error(USAGE);
  process.exit(2);
}

if (!target) {
  console.error('FAIL check needs a pre-batch snapshot path\n' + USAGE);
  process.exit(2);
}
const pre = JSON.parse(fs.readFileSync(target, 'utf8'));
const declaredList = argValue('--declared', 'tools/rename-maps/declared-files.txt');
let declared;
try {
  declared = readDeclaredFiles(declaredList);
} catch (error) {
  console.error('FAIL ' + error.message);
  process.exit(2);
}
// An empty declaration makes the comparison vacuous - every change would be
// "outside-declared", but there is nothing to compare against, so a green run
// would mean nothing at all.  Refuse rather than bless.
if (declared.length === 0) {
  console.error(`FAIL ${declaredList} declares no files: there is nothing to hold the batch to`);
  process.exit(1);
}
const declaredSet = new Set(declared);
const now = scanTree(root);

const changed = [];
const missing = [];
const added = [];
for (const [rel, hash] of Object.entries(pre.files)) {
  const current = now.get(rel);
  if (current === undefined) missing.push(rel);
  else if (current !== hash) changed.push(rel);
}
for (const rel of now.keys()) {
  if (!(rel in pre.files)) added.push(rel);
}

const ignored = (rel) => BATCH_ARTEFACTS.some((prefix) => rel === prefix || rel.startsWith(prefix + '/'));
const outside = [...changed, ...missing, ...added].filter((rel) => !declaredSet.has(rel) && !ignored(rel));

console.log(
  `# files=${now.size} changed=${changed.length} missing=${missing.length} added=${added.length} ` +
    `declared=${declaredSet.size} outside-declared=${outside.length}`,
);
for (const rel of changed) console.log(`${declaredSet.has(rel) || ignored(rel) ? 'ok  ' : 'OUT '}changed ${rel}`);
for (const rel of missing) console.log(`${declaredSet.has(rel) ? 'ok  ' : 'OUT '}missing ${rel}`);
for (const rel of added) console.log(`${declaredSet.has(rel) || ignored(rel) ? 'ok  ' : 'OUT '}added   ${rel}`);
if (declaredSet.size === 0) console.log('# note: the declared list is empty, so every change is outside-declared');

if (outside.length > 0) {
  console.error(`FAIL ${outside.length} path(s) changed outside ${declaredList}`);
  process.exit(1);
}
console.log('PASS the batch touched nothing outside its declaration');
