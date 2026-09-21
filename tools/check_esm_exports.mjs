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
 * 除了上面这条（引用方要的名字，目标模块有没有），本脚本还钉住**导出方自己**的三个约束：
 *   1. 对外暴露、而本模块**没有同名绑定**的名字，正文里不许出现 —— 裸转发导出
 *      `export { a as b } from "./x.js"` 只把 `b` 挂上接口、不建本地绑定，正文里的 `b(...)`
 *      是运行期 ReferenceError，栈顶还指向导出方自己的函数，最容易归错因（见 checkScopeBindings）；
 *   2. 共享桥的「登记表」与两个分支指向同一文件（见 checkBridge）；
 *   3. 没有任何模块 import 的导出 —— `export` 是「给别人用的接口」，只在文件内自用的名字
 *      挂出去会让接口面大于真实契约：读代码的人以为有人依赖它，于是不敢动。本仓库曾有
 *      168 个这样的名字（大量是迁移完成后遗留的同名转发），现已清零；`UNUSED_EXPORT_ALLOWLIST`
 *      逐个记着刻意保留的那两个，以及为什么保留。注意判定覆盖全部导出形式：声明式导出、
 *      barrel 转出、以及 `import` 后统一 `export { … }` 的再导出，一律算在内。
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
/** `--why <相对路径>`：解释某个模块为什么没被报（入口？opaque？还是名字都被消费了）。 */
const whyIndex = process.argv.indexOf("--why");
const whyPath = whyIndex === -1 ? null : process.argv[whyIndex + 1];
if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log("Usage: node tools/check_esm_exports.mjs [--json] [--why <相对路径>]");
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
 *
 * 同一个函数还兼管**对象解构**里的 `{ 源名: 本地名 }`（动态 import 解构的三种变体都用这个
 * 写法，如 `{ createTrackClothGeometry: buildTrackClothGeometry }`）：冒号左边是源名、
 * 右边是本地名，与 `as` 同向左、同向右。不认冒号，这些别名化的消费方全部算不出来，
 * 对应的导出会被整片误报成「没人用」。
 */
