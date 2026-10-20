#!/usr/bin/env node
/**
 * Studio 混淆标识符审计（Phase 1 只报告，Phase 4 再作为门禁）。
 *
 * 硬规则（--check 时才失败）：`num\d+` / `value\d+` / `v\d+`、`*StateState`、1–2 字符名。
 * `run*`、`*State`、`*Visibility` 先计数并输出样例：它们需要逐条证据，不能盲改。
 *
 * 用法:
 *   node ops/checks/studio/check_naming.mjs [--report|--check] [--json]
 */
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const args = process.argv.slice(2);
const checkMode = args.includes('--check');
const asJson = args.includes('--json');
const repoRoot = path.resolve(import.meta.dirname, '../../..');
const studioDir = path.join(repoRoot, 'homeos/frontend/src/studio');
const SHORT_ALLOW = new Set(['i', 'j', 'k', 'x', 'y', 'z', 'id', 'el', 'ev', 'fn', 'cb', 'ok', 'ns', 'ui', '3d']);
const RUN_RE = /^run(Alt|Aux|Variant|Extra|Old|New|Next|Long|Short|Left|Right|Lower|Upper|Peer|Range|Entry|Store|Mode|Snapshot|CopyBackup|Fallback|Inner|Outer|Twin)/;
const NUM_RE = /^(?:num|value|v)\d+$/;

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else if (entry.isFile() && p.endsWith('.ts') && !p.endsWith('.d.ts')) out.push(p);
  }
  return out;
}
function namesOf(file) {
  const src = fs.readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const names = new Set();
  const add = name => { if (name) names.add(name); };
  const visit = node => {
    if (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node) || ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node) || ts.isEnumDeclaration(node)) add(node.name?.text);
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) add(node.name.text);
    if (ts.isParameter(node) && ts.isIdentifier(node.name)) add(node.name.text);
    if (ts.isBindingElement(node) && ts.isIdentifier(node.name)) add(node.name.text);
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return names;
}

const files = walk(studioDir);
const hard = [];
const observed = { run: [], short: [], numeric: [], stateState: [], state: [], visibility: [] };
const perFile = {};
for (const file of files) {
  const rel = path.relative(repoRoot, file);
  for (const name of namesOf(file)) {
    if (SHORT_ALLOW.has(name)) continue;
    if (/^[a-z]{1,2}$/.test(name)) { hard.push({ file: rel, name, kind: 'short' }); observed.short.push({ file: rel, name }); }
    if (NUM_RE.test(name)) { hard.push({ file: rel, name, kind: 'numeric' }); observed.numeric.push({ file: rel, name }); }
    if (/StateState$/.test(name)) { hard.push({ file: rel, name, kind: 'stateState' }); observed.stateState.push({ file: rel, name }); }
    if (RUN_RE.test(name) && name !== 'runStudioRenderLoop') observed.run.push({ file: rel, name });
    if (/State$/.test(name)) observed.state.push({ file: rel, name });
    if (/Visibility$/.test(name)) observed.visibility.push({ file: rel, name });
    for (const bucket of ['run', 'short', 'numeric', 'stateState', 'state', 'visibility']) {
      if (observed[bucket].some(x => x.file === rel && x.name === name)) {
        perFile[rel] = perFile[rel] || { run: 0, short: 0, numeric: 0, stateState: 0, state: 0, visibility: 0 };
        perFile[rel][bucket] += 1;
      }
    }
  }
}
const summary = {
  files: files.length,
  hardRules: { total: hard.length, short: observed.short.length, numeric: observed.numeric.length, stateState: observed.stateState.length },
  ratchet: { run: observed.run.length, state: observed.state.length, visibility: observed.visibility.length },
  hard,
  samples: Object.fromEntries(Object.entries(observed).map(([k, v]) => [k, v.slice(0, 15)])),
  filesWithFindings: perFile,
};
if (asJson) console.log(JSON.stringify(summary, null, 2));
else {
  console.log(`studio naming audit: ${summary.files} files`);
  console.log(`hard: ${hard.length} (short ${observed.short.length}, numeric ${observed.numeric.length}, StateState ${observed.stateState.length})`);
  console.log(`ratchet: run* ${observed.run.length}, *State ${observed.state.length}, *Visibility ${observed.visibility.length}`);
  for (const h of hard.slice(0, 20)) console.log(`  ${h.kind}: ${h.file} ${h.name}`);
  console.log(checkMode && hard.length ? 'studio naming: FAIL' : 'studio naming: hard rules enforced; ratchet is report-only');
}
process.exit(checkMode && hard.length ? 1 : 0);
