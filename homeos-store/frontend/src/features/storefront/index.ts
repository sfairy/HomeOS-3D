/**
 * storefront 域根 barrel —— 域的唯一对外出口（门禁见 `homeos-store/scripts/check-store-deps.mjs` 的 R3）。
 *
 * 前台商店这一片（7 个路由页 + 支付/待支付弹窗 + 2 个 store + 防抖竞态工具）是完整的一域。
 *
 * 这里只导出**宿主静态引用**的三个页面：`StoreLayout` / `HomeView` / `AuthView` 是首屏链路
 * （路由表同步 import，本来就在同一个 chunk 里），经 barrel 转出没有分包代价，还顺手把
 * 「跨域走域根」这条约定钉在路由表上。
 *
 * 其余四个页面（`ProductsView` / `ItemView` / `AccountView` / `ReferralsView`）是**懒加载**的：
 * 经 barrel 转出会把它们并进同一个 chunk，路由级分包当场失效，所以路由表按门禁 R6
 * 的例外深引用 `views/*.vue`。
 */
export { default as StoreLayout } from "./views/StoreLayout.vue";
export { default as HomeView } from "./views/HomeView.vue";
export { default as AuthView } from "./views/AuthView.vue";
