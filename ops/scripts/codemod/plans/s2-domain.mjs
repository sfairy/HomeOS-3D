/**
 * S2 · 抽出 domain 层（L1 共享领域）。
 *
 * 依据：计划 §4.2。domain 只放「被多个业务模块共享、且不含具体页面」的领域能力：
 *   entity    实体状态机 + WS 同步 + 投影 + 乐观更新 + 设备组 + 实体选择控件
 *   layout    布局配置 / 编辑历史 / 仪表板切片 / 持久化
 *   widget    部件宿主（注册表 / 高度 / 画像过滤）
 *   recommend 推荐引擎
 *   client    终端身份与标签
 *   status    家庭状态总览聚合
 */
export default {
  dirMoves: [
    // —— entity ——
    { from: 'homeos/frontend/src/shared/entity', to: 'homeos/frontend/src/domain/entity/model' },
    { from: 'homeos/frontend/src/stores/entities', to: 'homeos/frontend/src/domain/entity/store' },
    { from: 'homeos/frontend/src/composables/entity', to: 'homeos/frontend/src/domain/entity/composables' },
    {
      from: 'homeos/frontend/src/components/common/entity-input',
      to: 'homeos/frontend/src/domain/entity/components/entity-input',
    },
    {
      from: 'homeos/frontend/src/components/common/entity-multi-select',
      to: 'homeos/frontend/src/domain/entity/components/entity-multi-select',
    },

    // —— layout ——
    { from: 'homeos/frontend/src/stores/ui', to: 'homeos/frontend/src/domain/layout/store' },
    { from: 'homeos/frontend/src/composables/config', to: 'homeos/frontend/src/domain/layout/composables' },

    // —— widget ——
    { from: 'homeos/frontend/src/shared/widget', to: 'homeos/frontend/src/domain/widget' },
    { from: 'homeos/frontend/src/composables/widget', to: 'homeos/frontend/src/domain/widget/composables' },

    // —— recommend / client / status ——
    { from: 'homeos/frontend/src/shared/recommend', to: 'homeos/frontend/src/domain/recommend' },
    { from: 'homeos/frontend/src/shared/client', to: 'homeos/frontend/src/domain/client' },
    { from: 'homeos/frontend/src/shared/status', to: 'homeos/frontend/src/domain/status' },
    { from: 'homeos/frontend/src/composables/home', to: 'homeos/frontend/src/domain/status/composables' },
  ],
  moves: [
    // —— entity store 入口 ——
    {
      from: 'homeos/frontend/src/stores/entities.store.ts',
      to: 'homeos/frontend/src/domain/entity/store/entities.store.ts',
    },
    // —— layout store 入口与类型 ——
    {
      from: 'homeos/frontend/src/stores/layout.store.ts',
      to: 'homeos/frontend/src/domain/layout/store/layout.store.ts',
    },
    { from: 'homeos/frontend/src/kernel/types/layout.ts', to: 'homeos/frontend/src/domain/layout/types.ts' },

    // —— 依赖 layout store 的 composables ——
    {
      from: 'homeos/frontend/src/composables/ui/useLayoutConfigRef.ts',
      to: 'homeos/frontend/src/domain/layout/composables/use-layout-config-ref.ts',
    },
    {
      from: 'homeos/frontend/src/composables/ui/kiosk-animation.ts',
      to: 'homeos/frontend/src/domain/layout/composables/kiosk-animation.ts',
    },
    {
      from: 'homeos/frontend/src/kernel/ui/hooks/use-perf-clock.ts',
      to: 'homeos/frontend/src/domain/layout/composables/use-perf-clock.ts',
    },

    // —— 依赖 layout store 的对话框 ——
    {
      from: 'homeos/frontend/src/kernel/ui/ExitEditConfirmDialog.vue',
      to: 'homeos/frontend/src/domain/layout/components/ExitEditConfirmDialog.vue',
    },

    // —— 依赖 entity store 的横幅与 hook ——
    {
      from: 'homeos/frontend/src/kernel/ui/HaDegradeBanner.vue',
      to: 'homeos/frontend/src/domain/entity/components/HaDegradeBanner.vue',
    },
    {
      from: 'homeos/frontend/src/kernel/ui/HaStatusDegradeBanner.vue',
      to: 'homeos/frontend/src/domain/entity/components/HaStatusDegradeBanner.vue',
    },
    {
      from: 'homeos/frontend/src/composables/ui/useHaDegrade.ts',
      to: 'homeos/frontend/src/domain/entity/composables/use-ha-degrade.ts',
    },
  ],
}
