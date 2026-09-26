/**
 * 「不报错、只静默失效」的不变量守卫（逐条清单见文件末尾的 `checks` 数组）。
 *
 * 为什么只留这一类：上一轮清理把原先的七道 Node 护栏整套移除（README「开发工具」有记录），
 * 理由是它们把关的多是「改结构才触发」的一次性问题。但下面这些对应的失效方式恰好相反 ——
 * 它们**每次编辑都可能踩到，且踩到时浏览器/解释器不报错**，正好是人工 review 最容易漏的那一类。
 *
 * 本条目的展开范围是 1–9（结构类）；10 起是后续按同一取舍补进的 —— 10–15 配色类（含 theme-color /
 * webmanifest 的写死色值）、16–28 是清单与产物一致性类（模型注册表两端、流水线 GLB 与规格自洽、
 * 环境模型类型七处、材质风格档位覆盖、「档位即组合」的角色覆盖、素材库页签与类型词表两端、
 * 默认档位的角色出口、平面符号该不该画圆、命令闸门与状态订阅两端口径、环境页面归一表
 * （pageDimming 的模块→页面别名）、doorModels 的楼层入参、卷帘契约的五处出口）、
 * 之后按补入顺序分别是：引用了本文件解析不出绑定的名字（真语法树 + 作用域链，见第 9 条尾部）、
 * 净化器模型类型三处白名单同源（净化器与新风机在三处消费者之间的口径）、窗帘面板的返回键集合
 * （0.6.5 的 deactivate，漏了会让帘组面板退化成 ?.() 兜底）、扫地机状态别名与文案同源（别名漏登
 * 即静默显示成「状态更新中」）、吊柜挂高的三处同源（规格 mountHeight / 占位几何 / 类型定义里不能
 * 再有 elevation —— 2026-09 的「同一个草稿放到原版里，吊柜高出一个挂高」就是这么来的）、
 * 聚焦可用设备清单与上游同集合、授权状态文案三处同源、前端可派发的 HA 服务必须登记进后端
 * ALLOWED_SERVICES（按钮可点、命令必被拒）。
 *
 * 本文件有意不再写「共 N 条」：序号与总数在历次补条后已经对不上（README 同一处曾同时出现
 * 32 / 33 / 34 三个说法），而 README 早就定了「引用一律用条目名而不是序号」的口径 —— 这里照办。
 * 这些条目的踩坑背景写在各自 `checks` 条目的 title 与代码注释里。
 *
 * 三段共用同一条底线：**判不出真假就不判** —— 宁可漏报，也不让这里退化成
 * 「把误报一条条塞进去」的垃圾桶。下面 1–9 逐条如下：
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
 *      症状：只在**执行到那一行**时才 ReferenceError，与第 7 条同类）。当年按行级口径试过并放弃：
 *      没有语法树就分不清对象字面量的键、成员名、解构键与真正的取用，全仓 298 个模块上跑出 7996 条，
 *      绝大多数是模板字符串里的 GLSL（`vec2` / `mix` / `smoothstep` / `texture2D`）与平台内置
 *      （`Number` / `Map` / `Set`）。**这一半现在由第 29 条接手**：判定改用真正的语法树 + 作用域链
 *      （`tools/lib/free-variables.mjs`，解析器是仓库已有的 `tools/vendor/acorn`，仍然零 npm 依赖）——
 *      实测全仓真自由标识符只剩宿主全局 + 那两处真 bug（itemWidth / itemDepth / materialPalette）。
 *      宁可漏报，也不让这里变成「把误报一条条塞进去」的垃圾桶 —— 所以第 29 条的宿主白名单里
 *      只收浏览器 / Worker 自带的名字。
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

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { MODEL_SLOT_ROLES, MODEL_SLOT_ROLE_SUFFIX_RE } from "./models/model-roles.mjs";
import { measureFootprints } from "./audit_plan_symbols.mjs";

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
const MATERIAL_STYLES_JS = path.join(
  ROOT,
  "frontend",
  "static",
  "3d-studio",
  "studio",
  "studio-material-styles.js"
);
const ITEM_TYPES_JS = path.join(
  ROOT,
  "frontend",
  "static",
  "3d-studio",
  "studio",
  "studio-item-types.js"
);

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

const EXTERNAL_MODELS_JS = path.join(
  ROOT,
  "frontend",
  "static",
  "3d-studio",
  "loaders",
  "studio-external-models.js"
);
const MODELS_DIR = path.join(ROOT, "frontend", "static", "3d-studio", "models");
/**
 * 注册表条目：`类型: defineHomeItemModel("子目录", "文件基名", {`。
 * 允许换行写法 —— rounddiningtable_turntable 就是拆成三行的，只认单行会漏掉它。
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
 * 不引入 three —— 护栏要能在 CI 的裸 Node 里跑，而判据本身只需要 POSITION 访问器的 min/max。
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
 *
 * 这条判据**只对这批模型**生效，不覆盖 models/ 下的外部既有资产 —— 两边的契约本就不同：
 *   - 流水线产物按约定「变换烘进几何、包围盒逐值等于 scaleBasis、材质名 material-<槽位号>」，
 *     因为 generate-models.mjs 就是按这套约定导出的；
 *   - 外部既有资产是别人按自己的工具链导出的，材质名走的是另一套**同样被运行侧支持**的
 *     子串约定（重音在 `cushion` / `foliage` / `-soft` / `-light` / `-dark` 上），把它们按
 *     `material-<槽位号>` 判就是纯误报。
 * 取不到规格表（模块解析失败等）就整体跳过，宁可漏报。
 */
