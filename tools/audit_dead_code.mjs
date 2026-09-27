/**
 * 死代码审计（开发工具，**刻意不进 CI**）。
 *
 * 为什么需要它：这个仓库已经过了好几轮清理，剩下的死代码都不是「一眼能看出来」的那种 ——
 * 它们是**一次重构之后留在原地的那一半**。真实例子（本轮清理时抓到的）：
 *
 *   - `apps/server/modules/interaction3d/device_entities.py` 整份文件不可达，而它的文件名还写在
 *     前端一个模块的注释里，注释说「后端据同一条词表复核命令」—— 那句话是假的；
 *   - `device-entity-config.js` 里整簇能力词表（DOMAIN_CAPABILITIES + 适配器注册表 +
 *     normalizeDeviceEntitySelection）的**唯一消费者**在最近一次提交里被删掉了，
 *     生产者留在原地，谁也没报错。
 *
 * 这类残留的共同点是：删掉它们不会让任何测试变红，留着也不会让任何功能出错。
 * 所以只能靠一次静态盘点，而盘点必须可重复 —— 就是本脚本。
 *
 * ## 它做两件事
 *
 *   1. **引用闭包**：从入口（页面 HTML、interaction3d 的资源白名单、Python 的可执行入口）
 *      出发解析 import / script src / link href / css url()，报告走不到的文件。
 *   2. **单次定义**：报告「名字在全仓只出现一次」的顶层定义 —— 只有定义、没有任何引用。
 *      函数与常量都查；装饰器注册的路由（FastAPI 的 `@router.get`）会被单独放行，
 *      否则每一支路由都会误报。
 *
 * ## 判不准的一律放过（与 check_invariants.mjs 同一条底线）
 *
 * 下面这些都**不参与判定**，只在结尾按类别计数，免得它们把真信号淹掉：
 *
 *   - 说明符里带 `${…}` 或字符串拼接的路径（模板拼出来的资源名，判不出真假）；
 *   - `import(expr)` 里不是字面量的动态导入；
 *   - `new URL(…, import.meta.url)`（开发态旁路，check_invariants 也刻意不算）；
 *   - 只被 `frontend/modules/runtime/**` 白名单之外的机制加载的文件；
 *   - Python 里 `__init__.py`、`db/migrations/versions/*.py`（由 alembic 按目录扫描加载）。
 *
 * ## 用法
 *
 *   node tools/audit_dead_code.mjs            只读报告（永远退出码 0）
 *   node tools/audit_dead_code.mjs --json     机器可读
 *   node tools/audit_dead_code.mjs --strict   有发现时退出码 1（给人工排查用，不要接进 CI）
 *
 * **为什么不接进 CI**：本类审计的误报模型是「要不要删由人判」；接进 CI 只能靠白名单堆人肉
 * 豁免，反而会把真信号淹掉。这与 `tools/audit_colors.mjs` 的债务度量同一定位。
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const JSON_MODE = process.argv.includes("--json");
const STRICT = process.argv.includes("--strict");

const SKIP_DIR_NAMES = new Set([
  ".git",
  ".venv",
  ".venv-store",
  "node_modules",
  "__pycache__",
  ".ruff_cache",
  ".tmp-verify",
  ".audit-scratch",
  ".audit2",
  ".deobf",
  "data"
]);

//: 前端资源候选的后缀。「vendor」整目录排除：第三方库的入口由页面直接引，内部文件不参与。
const ASSET_EXTENSIONS = new Set([".js", ".mjs", ".css", ".html"]);
const SKIP_PATH_PREFIXES = ["frontend/static/vendor/", "tools/vendor/", "frontend/static/3d-studio/models/"];

//: 页面入口：后端按这些模板渲染页面，它们引的资源就是「用户真的会下载」的那一批。
const HTML_ENTRY_GLOBS = ["frontend", "apps/store/templates", "design/scene"];

//: Python 的可执行入口。可由 `python -m` / 容器 CMD / alembic 直接拉起。
const PYTHON_ENTRIES = [
  "apps/server/main.py",
  "apps/store/app.py",
  "apps/store/run.py",
  "ops/start.py",
  "ops/container_entrypoint.py",
  "ops/docker/start_app.py",
  "ops/docker/start_store.py",
  "ops/docker/compile_python.py",
  "ops/docker/license_keys.py",
  "ops/bench_translations.py",
  "db/migrations/env.py"
];

//: 由 alembic 按目录扫描加载，不做 import 图判定。
const PYTHON_EXEMPT = [/^db\/migrations\/versions\/.*\.py$/, /__init__\.py$/];

/**
 * 不在引用闭包内、但**已知有入口**的前端文件。每条都要写清「谁在加载它」——
 * 这些路径都由服务端按目录常量拼出来，静态判不出真假，硬判只会常年亮红灯，
 * 而常年亮红灯的清单等于没有清单。
 */
