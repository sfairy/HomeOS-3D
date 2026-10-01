/**
 * Second-pass cleanup for the HA-Bridge frontend after `webcrack`.
 *
 * `webcrack` already removed the obfuscator.io string array, the `_0x...`
 * decoder and the control-flow flattening.  What it could not recover is the
 * *local alias* an import was bound to, so 42 modules still read
 *
 *     import { showDisplayPairingQr as _0x25fcbd } from "./display-pairing-qr.js?v=...";
 *
 * The exported name is intact, so the alias can be restored deterministically.
 * This script renames, scope-safely and without touching string literals:
 *
 *   - `import { realName as _0xAlias }`  -> `import { realName }`
 *   - `import _0xAlias from "./a-b.js"`  -> `import aB from "./a-b.js"`
 *   - `import * as _0xAlias from "./a-b.js"` -> `import * as aB from "./a-b.js"`
 *
 * Only identifier nodes are rewritten (source ranges from the Babel AST), so
 * comments, formatting and the `?v=...` cache-busting query strings are
 * preserved byte-for-byte.
 *
 * Usage:
 *   node tools/rename_frontend_identifiers.mjs [--dry] [path ...]
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

const ALIAS_RE = /^_0x[0-9a-f]{4,}$/;

function isObfuscatedName(name) {
  return typeof name === 'string' && ALIAS_RE.test(name);
}

/** `./renderer/light-runtime.js?v=...` -> `lightRuntime` */
function nameFromModule(source) {
  const withoutQuery = source.split('?')[0];
  const base = path.basename(withoutQuery).replace(/\.js$/, '');
  const parts = base.split(/[^A-Za-z0-9]+/).filter(Boolean);
  if (parts.length === 0) return 'module';
  const camel = parts
    .map((part, index) =>
      index === 0
        ? part.charAt(0).toLowerCase() + part.slice(1)
        : part.charAt(0).toUpperCase() + part.slice(1)
    )
    .join('');
  return /^[A-Za-z_$]/.test(camel) ? camel : `_${camel}`;
}

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (entry.isFile() && entry.name.endsWith('.js')) yield full;
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
 * Rename the obfuscated aliases of one module.
 *
 * Returns `{ code, renames }` or `null` when nothing had to change.
 */
