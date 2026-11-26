/**
 * S9a · 按职责修正越界依赖（kernel/domain 反向引用上层）。
 *
 * 每一条都是「文件放错了层」，不是规则太严：
 * - 被 entity/layout/widget 共用的 **auth store** 不是页面能力 → domain/auth
 * - **widget-registry** 映射部件类型 → 具体组件，是装配职责 → app/
 * - **shell teleport 目标**是纯 DOM 设施 → kernel/ui/shell
 * - **asset-picker / AssetPickerModal** 依赖 config API，是设置页能力 → features/settings
 * - **HosSelect / SearchableSelect** 依赖实体选择提示 → domain/entity
 * - 依赖 domain/layout 类型的常量 → domain/layout
 * - 依赖 license api 的探测工具 → domain/license
 * - 依赖 agent 常量与 system api 的 frontend-config → domain/config
 * - 依赖实体派生工具的 scene-script → domain/entity
 * - list-page 的懒加载样式属于该原语 → kernel/ui/list-page
 */
const SRC = 'homeos/frontend/src'

export default {
  dirMoves: [
    { from: `${SRC}/app/styles/lazy`, to: `${SRC}/kernel/ui/list-page/lazy` },
    { from: `${SRC}/kernel/ui/asset-picker`, to: `${SRC}/features/settings/components/asset-picker` },
  ],
  moves: [
    // auth store：entity 状态机、layout 持久化、通知中心都要用 → 领域层
    { from: `${SRC}/features/auth/store/auth.store.ts`, to: `${SRC}/domain/auth/auth.store.ts` },

    // material 注册表是装配职责 → app
    { from: `${SRC}/domain/widget/widget-registry.ts`, to: `${SRC}/app/widget-registry.ts` },

    // 纯 DOM 设施 → kernel
    { from: `${SRC}/app/shell/composables/useShellTeleportTarget.ts`, to: `${SRC}/kernel/ui/shell/use-shell-teleport-target.ts` },
    { from: `${SRC}/app/shell/composables/useTeleportTargetGuard.ts`, to: `${SRC}/kernel/ui/shell/use-teleport-target-guard.ts` },

    // 依赖 config API 的资产选择 → 设置页
    { from: `${SRC}/kernel/ui/AssetPickerModal.vue`, to: `${SRC}/features/settings/components/asset-picker/AssetPickerModal.vue` },

    // 实体选择控件 → 实体域
    { from: `${SRC}/kernel/ui/primitives/HosSelect.vue`, to: `${SRC}/domain/entity/components/entity-select/HosSelect.vue` },
    { from: `${SRC}/kernel/ui/primitives/SearchableSelect.vue`, to: `${SRC}/domain/entity/components/entity-select/SearchableSelect.vue` },

    // 依赖 layout 类型的常量 → layout 域
    { from: `${SRC}/kernel/constants/security-emergency.ts`, to: `${SRC}/domain/layout/constants/security-emergency.ts` },
    { from: `${SRC}/kernel/types/floating-hub.ts`, to: `${SRC}/domain/layout/types/floating-hub.ts` },

    // 依赖 license api 的工具 → license 域
    { from: `${SRC}/kernel/utils/auth/license-probe.util.ts`, to: `${SRC}/domain/license/license-probe.util.ts` },
    { from: `${SRC}/kernel/utils/core/post-restore.util.ts`, to: `${SRC}/domain/license/post-restore.util.ts` },

    // 依赖 agent 常量与 system api 的配置聚合 → domain/config
    { from: `${SRC}/kernel/utils/config/frontend-config.ts`, to: `${SRC}/domain/config/frontend-config.ts` },

    // 依赖实体派生工具 → entity 域
    { from: `${SRC}/kernel/utils/ha/scene-script.util.ts`, to: `${SRC}/domain/entity/model/utils/scene-script.util.ts` },
  ],
}