const ASSET_EXEMPT = [
  {
    pattern: /^design\/scene\//,
    reason: "场景的 canonical 源：由三份分发副本手工同步，逐字节一致性由 tools/audit_colors.mjs 守着"
  },
  {
    pattern: /^(frontend\/static\/auth\/scene|apps\/store\/static\/scene)\//,
    reason: "场景片段的分发副本：apps/server/http/page_shell.py 与 apps/store/api/page_shell.py 按目录常量拼路径读取"
  }
];

/** 递归列出文件；`SKIP_DIR_NAMES` 里的目录整棵跳过。 */
function* walk(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (SKIP_DIR_NAMES.has(entry.name)) continue;
      yield* walk(path.join(dir, entry.name));
      continue;
    }
    yield path.join(dir, entry.name);
  }
}

const rel = absolute => path.relative(ROOT, absolute).split(path.sep).join("/");

function collectFiles() {
  const assets = new Set();
  const python = new Set();
  const all = [];
  for (const absolute of walk(ROOT)) {
    const relative = rel(absolute);
    if (SKIP_PATH_PREFIXES.some(prefix => relative.startsWith(prefix))) continue;
    all.push(relative);
    const extension = path.extname(relative);
    if (ASSET_EXTENSIONS.has(extension)) assets.add(relative);
    if (extension === ".py") python.add(relative);
  }
  return { assets, python, all };
}

const SKIPPED = { dynamicSpecifier: 0, dynamicImport: 0, importMetaUrl: 0, unresolvedSpecifier: 0 };

/**
 * 解析一条说明符到仓库内的真实文件；解析不出、或属于「判不出真假」的那几类时返回 null。
 * @param {string} spec 原始说明符（可能带 ?v= 查询串）。
 * @param {string} from 导入方（仓库相对路径，POSIX 分隔）。
 * @param {Set<string>} assets 候选资源集合。
 */
function resolveAsset(spec, from, assets) {
  if (!spec || /^(data:|https?:|\/\/)/.test(spec)) return null;
  // 模板拼出来的资源名（`components/${name}.js`）判不出真假，直接放过。
  if (spec.includes("${") || spec.includes("{")) {
    SKIPPED.dynamicSpecifier += 1;
    return null;
  }
  const clean = spec.split("?")[0].split("#")[0];
  if (!clean) return null;
  if (!ASSET_EXTENSIONS.has(path.extname(clean))) return null;

  // 三种「服务端口径」前缀：磁盘路径与 URL 路径并不总是同构。
  const prefixes = [
    ["/static/", "frontend/static/"],
    ["/store-static/", "apps/store/static/"],
    ["/api/v1/modules/interaction3d/", "frontend/modules/runtime/"],
    ["/modules/interaction3d/", "frontend/modules/runtime/"]
  ];
  for (const [prefix, root] of prefixes) {
    if (!clean.startsWith(prefix)) continue;
    const candidate = root + clean.slice(prefix.length);
    if (assets.has(candidate)) return candidate;
    if (prefix === "/static/") {
      const storeCandidate = "apps/store/static/" + clean.slice(prefix.length);
      if (assets.has(storeCandidate)) return storeCandidate;
    }
    SKIPPED.unresolvedSpecifier += 1;
    return null;
  }
  if (clean.startsWith("/")) return null;
  const candidate = path.posix.normalize(path.posix.join(path.posix.dirname(from), clean));
  if (assets.has(candidate)) return candidate;
  if (clean.startsWith(".")) SKIPPED.unresolvedSpecifier += 1;
  return null;
}

