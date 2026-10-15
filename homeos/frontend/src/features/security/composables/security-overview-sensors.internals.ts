/**
 * @file security-overview-sensors.internals.ts
 * @module frontend/src/features/security/composables
 */
import { ref, computed, watch, type Ref, type ComputedRef } from 'vue'
import type { Component } from 'vue'
import type { SecurityMode } from '@/shared/types/layout'
import { Shield, ShieldOff, Home, Moon, ShieldCheck } from '@lucide/vue'

export type SecurityOverviewSensor = {
  entity_id: string
  name: string
  domain: string
  alert: boolean
  type: string
  label: string
  order: number
  iconComp: Component
  iconColor: string
  css: string
  bound: boolean
  offline: boolean
}

/** 模式名 / 颜色与传感器过滤分组 */
export function createSecurityOverviewSensorView(opts: {
  securityModes: ComputedRef<SecurityMode[]>
  secCurrentMode: Ref<string>
  allSensors: ComputedRef<SecurityOverviewSensor[]>
  alertCount: ComputedRef<number>
}) {
  const { securityModes, secCurrentMode, allSensors, alertCount } = opts
  const sensorFilter = ref('all')
  const alertsOnly = ref(false)
  const boundOnly = ref(false)

  const secIconMap = { Shield, ShieldOff, Home, Moon, ShieldCheck }

  const secCurrentName = computed(() => {
    const sm = securityModes.value.find((m: SecurityMode) => m.key === secCurrentMode.value)
    return sm?.name || '已撤防'
  })

  const secModeColor = computed(() => {
    const map: Record<string, string> = {
      disarmed: 'text-emerald-400',
      armed_home: 'text-amber-400',
      armed_away: 'text-red-400',
      armed_night: 'text-violet-400',
    }
    return map[secCurrentMode.value] || 'text-gray-400'
  })

  const filteredSensors = computed(() => {
    let list =
      sensorFilter.value === 'all'
        ? allSensors.value
        : allSensors.value.filter((s) => s.type === sensorFilter.value)
    if (boundOnly.value) list = list.filter((s) => s.bound)
    return list
  })

  const boundSensorCount = computed(() => allSensors.value.filter((s) => s.bound).length)

  const listSensors = computed(() => {
    if (!alertsOnly.value) return filteredSensors.value
    return filteredSensors.value.filter((s) => s.alert)
  })

  const groupedListSensors = computed(() => {
    const groups: Record<string, { type: string; label: string; items: SecurityOverviewSensor[] }> =
      {}
    for (const s of listSensors.value) {
      if (!groups[s.type]) groups[s.type] = { type: s.type, label: s.label, items: [] }
      groups[s.type].items.push(s)
    }
    const order: Record<string, number> = { smoke: 0, gas: 1, co: 2, leak: 3, door: 4, motion: 5 }
    return Object.values(groups).sort((a, b) => (order[a.type] || 99) - (order[b.type] || 99))
  })

  function toggleSensorFilter(key: string) {
    sensorFilter.value = sensorFilter.value === key ? 'all' : key
  }

  watch(
    alertCount,
    (n) => {
      if (n > 0) alertsOnly.value = true
    },
    { immediate: true },
  )

  return {
    sensorFilter,
    alertsOnly,
    boundOnly,
    secIconMap,
    secCurrentName,
    secModeColor,
    boundSensorCount,
    listSensors,
    groupedListSensors,
    toggleSensorFilter,
  }
}
