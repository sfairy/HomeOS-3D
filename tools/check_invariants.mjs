/**
 * 「不报错、只静默失效」的不变量守卫（逐条清单见文件末尾的 `checks` 数组）。
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

// 仓库路径一律来自 paths.mjs（唯一事实来源，见那个文件的模块头）。
import {
  BACKEND_DIR,
  DESIGN_DIR,
  DESIGN_SCENE_DIR,
  FRONTEND_DIR,
  ITEM_BUILDERS_DIR,
  MODELS_DIR,
  ROOT,
  RUNTIME_MODULES_DIR,
  STATIC_DIR,
  STORE_DIR,
  STORE_STATIC_DIR,
  STUDIO_DIR,
  TOOLS_DIR,
} from "./paths.mjs";
import { MODEL_SLOT_ROLES, MODEL_SLOT_ROLE_SUFFIX_RE } from "./models/model-roles.mjs";
import { measureFootprints } from "./audit_plan_symbols.mjs";
import { parse as parseModuleForDeclarations } from "./vendor/acorn/acorn.mjs";


const SKIP_DIRS = new Set([
  "vendor",
  "node_modules",
  ".venv",
  ".venv-store",
  ".extracted",
  "__pycache__",
  ".ruff_cache",
  ".git",
  "data"
]);

/**
 * 运行期由脚本动态创建、因而本就不在任何 HTML 里的 id。
 */
const DYNAMIC_IDS = new Set([
  "interaction3d-inspector",
  // 运行时舞台的提示层与拖拽幽灵：由 stage.js 在自己的容器内创建。
  "stage-hint",
  "stage-drag-ghost"
]);

function* walk(dir, extensions) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      yield* walk(full, extensions);
      continue;
    }
    if (!entry.isFile()) continue;
    if (extensions && !extensions.has(path.extname(entry.name))) continue;
    yield full;
  }
}

const rel = file => path.relative(ROOT, file);

// ---------------------------------------------------------------------------
// 1) 运行侧不得写裸 /static/ 静态 import
// ---------------------------------------------------------------------------


