/**
 * 自动化 YAML 导入损失分析
 *
 * 职责：粘贴 / 导入自动化 YAML 时统计未能还原的动作数、条件降级、触发器保真、HA-only 特性等，
 * 并产出提示文案与批量导入摘要。
 *
 * 依赖：
 * - @homeos/shared 的 loadHaYaml / toUnknownList / extractAutomationYamlSections / normalizeTriggers / ParsedTrigger。
 * - ./yaml-action-parse.util 的动作序列解析。
 * - ./automation-local-engine.util 的本地执行能力差异。
 * - ./yaml-action-import-loss.util 的损失计数工具。
 * - ./yaml-import-bulk-summary.util 的批量导入摘要工厂。
 *
 * 注意：触发器 platform / 字段名为 HA 配置值，不翻译；仅提示文案使用简体中文。
 */
import {
  loadHaYaml,
  toUnknownList,
  extractAutomationYamlSections,
  normalizeTriggers,
  type ParsedTrigger,
} from '@homeos/shared'
import { parseYamlSeqAction, createDefaultOrchestratorAction } from './yaml-action-parse.util'
import {
  getHaExecutionMismatchReasons,
  type EngineCapabilitiesHint,
} from './automation-local-engine.util'
import {
  countChooseConditionLosses,
  countDroppedTopLevelConditions,
  countNestedDropped,
  countWaitMultiTriggerNotices,
  parseForSeconds,
} from './yaml-action-import-loss.util'
import { createBulkImportSummarizer } from './yaml-import-bulk-summary.util'

/** 自动化 YAML 导入分析结果：动作数 / 丢弃数 / 条件损失 / 触发器损失 / HA 执行建议 / 提示列表 */
type AutomationYamlImportAnalysis = {
  rawActions: number
  parsedActions: number
  droppedActions: number
  nestedDroppedActions: number
  /** 顶层条件中未能还原的叶子数 */
  droppedConditions: number
  chooseConditionLosses: number
  /** 字段不完整的触发器数（缺 entity_id / at 等） */
  incompleteTriggers: number
  /** 表单仅透传 type、关键字段易丢的触发器数（mqtt/template 等） */
  opaqueTriggers: number
  needsHaExecution: boolean
  hints: string[]
}

/** 表单可完整映射字段的触发器 platform 白名单（其余视为 opaque，仅透传 type） */
const FORM_FIRST_CLASS_TRIGGERS = new Set([
  'state',
  'numeric_state',
  'time',
  'sun',
  'homeassistant',
  'event',
  'zone',
  'calendar',
  'device',
])

/** 触发器是否字段不完整：按 platform 校验必填字段是否缺失 */
function isIncompleteTrigger(t: ParsedTrigger): boolean {
  const p = String(t.platform || 'state')
  if (p === 'state' || p === 'numeric_state') return t.entity_id == null || t.entity_id === ''
  if (p === 'time') return !t.at
  if (p === 'event') return !t.event_type
  if (p === 'zone') return !t.entity_id || !t.zone
  if (p === 'calendar') return t.entity_id == null || t.entity_id === ''
  if (p === 'device') return !t.device_id
  return false
}

/** 统计顶层触发器：按 platform 区分字段不完整 / 透传保真有限 */
function analyzeTriggerLosses(raw: unknown): { incomplete: number; opaque: number } {
  const list = normalizeTriggers(raw)
  let incomplete = 0
  let opaque = 0
  for (const t of list) {
    const p = String(t.platform || 'state')
    if (!FORM_FIRST_CLASS_TRIGGERS.has(p)) {
      opaque += 1
      continue
    }
    if (isIncompleteTrigger(t)) incomplete += 1
  }
  return { incomplete, opaque }
}

/**
 * 分析导入 YAML：未能还原的动作数、条件降级、是否需 runOnHa。
 *
 * 入参：yamlStr（可能为空）+ 可选本地引擎能力 hint。
 * 返回：AutomationYamlImportAnalysis。
 * 边界：YAML 解析失败时不做动作统计（仅返回 needsHaExecution）。
 */
