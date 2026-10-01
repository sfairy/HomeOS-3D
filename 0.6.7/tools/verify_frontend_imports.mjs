/**
 * Check that every frontend ES module import resolves to a file on disk.
 *
 * The de-obfuscation renamed ~110k identifiers, and the frontend ships as
 * native ES modules whose specifiers carry `?v=...` cache-busting query
 * strings.  A single mangled or mistyped path would only show up at runtime as
 * a failed module load, so this resolves the whole module graph statically:
 *
 *   - `./renderer/renderer.js?v=2026...`  -> the file must exist
 *   - `../utils/audio.js`                 -> the file must exist
 *   - a bare specifier such as `three`    -> reported separately (the app is
 *     served without an import map, so bare specifiers are expected to be
 *     absent; any that appear are listed for review)
 *
 * Also verifies that no specifier was left with an obfuscated name.
 *
 * A relative specifier is resolved the way the *browser* resolves it: against
 * the module's own served URL, not against its position on disk (see `SERVED`
 * below).  Specifiers that still land outside the tree can be declared with
 * `--external <dir>`; they are then reported as `EXTERNAL` instead of failing.
 *
 * Usage:
 *   node tools/verify_frontend_imports.mjs [dir] [--external <dir>]...
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

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (entry.isFile() && entry.name.endsWith('.js')) yield full;
  }
}

function collectSpecifiers(file) {
  const code = fs.readFileSync(file, 'utf8');
  const ast = parser.parse(code, { sourceType: 'module', errorRecovery: false });
  const specifiers = [];
  const visit = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const child of node) visit(child);
      return;
    }
    if (
      (node.type === 'ImportDeclaration' ||
        node.type === 'ExportNamedDeclaration' ||
        node.type === 'ExportAllDeclaration') &&
      node.source &&
      typeof node.source.value === 'string'
    ) {
      specifiers.push({ value: node.source.value, line: node.loc.start.line });
    }
    // Dynamic `import()` is emitted as `ImportExpression` by newer Babel and as
    // a `CallExpression` whose callee is `Import` by older versions.  Missing
    // the second shape silently skips every runtime module load the app
    // performs, which is exactly how `interaction3d/editor.js` pulls in the
    // server-served `config-editor.js`.
    const dynamicSource =
      node.type === 'ImportExpression'
        ? node.source
        : node.type === 'CallExpression' && node.callee && node.callee.type === 'Import'
          ? node.arguments[0]
          : null;
    if (dynamicSource) {
      if (dynamicSource.type === 'StringLiteral') {
        specifiers.push({ value: dynamicSource.value, line: node.loc.start.line });
      } else {
        specifiers.push({ value: null, line: node.loc.start.line });
      }
    }
    for (const key of Object.keys(node)) {
      if (key === 'loc' || key === 'leadingComments' || key === 'trailingComments') {
        continue;
      }
      visit(node[key]);
    }
  };
  visit(ast.program);
  return specifiers;
}

const argv = process.argv.slice(2);
const target =
  argv[0] && !argv[0].startsWith('--') ? path.resolve(argv[0]) : path.join(ROOT, 'frontend');
const EXTERNALS = [];
for (let i = 0; i < argv.length; i += 1) {
  if (argv[i] === '--external') {
    EXTERNALS.push(path.resolve(ROOT, argv[i + 1]));
    i += 1;
  }
}
const isExternal = (resolved) =>
  EXTERNALS.some((root) => resolved === root || resolved.startsWith(`${root}${path.sep}`));

/**
 * Root-absolute specifiers are served by the app's static mounts or routers.
 *
 * `main.py` mounts `/bridge-static` on `<project>/frontend/static`, and
 * `backend/app/modules/interaction3d/api.py` serves
 * `GET /api/v1/modules/interaction3d/{filename}` out of
 * `<project>/frontend/modules/interaction3d`.  Both have to be resolved against
 * their owning directory rather than the project root — the second one is easy
 * to overlook, because that tree is *only* reachable through the API route:
 * `interaction3d/editor.js` does `await import('/api/v1/modules/.../config-editor.js')`.
 */
const MOUNTS = [
  ['/bridge-static/', path.join(ROOT, 'frontend', 'static')],
  ['/api/v1/modules/interaction3d/', path.join(ROOT, 'frontend', 'modules', 'interaction3d')],
];

