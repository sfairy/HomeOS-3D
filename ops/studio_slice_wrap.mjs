#!/usr/bin/env node
/**
 * 语句级切片的**下半程**：把 `studio_slice_extract.mjs --range` 搬出来的那条语句
 * 包成 `export function attachX(deps)` 工厂，并打印宿主该写的那段调用。
 *
 * 为什么语句级切片需要单独的包装器
 * --------------------------------
 * 声明级切片（`--names`）搬的是「定义」，宿主在定义处换成薄转发，**调用时机由原来的调用点决定**，
 * 依赖袋每次调用现取即可。语句级切片搬的是「事件注册」这种**在 boot 时只执行一次**的语句，
 * 回调要等用户操作才跑 —— 于是有两处必须与「留在宿主里的闭包」语义对齐：
 *
 * 1. **依赖必须惰性取**：宿主传 getter，模块正文把引用改写成 `deps.x`。
 *    反例：宿主 `let editorRenderer: any = null` 是 boot 之后才被赋值的，按值注入会抓到 `null`；
 *    而声明在注册语句**下方**的名字（`entryStateRecord` 那种）按值注入会在 boot 当场 TDZ 炸。
 *    两者都是 tsc 抓不到、只在运行期静默失效/抛错的坑。
 * 2. **改写只在引用位**：属性名 / 绑定名 / 类型位一律不动；被内层同名绑定遮蔽的引用也不动。
 *    漏改的方向是安全的 —— 模块里没有宿主作用域，裸名必被 TS2304 抓住，而不是悄悄解析到别处。
 *
 * 声明级切片（`--mode=fn`）
 * ------------------------
 * 声明级搬走的是「函数定义」，宿主侧因此只要留一个**同名薄转发器**，调用点零改写。三条硬约束：
 *
 * 1. **依赖袋是提升的函数声明**（`function xDeps() { return ({ … }); }`）：
 *    函数随时可能被调用，现取即等价于闭包；反例是写成 `const xDeps = () => ({…})` —— 原函数是
 *    提升的，宿主在插入点**上方**的启动期代码里可能已经调用它，而 `const` 有 TDZ，会在 boot 当场崩。
 * 1b. **袋内依赖项一律写成惰性访问器**（`get a() { return a; }`），与语句级 `hostCallBody` 同口径。
 *    反例是裸值简写 `{ a, b }` —— 它在**构建袋的那一刻**就把每个名字读一遍，而宿主的名字声明在
 *    袋构造点之后是常态（切片方向上就是「定义往下游搬」）。一旦袋子被 boot 早期路径提前构造
 *    （如 mount 顶层直接调用的 `bindNavigationDrag()`），尚未初始化的 `const` 立刻 TDZ 崩溃，且
 *    报错名是压缩后的临时名（`Cannot access '$' before initialization`），源文件里查无此名。
 * 2. **族内互调要串依赖**：一族 N 个声明搬进同一个模块后，每个 core 都多一个 `deps` 首参，
 *    于是 `b(x)` 要改写成 `bCore(deps, x)`（本工具做）；族内名字不算依赖，不进依赖袋。
 *
 * 3. **有外层写入的依赖走 state 袋**：`x = v` 会被改写成 `deps.x = v`，若宿主侧只给 getter，
 *    那个写会在 ESM 严格模式下当场 TypeError —— 宿主变量永远不变，而 tsc
 *    一声不吭（真踩过：备份弹窗把当前弹窗登记丢了、图标选择器拿不到 options）。所以宿主侧对
 *    被写入的名字生成 `get/set` 访问器（读穿透、写回灌），只在 JSON 里报 `stateWrites`。
 *
 * 用法
 * ----
 *   # 语句形态：搬出来的一条注册语句 → attachX(deps) 工厂
 *   node ops/studio_slice_wrap.mjs --module=<切片模块> --factory=attachX --iface=XDeps
 *   # 声明形态：搬出来的一族函数声明 → <名>Core(deps, …原形参) + 宿主转发器片段
 *   node ops/studio_slice_wrap.mjs --mode=fn --module=<切片模块> --iface=XDeps [--thunk=xDeps]
 *   # 模块已经包装过、只想重算宿主接线（不写盘）
 *   node ops/studio_slice_wrap.mjs --mode=fn --host-only --module=<切片模块> --iface=XDeps --thunk=xDeps
 *
 * 产出：就地改写 `<切片模块>`；stdout 打印 JSON（`deps` / `rewritten` / `shadowSkipped` /
 * `hostCallBody` / 声明形态的 `hostLines`），宿主侧把那几行（含 `import`）自己贴进去 ——
 * 这一步刻意不自动化：插入位置要跟原语句**同位**（注册顺序敏感），由人来定更稳。
 *
 * 退出码：0 正常；1 模块形态不符（比如正文不止一条语句）。
 */
