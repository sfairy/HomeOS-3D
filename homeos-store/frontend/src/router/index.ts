/** 路由表：前台商店、后台工作台与首次初始化。 */

import { createRouter, createWebHistory, type RouteRecordRaw } from "vue-router";
import { serverAuthState } from "../stores/session.js";

const StoreLayout = () => import("../views/store/StoreLayout.vue");
const HomeView = () => import("../views/store/HomeView.vue");
const ProductsView = () => import("../views/store/ProductsView.vue");
const ItemView = () => import("../views/store/ItemView.vue");
const AccountView = () => import("../views/store/AccountView.vue");
const ReferralsView = () => import("../views/store/ReferralsView.vue");
const AuthView = () => import("../views/store/AuthView.vue");

const AdminLayout = () => import("../views/admin/AdminLayout.vue");
const SetupView = () => import("../views/SetupView.vue");

/** 需要在挂载前就确认登录态的页面：`meta.requiresAuth`。 */
const ACCOUNT_META = { storePage: "account", requiresAuth: true };

export const routes: RouteRecordRaw[] = [
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
        path: "user/index/query",
        name: "account-query",
        component: AccountView,
        meta: ACCOUNT_META,
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
    path: "/admin/:page?/:tab?",
    name: "admin",
    component: AdminLayout,
    props: true,
  },
  {
    path: "/setup",
    name: "setup",
    component: SetupView,
  },
  { path: "/:pathMatch(.*)*", redirect: "/" },
];

export const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior() {
    return { top: 0 };
  },
});

/**
 * 需要登录的页面在**挂载之前**就拦掉。
 *
 * 只在服务端已经判定「这一页的访问者没有会话」（`data-auth="guest"`）时才拦：
 * 这时确定拿不到数据，放行只会让页面白打一发注定 401 的 `/store/v1/account`。
 * 属性缺失（老模板）或还有会话时一律放行，交给 StoreLayout 去探针。
 */
router.beforeEach((to) => {
  if (to.meta.requiresAuth && serverAuthState() === "guest") {
    return { path: "/user/authentication/login", replace: true };
  }
  return true;
});

export default router;
