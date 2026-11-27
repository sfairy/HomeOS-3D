// P4-f：剩余形态段压平（各域 utils、kernel 的 constants 与 types、kernel/ui/hooks、各域 types）。
export default {
  moves: [
    {
      from: 'homeos/frontend/src/features/earthquake/utils/history-analytics.ts',
      to: 'homeos/frontend/src/features/earthquake/history-analytics.ts',
    },
    {
      from: 'homeos/frontend/src/features/events/utils/events-display.ts',
      to: 'homeos/frontend/src/features/events/events-display.ts',
    },
    {
      from: 'homeos/frontend/src/features/events/utils/analytics.ts',
      to: 'homeos/frontend/src/features/events/analytics.ts',
    },
    {
      from: 'homeos/frontend/src/features/home-mode/utils/trigger-summary.ts',
      to: 'homeos/frontend/src/features/home-mode/trigger-summary.ts',
    },
    {
      from: 'homeos/frontend/src/features/home-mode/utils/mode-preset-meta.ts',
      to: 'homeos/frontend/src/features/home-mode/mode-preset-meta.ts',
    },
    {
      from: 'homeos/frontend/src/features/home-mode/utils/mode-icon.ts',
      to: 'homeos/frontend/src/features/home-mode/mode-icon.ts',
    },
    {
      from: 'homeos/frontend/src/features/notifications/utils/analytics.ts',
      to: 'homeos/frontend/src/features/notifications/analytics.ts',
    },
    {
      from: 'homeos/frontend/src/features/presence/utils/entity-filter.ts',
      to: 'homeos/frontend/src/features/presence/entity-filter.ts',
    },
    {
      from: 'homeos/frontend/src/features/presence/utils/display.ts',
      to: 'homeos/frontend/src/features/presence/display.ts',
    },
    {
      from: 'homeos/frontend/src/features/presence/utils/person.ts',
      to: 'homeos/frontend/src/features/presence/person.ts',
    },
    {
      from: 'homeos/frontend/src/features/security/utils/panel-zones-bootstrap.ts',
      to: 'homeos/frontend/src/features/security/panel-zones-bootstrap.ts',
    },
    {
      from: 'homeos/frontend/src/features/security/utils/zones-api.ts',
      to: 'homeos/frontend/src/features/security/zones-api.ts',
    },
    {
      from: 'homeos/frontend/src/features/security/utils/event-display.ts',
      to: 'homeos/frontend/src/features/security/event-display.ts',
    },
    {
      from: 'homeos/frontend/src/features/security/utils/zone-room.ts',
      to: 'homeos/frontend/src/features/security/zone-room.ts',
    },
    {
      from: 'homeos/frontend/src/features/security/utils/panel-arm-result.ts',
      to: 'homeos/frontend/src/features/security/panel-arm-result.ts',
    },
    {
      from: 'homeos/frontend/src/features/security/utils/sensor-filter.ts',
      to: 'homeos/frontend/src/features/security/sensor-filter.ts',
    },
    {
      from: 'homeos/frontend/src/features/security/utils/zone-mode.ts',
      to: 'homeos/frontend/src/features/security/zone-mode.ts',
    },
    {
      from: 'homeos/frontend/src/features/security/utils/panel-layout.ts',
      to: 'homeos/frontend/src/features/security/panel-layout.ts',
    },
    {
      from: 'homeos/frontend/src/features/security/utils/panel-arm.ts',
      to: 'homeos/frontend/src/features/security/panel-arm.ts',
    },
    {
      from: 'homeos/frontend/src/features/settings/utils/keep-alive.ts',
      to: 'homeos/frontend/src/features/settings/keep-alive.ts',
    },
    {
      from: 'homeos/frontend/src/features/settings/utils/nav-search.ts',
      to: 'homeos/frontend/src/features/settings/nav-search.ts',
    },
    {
      from: 'homeos/frontend/src/domain/client/utils/infer-terminal-label.ts',
      to: 'homeos/frontend/src/domain/client/infer-terminal-label.ts',
    },
    {
      from: 'homeos/frontend/src/domain/client/utils/system-display.ts',
      to: 'homeos/frontend/src/domain/client/system-display.ts',
    },
    {
      from: 'homeos/frontend/src/domain/client/utils/power-battery-display.ts',
      to: 'homeos/frontend/src/domain/client/power-battery-display.ts',
    },
    { from: 'homeos/frontend/src/domain/client/utils/index.ts', to: 'homeos/frontend/src/domain/client/index.ts' },
    { from: 'homeos/frontend/src/domain/client/utils/system.ts', to: 'homeos/frontend/src/domain/client/system.ts' },
    { from: 'homeos/frontend/src/domain/energy/utils/account.ts', to: 'homeos/frontend/src/domain/energy/account.ts' },
    {
      from: 'homeos/frontend/src/domain/energy/utils/account-input.ts',
      to: 'homeos/frontend/src/domain/energy/account-input.ts',
    },
    {
      from: 'homeos/frontend/src/domain/energy/utils/account-sync.ts',
      to: 'homeos/frontend/src/domain/energy/account-sync.ts',
    },
    { from: 'homeos/frontend/src/domain/energy/utils/source.ts', to: 'homeos/frontend/src/domain/energy/source.ts' },
    {
      from: 'homeos/frontend/src/domain/energy/utils/account-entity.ts',
      to: 'homeos/frontend/src/domain/energy/account-entity.ts',
    },
    {
      from: 'homeos/frontend/src/domain/energy/utils/popup-read.ts',
      to: 'homeos/frontend/src/domain/energy/popup-read.ts',
    },
    {
      from: 'homeos/frontend/src/domain/energy/utils/binding-bridge.ts',
      to: 'homeos/frontend/src/domain/energy/binding-bridge.ts',
    },
    {
      from: 'homeos/frontend/src/domain/energy/utils/entity-read.ts',
      to: 'homeos/frontend/src/domain/energy/entity-read.ts',
    },
    {
      from: 'homeos/frontend/src/domain/energy/utils/account-resolve.ts',
      to: 'homeos/frontend/src/domain/energy/account-resolve.ts',
    },
    {
      from: 'homeos/frontend/src/domain/energy/utils/account-types.ts',
      to: 'homeos/frontend/src/domain/energy/account-types.ts',
    },
    {
      from: 'homeos/frontend/src/domain/energy/utils/comm-carrier.ts',
      to: 'homeos/frontend/src/domain/energy/comm-carrier.ts',
    },
    {
      from: 'homeos/frontend/src/domain/energy/utils/account-display.ts',
      to: 'homeos/frontend/src/domain/energy/account-display.ts',
    },
    {
      from: 'homeos/frontend/src/domain/entity/utils/scene-script.ts',
      to: 'homeos/frontend/src/domain/entity/scene-script.ts',
    },
    {
      from: 'homeos/frontend/src/domain/entity/utils/idb-cache.ts',
      to: 'homeos/frontend/src/domain/entity/idb-cache.ts',
    },
    { from: 'homeos/frontend/src/domain/entity/utils/derived.ts', to: 'homeos/frontend/src/domain/entity/derived.ts' },
    {
      from: 'homeos/frontend/src/domain/entity/utils/control-attr-change.ts',
      to: 'homeos/frontend/src/domain/entity/control-attr-change.ts',
    },
    {
      from: 'homeos/frontend/src/domain/entity/utils/temperature-unit.ts',
      to: 'homeos/frontend/src/domain/entity/temperature-unit.ts',
    },
    { from: 'homeos/frontend/src/domain/entity/utils/select.ts', to: 'homeos/frontend/src/domain/entity/select.ts' },
    {
      from: 'homeos/frontend/src/domain/entity/utils/event-log-domains.ts',
      to: 'homeos/frontend/src/domain/entity/event-log-domains.ts',
    },
    {
      from: 'homeos/frontend/src/domain/entity/utils/sync-guards.ts',
      to: 'homeos/frontend/src/domain/entity/sync-guards.ts',
    },
    {
      from: 'homeos/frontend/src/domain/entity/utils/floating-entity-colors.ts',
      to: 'homeos/frontend/src/domain/entity/floating-entity-colors.ts',
    },
    {
      from: 'homeos/frontend/src/domain/entity/utils/comma-entity-ids.ts',
      to: 'homeos/frontend/src/domain/entity/comma-entity-ids.ts',
    },
    {
      from: 'homeos/frontend/src/domain/entity/utils/cold-fetch.ts',
      to: 'homeos/frontend/src/domain/entity/cold-fetch.ts',
    },
    {
      from: 'homeos/frontend/src/domain/entity/utils/suggest-device-class.ts',
      to: 'homeos/frontend/src/domain/entity/suggest-device-class.ts',
    },
    {
      from: 'homeos/frontend/src/domain/entity/utils/popup-registry.ts',
      to: 'homeos/frontend/src/domain/entity/popup-registry.ts',
    },
    {
      from: 'homeos/frontend/src/domain/entity/utils/attr-format.ts',
      to: 'homeos/frontend/src/domain/entity/attr-format.ts',
    },
    {
      from: 'homeos/frontend/src/domain/entity/utils/ws-subscription.ts',
      to: 'homeos/frontend/src/domain/entity/ws-subscription.ts',
    },
    {
      from: 'homeos/frontend/src/domain/entity/utils/control/climate-control-core.ts',
      to: 'homeos/frontend/src/domain/entity/control/climate-control-core.ts',
    },
    {
      from: 'homeos/frontend/src/domain/entity/utils/control/media-player-control-core.ts',
      to: 'homeos/frontend/src/domain/entity/control/media-player-control-core.ts',
    },
    {
      from: 'homeos/frontend/src/domain/entity/utils/control/cover-control-core.ts',
      to: 'homeos/frontend/src/domain/entity/control/cover-control-core.ts',
    },
    {
      from: 'homeos/frontend/src/domain/entity/utils/control/light-control-core.ts',
      to: 'homeos/frontend/src/domain/entity/control/light-control-core.ts',
    },
    {
      from: 'homeos/frontend/src/domain/notifications/utils/ws-sync.ts',
      to: 'homeos/frontend/src/domain/notifications/ws-sync.ts',
    },
    {
      from: 'homeos/frontend/src/domain/notifications/utils/dnd.ts',
      to: 'homeos/frontend/src/domain/notifications/dnd.ts',
    },
    {
      from: 'homeos/frontend/src/domain/recommend/utils/entity-sync-recommend.ts',
      to: 'homeos/frontend/src/domain/recommend/entity-sync-recommend.ts',
    },
    {
      from: 'homeos/frontend/src/domain/recommend/utils/whole-home-off-recommend.ts',
      to: 'homeos/frontend/src/domain/recommend/whole-home-off-recommend.ts',
    },
    {
      from: 'homeos/frontend/src/domain/recommend/utils/home-mode-recommend.ts',
      to: 'homeos/frontend/src/domain/recommend/home-mode-recommend.ts',
    },
    {
      from: 'homeos/frontend/src/domain/recommend/utils/insight.ts',
      to: 'homeos/frontend/src/domain/recommend/insight.ts',
    },
    {
      from: 'homeos/frontend/src/domain/recommend/utils/favorites-recommend.ts',
      to: 'homeos/frontend/src/domain/recommend/favorites-recommend.ts',
    },
    {
      from: 'homeos/frontend/src/domain/recommend/utils/alert-rules-recommend.ts',
      to: 'homeos/frontend/src/domain/recommend/alert-rules-recommend.ts',
    },
    {
      from: 'homeos/frontend/src/domain/recommend/utils/index.ts',
      to: 'homeos/frontend/src/domain/recommend/index.ts',
    },
    {
      from: 'homeos/frontend/src/domain/recommend/utils/event-log-record-recommend.ts',
      to: 'homeos/frontend/src/domain/recommend/event-log-record-recommend.ts',
    },
    {
      from: 'homeos/frontend/src/domain/recommend/utils/event-log-perf-recommend.ts',
      to: 'homeos/frontend/src/domain/recommend/event-log-perf-recommend.ts',
    },
    {
      from: 'homeos/frontend/src/domain/recommend/utils/bindings-recommend.ts',
      to: 'homeos/frontend/src/domain/recommend/bindings-recommend.ts',
    },
    {
      from: 'homeos/frontend/src/domain/widget/utils/panel-widget-height.ts',
      to: 'homeos/frontend/src/domain/widget/panel-widget-height.ts',
    },
    {
      from: 'homeos/frontend/src/domain/widget/utils/profile-filter.ts',
      to: 'homeos/frontend/src/domain/widget/profile-filter.ts',
    },
    {
      from: 'homeos/frontend/src/kernel/constants/agent-quick-prompts.ts',
      to: 'homeos/frontend/src/kernel/agent-quick-prompts.ts',
    },
    {
      from: 'homeos/frontend/src/kernel/constants/climate-labels.ts',
      to: 'homeos/frontend/src/kernel/climate-labels.ts',
    },
    {
      from: 'homeos/frontend/src/kernel/constants/api-error-codes.ts',
      to: 'homeos/frontend/src/kernel/api-error-codes.ts',
    },
    { from: 'homeos/frontend/src/kernel/constants/voice.ts', to: 'homeos/frontend/src/kernel/voice.ts' },
    {
      from: 'homeos/frontend/src/kernel/constants/entity-domain-meta.ts',
      to: 'homeos/frontend/src/kernel/entity-domain-meta.ts',
    },
    { from: 'homeos/frontend/src/kernel/constants/device-group.ts', to: 'homeos/frontend/src/kernel/device-group.ts' },
    { from: 'homeos/frontend/src/kernel/constants/security.ts', to: 'homeos/frontend/src/kernel/security.ts' },
    {
      from: 'homeos/frontend/src/kernel/constants/alert-rule-presets.ts',
      to: 'homeos/frontend/src/kernel/alert-rule-presets.ts',
    },
    {
      from: 'homeos/frontend/src/kernel/constants/screensaver-defaults.ts',
      to: 'homeos/frontend/src/kernel/screensaver-defaults.ts',
    },
    { from: 'homeos/frontend/src/kernel/constants/entity-state.ts', to: 'homeos/frontend/src/kernel/entity-state.ts' },
    { from: 'homeos/frontend/src/kernel/constants/index.ts', to: 'homeos/frontend/src/kernel/index.ts' },
    { from: 'homeos/frontend/src/kernel/constants/scene-values.ts', to: 'homeos/frontend/src/kernel/scene-values.ts' },
    { from: 'homeos/frontend/src/kernel/types/client-power.ts', to: 'homeos/frontend/src/kernel/client-power.ts' },
    { from: 'homeos/frontend/src/kernel/types/axios.d.ts', to: 'homeos/frontend/src/kernel/axios.d.ts' },
    { from: 'homeos/frontend/src/kernel/types/env-room.ts', to: 'homeos/frontend/src/kernel/env-room.ts' },
    {
      from: 'homeos/frontend/src/kernel/types/page-background.ts',
      to: 'homeos/frontend/src/kernel/page-background.ts',
    },
    { from: 'homeos/frontend/src/kernel/types/router.ts', to: 'homeos/frontend/src/kernel/router.ts' },
    { from: 'homeos/frontend/src/kernel/types/entity.ts', to: 'homeos/frontend/src/kernel/entity.ts' },
    { from: 'homeos/frontend/src/kernel/types/system-config.ts', to: 'homeos/frontend/src/kernel/system-config.ts' },
    {
      from: 'homeos/frontend/src/kernel/types/dashboard-footer.ts',
      to: 'homeos/frontend/src/kernel/dashboard-footer.ts',
    },
    { from: 'homeos/frontend/src/kernel/types/earthquake.ts', to: 'homeos/frontend/src/kernel/earthquake.ts' },
    { from: 'homeos/frontend/src/kernel/types/notify.ts', to: 'homeos/frontend/src/kernel/notify.ts' },
    { from: 'homeos/frontend/src/kernel/types/setup-wizard.ts', to: 'homeos/frontend/src/kernel/setup-wizard.ts' },
    { from: 'homeos/frontend/src/kernel/types/device.ts', to: 'homeos/frontend/src/kernel/device.ts' },
    { from: 'homeos/frontend/src/kernel/types/alert-rules.ts', to: 'homeos/frontend/src/kernel/alert-rules.ts' },
    {
      from: 'homeos/frontend/src/kernel/types/frontend-config.ts',
      to: 'homeos/frontend/src/kernel/frontend-config.ts',
    },
    { from: 'homeos/frontend/src/kernel/types/floating-hub.ts', to: 'homeos/frontend/src/kernel/floating-hub.ts' },
    {
      from: 'homeos/frontend/src/kernel/ui/hooks/use-click-outside.ts',
      to: 'homeos/frontend/src/kernel/ui/use-click-outside.ts',
    },
    {
      from: 'homeos/frontend/src/kernel/ui/hooks/use-app-theme.ts',
      to: 'homeos/frontend/src/kernel/ui/use-app-theme.ts',
    },
    {
      from: 'homeos/frontend/src/kernel/ui/hooks/hub-viewport.ts',
      to: 'homeos/frontend/src/kernel/ui/hub-viewport.ts',
    },
    {
      from: 'homeos/frontend/src/kernel/ui/hooks/use-body-scroll-lock.ts',
      to: 'homeos/frontend/src/kernel/ui/use-body-scroll-lock.ts',
    },
    {
      from: 'homeos/frontend/src/kernel/ui/hooks/use-fetch-generation.ts',
      to: 'homeos/frontend/src/kernel/ui/use-fetch-generation.ts',
    },
    {
      from: 'homeos/frontend/src/kernel/ui/hooks/use-popup-history-guard.ts',
      to: 'homeos/frontend/src/kernel/ui/use-popup-history-guard.ts',
    },
    {
      from: 'homeos/frontend/src/kernel/ui/hooks/use-background-inert.ts',
      to: 'homeos/frontend/src/kernel/ui/use-background-inert.ts',
    },
    { from: 'homeos/frontend/src/kernel/ui/hooks/use-scaling.ts', to: 'homeos/frontend/src/kernel/ui/use-scaling.ts' },
    {
      from: 'homeos/frontend/src/kernel/ui/hooks/use-focus-trap.ts',
      to: 'homeos/frontend/src/kernel/ui/use-focus-trap.ts',
    },
    {
      from: 'homeos/frontend/src/kernel/ui/hooks/use-esc-stack.ts',
      to: 'homeos/frontend/src/kernel/ui/use-esc-stack.ts',
    },
    {
      from: 'homeos/frontend/src/kernel/ui/hooks/use-canvas-metrics.ts',
      to: 'homeos/frontend/src/kernel/ui/use-canvas-metrics.ts',
    },
    {
      from: 'homeos/frontend/src/kernel/ui/hooks/use-swiper-draggable.ts',
      to: 'homeos/frontend/src/kernel/ui/use-swiper-draggable.ts',
    },
    {
      from: 'homeos/frontend/src/kernel/ui/hooks/use-horizontal-scroll-nav.ts',
      to: 'homeos/frontend/src/kernel/ui/use-horizontal-scroll-nav.ts',
    },
    {
      from: 'homeos/frontend/src/kernel/ui/hooks/use-landscape-prompt.ts',
      to: 'homeos/frontend/src/kernel/ui/use-landscape-prompt.ts',
    },
    {
      from: 'homeos/frontend/src/kernel/ui/hooks/use-keep-alive-gate.ts',
      to: 'homeos/frontend/src/kernel/ui/use-keep-alive-gate.ts',
    },
    {
      from: 'homeos/frontend/src/domain/recommend/types/recommend.types.ts',
      to: 'homeos/frontend/src/domain/recommend/recommend.types.ts',
    },
    {
      from: 'homeos/frontend/src/studio/authoring/types/studio-app-types.ts',
      to: 'homeos/frontend/src/studio/authoring/studio-app-types.ts',
    },
  ],
}
