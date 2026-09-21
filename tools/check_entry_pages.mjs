/**
 * The five entry pages must stay one flow, not five lookalike forms.
 *
 * Usage:
 *   node tools/check_entry_pages.mjs
 *
 * Exits 1 and prints which page, which gate and what is wrong.
 *
 * Why this exists: `/setup`, `/login`, `/license`, `/pair` and the recovery page
 * that renders in place on `/pair` and `/display/*` are five hand-written HTML
 * files with no template layer and no build step. They share a shell, a
 * stylesheet set and — since the commissioning rail was added — one rail that
 * says how far this machine got on a chain of five gates.
 *
 * The rail is *not* written in the five HTML files. It is filled by the backend
 * per request (`backend/http/commissioning.py`), because the same `/pair` reads
 * differently for an admin and for a keyboard-less wall panel: hard-coding it
 * would mean printing 「登录 ✓」 on a screen that never logged in. That moves the
 * failure mode this guard watches for from "a copy drifted" to "the two halves
 * stopped agreeing" — a page that dropped its insertion point, a branch that was
 * never written for a new gate, a state with no CSS behind it. None of those
 * throw, and none of them are visible on the page: the rail just quietly goes
 * missing or quietly says the wrong thing.
 *
 * `check_structure_refs.mjs` answers "does every reference resolve"; this answers
 * "are the five pages still one flow, and does the flow still add up".
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FRONTEND = path.join(ROOT, "frontend");
const PAGE_SHELL = path.join(ROOT, "backend", "http", "page_shell.py");
const COMMISSIONING = path.join(ROOT, "backend", "http", "commissioning.py");
const MAIN_PY = path.join(ROOT, "backend", "main.py");
const PANEL_CSS = path.join(ROOT, "design", "scene", "panel.css");

/** The gate chain, in the order backend/main.py enforces it. */
const STEPS = ["初始化", "登录", "激活", "配对", "进中控"];

/**
 * Where each page sits on that chain, by the gate it *is*.
 *
 * `current` is the gate this page renders; `blocked` is the page that is not a
 * gate of its own — the recovery page renders in place on `/pair` and on
 * `/display/*`, so what it shows is the gate that is shut, not a position it
 * could claim on its own.
 */
const PAGES = {
  "setup.html": { current: 0 },
  "login.html": { current: 1 },
  "license.html": { current: 2 },
  "pair.html": { current: 3 },
  "license-recovery.html": { blocked: 2 },
};

/**
 * Which branch of `rail_states` may mark a gate 「不适用」.
 *
 * Only these two pages sit *behind* the 登录 gate (see the route guards in
 * main.py: `pair_page` does not require a session, and neither does the recovery
 * page), and only they serve two audiences at once — an admin who signed in and
 * a wall panel that never will. Marking 登录 `is-skipped` anywhere else would be
 * claiming a gate is inapplicable to a visitor who is about to walk through it.
 */
const SKIPPED_BRANCHES = new Set(["pair.html", "license-recovery.html"]);

/** The helper both of those branches must go through to decide 登录. */
const SIGNIN_HELPER = "_signin_state";

/**
 * The shape of the `<li>` template in `rail_markup`, as two fragments that must
 * both be present.
 *
 * This pins a bug that shipped past every other check here: the first version
 * unpacked `zip(states, STEP_LABELS)` into `(label, state)`, i.e. backwards, so
 * each item got `class="hos-steps__item 初始化"` with the text `is-current`. It
 * still looked like a rail — five steps, one of them lit — and the states in
 * `rail_states` were all correct, so nothing static caught it. Requiring the
 * literal template to put `{classes}` inside the class attribute and `{label}`
 * after the dot marker is enough: swap them and neither fragment matches.
 */
const ITEM_TEMPLATE_FRAGMENTS = ['<li class="{classes}"', '{label}</li>'];

/** The four states the CSS must define. Kept in sync with commissioning.py. */
const RAIL_STATES = ["is-done", "is-current", "is-blocked", "is-skipped"];

/** Loaded by every entry page, whatever its form does. */
const REQUIRED_LINKS = [
  "/static/auth/scene/fonts.css",
  "/static/auth/scene/page.css",
  "/static/auth/scene/scene.css",
  "/static/auth/scene/panel.css",
];
const REQUIRED_SCRIPTS = [
  "/static/logging/client-log.js",
  "/static/auth/scene/scene-depth.js",
];

/**
 * All three placeholders are filled by `page_shell.py`, which raises when one is
 * missing — but only once the page is actually requested, so check it here too.
 *
 * Each must appear **exactly once**: the insertion point is itself an HTML
 * comment, so a second mention inside a prose comment becomes a second insertion
 * point, and the injected block lands inside that comment. The page renders
 * fine, minus the rail (see `page_shell._assert_placeholders_are_real`).
 */