import ts from "typescript";
import fs from "node:fs";

const arg = (k) => {
  const hit = process.argv.find((a) => a.startsWith(`--${k}=`));
  return hit ? hit.slice(k.length + 3) : undefined;
};
const modulePath = arg("module");
const factoryName = arg("factory");
const ifaceName = arg("iface");
const indent = arg("indent") ?? "  ";
const mode = arg("mode") ?? "stmt";
const hostOnly = process.argv.includes("--host-only");
const src = fs.readFileSync(modulePath, "utf8");
const sf = ts.createSourceFile(modulePath, src, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TS);

const GLOBALS = new Set([
  "Map", "Set", "WeakMap", "WeakSet", "Array", "Object", "Number", "String", "Boolean", "Math", "JSON",
  "Date", "Promise", "Error", "RegExp", "document", "window", "console", "undefined", "NaN", "Infinity",
  "isNaN", "parseInt", "parseFloat", "setTimeout", "clearTimeout", "setInterval", "clearInterval",
  "requestAnimationFrame", "cancelAnimationFrame", "fetch", "Event", "CustomEvent", "MutationObserver",
  "IntersectionObserver", "ResizeObserver", "HTMLElement",
  "HTMLInputElement", "Element", "Node", "Text", "URL", "URLSearchParams", "Blob", "File", "FileReader",
  "FormData", "AbortController", "structuredClone", "queueMicrotask", "performance", "localStorage",
  "sessionStorage", "navigator", "location", "history", "alert", "confirm", "btoa", "atob",
  "encodeURIComponent", "decodeURIComponent", "isFinite", "Symbol", "Proxy", "Reflect", "globalThis", "Intl",
]);

const imported = new Set();
const bodyStmts = [];
let lastImportEnd = 0;
for (const st of sf.statements) {
  if (ts.isImportDeclaration(st)) {
    const b = st.importClause?.namedBindings;
    if (b && ts.isNamedImports(b)) for (const e of b.elements) imported.add(e.name.text);
    if (b && ts.isNamespaceImport(b)) imported.add(b.name.text);
    if (st.importClause?.name) imported.add(st.importClause.name.text);
    lastImportEnd = st.getEnd();
    continue;
  }
  bodyStmts.push(st);
}
const stmt = bodyStmts[0];
// 函数形态下模块里只有函数声明（stmt 形态只有 1 条语句）；host-only 重算时模块里还多一个 interface，要滤掉
const walkStmts = mode === "stmt" ? bodyStmts : bodyStmts.filter((d) => ts.isFunctionDeclaration(d));

const patternNames = (name, out) => {
  if (!name) return;
  if (ts.isIdentifier(name)) out.push(name);
  else if (ts.isObjectBindingPattern(name) || ts.isArrayBindingPattern(name)) {
    for (const e of name.elements) if (ts.isBindingElement(e)) patternNames(e.name, out);
  }
};
const isPropName = (n) => {
  const p = n.parent;
  return (
    (ts.isPropertyAccessExpression(p) && p.name === n) ||
    (ts.isPropertyAssignment(p) && p.name === n) ||
    (ts.isBindingElement(p) && p.propertyName === n) ||
    (ts.isQualifiedName(p) && p.right === n) ||
    (ts.isMethodDeclaration(p) && p.name === n) ||
    (ts.isPropertyDeclaration(p) && p.name === n) ||
    (ts.isEnumMember(p) && p.name === n) ||
    (ts.isFunctionDeclaration(p) && p.name === n) ||
    (ts.isClassDeclaration(p) && p.name === n) ||
    (ts.isTypeParameterDeclaration(p) && p.name === n) ||
    (ts.isLabeledStatement(p) && p.label === n) ||
    (ts.isBreakOrContinueStatement(p) && p.label === n)
  );
};
// 类型位不能塞 `deps.x`（那是值），故不参与改写
const isTypePos = (n) => {
  for (let p = n.parent; p && p !== stmt.parent; p = p.parent) if (ts.isTypeNode(p)) return true;
  return false;
};
// `{ x }` 简写：值是引用、键是属性名，得整条换成 `{ x: deps.x }`
const isShorthandName = (n) => ts.isShorthandPropertyAssignment(n.parent) && n.parent.name === n;

