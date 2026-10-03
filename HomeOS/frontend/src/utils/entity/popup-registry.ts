/**
 * @module entity-popup-registry
 * @description 实体控制弹窗组件注册表。
 *
 * 职责：
 * - 按域注册各实体的控制弹窗组件（懒加载）。
 * - 根据 entity_id 解析对应的弹窗组件（与户型图热点一致）。
 * - 生成弹窗 props，判断实体是否支持控制弹窗及触发方式。
 *
 * 依赖：
 * - `@homeos/shared`：getEntityDomain。
 * - `lazy-component`：弹窗组件懒加载。
 * - `useEntityType`：实体类型判定（净水器 / 饮水机 / 冰箱 / 能源 / 通信等）。
 */
import type { Component } from 'vue'
import { getEntityDomain } from '@homeos/shared'
import { lazyComponent } from '@/utils/core/lazy-component'
import type { HaEntityState, EntitiesMap } from '@/types/entity-store'

const LightControlPopup = lazyComponent(
  () => import('@/components/entities/popups/LightControlPopup.vue'),
)
const SwitchControlPopup = lazyComponent(
  () => import('@/components/entities/popups/SwitchControlPopup.vue'),
)
const ClimateControlPopup = lazyComponent(
  () => import('@/components/entities/popups/ClimateControlPopup.vue'),
)
const CoverControlPopup = lazyComponent(
  () => import('@/components/entities/popups/CoverControlPopup.vue'),
)
const HvacControlPopup = lazyComponent(
  () => import('@/components/entities/popups/HvacControlPopup.vue'),
)
import {
  isElectricityEntity,
  isGasEntity,
  isWaterEntity,
  isCommEntity,
  isWaterPurifierEntity,
  isDispenserEntity,
  isFridgeEntity,
  isFreshAirEntity,
} from '@/composables/entity/useEntityType'

const AsyncMediaPlayerPopup = lazyComponent(
  () => import('@/components/entities/popups/MediaPlayerPopup.vue'),
)
const AsyncWaterHeaterPopup = lazyComponent(
  () => import('@/components/entities/popups/WaterHeaterPopup.vue'),
)
const AsyncWaterPurifierPopup = lazyComponent(
  () => import('@/components/entities/popups/WaterPurifierPopup.vue'),
)
const AsyncWaterDispenserPopup = lazyComponent(
  () => import('@/components/entities/popups/WaterDispenserPopup.vue'),
)
const AsyncRefrigeratorPopup = lazyComponent(
  () => import('@/components/entities/popups/RefrigeratorPopup.vue'),
)
const AsyncLockControlPopup = lazyComponent(
  () => import('@/components/entities/popups/LockControlPopup.vue'),
)
const AsyncVacuumControlPopup = lazyComponent(
  () => import('@/components/entities/popups/VacuumControlPopup.vue'),
)
const AsyncCameraControlPopup = lazyComponent(
  () => import('@/components/entities/popups/CameraControlPopup.vue'),
)
const AsyncHumidifierControlPopup = lazyComponent(
  () => import('@/components/entities/popups/HumidifierControlPopup.vue'),
)
const AsyncFreshAirControlPopup = lazyComponent(
  () => import('@/components/entities/popups/FreshAirControlPopup.vue'),
)
const AsyncAlarmControlPopup = lazyComponent(
  () => import('@/components/entities/popups/AlarmControlPopup.vue'),
)
const AsyncSirenControlPopup = lazyComponent(
  () => import('@/components/entities/popups/SirenControlPopup.vue'),
)
const AsyncValveControlPopup = lazyComponent(
  () => import('@/components/entities/popups/ValveControlPopup.vue'),
)
const AsyncRemoteControlPopup = lazyComponent(
  () => import('@/components/entities/popups/RemoteControlPopup.vue'),
)
const AsyncUtilityMeterInfoPopup = lazyComponent(
  () => import('@/components/entities/popups/UtilityMeterInfoPopup.vue'),
)
const AsyncCommInfoPopup = lazyComponent(
  () => import('@/components/entities/popups/CommInfoPopup.vue'),
)
const AsyncInputSelectPopup = lazyComponent(
  () => import('@/components/entities/popups/InputSelectPopup.vue'),
)
const AsyncInputNumberPopup = lazyComponent(
  () => import('@/components/entities/popups/InputNumberPopup.vue'),
)
const AsyncInputButtonPopup = lazyComponent(
  () => import('@/components/entities/popups/InputButtonPopup.vue'),
)
const AsyncTimerCounterPopup = lazyComponent(
  () => import('@/components/entities/popups/TimerCounterPopup.vue'),
)
const AsyncGenericEntityInfoPopup = lazyComponent(
  () => import('@/components/entities/popups/GenericEntityInfoPopup.vue'),
)

