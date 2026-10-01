/**
 * Split a huge frontend file into balanced, non-overlapping line ranges so the
 * semantic-renaming work can be handed to several bounded subagent tasks.
 *
 * The three remaining giants (`home.js` ~22k lines, `studio-app.js` ~24k,
 * `renderer.js` ~15k) hold 5-13x more residual bindings than any file handled
 * so far.  Handing one of them to a single agent in one shot means reading tens
 * of thousands of lines and inventing thousands of names in one context: slow,
 * error prone, and impossible to review.  Instead we cut each file into ranges
 * of roughly `--target` bindings each.
 *
 * Boundaries are snapped to **top-level statement starts** so a range never
 * begins or ends in the middle of a function body.  That matters because the
 * rename tool resolves each map entry by its declaration site: a clean boundary
 * keeps every entry inside one range resolvable without reading the neighbour.
 *
 * Ranges are disjoint and cover the whole file, so the union of the generated
 * maps is a valid map for the file.  Cross-range collisions are still possible
 * (two agents picking `state` for different bindings); the rename tool rejects
 * them, and `--target` keeps the blast radius small.
 *
 * Usage:
 *   node tools/plan_frontend_rename_ranges.mjs <file> [--target 1200] [--json]
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createRequire } from 'node:module';

import { classifyName } from './lib/name-buckets.mjs';
import { exportedLocalNames } from './lib/exported-names.mjs';
import { resolveBabelRoot } from './lib/babel-root.mjs';

const require = createRequire(import.meta.url);
const BABEL_ROOT = resolveBabelRoot();

const parser = require(`${BABEL_ROOT}/@babel/parser`);
const traverse = require(`${BABEL_ROOT}/@babel/traverse`).default;

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const targetIndex = args.indexOf('--target');
const target = targetIndex >= 0 ? Number(args[targetIndex + 1]) : 1200;
// --target 0 (or a negative / non-numeric value) makes the partitioning loop
// below non-terminating: `count < target` is false on entry, so `end` never
// advances past `index`, the slice is empty, and the loop spins forever (or
// reads `bindings[-1].line` and throws).  Reject it at the boundary.
if (!Number.isInteger(target) || target < 1) {
  console.error(`invalid --target ${args[targetIndex + 1]}: must be a positive integer`);
  process.exit(2);
}
// Skip the option *value* only when the option is actually present; see the
// matching comment in `report_frontend_names.mjs`.  `-1 + 1 = 0` would
// otherwise swallow the file path, and the tool would report "usage" for a
// perfectly valid single-argument invocation.
const optionValueIndexes = new Set();
if (targetIndex >= 0) optionValueIndexes.add(targetIndex + 1);
const targetFile = args.find((a, i) => !a.startsWith('--') && !optionValueIndexes.has(i));

if (!targetFile) {
  console.error('usage: node tools/plan_frontend_rename_ranges.mjs <file> [--target N] [--json]');
  process.exit(2);
}

const abs = path.resolve(targetFile);
const code = fs.readFileSync(abs, 'utf8');
const ast = parser.parse(code, { sourceType: 'module', errorRecovery: false });
const totalLines = code.split('\n').length;

// Exported bindings are the module's public API: frozen, never renamed.
const exported = exportedLocalNames(ast);

/** Residual bindings, with the line they are declared on. */
const seen = new Set();
const bindings = [];
traverse(ast, {
  Scopable(p) {
    for (const [name, binding] of Object.entries(p.scope.bindings)) {
      const id = binding.identifier;
      if (!id || id.start === undefined) continue;
      const key = `${name}@${id.start}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (exported.has(name)) continue;
      // Single decision point: classifyName, not the two regexes it is built
      // from.  Re-deriving it here meant ranges were planned against a
      // narrower definition of residue than the applier and the report used.
      const kind = classifyName(name);
      if (kind === 'semantic') continue;
      const mechanical = kind === 'mechanical';
      const short = kind === 'short';
      bindings.push({ name, line: id.loc.start.line, mechanical, short });
    }
  },
});
bindings.sort((a, b) => a.line - b.line);

// A file with no residual bindings is *finished*, not misconfigured.  This case
// used to fall through to the "no ranges produced" sanity check below and exit
// 1, so a fully-renamed file read as a broken plan and stopped a caller that was
// looping over the tree.
if (bindings.length === 0) {
  const rel = path.relative(process.cwd(), abs);
  if (asJson) {
    console.log(
      JSON.stringify({ file: rel, totalLines, target, residualBindings: 0, ranges: [] }, null, 2)
    );
  } else {
    console.log(`# ${rel}`);
    console.log(`# totalLines=${totalLines} residualBindings=0 target=${target}`);
    console.log('# file is fully renamed - nothing to plan.');
  }
  process.exit(0);
}

// Valid cut points: the first line of *any* statement, at any nesting depth.
//
// Top-level statements alone are not enough.  `renderer.js` and most of the
// studio files are wrapped in a single IIFE, so `ast.program.body` holds one
// statement and the only top-level cut point is line 1; ranges 2..n then
// degenerate to empty.  Statements inside a function body are equally good
// boundaries: the rename tool resolves every map entry by its declaration site
// and rewrites all references file-wide, so a cut only has to fall *between*
// statements, never inside one.
const cutLines = [];
traverse(ast, {
  Statement(p) {
    if (p.node.loc) cutLines.push(p.node.loc.start.line);
  },
  Declaration(p) {
    if (p.node.loc) cutLines.push(p.node.loc.start.line);
  },
});
cutLines.sort((a, b) => a - b);

/** Smallest statement start that is >= `line`, else `totalLines`. */
function snapUp(line) {
  for (const candidate of cutLines) if (candidate >= line) return candidate;
  return totalLines;
}

const ranges = [];
let cursor = 0;
let index = 0;
while (index < bindings.length) {
  const startBinding = bindings[index];
  let count = 0;
  let end = index;
  while (end < bindings.length && count < target) {
    count += 1;
    end += 1;
  }
  const lastLine = bindings[end - 1].line;
  const stop = end >= bindings.length ? totalLines : snapUp(lastLine + 1);
  // Never split a line.  A chunk is described to its reader, and graded by
  // `verify_map_coverage.mjs`, as a `[firstLine, lastLine]` range: that shape
  // cannot express "these two bindings on line 1829 are mine and those two are
  // the next chunk's".  At `--target 600` nine boundaries in home.js,
  // studio-app.js, renderer.js and geometry.js landed mid-line, which would
  // have made both neighbouring maps claim the shared line (and collide on
  // apply).  Extend the chunk until the line is exhausted instead.
  while (end < bindings.length && bindings[end].line === bindings[end - 1].line) end += 1;

  // A boundary can land in the middle of a line when several bindings share it
  // (`home.js` packs 992 short names into ~1000 lines, so `--target 400` splits
  // inside one).  `snapUp` then maps the next chunk back onto the previous
  // chunk's own statement start, so `cursor + 1` overshoots `stop` and the span
  // reads as inverted.  Ranges are partitioned by binding *index*, never by
  // span, and the span exists only to orient a reader: clamp its start rather
  // than perturb the authoritative partition.
  const spanStart = Math.min(cursor + 1, stop);
  const slice = bindings.slice(index, end);

  // Defensive only.  With the --target validation above the inner loop always
  // advances at least once, so `slice` cannot be empty.  The old body bumped
  // `end` and `continue`d without advancing `index`: reaching it was an
  // infinite loop, so fail loudly instead of spinning.
  if (slice.length === 0) {
    console.error('# BAD PLAN: planner made no progress - refusing to loop');
    process.exit(1);
  }

  ranges.push({
    // `from`/`to` index the residue-binding list: these are the authoritative
    // partition, and the sanity check below asserts they tile it exactly.
    from: index,
    to: end,
    // Reading context for whoever gets this chunk.  Note `start` can be *after*
    // `firstLine` (the previous chunk's span ends on the boundary statement), so
    // these columns are for orientation only - never instruct from them.
    start: spanStart,
    end: stop,
    bindings: slice.length,
    mechanical: slice.filter((b) => b.mechanical).length,
    short: slice.filter((b) => b.short).length,
    firstLine: slice.at(0).line,
    lastLine: slice.at(-1).line,
    sample: slice.slice(0, 8).map((b) => b.name),
  });
  cursor = stop;
  index = end;
}

// Sanity: the ranges must tile the residue-binding list exactly.
//
// This is the invariant that actually matters, and it is *not* the same as the
// line spans being contiguous.  Each range ends on the statement start at or
// after its last binding, so a range's reading span can run one statement past
// its own last binding: for `home.js`, range 1 spans lines 1-1181 but its last
// binding is declared on 1180, while range 2's first binding is declared on the
// 1181 that range 1's span already covers.  Checking only span contiguity let
// that through, and any chunk instructed by *span* rather than by declaration
// line would silently skip the boundary binding.
const problems = [];
// Unreachable for a file with residual bindings (handled above); kept so a
// future refactor that removes the early exit still fails loudly.
if (ranges.length === 0) problems.push('no ranges produced for a file with residual bindings');
for (const [i, range] of ranges.entries()) {
  if (range.to <= range.from) problems.push(`range ${i + 1} covers zero bindings`);
  if (range.end < range.start) problems.push(`range ${i + 1} has an inverted span`);
  if (range.lastLine < range.firstLine) problems.push(`range ${i + 1} has inverted decl bounds`);
  const next = ranges[i + 1];
  if (!next) continue;
  if (next.from !== range.to) {
    problems.push(`range ${i + 1} and ${i + 2} do not tile the binding list`);
  }
  if (next.firstLine < range.lastLine) {
    problems.push(
      `range ${i + 1} (ends at declaration line ${range.lastLine}) and range ${i + 2} ` +
        `(starts at ${next.firstLine}) overlap - a binding would be claimed twice`
    );
  }
}
if (ranges.length > 0) {
  if (ranges[0].from !== 0) problems.push('first range does not start at the first binding');
  if (ranges.at(-1).to !== bindings.length) {
    problems.push('last range does not reach the last binding');
  }
  if (ranges[0].start !== 1) problems.push(`first range starts at line ${ranges[0].start}`);
  if (ranges.at(-1).end !== totalLines) {
    problems.push(`last range ends at line ${ranges.at(-1).end}, file has ${totalLines}`);
  }
}
if (problems.length > 0) {
  for (const problem of problems) console.error(`# BAD PLAN: ${problem}`);
  process.exit(1);
}

if (asJson) {  console.log(
    JSON.stringify(
      { file: path.relative(process.cwd(), abs), totalLines, target, ranges },
      null,
      2
    )
  );
} else {
  console.log(`# ${path.relative(process.cwd(), abs)}`);
  console.log(
    `# totalLines=${totalLines} residualBindings=${bindings.length} ` +
      `mechanical=${bindings.filter((b) => b.mechanical).length} ` +
      `short=${bindings.filter((b) => b.short).length} target=${target}`
  );
  console.log('');
  console.log('  span (orientation)   lines  bindings  mech short  decl bounds (authoritative)');
  for (const range of ranges) {
    console.log(
      `  ${String(range.start).padStart(6)}-${String(range.end).padEnd(6)} ` +
        `${String(range.end - range.start + 1).padStart(6)} ` +
        `${String(range.bindings).padStart(9)} ` +
        `${String(range.mechanical).padStart(5)} ` +
        `${String(range.short).padStart(5)} ` +
        `${String(range.firstLine).padStart(9)}-${String(range.lastLine).padEnd(6)}`
    );
  }
  console.log('');
  console.log('# Bindings to include, per chunk (declaration lines - use THESE, not the span):');
  for (const [i, range] of ranges.entries()) {
    console.log(
      `#   chunk ${i + 1}: ${range.bindings} binding(s) declared on lines ` +
        `${range.firstLine}-${range.lastLine}`
    );
  }
  console.log('');
  for (const [i, range] of ranges.entries()) {
    console.log(`#   chunk ${i + 1}: ${range.sample.join(', ')} ...`);
  }
}
