/**
 * ESM 具名导出的静态守卫。
 *
 * 浏览器只在运行期才暴露这类错误：`import { x } from "./m.js"` 而 m.js 没有导出 x 时，
 * 整页抛 SyntaxError，且报错信息指向**引用方**（`entity-power.js:15`），很容易被误判成
 * 缓存问题或路径问题。注册表拆分后的 `registry-visuals.js` 就漏了三个 `export`，
 * 一次打断 20 个控件模块 —— 而 `check_registry_split.mjs` 只证明分片被引入、
 * 版本戳一致，看不到「引入的名字根本不存在」。
 *
 * 本脚本把「每个具名 import 都能在目标模块里找到同名导出」静态钉住。
 * 扫描范围限 `frontend/`：那是浏览器直接加载的 ESM 树；`HomeOS-Activate/` 是独立
 * Node 包，缺导出会在 `node` 启动时立刻抛出，不需要这里兜底。
 *
 * Usage:
 *   node tools/check_esm_exports.mjs          # 报告（有问题时以 1 退出）
 *   node tools/check_esm_exports.mjs --json   # 机器可读
 *
 * 五种写法必须先剥掉，否则满屏误报（本脚本第一版依次踩过全部五种）：
 *   1. `export const A = 1, B = 2;` —— `export` 覆盖整条声明，B 也是导出；
 *   2. `export { a, b as c } from "./x.js"` —— barrel 转出：`c` 是本模块的导出，
 *      而 `a`/`b` 必须在目标模块里存在；
 *   3. `import { x as y }` —— 要在目标里找的是 `x`，不是本地别名 `y`；
 *   4. `export const { a, b } = mod;`（含 `= await import(url)`）—— 解构导出，
 *      关键字后面没有 `function` / `const x =`，但被绑定的名字就是导出；
 *   5. 注释掉的 import —— 先剥注释，否则「纸上引用」会被当成真引用。
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCAN_ROOT = path.join(ROOT, "frontend");

const asJson = process.argv.includes("--json");
if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log("Usage: node tools/check_esm_exports.mjs [--json]");
  process.exit(0);
}

/** 与其它检查脚本同一套跳过规则：vendor 与各类缓存目录不参与。 */
const SKIP_DIRS = new Set(["vendor", "node_modules", ".venv", ".venv-store", ".extracted"]);

/**
 * 去注释的空格替换版：每个字节的偏移都不变，行号可直接用。
 *
 * 必须剥注释：`// import { gone } from "./x.js"` 用裸正则一样能匹配上，
 * 守卫会因此报出一个浏览器根本不会去解析的引用（本脚本的第一版就报过）。
 * 字符串状态也要跟，否则 `"//"` 这类字面量会把后面的代码误当注释吞掉。
 */
function codeOnly(text) {
  let out = "";
  let state = "normal";
  let quoteChar = "";
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (state === "line-comment") {
      if (char === "\n") {
        state = "normal";
        out += char;
      } else {
        out += " ";
      }
      continue;
    }
    if (state === "block-comment") {
      if (char === "*" && next === "/") {
        index += 1;
        state = "normal";
        out += "  ";
      } else {
        out += char === "\n" ? "\n" : " ";
      }
      continue;
    }
    if (state === "string") {
      out += char;
      if (char === "\\") {
        out += next ?? "";
        index += 1;
      } else if (char === quoteChar) {
        state = "normal";
      }
      continue;
    }
    if (char === "/" && next === "/") {
      state = "line-comment";
      out += "  ";
      index += 1;
      continue;
    }
    if (char === "/" && next === "*") {
      state = "block-comment";
      out += "  ";
      index += 1;
      continue;
    }
    if (char === "'" || char === '"' || char === "`") {
      state = "string";
      quoteChar = char;
      out += char;
      continue;
    }
    out += char;
  }
  return out;
}

function* walkFiles(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name) || entry.name.startsWith(".")) continue;
      yield* walkFiles(full);
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".js")) yield full;
  }
}

/** 按顶层逗号切分：`a, b: {c}, d = 1` -> 三段。 */
function splitTopLevel(text) {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === "(" || char === "[" || char === "{") depth += 1;
    else if (char === ")" || char === "]" || char === "}") depth -= 1;
    else if (char === "," && depth === 0) {
      parts.push(text.slice(start, index));
      start = index + 1;
    }
  }
  parts.push(text.slice(start));
  return parts;
}