const SPECIFIER_RE = /["'`]([^"'`\s]+?\.(?:js|mjs|css|html))(?:\?[^"'`]*)?["'`]/g;
const ATTR_RE = /(?:src|href)\s*=\s*["']([^"']+)["']/g;
const CSS_URL_RE = /url\(\s*["']?([^"')]+)["']?\s*\)/g;

/** 建前端（js / css / html）的引用图。 */
function buildAssetGraph(assets) {
  const edges = new Map();
  const texts = new Map();
  for (const file of assets) {
    let text;
    try {
      text = fs.readFileSync(path.join(ROOT, file), "utf8");
    } catch {
      continue;
    }
    texts.set(file, text);
    const targets = new Set();
    for (const match of text.matchAll(SPECIFIER_RE)) {
      const resolved = resolveAsset(match[1], file, assets);
      if (resolved) targets.add(resolved);
    }
    if (file.endsWith(".html")) {
      for (const match of text.matchAll(ATTR_RE)) {
        const resolved = resolveAsset(match[1], file, assets);
        if (resolved) targets.add(resolved);
      }
    }
    if (file.endsWith(".css")) {
      for (const match of text.matchAll(CSS_URL_RE)) {
        const resolved = resolveAsset(match[1], file, assets);
        if (resolved) targets.add(resolved);
      }
    }
    edges.set(file, targets);
  }
  return { edges, texts };
}

/**
 * interaction3d 的资源白名单本身就是一个入口：``frontend/modules/runtime/**`` 的文件
 * 由 ``apps/server/modules/interaction3d/api.py`` 的 get_resource() 按名单下发，不经任何 import。
 * 名单里引用的名字直接当种子；名单与磁盘的一致性由 check_invariants 负责，这里不重复判。
 */
function whitelistSeeds(assets) {
  // 清单是这条路由可下发集合的唯一事实来源（后端 runtime_manifest.py 与守卫读同一份）。
  // 早先这里是从 api.py 正则抠那份 Python 字面量 —— 清单搬进 manifest.json 之后，
  // 本工具也必须跟着改，否则运行时模块会整片被判成"走不到"（CSS 尤其明显：
  // 它们的 URL 是拼出来的，没有 import 边可循）。
  const manifestFile = "frontend/modules/runtime/manifest.json";
  let payload;
  try {
    payload = JSON.parse(fs.readFileSync(path.join(ROOT, manifestFile), "utf8"));
  } catch {
    return [];
  }
  if (!Array.isArray(payload?.files)) return [];
  const seeds = [];
  for (const name of payload.files) {
    const candidate = "frontend/modules/runtime/" + name;
    if (typeof name === "string" && assets.has(candidate)) seeds.push(candidate);
  }
  return seeds;
}

/**
 * 页面入口：``<dir>/*.html`` 以及 store 的模板。
 *
 * 另外三批**按已知入口**补进来（它们都由「按目录常量拼路径」加载，静态判不出真假，
 * 硬判只会常年亮红灯）：
 *
 *   - ``design/scene/**`` 与两份分发副本：canonical 源与手工同步副本，
 *     由 ``apps/server/http/page_shell.py` / ``apps/store/api/page_shell.py` 拼路径读取，
 *     一致性由 tools/audit_colors.mjs 逐字节比对；
 *   - ``tools/`` 下的 .mjs 与 ``ops/docker/obfuscate_javascript.mjs``：开发 / 构建期的独立入口，
 *     由人直接 ``node`` 跑。
 */
