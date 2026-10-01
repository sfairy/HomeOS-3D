#!/usr/bin/env node
//
// Dump an authoritative worklist for one rename range, and a stub map beside it.
//
// A rename task has two halves: deciding what a binding means (a reader) and
// producing a map whose key set and value set are both exactly right (a machine).
// `verify_map_coverage.mjs` can only grade the second half once a map exists, and
// `apply_frontend_renames.mjs` grades each entry but not the set.  Neither tells a
// reader which bindings they were assigned, or how to spell their declaration
// sites, so a reader who greps for `arg1` gets thousands of hits across the tree
// and no way to tell which of them belong to this range.
//
// This tool closes that gap: it enumerates the residue whose declaration line
// falls inside [declStart, declEnd], spells every key the way the renamer parses
// it (`name@line`, or `name@line:column` when one line declares the name twice),
// and attaches the declaration and up to `--max-refs` reference lines so the
// reader can infer meaning without loading the whole file into their head.
//
// It writes two files:
//
//   <out>.json       the brief - one entry per binding, with context
//   <out>.stub.json  a map skeleton with every key present and empty values
//
// Filling the stub in is the whole of the reader's mechanical work, and a map
// built from it can only be wrong about *names*, never about coverage.
//
// Usage:
//   node tools/brief_frontend_rename_range.mjs <file> <declStart> <declEnd> [--max-refs 6] [--out <path>]
//
// `declStart` / `declEnd` are the declaration-line bounds printed by
// `plan_frontend_rename_ranges.mjs` as `decl bounds (authoritative)`.

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

const argv = process.argv.slice(2);
const maxRefsIndex = argv.indexOf('--max-refs');
const outIndex = argv.indexOf('--out');
const maxRefs = maxRefsIndex >= 0 ? Number(argv[maxRefsIndex + 1]) : 6;
const outArg = outIndex >= 0 ? argv[outIndex + 1] : null;

const skipped = new Set();
if (maxRefsIndex >= 0) skipped.add(maxRefsIndex + 1);
if (outIndex >= 0) skipped.add(outIndex + 1);
const positional = argv.filter((a, i) => !a.startsWith('--') && !skipped.has(i));

function usage() {
  console.error(
    'usage: node tools/brief_frontend_rename_range.mjs <file> <declStart> <declEnd> [--max-refs N] [--out path]',
  );
  process.exit(2);
}

if (positional.length !== 3) usage();
const [targetFile, startArg, endArg] = positional;
const declStart = Number(startArg);
const declEnd = Number(endArg);
if (!Number.isInteger(declStart) || !Number.isInteger(declEnd) || declStart > declEnd) usage();
if (!Number.isInteger(maxRefs) || maxRefs < 0) usage();

const abs = path.resolve(ROOT, targetFile);
if (!fs.existsSync(abs)) {
  console.error(`no such file: ${targetFile}`);
  process.exit(1);
}
const rel = path.relative(ROOT, abs).split(path.sep).join('/');
const code = fs.readFileSync(abs, 'utf8');
const ast = parser.parse(code, { sourceType: 'module', errorRecovery: false });
const sourceLines = code.split('\n');

function lineText(line) {
  const text = sourceLines[line - 1] || '';
  const trimmed = text.trim();
  return trimmed.length > 200 ? `${trimmed.slice(0, 200)}...` : trimmed;
}

// Exported bindings are the module public API: frozen, and `apply_frontend_renames.mjs`
// refuses them.  They are listed as `frozen: true` so a reader can see why one count
// in the range will not move, but they are excluded from the stub.  The set itself is
// shared with the renamer - see tools/lib/exported-names.mjs.
const exported = exportedLocalNames(ast);

