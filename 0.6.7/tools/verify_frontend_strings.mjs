/**
 * Detect string loss introduced by the de-obfuscation pipeline.
 *
 * `tools/verify_frontend_rename.mjs` proves the *local-variable rename* pass is
 * alpha-equivalent, but it compares the post-`webcrack` tree against the
 * post-rename tree, so it cannot see damage done by `webcrack` itself.  This
 * tool closes that gap by going back to the original obfuscated source.
 *
 * obfuscator.io moves every string literal into a string array and replaces it
 * with `_0xDECODER(0xNNN)`.  The strings that actually matter are therefore
 * exactly the *results of those decoder calls* — not the raw literals in the
 * file, which are mostly the string array itself plus the rotation IIFE's own
 * control data (`"push"`, `"shift"`, `"986064epKVVd"`, ...).
 *
 * For every file this tool:
 *
 *   1. runs the array getter, the decoder and the rotation IIFE inside a
 *      sandbox, exactly as the obfuscator's runtime does at load time;
 *   2. resolves every decoder call site in the original AST to the string it
 *      really returns;
 *   3. checks that each of those strings is still present in the de-obfuscated
 *      file.
 *
 * A missing string means `webcrack` failed to inline it faithfully.  Only calls
 * whose callee is a known decoder are considered; the module's many other
 * `_0x...(...)` calls are ordinary obfuscated functions.
 *
 * A *changed* string - one that survives in the file but fewer times than the
 * original had decoder calls for it - is reported but does NOT fail: the pipeline
 * itself legitimately removes literals, because `tools/normalize_frontend_members.mjs`
 * rewrites `obj["className"]` to `obj.className`.  On a clean tree that is already
 * 490 entries across 85 files, so it can only ever be a drift *diagnostic*.
 *
 * Usage:
 *   node tools/verify_frontend_strings.mjs <original-dir> <current-dir> [--show N] [--stats]
 *   node tools/verify_frontend_strings.mjs <original-dir> <current-dir> --strict-changed
 *
 * Exit status: 1 when any string is *lost* (or, with --strict-changed, when any
 * string's literal count fell below its decoder-call count).
 */

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import process from 'node:process';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { resolveBabelRoot } from './lib/babel-root.mjs';

const require = createRequire(import.meta.url);
const BABEL_ROOT = resolveBabelRoot();

const parser = require(`${BABEL_ROOT}/@babel/parser`);
const traverse = require(`${BABEL_ROOT}/@babel/traverse`).default;

const OBFUSCATED_NAME = /^_0x[0-9a-f]+$/;
/** Non-anchored, to decide whether a file is obfuscated at all. */
const OBFUSCATED_PRESENT = /_0x[0-9a-f]{4,}/;
/** The rotation IIFE's guard, used to locate where to inject the marker. */
const ROTATION_LOOP = /while\s*\(\s*!+\[\]\s*\)/;

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (entry.isFile() && entry.name.endsWith('.js')) yield full;
  }
}

function parse(code) {
  return parser.parse(code, { sourceType: 'module', errorRecovery: true });
}

/**
 * A global stub that tolerates arbitrary property access and calls, so the
 * module body can run far enough for the string machinery to initialise.
 */
function makeSandbox() {
  const cache = new Map();
  const handler = {
    get(_target, property) {
      if (!cache.has(property)) {
        const stub = function () {};
        stub.__stub = true;
        cache.set(property, stub);
      }
      return cache.get(property);
    },
    has() {
      return true;
    },
    set() {
      return true;
    },
  };
  const stubGlobal = new Proxy({}, handler);
  return Object.assign(Object.create(null), {
    window: stubGlobal,
    self: stubGlobal,
    document: stubGlobal,
    navigator: stubGlobal,
    console: { log() {}, warn() {}, error() {}, debug() {} },
  });
}

/**
 * Run the obfuscator's string machinery and return its decoder functions.
 *
 * Two details matter here and both are easy to get wrong:
 *
 *  - The array getter and the decoder **reassign themselves** on first call:
 *
 *      function _0xf03e(){const a=[...]; _0xf03e=function(){return a;}; return _0xf03e();}
 *
 *    Calling the *pre-reassignment* function builds a brand-new, still
 *    unrotated array, so decoding with it silently yields the wrong strings.
 *    The functions must therefore be captured only *after* the module body has
 *    run, at which point the bindings hold the closures over the rotated array.
 *
 *  - The body is executed at script top level rather than inside a wrapper
 *    IIFE, so the reassignments above land on the script globals we read back.
 */
