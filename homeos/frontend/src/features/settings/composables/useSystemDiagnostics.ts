/**
 * @file useSystemDiagnostics.ts
 * @module composables/settings
 * @description 系统健康与诊断 composable：对 GET /system/health 与 /system/diagnostics 做轻量缓存。
 *
 * 职责：
 * - 提供 health / diagnostics 两个接口的并发安全加载（inflight 去重）；
 * - 缓存 10 秒，避免设置面板频繁切换时重复请求；
 * - 用引用计数管理 loading，避免并发请求任一完成时误关另一仍在途请求的 loading。
 *
 * 依赖：
 * - vue（computed、ref）
 * - @/services/api/system（fetchSystemHealth / fetchSystemDiagnostics）
 */
import { computed, ref } from 'vue'
import { fetchSystemHealth, fetchSystemDiagnostics } from '@/services/api/system'

// 缓存有效期：10 秒
const TTL_MS = 10000
// 模块级缓存：单例共享给所有调用方
let healthCache: unknown = null
let diagnosticsCache: unknown = null
let healthCachedAt = 0
let diagnosticsCachedAt = 0
// 进行中的请求 Promise：用于去重并发请求
let healthInflight: Promise<unknown> | null = null
let diagnosticsInflight: Promise<unknown> | null = null
// 引用计数：health / diagnostics 并发加载时任一完成不会清掉另一仍在途的请求的 loading
const pendingCount = ref(0)
const loading = computed(() => pendingCount.value > 0)
/** 进入一次加载：pendingCount +1 */
function startLoad(): void {
  pendingCount.value += 1
}
/** 结束一次加载：pendingCount -1，下界保护 0 */
function endLoad(): void {
  pendingCount.value = Math.max(0, pendingCount.value - 1)
}

/**
 * 加载系统健康信息：复用 inflight 请求，缓存 TTL_MS 内未过期时直接返回缓存；
 * 失败时回退到旧缓存，保证 UI 不至于空。
 *
 * @param force 是否强制刷新（忽略缓存）
 */
async function loadSystemHealth({ force = false }: { force?: boolean } = {}) {
  // 已有在途请求：复用同一 Promise
  if (healthInflight) return healthInflight
  // 缓存未过期：直接返回
  if (!force && healthCache && Date.now() - healthCachedAt < TTL_MS) {
    return healthCache
  }
  startLoad()
  healthInflight = fetchSystemHealth()
    .then(({ data }) => {
      healthCache = data ?? null
      healthCachedAt = Date.now()
      return healthCache
    })
    // 失败时回退到旧缓存，避免 UI 空白
    .catch(() => healthCache)
    .finally(() => {
      endLoad()
      healthInflight = null
    })
  return healthInflight
}

/**
 * 加载系统诊断信息：复用 inflight 请求，缓存 TTL_MS 内未过期时直接返回缓存；
 * 失败时回退到旧缓存。
 *
 * @param force 是否强制刷新（忽略缓存）
 */
async function loadSystemDiagnostics({ force = false }: { force?: boolean } = {}) {
  if (diagnosticsInflight) return diagnosticsInflight
  if (!force && diagnosticsCache && Date.now() - diagnosticsCachedAt < TTL_MS) {
    return diagnosticsCache
  }
  startLoad()
  diagnosticsInflight = fetchSystemDiagnostics()
    .then(({ data }) => {
      diagnosticsCache = data ?? null
      diagnosticsCachedAt = Date.now()
      return diagnosticsCache
    })
    .catch(() => diagnosticsCache)
    .finally(() => {
      endLoad()
      diagnosticsInflight = null
    })
  return diagnosticsInflight
}

/**
 * GET /system/health 与 /system/diagnostics 轻量缓存 composable。
 * 单例：所有调用方共享同一份缓存与 loading 状态。
 *
 * @returns loading 加载中标志；loadHealth 加载健康信息；loadDiagnostics 加载诊断信息；
 *          getCachedHealth 取健康缓存；getCachedDiagnostics 取诊断缓存
 */
export function useSystemDiagnostics() {
  return {
    loading,
    loadHealth: loadSystemHealth,
    loadDiagnostics: loadSystemDiagnostics,
    getCachedHealth: () => healthCache,
    getCachedDiagnostics: () => diagnosticsCache,
  }
}
