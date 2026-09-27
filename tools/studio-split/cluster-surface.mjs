/**
 * 把宿主函数的每条顶层语句视为一个「站位」：
 * 对每个簇成员，找出哪些站位引用它；引用它的站位若不属于簇，即是「对外接口」。
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const ROOT = path.resolve(import.meta.dir, "../..");
const ts = require(ROOT + "/node_modules/typescript");
const FILE = ROOT + "/homeos-3d/frontend/src/app/3d-studio/studio/studio-app.ts";
const sf = ts.createSourceFile(FILE, fs.readFileSync(FILE, "utf8"), ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
const lineOf = p => sf.getLineAndCharacterOfPosition(p).line + 1;

const HOST = "createStageController";
let target = null;
for (const st of sf.statements) if (ts.isFunctionDeclaration(st) && st.name && st.name.text === HOST) target = st;
const body = target.body;

function col(name, out) {
  if (ts.isIdentifier(name)) out.add(name.text);
  else if (ts.isObjectBindingPattern(name) || ts.isArrayBindingPattern(name))
    for (const el of name.elements) if (ts.isBindingElement(el)) col(el.name, out);
}
function isNamePosition(n) {
  const p = n.parent;
  if (ts.isPropertyAccessExpression(p) && p.name === n) return true;
  if (ts.isQualifiedName(p) && p.right === n) return true;
  if (ts.isPropertyAssignment(p) && p.name === n && !ts.isComputedPropertyName(p.name)) return true;
  if (ts.isBindingElement(p) && p.propertyName === n) return true;
  if (ts.isMethodDeclaration(p) && p.name === n) return true;
  if (ts.isPropertyDeclaration(p) && p.name === n) return true;
  if (ts.isLabeledStatement(p)) return true;
  return false;
}
function freeIds(node) {
  const declared = new Set();
  (function d(n) {
    if (ts.isFunctionDeclaration(n) && n.name) declared.add(n.name.text);
    if (ts.isFunctionExpression(n) && n.name) declared.add(n.name.text);
    if (ts.isVariableDeclaration(n)) col(n.name, declared);
    if (ts.isParameter(n)) col(n.name, declared);
    if (ts.isCatchClause(n) && n.variableDeclaration) col(n.variableDeclaration.name, declared);
    ts.forEachChild(n, d);
  })(node);
  const out = new Set();
  (function w(n, top) {
    if (ts.isIdentifier(n) && !top && !isNamePosition(n) && !declared.has(n.text)) out.add(n.text);
    ts.forEachChild(n, c => w(c, false));
  })(node, true);
  return out;
}

/* 站位 = body 的每条顶层语句；名字 -> 站位 */
const stmts = body.statements;
const stmtOfName = new Map(), localKind = new Map();
const stmtIdx = new Map();
stmts.forEach((s, i) => stmtIdx.set(s, i));
for (const st of stmts) {
  if (ts.isFunctionDeclaration(st) && st.name) { stmtOfName.set(st.name.text, st); localKind.set(st.name.text, "function"); }
  else if (ts.isVariableStatement(st)) {
    const isLet = !!(st.declarationList.flags & ts.NodeFlags.Let);
    for (const d of st.declarationList.declarations) {
      const b = new Set(); col(d.name, b);
      for (const nm of b) { stmtOfName.set(nm, st); localKind.set(nm, isLet ? "let" : "const"); }
    }
  }
}
const localNames = new Set(stmtOfName.keys());

const freeOfStmt = new Map();
for (const st of stmts) freeOfStmt.set(st, [...freeIds(st)].filter(x => localNames.has(x)));

const GROUPS = JSON.parse(fs.readFileSync("/tmp/hub-groups.json", "utf8"));
const label = process.argv[2] || "灯光过渡";
const seeds = GROUPS[label].filter(s => localNames.has(s));
if (!seeds.length) { console.error("种子缺失"); process.exit(1); }

const refsOf = new Map();
for (const [n, st] of stmtOfName) refsOf.set(n, new Set(freeOfStmt.get(st).filter(x => x !== n)));
const cluster = new Set(), q = [...seeds];
while (q.length) { const n = q.pop(); if (cluster.has(n)) continue; cluster.add(n); for (const r of refsOf.get(n)) q.push(r); }

/* 簇站位 */
const clusterStmts = new Set();
for (const n of cluster) clusterStmts.add(stmtOfName.get(n));
/* 站位 -> 簇内名字 */
const namesInStmt = new Map();
for (const n of cluster) { const st = stmtOfName.get(n); if (!namesInStmt.has(st)) namesInStmt.set(st, []); namesInStmt.get(st).push(n); }

console.log(`### ${label}: 簇 = ${clusterStmts.size} 条顶层语句 / ${cluster.size} 个名`);
let lines = 0;
const ordered = [...clusterStmts].sort((a, b) => a.getStart(sf) - b.getStart(sf));
for (const st of ordered) lines += lineOf(st.getEnd()) - lineOf(st.getStart(sf)) + 1;
console.log(`  行数: ${lines}   源码范围: L${lineOf(ordered[0].getStart(sf))} – L${lineOf(ordered[ordered.length - 1].getEnd())}`);
console.log(`  kind 统计: let ${[...cluster].filter(n => localKind.get(n) === "let").length}, const ${[...cluster].filter(n => localKind.get(n) === "const").length}, function ${[...cluster].filter(n => localKind.get(n) === "function").length}`);

/* 对外接口 */
console.log(`\n### 对外接口（簇外站位引用簇内成员）`);
let any = false;
for (const st of stmts) {
  if (clusterStmts.has(st)) continue;
  const refd = freeOfStmt.get(st).filter(x => cluster.has(x));
  if (!refd.length) continue;
  any = true;
  const kindOfStmt = ts.isFunctionDeclaration(st) && st.name ? `function ${st.name.text}` : "statement";
  console.log(`\n  [簇外] L${lineOf(st.getStart(sf))} ${kindOfStmt} (${lineOf(st.getEnd()) - lineOf(st.getStart(sf)) + 1} 行) 引用:`);
  for (const r of refd) {
    const stmtsUsing = [...namesInStmt.keys()].filter(s => namesInStmt.get(s).includes(r));
    console.log(`     ${localKind.get(r).padEnd(8)} ${r}`);
  }
}
if (!any) console.log("  (无)");

/* 簇内成员是否引用了簇外局部（入参依赖） */
const outbound = new Set();
for (const st of clusterStmts) for (const id of freeOfStmt.get(st)) if (!cluster.has(id)) outbound.add(`${label}内 L${lineOf(st.getStart(sf))} → ${id}`);
console.log(`\n### 入参依赖（簇内引用簇外局部）: ${outbound.size ? [...outbound].join(", ") : "(无) ✅"}`);

/* 簇内成员清单 */
console.log(`\n### 簇内站位`);
for (const st of ordered) {
  const ns = namesInStmt.get(st);
  console.log(`  L${String(lineOf(st.getStart(sf))).padStart(6)}-${String(lineOf(st.getEnd())).padStart(6)}  ${String(lineOf(st.getEnd()) - lineOf(st.getStart(sf)) + 1).padStart(4)} 行  ${ns.join(", ")}`);
}
