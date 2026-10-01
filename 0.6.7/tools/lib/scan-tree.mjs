/**
 * Deterministic sha256 manifest of a directory tree.
 *
 * Both `tools/verify_frontend_batch_delta.mjs` (did this batch touch anything it
 * did not declare?) and the batch snapshot tooling need the same answer to "which
 * files are here and what do they contain", so the walk lives here once.
 *
 * The walk is deliberately boring: sorted posix-relative paths, sha256 of the
 * bytes, symlinks recorded by their target instead of being followed (a followed
 * symlink can walk out of the tree, and a cycle would hang the gate).
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

/**
 * Paths that are never part of "the tree" for batch purposes.
 *
 * `.restore` holds the baselines and the rollback snapshots - writing a snapshot
 * IS part of a batch, so a gate that counted it as an undeclared change would
 * fail every batch.  `graphflow-out`/`.graphflow` are tool scratch.  The rest is
 * ordinary build junk.
 */
export const DEFAULT_IGNORES = [
  // The host application's own runtime state: a live SQLite database plus its
  // -wal/-shm sidecars, caches, logs and secrets.  The running app rewrites
  // these on its own schedule, so they are not source and cannot be held still
  // across a batch; the gate compares source, not the app's scratch space.
  'data',
  '.restore',
  'node_modules',
  '.git',
  '.graphflow',
  'graphflow-out',
  '__pycache__',
  '.venv',
  'venv',
  '.npm',
];

function isIgnored(rel, ignores) {
  for (const entry of ignores) {
    if (rel === entry || rel.startsWith(entry + '/')) return true;
  }
  return false;
}

function sha256File(abs) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(abs));
  return hash.digest('hex');
}

/**
 * @param {string} root        directory to walk (absolute, or relative to cwd)
 * @param {string[]} [ignores] path prefixes to skip, posix, relative to root
 * @returns {Map<string, string>} posix-relative path -> sha256 (or "symlink:<target>")
 */
export function scanTree(root, ignores = DEFAULT_IGNORES) {
  const base = path.resolve(root);
  const files = new Map();

  const walk = (dir, relDir) => {
    const entries = fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const entry of entries) {
      if (entry.name === '.DS_Store') continue;
      const rel = relDir ? relDir + '/' + entry.name : entry.name;
      if (isIgnored(rel, ignores)) continue;
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(abs, rel);
      } else if (entry.isSymbolicLink()) {
        files.set(rel, 'symlink:' + fs.readlinkSync(abs));
      } else if (entry.isFile()) {
        files.set(rel, sha256File(abs));
      }
      // sockets/fifos/devices are not part of a source tree; ignore.
    }
  };

  walk(base, '');
  return files;
}

export function readDeclaredFiles(rel) {
  let text;
  try {
    text = fs.readFileSync(rel, 'utf8');
  } catch (error) {
    throw new Error(`cannot read the declared-file list ${rel}: ${error.code || error.message}`);
  }
  const out = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;
    out.push(line.replace(/^\.\//, ''));
  }
  return out;
}