/**
 * 判断是否为暖通（HVAC）类实体。
 *
 * 通过 entity_id 中的关键词（地暖 / 新风 / 暖气 / 壁挂炉等中英文标识）识别，
 * 用于将 climate 域中的暖通实体路由到 HvacControlPopup 而非 ClimateControlPopup。
 *
 * @param entityId 实体 ID。
 * @returns 是暖通类实体返回 true，否则返回 false。
 */
function isHvacEntity(entityId: string): boolean {
  if (!entityId) return false
  const id = entityId.toLowerCase()
  return (
    id.includes('floor_heating') ||
    id.includes('地暖') ||
    id.includes('fresh_air') ||
    id.includes('ventilation') ||
    id.includes('新风') ||
    id.includes('暖气') ||
    id.includes('wall_boiler') ||
    id.includes('壁挂炉')
  )
}

/** 通过属性特征识别新风/全热交换器（即使命名不含关键词） */
function isFreshAirAttrEntity(entityId: string, entities: EntitiesMap): boolean {
  const ent = entities[entityId] as HaEntityState | undefined
  const attrs = (ent?.attributes || {}) as Record<string, unknown>
  const hasTimer = Array.isArray(attrs.timer_preset_modes) && attrs.timer_preset_modes.length > 0
  const hasSpeed = attrs.percentage != null && attrs.percentage_step != null
  if (!hasTimer && !hasSpeed) return false
  const domain = getEntityDomain(entityId)
  if (domain !== 'fan' && domain !== 'climate') return false
  // climate 地暖等也有温度时交给 Hvac；仅风速类新风走此分支
  if (domain === 'climate' && (attrs.temperature != null || attrs.current_temperature != null)) {
    return false
  }
  return hasTimer || (hasSpeed && typeof attrs.preset_mode === 'string')
}

const popupComponentMap: Record<string, Component> = {
  climate: ClimateControlPopup,
  fan: ClimateControlPopup,
  light: LightControlPopup,
  media_player: AsyncMediaPlayerPopup,
  water_heater: AsyncWaterHeaterPopup,
  cover: CoverControlPopup,
  lock: AsyncLockControlPopup,
  vacuum: AsyncVacuumControlPopup,
  camera: AsyncCameraControlPopup,
  humidifier: AsyncHumidifierControlPopup,
  alarm_control_panel: AsyncAlarmControlPopup,
  siren: AsyncSirenControlPopup,
  valve: AsyncValveControlPopup,
  remote: AsyncRemoteControlPopup,
  select: AsyncInputSelectPopup,
  input_select: AsyncInputSelectPopup,
  number: AsyncInputNumberPopup,
  input_number: AsyncInputNumberPopup,
  button: AsyncInputButtonPopup,
  input_button: AsyncInputButtonPopup,
  timer: AsyncTimerCounterPopup,
  counter: AsyncTimerCounterPopup,
  input_text: AsyncTimerCounterPopup,
  switch: SwitchControlPopup,
  input_boolean: SwitchControlPopup,
  scene: AsyncGenericEntityInfoPopup,
  script: AsyncGenericEntityInfoPopup,
  automation: AsyncGenericEntityInfoPopup,
}

