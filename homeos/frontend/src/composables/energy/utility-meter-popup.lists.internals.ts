/**
 * @file utility-meter-popup.lists.internals.ts
 * @module frontend/src/composables/energy
 */
import { ref, computed, watch, type ComputedRef } from 'vue'
import {
  resolveAccountEntityIds,
  normalizeEnergySource,
} from '@/shared/energy/utils/source.util'
import { readPopupField } from '@/shared/energy/utils/popup-read.util'
import { readPopupAttr, parseJsonAttr, parseNumAttr } from '@/shared/energy'
import type { UtilityMeterParsedItem } from '@/shared/energy'
import type { HaEntityState } from '@/shared/types/entity-store'
import { resolveAccountLabelForEntityId } from '@/shared/energy/utils/account.util'
import { getEntityDisplayName } from '@/shared/entity/utils/derived.util'
import type { EnergyCategory } from '@/shared/energy/constants/energy-fields'
import type { useEntitiesStore } from '@/stores/entities.store'
import type { useLayoutStore } from '@/stores/layout.store'

type EntitiesStore = ReturnType<typeof useEntitiesStore>
type LayoutStore = ReturnType<typeof useLayoutStore>

export function markMinMax(arr: UtilityMeterParsedItem[]) {
  if (!arr.length) return arr
  let maxI = 0
  let minI = 0
  for (let i = 1; i < arr.length; i++) {
    if (arr[i]._usage > arr[maxI]._usage) maxI = i
    if (arr[i]._usage < arr[minI]._usage) minI = i
  }
  arr[maxI]._isMax = true
  arr[minI]._isMin = true
  return arr
}

export function createUtilityMeterAccountState(opts: {
  props: { entityId?: string; [key: string]: unknown }
  sourceKey: EnergyCategory | string
  es: EntitiesStore
  layout: LayoutStore
}) {
  const { props, sourceKey, es, layout } = opts
  const activeEntityId = ref(props.entityId)
  watch(
    () => props.entityId,
    (v) => {
      activeEntityId.value = v || activeEntityId.value
    },
  )
  const accountOptions = computed(() => {
    const ids = resolveAccountEntityIds(sourceKey, layout.layoutConfig.statsSensors)
    if (props.entityId && !ids.includes(props.entityId)) ids.unshift(props.entityId)
    return [...new Set(ids)]
  })
  watch(
    accountOptions,
    (list) => {
      if (!activeEntityId.value && list.length) activeEntityId.value = list[0]
    },
    { immediate: true },
  )
  const sourceCfg = computed(() =>
    normalizeEnergySource(layout.layoutConfig.statsSensors, sourceKey),
  )
  function accountLabel(eid: string) {
    const fromConfig = resolveAccountLabelForEntityId(sourceKey, eid, sourceCfg.value)
    if (fromConfig) return fromConfig
    return getEntityDisplayName(eid, es.entities[eid])
  }
  function popField(key: string) {
    return readPopupField(
      sourceKey,
      key,
      layout.layoutConfig.statsSensors,
      es.entities,
      activeEntityId.value,
      sourceCfg.value,
    )
  }
  function popNum(key: string) {
    const raw = popField(key)
    if (raw == null || raw === '') return null
    return parseNumAttr(raw)
  }
  const ent = computed(() => es.entities[activeEntityId.value || ''] || null)
  const sourceMode = computed(() => sourceCfg.value.mode)
  const hasChartData = computed(() => {
    if (sourceMode.value === 'multi') {
      return !!(popField('daylist') || popField('monthlist') || popField('yearlist'))
    }
    return true
  })
  return {
    activeEntityId,
    accountOptions,
    sourceCfg,
    accountLabel,
    popField,
    popNum,
    ent,
    hasChartData,
  }
}

