/** 按前缀功能族合并（由 plan-families.mjs 生成）。 */
export default {
  merges: [
    {
      into: 'homeos/frontend/src/features/security/composables/security-view.ts',
      from: [
        'homeos/frontend/src/features/security/composables/security-view-calendar.internals.ts',
        'homeos/frontend/src/features/security/composables/security-view-events.internals.ts',
        'homeos/frontend/src/features/security/composables/use-security-view.ts',
      ],
    },
    {
      into: 'homeos/frontend/src/features/security/composables/security.ts',
      from: [
        'homeos/frontend/src/features/security/composables/use-security-audit-events.ts',
        'homeos/frontend/src/features/security/composables/use-security-events-calendar.ts',
        'homeos/frontend/src/features/security/composables/use-security-panel-status.ts',
        'homeos/frontend/src/features/security/composables/use-security-sensors.ts',
      ],
    },
    {
      into: 'homeos/frontend/src/features/security/composables/security-zone.ts',
      from: [
        'homeos/frontend/src/features/security/composables/use-security-zone-editor-list.ts',
        'homeos/frontend/src/features/security/composables/use-security-zone-monitor.ts',
        'homeos/frontend/src/features/security/composables/use-security-zone-rooms.ts',
      ],
    },
    {
      into: 'homeos/frontend/src/features/device/composables/devices-view.ts',
      from: [
        'homeos/frontend/src/features/device/composables/devices-view-actions.internals.ts',
        'homeos/frontend/src/features/device/composables/devices-view-filter.internals.ts',
        'homeos/frontend/src/features/device/composables/devices-view-map.internals.ts',
        'homeos/frontend/src/features/device/composables/devices-view-query.internals.ts',
        'homeos/frontend/src/features/device/composables/use-devices-view.ts',
      ],
    },
    {
      into: 'homeos/frontend/src/features/device/composables/device-analytics-dashboard.ts',
      from: [
        'homeos/frontend/src/features/device/composables/use-device-analytics-dashboard-shell.ts',
        'homeos/frontend/src/features/device/composables/use-device-analytics-dashboard.ts',
      ],
    },
    {
      into: 'homeos/frontend/src/features/device/composables/device.ts',
      from: [
        'homeos/frontend/src/features/device/composables/use-device-detail-view.ts',
        'homeos/frontend/src/features/device/composables/use-device-entity-references.ts',
        'homeos/frontend/src/features/device/composables/use-device-event-stats.ts',
        'homeos/frontend/src/features/device/composables/use-device-health-trend.ts',
        'homeos/frontend/src/features/device/composables/use-device-overview.ts',
        'homeos/frontend/src/features/device/composables/use-device-state-history.ts',
        'homeos/frontend/src/features/device/composables/use-device-usage-stats.ts',
      ],
    },
  ],
}
