/**
 * @file setup-wizard-env.internals.ts
 * @module frontend/src/features/settings/composables/connect
 */
/** Setup 向导：环境传感器步骤 */

import { computed, ref, watch } from 'vue'
import { Droplets, Leaf, Thermometer, Wind } from '@lucide/vue'
import type { useEnvSensorMap } from '@/features/settings/composables/env-sensor-map.internals'
import { getEnvSensorFields } from '@/features/settings/composables/env-sensor-map.internals'
import { envRoomTabEmoji } from '@/shared/utils/settings/tab-emoji.util'

// ── useSetupWizardEnvStep ──
const ENV_SENSOR_ICONS = {
  temperature: Thermometer,
  humidity: Droplets,
  pm25: Wind,
  co2: Leaf,
  tvoc: Wind,
} as const

const ENV_SENSOR_UNITS = {
  temperature: '°C',
  humidity: '%',
  pm25: 'µg/m³',
  co2: 'ppm',
  tvoc: 'ppb',
} as const

const SENSOR_KEYS = ['temperature', 'humidity', 'pm25', 'co2', 'tvoc'] as const

/** 与后端 ENV_ROOM_MIN / setup-wizard-core 口径一致 */
const ENV_ROOM_MIN = 3

export function useSetupWizardEnvStep(envMap: ReturnType<typeof useEnvSensorMap>) {
  const {
    sensorMap,
    roomList: envRoomList,
    loading: envLoading,
    registryDegraded,
    registryError,
    refreshHaAreas,
  } = envMap

  const envRoomTab = ref('living')

  const envSensorFieldList = computed(() =>
    Object.values(getEnvSensorFields()).map((f) => ({
      ...f,
      icon: ENV_SENSOR_ICONS[f.key as keyof typeof ENV_SENSOR_ICONS],
      unit: ENV_SENSOR_UNITS[f.key as keyof typeof ENV_SENSOR_UNITS],
      iconClass:
        f.key === 'temperature'
          ? 'sw-env-sensor-icon--temp'
          : f.key === 'humidity'
            ? 'sw-env-sensor-icon--humid'
            : f.key === 'pm25'
              ? 'sw-env-sensor-icon--pm25'
              : f.key === 'co2'
                ? 'sw-env-sensor-icon--co2'
                : 'sw-env-sensor-icon--tvoc',
      shortLabel:
        f.key === 'temperature'
          ? '温度'
          : f.key === 'humidity'
            ? '湿度'
            : f.key === 'pm25'
              ? 'PM2.5'
              : f.key === 'co2'
                ? 'CO₂'
                : 'TVOC',
    })),
  )

  function envRoomBound(roomId: string) {
    const entry = sensorMap.value[roomId]
    if (!entry) return false
    return SENSOR_KEYS.some((k) => String(entry[k] || '').trim())
  }

  function envRoomSensorCount(roomId: string) {
    const entry = sensorMap.value[roomId]
    if (!entry) return 0
    return SENSOR_KEYS.filter((k) => String(entry[k] || '').trim()).length
  }

  const envConfiguredRoomCount = computed(
    () => envRoomList.value.filter((room) => envRoomBound(room.id)).length,
  )

  const envStepReady = computed(() => envConfiguredRoomCount.value >= ENV_ROOM_MIN)

  const envProgressPct = computed(() =>
    Math.min(100, Math.round((envConfiguredRoomCount.value / ENV_ROOM_MIN) * 100)),
  )

  const envRoomTabs = computed(() =>
    envRoomList.value.map((room) => ({
      id: room.id,
      label: sensorMap.value[room.id]?.label?.trim() || room.defaultLabel,
      emoji: envRoomTabEmoji(room.id),
      accent: envRoomBound(room.id) ? '#34d399' : '#64748b',
      count: envRoomBound(room.id) ? String(envRoomSensorCount(room.id)) : undefined,
    })),
  )

  watch(envRoomTabs, (tabs) => {
    if (!tabs.length) return
    if (!tabs.some((t) => t.id === envRoomTab.value)) {
      envRoomTab.value = tabs[0].id
    }
  })

  const activeEnvRoom = computed(() => envRoomList.value.find((r) => r.id === envRoomTab.value))

  return {
    sensorMap,
    envLoading,
    envRoomTab,
    envSensorFieldList,
    envRoomBound,
    envRoomSensorCount,
    envConfiguredRoomCount,
    envStepReady,
    envProgressPct,
    envRoomTabs,
    activeEnvRoom,
    registryDegraded,
    registryDegradedReason: registryError,
    refreshAreas: refreshHaAreas,
  }
}
