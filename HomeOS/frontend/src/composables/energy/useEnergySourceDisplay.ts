/**
 * 能源统计展示层：账户标识与格式化后的统计 computed
 */
import { computed, type ComputedRef } from 'vue'
import { formatLocaleTime } from '@/utils/format/locale-format.util'
import { ENERGY_CATEGORIES, type EnergyCategory } from '@/constants/energy-fields'
import { formatNum, type normalizeEnergySource } from '@/utils/energy/source.util'
import {
  getFirstAccount,
  resolveAccountDisplayRows,
  resolvePrimaryAccount,
  resolvePrimaryAccountIndex,
  resolveRawAccountRowCount,
} from '@/utils/energy/account.util'
import type { HaEntityState } from '@/types/entity-store'

function asDisplayString(value: unknown, fallback = '--'): string {
  if (value == null || value === '') return fallback
  return String(value)
}

interface EnergySourceDisplayContext {
  cfg: (cat: EnergyCategory | string) => ReturnType<typeof normalizeEnergySource>
  raw: (cat: EnergyCategory | string, fieldKey: string, accountIndex?: number) => unknown
  configured: (cat: EnergyCategory | string) => boolean
  primaryEntityId: (cat: EnergyCategory | string, accountIndex?: number) => string
  entitiesView: () => Record<string, HaEntityState | undefined>
}

type ElecStats = {
  dailyNum: string
  dailyCost: string
  monthNum: string
  monthCost: string
  lastMonthNum: string
  lastMonthCost: string
  yearNum: string
  yearCost: string
  balance: string
  dailyDate: string
  remainingDays: string
  updatedAt: string
}

/** 气 / 水表统计 */
type UtilityMeterStats = {
  balance: string
  dailyNum: string
  dailyCost: string
  monthNum: string
  monthCost: string
  lastMonthNum: string
  lastMonthCost: string
  yearNum: string
  yearCost: string
  meterReading: string
  unitPrice: string
  refreshTime: string
  dataDate: string
}

/** 通信运营商统计（对齐 china_comm CT/CU 字段） */
type CommStats = {
  balance: string
  monthlyFee: string
  arrear: string
  creditLimit: string
  points: string
  refreshTime: string
  dataTotal: string
  dataUsed: string
  dataRemaining: string
  dataOverlimit: string
  dataCarryover: string
  dataUsageRate: string
  dataCommonTotal: string
  dataCommonUsed: string
  dataCommonRemaining: string
  dataCommonOver: string
  dataSpecialTotal: string
  dataSpecialUsed: string
  dataSpecialRemaining: string
  dataOtherTotal: string
  dataOtherUsed: string
  dataOtherRemaining: string
  talkTotal: string
  talkUsed: string
  talkRemaining: string
  talkUsageRate: string
  smsTotal: string
  smsUsed: string
  smsRemaining: string
  smsUsageRate: string
}

type AccountStats = ElecStats & UtilityMeterStats & CommStats

interface EnergyAccountRow {
  index: number
  number: string
  label: string
  balance: string
  stats: AccountStats | null
  isPrimary: boolean
}

interface EnergySourceDisplayResult {
  gridAccount: ComputedRef<string>
  gasAccount: ComputedRef<string>
  waterAccount: ComputedRef<string>
  ctAccount: ComputedRef<string>
  cuAccount: ComputedRef<string>
  gridAccountList: ComputedRef<EnergyAccountRow[]>
  gasAccountList: ComputedRef<EnergyAccountRow[]>
  waterAccountList: ComputedRef<EnergyAccountRow[]>
  ctAccountList: ComputedRef<EnergyAccountRow[]>
  cuAccountList: ComputedRef<EnergyAccountRow[]>
  elecStats: ComputedRef<AccountStats>
  gasBalance: ComputedRef<string>
  waterBalance: ComputedRef<string>
  ctBalance: ComputedRef<string>
  cuBalance: ComputedRef<string>
  gasStats: ComputedRef<AccountStats>
  waterStats: ComputedRef<AccountStats>
  ctStats: ComputedRef<AccountStats>
  cuStats: ComputedRef<AccountStats>
  hasPowerData: ComputedRef<boolean>
}