/**
 * 绑定模式引入的名字。覆盖本仓库实际用到的扁平 `{ a, b }`，以及 `{ key: alias }`
 * 与嵌套；数组模式走同一条路。
 *
 * 只能截到**配对**的收尾括号，不能要求它正好是最后一个字符：`export const { a } = mod;`
 * 里 `}` 后面还有 `= mod`，用 `endsWith("}")` 判断会整段落空（本脚本第二版报过）。
 */
function patternNames(pattern) {
  let text = pattern.trim();
  if (text.startsWith("{") || text.startsWith("[")) {
    const open = text[0];
    const close = open === "{" ? "}" : "]";
    let depth = 0;
    for (let index = 0; index < text.length; index += 1) {
      if (text[index] === open) depth += 1;
      else if (text[index] === close) {
        depth -= 1;
        if (depth === 0) {
          text = text.slice(0, index + 1);
          break;
        }
      }
    }
  } else {
    // 非解构分支要丢掉默认值：`a = 1` 只取 `a`。
    const equalsAt = text.search(/\s=/);
    if (equalsAt !== -1) text = text.slice(0, equalsAt).trim();
  }

  if (!text.startsWith("{") && !text.startsWith("[")) {
    const match = text.match(/^([A-Za-z_$][\w$]*)/);
    return match ? [match[1]] : [];
  }

  const names = [];
  for (const piece of splitTopLevel(text.slice(1, -1))) {
    let part = piece.trim();
    if (!part) continue;
    const colonAt = part.indexOf(":");
    if (colonAt !== -1) {
      // `{ key: alias }` 绑定的是 alias，key 只是属性名。
      part = part.slice(colonAt + 1).trim();
    } else {
      const defaultAt = part.search(/\s=/);
      if (defaultAt !== -1) part = part.slice(0, defaultAt).trim();
    }
    names.push(...patternNames(part));
  }
  return names;
}

/** `export const|let|var` 之后那条声明链引入的全部名字（顶层逗号切分）。 */
function declaratorNames(source, start) {
  const names = [];
  let depth = 0;
  let pieceStart = start;
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (char === "(" || char === "[" || char === "{") depth += 1;
    else if (char === ")" || char === "]" || char === "}") depth -= 1;
    else if (depth === 0 && (char === "," || char === ";")) {
      names.push(...patternNames(source.slice(pieceStart, index)));
      if (char === ";") break;
      pieceStart = index + 1;
    }
  }
  return names;
}

/**
 * `{ a, b as c }` 里的名字。
 *
 * side 决定取哪一边，这是本脚本最容易搞反的一处：
 *   - import 取 "source"：`import { x as y }` 要在目标里找的是 `x`；
 *   - export 取 "local"：`export { a as b }` 对外提供的是 `b`。
 */
function listNames(list, side) {
  const names = new Set();
  for (const part of list.split(",")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const pieces = trimmed.split(/\s+as\s+/);
    const raw = (side === "source" ? pieces[0] : pieces[pieces.length - 1]).trim();
    const name = raw.replace(/^["']|["']$/g, "");
    if (name && name !== "default") names.add(name);
  }
  return names;
}

const DECLARATION_HEAD_RE = /export\s+(?:async\s+)?(function\s*\*?|class|const|let|var)\s+/g;
const EXPORT_BRACE_RE = /export\s*\{([^}]*)\}/g;
const NAMED_IMPORT_RE = /import\s*(?:[\w*$]+\s*,\s*)?\{([^}]*)\}\s*from\s*["']([^"']+)["']/g;
const NAMED_REEXPORT_RE = /export\s*\{([^}]*)\}\s*from\s*["']([^"']+)["']/g;
const STAR_AS_REEXPORT_RE = /export\s*\*\s*as\s+([\w$]+)\s*from\s*["']([^"']+)["']/g;
const STAR_REEXPORT_RE = /export\s*\*\s*from\s*["']([^"']+)["']/g;

/** 本模块自身直接提供的导出名（不含 `export *` 转发）。 */
function directExports(source) {
  const names = new Set();

  for (const match of source.matchAll(DECLARATION_HEAD_RE)) {
    const keyword = match[1];
    const afterKeyword = match.index + match[0].length;
    if (/^(function|class)/.test(keyword)) {
      const identifier = source.slice(afterKeyword).match(/^([A-Za-z_$][\w$]*)/);
      if (identifier) names.add(identifier[1]);
    } else {
      for (const name of declaratorNames(source, afterKeyword)) names.add(name);
    }
  }

  for (const match of source.matchAll(EXPORT_BRACE_RE)) {
    for (const name of listNames(match[1], "local")) names.add(name);
  }

  if (/export\s+default\b/.test(source)) names.add("default");
  return names;
}

