/**
 * Final de-obfuscation pass for the HA-Bridge frontend.
 *
 * The frontend was obfuscated with obfuscator.io.  `webcrack` already removed
 * the string array, the `_0x...` decoder, the control-flow flattening and the
 * `_0x` aliases of `import` statements (see `rename_frontend_identifiers.mjs`).
 * What is left are ~24k *function-local* bindings whose names are still
 * `_0x1a2b3c`-style, e.g.
 *
 *     function W() {
 *       const _0x2ecfac = navigator.userAgent || "";
 *       return /iPad|iPhone|iPod/i.test(_0x2ecfac) || ...;
 *     }
 *
 * Every remaining `_0x` name is a genuine lexical binding: a scan of all 126
 * affected files found 0 occurrences used as a member property, 0 as an
 * object/class property key and 0 inside string literals.  A scope-aware
 * rename can therefore remove all of them.
 *
 * The renamer is deliberately conservative:
 *
 *   - it renames by byte range using the AST, so comments, formatting,
 *     indentation and the `?v=...` cache-busting query strings in imports are
 *     preserved byte-for-byte;
 *   - names are resolved through Babel's scope machinery, so shadowed
 *     bindings in nested scopes are renamed independently;
 *   - new names are unique *file-wide* (the candidate set is seeded with every
 *     identifier already present), which makes accidental shadowing impossible;
 *   - non-computed member properties, non-computed object/class keys, the
 *     `imported` side of import specifiers and the exported side of export
 *     specifiers are never rewritten;
 *   - an object shorthand such as `{ _0xabc }` becomes `{ _0xabc: value1 }`,
 *     which keeps the property name and only renames the variable.
 *
 * Usage:
 *   node tools/rename_frontend_locals.mjs [--dry] [path ...]
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

const OBFUSCATED_RE = /^_0x[0-9a-f]{4,}$/;
/** Matches the obfuscated shape *anywhere* in a name, for defensive checks. */
const OBFUSCATED_PATTERN = /_0x[0-9a-f]{4,}/;

function isObfuscatedName(name) {
  return typeof name === 'string' && OBFUSCATED_RE.test(name);
}

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (entry.isFile() && entry.name.endsWith('.js')) yield full;
  }
}

/** DOM lookups and similar reads yield an element, not a generic value. */
const ELEMENT_METHODS = new Set([
  'querySelector',
  'querySelectorAll',
  'getElementById',
  'getElementsByClassName',
  'getElementsByTagName',
  'closest',
  'createElement',
  'createElementNS',
]);

const VALUE_CALLS = new Set([
  'Number',
  'String',
  'Boolean',
  'parseInt',
  'parseFloat',
  'isNaN',
  'isFinite',
]);

const COERCION_METHODS = new Set(['parse', 'parseJSON', 'toJSON', 'stringify']);

/** Turn `WeakMap` into `weakMap`, `IntersectionObserver` into `intersectionObserver`. */
function toCamelCase(name) {
  if (typeof name !== 'string' || name.length === 0) return null;
  // Never derive a role from an obfuscated callee: `new _0x359b04(...)` would
  // otherwise yield a *new* `_0x...` name.
  if (OBFUSCATED_RE.test(name) || OBFUSCATED_PATTERN.test(name)) return null;
  const camel = name.charAt(0).toLowerCase() + name.slice(1);
  if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(camel)) return null;
  return camel;
}

/**
 * Final guard on every role prefix: an eligible role must be a plain
 * identifier that cannot be confused with an obfuscated name.
 */
function sanitizeRole(role) {
  if (typeof role !== 'string' || role.length === 0) return 'value';
  if (OBFUSCATED_PATTERN.test(role)) return 'value';
  if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(role)) return 'value';
  return role;
}

function roleForCallee(callee) {
  if (!callee) return null;
  if (callee.type === 'Identifier') {
    if (VALUE_CALLS.has(callee.name)) return 'value';
  }
  if (
    callee.type === 'MemberExpression' &&
    !callee.computed &&
    callee.property.type === 'Identifier'
  ) {
    const property = callee.property.name;
    if (ELEMENT_METHODS.has(property)) return 'element';
    if (COERCION_METHODS.has(property)) return 'value';
    if (property === 'keys' || property === 'values' || property === 'entries') {
      return property;
    }
  }
  return null;
}

/**
 * Derive a readable role prefix from the shape of the declaration.
 *
 * Only the first sighting of a name matters, so this stays cheap; the
 * fallback is always a generic `value`.  `counter` is a per-role counter.
 */