function extractDecoders(code, ast) {
  const functionNames = [];
  const otherNames = [];
  const keep = [];
  for (const statement of ast.program.body) {
    let declaration = statement;
    if (statement.type.startsWith('Export')) {
      declaration = statement.declaration || null;
      if (declaration) keep.push(declaration);
    } else if (statement.type === 'ImportDeclaration') {
      continue;
    } else {
      keep.push(statement);
    }
    if (!declaration) continue;
    if (declaration.type === 'FunctionDeclaration' && declaration.id) {
      functionNames.push(declaration.id.name);
    }
    if (declaration.type === 'VariableDeclaration') {
      for (const declarator of declaration.declarations) {
        if (declarator.id.type === 'Identifier') otherNames.push(declarator.id.name);
      }
    }
  }

  const candidates = [...functionNames, ...otherNames].filter((name) =>
    OBFUSCATED_NAME.test(name)
  );
  if (candidates.length === 0) return { decoders: new Map(), rotationRequired: false };

  // The body is executed at script top level, with no block around it.  That is
  // essential: wrapping it in `try{...}` or an IIFE would make
  // `function _0xf03e(){}` a *block-scoped* declaration, so the self-reassignment
  // `_0xf03e = function(){...}` would only rebind the block-local name.  The
  // global would still hold the pre-reassignment function, whose every call
  // builds a fresh, unrotated array — producing plausible-looking but wrong
  // strings.  A marker injected right after the rotation loop proves the
  // rotation actually ran before we trust any decoded value.
  const parts = [];
  let rotationRequired = false;
  const awaited = topLevelAwaitRanges(ast);
  parts.push(
    // `import.meta` is a SyntaxError outside a real module, which would abort
    // the whole script before the rotation ran.  Nothing in the string
    // machinery depends on it, so it is stubbed out.
    'globalThis.__importMeta={url:"file:///stub/index.js",env:{},resolve:function(){return"";}};'
  );
  for (const statement of keep) {
    if (statement.start === undefined) continue;
    if (withinRanges(statement.start, awaited)) continue;
    let text = code
      .slice(statement.start, statement.end)
      .replace(/\bimport\.meta\b/g, 'globalThis.__importMeta');
    if (ROTATION_LOOP.test(text)) {
      rotationRequired = true;
      // The rotation IIFE is not always a statement of its own: in
      // frontend/static/embed-runtime.js it shares a comma expression with the
      // module body, which throws on the stubbed globals before any following
      // marker statement could run.  Inject the marker into the loop test so it
      // is set on the first iteration, whatever the rest of the statement does.
      text = text.replace(
        ROTATION_LOOP,
        (match) => `${match.slice(0, -1)}&&(globalThis.__rotationCompleted=true,true))`
      );
    }
    parts.push(text);
  }
  parts.push('globalThis.__decoders={};');
  parts.push(
    candidates
      .map(
        (name) =>
          `try{globalThis.__decoders[${JSON.stringify(name)}]=${name};}catch(__e){}`
      )
      .join('\n')
  );

  const sandbox = makeSandbox();
  const context = vm.createContext(sandbox);
  try {
    vm.runInContext(parts.join('\n'), context, { timeout: 20000 });
  } catch {
    // The real module body touches import bindings we stubbed; whatever ran
    // before that point (including the rotation) is still visible.
  }

  if (rotationRequired && context.__rotationCompleted !== true) {
    return { decoders: new Map(), rotationRequired, rotationCompleted: false };
  }

  const decoders = new Map();
  const registry = { ...(context.__decoders || {}) };
  for (const name of candidates) {
    if (!(name in registry) && typeof context[name] === 'function') {
      registry[name] = context[name];
    }
  }
  for (const [name, value] of Object.entries(registry)) {
    if (typeof value === 'function') decoders.set(name, value);
  }
  return { decoders, rotationRequired, rotationCompleted: true };
}

