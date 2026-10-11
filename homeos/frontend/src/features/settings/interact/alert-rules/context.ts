import { inject } from 'vue'

/** 告警规则上下文的注入 key，与 provide 侧成对使用 */
export const ALERT_RULES_KEY = Symbol('alertRules')

/**
 * 从告警规则上下文中按需选取字段。
 * @param keys 需要提取的上下文字段名数组
 * @returns 仅包含所请求字段的对象；若未在 provider 内调用则抛错
 */
export function useAlertRulesSection(keys: string[]) {
  const ctx = inject(ALERT_RULES_KEY)
  if (!ctx) throw new Error('缺少告警规则上下文')
  const out: Record<string, unknown> = {}
  for (const key of keys) out[key] = (ctx as Record<string, unknown>)[key]
  return out
}