const refs = [];
for (const st of walkStmts)
  (function walk(n) {
    if (ts.isIdentifier(n) && !isPropName(n) && !isTypePos(n)) refs.push(n);
    ts.forEachChild(n, walk);
  })(st);

// 保守方向的遮蔽判定：子树里只要有同名绑定就不改写该名 —— 少改只会让模块里留下裸名，
// 而模块没有宿主作用域，裸名必被 TS2304 抓住（可发现），不会静默解析到别处（不可发现）。
const boundAll = new Set();
for (const st of walkStmts)
  (function collect(n) {
  if (ts.isVariableDeclaration(n) || ts.isParameter(n) || ts.isBindingElement(n)) {
    const ids = [];
    patternNames(ts.isBindingElement(n) ? n.name : n.name, ids);
    for (const i of ids) boundAll.add(i.text);
  }
  if ((ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n)) && n.name) boundAll.add(n.name.text);
  if (ts.isCatchClause(n) && n.variableDeclaration) {
    const ids = [];
    patternNames(n.variableDeclaration.name, ids);
    for (const i of ids) boundAll.add(i.text);
  }
    ts.forEachChild(n, collect);
  })(st);

const free = new Set();
for (const r of refs) if (!boundAll.has(r.text) && !GLOBALS.has(r.text) && !imported.has(r.text)) free.add(r.text);

// 改写：把宿主引用替换成 `deps.<name>`（文本拼接，保住原字节与注释 —— 不走 printer）
// 注意是**区间替换** `[pos, end) → text`：只插不删会得到 `deps.XX`（吃过大亏）
const splices = refs
  .filter((r) => free.has(r.text))
  .map((r) => ({
    pos: r.getStart(sf),
    end: r.getEnd(sf),
    text: isShorthandName(r) ? `${r.text}: deps.${r.text}` : `deps.${r.text}`,
  }))
  .sort((a, b) => b.pos - a.pos);
let body = src.slice(0, stmt.getEnd());
for (const sp of splices) body = body.slice(0, sp.pos) + sp.text + body.slice(sp.end);
// 正文起点 = 首个 token 所在行的行首（`getFullStart()` 会把前置空行/注释一起带进来，
// 搬出去后模块头部会多两个空行）
const bodyStart = sf.getLineStarts()[sf.getLineAndCharacterOfPosition(stmt.getStart(sf)).line];
const bodyText = body.slice(bodyStart).replace(/\s+$/, "");
const shadowSkipped = [...free].filter((n) => boundAll.has(n));

// 统一坐标：改写按「相对语句起点的偏移」做，后续两种形态都能按偏移切段
const stmtStart = bodyStart;
let rewritten = src.slice(stmtStart, stmt.getEnd());
for (const sp of splices) {
  rewritten = rewritten.slice(0, sp.pos - stmtStart) + sp.text + rewritten.slice(sp.end - stmtStart);
}
const rel = (p) => p - stmtStart;

let deps = [...free];
const headEnd = lastImportEnd;

const ifaceLines = [
  `export interface ${ifaceName} {`,
  ...deps.map((d) => `  ${d}: any;`),
  `}`,
  "",
];

