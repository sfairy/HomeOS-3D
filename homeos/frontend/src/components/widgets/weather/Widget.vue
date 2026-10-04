<!--
  WeatherWidget.vue / components/widgets/weather
  天气主卡片：仪表盘或首页紧凑展示当前温度、体感温度、湿度/气压/风速/AQI 等指标，
  下嵌 5 日预报；可切换 compact/标准两种尺寸，点击可跳设置绑定天气实体。
  Props: compact 是否紧凑布局（隐藏辅助指标）/ weather-entity-override 覆盖 ID
  依赖：composables: useWeatherEntity 返回 resolvedEid 与 fallback；
        Pinia: useEntitiesStore 快照；
        utils/weather-metric.util celsiusToDisplayTemp/formatHumidity 格式化；
        constants: weatherStateLabel + weatherVisualKey；
        RouterLink 跳转首装向导；
        lucide: 同 Forecast 的图标集 + Eye + Gauge + Leaf 扩展指标。
  注意：未绑定天气实体时出 VEmptyState 引导首装向导；温度单位跟随 locale-format。
-->
<template>
  <div
    class="weather-inner flex flex-col rounded-2xl"
    :class="[compact ? 'weather-inner--compact' : 'p-4 h-full']"
  >
    <VEmptyState v-if="!hasWeather" compact tone="sky" icon="☁" :title="'未检测到天气数据'">
      <template #action>
        <RouterLink :to="SETTINGS_ROUTES.bindings()" class="v-empty__link">{{
          '配置天气实体'
        }}</RouterLink>
      </template>
    </VEmptyState>
    <template v-else>
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-4">
          <div
            class="w-14 h-14 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center"
          >
            <component :is="weatherData.info.icon" :class="['w-8 h-8', weatherData.info.color]" />
          </div>
          <div>
            <div class="flex items-baseline gap-1">
              <span class="text-4xl font-light text-white tracking-tight">{{
                weatherData.temp
              }}</span>
              <span class="text-lg text-white/40">°C</span>
            </div>
            <div
              class="text-[12px] weather-lbl-faint font-medium tracking-[0.15em] uppercase mt-0.5"
            >
              {{ weatherData.info.label }}
            </div>
          </div>
        </div>
        <div class="flex flex-col items-end">
          <div class="text-xs weather-lbl font-bold tracking-[0.15em] uppercase">
            {{ weatherData.name }}
          </div>
          <div v-if="weatherData.aqi" class="mt-1 flex items-center gap-1.5">
            <span :class="[weatherData.aqiColor, 'text-base font-bold tabular-nums']">{{
              weatherData.aqi
            }}</span>
            <div
              class="px-2.5 py-0.5 rounded-full text-[12px] font-bold uppercase tracking-wider"
              :class="weatherData.aqiBadgeClass"
            >
              {{ weatherData.aqiLabel }}
            </div>
          </div>
        </div>
      </div>
      <div class="grid grid-cols-2 gap-x-4 gap-y-2 mt-4 flex-1 content-start">
        <div class="flex items-center gap-3">
          <Droplets class="w-4 h-4 weather-ic-blue flex-shrink-0" />
          <div class="flex-1 min-w-0">
            <div class="text-[12px] weather-lbl-faint font-medium tracking-[0.1em] uppercase">
              {{ '湿度' }}
            </div>
            <div class="text-sm font-light tabular-nums" :class="weatherData.humidityColor">
              {{ weatherData.humidity }}%
            </div>
          </div>
        </div>
        <div class="flex items-center gap-3">
          <Wind class="w-4 h-4 weather-ic-cyan flex-shrink-0" />
          <div class="flex-1 min-w-0">
            <div class="text-[12px] weather-lbl-faint font-medium tracking-[0.1em] uppercase">
              {{ '风速' }}
            </div>
            <div class="text-sm font-light tabular-nums" :class="weatherData.windColor">
              {{ weatherData.windSpeed }} m/s
            </div>
          </div>
        </div>
        <div class="flex items-center gap-3">
          <Eye class="w-4 h-4 weather-ic-amber flex-shrink-0" />
          <div class="flex-1 min-w-0">
            <div class="text-[12px] weather-lbl-faint font-medium tracking-[0.1em] uppercase">
              {{ '能见度' }}
            </div>
            <div class="text-sm font-light tabular-nums" :class="weatherData.visColor">
              {{ weatherData.visibility }} km
            </div>
          </div>
        </div>
        <div class="flex items-center gap-3">
          <Gauge class="w-4 h-4 weather-ic-violet flex-shrink-0" />
          <div class="flex-1 min-w-0">
            <div class="text-[12px] weather-lbl-faint font-medium tracking-[0.1em] uppercase">
              {{ '气压' }}
            </div>
            <div class="text-sm font-light tabular-nums" :class="weatherData.pressureColor">
              {{ weatherData.pressure }} hPa
            </div>
          </div>
        </div>
        <div class="flex items-center gap-3">
          <CloudRain class="w-4 h-4 weather-ic-success flex-shrink-0" />
          <div class="flex-1 min-w-0">
            <div class="text-[12px] weather-lbl-faint font-medium tracking-[0.1em] uppercase">
              {{ '降雨量' }}
            </div>
            <div class="text-sm font-light tabular-nums weather-c-success">
              {{ weatherData.precipitation }} mm
            </div>
          </div>
        </div>
        <div class="flex items-center gap-3">
          <Leaf class="w-4 h-4 weather-ic-success flex-shrink-0" />
          <div class="flex-1 min-w-0">
            <div class="text-[12px] weather-lbl-faint font-medium tracking-[0.1em] uppercase">
              PM2.5
            </div>
            <div class="text-sm font-light tabular-nums" :class="weatherData.pm25Color">
              {{ weatherData.pm25 }} μg/m³
            </div>
          </div>
        </div>
      </div>
      <p v-if="isFallback" class="text-[12px] weather-c-warn-soft mt-2 text-right">
        {{ '使用自动发现的 weather 实体' }}
      </p>
    </template>
  </div>
