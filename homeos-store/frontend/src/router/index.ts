/** 路由表：前台商店、后台工作台与首次初始化。 */

import { createRouter, createWebHistory, type RouteRecordRaw } from "vue-router";
import { serverAuthState } from "@store/shared/stores/session";
// 跨域只走域根 barrel：admin 的会话态给后台闸门，storefront 的三个首屏页面给路由表。
import { useAdminStore } from "@store/features/admin";
import { StoreLayout, HomeView, AuthView } from "@store/features/storefront";
import { resolveAdminGate } from "./admin-guard";

const ProductsView = () => import("@store/features/storefront/views/ProductsView.vue");
const ItemView = () => import("@store/features/storefront/views/ItemView.vue");
const AccountView = () => import("@store/features/storefront/views/AccountView.vue");
const ReferralsView = () => import("@store/features/storefront/views/ReferralsView.vue");

const AdminLayout = () => import("@store/features/admin/views/AdminLayout.vue");
const SetupView = () => import("@store/views/SetupView.vue");

/** 需要在挂载前就确认登录态的页面：`meta.requiresAuth`。 */
const ACCOUNT_META = { storePage: "account", requiresAuth: true };

const routes: RouteRecordRaw[] = [
  {
    path: "/",
    component: StoreLayout,
    children: [
      { path: "", name: "home", component: HomeView, meta: { storePage: "home" } },
      {
        path: "products",
        name: "products",
        component: ProductsView,
        meta: { storePage: "products" },
      },
      {
        path: "item/:productId",
        name: "item",
        component: ItemView,
        props: true,
        meta: { storePage: "item" },
      },
      {
        path: "user/dashboard/index",
        name: "account",
        component: AccountView,
        meta: ACCOUNT_META,
      },
      {
        // 旧路径兼容：不再单独挂页面，统一进账号中心。
        path: "user/index/query",
        redirect: { name: "account" },
      },
      {
        path: "user/referrals",
        name: "referrals",
        component: ReferralsView,
        meta: { storePage: "referrals", requiresAuth: true },
      },
    ],
  },
  {
    path: "/user/authentication/:mode(login|register|forget)",
    name: "auth",
    component: AuthView,
    props: true,
  },
  {
    // 后台整片区域都要先确认管理员会话：`requiresAuth` 让游客直接换页（连
    // AdminLayout 的 chunk 都不下），`area: "admin"` 让守卫在放行前跑一次
    // `admin.bootstrap()`，把「有 cookie 但不是管理员」也挡在 bundle 之外。
    path: "/admin/:page?/:tab?",
    name: "admin",
    component: AdminLayout,
    props: true,
    meta: { area: "admin", requiresAuth: true },
  },
  {
    path: "/setup",
    name: "setup",
    component: SetupView,
  },
  { path: "/:pathMatch(.*)*", redirect: "/" },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior() {
    return { top: 0 };
  },
});

/**
 * 需要登录的页面在**挂载之前**就拦掉。
 *
 * 判定细节全部在 `./admin-guard.js` 的 `resolveAdminGate`（纯函数，可被冒烟直接驱动）；
 * 这里只负责把真 store 接进去。两点值得记：
 *
 * 1. `/admin` 的 `requiresAuth` 与前台那三页**语义相同**：只在服务端已经判定
 *    「这一页的访问者没有会话」（`data-auth="guest"`）时才拦 —— 属性缺失（老模板）
 *    或还有会话时一律进下一步，交给后台闸门去做确定性的探针。
 * 2. `useAdminStore()` 在这里调用是安全的：`main.ts` 先 `use(pinia)` 再 `use(router)`，
 *    而守卫只在导航时执行，那时 pinia 一定已经装好（前一条注释同款约束见 `main.ts`）。
 */
router.beforeEach((to) => {
  const admin = useAdminStore();
  return resolveAdminGate(to, {
    serverAuthState,
    adminPhase: () => admin.phase,
    bootstrap: () => admin.bootstrap(),
    showLogin: () => admin.showLogin(),
  });
});

export default router;
