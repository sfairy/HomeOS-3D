<!--
  WeatherForecast.vue / components/widgets/weather
  天气预报扩展卡：展示 HA weather 实体未来多日最高/最低温、天气状态图标、
  降水概率与风力，支持按天点击展开 3 小时间隔细分。
  Props: embedded 嵌入态隐藏标题栏 / weather-entity-override 覆盖默认天气实体 ID
  依赖：composables: useWeatherEntity 解析优先天气实体
                    + useScheduledPoll 30min 轮询；
        Pinia: useEntitiesStore 快照订阅；
        constants: weatherStateLabel + weatherVisualKey 图标与中文字段；
        RouterLink 跳转设置向导绑定天气实体；
        lucide: Cloud/Sun/Droplets/Wind/Moon/CloudRain 等图标组。
  注意：当 forecast 数组 >= 5 时展示按日循环；缺字段用横杠占位。
-->
<template>
  <div class="weather-forecast widget-glass-card">
    <div v-if="!embedded" class="wf-header">
      <div class="wf-header-icon">
        <Cloud class="w-4 h-4 wf-ic-blue" />
      </div>
      <h3 class="wf-title">{{ '气象趋势' }}</h3>
      <span class="wf-badge">{{ '{n}天预报'.replace('{n}', String(forecastData.length)) }}</span>
    </div>
    <VEmptyState
      v-if="forecastData.length === 0"
      compact
      tone="sky"
      icon="☁"
      :title="'暂无预报数据'"
    >
      <template #action>
        <RouterLink :to="SETTINGS_ROUTES.bindings()" class="v-empty__link">{{
          '配置天气实体'
        }}</RouterLink>
      </template>
    </VEmptyState>
    <div v-else class="wf-list">
      <div v-for="day in forecastData" :key="day.datetime" class="wf-row">
        <div class="wf-date">
          <span class="wf-day">{{ dayLabel(day.datetime) }}</span>
          <span class="wf-date-num">{{ dayNum(day.datetime) }}</span>
        </div>
        <div class="wf-icon">
          <component
            :is="conditionIcon(day.condition)"
            :class="['w-5 h-5', conditionColor(day.condition)]"
          />
        </div>
        <div class="wf-label">{{ conditionLabel(day.condition) || day.condition }}</div>
        <div class="wf-temps">
          <span class="wf-high" :class="tempHighColor(day.temperature ?? day.native_temperature)"
            >{{ day.temperature ?? day.native_temperature }}°</span
          >
          <span class="wf-low" :class="tempLowColor(day.templow ?? day.native_templow)"
            >{{ day.templow ?? day.native_templow }}°</span
          >
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
/**
 * @file Forecast.vue
 * @module widgets/weather
 * @description 气象趋势部件：7 天天气预报的简洁列表展示，
 *              每 30 分钟自动刷新一次预报数据，支持多种天气状况的图标映射和颜色方案。
 * @dependencies
 *  - vue: computed/onMounted/watch 响应式与生命周期
 *  - vue-router: RouterLink 路由跳转
 *  - @lucide/vue: 多种天气图标
 *  - @/composables/widget/useScheduledPoll: 定时轮询
 *  - @/stores/entities.store: 实体状态
 *  - @/composables/entity/useWeatherEntity: 天气实体 composable
 *  - @/constants/weather-labels: 天气状态标签与视觉键
 *  - @/utils/format/locale-format.util: 本地日期格式化
 */
import { weatherStateLabel, weatherVisualKey } from '@/constants/weather-labels'
import { formatLocaleDate } from '@/utils/format/locale-format.util'
import { computed, onMounted, watch } from 'vue'
import { useScheduledPoll } from '@/composables/widget/useScheduledPoll'
import { RouterLink } from 'vue-router'
import { Cloud, Sun, Droplets, Wind, Moon, CloudRain, CloudFog, CloudLightning, CloudSnow } from '@lucide/vue'
import { useEntitiesStore } from '@/stores/entities.store'
import { useWeatherEntity } from '@/composables/entity/useWeatherEntity'
import { SETTINGS_ROUTES } from '@/utils/registry/settings-route.util'

