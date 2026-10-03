/**
 * 在家状态人员判定实体 ID 缓存模块。
 *
 * 职责：
 * - 调用 /security/presence/home 获取用于判定在家人员的实体 ID 列表；
 * - 提供模块级缓存避免重复请求；
 * - 暴露失效与重新加载接口供保存配置后调用。
 *
 * 依赖：loadPresenceHome（composables/presence/load-presence-home）。
 */
import { loadPresenceHome } from '@/composables/presence/load-presence-home'

/** 人员判定实体 ID 缓存（来自 /security/presence/home） */
let cachedIds: string[] | null = null
let cacheLoaded = false

/**
 * 加载人员判定实体 ID 列表（带模块级缓存）。
 *
 * 首次调用发起 API 请求并缓存结果，后续调用直接返回缓存值。
 * 失败时静默回退为空数组，避免阻断调用方流程。
 *
 * @returns 实体 ID 数组；未加载或失败时返回空数组
 */
async function loadPresenceEntityIds() {
  if (cacheLoaded) return cachedIds ?? []
  const data = await loadPresenceHome()
  cachedIds = Array.isArray(data?.entityIds) ? data.entityIds.filter(Boolean) : []
  cacheLoaded = true
  return cachedIds
}

/**
 * 重置缓存状态，使下次 loadPresenceEntityIds 重新发起请求。
 *
 * 主要用于测试或外部主动失效场景。
 */
function resetPresenceEntityCache() {
  cacheLoaded = false
  cachedIds = null
}

/**
 * 失效缓存并立即重新加载（保存配置后调用）。
 *
 * @returns 重新加载后的实体 ID 数组
 */
export async function invalidateAndReloadPresenceEntityIds() {
  resetPresenceEntityCache()
  return loadPresenceEntityIds()
}