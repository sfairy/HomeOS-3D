/** 提供两个能力： */
import { defineAsyncComponent, type Component } from 'vue'

/** 动态 import 失败的错误特征正则（覆盖主流浏览器与 Vite 文案） */
const DYNAMIC_IMPORT_FAILURE =
  /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|dynamically imported module/i

/** 最大重试次数 */
const MAX_ATTEMPTS = 3
/** 重试基础间隔（毫秒），实际间隔 = RETRY_BASE_MS * 当前次数 */
const RETRY_BASE_MS = 200
/** 整页刷新预算窗口（毫秒） */
const RELOAD_WINDOW_MS = 120_000
/** 一个窗口内最多自动刷新的次数；超出就不自动刷新，把错误交回上层提示 */
const RELOAD_MAX_IN_WINDOW = 2
/**
 * 刷新预算状态键，值为 `{count, start}`。
 *
 * **只在窗口过期时重置**，不在「加载成功」时清零。若成功即清零，dev 下依赖重打包 /
 * 服务重启的那一两秒里动态 import 失败 → 刷新成功 → 守卫清零 → 下一次 import 又失败，
 * 会退化成整页反复刷新。
 */
const RELOAD_GUARD_KEY = 'hos:lazy-view-reload'

/** 判断错误是否属于动态 import 失败（用于决定是否重试） */
export function isDynamicImportFailure(error: unknown) {
  const msg = String((error as Error)?.message || error)
  return DYNAMIC_IMPORT_FAILURE.test(msg)
}

/** 刷新预算：窗口内已用次数与窗口起点。 */
interface ReloadBudget {
  count: number
  start: number
}

/** 读预算：窗口过期（或数据不可用）时视为全新窗口。 */
function readReloadBudget(now: number): ReloadBudget {
  try {
    const raw = sessionStorage.getItem(RELOAD_GUARD_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<ReloadBudget>
      if (
        typeof parsed?.count === 'number' &&
        typeof parsed?.start === 'number' &&
        now - parsed.start < RELOAD_WINDOW_MS
      ) {
        return { count: parsed.count, start: parsed.start }
      }
    }
  } catch {
    /* 隐私模式下 sessionStorage 不可用 / 脏数据：等价于没有预算 */
  }
  return { count: 0, start: now }
}

function writeReloadBudget(budget: ReloadBudget): void {
  try {
    sessionStorage.setItem(RELOAD_GUARD_KEY, JSON.stringify(budget))
  } catch {
    /* best-effort：写不进去就退化为不自动刷新 */
  }
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
 *
 * 但**一个窗口内只放行有限次**：dev 下依赖重打包 / 服务重启会同时打掉一批 chunk，刷新后
 * 页面能正常渲染、下一个 import 却仍可能失败 —— 无上限的「刷新一次」会被放大成整页刷屏
 * （实测 1.3s 一次、持续数分钟）。超限即停手，由调用方把错误提示出来。
 */
export function reloadOnceForStaleChunk(error: unknown): boolean {
  if (typeof window === 'undefined' || !isDynamicImportFailure(error)) return false
  try {
    const now = Date.now()
    const budget = readReloadBudget(now)
    if (budget.count >= RELOAD_MAX_IN_WINDOW) {
      console.warn('[HomeOS] 动态 import 反复失败，本窗口内不再自动刷新页面')
      return false
    }
    writeReloadBudget({ count: budget.count + 1, start: budget.start })
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
        // 加载成功**不**清刷新预算：只让预算按窗口过期自然重置，否则「一次抖动」会被放大
        // 成无限刷新（详见 RELOAD_GUARD_KEY 的说明）。
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
      ;(fail as (retryError?: unknown) => void)(error)
    },
  })
}