function accountComputed(ctx: EnergySourceDisplayContext, cat: string) {
  return computed(() => {
    const src = ctx.cfg(cat)
    if (src.mode === 'convention' || !src.mode) {
      return resolvePrimaryAccount(src) || getFirstAccount(src.account)
    }
    return ctx.primaryEntityId(cat)
  })
}

function emptyElecStats(): ElecStats {
  return {
    dailyNum: '--',
    dailyCost: '--',
    monthNum: '--',
    monthCost: '--',
    lastMonthNum: '--',
    lastMonthCost: '--',
    yearNum: '--',
    yearCost: '--',
    balance: '--',
    dailyDate: '--',
    remainingDays: '--',
    updatedAt: '--',
  }
}

function emptyUtilityMeterStats(): UtilityMeterStats {
  return {
    balance: '--',
    dailyNum: '--',
    dailyCost: '--',
    monthNum: '--',
    monthCost: '--',
    lastMonthNum: '--',
    lastMonthCost: '--',
    yearNum: '--',
    yearCost: '--',
    meterReading: '--',
    unitPrice: '--',
    refreshTime: '--',
    dataDate: '--',
  }
}

function emptyCommStats(): CommStats {
  return {
    balance: '--',
    monthlyFee: '--',
    arrear: '--',
    creditLimit: '--',
    points: '--',
    refreshTime: '--',
    dataTotal: '--',
    dataUsed: '--',
    dataRemaining: '--',
    dataOverlimit: '--',
    dataCarryover: '--',
    dataUsageRate: '--',
    dataCommonTotal: '--',
    dataCommonUsed: '--',
    dataCommonRemaining: '--',
    dataCommonOver: '--',
    dataSpecialTotal: '--',
    dataSpecialUsed: '--',
    dataSpecialRemaining: '--',
    dataOtherTotal: '--',
    dataOtherUsed: '--',
    dataOtherRemaining: '--',
    talkTotal: '--',
    talkUsed: '--',
    talkRemaining: '--',
    talkUsageRate: '--',
    smsTotal: '--',
    smsUsed: '--',
    smsRemaining: '--',
    smsUsageRate: '--',
  }
}

function emptyAccountStats(): AccountStats {
  return {
    ...emptyElecStats(),
    ...emptyUtilityMeterStats(),
    ...emptyCommStats(),
  }
}

function buildElecStatsAtIndex(ctx: EnergySourceDisplayContext, accountIndex: number): AccountStats {
  if (!ctx.configured('grid')) return emptyAccountStats()
  const refreshRaw = ctx.raw('grid', 'refreshTime', accountIndex)
  const balanceEnt = ctx.entitiesView()[ctx.primaryEntityId('grid', accountIndex)] as
    | { last_changed?: string }
    | undefined
  const updatedAt =
    refreshRaw ||
    (balanceEnt?.last_changed
      ? formatLocaleTime(balanceEnt.last_changed, { hour: '2-digit', minute: '2-digit' })
      : '--')
  return {
    ...emptyAccountStats(),
    dailyNum: formatNum(ctx.raw('grid', 'dailyNum', accountIndex)),
    dailyCost: formatNum(ctx.raw('grid', 'dailyCost', accountIndex)),
    monthNum: formatNum(ctx.raw('grid', 'monthNum', accountIndex)),
    monthCost: formatNum(ctx.raw('grid', 'monthCost', accountIndex)),
    lastMonthNum: formatNum(ctx.raw('grid', 'lastMonthNum', accountIndex)),
    lastMonthCost: formatNum(ctx.raw('grid', 'lastMonthCost', accountIndex)),
    yearNum: formatNum(ctx.raw('grid', 'yearNum', accountIndex)),
    yearCost: formatNum(ctx.raw('grid', 'yearCost', accountIndex)),
    balance: formatNum(ctx.raw('grid', 'balance', accountIndex), 2),
    dailyDate: asDisplayString(ctx.raw('grid', 'dailyDate', accountIndex)),
    remainingDays: asDisplayString(ctx.raw('grid', 'remainingDays', accountIndex)),
    updatedAt: asDisplayString(updatedAt),
  }
}

