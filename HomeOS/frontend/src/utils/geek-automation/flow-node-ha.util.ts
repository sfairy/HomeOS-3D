/**
 * 极客自动化画布节点「需 HA」轻量判定
 *
 * 职责：
 * - 判定画布节点（触发 / 条件 / 动作）是否需要 HA 引擎支持。
 * - 仅用于节点 enrich 展示，不写回 geekGraph。
 *
 * 依赖：@/utils/orchestrator/automation-local-engine.util 的能力支持判定与 EngineCapabilitiesHint。
 *
 * 注意：
 * - 节点 kind（trigger / condition / action）为标识符，不翻译。
 * - 仅面向用户的提示文案使用简体中文。
 */
import {
  isFormActionUnsupported,
  isFormActionUnsupportedForScript,
  isFormConditionUnsupported,
  isFormTriggerUnsupported,
  type EngineCapabilitiesHint,
} from '@/utils/orchestrator/automation-local-engine.util'

type FlowNodeHaData = {
  kind?: string
  trigger?: { type?: string }
  condition?: { operator?: string }
  action?: { type?: string }
}

/**
 * @param data 节点 data
 * @param mode automation | script
 * @param caps 可选引擎能力
 */
export function flowNodeNeedsHa(
  data: FlowNodeHaData | null | undefined,
  mode: 'automation' | 'script' | string = 'automation',
  caps?: EngineCapabilitiesHint | null,
): boolean {
  if (!data?.kind) return false
  if (data.kind === 'trigger' && data.trigger?.type) {
    return isFormTriggerUnsupported(data.trigger.type, caps)
  }
  if (data.kind === 'condition' && data.condition?.operator) {
    return isFormConditionUnsupported(data.condition.operator, caps)
  }
  if (data.kind === 'action' && data.action?.type) {
    if (mode === 'script') {
      return isFormActionUnsupportedForScript(data.action.type, caps)
    }
    return isFormActionUnsupported(data.action.type, caps)
  }
  return false
}
