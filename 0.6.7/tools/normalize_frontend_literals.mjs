#!/usr/bin/env node
/**
 * Normalise the de-obfuscator's numeric spellings back to readable literals.
 *
 * The obfuscator's constant folding replaced readable constants with hex, and
 * turned booleans and infinities into arithmetic on them.  Removing the
 * obfuscator's *machinery* (rounds 1-3) left every one of those spellings in
 * place, because they parse and run fine - they are simply unreadable:
 *
 *   0x64          -> 100
 *   !0x0 / !0x1   -> true / false          (4 885 sites)
 *   -0x1 / 0x0    -> -Infinity             (106 sites)
 *   void 0x0      -> undefined             (112 sites)
 *
 * Every rewrite below is *value-preserving by construction*, which is what
 * makes it verifiable: `verify_frontend_rename.mjs` renders numeric literals by
 * value and folds exactly these artefacts, so a misread constant (`0x64` ->
 * `99`) or an inverted boolean still shows up as a mismatch.
 *
 * Edits are byte-range splices, like `apply_frontend_renames.mjs`: comments,
 * indentation, quote style and the `?v=…` cache strings are untouched, and the
 * line count is asserted to be unchanged, so a diff stays reviewable.
 *
 * Usage:
 *   node tools/normalize_frontend_literals.mjs [--dry] [--check] [--report] [path …]
 *
 *   (no flag)   rewrite the given files (default: frontend/**, vendor excluded)
 *   --dry       report what would change, write nothing
 *   --check     count remaining artefacts; exit 1 when any is left (gate mode)
 *   --report    list the per-file counts
 *
 * Exit status is non-zero on a refused/overlapping edit, a changed line count,
 * or - in `--check` mode - any surviving artefact.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { resolveBabelRoot } from './lib/babel-root.mjs';

const require = createRequire(import.meta.url);
const BABEL_ROOT = resolveBabelRoot();

const parser = require(`${BABEL_ROOT}/@babel/parser`);
const traverse = require(`${BABEL_ROOT}/@babel/traverse`).default;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FRONTEND = path.join(ROOT, 'frontend');

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // Third-party bundles stay byte-identical to upstream.
      if (entry.name === 'vendor') continue;
      yield* walk(full);
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      yield full;
    }
  }
}

/* ------------------------------------------------------------------ folding */

/** Value of a numeric-constant expression, or null when it is not one. */
function numericConstant(node) {
  if (!node) return null;
  if (node.type === 'NumericLiteral') return node.value;
  if (
    node.type === 'UnaryExpression' &&
    node.operator === '-' &&
    node.argument.type === 'NumericLiteral'
  ) {
    return -node.argument.value;
  }
  return null;
}

/** Value of a `!` chain applied to a numeric constant or boolean, else null. */
function booleanNotValue(node) {
  if (!node) return null;
  if (node.type === 'BooleanLiteral') return node.value;
  if (node.type !== 'UnaryExpression' || node.operator !== '!') return null;
  const inner = booleanNotValue(node.argument);
  if (inner !== null) return !inner;
  const numeric = numericConstant(node.argument);
  if (numeric !== null) return numeric === 0;
  return null;
}

function isHexLiteral(node) {
  const raw = node.extra?.raw;
  return typeof raw === 'string' && /^0[xX]/.test(raw);
}

/**
 * Plan the rewrites for one module: a list of non-overlapping byte ranges.
 * Counts are returned alongside so `--check` and `--dry` can report without
 * re-walking the tree.
 */