function buildPatchedYearlist(
  list: UtilityMeterParsedItem[],
  thisYear: number,
  yUsage: number | null,
  yCost: number | null,
): UtilityMeterParsedItem[] {
  if (yUsage == null && yCost == null) return list
  let found = false
  const patched = list.map((item) => {
    const yMatch = String(item._label || '').match(/(\d{4})/)
    if (!yMatch || parseInt(yMatch[1], 10) !== thisYear) return item
    found = true
    const usage = yUsage != null ? yUsage : item._usage
    const cost = yCost != null ? yCost : item._cost
    return {
      ...item,
      _usage: usage,
      _cost: cost,
      _usageStr: usage > 0 ? usage.toFixed(1) : '--',
      _costStr: cost > 0 ? cost.toFixed(2) : '--',
    }
  })
  if (!found) {
    const usage = yUsage ?? 0
    const cost = yCost ?? 0
    patched.unshift({
      _label: String(thisYear),
      _usage: usage,
      _cost: cost,
      _usageStr: usage > 0 ? usage.toFixed(1) : '--',
      _costStr: cost > 0 ? cost.toFixed(2) : '--',
      _time: String(thisYear),
    })
  }
  return patched
}

export function createUtilityMeterLists(opts: {
  popField: (key: string) => unknown
  popNum: (key: string) => number | null
  ent: ComputedRef<HaEntityState | null | undefined>
  parseDayItem: (x: Record<string, unknown>) => UtilityMeterParsedItem
  parseMonthItem: (x: Record<string, unknown>) => UtilityMeterParsedItem
  parseYearItem: (x: Record<string, unknown>) => UtilityMeterParsedItem
}) {
  const { popField, popNum, ent, parseDayItem, parseMonthItem, parseYearItem } = opts

  const rawDaylist = computed(
    () => parseJsonAttr(popField('daylist')) ?? parseJsonAttr(readPopupAttr(ent.value, 'daylist')),
  )
  const rawMonthlist = computed(
    () =>
      parseJsonAttr(popField('monthlist')) ?? parseJsonAttr(readPopupAttr(ent.value, 'monthlist')),
  )
  const rawYearlist = computed(
    () =>
      parseJsonAttr(popField('yearlist')) ?? parseJsonAttr(readPopupAttr(ent.value, 'yearlist')),
  )
  const daylist = computed(() => {
    const d = rawDaylist.value
    if (!Array.isArray(d) || !d.length) return [] as UtilityMeterParsedItem[]
    return markMinMax(d.slice(0, 31).map((item) => parseDayItem(item as Record<string, unknown>)))
  })
  const monthlist = computed(() => {
    const d = rawMonthlist.value
    if (!Array.isArray(d) || !d.length) return [] as UtilityMeterParsedItem[]
    return d.slice(0, 24).map((item) => parseMonthItem(item as Record<string, unknown>))
  })
  const yearlist = computed(() => {
    const d = rawYearlist.value
    const thisYear = new Date().getFullYear()
    const yUsage = popNum('yearNum')
    const yCost = popNum('yearCost')
    const list =
      Array.isArray(d) && d.length
        ? d.slice(0, 10).map((item) => parseYearItem(item as Record<string, unknown>))
        : ([] as UtilityMeterParsedItem[])
    return buildPatchedYearlist(list, thisYear, yUsage, yCost)
  })

  const exp = ref(false)
  const expTab = ref('day')
  const listForTab = () =>
    expTab.value === 'day'
      ? daylist.value
      : expTab.value === 'month'
        ? monthlist.value
        : yearlist.value
  const curList = computed(() =>
    listForTab().map((d) => ({ ...d, _usage: d._usageStr, _cost: d._costStr })),
  )
  const sumUsage = computed(() => listForTab().reduce((s, x) => s + x._usage, 0).toFixed(1))
  const sumCost = computed(() => listForTab().reduce((s, x) => s + x._cost, 0).toFixed(2))
  const summaryLabel = computed(() => {
    if (expTab.value === 'day') return `近${daylist.value.length}天合计:`
    if (expTab.value === 'month') return `近${monthlist.value.length}月合计:`
    return `${yearlist.value.length}年合计:`
  })

  return {
    daylist,
    monthlist,
    yearlist,
    exp,
    expTab,
    curList,
    sumUsage,
    sumCost,
    summaryLabel,
    mTrendStr: ref<string>(''),
    mTrendDir: ref<string>(''),
    lmTrendStr: ref<string>(''),
    lmTrendDir: ref<string>(''),
  }
}
