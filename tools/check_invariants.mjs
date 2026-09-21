/**
 * 六条「不报错、只静默失效」的不变量守卫。
 *
 * 为什么只留六条：上一轮清理把原先的七道 Node 护栏整套移除（README「开发工具」有记录），
 * 理由是它们把关的多是「改结构才触发」的一次性问题。但下面六条对应的失效方式恰好相反 ——
 * 它们**每次编辑都可能踩到，且踩到时浏览器/解释器不报错**，正好是人工 review 最容易漏的那一类：
 *
 *   1. `frontend/modules/runtime/**` 里出现裸 `/static/...` 静态 import。
 *      运行侧（舞台页以 `file:` 打开）解析不了绝对路径，表现为**整个模块树加载失败**，
 *      而报错信息只指向导入方。static-helpers.js 的桥就是为绕开这一点存在的，
 *      可 `stage.js` 自己在写下「禁止裸 import」的注释后，隔一行就写了一条裸 import。
 *   2. 入口 JS 里 `selectElement("#x")` / `getElementById("x")` 指向的 id 在 HTML 中不存在。
 *      取到 `null` 之后，`if (el)` 分支静默跳过、`el?.addEventListener` 静默不挂载，
 *      表现是「按钮点了没反应」，且整条链路无任何报错。`#refresh-light-preview` 就是这么丢的。
 *   3. 全站静态资源缓存戳出现第二个值。
 *      无打包器，`?v=` 是唯一的缓存失效手段；同模块一处带戳一处不带会被当成两个模块、
 *      各留一份模块级状态（两份控件注册表就是这么来的）。原先这条只能靠人工核对。
 *   4. 后端包之间出现新的环（`backend/api → backend/modules → backend/api` 这类）。
 *      Python 的包级环通常**不报错**：谁先被导入、环上那个名字此刻是不是已初始化，全看
 *      启动顺序，改一圈 import 就可能在某个部署路径下变成 `AttributeError`/空模块。
 *      上一轮把 `core` 的双向依赖（`core.schemas → panel.documents`、`core.schemas → ha.client`）
 *      下沉到 `core/design.py` 与 `core/ha_url.py` 就是这么发现并修掉的。
 *   5. mdi 图标版本出现第二个值，或版本号指向的 vendor 目录不存在。
 *      版本号分散在 JS 常量、CSS 的三条遮罩地址与后端的目录解析里，升级图标库漏改一处不会报错：
 *      CSS 那三条是舞台灯光素材图标（写错即空白），JS 那份写错则整套图标 404。
 *
 *   6. 相对 import（`./x`、`../x`）解析不到真实文件。
 *      外提/搬迁模块时最容易漏的一步：文件换了目录、层数没跟着改。ESM 在解析期解析说明符，
 *      一个少写的 `../` 会让导入方所在的整棵模块树加载失败 —— `editor/home/` 那批外提文件
 *      把 `./editor-utils.js` 少写了一层，症状是整个编辑器打不开，控制台却只指向那一行。
 *
 * 明确不做的事：不检查 ESM 导出完整性（导入方引了一个目标模块没有导出的名字）、
 * 不检查注册表分片是否齐全。那两类需要「允许新文件先落地再接线」的宽容度，硬拦会把正常改动挡死。
 * 第 6 条不在此列：import 里既然已经写死了文件名，就不存在「先落地再接线」的中间态，
 * 解析不到只可能是层数写错。只判相对说明符，绝对路径（`/static/...`）由第 1 条在运行侧把关。
 *
 * Usage:
 *   node tools/check_invariants.mjs
 *
 * 退出码 1 表示有违规；输出每条都带 file:line，能直接跳转。
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

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
 *
 * 只有确实由 JS 自己 `createElement` + 设 id 的元素才登记在这里，并且必须写明由谁创建 ——
 * 否则这里会慢慢变成「把误报一条条塞进去」的垃圾桶，守卫也就死了。新增条目请连同创建点一起写。
 */