function roleForBinding(binding) {
  const declPath = binding.path;
  if (!declPath || !declPath.node) return 'value';
  const node = declPath.node;

  if (
    declPath.isFunctionDeclaration() ||
    declPath.isFunctionExpression() ||
    declPath.isArrowFunctionExpression()
  ) {
    return 'fn';
  }
  if (
    node.type === 'ClassDeclaration' ||
    node.type === 'ClassExpression' ||
    node.type === 'ClassMethod' ||
    node.type === 'ClassPrivateMethod'
  ) {
    return 'ClassName';
  }
  if (binding.kind === 'param') return 'arg';
  if (node.type === 'CatchClause') return 'error';

  const value = node.type === 'VariableDeclarator' ? node.init : null;
  if (!value) return 'value';

  if (
    value.type === 'ArrowFunctionExpression' ||
    value.type === 'FunctionExpression' ||
    value.type === 'FunctionDeclaration'
  ) {
    return 'fn';
  }
  switch (value.type) {
    case 'ArrayExpression':
      return 'list';
    case 'ObjectExpression':
      return 'object';
    case 'TemplateLiteral':
    case 'StringLiteral':
      return 'text';
    case 'NewExpression': {
      const callee = value.callee;
      if (callee && callee.type === 'Identifier') {
        return toCamelCase(callee.name) || 'value';
      }
      return 'value';
    }
    case 'CallExpression':
    case 'OptionalCallExpression': {
      const role = roleForCallee(value.callee);
      if (role) return role;
      if (
        value.callee &&
        value.callee.type === 'Identifier' &&
        value.callee.name === 'Array'
      ) {
        return 'list';
      }
      return 'value';
    }
    case 'AwaitExpression': {
      const argument = value.argument;
      if (argument && argument.type === 'CallExpression') {
        const role = roleForCallee(argument.callee);
        if (role) return role;
      }
      return 'value';
    }
    default:
      return 'value';
  }
}

function parse(code) {
  return parser.parse(code, {
    sourceType: 'module',
    errorRecovery: false,
    plugins: [],
  });
}

/**
 * Rename every obfuscated local binding of one module.
 *
 * Returns `{ code, renames }`, `{ error }`, or `null` when nothing changed.
 */
function renameLocals(code) {
  let ast;
  try {
    ast = parse(code);
  } catch (error) {
    return { error: error.message };
  }

  // Seed the candidate set with every identifier already present so a chosen
  // name can never collide with, or shadow, anything.
  const taken = new Set();
  traverse(ast, {
    Identifier(p) {
      taken.add(p.node.name);
    },
  });

  // Collect the obfuscated bindings.  A binding is identified by the pair
  // (name, declaration offset) because the same name can be bound in several
  // scopes.
  const targets = new Map();
  traverse(ast, {
    Scopable(p) {
      for (const [name, binding] of Object.entries(p.scope.bindings)) {
        if (!isObfuscatedName(name)) continue;
        const declaration = binding.identifier;
        if (!declaration || declaration.start === undefined) continue;
        const key = `${name}@${declaration.start}`;
        if (targets.has(key)) continue;
        targets.set(key, { name, binding });
      }
    },
  });

  if (targets.size === 0) return null;

  const counters = new Map();
  const assigned = new Map();
  const declarations = [];
  for (const [key, entry] of targets) {
    const declaration = entry.binding.identifier;
    const role = sanitizeRole(roleForBinding(entry.binding));
    let index = counters.get(role) || 1;
    let candidate = `${role}${index}`;
    while (taken.has(candidate) || OBFUSCATED_PATTERN.test(candidate)) {
      index += 1;
      candidate = `${role}${index}`;
    }
    counters.set(role, index + 1);
    taken.add(candidate);
    assigned.set(key, candidate);
    declarations.push({
      key,
      name: entry.name,
      role,
      line: declaration.loc ? declaration.loc.start.line : null,
    });
  }

  /** @type {Map<string, {start: number, end: number, text: string}>} */
  const edits = new Map();
  let skippedProperties = 0;

  const addEdit = (start, end, text) => {
    edits.set(`${start}:${end}`, { start, end, text });
  };

  traverse(ast, {
    Identifier(p) {
      const name = p.node.name;
      if (!isObfuscatedName(name)) return;
      const binding = p.scope.getBinding(name);
      if (!binding || !binding.identifier || binding.identifier.start === undefined) {
        // Not a lexical binding (an undefined global, or an unresolved
        // shorthand key): leaving it alone is always safe.
        return;
      }
      const newName = assigned.get(`${name}@${binding.identifier.start}`);
      if (!newName) return;

      const parent = p.parentPath?.node;
      if (parent) {
        // `import { realName as alias }`: never rename the exported side.
        if (parent.type === 'ImportSpecifier' && parent.imported === p.node) return;
        // `export { local as exported }`: the exported name is public API.
        if (parent.type === 'ExportSpecifier') {
          if (parent.exported === p.node) {
            if (parent.local === p.node) skippedProperties += 1;
            return;
          }
        }
        // `obj.prop` / `obj[prop]` — a property, not a variable.
        if (
          (parent.type === 'MemberExpression' ||
            parent.type === 'OptionalMemberExpression') &&
          parent.property === p.node &&
          !parent.computed
        ) {
          if (p.node.start === parent.property.start) skippedProperties += 1;
          return;
        }
        // `{ key: value }` / `class { key() {} }` — not a variable.
        if (
          (parent.type === 'ObjectProperty' ||
            parent.type === 'ObjectMethod' ||
            parent.type === 'ClassProperty' ||
            parent.type === 'ClassMethod' ||
            parent.type === 'ClassPrivateProperty') &&
          parent.key === p.node &&
          !parent.computed &&
          !(parent.type === 'ObjectProperty' && parent.shorthand)
        ) {
          skippedProperties += 1;
          return;
        }
        // Shorthand `{ _0xabc }` / `{ _0xabc = 1 }`: keep the property name and
        // spell out the renamed variable.  Rewriting the key span turns
        // `{ _0xabc }` into `{ _0xabc: value1 }`.
        if (parent.type === 'ObjectProperty' && parent.shorthand && parent.key === p.node) {
          addEdit(parent.key.start, parent.key.end, `${name}: ${newName}`);
          return;
        }
      }

      addEdit(p.node.start, p.node.end, newName);
    },
  });

  if (edits.size === 0) return null;

  const ordered = [...edits.values()].sort((a, b) => a.start - b.start);
  let output = '';
  let cursor = 0;
  for (const edit of ordered) {
    if (edit.start < cursor) {
      return { error: `overlapping edits at offset ${edit.start}` };
    }
    output += code.slice(cursor, edit.start) + edit.text;
    cursor = edit.end;
  }
  output += code.slice(cursor);

  return {
    code: output,
    renames: ordered.length,
    bindings: assigned.size,
    declarations,
    skippedProperties,
  };
}