/**
 * 根据 entity_id 解析控制弹窗组件（与户型图热点一致）。
 *
 * 解析顺序：
 * 1. 新风专属弹窗（带设定温度的 climate 新风除外）。
 * 2. climate 域暖通实体 → HvacControlPopup。
 * 3. 净水 / 管线机 / 冰箱专属弹窗（优先于 domain，避免 switch 域抢占）。
 * 4. 域映射表（含 fan → ClimateControlPopup，覆盖风扇/烟机/空气净化器）。
 * 5. 能源 / 通信信息弹窗。
 *
 * @param entityId 实体 ID。
 * @param entities 实体映射表（用于类型判定）。
 * @returns 弹窗组件；无匹配时返回 null。
 */
export function resolveEntityPopupComponent(
  entityId: string,
  entities: EntitiesMap = {},
): Component | null {
  if (!entityId) return null
  const domain = getEntityDomain(entityId)
  const freshAirLike =
    isFreshAirEntity(entityId, entities) || isFreshAirAttrEntity(entityId, entities)
  if (freshAirLike) {
    const attrs = ((entities[entityId] as HaEntityState | undefined)?.attributes ||
      {}) as Record<string, unknown>
    const hasClimateTemp =
      domain === 'climate' &&
      (attrs.temperature != null ||
        attrs.current_temperature != null ||
        attrs.target_temp_low != null)
    // 带设定温度的暖通新风仍走地暖/温控弹窗
    if (!hasClimateTemp) return AsyncFreshAirControlPopup
  }
  if (domain === 'climate' && isHvacEntity(entityId)) return HvacControlPopup
  // 专属家电优先于 domain 映射（避免 switch/fan 域抢占专用弹窗）
  if (isWaterPurifierEntity(entityId, entities)) return AsyncWaterPurifierPopup
  if (isDispenserEntity(entityId, entities)) return AsyncWaterDispenserPopup
  if (isFridgeEntity(entityId, entities)) return AsyncRefrigeratorPopup
  const mapped = popupComponentMap[domain]
  if (mapped) return mapped
  if (isElectricityEntity(entityId) || isGasEntity(entityId) || isWaterEntity(entityId)) {
    return AsyncUtilityMeterInfoPopup
  }
  if (isCommEntity(entityId)) return AsyncCommInfoPopup
  // 无专用面板时仍可查看状态 / 触发 scene·script 等通用操作
  return AsyncGenericEntityInfoPopup
}

/**
 * 生成弹窗 props（entity 对象或 entityId）。
 *
 * 能源 / 通信类实体仅传 entityId（弹窗内部自行拉取）；
 * 其他实体通过 getEntity 取实体对象后传入。
 *
 * @param entityId 实体 ID。
 * @param getEntity 可选的实体获取函数。
 * @returns 弹窗 props 对象。
 */
export function getEntityPopupProps(
  entityId: string,
  getEntity?: (id: string) => HaEntityState | null | undefined,
): { entityId?: string; entity?: HaEntityState } {
  if (!entityId) return {}
  if (
    isElectricityEntity(entityId) ||
    isGasEntity(entityId) ||
    isWaterEntity(entityId) ||
    isCommEntity(entityId)
  ) {
    return { entityId }
  }
  const entity = typeof getEntity === 'function' ? getEntity(entityId) : null
  return entity ? { entity } : {}
}

/**
 * 判断实体是否可打开控制/信息弹窗（含通用兜底）。
 */
export function hasEntityControlPopup(entityId: string, entities: EntitiesMap = {}): boolean {
  return !!resolveEntityPopupComponent(entityId, entities)
}

/**
 * 判断实体弹窗是否支持点击打开。
 *
 * 灯光域短按为开关操作，弹窗需长按触发；其他域支持点击直接打开弹窗。
 *
 * @param entityId 实体 ID。
 * @returns 非灯光域返回 true，灯光域返回 false。
 */
export function entityPopupOpensOnClick(entityId: string): boolean {
  return getEntityDomain(entityId) !== 'light'
}
