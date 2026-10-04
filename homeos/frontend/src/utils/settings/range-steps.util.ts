/** 设置页滑块步长语义（与 SettingsRangeField 配合） */

import { snapToSliderStep } from '@/utils/ui/progress-bar.util'

/** SETTINGS_RANGE_STEP：对象常量，字段 / 方法语义见定义处。 */
export const SETTINGS_RANGE_STEP = {
  /** 倍率类 0.3–3× */
  multiplier: 0.1,
  /** 0–1 权重 / 混合比 */
  weight: 0.05,
  /** 0–2 特效强度、密度、光晕等 */
  effectStrength: 0.1,
  /** 0–1 雨水/雪花占比 */
  ratio: 0.05,
  /** 0.2–2.5 漂移、流动速度 */
  motionSpeed: 0.1,
  /** 整数层数、个数 */
  integer: 1,
  /** 50–800 星星数量 */
  starCount: 20,
  /** 极低概率 0–0.01（流星等，预设含 0.00035 / 0.0006） */
  probabilityTiny: 0.00005,
  /** 闪电间隔（毫秒） */
  lightningMinMs: 500,
  lightningMaxMs: 1000,
  /** 像素 · 大屏布局宽度 */
  layoutWidth: 10,
  /** 像素 · 侧栏/消息墙等中等尺寸 */
  panelPx: 5,
  /** 像素 · 大坐标微调 */
  positionPx: 5,
  /** 像素 · 按钮尺寸 */
  btnSizePx: 2,
  /** 百分比 0–100 */
  percent: 1,
  /** 秒 */
  seconds: 1,
  /** 亮度/百分比 20–100 */
  brightnessPct: 5,
  /** 小时 0–23 */
  hour: 1,
} as const

/** 天气场景滑块字段分类（决定 min/max/step 取哪一组规格） */
type WeatherSceneFieldKind =
  | 'effectStrength'
  | 'driftSpeed'
  | 'ratio'
  | 'fogLayers'
  | 'fogDrift'
  | 'lightningMinMs'
  | 'lightningMaxMs'

/** 天气场景字段规格表：每种 kind 对应一组 min/max/step */
const WEATHER_SCENE_FIELD_SPECS: Record<
  WeatherSceneFieldKind,
  { min: number; max: number; step: number }
> = {
  effectStrength: { min: 0, max: 2, step: SETTINGS_RANGE_STEP.effectStrength },
  driftSpeed: { min: 0.3, max: 2.5, step: SETTINGS_RANGE_STEP.motionSpeed },
  ratio: { min: 0, max: 1, step: SETTINGS_RANGE_STEP.ratio },
  fogLayers: { min: 1, max: 6, step: SETTINGS_RANGE_STEP.integer },
  fogDrift: { min: 0.2, max: 2, step: SETTINGS_RANGE_STEP.motionSpeed },
  lightningMinMs: { min: 800, max: 8000, step: SETTINGS_RANGE_STEP.lightningMinMs },
  lightningMaxMs: { min: 3000, max: 20000, step: SETTINGS_RANGE_STEP.lightningMaxMs },
}

/**
 * 构造天气场景滑块字段定义（合并 key、label 与对应规格的 min/max/step）。
 *
 * @param key 字段配置 key
 * @param label 字段中文显示标签
 * @param kind 字段分类，决定取哪一组规格
 * @returns 含 key / label / min / max / step 的字段定义对象
 */
export function weatherSceneField(key: string, label: string, kind: WeatherSceneFieldKind) {
  return { key, label, ...WEATHER_SCENE_FIELD_SPECS[kind] }
}

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
