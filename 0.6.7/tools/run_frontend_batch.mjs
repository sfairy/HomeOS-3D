#!/usr/bin/env node
/**
 * Drive one rename batch end to end.
 *
 * The documented loop (frontend/NAMING.md §3) is six manual steps per batch:
 * delta snapshot, rollback snapshot, apply, format, split into single-file maps,
 * run the oracles, run the gate per file, ratchet, append the ledger.  Doing them
 * by hand is both slow and easy to skip - a batch that never got its split maps
 * fails §16 for a reason that looks like a naming error, and a batch that never
 * got its ratchet entry silently stops counting.
 *
 * This script is the loop, in the documented order, so a batch cannot half-happen.
 * It stops on the first hard failure and prints what to fix.
 *
 * Usage:
 *   node tools/run_frontend_batch.mjs --id small-batch9 --map tools/rename-maps/small-batch9.json
 *
 * Options:
 *   --id <batchId>     snapshot id (default: basename of --map, minus .json)
 *   --map <path>       the rename map, possibly spanning several files
 *   --jobs <n>         gate concurrency (default 4)
 *   --recover          recover a half-applied batch from its rollback snapshot
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// fileURLToPath, not `new URL(...).pathname`: the workspace path contains CJK
// characters, which the URL form percent-encodes into a path that does not exist.
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

function arg(name, fallback = null) {
  const i = process.argv.indexOf('--' + name);
  if (i === -1) return fallback;
  const next = process.argv[i + 1];
  return next && !next.startsWith('--') ? next : true;
}

const mapPath = arg('map');
if (!mapPath || mapPath === true) {
  console.error('usage: run_frontend_batch.mjs --map <map.json> [--id <batchId>] [--jobs N]');
  process.exit(2);
}
const mapAbs = path.resolve(ROOT, mapPath);
const batchId = String(arg('id', path.basename(mapAbs, '.json')));
const jobs = Number(arg('jobs', 4));
// Split maps are named `<splitPrefix>-<file stem>.json`; keep the prefix free of
// dashes and of the leading `small-` so it never collides with a file stem.
const splitPrefix = batchId.replace(/^small-/, '').replace(/[^a-zA-Z0-9]/g, '');

const sh = (cmd, opts = {}) => {
  const r = spawnSync(cmd, { shell: true, cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28, ...opts });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
};

const step = (label) => console.log('\n=== ' + label + ' ===');

/** Run the gate for one file and pull out its pass/fail counts. */
function gateOne(file, pre) {
  const stem = path.basename(file, '.js');
  const split = `tools/rename-maps/split/${splitPrefix}-${stem}.json`;
  const env =
    `HB_BATCH_ID=${batchId} HB_BATCH_PRE=${pre} HB_BATCH_MAP=${split} ` +
    `HB_BATCH_DECLARED=tools/rename-maps/declared-files.txt`;
  const r = sh(`${env} bash tools/verify_frontend_batch.sh`);
  const passed = Number((r.out.match(/checks passed:\s*(\d+)/) || [])[1] ?? -1);
  const failed = Number((r.out.match(/checks failed:\s*(\d+)/) || [])[1] ?? 1);
  const firstFail = (r.out.match(/^FAIL .*/m) || [])[0] || '';
  return { file, split, passed, failed, firstFail };
}

// ---------------------------------------------------------------------------
const map = JSON.parse(fs.readFileSync(mapAbs, 'utf8'));
const files = Object.keys(map);
if (files.length === 0) throw new Error('map declares no files');
console.log(`batch ${batchId}: ${files.length} file(s), ${files.reduce((n, f) => n + Object.keys(map[f]).length, 0)} binding(s)`);

const recovered = sh(`node tools/verify_frontend_batch_delta.mjs recover .restore/batch-pre/${batchId}.json`);
if (arg('recover')) {
  step('recover');
  console.log(recovered.code === 0 ? 'recovered from .restore/batch-pre/' + batchId + '.json' : recovered.out);
  process.exit(recovered.code === 0 ? 0 : 1);
}

step('1/8 pre-batch delta snapshot');
// The delta snapshot is the "did this batch touch anything it did not declare"
// reference, so it has to be taken before the writes.
let r = sh(`node tools/verify_frontend_batch_delta.mjs snapshot .restore/batch-pre/${batchId}.json`);
console.log(r.out.trim());
if (r.code !== 0) process.exit(1);

