/**
 * Resolve the directory holding the Babel packages this toolchain loads
 * (@babel/parser, @babel/traverse, @babel/generator, @babel/types).
 *
 * Every tool here used to inline the same absolute path into one machine's npx
 * cache (/Users/<user>/.npm/_npx/<hash>/node_modules).  That path is not part of
 * the project: when npx evicts or re-keys the cache the `require()` throws a
 * module-not-found inside all fourteen tools at once, and the gate reads as a
 * broken tree rather than a missing dependency.
 *
 * Resolution order:
 *   1. $BABEL_ROOT                         explicit override, always wins
 *   2. <repo>/tools/node_modules            a real pinned install (preferred)
 *   3. any $HOME/.npm/_npx/<hash>/node_modules that actually has @babel/parser
 *
 * Throws with an actionable message when nothing usable is found, so callers
 * fail as "dependency missing" instead of as a syntax error.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const LIB_DIR = path.dirname(fileURLToPath(import.meta.url));

/** A root is usable when it really contains @babel/parser. */
function usable(root) {
  if (!root) return false;
  try {
    return fs.existsSync(path.join(root, '@babel', 'parser'));
  } catch {
    return false;
  }
}

/** Every npx cache dir under $HOME/.npm/_npx, newest first (best guess first). */
function npxCacheRoots() {
  const base = path.join(os.homedir(), '.npm', '_npx');
  let entries;
  try {
    entries = fs.readdirSync(base, { withFileTypes: true });
  } catch {
    return [];
  }
  const roots = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const root = path.join(base, entry.name, 'node_modules');
    let stat;
    try {
      stat = fs.statSync(root);
    } catch {
      continue;
    }
    roots.push({ root, mtime: stat.mtimeMs });
  }
  roots.sort((a, b) => b.mtime - a.mtime);
  return roots.map((r) => r.root);
}

export function resolveBabelRoot() {
  const candidates = [
    process.env.BABEL_ROOT,
    path.resolve(LIB_DIR, '..', 'node_modules'),
    ...npxCacheRoots(),
  ];
  for (const candidate of candidates) {
    if (usable(candidate)) return candidate;
  }
  throw new Error(
    [
      'Cannot find @babel/parser.',
      'Checked: $BABEL_ROOT, ' +
        path.resolve(LIB_DIR, '..', 'node_modules') +
        ', and ' +
        npxCacheRoots().length +
        ' npx cache dir(s).',
      'Fix: run  npm --prefix tools install  (a pinned tools/node_modules),',
      'or set BABEL_ROOT=/path/to/node_modules before re-running.',
    ].join('\n')
  );
}
