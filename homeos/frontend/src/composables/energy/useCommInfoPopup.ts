/**
 * @file useCommInfoPopup.ts
 * @module frontend/src/composables
 */
import { ref, computed, watch } from 'vue'
import { Wifi, Phone, MessageSquare } from '@lucide/vue'
import { useEntitiesStore } from '@/stores/entities.store'
import { useLayoutStore } from '@/stores/layout.store'
import { getEntityDisplayName } from '@/utils/entity/derived.util'
import { useRelativeDateLabel } from '@/composables/energy/useUtilityMeter'
import {
  formatNum,
  resolveAccountEntityIds,
  normalizeEnergySource,
} from '@/utils/energy/source.util'
import { readPopupField } from '@/utils/energy/popup-read.util'
import { resolveAccountLabelForEntityId } from '@/utils/energy/account.util'
import {
  COMM_CARRIER_BADGES,
  COMM_CARRIER_LABELS,
  resolveCommCarrierFromEntityId,
  type CommCarrier,
} from '@/utils/energy/comm-carrier.util'

function n(s: unknown) {
  const v = parseFloat(String(s ?? ''))
  return Number.isNaN(v) ? null : v
}

function fmtPct(raw: unknown) {
  if (raw == null || raw === '') return '--'
  const v = n(String(raw).replace('%', ''))
  return v != null ? v.toFixed(0) : '--'
}

function pctVal(raw: unknown) {
  const v = n(String(raw ?? '').replace('%', ''))
  if (v == null) return 0
  return Math.min(100, Math.max(0, v))
}

function ringSizeTier(val: string | number | null | undefined) {
  const len = String(val ?? '--').length
  if (len <= 4) return 'md'
  if (len <= 6) return 'sm'
  return 'xs'
}

const FIELD_KEYS = [
  'balance',
  'monthlyFee',
  'arrear',
  'creditLimit',
  'points',
  'refreshTime',
  'dataTotal',
  'dataUsed',
  'dataRemaining',
  'dataOverlimit',
  'dataCarryover',
  'dataUsageRate',
  'dataCommonTotal',
  'dataCommonUsed',
  'dataCommonRemaining',
  'dataCommonOver',
  'dataSpecialTotal',
  'dataSpecialUsed',
  'dataSpecialRemaining',
  'dataOtherTotal',
  'dataOtherUsed',
  'dataOtherRemaining',
  'talkTotal',
  'talkUsed',
  'talkRemaining',
  'talkUsageRate',
  'smsTotal',
  'smsUsed',
  'smsRemaining',
  'smsUsageRate',
] as const

type FieldKey = (typeof FIELD_KEYS)[number]

function hasVal(v: string) {
  return v !== '--' && v !== ''
}

/**
 * 通信账户详情弹窗 composable。
 * 字段对齐 china_comm CT/CU 综合余额 attributes + 单项实体后缀。
 */