const DYNAMIC_IDS = new Set([
  // bridge/editor.js 的 3D 交互检查器面板：编辑器运行时按需建 DOM，不写在 index.html 里。
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

const RUNTIME_DIR = path.join(ROOT, "frontend", "modules", "runtime");

/**
 * 声明式 ESM `import` / `export`：`import ... from "/static/..."`、`export ... from "/static/..."`、
 * 以及副作用导入 `import "/static/..."`。
 *
 * 必须按整份文本匹配而不是逐行匹配：声明可以跨行写（`import {\n a,\n b\n} from "..."`），
 * 逐行比对会把这类写法整片漏掉 —— 上一版就漏了 `range-dialog.js` 与 `config-editor.js` 的几处。
 * `[^;]*?` 保证不会跨语句匹配（分号是一道硬边界）。
 */
const STATIC_DECL_RE = /^[ \t]*(?:import|export)\s[^;]*?(?:from\s*)?["']\/static\//gm;

/** 动态 `import("/static/...")`，捕获其后的路径片段用于判断是否 vendor。 */
const STATIC_DYN_RE = /\bimport\s*\(\s*["']\/static\/([\w./@+-]+)/g;

/**
 * 运行侧的合法写法只有两种，其余一律算违规：
 *
 *  - 声明式 `/static/` import：**永远违规**。没有 `file:` 回退可言，解析期就断开整棵模块树。
 *  - 动态 `import("/static/...")`：只有当同文件里存在 `import.meta.url.startsWith("file:")`
 *    分流时才算合法（static-helpers.js 的桥就靠这个分流工作）。
 *  - `/static/vendor/` 的动态导入额外放行：第三方库只做懒加载（例如 three.js 约 600KB），
 *    vendor 目录没有「相对路径副本」可供 file: 回退，且这些调用点都在 try/catch 里降级。
 */
function checkRuntimeImports() {
  const problems = [];
  for (const file of walk(RUNTIME_DIR, new Set([".js"]))) {
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
  for (const file of walk(path.join(ROOT, "frontend"), new Set([".html"]))) {
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

  for (const file of walk(path.join(ROOT, "frontend"), new Set([".js"]))) {
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
    // 运行侧模块）就退回「全部 HTML 的 id 并集」—— 宁可漏报，也不要对着正确的代码报错。
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

/**
 * 与 bump 工具保持同一份扫描面：`store/static` 必须和 `store/templates` 一起扫，
 * 否则商店静态目录里的第二个戳永远看不见（历史上正是这样沉默了很久）。
 */
const STAMP_SCAN_ROOTS = [
  path.join(ROOT, "frontend"),
  path.join(ROOT, "store", "templates"),
  path.join(ROOT, "store", "static")
];

const STAMP_EXTRA_FILES = [
  path.join(ROOT, "store", "api", "pages.py"),
  path.join(ROOT, "store", "api", "alipay.py"),
  path.join(ROOT, "backend", "modules", "interaction3d", "api.py")
];

const STAMP_TEXT_EXTENSIONS = new Set([".js", ".html", ".css", ".webmanifest", ".py"]);
const QUERY_V_RE = /\?v=[^"'`\s)]+/g;

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
      // 不参与「单一戳」判定；bump 工具也明确跳过它们。
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
 *
 * - `backend.api | backend.modules`：`api/projects.py` 在删项目时调 3D 模块的
 *   `sweep_scenes_for_app`、保存文档时调 `require_document_changes`（3D 授权门禁要插在
 *   项目保存路径上）；反向 `modules/interaction3d/api.py` 又调 `api/ha.py` 的 `call_service`
 *   与 `api/assets.py` 的 `user_asset_file`。两者都是**路由层互调**，要拆干净得先把
 *   `call_service` 的主体（约 90 行校验 + 回源 + 审计）从路由里提成普通函数，属于安全敏感改动，
 *   单独一轮处理。这条环在当前代码上是安全的：环上两侧都没有 `__init__` 副作用，
 *   也不存在「导入期就读对方属性」，因此只是方向不干净，不会静默失效。
 *   新增这条以外的环会直接失败；把这两处拆掉后请一并删掉本条目。
 */
const ALLOWED_BACKEND_CYCLES = new Set(["backend.api|backend.modules"]);

const BACKEND_DIR = path.join(ROOT, "backend");

/** 文件路径 → 点分模块名（`backend/api/ha.py` → `backend.api.ha`）。 */
function backendModuleName(file) {
  return rel(file)
    .replace(/\.py$/, "")
    .replace(/[\\/]/g, ".")
    .replace(/\.__init__$/, "");
}

/** 取二级包名：`backend.api.ha` → `backend.api`。 */
const backendPackageOf = moduleName => moduleName.split(".").slice(0, 2).join(".");

const PY_IMPORT_RE = /^[ \t]*(?:from\s+([.\w]+)\s+import|import\s+([.\w]+))/gm;

/**
 * 包级环检测。只看二级包之间的边，相对导入按当前文件所在目录解析 ——
 * 逐文件比对会漏掉 `from ..core.design import X` 这种写法，而上一轮的环正是这样写出来的。
 */
function checkBackendPackageCycles() {
  const files = [...walk(BACKEND_DIR, new Set([".py"]))];
  const moduleToPackage = new Map(files.map(file => [backendModuleName(file), backendPackageOf(backendModuleName(file))]));

  const edges = new Map(); // `${from}->${to}` → 首个示例（file:line）
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
      } else if (spec.startsWith("backend.")) {
        target = spec;
      } else {
        continue; // 标准库 / 第三方
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
 * 升级图标库时漏改任何一处都**不报错**：CSS 那三条是舞台灯光素材的图标，写错就是一片空白；
 * JS 那份写错则整套图标 404（图标选择器、舞台标记、天气以外的图标全空）。
 * 所以这里钉两件事：全站只出现一个版本值，且 `static/vendor/mdi/<version>/` 真的在仓库里。
 */
const MDI_VERSION_REF_RES = [
  /vendor\/mdi\/([0-9][\w.-]*)\//g,
  /MDI_VERSION\s*=\s*["']([^"']+)["']/g
];

const MDI_SCAN_ROOTS = [path.join(ROOT, "frontend"), path.join(ROOT, "backend")];

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
    const dir = path.join(ROOT, "frontend", "static", "vendor", "mdi", version);
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
// 6) 相对 import 必须解析到真实文件
// ---------------------------------------------------------------------------

/**
 * 只判「相对说明符 → 真实文件」这一件事，不碰导出符号（见文件头「明确不做的事」）。
 *
 * 与第 1 条一样按整份文本匹配：说明符可以跨行写，逐行比对会把
 * `import {\n a,\n b\n} from "../x.js"` 这类写法整片漏掉。
 *
 * 但**不能用第 1 条那种 `(?:from\s*)?` 可选写法**：本仓代码分号很少，`export function closeRowMenus() {`
 * 之后到第一个 `;` 之间没有任何 `from`，可选写法会越过函数体去咬住函数里第一个 `.` 开头的字符串
 * （`.menu__pop`、`.interaction3d-cover-message`），把 CSS 选择器当成模块路径。
 * 所以 `from` 是硬条件，且拆成三条：带 `from` 的声明式导入/re-export、副作用导入、动态导入。
 */
const REL_IMPORT_RE = /^[ \t]*(?:import|export)\b[^;]*?\bfrom\s*["'](\.[^"']+)["']/gm;
const REL_BARE_IMPORT_RE = /^[ \t]*import\s*["'](\.[^"']+)["']/gm;
const REL_DYN_IMPORT_RE = /\bimport\s*\(\s*["'](\.[^"']+)["']/g;

/** 扫描面与第 3 条的 `?v=` 戳一致：前端与商店的 JS 都可能被静态服务直接喂给浏览器。 */
const REL_IMPORT_SCAN_ROOTS = [path.join(ROOT, "frontend"), path.join(ROOT, "store")];

/** 行号查询表：按换行位建一次索引，避免对 home.js（近 1MB）每条 import 都重切一遍全文。 */
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

function checkRelativeImports() {
  const problems = [];
  for (const root of REL_IMPORT_SCAN_ROOTS) {
    for (const file of walk(root, new Set([".js"]))) {
      const text = fs.readFileSync(file, "utf8");
      const lineAt = makeLineCounter(text);
      const seen = new Set();

      const report = (spec, index) => {
        // `?v=` 戳与 `#` 片段不参与文件系统解析。
        const target = spec.split("?")[0].split("#")[0];
        if (fs.existsSync(path.resolve(path.dirname(file), target))) return;
        const line = lineAt(index);
        const key = `${line}:${spec}`;
        if (seen.has(key)) return;
        seen.add(key);
        problems.push({ file: rel(file), line, detail: `"${spec}" —— 解析不到文件` });
      };

      for (const match of text.matchAll(REL_IMPORT_RE)) report(match[1], match.index);
      for (const match of text.matchAll(REL_BARE_IMPORT_RE)) report(match[1], match.index);
      for (const match of text.matchAll(REL_DYN_IMPORT_RE)) report(match[1], match.index);
    }
  }
  return problems.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
}

// ---------------------------------------------------------------------------

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
    title: "静态资源缓存戳出现多个值",
    hint: "跑 node tools/bump_static_cache_versions.mjs 全站同戳刷新",
    run: checkSingleStamp
  },
  {
    title: "后端包之间出现新的环（导入顺序敏感的静默失效）",
    hint: "把环上的共享件下沉到更低一层（如上一轮的 core/design.py、core/ha_url.py），或登记进 ALLOWED_BACKEND_CYCLES 并写明理由",
    run: checkBackendPackageCycles
  },
  {
    title: "mdi 图标版本出现多个值，或与 vendor 目录对不上",
    hint: "只改 frontend/static/utils/icon-url.js 的 MDI_VERSION、backend 侧自动跟随目录；studio.css 里那三条遮罩地址与 vendor 目录名要同步",
    run: checkMdiVersion
  },
  {
    title: "相对 import 解析不到真实文件（搬家时少改了一层 ../）",
    hint: "按导入方所在目录重算层数：文件深一层，`./x` 就要写成 `../x`、`../x` 写成 `../../x`",
    run: checkRelativeImports
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
