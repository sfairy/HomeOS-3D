/**
 * device 域根 barrel：域的唯一对外出口，跨域只允许 `import { ... } from '@/features/device'`。
 *
 * 归类器实测其外部消费者只有两个 views，是叶子域，故归位 `features/`。纯逻辑（无 Vue / 无 store）
 * 在 `@/shared/device/utils/*` 与 `@/shared/entity/utils/*`，本域只持有 UI；域根只出跨域真正用到的成员。
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

// 可复用子块（`DeviceChartHeader` / `DeviceHealthScore`）消费者全在域内，不走本 barrel。

// ── 视图模型 ──
// 两个设备视图收敛为薄壳后，领域逻辑集中在域内（`view → @/features/device`）。
export { useDevicesView } from './composables/useDevicesView'
export { useDeviceDetailView } from './composables/useDeviceDetailView'
