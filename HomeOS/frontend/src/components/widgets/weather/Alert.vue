<template>
  <div class="wa-card widget-glass-card">
    <!-- 头部：预警图标（颜色随最高级别变化）+ 标题 -->
    <div v-if="!embedded" class="wa-header">
      <AlertTriangle
        class="w-3.5 h-3.5"
        :class="
          alerts.length && maxLevel === 'red'
            ? 'wa-icon-red'
            : alerts.length
              ? 'wa-icon-yellow'
              : 'wa-icon-gray'
        "
      />
      <span class="wa-title">{{ '天气预警' }}</span>
      <span v-if="apiSource && alerts.length" class="text-[12px] wa-api-text ml-auto">API</span>
    </div>
    <!-- 空状态 -->
    <div v-if="alerts.length === 0" class="wa-empty">{{ '暂无天气预警' }}</div>
    <!-- 预警列表 -->
    <div v-else class="wa-list">
      <div v-for="a in alerts" :key="a.id" :class="['wa-item', `wa-item--${a.level}`]">
        <span class="wa-item-text">{{ a.event }}</span>
        <span class="wa-item-time">{{ a.effective }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
/**
 * 天气预警部件
 * 聚合天气预警来源并去重展示：
 * 1) 外部天气 API 预警（onMounted 时拉取，失败则回退实体扫描）
 * 2) tianqi binary_sensor.{station}_warning（title / alarms）
 * 3) HA alert / weather / sensor 域实体中带有 weather_alert 属性的实体
 */
import { computed, ref, onMounted, watch } from 'vue'
import { AlertTriangle } from '@lucide/vue'

import { useEntitiesStore } from '@/stores/entities.store'
import { useWeatherEntity } from '@/composables/entity/useWeatherEntity'
import { fetchWeatherAlerts } from '@/services/api/system'
import { getEntityDisplayName, domainIndexToArray } from '@/utils/entity/derived.util'
import {
  resolveWeatherWarning,
  weatherWarningEntityId,
  weatherStationCode,
} from '@/utils/weather/life-indices.util'

/**
 * 组件 Props
 * @property {boolean} embedded - 是否嵌入式渲染（无外层标题）
 * @property {Object} config - 可选天气实体覆盖
 */
const props = defineProps({
  embedded: { type: Boolean, default: false },
  config: { type: Object, default: () => ({}) },
})

/** 实体仓库（用于扫描实体预警） */
const entitiesStore = useEntitiesStore()
const weatherOverride = computed(() => String(props.config?.weatherEntityId || '').trim())
const { resolvedEid } = useWeatherEntity(weatherOverride)

/** 来自外部 API 的预警列表 */
const apiAlerts = ref([])
/** 是否使用了外部 API 数据源 */
const apiSource = ref(false)

watch(
  resolvedEid,
  (eid) => {
    const station = weatherStationCode(eid)
    if (!station) return
    void entitiesStore.ensureEntity(weatherWarningEntityId(station))
  },
  { immediate: true },
)

/**
 * 组件挂载时拉取外部天气预警 API。
 * 成功则映射为统一结构并标记 apiSource；失败时静默回退到实体扫描。
 */
onMounted(async () => {
  try {
    const res = await fetchWeatherAlerts()
    const list = res.data?.alerts || (Array.isArray(res.data) ? res.data : [])
    if (Array.isArray(list) && list.length) {
      apiAlerts.value = list.map((a, i) => ({
        id: `api-${i}`,
        event: a.event || a.title || a.description || '天气预警',
        level: a.severity === 'extreme' ? 'red' : 'yellow',
        effective: a.start || a.effective || '',
      }))
      apiSource.value = true
    }
  } catch {
    /* 回退实体扫描 */
  }
})

/** tianqi binary_sensor.{station}_warning */
const tianqiWarningAlerts = computed(() => {
  void entitiesStore.derivedEpoch
  void entitiesStore.getDomainEpoch('binary_sensor')
  const snap = resolveWeatherWarning((id) => entitiesStore.getEntity(id), resolvedEid.value)
  if (!snap?.active) return []
  if (snap.details.length) {
    return snap.details.map((text, i) => ({
      id: `${snap.entityId}:${i}`,
      event: text,
      level: 'red',
      effective: '',
    }))
  }
  return [
    {
      id: snap.entityId,
      event: snap.title || '天气预警',
      level: 'red',
      effective: '',
    },
  ]
})

/**
 * 从 HA 实体中扫描天气预警。
 * 扫描域：alert / weather / sensor / binary_sensor。
 * - alert.* 实体：state 为 on 视为红色级别，message 作为文案
 * - binary_sensor.*_warning：由 tianqiWarningAlerts 单独处理
 * - 其它实体：带有 weather_alert / severe_weather 属性即视为红色预警
 */
const entityAlerts = computed(() => {
  void entitiesStore.derivedEpoch
  void entitiesStore.getDomainEpoch('alert')
  void entitiesStore.getDomainEpoch('weather')
  void entitiesStore.getDomainEpoch('sensor')
  void entitiesStore.getDomainEpoch('binary_sensor')
  const seen = new Set()
  const list = [...tianqiWarningAlerts.value]
  for (const row of list) seen.add(row.id)

  const scanDomains = ['alert', 'weather', 'sensor', 'binary_sensor']
  for (const domain of scanDomains) {
    for (const key of domainIndexToArray(entitiesStore.domainEntityIndex.get(domain))) {
      const e = entitiesStore.entities[key]
      if (!e) continue
      if (key.startsWith('alert.')) {
        const msg = e.attributes?.message || getEntityDisplayName(key, e) || e.state
        if (msg && msg !== 'off' && msg !== 'unknown' && !seen.has(key)) {
          seen.add(key)
          list.push({
            id: key,
            event: msg,
            level: e.state === 'on' ? 'red' : 'yellow',
            effective: e.attributes?.effective || '',
          })
        }
        continue
      }
      if (key.endsWith('_warning') && key.startsWith('binary_sensor.')) {
        // 已由 tianqiWarningAlerts 覆盖绑定站点；其它站点若 on 也展示
        if (String(e.state).toLowerCase() !== 'on') continue
        if (seen.has(key) || list.some((row) => String(row.id).startsWith(key))) continue
        const title = e.attributes?.title || getEntityDisplayName(key, e) || '天气预警'
        seen.add(key)
        list.push({
          id: key,
          event: title,
          level: 'red',
          effective: e.attributes?.effective || '',
        })
        continue
      }
      const attrs = e.attributes || {}
      if (attrs.weather_alert || attrs.severe_weather) {
        const dedupeKey = `${key}:weather_alert`
        if (seen.has(dedupeKey)) continue
        seen.add(dedupeKey)
        list.push({
          id: dedupeKey,
          event: attrs.weather_alert || attrs.severe_weather || attrs.friendly_name,
          level: 'red',
          effective: attrs.effective || '',
        })
      }
    }
  }
  return list
})

/**
 * 最终展示的预警列表：优先使用 API 数据，无则使用实体扫描结果，并按 id 去重。
 * API 有数据时仍合并 tianqi 站点预警，避免漏掉本地实体告警。
 */
const alerts = computed(() => {
  const merged = apiAlerts.value.length
    ? [...apiAlerts.value, ...tianqiWarningAlerts.value]
    : entityAlerts.value
  const seen = new Set()
  return merged.filter((a) => {
    if (seen.has(a.id)) return false
    seen.add(a.id)
    return true
  })
})

/** 当前预警的最高级别：存在 red 则为 red，否则 yellow */
const maxLevel = computed(() => (alerts.value.some((a) => a.level === 'red') ? 'red' : 'yellow'))
</script>

<style scoped src="./styles/Alert.css"></style>
