<!--
  @file DeviceHealthScore.vue
  @module 设备详情/健康评分卡片
  @description 设备详情页健康评分：左侧评分面板 + 右侧因子明细/元信息 + 底部状态建议。
               基于连接、电量、活跃度、功能支持等维度计算 0-100 分；被动域不参与活跃度评分。
  @dependencies vue、@homeos/shared、@lucide/vue、entities.store。
-->
<template>
  <div
    class="device-health dev-card premium-glass-surface premium-glass-surface--elevated premium-backdrop"
  >
    <div class="dev-card__header">
      <div class="dev-card__title-row">
        <Heart class="w-4 h-4" :class="scoreColor" />
        <span class="dev-card__title">{{ '设备健康' }}</span>
        <span class="device-health__header-badge" :class="scoreColor">{{ scoreDescription }}</span>
      </div>
      <button
        type="button"
        class="dev-btn-refresh"
        :disabled="loading"
        :aria-label="'刷新'"
        @click="refreshData"
      >
        <RefreshCw :class="['w-3 h-3', loading && 'animate-spin']" />
      </button>
    </div>

    <div v-if="loading" class="dev-state-block">
      <RefreshCw class="w-4 h-4 animate-spin" />
      <span>{{ '评估中…' }}</span>
    </div>

    <div v-else class="device-health__body">
      <div class="device-health__main">
        <section class="device-health__score-panel" aria-label="健康评分">
          <div class="device-health__score-glow" :class="scoreTone" aria-hidden="true" />
          <div class="device-health__score-ring">
            <div class="device-health__score-ring-bg"></div>
            <div class="device-health__score-ring-fill" :style="ringStyle"></div>
            <div class="device-health__score-inner">
              <span class="device-health__score-value" :class="scoreColor">{{ healthScore }}</span>
              <span class="device-health__score-label">{{ '健康分' }}</span>
            </div>
          </div>
          <p class="device-health__score-hint">{{ gradeHint }}</p>
        </section>

        <section class="device-health__detail" aria-label="健康明细">
          <div class="device-health__detail-head">
            <span>{{ '评分维度' }}</span>
            <span class="device-health__detail-count">{{ healthFactors.length }} {{ '项' }}</span>
          </div>

          <div class="device-health__factors">
            <div
              v-for="factor in healthFactors"
              :key="factor.key"
              class="device-health__factor"
              :class="factor.toneClass"
              :title="factor.note"
            >
              <div class="device-health__factor-icon-wrap">
                <component :is="factor.icon" class="w-3.5 h-3.5" />
              </div>
              <div class="device-health__factor-main">
                <div class="device-health__factor-row">
                  <span class="device-health__factor-name">{{ factor.label }}</span>
                  <span class="device-health__factor-score">{{ factor.score }}</span>
                </div>
                <div class="device-health__factor-bar-wrap">
                  <div
                    class="device-health__factor-bar"
                    :style="{ width: `${factor.score}%` }"
                  />
                </div>
              </div>
            </div>
          </div>

          <dl class="device-health__meta">
            <div v-for="row in metaRows" :key="row.key" class="device-health__meta-row">
              <dt>{{ row.label }}</dt>
              <dd>{{ row.value }}</dd>
            </div>
          </dl>
        </section>
      </div>

      <section
        v-if="suggestions.length"
        :class="[
          'device-health__tip',
          isHealthySuggestion ? 'device-health__tip--ok' : 'device-health__tip--warn',
        ]"
        :aria-label="isHealthySuggestion ? '运行状态' : '优化建议'"
      >
        <Lightbulb class="w-3.5 h-3.5 device-health__tip-icon" />
        <div class="device-health__tip-body">
          <span v-if="!isHealthySuggestion" class="device-health__tip-title">{{ '优化建议' }}</span>
          <p v-for="(suggestion, idx) in suggestions" :key="idx" class="device-health__tip-text">
            <span v-if="suggestions.length > 1" class="device-health__tip-index">{{ idx + 1 }}.</span>
            {{ suggestion }}
          </p>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { formatRelativeFromNow } from '@/utils/format/locale-format.util'
