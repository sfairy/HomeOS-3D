/**
 * studio-app.ts 抽取器（Phase A：安全外提）。
 *
 * 原理：用 TS 编译器求出「可搬迁闭包」——不引用任何模块级 let 的顶层单元。
 * 该集合对「引用」闭合，因此种子按引用做闭包扩张后，得到的批次
 * 「无需回引 studio-app.ts」，天然不会产生循环依赖。
 *
 * 用法：
 *   bun extract-module.mjs --out studio-xxx.ts --seeds a,b,c [--dry]
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const ROOT = path.resolve(import.meta.dir, "../..");
const ts = require(path.join(ROOT, "node_modules/typescript"));

const STUDIO_DIR = path.join(ROOT, "homeos-3d/frontend/src/app/3d-studio/studio");
const APP = path.join(STUDIO_DIR, "studio-app.ts");

const args = process.argv.slice(2);
const arg = (k, d) => {
  const i = args.indexOf(k);
  return i >= 0 ? args[i + 1] : d;
};
const OUT = arg("--out");
const SEEDS = (arg("--seeds", "") || "").split(",").map(s => s.trim()).filter(Boolean);
const DRY = args.includes("--dry");

const src = fs.readFileSync(APP, "utf8");
const sf = ts.createSourceFile(APP, src, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
const lines = src.split("\n");
const lineOf = pos => sf.getLineAndCharacterOfPosition(pos).line + 1;

/* ---------- 1. import 绑定表 ---------- */
const importOf = new Map();
let lastImportLine = 0;
for (const st of sf.statements) {
  if (!ts.isImportDeclaration(st)) continue;
  lastImportLine = Math.max(lastImportLine, lineOf(st.getEnd()));
  const cl = st.importClause;
  if (!cl) continue;
  const m = st.moduleSpecifier.getText(sf);
  const nsImport = cl.namedBindings && ts.isNamespaceImport(cl.namedBindings);
  if (cl.name) importOf.set(cl.name.text, { src: m, ns: false, spec: cl.name.text, text: st.getText(sf) });
  if (cl.namedBindings) {
    if (ts.isNamedImports(cl.namedBindings))
      for (const e of cl.namedBindings.elements)
        importOf.set(e.name.text, { src: m, ns: false, spec: e.propertyName ? `${e.propertyName.text} as ${e.name.text}` : e.name.text, text: st.getText(sf) });
    else importOf.set(cl.namedBindings.name.text, { src: m, ns: true, spec: cl.namedBindings.name.text, text: st.getText(sf) });
  }
}

/* ---------- 2. 顶层单元 ---------- */
const moduleNames = new Set();
const unitByName = new Map();
for (const st of sf.statements) {
  if (ts.isImportDeclaration(st)) continue;
  if (ts.isFunctionDeclaration(st) && st.name) {
    moduleNames.add(st.name.text);
    unitByName.set(st.name.text, { kind: "function", node: st, stmt: st });
  } else if (ts.isClassDeclaration(st) && st.name) {
    moduleNames.add(st.name.text);
    unitByName.set(st.name.text, { kind: "class", node: st, stmt: st });
  } else if (ts.isVariableStatement(st)) {
    const isLet = !!(st.declarationList.flags & ts.NodeFlags.Let);
    for (const d of st.declarationList.declarations) {
      const bound = new Set();
      collectBinding(d.name, bound);
      // 模式绑定（解构）等：整条语句是原子单位，任一名字被搬迁则同语句全部绑定随之搬迁。
      const pattern = !ts.isIdentifier(d.name);
      for (const nm of bound) {
        moduleNames.add(nm);
        unitByName.set(nm, { kind: isLet ? "let" : "const", node: st, stmt: st, pattern });
      }
    }
  }
}

