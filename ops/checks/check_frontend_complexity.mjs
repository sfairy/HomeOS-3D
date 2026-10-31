#!/usr/bin/env node
/**
 * 前端复杂度棘轮（函数圈复杂度 / 函数长度）。
 *
 * 为什么不是直接把 ESLint complexity 设为 error：studio 里已有 1,200+ 个
 * 圈复杂度 > 10 的函数（大量是 three.js 边界与历史面板装配代码），一次性清零不现实；
 * 但“不再变多”可以从今天开始守。做法与 check_complexity.py / check_any_baseline.mjs 一致：
 *
 * - 基线 ops/checks/frontend-complexity-baseline.json 记录**逐文件**的
 *   gt10 / gt15 / gt80 / max 计数；
 * - 任一文件比基线多，或新文件出现 gt10/gt80/max > 阈值 → 失败；
 * - 清理后跑 --update 压低基线，基线只降不升。
 *
 * 口径：TypeScript AST。函数节点 = 函数声明 / 方法 / 函数表达式 / 箭头函数 /
 * get/set / constructor；复杂度基数 1，每个 if/for/for-in/for-of/while/do/case/catch/
 * 三元 +1，每个 && / || / ?? +1。Vue SFC 只分析 script 块，行号按块偏移。
 *
 * 用法：
 *   node ops/checks/check_frontend_complexity.mjs            # 校验
 *   node ops/checks/check_frontend_complexity.mjs --update   # 重写基线（只能变小才该跑）
 *   node ops/checks/check_frontend_complexity.mjs --json     # 机器可读输出
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, relative, resolve } from 'node:path';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};
const repoRoot = resolve(argOf('root', resolve(import.meta.dirname, '../..')));
const update = args.includes('--update');
const asJson = args.includes('--json');
const BASELINE = join(repoRoot, 'ops/checks/frontend-complexity-baseline.json');
const ROOTS = ['homeos/frontend/src', 'homeos-store/frontend/src'];
const EXTENSIONS = new Set(['.ts', '.vue']);
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '.git']);

const DEC = new Set([
  ts.SyntaxKind.IfStatement,
  ts.SyntaxKind.ForStatement,
  ts.SyntaxKind.ForInStatement,
  ts.SyntaxKind.ForOfStatement,
  ts.SyntaxKind.WhileStatement,
  ts.SyntaxKind.DoStatement,
  ts.SyntaxKind.CaseClause,
  ts.SyntaxKind.CatchClause,
  ts.SyntaxKind.ConditionalExpression,
]);
const LOG = new Set([
  ts.SyntaxKind.AmpersandAmpersandToken,
  ts.SyntaxKind.BarBarToken,
  ts.SyntaxKind.QuestionQuestionToken,
]);

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

function analyzeText(text, file, scriptKind) {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, scriptKind);
  const functions = [];
  const visit = (node) => {
    if (
      ts.isFunctionDeclaration(node) ||
      ts.isMethodDeclaration(node) ||
      ts.isFunctionExpression(node) ||
      ts.isArrowFunction(node) ||
      ts.isGetAccessorDeclaration(node) ||
      ts.isSetAccessorDeclaration(node) ||
      ts.isConstructorDeclaration(node)
    ) {
      let complexity = 1;
      const walkIn = (inner) => {
        if (
          inner !== node &&
          (ts.isFunctionDeclaration(inner) ||
            ts.isMethodDeclaration(inner) ||
            ts.isFunctionExpression(inner) ||
            ts.isArrowFunction(inner) ||
            ts.isGetAccessorDeclaration(inner) ||
            ts.isSetAccessorDeclaration(inner) ||
            ts.isConstructorDeclaration(inner))
        ) {
          return;
        }
        if (DEC.has(inner.kind)) complexity += 1;
        if (inner.kind === ts.SyntaxKind.BinaryExpression && LOG.has(inner.operatorToken.kind)) {
          complexity += 1;
        }
        ts.forEachChild(inner, walkIn);
      };
      walkIn(node);
      const start = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
      const end = source.getLineAndCharacterOfPosition(node.getEnd()).line + 1;
      functions.push({ line: start, length: end - start + 1, complexity });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return functions;
}

function analyzeFile(file) {
  const text = readFileSync(file, 'utf8');
  if (file.endsWith('.vue')) {
    const functions = [];
    const re = /<script\b[^>]*>([\s\S]*?)<\/script>/g;
    let match;
    while ((match = re.exec(text))) {
      functions.push(...analyzeText(match[1], file, ts.ScriptKind.TS));
    }
    return functions;
  }
  return analyzeText(text, file, file.endsWith('.ts') ? ts.ScriptKind.TS : ts.ScriptKind.JS);
}

const files = ROOTS.flatMap((root) => walk(join(repoRoot, root))).sort();
const counts = {};
const totals = { functions: 0, gt10: 0, gt15: 0, gt80: 0 };
for (const file of files) {
  const functions = analyzeFile(file);
  if (functions.length === 0) continue;
  const gt10 = functions.filter((fn) => fn.complexity > 10).length;
  const gt15 = functions.filter((fn) => fn.complexity > 15).length;
  const gt80 = functions.filter((fn) => fn.length > 80).length;
  const max = functions.reduce((value, fn) => Math.max(value, fn.complexity), 0);
  totals.functions += functions.length;
  totals.gt10 += gt10;
  totals.gt15 += gt15;
  totals.gt80 += gt80;
  if (gt10 > 0 || gt80 > 0) {
    counts[relative(repoRoot, file)] = { functions: functions.length, gt10, gt15, gt80, max };
  }
}

if (update) {
  writeFileSync(
    BASELINE,
    `${JSON.stringify({ totals, files: counts }, null, 2)}\n`,
    'utf8',
  );
  console.log(
    `前端复杂度基线已更新：${Object.keys(counts).length} 个文件，` +
      `gt10=${totals.gt10} gt15=${totals.gt15} gt80=${totals.gt80}`,
  );
  process.exit(0);
}

let baseline;
try {
  baseline = JSON.parse(readFileSync(BASELINE, 'utf8'));
} catch (error) {
  console.error(
    `前端复杂度棘轮：读不到基线 ${relative(repoRoot, BASELINE)}（${error.message}）。` +
      '首次启用请先跑 --update 生成基线。',
  );
  process.exit(2);
}

const baselineFiles = baseline.files || {};
const problems = [];
for (const file of Object.keys(counts).sort()) {
  const before = baselineFiles[file] ?? { gt10: 0, gt15: 0, gt80: 0, max: 0 };
  const after = counts[file];
  for (const key of ['gt10', 'gt15', 'gt80', 'max']) {
    if (after[key] > (before[key] ?? 0)) {
      problems.push(`${file}: ${key} ${before[key] ?? 0} -> ${after[key]}`);
    }
  }
}

if (asJson) {
  console.log(JSON.stringify({ totals, problems }, null, 2));
} else if (problems.length > 0) {
  console.error(`前端复杂度棘轮失败：${problems.length} 项增加`);
  for (const line of problems) console.error(`  - ${line}`);
  console.error('  说明：这是“不许变多”的门禁。确实需要更复杂的函数时，先在评审里说明理由，');
  console.error('  再改 ops/checks/frontend-complexity-baseline.json（基线只该被 --update 压低）。');
} else {
  console.log(
    `前端复杂度棘轮通过：${Object.keys(counts).length} 个文件 / ` +
      `gt10=${totals.gt10} gt15=${totals.gt15} gt80=${totals.gt80}`,
  );
}
process.exit(problems.length > 0 ? 1 : 0);
