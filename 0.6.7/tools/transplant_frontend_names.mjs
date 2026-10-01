#!/usr/bin/env node
/**
 * Adopt a donor tree's semantic names for files that are alpha-equivalent.
 *
 * 0.6.5's frontend went through the full de-obfuscation and naming campaign, so
 * for every file whose *program* is unchanged since then, its names, comments and
 * docstrings are already the answer.  "Unchanged" is not a guess: this tool asks
 * `verify_frontend_rename.mjs` for the before/after verdict and only touches the
 * files that render to the same canonical token stream (identical up to bound
 * names), which is exactly the property that makes replacing the file safe.
 *
 * Files that are byte-identical need no action; files reported MISMATCH differ in
 * more than bound names and are left alone (they need a reader).
 *
 * Usage:
 *   node tools/transplant_frontend_names.mjs <donor-frontend-dir> [--apply] [--json]
 *
 *   (default)   list the files that would be adopted, grouped by verdict
 *   --apply     copy the donor file over frontend/<rel>
 *   --json      print the plan as JSON instead of a table
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FRONTEND = path.join(ROOT, 'frontend');
const NODE = process.env.HB_NODE || '/usr/local/bin/node';

const donor = process.argv[2];
if (!donor) {
  console.error('usage: transplant_frontend_names.mjs <donor-frontend-dir> [--apply] [--json]');
  process.exit(2);
}
const apply = process.argv.includes('--apply');
const asJson = process.argv.includes('--json');
const DONOR = path.resolve(donor);

function* walk(dir, base = dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full, base);
    else if (entry.isFile() && entry.name.endsWith('.js')) yield path.relative(base, full);
  }
}

let verdict = '';
try {
  verdict = execFileSync(
    NODE,
    [path.join(ROOT, 'tools/verify_frontend_rename.mjs'), DONOR, FRONTEND],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
} catch (error) {
  // The checker exits non-zero when anything mismatches; its report is on stdout.
  verdict = String(error.stdout ?? '');
  if (!verdict) throw error;
}
const mismatched = new Set();
for (const line of verdict.split('\n')) {
  const m = /^MISMATCH\s+(\S+)/.exec(line);
  if (m) mismatched.add(m[1]);
}

const adopt = [];
const skipped = [];
for (const rel of [...walk(DONOR)].sort()) {
  const target = path.join(FRONTEND, rel);
  if (!fs.existsSync(target)) {
    skipped.push([rel, 'not-in-frontend']);
    continue;
  }
  if (mismatched.has(rel)) {
    skipped.push([rel, 'mismatch']);
    continue;
  }
  const a = fs.readFileSync(path.join(DONOR, rel));
  const b = fs.readFileSync(target);
  if (a.equals(b)) {
    skipped.push([rel, 'byte-identical']);
    continue;
  }
  adopt.push(rel);
}

if (apply) {
  for (const rel of adopt) {
    fs.copyFileSync(path.join(DONOR, rel), path.join(FRONTEND, rel));
  }
}

if (asJson) {
  console.log(JSON.stringify({ adopt, skipped }, null, 2));
} else {
  for (const rel of adopt) console.log(`ADOPT    ${rel}`);
  for (const [rel, why] of skipped) console.log(`skip     ${rel} (${why})`);
  console.log(`# donor=${DONOR}`);
  console.log(`# adopt=${adopt.length} skipped=${skipped.length} mismatched=${mismatched.size}${apply ? ' (applied)' : ' (dry)'}`);
}
