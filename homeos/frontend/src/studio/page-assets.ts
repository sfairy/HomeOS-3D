/**
 * 每个路由对应的 `<head>` 资产。
 *
 * 按路由在运行时同步到 `<head>`（``App.vue`` 的 route.name watcher）。这**不是**旧的
 * 「整页跳转换装」：样式表按声明安装 / 卸载，离开 studio 路由时 ``PAGE_ASSETS.shell``
 * （空样式表清单）会把 display.css / renderer.css / app.css 清掉，避免残留到设备页。
 * 样式表顺序即数组顺序 —— 例如 appearance.css 必须排在 auth/scene 四片之后
 * （同为 :root 令牌，后加载的赢）。
 */

export interface PageAssets {
  /** document.title。 */
  title: string;
  /** viewport meta 的 content。 */
  viewport: string;
  /** theme-color meta 的 content。 */
  themeColor: string;
  /** PWA manifest 路径。 */
  manifest: string;
  /** 依赖顺序的样式表清单。 */
  stylesheets: string[];
}

/** 认证场景四片：已在 index.html 预装（data-spa-managed），冷开无 FOUC。 */
const AUTH_SCENE_STYLESHEETS = [
  "/static/auth/scene/fonts.css",
  "/static/auth/scene/page.css",
  "/static/auth/scene/scene.css",
  "/static/auth/scene/panel.css",
] as const;

/**
 * 站点配色令牌（`--hb-accent-rgb` / `--hb-lumen-rgb` / `--hb-aura-rgb` / `--hb-eco-rgb`）。
 *
 * 原先它只在运行时后置加载，而 page.css 里 `--hos-tone-rgb: var(--hb-accent-rgb)` **没有兜底值**
 * —— 实测首帧到约 400ms 之间 `--hos-tone-rgb` 恒为 UNDEF，`rgb(var(--hos-tone-rgb), …)`
 * 整片解析失败、场景发黑，令牌落地后整屏「弹」出来。现在与场景四片一起在 index.html 预装，
 * 运行时复用同一批节点。**顺序即数组顺序**：它必须排在场景四片之后（同为 `:root` 令牌，后加载的赢）。
 */
const APPEARANCE_STYLESHEET = "/static/appearance.css";

/** index.html 预装清单（顺序必须与这里逐条一致，否则运行时会把表摘下来重挂）。 */
const AUTH_STYLESHEETS = [
  ...AUTH_SCENE_STYLESHEETS,
  APPEARANCE_STYLESHEET,
];

/** 认证相关页（初始化/登录/激活/恢复）共用一套场景样式与视口。 */
function authPage(
  title: string,
  viewport = "width=device-width,initial-scale=1,viewport-fit=cover",
): PageAssets {
  return {
    title,
    viewport,
    themeColor: "#050912",
    manifest: "/static/assets/manifest/manifest-h5.webmanifest",
    stylesheets: AUTH_STYLESHEETS,
  };
}

export const PAGE_ASSETS = {
  /**
   * 普通 homeos 路由（设备/事件/安防/设置…）的默认档位。
   *
   * 这些路由不声明 `meta.assets`，必须回落到「零额外样式表 + 标准移动端 viewport」
   * 的档位，否则 studio 的样式表（display.css / renderer.css / app.css）与 1020px
   * viewport 会残留到非 studio 页面。
   */
  shell: {
    title: "HomeOS",
    viewport: "width=device-width,initial-scale=1,viewport-fit=cover",
    themeColor: "#050912",
    manifest: "/static/assets/manifest/manifest-h5.webmanifest",
    stylesheets: [] as any[],
  } satisfies PageAssets,

  setup: authPage("注册 · HomeOS"),
  register: authPage("注册 · HomeOS"),
  login: authPage("登录 · HomeOS"),
  license: authPage("激活授权 · HomeOS"),
  licenseRecovery: authPage("连接状态 · HomeOS"),

  editor: {
    title: "仪表盘编辑器 · HomeOS",
    viewport: "width=device-width,initial-scale=1,viewport-fit=cover",
    themeColor: "#080d18",
    manifest: "/static/assets/manifest/manifest-h5.webmanifest",
    stylesheets: [
      "/static/global-log.css",
      "/static/app.css",
      "/static/renderer/renderer.css",
      "/static/modules/interaction3d/bridge.css",
      "/static/flow-line-editor.css",
    ],
  } satisfies PageAssets,

  studio: {
    title: "户型图绘制",
    viewport: "width=device-width,initial-scale=1",
    themeColor: "#111820",
    manifest: "/static/assets/manifest/manifest-h5.webmanifest",
    stylesheets: ["/static/3d-studio/studio.css"],
  } satisfies PageAssets,

  display: {
    title: "HomeOS Display",
    viewport: "width=device-width,initial-scale=1,viewport-fit=cover",
    themeColor: "#172029",
    manifest: "/static/assets/manifest/dashboard.webmanifest",
    stylesheets: [
      "/static/renderer/renderer.css",
      "/static/display.css",
      "/static/display-boot.css",
      "/static/modules/interaction3d/bridge.css",
      "/static/apple-install-guide.css",
    ],
  } satisfies PageAssets,
} as const;

