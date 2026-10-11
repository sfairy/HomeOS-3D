#!/usr/bin/env node
/**
 * Studio 单体「切片可行性」分析器 —— 拆 P4 单体之前先量清楚代价。
 *
 * 为什么需要它
 * `studio-app.ts`（35k 行）不是「一堆顶层声明」：它是 80 条 import + 3 条小语句 +
 * 一个 34,901 行的 `bootStudio()`，函数体里再套一个等大的箭头函数，
 * 里面平铺着 1023 个直系声明、1586 个函数（见 `--list`）。
 * 所以「把一个函数搬进域文件夹」的真实代价不是它的行数，而是它**闭包捕获**了多少东西：
 *
 * - 同宿主兄弟（同一层闭包里的函数/可变状态）—— 搬走要么一起搬，要么显式传参；
 * - 可变状态（`let`）—— 传参只能传快照，必须确认目标是「只读」才能真正安全；
 * - 外层宿主捕获 —— 跨层，成本最高；
 * - import —— 可以原样复制到新文件，不算成本。
 *
 * 本脚本用 TypeScript 编译器的 binder/checker 做**精确作用域解析**（正则版会把属性名、
 * 局部变量、别名 import 全算进来），把这些数字报出来，并按「搬走成本」排序候选。
 *
 * 用法
 * ----
 *   node ops/studio_slice_analyze.mjs <file> --list
 *       文件真实形状：顶层语句构成 + 所有函数的宿主链 + 超过 800 行的函数
 *   node ops/studio_slice_analyze.mjs <file> --rank
 *       巨型宿主内直系声明按搬走成本排序（体积 / 兄弟 / 可变 / 外层 / 未解析）
 *   node ops/studio_slice_analyze.mjs <file> --seeds=fnA,fnB
 *       指定函数的自由引用分类 + 同宿主函数闭包展开 + 搬完后的残留依赖
 *
 * 注意：`--seeds` 只用于**可行性判断**，它的「闭包展开」在这类单体里会迅速吃掉整个文件
 * （深度 3 的兄弟图几乎是全连通的）。真正的搬法是「显式传参」，所以看**残留依赖**那一栏，
 * 不要指望闭包能闭合。
 */
import ts from "typescript";
import fs from "node:fs";

const file = process.argv[2];
const flags = process.argv.slice(3);
if (!file || flags.length === 0) {
  console.error("用法：node ops/studio_slice_analyze.mjs <file> [--list | --rank | --seeds=a,b]");
  process.exit(2);
}
const seedsArg = (flags.find((f) => f.startsWith("--seeds=")) ?? "").slice(8).split(",").filter(Boolean);

const src = fs.readFileSync(file, "utf8");
const options = { target: ts.ScriptTarget.ESNext, noResolve: true, experimentalDecorators: true };
const host = ts.createCompilerHost(options);
const program = ts.createProgram([file], options, {
  ...host,
  fileExists: (f) => f === file,
  readFile: (f) => (f === file ? src : undefined),
});
const checker = program.getTypeChecker();
const sf = program.getSourceFile(file);

// 显式 parent map：TS 在 createProgram 里不保证 node.parent 可用，靠它自己的 parent 会静默算错作用域。
const P = new Map();
(function walk(n) { ts.forEachChild(n, (c) => { P.set(c, n); walk(c); }); })(sf);
const parentOf = (n) => P.get(n);

const isFn = (n) => n && (ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n) || ts.isArrowFunction(n)
  || ts.isMethodDeclaration(n) || ts.isGetAccessor(n) || ts.isSetAccessor(n) || ts.isConstructorDeclaration(n));
