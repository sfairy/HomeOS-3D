#!/usr/bin/env node
/**
 * Studio 单体拆分预算门禁。
 *
 * 目标不是“一次拆完”，而是防止已经拆出的边界重新长回去：
 * - 入口/族文件行数预算（Phase 1 只约束 item-model；studio-app/home 在后续阶段收紧）；
 * - 族文件不得 import 入口文件（避免循环依赖）；
 * - 族文件不得出现模块级 let/var（共享可变状态必须显式进 scope）；
 * - index 的族顺序必须与约定一致（顺序就是行为，重排会改变命中分支）。
 *
 * 用法:
 *   node ops/checks/studio/check_split_budget.mjs [--phase 1] [--root <repo>] [--json]
 */
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const get = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const repoRoot = path.resolve(get('root', path.resolve(import.meta.dirname, '../../..')));
const phase = Number(get('phase', '1'));
const asJson = args.includes('--json');

const APP = path.join(repoRoot, 'homeos/frontend/src/studio/app');
const ITEM_MODEL_DIR = '3d-studio/authoring/items/item-model';
const ITEM_MODEL_ENTRY = '3d-studio/authoring/items/studio-item-model.ts';
const FAMILY_ORDER = [
  'buildMisc',
  'buildLiving',
  'buildStorageLower',
  'buildStorageUpper',
  'buildKitchen',
  'buildWaterTea',
  'buildLaundry',
  'buildClimateSecurity',
  'buildMediaBath',
  'buildWorkspace',
  'buildBath',
  'buildLightingGlass',
  'buildShowerBasin',
  'buildDecor',
];

const targets = [
  { id: 'item-model-entry', phase: 1, max: 600, kind: 'file', rel: ITEM_MODEL_ENTRY },
  { id: 'item-model-family', phase: 1, max: 1000, kind: 'dir', rel: ITEM_MODEL_DIR },
  { id: 'studio-app', phase: 2, max: 8000, kind: 'file', rel: '3d-studio/authoring/studio-app/boot.ts' },
  { id: 'editor-home', phase: 3, max: 7400, kind: 'file', rel: 'editor/home/lifecycle/boot.ts' },
  // 手写转发包装（`function x(...args: any[]) { return (xImpl as any)(deps(), ...args) }`）
  // 已改成 `bindDeps(deps)({ x: xImpl })` 表。它们不是行数问题，而是把 deps 首参错位 /
  // 参数个数写错全用 `as any` 盖住 —— 所以单独按「命中数」守，不许再加回来。
  {
    id: 'editor-home-forwarders',
    phase: 3,
    max: 0,
    kind: 'pattern',
    rel: 'editor/home/lifecycle/boot.ts',
    pattern: 'function \\w+\\(\\.\\.\\.args: any\\[\\]\\): ReturnType<typeof \\w+Impl>',
  },
];

const problems = [];
const notes = [];
const check = (cond, file, line, message) => {
  if (!cond) problems.push({ file, line, message });
};
const countLines = text => text.split('\n').length;
const read = rel => fs.readFileSync(path.join(APP, rel), 'utf8');

