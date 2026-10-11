import { inject, isRef, toRef } from 'vue'
import { DIAGNOSTICS_KEY } from './context'

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
