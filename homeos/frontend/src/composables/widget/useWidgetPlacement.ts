/**
 * 部件类型推断组合式工具
 *
 * 职责：根据实体 ID 推断 3D 场景 / 实体栅格中应使用的部件类型，
 *      供实体侧栏拖拽与点击放置复用（旧 2D 户型图热点放置载荷已随楼层模型移除）。
 *
 * 关键函数：
 *   - resolveWidgetType：按专属家电识别 → binary_sensor 映射 → domain 表 → 兜底的四级推断策略
 * 依赖：@homeos/shared（getEntityDomain）、useEntityType（专属部件识别）。
 */
import { getEntityDomain } from '@homeos/shared'
import {
  isWaterPurifierEntity,
  isDispenserEntity,
  isFridgeEntity,
  isFreshAirEntity,
  isWashingMachineEntity,
  isRangeHoodEntity,
  isGasStoveEntity,
  isAirPurifierEntity,
  isHumidifierEntity,
  resolveBinarySensorWidgetType,
} from '@/composables/entity/useEntityType'
import type { EntitySnapshot } from '@/types/entity'

/** domain -> 部件类型映射表（用于按 domain 直接派发对应部件） */
const WIDGET_TYPE_MAP: Record<string, string> = {
  light: 'ToggleWidget',
  switch: 'ToggleWidget',
  input_boolean: 'ToggleWidget',
  button: 'ToggleWidget',
  sensor: 'BadgeWidget',
  binary_sensor: 'BadgeWidget',
  number: 'BadgeWidget',
  input_number: 'BadgeWidget',
  select: 'BadgeWidget',
  input_select: 'BadgeWidget',
  device_tracker: 'BadgeWidget',
  person: 'BadgeWidget',
  weather: 'BadgeWidget',
  update: 'BadgeWidget',
  event: 'BadgeWidget',
  climate: 'ClimateWidget',
  fan: 'FanWidget',
  water_heater: 'WaterHeaterWidget',
  cover: 'CoverWidget',
  media_player: 'MediaWidget',
  lock: 'LockWidget',
  vacuum: 'VacuumWidget',
  camera: 'CameraWidget',
  humidifier: 'HumidifierWidget',
  scene: 'SceneWidget',
  script: 'SceneWidget',
  automation: 'SceneWidget',
  alarm_control_panel: 'AlarmWidget',
  remote: 'RemoteWidget',
  valve: 'ValveWidget',
  siren: 'SirenWidget',
}

/** 实体快照映射：entityId -> EntitySnapshot */
type EntitiesMap = Record<string, EntitySnapshot>

/**
 * 根据实体 ID 推断部件类型。
 *
 * 解析顺序：
 * 1. 专属家电识别（新风/净水/管线/冰箱/洗衣/烟机/灶/净化器/加湿）；
 * 2. binary_sensor 按 device_class 映射传感器部件；
 * 3. domain → WIDGET_TYPE_MAP；
 * 4. 兜底 BadgeWidget / ToggleWidget。
 *
 * @param entityId 实体 ID
 * @param entities 实体快照映射，用于辅助专属部件识别
 * @returns widget 类型字符串
 */
export function resolveWidgetType(entityId: string, entities: EntitiesMap = {}): string {
  if (isFreshAirEntity(entityId, entities)) return 'FreshAirWidget'
  if (isAirPurifierEntity(entityId, entities)) return 'AirPurifierWidget'
  if (isWaterPurifierEntity(entityId, entities)) return 'WaterPurifierWidget'
  if (isDispenserEntity(entityId, entities)) return 'DispenserWidget'
  if (isFridgeEntity(entityId, entities)) return 'FridgeWidget'
  if (isWashingMachineEntity(entityId, entities)) return 'WashingMachineWidget'
  if (isRangeHoodEntity(entityId, entities)) return 'RangeHoodWidget'
  if (isGasStoveEntity(entityId, entities)) return 'GasStoveWidget'
  if (isHumidifierEntity(entityId, entities)) return 'HumidifierWidget'

  const binaryType = resolveBinarySensorWidgetType(entityId, entities)
  if (binaryType) return binaryType

  const domain = getEntityDomain(entityId)
  const mapped = WIDGET_TYPE_MAP[domain]
  if (mapped) return mapped

  return entityId.startsWith('sensor') ? 'BadgeWidget' : 'ToggleWidget'
}
