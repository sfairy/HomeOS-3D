/**
 * @file useHazardBindingStatus.ts
 * @module composables/security
 * @description 危险传感器绑定状态 composable，汇总烟感/燃气/水浸及其联动设备的实时状态。
 *   - 基于 config 与实体仓库构建状态行（rows）：传感器、阀门、排风
 *   - 通过 getDomainEpoch 触发响应式依赖，确保实体状态变化时重算
 *   - 派生告警数、离线数与受监测实体 ID 列表，供 UI 展示与轮询订阅
 * @dependencies vue, @homeos/shared, @/stores/entities.store, @/shared/entity/utils/derived.util
 */
import { computed, type Ref } from 'vue'
import {
  collectHazardBindingSummary,
  collectHazardWatchedEntityIds,
  type HazardSensorKind,
  getEntityLeaf,
} from '@homeos/shared'
import { useEntitiesStore } from '@/domain/entity/store/entities.store'
import { getEntityDisplayName } from '@/domain/entity/model/utils/derived.util'
import { countOfflineDevices } from '@/domain/entity/model/utils/group-offline.util'

/** 危险绑定行类型：传感器种类扩展阀门与排风 */
type HazardBindingRowKind = HazardSensorKind | 'gas_valve' | 'water_valve' | 'exhaust'

/**
 * 危险绑定状态行
 */
interface HazardBindingStatusRow {
  /** 实体 ID */
  entityId: string
  /** 行类型 */
  kind: HazardBindingRowKind
  /** 类型中文标签 */
  kindLabel: string
  /** 实体显示名称 */
  name: string
  /** 状态：离线 / 正常 / 告警 */
  status: 'offline' | 'ok' | 'alert'
  /** 状态中文标签 */
  statusLabel: string
}

/** 危险传感器种类到中文标签的映射 */
const KIND_LABELS: Record<HazardSensorKind, string> = {
  smoke: '烟感',
  gas: '燃气',
  leak: '水浸',
}

/**
 * 判断实体状态是否为告警态
 * @param state 实体 state 字符串
 * @returns 是否告警；unavailable/unknown/off/0 视为非告警
 */
function isAlertState(state: string | undefined): boolean {
  // 离线或未知状态不算告警
  if (!state || state === 'unavailable' || state === 'unknown') return false
  // on/wet 直接告警；其他数值状态大于 0 视为告警
  return state === 'on' || state === 'wet' || (state !== 'off' && parseFloat(String(state)) > 0)
}

/**
 * 解析实体状态为状态行字段
 * @param entity 实体对象
 * @returns status 与 statusLabel
 */
function resolveStatus(entity: { state?: string } | undefined): Pick<HazardBindingStatusRow, 'status' | 'statusLabel'> {
  // 离线优先判定
  if (!entity || entity.state === 'unavailable' || entity.state === 'unknown') {
    return { status: 'offline', statusLabel: '离线' }
  }
  // 告警态判定
  if (isAlertState(entity.state)) return { status: 'alert', statusLabel: '告警' }
  return { status: 'ok', statusLabel: '正常' }
}

/**
 * 从配置对象构建 HA 配置对象（统一字段名）
 * @param input 原始配置
 * @returns HA 配置对象
 */
function buildHaConfigFromModels(input: {
  hazardSmokeEntityIds?: string[]
  hazardGasEntityIds?: string[]
  hazardLeakEntityIds?: string[]
  hazardGasValveEntityId?: string
  hazardWaterValveEntityId?: string
  hazardExhaustFanEntityIds?: string
}): Record<string, unknown> {
  return {
    hazardSmokeEntityIds: input.hazardSmokeEntityIds,
    hazardGasEntityIds: input.hazardGasEntityIds,
    hazardLeakEntityIds: input.hazardLeakEntityIds,
    hazardGasValveEntityId: input.hazardGasValveEntityId,
    hazardWaterValveEntityId: input.hazardWaterValveEntityId,
    hazardExhaustFanEntityIds: input.hazardExhaustFanEntityIds,
  }
}

/**
 * 危险绑定状态 composable
 * @param config 响应式配置对象，包含各类危险传感器与联动设备 ID
 * @returns rows 状态行 / watchedIds 受监测 ID / alertCount 告警数 / offlineCount 离线数
 */
