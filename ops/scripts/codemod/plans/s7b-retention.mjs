/**
 * S7b · 把 retention 放回 domains。
 *
 * 依据：`platform/core/retention/service.py` 需要 `domains.logs.event_stats_rollup.prune_before`，
 * 一旦放进 platform 就产生 platform → domains 的反向边（B1 违约），并把
 * platform.core 拉进一个巨大的包级强连通分量。retention 的职责里包含「日志保留策略」，
 * 属于领域能力而不是基础设施，因此回到 domains/retention。
 */
const B = 'homeos/backend/src'

export default {
  dirMoves: [{ from: `${B}/platform/core/retention`, to: `${B}/domains/retention` }],
}
