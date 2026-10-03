<template>
  <div class="eh-overview">
    <template v-if="iaqResult">
      <div class="eh-bento">
        <!-- 左侧主舞台：健康分 -->
        <div class="eh-stage" :style="{ '--eh-ring': healthColor }">
          <div class="eh-stage__glow" aria-hidden="true" />
          <div class="eh-stage__ring">
            <svg viewBox="0 0 100 100" class="eh-ring-svg" aria-hidden="true">
              <defs>
                <linearGradient :id="gradId" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" :stop-color="healthColor" stop-opacity="1" />
                  <stop offset="100%" :stop-color="healthColor" stop-opacity="0.5" />
                </linearGradient>
              </defs>
              <circle
                cx="50"
                cy="50"
                r="38"
                fill="none"
                stroke="rgba(255,255,255,0.06)"
                stroke-width="6"
              />
              <circle
                cx="50"
                cy="50"
                r="38"
                fill="none"
                :stroke="`url(#${gradId})`"
                stroke-width="6"
                stroke-linecap="round"
                :stroke-dasharray="239"
                :stroke-dashoffset="ringOffset"
                transform="rotate(-90, 50, 50)"
                class="eh-ring-progress"
              />
            </svg>
            <div class="eh-stage__text">
              <span class="eh-stage__num" :style="{ color: healthColor }">{{ healthScore }}</span>
              <span class="eh-stage__label">{{ '健康分' }}</span>
            </div>
          </div>
          <span
            class="eh-stage__badge"
            :style="{
              color: healthColor,
              background: `color-mix(in srgb, ${healthColor || '#fda4af'} 18%, transparent)`,
              borderColor: `color-mix(in srgb, ${healthColor || '#fda4af'} 32%, transparent)`,
            }"
          >
            {{ healthLabel }}
          </span>
          <p v-if="heroHint" class="eh-stage__hint">{{ heroHint }}</p>
          <div class="eh-stage__pollution">
            <span>{{ '污染指数' }}</span>
            <strong :style="{ color: iaqColor }">{{ iaqScore }}</strong>
            <div class="eh-stage__pollution-track">
              <i :style="{ width: `${Math.min(100, Number(iaqScore) || 0)}%`, background: iaqColor }" />
            </div>
          </div>
        </div>

        <!-- 右侧：5 指标 + 分项差度 -->
        <div class="eh-bento__side">
          <div class="eh-metric-grid">
            <div
              v-for="item in allMetrics"
              :key="item.label"
              :class="[
                'eh-tile',
                item.empty && 'eh-tile--empty',
                !item.empty && item.warn && 'eh-tile--warn',
              ]"
            >
              <span class="eh-tile__label">{{ item.label }}</span>
              <div class="eh-tile__main">
                <span class="eh-tile__val">{{ item.empty ? '—' : item.valueNum }}</span>
                <span v-if="!item.empty && item.unit" class="eh-tile__unit">{{ item.unit }}</span>
              </div>
              <div class="eh-tile__bar">
                <i
                  :style="{
                    width: `${metricBarPct(item)}%`,
                    opacity: item.empty ? 0.2 : 1,
                  }"
                />
              </div>
            </div>
          </div>

          <div v-if="scoreBreakdown.length" class="eh-breakdown">
            <div class="eh-breakdown__head">
              <span class="eh-breakdown__title">{{ '差度构成' }}</span>
              <span class="eh-breakdown__hint">{{ '0 优 · 100 差（非传感器读数）' }}</span>
            </div>
            <div class="eh-breakdown__rows">
              <div v-for="row in scoreBreakdown" :key="row.label" class="eh-breakdown__row">
                <span class="eh-breakdown__label">
                  {{ row.label }}
                  <small v-if="row.reading">{{ row.reading }}</small>
                </span>
                <div class="eh-breakdown__track">
                  <i :style="{ width: `${row.pct}%`, background: row.color }" />
                </div>
                <em :style="{ color: row.color }">{{ row.pct }}</em>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div v-if="adviceText" class="eh-advice">
        <Lightbulb class="eh-advice__icon" />
        <p class="eh-advice__text">{{ adviceText }}</p>
      </div>
    </template>

    <VEmptyState v-else compact tone="emerald" :title="'空气质量传感器数据不足'">
      <template #action>
        <RouterLink :to="SETTINGS_ROUTES.envHealth()" class="v-empty__link v-empty__link--success">{{
          '前往环境与健康 · 智能推断'
        }}</RouterLink>
      </template>
    </VEmptyState>

    <div v-if="unconfiguredRooms.length || riskRooms.length" class="eh-foot-row">
      <div v-if="unconfiguredRooms.length" class="eh-unmapped-banner">
        <div class="eh-unmapped-banner__copy">
          <AlertTriangle class="eh-unmapped-banner__icon" />
          <span>{{ `${unconfiguredRooms.length} 个房间未配置传感器` }}</span>
        </div>
        <RouterLink :to="SETTINGS_ROUTES.envHealth()" class="eh-bind-link">{{ '去配置' }}</RouterLink>
      </div>

      <div v-if="riskRooms.length > 0" class="eh-risk-section">
        <div class="eh-risk-title">
          <AlertTriangle class="w-3 h-3 eh-icon-danger" />
          <span>{{ '霉菌风险' }}</span>
        </div>
        <div v-for="room in riskRooms.slice(0, 3)" :key="room.roomId || room.name" class="eh-risk-item">
          <span class="eh-risk-name">{{ room.name }}</span>
          <span :class="['eh-risk-tag', roomTagClass(room.risk)]">{{ riskLabel(room.risk) }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
/**
 * @file EnvironmentHealthOverview.vue
 * @module widgets/climate
 * @description 环境健康总览视图：展示健康分环形进度、空气质量指标明细条与建议文案，
 *              并在数据不足或存在风险房间时提供配置入口与风险提示。
 * @dependencies
 *  - vue: computed 计算属性
 *  - vue-router: RouterLink 路由跳转
 *  - @lucide/vue: AlertTriangle / Lightbulb 图标
 *  - @/components/common/base/VEmptyState.vue: 空态组件
 *  - @/utils/registry/settings-route.util: 设置页路由常量
 *  - @/composables/climate/useEnvironmentHealthPanel: 风险标签与样式工具
 *  - @/utils/climate/env-score.util: 健康分颜色映射
 *  - @/utils/chart/env-energy-hub-charts.util: 指标条百分比计算
 */
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { AlertTriangle, Lightbulb } from '@lucide/vue'
import VEmptyState from '@/components/common/base/VEmptyState.vue'
import { SETTINGS_ROUTES } from '@/utils/registry/settings-route.util'
import { riskLabel, roomTagClass } from '@/composables/climate/useEnvironmentHealthPanel'
import { healthScoreColor } from '@/utils/climate/env-score.util'
import { metricBarPct } from '@/utils/chart/env-energy-hub-charts.util'

const props = defineProps({
  iaqResult: { type: Object, default: null },
  iaqScore: { type: Number, default: 0 },
  iaqColor: { type: String, default: '' },
  healthScore: { type: [Number, String], default: '--' },
  healthColor: { type: String, default: '' },
  healthLabel: { type: String, default: '--' },
  iaqDetailItems: { type: Array, default: () => [] },
  unconfiguredRooms: { type: Array, default: () => [] },
  riskRooms: { type: Array, default: () => [] },
})

const RING = 239
const gradId = `ehGrad-${Math.random().toString(36).slice(2, 8)}`

const ringOffset = computed(() => {
  const score = typeof props.healthScore === 'number' ? props.healthScore : 0
  return RING - (Math.max(0, Math.min(100, score)) / 100) * RING
})

const allMetrics = computed(() => {
  const order = ['PM2.5', 'CO₂', 'TVOC', '温度', '湿度']
  const map = new Map(props.iaqDetailItems.map((i) => [i.label, i]))
  return order.map((label) => map.get(label)).filter(Boolean)
})

const SCORE_LABELS = [
  { key: 'pm25', readingKey: 'pm25', label: 'PM2.5', unit: 'µg/m³', digits: 0 },
  { key: 'co2', readingKey: 'co2', label: 'CO₂', unit: 'ppm', digits: 0 },
  { key: 'tvoc', readingKey: 'tvoc', label: 'TVOC', unit: 'ppb', digits: 0 },
  { key: 'temp', readingKey: 'temperature', label: '温度', unit: '°C', digits: 1 },
  { key: 'humidity', readingKey: 'humidity', label: '湿度', unit: '%', digits: 0 },
]

function formatReading(value, unit, digits) {
  if (value == null || !Number.isFinite(Number(value))) return ''
  const n = Number(value)
  const text = digits > 0 ? n.toFixed(digits) : String(Math.round(n))
  return `${text}${unit}`
}

const scoreBreakdown = computed(() => {
  const scores = props.iaqResult?.scores
  const readings = props.iaqResult?.readings
  if (!scores || typeof scores !== 'object') return []
  return SCORE_LABELS.map(({ key, readingKey, label, unit, digits }) => {
    const raw = scores[key]
    if (raw == null || !Number.isFinite(Number(raw))) return null
    const pct = Math.max(0, Math.min(100, Math.round(Number(raw))))
    const reading = formatReading(readings?.[readingKey], unit, digits)
    return { label, pct, reading, color: healthScoreColor(100 - pct) }
  }).filter(Boolean)
})

const adviceText = computed(() => {
  const list = props.iaqResult?.advice
  if (!Array.isArray(list) || !list.length) return ''
  const filtered = list.filter((a) => a !== '空气质量优秀，无需操作').slice(0, 2)
  return filtered.join('；') || ''
})

const heroHint = computed(() => {
  if (adviceText.value) return ''
  if (typeof props.healthScore !== 'number') return ''
  if (props.healthScore >= 80) return '室内空气状态良好'
  if (props.healthScore >= 60) return '建议留意通风与净化'
  if (props.healthScore >= 40) return '空气偏弱，优先改善主要污染源'
  return '空气较差，建议立即加强通风或净化'
})
</script>

<style scoped src="./styles/climate-hub.css"></style>
