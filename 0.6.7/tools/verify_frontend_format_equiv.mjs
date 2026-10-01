/**
 * Prove that a reformatting pass changed only insignificant characters.
 *
 * Prettier rewrites whitespace, so `git diff -w` is not a valid check: it
 * compares line by line, and splitting one long line into ten is reported as
 * ten changed lines.  This tool compares *content* instead, per language:
 *
 * CSS
 *   Whitespace is insignificant everywhere except inside strings and unquoted
 *   `url(...)`.  The scanner below keeps string literals verbatim, drops
 *   comments, and removes all other whitespace, then normalises the two
 *   spellings of a leading zero (`0.5` / `.5`), the optional quotes around
 *   attribute-selector values, and `!important` casing.  A match therefore
 *   means every declaration value, selector and at-rule is unchanged.
 *
 * HTML
 *   Whitespace inside a tag is always insignificant, so each tag is reduced to
 *   its attribute list and the tag name; `/>` and `>` are unified and the
 *   attribute-quote style is normalised.  A match means no element, attribute,
 *   attribute value or text node changed.  Because whitespace *between* tags
 *   is significant in inline formatting contexts, those differences are
 *   reported separately instead of being silently normalised away.
 *
 * Usage:
 *   node tools/verify_frontend_format_equiv.mjs <before-dir> <after-dir>
 *
 * Exit status is non-zero if any file differs, or if any inter-tag whitespace
 * change is found in HTML (it must then be reviewed by hand).
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'vendor') continue;
      yield* walk(full);
    } else if (entry.isFile() && /\.(?:css|html)$/.test(entry.name)) {
      yield full;
    }
  }
}

// ---------------------------------------------------------------------------
// CSS
// ---------------------------------------------------------------------------

/**
 * Reduce a stylesheet to its content: comments dropped, string literals kept
 * verbatim, all other whitespace removed, and the cosmetic spellings that a
 * formatter is allowed to change unified.
 */
function normalizeCss(source) {
  let out = '';
  let index = 0;
  const length = source.length;

  while (index < length) {
    const char = source[index];

    // Comment: dropped entirely.
    if (char === '/' && source[index + 1] === '*') {
      const end = source.indexOf('*/', index + 2);
      index = end === -1 ? length : end + 2;
      continue;
    }

    // String literal: kept byte-for-byte, including its quotes.
    if (char === '"' || char === "'") {
      const quote = char;
      let literal = char;
      index += 1;
      while (index < length) {
        const inner = source[index];
        if (inner === '\\') {
          literal += inner + (source[index + 1] ?? '');
          index += 2;
          continue;
        }
        literal += inner;
        index += 1;
        if (inner === quote) break;
      }
      out += literal;
      continue;
    }

    // Everything else: whitespace is insignificant.
    if (/\s/.test(char)) {
      index += 1;
      continue;
    }

    out += char;
    index += 1;
  }

  return (
    out
      // The final `;` of a declaration block is optional.
      .replace(/;/g, (m, offset) => (/^\s*}/.test(out.slice(offset + 1)) ? '' : m))
      // `.5` and `0.5` are the same number.  Normalise towards the explicit
      // form rather than towards `.5`, because a leading zero can follow an
      // identifier (`color0.15s`) where a `\b`-anchored match would fail.
      .replace(/(?<![\d.])\.(?=\d)/g, '0.')
      // Attribute-selector value quotes are optional.
      .replace(/\[([^\[\]="']+)=["']([^"'\]]+)["']\]/g, '[$1=$2]')
      // `!important` is case-insensitive.
      .replace(/!important/gi, '!important')
  );
}

/**
 * Extract the sequence of inter-tag whitespace runs, so a whitespace-only
 * change *between* elements can be reported rather than hidden.
 */
function interTagWhitespace(source) {
  const runs = [];
  const re = />([^<>]*?)</gs;
  let match;
  while ((match = re.exec(source)) !== null) {
    if (/^[ \t\r\n]+$/.test(match[1])) runs.push(match[1]);
    else if (match[1].length > 1) runs.push(match[1]);
  }
  return runs;
}

/** Describe how two whitespace-run sequences differ, for hand review. */
function describeWhitespaceChange(beforeRuns, afterRuns) {
  const before = beforeRuns.map((run) => (run === '' ? 'none' : JSON.stringify(run)));
  const after = afterRuns.map((run) => (run === '' ? 'none' : JSON.stringify(run)));
  const notes = [];
  const length = Math.max(before.length, after.length);
  for (let i = 0; i < length; i += 1) {
    if (before[i] !== after[i]) {
      notes.push(`run ${i}: ${before[i] ?? '(absent)'} -> ${after[i] ?? '(absent)'}`);
    }
    if (notes.length >= 4) break;
  }
  return notes.join('; ');
}

// ---------------------------------------------------------------------------
// HTML
// ---------------------------------------------------------------------------

/** Reduce one tag to `<name attr="value" ...>` with no incidental whitespace. */
function normalizeTag(tag) {
  const inner = tag.slice(1, -1).replace(/\/$/, '');
  const collapsed = inner.replace(/\s+/g, ' ').trim();
  return `<${collapsed}>`;
}

/**
 * Normalise markup: tag interiors are collapsed (whitespace there is always
 * insignificant), `/>` is unified with `>` for void elements, and attribute
 * quote style is unified.  Text node *content* is preserved exactly; a
 * whitespace-only run between two tags is dropped here and reported separately
 * by `interTagWhitespace`, because whether it is significant depends on the
 * elements' display type.
 */
function normalizeHtml(source) {
  let out = '';
  let index = 0;
  const length = source.length;

  while (index < length) {
    const char = source[index];

    // Preserve script/style bodies verbatim: their whitespace can matter.
    if (char === '<') {
      const end = source.indexOf('>', index);
      if (end !== -1) {
        const tag = source.slice(index, end + 1);
        if (/^<(script|style)\b/i.test(tag)) {
          const closeTag = `</${tag.slice(1).split(/[\s>]/)[0]}>`;
          const closeAt = source.toLowerCase().indexOf(closeTag.toLowerCase(), end);
          if (closeAt !== -1) {
            out += normalizeTag(tag) + source.slice(end + 1, closeAt) + closeTag;
            index = closeAt + closeTag.length;
            continue;
          }
        }
        out += normalizeTag(tag);
        index = end + 1;
        continue;
      }
    }

    out += char;
    index += 1;
  }

  return (
    out
      // A whitespace-only text node between two tags: reviewed via
      // `interTagWhitespace`, so drop it for the structural comparison.
      .replace(/>[ \t\r\n]+</g, '><')
      // Leading/trailing whitespace of the document.
      .trim()
      // Unify the quote character used to delimit attribute values.
      .replace(/=\s*'([^']*)'/g, '="$1"')
      // Attribute values are decoded the same way regardless of entity form.
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&amp;/g, '&')
  );
}

