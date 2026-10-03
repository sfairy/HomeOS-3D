<!--
  MonitorPanel.vue / components/widgets/care
  关爱看护监控面板：关怀 Hub 首页卡片，展示整屋状态、在室判定、作息基线
  与最近活动，含房间存在网格、家庭成员追踪、房间动静热力与看护告警列表。
  Props: embedded 嵌入态时隐藏 HaStatusDegradeBanner 降级提示
  依赖：services/api/security 异常状态与基线接口；
        composables: useWidgetStatusPoll 轮询 + usePausableStateListener 实体推送监听
                    + usePresenceHome 家庭成员 + useAreaOptions 区域标签；
        Pinia: useEntitiesStore 实体快照；RouterLink 跳转传感器绑定与家庭成员。
  注意：careAlerts 合并异常 API 与实体推送事件源；timeline 上限 MAX_TIMELINE 条。
-->
<template>
  <div class="cm-root" :class="{ 'cm-root--embedded': embedded }">
    <HaStatusDegradeBanner v-if="!embedded" title="关怀监控" />
    <div v-if="!embedded" class="cm-header">
      <div class="cm-header-left">
        <HeartHandshake
          :class="['w-3.5 h-3.5', careAlerts.length > 0 ? 'cm-icon-alert' : 'cm-icon-ok']"
        />
        <span class="cm-title">{{ '关怀监控' }}</span>
      </div>
      <div class="cm-header-right">
        <span v-if="careAlerts.length > 0" class="cm-badge cm-badge--alert">{{
          `${careAlerts.length} 提醒`
        }}</span>
        <span v-else class="cm-badge cm-badge--ok">{{ '正常' }}</span>
      </div>
    </div>

    <div class="cm-body">
      <ApiQueryState
        :loading="loading"
        :error="loadError"
        tone="indigo"
        error-title="看护数据加载失败"
        @retry="fetchData"
      >
        <template v-if="!loading && !loadError">
          <div class="cm-house">
            <div class="cm-house-cell" :class="houseTone">
              <span>{{ '整屋状态' }}</span>
              <strong>{{ houseLabel }}</strong>
            </div>
            <div class="cm-house-cell" :class="anyoneHome ? 'is-home' : 'is-away'">
              <span>{{ '在家判定' }}</span>
              <strong>{{ anyoneHomeLabel }}</strong>
            </div>
            <div class="cm-house-cell">
              <span>{{ '最近活动' }}</span>
              <strong>{{ lastActivityLabel }}</strong>
            </div>
            <div class="cm-house-cell" :class="baselineTone">
              <span>{{ '作息基线' }}</span>
              <strong>{{ baselineLabel }}</strong>
            </div>
          </div>

          <div class="cm-bento">
            <section class="cm-panel">
              <header class="cm-panel-head">
                <span>{{ '当前在室' }}</span>
                <em>{{ `${occupiedCount} 间` }}</em>
              </header>
              <VEmptyState
                v-if="presenceRooms.length === 0"
                compact
                tone="indigo"
                :title="'等待传感器数据...'"
              >
                <template #action>
                  <RouterLink
                    :to="{ path: '/settings', query: { tab: 'bindings', section: 'security' } }"
                    class="cm-deep-link"
                  >
                    {{ '配置存在/运动传感器' }}
                  </RouterLink>
                </template>
              </VEmptyState>
              <div v-else class="cm-presence-grid">
                <div v-for="room in presenceRooms" :key="room.room" class="cm-presence-item">
                  <div
                    :class="[
                      'cm-presence-dot',
                      room.occupied ? 'cm-dot--occupied' : 'cm-dot--empty',
                    ]"
                  />
                  <span class="cm-presence-room">{{ room.label }}</span>
                  <span v-if="room.occupied && room.durationMin > 0" class="cm-presence-dur">{{
                    fmtDur(room.durationMin)
                  }}</span>
                  <span
                    v-else-if="!room.occupied && room.inactiveMin > 0"
                    class="cm-presence-dur cm-presence-dur--quiet"
                    >{{ `静 ${fmtDur(room.inactiveMin)}` }}</span
                  >
                </div>
              </div>
            </section>

            <section class="cm-panel">
              <header class="cm-panel-head">
                <span>{{ '家庭成员' }}</span>
                <RouterLink class="cm-panel-link" :to="familyRoute">{{ '成员' }}</RouterLink>
              </header>
              <div v-if="familyMembers.length" class="cm-members">
                <div
                  v-for="m in familyMembers.slice(0, 8)"
                  :key="m.id"
                  class="cm-member"
                  :class="m.atHome ? 'is-home' : 'is-away'"
                >
                  <i aria-hidden="true" />
                  <strong>{{ m.name }}</strong>
                  <span>{{ m.atHome ? '在家' : '外出' }}</span>
                </div>
              </div>
              <p v-else class="cm-muted">
                {{ familyLoading ? '加载中…' : '未配置成员追踪，可在家庭成员中绑定' }}
              </p>
            </section>

            <section class="cm-panel cm-panel--wide">
              <header class="cm-panel-head">
                <span>{{ '房间动静' }}</span>
                <em v-if="roomHeatRows.length">{{ `${roomHeatRows.length} 项` }}</em>
              </header>
              <div v-if="roomHeatRows.length" class="cm-heat">
                <div
                  v-for="row in roomHeatRows"
                  :key="row.room"
                  class="cm-heat-row"
                  :class="`is-${row.tone}`"
                >
                  <span class="cm-heat-name">{{ row.label }}</span>
                  <div class="cm-heat-track"><i :style="{ width: `${row.pct}%` }" /></div>
                  <strong>{{ row.detail }}</strong>
                </div>
              </div>
              <p v-else class="cm-muted">{{ '暂无房间动静数据' }}</p>
            </section>

            <section v-if="anomalyAlerts.length > 0" class="cm-panel cm-panel--wide">
              <header class="cm-panel-head cm-panel-head--alert">
                <span>{{ '看护提醒' }}</span>
              </header>
              <div
                v-for="alert in anomalyAlerts"
                :key="alert.id"
                :class="['cm-alert', alert.level === 'high' ? 'cm-alert--high' : 'cm-alert--medium']"
              >
                <AlertTriangle class="w-3 h-3 shrink-0" />
                <div class="cm-alert-content">
                  <span class="cm-alert-text">{{ alert.message }}</span>
                  <span class="cm-alert-time">{{ alert.time }}</span>
                </div>
              </div>
            </section>

            <section v-if="timeline.length > 0" class="cm-panel cm-panel--wide">
              <header class="cm-panel-head">
                <span>{{ '近期活动' }}</span>
              </header>
              <div class="cm-timeline">
                <div v-for="(event, idx) in timeline" :key="idx" class="cm-timeline-item">
                  <div
                    class="cm-timeline-dot"
                    :class="event.type === 'motion' ? 'cm-tt--motion' : 'cm-tt--presence'"
                  />
                  <span class="cm-timeline-text">{{ event.label }}</span>
                  <span class="cm-timeline-time">{{ event.time }}</span>
                </div>
              </div>
            </section>
          </div>

          <VEmptyState
            v-if="!hasAnyData && !loading && !loadError"
            compact
            tone="indigo"
            icon="💚"
            :title="'等待活动数据...'"
            :description="'需要 mmWave 人体存在或运动传感器'"
          >
            <template #action>
              <RouterLink :to="SETTINGS_ROUTES.bindings('security')" class="cm-deep-link">
                {{ '前往绑定传感器' }}
              </RouterLink>
            </template>
          </VEmptyState>
        </template>
      </ApiQueryState>
    </div>
  </div>
