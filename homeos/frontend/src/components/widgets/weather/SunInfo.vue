<template>
  <div class="sun-card widget-glass-card" :class="{ 'sun-card--embedded': embedded }">
    <!-- 顶部：日出日落标题与白昼时长（非 embedded 时显示） -->
    <div v-if="!embedded" class="sun-top">
      <div class="sun-icon-wrap">
        <Sunrise class="w-5 h-5 sun-icon" />
      </div>
      <div class="sun-info">
        <span class="sun-label">{{ '日出日落' }}</span>
        <span class="sun-duration">{{ daylightDuration }}</span>
      </div>
    </div>
    <!-- 日出日落进度条区域 -->
    <div class="sun-bar-wrap">
      <!-- Hub 嵌入：相位 + 白昼时长 -->
      <div v-if="embedded" class="sun-embedded-meta">
        <span
          :class="['sun-phase-pill', isDay ? 'sun-phase-pill--day' : 'sun-phase-pill--night']"
        >
          {{ isDay ? '白昼' : '夜间' }}
        </span>
        <div class="sun-embedded-meta__right">
          <span v-if="daylightDuration" class="sun-duration sun-duration--embedded">{{
            daylightDuration
          }}</span>
          <span v-if="sunCountdown" class="sun-countdown">{{ sunCountdown }}</span>
        </div>
      </div>
      <!-- 日轨进度条：太阳标记位置随当前时间在日出-日落区间内移动 -->
      <div class="sun-bar">
        <div class="sun-track" />
        <div
          class="sun-marker"
          :class="{ 'sun-marker--night': !isDay }"
          :style="{ left: sunPosition + '%' }"
        >
          {{ isDay ? '☀️' : '🌙' }}
        </div>
      </div>
      <!-- 日出/日落时间 -->
      <div class="sun-times">
        <div class="sun-time-col">
          <span class="sun-time">{{ sunriseTime }}</span>
          <span class="sun-time-label">{{ '日出' }}</span>
        </div>
        <div v-if="embedded" class="sun-time-col sun-time-col--center">
          <span class="sun-time sun-time--now">{{ currentTime }}</span>
          <span class="sun-time-label">{{ '现在' }}</span>
        </div>
        <div class="sun-time-col sun-time-col--end">
          <span class="sun-time">{{ sunsetTime }}</span>
          <span class="sun-time-label">{{ '日落' }}</span>
        </div>
      </div>
    </div>

    <!-- 在家成员区域（受 Hub 配置开关控制） -->
    <div v-if="showPresence" class="sun-presence">
      <div class="sun-presence-head">
        <div class="sun-presence-head__main">
          <span class="sun-presence-title">{{ '在家成员' }}</span>
          <span
            v-if="!presenceLoading && displayMembers.length"
            :class="['sun-presence-summary', atHomeCount > 0 && 'sun-presence-summary--home']"
          >
            {{ presenceSummaryText }}
          </span>
        </div>
        <span v-if="presenceAutoMode && !embedded" class="sun-presence-mode">{{
          '自动跟踪'
        }}</span>
      </div>
      <div v-if="presenceLoading" class="sun-presence-empty">{{ '加载人员状态…' }}</div>
      <!-- 成员列表（按在家状态排序，在家的排在前） -->
      <div
        v-else-if="sortedMembers.length"
        class="sun-persons custom-scrollbar"
        role="list"
        :aria-label="'在家成员列表'"
      >
        <div
          v-for="(p, idx) in sortedMembers"
          :key="p.id"
          role="listitem"
          :class="['sun-person', p.atHome && 'sun-person--home']"
        >
          <span :class="['sun-person-avatar', `sun-person-avatar--tone-${idx % 5}`]">
            {{ personInitial(p.name) }}
          </span>
          <div class="sun-person-body">
            <span class="sun-person-name">{{ p.name }}</span>
            <span :class="['sun-person-status', p.atHome && 'sun-person-status--home']">
              {{ p.atHome ? '在家' : '离家' }}
            </span>
          </div>
        </div>
      </div>
      <p v-else class="sun-presence-empty">
        {{
          embedded
            ? embeddedPresenceEmptyText
            : presenceAutoMode
              ? '当前为实体自动跟踪，建议在设置 → 安防联动中配置具体人员'
              : '暂无人员数据'
        }}
      </p>
    </div>
  </div>
</template>

<script setup>
/**
 * 日出日落与在家成员部件
 * 展示当日日出/日落时间、白昼时长及太阳在日轨上的进度；
 * 可选展示「在家成员」列表（由 Hub 配置 showPresence 控制）。
 */
