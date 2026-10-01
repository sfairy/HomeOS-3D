#!/usr/bin/env node
/**
 * Locate the un-obfuscated source a bundled frontend file was built from.
 *
 * The released frontend under `frontend/` is an esbuild output: identifiers were
 * renamed to `arg1`/`value3`/`fn2` and the original names are gone.  But the
 * author's TypeScript tree still exists beside the workspace, at
 * `../homeos-3d/frontend/src`, and for many modules the emitted file is a
 * near-symbol-for-symbol copy of its source: same declarations, same order, same
 * literal initialisers, only the names differ.  Reviewers kept rediscovering
 * this by hand (batch 17 alone: `range-dialog`, `popup-layout`, `scene-frame`,
 * `studio-car-finish`) and each discovery turned "invent a name" into "look up
 * the author's name".
 *
 * This tool automates the discovery step.  It cannot prove identity - a bundled
 * file may be a fusion of several sources, or a hand-edited fork - so it reports
 * candidates with a score rather than one answer, and the reviewer stays the
 * judge.  The score is the shape of the binding sequence:
 *
 *   - each binding contributes a token describing its initialiser
 *     (`set`, `map`, `boolean`, `function`, `elementish`, `array`, `other`, ...),
 *   - the two token sequences are compared with an LCS,
 *   - score = 2*LCS / (len(a) + len(b)).
 *
 * Shape alone is weak (a thousand functions look alike), so the basename is a
 * hard filter first and the score only *ranks* files that already share a name.
 * A same-named file scoring above ~0.6 is almost always the source; below ~0.3
 * it is almost always a coincidence and is reported as such.
 *
 * Usage:
 *   node tools/find_reference_source.mjs <frontend/....js> [--ref <srcRoot>] [--json]
 *
 * `--ref` defaults to the sibling checkout, and may be repeated to search
 * several trees.  When no source tree is present the tool says so and exits 0 -
 * a missing reference is not an error, it only means this file must be named by
 * reading it.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import { resolveBabelRoot } from './lib/babel-root.mjs';
import { classifyName } from './lib/name-buckets.mjs';
import { exportedLocalNames } from './lib/exported-names.mjs';

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE = path.resolve(HERE, '..');
const DEFAULT_REF = path.resolve(WORKSPACE, '../homeos-3d/frontend/src');

function argValues(name) {
  const out = [];
  process.argv.forEach((a, i) => {
    if (a === name && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')) out.push(process.argv[i + 1]);
  });
  return out;
}
function argValue(name, fallback) {
  const v = argValues(name);
  return v.length > 0 ? v[v.length - 1] : fallback;
}

function loadBabel() {
  const root = resolveBabelRoot();
  const parser = require(path.join(root, '@babel/parser'));
  const traverseMod = require(path.join(root, '@babel/traverse'));
  return { parser, traverse: traverseMod.default || traverseMod };
}

const { parser, traverse } = loadBabel();

/** Parse a file, tolerating both plain JS and TS syntax. */
function parseBoth(code, filePath) {
  const isTs = /\.tsx?$/.test(filePath);
  const attempts = isTs
    ? [{ sourceType: 'module', plugins: ['typescript', 'jsx'] }, { sourceType: 'module', plugins: ['typescript'] }]
    : [{ sourceType: 'module', plugins: ['jsx'] }, { sourceType: 'module' }];
  let lastError;
  for (const opts of attempts) {
    try {
      return parser.parse(code, { ...opts, errorRecovery: false });
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

const SHAPE_BY_CALLEE = new Map([
  ['Set', 'set'],
  ['WeakSet', 'set'],
  ['Map', 'map'],
  ['WeakMap', 'map'],
  ['Float32Array', 'array'],
  ['Float64Array', 'array'],
  ['Int32Array', 'array'],
  ['Uint16Array', 'array'],
  ['Uint8Array', 'array'],
  ['Uint8ClampedArray', 'array'],
  ['Array', 'array'],
  ['Promise', 'promise'],
  ['Date', 'other'],
  ['Error', 'other'],
  ['TypeError', 'other'],
]);
const BOOLEAN_METHODS = new Set(['includes', 'startsWith', 'endsWith', 'test', 'isFinite', 'isInteger', 'isArray']);
const ELEMENT_METHODS = new Set(['createElement', 'getElementById', 'querySelector', 'querySelectorAll']);

/**
 * One token per binding initialiser.
 *
 * Deliberately coarse.  A finer description (say, the full initialiser source)
 * would refuse to match the moment the emitted file folds a constant or hoists a
 * helper, which esbuild does freely; a coarser one still holds the *sequence* of
 * declarations steady, and that sequence is what identifies the file.
 */
function shapeOfInit(node) {
  if (!node) return 'none';
  switch (node.type) {
    case 'BooleanLiteral':
      return 'boolean';
    case 'StringLiteral':
      return 'string';
    case 'NumericLiteral':
      return 'number';
    case 'NullLiteral':
      return 'null';
    case 'TemplateLiteral':
      return 'string';
    case 'ArrayExpression':
      return 'array';
    case 'ObjectExpression':
      return 'object';
    case 'ArrowFunctionExpression':
    case 'FunctionExpression':
    case 'ClassExpression':
      return 'function';
    case 'NewExpression': {
      const name = node.callee && node.callee.type === 'Identifier' ? node.callee.name : '';
      return SHAPE_BY_CALLEE.get(name) || 'other';
    }
    case 'UnaryExpression':
      return node.operator === '!' ? 'boolean' : 'other';
    case 'BinaryExpression':
      return ['===', '!==', '==', '!=', '<', '>', '<=', '>=', 'in', 'instanceof'].includes(node.operator)
        ? 'boolean'
        : 'other';
    case 'LogicalExpression':
      return node.operator === '||' || node.operator === '&&' ? 'other' : 'other';
    case 'CallExpression': {
      const callee = node.callee;
      if (callee && callee.type === 'Identifier') return 'call';
      if (callee && callee.type === 'MemberExpression' && !callee.computed && callee.property.type === 'Identifier') {
        const prop = callee.property.name;
        const objectName = callee.object && callee.object.type === 'Identifier' ? callee.object.name : '';
        if (objectName === 'document' && ELEMENT_METHODS.has(prop)) return 'elementish';
        if (BOOLEAN_METHODS.has(prop)) return 'boolean';
        if (prop === 'slice' || prop === 'splice' || prop === 'concat' || prop === 'filter' || prop === 'map') return 'array';
      }
      return 'call';
    }
    default:
      return 'other';
  }
}

/** The ordered shape tokens of a file's residue bindings, plus its total. */
function shapeSequence(ast) {
  const seen = new Set();
  const tokens = [];
  let allBindings = 0;
  traverse(ast, {
    Scopable(p) {
      for (const [name, binding] of Object.entries(p.scope.bindings)) {
        allBindings += 1;
        if (classifyName(name) === 'semantic' || classifyName(name) === 'frozen') continue;
        const id = binding.identifier;
        if (!id || !id.loc) continue;
        const key = name + '@' + id.loc.start.line;
        if (seen.has(key)) continue;
        seen.add(key);
        const declarator =
          binding.path && binding.path.node && binding.path.node.type === 'VariableDeclarator' ? binding.path.node : null;
        tokens.push(shapeOfInit(declarator ? declarator.init : null));
      }
    },
  });
  return { tokens, residue: tokens.length, total: allBindings };
}

/**
 * Reference files carry author names, so there is no residue to key off.  The
 * comparison therefore uses *all* their bindings, in declaration order, which is
 * the same order the emitted file's declarations appear in.
 */
function allShapeSequence(ast) {
  const seen = new Set();
  const tokens = [];
  let total = 0;
  traverse(ast, {
    Scopable(p) {
      for (const [name, binding] of Object.entries(p.scope.bindings)) {
        total += 1;
        const id = binding.identifier;
        if (!id || !id.loc) continue;
        const key = name + '@' + id.loc.start.line;
        if (seen.has(key)) continue;
        seen.add(key);
        const declarator =
          binding.path && binding.path.node && binding.path.node.type === 'VariableDeclarator' ? binding.path.node : null;
        tokens.push(shapeOfInit(declarator ? declarator.init : null));
      }
    },
  });
  return { tokens, residue: 0, total };
}

function lcsLength(a, b) {
  if (a.length === 0 || b.length === 0) return 0;
  // Rolling row: the sequences here are hundreds of tokens, not millions.
  let previous = new Uint32Array(b.length + 1);
  let current = new Uint32Array(b.length + 1);
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = a[i - 1] === b[j - 1] ? previous[j - 1] + 1 : Math.max(previous[j], current[j - 1]);
    }
    const swap = previous;
    previous = current;
    current = swap;
    current.fill(0);
  }
  return previous[b.length];
}

/**
 * The LCS alignment itself, as pairs of indices, so a proposal can name the
 * binding a reference name belongs to rather than just counting the match.
 */
function lcsPairs(a, b) {
  const rows = a.length;
  const cols = b.length;
  if (rows === 0 || cols === 0) return [];
  const table = [];
  for (let i = 0; i <= rows; i += 1) table.push(new Uint32Array(cols + 1));
  for (let i = 1; i <= rows; i += 1) {
    for (let j = 1; j <= cols; j += 1) {
      table[i][j] =
        a[i - 1] === b[j - 1] ? table[i - 1][j - 1] + 1 : Math.max(table[i - 1][j], table[i][j - 1]);
    }
  }
  const pairs = [];
  let i = rows;
  let j = cols;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      pairs.push([i - 1, j - 1]);
      i -= 1;
      j -= 1;
    } else if (table[i - 1][j] >= table[i][j - 1]) {
      i -= 1;
    } else {
      j -= 1;
    }
  }
  pairs.reverse();
  return pairs;
}

