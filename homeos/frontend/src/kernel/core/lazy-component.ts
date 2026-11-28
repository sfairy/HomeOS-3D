/**
 * 动态 import 的容错包装（Vue 侧薄层）。
 *
 * 判据（什么算「动态 import 失败」）、重试节奏、以及**有限次**整页刷新的预算语义全部
 * 住在 `@homeos/shared/router/stale-chunk`：商店前端有同一套需求，两边各写一份判据迟早
 * 分叉。本文件只保留必须依赖 Vue 的部分（`defineAsyncComponent` / `lazyView`），
 * 并对内维持既有函数名与签名，调用点零改动。
 *
 * 背景：前端产物是带内容哈希的 chunk。重新构建后**已打开的标签页**仍按旧哈希请求
 * 已经不存在的文件 → 404 → 路由懒加载 reject → 白屏，而用户并不知道「刷新就好」。
 * 浏览器还会缓存「该 module URL 加载失败」的结论，所以仅重试 `import()` 常常无效。
 */
import { defineAsyncComponent, type Component } from 'vue'
import {
  APP_RELOAD_GUARD_KEY,
  LAZY_MAX_ATTEMPTS,
  LAZY_RETRY_BASE_MS,
  isDynamicImportFailure,
  lazyWithStaleChunkRecovery,
  reloadOnceForStaleChunk as reloadOnceForStaleChunkShared,
} from '@homeos/shared/router/stale-chunk'

export { isDynamicImportFailure, STALE_CHUNK_HINT } from '@homeos/shared/router/stale-chunk'

/** 主应用的刷新预算键（与商店的键分开，互不占用对方的刷新机会）。 */
export const RELOAD_GUARD_KEY = APP_RELOAD_GUARD_KEY

/**
 * 动态 import 持续失败时整页刷新一次（受窗口预算约束）。
 *
 * 保留单参签名：调用点（路由 `onError`）不关心预算键，主应用固定用自己的那一份。
 */
export function reloadOnceForStaleChunk(error: unknown): boolean {
  return reloadOnceForStaleChunkShared(error, RELOAD_GUARD_KEY)
}

/**
 * Vue Router 路由懒加载：失败自动重试，仍失败则在预算内整页刷新。
 * @param loader 原始 () => import('...') 加载函数
 * @returns 包裹了恢复逻辑的加载函数，供 routes 使用
 */
export function lazyView<T>(loader: () => Promise<T>): () => Promise<T> {
  return lazyWithStaleChunkRecovery(loader, RELOAD_GUARD_KEY)
}

/**
 * 异步组件加载（defineAsyncComponent 包装），失败自动重试。
 * @param loader 组件加载函数
 * @returns Vue 异步组件
 */
export function lazyComponent(loader: () => Promise<Component>) {
  return defineAsyncComponent({
    loader,
    onError(error, retry, fail, attempts) {
      const msg = String(error?.message || error)
      if (isDynamicImportFailure(msg) && attempts <= LAZY_MAX_ATTEMPTS) {
        setTimeout(retry, LAZY_RETRY_BASE_MS * attempts)
        return
      }
      // 重试用尽：交给上层错误态（面板会显示「加载失败 + 重试」），不静默白屏。
      ;(fail as (retryError?: unknown) => void)(error)
    },
  })
}
