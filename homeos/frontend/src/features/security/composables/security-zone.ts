import { computed, type Ref, onMounted } from 'vue'
import { useHomeModeItemExpansion } from '@/features/home-mode/index'
import { zoneTypeLabel, type SecurityZoneDraft, classifySecurityBinarySensor, buildZonesFromRoomGroups, groupSecuritySensorsByRoom, inferZoneTypeFromSensorTypes, mergeGeneratedZones, sensorsForRoomSelection, type SecuritySensorRef } from '@/features/security/utils'
import { useEntitiesStore } from '@/domain/entity/store/entities.store'
import { shouldZoneAlarmInMode, zoneModeHint, isSensorAlertState, type ArmingMode, type SecurityZoneType } from '@/features/security/utils'
import { getEntityDisplayName } from '@/domain/entity/model/utils/derived.util'
import { countOfflineDevices } from '@/domain/entity/model/utils/device-group'
import { useChromeStore } from '@/kernel/ui/chrome/chrome-store'
import { useEnvSensorMap } from '@/features/settings/index'

/* ── 原 useSecurityZoneEditorList.ts 的实现 ── */

/** 房间可选项 */
interface RoomOption {
  /** 房间 ID */
  id: string
  /** 房间显示标签 */
  label: string
}

/**
 * 安防区域编辑器列表 composable
 * @param zones 区域草稿列表
 * @param roomOptions 房间可选项列表
 * @returns 展开状态、导航项与渲染列表
 */
export function useSecurityZoneEditorList(zones: Ref<SecurityZoneDraft[] | undefined>, roomOptions: Ref<RoomOption[]>) {
  // 区域总数
  const zoneCount = computed(() => zones.value?.length ?? 0)
  // 复用 home-mode 的展开/折叠逻辑
  const { isCompact, expandedAll, activeTabIndex, selectItem, expandAll, collapseAll } =
    useHomeModeItemExpansion(zoneCount)

  // 区域导航项：每项包含索引、标签、元信息与占位标记
  const zoneNavItems = computed(() =>
    (zones.value ?? []).map((zone, i) => {
      // 优先匹配房间标签
      const roomLabel = roomOptions.value.find((r) => r.id === zone.roomId)?.label || ''
      const name = zone.name?.trim()
      // 名称 > 房间标签 > "区域 {i+1}" 回退
      const label = name || roomLabel || `区域 ${i + 1}`
      const sensorCount = zone.sensors?.length || 0
      // 元信息：区域类型 · 传感器数量
      const meta = `${zoneTypeLabel(zone.zoneType || 'all')} · ${sensorCount} 传感器`
      return {
        index: i,
        label,
        meta,
        // 既无名称也无房间标签时标记为占位，UI 显示淡色
        placeholder: !name && !roomLabel,
      }
    }),
  )

  // 实际渲染的区域列表：展开模式渲染全部；紧凑模式仅渲染激活项
  const renderedZones = computed(() => {
    const list = zones.value ?? []
    // 非紧凑模式或已展开全部：渲染所有区域
    if (!isCompact.value || expandedAll.value) {
      return list.map((zone, idx) => ({ zone, idx }))
    }
    // 紧凑模式：仅渲染激活索引对应的区域
    if (activeTabIndex.value != null && list[activeTabIndex.value]) {
      return [{ zone: list[activeTabIndex.value], idx: activeTabIndex.value }]
    }
    return []
  })

  return {
    isCompact,
    expandedAll,
    activeTabIndex,
    selectItem,
    expandAll,
    collapseAll,
    zoneNavItems,
    renderedZones,
  }
}

/* ── 原 useSecurityZoneMonitor.ts 的实现 ── */

/**
 * 安防区域监控 composable
 * @param liveZones 实时区域列表（含 armed/sensors）
 * @param layoutZones 布局配置中的区域草稿列表
 * @param currentMode 当前安防模式
 * @returns enrichedZones 富化后的区域列表 / summary 汇总信息
 */
