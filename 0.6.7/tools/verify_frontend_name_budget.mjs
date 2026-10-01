#!/usr/bin/env node
/**
 * Per-file burn-down budget: no file may ever hold MORE leftover mechanical or short
 * names than it held when the wave began.
 *
 * The whole-tree ratchet (tools/rename-ratchet.json) cannot see this.  It only knows
 * the total, so a batch that removes 400 names from one file and a *different* change
 * that adds 400 names back to another file nets out to zero and passes.  In a wave
 * that runs 200 batches in parallel that masking is not hypothetical, it is the
 * expected failure.  This checker compares each file against its own wave-start
 * reading in tools/frontend-name-budget.json.
 *
 * A file that reaches zero residue is dropped from the budget (tools/report_rename_progress.mjs
 * counts it as burned); if residue ever reappears in it the checker reports NEW, which fails.
 *
 * Usage: verify_frontend_name_budget.mjs [--update]
 *   (default)  compare the tree against the budget; exit 1 if any file regressed
 *   --update   rewrite the budget from the current tree (only at the start of a wave)
 */

import fs from 'node:fs';
import process from 'node:process';
import { execFileSync } from 'node:child_process';

const BUDGET = 'tools/frontend-name-budget.json';
const EXCEPTIONS = 'tools/rename-maps/exceptions.json';
const update = process.argv.includes('--update');

function readReport() {
  const out = execFileSync(process.execPath, ['tools/report_frontend_names.mjs', '--json'], { encoding: 'utf8', maxBuffer: 1 << 28 });
  return JSON.parse(out);
}

/** Files whose residue a human has explicitly allowed to grow, with a reason. */
function allowedBudget() {
  if (!fs.existsSync(EXCEPTIONS)) return new Map();
  const doc = JSON.parse(fs.readFileSync(EXCEPTIONS, 'utf8'));
  const map = new Map();
  for (const entry of [...(doc.allowedBudget || []), ...(doc.entries || [])]) {
    if (entry.kind && entry.kind !== 'allowed-budget') continue;
    map.set(entry.file, entry);
  }
  return map;
}

const report = readReport();
if (update) {
  const files = {};
  let mechanical = 0;
  let short = 0;
  for (const f of report.files) {
    files[f.rel] = { mechanical: f.mechanical, short: f.short, residue: f.mechanical + f.short };
    mechanical += f.mechanical;
    short += f.short;
  }
  fs.writeFileSync(BUDGET, JSON.stringify({ version: 1, createdAt: new Date().toISOString(), source: 'wave-start reading', waveStart: { mechanical, short }, files }, null, 2) + '\n');
  console.log('# wrote ' + BUDGET + ' files=' + report.files.length + ' mechanical=' + mechanical + ' short=' + short);
  process.exit(0);
}

if (!fs.existsSync(BUDGET)) {
  console.error('FAIL ' + BUDGET + ' is missing: there is no wave-start reading to compare against (run --update at the start of a wave)');
  process.exit(1);
}

const budget = JSON.parse(fs.readFileSync(BUDGET, 'utf8'));
const allowed = allowedBudget();
const problems = [];
let excepted = 0;
let files = 0;
for (const f of report.files) {
  const entry = budget.files[f.rel];
  if (!entry) {
    problems.push('NEW  ' + f.rel + ' residue=' + (f.mechanical + f.short) + ' has no budget entry');
    continue;
  }
  files += 1;
  const over = f.mechanical > entry.mechanical || f.short > entry.short;
  if (!over) continue;
  if (allowed.has(f.rel)) {
    excepted += 1;
    continue;
  }
  problems.push(
    'OVER ' + f.rel + ' mechanical=' + f.mechanical + ' (budget ' + entry.mechanical + ') short=' + f.short + ' (budget ' + entry.short + ')',
  );
}
let burned = 0;
for (const rel of Object.keys(budget.files)) {
  if (report.files.some((f) => f.rel === rel)) continue;
  // Absent from the report means the file has zero residue left: it was burned all the way down,
  // which is exactly what the budget asks for.  A file that no longer exists is a different
  // problem and stays a failure (the batch delta gate would also report it as missing).
  if (fs.existsSync(rel)) {
    burned += 1;
    continue;
  }
  problems.push('GONE ' + rel + ' was in the budget and is not in the tree any more');
}

console.log('# budget files=' + files + ' over-budget=' + problems.length + ' exceptions=' + excepted + ' burned-to-zero=' + burned);
for (const line of problems.slice(0, 20)) console.log(line);
if (problems.length > 0) {
  console.error('FAIL a file holds more leftover names than it held at wave start');
  process.exit(1);
}
console.log('PASS no file regressed above its wave-start residue');