import { ref, computed, onMounted, type Component } from 'vue'
import { getEntityDomain } from '@homeos/shared'
import {
  Heart,
  RefreshCw,
  Lightbulb,
  Wifi,
  Battery,
  Clock,
  Activity,
  AlertTriangle,
} from '@lucide/vue'
import { useEntitiesStore } from '@/stores/entities.store'

const PASSIVE_DOMAINS = new Set([
  'sensor',
  'binary_sensor',
  'device_tracker',
  'weather',
  'sun',
  'zone',
  'image',
  'event',
])

type FactorTone = 'good' | 'warn' | 'bad' | 'info'

type HealthFactor = {
  key: string
  label: string
  note: string
  icon: Component
  score: number
  toneClass: string
}

const props = defineProps({
  entityId: { type: String, required: true },
})

const entitiesStore = useEntitiesStore()
const loading = ref(false)

function toneClass(tone: FactorTone): string {
  return `device-health__factor--${tone}`
}

const entity = computed(() => entitiesStore.entities[props.entityId] ?? null)

const healthScore = computed(() => {
  const e = entity.value
  if (!e) return 0

  let score = 100
  if (e.state === 'unavailable' || e.state === 'unknown') score -= 40

  const batteryLevel = e.attributes?.battery_level
  if (typeof batteryLevel === 'number') {
    if (batteryLevel <= 10) score -= 30
    else if (batteryLevel <= 20) score -= 15
    else if (batteryLevel <= 40) score -= 5
  }

  const domain = getEntityDomain(props.entityId)
  const trackActivity = !PASSIVE_DOMAINS.has(domain)
  if (trackActivity && e.last_changed) {
    const hours = (Date.now() - new Date(e.last_changed).getTime()) / 3600000
    if (hours > 72) score -= 15
    else if (hours > 24) score -= 5
  }

  if (e.attributes?.battery && typeof batteryLevel !== 'number') score -= 10
  return Math.max(0, Math.round(score))
})

const scoreColor = computed(() => {
  if (healthScore.value >= 80) return 'dhs-c-success'
  if (healthScore.value >= 60) return 'dhs-c-warn'
  return 'dhs-c-danger'
})

const scoreTone = computed(() => {
  if (healthScore.value >= 80) return 'device-health__score-glow--ok'
  if (healthScore.value >= 60) return 'device-health__score-glow--warn'
  return 'device-health__score-glow--bad'
})

const scoreDescription = computed(() => {
  if (healthScore.value >= 90) return '极佳'
  if (healthScore.value >= 80) return '良好'
  if (healthScore.value >= 60) return '一般'
  if (healthScore.value >= 40) return '较差'
  return '危险'
})

const gradeHint = computed(() => {
  if (healthScore.value >= 90) return '各维度运行正常，无需干预'
  if (healthScore.value >= 80) return '整体健康，可关注个别波动'
  if (healthScore.value >= 60) return '存在隐患，建议尽快排查'
  if (healthScore.value >= 40) return '健康度偏低，优先处理告警项'
  return '设备异常风险较高，请立即检查'
})

const ringStyle = computed(() => {
  const deg = (healthScore.value / 100) * 360
  const color =
    healthScore.value >= 80 ? '#34d399' : healthScore.value >= 60 ? '#fbbf24' : '#f87171'
  return {
    background: `conic-gradient(${color} 0deg, ${color} ${deg}deg, transparent ${deg}deg)`,
  }
})

