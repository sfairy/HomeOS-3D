/** 按前缀功能族合并（由 plan-families.mjs 生成）。 */
export default {
  merges: [
    {
      into: 'homeos/frontend/src/studio/app/shared/ui.ts',
      from: [
        'homeos/frontend/src/studio/app/shared/ui-confirm.ts',
        'homeos/frontend/src/studio/app/shared/ui-icons.ts',
      ],
    },
    {
      into: 'homeos/frontend/src/studio/app/editor/dashboard.ts',
      from: [
        'homeos/frontend/src/studio/app/editor/dashboard-font-settings.ts',
        'homeos/frontend/src/studio/app/editor/dashboard-resize.ts',
      ],
    },
    {
      into: 'homeos/frontend/src/studio/app/editor/editor.ts',
      from: [
        'homeos/frontend/src/studio/app/editor/editor-canvas-navigation.ts',
        'homeos/frontend/src/studio/app/editor/editor-component-collections.ts',
        'homeos/frontend/src/studio/app/editor/editor-dialogs.ts',
        'homeos/frontend/src/studio/app/editor/editor-document-management.ts',
        'homeos/frontend/src/studio/app/editor/editor-history.ts',
        'homeos/frontend/src/studio/app/editor/editor-selection-tools.ts',
        'homeos/frontend/src/studio/app/editor/editor-utils.ts',
      ],
    },
    {
      into: 'homeos/frontend/src/studio/app/logging/global-log.ts',
      from: [
        'homeos/frontend/src/studio/app/logging/global-log-boot.ts',
        'homeos/frontend/src/studio/app/logging/global-log.ts',
      ],
    },
  ],
}