/**
 * Ranges of the obfuscator's rotation IIFE.
 *
 *   (function(a,b){ const d=a(); while(!![]){ try{...}catch(e){d.push(d.shift());} } })(decoder,0x...)
 *
 * It exists purely to rotate the string array, and the strings it decodes
 * (`"986064epKVVd"`, `"301044zkJPCK"`, ...) are consumed only by that rotation
 * maths.  A de-obfuscated file legitimately no longer contains them, so they
 * must not be reported as lost content.
 */
function rotationRanges(ast, code) {
  const ranges = [];
  traverse(ast, {
    WhileStatement(p) {
      const test = code.slice(p.node.test.start, p.node.test.end);
      if (!/^!+\[\]$/.test(test)) return;
      // Every rotation-machinery decoder call lives inside the loop body, so
      // the loop's own range is enough — and it is robust to the IIFE being
      // wrapped in a VariableDeclaration, a nested function, and so on.
      ranges.push([p.node.start, p.node.end]);
    },
  });
  return ranges;
}

function withinRanges(position, ranges) {
  return ranges.some(([start, end]) => position >= start && position < end);
}

/**
 * Ranges of top-level `await` expressions' enclosing statements.
 *
 * Bundles that do `const x = await import(...)` are ES modules; in a plain
 * script a top-level `await` is a *compile-time* SyntaxError, so the whole
 * script fails and even the string machinery never initialises.  Those
 * statements are dropped, since nothing in the decoder depends on them.
 * `await` inside an async function is left alone — that is legal.
 */
function topLevelAwaitRanges(ast) {
  const ranges = [];
  traverse(ast, {
    AwaitExpression(p) {
      if (p.getFunctionParent()) return;
      let cursor = p;
      while (cursor.parentPath && !cursor.parentPath.isProgram()) {
        cursor = cursor.parentPath;
      }
      if (cursor.node.start !== undefined) {
        ranges.push([cursor.node.start, cursor.node.end]);
      }
    },
  });
  return ranges;
}

/**
 * Resolve a callee identifier back to a known decoder.
 *
 * obfuscator.io re-aliases the decoder inside every function scope, so call
 * sites almost never name the top-level decoder directly:
 *
 *   function renderX(...){ const _0x2f697c = _0xb34e; ... _0x2f697c(0x16f) ... }
 *
 * Walking the `const alias = decoder` chain through the scope bindings is what
 * turns those call sites back into resolvable decoder calls.
 */
function resolveDecoderName(name, scope, decoders) {
  if (decoders.has(name)) return name;
  let current = name;
  let currentScope = scope;
  for (let depth = 0; depth < 16; depth += 1) {
    const binding = currentScope?.getBinding(current);
    if (!binding) return null;
    const bindingPath = binding.path;
    if (
      bindingPath.isVariableDeclarator() &&
      bindingPath.node.init &&
      bindingPath.node.init.type === 'Identifier'
    ) {
      const next = bindingPath.node.init.name;
      if (decoders.has(next)) return next;
      current = next;
      currentScope = bindingPath.scope;
      continue;
    }
    if (
      (bindingPath.isFunctionDeclaration() || bindingPath.isFunctionExpression()) &&
      decoders.has(current)
    ) {
      return current;
    }
    return null;
  }
  return null;
}

