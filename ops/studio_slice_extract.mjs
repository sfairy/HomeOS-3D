#!/usr/bin/env node
/**
 * Studio 单体切片搬运执行器：studio_slice_analyze.mjs 挑出候选后，把切片真的搬出去。
 *
 * 搬一个函数分四步：① 按 AST 精确切走声明（含 --also 助手）；② 目标文件重建 import 并按目标目录
 * 重算相对路径；③ 源文件原位置插回同名 import（调用点零改写）；④ 把残留自由引用列成清单待显式传参。
 * 本脚本只做这四步与报告，不猜业务。
 *
 * 用法：
 *   node ops/studio_slice_extract.mjs --file=<源> --out=<目标> --names=fnA[,fnB] [--also=helper] [--apply]
 *   --range=START-END   按行区间搬一条完整语句（区间须正好框住一条语句）
 *   --method-form       把 class 方法外迁成同名顶层函数，类侧留转发薄成员
 *   --header=...        目标文件不存在时的文件头注释
 *   缺省 dry-run。退出码：0 正常；1 声明问题；2 参数错。
 */
import ts from "typescript";
import fs from "node:fs";
import path from "node:path";

function parseArgs(argv) {
  const opts = { also: [], names: [], header: null, rename: [], apply: false, range: null };
  for (const raw of argv) {
    if (raw === "--apply") opts.apply = true;
    else if (raw === "--force") opts.force = true;
    else if (raw === "--method-form") opts.methodForm = true;
    else if (raw === "--whole-statement") opts.wholeStatement = true;
    else if (raw.startsWith("--max-lines=")) opts.maxLines = raw.slice(12);
    else if (raw.startsWith("--file=")) opts.file = raw.slice(7);
    else if (raw.startsWith("--out=")) opts.out = raw.slice(6);
    else if (raw.startsWith("--names=")) opts.names = raw.slice(8).split(",").filter(Boolean);
    else if (raw.startsWith("--range=")) opts.range = raw.slice(8);
    else if (raw.startsWith("--also=")) opts.also = raw.slice(7).split(",").filter(Boolean);
    else if (raw.startsWith("--header=")) opts.header = raw.slice(9).replace(/\\n/g, "\n");
    else if (raw.startsWith("--rename="))
      opts.rename = raw
        .slice(9)
        .split(",")
        .filter(Boolean)
        .map((pair) => {
          const [from, to] = pair.split("=");
          if (!from || !to) {
            console.error(`--rename 需要 old=new 形式：${pair}`);
            process.exit(2);
          }
          return { from, to };
        });
    else {
      console.error(`未知参数：${raw}`);
      process.exit(2);
    }
  }
  if (!opts.file || !opts.out || (!opts.names.length && !opts.also.length && !opts.range)) {
    console.error(
      "用法：node ops/studio_slice_extract.mjs --file=<源> --out=<目标> (--names=fnA[,fnB] | --range=START-END) [--also=helper] [--header=...] [--apply]",
    );
    process.exit(2);
  }
  return opts;
}

const opts = parseArgs(process.argv.slice(2));
const src = fs.readFileSync(opts.file, "utf8");
const options = { target: ts.ScriptTarget.ESNext, noResolve: true, experimentalDecorators: true };
const program = ts.createProgram([opts.file], options, {
  ...ts.createCompilerHost(options),
  fileExists: (f) => f === opts.file,
  readFile: (f) => (f === opts.file ? src : undefined),
});
const checker = program.getTypeChecker();
const sf = program.getSourceFile(opts.file);

const parentMap = new Map();
(function walk(n) {
  ts.forEachChild(n, (c) => {
    parentMap.set(c, n);
    walk(c);
  });
})(sf);
const parentOf = (n) => parentMap.get(n);

const isFn = (n) => n && (ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n) || ts.isArrowFunction(n) || ts.isMethodDeclaration(n));
const hostOf = (n) => {
  let c = n;
  while (c) {
    if (isFn(c) || ts.isSourceFile(c)) return c;
    c = parentOf(c);
  }
  return sf;
};
const scopeOf = (n) => hostOf(parentOf(n));
const lineOf = (n) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
const declName = (node) => {
  if (ts.isVariableDeclaration(node)) return node.name.getText(sf);
  if (node.name && ts.isIdentifier(node.name)) return node.name.text;
  return null;
};

// ------------------------------------------------------------------ 源文件 import 索引
/** local 名 → { module, imported, typeOnly }；重建目标 import 用。 */
const importIndex = new Map();
for (const st of sf.statements) {
  if (!ts.isImportDeclaration(st) || !st.importClause) continue;
  const module = st.moduleSpecifier.text;
  const clause = st.importClause;
  if (clause.name) importIndex.set(clause.name.text, { module, imported: "default", typeOnly: clause.isTypeOnly });
  const b = clause.namedBindings;
  if (b && ts.isNamespaceImport(b)) importIndex.set(b.name.text, { module, imported: "*", typeOnly: clause.isTypeOnly });
  if (b && ts.isNamedImports(b))
    for (const e of b.elements)
      importIndex.set(e.name.text, {
        module,
        imported: e.propertyName ? e.propertyName.text : e.name.text,
        typeOnly: clause.isTypeOnly || e.isTypeOnly,
      });
}

// ------------------------------------------------------------------ 定位要搬的声明
/**
 * 方法形态（`--method-form`）用的成员名：`name()` / `["name"]()` 都还原成 `name`。
 * 计算名里套表达式（`[x + y]()`）与非法标识符（`["a-b"]()`）会让「外迁成同名函数」这一步
 * 无从下手 —— 返回不可用标记，由调用方硬失败，不猜。
 */
const memberName = (m) => {
  const n = m.name;
  if (!n) return null;
  if (ts.isIdentifier(n) || ts.isStringLiteral(n) || ts.isNumericLiteral(n)) return n.text;
  if (ts.isComputedPropertyName(n)) {
    const e = n.expression;
    if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e) || ts.isNumericLiteral(e)) return e.text;
    return null;
  }
  return null;
};
const allDecls = [];
if (opts.methodForm) {
  // 方法形态：只收 class 方法（不收顶层声明）—— 混在一起会让同名冲突判定失去意义。
  (function collectMethods(node) {
    if (ts.isClassDeclaration(node)) for (const m of node.members) if (ts.isMethodDeclaration(m)) allDecls.push({ node: m, name: memberName(m), method: true, owner: node.name ? node.name.text : null });
    ts.forEachChild(node, collectMethods);
  })(sf);
} else {
  (function collect(node) {
    if (ts.isFunctionDeclaration(node)) allDecls.push({ node, name: node.name ? node.name.text : null });
    else if (ts.isVariableStatement(node))
      for (const d of node.declarationList.declarations) allDecls.push({ node: d, name: declName(d) });
    ts.forEachChild(node, collect);
  })(sf);
}
const byName = new Map();
for (const d of allDecls)
  if (d.name) {
    if (!byName.has(d.name)) byName.set(d.name, []);
    byName.get(d.name).push(d);
  }

