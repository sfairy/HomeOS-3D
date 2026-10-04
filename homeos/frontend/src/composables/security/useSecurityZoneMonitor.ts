/**
 * @file useSecurityZoneMonitor.ts
 * @module composables/security
 * @description 安防区域监控 composable，将实时区域与布局配置合并并富化为可展示的结构。
 *   - 合并 liveZones（实时状态）与 layoutZones（布局配置）补充 roomId/zoneType
 *   - 为每个区域构建传感器行（含告警/离线判定与类型标签）
 *   - 派生区域汇总：总数、已布防数、告警数、当前模式下激活数
 * @dependencies vue, @/stores/entities.store, @/composables/security/useSecurityZoneRooms, @/utils/security/security-zone-mode.util, @/utils/security/security-zone-room.util, @/utils/entity/derived.util
 */
import { computed, type Ref } from 'vue'
import { useEntitiesStore } from '@/stores/entities.store'
import { useSecurityZoneRooms } from '@/composables/security/useSecurityZoneRooms'
import {
  shouldZoneAlarmInMode,
  zoneModeHint,
  isSensorAlertState,
  type ArmingMode,
} from '@/utils/security/zone-mode.util'
import {
  classifySecurityBinarySensor,
  zoneTypeLabel,
  type SecurityZoneDraft,
} from '@/utils/security/zone-room.util'
import { getEntityDisplayName } from '@/utils/entity/derived.util'

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
    return (liveZones.value || []).map((zone) => {
      // 从布局配置补充 roomId/zoneType
      const layout = layoutById.value.get(zone.id)
      const roomId = layout?.roomId || zone.roomId || ''
      const roomLabel = roomOptions.value.find((r) => r.id === roomId)?.label || ''
      const zoneType = zone.zoneType || layout?.zoneType || 'all'
      // 构建传感器行
      const sensors = buildSensorRows(zone.sensors || [])
      const alertCount = sensors.filter((s) => s.alert).length
      const offlineCount = sensors.filter((s) => s.offline).length
      // 判定当前模式下该区域类型是否会触发告警
      const activeInMode = shouldZoneAlarmInMode(mode as ArmingMode, zoneType)

      return {
        ...zone,
        roomId,
        roomLabel,
        zoneType,
        zoneTypeLabel: zoneTypeLabel(zoneType),
        modeHint: zoneModeHint(mode, zoneType),
        activeInMode,
        sensors,
        alertCount,
        offlineCount,
        sensorTotal: sensors.length,
      }
    })
  })

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