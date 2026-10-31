/**
 * @file optimistic-expectation.util.ts
 * @module frontend/src/stores
 * 乐观更新「目标态是否已满足」判定（纯函数，无 Vue / store 依赖）。
 *
 * 单独成文件的原因：这条判据同时被三处使用，且必须能脱离运行时单测
 * （实体 store 的乐观模块会 import Vue 与 chrome store，node --test 拉不起来）：
 * 1. `callService` 建立乐观态**之前**的短路；
 * 2. WS 推送到达时的确认判定（`composables/entity/ws/state-update.ts`）；
 * 3. TTL 到期时的兜底判定 + REST 确认。
 *
 * 三者共用同一份真相源，避免出现「一处认为可跳过、另一处却认为未确认」的漂移。
 */
import { attrValueEquals } from '@homeos/shared'
import type { HaEntityState, OptimisticPrediction } from '@/shared/types/entity-store'

/** TTL 到期但目标态未达成时的提示（与「下发失败」严格区分：这里只代表没等到确认） */
export const OPTIMISTIC_TIMEOUT_MESSAGE = '未收到设备确认，已恢复显示'

/**
 * 判断实体当前值是否**已经满足**一条乐观预测（state 与预测里的每个属性都一致）。
 *
 * 为什么必须有这条短路：HA 只在状态**真的变化**时推 `state_changed`。对已经关掉的灯
 * 再下发 `turn_off`，服务端既不推事件、REST 也返回同一份状态，前端却照样建立乐观态
 * 并布了 TTL —— 到期必然误报一次「未生效」。这不是设备问题，是判据缺失。
 *
 * @param expected 预测（为空视为已满足：没有可等的东西）
 * @param entity 当前实体（缺失时无法判定，按未满足处理以保留操作反馈）
 * @returns true 表示现值已满足预测，无需等待确认
 */
export function optimisticExpectationSatisfied(
  expected: OptimisticPrediction | null | undefined,
  entity: HaEntityState | null | undefined,
): boolean {
  if (!expected) return true
  if (!entity) return false
  if (expected.state !== undefined && entity.state !== expected.state) return false
  const expectedAttrs = expected.attributes
  if (!expectedAttrs) return true
  const attrs = entity.attributes || {}
  for (const key of Object.keys(expectedAttrs)) {
    if (!attrValueEquals(attrs[key], expectedAttrs[key])) return false
  }
  return true
}
