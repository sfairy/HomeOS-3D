/**
 * studio 子系统的**唯一公开面**。
 *
 * studio（`src/studio/`，413 文件）是一个自带 vite 多入口、自带 `@app`/`@runtime` 别名的
 * 嵌套子系统。若允许根代码直达其内部（`@app/*`、`@runtime/*`、`@/studio/views/*`、
 * `@/studio/engine/*` …），子系统的内部拓扑就会被根反向依赖，任何内部重构都会外溢成
 * 全仓改动 —— 这正是不让「子系统」与「应用根」互相渗透的关键。
 *
 * 因此约定：**根（非 studio）代码只允许 `import ... from '@/studio'`**，
 * 由 `scripts/check-studio-deps.mjs` 强制，存量白名单只减不增。
 *
 * 这里只登记**根真正需要的稳定启动/装配 API**：
 *
 * - 页面资源注入（`App.vue` / `router` 用来挂 studio 的样式表与脚本）
 * - facade 引擎（`stores/studio-*.store.ts` 用来和 studio 三类 facade 通信）
 * - shell 导航注册（`router` 用来把路由跳转能力交给 studio）
 *
 * **不含** `views/**`：studio 的入口视图是**应用级路由页**，P6 会把它们挪到
 * `src/views/{auth,studio}/`，按 DAG 由 `views/` 直接持有，不经此 barrel（也就不会
 * 把 studio 的懒加载入口静态拉进来）。
 *
 * 新增导出请先自问：这是「子系统对外契约」还是「内部实现细节」？后者一律不加。
 */

// ── 页面资源（构建期注入 index.html 的样式/脚本清单）──
export * from './page-assets'

// ── facade 引擎（根 store ↔ studio 三类 facade 的命令/状态通道）──
export * from './engine'

// ── shell 导航（根 router 把跳转能力注册给 studio）──
export * from './platform/shell-navigation'

// ── 路由入口（懒加载器，保持分包，不把 studio 静态拉进主 chunk）──
//
// 这几个视图是 studio 子系统的**入口页**，本身不是「应用级薄壳」（各上千行、直接依赖
// studio 内部 chrome 与 legacy boot），所以留在 studio 内（`entries/`），只把**懒加载器**
// 暴露出来给根 router —— 这样根既不直达 studio 内部，也不破坏按路由分包。
export const loadStudioView = () => import('./entries/StudioView.vue')
export const loadEditorView = () => import('./entries/EditorView.vue')
export const loadDisplayView = () => import('./entries/DisplayView.vue')
