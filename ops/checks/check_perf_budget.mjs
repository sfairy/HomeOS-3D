#!/usr/bin/env node
/**
 * 3D / 首屏性能预算门禁。
 *
 * 背景：`check:bundle-budget` 只管体积，而真正让用户觉得「慢」的是 stage 首帧链路
 * （`iframeReadyMs` / `stageMountedMs` / `presented` 相位的 draw calls）。这条链路此前只有
 * `perf:compare` 的人工对比，没有阈值 —— 改坏了只有肉眼能发现。
 *
 * 输入：一次 perf 审计的结果目录（`perf:baseline` / `run_baseline.sh` 的产物），默认取
 * `$TMPDIR/homeos-perf/results/<最新 label>`，可用 `--dir <path>` 指定。
 *
 * 口径：
 * - 预算刻意留出机器漂移带（10-20 → 10-21 实测 draw calls 完全一致，但阶段耗时漂移 ±7%），
 *   所以这些数字用来拦「数量级回退」，不是拦 ±5% 抖动；
 * - `presentedCalls` 是**首帧**口径（含阴影图与首次反射捕获），稳态见 `renderCalls`；
 * - 结果目录不完整（没跑 3D / 没跑契约）时按 SKIP 处理，不算失败。
 *
 * 用法：
 *   node ops/checks/check_perf_budget.mjs [--dir <results/label>]
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..');
const BUDGET_PATH = join(HERE, 'perf-budget.json');

const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};

const TMP = process.env.TMPDIR ? process.env.TMPDIR.replace(/\/$/, '') : '/tmp';
const ROOTS = process.env.HOMEOS_PERF_ROOT
  ? [process.env.HOMEOS_PERF_ROOT]
  : [join(TMP, 'homeos-perf'), '/tmp/homeos-perf'];

function resultsDirs() {
  return ROOTS.flatMap((root) => {
    const results = join(root, 'results');
    if (!existsSync(results)) return [];
    return readdirSync(results)
      .map((name) => ({ name, path: join(results, name), mtime: statSync(join(results, name)).mtimeMs }))
      .filter((entry) => statSync(entry.path).isDirectory())
      .sort((a, b) => b.mtime - a.mtime);
  });
}

function latestResultsDir() {
  const entries = resultsDirs();
  // 优先最近一次「真的跑了 3D」的结果，避免安静期只跑后端时误判为最新。
  return (entries.find((entry) => existsSync(join(entry.path, '3d.json'))) || entries[0])?.path || null;
}

const dir = argOf('--dir', latestResultsDir());
if (!dir || !existsSync(dir)) {
  console.log(
    `perf-budget：跳过（找不到结果目录 ${dir || join(RESULTS, '<label>')}；先跑 npm run perf:baseline）`,
  );
  process.exit(0);
}

const budget = JSON.parse(readFileSync(BUDGET_PATH, 'utf8'));
const readJson = (name) => {
  const path = join(dir, name);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf8'));
};

const three = readJson('3d.json');
const contracts = readJson('contracts.json');

if (!three) {
  console.log(`perf-budget：跳过（${dir} 没有 3d.json，说明只跑了后端/契约）`);
  process.exit(0);
}

const summary = three.summary || {};
const failures = [];
const rows = [];

function check(metric, actual, limit, mode) {
  const ok = typeof actual === 'number' && Number.isFinite(actual)
    && (mode === 'min' ? actual >= limit : actual <= limit);
  rows.push({ metric, actual, limit, mode, ok });
  if (!ok) failures.push({ metric, actual, limit, mode });
}

for (const [metric, limit] of Object.entries(budget.threeD.max || {})) {
  check(metric, summary[metric], limit, 'max');
}
for (const [metric, limit] of Object.entries(budget.threeD.min || {})) {
  check(metric, summary[metric], limit, 'min');
}

if (contracts) {
  const failed = Number(contracts.failed ?? 0);
  const skipped = Number(contracts.skipped ?? 0);
  check('contracts.failed', failed, budget.contracts.maxFailed, 'max');
  check('contracts.skipped', skipped, budget.contracts.maxSkipped, 'max');
}

const label = three.label || dir;
console.log(`perf-budget：${label}（${dir}）`);
for (const row of rows) {
  const symbol = row.ok ? 'PASS' : 'FAIL';
  const comparator = row.mode === 'min' ? '≥' : '≤';
  const value = typeof row.actual === 'number' ? row.actual : '—';
  console.log(`  ${symbol}  ${row.metric}: ${value} ${comparator} 预算 ${row.limit}`);
}

if (failures.length) {
  console.error('\n性能预算未通过：');
  for (const item of failures) {
    console.error(`  ${item.metric} = ${item.actual}（${item.mode === 'min' ? '下限' : '上限'} ${item.limit}）`);
  }
  console.error(
    '\n若确认是环境漂移，先用同一目录重跑 `npm run perf:3d -- --label <新 label>` 看方差；'
    + '\n只有「结构变化」（新增阴影/反射 pass、组件族重新全量进 stage）才允许改 ops/checks/perf-budget.json，'
    + '\n并在提交说明里写明为什么不是回退。',
  );
  process.exit(1);
}

console.log('-------------------');
console.log('性能预算通过。');