const hostOf = (n) => { let c = n; while (c) { if (isFn(c) || ts.isSourceFile(c)) return c; c = parentOf(c); } return sf; };
/** 声明的「定义作用域」：从父节点往上找（函数声明自身的 hostOf 会返回它自己，那是错的）。 */
const scopeOf = (n) => hostOf(parentOf(n));
const lineOf = (n) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
const lineEnd = (n) => sf.getLineAndCharacterOfPosition(n.getEnd()).line + 1;
const nameOf = (n) => {
  if (!n) return "?";
  if (ts.isSourceFile(n)) return "<文件顶层>";
  if (ts.isVariableDeclaration(n)) return n.name.getText(sf);
  if (n.name && ts.isIdentifier(n.name)) return n.name.text;
  // 类方法的计算名（`panel-renderer.ts` 的方法名全是 `["xyz"]()` 形态）：取字面量文本，
  // 否则报告里全变成 `<MethodDeclaration>`，`--seeds=` 也就没法按名字指定。表达式计算名原样列出。
  if (n.name && ts.isComputedPropertyName(n.name)) {
    const e = n.name.expression;
    if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e) || ts.isNumericLiteral(e)) return e.text;
    return n.name.getText(sf);
  }
  if (n.name && ts.isStringLiteral(n.name)) return n.name.text;
  return "<" + ts.SyntaxKind[n.kind] + ">";
};
const hostLabel = (h) => (ts.isSourceFile(h) ? "<文件顶层>" : `${nameOf(h)}@${lineOf(h)}`);

const importNames = new Set();
for (const st of sf.statements) {
  if (!ts.isImportDeclaration(st) || !st.importClause) continue;
  const c = st.importClause;
  if (c.name) importNames.add(c.name.text);
  const b = c.namedBindings;
  if (b && ts.isNamespaceImport(b)) importNames.add(b.name.text);
  if (b && ts.isNamedImports(b)) for (const e of b.elements) importNames.add(e.name.text);
}

function isReference(n) {
  const p = parentOf(n);
  if (!p) return false;
  if (ts.isPropertyAccessExpression(p) && p.name === n) return false;
  if (ts.isPropertyAssignment(p) && p.name === n) return false;
  if (ts.isPropertySignature(p) && p.name === n) return false;
  if (ts.isBindingElement(p)) return false;
  if (ts.isImportSpecifier(p) || ts.isExportSpecifier(p) || ts.isNamespaceImport(p) || ts.isImportClause(p)) return false;
  if (ts.isVariableDeclaration(p) && p.name === n) return false;
  if (ts.isParameter(p) && p.name === n) return false;
  if ((ts.isFunctionDeclaration(p) || ts.isFunctionExpression(p) || ts.isClassDeclaration(p)) && p.name === n) return false;
  if (ts.isInterfaceDeclaration(p) || ts.isTypeAliasDeclaration(p) || ts.isEnumDeclaration(p) || ts.isModuleDeclaration(p)) return false;
  if (ts.isLabeledStatement(p) && p.label === n) return false;
  if ((ts.isBreakStatement(p) || ts.isContinueStatement(p)) && p.label === n) return false;
  if (ts.isJsxAttribute(p)) return false;
  return true;
}

const allFns = [];
(function collect(n) { if (isFn(n)) allFns.push(n); ts.forEachChild(n, collect); })(sf);

/**
 * 深解析标识符指向的**真实声明**。
 *
 * 坑（已踩过，勿删）：`checker.getSymbolAtLocation` 对**简写属性**（`{ foo }`）返回的是
 * ShorthandPropertyAssignment 本身，而不是 `foo` 的外层绑定。于是「`context = { foo }`」
 * 这种把闭包变量塞进对象的写法会被当成「自己引用自己」，全部闭包捕获被静默吞掉 ——
 * 分析器报 cost 0、提取器报「无残留依赖」，切出去的文件引用未定义名，只有 typecheck 兜底。
 * 简写属性必须走 `getShorthandAssignmentValueSymbol` 才能拿到被引用的变量。
 */
function resolveDecl(id) {
  const p = parentOf(id);
  const sym = ts.isShorthandPropertyAssignment(p)
    ? (checker.getShorthandAssignmentValueSymbol(p) ?? checker.getSymbolAtLocation(id))
    : checker.getSymbolAtLocation(id);
  return sym?.valueDeclaration ?? sym?.declarations?.[0] ?? null;
}

