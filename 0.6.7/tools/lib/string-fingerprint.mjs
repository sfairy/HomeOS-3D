#!/usr/bin/env node
/**
 * The string multiset of one file, as a single digest.
 *
 * Rule 3 of the naming programme is "string content is byte-identical", and no
 * tool enforced it per batch: tools/verify_frontend_strings.mjs counts strings the
 * original decoder produced that the current file no longer contains anywhere
 * (`lost`), and its raw-substring fallback means a *rewritten* string - the old
 * text gone, an edited one in its place - still passes, because the file it is
 * compared against is the pre-de-obfuscation original, where several hundred
 * common values ("className", "type", "children") legitimately lost their literals
 * to computed-member normalisation.  Measured on the tree as delivered:
 * changed-strings=490 across 85 files, all of them normalisation artefacts, so the
 * original is the wrong oracle for "was this string edited?".
 *
 * The right oracle is the file itself, before the batch: a rename must not move one
 * string literal.  This module reduces a file to a digest of its StringLiteral and
 * TemplateElement values *with their counts* - so an edit, an insertion, a deletion
 * and a duplication all change it, while re-indentation, line breaks, moved code
 * and renamed identifiers do not.  tools/verify_frontend_batch_snapshots.mjs uses
 * it to compare each declared file against its pre-batch rollback copy.
 *
 * Deliberately NOT a parse-and-print of the code: Babel's cooked values are stable
 * across quote style and escape spelling, which is exactly the equivalence the rule
 * means.
 */

import crypto from 'node:crypto';
import { createRequire } from 'node:module';

import { resolveBabelRoot } from './babel-root.mjs';

const require = createRequire(import.meta.url);
const BABEL_ROOT = resolveBabelRoot();
const parser = require(`${BABEL_ROOT}/@babel/parser`);
const traverse = require(`${BABEL_ROOT}/@babel/traverse`).default;

/**
 * Every string value the file contains as a literal, with its multiplicity.
 *
 * `errorRecovery: false`: a file that does not parse must never compare equal to
 * anything, so parse errors are left for the caller to surface.
 */
export function stringMultiset(code) {
  const ast = parser.parse(code, { sourceType: 'module', errorRecovery: false });
  const counts = new Map();
  const add = (value) => counts.set(value, (counts.get(value) || 0) + 1);
  traverse(ast, {
    StringLiteral(p) {
      add(p.node.value);
    },
    TemplateElement(p) {
      const cooked = p.node.value.cooked;
      if (typeof cooked === 'string') add(cooked);
    },
  });
  return counts;
}

/** Stable digest of a multiset: sorted, so code order cannot influence it. */
export function digestMultiset(counts) {
  const sorted = [...counts.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const hash = crypto.createHash('sha256');
  for (const [value, count] of sorted) {
    hash.update(`${count}\u0000${value}\n`);
  }
  return hash.digest('hex');
}

export function stringDigest(code) {
  return digestMultiset(stringMultiset(code));
}

/** Human-readable summary for a mismatch report. */
export function describeDifference(before, after) {
  const names = new Set([...before.keys(), ...after.keys()]);
  const lines = [];
  for (const value of [...names].sort()) {
    const b = before.get(value) || 0;
    const a = after.get(value) || 0;
    if (b === a) continue;
    const shown = value.length > 90 ? `${value.slice(0, 90)}...` : value;
    lines.push(`        ${JSON.stringify(shown)} before=${b} after=${a}`);
  }
  return lines;
}