</template>

<script setup>
/**
 * @file Widget.vue
 * @module widgets/weather
 * @description 天气详情部件：右侧面板中显示当前天气详细信息，
 *              使用单一聚合 computed 替代 22 个独立 computed，避免冗余响应式触发。
 * @dependencies
 *  - vue: computed/watch 响应式与监听
 *  - vue-router: RouterLink 路由跳转
 *  - @lucide/vue: 多种天气图标
 *  - @/stores/entities.store: 实体状态
 *  - @/composables/entity/useWeatherEntity: 天气实体 composable
 *  - @/constants/weather-labels: 天气状态标签与视觉键
 *  - @/utils/registry/settings-route.util: 设置页路由常量
 */
import { weatherStateLabel, weatherVisualKey } from '@/constants/weather-labels'
import { computed, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { Cloud, Sun, Droplets, Wind, CloudRain, Eye, Gauge, Leaf, CloudFog, CloudLightning, CloudSnow, Moon } from '@lucide/vue'
import { useEntitiesStore } from '@/stores/entities.store'
import { useWeatherEntity } from '@/composables/entity/useWeatherEntity'
import { SETTINGS_ROUTES } from '@/utils/registry/settings-route.util'
import {
  collectSensorEntityIds,
  readAqiNumber,
} from '@/utils/weather/weather-metric.util'

const props = defineProps({
  config: {},
  panelVisible: { type: Boolean, default: true },
  compact: { type: Boolean, default: false },
})

const entitiesStore = useEntitiesStore()
const weatherEntityOverride = computed(() => String(props.config?.weatherEntityId || '').trim())
const {
  resolvedEid: weatherEid,
  entity: weatherEnt,
  isFallback,
  hasWeather,
} = useWeatherEntity(weatherEntityOverride)

// 冷实体补全：约定 AQI / 生活指数 / 预警实体可能尚未进入热状态缓存
watch(
  weatherEid,
  (eid) => {
    const m = String(eid || '').match(/^weather\.(.+)$/)
    if (!m) return
    const station = m[1]
    void Promise.all([
      entitiesStore.ensureEntity(`sensor.${station}_aqi`),
      entitiesStore.ensureEntity(`sensor.${station}_pm25`),
      entitiesStore.ensureEntity(`sensor.${station}_clothing`),
      entitiesStore.ensureEntity(`binary_sensor.${station}_warning`),
    ])
  },
  { immediate: true },
)

function listSensorIdsForAqi() {
  void entitiesStore.getDomainEpoch('sensor')
  return collectSensorEntityIds({
    sensorIndexIds: entitiesStore.sensorIndex.get('sensor'),
    domainSensorIds: entitiesStore.domainEntityIndex.get('sensor'),
    allEntityIds: Object.keys(entitiesStore.entities),
  })
}

/** 天气状态图标/颜色映射（按 visual key） */
const weatherMap = {
  sunny: { icon: Sun, color: 'weather-c-warn' },
  'clear-night': { icon: Moon, color: 'weather-c-blue-soft' },
  cloudy: { icon: Cloud, color: 'weather-lbl' },
  partlycloudy: { icon: Cloud, color: 'weather-lbl' },
  rainy: { icon: Droplets, color: 'weather-c-blue' },
  pouring: { icon: CloudRain, color: 'weather-c-blue' },
  drizzle: { icon: CloudRain, color: 'weather-c-blue' },
  lightning: { icon: CloudLightning, color: 'weather-c-violet' },
  snowy: { icon: CloudSnow, color: 'weather-c-white' },
  sleet: { icon: CloudSnow, color: 'weather-c-white' },
  windy: { icon: Wind, color: 'weather-c-cyan' },
  fog: { icon: CloudFog, color: 'weather-lbl-faint' },
  haze: { icon: CloudFog, color: 'weather-lbl-faint' },
  hail: { icon: CloudSnow, color: 'weather-c-white' },
  sandstorm: { icon: Wind, color: 'weather-c-warn' },
}

function getAqiLevel(v) {
  return v <= 50 ? '优' : v <= 100 ? '良' : v <= 150 ? '轻度' : v <= 200 ? '中度' : '重度'
}
function getAqiColor(v) {
  return v <= 50
    ? 'weather-c-success'
    : v <= 100
      ? 'weather-c-warn'
      : v <= 150
        ? 'weather-c-warn-deep'
        : 'weather-c-danger'
}
function getAqiBg(v) {
  return v <= 50
    ? 'weather-badge-success'
    : v <= 100
      ? 'weather-badge-warn'
      : v <= 150
        ? 'weather-badge-warn-deep'
        : 'weather-badge-danger'
}

/**
 * 聚合天气数据（单一 computed 替代 22 个独立 computed）
 * 一次计算返回所有模板所需字段，避免 22 次独立的响应式追踪
 */
const weatherData = computed(() => {
  if (!props.panelVisible) {
    return {
      name: '—',
      temp: '--',
      info: { icon: Cloud, label: '—', color: 'weather-lbl-faint' },
      humidity: '--',
      windSpeed: '--',
      visibility: '--',
      pressure: '--',
      precipitation: '0',
      pm25: '--',
      aqi: null,
      aqiLabel: '',
      aqiColor: '',
      aqiBadgeClass: '',
      humidityColor: 'weather-lbl',
      windColor: 'weather-lbl',
      visColor: 'weather-lbl',
      pressureColor: 'weather-lbl',
      pm25Color: 'weather-lbl',
    }
  }
  const ent = weatherEnt.value
  const eid = weatherEid.value
  const attrs = ent?.attributes || {}
  const s = ent?.state || '未知'

  // 天气显示名称（friendly_name 来自 HA，中文「天气」后缀属数据清洗，与 UI 语言无关）
  let wName = attrs.friendly_name || '天气'
  wName = wName.replace(/\n/g, ' ').replace(/天气/g, '').trim()
  const dupMatch = wName.match(/^(.+?)\s+\1$/)
  if (dupMatch) wName = dupMatch[1]
  wName = wName.toUpperCase()

  // 天气状态 → 图标/标签/颜色
  const mapped = weatherMap[weatherVisualKey(s)]
  let info
  if (mapped) {
    info = { ...mapped, label: weatherStateLabel(s) }
  } else {
    const label = s.replace(/天气/g, '') || '未知'
    info =
      label && label === wName
        ? { icon: Cloud, label: '天气', color: 'weather-lbl-faint' }
        : { icon: Cloud, label: label || '未知', color: 'weather-lbl-faint' }
  }

  // 基础气象数据
  const temp = attrs.temperature ?? '--'
  const humidity = attrs.humidity ?? '--'
  const precipitation = attrs.precipitation ?? '0'
  const windSpeed = attrs.wind_speed ?? '--'
  const visibility = attrs.visibility ?? '--'
  const pressure = attrs.pressure ?? '--'

  // AQI：只读 sensor.{城市名}_aqi；禁止 weather.attrs.aqi / PM2.5（tianqi 的 attrs.aqi 常等于 aqi_pm25）
  const aqi = readAqiNumber((id) => entitiesStore.getEntity(id), eid, listSensorIdsForAqi())

  // PM2.5 传感器：sensor.{城市名}_pm25（浓度，与 AQI 指数分离）
  const locMatch = eid.match(/^weather\.(.+)$/)
  const pm25 = locMatch
    ? (entitiesStore.getEntity(`sensor.${locMatch[1]}_pm25`)?.state ?? '--')
    : '--'

  // 温度颜色
  const tVal = parseFloat(temp)
  const tempColor = isNaN(tVal)
    ? 'weather-c-white'
    : tVal >= 35
      ? 'weather-c-danger'
      : tVal >= 28
        ? 'weather-c-warn-deep'
        : tVal >= 20
          ? 'weather-c-warn'
          : tVal >= 10
            ? 'weather-c-success'
            : tVal >= 0
              ? 'weather-c-info'
              : 'weather-c-blue'

  // 湿度颜色
  const h = parseFloat(humidity)
  const humidityColor = isNaN(h)
    ? 'weather-c-info'
    : h >= 85
      ? 'weather-c-blue'
      : h >= 60
        ? 'weather-c-info'
        : h >= 40
          ? 'weather-c-success'
          : h >= 20
            ? 'weather-c-warn'
            : 'weather-c-warn-deep'

  // 风速颜色
  const ws = parseFloat(windSpeed)
  const windColor = isNaN(ws)
    ? 'weather-c-info'
    : ws >= 12
      ? 'weather-c-danger'
      : ws >= 7
        ? 'weather-c-warn-deep'
        : ws >= 3
          ? 'weather-c-warn'
          : 'weather-c-info'

  // 能见度颜色
  const vis = parseFloat(visibility)
  const visColor = isNaN(vis)
    ? 'weather-c-warn'
    : vis >= 10
      ? 'weather-c-success'
      : vis >= 5
        ? 'weather-c-warn'
        : vis >= 2
          ? 'weather-c-warn-deep'
          : 'weather-c-danger'

  // PM2.5 颜色
  const p = parseFloat(pm25)
  const pm25Color = isNaN(p)
    ? 'weather-c-danger'
    : p <= 35
      ? 'weather-c-success'
      : p <= 75
        ? 'weather-c-warn'
        : p <= 150
          ? 'weather-c-warn-deep'
          : 'weather-c-danger'

  // 气压颜色
  const pr = parseFloat(pressure)
  const pressureColor = isNaN(pr)
    ? 'weather-c-violet'
    : pr >= 1025
      ? 'weather-c-blue'
      : pr >= 1010
        ? 'weather-c-success'
        : pr >= 995
          ? 'weather-c-violet'
          : 'weather-c-warn-deep'

  return {
    name: wName,
    state: s,
    info,
    temp,
    tempColor,
    humidity,
    humidityColor,
    precipitation,
    windSpeed,
    windColor,
    visibility,
    visColor,
    pressure,
    pressureColor,
    pm25,
    pm25Color,
    aqi,
    aqiColor: aqi ? getAqiColor(aqi) : '',
    aqiLabel: aqi ? getAqiLevel(aqi) : '',
    aqiBadgeClass: aqi ? getAqiBg(aqi) : '',
  }
})
</script>

<style scoped src="./styles/Widget.css"></style>
