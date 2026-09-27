/**
 * 宿主函数内「局部簇」工厂化外提器。
 *
 * 把 createStageController 里一个内聚的局部声明簇（局部 let/const/function），
 * 连同它引用的模块级单元，一起搬进新模块，并包裹成工厂函数：
 *
 *   export function createXxxController(deps) { ...簇...; return {...}; }
 *
 * 约定：
 * - 簇内局部可变状态：经 getter/setter 暴露（簇内代码零改写）
 * - 簇内引用的「簇外局部」：
 *     只读   → deps.x: () => any       簇内改写为 deps.x()
 *     读写   → deps.x: {get,set}       簇内改写为 deps.x.get() / deps.x.set(v)
 * - 模块级依赖：按依赖闭包整体搬迁，保证新模块对 studio-app.ts 零回引（无循环引用）
 * - 簇内语句与外提前同处一层缩进，故不做 dedent
 *
 * 用法：
 *   bun extract-cluster.mjs --host createStageController --out studio-x.ts \
 *     --seeds a,b,c --factory createXxxController --instance xxController \
 *     [--exclude p,q] [--dry]
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
const arg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const OUT = arg("--out");
const HOST = arg("--host");
const SEEDS = (arg("--seeds", "") || "").split(",").map(s => s.trim()).filter(Boolean);
const EXCLUDE = new Set((arg("--exclude", "") || "").split(",").map(s => s.trim()).filter(Boolean));
const FACTORY = arg("--factory");
const DESC = arg("--desc", "自 createStageController 外提的内聚局部簇。");
const INSTANCE = arg("--instance", "controllerInstance");
const AFTER = arg("--after", "");
const DRY = args.includes("--dry");
if (!OUT || !HOST || !SEEDS.length || !FACTORY) { console.error("参数不足"); process.exit(1); }

const src = fs.readFileSync(APP, "utf8");
const sf = ts.createSourceFile(APP, src, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
const lines = src.split("\n");
const lineOf = p => sf.getLineAndCharacterOfPosition(p).line + 1;
const lineStarts = [0];
for (let i = 0; i < src.length; i++) if (src[i] === "\n") lineStarts.push(i + 1);
const offAt = l => lineStarts[l - 1];

const GLOBALS = new Set(["window","document","Math","JSON","Object","Array","Number","String","Boolean","Map","Set","Promise","Error","console","requestAnimationFrame","cancelAnimationFrame","setTimeout","clearTimeout","requestIdleCallback","customElements","Node","Element","HTMLElement","HTMLCanvasElement","Image","ImageData","Blob","URL","URLSearchParams","TextEncoder","TextDecoder","performance","structuredClone","WeakMap","WeakSet","Symbol","RegExp","Date","Intl","globalThis","navigator","location","history","localStorage","fetch","queueMicrotask","parseInt","parseFloat","isNaN","isFinite","encodeURIComponent","decodeURIComponent","undefined","NaN","Infinity","AbortController","DOMParser","FileReader","FormData","Headers","Request","Response","Audio","Uint8Array","Uint8ClampedArray","Uint16Array","Uint32Array","Float32Array","Int32Array","ArrayBuffer","SharedArrayBuffer","DataView","WebGL2RenderingContext","CSS","MutationObserver","ResizeObserver","IntersectionObserver","indexedDB","crypto","getComputedStyle","matchMedia","devicePixelRatio","Event","CustomEvent","PointerEvent","MouseEvent","KeyboardEvent","WheelEvent","DragEvent","HTMLInputElement","HTMLSelectElement","HTMLDialogElement","HTMLButtonElement","DocumentFragment","EventTarget","CanvasRenderingContext2D","WebGLRenderingContext","OffscreenCanvas","createImageBitmap","atob","btoa","Proxy","Reflect"]);

/* ---------- import 绑定 ---------- */
const importOf = new Map();
let lastImportLine = 0;
for (const st of sf.statements) {
  if (!ts.isImportDeclaration(st)) continue;
  lastImportLine = Math.max(lastImportLine, lineOf(st.getEnd()));
  const cl = st.importClause; if (!cl) continue;
  const m = st.moduleSpecifier.getText(sf);
  if (cl.name) importOf.set(cl.name.text, { src: m, ns: false, spec: cl.name.text });
  if (cl.namedBindings) {
    if (ts.isNamedImports(cl.namedBindings))
      for (const e of cl.namedBindings.elements)
        importOf.set(e.name.text, { src: m, ns: false, spec: e.propertyName ? `${e.propertyName.text} as ${e.name.text}` : e.name.text });
    else importOf.set(cl.namedBindings.name.text, { src: m, ns: true, spec: cl.namedBindings.name.text });
  }
}

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
  if (ts.isPropertySignature(p) && p.name === n) return true;
  if (ts.isEnumMember(p) && p.name === n) return true;
  if (ts.isImportSpecifier(p)) return true;
  if (ts.isExportSpecifier(p)) return true;
  if (ts.isLabeledStatement(p)) return true;
  return false;
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
    if (ts.isIdentifier(n) && !top && !isNamePosition(n) && !declared.has(n.text)) out.add(n.text);
    ts.forEachChild(n, c => w(c, false));
  })(node, true);
  return out;
}
function idPositions(node, names) {
  const declared = collectDeclared(node);
  const hits = [];
  (function w(n, top) {
    if (ts.isIdentifier(n) && !top && !isNamePosition(n) && !declared.has(n.text) && names.has(n.text))
      hits.push({ name: n.text, start: n.getStart(sf), end: n.getEnd() });
    ts.forEachChild(n, c => w(c, false));
  })(node, true);
  return hits;
}
const applyEdits = (text, edits) => {
  let out = text;
  for (const e of [...edits].sort((a, b) => b.start - a.start)) out = out.slice(0, e.start) + e.text + out.slice(e.end);
  return out;
};

