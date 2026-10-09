/** 天气特效：上下文 key + 分区 inject + 常量 */
import { inject, isRef, toRef } from 'vue'

/** WEATHER_EFFECTS_KEY：常量，取值语义见定义处。 */
export const WEATHER_EFFECTS_KEY = Symbol('weatherEffects')

/** @param {string[]} keys */
export function useWeatherEffectsSection(keys: string[]) {
  const ctx = inject(WEATHER_EFFECTS_KEY)
  if (!ctx) throw new Error('缺少天气效果上下文')
  const out: Record<string, unknown> = {}
  for (const key of keys) {
    const v = (ctx as Record<string, unknown>)[key]
    out[key] = isRef(v) || typeof v === 'function' ? v : toRef(ctx as Record<string, unknown>, key)
  }
  return out
}