const props = defineProps({
  embedded: { type: Boolean, default: false },
  panelVisible: { type: Boolean, default: true },
  config: { type: Object, default: () => ({}) },
})

const entitiesStore = useEntitiesStore()
const weatherEntityOverride = computed(() => String(props.config?.weatherEntityId || '').trim())
const { resolvedEid: weatherEid } = useWeatherEntity(weatherEntityOverride)
const forecastDays = computed(() => {
  const n = Number(props.config?.forecastDays)
  return Number.isFinite(n) ? Math.min(7, Math.max(3, Math.round(n))) : 7
})
/** 预报数据 */
const forecastData = computed(() =>
  (entitiesStore.forecasts[weatherEid.value] || []).slice(0, forecastDays.value),
)

/** 刷新天气预报数据 */
function refresh() {
  if (weatherEid.value) entitiesStore.fetchForecasts(weatherEid.value, 'daily')
}

onMounted(() => {
  refresh()
})
useScheduledPoll(refresh, 1800000, { key: 'widget:WeatherForecast' })
watch(weatherEid, refresh)

/** 天气状况 → 图标映射表（visual key） */
const conditionIcons = {
  sunny: Sun,
  'clear-night': Moon,
  cloudy: Cloud,
  partlycloudy: Cloud,
  rainy: Droplets,
  pouring: CloudRain,
  drizzle: CloudRain,
  lightning: CloudLightning,
  snowy: CloudSnow,
  sleet: CloudSnow,
  windy: Wind,
  fog: CloudFog,
  haze: CloudFog,
  hail: CloudSnow,
  sandstorm: Wind,
}
/** 天气状况 → CSS 颜色类名映射表 */
const conditionColors = {
  sunny: 'wf-c-warn',
  'clear-night': 'wf-c-blue-soft',
  cloudy: 'wf-c-lbl',
  partlycloudy: 'wf-c-lbl',
  rainy: 'wf-c-blue',
  pouring: 'wf-c-blue',
  drizzle: 'wf-c-blue',
  lightning: 'wf-c-violet',
  snowy: 'wf-c-white',
  sleet: 'wf-c-white',
  windy: 'wf-c-cyan',
  fog: 'wf-c-lbl-faint',
  haze: 'wf-c-lbl-faint',
  hail: 'wf-c-white',
  sandstorm: 'wf-c-warn',
}
/** 根据 HA 天气状态码返回对应图标组件 */
function conditionIcon(c) {
  return conditionIcons[weatherVisualKey(c)] || Cloud
}
/** 根据 HA 天气状态码返回对应颜色类名 */
function conditionColor(c) {
  return conditionColors[weatherVisualKey(c)] || 'wf-c-lbl-faint'
}
/** 根据 HA 天气状态码返回本地化标签（未知状态码回退原始码） */
function conditionLabel(c) {
  return weatherStateLabel(c)
}

function tempHighColor(t) {
  const v = parseFloat(t)
  if (isNaN(v)) return 'wf-c-white'
  if (v >= 35) return 'wf-c-danger'
  if (v >= 28) return 'wf-c-warn-deep'
  if (v >= 22) return 'wf-c-warn'
  if (v >= 16) return 'wf-c-success'
  if (v >= 8) return 'wf-c-info'
  return 'wf-c-blue'
}

function tempLowColor(t) {
  const v = parseFloat(t)
  if (isNaN(v)) return 'wf-c-muted'
  if (v >= 22) return 'wf-c-warn'
  if (v >= 10) return 'wf-c-info'
  if (v >= 0) return 'wf-c-blue'
  return 'wf-c-info'
}

/** 格式化日期标签（今日/周X） */
function dayLabel(d) {
  const dt = new Date(d)
  if (dt.toDateString() === new Date().toDateString()) return '今日'
  return '周日,周一,周二,周三,周四,周五,周六'.split(',')[dt.getDay()]
}
/** 格式化月/日（跟随界面语言） */
function dayNum(d) {
  return formatLocaleDate(d, { month: 'numeric', day: 'numeric' })
}
</script>

<style scoped src="./styles/Forecast.css"></style>