</template>

<script setup>
/**
 * 关爱看护面板（老人/儿童活动监测）
 * API: GET /api/v1/security/anomaly/status
 */
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { RouterLink } from 'vue-router'
import { HeartHandshake, AlertTriangle } from '@lucide/vue'

import HaStatusDegradeBanner from '@/components/common/HaStatusDegradeBanner.vue'
import ApiQueryState from '@/components/common/ApiQueryState.vue'

import { useEntitiesStore } from '@/stores/entities.store'
import { formatLocaleTime, formatDurationMinutes } from '@/utils/format/locale-format.util'
import { fetchAnomalyStatus, fetchAnomalyBaselines } from '@/services/api/security'
import { notifyError } from '@/services/notify'
import { sharedFetch, invalidateSharedFetch } from '@/utils/core/poll-scheduler'
import { useWidgetStatusPoll } from '@/composables/widget/useWidgetStatusPoll'
import { usePausableStateListener } from '@/composables/entity/usePausableStateListener'
import { usePresenceHome } from '@/composables/presence/usePresenceHome'
import { resolveEntityArea } from '@homeos/shared'
import { useAreaOptions } from '@/composables/entity/useAreaOptions'
import { getEntityDisplayName } from '@/utils/entity/derived.util'
import { SETTINGS_ROUTES } from '@/utils/registry/settings-route.util'

