/**
 * 极客自动化画布变量实时状态展示
 *
 * 职责：
 * - 定义变量快照类型（GeekVariableSnapshot）。
 * - 从节点载荷提取变量 key（触发 / 条件 / 写变量 / 运算）。
 * - 解析变量实时值与状态文案，供画布节点角标展示。
 *
 * 依赖：调用方注入的变量值映射。
 *
 * 注意：
 * - `scope`（local / global / ...）为变量作用域标识符，不翻译。
 * - 仅面向用户的状态文案使用简体中文。
 */
export type GeekVariableSnapshot = {
  key: string
  value?: string | number | null
  scope?: string
  name?: string
  ruleId?: string
}

/** 从节点载荷提取变量 key（触发 / 条件 / 写变量 / 运算） */
export function varKeyFromCanvasData(data: {
  kind?: string
  trigger?: { type?: string; varKey?: string }
  condition?: { operator?: string; varKey?: string }
  action?: { type?: string; varKey?: string }
} | null): string {
  if (!data) return ''
  if (data.kind === 'trigger' && data.trigger?.type === 'variable') {
    return String(data.trigger.varKey || '').trim()
  }
  if (data.kind === 'condition' && String(data.condition?.operator || '').startsWith('var_')) {
    return String(data.condition?.varKey || '').trim()
  }
  if (
    data.kind === 'action' &&
    ['variable_set', 'var_math', 'var_concat', 'var_fn'].includes(String(data.action?.type || ''))
  ) {
    return String(data.action?.varKey || '').trim()
  }
  return ''
}

/** 变量实时状态文案 */
export function variableStatusText(
  key: string,
  values: Record<string, string | number | null | undefined> | null | undefined,
): string {
  const k = String(key || '').trim()
  if (!k || !values || !(k in values)) return ''
  const v = values[k]
  if (v == null || v === '') return `变量 ${k}: （空）`
  return `变量 ${k}: ${v}`
}

/** API 列表 → key→value 映射（同 key 优先本规则） */
export function variableValuesMap(
  list: GeekVariableSnapshot[],
  ruleId?: string,
): Record<string, string | number | null | undefined> {
  const global: Record<string, string | number | null | undefined> = {}
  const rule: Record<string, string | number | null | undefined> = {}
  for (const v of list || []) {
    const k = String(v.key || '').trim()
    if (!k) continue
    if (v.scope === 'rule') {
      if (!ruleId || String(v.ruleId || '') === String(ruleId)) {
        rule[k] = v.value
      }
    } else {
      global[k] = v.value
    }
  }
  return { ...global, ...rule }
}
