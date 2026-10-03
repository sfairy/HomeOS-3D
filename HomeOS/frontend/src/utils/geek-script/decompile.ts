/**
 * 极客脚本 YAML / 已存 geekGraph → 图 反编译
 *
 * 职责：
 * - 把 Script YAML / 已存 geekGraph 反编译为脚本图（动作序列 + 输入变量）。
 * - 若 graph.yamlDigest 与当前 yaml 指纹不一致，视为陈旧图，改从 YAML 还原。
 *
 * 依赖：
 * - @/utils/orchestrator/script-yaml-parser.util 的 YAML 解析。
 * - @/utils/orchestrator/script-yaml-import.util 的导入分析。
 * - @/utils/geek-automation/graph-types、compile、canvas.util 的图工具。
 * - ./compile 的 YAML 编译（用于指纹计算）。
 *
 * 注意：反编译产出的图节点 kind 为标识符，不翻译。
 */
import { parseScriptYamlToForm } from '@/utils/orchestrator/script-yaml-parser.util'
import { analyzeScriptYamlImport } from '@/utils/orchestrator/script-yaml-import.util'
import { createEmptyGeekGraph, type GeekGraph } from '@/utils/geek-automation/graph-types'
import { normalizeGeekGraph } from '@/utils/geek-automation/compile'
import { ensureGeekGraphLayout } from '@/utils/geek-automation/canvas.util'
import { compileGeekScriptGraphToYaml } from './compile'
import { resolveStoredGeekGraph } from '@/utils/orchestrator/geek-stored-graph-resolver.util'
import { fingerprintScriptYaml } from '@homeos/shared'
import type { ScriptFieldForm } from '@/types/orchestrator-builder'
import type { EngineCapabilitiesHint } from '@/utils/orchestrator/automation-local-engine.util'

type DecompileScriptResult = {
  graph: GeekGraph
  scriptDesc: string
  fields: ScriptFieldForm[]
  /** 是否来自已存 geekGraph */
  fromStoredGraph: boolean
  approximate: boolean
  /** 已存图与 YAML 指纹不一致，已改从 YAML 还原 */
  staleGraph?: boolean
  importHints?: string[]
}

function parseYamlMeta(yaml: string | null | undefined) {
  const form = parseScriptYamlToForm(yaml)
  return {
    scriptDesc: form.scriptDesc || '',
    fields: form.fields || [],
  }
}

function decompileFromYaml(opts: {
  yaml?: string | null
  name?: string
  engineCaps?: EngineCapabilitiesHint | null
  staleGraph?: boolean
}): DecompileScriptResult {
  const yamlText = String(opts.yaml || '').trim()
  const form = parseScriptYamlToForm(opts.yaml)
  const analysis = yamlText ? analyzeScriptYamlImport(yamlText, opts.engineCaps) : null
  const importHints = analysis?.hints?.length ? [...analysis.hints] : undefined

  const graph = ensureGeekGraphLayout(
    createEmptyGeekGraph({
      name: form.scriptName || opts.name || '',
      mode: form.scriptMode || 'single',
      actions: form.actions || [],
      triggerGroups: [],
      conditionGroups: [],
      triggers: [],
      conditions: [],
      yamlDigest: yamlText ? fingerprintScriptYaml(yamlText) : undefined,
    }),
  )

  const approximate = Boolean(
    opts.staleGraph ||
      importHints?.length ||
      (analysis &&
        (analysis.droppedActions > 0 ||
          analysis.nestedDroppedActions > 0 ||
          analysis.chooseConditionLosses > 0)),
  )

  return {
    graph,
    scriptDesc: form.scriptDesc || '',
    fields: form.fields || [],
    fromStoredGraph: false,
    approximate,
    staleGraph: opts.staleGraph || undefined,
    importHints,
  }
}

/** decompileScriptToGeekGraph：函数，按签名入参返回处理结果。 */
export function decompileScriptToGeekGraph(opts: {
  geekGraph?: unknown
  yaml?: string | null
  name?: string
  engineCaps?: EngineCapabilitiesHint | null
}): DecompileScriptResult {
  const stored = normalizeGeekGraph(opts.geekGraph)
  const yamlText = opts.yaml?.trim() || ''

  /** 指纹命中时沿用已存图，meta 随 yaml（或空）解析 */
  const adoptStored = (graph: GeekGraph, meta: { scriptDesc: string; fields: ScriptFieldForm[] }): DecompileScriptResult => {
    if (opts.name && !graph.name) graph.name = opts.name
    return {
      graph: ensureGeekGraphLayout(graph),
      scriptDesc: meta.scriptDesc,
      fields: meta.fields,
      fromStoredGraph: true,
      approximate: false,
    }
  }

  const matched = resolveStoredGeekGraph({
    stored,
    yamlText,
    fingerprint: fingerprintScriptYaml,
    readDigest: (g) => String(g.yamlDigest || '').trim(),
    writeDigest: (g, digest) => {
      g.yamlDigest = digest
    },
    onDigestMatch: (g) => adoptStored(g, parseYamlMeta(opts.yaml)),
    onNoYamlMatch: (g) => adoptStored(g, { scriptDesc: '', fields: [] }),
    compileStoredToYaml: (g) => {
      const meta = parseYamlMeta(opts.yaml)
      return compileGeekScriptGraphToYaml(g, meta.fields || [], meta.scriptDesc || '')
    },
    onCompiledMatch: (g) => adoptStored(g, parseYamlMeta(opts.yaml)),
  })
  if (matched) return matched

  return decompileFromYaml({
    yaml: opts.yaml,
    name: opts.name,
    engineCaps: opts.engineCaps,
    staleGraph: Boolean(stored && yamlText),
  })
}