defineProps({
  embedded: { type: Boolean, default: false },
})

const es = useEntitiesStore()
const { resolvedAreas } = useAreaOptions()
const { loading: familyLoading, members: familyMembers } = usePresenceHome(45_000)
const familyRoute = SETTINGS_ROUTES.family()
const loading = ref(true)
const loadError = ref('')
let unsubMotion = () => {}
const anomalyStatus = ref({})
const motionEvents = ref([])
const baselineRoomCount = ref(0)
const baselineLoaded = ref(false)
const MAX_TIMELINE = 10

const roomLabels = computed(() => ({
  living: '客厅',
  living_room: '客厅',
  dining: '餐厅',
  dining_room: '餐厅',
  master_bedroom: '主卧',
  master_bed: '主卧',
  elder_bedroom: '老人房',
  elder: '老人房',
  kids_bedroom: '儿童房',
  kids: '儿童房',
  child: '儿童房',
  master_bath: '主卫',
  master_bathroom: '主卫',
  guest_bath: '客卫',
  guest_bathroom: '客卫',
  bedroom: '卧室',
  bathroom: '浴室',
  kitchen: '厨房',
  other: '其他',
}))

const anyoneHome = computed(() => anomalyStatus.value?.anyoneHome === true)
const anyoneHomeLabel = computed(() => {
  if (typeof anomalyStatus.value?.anyoneHome !== 'boolean') return '未知'
  return anyoneHome.value ? '有人在家' : '无人在家'
})
const wholeHouseInactiveMin = computed(() => Number(anomalyStatus.value?.wholeHouseInactiveMin) || 0)
const houseLabel = computed(() => {
  const min = wholeHouseInactiveMin.value
  if (!anomalyStatus.value?.lastWholeHouseActivity && !min) return '待采样'
  if (min < 15) return '活跃中'
  if (min < 120) return '安静'
  return '久未活动'
})
const houseTone = computed(() => {
  const min = wholeHouseInactiveMin.value
  if (min < 15) return 'is-live'
  if (min < 120) return 'is-ok'
  return 'is-warn'
})
const lastActivityLabel = computed(() => {
  const ts = anomalyStatus.value?.lastWholeHouseActivity
  if (!ts) return '—'
  const ago = Math.max(0, Math.round((Date.now() - new Date(ts).getTime()) / 60000))
  return `${fmtDur(ago)}前`
})
const baselineLabel = computed(() => {
  if (!baselineLoaded.value) return '…'
  return baselineRoomCount.value > 0 ? `${baselineRoomCount.value} 房间` : '积累中'
})
const baselineTone = computed(() =>
  baselineLoaded.value && baselineRoomCount.value > 0 ? 'is-ok' : '',
)

