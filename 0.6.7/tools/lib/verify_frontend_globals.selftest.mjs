#!/usr/bin/env node
//
// Self-test for verify_frontend_globals.mjs.
//
// The check exists to catch a breakage that no other gate can see, so it is only
// worth having if it actually fails when the breakage is present.  A gate that
// always reports PASS is worse than no gate: it manufactures confidence.
//
// Each case builds a throwaway before/after pair and asserts the exit code.
//
// Usage:  node tools/lib/verify_frontend_globals.selftest.mjs

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CHECK = path.join(ROOT, 'tools', 'verify_frontend_globals.mjs');

function runCase(name, { before, after, expectExit }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'globals-selftest-'));
  const beforeDir = path.join(dir, 'before');
  const afterDir = path.join(dir, 'after');
  for (const [target, files] of [
    [beforeDir, before],
    [afterDir, after],
  ]) {
    for (const [relPath, contents] of Object.entries(files)) {
      const full = path.join(target, relPath);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, contents);
    }
  }

  let exitCode = 0;
  let output = '';
  try {
    output = execFileSync(
      process.execPath,
      [CHECK, '--baseline-dir', beforeDir, '--frontend-root', afterDir],
      { encoding: 'utf8' },
    );
  } catch (error) {
    exitCode = error.status ?? 1;
    output = `${error.stdout || ''}${error.stderr || ''}`;
  }

  fs.rmSync(dir, { recursive: true, force: true });

  const ok = exitCode === expectExit;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}  (exit ${exitCode}, expected ${expectExit})`);
  if (!ok) {
    console.log(
      output
        .split('\n')
        .map((line) => `        ${line}`)
        .join('\n'),
    );
  }
  return ok;
}

const results = [];

// 1. The breakage the check exists for: a classic script renames a top-level
//    declaration that another classic script reaches as a bare global.
//    From `publisher.js` alone this rename is alpha-equivalent; the evidence
//    that it is wrong lives in the consumer.
results.push(
  runCase('classic global renamed, consumer left dangling', {
    before: {
      'publisher.js': 'function probeTarget() {\n  return 1;\n}\n',
      'consumer.js': 'probeTarget();\n',
    },
    after: {
      'publisher.js': 'function probeRenamed() {\n  return 1;\n}\n',
      'consumer.js': 'probeTarget();\n',
    },
    expectExit: 1,
  }),
);

// 2. Control: the same rename with the consumer updated is correct and must pass.
//    Without this case the suite would also pass if the check simply failed on
//    every input.
results.push(
  runCase('classic global renamed, consumer updated', {
    before: {
      'publisher.js': 'function probeTarget() {\n  return 1;\n}\n',
      'consumer.js': 'probeTarget();\n',
    },
    after: {
      'publisher.js': 'function probeRenamed() {\n  return 1;\n}\n',
      'consumer.js': 'probeRenamed();\n',
    },
    expectExit: 0,
  }),
);

// 3. A module's top-level bindings are scoped to the module, so renaming them
//    cannot reach another file.  Same shape as case 1 but with `export` present.
results.push(
  runCase('module binding renamed, bare name in another file', {
    before: {
      'publisher.js': 'export function probeTarget() {\n  return 1;\n}\n',
      'consumer.js': 'probeTarget();\n',
    },
    after: {
      'publisher.js': 'export function probeRenamed() {\n  return 1;\n}\n',
      'consumer.js': 'probeTarget();\n',
    },
    expectExit: 0,
  }),
);

// 4. The IIFE-alias wrapper `(function (bridgeWindow) {...})(window)` publishes
//    through an alias, not through the literal name `window`.  Renaming the
//    published property breaks the consumer; if the alias were not resolved the
//    publish would be invisible and this case would wrongly pass.
results.push(
  runCase('IIFE alias publish renamed, consumer dangling', {
    before: {
      'publisher.js': '(function (bridgeWindow) {\n  bridgeWindow.probeApi = 1;\n})(window);\n',
      'consumer.js': 'window.probeApi;\n',
    },
    after: {
      'publisher.js': '(function (bridgeWindow) {\n  bridgeWindow.probeApiRenamed = 1;\n})(window);\n',
      'consumer.js': 'window.probeApi;\n',
    },
    expectExit: 1,
  }),
);

const failed = results.filter((ok) => !ok).length;
if (failed > 0) {
  console.log(`\n${failed} case(s) failed`);
  process.exit(1);
}
console.log(`\nall ${results.length} cases passed`);