/**
 * Ordered bindings of a file: `{ key, name, shape }`, by position in the source.
 *
 * Declaration order is the whole basis of the alignment, and `traverse` visits
 * scopes outermost-first rather than in source order, so the list is sorted by
 * the identifier's offset.  Two bindings that start at the same offset (a
 * destructuring pattern) keep a stable order.
 */
function orderedBindings(ast, code, { residueOnly, seen, exclude }) {
  const collected = [];
  traverse(ast, {
    Scopable(p) {
      for (const [name, binding] of Object.entries(p.scope.bindings)) {
        if (residueOnly) {
          const bucket = classifyName(name);
          if (bucket === 'semantic' || bucket === 'frozen') continue;
          // An exported binding is frozen public API: the renamer refuses it, so
          // proposing a name for it would produce a map that cannot apply.
          if (exclude && exclude.has(name)) continue;
        }
        const id = binding.identifier;
        if (!id || id.start === undefined || !id.loc) continue;
        const key = name + '@' + id.loc.start.line;
        if (seen.has(key)) continue;
        seen.add(key);
        const declarator =
          binding.path && binding.path.node && binding.path.node.type === 'VariableDeclarator' ? binding.path.node : null;
        collected.push({ key, name, shape: shapeOfInit(declarator ? declarator.init : null), start: id.start });
      }
    },
  });
  collected.sort((a, b) => a.start - b.start);
  return collected;
}

