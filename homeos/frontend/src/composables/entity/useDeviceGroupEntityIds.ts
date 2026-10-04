/**
 * @file useDeviceGroupEntityIds.ts
 * @module composables/entity
 * @description 设备分组实体 ID 列表计算 composable。
 *
 * 职责：基于设备 domain、统计传感器配置与楼层 widgets，解析 DeviceGroupModal 应展示的实体 ID 列表，
 *      并维护"是否显示审计面板"开关。
 *
 * 依赖：
 * - vue（ref）
 * - @/utils/device/group-counts.util（resolveDeviceGroupEntityIds 实体 ID 解析）
 * - @/utils/device/group-battery.util（设备分组 store 形状类型）
 */
import { ref } from 'vue'
import { resolveDeviceGroupEntityIds } from '@/utils/device/group-counts.util'
import type {
  DeviceGroupEntitiesStoreLike,
  DeviceGroupUiStoreLike,
} from '@/utils/device/group-battery.util'

/** 楼层切片形状：用于从 layout 配置中提取 widget 列表 */
type FloorSlice = {
  id?: string
  widgets?: Array<{ id?: string }>
}

/**
 * 计算 DeviceGroupModal 展示的实体 ID 列表。
 *
 * @returns entityIds 当前实体 ID 列表 ref；showAudit 是否显示审计面板；computeEntityIds 主动重算方法
 */
export function useDeviceGroupEntityIds() {
  const entityIds = ref<string[]>([])
  const showAudit = ref(false)

  /**
   * 重新计算实体 ID 列表。
   *
   * @param props 含 domain 与 statsSensors 配置
   * @param entitiesStore 实体 store（提供按 ID 取实体）
   * @param uiStore UI store（含 layoutConfig.statsSensors 兜底配置）
   * @param floors 楼层列表（用于解析 widget 中的实体 ID）
   */
  function computeEntityIds(
    props: { domain?: string; statsSensors?: Record<string, unknown> },
    entitiesStore: DeviceGroupEntitiesStoreLike,
    uiStore: DeviceGroupUiStoreLike,
    floors: FloorSlice[] | { value?: FloorSlice[] },
  ) {
    const domain = props.domain
    // 优先用 props.statsSensors，否则兜底到 uiStore.layoutConfig.statsSensors
    const statsId = props.statsSensors || uiStore.layoutConfig.statsSensors
    entityIds.value = resolveDeviceGroupEntityIds(
      domain || '',
      entitiesStore,
      uiStore,
      floors,
      statsId as Record<string, string | undefined> | null | undefined,
    )
  }
  return { entityIds, showAudit, computeEntityIds }
}
