/**
 * @file state-change-filter.util.ts
 * @module shared/ha
 *
 * HA 状态变更事件的预过滤工具集合：
 *  - 判定实体域（domain）是否属于某类业务（能源 / 用水 / 环境 / 摄像头 / 儿童模式 等）
 *  - 判定事件是否涉及设备健康（离线 / 低电量）
 *  - 从自动化规则中收集需监听的 entity_id 与通配符前缀
 *  - 综合判定某自动化规则是否需处理某实体的事件
 *
 * 关键依赖：
 *  - ../types：提供 HaStateChangeEvent 类型
 *  - @homeos/shared：提供 getEntityDomain 用于从 entity_id 提取 domain
 *
 * 这些函数位于 HA 状态管道的 Hot Path 上，被 HaStateChangeRouterService 等服务调用做早期跳过。
 * 因此实现上保持纯函数 + 集合查找，避免分配与 IO。
 */
import type { HaStateChangeEvent } from '../types';
import { getEntityDomain } from '@homeos/shared';

export { getEntityDomain };

// 标准形 UUID 正则（8-4-4-4-12 hex），用于区分 HomeOS 内部生成的 UUID 与 HA 原生 entity_id
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * 判断字符串是否为 HomeOS UUID 格式。
 * @param value 待检测字符串
 * @returns 是否匹配 UUID 格式
 */
export function isHomeOsUuid(value: string): boolean {
  return UUID_RE.test(String(value || '').trim());
}

/** 是否涉及设备离线或低电量（通知健康检查用） */
export function isDeviceHealthStateChange(event: HaStateChangeEvent): boolean {
  if (!event.new_state) return false;
  const state = event.new_state.state;
  // 'unavailable' / 'unknown' 表示设备失联或状态未上报
  if (state === 'unavailable' || state === 'unknown') return true;
  // battery_level 低于 20 视为低电量告警
  const battery = event.new_state.attributes?.battery_level;
  return typeof battery === 'number' && battery < 20;
}

/** 能源异常监听关心的 domain */
const ENERGY_DOMAINS = new Set(['sensor', 'switch', 'climate', 'fan', 'light']);

/**
 * 判定 entity 是否属于能源异常监听关心的域。
 * @param entityId 实体 ID（形如 domain.name）
 */
export function isEnergyRelevantStateChange(entityId: string): boolean {
  return ENERGY_DOMAINS.has(getEntityDomain(entityId));
}

/** 用水监测关心的 domain */
export function isWaterRelevantStateChange(entityId: string): boolean {
  const domain = getEntityDomain(entityId);
  return domain === 'sensor' || domain === 'binary_sensor';
}

/** 儿童模式媒体限制 */
export function isChildModeMediaEntity(entityId: string): boolean {
  return getEntityDomain(entityId) === 'media_player';
}

/** 环境健康（温湿度等） */
export function isEnvironmentRelevantStateChange(entityId: string): boolean {
  const domain = getEntityDomain(entityId);
  return domain === 'sensor' || domain === 'climate' || domain === 'binary_sensor';
}

/** Frigate / 摄像头相关 */
export function isCameraRelevantStateChange(entityId: string): boolean {
  const domain = getEntityDomain(entityId);
  // 同时识别 Frigate 集成生成的 sensor.frigate_* 实体
  return domain === 'camera' || domain === 'binary_sensor' || entityId.startsWith('sensor.frigate');
}

/**
 * 从自动化规则收集需监听的 entity_id（含通配符前缀）。
 *
 * @param rules 自动化规则数组，每条规则可能含多个 trigger
 * @returns 去重后的 entity_id 集合（不含通配符项的实际值，仅记录字面值）
 *
 * 用于在 Cold Path 早期建立 entity→rule 索引，避免对无关事件做完整规则匹配。
 */
export function collectWatchedEntityIds(
  rules: Array<{ triggers: Array<{ entity_id?: string | string[] }> }>,
): Set<string> {
  const ids = new Set<string>();
  for (const rule of rules) {
    for (const t of rule.triggers) {
      const eid = t.entity_id;
      if (!eid) continue;
      // entity_id 既可能是单值也可能是数组，统一处理
      if (Array.isArray(eid)) eid.forEach((id) => ids.add(id));
      else ids.add(eid);
    }
  }
  return ids;
}

/**
 * 从自动化规则中收集通配符前缀（如 "sensor.kitchen_*" → "sensor.kitchen_"）。
 *
 * @param rules 自动化规则数组
 * @returns 去重后的前缀字符串数组
 *
 * 用于匹配未在显式列表中的动态实体（如数量可变的房间传感器）。
 */
export function collectWildcardPrefixes(
  rules: Array<{ triggers: Array<{ entity_id?: string | string[] }> }>,
): string[] {
  const prefixes = new Set<string>();
  for (const rule of rules) {
    for (const t of rule.triggers) {
      const eid = t.entity_id;
      if (!eid) continue;
      const patterns = Array.isArray(eid) ? eid : [eid];
      for (const p of patterns) {
        // 仅当 pattern 以 * 结尾时视作通配符，去除尾部 * 后即得到前缀
        if (typeof p === 'string' && p.endsWith('*')) {
          prefixes.add(p.replace(/\*+$/, ''));
        }
      }
    }
  }
  return [...prefixes];
}

/**
 * 综合判定自动化引擎是否需要处理某实体的状态变更事件。
 *
 * @param entityId 待判定的实体 ID
 * @param watchedIds 显式监听集合（来自 collectWatchedEntityIds）
 * @param hasEventTriggers 规则中是否存在 event / homeassistant 平台触发器（这些平台不依赖具体 entity_id）
 * @param wildcardPrefixes 通配符前缀数组（来自 collectWildcardPrefixes）
 * @returns 是否需要处理
 *
 * Hot Path：先做最便宜的判断（集合 size 与 has 调用），最后才回退到 some 遍历。
 */
export function shouldAutomationProcessEntity(
  entityId: string,
  watchedIds: Set<string>,
  hasEventTriggers: boolean,
  wildcardPrefixes: string[] = [],
): boolean {
  // 三类条件均不成立时直接跳过：避免对无关事件触发后续规则匹配
  if (watchedIds.size === 0 && !hasEventTriggers && wildcardPrefixes.length === 0) return false;
  // 显式监听列表命中
  if (watchedIds.has(entityId)) return true;
  // 通配符前缀匹配（length 较短，some 开销可控）
  return wildcardPrefixes.some((prefix) => entityId.startsWith(prefix));
}