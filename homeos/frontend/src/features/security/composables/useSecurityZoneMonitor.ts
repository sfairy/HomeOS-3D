/**
 * @file useSecurityZoneMonitor.ts
 * @module composables/security
 * @description 安防区域监控 composable，将实时区域与布局配置合并并富化为可展示的结构。
 *   - 合并 liveZones（实时状态）与 layoutZones（布局配置）补充 roomId/zoneType
 *   - 为每个区域构建传感器行（含告警/离线判定与类型标签）
 *   - 派生区域汇总：总数、已布防数、告警数、当前模式下激活数
 * @dependencies vue, @/stores/entities.store, @/features/security/composables/useSecurityZoneRooms, @/features/security/utils/zone-mode.util, @/features/security/utils/zone-room.util, @/shared/entity/utils/derived.util
 */
import { computed, type Ref } from 'vue'
import { useEntitiesStore } from '@/stores/entities.store'
import { useSecurityZoneRooms } from '@/features/security/composables/useSecurityZoneRooms'
import {
  shouldZoneAlarmInMode,
  zoneModeHint,
  isSensorAlertState,
  type ArmingMode,
  type SecurityZoneType,
} from '@/features/security/utils/zone-mode.util'
import {
  classifySecurityBinarySensor,
  zoneTypeLabel,
  type SecurityZoneDraft,
} from '@/features/security/utils/zone-room.util'
import { getEntityDisplayName } from '@/shared/entity/utils/derived.util'

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
  function enrichZone(
    zone: SecurityZoneDraft & { armed?: boolean; sensors?: string[] },
    mode: ArmingMode,
  ) {
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
      offlineCount: sensors.filter((s) => s.offline).length,
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
        // 分类传感器，获取类型标签
        const cls = classifySecurityBinarySensor(entityId, name)
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