#!/usr/bin/env node
/**
 * Burn-down progress for the semantic-rename wave.
 *
 * tools/report_frontend_names.mjs says how many names are left; this says how far the
 * wave has come, which file is next, and whether the remaining work is where the plan
 * thinks it is.  It reads the wave-start budget for the baseline instead of a number
 * copied into prose, so the percentages cannot drift away from the tree.
 *
 * Usage: node tools/report_rename_progress.mjs [--top N]
 */

import fs from 'node:fs';
import process from 'node:process';
import { execFileSync } from 'node:child_process';

function argValue(name, fallback) {
  const index = process.argv.indexOf(name);
  return index === -1 || process.argv[index + 1] === undefined ? fallback : process.argv[index + 1];
}

const top = Number(argValue('--top', '10')) || 10;
const report = JSON.parse(
  execFileSync(process.execPath, ['tools/report_frontend_names.mjs', '--json'], { encoding: 'utf8', maxBuffer: 1 << 28 }),
);
const budget = JSON.parse(fs.readFileSync('tools/frontend-name-budget.json', 'utf8'));
const ledgerPath = 'tools/rename-maps/ledger.jsonl';
const batches = fs.existsSync(ledgerPath)
  ? fs.readFileSync(ledgerPath, 'utf8').split('\n').filter((l) => l.trim() !== '').length
  : 0;

const before = budget.waveStart;
const burnedM = before.mechanical - report.totals.mechanical;
const burnedS = before.short - report.totals.short;
function pct(burned, started) {
  return started === 0 ? '100.0' : ((burned / started) * 100).toFixed(1);
}

const rows = report.files
  .filter((f) => f.mechanical + f.short > 0)
  .sort((a, b) => b.mechanical + b.short - (a.mechanical + a.short));
const withResidue = rows.length;
console.log('# mechanical: ' + before.mechanical + ' -> ' + report.totals.mechanical + ' (' + burnedM + ' burned, ' + pct(burnedM, before.mechanical) + '%)');
console.log('# short:      ' + before.short + ' -> ' + report.totals.short + ' (' + burnedS + ' burned, ' + pct(burnedS, before.short) + '%)');
console.log('# files:      ' + withResidue + ' of ' + report.files.length + ' still hold residue, ' + (report.files.length - withResidue) + ' clean');
console.log('# batches recorded in the ledger: ' + batches);
console.log('# next ' + top + ' by residue (remaining / wave-start):');
for (const f of rows.slice(0, top)) {
  const entry = budget.files[f.rel] || { residue: 0 };
  console.log('   ' + String(f.mechanical + f.short).padStart(5) + ' / ' + String(entry.residue).padStart(5) + '  ' + f.rel);
}
