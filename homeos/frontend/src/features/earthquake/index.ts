/**
 * earthquake 域根 barrel：域的唯一对外出口，跨域只允许 `import ... from '@/features/earthquake'`。
 *
 * 纯函数留叶子层 `@/shared/earthquake/utils/`；依赖 store 的辅助留 `@/composables/earthquake/`
 * （被 stores / 跨域 composable 反向依赖，放进 features 会造成分层倒置）。本 barrel 只再导出
 * 跨域真正取用的成员（barrel 保持薄：只导出有实际入边的符号）。
 */

// 域入口组件
export { default as AlertOverlay } from './AlertOverlay.vue'
export { default as CencBulletinCard } from './CencBulletinCard.vue'
export { default as HistoryAnalytics } from './HistoryAnalytics.vue'
export { default as SetupWizard } from './SetupWizard.vue'
// `EewSafetyTips` / `EewSlideUnlock` 是 `AlertOverlay` 的内部子块，不走域根。

// composables
export { useEarthquakeBootstrap, reopenEarthquakeWizard } from './composables/useEarthquakeBootstrap'
export { useEarthquakeStatusQuery } from './composables/useEarthquakeStatusQuery'
// `useEarthquake*` 其余成员消费者在域内，不外借。

// 纯函数（域根只留真的被跨域取用的）
export { earthquakeMagnitudeTone, formatEarthquakeMagnitude } from '@/composables/earthquake/earthquake-layout.util'
export { syncEarthquakeHomeCoordsFromHa } from '@/composables/earthquake/ha-coords.util'
export { buildFixedPageSlots, computeAnalyticsSummary, shortenPlace } from '@/shared/earthquake/utils/history-analytics.util'