function shapeScore(a, b) {
  if (a.length === 0 || b.length === 0) return 0;
  return (2 * lcsLength(a, b)) / (a.length + b.length);
}

function walkSource(root, wantBasename, out) {
  let entries;
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) {
      walkSource(full, wantBasename, out);
      continue;
    }
    const stem = entry.name.replace(/\.tsx?$/, '');
    if (stem !== wantBasename) continue;
    out.push(full);
  }
}

/**
 * Turn a reference source into a candidate rename map for the emitted file.
 *
 * The alignment is positional, so a single shifted declaration mis-assigns every
 * name after it.  That is why the output is a *proposal* and every entry carries
 * the evidence that produced it: a reviewer (or a naming agent) is expected to
 * confirm entries against the emitted file rather than trust the map.  The one
 * structural guarantee it does give is coverage - the key set is exactly the
 * residue, so a filled-in proposal cannot leave a binding behind.
 *
 * A proposed name is dropped, and reported, when it would be a lie:
 *   - the reference name is itself mechanical (`arg7` in the source too),
 *   - the shape of the matched pair disagrees (`set` vs `boolean`),
 *   - two emitted bindings claim the same reference name,
 *   - the reference name already exists in the emitted file as a different binding.
 */
function proposeMap(targetPath, referencePath) {
  const targetCode = fs.readFileSync(targetPath, 'utf8');
  const referenceCode = fs.readFileSync(referencePath, 'utf8');
  const targetAst = parseBoth(targetCode, targetPath);
  const referenceAst = parseBoth(referenceCode, referencePath);

  const emitted = orderedBindings(targetAst, targetCode, {
    residueOnly: true,
    seen: new Set(),
    exclude: exportedLocalNames(targetAst),
  });
  const reference = orderedBindings(referenceAst, referenceCode, { residueOnly: false, seen: new Set() });

  const pairs = lcsPairs(
    emitted.map((e) => e.shape),
    reference.map((r) => r.shape),
  );

  const proposal = {};
  const notes = [];
  const takenNames = new Map();
  for (const binding of emitted) proposal[binding.key] = '';

  // Names already used in the emitted file cannot be handed to a second binding.
  const existing = new Set();
  traverse(targetAst, {
    Scopable(p) {
      for (const name of Object.keys(p.scope.bindings)) existing.add(name);
    },
  });
  for (const binding of emitted) existing.delete(binding.name);

  const proposedBy = new Map();
  for (const [emittedIndex, referenceIndex] of pairs) {
    const left = emitted[emittedIndex];
    const right = reference[referenceIndex];
    const referenceBucket = classifyName(right.name);
    if (proposal[left.key] !== '') continue;
    if (referenceBucket === 'mechanical' || referenceBucket === 'short') {
      notes.push('kept empty (reference name "' + right.name + '" is mechanical too): ' + left.key);
      continue;
    }
    if (left.shape !== right.shape) {
      notes.push(
        'kept empty (shape disagrees: emitted ' + left.shape + ' vs reference ' + right.shape + '): ' + left.key,
      );
      continue;
    }
    if (proposedBy.has(right.name)) {
      notes.push('kept empty (reference name "' + right.name + '" already claimed by ' + proposedBy.get(right.name) + '): ' + left.key);
      continue;
    }
    if (existing.has(right.name)) {
      notes.push('kept empty (name "' + right.name + '" already exists in the emitted file): ' + left.key);
      continue;
    }
    proposal[left.key] = right.name;
    proposedBy.set(right.name, left.key);
    takenNames.set(right.name, left.key);
  }

  const filled = Object.values(proposal).filter((v) => v !== '').length;
  return {
    emitted,
    reference,
    pairs: pairs.length,
    proposal,
    notes,
    filled,
    empty: emitted.length - filled,
  };
}