export function analyzeAutomationYamlImport(
  yamlStr: string | null | undefined,
  engineCaps?: EngineCapabilitiesHint | null,
): AutomationYamlImportAnalysis {
  const empty: AutomationYamlImportAnalysis = {
    rawActions: 0,
    parsedActions: 0,
    droppedActions: 0,
    nestedDroppedActions: 0,
    droppedConditions: 0,
    chooseConditionLosses: 0,
    incompleteTriggers: 0,
    opaqueTriggers: 0,
    needsHaExecution: false,
    hints: [],
  }
  const text = String(yamlStr || '').trim()
  if (!text) return empty

  const haReasons = getHaExecutionMismatchReasons(text, engineCaps)
  const needsHaExecution = haReasons.length > 0
  const hints: string[] = []

  let rawActions = 0
  let parsedActions = 0
  let nestedDroppedActions = 0
  let droppedConditions = 0
  let chooseConditionLosses = 0
  let incompleteTriggers = 0
  let opaqueTriggers = 0
  try {
    const doc = loadHaYaml(text)
    if (doc && typeof doc === 'object') {
      const sections = extractAutomationYamlSections(doc as Record<string, unknown>)
      const list = toUnknownList(sections.actions)
      rawActions = list.length
      const ctx = {
        defaultAction: () => createDefaultOrchestratorAction('automation'),
        parseForSeconds,
        variant: 'automation' as const,
      }
      for (const item of list) {
        if (parseYamlSeqAction(item, ctx)) parsedActions += 1
      }
      nestedDroppedActions = countNestedDropped(list, ctx)
      chooseConditionLosses = countChooseConditionLosses(list)
      droppedConditions = countDroppedTopLevelConditions(sections.conditions)
      const waitMulti = countWaitMultiTriggerNotices(list)
      if (waitMulti > 0) {
        hints.push(
          `${waitMulti} 处 wait_for_trigger 含多个触发器（编辑器仅展示首个，其余保存时原样保留）`,
        )
      }
      const trigLoss = analyzeTriggerLosses(sections.triggers)
      incompleteTriggers = trigLoss.incomplete
      opaqueTriggers = trigLoss.opaque
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
  if (incompleteTriggers > 0) {
    hints.push(`${incompleteTriggers} 个触发器字段不完整`)
  }
  if (opaqueTriggers > 0) {
    hints.push(
      `${opaqueTriggers} 个触发器类型编辑字段有限（如 mqtt/template），原始字段已保留往返，请核对 YAML`,
    )
  }
  if (droppedConditions > 0) {
    hints.push(`${droppedConditions} 个顶层条件未能完整还原`)
  }
  if (chooseConditionLosses > 0) {
    hints.push(
      `${chooseConditionLosses} 处分支条件可能简化或丢失（嵌套 and/or、模板、不支持类型等）`,
    )
  }
  if (needsHaExecution) {
    const labels = haReasons.slice(0, 3).map((r) => r.label).join('、')
    hints.push(
      haReasons.some((r) => r.id === 'platform_device' || r.id === 'device_action')
        ? '含 HA 设备触发/动作，已自动启用「由 HA 执行」'
        : `含本地不支持特性（${labels}${haReasons.length > 3 ? '…' : ''}），建议「由 HA 执行」`,
    )
  }

  return {
    rawActions,
    parsedActions,
    droppedActions,
    nestedDroppedActions,
    droppedConditions,
    chooseConditionLosses,
    incompleteTriggers,
    opaqueTriggers,
    needsHaExecution,
    hints,
  }
}

/** 导入成功提示文案：拼接 hints，无损失时返回 null */
export function formatAutomationImportHint(
  yaml: string | null | undefined,
  engineCaps?: EngineCapabilitiesHint | null,
): string | null {
  const { hints } = analyzeAutomationYamlImport(yaml, engineCaps)
  return hints.length ? hints.join('；') : null
}

/**
 * 自动化批量导入摘要器：按 needHa / lossy 维度统计。
 *
 * 调用方传入若干 { yaml } 项与 engineCaps，返回聚合摘要。
 */
export const summarizeAutomationBulkImport = createBulkImportSummarizer<{ yaml?: unknown }>({
  entityLabel: '自动化',
  analyzeItem: (item, engineCaps) => {
    const yaml = String(item.yaml || '')
    if (!yaml.trim()) return null
    const a = analyzeAutomationYamlImport(yaml, engineCaps as EngineCapabilitiesHint | null)
    return {
      needHa: a.needsHaExecution,
      lossy:
        a.droppedActions > 0 ||
        a.nestedDroppedActions > 0 ||
        a.chooseConditionLosses > 0 ||
        a.droppedConditions > 0 ||
        a.incompleteTriggers > 0 ||
        a.opaqueTriggers > 0,
    }
  },
})