/** Every string the original module produces via its decoder, by value. */
function groundTruthStrings(code) {
  let ast;
  try {
    ast = parse(code);
  } catch (error) {
    return { error: `original parse failed: ${error.message}` };
  }

  const extracted = extractDecoders(code, ast);
  if (extracted.rotationRequired && !extracted.rotationCompleted) {
    return { error: 'string-array rotation did not run' };
  }
  const decoders = extracted.decoders;
  if (decoders.size === 0) return { error: 'no decoder found' };

  const rotation = rotationRanges(ast, code);

  const truth = new Set();
  // Multiset alongside the set: N call sites producing one value must leave N
  // literals behind, so a *count* tells us about edited occurrences that the
  // set membership test cannot see.
  const counts = new Map();
  let calls = 0;
  let skipped = 0;
  let numericCalls = 0;
  let unresolvedNumericCalls = 0;
  let rotationCalls = 0;

  traverse(ast, {
    CallExpression(p) {
      const callee = p.node.callee;
      if (callee.type !== 'Identifier') return;

      // Only numeric-argument calls are candidates for decoder calls; the
      // module's other `_0x...(...)` calls are ordinary functions.
      let args = [];
      for (const arg of p.node.arguments) {
        if (arg.type === 'NumericLiteral') args.push(arg.value);
        else if (arg.type === 'StringLiteral') args.push(arg.value);
        else if (
          arg.type === 'UnaryExpression' &&
          arg.operator === '-' &&
          arg.argument.type === 'NumericLiteral'
        ) {
          args.push(-arg.argument.value);
        } else {
          args = null;
          break;
        }
      }
      if (!args) return;
      numericCalls += 1;

      // Rotation-machinery strings are expected to disappear.
      if (withinRanges(p.node.start, rotation)) {
        rotationCalls += 1;
        return;
      }

      const root = resolveDecoderName(callee.name, p.scope, decoders);
      if (!root) {
        unresolvedNumericCalls += 1;
        return;
      }
      const fn = decoders.get(root);
      calls += 1;
      try {
        const value = fn(...args);
        if (typeof value === 'string') {
          truth.add(value);
          counts.set(value, (counts.get(value) || 0) + 1);
        }
        else skipped += 1;
      } catch {
        skipped += 1;
      }
    },
  });

  return {
    truth,
    counts,
    calls,
    skipped,
    numericCalls,
    unresolvedNumericCalls,
    rotationCalls,
  };
}

const args = process.argv.slice(2);
const showIndex = args.indexOf('--show');
const show = showIndex >= 0 ? Number(args[showIndex + 1]) || 8 : 8;
const stats = args.includes('--stats');
const strictChanged = args.includes('--strict-changed');
const positional = args.filter(
  (a, i) => !a.startsWith('--') && (showIndex < 0 || i !== showIndex + 1)
);

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(HERE, '..');
const BUNDLE = path.join(PROJECT_ROOT, 'tools', 'reference', 'frontend-orig.tar.gz');
const EXTRACTED = path.join(
  PROJECT_ROOT,
  'tools',
  'reference',
  '.extracted',
  'frontend-orig'
);

/**
 * Locate the original obfuscated sources, which are the only ground truth for
 * the frontend de-obfuscation.  Precedence: explicit argument, then
 * `HB_FRONTEND_ORIG`, then the bundled reference tarball (extracted on demand).
 */
// The bundle stores the sources as `frontend/...`, while .restore/orig-frontend
// holds the frontend directory itself.  Accept either shape so an explicit
// argument, HB_FRONTEND_ORIG and the bundled archive all resolve identically.
function frontendRoot(dir) {
  if (!dir) return dir;
  const nested = path.join(dir, 'frontend');
  return fs.existsSync(nested) && fs.statSync(nested).isDirectory() ? nested : dir;
}

function resolveOriginalDir(explicit) {
  if (explicit) return frontendRoot(explicit);
  const override = (process.env.HB_FRONTEND_ORIG || '').trim();
  if (override) return frontendRoot(override);
  if (fs.existsSync(EXTRACTED)) return frontendRoot(EXTRACTED);
  if (!fs.existsSync(BUNDLE)) return null;
  fs.mkdirSync(EXTRACTED, { recursive: true });
  execFileSync('tar', ['-xzf', BUNDLE, '-C', EXTRACTED]);
  return frontendRoot(EXTRACTED);
}

const originalDir = resolveOriginalDir(positional[0]);
const currentDir = positional[1] || path.join(PROJECT_ROOT, 'frontend');
if (!originalDir || !fs.existsSync(originalDir)) {
  console.error(
    'No original obfuscated frontend found.\n' +
      'Pass it as the first argument, set HB_FRONTEND_ORIG, or restore\n' +
      `tools/reference/frontend-orig.tar.gz (looked in ${BUNDLE}).`
  );
  process.exit(2);
}

let checked = 0;
let skipped = 0;
let failed = 0;
let lostTotal = 0;
let changedTotal = 0;
let changedFiles = 0;
let resolvedTotal = 0;

