import { inject, isRef, toRef } from 'vue'
import { PROFILES_KEY } from './context'

/** @param {string[]} keys */
export function useProfilesSection(keys: string[]) {
  const ctx = inject(PROFILES_KEY)
  if (!ctx) throw new Error('缺少配置文件上下文')
  const out: Record<string, unknown> = {}
  for (const key of keys) {
    const v = (ctx as Record<string, unknown>)[key]
    out[key] = isRef(v) || typeof v === 'function' ? v : toRef(ctx as Record<string, unknown>, key)
  }
  return out
}
