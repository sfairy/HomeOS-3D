/**
 * 工作区主视图与壳层之间的事件契约。
 *
 * 单独成文件而且**只有常量**：引擎侧的 `studio-workspace-view` 与 Vue 入口
 * `StudioView.vue` 都要用它，直接从引擎模块 import 会把 editor-3d / overlap 那一串
 * 依赖拖进入口 chunk（还会打乱 chunk 初始化顺序那道门禁）。
 */

/**
 * 切到「3D为主」前请壳层退出「平面聚焦」。
 *
 * 聚焦态把右栏压成 `0 !important` 且 `visibility: hidden` / `pointer-events: none`，
 * 而 3D 面板正好要搬进那一列 —— 不先退出，画布会被量成 0×0，**切换条也跟着隐身**，
 * 用户没有可点的入口切回平面。聚焦的真源在 Vue store 里（根类由它算出），
 * 所以引擎只能发事件请壳层改，不能自己改 class。
 */
export const LEAVE_PLAN_FOCUS_EVENT = 'studio:leave-plan-focus'
