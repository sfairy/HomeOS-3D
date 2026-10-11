/**
 * @module entity-derived-route.util
 * @description 路由感知的派生索引 debounce / patch 过滤工具模块。
 *
 * 职责：
 * - 根据当前路由路径动态调整派生 patch 的 debounce 倍率。
 * - 按路由过滤与热点无关的域变更，减少 Dashboard / 安全页面等场景的无效重建。
 * - 维护域纪元（domain epoch），用于派生分片的失效判定。
 *
 * 依赖：`@homeos/shared` 提供 getEntityDomain。
 */
import { getEntityDomain } from '@homeos/shared'

/** 安全相关域集合：安全页面仅处理这些域的派生变更。 */
const SECURITY_DOMAINS = new Set([
  'binary_sensor',
  'camera',
  'lock',
  'alarm_control_panel',
  'device_tracker',
  'cover',
])

/**
 * Dashboard 路由下跳过派生 patch 的低优先级域。
 *
 * 这些域的变更不影响 Dashboard 热点展示，跳过可减少无效重建。
 */
const DASHBOARD_SKIP_DERIVED_DOMAINS = new Set([
  'sensor',
  'binary_sensor',
  'update',
  'device_tracker',
  'event',
  'image',
])

/** 派生 patch 引用：仅包含 entity_id。 */
interface DerivedPatchRef {
  entity_id: string
}

let activeRoutePath = '/'

/**
 * 设置当前激活的路由路径，供后续 debounce 倍率与 patch 过滤使用。
 *
 * @param path 路由路径。
 */
export function setDerivedRoutePath(path: string): void {
  activeRoutePath = path || '/'
}

/**
 * 根据路由路径返回派生 patch 的 debounce 倍率。
 *
 * - Dashboard（/）与 embed：1.0（默认）。
 * - 安全页面（/security）：1.2（略增延迟，安全事件优先级高但仍需节流）。
 * - 设置页面（/settings）：1.5（更高延迟，设置页不依赖实时派生）。
 * - 其他页面：1.3。
 *
 * @param path 路由路径，默认使用 activeRoutePath。
 * @returns debounce 倍率。
 */
export function getRouteDerivedDebounceMultiplier(path: string = activeRoutePath): number {
  if (!path || path === '/' || path.startsWith('/embed')) return 1
  if (path.startsWith('/security')) return 1.2
  if (path.startsWith('/settings')) return 1.5
  return 1.3
}

/**
 * 判断单个实体的派生 patch 在当前路由下是否相关。
 *
 * - Dashboard / 设置 / embed：全部相关。
 * - 安全页面：仅安全相关域相关。
 * - 其他：全部相关。
 *
 * @param entityId 实体 ID。
 * @param path 路由路径，默认使用 activeRoutePath。
 * @returns 相关返回 true，否则返回 false。
 */
function isDerivedPatchRelevant(entityId: string, path: string = activeRoutePath): boolean {
  if (!path || path === '/' || path.startsWith('/settings') || path.startsWith('/embed')) {
    return true
  }
  if (path.startsWith('/security')) {
    const domain = getEntityDomain(entityId)
    return SECURITY_DOMAINS.has(domain)
  }
  return true
}

/**
 * 按路由过滤派生 patch 列表。
 *
 * - Dashboard / embed：跳过低优先级域。
 * - 设置：保留全部。
 * - 安全：仅保留安全相关域。
 * - 其他：保留全部。
 *
 * @param changes 派生 patch 引用数组。
 * @param path 路由路径，默认使用 activeRoutePath。
 * @returns 过滤后的数组；输入为空时原样返回。
 */
export function filterDerivedPatchesForRoute(
  changes: DerivedPatchRef[],
  path: string = activeRoutePath,
): DerivedPatchRef[] {
  if (!changes?.length) return changes
  if (path === '/' || path.startsWith('/embed')) {
    return changes.filter((c) => {
      if (!c?.entity_id) return false
      const domain = getEntityDomain(c.entity_id)
      return !DASHBOARD_SKIP_DERIVED_DOMAINS.has(domain)
    })
  }
  if (!path || path.startsWith('/settings')) return changes
  if (path.startsWith('/security')) {
    return changes.filter((c) => c?.entity_id && isDerivedPatchRelevant(c.entity_id, path))
  }
  return changes
}

/**
 * 递增变更涉及域的纪元值。
 *
 * 用于派生分片的失效判定：纪元变化时说明该域有增量变更，
 * 依赖该域派生数据的视图需要重新计算。
 *
 * @param domainEpochs 域纪元 Map（会被原地修改）。
 * @param changes 派生 patch 引用数组。
 */
export function bumpDomainEpochs(
  domainEpochs: Map<string, number>,
  changes: DerivedPatchRef[],
): void {
  if (!changes?.length) return
  for (let i = 0; i < changes.length; i++) {
    const id = changes[i]?.entity_id
    if (!id) continue
    const domain = getEntityDomain(id)
    domainEpochs.set(domain, (domainEpochs.get(domain) || 0) + 1)
  }
}
