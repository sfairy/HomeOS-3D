/**
 * @file useDeviceGroupMembers.ts
 * @module composables/entity
 * @description DeviceGroupModal 成员列表与域常量。
 *
 * 职责：导出设备分组常用的实体 ID 后缀、域白名单，以及随语言切换刷新的域标签/颜色映射；
 *      提供"按 ID 从 store 取实体"的统一 getter（便于替换实现）。
 *
 * 依赖：
 * - @/constants/entity-domain-meta（域颜色查询）
 */
import { entityDomainColor } from '@/constants/entity-domain-meta'

/** 监控型实体 ID 后缀白名单：用于在分组中识别监测类成员（消耗、运行时间、CPU、内存等） */
export const MONITORED_ENTITY_IDS = [
  '_consumption',
  '_uptime',
  '_cpu_',
  '_memory_',
  '_version',
  '_ip_',
  '_monitor',
  '_num',
  '_count',
]
/** 设备分组支持的 HA domain 白名单 */
export const DOMAIN_LIST = [
  'light',
  'switch',
  'sensor',
  'binary_sensor',
  'climate',
  'lock',
  'cover',
  'fan',
  'water_heater',
  'vacuum',
  'camera',
  'media_player',
]
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
