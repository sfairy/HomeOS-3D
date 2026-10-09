/**
 * @file useDeviceGroupMembers.ts
 * @module composables/entity
 * @description DeviceGroupModal 成员列表与域标签/颜色映射。
 *
 * 职责：提供随语言切换刷新的域标签/颜色映射，以及"按 ID 从 store 取实体"的统一 getter。
 *      域常量（MONITORED_ENTITY_IDS / DOMAIN_LIST）请直接从 `@/constants/device-group` 导入。
 *
 * 依赖：
 * - @/constants/entity-domain-meta（域颜色查询）
 */
import { entityDomainColor } from '@/constants/entity-domain-meta'

/**
 * 随语言切换返回最新标签（勿在模块顶层缓存）。
 * 标签中含 emoji 与中文说明，颜色取自 entity-domain-meta。
 */
export function getDomainMap() {
  return {
    light: { label: '💡 常用灯光', color: entityDomainColor('light') },
    climate: { label: '🌡️ 常用温控', color: entityDomainColor('climate') },
    sensor: { label: '📡 常用传感', color: entityDomainColor('sensor') },
    switch: { label: '🔌 常用开关', color: entityDomainColor('switch') },
    battery: { label: '🪫 全局低电量告警', color: '#fb923c' },
    offline: { label: '🔴 离线设备诊断', color: '#f87171' },
    lock: { label: '🔐 安全门锁', color: entityDomainColor('lock') },
    cover: { label: '🪟 窗帘卷帘', color: entityDomainColor('cover') },
    camera: { label: '📷 监控设备', color: entityDomainColor('camera') },
    media_player: { label: '🎵 多媒体', color: entityDomainColor('media_player') },
    fan: { label: '🌀 风扇设备', color: entityDomainColor('fan') },
    vacuum: { label: '🧹 扫地机器人', color: entityDomainColor('vacuum') },
  }
}
/**
 * 按 ID 从实体字典中取实体，未命中返回 null。
 *
 * @param entities 实体字典
 * @param eid 实体 ID
 * @returns 实体对象或 null
 */
export function getEntityFromStore(
  entities: Record<string, unknown>,
  eid: string,
) {
  return entities[eid] || null
}
