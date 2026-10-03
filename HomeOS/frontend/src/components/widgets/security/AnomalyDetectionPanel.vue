<!--
  AnomalyDetectionPanel.vue / components/widgets/security
  异常活动监测面板：安防 Hub 独立卡片，基于 mmWave 存在与运动传感器，
  展示房间活动时长/静止时长、全屋最近活动、作息基线样本与活跃告警确认。
  Props: embedded 嵌入态时隐藏独立标题头与徽章行
  依赖：services/api/security anomaly/status + baselines + ack 接口；
        composables: useWidgetApiQuery REST 查询包装；
        utils: locale-format.util formatDurationMinutes 分钟格式化；
        lucide: Eye / Clock / AlertTriangle 图标；
        notify 错误通知。
  注意：wholeHouseInactiveMin 全屋静止超阈值显示黄色/红色警示；告警可单条确认。
-->
<template>
  <div class="ad-root">
    <div v-if="!embedded" class="ad-header">
      <div class="ad-header-left">
        <Eye :class="['w-3.5 h-3.5', hasAlerts ? 'ad-icon-alert' : 'ad-icon-ok']" />
        <span class="ad-title">{{ '异常活动监测' }}</span>
      </div>
      <div class="ad-header-right">
        <span v-if="hasAlerts" class="ad-badge ad-badge--alert">{{ `${alertCount} 告警` }}</span>
        <span v-else class="ad-badge ad-badge--ok">{{ '正常' }}</span>
      </div>
    </div>

    <div class="ad-body">
      <ApiQueryState
        :loading="loading"
        :error="loadError"
        tone="rose"
        error-title="异常监测加载失败"
        @retry="query.retry()"
      >
        <template v-if="!loading && !loadError">
          <!-- 房间停留状态 -->
          <div v-if="roomEntries.length > 0" class="ad-section">
            <div class="ad-section-title">{{ '房间活动' }}</div>
            <div v-for="entry in roomEntries" :key="entry.room" class="ad-item">
              <div :class="['ad-dot', entry.alert ? 'ad-dot--alert' : 'ad-dot--ok']" />
              <span class="ad-item-name">{{ entry.label }}</span>
              <div class="ad-item-meta">
                <span class="ad-item-duration">{{ entry.durationStr }}</span>
                <span v-if="entry.inactiveMin > 0" class="ad-item-inactive">{{
                  `静止 ${entry.inactiveMin}分`
                }}</span>
              </div>
            </div>
          </div>

          <!-- 全屋活动状态 -->
          <div class="ad-section" v-if="status.wholeHouseInactiveMin !== undefined">
            <div class="ad-section-title">{{ '全屋活动' }}</div>
            <div :class="['ad-status-line', wholeHouseStatusClass]">
              <Clock class="w-3 h-3" />
              <span>{{ `最近活动: ${wholeHouseAgo}` }}</span>
            </div>
          </div>

          <div v-if="baselineRooms.length > 0" class="ad-section">
            <div class="ad-section-title">{{ '作息基线' }}</div>
            <div v-for="room in baselineRooms.slice(0, 4)" :key="room.name" class="ad-baseline-row">
              <span class="ad-item-name">{{ room.label }}</span>
              <span class="ad-item-duration">{{
                '{n} 时段样本'.replace('{n}', String(room.count))
              }}</span>
            </div>
          </div>

          <!-- 告警列表 -->
          <div v-if="alerts.length > 0" class="ad-section">
            <div class="ad-section-title ad-section-title--alert">{{ '活跃告警' }}</div>
            <div
              v-for="alert in alerts"
              :key="alert.id"
              :class="['ad-alert', alert.level === 'high' ? 'ad-alert--high' : 'ad-alert--medium']"
            >
              <AlertTriangle class="w-3 h-3 shrink-0" />
              <span class="ad-alert-text">{{ alert.message }}</span>
              <button class="ad-ack-btn" :disabled="acking" @click="ackAlert(alert.id)">
                {{ '确认' }}
              </button>
            </div>
          </div>

          <VEmptyState
            v-if="!hasAnyData"
            compact
            tone="rose"
            icon="👁"
            :title="'等待活动数据...'"
            :description="
              baselines == null
                ? '需要 mmWave 或运动传感器；作息基线尚未生成'
                : '需要 mmWave 或运动传感器'
            "
          />
        </template>
      </ApiQueryState>
    </div>
  </div>
