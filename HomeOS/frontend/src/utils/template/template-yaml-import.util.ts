/**
 * 模板实体 YAML 导入损失与降级分析
 *
 * 职责：
 * - 粘贴 / 导入模板实体 YAML 时分析字段损失与降级情况。
 * - 识别非标准模板属性、占位 entity_id、家电类型推断，输出导入损失摘要。
 *
 * 依赖：
 * - @homeos/shared 的家电类型 ID、占位检测、模板导入元数据与非标准属性判定。
 *
 * 注意：
 * - 家电类型 key（APPLIANCE_TYPE_IDS）为配置 key，不翻译。
 * - 仅面向用户的损失 / 降级文案使用简体中文。
 */
import {
  APPLIANCE_TYPE_IDS,
  findPlaceholderEntityIdsInYaml,
  hasOrchestratorPlaceholder,
  inferTemplateEntityImportMeta,
  yamlHasNonStandardTemplateAttributes,
} from '@homeos/shared'
import { getMissingRequiredGroups } from '@/utils/template/slot-required.util'
import {
  canVisualEditTriggerYaml,
  isIncompleteTemplateYaml,
} from '@/utils/template/trigger-sensor.util'
import { isTriggerBasedTemplateYaml } from '@/utils/template/yaml-parser.util'

type TemplateYamlImportAnalysis = {
  needsHaConfigAccess: boolean
  visualDegraded: boolean
  incompleteYaml: boolean
  lossySlots: boolean
  hints: string[]
}

type TemplateYamlImportOpts = {
  type?: string
  slotMapping?: unknown
  yamlComplete?: boolean
  yamlSource?: string
  entName?: string
  uniqueId?: string
  haConfigId?: string
}

/** 与 backend shouldSkipTemplateHelper 对齐：需 configuration.yaml 而非 Helper */
function yamlNeedsHaConfigAccess(yamlStr: string): boolean {
  if (!yamlStr.trim()) return false
  if (isTriggerBasedTemplateYaml(yamlStr)) return true
  return yamlHasNonStandardTemplateAttributes(yamlStr)
}

function resolveApplianceType(
  yamlStr: string,
  opts: TemplateYamlImportOpts,
): string | undefined {
  const stored = opts.type?.trim()
  if (stored && APPLIANCE_TYPE_IDS.has(stored)) return stored
  const inferred = inferTemplateEntityImportMeta(yamlStr, {
    storedType: stored,
    entName: opts.entName,
    uniqueId: opts.uniqueId,
  })
  if (APPLIANCE_TYPE_IDS.has(inferred.type)) return inferred.type
  return undefined
}

function analyzeSlotLoss(
  yamlStr: string,
  opts: TemplateYamlImportOpts,
): { lossy: boolean; missingGroupCount: number; inferredEmpty: boolean } {
  const typeId = resolveApplianceType(yamlStr, opts)
  if (!typeId) return { lossy: false, missingGroupCount: 0, inferredEmpty: false }

  const inferred = inferTemplateEntityImportMeta(yamlStr, {
    storedType: typeId,
    entName: opts.entName,
    uniqueId: opts.uniqueId,
  })
  const mapping = {
    ...(inferred.slotMapping?.mapping as Record<string, string> | undefined),
  }
  const missingGroups = getMissingRequiredGroups(typeId, mapping)
  const inferredEmpty = !Object.keys(mapping).length
  const lossy = inferredEmpty || missingGroups.length > 0
  return { lossy, missingGroupCount: missingGroups.length, inferredEmpty }
}

