/**
 * Script YAML 解析器
 *
 * 职责：将 HA script YAML 转为表单结构（alias / description / mode / fields / sequence）。
 *
 * 依赖：
 * - @homeos/shared 的 loadHaYaml、parseHaDurationToFormString。
 * - ./yaml-action-parse.util 的动作序列解析。
 * - @/types/orchestrator-builder 的 ScriptFormParsed / ScriptFieldForm。
 *
 * 注意：
 * - YAML key（alias / fields / sequence 等）与 HA Script 字段对齐，不翻译。
 * - 解析失败或空输入时返回空表单（保守降级）。
 */
import { loadHaYaml } from '@homeos/shared'
import { parseHaDurationToFormString } from '@homeos/shared'
import { parseYamlSeqAction, createDefaultOrchestratorAction } from './yaml-action-parse.util'
import type { ScriptFieldForm, ScriptFormParsed } from '@/types/orchestrator-builder'

/** 默认动作工厂：按 script 维度创建空动作 */
const defaultAction = () => createDefaultOrchestratorAction('script')
/** 时长解析器：HA duration → 表单秒数字符串 */
const parseForSeconds = parseHaDurationToFormString

/** 单个动作序列项解析（脚本变体） */
function parseSeqItem(a: unknown) {
  return parseYamlSeqAction(a, { defaultAction, variant: 'script', parseForSeconds })
}

/**
 * 解析 script YAML 为表单结构。
 *
 * 入参：yamlStr（可能为 null / 空串）。
 * 返回：ScriptFormParsed（name / desc / mode / fields / actions）。
 * 边界：YAML 解析失败、非对象、sequence 缺失时回退为空表单。
 */
export function parseScriptYamlToForm(yamlStr: string | null | undefined): ScriptFormParsed {
  const empty: ScriptFormParsed = {
    scriptName: '',
    scriptDesc: '',
    scriptMode: 'single',
    fields: [],
    actions: [],
  }
  if (!yamlStr?.trim()) return empty
  let parsed: unknown
  try {
    parsed = loadHaYaml(yamlStr)
  } catch {
    return empty
  }
  if (!parsed || typeof parsed !== 'object') return empty

  const doc = parsed as Record<string, unknown>
  const result: ScriptFormParsed = { ...empty }
  result.scriptName = doc.alias != null ? String(doc.alias) : ''
  if (doc.description) result.scriptDesc = String(doc.description)
  if (doc.mode) result.scriptMode = String(doc.mode)

  const rawFields = doc.fields
  if (rawFields && typeof rawFields === 'object') {
    result.fields = Object.entries(rawFields as Record<string, unknown>).map(([name, cfg]) => {
      const c = (cfg as Record<string, unknown>) || {}
      let selector = 'text'
      let selectorOptions: Record<string, unknown> | null = null
      if (c.selector && typeof c.selector === 'object') {
        const sel = c.selector as Record<string, unknown>
        const keys = Object.keys(sel)
        selector = keys[0] || 'text'
        const nested = sel[selector]
        if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
          const opts = nested as Record<string, unknown>
          if (Object.keys(opts).length > 0) selectorOptions = opts
        }
      }
      const field: ScriptFieldForm = {
        name,
        description: c.description != null ? String(c.description) : '',
        selector,
        selectorOptions,
        default: c.default != null ? String(c.default) : '',
      }
      return field
    })
  }

  const sequence = doc.sequence ?? doc.actions
  if (sequence) {
    const list = Array.isArray(sequence) ? sequence : [sequence]
    result.actions = list.map(parseSeqItem).filter((x): x is NonNullable<typeof x> => Boolean(x))
  }
  return result
}