function htmlSeeds(assets) {
  const seeds = [];
  for (const dir of HTML_ENTRY_GLOBS) {
    for (const file of assets) {
      if (!file.endsWith(".html")) continue;
      if (file.startsWith(dir + "/")) seeds.push(file);
    }
  }
  for (const file of assets) {
    if (file.startsWith("tools/") && (file.endsWith(".mjs") || file.endsWith(".js"))) seeds.push(file);
  }
  if (assets.has("ops/docker/obfuscate_javascript.mjs")) seeds.push("ops/docker/obfuscate_javascript.mjs");
  return seeds;
}

function closure(seeds, edges) {
  const seen = new Set();
  const stack = [...seeds];
  while (stack.length) {
    const current = stack.pop();
    if (seen.has(current)) continue;
    seen.add(current);
    for (const next of edges.get(current) || []) stack.push(next);
  }
  return seen;
}

// ---------------------------------------------------------------------------
// Python：按 import 语句建图（正则近似；这里的图只用于「有没有人引用」这一个判断）
// ---------------------------------------------------------------------------

const PY_FROM_RE = /^[ \t]*from\s+([.\w]+)\s+import\s+/gm;
const PY_IMPORT_RE = /^[ \t]*import\s+([.\w]+)/gm;

function moduleName(file) {
  const withoutExtension = file.replace(/\.py$/, "").replace(/[\/]/g, ".");
  return withoutExtension.endsWith(".__init__") ? withoutExtension.slice(0, -".__init__".length) : withoutExtension;
}

/** 取 ``from X import`` 之后那串名字（支持括号换行写法），只要合法的标识符。 */
function importedNames(text, startIndex) {
  let index = startIndex;
  while (index < text.length && (text[index] === " " || text[index] === "\t")) index += 1;
  let raw = "";
  if (text[index] === "(") {
    let depth = 0;
    for (; index < text.length; index += 1) {
      const character = text[index];
      if (character === "(") {
        depth += 1;
        continue;
      }
      if (character === ")") {
        depth -= 1;
        if (depth === 0) break;
      }
      raw += character;
    }
  } else {
    while (index < text.length && text[index] !== "\n") {
      raw += text[index];
      index += 1;
    }
  }
  return raw
    .split(",")
    .map(part => part.trim().split(/\s+as\s+/)[0].trim())
    .filter(part => /^[A-Za-z_][\w]*$/.test(part));
}

/**
 * Python 的引用图。两处必须照顾到，否则整片模块会被误报成不可达：
 *
 *   - **包**：``from .service import X`` 写在 ``apps/server/license/__init__.py`` 里时，
 *     点号的基准是这个包**自己**（``apps.server.license``），不是它的父包 ——
 *     基准算错一层，"整包都不可达"这盏灯就会亮；
 *   - **子模块**：``from apps.store.api import appearance`` 里的 ``appearance`` 是一个**模块**
 *     （``apps/store/api/__init__.py`` 是空的，靠 import 语句顺带引入），所以除了 ``apps.store.api``
 *     还要为 ``apps.store.api.appearance`` 连一条边。
 */
