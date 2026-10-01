#!/usr/bin/env node
//
// Verify that a rename map covers *exactly* the residue in its assigned range.
//
// `apply_frontend_renames.mjs` checks that every entry in the map resolves to a
// real binding, and that none of them would collide.  It cannot check the
// complement, because it does not know which range the map was supposed to
// cover.  Both halves of that contract fail quietly:
//
//   - a MISSING binding leaves residue behind.  Nothing complains at apply time;
//     the slack only shows up later, as an unexplained rise in the residue count
//     that the check-10 gate reports as a regression, long after the task that
//     caused it has moved on.
//   - an OUT-OF-RANGE binding belongs to a neighbouring chunk of the same file.
//     Renaming it here means two tasks rename the same name in two different
//     files-worth of maps, and the second one fails or, worse, lands a name the
//     first has already taken.
//
// So this recounts the residue from the AST, using the shared classifier, and
// compares it with what the map actually resolves to.  It is the check that lets
// a map be trusted without reading all thousand of its entries.
//
// Usage:
//   node tools/verify_map_coverage.mjs <map.json> <declStart> <declEnd>
//
// `<declStart>` and `<declEnd>` are the *declaration line* bounds the task was
// given, i.e. the "authoritative" range from `plan_frontend_rename_ranges.mjs`,
// not that tool's wider orientation span.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import { classifyName } from './lib/name-buckets.mjs';
import { exportedLocalNames } from './lib/exported-names.mjs';
import { resolveBabelRoot } from './lib/babel-root.mjs';

const require = createRequire(import.meta.url);
const BABEL_ROOT = resolveBabelRoot();

const parser = require(`${BABEL_ROOT}/@babel/parser`);
const traverse = require(`${BABEL_ROOT}/@babel/traverse`).default;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function usage() {
  console.error('usage: node tools/verify_map_coverage.mjs <map.json> <declStart> <declEnd>');
  process.exit(2);
}

const [mapPath, startArg, endArg] = process.argv.slice(2);
if (!mapPath || !startArg || !endArg) usage();
const declStart = Number(startArg);
const declEnd = Number(endArg);
if (!Number.isFinite(declStart) || !Number.isFinite(declEnd)) usage();

const map = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
const fileKeys = Object.keys(map);
if (fileKeys.length !== 1) {
  console.error(`expected exactly 1 file key in the map, found ${fileKeys.length}`);
  process.exit(1);
}
const [relPath, renames] = Object.entries(map)[0];
const code = fs.readFileSync(path.join(ROOT, relPath), 'utf8');
const ast = parser.parse(code, { sourceType: 'module' });

/** Every binding declared in the file, keyed by its declaration site. */
const declared = [];
traverse(ast, {
  Scope(p) {
    for (const [name, binding] of Object.entries(p.scope.bindings)) {
      const node = binding.identifier;
      if (!node || !node.loc) continue;
      declared.push({ name, line: node.loc.start.line, column: node.loc.start.column });
    }
  },
});

/**
 * Resolve a map key to its declaration site.
 *
 * Returns `null` for no match and the string `'ambiguous'` for several, because
 * those are different failures: the first means the key is stale (the binding was
 * already renamed, or the line drifted), the second means the key needs a
 * `:column` qualifier to address a same-line, same-name binding.
 */
function resolveKey(key) {
  const match = /^([^@]+)(?:@(\d+)(?::(\d+))?)?$/.exec(key);
  if (!match) return null;
  const [, name, line, column] = match;
  const hits = declared.filter(
    (d) =>
      d.name === name &&
      (line === undefined || d.line === Number(line)) &&
      (column === undefined || d.column === Number(column)),
  );
  if (hits.length === 1) return hits[0];
  return hits.length === 0 ? null : 'ambiguous';
}

const covered = new Set();
const unresolved = [];
const outOfRange = [];
for (const key of Object.keys(renames)) {
  const hit = resolveKey(key);
  if (hit === null) {
    unresolved.push(`${key} (no such binding)`);
    continue;
  }
  if (hit === 'ambiguous') {
    unresolved.push(`${key} (ambiguous - needs :column)`);
    continue;
  }
  if (hit.line < declStart || hit.line > declEnd) {
    outOfRange.push(`${key} -> declared at line ${hit.line}`);
    continue;
  }
  covered.add(`${hit.name}@${hit.line}`);
}

// An exported binding is the module's public API: `apply_frontend_renames.mjs`
// refuses to rename it, and `brief_frontend_rename_range.mjs` therefore never
// offers it.  This recount has to agree, or it demands a key the renamer will
// reject: `light-state.js` exports its local `j` through `export { j as … }`,
// and treating that one-character local as residue made every otherwise-correct
// map for the file fail to apply.
const exported = exportedLocalNames(ast);

const inRange = declared.filter(
  (d) =>
    d.line >= declStart && d.line <= declEnd && classifyName(d.name) !== 'semantic' && !exported.has(d.name),
);
const missed = inRange.filter((d) => !covered.has(`${d.name}@${d.line}`));

console.log(`file                  ${relPath}`);
console.log(`declared bindings     ${declared.length}`);
console.log(`residue in range      ${inRange.length}  (declaration lines ${declStart}-${declEnd})`);
console.log(`  frozen exports      ${declared.filter((d) => exported.has(d.name)).length}`);
console.log(`map entries           ${Object.keys(renames).length}`);
console.log(`  resolved in range   ${covered.size}`);
console.log(
  `  unresolved          ${unresolved.length}${unresolved.length ? ' :: ' + unresolved.slice(0, 5).join(', ') : ''}`,
);
console.log(
  `  out of range        ${outOfRange.length}${outOfRange.length ? ' :: ' + outOfRange.slice(0, 5).join(', ') : ''}`,
);
console.log(
  `  MISSED residue      ${missed.length}${missed.length ? ' :: ' + missed.slice(0, 10).map((d) => `${d.name}@${d.line}`).join(', ') : ''}`,
);

const clean = missed.length === 0 && unresolved.length === 0 && outOfRange.length === 0;
console.log(clean ? '\nCOVERAGE OK' : '\nCOVERAGE PROBLEM');
process.exit(clean ? 0 : 1);
