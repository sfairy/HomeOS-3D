/**
 * security 域根 barrel —— 域的唯一对外出口。
 *
 * 域内细节（`components/` `composables/` `utils/` `styles/`）不外借：
 * 跨域引用只允许 `import ... from '@/features/security'`，禁止深引用子路径
 * （门禁见 ops/checks/frontend/check_frontend_deps.mjs 与 eslint.config.js 的域边界规则）。
 *
 * 本文件即 security 域的「公共面」：所有跨域可用的组件 / composable / 纯函数在此登记。
 * 由 P2 试点迁移建立；`utils/security` compat barrel 已在 P2 utils 收尾批清除，
 * 域外调用方（`components/widgets/security/PanelWidget.vue`、
 * `features/settings/composables/display/layout-floating.internals.ts`）改走共享面
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
export { default as MediaPagerControls } from './components/MediaPagerControls.vue'

// ── composables ──
export * from './composables/useHazardBindingStatus'
export * from './composables/useReduceSecuritySensitivity'
export * from './composables/useSecurityAuditEvents'
export * from './composables/useSecurityOverview'
export * from '@/composables/security/useSecurityPanelStatus'
export * from './composables/useSecuritySensors'
export * from './composables/useSecurityView'
export * from './composables/useSecurityZoneEditorList'
export * from './composables/useSecurityZoneMonitor'
export * from './composables/useSecurityZoneRooms'
export * from './composables/useYamlValidation'

// ── 域内纯函数（只被 security 自己消费）──
export * from './utils/event-display.util'
export * from './utils/sensor-filter.util'
export * from './utils/zone-room.util'

// ── 共享纯函数（域外也要用，真源在 shared/security/utils）──
export * from '@/shared/security/utils/panel-arm.util'
export * from '@/shared/security/utils/panel-layout.util'
export * from '@/shared/security/utils/panel-zones-bootstrap.util'
export * from '@/shared/security/utils/zones-api.util'