/** 目标节点体内「对外自由引用」：声明节点 → 引用次数。 */
function freeRefs(node) {
  const local = new Set();
  const addPattern = (x) => { if (ts.isIdentifier(x)) local.add(x.text); ts.forEachChild(x, addPattern); };
  (function collectLocals(n) {
    if (isFn(n)) {
      for (const p of n.parameters) addPattern(p.name);
      // 只把**真正的函数绑定**当本地名（递归自引用）。方法 / 访问器的名字是属性键，
      // 不是绑定 —— 把 `get activeProject(){}` 的 activeProject 记成 local，会让函数体里
      // 对该闭包变量的引用被静默吞掉（context 对象就是这么写的）。
      if (n.name && ts.isIdentifier(n.name) && (ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n)))
        local.add(n.name.text);
    }
    if (ts.isVariableDeclaration(n)) addPattern(n.name);
    if (ts.isClassDeclaration(n) && n.name) local.add(n.name.text);
    if (ts.isCatchClause(n) && n.variableDeclaration) addPattern(n.variableDeclaration.name);
    ts.forEachChild(n, collectLocals);
  })(node);

  const out = new Map();
  const imports = new Map();
  const unresolved = new Map();
  const start = node.getStart(sf);
  const end = node.getEnd();
  (function walk(n) {
    if (ts.isIdentifier(n) && isReference(n) && !local.has(n.text)) {
      if (importNames.has(n.text)) {
        imports.set(n.text, (imports.get(n.text) ?? 0) + 1);
      } else {
        const decl = resolveDecl(n);
        if (decl && decl.getSourceFile() === sf && !(decl.getStart(sf) >= start && decl.getEnd() <= end)) {
          const e = out.get(decl) ?? { name: n.text, count: 0 };
          e.count++;
          out.set(decl, e);
        } else if (!decl) {
          unresolved.set(n.text, (unresolved.get(n.text) ?? 0) + 1);
        }
      }
    }
    ts.forEachChild(n, walk);
  })(node);
  return { out, imports, unresolved };
}

const isMutableDecl = (d) => ts.isVariableDeclaration(d) && ts.isVariableDeclarationList(parentOf(d))
  && !(parentOf(d).flags & ts.NodeFlags.Const);

/**
 * 巨型宿主判定。
 *
 * 老实现 = 「行跨度最大的函数；内部有几乎等大的就钻进去」—— 对 `studio-app.ts` / `home.ts` 是对的
 * （它们就是「一个 `bootX()` 里套一个巨型箭头」）。
 *
 * 坑（7b 踩到，勿删）：`panel-renderer-bulk-methods.ts` 的形态是**顶层就是一组 `export function`**，
 * 于是它把最大的那个 `showCustomPopup`（2,554 行）当成宿主，`--rank` 报「≥50 行的直系声明 0 个」——
 * 看着像「这份文件没有候选」，实际候选就是那 12 个顶层函数本身。
 *
 * 新判据：宿主必须真的**包住整份文件** —— 非 import 顶层语句 ≤ 3 条，且钻出的函数占全文件 > 70% 行数；
 * 否则宿主 = **源文件本身**（`--rank` 于是排的是顶层声明）。判错的方向是「报文件顶层」：最多让候选
 * 清单变长，不会像原来那样静默清空。
 */
function findBigHost() {
  const span = (n) => lineEnd(n) - lineOf(n) + 1;
  const total = src.split("\n").length;
  const nonImport = sf.statements.filter((st) => !ts.isImportDeclaration(st)).length;
  let big = allFns.reduce((a, b) => (span(a) >= span(b) ? a : b));
  for (;;) {
    const inner = allFns.filter((n) => n !== big && n.getStart(sf) >= big.getStart(sf) && n.getEnd() <= big.getEnd());
    const best = inner.reduce((a, b) => (a && span(a) >= span(b) ? a : b), null);
    if (best && span(best) >= span(big) * 0.95) { big = best; continue; }
    break;
  }
  return nonImport <= 3 && span(big) > total * 0.7 ? big : sf;
}
const isFileHost = (n) => ts.isSourceFile(n);
const hostName = (n) => (isFileHost(n) ? "文件顶层（非 import）" : `${nameOf(n)}@${lineOf(n)}`);

