#!/usr/bin/env node
//
// Guards the one coupling that lexical renaming cannot see.
//
// A *classic* script (no `import` / `export`) publishes its program-level
// bindings to the global scope, so a bare reference in a DIFFERENT file
// resolves to them.  The declaration site is lexically bound, which means the
// renamer is entitled to rename it, and no single-file check can object: the
// evidence that the name is load-bearing lives in the other file.
//
// So renaming `s` -> `applyPairingHash` inside `pair.js` is alpha-equivalent
// from `pair.js`'s point of view while silently breaking a bare `s` reference
// in `pairing-entry.js`.
//
// This check pairs a baseline tree (a git ref, the initial commit by default)
// with the working tree:
//
//   1. for every classic frontend script, collect the names it publishes to the
//      global scope (program-level declarations, plus `window.X =` style
//      assignments from IIFE-wrapped scripts),
//   2. compute the names published at baseline but no longer published now,
//   3. resolve every frontend file's *free* identifiers - referenced but not
//      bound anywhere in that file, i.e. names that expect to come from the
//      global scope,
//   4. fail if any vanished name is still referenced as a free identifier.
//
// Step 3 is why this uses an AST rather than a text search: baseline names were
// obfuscated, so most of them are one or two characters and a word-boundary
// grep for `s` matches unrelated code everywhere.
//
// Usage:  node tools/verify_frontend_globals.mjs [--baseline <ref>] [--verbose]

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { resolveBabelRoot } from './lib/babel-root.mjs';

const require = createRequire(import.meta.url);
const BABEL_ROOT = resolveBabelRoot();

const parser = require(`${BABEL_ROOT}/@babel/parser`);
const traverse = require(`${BABEL_ROOT}/@babel/traverse`).default;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FRONTEND = path.join(ROOT, 'frontend');

const GLOBAL_OBJECTS = new Set(['window', 'globalThis', 'self', 'top']);

function parse(code) {
  return parser.parse(code, {
    sourceType: 'unambiguous',
    errorRecovery: false,
    allowReturnOutsideFunction: true,
  });
}

/**
 * Aliases for the global object introduced by the common classic-script wrapper
 * `(function (bridgeWindow) { ... })(window)`.
 *
 * Without this, `bridgeWindow.HABridgeLog = ...` looks like an assignment to
 * some unrelated object and the publish is missed entirely.  That wrapper is the
 * idiomatic shape for this codebase's classic scripts, so missing it would mean
 * the check silently passes on exactly the scripts it exists to guard.
 */
function globalObjectAliases(ast) {
  const aliases = new Map();
  traverse(ast, {
    CallExpression(p) {
      const callee = p.node.callee;
      if (callee.type !== 'FunctionExpression' && callee.type !== 'ArrowFunctionExpression') {
        return;
      }
      p.node.arguments.forEach((argument, index) => {
        if (argument.type !== 'Identifier' || !GLOBAL_OBJECTS.has(argument.name)) return;
        const parameter = callee.params[index];
        if (parameter && parameter.type === 'Identifier') {
          aliases.set(parameter.name, argument.name);
        }
      });
    },
  });
  return aliases;
}

function isClassicScript(ast) {
  return !ast.program.body.some((node) =>
    [
      'ImportDeclaration',
      'ExportNamedDeclaration',
      'ExportDefaultDeclaration',
      'ExportAllDeclaration',
    ].includes(node.type),
  );
}

/**
 * What does this file hand to the global scope?
 *
 * Program-level declarations in a classic script become global (a `function` or
 * `var` as a property of the global object, `let`/`const`/`class` in its
 * lexical scope) - both are reachable by a later classic script.  An
 * IIFE-wrapped script publishes nothing this way and instead has to assign
 * explicitly, so `window.X = ...` counts too.
 */
function publishedNames(ast) {
  const published = new Map();
  const aliases = globalObjectAliases(ast);

  if (isClassicScript(ast)) {
    for (const node of ast.program.body) {
      // `export` shapes are impossible here, so only plain declarations remain.
      if (node.type === 'VariableDeclaration') {
        for (const declarator of node.declarations) {
          if (declarator.id.type === 'Identifier') {
            published.set(declarator.id.name, node.kind);
          }
        }
      } else if (
        (node.type === 'FunctionDeclaration' || node.type === 'ClassDeclaration') &&
        node.id
      ) {
        published.set(node.id.name, node.type === 'ClassDeclaration' ? 'class' : 'function');
      }
    }
  }

  traverse(ast, {
    AssignmentExpression(p) {
      const { left } = p.node;
      if (left.type !== 'MemberExpression' || left.computed) return;
      if (left.property.type !== 'Identifier' || left.object.type !== 'Identifier') return;
      const objectName = aliases.get(left.object.name) || left.object.name;
      if (!GLOBAL_OBJECTS.has(objectName)) return;
      published.set(left.property.name, `${objectName}.`);
    },
  });

  return published;
}

/**
 * Every site that could be reaching for a name from the global scope.
 *
 * Two shapes matter, and they need different treatment:
 *
 *   - a bare `probeTarget()` - a free identifier, the natural way to reach a
 *     top-level declaration of a classic script;
 *   - `window.probeApi` - a property access, the natural way to reach what an
 *     IIFE-wrapped script assigned to the global object.
 *
 * Property accesses are included because otherwise the check would under-report:
 * a name could vanish from a publisher while consumers still reach for it,
 * and the check would announce that nothing dangles.  The renamer does not touch
 * non-computed property names, so this should stay quiet in practice - it is
 * here so that the check's claim holds for both consumption styles rather than
 * only for the one that happens to be common.
 */