export function useSecurityZoneMonitor(
  liveZones: Ref<Array<SecurityZoneDraft & { armed?: boolean; sensors?: string[] }>>,
  layoutZones: Ref<SecurityZoneDraft[] | undefined>,
  currentMode: Ref<string | undefined>,
) {
  const entitiesStore = useEntitiesStore()
  const { roomOptions } = useSecurityZoneRooms()

  // 布局区域按 id 索引，便于 O(1) 查找
  const layoutById = computed(() => {
    const map = new Map()
    for (const z of layoutZones.value || []) map.set(z.id, z)
    return map
  })

  // 富化后的区域列表：合并布局配置、传感器行、告警/离线计数、模式提示
  const enrichedZones = computed(() => {
    // 触发传感器 domain 的响应式依赖
    void entitiesStore.getDomainEpoch('binary_sensor')
    void entitiesStore.getDomainEpoch('sensor')

    // 模式缺省为撤防
    const mode = currentMode.value || 'disarmed'
    return (liveZones.value || []).map((zone) => enrichZone(zone, mode as ArmingMode))
  })

  /** 房间标签（布局配置优先，查不到时留空）。 */
  function roomLabelOf(roomId: string): string {
    return roomOptions.value.find((r) => r.id === roomId)?.label || ''
  }

  /**
   * 「当前模式参与」必须同时满足：该区域本次被布防 且 区域类型在当前模式下会告警。
   * 只看 mode×zoneType 会把「选择性布防时没勾选的区域」也算成参与，与卡片上的
   * 「未布防」徽标自相矛盾。布局草稿没有 armed 字段（后端状态尚未加载），
   * 此时不能当成「未布防」，否则首屏会闪一下「0 个区域参与告警」。
   */
  function zoneActiveInMode(
    mode: ArmingMode,
    zoneType: SecurityZoneType,
    armedKnown: boolean,
    armed: boolean,
  ): boolean {
    return shouldZoneAlarmInMode(mode, zoneType) && (!armedKnown || armed)
  }

  /** 单个区域的富化：布局补全 + 传感器行 + 计数 + 模式提示。 */
  function enrichZone(zone: SecurityZoneDraft & { armed?: boolean; sensors?: string[] }, mode: ArmingMode) {
    // 从布局配置补充 roomId/zoneType
    const layout = layoutById.value.get(zone.id)
    const roomId = layout?.roomId || zone.roomId || ''
    const zoneType = zone.zoneType || layout?.zoneType || 'all'
    const armedKnown = typeof zone.armed === 'boolean'
    const armed = zone.armed === true
    const sensors = buildSensorRows(zone.sensors || [])
    return {
      ...zone,
      roomId,
      roomLabel: roomLabelOf(roomId),
      zoneType,
      zoneTypeLabel: zoneTypeLabel(zoneType),
      modeHint: zoneModeHint(mode, zoneType as SecurityZoneType, armedKnown ? armed : true),
      activeInMode: zoneActiveInMode(mode, zoneType, armedKnown, armed),
      sensors,
      alertCount: sensors.filter((s) => s.alert).length,
      // 离线按**设备**计：一个烟感常挂「烟感 + 电量 + 信号」多个实体，
      // 按实体数会让一张区域卡片写着「3 离线」而其实只有一台设备出问题。
      offlineCount: countOfflineDevices(
        sensors.filter((s) => s.offline).map((s) => s.entity_id),
        entitiesStore.entities,
      ),
      sensorTotal: sensors.length,
    }
  }

  // 区域汇总：总数、已布防数、告警数、当前模式激活数
  const summary = computed(() => {
    const list = enrichedZones.value
    const armed = list.filter((z) => z.armed).length
    const alerts = list.reduce((n, z) => n + z.alertCount, 0)
    const active = list.filter((z) => z.activeInMode).length
    return {
      total: list.length,
      armed,
      alerts,
      activeInMode: active,
    }
  })

  /**
   * 规范化实体 ID：兼容字符串与 { entity_id } 对象两种输入
   * @param raw 原始输入
   * @returns 实体 ID 字符串，无法识别时返回空串
   */
  function normalizeEntityId(raw: unknown): string {
    if (typeof raw === 'string') return raw
    // 兼容对象形式 { entity_id: '...' }
    if (raw && typeof raw === 'object' && 'entity_id' in raw) {
      return String((raw as { entity_id: string }).entity_id)
    }
    return ''
  }

  /**
   * 构建传感器行列表
   * @param ids 实体 ID 数组（兼容字符串与对象）
   * @returns 传感器行：含名称、状态、告警/离线标记、类型标签
   */
  function buildSensorRows(ids: unknown[]) {
    return ids
      .map(normalizeEntityId)
      .filter(Boolean)
      .map((entityId) => {
        const ent = entitiesStore.entities[entityId]
        const name = getEntityDisplayName(entityId, ent)
        // 分类传感器，获取类型标签（device_class 优先，名字兜底）
        const cls = classifySecurityBinarySensor(entityId, name, String(ent?.attributes?.device_class || ''))
        const state = ent?.state
        // 离线判定：实体不存在或状态为 unavailable
        const offline = !ent || state === 'unavailable'
        // 告警判定：非离线且状态为告警态
        const alert = !offline && isSensorAlertState(state)
        return {
          entity_id: entityId,
          name,
          state,
          offline,
          alert,
          // 类型标签缺省为"传感器"
          label: cls?.label || '传感器',
        }
      })
  }

  return { enrichedZones, summary }
}

/* ── 原 useSecurityZoneRooms.ts 的实现 ── */

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
  const sensorsByRoom = computed(() => groupSecuritySensorsByRoom(entitiesStore.entities, envMap.activeRoom.value))

  // 有传感器的已分配房间列表（排除 __unassigned__）
  const roomsWithSensors = computed(() =>
    [...sensorsByRoom.value.values()].filter((g) => g.roomId !== '__unassigned__' && g.sensors.length > 0),
  )

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
      const cls = classifySecurityBinarySensor(id, name, String(ent?.attributes?.device_class || ''))
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
  function applyRoomToZone(zone: SecurityZoneDraft, roomId: string, { replaceSensors = true } = {}) {
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
