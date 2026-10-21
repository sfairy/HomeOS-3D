#!/usr/bin/env node
/**
 * item-model 拆分等价校验。
 *
 * 记录/比对三件事：
 * 1. 主函数里 59 个分派分支的条件与分支体（规范化空白后）逐项一致；
 * 2. 入口在分派前后的语句完全一致；
 * 3. 族文件顺序与基线一致（顺序即行为）。
 *
 * 用法:
 *   node ops/checks/studio/verify_item_model.mjs --write-baseline --before backups/.../studio-item-model.ts
 *   node ops/checks/studio/verify_item_model.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import ts from 'typescript';

const args = process.argv.slice(2);
const get = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const repoRoot = path.resolve(import.meta.dirname, '../../..');
const root = path.resolve(get('root', repoRoot));
const entryFile = path.join(root, 'homeos/frontend/src/studio/app/3d-studio/authoring/items/studio-item-model.ts');
const familyDir = path.join(root, 'homeos/frontend/src/studio/app/3d-studio/authoring/items/item-model');
const manifestFile = path.join(root, get('manifest', 'ops/checks/studio/item-model-baseline.json'));
const beforeFile = get('before', '');
const writeBaseline = args.includes('--write-baseline');
const asJson = args.includes('--json');
const GROUP_ORDER = ['misc', 'living', 'storage-lower', 'storage-upper', 'kitchen', 'water-tea', 'laundry', 'climate-security', 'media-bath', 'workspace', 'bath', 'lighting-glass', 'shower-basin', 'decor'];
const norm = s => s.replace(/\s+/g, '');
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const read = f => {
  const src = fs.readFileSync(f, 'utf8');
  return { src, sf: ts.createSourceFile(f, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS) };
};
const inner = (st, src, sf) => (ts.isBlock(st) ? src.slice(st.getStart(sf) + 1, st.getEnd() - 1) : st.getText(sf));

function findFn(sf, name) {
  return sf.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === name);
}
function collectChain(first) {
  const list = [];
  let cur = first;
  while (cur) {
    list.push(cur);
    const els = cur.elseStatement;
    if (els && ts.isIfStatement(els)) cur = els;
    else if (els && ts.isBlock(els) && els.statements.length === 1 && ts.isIfStatement(els.statements[0])) cur = els.statements[0];
    else break;
  }
  return list;
}
function originalBranches(file) {
  const { src, sf } = read(file);
  const build = findFn(sf, 'buildItemModel');
  if (!build) throw new Error(`buildItemModel not found in ${file}`);
  const rootIf = build.body.statements.find(st => ts.isIfStatement(st) && st.expression.getText(sf).includes('lampItemTypeSet'));
  if (!rootIf) throw new Error('lamp chain root not found');
  return { src, sf, build, rootIf, branches: collectChain(rootIf) };
}
function normalizedMain(file) {
  const { sf } = read(file);
  const build = findFn(sf, 'buildItemModel');
  if (!build) throw new Error('buildItemModel not found');
  const scopeIdx = build.body.statements.findIndex(st => ts.isVariableStatement(st) && st.declarationList.declarations.some(d => d.name.getText(sf) === 'itemModelScope'));
  const loopIdx = build.body.statements.findIndex(st => ts.isForOfStatement(st));
  if (scopeIdx < 0 || loopIdx < 0) throw new Error('itemModelScope/for-of dispatch not found');
  return { pre: build.body.statements.slice(0, scopeIdx).map(s => norm(s.getText(sf))), post: build.body.statements.slice(loopIdx + 1).map(s => norm(s.getText(sf))) };
}

if (writeBaseline) {
  if (!beforeFile) throw new Error('--before is required with --write-baseline');
  const o = originalBranches(beforeFile);
  const idx = o.build.body.statements.indexOf(o.rootIf);
  const main = {
    pre: o.build.body.statements.slice(0, idx).map(s => norm(s.getText(o.sf))),
    post: o.build.body.statements.slice(idx + 1).map(s => norm(s.getText(o.sf))),
  };
  const beforeSrc = fs.readFileSync(beforeFile, 'utf8');
  const manifest = {
    format: 1,
    source: path.relative(root, path.resolve(beforeFile)),
    sourceSha256: sha(beforeSrc),
    branchCount: o.branches.length,
    groupOrder: GROUP_ORDER,
    branches: o.branches.map((br, i) => ({
      index: i,
      conditionSha256: sha(norm(br.expression.getText(o.sf))),
      bodySha256: sha(norm(inner(br.thenStatement, o.src, o.sf))),
    })),
    main: { preCount: main.pre.length, preHash: sha(JSON.stringify(main.pre)), postCount: main.post.length, postHash: sha(JSON.stringify(main.post)) },
  };
  fs.mkdirSync(path.dirname(manifestFile), { recursive: true });
  fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + '\n');
  console.log(`baseline written: ${path.relative(root, manifestFile)} (${manifest.branchCount} branches, ${manifest.main.preCount} pre / ${manifest.main.postCount} post)`);
  process.exit(0);
}

const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
const problems = [];
function collectAfterBranches() {
  const flat = [];
  for (const name of GROUP_ORDER) {
    const file = path.join(familyDir, `${name}.ts`);
    if (!fs.existsSync(file)) { problems.push(`missing family file: ${name}.ts`); continue; }
    const { src, sf } = read(file);
    const fn = sf.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text.startsWith('build'));
    if (!fn) { problems.push(`family function not found: ${name}`); continue; }
    const first = fn.body.statements.find(st => ts.isIfStatement(st));
    if (!first) { problems.push(`family chain not found: ${name}`); continue; }
    for (const br of collectChain(first)) {
      const body = norm(inner(br.thenStatement, src, sf)).replace(/returntrue;$/, '');
      flat.push({ name, line: sf.getLineAndCharacterOfPosition(br.getStart(sf)).line + 1, cond: norm(br.expression.getText(sf)), body });
    }
  }
  return flat;
}
const after = collectAfterBranches();
if (after.length !== manifest.branchCount) problems.push(`branch count ${after.length} != ${manifest.branchCount}`);
manifest.branches.forEach((b, i) => {
  const a = after[i];
  if (!a) return;
  if (sha(a.cond) !== b.conditionSha256) problems.push(`branch ${i} condition changed (${a.name}:${a.line})`);
  if (sha(a.body) !== b.bodySha256) problems.push(`branch ${i} body changed (${a.name}:${a.line})`);
});
const main = normalizedMain(entryFile);
if (main.pre.length !== manifest.main.preCount) problems.push(`pre statement count ${main.pre.length} != ${manifest.main.preCount}`);
if (main.post.length !== manifest.main.postCount) problems.push(`post statement count ${main.post.length} != ${manifest.main.postCount}`);
if (sha(JSON.stringify(main.pre)) !== manifest.main.preHash) problems.push('pre-dispatch statements changed');
if (sha(JSON.stringify(main.post)) !== manifest.main.postHash) problems.push('post-dispatch statements changed');
const entrySrc = fs.readFileSync(entryFile, 'utf8');
if (/lampItemTypeSet/.test(entrySrc)) problems.push('lamp branch still present in entry');

// 清单里可以登记「有意偏离」的条目（如 0.7.9 新增模型变体改变了分派条件）：
// 偏离项的哈希已按新代码更新，这里只把原因打出来，避免后来者误以为是漏改。
if (Array.isArray(manifest.deviations) && manifest.deviations.length)
  console.log(
    `accepted deviations: ${manifest.deviations
      .map(deviationEntry => `#${deviationEntry.branch} ${deviationEntry.group} ${deviationEntry.field} — ${deviationEntry.reason}`)
      .join('; ')}`,
  );

const result = { manifest: path.relative(root, manifestFile), groupOrder: GROUP_ORDER.length, branches: after.length, pre: main.pre.length, post: main.post.length, problems: problems.length };
if (asJson) console.log(JSON.stringify({ ...result, details: problems }, null, 2));
else {
  for (const p of problems) console.log(p);
  console.log(problems.length ? `item-model equivalence: FAIL (${problems.length})` : `item-model equivalence: PASS (${after.length} branches, ${main.pre.length} pre / ${main.post.length} post)`);
}
process.exit(problems.length ? 1 : 0);
