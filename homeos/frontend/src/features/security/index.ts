/**
 * security（安防域）域根 barrel —— 域的唯一对外出口。
 *
 * 跨域引用只允许 `import ... from '@/features/security'`，禁止深引用子路径
 * （跨域只走域根 barrel，属项目约定；biome.json 的 noRestrictedImports 仍会拦部分越界）。
 *
 * ## 已下沉到 domain 的部分
 *
 * 面板区域布局与安防 zones REST 访问器只依赖 `kernel/` 与 `domain/api`，
 * 被 settings 与 security 平等共用，因此归属 L1：
 * `@/domain/security/panel-layout`、`@/domain/security/zones-api`。
 * 它们**不再**经由本 barrel 转出 —— 需要时直接从 domain 引用。
 *
 * ## 只有跨域真正要用的成员才登记在这里
 *
 * 本域主体（`security.ts` 的状态机、`security-view.ts` 的视图派生、面板分区组件）
 * 只被域内相对引用。历史上这里堆了多份重复的 `export *`（同一模块被登记 2–7 次），
 * 已按实际消费方收敛，行为不变（重复的 `export *` 本就不叠加任何语义）。
 */

// ── 域入口组件 ──
export { default as MonitorPanel } from './MonitorPanel.vue'
export { default as Overview } from './Overview.vue'
export { default as ZoneEditorList } from './ZoneEditorList.vue'

// ── 域内组件（设置页的浮动部件编辑器复用分页控件）──
export { default as MediaPagerControls } from './MediaPagerControls.vue'

// ── 跨域 composable：设置页的连接 / 绑定 / 自动化面板复用 ──
export * from './use-hazard-binding-status'
export * from './use-reduce-security-sensitivity'
export * from './use-yaml-validation'

// ── 域内实现（域外不需要，但既有调用方按名引用，保持可达）──
export * from './security'
export * from './security-view'
export * from './security-zone'
export * from './use-security-overview'
export * from './event-display'
export * from './panel-arm'
export * from './panel-arm-result'
export * from './panel-zones-bootstrap'
