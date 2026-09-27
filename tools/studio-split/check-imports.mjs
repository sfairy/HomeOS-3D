/** 校验：批次内单元引用的自由名，是否都能由「import 绑定表」或「批次成员」解析。 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const ROOT = path.resolve(import.meta.dir, "../..");
const ts = require(path.join(ROOT, "node_modules/typescript"));
const APP = path.join(ROOT, "homeos-3d/frontend/src/app/3d-studio/studio/studio-app.ts");
const NAMES = (process.argv[2] || "").split(",").map(s => s.trim()).filter(Boolean);

const sf = ts.createSourceFile(APP, fs.readFileSync(APP, "utf8"), ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
const importNames = new Set();
for (const st of sf.statements) {
  if (!ts.isImportDeclaration(st)) continue;
  const cl = st.importClause; if (!cl) continue;
  if (cl.name) importNames.add(cl.name.text);
  if (cl.namedBindings) {
    if (ts.isNamedImports(cl.namedBindings)) for (const e of cl.namedBindings.elements) importNames.add(e.name.text);
    else importNames.add(cl.namedBindings.name.text);
  }
}
const GLOBALS = new Set(["Uint16Array","Uint32Array","Float64Array","Int8Array","Int16Array","Int32Array","Int8Array","BigInt64Array","BigUint64Array","window","document","Math","JSON","Object","Array","Number","String","Boolean","Map","Set","Promise","Error","console","requestAnimationFrame","cancelAnimationFrame","setTimeout","clearTimeout","requestIdleCallback","customElements","Node","Element","HTMLElement","HTMLCanvasElement","Image","ImageData","Blob","URL","URLSearchParams","TextEncoder","TextDecoder","performance","structuredClone","WeakMap","WeakSet","Symbol","RegExp","Date","Intl","globalThis","navigator","location","history","localStorage","fetch","queueMicrotask","parseInt","parseFloat","isNaN","isFinite","encodeURIComponent","decodeURIComponent","undefined","NaN","Infinity","AbortController","DOMParser","FileReader","FormData","Headers","Request","Response","Audio","Uint8Array","Uint8ClampedArray","Float32Array","ArrayBuffer","SharedArrayBuffer","DataView","WebGL2RenderingContext","CSS","MutationObserver","ResizeObserver","IntersectionObserver","indexedDB","crypto","getComputedStyle","matchMedia","devicePixelRatio","Event","CustomEvent","PointerEvent","MouseEvent","KeyboardEvent","WheelEvent","DragEvent","HTMLInputElement","HTMLSelectElement","HTMLDialogElement","HTMLButtonElement","DocumentFragment","EventTarget","CanvasRenderingContext2D","WebGLRenderingContext","OffscreenCanvas","createImageBitmap","atob","btoa","Proxy","Reflect"]);

function collectBinding(name, out) {
  if (ts.isIdentifier(name)) out.add(name.text);
  else if (ts.isObjectBindingPattern(name) || ts.isArrayBindingPattern(name))
    for (const el of name.elements) if (ts.isBindingElement(el)) collectBinding(el.name, out);
}
function isNamePosition(n) {
  const p = n.parent;
  if (ts.isPropertyAccessExpression(p) && p.name === n) return true;
  if (ts.isQualifiedName(p) && p.right === n) return true;
  if (ts.isPropertyAssignment(p) && p.name === n && !ts.isComputedPropertyName(p.name)) return true;
  if (ts.isBindingElement(p) && p.propertyName === n) return true;
  if (ts.isMethodDeclaration(p) && p.name === n) return true;
  if (ts.isPropertyDeclaration(p) && p.name === n) return true;
  if (ts.isImportSpecifier(p)) return true;
  if (ts.isExportSpecifier(p)) return true;
  if (ts.isLabeledStatement(p)) return true;
  return false;
}
function freeIds(node) {
  const declared = new Set();
  (function decl(n) {
    if (ts.isFunctionDeclaration(n) && n.name) declared.add(n.name.text);
    if (ts.isFunctionExpression(n) && n.name) declared.add(n.name.text);
    if (ts.isVariableDeclaration(n)) collectBinding(n.name, declared);
    if (ts.isParameter(n)) collectBinding(n.name, declared);
    if (ts.isCatchClause(n) && n.variableDeclaration) collectBinding(n.variableDeclaration.name, declared);
    ts.forEachChild(n, decl);
  })(node);
  const out = new Set();
  (function use(n, top) {
    if (ts.isIdentifier(n) && !top && !isNamePosition(n) && !declared.has(n.text)) out.add(n.text);
    ts.forEachChild(n, c => use(c, false));
  })(node, true);
  return out;
}

/* 与抽取器一致的单元图（含模式绑定） */
const moduleNames = new Set(), unitByName = new Map();
for (const st of sf.statements) {
  if (ts.isImportDeclaration(st)) continue;
  if ((ts.isFunctionDeclaration(st) || ts.isClassDeclaration(st)) && st.name) {
    moduleNames.add(st.name.text);
    unitByName.set(st.name.text, { stmt: st });
  } else if (ts.isVariableStatement(st)) {
    for (const d of st.declarationList.declarations) {
      const bound = new Set(); collectBinding(d.name, bound);
      for (const nm of bound) { moduleNames.add(nm); unitByName.set(nm, { stmt: st }); }
    }
  }
}
/* 批次 = NAMES 的引用闭包 */
const refsOf = new Map();
for (const [nm, u] of unitByName) refsOf.set(nm, [...freeIds(u.stmt)].filter(x => moduleNames.has(x) && x !== nm));
const batch = new Set(), q = [...NAMES];
const missingSeed = NAMES.filter(n => !unitByName.has(n));
if (missingSeed.length) console.log("⚠ 种子不存在:", missingSeed.join(", "));
while (q.length) { const n = q.pop(); if (batch.has(n)) continue; batch.add(n); for (const r of refsOf.get(n)) q.push(r); }

const unresolved = new Map();
for (const n of batch) for (const id of freeIds(unitByName.get(n).stmt)) {
  if (moduleNames.has(id) || GLOBALS.has(id) || importNames.has(id)) continue;
  if (!unresolved.has(id)) unresolved.set(id, []);
  unresolved.get(id).push(n);
}
console.log(`批次: ${batch.size} 单元`);
console.log(`未解析自由名: ${unresolved.size}`);
for (const [id, from] of unresolved) console.log(`  ✗ ${id}  ← ${from.slice(0, 4).join(", ")}${from.length > 4 ? ` …(${from.length})` : ""}`);