/* ---------- 模块级单元 ---------- */
const moduleNames = new Set(), moduleOfName = new Map();
for (const st of sf.statements) {
  if (ts.isImportDeclaration(st)) continue;
  if ((ts.isFunctionDeclaration(st) || ts.isClassDeclaration(st)) && st.name) {
    moduleNames.add(st.name.text); moduleOfName.set(st.name.text, st);
  } else if (ts.isVariableStatement(st)) {
    for (const d of st.declarationList.declarations) {
      const b = new Set(); col(d.name, b);
      for (const nm of b) { moduleNames.add(nm); moduleOfName.set(nm, st); }
    }
  }
}

/* ---------- 宿主局部 ---------- */
let host = null;
for (const st of sf.statements) if (ts.isFunctionDeclaration(st) && st.name && st.name.text === HOST) host = st;
if (!host) { console.error("宿主未找到:", HOST); process.exit(1); }
const hostStmts = host.body.statements;
const stmtOfName = new Map(), localKind = new Map(), localNames = new Set();
for (const st of hostStmts) {
  if (ts.isFunctionDeclaration(st) && st.name) { stmtOfName.set(st.name.text, st); localKind.set(st.name.text, "function"); localNames.add(st.name.text); }
  else if (ts.isVariableStatement(st)) {
    const isLet = !!(st.declarationList.flags & ts.NodeFlags.Let);
    for (const d of st.declarationList.declarations) {
      const b = new Set(); col(d.name, b);
      for (const nm of b) { stmtOfName.set(nm, st); localKind.set(nm, isLet ? "let" : "const"); localNames.add(nm); }
    }
  }
}
const freeOfStmt = new Map();
for (const st of hostStmts) freeOfStmt.set(st, [...freeIds(st)].filter(x => localNames.has(x)));

/* ---------- 簇 ---------- */
const refsOf = new Map();
for (const [n, st] of stmtOfName) refsOf.set(n, new Set(freeOfStmt.get(st).filter(x => x !== n)));
const bad = SEEDS.filter(s => !localNames.has(s));
if (bad.length) { console.error("种子缺失:", bad.join(", ")); process.exit(1); }
const cluster = new Set(), q = [...SEEDS];
while (q.length) { const n = q.pop(); if (cluster.has(n)) continue; cluster.add(n); for (const r of refsOf.get(n)) q.push(r); }
const excludedStmts = new Set();
for (const n of [...cluster]) if (EXCLUDE.has(n)) excludedStmts.add(stmtOfName.get(n));
for (const st of excludedStmts) for (const [nm, s2] of stmtOfName) if (s2 === st) cluster.delete(nm);

const clusterStmts = new Set();
for (const n of cluster) clusterStmts.add(stmtOfName.get(n));
const namesInStmt = new Map();
for (const n of cluster) { const st = stmtOfName.get(n); if (!namesInStmt.has(st)) namesInStmt.set(st, []); namesInStmt.get(st).push(n); }

