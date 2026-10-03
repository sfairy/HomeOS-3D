<!--
  FrigateEvents.vue / components/widgets/security
  Frigate 检测事件面板：安防 Hub 页签下展示摄像头 AI 检测结果（人/车/动物等），
  含缩略图、识别标签、置信度百分比、摄像头名与时间，支持单条确认。
  Props: embedded 嵌入态时隐藏独立刷新按钮与标题头
  依赖：services/api/security fetchFrigateEvents + ackFrigateEvents 接口；
        composables/widget/useScheduledPoll 30s 轮询；
        Pinia: useEntitiesStore camera 域索引 + useLayoutStore 布局；
        utils: media-url.util 缩略图解析 + locale-format.util 时间格式化；
        notify 错误通知服务。
  注意：API 无数据时 fallback 到 entitiesStore 中 camera 域的最近事件列表。
-->
<template>
  <div :class="['fr-card', embedded && 'fr-card--embedded']">
    <div v-if="!embedded" class="fr-header">
      <Camera class="w-3.5 h-3.5 fr-icon" />
      <span class="fr-title">{{ 'Frigate 检测' }}</span>
      <button type="button" class="fr-refresh" :disabled="loading" @click="loadEvents">↻</button>
    </div>
    <div class="fr-body">
      <ApiQueryState
        :loading="loading"
        :error="showLoadError ? '请检查网络或后端连接' : ''"
        error-title="Frigate 事件加载失败"
        tone="rose"
        @retry="loadEvents()"
      >
        <div v-if="!hasFrigate && !loading" class="fr-empty">
          <VEmptyState
            compact
            tone="rose"
            icon="📷"
            :title="'未检测到 Frigate 事件'"
            :description="'安装 Frigate 集成后自动显示'"
          />
        </div>
        <div v-else-if="events.length === 0" class="fr-empty">
          <VEmptyState compact tone="neutral" :title="'暂无检测事件'" />
        </div>
        <div v-else class="fr-list">
          <div v-for="ev in events" :key="ev.id" class="fr-item">
            <img v-if="ev.snapshotUrl" :src="ev.snapshotUrl" class="fr-thumb" alt="" />
            <div class="fr-item-main">
              <div class="fr-item-top">
                <span class="fr-label">{{ ev.label }}</span>
                <span class="fr-score" :class="ev.score > 80 ? 'fr-score-high' : 'fr-score-mid'"
                  >{{ ev.score }}%</span
                >
              </div>
              <div class="fr-item-bottom">
                <span class="fr-time">{{ ev.time }}</span>
                <span class="fr-cam">{{ ev.camera }}</span>
              </div>
            </div>
            <button type="button" class="fr-ack" :disabled="acking" @click="ackEvent(ev.id)">
              {{ '确认' }}
            </button>
          </div>
        </div>
      </ApiQueryState>
    </div>
  </div>
</template>

<script setup>
/**
 * @file FrigateEvents.vue
 * @module widgets/security
 * @description Frigate 摄像头事件面板：拉取最近 Frigate 事件（人/车/动物等检测），
 *              展示缩略图、时间与确认状态，支持批量确认；按 30 秒轮询刷新。
 * @dependencies
 *  - vue: computed/ref/onMounted 响应式与生命周期
 *  - @/components/common/ApiQueryState.vue: 查询状态容器
 *  - @/composables/widget/useScheduledPoll: 定时轮询
 *  - @lucide/vue: Camera 图标
 *  - @/stores/entities.store: 实体状态（摄像头域索引）
 *  - @/utils/format/locale-format.util: 本地时间格式化
 *  - @/services/api/security: Frigate 事件接口
 *  - @/services/notify: 错误通知
 *  - @/stores/layout.store: 布局配置
 *  - @/utils/ha/media-url.util: HA 实体图片 URL 解析
 *  - @/utils/entity/derived.util: 域索引工具
 */
