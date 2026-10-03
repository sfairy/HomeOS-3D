/**
 * 脚本 YAML 导入损失分析
 *
 * 职责：粘贴 / 导入脚本 YAML 时统计未能还原的动作数、分支条件降级、HA-only 特性等，
 * 并产出提示文案与批量导入摘要。
 *
 * 依赖：
 * - @homeos/shared 的 loadHaYaml、toUnknownList。
 * - ./yaml-action-parse.util 的动作序列解析。
 * - ./automation-local-engine.util 的本地执行能力差异。
 * - ./yaml-action-import-loss.util 的损失计数工具。
 * - ./yaml-import-bulk-summary.util 的批量导入摘要工厂。
 *
 * 注意：HA 特性 label / 字段名为配置值，不翻译；仅提示文案使用简体中文。
 */
import { loadHaYaml, toUnknownList } from '@homeos/shared'
import { parseYamlSeqAction, createDefaultOrchestratorAction } from './yaml-action-parse.util'
import {
  getScriptHaExecutionMismatchReasons,
  type EngineCapabilitiesHint,
} from './automation-local-engine.util'
import {
  countChooseConditionLosses,
  countNestedDropped,
  countWaitMultiTriggerNotices,
  parseForSeconds,
} from './yaml-action-import-loss.util'
import { createBulkImportSummarizer } from './yaml-import-bulk-summary.util'

/** 脚本 YAML 导入分析结果：原始/解析/丢弃动作数、条件损失、HA 执行建议、提示列表 */
type ScriptYamlImportAnalysis = {
  rawActions: number
  parsedActions: number
  droppedActions: number
  nestedDroppedActions: number
  chooseConditionLosses: number
  needsHaExecution: boolean
  hints: string[]
}

/**
 * 分析导入 YAML：未能还原的动作数、条件降级、是否需 runOnHa。
 *
 * 入参：yamlStr（可能为空）+ 可选本地引擎能力 hint。
 * 返回：ScriptYamlImportAnalysis。
 * 边界：YAML 解析失败时不做动作统计（仅返回 needsHaExecution）。
 */
export function analyzeScriptYamlImport(
  yamlStr: string | null | undefined,
  engineCaps?: EngineCapabilitiesHint | null,
): ScriptYamlImportAnalysis {
  const empty: ScriptYamlImportAnalysis = {
    rawActions: 0,
    parsedActions: 0,
    droppedActions: 0,
    nestedDroppedActions: 0,
    chooseConditionLosses: 0,
    needsHaExecution: false,
    hints: [],
  }
  const text = String(yamlStr || '').trim()
  if (!text) return empty

  const haReasons = getScriptHaExecutionMismatchReasons(text, engineCaps)
  const needsHaExecution = haReasons.length > 0
  const hints: string[] = []

  let rawActions = 0
  let parsedActions = 0
  let nestedDroppedActions = 0
  let chooseConditionLosses = 0
  try {
    const doc = loadHaYaml(text)
    if (doc && typeof doc === 'object') {
      const d = doc as Record<string, unknown>
      const sequence = d.sequence ?? d.actions
      const list = toUnknownList(sequence)
      rawActions = list.length
      const ctx = {
        defaultAction: () => createDefaultOrchestratorAction('script'),
        parseForSeconds,
        variant: 'script' as const,
      }
      for (const item of list) {
        if (parseYamlSeqAction(item, ctx)) parsedActions += 1
      }
      nestedDroppedActions = countNestedDropped(list, ctx)
      chooseConditionLosses = countChooseConditionLosses(list)
      const waitMulti = countWaitMultiTriggerNotices(list)
      if (waitMulti > 0) {
        hints.push(
          `${waitMulti} 处 wait_for_trigger 含多个触发器（编辑器仅展示首个，其余保存时原样保留）`,
        )
      }
    }
  } catch {
    /* 解析失败时不做动作统计 */
  }

  const droppedActions = Math.max(0, rawActions - parsedActions)
  if (droppedActions > 0) {
    hints.push(`${droppedActions} 个顶层动作未能完整还原，请核对 YAML`)
  }
  if (nestedDroppedActions > 0) {
    hints.push(`${nestedDroppedActions} 个嵌套动作未能还原`)
  }
  if (chooseConditionLosses > 0) {
    hints.push(
      `${chooseConditionLosses} 处分支条件可能简化或丢失（嵌套 and/or、模板、不支持类型等）`,
    )
  }
  if (needsHaExecution) {
    const labels = haReasons.map((r) => r.label).join('、')
    hints.push(`含本地引擎不支持的特性：${labels}。建议勾选「由 HA 执行」`)
  }

  return {
    rawActions,
    parsedActions,
    droppedActions,
    nestedDroppedActions,
    chooseConditionLosses,
    needsHaExecution,
    hints,
  }
}

/** 导入成功提示文案：拼接 hints，无损失时返回 null */
export function formatScriptImportHint(
  yaml: string | null | undefined,
  engineCaps?: EngineCapabilitiesHint | null,
): string | null {
  const { hints } = analyzeScriptYamlImport(yaml, engineCaps)
  return hints.length ? hints.join('；') : null
}

/**
 * 脚本批量导入摘要器：按 needHa / lossy 维度统计。
 *
 * 调用方传入若干 { yaml } 项与 engineCaps，返回聚合摘要。
 */
export const summarizeScriptBulkImport = createBulkImportSummarizer<{ yaml?: unknown }>({
  entityLabel: '脚本',
  analyzeItem: (item, engineCaps) => {
    const yaml = String(item.yaml || '')
    if (!yaml.trim()) return null
    const a = analyzeScriptYamlImport(yaml, engineCaps as EngineCapabilitiesHint | null)
    return {
      needHa: a.needsHaExecution,
      lossy:
        a.droppedActions > 0 || a.nestedDroppedActions > 0 || a.chooseConditionLosses > 0,
    }
  },
})
