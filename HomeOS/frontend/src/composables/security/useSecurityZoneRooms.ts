/**
 * @file useSecurityZoneRooms.ts
 * @module composables/security
 * @description 安防区域房间 composable，基于 HA 区域分组管理传感器与区域的映射关系。
 *   - 通过 envMap 获取 HA 区域列表与房间分组
 *   - 按房间分组安全传感器，支持已分配/未分配两类查询
 *   - 提供区域与房间的双向操作：应用房间到区域、切换传感器、按房间生成区域
 * @dependencies vue, @/stores/entities.store, @/stores/chrome.store, @/composables/settings/env-sensor-map.internals, @/utils/entity/entity-derived.util, @/utils/security/zone-room.util
 */
import { computed, onMounted, type Ref } from 'vue'
import { useEntitiesStore } from '@/stores/entities.store'
import { useChromeStore } from '@/stores/chrome.store'
import { useEnvSensorMap } from '@/composables/settings/env-sensor-map.internals'
import { getEntityDisplayName } from '@/utils/entity/derived.util'
import {
  buildZonesFromRoomGroups,
  groupSecuritySensorsByRoom,
  inferZoneTypeFromSensorTypes,
  mergeGeneratedZones,
  sensorsForRoomSelection,
  classifySecurityBinarySensor,
  type SecurityZoneDraft,
  type SecuritySensorRef,
} from '@/utils/security/zone-room.util'

/**
 * 安防区域房间 composable
 * @returns 房间选项、传感器分组、区域操作方法等
 */
