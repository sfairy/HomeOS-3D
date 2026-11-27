// P1-b：同一目录下多个「各自独占」的 CSS 合并为一张能力级样式表（仍与组件分离）。
export default {
  merges: [
    {
      into: 'homeos/frontend/src/domain/widget/widget.css',
      from: [
        'homeos/frontend/src/domain/widget/quick-actions-card.css',
        'homeos/frontend/src/domain/widget/widget-hub-embeds.css',
      ],
    },
    {
      into: 'homeos/frontend/src/features/dashboard/dashboard.css',
      from: [
        'homeos/frontend/src/features/dashboard/footer.css',
        'homeos/frontend/src/features/dashboard/power-card-body.css',
        'homeos/frontend/src/features/dashboard/right-sidebar.css',
      ],
    },
    {
      into: 'homeos/frontend/src/features/earthquake/earthquake.css',
      from: [
        'homeos/frontend/src/features/earthquake/alert-overlay.css',
        'homeos/frontend/src/features/earthquake/cenc-bulletin-card.css',
        'homeos/frontend/src/features/earthquake/earthquake-setup-wizard.css',
        'homeos/frontend/src/features/earthquake/eew-safety-tips.css',
        'homeos/frontend/src/features/earthquake/eew-slide-unlock.css',
        'homeos/frontend/src/features/earthquake/history-analytics.css',
      ],
    },
    {
      into: 'homeos/frontend/src/features/media/media.css',
      from: [
        'homeos/frontend/src/features/media/mini-widget.css',
        'homeos/frontend/src/features/media/playlist-widget.css',
      ],
    },
    {
      into: 'homeos/frontend/src/features/notifications/notifications.css',
      from: [
        'homeos/frontend/src/features/notifications/notification-drawer.css',
        'homeos/frontend/src/features/notifications/view-analytics.css',
      ],
    },
    {
      into: 'homeos/frontend/src/features/security/widgets/widgets.css',
      from: [
        'homeos/frontend/src/features/security/widgets/security-panel-widget-scoped.css',
        'homeos/frontend/src/features/security/widgets/security-panel-widget.css',
      ],
    },
    {
      into: 'homeos/frontend/src/features/settings/asset-picker/asset-picker.css',
      from: [
        'homeos/frontend/src/features/settings/asset-picker/asset-grid-item.css',
        'homeos/frontend/src/features/settings/asset-picker/asset-manager.css',
        'homeos/frontend/src/features/settings/asset-picker/asset-picker-modal.css',
      ],
    },
    {
      into: 'homeos/frontend/src/features/settings/groups/appearance/layout/layout.css',
      from: [
        'homeos/frontend/src/features/settings/groups/appearance/layout/footer-color-picker.css',
        'homeos/frontend/src/features/settings/groups/appearance/layout/settings-layout-display-section.css',
        'homeos/frontend/src/features/settings/groups/appearance/layout/settings-layout-edit-section.css',
      ],
    },
    {
      into: 'homeos/frontend/src/features/settings/groups/appearance/widgets/widgets.css',
      from: [
        'homeos/frontend/src/features/settings/groups/appearance/widgets/home-climate-chart-config-panel.css',
        'homeos/frontend/src/features/settings/groups/appearance/widgets/hub-tabs-config-field.css',
        'homeos/frontend/src/features/settings/groups/appearance/widgets/weather-hub-config-panel.css',
      ],
    },
    {
      into: 'homeos/frontend/src/features/settings/groups/household/household.css',
      from: [
        'homeos/frontend/src/features/settings/groups/household/device-profiles.css',
        'homeos/frontend/src/features/settings/groups/household/favorites-hub.css',
      ],
    },
    {
      into: 'homeos/frontend/src/features/settings/groups/system/system.css',
      from: [
        'homeos/frontend/src/features/settings/groups/system/access-panel.css',
        'homeos/frontend/src/features/settings/groups/system/admin-hubs.css',
        'homeos/frontend/src/features/settings/groups/system/license-panel.css',
      ],
    },
    {
      into: 'homeos/frontend/src/features/settings/shared/config-fields/config-fields.css',
      from: [
        'homeos/frontend/src/features/settings/shared/config-fields/media-playlist-settings-modal.css',
        'homeos/frontend/src/features/settings/shared/config-fields/system-config-actions-bar.css',
        'homeos/frontend/src/features/settings/shared/config-fields/system-config-audit-card.css',
        'homeos/frontend/src/features/settings/shared/config-fields/system-config-field-cell.css',
        'homeos/frontend/src/features/settings/shared/config-fields/system-config-nested-object-editor.css',
        'homeos/frontend/src/features/settings/shared/config-fields/system-config-params-sidebar.css',
        'homeos/frontend/src/features/settings/shared/config-fields/system-config-section-dock.css',
      ],
    },
    {
      into: 'homeos/frontend/src/features/weather/weather.css',
      from: [
        'homeos/frontend/src/features/weather/forecast.css',
        'homeos/frontend/src/features/weather/life-indices.css',
        'homeos/frontend/src/features/weather/sun-info.css',
        'homeos/frontend/src/features/weather/widget.css',
      ],
    },
    {
      into: 'homeos/frontend/src/kernel/ui/ui.css',
      from: [
        'homeos/frontend/src/kernel/ui/error-boundary.css',
        'homeos/frontend/src/kernel/ui/footer-icon-picker.css',
      ],
    },
    {
      into: 'homeos/frontend/src/kernel/ui/primitives/primitives.css',
      from: [
        'homeos/frontend/src/kernel/ui/primitives/searchable-select.css',
        'homeos/frontend/src/kernel/ui/primitives/v-empty-state.css',
        'homeos/frontend/src/kernel/ui/primitives/v-notification.css',
        'homeos/frontend/src/kernel/ui/primitives/v-progress-bar.css',
        'homeos/frontend/src/kernel/ui/primitives/v-skeleton.css',
      ],
    },
  ],
}