const picked = [];
for (const name of [...opts.names, ...opts.also]) {
  const hits = byName.get(name) ?? [];
  if (!hits.length) {
    console.error(`✗ 找不到声明：${name}`);
    process.exit(1);
  }
  if (hits.length > 1) {
    console.error(`✗ 声明 ${name} 出现 ${hits.length} 次（行 ${hits.map((h) => lineOf(h.node)).join(", ")}），不自动判定。`);
    process.exit(1);
  }
  if (picked.some((p) => p.name === name)) continue;
  picked.push(hits[0]);
}
/**
 * 多声明语句（`const a = ..., b = ...;`）没法只搬其中一条 —— 搬出去会留 `const ;` 语法碎片。
 * `--whole-statement` 把同语句的其余声明一并纳入切片（整条搬走），并把它们的名字也加进回引，
 * 这样调用点绑定保持不变。纯数据表（metadata）常这么写，是单体里最划算的一类。
 */
if (opts.wholeStatement) {
  const stmtOf = (dn) => {
    let st = parentOf(dn);
    while (st && !ts.isVariableStatement(st)) st = parentOf(st);
    return st;
  };
  const extra = [];
  for (const p of picked) {
    if (!ts.isVariableDeclaration(p.node)) continue;
    const st = stmtOf(p.node);
    if (!st || st.declarationList.declarations.length < 2) continue;
    for (const d of st.declarationList.declarations) {
      const dn = declName(d);
      if (!dn || picked.some((x) => x.name === dn) || extra.some((x) => x.name === dn)) continue;
      extra.push({ node: d, name: dn });
    }
  }
  if (extra.length) console.log(`   ℹ --whole-statement：并入同语句声明 ${extra.map((e) => e.name).join(", ")}`);
  picked.push(...extra);
}
picked.sort((a, b) => a.node.getStart(sf) - b.node.getStart(sf));
const inside = new Set(picked.map((p) => p.name).filter(Boolean));
/**
 * 方法形态：模块签名要写 `self: <宿主类名>`，所以先把每个方法挂到它所属的**具名 class** 上。
 * 匿名 class / 类表达式里取不到名字，直接判参数错（不猜）。
 */
for (const p of picked) {
  if (!p.method) continue;
  const cls = parentOf(p.node);
  if (!cls || !ts.isClassDeclaration(cls) || !cls.name) {
    console.error("✗ --method-form 只支持具名 class 声明里的方法");
    process.exit(2);
  }
  p.owner = cls.name.getText(sf);
}

/**
 * `--range=START-END`：语句级切片。`--names` 只认函数 / 变量声明，而单体里成片的余量是**语句**
 * （事件注册、批量 `querySelectorAll` 循环注册）—— 它们没有名字，只能按行区间指定。
 *
 * 这里多一道 `--names` 没有的对账：**区间必须正好框住一条语句**。判据是「区间起止行与某条 statement
 * 的 AST 起止行完全一致」。没有这道对账，`--force`（为了 400 行上限而必须加）会把「跨语句误框」
 * 一起放过去 —— 而跨语句误框正是 6j 踩过的坑（会把中间的 `import` / 嵌套局部名一起拖走）。
 */
if (opts.range) {
  const m = /^(\d+)-(\d+)$/.exec(opts.range.trim());
  const startLine = m ? Number(m[1]) : NaN;
  const endLine = m ? Number(m[2]) : NaN;
  if (!m || !(startLine >= 1) || !(endLine >= startLine)) {
    console.error(`✗ --range 需要 START-END（1-based、含端点、START ≤ END）：${opts.range}`);
    process.exit(2);
  }
  const lineCount = sf.getLineStarts().length;
  if (endLine > lineCount) {
    console.error(`✗ --range 结束行 ${endLine} 超出文件（共 ${lineCount} 行）`);
    process.exit(2);
  }
  const lineAt = (node) => sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
  const endLineAt = (node) => sf.getLineAndCharacterOfPosition(node.getEnd()).line + 1;
  const matches = [];
  (function collect(n) {
    if (lineAt(n) === startLine && endLineAt(n) === endLine && ts.isStatement(n)) matches.push(n);
    ts.forEachChild(n, collect);
  })(sf);
  if (!matches.length) {
    console.error(
      `✗ 行 ${startLine}~${endLine} 没有正好对上**一条语句**的边界 —— 语句级切片必须整条框住（用 --names 的清单里的起止行，或用 AST 复量）。`,
    );
    process.exit(1);
  }
  // 同一区间可能同时命中外层语句与内层语句（如 `if (…) stmt;`）：取最外层，那才是「一条语句」。
  const span = endLine - startLine;
  const stmt = matches.find((n) => endLineAt(n) - lineAt(n) === span) ?? matches[0];
  console.log(`   ℹ --range：命中 ${ts.SyntaxKind[stmt.kind]} ${startLine}~${endLine}（${span + 1} 行）`);
  picked.push({ node: stmt, name: null, label: `@stmt:${startLine}-${endLine}`, rangeSlice: true });
  picked.sort((a, b) => a.node.getStart(sf) - b.node.getStart(sf));
}

// ------------------------------------------------------------------ 自由引用（复用分析器口径）
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
  return true;
}
const addPattern = (x, into) => {
  if (ts.isIdentifier(x)) into.add(x.text);
  ts.forEachChild(x, (c) => addPattern(c, into));
};

/**
 * 深解析标识符指向的**真实声明**。
 *
 * 坑（已踩过，勿删）：`checker.getSymbolAtLocation` 对**简写属性**（`{ foo }`）返回的是
 * ShorthandPropertyAssignment 本身，而不是 `foo` 的外层绑定。于是「`context = { foo }`」
 * 这种把闭包变量塞进对象的写法会被当成「自己引用自己」，全部闭包捕获被静默吞掉 ——
 * 提取器报「无残留依赖」，切出去的文件引用未定义名，只有 typecheck 兜底。
 * 简写属性必须走 `getShorthandAssignmentValueSymbol` 才能拿到被引用的变量。
 */