function listNames(list, side) {
  const names = new Set();
  for (const part of list.split(",")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const pieces = trimmed.split(/\s+as\s+/);
    let raw = (side === "source" ? pieces[0] : pieces[pieces.length - 1]).trim();
    const colonAt = raw.indexOf(":");
    if (colonAt !== -1) {
      raw = (side === "source" ? raw.slice(0, colonAt) : raw.slice(colonAt + 1)).trim();
    }
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

/** 浏览器看到的两棵 ESM 树在前端的 URL 前缀；具名导入也允许写这两种绝对 URL。 */
const STATIC_URL_PREFIX = "/static/";
const RUNTIME_URL_PREFIX = "/api/v1/modules/interaction3d/";

/** 浏览器 URL -> 磁盘文件；两个前缀之外的（CDN、import map）返回 null。 */
function resolveServedUrl(url) {
  const clean = url.split("?")[0];
  if (clean.startsWith(STATIC_URL_PREFIX)) {
    // `/static/…` 保留 `static/` 这一段：前端根目录下有 static/ 与 modules/ 两棵并行的树。
    return path.join(SCAN_ROOT, clean.slice(1));
  }
  if (clean.startsWith(RUNTIME_URL_PREFIX)) {
    return path.join(SCAN_ROOT, "modules/runtime", clean.slice(RUNTIME_URL_PREFIX.length));
  }
  return null;
}

/** 说明符 -> 磁盘文件；裸包名（CDN / import map）返回 null 表示不归本脚本管。 */
function resolveSpecifier(specifier, importerFile) {
  // 绝对 URL 是运行侧唯一的合法写法：`modules/runtime/**` 不能写相对到 `static/` 的静态
  // import（开发环境走 file: 会解析成别的目录），于是它们按 `/static/…` 与
  // `/api/v1/modules/interaction3d/…` 两种前缀引入。漏了这一支，这些导入既不受检查，
  // 算「谁引用了谁」时也会把被引用的导出整片误判成没人用。
  if (!specifier.startsWith(".")) return resolveServedUrl(specifier);
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

/* ---------------------------------------------------------------------------
 * 导出名必须真的是本模块的绑定（裸转发导出 + 文件内自用）
 *
 * 这一类与前面几处方向相反：前面查的是「引用方要的名字，导出方有没有」，浏览器在**链接期**
 * 就抛 SyntaxError，报错指向引用方；这里查的是导出方**自己模块内部**的自由变量 ——
 * `export { clampNumber as clamp } from "./numbers.js"` 只把 `clamp` 挂到对外接口上，
 * **不在本模块作用域建绑定**，于是正文里的 `clamp(...)` 变成运行期 ReferenceError，
 * 而栈顶指向导出方自己的函数（`geometry.js` 的 `adaptiveDeviceLightBudget`）。
 * 现场表现是「几何/预算算法坏了」，实际是导出写法问题，查起来会绕很远。
 *
 * 同一个陷阱还有第二种写法，而且长得更像「修复」：
 *   import { clampNumber } from "./numbers.js";
 *   export { clampNumber as clamp };          // 名字确实导出了，clamp 依旧没有绑定
 * 两条一起钉。
 *
 * 判定必须保守 —— 守卫一旦有假阳性就会被当噪音忽略（同 checkUnusedExports 的取舍）：
 * 只对「对外暴露、而本模块没有同名绑定」的名字下手，且正文出现一次即报。为此扫正文前要把
 * 字符串与模板字面量的内容一起挖空：`codeOnly` 只剥注释、**保留字符串内容**，而 3d-studio
 * 的模板字面量里大量是 HTML 与文案，几乎必然撞上这些名字。
 * ------------------------------------------------------------------------- */

/** 非 `export` 开头的声明头：收集本地绑定不能只看 `export const`。 */
const DECLARATION_ANY_HEAD_RE = /(?<![\w$.])(?:const|let|var|function\s*\*?|class|async\s+function\s*\*?)\s+/g;

/**
 * 把字符串 / 模板字面量的**内容**挖成空格，字节偏移与行号逐字节保留。
 *
 * 跑在 `codeOnly` 之后：那时注释已全是空格，只剩字面量要处理，两套规则互不干扰。
 * 反引号里的 `${…}` 表达式会被一并挖掉 —— 只可能漏报、不会误报，与本检查的取舍一致。
 * 正则字面量（`/clamp/`）不挖：本仓库不在正则里写这些标识符。
 */
function blankLiteralBodies(text) {
  let out = "";
  let quoteChar = "";
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoteChar) {
      out += char === "\n" ? "\n" : " ";
      if (char === "\\") {
        out += text[index + 1] ?? "";
        index += 1;
      } else if (char === quoteChar) {
        quoteChar = "";
      }
      continue;
    }
    if (char === "'" || char === '"' || char === "`") {
      quoteChar = char;
      out += " ";
      continue;
    }
    out += char;
  }
  return out;
}

/**
 * 本模块作用域里真实存在的绑定名：`import`（默认 / 命名空间 / 具名别名）与所有声明头。
 *
 * 链式声明必须走 `declaratorNames`：`const A = 1, B = 2, C = […]` 里裸正则只抓得到 A，
 * B/C 会漏 —— 漏掉绑定就会把正常模块误判成「裸转发导出 + 自用」（本检查第一版正是报出了
 * `bridge/definition.js` 那 5 个链式声明的名字）。多收绑定的方向是安全的：只会少报。
 */
function localBindings(source) {
  const names = new Set();
  for (const [, list] of source.matchAll(NAMED_IMPORT_RE)) {
    for (const name of listNames(list, "local")) names.add(name);
  }
  for (const [, name] of source.matchAll(/\bimport\s+([A-Za-z_$][\w$]*)\s*(?:,|\bfrom\b)/g)) names.add(name);
  for (const [, name] of source.matchAll(/\bimport\s*\*\s*as\s+([A-Za-z_$][\w$]*)/g)) names.add(name);
  for (const match of source.matchAll(DECLARATION_ANY_HEAD_RE)) {
    const afterKeyword = match.index + match[0].length;
    if (/^(function|class|async)/.test(match[0])) {
      const identifier = source.slice(afterKeyword).match(/^([A-Za-z_$][\w$]*)/);
      if (identifier) names.add(identifier[1]);
    } else {
      for (const name of declaratorNames(source, afterKeyword)) names.add(name);
    }
  }
  return names;
}

/**
 * 正文里对该名字的读取：跳过 export / import 语句自身、属性名（`.foo`、`?.foo`、`#foo`）
 * 与对象键 / 标签（`foo:`）。返回首个命中位置与总次数 —— 首个命中位置用于把报错钉在真正
 * 抛 ReferenceError 的那一行上。
 */
function freeReadsInBody(body, name, insideStatement) {
  const escaped = name.replace(/[$]/g, "\\$");
  const pattern = new RegExp(`(?<![.\\w$#])${escaped}\\b`, "g");
  let count = 0;
  let firstIndex = -1;
  for (const match of body.matchAll(pattern)) {
    if (insideStatement(match.index)) continue;
    if (/^\s*:/.test(body.slice(match.index + name.length))) continue;
    count += 1;
    if (firstIndex === -1) firstIndex = match.index;
  }
  return { count, firstIndex };
}

function checkScopeBindings(problems) {
  let candidatesChecked = 0;
  for (const file of files) {
    const source = codeOnly(fs.readFileSync(file, "utf8"));
    const body = blankLiteralBodies(source);
    const bound = localBindings(source);

    // export / import 声明自身不算「正文里的引用」。
    const statementRanges = [];
    for (const pattern of [NAMED_REEXPORT_RE, EXPORT_BRACE_RE, NAMED_IMPORT_RE, NAMESPACE_IMPORT_RE, DEFAULT_IMPORT_RE]) {
      for (const match of source.matchAll(pattern)) {
        statementRanges.push([match.index, match.index + match[0].length]);
      }
    }
    const insideStatement = (index) => statementRanges.some(([start, end]) => index >= start && index < end);

    /** name -> { specifier, reason }：对外暴露、本模块却没有同名绑定的名字。 */
    const unboundExports = new Map();
    for (const [list, specifier] of [...source.matchAll(NAMED_REEXPORT_RE)].map((match) => [match[1], match[2]])) {
      for (const name of listNames(list, "local")) {
        if (bound.has(name)) continue;
        unboundExports.set(name, {
          specifier,
          reason: "裸转发导出（export { a as b } from …）只对外暴露名字、不在本模块建绑定，正文里的读取会运行期抛 ReferenceError"
        });
      }
    }

    for (const match of source.matchAll(EXPORT_BRACE_RE)) {
      // 带 `from` 的已由上面那一支处理。
      if (/^\s*from\b/.test(source.slice(match.index + match[0].length, match.index + match[0].length + 8))) continue;
      for (const piece of splitTopLevel(match[1])) {
        const entry = piece.trim();
        if (!entry || entry === "default") continue;
        if (!/\s+as\s+/.test(entry)) {
          // `export { x }` 而 x 根本没有绑定：浏览器解析期就 SyntaxError，无需等到读取。
          if (!bound.has(entry)) {
            const line = source.slice(0, match.index).split("\n").length;
            problems.push({
              file,
              line,
              specifier: "export { … }（本文件）",
              missing: [],
              reason: `导出 ${entry}，但本模块没有这个名字的绑定，浏览器解析期即 SyntaxError`
            });
          }
          continue;
        }
        for (const name of listNames(entry, "local")) {
          if (bound.has(name)) continue;
          unboundExports.set(name, {
            specifier: "export { … as … }（本文件）",
            reason: "本地 export 的别名只是对外的名字、不是本模块的绑定，正文里的读取会运行期抛 ReferenceError"
          });
        }
      }
    }

    for (const [name, info] of unboundExports) {
      candidatesChecked += 1;
      const { count, firstIndex } = freeReadsInBody(body, name, insideStatement);
      if (!count) continue;
      problems.push({
        file,
        line: source.slice(0, firstIndex).split("\n").length,
        specifier: info.specifier,
        missing: [name],
        reason: `${info.reason}（正文里读了 ${count} 次）`
      });
    }
  }
  return candidatesChecked;
}

/* ---------------------------------------------------------------------------
 * 未使用导出（冗余 export）
 *
 * `export` 一个只有本模块自己用到的名字，等于对外承诺一个没人调用的接口：读代码的人会以为
 * 「改它要顾及调用方」而不敢动，真正的调用方出现时也没人知道该不该继续加。判定必须走真正的
 * 模块图：「本文件里搜不到这个名字」是错的（跨文件引用看不见），「全仓搜不到这个名字」也是错的
 * （下面三类消费方，本脚本前四类的写法一律看不见）。
 *
 * 三类看不见的消费方必须显式认下来，否则这条检查会被假阳性淹没 —— 一个守卫只要有假阳性，
 * 就会像正例一样被当成噪音忽略掉，等于没写：
 *   1. HTML 的 `<script type="module" src>` —— 入口模块的导出天生没人 import；
 *   2. 副作用动态 import（`await import("/api/v1/modules/interaction3d/…")`）—— 加载模块只为
 *      执行、不 import 任何名字，宿主就是这么拉起整棵运行时树的；
 *   3. 条件动态 import 的三种变体：具名解构（A）、命名空间别名（B）、URL 变量（C）。
 * 另有一条刻意保留的导出，见 UNUSED_EXPORT_ALLOWLIST。
 * ------------------------------------------------------------------------- */

/**
 * 刻意保留的导出，键是 `相对路径::导出名`，`::*` 表示整个文件的导出面都保留。
 *
 * 两条都是判断取舍、不是漏改：
 *   1. `appearance.js` 是 `tools/sync_scene_assets.mjs` 按构建上下文分发的共享脚本
 *      （同一份源同步到 frontend / store / Activate 三处）。它的导出面由三棵树共同消费：
 *      商店侧 `store/static/palette.js` 就 import 了其中一部分，而本守卫只扫 `frontend/`。
 *      按单侧结论删这里的 `export`，同步一跑就被覆盖回来，等于白改且留下两棵不同的树。
 *   2. `STUDIO_ASSET_PALETTE` 目前确实只在本模块内被渲染（唯一消费方 `studio-app.js` 要的是
 *      `renderStudioAssetPalette`）。留着 `export` 是把它当**数据契约**对外公开 —— 
 *      3d-studio.html 的注释与 `tools/check_studio_palette.mjs` 都指名它是 67 张卡片的唯一来源，
 *      将来把「数据表」与「渲染」拆成两个文件时不必再动导出。
 * 除这两条外的冗余导出一律收敛：需要对外时再 `export` 回来，成本一行。
 */
const UNUSED_EXPORT_ALLOWLIST = new Set([
  "frontend/static/auth/scene/appearance.js::*",
  "frontend/static/3d-studio/studio/studio-asset-palette.js::STUDIO_ASSET_PALETTE"
]);

/** 与 walkFiles 同一套跳过规则，但取任意扩展名（HTML 入口不在 JS 扫描集里）。 */
function* walkByExtension(dir, extension) {
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
      yield* walkByExtension(full, extension);
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(extension)) yield full;
  }
}

