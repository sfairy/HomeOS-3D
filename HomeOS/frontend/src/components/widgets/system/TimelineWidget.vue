<!--
  TimelineWidget.vue / components/widgets/system
  系统实体事件流时间线：按 EVENT_LOG_OVERLAY_DOMAINS 过滤展示最近 HA 实体属性变更，
  含域颜色、变化前后描述，支持分页轮询、WebSocket 实时增量刷新与暂停监听。
  Props: embedded 嵌入态时隐藏标题栏 / max-items 最大条目 / compact 紧凑布局
  依赖：composables: useWidgetStatusPoll 周期拉 history REST
                      + usePausableStateListener 实体变更增量合并；
        Pinia: useEntitiesStore + useLayoutStore + useAuthStore；
        services/api 通用 GET + registerEventLogRefreshHandler 全局刷新回调；
        utils: describeAttrChange 属性中文化 + entityStateLabel 域态标签。
  注意：haStore totalCount 超阈值启用 REST 分页；大条目数做时间倒序合并去重。
-->
<template>
  <div class="timeline-widget widget-glass-card">
    <div v-if="!embedded" class="flex items-center justify-between mb-4 px-1">
      <div class="flex items-center gap-2">
        <Activity class="w-4 h-4 tl-icon" />
        <span class="text-xs font-bold tl-title uppercase tracking-widest">{{ '系统事件流' }}</span>
      </div>
      <span v-if="isLoading" class="text-[12px] tl-loading animate-pulse">{{ '加载中…' }}</span>
      <CheckCircle2 v-else class="w-3.5 h-3.5 tl-check" />
    </div>
    <div class="timeline-container custom-scrollbar">
      <ApiQueryState
        :loading="isLoading && !loadError"
        :error="loadError"
        tone="sky"
        error-title="时间线加载失败"
        @retry="() => fetchHistory()"
      >
        <div v-if="!events.length && !isLoading && !loadError" class="py-10 text-center">
          <p class="text-[12px] tl-empty italic">
            {{ `最近 ${timelineHours} 小时无关键事件记录` }}
          </p>
        </div>
        <div v-else-if="events.length" class="space-y-4 pr-1">
          <div
            v-for="(event, index) in events"
            :key="`${event.entity_id}-${event.timestamp.getTime()}-${index}`"
            class="event-item group"
          >
            <div class="event-meta">
              <span class="event-time">{{ formatTime(event.timestamp) }}</span>
              <div class="event-line-wrapper">
                <div class="event-dot" :class="event.colorClass.replace('text-', 'bg-')" />
                <div v-if="index < events.length - 1" class="event-line" />
              </div>
            </div>
            <div class="event-content">
              <div class="flex items-baseline justify-between mb-0.5">
                <span class="event-name truncate">{{ event.name }}</span>
                <span class="event-type" :class="event.colorClass">{{ getStateText(event) }}</span>
              </div>
              <p v-if="event.state === 'unavailable'" class="text-[12px] tl-warn-text font-medium">
                {{ '设备心跳丢失，请检查网关状态' }}
              </p>
            </div>
          </div>
        </div>
      </ApiQueryState>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * 系统时间线部件
 * 右侧面板中展示最近 12 小时的关键设备状态变化。
 *
 * 数据来源：
 * - 最近 12 小时的本地 EventLog（/events/timeline）
 * - 关注实体（favorites）和 binary_sensor 实体的状态变化
 * - 实时监听 state_changed 事件追加新记录
 *
 * 事件类型包括：开启/关闭、离线/恢复、触发等。
 */
import { ref, watch, onMounted, onUnmounted, computed } from 'vue'
import { useWidgetStatusPoll } from '@/composables/widget/useWidgetStatusPoll'
import { usePausableStateListener } from '@/composables/entity/usePausableStateListener'
import { useEntitiesStore } from '@/stores/entities.store'
import { useLayoutStore } from '@/stores/layout.store'
import { useAuthStore } from '@/stores/auth.store'
import { apiGet } from '@/services/api'
import { Activity, CheckCircle2 } from '@lucide/vue'
import ApiQueryState from '@/components/common/ApiQueryState.vue'
import { formatLocaleTime } from '@/utils/format/locale-format.util'
import { configEpoch, getEventLogConfig } from '@/utils/config/frontend-config'
import { extractErrorMessage } from '@/utils/core/error-message'
import { describeAttrChange } from '@/utils/entity/control-attr-change.util'
import { entityStateLabel } from '@/constants/entity-state-labels'
import { EVENT_LOG_OVERLAY_DOMAINS } from '@/utils/entity/event-log-domains.util'
import { registerEventLogRefreshHandler } from '@/utils/bridge/store-bridge'
import { getEntityDisplayName } from '@/utils/entity/derived.util'
import type { EntityStateListenerPayload } from '@/types/entity-store'

