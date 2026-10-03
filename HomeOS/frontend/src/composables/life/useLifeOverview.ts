/**
 * @file useLifeOverview.ts
 * @module frontend/src/composables
 */
import { getEntityLeaf } from '@homeos/shared'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { createSharedComposable } from '@vueuse/core'
import { useEnvironmentHealthPanel } from '@/composables/climate/useEnvironmentHealthPanel'
import { usePowerMeter } from '@/composables/energy/usePowerMeter'
import { fetchChildMode } from '@/services/api/system'
import { fetchAnomalyStatus, ackAnomalyEvents } from '@/services/api/security'
import {
  fetchDailyAdvisor,
  fetchDeviceLifespan,
  fetchAllReminders,
} from '@/services/api/advisor'
import { LIFE_TAB_META, type LifeTabId } from '@/composables/life/useLifeView'
import { useLifeIndices } from '@/composables/life/useLifeIndices'
import { useEntitiesStore } from '@/stores/entities.store'
import { invalidateSharedFetch, sharedFetch } from '@/utils/core/poll-scheduler'
import { formatAuditTimestamp } from '@/utils/format/locale-format.util'

type LifeRoomBoardItem = {
  roomId: string
  name: string
  configured: boolean
  risk: string
  riskLabel: string
  tone: 'ok' | 'warn' | 'bare'
  temp: string | null
  humidity: string | null
  pm25: string | null
}

type LifeAdvisorTip = { title: string; message: string; category: string }
type LifeReminderItem = { id: string; title: string; time: string; type?: string }
type LifeLifespanItem = { id: string; name: string; level: string; warn: boolean }
type LifePresenceItem = {
  room: string
  label: string
  durationMin: number
  occupied: boolean
  inactiveMin?: number
  area?: string
}
type LifeAlertItem = { id: string; label: string; time: string }
type LifeCareHouse = {
  anyoneHome: boolean | null
  wholeHouseInactiveMin: number | null
  lastWholeHouseActivity: string | null
}

