/**
 * 九条「不报错、只静默失效」的不变量守卫。
 *
 * 为什么只留九条：上一轮清理把原先的七道 Node 护栏整套移除（README「开发工具」有记录），
 * 理由是它们把关的多是「改结构才触发」的一次性问题。但下面九条对应的失效方式恰好相反 ——
 * 它们**每次编辑都可能踩到，且踩到时浏览器/解释器不报错**，正好是人工 review 最容易漏的那一类：
 *
 *   1. `frontend/modules/runtime/**` 里出现裸 `/static/...` 静态 import。
 *      运行侧（舞台页以 `file:` 打开）解析不了绝对路径，表现为**整个模块树加载失败**，
 *      而报错信息只指向导入方。static-helpers.js 的桥就是为绕开这一点存在的，
 *      可 `stage.js` 自己在写下「禁止裸 import」的注释后，隔一行就写了一条裸 import。
 *   2. 入口 JS 里 `selectElement("#x")` / `getElementById("x")` 指向的 id 在 HTML 中不存在。
 *      取到 `null` 之后，`if (el)` 分支静默跳过、`el?.addEventListener` 静默不挂载，
 *      表现是「按钮点了没反应」，且整条链路无任何报错。`#refresh-light-preview` 就是这么丢的。
 *   3. 全站静态资源缓存戳出现第二个值，或同一模块被「带戳 / 不带戳」两种写法引用。
 *      无打包器，`?v=` 是唯一的缓存失效手段；同模块一处带戳一处不带会被当成两个模块、
 *      各留一份模块级状态（两份控件注册表就是这么来的）。后半句比前半句更隐蔽：`?v=` 的
 *      **值**是唯一的、前半句校验通过，漏掉的只是其中一处没写戳 —— 模块表以含查询串的 URL
 *      为键，`./host.js` 与 `./host.js?v=…` 就是两份实例。商店后台真踩过：`admin/app.js`
 *      漏写戳，装配好的 84 个 `host.xxx()` 回调全落在面板看不见的那份对象上。
 *   4. 后端包之间出现新的环（`backend/api → backend/modules → backend/api` 这类）。
 *      Python 的包级环通常**不报错**：谁先被导入、环上那个名字此刻是不是已初始化，全看
 *      启动顺序，改一圈 import 就可能在某个部署路径下变成 `AttributeError`/空模块。
 *      上一轮把 `core` 的双向依赖（`core.schemas → panel.documents`、`core.schemas → ha.client`）
 *      下沉到 `core/design.py` 与 `core/ha_url.py` 就是这么发现并修掉的。
 *   5. mdi 图标版本出现第二个值，或版本号指向的 vendor 目录不存在。
 *      版本号分散在 JS 常量、CSS 的三条遮罩地址与后端的目录解析里，升级图标库漏改一处不会报错：
 *      CSS 那三条是舞台灯光素材图标（写错即空白），JS 那份写错则整套图标 404。
 *
 *   6. import 的说明符解析不到真实文件 —— 相对路径算错层数，或绝对路径没落到承载它的地方。
 *      外提/搬迁模块时最容易漏的一步：文件换了目录、层数没跟着改。ESM 在解析期解析说明符，
 *      一个少写的 `../` 会让导入方所在的整棵模块树加载失败 —— `editor/home/` 那批外提文件
 *      把 `./editor-utils.js` 少写了一层，症状是整个编辑器打不开，控制台却只指向那一行。
 *      绝对路径还有第二种断法：`/api/v1/modules/interaction3d/...` 的 runtime 资源**是一张
 *      服务端白名单**，文件放进磁盘不等于能被下发。所以这条同时校验白名单与磁盘一一对应。
 *
 *   7. 物件构建体用了 `itemBuilderContext` 提供的键，却没在自己函数顶部解构出来。
 *      同样是外提留下的：`buildItemModel` 那条 5744 行 if/else 链拆成 62 个构建体时，
 *      函数的**签名依赖**（context 的键）随函数一起搬走了，但函数体里对 `furnitureDarkColor`
 *      这类配色别名的取用点没跟着补进解构列表。表现是 `ReferenceError: furnitureDarkColor
 *      is not defined`，且只在**该物件类型被渲染时**才炸 —— 窗帘、蹲便器、小便器、壁灯、落地灯
 *      五类各少一个名字，不点开那几类就永远看不见。这是全仓最大的一次外提，也是最容易漏的一类。
 *
 *   8. HTML 的 `<script src>` / `<link href>` 与 CSS 的 `url()` / `@import` 指向不存在的资源。
 *      与第 3 条同源：没有打包器，静态文件路径全靠手写。这类断法是**最安静的一种** ——
 *      JS/CSS 缺了会整片功能消失，字体或图标缺了只是一处样式悄悄回退到系统默认，
 *      而 `?v=` 戳正好把它们从缓存里救出来一次、下一个人再把路径改错时又悄悄生效。
 *      判定按 URL（不是按磁盘）：`/store-static/` 与 `/fonts` 是两个挂在同一目录上的 URL，
 *      磁盘上「往上跳出挂载点」的写法在浏览器里可能是合法的。
 *
 *   9. `import` 进来的名字不在目标模块的导出里（含命名空间成员、动态解构，以及桥文件的转出口）。
 *      大文件拆分留下的伤口都在这一层：`buildItemModel` 拆成 62 个构建体、`PanelRenderer` 拆成
 *      四块、`mountStage` 拆成六簇，每个新模块都是「从原文件剪下来的一段」，剪完对不上原处的
 *      导出名是最容易漏的一步。失败是**解析期**的：`The requested module … does not provide an
 *      export named`，整棵模块树起不来，而报错只指向导入处、不指出该补什么。上一版把这一条
 *      写在「明确不做的事」里，理由是「需要允许新文件先落地再谈接线」—— 那个理由站不住：
 *      import 里文件名与名字同时写死在那一行，不存在「还没接线」的中间态。
 *      与第 6 条并列而不是合并：第 6 条只问「文件在不在」，这一条问「名字在不在」。
 *
 *      本条原本还想判另一半 ——「调用的名字在本文件没有任何绑定」（少搬一个 import 的另一种
 *      症状：只在**执行到那一行**时才 ReferenceError，与第 7 条同类）。实测后放弃：没有语法树
 *      就分不清对象字面量的键、成员名、解构键与真正的取用，按行级口径在全仓 298 个模块上跑出
 *      7996 条，绝大多数是模板字符串里的 GLSL（`vec2` / `mix` / `smoothstep` / `texture2D`）与
 *      平台内置（`Number` / `Map` / `Set`）。要判准必须引入真正的 JS 解析器，而本仓的 Node
 *      工具链刻意保持零依赖（AI 侧用 acorn 独立核过：当时的真自由变量只有 25 处，全是浏览器
 *      宿主全局）。宁可漏报，也不让这里变成「把误报一条条塞进去」的垃圾桶。
 *
 * 明确不做的事：不检查注册表分片是否齐全 —— 那类需要「允许新文件先落地再接线」的宽容度，
 * 硬拦会把正常改动挡死。
 * 第 6 条不在此列：import 里既然已经写死了文件名，就不存在「先落地再接线」的中间态，解析不到
 * 只可能是层数写错，或者绝对路径写到了不承载它的前缀上。绝对说明符只在能算出服务端真实口径
 * 时才判（两个 StaticFiles 挂载点 + runtime 白名单），其余按路由放过。
 * 第 7 条同理：构建体顶部那行解构就是它的完整外部依赖清单，缺一项必然是漏搬，不存在中间态。
 * 第 8 条只判「文件型资源」：`<img src>`/`srcset`、HTML 内联 `<style>`、以及 HTML 里的相对引用
 * （相对的是**文档 URL**，而文档 URL 由路由决定，换算不出唯一答案）都放过。
 * 第 9 条只判「本仓可解析的相对/绝对说明符」：裸说明符（`three` 之类）不判，目标解析不出磁盘
 * 路径时放过，目标是 `vendor/` 下的压缩产物时也放过（那类文件是一整行，文本扫描读不出导出表，
 * 且本仓不许改）—— 判不出真假就不判，这是这套守卫唯一的底线。
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

/**
 * 模块身份（第 3 条真正要防的东西）。
 *
 * 上一条只比「`?v=` 的值有几个」，看不见**根本没写戳**的那种引用：同一个文件被
 * `./host.js` 与 `./host.js?v=…` 两处引用时，值是唯一的、校验通过，而浏览器按 URL 认模块，
 * 这是**两份实例**（模块表以解析后的 URL 为键，查询串参与其中）。真踩过一次：
 * `store/static/admin/app.js` 用不带戳的写法 import `host.js`，其余 11 个面板都带戳 ——
 * app.js 往自己那份 `Object.assign(host, …)` 装配方法，面板拿到的那份始终是空对象，
 * 84 处 `host.xxx()` 全在调用时抛 `TypeError`。
 *
 * 只判「静态 import / re-export / 动态 import」这三种**会真的执行**的引用。刻意放过两类：
 *   - `new URL("./x.js", import.meta.url)`：那是 `file:` 打开时的开发态旁路，与生产分支互斥
 *     （static-helpers.js 的注释写明了这套双路径），同时跑不到，不算两份实例；
 *   - 同一文件的全 `?v=` 值不同：上一条已经在全站层面拦住了。
 */
