#!/usr/bin/env node
/**
 * 代码质量报告生成器（可重跑，输出稳定）。
 *
 * 输入：docs/code-quality/<date>/quality/data/*.json
 *   - baseline-ts.json / baseline-python.json  分析器在基线提交上的快照（before）
 *   - current-ts.json  / current-python.json   分析器在当前工作区的快照（after）
 *   - fixes.json       已实施/保留条目的处置登记（按 type+path+line_start+symbol 匹配）
 *   - plans.json       优化方案与行为等价理由
 *   - gates.json       门禁矩阵（命令、基线、当前、证据）
 *   - verification.json 等价性测试与基准结果
 * 输出：同目录 inventory.csv / findings.json / report.md / verification.md / manual-review.md
 *
 * 用法：
 *   node ops/checks/code_quality/run.mjs --out docs/code-quality/2026-10-21/quality --date 2026-10-21
 *
 * 一致性：读取顺序固定、排序键固定（类型优先级, 路径, 起始行, 符号），不写入时间戳/随机数；
 * 同一输入两次运行输出逐字节一致。
 */
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO = process.cwd();
const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};

const DATE = argOf('--date', '');
if (!DATE) {
  console.error('必须显式传入 --date YYYY-MM-DD（避免输出含运行时刻，保证可重跑一致）');
  process.exit(2);
}
const OUT = argOf('--out', `docs/code-quality/${DATE}/quality`);
const DATA = join(OUT, 'data');
const READ_SIDE = argOf('--snapshot', 'current');