const inbound = new Map();
for (const st of hostStmts) {
  if (clusterStmts.has(st) || excludedStmts.has(st)) continue;
  for (const id of freeOfStmt.get(st)) if (cluster.has(id)) { if (!inbound.has(id)) inbound.set(id, new Set()); inbound.get(id).add(st); }
}
const outbound = new Set();
for (const st of clusterStmts) for (const id of freeOfStmt.get(st)) if (!cluster.has(id) && localNames.has(id)) outbound.add(id);

/* ---------- 簇内 deps 改写：只读 → deps.x()；读写 → deps.x.get() / deps.x.set(v) ---------- */
const depWrites = new Map();
for (const st of clusterStmts) {
  (function w(n) {
    if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        ts.isIdentifier(n.left) && outbound.has(n.left.text)) {
      if (!depWrites.has(n.left.text)) depWrites.set(n.left.text, []);
      depWrites.get(n.left.text).push({ node: n, start: n.getStart(sf), end: n.getEnd(), rightStart: n.right.getStart(sf), rightEnd: n.right.getEnd() });
    }
    ts.forEachChild(n, w);
  })(st);
}
const depReadText = n => (depWrites.has(n) ? `deps.${n}.get()` : `deps.${n}()`);
const depWriteSpans = [...depWrites.values()].flat().map(w => [w.start, w.end]);
const depReads = [];
for (const st of clusterStmts) for (const h of idPositions(st, outbound))
  if (!depWriteSpans.some(([a, b]) => h.start >= a && h.end <= b)) depReads.push(h);
/** node 范围内（绝对偏移）的 deps 改写，返回相对编辑 */
function depEditsIn(absStart, absEnd) {
  const out = [];
  for (const [name, ws] of depWrites) for (const w of ws) {
    if (w.start < absStart || w.end > absEnd) continue;
    const nested = depReads.filter(h => h.start >= w.rightStart && h.end <= w.rightEnd);
    const rhsText = applyEdits(src.slice(w.rightStart, w.rightEnd),
      nested.map(h => ({ start: h.start - w.rightStart, end: h.end - w.rightStart, text: depReadText(h.name) })));
    out.push({ start: w.start - absStart, end: w.end - absStart, text: `deps.${name}.set(${rhsText})` });
  }
  for (const h of depReads) {
    if (h.start < absStart || h.end > absEnd) continue;
    if (depWriteSpans.some(([a, b]) => h.start >= a && h.end <= b)) continue;
    out.push({ start: h.start - absStart, end: h.end - absStart, text: depReadText(h.name) });
  }
  return out;
}

/* ---------- 模块级依赖闭包 ---------- */
const omit = [];
for (const st of clusterStmts) for (const id of freeIds(st)) if (moduleNames.has(id)) omit.push(id);
const mseen = new Set(), mq = [...omit];
while (mq.length) {
  const n = mq.pop();
  if (mseen.has(n)) continue;
  const st = moduleOfName.get(n); if (!st) continue;
  mseen.add(n);
  for (const r of freeIds(st)) if (moduleNames.has(r) && !mseen.has(r)) mq.push(r);
}
const movedStmts = new Set([...mseen].map(n => moduleOfName.get(n)));

const orderedCluster = [...clusterStmts].sort((a, b) => a.getStart(sf) - b.getStart(sf));
const clusterLines = orderedCluster.reduce((a, st) => a + lineOf(st.getEnd()) - lineOf(st.getStart(sf)) + 1, 0);
let movedLines = 0; for (const s of movedStmts) movedLines += lineOf(s.getEnd()) - lineOf(s.getStart(sf)) + 1;

console.log(`簇: ${cluster.size} 名 / ${orderedCluster.length} 条语句 / ${clusterLines} 行`);
console.log(`  排除（转为入参依赖）: ${[...EXCLUDE].filter(n => stmtOfName.has(n)).join(", ") || "(无)"}`);
console.log(`  模块级依赖闭包: ${mseen.size} 单元 / ${movedLines} 行`);
console.log(`  入参依赖: ${[...outbound].map(n => `${n}(${depWrites.has(n) ? "读写" : "只读"})`).join(", ") || "(无)"}`);
console.log(`  对外接口: ${[...inbound.keys()].sort().join(", ") || "(无)"}`);
const gap = new Set();
for (const st of clusterStmts) for (const id of freeIds(st))
  if (!localNames.has(id) && !moduleNames.has(id) && !GLOBALS.has(id) && !importOf.has(id)) gap.add(id);
console.log(`  闭包缺口: ${gap.size ? [...gap].join(", ") : "(无) ✅"}`);

