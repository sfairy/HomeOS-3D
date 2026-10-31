/**
 * @file layout-dashboard-slices.internals.ts
 * @module frontend/src/views
 */
/** 布局切片 pick/live/apply */
import { clonePlain } from '@/shared/utils/core/clone-plain.util'
import type { HaConfig, StatsSensorsConfig, UILayoutConfig } from '@/shared/types/layout'
import { createDefaultEarthquakeConfig } from '@/shared/types/earthquake'

// ── settings-layout-snapshot.util ──
const clone = clonePlain

/** 集成绑定 Tab 管辖的 layout 切片 */
export function pickBindingsLayoutSlice(layout: UILayoutConfig) {
  return { haConfig: clone(layout.haConfig) }
}

/** pending 检测用：必须返回 store 活引用，禁止 clone（否则 deep-watch 无法感知嵌套修改） */
export function liveBindingsLayoutSlice(layout: UILayoutConfig) {
  return { haConfig: layout.haConfig }
}

export function applyBindingsLayoutSlice(layout: UILayoutConfig, slice: { haConfig?: HaConfig }) {
  if (slice.haConfig) layout.haConfig = clone(slice.haConfig)
}

/** 生活账户 Tab 管辖的 layout 切片 */
export function pickLifeAccountsLayoutSlice(layout: UILayoutConfig) {
  return {
    energySources: clone(layout.statsSensors?.energySources || {}),
  }
}

/** pending 检测用：活引用 */
export function liveLifeAccountsLayoutSlice(layout: UILayoutConfig) {
  const stats = layout.statsSensors
  if (!stats) return { energySources: undefined as StatsSensorsConfig['energySources'] | undefined }
  if (!stats.energySources) stats.energySources = {}
  return { energySources: stats.energySources }
}

export function applyLifeAccountsLayoutSlice(
  layout: UILayoutConfig,
  slice: { energySources?: StatsSensorsConfig['energySources'] },
) {
  if (!layout.statsSensors) return
  if (slice.energySources) {
    layout.statsSensors.energySources = clone(slice.energySources)
  }
}

/** 安防场景 Tab 管辖的 layout 切片 */
export function pickSecurityModesLayoutSlice(layout: UILayoutConfig) {
  return {
    securityModes: clone(layout.securityModes),
    securityEmergency: clone(layout.securityEmergency),
    securityModeLinks: clone(layout.securityModeLinks),
  }
}

/** pending 检测用：活引用 */
export function liveSecurityModesLayoutSlice(layout: UILayoutConfig) {
  return {
    securityModes: layout.securityModes,
    securityEmergency: layout.securityEmergency,
    securityModeLinks: layout.securityModeLinks,
  }
}

export function applySecurityModesLayoutSlice(
  layout: UILayoutConfig,
  slice: ReturnType<typeof pickSecurityModesLayoutSlice>,
) {
  if (slice.securityModes) layout.securityModes = clone(slice.securityModes)
  if (slice.securityEmergency) layout.securityEmergency = clone(slice.securityEmergency)
  if (slice.securityModeLinks) layout.securityModeLinks = clone(slice.securityModeLinks)
}

/** 地震预警（告警 Tab）管辖的 layout 切片 */
export function pickEarthquakeLayoutSlice(layout: UILayoutConfig) {
  return { earthquakeConfig: clone(layout.earthquakeConfig || createDefaultEarthquakeConfig()) }
}

export function applyEarthquakeLayoutSlice(
  layout: UILayoutConfig,
  slice: { earthquakeConfig?: UILayoutConfig['earthquakeConfig'] },
) {
  if (slice.earthquakeConfig) layout.earthquakeConfig = clone(slice.earthquakeConfig)
}