/* ---------- 3. 自由标识符（精确版） ---------- */
const GLOBALS = new Set([
  "window","document","Math","JSON","Object","Array","Number","String","Boolean","Map","Set","Promise",
  "Error","console","requestAnimationFrame","cancelAnimationFrame","setTimeout","clearTimeout",
  "requestIdleCallback","customElements","Node","Element","HTMLElement","HTMLCanvasElement","Image",
  "ImageData","Blob","URL","URLSearchParams","TextEncoder","TextDecoder","performance","structuredClone",
  "WeakMap","WeakSet","Symbol","RegExp","Date","Intl","globalThis","navigator","location","history",
  "localStorage","fetch","queueMicrotask","parseInt","parseFloat","isNaN","isFinite","encodeURIComponent",
  "decodeURIComponent","undefined","NaN","Infinity","AbortController","DOMParser","FileReader","FormData",
  "Headers","Request","Response","Audio","Uint8Array","Uint8ClampedArray","Float32Array","Int32Array",
  "ArrayBuffer","SharedArrayBuffer","DataView","WebGL2RenderingContext","CSS","MutationObserver",
  "ResizeObserver","IntersectionObserver","indexedDB","crypto","getComputedStyle","matchMedia",
  "devicePixelRatio","Event","CustomEvent","PointerEvent","MouseEvent","KeyboardEvent","WheelEvent",
  "DragEvent","HTMLInputElement","HTMLSelectElement","HTMLDialogElement","HTMLButtonElement",
  "DocumentFragment","EventTarget","CanvasRenderingContext2D","WebGLRenderingContext",
  "OffscreenCanvas","createImageBitmap","atob","btoa","Proxy","Reflect","queueMicrotask",
  "Uint16Array","Uint32Array","Float64Array","Int8Array","Int16Array","BigInt64Array","BigUint64Array",
]);
function collectBinding(name, out) {
  if (ts.isIdentifier(name)) out.add(name.text);
  else if (ts.isObjectBindingPattern(name) || ts.isArrayBindingPattern(name))
    for (const el of name.elements) if (ts.isBindingElement(el)) collectBinding(el.name, out);
}
/** 该标识符只是「名字位」而非「取值位」吗？ */
function isNamePosition(n) {
  const p = n.parent;
  if (ts.isPropertyAccessExpression(p) && p.name === n) return true;
  if (ts.isQualifiedName(p) && p.right === n) return true;
  if (ts.isPropertyAssignment(p) && p.name === n && !ts.isComputedPropertyName(p.name)) return true;
  if (ts.isBindingElement(p) && p.propertyName === n) return true;
  if (ts.isPropertySignature(p) && p.name === n) return true;
  if (ts.isMethodSignature(p) && p.name === n) return true;
  if (ts.isMethodDeclaration(p) && p.name === n) return true;
  if (ts.isPropertyDeclaration(p) && p.name === n) return true;
  if (ts.isEnumMember(p) && p.name === n) return true;
  if (ts.isImportSpecifier(p) && (p.propertyName === n || p.name === n)) return true;
  if (ts.isExportSpecifier(p) && (p.propertyName === n || p.name === n)) return true;
  if (ts.isLabeledStatement(p) || (ts.isBreakStatement(p) && p.label === n) || (ts.isContinueStatement(p) && p.label === n)) return true;
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

/* ---------- 4. 可搬迁闭包 ---------- */
const refsOf = new Map();
for (const [name, u] of unitByName)
  refsOf.set(name, [...freeIds(u.stmt)].filter(x => moduleNames.has(x) && x !== name));

/* 原子组：同一条「模式绑定」语句里的全部名字必须同进同出 */
const groupOf = new Map();
for (const [nm, u] of unitByName) {
  if (groupOf.has(nm)) continue;
  const g = new Set([nm]);
  if (u.pattern) for (const [other, ou] of unitByName) if (ou.stmt === u.stmt) g.add(other);
  for (const x of g) groupOf.set(x, g);
}
// v2：state 已外部化，所有非 let 单元均可参与搬迁；边界由「依赖闭包」决定。
const movable = new Set([...unitByName.keys()].filter(n => unitByName.get(n).kind !== "let"));
const badSeeds = SEEDS.filter(s => !movable.has(s));
if (badSeeds.length) console.log("  ⚠ 剔除不可搬 seed:", badSeeds.map(s => `${s}(${unitByName.get(s)?.kind ?? "?"})`).join(", "));
const seeds = SEEDS.filter(s => movable.has(s));
if (!seeds.length) { console.error("✗ 没有可用 seed"); process.exit(1); }

/* ---------- 5. 闭包扩张 ---------- */
const batch = new Set();
const queue = [...seeds];
while (queue.length) {
  const n = queue.pop();
  if (batch.has(n)) continue;
  for (const m of groupOf.get(n)) batch.add(m);
  for (const r of refsOf.get(n)) if (movable.has(r)) queue.push(r);
}
const external = new Set();
for (const n of batch) for (const r of refsOf.get(n)) if (!batch.has(r) && moduleNames.has(r)) external.add(`${n} → ${r}`);
if (external.size) { console.error("✗ 批次未闭合:", [...external].join(", ")); process.exit(1); }

const span = u => ({ s: lineOf(u.node.getStart(sf)), e: lineOf(u.node.getEnd()), lines: lineOf(u.node.getEnd()) - lineOf(u.node.getStart(sf)) + 1 });
const docStart = u => { let s = span(u).s, k = s - 2; while (k >= 0 && /^\s*(\*|\/\*\*|\*\/)/.test(lines[k])) { s = k + 1; k--; } return s; };
const totalLines = [...batch].reduce((a, n) => a + span(unitByName.get(n)).lines, 0);

// 副作用哨兵：初值里出现这些调用，说明该 const 求值有外部效应，移动会改变求值时机
const SIDE_EFFECT = /addEventListener|removeEventListener|loadTiming|appendChild|createElementNS|initializeStudio|requestAnimationFrame|setInterval|setTimeout|fetch\(|indexedDB/;
const risky = [...batch].filter(n => {
  const u = unitByName.get(n);
  if (u.kind !== "const") return false;
  return SIDE_EFFECT.test(u.stmt.getText(sf));
});
if (risky.length) console.log("  ⚠ 初值可能含副作用的 const:", risky.join(", "));

console.log(`批次: ${batch.size} 个单元 / ${totalLines} 行`);
console.log(`  函数 ${[...batch].filter(n => unitByName.get(n).kind === "function").length} | 常量 ${[...batch].filter(n => unitByName.get(n).kind === "const").length}`);
const extras = [...batch].filter(n => !seeds.includes(n));
if (extras.length) {
  console.log("  闭包并入:");
  for (const n of extras) console.log(`    + ${span(unitByName.get(n)).lines} 行 ${n}`);
}

/* ---------- 6. 新模块 import ---------- */
const needed = new Map();
const unknown = [];
for (const n of batch) for (const id of freeIds(unitByName.get(n).stmt)) {
  if (moduleNames.has(id) || GLOBALS.has(id)) continue;
  const info = importOf.get(id);
  if (info) needed.set(id, info); else unknown.push(`${id}←${n}`);
}
if (unknown.length) console.log("  ⚠ 未识别自由名:", unknown.join(", "));
const bySrc = new Map();
for (const [name, info] of needed) {
  if (!bySrc.has(info.src)) bySrc.set(info.src, { ns: new Set(), named: new Set() });
  const g = bySrc.get(info.src);
  if (info.ns) g.ns.add(info.spec); else g.named.add(info.spec);
}
let importBlock = "";
for (const [m, g] of bySrc) {
  for (const ns of [...g.ns].sort()) importBlock += `import * as ${ns} from ${m};\n`;
  const named = [...g.named].sort();
  if (named.length === 1) importBlock += `import { ${named[0]} } from ${m};\n`;
  else if (named.length > 1) importBlock += `import {\n${named.map(x => "  " + x).join(",\n")}\n} from ${m};\n`;
}
console.log(`  新模块 import: ${needed.size} 名 / ${bySrc.size} 源`);

/* ---------- 7. 生成本模块正文 ---------- */
const chunks = [];
const emittedStmts = new Set();
// 关键：按原始源码行号输出，保持声明顺序与原文件一致（避免 const 的 TDZ）
for (const n of [...batch].sort((a, b) => docStart(unitByName.get(a)) - docStart(unitByName.get(b)))) {
  const u = unitByName.get(n);
  if (emittedStmts.has(u.stmt)) continue; // 模式绑定：一条语句产出一个 chunk
  emittedStmts.add(u.stmt);
  const s = docStart(u), e = span(u).e;
  const text = lines.slice(s - 1, e).join("\n");
  // export 必须插在「声明关键字」所在行首，不能插在 JSDoc 之前
  const chunkLines = text.split("\n");
  let inserted = false;
  for (let i = 0; i < chunkLines.length; i++) {
    if (/^\s*(async\s+)?function\s|^\s*const\s|^\s*let\s|^\s*class\s|^\s*function\s/.test(chunkLines[i])) {
      chunkLines[i] = chunkLines[i].replace(/^(\s*)/, "$1export ");
      inserted = true;
      break;
    }
  }
  if (!inserted) { console.error(`✗ 未找到声明关键字: ${n}`); process.exit(1); }
  chunks.push(chunkLines.join("\n"));
}
const header = `/**\n * 自 studio-app.ts 外提的独立单元（Phase A：安全外提）。\n * 对本模块之外的 studio-app.ts 内部零依赖：只引用 import 与自身成员，故不存在循环引用。\n */\n`;
const newModule = header + (importBlock ? importBlock + "\n" : "") + chunks.join("\n\n") + "\n";

if (DRY) {
  console.log("\n--dry 未写盘。成员：");
  for (const n of [...batch].sort()) console.log(`  ${String(span(unitByName.get(n)).lines).padStart(5)} 行  ${n}`);
  process.exit(0);
}

/* ---------- 8. 落盘 ---------- */
const outName = path.basename(OUT);
fs.writeFileSync(path.join(STUDIO_DIR, outName), newModule);

const ranges = [];
const seen = new Set();
for (const n of batch) {
  const u = unitByName.get(n);
  if (seen.has(u.stmt)) continue;
  seen.add(u.stmt);
  ranges.push({ s: docStart(u), e: span(u).e });
}
ranges.sort((a, b) => b.s - a.s);
const remove = new Set();
for (const r of ranges) for (let i = r.s; i <= r.e; i++) remove.add(i);
const kept = lines.filter((_, i) => !remove.has(i + 1));

const names = [...batch].sort();
const rel = `./${outName.replace(/\.ts$/, ".js")}`;
const imp = names.length === 1
  ? `import { ${names[0]} } from ${JSON.stringify(rel)};`
  : `import {\n${names.map(n => "  " + n).join(",\n")}\n} from ${JSON.stringify(rel)};`;
kept.splice(lastImportLine, 0, imp);

fs.writeFileSync(APP, kept.join("\n"));
console.log(`\n✓ ${outName}: ${newModule.split("\n").length} 行`);
console.log(`✓ studio-app.ts: -${remove.size} 行 → ${kept.length} 行（新增 ${names.length} 项 import）`);