for (const target of targets) {
  if (target.phase > phase) {
    notes.push(`[deferred] ${target.id}: phase ${target.phase} 预算 ${target.max} 行（当前 --phase ${phase} 不检查）`);
    continue;
  }
  if (target.kind !== 'dir' && !fs.existsSync(path.join(APP, target.rel))) {
    // 夹具仓库里往往只造被测的那几个文件：缺文件要报成问题，而不是让 read() 抛 ENOENT
    // （那样整个门禁变成「脚本崩了」，看不出是哪条预算没满足）。
    problems.push({ file: target.rel, line: 0, message: `${target.id} 文件不存在` });
    continue;
  }
  if (target.kind === 'pattern') {
    const text = read(target.rel);
    const hits = text.match(new RegExp(target.pattern, 'g')) || [];
    check(
      hits.length <= target.max,
      target.rel,
      0,
      `${target.id} 命中 ${hits.length} 处，超过预算 ${target.max}（转发包装请用 bindDeps 表）`,
    );
    continue;
  }
  if (target.kind === 'file') {
    const text = read(target.rel);
    const lines = countLines(text);
    check(lines <= target.max, target.rel, lines, `${target.id} 行数 ${lines} 超过预算 ${target.max}`);
  } else {
    const dir = path.join(APP, target.rel);
    if (!fs.existsSync(dir)) {
      problems.push({ file: target.rel, line: 0, message: `${target.id} 目录不存在` });
      continue;
    }
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.ts')).sort();
    check(files.length > 1, target.rel, 0, `${target.id} 至少需要 2 个 .ts 文件（当前 ${files.length}）`);
    for (const f of files) {
      const text = fs.readFileSync(path.join(dir, f), 'utf8');
      const lines = countLines(text);
      check(lines <= target.max, `${target.rel}/${f}`, lines, `${target.id} 文件 ${f} 行数 ${lines} 超过预算 ${target.max}`);
      // 模块级可变量：只允许 const 声明；缩进后的 let/var 属于函数体，不在此规则内。
      const moduleLet = text.split('\n').findIndex(line => /^(?:export\s+)?(?:let|var)\s/.test(line));
      check(moduleLet < 0, `${target.rel}/${f}`, moduleLet + 1, '族文件不得声明模块级 let/var（共享状态请显式放进 scope）');
      // 族文件不得回头 import 入口，避免入口 <-> 族循环。
      const badImport = /(?:from\s+|import\s*)["'][^"']*studio-item-model["']/.test(text);
      check(!badImport, `${target.rel}/${f}`, 0, '族文件不得 import 入口 studio-item-model');
    }
  }
}

// index.ts 的族顺序 = 命中优先级，必须与约定一致。
const itemModelDir = path.join(APP, ITEM_MODEL_DIR);
if (phase >= 1 && fs.existsSync(itemModelDir)) {
  const indexPath = path.join(itemModelDir, 'index.ts');
  if (!fs.existsSync(indexPath)) {
    problems.push({ file: `${ITEM_MODEL_DIR}/index.ts`, line: 0, message: '缺少 index.ts' });
  } else {
    const indexText = fs.readFileSync(indexPath, 'utf8');
    check(/ITEM_MODEL_FAMILIES/.test(indexText), `${ITEM_MODEL_DIR}/index.ts`, 0, 'index.ts 未导出 ITEM_MODEL_FAMILIES');
    const arrayMatch = indexText.match(/ITEM_MODEL_FAMILIES[^=]*=\s*\[([\s\S]*?)\]/);
    if (!arrayMatch) {
      problems.push({ file: `${ITEM_MODEL_DIR}/index.ts`, line: 0, message: '找不到 ITEM_MODEL_FAMILIES 数组' });
    } else {
      const actual = arrayMatch[1].split(',').map(s => s.trim()).filter(Boolean);
      check(actual.length === FAMILY_ORDER.length, `${ITEM_MODEL_DIR}/index.ts`, 0, `族数量 ${actual.length} != ${FAMILY_ORDER.length}`);
      actual.forEach((name, i) => check(name === FAMILY_ORDER[i], `${ITEM_MODEL_DIR}/index.ts`, 0, `族顺序第 ${i + 1} 项为 ${name}，应为 ${FAMILY_ORDER[i]}`));
    }
    const arrowModule = /ITEM_MODEL_FAMILIES\s*:\s*ReadonlyArray<ItemModelFamily>/;
    check(arrowModule.test(indexText), `${ITEM_MODEL_DIR}/index.ts`, 0, 'ITEM_MODEL_FAMILIES 必须标注 ReadonlyArray<ItemModelFamily>');
  }
}

if (asJson) {
  console.log(JSON.stringify({ phase, problems, notes }, null, 2));
} else {
  for (const note of notes) console.log(note);
  for (const p of problems) console.log(`${p.file}:${p.line} ${p.message}`);
  console.log(problems.length === 0 ? `studio split budget: PASS (phase ${phase})` : `studio split budget: FAIL (${problems.length} issues, phase ${phase})`);
}
process.exit(problems.length === 0 ? 0 : 1);
