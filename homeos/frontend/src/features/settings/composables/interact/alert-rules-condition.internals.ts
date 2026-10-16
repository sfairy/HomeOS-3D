/**
 * @file alert-rules-condition.internals.ts
 * @module frontend/src/features/settings/composables/interact
 */
/** 告警规则：条件表达式 ↔ 可视化子句（纯函数） */

import type { AlertRuleEditForm, ConditionClause, ConditionMode } from '@/shared/types/alert-rules'

export function defaultAlertClause(): ConditionClause {
  return { join: '&&', condType: 'state', condAttr: 'brightness', condOp: '>', condValue: 'on' }
}

export function clauseToExpr(clause: ConditionClause) {
  if (clause.condType === 'state') return (clause.condValue || 'on').trim()
  if (clause.condType === 'contains') return `contains ${clause.condValue ?? ''}`.trim()
  if (clause.condType === 'numeric')
    return `${clause.condOp || '>'} ${clause.condValue ?? ''}`.trim()
  if (clause.condType === 'attr' && clause.condOp === 'contains') {
    return `attr:${clause.condAttr || 'brightness'} contains ${clause.condValue ?? ''}`.trim()
  }
  return `attr:${clause.condAttr || 'brightness'} ${clause.condOp || '>'} ${clause.condValue ?? ''}`.trim()
}

export function parseSingleClause(expr: string): ConditionClause {
  const trimmed = (expr || 'on').trim()
  const contains = trimmed.match(/^contains\s+(.+)$/i)
  if (contains) {
    return {
      join: '&&',
      condType: 'contains',
      condAttr: '',
      condOp: 'contains',
      condValue: contains[1].trim(),
    }
  }
  const attr = trimmed.match(/^attr:([a-zA-Z0-9_]+)\s*(.*)$/)
  if (attr) {
    const rest = attr[2].trim()
    const match = rest.match(/^(>=|<=|==|!=|>|<|=|contains)\s*(.+)$/i)
    return {
      join: '&&',
      condType: 'attr',
      condAttr: attr[1],
      // `=` 归一为 `==`（后端两者等价，编辑器统一落 `==`）
      condOp: match ? (match[1] === '=' ? '==' : match[1].toLowerCase()) : '>',
      condValue: match ? match[2] : '',
    }
  }
  const num = trimmed.match(/^(>=|<=|==|!=|>|<|=)\s*(.+)$/)
  if (num)
    return {
      join: '&&',
      condType: 'numeric',
      condAttr: '',
      condOp: num[1] === '=' ? '==' : num[1],
      condValue: num[2],
    }
  return { join: '&&', condType: 'state', condAttr: '', condOp: '==', condValue: trimmed }
}

export function parseCompoundCondition(condition: string): ConditionClause[] {
  const tokens = (condition || 'on')
    .trim()
    .split(/(\|\||&&)/)
    .map((part) => part.trim())
    .filter(Boolean)
  const clauses: ConditionClause[] = []
  let pendingJoin: '&&' | '||' | null = null
  for (const token of tokens) {
    if (token === '||' || token === '&&') {
      pendingJoin = token
      continue
    }
    const clause = parseSingleClause(token)
    if (clauses.length > 0) clause.join = pendingJoin || '&&'
    clauses.push(clause)
    pendingJoin = null
  }
  return clauses.length ? clauses : [defaultAlertClause()]
}

export function parseConditionToVisual(condition: string) {
  const expr = (condition || 'on').trim()
  if (expr.includes('||') || expr.includes('&&')) {
    return {
      conditionMode: 'compound' as ConditionMode,
      clauses: parseCompoundCondition(expr),
      condition: expr,
    }
  }
  const single = parseSingleClause(expr)
  return { conditionMode: 'visual' as ConditionMode, ...single, condition: expr }
}

/** 冷却时长归一化：0 保留为"不抑制"，非法值回退默认 60 分钟 */
export function normalizeCooldownMinutes(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 60
}

/** 默认推送渠道：仅站内 + 实时推送 */
export const DEFAULT_ALERT_RULE_CHANNELS = ['in_app', 'socket']

/**
 * 推送渠道归一化：未勾选任何外部渠道时落为「仅站内 + 实时」。
 * 后端空数组语义为「全选」，故保存前显式收敛。
 */
export function normalizeAlertRuleChannels(value: unknown): string[] {
  const list = Array.isArray(value)
    ? value.filter((channel): channel is string => typeof channel === 'string' && channel.length > 0)
    : []
  return list.length ? [...new Set(list)] : [...DEFAULT_ALERT_RULE_CHANNELS]
}

export function serializeEditingForm(form: AlertRuleEditForm | null) {
  if (!form) return null
  return JSON.stringify({
    id: form.id ?? null,
    name: String(form.name || '').trim(),
    entityId: String(form.entityId || '').trim(),
    messageTemplate: String(form.messageTemplate || '').trim(),
    title: String(form.title || '').trim(),
    condition: String(form.condition || '').trim(),
    level: form.level ?? 'warn',
    cooldownMinutes: normalizeCooldownMinutes(form.cooldownMinutes),
    enabled: form.enabled !== false,
    conditionMode: form.conditionMode ?? 'visual',
    condType: form.condType ?? 'state',
    condOp: form.condOp ?? '>',
    condValue: form.condValue ?? '',
    condAttr: form.condAttr ?? 'brightness',
    clauses: form.clauses ?? [],
  })
}