for (const originalFile of walk(originalDir)) {
  const rel = path.relative(originalDir, originalFile);
  const code = fs.readFileSync(originalFile, 'utf8');
  if (!OBFUSCATED_PRESENT.test(code)) {
    skipped += 1;
    continue;
  }
  const currentFile = path.join(currentDir, rel);
  if (!fs.existsSync(currentFile)) {
    console.log(`MISSING FILE ${rel}`);
    failed += 1;
    continue;
  }

  const truth = groundTruthStrings(code);
  if (truth.error) {
    console.log(`SKIP  ${rel} :: ${truth.error}`);
    skipped += 1;
    continue;
  }
  resolvedTotal += truth.calls;

  const currentCode = fs.readFileSync(currentFile, 'utf8');
  let currentFound = new Set();
  const currentCounts = new Map();
  const countString = (value) => {
    currentFound.add(value);
    currentCounts.set(value, (currentCounts.get(value) || 0) + 1);
  };
  try {
    const currentAst = parse(currentCode);
    traverse(currentAst, {
      StringLiteral(p) {
        countString(p.node.value);
      },
      TemplateElement(p) {
        const cooked = p.node.value.cooked;
        if (typeof cooked === 'string') countString(cooked);
      },
    });
  } catch (error) {
    console.log(`SKIP  ${rel} :: current parse failed: ${error.message}`);
    skipped += 1;
    continue;
  }

  checked += 1;
  const lost = [];
  for (const value of truth.truth) {
    if (typeof value !== 'string' || value.length === 0) continue;
    if (currentFound.has(value)) continue;
    if (currentCode.includes(value)) continue;
    lost.push(value);
  }
  // A value can survive in the file and still have been rewritten.  The literal
  // multiset is what the de-obfuscation has to reproduce, so a value whose literal
  // count is below the original decoder-call count means some of its occurrences
  // were edited away - the case `lost` cannot see.  Only exact literal matches
  // count (the raw-substring fallback above would flag concatenations), and values
  // shorter than 4 characters are exempt because punctuation gets interned and
  // moved around freely.
  const lostSet = new Set(lost);
  const changed = [];
  for (const [value, expected] of truth.counts) {
    if (value.length < 4) continue;
    if (lostSet.has(value)) continue;
    const actual = currentCounts.get(value);
    if (actual === undefined || actual >= expected) continue;
    changed.push({ value, expected, actual });
  }
  if (stats) {
    console.log(
      `OK   ${rel} :: decoder-calls=${truth.calls} unique-strings=${truth.truth.size} ` +
        `skipped=${truth.skipped} lost=${lost.length} changed=${changed.length}`
    );
  }
  if (lost.length > 0) {
    failed += 1;
    lostTotal += lost.length;
    console.log(
      `LOST ${rel} :: ${lost.length}/${truth.truth.size} string(s) ` +
        `(decoder calls=${truth.calls}, skipped=${truth.skipped})`
    );
    for (const value of lost.slice(0, show)) {
      const text = value.length > 110 ? `${value.slice(0, 110)}...` : value;
      console.log(`        ${JSON.stringify(text)}`);
    }
    if (lost.length > show) console.log(`        ... ${lost.length - show} more`);
  }
  if (changed.length > 0) {
    changedFiles += 1;
    changedTotal += changed.length;
    console.log(
      `CHANGED ${rel} :: ${changed.length} string(s) still present but short of the ` +
        `original decoder-call count`
    );
    for (const entry of changed.slice(0, show)) {
      const raw = entry.value.length > 110 ? `${entry.value.slice(0, 110)}...` : entry.value;
      console.log(
        `        ${JSON.stringify(raw)} (original calls=${entry.expected}, current literals=${entry.actual})`
      );
    }
    if (changed.length > show) console.log(`        ... ${changed.length - show} more`);
  }
}

console.log(
  `# checked=${checked} files-with-lost-strings=${failed} lost-strings=${lostTotal} ` +
    `files-with-changed-strings=${changedFiles} changed-strings=${changedTotal} ` +
    `decoder-calls-resolved=${resolvedTotal} skipped=${skipped}`
);
// Only *lost* strings fail.  See the header: the normalisation pass removes
// literals on purpose, so a non-zero changed count is expected on a clean tree.
if (failed > 0 || (strictChanged && changedFiles > 0)) process.exitCode = 1;
