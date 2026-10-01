/**
 * Inventory the *residual mechanical names* left over from de-obfuscation.
 *
 * The `_0x` obfuscation is already gone (see `verify_all.sh` checks 5-8), but
 * the de-obfuscation pipeline renamed every lexical binding mechanically:
 * `webcrack` produced generic identifiers and `rename_frontend_locals.mjs`
 * replaced them with role names plus a counter (`value1234`, `arg56`, `fn7`,
 * `element9`).  Those names parse and run fine; they are simply unreadable.
 *
 * This tool measures the size of that remaining job.  It counts *bindings*
 * (not occurrences) so the number reflects how many names a human has to
 * invent, and it splits them into three buckets:
 *
 *   - `mechanical`  role + counter, emitted by the rename pass  -> must reach 0
 *   - `short`       one- or two-character bindings that survived the earlier
 *                   passes (`const O = (a, b) => ...`)         -> should reach 0
 *   - `semantic`    anything else, assumed to carry meaning     -> keep
 *
 * Exported bindings are reported separately: they are the public API and must
 * NOT be renamed, so they are excluded from the "work remaining" figure.
 *
 * Usage:
 *   node tools/report_frontend_names.mjs [--json] [--max-mechanical N] [path ...]
 *
 * `--max-mechanical N` turns the report into a gate: exit 1 when the total
 * mechanical count exceeds N.  Without it the tool is purely informational.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const BABEL_ROOT = resolveBabelRoot();

const parser = require(`${BABEL_ROOT}/@babel/parser`);
const traverse = require(`${BABEL_ROOT}/@babel/traverse`).default;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FRONTEND = path.join(ROOT, 'frontend');

import { classifyName } from './lib/name-buckets.mjs';
import { exportedLocalNames } from './lib/exported-names.mjs';
import { resolveBabelRoot } from './lib/babel-root.mjs';

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // Third-party code stays byte-identical to upstream: out of scope.
      if (entry.name === 'vendor') continue;
      yield* walk(full);
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      yield full;
    }
  }
}

function parse(code) {
  return parser.parse(code, { sourceType: 'module', errorRecovery: false });
}

/** Collect the unique lexical bindings of one module, split into buckets. */
function analyze(code) {
  const ast = parse(code);

  /** Bindings exported by this module: the public API, frozen by policy. */
  const exported = exportedLocalNames(ast);

  const seen = new Set();
  const byName = new Map();

  traverse(ast, {
    Scopable(p) {
      for (const [name, binding] of Object.entries(p.scope.bindings)) {
        const declaration = binding.identifier;
        if (!declaration || declaration.start === undefined) continue;
        // The same name can be bound in several scopes; count each declaration.
        const key = `${name}@${declaration.start}`;
        if (seen.has(key)) continue;
        seen.add(key);
        byName.set(key, {
          name,
          line: declaration.loc ? declaration.loc.start.line : null,
          exported: exported.has(name),
        });
      }
    },
  });

  return { bindings: [...byName.values()], exported };
}

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const maxIndex = args.indexOf('--max-mechanical');
const maxMechanical = maxIndex >= 0 ? Number(args[maxIndex + 1]) : null;
// Only the *value* of an option is a non-path.  Guard on `maxIndex >= 0`:
// without it the sentinel `-1 + 1 = 0` marks the first positional argument as
// an option value, so `report_frontend_names.mjs <file>` silently analysed the
// whole repository instead of the file it was asked about.
const optionValueIndexes = new Set();
if (maxIndex >= 0) optionValueIndexes.add(maxIndex + 1);
const explicit = args
  .filter((a, i) => !a.startsWith('--') && !optionValueIndexes.has(i))
  .map((a) => path.resolve(a));

const files =
  explicit.length > 0
    ? explicit.flatMap((target) =>
        fs.statSync(target).isDirectory() ? [...walk(target)].sort() : [target]
      )
    : [...walk(FRONTEND)].sort();

const perFile = [];
const totals = { mechanical: 0, short: 0, semantic: 0, exportedFrozen: 0 };
let parseFailures = 0;

for (const file of files) {
  const rel = path.relative(ROOT, file);
  let result;
  try {
    result = analyze(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    parseFailures += 1;
    console.log(`PARSEFAIL ${rel} :: ${error.message}`);
    continue;
  }

  const counts = { mechanical: 0, short: 0, semantic: 0 };
  /** @type {string[]} */
  const samples = [];
  for (const binding of result.bindings) {
    // Go through classifyName, never the regexes directly: this site used to
    // import MECHANICAL_RE/SHORT_RE and re-derive the decision, so every rule
    // added to the classifier afterwards was silently ignored here.  That is
    // how ~9,000 `v10`-style bindings in the minified giants stayed filed as
    // "semantic" and out of the work-remaining figure.
    const bucket = classifyName(binding.name);
    counts[bucket] += 1;
    if (bucket !== 'semantic' && samples.length < 12) samples.push(binding.name);
  }

  const frozen = result.bindings.filter((b) => b.exported).length;
  totals.mechanical += counts.mechanical;
  totals.short += counts.short;
  totals.semantic += counts.semantic;
  totals.exportedFrozen += frozen;

  if (counts.mechanical > 0 || counts.short > 0) {
    perFile.push({ rel, ...counts, frozen, samples });
  }
}

perFile.sort(
  (a, b) => b.mechanical + b.short - (a.mechanical + a.short) || a.rel.localeCompare(b.rel)
);

if (asJson) {
  console.log(JSON.stringify({ totals, parseFailures, files: perFile }, null, 2));
} else {
  console.log('# residual mechanical names (bindings, vendor excluded)');
  console.log(
    `# files=${files.length} with-residue=${perFile.length} ` +
      `mechanical=${totals.mechanical} short=${totals.short} ` +
      `semantic=${totals.semantic} exported-frozen=${totals.exportedFrozen} ` +
      `parse-failures=${parseFailures}`
  );
  console.log('');
  const width = Math.max(...perFile.map((f) => f.rel.length), 4);
  for (const entry of perFile) {
    console.log(
      `${String(entry.mechanical).padStart(7)} ${String(entry.short).padStart(5)} ` +
        `${String(entry.frozen).padStart(6)}  ${entry.rel.padEnd(width)}  ` +
        `${entry.samples.slice(0, 6).join(', ')}`
    );
  }
  console.log('');
  console.log('# columns: mechanical  short  exported(frozen)  file  sample names');
}

if (parseFailures > 0) process.exitCode = 1;
else if (maxMechanical !== null && totals.mechanical > maxMechanical) {
  console.error(
    `# gate failed: mechanical=${totals.mechanical} exceeds --max-mechanical ${maxMechanical}`
  );
  process.exitCode = 1;
}