function buildPythonGraph(python) {
  const moduleToFile = new Map();
  for (const file of python) moduleToFile.set(moduleName(file), file);
  const edges = new Map();
  for (const file of python) {
    let text;
    try {
      text = fs.readFileSync(path.join(ROOT, file), "utf8");
    } catch {
      continue;
    }
    const name = moduleName(file);
    const isPackage = file.endsWith("__init__.py");
    const packageName = isPackage ? name : name.includes(".") ? name.slice(0, name.lastIndexOf(".")) : "";
    const targets = new Set();

    const resolve = raw => {
      const leadingDots = raw.match(/^\.+/)?.[0].length || 0;
      if (!leadingDots) return raw;
      const parts = packageName ? packageName.split(".") : [];
      const base = leadingDots > 1 ? parts.slice(0, Math.max(0, parts.length - (leadingDots - 1))) : parts;
      const remainder = raw.slice(leadingDots);
      return [...base, ...(remainder ? remainder.split(".") : [])].join(".");
    };

    for (const match of text.matchAll(PY_IMPORT_RE)) {
      const target = moduleToFile.get(match[1]);
      if (target) targets.add(target);
    }
    for (const match of text.matchAll(PY_FROM_RE)) {
      const base = resolve(match[1]);
      const baseFile = moduleToFile.get(base);
      if (baseFile) targets.add(baseFile);
      // ``from X import name`` 的 name 可能是个子模块（包不 re-export 时就是这样）。
      const namesStart = match.index + match[0].length;
      for (const imported of importedNames(text, namesStart)) {
        const submodule = moduleToFile.get(`${base}.${imported}`);
        if (submodule) targets.add(submodule);
      }
    }
    edges.set(file, targets);
  }
  return edges;
}

// ---------------------------------------------------------------------------
// 单次定义：名字在全仓只出现一次
// ---------------------------------------------------------------------------

