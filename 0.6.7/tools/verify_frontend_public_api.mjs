/**
 * Freeze the frontend's *public API*: exported names and import specifiers.
 *
 * `verify_frontend_rename.mjs` proves a rename is alpha-equivalent by rendering
 * every bound identifier as the identity of the binding it resolves to.  That
 * is the right notion of equivalence for a rename, but it has one blind spot
 * that matters here:
 *
 *     export function renderInteraction3d(host, context) { ... }
 *
 * The exported name *is* a binding.  Rename it consistently inside the
 * module - and every reference in every importing module still resolves - and
 * the two files remain alpha-equivalent.  But the name is also the module's
 * public interface: other modules import it, `index.html` boots it, and
 * `interaction3d/editor.js` reaches `config-editor.js` through a dynamic
 * `import()` of a licence-gated route.  A rename that is invisible to the
 * alpha-equivalence check breaks all of those at runtime.
 *
 * This tool therefore compares the interface instead of the implementation:
 *
 *   exports   every name the module exposes to its importers, including
 *             `default`, re-exports (`export { a } from ...`) and
 *             `export * from ...`
 *   imports   every `module::importedName` pair the module depends on, so a
 *             renamed export is caught on the consumer side too
 *
 * Both are compared as *sets per file*, so differences never hide behind
 * reordering.  Three usages:
 *
 *   node tools/verify_frontend_public_api.mjs <before-dir> <after-dir>
 *   node tools/verify_frontend_public_api.mjs --write-lock tools/frontend-public-api.json
 *   node tools/verify_frontend_public_api.mjs --check-lock tools/frontend-public-api.json
 *
 * The lockfile mode is the always-on guard: it freezes every module's exported
 * names so that any later edit - a rename batch in this repository, or work
 * landing from a different session - that perturbs the interface fails the
 * suite instead of breaking consumers at runtime.
 *
 * Exit status is non-zero on any difference.  Exported names are frozen by
 * policy: when a binding needs a better name but it is exported, leave it.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createRequire } from 'node:module';
import { resolveBabelRoot } from './lib/babel-root.mjs';

const require = createRequire(import.meta.url);
const BABEL_ROOT = resolveBabelRoot();

const parser = require(`${BABEL_ROOT}/@babel/parser`);

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
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

/** The exported name of a specifier, or null when it cannot be a public name. */
function specifierName(node) {
  if (!node) return null;
  if (node.type === 'Identifier') return node.name;
  if (node.type === 'StringLiteral') return node.value;
  return null;
}

/** Collect the binding names a declaration exposes (`const a = 1, b = 2`). */
function declaredNames(declaration, into) {
  if (!declaration) return;
  if (declaration.declarations) {
    for (const declarator of declaration.declarations) {
      const names = [];
      const collect = (pattern) => {
        if (!pattern) return;
        if (pattern.type === 'Identifier') names.push(pattern.name);
        else if (pattern.type === 'ObjectPattern') {
          for (const property of pattern.properties) {
            if (property.type === 'RestElement') collect(property.argument);
            else collect(property.value ?? property.argument);
          }
        } else if (pattern.type === 'ArrayPattern') {
          for (const element of pattern.elements) collect(element);
        } else if (pattern.type === 'AssignmentPattern') {
          collect(pattern.left);
        } else if (pattern.type === 'RestElement') {
          collect(pattern.argument);
        }
      };
      collect(declarator.id);
      for (const name of names) into.add(name);
    }
    return;
  }
  if (declaration.id) into.add(declaration.id.name);
}

/**
 * Extract the module's interface: its exported names and its import edges.
 * Both are sets, so ordering is irrelevant to the comparison.
 */
function interfaceOf(code) {
  const ast = parse(code);
  const exports = new Set();
  const imports = new Set();

  for (const statement of ast.program.body) {
    switch (statement.type) {
      case 'ImportDeclaration': {
        const source = statement.source.value;
        if (statement.specifiers.length === 0) {
          imports.add(`${source}::<side-effect>`);
        }
        for (const specifier of statement.specifiers) {
          if (specifier.type === 'ImportDefaultSpecifier') imports.add(`${source}::default`);
          else if (specifier.type === 'ImportNamespaceSpecifier') imports.add(`${source}::*`);
          else {
            const name = specifierName(specifier.imported);
            if (name) imports.add(`${source}::${name}`);
          }
        }
        break;
      }
      case 'ExportNamedDeclaration': {
        if (statement.source) {
          // `export { a, b as c } from './x.js'` and `export * from './x.js'`
          const source = statement.source.value;
          for (const specifier of statement.specifiers) {
            if (specifier.type === 'ExportNamespaceSpecifier') {
              exports.add(`* as ${specifierName(specifier.exported)}`);
              imports.add(`${source}::*`);
              continue;
            }
            const imported = specifierName(specifier.local);
            const exported = specifierName(specifier.exported);
            if (exported) exports.add(exported);
            if (imported) imports.add(`${source}::${imported}`);
          }
          break;
        }
        if (statement.declaration) declaredNames(statement.declaration, exports);
        for (const specifier of statement.specifiers) {
          if (specifier.type === 'ExportSpecifier') {
            const exported = specifierName(specifier.exported);
            if (exported) exports.add(exported);
          }
        }
        break;
      }
      case 'ExportDefaultDeclaration':
        exports.add('default');
        break;
      case 'ExportAllDeclaration': {
        const source = statement.source.value;
        // The re-exported names cannot be enumerated statically; record the
        // edge so that adding or removing the statement is still caught.
        exports.add(`* from ${source}`);
        imports.add(`${source}::*`);
        break;
      }
      default:
        break;
    }
  }

  return { exports: [...exports].sort(), imports: [...imports].sort() };
}

