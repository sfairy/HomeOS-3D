/**
 * entity（实体域）域根 barrel —— 域的唯一对外出口。
 *
 * 域内细节不外借：跨域引用只允许 `import ... from '@/features/entity'`
 * （门禁见 ops/checks/frontend/check_frontend_deps.mjs）。
 *
 * ## 薄 barrel 原则
 *
 * entity 是全仓最大的域（实体存储 / 派生 / 弹窗 / 多选 / 分组），跨域消费者几乎都只需要
 * 「选实体的弹窗」这一个交互件。全量 barrel 会把 `entity/store`、`derived` 等
 * 事件流与派生层一并拖进引用方 chunk，故只导出下面这一项。
 */

// ── 实体选择弹窗（features/settings 的收藏 / 自动化草案两处复用）──
// 收藏、自动化草案、以及未来任何「挑几个实体」的设置面板都走同一个弹窗：
// 搜索 / 分组 / 最近使用 / 排除已在列表内的项，这些行为分叉一次就会有一处漏掉。
export { default as EntityPickModal } from './EntityPickModal.vue'