function renameModule(code) {
  let ast;
  try {
    ast = parse(code);
  } catch (error) {
    return { error: error.message };
  }

  /** @type {Map<string, {node: object, newName: string}>} */
  const plan = new Map();

  const program = ast.program;
  // Collect every identifier that is *actually in use* in this module.  Names
  // that only appear as import/export bookkeeping or as non-computed property
  // keys do not occupy the namespace, so they must not block a rename.
  const taken = new Set();
  traverse(ast, {
    Identifier(p) {
      const parent = p.parentPath?.node;
      if (parent) {
        if (parent.type === 'ImportSpecifier' && parent.imported === p.node) {
          return;
        }
        if (parent.type === 'ImportDefaultSpecifier') {
          // The local name *is* a binding; count it.
        }
        if (parent.type === 'ExportSpecifier' && parent.exported === p.node) {
          return;
        }
        if (
          (parent.type === 'MemberExpression' ||
            parent.type === 'OptionalMemberExpression') &&
          parent.property === p.node &&
          !parent.computed
        ) {
          return;
        }
        if (
          (parent.type === 'ObjectProperty' || parent.type === 'ObjectMethod') &&
          parent.key === p.node &&
          !parent.computed &&
          !parent.shorthand
        ) {
          return;
        }
        if (
          (parent.type === 'ClassProperty' ||
            parent.type === 'ClassMethod' ||
            parent.type === 'ClassPrivateProperty') &&
          parent.key === p.node &&
          !parent.computed
        ) {
          return;
        }
      }
      taken.add(p.node.name);
    },
  });

  const pickName = (preferred, alias) => {
    if (!taken.has(preferred) || preferred === alias) {
      taken.add(preferred);
      return preferred;
    }
    let index = 2;
    while (taken.has(`${preferred}_${index}`)) index += 1;
    const chosen = `${preferred}_${index}`;
    taken.add(chosen);
    return chosen;
  };

  for (const statement of program.body) {
    if (statement.type !== 'ImportDeclaration') continue;
    for (const specifier of statement.specifiers) {
      const local = specifier.local;
      if (!isObfuscatedName(local?.name)) continue;
      let preferred;
      if (specifier.type === 'ImportSpecifier') {
        preferred = specifier.imported?.name;
        if (!preferred || isObfuscatedName(preferred)) continue;
      } else {
        preferred = nameFromModule(String(statement.source.value));
      }
      plan.set(local.name, {
        specifier,
        alias: local.name,
        newName: pickName(preferred, local.name),
      });
    }
  }

  if (plan.size === 0) return null;

  // Resolve each alias to its binding so shadowed inner declarations of the
  // same name are left alone.
  const targets = new Map();
  traverse(ast, {
    Program(p) {
      for (const [alias, entry] of plan) {
        const binding = p.scope.getBinding(alias);
        if (binding) targets.set(alias, { ...entry, binding });
      }
    },
  });

  /** @type {{start: number, end: number, text: string}[]} */
  const edits = [];
  const renamed = new Set();

  traverse(ast, {
    Identifier(p) {
      const name = p.node.name;
      const target = targets.get(name);
      if (!target) return;
      if (
        p.node.start === undefined ||
        p.node.end === undefined
      ) {
        return;
      }
      const parent = p.parentPath?.node;
      if (parent) {
        // Do not rewrite the *exported* side of `{ realName as _0xAlias }`.
        if (parent.type === 'ImportSpecifier' && parent.imported === p.node) {
          return;
        }
        // Property keys / member accesses are not bindings.
        if (
          (parent.type === 'MemberExpression' ||
            parent.type === 'OptionalMemberExpression') &&
          parent.property === p.node &&
          !parent.computed
        ) {
          return;
        }
        if (
          (parent.type === 'ObjectProperty' || parent.type === 'ObjectMethod') &&
          parent.key === p.node &&
          !parent.computed
        ) {
          return;
        }
        if (parent.type === 'ClassProperty' && parent.key === p.node) return;
      }
      if (p.scope.getBinding(name) !== target.binding) return;
      if (p.isBindingIdentifier() && p.parentPath?.node?.type === 'ImportSpecifier') {
        // `import { realName as _0xAlias }` -> drop the alias entirely.
        if (target.newName === target.specifier.imported?.name) {
          const specStart = target.specifier.start;
          const specEnd = target.specifier.end;
          edits.push({
            start: specStart,
            end: specEnd,
            text: target.newName,
          });
          renamed.add(name);
          return;
        }
      }
      edits.push({ start: p.node.start, end: p.node.end, text: target.newName });
      renamed.add(name);
    },
  });

  if (edits.length === 0) return null;

  // Apply from the end so earlier ranges keep their offsets.  Import-specifier
  // rewrites span a renamed identifier, so drop the inner edit in that case.
  const spans = edits
    .filter(
      (edit) =>
        !edits.some(
          (other) =>
            other !== edit &&
            other.start <= edit.start &&
            other.end >= edit.end &&
            other.start !== edit.start
        )
    )
    .sort((a, b) => b.start - a.start);

  let output = code;
  for (const edit of spans) {
    output = output.slice(0, edit.start) + edit.text + output.slice(edit.end);
  }
  return { code: output, renames: [...renamed].length, plan };
}

const args = process.argv.slice(2);
const dry = args.includes('--dry');
const explicit = args
  .filter((a) => !a.startsWith('--'))
  .map((a) => path.resolve(a));
const files = explicit.length > 0 ? explicit : [...walk(FRONTEND)].sort();

let changed = 0;
let total = 0;
let failed = 0;
for (const file of files) {
  const original = fs.readFileSync(file, 'utf8');
  const result = renameModule(original);
  const rel = path.relative(ROOT, file);
  if (!result) continue;
  if (result.error) {
    failed += 1;
    console.log(`FAIL  ${rel} :: ${result.error}`);
    continue;
  }
  if (!dry) fs.writeFileSync(file, result.code);
  changed += 1;
  total += result.renames;
  console.log(
    `${dry ? 'DRY' : 'OK'}   ${rel}  ${result.renames} alias(es) restored, ` +
      `${original.length} -> ${result.code.length} bytes`
  );
}
console.log(
  `# done: files changed=${changed} aliases restored=${total} failed=${failed}`
);