/** 时间线事件（createEvent 返回值形状） */
interface TimelineEvent {
  entity_id: string
  name: string
  state: string
  previous_state: string
  timestamp: Date
  colorClass: string
  attrText: string | null
}

/** EventLog 的 old/newState 字段：后端可能给对象或 JSON 字符串 */
type EventLogJson = { state?: unknown; attributes?: unknown } | string | null | undefined

const props = defineProps({
  embedded: { type: Boolean, default: false },
  panelVisible: { type: Boolean, default: true },
})

const haStore = useEntitiesStore()
const layoutStore = useLayoutStore()
const authStore = useAuthStore()

const events = ref<TimelineEvent[]>([]) // 时间线事件列表
const isLoading = ref(true) // 历史数据加载状态
const loadError = ref('') // API 失败时不伪装为空时间线
let removeStateListener: (() => void) | null = null // 取消状态变更订阅
let unregisterEventLogRefresh: (() => void) | null = null // Socket 重连补水

const timelineMeta = computed(() => {
  void configEpoch.value
  return getEventLogConfig()
})
const timelineHours = computed(() => timelineMeta.value.timelineHours)
const timelineLimit = computed(() => timelineMeta.value.timelineLimit)

// 系统事件流默认纳入的关键设备域：即便未收藏，空调等设备的开关/模式事件也会出现
const TIMELINE_KEY_DOMAINS = ['climate', 'light', 'switch', 'fan', 'cover', 'lock', 'media_player']

/**
 * 获取目标实体（最多30个，与后端 queryTimelineEvents 上限一致）。
 * 顺序：收藏实体 > 关键设备域实体（含空调）> binary_sensor。
 */
const getTargetEntities = () => {
  const favorites = Object.values(layoutStore.layoutConfig.favoriteEntities || {}).flat()
  const allIds = Object.keys(haStore.entities || {})
  const keyDomainEntities = allIds.filter((e) =>
    TIMELINE_KEY_DOMAINS.some((d) => e.startsWith(`${d}.`)),
  )
  const binarySensors = allIds.filter((e) => e.startsWith('binary_sensor.'))
  return [...new Set([...favorites, ...keyDomainEntities, ...binarySensors])].slice(0, 30)
}

function parseEventLogState(json: EventLogJson): string | null {
  if (!json) return null
  if (typeof json === 'object' && json.state != null) return String(json.state)
  if (typeof json === 'string') {
    try {
      const parsed = JSON.parse(json) as { state?: unknown } | null
      return parsed?.state != null ? String(parsed.state) : null
    } catch {
      return null
    }
  }
  return null
}

function parseEventLogAttributes(json: EventLogJson): Record<string, unknown> | undefined {
  if (!json) return undefined
  if (typeof json === 'object') return (json.attributes as Record<string, unknown>) || undefined
  if (typeof json === 'string') {
    try {
      const parsed = JSON.parse(json) as { attributes?: Record<string, unknown> } | null
      return parsed?.attributes || undefined
    } catch {
      return undefined
    }
  }
  return undefined
}

function shouldRecordTimelineEvent(entityId: string, state: string) {
  return (
    state === 'unknown' ||
    state === 'unavailable' ||
    entityId.startsWith('binary_sensor.') ||
    TIMELINE_KEY_DOMAINS.some((prefix) => entityId.startsWith(`${prefix}.`))
  )
}

/** 构造标准事件对象（含颜色分类）。attrText 用于属性变更事件的描述 */
const createEvent = (
  entityId: string,
  name: string,
  state: string,
  previousState: string,
  lastChanged: string | number | Date,
  attrText: string | null = null,
): TimelineEvent => {
  let colorClass = 'tl-text-blue'
  if (state === 'on' || state === 'open') {
    colorClass = 'tl-text-orange'
  } else if (state === 'unavailable' || state === 'unknown') {
    colorClass = 'tl-text-red'
  } else if (state === 'off' || state === 'closed') {
    colorClass = 'tl-text-gray'
  }
  return {
    entity_id: entityId,
    name,
    state,
    previous_state: previousState,
    timestamp: new Date(lastChanged),
    colorClass,
    attrText,
  }
}

