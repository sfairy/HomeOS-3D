/**
 * 每个路由对应的 `<head>` 资产。
 *
 * 按路由在运行时同步到 `<head>`。样式表顺序即数组顺序 —— 例如
 * appearance.css 必须排在 auth/scene 四片之后（同为 :root 令牌，后加载的赢）。
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

const AUTH_STYLESHEETS = [
  "/static/auth/scene/fonts.css",
  "/static/auth/scene/page.css",
  "/static/auth/scene/scene.css",
  "/static/auth/scene/panel.css",
  "/static/appearance.css",
];

/** 认证相关页（初始化/登录/配对/激活/恢复）共用一套场景样式与视口。 */
function authPage(title: string, viewport = "width=device-width,initial-scale=1"): PageAssets {
  return {
    title,
    viewport,
    themeColor: "#050912",
    manifest: "/static/assets/manifest/manifest-h5.webmanifest",
    stylesheets: AUTH_STYLESHEETS,
  };
}

export const PAGE_ASSETS = {
  setup: authPage("初始化 · HomeOS"),
  login: authPage("登录 · HomeOS"),
  pair: authPage("配对中控设备 · HomeOS", "width=device-width,initial-scale=1,viewport-fit=cover"),
  license: authPage("激活授权 · HomeOS"),
  licenseRecovery: authPage("连接状态 · HomeOS"),

  editor: {
    title: "HomeOS",
    viewport: "width=1020,user-scalable=yes",
    themeColor: "#172029",
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

export type PageAssetsKey = keyof typeof PAGE_ASSETS;

const MANAGED_ATTR = "data-spa-managed";
// 用 href 后缀而不是全等：嵌入模式（/embed/<token>/…）下入口里的 href 会被后端改写、
// embed-runtime 也会给动态设置的 href 补前缀，全等匹配会落空。
// 后缀匹配把受管样式表锚定在 SPA 外壳样式之后，两种环境下顺序都成立。
const ANCHOR_SELECTOR = 'link[href$="/static/spa-shell.css"]';

/** 让受管样式表按 `urls` 的顺序、紧跟在 SPA 外壳样式之后挂载。 */
function applyStylesheets(urls: readonly string[]): void {
  const anchor = document.head.querySelector(ANCHOR_SELECTOR);
  const desired = new Set(urls);
  for (const el of [
    ...document.head.querySelectorAll<HTMLLinkElement>(`link[${MANAGED_ATTR}]`),
  ]) {
    if (!desired.has(el.getAttribute("href") || "")) el.remove();
  }
  let cursor: Element | null = anchor;
  for (const url of urls) {
    let el = document.head.querySelector<HTMLLinkElement>(
      `link[${MANAGED_ATTR}][href="${url}"]`,
    );
    if (!el) {
      el = document.createElement("link");
      el.rel = "stylesheet";
      el.href = url;
      el.setAttribute(MANAGED_ATTR, "css");
    }
    if (cursor) cursor.after(el);
    else document.head.appendChild(el);
    cursor = el;
  }
}

function setMeta(id: string, attr: "content", value: string): void {
  const el = document.getElementById(id);
  if (el) el.setAttribute(attr, value);
}

/** 把一组页面资产应用到当前文档。 */
export function applyPageAssets(assets: PageAssets | undefined): void {
  if (!assets) return;
  document.title = assets.title;
  setMeta("spa-viewport", "content", assets.viewport);
  setMeta("spa-theme-color", "content", assets.themeColor);
  const manifest = document.getElementById("spa-manifest");
  if (manifest) manifest.setAttribute("href", assets.manifest);
  applyStylesheets(assets.stylesheets);
}