import { computed } from 'vue'
import { Sunrise } from '@lucide/vue'
import { useEntitiesStore } from '@/stores/entities.store'
import { formatLocaleTime } from '@/utils/format/locale-format.util'
import {
  computeSunProgress,
  formatDaylightDuration,
  formatSunCountdown,
  resolveSunriseSunset,
} from '@/utils/weather/sun-times.util'
import { filterPresenceMembers, usePresenceHome } from '@/composables/presence/usePresenceHome'
import { normalizeWeatherHubConfig } from '@/utils/registry/weather-hub-options'

/**
 * 组件 Props
 * @property {boolean} embedded - 是否嵌入式渲染（无外层标题）
 * @property {Object} config - Hub 配置对象（含 showPresence、presencePersonIds 等）
 */
const props = defineProps({
  embedded: { type: Boolean, default: false },
  config: { type: Object, default: () => ({}) },
})

/** 归一化后的 Hub 配置（补充默认值） */
const hubConfig = computed(() => normalizeWeatherHubConfig(props.config))
/** 是否展示「在家成员」区域（默认展示） */
const showPresence = computed(() => hubConfig.value.showPresence !== false)

/** 实体仓库（用于读取 sun.sun 实体） */
const entitiesStore = useEntitiesStore()
/** 在家成员状态 composable */
const {
  loading: presenceLoading,
  members: presenceMembers,
  autoMode: presenceAutoMode,
} = usePresenceHome()

/**
 * sun.sun 实体。
 * 通过 getDomainEpoch 显式建立对 sun 域的响应式依赖，
 * 确保实体属性更新时相关 computed 重新计算。
 */
const sunEntity = computed(() => {
  void entitiesStore.getDomainEpoch('sun')
  return entitiesStore.entities['sun.sun']
})

/** 从 sun 实体属性解析出的日出/日落时间 */
const sunTimes = computed(() => resolveSunriseSunset(sunEntity.value?.attributes))

/** 当前是否为白昼（太阳在地平线以上） */
const isDay = computed(() => sunEntity.value?.state === 'above_horizon')

/** 日出时间字符串（HH:mm） */
const sunriseTime = computed(() => formatSunTime(sunTimes.value.sunrise))
/** 日落时间字符串（HH:mm） */
const sunsetTime = computed(() => formatSunTime(sunTimes.value.sunset))

/** 白昼时长描述（如「12小时30分」） */
const daylightDuration = computed(() =>
  formatDaylightDuration(sunTimes.value.sunrise, sunTimes.value.sunset),
)

/** 太阳在日轨上的进度百分比（0-100） */
const sunPosition = computed(() =>
  computeSunProgress(sunTimes.value.sunrise, sunTimes.value.sunset),
)

/** 当前时间（HH:mm） */
const currentTime = computed(() =>
  formatLocaleTime(new Date(), { hour: '2-digit', minute: '2-digit', hour12: false }),
)

/** 距下一次日出/日落倒计时 */
const sunCountdown = computed(() =>
  formatSunCountdown(sunEntity.value?.attributes, isDay.value),
)

/** 按 Hub 配置过滤后的在家成员列表 */
const displayMembers = computed(() =>
  filterPresenceMembers(presenceMembers.value, hubConfig.value.presencePersonIds),
)

/** 在家优先、同状态按姓名排序的成员列表 */
const sortedMembers = computed(() =>
  [...displayMembers.value].sort((a, b) => {
    if (a.atHome !== b.atHome) return a.atHome ? -1 : 1
    return String(a.name || '').localeCompare(String(b.name || ''), 'zh-CN')
  }),
)

/** 当前在家人数 */
const atHomeCount = computed(() => displayMembers.value.filter((m) => m.atHome).length)

/** 在家成员摘要文案（如「2/3 在家」） */
const presenceSummaryText = computed(() => {
  const total = displayMembers.value.length
  if (!total) return ''
  if (atHomeCount.value <= 0) {
    return props.embedded ? '无人在家' : `共 ${total} 位 · 无人在家`
  }
  if (atHomeCount.value === total) {
    return props.embedded ? '全部在家' : `共 ${total} 位 · 全部在家`
  }
  return `${atHomeCount.value}/${total} 在家`
})

/** Hub 嵌入态空态文案（更短） */
const embeddedPresenceEmptyText = computed(() => {
  if (presenceAutoMode.value) return '请在设置 → 安防联动配置人员'
  return '暂无人员数据'
})

/** 成员头像首字 */
function personInitial(name) {
  const text = String(name || '').trim()
  return text ? text.slice(0, 1).toUpperCase() : '?'
}

/** 格式化日出/日落时间为 HH:mm */
function formatSunTime(value) {
  if (!value) return '--:--'
  return formatLocaleTime(value, { hour: '2-digit', minute: '2-digit', hour12: false })
}
</script>

<style scoped src="./styles/SunInfo.css"></style>
