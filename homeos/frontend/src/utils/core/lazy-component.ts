/**
 * @module core/lazy-component
 * @description 异步组件加载工具，开发环境 HMR / dep 预构建期间 import() 可能短暂失败，自动重试。
 *
 * 提供两个能力：
 *  - lazyView：包裹 Vue Router 路由懒加载 () => import()，HMR 期间失败自动重试；
 *  - lazyComponent：包裹 defineAsyncComponent，按动态 import 失败特征触发重试。
 *
 * 依赖：vue（defineAsyncComponent / Component）。
 */
import { defineAsyncComponent, type Component } from 'vue'

/** 动态 import 失败的错误特征正则（覆盖主流浏览器与 Vite 文案） */
const DYNAMIC_IMPORT_FAILURE =
  /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|dynamically imported module/i

/** 最大重试次数 */
const MAX_ATTEMPTS = 3
/** 重试基础间隔（毫秒），实际间隔 = RETRY_BASE_MS * 当前次数 */
const RETRY_BASE_MS = 200
/** 整页刷新去重键：同一 URL 只自动 reload 一次，避免死循环 */
const RELOAD_GUARD_KEY = 'hos:lazy-view-reload'

/** 判断错误是否属于动态 import 失败（用于决定是否重试） */
export function isDynamicImportFailure(error: unknown) {
  const msg = String((error as Error)?.message || error)
  return DYNAMIC_IMPORT_FAILURE.test(msg)
}

/** 延时工具 */
function delay(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms)
  })
}

/**
 * 动态 import 持续失败时整页刷新一次。
 * 浏览器会对失败的 module URL 缓存拒绝结果，仅重试 import() 往往无效。
 */
export function reloadOnceForStaleChunk(error: unknown): boolean {
  if (typeof window === 'undefined' || !isDynamicImportFailure(error)) return false
  try {
    const href = window.location.href
    if (sessionStorage.getItem(RELOAD_GUARD_KEY) === href) {
      sessionStorage.removeItem(RELOAD_GUARD_KEY)
      return false
    }
    sessionStorage.setItem(RELOAD_GUARD_KEY, href)
    window.location.reload()
    return true
  } catch {
    return false
  }
}

/**
 * Vue Router 路由懒加载：返回 () => import()，HMR 期间失败自动重试。
 * @param loader 原始 () => import('...') 加载函数
 * @returns 包裹了重试逻辑的加载函数，供 routes 使用
 */
export function lazyView<T>(loader: () => Promise<T>): () => Promise<T> {
  return async () => {
    let lastError: unknown
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const mod = await loader()
        try {
          sessionStorage.removeItem(RELOAD_GUARD_KEY)
        } catch {
          /* 忽略 */
        }
        return mod
      } catch (error) {
        lastError = error
        if (!isDynamicImportFailure(error) || attempt >= MAX_ATTEMPTS) break
        await delay(RETRY_BASE_MS * attempt)
      }
    }
    if (reloadOnceForStaleChunk(lastError)) {
      return new Promise<T>(() => {})
    }
    throw lastError
  }
}

/**
 * 异步组件加载（defineAsyncComponent 包装），HMR 期间失败自动重试。
 * @param loader 组件加载函数
 * @returns Vue 异步组件
 */
export function lazyComponent(loader: () => Promise<Component>) {
  return defineAsyncComponent({
    loader,
    onError(error, retry, fail, attempts) {
      const msg = String(error?.message || error)
      if (DYNAMIC_IMPORT_FAILURE.test(msg) && attempts <= MAX_ATTEMPTS) {
        setTimeout(retry, RETRY_BASE_MS * attempts)
        return
      }
      ;(fail as (err?: unknown) => void)(error)
    },
  })
}