const [beforeDir, afterDir] = process.argv.slice(2);
const args = process.argv.slice(2);
const relative = (rel) => rel.replace(/^(?:frontend|\.)\//, '');

/**
 * Two modes, sharing `interfaceOf`:
 *
 *   <before-dir> <after-dir>     compare two trees (used around each rename batch)
 *   --write-lock <file>          freeze the current tree's exports
 *   --check-lock <file>          verify the tree still matches the frozen exports
 *
 * The lockfile records *exports only*, deliberately.  Import specifiers carry
 * `?v=...` cache-busting query strings that are bumped on purpose, which would
 * make a lockfile noisy; a broken named import is still caught, because it
 * shows up as a changed export set in the module that declares it.
 */
const writeLockAt = args.indexOf('--write-lock');
const checkLockAt = args.indexOf('--check-lock');

if (writeLockAt !== -1 || checkLockAt !== -1) {
  const isWrite = writeLockAt !== -1;
  const lockPath = path.resolve(args[(isWrite ? writeLockAt : checkLockAt) + 1] || '');
  const treeDir = path.join(path.resolve(process.cwd()), 'frontend');

  const current = new Map();
  for (const file of [...walk(treeDir)].sort()) {
    const rel = relative(path.relative(treeDir, file));
    try {
      current.set(rel, interfaceOf(fs.readFileSync(file, 'utf8')).exports);
    } catch (error) {
      console.log(`PARSEFAIL ${rel} :: ${error.message}`);
      process.exitCode = 1;
    }
  }

  if (isWrite) {
    fs.writeFileSync(lockPath, `${JSON.stringify(Object.fromEntries(current), null, 2)}\n`);
    console.log(`# wrote ${current.size} module interface(s) to ${path.relative(process.cwd(), lockPath)}`);
    process.exit(process.exitCode ?? 0);
  }

  if (!fs.existsSync(lockPath)) {
    console.error(`lockfile not found: ${lockPath}`);
    process.exit(2);
  }
  const frozen = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  let drifted = 0;

  for (const [rel, expected] of Object.entries(frozen)) {
    if (!current.has(rel)) {
      console.log(`MISSING  ${rel}`);
      drifted += 1;
      continue;
    }
    const actual = current.get(rel);
    const lost = expected.filter((name) => !actual.includes(name));
    const added = actual.filter((name) => !expected.includes(name));
    if (lost.length === 0 && added.length === 0) continue;
    drifted += 1;
    console.log(`DRIFT    ${rel}`);
    if (lost.length > 0) console.log(`  -export  ${lost.join(', ')}`);
    if (added.length > 0) console.log(`  +export  ${added.join(', ')}`);
  }

  for (const rel of current.keys()) {
    if (!(rel in frozen)) {
      console.log(`NEW      ${rel}`);
      drifted += 1;
    }
  }

  console.log(
    `# frozen=${Object.keys(frozen).length} present=${current.size} drifted=${drifted}`
  );
  if (drifted > 0) process.exitCode = 1;
  process.exit(process.exitCode ?? 0);
}

if (!beforeDir || !afterDir) {
  console.error('usage: node tools/verify_frontend_public_api.mjs <before-dir> <after-dir>');
  console.error('       node tools/verify_frontend_public_api.mjs --write-lock <file>');
  console.error('       node tools/verify_frontend_public_api.mjs --check-lock <file>');
  process.exit(2);
}

const beforeFiles = new Map();
for (const file of walk(beforeDir)) beforeFiles.set(path.relative(beforeDir, file), file);
const afterFiles = new Map();
for (const file of walk(afterDir)) afterFiles.set(path.relative(afterDir, file), file);

const missingFrom = (a, b) => a.filter((item) => !b.includes(item));

let identical = 0;
let changed = 0;
let failed = 0;
let missing = 0;

for (const [rel, beforePath] of [...beforeFiles].sort()) {
  const afterPath = afterFiles.get(rel);
  if (!afterPath) {
    console.log(`MISSING  ${relative(rel)}`);
    missing += 1;
    continue;
  }

  let before;
  let after;
  try {
    before = interfaceOf(fs.readFileSync(beforePath, 'utf8'));
    after = interfaceOf(fs.readFileSync(afterPath, 'utf8'));
  } catch (error) {
    console.log(`PARSEFAIL ${relative(rel)} :: ${error.message}`);
    failed += 1;
    continue;
  }

  const addedExports = missingFrom(after.exports, before.exports);
  const lostExports = missingFrom(before.exports, after.exports);
  const addedImports = missingFrom(after.imports, before.imports);
  const lostImports = missingFrom(before.imports, after.imports);

  if (
    addedExports.length === 0 &&
    lostExports.length === 0 &&
    addedImports.length === 0 &&
    lostImports.length === 0
  ) {
    identical += 1;
    continue;
  }

  changed += 1;
  console.log(`CHANGED  ${relative(rel)}`);
  if (lostExports.length > 0) console.log(`  -export  ${lostExports.join(', ')}`);
  if (addedExports.length > 0) console.log(`  +export  ${addedExports.join(', ')}`);
  if (lostImports.length > 0) console.log(`  -import  ${lostImports.join(', ')}`);
  if (addedImports.length > 0) console.log(`  +import  ${addedImports.join(', ')}`);
}

for (const rel of afterFiles.keys()) {
  if (!beforeFiles.has(rel)) {
    console.log(`EXTRA    ${relative(rel)}`);
    missing += 1;
  }
}

console.log(
  `# unchanged=${identical} changed=${changed} parse-failures=${failed} ` +
    `missing-or-extra=${missing} total-before=${beforeFiles.size} total-after=${afterFiles.size}`
);

if (changed > 0 || failed > 0 || missing > 0) process.exitCode = 1;