function globalReferenceSites(ast) {
  const sites = new Map();
  const record = (name, node, via) => {
    if (sites.has(name)) return;
    sites.set(name, { line: node.loc ? node.loc.start.line : 0, via });
  };

  traverse(ast, {
    Identifier(p) {
      if (p.isReferencedIdentifier()) {
        if (!p.scope.getBinding(p.node.name)) record(p.node.name, p.node, 'bare');
        return;
      }
      const parent = p.parentPath ? p.parentPath.node : null;
      if (
        parent &&
        (parent.type === 'MemberExpression' || parent.type === 'OptionalMemberExpression') &&
        parent.property === p.node &&
        !parent.computed
      ) {
        record(p.node.name, p.node, 'property');
      }
    },
  });

  return sites;
}

function git(args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28 });
}

function listJsFiles(dir) {
  const files = [];
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'vendor') continue;
        walk(full);
      } else if (entry.name.endsWith('.js')) {
        files.push(full);
      }
    }
  };
  walk(dir);
  return files;
}

function relativeJsFiles(dir) {
  return listJsFiles(dir).map((full) => path.relative(dir, full));
}

function analyze(code) {
  const ast = parse(code);
  return {
    classic: isClassicScript(ast),
    published: publishedNames(ast),
    sites: globalReferenceSites(ast),
  };
}

function main() {
  const argv = process.argv.slice(2);
  let baselineRef = null;
  let baselineDir = null;
  let frontendRoot = FRONTEND;
  let verbose = false;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--baseline') {
      baselineRef = argv[i + 1];
      i += 1;
    } else if (argv[i] === '--baseline-dir') {
      baselineDir = path.resolve(argv[i + 1]);
      i += 1;
    } else if (argv[i] === '--frontend-root') {
      frontendRoot = path.resolve(argv[i + 1]);
      i += 1;
    } else if (argv[i] === '--verbose') {
      verbose = true;
    }
  }

  // Two ways to supply the "before" tree.  A git ref is what CI uses; a plain
  // directory is what the self-test uses, so the check can be shown to fail on a
  // fixture without manufacturing commits in the real repository.
  const listBaseline = baselineDir
    ? () => relativeJsFiles(baselineDir)
    : () => git(['ls-tree', '-r', '--name-only', baselineRef, '--', 'frontend'])
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.endsWith('.js') && !line.includes('/vendor/'));

  if (!baselineDir && !baselineRef) {
    baselineRef = git(['log', '--format=%H', '--reverse']).split('\n')[0].trim();
  }

  const readBaseline = (relPath) =>
    baselineDir
      ? fs.readFileSync(path.join(baselineDir, relPath), 'utf8')
      : git(['show', `${baselineRef}:${relPath}`]);

  const parseFailures = [];
  const vanished = new Map(); // name -> { file, kind }
  const currentPublished = new Set();

  // 1 + 2: names a classic script used to publish to the global scope, minus the
  // ones it still publishes.
  for (const relPath of listBaseline()) {
    // A git-ref baseline carries frontend/-prefixed paths; a dir baseline does not.
    const currentRelPath = baselineDir
      ? relPath
      : path.relative(FRONTEND, path.join(ROOT, relPath));
    const full = path.join(frontendRoot, currentRelPath);
    if (!fs.existsSync(full)) continue;

    let before;
    let after;
    try {
      before = analyze(readBaseline(relPath));
      after = analyze(fs.readFileSync(full, 'utf8'));
    } catch (error) {
      parseFailures.push(`${relPath}: ${error.message.split('\n')[0]}`);
      continue;
    }

    for (const [name] of after.published) currentPublished.add(name);
    if (!before.classic) continue;

    for (const [name, kind] of before.published) {
      if (!after.published.has(name)) {
        vanished.set(name, { file: currentRelPath, kind });
      }
    }
  }

  if (parseFailures.length > 0) {
    console.log(`FAIL  could not parse ${parseFailures.length} file(s):`);
    for (const failure of parseFailures.slice(0, 10)) console.log(`        ${failure}`);
    process.exit(1);
  }

  if (vanished.size === 0) {
    console.log('PASS  no classic script stopped publishing a global name');
    return;
  }

  // 3 + 4: is any vanished name still reached for from the global scope?
  const breakages = [];
  for (const full of listJsFiles(frontendRoot)) {
    const relPath = path.relative(frontendRoot, full);
    let sites;
    try {
      sites = globalReferenceSites(parse(fs.readFileSync(full, 'utf8')));
    } catch {
      continue; // a file that cannot be parsed is already reported elsewhere
    }
    for (const [name, site] of sites) {
      const origin = vanished.get(name);
      if (!origin) continue;
      // A name the file publishes itself is not a cross-file reference.
      if (currentPublished.has(name) && origin.file === relPath) continue;
      breakages.push({ name, origin, at: `${relPath}:${site.line}`, via: site.via });
    }
  }

  if (breakages.length > 0) {
    console.log(`FAIL  ${breakages.length} dangling global reference(s) left by renaming:`);
    for (const { name, origin, at, via } of breakages.slice(0, 40)) {
      console.log(`        ${at}  reaches global "${name}" (${via})`);
      console.log(`          but ${origin.file} stopped publishing it (was a ${origin.kind})`);
    }
    process.exit(1);
  }

  if (verbose) {
    console.log(`# vanished but unreferenced: ${[...vanished.keys()].join(', ')}`);
  }
  const label = baselineDir ? path.basename(baselineDir) : baselineRef.slice(0, 7);
  console.log(
    `PASS  vanished globals=${vanished.size} dangling-references=0 (baseline ${label})`,
  );
}

main();
