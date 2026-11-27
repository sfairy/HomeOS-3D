/**
 * S9b · 继续修正越界：把被 domain 反向引用的「纯领域工具」下沉。
 *
 * 判别标准：被 domain 引用、且本身不含页面/组件依赖的文件，属于「领域工具」，
 * 应放在 domain；反之才留在 features。
 */
const SRC = 'homeos/frontend/src'

export default {
  moves: [
    // list-page 原语的样式属于该原语
    { from: `${SRC}/app/styles/list-page.css`, to: `${SRC}/kernel/ui/list-page/styles/list-page.css` },
    { from: `${SRC}/app/styles/list-page-views.css`, to: `${SRC}/kernel/ui/list-page/styles/list-page-views.css` },
    { from: `${SRC}/app/styles/premium-head.css`, to: `${SRC}/kernel/ui/list-page/styles/premium-head.css` },
    { from: `${SRC}/app/styles/list-page-eager.css`, to: `${SRC}/kernel/ui/list-page/styles/list-page-eager.css` },
    {
      from: `${SRC}/app/styles/list-page-analytics.css`,
      to: `${SRC}/kernel/ui/list-page/styles/list-page-analytics.css`,
    },
    {
      from: `${SRC}/app/styles/list-page-dual-pane.css`,
      to: `${SRC}/kernel/ui/list-page/styles/list-page-dual-pane.css`,
    },

    // 授权门禁状态属 license 域（app 只做装配）
    { from: `${SRC}/app/router/license-gate.ts`, to: `${SRC}/domain/license/license-gate.ts` },

    // 设备组 / 实体属性格式化等纯领域工具
    {
      from: `${SRC}/features/device/model/utils/group-battery.util.ts`,
      to: `${SRC}/domain/entity/model/utils/group-battery.util.ts`,
    },
    {
      from: `${SRC}/features/device/model/utils/group-offline.util.ts`,
      to: `${SRC}/domain/entity/model/utils/group-offline.util.ts`,
    },
    {
      from: `${SRC}/features/device/model/utils/attr-format.util.ts`,
      to: `${SRC}/domain/entity/model/utils/attr-format.util.ts`,
    },
    {
      from: `${SRC}/features/device/model/utils/temperature-unit.util.ts`,
      to: `${SRC}/domain/entity/model/utils/temperature-unit.util.ts`,
    },
    {
      from: `${SRC}/features/device/composables/group-counts.util.ts`,
      to: `${SRC}/domain/entity/model/utils/group-counts.util.ts`,
    },
    { from: `${SRC}/features/device/model/climate-power.ts`, to: `${SRC}/domain/entity/model/climate-power.ts` },

    // 智能管家的快捷提示词是领域常量
    {
      from: `${SRC}/features/agent/model/constants/agent-quick-prompts.ts`,
      to: `${SRC}/domain/agent/constants/agent-quick-prompts.ts`,
    },

    // TTS 被实体弹窗复用 → 领域能力
    { from: `${SRC}/features/voice/composables/useTtsSpeak.ts`, to: `${SRC}/domain/voice/use-tts-speak.ts` },

    // 通知的「级别 → toast」「免打扰解析」是纯函数，被实体 WS 同步复用
    {
      from: `${SRC}/features/notifications/model/utils/ws-sync.util.ts`,
      to: `${SRC}/domain/notifications/utils/ws-sync.util.ts`,
    },
    {
      from: `${SRC}/features/notifications/model/utils/dnd.util.ts`,
      to: `${SRC}/domain/notifications/utils/dnd.util.ts`,
    },

    // 地震状态与告警开关被实体 WS 同步复用
    {
      from: `${SRC}/features/earthquake/store/earthquake.store.ts`,
      to: `${SRC}/domain/earthquake/earthquake.store.ts`,
    },
    {
      from: `${SRC}/features/earthquake/store/earthquake-layout.util.ts`,
      to: `${SRC}/domain/earthquake/earthquake-layout.util.ts`,
    },
  ],
}
