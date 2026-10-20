#!/usr/bin/env node
/**
 * 标识符命名审计共享库。
 *
 * 目标：用 TypeScript AST + Vue SFC 解析，枚举源码里的声明名（变量/参数/
 * 解构绑定/函数/类），供 scan / check / rename 三个 CLI 与测试复用。
 * 只读：不修改任何文件。
 */
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { parse as parseSfc } from "@vue/compiler-sfc";

export const REPO_ROOT = path.resolve(import.meta.dirname, "../../..");

/** 参与命名审计的源码根（仓库相对路径）。 */
export const SRC_ROOTS = [
  "homeos/frontend/src",
  "homeos-store/frontend/src",
  "packages/shared/src",
];

/** 目录名级排除；源码根下出现这些目录一律跳过。 */
const EXCLUDE_DIRS = new Set([
  "node_modules",
  "dist",
  ".git",
  ".venv-store",
  ".pnpm-store",
  "__pycache__",
  "backups",
  "data",
  ".ruff_cache",
  "public",
  "vendor",
  "static",
]);

/** 生成代码排除：例如 foo.generated.ts、__generated__/ 下的文件。 */
const GENERATED_RE = /(?:\.(?:generated|gen)\.(?:ts|vue)$)|(?:[\\/]__generated__[\\/])/;

/** 硬允许：领域/语法上无需改名的 1–2 字符名。 */
export const HARD_ALLOW = new Set([
  "i", "j", "k", "x", "y", "z",
  "id", "el", "ev", "fn", "cb", "ok", "ns", "ui",
  "fs", "os", "db",
]);

/**
 * 领域允许：几何/单位/时间/平台缩写。报告里单独统计，门禁默认放行；
 * 每条都带理由，避免“名字短就改”的无证据改名。
 */
export const DOMAIN_ALLOW = new Map([
  ["w", "width 几何宽度"],
  ["h", "height 几何高度"],
  ["cx", "center x 坐标"],
  ["cy", "center y 坐标"],
  ["cw", "content/container width"],
  ["ch", "content/container height"],
  ["pw", "popup width"],
  ["ph", "popup height"],
  ["vw", "viewport width"],
  ["vh", "viewport height"],
  ["px", "pixel 单位/坐标"],
  ["dx", "delta x"],
  ["dy", "delta y"],
  ["dw", "delta width"],
  ["dh", "delta height"],
  ["x0", "区间起点 x"],
  ["y0", "区间起点 y"],
  ["x1", "区间终点 x"],
  ["y1", "区间终点 y"],
  ["c1", "颜色/曲线控制点 1"],
  ["c2", "颜色/曲线控制点 2"],
  ["c3", "颜色/曲线控制点 3"],
  ["t0", "时间轴起点"],
  ["ms", "millisecond 毫秒"],
  ["ts", "timestamp 时间戳"],
  ["tz", "timezone 时区"],
  ["dt", "date-time 时间（导出符号，冻结）"],
  ["ws", "websocket 连接"],
  ["ua", "user-agent"],
  ["qs", "query string"],
  ["sk", "storage key"],
  ["fp", "fingerprint 指纹"],
  ["hc", "home context 上下文"],
  ["zh", "中文 locale"],
  ["en", "英文 locale"],
  ["ta", "target/textarea? 需逐条复核"],
  ["tr", "translation row / table row"],
  ["td", "table data cell"],
  ["th", "table header cell"],
]);

/** 上下文允许：比较器参数、i18n 的 t、占位符 _。 */
export const CONTEXT_ALLOW = new Set(["a", "b", "t", "_"]);

/** N2：数字后缀命名（num1 / v2 / value3）。 */
export const NUMERIC_NAME_RE = /^(?:num|value|v)\d+$/;

/** N3：非全大写常量的 snake_case。 */
export const SNAKE_CASE_RE = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$/;

/** N4：非标准的下划线前缀函数/类（排除 __dunder）。 */
export const UNDERSCORE_FN_RE = /^_[a-z][A-Za-z0-9]*$/;

export function toRel(file) {
  return path.relative(REPO_ROOT, file).split(path.sep).join("/");
}

export function isShortName(name) {
  return typeof name === "string" && name.length > 0 && name.length <= 2;
}

export function collectSourceFiles(roots = SRC_ROOTS) {
  const out = [];
  const walk = (dir) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!EXCLUDE_DIRS.has(entry.name)) walk(p);
      } else if (entry.isFile()) {
        if (!/\.(?:ts|vue)$/.test(p)) continue;
        if (p.endsWith(".d.ts")) continue;
        if (GENERATED_RE.test(toRel(p))) continue;
        out.push(p);
      }
    }
  };
  for (const root of roots) walk(path.join(REPO_ROOT, root));
  out.sort();
  return out;
}

