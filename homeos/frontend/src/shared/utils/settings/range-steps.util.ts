/** 设置页滑块步长语义（与 SettingsRangeField 配合） */

import { snapToSliderStep } from '@/shared/utils/ui/progress-bar.util'

/** SETTINGS_RANGE_STEP：对象常量，字段 / 方法语义见定义处。 */
export const SETTINGS_RANGE_STEP = {
  /** 像素 · 大屏布局宽度 */
  layoutWidth: 10,
  /** 像素 · 侧栏/消息墙等中等尺寸 */
  panelPx: 5,
  /** 亮度/百分比 20–100 */
  brightnessPct: 5,
  /** 小时 0–23 */
  hour: 1,
} as const

/** 根据 step 推断显示小数位 */
function rangeStepDecimals(step: number): number {
  if (!Number.isFinite(step) || step <= 0) return 0
  const s = String(step)
  const dot = s.indexOf('.')
  if (dot < 0) return 0
  return s.length - dot - 1
}

/** 按步长格式化展示（去掉多余尾零，如 0.850000 → 0.85） */
export function formatRangeDisplayValue(
  value: number,
  min: number,
  max: number,
  step: number,
): string {
  const n = snapToRangeStep(value, min, max, step)
  const d = rangeStepDecimals(step)
  if (d === 0) return String(Math.round(n))
  return n
    .toFixed(d)
    .replace(/(\.\d*?)0+$/, '$1')
    .replace(/\.$/, '')
}

/** 按步长吸附并消除浮点误差 */
export function snapToRangeStep(value: number, min: number, max: number, step: number): number {
  return snapToSliderStep(value, min, max, step)
}
