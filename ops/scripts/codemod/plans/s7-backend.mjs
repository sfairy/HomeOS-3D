/**
 * S7 · 后端按能力并组。
 *
 * 依据：计划 §5.7。判据是「同一能力」，不是文件数：
 * - weather / iaq / circadian 都是「居住环境感知」→ domains/environment
 * - 顶层 panel/ 是面板文档能力 → domains/panel
 * - fonts / retention 是静态资源与数据生命周期基础设施 → platform/core
 * - store（商店发现与许可校验）→ domains/license
 * - state_store 实际职责是实体引用完整性 → domains/entity_state
 * - device_timer 属电源管理 → domains/client_power/timer
 */
const B = 'homeos/backend/src'

export default {
  dirMoves: [
    { from: `${B}/panel`, to: `${B}/domains/panel` },
    { from: `${B}/domains/weather`, to: `${B}/domains/environment/weather` },
    { from: `${B}/domains/iaq`, to: `${B}/domains/environment/iaq` },
    { from: `${B}/domains/circadian`, to: `${B}/domains/environment/circadian` },
    { from: `${B}/domains/lifestyle`, to: `${B}/domains/media/lifestyle` },
    { from: `${B}/domains/home_exec`, to: `${B}/domains/automation/exec` },
    { from: `${B}/domains/state_store`, to: `${B}/domains/entity_state` },
    { from: `${B}/domains/fonts`, to: `${B}/platform/core/fonts` },
    { from: `${B}/domains/retention`, to: `${B}/platform/core/retention` },
    { from: `${B}/domains/store`, to: `${B}/domains/license/store` },
    { from: `${B}/domains/projects`, to: `${B}/domains/studio3d/projects` },
    { from: `${B}/domains/device_timer`, to: `${B}/domains/client_power/timer` },
  ],
  // 注意：api/*.py 的碎片合并**不做**。每个路由模块都定义 `router`，
  // 朴素拼接会让后一个覆盖前一个（路由静默丢失）。要合并必须先人工重命名
  // 各模块的 router 变量并逐个 include，属于需要评审的改动，不放进机械 codemod。
}