/**
 * 模板里可能引用脚本绑定的文本：属性值（@click="e"、:class="e"、v-if="e"）
 * 与标签之间的插值文本。标签名/属性名不参与，避免 <i> 之类的假阳性。
 */
function templateExpressionText(template) {
  let text = "";
  for (const m of template.matchAll(/\s(?:[:@#][\w:.-]+|v-[\w:.-]+|[\w:-]+)\s*=\s*"([^"]*)"/g)) {
    text += " " + m[1];
  }
  for (const m of template.matchAll(/\s(?:[:@#][\w:.-]+|v-[\w:.-]+|[\w:-]+)\s*=\s*'([^']*)'/g)) {
    text += " " + m[1];
  }
  text += " " + template.replace(/<!--[\s\S]*?-->/g, " ").replace(/<[^>]*>/g, " ");
  return text;
}

export function templateHasName(template, name) {
  if (!template) return false;
  const text = templateExpressionText(template);
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp("(?:^|[^A-Za-z0-9_$])" + escaped + "(?:$|[^A-Za-z0-9_$])").test(text);
}

/** 模板中按词边界出现的所有位置（用于 allowTemplate 的单点改名）。 */
export function templateOccurrences(template, name) {
  if (!template) return [];
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp("(?:^|[^A-Za-z0-9_$])" + escaped + "(?:$|[^A-Za-z0-9_$])", "g");
  const out = [];
  for (const m of template.matchAll(re)) {
    const offset = (m.index ?? 0) + m[0].indexOf(name);
    out.push(offset);
  }
  return out;
}

function findAncestor(node, predicate) {
  let n = node.parent;
  while (n) {
    if (predicate(n)) return n;
    n = n.parent;
  }
  return undefined;
}

function isTopLevel(node) {
  let n = node;
  while (n.parent) {
    if (ts.isSourceFile(n.parent)) return true;
    n = n.parent;
  }
  return false;
}

function hasExportModifier(node) {
  let decl = node;
  if (ts.isBindingElement(node)) {
    decl = findAncestor(node, ts.isVariableDeclaration) ?? node;
    if (!ts.isVariableDeclaration(decl) || !decl.name || !isWithin(decl.name, node)) return false;
  }
  if (ts.isVariableDeclaration(decl)) {
    const list = decl.parent;
    if (!list || !ts.isVariableDeclarationList(list)) return false;
    const stmt = list.parent;
    if (!stmt || !ts.isVariableStatement(stmt)) return false;
    return hasExportSyntax(ts.getModifiers(stmt));
  }
  if (ts.isFunctionDeclaration(decl) || ts.isClassDeclaration(decl)) {
    return hasExportSyntax(ts.getModifiers(decl));
  }
  return false;
}

function hasExportSyntax(mods) {
  return !!mods?.some(
    (m) => m.kind === ts.SyntaxKind.ExportKeyword || m.kind === ts.SyntaxKind.DefaultKeyword,
  );
}

function isWithin(parent, node) {
  let n = node;
  while (n) {
    if (n === parent) return true;
    n = n.parent;
  }
  return false;
}

function collectReExportNames(sf) {
  const names = new Set();
  const visit = (n) => {
    if (ts.isExportDeclaration(n) && n.exportClause && ts.isNamedExports(n.exportClause)) {
      for (const el of n.exportClause.elements) {
        names.add((el.propertyName ?? el.name).text);
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return names;
}

function enclosingFunction(node) {
  let n = node.parent;
  while (n) {
    if (ts.isFunctionLike(n)) return n;
    n = n.parent;
  }
  return undefined;
}

function enclosingFunctionName(node) {
  const fn = enclosingFunction(node);
  if (!fn) return "<top>";
  if (fn.name && ts.isIdentifier(fn.name)) return fn.name.text;
  if (ts.isArrowFunction(fn)) {
    const p = fn.parent;
    if (ts.isVariableDeclaration(p) && ts.isIdentifier(p.name)) return p.name.text;
    if (ts.isPropertyAssignment(p)) return p.name.getText();
    if (ts.isCallExpression(p)) return "<callback>";
    return "<arrow>";
  }
  return "<anonymous>";
}

function isComparatorParam(node) {
  if (!ts.isParameter(node)) return false;
  const fn = enclosingFunction(node);
  if (!fn) return false;
  const p = fn.parent;
  if (!p || !ts.isCallExpression(p)) return false;
  const callee = p.expression.getText();
  return /(?:sort|toSorted|reduce|reduceRight|localeCompare)$/.test(callee);
}

function isI18nBinding(node) {
  let text = "";
  if (ts.isVariableDeclaration(node)) {
    const stmt = findAncestor(node, ts.isVariableStatement);
    text = stmt ? stmt.getText() : node.parent.getText();
  } else if (ts.isBindingElement(node)) {
    const stmt = findAncestor(node, ts.isVariableStatement);
    text = stmt ? stmt.getText() : node.parent.getText();
  }
  return /useI18n\s*\(/.test(text);
}

function isCatchVariable(node) {
  if (!ts.isVariableDeclaration(node)) return false;
  return ts.isCatchClause(node.parent) || ts.isCatchClause(node.parent?.parent);
}

function declarationSnippet(node, sf) {
  let target = node;
  if (ts.isVariableDeclaration(node)) target = node.parent?.parent ?? node;
  else if (ts.isBindingElement(node)) target = findAncestor(node, ts.isVariableStatement) ?? node.parent;
  else if (ts.isParameter(node)) target = enclosingFunction(node) ?? node;
  let text;
  try {
    text = target.getText(sf);
  } catch {
    text = node.getText(sf);
  }
  return text.replace(/\s+/g, " ").slice(0, 220);
}

function enclosingFunctionText(node) {
  const fn = enclosingFunction(node);
  if (!fn) return "";
  try {
    return fn.getText().slice(0, 4000);
  } catch {
    return "";
  }
}

const DOM_EVENT_MEMBERS =
  "target|currentTarget|key|code|preventDefault|stopPropagation|stopImmediatePropagation|clipboardData|dataTransfer|detail|pointerId|pointerType|clientX|clientY|pageX|pageY|touches|changedTouches|deltaY|deltaX|nativeEvent|button|buttons|which|metaKey|ctrlKey|shiftKey|altKey|isComposing|relatedTarget|composedPath";

function hasDomEventUsage(name, fnText) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp("\\b" + escaped + "\\.(?:" + DOM_EVENT_MEMBERS + ")\\b").test(fnText);
}

function computeHints(node, kind) {
  const hints = [];
  if (kind === "param" && isComparatorParam(node)) hints.push("comparator");
  if (kind === "param") {
    const fnText = enclosingFunctionText(node);
    if (hasDomEventUsage(node.name?.text ?? "", fnText)) hints.push("dom-event");
  }
  if (isCatchVariable(node)) hints.push("catch");
  if (isI18nBinding(node)) hints.push("i18n");
  if (node.name && node.name.text === "_") hints.push("placeholder");
  return hints;
}

function addItem(ctx, nameNode, kind, node, sf) {
  const name = nameNode.text;
  if (!name) return;
  const { file, rel, blockOffset, fullSf, template, scriptSetup } = ctx;
  const scriptStart = nameNode.getStart(sf);
  const fileOffset = blockOffset != null ? blockOffset + scriptStart : scriptStart;
  const lc = fullSf.getLineAndCharacterOfPosition(fileOffset);
  const topLevel = isTopLevel(node);
  const exported = hasExportModifier(node) || (topLevel && ctx.reExportNames.has(name));
  const templateVisible =
    !!scriptSetup && topLevel && templateHasName(template, name);
  const hints = computeHints(node, kind);
  const item = {
    file: rel,
    line: lc.line + 1,
    col: lc.character + 1,
    offset: fileOffset,
    name,
    kind,
    exported,
    topLevel,
    scriptSetupTopLevel: !!scriptSetup && topLevel,
    templateVisible,
    hints,
    parent: enclosingFunctionName(node),
    snippet: declarationSnippet(node, sf),
  };
  if (ts.isVariableDeclaration(node)) {
    item.init = node.initializer ? node.initializer.getText(sf).replace(/\s+/g, " ").slice(0, 120) : "";
    item.type = node.type ? node.type.getText(sf).slice(0, 80) : "";
  } else if (ts.isParameter(node)) {
    item.type = node.type ? node.type.getText(sf).slice(0, 80) : "";
  } else if (ts.isBindingElement(node)) {
    item.type = node.type ? node.type.getText(sf).slice(0, 80) : "";
  }
  ctx.items.push(item);
}

function walkAst(sf, ctx) {
  const visit = (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
      addItem(ctx, node.name, "var", node, sf);
    } else if (ts.isParameter(node) && ts.isIdentifier(node.name)) {
      addItem(ctx, node.name, "param", node, sf);
    } else if (ts.isBindingElement(node) && ts.isIdentifier(node.name)) {
      addItem(ctx, node.name, "binding", node, sf);
    } else if (ts.isFunctionDeclaration(node) && node.name) {
      addItem(ctx, node.name, "function", node, sf);
    } else if (ts.isClassDeclaration(node) && node.name) {
      addItem(ctx, node.name, "class", node, sf);
    } else if (ts.isImportSpecifier(node)) {
      const local = node.name;
      if (isShortName(local.text)) {
        const relStart = local.getStart(sf);
        const absStart = ctx.blockOffset != null ? ctx.blockOffset + relStart : relStart;
        if (!Number.isFinite(absStart) || absStart < 0 || absStart > ctx.fullSf.text.length) {
          console.error("BAD IMPORT OFFSET", ctx.rel, local.text, relStart, absStart, ctx.fullSf.text.length);
          return;
        }
        const lc = ctx.fullSf.getLineAndCharacterOfPosition(absStart);
        ctx.imports.push({
          file: ctx.rel,
          line: lc.line + 1,
          col: lc.character + 1,
          name: local.text,
          from: node.parent?.parent?.parent?.moduleSpecifier?.text ?? "",
          templateVisible: !!ctx.scriptSetup && templateHasName(ctx.template, local.text),
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

export function scanFile(file) {
  const source = fs.readFileSync(file, "utf8");
  const rel = toRel(file);
  const fullSf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const items = [];
  const imports = [];
  if (file.endsWith(".vue")) {
    const { descriptor, errors } = parseSfc(source, { filename: file });
    if (errors.length) {
      return { file: rel, items, imports, error: errors.map((e) => String(e)).join("; ") };
    }
    const template = descriptor.template?.content ?? "";
    for (const [kind, block] of [
      ["script", descriptor.script],
      ["scriptSetup", descriptor.scriptSetup],
    ]) {
      if (!block || !block.content.trim()) continue;
      const scriptSf = ts.createSourceFile(
        rel + "." + kind + ".ts",
        block.content,
        ts.ScriptTarget.Latest,
        true,
        block.lang === "tsx" ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
      );
      const ctx = {
        file,
        rel,
        blockOffset: block.loc.start.offset,
        fullSf,
        template,
        scriptSetup: kind === "scriptSetup",
        reExportNames: collectReExportNames(scriptSf),
        items,
        imports,
      };
      walkAst(scriptSf, ctx);
    }
    return { file: rel, items, imports };
  }
  const ctx = {
    file,
    rel,
    blockOffset: null,
    fullSf,
    template: "",
    scriptSetup: false,
    reExportNames: collectReExportNames(fullSf),
    items,
    imports,
  };
  walkAst(fullSf, ctx);
  return { file: rel, items, imports };
}

export function scanRepo({ roots = SRC_ROOTS } = {}) {
  const files = collectSourceFiles(roots);
  const items = [];
  const imports = [];
  const errors = [];
  for (const file of files) {
    try {
      const result = scanFile(file);
      items.push(...result.items);
      imports.push(...result.imports);
      if (result.error) errors.push({ file: result.file, error: result.error });
    } catch (error) {
      errors.push({ file: toRel(file), error: String(error?.message ?? error) });
    }
  }
  return {
    generatedAt: new Date().toISOString(),
    roots,
    fileCount: files.length,
    items,
    imports,
    errors,
    stats: summarize(items, imports),
  };
}

export function summarize(items, imports = []) {
  const short = items.filter((i) => isShortName(i.name));
  const byName = new Map();
  const byFile = new Map();
  const byKind = new Map();
  for (const item of short) {
    byName.set(item.name, (byName.get(item.name) ?? 0) + 1);
    byFile.set(item.file, (byFile.get(item.file) ?? 0) + 1);
    byKind.set(item.kind, (byKind.get(item.kind) ?? 0) + 1);
  }
  const sortMap = (m) => [...m.entries()].sort((a, b) => b[1] - a[1]);
  return {
    total: items.length,
    short: short.length,
    shortFiles: byFile.size,
    exportedShort: short.filter((i) => i.exported).length,
    templateVisibleShort: short.filter((i) => i.templateVisible).length,
    byKind: Object.fromEntries([...byKind.entries()].sort((a, b) => b[1] - a[1])),
    topNames: sortMap(byName).slice(0, 50).map(([name, count]) => ({ name, count })),
    topFiles: sortMap(byFile).slice(0, 60).map(([file, count]) => ({ file, count })),
    byFileAll: Object.fromEntries(sortMap(byFile)),
    importsShort: imports.length,
  };
}

export function isCountedViolation(item, allow) {
  if (!isShortName(item.name)) return false;
  if (HARD_ALLOW.has(item.name)) return false;
  if (allow?.global?.[item.name]) return false;
  const fileEntry = (allow?.files ?? []).find(
    (f) => f.file === item.file && f.name === item.name,
  );
  if (fileEntry) return false;
  if (CONTEXT_ALLOW.has(item.name)) {
    if (item.name === "a" || item.name === "b") {
      if (item.hints.includes("comparator")) return false;
    }
    if (item.name === "t" && item.hints.includes("i18n")) return false;
    if (item.name === "_" && item.hints.includes("placeholder")) return false;
  }
  return true;
}