const MANAGED_ATTR = "data-spa-managed";
// 用 href 后缀而不是全等：入口里的 href 可能带查询串或片段，全等匹配会落空。
// 后缀匹配把受管样式表锚定在 SPA 外壳样式之后，两种环境下顺序都成立。
const ANCHOR_SELECTOR = 'link[href$="/static/spa-shell.css"]';
/**
 * 锚点缺失时的兜底落点：第一张**非受管**样式表（即 Vite 打包进来的那张）。
 *
 * 路线由外观（app.css / display.css / 3d-studio/studio.css…）必须排在打包 CSS **之前**：
 * 一旦被追加到 `<head>` 末尾，它们就晚于 Vite CSS，于是「后加载的赢」反过来成立，
 * studio-chrome.css 只能靠 52 条 `!important` 硬压（历史上正是如此）。宁可排前面，
 * 也不要制造这种隐式优先级倒挂。
 */
const UNMANAGED_STYLESHEET_SELECTOR = `link[rel="stylesheet"]:not([${MANAGED_ATTR}])`;

/** 当前 <head> 里由本模块挂载的受管样式表 href 列表（文档顺序）。 */
export function listManagedStylesheets(): string[] {
  return [...document.head.querySelectorAll<HTMLLinkElement>(`link[${MANAGED_ATTR}]`)]
    .map((el) => el.getAttribute("href") || "")
    .filter(Boolean);
}

/**
 * 跳过一切**非元素**节点（空白文本、注释），取其后第一个元素兄弟。
 *
 * 必须连注释一起跳过：index.html 里锚点与场景四片之间就夹着一段说明注释，
 * 「只看下一个兄弟」会把它们判成「不在位」而整体摘挂一次 —— 正是要消除的那种闪烁。
 */
function nextMeaningfulSibling(node: Node): Node | null {
  let cur = node.nextSibling;
  while (cur && cur.nodeType !== Node.ELEMENT_NODE) {
    cur = cur.nextSibling;
  }
  return cur;
}

/** 跳过一切非元素节点（空白文本、注释），取其前第一个元素兄弟。 */
function previousMeaningfulSibling(node: Node): Node | null {
  let cur = node.previousSibling;
  while (cur && cur.nodeType !== Node.ELEMENT_NODE) {
    cur = cur.previousSibling;
  }
  return cur;
}

/**
 * 元素是否**已经**落在期望位置上（`ref` 之后 / `boundary` 之前 / `<head>` 末尾）。
 *
 * 「已在位就不动」不是微优化，而是消除入户页闪烁的关键：`Node.after()` / `insertBefore()`
 * 即使目标位置与当前位置相同，语义仍是「先摘除再插入」，而样式表被摘除的那一帧它的规则
 * 立即失效。实测把 scene.css 摘掉 3 帧，`.hos-scene__sky` 的计算值就变成
 * `background-image: none`（天空 / 极光 / 星野整片消失 = 画面发黑）；真实链路里 5 张表
 * 被整体摘下再挂回还会让 `--hos-tone-rgb` 一度变空、link 重新进入 pending。
 * 入口页每次路由切换都会走到这里，所以「零摘挂」是硬要求。
 */
