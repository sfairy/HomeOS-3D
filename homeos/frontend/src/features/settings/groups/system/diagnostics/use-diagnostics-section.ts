import { inject, isRef, toRef } from 'vue'

/** 诊断面板的 provide/inject 契约键：由注入方（useDiagnosticsSection）持有。 */
export const DIAGNOSTICS_KEY = Symbol('diagnostics')

/** @param {string[]} keys */
export function useDiagnosticsSection(keys: string[]) {
  const ctx = inject(DIAGNOSTICS_KEY)
  if (!ctx) throw new Error('缺少诊断上下文')
  const out: Record<string, unknown> = {}
  for (const key of keys) {
    const v = (ctx as Record<string, unknown>)[key]
    // panel 是普通对象：ref/computed 与函数须直接透传，否则 toRef 会包错层
    out[key] = isRef(v) || typeof v === 'function' ? v : toRef(ctx as Record<string, unknown>, key)
  }
  return out
}
