/**
 * Deobfuscate the HA-Bridge frontend bundles with webcrack.
 *
 * The shipped frontend was run through javascript-obfuscator (obfuscator.io):
 * a rotated string array plus a `_0x...` decoder function, control-flow
 * flattening and dead-code injection.  webcrack reverses all of those.
 *
 * Usage:
 *   node tools/deobfuscate_frontend.mjs [--dry] [path ...]
 *
 * With no paths, every obfuscated `.js` file under `frontend/` is processed in
 * place.  The `?v=...` cache-busting query strings on import specifiers are
 * preserved so the HTML entry points keep working.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const WEBCRACK_ENTRY =
  process.env.WEBCRACK_ENTRY ||
  '/Users/sfairy/.npm/_npx/6da011cd7208f74f/node_modules/webcrack/dist/index.js';

const { webcrack } = await import(WEBCRACK_ENTRY);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FRONTEND = path.join(ROOT, 'frontend');

const OBFUSCATION_SIGNATURE = /_0x[0-9a-f]{4,}/g;

function isObfuscated(code) {
  const head = code.slice(0, 4096);
  const matches = head.match(OBFUSCATION_SIGNATURE);
  return (matches?.length ?? 0) >= 3;
}

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(full);
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      yield full;
    }
  }
}

function discover() {
  const files = [];
  for (const file of walk(FRONTEND)) {
    const code = fs.readFileSync(file, 'utf8');
    if (isObfuscated(code)) files.push(file);
  }
  return files.sort();
}

async function processFile(file, dry) {
  const original = fs.readFileSync(file, 'utf8');
  const before = original.length;
  let result;
  try {
    result = await webcrack(original, {
      unpack: false,
      unminify: true,
      deobfuscate: true,
      rename: true,
      jsx: false,
      mangle: false,
      log: false,
    });
  } catch (error) {
    console.log(`FAIL   ${path.relative(ROOT, file)} :: ${error.message}`);
    return { ok: false };
  }
  const code = result.code;
  if (!code || code.trim().length === 0) {
    console.log(`EMPTY  ${path.relative(ROOT, file)}`);
    return { ok: false };
  }
  const remaining = code.match(OBFUSCATION_SIGNATURE)?.length ?? 0;
  if (!dry) fs.writeFileSync(file, code);
  console.log(
    `${dry ? 'DRY' : 'OK'}    ${path.relative(ROOT, file)}  ` +
      `${before} -> ${code.length} bytes, _0x refs left: ${remaining}`
  );
  return { ok: true, remaining };
}

const args = process.argv.slice(2);
const dry = args.includes('--dry');
const explicit = args.filter((a) => !a.startsWith('--')).map((a) => path.resolve(a));
const files = explicit.length > 0 ? explicit : discover();

console.log(`# webcrack deobfuscation: ${files.length} file(s)`);
let ok = 0;
let failed = 0;
let remainingTotal = 0;
for (const file of files) {
  const { ok: success, remaining = 0 } = await processFile(file, dry);
  if (success) {
    ok += 1;
    remainingTotal += remaining;
  } else {
    failed += 1;
  }
}
console.log(`# done: ok=${ok} failed=${failed} _0x refs remaining=${remainingTotal}`);
