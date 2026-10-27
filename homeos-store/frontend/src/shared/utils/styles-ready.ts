/**
 * 「样式已就位」的等待工具（商店端）。
 *
 * 商店的首屏样式分两段：
 *   1. `theme.css`（+ design-tokens）阻塞加载 —— 首帧只有令牌与深墨底；
 *   2. 其余 8 张业务样式表用 `media="print"` 先下载、**齐了再一次切 `all`**
 *      （见 `index.html` 的内联脚本），并置 `html[data-styles-ready]`。
 *
 * `main.ts` 原来在 `mount` 之后一个 `nextTick` 就揭掉 `#store-boot-shell`，
 * 等于在业务样式还没到齐时就把遮罩拿掉 —— 用户看到的正是「裸排版 → 重排成完整样式」那一下。
 *
 * 现在 `main.ts` 等这里的 promise（带硬上限），再揭遮罩；`admin.css` 也走同一套门控：
 * 后台第一屏依赖它上色，而它是 App.vue 动态注入的。
 */

/** 内联脚本置位的就绪属性（`html[data-styles-ready="1"]`）。 */
const READY_ATTR = "data-styles-ready";

/** 内联脚本揭幕成功后派发的事件名。 */
const READY_EVENT = "hos:styles-ready";

/**
 * 首屏样式表迟迟不到时的硬上限。
 *
 * 必须与 `index.html` 里的 8s 一致：那边超时会一次性揭幕，这边若等得更久，
 * 占位壳就会比样式多留一会儿（黑屏转圈），比「带旧样式渲染」更糟。
 *
 * 为什么敢等到 8s：占位壳是**不透明**的，多等一会儿用户只看到转圈；
 * 而在样式只到一半时揭幕，用户会看到「裸排版 → 重排成完整样式」两次布局。
 * 实测 Slow 3G + 4x CPU 下 8 张表约 4~5s 齐，3s 的旧上限必然踩到半套样式。
 */
const STYLES_TIMEOUT_MS = 8000;

/** 后台样式表同样给一个上限：它只影响后台首屏，不能拖住整个 SPA。 */
const ADMIN_STYLES_TIMEOUT_MS = 3000;

/** 后台样式表的 `<link>` 选择器（App.vue 与本模块共用同一个标记）。 */
const ADMIN_SELECTOR = "link[data-admin-stylesheet]";

/** 首屏样式是否已经揭幕。 */
export function isStylesReady(): boolean {
  return document.documentElement.getAttribute(READY_ATTR) === "1";
}

/**
 * 等首屏样式揭幕。
 *
 * 三种出口：已经就绪（同步 resolve）、事件到达、3s 超时。**永不 reject**。
 * 已就绪时会多等一个渲染帧：内联脚本置位与样式生效在同一帧内，若立刻揭遮罩，
 * 有可能先看到一帧「遮罩没了但样式还没算」。
 */
export function waitForDeferredStyles(): Promise<void> {
  if (typeof document === "undefined") return Promise.resolve();
  const ready = new Promise<void>((resolve) => {
    if (isStylesReady()) {
      resolve();
      return;
    }
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      document.removeEventListener(READY_EVENT, finish);
      window.clearTimeout(timer);
      resolve();
    };
    const timer = window.setTimeout(finish, STYLES_TIMEOUT_MS);
    document.addEventListener(READY_EVENT, finish);
  });
  return ready.then(nextFrame);
}

/** 一个渲染帧；无 rAF 的环境（老 Safari / 测试）退化成 setTimeout 0。 */
export function nextFrame(): Promise<void> {
  if (typeof requestAnimationFrame !== "function") {
    return new Promise<void>((resolve) => window.setTimeout(resolve, 0));
  }
  return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

/**
 * 确保后台样式表已加载并可写。
 *
 * @returns 已就绪 / 加载失败 / 3s 超时都 resolve
 */
export function ensureAdminStylesheet(): Promise<void> {
  if (typeof document === "undefined") return Promise.resolve();
  let link = document.head.querySelector<HTMLLinkElement>(ADMIN_SELECTOR);
  if (!link) {
    link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "/store-static/admin.css";
    link.dataset.adminStylesheet = "1";
    document.head.appendChild(link);
  }
  if (link.sheet) return Promise.resolve();
  const el = link;
  return new Promise<void>((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      el.removeEventListener("load", finish);
      el.removeEventListener("error", finish);
      window.clearTimeout(timer);
      resolve();
    };
    const timer = window.setTimeout(finish, ADMIN_STYLES_TIMEOUT_MS);
    el.addEventListener("load", finish);
    el.addEventListener("error", finish);
  });
}

/** 摘掉后台样式表（离开后台区域时调用；App.vue 的 route watcher 负责）。 */
export function releaseAdminStylesheet(): void {
  document.head.querySelector<HTMLLinkElement>(ADMIN_SELECTOR)?.remove();
}

/** 当前页面是否是后台路由（`main.ts` 首屏门控要用）。 */
export function needsAdminStyles(pathname: string): boolean {
  return pathname === "/admin" || pathname.startsWith("/admin/");
}
