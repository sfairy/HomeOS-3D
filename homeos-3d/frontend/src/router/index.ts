/** 路由表：与后端页面级鉴权一一对应（服务端仍是鉴权权威，这里只负责选视图）。 */

import { createRouter, createWebHistory, type RouteRecordRaw } from "vue-router";
import { EMBED_BASE } from "../embed-base.js";
import { PAGE_ASSETS } from "../page-assets.js";

// 匿名视图静态引入：它们的 chunk 会出现在 SPA 入口的 modulepreload/all 依赖里，从而被
// 构建期匿名白名单收录 —— 未登录访问登录页时也必须能拿到自己的 JS。
import LoginView from "../views/LoginView.vue";
import SetupView from "../views/SetupView.vue";
import PairView from "../views/PairView.vue";
import LicenseView from "../views/LicenseView.vue";
import LicenseRecoveryView from "../views/LicenseRecoveryView.vue";

// 认证后视图懒加载：这些 chunk 不进匿名白名单，继续受后端 premium_asset 登录+授权保护。
const EditorView = () => import("../views/EditorView.vue");
const StudioView = () => import("../views/StudioView.vue");
const DisplayView = () => import("../views/DisplayView.vue");

export const routes: RouteRecordRaw[] = [
  {
    path: "/setup",
    name: "setup",
    component: SetupView,
    meta: { assets: PAGE_ASSETS.setup },
  },
  {
    path: "/login",
    name: "login",
    component: LoginView,
    meta: { assets: PAGE_ASSETS.login },
  },
  {
    path: "/pair",
    name: "pair",
    component: PairView,
    meta: { assets: PAGE_ASSETS.pair },
  },
  {
    path: "/license",
    name: "license",
    component: LicenseView,
    meta: { assets: PAGE_ASSETS.license },
  },
  {
    path: "/license-recovery",
    name: "license-recovery",
    component: LicenseRecoveryView,
    meta: { assets: PAGE_ASSETS.licenseRecovery },
  },
  {
    path: "/",
    name: "editor",
    component: EditorView,
    meta: { assets: PAGE_ASSETS.editor },
  },
  {
    path: "/3d-studio",
    name: "studio",
    component: StudioView,
    meta: { assets: PAGE_ASSETS.studio },
  },
  {
    // 后端 get_stage() 直接把本 SPA 入口作为 stage 页下发；同一 StudioView 在此路径下
    // 以 `interaction3d-stage` 模式渲染。
    path: "/api/v1/modules/interaction3d/stage.html",
    name: "stage",
    component: StudioView,
    meta: { assets: PAGE_ASSETS.studio },
  },
  {
    path: "/display/:projectId",
    name: "display",
    component: DisplayView,
    meta: { assets: PAGE_ASSETS.display },
  },
  {
    // 后端是 `/homeos/{project_name:path}`（允许名字含 `/`），display.ts 也按
    // `pathname.slice("/homeos/".length)` 整体取用，所以这里的参数必须能吃下斜杠；
    // 写成单段的 `:name` 会让含 `/` 的项目名落到 catch-all。
    path: "/homeos/:name(.*)",
    name: "homeos",
    component: DisplayView,
    meta: { assets: PAGE_ASSETS.display },
  },
  { path: "/:pathMatch(.*)*", redirect: "/" },
];

export const router = createRouter({
  // 嵌入模式（/embed/<token>/…）下 prefix 必须当 base，见 embed-base.ts。
  history: createWebHistory(EMBED_BASE || "/"),
  routes,
  scrollBehavior() {
    return { top: 0 };
  },
});

export default router;