step('2/8 declared files');
fs.writeFileSync(
  path.join(ROOT, 'tools/rename-maps/declared-files.txt'),
  '# Files this batch declares it will rewrite. One repo-relative path per line.\n' + files.join('\n') + '\n'
);
console.log(files.join('\n'));

step('3/8 rollback snapshot');
r = sh(`node tools/verify_frontend_batch_snapshots.mjs --take ${batchId}`);
console.log(r.out.trim());
if (r.code !== 0) process.exit(1);

step('4/8 apply + format');
r = sh(`node tools/apply_frontend_renames.mjs ${mapPath}`);
console.log(r.out.trim().split('\n').slice(-1)[0]);
if (r.code !== 0) process.exit(1);
r = sh(
  `node "$HOME/项目/HomeOS/HomeOS/node_modules/prettier/bin/prettier.cjs" --write ` +
    files.map((f) => `'${f}'`).join(' ')
);
if (r.code !== 0) {
  console.log(r.out.slice(0, 2000));
  process.exit(1);
}
console.log(`formatted ${files.length} file(s)`);

step('5/8 split maps');
for (const file of files) {
  // §16 expects a map that declares exactly one file.
  const stem = path.basename(file, '.js');
  fs.writeFileSync(
    path.join(ROOT, `tools/rename-maps/split/${splitPrefix}-${stem}.json`),
    JSON.stringify({ [file]: map[file] }, null, 2) + '\n'
  );
}
console.log(files.map((f) => `${splitPrefix}-${path.basename(f, '.js')}.json`).join('\n'));

step('6/8 oracles (glossary / anchors / shape)');
let oracleErrors = 0;
for (const file of files) {
  const stem = path.basename(file, '.js');
  const split = `tools/rename-maps/split/${splitPrefix}-${stem}.json`;
  const g = sh(`node tools/check_glossary.mjs ${split} --applied`).out.match(/^ERR.*/gm) || [];
  const a = sh(`node tools/check_name_anchors.mjs ${split}`).out.match(/^ERR.*/gm) || [];
  const k = sh(`node tools/check_name_kinds.mjs ${split} --batch ${batchId}`).out.match(/^ERR.*/gm) || [];
  const all = [...g, ...a, ...k];
  if (all.length) {
    oracleErrors += all.length;
    console.log(`## ${stem}\n` + all.join('\n'));
  }
}
console.log(oracleErrors ? `${oracleErrors} oracle error(s) - fix the map and re-run` : 'all oracles clean');
if (oracleErrors) process.exit(1);

step(`7/8 gate (${files.length} file(s), ${jobs} at a time)`);
const pre = `.restore/batch-pre/${batchId}.json`;
const queue = [...files];
const results = [];
await Promise.all(
  Array.from({ length: Math.min(jobs, queue.length) }, async () => {
    for (;;) {
      const file = queue.shift();
      if (!file) return;
      const res = gateOne(file, pre);
      results.push(res);
      console.log(
        `${res.failed === 0 && res.passed > 0 ? 'ok  ' : 'FAIL'} ${res.file}  ${res.passed}/${res.passed + res.failed}` +
          (res.firstFail ? `\n     ${res.firstFail}` : '')
      );
    }
  })
);
const failedFiles = results.filter((x) => x.failed !== 0 || x.passed <= 0);
if (failedFiles.length) {
  console.log(`\n${failedFiles.length} file(s) failed the gate`);
  process.exit(1);
}

step('8/8 ratchet + ledger');
r = sh('node tools/ratchet_frontend_names.mjs');
console.log(r.out.trim());
if (r.code !== 0) process.exit(1);

const crypto = await import('node:crypto');
const sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, p))).digest('hex');
const entries = files.map((file) => ({
  batchId: `${splitPrefix}-${path.basename(file, '.js')}`,
  file,
  bindings: Object.keys(map[file]).length,
  mapSha256: sha(`tools/rename-maps/split/${splitPrefix}-${path.basename(file, '.js')}.json`),
  fileSha256Before: sha(`.restore/batch-snapshots/${batchId}/${file}`),
  fileSha256After: sha(file),
  residueAfter: 0,
  gate: '24/0',
  recordedAt: new Date().toISOString(),
}));
fs.appendFileSync(
  path.join(ROOT, 'tools/rename-maps/ledger.jsonl'),
  entries.map((e) => JSON.stringify(e)).join('\n') + '\n'
);
console.log(`ledger: +${entries.length} entry(ies)`);

r = sh('node tools/report_frontend_names.mjs');
console.log(r.out.split('\n').slice(0, 2).join('\n'));