function resolveAbsolute(specifier) {
  for (const [prefix, mountRoot] of MOUNTS) {
    if (specifier.startsWith(prefix)) {
      return path.join(mountRoot, specifier.slice(prefix.length));
    }
  }
  return path.join(ROOT, specifier.replace(/^\//, ''));
}

/**
 * Trees that are served under a URL prefix.
 *
 * `frontend/static/**` is mounted at `/bridge-static/**`, and
 * `frontend/modules/interaction3d/**` is served by the
 * `GET /api/v1/modules/interaction3d/{filename}` router.  Because a relative
 * specifier is resolved by the browser against the module's own URL, the
 * cross-tree imports in this release only make sense in URL space:
 * `modules/interaction3d/config-editor.js` (served as
 * `/api/v1/modules/interaction3d/config-editor.js`) reaches
 * `/bridge-static/utils/random-id.js` with `../../../../bridge-static/utils/random-id.js`,
 * and `static/modules/interaction3d/editor.js` (served as
 * `/bridge-static/modules/interaction3d/editor.js`) reaches the API router with
 * `../../../api/v1/modules/interaction3d/config-editor.js`.  Resolving those on
 * disk instead reported 26 specifiers as unresolved that the browser loads fine.
 */
const SERVED = [
  [path.join(ROOT, 'frontend', 'static') + path.sep, '/bridge-static/'],
  [
    path.join(ROOT, 'frontend', 'modules', 'interaction3d') + path.sep,
    '/api/v1/modules/interaction3d/',
  ],
];

function resolveServed(file, specifier) {
  const served = SERVED.find(([dir]) => file.startsWith(dir));
  if (!served) return path.resolve(path.dirname(file), specifier);
  const [dir, prefix] = served;
  const relDir = path.relative(dir, path.dirname(file)).split(path.sep).join('/');
  const urlPath = path.posix.normalize(
    path.posix.join(`${prefix}${relDir ? `${relDir}/` : ''}`, specifier)
  );
  return resolveAbsolute(urlPath.startsWith('/') ? urlPath : `/${urlPath}`);
}

let files = 0;
let specifiers = 0;
let dynamic = 0;
const unresolved = [];
const bare = [];
const external = [];

for (const file of walk(target)) {
  files += 1;
  for (const spec of collectSpecifiers(file)) {
    specifiers += 1;
    const rel = path.relative(ROOT, file);
    if (spec.value === null) {
      dynamic += 1;
      console.log(`DYNAMIC ${rel}:${spec.line} (non-literal import)`);
      continue;
    }
    const source = spec.value;
    if (source.startsWith('.') || source.startsWith('/')) {
      const withoutQuery = source.split('?')[0].split('#')[0];
      const resolved = withoutQuery.startsWith('/')
        ? resolveAbsolute(withoutQuery)
        : resolveServed(file, withoutQuery);
      if (!fs.existsSync(resolved)) {
        if (isExternal(resolved)) {
          external.push({ file: rel, line: spec.line, source, expected: resolved });
        } else {
          unresolved.push({ file: rel, line: spec.line, source, expected: resolved });
        }
      }
    } else {
      bare.push({ file: rel, line: spec.line, source });
    }
    if (/_0x[0-9a-f]{4,}/.test(source)) {
      unresolved.push({
        file: rel,
        line: spec.line,
        source,
        expected: '(specifier still contains an obfuscated name)',
      });
    }
  }
}

for (const item of external) {
  console.log(`EXTERNAL   ${item.file}:${item.line}  "${item.source}"  -> ${item.expected}`);
}
for (const item of unresolved) {
  console.log(`UNRESOLVED ${item.file}:${item.line}  "${item.source}"  -> ${item.expected}`);
}
for (const item of bare) {
  console.log(`BARE       ${item.file}:${item.line}  "${item.source}"`);
}
if (dynamic > 0) {
  console.log(`# note: ${dynamic} dynamic import(s) could not be checked statically`);
}
console.log(
  `# scanned files=${files} specifiers=${specifiers} ` +
    `unresolved=${unresolved.length} bare=${bare.length} external=${external.length}`
);
if (unresolved.length > 0) process.exitCode = 1;