if (flags.includes("--list")) {
  console.log(`${file}：${src.split("\n").length} 行`);
  let imports = 0;
  for (const st of sf.statements) {
    if (ts.isImportDeclaration(st)) { imports++; continue; }
    const size = lineEnd(st) - lineOf(st) + 1;
    if (size > 50) console.log(`  顶层 ${lineOf(st)}~${lineEnd(st)}（${size} 行）${ts.SyntaxKind[st.kind]}`);
  }
  console.log(`  顶层语句 ${sf.statements.length} 条（import ${imports} 条）`);
  const big = findBigHost();
  console.log(`  巨型宿主：${hostName(big)}（${lineEnd(big) - lineOf(big) + 1} 行）`);
  console.log(`  函数总数 ${allFns.length}；超过 800 行的（内→外宿主链）：`);
  for (const { n, size } of allFns.map((n) => ({ n, size: lineEnd(n) - lineOf(n) + 1 })).filter((x) => x.size > 800).sort((a, b) => b.size - a.size)) {
    const chain = [];
    let h = n;
    while (h && !ts.isSourceFile(h)) { chain.push(hostLabel(h)); h = scopeOf(h); }
    console.log(`    ${String(size).padStart(6)} 行  ${lineOf(n)}~${lineEnd(n)}  ${nameOf(n)}   ← ${chain.join(" ← ")}`);
  }
} else if (flags.includes("--rank")) {
  const big = findBigHost();
  const fileHost = isFileHost(big);
  const bodyStatements = fileHost
    ? sf.statements.filter((st) => !ts.isImportDeclaration(st))
    : big.body && ts.isBlock(big.body)
      ? big.body.statements
      : [];
  const decls = [];
  let classHosts = 0;
  for (const st of bodyStatements) {
    if (ts.isFunctionDeclaration(st)) decls.push(st);
    else if (ts.isVariableStatement(st)) for (const d of st.declarationList.declarations) decls.push(d);
    // 类宿主（`panel-renderer.ts`）：直系候选就是**方法** —— `--method-form` 能把它们外迁成
    // 同名顶层函数、类侧原地留转发薄成员。属性 / 访问器 / 构造器不列入（不能整体搬运）。
    else if (ts.isClassDeclaration(st)) {
      classHosts++;
      for (const m of st.members) if (ts.isMethodDeclaration(m)) decls.push(m);
    }
  }
  console.log(`巨型宿主：${hostName(big)}；直系声明 ${decls.length} 个${classHosts ? `（含 ${classHosts} 个类的全部方法）` : ""}`);
  if (classHosts) console.log("  ℹ 方法候选：用 --method-form 搬运（--names= 给方法名；报告里的名字已还原成方法名）");
  const rows = [];
  for (const d of decls) {
    const { out, unresolved } = freeRefs(d);
    let sibs = 0, muts = 0, outs = 0, tops = 0;
    const mutNames = [];
    for (const decl of out.keys()) {
      const sc = scopeOf(decl);
      // 宿主 = 文件顶层时，其它顶层声明就是「兄弟」（原来会被算成 tops，成本只剩 unp 一项 → 低估）
      if (sc === big || (fileHost && ts.isSourceFile(sc))) {
        sibs++;
        if (isMutableDecl(decl)) { muts++; mutNames.push(nameOf(decl)); }
      } else if (ts.isSourceFile(sc)) tops++;
      else outs++;
    }
    rows.push({
      name: nameOf(d), size: lineEnd(d) - lineOf(d) + 1, line: lineOf(d),
      sibs, muts, mutNames, outs, tops, unp: unresolved.size,
    });
  }
  const cost = (r) => r.muts * 1000 + r.outs * 100 + r.sibs * 10 + r.unp;
  console.log(`\n${"行数".padStart(7)}${"兄弟".padStart(6)}${"可变".padStart(6)}${"外层".padStart(6)}${"顶层".padStart(6)}${"未解析".padStart(8)}${"成本".padStart(7)}  名字@行`);
  const listed = rows.filter((r) => r.size >= 50).sort((a, b) => cost(a) - cost(b));
  for (const r of listed.slice(0, 40)) {
    console.log(`${String(r.size).padStart(7)}${String(r.sibs).padStart(6)}${String(r.muts).padStart(6)}${String(r.outs).padStart(6)}${String(r.tops).padStart(6)}${String(r.unp).padStart(8)}${String(cost(r)).padStart(7)}  ${r.name}@${r.line}${r.mutNames.length ? "  可变:" + r.mutNames.join(",") : ""}`);
  }
  console.log(`\n≥50 行的直系声明 ${listed.length} 个；总行数 ${rows.reduce((a, r) => a + r.size, 0)}（宿主 ${lineEnd(big) - lineOf(big) + 1} 行）`);
} else if (seedsArg.length) {
  const seedNodes = allFns.filter((n) => seedsArg.includes(nameOf(n)));
  if (!seedNodes.length) { console.error(`找不到：${seedsArg.join(", ")}`); process.exit(1); }
  for (const seed of seedNodes) {
    const { out, imports, unresolved } = freeRefs(seed);
    const seedScope = scopeOf(seed);
    const chain = [];
    let h = seed;
    while (h && !ts.isSourceFile(h)) { chain.push(hostLabel(h)); h = scopeOf(h); }
    console.log(`\n=== ${nameOf(seed)}：第 ${lineOf(seed)}~${lineEnd(seed)} 行（${lineEnd(seed) - lineOf(seed) + 1} 行）`);
    console.log(`  宿主链（内→外）：${chain.join(" ← ")} → <文件顶层>`);
    const groups = { sib: [], outer: [], top: [] };
    for (const [decl, e] of out) {
      const sc = scopeOf(decl);
      const entry = { ...e, decl, host: hostLabel(sc), mutable: isMutableDecl(decl) };
      if (sc === seedScope) groups.sib.push(entry);
      else if (ts.isSourceFile(sc)) groups.top.push(entry);
      else groups.outer.push(entry);
    }
    const withMut = (a) => `${a.length}（可变 ${a.filter((x) => x.mutable).length}）`;
    console.log(`  自由引用：import ${imports.size}、同宿主兄弟 ${withMut(groups.sib)}、外层宿主 ${withMut(groups.outer)}、文件顶层 ${groups.top.length}、未解析/全局 ${unresolved.size}`);
    const dump = (label, arr, withHost) => {
      if (!arr.length) return;
      console.log(`  [${label}]`);
      for (const x of arr.sort((a, b) => b.count - a.count)) {
        console.log(`    ${String(x.count).padStart(4)}×  ${x.mutable ? "[可变] " : "      "}${x.name}  @${lineOf(x.decl)}${withHost ? "  " + x.host : ""}`);
      }
    };
    dump("同宿主兄弟", groups.sib, false);
    dump("外层宿主", groups.outer, true);
    dump("文件顶层", groups.top, false);
    if (unresolved.size) console.log(`  [未解析/全局] ${[...unresolved.keys()].join(", ")}`);
    console.log(`  import 名：${[...imports.keys()].join(", ") || "（无）"}`);

    const chosen = new Set([seed]);
    const queue = [seed];
    const residual = new Map();
    while (queue.length) {
      const cur = queue.pop();
      const curScope = scopeOf(cur);
      for (const [decl, e] of freeRefs(cur).out) {
        const sc = scopeOf(decl);
        const fnLike = isFn(decl) || (ts.isVariableDeclaration(decl) && decl.initializer
          && (ts.isArrowFunction(decl.initializer) || ts.isFunctionExpression(decl.initializer)));
        if (sc === curScope && fnLike && !chosen.has(decl)) { chosen.add(decl); queue.push(decl); continue; }
        const prev = residual.get(decl) ?? {
          name: e.name, count: 0, mutable: isMutableDecl(decl), host: hostLabel(sc), line: lineOf(decl),
        };
        prev.count += e.count;
        residual.set(decl, prev);
      }
    }
    const spans = [...chosen].map((n) => [lineOf(n), lineEnd(n), nameOf(n)]).sort((a, b) => a[0] - b[0]);
    console.log(`\n  —— 同宿主函数闭包展开：${chosen.size} 个声明 / ${spans.reduce((a, s) => a + (s[1] - s[0] + 1), 0)} 行（区间 ${spans[0][0]}~${spans[spans.length - 1][1]}）`);
    for (const [a, b, n] of spans) console.log(`     ${String(a).padStart(6)}~${String(b).padStart(6)}  ${String(b - a + 1).padStart(6)} 行  ${n}`);
    const res = [...residual.values()].sort((a, b) => b.count - a.count);
    console.log(`  —— 残留外部依赖 ${res.length} 个（可变 ${res.filter((x) => x.mutable).length} 个）—— 搬走后必须显式传入或顺带处理：`);
    for (const r of res) console.log(`     ${String(r.count).padStart(4)}×  ${r.mutable ? "[可变] " : "      "}${r.name}  @${r.line}  ${r.host}`);
    console.log("\n  提示：闭包在这类单体里几乎必然吃掉整文件 —— 现实做法是「显式传参」，看上面的残留清单，别指望闭包闭合。");
  }
} else {
  console.error("请给一个模式：--list / --rank / --seeds=a,b");
  process.exit(2);
}
