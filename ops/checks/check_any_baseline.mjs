#!/usr/bin/env node
/**
 * `any` 计数棘轮（studio 范围）。
 *
 * 为什么不是直接把 `@typescript-eslint/no-explicit-any` 设为 error：studio 里现存
 * 17000+ 处 `any`（大量是 WebGL / three.js 边界与历史 deps 包），一次性清零不现实；
 * 但「不再变多」可以从今天开始守。做法与 `check_silent_except.py` 一致：
 *
 * - 基线 `ops/checks/any-baseline.json` 记录**逐文件**计数与总数；
 * - 任一文件比基线多、或总数比基线多 → 失败（新增文件从 0 起算）；
 * - 清理后重跑 `--update` 压低基线，基线只降不升。
 *
 * 统计口径：把 `any` 当作独立类型 token（`(?<![A-Za-z0-9_$])any(?![A-Za-z0-9_$])`），
 * 因此 `: any`、`<any>`、`as any`、`any[]`、`Record<string, any>` 都算，`company`、
 * `many` 等标识符不算。
 *
 * 用法：
 *   node ops/checks/check_any_baseline.mjs            # 校验
 *   node ops/checks/check_any_baseline.mjs --update   # 重写基线（只能变小才该跑）
 *   node ops/checks/check_any_baseline.mjs --json     # 机器可读输出
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};
const repoRoot = resolve(argOf('root', resolve(import.meta.dirname, '../..')));
const update = args.includes('--update');
const asJson = args.includes('--json');

const SCOPE = 'homeos/frontend/src/studio';
const BASELINE = join(repoRoot, 'ops/checks/any-baseline.json');
const EXTENSIONS = new Set(['.ts', '.tsx', '.vue', '.mjs', '.js']);
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '.git']);
const ANY_TOKEN = /(?<![A-Za-z0-9_$])any(?![A-Za-z0-9_$])/g;

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (EXTENSIONS.has(entry.name.slice(entry.name.lastIndexOf('.')))) out.push(full);
  }
  return out;
}

function countAny(file) {
  const text = readFileSync(file, 'utf8');
  return (text.match(ANY_TOKEN) || []).length;
}

const files = walk(join(repoRoot, SCOPE)).sort();
const counts = {};
let total = 0;
for (const file of files) {
  const count = countAny(file);
  if (count === 0) continue;
  counts[relative(repoRoot, file)] = count;
  total += count;
}

if (update) {
  writeFileSync(BASELINE, `${JSON.stringify({ total, files: counts }, null, 2)}\n`, 'utf8');
  console.log(`any 基线已更新：${Object.keys(counts).length} 个文件，共 ${total} 处`);
  process.exit(0);
}

let baseline;
try {
  baseline = JSON.parse(readFileSync(BASELINE, 'utf8'));
} catch (error) {
  console.error(
    `any 棘轮：读不到基线 ${relative(repoRoot, BASELINE)}（${error.message}）。` +
      '首次启用请先跑 `--update` 生成基线。',
  );
  process.exit(2);
}

const baselineFiles = baseline.files || {};
const problems = [];

for (const file of Object.keys(counts).sort()) {
  const before = baselineFiles[file] ?? 0;
  const after = counts[file];
  if (after > before) {
    problems.push(`${file}: ${before} → ${after}（+${after - before}）`);
  }
}

// 只比对「变多」：清到 0 / 删掉文件都是好事，不该被门禁拦住。
const baselineTotal = baseline.total ?? 0;
const shrank = baselineTotal - total;

if (problems.length === 0 && total > baselineTotal) {
  problems.push(`总数 ${baselineTotal} → ${total}（+${total - baselineTotal}）`);
}

if (asJson) {
  console.log(JSON.stringify({ total, baselineTotal, problems, shrank }, null, 2));
} else if (problems.length > 0) {
  console.error(`any 棘轮失败：${problems.length} 个文件增加了 any`);
  for (const line of problems) console.error(`  - ${line}`);
  console.error('  说明：这是「不许变多」的门禁。确实需要新增 any 时，先在评审里说明理由，');
  console.error('  再改 `ops/checks/any-baseline.json`（基线只该被 --update 压低）。');
} else {
  const note = shrank > 0 ? `，比基线少 ${shrank} 处（可跑 --update 压低基线）` : '';
  console.log(`any 棘轮通过：${Object.keys(counts).length} 个文件 / 共 ${total} 处${note}`);
}

process.exit(problems.length > 0 ? 1 : 0);
