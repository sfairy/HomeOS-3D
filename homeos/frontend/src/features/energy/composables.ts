import { computed, onMounted, onUnmounted, watch, ref, onBeforeUnmount, type Ref, type ComputedRef, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import axios from 'axios'
import { fetchSystemConfig, reportClientPower } from '@/kernel/http'
import { type ApiRequestConfig } from '@/domain/api/index'
import { useAuthStore } from '@/domain/auth/auth.store'
import { buildClientSystemReport, ensureBatteryManager, onBatteryChange, readBatterySnapshotSync } from '@/domain/client/utils'
import { logger, isLicenseInactiveError, schedulePoll } from '@/kernel/utils/core'
import { getLicenseActivated } from '@/domain/license'
import { Wifi, Phone, MessageSquare } from '@lucide/vue'
import { useEntitiesStore } from '@/domain/entity/store/entities.store'
import { useLayoutStore } from '@/domain/layout/store'
import { getEntityDisplayName } from '@/domain/entity/model/utils/derived.util'
import { useRelativeDateLabel, readPopupAttr, parseJsonAttr, parseNumAttr, type UtilityMeterParsedItem, parseDateParts } from '@/domain/energy/model/index'
import { formatNum, resolveAccountEntityIds, normalizeEnergySource } from '@/domain/energy/model/utils/source.util'
import { readPopupField } from '@/domain/energy/model/utils/popup-read.util'
import { resolveAccountLabelForEntityId } from '@/domain/energy/model/utils/account.util'
import { COMM_CARRIER_BADGES, COMM_CARRIER_LABELS, resolveCommCarrierFromEntityId, type CommCarrier } from '@/domain/energy/model/utils/comm-carrier.util'
import { getEnergyHistory } from '@/domain/api/energy'
import { type EnergyCategory } from '@/domain/energy/model/constants/energy-fields'
import { type ECharts } from 'echarts'
import { type HaEntityState } from '@/kernel/types/entity'

/**
 * @file useClientPowerReporter.ts
 * @module frontend/src/composables
 */

/**
 * 客户端电量与系统信息实时上报 composable
 * - 在用户认证后启动客户端系统信息（电量、CPU、内存等）的周期性上报；
 * - 监听电池变化与页面可见性，动态调整上报间隔；
 * - 处理 401 鉴权失败时刷新会话并重试；
 * - 多次失败后停止上报并警告。
 */

/** 默认上报间隔（秒）：未拉取到后端配置时的回退值 */
const FALLBACK_INTERVAL_SEC = 10
/** 电池事件防抖时间（毫秒）：避免短时间内多次上报 */
const BATTERY_DEBOUNCE_MS = 400
/** 电池变化立即上报的阈值（百分比）：超过此变化量时跳过防抖立即上报 */
const BATTERY_IMMEDIATE_DELTA = 0.5
/** 页面隐藏时的上报间隔倍数：隐藏时降低上报频率 */
const HIDDEN_INTERVAL_MULT = 2
/** 完整静态信息刷新间隔（毫秒）：5 分钟刷新一次设备静态信息 */
const FULL_PROFILE_REFRESH_MS = 5 * 60 * 1000
/** 静默请求配置：401 时不触发全局认证跳转，由本 composable 自行处理 */
const SILENT_REQUEST: ApiRequestConfig = { skipAuthRedirect: true }

/** 是否已启动上报（避免重复启动） */
let started = false
/** 周期上报任务的取消函数（经全局调度器驱动） */
let intervalCancel: (() => void) | null = null
/** 电池事件防抖定时器 ID */
let batteryDebounceId: ReturnType<typeof setTimeout> | null = null
/** 完整静态信息刷新任务的取消函数（经全局调度器驱动） */
let fullProfileCancel: (() => void) | null = null
/** 页面是否隐藏（影响上报间隔） */
let hidden = false
/** 当前上报间隔（秒） */
let intervalSec = FALLBACK_INTERVAL_SEC
/** 上一次上报的电池百分比（用于判断变化量） */
let lastReportedLevelPct: number | null = null
/** 是否正在上报中（避免并发上报） */
let reporting = false
/** 连续上报失败次数 */
let reportFailStreak = 0
/** 是否已警告过多次失败（避免日志刷屏） */
let reportFailWarned = false

/**
 * 计算电池百分比。
 * readBatterySnapshot 已在采集时把 Battery API 的 0–1 比例换算为 0–100 百分比，
 * 此处仅做一位小数舍入。
 * @param battery 电池快照对象
 * @returns 0~100 的百分比；无数据时返回 null
 */
function batteryLevelPercent(battery: { level?: number | null } | null) {
  if (!battery || battery.level == null) return null
  return Math.round(battery.level * 10) / 10
}

/**
 * 拉取后端配置中的上报间隔。
 * 后端可通过 clientPower.reportIntervalSec 覆盖默认间隔（最小 5 秒）。
 * @returns 上报间隔（秒）；失败时回退到 FALLBACK_INTERVAL_SEC
 */
async function loadReportIntervalSec() {
  try {
    const { data } = await fetchSystemConfig(SILENT_REQUEST)
    const sec = Number(data?.clientPower?.reportIntervalSec)
    if (Number.isFinite(sec) && sec >= 5) return sec
  } catch {
    // 使用本地回退
  }
  return FALLBACK_INTERVAL_SEC
}
/**
 * 执行一次客户端系统上报。
 *
 * 流程：
 *  1. 通过 buildClientSystemReport 构建 payload（可选刷新静态信息）；
 *  2. 调用 reportClientPower 上报；
 *  3. 记录电池百分比；重置失败计数。
 *
 * 错误处理：
 *  - 401 时尝试 refreshSession 并重试一次；
 *  - refreshSession 失败则停止上报并警告（提示用户使用相同 URL 协议重新登录）；
 *  - 其他错误累计失败计数，达到 3 次时警告一次。
 *
 * @param opts.refreshStatic 是否刷新静态信息（CPU/内存等）
 * @param opts.retryAuth      401 时是否尝试刷新会话重试
 */
async function postReport({
  refreshStatic = false,
  retryAuth = true,
}: {
  refreshStatic?: boolean
  retryAuth?: boolean
} = {}) {
  if (reporting) return
  reporting = true
  try {
    const payload = await buildClientSystemReport({ refreshStatic })
    await reportClientPower(payload, SILENT_REQUEST)
    const pct = batteryLevelPercent(payload?.systemInfo?.battery)
    if (pct != null) lastReportedLevelPct = pct
    reportFailStreak = 0
    reportFailWarned = false
  } catch (err) {
    if (isLicenseInactiveError(err)) {
      stopReporter()
      logger.debug('商业授权未激活,已停止客户端系统上报')
      return
    }
    if (retryAuth && axios.isAxiosError(err) && err.response?.status === 401) {
      // refreshSession 已经不再用抛异常表达失败（401 时它内部登出并返回 false），
      // 这里必须看返回值，否则会话已失效还会再打一轮注定 401 的上报。
      const refreshed = await useAuthStore().refreshSession()
      if (!refreshed) {
        stopReporter()
        logger.warn('客户端系统上报未授权,已停止上报;请使用相同 URL 协议重新登录(建议使用 https://:8803).', err)
        return
      }
      reporting = false
      await postReport({ refreshStatic, retryAuth: false })
      return
    }

    reportFailStreak += 1
    if (reportFailStreak >= 3 && !reportFailWarned) {
      reportFailWarned = true
      logger.warn('客户端系统上报多次失败', err)
    } else {
      logger.debug('客户端系统上报失败', err)
    }
  } finally {
    reporting = false
  }
}

/** 清理周期上报任务 */
function clearTimer() {
  if (intervalCancel != null) {
    intervalCancel()
    intervalCancel = null
  }
}

/** 清理静态信息刷新任务 */
function clearFullProfileTimer() {
  if (fullProfileCancel != null) {
    fullProfileCancel()
    fullProfileCancel = null
  }
}

/**
 * 调度周期上报任务。
 *  - 间隔最小 5 秒；
 *  - 页面隐藏时按 HIDDEN_INTERVAL_MULT 倍数延长间隔；
 *  - 每次触发调用 postReport。
 * @param sec 基础间隔（秒）
 */
function scheduleInterval(sec: number) {
  clearTimer()
  const ms = Math.max(5, sec) * 1000 * (hidden ? HIDDEN_INTERVAL_MULT : 1)
  // 客户端电源上报属后台常驻服务，页面隐藏时仍需按周期上报（visibilityAware:false）
  intervalCancel = schedulePoll(
    'client-power:report',
    () => {
      void postReport()
    },
    ms,
    { visibilityAware: false },
  )
}

/**
 * 页面可见性变化回调。
 *  - 更新 hidden 标志；
 *  - 重新调度间隔；
 *  - 从隐藏恢复到可见时立即触发一次上报（含静态信息刷新）。
 */
function onVisibilityChange() {
  const wasHidden = hidden
  hidden = typeof document !== 'undefined' && document.hidden
  scheduleInterval(intervalSec)
  if (wasHidden && !hidden) {
    void postReport({ refreshStatic: true })
  }
}

/**
 * 电池事件回调。
 *  - 计算电池百分比变化量；
 *  - 变化 >= BATTERY_IMMEDIATE_DELTA 时立即上报（跳过防抖）；
 *  - 否则按 BATTERY_DEBOUNCE_MS 防抖后上报。
 */
function onBatteryEvent() {
  const battery = readBatterySnapshotSync()
  const pct = batteryLevelPercent(battery)
  const delta =
    pct != null && lastReportedLevelPct != null ? Math.abs(pct - lastReportedLevelPct) : BATTERY_IMMEDIATE_DELTA
  if (batteryDebounceId != null) {
    clearTimeout(batteryDebounceId)
    batteryDebounceId = null
  }
  if (delta >= BATTERY_IMMEDIATE_DELTA) {
    void postReport()
    return
  }
  batteryDebounceId = setTimeout(() => {
    batteryDebounceId = null
    void postReport()
  }, BATTERY_DEBOUNCE_MS)
}
/**
 * 启动客户端系统上报。
 *  1. 拉取后端配置的上报间隔；
 *  2. 初始化 BatteryManager；
 *  3. 立即触发一次完整上报（含静态信息）；
 *  4. 调度周期上报与静态信息刷新；
 *  5. 监听页面可见性变化。
 * 已启动时直接返回（幂等）。
 */
async function startReporter() {
  if (started || typeof window === 'undefined') return
  started = true
  intervalSec = await loadReportIntervalSec()
  await ensureBatteryManager()
  void postReport({ refreshStatic: true })
  scheduleInterval(intervalSec)
  clearFullProfileTimer()
  // 完整静态信息（CPU/内存等）刷新周期 5 分钟，同样后台常驻（visibilityAware:false）
  fullProfileCancel = schedulePoll(
    'client-power:full-profile',
    () => {
      void postReport({ refreshStatic: true })
    },
    FULL_PROFILE_REFRESH_MS,
    { visibilityAware: false },
  )
  document.addEventListener('visibilitychange', onVisibilityChange)
}

/**
 * 停止客户端系统上报。
 *  - 清理所有定时器；
 *  - 重置电池百分比与失败计数；
 *  - 移除可见性监听。
 */
function stopReporter() {
  if (!started) return
  started = false
  clearTimer()
  clearFullProfileTimer()
  if (batteryDebounceId != null) {
    clearTimeout(batteryDebounceId)
    batteryDebounceId = null
  }
  lastReportedLevelPct = null
  reportFailStreak = 0
  reportFailWarned = false
  document.removeEventListener('visibilitychange', onVisibilityChange)
}

/**
 * 认证后启动客户端电量实时监测与上报 composable。
 *
 * 监听认证状态：
 *  - 已认证且非访客 → 启动上报；
 *  - 否则 → 停止上报。
 *
 * 在组件挂载时绑定电池事件监听，卸载时解绑并停止上报。
 */
export function useClientPowerReporter() {
  const authStore = useAuthStore()
  const route = useRoute()
  let offBattery: (() => void) | null = null

  onMounted(() => {
    offBattery = onBatteryChange(onBatteryEvent)
  })

  onUnmounted(() => {
    offBattery?.()
    stopReporter()
  })

  /**
   * 商业授权是否已放行。
   *
   * 授权未激活时，后端门禁会把 `/system/config` 与 `/system/client-power/report` 一律打成
   * 401 ``LICENSE_INACTIVE``；只靠 `postReport` 遇 401 自停挡不住页面刷新/HMR 重载的反复
   * 重试，会刷满控制台与后端访问日志，故在此前置拦截：未放行就不启动，
   * 待激活完成（`licenseActivated` 置真）由 watch 自动开跑。
   * ``null``（多为后端不可达）同样按未放行处理。
   */
  const licenseAllowed = computed(() => getLicenseActivated() === true)

  watch(
    () => authStore.isAuthenticated && licenseAllowed.value && route.name !== 'activation' && route.name !== 'login',
    (shouldReport) => {
      if (shouldReport) {
        void startReporter()
      } else {
        stopReporter()
      }
    },
    { immediate: true },
  )
}

/**
 * @file useCommInfoPopup.ts
 * @module frontend/src/composables
 */

function parseNumber(inputValue: unknown) {
  const parsedValue = parseFloat(String(inputValue ?? ''))
  return Number.isNaN(parsedValue) ? null : parsedValue
}

function fmtPct(raw: unknown) {
  if (raw == null || raw === '') return '--'
  const parsedValue = parseNumber(String(raw).replace('%', ''))
  return parsedValue != null ? parsedValue.toFixed(0) : '--'
}

function pctVal(raw: unknown) {
  const parsedValue = parseNumber(String(raw ?? '').replace('%', ''))
  if (parsedValue == null) return 0
  return Math.min(100, Math.max(0, parsedValue))
}

function ringSizeTier(textValue: string | number | null | undefined) {
  const len = String(textValue ?? '--').length
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

function hasVal(value: string) {
  return value !== '--' && value !== ''
}

/**
 * 通信账户详情弹窗 composable。
 * 字段对齐 china_comm CT/CU 综合余额 attributes + 单项实体后缀。
 */
export function useCommInfoPopup(props: { entityId?: string }) {
  const entitiesStore = useEntitiesStore()
  const layout = useLayoutStore()
  const activeEntityId = ref(props.entityId || '')
  watch(
    () => props.entityId,
    (entityId) => {
      activeEntityId.value = entityId || activeEntityId.value
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

  const sourceCfg = computed(() => normalizeEnergySource(layout.layoutConfig.statsSensors, commCat.value))

  function accountLabel(eid: string) {
    const fromConfig = resolveAccountLabelForEntityId(commCat.value, eid, sourceCfg.value)
    if (fromConfig) return fromConfig
    return getEntityDisplayName(eid, entitiesStore.entities[eid])
  }

  const fields = computed(() => {
    const cat = commCat.value
    const stats = layout.layoutConfig.statsSensors
    const entities = entitiesStore.entities
    const eid = activeEntityId.value
    const cfg = sourceCfg.value
    const out = {} as Record<FieldKey, unknown>
    for (const key of FIELD_KEYS) {
      out[key] = readPopupField(cat, key, stats, entities, eid, cfg)
    }
    return out
  })

  const ent = computed(() => entitiesStore.entities[activeEntityId.value] || null)

  const balance = computed(() => {
    const parsedValue = parseNumber(fields.value.balance) ?? parseNumber(ent.value?.state)
    return parsedValue != null ? parsedValue.toFixed(2) : '--'
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
    () => hasVal(smsRemaining.value) || hasVal(smsUsed.value) || hasVal(smsTotal.value) || hasVal(smsUsageRate.value),
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
    if (hasVal(dataCommonRemaining.value) || hasVal(dataCommonUsed.value) || hasVal(dataCommonTotal.value)) {
      rows.push({
        id: 'common',
        label: '通用流量',
        remaining: dataCommonRemaining.value,
        used: dataCommonUsed.value,
        total: dataCommonTotal.value,
        over: hasVal(dataCommonOver.value) ? dataCommonOver.value : undefined,
      })
    }
    if (hasVal(dataSpecialRemaining.value) || hasVal(dataSpecialUsed.value) || hasVal(dataSpecialTotal.value)) {
      rows.push({
        id: 'special',
        label: '专用流量',
        remaining: dataSpecialRemaining.value,
        used: dataSpecialUsed.value,
        total: dataSpecialTotal.value,
      })
    }
    if (hasVal(dataOtherRemaining.value) || hasVal(dataOtherUsed.value) || hasVal(dataOtherTotal.value)) {
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

/**
 * 服务端能耗聚合（日/月表）→ 弹窗列表的数据源。
 *
 * 为什么需要：能耗弹窗原本只读 HA 属性里的 `daylist` / `monthlist`。一旦集成只暴露
 * 余额实体、或属性列表只有几天，弹窗就是空白 —— 而服务端日/月聚合表里其实有完整数据
 * （含国网 30 天日列表、回填补的历史）。这里按 `M`（30 天）/ `Y`（12 个月）各拉一次，
 * 转成与属性列表相同的条目形状，交给原有解析器复用，避免两套渲染逻辑。
 *
 * 口径取舍：
 * - 服务端只有「用量」，没有分时电价与费用；调用方会把同日属性条目的费用字段合并进来，
 *   所以这里只负责用量与日期。
 * - 服务端不可用（未登录 / 未授权 / 表还没数据）时保持空数组，弹窗继续用 HA 属性，
 *   不抛错、不阻塞弹窗打开。
 */

/** 与属性列表同形状的原始条目（交给 parseDayItem / parseMonthItem 解析）。 */
export type ServerListItems = Record<string, unknown>[]

export interface ServerEnergyLists {
  dayItems: Ref<ServerListItems>
  monthItems: Ref<ServerListItems>
  /** 近 30 天费用（元）：服务端按 pricing 分区算出；无电价/非电时为 null */
  cost: Ref<number | null>
  /** 费用的数据来源是估算（峰谷模式按段时长占比拆分，日粒度无法精算） */
  costEstimated: Ref<boolean>
  /** 用能单位（电 kWh / 燃气、水 m³） */
  unit: Ref<string>
  reload: () => Promise<void>
}

/**
 * 拉取服务端日/月聚合，产出弹窗可直接消费的条目数组。
 *
 * @param enabled 电 / 燃气 / 水务账户都启用。报表按 ``unit`` 分组，因此不同单位不会串味。
 * @param unit 该能源卡要的单位（``kWh`` 电 / ``m³`` 气与水）。**必须传**：聚合表里
 *   电与气的行并存，不声明就等于求混合和 —— 电力卡会凭空多出燃气的数字。
 */
export function useServerEnergyHistory(enabled: Ref<boolean>, unit: Ref<string>): ServerEnergyLists {
  const dayItems = ref<ServerListItems>([])
  const monthItems = ref<ServerListItems>([])
  const cost = ref<number | null>(null)
  const costEstimated = ref(false)
  const unitLabel = ref('kWh')
  let loading = false
  let disposed = false

  async function reload() {
    if (!enabled.value || loading || disposed) return
    loading = true
    try {
      const requestedUnit = unit.value
      const [monthlyResponse, yearlyResponse] = await Promise.all([
        getEnergyHistory('M', undefined, requestedUnit),
        getEnergyHistory('Y', undefined, requestedUnit),
      ])
      if (disposed) return
      const monthly = monthlyResponse.data
      const yearly = yearlyResponse.data
      // `empty` 表示服务端这张表还没有该家庭的数据：保持空数组，让弹窗回退到属性列表。
      //
      // 字段名必须用**中性**的 `usage`，不能沿用电力专有的 `dayEleNum` / `monthEleNum`：
      // 燃气与水的解析器只认 `usage` / `cycleTotalVolume`，拿电名字写进去等于让燃气卡
      // 把每一天都解析成 0（日历重新变回整片 `--`）。合并属性条目时另一个后果更隐蔽 ——
      // 属性里那份 `usage` 会盖住同一条目的服务端数值，日期来自服务端、用量来自上个月。
      dayItems.value =
        monthly.source === 'empty' ? [] : monthly.series.map((point) => ({ day: point.date, usage: point.value }))
      monthItems.value =
        yearly.source === 'empty' ? [] : yearly.series.map((point) => ({ month: point.date, usage: point.value }))
      // 费用与单位只在服务端有数据时采用：空表时保持 null，弹窗回退到属性里的单价。
      cost.value = monthly.cost ?? null
      costEstimated.value = monthly.costEstimated === true
      unitLabel.value = monthly.unit || requestedUnit
    } catch {
      // 服务端不可用属正常降级路径：清空，弹窗继续读 HA 属性。
      dayItems.value = []
      monthItems.value = []
      cost.value = null
      costEstimated.value = false
    } finally {
      loading = false
    }
  }

  onMounted(() => {
    void reload()
  })
  onBeforeUnmount(() => {
    disposed = true
  })

  return { dayItems, monthItems, cost, costEstimated, unit: unitLabel, reload }
}

/**
 * @file useUtilityMeterPopup.ts
 * @module frontend/src/composables
 */

/** 有服务端日/月聚合的账户类型（后端按实体推导单位，电 kWh / 燃气、水 m³）。 */
const SERVER_AGGREGATE_SOURCES = new Set(['grid', 'gas', 'water'])

/**
 * 能源卡类别 → 聚合表里该读哪个单位。
 *
 * 必须显式声明：`energy_usage_daily` / `energy_usage_monthly` 里电与气的行并存，
 * 不按单位过滤就等于把立方米直接加到度电上 —— 电力卡凭空气涨、燃气卡拿到混合和。
 * 用查表而不是三元，是因为这里的读取动作本身不该引入分支（复杂度门禁只许变简单）。
 */
const SERVER_UNITS: Record<string, string> = { grid: 'kWh', gas: 'm³', water: 'm³' }

interface UtilityMeterPopupProps {
  entityId?: string
  anchor?: unknown
  [key: string]: unknown
}

interface UtilityMeterPopupOpts {
  props: UtilityMeterPopupProps
  sourceKey: EnergyCategory | string
  accentColor: { color1: string; color2: string }
  unitLabelKey: string
  calClassPrefix: string
  parseDayItem: (x: Record<string, unknown>) => UtilityMeterParsedItem
  parseMonthItem: (x: Record<string, unknown>) => UtilityMeterParsedItem
  parseYearItem: (x: Record<string, unknown>) => UtilityMeterParsedItem
}

/**
 * 水 / 气 / 电用量弹窗共用的图表、日历与统计逻辑。
 */
export function useUtilityMeterPopup(opts: UtilityMeterPopupOpts) {
  const { props, sourceKey, accentColor, unitLabelKey, calClassPrefix, parseDayItem, parseMonthItem, parseYearItem } =
    opts
  const es = useEntitiesStore()
  const layout = useLayoutStore()
  const { color1, color2 } = accentColor

  const account = createUtilityMeterAccountState({ props, sourceKey, es, layout })
  // 只有电费账户有服务端日/月聚合表；水/气继续走 HA 属性，避免把 kWh 表套到 m³ 上。
  // 电 / 燃气 / 水务都走服务端聚合：后端已按单位隔离（kWh vs m³），
  // 只给电开会让燃气与水永远只有「当前读数」、没有趋势。
  //
  // 单位必须**按卡片类别显式传**：聚合表里电与气的行并存，不声明就等于求混合和。
  const serverUnit = computed(() => SERVER_UNITS[sourceKey])
  const serverHistory = useServerEnergyHistory(
    computed(() => SERVER_AGGREGATE_SOURCES.has(sourceKey)),
    serverUnit,
  )
  const lists = createUtilityMeterLists({
    popField: account.popField,
    popNum: account.popNum,
    ent: account.ent,
    parseDayItem,
    parseMonthItem,
    parseYearItem,
    server: {
      day: serverHistory.dayItems,
      month: serverHistory.monthItems,
      // 多账户时服务端只有「全家合计」，按户号展示会串数，交给属性列表。
      wins: computed(() => account.accountOptions.value.length <= 1),
    },
  })
  const calendar = createUtilityMeterCalendar({
    daylist: lists.daylist,
    calClassPrefix,
    unitLabelKey,
  })
  const charts = createUtilityMeterCharts({
    color1,
    color2,
    unitLabel: calendar.unitLabel,
    daylist: lists.daylist,
    monthlist: lists.monthlist,
    yearlist: lists.yearlist,
    exp: lists.exp,
    expTab: lists.expTab,
    entityIdProp: () => props.entityId,
  })

  return {
    activeEntityId: account.activeEntityId,
    accountOptions: account.accountOptions,
    accountLabel: account.accountLabel,
    popField: account.popField,
    popNum: account.popNum,
    ent: account.ent,
    hasChartData: account.hasChartData,
    daylist: lists.daylist,
    monthlist: lists.monthlist,
    yearlist: lists.yearlist,
    exp: lists.exp,
    expTab: lists.expTab,
    curList: lists.curList,
    sumUsage: lists.sumUsage,
    sumCost: lists.sumCost,
    summaryLabel: lists.summaryLabel,
    mTrendStr: lists.mTrendStr,
    mTrendDir: lists.mTrendDir,
    lmTrendStr: lists.lmTrendStr,
    lmTrendDir: lists.lmTrendDir,
    setDayChartRef: charts.setDayChartRef,
    setMonthChartRef: charts.setMonthChartRef,
    setYearChartRef: charts.setYearChartRef,
    calYear: calendar.calYear,
    calMonth: calendar.calMonth,
    curYearNum: calendar.curYearNum,
    curMonthNum: calendar.curMonthNum,
    calDayNames: calendar.calDayNames,
    calCells: calendar.calCells,
    calMonthUsage: calendar.calMonthUsage,
    calMonthCost: calendar.calMonthCost,
    updateCalendar: calendar.updateCalendar,
    openTab: charts.openTab,
    switchTab: charts.switchTab,
    closeExpand: charts.closeExpand,
    openDayTab: charts.openDayTab,
    onCalPrev: calendar.onCalPrev,
    onCalNext: calendar.onCalNext,
    onCalToday: calendar.onCalToday,
    readPopupAttr,
    parseJsonAttr,
    parseNumAttr,
    sourceCfg: account.sourceCfg,
  }
}

/**
 * @file utility-meter-popup.calendar.internals.ts
 * @module frontend/src/composables/energy
 */

export function createUtilityMeterCalendar(opts: {
  daylist: ComputedRef<UtilityMeterParsedItem[]>
  calClassPrefix: string
  unitLabelKey: string
}) {
  const { daylist, calClassPrefix, unitLabelKey } = opts
  const calYear = ref(new Date().getFullYear())
  const calMonth = ref(new Date().getMonth() + 1)
  const curYearNum = new Date().getFullYear()
  const curMonthNum = new Date().getMonth() + 1
  const calDayNames = computed(() => ['一', '二', '三', '四', '五', '六', '日'])
  const UNIT_LABELS: Record<string, string> = {
    kwh: 'kWh',
    ton: '吨',
    cubicMeter: 'm³',
  }
  const unitLabel = computed(() => UNIT_LABELS[unitLabelKey] || unitLabelKey)

  const calCells = computed(() => {
    const y = calYear.value
    const m = calMonth.value
    const first = new Date(y, m - 1, 1)
    const last = new Date(y, m, 0)
    const startDow = first.getDay() === 0 ? 6 : first.getDay() - 1
    const cells: Array<{
      day: number | ''
      cls: string
      _usage?: string
      _cost?: string
      _data?: UtilityMeterParsedItem
    }> = []
    const dateMap: Record<string, { _usage: string; _cost: string; _data: UtilityMeterParsedItem }> = {}
    daylist.value.forEach((d) => {
      const parts = parseDateParts(d._label || '')
      if (parts && parts.month === m && (parts.year === undefined || parts.year === calYear.value)) {
        dateMap[parts.day] = { _usage: d._usageStr, _cost: d._costStr, _data: d }
      }
    })
    for (let i = 0; i < startDow; i++) cells.push({ day: '', cls: `${calClassPrefix}-cal-cell--empty` })
    const today = new Date()
    for (let d = 1; d <= last.getDate(); d++) {
      const data = dateMap[d]
      let cls = ''
      const thisDate = new Date(y, m - 1, d)
      if (today.toDateString() === thisDate.toDateString()) cls += ` ${calClassPrefix}-cal-cell--today`
      if (data) cls += ` ${calClassPrefix}-cal-cell--has`
      if (thisDate > today) cls += ` ${calClassPrefix}-cal-cell--future`
      cells.push({ day: d, cls, _usage: data?._usage, _cost: data?._cost, _data: data?._data })
    }
    return cells
  })

  const calMonthUsage = computed(() => {
    let s = 0
    calCells.value.forEach((c) => {
      if (c._data) s += c._data._usage || 0
    })
    return s.toFixed(1)
  })
  const calMonthCost = computed(() => {
    let s = 0
    calCells.value.forEach((c) => {
      if (c._data) s += c._data._cost || 0
    })
    return s.toFixed(2)
  })

  function updateCalendar() {
    if (calMonth.value < 1) {
      calMonth.value = 12
      calYear.value--
    }
    if (calMonth.value > 12) {
      calMonth.value = 1
      calYear.value++
    }
  }

  return {
    calYear,
    calMonth,
    curYearNum,
    curMonthNum,
    calDayNames,
    unitLabel,
    calCells,
    calMonthUsage,
    calMonthCost,
    updateCalendar,
    onCalPrev() {
      calMonth.value--
      updateCalendar()
    },
    onCalNext() {
      calMonth.value++
      updateCalendar()
    },
    onCalToday() {
      calYear.value = curYearNum
      calMonth.value = curMonthNum
      updateCalendar()
    },
  }
}

/**
 * @file utility-meter-popup.charts.internals.ts
 * @module frontend/src/composables/energy
 */

type ChartEl = HTMLElement & { _chart?: ECharts | null }

export function createUtilityMeterCharts(opts: {
  color1: string
  color2: string
  unitLabel: ComputedRef<string>
  daylist: ComputedRef<UtilityMeterParsedItem[]>
  monthlist: ComputedRef<UtilityMeterParsedItem[]>
  yearlist: ComputedRef<UtilityMeterParsedItem[]>
  exp: Ref<boolean>
  expTab: Ref<string>
  entityIdProp: () => unknown
}) {
  const { color1, color2, unitLabel, daylist, monthlist, yearlist, exp, expTab, entityIdProp } = opts
  const dayChartRef = ref<ChartEl | null>(null)
  const monthChartRef = ref<ChartEl | null>(null)
  const yearChartRef = ref<ChartEl | null>(null)

  async function renderChart(el: ChartEl | null, data: UtilityMeterParsedItem[], unit: string, type: string) {
    if (typeof document !== 'undefined' && document.hidden) return
    if (!el || !data.length) return
    if (el.clientWidth === 0 || el.clientHeight === 0) return
    const echarts = (await import('@/kernel/utils/chart')).default
    if (el._chart) el._chart.dispose()
    const chart = echarts.init(el)
    el._chart = chart
    const labels = data.map((d) => d._label || '')
    const usages = data.map((d) => d._usage || 0)
    const costs = data.map((d) => d._cost || 0)
    const rotate = (type === 'day' && labels.length > 15) || (type === 'month' && labels.length > 12) ? 45 : 0
    chart.setOption(buildChartOption({ labels, usages, costs, unit, type, rotate, color1, color2 }))
  }

  function renderCharts() {
    if (typeof document !== 'undefined' && document.hidden) return
    if (!exp.value) return
    nextTick(() => {
      const unit = unitLabel.value
      if (expTab.value === 'day') void renderChart(dayChartRef.value, daylist.value, unit, 'day')
      else if (expTab.value === 'month') void renderChart(monthChartRef.value, monthlist.value, unit, 'month')
      else if (expTab.value === 'year') {
        void renderChart(yearChartRef.value, yearlist.value, unit, 'year')
      }
    })
  }

  function disposeCharts() {
    ;[dayChartRef, monthChartRef, yearChartRef].forEach((refEl) => {
      if (refEl.value?._chart) {
        refEl.value._chart.dispose()
        refEl.value._chart = null
      }
    })
  }

  const observer = createChartVisibilityObserver({
    dayChartRef,
    monthChartRef,
    yearChartRef,
    daylist,
    monthlist,
    yearlist,
    exp,
    unitLabel,
    renderChart,
  })

  function onPageVisibilityChange() {
    if (typeof document === 'undefined') return
    if (document.hidden) {
      disposeCharts()
    } else if (exp.value) {
      renderCharts()
    }
  }

  function setDayChartRef(el: ChartEl | null) {
    if (dayChartRef.value && dayChartRef.value !== el) observer.unobserveChartEl(dayChartRef.value)
    dayChartRef.value = el
    if (el) observer.observeChartEl(el)
  }
  function setMonthChartRef(el: ChartEl | null) {
    if (monthChartRef.value && monthChartRef.value !== el) observer.unobserveChartEl(monthChartRef.value)
    monthChartRef.value = el
    if (el) observer.observeChartEl(el)
  }
  function setYearChartRef(el: ChartEl | null) {
    if (yearChartRef.value && yearChartRef.value !== el) observer.unobserveChartEl(yearChartRef.value)
    yearChartRef.value = el
    if (el) observer.observeChartEl(el)
  }

  function openTab(tab: string) {
    expTab.value = tab
    exp.value = true
    nextTick(() => renderCharts())
  }
  function switchTab(tab: string) {
    expTab.value = tab
    nextTick(() => renderCharts())
  }
  function closeExpand() {
    exp.value = false
    ;[dayChartRef, monthChartRef, yearChartRef].forEach((refEl) => {
      if (refEl.value) observer.unobserveChartEl(refEl.value)
    })
    disposeCharts()
  }
  function openDayTab(cell: { _data?: UtilityMeterParsedItem }) {
    if (cell._data) {
      expTab.value = 'day'
      nextTick(() => renderCharts())
    }
  }

  watch(
    () => entityIdProp(),
    () => {
      exp.value = false
      disposeCharts()
    },
  )
  onMounted(() => {
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onPageVisibilityChange)
    }
  })
  onUnmounted(() => {
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', onPageVisibilityChange)
    }
    observer.disconnectChartObserver()
    disposeCharts()
  })

  return {
    setDayChartRef,
    setMonthChartRef,
    setYearChartRef,
    openTab,
    switchTab,
    closeExpand,
    openDayTab,
  }
}

function buildChartOption(args: {
  labels: string[]
  usages: number[]
  costs: number[]
  unit: string
  type: string
  rotate: number
  color1: string
  color2: string
}) {
  const { labels, usages, costs, unit, type, rotate, color1, color2 } = args
  return {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(20,20,30,0.95)',
      borderColor: 'rgba(255,255,255,0.1)',
      textStyle: { color: '#fff', fontSize: 11 },
      axisPointer: { type: 'shadow' },
    },
    grid: { left: 50, right: 50, top: 10, bottom: labels.length > 12 ? 40 : 30 },
    xAxis: {
      type: 'category',
      data: labels,
      axisLine: { lineStyle: { color: 'rgba(255,255,255,0.12)' } },
      axisLabel: { color: 'rgba(255,255,255,0.58)', fontSize: 9, rotate },
    },
    yAxis: [
      {
        type: 'value',
        name: unit,
        nameTextStyle: { color: 'rgba(255,255,255,0.58)', fontSize: 9 },
        axisLabel: { color: 'rgba(255,255,255,0.58)', fontSize: 9 },
        splitLine: { lineStyle: { color: 'rgba(255,255,255,0.05)' } },
      },
      {
        type: 'value',
        name: '元',
        nameTextStyle: { color: 'rgba(255,255,255,0.58)', fontSize: 9 },
        axisLabel: { color: 'rgba(255,255,255,0.58)', fontSize: 9 },
        splitLine: { show: false },
      },
    ],
    series: [
      {
        name: `用量(${unit})`,
        type: 'bar',
        data: usages,
        yAxisIndex: 0,
        itemStyle: { color: color1, borderRadius: [4, 4, 0, 0] },
        barMaxWidth: type === 'day' ? 10 : type === 'month' ? 14 : 20,
      },
      {
        name: '费用(元)',
        type: 'line',
        data: costs,
        yAxisIndex: 1,
        itemStyle: { color: color2 },
        lineStyle: { width: 2 },
        symbol: 'circle',
        symbolSize: 4,
      },
    ],
  }
}

function createChartVisibilityObserver(opts: {
  dayChartRef: Ref<ChartEl | null>
  monthChartRef: Ref<ChartEl | null>
  yearChartRef: Ref<ChartEl | null>
  daylist: ComputedRef<UtilityMeterParsedItem[]>
  monthlist: ComputedRef<UtilityMeterParsedItem[]>
  yearlist: ComputedRef<UtilityMeterParsedItem[]>
  exp: Ref<boolean>
  unitLabel: ComputedRef<string>
  renderChart: (el: ChartEl | null, data: UtilityMeterParsedItem[], unit: string, type: string) => Promise<void>
}) {
  const { dayChartRef, monthChartRef, yearChartRef, daylist, monthlist, yearlist, exp, unitLabel, renderChart } = opts
  let chartVisibilityObserver: IntersectionObserver | null = null
  const observedChartEls = new WeakSet<Element>()

  function ensureChartVisibilityObserver() {
    if (chartVisibilityObserver || typeof IntersectionObserver === 'undefined') return
    chartVisibilityObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const el = entry.target as ChartEl
          if (!entry.isIntersecting || entry.intersectionRatio <= 0.02) {
            if (el._chart) {
              el._chart.dispose()
              el._chart = null
            }
            continue
          }
          if (el._chart || !exp.value) continue
          const unit = unitLabel.value
          if (el === dayChartRef.value) void renderChart(el, daylist.value, unit, 'day')
          else if (el === monthChartRef.value) void renderChart(el, monthlist.value, unit, 'month')
          else if (el === yearChartRef.value) void renderChart(el, yearlist.value, unit, 'year')
        }
      },
      { threshold: [0, 0.02, 0.1] },
    )
  }

  function observeChartEl(el: ChartEl | null) {
    if (!el || observedChartEls.has(el)) return
    ensureChartVisibilityObserver()
    chartVisibilityObserver?.observe(el)
    observedChartEls.add(el)
  }
  function unobserveChartEl(el: ChartEl | null) {
    if (!el || !chartVisibilityObserver) return
    chartVisibilityObserver.unobserve(el)
    if (el._chart) {
      el._chart.dispose()
      el._chart = null
    }
  }
  function disconnectChartObserver() {
    chartVisibilityObserver?.disconnect()
    chartVisibilityObserver = null
  }
  return { observeChartEl, unobserveChartEl, disconnectChartObserver }
}

/**
 * @file utility-meter-popup.lists.internals.ts
 * @module frontend/src/composables/energy
 */

type EntitiesStore = ReturnType<typeof useEntitiesStore>
type LayoutStore = ReturnType<typeof useLayoutStore>

function markMinMax(arr: UtilityMeterParsedItem[]) {
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
  const sourceCfg = computed(() => normalizeEnergySource(layout.layoutConfig.statsSensors, sourceKey))
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

/**
 * 取一条明细行的日期键，用于把属性条目与服务端条目对齐。
 *
 * `readingTime` 不能漏：燃气 / 水表的日明细用这个字段名（电表用 `day`）。漏掉它时
 * 合并永远匹配不上，服务端条目拿不到属性里的 `amount`，日历费用列就只剩 `--`。
 */
function rowDateKey(row: Record<string, unknown>): string {
  return String(row.day ?? row.month ?? row.date ?? row.readingTime ?? '')
}

/**
 * 服务端列表与属性列表二选一，并把属性条目的额外字段（费用、日期说明）合并回来。
 *
 * 规则：
 * - 服务端为空：用属性列表（服务端未启用 / 表还没数据）；
 * - 多账户（`serverWins=false`）且属性有数据：用属性 —— 服务端聚合表只有「全家合计」，
 *   套到每个户号上会把别家的用量算进来；
 * - 其余情况**一律用服务端**。
 *
 * 这里刻意**不**比较两者长度。曾经的条件是「服务端比属性短就让属性胜出」，理由是
 * 「属性更全」，但实测反例很常见：SGCC 集成的 `daylist` 属性是**上一个自然月**的整月表
 * （31 条），而服务端是**近 30 天**窗口 —— 属性多 1 条就抢走数据源，于是用户翻到本月
 * 发现日历全是 `--`，而列表里显示的是上个月的日期。日聚合表是实时写的（每轮 HA 同步
 * 都会更新），拿它当权威比「谁条目多」合理得多。
 *
 * 合并时条目本身（用量/日期）以服务端为准，属性只补服务端没有的字段（如 `dayEleCost`），
 * 这样费用列不会因为切换数据源而变成 `--`。
 */
export function preferServerList(attrRaw: unknown, serverRaw: unknown, serverWins: boolean): unknown {
  const attrList = Array.isArray(attrRaw) ? attrRaw : []
  const serverList = Array.isArray(serverRaw) ? serverRaw : []
  if (!serverList.length) return attrList.length ? attrList : attrRaw
  if (!serverWins && attrList.length) return attrList
  const attrByLabel = new Map<string, Record<string, unknown>>()
  for (const item of attrList) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    const label = rowDateKey(row)
    if (label) attrByLabel.set(label, row)
  }
  return serverList.map((item) => {
    if (!item || typeof item !== 'object') return item
    const row = item as Record<string, unknown>
    const rich = attrByLabel.get(rowDateKey(row))
    return rich ? { ...rich, ...row } : row
  })
}

export function createUtilityMeterLists(opts: {
  popField: (key: string) => unknown
  popNum: (key: string) => number | null
  ent: ComputedRef<HaEntityState | null | undefined>
  parseDayItem: (x: Record<string, unknown>) => UtilityMeterParsedItem
  parseMonthItem: (x: Record<string, unknown>) => UtilityMeterParsedItem
  parseYearItem: (x: Record<string, unknown>) => UtilityMeterParsedItem
  /** 服务端聚合列表（仅电费账户提供）：单账户时优先，多账户时只做兜底 */
  server?: {
    day: Ref<Record<string, unknown>[]>
    month: Ref<Record<string, unknown>[]>
    wins: Ref<boolean>
  }
}) {
  const { popField, popNum, ent, parseDayItem, parseMonthItem, parseYearItem } = opts

  const serverWins = computed(() => opts.server?.wins.value ?? false)
  const rawDaylist = computed(() =>
    preferServerList(
      parseJsonAttr(popField('daylist')) ?? parseJsonAttr(readPopupAttr(ent.value, 'daylist')),
      opts.server?.day.value,
      serverWins.value,
    ),
  )
  const rawMonthlist = computed(() =>
    preferServerList(
      parseJsonAttr(popField('monthlist')) ?? parseJsonAttr(readPopupAttr(ent.value, 'monthlist')),
      opts.server?.month.value,
      serverWins.value,
    ),
  )
  const rawYearlist = computed(
    () => parseJsonAttr(popField('yearlist')) ?? parseJsonAttr(readPopupAttr(ent.value, 'yearlist')),
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
    expTab.value === 'day' ? daylist.value : expTab.value === 'month' ? monthlist.value : yearlist.value
  const curList = computed(() => listForTab().map((d) => ({ ...d, _usage: d._usageStr, _cost: d._costStr })))
  const sumUsage = computed(() =>
    listForTab()
      .reduce((s, x) => s + x._usage, 0)
      .toFixed(1),
  )
  const sumCost = computed(() =>
    listForTab()
      .reduce((s, x) => s + x._cost, 0)
      .toFixed(2),
  )
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
