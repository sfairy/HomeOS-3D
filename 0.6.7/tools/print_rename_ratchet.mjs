#!/usr/bin/env node
/**
 * Emit the frontend rename/format ceilings as shell assignments.
 *
 * The three gate scripts (tools/verify_frontend_batch.sh, tools/verify_0.6.5.sh,
 * tools/verify_all.sh) each used to carry their own literal copy of
 * HB_MAX_MECHANICAL / HB_MAX_SHORT / HB_MAX_UNFORMATTED.  tools/ratchet_frontend_names.mjs
 * rewrote all three in place, and by 2026-09-30 the copies had already drifted
 * from the measured residue by 80 mechanical / 2 short names - a gate that
 * tolerates a regression it was built to catch.
 *
 * tools/rename-ratchet.json is now the only stored copy.  This script prints it
 * in a form the shell can `eval`:
 *
 *   : "${HB_MAX_MECHANICAL:=27881}"
 *
 * The ` : "${VAR:=...}" ` (rather than a plain assignment) is deliberate: it keeps
 * an explicitly exported HB_MAX_* from the environment winning, so a one-off
 * investigation can still raise a ceiling without editing the file.
 *
 * Usage:
 *   eval "$(/usr/local/bin/node tools/print_rename_ratchet.mjs)"
 *
 * Exit status is non-zero when the file is missing, unparseable, or holds a
 * value that is not a non-negative integer.  Callers must treat that as fatal:
 * falling back to a literal is the drift this indirection exists to remove.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = path.join(ROOT, 'tools/rename-ratchet.json');

const FIELDS = [
  ['HB_MAX_MECHANICAL', 'mechanical'],
  ['HB_MAX_SHORT', 'short'],
  ['HB_MAX_UNFORMATTED', 'unformatted'],
];

let data;
try {
  data = JSON.parse(fs.readFileSync(FILE, 'utf8'));
} catch (error) {
  console.error(`tools/print_rename_ratchet.mjs: cannot read ${FILE}: ${error.message}`);
  process.exit(1);
}

const lines = [];
for (const [variable, field] of FIELDS) {
  const value = data[field];
  if (!Number.isInteger(value) || value < 0) {
    console.error(`tools/print_rename_ratchet.mjs: ${field} must be a non-negative integer, got ${JSON.stringify(value)}`);
    process.exit(1);
  }
  lines.push(': "' + "${" + variable + ':=' + value + '}"');
}
process.stdout.write(lines.join('\n') + '\n');
