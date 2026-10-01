#!/usr/bin/env node
/**
 * Fold obfuscator-style computed member access back onto the dot form.
 *
 * The obfuscator spells every property access `obj["prop"]`, and removing its
 * *machinery* (the `_0x…` decoder, the string array, the rotation) left that
 * spelling everywhere, because it parses and runs identically.  It is still
 * residue: it hides the property from a plain `grep prop`, it makes the source
 * louder than the program is, and it defeats the rename tooling, which refuses
 * to touch a computed member or key by design.
 *
 * The rewrite is *value-preserving by construction*.  For a string `s`,
 * `obj[s]` and `obj.s` are the same property access whenever `s` is an
 * IdentifierName: the language runs ToPropertyKey on both, and the production
 * after `.` is an IdentifierName rather than an Identifier, so reserved words
 * are fine (`obj.default`, `obj.class`, `obj.new`).  Nothing is rewritten
 * where that identity does not hold:
 *
 *   obj["a-b"]      not an IdentifierName - `obj.a-b` does not parse
 *   obj[key]        the property is an expression, not a literal
 *   obj["汉字"]     a valid IdentifierName, but kept: the escape hatch is what
 *                   makes a deliberately exotic key visible
 *   obj[""]         empty name
 *   1["toString"]   `1.toString` is a syntax error, so the object matters
 *   obj?.["prop"]   -> obj?.prop, which is the same short-circuit
 *
 * Edits are byte-range splices, like `apply_frontend_renames.mjs`: comments,
 * indentation, quote style and the `?v=…` cache strings are untouched, and the
 * line count is asserted to be unchanged so a diff stays reviewable.  When a
 * long chain made the formatter wrap the brackets across a line break, the
 * splice splits into three - drop `[`, dot the property, drop `]` - so the
 * line count still holds; a bracket pair holding anything else a splice cannot
 * respect is refused outright and reported as `refused=`.
 *
 * Usage:
 *   node tools/normalize_frontend_members.mjs [--dry] [--check] [--report] [path …]
 *
 *   (no flag)   rewrite the given files (default: frontend/**, vendor excluded)
 *   --dry       report what would change, write nothing
 *   --check     count remaining sites; exit 1 when any is left (gate mode)
 *   --report    list the per-file counts
 *
 * Exit status is non-zero on a refused/overlapping edit, a changed line count,
 * or - in `--check` mode - any surviving site.
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

/** A property name the `.` form can spell verbatim. */
const IDENTIFIER_NAME_RE = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

/** `1 .toString` is legal, `1.toString` is not - leave those objects alone. */
const NUMERIC_OBJECTS = new Set(['NumericLiteral', 'BigIntLiteral', 'DecimalLiteral']);

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

/**
 * The splices that fold one computed member access, or null when this site is
 * not safely foldable.  The `[…]` wrapper is located by stepping outward from
 * the literal over whitespace only, so a bracket pair that also holds a comment
 * refuses the rewrite instead of being deleted by guesswork.
 */
function planSite(code, node) {
  const prop = node.property;
  if (prop.type !== 'StringLiteral') return null;
  if (typeof prop.extra?.raw !== 'string') return null;
  if (!IDENTIFIER_NAME_RE.test(prop.value)) return null;
  if (NUMERIC_OBJECTS.has(node.object.type)) return null;

  let open = prop.start - 1;
  while (open > 0 && /\s/.test(code[open])) open -= 1;
  if (code[open] !== '[') return null;
  let close = prop.end;
  while (close < code.length && /\s/.test(code[close])) close += 1;
  if (code[close] !== ']') return null;

  // `obj?.["prop"]` already carries its dot inside the `?.` token, so the
  // property name replaces the brackets outright rather than getting a second
  // dot: folding it as `.prop` would yield the unparsable `obj?..prop`.
  const dotted = node.optional ? prop.value : `.${prop.value}`;
  if (!code.slice(open, close).includes('\n')) {
    // One splice takes the whole `["name"]` wrapper.
    return [{ start: open, end: close + 1, text: dotted }];
  }
  // The wrapper straddles a line break, so the property keeps its own line and
  // only the two brackets go.  `expr\n  .name\n  (...)` parses, and the
  // formatter re-wraps the chain afterwards.
  return [
    { start: open, end: open + 1, text: '' },
    { start: prop.start, end: prop.end, text: dotted },
    { start: close, end: close + 1, text: '' },
  ];
}

/**
 * Plan the rewrites for one module: a list of non-overlapping byte ranges.
 * Counts are returned alongside so `--check` and `--dry` can report without
 * re-walking the tree.
 */
function planRewrites(code) {
  const ast = parser.parse(code, { sourceType: 'module', errorRecovery: false });
  const edits = [];
  const counts = { member: 0, refused: 0 };

  traverse(ast, {
    'MemberExpression|OptionalMemberExpression'(p) {
      const node = p.node;
      if (!node.computed) return;
      if (node.property.type !== 'StringLiteral') return;
      if (!IDENTIFIER_NAME_RE.test(node.property.value)) return;
      const splices = planSite(code, node);
      if (!splices) {
        counts.refused += 1;
        return;
      }
      counts.member += 1;
      edits.push(...splices);
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
    // no space to begin with: `obj["x"]instanceof Y` parses today, and after
    // the wrapper goes it would read `xinstanceof`.  The leading `.` can never
    // fuse with what precedes it, so only the trailing side needs a guard.
    const after = code[edit.end];
    if (text && after && /[A-Za-z0-9_$]/.test(text[text.length - 1]) && /[A-Za-z0-9_$]/.test(after)) {
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

const totals = { member: 0, refused: 0 };
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
  // The rewrite is only sound if the result is still a program, so every splice
  // is handed back to the parser before it is written.  This guard is why the
  // `obj?.["x"]` fold is caught rather than shipped: the leading `.` of the
  // ordinary form is wrong when the `?.` token already ends in one.
  try {
    parser.parse(output, { sourceType: 'module', errorRecovery: false });
  } catch (error) {
    console.log(`FAIL ${path.relative(ROOT, file)} :: output does not parse :: ${error.message}`);
    failures += 1;
    continue;
  }
  if (!dry) fs.writeFileSync(file, output);
}

if (report) {
  perFile.sort((a, b) => b.edits - a.edits);
  for (const entry of perFile) {
    console.log(`${String(entry.member).padStart(6)} ${String(entry.refused).padStart(6)}  ${entry.rel}`);
  }
  console.log('# columns: members  refused  file');
}

const remaining = totals.member;
console.log(
  `# members=${totals.member} refused=${totals.refused} files-changed=${changedFiles} ` +
    `failures=${failures} files-scanned=${files.length}`,
);

if (failures > 0) process.exitCode = 1;
else if (check && remaining > 0) {
  console.error('# gate failed: computed member access remains');
  process.exitCode = 1;
}
