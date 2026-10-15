/**
 * @file screensaver-clock-weather.internals.ts
 * @module frontend/src/composables/ui
 */
import { ref, computed, watch, type Ref } from 'vue'
import { solarToLunar } from '@/shared/utils/format/lunar-calendar'
import { formatLunarFullLine, formatLunarMonthDayLine } from '@/shared/utils/format/lunar-display.util'
import { formatZonedDate, getZonedParts, getZonedWallDate } from '@/shared/utils/format/locale-time'
import { domainIndexToArray } from '@/shared/entity/utils/derived.util'
import { weatherStateLabel } from '@/shared/weather/constants/weather-labels'
import {
  computeFeelsLike,
  collectSensorEntityIds,
  readAqiNumber,
  normalizeWindSpeedMs,
  numOr,
} from '@/shared/weather/utils/weather-metric.util'
import { WEATHER_ICON_EMOJI } from './screensaver.defaults'
import type { useEntitiesStore } from '@/stores/entities.store'
import type { useLayoutStore } from '@/stores/layout.store'

type EntitiesStore = ReturnType<typeof useEntitiesStore>
type LayoutStore = ReturnType<typeof useLayoutStore>

/** 屏保时钟 / 日期 / 农历派生 */
export function createScreensaverClockState(
  layoutStore: LayoutStore,
  currentTime: Ref<Date>,
) {
  const siteTitle = computed(() => layoutStore.layoutConfig.siteTitle || 'HomeOS')
  const zonedClock = computed(() => getZonedParts(currentTime.value))
  const timeHour = computed(() => zonedClock.value.hour)
  const timeMin = computed(() => zonedClock.value.minute)
  const timeSec = computed(() => zonedClock.value.second)

  const lowFreqClock = ref(new Date())
  const LOW_FREQ_REFRESH_MS = 60_000
  let lastLowFreqAt = 0
  watch(currentTime, (t) => {
    const now = t.getTime()
    const dayChanged = getZonedWallDate(t) !== getZonedWallDate(lowFreqClock.value)
    if (dayChanged || now - lastLowFreqAt >= LOW_FREQ_REFRESH_MS) {
      lowFreqClock.value = t
      lastLowFreqAt = now
    }
  })

  const dateWeek = computed(() => formatZonedDate(lowFreqClock.value, 'zh-CN', { weekday: 'long' }))
  const dateMD = computed(() =>
    formatZonedDate(lowFreqClock.value, 'zh-CN', { month: 'long', day: 'numeric' }),
  )
  const dateYear = computed(() => formatZonedDate(lowFreqClock.value, 'zh-CN', { year: 'numeric' }))
  const lunarRaw = computed(() => solarToLunar(getZonedWallDate(lowFreqClock.value)))
  const lunarFullLine = computed(() => formatLunarFullLine(lunarRaw.value))
  const lunarMonthDayLine = computed(() => formatLunarMonthDayLine(lunarRaw.value))

  return {
    siteTitle,
    timeHour,
    timeMin,
    timeSec,
    dateWeek,
    dateMD,
    dateYear,
    lunarFullLine,
    lunarMonthDayLine,
  }
}

/** 屏保天气实体与展示派生 */
export function createScreensaverWeatherState(
  entitiesStore: EntitiesStore,
  layoutStore: LayoutStore,
) {
  const weatherEntity = computed(() => {
    void entitiesStore.derivedEpoch
    void entitiesStore.getDomainEpoch('weather')
    const eid = layoutStore.layoutConfig.haConfig?.weatherEntityId
    if (eid) return entitiesStore.entities[eid]
    const weatherIds = domainIndexToArray(entitiesStore.domainEntityIndex.get('weather'))
    const firstId = weatherIds[0]
    return firstId ? entitiesStore.entities[firstId] : null
  })

  const weatherEid = computed(() => {
    const ent = weatherEntity.value
    return ent?.entity_id || ''
  })

  const weatherTemp = computed(() => {
    const t = weatherEntity.value?.attributes?.temperature as number | undefined
    return t != null ? Math.round(t) : '--'
  })
  const weatherDesc = computed(() => {
    const s = weatherEntity.value?.state ?? '--'
    return s !== '--' ? weatherStateLabel(s) : '--'
  })

  const weatherExtra = computed(() => {
    const attrs = weatherEntity.value?.attributes as Record<string, unknown> | undefined
    if (!attrs) return null
    return buildWeatherExtraItems(entitiesStore, attrs, weatherEid.value)
  })

  const weatherIcon = computed(() => {
    const s = (weatherEntity.value?.state || '').toLowerCase()
    const exact = (WEATHER_ICON_EMOJI as Record<string, string>)[s]
    if (exact) return exact
    if (s.includes('sunny') || s.includes('clear')) return '☀️'
    if (s.includes('partly')) return '⛅'
    if (s.includes('cloud')) return '☁️'
    if (s.includes('rain') || s.includes('drizzle')) return '🌧'
    if (s.includes('storm') || s.includes('thunder')) return '⛈'
    if (s.includes('snow')) return '🌨'
    if (s.includes('hail')) return '🧊'
    if (s.includes('fog') || s.includes('mist') || s.includes('haze')) return '🌫'
    if (s.includes('wind')) return '💨'
    return '🌤'
  })

  return { weatherEntity, weatherEid, weatherTemp, weatherDesc, weatherExtra, weatherIcon }
}

function buildWeatherExtraItems(
  entitiesStore: EntitiesStore,
  attrs: Record<string, unknown>,
  weatherEid: string,
) {
  const items: { icon: string; val: string }[] = []
  if (attrs.humidity != null) items.push({ icon: '💧', val: String(attrs.humidity) + '%' })
  const tRaw = numOr(attrs.temperature, NaN)
  const feelsRaw = attrs.feels_like ?? attrs.apparent_temperature
  if (!Number.isNaN(tRaw)) {
    let fl: number
    if (feelsRaw != null && !Number.isNaN(Number(feelsRaw))) {
      fl = Number(feelsRaw)
    } else {
      fl = computeFeelsLike(
        tRaw,
        numOr(attrs.humidity, 50),
        normalizeWindSpeedMs(numOr(attrs.wind_speed, NaN), attrs.wind_speed_unit as string),
      )
    }
    if (Number.isFinite(fl)) items.push({ icon: '🌡️', val: Math.round(fl) + '°' })
  }
  if (attrs.wind_speed != null) {
    const unit = (attrs.wind_speed_unit as string) || 'm/s'
    items.push({ icon: '🌬', val: Math.round(Number(attrs.wind_speed)) + unit })
  }
  if (attrs.pressure != null)
    items.push({ icon: '📊', val: Math.round(Number(attrs.pressure)) + 'hPa' })
  void entitiesStore.getDomainEpoch('sensor')
  const aqi = readAqiNumber(
    (id) => entitiesStore.getEntity(id),
    weatherEid,
    collectSensorEntityIds({
      sensorIndexIds: entitiesStore.sensorIndex.get('sensor'),
      domainSensorIds: entitiesStore.domainEntityIndex.get('sensor'),
      allEntityIds: Object.keys(entitiesStore.entities),
    }),
  )
  if (aqi != null) items.push({ icon: '😷', val: `AQI ${aqi}` })
  return items.length ? items : null
}