// Same visitor and same dedupe key as `verify_map_coverage.mjs`, so the brief and the
// coverage check agree on what exists; disagreement here would show up as an
// unexplained MISSED entry after the fact.
const seen = new Set();
const declared = [];
traverse(ast, {
  Scope(p) {
    for (const [name, binding] of Object.entries(p.scope.bindings)) {
      const id = binding.identifier;
      if (!id || id.start === undefined || !id.loc) continue;
      const key = `${name}@${id.start}`;
      if (seen.has(key)) continue;
      seen.add(key);
      declared.push({ name, id, line: id.loc.start.line, column: id.loc.start.column });
    }
  },
});

// References, resolved through Babel scope machinery so shadowed same-name bindings
// in nested scopes stay separate.
const refsByIdentStart = new Map();
traverse(ast, {
  ReferencedIdentifier(p) {
    const binding = p.scope.getBinding(p.node.name);
    if (!binding || !binding.identifier || binding.identifier.start === undefined) return;
    const key = binding.identifier.start;
    if (!refsByIdentStart.has(key)) refsByIdentStart.set(key, new Set());
    // Dedupe by line before the cap: a line that reads the binding ten times is one
    // place the reader has to look.  Counting it ten times against --max-refs hid the
    // remaining reference sites and inflated every brief.
    refsByIdentStart.get(key).add(p.node.loc.start.line);
  },
});

const inRange = declared.filter((d) => d.line >= declStart && d.line <= declEnd);
const sameLineCount = new Map();
for (const d of declared) {
  const key = `${d.name}@${d.line}`;
  sameLineCount.set(key, (sameLineCount.get(key) || 0) + 1);
}

const entries = [];
for (const d of inRange) {
  const kind = classifyName(d.name);
  if (kind === 'semantic') continue;
  const needsColumn = sameLineCount.get(`${d.name}@${d.line}`) > 1;
  const key = needsColumn ? `${d.name}@${d.line}:${d.column}` : `${d.name}@${d.line}`;
  entries.push({
    key,
    name: d.name,
    line: d.line,
    column: d.column,
    kind,
    frozen: exported.has(d.name),
    declaration: lineText(d.line),
    references: Array.from(refsByIdentStart.get(d.id.start) || [])
      .sort((a, b) => a - b)
      .slice(0, maxRefs)
      .map((line) => ({
        line,
        text: lineText(line),
      })),
  });
}
entries.sort((a, b) => a.line - b.line || a.column - b.column);

const renameable = entries.filter((e) => !e.frozen);
const outPath = outArg
  ? path.resolve(ROOT, outArg)
  : path.join(ROOT, 'tools/rename-maps/briefs', `${path.basename(abs)}.${declStart}-${declEnd}.json`);
fs.mkdirSync(path.dirname(outPath), { recursive: true });

const brief = {
  file: rel,
  declStart,
  declEnd,
  totalLines: sourceLines.length,
  counts: { entries: entries.length, renameable: renameable.length, frozen: entries.length - renameable.length },
  entries,
};
fs.writeFileSync(outPath, `${JSON.stringify(brief, null, 2)}\n`);

const stubPath = outPath.replace(/[.]json$/, '.stub.json');
const stub = {};
stub[rel] = {};
for (const e of renameable) stub[rel][e.key] = '';
fs.writeFileSync(stubPath, `${JSON.stringify(stub, null, 2)}\n`);

console.log(`# ${rel}`);
console.log(`# decl bounds ${declStart}-${declEnd} of ${sourceLines.length} line(s)`);
console.log(`# entries=${entries.length} renameable=${renameable.length} frozen=${entries.length - renameable.length}`);
const byKind = {};
for (const e of renameable) byKind[e.kind] = (byKind[e.kind] || 0) + 1;
console.log(`# kinds ${Object.entries(byKind).map(([k, v]) => `${k}=${v}`).join(' ') || '(none)'}`);
console.log(`# brief ${path.relative(ROOT, outPath)}`);
console.log(`# stub  ${path.relative(ROOT, stubPath)}`);
if (renameable.length === 0) console.log('# nothing to rename in this range.');