const REQUIRED_PLACEHOLDERS = [
  "<!--{{SCENE}}-->",
  "<!--{{APPEARANCE}}-->",
  "<!--{{STEPS}}-->",
];

/**
 * Every `src=` / `href=` target on a real `<script>` / `<link>` tag, with the
 * `?v=` cache stamp removed.
 *
 * Comments are stripped first, and that is not a detail: these pages' head
 * comments list their entry scripts by path, so a plain `html.includes(ref)`
 * finds the script named in the prose after the actual `<script>` tag has been
 * deleted. The first version of this guard did exactly that and passed a page
 * with `scene-depth.js` removed — the same "mentioned in a comment" trap
 * `page_shell._assert_placeholders_are_real` exists to catch for placeholders.
 */
function referencedAssets(html) {
  const withoutComments = html.replace(/<!--[\s\S]*?-->/g, "");
  const refs = new Set();
  for (const match of withoutComments.matchAll(
    /<(?:script|link)\b[^>]*?\b(?:src|href)="([^"]+)"/g,
  )) {
    refs.add(match[1].split("?")[0]);
  }
  return refs;
}

/** Entry-page filenames registered in page_shell.SCENE_VALUES_BY_PAGE. */
function registeredScenePages() {
  const source = fs.readFileSync(PAGE_SHELL, "utf8");
  const keys = new Set();
  // Keys sit at the dict's own indent level — four spaces, then a quoted filename.
  for (const m of source.matchAll(/^ {4}'([A-Za-z0-9._-]+\.html)':\s*\{/gm)) {
    keys.add(m[1]);
  }
  return keys;
}

/** Entry-page filenames listed in commissioning.RAIL_PAGES. */
function registeredRailPages(source) {
  const block = source.match(/RAIL_PAGES = frozenset\(\s*\{([\s\S]*?)\}\s*\)/);
  if (!block) return null;
  return new Set([...block[1].matchAll(/'([A-Za-z0-9._-]+\.html)'/g)].map((m) => m[1]));
}

/** The labels of the chain as commissioning.py declares them. */
function declaredStepLabels(source) {
  const block = source.match(/STEP_LABELS = \(([^)]*)\)/);
  if (!block) return null;
  return [...block[1].matchAll(/'([^']*)'/g)].map((m) => m[1]);
}

/**
 * `rail_states` split into `{ page, body }` per `if page == '…':` branch.
 *
 * The body is the source text of that branch, which is all this guard needs:
 * which gate it lights up, and whether it marks anything skipped or blocked.
 */