const STATIC_DECL_RE = /^[ \t]*(?:import|export)\s[^;]*?(?:from\s*)?["']\/static\//gm;

/** 动态 `import("/static/...")`，捕获其后的路径片段用于判断是否 vendor。 */
const STATIC_DYN_RE = /\bimport\s*\(\s*["']\/static\/([\w./@+-]+)/g;

/**
 * 运行侧的合法写法只有两种，其余一律算违规：
 */
function checkRuntimeImports() {
  const problems = [];
  for (const file of walk(RUNTIME_MODULES_DIR, new Set([".js"]))) {
    const text = fs.readFileSync(file, "utf8");
    const lineAt = index => text.slice(0, index).split("\n").length;

    for (const match of text.matchAll(STATIC_DECL_RE)) {
      problems.push({
        file: rel(file),
        line: lineAt(match.index),
        detail: text.slice(match.index, match.index + 90).split("\n").join(" ").trim()
      });
    }

    if (text.includes('startsWith("file:")')) continue;
    for (const match of text.matchAll(STATIC_DYN_RE)) {
      if (match[1].startsWith("vendor/")) continue;
      problems.push({
        file: rel(file),
        line: lineAt(match.index),
        detail: `import("/static/${match[1]}")  —— 同文件没有 file: 分流`
      });
    }
  }
  return problems.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
}

// ---------------------------------------------------------------------------
// 2) selectElement("#id") / getElementById("id") 的 id 必须存在
// ---------------------------------------------------------------------------

const ID_QUERY_RES = [
  /\bselectElement\(\s*["'`]#([A-Za-z0-9_-]+)["'`]/g,
  /\bquerySelector(?:All)?\(\s*["'`]#([A-Za-z0-9_-]+)["'`]/g,
  /\bgetElementById\(\s*["'`]([A-Za-z0-9_-]+)["'`]/g
];

function collectHtml() {
  const htmlFiles = [];
  for (const file of walk(path.join(FRONTEND_DIR), new Set([".html"]))) {
    const text = fs.readFileSync(file, "utf8");
    const ids = new Set();
    for (const match of text.matchAll(/\bid\s*=\s*["']([^"']+)["']/g)) {
      // 一个 id 属性里塞多个空格分隔的值是非法用法，但模板里偶有拼接，取第一个即可。
      ids.add(match[1].trim().split(/\s+/)[0]);
    }
    htmlFiles.push({ file, text, ids });
  }
  return htmlFiles;
}

function checkElementIds(htmlFiles) {
  const problems = [];
  const allIds = new Set();
  for (const html of htmlFiles) {
    for (const id of html.ids) allIds.add(id);
  }

  for (const file of walk(path.join(FRONTEND_DIR), new Set([".js"]))) {
    const text = fs.readFileSync(file, "utf8");
    const wanted = new Map();
    for (const re of ID_QUERY_RES) {
      for (const match of text.matchAll(re)) {
        if (wanted.has(match[1])) continue;
        const line = text.slice(0, match.index).split("\n").length;
        wanted.set(match[1], line);
      }
    }
    if (wanted.size === 0) continue;

    // 候选 HTML：正文里提到过这个 JS 文件名的页面。找不到候选（例如经 API 动态下发的
    const base = path.basename(file);
    const candidates = htmlFiles.filter(html => html.text.includes(base));
    const scope = candidates.length > 0 ? candidates : htmlFiles;

    for (const [id, line] of wanted) {
      if (DYNAMIC_IDS.has(id)) continue;
      if (scope.some(html => html.ids.has(id))) continue;
      problems.push({ file: rel(file), line, detail: `#${id}` });
    }
  }
  return problems;
}

// ---------------------------------------------------------------------------
// 3) 全站只允许一个 ?v= 戳
// ---------------------------------------------------------------------------

const STAMP_SCAN_ROOTS = [
  path.join(FRONTEND_DIR),
  path.join(STORE_DIR, "templates"),
  path.join(STORE_STATIC_DIR)
];

const STAMP_EXTRA_FILES = [
  path.join(STORE_DIR, "api", "pages.py"),
  path.join(STORE_DIR, "api", "alipay.py"),
  path.join(BACKEND_DIR, "modules", "interaction3d", "api.py")
];

const STAMP_TEXT_EXTENSIONS = new Set([".js", ".html", ".css", ".webmanifest", ".py"]);
const QUERY_V_RE = /\?v=[^"'`\s)]+/g;

/**
 * 模块身份（第 3 条真正要防的东西）。
 */
const MODULE_REF_SCAN_ROOTS = [
  path.join(FRONTEND_DIR),
  path.join(STORE_STATIC_DIR)
];

/** 静态 import / 副作用 import / re-export / 动态 import：都取说明符。 */
const MODULE_REF_RES = [
  /^[ \t]*(?:import|export)\b[^;]*?\bfrom\s*["']([^"']+)["']/gm,
  /^[ \t]*import\s*["']([^"']+)["']/gm,
  /\bimport\s*\(\s*["']([^"']+)["']/g
];

/** 说明符 → 磁盘路径（忽略 `?v=`）；解析不出或不是本仓文件返回 null。 */
function specifierToDisk(file, spec) {
  const target = spec.split("?")[0].split("#")[0];
  if (!target || /[{}]/.test(target)) return null;
  let disk;
  if (target.startsWith("/")) {
    const mount = URL_MOUNTS.find(([prefix]) => target.startsWith(prefix));
    if (!mount) return null;
    disk = path.join(mount[1], target.slice(mount[0].length));
  } else {
    if (!target.startsWith(".")) return null;
    disk = path.resolve(path.dirname(file), target);
  }
  return path.extname(disk) === ".js" && fs.existsSync(disk) ? disk : null;
}

function checkModuleInstances() {
  const byFile = new Map();
  const record = (disk, spec, at) => {
    const bucket = byFile.get(disk) ?? { stamped: [], plain: [] };
    (spec.includes("?v=") ? bucket.stamped : bucket.plain).push(`${at}  "${spec}"`);
    byFile.set(disk, bucket);
  };

  const scanJs = (file, re) => {
    const text = fs.readFileSync(file, "utf8");
    const lineAt = makeLineCounter(text);
    for (const match of text.matchAll(re)) {
      const disk = specifierToDisk(file, match[1]);
      if (disk) record(disk, match[1], `${rel(file)}:${lineAt(match.index)}`);
    }
  };

  for (const root of MODULE_REF_SCAN_ROOTS) {
    for (const file of walk(root, new Set([".js"]))) {
      for (const re of MODULE_REF_RES) scanJs(file, re);
    }
  }

  const HTML_MODULE_RES = [
    /<script\b[^>]*\btype\s*=\s*["']module["'][^>]*\bsrc\s*=\s*["']([^"']+)["']/g,
    /<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*\btype\s*=\s*["']module["']/g
  ];
  for (const root of STAMP_SCAN_ROOTS) {
    for (const file of walk(root, new Set([".html"]))) {
      const text = fs.readFileSync(file, "utf8");
      const lineAt = makeLineCounter(text);
      for (const re of HTML_MODULE_RES) {
        for (const match of text.matchAll(re)) {
          const disk = specifierToDisk(file, match[1]);
          if (disk) record(disk, match[1], `${rel(file)}:${lineAt(match.index)}`);
        }
      }
    }
  }

  const problems = [];
  for (const [disk, bucket] of byFile) {
    if (bucket.stamped.length === 0 || bucket.plain.length === 0) continue;
    problems.push({
      file: rel(disk),
      line: 0,
      detail: `同一模块被「带戳」与「不带戳」两种写法引用，浏览器里是两份实例 —— `
        + `不带戳：${bucket.plain.slice(0, 3).join("  ")}；带戳：${bucket.stamped.slice(0, 3).join("  ")}`
    });
  }
  return problems.sort((a, b) => a.file.localeCompare(b.file));
}

function checkSingleStamp() {
  const byValue = new Map();
  const files = [];
  for (const root of STAMP_SCAN_ROOTS) {
    for (const file of walk(root, STAMP_TEXT_EXTENSIONS)) files.push(file);
  }
  for (const file of STAMP_EXTRA_FILES) {
    if (fs.existsSync(file)) files.push(file);
  }

  for (const file of files) {
    const text = fs.readFileSync(file, "utf8");
    for (const match of text.matchAll(QUERY_V_RE)) {
      const value = match[0];
      // 模板占位（`?v=${storeStaticVersion}`）与 f-string 由后端在渲染期填值，
      if (value.includes("{") || value.includes("}")) continue;
      if (!byValue.has(value)) byValue.set(value, []);
      const bucket = byValue.get(value);
      if (bucket.length < 3) {
        bucket.push(`${rel(file)}:${text.slice(0, match.index).split("\n").length}`);
      }
    }
  }

  if (byValue.size <= 1) return [];
  return [...byValue.entries()].map(([value, locations]) => ({
    file: locations[0],
    line: 0,
    detail: `${value}  （共 ${locations.length} 处示例：${locations.join(", ")}）`
  }));
}

// ---------------------------------------------------------------------------
// 4) 后端包之间不得出现环
// ---------------------------------------------------------------------------

/**
 * 已知且**暂时接受**的环，按「成员包名排序后用 | 连接」登记。
 */
const ALLOWED_BACKEND_CYCLES = new Set(["apps.server.api|apps.server.modules"]);


function backendModuleName(file) {
  return rel(file)
    .replace(/\.py$/, "")
    .replace(/[\\/]/g, ".")
    .replace(/\.__init__$/, "");
}

/** 取二级包名：`apps.server.api.ha` → `apps.server.api`。 */
const backendPackageOf = moduleName => moduleName.split(".").slice(0, 2).join(".");

const PY_IMPORT_RE = /^[ \t]*(?:from\s+([.\w]+)\s+import|import\s+([.\w]+))/gm;

/**
 * 包级环检测。只看二级包之间的边，相对导入按当前文件所在目录解析 ——
 */
function checkBackendPackageCycles() {
  const files = [...walk(BACKEND_DIR, new Set([".py"]))];
  const moduleToPackage = new Map(files.map(file => [backendModuleName(file), backendPackageOf(backendModuleName(file))]));

  const edges = new Map();
  const lineAt = (text, index) => text.slice(0, index).split("\n").length;

  for (const file of files) {
    const text = fs.readFileSync(file, "utf8");
    const moduleName = backendModuleName(file);
    const fromPackage = backendPackageOf(moduleName);
    for (const match of text.matchAll(PY_IMPORT_RE)) {
      const spec = match[1] || match[2];
      if (!spec) continue;
      let target;
      if (spec.startsWith(".")) {
        const parts = moduleName.split(".");
        const ups = spec.match(/^\.+/)[0].length;
        const rest = spec.slice(ups).split(".").filter(Boolean);
        target = [...parts.slice(0, parts.length - ups), ...rest].join(".");
      } else if (spec.startsWith("apps.server.")) {
        target = spec;
      } else {
        continue;
      }
      const targetPackage = moduleToPackage.get(target) ?? backendPackageOf(target);
      if (!targetPackage.includes(".")) continue;
      if (targetPackage === fromPackage) continue;
      const key = `${fromPackage}->${targetPackage}`;
      if (!edges.has(key)) edges.set(key, `${rel(file)}:${lineAt(text, match.index)}  ${spec}`);
    }
  }

  const packages = [...new Set(moduleToPackage.values())].sort();
  const graph = new Map(packages.map(name => [name, []]));
  for (const key of edges.keys()) {
    const [from, to] = key.split("->");
    graph.get(from).push(to);
  }

  const seen = new Set();
  const cycles = [];
  const visit = (node, stack) => {
    if (stack.includes(node)) {
      const cycle = [...stack.slice(stack.indexOf(node)), node];
      const key = [...new Set(cycle)].sort().join("|");
      if (seen.has(key) || ALLOWED_BACKEND_CYCLES.has(key)) return;
      seen.add(key);
      cycles.push(cycle);
      return;
    }
    // 包数量很少（十余个），限深只是为了不把同一片图枚举到底。
    if (stack.length > 8) return;
    for (const next of graph.get(node) ?? []) visit(next, [...stack, node]);
  };
  for (const name of packages) visit(name, []);

  return cycles.map(cycle => {
    const examples = [];
    for (let i = 0; i < cycle.length - 1; i += 1) {
      examples.push(edges.get(`${cycle[i]}->${cycle[i + 1]}`) ?? `${cycle[i]} → ${cycle[i + 1]}`);
    }
    const [file, line] = examples[0].split(/\s+/)[0].split(":");
    return {
      file,
      line: Number(line) || 0,
      detail: `环：${cycle.join(" → ")}；边：${examples.join(" ; ")}`
    };
  });
}

// ---------------------------------------------------------------------------
// 5) mdi 图标版本全站唯一，且目录真实存在
// ---------------------------------------------------------------------------

/**
 * 版本号在两处语言里各有一份（JS 的 `MDI_VERSION`、本文的目录），CSS 里还有三条写死的遮罩地址。
 */
const MDI_VERSION_REF_RES = [
  /vendor\/mdi\/([0-9][\w.-]*)\//g,
  /MDI_VERSION\s*=\s*["']([^"']+)["']/g
];

const MDI_SCAN_ROOTS = [path.join(FRONTEND_DIR), path.join(BACKEND_DIR)];

function checkMdiVersion() {
  const byVersion = new Map();
  for (const root of MDI_SCAN_ROOTS) {
    for (const file of walk(root, new Set([".js", ".css", ".html", ".py"]))) {
      if (file.includes(`${path.sep}vendor${path.sep}`)) continue;
      const text = fs.readFileSync(file, "utf8");
      for (const re of MDI_VERSION_REF_RES) {
        re.lastIndex = 0;
        for (const match of text.matchAll(re)) {
          const line = text.slice(0, match.index).split("\n").length;
          if (!byVersion.has(match[1])) byVersion.set(match[1], []);
          const bucket = byVersion.get(match[1]);
          if (bucket.length < 3) bucket.push(`${rel(file)}:${line}`);
        }
      }
    }
  }

  const problems = [];
  if (byVersion.size > 1) {
    for (const [version, locations] of byVersion) {
      const [file, line] = locations[0].split(":");
      problems.push({
        file,
        line: Number(line) || 0,
        detail: `${version}  （共 ${locations.length} 处示例：${locations.join(", ")}）`
      });
    }
  }
  for (const version of byVersion.keys()) {
    const dir = path.join(STATIC_DIR, "vendor", "mdi", version);
    if (fs.existsSync(path.join(dir, "meta.json"))) continue;
    problems.push({
      file: "frontend/static/vendor/mdi",
      line: 0,
      detail: `${version} 的目录或 meta.json 不存在（版本号与 vendor 内容对不上）`
    });
  }
  return problems;
}

// ---------------------------------------------------------------------------
// 6) import 说明符（相对 + 可解析的绝对）必须落到真实文件 / 白名单上
// ---------------------------------------------------------------------------

/**
 * 判「说明符 → 真实文件」这一件事，不碰导出符号（见文件头「明确不做的事」）。
 */
const MODULE_IMPORT_RE = /^[ \t]*(?:import|export)\b[^;]*?\bfrom\s*["']([./][^"']*)["']/gm;
const MODULE_BARE_IMPORT_RE = /^[ \t]*import\s*["']([./][^"']*)["']/gm;
const MODULE_DYN_IMPORT_RE = /\bimport\s*\(\s*["']([./][^"']*)["']/g;

/** StaticFiles 挂载点 → 磁盘根。只登记真正下发 JS/CSS 的两个（商店的 `/fonts` 只发字体）。 */
const STATIC_MOUNTS = [
  ["/static/", path.join(STATIC_DIR)],
  ["/store-static/", path.join(STORE_STATIC_DIR)]
];

const RUNTIME_RESOURCE_PREFIX = "/api/v1/modules/interaction3d/";
//: 3D 交互运行时模块的磁盘根。它的"可下发集合"以同目录的 manifest.json 为唯一事实来源

/**
 * 读 `get_resource()` 里的白名单。现读而不在这里抄一份：抄一份就等于给「新增一个 runtime 模块」
 */
/**
 * 读 3D 交互运行时资源的可下发清单。
 */
function readRuntimeResourceWhitelist() {
  const manifestPath = path.join(RUNTIME_MODULES_DIR, "manifest.json");
  if (!fs.existsSync(manifestPath)) return null;
  let payload;
  try {
    payload = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch {
    return null;
  }
  if (!Array.isArray(payload?.files)) return null;
  return new Set(payload.files.filter(item => typeof item === "string"));
}

/** 扫描面与第 3 条的 `?v=` 戳一致：前端与商店的 JS 都可能被静态服务直接喂给浏览器。 */
const MODULE_SCAN_ROOTS = [path.join(FRONTEND_DIR), path.join(STORE_DIR)];

function makeLineCounter(text) {
  const starts = [0];
  for (let i = 0; i < text.length; i += 1) {
    if (text.charCodeAt(i) === 10) starts.push(i + 1);
  }
  return index => {
    let low = 0;
    let high = starts.length - 1;
    while (low < high) {
      const mid = (low + high + 1) >> 1;
      if (starts[mid] <= index) low = mid;
      else high = mid - 1;
    }
    return low + 1;
  };
}

function checkModuleSpecifiers() {
  const problems = [];
  const runtimeWhitelist = readRuntimeResourceWhitelist();

  // runtime 清单与磁盘必须一一对应，两个方向都会造成「不报错、只在浏览器里 404」：
  const manifestFile = rel(path.join(RUNTIME_MODULES_DIR, "manifest.json"));
  if (runtimeWhitelist === null) {
    problems.push({
      file: manifestFile,
      line: 0,
      detail: "读不到 3D 交互资源清单（缺文件或不是合法 JSON）—— 这条判定整体失效，请先修好它"
    });
  } else {
    for (const name of runtimeWhitelist) {
      if (!fs.existsSync(path.join(RUNTIME_MODULES_DIR, name))) {
        problems.push({
          file: manifestFile,
          line: 0,
          detail: `清单里的 "${name}" 在 frontend/modules/runtime 下已经不存在`
        });
      }
    }
    for (const file of walk(RUNTIME_MODULES_DIR, new Set([".js", ".css"]))) {
      const name = path.relative(RUNTIME_MODULES_DIR, file).split(path.sep).join("/");
      if (!runtimeWhitelist.has(name)) {
        problems.push({
          file: manifestFile,
          line: 0,
          detail: `frontend/modules/runtime/${name} 没登记进 manifest.json（请求它只会 404）`
        });
      }
    }
  }

  for (const root of MODULE_SCAN_ROOTS) {
    for (const file of walk(root, new Set([".js"]))) {
      const text = fs.readFileSync(file, "utf8");
      const lineAt = makeLineCounter(text);
      const seen = new Set();

      const report = (spec, index) => {
        // `?v=` 戳与 `#` 片段不参与文件系统解析。
        const target = spec.split("?")[0].split("#")[0];
        let disk = null;
        let unlisted = false;
        if (target.startsWith("/")) {
          // 绝对说明符只在「能算出服务端口径」时才判；其余是路由，不是文件。
          if (!/\.(?:js|css|mjs)$/.test(target)) return;
          const mount = STATIC_MOUNTS.find(([prefix]) => target.startsWith(prefix));
          if (mount) {
            disk = path.join(mount[1], target.slice(mount[0].length));
          } else if (target.startsWith(RUNTIME_RESOURCE_PREFIX)) {
            const name = target.slice(RUNTIME_RESOURCE_PREFIX.length);
            disk = path.join(RUNTIME_MODULES_DIR, name);
            unlisted = !runtimeWhitelist.has(name);
          } else {
            return;
          }
        } else {
          // 相对说明符一律按**被引用文件自己的 URL** 解析，而不是按磁盘路径 —— 对 runtime
          const runtimeName = path.relative(RUNTIME_MODULES_DIR, file);
          const insideRuntime =
            runtimeName !== "" && !runtimeName.startsWith("..") && !path.isAbsolute(runtimeName);
          if (insideRuntime) {
            const fromUrl = RUNTIME_RESOURCE_PREFIX + runtimeName.split(path.sep).join("/");
            const url = resolveRelativeUrl(fromUrl, target);
            if (!url.startsWith(RUNTIME_RESOURCE_PREFIX)) {
              const line = lineAt(index);
              const key = `${line}:${spec}`;
              if (!seen.has(key)) {
                seen.add(key);
                problems.push({
                  file: rel(file),
                  line,
                  detail:
                    `"${spec}" 在浏览器里解析到 ${url}，越出了 ${RUNTIME_RESOURCE_PREFIX} —— ` +
                    "runtime 的 URL 前缀比磁盘路径（frontend/modules/runtime/）深一层，" +
                    "磁盘上算得出来 ≠ 浏览器里取得到（实测 404，且模块图会静默断掉）。" +
                    "改为经 frontend/modules/runtime/core/static-helpers.js 的桥取用"
                });
              }
              return;
            }
            disk = path.join(RUNTIME_MODULES_DIR, url.slice(RUNTIME_RESOURCE_PREFIX.length));
          } else {
            disk = path.resolve(path.dirname(file), target);
          }
        }

        const exists = fs.existsSync(disk);
        if (exists && !unlisted) return;
        const line = lineAt(index);
        const key = `${line}:${spec}`;
        if (seen.has(key)) return;
        seen.add(key);
        problems.push({
          file: rel(file),
          line,
          detail: exists
            ? `"${spec}" —— 文件在，但没登记进 get_resource() 白名单（浏览器 404）`
            : `"${spec}" —— 解析不到文件`
        });
      };

      for (const match of text.matchAll(MODULE_IMPORT_RE)) report(match[1], match.index);
      for (const match of text.matchAll(MODULE_BARE_IMPORT_RE)) report(match[1], match.index);
      for (const match of text.matchAll(MODULE_DYN_IMPORT_RE)) report(match[1], match.index);
    }
  }
  return problems.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
}

// ---------------------------------------------------------------------------
// 7) 物件构建体必须解构它用到的每个 context 键
// ---------------------------------------------------------------------------

const STUDIO_APP = path.join(STUDIO_DIR, "studio-app.js");
const MATERIAL_STYLES_JS = path.join(STUDIO_DIR,
  "studio-material-styles.js"
);
const ITEM_TYPES_JS = path.join(STUDIO_DIR,
  "studio-item-types.js"
);

/**
 * 抹掉注释与字符串/模板，保留长度与换行 —— 这样按偏移算出的行号与原文一致。
 */
function stripCommentsAndStrings(src) {
  const out = [...src];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    const n = src[i + 1];
    if (c === "/" && n === "/") {
      while (i < src.length && src[i] !== "\n") {
        out[i] = " ";
        i += 1;
      }
      continue;
    }
    if (c === "/" && n === "*") {
      out[i] = " ";
      out[i + 1] = " ";
      i += 2;
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) {
        if (src[i] !== "\n") out[i] = " ";
        i += 1;
      }
      if (i < src.length) {
        out[i] = " ";
        out[i + 1] = " ";
        i += 2;
      }
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      const quote = c;
      out[i] = " ";
      i += 1;
      while (i < src.length && src[i] !== quote) {
        if (src[i] === "\\") {
          out[i] = " ";
          out[i + 1] = " ";
          i += 2;
          continue;
        }
        if (src[i] !== "\n") out[i] = " ";
        i += 1;
      }
      if (i < src.length) {
        out[i] = " ";
        i += 1;
      }
      continue;
    }
    i += 1;
  }
  return out.join("");
}

/** 从 openIdx 处的开括号出发，返回配对闭括号的下标；找不到返回 -1。 */
function balancedEnd(src, openIdx) {
  let depth = 0;
  for (let i = openIdx; i < src.length; i += 1) {
    const c = src[i];
    if ("{[(".includes(c)) depth += 1;
    else if ("}])".includes(c)) {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** 取一个对象字面量的顶层键名（`a,` / `b: x` / `c = d` 都算）。 */
function topLevelKeysOf(objectLiteralBody) {
  const keys = [];
  let depth = 0;
  for (const rawLine of objectLiteralBody.split("\n")) {
    if (depth === 0) {
      const match = rawLine.trim().match(/^([A-Za-z_$][\w$]*)\s*[,:]/);
      if (match) keys.push(match[1]);
    }
    for (const c of rawLine) {
      if ("{[(".includes(c)) depth += 1;
      else if ("}])".includes(c)) depth -= 1;
    }
  }
  return keys;
}

function readBuilderContextKeys() {
  const text = fs.readFileSync(STUDIO_APP, "utf8");
  const keys = new Set();
  for (const [name] of [["ITEM_BUILDER_DEPS"], ["itemBuilderContext"]]) {
    const decl = text.indexOf(`const ${name} = {`);
    if (decl === -1) continue;
    const open = text.indexOf("{", decl);
    const close = balancedEnd(text, open);
    if (close === -1) continue;
    for (const key of topLevelKeysOf(text.slice(open + 1, close))) keys.add(key);
  }
  return keys;
}

function checkBuilderContextKeys() {
  if (!fs.existsSync(STUDIO_APP) || !fs.existsSync(ITEM_BUILDERS_DIR)) return [];
  const contextKeys = readBuilderContextKeys();
  if (contextKeys.size === 0) return [];

  const problems = [];
  for (const file of walk(ITEM_BUILDERS_DIR, new Set([".js"]))) {
    // registry.js 只有分派表，没有构建体，也就没有 context 解构。
    if (path.basename(file) === "registry.js") continue;
    const raw = fs.readFileSync(file, "utf8");
    const src = stripCommentsAndStrings(raw);
    const lineAt = makeLineCounter(raw);

    const imported = new Set();
    for (const match of src.matchAll(/import\s*\{([^}]*)\}\s*from/g)) {
      for (const name of match[1].split(",")) {
        const last = name.trim().split(/\s+as\s+/).pop().trim();
        if (last) imported.add(last);
      }
    }
    for (const match of src.matchAll(/import\s+([A-Za-z_$][\w$]*)\s+from/g)) imported.add(match[1]);

    const fnRe = /export\s+function\s+([A-Za-z_$][\w$]*)\s*\(\s*([A-Za-z_$][\w$]*)\s*\)\s*\{/g;
    for (const match of src.matchAll(fnRe)) {
      const fnName = match[1];
      const paramName = match[2];
      const open = src.indexOf("{", match.index + match[0].length - 1);
      const close = balancedEnd(src, open);
      if (close === -1) continue;
      const body = src.slice(open, close + 1);

      // 该函数从 context 解构出的名字（支持 `a`、`a: b`、`a = 默认值`）。
      const destructured = new Set();
      let destructureEnd = -1;
      const declMatch = body.match(/\bconst\s*\{/);
      if (declMatch) {
        const dOpen = body.indexOf("{", declMatch.index);
        const dClose = balancedEnd(body, dOpen);
        if (dClose !== -1 && new RegExp(`=\\s*${paramName}\\s*;`).test(body.slice(dClose, dClose + paramName.length + 8))) {
          destructureEnd = body.indexOf(";", dClose);
          for (const part of body.slice(dOpen + 1, dClose).split(",")) {
            const key = part.trim().split(/[:=]/)[0].trim();
            if (/^[A-Za-z_$][\w$]*$/.test(key)) destructured.add(key);
          }
        }
      }

      const local = new Set();
      for (const d of body.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g)) local.add(d[1]);
      for (const d of body.matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)/g)) local.add(d[1]);

      for (const key of contextKeys) {
        if (imported.has(key) || destructured.has(key) || local.has(key)) continue;
        // 整词匹配、且前一个字符不是 `.`（排除属性访问）；`[$]` 需转义。
        const re = new RegExp(`([^.\\w$])${key.replace(/\$/g, "\\$")}(?![\\w$])`, "g");
        const hit = re.exec(body);
        if (!hit) continue;
        const abs = open + hit.index + 1;
        // `key:` 是对象字面量的键，不是引用。
        if (/^\s*:/.test(src.slice(abs + key.length))) continue;
        // 解构块自身里的名字不算「未解构地使用」。
        if (destructureEnd >= 0 && hit.index > 0 && hit.index < destructureEnd) continue;
        problems.push({
          file: rel(file),
          line: lineAt(abs),
          detail: `${fnName}() 用到了 context 的 ${key}，但顶部解构里没有它`
        });
      }
    }
  }
  return problems.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
}

// ---------------------------------------------------------------------------
// 8) HTML 属性 / CSS url() 里的资源引用必须解析到真实文件
// ---------------------------------------------------------------------------

/** 扫描面与第 3、6 条一致：前端与商店的 HTML/CSS 都会被浏览器直接加载。 */
const ASSET_SCAN_ROOTS = [path.join(FRONTEND_DIR), path.join(STORE_DIR)];

/** `<script src>` / `<link href>`：两种标签共用一条，属性值可以跨行。 */
const HTML_ASSET_RE = /<(?:script|link)\b[^>]*?\b(?:src|href)\s*=\s*["']([^"']+)["']/gi;
/** CSS 的 `url(...)`（带引号 / 不带引号两种写法）与 `@import "..."`。 */
const CSS_URL_RE = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)'"\s][^)'"]*?))\s*\)/gi;
const CSS_IMPORT_RE = /@import\s+["']([^"']+)["']/gi;

/** 这些前缀不是文件：协议、片段、以及由路由（而非静态目录）承载的绝对路径。 */
const NON_FILE_PREFIX_RE = /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i;

/**
 * URL 挂载表：`[URL 前缀, 磁盘根, 是否要过 runtime 白名单]`，按磁盘根由长到短排列。
 */
const URL_MOUNTS = [
  ["/api/v1/modules/interaction3d/", RUNTIME_MODULES_DIR, true],
  ["/fonts/", path.join(STORE_STATIC_DIR, "fonts"), false],
  ["/store-static/", path.join(STORE_STATIC_DIR), false],
  ["/static/", path.join(STATIC_DIR), false]
];

/** 相对引用按 URL 语义折叠 `.`/`..`，与浏览器一致。 */
function resolveRelativeUrl(fromUrl, spec) {
  const stack = [];
  for (const part of (fromUrl.slice(0, fromUrl.lastIndexOf("/") + 1) + spec).split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") stack.pop();
    else stack.push(part);
  }
  return "/" + stack.join("/");
}

/** 文件 → 它被下发时的 URL。不在任何挂载点下（由路由下发，如 index.html）返回 null。 */
function fileToUrl(file) {
  const normalized = path.resolve(file);
  for (const [prefix, dir] of URL_MOUNTS) {
    const root = path.resolve(dir);
    if (normalized === root || normalized.startsWith(root + path.sep)) {
      return prefix + path.relative(root, normalized).split(path.sep).join("/");
    }
  }
  return null;
}

/**
 * 一条资源引用换算成磁盘路径；算不出来（该由人工/路由保证）返回 null。
 */
function resolveAssetRef(spec, fromUrl, runtimeWhitelist) {
  const target = spec.split("?")[0].split("#")[0];
  // 模板占位（Jinja 的 `{{ }}`、JS 模板串）与协议/片段一律不判。
  if (!target || /[{}]/.test(target) || NON_FILE_PREFIX_RE.test(target)) return null;
  // 相对引用要先知道被引用文件自己的 URL；HTML 由路由下发（`/`、`/n/...`），算不出就放过。
  if (!target.startsWith("/") && fromUrl === null) return null;
  const url = target.startsWith("/") ? target : resolveRelativeUrl(fromUrl, target);
  const mount = URL_MOUNTS.find(([prefix]) => url.startsWith(prefix));
  if (!mount) return null;
  const name = url.slice(mount[0].length);
  if (mount[2]) return { disk: path.join(mount[1], name), unlisted: !runtimeWhitelist.has(name) };
  return { disk: path.join(mount[1], name), unlisted: false };
}

function checkHtmlAssetRefs() {
  const problems = [];
  const runtimeWhitelist = readRuntimeResourceWhitelist();

  const scan = (file, re) => {
    const text = fs.readFileSync(file, "utf8");
    const lineAt = makeLineCounter(text);
    const fromUrl = fileToUrl(file);
    const seen = new Set();
    for (const match of text.matchAll(re)) {
      const spec = match[1] ?? match[2] ?? match[3];
      if (spec === undefined) continue;
      const resolved = resolveAssetRef(spec, fromUrl, runtimeWhitelist);
      if (!resolved) continue;
      const exists = fs.existsSync(resolved.disk);
      if (exists && !resolved.unlisted) continue;
      const line = lineAt(match.index);
      const key = `${line}:${spec}`;
      if (seen.has(key)) continue;
      seen.add(key);
      problems.push({
        file: rel(file),
        line,
        detail: exists
          ? `"${spec}" —— 文件在，但没登记进 get_resource() 白名单（浏览器 404）`
          : `"${spec}" —— 解析不到文件`
      });
    }
  };

  for (const root of ASSET_SCAN_ROOTS) {
    for (const file of walk(root, new Set([".html", ".htm"]))) scan(file, HTML_ASSET_RE);
    for (const file of walk(root, new Set([".css"]))) {
      scan(file, CSS_URL_RE);
      scan(file, CSS_IMPORT_RE);
    }
  }
  return problems.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
}

// ---------------------------------------------------------------------------
// 9) 模块图对不上：导入的名字不在目标导出里 / 调用的名字在本文件没有绑定
// ---------------------------------------------------------------------------

/**
 * 本仓可解析的模块文件（与第 3 条的扫描面一致，`vendor/` 由 walk 跳过）。
 */
function moduleSourceFiles() {
  const files = [];
  for (const root of MODULE_REF_SCAN_ROOTS) {
    for (const file of walk(root, new Set([".js"]))) files.push(file);
  }
  return files;
}

function stripLineComment(line) {
  return line.replace(/(^|[^:"'`\\])\/\/.*$/, "$1");
}

function braceDepth(chunk) {
  let depth = 0;
  for (const ch of chunk) {
    if (ch === "{" || ch === "(" || ch === "[") depth += 1;
    else if (ch === "}" || ch === ")" || ch === "]") depth -= 1;
  }
  return depth;
}

/**
 * 取出「声明级」的 import / export 语句。
 */
function readModuleDeclarations(text) {
  // 用真语法树切顶层声明：按行数花括号会被字符串 / 模板串里的括号带偏（shader 字符串一多就漏声明，
  try {
    const tree = parseModuleForDeclarations(text, { ecmaVersion: "latest", sourceType: "module", locations: true });
    const declarations = [];
    for (const stmt of tree.body) {
      const isImport = stmt.type === "ImportDeclaration";
      const isExport = stmt.type === "ExportNamedDeclaration" || stmt.type === "ExportDefaultDeclaration" || stmt.type === "ExportAllDeclaration";
      if (!isImport && !isExport) continue;
      declarations.push({
        text: text.slice(stmt.start, stmt.end),
        line: stmt.loc.start.line,
        start: stmt.start,
        end: stmt.end
      });
    }
    return declarations;
  } catch {
    /* 退回下面的按行切分 */
  }
  return readModuleDeclarationsByLines(text);
}

function readModuleDeclarationsByLines(text) {
  const lines = text.split("\n");
  const lineStarts = [];
  let offset = 0;
  for (const line of lines) {
    lineStarts.push(offset);
    offset += line.length + 1;
  }
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const head = lines[i];
    if (!/^[ \t]*(?:import|export)\b/.test(head) || /^[ \t]*(?:\/\/|\*|\/\*)/.test(head)) {
      i += 1;
      continue;
    }
    let buffer = stripLineComment(head);
    let depth = braceDepth(buffer);
    let last = i;
    while (depth > 0 && last + 1 < lines.length) {
      last += 1;
      const chunk = stripLineComment(lines[last]);
      buffer += ` ${chunk}`;
      depth += braceDepth(chunk);
    }
    out.push({
      text: buffer,
      line: i + 1,
      // 声明自身的字符区间：判「这个名字在本文件还被用在哪」时必须把自己排除掉，
      start: lineStarts[i],
      end: lineStarts[last] + lines[last].length
    });
    i = last + 1;
  }
  return out;
}

function parseNamedList(source) {
  const items = [];
  for (const raw of source.split(",")) {
    const part = raw.trim();
    if (!part) continue;
    const alias = part.match(/^([\w$]+)\s+as\s+([\w$]+)$/);
    if (alias) items.push({ imported: alias[1], local: alias[2] });
    else if (/^[\w$]+$/.test(part)) items.push({ imported: part, local: part });
  }
  return items;
}

/**
 * 第三方打包产物不判：`vendor/` 下是压缩过的单行文件（`export{a as b,c,d}` 全在一行里），
 */
function isVendorModule(file) {
  return rel(file).split(path.sep).includes("vendor");
}

const moduleExportsCache = new Map();

function moduleExportsOf(file, stack = new Set()) {
  const key = path.resolve(file);
  if (isVendorModule(key)) return null;
  if (moduleExportsCache.has(key)) return moduleExportsCache.get(key);
  if (stack.has(key)) return { named: new Set(), hasDefault: false };
  stack.add(key);

  let text;
  try {
    text = fs.readFileSync(key, "utf8");
  } catch {
    stack.delete(key);
    moduleExportsCache.set(key, null);
    return null;
  }

  const named = new Set();
  let hasDefault = false;
  for (const decl of readModuleDeclarations(text)) {
    const body = decl.text;
    if (/^[ \t]*export\b/.test(body) === false) continue;
    if (/^[ \t]*export\s+default\b/.test(body)) {
      hasDefault = true;
      continue;
    }
    const from = body.match(/\bfrom\s*["']([^"']+)["']/);
    const star = body.match(/^[ \t]*export\s*\*\s*from\s*["']([^"']+)["']/);
    if (star) {
      const target = specifierToDisk(key, star[1]);
      const sub = target ? moduleExportsOf(target, stack) : null;
      if (sub) for (const name of sub.named) named.add(name);
      continue;
    }
    const braced = body.match(/\{([^}]*)\}/);
    if (braced && !/^[ \t]*export\s+(?:async\s+)?(?:function|class|const|let|var)\b/.test(body)) {
      for (const item of parseNamedList(braced[1])) named.add(item.local);
      if (from) {
        const target = specifierToDisk(key, from[1]);
        const sub = target ? moduleExportsOf(target, stack) : null;
        if (sub) {
          for (const item of parseNamedList(braced[1])) {
            if (!sub.named.has(item.imported)) {
              // 记在一个特殊键上，调用方按普通问题上报
              named.add(`\u0000missing:${item.imported}\u0000${sub.named.size === 0 ? "empty" : ""}`);
            }
          }
        }
      }
      continue;
    }
    const declared = body.match(/^[ \t]*export\s+(?:async\s+)?(?:const|let|var|function|class)\s+([\w$]+)/);
    if (declared) named.add(declared[1]);
    const pattern = body.match(/^[ \t]*export\s+(?:const|let|var)\s*\{([^}]*)\}/);
    if (pattern) for (const item of parseNamedList(pattern[1])) named.add(item.local);
  }

  stack.delete(key);
  const result = { named, hasDefault };
  moduleExportsCache.set(key, result);
  return result;
}

/**
 * 摘掉注释，供「这个名字在文件里还被用在哪」这类窄口径扫描用：只扫名字，注释里的同名文字
 */
function stripComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, block => block.replace(/[^\n]/g, ""))
    .split("\n")
    .map(stripLineComment)
    .join("\n");
}

/**
 * 找出 `name` 在本文件里的取用行（行号，1 起）。只认两种形态：
 */
function findLocalUses(text, name) {
  const lines = [];
  const callRe = new RegExp(`(^|[^\\w$.?#])${name}\\s*(?:\\?\\.)?\\s*\\(`, "g");
  const valueRe = new RegExp(`(^|[^\\w$.?#])${name}\\b(?!\\s*:)`, "g");
  text.split("\n").forEach((line, index) => {
    const stripped = stripLineComment(line);
    if (callRe.test(stripped) || valueRe.test(stripped)) lines.push(index + 1);
    callRe.lastIndex = 0;
    valueRe.lastIndex = 0;
  });
  return lines;
}

/**
 * 把若干字符区间挖空（保留换行），让「这个名字在本文件还被用在哪」的扫描看不到这些区间。
 */
function maskSpans(text, spans) {
  const chars = [...text];
  for (const [from, to] of spans) {
    for (let i = from; i < to && i < chars.length; i += 1) {
      if (chars[i] !== "\n") chars[i] = " ";
    }
  }
  return chars.join("");
}

function checkModuleBindings() {
  const problems = [];
  const files = moduleSourceFiles();

  for (const file of files) {
    const text = fs.readFileSync(file, "utf8");
    const lineAt = makeLineCounter(text);

    // ---- 9A：导入的名字必须在目标模块的导出里 ----
    for (const decl of readModuleDeclarations(text)) {
      const body = decl.text;
      const from = body.match(/\bfrom\s*["']([^"']+)["']/);
      if (!from) continue;
      const target = specifierToDisk(file, from[1]);
      if (!target) continue;
      const targetExports = moduleExportsOf(target);
      if (!targetExports) continue;
      const braced = body.match(/\{([^}]*)\}/);
      const isImport = /^[ \t]*import\b/.test(body);
      if (braced) {
        for (const item of parseNamedList(braced[1])) {
          if (targetExports.named.has(item.imported)) continue;
          // 命中的是「目标模块自己的 re-export 断了」，给一条更具体的说明
          const broken = [...targetExports.named].find(n => n.startsWith(`\u0000missing:${item.imported}\u0000`));
          problems.push({
            file: rel(file),
            line: decl.line,
            detail: `${isImport ? "import" : "export"} 的 "${item.imported}" 不在 ${rel(target)} 的导出里`
              + (broken ? `（该模块的转出口也缺这个名字）` : "")
          });
        }
      } else if (!/\*\s+as\s/.test(body)) {
        const head = body.slice(0, body.indexOf("from")).replace(/^[ \t]*(?:import|export)\s+/, "").trim();
        if (/^[\w$]+$/.test(head) && !targetExports.hasDefault) {
          problems.push({ file: rel(file), line: decl.line, detail: `${rel(target)} 没有默认导出（"${head}" 引不到）` });
        }
      }
    }

    // ---- 9A′：命名空间成员与动态解构，同样要落在目标导出里 ----
    const namespaceTargets = new Map();
    for (const decl of readModuleDeclarations(text)) {
      const ns = decl.text.match(/^[ \t]*import\s*\*\s+as\s+([\w$]+)\s*from\s*["']([^"']+)["']/);
      if (ns) {
        const target = specifierToDisk(file, ns[2]);
        if (target) namespaceTargets.set(ns[1], target);
      }
    }
    for (const [local, target] of namespaceTargets) {
      const targetExports = moduleExportsOf(target);
      if (!targetExports) continue;
      const memberRe = new RegExp(`\\b${local}\\.([\\w$]+)`, "g");
      const seen = new Set();
      for (const match of text.matchAll(memberRe)) {
        const name = match[1];
        if (targetExports.named.has(name) || seen.has(name)) continue;
        seen.add(name);
        problems.push({
          file: rel(file),
          line: lineAt(match.index),
          detail: `${local}.${name} 不在 ${rel(target)} 的导出里`
        });
      }
    }
    for (const match of text.matchAll(/const\s*\{([^}]*)\}\s*=\s*await\s*import\(\s*["']([^"']+)["']\s*\)/g)) {
      const target = specifierToDisk(file, match[2]);
      if (!target) continue;
      const targetExports = moduleExportsOf(target);
      if (!targetExports) continue;
      for (const item of parseNamedList(match[1])) {
        if (targetExports.named.has(item.imported)) continue;
        problems.push({
          file: rel(file),
          line: lineAt(match.index),
          detail: `动态解构出的 "${item.imported}" 不在 ${rel(target)} 的导出里`
        });
      }
    }
    for (const match of text.matchAll(/const\s*\{([^}]*)\}\s*=\s*await\s*\(\s*import\.meta\.url\.startsWith[\s\S]{0,400}?:\s*import\(\s*["'](\/[^"']+)["']\s*\)/g)) {
      const target = specifierToDisk(file, match[2]);
      if (!target) continue;
      const targetExports = moduleExportsOf(target);
      if (!targetExports) continue;
      for (const item of parseNamedList(match[1])) {
        if (targetExports.named.has(item.imported)) continue;
        problems.push({
          file: rel(file),
          line: lineAt(match.index),
          detail: `动态解构出的 "${item.imported}" 不在 ${rel(target)} 的导出里`
        });
      }
    }

    // ---- 9A″：纯转出口的名字，在本文件里不是绑定 ----
    const allDeclarations = readModuleDeclarations(text);
    const reexports = allDeclarations
      .map(decl => ({ decl, match: decl.text.match(/^[ \t]*export\s*\{([^}]*)\}\s*from\s*["']([^"']+)["']/) }))
      .filter(entry => entry.match);
    if (reexports.length > 0) {
      // 只挖掉「自己会列出这个名字」的语句：import 与 `export … from`。**不能**连
      const maskTargets = allDeclarations.filter(
        decl => /^[ \t]*import\b/.test(decl.text) || /\bfrom\s*["']/.test(decl.text)
      );
      const scanBody = stripComments(maskSpans(text, maskTargets.map(d => [d.start, d.end])));
      for (const { decl, match } of reexports) {
        for (const item of parseNamedList(match[1])) {
          for (const name of new Set([item.imported, item.local])) {
            const uses = findLocalUses(scanBody, name);
            if (uses.length === 0) continue;
            problems.push({
              file: rel(file),
              line: uses[0],
              detail: `"${name}" 在 export { … } from 里只是转出口、不在本模块建绑定，这里取用会 ReferenceError`
            });
          }
        }
      }
    }
  }
  return problems.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
}

// ---------------------------------------------------------------------------
// 10) JS 写入的自定义属性必须有人读
// ---------------------------------------------------------------------------

/**
 * 这一条防的是「机制没接上」：JS 侧 `style.setProperty("--x", …)` 把值算好写下去，
 */
const PROP_WRITE_RE = /setProperty\(\s*["'](--[\w-]+)["']/g;

const PROP_READ_RES = [
  /var\(\s*(--[\w-]+)/g,
  /getPropertyValue\(\s*["'](--[\w-]+)["']/g,
  /paletteColor\(\s*["'](--[\w-]+)["']/g
];

const PROP_SCAN_ROOTS = [
  path.join(FRONTEND_DIR),
  path.join(STORE_DIR),
  path.join(DESIGN_DIR)
];

/** 全站自定义属性的读取点集合（`--x` → 首次出现的 file:line）。 */
function collectCssPropReads() {
  const reads = new Map();
  for (const root of PROP_SCAN_ROOTS) {
    for (const file of walk(root, null)) {
      if (![".js", ".css", ".html", ".py", ".webmanifest"].includes(path.extname(file))) continue;
      const text = fs.readFileSync(file, "utf8");
      for (const pattern of PROP_READ_RES) {
        for (const match of text.matchAll(pattern)) {
          if (reads.has(match[1])) continue;
          reads.set(match[1], `${rel(file)}:${text.slice(0, match.index).split("\n").length}`);
        }
      }
    }
  }
  return reads;
}

/**
 * 已知「写下去但没人读」的 10 枚令牌，共 5 套机制。每条都要写明**缺的是哪一半**，
 */
const UNWIRED_CSS_PROPS = new Map([]);

function checkUnreadCustomProps() {
  const reads = collectCssPropReads();
  const problems = [];
  for (const root of PROP_SCAN_ROOTS) {
    for (const file of walk(root, new Set([".js"]))) {
      const text = fs.readFileSync(file, "utf8");
      for (const match of text.matchAll(PROP_WRITE_RE)) {
        const name = match[1];
        // 拼接写法的前缀（`"--hb-bed-" + …`）以 `-` 结尾，不是完整令牌名。
        if (name.endsWith("-")) continue;
        if (reads.has(name) || UNWIRED_CSS_PROPS.has(name)) continue;
        problems.push({
          file: rel(file),
          line: text.slice(0, match.index).split("\n").length,
          detail:
            `setProperty("${name}", …) 写入了这个自定义属性，但全站没有 var(${name}) / ` +
            `getPropertyValue("${name}") 取用它 —— 这行 JS 是静默空转`
        });
      }
    }
  }
  return problems.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
}

// ---------------------------------------------------------------------------

/**
 * 第 11 条：令牌引用被「粘」在十六进制残渣上 —— `var(--x)d1`。
 */
const CSS_SCAN_ROOTS = [
  path.join(FRONTEND_DIR),
  path.join(STORE_DIR),
  path.join(DESIGN_DIR)
];

/**
 * `theme-color` / webmanifest 里的写死色值与色板走散。
 */
const THEME_COLOR_TOKENS = ["--hos-sky-deep", "--hos-tool-bg"];

function checkThemeColorLeavesPalette() {
  const { resolve } = collectPaletteColors();
  const allowed = new Map();
  for (const token of THEME_COLOR_TOKENS) {
    const color = resolve(token);
    if (!color) continue;
    const hex = "#" + color.slice(0, 3).map((v) => v.toString(16).padStart(2, "0")).join("");
    if (!allowed.has(hex)) allowed.set(hex, token);
  }
  const problems = [];
  const complain = (file, text, index, label, value) => {
    if (allowed.has(value.toLowerCase())) return;
    problems.push({
      file: rel(file),
      line: text.slice(0, index).split("\n").length,
      detail:
        `${label} 是 ${value}，而色板里页面最底层的取值只有 ` +
        `${[...allowed.keys()].join(" / ")}（${[...allowed.values()].join(" / ")}）—— ` +
        "这几处吃不下 var()，改动色板时必须同手改这里，否则会停在旧色上"
    });
  };
  for (const root of CSS_SCAN_ROOTS) {
    for (const file of walk(root, new Set([".html", ".py", ".webmanifest"]))) {
      const text = fs.readFileSync(file, "utf8");
      for (const match of text.matchAll(/<meta\b[^>]*>/g)) {
        const tag = match[0];
        if (!/name\s*=\s*["']theme-color["']/.test(tag)) continue;
        const content = /content\s*=\s*["'](#[0-9a-fA-F]{3,8})["']/.exec(tag);
        if (content) complain(file, text, match.index, "theme-color", content[1]);
      }
      for (const match of text.matchAll(/"(theme_color|background_color)"\s*:\s*"(#[0-9a-fA-F]{3,8})"/g)) {
        complain(file, text, match.index, match[1], match[2]);
      }
    }
  }
  return problems.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
}

function checkGluedTokenRefs() {
  const problems = [];
  for (const root of CSS_SCAN_ROOTS) {
    for (const file of walk(root, new Set([".css", ".html"]))) {
      const text = fs.readFileSync(file, "utf8");
      const opener = /var\(/g;
      let match;
      while ((match = opener.exec(text))) {
        // 按括号配对找到这个 var(...) 的收尾 —— 兜底值里可能还有嵌套。
        let cursor = match.index + 4;
        let depth = 1;
        while (cursor < text.length && depth > 0) {
          if (text[cursor] === "(") depth++;
          else if (text[cursor] === ")") depth--;
          cursor++;
        }
        if (depth !== 0) continue;
        const after = text.slice(cursor, cursor + 2);
        // 只看「十六进制位」且后面不再接标识符字符：`var(--x)auto` 是正常写法，
        if (!/^[0-9a-fA-F]{1,2}(?![0-9a-zA-Z_-])/.test(after)) continue;
        problems.push({
          file: rel(file),
          line: text.slice(0, match.index).split("\n").length,
          detail:
            `${match[0]}…${text.slice(match.index, cursor).slice(-24)} + ${JSON.stringify(after)} —— ` +
            `var() 后面粘着十六进制位：` +
            `多半是 8 位色值被按 6 位替换过，两位 α 留在了括号外，整条声明会失效`
        });
      }
    }
  }
  return problems.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
}

// ---------------------------------------------------------------------------

/**
 * 第 12 条：`var(--hos-x, 兜底值)` 的兜底值与令牌的 canonical 值不一致。
 */
const FALLBACK_RE =
  /var\(\s*(--hos-[\w-]+)\s*,\s*(#[0-9a-fA-F]{6}|rgba?\([^()]*\)|\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3})\s*\)/g;

/**
 * JS 侧的同一件事：`paletteColor("--hos-x", "#兜底")`。
 */
const PALETTE_FALLBACK_RE =
  /paletteColor\(\s*["'](--hos-[\w-]+)["']\s*,\s*["'](#[0-9a-fA-F]{6}|rgba?\([^()]*\)|\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3})["']/g;

const TOKEN_FALLBACK_PAIR_RE =
  /token\s*:\s*["'](--hos-[\w-]+)["']\s*,\s*(?:rgb)?[Ff]allback\s*:\s*["']([^"']+)["']|(?:rgb)?[Ff]allback\s*:\s*["']([^"']+)["']\s*,\s*token\s*:\s*["'](--hos-[\w-]+)["']/g;

function collectPaletteColors() {
  const text = fs
    .readFileSync(path.join(DESIGN_SCENE_DIR, "page.css"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "");
  const raw = new Map();
  for (const m of text.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    if (!raw.has(m[1])) raw.set(m[1], m[2].trim());
  }
  const asHex = v => {
    const m = /^#([0-9a-fA-F]{6})$/.exec(v);
    if (!m) return null;
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
  };
  const asTriplet = v => {
    const m = /^(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})$/.exec(v);
    return m ? [Number(m[1]), Number(m[2]), Number(m[3]), 1] : null;
  };
  const asRgba = v => {
    const m = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*([\d.]+))?\s*\)$/.exec(v);
    return m ? [Number(m[1]), Number(m[2]), Number(m[3]), m[4] === undefined ? 1 : Number(m[4])] : null;
  };
  const resolve = (name, seen = new Set()) => {
    if (seen.has(name)) return null;
    seen.add(name);
    const value = raw.get(name);
    if (value === undefined) return null;
    const simple = asHex(value) || asTriplet(value) || asRgba(value);
    if (simple) return simple;
    const composed = /^rgba\(\s*var\(\s*(--[\w-]+)\s*\)\s*,\s*([\d.]+)\s*\)$/.exec(value);
    if (composed) {
      const base = resolve(composed[1], seen);
      return base ? [base[0], base[1], base[2], Number(composed[2])] : null;
    }
    return null;
  };
  return { resolve, asHex, asTriplet, asRgba };
}

function checkFallbackDrift() {
  const { resolve, asHex, asTriplet, asRgba } = collectPaletteColors();
  const problems = [];
  const describe = (color) =>
    `rgb(${color[0]}, ${color[1]}, ${color[2]})` + (color[3] < 1 ? ` α${color[3]}` : "");
  for (const root of CSS_SCAN_ROOTS) {
    for (const file of walk(root, new Set([".css", ".js"]))) {
      const text = fs.readFileSync(file, "utf8");
      // 三种写法同一件事：CSS 的 var(--x, 兜底)、JS 的 paletteColor("--x", "兜底")、
      const forms = [
        { re: FALLBACK_RE, form: "var() 兜底", tokenGroup: 1, valueGroup: 2 },
        { re: PALETTE_FALLBACK_RE, form: "paletteColor() 兜底", tokenGroup: 1, valueGroup: 2 },
        { re: TOKEN_FALLBACK_PAIR_RE, form: "token/fallback 成对兜底", pair: true }
      ];
      for (const { re, form, tokenGroup, valueGroup, pair } of forms) {
        for (const match of text.matchAll(re)) {
          const tokenName = pair ? match[1] || match[4] : match[tokenGroup];
          const literal = pair ? match[2] || match[3] : match[valueGroup];
          const canonical = resolve(tokenName);
          if (!canonical) continue;
          const fallback = asHex(literal) || asRgba(literal) || asTriplet(literal);
          if (!fallback) continue;
          const same =
            canonical[0] === fallback[0] &&
            canonical[1] === fallback[1] &&
            canonical[2] === fallback[2] &&
            Math.abs(canonical[3] - fallback[3]) < 0.005;
          if (same) continue;
          problems.push({
            file: rel(file),
            line: text.slice(0, match.index).split("\n").length,
            detail:
              `${tokenName} 的 ${form}值 ${literal} 与 canonical ${describe(canonical)} 不一致 —— ` +
              "令牌一旦缺失，这里会渲染出另一套颜色。差异特别大时先怀疑**令牌选错了**" +
              "（消费者预期的颜色与 canonical 不是一族），那就改令牌；只是旧值残留时才改兜底"
          });
        }
      }
    }
  }
  return problems.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
}

// ---------------------------------------------------------------------------

/**
 * 第 13 条：SVG 里的注释是非法 XML —— 注释体内出现连续两个连字符。
 */
const SVG_COMMENT_RE = /<!--([\s\S]*?)-->/g;

function checkMarkupComments() {
  const problems = [];
  for (const root of CSS_SCAN_ROOTS) {
    for (const file of walk(root, new Set([".svg"]))) {
      const text = fs.readFileSync(file, "utf8");
      for (const match of text.matchAll(SVG_COMMENT_RE)) {
        // 注释体里只要还有 `--`，就是非法的（结束符已经由正则切掉）
        if (!match[1].includes("--")) continue;
        const inner = match[1].indexOf("--");
        const at = match.index + 4 + inner;
        problems.push({
          file: rel(file),
          line: text.slice(0, at).split("\n").length,
          detail:
            "SVG 注释里含连续两个连字符（如 var(--hos-x) 或 --hos-sky-deep）—— " +
            "SVG 按 XML 解析，整个文件会 not well-formed、画面空白。写令牌名时省掉前导横线"
        });
      }
    }
  }
  return problems.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
}

// ---------------------------------------------------------------------------

/**
 * 第 14 条：八族可配置光的 `-soft` / `-line` α 与 `appearance.js` 的契约不符。
 */
const FAMILY_SOFT_LINE_RE =
  /(--[\w-]+-(soft|line))\s*:\s*(rgba\([^;]*?\)|#[0-9a-fA-F]{8})\s*;/g;
const FAMILY_RGB_IN_VALUE_RE = /var\(\s*--(?:hos|hb)-(accent|lumen|heat|cool|eco|aura|sensor|alert)-rgb\s*\)/;
const SOFT_LINE_CONTRACT = { soft: 0.13, line: 0.32 };

/** 从 `rgba(a, b, c, α)` 或 8 位十六进制 `#rrggbbaa` 里取出 α。 */
function alphaOfSoftLineValue(value) {
  if (value.startsWith("#")) return parseInt(value.slice(-2), 16) / 255;
  const parts = value.replace(/^rgba\(|\)$/g, "").split(",");
  const last = parts[parts.length - 1]?.trim();
  return last === undefined ? null : Number(last);
}

function checkSoftLineAlpha() {
  const problems = [];
  for (const root of CSS_SCAN_ROOTS) {
    for (const file of walk(root, new Set([".css"]))) {
      const text = fs.readFileSync(file, "utf8");
      // 先剥注释：注释里常写着「原来是 0.12」这类示例值，不该被当作定义
      const stripped = text.replace(/\/\*[\s\S]*?\*\//g, (m) => "\n".repeat(m.split("\n").length - 1));
      for (const match of stripped.matchAll(FAMILY_SOFT_LINE_RE)) {
        const [full, token, kind, value] = match;
        if (token.includes("-text")) continue;
        if (!FAMILY_RGB_IN_VALUE_RE.test(value)) continue;
        const alpha = alphaOfSoftLineValue(value);
        if (alpha === null || Number.isNaN(alpha)) continue;
        const want = SOFT_LINE_CONTRACT[kind];
        if (Math.abs(alpha - want) <= 1e-6) continue;
        problems.push({
          file: rel(file),
          line: stripped.slice(0, match.index).split("\n").length,
          detail:
            `${token} 的 α 是 ${Number(alpha.toFixed(4))}，契约要求 ${want}（${full.trim()}）—— ` +
            "八族柔光 / 描边的 α 只在 appearance.js:178-179 定义一次，" +
            "各页面请引用 canonical 取值而不是手写 rgba()"
        });
      }
    }
  }
  return problems.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
}

// ---------------------------------------------------------------------------

const EXTERNAL_MODELS_JS = path.join(STATIC_DIR,
  "3d-studio",
  "loaders",
  "studio-external-models.js"
);
/**
 * 注册表条目：`类型: defineHomeItemModel("子目录", "文件基名", {`。
 */
const MODEL_ENTRY_RE =
  /^[ \t]*([a-z_0-9]+):\s*define(?:Home|Appliance)ItemModel\(\s*"([^"]+)"\s*,\s*"([^"]+)"\s*,/gm;
/** 换戳脚本的版本戳形状（yymmddHHMM）。模型文件基名绝不该长这样。 */
const MODEL_VERSION_STAMP_RE = /^\d{10}$/;

/** models/ 下的全部 GLB，相对 models/ 的路径。 */
function collectModelFiles() {
  const found = [];
  const walk = directory => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name.endsWith(".glb")) {
        found.push(path.relative(MODELS_DIR, full).split(path.sep).join("/"));
      }
    }
  };
  if (fs.existsSync(MODELS_DIR)) {
    walk(MODELS_DIR);
  }
  return found;
}

/**
 * 读一个 GLB 的包围盒与材质名。只用 Node 内置能力解析容器（magic / chunk / JSON），
 */
function readGlbSummary(file) {
  const buffer = fs.readFileSync(file);
  if (buffer.length < 12 || buffer.readUInt32LE(0) !== 0x46546c67) {
    return { error: "magic 不是 glTF（不是 GLB 文件）" };
  }
  const declaredLength = buffer.readUInt32LE(8);
  if (declaredLength !== buffer.length) {
    return { error: `头部声明 ${declaredLength} 字节、实际 ${buffer.length} 字节（文件被截断）` };
  }
  let offset = 12;
  let json = null;
  while (offset + 8 <= buffer.length) {
    const chunkLength = buffer.readUInt32LE(offset);
    const chunkType = buffer.readUInt32LE(offset + 4);
    const body = buffer.subarray(offset + 8, offset + 8 + chunkLength);
    if (chunkType === 0x4e4f534a) {
      try {
        json = JSON.parse(body.toString("utf8"));
      } catch (error) {
        return { error: `JSON chunk 解析失败：${error.message}` };
      }
    }
    offset += 8 + chunkLength + ((4 - (chunkLength % 4)) % 4);
  }
  if (!json) {
    return { error: "缺 JSON chunk" };
  }
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  let vertices = 0;
  for (const mesh of json.meshes || []) {
    for (const primitive of mesh.primitives || []) {
      const accessor = json.accessors?.[primitive.attributes?.POSITION];
      if (!accessor) {
        return { error: "网格缺 POSITION 访问器" };
      }
      vertices += accessor.count;
      if (accessor.min && accessor.max) {
        for (let axis = 0; axis < 3; axis += 1) {
          min[axis] = Math.min(min[axis], accessor.min[axis]);
          max[axis] = Math.max(max[axis], accessor.max[axis]);
        }
      }
    }
  }
  if (!Number.isFinite(min[0])) {
    return { error: "所有 POSITION 访问器都没有 min/max，取不到包围盒" };
  }
  return { min, max, vertices, materials: (json.materials || []).map(material => material.name) };
}

/**
 * 流水线生成的模型规格（tools/models/model-specs.mjs）。
 */
const { PIPELINE_MODEL_SPECS, PIPELINE_LITE_VERTEX_BUDGET_RATIO } = await (async () => {
  try {
    const module = await import(path.join(TOOLS_DIR, "models", "model-specs.mjs"));
    return {
      PIPELINE_MODEL_SPECS: module.MODEL_SPECS,
      // lite 顶点预算的缺省上限比例与生成器取同一个来源；这里不抄一个 0.9，两端各写一份
      PIPELINE_LITE_VERTEX_BUDGET_RATIO: module.DEFAULT_LITE_VERTEX_BUDGET_RATIO ?? 0.9
    };
  } catch {
    return { PIPELINE_MODEL_SPECS: null, PIPELINE_LITE_VERTEX_BUDGET_RATIO: 0.9 };
  }
})();

/** 包围盒容差：1.5mm。生成器的规格校验是 1mm，这里多留 0.5mm 给导出往返的浮点误差。 */
const GLB_SIZE_TOLERANCE_METERS = 0.0015;

/**
 * 磁盘 GLB 的内容必须与注册表 `scaleBasis` 自洽。
 */
function checkModelGlbIntegrity() {
  const problems = [];
  if (!PIPELINE_MODEL_SPECS) {
    return problems;
  }
  const text = fs.readFileSync(EXTERNAL_MODELS_JS, "utf8");
  MODEL_ENTRY_RE.lastIndex = 0;
  const entries = [];
  let match;
  while ((match = MODEL_ENTRY_RE.exec(text))) {
    entries.push({ itemType: match[1], modelDir: match[2], fileKey: match[3], index: match.index });
  }
  const slotNamePattern = /^material-(\d+)(?:-[a-z][a-z0-9]*)?$/;
  const axisNames = ["宽", "高", "深"];
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    // 条目文本 = 本条起点到下一条起点；末条到文件尾。scaleBasis 就在这段里。
    if (!PIPELINE_MODEL_SPECS[entry.itemType]) {
      continue;
    }
    const blockEnd = index + 1 < entries.length ? entries[index + 1].index : text.length;
    const block = text.slice(entry.index, blockEnd);
    const relative = `${entry.modelDir}/${entry.fileKey}`;
    const fullPath = path.join(MODELS_DIR, `${relative}.glb`);
    if (!fs.existsSync(fullPath)) {
      continue;
    }
    const full = readGlbSummary(fullPath);
    if (full.error) {
      problems.push({ file: rel(fullPath), line: 0, detail: `${entry.itemType} 的完整版读不了：${full.error}` });
      continue;
    }
    // 材质名契约：一槽一材质，名字必须是 material-<槽位号>，且槽位号不重复。
    const slotNumbers = [];
    for (const materialName of full.materials) {
      const slotMatch = slotNamePattern.exec(materialName || "");
      if (!slotMatch) {
        problems.push({
          file: rel(fullPath),
          line: 0,
          detail:
            `${entry.itemType}：材质名「${materialName}」不是 material-<槽位号> 形状。` +
            "运行侧按槽位号与后缀查色卡，名字对不上等于「模型到位后颜色不跟着风格走」，且没有兜底"
        });
      } else {
        slotNumbers.push(Number(slotMatch[1]));
      }
    }
    if (new Set(slotNumbers).size !== slotNumbers.length) {
      problems.push({
        file: rel(fullPath),
        line: 0,
        detail: `${entry.itemType}：同一槽位出了多块材质（${slotNumbers.join(",")}），应一槽一网格`
      });
    }
    // 包围盒与 scaleBasis 逐轴比对。
    const basisMatch = /scaleBasis:\s*\[([^\]]+)\]/.exec(block);
    if (basisMatch) {
      const wanted = basisMatch[1].split(",").map(value => Number(value.trim()));
      if (wanted.length === 3 && wanted.every(value => Number.isFinite(value))) {
        const actual = [full.max[0] - full.min[0], full.max[1] - full.min[1], full.max[2] - full.min[2]];
        const wantedWithExtent = [
          wanted[0],
          PIPELINE_MODEL_SPECS[entry.itemType].authoredHeight ?? wanted[1],
          wanted[2]
        ];
        for (let axis = 0; axis < 3; axis += 1) {
          if (Math.abs(actual[axis] - wantedWithExtent[axis]) > GLB_SIZE_TOLERANCE_METERS) {
            problems.push({
              file: rel(fullPath),
              line: 0,
              detail:
                `${entry.itemType}：磁盘文件${axisNames[axis]} ${actual[axis].toFixed(3)}m、` +
                `声明 ${wantedWithExtent[axis].toFixed(3)}m（差 ${Math.abs(actual[axis] - wantedWithExtent[axis]).toFixed(3)}m）。` +
                "运行侧按 scaleBasis 非等比缩放，不一致就会被拉变形；多半是改了规格没重新导出"
            });
          }
        }
        // 底面高度按规格里的 `mountHeight` 判（缺省 0）：挂墙件（吊柜）把挂高烘在几何里，柜底本来
        const wantedMinY = PIPELINE_MODEL_SPECS[entry.itemType].mountHeight ?? 0;
        if (Math.abs(full.min[1] - wantedMinY) > GLB_SIZE_TOLERANCE_METERS) {
          problems.push({
            file: rel(fullPath),
            line: 0,
            detail:
              `${entry.itemType}：底面 min.y = ${full.min[1].toFixed(3)}m 不在 y=${wantedMinY}。` +
              "运行侧把原点直接贴地（挂墙件则按烘好的挂高悬空），偏了会埋进地板或浮空"
          });
        }
        for (const axis of [0, 2]) {
          const center = (full.min[axis] + full.max[axis]) / 2;
          if (Math.abs(center) > GLB_SIZE_TOLERANCE_METERS) {
            problems.push({
              file: rel(fullPath),
              line: 0,
              detail:
                `${entry.itemType}：${axis === 0 ? "x" : "z"} 方向占地中心 ${center.toFixed(3)}m 不在原点` +
                "（摆放按占地居中算，偏心会视觉偏出包围盒）"
            });
          }
        }
      }
    }
    // lite 版必须真的更轻。
    const litePath = path.join(MODELS_DIR, `${relative}-lite.glb`);
    if (fs.existsSync(litePath)) {
      const lite = readGlbSummary(litePath);
      if (lite.error) {
        problems.push({ file: rel(litePath), line: 0, detail: `${entry.itemType} 的 lite 版读不了：${lite.error}` });
      } else {
        for (const axis of [0, 1, 2]) {
          const drift = Math.max(
            Math.abs(lite.min[axis] - full.min[axis]),
            Math.abs(lite.max[axis] - full.max[axis])
          );
          if (drift > GLB_SIZE_TOLERANCE_METERS) {
            problems.push({
              file: rel(litePath),
              line: 0,
              detail:
                `${entry.itemType}：lite 的包围盒与完整版不一致（${axisNames[axis]}向差 ${drift.toFixed(3)}m）。` +
                "lite 是运行侧的主资源，撑轮廓的零件被丢在完整版里，物件一到位就会缩一圈；" +
                "多半是某件撑着外轮廓的零件打了 fullOnly，或改了规格没重新导出"
            });
          }
        }
        // 上限比例跟着规格走（缺省取生成器同源的 DEFAULT_LITE_VERTEX_BUDGET_RATIO）。方柱这类
        const budgetRatio =
          PIPELINE_MODEL_SPECS[entry.itemType].liteVertexBudgetRatio ?? PIPELINE_LITE_VERTEX_BUDGET_RATIO;
        if (lite.vertices > full.vertices * budgetRatio) {
          problems.push({
            file: rel(litePath),
            line: 0,
            detail:
              `${entry.itemType}：lite ${lite.vertices} 顶点未低于完整版 ${full.vertices} 的 ${budgetRatio} 倍` +
              "（首屏那份没省下东西）"
          });
        }
      }
    }
  }
  return problems;
}

const STUDIO_APP_JS = path.join(STUDIO_DIR, "studio-app.js");
const STORAGE_CABINETS_BUILDER_JS = path.join(ITEM_BUILDERS_DIR,
  "storage-cabinets.js"
);

/**
 * 吊柜的挂高（柜底离地）必须三处同源。
 */
function checkWallCabinetMountHeightParity() {
  const problems = [];
  const spec = PIPELINE_MODEL_SPECS?.wallcabinet;
  if (!spec) {
    return problems;
  }
  const declaredMountHeight = spec.mountHeight ?? 0;

  const builderText = fs.readFileSync(STORAGE_CABINETS_BUILDER_JS, "utf8");
  const builderMatch = /const wallCabinetMountHeight = ([0-9.]+)/.exec(builderText);
  const builderMountHeight = builderMatch ? Number(builderMatch[1]) : 0;
  const builderLine = builderMatch
    ? builderText.slice(0, builderMatch.index).split("\n").length
    : 0;
  if (Math.abs(builderMountHeight - declaredMountHeight) > 0.001) {
    problems.push({
      file: rel(STORAGE_CABINETS_BUILDER_JS),
      line: builderLine,
      detail:
        `占位几何的挂高 ${builderMountHeight}m 与规格 wallcabinet.mountHeight（${declaredMountHeight}m）不一致。` +
        "占位件只活到 GLB 落地那一帧，两边不同就是「加载完成时整件跳一下」"
    });
  } else if (
    declaredMountHeight > 0 &&
    // 只在**摘掉注释**的源码里数：文档注释里也会写到这个名字，直接数全文会把它当成一次使用。
    stripComments(builderText).split("wallCabinetMountHeight").length - 1 < 2
  ) {
    problems.push({
      file: rel(STORAGE_CABINETS_BUILDER_JS),
      line: builderLine,
      detail:
        `wallCabinetMountHeight 只声明了、没有加进摆放坐标（占位件仍是 0 基），` +
        `而规格把整件抬了 ${declaredMountHeight}m —— 两边差一个挂高`
    });
  }

  const appText = fs.readFileSync(STUDIO_APP_JS, "utf8");
  const definitionStart = appText.indexOf("\n  wallcabinet: {");
  if (definitionStart === -1) {
    problems.push({
      file: rel(STUDIO_APP_JS),
      line: 0,
      detail:
        "ITEM_TYPE_DEFINITIONS 里找不到 `wallcabinet: {`（改名或挪了位置？）—— " +
        "本判据读的是这一段的源码文本，读不到就整条失效"
    });
    return problems;
  }
  const definitionText = stripComments(appText.slice(definitionStart));
  let depth = 0;
  let definitionEnd = 0;
  for (let index = 0; index < definitionText.length; index += 1) {
    const ch = definitionText[index];
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        definitionEnd = index;
        break;
      }
    }
  }
  const definitionBody = definitionText.slice(0, definitionEnd);
  const elevationMatch = /^[ \t]*elevation\s*:/m.exec(definitionBody);
  if (declaredMountHeight > 0 && elevationMatch) {
    // 两段的行数各自都算了「份数」（含换行数 +1），交界处的那个换行被数了两次 —— 减 1。
    const lineOf = (upTo) =>
      appText.slice(0, definitionStart).split("\n").length +
      definitionBody.slice(0, upTo).split("\n").length -
      1;
    problems.push({
      file: rel(STUDIO_APP_JS),
      line: lineOf(elevationMatch.index),
      detail:
        `挂高已经烘进几何（规格 mountHeight = ${declaredMountHeight}m），类型定义里不能再有 elevation。` +
        "原版那一格是 0，留着它 → 草稿里没写这一格的吊柜，本仓按这个默认值抬、原版按 0 抬，" +
        "两个默认落点差一个挂高"
    });
  }
  return problems;
}

/**
 * 流水线 GLB 里不得有**会闪的**共面重叠（z-fighting）。
 */
function checkCoplanarOverlaps() {
  const problems = [];
  let payload;
  try {
    payload = JSON.parse(
      execFileSync(process.execPath, [path.join(TOOLS_DIR, "audit_coplanar_faces.mjs"), "--json"], {
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024
      })
    );
  } catch (error) {
    // 审计脚本自身跑不起来时**必须报错**：静默返回「通过」会让这条守卫在无人察觉的情况下失效，
    problems.push({
      file: "tools/audit_coplanar_faces.mjs",
      line: 0,
      detail: `共面审计跑不起来，全库一件都没判：${error.message.split("\n")[0]}`
    });
    return problems;
  }
  for (const entry of payload.unreadable || []) {
    // 作用域与标题一致：这条判据管的是**流水线产物**的几何。既有资产（第三方导出，
    if (!PIPELINE_MODEL_SPECS[entry.type.replace(/-lite$/, "")]) {
      continue;
    }
    problems.push({
      file: entry.file,
      line: 0,
      detail: `${entry.type}：${entry.skipped.join("；")} —— 这件的共面重叠没判到（不是没问题）`
    });
  }
  for (const entry of payload.files || []) {
    for (const row of entry.rows || []) {
      problems.push({
        file: entry.file,
        line: 0,
        detail:
          `${entry.type}：${row.axis}=${row.coordinate}m 处 ${row.materials} 有 ${row.areaCm2}cm² 的` +
          `${row.sameFacing ? "同向" : "玻璃双面"}共面重叠（相机一动就闪）`
      });
    }
  }
  return problems;
}

/**
 * 模型资源的两端对齐：注册表写出的路径必须真有文件，磁盘上的 GLB 也必须被注册表引用。
 */
const DERIVED_MODEL_TYPE_RE =
  /^(curtain_(left|right|split)|pillar_(round|semicircle|quarter|quarterinner)|tv_(standard|tabletop|mobile)|rounddiningtable_turntable)$/;
/**
 * 已知「注册了模型但没有任何一条路会加载它」的存量条目。**现已清空** —— 这份名单是
 */
const KNOWN_UNREACHABLE_MODEL_TYPES = new Set([]);

function checkModelAssetUrls() {
  const problems = [];
  const text = fs.readFileSync(EXTERNAL_MODELS_JS, "utf8");
  const referenced = new Set();
  MODEL_ENTRY_RE.lastIndex = 0;
  let match;
  while ((match = MODEL_ENTRY_RE.exec(text))) {
    const [, itemType, modelDir, fileKey] = match;
    const line = text.slice(0, match.index).split("\n").length;
    if (MODEL_VERSION_STAMP_RE.test(fileKey)) {
      problems.push({
        file: rel(EXTERNAL_MODELS_JS),
        line,
        detail:
          `${itemType} 的模型文件基名是版本戳「${fileKey}」——` +
          "这形状来自换戳脚本改写第二个参数（见本函数注释），不是真实文件名"
      });
      continue;
    }
    for (const suffix of ["", "-lite"]) {
      const relative = `${modelDir}/${fileKey}${suffix}.glb`;
      referenced.add(relative);
      if (!fs.existsSync(path.join(MODELS_DIR, relative))) {
        problems.push({
          file: rel(EXTERNAL_MODELS_JS),
          line,
          detail: `${itemType} 引用的 ${relative} 在磁盘上不存在（加载会静默退回过程几何）`
        });
      }
    }
  }
  for (const relative of collectModelFiles()) {
    if (!referenced.has(relative)) {
      problems.push({
        file: rel(path.join(MODELS_DIR, relative)),
        line: 0,
        detail: "这个 GLB 没有任何注册表条目引用它（生成完忘了接线，等于白做一份产线）"
      });
    }
  }
  // ── 反向的一条：注册了、但没有任何一条路会去加载它 ────────────────────────
  const itemTypesText = fs.readFileSync(ITEM_TYPES_JS, "utf8");
  const loadableTypes = new Set([
    ...readLiteralSet(itemTypesText, "EXTERNAL_MODEL_ITEM_TYPES"),
    ...readLiteralSet(itemTypesText, "APPLIANCE_MODEL_ITEM_TYPES")
  ]);
  if (loadableTypes.size) {
    MODEL_ENTRY_RE.lastIndex = 0;
    while ((match = MODEL_ENTRY_RE.exec(text))) {
      const [, itemType] = match;
      if (
        loadableTypes.has(itemType) ||
        DERIVED_MODEL_TYPE_RE.test(itemType) ||
        KNOWN_UNREACHABLE_MODEL_TYPES.has(itemType)
      ) {
        continue;
      }
      const line = text.slice(0, match.index).split("\n").length;
      problems.push({
        file: rel(EXTERNAL_MODELS_JS),
        line,
        detail:
          `${itemType} 注册了模型，但类型不在 EXTERNAL_MODEL_ITEM_TYPES / APPLIANCE_MODEL_ITEM_TYPES 里 ——` +
          "registry.js 的收尾判据从不命中，这份 GLB 永远不会被加载（画面上一直是程序化兜底几何，零报错）。" +
          "要么把类型加进对应的那张名单，要么把这条注册与被它引用的 GLB 一起删掉"
      });
    }
  }
  return problems;
}

const ENVIRONMENT_SCENE_JS = path.join(RUNTIME_MODULES_DIR,
  "environment",
  "environment-scene.js"
);
const ENVIRONMENT_HALOS_JS = path.join(RUNTIME_MODULES_DIR,
  "environment",
  "environment-halos.js"
);
/**
 * 「环境模型类型」这组清单在仓库里重复了 7 处，且**每一处漏写都不报错**：
 */
function readBracketLists(text) {
  const lists = [];
  const signature = /"wallac",\s*"floorac",\s*"airoutlet",/g;
  let match;
  while ((match = signature.exec(text))) {
    const open = text.lastIndexOf("[", match.index);
    const close = text.indexOf("]", match.index);
    if (open === -1 || close === -1) {
      continue;
    }
    const names = [...text.slice(open + 1, close).matchAll(/"([a-z_0-9]+)"/g)].map(item => item[1]);
    lists.push(names);
  }
  return lists;
}

/** 取 `const NAME = { ... };` 字面量的顶层键。 */
function readObjectKeys(text, declaration) {
  const start = text.indexOf(declaration);
  if (start === -1) {
    return [];
  }
  const open = text.indexOf("{", start);
  const close = text.indexOf("};", open);
  return [...text.slice(open, close).matchAll(/^\s*([a-z_0-9]+):/gm)].map(item => item[1]);
}

function checkEnvironmentModelTypes() {
  const problems = [];
  const sceneText = fs.readFileSync(ENVIRONMENT_SCENE_JS, "utf8");
  const halosText = fs.readFileSync(ENVIRONMENT_HALOS_JS, "utf8");
  const appText = fs.readFileSync(STUDIO_APP, "utf8");

  const pageTypes = readObjectKeys(sceneText, "const MODEL_TYPE_TO_PAGE = {");
  const kindTypes = readObjectKeys(sceneText, "const MODEL_TYPE_TO_DEVICE_KIND = {");
  const groups = [
    { file: rel(ENVIRONMENT_SCENE_JS), line: 0, label: "MODEL_TYPE_TO_PAGE", types: pageTypes },
    { file: rel(ENVIRONMENT_SCENE_JS), line: 0, label: "MODEL_TYPE_TO_DEVICE_KIND", types: kindTypes },
    ...readBracketLists(halosText).map(types => ({
      file: rel(ENVIRONMENT_HALOS_JS),
      line: 0,
      label: "描边资格清单",
      types
    })),
    ...readBracketLists(appText).map(types => ({
      file: rel(STUDIO_APP),
      line: 0,
      label: "studio 环境模型清单",
      types
    }))
  ];

  // 页面表与设备种类表必须逐类型成对（少一边等于映射到 undefined）。
  for (const type of pageTypes) {
    if (!kindTypes.includes(type)) {
      problems.push({
        file: rel(ENVIRONMENT_SCENE_JS),
        line: 0,
        detail: `${type} 在 MODEL_TYPE_TO_PAGE 里，却没有对应的 MODEL_TYPE_TO_DEVICE_KIND`
      });
    }
  }

  const reference = [...pageTypes].sort().join(",");
  const referenceLabel = "MODEL_TYPE_TO_PAGE";
  for (const group of groups.slice(1)) {
    const actual = [...group.types].sort().join(",");
    if (actual !== reference) {
      const missing = group.types.filter(type => !pageTypes.includes(type));
      const extra = pageTypes.filter(type => !group.types.includes(type));
      problems.push({
        file: group.file,
        line: group.line,
        detail:
          `${group.label} 与 ${referenceLabel} 不一致` +
          (missing.length ? `：多出 ${missing.join("、")}` : "") +
          (extra.length ? `：缺少 ${extra.join("、")}` : "")
      });
    }
  }
  return problems;
}

/**
 * 「环境页面归一表」不能漏登页签别名。
 */
function checkEnvironmentPageNormalization() {
  const text = fs.readFileSync(ENVIRONMENT_SCENE_JS, "utf8");
  const anchor = text.indexOf("const moduleKey =");
  if (anchor === -1) {
    return [
      { file: rel(ENVIRONMENT_SCENE_JS), line: 0, detail: "找不到 pageDimming 的 moduleKey 归一表" }
    ];
  }
  const open = text.indexOf("{", anchor);
  const close = text.indexOf("}[", open);
  if (open === -1 || close === -1) {
    return [
      {
        file: rel(ENVIRONMENT_SCENE_JS),
        line: 0,
        detail: "moduleKey 归一表不是预期的对象字面量（`{ ... }[activeModule]`）"
      }
    ];
  }
  const body = text.slice(open + 1, close);
  const actual = new Map();
  for (const match of body.matchAll(/(?:"([a-z0-9_-]+)"|([a-z0-9_-]+))\s*:\s*["']([a-z0-9_-]+)["']/g)) {
    actual.set(match[1] || match[2], match[3]);
  }
  // 上游 0.6.5 pageDimming 反混淆出的别名表，按本仓的模块词表过滤后的期望值。
  const expected = new Map([
    ["climate", "environment"],
    ["cover", "environment"],
    ["temperature-humidity", "environment"],
    ["nas", "devices"],
    ["television", "devices"],
    ["vacuum-shortcut", "vacuum"]
  ]);
  const problems = [];
  for (const [key, page] of expected) {
    if (!actual.has(key)) {
      problems.push({
        file: rel(ENVIRONMENT_SCENE_JS),
        line: 0,
        detail: `pageDimming 的 moduleKey 缺 "${key}" → "${page}"（该页签会静默失去环境压暗与模型高亮）`
      });
    } else if (actual.get(key) !== page) {
      problems.push({
        file: rel(ENVIRONMENT_SCENE_JS),
        line: 0,
        detail: `"${key}" 归一到了 "${actual.get(key)}"，上游 0.6.5 是 "${page}"`
      });
    }
  }
  const validPages = new Set(["overview", "light", "environment", "devices", "vacuum", "security"]);
  for (const [key, page] of actual) {
    if (!validPages.has(page)) {
      problems.push({
        file: rel(ENVIRONMENT_SCENE_JS),
        line: 0,
        detail: `"${key}" 归一到了非页面值 "${page}"，会落进 pageDimming 白名单外的「不压暗」分支`
      });
    }
  }
  return problems;
}

function readTopLevelObjectEntries(objectText) {
  const entries = [];
  const source = objectText.replace(/\/\/[^\n]*/g, "");
  let depth = 0;
  for (let i = 0; i < source.length; i += 1) {
    const character = source[i];
    if (character === "{" || character === "[" || character === "(") {
      depth += 1;
      continue;
    }
    if (character === "}" || character === "]" || character === ")") {
      depth -= 1;
      continue;
    }
    if (depth !== 1) {
      continue;
    }
    const keyMatch = /^([A-Za-z_][A-Za-z_0-9]*)\s*:\s*([^,]*)/.exec(source.slice(i));
    if (!keyMatch) {
      continue;
    }
    const previousCharacter = source.slice(0, i).replace(/\s+$/, "").slice(-1);
    if (previousCharacter === "{" || previousCharacter === ",") {
      entries.push({ key: keyMatch[1], defaulted: keyMatch[2].includes("??") });
      i += keyMatch[0].length - 1;
    }
  }
  return entries;
}

/** 只要键名（见 readTopLevelObjectEntries）。 */
function readTopLevelObjectKeys(objectText) {
  return readTopLevelObjectEntries(objectText).map(entry => entry.key);
}

/**
 * 解析组合构造器（joineryCombo / fabricCombo …）能为哪些角色提供配方。
 */
function readComboRoleSupport(text) {
  const supportByName = new Map();
  const declRe = /function ([A-Za-z_][A-Za-z_0-9]*Combo)\(\s*\{/g;
  let match;
  while ((match = declRe.exec(text))) {
    const returnIndex = text.indexOf("return {", match.index);
    if (returnIndex === -1) {
      continue;
    }
    const open = text.indexOf("{", returnIndex);
    let depth = 0;
    let end = open;
    for (let i = open; i < text.length; i += 1) {
      if (text[i] === "{") depth += 1;
      else if (text[i] === "}") {
        depth -= 1;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    const entries = readTopLevelObjectEntries(text.slice(open, end + 1));
    supportByName.set(match[1], {
      all: entries.map(entry => entry.key),
      defaulted: entries.filter(entry => entry.defaulted).map(entry => entry.key)
    });
  }
  return supportByName;
}

function collectMaterialStyleGroups(text) {
  const groups = [];
  const comboRoleSupport = readComboRoleSupport(text);
  const declRe = /const ([A-Z_0-9]+_STYLES) = Object\.freeze\(\[/g;
  let match;
  while ((match = declRe.exec(text))) {
    const bodyStart = match.index + match[0].length;
    let depth = 1;
    let bodyEnd = bodyStart;
    for (let i = bodyStart; i < text.length; i += 1) {
      if (text[i] === "[" || text[i] === "{" || text[i] === "(") depth += 1;
      else if (text[i] === "]" || text[i] === "}" || text[i] === ")") {
        depth -= 1;
        if (depth === 0) {
          bodyEnd = i;
          break;
        }
      }
    }
    const body = text.slice(bodyStart, bodyEnd);
    const entries = [];
    const styleRe = /defineStyle\(\s*"([^"]+)"\s*,\s*"([^"]*)"\s*,\s*"([^"]*)"\s*,/g;
    let styleMatch;
    while ((styleMatch = styleRe.exec(body))) {
      const objectStart = body.indexOf("{", styleMatch.index + styleMatch[0].length);
      if (objectStart === -1) break;
      let objectDepth = 0;
      let objectEnd = objectStart;
      for (let i = objectStart; i < body.length; i += 1) {
        if (body[i] === "{") objectDepth += 1;
        else if (body[i] === "}") {
          objectDepth -= 1;
          if (objectDepth === 0) {
            objectEnd = i;
            break;
          }
        }
      }
      const objectText = body.slice(objectStart, objectEnd);
      const keys = [...objectText.matchAll(/(?:^|[{,]\s*)([A-Za-z_][A-Za-z_0-9]*)\s*:/gm)].map(
        item => item[1]
      );
      // 颜色对象之后可能跟一个组合构造器调用（joineryCombo / fabricCombo …）：
      const comboCallMatch = /([A-Za-z_][A-Za-z_0-9]*Combo)\(\s*\{/.exec(body.slice(objectEnd + 1));
      let roleNames = null;
      if (comboCallMatch) {
        const comboStart = objectEnd + 1 + comboCallMatch.index + comboCallMatch[0].length - 1;
        let comboDepth = 0;
        let comboEnd = comboStart;
        for (let i = comboStart; i < body.length; i += 1) {
          if (body[i] === "{") comboDepth += 1;
          else if (body[i] === "}") {
            comboDepth -= 1;
            if (comboDepth === 0) {
              comboEnd = i;
              break;
            }
          }
        }
        const support = comboRoleSupport.get(comboCallMatch[1]);
        const callSiteRoles = readTopLevelObjectKeys(body.slice(comboStart, comboEnd + 1));
        roleNames = support
          ? [...new Set([...callSiteRoles, ...support.defaulted])]
          : callSiteRoles;
      }
      const absoluteIndex = bodyStart + objectStart;
      entries.push({
        id: styleMatch[1],
        surface: styleMatch[3],
        keys,
        roles: roleNames,
        line: text.slice(0, absoluteIndex).split("\n").length
      });
    }
    groups.push({ name: match[1], entries });
  }
  return groups;
}

function readLiteralSet(text, name) {
  const start = text.indexOf(`const ${name} = `);
  if (start === -1) {
    return new Set();
  }
  const open = text.indexOf("[", start);
  const close = text.indexOf("]", open);
  if (open === -1 || close === -1) {
    return new Set();
  }
  const body = text.slice(open, close);
  return new Set([...body.matchAll(/"([^"]+)"/g)].map(item => item[1]));
}

/**
 * 「材质风格」可选项的覆盖率守卫。
 * @returns {Array<{file: string, line: number, detail: string}>} 问题清单。
 */
function checkMaterialStyleCoverage() {
  const problems = [];
  const stylesText = fs.readFileSync(MATERIAL_STYLES_JS, "utf8");
  const itemTypesText = fs.readFileSync(ITEM_TYPES_JS, "utf8");
  const externalModelsText = fs.readFileSync(EXTERNAL_MODELS_JS, "utf8");

  const rampFunction = stylesText.match(/function completeFurnitureRamp\(colors\)\s*\{([\s\S]*?)\n\}/);
  if (!rampFunction) {
    problems.push({
      file: rel(MATERIAL_STYLES_JS),
      line: 0,
      detail: "找不到 completeFurnitureRamp —— 它被改名或删掉了，本条校验的前提失效"
    });
    return problems;
  }
  const rampBaseKeys = [
    ...rampFunction[1].matchAll(/colors\.([A-Za-z_][A-Za-z_0-9]*)\s*\?\?/g)
  ].map(item => item[1]);
  const rampOutputKeys = [
    ...rampFunction[1].matchAll(/^\s+(furniture[A-Za-z]*)\s*:/gm)
  ].map(item => item[1]);
  if (rampBaseKeys.length === 0 || rampOutputKeys.length === 0) {
    problems.push({
      file: rel(MATERIAL_STYLES_JS),
      line: 0,
      detail: "completeFurnitureRamp 里读不出基准键 / 输出键，本条校验无法进行"
    });
    return problems;
  }

  const groups = collectMaterialStyleGroups(stylesText);
  const groupByName = new Map(groups.map(group => [group.name, group]));

  // 逐类型档位表：type → 风格组名。
  const explicitText = stylesText.slice(
    stylesText.indexOf("const MATERIAL_STYLE_OPTIONS_BY_ITEM_TYPE = Object.freeze({"),
    stylesText.indexOf("const MATERIAL_FAMILY_BY_ITEM_TYPE = Object.freeze({")
  );
  const styleGroupByItemType = new Map();
  for (const item of explicitText.matchAll(/^\s*([a-z_0-9]+):\s*([A-Z_0-9]+_STYLES)\s*,?\s*$/gm)) {
    styleGroupByItemType.set(item[1], item[2]);
  }
  // 材质族兜底表：type → 族名，族名 → 风格组名。
  const familyText = stylesText.slice(
    stylesText.indexOf("const MATERIAL_FAMILY_BY_ITEM_TYPE = Object.freeze({"),
    stylesText.indexOf("const MATERIAL_STYLES_BY_FAMILY = Object.freeze({")
  );
  const familyByItemType = new Map();
  for (const item of familyText.matchAll(/^\s*([a-z_0-9]+):\s*"([a-zA-Z_0-9]+)"\s*,/gm)) {
    familyByItemType.set(item[1], item[2]);
  }
  const familyStylesText = stylesText.slice(
    stylesText.indexOf("const MATERIAL_STYLES_BY_FAMILY = Object.freeze({")
  );
  const groupByFamily = new Map();
  for (const item of familyStylesText.matchAll(/^\s*([a-zA-Z_0-9]+):\s*([A-Z_0-9]+_STYLES)\s*,?\s*$/gm)) {
    groupByFamily.set(item[1], item[2]);
  }

  const excludedTypes = readLiteralSet(stylesText, "MATERIAL_STYLE_EXCLUDED_ITEM_TYPES");
  const capableTypes = new Set();
  for (const setNames of [
    ["HOME_ITEM_TYPES"],
    ["EXTERNAL_MODEL_ITEM_TYPES"],
    ["APPLIANCE_MODEL_ITEM_TYPES"]
  ]) {
    for (const value of readLiteralSet(itemTypesText, setNames[0])) {
      if (!excludedTypes.has(value)) {
        capableTypes.add(value);
      }
    }
  }

  // 1) 每个档位都要有一个基准键。
  for (const group of groups) {
    for (const entry of group.entries) {
      if (!entry.keys.some(key => rampBaseKeys.includes(key))) {
        problems.push({
          file: rel(MATERIAL_STYLES_JS),
          line: entry.line,
          detail:
            `${group.name} 的「${entry.id}」没有任何基准键（${rampBaseKeys.join(" / ")} 一个都没有）：` +
            "completeFurnitureRamp 不会补齐 furniture* 四档，零件落在这些档位时风格完全不起作用"
        });
      }
    }
  }

  // 2) 服务家电类型的风格组必须写全 appliance 三键。
  const appliancePaletteTypes = readLiteralSet(externalModelsText, "APPLIANCE_PALETTE_ITEM_TYPES");
  const groupsNeedingApplianceKeys = new Set();
  for (const [itemType, groupName] of styleGroupByItemType) {
    if (appliancePaletteTypes.has(itemType)) {
      groupsNeedingApplianceKeys.add(groupName);
    }
  }
  for (const groupName of groupsNeedingApplianceKeys) {
    const group = groupByName.get(groupName);
    if (!group) continue;
    for (const entry of group.entries) {
      const missing = ["appliance", "applianceSoft", "applianceDark"].filter(
        key => !entry.keys.includes(key)
      );
      if (missing.length > 0) {
        problems.push({
          file: rel(MATERIAL_STYLES_JS),
          line: entry.line,
          detail:
            `${groupName} 的「${entry.id}」服务了家电调色板类型，却缺少 ${missing.join(" / ")}：` +
            "家电换色分支只认这三键，缺了就是「下拉能选、选了没反应」"
        });
      }
    }
  }

  // 3) 每个支持材质风格的类型都必须能查到档位。
  for (const itemType of capableTypes) {
    if (!styleGroupByItemType.has(itemType) && !familyByItemType.has(itemType)) {
      problems.push({
        file: rel(MATERIAL_STYLES_JS),
        line: 0,
        detail:
          `${itemType} 支持材质风格，却在逐类型表与材质族表里都查不到档位：` +
          "下拉只剩「跟随全局风格」，等于这个类型没有该功能"
      });
    }
  }

  // 4) 两张表里不许留下不属于该类型的键。
  for (const [itemType, groupName] of styleGroupByItemType) {
    if (!capableTypes.has(itemType)) {
      problems.push({
        file: rel(MATERIAL_STYLES_JS),
        line: 0,
        detail:
          `逐类型档位表里的 ${itemType} 不是「支持材质风格」的类型（多半是类型改名 / 删除后的残留），` +
          `它的档位 ${groupName} 永远不会被用到`
      });
    }
  }
  for (const [itemType, familyName] of familyByItemType) {
    if (!capableTypes.has(itemType)) {
      problems.push({
        file: rel(MATERIAL_STYLES_JS),
        line: 0,
        detail: `材质族表里的 ${itemType} 不是「支持材质风格」的类型（改名 / 删除后的残留）`
      });
    }
    if (!groupByFamily.has(familyName)) {
      problems.push({
        file: rel(MATERIAL_STYLES_JS),
        line: 0,
        detail: `材质族表里的 ${itemType} 指向了不存在的族「${familyName}」（族名拼错就是「选了没反应」）`
      });
    }
  }

  return problems;
}

/**
 * 「档位即组合」的角色覆盖守卫。
 * @returns {Array<{file: string, line: number, detail: string}>} 问题清单。
 */
function checkMaterialRoleCoverage() {
  const problems = [];
  if (!PIPELINE_MODEL_SPECS) {
    return problems;
  }
  const stylesText = fs.readFileSync(MATERIAL_STYLES_JS, "utf8");
  const groups = collectMaterialStyleGroups(stylesText);
  const roleNamesByStyleId = new Map();
  for (const group of groups) {
    for (const entry of group.entries) {
      roleNamesByStyleId.set(entry.id, entry.roles);
    }
  }
  const explicitGroupByType = new Map();
  const explicitStart = stylesText.indexOf("const MATERIAL_STYLE_OPTIONS_BY_ITEM_TYPE = ");
  if (explicitStart !== -1) {
    const body = stylesText.slice(
      stylesText.indexOf("{", explicitStart),
      stylesText.indexOf("\n});", explicitStart)
    );
    for (const item of body.matchAll(/^\s*([a-z_0-9]+):\s*([A-Z_0-9]+_STYLES)/gm)) {
      explicitGroupByType.set(item[1], item[2]);
    }
  }
  const familyGroupByType = new Map();
  const familyStart = stylesText.indexOf("const MATERIAL_FAMILY_BY_ITEM_TYPE = ");
  if (familyStart !== -1) {
    const body = stylesText.slice(
      stylesText.indexOf("{", familyStart),
      stylesText.indexOf("\n});", familyStart)
    );
    for (const item of body.matchAll(/^\s*([a-z_0-9]+):\s*"([a-zA-Z]+)"/gm)) {
      familyGroupByType.set(item[1], item[2]);
    }
  }
  const groupNameByFamily = new Map();
  const familyStylesStart = stylesText.indexOf("const MATERIAL_STYLES_BY_FAMILY = ");
  if (familyStylesStart !== -1) {
    const body = stylesText.slice(
      stylesText.indexOf("{", familyStylesStart),
      stylesText.indexOf("\n});", familyStylesStart)
    );
    for (const item of body.matchAll(/^\s*([a-zA-Z]+):\s*([A-Z_0-9]+_STYLES)/gm)) {
      groupNameByFamily.set(item[1], item[2]);
    }
  }
  const rolesByGroupName = new Map(groups.map(group => [group.name, group]));

  /**
   * 流水线规格键 → 取档位时该查哪个**物件类型**。绝大多数规格与物件类型 1:1，只有电视是三对一：
   */
  const styleLookupTypeBySpec = new Map([
    ["tv_standard", "tv"],
    ["tv_tabletop", "tv"],
    ["tv_mobile", "tv"],
    // 窗帘同样是「一个物件类型对多份模型」：按开合方式拆成三段（左 / 右 / 对开），
    ["curtain_left", "curtain"],
    ["curtain_right", "curtain"],
    ["curtain_split", "curtain"]
  ]);

  for (const [itemType, spec] of Object.entries(PIPELINE_MODEL_SPECS)) {
    const declaredRoles = [...new Set((spec.slots || []).map(slot => slot.role).filter(Boolean))];
    if (declaredRoles.length === 0) {
      continue;
    }
    for (const role of declaredRoles) {
      if (!MODEL_SLOT_ROLES.includes(role) || MODEL_SLOT_ROLE_SUFFIX_RE.test(role)) {
        problems.push({
          file: "tools/models/model-specs.mjs",
          line: 0,
          detail:
            `${itemType} 的角色「${role}」非法：` +
            (MODEL_SLOT_ROLE_SUFFIX_RE.test(role)
              ? "以 -soft / -dark / -light 结尾，会被运行侧当成亮度分档"
              : "不在 MODEL_SLOT_ROLES 词表里（多半是拼错了）")
        });
      }
    }
    const styleLookupType = styleLookupTypeBySpec.get(itemType) || itemType;
    const groupName =
      explicitGroupByType.get(styleLookupType) ||
      groupNameByFamily.get(familyGroupByType.get(styleLookupType));
    const group = groupName ? rolesByGroupName.get(groupName) : null;
    if (!group) {
      continue;
    }
    for (const entry of group.entries) {
      if (!entry.roles) {
        // 该档位没按角色给组合：对这个类型而言，所有角色都会退回基础色。
        problems.push({
          file: rel(MATERIAL_STYLES_JS),
          line: entry.line,
          detail:
            `${itemType} 能选到档位「${entry.id}」，但它没有按角色给出组合 —— ` +
            `${declaredRoles.join(" / ")} 会整片退回基础色（看着就像这个档位没生效）`
        });
        continue;
      }
      const missing = declaredRoles.filter(role => !entry.roles.includes(role));
      if (missing.length) {
        problems.push({
          file: rel(MATERIAL_STYLES_JS),
          line: entry.line,
          detail:
            `${itemType} 用到的角色 ${missing.join(" / ")} 在档位「${entry.id}」里没有配方 —— ` +
            "这几块会静默退回基础色，别人都变了就它没变"
        });
      }
    }
  }

  // 石材色号（`slab`）也要对账：色号写错时 createStoneSlabTexture 返回 null，
  const implementedFlavors = readStoneSlabFlavors();
  if (implementedFlavors) {
    const externalText = fs.readFileSync(EXTERNAL_MODELS_JS, "utf8");
    const flavorReads = [
      // 档位里写的色号。
      ...[...stylesText.matchAll(/\bslab:\s*"([a-zA-Z][a-zA-Z0-9_-]*)"/g)].map(item => ({
        flavor: item[1],
        file: rel(MATERIAL_STYLES_JS),
        where: "档位的角色配方"
      })),
      // 自动档（未选风格）时运行侧读的默认色号表。
      ...[
        ...readObjectLiteralStrings(externalText, "STONE_SLAB_FLAVOR_BY_MODEL_SLOT")
      ].map(flavor => ({
        flavor,
        file: rel(EXTERNAL_MODELS_JS),
        where: "默认色号表"
      }))
    ];
    // 每个色号只报一次：同一处写错会在这张表的多个槽位上重复出现。
    const seenFlavorProblem = new Set();
    for (const { flavor, file, where } of flavorReads) {
      if (implementedFlavors.has(flavor) || seenFlavorProblem.has(flavor)) {
        continue;
      }
      seenFlavorProblem.add(flavor);
      problems.push({
        file,
        line: 0,
        detail:
          `${where}用了石材色号「${flavor}」，但 studio-surface-textures.js 里没有它的画法 —— ` +
          `运行侧会退化成一块没纹路的纯色。已实现的色号：${[...implementedFlavors].join(" / ")}`
      });
    }
  }
  return problems;
}

/**
 * 「调色板路径」的角色出口守卫。
 * @returns {Array<{file: string, line: number, detail: string}>} 问题清单。
 */
function checkMaterialRolePaletteOutlets() {
  const problems = [];
  if (!PIPELINE_MODEL_SPECS) {
    return problems;
  }
  const loaderText = fs.readFileSync(EXTERNAL_MODELS_JS, "utf8");
  const readRoleSet = name => {
    const start = loaderText.indexOf(`const ${name} = new Set([`);
    if (start === -1) {
      return null;
    }
    const end = loaderText.indexOf("]);", start);
    return new Set([...loaderText.slice(start, end).matchAll(/"([a-z_0-9]+)"/g)].map(item => item[1]));
  };
  const carcassRoles = readRoleSet("CARCASS_MATERIAL_ROLE_SET");
  const nonCarcassRoles = readRoleSet("NON_CARCASS_MATERIAL_ROLE_SET");
  const authoredStart = loaderText.indexOf("const AUTHORED_COLOR_MATERIAL_ROLE_RECIPES = Object.freeze({");
  const authoredRoles =
    authoredStart === -1
      ? null
      : new Set(
          readTopLevelObjectKeys(
            loaderText.slice(loaderText.indexOf("{", authoredStart), loaderText.indexOf("\n});", authoredStart))
          )
        );
  if (!carcassRoles || !nonCarcassRoles || !authoredRoles) {
    return [
      {
        file: rel(EXTERNAL_MODELS_JS),
        line: 0,
        detail:
          "读不到角色出口登记表（CARCASS_MATERIAL_ROLE_SET / NON_CARCASS_MATERIAL_ROLE_SET / " +
          "AUTHORED_COLOR_MATERIAL_ROLE_RECIPES）—— 改名或换写法会让这一条整体失去判据，宁可报出来"
      }
    ];
  }
  // 三份名单两两不重叠：重复登记意味着「这个角色到底跟不跟主料走」没定下来。
  const outletByRole = new Map();
  for (const [outletName, roles] of [
    ["CARCASS_MATERIAL_ROLE_SET（跟主料三档）", carcassRoles],
    ["AUTHORED_COLOR_MATERIAL_ROLE_RECIPES（取规格原色）", authoredRoles],
    ["NON_CARCASS_MATERIAL_ROLE_SET（另有专管）", nonCarcassRoles]
  ]) {
    for (const role of roles) {
      const previousOutlet = outletByRole.get(role);
      if (previousOutlet) {
        problems.push({
          file: rel(EXTERNAL_MODELS_JS),
          line: 0,
          detail: `角色「${role}」登记了两次（${previousOutlet} / ${outletName}）—— 出口只能有一个`
        });
        continue;
      }
      outletByRole.set(role, outletName);
    }
  }
  const declaredRoles = new Set();
  for (const spec of Object.values(PIPELINE_MODEL_SPECS)) {
    for (const slot of spec.slots || []) {
      if (slot.role) {
        declaredRoles.add(slot.role);
      }
    }
  }
  for (const role of [...declaredRoles].sort()) {
    if (outletByRole.has(role)) {
      continue;
    }
    problems.push({
      file: rel(EXTERNAL_MODELS_JS),
      line: 0,
      detail:
        `角色「${role}」没有登记默认档位的出口 —— 它会落进按亮度分三档的兜底、被刷成主料色` +
        "（书与柜体同色、鞋是一堆木方块、镜面是一块木头都出自这一步）。按它的实际归属写进三份名单之一"
    });
  }
  for (const [role, outletName] of outletByRole) {
    if (!MODEL_SLOT_ROLES.includes(role)) {
      problems.push({
        file: rel(EXTERNAL_MODELS_JS),
        line: 0,
        detail: `${outletName}里的「${role}」不在 tools/models/model-roles.mjs 的角色词表里（多半是拼错了）`
      });
      continue;
    }
    if (!declaredRoles.has(role)) {
      problems.push({
        file: rel(EXTERNAL_MODELS_JS),
        line: 0,
        detail: `${outletName}里的「${role}」没有任何规格在用 —— 角色已删或改名，登记表没跟着收`
      });
    }
  }
  return problems;
}

/**
 * 圆形占地的物件在平面图上没有按圆画（或名单里塞了不是圆的）。
 * @returns {Array<{file: string, line: number, detail: string}>} 问题清单。
 */
function checkRoundFootprintPlanSymbols() {
  const problems = [];
  const typesText = fs.readFileSync(ITEM_TYPES_JS, "utf8");
  const declaredStart = typesText.indexOf("export const ROUND_FOOTPRINT_ITEM_TYPES = new Set([");
  if (declaredStart === -1) {
    return [
      {
        file: rel(ITEM_TYPES_JS),
        line: 0,
        detail:
          "读不到 ROUND_FOOTPRINT_ITEM_TYPES —— 改名或换写法会让这一条整体失去判据，宁可报出来"
      }
    ];
  }
  const declaredEnd = typesText.indexOf("]);", declaredStart);
  const declared = new Set(
    [...typesText.slice(declaredStart, declaredEnd).matchAll(/"([a-z_0-9]+)"/g)].map(item => item[1])
  );
  // 名单必须真的接上**外轮廓那一支**：只有名单没有分支 = 改动做了一半，画面上一模一样。
  const appText = fs.readFileSync(STUDIO_APP, "utf8");
  if (
    !/ROUND_FOOTPRINT_ITEM_TYPES\.has\(itemToDraw\.type\)[\s\S]{0,500}?ellipse\([\s\S]{0,240}?\.fill\(/.test(
      appText
    )
  ) {
    problems.push({
      file: rel(STUDIO_APP),
      line: 0,
      detail:
        "ROUND_FOOTPRINT_ITEM_TYPES 没有接上外轮廓的绘制分支 —— 名单进了 studio-item-types.js，" +
        "但 studio-app.js 里没有「命中它就画椭圆并填充」的那一支，平面图上一点变化都没有"
    });
  }
  let measured = null;
  try {
    measured = measureFootprints();
  } catch {
    measured = null;
  }
  if (!measured) {
    return problems;
  }
  const unreadable = measured.filter(entry => !entry.stats).map(entry => entry.type);
  if (unreadable.length > 0) {
    problems.push({
      file: rel(MODELS_DIR),
      line: 0,
      detail: `${unreadable.join(" / ")} 的俯视轮廓读不出来（GLB 缺失或解析失败），本条对这些类型失去判据`
    });
  }
  const measuredRound = new Set(measured.filter(entry => entry.isRound).map(entry => entry.type));
  for (const type of [...measuredRound].sort()) {
    if (!declared.has(type)) {
      problems.push({
        file: rel(ITEM_TYPES_JS),
        line: 0,
        detail:
          `「${type}」实测俯视占地是圆，却没进 ROUND_FOOTPRINT_ITEM_TYPES —— ` +
          "它会在户型图上被画成方角矩形。清单由 tools/audit_plan_symbols.mjs 实测得出，直接补进去"
      });
    }
  }
  for (const type of [...declared].sort()) {
    if (!measuredRound.has(type)) {
      problems.push({
        file: rel(ITEM_TYPES_JS),
        line: 0,
        detail:
          `ROUND_FOOTPRINT_ITEM_TYPES 里的「${type}」实测不是圆（占地比例与各向半径对不上）—— ` +
          "要么规格改成了方料、要么类型名拼错，两种都该把它从名单里收掉"
      });
    }
  }
  return problems;
}

/**
 * 取某个 `const NAME = Object.freeze({` 对象字面量里的全部字符串值（只取这一层。
 */
function readObjectLiteralStrings(sourceText, name) {
  const declarationIndex = sourceText.indexOf(`const ${name} = Object.freeze({`);
  if (declarationIndex === -1) {
    return [];
  }
  let depth = 0;
  let opened = false;
  let end = sourceText.length;
  for (let index = sourceText.indexOf("{", declarationIndex); index < sourceText.length; index += 1) {
    if (sourceText[index] === "{") {
      depth += 1;
      opened = true;
    } else if (sourceText[index] === "}") {
      depth -= 1;
      if (opened && depth === 0) {
        end = index;
        break;
      }
    }
  }
  const body = sourceText.slice(declarationIndex, end);
  // 只认「值」：形如 `0: "marble-dark"` 或 `"marble": ...`。
  return [...new Set([...body.matchAll(/:\s*"([a-zA-Z][a-zA-Z0-9_-]*)"/g)].map(item => item[1]))];
}

/**
 * 从 studio-surface-textures.js 里读出**已实现**的石材整图色号。
 */
function readStoneSlabFlavors() {
  const surfaceTexturesPath = path.join(STATIC_DIR,
    "3d-studio",
    "materials",
    "studio-surface-textures.js"
  );
  if (!fs.existsSync(surfaceTexturesPath)) {
    return null;
  }
  const textureText = fs.readFileSync(surfaceTexturesPath, "utf8");
  const tonesStart = textureText.indexOf("const STONE_SLAB_TONES = Object.freeze({");
  if (tonesStart === -1) {
    return null;
  }
  const tonesBody = textureText.slice(tonesStart, textureText.indexOf("});", tonesStart));
  const flavors = new Set(
    [...tonesBody.matchAll(/^\s*"?([a-zA-Z][a-zA-Z0-9_-]*)"?:\s*MARBLE_TONES\./gm)].map(
      item => item[1]
    )
  );
  for (const item of textureText.matchAll(/flavor === "([a-zA-Z][a-zA-Z0-9_-]*)"/g)) {
    flavors.add(item[1]);
  }
  return flavors.size ? flavors : null;
}

const ASSET_PALETTE_JS = path.join(STUDIO_DIR,
  "studio-asset-palette.js"
);

/**
 * 素材库页签与类型词表两端对账。
 */
function checkAssetPaletteTypeSets() {
  const problems = [];
  if (!fs.existsSync(ASSET_PALETTE_JS) || !fs.existsSync(ITEM_TYPES_JS)) {
    return problems;
  }
  const paletteText = fs.readFileSync(ASSET_PALETTE_JS, "utf8");
  const itemTypesText = fs.readFileSync(ITEM_TYPES_JS, "utf8");

  // 卡片按所属分组的 category 归堆。分组对象形如
  const cardsByCategory = new Map();
  const groupRe = /category:\s*"(home|appliance)"[\s\S]*?items:\s*\[([\s\S]*?)\n {4}\]/g;
  let groupMatch;
  while ((groupMatch = groupRe.exec(paletteText))) {
    const bucket = cardsByCategory.get(groupMatch[1]) ?? new Set();
    for (const card of groupMatch[2].matchAll(/type:\s*"([^"]+)"/g)) {
      bucket.add(card[1]);
    }
    cardsByCategory.set(groupMatch[1], bucket);
  }
  if (cardsByCategory.size === 0) {
    return problems;
  }

  const applianceTypes = readExportedSetMembers(itemTypesText, "APPLIANCE_ITEM_TYPES");
  if (applianceTypes.size === 0) {
    return problems;
  }

  /** 该片段在原文里的行号（找不到就返回 0，表示「报在文件级」）。 */
  const lineOfFirst = (sourceText, needle) => {
    const index = sourceText.indexOf(needle);
    return index === -1 ? 0 : sourceText.slice(0, index).split("\n").length;
  };

  const paletteLine = lineOfFirst(paletteText, 'category: "appliance"');
  for (const type of cardsByCategory.get("appliance") ?? []) {
    if (!applianceTypes.has(type)) {
      problems.push({
        file: rel(ASSET_PALETTE_JS),
        line: paletteLine,
        detail:
          `「电器」页签的卡片 ${type} 不在 APPLIANCE_ITEM_TYPES 里 —— 它会漏到「家居」页签，` +
          `而家居页签只隐藏分组标题、不隐藏卡片，于是它挂在上一个家居标题（结构与特殊物件 / 卫浴）下面，` +
          `看上去就是「家电跑进了家居结构」；兜底盒体也会取家具色而不是电器色`
      });
    }
  }
  for (const type of cardsByCategory.get("home") ?? []) {
    if (applianceTypes.has(type)) {
      problems.push({
        file: rel(ITEM_TYPES_JS),
        line: lineOfFirst(itemTypesText, `"${type}"`),
        detail:
          `家居卡片 ${type} 被判成了家电（APPLIANCE_ITEM_TYPES 里多它）—— ` +
          `它会从「家居」页签消失、跑到「电器」页签去`
      });
    }
  }
  return problems;
}

/**
 * 有外部模型的类型里，占地尺寸**允许**与 scaleBasis 不一致的那些（当前只有一件）。
 */
const ITEM_SIZE_PARITY_EXEMPT_TYPES = new Set(["smallcar"]);

/** 占地尺寸与 scaleBasis 的允许偏差（米）：5mm 以内肉眼不可辨，不报。 */
const ITEM_SIZE_PARITY_TOLERANCE = 0.005;

/**
 * 素材库卡片与「类型定义」两端对账。
 */
function checkAssetPaletteItemTypeDefinitions() {
  const problems = [];
  if (!fs.existsSync(ASSET_PALETTE_JS) || !fs.existsSync(STUDIO_APP_JS)) {
    return problems;
  }
  const paletteText = fs.readFileSync(ASSET_PALETTE_JS, "utf8");
  const appText = fs.readFileSync(STUDIO_APP_JS, "utf8");

  const definitionKeys = new Set();
  const definitionBodyByType = new Map();
  const stripped = stripComments(appText);
  const definitionsStart = stripped.indexOf("const ITEM_TYPE_DEFINITIONS = {");
  if (definitionsStart === -1) {
    return problems;
  }
  const definitionsText = stripped.slice(stripped.indexOf("{", definitionsStart));
  let depth = 0;
  let definitionsEnd = 0;
  for (let index = 0; index < definitionsText.length; index += 1) {
    const ch = definitionsText[index];
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        definitionsEnd = index;
        break;
      }
    }
  }
  const definitionsBody = definitionsText.slice(0, definitionsEnd);
  // 每个键的值对象各自配对取出来，供后面比尺寸用。
  const keyRe = /^ {2}([a-z_0-9]+): \{/gm;
  let keyMatch;
  while ((keyMatch = keyRe.exec(definitionsBody))) {
    definitionKeys.add(keyMatch[1]);
    const valueText = definitionsBody.slice(definitionsBody.indexOf("{", keyMatch.index));
    let valueDepth = 0;
    let valueEnd = 0;
    for (let index = 0; index < valueText.length; index += 1) {
      const ch = valueText[index];
      if (ch === "{") valueDepth += 1;
      else if (ch === "}") {
        valueDepth -= 1;
        if (valueDepth === 0) {
          valueEnd = index;
          break;
        }
      }
    }
    definitionBodyByType.set(keyMatch[1], valueText.slice(0, valueEnd));
  }
  if (definitionKeys.size === 0) {
    return problems;
  }

  /** 该卡片在素材库源码里的行号（找不到就返回 0，表示「报在文件级」）。 */
  const paletteLineOf = needle => {
    const index = paletteText.indexOf(needle);
    return index === -1 ? 0 : paletteText.slice(0, index).split("\n").length;
  };

  const cardTypes = new Set();
  for (const card of paletteText.matchAll(/type:\s*"([^"]+)"/g)) {
    cardTypes.add(card[1]);
  }
  for (const type of cardTypes) {
    if (!definitionKeys.has(type)) {
      problems.push({
        file: rel(ASSET_PALETTE_JS),
        line: paletteLineOf(`type: "${type}"`),
        detail:
          `素材库卡片 ${type} 在 studio-app.js 的 ITEM_TYPE_DEFINITIONS 里没有定义 —— ` +
          "createSceneItem 取不到定义时直接 return，" +
          "症状是「点了卡片 / 拖到户型图上什么也不发生」，不报错也不进草稿"
      });
    }
  }

  // 有外部模型的类型：定义里的占地方向必须与注册表 scaleBasis 同值（顺序是 宽 / 高 / 深）。
  const externalText = fs.readFileSync(EXTERNAL_MODELS_JS, "utf8");
  for (const type of cardTypes) {
    const body = definitionBodyByType.get(type);
    if (!body) continue;
    if (ITEM_SIZE_PARITY_EXEMPT_TYPES.has(type)) continue;
    const registryRe = new RegExp(`\\n  ${type}: define[A-Za-z]*ItemModel\\([\\s\\S]*?scaleBasis:\\s*\\[([^\\]]+)\\]`);
    const registryMatch = registryRe.exec(externalText);
    if (!registryMatch) continue;
    const basis = registryMatch[1].split(",").map(value => Number(value.trim()));
    const readNumber = key => {
      const match = new RegExp(`^[ \\t]*${key}:\\s*([0-9.]+)`, "m").exec(body);
      return match ? Number(match[1]) : null;
    };
    const defined = [readNumber("width"), readNumber("height"), readNumber("depth")];
    // scaleBasis 的顺序是 [宽, 高, 深]，与定义里的字段顺序不同，逐轴按语义比。
    const expected = [basis[0], basis[1], basis[2]];
    const mismatch = defined.some(
      (value, index) => value === null || Math.abs(value - expected[index]) > ITEM_SIZE_PARITY_TOLERANCE
    );
    if (mismatch) {
      problems.push({
        file: rel(STUDIO_APP_JS),
        line: 0,
        detail:
          `${type} 的 ITEM_TYPE_DEFINITIONS 占地（宽 ${defined[0]} / 高 ${defined[1]} / 深 ${defined[2]}）` +
          `与注册表 scaleBasis（${basis.join(" × ")}）不一致 —— 新放下的一件会先按定义建占位几何、` +
          "模型落地那一帧再缩到 scaleBasis，肉眼是「加进去时尺寸跳一下」"
      });
    }
  }

  return problems;
}

/** 取 `export const NAME = new Set([ … ])` 里的字符串成员。 */
function readExportedSetMembers(sourceText, name) {
  const start = sourceText.indexOf(`export const ${name} = new Set([`);
  if (start === -1) {
    return new Set();
  }
  const body = sourceText.slice(start, sourceText.indexOf("]", start));
  return new Set([...body.matchAll(/"([^"]+)"/g)].map(item => item[1]));
}

const RUNTIME_JS_PATH = path.join(ROOT, "frontend/modules/runtime/core/runtime.js");

/** 归一 `componentProperties` 之后的属性链；动态下标（`?.[…]`）到此为止，只记到哪一层。 */
function configReadPaths(sourceText) {
  const paths = new Set();
  for (const found of sourceText.matchAll(/componentProperties((?:\??\.\s*[A-Za-z_$][\w$]*)*)/g)) {
    const chain = found[1].replace(/\?\./g, ".").replace(/\.\s+/g, ".").replace(/^\./, "");
    if (chain) {
      paths.add(chain);
    }
  }
  return paths;
}

/**
 * 取「本文件里以两空格缩进定义的某个辅助函数」的整段正文；找不到返回 null。
 */
function helperBody(sourceText, name) {
  const declaration = new RegExp(`^  (?:const|let|function|async function)\\s+${name}\\b`, "gm");
  const found = declaration.exec(sourceText);
  if (!found) {
    return null;
  }
  const boundary = /^  (?:const |let |function |async function |if |for |while |switch |return |throw |\})/gm;
  boundary.lastIndex = found.index + found[0].length;
  const next = boundary.exec(sourceText);
  return sourceText.slice(found.index, next ? next.index : sourceText.length);
}

/** 展开区域里调用到的辅助函数（最多三轮），把它们读到的配置路径一并纳入判定。 */
function expandConfigReaders(sourceText, regionText) {
  let expanded = regionText;
  const expandedNames = new Set();
  for (let round = 0; round < 3; round += 1) {
    let grew = false;
    for (const call of expanded.matchAll(/([A-Za-z_$][\w$]*)\s*\(/g)) {
      const name = call[1];
      if (expandedNames.has(name)) {
        continue;
      }
      const body = helperBody(sourceText, name);
      if (!body) {
        continue;
      }
      expandedNames.add(name);
      expanded += "\n" + body;
      grew = true;
    }
    if (!grew) {
      break;
    }
  }
  return expanded;
}

/** 定位某条配置读取路径首次出现的行号（用于把问题指到点上）。 */
function lineOfConfigRead(sourceText, configPath) {
  const lastSegment = configPath.split(".").pop();
  const lines = sourceText.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].includes("componentProperties") && lines[index].includes(lastSegment)) {
      return index + 1;
    }
  }
  return 0;
}

function checkControlGateWithinSubscription() {
  let sourceText;
  try {
    sourceText = fs.readFileSync(RUNTIME_JS_PATH, "utf8");
  } catch {
    return [
      {
        file: rel(RUNTIME_JS_PATH),
        line: 0,
        detail: "读不到 runtime.js，守卫无法判定"
      }
    ];
  }
  // 两处锚点都取「一旦被改写就要让守卫失败」而不是静默跳过：判定依据消失时报错好过放行。
  const gateAnchorStart = "const controlEntityId = incomingMessage.command?.entityId;";
  const gateAnchorEnd = "].some(controlTarget => controlTarget.entityId === controlEntityId)";
  const gateStart = sourceText.indexOf(gateAnchorStart);
  const gateEnd = sourceText.indexOf(gateAnchorEnd, gateStart);
  const subscriptionAnchorStart = "const collectTrackedEntities = () => [";
  const subscriptionAnchorEnd = "function sendConfigUpdate()";
  const subscriptionStart = sourceText.indexOf(subscriptionAnchorStart);
  const subscriptionEnd = sourceText.indexOf(subscriptionAnchorEnd, subscriptionStart);
  const missingAnchors = [];
  if (gateStart < 0 || gateEnd < 0) {
    missingAnchors.push("命令闸门（control 准入）");
  }
  if (subscriptionStart < 0 || subscriptionEnd < 0) {
    missingAnchors.push("状态订阅（collectTrackedEntities / additionalEntityIds）");
  }
  if (missingAnchors.length > 0) {
    return [
      {
        file: rel(RUNTIME_JS_PATH),
        line: 0,
        detail:
          `找不到${missingAnchors.join(" 与 ")}的锚点，守卫无法判定 —— ` +
          "这两处的锚点（" +
          `"${gateAnchorStart}"、"${gateAnchorEnd}"、"${subscriptionAnchorStart}"、"${subscriptionAnchorEnd}"）不要删改`
      }
    ];
  }
  const gatePaths = configReadPaths(
    expandConfigReaders(sourceText, sourceText.slice(gateStart, gateEnd + gateAnchorEnd.length))
  );
  const subscriptionPaths = configReadPaths(
    expandConfigReaders(sourceText, sourceText.slice(subscriptionStart, subscriptionEnd))
  );
  const problems = [];
  for (const gatePath of gatePaths) {
    if (subscriptionPaths.has(gatePath)) {
      continue;
    }
    problems.push({
      file: rel(RUNTIME_JS_PATH),
      line: lineOfConfigRead(sourceText, gatePath),
      detail:
        `命令闸门读了 componentProperties.${gatePath}，状态订阅侧没读 —— ` +
        "这条链上的实体命令发得出去、读数永远为空（面板恒显不可用）。订阅侧要用同一批配置展开它"
    });
  }
  return problems;
}

/**
 * `doorModels` 的入参必须是**楼层对象**，不能是 `floor.scene`。
 */
function checkDoorModelsFloorArgument() {
  const problems = [];
  // 定义处也要看一眼：容错一旦改成对称的，这条守卫的前提就没了，得连注释一起更新。
  const definitionPath = path.join(ROOT, "frontend/static/bridge/lock-state-runtime.js");
  let definitionText = "";
  try {
    definitionText = fs.readFileSync(definitionPath, "utf8");
  } catch {
    return [
      {
        file: rel(definitionPath),
        line: 0,
        detail: "读不到 doorModels 的定义，守卫无法判定"
      }
    ];
  }
  const tolerantDoors = /config\?\.scene\?\.doors\?\.length\s*\?\s*config\.scene\.doors\s*:\s*config\?\.doors/.test(
    definitionText
  );
  const strictWalls = /config\.scene\?\.walls/.test(definitionText);
  if (!tolerantDoors || !strictWalls) {
    problems.push({
      file: rel(definitionPath),
      line: 0,
      detail:
        "doorModels 的两处取数口径变了（门列表 / 墙列表不再是「一个宽一个窄」）—— " +
        "若已改成两种形态都认，请连同本守卫与 config-metadata.js 的注释一起改掉"
    });
  }
  const callRe = /\b(?:entry)?doorModels\s*\(([^()]*)\)/g;
  for (const file of moduleSourceFiles()) {
    let text;
    try {
      text = fs.readFileSync(file, "utf8");
    } catch {
      continue;
    }
    const lineOf = makeLineCounter(text);
    for (const match of text.matchAll(callRe)) {
      const arg = match[1].trim();
      if (arg === "" || arg === "config" || !arg.includes(".")) continue;
      if (!/\.scene\b/.test(arg) && !/\.scene$/.test(arg)) continue;
      if (/\bsome\s*\(/.test(arg)) continue;
      problems.push({
        file: rel(file),
        line: lineOf(match.index),
        detail: `${match[0].trim()} 传的是 scene —— 画在墙上的门会全部被丢弃，改传楼层对象`
      });
    }
  }
  return problems;
}

/**
 * 卷帘（coverKind=roller）契约：帘型默认取户型模型形态，模型侧字段名与取值照搬上游 0.6.5
 */
function checkCurtainKindContract() {
  const problems = [];
  const cases = [
    {
      files: [
        "apps/server/modules/interaction3d/config.py",
        "apps/server/modules/interaction3d/config_domains.py"
      ],
      tests: [
        [
          /not in \('standard', 'dream', 'roller'\)/,
          "coverKind 取值枚举缺 roller（编辑器选卷帘会整份 422）"
        ],
        [/'coverKindOverride'/, "窗帘字段白名单缺 coverKindOverride"],
        [
          /if 'coverKindOverride' in item and not isinstance\(item\['coverKindOverride'\], bool\)/,
          "coverKindOverride 缺少与 curtainFabricOverride 同形的布尔校验"
        ]
      ]
    },
    {
      file: "frontend/modules/runtime/editor/config-editor.js",
      tests: [
        [/\["roller", "卷帘"\]/, "「窗帘类型」下拉缺卷帘选项"],
        [/\["dream", "roller"\]\.includes\(pickedCurtainKind\)/, "窗帘类型选择回调未放行 roller"],
        [/selectedItem\.coverKindOverride = true/, "窗帘类型选择回调未置 coverKindOverride"],
        [
          /\["standard", "dream", "roller"\]\.includes\(normalizedItem\.coverKind\)/,
          "草稿归一白名单缺 roller（存过的卷帘会被折算成普通窗帘）"
        ],
        [
          /floorCurtainModel\?\.curtainForm \?\? floorCurtainModel\?\.curtainStyle/,
          "编辑器未按 curtainForm 读模型帘型（历史 curtainStyle 也要能读出来）"
        ]
      ]
    },
    {
      file: "frontend/modules/runtime/core/stage/config-metadata.js",
      tests: [
        [
          /curtainForm: curtainItem\.curtainForm \?\? curtainItem\.curtainStyle/,
          "舞台元数据未透传 curtainForm（编辑器看不到模型帘型，卷帘恒显示普通窗帘）"
        ]
      ]
    },
    {
      file: "frontend/modules/runtime/core/stage/geometry.js",
      tests: [
        [
          /itemConfig\.coverKindOverride === true/,
          "resolveCurtainGeometry 未按 coverKindOverride 解析帘型（覆写选了卷帘仍按垂帘渲染）"
        ],
        [
          /\(sceneItemSource\?\.curtainForm \?\? sceneItemSource\?\.curtainStyle\) === "roller"/,
          "resolveCurtainGeometry 未按 curtainForm 读模型帘型（兼容读的 curtainStyle 也丢了）"
        ]
      ]
    },
    {
      file: "frontend/modules/runtime/cover/curtain-motion.js",
      tests: [
        [/COVER_KIND_ROLLER = "roller"/, "卷帘令牌 COVER_KIND_ROLLER 不见了"],
        [
          /binding\.coverKind === COVER_KIND_ROLLER/,
          "卷帘骨架分支未按绑定上的 coverKind 判定（单调字段名就会静默退回垂帘）"
        ]
      ]
    },
    {
      file: "frontend/3d-studio.html",
      tests: [
        [
          /<select id="curtain-form">[\s\S]*?<option value="standard">普通窗帘<\/option>/,
          "工作室下拉框不是上游的 #curtain-form / standard（存下来的帘型对不上运行时）"
        ]
      ]
    },
    {
      file: "frontend/static/3d-studio/loaders/studio-curtain-track.js",
      tests: [
        [
          /inputOptions\.curtainForm \?\? inputOptions\.curtainStyle/,
          "工作室归一化未读上游字段 curtainForm（也没有兼容历史 curtainStyle）"
        ],
        [
          /curtainForm: curtainIsRoller \? CURTAIN_FORM_ROLLER : CURTAIN_FORM_STANDARD/,
          "工作室归一化未把形态写回 curtainForm（存进草稿的是别的字段名）"
        ]
      ]
    },
    {
      file: "frontend/static/3d-studio/studio/studio-app.js",
      tests: [
        [
          /selectElement\("#curtain-form"\)\.value/,
          "工作室保存窗帘时未从 #curtain-form 取形态（改了名字却没接上）"
        ],
        [
          /delete editingEntity\.curtainStyle/,
          "工作室保存窗帘时未清掉历史 curtainStyle 键（一副帘会同时带两个形态键）"
        ]
      ]
    }
  ];
  for (const testCase of cases) {
    // 一个出口可能横跨多个文件（后端校验按域拆到了 config_domains.py）：判据是「这些必须
    const fulls = (testCase.files ?? [testCase.file]).map((item) => path.join(ROOT, item));
    let text = "";
    try {
      text = fulls.map((item) => fs.readFileSync(item, "utf8")).join("\n");
    } catch {
      problems.push({ file: rel(fulls[0]), line: 0, detail: "读不到文件，守卫无法判定" });
      continue;
    }
    for (const [pattern, detail] of testCase.tests) {
      if (!pattern.test(text)) {
        problems.push({ file: rel(fulls[0]), line: 0, detail });
      }
    }
  }
  return problems;
}

// ---------------------------------------------------------------------------
// 29) 模块里出现「本文件解析不出绑定」的标识符取用（真正的语法树 + 作用域链）
// ---------------------------------------------------------------------------

const HOST_GLOBALS = new Set([
  // 语言内置
  "undefined", "Infinity", "NaN", "globalThis", "Object", "Function", "Boolean", "Symbol",
  "Error", "AggregateError", "EvalError", "RangeError", "ReferenceError", "SyntaxError",
  "TypeError", "URIError", "Number", "BigInt", "Math", "Date", "String", "RegExp", "Array",
  "Int8Array", "Uint8Array", "Uint8ClampedArray", "Int16Array", "Uint16Array", "Int32Array",
  "Uint32Array", "Float32Array", "Float64Array", "BigInt64Array", "BigUint64Array",
  "Map", "Set", "WeakMap", "WeakSet", "WeakRef", "ArrayBuffer", "SharedArrayBuffer", "DataView",
  "Atomics", "JSON", "Promise", "Proxy", "Reflect", "Intl", "FinalizationRegistry",
  "structuredClone", "queueMicrotask", "parseInt", "parseFloat", "isNaN", "isFinite",
  "encodeURIComponent", "decodeURIComponent", "encodeURI", "decodeURI", "escape", "unescape",
  // 定时器
  "setTimeout", "clearTimeout", "setInterval", "clearInterval", "requestAnimationFrame",
  "cancelAnimationFrame", "requestIdleCallback", "cancelIdleCallback",
  // DOM / 宿主
  "window", "document", "navigator", "location", "history", "screen", "performance", "console",
  "devicePixelRatio", "innerWidth", "innerHeight", "outerWidth", "outerHeight", "scrollX",
  "scrollY", "matchMedia", "getComputedStyle", "getSelection", "localStorage", "sessionStorage",
  "indexedDB", "crypto", "trustedTypes", "visualViewport", "customElements", "structuredClone",
  "atob", "btoa", "alert", "confirm", "prompt", "print", "reportError", "fetch", "postMessage",
  "addEventListener", "removeEventListener", "dispatchEvent", "queueMicrotask", "self", "top",
  "parent", "frames", "opener", "closed", "isSecureContext", "crossOriginIsolated",
  // DOM 构造器与接口
  "Event", "EventTarget", "CustomEvent", "MouseEvent", "PointerEvent", "KeyboardEvent",
  "WheelEvent", "TouchEvent", "DragEvent", "FocusEvent", "InputEvent", "CompositionEvent",
  "ClipboardEvent", "MessageEvent", "ErrorEvent", "PromiseRejectionEvent", "MutationObserver",
  "ResizeObserver", "IntersectionObserver", "AbortController", "AbortSignal", "DOMParser",
  "XMLSerializer", "Image", "Audio", "Option", "Blob", "File", "FileReader", "FileList",
  "FormData", "Headers", "Request", "Response", "URL", "URLSearchParams", "TextEncoder",
  "TextDecoder", "WebSocket", "Worker", "SharedWorker", "BroadcastChannel", "MessageChannel",
  "MessagePort", "OffscreenCanvas", "Path2D", "ImageData", "ImageBitmap", "createImageBitmap",
  "WebAssembly", "Notification", "AudioContext", "OfflineAudioContext", "MediaQueryList",
  "speechSynthesis", "SpeechSynthesisUtterance", "CSS", "Range", "Selection", "DOMRect",
  "DOMRectReadOnly", "DOMMatrix", "DOMException", "DOMTokenList", "NamedNodeMap", "Attr",
  "Node", "Element", "Text", "Comment", "DocumentType", "CharacterData", "ProcessingInstruction",
  "CDATASection", "DocumentFragment", "ShadowRoot", "NodeList", "HTMLCollection", "StyleSheetList",
  "CSSStyleSheet", "CSSRule", "CSSStyleRule", "CSSStyleDeclaration", "MediaList", "HTMLElement",
  "HTMLDialogElement", "HTMLInputElement", "HTMLButtonElement", "HTMLSelectElement",
  "HTMLCanvasElement", "HTMLVideoElement", "HTMLImageElement", "HTMLLabelElement",
  "HTMLDivElement", "HTMLSpanElement", "HTMLAnchorElement", "HTMLFormElement",
  "HTMLTextAreaElement", "HTMLSlotElement", "HTMLTemplateElement", "HTMLIFrameElement",
  "HTMLScriptElement", "HTMLLinkElement", "HTMLStyleElement", "HTMLHeadElement",
  "HTMLBodyElement", "HTMLHtmlElement", "HTMLMetaElement", "CustomElementRegistry",
  "Audio", "CanvasRenderingContext2D", "WebGLRenderingContext", "WebGL2RenderingContext"
]);

/**
 * 「净化器可绑定的场景模型类型」三处白名单必须同源。
 */
function checkPurifierModelTypes() {
  const problems = [];
  // 类型名统一是小写字母 / 数字 / 下划线，两侧引号都收，因此 JS 与 Python 两边的字面量共用一段提取。
  const quotedTypes = source =>
    [...source.matchAll(/["']([a-z][a-z0-9_]*)["']/g)].map(match => match[1]).sort();

  const sources = [
    {
      file: "frontend/modules/runtime/editor/config-editor.js",
      where: "sceneModelTypes() 的 isAirPurifierMode 分支",
      read: text => {
        const functionAt = text.indexOf("function sceneModelTypes()");
        if (functionAt === -1) return null;
        const branchAt = text.indexOf("isAirPurifierMode", functionAt);
        if (branchAt === -1) return null;
        // 该分支里第一个 `return [ ... ]` 就是类型白名单。
        return /return\s*\[([^\]]*)\]/.exec(text.slice(branchAt))?.[1] ?? null;
      }
    },
    {
      file: "frontend/modules/runtime/core/stage/binding-collectors.js",
      where: "collectClimateBindings() 里 airPurifiers 那一支的类型实参",
      read: text => {
        const callAt = text.indexOf("ctx.config.environment?.airPurifiers,");
        if (callAt === -1) return null;
        // 紧跟在配置实参后的第一个数组字面量就是类型白名单。
        const openAt = text.indexOf("[", callAt);
        const closeAt = text.indexOf("]", openAt);
        return openAt === -1 || closeAt === -1 ? null : text.slice(openAt + 1, closeAt);
      }
    },
    {
      file: "apps/server/modules/interaction3d/purifier.py",
      where: "PURIFIER_MODEL_TYPES",
      read: text => /PURIFIER_MODEL_TYPES\s*=\s*frozenset\(\{([^}]*)\}\)/s.exec(text)?.[1] ?? null
    }
  ];

  const readTypes = [];
  for (const source of sources) {
    let text;
    try {
      text = fs.readFileSync(path.join(ROOT, source.file), "utf8");
    } catch {
      problems.push({
        file: source.file,
        line: 0,
        detail: `读不到文件，${source.where} 的白名单无从核对`
      });
      continue;
    }
    const types = quotedTypes(source.read(text) ?? "");
    if (types.length === 0) {
      problems.push({
        file: source.file,
        line: 0,
        detail:
          `解析不出 ${source.where} 里的类型白名单 —— 写法改了就得连这条守卫一起改，` +
          "别让它退化成永远通过"
      });
      continue;
    }
    readTypes.push({ ...source, types });
  }

  // 三处都解析不出时上面已经逐条报过；只剩一处时没有可比对象，说明守卫本身已经失效。
  if (readTypes.length < 2) {
    if (readTypes.length === 1) {
      problems.push({
        file: readTypes[0].file,
        line: 0,
        detail: "另外两处都解析不出白名单，无法核对三者是否同源"
      });
    }
    return problems;
  }

  const reference = readTypes[0];
  for (const candidate of readTypes.slice(1)) {
    if (candidate.types.join(",") !== reference.types.join(",")) {
      problems.push({
        file: candidate.file,
        line: 0,
        detail:
          `${candidate.where} 是 [${candidate.types.join(", ")}]，与 ${reference.file} 的 ` +
          `[${reference.types.join(", ")}] 不一致（配对失败的那一类外观会静默绑不上或控不了）`
      });
    }
  }
  // 三处同时删掉净化器本体也是一种「一致」，但那等于把整类交互关掉，单独钉一句。
  if (!reference.types.includes("airpurifier")) {
    problems.push({
      file: reference.file,
      line: 0,
      detail: `白名单里没有 airpurifier 本体（当前只剩 [${reference.types.join(", ")}]）`
    });
  }
  return problems;
}

/**
 * 窗帘面板的返回键集合（上游 0.6.5 的 `deactivate`）。
 */
function checkCoverPanelDeactivate() {
  const problems = [];
  const panelPath = path.join(ROOT, "frontend/modules/runtime/cover/cover-panel.js");
  const groupPath = path.join(ROOT, "frontend/modules/runtime/cover/cover-group-panel.js");
  let panelText = "";
  try {
    panelText = fs.readFileSync(panelPath, "utf8");
  } catch {
    return [{ file: rel(panelPath), line: 0, detail: "读不到 cover-panel.js，守卫无法判定" }];
  }

  const returnAt = panelText.indexOf("\n  return {\n");
  const returnedBlock =
    returnAt === -1 ? "" : panelText.slice(returnAt, panelText.indexOf("\n  };", returnAt));
  if (!returnedBlock) {
    problems.push({
      file: rel(panelPath),
      line: 0,
      detail: "找不到 createCoverPanel 的返回对象字面量（守卫按 2 空格缩进的 return { 定位）"
    });
  }
  // 返回对象的顶层键：4 空格缩进，后跟 `:`（普通键）或 `(`（方法简写）。
  const returnedKeys = [...returnedBlock.matchAll(/^ {4}([A-Za-z_$][\w$]*)\s*[:(]/gm)].map(
    match => match[1]
  );
  for (const expected of ["root", "update", "deactivate", "dispose"]) {
    if (!returnedKeys.includes(expected)) {
      problems.push({
        file: rel(panelPath),
        line: 0,
        detail:
          `返回对象缺 ${expected}（当前只有 [${returnedKeys.join(", ")}]）—— ` +
          (expected === "deactivate"
            ? "帘组面板会退化成 ?.() 兜底，拖动预览撤不回"
            : "调用侧会解析期报错")
      });
    }
  }
  const deactivateBody = returnedBlock.match(/^ {4}deactivate\(\)\s*\{([\s\S]*?)^ {4}\}/m);
  if (!deactivateBody || !/if \(isDragging\)/.test(deactivateBody[1])) {
    problems.push({
      file: rel(panelPath),
      line: 0,
      detail:
        "deactivate 少了「仅在拖动中才动手」的守卫（与 0.6.5 同口径：没有草稿就不必惊动场景）"
    });
  } else if (!/cancelPreview\(\)/.test(deactivateBody[1])) {
    problems.push({
      file: rel(panelPath),
      line: 0,
      detail: "deactivate 没有走 cancelPreview()（它才有完整的「撤预览 + 重绘」路径）"
    });
  }

  let groupText = "";
  try {
    groupText = fs.readFileSync(groupPath, "utf8");
  } catch {
    problems.push({ file: rel(groupPath), line: 0, detail: "读不到 cover-group-panel.js" });
  }
  const lineOf = makeLineCounter(groupText);
  for (const match of groupText.matchAll(/\bdeactivate\?\./g)) {
    problems.push({
      file: rel(groupPath),
      line: lineOf(match.index),
      detail: "又出现了 deactivate?.() 兜底 —— 方法名写错了也不会有人知道，直接调用"
    });
  }
  return problems;
}

/**
 * 扫地机状态别名词表（与上游 0.6.5 逐条对齐）。
 */
function checkVacuumStateAliases() {
  const problems = [];
  const mapPath = path.join(ROOT, "frontend/modules/runtime/vacuum/vacuum-map.js");
  let text = "";
  try {
    text = fs.readFileSync(mapPath, "utf8");
  } catch {
    return [{ file: rel(mapPath), line: 0, detail: "读不到 vacuum-map.js，守卫无法判定" }];
  }
  // 查表点写作 `{...}[vacuumRawState.toLowerCase()]`（查表前要先归一化大小写，
  const at = text.indexOf("[vacuumRawState");
  const tableAt = text.lastIndexOf("{", at);
  const tableBody = at === -1 || tableAt === -1 ? "" : text.slice(tableAt, at);
  if (!tableBody) {
    problems.push({
      file: rel(mapPath),
      line: 0,
      detail: "找不到 vacuumRawState 的文案字典（守卫按 `[vacuumRawState]` 反查）"
    });
    return problems;
  }
  const labels = new Map(
    [...tableBody.matchAll(/([a-z_][a-z0-9_]*)\s*:\s*"([^"]*)"/g)].map(match => [
      match[1],
      match[2]
    ])
  );
  // 分组即「同一语义」：组内任一别名缺失都会静默退回兜底文案。
  const aliasGroups = {
    回充中: ["returning", "returning_to_base", "returning_home"],
    待机: ["idle", "standby", "ready"],
    已停止: ["stopped", "off"],
    清洗拖布: ["washing", "mop_washing", "self_washing", "cleaning_mop"],
    烘干拖布: ["drying", "mop_drying", "drying_mop"]
  };
  for (const [label, aliases] of Object.entries(aliasGroups)) {
    for (const alias of aliases) {
      if (!labels.has(alias)) {
        problems.push({
          file: rel(mapPath),
          line: 0,
          detail: `状态字典缺别名 ${alias}（该状态会静默显示成「状态更新中」）`
        });
        continue;
      }
      if (labels.get(alias) !== label) {
        problems.push({
          file: rel(mapPath),
          line: 0,
          detail: `${alias} 的文案是「${labels.get(alias)}」，与同义别名不一致（应为「${label}」）`
        });
      }
    }
  }
  return problems;
}

const FREE_IDENTIFIER_SCAN_ROOTS = [
  path.join(FRONTEND_DIR, "modules"),
  path.join(STATIC_DIR)
];

const freeIdentifiers = await import("./lib/free-variables.mjs");

function checkFreeIdentifiers() {
  const problems = [];
  for (const root of FREE_IDENTIFIER_SCAN_ROOTS) {
    for (const file of walk(root, new Set([".js"]))) {
      // vendor 已经由 walk 的 SKIP_DIRS 挡掉；这里再挡一次是为了任何路径写法下都安全。
      if (rel(file).includes("vendor/")) continue;
      const source = fs.readFileSync(file, "utf8");
      let result;
      try {
        result = freeIdentifiers.collectFreeIdentifiers(source, { filename: rel(file) });
      } catch (error) {
        problems.push({
          file: rel(file),
          line: 0,
          detail: `解析失败，守卫无法判定：${error.message}`
        });
        continue;
      }
      if (result.unhandledTypes.size) {
        problems.push({
          file: rel(file),
          line: 0,
          detail:
            "分析器遇到没显式处理的语法节点（多半是 acorn 升级带来的新语法），" +
            `请补进 tools/lib/free-variables.mjs 的 dispatch 再决定怎么算：` +
            [...result.unhandledTypes].join("、")
        });
      }
      for (const reference of result.references) {
        if (HOST_GLOBALS.has(reference.name)) continue;
        problems.push({
          file: rel(file),
          line: reference.line,
          detail:
            `引用了本文件解析不出绑定的名字 \`${reference.name}\` —— ` +
            "这类写法没有任何静态报错，只有执行到这一行才 ReferenceError。" +
            "按它该来自哪里补上：形参 / 解构 / import，或改用同作用域里已有的那个名字"
        });
      }
    }
  }
  return problems;
}

/**
 * 取 `marker` 之后第一个 `{ ... }` 的配对内容；括号不配对时返回空串。
 */
function objectLiteralBody(text, marker) {
  const markerAt = text.indexOf(marker);
  if (markerAt === -1) return "";
  const start = text.indexOf("{", markerAt);
  if (start === -1) return "";
  let depth = 0;
  for (let index = start; index < text.length; index += 1) {
    const character = text[index];
    if (character === "{") depth += 1;
    else if (character === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(start + 1, index);
    }
  }
  return "";
}

function checkFocusableDeviceKinds() {
  const problems = [];
  const geometryPath = path.join(ROOT, "frontend/modules/runtime/core/stage/geometry.js");
  let text = "";
  try {
    text = fs.readFileSync(geometryPath, "utf8");
  } catch {
    return [{ file: rel(geometryPath), line: 0, detail: "读不到 geometry.js，守卫无法判定" }];
  }
  const at = text.indexOf("const isFocusableDevice");
  const body = at === -1 ? "" : text.slice(at, text.indexOf(";", at) === -1 ? undefined : text.indexOf(";", at));
  if (!body) {
    problems.push({
      file: rel(geometryPath),
      line: 0,
      detail: "找不到 isFocusableDevice（守卫靠这个名字反查）"
    });
    return problems;
  }
  // 与上游 0.6.5 同集合：漏掉 lock 或通用设备品类，那类绑定会继续落到「有 modelId → 空调」
  for (const kind of ["lock", "nas", "television", "vacuum", "presence", "camera"]) {
    if (!body.includes(`"${kind}"`)) {
      problems.push({
        file: rel(geometryPath),
        line: 0,
        detail: `聚焦可用清单缺 "${kind}"（该设备点一下不再弹面板，还会误触空调开关）`
      });
    }
  }
  if (!body.includes("isGenericDeviceKind(")) {
    problems.push({
      file: rel(geometryPath),
      line: 0,
      detail: "聚焦可用清单没用 isGenericDeviceKind 覆盖通用设备品类（冰箱等点一下会误触空调开关）"
    });
  }
  return problems;
}

function checkLicenseStatusLabelSets() {
  const problems = [];
  const readText = relativePath => {
    try {
      return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
    } catch {
      return null;
    }
  };
  // 三处同源：后端是状态枚举的唯一出处，恢复页与编辑器顶栏各有一份展示文案。
  const sources = [
    {
      file: "apps/server/license/service.py",
      marker: "labels = {",
      pattern: /'([A-Z][A-Z0-9_]+)'\s*:/g
    },
    {
      file: "frontend/static/auth/license-recovery.js",
      marker: "const STATUS_MESSAGES = {",
      pattern: /([A-Z][A-Z0-9_]+)\s*:/g
    },
    {
      file: "frontend/static/editor/home.js",
      marker: "const licenseStatusLabelByCode = {",
      pattern: /([A-Z][A-Z0-9_]+)\s*:/g
    }
  ];
  const sets = [];
  for (const source of sources) {
    const text = readText(source.file);
    if (text === null) {
      problems.push({ file: source.file, line: 0, detail: "读不到文件，守卫无法判定" });
      continue;
    }
    const body = objectLiteralBody(text, source.marker);
    if (!body) {
      problems.push({
        file: source.file,
        line: 0,
        detail: `找不到 ${source.marker} 对应的对象字面量`
      });
      continue;
    }
    sets.push({
      file: source.file,
      keys: new Set([...body.matchAll(source.pattern)].map(match => match[1]))
    });
  }
  if (sets.length !== sources.length) return problems;
  const canonical = sets[0];
  for (const other of sets.slice(1)) {
    for (const key of canonical.keys) {
      if (!other.keys.has(key)) {
        problems.push({
          file: other.file,
          line: 0,
          detail: `缺状态码 ${key}（该状态的文案会原样落成英文码或空白）`
        });
      }
    }
    for (const key of other.keys) {
      if (!canonical.keys.has(key)) {
        problems.push({
          file: other.file,
          line: 0,
          detail: `多出状态码 ${key}（后端 service.py 已不产出该状态，文案成了死条目）`
        });
      }
    }
  }
  return problems;
}

/**
 * 第 35 条：前端能派发的 HA 服务必须登记进后端 ALLOWED_SERVICES。
 */
const NON_HA_SERVICE_LITERALS = new Set([]);

function checkFrontendHaServicesAllowed() {
  const problems = [];
  const lineOf = (text, index) => text.slice(0, index).split("\n").length;
  const haFile = path.join(BACKEND_DIR, "api", "ha.py");
  let haText;
  try {
    haText = fs.readFileSync(haFile, "utf8");
  } catch {
    return [{ file: rel(haFile), line: 0, detail: "读不到 ha.py，守卫无法判定" }];
  }
  // 只截 ALLOWED_SERVICES 那一段：文件别处也有 ('x', 'y') 形状的元组。
  const block = haText.match(/ALLOWED_SERVICES[^{]*\{([\s\S]*?)\n\}/);
  if (!block) {
    return [{ file: rel(haFile), line: 0, detail: "找不到 ALLOWED_SERVICES 字面量" }];
  }
  const allowedPairs = new Set(
    [...block[1].matchAll(/\(\s*'([a-z_]+)'\s*,\s*'([a-z_]+)'\s*\)/g)].map(
      match => `${match[1]}.${match[2]}`
    )
  );
  const allowedServiceNames = new Set(
    [...allowedPairs].map(pair => pair.slice(pair.indexOf(".") + 1))
  );
  if (allowedPairs.size === 0) {
    return [{ file: rel(haFile), line: 0, detail: "ALLOWED_SERVICES 一条都没解析出来，匹配式可能失效" }];
  }

  const positions = [
    { re: /\bservice\s*:\s*"([a-z_]+)"/g, service: 1 },
    { re: /\bcallEntityService\(\s*"([a-z_]+)"\s*,\s*"([a-z_]+)"/g, domain: 1, service: 2 },
    { re: /\binvoke\w*Service\(\s*"([a-z_]+)"\s*,\s*"([a-z_]+)"/g, domain: 1, service: 2 },
    {
      re: /\bcreateMediaActionButton\(\s*"[^"]*"\s*,\s*"([a-z_]+)"/g,
      service: 1,
      domainText: "media_player"
    }
  ];

  const report = (file, service, line, domain) => {
    if (NON_HA_SERVICE_LITERALS.has(service)) return;
    if (domain) {
      if (allowedPairs.has(`${domain}.${service}`)) return;
      problems.push({
        file: rel(file),
        line,
        detail: `${domain}.${service} 不在 ALLOWED_SERVICES 里（按钮可点、命令必被后端 403，面板只回显笼统失败）`
      });
      return;
    }
    if (allowedServiceNames.has(service)) return;
    problems.push({
      file: rel(file),
      line,
      detail: `${service} 不在 ALLOWED_SERVICES 的任一域里（该控件可点、命令必被拒）`
    });
  };

  for (const dir of ["frontend/static", "frontend/modules"]) {
    for (const file of walk(path.join(ROOT, dir), new Set([".js"]))) {
      let text;
      try {
        text = fs.readFileSync(file, "utf8");
      } catch {
        continue;
      }
      for (const position of positions) {
        for (const match of text.matchAll(position.re)) {
          const domain = position.domain ? match[position.domain] : position.domainText;
          report(file, match[position.service], lineOf(text, match.index), domain);
        }
      }
      // 扫地机动作定义表：行首是动作名，运行侧可能原样派发，也可能映射成 turn_on / turn_off。
      for (const table of text.matchAll(/vacuumActionDefinitions\s*=\s*\[([\s\S]*?)\n\s*\];/g)) {
        for (const row of table[1].matchAll(/\[\s*"([a-z_]+)"\s*,/g)) {
          const rowOffset = table[0].indexOf(row[0]);
          report(file, row[1], lineOf(text, table.index + Math.max(rowOffset, 0)), "");
        }
      }
    }
  }
  return problems;
}

/**
 * 第 37 条：附加实体的「域 → 卡片形态」词表两端同源。
 */
function checkExtraEntityDomainParity() {
  const runtimeFile = "frontend/modules/runtime/climate/purifier-extras.js";
  const backendFile = "apps/server/modules/interaction3d/purifier.py";
  const readText = relativePath => {
    try {
      return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
    } catch {
      return null;
    }
  };
  const runtimeText = readText(runtimeFile);
  if (runtimeText === null) {
    return [{ file: runtimeFile, line: 0, detail: "读不到文件，守卫无法判定" }];
  }
  const backendText = readText(backendFile);
  if (backendText === null) {
    return [{ file: backendFile, line: 0, detail: "读不到文件，守卫无法判定" }];
  }

  const runtimeBody = objectLiteralBody(runtimeText, "const mapped = {");
  if (!runtimeBody) {
    return [
      { file: runtimeFile, line: 0, detail: "找不到 extraTypes 里的 const mapped = { … } 词表（守卫失效）" }
    ];
  }
  const runtimeDomains = new Set([...runtimeBody.matchAll(/([a-z_]+)\s*:/g)].map(match => match[1]));

  const backendBody = objectLiteralBody(backendText, "EXTRA_TYPES");
  if (!backendBody) {
    return [{ file: backendFile, line: 0, detail: "找不到 EXTRA_TYPES 字面量（守卫失效）" }];
  }
  const backendDomains = new Set(
    [...backendBody.matchAll(/"([a-z_]+)"\s*:\s*"([a-z_]+)"/g)]
      .filter(match => match[2] !== "state")
      .map(match => match[1])
  );

  const problems = [];
  for (const domain of runtimeDomains) {
    if (!backendDomains.has(domain)) {
      problems.push({
        file: backendFile,
        line: 0,
        detail: `前端按可写渲染 ${domain}，后端 EXTRA_TYPES 却没登记（那张卡片可点、命令必被 422 拒）`
      });
    }
  }
  for (const domain of backendDomains) {
    if (!runtimeDomains.has(domain)) {
      problems.push({
        file: runtimeFile,
        line: 0,
        detail: `后端放行 ${domain}，前端 extraTypes 却不认识它（那张卡永远渲染不出来，是死条目）`
      });
    }
  }
  return problems;
}

/**
 * 第 38 条：表达式被静默改写的语法陷阱。
 */
function checkSilentExpressionRewrite() {
  const problems = [];
  const lineNumberResidue = /^\s*[0-9]+\s*\|/;
  const stringBitwiseOr = /(?:[0-9]\s*\|\s*[\`"']|[\`"']\s*\|\s*[0-9])/;
  const roots = [FRONTEND_DIR, STORE_DIR, BACKEND_DIR, TOOLS_DIR];
  const extensions = new Set([".js", ".mjs", ".css"]);
  for (const root of roots) {
    for (const file of walk(root, extensions)) {
      const relative = rel(file);
      if (relative.includes("/vendor/") || relative.startsWith("tools/vendor/")) continue;
      let raw;
      try {
        raw = fs.readFileSync(file, "utf8");
      } catch {
        continue;
      }
      // 先剥注释再扫：本守卫的文档注释里就引用了这两个坏形态（\`370|\` 与 \`370 | "x"\`），
      const lines = stripComments(raw).split("\n");
      for (const [index, line] of lines.entries()) {
        if (lineNumberResidue.test(line)) {
          problems.push({
            file: relative,
            line: index + 1,
            detail: `行首出现「数字 + |」的残留行号：${line.trim().slice(0, 60)}（表达式会被静默改写）`
          });
          continue;
        }
        if (extensions.has(path.extname(file)) && path.extname(file) !== ".css" && stringBitwiseOr.test(line)) {
          problems.push({
            file: relative,
            line: index + 1,
            detail: `数字与字符串/模板串做位或（值会被静默转成数字）：${line.trim().slice(0, 60)}`
          });
        }
      }
    }
  }
  return problems;
}

/**
 * 第 39 条：文件规模预算（棘轮式：只许减、不许增）。
 */
function checkFileSizeBudget() {
  const problems = [];
  const baselinePath = path.join(TOOLS_DIR, "file-size-baseline.json");
  let baseline;
  try {
    baseline = JSON.parse(fs.readFileSync(baselinePath, "utf8"));
  } catch (error) {
    return [{ file: rel(baselinePath), line: 0, detail: `读不到或解析不了台账：${error}` }];
  }
  const limits = baseline.limits || {};
  const recorded = baseline.over || {};
  const limitFor = extension => (extension === ".py" ? limits.py : limits.js);
  const seen = new Set();

  for (const root of [BACKEND_DIR, STORE_DIR, FRONTEND_DIR]) {
    for (const file of walk(root, new Set([".py", ".js", ".mjs"]))) {
      const relative = rel(file);
      if (relative.includes("/vendor/") || relative.endsWith(".min.js")) continue;
      const limit = limitFor(path.extname(file));
      if (!limit) continue;
      let lineCount;
      try {
        // 与编辑器显示的"行数"对齐：文件以换行结尾时 split 会多出一个空串，先去掉再数。
        const lines = fs.readFileSync(file, "utf8").split("\n");
        if (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();
        lineCount = lines.length;
      } catch {
        continue;
      }
      const budget = recorded[relative];
      if (budget !== undefined) seen.add(relative);
      if (lineCount > limit) {
        if (budget === undefined) {
          problems.push({
            file: relative,
            line: 0,
            detail: `${lineCount} 行，超过 ${limit} 行预算且没有登记（新增债务）。请按功能域拆开，或确有理由时登记进 tools/file-size-baseline.json`
          });
        } else if (lineCount > budget) {
          problems.push({
            file: relative,
            line: 0,
            detail: `${lineCount} 行，比台账登记的 ${budget} 行还多（旧债又涨了）。台账只许减：拆完再更新它`
          });
        }
        continue;
      }
      if (budget !== undefined) {
        problems.push({
          file: relative,
          line: 0,
          detail: `${lineCount} 行，已经回到 ${limit} 行预算以内，请从 tools/file-size-baseline.json 删掉这条（台账只许缩）`
        });
      }
    }
  }
  for (const relative of Object.keys(recorded)) {
    if (!seen.has(relative)) {
      problems.push({
        file: relative,
        line: 0,
        detail: "台账里登记的文件不存在（已改名或已删除），请同步 tools/file-size-baseline.json"
      });
    }
  }
  return problems;
}

/**
 * 第 41 条：仓库路径不许在脚本里重复推导。
 */
function checkPathConstantsHaveOneSource() {
  const problems = [];
  const pathsFile = path.join(TOOLS_DIR, "paths.mjs");
  const source = fs.readFileSync(pathsFile, "utf8");

  // 1) 从 paths.mjs 解出「常量名 → 相对段」。
  const exported = [];
  for (const match of source.matchAll(/export const ([A-Z_]+) = join\(([^)]*)\);/g)) {
    const segments = [...match[2].matchAll(/"([^"]+)"/g)].map(item => item[1]);
    if (segments.length) exported.push({ name: match[1], segments });
  }
  if (!exported.length) {
    return [{ file: rel(pathsFile), line: 0, detail: "解不出任何导出常量 —— 本判据整体失效，先修 paths.mjs" }];
  }

  const escapeRe = value => value.replace(/[.*+?^$@{}()|[\]\\]/g, "\\$&");
  const matchers = exported.map(item => ({
    name: item.name,
    segments: item.segments,
    pattern: new RegExp(
      "path\\.join\\(\\s*ROOT\\s*,"
        + item.segments.map(seg => '\\s*"' + escapeRe(seg) + '"').join("\\s*,")
        + "(?=\\s*[,)])"
    )
  }));
  const rootPattern =
    /path\.resolve\(\s*path\.dirname\(\s*fileURLToPath\(\s*import\.meta\.url\s*\)\s*\)\s*,\s*"\."\s*\)/;

  for (const entry of fs.readdirSync(TOOLS_DIR, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".mjs") || entry.name === "paths.mjs") continue;
    const file = path.join(TOOLS_DIR, entry.name);
    const text = fs.readFileSync(file, "utf8");
    const lineAt = makeLineCounter(text);
    for (const matcher of matchers) {
      for (const match of text.matchAll(new RegExp(matcher.pattern.source, "g"))) {
        problems.push({
          file: rel(file),
          line: lineAt(match.index),
          detail:
            "又拼了一遍 paths.mjs 里的 " + matcher.name + "（" + matcher.segments.join("/")
            + "）—— 改成 import 那个常量"
        });
      }
    }
    const rootMatch = rootPattern.exec(text);
    if (rootMatch) {
      problems.push({
        file: rel(file),
        line: lineAt(rootMatch.index),
        detail: '自己算了一遍仓库根 —— 改成 import { ROOT } from "./paths.mjs"'
      });
    }
  }
  return problems;
}

/**
 * 第 42 条：匿名可访问的静态资源清单必须是清单文件，不许写回 Python 字面量。
 */
function checkPublicAssetManifest() {
  const problems = [];
  const manifestFile = path.join(FRONTEND_DIR, "public-static.json");
  let payload;
  try {
    payload = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
  } catch (error) {
    return [{ file: rel(manifestFile), line: 0, detail: "读不到或解析不了公开静态资源清单：" + error }];
  }
  if (!Array.isArray(payload?.files)) {
    return [{ file: rel(manifestFile), line: 0, detail: "files 必须是数组" }];
  }

  // 2) 每条都要在磁盘上存在
  for (const item of payload.files) {
    const value = typeof item === "string" ? item : item?.path;
    if (typeof value !== "string" || !value.startsWith("/static/")) {
      problems.push({
        file: rel(manifestFile),
        line: 0,
        detail: "非法条目（必须是以 /static/ 开头的字符串）：" + String(value)
      });
      continue;
    }
    const onDisk = path.join(STATIC_DIR, value.replace("/static/", ""));
    if (!fs.existsSync(onDisk)) {
      problems.push({
        file: rel(manifestFile),
        line: 0,
        detail: "清单里的 " + value + " 在磁盘上不存在（请求它只会 404 / 401，而白名单本身看不出问题）"
      });
    }
  }

  // 1) 装配层不许再写具体资源路径
  const assetLiteral = /["']\/static\/[A-Za-z0-9_][A-Za-z0-9_./-]*\.[A-Za-z0-9]+["']/;
  const seen = new Set();
  for (const file of walk(path.join(BACKEND_DIR, "app"), new Set([".py"]))) {
    const relative = rel(file);
    if (seen.has(relative) || relative.endsWith("app/public_assets.py")) continue;
    seen.add(relative);
    const text = stripComments(fs.readFileSync(file, "utf8"));
    const lineAt = makeLineCounter(text);
    for (const match of text.matchAll(new RegExp(assetLiteral.source, "g"))) {
      problems.push({
        file: relative,
        line: lineAt(match.index),
        detail: "写死的静态资源路径 " + match[0] + " —— 匿名白名单只许来自 frontend/public-static.json"
      });
    }
  }
  return problems;
}

/**
 * 第 43 条：两个可独立部署的项目（apps/server / store）不得互相 import。
 */
function checkDeployablesStayIndependent() {
  const problems = [];
  const directions = [
    { root: BACKEND_DIR, other: "apps\\.store", from: "主应用（apps/server）", to: "授权商店（apps/store）" },
    { root: STORE_DIR, other: "apps\\.server", from: "授权商店（apps/store）", to: "主应用（apps/server）" }
  ];
  const pattern = /^\s*(?:from|import)\s+OTHER(?:\.|\s|$)/m;
  for (const direction of directions) {
    const matcher = new RegExp(pattern.source.replace("OTHER", direction.other), "gm");
    for (const file of walk(direction.root, new Set([".py"]))) {
      const relative = rel(file);
      if (relative.includes("/__pycache__/")) continue;
      // 剥字符串与注释：只在真代码里判，文档/注释里提到对方不算。
      const text = stripCommentsAndStrings(fs.readFileSync(file, "utf8"));
      const lineAt = makeLineCounter(text);
      for (const match of text.matchAll(matcher)) {
        problems.push({
          file: relative,
          line: lineAt(match.index),
          detail:
            direction.from + " import 了 " + direction.to + " —— 两者是独立项目、可能分机部署，"
            + "一旦互相依赖就无法单独发版。要共用实现请用构建期生成 + 逐字节校验（见 design/scene 的模式）"
        });
      }
    }
  }
  return problems;
}

// ---------------------------------------------------------------------------
// 44) 同名双份的共享面走散（两份实现看起来一样，改一边另一边静默不变）
// ---------------------------------------------------------------------------

/**
 * apps/server 与 apps/store 互不 import（不变量 #43），概念共享时实现各留一份。
 */
function extractSurface(text, name) {
  const lines = text.split("\n");
  const out = [];
  let capturing = false;
  for (const line of lines) {
    if (!capturing) {
      const isDef =
        new RegExp("^(?:async\\s+)?def\\s+" + name + "\\b").test(line) ||
        new RegExp("^class\\s+" + name + "\\b").test(line) ||
        new RegExp("^" + name + "\\s*(?::[^=\\n]*)?=").test(line);
      if (isDef) {
        capturing = true;
        out.push(line);
      }
      continue;
    }
    if (line === "") {
      out.push(line);
      continue;
    }
    if (/^\S/.test(line)) break;
    out.push(line);
  }
  return out.length ? out.join("\n") : null;
}

function stripCommentsAndDocstrings(text) {
  const withoutDocstrings = text
    .replace(/^\s*[rubfRUBF]*"""[\s\S]*?"""/gm, "")
    .replace(/^\s*[rubfRUBF]*'''[\s\S]*?'''/gm, "");
  return withoutDocstrings
    .split("\n")
    .filter((line) => line.trim() !== "" && !line.trim().startsWith("#"))
    .map((line) => line.replace(/\s+$/, ""))
    .join("\n")
    .trim();
}

function surfaceLiterals(text, mode) {
  const found = new Set();
  if (mode === "code-field") {
    for (const match of text.matchAll(/["']code["']\s*:\s*["']([^"']+)["']/g)) {
      found.add(match[1]);
    }
    return found;
  }
  for (const match of text.matchAll(/'([^'\n]*)'|"([^"\n]*)"/g)) {
    found.add(match[1] ?? match[2]);
  }
  return found;
}

function checkContractSurfaces() {
  const problems = [];
  const manifestPath = path.join(ROOT, "packages/contracts/surfaces.json");
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch {
    return [{ file: rel(manifestPath), line: 0, detail: "读不到或解析不了契约面清单" }];
  }
  for (const surface of manifest.surfaces ?? []) {
    if (surface.kind === "set") {
      const sets = [];
      for (const member of surface.members ?? []) {
        const full = path.join(ROOT, member.file);
        let text;
        try {
          text = fs.readFileSync(full, "utf8");
        } catch {
          problems.push({ file: rel(full), line: 0, detail: "契约面 " + surface.id + " 读不到文件" });
          continue;
        }
        const chunk = (member.names ?? []).map((name) => extractSurface(text, name)).filter(Boolean).join("\n");
        const items = surfaceLiterals(chunk, member.extract ?? "string-literals");
        for (const extra of member.extra ?? []) items.add(extra);
        sets.push({ file: member.file, items });
      }
      if (sets.length < 2) continue;
      const [first, ...rest] = sets;
      for (const other of rest) {
        const missing = [...first.items].filter((item) => !other.items.has(item));
        const extra = [...other.items].filter((item) => !first.items.has(item));
        if (missing.length || extra.length) {
          problems.push({
            file: other.file,
            line: 0,
            detail:
              "契约面 " + surface.id + " 两侧集合不同源：" +
              (missing.length ? first.file + " 有而这里没有 → " + missing.join(", ") + "；" : "") +
              (extra.length ? "这里有而 " + first.file + " 没有 → " + extra.join(", ") : "")
          });
        }
      }
      continue;
    }
    const seen = [];
    for (const member of surface.members ?? []) {
      const full = path.join(ROOT, member.file);
      let text;
      try {
        text = fs.readFileSync(full, "utf8");
      } catch {
        problems.push({ file: rel(full), line: 0, detail: "契约面 " + surface.id + " 读不到文件" });
        continue;
      }
      const missing = [];
      const chunks = [];
      for (const name of member.names ?? []) {
        const chunk = extractSurface(text, name);
        if (!chunk) {
          missing.push(name);
          continue;
        }
        chunks.push(stripCommentsAndDocstrings(chunk));
      }
      if (missing.length) {
        problems.push({
          file: rel(full),
          line: 0,
          detail: "契约面 " + surface.id + " 在这里找不到：" + missing.join(", ")
        });
        continue;
      }
      seen.push({ file: member.file, text: chunks.join("\n\n") });
    }
    if (seen.length < 2) continue;
    const [first, ...rest] = seen;
    for (const other of rest) {
      if (other.text !== first.text) {
        problems.push({
          file: other.file,
          line: 0,
          detail:
            "契约面 " + surface.id + " 的两份实现已经走散（" + first.file + " 与这里不同）。" +
            (surface.why ? " 走散的后果：" + surface.why : "")
        });
      }
    }
  }
  return problems;
}

// ---------------------------------------------------------------------------
// 45) 自研 JS 默认是 ESM：出现未登记的经典脚本就报错
// ---------------------------------------------------------------------------

function checkClassicScriptsRegistered() {
  const problems = [];
  const manifestPath = path.join(TOOLS_DIR, "classic-scripts.json");
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch {
    return [{ file: rel(manifestPath), line: 0, detail: "读不到或解析不了经典脚本清单" }];
  }
  const classic = new Map((manifest.classic || []).map(entry => [entry.file, entry]));
  const moduleNoExports = new Map((manifest.moduleNoExports || []).map(entry => [entry.file, entry]));

  // paths.mjs 导出的就是绝对路径，不要再 join(ROOT)。
  const roots = [STATIC_DIR, RUNTIME_MODULES_DIR, STORE_STATIC_DIR, DESIGN_SCENE_DIR];
  const seen = new Set();
  const bug = (file, message) => problems.push({ file, line: 0, detail: message });

  const walk = dir => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "vendor" || entry.name === "__pycache__") continue;
        walk(full);
        continue;
      }
      if (!entry.name.endsWith(".js") || entry.name.endsWith(".min.js")) continue;
      const relative = rel(full);
      if (seen.has(relative)) continue;
      seen.add(relative);
      const hasImportExport = /^\s*(import\s|export\s)/m.test(fs.readFileSync(full, "utf8"));
      const documentedClassic = classic.has(relative);
      const documentedModule = moduleNoExports.has(relative);
      if (hasImportExport) {
        if (documentedClassic || documentedModule) {
          bug(relative, "这份已经是普通模块了（文件里有 import/export），请把它从 tools/classic-scripts.json 里删掉 —— 清单只收「现在仍是例外」的文件");
        }
        continue;
      }
      if (documentedClassic || documentedModule) continue;
      bug(relative, "未登记的例外：文件里没有 import/export，看着像经典脚本。本仓默认 ESM，请写成模块" +
        "（<script type=\"module\"> + import/export）；确实必须是经典脚本（首帧前执行 / 必须最先执行 / 是 Worker）" +
        "登记进 classic，已经是模块只是不需要 import/export 的登记进 moduleNoExports，两处都要写 why");
    }
  };
  for (const root of roots) walk(root);
  for (const [file, entry] of [...classic, ...moduleNoExports]) {
    if (!seen.has(file)) bug(file, "清单里登记了但扫描没走到（路径写错了？）");
    else if (!entry.why || !entry.why.trim()) bug(file, "清单条目没有 why：写清为什么它是例外");
  }
  return problems;
}


// ---------------------------------------------------------------------------
// 45) design/scene 的五份文件在三处分发副本里逐字节一致
// ---------------------------------------------------------------------------

/** canonical 是 `design/scene/`，两个分发副本是主应用入口页与商店各自的那份。 */
const SYNCED_SCENE_FILES = ["page.css", "panel.css", "scene.css", "scene.html", "appearance.js"];

const SCENE_COPY_DIRS = [
  DESIGN_SCENE_DIR,
  path.join(FRONTEND_DIR, "static", "auth", "scene"),
  path.join(STORE_STATIC_DIR, "scene")
];

function checkSceneCopiesInSync() {
  const problems = [];
  for (const name of SYNCED_SCENE_FILES) {
    const canonical = path.join(SCENE_COPY_DIRS[0], name);
    if (!fs.existsSync(canonical)) {
      problems.push({ file: rel(canonical), line: 0, detail: `canonical 缺失：${name}` });
      continue;
    }
    const expected = fs.readFileSync(canonical, "utf8").split("\n");
    for (const directory of SCENE_COPY_DIRS.slice(1)) {
      const candidate = path.join(directory, name);
      if (!fs.existsSync(candidate)) {
        problems.push({ file: rel(candidate), line: 0, detail: `分发副本缺失：${name}` });
        continue;
      }
      const actual = fs.readFileSync(candidate, "utf8").split("\n");
      const limit = Math.min(expected.length, actual.length);
      let firstDiff = -1;
      for (let index = 0; index < limit; index++) {
        if (expected[index] !== actual[index]) {
          firstDiff = index;
          break;
        }
      }
      if (firstDiff === -1 && expected.length === actual.length) continue;
      problems.push({
        file: rel(candidate),
        line: firstDiff === -1 ? limit + 1 : firstDiff + 1,
        detail: `与 design/scene/${name} 不一致，请从 design/scene/ 同步这一份`
      });
    }
  }
  return problems;
}

// ---------------------------------------------------------------------------
// 46) 商店 theme.css 的 --hb-* 与 design/scene/page.css 的 --hos-* 逐 token 相等
// ---------------------------------------------------------------------------

/**
 * 镜像表：商店侧的名字 → 场景侧的名字。
 */
const HB_HOS_MIRROR_ALIAS = {
  "--hb-bg": "--hos-sky-deep",
  "--hb-surface": "--hos-sky-low",
  "--hb-surface-soft": "--hos-sky-mid",
  "--hb-surface-raised": "--hos-sky-high",
  ...Object.fromEntries(
    ["accent", "lumen", "aura", "eco", "heat", "cool", "alert", "sensor"].flatMap(name =>
      ["", "-rgb", "-bright", "-deep"].map(suffix => [`--hb-${name}${suffix}`, `--hos-${name}${suffix}`])
    )
  ),
  ...Object.fromEntries(
    ["sky-deep", "sky-low", "sky-mid", "sky-high", "sky-haze"].flatMap(name => [
      [`--hb-${name}`, `--hos-${name}`],
      [`--hb-${name}-rgb`, `--hos-${name}-rgb`]
    ])
  ),
  "--hb-ink": "--hos-ink",
  "--hb-ink-bright": "--hos-ink-bright",
  "--hb-ink-rgb": "--hos-ink-rgb",
  "--hb-muted-rgb": "--hos-muted-rgb",
  "--hb-on-bright": "--hos-on-bright",
  "--hb-star-rgb": "--hos-star-rgb",
  "--hb-star-cool-rgb": "--hos-star-cool-rgb"
};

/** 读「令牌名 → 原始值」，同一名字只取第一次定义。 */
function parseTokenMap(file) {
  const tokens = new Map();
  if (!fs.existsSync(file)) return tokens;
  const text = fs.readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  for (const match of text.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    if (!tokens.has(match[1])) tokens.set(match[1], match[2].trim());
  }
  return tokens;
}

/** `#081020` / `rgb(8, 16, 32)` / `8, 16, 32` → `[r, g, b, a]`。 */
function parseColorLiteral(value) {
  const hex = /^#([0-9a-fA-F]{6})$/.exec(value);
  if (hex) {
    const n = Number.parseInt(hex[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
  }
  const rgb = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(value);
  if (rgb) {
    return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3]), rgb[4] === undefined ? 1 : Number(rgb[4])];
  }
  const triplet = /^(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})$/.exec(value);
  return triplet ? [Number(triplet[1]), Number(triplet[2]), Number(triplet[3]), 1] : null;
}

/** 跟随 `var()` 链与 `rgba(var(--x-rgb), α)` 组合，解析成 `[r, g, b, a]`。 */
function resolveTokenColor(name, tokens, depth = 0) {
  if (depth > 8) return null;
  const raw = tokens.get(name);
  if (raw === undefined) return null;
  const direct = parseColorLiteral(raw);
  if (direct) return direct;
  const reference = /^var\(\s*(--[\w-]+)\s*(?:,([\s\S]+))?\)$/.exec(raw);
  if (reference) {
    const resolved = resolveTokenColor(reference[1], tokens, depth + 1);
    if (resolved) return resolved;
    return reference[2] ? parseColorLiteral(reference[2].trim()) : null;
  }
  const composite = /^rgba\(\s*var\(\s*(--[\w-]+)\s*\)\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(raw);
  if (!composite) return null;
  const base = resolveTokenColor(composite[1], tokens, depth + 1);
  if (!base) return null;
  const alpha = composite[2] === undefined ? 1 : Math.min(1, Math.max(0, Number(composite[2])));
  return [base[0], base[1], base[2], alpha];
}

function checkStoreTokenMirror() {
  const sceneTokens = parseTokenMap(path.join(DESIGN_SCENE_DIR, "page.css"));
  const storeTokens = parseTokenMap(path.join(STORE_STATIC_DIR, "theme.css"));
  const problems = [];
  const normalize = value => (value ?? "").replace(/\s+/g, "");
  for (const [storeName, sceneName] of Object.entries(HB_HOS_MIRROR_ALIAS)) {
    const storeValue = storeTokens.get(storeName);
    const sceneValue = sceneTokens.get(sceneName);
    if (storeValue === undefined && sceneValue === undefined) continue;
    if (storeValue === undefined) {
      problems.push({
        file: "apps/store/static/theme.css",
        line: 0,
        detail: `缺少镜像令牌 ${storeName}（对应 ${sceneName}）`
      });
      continue;
    }
    if (sceneValue === undefined) {
      problems.push({
        file: "design/scene/page.css",
        line: 0,
        detail: `缺少 ${sceneName}（镜像 ${storeName}）`
      });
      continue;
    }
    if (storeName.endsWith("-rgb")) {
      if (normalize(storeValue) !== normalize(sceneValue)) {
        problems.push({
          file: "apps/store/static/theme.css",
          line: 0,
          detail: `${storeName} = ${storeValue} 与 ${sceneName} = ${sceneValue} 取值不同`
        });
      }
      continue;
    }
    const storeColor = resolveTokenColor(storeName, storeTokens);
    const sceneColor = resolveTokenColor(sceneName, sceneTokens);
    if (!storeColor || !sceneColor) {
      problems.push({
        file: "apps/store/static/theme.css",
        line: 0,
        detail: `${storeName} / ${sceneName} 至少一侧解析不出颜色，无法比对`
      });
      continue;
    }
    const same =
      storeColor[0] === sceneColor[0] &&
      storeColor[1] === sceneColor[1] &&
      storeColor[2] === sceneColor[2] &&
      Math.abs(storeColor[3] - sceneColor[3]) < 0.005;
    if (same) continue;
    problems.push({
      file: "apps/store/static/theme.css",
      line: 0,
      detail: `${storeName} = ${storeValue} 与 ${sceneName} = ${sceneValue} 取值不同`
    });
  }
  return problems;
}

const checks = [
  {
    title: "运行侧裸 /static/ 静态 import（file: 打开时整棵模块树加载失败）",
    hint: "改为经 frontend/modules/runtime/core/static-helpers.js 的桥取用",
    run: checkRuntimeImports
  },
  {
    title: 'selectElement("#id") / getElementById("id") 指向不存在的元素',
    hint: "补回元素，或删掉取用点（取到 null 的失败是静默的）",
    run: () => checkElementIds(collectHtml())
  },
  {
    title: "全站静态资源不是同一个 ?v= 戳，或同一模块被「带戳 / 不带戳」两种写法引用",
    hint: "按 README「开发工具」里的换戳命令把全站 ?v= 统一成同一个新戳；带戳与不带戳混用等于两份模块实例（模块表以含查询串的 URL 为键），把那处漏掉的 ?v= 补上 —— 开发态旁路 new URL(..., import.meta.url) 不算",
    run: () => [...checkSingleStamp(), ...checkModuleInstances()]
  },
  {
    title: "后端包之间出现新的环（导入顺序敏感的静默失效）",
    hint: "把环上的共享件下沉到更低一层（如上一轮的 core/design.py、core/ha_url.py），或登记进 ALLOWED_BACKEND_CYCLES 并写明理由",
    run: checkBackendPackageCycles
  },
  {
    title: "mdi 图标版本出现多个值，或与 vendor 目录对不上",
    hint: "只改 frontend/static/utils/icon-url.js 的 MDI_VERSION、apps/server 侧自动跟随目录；studio.css 里那三条遮罩地址与 vendor 目录名要同步",
    run: checkMdiVersion
  },
  {
    title: "import 说明符解析不到真实文件 / runtime 资源没登记进白名单",
      hint: "相对路径按导入方所在目录重算层数（文件深一层，`./x` 写成 `../x`、`../x` 写成 `../../x`）；**runtime 资源（frontend/modules/runtime/**）的相对说明符按 URL 语义判、且必须留在 /api/v1/modules/interaction3d/ 前缀内** —— 它的 URL 前缀比磁盘路径深一层，跨出去取 /static 只能走 core/static-helpers.js 的桥；绝对路径只判能算出服务端口径的（/static、/store-static、/api/v1/modules/interaction3d），后者新增文件必须同时登记进 apps/server/modules/interaction3d/api.py 的 get_resource() 白名单",
    run: checkModuleSpecifiers
  },
  {
    title: "物件构建体用了 context 的键却没解构（该物件一渲染就 ReferenceError）",
    hint: "把缺的名字补进该函数顶部的 `const { ... } = context;`；键表由 studio-app.js 的 ITEM_BUILDER_DEPS 与 itemBuilderContext 现读，改上下文不需要同步本文件",
    run: checkBuilderContextKeys
  },
  {
    title: "HTML 的 script/link、CSS 的 url()/@import 指向不存在的资源",
    hint: "按被引用文件的位置改：HTML 只判 `/static/...`、`/store-static/...`、`/api/v1/modules/interaction3d/...` 这类绝对引用（相对引用按页面路由解析，判不了），CSS 的 url() 相对该 CSS 文件解析；runtime 资源同样要登记进 get_resource() 白名单",
    run: checkHtmlAssetRefs
  },
  {
    title: "import 的名字不在目标模块的导出里（整棵模块树起不来的解析期错误）",
    hint: "对着目标模块补导出名、或改导入名；命名空间成员 / 动态解构 / 桥文件的转出口一并判。裸说明符与 vendor 压缩产物不判，边界见文件头第 9 条",
    run: checkModuleBindings
  },
    {
      title: "JS 写入的自定义属性没人读（机制没接上，浏览器里零报错）",
      hint:
        "两种修法都成立，按意图选：样式表里补 var(--x) 的取用点，或把这行 setProperty 连同算它的那段一起删掉。" +
        "2026-09 已把原列的 10 枚全部修完（逐条结论留在 UNWIRED_CSS_PROPS 上方的注释里），豁免名单现在是空的 ——" +
        "新增的这类写入会**直接报错**，这正是本条想要的状态：别再往名单里加，直接修掉",
      run: checkUnreadCustomProps
    },
  {
    title: "令牌引用后面粘着十六进制残渣（var(--x)d1 —— 整条声明静默失效）",
    hint:
      "原文多半是 8 位十六进制（面色的 α 变体），被按 6 位色值替换了前缀。" +
      "补该面的 -rgb 兄弟令牌写成 rgba(var(--x-rgb), .86)，或把这一处还原成 8 位十六进制",
      run: checkGluedTokenRefs
    },
      {
        title: "兜底值与令牌 canonical 值不一致（var() / paletteColor() / token-fallback 成对，三种写法）",
        hint:
          "把兜底值改成 design/scene/page.css 里的 canonical 值。这类漂移平时不生效" +
          "（令牌在时永不落到兜底），所以既没被评审拦下、也不会在浏览器里露头 ——" +
          "实测 CSS 侧修出 20 处，全是改语义色之前那套旧调色板的残留（最远的是 --hos-cool：" +
          "兜底 #a8c5d3 而 canonical #58c4ff）。JS 侧同一件事的写法是 " +
          "paletteColor(\"--hos-x\", \"#兜底\")，也已纳入。" +
          "第三种是数据形态：{ token: \"--hos-x\", fallback: \"#兜底\" }（面板原语的空气质量档）" +
          "以及并排的「令牌数组 + 兜底数组」常量（折线图出厂阈值）—— 两种都不出现 var() 或" +
          "paletteColor()，前两条正则都看不见，但要求同样一字不差。" +
          "实测漏网：primitives.js 的 --hos-eco 兜底写成 #4ed6a8，而 canonical 是 #5fd0a8。" +
          "三种写法都查。" +
          "差异特别大时先怀疑令牌选错了（如 --hos-sky-haze 当描边），那就连令牌一起改",
        run: checkFallbackDrift
      },
      {
        title: "SVG 注释里含连续两个连字符（XML 非法，整个文件解析失败、画面空白）",
        hint:
          "SVG 是 XML 不是 HTML：注释体内出现 `--` 就是非法的，浏览器给 not well-formed、" +
          "只留空白，很难联想到注释。加注说明令牌时省掉前导横线（写 hos-sky-deep，" +
          "不写双横线开头的全名），或改用 `var()` 这类不含双连字符的表述",
        run: checkMarkupComments
      },
      {
        title: "八族可配置光的 -soft / -line α 与 appearance.js 的契约不符（0.13 / 0.32）",
        hint:
          "把 α 改回契约值，或（更好）引用 canonical 取值而不是手写 rgba()。" +
          "这两个数只在 design/scene/appearance.js:178-179 定义一次，各页面手写一份就会漂 ——" +
          "实测漂出 0.12 / 0.15 / 0.16 三档，换主控色时只有写对的那一档跟着走",
        run: checkSoftLineAlpha
      },
      {
        title: "theme-color / webmanifest 的写死色值与色板里「页面最底层」的取值不同",
        hint:
          "这几处吃不下 var()（meta 不参与 CSS 级联、webmanifest 是 JSON），所以只能写死 ——" +
          "但必须逐字等于 --hos-sky-deep（页面压着夜空底）或 --hos-tool-bg（压着画布底）。" +
          "改动色板里的这两枚令牌时，同手把这 18 个文件一起改；新增页面若确实压别的底色，" +
          "把该令牌加进 THEME_COLOR_TOKENS 白名单",
        run: checkThemeColorLeavesPalette
      },
      {
        title: "模型注册表与 models/ 目录两端不对齐（加载失败只退回过程几何，浏览器里零报错）",
        hint:
          "改 frontend/static/3d-studio/loaders/studio-external-models.js：每条 define*ItemModel 的" +
          "「子目录 + 文件基名」都要指向真实文件；反过来，models/ 下每个 .glb 也都要有条目引用" +
          "（含 -lite 与完整版两份）。文件基名写成 10 位版本戳是换戳脚本改写第二个参数的指纹，" +
          "见 checkModelAssetUrls 的注释",
        run: checkModelAssetUrls
      },
      {
        title: "流水线 GLB 内容与规格 / scaleBasis 不自洽（多半是改了规格没重新导出）",
        hint:
          "改 tools/models/model-specs.mjs 里的 size 后**必须重新导出**对应的 GLB（生成器不随仓库分发），" +
          "并把 studio-external-models.js 的 scaleBasis 一起对齐 —— 运行侧按 scaleBasis 非等比缩放，" +
          "两者不一致就会被拉变形，而浏览器里只表现为「看着有点歪」。底面必须落在 y=0（preserveOrigin 直接贴地）、" +
          "占地中心必须在原点；挂墙件把挂高烘进几何时（规格里的 mountHeight，现在只有吊柜）底面按那个值判。" +
          "材质名必须是 material-<槽位号>，否则颜色不跟风格走（这条没有 fallback）。" +
          "lite 版必须真的比完整版轻。" +
          "判据只覆盖 tools/models/model-specs.mjs 里登记的流水线产物；models/ 下的外部既有资产" +
          "走另一套命名与比例约定，不在此列",
        run: checkModelGlbIntegrity
      },
      {
        title: "流水线 GLB 之间存在会闪的共面重叠（z-fighting：不报错、单张截图也看不出）",
        hint:
          "两块不同槽位的面落在同一平面且有重叠时会在同一像素上抢深度、逐帧抖动，表现为一片闪动的条纹；" +
          "它不进控制台、不动相机看不出来，所以只能靠这条守卫。跑 node tools/audit_coplanar_faces.mjs " +
          "看逐件清单（--model=<类型> 单件、--all-faces 连无害的背靠背一起列）。修法**不是把面推开** —— " +
          "外表面撑住包围盒，生成器有 1mm 的规格校验；要让**非极值的那一件**退让：嵌进母体、或收到" +
          "相邻件的内表面之内（例如 «面板贴在机身前脸上» 改成面板凸出 1.5mm、玻璃门与柜体同宽改成收 4mm、" +
          "踏板与斜梁逐面齐平改成踏板收 2mm/边）。改完必须重新导出这两件 GLB",
        run: checkCoplanarOverlaps
      },
      {
        title: "「环境模型类型」七处清单不一致（漏一处就静默少特效 / 少绑定）",
        hint:
          "以 environment-scene.js 的 MODEL_TYPE_TO_PAGE 为准，把 environment-scene.js 的 " +
          "MODEL_TYPE_TO_DEVICE_KIND、environment-halos.js 的描边资格清单、studio-app.js 的四处内联清单" +
          "一起补齐；两张表必须逐类型成对，删类型同理",
        run: checkEnvironmentModelTypes
      },
      {
        title: "「材质风格」选了没反应（档位没覆盖换色分支真正读的调色板键）",
        hint:
          "改 frontend/static/3d-studio/studio/studio-material-styles.js：每个 defineStyle 至少要有" +
          "一个基准键（furniture / furnitureSoft / furnitureLight / furnitureDark / wood / cabinetBody /" +
          "applianceSoft / countertop / glass / leafColor），缺失的 furniture* 四档由 completeFurnitureRamp" +
          "派生补齐；服务家电类型的风格组必须写全 appliance / applianceSoft / applianceDark；" +
          "每个支持材质风格的类型都要在逐类型表或材质族表里查得到档位",
        run: checkMaterialStyleCoverage
      },
      {
        title: "「档位即组合」的角色没覆盖（该角色的那一块会静默退回基础色）",
        hint:
          "改 frontend/static/3d-studio/studio/studio-material-styles.js：某个类型用到的每个角色，" +
          "在它**能选到的每个档位**里都要有配方（用 joineryCombo / fabricCombo 这类构造器写，" +
          "从属关系由构造器补默认值）。角色词表与命名硬约束见 tools/models/model-roles.mjs —— " +
          "角色名不得以 -soft / -dark / -light 结尾，那三个后缀是既有资产的亮度分档约定。" +
          "配方里用 slab 指石材整图色号时，色号必须是 studio-surface-textures.js 里真画出来的那几种" +
          "（现在有 marble / marble-dark）；写错的色号不会报错，只会让那块网格退化成没纹路的纯色",
        run: checkMaterialRoleCoverage
      },
      {
        title: "素材库页签与类型词表两端错位（家电卡片漏进「家居」页签，视觉上落进结构与特殊物件那一组）",
        hint:
          "改 frontend/static/3d-studio/studio/studio-item-types.js 的 APPLIANCE_ITEM_TYPES：它必须" +
          "恰好等于 studio-asset-palette.js 里 category 为 \"appliance\" 的卡片集合。少了 → 那张卡" +
          "漏到家居页签（家居页签只隐藏分组标题、不隐藏卡片，于是挂到上一个可见的家居标题下），" +
          "并且兜底盒体取家具色；多了 → 家居卡片跑进电器页签。加电器卡片时同手补这份名单",
        run: checkAssetPaletteTypeSets
      },
      {
        title: "素材库卡片没有对应的类型定义（点了 / 拖到户型图上什么也不发生）",
        hint:
          "改 frontend/static/3d-studio/studio/studio-app.js 的 ITEM_TYPE_DEFINITIONS：素材库里每张" +
          "卡片（studio-asset-palette.js 的 STUDIO_ASSET_PALETTE）都要有一条同名定义 —— " +
          "createSceneItem() 取不到定义就 `return`，点卡片与拖拽落点都走这一处，于是" +
          "「点了没反应、也不报错」；这一格最容易被漏，因为素材库、模型注册表、类型词表、" +
          "材质风格、平面符号四处都补好之后，其余四处都只是在「等被调用」。定义里的 width / depth /" +
          "height 还必须与注册表 scaleBasis 逐值相等，否则新放下的一件会在模型落地那一帧跳一下尺寸",
        run: checkAssetPaletteItemTypeDefinitions
      },
      {
        title: "默认档位的角色没有出口（内容物 / 五金会静默被刷成主料色）",
        hint:
          "改 frontend/static/3d-studio/loaders/studio-external-models.js：规格里出现的每个角色都要" +
          "登记在 CARCASS_MATERIAL_ROLE_SET（跟主料三档）/ AUTHORED_COLOR_MATERIAL_ROLE_RECIPES" +
          "（内容物与镜面取规格原色）/ NON_CARCASS_MATERIAL_ROLE_SET（另有专管）之一，三份名单不得重叠。" +
          "新加角色时先想清楚它属于哪一类：跟着柜体木色走看着对不对？不对的话它就该在第二类里 —— " +
          "「不跟木色走」的配方在 studio-material-styles.js 的 joineryCombo 里也各要有一条，两处成对",
        run: checkMaterialRolePaletteOutlets
      },
      {
        title: "圆形占地的物件没有按圆画（户型图上成了方角矩形）",
        hint:
          "平面符号是手绘的（studio-app.js 的 drawPlanItem），与 3D 规格不会互相牵引，所以" +
          "「这一件该画圆还是画方」只能靠实测：跑 node tools/audit_plan_symbols.mjs，把实测是圆的类型" +
          "补进 frontend/static/3d-studio/studio/studio-item-types.js 的 ROUND_FOOTPRINT_ITEM_TYPES，" +
          "再到 studio-app.js 的 ROUND_PLAN_RING_RATIOS_BY_TYPE 里补它那一两个同心圈的半径比" +
          "（比值从 tools/models/model-specs.mjs 的实际半径除出来）。反过来，名单里有但实测不是圆的" +
          "（规格改成了方料）要从名单里收掉",
        run: checkRoundFootprintPlanSymbols
      },
      {
        title: "命令闸门放行的实体没进入状态订阅（命令发得出去，面板读数永远为空）",
        hint:
          "runtime.js 的 control 准入与状态订阅（collectTrackedEntities / additionalEntityIds）" +
          "必须读同一批配置。漏了哪一类，就在订阅侧用同一批配置展开它 —— lightStream 只推订阅集" +
          "内的实体（服务端按订阅报文过滤），没订上的实体读数是永久空值，而且整条链路不报错：" +
          "加一个新设备品类时漏订阅，症状是「卡片能点、点了永远不可用」。另注意 lock / select /" +
          " number / input_* 这些域不在 lightStream 的主白名单正则里，非走 additionalEntityIds 不可",
        run: checkControlGateWithinSubscription
      },
      {
        title: "doorModels 传了 scene 而不是楼层（画在墙上的门被全数丢弃，门锁一条也建不出来）",
        hint:
          "doorModels 取门列表时容错两种形态（config.scene.doors → config.doors），查墙却只认" +
          " config.scene.walls。传 floor.scene 时墙列表解析成 scene.scene.walls = undefined，" +
          "每一扇画在墙上的门都因找不到挂靠的墙被丢掉 —— 元数据 floors[].doors 变空数组，安防" +
          "门锁列表恒为空且不报错。凡取门模型一律传**楼层对象**（stage 的 binding-collectors、" +
          "lock-state-runtime 里都是这么传的），只有确实手里是 scene 且墙信息也来自 scene 时才例外",
        run: checkDoorModelsFloorArgument
      },
      {
        title: "环境页面归一表漏登页签别名（该页签静默失去环境压暗与模型高亮）",
        hint:
          "environment-scene.js 的 pageDimming 把模块 ID 归一成页面 ID，pageModelBindings 与" +
          " screenOutlines 都按这个页面取值。漏登的页签既不在页面白名单里（压暗 / 降饱和不生效），" +
          "又把页面筛成别名本身（环境模型不描边、不合成展示绑定）—— 切过去一片「设备都没绑上」的" +
          "观感，浏览器零报错。对着上游 0.6.5 的 pageDimming 反混淆结果补 key；本仓另两类上游别名" +
          "（purifier、通用设备品类）因为并入环境页 / 不是独立模块而**故意不登记**，别顺手补上",
        run: checkEnvironmentPageNormalization
      },
      {
        title: "卷帘契约出口不一致（漏一处就静默失效：选不出 / 存不上 / 显示成垂帘）",
        hint:
          "帘型默认取户型模型的形态（模型侧字段名与取值照搬上游 0.6.5：curtainForm " +
          "standard / roller，历史草稿里的 curtainStyle / cloth 仍要读得出），编辑器显式改过时置 " +
          "coverKindOverride 让交互配置的 coverKind 胜出（上游 0.6.5 同口径）。各出口必须同时在场：" +
          "后端（config.py 及其 config_domains.py 域校验段）的 coverKind 取值枚举要含 'roller'、" +
    "字段白名单要含 'coverKindOverride' 并做" +
          "布尔校验；config-editor.js 的「窗帘类型」下拉要含 [\"roller\", \"卷帘\"]、选择回调要放行 " +
          "roller 且置 coverKindOverride、归一白名单要含 roller、模型帘型要按 curtainForm 读（兼容 " +
          "curtainStyle）；config-metadata.js 要透传 curtainForm；geometry.js 的 resolveCurtainGeometry " +
          "要读 itemConfig.coverKindOverride 与模型的 curtainForm；curtain-motion.js 的 " +
          "COVER_KIND_ROLLER 令牌要在且按 binding.coverKind 判分支；工作室侧 3d-studio.html 的下拉框" +
          "要是 #curtain-form（standard / roller）、studio-curtain-track.js 要读写 curtainForm 并兼容" +
          "curtainStyle、studio-app.js 要从 #curtain-form 取值并清掉历史 curtainStyle 键。" +
          "删类型或换机制时连本守卫一起改",
        run: checkCurtainKindContract
      },
      {
        title: "引用了本文件解析不出绑定的名字（只有执行到那一行才 ReferenceError）",
        hint:
          "判定在 tools/lib/free-variables.mjs（真语法树 + 作用域链），这里只多一层宿主全局白名单。" +
          "真命中的两处都是「把一段代码搬进另一个函数」时留下的：studio-app.js 的 drawPlanItem 画" +
          "钢 / 玻璃楼梯时写 itemWidth / itemDepth（本函数只有 itemWidthPx / itemDepthPx 与" +
          " planFootprint），studio-external-models.js 的 applyAppliancePalette 里写 materialPalette" +
          "（函数内的绑定叫 appliancePalette，那个名字只在唯一调用点的实参位置存在）。修法只有两种：" +
          "补上它该来自的绑定（形参 / 解构 / import），或改用同作用域已有的名字 —— " +
          "**不要**往 HOST_GLOBALS 里加业务名字：那张表只收浏览器 / Worker 宿主自带的全局",
        run: checkFreeIdentifiers
      },
      {
        title: "「净化器模型类型」三处白名单不同源（选择器漏配不上 / 绑定漏控不了 / 后端漏 409）",
        hint:
          "净化器与新风机在 HA 里都是 fan 域，这份类型表要同时改三处：" +
          "config-editor.js 的 sceneModelTypes()（模型选择器的候选）、" +
          "binding-collectors.js 的 collectClimateBindings()（运行时绑定）、" +
          "purifier.py 的 PURIFIER_MODEL_TYPES（命令侧的模型存在性复核）。" +
          "**不要**借用空调那套白名单（wallac / floorac / airoutlet）：借了每一台净化器都绑不上模型，" +
          "而配置校验与浏览器控制台都不会报错。三者必须逐类型成对，删类型同理",
        run: checkPurifierModelTypes
      },
      {
        title: "窗帘面板返回对象少了 deactivate（帘组面板只能 ?.() 兜底，拖动预览撤不回）",
        hint:
          "上游 0.6.5 的 cover-panel 返回 { root, update, deactivate, dispose }，deactivate 的语义是" +
          "「拖动进行中时撤回预览与草稿，但面板继续用」（内部走 cancelPreview，带 `if (isDragging)`" +
          " 守卫）。本仓曾漏登这个方法，cover-group-panel.js 只能写 panel.deactivate?.() 兜底 ——" +
          "方法名写错也不会有人知道。补回该键并让调用侧直接调用；若将来 deactivate 的语义改成" +
          "「无论有没有草稿都清场」，连本守卫与两处注释一起改掉",
        run: checkCoverPanelDeactivate
      },
      {
        title: "扫地机状态字典缺上游别名 / 同义别名文案不一致（状态静默显示成「状态更新中」）",
        hint:
          "vacuumStatusPresentation 的 vacuumRawState 文案字典必须含上游 0.6.5 的全部别名：" +
          "回充 returning / returning_to_base / returning_home、待机 idle / standby / ready、" +
          "已停止 stopped / off、清洗拖布 washing / mop_washing / self_washing / cleaning_mop、" +
          "烘干拖布 drying / mop_drying / drying_mop。别名是厂商写法差异，漏一条不会报错 ——" +
          "那个状态直接掉进兜底文案。新增别名时文案必须与同义别名逐字相同（本守卫两组都查）",
        run: checkVacuumStateAliases
      },
      {
        title: "吊柜的挂高三处不同源（规格一项、占位几何一项、类型定义里还留着 elevation）",
        hint:
          "吊柜的挂高（柜底 1.4m）烘在几何里、与原版既有资产同一个口径，这一个数在三处各写了一份：" +
          "tools/models/model-specs.mjs 的 wallcabinet.mountHeight（生成器按它抬整件）、" +
          "item-builders/storage-cabinets.js 的 wallCabinetMountHeight（占位几何照同一个口径加）、" +
          "studio-app.js 的 ITEM_TYPE_DEFINITIONS.wallcabinet（**不能**有 elevation：原版那一格是 0）。" +
          "改挂高就三处一起改，改完重新导出 wallcabinet、" +
          "并让 studio-external-models.js 的 HOME_LITE_MODEL_VERSION 前进一格（模型文件名没变，" +
          "不换戳浏览器会继续喂旧几何）",
        run: checkWallCabinetMountHeightParity
      },
      {
        title: "聚焦可用设备清单与上游不同集合（漏品类会误触空调开关，且点不出面板）",
        hint:
          "geometry.js 的 isFocusableDevice 必须与上游 0.6.5 同集合：lock / nas / television /" +
          " vacuum / presence / camera，外加 isGenericDeviceKind 覆盖的通用设备品类。stage.js 的" +
          " activateBinding 用它做第一道分流 —— 漏掉任一类，那类绑定都会继续落到「有 modelId →" +
          " 空调」那一支，点一下门锁/冰箱就会给上次看过的那台空调发 turn_on（命令照发、浏览器零报错）；" +
          "camera-transition 的跳转与焦点保持也读同一份清单，三处必须一起生效",
        run: checkFocusableDeviceKinds
      },
      {
        title: "授权状态文案三处不同源（该状态静默显示成英文码 / 空白）",
        hint:
          "后端 license/service.py 的 _record_status `labels` 是状态枚举的唯一出处；" +
          "frontend/static/auth/license-recovery.js 的 STATUS_MESSAGES 与" +
          " frontend/static/editor/home.js 的 licenseStatusLabelByCode 各是它的一份展示文案。" +
          "三处键集必须逐码相同：漏一条 → 那个状态在页面上原样显示英文码或空白；" +
          "多一条 → 后端已不产出的死条目。新增状态码时三处一起加",
        run: checkLicenseStatusLabelSets
      },
      {
        title: "前端可派发的 HA 服务没登记进后端 ALLOWED_SERVICES（按钮可点、命令必被拒）",
        hint:
          "后端 api/ha.py 的 ALLOWED_SERVICES 是 ha/services/call 的唯一准入表，前端每个能派发的" +
          "服务都必须在场。本仓已因此连踩三次：vacuum.stop / locate / clean_spot（扫地机开得动、" +
          "停不下来）与 climate.set_swing_horizontal_mode（空调「水平摆风」整组每次点都 403）——" +
          "前端按 supported_features 渲染按钮、后端没登记，失败只回显一句笼统提示，控制台零报错。" +
          "补法是往 ALLOWED_SERVICES 加一条 (domain, service) 并写清参数名；确非 HA 服务的字面量" +
          "登记进 NON_HA_SERVICE_LITERALS 并写明理由，别放宽匹配式。本守卫只核对服务名存在性" +
          "（前端域名常是变量），不核对「域 + 服务」组合",
        run: checkFrontendHaServicesAllowed
      },
      {
        title: "附加实体「域 → 卡片形态」词表两端不同源（前端渲染得出、后端必拒，或后端条目无人能触发）",
        hint:
          "前端唯一出口是 frontend/modules/runtime/climate/purifier-extras.js 的 extraTypes() 里那张 " +
          "mapped 词表，后端唯一出口是 apps/server/modules/interaction3d/purifier.py 的 EXTRA_TYPES。" +
          "两者只按「可写域」比对：新增一个可编辑的域要两边一起加，且 EXTRA_TYPES 那侧的值不能是 " +
          '"state"（那是它表达「只读」的写法）。改完顺手核对 device-panel.js 的 deviceKind ' +
          "（通用设备是 device-extra、净化器是 purifier-extra），/control 靠它分流到不同的校验分支",
        run: checkExtraEntityDomainParity
      },
      {
        title: "表达式被静默改写的语法陷阱（行号残留 / 数字与字符串做位或）",
        hint:
          "行首的「数字 + |」是复制粘贴残留的行号，紧跟在它后面的模板串会被位或吃成数字（" +
          "本仓真实踩过一次：client-log.js 的 370| 让所有慢请求日志的 message 恒为 370）。" +
          "删掉那截残留即可；若确实要写位或，把它放进括号并让两个操作数都是数字",
        run: checkSilentExpressionRewrite
      },
      {
        title: "文件规模预算（棘轮：只许减不许增）",
        hint:
          "Python 单文件 800 行、JS/MJS 单文件 1200 行。超标的既有文件登记在 tools/file-size-baseline.json，" +
          "行数只能往下走；拆到限额以内之后请把那条删掉（守卫会提醒）。要拆的话按本仓已有的缝走：" +
          "item-builders/、plan/、loaders/、editor/home/*、panel-renderer/device-controls/* —— " +
          "外提之后必须换一次全站 ?v= 戳（同模块两枚戳 = 两份实例）。" +
          "tools/ 下的脚本与压缩过的 *.min.js 不纳入本条",
        run: checkFileSizeBudget
      },
      {
        title: "仓库路径不许在脚本里重复推导（paths.mjs 是唯一事实来源）",
        hint:
          "任何脚本要用仓库里的目录，从 tools/paths.mjs import；那里没有的，先加进去。" +
          "同一路径被拼两遍的后果是「改路径漏掉一处 → 守卫查了个空目录还是绿的」——这比不检查更危险。" +
          "仓库根也不要自己算，一律用 paths.mjs 的 ROOT",
        run: checkPathConstantsHaveOneSource
      },
      {
        title: "匿名静态白名单必须来自清单文件（不许写回 Python 字面量）",
        hint:
          "匿名可访问的 /static 资源清单只有一处事实来源：frontend/public-static.json（读它的是 apps/server/app/public_assets.py）。" +
          "往装配层里写死 /static/xxx.css 这类具体资源路径会被拒；纯前缀判断 startswith('/static/') 不算。" +
          "清单里的每条都必须在磁盘上存在 —— 写错一个字符，那条就永久失效且只能靠浏览器白屏发现",
        run: checkPublicAssetManifest
      },
      {
        title: "两个可独立部署的项目（apps/server / apps/store）互相 import",
        hint:
          "主应用与授权商店是两个独立项目、可能部署在不同服务器上，任何一方 import 另一方都会让「单独部署」失效、" +
          "把两侧版本绑死，并把无关业务代码带进授权服务器镜像。同名双份实现是**刻意的隔离成本**，" +
          "要防漂移就用构建期生成 + 逐字节校验（design/scene 的三份分发副本就是这个模式），不要在运行时 import 对方",
        run: checkDeployablesStayIndependent
      },
  {
    title: "同名双份的共享面走散（两份实现看起来一样，改一边另一边静默不变）",
    hint:
      "改这一条时同手改另一侧；两侧的注释与模块说明可以各写各的（比较时会剥掉注释与 " +
      "docstring），但数据与逻辑必须逐字一致。清单与「该不该登记」的判据见 " +
      "packages/contracts/README.md（判据是「走散会不会静默失效」，有意的差异不要登记）",
    run: checkContractSurfaces
  },
  {
    title: "未登记的经典脚本（本仓默认 ESM；首帧前执行 / Worker 这类必须登记的例外）",
    hint:
      "默认写成模块（<script type=\"module\"> + import/export）；确实必须是经典脚本（首帧前要跑、" +
      "必须最先执行、是 Worker）就登记进 tools/classic-scripts.json 的 classic 并写明理由。" +
      "反过来：把例外转成模块后要把它从清单里删掉，守卫会对账。",
    run: checkClassicScriptsRegistered
  },
  {
    title: "design/scene 的五份文件在三处副本里逐字节一致",
    hint:
      "canonical 是 design/scene/，两个分发副本是 frontend/static/auth/scene/ 与 apps/store/static/scene/。" +
      "这五个文件没有构建步骤、靠手工复制：漏同步一处不会报错，只表现为另一个部署停在旧样式上，" +
      "先把 design/scene/ 改成正确的那一份，再从它同步两个副本",
    run: checkSceneCopiesInSync
  },
  {
    title: "商店 theme.css 的 --hb-* 与 design/scene/page.css 的 --hos-* 逐 token 相等",
    hint:
      "两套色板靠 HB_HOS_MIRROR_ALIAS 这张显式镜像表对应（--hb-surface ↔ --hos-sky-low 这类" +
      "同名不同字是本仓的既定契约）。新增令牌时在表里补一行；漏补的令牌这条检查看不到。" +
      "取值不同时先判断是哪一侧写错，改完两边一起跑一次",
    run: checkStoreTokenMirror
  }
    ];

let failed = false;
for (const check of checks) {
  const problems = check.run();
  if (problems.length === 0) {
    console.log(`[ok] ${check.title}`);
    continue;
  }
  failed = true;
  console.error(`[fail] ${check.title} —— ${problems.length} 处`);
  for (const problem of problems) {
    const at = problem.line > 0 ? `${problem.file}:${problem.line}` : problem.file;
    console.error(`  ${at}  ${problem.detail}`);
  }
  console.error(`  修复方向：${check.hint}`);
  console.error("");
}

if (failed) {
  console.error("不变量校验未通过。这几条都属于「不报错、只静默失效」的失效方式，请在提交前修掉。");
  process.exit(1);
}
console.log("全部不变量校验通过。");