/** Find and score every same-named source file under the given roots. */
function analyze(targetPath, searchRoots) {
  const basename = path.basename(targetPath).replace(/\.js$/, '');
  const targetCode = fs.readFileSync(targetPath, 'utf8');
  const targetShape = shapeSequence(parseBoth(targetCode, targetPath));

  const found = [];
  for (const root of searchRoots) walkSource(root, basename, found);

  const candidates = [];
  for (const candidatePath of found) {
    let code;
    try {
      code = fs.readFileSync(candidatePath, 'utf8');
    } catch {
      continue;
    }
    let shape;
    try {
      shape = allShapeSequence(parseBoth(code, candidatePath));
    } catch {
      candidates.push({ path: candidatePath, score: 0, referenceBindings: 0, parse: 'failed' });
      continue;
    }
    candidates.push({
      path: candidatePath,
      score: Number(shapeScore(targetShape.tokens, shape.tokens).toFixed(3)),
      residueShapes: targetShape.residue,
      referenceBindings: shape.total,
    });
  }
  candidates.sort((a, b) => b.score - a.score);
  return { targetShape, candidates };
}

function proposeOne(targetPath, presentRoots, minScore) {
  const rel = path.relative(WORKSPACE, targetPath);
  const { targetShape, candidates } = analyze(targetPath, presentRoots);
  const best = candidates[0];
  if (!best || best.score < minScore) {
    return {
      rel,
      reference: null,
      score: best ? best.score : 0,
      residue: targetShape.residue,
      filled: 0,
      empty: targetShape.residue,
      proposal: null,
      notes: [],
    };
  }
  const result = proposeMap(targetPath, best.path);
  return {
    rel,
    reference: path.relative(WORKSPACE, best.path),
    score: best.score,
    residue: result.emitted.length,
    filled: result.filled,
    empty: result.empty,
    proposal: result.proposal,
    notes: result.notes,
  };
}

