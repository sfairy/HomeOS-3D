/**
 * 公用事业仪表盘弹窗预设（水 / 气 / 电）
 *
 * 职责：
 * - 维护水、燃气、电网三类公用事业详情弹窗的完整预设配置。
 * - 每类预设包含弹窗尺寸、主题色、图标、中文文案标签、解析函数等。
 * - 供 UtilityMeterPopup 组件按 kind 选用对应预设渲染。
 *
 * 依赖：
 * - @lucide/vue 图标组件。
 * - @/composables/energy/utility-meter-parse-helpers 中的日 / 月 / 年明细解析函数。
 *
 * 注意：
 * - `kind` / `sourceKey`（water / gas / grid）为配置 key，不翻译。
 * - `shellClass` / `innerClass` / `closeClass` / `calClassPrefix` / `expandPrefix` 为 CSS 类名，不翻译。
 * - `unitLabelKey`（ton / cubicMeter / kwh）为能源单位 key，不翻译。
 * - `accentColor` / `theme` 中的颜色为 CSS 颜色值，不翻译。
 * - `amountKey` / `usageKey` 为明细数据字段 key，不翻译。
 * - 仅面向用户的文案字段（title / balanceLabel / priceLabel 等）使用简体中文。
 */
import { Droplets, Flame, Zap } from '@lucide/vue'
import {
  parseGasDayItem,
  parseGasMonthItem,
  parseGasYearItem,
  parseGridDayItem,
  parseGridMonthItem,
  parseGridYearItem,
  parseWaterDayItem,
  parseWaterMonthItem,
  parseWaterYearItem,
} from '@/composables/energy/utility-meter-parse-helpers'

/** 公用事业仪表类别：水 / 燃气 / 电网 */
type UtilityMeterKind = 'water' | 'gas' | 'grid'

/** 公用事业详情弹窗预设：包含样式、文案、解析函数等完整配置 */
type UtilityMeterPreset = {
  kind: UtilityMeterKind
  sourceKey: 'water' | 'gas' | 'grid'
  /** 弹窗外壳 CSS 类名 */
  shellClass: string
  /** 弹窗内层 CSS 类名 */
  innerClass: string
  /** 关闭按钮 CSS 类名 */
  closeClass: string
  /** 弹窗宽度（px） */
  width: number
  /** 弹窗高度（px） */
  height: number
  /** 弹窗标题文案 */
  title: string
  /** 图标组件（@lucide/vue） */
  icon: typeof Droplets
  /** 主题色配置：强调色 / 半透明背景 / 用量色 / 费用色 */
  theme: { accent: string; accentSoft: string; usage: string; cost: string }
  /** 渐变起止色 */
  accentColor: { color1: string; color2: string }
  /** 单位标签 i18n key（ton / cubicMeter / kwh） */
  unitLabelKey: string
  /** 日历视图 CSS 类名前缀 */
  calClassPrefix: string
  /** 展开视图 CSS 类名前缀 */
  expandPrefix: string
  /** 用量单位显示文案 */
  usageUnit: string
  /** 余额标签文案 */
  balanceLabel: string
  /** 单价标签文案 */
  priceLabel: string
  /** 单价单位文案 */
  priceUnit: string
  /** 数据日期标签文案 */
  dataDateLabel: string
  /** 日用量柱状图标签文案 */
  dailyBarLabel: string
  /** 阶梯价标题文案（无阶梯段时省略） */
  tierTitle?: string
  /** 阶梯价单位文案（无阶梯段时省略） */
  tierUnit?: string
  /** 月度统计标签文案 */
  statMonthLabel: string
  /** 上月统计标签文案 */
  statLastMonthLabel: string
  /** 年度统计后缀文案 */
  statYearSuffix: string
  /** 明细金额字段 key */
  amountKey: string
  /** 明细用量字段 key */
  usageKey: string
  /** 日明细解析函数 */
  parseDayItem: (item: unknown, ...args: unknown[]) => unknown
  /** 月明细解析函数 */
  parseMonthItem: (item: unknown, ...args: unknown[]) => unknown
  /** 年明细解析函数 */
  parseYearItem: (item: unknown, ...args: unknown[]) => unknown
  /** 是否展示阶梯价区块 */
  hasTierSection: boolean
  /** 是否把活动实体 ID 同步回能源来源配置 */
  syncActiveEntityId: boolean
  /** 阶梯价字段映射（key → 中文说明） */
  tierFieldMap?: Record<string, string>
}

/** 水费明细的金额字段 key */
const WATER_AMT = 'money'
/** 水费明细的用量字段 key */
const WATER_USE = 'usage'