if (mode === "stmt") {
  if (bodyStmts.length !== 1) throw new Error(`语句形态期望模块正文只有 1 条语句，实际 ${bodyStmts.length} 条`);
  const lines = [
    ...src.slice(0, headEnd).replace(/\s+$/, "").split("\n"),
    "",
    `/** 依赖袋（宿主 \`bootEditor\` 作用域）：宿主按 getter 传入，模块**惰性读取** ——`,
    ` * 与留在宿主里的闭包同语义。搬走的语句只读不写，所以无需 state 袋 / setter。`,
    ` *`,
    ` * ⚠ 这里是**事件注册语句**：它在 boot 时只跑一次，回调要等用户操作。若按值注入，`,
    ` * 像 \`editorRenderer\`（boot 后才赋值）/ \`activeProject\` 这类可变状态会被冻结在注册那一刻，`,
    ` * 而声明在注册语句下方的名字甚至会在 boot 当场触发 TDZ。故宿主一律传 getter。`,
    ` */`,
    ...ifaceLines.slice(0, -1),
    "",
    `export function ${factoryName}(deps: ${ifaceName}) {`,
    ...rewritten.split("\n"),
    `}`,
    "",
  ];
  fs.writeFileSync(modulePath, lines.join("\n"), "utf8");
  console.log(
    JSON.stringify(
      { mode, deps, rewritten: splices.length, shadowSkipped, hostCallBody: deps.map((d) => `${indent}get ${d}() { return ${d}; },`) },
      null,
      2,
    ),
  );
} else {
  // ── 函数声明形态（支持一族 N 个声明：族内互调留在模块里，不进依赖袋）──
  // 宿主侧每个函数留一个**同名薄转发器**（函数声明 → 保持提升语义，调用点零改写），
  // 依赖袋是**每次调用现取**的普通对象（不是 getter）：函数随时可能被调用，现取即等价于闭包。
  // 这一点与语句级切片（注册一次、回调晚跑）正好相反。
  // 已包装过的模块里还有 interface 语句：host-only / 重算时只认函数声明
  const decls = bodyStmts.filter((d) => ts.isFunctionDeclaration(d) && d.name && d.body);
  if (!hostOnly && decls.length !== bodyStmts.length) throw new Error("--mode=fn 只接受函数声明（带函数体）");
  if (!decls.length) throw new Error("--mode=fn 没找到函数声明");
  // host-only：模块是**已包装**的（core 名带 Core 后缀、依赖袋已固化在 interface 里），
  // 于是从 interface 读依赖袋、从 core 名反推原名 —— 不重算 refs（那些已经是 `deps.x`）
  if (hostOnly) {
    const iface = bodyStmts.find((st) => ts.isInterfaceDeclaration(st) && st.name.text === ifaceName);
    if (iface) deps = iface.members.map((m) => m.name.text);
  }
  const names = decls.map((d) => (hostOnly ? d.name.text.replace(/Core$/, "") : d.name.text));
  const coreName = (d) => (hostOnly ? d.name.text : arg("core") && decls.length === 1 ? arg("core") : `${d.name.text}Core`);
  const cores = new Map(decls.map((d, i) => [names[i], coreName(d)]));

  // 自引用与族内互调都要跟着改名（它们在 deps 计算里是本模块绑定，不会被改写成 deps.x）
  const renameSplices = refs
    .filter((r) => cores.has(r.text))
    .map((r) => ({ pos: r.getStart(sf), end: r.getEnd(sf), text: cores.get(r.text) }))
    .sort((a, b) => b.pos - a.pos);
  let out = src.slice(0, headEnd).replace(/\s+$/, "");
  const skipWrite = hostOnly;
  const coreText = (d) => {
    const n = d.name.text;
    const inner = d.parameters.length ? src.slice(d.parameters.pos, d.parameters.end) : "";
    // 尾巴 = 末参终点 → 函数体起点，**含右括号**（`): 返回类型 `），所以两个模板都别再补 `)`
    const tail = src.slice(d.parameters.end, d.body.getStart(sf));
    const isAsync = (d.modifiers ?? []).some((m) => m.kind === ts.SyntaxKind.AsyncKeyword);
    const bodyText = src.slice(d.body.getStart(sf), d.end);
    const ph = inner ? `deps: ${ifaceName}, ${inner}` : `deps: ${ifaceName}`;
    return `export ${isAsync ? "async " : ""}function${d.asteriskToken ? "*" : ""} ${cores.get(n)}(${ph}${tail}${bodyText}`;
  };
  const lines = [
    ...out.split("\n"),
    "",
    `/** 依赖袋（宿主 \`bootEditor\` 作用域）：**每次调用现取**的普通对象，等价于闭包读值。`,
    ` * 本族切片只读不写（外层写入 0），所以不需要 getter / state 袋；宿主侧每个函数一个同名`,
    ` * 薄转发器，调用点零改写（函数声明保持提升语义）。族内互调留在模块内，不进依赖袋。`,
    ` */`,
    ...ifaceLines.slice(0, -1),
    "",
    ...decls.map(coreText).join("\n\n").split("\n"),
    "",
  ];
  // 改名 + 改写成 deps.x：都在**模块文本**坐标上做（N 个声明一起）。
  // 全在内存里拼好、过完守卫再落盘 —— 落盘两次会让守卫抛错时盘上留半成品（真踩过）。
  let mod = lines.join("\n");
  const modPre = mod;
  const sf2 = ts.createSourceFile(modulePath, mod, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TS);
  const allSplices = [];
  // 族内互调：core 都多了一个 `deps` 首参，调用点要把 `deps` 串进去（否则 TS2554 参数个数不符）
  for (const st of sf2.statements) {
    if (!ts.isFunctionDeclaration(st) || !st.body) continue;
    (function walkCalls(n) {
      if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && cores.has(n.expression.text) && !isTypePos(n)) {
        const open = mod.indexOf("(", n.expression.getEnd());
        allSplices.push({ pos: open + 1, end: open + 1, text: n.arguments.length === 0 ? "deps" : "deps, " });
      }
      ts.forEachChild(n, walkCalls);
    })(st);
  }
  for (const st of sf2.statements) {
    if (!ts.isFunctionDeclaration(st) || !st.body) continue;
    (function walk(n) {
      if (ts.isIdentifier(n)) {
        const p = n.parent;
        const prop =
          (ts.isPropertyAccessExpression(p) && p.name === n) ||
          (ts.isPropertyAssignment(p) && p.name === n) ||
          (ts.isMethodDeclaration(p) && p.name === n) ||
          (ts.isShorthandPropertyAssignment(p) && p.name === n) ||
          (ts.isFunctionDeclaration(p) && p.name === n) ||
          (ts.isParameter(p) && p.name === n);
        let typepos = false;
        for (let q = n.parent; q && q !== st.parent; q = q.parent) if (ts.isTypeNode(q)) typepos = true;
        if (prop || typepos) return;
        if (free.has(n.text)) {
          allSplices.push({ pos: n.getStart(sf2), end: n.getEnd(sf2), text: `deps.${n.text}` });
        } else if (cores.has(n.text)) {
          allSplices.push({ pos: n.getStart(sf2), end: n.getEnd(sf2), text: cores.get(n.text) });
        }
      }
      ts.forEachChild(n, walk);
    })(st);
  }
  allSplices.sort((a, b) => b.pos - a.pos);
  for (const sp of allSplices) mod = mod.slice(0, sp.pos) + sp.text + mod.slice(sp.end);
  // 被搬走的函数里若出现**外层写入**（`x = v` → `deps.x = v`），那个写会落进「每次调用现建、
  // 随即丢弃」的依赖袋对象 —— 宿主变量永远不变，而 tsc 一声不吭（真踩过）。这类名字必须在
  // 宿主侧生成 **getter/setter 访问器**（state 袋），让写穿透回宿主变量。
  const stateWrites = [...new Set([...mod.matchAll(/deps\.(\w+)\s*(?:=[^=]|\+\+|--|[-+*/]=|\|\|=|&&=|\?\?=)/g)].map((m) => m[1]))];
  if (stateWrites.length) console.error(`⚠ 切片含外层写入：${stateWrites.join(", ")} —— 宿主侧按 state 袋（get/set）接线`);
  if (!skipWrite) fs.writeFileSync(modulePath, mod, "utf8");

  // 宿主侧：解构形参不能直接当实参传，按绑定名拼回对象/数组
  const patternToExpr = (pat) => {
    if (ts.isIdentifier(pat)) return pat.text;
    if (ts.isObjectBindingPattern(pat))
      return `{ ${pat.elements
        .map((e) => `${e.dotDotDotToken ? "..." : ""}${(e.propertyName ?? e.name).getText(sf)}: ${patternToExpr(e.name)}`)
        .join(", ")} }`;
    if (ts.isArrayBindingPattern(pat))
      return `[ ${pat.elements
        .map((e) => (ts.isOmittedExpression(e) ? "" : `${e.dotDotDotToken ? "..." : ""}${patternToExpr(e.name)}`))
        .join(", ")} ]`;
    throw new Error(`不认识的形参形态 ${ts.SyntaxKind[pat.kind]} —— 手工转发`);
  };
  const thunk = arg("thunk");
  const host = [];
  // ⚠ 依赖袋必须用**函数声明**（提升），不能写 `const x = () => ({…})`：
  // 原函数是提升的，宿主在插入点**上方**的启动期代码里可能已经调用它，
  // 而 `const` 有 TDZ —— 那会在 boot 当场崩。函数声明与转发器同样提升，顺序彻底无关。
  //
  // ⚠⚠ 依赖项**一律**写成惰性访问器，与语句级（`hostCallBody`）同口径 —— 这是硬约束：
  // 袋是「随时可能被调用」的工厂，裸值简写（`{ x }`）等于**在构建袋的那一刻**就把每个名字读
  // 一遍。而宿主的名字声明在袋构造点**之后**是常态（切片就是往下游搬定义），一旦袋子被
  // boot 早期路径提前构造（如 mount 顶层直接调用的 `bindNavigationDrag()`），那些还没初始化的
  // `const` 立刻 TDZ 崩溃 —— 报错名是压缩后的临时名（`Cannot access '$' before initialization`），
  // 与源文件毫无对应关系，极难反查。
  // 惰性即等价于闭包：读穿透到宿主变量，且**与声明顺序彻底无关**。有外层写入的再加 setter
  // （读穿透、写回灌）。
  const depLines = deps.map((d) =>
    stateWrites.includes(d)
      ? `${indent}    get ${d}() {\n${indent}      return ${d};\n${indent}    },\n${indent}    set ${d}(v) {\n${indent}      ${d} = v;\n${indent}    },`
      : `${indent}    get ${d}() {\n${indent}      return ${d};\n${indent}    },`,
  );
  const thunkLines = (name_) => [`${indent}function ${name_}() {`, `${indent}  return ({\n${depLines.join("\n")}\n${indent}  });`, `${indent}}`, ""];
  if (thunk && deps.length) host.push(...thunkLines(thunk));
  const forwarders = [];
  for (const d of decls) {
    const n = hostOnly ? d.name.text.replace(/Core$/, "") : d.name.text;
    const core = cores.get(n) ?? d.name.text;
    // host-only：模块里的 core 首参就是 `deps`，转发器签名/实参都要把它摘掉
    const ps = hostOnly ? d.parameters.slice(1) : d.parameters;
    const paramsText = ps.map((pp) => src.slice(pp.getStart(sf), pp.getEnd()).replace(/\s+/g, " ")).join(", ");
    const tail = ps.length ? src.slice(ps[ps.length - 1].getEnd(), d.body.getStart(sf)) : src.slice(d.parameters.end, d.body.getStart(sf));
    const argsText = ps.map((pp) => patternToExpr(pp.name ?? pp)).join(", ");
    // core 签名**固定**带 deps 首参，所以零依赖时也得占位（空 interface 传 `{}`），否则实参错位
    const depsArg = deps.length ? (thunk ? `${thunk}()` : `${n}Deps()`) : "{}";
    if (!thunk && deps.length) host.push(...thunkLines(`${n}Deps`));
    forwarders.push(
      `${indent}function ${n}(${paramsText}${tail}{`,
      `${indent}  return ${core}(${[depsArg, argsText].filter(Boolean).join(", ")});`,
      `${indent}}`,
    );
  }
  if (!thunk && deps.length) host.push("");
  host.push(...forwarders);
  console.log(
    JSON.stringify(
      {
        mode,
        names,
        cores: Object.fromEntries(cores),
        deps,
        stateWrites,
        rewritten: free.size,
        shadowSkipped,
        thunk,
        hostLines: host,
        imports: [...cores.values()].map((c) => c),
      },
      null,
      2,
    ),
  );
}
