/**
 * 首装向导「能源绑定」统计口径选项（单一真源）。
 *
 * 用户手上常见三种电量传感器：年累计、月累计、日累计，它们会按周期自动清零。
 * 口径决定「哪些粒度的曲线可以直接读表」，写死在页面里就没人知道为什么
 * 绑了日累计表却看不到年曲线 —— 所以选项连同提示文案集中在这里。
 */
import type { EnergyMeterGrain, EnergyMeterScope } from '@homeos/shared'

export type EnergyScopeOption = {
  value: EnergyMeterScope
  label: string
  /** 该口径下直接读表的粒度（其余靠差分/求和） */
  directGrains: EnergyMeterGrain[]
  /** 一句话解释取舍 */
  hint: string
}

/** 直接读表的粒度标签（用于「口径」右侧的即时反馈） */
export const ENERGY_GRAIN_LABELS: Record<EnergyMeterGrain, string> = {
  day: '日',
  month: '月',
  year: '年',
}

export const ENERGY_SCOPE_OPTIONS: EnergyScopeOption[] = [
  {
    value: 'total',
    label: '终身累计',
    directGrains: [],
    hint: '从装表起只增不减；日/月/年全部靠读数差分，最通用',
  },
  {
    value: 'year',
    label: '年累计',
    directGrains: ['year'],
    hint: '每年 1 月 1 日清零；年总量直接读表，日/月靠差分',
  },
  {
    value: 'month',
    label: '月累计',
    directGrains: ['month'],
    hint: '每月 1 日清零；月总量直接读表，日曲线靠差分（账单核对首选）',
  },
  {
    value: 'day',
    label: '日累计',
    directGrains: ['day'],
    hint: '每日 0 点清零；今日用量直接读表，月/年由日数据求和（离线跨零点会缺当天）',
  },
]

/** 按口径取选项；未知口径回落到终身累计（最保守） */
export function resolveEnergyScopeOption(scope?: string | null): EnergyScopeOption {
  return ENERGY_SCOPE_OPTIONS.find((opt) => opt.value === scope) || ENERGY_SCOPE_OPTIONS[0]
}