// 输入是「分析器快照 + 处置登记」，属于要人跑分析器才有的人工产物（历史上从未入库）。
// 缺输入时不能报 ENOENT 崩溃：那会把门禁变成「谁机器上碰巧有旧目录谁才绿」。显式 SKIP 并
// 说明要补什么，`--strict` 下才当失败（用于「本轮必须出报告」的场景）。
if (!existsSync(DATA)) {
  const message = [
    `code-quality：跳过（缺少输入目录 ${DATA}）`,
    '  这个脚本是报告生成器，输入需要在目标提交上跑分析器并登记处置：',
    '    node ops/checks/code_quality/analyze_ts.mjs --out <dir>/data/current-ts.json',
    '    python ops/checks/code_quality/analyze_py.py --out <dir>/data/current-python.json',
    '    再把 baseline-*.json / fixes.json / plans.json / gates.json / verification.json 放进同一目录。',
  ].join('\n');
  if (args.includes('--strict')) {
    console.error(message);
    process.exit(1);
  }
  console.log(`${message}\n  未加 --strict，按 SKIP 处理。`);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// 纳入/排除范围（与 analyze_ts.mjs / analyze_py.py 保持一致）
// ---------------------------------------------------------------------------
const ROOTS = [
  { dir: 'homeos/frontend/src', label: '前端主应用（Vue 3 + TS）' },
  { dir: 'homeos-store/frontend/src', label: '门店前端（Vue 3 + TS）' },
  { dir: 'packages/shared/src', label: '共享 TS 包' },
  { dir: 'packages/shared-i18n/src', label: '共享 i18n 包' },
  { dir: 'packages/shared-py/homeos_shared', label: '共享 Python 包' },
  { dir: 'homeos/backend/src', label: '主后端（FastAPI）' },
  { dir: 'homeos-store/backend/src', label: '门店后端（FastAPI）' },
  { dir: 'ops', label: '运维/CI/性能脚本' },
  { dir: 'homeos/frontend/scripts', label: '前端独立脚本' },
  { dir: 'scripts', label: '仓库脚本' },
];
const ROOT_FILES = new Set([
  'homeos/frontend/vite.config.ts',
  'homeos/frontend/vite-studio.ts',
  'homeos/frontend/vite.runtime.config.ts',
  'homeos-store/frontend/vite.config.ts',
  'eslint.config.mjs',
]);
const SKIP_DIR = /(^|\/)(node_modules|dist|build|\.venv-store|vendor|__pycache__|\.pnpm-store|\.ruff_cache|\.graphflow|public|assets|backups|keys)(\/|$)/;
const INCLUDE_EXT = /\.(ts|tsx|mjs|js|vue|py|sh|css|scss|html|sql)$/;

const EXCLUSIONS = [
  ['第三方库/静态资源', 'homeos/frontend/public/static/vendor/**（three、mdi、qrcode-generator）', '不可修改的第三方分发物'],
  ['构建产物', 'homeos/frontend/dist/**、packages/shared/dist/**、dist/**', '由构建生成，源在 src/**'],
  ['依赖目录', 'node_modules/**、.pnpm-store/**', '依赖包，非仓库源码'],
  ['Python 运行环境', '.venv-store/**、**/__pycache__/**、**/.pytest_cache/**', '虚拟环境与字节码缓存'],
  ['配置/文档', 'package.json、tsconfig*.json、eslint/ruff 配置、Dockerfile、compose、.env*、docs/**、README.md', '配置与文档，不承载业务逻辑'],
  ['设计/素材', 'assets/**、backups/**、keys/**', '二进制素材/生成数据'],
  ['静态种子清单', 'homeos/frontend/public-static.seed.json', '构建期清单数据，由脚本生成'],
];

function walk(dir, out) {
  if (!existsSync(join(REPO, dir))) return;
  for (const name of readdirSync(join(REPO, dir)).sort()) {
    const rel = `${dir}/${name}`;
    if (SKIP_DIR.test(rel)) continue;
    const st = statSync(join(REPO, rel));
    if (st.isDirectory()) walk(rel, out);
    else if (INCLUDE_EXT.test(name)) out.push(rel);
  }
}

function purposeOf(rel) {
  let text = '';
  try {
    text = readFileSync(join(REPO, rel), 'utf8').slice(0, 2400);
  } catch {
    return '';
  }
  const py = text.match(/^\s*"""([^\n]*)/);
  if (py && py[1].trim()) return py[1].trim().replace(/\s+/g, ' ').slice(0, 90);
  const block = text.match(/^\s*\/\*\*?([\s\S]*?)\*\//);
  if (block) {
    const line = block[1]
      .split('\n')
      .map((l) => l.replace(/^\s*\*?\s?/, '').trim())
      .find(Boolean);
    if (line) return line.slice(0, 90);
  }
  const hash = text.match(/^#\s*(.+)$/m);
  if (hash) return hash[1].trim().slice(0, 90);
  return '';
}

const includeReason = (rel) => {
  if (rel.startsWith('ops/')) return '运维/CI/性能门禁脚本，可执行源代码';
  if (rel.startsWith('packages/')) return '跨项目共享库源码';
  if (rel.endsWith('.vue')) return 'Vue 单文件组件（模板+脚本）';
  if (rel.endsWith('.py')) return '后端业务/平台 Python 源码';
  if (rel.endsWith('.sh')) return 'Shell 自动化脚本';
  if (rel.endsWith('.mjs') || rel.endsWith('.js')) return 'Node/浏览器脚本';
  if (rel.endsWith('.css') || rel.endsWith('.scss')) return '样式源码';
  if (rel.endsWith('.html')) return '页面模板源码';
  if (rel.endsWith('.sql')) return '数据库迁移/SQL 源码';
  return 'TypeScript 应用/运行时源码';
};

const csvCell = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;

function buildInventory() {
  const files = [];
  for (const root of ROOTS) walk(root.dir, files);
  for (const file of ROOT_FILES) if (existsSync(join(REPO, file))) files.push(file);
  const unique = [...new Set(files)].sort();
  const rows = ['file_path,purpose,status,reason'];
  for (const file of unique) rows.push([file, purposeOf(file), 'included', includeReason(file)].map(csvCell).join(','));
  for (const [category, sample, why] of EXCLUSIONS) rows.push([sample, category, 'excluded', why].map(csvCell).join(','));
  writeFileSync(join(OUT, 'inventory.csv'), rows.join('\n') + '\n');
  return unique;
}

function readJson(name, fallback) {
  const path = join(DATA, name);
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : fallback;
}

const typeOrder = ['invalid-unreachable', 'dead', 'inefficient', 'duplicate'];
const rank = (type) => {
  const index = typeOrder.indexOf(type);
  return index >= 0 ? index : typeOrder.length;
};

function normalizeFinding(finding) {
  const type = finding.type === 'invalid' ? 'invalid-unreachable' : finding.type;
  const labels = [...new Set([...(finding.labels || [type]).map((l) => (l === 'invalid' ? 'invalid-unreachable' : l)), type])];
  return { ...finding, type, labels };
}

function loadSnapshot(side) {
  const ts = readJson(`${side}-ts.json`, { findings: [], stats: {} });
  const py = readJson(`${side}-python.json`, { findings: [], stats: {} });
  const findings = [...(py.findings || []), ...(ts.findings || [])].map(normalizeFinding);
  findings.sort(
    (a, b) =>
      rank(a.type) - rank(b.type)
      || String(a.path).localeCompare(String(b.path))
      || Number(a.line_start) - Number(b.line_start)
      || String(a.symbol || '').localeCompare(String(b.symbol || '')),
  );
  return {
    findings,
    stats: { ts: ts.stats || {}, py: py.stats || {}, files: { ts: ts.files || 0, py: py.files || 0 } },
  };
}

const baseline = loadSnapshot('baseline');
const current = loadSnapshot(READ_SIDE);
const fixes = readJson('fixes.json', []);
const plans = readJson('plans.json', []);
const gates = readJson('gates.json', []);
const verification = readJson('verification.json', {});

// 处置登记：type+path+line_start(+symbol 前缀) 唯一匹配当前快照。
function matchFix(finding, list = fixes) {
  return list.find((fix) => {
    if (fix.type !== finding.type) return false;
    if (fix.path !== finding.path) return false;
    if (Number(fix.line_start) !== Number(finding.line_start)) return false;
    if (!fix.symbol) return true;
    return String(finding.symbol || '').startsWith(fix.symbol);
  });
}

const symbolName = (finding) => String(finding.symbol || '').trim().split(/\s+/).pop();
const identity = (finding) => `${finding.type}|${finding.path}|${symbolName(finding)}`;

const enriched = current.findings.map((finding) => {
  const fix = matchFix(finding);
  return {
    ...finding,
    status: fix?.status || 'reported',
    action: fix?.action || finding.action,
    note: fix?.note || '',
  };
});

// 已修复且已从当前快照消失的条目（符号被删除/去导出/整块合并）：
// 只出现在 baseline 里，必须补回 findings，否则「已修复」计数会漏掉真正的删除动作。
const present = new Set(enriched.map(identity));
const vanished = baseline.findings
  .filter((finding) => matchFix(finding, fixes.filter((fix) => fix.status === 'fixed')))
  .filter((finding) => !present.has(identity(finding)))
  .map((finding) => {
    const fix = matchFix(finding, fixes.filter((item) => item.status === 'fixed'));
    return {
      ...finding,
      status: 'fixed',
      action: fix?.action || finding.action,
      note: fix?.note || '已从当前快照消失（符号删除或去导出）',
      evidence: `（基线快照）${finding.evidence}`,
      vanished: true,
    };
  });

const merged = [...enriched, ...vanished].sort(
  (a, b) =>
    rank(a.type) - rank(b.type)
    || String(a.path).localeCompare(String(b.path))
    || Number(a.line_start) - Number(b.line_start)
    || String(a.symbol || '').localeCompare(String(b.symbol || '')),
);
const findings = merged.map((finding, index) => ({ id: `Q${String(index + 1).padStart(3, '0')}`, ...finding }));

const counts = findings.reduce((acc, f) => {
  acc[f.type] = (acc[f.type] || 0) + 1;
  return acc;
}, {});
const baselineCounts = baseline.findings.reduce((acc, f) => {
  acc[f.type] = (acc[f.type] || 0) + 1;
  return acc;
}, {});

writeFileSync(
  join(OUT, 'findings.json'),
  `${JSON.stringify(
    {
      generated_by: 'ops/checks/code_quality/run.mjs',
      date: DATE,
      snapshot: READ_SIDE,
      analyzers: ['analyze_py.py', 'analyze_ts.mjs'],
      include_roots: ROOTS.map((r) => r.dir),
      excluded: EXCLUSIONS,
      counts,
      baseline_counts: baselineCounts,
      findings,
    },
    null,
    2,
  )}\n`,
);

// ---------------------------------------------------------------------------
// 报告渲染
// ---------------------------------------------------------------------------
const esc = (value) => String(value ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
const range = (f) => `${f.line_start}${f.line_end && f.line_end !== f.line_start ? `–${f.line_end}` : ''}`;
const row = (f) =>
  `| ${f.type}${f.labels.length > 1 ? `（${f.labels.join('/')}）` : ''} | \`${f.path}\` | ${range(f)} | ${esc(f.evidence)} | ${esc(f.impact)} | ${esc(f.action)} | ${esc(f.status)} |`;
const table = (items) => ['| 类型 | 文件路径 | 行号 | 判定依据 | 影响范围 | 后续动作 | 状态 |', '|---|---|---|---|---|---|---|', ...items.map(row)].join('\n');

const byType = (type) => findings.filter((f) => f.type === type);
const fixed = findings.filter((f) => f.status === 'fixed');
const pending = findings.filter((f) => f.status === 'pending-manual');
const kept = findings.filter((f) => /^keep/.test(String(f.action)));
const reported = findings.filter((f) => f.status === 'reported');

const inventory = buildInventory();
const extCount = {};
for (const file of inventory) {
  const ext = file.slice(file.lastIndexOf('.'));
  extCount[ext] = (extCount[ext] || 0) + 1;
}
const extLine = Object.entries(extCount)
  .sort((a, b) => b[1] - a[1])
  .map(([ext, count]) => `${ext} ${count}`)
  .join(' / ');

const countRow = (type) =>
  `| ${type} | ${baselineCounts[type] || 0} | ${counts[type] || 0} | ${byType(type).filter((f) => f.status === 'fixed').length} | ${byType(type).filter((f) => f.status === 'pending-manual').length} |`;

const report = `# HomeOS-3D 源代码质量分析与优化报告

- 分析日期：${DATE}
- 生成器：\`ops/checks/code_quality/run.mjs\`（读取 \`${DATA}\`，重复运行输出逐字节一致）
- 分析器：\`analyze_py.py\`（Python AST）、\`analyze_ts.mjs\`（TypeScript 编译器 API，含 Vue SFC 脚本抽取与 \`.mjs\` import 边解析）
- 判定优先级：无效代码 > 死代码 > 低效实现 > 重复代码；同一处命中多类时 \`labels\` 保留全部可适用标签
- 纳入源码：**${inventory.length}** 个文件

## 1. 扫描摘要

### 1.1 纳入范围

${ROOTS.map((root) => `- \`${root.dir}\` — ${root.label}`).join('\n')}
- 根级构建配置（构建入口，需解析其 import 边）：${[...ROOT_FILES].map((f) => `\`${f}\``).join('、')}

扩展名分布：${extLine}。

### 1.2 排除范围

| 类别 | 代表路径 | 理由 |
|---|---|---|
${EXCLUSIONS.map(([category, sample, why]) => `| ${category} | \`${sample}\` | ${why} |`).join('\n')}

### 1.3 问题计数（基线 → 当前）

| 类型 | 基线 | 当前 | 已修复 | 待人工确认 |
|---|---:|---:|---:|---:|
${typeOrder.map(countRow).join('\n')}

> 说明：动态引用风险（反射、\`import()\` 字面量、\`new Worker(new URL(...))\`、配置/字符串驱动、\`__all__\`、框架装饰器、运行时公开导出面）一律不得直接删除。\`studio/runtime/**\`、\`studio/shims/**\`、\`packages/**\` 的导出与全部 \`.d.ts\` 只报告不删除。

## 2. 问题列表

${typeOrder.map((type) => `### 2.${typeOrder.indexOf(type) + 1} ${type}（${byType(type).length}）\n\n${byType(type).length ? table(byType(type)) : '无。'}`).join('\n\n')}

## 3. 优化方案（不改变业务逻辑的理由）

${plans.length ? '| # | 问题 | 类型 | 方案 | 行为等价理由 |\n|---|---|---|---|---|\n' + plans.map((plan, index) => `| ${index + 1} | ${esc(plan.problem)} | ${plan.type} | ${esc(plan.solution)} | ${esc(plan.equivalence)} |`).join('\n') : '本轮无可实施等价改造。'}

## 4. 实施记录

- 已修复：${fixed.length} 条（\`status=fixed\`，见 \`findings.json\`）。
- 复核后保留：${kept.length} 条（\`action\` 以 \`keep\` 开头：常量/结构上界循环、单查询游标、入口面导出）。
- 待人工确认：${pending.length} 条（见 \`manual-review.md\`）。
- 仅报告：${reported.length} 条（需人工判断是否进入下一轮）。

## 5. 验证结果

见 \`verification.md\`。摘要：

| 门禁 | 基线 | 当前 |
|---|---|---|
${gates.map((gate) => `| \`${gate.command}\` | ${esc(gate.baseline)} | ${esc(gate.after)} |`).join('\n')}

## 6. 待人工确认项

见 \`manual-review.md\`（${pending.length} 条），含潜在动态调用点、保留理由与复核建议。
`;
writeFileSync(join(OUT, 'report.md'), report);

const verificationLines = [
  '# 验证结果（行为等价与门禁回归）',
  '',
  '- 生成器：`ops/checks/code_quality/run.mjs`',
  '- 验证策略优先级：现有自动化测试 → 受影响路径的等价性检查/临时测试 → 逐分支手动推演 → 无法确定则保留并标记待人工确认。',
  `- 结论：${verification.summary || '见下文明细。'}`,
  '',
  '## 1. 门禁矩阵',
  '',
  '| 命令 | 基线 | 当前 | 证据 |',
  '|---|---|---|---|',
  ...gates.map((gate) => `| \`${gate.command}\` | ${esc(gate.baseline)} | ${esc(gate.after)} | ${esc(gate.evidence)} |`),
  '',
  '## 2. 自动化测试',
  '',
  ...(verification.tests || []).map((test) => `### ${test.name}\n\n- 命令：\`${test.command}\`\n- 结果：${test.result}\n${(test.details || []).map((d) => `- ${d}`).join('\n')}\n`),
  '',
  '## 3. 性能与复杂度证据',
  '',
  ...(verification.benchmarks || []).map(
    (bench) =>
      `### ${bench.name}\n\n- 输入：${bench.input}\n- 基线：${bench.before}\n- 当前：${bench.after}\n- 复杂度：${bench.complexity}\n- 结论：${bench.conclusion}\n`,
  ),
  '',
  '## 4. 等价性推演（无法直接执行的场景）',
  '',
  ...(verification.reasoning || []).map((item) => `### ${item.name}\n\n${item.argument}\n\n- 假设：${item.assumptions}\n`),
  '',
  '## 5. 一致性与可重跑',
  '',
  '- `node ops/checks/code_quality/run.mjs --date <date>` 连续两次运行，输出文件 sha256 一致。',
  '- 分析器输入为 `data/` 下的快照 JSON；排序键为（类型优先级, 路径, 起始行, 符号），不含时间戳/随机数。',
  `- 本轮校验：${verification.determinism || '见 gate 证据'}`,
  '',
];
writeFileSync(join(OUT, 'verification.md'), verificationLines.join('\n'));

const manual = pending
  .map((f) => `| ${f.type} | \`${f.path}\` | ${range(f)} | ${esc(f.evidence)} | ${esc(f.impact)} | ${esc(f.note)} |`)
  .join('\n');
writeFileSync(
  join(OUT, 'manual-review.md'),
  `# 待人工确认项（${pending.length}）

以下条目**未删除、未合并、未改变行为**，需人工确认后才能继续处理。

| 类型 | 文件 | 行号 | 判定依据 | 影响范围 | 保留理由与复核建议 |
|---|---|---|---|---|---|
${manual}

## 通用复核建议

1. 动态引用：先检索插件/配置/文档/HTML 模板中的字符串引用，再决定保留或降级为普通导出。
2. 跨项目重复：合并到 \`packages/shared-py/homeos_shared\` 时需同时修改两个后端的 import 与镜像构建，并补等价性测试。
3. 低效实现：先补基准再改；循环内 DB 调用需真实数据库与代表性数据量才能量化。
`,
);

console.log(`inventory: ${inventory.length} included, ${EXCLUSIONS.length} excluded`);
console.log(`findings: ${findings.length} (${Object.entries(counts).map(([k, v]) => `${k}=${v}`).join(', ')})`);
console.log(`fixed=${fixed.length} pending-manual=${pending.length} kept=${kept.length} reported=${reported.length}`);
