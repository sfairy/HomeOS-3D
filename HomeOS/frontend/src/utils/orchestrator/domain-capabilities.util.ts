/**
 * 联动器 domain 能力判定
 *
 * 职责：
 * - 把 entity_id / domain+service 映射到具体设备类别（light / cover / climate / media_player / fan / lock）。
 * - 用于 Scene YAML、Service Data Panel 等需要按设备类型筛选可用字段 / 服务的场景。
 *
 * 依赖：@homeos/shared 的 getEntityDomain。
 *
 * 注意：domain 名为 HA 配置值，不翻译。
 */

import { getEntityDomain } from '@homeos/shared'

/** 灯具类 domain */
const LIGHT_DOMAINS = ['light']
/** 窗帘类 domain */
const COVER_DOMAINS = ['cover']
/** 恒温/热水器类 domain */
const CLIMATE_DOMAINS = ['climate', 'water_heater']
/** 媒体播放器类 domain */
const MEDIA_DOMAINS = ['media_player']
/** 风扇类 domain */
const FAN_DOMAINS = ['fan']
/** 门锁类 domain */
const LOCK_DOMAINS = ['lock']

/** 空值归一化为空字符串 */
function asEntityId(entityId: string | null | undefined) {
  return entityId || ''
}

/** 是否为灯具实体 */
export function isLightDomain(entityId: string | null | undefined) {
  return LIGHT_DOMAINS.includes(getEntityDomain(asEntityId(entityId)))
}

/** 是否为窗帘实体 */
export function isCoverDomain(entityId: string | null | undefined) {
  return COVER_DOMAINS.includes(getEntityDomain(asEntityId(entityId)))
}

/** 是否为恒温/热水器实体 */
export function isClimateDomain(entityId: string | null | undefined) {
  return CLIMATE_DOMAINS.includes(getEntityDomain(asEntityId(entityId)))
}

/** 是否为媒体播放器实体 */
export function isMediaDomain(entityId: string | null | undefined) {
  return MEDIA_DOMAINS.includes(getEntityDomain(asEntityId(entityId)))
}

/** 是否为风扇实体 */
export function isFanDomain(entityId: string | null | undefined) {
  return FAN_DOMAINS.includes(getEntityDomain(asEntityId(entityId)))
}

/** 是否为门锁实体 */
export function isLockDomain(entityId: string | null | undefined) {
  return LOCK_DOMAINS.includes(getEntityDomain(asEntityId(entityId)))
}

/** 是否为灯具开/关服务（turn_on / toggle） */
export function isLightService(domain?: string | null, service?: string | null) {
  return domain === 'light' && (service === 'turn_on' || service === 'toggle')
}

/** 是否为窗帘位置/开合服务（set_cover_position / open_cover / close_cover） */
export function isCoverService(domain?: string | null, service?: string | null) {
  return (
    domain === 'cover' &&
    ['set_cover_position', 'open_cover', 'close_cover'].includes(String(service))
  )
}

/** 是否为媒体播放器常用服务（volume_set / select_source / play_media） */
export function isMediaService(domain?: string | null, service?: string | null) {
  return (
    domain === 'media_player' &&
    ['volume_set', 'select_source', 'play_media'].includes(String(service))
  )
}