import { computed, ref, onMounted } from 'vue'
import ApiQueryState from '@/components/common/ApiQueryState.vue'
import { useScheduledPoll } from '@/composables/widget/useScheduledPoll'
import { Camera } from '@lucide/vue'
import { useEntitiesStore } from '@/stores/entities.store'
import { formatLocaleTime, formatShortDateTimeOrDash } from '@/utils/format/locale-format.util'
import { fetchFrigateEvents, ackFrigateEvents } from '@/services/api/security'
import { notifyError } from '@/services/notify'
import { useLayoutStore } from '@/stores/layout.store'
import { resolveHaEntityPicture } from '@/utils/ha/media-url.util'
import { domainIndexToArray } from '@/utils/entity/derived.util'

defineProps({
  embedded: { type: Boolean, default: false },
})

const entitiesStore = useEntitiesStore()
const layoutStore = useLayoutStore()
const apiEvents = ref([])
const loading = ref(true)
const acking = ref(false)
const loadError = ref(false)
const dismissedEntityIds = ref(new Set())


async function loadEvents(opts = {}) {
  const { quiet = false } = opts
  loading.value = true
  loadError.value = false
  try {
    const { data } = await fetchFrigateEvents()
    const list = Array.isArray(data) ? data : data?.events || []
    apiEvents.value = list.map((e, i) => ({
      id: e.id || `api-${i}`,
      label: e.label || e.object || '检测',
      score: Math.round(Number(e.score || e.top_score || 0)),
      time: formatShortDateTimeOrDash(e.timestamp || e.time || e.start_time),
      camera: e.camera || e.camera_name || '',
      snapshotUrl: resolveHaEntityPicture(
        layoutStore.layoutConfig?.haConfig?.url,
        e.snapshotUrl || e.snapshot_url || null,
      ),
    }))
  } catch (e) {
    apiEvents.value = []
    loadError.value = true
    if (quiet) notifyError(e, '加载失败', { silent: true })
    else notifyError(e, '加载失败')
  } finally {
    loading.value = false
  }
}

async function ackEvent(id) {
  acking.value = true
  try {
    if (apiEvents.value.length === 0) {
      dismissedEntityIds.value = new Set([...dismissedEntityIds.value, id])
      return
    }
    await ackFrigateEvents([id])
    apiEvents.value = apiEvents.value.filter((e) => e.id !== id)
  } catch (e) {
    notifyError(e, '操作失败')
  } finally {
    acking.value = false
  }
}

onMounted(() => loadEvents({ quiet: true }))
useScheduledPoll(() => loadEvents({ quiet: true }), 60_000, {
  key: 'widget:FrigateEvents',
  immediate: false,
})

const entityEvents = computed(() => {
  void entitiesStore.derivedEpoch
  void entitiesStore.getDomainEpoch('binary_sensor')
  const list = []
  for (const key of domainIndexToArray(entitiesStore.domainEntityIndex.get('binary_sensor'))) {
    const e = entitiesStore.entities[key]
    if (!e) continue
    const id = key.toLowerCase()
    if (!id.includes('frigate')) continue
    if (e.state !== 'on') continue
    if (dismissedEntityIds.value.has(key)) continue
    const parts = key.split('.')[1].split('_')
    list.push({
      id: key,
      label: parts[parts.length - 1] || 'motion',
      score: 85,
      time: e.last_changed
        ? formatLocaleTime(e.last_changed, { hour: '2-digit', minute: '2-digit' })
        : '',
      camera: parts.slice(0, -1).join('_') || 'cam',
      snapshotUrl: null,
    })
  }
  return list.slice(0, 20)
})

const events = computed(() => (apiEvents.value.length ? apiEvents.value : entityEvents.value))
// API 失败且无实体事件兜底时，显示「加载失败」而非误导性的「未检测到 Frigate」
const showLoadError = computed(() => loadError.value && entityEvents.value.length === 0)
const hasFrigate = computed(() => apiEvents.value.length > 0 || entityEvents.value.length > 0)
</script>

<style scoped src="./styles/FrigateEvents.css"></style>