</template>

<script setup>
/**
 * 异常活动检测面板
 *
 * 接入后端 AnomalyDetectionService，展示：
 * 1. 各房间当前停留时长
 * 2. 全屋活动状态
 * 3. 异常告警（卫生间停留过久、卧室无活动、深夜活动等）
 *
 * API: GET /api/v1/security/anomaly/status
 */
import { ref, computed } from 'vue'
import { Eye, Clock, AlertTriangle } from '@lucide/vue'
import ApiQueryState from '@/components/common/ApiQueryState.vue'
import {
  fetchAnomalyStatus,
  fetchAnomalyBaselines,
  ackAnomalyEvents,
} from '@/services/api/security'
import { notifyError } from '@/services/notify'
import { useWidgetApiQuery } from '@/composables/api/useWidgetApiQuery'
import { formatDurationMinutes } from '@/utils/format/locale-format.util'

defineProps({
  embedded: { type: Boolean, default: false },
  zones: { type: Array, default: () => [] },
  config: { type: Object, default: () => ({}) },
})

const acking = ref(false)
const status = ref({})
const alerts = ref([])
const baselines = ref(null)

const query = useWidgetApiQuery(
  'anomalyDetection',
  async () => {
    const [data, baselineData] = await Promise.all([
      fetchAnomalyStatus().then((r) => r.data),
      fetchAnomalyBaselines()
        .then((r) => r.data)
        .catch(() => null),
    ])
    status.value = data || {}
    alerts.value = data?.activeAlerts || []
    baselines.value = baselineData
    return {
      data,
      meta: baselineData == null ? { degraded: true, reason: 'baselines_unavailable' } : null,
    }
  },
  30_000,
  { pollKey: 'widget:AnomalyDetectionPanel' },
)

const loading = query.loading
const loadError = query.error
const areaLabels = computed(() => ({
  bedroom: '卧室',
  bathroom: '卫生间',
  kitchen: '厨房',
  living: '客厅',
  study: '书房',
  other: '其他区域',
}))

const roomEntries = computed(() => {
  const stays = status.value?.roomStays || []
  return stays.map((s) => {
    const alert =
      (s.area === 'bathroom' && s.durationMin > 30) ||
      (s.area === 'kitchen' && s.durationMin > 60) ||
      s.inactiveMin > 120
    return {
      ...s,
      label: `${areaLabels.value[s.area] || s.room} (${s.room})`,
      durationStr: formatDurationMinutes(s.durationMin),
      alert,
    }
  })
})

const wholeHouseInactiveMin = computed(() => status.value?.wholeHouseInactiveMin || 0)
const wholeHouseAgo = computed(() => {
  if (!status.value?.lastWholeHouseActivity) return '未知'
  const ago = Math.round(
    (Date.now() - new Date(status.value.lastWholeHouseActivity).getTime()) / 60000,
  )
  return `${formatDurationMinutes(ago)}前`
})
const wholeHouseStatusClass = computed(() => {
  const min = wholeHouseInactiveMin.value
  if (min > 240) return 'ad-status--danger'
  if (min > 120) return 'ad-status--warn'
  return 'ad-status--ok'
})

const hasAlerts = computed(() => alerts.value.length > 0)
const alertCount = computed(() => alerts.value.length)
const hasAnyData = computed(
  () =>
    roomEntries.value.length > 0 ||
    status.value?.lastWholeHouseActivity ||
    baselineRooms.value.length > 0,
)

const baselineRooms = computed(() => {
  const rooms = baselines.value?.rooms || {}
  const labels = areaLabels.value
  return Object.entries(rooms)
    .map(([name, buckets]) => ({
      name,
      label: labels[name] || name,
      count: Array.isArray(buckets) ? buckets.length : 0,
    }))
    .filter((r) => r.count > 0)
})

async function ackAlert(id) {
  acking.value = true
  try {
    await ackAnomalyEvents([id])
    alerts.value = alerts.value.filter((a) => a.id !== id)
  } catch (e) {
    notifyError(e, '操作失败')
  } finally {
    acking.value = false
  }
}
</script>

<style scoped src="./styles/AnomalyDetectionPanel.css"></style>
