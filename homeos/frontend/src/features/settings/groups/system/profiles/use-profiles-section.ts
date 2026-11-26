import { inject, isRef, toRef } from 'vue'

/** 档案面板的 provide/inject 契约键：由注入方（useProfilesSection）持有。 */
export const PROFILES_KEY = Symbol('profiles')

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