//: 前端：函数、类、顶层 const。
const JS_DEFINITION_RES = [
  /^(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/gm,
  /^(?:export\s+)?class\s+([A-Za-z_$][\w$]*)/gm,
  /^(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=/gm
];
const PY_DEFINITION_RES = [/^def\s+([A-Za-z_][\w]*)\s*\(/gm, /^([A-Z][A-Z0-9_]{3,})\s*[:=]/gm];

/** 装饰器注册的 FastAPI 路由函数：名字只出现一次是必然的（路由表由装饰器持有），不算死代码。 */
const ROUTE_DECORATOR_RE = /^\s*@\w+\.(?:get|post|put|patch|delete|api_route|websocket)\b/m;

function singleOccurrenceDefinitions(files, texts) {
  const tokenize = /[A-Za-z_$][\w$]*/g;
  // 统计的是**总出现次数**（不是「出现在几个文件里」）：只有总数恰好为 1，
  // 才说明这个名字除了定义那一处之外没有任何引用 —— 用文件数会把「只在本文件里用的函数」
  // 全部误报成死代码（上一版就是这么写下 3000+ 条假线索的）。
  const occurrences = new Map();
  for (const file of files) {
    const text = texts.get(file);
    if (text === undefined) continue;
    for (const token of text.match(tokenize) || []) {
      occurrences.set(token, (occurrences.get(token) || 0) + 1);
    }
  }

  const findings = [];
  for (const file of files) {
    const text = texts.get(file);
    if (text === undefined) continue;
    const isPython = file.endsWith(".py");
    const regexes = isPython ? PY_DEFINITION_RES : JS_DEFINITION_RES;
    const seen = new Set();
    for (const regex of regexes) {
      for (const match of text.matchAll(regex)) {
        const name = match[1];
        if (seen.has(name)) continue;
        seen.add(name);
        if (occurrences.get(name) !== 1) continue;
        if (isPython && ROUTE_DECORATOR_RE.test(text.slice(Math.max(0, match.index - 400), match.index))) {
          continue;
        }
        findings.push({ file, name });
      }
    }
  }
  return findings.sort((left, right) => left.file.localeCompare(right.file) || left.name.localeCompare(right.name));
}

// ---------------------------------------------------------------------------

function main() {
  const { assets, python, all } = collectFiles();
  const { edges, texts } = buildAssetGraph(assets);
  const assetSeeds = new Set([...htmlSeeds(assets), ...whitelistSeeds(assets)]);
  const reachableAssets = closure(assetSeeds, edges);

  const pythonEdges = buildPythonGraph(python);
  const reachablePython = closure(PYTHON_ENTRIES.filter(file => python.has(file)), pythonEdges);

  const exemptAssets = new Map();
  const unreachableAssets = [...assets]
    .filter(file => !reachableAssets.has(file))
    // 已知入口的那几类单独列，不算「走不到」——见 ASSET_EXEMPT 的说明。
    .filter(file => {
      const exempt = ASSET_EXEMPT.find(entry => entry.pattern.test(file));
      if (!exempt) return true;
      exemptAssets.set(file, exempt.reason);
      return false;
    })
    .sort();
  const unreachablePython = [...python]
    .filter(file => !reachablePython.has(file))
    .filter(file => !PYTHON_EXEMPT.some(pattern => pattern.test(file)))
    .sort();

  // 单次定义只扫「应用代码」：第三方 vendor 与生成物里的宏名不算。
  const scanned = all.filter(
    file =>
      (file.endsWith(".js") || file.endsWith(".mjs") || file.endsWith(".py")) &&
      !SKIP_PATH_PREFIXES.some(prefix => file.startsWith(prefix)) &&
      !file.startsWith("ops/docker/node_modules/")
  );
  const scanTexts = new Map();
  for (const file of scanned) {
    try {
      scanTexts.set(file, fs.readFileSync(path.join(ROOT, file), "utf8"));
    } catch {
      // 读不到就跳过这一个文件，不影响判定整体。
    }
  }
  const singleFindings = singleOccurrenceDefinitions(scanned, scanTexts);

  if (JSON_MODE) {
    console.log(
      JSON.stringify(
        {
          unreachableAssets,
          unreachablePython,
          singleOccurrenceDefinitions: singleFindings,
          assetSeeds: [...assetSeeds].sort(),
          scannedAssetCount: assets.size,
          scannedPythonCount: python.size,
          skipped: SKIPPED
        },
        null,
        2
      )
    );
  } else {
    console.log("死代码审计（只读报告，判不准的一律放过 —— 边界见文件头）");
    console.log("");
    console.log(`入口：页面 HTML + interaction3d 白名单 ${assetSeeds.size} 个；Python 入口 ${PYTHON_ENTRIES.length} 个`);
    console.log(`闭包内：前端资源 ${reachableAssets.size}/${assets.size}；Python 模块 ${reachablePython.size}/${python.size}`);
    console.log("");
    console.log(`--- 1. 引用闭包走不到的文件（${unreachableAssets.length + unreachablePython.length} 个） ---`);
    for (const file of unreachableAssets) console.log("  " + file);
    for (const file of unreachablePython) console.log("  " + file);
    if (!unreachableAssets.length && !unreachablePython.length) console.log("  （无）");
    console.log("");
    console.log(`--- 1b. 已知入口、故不计入（${exemptAssets.size} 个） ---`);
    for (const [file, reason] of [...exemptAssets].sort()) console.log(`  ${file} —— ${reason}`);
    console.log("");
    console.log(`--- 2. 全仓只出现一次的定义（${singleFindings.length} 个；只有定义、没有任何引用） ---`);
    for (const finding of singleFindings) console.log(`  ${finding.file}: ${finding.name}`);
    if (!singleFindings.length) console.log("  （无）");
    console.log("");
    console.log("--- 3. 本次跳过的（判不出真假，故不计入上面两张清单） ---");
    console.log(`  模板拼接的说明符 ${SKIPPED.dynamicSpecifier} 处；解析不出的相对说明符 ${SKIPPED.unresolvedSpecifier} 处`);
    console.log("");
    console.log("上面两张清单都只是**线索**，删之前请逐个确认：");
    console.log("  · 闭包外的文件仍可能被模板字符串 / 白名单 / 外部工具按名字加载；");
    console.log("  · 单次定义仍可能是装饰器注册的入口、或将要被接上的扩展点。");
  }

  process.exit(STRICT && (unreachableAssets.length || unreachablePython.length || singleFindings.length) ? 1 : 0);
}

main();