function buildCommStatsAtIndex(
  ctx: EnergySourceDisplayContext,
  cat: 'ct' | 'cu',
  accountIndex: number,
): AccountStats {
  if (!ctx.configured(cat)) return emptyAccountStats()
  const fmt = (key: string, dec = 1) => formatNum(ctx.raw(cat, key, accountIndex), dec)
  const raw = (key: string) => asDisplayString(ctx.raw(cat, key, accountIndex))
  return {
    ...emptyAccountStats(),
    balance: fmt('balance', 2),
    monthlyFee: fmt('monthlyFee', 1),
    arrear: fmt('arrear', 2),
    creditLimit: fmt('creditLimit', 2),
    points: raw('points'),
    refreshTime: raw('refreshTime'),
    dataTotal: raw('dataTotal'),
    dataUsed: raw('dataUsed'),
    dataRemaining: raw('dataRemaining'),
    dataOverlimit: raw('dataOverlimit'),
    dataCarryover: raw('dataCarryover'),
    dataUsageRate: raw('dataUsageRate'),
    dataCommonTotal: raw('dataCommonTotal'),
    dataCommonUsed: raw('dataCommonUsed'),
    dataCommonRemaining: raw('dataCommonRemaining'),
    dataCommonOver: raw('dataCommonOver'),
    dataSpecialTotal: raw('dataSpecialTotal'),
    dataSpecialUsed: raw('dataSpecialUsed'),
    dataSpecialRemaining: raw('dataSpecialRemaining'),
    dataOtherTotal: raw('dataOtherTotal'),
    dataOtherUsed: raw('dataOtherUsed'),
    dataOtherRemaining: raw('dataOtherRemaining'),
    talkTotal: raw('talkTotal'),
    talkUsed: raw('talkUsed'),
    talkRemaining: raw('talkRemaining'),
    talkUsageRate: raw('talkUsageRate'),
    smsTotal: raw('smsTotal'),
    smsUsed: raw('smsUsed'),
    smsRemaining: raw('smsRemaining'),
    smsUsageRate: raw('smsUsageRate'),
  }
}

function buildUtilityMeterStatsAtIndex(
  ctx: EnergySourceDisplayContext,
  cat: EnergyCategory,
  accountIndex: number,
): AccountStats {
  if (!ctx.configured(cat)) return emptyAccountStats()
  return {
    ...emptyAccountStats(),
    balance: formatNum(ctx.raw(cat, 'balance', accountIndex), 2),
    dailyNum: formatNum(ctx.raw(cat, 'dailyNum', accountIndex), 1),
    dailyCost: formatNum(ctx.raw(cat, 'dailyCost', accountIndex), 2),
    monthNum: formatNum(ctx.raw(cat, 'monthNum', accountIndex), 1),
    monthCost: formatNum(ctx.raw(cat, 'monthCost', accountIndex), 1),
    lastMonthNum: formatNum(ctx.raw(cat, 'lastMonthNum', accountIndex), 1),
    lastMonthCost: formatNum(ctx.raw(cat, 'lastMonthCost', accountIndex), 1),
    yearNum: formatNum(ctx.raw(cat, 'yearNum', accountIndex), 1),
    yearCost: formatNum(ctx.raw(cat, 'yearCost', accountIndex), 1),
    meterReading: formatNum(ctx.raw(cat, 'meterReading', accountIndex), 1),
    unitPrice: formatNum(ctx.raw(cat, 'unitPrice', accountIndex), 2),
    refreshTime: asDisplayString(ctx.raw(cat, 'refreshTime', accountIndex)),
    dataDate: asDisplayString(ctx.raw(cat, 'dailyDate', accountIndex)),
  }
}

