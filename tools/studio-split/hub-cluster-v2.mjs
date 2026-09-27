/**
 * 枢纽子簇分析 v2。
 *
 * 输入：createStageController 内的种子局部函数。
 * 输出：该子簇的
 *   - 局部闭包（owns 的 let / function）
 *   - 对外接口（被簇外局部引用的成员）——决定工厂返回什么
 *   - 入参依赖（引用了簇外的哪些局部）——决定工厂接收什么
 *   - 模块级依赖单元数（能否被「依赖闭包」安全外提）
 * 并检测多个子簇之间的成员重叠。
 */
import fs from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const ROOT = path.resolve(import.meta.dir, "../..");
const ts = require(ROOT + "/node_modules/typescript");
const FILE = ROOT + "/homeos-3d/frontend/src/app/3d-studio/studio/studio-app.ts";
const sf = ts.createSourceFile(FILE, fs.readFileSync(FILE, "utf8"), ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
const lineOf = p => sf.getLineAndCharacterOfPosition(p).line + 1;

const HOST = process.argv[2] || "createStageController";
let target = null;
for (const st of sf.statements) if (ts.isFunctionDeclaration(st) && st.name && st.name.text === HOST) target = st;
if (!target) { console.error("宿主未找到:", HOST); process.exit(1); }
const body = target.body;

/* 模块级单元（含模式绑定） */
const moduleNames = new Set(), moduleUnits = new Map();
function col(name, out) {
  if (ts.isIdentifier(name)) out.add(name.text);
  else if (ts.isObjectBindingPattern(name) || ts.isArrayBindingPattern(name))
    for (const el of name.elements) if (ts.isBindingElement(el)) col(el.name, out);
}
for (const st of sf.statements) {
  if (ts.isImportDeclaration(st)) continue;
  if ((ts.isFunctionDeclaration(st) || ts.isClassDeclaration(st)) && st.name) {
    moduleNames.add(st.name.text); moduleUnits.set(st.name.text, st);
  } else if (ts.isVariableStatement(st)) {
    const isLet = !!(st.declarationList.flags & ts.NodeFlags.Let);
    for (const d of st.declarationList.declarations) {
      const b = new Set(); col(d.name, b);
      for (const nm of b) { moduleNames.add(nm); moduleUnits.set(nm, st); if (isLet) moduleUnits.letNames = null; }
    }
  }
}

/* 局部单元 */
const locals = new Map();      // name -> node
const localKind = new Map();   // name -> function|let|const
for (const st of body.statements) {
  if (ts.isFunctionDeclaration(st) && st.name) { locals.set(st.name.text, st); localKind.set(st.name.text, "function"); }
  else if (ts.isVariableStatement(st)) {
    const isLet = !!(st.declarationList.flags & ts.NodeFlags.Let);
    for (const d of st.declarationList.declarations) {
      const b = new Set(); col(d.name, b);
      for (const nm of b) { locals.set(nm, st); localKind.set(nm, isLet ? "let" : "const"); }
    }
  }
}
const localNames = new Set(locals.keys());

const GLOBALS = new Set(["window","document","Math","JSON","Object","Array","Number","String","Boolean","Map","Set","Promise","Error","console","requestAnimationFrame","cancelAnimationFrame","setTimeout","clearTimeout","requestIdleCallback","customElements","Node","Element","HTMLElement","HTMLCanvasElement","Image","ImageData","Blob","URL","URLSearchParams","TextEncoder","TextDecoder","performance","structuredClone","WeakMap","WeakSet","Symbol","RegExp","Date","Intl","globalThis","navigator","location","history","localStorage","fetch","queueMicrotask","parseInt","parseFloat","isNaN","isFinite","encodeURIComponent","decodeURIComponent","undefined","NaN","Infinity","AbortController","DOMParser","FileReader","FormData","Headers","Request","Response","Audio","Uint8Array","Uint8ClampedArray","Uint16Array","Uint32Array","Float32Array","Int32Array","ArrayBuffer","SharedArrayBuffer","DataView","WebGL2RenderingContext","CSS","MutationObserver","ResizeObserver","IntersectionObserver","indexedDB","crypto","getComputedStyle","matchMedia","devicePixelRatio","Event","CustomEvent","PointerEvent","MouseEvent","KeyboardEvent","WheelEvent","DragEvent","HTMLInputElement","HTMLSelectElement","HTMLDialogElement","HTMLButtonElement","DocumentFragment","EventTarget","CanvasRenderingContext2D","WebGLRenderingContext","OffscreenCanvas","createImageBitmap","atob","btoa","Proxy","Reflect"]);

function isNamePosition(n) {
  const p = n.parent;
  if (ts.isPropertyAccessExpression(p) && p.name === n) return true;
  if (ts.isQualifiedName(p) && p.right === n) return true;
  if (ts.isPropertyAssignment(p) && p.name === n && !ts.isComputedPropertyName(p.name)) return true;
  if (ts.isBindingElement(p) && p.propertyName === n) return true;
  if (ts.isMethodDeclaration(p) && p.name === n) return true;
  if (ts.isPropertyDeclaration(p) && p.name === n) return true;
  if (ts.isPropertySignature(p) && p.name === n) return true;
  if (ts.isEnumMember(p) && p.name === n) return true;
  if (ts.isImportSpecifier(p)) return true;
  if (ts.isExportSpecifier(p)) return true;
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

const refsOf = new Map();
for (const [n, node] of locals) refsOf.set(n, new Set([...freeIds(node)].filter(x => localNames.has(x) && x !== n)));

/* 每个局部名被哪些「其他局部」引用 */
const usersOf = new Map();
for (const n of localNames) usersOf.set(n, new Set());
for (const [n, rs] of refsOf) for (const r of rs) usersOf.get(r).add(n);

function analyze(seeds) {
  const cluster = new Set(), q = [...seeds];
  while (q.length) { const n = q.pop(); if (cluster.has(n)) continue; cluster.add(n); for (const r of refsOf.get(n)) q.push(r); }
  const inbound = new Map();   // 簇成员 <- 簇外局部
  for (const n of cluster) {
    const outside = [...usersOf.get(n)].filter(u => !cluster.has(u));
    if (outside.length) inbound.set(n, outside);
  }
  const outbound = new Set();  // 簇 -> 簇外局部（理论上空）
  for (const n of cluster) for (const r of refsOf.get(n)) if (!cluster.has(r)) outbound.add(`${n}→${r}`);
  /* 模块级依赖闭包 */
  const mrefs = new Map();
  for (const n of cluster) mrefs.set(n, [...freeIds(locals.get(n))].filter(x => moduleNames.has(x) && x !== n));
  const mseen = new Set(), mq = [];
  for (const rs of mrefs.values()) for (const r of rs) mq.push(r);
  while (mq.length) { const n = mq.pop(); if (mseen.has(n) || !moduleUnits.has(n)) continue; mseen.add(n); for (const r of freeIds(moduleUnits.get(n))) if (moduleNames.has(r) && !mseen.has(r)) mq.push(r); }
  let mLines = 0, mStmts = new Set();
  for (const n of mseen) { if (mStmts.has(moduleUnits.get(n))) continue; mStmts.add(moduleUnits.get(n)); }
  for (const s of mStmts) mLines += lineOf(s.getEnd()) - lineOf(s.getStart(sf)) + 1;
  let lLines = 0;
  const lstmts = new Set();
  for (const n of cluster) lstmts.add(locals.get(n));
  for (const s of lstmts) lLines += lineOf(s.getEnd()) - lineOf(s.getStart(sf)) + 1;
  const unresolved = [];
  for (const n of cluster) for (const id of freeIds(locals.get(n))) if (!localNames.has(id) && !moduleNames.has(id) && !GLOBALS.has(id)) unresolved.push(`${id}←${n}`);
  return { cluster, inbound, outbound, mseen, mLines, lLines, lstmts, unresolved };
}

const GROUPS = JSON.parse(fs.readFileSync("/tmp/hub-groups.json", "utf8"));
const results = new Map();
for (const [label, seeds] of Object.entries(GROUPS)) {
  const valid = seeds.filter(s => locals.has(s));
  if (!valid.length) { console.log(`\n### ${label}: 种子已移出`); continue; }
  const r = analyze(valid);
  results.set(label, r);
  const lets = [...r.cluster].filter(n => localKind.get(n) === "let");
  const fns = [...r.cluster].filter(n => localKind.get(n) === "function");
  const cst = [...r.cluster].filter(n => localKind.get(n) === "const");
  console.log(`\n### ${label} — 局部闭包 ${r.lstmts.size} 条声明 / ${r.lLines} 行  (let ${lets.length} / function ${fns.length} / const ${cst.length})`);
  console.log(`  模块级依赖闭包: ${r.mseen.size} 单元 / ${r.mLines} 行`);
  if (r.unresolved.length) console.log(`  ⚠ 未解析: ${[...new Set(r.unresolved)].join(", ")}`);
  if (r.outbound.size) console.log(`  ⚠ 出边未闭合: ${[...r.outbound].join(", ")}`);
  console.log(`  对外接口（簇外局部引用它） ${r.inbound.size} 个:`);
  for (const [n, us] of [...r.inbound].sort((a, b) => b[1].length - a[1].length))
    console.log(`     ${localKind.get(n).padEnd(8)} ${n}  ← ${us.size} 处 (${us.slice(0, 5).join(", ")}${us.length > 5 ? " …" : ""})`);
}

/* 重叠检测 */
const labels = [...results.keys()];
console.log("\n=== 子簇重叠矩阵 ===");
for (let i = 0; i < labels.length; i++) for (let j = i + 1; j < labels.length; j++) {
  const a = results.get(labels[i]).cluster, b = results.get(labels[j]).cluster;
  const inter = [...a].filter(x => b.has(x));
  if (inter.length) console.log(`  ${labels[i]} ∩ ${labels[j]} = ${inter.length}: ${inter.join(", ")}`);
}