function tipText(raw: unknown): LifeAdvisorTip | null {
  if (raw == null) return null
  if (typeof raw === 'string') {
    const t = raw.trim()
    return t ? { title: t, message: '', category: 'general' } : null
  }
  if (typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const title = String(o.title || o.name || o.summary || '').trim()
  const message = String(o.message || o.detail || o.description || o.text || '').trim()
  if (!title && !message) return null
  return {
    title: title || message,
    message: title && message && message !== title ? message : '',
    category: String(o.category || 'general'),
  }
}

function reminderItem(raw: unknown, index: number): LifeReminderItem | null {
  if (raw == null || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const title = String(o.title || o.name || o.label || o.message || '').trim()
  if (!title) return null
  const timeRaw = o.nextDate || o.time || o.nextAt || o.scheduledAt || o.when || o.cron || ''
  let time = '待定'
  if (timeRaw) {
    const s = String(timeRaw)
    const d = new Date(s)
    time = Number.isNaN(d.getTime()) ? s : formatAuditTimestamp(d) || s
  }
  return {
    id: String(o.id || `rem-${index}`),
    title,
    time,
    type: String(o.type || o.category || '').trim() || undefined,
  }
}

const CARE_AREA_LABELS: Record<string, string> = {
  bedroom: '卧室',
  bathroom: '卫生间',
  kitchen: '厨房',
  living: '客厅',
  living_room: '客厅',
  other: '其他区域',
}

function careStayLabel(s: Record<string, unknown>, index: number) {
  const area = String(s.area || '')
  const room = String(s.room || s.id || '')
  return (
    String(s.label || s.roomName || '').trim() ||
    CARE_AREA_LABELS[area] ||
    CARE_AREA_LABELS[room] ||
    room ||
    `房间 ${index + 1}`
  )
}

function lifespanItem(raw: unknown, index: number): LifeLifespanItem | null {
  if (raw == null || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const name = String(o.name || o.friendly_name || o.entity_id || o.id || '').trim()
  if (!name) return null
  const level = String(o.level || o.status || o.health || 'ok').toLowerCase()
  const warn =
    level.includes('warn') ||
    level.includes('alert') ||
    level.includes('replace') ||
    level.includes('critical')
  return {
    id: String(o.entity_id || o.id || `life-${index}`),
    name: name.includes('.') ? getEntityLeaf(name).replace(/_/g, ' ') : name,
    level: warn ? (level.includes('replace') ? '建议更换' : '需关注') : '正常',
    warn,
  }
}

function riskTone(configured: boolean, risk?: string): LifeRoomBoardItem['tone'] {
  if (!configured) return 'bare'
  if (risk && risk !== 'safe') return 'warn'
  return 'ok'
}

function riskLabel(configured: boolean, risk?: string) {
  if (!configured) return '未配置'
  if (!risk || risk === 'safe') return '正常'
  if (risk === 'warn' || risk === 'warning') return '关注'
  if (risk === 'danger' || risk === 'critical') return '告警'
  return String(risk)
}

function fmtNum(v: unknown, digits = 1): string | null {
  if (v == null || v === '') return null
  const n = Number(v)
  if (!Number.isFinite(n)) return null
  return digits === 0 ? String(Math.round(n)) : n.toFixed(digits)
}

function useLifeOverviewState() {
  const env = useEnvironmentHealthPanel({
    panelVisible: true,
    defaultTab: 'overview',
    pollKey: 'widget:environmentHealth:life',
  })
  const power = usePowerMeter()
  const lifeIndices = useLifeIndices()
  const entitiesStore = useEntitiesStore()
  const childEnabled = ref(false)
  const childLoaded = ref(false)
  const childInAllowedWindow = ref(false)
  const childWhitelistActive = ref(false)
  const mediaUsedMin = ref(0)
  const dailyMediaLimitMin = ref(0)

  const advisorTipCount = ref(0)
  const reminderCount = ref(0)
  const lifespanAlertCount = ref(0)
  const smartLoaded = ref(false)
  const advisorTips = ref<LifeAdvisorTip[]>([])
  const reminderItems = ref<LifeReminderItem[]>([])
  const lifespanItems = ref<LifeLifespanItem[]>([])

  const presenceRooms = ref<LifePresenceItem[]>([])
  /** 全量房间停留（含安静房间），供右栏热力/静默条使用 */
  const careRoomStays = ref<LifePresenceItem[]>([])
  const careHouse = ref<LifeCareHouse>({
    anyoneHome: null,
    wholeHouseInactiveMin: null,
    lastWholeHouseActivity: null,
  })
  const careAlerts = ref<LifeAlertItem[]>([])
  const carePresenceLoaded = ref(false)

  async function loadChildMode() {
    try {
      const { data } = await fetchChildMode()
      childEnabled.value = data?.enabled === true
      childInAllowedWindow.value = data?.inAllowedWindow === true
      childWhitelistActive.value = Array.isArray(data?.deviceWhitelist)
        ? data.deviceWhitelist.length > 0
        : false
      mediaUsedMin.value = Number(data?.mediaUsedMin ?? 0)
      dailyMediaLimitMin.value = Number(data?.dailyMediaLimitMin ?? 0)
    } catch {
      childEnabled.value = false
      childInAllowedWindow.value = false
    } finally {
      childLoaded.value = true
    }
  }

  async function reloadCarePresence() {
    try {
      const data =
        (await sharedFetch(
          'rest:GET:/security/anomaly/status',
          async () => {
            const res = await fetchAnomalyStatus()
            return res?.data ?? null
          },
          20_000,
        )) || {}
      const stays = Array.isArray(data.roomStays) ? data.roomStays : []
      const mapped: LifePresenceItem[] = stays
        .slice(0, 12)
        .map((s: Record<string, unknown>, i: number) => ({
          room: String(s.room || s.id || i),
          label: careStayLabel(s, i),
          durationMin: Number(s.durationMin) || 0,
          occupied: s.occupied === true,
          inactiveMin: Number(s.inactiveMin) || 0,
          area: String(s.area || ''),
        }))
      careRoomStays.value = mapped
      presenceRooms.value = mapped
        .filter((s) => s.occupied || s.durationMin > 0)
        .slice(0, 8)
      careHouse.value = {
        anyoneHome: typeof data.anyoneHome === 'boolean' ? data.anyoneHome : null,
        wholeHouseInactiveMin:
          data.wholeHouseInactiveMin != null && Number.isFinite(Number(data.wholeHouseInactiveMin))
            ? Number(data.wholeHouseInactiveMin)
            : null,
        lastWholeHouseActivity:
          data.lastWholeHouseActivity != null ? String(data.lastWholeHouseActivity) : null,
      }
      const alerts = Array.isArray(data.activeAlerts) ? data.activeAlerts : []
      careAlerts.value = alerts.slice(0, 8).map((a: Record<string, unknown>, i: number) => ({
        id: String(a.id || `alert-${i}`),
        label: String(a.message || a.label || a.type || '异常活动'),
        time: a.timestamp
          ? new Date(String(a.timestamp)).toLocaleTimeString('zh-CN', {
              hour: '2-digit',
              minute: '2-digit',
            })
          : String(a.time || '现在'),
      }))
    } catch {
      presenceRooms.value = []
      careRoomStays.value = []
      careHouse.value = {
        anyoneHome: null,
        wholeHouseInactiveMin: null,
        lastWholeHouseActivity: null,
      }
      careAlerts.value = []
    } finally {
      carePresenceLoaded.value = true
    }
  }

  async function ackCareAlert(id: string) {
    await ackAnomalyEvents([id])
    careAlerts.value = careAlerts.value.filter((a) => a.id !== id)
    invalidateSharedFetch('rest:GET:/security/anomaly/status')
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('homeos:anomaly-ack', { detail: { ids: [id] } }))
    }
  }

  let offChildModeWs: (() => void) | null = null

  onMounted(async () => {
    await Promise.all([loadChildMode(), reloadCarePresence()])
    offChildModeWs = entitiesStore.onChildModeEvent(() => {
      void loadChildMode()
    })

    try {
      const [advisor, reminders, lifespan] = await Promise.allSettled([
        fetchDailyAdvisor(),
        fetchAllReminders(),
        fetchDeviceLifespan(),
      ])
      if (advisor.status === 'fulfilled') {
        const tipsRaw = advisor.value?.tips || advisor.value?.items || advisor.value
        const list = Array.isArray(tipsRaw) ? tipsRaw : []
        advisorTips.value = list.map(tipText).filter(Boolean).slice(0, 6) as LifeAdvisorTip[]
        advisorTipCount.value =
          advisorTips.value.length || Number(advisor.value?.count) || list.length || 0
      }
      if (reminders.status === 'fulfilled') {
        const list = Array.isArray(reminders.value)
          ? reminders.value
          : reminders.value?.all ||
            reminders.value?.items ||
            reminders.value?.reminders ||
            []
        reminderItems.value = (Array.isArray(list) ? list : [])
          .map(reminderItem)
          .filter(Boolean)
          .slice(0, 8) as LifeReminderItem[]
        reminderCount.value = reminderItems.value.length || (Array.isArray(list) ? list.length : 0)
      }
      if (lifespan.status === 'fulfilled') {
        const rows = Array.isArray(lifespan.value)
          ? lifespan.value
          : lifespan.value?.items || lifespan.value?.devices || []
        const mapped = (Array.isArray(rows) ? rows : [])
          .map(lifespanItem)
          .filter(Boolean) as LifeLifespanItem[]
        lifespanItems.value = [
          ...mapped.filter((r) => r.warn),
          ...mapped.filter((r) => !r.warn),
        ].slice(0, 8)
        lifespanAlertCount.value = mapped.filter((r) => r.warn).length
      }
    } finally {
      smartLoaded.value = true
    }
  })

  onUnmounted(() => {
    offChildModeWs?.()
    offChildModeWs = null
  })

  const envScore = computed(() => {
    const score = env.healthScore.value
    return score === '--' || score == null ? null : Number(score)
  })

  const envMetrics = computed(() =>
    (env.iaqDetailItems.value || [])
      .filter((item) => !item.empty)
      .slice(0, 5)
      .map((item) => {
        const score = item.score
        const comfort =
          score == null ? null : Math.max(0, Math.min(100, 100 - Math.round(Number(score))))
        return {
          key: item.label,
          label: item.label,
          value: item.valueNum || item.value || '—',
          unit: item.unit || '',
          warn: Boolean(item.warn),
          score,
          comfort,
        }
      }),
  )

  const roomBoard = computed<LifeRoomBoardItem[]>(() =>
    (env.roomList.value || []).slice(0, 12).map((room) => {
      const tone = riskTone(room.configured, room.risk)
      return {
        roomId: room.roomId,
        name: room.name,
        configured: room.configured,
        risk: room.risk || '',
        riskLabel: riskLabel(room.configured, room.risk),
        tone,
        temp: fmtNum(room.temp, 1),
        humidity: fmtNum(room.humidity, 0),
        pm25: fmtNum(room.pm25, 0),
      }
    }),
  )

  const riskRoomStrip = computed(() =>
    roomBoard.value.filter((r) => r.tone === 'warn').slice(0, 6),
  )

  const energyGrid = computed(() => {
    const rows = power.gridAccountList.value || []
    const primary = rows.find((r) => r.stats?.dailyNum !== '--') || rows[0]
    const stats = primary?.stats
    return {
      daily: stats?.dailyNum && stats.dailyNum !== '--' ? stats.dailyNum : null,
      dailyCost: stats?.dailyCost && stats.dailyCost !== '--' ? stats.dailyCost : null,
      month: stats?.monthNum && stats.monthNum !== '--' ? stats.monthNum : null,
      balance: stats?.balance && stats.balance !== '--' ? stats.balance : null,
    }
  })

  /** 右栏「账户余额」：仅余额类读数，用量 KPI 由 tabMetricCells.energy 承担，避免重复 */
  const energyMetrics = computed(() => {
    const g = energyGrid.value
    const rows: Array<{ key: string; label: string; value: string; unit?: string }> = []
    if (g.balance != null) rows.push({ key: 'bal', label: '电费余额', value: `¥${g.balance}` })
    const gas = (power.gasAccountList.value || []).find((r) => r.balance !== '--')
    const water = (power.waterAccountList.value || []).find((r) => r.balance !== '--')
    if (gas) rows.push({ key: 'gas', label: '燃气余额', value: `¥${gas.balance}` })
    if (water) rows.push({ key: 'water', label: '用水余额', value: `¥${water.balance}` })
    return rows.slice(0, 4)
  })

  const mediaQuotaPct = computed(() => {
    const limit = dailyMediaLimitMin.value
    if (!limit || limit <= 0) return null
    return Math.max(0, Math.min(100, Math.round((mediaUsedMin.value / limit) * 100)))
  })

  const careValue = computed(() => {
    if (!childLoaded.value) return '…'
    if (!childEnabled.value) return '待命'
    return '已启用'
  })

  const careOk = computed(
    () => !childEnabled.value || !childWhitelistActive.value || childInAllowedWindow.value,
  )

  const occupiedCount = computed(
    () => presenceRooms.value.filter((r) => r.occupied).length,
  )
  const alertCount = computed(() => careAlerts.value.length)

  const heroStatCells = computed(() => [
    {
      key: 'health',
      label: '环境健康',
      value: envScore.value == null ? '—' : String(envScore.value),
      tone: 'emerald',
    },
    {
      key: 'life',
      label: '生活关注',
      value: lifeIndices.hasWeather.value
        ? String(lifeIndices.attentionCount.value)
        : '—',
      tone: lifeIndices.attentionCount.value || lifeIndices.warning.value?.active ? 'warn' : 'sky',
    },
    {
      key: 'power',
      label: '今日用电',
      value: energyGrid.value.daily != null ? `${energyGrid.value.daily}` : '—',
      tone: 'amber',
    },
    {
      key: 'smart',
      label: '智能',
      value: smartLoaded.value
        ? lifespanAlertCount.value
          ? `${lifespanAlertCount.value}`
          : String(advisorTipCount.value)
        : '…',
      tone: lifespanAlertCount.value ? 'warn' : 'violet',
    },
  ])

  const analyticsKpis = computed(() => [
    {
      key: 'score',
      label: '健康分',
      value: envScore.value == null ? '—' : String(envScore.value),
      hint: envScore.value == null ? '未接入' : env.healthLabel.value,
      tone: 'emerald',
    },
    {
      key: 'daily',
      label: '今日用电',
      value: energyGrid.value.daily != null ? `${energyGrid.value.daily} kWh` : '—',
      hint: energyGrid.value.dailyCost ? `¥${energyGrid.value.dailyCost}` : '电网',
      tone: 'amber',
    },
    {
      key: 'rooms',
      label: '已配房间',
      value: String(env.roomList.value.filter((r) => r.configured).length),
      hint: env.riskRooms.value.length ? `${env.riskRooms.value.length} 间需关注` : '监测正常',
      tone: env.riskRooms.value.length ? 'warn' : 'sky',
    },
    {
      key: 'care',
      label: '儿童模式',
      value: careValue.value,
      hint: childEnabled.value ? '运行中' : '未启用',
      tone: childEnabled.value ? 'pink' : 'muted',
    },
  ])

  const categoryCards = computed(() => {
    const smartValue = smartLoaded.value
      ? lifespanAlertCount.value
        ? `${lifespanAlertCount.value} 关注`
        : `${advisorTipCount.value} 建议`
      : '…'
    const smartStatus = smartLoaded.value
      ? lifespanAlertCount.value
        ? '设备需关注'
        : reminderCount.value
          ? `${reminderCount.value} 提醒`
          : '运行正常'
      : '加载中'
    const cards: Array<{
      id: LifeTabId
      label: string
      emoji: string
      icon: (typeof LIFE_TAB_META)[LifeTabId]['icon']
      accent: string
      value: string
      status: string
      ok: boolean
    }> = [
      {
        id: 'env',
        label: LIFE_TAB_META.env.label,
        emoji: LIFE_TAB_META.env.emoji,
        icon: LIFE_TAB_META.env.icon,
        accent: '#2dd4bf',
        value: envScore.value == null ? '—' : `${envScore.value} 分`,
        status: lifeIndices.warning.value?.active
          ? '有天气预警'
          : lifeIndices.attentionCount.value
            ? `${lifeIndices.attentionCount.value} 项生活关注`
            : envScore.value == null
              ? '未接入'
              : env.healthLabel.value || '正常',
        ok:
          envScore.value != null &&
          env.riskRooms.value.length === 0 &&
          !lifeIndices.warning.value?.active &&
          lifeIndices.attentionCount.value === 0,
      },
      {
        id: 'energy',
        label: LIFE_TAB_META.energy.label,
        emoji: LIFE_TAB_META.energy.emoji,
        icon: LIFE_TAB_META.energy.icon,
        accent: '#fbbf24',
        // 侧栏入口突出余额/本月，避免与左栏「今日用电」KPI 同数字
        value:
          energyGrid.value.balance != null
            ? `¥${energyGrid.value.balance}`
            : energyGrid.value.month != null
              ? `${energyGrid.value.month} kWh`
              : energyGrid.value.daily != null
                ? `${energyGrid.value.daily} kWh`
                : '—',
        status:
          energyGrid.value.balance != null
            ? '电费余额'
            : energyGrid.value.month != null
              ? '本月用电'
              : energyGrid.value.daily != null
                ? '今日用电'
                : '未配置',
        ok: energyGrid.value.daily != null || energyGrid.value.balance != null,
      },
      {
        id: 'care',
        label: LIFE_TAB_META.care.label,
        emoji: LIFE_TAB_META.care.emoji,
        icon: LIFE_TAB_META.care.icon,
        accent: '#fb7185',
        value: careValue.value,
        status: alertCount.value
          ? `${alertCount.value} 告警`
          : childEnabled.value
            ? '儿童模式'
            : occupiedCount.value
              ? `${occupiedCount.value} 在室`
              : '待命',
        ok: careOk.value && alertCount.value === 0,
      },
      {
        id: 'smart',
        label: LIFE_TAB_META.smart.label,
        emoji: LIFE_TAB_META.smart.emoji,
        icon: LIFE_TAB_META.smart.icon,
        accent: '#34d399',
        value: smartValue,
        status: smartStatus,
        ok: lifespanAlertCount.value === 0,
      },
    ]
    return cards
  })

  const roomHealthBuckets = computed(() => {
    const rooms = env.roomList.value || []
    let ok = 0
    let risk = 0
    let bare = 0
    for (const room of rooms) {
      if (!room.configured) {
        bare += 1
        continue
      }
      if (room.risk && room.risk !== 'safe') risk += 1
      else ok += 1
    }
    return [
      { key: 'ok', label: '正常', count: ok, color: '#34d399' },
      { key: 'risk', label: '关注', count: risk, color: '#fbbf24' },
      { key: 'bare', label: '未配置', count: bare, color: '#64748b' },
    ]
  })

  const tabMetricCells = computed(() => ({
    env: [
      {
        key: 'health',
        label: '健康分',
        value: envScore.value == null ? '—' : String(envScore.value),
        tone: 'emerald',
      },
      {
        key: 'life',
        label: '生活指数',
        value: lifeIndices.hasWeather.value
          ? String(lifeIndices.availableCount.value)
          : '—',
        tone: lifeIndices.availableCount.value ? 'sky' : 'muted',
      },
      {
        key: 'risk',
        label: '需关注',
        value: String(
          env.riskRooms.value.length + lifeIndices.attentionCount.value,
        ),
        tone:
          env.riskRooms.value.length || lifeIndices.attentionCount.value
            ? 'warn'
            : 'muted',
      },
    ],
    energy: [
      {
        key: 'daily',
        label: '今日用电',
        value: energyGrid.value.daily != null ? String(energyGrid.value.daily) : '—',
        tone: 'amber',
      },
      {
        key: 'cost',
        label: '今日电费',
        value: energyGrid.value.dailyCost != null ? `¥${energyGrid.value.dailyCost}` : '—',
        tone: 'emerald',
      },
      {
        key: 'month',
        label: '本月用电',
        value: energyGrid.value.month != null ? String(energyGrid.value.month) : '—',
        tone: 'sky',
      },
    ],
    care: [
      {
        key: 'mode',
        label: '儿童模式',
        value: careValue.value,
        tone: childEnabled.value ? 'pink' : 'muted',
      },
      {
        key: 'presence',
        label: '在室',
        value: carePresenceLoaded.value ? String(occupiedCount.value) : '…',
        tone: occupiedCount.value ? 'sky' : 'muted',
      },
      {
        key: 'alert',
        label: '告警',
        value: carePresenceLoaded.value ? String(alertCount.value) : '…',
        tone: alertCount.value ? 'warn' : 'muted',
      },
    ],
    smart: [
      {
        key: 'advisor',
        label: '今日建议',
        value: smartLoaded.value ? String(advisorTipCount.value) : '…',
        tone: 'violet',
      },
      {
        key: 'reminders',
        label: '提醒',
        value: smartLoaded.value ? String(reminderCount.value) : '…',
        tone: 'sky',
      },
      {
        key: 'lifespan',
        label: '设备关注',
        value: smartLoaded.value ? String(lifespanAlertCount.value) : '…',
        tone: lifespanAlertCount.value ? 'warn' : 'muted',
      },
    ],
  }))

  /** 关爱侧栏：用药优先，其余提醒补齐，最多 5 条 */
  const careReminders = computed(() => {
    const all = reminderItems.value
    const med = all.filter((r) => (r.type || '').toLowerCase() === 'medication')
    const rest = all.filter((r) => (r.type || '').toLowerCase() !== 'medication')
    return [...med, ...rest].slice(0, 5)
  })

  const smartStatusBuckets = computed(() => [
    { key: 'tips', label: '建议', count: advisorTipCount.value, color: '#a78bfa' },
    { key: 'reminders', label: '提醒', count: reminderCount.value, color: '#38bdf8' },
    { key: 'lifespan', label: '设备关注', count: lifespanAlertCount.value, color: '#fbbf24' },
  ])

  return {
    heroStatCells,
    analyticsKpis,
    envMetrics,
    energyMetrics,
    categoryCards,
    roomHealthBuckets,
    roomBoard,
    riskRoomStrip,
    tabMetricCells,
    smartStatusBuckets,
    advisorTipCount,
    reminderCount,
    lifespanAlertCount,
    advisorTips,
    reminderItems,
    lifespanItems,
    presenceRooms,
    careRoomStays,
    careHouse,
    careAlerts,
    occupiedCount,
    alertCount,
    childEnabled,
    childLoaded,
    childInAllowedWindow,
    childWhitelistActive,
    mediaUsedMin,
    dailyMediaLimitMin,
    mediaQuotaPct,
    carePresenceLoaded,
    smartLoaded,
    careReminders,
    reloadCarePresence,
    ackCareAlert,
  }
}

/** 生活路由内共享同一份 KPI / 关爱 / 智能摘要，避免多 Tab 各拉一份 */
export const useLifeOverview = createSharedComposable(useLifeOverviewState)
