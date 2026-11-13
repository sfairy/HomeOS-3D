/**
 * storefront 域根 barrel —— 域的唯一对外出口（跨域只经本 barrel，禁深引用）。
 *
 * 目录按**路由域**划分（每个子目录只服务一类页面，跨子域引用必须回到本 barrel 或共享层）：
 *
 * - `home/`     首页：`HomeView` + 视图模型 `useHomeView` + 区块组件 + 文案 `content.ts`
 * - `catalog/`  商品目录与详情：`ProductsView` / `ItemView` + 目录 store + 竞态守卫
 * - `account/`  账号中心与邀请：`AccountView` / `ReferralsView`
 * - `auth/`     登录 / 注册 / 找回：`AuthView` + 冷却与邀请码工具
 * - `checkout/` 下单与支付：订单 store、支付/待支付弹窗、弹窗编排 composable
 * - `layout/`   前台外壳：`StoreLayout`
 *
 * 这里只导出**宿主静态引用**的三个页面：`StoreLayout` / `HomeView` / `AuthView` 是首屏链路
 * （路由表同步 import，本来就在同一个 chunk 里），经 barrel 转出没有分包代价，还顺手把
 * 「跨域走域根」这条约定钉在路由表上。
 *
 * 其余四个页面是**懒加载**的：经 barrel 转出会把它们并进同一个 chunk，路由级分包当场失效，
 * 所以路由表按门禁 R6 的例外深引用各域页面文件。
 */
export { default as StoreLayout } from "./layout/StoreLayout.vue";
export { default as HomeView } from "./home/HomeView.vue";
export { default as AuthView } from "./auth/AuthView.vue";