function isInPlace(
  el: Element,
  ref: Element | null,
  boundary: Element | null,
): boolean {
  if (!el.isConnected) return false;
  if (ref) return nextMeaningfulSibling(ref) === el;
  if (boundary) return previousMeaningfulSibling(boundary) === el;
  /* 既没有锚点也没有兜底边界（精简入口 / 独立页）：只要求它已经在 <head> 里，
     相对顺序由调用方的游标逐条保证 —— 此时再强行搬到末尾只会白白制造摘挂。 */
  return el.parentNode === document.head;
}

/** 让受管样式表按 `urls` 的顺序、紧跟在 SPA 外壳样式之后挂载（已在位则一条 DOM 变更都不产生）。 */
function applyStylesheets(urls: readonly string[]): void {
  const anchor = document.head.querySelector(ANCHOR_SELECTOR);
  const desired = new Set(urls);
  for (const el of [
    ...document.head.querySelectorAll<HTMLLinkElement>(`link[${MANAGED_ATTR}]`),
  ]) {
    if (!desired.has(el.getAttribute("href") || "")) el.remove();
  }
  /**
   * 兜底边界：`spa-shell.css` 不在（精简入口 / 独立页）时插到第一张非受管样式表**之前**，
   * 而不是 `appendChild` 到 `<head>` 末尾 —— 见 UNMANAGED_STYLESHEET_SELECTOR 的说明。
   */
  const boundary = anchor ?? document.head.querySelector(UNMANAGED_STYLESHEET_SELECTOR);
  /**
   * 逐个节点就位，**只移动真正不在位的那个**。
   *
   * 之前是「先整组判断、只要有一个不在位就把整组重新 append 一遍」，于是跨壳换装时
   * （旧表靠 keepStylesheets 保留 + 新表追加）已经就位的场景四片也被连坐摘挂一次。
   * 逐个判断后：就位的原地不动，新增的插到游标之后，顺序错的才搬。
   */
  let cursor: Element | null = anchor;
  for (const url of urls) {
    // 预装表可能已在 index.html 中（同 href）；复用节点，避免重复 <link> 与二次下载闪烁。
    let el =
      document.head.querySelector<HTMLLinkElement>(
        `link[${MANAGED_ATTR}][href="${url}"]`,
      ) ||
      document.head.querySelector<HTMLLinkElement>(
        `link[rel="stylesheet"][href="${url}"]`,
      );
    if (!el) {
      el = document.createElement("link");
      el.rel = "stylesheet";
      // 必须写 attribute 而不是 IDL 的 `el.href`：后者会被解析成**绝对 URL**，于是
      // 上面的 querySelector 与 `desired.has(getAttribute('href'))` 两条（都用声明里的
      // 相对路径比对）下一轮全部落空 —— 表会被判成「不在期望集合里」反复摘掉重挂。
      el.setAttribute("href", url);
    }
    el.setAttribute(MANAGED_ATTR, "css");
    if (!isInPlace(el, cursor, boundary)) {
      if (cursor) cursor.after(el);
      else if (boundary) boundary.before(el);
      else document.head.appendChild(el);
    }
    cursor = el;
  }
}

function setMeta(id: string, attr: "content", value: string): void {
  const el = document.getElementById(id);
  if (el) el.setAttribute(attr, value);
}

export type ApplyPageAssetsOptions = {
  /**
   * 过渡期间额外保留的样式表（通常是离开页仍在 DOM 里时的旧清单）。
   * 新路由样式会立刻装上，旧表延后到 leave 结束再卸，避免滑动背景里露出无样式 HTML。
   */
  keepStylesheets?: readonly string[];
};

/** 把一组页面资产应用到当前文档。 */
export function applyPageAssets(
  assets: PageAssets | undefined,
  options?: ApplyPageAssetsOptions,
): void {
  if (!assets) return;
  document.title = assets.title;
  setMeta("spa-viewport", "content", assets.viewport);
  setMeta("spa-theme-color", "content", assets.themeColor);
  const manifest = document.getElementById("spa-manifest");
  if (manifest) manifest.setAttribute("href", assets.manifest);
  const keep = options?.keepStylesheets ?? [];
  applyStylesheets(
    keep.length > 0
      ? [...new Set([...keep, ...assets.stylesheets])]
      : assets.stylesheets,
  );
}