/* ---------- 生成新模块 ---------- */
const docStartOffset = st => {
  let l = lineOf(st.getStart(sf));
  let k = l - 2;
  while (k >= 0 && /^\s*(\*|\/\*\*|\*\/)/.test(lines[k])) { l = k + 1; k--; }
  return offAt(l);
};
const movedOrdered = [...movedStmts].sort((a, b) => a.getStart(sf) - b.getStart(sf));
const movedChunks = [];
for (const st of movedOrdered) {
  const raw = src.slice(docStartOffset(st), st.getEnd());
  const cl = raw.split("\n");
  let ok = false;
  for (let i = 0; i < cl.length; i++) {
    if (/^\s*(async\s+)?function\s|^\s*const\s|^\s*let\s|^\s*class\s/.test(cl[i])) { cl[i] = cl[i].replace(/^(\s*)/, "$1export "); ok = true; break; }
  }
  if (!ok) { console.error("✗ 未找到声明关键字:", st.getText(sf).slice(0, 60)); process.exit(1); }
  movedChunks.push(cl.join("\n"));
}

const needed = new Map(), unknown = [];
for (const st of [...clusterStmts, ...movedStmts]) for (const id of freeIds(st)) {
  if (moduleNames.has(id) || GLOBALS.has(id) || localNames.has(id)) continue;
  const info = importOf.get(id);
  if (info) needed.set(id, info); else if (!unknown.includes(id)) unknown.push(id);
}
if (unknown.length) console.log("  ⚠ 未识别自由名:", unknown.join(", "));
const bySrc = new Map();
for (const [, info] of needed) {
  if (!bySrc.has(info.src)) bySrc.set(info.src, { ns: new Set(), named: new Set() });
  const g = bySrc.get(info.src); if (info.ns) g.ns.add(info.spec); else g.named.add(info.spec);
}
let importBlock = "";
for (const [m, g] of bySrc) {
  for (const ns of [...g.ns].sort()) importBlock += `import * as ${ns} from ${m};\n`;
  const named = [...g.named].sort();
  if (named.length === 1) importBlock += `import { ${named[0]} } from ${m};\n`;
  else if (named.length > 1) importBlock += `import {\n${named.map(x => "  " + x).join(",\n")}\n} from ${m};\n`;
}

const clusterBody = orderedCluster
  .map(st => applyEdits(src.slice(docStartOffset(st), st.getEnd()), depEditsIn(docStartOffset(st), st.getEnd())))
  .join("\n");

const retEntries = [];
const isWrittenExternally = name => {
  let written = false;
  for (const st of inbound.get(name) || []) (function w(n) {
    if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.EqualsToken && ts.isIdentifier(n.left) && n.left.text === name) written = true;
    if ((ts.isPrefixUnaryExpression(n) || ts.isPostfixUnaryExpression(n)) && ts.isIdentifier(n.operand) && n.operand.text === name) written = true;
    ts.forEachChild(n, w);
  })(st);
  return written;
};
for (const n of [...inbound.keys()].sort()) {
  if (localKind.get(n) !== "let") { retEntries.push(`    ${n}`); continue; }
  const setter = isWrittenExternally(n) ? `,\n    set ${n}(next: any) {\n      ${n} = next;\n    }` : "";
  retEntries.push(`    get ${n}(): any {\n      return ${n};\n    }${setter}`);
}

const depNames = [...outbound].sort();
const depParam = depNames.length
  ? `deps: {\n${depNames.map(n => depWrites.has(n)
      ? `  ${n}: {\n    get: () => any;\n    set: (next: any) => void;\n  };`
      : `  ${n}: () => any;`).join("\n")}\n}`
  : "";
const header = `/**\n * ${DESC}\n *\n * 自 studio-app.ts 的 createStageController 内簇工厂化外提。\n * 对 studio-app.ts 内部零依赖（模块级依赖 ${mseen.size}），故不存在循环引用；\n * 簇内可变状态经 getter/setter 暴露${depNames.length ? "；簇外局部经 deps 注入" : ""}。\n */\n`;
const newModule = header + (importBlock ? importBlock + "\n" : "")
  + (movedChunks.length ? `/* ---------- 随簇外提的模块级单元 ---------- */\n\n` + movedChunks.join("\n\n") + "\n\n" : "")
  + `/* ---------- 工厂 ---------- */\n\nexport function ${FACTORY}(${depParam}) {\n`
  + clusterBody
  + `\n\n  return {\n${retEntries.join(",\n")}\n  };\n}\n`;

