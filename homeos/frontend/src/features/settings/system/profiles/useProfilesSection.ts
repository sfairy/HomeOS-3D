/**
 * 文件：useProfilesSection.ts
 * 职责：档案分区 inject 辅助。从 PROFILES_KEY 上下文中按需选取字段；
 *       ref/computed 与函数直接透传，其余用 toRef 包裹。
 * 关键依赖：vue 的 inject / isRef / toRef
 */
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
