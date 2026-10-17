/**
 * studio 子系统的唯一公开面：根（非 studio）代码只允许 `import ... from '@/studio'`，
 * 由 `scripts/check-studio-deps.mjs` 强制（白名单只减不增）。
 *
 * 这里只登记根真正需要的稳定启动/装配 API：页面资源注入、facade 引擎、shell 导航注册、
 * 路由懒加载器。新增导出前先自问：这是「子系统对外契约」还是「内部实现细节」？后者不加。
 */

// 页面资源（构建期注入 index.html 的样式/脚本清单）
export * from './page-assets'

// facade 引擎（根 store ↔ studio 三类 facade 的命令/状态通道）
export * from './engine'

// shell 导航（根 router 把跳转能力注册给 studio）
export * from './platform/shell-navigation'

// 路由入口：入口视图留在 studio 内（`entries/`），只暴露懒加载器给根 router，保持按路由分包。
export const loadStudioView = () => import('./entries/StudioView.vue')
export const loadEditorView = () => import('./entries/EditorView.vue')
export const loadDisplayView = () => import('./entries/DisplayView.vue')