const args = process.argv.slice(2);
const dry = args.includes('--dry');
const verbose = args.includes('--verbose');
const explicit = args
  .filter((a) => !a.startsWith('--'))
  .map((a) => path.resolve(a));

const files =
  explicit.length > 0
    ? explicit.flatMap((target) =>
        fs.statSync(target).isDirectory() ? [...walk(target)].sort() : [target]
      )
    : [...walk(FRONTEND)].sort();

let changed = 0;
let bindings = 0;
let occurrences = 0;
let bytes = 0;
let failed = 0;
let remaining = 0;
const skipReport = [];

for (const file of files) {
  const original = fs.readFileSync(file, 'utf8');
  const rel = path.relative(ROOT, file);
  if (!original.includes('_0x')) continue;
  const result = renameLocals(original);
  if (!result) continue;
  if (result.error) {
    failed += 1;
    console.log(`FAIL  ${rel} :: ${result.error}`);
    continue;
  }
  // Sanity: the only difference must be inside identifier positions, so the
  // file size may change (shorthand expansion) but the line count must not.
  const linesBefore = original.split('\n').length;
  const linesAfter = result.code.split('\n').length;
  if (linesBefore !== linesAfter) {
    failed += 1;
    console.log(
      `FAIL  ${rel} :: line count changed ${linesBefore} -> ${linesAfter}, not written`
    );
    continue;
  }
  const leftovers = (result.code.match(/_0x[0-9a-f]{4,}/g) || []).length;
  if (leftovers > 0) remaining += leftovers;
  if (!dry) fs.writeFileSync(file, result.code);
  changed += 1;
  bindings += result.bindings;
  occurrences += result.renames;
  bytes += result.code.length - original.length;
  if (result.skippedProperties > 0) {
    skipReport.push(`${rel}: ${result.skippedProperties} property position(s) left`);
  }
  if (verbose) {
    console.log(
      `${dry ? 'DRY' : 'OK'}   ${rel}  ${result.bindings} binding(s), ` +
        `${result.renames} occurrence(s), ${original.length} -> ${result.code.length} bytes`
    );
  }
}

console.log(
  `# ${dry ? 'would change' : 'changed'} files=${changed} bindings=${bindings} ` +
    `occurrences=${occurrences} bytes=${bytes >= 0 ? '+' : ''}${bytes} ` +
    `failed=${failed} leftover_0x=${remaining}`
);
for (const line of skipReport) console.log(`# skipped ${line}`);
if (failed > 0 || remaining > 0) process.exitCode = 1;
