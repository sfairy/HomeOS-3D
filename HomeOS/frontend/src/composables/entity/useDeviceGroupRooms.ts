/**
 * @file useDeviceGroupRooms.ts
 * @module composables/entity
 * @description 设备分组 Widget 共用的房间推断与房间标签 composable。
 *
 * 职责：
 * - 提供 inferDeviceGroupRoom：根据实体 ID / 名称推断所属房间（兜底 key 默认 'other'）；
 * - 提供 useDeviceGroupRoomLabels：随公开配置热更新（configEpoch）解析房间标签。
 *
 * 依赖：
 * - vue（computed）
 * - @homeos/shared（inferDeviceGroupRoomFromCatalog / resolveDeviceGroupLabel）
 * - @/utils/config/frontend-config（configEpoch、getPublicRoomMeta）
 */
import { computed } from 'vue'
import { inferDeviceGroupRoomFromCatalog, resolveDeviceGroupLabel } from '@homeos/shared'
import { configEpoch, getPublicRoomMeta } from '@/utils/config/frontend-config'

/**
 * 设备分组 Widget 共用的房间推断。
 *
 * @param entityId 实体 ID（可空）
 * @param name 实体名称（可空，参与推断）
 * @param fallbackKey 推断失败时的兜底房间 key（默认 'other'）
 * @returns 房间 key 字符串
 */
export function inferDeviceGroupRoom(
  entityId: string | null | undefined,
  name: string | null | undefined,
  fallbackKey = 'other',
) {
  return inferDeviceGroupRoomFromCatalog(
    String(entityId || ''),
    String(name || ''),
    fallbackKey,
  )
}

/**
 * Widget 分组标题：优先读取公开配置 roomMeta（随 envSensorMap 热更新）。
 *
 * @returns meta 当前生效的 roomMeta（含 deviceGroupLabels）；labelForGroupKey 按 group key 取中文标签
 */
export function useDeviceGroupRoomLabels() {
  // 读取 configEpoch 触发响应式依赖，保证配置热更新时重新计算
  const meta = computed(() => {
    configEpoch.value
    return getPublicRoomMeta()
  })

  /**
   * 按 group key 取中文标签：优先 deviceGroupLabels，否则用 resolveDeviceGroupLabel 兜底。
   * @param groupKey 分组 key（如 'living' / 'bedroom'）
   * @returns 中文标签，空 key 返回 '其他'
   */
  function labelForGroupKey(groupKey: string) {
    const key = String(groupKey || '').trim()
    if (!key) return '其他'
    return meta.value.deviceGroupLabels[key] || resolveDeviceGroupLabel(key)
  }

  return { meta, labelForGroupKey }
}
