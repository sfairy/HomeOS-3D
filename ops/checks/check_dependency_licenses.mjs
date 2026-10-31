#!/usr/bin/env node
/**
 * 依赖许可证门禁：禁止把强 copyleft（GPL / AGPL / SSPL）带进运行时依赖。
 *
 * 为什么单独做而不是靠人看：新增一个依赖时，license 字段往往被忽略；等分发时才
 * 发现 GPL 义务，代价是替换依赖或开源。这里用 bun 的 lock 视图（bun pm licenses --json）
 * 做机器判定，失败即红。
 *
 * LGPL 单独放行：它是弱 copyleft，动态链接/独立进程方式可满足；本项目当前只有
 * sharp 的 libvips 原生包（dev 链）。真要把它打进产物，评审时再单独讨论。
 *
 * 用法：
 *   node ops/checks/check_dependency_licenses.mjs
 *   node ops/checks/check_dependency_licenses.mjs --json
 */
import { execFileSync } from 'node:child_process';

const asJson = process.argv.includes('--json');
const STRONG_COPYLEFT = /(^|[^L])GPL-|\bAGPL\b|\bSSPL\b/i;

function licenseProblem(license) {
  if (!license || typeof license !== 'string') return false;
  const options = license
    .split(/\s+OR\s+|\//i)
    .map((part) => part.trim())
    .filter(Boolean);
  if (options.length === 0) return false;
  return options.every((option) => STRONG_COPYLEFT.test(option));
}

let raw;
try {
  raw = execFileSync('bun', ['pm', 'licenses', '--json'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
} catch (error) {
  console.error('许可证门禁：bun pm licenses 执行失败，请先 bun install。');
  console.error(String(error.stderr || error.message).trim());
  process.exit(2);
}

const grouped = JSON.parse(raw);
const problems = [];
const counts = {};
for (const [license, packages] of Object.entries(grouped)) {
  counts[license] = (counts[license] || 0) + packages.length;
  if (!licenseProblem(license)) continue;
  for (const pkg of packages) {
    problems.push(`${pkg.name}@${(pkg.versions || []).join(',')} → ${license}`);
  }
}

if (asJson) {
  console.log(JSON.stringify({ counts, problems }, null, 2));
} else if (problems.length > 0) {
  console.error(`许可证门禁失败：${problems.length} 个包使用强 copyleft 许可证`);
  for (const line of problems) console.error(`  - ${line}`);
  console.error('  处理：换依赖、确认可从产物中排除，或在评审中明确接受并更新本门禁。');
} else {
  const summary = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([license, count]) => `${license}=${count}`)
    .join(' ');
  console.log(`许可证门禁通过：${summary}`);
}
process.exit(problems.length > 0 ? 1 : 0);