/** 三类公用事业弹窗预设映射表（key 为 UtilityMeterKind） */
const UTILITY_METER_PRESETS: Record<UtilityMeterKind, UtilityMeterPreset> = {
  water: {
    kind: 'water',
    sourceKey: 'water',
    shellClass: 'w-popup',
    innerClass: 'w-popup__inner',
    closeClass: 'w-popup__close',
    width: 340,
    height: 480,
    title: '用水信息',
    icon: Droplets,
    theme: {
      accent: '#22d3ee',
      accentSoft: 'rgba(6, 182, 212, 0.14)',
      usage: '#4ade80',
      cost: '#facc15',
    },
    accentColor: { color1: '#22d3ee', color2: '#06b6d4' },
    unitLabelKey: 'ton',
    calClassPrefix: 'w',
    expandPrefix: 'w',
    usageUnit: '吨',
    balanceLabel: '账户余额',
    priceLabel: '水价',
    priceUnit: '元/吨',
    dataDateLabel: '数据:',
    dailyBarLabel: '日用水 · 水费',
    tierTitle: '阶梯水价',
    tierUnit: '吨',
    statMonthLabel: '月度用水',
    statLastMonthLabel: '上月用水',
    statYearSuffix: '年用水',
    amountKey: WATER_AMT,
    usageKey: WATER_USE,
    parseDayItem: (x) => parseWaterDayItem(x as Record<string, unknown>, WATER_AMT, WATER_USE),
    parseMonthItem: (x, amountKey, usageKey) =>
      parseWaterMonthItem(
        x as Record<string, unknown>,
        amountKey as string | null | undefined,
        usageKey as string | null | undefined,
      ),
    parseYearItem: (x, amountKey, usageKey) =>
      parseWaterYearItem(
        x as Record<string, unknown>,
        amountKey as string | null | undefined,
        usageKey as string | null | undefined,
      ),
    hasTierSection: true,
    syncActiveEntityId: false,
  },
  gas: {
    kind: 'gas',
    sourceKey: 'gas',
    shellClass: 'gas-popup',
    innerClass: 'gas-popup__inner',
    closeClass: 'gas-popup__close',
    width: 400,
    height: 370,
    title: '用气信息',
    icon: Flame,
    theme: {
      accent: '#fb923c',
      accentSoft: 'rgba(249, 115, 22, 0.14)',
      usage: '#4ade80',
      cost: '#facc15',
    },
    accentColor: { color1: '#fb923c', color2: '#f97316' },
    unitLabelKey: 'cubicMeter',
    calClassPrefix: 'gas',
    expandPrefix: 'gas',
    usageUnit: 'm³',
    balanceLabel: '账户余额',
    priceLabel: '气价',
    priceUnit: '元/m³',
    dataDateLabel: '数据日期:',
    dailyBarLabel: '日用气 · 气费',
    tierTitle: '阶梯气价',
    tierUnit: 'm³',
    statMonthLabel: '月度用气',
    statLastMonthLabel: '上月用气',
    statYearSuffix: '年用气',
    amountKey: 'amount',
    usageKey: 'usage',
    parseDayItem: (x, amountKey, usageKey) =>
      parseGasDayItem(
        x as Record<string, unknown>,
        amountKey as string | null | undefined,
        usageKey as string | null | undefined,
      ),
    parseMonthItem: (x, amountKey, usageKey) =>
      parseGasMonthItem(
        x as Record<string, unknown>,
        amountKey as string | null | undefined,
        usageKey as string | null | undefined,
      ),
    parseYearItem: (x, amountKey, usageKey) =>
      parseGasYearItem(
        x as Record<string, unknown>,
        amountKey as string | null | undefined,
        usageKey as string | null | undefined,
      ),
    hasTierSection: true,
    syncActiveEntityId: true,
    tierFieldMap: {
      t1Limit: '年阶梯第2档起始气量',
      t2Limit: '年阶梯第3档起始气量',
      t1Price: '年阶梯第1档气价',
      t2Price: '年阶梯第2档气价',
      t3Price: '年阶梯第3档气价',
    },
  },
  grid: {
    kind: 'grid',
    sourceKey: 'grid',
    shellClass: 'ele-popup',
    innerClass: 'ele-popup__inner',
    closeClass: 'ele-popup__close',
    width: 400,
    height: 340,
    title: '用电信息',
    icon: Zap,
    theme: {
      accent: '#fbbf24',
      accentSoft: 'rgba(251, 191, 36, 0.14)',
      usage: '#4ade80',
      cost: '#facc15',
    },
    accentColor: { color1: '#fbbf24', color2: '#fb923c' },
    unitLabelKey: 'kwh',
    calClassPrefix: 'ele',
    expandPrefix: 'ele',
    usageUnit: 'kWh',
    balanceLabel: '账户余额',
    priceLabel: '电价',
    priceUnit: '元/kWh',
    dataDateLabel: '数据日期:',
    dailyBarLabel: '日用电 · 电费',
    statMonthLabel: '本月用电',
    statLastMonthLabel: '上月用电',
    statYearSuffix: '年用电',
    amountKey: 'dayEleCost',
    usageKey: 'dayEleNum',
    parseDayItem: (x, amountKey, usageKey) =>
      parseGridDayItem(
        x as Record<string, unknown>,
        amountKey as string | null | undefined,
        usageKey as string | null | undefined,
      ),
    parseMonthItem: (x, amountKey, usageKey) =>
      parseGridMonthItem(
        x as Record<string, unknown>,
        amountKey as string | null | undefined,
        usageKey as string | null | undefined,
      ),
    parseYearItem: (x, amountKey, usageKey) =>
      parseGridYearItem(
        x as Record<string, unknown>,
        amountKey as string | null | undefined,
        usageKey as string | null | undefined,
      ),
    hasTierSection: false,
    syncActiveEntityId: true,
  },
}

/**
 * 根据 kind 获取对应的公用事业弹窗预设。
 *
 * @param kind - 公用事业类别（water / gas / grid）。
 * @returns 对应的 UtilityMeterPreset 对象。
 */
export function resolveUtilityMeterPreset(kind: UtilityMeterKind) {
  return UTILITY_METER_PRESETS[kind]
}