/** 格式化为 HH:mm */
const formatTime = (date: Date) => {
  return formatLocaleTime(date, {
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** 根据实体状态返回中文描述 */
const getStateText = (event: TimelineEvent) => {
  if (event.attrText) return event.attrText
  const state = event.state
  const entityId = event.entity_id
  if (state === 'on' || state === 'open') {
    return entityId.includes('sensor') ? '已触发/打开' : '已开启'
  } else if (state === 'off' || state === 'closed') {
    return entityId.includes('sensor') ? '已恢复/关闭' : '已关闭'
  } else if (state === 'unavailable') {
    return '连接断开 (离线)'
  }
  return entityStateLabel(state) || state
}

/** 拉取本地 EventLog 并解析为时间线事件 */
const fetchHistory = async ({ quiet = false }: { quiet?: boolean } = {}) => {
  if (!authStore.isAuthenticated) {
    if (!quiet) isLoading.value = false
    return
  }

  const entities = getTargetEntities()
  if (entities.length === 0) {
    if (!quiet) isLoading.value = false
    return
  }

  if (!quiet) isLoading.value = true
  loadError.value = ''

  try {
    const res = await apiGet('/events/timeline', {
      params: {
        entity_ids: entities.join(','),
        hours: timelineHours.value,
        limit: timelineLimit.value,
        // 时间线需要完整 old/newState 渲染状态变化，请求时显式要求回传
        includeFullState: 'true',
      },
    })
    const rows = res.data?.events || []
    const newEvents = []

    for (const row of rows) {
      const entityId = row.entityId
      const newState = parseEventLogState(row.newState)
      const oldState = parseEventLogState(row.oldState)
      if (!entityId || newState == null) continue

      const entity = haStore.getEntity(entityId)
      const name = getEntityDisplayName(entityId, entity)

      if (newState !== oldState) {
        if (!shouldRecordTimelineEvent(entityId, newState)) continue
        newEvents.push(createEvent(entityId, name, newState, oldState || '', row.createdAt))
      } else {
        // state 未变：尝试从新旧属性中提取控制属性变更
        const attrText = describeAttrChange(
          entityId,
          parseEventLogAttributes(row.oldState),
          parseEventLogAttributes(row.newState),
        )
        if (!attrText) continue
        newEvents.push(
          createEvent(entityId, name, newState, oldState || '', row.createdAt, attrText),
        )
      }
    }

    events.value = newEvents
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, timelineLimit.value)
  } catch (error) {
    loadError.value = extractErrorMessage(error)
    events.value = []
  } finally {
    isLoading.value = false
  }
}

/** 实时状态变更时追加新事件到时间线（不限 API 的 30 实体上限） */
const handleStateChange = (changeEvent: EntityStateListenerPayload) => {
  if (props.panelVisible === false || !changeEvent.new_state) return
  if (changeEvent.new_state._optimistic) return

  const entityId = changeEvent.entity_id
  const oldState = changeEvent.old_state?.state
  const newState = changeEvent.new_state.state
  if (!entityId || !newState) return

  let attrText: string | null = null
  if (oldState === newState) {
    attrText = describeAttrChange(
      entityId,
      changeEvent.old_state?.attributes,
      changeEvent.new_state.attributes,
    )
    if (!attrText) return
  } else if (!shouldRecordTimelineEvent(entityId, newState)) {
    return
  }

  const entity = haStore.getEntity(entityId)
  const name = getEntityDisplayName(entityId, entity)
  const limit = timelineLimit.value

  const newEvent = createEvent(
    entityId,
    name,
    newState,
    oldState || '',
    changeEvent.new_state.last_changed ?? new Date().toISOString(),
    attrText,
  )
  const duplicate = events.value.some(
    (e) =>
      e.entity_id === entityId &&
      Math.abs(e.timestamp.getTime() - newEvent.timestamp.getTime()) < 2000,
  )
  if (!duplicate) {
    events.value.unshift(newEvent)
    events.value = events.value.slice(0, limit)
  }
}

let historyStarted = false
const { restart: restartHistoryPoll } = useWidgetStatusPoll(
  'systemTimeline',
  () => {
    fetchHistory({ quiet: true })
  },
  30_000,
  {
    key: 'widget:SystemTimelineWidget',
    immediate: false,
  },
)
function startHistoryPolling() {
  if (historyStarted || !layoutStore.isConfigLoaded || !authStore.isAuthenticated) return
  historyStarted = true
  fetchHistory()
  restartHistoryPoll()
}

watch(
  [() => layoutStore.isConfigLoaded, () => authStore.isAuthenticated],
  ([loaded, authed]) => {
    if (loaded && authed) startHistoryPolling()
  },
  { immediate: true },
)

watch(
  () => props.panelVisible,
  (visible) => {
    if (visible !== false) fetchHistory({ quiet: true })
  },
)

onMounted(() => {
  unregisterEventLogRefresh =
    registerEventLogRefreshHandler(() => fetchHistory({ quiet: true })) ?? null
  removeStateListener = usePausableStateListener(handleStateChange, {
    domains: [...EVENT_LOG_OVERLAY_DOMAINS],
  })
  if (authStore.isAuthenticated && layoutStore.isConfigLoaded) {
    fetchHistory({ quiet: props.embedded })
  }
})

onUnmounted(() => {
  unregisterEventLogRefresh?.()
  unregisterEventLogRefresh = null
  removeStateListener?.()
  removeStateListener = null
})

async function load(opts: { quiet?: boolean } = {}) {
  await fetchHistory({ quiet: opts.quiet ?? false })
}

defineExpose({ load })
</script>

<style scoped src="./styles/TimelineWidget.css"></style>