export function useSecurityZoneRooms() {
  const entitiesStore = useEntitiesStore()
  const chrome = useChromeStore()
  const envMap = useEnvSensorMap()

  // 挂载时若 envMap 未初始化则触发加载
  onMounted(() => {
    if (!envMap.initialized.value) void envMap.load()
  })

  // 房间可选项列表：id + 显示标签
  const roomOptions = computed(() =>
    envMap.activeRoom.value.map((room) => ({
      id: room.id,
      label: room.displayLabel,
    })),
  )

  // 按房间分组的安全传感器 Map：key 为 roomId，未分配的归入 __unassigned__
  const sensorsByRoom = computed(() =>
    groupSecuritySensorsByRoom(entitiesStore.entities, envMap.activeRoom.value),
  )

  // 有传感器的已分配房间列表（排除 __unassigned__）
  const roomsWithSensors = computed(() =>
    [...sensorsByRoom.value.values()].filter(
      (g) => g.roomId !== '__unassigned__' && g.sensors.length > 0,
    ),
  )

  // 未分配的传感器列表
  const unassignedSensors = computed(() => sensorsByRoom.value.get('__unassigned__')?.sensors || [])
  /**
   * 获取指定区域的传感器引用列表
   * @param zone 区域草稿
   * @returns 传感器引用数组，含 entity_id/name/type/label
   */
  function sensorRefsForZone(zone: SecurityZoneDraft): SecuritySensorRef[] {
    // 构建已知传感器索引，便于 O(1) 查找
    const known = new Map<string, SecuritySensorRef>()
    for (const group of sensorsByRoom.value.values()) {
      for (const sensor of group.sensors) known.set(sensor.entity_id, sensor)
    }
    return (zone.sensors || []).map((id) => {
      const hit = known.get(id)
      if (hit) return hit
      // 未知传感器：从实体仓库推断名称与类型
      const ent = entitiesStore.entities[id]
      const name = getEntityDisplayName(id, ent)
      const cls = classifySecurityBinarySensor(id, name)
      return {
        entity_id: id,
        name,
        type: cls?.type || 'unknown',
        label: cls?.label || '传感器',
      }
    })
  }

  /**
   * 获取区域可选择的传感器列表
   * @param zone 区域草稿
   * @returns 该房间下的传感器；房间无传感器时回退到未分配列表
   */
  function pickableSensorsForZone(zone: SecurityZoneDraft): SecuritySensorRef[] {
    // 直接使用区域已绑定房间；缺失时回退到未分配列表
    const fromRoom = sensorsForRoomSelection(zone.roomId || '', sensorsByRoom.value)
    if (fromRoom.length) return fromRoom
    // 房间无传感器时回退到未分配列表
    return unassignedSensors.value
  }

  /**
   * 将房间应用到区域：同步 roomId、名称（若空）、传感器列表与区域类型
   * @param zone 区域草稿
   * @param roomId 房间 ID
   * @param options.replaceSensors 是否替换区域传感器为房间传感器，默认 true
   */
  function applyRoomToZone(
    zone: SecurityZoneDraft,
    roomId: string,
    { replaceSensors = true } = {},
  ) {
    zone.roomId = roomId || ''
    // 空房间 ID 时仅清空，不同步传感器
    if (!roomId) return
    const group = sensorsByRoom.value.get(roomId)
    if (!group) return
    // 区域无名称时使用房间标签
    if (!zone.name?.trim()) zone.name = group.label
    if (replaceSensors) {
      // 替换传感器为房间全部传感器
      zone.sensors = group.sensors.map((s) => s.entity_id)
      // 根据传感器类型推断区域类型
      zone.zoneType = inferZoneTypeFromSensorTypes(group.sensors.map((s) => s.type))
    }
  }
  /**
   * 切换区域中某传感器的选中状态
   * @param zone 区域草稿
   * @param entityId 实体 ID
   * @sideEffects 更新 zone.sensors 与 zone.zoneType
   */
  function toggleZoneSensor(zone: SecurityZoneDraft, entityId: string) {
    const set = new Set(zone.sensors || [])
    if (set.has(entityId)) set.delete(entityId)
    else set.add(entityId)
    zone.sensors = [...set]
    // 根据当前选中传感器重新推断区域类型（过滤未知类型）
    const types = sensorRefsForZone(zone)
      .map((s) => s.type)
      .filter((t) => t !== 'unknown')
    zone.zoneType = inferZoneTypeFromSensorTypes(types)
  }

  /**
   * 根据区域已绑定的房间同步传感器列表
   * @param zone 区域草稿
   */
  function syncZoneSensorsFromRoom(zone: SecurityZoneDraft) {
    if (!zone.roomId) return
    applyRoomToZone(zone, zone.roomId, { replaceSensors: true })
  }

  /**
   * 按房间分组生成区域草稿，与现有区域合并
   * @param existing 现有区域列表
   * @param options.includeUnassigned 是否包含未分配传感器的区域，默认 false
   * @returns 合并后的区域列表
   */
  function generateZonesFromRooms(
    existing: SecurityZoneDraft[],
    { includeUnassigned = false }: { includeUnassigned?: boolean } = {},
  ) {
    const generated = buildZonesFromRoomGroups(sensorsByRoom.value, { includeUnassigned })
    // 无现有区域时直接返回生成结果
    if (!existing.length) return generated
    return mergeGeneratedZones(existing, generated)
  }

  /**
   * 从房间生成区域并写回给定列表（带通知反馈）
   * @param zonesRef 区域列表 ref
   * @sideEffects 成功时更新 zonesRef 并弹出成功通知；无可生成房间时弹出警告通知
   */
  function handleGenerateFromRooms(zonesRef: Ref<SecurityZoneDraft[]>) {
    const prevLen = zonesRef.value.length
    const next = generateZonesFromRooms(zonesRef.value, { includeUnassigned: false })
    if (!next.length) {
      chrome.notify('未找到可生成的房间（需 HA 区域下有门磁/人体等 binary_sensor）', 'warning')
      return
    }
    zonesRef.value = next
    const added = next.length - prevLen
    chrome.notify(
      added > 0 ? `已新增 ${added} 个区域，共 ${next.length} 个` : `已生成 ${next.length} 个告警区域`,
      'success',
    )
  }

  /**
   * 刷新房间列表：重新拉取 HA 区域并强制加载 envMap
   * @sideEffects 更新 envMap 状态
   */
  async function refreshRooms() {
    await envMap.refreshHaAreas()
    if (!envMap.initialized.value) await envMap.load({ force: true })
  }

  return {
    roomOptions,
    sensorsByRoom,
    roomsWithSensors,
    unassignedSensors,
    roomsReady: envMap.initialized,
    roomsLoading: envMap.loading,
    sensorRefsForZone,
    pickableSensorsForZone,
    applyRoomToZone,
    toggleZoneSensor,
    syncZoneSensorsFromRoom,
    generateZonesFromRooms,
    handleGenerateFromRooms,
    refreshRooms,
  }
}