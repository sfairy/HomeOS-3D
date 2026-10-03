/**
 * 事件日志浮层实体域集合与补水工具
 *
 * 所属模块：utils/entity
 * 职责：定义即时消息墙 / 低延迟状态监听的实体域白名单（与 Tier A 控制类设备对齐，
 *      含 light/switch/fan/climate/binary_sensor/lock/cover/media_player/vacuum/water_heater/alarm_control_panel）；
 *      提供事件日志浮层 API 补水用的实体 ID 收集逻辑，优先取用户收藏实体，叠加白名单域实体与全部 binary_sensor，
 *      上限 30 条，保证浮层可展示的实体数据在加载期已同步到前端。
 * 导出：EVENT_LOG_OVERLAY_DOMAINS（常量元组）、isEventLogOverlayDomain（判定函数）、
 *      collectOverlayHydrationEntityIds（补水实体 ID 收集）。
 */
import { getEntityDomain } from '@homeos/shared'
import type { EntitiesMap } from '@/types/entity-store'
import type { UILayoutConfig } from '@/types/layout'

/** 即时消息墙 / 低延迟状态监听实体域（与 Tier A 控制类设备对齐） */
export const EVENT_LOG_OVERLAY_DOMAINS = [
  'light',
  'switch',
  'fan',
  'climate',
  'binary_sensor',
  'lock',
  'cover',
  'media_player',
  'vacuum',
  'water_heater',
  'alarm_control_panel',
] as const satisfies readonly string[]

const OVERLAY_DOMAIN_SET = new Set<string>(EVENT_LOG_OVERLAY_DOMAINS)

/** isEventLogOverlayDomain：函数，按签名入参返回处理结果。 */
export function isEventLogOverlayDomain(entityId: string): boolean {
  return OVERLAY_DOMAIN_SET.has(getEntityDomain(entityId))
}

interface OverlayEntitiesStore {
  entities: EntitiesMap
}

interface OverlayUIStore {
  layoutConfig?: UILayoutConfig
}

/** 浮层 API 补水用的实体 ID（与 SystemTimelineWidget 策略一致，上限 30） */
export function collectOverlayHydrationEntityIds(
  entitiesStore: OverlayEntitiesStore,
  uiStore: OverlayUIStore,
  limit = 30,
): string[] {
  const favorites = Object.values(uiStore.layoutConfig?.favoriteEntities || {}).flat()
  const allIds = Object.keys(entitiesStore.entities || {})
  const domainEntities = allIds.filter((id) => isEventLogOverlayDomain(id))
  const binarySensors = allIds.filter((id) => id.startsWith('binary_sensor.'))
  return [...new Set([...favorites, ...domainEntities, ...binarySensors])].slice(0, limit)
}