if (DRY) {
  console.log("\n--dry 未写盘。");
  for (const st of orderedCluster) console.log(`  L${String(lineOf(st.getStart(sf))).padStart(6)}-${String(lineOf(st.getEnd())).padStart(6)}  ${namesInStmt.get(st).join(", ")}`);
  console.log("\n返回对象:\n" + retEntries.join(",\n"));
  console.log("\ndeps 形参:\n" + depParam);
  console.log("\n模块级随迁:", movedOrdered.length ? movedOrdered.map(st => st.getText(sf).split("\n")[0].slice(0, 70)).join(" | ") : "(无)");
  process.exit(0);
}

/* ---------- 落盘 ---------- */
const outName = path.basename(OUT);
fs.writeFileSync(path.join(STUDIO_DIR, outName), newModule);

const extPositions = [];
for (const st of hostStmts) {
  if (clusterStmts.has(st)) continue;
  for (const h of idPositions(st, new Set(inbound.keys()))) extPositions.push(h);
}
const edits = extPositions.map(h => ({ start: h.start, end: h.end, text: `${INSTANCE}.${h.name}` }));
const depArgs = depNames.length
  ? `const ${INSTANCE} = ${FACTORY}({\n${depNames.map(n => depWrites.has(n)
      ? `    ${n}: {\n      get: () => ${n},\n      set: (next: any) => {\n        ${n} = next;\n      }\n    }`
      : `    ${n}: () => ${n}`).join(",\n")}\n  });`
  : `const ${INSTANCE} = ${FACTORY}();`;
if (AFTER) {
  const anchor = stmtOfName.get(AFTER);
  if (!anchor) throw new Error(`--after ${AFTER}: 未找到该宿主局部语句`);
  if (clusterStmts.has(anchor)) throw new Error(`--after ${AFTER}: 该语句属于簇内，会被删除`);
  const at = offAt(lineOf(anchor.getEnd()) + 1);
  edits.push({ start: at, end: at, text: `  ${depArgs}\n` });
  for (const st of orderedCluster) edits.push({ start: docStartOffset(st), end: st.getEnd(), text: "" });
  console.log(`  实例化锚点: ${AFTER} 之后`);
} else {
  let first = true;
  for (const st of orderedCluster) {
    const s = docStartOffset(st), e = st.getEnd();
    if (first) {
      first = false;
      edits.push({ start: s, end: e, text: "  " + depArgs });
    } else {
      edits.push({ start: s, end: e, text: "" });
    }
  }
}
let next = applyEdits(src, edits);
/* 删除语句会留下空行堆积，压回最多 1 行 */
{
  const out = []; let run = 0;
  for (const l of next.split("\n")) {
    if (/^[ \t]*$/.test(l)) { run++; if (run > 1) continue; } else run = 0;
    out.push(l);
  }
  next = out.join("\n");
}

/* 回填 import：被搬走的模块级名字 + 工厂名 */
const backNames = [...new Set([...mseen, FACTORY])].sort();
const rel = `./${outName.replace(/\.ts$/, ".js")}`;
const imp = backNames.length === 1
  ? `import { ${backNames[0]} } from ${JSON.stringify(rel)};`
  : `import {\n${backNames.map(n => "  " + n).join(",\n")}\n} from ${JSON.stringify(rel)};`;
{
  const ls = next.split("\n");
  ls.splice(lastImportLine, 0, imp);
  next = ls.join("\n");
}
fs.writeFileSync(APP, next);

/* 自检：宿主内不应再有对簇内名字的裸引用 */
const hostOnly = next.slice(next.indexOf(`function ${HOST}(`));
const residual = [];
for (const n of inbound.keys()) {
  const m = hostOnly.match(new RegExp(`(?<![\\w.$])${n}(?![\\w$])`, "g"));
  if (m) residual.push(`${n}×${m.length}`);
}
console.log(`\n✓ ${outName}: ${newModule.split("\n").length} 行`);
console.log(`✓ studio-app.ts: ${lines.length - 1} → ${next.split("\n").length - 1} 行`);
console.log(`  簇外引用改写: ${extPositions.length} 处 | deps 改写: ${depReads.length + depWriteSpans.length} 处`);
console.log(`  回填 import: ${backNames.length} 项`);
if (residual.length) console.log(`  ⚠ 自检：宿主内仍有裸引用（可能同名于其他簇成员）: ${residual.join(", ")}`);
