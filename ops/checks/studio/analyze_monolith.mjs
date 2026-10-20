#!/usr/bin/env node
/**
 * 分析 Studio 单体里的嵌套函数、行数与自由变量，输出 JSON。
 *
 * 用途：拆分前确定每个候选函数的依赖面；自由变量=引用了 boot 函数作用域内的
 * 声明（需要作为参数/context 传入），external=模块级/导入/全局。写入引用单独标记。
 *
 * 用法:
 *   node ops/checks/studio/analyze_monolith.mjs --file homeos/frontend/src/.../studio-app.ts --boot bootStudio --out /tmp/app.json
 */
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const args = process.argv.slice(2);
const get = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const repoRoot = path.resolve(import.meta.dirname, '../../..');
const file = path.resolve(repoRoot, get('file', 'homeos/frontend/src/studio/app/3d-studio/authoring/studio-app.ts'));
const bootName = get('boot', 'bootStudio');
const minLines = Number(get('min-lines', '20'));
const outFile = get('out', '');
const program = ts.createProgram([file], {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  allowJs: false,
  noEmit: true,
  skipLibCheck: true,
});
const sf = program.getSourceFile(file);
if (!sf) throw new Error(`cannot parse ${file}`);
const checker = program.getTypeChecker();
const lineOf = pos => sf.getLineAndCharacterOfPosition(pos).line + 1;

let boot = null;
const visitTop = node => {
  if (ts.isFunctionDeclaration(node) && node.name?.text === bootName) boot = node;
  ts.forEachChild(node, visitTop);
};
visitTop(sf);
if (!boot) throw new Error(`boot function not found: ${bootName}`);
const bootStart = boot.getStart(sf), bootEnd = boot.getEnd();

const candidates = [];
const visit = node => {
  let name = null, fn = null;
  if (ts.isFunctionDeclaration(node) && node.name) { name = node.name.text; fn = node; }
  else if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer &&
           (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))) {
    name = node.name.text; fn = node.initializer;
  }
  if (name && fn && fn !== boot) {
    const start = fn.getStart(sf), end = fn.getEnd();
    const lines = lineOf(end) - lineOf(start) + 1;
    if (lines >= minLines) candidates.push({ name, node: fn, start, end, lines });
  }
  ts.forEachChild(node, visit);
};
visit(boot);

function isDeclarationName(node) {
  const p = node.parent;
  if (!p) return false;
  if ((ts.isVariableDeclaration(p) || ts.isParameter(p) || ts.isFunctionDeclaration(p) ||
       ts.isFunctionExpression(p) || ts.isClassDeclaration(p) || ts.isMethodDeclaration(p) ||
       ts.isPropertyDeclaration(p) || ts.isPropertySignature(p) || ts.isBindingElement(p) ||
       ts.isImportSpecifier(p) || ts.isImportClause(p) || ts.isNamespaceImport(p)) && p.name === node) return true;
  if (ts.isPropertyAccessExpression(p) && p.name === node) return true;
  if (ts.isPropertyAssignment(p) && p.name === node) return true;
  if (ts.isLabeledStatement(p) && p.label === node) return true;
  return false;
}
function isTypeOnly(node) {
  let p = node.parent;
  while (p && p !== sf) {
    if (ts.isTypeNode(p) || ts.isInterfaceDeclaration(p) || ts.isTypeAliasDeclaration(p)) return true;
    if (ts.isExpression(p)) break;
    p = p.parent;
  }
  return false;
}
function writeTarget(node) {
  const p = node.parent;
  if (!p) return false;
  if (ts.isBinaryExpression(p) && p.left === node && p.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && p.operatorToken.kind <= ts.SyntaxKind.LastAssignment) return true;
  if ((ts.isPrefixUnaryExpression(p) || ts.isPostfixUnaryExpression(p)) && (p.operator === ts.SyntaxKind.PlusPlusToken || p.operator === ts.SyntaxKind.MinusMinusToken)) return true;
  if ((ts.isForInStatement(p) || ts.isForOfStatement(p)) && p.initializer === node) return true;
  return false;
}
function analyze(fn) {
  const free = new Map(), external = new Map(), writes = new Set();
  const seen = new Set();
  const walk = node => {
    if (ts.isIdentifier(node) && !isDeclarationName(node) && !isTypeOnly(node)) {
      const sym = checker.getSymbolAtLocation(node);
      if (sym) {
        const decls = sym.declarations ?? [];
        const inside = decls.some(d => {
          const s = d.getStart(sf), e = d.getEnd();
          return s >= fn.getStart(sf) && e <= fn.getEnd();
        });
        if (!inside) {
          const inBoot = decls.some(d => {
            const s = d.getStart(sf), e = d.getEnd();
            return s >= bootStart && e <= bootEnd;
          });
          const bucket = inBoot ? free : external;
          if (!seen.has(sym)) { bucket.set(sym, sym.name); seen.add(sym); }
          if (writeTarget(node)) writes.add(sym.name);
        }
      }
    }
    ts.forEachChild(node, walk);
  };
  walk(fn);
  return {
    free: [...free.values()].sort(),
    external: [...external.values()].sort(),
    writes: [...writes].sort(),
  };
}

const functions = candidates.map(c => {
  const a = analyze(c.node);
  return { name: c.name, line: lineOf(c.start), endLine: lineOf(c.end), lines: c.lines, freeCount: a.free.length, free: a.free, externalCount: a.external.length, writes: a.writes };
});
functions.sort((a, b) => a.freeCount - b.freeCount || b.lines - a.lines);
const result = {
  file: path.relative(repoRoot, file),
  boot: bootName,
  bootLine: lineOf(boot.getStart(sf)),
  bootLines: lineOf(boot.getEnd()) - lineOf(boot.getStart(sf)) + 1,
  minLines,
  totalCandidates: functions.length,
  lowCoupling: functions.filter(f => f.freeCount <= 2).slice(0, 60),
  functions,
};
const json = JSON.stringify(result, null, 2);
if (outFile) { fs.mkdirSync(path.dirname(path.resolve(outFile)), { recursive: true }); fs.writeFileSync(outFile, json + '\n'); console.log(`wrote ${outFile}`); }
else console.log(json);
