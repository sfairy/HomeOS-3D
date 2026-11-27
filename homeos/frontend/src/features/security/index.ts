/**
 * security 域根 barrel —— 域的唯一对外出口。
 *
 * 域内细节（`components/` `composables/` `utils/` `styles/`）不外借：
 * 跨域引用只允许 `import ... from '@/features/security'`，禁止深引用子路径
 * （门禁见 ops/checks/frontend/check_frontend_deps.mjs 与 biome.json 的 noRestrictedImports 规则）。
 *
 * 本文件即 security 域的「公共面」：所有跨域可用的组件 / composable / 纯函数在此登记。
 * 由 P2 试点迁移建立；`utils/security` compat barrel 已在 P2 utils 收尾批清除，
 * 域外调用方（`components/widgets/security/PanelWidget.vue`、
 * `features/settings/display/composables/layout-floating.internals.ts`）改走共享面
 * `@/shared/security/utils/*` —— 因为 `components/` 不许 import `@/features/**`，
 * 这 4 个纯函数必须落在 shared 侧才够得着。
 * `useSecurityPanelStatus` 带 store 依赖（`@/stores/auth.store`），进不了 `shared/`，故它的
 * **真源**落在 `@/composables/security/useSecurityPanelStatus`（「store 耦合件留 composables/」
 * 的既有规则），本 barrel 仅转出。
 */

// ── 域入口组件 ──
export { default as MonitorPanel } from './MonitorPanel.vue'
export { default as Overview } from './Overview.vue'
export { default as ZoneEditorList } from './ZoneEditorList.vue'

// ── 域内组件 ──
export { default as MediaPagerControls } from './MediaPagerControls.vue'

// ── composables ──
export * from './use-hazard-binding-status'
export * from './use-reduce-security-sensitivity'
export * from './security'
export * from './use-security-overview'
export * from '@/features/security/security'
export * from './security'
export * from './security-view'
export * from './security-zone'
export * from './security-zone'
export * from './security-zone'
export * from './use-yaml-validation'

// ── 域内纯函数（只被 security 自己消费）──

// ── 域内纯函数（原 utils/ 目录压平后的具体文件）──
export * from './event-display'
export * from './panel-arm'
export * from './panel-arm-result'
export * from './panel-layout'
export * from './panel-zones-bootstrap'
export * from './security-zone'

// ── 共享纯函数（域外也要用，真源在 shared/security/utils）──
