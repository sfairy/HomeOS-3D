/**
 * @file useDeviceGroupOffline.ts
 * @module composables/entity
 * @description 设备分组离线 / 低电量统计与展示辅助 composable。
 *
 * 职责：
 * - 当 domain 为 'offline' 时计算离线实体集合，并拆分为关键离线项；
 * - 当 domain 为 'battery' 时计算低电量实体集合（按电量排序，分临界 / 正常两组）；
 * - 提供按 domain 取图标、长 / 短原因文案、最后变化时间相对文案、电量色阶等辅助方法。
 *
 * 依赖：
 * - @homeos/shared（getEntityDomain）
 * - vue（computed、Ref、Component）
 * - @lucide/vue（域图标）
 * - @/utils/device/group-offline.util（离线关键集合计算与拆分）
 * - @/utils/device/group-battery.util（电量阈值与解析、store 形状类型）
 * - @/types/entity-store（HaEntityState）
 */
import { getEntityDomain } from '@homeos/shared'
import { computed, type Ref } from 'vue'
import { Sun, Plug, Bell, Camera, Lock, Thermometer, Music, AlertTriangle } from '@lucide/vue'
import { computeOfflineCriticalSet, splitOfflineEntityIds } from '@/utils/device/group-offline.util'
import { BATTERY_LOW_THRESHOLD, resolveBatteryLevel } from '@/utils/device/group-battery.util'
import type {
  DeviceGroupEntitiesStoreLike,
  DeviceGroupUiStoreLike,
} from '@/utils/device/group-battery.util'
import type { HaEntityState } from '@/types/entity-store'
import type { Component } from 'vue'

/** 各 domain 的离线长原因文案 */
const OFFLINE_REASON: Record<string, string> = {
  binary_sensor: '无响应，链路质量可能较差。',
  camera: '连接失败，请检查电源与 Wi-Fi。',
  climate: '控制器超时，请检查设备连接与网关状态。',
  light: '灯泡无响应，请确认开关已开启。',
  lock: '网关错误，请检查桥接连接。',
  media_player: '设备不可达，请检查局域网状态。',
  sensor: '信号丢失，请检查电池或网关桥接。',
  switch: '插座不可达，请检查电源与距离。',
}
/** 各 domain 的离线短原因文案（用于紧凑列表） */
const OFFLINE_SHORT_REASON: Record<string, string> = {
  camera: '离线',
  light: '电源故障？',
  lock: '桥接错误',
  sensor: '信号丢失',
  switch: '电源故障？',
}
/** domain -> 离线图标映射（未命中回退 AlertTriangle） */
const offlineIconMap: Record<string, Component> = {
  light: Sun,
  switch: Plug,
  sensor: Bell,
  binary_sensor: Bell,
  camera: Camera,
  lock: Lock,
  climate: Thermometer,
  media_player: Music,
}

/**
 * 离线 / 低电量统计与展示辅助。
 *
 * @param props 含 domain（'offline' / 'battery' 时启用对应统计）
 * @param entityIds 当前分组实体 ID 列表
 * @param entitiesStore 实体 store
 * @param uiStore UI store（layoutConfig 等）
 * @param getEntity 按 ID 取实体的函数
 * @returns offlineStats 离线统计；batteryStats 低电量统计；offlineIcon/offlineReason/shortReason/timeAgo/batteryColor 辅助方法
 */
export function useDeviceGroupOffline(
  props: { domain?: string },
  entityIds: Ref<string[]>,
  entitiesStore: DeviceGroupEntitiesStoreLike,
  uiStore: DeviceGroupUiStoreLike,
  getEntity: (eid: string) => HaEntityState | null | undefined,
) {
  // 离线统计：仅 domain === 'offline' 时计算，按关键集合与当前 entityIds 求交并拆分
  const offlineStats = computed(() => {
    if (props.domain !== 'offline') return null
    const criticalSet = computeOfflineCriticalSet(uiStore, entitiesStore)
    return splitOfflineEntityIds(criticalSet, entityIds.value)
  })
  // 低电量统计：仅 domain === 'battery' 时计算，按电量升序排序后分临界 / 正常两组
  const batteryStats = computed(() => {
    if (props.domain !== 'battery') return null
    const items = entityIds.value
      .map((eid) => {
        const entity = getEntity(eid)
        const level = resolveBatteryLevel(eid, entity ?? undefined, entitiesStore)
        return { id: eid, entity, level }
      })
      // 过滤掉无实体或电量非数字的项
      .filter((x) => x.entity && !isNaN(x.level))
      // 按电量升序：最低的排最前
      .sort((a, b) => a.level - b.level)
    return {
      critical: items.filter((x) => x.level <= BATTERY_LOW_THRESHOLD),
      normal: items.filter((x) => x.level > BATTERY_LOW_THRESHOLD),
    }
  })
  /** 按 domain 取离线图标，未命中回退告警三角图标。 */
  function offlineIcon(eid: string) {
    return offlineIconMap[getEntityDomain(eid)] || AlertTriangle
  }
  /** 按 domain 取离线长原因文案，未命中回退通用文案。 */
  function offlineReason(eid: string) {
    const d = getEntityDomain(eid)
    return OFFLINE_REASON[d] ?? '连接中断，需要排查故障。'
  }
  /** 按 domain 取离线短原因文案，未命中回退'超时'。 */
  function shortReason(eid: string) {
    const d = getEntityDomain(eid)
    return OFFLINE_SHORT_REASON[d] ?? '超时'
  }
  /** 取实体 last_changed 的相对时间文案（刚刚 / N 分钟前 / N 小时前 / N 天前）。 */
  function timeAgo(eid: string) {
    const e = getEntity(eid)
    if (!e?.last_changed) return '无记录'
    const diff = Math.floor((Date.now() - new Date(e.last_changed).getTime()) / 60000)
    if (diff < 1) return '刚刚'
    if (diff < 60) return `${diff} 分钟前`
    const h = Math.floor(diff / 60)
    if (h < 24) return `${h} 小时前`
    return `${Math.floor(h / 24)} 天前`
  }
  /** 按电量取色阶（<=20 红 / <=50 橙 / 其余绿）。 */
  function batteryColor(v: number) {
    return v <= 20
      ? { tone: 'tone-low', bg: 'bg-red-500', text: 'text-red-400' }
      : v <= 50
        ? { tone: 'tone-mid', bg: 'bg-orange-500', text: 'text-orange-400' }
        : { tone: 'tone-ok', bg: 'bg-emerald-500', text: 'text-emerald-400' }
  }
  return {
    offlineStats,
    batteryStats,
    offlineIcon,
    offlineReason,
    shortReason,
    timeAgo,
    batteryColor,
  }
}
