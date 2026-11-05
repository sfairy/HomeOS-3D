#!/usr/bin/env node
/**
 * 批量清理 `noUnusedLocals` / `noUnusedParameters` 报出的未使用声明。
 *
 * 背景：本仓此前没有开启这两个 tsconfig 选项（`homeos-store` 早就开了，主应用没开），
 * 所以仓库里积压了大量「声明了但没人读」的代码。ESLint 的 `unused-imports` 只在**整条
 * import 全部未使用**时才报，看不见 `const { a, b } = scope` 里单个 `b` 的残留——这类
 * 残留正是 studio 里最多的形态。开启 tsc 的严格选项后它们才暴露出来。
 *
 * 用法：
 *   node ops/checks/fix_unused_locals.mjs --dry-run   # 只打印分类与计划改动
 *   node ops/checks/fix_unused_locals.mjs --write     # 落盘（默认最多 5 轮，收敛级联）
 *
 * 设计要点：
 *
 * 1. **诊断来自 `vue-tsc` 而非 `tsc`**：`.vue` 的未使用判定依赖 Volar 的模板作用域分析，
 *    纯 `tsc` 不认识 SFC。脚本调用 `ops/lib/run-vue-tsc.mjs`，与 `typecheck` 同一条链路。
 * 2. **`.vue` 一律不自动改**：实测的 8 处全是「字符串模板 ref」（`ref="rootRef"` 配
 *    `const rootRef = ref(...)`）。这不是死代码，而是 Vue 3.5 之前的老写法；自动删除会
 *    直接把运行时功能删掉。脚本把它们列进 `--manual` 清单，交人工迁到 `useTemplateRef`。
 * 3. **按 AST 定位而非按行匹配**：删除范围由 TypeScript 语法树给出，避免正则误伤同名标识符。
 * 4. **有副作用的初始化器不静默删除**：`const x = await setup()` 这类若直接删会跳过调用；
 *    脚本识别 `await` / 赋值表达式后判为 `risky`，只报告不改。
 * 5. **多轮收敛**：删除 `const x = obj.y` 可能让 `obj` 变成新的未使用，故循环执行直到无诊断
 *    或达到轮数上限。
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..', '..');
const FRONTEND_DIR = path.join(REPO_ROOT, 'homeos', 'frontend');
const VUE_TSC = path.join(REPO_ROOT, 'ops', 'lib', 'run-vue-tsc.mjs');

const args = process.argv.slice(2);
const WRITE = args.includes('--write');
const DRY = args.includes('--dry-run') || !WRITE;
const MAX_PASSES = 5;

/**
 * tsc 对本批问题会给出四种措辞，都要接住：
 *   TS6133 `'x' is declared but its value is never read.`   —— 单个绑定/声明
 *   TS6196 `'X' is declared but never used.`                —— 类型/接口
 *   TS6198 `All destructured elements are unused.`          —— 整个解构模式
 *   TS6199 `All variables are unused.`                      —— 整条声明
 */
const DIAG_RE =
  /^(src\/[^(]+)\((\d+),(\d+)\): error (TS6133|TS6196|TS6198|TS6199): (?:(?:error )?'([^']+)' is declared but (?:its value is never read|never used)|All (?:destructured elements|variables) are unused)\.$/;