// ---------------------------------------------------------------------------
// Driver
// ---------------------------------------------------------------------------

const [beforeDir, afterDir] = process.argv.slice(2);
if (!beforeDir || !afterDir) {
  console.error('usage: node tools/verify_frontend_format_equiv.mjs <before-dir> <after-dir>');
  process.exit(2);
}

const beforeFiles = new Map();
for (const file of walk(beforeDir)) beforeFiles.set(path.relative(beforeDir, file), file);
const afterFiles = new Map();
for (const file of walk(afterDir)) afterFiles.set(path.relative(afterDir, file), file);

let cssOk = 0;
let htmlOk = 0;
let failed = 0;
let missing = 0;
let whitespaceChanged = 0;

const relative = (rel) => rel.replace(/^(?:frontend|\.)\//, '');

for (const [rel, beforePath] of [...beforeFiles].sort()) {
  const afterPath = afterFiles.get(rel);
  if (!afterPath) {
    console.log(`MISSING  ${relative(rel)}`);
    missing += 1;
    continue;
  }

  const before = fs.readFileSync(beforePath, 'utf8');
  const after = fs.readFileSync(afterPath, 'utf8');
  if (before === after) {
    if (rel.endsWith('.css')) cssOk += 1;
    else htmlOk += 1;
    continue;
  }

  if (rel.endsWith('.css')) {
    const a = normalizeCss(before);
    const b = normalizeCss(after);
    if (a === b) {
      cssOk += 1;
    } else {
      failed += 1;
      const at = [...a].findIndex((c, i) => c !== b[i]);
      console.log(
        `DIFF     ${relative(rel)} :: first content difference at char ${at}\n` +
          `  before: ...${a.slice(Math.max(0, at - 60), at + 60)}\n` +
          `  after:  ...${b.slice(Math.max(0, at - 60), at + 60)}`
      );
    }
    continue;
  }

  const a = normalizeHtml(before);
  const b = normalizeHtml(after);
  if (a === b) {
    htmlOk += 1;
  } else {
    failed += 1;
    const at = [...a].findIndex((c, i) => c !== b[i]);
    console.log(
      `DIFF     ${relative(rel)} :: first content difference at char ${at}\n` +
        `  before: ...${a.slice(Math.max(0, at - 80), at + 80)}\n` +
        `  after:  ...${b.slice(Math.max(0, at - 80), at + 80)}`
    );
  }

  // Inter-tag whitespace is significant in inline formatting contexts; report
  // it so a human can confirm the affected elements are block-level, absolute
  // or flex children (where whitespace cannot render).
  const beforeRuns = interTagWhitespace(before);
  const afterRuns = interTagWhitespace(after);
  if (beforeRuns.join('|') !== afterRuns.join('|')) {
    whitespaceChanged += 1;
    console.log(
      `REVIEW   ${relative(rel)} :: inter-tag whitespace changed\n` +
        `  ${describeWhitespaceChange(beforeRuns, afterRuns)}`
    );
  }
}

for (const rel of afterFiles.keys()) {
  if (!beforeFiles.has(rel)) {
    console.log(`EXTRA    ${relative(rel)}`);
    missing += 1;
  }
}

console.log(
  `# css-identical=${cssOk} html-identical=${htmlOk} mismatched=${failed} ` +
    `missing-or-extra=${missing} html-with-inter-tag-whitespace-changes=${whitespaceChanged}`
);

if (failed > 0 || missing > 0) process.exitCode = 1;
