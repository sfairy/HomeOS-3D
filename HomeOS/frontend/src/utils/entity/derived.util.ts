/**
 * @module entity-derived.util
 * @description 实体派生数据公共 API 入口（聚合桶模块）。
 *
 * 职责：
 * - 从 `entity-derived-internals` re-export 派生数据核心 API 与类型。
 * - 提供按域 / 分组从 domainEntityIndex 收集候选 entity_id 的工具函数。
 *
 * 依赖：`entity-derived-internals` 提供全部实现。
 */
export {
  hasEntityFriendlyName,
  getEntityDisplayName,
  applyEntityDerivedKey,
  removeEntityDerivedKey,
  accFromDerivedSnapshot,
  snapshotFromDerivedAcc,
  type EntityDerivedAccumulator,
} from './derived-internals'

/** collectIndexedEntityIds 的选项。 */
interface CollectIndexedEntityIdsOptions {
  domain?: string
  groupDomainSet?: Set<string> | null
}

/**
 * 将 domainEntityIndex 中的值（string[] 或 Set<string>）统一转为数组。
 *
 * @param value 域索引中的值。
 * @returns 实体 ID 数组；value 为空时返回空数组。
 */
export function domainIndexToArray(value: string[] | Set<string> | null | undefined): string[] {
  if (!value) return []
  return Array.isArray(value) ? value : [...value]
}

/**
 * 按域 / 分组从 domainEntityIndex 收集候选 entity_id（避免全表扫描）。
 *
 * - 指定 domain：返回该域的实体 ID 数组。
 * - 指定 groupDomainSet：返回集合中所有域的实体 ID 合并数组。
 * - 未指定：返回全部域的实体 ID 合并数组。
 *
 * @param domainEntityIndex 域到实体 ID 集合的映射表。
 * @param options 收集选项。
 * @returns 实体 ID 数组；索引为空时返回 null。
 */
export function collectIndexedEntityIds(
  domainEntityIndex: Map<string, string[] | Set<string>> | null | undefined,
  { domain = 'all', groupDomainSet = null }: CollectIndexedEntityIdsOptions = {},
): string[] | null {
  if (!domainEntityIndex?.size) return null
  if (domain !== 'all') {
    return domainIndexToArray(domainEntityIndex.get(domain))
  }
  if (groupDomainSet?.size) {
    const ids: string[] = []
    for (const d of groupDomainSet) {
      const list = domainIndexToArray(domainEntityIndex.get(d))
      if (list.length) ids.push(...list)
    }
    return ids
  }
  const ids: string[] = []
  for (const list of domainEntityIndex.values()) {
    const arr = domainIndexToArray(list)
    if (arr.length) ids.push(...arr)
  }
  return ids
}
