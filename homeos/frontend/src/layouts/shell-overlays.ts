/**
 * 主布局延后加载的壳层浮层 / 横幅统一入口
 *
 * 职责：将多个非首屏必需的浮层/横幅组件集中从此模块统一 re-export，
 * 使调用方通过 `import('@/layouts/shell-overlays')` 触发同一个动态 chunk 加载，
 * 避免每个组件各自形成独立小请求（原 8+ 次请求合并为 1 次）。
 *
 * 使用方：MainLayout.vue（通过 defineAsyncComponent 异步引用）
 *
 * 导出列表：
 * - MediaPlayerModal：媒体播放器弹窗
 * - DoorbellAlertModal：门铃触发提醒弹窗
 * - EarthquakeSetupWizard：地震功能配置向导
 * - SettingsLockModal：设置锁验证弹窗
 * - NotificationDrawer：通知抽屉
 * - SetupChecklistBanner：初始化引导横幅
 * - ColdEntityPerfBanner：冷启动实体性能提示横幅
 */
export { default as MediaPlayerModal } from '@/components/modals/MediaPlayerModal.vue'
export { default as DoorbellAlertModal } from '@/components/modals/DoorbellAlertModal.vue'
export { default as EarthquakeSetupWizard } from '@/components/earthquake/SetupWizard.vue'
export { default as SettingsLockModal } from '@/components/modals/SettingsLockModal.vue'
export { default as NotificationDrawer } from '@/components/modals/NotificationDrawer.vue'
export { default as SetupChecklistBanner } from '@/components/setup/ChecklistBanner.vue'
export { default as ColdEntityPerfBanner } from '@/components/setup/ColdEntityPerfBanner.vue'