/** 相对说明符 -> 磁盘文件；裸包名（CDN / import map）返回 null 表示不归本脚本管。 */
function resolveSpecifier(specifier, importerFile) {
  if (!specifier.startsWith(".")) return null;
  const target = path.resolve(path.dirname(importerFile), specifier.split("?")[0]);
  if (fs.existsSync(target) && fs.statSync(target).isFile()) return target;
  if (fs.existsSync(`${target}.js`)) return `${target}.js`;
  if (fs.existsSync(path.join(target, "index.js"))) return path.join(target, "index.js");
  return target;
}

const files = [...walkFiles(SCAN_ROOT)].sort();
const exportCache = new Map();

/**
 * 一个模块的具名导出集合；`export * from` 与 `export * as ns from` 递归展开。
 *
 * 追不到目标时标 opaque：调用方据此跳过判定，宁可不报也不误报 ——
 * 这个守卫一旦有假阳性，就会像正例那样被当成噪音忽略掉。
 */
function exportsOf(file, seen = new Set()) {
  if (exportCache.has(file)) return exportCache.get(file);
  if (!file || seen.has(file) || !fs.existsSync(file)) return null;
  seen.add(file);

  const source = codeOnly(fs.readFileSync(file, "utf8"));
  const names = directExports(source);
  const result = { names, opaque: false };

  for (const [, name, specifier] of source.matchAll(STAR_AS_REEXPORT_RE)) {
    names.add(name);
    if (!exportsOf(resolveSpecifier(specifier, file))) result.opaque = true;
  }
  for (const [, specifier] of source.matchAll(STAR_REEXPORT_RE)) {
    const target = exportsOf(resolveSpecifier(specifier, file));
    if (target) for (const name of target.names) names.add(name);
    else result.opaque = true;
  }

  exportCache.set(file, result);
  return result;
}

const problems = [];
let statements = 0;

/**
 * 共享桥（`modules/runtime/core/static-helpers.js`）那一处「条件动态 import + 具名解构」
 * 是本脚本前四类写法都看不见的：`const { a, b } = await (… ? import(A) : import(B))` 既不是
 * `import … from`，也不是 `export const { … }`。于是漏一个 `export` 或拼错一个目标路径，
 * 静态守卫全绿、只有浏览器抛 SyntaxError，而报错还指向引用方。
 *
 * 这里单独钉住三条：解构出的每个名字都是两个分支目标的真实导出；两个分支指向同一个文件；
 * 文件末尾的 `export { … }` 与该文件解构出的名字集合逐字相同（「导出名必须与登记表一致」）。
 */
