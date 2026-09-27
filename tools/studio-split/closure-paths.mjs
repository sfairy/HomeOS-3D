/** 计算模块级依赖闭包中每个单元的「引入路径」，定位真正的入口。 */
import fs from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const ROOT = path.resolve(import.meta.dir, "../..");
const ts = require(ROOT + "/node_modules/typescript");
const FILE = ROOT + "/homeos-3d/frontend/src/app/3d-studio/studio/studio-app.ts";
const sf = ts.createSourceFile(FILE, fs.readFileSync(FILE, "utf8"), ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
const lineOf = p => sf.getLineAndCharacterOfPosition(p).line + 1;

const moduleNames = new Set(), moduleOfName = new Map();
function col(name, out) {
  if (ts.isIdentifier(name)) out.add(name.text);
  else if (ts.isObjectBindingPattern(name) || ts.isArrayBindingPattern(name))
    for (const el of name.elements) if (ts.isBindingElement(el)) col(el.name, out);
}
const importNames = new Set();
for (const st of sf.statements) {
  if (ts.isImportDeclaration(st)) {
    const cl = st.importClause; if (!cl) continue;
    if (cl.name) importNames.add(cl.name.text);
    if (cl.namedBindings) {
      if (ts.isNamedImports(cl.namedBindings)) for (const e of cl.namedBindings.elements) importNames.add(e.name.text);
      else importNames.add(cl.namedBindings.name.text);
    }
    continue;
  }
  if ((ts.isFunctionDeclaration(st) || ts.isClassDeclaration(st)) && st.name) { moduleNames.add(st.name.text); moduleOfName.set(st.name.text, st); }
  else if (ts.isVariableStatement(st)) for (const d of st.declarationList.declarations) {
    const b = new Set(); col(d.name, b);
    for (const nm of b) { moduleNames.add(nm); moduleOfName.set(nm, st); }
  }
}
function collectDeclared(node) {
  const declared = new Set();
  (function d(n) {
    if (ts.isFunctionDeclaration(n) && n.name) declared.add(n.name.text);
    if (ts.isFunctionExpression(n) && n.name) declared.add(n.name.text);
    if (ts.isVariableDeclaration(n)) col(n.name, declared);
    if (ts.isParameter(n)) col(n.name, declared);
    if (ts.isCatchClause(n) && n.variableDeclaration) col(n.variableDeclaration.name, declared);
    ts.forEachChild(n, d);
  })(node);
  return declared;
}
function freeIds(node) {
  const declared = collectDeclared(node);
  const out = new Set();
  (function w(n, top) {
    if (ts.isIdentifier(n) && !top && !declared.has(n.text)) {
      const p = n.parent;
      const isProp = (ts.isPropertyAccessExpression(p) && p.name === n) || (ts.isPropertyAssignment(p) && p.name === n && !ts.isComputedPropertyName(p.name)) || (ts.isQualifiedName(p) && p.right === n) || (ts.isBindingElement(p) && p.propertyName === n) || ts.isImportSpecifier(p) || (ts.isMethodDeclaration(p) && p.name === n);
      if (!isProp) out.add(n.text);
    }
    ts.forEachChild(n, c => w(c, false));
  })(node, true);
  return out;
}

/* 宿主局部 */
const HOST = "createStageController";
let host = null;
for (const st of sf.statements) if (ts.isFunctionDeclaration(st) && st.name && st.name.text === HOST) host = st;
const hostStmts = host.body.statements;
const stmtOfName = new Map(), localNames = new Set();
for (const st of hostStmts) {
  if (ts.isFunctionDeclaration(st) && st.name) { stmtOfName.set(st.name.text, st); localNames.add(st.name.text); }
  else if (ts.isVariableStatement(st)) for (const d of st.declarationList.declarations) {
    const b = new Set(); col(d.name, b);
    for (const nm of b) { stmtOfName.set(nm, st); localNames.add(nm); }
  }
}
const freeOfStmt = new Map();
for (const st of hostStmts) freeOfStmt.set(st, [...freeIds(st)].filter(x => localNames.has(x)));
const refsOf = new Map();
for (const [n, st] of stmtOfName) refsOf.set(n, new Set(freeOfStmt.get(st).filter(x => x !== n)));

const GROUPS = JSON.parse(fs.readFileSync("/tmp/hub-groups.json", "utf8"));
const label = process.argv[2];
const seeds = GROUPS[label].filter(s => localNames.has(s));
const cluster = new Set(), q = [...seeds];
while (q.length) { const n = q.pop(); if (cluster.has(n)) continue; cluster.add(n); for (const r of refsOf.get(n)) q.push(r); }
const clusterStmts = new Set([...cluster].map(n => stmtOfName.get(n)));

/* BFS 记录 parent，找出路径 */
const parent = new Map();
const queue = [];
for (const st of clusterStmts) for (const id of freeIds(st)) if (moduleNames.has(id)) { if (!parent.has(id)) { parent.set(id, `簇:L${lineOf(st.getStart(sf))}`); queue.push(id); } }
while (queue.length) {
  const n = queue.shift();
  const st = moduleOfName.get(n); if (!st) continue;
  for (const r of freeIds(st)) if (moduleNames.has(r) && !parent.has(r)) { parent.set(r, n); queue.push(r); }
}
const span = st => lineOf(st.getEnd()) - lineOf(st.getStart(sf)) + 1;
const rows = [...parent.entries()].map(([n, p]) => ({ n, p, lines: span(moduleOfName.get(n)), l: lineOf(moduleOfName.get(n).getStart(sf)) })).sort((a, b) => b.lines - a.lines);
console.log(`### ${label} 模块级依赖闭包: ${rows.length} 单元 / ${rows.reduce((a, r) => a + r.lines, 0)} 行`);
console.log("\n-- 入口（由簇直接引用） --");
for (const r of rows.filter(r => String(r.p).startsWith("簇:"))) console.log(`  ${String(r.lines).padStart(4)} 行  L${r.l}  ${r.n}   ← ${r.p}`);
console.log("\n-- 全部按行数 --");
for (const r of rows) console.log(`  ${String(r.lines).padStart(4)} 行  L${String(r.l).padStart(6)}  ${r.n.padEnd(38)} ← ${r.p}`);
