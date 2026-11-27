/** 按前缀功能族合并（由 plan-families.mjs 生成）。 */
export default {
  merges: [
    {
      into: 'homeos/frontend/src/features/settings/groups/onboarding/composables/use-setup-wizard.ts',
      from: [
        'homeos/frontend/src/features/settings/groups/onboarding/composables/setup-wizard-core.internals.ts',
        'homeos/frontend/src/features/settings/groups/onboarding/composables/setup-wizard-doorbell.internals.ts',
        'homeos/frontend/src/features/settings/groups/onboarding/composables/setup-wizard-env.internals.ts',
        'homeos/frontend/src/features/settings/groups/onboarding/composables/setup-wizard-presence.internals.ts',
        'homeos/frontend/src/features/settings/groups/onboarding/composables/setup-wizard.internals.ts',
      ],
    },
    {
      into: 'homeos/frontend/src/features/settings/groups/perception/composables/use-agent-panel.ts',
      from: [
        'homeos/frontend/src/features/settings/groups/perception/composables/agent-panel-chat.internals.ts',
        'homeos/frontend/src/features/settings/groups/perception/composables/agent-panel-helpers.internals.ts',
        'homeos/frontend/src/features/settings/groups/perception/composables/agent-panel-stats.internals.ts',
        'homeos/frontend/src/features/settings/groups/perception/composables/agent-panel.internals.ts',
      ],
    },
    {
      into: 'homeos/frontend/src/features/settings/groups/perception/composables/use-alert-rules.ts',
      from: [
        'homeos/frontend/src/features/settings/groups/perception/composables/alert-rules-condition.internals.ts',
        'homeos/frontend/src/features/settings/groups/perception/composables/alert-rules-context.internals.ts',
        'homeos/frontend/src/features/settings/groups/perception/composables/alert-rules-crud.internals.ts',
        'homeos/frontend/src/features/settings/groups/perception/composables/alert-rules-dnd.internals.ts',
        'homeos/frontend/src/features/settings/groups/perception/composables/alert-rules-earthquake.internals.ts',
        'homeos/frontend/src/features/settings/groups/perception/composables/alert-rules-editor.internals.ts',
        'homeos/frontend/src/features/settings/groups/perception/composables/alert-rules-recommend.internals.ts',
        'homeos/frontend/src/features/settings/groups/perception/composables/alert-rules.internals.ts',
      ],
    },
    {
      into: 'homeos/frontend/src/features/settings/groups/appearance/composables/use-layout.ts',
      from: [
        'homeos/frontend/src/features/settings/groups/appearance/composables/layout-dashboard.ts',
        'homeos/frontend/src/features/settings/groups/appearance/composables/layout-panel-widgets.internals.ts',
      ],
    },
    {
      into: 'homeos/frontend/src/features/settings/groups/appearance/composables/use-layout-floating.ts',
      from: [
        'homeos/frontend/src/features/settings/groups/appearance/composables/layout-floating-afh-actions.internals.ts',
        'homeos/frontend/src/features/settings/groups/appearance/composables/layout-floating-display.internals.ts',
        'homeos/frontend/src/features/settings/groups/appearance/composables/layout-floating.internals.ts',
      ],
    },
  ],
}