const HTML_MODULE_SCRIPT_RE = /<script\b[^>]*\btype\s*=\s*["']module["'][^>]*>/gi;
const SCRIPT_SRC_RE = /\bsrc\s*=\s*["']([^"']+)["']/i;
/** 副作用动态 import：参数直接是字符串字面量，说明加载模块只为执行。 */
const SIDE_EFFECT_IMPORT_RE = /\bimport\(\s*["']([^"']+)["']\s*\)/g;
/** `import * as NS from "./m.js"` —— 整个命名空间都到了 NS 手里，等于消费全部导出。 */
const NAMESPACE_IMPORT_RE = /import\s*\*\s*as\s+[\w$]+\s*from\s*["']([^"']+)["']/g;
/** `import X from "./m.js"`（默认导入）—— 消费的是目标的 default。 */
const DEFAULT_IMPORT_RE = /import\s+([A-Za-z_$][\w$]*)\s*(?:,\s*(?:\{[^}]*\}|\*\s*as\s+[\w$]+))?\s*from\s*["']([^"']+)["']/g;
/** 条件动态 import + 命名空间别名：`const NS = await (… ? import(A) : import(B))`。 */
const FORK_NAMESPACE_RE =
  /const\s+([A-Za-z_$][\w$]*)\s*=\s*await\s*\(\s*import\.meta\.url\.startsWith\(\s*["']file:["']\s*\)\s*\?\s*import\(\s*new URL\(\s*["']([^"']+)["']\s*,\s*import\.meta\.url\s*\)\s*\)\s*:\s*import\(\s*["']([^"']+)["']\s*\)\s*\)/g;
/**
 * URL 变量式：`const U = new URL(a ? "REL" : "ABS", import.meta.url)` 之后
 * `await import(U.href)`。拆成两步是因为变量名要先登记、再回查。
 */
const URL_VARIABLE_RE =
  /const\s+([A-Za-z_$][\w$]*)\s*=\s*new URL\(\s*import\.meta\.url\.startsWith\(\s*["']file:["']\s*\)\s*\?\s*["']([^"']+)["']\s*:\s*["']([^"']+)["']\s*,\s*import\.meta\.url\s*\)/g;
const VARIABLE_IMPORT_NAMES_RE =
  /(?:const|export\s+const)\s*\{([^}]*)\}\s*=\s*await\s+import\(\s*([A-Za-z_$][\w$]*)(?:\.href)?\s*\)/g;
/** 直接对自己的字面量取名字的两种写法（非分叉）：具名解构 / 命名空间。 */
const DESTRUCTURED_LITERAL_IMPORT_RE =
  /(?:const|export\s+const)\s*\{([^}]*)\}\s*=\s*await\s+import\(\s*["']([^"']+)["']\s*\)/g;
const NAMESPACE_LITERAL_IMPORT_RE =
  /(?:const|export\s+const)\s+([A-Za-z_$][\w$]*)\s*=\s*await\s+import\(\s*["']([^"']+)["']\s*\)/g;
/**
 * 条件动态 import 的第四种用法：表达式后面直接 `.then(({ 名 }) => …)` —— 名字在回调的形参上
 * 解构（弹窗预览要先拿到 PanelRenderer 才能建实例）。此时目标模块是被具名消费的，不是「只为
 * 执行」；漏掉这条既算不出消费方，又会把它误当入口整片豁免。
 */
const FORK_THEN_RE =
  /\(\s*import\.meta\.url\.startsWith\(\s*["']file:["']\s*\)\s*\?\s*import\(\s*new URL\(\s*["']([^"']+)["']\s*,\s*import\.meta\.url\s*\)\s*\)\s*:\s*import\(\s*["']([^"']+)["']\s*\)\s*\)\s*\.then\(\s*\(\s*\{([^}]*)\}/g;
/** 分叉写法的共同开头：用它逐个核对，确认没有第五种没认出来的写法。 */
const FORK_HEAD_RE = /import\.meta\.url\.startsWith\(/g;

/**
 * 「会取名字」的动态 import 在源码里占用的区间。
 *
 * 这些写法里也**含有** `import("…")` 的字面量（分叉的绝对分支、URL 变量式都要带一个），
 * 若不加区分，判定副作用加载时会把它们一并算成「只为执行而加载」，于是把真正被具名消费的
 * 目标模块当成入口整片豁免 —— 检查静默失效，比误报更糟。
 */
function nameTakingImportRanges(source) {
  const ranges = [];
  for (const pattern of [
    BRIDGE_BLOCK_RE,
    FORK_NAMESPACE_RE,
    FORK_THEN_RE,
    VARIABLE_IMPORT_NAMES_RE,
    DESTRUCTURED_LITERAL_IMPORT_RE,
    NAMESPACE_LITERAL_IMPORT_RE
  ]) {
    for (const match of source.matchAll(pattern)) {
      ranges.push([match.index, match.index + match[0].length]);
    }
  }
  return ranges;
}

/** 命名空间别名 `NS` 在本文件里被取走的名字：`{ a, b } = NS` 与 `NS.name`。 */
function namesTakenFromAlias(source, alias) {
  const names = new Set();
  const destructureRe = new RegExp(`\\{([^}]*)\\}\\s*=\\s*${alias}\\b`, "g");
  for (const match of source.matchAll(destructureRe)) {
    for (const name of listNames(match[1], "source")) names.add(name);
  }
  const memberRe = new RegExp(`\\b${alias}\\s*\\.\\s*([A-Za-z_$][\\w$]*)`, "g");
  for (const match of source.matchAll(memberRe)) names.add(match[1]);
  return names;
}

/**
 * 全量模块图上的「谁 import 了谁」。
 *
 * 只做加法：多认一个消费方 = 少报一处，方向安全；漏认一个消费方才会误报，
 * 而上面对应的写法都已单独认下来。
 */
function checkUnusedExports() {
  const consumed = new Map(); // absPath -> Set<导出名>
  const mark = (target, names) => {
    if (!target) return;
    let set = consumed.get(target);
    if (!set) consumed.set(target, (set = new Set()));
    for (const name of names) set.add(name);
  };
  const markAll = (target) => {
    const info = exportsOf(target);
    if (info && !info.opaque) mark(target, info.names);
  };

  // 入口：HTML 的 module script 与副作用动态 import —— 这两类模块的导出天生没人 import。
  // 记下**是谁**把它拉成入口的：入口豁免是静默的，没有出处就无从发现它把该报的也一起免了。
  const entryPoints = new Map();
  const markEntry = (target, reason) => {
    if (target && !entryPoints.has(path.resolve(target))) entryPoints.set(path.resolve(target), reason);
  };
  for (const htmlFile of walkByExtension(SCAN_ROOT, ".html")) {
    const text = fs.readFileSync(htmlFile, "utf8");
    for (const match of text.matchAll(HTML_MODULE_SCRIPT_RE)) {
      const src = match[0].match(SCRIPT_SRC_RE);
      if (src) markEntry(resolveServedUrl(src[1]), `<script type="module"> of ${path.relative(ROOT, htmlFile).split(path.sep).join("/")}`);
    }
  }

  for (const file of files) {
    const source = codeOnly(fs.readFileSync(file, "utf8"));

    for (const [, list, specifier] of source.matchAll(NAMED_IMPORT_RE)) {
      mark(resolveSpecifier(specifier, file), listNames(list, "source"));
    }
    for (const [, list, specifier] of source.matchAll(NAMED_REEXPORT_RE)) {
      mark(resolveSpecifier(specifier, file), listNames(list, "source"));
    }
    for (const [, specifier] of source.matchAll(STAR_REEXPORT_RE)) {
      markAll(resolveSpecifier(specifier, file));
    }
    for (const [, name, specifier] of source.matchAll(STAR_AS_REEXPORT_RE)) {
      mark(resolveSpecifier(specifier, file), [name]);
    }
    for (const [, specifier] of source.matchAll(NAMESPACE_IMPORT_RE)) {
      markAll(resolveSpecifier(specifier, file));
    }
    for (const [, specifier] of source.matchAll(DEFAULT_IMPORT_RE)) {
      mark(resolveSpecifier(specifier, file), ["default"]);
    }

    // 入口二：副作用动态 import —— 只为执行而加载，谁的名字都不取。
    // 「会取名字」的那些写法先在区间上排掉，否则它们内嵌的字面量会被误当副作用加载。
    const ranges = nameTakingImportRanges(source);
    for (const match of source.matchAll(SIDE_EFFECT_IMPORT_RE)) {
      if (ranges.some(([start, end]) => match.index >= start && match.index < end)) continue;
      markEntry(resolveServedUrl(match[1]), `副作用动态 import of ${path.relative(ROOT, file).split(path.sep).join("/")}`);
    }

    // 直接在字面量上取名字的两种写法（不写着两个分支的那种）。
    for (const [, list, url] of source.matchAll(DESTRUCTURED_LITERAL_IMPORT_RE)) {
      mark(resolveServedUrl(url), listNames(list, "source"));
    }
    for (const [, alias, url] of source.matchAll(NAMESPACE_LITERAL_IMPORT_RE)) {
      const names = namesTakenFromAlias(source, alias);
      const target = resolveServedUrl(url);
      if (names.size) mark(target, names);
      else markAll(target);
    }

    // A) 条件动态 import + 具名解构（桥与另外 5 处都用这个写法）。
    for (const [, list, relativeSpec, absoluteSpec] of source.matchAll(BRIDGE_BLOCK_RE)) {
      const names = listNames(list, "source");
      mark(resolveSpecifier(relativeSpec, file), names);
      mark(resolveServedUrl(absoluteSpec), names);
    }

    // B) 条件动态 import + 命名空间别名（解构与成员访问都在文件里现找）。
    for (const [, alias, relativeSpec, absoluteSpec] of source.matchAll(FORK_NAMESPACE_RE)) {
      const names = namesTakenFromAlias(source, alias);
      mark(resolveSpecifier(relativeSpec, file), names);
      mark(resolveServedUrl(absoluteSpec), names);
    }

    // D) 条件动态 import + `.then` 形参解构。
    for (const [, relativeSpec, absoluteSpec, list] of source.matchAll(FORK_THEN_RE)) {
      const names = listNames(list, "source");
      mark(resolveSpecifier(relativeSpec, file), names);
      mark(resolveServedUrl(absoluteSpec), names);
    }

    // C) URL 变量式：先登记变量指向哪两个文件，再回查 `await import(U.href)` 取走了哪些名字。
    const urlVariables = new Map();
    for (const [, identifier, relativeSpec, absoluteSpec] of source.matchAll(URL_VARIABLE_RE)) {
      urlVariables.set(identifier, [relativeSpec, absoluteSpec]);
    }
    for (const [, list, identifier] of source.matchAll(VARIABLE_IMPORT_NAMES_RE)) {
      const specs = urlVariables.get(identifier);
      if (!specs) continue;
      const names = listNames(list, "source");
      mark(resolveSpecifier(specs[0], file), names);
      mark(resolveServedUrl(specs[1]), names);
    }
  }

  const unused = [];
  let checked = 0;
  for (const file of files) {
    if (entryPoints.has(path.resolve(file))) continue;
    const info = exportsOf(file);
    if (!info || info.opaque) continue;
    const fileKey = path.relative(ROOT, file).split(path.sep).join("/");
    if (UNUSED_EXPORT_ALLOWLIST.has(`${fileKey}::*`)) continue;
    const taken = consumed.get(file) ?? new Set();
    for (const name of info.names) {
      checked += 1;
      if (taken.has(name)) continue;
      if (UNUSED_EXPORT_ALLOWLIST.has(`${fileKey}::${name}`)) continue;
      unused.push({ file, name });
    }
  }
  return { unused, checked, entryPoints, consumed };
}

/**
 * 自检：本脚本认得的条件动态 import 写法是有限的四种（A 具名解构 / B 命名空间别名 /
 * C URL 变量 / D `.then` 形参解构）。真出现第五种时，这条检查会**静默失效** —— 消费方算不出来，
 * 目标模块还会被当成「副作用加载」整片豁免，检查全绿但什么都没在看，比误报危险得多。
 *
 * 所以逐个 `import.meta.url.startsWith(` 核对它是否落在已认样式的区间里，认不出来就报错，
 * 逼着下次改写法的人同步改这里。（这条自检本身就是为「已经踩过一次」而写的：popup-preview 的
 * `.then` 变体一度让 renderer.js 的 63 个导出判定凭空消失。）
 */
function checkForkShapes(problems) {
  const covered = [BRIDGE_BLOCK_RE, FORK_NAMESPACE_RE, FORK_THEN_RE, URL_VARIABLE_RE];
  let sites = 0;
  for (const file of files) {
    const source = codeOnly(fs.readFileSync(file, "utf8"));
    const ranges = [];
    for (const pattern of covered) {
      for (const match of source.matchAll(pattern)) ranges.push([match.index, match.index + match[0].length]);
    }
    for (const match of source.matchAll(FORK_HEAD_RE)) {
      sites += 1;
      if (ranges.some(([start, end]) => match.index >= start && match.index < end)) continue;
      const line = source.slice(0, match.index).split("\n").length;
      problems.push({
        file,
        line,
        specifier: "import.meta.url.startsWith(…)",
        missing: [],
        reason: "遇到没认出来的条件动态 import 写法：消费方算不出来、目标模块还会被误当入口豁免，请把这种写法补进本脚本"
      });
    }
  }
  return sites;
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

// 导出方自己的作用域：裸转发导出 + 文件内自用（栈顶指向导出方的那种报错）。
const scopeBindingsChecked = checkScopeBindings(problems);

// 分叉写法的自检：认不出来的写法必须报出来，不能静默失效。
const forkSites = checkForkShapes(problems);

const relative = (file) => path.relative(ROOT, file).split(path.sep).join("/");
const { unused: unusedExports, checked: exportsChecked, entryPoints, consumed } = checkUnusedExports();
const total = problems.length + unusedExports.length;

if (whyPath) {
  const target = path.resolve(ROOT, whyPath);
  const info = exportsOf(target);
  console.log(`模块 ${whyPath}`);
  if (!fs.existsSync(target)) console.log("  文件不存在");
  else if (entryPoints.has(target)) console.log(`  入口模块，整片豁免：${entryPoints.get(target)}`);
  else if (!info) console.log("  解析不出导出（不在扫描集里？）");
  else if (info.opaque) console.log("  含追不到目标的 export *，判定整体跳过（宁可不报）");
  else {
    const taken = consumed.get(target) ?? new Set();
    console.log(`  导出 ${info.names.size} 个，被别处引用 ${taken.size} 个`);
    const orphans = [...info.names].filter((name) => !taken.has(name));
    console.log(`  未被引用：${orphans.length ? orphans.join(", ") : "（无）"}`);
  }
  process.exit(0);
}

if (asJson) {
  console.log(JSON.stringify({
    scanned: files.length,
    statements,
    exportsChecked,
    problems: problems.map((problem) => ({ ...problem, file: relative(problem.file) })),
    unusedExports: unusedExports.map(({ file, name }) => ({ file: relative(file), name }))
  }, null, 2));
} else if (!total) {
  console.log(`  扫描 ${files.length} 个模块、${statements} 条具名 import、${forkSites} 处条件动态 import、${scopeBindingsChecked} 个转发导出名、${exportsChecked} 个具名导出`);
  console.log("\nOK: 具名 import 都能在目标模块里找到同名导出，且没有无人引用的导出。");
} else {
  console.log(`  扫描 ${files.length} 个模块、${statements} 条具名 import、${forkSites} 处条件动态 import、${scopeBindingsChecked} 个转发导出名、${exportsChecked} 个具名导出`);
  console.log();
  for (const problem of problems) {
    console.log(`FAIL: ${relative(problem.file)}${problem.line ? `:${problem.line}` : ""}`);
    if (problem.missing?.length) {
      console.log(`      引用 { ${problem.missing.join(", ")} } from "${problem.specifier}"`);
    } else {
      console.log(`      位置：${problem.specifier}`);
    }
    console.log(`      ${problem.reason}${problem.available ? `；目标现有导出：${problem.available.join(", ")}` : ""}`);
    console.log();
  }
  if (unusedExports.length) {
    console.log(`未使用导出 ${unusedExports.length} 处（全库没有任何模块 import 这些名字）：`);
    console.log();
    for (const { file, name } of unusedExports) {
      console.log(`FAIL: ${relative(file)}`);
      console.log(`      导出了 ${name}，但没有任何模块 import 它`);
      console.log(`      文件内自用不算数：export 是给别人用的接口，没人用就该收回（要用时再 export 回来）`);
      console.log();
    }
  }
  console.log(`${total} 项问题（导出/绑定错误 ${problems.length} + 未使用导出 ${unusedExports.length}）`);
}

process.exit(total ? 1 : 0);
