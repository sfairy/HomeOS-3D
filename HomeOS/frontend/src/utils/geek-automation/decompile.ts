/**
 * 极客自动化 YAML / 表单 → 图 反编译
 *
 * 职责：
 * - 把 Automation YAML 或表单还原为 GeekGraph，优先复用已存 geekGraph。
 * - 若 graph.yamlDigest 与当前 yaml 指纹不一致，视为陈旧图，改从 YAML 还原。
 * - 无 digest 的图（如 HA 拉取后仅有 yaml）：视为陈旧图，直接走 YAML 还原。
 *
 * 依赖：
 * - @/utils/orchestrator/automation-yaml-parser.util 的 YAML 解析。
 * - @/utils/orchestrator/automation-yaml-import.util 的导入分析。
 * - @/utils/orchestrator/automation-local-engine.util 的能力提示。
 * - ./graph-types、./compile、./canvas.util 的图工具。
 * - @/utils/orchestrator/geek-stored-graph-resolver.util 的已存图解析。
 * - @homeos/shared 的 fingerprintAutomationYaml。
 *
 * 注意：
 * - `DecompileResult` 字段为内部标识符，不翻译。
 */
import { parseAutomationYamlToForm } from '@/utils/orchestrator/automation-yaml-parser.util'
import { analyzeAutomationYamlImport } from '@/utils/orchestrator/automation-yaml-import.util'
import type { EngineCapabilitiesHint } from '@/utils/orchestrator/automation-local-engine.util'
import { createEmptyGeekGraph, type GeekGraph } from './graph-types'
import { normalizeGeekGraph } from './compile'
import { ensureGeekGraphLayout } from './canvas.util'
import { resolveStoredGeekGraph } from '@/utils/orchestrator/geek-stored-graph-resolver.util'
import { fingerprintAutomationYaml } from '@homeos/shared'

/** DecompileResult：类型定义，字段语义见声明。 */
export type DecompileResult = {
  graph: GeekGraph
  /** 是否来自已存 geekGraph（可完整还原） */
  fromStoredGraph: boolean
  /** YAML 粗还原时可能丢语义 */
  approximate: boolean
  /** 已存图与 YAML 指纹不一致，已改从 YAML 还原 */
  staleGraph?: boolean
  /** 导入/YAML 还原时的细粒度损失提示 */
  importHints?: string[]
}

/** decompileToGeekGraph：函数，按签名入参返回处理结果。 */
export function decompileToGeekGraph(opts: {
  geekGraph?: unknown
  yaml?: string | null
  name?: string
  engineCaps?: EngineCapabilitiesHint | null
}): DecompileResult {
  const stored = normalizeGeekGraph(opts.geekGraph)
  const yamlText = opts.yaml?.trim() || ''

  /** digest 命中 / 无 yaml 时沿用已存图；automation 无 compile 反推分支 */
  const adoptStored = (graph: GeekGraph): DecompileResult => {
    if (opts.name && !graph.name) graph.name = opts.name
    return {
      graph: ensureGeekGraphLayout(graph),
      fromStoredGraph: true,
      approximate: false,
    }
  }

  const matched = resolveStoredGeekGraph({
    stored,
    yamlText,
    fingerprint: fingerprintAutomationYaml,
    readDigest: (g) => String(g.yamlDigest || '').trim(),
    writeDigest: (g, digest) => {
      g.yamlDigest = digest
    },
    onDigestMatch: adoptStored,
    onNoYamlMatch: adoptStored,
    // 无 digest 且有 yaml（如 HA 同步后）：视为陈旧图，走下方 YAML 还原
  })
  if (matched) return matched

  const staleGraph = Boolean(stored && yamlText)
  const form = parseAutomationYamlToForm(opts.yaml || '')
  const triggerGroups = (form.triggerGroups || []).map((g) => ({
    logic: g.logic || 'or',
    triggers: [...(g.triggers || [])],
  }))
  const conditionGroups = (form.conditionGroups || []).map((g) => ({
    logic: g.logic || 'and',
    conditions: [...(g.conditions || [])],
  }))
  const graph = ensureGeekGraphLayout(
    createEmptyGeekGraph({
      name: form.automationName || opts.name || '',
      mode: form.automationMode || 'single',
      triggerLogic: form.triggerLogic || 'or',
      triggerAndTimeout: Number(form.triggerAndTimeout) || 60,
      condRootLogic: form.condRootLogic || 'and',
      triggerGroups,
      conditionGroups,
      actions: form.actions || [],
      yamlDigest: yamlText ? fingerprintAutomationYaml(yamlText) : undefined,
    }),
  )
  const triggerCount = graph.triggers.length
  const analysis = yamlText ? analyzeAutomationYamlImport(yamlText, opts.engineCaps) : null
  const lossy =
    Boolean(analysis) &&
    ((analysis!.droppedActions || 0) > 0 ||
      (analysis!.nestedDroppedActions || 0) > 0 ||
      (analysis!.droppedConditions || 0) > 0 ||
      (analysis!.chooseConditionLosses || 0) > 0 ||
      (analysis!.opaqueTriggers || 0) > 0 ||
      (analysis!.incompleteTriggers || 0) > 0)
  const approximate = !opts.yaml?.trim()
    ? false
    : triggerCount === 0 && (form.actions?.length || 0) === 0
      ? true
      : Boolean(opts.yaml?.includes('condition: template') || opts.yaml?.includes('value_template')) ||
        lossy
  // opaque 已通过 opaquePayload 往返；仍标 approximate 提示编辑器字段有限
  return {
    graph,
    fromStoredGraph: false,
    approximate: approximate || staleGraph,
    staleGraph: staleGraph || undefined,
    importHints: analysis?.hints?.length ? analysis.hints : undefined,
  }
}