function resolveDecl(id) {
  const p = parentOf(id);
  const sym = ts.isShorthandPropertyAssignment(p)
    ? (checker.getShorthandAssignmentValueSymbol(p) ?? checker.getSymbolAtLocation(id))
    : checker.getSymbolAtLocation(id);
  return sym?.valueDeclaration ?? sym?.declarations?.[0] ?? null;
}

function freeRefs(node) {
  const local = new Set();
  (function collect(n) {
    if (isFn(n)) {
      for (const p of n.parameters) addPattern(p.name, local);
      // 只把**真正的函数绑定**当本地名（递归自引用）。方法 / 访问器的名字是属性键，
      // 不是绑定 —— 把 `get activeProject(){}` 的 activeProject 记成 local，会让函数体里
      // 对该闭包变量的引用被静默吞掉（context 对象就是这么写的）。
      if (n.name && ts.isIdentifier(n.name) && (ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n)))
        local.add(n.name.text);
    }
    if (ts.isVariableDeclaration(n)) addPattern(n.name, local);
    if (ts.isClassDeclaration(n) && n.name) local.add(n.name.text);
    if (ts.isCatchClause(n) && n.variableDeclaration) addPattern(n.variableDeclaration.name, local);
    ts.forEachChild(n, collect);
  })(node);

  const imports = new Map();
  const external = new Map();
  const unresolved = new Map();
  const s = node.getStart(sf);
  const e = node.getEnd();
  (function walk(n) {
    if (ts.isIdentifier(n) && isReference(n) && !local.has(n.text)) {
      if (importIndex.has(n.text)) imports.set(n.text, (imports.get(n.text) ?? 0) + 1);
      else {
        const decl = resolveDecl(n);
        if (decl && decl.getSourceFile() === sf && !(decl.getStart(sf) >= s && decl.getEnd() <= e)) {
          const prev = external.get(n.text);
          external.set(n.text, { name: n.text, line: lineOf(decl), count: (prev?.count ?? 0) + 1 });
        } else if (!decl) unresolved.set(n.text, (unresolved.get(n.text) ?? 0) + 1);
      }
    }
    ts.forEachChild(n, walk);
  })(node);
  return { imports, external, unresolved };
}

const allImports = new Map();
const residual = new Map();
const globals = new Map();
for (const p of picked) {
  const { imports, external, unresolved } = freeRefs(p.node);
  for (const [k, v] of imports) allImports.set(k, (allImports.get(k) ?? 0) + v);
  for (const [k, v] of external) {
    if (inside.has(k)) continue;
    const prev = residual.get(k);
    residual.set(k, { ...v, count: (prev?.count ?? 0) + v.count });
  }
  for (const [k, v] of unresolved) globals.set(k, (globals.get(k) ?? 0) + v);
}

// ------------------------------------------------------------------ 目标 import 块
function toSpecifier(fromDir, toPath) {
  let rel = path.relative(fromDir, toPath).split(path.sep).join("/");
  if (!rel.startsWith(".")) rel = "./" + rel;
  return rel;
}
/** 相对 → 目标目录；别名 / 绝对 URL 原样保留。 */
const renameMap = new Map(opts.rename.map((r) => [r.from, r.to]));
const renamed = (text) => {
  let out = text;
  for (const [from, to] of renameMap) out = out.replace(new RegExp(`\\b${from.replace(/[$]/g, "\\$")}\\b`, "g"), to);
  return out;
};
/**
 * 同目录搬运时**原样保留** specifier。
 *
 * 坑（已踩过，勿删）：`resolve()` 只做路径归并，不解析「文件 vs 目录」歧义 —— `"../renderer"`
 * 可能指 `renderer.ts`，也可能指 `renderer/index.ts`。归并后若相对路径为空，说明目标目录没变，
 * 原 specifier 一定仍成立；重写只会把它算成 `"./"`（TS 里是「当前目录的 index」）——
 * 实测把 `import type { PanelRenderer } from "../renderer"` 写成 `"./"`，只有 typecheck 能抓。
 */
const remapSpecifier = (spec) => {
  if (spec.startsWith("/") || spec.startsWith("@/") || !spec.startsWith(".")) return spec;
  const rel = toSpecifier(path.dirname(opts.out), path.resolve(path.dirname(opts.file), spec));
  return rel === "./" ? spec : rel;
};

const groups = new Map();
for (const original of [...allImports.keys()].sort()) {
  const info = importIndex.get(original);
  const local = renameMap.get(original) ?? original;
  const module = remapSpecifier(info.module);
  if (!groups.has(module)) groups.set(module, { value: new Map(), typeOnly: new Map(), namespace: new Map() });
  const g = groups.get(module);
  if (info.imported === "*") g.namespace.set(local, local);
  else {
    const spec = info.imported === local ? local : `${info.imported} as ${local}`;
    (info.typeOnly ? g.typeOnly : g.value).set(spec, spec);
  }
}
const importBlock = [];
for (const [module, g] of groups) {
  for (const local of g.namespace.values()) importBlock.push(`import * as ${local} from "${module}";`);
  if (g.value.size) importBlock.push(`import { ${[...g.value.values()].join(", ")} } from "${module}";`);
  if (g.typeOnly.size) importBlock.push(`import type { ${[...g.typeOnly.values()].join(", ")} } from "${module}";`);
}
/**
 * 方法形态：模块签名里的 `self: <宿主类>` 需要**类型 import 回来**（正文自己不会引用类名，
 * 所以自由引用扫描看不到它）。同目录搬运时 specifier 就是宿主文件名本身，不存在「文件 vs 目录」
 * 歧义，直接用 `toSpecifier` 的结果。
 */
for (const owner of new Set(picked.filter((p) => p.method).map((p) => p.owner))) {
  if (allImports.has(owner)) continue;
  const spec = toSpecifier(path.dirname(opts.out), path.resolve(path.dirname(opts.file), path.basename(opts.file).replace(/\.[^.]+$/, "")));
  importBlock.push(`import type { ${owner} } from "${spec}";`);
}

// ------------------------------------------------------------------ 切 / 贴
/**
 * 声明节点 + 其后换行 + 紧邻的前置注释，避免源文件留孤行。
 *
 * 坑（已踩过，勿删）：注释匹配必须**窗口化 + 限行数**。正则 `(?:^|\n)...[\s\S]*?\*\/` 是
 * 「最左匹配」而非「最短匹配」—— 当声明自带 doc 注释时，引擎会从**几千行之前**的另一段
 * `/**` 开始匹配，一路吃到本声明前的 `*\/`，于是「切一个 56 行函数」变成「切掉 2600 行」。
 * 所以只在声明前 LOOKBACK 字符内找注释，且注释超过 MAX_LEAD_COMMENT_LINES 行就判定为误匹配。
 */
