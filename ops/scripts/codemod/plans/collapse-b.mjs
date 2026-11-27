/** 目录级合并（批次 B，由脚本生成）：目录内 .ts 并成同名单文件。 */
export default {
  dirCollapse: [
    { from: 'homeos/frontend/src/studio/shims', to: 'homeos/frontend/src/studio/shims.ts' },
    { from: 'homeos/frontend/src/kernel/utils/settings', to: 'homeos/frontend/src/kernel/utils/settings.ts' },
    { from: 'homeos/frontend/src/kernel/utils/ha', to: 'homeos/frontend/src/kernel/utils/ha.ts' },
    { from: 'homeos/frontend/src/kernel/utils/auth', to: 'homeos/frontend/src/kernel/utils/auth.ts' },
    { from: 'homeos/frontend/src/domain/license', to: 'homeos/frontend/src/domain/license.ts' },
    {
      from: 'homeos/frontend/src/features/presence/model/utils',
      to: 'homeos/frontend/src/features/presence/model/utils.ts',
    },
    { from: 'homeos/frontend/src/studio/authoring/geometry', to: 'homeos/frontend/src/studio/authoring/geometry.ts' },
    {
      from: 'homeos/frontend/src/domain/entity/model/utils/control',
      to: 'homeos/frontend/src/domain/entity/model/utils/control.ts',
    },
    {
      from: 'homeos/frontend/src/features/presence/model/composables',
      to: 'homeos/frontend/src/features/presence/model/composables.ts',
    },
    {
      from: 'homeos/frontend/src/studio/authoring/render-kit',
      to: 'homeos/frontend/src/studio/authoring/render-kit.ts',
    },
    { from: 'homeos/frontend/src/studio/app/editor/picker', to: 'homeos/frontend/src/studio/app/editor/picker.ts' },
    {
      from: 'homeos/frontend/src/features/device/model/utils',
      to: 'homeos/frontend/src/features/device/model/utils.ts',
    },
    { from: 'homeos/frontend/src/features/voice/model/utils', to: 'homeos/frontend/src/features/voice/model/utils.ts' },
    { from: 'homeos/frontend/src/domain/status/composables', to: 'homeos/frontend/src/domain/status/composables.ts' },
    { from: 'homeos/frontend/src/features/agent/model/utils', to: 'homeos/frontend/src/features/agent/model/utils.ts' },
    { from: 'homeos/frontend/src/studio/engine', to: 'homeos/frontend/src/studio/engine.ts' },
    {
      from: 'homeos/frontend/src/features/security/model/utils',
      to: 'homeos/frontend/src/features/security/model/utils.ts',
    },
    {
      from: 'homeos/frontend/src/domain/energy/model/composables',
      to: 'homeos/frontend/src/domain/energy/model/composables.ts',
    },
    {
      from: 'homeos/frontend/src/features/weather/model/utils',
      to: 'homeos/frontend/src/features/weather/model/utils.ts',
    },
    { from: 'homeos/frontend/src/workers', to: 'homeos/frontend/src//workers.ts' },
    {
      from: 'homeos/frontend/src/studio/app/editor/home/entity',
      to: 'homeos/frontend/src/studio/app/editor/home/entity.ts',
    },
    { from: 'homeos/frontend/src/kernel/utils/chart', to: 'homeos/frontend/src/kernel/utils/chart.ts' },
    { from: 'homeos/frontend/src/domain/client/utils', to: 'homeos/frontend/src/domain/client/utils.ts' },
    { from: 'homeos/frontend/src/kernel/utils/format', to: 'homeos/frontend/src/kernel/utils/format.ts' },
    {
      from: 'homeos/frontend/src/features/events/composables',
      to: 'homeos/frontend/src/features/events/composables.ts',
    },
    { from: 'homeos/frontend/src/features/security/utils', to: 'homeos/frontend/src/features/security/utils.ts' },
    { from: 'homeos/frontend/src/studio/app/shared/camera', to: 'homeos/frontend/src/studio/app/shared/camera.ts' },
    { from: 'homeos/frontend/src/domain/camera', to: 'homeos/frontend/src/domain/camera.ts' },
    { from: 'homeos/frontend/src/app/shell/composables', to: 'homeos/frontend/src/app/shell/composables.ts' },
    { from: 'homeos/frontend/src/domain/energy/constants', to: 'homeos/frontend/src/domain/energy/constants.ts' },
    {
      from: 'homeos/frontend/src/domain/entity/composables/device-group',
      to: 'homeos/frontend/src/domain/entity/composables/device-group.ts',
    },
    { from: 'homeos/frontend/src/studio/app/bridge/presets', to: 'homeos/frontend/src/studio/app/bridge/presets.ts' },
    {
      from: 'homeos/frontend/src/features/notifications/composables',
      to: 'homeos/frontend/src/features/notifications/composables.ts',
    },
    { from: 'homeos/frontend/src/domain/widget/composables', to: 'homeos/frontend/src/domain/widget/composables.ts' },
    { from: 'homeos/frontend/src/studio/app/shared/scene', to: 'homeos/frontend/src/studio/app/shared/scene.ts' },
    {
      from: 'homeos/frontend/src/studio/app/editor/home/components',
      to: 'homeos/frontend/src/studio/app/editor/home/components.ts',
    },
    { from: 'homeos/frontend/src/kernel/http', to: 'homeos/frontend/src/kernel/http.ts' },
    {
      from: 'homeos/frontend/src/studio/authoring/scene/payload',
      to: 'homeos/frontend/src/studio/authoring/scene/payload.ts',
    },
    {
      from: 'homeos/frontend/src/studio/authoring/lights/strip-light',
      to: 'homeos/frontend/src/studio/authoring/lights/strip-light.ts',
    },
    {
      from: 'homeos/frontend/src/kernel/utils/config/system-config',
      to: 'homeos/frontend/src/kernel/utils/config/system-config.ts',
    },
    {
      from: 'homeos/frontend/src/features/dashboard/composables/screensaver',
      to: 'homeos/frontend/src/features/dashboard/composables/screensaver.ts',
    },
    { from: 'homeos/frontend/src/kernel/ui/popup', to: 'homeos/frontend/src/kernel/ui/popup.ts' },
    {
      from: 'homeos/frontend/src/studio/app/shared/scene/window',
      to: 'homeos/frontend/src/studio/app/shared/scene/window.ts',
    },
    { from: 'homeos/frontend/src/domain/recommend/utils', to: 'homeos/frontend/src/domain/recommend/utils.ts' },
    { from: 'homeos/frontend/src/kernel/utils/layout', to: 'homeos/frontend/src/kernel/utils/layout.ts' },
    {
      from: 'homeos/frontend/src/features/settings/groups/system/composables',
      to: 'homeos/frontend/src/features/settings/groups/system/composables.ts',
    },
    { from: 'homeos/frontend/src/kernel/utils/core', to: 'homeos/frontend/src/kernel/utils/core.ts' },
    { from: 'homeos/frontend/src/domain/layout/composables', to: 'homeos/frontend/src/domain/layout/composables.ts' },
    { from: 'homeos/frontend/src/kernel/utils/perf', to: 'homeos/frontend/src/kernel/utils/perf.ts' },
    { from: 'homeos/frontend/src/studio/app/editor/home', to: 'homeos/frontend/src/studio/app/editor/home.ts' },
    {
      from: 'homeos/frontend/src/features/earthquake/composables',
      to: 'homeos/frontend/src/features/earthquake/composables.ts',
    },
    {
      from: 'homeos/frontend/src/studio/authoring/persistence',
      to: 'homeos/frontend/src/studio/authoring/persistence.ts',
    },
    { from: 'homeos/frontend/src/studio/app/bridge/scene', to: 'homeos/frontend/src/studio/app/bridge/scene.ts' },
    { from: 'homeos/frontend/src/kernel/constants', to: 'homeos/frontend/src/kernel/constants.ts' },
    {
      from: 'homeos/frontend/src/studio/authoring/materials/natural-wood',
      to: 'homeos/frontend/src/studio/authoring/materials/natural-wood.ts',
    },
    { from: 'homeos/frontend/src/kernel/utils/registry', to: 'homeos/frontend/src/kernel/utils/registry.ts' },
    { from: 'homeos/frontend/src/domain/entity/store/ws', to: 'homeos/frontend/src/domain/entity/store/ws.ts' },
    { from: 'homeos/frontend/src/studio/app/display', to: 'homeos/frontend/src/studio/app/display.ts' },
    {
      from: 'homeos/frontend/src/studio/app/editor/component-templates',
      to: 'homeos/frontend/src/studio/app/editor/component-templates.ts',
    },
    {
      from: 'homeos/frontend/src/features/energy/composables',
      to: 'homeos/frontend/src/features/energy/composables.ts',
    },
    { from: 'homeos/frontend/src/studio/app/editor/bindings', to: 'homeos/frontend/src/studio/app/editor/bindings.ts' },
    { from: 'homeos/frontend/src/kernel/utils/ui', to: 'homeos/frontend/src/kernel/utils/ui.ts' },
    {
      from: 'homeos/frontend/src/domain/entity/composables/popup',
      to: 'homeos/frontend/src/domain/entity/composables/popup.ts',
    },
    {
      from: 'homeos/frontend/src/studio/app/editor/inspectors',
      to: 'homeos/frontend/src/studio/app/editor/inspectors.ts',
    },
    { from: 'homeos/frontend/src/studio/platform', to: 'homeos/frontend/src/studio/platform.ts' },
    { from: 'homeos/frontend/src/studio/app/shared/device', to: 'homeos/frontend/src/studio/app/shared/device.ts' },
    { from: 'homeos/frontend/src/features/voice/composables', to: 'homeos/frontend/src/features/voice/composables.ts' },
    {
      from: 'homeos/frontend/src/studio/app/renderer/registry/components',
      to: 'homeos/frontend/src/studio/app/renderer/registry/components.ts',
    },
    {
      from: 'homeos/frontend/src/studio/app/renderer/panel-seams/selection',
      to: 'homeos/frontend/src/studio/app/renderer/panel-seams/selection.ts',
    },
    {
      from: 'homeos/frontend/src/studio/authoring/scene/walls',
      to: 'homeos/frontend/src/studio/authoring/scene/walls.ts',
    },
    {
      from: 'homeos/frontend/src/studio/app/editor/home/elements',
      to: 'homeos/frontend/src/studio/app/editor/home/elements.ts',
    },
    { from: 'homeos/frontend/src/kernel/types', to: 'homeos/frontend/src/kernel/types.ts' },
    { from: 'homeos/frontend/src/studio/authoring/cache', to: 'homeos/frontend/src/studio/authoring/cache.ts' },
    { from: 'homeos/frontend/src/kernel/ui/hooks', to: 'homeos/frontend/src/kernel/ui/hooks.ts' },
    { from: 'homeos/frontend/src/studio/authoring/scene', to: 'homeos/frontend/src/studio/authoring/scene.ts' },
  ],
}
