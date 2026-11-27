/**
 * S5b · 清空最后的遗留目录（`stores/` `components/`），并把 shared 能源模型下沉到 domain。
 *
 * 归属判据：
 * - 被 ≥3 个域使用的状态 → domain（`ha-connection` 被 settings/security/earthquake/device/media/app 共用）
 * - 单域状态 → 该 feature（auth / earthquake）
 * - 能源模型与令牌常量被 layout 默认值、仪表板、设置页共用 → domain/energy
 */
const SRC = 'homeos/frontend/src'

export default {
  dirMoves: [
    { from: `${SRC}/stores/earthquake`, to: `${SRC}/features/earthquake/store` },
    { from: `${SRC}/features/energy/model`, to: `${SRC}/domain/energy/model` },
    { from: `${SRC}/components/entities/styles`, to: `${SRC}/features/entity/components/styles` },
    { from: `${SRC}/components/widgets/styles`, to: `${SRC}/domain/widget/styles` },
  ],
  moves: [
    // —— stores 拆分 ——
    { from: `${SRC}/stores/auth.store.ts`, to: `${SRC}/features/auth/store/auth.store.ts` },
    { from: `${SRC}/stores/earthquake.store.ts`, to: `${SRC}/features/earthquake/store/earthquake.store.ts` },
    { from: `${SRC}/stores/ha-connection.store.ts`, to: `${SRC}/domain/ha/ha-connection.store.ts` },
    { from: `${SRC}/stores/defaults.ts`, to: `${SRC}/domain/layout/store/defaults.ts` },
    { from: `${SRC}/stores/studio-editor.store.ts`, to: `${SRC}/studio/app/state/studio-editor.store.ts` },
    { from: `${SRC}/stores/studio-floorplan.store.ts`, to: `${SRC}/studio/app/state/studio-floorplan.store.ts` },

    // —— 能源常量与令牌（被 kernel/constants 与 layout 默认值共用）——
    {
      from: `${SRC}/kernel/constants/account-binding-meta.ts`,
      to: `${SRC}/domain/energy/constants/account-binding-meta.ts`,
    },
    { from: `${SRC}/kernel/constants/dashboard-footer.ts`, to: `${SRC}/domain/energy/constants/dashboard-footer.ts` },
    {
      from: `${SRC}/kernel/constants/utility-meter-presets.ts`,
      to: `${SRC}/domain/energy/constants/utility-meter-presets.ts`,
    },

    // —— 剩余组件 ——
    {
      from: `${SRC}/components/entities/EntityControlHost.vue`,
      to: `${SRC}/features/entity/components/EntityControlHost.vue`,
    },
    {
      from: `${SRC}/components/entities/EntityPickModal.vue`,
      to: `${SRC}/features/entity/components/EntityPickModal.vue`,
    },
    { from: `${SRC}/components/entities/popup-registry.ts`, to: `${SRC}/features/entity/components/popup-registry.ts` },
    {
      from: `${SRC}/components/widgets/QuickActionsCard.vue`,
      to: `${SRC}/domain/widget/components/QuickActionsCard.vue`,
    },
    { from: `${SRC}/components/widgets/quick-actions.config.ts`, to: `${SRC}/domain/widget/quick-actions.config.ts` },
    { from: `${SRC}/components/common/scene-values.ts`, to: `${SRC}/features/auth/model/scene-values.ts` },

    // —— 组件样式跟随宿主 ——
    {
      from: `${SRC}/components/common/styles/asset-picker-modal.css`,
      to: `${SRC}/kernel/ui/asset-picker/styles/asset-picker-modal.css`,
    },
    {
      from: `${SRC}/components/common/styles/asset-grid-item.css`,
      to: `${SRC}/kernel/ui/asset-picker/styles/asset-grid-item.css`,
    },
    {
      from: `${SRC}/components/common/styles/footer-icon-picker.css`,
      to: `${SRC}/kernel/ui/styles/footer-icon-picker.css`,
    },
    { from: `${SRC}/components/common/styles/error-boundary.css`, to: `${SRC}/kernel/ui/styles/error-boundary.css` },
    { from: `${SRC}/components/common/styles/status-hint.css`, to: `${SRC}/kernel/ui/styles/status-hint.css` },
    {
      from: `${SRC}/components/common/styles/presence-person-list-input.css`,
      to: `${SRC}/features/presence/components/styles/presence-person-list-input.css`,
    },
    {
      from: `${SRC}/components/common/styles/recommend-insight-card.css`,
      to: `${SRC}/domain/recommend/components/styles/recommend-insight-card.css`,
    },
    {
      from: `${SRC}/components/modals/styles/settings-lock-modal.css`,
      to: `${SRC}/features/settings/components/styles/settings-lock-modal.css`,
    },
    {
      from: `${SRC}/components/modals/styles/notification-drawer.css`,
      to: `${SRC}/features/notifications/components/styles/notification-drawer.css`,
    },
  ],
}