export function useHazardBindingStatus(
  config: Ref<{
    hazardSmokeEntityIds?: string[]
    hazardGasEntityIds?: string[]
    hazardLeakEntityIds?: string[]
    hazardGasValveEntityId?: string
    hazardWaterValveEntityId?: string
    hazardExhaustFanEntityIds?: string
  }>,
) {
  const entitiesStore = useEntitiesStore()

  // 状态行列表：聚合传感器、阀门、排风
  const rows = computed((): HazardBindingStatusRow[] => {
    // 触发各 domain 的响应式依赖，实体状态变化时重算
    void entitiesStore.getDomainEpoch('binary_sensor')
    void entitiesStore.getDomainEpoch('sensor')
    void entitiesStore.getDomainEpoch('valve')
    void entitiesStore.getDomainEpoch('fan')
    void entitiesStore.getDomainEpoch('switch')
    const ha = buildHaConfigFromModels(config.value)
    const summary = collectHazardBindingSummary(ha)
    const list: HazardBindingStatusRow[] = []

    /**
     * 推送一行到状态列表
     * @param entityId 实体 ID
     * @param kind 行类型
     * @param kindLabel 类型中文标签
     */
    const push = (entityId: string, kind: HazardBindingRowKind, kindLabel: string) => {
      const entity = entitiesStore.entities[entityId]
      const { status, statusLabel } = resolveStatus(entity)
      list.push({
        entityId,
        kind,
        kindLabel,
        // 实体存在时取友好名，否则回退到 entity_id 末段
        name: entity ? getEntityDisplayName(entityId, entity) : getEntityLeaf(entityId),
        status,
        statusLabel,
      })
    }

    // 依次推送烟感、燃气、水浸传感器
    for (const id of summary.smoke) push(id, 'smoke', KIND_LABELS.smoke)
    for (const id of summary.gas) push(id, 'gas', KIND_LABELS.gas)
    for (const id of summary.leak) push(id, 'leak', KIND_LABELS.leak)

    // 燃气阀门：配置缺省时回退到 valve.gas_main；仅当存在烟感或燃气时展示
    const gasValve = String(config.value.hazardGasValveEntityId ?? '').trim() || 'valve.gas_main'
    // 水阀：配置缺省时回退到 valve.water_main
    const waterValve = String(config.value.hazardWaterValveEntityId ?? '').trim() || 'valve.water_main'
    if (summary.smoke.length || summary.gas.length) push(gasValve, 'gas_valve', '燃气关阀')
    if (summary.leak.length) push(waterValve, 'water_valve', '漏水关阀')

    // 排风：优先使用显式配置；缺省时存在烟感/燃气回退到 fan.exhaust
    const fans = String(config.value.hazardExhaustFanEntityIds ?? '')
      .split(/[,;\s]+/)
      .map((s) => s.trim())
      .filter(Boolean)
    const fanTargets = fans.length ? fans : summary.smoke.length || summary.gas.length ? ['fan.exhaust'] : []
    for (const fan of fanTargets) push(fan, 'exhaust', '排风')

    return list
  })

  // 受监测的实体 ID 列表，供轮询订阅使用
  const watchedIds = computed(() => collectHazardWatchedEntityIds(buildHaConfigFromModels(config.value)))
  // 告警行数
  const alertCount = computed(() => rows.value.filter((r) => r.status === 'alert').length)
  // 离线行数
  //
  // 按**设备**计：危险源面板列的是「一路监测」，而同一台探测器的
  // 报警 / 电量 / 信号实体可能同时 offline，按实体数会把一台设备报成 3 条。
  const offlineCount = computed(() => countOfflineRowsByDevice(rows.value, entitiesStore.entities))

  return { rows, watchedIds, alertCount, offlineCount }
}

/**
 * 把「离线行」折算成**设备**台数。
 *
 * 抽成模块级函数而不是内联 computed：逻辑本身与组件状态无关，
 * 独立出来也让「行 → 设备」这一步可以单独测。
 *
 * @param rows 危险源状态行（每行是一个实体）
 * @param entities 实体表（读 `attributes.device_id`）
 */
export function countOfflineRowsByDevice(
  rows: Array<{ entityId: string; status: string }>,
  entities: Record<string, { attributes?: Record<string, unknown> } | undefined>,
): number {
  return countOfflineDevices(
    rows.filter((row) => row.status === 'offline').map((row) => row.entityId),
    entities,
  )
}
