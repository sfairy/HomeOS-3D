/**
 * S5 · 建立 app 装配层，并清理最后一批遗留目录。
 *
 * 依据：计划 §3.1。app/ 是唯一装配点：router / layouts / shell / directives / styles。
 * 之后 `views/` `layouts/` `router/` `directives/` `assets/` `components/` `composables/` `services/`
 * 这些旧分层目录全部消失，顶层只剩 app / features / domain / kernel / studio / workers。
 */
const SRC = 'homeos/frontend/src'

export default {
  dirMoves: [
    // —— 装配层本体 ——
    { from: `${SRC}/router`, to: `${SRC}/app/router` },
    { from: `${SRC}/layouts`, to: `${SRC}/app/layouts` },
    { from: `${SRC}/directives`, to: `${SRC}/app/directives` },
    { from: `${SRC}/assets/styles`, to: `${SRC}/app/styles` },
    { from: `${SRC}/components/shell/floating-hub`, to: `${SRC}/app/shell/floating-hub` },
    { from: `${SRC}/composables/ui/shell`, to: `${SRC}/app/shell/composables` },
    { from: `${SRC}/views/auth`, to: `${SRC}/features/auth/views` },

    // —— 业务组件归位 ——
    { from: `${SRC}/components/common/screensaver`, to: `${SRC}/features/dashboard/components/screensaver` },
    { from: `${SRC}/composables/ui/screensaver`, to: `${SRC}/features/dashboard/composables/screensaver` },
    { from: `${SRC}/composables/display`, to: `${SRC}/features/dashboard/composables` },
    { from: `${SRC}/components/modals/media-player`, to: `${SRC}/features/media/components/player` },
    { from: `${SRC}/components/common/settings-page-shell`, to: `${SRC}/features/settings/components/shell` },
  ],
  moves: [
    // —— 壳组件 ——
    { from: `${SRC}/components/shell/FloatingHub.vue`, to: `${SRC}/app/shell/FloatingHub.vue` },
    { from: `${SRC}/components/shell/AgentCompanion.vue`, to: `${SRC}/features/agent/components/AgentCompanion.vue` },
    { from: `${SRC}/components/common/landscape-prompt/LandscapePrompt.vue`, to: `${SRC}/app/shell/LandscapePrompt.vue` },

    // —— 业务组件 ——
    { from: `${SRC}/components/common/HomeModeItemNav.vue`, to: `${SRC}/features/home-mode/components/HomeModeItemNav.vue` },
    { from: `${SRC}/components/common/PresencePersonListInput.vue`, to: `${SRC}/features/presence/components/PresencePersonListInput.vue` },
    { from: `${SRC}/components/common/SettingsOrchTabs.vue`, to: `${SRC}/features/settings/components/SettingsOrchTabs.vue` },
    { from: `${SRC}/components/common/RecommendInsightCard.vue`, to: `${SRC}/domain/recommend/components/RecommendInsightCard.vue` },

    // —— 模态 ——
    { from: `${SRC}/components/modals/MediaPlayerModal.vue`, to: `${SRC}/features/media/components/MediaPlayerModal.vue` },
    { from: `${SRC}/components/modals/DoorbellAlertModal.vue`, to: `${SRC}/features/device/components/DoorbellAlertModal.vue` },
    { from: `${SRC}/components/modals/NotificationDrawer.vue`, to: `${SRC}/features/notifications/components/NotificationDrawer.vue` },
    { from: `${SRC}/components/modals/SettingsLockModal.vue`, to: `${SRC}/features/settings/components/SettingsLockModal.vue` },

    // —— 服务与工具 ——
    { from: `${SRC}/services/notify.ts`, to: `${SRC}/kernel/ui/notify.ts` },
    { from: `${SRC}/services/device-profile-kinds.ts`, to: `${SRC}/features/device/model/device-profile-kinds.ts` },
    { from: `${SRC}/composables/ui/useWebPushSubscribe.ts`, to: `${SRC}/features/notifications/composables/use-web-push-subscribe.ts` },
  ],
  deletes: [
    // 纯转发壳：页面本身在 features/*，views 只是 7 行包装。
    `${SRC}/views/DeviceDetailView.vue`,
    `${SRC}/views/DevicesView.vue`,
    `${SRC}/views/EarthquakeHistoryView.vue`,
    `${SRC}/views/EmbedView.vue`,
    `${SRC}/views/EventsView.vue`,
    `${SRC}/views/ModeTriggerLogsView.vue`,
    `${SRC}/views/NotificationsView.vue`,
    `${SRC}/views/SecurityView.vue`,
    `${SRC}/views/SettingsView.vue`,
  ],
}