function buildAccountStatsAtIndex(
  ctx: EnergySourceDisplayContext,
  cat: EnergyCategory,
  accountIndex: number,
): AccountStats {
  if (cat === 'grid') return buildElecStatsAtIndex(ctx, accountIndex)
  if (cat === 'ct' || cat === 'cu') return buildCommStatsAtIndex(ctx, cat, accountIndex)
  return buildUtilityMeterStatsAtIndex(ctx, cat, accountIndex)
}

function primaryRowFromList(list: EnergyAccountRow[]) {
  return list.find((r) => r.isPrimary) || list[0] || null
}

function primaryDerivedFromList(list: ComputedRef<EnergyAccountRow[]>) {
  const primary = computed(() => primaryRowFromList(list.value))
  return {
    stats: computed(() => primary.value?.stats ?? emptyAccountStats()),
    balance: computed(() => primary.value?.balance ?? '--'),
  }
}

function buildAccountList(ctx: EnergySourceDisplayContext, cat: EnergyCategory) {
  return computed((): EnergyAccountRow[] => {
    if (!ctx.configured(cat)) return []
    const src = ctx.cfg(cat)
    const rows = resolveAccountDisplayRows(src)
    const primaryRow = resolvePrimaryAccountIndex(src, resolveRawAccountRowCount(src) || 1)
    return rows.map(({ rowIndex, key, label }) => {
      const stats = buildAccountStatsAtIndex(ctx, cat, rowIndex)
      return {
        index: rowIndex,
        number: key,
        label,
        balance: stats.balance,
        stats,
        isPrimary: rowIndex === primaryRow,
      }
    })
  })
}

/** useEnergySourceDisplay：函数，按签名入参返回处理结果。 */
export function useEnergySourceDisplay(ctx: EnergySourceDisplayContext): EnergySourceDisplayResult {
  const gridAccount = accountComputed(ctx, 'grid')
  const gasAccount = accountComputed(ctx, 'gas')
  const waterAccount = accountComputed(ctx, 'water')
  const ctAccount = accountComputed(ctx, 'ct')
  const cuAccount = accountComputed(ctx, 'cu')

  const gridAccountList = buildAccountList(ctx, 'grid')
  const gasAccountList = buildAccountList(ctx, 'gas')
  const waterAccountList = buildAccountList(ctx, 'water')
  const ctAccountList = buildAccountList(ctx, 'ct')
  const cuAccountList = buildAccountList(ctx, 'cu')

  const elecPrimary = primaryDerivedFromList(gridAccountList)
  const gasPrimary = primaryDerivedFromList(gasAccountList)
  const waterPrimary = primaryDerivedFromList(waterAccountList)
  const ctPrimary = primaryDerivedFromList(ctAccountList)
  const cuPrimary = primaryDerivedFromList(cuAccountList)

  const elecStats = elecPrimary.stats
  const gasBalance = gasPrimary.balance
  const waterBalance = waterPrimary.balance
  const ctBalance = ctPrimary.balance
  const cuBalance = cuPrimary.balance
  const gasStats = gasPrimary.stats
  const waterStats = waterPrimary.stats
  const ctStats = ctPrimary.stats
  const cuStats = cuPrimary.stats

  const hasPowerData = computed(() => ENERGY_CATEGORIES.some((cat) => ctx.configured(cat)))

  return {
    gridAccount,
    gasAccount,
    waterAccount,
    ctAccount,
    cuAccount,
    gridAccountList,
    gasAccountList,
    waterAccountList,
    ctAccountList,
    cuAccountList,
    elecStats,
    gasBalance,
    waterBalance,
    ctBalance,
    cuBalance,
    gasStats,
    waterStats,
    ctStats,
    cuStats,
    hasPowerData,
  }
}