const BRIDGE_REL = "frontend/modules/runtime/core/static-helpers.js";
const BRIDGE_BLOCK_RE =
  /const\s*\{([^}]*)\}\s*=\s*await\s*\(\s*import\.meta\.url\.startsWith\(\s*["']file:["']\s*\)\s*\?\s*import\(\s*new URL\(\s*["']([^"']+)["']\s*,\s*import\.meta\.url\s*\)\s*\)\s*:\s*import\(\s*["']([^"']+)["']\s*\)\s*\)/g;

function checkBridge(problems) {
  const bridgeFile = path.join(ROOT, BRIDGE_REL);
  if (!fs.existsSync(bridgeFile)) return 0;

  const source = codeOnly(fs.readFileSync(bridgeFile, "utf8"));
  const destructured = new Set();
  let blocks = 0;

  for (const [, list, relativeSpec, absoluteSpec] of source.matchAll(BRIDGE_BLOCK_RE)) {
    blocks += 1;
    const names = [...listNames(list, "source")];
    for (const name of names) destructured.add(name);

    // `file:` 分支按 URL 语义相对于桥自身解析；否则必须是 /static/ 下的绝对 URL。
    const relativeTarget = path.resolve(path.dirname(bridgeFile), relativeSpec);
    const absoluteTarget = absoluteSpec.startsWith("/static/")
      ? path.join(SCAN_ROOT, absoluteSpec.slice(1).split("?")[0])
      : null;

    if (!absoluteTarget) {
      problems.push({
        file: bridgeFile,
        specifier: absoluteSpec,
        missing: names,
        reason: "桥的非 file: 分支只许写 /static/… 绝对 URL"
      });
      continue;
    }
    if (path.resolve(absoluteTarget) !== path.resolve(relativeTarget)) {
      problems.push({
        file: bridgeFile,
        specifier: `${relativeSpec} vs ${absoluteSpec}`,
        missing: names,
        reason: "桥的两个分支指向了不同文件"
      });
      continue;
    }
    const info = exportsOf(relativeTarget);
    if (!info || info.opaque) continue;
    const missing = names.filter((name) => !info.names.has(name));
    if (missing.length) {
      problems.push({
        file: bridgeFile,
        specifier: absoluteSpec,
        missing,
        reason: "桥引了目标模块没有的导出",
        available: [...info.names].sort()
      });
    }
  }

  if (blocks === 0) {
    problems.push({
      file: bridgeFile,
      specifier: BRIDGE_REL,
      missing: [],
      reason: "桥里没有解析到任何「条件动态 import + 具名解构」块（写法变了？守卫已失效）"
    });
    return 0;
  }

  // 登记表：末尾 `export { … }` 必须与解构出的名字集合逐字相同。
  const exportList = [...source.matchAll(EXPORT_BRACE_RE)].pop();
  const declared = new Set(exportList ? listNames(exportList[1], "local") : []);
  const notExported = [...destructured].filter((name) => !declared.has(name));
  const notImported = [...declared].filter((name) => !destructured.has(name));
  if (notExported.length || notImported.length) {
    problems.push({
      file: bridgeFile,
      specifier: BRIDGE_REL,
      missing: [...notExported, ...notImported],
      reason: "桥的 export 清单与它解构的名字不一致",
      available: [...destructured].sort()
    });
  }

  statements += blocks;
  return blocks;
}

for (const file of files) {
  const source = codeOnly(fs.readFileSync(file, "utf8"));

  // import：要在目标里找的是左边的原名字。
  for (const [, list, specifier] of source.matchAll(NAMED_IMPORT_RE)) {
    const target = resolveSpecifier(specifier, file);
    if (target === null) continue;
    statements += 1;
    if (!fs.existsSync(target)) {
      problems.push({ file, specifier, missing: [...listNames(list, "source")], reason: "目标模块文件不存在" });
      continue;
    }
    const info = exportsOf(target);
    if (!info || info.opaque) continue;
    const missing = [...listNames(list, "source")].filter((name) => !info.names.has(name));
    if (missing.length) {
      const line = source.slice(0, source.indexOf(specifier)).split("\n").length;
      problems.push({ file, specifier, missing, line, reason: "目标模块没有该导出", available: [...info.names].sort() });
    }
  }

  // export ... from：左边必须在目标里存在，右边是本模块自己的导出。
  for (const [, list, specifier] of source.matchAll(NAMED_REEXPORT_RE)) {
    const target = resolveSpecifier(specifier, file);
    if (target === null) continue;
    statements += 1;
    if (!fs.existsSync(target)) {
      problems.push({ file, specifier, missing: [...listNames(list, "source")], reason: "转出目标模块文件不存在" });
      continue;
    }
    const info = exportsOf(target);
    if (!info || info.opaque) continue;
    const missing = [...listNames(list, "source")].filter((name) => !info.names.has(name));
    if (missing.length) {
      problems.push({ file, specifier, missing, reason: "转出的名字在目标模块里不存在", available: [...info.names].sort() });
    }
  }
}

// 桥单独查（前四类写法都看不到它）。
checkBridge(problems);

const relative = (file) => path.relative(ROOT, file).split(path.sep).join("/");

if (asJson) {
  console.log(JSON.stringify({ scanned: files.length, statements, problems: problems.map((problem) => ({ ...problem, file: relative(problem.file) })) }, null, 2));
} else if (!problems.length) {
  console.log(`  扫描 ${files.length} 个模块、${statements} 条具名 import`);
  console.log("\nOK: 所有具名 import 都能在目标模块里找到同名导出。");
} else {
  console.log(`  扫描 ${files.length} 个模块、${statements} 条具名 import`);
  console.log();
  for (const problem of problems) {
    console.log(`FAIL: ${relative(problem.file)}${problem.line ? `:${problem.line}` : ""}`);
    console.log(`      引用 { ${problem.missing.join(", ")} } from "${problem.specifier}"`);
    console.log(`      ${problem.reason}${problem.available ? `；目标现有导出：${problem.available.join(", ")}` : ""}`);
    console.log();
  }
  console.log(`${problems.length} 项问题`);
}

process.exit(problems.length ? 1 : 0);