function planRewrites(code) {
  const ast = parser.parse(code, { sourceType: 'module', errorRecovery: false });
  const edits = [];
  const counts = { hex: 0, boolean: 0, infinity: 0, voidZero: 0 };

  const add = (node, text) => {
    edits.push({ start: node.start, end: node.end, text });
  };

  traverse(ast, {
    UnaryExpression(p) {
      const folded = booleanNotValue(p.node);
      if (folded !== null) {
        counts.boolean += 1;
        add(p.node, folded ? 'true' : 'false');
        p.skip();
        return;
      }
      if (p.node.operator === 'void' && numericConstant(p.node.argument) !== null) {
        counts.voidZero += 1;
        add(p.node, 'undefined');
        p.skip();
      }
    },
    BinaryExpression(p) {
      if (p.node.operator !== '/') return;
      const left = numericConstant(p.node.left);
      const right = numericConstant(p.node.right);
      if (left === null || right !== 0) return;
      counts.infinity += 1;
      add(p.node, left < 0 ? '-Infinity' : 'Infinity');
      p.skip();
    },
    NumericLiteral(p) {
      if (!isHexLiteral(p.node)) return;
      counts.hex += 1;
      const decimal = String(p.node.value);
      if (decimal !== p.node.extra.raw) add(p.node, decimal);
    },
  });

  // Outermost-most first, so a nested candidate is dropped rather than applied
  // on top of its own replacement.
  edits.sort((a, b) => a.start - b.start || b.end - a.end);
  const accepted = [];
  let cursor = -1;
  for (const edit of edits) {
    if (edit.start < cursor) continue;
    accepted.push(edit);
    cursor = edit.end;
  }

  return { edits: accepted, counts };
}

function applyRewrites(code, edits) {
  let output = '';
  let cursor = 0;
  for (const edit of edits) {
    let text = edit.text;
    // A splice is textual, so a replacement can fuse with a neighbour that had
    // no space to begin with: the obfuscator writes `return!1`, and replacing
    // `!1` with `false` yields the single identifier `returnfalse`.  Keep the
    // two tokens apart whenever the fusion would be lexically possible.
    const before = code[edit.start - 1];
    if (before && /[A-Za-z0-9_$]/.test(before) && /[A-Za-z_$]/.test(text[0])) {
      text = ` ${text}`;
    }
    const after = code[edit.end];
    if (after && /[A-Za-z0-9_$]/.test(after) && /[A-Za-z0-9_$]/.test(text[text.length - 1])) {
      text = `${text} `;
    }
    output += code.slice(cursor, edit.start) + text;
    cursor = edit.end;
  }
  output += code.slice(cursor);
  return output;
}

/* ------------------------------------------------------------------- driver */

const args = process.argv.slice(2);
const dry = args.includes('--dry');
const check = args.includes('--check');
const report = args.includes('--report');
const explicit = args.filter((a) => !a.startsWith('--')).map((a) => path.resolve(a));

const files =
  explicit.length > 0
    ? explicit.flatMap((target) =>
        fs.statSync(target).isDirectory() ? [...walk(target)].sort() : [target],
      )
    : [...walk(FRONTEND)].sort();

const totals = { hex: 0, boolean: 0, infinity: 0, voidZero: 0 };
const perFile = [];
let changedFiles = 0;
let failures = 0;

for (const file of files) {
  const code = fs.readFileSync(file, 'utf8');
  let planned;
  try {
    planned = planRewrites(code);
  } catch (error) {
    console.log(`PARSEFAIL ${path.relative(ROOT, file)} :: ${error.message}`);
    failures += 1;
    continue;
  }
  const { edits, counts } = planned;
  for (const key of Object.keys(totals)) totals[key] += counts[key];

  if (edits.length === 0) continue;
  changedFiles += 1;
  if (report) {
    perFile.push({ rel: path.relative(ROOT, file), ...counts, edits: edits.length });
  }
  if (check) continue;

  const output = applyRewrites(code, edits);
  if (output.split('\n').length !== code.split('\n').length) {
    console.log(`FAIL ${path.relative(ROOT, file)} :: line count changed`);
    failures += 1;
    continue;
  }
  if (!dry) fs.writeFileSync(file, output);
}

if (report) {
  perFile.sort((a, b) => b.edits - a.edits);
  for (const entry of perFile) {
    console.log(
      `${String(entry.hex).padStart(6)} ${String(entry.boolean).padStart(6)} ` +
        `${String(entry.infinity).padStart(5)} ${String(entry.voidZero).padStart(5)}  ${entry.rel}`,
    );
  }
  console.log('# columns: hex  not  infinity  void  file');
}

const remaining = totals.hex + totals.boolean + totals.infinity + totals.voidZero;
console.log(
  `# hex=${totals.hex} not=${totals.boolean} infinity=${totals.infinity} ` +
    `void=${totals.voidZero} files-changed=${changedFiles} failures=${failures}`,
);

if (failures > 0) process.exitCode = 1;
else if (check && remaining > 0) {
  console.error('# gate failed: literal artefacts remain');
  process.exitCode = 1;
}