function railBranches(source) {
  const fn = source.match(/^def rail_states\([\s\S]*?(?=\n\S)/m);
  if (!fn) return null;
  const branches = [];
  const marker = /^ {4}if page == '([A-Za-z0-9._-]+\.html)':$/gm;
  const hits = [...fn[0].matchAll(marker)];
  hits.forEach((hit, index) => {
    const start = hit.index + hit[0].length;
    const end = index + 1 < hits.length ? hits[index + 1].index : fn[0].length;
    branches.push({ page: hit[1], body: fn[0].slice(start, end) });
  });
  return branches;
}

/**
 * The state tuple a branch returns, as raw tokens.
 *
 * Balanced-parenthesis scan rather than `/return \(([^)]*)\)/`: the two branches
 * that decide 登录 call `_signin_state(admin_session)`, and a naive `[^)]*` stops
 * at that inner `)` — reporting a five-gate branch as a two-gate one.
 */
function returnedStates(body) {
  const start = body.indexOf("return (");
  if (start < 0) return null;
  let depth = 0;
  let end = -1;
  for (let i = start + "return ".length; i < body.length; i += 1) {
    if (body[i] === "(") depth += 1;
    else if (body[i] === ")") {
      depth -= 1;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end < 0) return null;
  return body
    .slice(start + "return (".length, end)
    .split(",")
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
}

const problems = [];
const commissioningSource = fs.readFileSync(COMMISSIONING, "utf8");
const scenePages = registeredScenePages();
const railPages = registeredRailPages(commissioningSource);
const stepLabels = declaredStepLabels(commissioningSource);
const branches = railBranches(commissioningSource);

// ── 门链本身 ──────────────────────────────────────────────────────────────
if (!stepLabels) {
  problems.push("commissioning.py 里找不到 STEP_LABELS 元组");
} else if (stepLabels.join("→") !== STEPS.join("→")) {
  problems.push(
    `commissioning.STEP_LABELS 与门链不符：「${stepLabels.join(" → ")}」，应为「${STEPS.join(" → ")}」`,
  );
}
if (!railPages) problems.push("commissioning.py 里找不到 RAIL_PAGES");
if (!branches) problems.push("commissioning.py 里找不到 rail_states 函数");

// ── 每个页面的外壳与插入点 ────────────────────────────────────────────────
for (const [page, expectation] of Object.entries(PAGES)) {
  const file = path.join(FRONTEND, page);
  let html;
  try {
    html = fs.readFileSync(file, "utf8");
  } catch {
    problems.push(`${page}: 文件不存在（frontend/${page}）`);
    continue;
  }

  const assets = referencedAssets(html);
  for (const ref of [...REQUIRED_LINKS, ...REQUIRED_SCRIPTS]) {
    if (!assets.has(ref)) problems.push(`${page}: 少了 ${ref}`);
  }
  for (const holder of REQUIRED_PLACEHOLDERS) {
    const count = html.split(holder).length - 1;
    if (count !== 1) {
      problems.push(
        `${page}: ${holder} 占位符应恰好出现 1 次，实际 ${count} 次` +
          `（出现 2 次通常意味着说明注释里又写了一遍，注入的标记会落进那条注释）`,
      );
    }
  }

  // 开通轨必须由后端填：页面里留下写死的 <ol> 就等于有一条不受访问者影响的旧轨。
  const hardcoded = html.match(/<ol\b[^>]*\bclass="[^"]*\bhos-steps\b/g) || [];
  if (hardcoded.length) {
    problems.push(
      `${page}: 页面里有 ${hardcoded.length} 条写死的 <ol class="hos-steps">；` +
        "开通轨由 commissioning.py 按请求填（见 <!--{{STEPS}}--> 占位符）",
    );
  }

  // ── 左侧文案登记 ────────────────────────────────────────────────────────
  if (!scenePages.has(page)) {
    problems.push(`${page}: 未登记进 page_shell.SCENE_VALUES_BY_PAGE（首次访问会 500）`);
  }

  const gate = "current" in expectation ? expectation.current : expectation.blocked;
  if (!railPages || !branches) continue;

  if (!railPages.has(page)) {
    problems.push(`${page}: 未登记进 commissioning.RAIL_PAGES（这一页不会有开通轨）`);
    continue;
  }
  const branch = branches.find((candidate) => candidate.page === page);
  if (!branch) {
    problems.push(`${page}: commissioning.rail_states 里没有它这一页的分支（首次访问会 500）`);
    continue;
  }

  const states = returnedStates(branch.body);
  if (!states || states.length !== STEPS.length) {
    problems.push(
      `${page}: rail_states 的分支应返回 ${STEPS.length} 个状态，实际 ` +
        `${states ? states.length : 0} 个（与 STEP_LABELS 一一对应）`,
    );
  }

  // 本页那一道门必须被点亮：写错一格，用户就会读成「还差几步」里的另一步。
  const current = states ? states.indexOf("CURRENT") : -1;
  if ("current" in expectation) {
    if (current !== gate) {
      problems.push(
        `${page}: 应点亮第 ${gate + 1} 步（${STEPS[gate]}），实际点亮第 ` +
          `${current + 1} 步（${current >= 0 ? STEPS[current] : "无"}）`,
      );
    }
  } else if (current >= 0) {
    problems.push(
      `${page}: 降级态不该点亮任何一步 —— 它不是一道门，只知道哪一道被关上了（第 ${gate + 1} 步）`,
    );
  }

  // 被关上的那一道门只能有一个，且只能在降级态里出现。
  const blocked = branch.body.includes("BLOCKED");
  if ("blocked" in expectation) {
    const statesBlocked = states ? states.indexOf("BLOCKED") : -1;
    if (statesBlocked !== gate) {
      problems.push(
        `${page}: 应把第 ${gate + 1} 步（${STEPS[gate]}）标为 is-blocked，实际标在第 ` +
          `${statesBlocked + 1} 步（${statesBlocked >= 0 ? STEPS[statesBlocked] : "无"}）`,
      );
    }
  } else if (blocked) {
    problems.push(`${page}: 只有降级态会标 is-blocked（「走不动了」不是「还没走到」）`);
  }

  // 「不适用」只给站在登录门之后、且同时服务两种访问者的那两页，而且必须走同一个
  // helper —— 这一格是唯一因访问者而异的门，规则散成两处迟早会有一处走样。
  const usesHelper = branch.body.includes(SIGNIN_HELPER);
  if (usesHelper !== SKIPPED_BRANCHES.has(page)) {
    problems.push(
      usesHelper
        ? `${page}: 不该用 ${SIGNIN_HELPER}() —— 站在这一页的访问者还要走「登录」这道门`
        : `${page}: 它在登录门之后同时服务管理员与墙面板，登录那一格应由 ${SIGNIN_HELPER}() 决定`,
    );
  }
  // 「配对」那一格在恢复页看设备 Cookie：一块已经配好的屏被标成「还没配对」，等于把
  // 「你下一步该做什么」指错。`device` 只该被这一页读（其余四页的配对状态由路由保证）。
  const usesDevice = branch.body.includes("device");
  if (usesDevice !== (page === "license-recovery.html")) {
    problems.push(
      usesDevice
        ? `${page}: 不该由 device 决定读数 —— 这一页的配对状态由路由保证`
        : `${page}: 「配对」那一格要看 device（已配好的屏是已过，不是还没配对）`,
    );
  }
}

// ── 反向：登记了却对不上文件的条目 ────────────────────────────────────────
for (const [label, pages, why] of [
  ["page_shell.SCENE_VALUES_BY_PAGE", scenePages, "左侧文案"],
  ["commissioning.RAIL_PAGES", railPages, "开通轨读数"],
]) {
  if (!pages) continue;
  for (const page of pages) {
    if (!(page in PAGES)) {
      problems.push(
        `${label} 登记了 ${page}，但它不在入口页清单里（${why}）；` +
          `工具只认 ${Object.keys(PAGES).join(" / ")}`,
      );
    }
  }
}
if (branches) {
  for (const branch of branches) {
    if (!(branch.page in PAGES)) {
      problems.push(`commissioning.rail_states 里有一个多余的 ${branch.page} 分支`);
    }
  }
}

// ── CSS 与后端状态名必须对得上 ────────────────────────────────────────────
const panelCss = fs.readFileSync(PANEL_CSS, "utf8");
for (const state of RAIL_STATES) {
  if (!panelCss.includes(`.hos-steps__item.${state}`)) {
    problems.push(
      `design/scene/panel.css 里没有 .hos-steps__item.${state} 的规则` +
        "（后端会填这个类，页面会安静地少一种读法）",
    );
  }
  if (!commissioningSource.includes(`'${state}'`)) {
    problems.push(`commissioning.py 里没有 ${state} 这个状态的常量`);
  }
}
for (const [placeholder, why] of [
  ["STEPS_PLACEHOLDER", "入口页的插入点"],
  ["rail_markup", "把状态渲染成标记"],
  ["_indent_at", "按插入点的缩进对齐"],
]) {
  if (!fs.readFileSync(PAGE_SHELL, "utf8").includes(placeholder)) {
    problems.push(`page_shell.py 里找不到 ${placeholder}（${why}）`);
  }
}

// 注入块要按插入点的缩进逐行对齐，而**替换键必须带上那段缩进**：只换占位符的话，
// 插入点自己前面的空格会留在原地，于是 `<ol>` 比 `<li>` 还深两格 —— 页面上只是
// 「这块标记看着有点歪」，没有任何东西会报错。
const pageShellSource = fs.readFileSync(PAGE_SHELL, "utf8");
if (!pageShellSource.includes("indent + STEPS_PLACEHOLDER")) {
  problems.push(
    "page_shell.py 的替换键不是 `indent + STEPS_PLACEHOLDER`；只换占位符会让注入块首行多一层缩进",
  );
}

for (const fragment of ITEM_TEMPLATE_FRAGMENTS) {
  if (!commissioningSource.includes(fragment)) {
    problems.push(
      `commissioning.rail_markup 的条目模板里找不到 ${fragment}；` +
        "状态与文案必须各归各位（写反了会渲染成 class=\"… 初始化\" 配文本 is-current，仍然像一条轨）",
    );
  }
}
const mainSource = fs.readFileSync(MAIN_PY, "utf8");
for (const symbol of ["has_rail", "rail_states"]) {
  if (!mainSource.includes(symbol)) {
    problems.push(`main.py 的 render_page 里没用上 commissioning.${symbol}`);
  }
}

if (problems.length) {
  console.error("入口页开通过程已经不一致：");
  for (const line of problems) console.error(`  ${line}`);
  console.error("");
  console.error("五个入口页是同一条门链上的五道门（main.py 的门禁顺序）：");
  console.error(`  ${STEPS.join(" → ")}`);
  console.error("轨道读数由 backend/http/commissioning.py 按访问者填，");
  console.error("状态语义见 design/scene/panel.css 的「开通路径」段。");
  process.exit(1);
}

console.log(
  `entry pages agree on the gate chain, the rail and the shell ` +
    `(${Object.keys(PAGES).length} pages, ${STEPS.length} gates, ${RAIL_STATES.length} states)`,
);
