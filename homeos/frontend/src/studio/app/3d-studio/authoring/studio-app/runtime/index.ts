/**
 * `runtime` 域的对外出口：本目录各文件的导出在此汇总。
 *
 * 存在意义：`boot.ts` 是转发层，需要本域的全部实现函数；逐文件 import 会把它
 * 的导入段撑到几百行（拆分子域后一度涨到 126 个 import 块）。按域导入让
 * 「这个域提供什么」在调用点一眼可见，同时把导入行数压回可控范围。
 * 域内文件之间仍直接相对 import，不经 barrel（避免环与无谓的间接层）。
 */
export { bindAutoDiagramMessages } from './auto-diagram-messages'
export { bindGlobalShortcuts } from './global-shortcuts'
export type { BackgroundViewSettings, StudioAppRuntime } from './studio-app-runtime'
export { waitForStageReady, jumpWorkflowStep } from './workflow'