const presenceRooms = computed(() => {
  void es.derivedEpoch
  void es.getDomainEpoch('binary_sensor')
  const stays = Array.isArray(anomalyStatus.value?.roomStays)
    ? anomalyStatus.value.roomStays
    : []
  const fromStays = stays
    .filter(
      (s) =>
        s.occupied === true || Number(s.durationMin) > 0 || Number(s.inactiveMin) > 0,
    )
    .map((s) => {
      const areaLabel = resolvedAreas.value.find((a) => a.id === s.room)?.name
      return {
        room: String(s.room),
        label:
          areaLabel ||
          roomLabels.value[s.area] ||
          roomLabels.value[s.room] ||
          String(s.room),
        occupied: s.occupied === true || Number(s.durationMin) > 0,
        entity_id: '',
        durationMin: Number(s.durationMin) || 0,
        inactiveMin: Number(s.inactiveMin) || 0,
      }
    })
  if (fromStays.length) {
    return fromStays.sort((a, b) => (a.label > b.label ? 1 : -1))
  }

  const rooms = []
  for (const [key, entity] of Object.entries(es.entities)) {
    if (!entity || entity.state === 'unavailable') continue
    const isMmWave =
      key.startsWith('binary_sensor.') &&
      (key.includes('mmwave') || key.includes('presence_sensor') || key.includes('occupancy'))
    const isMotion =
      key.startsWith('binary_sensor.') && key.includes('motion') && !key.includes('frigate')
    if (!isMmWave && !isMotion) continue
    const room = inferRoom(key, entity)
    if (rooms.find((r) => r.room === room)) continue
    const stay = stays.find((s) => s.room === room)
    const areaLabel = resolvedAreas.value.find((a) => a.id === room)?.name
    rooms.push({
      room,
      label: areaLabel || roomLabels.value[room] || room,
      occupied: entity.state === 'on',
      entity_id: key,
      durationMin: stay?.durationMin || 0,
      inactiveMin: stay?.inactiveMin || 0,
    })
  }
  return rooms.sort((a, b) => (a.label > b.label ? 1 : -1))
})

const occupiedCount = computed(() => presenceRooms.value.filter((r) => r.occupied).length)

const roomHeatRows = computed(() => {
  const rows = presenceRooms.value
  if (!rows.length) return []
  const scored = rows
    .map((r) => {
      const occupied = r.occupied || Number(r.durationMin) > 0
      const score = occupied ? Number(r.durationMin) || 1 : Number(r.inactiveMin) || 0
      const tone = occupied
        ? Number(r.durationMin) >= 45
          ? 'hot'
          : 'live'
        : Number(r.inactiveMin) >= 120
          ? 'quiet-long'
          : 'quiet'
      const detail = occupied
        ? formatDurationMinutes(r.durationMin)
        : r.inactiveMin
          ? `静 ${formatDurationMinutes(r.inactiveMin)}`
          : '静'
      return { room: r.room, label: r.label, score, tone, detail, occupied }
    })
    .filter((r) => r.score > 0 || r.occupied)
    .sort((a, b) => {
      if (a.occupied !== b.occupied) return a.occupied ? -1 : 1
      return b.score - a.score
    })
    .slice(0, 8)
  const top = Math.max(...scored.map((r) => r.score), 1)
  return scored.map((r) => ({
    ...r,
    pct: Math.max(8, Math.round((r.score / top) * 100)),
  }))
})

function inferRoom(entityId, entity) {
  const area = resolveEntityArea(entity?.attributes)
  if (area?.id) return area.id
  const name = getEntityDisplayName(entityId, entity)
  const lower = (entityId + name).toLowerCase()
  if (lower.includes('bed') || lower.includes('卧')) return 'bedroom'
  if (lower.includes('bath') || lower.includes('卫') || lower.includes('浴')) return 'bathroom'
  if (lower.includes('kitchen') || lower.includes('厨')) return 'kitchen'
  if (lower.includes('living') || lower.includes('客')) return 'living'
  return 'other'
}

const anomalyAlerts = computed(() => {
  return (anomalyStatus.value?.activeAlerts || []).map((a) => ({
    ...a,
    time: a.timestamp
      ? formatLocaleTime(new Date(a.timestamp), { hour: '2-digit', minute: '2-digit' })
      : a.time || '现在',
  }))
})

const timeline = computed(() => motionEvents.value.slice(0, MAX_TIMELINE))
const careAlerts = computed(() => anomalyAlerts.value)
const hasAnyData = computed(
  () =>
    presenceRooms.value.length > 0 ||
    motionEvents.value.length > 0 ||
    anomalyAlerts.value.length > 0 ||
    familyMembers.value.length > 0,
)