/**
 * 切片的**搬运单位**：单声明语句（`const x = ...;`）要整条搬走，只搬 declarator 会在源文件留
 * `const ;` 这种语法碎片；多声明语句（`const a = ..., b = ...;`）没法整条搬，只能搬 declarator
 * 并在护栏里提醒。函数声明本身就是完整单位。
 */
function spanNodeOf(node) {
  if (!ts.isVariableDeclaration(node)) return node;
  let statement = parentOf(node);
  while (statement && !ts.isVariableStatement(statement)) statement = parentOf(statement);
  if (statement && (opts.wholeStatement || statement.declarationList.declarations.length === 1)) return statement;
  return node;
}

const LEAD_LOOKBACK = 1200;
const MAX_LEAD_COMMENT_LINES = 12;
function spanOf(node) {
  let start = node.getStart(sf);
  let end = node.getEnd();
  const winStart = Math.max(0, start - LEAD_LOOKBACK);
  const lead = src.slice(winStart, start);
  const lm = lead.match(/\n[ \t]*(\/\*\*[\s\S]*?\*\/|\/\/[^\n]*)\n[ \t]*$/);
  /**
   * 必须确认匹配到的是**单条**注释。
   *
   * 坑（已踩过，勿删）：`/**` 与 `*\/` 之间用 `[\s\S]*?` 是「懒惰但可回溯」的 —— 当声明前的
   * 注释后面还有别的注释时，引擎会先试最近的 `*\/`（后面不是窗口末尾，失败），再一路扩到**更远**的
   * `*\/`，于是把两条注释（甚至夹着中间那段代码）当成一条「前置注释」吞进切片：
   * `doorMaterialFields` 的注释 + 函数体 + 下一条注释被算成 `normalizeMaterialSurfaceOverrides`
   * 的前置注释，切片起点直接越过上一条函数。行数护栏（≤12 行）挡不住这种短跨度的多注释拼接，
   * 所以这里显式拒绝「注释正文里还含 `*\/` 或 `/*`」的匹配。
   */
  const inner = lm && lm[1].startsWith("/**") ? lm[1].slice(3, -2) : (lm?.[1] ?? "");
  const singleComment = lm && !inner.includes("*/") && !inner.includes("/*");
  if (singleComment && lm[1].split("\n").length <= MAX_LEAD_COMMENT_LINES)
    start = winStart + lm.index + lm[0].indexOf(lm[1]);
  const tail = src.slice(end).match(/^[ \t]*(?:\r?\n|$)/);
  if (tail) end += tail[0].length;
  return { start, end };
}

/**
 * 搬走的正文必须变成 `export` 的：源文件里的直系声明都是**内部**函数。
 * 函数声明直接前置 `export `；变量声明插在 `const/let` 前（多声明语句会改变导出面，单独告警）。
 */
function withExport(node, text) {
  if (/^\s*export\b/.test(text)) return text;
  if (ts.isFunctionDeclaration(node)) return text.replace(/^([ \t]*)/, "$1export ");
  if (ts.isVariableDeclaration(node)) {
    let statement = parentOf(node);
    while (statement && !ts.isVariableStatement(statement)) statement = parentOf(statement);
    if (statement && statement.declarationList.declarations.length > 1 && !opts.wholeStatement)
      console.log(`   ⚠ ${declName(node)} 与同语句的其他声明共用 const/let，已整体导出（确认导出面）。`);
    return text.replace(/^([ \t]*)(const|let|var)\b/, "$1export $2");
  }
  return text;
}

// ------------------------------------------------------------------ 方法形态（--method-form）
/**
 * `class X { ["render"]() {…} }` 这类**类方法**外迁成同名顶层函数的全部文本部件。
 *
 * 形态（左右两块要一起看）：
 *   模块侧  `export function render(self: X) { …（正文里 `this.` → `self.`）… }`
 *   宿主侧  `["render"]() { return render(this); }` ← 方法名写法 / 修饰符 / 形参列表 / 返回类型
 *                                                   逐字保留（仅去首尾空白），所以类自己的
 *                                                   `interface` 合并面一点没动，tsc 会替我们核对
 *                                                  签名是否仍然吻合。
 *
 * 为什么留薄成员、而不是「删成员 + `Object.assign(proto, …)`」：assign 那条路漏一个名字 tsc
 * 一声不吭（`panel-renderer.ts` 里已有的两个 `Object.assign` 就是这种），而薄成员会跟着类一起
 * 被类型检查。代价是每个方法在类侧留 ~1 行。
 *
 * 硬失败（不猜，宁可调用方手工处理）：方法名不是合法标识符、`static`、生成器、泛型方法、
 * 形参解构、正文里出现多态 `this` 类型或 `super`。
 */
