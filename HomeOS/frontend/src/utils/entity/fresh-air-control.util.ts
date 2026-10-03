/**
 * @file fresh-air-control.util.ts
 * @brief 全热交换器 / 新风控制：风速档位解析纯函数。
 */
import { clampInRange } from '@/utils/ui/progress-bar.util'

/** 新风标准档位：自动不绑有效风速；其余为固定百分比 */
const FRESH_AIR_SPEED_LEVELS = [
  { label: '自动', pct: 0, showPercent: false },
  { label: '微风', pct: 16, showPercent: true },
  { label: '超低', pct: 33, showPercent: true },
  { label: '低风', pct: 50, showPercent: true },
  { label: '中风', pct: 66, showPercent: true },
  { label: '高风', pct: 83, showPercent: true },
  { label: '超高', pct: 100, showPercent: true },
] as const

type FreshAirSpeedLevel = {
  index: number
  pct: number
  label: string
  showPercent: boolean
}

/** 标准档位百分比（含自动 0%） */
export function buildSpeedPercents(): number[] {
  return FRESH_AIR_SPEED_LEVELS.map((l) => l.pct)
}

/** buildSpeedLevels：函数，按签名入参返回处理结果。 */
export function buildSpeedLevels(): FreshAirSpeedLevel[] {
  return FRESH_AIR_SPEED_LEVELS.map((l, index) => ({
    index,
    pct: l.pct,
    label: l.label,
    showPercent: l.showPercent,
  }))
}

/** nearestSpeedPercent：函数，按签名入参返回处理结果。 */
export function nearestSpeedPercent(value: number, speeds: number[] = buildSpeedPercents()): number {
  if (!speeds.length) return clampInRange(Math.round(value), 0, 100, 0)
  let best = speeds[0]
  let bestDist = Math.abs(value - best)
  for (const s of speeds) {
    const d = Math.abs(value - s)
    if (d < bestDist) {
      best = s
      bestDist = d
    }
  }
  return best
}

/** resolveSpeedLevel：函数，按签名入参返回处理结果。 */
export function resolveSpeedLevel(pct: number): FreshAirSpeedLevel {
  const levels = buildSpeedLevels()
  const nearest = nearestSpeedPercent(
    pct,
    levels.map((l) => l.pct),
  )
  return levels.find((l) => l.pct === nearest) ?? levels[0]
}