function runVueTsc() {
  try {
    return execFileSync(process.execPath, [VUE_TSC, '-p', 'tsconfig.json', '--pretty', 'false', '--noEmit'], {
      cwd: FRONTEND_DIR,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (error) {
    // tsc 有诊断时退出码非 0，输出在 stdout 上，这里照常解析。
    const out = `${error.stdout ?? ''}${error.stderr ?? ''}`;
    if (!out.trim()) throw error;
    return out;
  }
}

function collectDiagnostics(output) {
  const byFile = new Map();
  for (const rawLine of output.split('\n')) {
    const line = rawLine.trim();
    const m = line.match(DIAG_RE);
    if (!m) continue;
    const [, file, lineNo, col, code, name] = m;
    if (!byFile.has(file)) byFile.set(file, []);
    byFile.get(file).push({ line: Number(lineNo), col: Number(col), code, name });
  }
  return byFile;
}

/**
 * 把 `(line, col)` 映射到字符偏移。
 * tsc 的行列都是 1 基，且 `.vue` 的映射由 Volar 保证指回原始文件，故这里按原始文本算即可。
 */
function offsetOf(text, line, col) {
  let offset = 0;
  let currentLine = 1;
  while (currentLine < line && offset < text.length) {
    const next = text.indexOf('\n', offset);
    if (next === -1) return text.length;
    offset = next + 1;
    currentLine += 1;
  }
  return offset + (col - 1);
}

/** 标识符所在行是否「只有它自己 + 可能的逗号」——决定能否整行删除。 */
function lineSpanIfAlone(text, start, end) {
  const lineStart = text.lastIndexOf('\n', start - 1) + 1;
  let lineEnd = text.indexOf('\n', end);
  if (lineEnd === -1) lineEnd = text.length;
  const before = text.slice(lineStart, start);
  const after = text.slice(end, lineEnd);
  if (!before.trim() && /^\s*,?\s*$/.test(after)) return { lineStart, lineEnd };
  return null;
}

/** 删除一个列表元素（解构项 / 声明项），连同它自己的逗号。 */
function removeListElement(text, node) {
  const alone = lineSpanIfAlone(text, node.getStart(), node.getEnd());
  if (alone) {
    // 整行删除，含换行符。
    return { start: alone.lineStart, end: Math.min(alone.lineEnd + 1, text.length) };
  }
  // 找紧随其后的逗号。
  let cursor = node.getEnd();
  while (cursor < text.length && /[ \t]/.test(text[cursor])) cursor += 1;
  if (text[cursor] === ',') {
    cursor += 1;
    while (cursor < text.length && /[ \t]/.test(text[cursor])) cursor += 1;
    return { start: node.getStart(), end: cursor };
  }
  // 末项：吃掉前面的逗号，以及逗号到本项之间的换行/缩进。
  // 否则 `const a = 1, b = 2` 删掉 b 会留下 `const a = 1,\n  ;`（TS1009）。
  let back = node.getStart() - 1;
  while (back >= 0 && /[ \t]/.test(text[back])) back -= 1;
  if (text[back] === ',') {
    let end = node.getEnd();
    while (end < text.length && /[ \t\r\n]/.test(text[end])) end += 1;
    return { start: back, end };
  }
  return { start: node.getStart(), end: node.getEnd() };
}

/**
 * 绑定元素是否处在**数组解构**里。
 *
 * 数组解构是**按位置**配对的：`const [{ a }, { b }] = await Promise.all([m1, m2])` 里删掉
 * 第一项会让 `{ b }` 去接 m1 的返回值 —— 静默的类型错乱，比留着一个未使用变量危险得多。
 * 正确修法是把 initializer 数组里的对应项一起删掉，属于重构而非批量清理，故一律交人工。
 */
function isInsideArrayPattern(node) {
  let cursor = node.parent;
  while (cursor) {
    if (ts.isArrayBindingPattern(cursor)) return true;
    if (ts.isBindingElement(cursor) || ts.isObjectBindingPattern(cursor)) {
      cursor = cursor.parent;
      continue;
    }
    break;
  }
  return false;
}

/** 删除一条完整语句，附带它前面的整行注释更保守——这里只删语句本身及其独占的换行。 */
function removeStatement(text, statement) {
  const start = statement.getStart();
  const end = statement.getEnd();
  const lineStart = text.lastIndexOf('\n', start - 1) + 1;
  let lineEnd = text.indexOf('\n', end);
  if (lineEnd === -1) lineEnd = text.length;
  const beforeEmpty = !text.slice(lineStart, start).trim();
  const afterEmpty = !text.slice(end, lineEnd).trim();
  if (beforeEmpty && afterEmpty) return { start: lineStart, end: Math.min(lineEnd + 1, text.length) };
  // 同一行还有别的语句，保留换行但删语句。
  return { start, end };
}

/** 初始化器是否可能带副作用——只有这些形态才不允许静默删除。 */
function hasRiskyInitializer(node) {
  const init = node.initializer;
  if (!init) return false;
  if (ts.isAwaitExpression(init)) return true;
  // 比较运算（`>=` / `===`）是纯的；只有赋值类运算符会改外部状态。
  if (ts.isBinaryExpression(init)) {
    const kind = init.operatorToken.kind;
    return (
      kind >= ts.SyntaxKind.FirstAssignment && kind <= ts.SyntaxKind.LastAssignment
    );
  }
  return false;
}

function findIdentifier(sf, pos) {
  let found = null;
  const visit = (node) => {
    if (found) return;
    if (node.getStart(sf) === pos && ts.isIdentifier(node)) {
      found = node;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}

/**
 * 兜底定位：tsc 对 `{ prop: local }` 这类重命名解构，列号指向外层模式的 `{` 而不是绑定名，
 * 因此按「同一行内、文本相同的标识符」再找一次。
 */
function findIdentifierOnLine(sf, name, line, lineStarts) {
  const start = lineStarts[line - 1];
  const end = lineStarts[line] ?? Number.MAX_SAFE_INTEGER;
  let found = null;
  const visit = (node) => {
    if (found) return;
    if (ts.isIdentifier(node) && node.text === name) {
      const p = node.getStart(sf);
      if (p >= start && p < end) {
        found = node;
        return;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}

/** 取位置处最深的节点（用于 TS6198/TS6199 这类没有名字的模式级诊断）。 */
function findNodeAt(sf, pos) {
  let best = null;
  const visit = (node) => {
    const start = node.getStart(sf);
    if (start <= pos && pos < node.getEnd()) {
      best = node;
      ts.forEachChild(node, visit);
    }
  };
  visit(sf);
  return best;
}

function computeLineStarts(text) {
  const starts = [0];
  for (let i = 0; i < text.length; i += 1) if (text[i] === '\n') starts.push(i + 1);
  return starts;
}

/** 为单个诊断生成一条编辑计划；返回 { kind, edit?, reason? }。 */
function planFix(text, sf, diag, lineStarts) {
  const pos = offsetOf(text, diag.line, diag.col);

  // 模式级诊断（TS6198 / TS6199）：位置指向整个模式或整条声明，没有单个标识符。
  if (diag.code === 'TS6198' || diag.code === 'TS6199') {
    const node = findNodeAt(sf, pos);
    if (!node) return { kind: 'manual', reason: '模式级诊断定位失败' };
    if (ts.isBindingElement(node.parent) && node.parent.name === node) {
      if (isInsideArrayPattern(node.parent)) {
        return { kind: 'manual', reason: '数组解构按位置配对，需连同 initializer 一起改' };
      }
      return { kind: 'binding', edit: removeListElement(text, node.parent) };
    }
    const statement = ts.isVariableStatement(node) ? node : node.parent;
    if (ts.isVariableStatement(statement)) {
      if (statement.declarationList.declarations.some(hasRiskyInitializer)) {
        return { kind: 'risky', reason: '初始化器可能带副作用' };
      }
      return { kind: 'statement', edit: removeStatement(text, statement) };
    }
    return { kind: 'manual', reason: `模式级诊断落在 ${ts.SyntaxKind[node.kind]} 上` };
  }

  const id = findIdentifier(sf, pos) ?? (diag.name ? findIdentifierOnLine(sf, diag.name, diag.line, lineStarts) : null);
  if (!id) return { kind: 'manual', reason: '定位不到标识符' };

  const parent = id.parent;

  // 形参：加下划线前缀即可（tsc 对形参豁免 `_` 前缀；局部变量不豁免，故不能用这招）。
  if (ts.isParameter(parent) && parent.name === id) {
    if (id.text.startsWith('_')) return { kind: 'skip', reason: '已是下划线前缀' };
    return { kind: 'param', edit: { start: id.getStart(), end: id.getStart(), text: '_' } };
  }
  if (ts.isBindingElement(parent) && parent.name === id) {
    if (isInsideArrayPattern(parent)) {
      return { kind: 'manual', reason: '数组解构按位置配对，需连同 initializer 一起改' };
    }
    return { kind: 'binding', edit: removeListElement(text, parent) };
  }
  if (ts.isImportSpecifier(parent) || ts.isImportClause(parent)) {
    return { kind: 'manual', reason: '未使用 import（应由 biome lint --write 处理）' };
  }
  if (ts.isVariableDeclaration(parent) && parent.name === id) {
    const list = parent.parent;
    if (ts.isVariableDeclarationList(list)) {
      const statement = list.parent;
      const isStatement = ts.isVariableStatement(statement);
      if (isStatement && list.declarations.length === 1) {
        if (hasRiskyInitializer(parent)) return { kind: 'risky', reason: '初始化器可能带副作用' };
        return { kind: 'statement', edit: removeStatement(text, statement) };
      }
      if (hasRiskyInitializer(parent)) return { kind: 'risky', reason: '初始化器可能带副作用' };
      return { kind: 'declaration', edit: removeListElement(text, parent) };
    }
  }
  if (
    ts.isFunctionDeclaration(parent) ||
    ts.isInterfaceDeclaration(parent) ||
    ts.isTypeAliasDeclaration(parent) ||
    ts.isClassDeclaration(parent) ||
    ts.isEnumDeclaration(parent)
  ) {
    return { kind: 'statement', edit: removeStatement(text, parent) };
  }
  if (ts.isPropertyDeclaration(parent) || ts.isPropertySignature(parent) || ts.isMethodDeclaration(parent)) {
    return { kind: 'manual', reason: '成员声明（类型/接口的一部分），需人工判断' };
  }
  return { kind: 'manual', reason: `未覆盖的语法形态：${ts.SyntaxKind[parent.kind]}` };
}

function applyEdits(text, edits) {
  // 从后往前应用，避免偏移漂移。
  const sorted = [...edits].sort((a, b) => b.start - a.start);
  let out = text;
  for (const e of sorted) out = out.slice(0, e.start) + (e.text ?? '') + out.slice(e.end);
  return out;
}

function scriptKindOf(file) {
  if (file.endsWith('.tsx')) return ts.ScriptKind.TSX;
  if (file.endsWith('.jsx')) return ts.ScriptKind.JSX;
  return ts.ScriptKind.TS;
}

/** 统计语法/grammar 级错误数量：`parseDiagnostics` 不含 TS1009，故走 transpileModule。 */
function grammarErrorCount(text, file) {
  const result = ts.transpileModule(text, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.Preserve },
    fileName: file,
    reportDiagnostics: true,
  });
  return (result.diagnostics ?? []).filter((d) => d.category === ts.DiagnosticCategory.Error).length;
}

const tally = new Map();
const manualList = [];

function onePass() {
  const output = runVueTsc();
  const byFile = collectDiagnostics(output);
  const total = [...byFile.values()].reduce((n, list) => n + list.length, 0);
  if (total === 0) return 0;

  const touched = [];
  for (const [relFile, diags] of byFile) {
    if (relFile.endsWith('.vue')) {
      for (const d of diags) manualList.push(`${relFile}(${d.line},${d.col}) ${d.name} —— 字符串模板 ref，改 useTemplateRef`);
      tally.set('vue-manual', (tally.get('vue-manual') ?? 0) + diags.length);
      continue;
    }

    const abs = path.join(FRONTEND_DIR, relFile);
    const text = fs.readFileSync(abs, 'utf8');
    const sf = ts.createSourceFile(relFile, text, ts.ScriptTarget.ES2022, true, scriptKindOf(relFile));
    const lineStarts = computeLineStarts(text);

    const edits = [];
    for (const d of diags) {
      const plan = planFix(text, sf, d, lineStarts);
      tally.set(plan.kind, (tally.get(plan.kind) ?? 0) + 1);
      if (plan.edit) edits.push(plan.edit);
      else if (plan.kind === 'manual' || plan.kind === 'risky') {
        manualList.push(`${relFile}(${d.line},${d.col}) ${d.name} —— ${plan.reason}`);
      }
    }
    if (edits.length === 0) continue;

    const next = applyEdits(text, edits);
    // 语法回验：`createSourceFile` 的 parseDiagnostics 抓不到 TS1009 这类 **grammar** 错误，
    // 用 transpileModule（会跑 checkGrammar）再验一次。新增错误就整文件跳过。
    const before = grammarErrorCount(text, relFile);
    const after = grammarErrorCount(next, relFile);
    if (after > before) {
      manualList.push(`${relFile} —— 编辑后新增 ${after - before} 个语法错误，已跳过该文件`);
      tally.set('syntax-guard', (tally.get('syntax-guard') ?? 0) + 1);
      continue;
    }

    touched.push(relFile);
    if (WRITE) fs.writeFileSync(abs, next);

    touched.push(relFile);
    if (WRITE) fs.writeFileSync(abs, next);
  }
  return touched.length;
}

if (!fs.existsSync(VUE_TSC)) {
  console.error(`[fix-unused] 找不到 ${VUE_TSC}`);
  process.exit(1);
}

let pass = 0;
while (pass < MAX_PASSES) {
  pass += 1;
  const changed = onePass();
  console.log(`[fix-unused] 第 ${pass} 轮：${DRY ? '（dry-run 不落盘）' : ''}改动 ${changed} 个文件`);
  if (changed === 0) break;
  if (DRY) break;
}

console.log('\n[fix-unused] 分类统计：');
for (const [kind, count] of [...tally.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(count).padStart(5)}  ${kind}`);
}

if (manualList.length) {
  console.log(`\n[fix-unused] 需人工处理 ${manualList.length} 处：`);
  for (const item of manualList) console.log(`  ${item}`);
}

console.log(DRY ? '\n[fix-unused] 未落盘。加 --write 应用改动。' : '\n[fix-unused] 完成。请重跑 typecheck 确认收敛。');
