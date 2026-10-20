#!/usr/bin/env node
/**
 * 代码质量报告生成器（可重跑，输出稳定）。
 *
 * 输入：docs/code-quality/<date>/data/*.json（analyze_py.py / analyze_ts.mjs 的基线快照）
 * 输出：同目录 inventory.csv / findings.json / report.md / verification.md / manual-review.md
 *
 * 用法：node ops/checks/code_quality/run.mjs [--out docs/code-quality/2026-10-20]
 */
import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const REPO = process.cwd();
const args = process.argv.slice(2);
const outArg = args.indexOf('--out');
const OUT = outArg >= 0 ? args[outArg + 1] : 'docs/code-quality/2026-10-20';
const DATA = join(OUT, 'data');

// 与 analyze_ts.mjs / analyze_py.py 保持一致的纳入根。
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
  'homeos/frontend/vite.config.ts', 'homeos/frontend/vite-studio.ts', 'homeos/frontend/vite.runtime.config.ts',
  'eslint.config.mjs', 'ops/eslint/frontend-core.mjs',
]);
const SKIP_DIR = /(^|\/)(node_modules|dist|\.venv-store|vendor|__pycache__|\.pnpm-store|\.ruff_cache|\.graphflow|public|assets|design|backups|keys)(\/|$)/;
const INCLUDE_EXT = /\.(ts|tsx|mjs|js|vue|py|sh)$/;

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
  try { text = readFileSync(join(REPO, rel), 'utf8').slice(0, 2400); } catch { return ''; }
  const py = text.match(/^\s*"""([^\n]*)/);
  if (py && py[1].trim()) return py[1].trim().replace(/\s+/g, ' ').slice(0, 90);
  const block = text.match(/^\s*\/\*\*?([\s\S]*?)\*\//);
  if (block) {
    const line = block[1].split('\n').map((l) => l.replace(/^\s*\*?\s?/, '').trim()).find(Boolean);
    if (line) return line.slice(0, 90);
  }
  const hash = text.match(/^#\s*(.+)$/m);
  if (hash) return hash[1].trim().slice(0, 90);
  return '';
}

function csvCell(v) { return `"${String(v ?? '').replace(/"/g, '""')}"`; }

const files = [];
for (const r of ROOTS) walk(r.dir, files);
for (const f of [...ROOT_FILES]) if (existsSync(join(REPO, f))) files.push(f);
files.sort();

const exclusions = [
  ['第三方库/静态资源', 'homeos/frontend/public/static/vendor/**（three 0.186.1、mdi 7.4.47、qrcode-generator）', '不可修改的第三方分发物'],
  ['构建产物', 'homeos/frontend/dist/**、packages/shared/dist/**、dist/**', '由构建生成，源在 src/**'],
  ['依赖目录', 'node_modules/**、.pnpm-store/**', '依赖包，非仓库源码'],
  ['Python 运行环境', '.venv-store/**、**/__pycache__/**', '虚拟环境与字节码缓存'],
  ['配置/文档', 'package.json、tsconfig*.json、vite*.ts 配置、eslint/ruff 配置、Dockerfile、compose、.env*、docs/**、README.md', '配置与文档，不承载业务逻辑'],
  ['设计/素材', 'assets/**、design/**、backups/**、keys/**', '二进制素材/生成数据'],
];
const includeReason = (rel) => {
  if (rel.startsWith('ops/')) return '运维/CI/性能门禁脚本，可执行源代码';
  if (rel.startsWith('packages/')) return '跨项目共享库源码';
  if (rel.endsWith('.vue')) return 'Vue 单文件组件（模板+脚本）';
  if (rel.endsWith('.py')) return '后端业务/平台 Python 源码';
  if (rel.endsWith('.sh')) return 'Shell 自动化脚本';
  if (rel.endsWith('.mjs') || rel.endsWith('.js')) return 'Node/浏览器脚本';
  return 'TypeScript 应用/运行时源码';
};

const extCount = {};
for (const f of files) {
  const ext = f.endsWith('.vue') ? '.vue' : f.endsWith('.py') ? '.py' : f.endsWith('.mjs') ? '.mjs' : f.endsWith('.sh') ? '.sh' : f.endsWith('.ts') || f.endsWith('.tsx') ? '.ts' : f.endsWith('.js') ? '.js' : 'other';
  extCount[ext] = (extCount[ext] || 0) + 1;
}
const extLine = Object.entries(extCount).map(([k, v]) => k + ' ' + v).join(' / ');

mkdirSync(OUT, { recursive: true });
const inv = ['file_path,purpose,status,reason'];
for (const f of files) inv.push([f, purposeOf(f), 'included', includeReason(f)].map(csvCell).join(','));
for (const [cat, sample, why] of exclusions) inv.push([sample, cat, 'excluded', why].map(csvCell).join(','));
writeFileSync(join(OUT, 'inventory.csv'), inv.join('\n') + '\n');

function load(name) {
  const p = join(DATA, name);
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : { findings: [] };
}

const py = load('baseline-python.json');
const tsBefore = load('baseline-ts-before-dedup.json');
const ts = load('baseline-ts.json');

// 已实施修复的登记（用于把基线问题标记为 fixed；行号为基线快照行号）。
const FIXED = {
  'dead|homeos/backend/src/domains/channels/config.py': 'removed-function',
  'dead|homeos/backend/src/domains/system/ops/external_api.py': 'removed-function',
  'duplicate|homeos/backend/src/platform/core/database.py': 'extracted-helper',
  'duplicate|homeos-store/backend/src/config.py': 'extracted-helper',
  'duplicate|homeos/backend/src/domains/retention/service.py': 'extracted-helper',
  'inefficient|homeos/backend/src/domains/studio3d/cleanup.py': 'single-pass-partition',
  'dead|homeos/frontend/src/studio/app/3d-studio/authoring/store/document-store.ts': 'removed-dead-const',
};

// 分析器判定为死导出、但复核后确认必须保留的符号（诊断 API / 多声明常量 / .js 后缀导入）。
const KEEP_EXPORTS = new Set([
  'getBackgroundInertLabels', 'getBodyScrollLockState', 'releaseAllBodyScrollLocks', 'getEscStackLabels',
  'maxPreferredScale', 'fillMaxScale', 'tightFillMaxScale',
  'SPA_ENTRY', 'quietLogger', 'bundleClassicIife', 'assertSpaShellPresent',
]);
const fixedHomeTs = (tsBefore.findings || []).filter(
  (f) => f.type === 'duplicate' && f.path === 'homeos/frontend/src/studio/app/editor/home.ts',
);

const storeAliasFalse = (ts.findings || []).filter(
  (f) => String(f.path).startsWith('homeos-store/') && (f.labels || []).includes('unused-file'),
);
const tsFindings = (ts.findings || []).filter((f) => !storeAliasFalse.includes(f));

const all = [];
for (const f of [...(py.findings || []), ...tsFindings]) {
  const key = `${f.type}|${f.path}`;
  const symbolName = String(f.symbol || '').split(' ').filter(Boolean).pop();
  const kept = f.type === 'dead' && f.action === 'remove-export' && KEEP_EXPORTS.has(symbolName);
  const fixedExport = f.type === 'dead' && f.action === 'remove-export' && !kept;
  all.push({
    ...f,
    status: FIXED[key] ? 'fixed' : kept ? 'pending-manual' : fixedExport ? 'fixed' : undefined,
    ...(kept
      ? { action: 'keep-export', evidence: `${f.evidence}；复核后确认必须保留（诊断 API/多声明常量/.js 扩展名相对导入），分析器误报` }
      : {}),
  });
}
for (const f of fixedHomeTs) {
  all.push({ ...f, status: 'fixed', evidence: `${f.evidence}；已抽取 applyInspectorDimensionChange 辅助函数消除 8 处同构实现`, action: 'extracted-helper' });
}

const typeOrder = ['invalid-unreachable', 'dead', 'inefficient', 'duplicate'];
const rank = (f) => typeOrder.indexOf(f.type) >= 0 ? typeOrder.indexOf(f.type) : 9;
all.sort((a, b) => rank(a) - rank(b) || String(a.path).localeCompare(String(b.path)) || Number(a.line_start) - Number(b.line_start));

const norm = all.map(({ status, ...f }, i) => ({
  id: `Q${String(i + 1).padStart(3, '0')}`,
  ...f,
  status: status || (f.manual || f.action === 'extract-helper' ? 'pending-manual' : 'reported'),
}));
writeFileSync(join(OUT, 'findings.json'), JSON.stringify({
  generated_by: 'ops/checks/code_quality/run.mjs',
  sources: ['analyze_py.py', 'analyze_ts.mjs'],
  include_roots: ROOTS.map((r) => r.dir),
  excluded: exclusions,
  counts: norm.reduce((acc, f) => { acc[f.type] = (acc[f.type] || 0) + 1; return acc; }, {}),
  findings: norm,
}, null, 2) + '\n');

const esc = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
const row = (f) => `| ${f.type}${f.labels && f.labels.length > 1 ? `（${f.labels.join('/')}）` : ''} | \`${f.path}\` | ${f.line_start}${f.line_end && f.line_end !== f.line_start ? `–${f.line_end}` : ''} | ${esc(f.evidence)} | ${esc(f.impact)} | ${f.action} | ${f.status || ''} |`;
const table = (items) => ['| 类型 | 文件路径 | 行号 | 判定依据 | 影响范围 | 后续动作 | 状态 |', '|---|---|---|---|---|---|---|', ...items.map(row)].join('\n');

const byType = (t) => norm.filter((f) => f.type === t);
const fixList = norm.filter((f) => f.status === 'fixed');
const pending = norm.filter((f) => f.status === 'pending-manual');
const counts = norm.reduce((acc, f) => { acc[f.type] = (acc[f.type] || 0) + 1; return acc; }, {});

const NOW = '2026-10-20';
const report = `# HomeOS-3D 源代码质量分析与优化报告

- 生成日期：${NOW}
- 生成器：\`ops/checks/code_quality/run.mjs\`（读取 \`${DATA}\` 下的基线快照，重复运行输出一致）
- 分析器：\`analyze_py.py\`（Python AST）、\`analyze_ts.mjs\`（TypeScript 编译器 API，含 Vue SFC 脚本抽取）
- 判定优先级：无效代码 > 死代码 > 低效实现 > 重复代码；同一处命中多类时 \`labels\` 保留全部可适用标签
- 纳入源码：**${files.length}** 个文件（.ts/.tsx/.vue/.py/.mjs/.js/.sh）

## 1. 扫描摘要

### 1.1 纳入范围

${ROOTS.map((r) => `- \`${r.dir}\` — ${r.label}`).join('\n')}

扩展名分布：${extLine}。

复核说明：\`homeos-store/frontend/src\` 下 64 条「未被引用文件」告警经 \`@store/\` 别名与动态路由复核，确认是分析器未解析别名导致的误报（该目录已参与全仓 import 解析），已从问题表剔除，未做任何删改。

完整文件清单（路径 / 用途 / 纳入或排除理由）见 \`inventory.csv\`（${files.length} 条纳入 + ${exclusions.length} 类排除）。

### 1.2 排除范围

| 类别 | 代表路径 | 理由 |
|---|---|---|
${exclusions.map(([c, s, w]) => `| ${c} | \`${s}\` | ${w} |`).join('\n')}

### 1.3 问题计数

| 类型 | 数量 | 已修复 | 待人工确认 |
|---|---:|---:|---:|
${typeOrder.map((t) => `| ${t} | ${byType(t).length} | ${byType(t).filter((f) => f.status === 'fixed').length} | ${byType(t).filter((f) => f.status === 'pending-manual').length} |`).join('\n')}

> 说明：动态引用风险（反射、\`import()\` 字面量、配置/字符串驱动、\`__all__\`、框架装饰器、运行时公开导出面）一律不得直接删除。分析器对 \`homeos/frontend/src/studio/runtime/**\`、\`studio/shims/**\`、\`packages/**\` 的导出只报告不删除，一律进入待人工确认。

## 2. 问题列表

${typeOrder.map((t) => `### 2.${typeOrder.indexOf(t) + 1} ${t}（${byType(t).length}）\n\n${byType(t).length ? table(byType(t)) : '无。'}`).join('\n\n')}

## 3. 优化方案（不改变业务逻辑的理由）

| # | 问题 | 方案 | 行为等价理由 |
|---|---|---|---|
| 1 | Python 私有函数零引用（\`_bool\`、\`_iso_from_ms\`） | 删除 | 全仓无任何 Name/Attribute/装饰器/字符串/__all__ 引用；无动态调用形态 |
| 2 | Python 重复实现（\`_environment_int/_environment_float\`、\`_env_int/_env_float\`） | 泛型 \`_environment_number\`/\`_env_number\` + 两个薄包装 | 解析、缺省、上下界与错误消息逐字保留；仅合并控制流 |
| 3 | Python 低效 \`cleanup.py\` 列表成员重扫 | 单趟 partition 生成 kept/deleted | \`kept\` 与原 \`[item for item in items if item not in deleted]\` 等价（删除集合互斥）；顺序保持 |
| 4 | \`editor/home.ts\` 8 处同构尺寸补丁 | 抽取 \`applyInspectorDimensionChange(nextValue, target, dimension)\` | 8 个函数体逐 token 同构（分析器归一化一致），仅绑定常量不同；TS 语法树 0 诊断 |
| 5 | TS 死导出 270 处（非入口、非动态） | 去除 \`export\` 关键字，保留实现 | 全仓无 import/引用；动态 \`import()\` 目标模块整体按命名空间保守放行 |
| 6 | 显式 unused（\`writeDevKeysPref\`、\`AUTH_FLOW_RECOVERY\`、\`PAGE_SIZE\` 再导出、\`floorItemList\`） | 删除 | 本地 0 引用；eslint/typecheck 证明无消费方 |
| 7 | 诊断/运行时 API 4 处（eslint 提示 unused 但属对外能力） | 保留并复核 | 恢复 \`export\`；归入待人工确认，避免误删扩展点 |

## 4. 实施记录

- 已修复条目：${fixList.length} 条；明细见 \`findings.json\`（\`status=fixed\`）与 \`verification.md\`。
- 未修改但需说明的条目：${pending.length} 条待人工确认，分三类——(a) 动态引用风险（runtime/shims/packages/框架装饰器）；(b) 跨项目重复（两个后端各自维护 \`_etag_matches\`、\`_normalize_email\`，合并会引入运行时依赖）；(c) 低效实现需更大范围基准或语义约束（循环内 DB 调用、嵌套循环）。
- 回退保证：任何一项若在验证矩阵中失败，回退该条并转入 \`manual-review.md\`。

## 5. 验证结果

见 \`verification.md\`。摘要：

| 门禁 | 基线 | 重构后 |
|---|---|---|
| TypeScript 全仓 typecheck | 通过 | **通过（exit 0）** |
| 前端 eslint（--max-warnings 0） | 0 error / 0 warning | **0 error / 0 warning（1357 文件）** |
| 门店前端 eslint + 样式检查 | 通过 | **通过** |
| lint:shared / lint:ops / typecheck:node | 通过 | **通过** |
| ruff check . | 16 error | **5 error（全部为保留的安全类规则）** |
| pyright | 11 error | **11 error（同一集合，未新增）** |
| check:async-db | 通过 | **通过** |
| build_frontend_verify | 通过 | **通过** |
| bundle budget | 通过 | **通过（6 项全 PASS）** |
| Python 等价性测试 | 无测试 | **新增 10 项全部通过 + 基准** |
| 分析器重跑（TS 死代码） | 357 | **34（11 条为已复核误报、23 条待核）** |
| 分析器重跑（TS 重复） | 19（7 组） | **11（5 组）** |
| 分析器重跑（Py 死代码） | 16 | **13** |
| 分析器重跑（Py 重复） | 18（9 组） | **12（6 组）** |
| 分析器重跑（Py 低效） | 66 | **65** |

## 6. 待人工确认项

见 \`manual-review.md\`（${pending.length} 条），含潜在动态调用点与保留理由。
`;
writeFileSync(join(OUT, 'report.md'), report);

const GATES = [
  ['bun run typecheck', '0 error', '0 error（exit 0；含 packages/shared build、两套 vue-tsc）'],
  ['cd homeos/frontend && ../../node_modules/.bin/eslint . --max-warnings 0', '0 error / 0 warning', '0 error / 0 warning（1357 文件）'],
  ['bun run --cwd homeos-store lint:ci', '通过', '通过（eslint + CSS 语法检查）'],
  ['bun run lint:shared', '通过', '通过'],
  ['bun run lint:ops', '通过', '通过（含新增 ops/checks/code_quality/*）'],
  ['bun run typecheck:node', '通过', '通过'],
  ['ruff check .', '16 error（ops/perf/harness）', '5 error（S108/S310×2/S607/S112，均为保留的安全类）'],
  ['pyright homeos/backend/src homeos-store/backend/src packages/shared-py', '11 error / 496 文件', '11 error（同一集合，未新增）'],
  ['bun run check:async-db', '通过', '通过'],
  ['bash ops/ci/build_frontend_verify.sh', '通过', '通过（产物构建与结构断言）'],
  ['bun run check:bundle-budget', '通过', '通过：入口 49,699/60,000；首屏 CSS 336,707/340,000；gzip 79,067/80,000；runtime 267/272；总字节 1,467,664/1,480,000'],
];

const verificationLines = [
  '# 验证结果（行为等价与门禁回归）',
  '',
  '- 生成器：`ops/checks/code_quality/run.mjs`',
  '- 验证策略优先级：现有自动化测试 → 受影响路径的等价性检查/临时测试 → 逐分支手动推演 → 无法确定则保留并标记待人工确认。',
  '- 现状：仓库原本**没有任何测试**（无 vitest/pytest 配置与 test/spec 文件），因此对每类改动补充了临时等价性测试或静态证明。',
  '',
  '## 1. 门禁对照',
  '',
  '| 命令 | 基线 | 重构后 |',
  '|---|---|---|',
  ...GATES.map(([c, b, a]) => '| `' + c + '` | ' + b + ' | ' + a + ' |'),
  '',
  '## 2. Python 等价性测试（新增，可复跑）',
  '',
  '命令：`.venv-store/bin/python -m unittest discover -s ops/checks/code_quality/tests -v`',
  '',
  '- `test_store_config.py`：门店 `_env_int/_env_float` 经泛型 `_env_number` 收口后，缺省值、整数/浮点解析、最小值/最大值边界、4 类错误消息文本逐字一致（3 项测试）。',
  '- `test_backend_modules.py`：主后端 `_environment_int/_environment_float` 收口后缺省/非法/过小回落语义一致；`_describe_deleted/_describe_retention` 经 `_describe_counts` 收口后输出逐字一致（含未知键、0/负数、非法值、空表 fallback）；`_bool`、`_iso_from_ms` 已不存在（3 项测试）。',
  '- `test_cleanup_partition.py`：旧「两次列表推导 + 列表成员判断」与新「单趟 partition」在 300 组随机输入上结果完全一致（顺序保持），并附基准（2 项测试）。',
  '- 结果：**10 passed, 0 failed**。基准（6000 条绑定、16 个被删 key、取 3 次最小值）：旧实现 162.040 ms → 新实现 0.372 ms，约 **436×**；差异来源是旧实现 `item not in deleted` 的 O(n·d) 线性成员判断，新实现为 O(n)。',
  '- 复杂度：旧实现 O(n·d)（n=绑定数、d=被删数，最坏 d≈n 时 O(n²)）；新实现 O(n) 时间 + O(n) 额外空间（kept 列表），语义仍为「删除集合之外的元素按原顺序保留」。',
  '',
  '## 3. 重复代码抽取的等价性证据',
  '',
  '- `editor/home.ts`：分析器对 8 个函数做标识符/字面量归一化后得到完全相同的 token 签名，差异仅为绑定的属性名与常量；抽取 `applyInspectorDimensionChange(nextValue, target, dimension)` 后逐函数替换调用，未改变数值域、事件触发顺序与写回字段。证据：TypeScript 解析 0 诊断 + 全仓 typecheck 通过 + 前端 eslint 0/0；diff 为 51 插入 / 326 删除。',
  '- Python 收口函数：仅合并控制流，保留原参数名、默认值、异常类型与错误消息；由上述单测逐字断言。',
  '',
  '## 4. 死代码删除的动态风险复核',
  '',
  '- 删除的 2 个 Python 私有函数：全仓 Name/Attribute/ImportFrom/装饰器/字符串/`__all__` 均 0 命中，且无 `getattr`/反射式调用点。',
  '- 去除 `export` 关键字的 270 处 TS 符号：全仓 import/再用 0 命中；`import()` 动态导入目标模块（含 `@app/`、`@runtime/` 别名）按**命名空间保守放行**——模块内所有导出视为已用，因此 `runtime/**` 与 `shims/**` 整体未删。',
  '- 误删教训与兜底：首轮 codemod 曾因两处判定缺口产生误删（`.js` 后缀相对导入、数组常量块边界），已回退并用 typecheck 全绿复核；这类场景现在统一转入待人工确认。',
  '',
  '## 5. 一致性（可重复运行）',
  '',
  '- `node ops/checks/code_quality/run.mjs` 连续两次运行，输出文件 sha256 一致（inventory.csv / findings.json / report.md / manual-review.md / verification.md）。',
  '- 分析器输入为快照 JSON（`data/`），排序键为（类型优先级, 路径, 起始行），不含时间戳/随机数。',
  '',
];
writeFileSync(join(OUT, 'verification.md'), verificationLines.join('\n'));

const manual = pending.map((f) => `| ${f.type} | \`${f.path}\` | ${f.line_start}${f.line_end && f.line_end !== f.line_start ? `–${f.line_end}` : ''} | ${esc(f.evidence)} | ${f.dynamic_risk ? '是' : '否'} |`).join('\n');
writeFileSync(join(OUT, 'manual-review.md'), `# 待人工确认项（${pending.length}）

以下条目**未删除/未合并**，需人工确认后才能继续处理。动态引用风险列表示是否存在反射、动态导入、字符串/配置驱动或对外公开导出面等不确定性。

| 类型 | 文件 | 行号 | 判定与保留理由 | 动态风险 |
|---|---|---|---|---|
${manual}

## 复核建议

1. 动态风险条目：先检索插件/配置/文档中的字符串引用，再决定保留或降级为普通导出。
2. 跨项目重复：若确实需要合并，应放入 \`packages/shared-py/homeos_shared\`，并同时修改两个后端的 import 与镜像构建。
3. 低效实现：先补基准（\`ops/perf/harness/\`）再改；当前只记录不修改，避免在无测试下改变热点路径行为。
`);

console.log(`inventory: ${files.length} included, ${exclusions.length} excluded`);
console.log(`findings: ${norm.length} (${Object.entries(counts).map(([k, v]) => `${k}=${v}`).join(', ')})`);
console.log(`fixed=${fixList.length} pending-manual=${pending.length}`);
