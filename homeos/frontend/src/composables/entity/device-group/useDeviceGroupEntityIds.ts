/** 并维护"是否显示审计面板"开关。 */
import { ref } from 'vue'
import { resolveDeviceGroupEntityIds } from '@/composables/device/group-counts.util'
import type {
  DeviceGroupEntitiesStoreLike,
  DeviceGroupUiStoreLike,
} from '@/shared/device/utils/group-battery.util'

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
   */
  function computeEntityIds(
    props: { domain?: string; statsSensors?: Record<string, unknown> },
    entitiesStore: DeviceGroupEntitiesStoreLike,
    uiStore: DeviceGroupUiStoreLike,
  ) {
    const domain = props.domain
    // 优先用 props.statsSensors，否则兜底到 uiStore.layoutConfig.statsSensors
    const statsId = props.statsSensors || uiStore.layoutConfig.statsSensors
    entityIds.value = resolveDeviceGroupEntityIds(
      domain || '',
      entitiesStore,
      uiStore,
      statsId as Record<string, string | undefined> | null | undefined,
    )
  }
  return { entityIds, showAudit, computeEntityIds }
}
