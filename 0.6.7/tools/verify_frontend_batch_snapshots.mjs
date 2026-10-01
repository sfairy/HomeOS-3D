#!/usr/bin/env node
/**
 * Rollback copies for a rename batch.
 *
 * This repository has no git: the only way back from a bad rename batch is a
 * byte copy of every file the batch is about to rewrite, taken before it writes.
 * .restore/batch-snapshots/ has held such copies since the first wave, and
 * nothing ever checked that a batch actually made them - so a batch that forgot
 * was indistinguishable from one that did not, and the discovery would happen at
 * rollback time, i.e. never.
 *
 * This tool both takes and checks them:
 *
 *   node tools/verify_frontend_batch_snapshots.mjs --take <batchId>
 *   node tools/verify_frontend_batch_snapshots.mjs --batch <batchId>
 *   node tools/verify_frontend_batch_snapshots.mjs --strings <batchId>
 *
 * Layout is per batch, not flat: .restore/batch-snapshots/<batchId>/<repo path>.
 * A later batch over the same file therefore keeps its own starting point, and
 * rolling a file back means replaying that file's batches newest first.
 *
 * Checks (all fatal):
 *   - the batch directory exists and holds exactly the declared files
 *     (count equality: a snapshot nobody declares is as useless as a missing one)
 *   - every snapshot is a non-empty regular file
 *   - every snapshot differs from the working file, which is what proves it was
 *     taken *before* the batch rather than after it - a post-edit "snapshot" is
 *     not a rollback point at all.
 *
 * `--strings` then spends the same copies on the other half of the rule the batch
 * is bound by: a rename may move identifiers and nothing else, so every declared
 * file must still digest to the same string multiset as its rollback copy (see
 * tools/lib/string-fingerprint.mjs).  The batch gate runs it as its own section.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { readDeclaredFiles } from './lib/scan-tree.mjs';
import { stringMultiset, digestMultiset, describeDifference } from './lib/string-fingerprint.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SNAPSHOT_ROOT = process.env.HB_BATCH_SNAPSHOTS || path.join(ROOT, '.restore/batch-snapshots');

function argValue(argv, name, fallback) {
  const index = argv.indexOf(name);
  if (index === -1) return fallback;
  const value = argv[index + 1];
  if (value === undefined || value.startsWith('--')) throw new Error(name + ' needs a value');
  return value;
}

function walk(dir, relDir = '', out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = relDir ? relDir + '/' + entry.name : entry.name;
    if (entry.isDirectory()) walk(path.join(dir, entry.name), rel, out);
    else out.push(rel);
  }
  return out;
}

const mode = process.argv.includes('--take')
  ? 'take'
  : process.argv.includes('--batch')
    ? 'batch'
    : process.argv.includes('--strings')
      ? 'strings'
      : null;
if (!mode) {
  console.error('usage: verify_frontend_batch_snapshots.mjs (--take|--batch|--strings) <batchId> [--declared <list>]');
  process.exit(2);
}

const idFlag = mode === 'take' ? '--take' : mode === 'batch' ? '--batch' : '--strings';
const batchId = argValue(process.argv, idFlag, process.env.HB_BATCH_ID);
if (!batchId) {
  console.error('FAIL no batch id given (pass --take <id> / --batch <id>, or set HB_BATCH_ID)');
  process.exit(1);
}
if (/[\\/]/.test(batchId) || batchId === '.' || batchId === '..') {
  console.error(`FAIL batch id ${batchId} must be a single path segment`);
  process.exit(1);
}

const declaredList = argValue(process.argv, '--declared', path.join(ROOT, 'tools/rename-maps/declared-files.txt'));
const declared = readDeclaredFiles(declaredList);
if (declared.length === 0) {
  console.error(`FAIL ${path.relative(ROOT, declaredList)} declares no files: a batch with nothing to roll back is not a batch`);
  process.exit(1);
}

const dir = path.join(SNAPSHOT_ROOT, batchId);

if (mode === 'take') {
  // Never overwrite: an existing directory is a previous run's rollback point,
  // and silently replacing it would be the one destructive thing this tool does.
  if (fs.existsSync(dir)) {
    console.error(`FAIL ${path.relative(ROOT, dir)} already exists - pick a new batch id, or roll the old one back first`);
    process.exit(1);
  }
  const missingSources = declared.filter((rel) => !fs.existsSync(path.join(ROOT, rel)));
  if (missingSources.length > 0) {
    console.error('FAIL declared file(s) do not exist:');
    for (const rel of missingSources) console.error('  ' + rel);
    process.exit(1);
  }
  for (const rel of declared) {
    const dest = path.join(dir, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(path.join(ROOT, rel), dest);
  }
  const relDir = path.relative(ROOT, dir);
  console.log(`# took ${declared.length} rollback snapshot(s) into ${relDir}`);
  console.log(`# rollback: cp -R "${relDir}/." .`);
  process.exit(0);
}

if (!fs.existsSync(dir)) {
  console.error(`FAIL no rollback snapshots at ${path.relative(ROOT, dir)} - take them before the batch writes anything`);
  process.exit(1);
}

// The rollback copies are also the only available "before" for the string rule:
// the batch's own pre-edit bytes.  Comparing each declared file's string multiset
// against its copy proves the batch moved identifiers and no content - a check no
// other section can make, because every other string check compares against the
// pre-de-obfuscation original, where computed-member normalisation legitimately
// removed hundreds of literals.
if (mode === 'strings') {
  let checked = 0;
  let mismatched = 0;
  for (const rel of declared) {
    const snap = path.join(dir, rel);
    if (!fs.existsSync(snap)) {
      console.error(`FAIL ${rel}: no rollback copy to compare against`);
      mismatched += 1;
      continue;
    }
    let before;
    let after;
    try {
      before = stringMultiset(fs.readFileSync(snap, 'utf8'));
      after = stringMultiset(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
    } catch (error) {
      console.error(`FAIL ${rel}: ${error.message}`);
      mismatched += 1;
      continue;
    }
    checked += 1;
    if (digestMultiset(before) === digestMultiset(after)) continue;
    mismatched += 1;
    console.error(`FAIL ${rel}: this batch changed string content`);
    for (const line of describeDifference(before, after).slice(0, 10)) console.error(line);
  }
  console.log(`# batch=${batchId} strings-checked=${checked} strings-mismatched=${mismatched}`);
  if (mismatched > 0) process.exit(1);
  console.log('PASS every declared file kept its string content');
  process.exit(0);
}

const present = new Set(walk(dir));
const declaredSet = new Set(declared);
const missing = declared.filter((rel) => !present.has(rel));
const extra = [...present].filter((rel) => !declaredSet.has(rel));
const empty = [];
const identical = [];

for (const rel of declared) {
  if (missing.includes(rel)) continue;
  const snap = path.join(dir, rel);
  const stat = fs.statSync(snap);
  if (!stat.isFile() || stat.size === 0) {
    empty.push(rel);
    continue;
  }
  const live = path.join(ROOT, rel);
  if (fs.existsSync(live) && fs.readFileSync(snap).equals(fs.readFileSync(live))) identical.push(rel);
}

console.log(
  `# batch=${batchId} snapshots=${present.size} declared=${declaredSet.size} ` +
    `missing=${missing.length} extra=${extra.length} empty=${empty.length} identical-to-working=${identical.length}`,
);

let failed = 0;
for (const [label, list, why] of [
  ['missing', missing, 'the batch would have no way back for these'],
  ['extra', extra, 'snapshotted but not declared: nothing will ever roll these back'],
  ['empty', empty, 'snapshot is empty or not a regular file'],
  ['identical', identical, 'identical to the working file: taken after the edit, not before it'],
]) {
  if (list.length === 0) continue;
  failed += list.length;
  console.error(`FAIL ${label}: ${why}`);
  for (const rel of list.slice(0, 10)) console.error('  ' + rel);
}

if (failed > 0) process.exit(1);
console.log('PASS every declared file has a pre-batch rollback snapshot');