export function useCommInfoPopup(props: { entityId?: string }) {
  const es = useEntitiesStore()
  const layout = useLayoutStore()
  const activeEntityId = ref(props.entityId || '')
  watch(
    () => props.entityId,
    (v) => {
      activeEntityId.value = v || activeEntityId.value
    },
  )

  const commCat = computed<CommCarrier>(() =>
    resolveCommCarrierFromEntityId(activeEntityId.value || props.entityId || ''),
  )
  const commBrand = commCat
  const commBrandLabel = computed(() => COMM_CARRIER_LABELS[commCat.value])
  const commBrandBadge = computed(() => COMM_CARRIER_BADGES[commCat.value])

  const accountOptions = computed(() => {
    const ids = resolveAccountEntityIds(commCat.value, layout.layoutConfig.statsSensors)
    if (props.entityId && !ids.includes(props.entityId)) ids.unshift(props.entityId)
    return [...new Set(ids)]
  })
  watch(
    accountOptions,
    (opts) => {
      if (!activeEntityId.value && opts.length) activeEntityId.value = opts[0]
    },
    { immediate: true },
  )

  const sourceCfg = computed(() =>
    normalizeEnergySource(layout.layoutConfig.statsSensors, commCat.value),
  )

  function accountLabel(eid: string) {
    const fromConfig = resolveAccountLabelForEntityId(commCat.value, eid, sourceCfg.value)
    if (fromConfig) return fromConfig
    return getEntityDisplayName(eid, es.entities[eid])
  }

  const fields = computed(() => {
    const cat = commCat.value
    const stats = layout.layoutConfig.statsSensors
    const entities = es.entities
    const eid = activeEntityId.value
    const cfg = sourceCfg.value
    const out = {} as Record<FieldKey, unknown>
    for (const key of FIELD_KEYS) {
      out[key] = readPopupField(cat, key, stats, entities, eid, cfg)
    }
    return out
  })

  const ent = computed(() => es.entities[activeEntityId.value] || null)

  const balance = computed(() => {
    const v = n(fields.value.balance) ?? n(ent.value?.state)
    return v != null ? v.toFixed(2) : '--'
  })
  const monthlyFee = computed(() => formatNum(fields.value.monthlyFee, 1))
  const arrear = computed(() => formatNum(fields.value.arrear, 2))
  const creditLimit = computed(() => formatNum(fields.value.creditLimit, 2))
  const points = computed(() => formatNum(fields.value.points, 0))
  const refreshTime = computed(() => String(fields.value.refreshTime || '--'))
  const { relLabel, relClass } = useRelativeDateLabel(refreshTime, 'um')

  const dataRemaining = computed(() => formatNum(fields.value.dataRemaining, 1))
  const dataUsed = computed(() => formatNum(fields.value.dataUsed, 1))
  const dataTotal = computed(() => formatNum(fields.value.dataTotal, 1))
  const dataOverlimit = computed(() => formatNum(fields.value.dataOverlimit, 1))
  const dataCarryover = computed(() => formatNum(fields.value.dataCarryover, 1))
  const dataUsageRate = computed(() => fmtPct(fields.value.dataUsageRate))
  const dataUsagePct = computed(() => pctVal(fields.value.dataUsageRate))

  const dataCommonRemaining = computed(() => formatNum(fields.value.dataCommonRemaining, 1))
  const dataCommonUsed = computed(() => formatNum(fields.value.dataCommonUsed, 1))
  const dataCommonTotal = computed(() => formatNum(fields.value.dataCommonTotal, 1))
  const dataCommonOver = computed(() => formatNum(fields.value.dataCommonOver, 1))
  const dataSpecialRemaining = computed(() => formatNum(fields.value.dataSpecialRemaining, 1))
  const dataSpecialUsed = computed(() => formatNum(fields.value.dataSpecialUsed, 1))
  const dataSpecialTotal = computed(() => formatNum(fields.value.dataSpecialTotal, 1))
  const dataOtherRemaining = computed(() => formatNum(fields.value.dataOtherRemaining, 1))
  const dataOtherUsed = computed(() => formatNum(fields.value.dataOtherUsed, 1))
  const dataOtherTotal = computed(() => formatNum(fields.value.dataOtherTotal, 1))

  const talkRemaining = computed(() => formatNum(fields.value.talkRemaining, 0))
  const talkUsed = computed(() => formatNum(fields.value.talkUsed, 0))
  const talkTotal = computed(() => formatNum(fields.value.talkTotal, 0))
  const talkUsageRate = computed(() => fmtPct(fields.value.talkUsageRate))
  const talkUsagePct = computed(() => pctVal(fields.value.talkUsageRate))

  const smsRemaining = computed(() => formatNum(fields.value.smsRemaining, 0))
  const smsUsed = computed(() => formatNum(fields.value.smsUsed, 0))
  const smsTotal = computed(() => formatNum(fields.value.smsTotal, 0))
  const smsUsageRate = computed(() => fmtPct(fields.value.smsUsageRate))
  const smsUsagePct = computed(() => pctVal(fields.value.smsUsageRate))

  const hasSmsQuota = computed(
    () =>
      hasVal(smsRemaining.value) ||
      hasVal(smsUsed.value) ||
      hasVal(smsTotal.value) ||
      hasVal(smsUsageRate.value),
  )

  /** 通用 / 专用 / 其他流量明细（有数据时展示） */
  const flowBreakdown = computed(() => {
    const rows: Array<{
      id: string
      label: string
      remaining: string
      used: string
      total: string
      over?: string
    }> = []
    if (
      hasVal(dataCommonRemaining.value) ||
      hasVal(dataCommonUsed.value) ||
      hasVal(dataCommonTotal.value)
    ) {
      rows.push({
        id: 'common',
        label: '通用流量',
        remaining: dataCommonRemaining.value,
        used: dataCommonUsed.value,
        total: dataCommonTotal.value,
        over: hasVal(dataCommonOver.value) ? dataCommonOver.value : undefined,
      })
    }
    if (
      hasVal(dataSpecialRemaining.value) ||
      hasVal(dataSpecialUsed.value) ||
      hasVal(dataSpecialTotal.value)
    ) {
      rows.push({
        id: 'special',
        label: '专用流量',
        remaining: dataSpecialRemaining.value,
        used: dataSpecialUsed.value,
        total: dataSpecialTotal.value,
      })
    }
    if (
      hasVal(dataOtherRemaining.value) ||
      hasVal(dataOtherUsed.value) ||
      hasVal(dataOtherTotal.value)
    ) {
      rows.push({
        id: 'other',
        label: '其他流量',
        remaining: dataOtherRemaining.value,
        used: dataOtherUsed.value,
        total: dataOtherTotal.value,
      })
    }
    return rows
  })

  const quotaCards = computed(() => {
    const cards = [
      {
        id: 'data',
        icon: Wifi,
        shortTitle: '流量',
        accent: '#22d3ee',
        accentSoft: 'rgba(34, 211, 238, 0.15)',
        remaining: dataRemaining.value,
        used: dataUsed.value,
        usedLabel: '流量已用',
        total: dataTotal.value,
        over: dataOverlimit.value,
        overLabel: '流量超出',
        note: hasVal(dataCarryover.value) ? `上月转接 ${dataCarryover.value} GB` : '',
        rate: dataUsageRate.value,
        pct: dataUsagePct.value,
        unit: 'GB',
        unitShort: 'GB',
        sizeTier: ringSizeTier(dataRemaining.value),
      },
      {
        id: 'voice',
        icon: Phone,
        shortTitle: '语音',
        accent: '#4ade80',
        accentSoft: 'rgba(74, 222, 128, 0.15)',
        remaining: talkRemaining.value,
        used: talkUsed.value,
        usedLabel: '通话已用',
        total: talkTotal.value,
        over: '--',
        overLabel: '',
        note: '',
        rate: talkUsageRate.value,
        pct: talkUsagePct.value,
        unit: '分钟',
        unitShort: '分',
        sizeTier: ringSizeTier(talkRemaining.value),
      },
    ]
    if (hasSmsQuota.value) {
      cards.push({
        id: 'sms',
        icon: MessageSquare,
        shortTitle: '短信',
        accent: '#a78bfa',
        accentSoft: 'rgba(167, 139, 250, 0.15)',
        remaining: hasVal(smsRemaining.value) ? smsRemaining.value : smsTotal.value,
        used: smsUsed.value,
        usedLabel: hasVal(smsUsed.value) ? '短信已用' : '短信总量',
        total: hasVal(smsUsed.value) ? smsTotal.value : '--',
        over: '--',
        overLabel: '',
        note: '',
        rate: smsUsageRate.value,
        pct: smsUsagePct.value,
        unit: '条',
        unitShort: '条',
        sizeTier: ringSizeTier(hasVal(smsRemaining.value) ? smsRemaining.value : smsTotal.value),
      })
    }
    return cards
  })

  return {
    activeEntityId,
    commBrand,
    commBrandLabel,
    commBrandBadge,
    accountOptions,
    accountLabel,
    balance,
    monthlyFee,
    arrear,
    creditLimit,
    points,
    refreshTime,
    relLabel,
    relClass,
    quotaCards,
    flowBreakdown,
  }
}
