/**
 * 户型图热点放置组合式工具
 *
 * 所属模块：composables/widget
 * 职责：将实体 ID 与鼠标/触摸坐标转换为户型图（Floorplan）上的 widget 配置对象，
 *      供拖放放置与点击放置场景统一复用；提供按实体 domain 推断部件类型、
 *      生成默认状态图标与标签映射、客户端坐标到百分比坐标换算等核心能力。
 * 关键函数：
 *   - resolveWidgetType：按专属家电识别 → binary_sensor 映射 → domain 表 → 兜底的四级推断策略
 *   - buildWidgetPayload：组装 FloorWidget 配置（含坐标、锚点、状态图标/标签默认值）
 *   - clientToFloorPct：从鼠标/触摸事件计算户型图内百分比坐标
 * 依赖：@homeos/shared（getEntityDomain）、useEntityType（专属部件识别）、
 *      entity-state-labels（状态文案）、hotspot-layout.util（户型图度量）。
 */
import { getEntityDomain } from '@homeos/shared'
/**
 * 户型图热点放置：解析部件类型并构建 widget 载荷（拖放 / 点击放置共用）。
 *
 * 所属模块：widget/composables
 * 职责：将实体 ID / 鼠标坐标转换为户型图（Floorplan）上的 widget 配置，
 *      提供按 domain 推断部件类型、生成默认状态图标与标签、坐标百分比换算等能力。
 * 依赖：
 *   - @homeos/shared（getEntityDomain 解析实体域）
 *   - @/composables/entity/useEntityType（专属部件识别与建议状态合并）
 *   - @/constants/entity-state-labels（状态本地化文案）
 *   - @/types/{entity, layout}（实体快照与楼层 widget 类型）
 *   - @/utils/floorplan/floorplan-hotspot-layout.util（户型图布局度量）
 *   - @/utils/core/misc.util（clampPct 百分比限幅）
 */
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
  mergeSuggestedStates,
  getDefaultStateIcons,
} from '@/composables/entity/useEntityType'
import { entityStateLabel } from '@/constants/entity-state-labels'
import type { EntitySnapshot } from '@/types/entity'
import type { FloorWidget } from '@/types/layout'
import {
  clientToFloorLayoutPct,
  getFloorplanLayoutMetrics,
} from '@/utils/floorplan/hotspot-layout.util'
import { clampPct } from '@/utils/core/misc.util'

/** domain -> 户型图 widget 类型映射表（用于按 domain 直接派发对应部件） */
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
 * 根据实体 ID 推断户型图部件类型。
 *
 * 解析顺序：
 * 1. 专属家电识别（新风/净水/管线/冰箱/洗衣/烟机/灶/净化器/加湿）；
 * 2. binary_sensor 按 device_class 映射传感器部件；
 * 3. domain → WIDGET_TYPE_MAP；
 * 4. 兜底 BadgeWidget / ToggleWidget。
 *
 * @param {string} entityId  实体 ID
 * @param {EntitiesMap} [entities={}]  实体快照映射，用于辅助专属部件识别
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

/**
 * 将画布坐标（百分比）转为 widget 配置对象。
 *
 * @param {object} payload  含实体 ID 与可选 widget 类型
 * @param {EntitiesMap} entities  实体快照映射
 * @param {number} xPct  画布横坐标百分比（0-100）
 * @param {number} yPct  画布纵坐标百分比（0-100）
 * @returns 户型图 FloorWidget 配置对象（含坐标、锚点、状态图标与标签默认值）
 */
export function buildWidgetPayload(
  payload: {
    id: string
    type?: string
  },
  entities: EntitiesMap,
  xPct: number,
  yPct: number,
): FloorWidget {
  const { id, type } = payload
  const entity = entities[id]
  const resolvedType = type || resolveWidgetType(id, entities)
  const states = mergeSuggestedStates(resolvedType, entity)
  const defaults = getDefaultStateIcons(resolvedType, id, entities)
  // 按建议状态构建状态->图标映射表（缺省补空串）
  const stateIcons =
    states.length > 0
      ? Object.fromEntries(states.map((s: string) => [s, defaults[s] || '']))
      : {}
  // 按建议状态构建状态->本地化标签映射表（缺省回退到状态原值）
  const stateLabels =
    states.length > 0
      ? Object.fromEntries(
          states.map((s: string) => [s, entityStateLabel(s) || s]),
        )
      : {}
  return {
    id,
    type: resolvedType,
    xPct: clampPct(xPct),
    yPct: clampPct(yPct),
    hotspotAnchor: 'icon',
    overlayImage: null,
    label: '',
    stateIcons,
    stateLabels,
  }
}

/** 鼠标事件类似结构（兼容鼠标 / 触摸事件） */
type PointerEventLike = {
  clientX?: number
  clientY?: number
  touches?: Array<{
    clientX: number
    clientY: number
  }>
}

/**
 * 从鼠标事件计算户型图内的百分比坐标（CSS left/top % 基准）。
 *
 * @param {PointerEventLike} event  鼠标或触摸事件
 * @param {object | HTMLElement | null | undefined} rectOrElement  户型图区域 DOM 元素或其 bounding rect
 * @returns {{ xPct: number, yPct: number }}  0-100 范围内的坐标百分比；无法解析时返回 {0,0}
 */
export function clientToFloorPct(
  event: PointerEventLike,
  rectOrElement:
    | {
        left: number
        top: number
        width: number
        height: number
      }
    | HTMLElement
    | null
    | undefined,
): {
  xPct: number
  yPct: number
} {
  // 优先取 clientX/clientY，触摸事件取第一个触点
  const x = event.clientX ?? event.touches?.[0]?.clientX ?? 0
  const y = event.clientY ?? event.touches?.[0]?.clientY ?? 0
  if (rectOrElement instanceof HTMLElement) {
    // DOM 元素：通过 floorplan-hotspot-layout 工具获取度量并换算（考虑缩放/偏移）
    const metrics = getFloorplanLayoutMetrics(rectOrElement)
    if (!metrics) return { xPct: 0, yPct: 0 }
    return clientToFloorLayoutPct(x, y, metrics)
  }
  // 已有 rect：直接按几何换算
  const rect = rectOrElement
  if (!rect?.width || !rect?.height) return { xPct: 0, yPct: 0 }
  const xPct = ((x - rect.left) / rect.width) * 100
  const yPct = ((y - rect.top) / rect.height) * 100
  return {
    xPct: Math.max(0, Math.min(100, parseFloat(xPct.toFixed(2)))),
    yPct: Math.max(0, Math.min(100, parseFloat(yPct.toFixed(2)))),
  }
}