const MODULE_REF_SCAN_ROOTS = [
  path.join(ROOT, "frontend"),
  path.join(ROOT, "store", "static")
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
  const byFile = new Map(); // 磁盘路径 → { stamped: [], plain: [] }
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

  // 入口 HTML 的 `type="module"` 脚本也是模块表里的一条：它加载的 URL 与某处 import 不一致，
  // 同样是两份实例（`palette.js` / `home.js` 这类入口最容易被别的模块顺手 import 一次）。
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
// 6) import 说明符（相对 + 可解析的绝对）必须落到真实文件 / 白名单上
// ---------------------------------------------------------------------------

/**
 * 判「说明符 → 真实文件」这一件事，不碰导出符号（见文件头「明确不做的事」）。
 *
 * 与第 1 条一样按整份文本匹配：说明符可以跨行写，逐行比对会把
 * `import {\n a,\n b\n} from "../x.js"` 这类写法整片漏掉。
 *
 * 但**不能用第 1 条那种 `(?:from\s*)?` 可选写法**：本仓代码分号很少，`export function closeRowMenus() {`
 * 之后到第一个 `;` 之间没有任何 `from`，可选写法会越过函数体去咬住函数里第一个 `.` 开头的字符串
 * （`.menu__pop`、`.interaction3d-cover-message`），把 CSS 选择器当成模块路径。
 * 所以 `from` 是硬条件，且拆成三条：带 `from` 的声明式导入/re-export、副作用导入、动态导入。
 *
 * 相对说明符（`.` 或 `..` 开头）按导入方所在目录换算；绝对说明符（`/` 开头）按**服务端真正
 * 的解析口径**换算，算不出口径的一律不判（路由不是文件）：
 *   - `/static/...`、`/store-static/...` → 两个 StaticFiles 挂载点，拼成磁盘路径后存在即通过；
 *   - `/api/v1/modules/interaction3d/...` → runtime 资源有显式白名单，**登记了才算存在**。
 *
 * 只判 `.js/.css/.mjs` 结尾的绝对说明符，`/n/...` 这类页面路由与其余 `/api/v1/...` 一律放过。
 */
const MODULE_IMPORT_RE = /^[ \t]*(?:import|export)\b[^;]*?\bfrom\s*["']([./][^"']*)["']/gm;
const MODULE_BARE_IMPORT_RE = /^[ \t]*import\s*["']([./][^"']*)["']/gm;
const MODULE_DYN_IMPORT_RE = /\bimport\s*\(\s*["']([./][^"']*)["']/g;

/** StaticFiles 挂载点 → 磁盘根。只登记真正下发 JS/CSS 的两个（商店的 `/fonts` 只发字体）。 */
const STATIC_MOUNTS = [
  ["/static/", path.join(ROOT, "frontend", "static")],
  ["/store-static/", path.join(ROOT, "store", "static")]
];

/** 运行侧资源路由前缀：URL 里这段之后与 `RUNTIME_DIR`（见第 1 条）一一对应，但**要过白名单**。 */
const RUNTIME_RESOURCE_PREFIX = "/api/v1/modules/interaction3d/";
const INTERACTION3D_API = path.join(ROOT, "backend", "modules", "interaction3d", "api.py");

/**
 * 读 `get_resource()` 里的白名单。现读而不在这里抄一份：抄一份就等于给「新增一个 runtime 模块」
 * 留了个必须手工同步的步骤，而漏同步的后果正是本守卫要拦的（浏览器 404、import 链断在第一跳）。
 */
function readRuntimeResourceWhitelist() {
  if (!fs.existsSync(INTERACTION3D_API)) return new Set();
  const text = fs.readFileSync(INTERACTION3D_API, "utf8");
  const start = text.indexOf("media_types = {");
  const end = text.indexOf("if filename not in media_types", start);
  if (start === -1 || end === -1) return new Set();
  const names = new Set();
  for (const match of text.slice(start, end).matchAll(/'([^']+\.[a-z]+)'/g)) names.add(match[1]);
  return names;
}

/** 扫描面与第 3 条的 `?v=` 戳一致：前端与商店的 JS 都可能被静态服务直接喂给浏览器。 */
const MODULE_SCAN_ROOTS = [path.join(ROOT, "frontend"), path.join(ROOT, "store")];

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

function checkModuleSpecifiers() {
  const problems = [];
  const runtimeWhitelist = readRuntimeResourceWhitelist();

  // runtime 白名单与磁盘必须一一对应，两个方向都会造成「不报错、只在浏览器里 404」：
  // 少登记 → 文件在磁盘上却不被下发；多登记 → 文件已删/改名，要等有人 import 到才暴露。
  if (runtimeWhitelist.size > 0) {
    const apiFile = rel(INTERACTION3D_API);
    for (const name of runtimeWhitelist) {
      if (!fs.existsSync(path.join(RUNTIME_DIR, name))) {
        problems.push({
          file: apiFile,
          line: 0,
          detail: `白名单里的 "${name}" 在 frontend/modules/runtime 下已经不存在`
        });
      }
    }
    for (const file of walk(RUNTIME_DIR, new Set([".js", ".css"]))) {
      const name = path.relative(RUNTIME_DIR, file).split(path.sep).join("/");
      if (!runtimeWhitelist.has(name)) {
        problems.push({
          file: apiFile,
          line: 0,
          detail: `frontend/modules/runtime/${name} 没登记进 get_resource() 白名单（请求它只会 404）`
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
            disk = path.join(RUNTIME_DIR, name);
            unlisted = !runtimeWhitelist.has(name);
          } else {
            return;
          }
        } else {
          // 相对说明符一律按**被引用文件自己的 URL** 解析，而不是按磁盘路径 —— 对 runtime
          // 资源这两者**深度不同**，正是本条曾经漏检的地方。
          //
          // runtime 资源挂在 /api/v1/modules/interaction3d/ 下，比磁盘路径
          // frontend/modules/runtime/ 深一层。于是磁盘上算得出来的 "../../../static/utils/colors.js"
          // （→ frontend/static/utils/colors.js，存在）在浏览器里会解析成
          // /api/v1/static/utils/colors.js，一次 404、整棵模块图静默掐断 —— 而这里当时
          // 只做 `path.resolve(path.dirname(file), target)`，看到磁盘上有就放过了。
          //
          // 所以：runtime 文件里的相对说明符必须**仍留在 runtime 前缀内**。要取 /static 下的
          // 东西只能经 core/static-helpers.js 的桥（桥内部用绝对路径，与层数、前缀都无关）。
          const runtimeName = path.relative(RUNTIME_DIR, file);
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
            disk = path.join(RUNTIME_DIR, url.slice(RUNTIME_RESOURCE_PREFIX.length));
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

const STUDIO_APP = path.join(ROOT, "frontend", "static", "3d-studio", "studio", "studio-app.js");
const ITEM_BUILDERS_DIR = path.join(ROOT, "frontend", "static", "3d-studio", "studio", "item-builders");

/**
 * 抹掉注释与字符串/模板，保留长度与换行 —— 这样按偏移算出的行号与原文一致。
 *
 * 不做这一步会把注释里提到的名字、以及字符串里的 CSS 选择器当成代码引用
 * （第 6 条的正则最初就踩过这个坑，见那里的注释）。
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

/**
 * 构建体可见的 context 键 = `ITEM_BUILDER_DEPS` 的键 ∪ `itemBuilderContext` 自有的键。
 *
 * 两条都从 studio-app.js 现读，不在这里抄一份常量：抄一份就等于给「给上下文加个键」
 * 留了个必须手工同步的步骤，而漏同步的后果正是本守卫要拦的东西。
 */
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

      // 函数内自己声明的名字，避免把局部变量报成漏搬。
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
const ASSET_SCAN_ROOTS = [path.join(ROOT, "frontend"), path.join(ROOT, "store")];

/** `<script src>` / `<link href>`：两种标签共用一条，属性值可以跨行。 */
const HTML_ASSET_RE = /<(?:script|link)\b[^>]*?\b(?:src|href)\s*=\s*["']([^"']+)["']/gi;
/** CSS 的 `url(...)`（带引号 / 不带引号两种写法）与 `@import "..."`。 */
const CSS_URL_RE = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)'"\s][^)'"]*?))\s*\)/gi;
const CSS_IMPORT_RE = /@import\s+["']([^"']+)["']/gi;

/** 这些前缀不是文件：协议、片段、以及由路由（而非静态目录）承载的绝对路径。 */
const NON_FILE_PREFIX_RE = /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i;

/**
 * URL 挂载表：`[URL 前缀, 磁盘根, 是否要过 runtime 白名单]`，按磁盘根由长到短排列。
 *
 * 与第 6 条的 `STATIC_MOUNTS` 分开，因为这里多了一条**靠目录别名存在、而不是前缀直连**的挂载点：
 * 商店把 `store/static/fonts` 同时挂在 `/fonts` 下，于是 `/store-static/font.min.css` 里写
 * `../fonts/font.woff2` 在磁盘上「不存在」、在浏览器里却正中 `/fonts`。
 */
const URL_MOUNTS = [
  ["/api/v1/modules/interaction3d/", RUNTIME_DIR, true],
  ["/fonts/", path.join(ROOT, "store", "static", "fonts"), false],
  ["/store-static/", path.join(ROOT, "store", "static"), false],
  ["/static/", path.join(ROOT, "frontend", "static"), false]
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
 *
 * 这里**按 URL 而不是按文件系统**解析：引用是浏览器按**被引用文件自己的 URL** 解析的，
 * 磁盘上的相对关系只是碰巧一致，越出挂载点的写法（`store/static/font.min.css` 里写
 * `../fonts/font.woff2` → `/fonts/font.woff2`）在磁盘上 "不存在"、在浏览器里却正中另一个挂载点。
 */
function resolveAssetRef(spec, fromUrl, runtimeWhitelist) {
  const target = spec.split("?")[0].split("#")[0];
  // 模板占位（Jinja 的 `{{ }}`、JS 模板串）与协议/片段一律不判。
  if (!target || /[{}]/.test(target) || NON_FILE_PREFIX_RE.test(target)) return null;
  // 相对引用要先知道被引用文件自己的 URL；HTML 由路由下发（`/`、`/n/...`），算不出就放过。
  if (!target.startsWith("/") && fromUrl === null) return null;
  const url = target.startsWith("/") ? target : resolveRelativeUrl(fromUrl, target);
  const mount = URL_MOUNTS.find(([prefix]) => url.startsWith(prefix));
  if (!mount) return null; // `/n/...`、`/api/v1/...` 等：路由，不是文件
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
 *
 * 刻意与 `MODULE_REF_SCAN_ROOTS` 共用一份：两处若各写一份，就会出现「第 3 条看得见的文件
 * 第 9 条看不见」这类偏移，而偏移本身不会有人发现。
 */
function moduleSourceFiles() {
  const files = [];
  for (const root of MODULE_REF_SCAN_ROOTS) {
    for (const file of walk(root, new Set([".js"]))) files.push(file);
  }
  return files;
}

/** 括号配平用；行尾注释先摘掉，避免注释里的括号把累积逻辑带偏。 */
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
 *
 * 必须把跨行声明拼回一条再解析：`import {\n a,\n b\n} from "…"` 这种写法在本仓是常态
 * （printWidth 100 一超就换行），逐行看只会看到 `import {` 这一个片段。第 1 条当年就踩过
 * 「逐行匹配漏掉跨行声明」的坑，这里沿用同一口径：从行首 import/export 起累积，直到括号配平。
 * 缩进过的行（函数体里的动态 import 之类）不算声明级，交给下面按正则单独处理。
 */
function readModuleDeclarations(text) {
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
      // 否则 `export { a } from "…"` 里的 a 会被当成一次取用（上一版正是这么误报的）。
      start: lineStarts[i],
      end: lineStarts[last] + lines[last].length
    });
    i = last + 1;
  }
  return out;
}

/** `{ a, b as c }` → [{ imported: "a", local: "a" }, { imported: "b", local: "c" }] */
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
 * 文本级扫描看不见它的导出表。判不出真假就只会变成误报源，而且本仓明令不许改这些文件
 * （README「不要改 frontend/static/vendor/ 下的 three.js…」），发现真问题也无从修。
 * 返回 null 表示「不知道」，调用方一律放过。
 */
function isVendorModule(file) {
  return rel(file).split(path.sep).includes("vendor");
}

/**
 * 目标模块的导出表。`export * from` 递归展开（带环保护），`export { a } from "…"` 记名字，
 * 目标是裸说明符或解析不到磁盘时不再往下追（返回 null 表示「不知道」，调用方一律放过）。
 */
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
      // `export { a } from "t"` 的 a 必须在 t 里存在 —— 桥文件（static-helpers*.js）
      // 全靠这种写法转出口，目标改了导出名而这里没跟着改，同样是解析期硬失败。
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
 * 不该算取用（`registry.js` 的文件头注释就逐个列出了它转出口的名字）。
 *
 * 块注释的**换行必须留下**：上一条版本把整块注释删成空串，行号整体前移，报出来的位置
 * 指向了完全无关的行。字符串里的 `//` 之类会让它多摘一点 —— 方向是「少报」而不是「误报」。
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
 *   - 调用：`name(` 或 `name?.(`
 *   - 取值：前面不是 `.`/`?.`/`#`，后面不是 `:`（对象字面量的键、`case` 标签）
 * 解构键（`{ name: alias }`）与成员名（`a.name`）都会被这两条排除掉。
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
    // `const { a, b } = await import("…")`（含 static-helpers*.js 的「条件动态 import + 命名导出」桥）：
    // 只判生产分支那条绝对路径，开发态的 new URL(..., import.meta.url) 与它互斥，不重复判。
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
    // `export { clampNumber as clamp } from "…"` 只把名字挂上对外接口，不在本模块作用域建绑定；
    // 同文件里再写 `clamp(...)` 就是运行期 ReferenceError，而栈顶指向导出方自己的函数（README
    // 记的那次现场像「几何/预算算法坏了」，其实是导出写法）。同理 `import { clampNumber } …;
    // export { clampNumber as clamp };` 也不建绑定，两种写法一起判：只认**转出口里出现的名字**，
    // 而且只认「后面跟 `(`」与「不跟 `:`、前面不带 `.`」这两种取用形态 —— 与 9B 相反，这里名字
    // 是已知的、数量是个位数，窄口径就够。
    const allDeclarations = readModuleDeclarations(text);
    const reexports = allDeclarations
      .map(decl => ({ decl, match: decl.text.match(/^[ \t]*export\s*\{([^}]*)\}\s*from\s*["']([^"']+)["']/) }))
      .filter(entry => entry.match);
    if (reexports.length > 0) {
      // 只挖掉「自己会列出这个名字」的语句：import 与 `export … from`。**不能**连
      // `export function …` 一起挖 —— 那种声明的函数体也是多行的，会被当成一条声明整块挖空，
      // 而真正的取用恰恰就写在函数体里（上一版正是这样把注入的用例漏掉的）。
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
 * 而样式表里**没有任何规则**用 `var(--x)` 取它。此时那行 JS 是纯粹的静默空转 ——
 * 值算对了、也写进 DOM 了，只是没有任何东西会因此改变外观或布局。
 *
 * 为什么值得单独一条：这类断法在浏览器里**零报错、零警告**，DevTools 的 Elements 面板里
 * 还能看见那个变量挂着正确的值，于是读代码的人会以为它在生效。本仓实测有 10 枚，
 * 每一处的注释都还在描述那个「本该发生」的效果 —— 代码与注释同时撒谎，
 * 只有把「写」与「读」两边的集合做差才看得见。
 *
 * 判定口径（宁漏不误）：
 *   - 「写」只认**完整字面量**：`"--hb-bed-" + role + "-angle"` 这类拼接写法以 `-` 结尾，
 *     不是完整令牌名，直接排除（否则会拿半个名字去比对，报出一堆假的）。
 *   - 「读」= CSS 的 `var(--x)`、JS 的 `getPropertyValue("--x")`、以及 colors.js 的
 *     `paletteColor("--x", …)`。三者的共同点是**名字以字面量出现在源码里**：
 *     只要没人读它，这个名字就不会以别的形式出现，所以按名字做差是可靠的。
 *   - 曾经列过 10 枚已知的「写下去但没人读」，**现已全部修完并清空**（见下方注释保留的
 *     逐条结论）。清空而不是留白名单：留着等于给这 10 个名字开了永久通行证，
 *     哪天它们被重新写回来，本条守卫会一声不响地放过 —— 那正是它要防的事。
 */
const PROP_WRITE_RE = /setProperty\(\s*["'](--[\w-]+)["']/g;

const PROP_READ_RES = [
  /var\(\s*(--[\w-]+)/g,
  /getPropertyValue\(\s*["'](--[\w-]+)["']/g,
  /paletteColor\(\s*["'](--[\w-]+)["']/g
];

const PROP_SCAN_ROOTS = [
  path.join(ROOT, "frontend"),
  path.join(ROOT, "store"),
  path.join(ROOT, "design")
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
 * 否则下一个人无法判断该补 CSS 还是该删 JS —— 而两种修法都成立时，只有知道意图的人能选。
 */
/**
 * 「写下去但没人读」的豁免名单。**当前为空** —— 修完 10 枚之后刻意不留条目，理由见上。
 *
 * 2026-09 的 10 枚（5 套机制）逐条结论，留作档案：
 *
 *   --hb-light-visual-blur        **删 JS**。上游去混淆源码带进来的，本仓库任何一次提交里
 *                                 都没有过 var() 取用点，也就从未生效过；柔和衰减一直是靠
 *                                 .hb-light-visual-aura 那四层同心 box-shadow 叠出来的。
 *                                 补 blur 要对近千像素纹理逐帧重算（滑块一拖就在动画），
 *                                 代价高于收益。变量与两处写入一并删除。
 *   --hb-cover-open-position      **删 JS**。帘布宽度由 -panel-width / -single-panel-width
 *                                 两个派生量决定，原始百分比样式表从不取用。顺带把那两个
 *                                 派生量里重复写在 entity-details.js 与 custom-popup.js 的
 *                                 四个魔数（45.9 / 0.331 / 91.8 / 0.79）收进
 *                                 utils/cover-features.js —— 它们「只是恰好等值」，
 *                                 和该文件里 COVER_POSITION_EPSILON_PERCENT 当年分叉的情形一样。
 *   --hb-presence-copy-gap        **删 JS**。对应的「文案」层（DOM 与 .hb-presence-copy-*
 *   --hb-presence-copy-main-size   的 gap / font-size 规则）已在 0.6.2 重构里整体移除，
 *   --hb-presence-copy-secondary-size 只剩 JS 这半截还在按人物框尺寸算字号，算了没人用。
 *   --hos-scale                   **删 JS**。缩放一直直接落成行内 transform，
 *                                 这枚变量自始至终没接上。若要按缩放比做样式表侧补偿
 *                                 （浮层反向缩放），需连行内 transform 一起挪进样式表，
 *                                 因为行内样式永远压过规则、变量加了也不生效。
 *   --title-frame-color           **删 JS**（4 枚）。外框现在是一段内联 SVG：颜色落成 path 的
 *   --title-frame-width           stroke、宽度落成 stroke-width、两个偏移参与算出括号坐标，
 *   --title-frame-offset-x        这四项输入在 JS 里已经消费完了。它们是早期「用 CSS 画框」
 *   --title-frame-offset-y        方案的残壳。注意其余 --title-* 不同，那些有 var() 取用。
 *
 * 新增条目请务必写明**缺的是哪一半**（该补 CSS 还是该删 JS）与判断依据；两种修法都成立时，
 * 只有知道意图的人能选。更好的做法是直接修掉。
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
 *
 * 这是「按 6 位色值做子串替换」的典型事故：原文是 8 位十六进制 #11171cd1
 * （面色的半透明变体），批量替换器只认 6 位 #11171c，于是把前缀换成了令牌、
 * 把两位 α 落在后面。浏览器对整条声明判无效，结果是**该属性静默失效**
 * （背景没了、边框没了），控制台一声不响。
 *
 * 和上面十条同一类「不报错、只静默失效」，所以放进守卫：
 * 新增一处就无法悄悄溜过。修法是补 -rgb 兄弟令牌写成
 * `rgba(var(--x-rgb), .86)`，或把该处还原成 8 位十六进制。
 *
 * **不能只认裸 `var(--x)`**：残渣同样会落在带兜底的形态上 ——
 * `var(--hos-eco, #5fd0a8)ad`（原文 #5fd0a8ad）。这种写法**碰巧能跑**，
 * 因为有兜底值恰好同值，替换结果又拼回了合法的 8 位色；
 * 可一旦色板把 --hos-eco 改掉，替换结果就变成 9 位十六进制、整条声明失效 ——
 * 「今天不报错」正是它最危险的地方。所以这里按**括号配对**扫 var() 的收尾，
 * 兜底值里再嵌 color-mix()/渐变也照样能扫到。
 */
const CSS_SCAN_ROOTS = [
  path.join(ROOT, "frontend"),
  path.join(ROOT, "store"),
  path.join(ROOT, "design")
];

/**
 * `theme-color` / webmanifest 里的写死色值与色板走散。
 *
 * meta[name=theme-color] 与 webmanifest 的 theme_color / background_color **吃不下 var()**
 * （前者不参与 CSS 级联，后者是 JSON），所以它们只能写成十六进制 —— 这一点的结论没变，
 * 审计脚本也在这几行上关掉了「该用令牌」的提示。
 *
 * 但「只能写死」不等于「可以随便写」：这 13 个 HTML/py 与 5 份 manifest 表达的是同一件事
 * ——**页面最底层的那个颜色**。一旦有人改了 design/scene/page.css 的 --hos-sky-deep，
 * 这些写死值不会有任何提示地停在旧色上，而症状是「手机地址栏 / 启动画面与页面底色差一点」，
 * 是最难联想到色板的一类问题。之前没有任何守卫覆盖它：审计把它当「吃不下 var()」放行，
 * 而放行不等于核准 —— 它只是不再投诉，值是漂还是不漂没人看。
 *
 * 判法：取值必须**逐字等于**色板里那两枚「页面最底层」令牌的 canonical 值。
 * 新增页面若确实压着别的底色，把该令牌加进这份白名单 —— 加的那一步就是复核。
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
        // 而 `var(--x)ad;` / `var(--x)d1` 是 α 位被切在了括号外。
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
 *
 * 兜底值只在令牌**缺失**时才生效，所以平时渲染完全正常 —— 它是一类「平时看不见、
 * 真出事时又没人会往这儿找」的潜伏值。实测修出 20 处，全是同一来路：改语义色之前
 * 那套旧调色板的值被留在了兜底位。差异不是一点点：
 *
 *   --hos-cool   兜底 #a8c5d3  vs canonical #58c4ff   （青蓝 → 灰蓝，最远的一处）
 *   --hos-eco    兜底 #9ed8bc  vs canonical #5fd0a8
 *   --hos-alert  兜底 #d45f5f  vs canonical #f07a7e
 *   --hos-muted  兜底 α .58    vs canonical α .64
 *   --hos-lumen  兜底 #ffab32  vs canonical #ff9d4d    （确认弹窗主按钮整个暖色系）
 *
 * 判法：解析 design/scene/page.css 的 :root 取值（支持 hex / 三元组 / rgba(var(--x-rgb), α)），
 * 再扫全站 CSS/JS 的 `var(--hos-*, <简单颜色>)`。只比「兜底值是简单颜色」的那些 ——
 * 兜底写成 linear-gradient 之类的（如 --hos-grad-* 那几处）解析不了，不判。
 */
const FALLBACK_RE =
  /var\(\s*(--hos-[\w-]+)\s*,\s*(#[0-9a-fA-F]{6}|rgba?\([^()]*\)|\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3})\s*\)/g;

/**
 * JS 侧的同一件事：`paletteColor("--hos-x", "#兜底")`。
 *
 * `utils/colors.js` 的 `paletteColor` 是 JS 读调色板的唯一入口（SVG 的 stroke、
 * 2D canvas 的 fillStyle 都拿不到 CSS 变量，只能这样现取一次）。它的第二个参数
 * 与 CSS 的 `var()` 兜底是同一种东西：只在令牌取不到时生效，因此平时渲染完全正常，
 * 一旦运行期调色板没挂上就会静默换成另一套颜色。
 *
 * 单独一条正则是因为写法不同（引号包裹、逗号分隔），不能靠 FALLBACK_RE 覆盖。
 * 修出实例：light-range-editor.js 的 `--hos-sky-haze` 兜底 `#536777`，而 canonical
 * 是 `#24395a` —— 差得如此之远，反过来说明该处**令牌选错了**（拿夜空族的面色当描边），
 * 而不是兜底写错，所以最终改的是令牌本身。
 */
const PALETTE_FALLBACK_RE =
  /paletteColor\(\s*["'](--hos-[\w-]+)["']\s*,\s*["'](#[0-9a-fA-F]{6}|rgba?\([^()]*\)|\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3})["']/g;

/**
 * 第三种兜底写法：`{ token: "--hos-x", fallback: "#lit" }`（可带 rgbFallback）。
 *
 * 有些映射被写成了**数据**而不是调用 —— 面板原语把「空气质量档 → 颜色」存成
 * `{ token, fallback, rgbFallback }`，折线图把出厂阈值存成「令牌数组 + 兜底数组」。
 * 这种形态下 JS 侧不会出现 `paletteColor(...)`，CSS 侧也没有 `var()`，前两条正则都看不见它，
 * 但「兜底必须等于 canonical」这条要求一字不差。真实漏网：primitives.js 的 excellent / good
 * 两档兜底写着 #4ed6a8，而 --hos-eco 是 #5fd0a8。
 *
 * 两键顺序在源码里可以互换，所以双向都匹配；`rgbFallback` 与 `fallback` 都要写对，
 * 因此同一条也覆盖三元组形态。
 */
const TOKEN_FALLBACK_PAIR_RE =
  /token\s*:\s*["'](--hos-[\w-]+)["']\s*,\s*(?:rgb)?[Ff]allback\s*:\s*["']([^"']+)["']|(?:rgb)?[Ff]allback\s*:\s*["']([^"']+)["']\s*,\s*token\s*:\s*["'](--hos-[\w-]+)["']/g;

function collectPaletteColors() {
  const text = fs
    .readFileSync(path.join(ROOT, "design", "scene", "page.css"), "utf8")
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
      // 以及数据形态的 { token: "--x", fallback: "兜底" }。
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
 *
 * XML 规范不允许注释内含 `--`（它是注释的结束符开头），而 SVG 是 XML 而不是 HTML：
 * HTML 里注释中间夹 `--` 多数浏览器容忍，SVG 会**整个文件解析失败**，画面上只留
 * 白/空白，控制台给的是 `not well-formed` 而不是「颜色不对」，很难联想到注释。
 *
 * 这条是踩出来的：给品牌标加注说明「不要改成 var(--hos-x)」时，注释里的 `--` 让
 * 6 个 SVG 全部失效 —— 而 SVG 本身没有 lint 会跑。写令牌名时省掉前导横线
 * （写 hos-sky-deep 而不是双横线开头）即可绕开。
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
 *
 * `design/scene/appearance.js:178-179` 是这两档的唯一定义处，写死了
 * `-soft = 0.13` / `-line = 0.32`（商店侧 theme.css 与后端白名单都按这个口径）。
 * 但各页面在给「某个设备的强调柔光 / 描边」下本地定义时，常常自己手写一份
 * `rgba(var(--hos-x-rgb), α)`，于是同一个语义角色在全站散出 0.12 / 0.13 / 0.15 / 0.16
 * 四种 α —— 换主控色时只有恰好写 0.13 的那一档跟着契约走，其余永远停在原地。
 * 实测一次扫出 11 处（renderer.css 5 / admin.css 3 / app.css 1 / studio.css 1 …）。
 *
 * 判据不是「名字以 -soft/-line 结尾」——那样会漏掉全部真违约、只认出本来就对的
 * canonical 令牌（`--hb-lumen-soft` 这类）。真违约的名字是 `--accent-soft` /
 * `--hb-vacuum-accent-soft` / `--hb-tone-line`，都不以家族名命名。所以改看**取值**：
 * 只要它是 `rgba(var(--{hos,hb}-<八族之一>-rgb), α)` 形式、且名字以 `-soft`/`-line` 结尾，
 * 就按契约比对。这样 `--hos-atmo-soft`（取值是字面 rgb，不是派生）与
 * `--uc-line`（引用的是 sky-haze，不属于八族）都自然落在规则之外，无需白名单。
 *
 * 名字里带 `-text` 的跳过：那是文字 α（如 `--accent-text-soft` 的 0.82），
 * 与「柔光底 / 描边」不是一回事 —— 与 audit_colors.mjs 的 roleOfToken 同一口径。
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
        if (token.includes("-text")) continue; // 文字 α，不是柔光/描边
        if (!FAMILY_RGB_IN_VALUE_RE.test(value)) continue; // 非八族派生，语义无关
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
    hint: "跑 node tools/bump_static_cache_versions.mjs 统一戳；带戳与不带戳混用等于两份模块实例（模块表以含查询串的 URL 为键），把那处漏掉的 ?v= 补上 —— 开发态旁路 new URL(..., import.meta.url) 不算",
    run: () => [...checkSingleStamp(), ...checkModuleInstances()]
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
    title: "import 说明符解析不到真实文件 / runtime 资源没登记进白名单",
      hint: "相对路径按导入方所在目录重算层数（文件深一层，`./x` 写成 `../x`、`../x` 写成 `../../x`）；**runtime 资源（frontend/modules/runtime/**）的相对说明符按 URL 语义判、且必须留在 /api/v1/modules/interaction3d/ 前缀内** —— 它的 URL 前缀比磁盘路径深一层，跨出去取 /static 只能走 core/static-helpers.js 的桥；绝对路径只判能算出服务端口径的（/static、/store-static、/api/v1/modules/interaction3d），后者新增文件必须同时登记进 backend/modules/interaction3d/api.py 的 get_resource() 白名单",
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