function main() {
  const positional = process.argv.slice(2).filter((a, i, all) => {
    if (a.startsWith('--')) return false;
    return !(i > 0 && all[i - 1].startsWith('--'));
  });
  if (positional.length === 0) {
    console.error(
      'usage: find_reference_source.mjs <frontend/....js> [...] [--ref <srcRoot>] [--propose] [--out <file>] [--out-dir <dir>] [--json] [--min-score 0.6]',
    );
    process.exit(2);
  }
  const roots = argValues('--ref');
  const searchRoots = roots.length > 0 ? roots : [DEFAULT_REF];
  const presentRoots = searchRoots.filter((r) => fs.existsSync(r));
  const asJson = process.argv.includes('--json');
  const propose = process.argv.includes('--propose');
  const outPath = argValue('--out', '');
  const outDir = argValue('--out-dir', '');
  const minScore = Number(argValue('--min-score', '0.6'));

  if (presentRoots.length === 0) {
    if (asJson) {
      console.log(JSON.stringify({ files: [], note: 'no reference source tree found', searched: searchRoots }, null, 2));
    } else {
      console.log('# no reference source tree at: ' + searchRoots.join(', '));
      console.log('# these files have no original to consult - name them by reading them');
    }
    process.exit(0);
  }

  const targets = positional.map((t) => (path.isAbsolute(t) ? t : path.resolve(WORKSPACE, t)));

  // A single file stays in the human-readable form; several files are a report.
  if (!propose && targets.length === 1) {
    const targetPath = targets[0];
    const { targetShape, candidates } = analyze(targetPath, presentRoots);
    const rel = path.relative(WORKSPACE, targetPath);
    if (asJson) {
      console.log(JSON.stringify({ rel, residueShapes: targetShape.residue, candidates }, null, 2));
      return;
    }
    console.log('# ' + rel);
    console.log('# residue bindings ' + targetShape.residue + ' of ' + targetShape.total);
    if (candidates.length === 0) console.log('# no same-named source file under: ' + presentRoots.join(', '));
    for (const c of candidates) {
      const verdict = c.score >= 0.6 ? 'LIKELY SOURCE' : c.score >= 0.3 ? 'possible' : 'probably coincidence';
      console.log(
        '  ' + c.score.toFixed(3) + '  ' + verdict + '  ' + path.relative(WORKSPACE, c.path) +
          '  (ref bindings ' + c.referenceBindings + ')',
      );
    }
    return;
  }

  const reports = targets.map((t) => proposeOne(t, presentRoots, minScore));

  if (propose) {
    if (outPath && targets.length === 1) {
      const only = reports[0];
      if (only.proposal) {
        fs.writeFileSync(path.resolve(WORKSPACE, outPath), JSON.stringify({ [only.rel]: only.proposal }, null, 2) + '\n');
      }
    }
    if (outDir) {
      const dir = path.resolve(WORKSPACE, outDir);
      fs.mkdirSync(dir, { recursive: true });
      for (const report of reports) {
        if (!report.proposal) continue;
        const stem = report.rel.replace(/^frontend\//, '').replace(/[\\/]/g, '--').replace(/\.js$/, '');
        fs.writeFileSync(path.join(dir, stem + '.json'), JSON.stringify({ [report.rel]: report.proposal }, null, 2) + '\n');
      }
    }
    if (asJson) {
      console.log(JSON.stringify({ files: reports }, null, 2));
      return;
    }
    let totalResidue = 0;
    let totalFilled = 0;
    for (const report of reports) {
      totalResidue += report.residue;
      totalFilled += report.filled;
      const pct = report.residue > 0 ? Math.round((report.filled / report.residue) * 100) : 0;
      const ref = report.reference ? report.reference + '  ' + report.score.toFixed(3) : 'NO REFERENCE (>= ' + minScore + ')';
      console.log(
        String(report.filled).padStart(4) + '/' + String(report.residue).padEnd(4) + ' ' + String(pct).padStart(3) +
          '%  ' + report.rel + '\n              ' + ref,
      );
    }
    const pct = totalResidue > 0 ? Math.round((totalFilled / totalResidue) * 100) : 0;
    console.log(
      '# proposed ' + totalFilled + '/' + totalResidue + ' (' + pct + '%) across ' + reports.length + ' file(s); ' +
        (outDir ? 'maps written to ' + outDir : 'no --out-dir given'),
    );
    return;
  }

  if (asJson) {
    console.log(JSON.stringify({ files: reports }, null, 2));
    return;
  }
  for (const report of reports) {
    console.log(
      report.rel + '  ' + (report.reference ? report.reference + '  ' + report.score.toFixed(3) : 'NO REFERENCE'),
    );
  }
}

main();