function fmtDur(min) {
  if (!min || min < 1) return '刚刚'
  if (min < 60) return `${Math.round(min)} 分钟`
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  return m > 0 ? `${h}时${m}分` : `${h} 小时`
}

async function fetchData() {
  loadError.value = ''
  if (!loading.value) loading.value = true
  try {
    const anomalyData = await sharedFetch(
      'rest:GET:/security/anomaly/status',
      async () => {
        const res = await fetchAnomalyStatus()
        return res?.data ?? null
      },
      POLL_INTERVAL,
    )
    if (anomalyData == null) {
      loadError.value = '看护数据加载失败'
      return
    }
    anomalyStatus.value = anomalyData
  } catch (e) {
    loadError.value = '看护数据加载失败'
    notifyError(e, '加载失败')
  } finally {
    loading.value = false
  }
}

function trackMotionEvents() {
  const now = Date.now()
  const time = formatLocaleTime(new Date(), { hour: '2-digit', minute: '2-digit' })
  for (const [key, entity] of Object.entries(es.entities)) {
    if (!entity || entity.state !== 'on') continue
    if (!key.startsWith('binary_sensor.')) continue
    if (!key.includes('motion') || key.includes('frigate')) continue
    const lastChanged = entity.last_changed ? new Date(entity.last_changed).getTime() : 0
    if (now - lastChanged > 60000) continue
    const name = getEntityDisplayName(key, entity)
    const existing = motionEvents.value.find((e) => e.entity_id === key && e.ts > now - 120000)
    if (existing) continue
    motionEvents.value.unshift({
      entity_id: key,
      label: `${name} 检测到活动`,
      time,
      type: 'motion',
      ts: now,
    })
  }
  if (motionEvents.value.length > MAX_TIMELINE * 2) {
    motionEvents.value.length = MAX_TIMELINE * 2
  }
}

function onAnomalyAck(ev) {
  const ids = ev?.detail?.ids || []
  if (!ids.length || !anomalyStatus.value) return
  const current = anomalyStatus.value
  const alerts = Array.isArray(current.activeAlerts) ? current.activeAlerts : []
  anomalyStatus.value = {
    ...current,
    activeAlerts: alerts.filter((a) => !ids.includes(String(a.id))),
  }
  invalidateSharedFetch('rest:GET:/security/anomaly/status')
}

onMounted(() => {
  fetchData()
  void (async () => {
    try {
      const res = await fetchAnomalyBaselines()
      const data = res?.data || res || {}
      if (typeof data.roomCount === 'number' && Number.isFinite(data.roomCount)) {
        baselineRoomCount.value = data.roomCount
      } else {
        const rooms = data?.rooms && typeof data.rooms === 'object' ? data.rooms : {}
        baselineRoomCount.value = Object.keys(rooms).filter((k) => {
          const buckets = rooms[k]
          return Array.isArray(buckets) ? buckets.length > 0 : Boolean(buckets)
        }).length
      }
    } catch {
      baselineRoomCount.value = 0
    } finally {
      baselineLoaded.value = true
    }
  })()
  unsubMotion = usePausableStateListener(
    ({ entity_id }) => {
      if (entity_id.includes('motion') && !entity_id.includes('frigate')) {
        trackMotionEvents()
      }
    },
    {
      domains: ['binary_sensor'],
      filter: ({ entity_id }) => entity_id.includes('motion') && !entity_id.includes('frigate'),
    },
  )
  window.addEventListener('homeos:anomaly-ack', onAnomalyAck)
})
onUnmounted(() => {
  unsubMotion()
  window.removeEventListener('homeos:anomaly-ack', onAnomalyAck)
})
const { intervalMs: POLL_INTERVAL } = useWidgetStatusPoll('careMonitor', fetchData, 20_000, {
  key: 'widget:CareMonitorPanel',
})
</script>

<style scoped src="./styles/MonitorPanel.css"></style>