/** 分析导入 YAML：不完整片段、可视化降级、槽位损失、需 HA 配置访问等 */
function analyzeTemplateYamlImport(
  yamlStr: string | null | undefined,
  opts: TemplateYamlImportOpts = {},
): TemplateYamlImportAnalysis {
  const empty: TemplateYamlImportAnalysis = {
    needsHaConfigAccess: false,
    visualDegraded: false,
    incompleteYaml: false,
    lossySlots: false,
    hints: [],
  }
  const text = String(yamlStr || '').trim()
  if (!text) return empty

  const hints: string[] = []
  const meta = {
    name: opts.entName,
    haConfigId: opts.haConfigId,
    yamlComplete: opts.yamlComplete,
  }

  const incompleteYaml =
    isIncompleteTemplateYaml(text, opts.yamlComplete) ||
    hasOrchestratorPlaceholder(text) ||
    opts.yamlSource === 'stub'
  if (incompleteYaml) {
    hints.push('YAML 不完整或为占位片段，请补全 configuration.yaml 原文')
  }

  const isTriggerYaml = isTriggerBasedTemplateYaml(text)
  const typeHint = opts.type || inferTemplateEntityImportMeta(text, opts).type
  const triggerLike = isTriggerYaml || typeHint === 'trigger_sensor'
  const visualDegraded =
    triggerLike && String(text).trim() !== '' && !canVisualEditTriggerYaml(text, meta)
  if (visualDegraded) {
    hints.push('触发式模板无法完整可视化编辑，请直接核对 YAML 或使用高级模式')
  }

  const needsHaConfigAccess = yamlNeedsHaConfigAccess(text)
  if (needsHaConfigAccess) {
    hints.push('含 trigger 或非标准 attributes，需 configuration.yaml 部署（无法仅用 Template Helper）')
  }

  const slotLoss = analyzeSlotLoss(text, opts)
  const lossySlots = slotLoss.lossy
  if (slotLoss.inferredEmpty && resolveApplianceType(text, opts)) {
    hints.push('未能从 YAML 自动解析槽位映射，请手动分配子实体')
  } else if (slotLoss.missingGroupCount > 0) {
    hints.push(`有 ${slotLoss.missingGroupCount} 组必填槽位未映射，请在编辑器中补全`)
  }

  const placeholders = findPlaceholderEntityIdsInYaml(text)
  if (placeholders.length) {
    hints.push(`YAML 含占位实体 ID：${placeholders.slice(0, 4).join(', ')}${placeholders.length > 4 ? '…' : ''}`)
  }

  return {
    needsHaConfigAccess,
    visualDegraded,
    incompleteYaml,
    lossySlots,
    hints,
  }
}

/** 导入成功提示文案（无问题时返回 null） */
export function formatTemplateImportHint(
  yaml: string | null | undefined,
  opts?: TemplateYamlImportOpts,
): string | null {
  const { hints } = analyzeTemplateYamlImport(yaml, opts)
  return hints.length ? hints.join('；') : null
}

/** HA 批量导入后的汇总 */
type TemplateBulkImportSummary = {
  imported: number
  needHaConfig: number
  lossy: number
  message: string
  notifyType: 'success' | 'warning'
}

/** summarizeTemplateBulkImport：函数，按签名入参返回处理结果。 */
export function summarizeTemplateBulkImport(
  items: Array<{ yaml?: unknown; type?: unknown; yamlComplete?: boolean; yamlSource?: unknown; name?: unknown } | null | undefined>,
  entityLabel: string = '模板实体',
): TemplateBulkImportSummary {
  let needHaConfig = 0
  let lossy = 0
  for (const item of items) {
    if (!item) continue
    const yaml = String(item.yaml || '')
    if (!yaml.trim()) continue
    const a = analyzeTemplateYamlImport(yaml, {
      type: String(item.type || ''),
      yamlComplete: item.yamlComplete,
      yamlSource: String(item.yamlSource || ''),
      entName: String(item.name || ''),
    })
    if (a.needsHaConfigAccess) needHaConfig += 1
    if (a.incompleteYaml || a.visualDegraded || a.lossySlots || a.hints.length > 0) lossy += 1
  }
  const imported = items.length
  const parts = [`已导入 ${imported} 个${entityLabel}`]
  if (needHaConfig) parts.push(`其中 ${needHaConfig} 条需 configuration.yaml 部署`)
  if (lossy) parts.push(`${lossy} 条存在导入降级或槽位损失，打开编辑可查看详情`)
  return {
    imported,
    needHaConfig,
    lossy,
    message: parts.join('；'),
    notifyType: needHaConfig || lossy ? 'warning' : 'success',
  }
}
