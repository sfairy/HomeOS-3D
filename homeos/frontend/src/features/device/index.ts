/**
 * device（设备）域根 barrel —— 域的唯一对外出口。
 *
 * 域内细节（`analytics/`、`styles/`）不外借：跨域引用只允许
 * `import { ... } from '@/features/device'`（门禁见 scripts/check-frontend-deps.mjs
 * 与 eslint.config.js 的域边界规则）。
 *
 * ## 本域为什么成立（而不是留在 `components/devices/`）
 *
 * 归类器实测：`components/devices` 的外部消费者只有 `views/DevicesView.vue` 与
 * `views/DeviceDetailView.vue`（入边全部落在 `views/`），是标准**叶子域** ——
 * 没有任何 `stores/`、`constants/`、`composables/`、根入口反向依赖它。
 * 故按 DAG 归位到 `features/device/`，由视图收敛为薄壳后统一从本 barrel 取组件。
 *
 * ## 与 entity 域的边界（重要）
 *
 * `components/entities/` **没有**随之迁入 features —— 它被 `composables/shell/useFloatingHub.ts`
 * 与根 `main.ts` 引用（前者是真实的 `defineAsyncComponent`，后者是空闲预取 chunk），
 * 且自身依赖 `stores/` + `composables/` + `components/common/`。它属于「带状态耦合的共享 UI 域」，
 * 既进不了 `features/`（会被下层反向依赖拦住），也进不了 `shared/`（`shared` 禁止反向依赖
 * stores/composables/components）。归属见 plan P2 entity/device 批的实测结论。
 *
 * ## 逻辑分层
 *
 * 纯逻辑（无 Vue / 无 store）在 `@/shared/device/utils/*` 与 `@/shared/entity/utils/*`，
 * 本域只持有 UI。store 耦合的 `composables/device/*` 仍在原层。
 */

// ── 设备列表视图 ──
export { default as DeviceRow } from './DeviceRow.vue'
export { default as DeviceStatsDashboard } from './DeviceStatsDashboard.vue'
export { default as DeviceFilterPanel } from './DeviceFilterPanel.vue'
export { default as DeviceBatchActions } from './DeviceBatchActions.vue'
export { default as DeviceAnalyticsDashboard } from './DeviceAnalyticsDashboard.vue'

// ── 设备详情视图 ──
export { default as DeviceOverviewPanel } from './DeviceOverviewPanel.vue'
export { default as DeviceStateHistoryPanel } from './DeviceStateHistoryPanel.vue'
export { default as DeviceEntityReferencesPanel } from './DeviceEntityReferencesPanel.vue'
export { default as DeviceUsageStats } from './DeviceUsageStats.vue'
export { default as DeviceAnalyticsPanel } from './DeviceAnalyticsPanel.vue'
export { default as DeviceAttrsPanel } from './DeviceAttrsPanel.vue'

// 可复用子块（`DeviceChartHeader` / `DeviceHealthScore`）**不在此导出**：它们的消费者全在域内
// （`DeviceAnalyticsPanel`、`analytics/*Tab`、`DeviceOverviewPanel` 等走相对路径 `./`），
// 跨域无人从本 barrel 取。域根只出「跨域真正用到」的成员。

// ── 视图模型 ──
// 两个设备视图收敛为薄壳后，领域逻辑集中在域内（`view → @/features/device`）。
export { useDevicesView } from './composables/useDevicesView'
export { useDeviceDetailView } from './composables/useDeviceDetailView'