const healthFactors = computed((): HealthFactor[] => {
  const e = entity.value
  if (!e) return []

  const factors: HealthFactor[] = []
  const isOnline = e.state !== 'unavailable' && e.state !== 'unknown'
  factors.push({
    key: 'connectivity',
    label: '连接状态',
    note: isOnline ? '设备在线，链路正常' : '离线或状态未知',
    icon: isOnline ? Wifi : AlertTriangle,
    score: isOnline ? 100 : 0,
    toneClass: toneClass(isOnline ? 'good' : 'bad'),
  })

  const batteryLevel = e.attributes?.battery_level
  const isBatteryPowered = e.attributes?.battery
  if (isBatteryPowered || typeof batteryLevel === 'number') {
    const batteryScore =
      typeof batteryLevel === 'number'
        ? batteryLevel <= 10
          ? 20
          : batteryLevel <= 20
            ? 50
            : batteryLevel <= 40
              ? 80
              : 100
        : 50
    const tone: FactorTone =
      batteryScore >= 80 ? 'good' : batteryScore >= 50 ? 'warn' : 'bad'
    factors.push({
      key: 'battery',
      label: '电量',
      note:
        typeof batteryLevel === 'number'
          ? `当前电量 ${batteryLevel}%`
          : '已识别电池供电，但缺少电量读数',
      icon: Battery,
      score: batteryScore,
      toneClass: toneClass(tone),
    })
  }

  const domain = getEntityDomain(props.entityId)
  const trackActivity = !PASSIVE_DOMAINS.has(domain)
  if (trackActivity && e.last_changed) {
    const hours = (Date.now() - new Date(e.last_changed).getTime()) / 3600000
    let activityScore = 100
    if (hours > 72) activityScore = 30
    else if (hours > 24) activityScore = 70
    else if (hours > 12) activityScore = 90
    const tone: FactorTone =
      activityScore >= 90 ? 'good' : activityScore >= 70 ? 'warn' : 'bad'
    factors.push({
      key: 'activity',
      label: '活跃状态',
      note: `最近状态变更 ${formatRelativeFromNow(e.last_changed)}`,
      icon: Clock,
      score: activityScore,
      toneClass: toneClass(tone),
    })
  }

  if (e.attributes?.supported_features != null) {
    factors.push({
      key: 'features',
      label: '功能支持',
      note: '已上报 supported_features',
      icon: Activity,
      score: 100,
      toneClass: toneClass('info'),
    })
  }

  return factors
})

const metaRows = computed(() => {
  const e = entity.value
  const domain = getEntityDomain(props.entityId)
  const rows = [
    {
      key: 'updated',
      label: '状态更新',
      value: formatRelativeFromNow(e?.last_updated || e?.last_changed),
    },
    {
      key: 'domain',
      label: '评估域',
      value: domain || '—',
    },
    {
      key: 'mode',
      label: '活跃评估',
      value: PASSIVE_DOMAINS.has(domain) ? '被动域 · 已跳过' : '已纳入评分',
    },
  ]
  return rows
})

const suggestions = computed(() => {
  const e = entity.value
  if (!e) return []

  const list: string[] = []
  if (e.state === 'unavailable' || e.state === 'unknown') {
    list.push('设备离线，请检查网络连接或设备电源')
  }

  const batteryLevel = e.attributes?.battery_level
  if (typeof batteryLevel === 'number') {
    if (batteryLevel <= 10) {
      list.push(`电量极低 (${batteryLevel}%)，请立即充电或更换电池`)
    } else if (batteryLevel <= 20) {
      list.push(`电量偏低 (${batteryLevel}%)，建议尽快充电`)
    }
  }

  const domain = getEntityDomain(props.entityId)
  if (!PASSIVE_DOMAINS.has(domain) && e.last_changed) {
    const hours = (Date.now() - new Date(e.last_changed).getTime()) / 3600000
    if (hours > 72) {
      list.push('设备长时间未更新状态，请检查设备是否正常工作')
    }
  }

  if (e.attributes?.battery && typeof batteryLevel !== 'number') {
    list.push('无法获取电池电量信息，请检查设备驱动配置')
  }

  if (!list.length) list.push('设备运行状态良好，继续保持')
  return list
})

const isHealthySuggestion = computed(
  () => suggestions.value.length === 1 && suggestions.value[0] === '设备运行状态良好，继续保持',
)

function refreshData() {
  void (async () => {
    loading.value = true
    try {
      await entitiesStore.ensureEntity(props.entityId)
    } finally {
      loading.value = false
    }
  })()
}

onMounted(() => {
  refreshData()
})
</script>

<style scoped src="./styles/DeviceHealthScore.css"></style>
