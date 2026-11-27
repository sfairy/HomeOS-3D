/**
 * S3a · 资源访问层与 shared 域下沉。
 *
 * 依据：计划 §4.3 / §5.5 / §5.6。
 * - `services/api/**` → `domain/api/**`：资源访问是被 domain 与 features 共享的 L1 能力
 *   （domain/entity/store 需要 entities API，domain/layout 需要 config API）。
 *   放进某个 feature 会让 L1 反向依赖 L2。
 * - `shared/<业务域>/**` → `features/<域>/**`：这些是业务域的数据模型与工具，不是跨域设施。
 */
export default {
  dirMoves: [
    // —— 资源访问层 ——
    { from: 'homeos/frontend/src/services/api', to: 'homeos/frontend/src/domain/api' },

    // —— shared 业务域 → features ——
    { from: 'homeos/frontend/src/shared/agent', to: 'homeos/frontend/src/features/agent/model' },
    { from: 'homeos/frontend/src/shared/device', to: 'homeos/frontend/src/features/device/model' },
    { from: 'homeos/frontend/src/shared/camera', to: 'homeos/frontend/src/features/device/camera' },
    { from: 'homeos/frontend/src/shared/earthquake', to: 'homeos/frontend/src/features/earthquake/model' },
    { from: 'homeos/frontend/src/shared/energy', to: 'homeos/frontend/src/features/energy/model' },
    { from: 'homeos/frontend/src/shared/events', to: 'homeos/frontend/src/features/events/model' },
    { from: 'homeos/frontend/src/shared/floorplan', to: 'homeos/frontend/src/features/settings/model/floorplan' },
    { from: 'homeos/frontend/src/shared/home-mode', to: 'homeos/frontend/src/features/home-mode/model' },
    { from: 'homeos/frontend/src/shared/notifications', to: 'homeos/frontend/src/features/notifications/model' },
    { from: 'homeos/frontend/src/shared/presence', to: 'homeos/frontend/src/features/presence/model' },
    { from: 'homeos/frontend/src/shared/security', to: 'homeos/frontend/src/features/security/model' },
    { from: 'homeos/frontend/src/shared/voice', to: 'homeos/frontend/src/features/voice/model' },
    { from: 'homeos/frontend/src/shared/weather', to: 'homeos/frontend/src/features/weather/model' },

    // —— composables 业务域 → features ——
    { from: 'homeos/frontend/src/composables/device', to: 'homeos/frontend/src/features/device/composables' },
    { from: 'homeos/frontend/src/composables/earthquake', to: 'homeos/frontend/src/features/earthquake/composables' },
    { from: 'homeos/frontend/src/composables/energy', to: 'homeos/frontend/src/features/energy/composables' },
    { from: 'homeos/frontend/src/composables/security', to: 'homeos/frontend/src/features/security/composables' },
    { from: 'homeos/frontend/src/composables/voice', to: 'homeos/frontend/src/features/voice/composables' },
    { from: 'homeos/frontend/src/composables/auth', to: 'homeos/frontend/src/features/auth/composables' },
    { from: 'homeos/frontend/src/composables/api', to: 'homeos/frontend/src/features/settings/composables' },
    { from: 'homeos/frontend/src/composables/life', to: 'homeos/frontend/src/features/settings/composables/life' },
    { from: 'homeos/frontend/src/composables/settings-kernel', to: 'homeos/frontend/src/features/settings/kernel' },

    // —— components 归位 ——
    { from: 'homeos/frontend/src/components/dashboard', to: 'homeos/frontend/src/features/dashboard/components' },
    {
      from: 'homeos/frontend/src/components/entities/popups',
      to: 'homeos/frontend/src/features/entity/components/popups',
    },
    {
      from: 'homeos/frontend/src/components/entities/device-group',
      to: 'homeos/frontend/src/features/device/components/device-group',
    },
    {
      from: 'homeos/frontend/src/components/shell/agent-companion',
      to: 'homeos/frontend/src/features/agent/components/agent-companion',
    },
    { from: 'homeos/frontend/src/components/setup', to: 'homeos/frontend/src/features/settings/components/setup' },
    { from: 'homeos/frontend/src/components/widgets/weather', to: 'homeos/frontend/src/features/weather/components' },
    {
      from: 'homeos/frontend/src/components/widgets/security',
      to: 'homeos/frontend/src/features/security/components/widgets',
    },
    {
      from: 'homeos/frontend/src/components/widgets/climate',
      to: 'homeos/frontend/src/features/energy/components/climate',
    },
    { from: 'homeos/frontend/src/components/widgets/media', to: 'homeos/frontend/src/features/media/components' },
    {
      from: 'homeos/frontend/src/components/widgets/agent',
      to: 'homeos/frontend/src/features/agent/components/widgets',
    },
    {
      from: 'homeos/frontend/src/components/widgets/system',
      to: 'homeos/frontend/src/features/notifications/components/widgets',
    },
    { from: 'homeos/frontend/src/components/widgets/shared', to: 'homeos/frontend/src/domain/widget/components' },
  ],
  moves: [
    // 通用部件注册表与样式留在 domain/widget
    {
      from: 'homeos/frontend/src/components/widgets/widget-registry.ts',
      to: 'homeos/frontend/src/domain/widget/widget-registry.ts',
    },
    {
      from: 'homeos/frontend/src/components/HaCameraStream.vue',
      to: 'homeos/frontend/src/features/device/components/HaCameraStream.vue',
    },
    {
      from: 'homeos/frontend/src/shared/components/auth/AuthShell.vue',
      to: 'homeos/frontend/src/features/auth/components/AuthShell.vue',
    },
  ],
}