const { PIPELINE_MODEL_SPECS, PIPELINE_LITE_VERTEX_BUDGET_RATIO } = await (async () => {
  try {
    const module = await import(path.join(ROOT, "tools", "models", "model-specs.mjs"));
    return {
      PIPELINE_MODEL_SPECS: module.MODEL_SPECS,
      // lite 顶点预算的缺省上限比例与生成器取同一个来源；这里不抄一个 0.9，两端各写一份
      // 就会出现「生成器放行、守卫报红」的分裂口径。
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
 *
 * 与上一条（checkModelAssetUrls）的分工：那条只管「文件在不在、有没有被引用」，
 * 这条管「文件内容对不对」。两者都不管的话会出现这些**只在画面上表现为「有点歪」**的失效：
 *
 *   1. **改了规格没重新导出** —— 磁盘上还是旧尺寸，而运行侧按 scaleBasis 做非等比缩放，
 *      成品被整体拉伸。实测发生过：smartlock 宽少 5mm（0.075 vs 0.08）被拉宽 6.7%。
 *   2. **底面不在 y=0** —— preserveOrigin 直接拿原点贴地，偏了就是半埋进地板或浮空。
 *   3. **占地中心不在原点** —— 摆放时按占地居中计算，偏心会让物件视觉上偏出包围盒。
 *   4. **材质名不是 `material-<槽位号>`** —— 运行侧按槽位号与后缀（-soft / -dark / cushion）
 *      查色卡，名字对不上就是「模型到位后颜色不跟风格走」，而这条连 fallback 都没有。
 *   5. **lite 不比完整版轻** —— 首屏加载的那一份没起到作用，等于白做一条产线。
 *   6. **lite 与完整版的包围盒不一致** —— lite 才是主资源（完整版是加载失败时的回退），
 *      少一块撑轮廓的零件就是物件本身小了一圈：零报错，只是模型一到位轻轻缩一下。
 *
 * 判不出真假就不判：解析失败只报告「读不了」，不去猜内容；作用域限于流水线产物。
 */
function checkModelGlbIntegrity() {
  const problems = [];
  if (!PIPELINE_MODEL_SPECS) {
    return problems; // 规格表读不到就不判，避免退化成纯误报
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
      continue; // 外部既有资产走自己的命名 / 比例约定，不按流水线判据判
    }
    const blockEnd = index + 1 < entries.length ? entries[index + 1].index : text.length;
    const block = text.slice(entry.index, blockEnd);
    const relative = `${entry.modelDir}/${entry.fileKey}`;
    const fullPath = path.join(MODELS_DIR, `${relative}.glb`);
    if (!fs.existsSync(fullPath)) {
      continue; // 存在性归 checkModelAssetUrls 管，这里不重复报
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
        // 高度按规格里的 `authoredHeight` 判（缺省等于 scaleBasis 的高）。有些物件的几何**刻意
        // 伸出声明箱体之外**（台盆的镜柜烘在台面以上），声明高度只描述落地柜体，作者实际烘出的
        // 总高另记在 authoredHeight —— 不认这个键，这条守卫会对这一类物件稳定误报。
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
        // 就在 1.4m 那一档 —— 与生成器的同源校验一致，见 model-specs.mjs 的 wallcabinet。
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
        // lite 与完整版必须**逐值同包围盒**：lite 是运行侧的主资源（完整版只是加载失败时的回退），
        // 少一块撑轮廓的零件就是「物件本身小了一圈」，零报错。历史上 31 件这么踩过 ——
        // 撑住进深 / 宽度 / 高度的零件（柜门把手、壁挂件挂板、地毯流苏、楼梯斜裙板……）被打了
        // `fullOnly`，或者 lite 的降段数没踩在圆截面的极值角上。生成器那一侧有同源的 0.5mm 校验，
        // 这里判磁盘文件（1.5mm）：它拦的是「规格改了但没重新导出」，与包围盒那条同一个分工。
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
        // 「零件一件都丢不得、分段一处都降不了」的类型显式声明 1：它的 lite 与完整版同形是
        // 有意为之，不该在这里被反复报一条没人能修的警报。
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

const STUDIO_APP_JS = path.join(ROOT, "frontend", "static", "3d-studio", "studio", "studio-app.js");
const STORAGE_CABINETS_BUILDER_JS = path.join(
  ROOT,
  "frontend",
  "static",
  "3d-studio",
  "studio",
  "item-builders",
  "storage-cabinets.js"
);

/**
 * 吊柜的挂高（柜底离地）必须三处同源。
 *
 * 为什么单列一条：吊柜的挂高是**烘进几何**的（规格的 `mountHeight`，导出时整件抬起 1.4m）——
 * 这是照**原版既有资产**的口径定的：那台资产的柜底也在 1.378m，而它的
 * `ITEM_TYPE_DEFINITIONS.wallcabinet` 里没有 elevation，摆位只把 elevation 当偏移。
 * 于是这一个高度在三个地方各写了一份，漂掉任何一处都不报错：
 *   1. `tools/models/model-specs.mjs` 的 `wallcabinet.mountHeight` —— 生成器按它抬整件；
 *   2. `item-builders/storage-cabinets.js` 的 `wallCabinetMountHeight` —— 占位几何照同一个口径加；
 *   3. `studio-app.js` 的 `ITEM_TYPE_DEFINITIONS.wallcabinet` —— **不能再有 `elevation`**。
 * 1 与 2 不同 →「模型加载完成的那一帧」柜子往下一掉或往上一跳（占位只活到那一帧，不报错）；
 * 3 多出一格 → 本仓新放一件吊柜的默认落点与原版差一个挂高（原版那一格是 0），而这一格的值
 * 还会跟着草稿写出去 —— 2026-09 的「草稿放到原版里，吊柜的高度还是不对」就是这么来的：
 * 那一版把 1.6 写进这一格，几何又是 0 基，于是同一个草稿在原版里从 1.4m 悬到 3.1m。
 * 判据只覆盖这一件（全库只有它烘了挂高），读不到规格 / 源码就不判。
 */
function checkWallCabinetMountHeightParity() {
  const problems = [];
  const spec = PIPELINE_MODEL_SPECS?.wallcabinet;
  if (!spec) {
    return problems; // 规格表读不到（这一件没在流水线里）就不判
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
 *
 * 为什么单列一条：两块不同槽位的面落在同一平面、而且在平面上有重叠时，GPU 按图元顺序
 * 抢同一像素、逐帧抖动 —— 画面上是一片闪动的条纹。它**不报错、不崩、不进控制台**，
 * 单张截图也看不出来（触发条件与相机距离、浮点精度有关），只有在真正转起来时才显形。
 * 已实际发生过的一批：面板贴在机身前脸上、顶盖与机身一起顶到同一个标高、玻璃门与柜体
 * 同宽同面、踏板的两条长边与斜梁逐面齐平 —— 全库 87 处。
 *
 * 判据与修法这类工具同源，直接复用 tools/audit_coplanar_faces.mjs（同一份 GLB 读取与
 * 法向分类），避免「守卫一套口径、审计另一套口径」：
 *   - 只报**同向**（两块面朝向同一侧）与**背靠背但两侧沾到玻璃**（glass 是 DoubleSide +
 *     depthWrite:false，背面剔不掉）的；
 *   - 背靠背且两件都是单面材质的（顶盖坐在箱体上、层板贴在背板前）不计 —— 那类是正常叠放，
 *     从外侧看朝内那块被背面剔除丢掉，不闪；要做到 0 得把每个接触面都改成互嵌或留缝，
 *     代价高而画面零变化。
 *
 * 修法不是「把面推开」：包围盒受 1mm 的规格校验约束，外表面不能动。正确做法是让**非极值的那一件**
 * 退让 2~5mm（嵌进母体、或收到相邻件的内表面之内），外观不变而两个面不再共面。
 * 本环境无法目视（零 WebGL 绘制），这条守卫是这批缺陷唯一的发现路径。
 */
function checkCoplanarOverlaps() {
  const problems = [];
  let payload;
  try {
    payload = JSON.parse(
      execFileSync(process.execPath, [path.join(ROOT, "tools", "audit_coplanar_faces.mjs"), "--json"], {
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024
      })
    );
  } catch (error) {
    // 审计脚本自身跑不起来时**必须报错**：静默返回「通过」会让这条守卫在无人察觉的情况下失效，
    // 而它又是这类缺陷唯一的发现路径（本环境零 WebGL 绘制，目视不了）。
    problems.push({
      file: "tools/audit_coplanar_faces.mjs",
      line: 0,
      detail: `共面审计跑不起来，全库一件都没判：${error.message.split("\n")[0]}`
    });
    return problems;
  }
  for (const entry of payload.unreadable || []) {
    // 作用域与标题一致：这条判据管的是**流水线产物**的几何。既有资产（第三方导出，
    // 用 Draco / sparse 访问器 / 外部 .bin）本来就读不动，也不在生成器的覆盖范围内 ——
    // 报出来只会让这条守卫永远红着而没有任何人能修，与其它几条「外部既有资产走自己的
    // 约定、不按流水线判据判」的判据同一个口径。真正读不动的流水线产物仍然照报
    //（那一定是生成器或导出坏了）。整批读不动的清单在 `--json` 的 unreadable 字段里，
    // 手跑 node tools/audit_coplanar_faces.mjs 也会逐件点出来。
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
 *
 * 为什么单列一条：这一路**没有任何运行时报错**。加载失败会静默退回过程几何（studio-external-models.js
 * 的 fallback 路径），物件照样出现、只是糊一点，肉眼极难判定「模型没到位」还是「模型就长这样」。
 * 已实际发生过的失效：换戳脚本按旧签名把 defineHomeItemModel 的第二参（当时是回退版本号）整段换成
 * 新戳；第二参改成文件基名后，同一段正则把**基名**换成了版本戳，全站模型 URL 变成
 * `/models/furniture/2609240238.glb`，192 个文件一个都取不到。基名形状那条判据就是这次事故的指纹。
 */
/**
 * `modelTypeForItem`（studio-external-models.js）派生出来的模型类型：由基础类型带出来，
 * 本来就不该出现在「可加载类型」那两张名单里，因此不参与下面那条可达性判据。
 */
const DERIVED_MODEL_TYPE_RE =
  /^(curtain_(left|right|split)|pillar_(round|semicircle|quarter|quarterinner)|tv_(standard|tabletop|mobile)|rounddiningtable_turntable)$/;
/**
 * 已知「注册了模型但没有任何一条路会加载它」的存量条目。**现已清空** —— 这份名单是
 * 债务清单、不是白名单：它让下面那条判据只拦新增的孤儿条目，不把存量一次性炸出来。
 *
 * 最后四笔（`smallcar` / `elevator` / `steelstairs` / `glassstairs`）的来龙去脉值得留一笔：
 * 它们**有意不在 HOME_ITEM_TYPES** 里（建筑本体与车辆不进暖阳家居配色，见 studio-item-types.js
 * 那段注释），而「不参与家居配色」被顺带读成了「不加载模型」—— 于是注册条目与被它引用的 GLB
 * 一起空转。2026-09 这四件按流水线规格重建（见 model-specs.mjs 的 elevator / uStairLayout），
 * 重建的同时把它们加进 EXTERNAL_MODEL_ITEM_TYPES，这条判据从此对它们生效：
 * 再被漏掉就直接报错，不再靠人记得。
 *
 * 其中小汽车 2026-09-26 又换回了上游第三方车模（贴图集 + Draco），因此它**不再是**流水线产物、
 * 也从 model-specs.mjs 里撤掉了；但这条判据对它照旧成立 —— 资产仍在注册表里、仍由
 * media-structure.js 的小车构建体加载，撤掉规格不等于可以少一处加载路径。
 *
 * 空白名单仍留着而不是删掉机制：判据本身要一直在，下一条孤儿条目才拦得住
 * （`sofa` 当初就是这么挂了一版 —— GLB 一直在，画面上却是没有腿的程序化方块）。
 *
 * 更早收清的几笔：airoutlet / pipelinewaterpurifier / tea_bar_machine 三件接 HA 的家电在
 * 流水线重建那一轮拿到了带 scaleBasis 与角色槽位的新 GLB，于是划掉并加进
 * APPLIANCE_MODEL_ITEM_TYPES；`piano` 同理 —— 旧的那份是原样搬进来的第三方素材（单位厘米、
 * 底面在 y=−0.502、材质名是 `金色金属材料` / `[Color_009]1` 这种、注册条目连 scaleBasis 都给不
 * 出来，于是写不了角色、也就永远不会跟着材质风格换色），重建后它是 1.5 × 0.99 × 1.5 的三角钢琴、
 * 八个角色槽位，于是划掉并加进 EXTERNAL_MODEL_ITEM_TYPES。
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
  // 上面两条查「文件在不在、有没有被引用」，这一条查「引用它的那条路有没有人会走」。
  // registry.js 的收尾判据是 EXTERNAL_MODEL_ITEM_TYPES ∪ APPLIANCE_MODEL_ITEM_TYPES，
  // 不在这两张名单里的类型**永远**退回过程几何，而两头对账照样全绿 —— 于是这条注册
  // 连同它的 GLB 一起空转，零报错。sofa 就是这么挂着的：GLB 一直有，画面上却是那版
  // 「抬离地面却没有腿」的程序化方块，两个缺陷互相掩护，谁也没被发现。
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

const ENVIRONMENT_SCENE_JS = path.join(
  ROOT,
  "frontend",
  "modules",
  "runtime",
  "environment",
  "environment-scene.js"
);
const ENVIRONMENT_HALOS_JS = path.join(
  ROOT,
  "frontend",
  "modules",
  "runtime",
  "environment",
  "environment-halos.js"
);
/**
 * 「环境模型类型」这组清单在仓库里重复了 7 处，且**每一处漏写都不报错**：
 *   - environment-scene.js 的 MODEL_TYPE_TO_PAGE / MODEL_TYPE_TO_DEVICE_KIND（两张表，按类型反推页面与设备种类）；
 *   - environment-halos.js 的描边资格清单（少了 → 该设备永远不高亮，看着像「没绑上」）；
 *   - studio-app.js 的四处等价清单（合批排除 + 打 environmentModelType 标记，少了 → 预览里拿不到状态）。
 * 所以这里把它们取出来两两比对。取值靠「找到 wallac 再向外扩到最近的 [ ]」，不依赖变量名 ——
 * 那四处是内联数组字面量，本来就没有名字。
 */
function readBracketLists(text) {
  // 认列表靠**连续三连**「wallac → floorac → airoutlet」：studio-app.js 里还有一组含 wallac 的
  // 大集合（家具 + 家电 + 洁具几十项），只看单个 wallac 会把它整段吞进来。这三连只有环境模型
  // 清单才满足（那组大集合里 wallac 后面跟的是 floorac、再后面是 nas）。
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
 *
 * environment-scene.js 的 pageDimming 先把「模块 ID」归一成「页面 ID」，随后 pageModelBindings
 * 与 screenOutlines 都按这个页面取值。漏登一个别名时该页签会同时掉进两个坑：既不在页面白名单里
 * （压暗 / 降饱和整段不生效），又把页面筛成别名本身（环境模型既不描边、也不合成展示绑定）。
 * 症状是「切到该页签，环境设备全部失去高亮」，浏览器不报任何错。
 *
 * 期望值对着上游 0.6.5 的 pageDimming 反混淆结果钉死：上游把 `purifier` / `temperature-humidity`
 * 归入 environment、通用设备品类归入 devices（本仓净化器并入环境页、通用设备也不是独立模块，
 * 故这两类不登记）。本仓已踩过一次 —— temperature-humidity 页签漏登，切过去环境设备全不高亮。
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

/**
 * 取对象字面量里**第一层**的键名与值表达式（嵌套对象里的键不算 —— 角色配方的值是 `{ surface, color }`，
 * 内层键不能当成角色名）。`defaulted` 表示该键的值带 `??` 兜底。
 */
function readTopLevelObjectEntries(objectText) {
  const entries = [];
  // 先去掉行尾注释：本文件里带默认值的角色（`accent: accent ?? upholstery`）前面正好是一行说明注释，
  // 不剥注释的话「上一个非空字符」会是句号而不是逗号，那个角色就会被漏掉。
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
 *
 * 返回每个构造器的两类角色：
 *   - `all`：它返回的全部角色（能表达的角色）；
 *   - `defaulted`：返回时带 `??` 兜底的角色 —— 调用处不写也算数（柜类的 trim / base 默认跟随柜体、
 *     软包的 accent / cushion 默认跟随主体、frame 默认跟随腿）。
 *
 * 为什么要把「兜底」单独拎出来：调用处**没传**、构造器也**没有兜底**的角色，配方里的 color 会是
 * undefined，运行侧 `Number.isFinite(color)` 判定不过 → 那块网格静默保留基础色。这跟「写了配方
 * 但值为空」是同一种失效，必须判出来。所以覆盖判据是「调用处显式传入 ∪ 构造器兜底」。
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

/**
 * 解析 studio-material-styles.js 里的风格组：`const X_STYLES = Object.freeze([ defineStyle(...) ])`。
 * 颜色对象是扁平的，因此按大括号配对取出每个档位的键名就够了，不需要真解析 JS。
 *
 * 同时取出「档位即组合」那部分的角色名：颜色对象之后如果跟着 `xxxCombo({ ... })`，
 * 该档位按角色给出的配方就是这个构造器**返回**的那些角色（不是调用处字面写出的那几个，
 * 见 readComboOutputRoles）。取角色名的目的是护栏要能回答「这个类型的这个角色，
 * 在这个档位里到底有没有配方」—— 缺一个就会静默退回基础色。
 */
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
      // 该档位**真正覆盖到**的角色 = 调用处显式传入的 ∪ 构造器用 `??` 兜底的。
      // 只写对象字面量（没有构造器）时，覆盖到的就是字面量里第一层的键。
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

/** 取 `const NAME = new Set([ "a", "b" ])` 里的字符串成员（含 Object.freeze(new Set([...])) 形式）。 */
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
 *
 * 这个功能的失效方式是**纯静默**的：下拉照常渲染、值照常落盘、控制台零报错，只是选了之后
 * 3D 里什么都没变 —— 因为调色板的某个键压根没被任何换色分支读，或者读的键风格没覆盖。
 * 单看代码极难发现（要同时读完 applyFurniturePalette 的几十个分支和十几组风格定义），
 * 因此把四条约束固化成校验：
 *
 *   1. 每个档位至少要覆盖一个「基准键」（completeFurnitureRamp 的候选键，从源码里读，
 *      不在此处复制一份）。缺了它，completeFurnitureRamp 不会补齐四档 —— 一旦物件的零件
 *      落在 furniture* 档，风格就完全不起作用。
 *   2. 服务了「家电调色板」类型（APPLIANCE_PALETTE_ITEM_TYPES）的风格组必须写全
 *      appliance / applianceSoft / applianceDark —— 家电分支只认这三键，只写 furniture*
 *      同样是「选了没反应」（电视的 SCREEN_STYLES 就踩过这个坑，见 studio-material-styles.js）。
 *   3. 每个「支持材质风格」的类型都必须能查到档位（逐类型表或材质族兜底），
 *      否则下拉里只有「跟随全局风格」，属性面板上等于没有这个功能。
 *   4. 档位表 / 族表里不许出现不属于该类型的键 —— 类型改名或删类型后残留的键是死代码，
 *      而它对应的新类型会因此落到第 3 条上。
 *
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
  // 从源码里读基准键与四档键名，避免这里再抄一份、两边各自漂移。
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
 *
 * 这一条的失效方式和上一条同源、但更隐蔽：**风格档位为该类型的每个材质角色都要有配方**，
 * 缺一个角色，那一块网格就静默退回基础色 —— 现象是「这个风格下别的地方都变了，就是某一块没变」，
 * 与旧行为（整件单色）混在一起几乎无法判定。角色名写错（`leg` 写成 `legg`）也是同一个下场。
 *
 * 判据（两端都从源码取，不在这里抄一份）：
 *   1. 规格里声明的角色必须在 MODEL_SLOT_ROLES 词表内，且不以 -soft / -dark / -light 结尾
 *      （那三个后缀是既有资产的亮度分档约定，撞上会被运行侧当成亮度分档取色）；
 *   2. 对每个带角色的流水线类型，它**能选到的每个档位**都必须给出该类型用到的全部角色的配方。
 *
 * @returns {Array<{file: string, line: number, detail: string}>} 问题清单。
 */
function checkMaterialRoleCoverage() {
  const problems = [];
  if (!PIPELINE_MODEL_SPECS) {
    return problems; // 规格表读不到就不判
  }
  const stylesText = fs.readFileSync(MATERIAL_STYLES_JS, "utf8");
  const groups = collectMaterialStyleGroups(stylesText);
  const roleNamesByStyleId = new Map();
  for (const group of groups) {
    for (const entry of group.entries) {
      roleNamesByStyleId.set(entry.id, entry.roles);
    }
  }
  // 类型 → 它能选到的风格组名：逐类型表优先，其次是材质族兜底（与 materialStyleOptionsFor 同序）。
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
   * 它按挂装方式拆成 tv_standard / tv_tabletop / tv_mobile 三份模型，但物件类型始终是 tv
   * （运行侧 modelTypeForItem 由 item.tvMountStyle 现算模型键），逐类型档位表里也只有 tv 一条。
   * 折算回 tv 之后，这三份模型用到的角色就能被它真正会走的档位（SCREEN_STYLES）验到；
   * 不折算的话它们查不到档位、这一条会直接跳过 —— 恰恰是最需要验的三份（角色最多）。
   */
  const styleLookupTypeBySpec = new Map([
    ["tv_standard", "tv"],
    ["tv_tabletop", "tv"],
    ["tv_mobile", "tv"],
    // 窗帘同样是「一个物件类型对多份模型」：按开合方式拆成三段（左 / 右 / 对开），
    // 但物件类型始终是 curtain，逐类型档位表里也只有 curtain 一条。不折算的话这三份
    // 会查不到档位、整条跳过 —— 而它们正是本轮新增角色的三份。
    ["curtain_left", "curtain"],
    ["curtain_right", "curtain"],
    ["curtain_split", "curtain"]
  ]);

  for (const [itemType, spec] of Object.entries(PIPELINE_MODEL_SPECS)) {
    const declaredRoles = [...new Set((spec.slots || []).map(slot => slot.role).filter(Boolean))];
    if (declaredRoles.length === 0) {
      continue; // 还没补角色的类型不判 —— 它们本来就走整件配色那条路
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
      continue; // 「这个类型查不到档位」由上一条（材质风格覆盖）负责报
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
  // 运行侧退化成「一个纯色 + 没纹路」，正是本条守卫要防的「选了没反应」。
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
 *
 * 失效方式：默认档位（「跟随全局风格」）走的不是 `joineryCombo` 那套按角色的配方，而是
 * studio-external-models.js 的 `applyFurniturePalette`；它末尾有一条「按烘焙亮度分三档」的
 * 兜底，本意是给**整件同一种主料**的家具分层次。内容物与五金落进那条兜底会被刷成主料色 ——
 * 书柜里的书与柜体同色、鞋柜敞开格里的鞋读成一堆木方块、梳妆台的镜面是一块木头。这三条
 * 症状都不报错，只能靠眼睛发现（而且要先知道自己在看什么）：它们各自被「不跟木色走」的
 * 配方挡过一次，但那只在**手动选了材质档位**时才生效。
 *
 * 判据：规格里出现过的**每一个角色**都必须在运行侧的出口登记表里登记，且三份名单互不重叠：
 *   - `CARCASS_MATERIAL_ROLE_SET`：本来就是主料，跟着调色板三档走；
 *   - `AUTHORED_COLOR_MATERIAL_ROLE_RECIPES`：内容物 / 撞色陈设件 / 镜面，取规格里烘焙的原色；
 *   - `NON_CARCASS_MATERIAL_ROLE_SET`：另有专管（五金 / 玻璃 / 布艺 / 琴键 / 绿植 / 水槽灶面 / 屏面）。
 * 反向也判：登记了却没有任何规格在用（改名之后的残渣）、或不在角色词表里（拼错），都会报出来。
 *
 * @returns {Array<{file: string, line: number, detail: string}>} 问题清单。
 */
function checkMaterialRolePaletteOutlets() {
  const problems = [];
  if (!PIPELINE_MODEL_SPECS) {
    return problems; // 规格表读不到就不判
  }
  const loaderText = fs.readFileSync(EXTERNAL_MODELS_JS, "utf8");
  /** 取 `const NAME = new Set([ ... ])` 里的字符串成员；读不到返回 null（改名即整条失效）。 */
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
 *
 * 平面图符号是手绘的（studio-app.js 的 drawPlanItem），3D 早已换成流水线规格，两者不会互相
 * 牵引 —— 0.9 × 0.9 的圆茶几画成方角矩形、圆桶加湿器画成方块，画面上「对不上」但浏览器零报错。
 * 这一条把「该不该画圆」变成可判的：
 *
 *   实测（判据见 tools/lib/glb-footprint.mjs：格数比 ≈ π/4 且各向半径等长）
 *     ↔ studio-item-types.js 的 ROUND_FOOTPRINT_ITEM_TYPES（运行侧照它画圆）
 *
 * 双向都判：实测是圆却没进名单 → 那一件在户型图上是个方角矩形；名单里有但实测不是圆 →
 * 名单该收，否则圆的符号会盖在一个方方正正的物件上。
 * 另加一道「名单有没有真的接上」：只导出名单、不去用（少写 `.has(itemToDraw.type)` 分支）
 * 是这类改动最典型的半成品状态，两个方向都正常、画面上一点变化都没有。
 *
 * 判不出真假就不判：读不到 GLB、几何太简单（径向样本不够）的条目一律跳过，只报「读不了」。
 *
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
  // 判据要精确到「那一支里有 fill()」—— 圆里的同心圈（ROUND_PLAN_RING_RATIOS_BY_TYPE 那一段）
  // 也带 ellipse()，只看 ellipse 会被它蒙混过去（实测过：把外轮廓那一支停掉，判据照样通过）。
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
    measured = null; // 读不出就不判，避免退化成纯误报
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
 * 用户是「色号表」这类扁平结构 —— 槽位表里嵌了一层 Object.freeze，所以按括号配对切到对象结束为止）。
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
 * 来源两处：STONE_SLAB_TONES 的键，以及 createStoneSlabTexture 里特判复用背景墙贴图的那个 `marble`。
 * 读不到（改名 / 结构变化）时返回 null，本条子校验整体跳过 —— 不误报比多报一条更重要。
 */
function readStoneSlabFlavors() {
  const surfaceTexturesPath = path.join(
    ROOT,
    "frontend",
    "static",
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
  // 特判分支：`if (flavor === "marble")` 直接复用背景墙那张图，不在 STONE_SLAB_TONES 里出现。
  for (const item of textureText.matchAll(/flavor === "([a-zA-Z][a-zA-Z0-9_-]*)"/g)) {
    flavors.add(item[1]);
  }
  return flavors.size ? flavors : null;
}

const ASSET_PALETTE_JS = path.join(
  ROOT,
  "frontend",
  "static",
  "3d-studio",
  "studio",
  "studio-asset-palette.js"
);

/**
 * 素材库页签与类型词表两端对账。
 *
 * 素材库的分组显隐走两条**互不知情**的数据：卡片自己的 `data-asset-category`（来自
 * STUDIO_ASSET_PALETTE 里那一组的 `category`，在 studio-asset-palette.js）决定分组标题是否可见，
 * 而 studio-app.js 的 syncAssetTabVisibility 用 APPLIANCE_ITEM_TYPES 决定**卡片**是否可见。
 * 两条数据一旦错开，症状是卡片挂在上一个仍可见的家居标题下面 —— 也就是「家电跑进了
 * 结构与特殊物件 / 卫浴那一组」。它不报错，只有人盯着素材栏才发现，所以在这里双向对账：
 *   - 「电器」组的卡片必须都在 APPLIANCE_ITEM_TYPES 里（少了就是漏到家居页签）；
 *   - 「家居」组的卡片必须都不在 APPLIANCE_ITEM_TYPES 里（多了就是家居卡片跑进电器页签）。
 * 同一份名单还决定兜底盒体的取色（external-fallback.js：家电取电器色、其余取家具色），
 * 所以漏一个会连带让加载中的占位几何变成另一个颜色。
 */
function checkAssetPaletteTypeSets() {
  const problems = [];
  if (!fs.existsSync(ASSET_PALETTE_JS) || !fs.existsSync(ITEM_TYPES_JS)) {
    return problems;
  }
  const paletteText = fs.readFileSync(ASSET_PALETTE_JS, "utf8");
  const itemTypesText = fs.readFileSync(ITEM_TYPES_JS, "utf8");

  // 卡片按所属分组的 category 归堆。分组对象形如
  // `{ category: "appliance", label: …, note: …, items: [ { type: "fridge", … }, … ] }`，
  // 所以从 `category:` 起配到该组 `items: [` 的收尾 `]` 为止。
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
 *
 * `smallcar`：2026-09-26 换回上游第三方车模（贴图集 + Draco）后不再是流水线产物，
 * 也从 `model-specs.mjs` 撤掉了；它是**按模型实测尺寸摆放**的（运行侧量完直接缩放，
 * 不用 scaleBasis 语义），因此 `ITEM_TYPE_DEFINITIONS` 那一格只是拖拽落点用的经验值，
 * 与注册表条目的 scaleBasis 本来就不是同一件事。判据对其它类型照旧生效。
 */
const ITEM_SIZE_PARITY_EXEMPT_TYPES = new Set(["smallcar"]);

/** 占地尺寸与 scaleBasis 的允许偏差（米）：5mm 以内肉眼不可辨，不报。 */
const ITEM_SIZE_PARITY_TOLERANCE = 0.005;

/**
 * 素材库卡片与「类型定义」两端对账。
 *
 * 素材库卡片只声明一个 `type` 字符串，能不能真正**放下**一件东西却完全取决于 studio-app.js 的
 * `ITEM_TYPE_DEFINITIONS`：`createSceneItem()` 的头两行就是
 * `const typeDefinition = ITEM_TYPE_DEFINITIONS[newItemType]; if (!typeDefinition || !ensureCalibration()) return;`
 * 于是「卡片在、定义不在」的表现是**点一下什么也不发生** —— 不报错、不弹提示、草稿不变，
 * 连拖拽落点也被同一处拦下（palette drop 与点击走的是同一个入口）。
 *
 * 这正是加一件新物件时最容易漏的一格：模型注册表、类型词表、材质风格、平面符号四处都补了，
 * 唯独忘了这一格 —— 而且漏掉之后其余四处全都在「等待被调用」，谁也报不出错。
 * 判据：素材库里出现的每个 type 都要有一条 `ITEM_TYPE_DEFINITIONS.<type>: { … }`。
 *
 * 顺带对账三个数的来源：定义里的 width / depth / height 是该类型的默认占地方向，
 * 有外部模型时必须与注册表 scaleBasis 逐值相等，否则新放下的一件会先按定义里的尺寸
 * 建占位几何、模型落地那一帧再被缩到另一个尺寸（肉眼是「加进去时跳一下」）。
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
    return problems; // 改名或挪了位置：这条判据读的是源码文本，读不到就不判
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
    // 该类型在注册表里的 scaleBasis（注册表条目形如 `fridge: defineApplianceItemModel("appliance", "fridge", {`）
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

// ---------------------------------------------------------------------------
// 25) 命令闸门放行的实体，必须落在状态订阅口径内
// ---------------------------------------------------------------------------
// 宿主对同一批「非顶层绑定」的实体有两处展开：命令闸门（决定这条 control 能否下发）与
// 状态订阅（决定舞台收不收得到它的读数）。两处同源，必须一起改 —— 补门锁与附加实体那次
// 只补了闸门、订阅侧漏了，症状是「命令发得出去、面板恒显不可用」：lightStream 只推订阅集
// 内的实体（服务端按订阅报文过滤），没订上的实体读数是永久空值，而整条链路没有任何报错。
//
// 判定用「配置读取路径」而不是函数名：两处对同一批配置的取用路径必然一致（都是
// componentProperties.security.locks / .devices / .environment.airPurifiers 这些），
// 而函数名可以为了「闸门只要附加控件、订阅还要电源与健康规则」这类差异而合理地不同。
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
 *
 * 这些辅助函数都定义在 `mountInteraction3d` 的函数体顶层（两空格缩进），所以按
 * 「下一条同样缩进的声明 / 语句」切边界是可靠的；边界含 `if` / `for` / `}` 是防止
 * 辅助函数紧跟着一段控制流时把后面整段都吃进来（多吃只会放松判定，少吃才是误报）。
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
 *
 * 这个函数对两种形态的容错是**不对称**的：取门列表时 `config.scene.doors` 不成还有
 * `config.doors` 兜底，查墙却只认 `config.scene.walls`。于是传 `floor.scene` 时门列表
 * 兜得住、墙列表变成 `scene.scene.walls` = undefined，画在墙上的门（`scene.doors` 里绝大多数）
 * 全部因为「找不到挂靠的墙」被丢掉；只有工作室导出的、没有 `wallId` 的独立门模型才会侥幸留下。
 *
 * 症状是静默的：快照里 `floors[].doors` 成了空数组，安防面板的门锁列表恒为空（提示「本层没有
 * 可用的门模型」、添加按钮 disabled），门锁**一条也建不出来**，保存后的配置里连 `locks` 键都没有；
 * 而同一份元数据的摄像头 / 传感器清单正常，所以看起来像「只有门不对」。浏览器不报任何错。
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
      // 定义本身（`function doorModels(config)` / `export const entryDoorModels = doorModels;`）跳过。
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
 * （`curtainForm: "standard" | "roller"`，工作室下拉框 `#curtain-form`），编辑器里显式改过时
 * 置 coverKindOverride 让交互配置的 coverKind 胜出（与上游 0.6.5 同口径）。
 *
 * 这几处任一漏掉都是「不报错、只静默失效」：
 *   · 后端取值枚举漏 roller  → 编辑器一选卷帘，整份配置保存时 422；
 *   · 后端字段白名单漏 coverKindOverride → 覆写标记被当成未知字段，整份 422；
 *   · 编辑器归一 / 下拉漏 roller → 下拉框里没有卷帘，选不出来；
 *   · config-metadata.js 漏透传 curtainForm → 模型明明是卷帘，编辑器仍显示普通窗帘；
 *   · geometry.js 漏读 coverKindOverride → 覆写选了卷帘，舞台照旧按垂帘渲染；
 *   · 工作室漏写 curtainForm（写成历史字段名或漏掉状态）→ 画出来的卷帘存不下来、老草稿读不出。
 * 这些是同一份契约的各个出口，改任一处都要同手改这里。
 */
function checkCurtainKindContract() {
  const problems = [];
  const cases = [
    {
      file: "backend/modules/interaction3d/config.py",
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
    const full = path.join(ROOT, testCase.file);
    let text = "";
    try {
      text = fs.readFileSync(full, "utf8");
    } catch {
      problems.push({ file: rel(full), line: 0, detail: "读不到文件，守卫无法判定" });
      continue;
    }
    for (const [pattern, detail] of testCase.tests) {
      if (!pattern.test(text)) {
        problems.push({ file: rel(full), line: 0, detail });
      }
    }
  }
  return problems;
}

// ---------------------------------------------------------------------------
// 29) 模块里出现「本文件解析不出绑定」的标识符取用（真正的语法树 + 作用域链）
// ---------------------------------------------------------------------------

/**
 * 这条原本被称为「明确不做」的一半（见文件头第 9 条）：「调用的名字在本文件没有任何绑定」
 * 曾在无语法树的前提下按行级正则试过，全仓跑出 7996 条、绝大多数是模板字符串里的 GLSL，
 * 只好放弃。现在判定交给 tools/lib/free-variables.mjs（用 tools/vendor/acorn 建真语法树 +
 * 作用域链），实测全仓真自由标识符只剩浏览器宿主全局，因此这条可以立起来了。
 *
 * 为什么它值得一条守卫：这类引用**没有任何静态报错**，只有真的执行到那一行才 ReferenceError。
 * 两处真实案例都是在「把一段代码搬进另一个函数」时漏掉参数/改错名字留下的 ——
 *   · studio-app.js 的 drawPlanItem 里画钢 / 玻璃楼梯时写了 itemWidth / itemDepth，
 *     而本函数只有像素版 itemWidthPx / itemDepthPx 与米制 planFootprint；
 *   · studio-external-models.js 的 applyAppliancePalette 里写 materialPalette，
 *     而那个名字只在唯一调用点的实参位置存在，函数内的绑定叫 appliancePalette。
 * 症状分别是「户型图上放钢梯 / 玻璃梯就整张图不刷新」与「小车一走家电调色板就炸」，
 * 且都要用户正好碰到那一件才看得见。
 *
 * 判据边界（与 tools/lib/free-variables.mjs 的注释一致，这里只补一层宿主白名单）：
 *   - 只认**取用**，不认对象字面量的键、成员名（a.b 的 b）、import/export 说明符、标签；
 *   - `typeof 裸名字` 不报（特征探测的常规写法）、`with` 体内不报（作用域运行期才定）；
 *   - 宿主全局由 HOST_GLOBALS 兜底 —— 这张表的**唯一**增补理由是「浏览器 / Worker 宿主自带」。
 *     凡是要往这里加业务名字，先问一句「它为什么在文件里没有绑定」，多半是真 bug。
 */
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
 *
 * 净化器（`airpurifier`）与按净化器接入的新风机（`freshair`）在 HA 里都是 `fan` 域，
 * 前端靠实体域渲染净化器面板，因此「哪些场景模型能绑到一条 `environment.airPurifiers` 配置上」
 * 这份类型表有三处消费者：
 *
 *   - `config-editor.js` 的 `sceneModelTypes()`：模型选择器的候选；
 *   - `binding-collectors.js` 的 `collectClimateBindings()`：运行时的场景绑定；
 *   - `purifier.py` 的 `PURIFIER_MODEL_TYPES`：命令侧「模型是否还在场景里」的复核。
 *
 * 任一处漏改的失效方式都**不报错**：选择器漏 → 该外观根本配不上；绑定漏 → 配上了但
 * `modelAvailable` 恒为 false（模型不渲染、点不开面板、控制静默失效）；后端漏 → 配置与画面
 * 都对，命令却 409「空气净化器模型已失联」。三类症状互不覆盖，所以只能靠这条守卫钉住口径。
 *
 * 判定只比「集合是否相同」，不比书写格式：空格、引号（JS 双引号 / Python 单引号）都不参与
 * 比较；但写法一变到解析不出（例如类型表改成变量拼接）就当场报出来 —— 宁可报「守卫失效」，
 * 也不要它悄悄退化成永远通过。
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
      file: "backend/modules/interaction3d/purifier.py",
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
 *
 * 0.6.5 的 cover-panel 返回 `{ root, update, deactivate, dispose }`，其中 deactivate 的语义是
 * 「把面板从正在被操作的状态里摘出来」（拖动进行中时撤回预览与草稿，但面板还要继续用）。
 * 帘组面板在成员被换掉 / 整组收起时必须调它，否则那一次拖动留下的预览会挂在场景里，
 * 直到用户碰下一个控件才消失 —— 全程零报错。
 *
 * 本仓曾漏登这个方法，于是 cover-group-panel.js 只能写 `panel.deactivate?.()` 兜底：
 * 兜底写法的代价是「方法在不在」这件事永远没人知道，漏了也只是静默少清一次场。
 * 所以这里同时钉三件事：返回键里有 deactivate、它的实现仍带「仅在拖动中才动手」的守卫、
 * 以及调用侧不许再出现 `?.()`。
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
 *
 * 同一个语义在厂商侧有多个写法（回充有 returning / returning_to_base / returning_home，
 * 清洗拖布有 washing / mop_washing / self_washing / cleaning_mop……）。漏登的别名不会报错，
 * 它会掉进字典后面的兜底分支，界面上显示成「状态更新中」—— 用户看到的是「这台机器不知道自己
 * 在干什么」，而代码里一切正常。所以这里既钉「别名必须在表里」，也钉「同一语义的别名必须同文案」：
 * 后一条能挡住「新加了别名但文案抄错」的那类漂移。
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
  // 见 vacuum-map.js 里那段注释），所以这里只匹配到 `[vacuumRawState` 为止 ——
  // 带上完整的 `]` 会在归一化写法改动时静默失配，守卫变成一条永远报「找不到字典」的假警报。
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
  path.join(ROOT, "frontend", "modules"),
  path.join(ROOT, "frontend", "static")
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
 * 用它而不是正则截到第一个 `}`：对象里嵌套数组 / 对象（本文件的两处标签表都没有，
 * 但守卫不该依赖这一点）时截断点会落在内层。
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
  // 那一支，点一次门锁就会把上次看过的那台空调打开（命令照发、浏览器零报错）。
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
  // 任一处的键集落后，就会在该状态上原样显示英文码 / 显示空白提示。
  const sources = [
    {
      file: "backend/license/service.py",
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
 *
 * 起因是同一类真实踩坑连出三次：`vacuum.stop` / `vacuum.locate` / `vacuum.clean_spot`
 * （2D 扫地机面板「开得动、停不下来」）与 `climate.set_swing_horizontal_mode`
 * （2D 空调「水平摆风」整组每次点都 403）。前端按 supported_features 把按钮渲染出来，
 * 后端白名单却没登记那条服务 —— 于是按钮可点、命令必被拒，面板只回显一句笼统的失败，
 * 浏览器零报错。正是本项目最忌讳的「不报错、只静默失效」。
 *
 * 判据：收集前端分发位置里出现的服务名 —— `service: "x"`、`callEntityService("d", "x")`、
 * `invoke*Service("d", "x")`、媒体动作按钮、扫地机动作定义表 —— 逐个核对 ALLOWED_SERVICES。
 * 域名与服务名都是字面量时按**确切组合**核对，其余只核对服务名是否存在于任一域。
 *
 * 局限（刻意保留）：前端域名常是变量（`domain: command.domain`），因此这里不做
 * 「域 + 服务」的组合核对，只挡「服务名整条缺失」—— 三次踩坑都属后者。
 *
 * 误报出口：某条字面量确非 HA 服务时，登记进 NON_HA_SERVICE_LITERALS 并写明理由。
 * 不要放宽匹配式来消误报，那会把这条守卫一并弄死。
 */
const NON_HA_SERVICE_LITERALS = new Set([]);

function checkFrontendHaServicesAllowed() {
  const problems = [];
  const lineOf = (text, index) => text.slice(0, index).split("\n").length;
  const haFile = path.join(ROOT, "backend", "api", "ha.py");
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

  // 分发位置。带 domain 的按确切组合核对，否则只核对服务名。
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
          "改 tools/models/model-specs.mjs 里的 size 后**必须重跑** node tools/models/generate-models.mjs 导出，" +
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
          "踏板与斜梁逐面齐平改成踏板收 2mm/边）。改完必须重跑 node tools/models/generate-models.mjs",
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
          "后端 config.py 的 coverKind 取值枚举要含 'roller'、字段白名单要含 'coverKindOverride' 并做" +
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
          "改挂高就三处一起改，改完重跑 node tools/models/generate-models.mjs wallcabinet 导出、" +
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