/** 方法形态的硬失败出口：把 `throw` 收成一行干净的错误 + 退出码 1（不吐栈）。 */
function guard(fn) {
  try {
    return fn();
  } catch (err) {
    console.error(`\n✗ ${err.message}`);
    process.exit(1);
  }
}
function methodParts(m) {
  const name = memberName(m);
  if (!name || !/^[A-Za-z_$][\w$]*$/.test(name))
    throw new Error(`方法名 ${name ?? "(计算名表达式)"} 不是合法标识符，无法外迁成同名函数`);
  const mods = m.modifiers ?? [];
  if (mods.some((x) => x.kind === ts.SyntaxKind.StaticKeyword)) throw new Error(`方法 ${name} 是 static —— this 语义不同，手工处理`);
  if (m.asteriskToken) throw new Error(`方法 ${name} 是生成器 —— 外迁会改变迭代器语义，手工处理`);
  if (m.typeParameters?.length) throw new Error(`方法 ${name} 带泛型参数 —— 手工处理`);
  const parenStart = src.indexOf("(", m.name.getEnd());
  if (parenStart < 0) throw new Error(`方法 ${name} 找不到形参列表`);
  const last = m.parameters.length ? m.parameters[m.parameters.length - 1] : null;
  const parenEnd = src.indexOf(")", last ? last.getEnd() : parenStart);
  if (parenEnd < 0) throw new Error(`方法 ${name} 形参列表括号不闭合`);
  const bodyStart = m.body.getStart(sf);
  return {
    name,
    paramsInner: src.slice(parenStart + 1, parenEnd).trim(),
    returnType: src.slice(parenEnd + 1, bodyStart),
    bodyText: src.slice(bodyStart, m.end),
    isAsync: mods.some((x) => x.kind === ts.SyntaxKind.AsyncKeyword),
  };
}
/** 实例参数名：正文里已有同名绑定就换下一个（改名比改写可靠）。 */
function pickInstanceParam(bodyText, name) {
  const cands = ["self", "instance", "renderer", "panelRenderer"];
  const hit = cands.find((c) => !new RegExp(`\\b${c}\\b`).test(bodyText));
  if (!hit) throw new Error(`方法 ${name} 正文里 ${cands.join(" / ")} 全被占用 —— 换个候选或手工处理`);
  return hit;
}
/** 正文里 `this` → 实例参数。**跳过非箭头函数内部**：那里的 `this` 是它自己的接收者。 */
function rewriteThisIn(bodyText, param) {
  const parsed = ts.createSourceFile("method-body.ts", bodyText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const at = [];
  let sawThisType = false;
  let sawSuper = false;
  (function walk(n, nested) {
    if (ts.isThisTypeNode(n)) sawThisType = true;
    if (n.kind === ts.SyntaxKind.SuperKeyword) sawSuper = true;
    if (ts.isThis(n) && !nested) at.push({ pos: n.getStart(parsed), end: n.getEnd() });
    const inner = nested || (isFn(n) && !ts.isArrowFunction(n));
    ts.forEachChild(n, (c) => walk(c, inner));
  })(parsed, false);
  if (sawThisType) throw new Error("正文里出现多态 `this` 类型 —— 外迁会改变语义，手工处理");
  if (sawSuper) throw new Error("正文里出现 `super` —— 顶层函数里没有超类，手工处理");
  let out = bodyText;
  for (const sp of at.sort((a, b) => b.pos - a.pos)) out = out.slice(0, sp.pos) + param + out.slice(sp.end);
  return out;
}
function methodModuleText(s) {
  const part = methodParts(s.node);
  const self = pickInstanceParam(part.bodyText, part.name);
  const body = rewriteThisIn(part.bodyText, self);
  // 形参**默认值**里也会有 `this`（`closeRuntimeDialog(target = this.detailsDialog)`）—— 类外迁时
  // 会变成「顶层函数里用 this」的 TS2683。形参片段单独跑一遍改写（片段本身按表达式解析即可，
  // `this` 在片段里仍是 ThisExpression 节点）。
  const params = part.paramsInner ? rewriteThisIn(part.paramsInner, self) : "";
  const inner = params ? `${self}: ${s.owner}, ${params}` : `${self}: ${s.owner}`;
  return `export ${part.isAsync ? "async " : ""}function ${part.name}(${inner})${part.returnType}${body}`.replace(/\s+$/, "\n");
}
/**
 * 转发实参名：形参是**解构模式**（`showX({ preview = false }: Options = {})` —— 这类
 * 面板方法的主流入参形态）时，类侧没法把模式原样传下去（模式不能当实参），只能起一个临时名
 * 转交，把解构与默认值留在模块函数的形参里（那里签名逐字保留，语义不变）。
 * 临时名必须避开正文里已有的标识符，否则漏进正文会静默改名。
 */
function pickFreeName(bodyText, base) {
  for (let i = 0; ; i++) {
    const cand = `${base}${i === 0 ? "" : i}`;
    if (!new RegExp(`\\b${cand}\\b`).test(bodyText)) return cand;
  }
}
/** 转发实参名与包装形参文本（逐参一一对应；简单标识符形参走原名原样转发）。 */
function forwardingParams(m, part) {
  const out = [];
  for (let i = 0; i < m.parameters.length; i++) {
    const p = m.parameters[i];
    if (ts.isIdentifier(p.name)) {
      out.push({ wrapperText: p.getText(sf), callArg: p.name.text });
      continue;
    }
    // 解构形参的**类型**：优先用显式标注；没有标注时（`showX({ preview = false })` —— 本类面板
    // 方法的常见形态）请 checker 把推断出来的对象类型打印出来，包进转发形参。
    // 打印结果落在**同一个源文件**里解析（类型名 / import 都已就位），一旦打印成不合法源码，
    // 后面的 assertParses 会当场拦下。
    const typeText = p.type
      ? src.slice(p.type.getStart(sf), p.type.getEnd())
      : (() => {
          const t = checker.getTypeAtLocation(p.name);
          const printed = t && checker.typeToString(t, undefined, ts.TypeFormatFlags.NoTruncation);
          if (!printed || printed === "any" || printed === "unknown")
            throw new Error(`方法 ${part.name} 的形参 ${p.name.getText(sf)} 是解构且推不出类型（${printed ?? "?"}）—— 手工处理`);
          return printed;
        })();
    const name = pickFreeName(part.bodyText, "arg");
    const optional = !!p.questionToken || !!p.initializer;
    const spread = p.dotDotDotToken ? "..." : "";
    out.push({ wrapperText: `${spread}${name}${optional ? "?" : ""}: ${typeText}`, callArg: `${spread}${name}` });
  }
  return out;
}
function methodWrapperText(s) {
  const m = s.node;
  const part = methodParts(m);
  const lineStarts = sf.getLineStarts();
  const indent = src.slice(lineStarts[sf.getLineAndCharacterOfPosition(m.getStart(sf)).line], m.getStart(sf));
  const mods = (m.modifiers ?? []).map((x) => x.getText(sf)).join(" ");
  const params = forwardingParams(m, part);
  return `${indent}${mods ? mods + " " : ""}${m.name.getText(sf)}(${params.map((p) => p.wrapperText).join(", ")})${part.returnType}{ return ${part.name}(${["this", ...params.map((p) => p.callArg)].join(", ")}); }`;
}

const rawSpans = picked.map((p) => {
  // 语句级切片用**声明区间逐字搬运**：`spanOf` 会顺手吃掉前置注释，而 `--range` 的语义是
  // 「我框住的就是搬走的」—— 差一行都要能对上，方便复核。
  //
  // 坑（已踩过，勿删）：起点必须**补齐到行首**。`node.getStart(sf)` 内部是 `skipTrivia(...)`，
  // 它会把语句的**首行缩进**一起吃掉 —— 顶层声明看不出问题（本来就该在 0 列），但语句是嵌在
  // 宿主函数体里的，丢缩进后搬进工厂正文会与后续行（保留原缩进）对不齐，`--range` 的「逐字」
  // 也就名不副实。所以这里用「首个 token 所在行的行首」当起点：既含缩进，又不吃上面的注释。
  const firstTokenLine = sf.getLineAndCharacterOfPosition(p.node.getStart(sf)).line;
  // 方法形态：注释**留在类里**（薄成员上方还要有它），所以起点取成员行首、不吃前置注释。
  const s = p.method
    ? { start: sf.getLineStarts()[firstTokenLine], end: p.node.getEnd() }
    : p.rangeSlice
      ? { start: sf.getLineStarts()[firstTokenLine], end: p.node.getEnd() }
      : spanOf(spanNodeOf(p.node));
  const lineAt = (offset) => sf.getLineAndCharacterOfPosition(offset).line + 1;
  if (p.rangeSlice || p.method) {
    const tail = src.slice(s.end).match(/^[ \t]*(?:\r?\n|$)/);
    if (tail) s.end += tail[0].length;
  }
  return { ...s, name: p.label ?? p.name, line: lineOf(p.node), startLine: lineAt(s.start), endLine: lineAt(s.end), node: p.node, rangeSlice: p.rangeSlice, method: p.method, owner: p.owner };
});
/**
 * `--whole-statement` 下，同语句的多个声明会指向**同一个** statement 区间 —— 按区间去重，
 * 否则护栏会把「同一单位的第二次出现」误判成区间重叠而拒绝执行。
 */
const spans = [];
for (const s of rawSpans) {
  const same = spans.find((u) => u.start === s.start && u.end === s.end);
  if (same) same.names.push(s.name);
  else spans.push({ ...s, names: [s.name] });
}
for (const s of spans) if (s.names.length > 1) s.name = s.names.join(" + ");
const movedText = renamed(
  spans
    .map((s) =>
      s.method
        ? guard(() => methodModuleText(s))
        : withExport(s.node, src.slice(s.start, s.end)).replace(/\s+$/, "\n"),
    )
    .join("\n"),
);
const movedLines = spans.reduce((a, s) => a + src.slice(s.start, s.end).split("\n").length, 0);

/**
 * 生成物**必须能被 TS 解析** —— 方法形态是「文本拼接」出来的（补 `self: X` 首参、`this` 改写、
 * 薄成员重排），拼接错位在 tsc 里会表现成「目标文件里的语法错误」，而不是「切片器的错」。
 * 先自查一遍：解析诊断非空就拒绝写盘。
 */
function assertParses(text, what) {
  const parsed = ts.createSourceFile(`${what}.ts`, text, ts.ScriptTarget.Latest, false, ts.ScriptKind.TS);
  const diags = parsed.parseDiagnostics ?? [];
  if (!diags.length) return;
  const at = parsed.getLineAndCharacterOfPosition(diags[0].start);
  console.error(
    `\n✗ ${what} 有语法错误（第 ${at.line + 1} 行第 ${at.character + 1} 列）—— 模板拼接错位，未写盘：\n   ${ts.flattenDiagnosticMessageText(diags[0].messageText, " ")}`,
  );
  process.exit(1);
}
assertParses(movedText, "目标正文");

// ---------------------------------------------------------------- 硬护栏（写盘前）
const MAX_SPAN_LINES = Number(opts.maxLines ?? 400);
const problems = [];
for (const s of spans) {
  const text = src.slice(s.start, s.end);
  const size = s.endLine - s.startLine + 1;
  if (size > MAX_SPAN_LINES)
    problems.push(
      s.rangeSlice
        ? `切片 ${s.name} 跨 ${size} 行（${s.startLine}~${s.endLine}，上限 ${MAX_SPAN_LINES}）—— --range 是你显式声明的区间，确认整条语句无误后加 --force`
        : `切片 ${s.name} 跨 ${size} 行（${s.startLine}~${s.endLine}，上限 ${MAX_SPAN_LINES}）——多半是注释/作用域被吃错，拒绝执行`,
    );
  let depth = 0;
  for (const ch of text) {
    if (ch === "{") depth++;
    else if (ch === "}") depth--;
    if (depth < 0) break;
  }
  if (depth !== 0) problems.push(`切片 ${s.name} 大括号不平衡（结余 ${depth}）——切片越过了声明边界`);
}
const byStart = [...spans].sort((a, b) => a.start - b.start);
for (let i = 1; i < byStart.length; i++)
  if (byStart[i].start < byStart[i - 1].end)
    problems.push(`切片 ${byStart[i - 1].name} 与 ${byStart[i].name} 区间重叠（${byStart[i - 1].startLine}~${byStart[i - 1].endLine} vs ${byStart[i].startLine}~${byStart[i].endLine}）`);
if (problems.length && !opts.force) {
  console.error("\n✗ 护栏拦截，未写盘：");
  for (const p of problems) console.error(`   - ${p}`);
  console.error("   （确认无误可加 --force，但先看 studio_slice_analyze.mjs 的成本列。）\n");
  process.exit(1);
}

const destExists = fs.existsSync(opts.out);
const destCurrent = destExists ? fs.readFileSync(opts.out, "utf8") : "";
const header = !destExists && opts.header ? opts.header.replace(/\s+$/, "") + "\n\n" : "";

/** 目标已存在时也要把 import 并进去：插在最末一条 import 之后（没有 import 就插在文件头注释之后）。 */
function insertImportsInto(text, lines) {
  if (!lines.length) return text;
  const block = lines.join("\n");
  const importMatches = [...text.matchAll(/^import\b.*?;$/gms)];
  if (importMatches.length) {
    const last = importMatches[importMatches.length - 1];
    const at = last.index + last[0].length;
    return text.slice(0, at) + "\n" + block + text.slice(at);
  }
  const lead = text.match(/^(?:\s*\/\*\*[\s\S]*?\*\/\s*\n)/);
  const at = lead ? lead[0].length : 0;
  return text.slice(0, at) + (at ? "" : "") + block + "\n\n" + text.slice(at);
}
const destNew = destExists
  ? insertImportsInto(destCurrent.replace(/\s*$/, "\n\n") + movedText, importBlock)
  : header + importBlock.join("\n") + (importBlock.length ? "\n\n" : "") + movedText;

const importSpec = toSpecifier(path.dirname(opts.file), path.resolve(opts.out.replace(/\.[^.]+$/, "")));
spans.sort((a, b) => a.start - b.start);
let srcNew = "";
let cursor = 0;
spans.forEach((s) => {
  srcNew += src.slice(cursor, s.start);
  // 方法形态：原地不删，换成一个转发薄成员（签名逐字保留，见 methodParts 注释）。
  // 「+ \n」不是装饰：`span.end` 已经**吃掉了该方法后面的换行**（见上面 rawSpans 的尾换行处理），
  // 所以薄成员必须自带一个换行，否则两个相邻方法的转发器会粘在同一行（语法合法、可读性归零）。
  if (s.method) srcNew += guard(() => methodWrapperText(s)) + "\n";
  cursor = s.end;
});
srcNew += src.slice(cursor);
/**
 * 源文件侧的**死导入清理**（与回引抑制不同，见下）。
 *
 * 坑（已踩过，勿删）：`--also` 助手或切片本体独占的 import 会留在源文件里成为死导入（lint 必红）。
 * 上面 `stillReferenced` 只管**回引**要不要带这些名字；源文件自己原有的 import 没人管 ——
 * 实测每片都会漏 2~5 条（如 `normalizeCameraSettings as normalizeCameraSettings2` 这种**别名**：
 * 别名只在被搬走的正文里出现，切走后就成了死名字）。
 *
 * 判据与回引同源但范围不同：把 srcNew 的所有 import 声明**挖空**（保留长度，便于沿用同一定位），
 * 再逐条 import 看本地名是否还在正文里出现；不出现即死导入。整条都没人用就删整条。
 * 字符串/注释里恰好出现同名只会**少删**（安全方向），多删不可能（正则按 `\b` 词边界）。
 */
function pruneDeadImports(sourceText) {
  const parsed = ts.createSourceFile("prune.ts", sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const importDecls = parsed.statements.filter((st) => ts.isImportDeclaration(st));
  if (!importDecls.length) return { text: sourceText, dropped: [] };
  const bodyChars = [...sourceText];
  for (const decl of importDecls) for (let i = decl.getStart(parsed); i < decl.getEnd(); i++) bodyChars[i] = " ";
  const bodyText = bodyChars.join("");
  const isUsed = (name) => new RegExp(`\\b${name.replace(/[$]/g, "\\$")}\\b`).test(bodyText);
  /**
   * 坑（已踩过，勿删）：**按 specifier 粒度抠文本**，不要「重建整条声明」。
   * 早期版本把声明按 `import { a, b } from "x"` 重建，结果源码里成片的多行 import
   * 被压成 800+ 字符的单行 —— 与 P4「逐字复制、零无关改动」的口径相悖（实测一次切片冲掉 225 行排版）。
   * 抠不掉（正则四种形态都没命中）时**宁可留着**并在报告里点名，交给 lint 兜底。
   */
  const dropSpecifier = (declText, specText) => {
    const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const S = `(?<![\\w$])${escape(specText)}(?![\\w$])`;
    const patterns = [
      new RegExp(`\\n[ \\t]*${S}[ \\t]*,[ \\t]*`, "g"),
      new RegExp(`,?[ \\t]*\\n[ \\t]*${S}(?=[ \\t]*\\n)`, "g"),
      new RegExp(`[ \\t]*${S}[ \\t]*,[ \\t]*`, "g"),
      new RegExp(`[ \\t]*,[ \\t]*${S}(?=[ \\t]*\\})`, "g"),
    ];
    for (const re of patterns) {
      const next = declText.replace(re, "");
      if (next !== declText) return next;
    }
    return null;
  };
  const dropped = [];
  const stuck = [];
  const edits = [];
  for (const decl of importDecls) {
    const clause = decl.importClause;
    if (!clause) continue; // 副作用 import（import "x"）不动
    const kept = [];
    const deadSpecs = [];
    if (clause.name) (isUsed(clause.name.text) ? kept : deadSpecs).push(clause.name.text);
    const bindings = clause.namedBindings;
    if (bindings && ts.isNamespaceImport(bindings)) {
      (isUsed(bindings.name.text) ? kept : deadSpecs).push(bindings.name.text);
    } else if (bindings) {
      for (const spec of bindings.elements)
        (isUsed(spec.name.text) ? kept : deadSpecs).push(spec);
    }
    if (!deadSpecs.length) continue;
    for (const s of deadSpecs) dropped.push(typeof s === "string" ? s : s.name.text);
    if (!kept.length) {
      // 整条都没人用了 → 连行删掉
      edits.push({ start: decl.getFullStart(), end: decl.getEnd(), text: "" });
      continue;
    }
    let text = decl.getText(parsed);
    for (const s of deadSpecs) {
      if (typeof s === "string") {
        stuck.push(s); // 默认 / 命名空间导入：名字在声明头，没法「抠 specifier」
        continue;
      }
      const next = dropSpecifier(text, s.getText(parsed));
      if (next === null) stuck.push(s.name.text);
      else text = next;
    }
    // 抠掉同行首项会留下 `import {beta }` 这种挤在一起的形态，单行花括号列表顺手抹平（多行排版不动）
    text = text.replace(/\{([^\n{}]*)\}/, (whole, inner) =>
      inner.includes("\n") ? whole : `{ ${inner.trim().replace(/\s*,\s*/g, ", ")} }`,
    );
    if (text !== decl.getText(parsed)) edits.push({ start: decl.getStart(parsed), end: decl.getEnd(), text });
  }
  let text = sourceText;
  for (const e of edits.sort((a, b) => b.start - a.start))
    text = text.slice(0, e.start) + e.text + text.slice(e.end);
  return { text, dropped: dropped.filter((n) => !stuck.includes(n)), stuck };
}
const pruned = pruneDeadImports(srcNew);
srcNew = pruned.text;
assertParses(srcNew, "源文件改写后");
/**
 * 回引只带**源文件里还在用**的名字。
 *
 * 坑（已踩过，勿删）：`--also` 的助手（如 `buildMaterialSignature`）常常只被切片本体使用，
 * 搬走后源文件的 import 就成了无人引用的死导入，lint 必红。判据是「切片移除后源码里是否仍出现
 * 该标识符」—— 出现即真调用点，不出现就是死导入，别回引。
 */
/**
 * 「源文件里还在用这个名字吗」必须按 **AST 引用位**判，不能用 `\b名字\b` 正则。
 *
 * 坑（已踩过，勿删）：正则会把 `this.connectRuntime()` 这种**属性名**当成引用（`\b` 只认词边界），
 * 于是给一个没人用的名字回引 `import { connectRuntime } from "./runtime-connect"` —— typecheck 过，
 * **lint 必红**（`@typescript-eslint/no-unused-vars`）。7b 第一刀实测命中。
 * 注意：这里必须用 `n.parent`（`parentOf` 的 map 只对源文件那棵树有效，对 `srcNew` 会全判 false →
 * 静默丢掉所有回引，只有 typecheck 兜底）。
 */
function referencedInHost(text, name) {
  const hostSf = ts.createSourceFile("host-rescan.ts", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  let hit = false;
  (function walk(n) {
    if (hit) return;
    if (ts.isIdentifier(n) && n.text === name) {
      const p = n.parent;
      const propName =
        (ts.isPropertyAccessExpression(p) && p.name === n) ||
        (ts.isPropertyAssignment(p) && p.name === n) ||
        (ts.isPropertySignature(p) && p.name === n) ||
        (ts.isMethodDeclaration(p) && p.name === n) ||
        ts.isBindingElement(p) ||
        ts.isImportSpecifier(p) ||
        ts.isExportSpecifier(p) ||
        ts.isNamespaceImport(p) ||
        ts.isImportClause(p) ||
        (ts.isVariableDeclaration(p) && p.name === n) ||
        (ts.isParameter(p) && p.name === n) ||
        (ts.isFunctionDeclaration(p) && p.name === n) ||
        (ts.isInterfaceDeclaration(p) && p.name === n);
      if (!propName) hit = true;
    }
    ts.forEachChild(n, walk);
  })(hostSf);
  return hit;
}
const stillReferenced = picked.filter((p) => p.name && referencedInHost(srcNew, p.name));
/**
 * 搬走的声明在源文件里是不是 `export` 的？决定回引形态：
 * - 普通内部名字 → `import { x } from "<target>"`（调用点零改写，靠名字不变）。
 * - `export function x` → 还要**转发导出面** `export { x } from "<target>"`。
 *
 * 为什么必须有这一条（真实踩点）：`panel-renderer-bulk-methods.ts` 被 `import * as bulkMethods`
 * 之后 `Object.assign(PanelRenderer.prototype, bulkMethods as any)`。回引若写成 `import`，
 * 被切走的方法就从命名空间对象里**消失**，而 `as any` 让 tsc 一声不吭 —— 运行期点开面板才炸。
 */
function hasExportModifier(node) {
  let st = node;
  while (st && !ts.isVariableStatement(st) && !ts.isFunctionDeclaration(st) && !ts.isClassDeclaration(st))
    st = parentOf(st);
  return (((st ?? node).modifiers ?? [])).some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
}
const reExported = picked.filter((p) => p.name && !p.method && hasExportModifier(p.node));
// re-export 不产生本地绑定，所以「还在用」的名字可以同时有 import 与 re-export，互不冲突。
const importLines = [];
if (stillReferenced.length)
  importLines.push(`import { ${stillReferenced.map((p) => p.name).join(", ")} } from "${importSpec}";`);
if (reExported.length)
  importLines.push(`export { ${reExported.map((p) => p.name).join(", ")} } from "${importSpec}";`);
const importStmt = importLines.length ? importLines.join("\n") + "\n" : "";
if (stillReferenced.length !== picked.length) {
  const dead = picked.filter((p) => !stillReferenced.includes(p)).map((p) => p.name ?? p.label);
  console.log(`   ℹ 不回引（搬走后源文件已无引用 / 语句级切片）：${dead.join(", ")}`);
}
if (pruned.dropped.length)
  console.log(`   ℹ 源文件死导入已清理（${pruned.dropped.length} 个）：${pruned.dropped.join(", ")}`);
if (pruned.stuck?.length)
  console.log(`   ⚠ 抠不掉、保留原样（交给 lint 兜底）：${pruned.stuck.join(", ")}`);
// 回引必须落在**文件顶层**：切片本体在巨型闭包里（那里的 `import` 是 TS1232 语法错），
// 所以插到最末一条顶层 import 之后，靠 ESM hoisting 覆盖全部调用点。
// 坑（已踩过，勿删）：插入位置必须**在死导入清理之后重新解析 srcNew 得到** ——
// 沿用清理前的偏移会随「删掉的字符数」整体前移，实测会把 import 插到函数体中间。
if (importStmt) {
  const rescanned = ts.createSourceFile(
    "insert.ts",
    srcNew,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const topImports = rescanned.statements.filter((st) => ts.isImportDeclaration(st));
  const insertAt = topImports.length ? topImports[topImports.length - 1].getEnd() : 0;
  srcNew = srcNew.slice(0, insertAt) + "\n" + importStmt.trimEnd() + srcNew.slice(insertAt);
}

// ------------------------------------------------------------------ 报告
console.log(`\n== Studio 切片搬运（${opts.apply ? "apply" : "dry-run"}）`);
console.log(`   源   ${opts.file}`);
console.log(`   目标 ${opts.out}${destExists ? "（追加到既有文件，import 块自动并入最末一条 import 之后）" : "（新建）"}`);
console.log(`   回引 import { ${stillReferenced.map((p) => p.name).join(", ") || "（无）"} } from "${importSpec}";`);
if (reExported.length)
  console.log(`   转发导出面 export { ${reExported.map((p) => p.name).join(", ")} } from "${importSpec}";`);
console.log(`\n   —— 搬走 ${picked.length} 个声明 / ${movedLines} 行正文${picked.some((p) => p.method) ? "（方法形态：类侧原地留转发薄成员）" : ""}：`);
for (const s of spans) console.log(`      ${String(s.startLine).padStart(6)}~${String(s.endLine).padEnd(6)}  ${s.name}${s.method ? "  [method]" : ""}`);
console.log(`\n   —— 目标 import（${importBlock.length} 条，相对路径已按目标目录重算）：`);
for (const l of importBlock) console.log(`      ${l}`);
if (residual.size) {
  console.log(`\n   ⚠ 残留依赖 ${residual.size} 个（不在切片里、也不是 import）—— 必须显式传参或一并搬走：`);
  for (const r of [...residual.values()].sort((a, b) => b.count - a.count))
    console.log(`      ${String(r.count).padStart(4)}×  ${r.name}  @${r.line}`);
} else console.log(`\n   ✓ 无残留依赖：切片自闭合。`);
if (globals.size) console.log(`   ℹ 未解析/全局 ${globals.size} 个：${[...globals.keys()].join(", ")}`);
if (destExists) console.log(`   ℹ 目标文件已存在：正文追加，import 已并入最末一条 import 之后（重复行请自行去重）。`);

if (opts.apply) {
  fs.writeFileSync(opts.file, srcNew);
  fs.mkdirSync(path.dirname(opts.out), { recursive: true });
  fs.writeFileSync(opts.out, destNew);
  console.log(`\n   ✓ 已写盘。必跑：bun run --cwd homeos/frontend typecheck && bun run --cwd homeos/frontend check:deps && bun run kpi:studio`);
}
console.log("");
