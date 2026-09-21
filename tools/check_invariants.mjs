/**
 * 三条「不报错、只静默失效」的不变量守卫。
 *
 * 为什么只留三条：上一轮清理把原先的七道 Node 护栏整套移除（README「开发工具」有记录），
 * 理由是它们把关的多是「改结构才触发」的一次性问题。但下面三条对应的失效方式恰好相反 ——
 * 它们**每次编辑都可能踩到，且踩到时浏览器不报错**，正好是人工 review 最容易漏的那一类：
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
 *
 * 明确不做的事：不检查路径是否存在、不检查 ESM 导出完整性、不检查注册表分片是否齐全。
 * 那几类需要「允许新文件先落地再接线」的宽容度，硬拦会把正常改动挡死。
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
  console.error("不变量校验未通过。这三条都属于「不报错、只静默失效」的失效方式，请在提交前修掉。");
  process.exit(1);
}
console.log("全部不变量校验通过。");
