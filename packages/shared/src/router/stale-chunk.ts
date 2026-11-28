/**
 * 陈旧 chunk 恢复：动态 `import()` 失败时的重试与**有限次**整页刷新。
 *
 * ## 为什么需要它
 *
 * 前端产物是带内容哈希的 chunk。一次重新构建（发版、`gate:build`、dev 的 watch-build）
 * 之后，**已经打开的标签页**仍然持有旧的入口与模块图，它按旧哈希去请求
 * `assets/features/admin/DataTable-Df5uWdW7.js` 这类文件 —— 而磁盘上已经是
 * `DataTable-DfJQssqj.js`。结果是 404、路由懒加载 reject、页面白屏，用户只看到
 * 控制台里一串 404，既不知道「刷新一下就好」，也没有任何恢复入口。
 *
 * 浏览器会缓存「这个 module URL 加载失败」这个结论，所以仅重试 `import()` 往往无效，
 * 必须整页刷新才能拿到新入口。
 *
 * ## 为什么刷新必须有预算
 *
 * dev 下依赖重打包 / 服务重启会同时打掉一批 chunk：刷新后页面能渲染，但下一个 import
 * 仍可能失败 —— 无上限的「失败就刷新」会退化成整页刷屏（实测 1.3s 一次、持续数分钟）。
 * 因此按固定窗口计次，超限即停手，把错误交回调用方提示。
 *
 * 主应用与商店共用这一份实现：两边各写一份，判据与预算语义迟早分叉。
 */

/** 动态 import 失败的错误特征正则（覆盖主流浏览器与 Vite 文案）。 */
const DYNAMIC_IMPORT_FAILURE =
  /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|dynamically imported module/i

/** 单次加载的最大尝试次数。 */
export const LAZY_MAX_ATTEMPTS = 3

/** 重试基础间隔（毫秒）；实际间隔 = 基础值 × 当前次数。 */
export const LAZY_RETRY_BASE_MS = 200

/** 整页刷新预算窗口（毫秒）。 */
export const LAZY_RELOAD_WINDOW_MS = 120_000

/** 一个窗口内最多自动刷新的次数；超出就不自动刷新，把错误交回上层提示。 */
export const LAZY_RELOAD_MAX_IN_WINDOW = 2

/** 主应用的刷新预算键。 */
export const APP_RELOAD_GUARD_KEY = 'hos:lazy-view-reload'

/** 商店的刷新预算键（独立，避免两个前端共享同一次刷新机会）。 */
export const STORE_RELOAD_GUARD_KEY = 'hos:store-lazy-view-reload'

/** 给人看的提示文案：陈旧 chunk 时刷新页面即可恢复。 */
export const STALE_CHUNK_HINT = '页面有新版本，请刷新后继续（Ctrl/Cmd + Shift + R）。'

/** 判断错误是否属于动态 import 失败（用于决定是否重试）。 */
export function isDynamicImportFailure(error: unknown): boolean {
  const msg = String((error as Error)?.message || error)
  return DYNAMIC_IMPORT_FAILURE.test(msg)
}

interface ReloadBudget {
  count: number
  start: number
}

/**
 * 读刷新预算。窗口过期（或数据不可用）时视为全新窗口。
 *
 * **只在窗口过期时重置**，不在「加载成功」时清零：若成功即清零，dev 下依赖重打包 /
 * 服务重启的那一两秒里「import 失败 → 刷新成功 → 清零 → 下一次又失败」会退化成整页
 * 反复刷新。
 */
function readReloadBudget(storageKey: string, now: number): ReloadBudget {
  try {
    const raw = sessionStorage.getItem(storageKey)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<ReloadBudget>
      if (
        typeof parsed?.count === 'number' &&
        typeof parsed?.start === 'number' &&
        now - parsed.start < LAZY_RELOAD_WINDOW_MS
      ) {
        return { count: parsed.count, start: parsed.start }
      }
    }
  } catch {
    /* 隐私模式下 sessionStorage 不可用 / 脏数据：等价于没有预算 */
  }
  return { count: 0, start: now }
}

function writeReloadBudget(storageKey: string, budget: ReloadBudget): void {
  try {
    sessionStorage.setItem(storageKey, JSON.stringify(budget))
  } catch {
    /* best-effort：写不进去就退化为不自动刷新 */
  }
}

function delay(ms: number): Promise<void> {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms)
  })
}

/**
 * 动态 import 持续失败时整页刷新一次（受窗口预算约束）。
 *
 * @param error 捕获到的错误
 * @param storageKey 预算的 sessionStorage 键；主应用与商店必须用**不同**的键
 * @returns `true` 表示已触发刷新（调用方应挂起而不是继续渲染）
 */
export function reloadOnceForStaleChunk(error: unknown, storageKey: string): boolean {
  if (typeof window === 'undefined' || !isDynamicImportFailure(error)) return false
  try {
    const now = Date.now()
    const budget = readReloadBudget(storageKey, now)
    if (budget.count >= LAZY_RELOAD_MAX_IN_WINDOW) {
      console.warn('[HomeOS] 动态 import 反复失败，本窗口内不再自动刷新页面')
      return false
    }
    writeReloadBudget(storageKey, { count: budget.count + 1, start: budget.start })
    window.location.reload()
    return true
  } catch {
    return false
  }
}

/**
 * 包一层「重试 + 有限次刷新」的懒加载函数，供路由表直接使用。
 *
 * 失败时的行为：重试到上限 → 尝试刷新（有预算）→ 仍失败则把原始错误抛给路由，
 * 由 `router.onError` 换成「有新版本，请刷新」的提示，而不是白屏。
 *
 * @param loader 原始 `() => import('...')`
 * @param storageKey 刷新预算键（见 {@link reloadOnceForStaleChunk}）
 */
export function lazyWithStaleChunkRecovery<T>(loader: () => Promise<T>, storageKey: string): () => Promise<T> {
  return async () => {
    let lastError: unknown
    for (let attempt = 1; attempt <= LAZY_MAX_ATTEMPTS; attempt += 1) {
      try {
        return await loader()
      } catch (error) {
        lastError = error
        if (!isDynamicImportFailure(error) || attempt >= LAZY_MAX_ATTEMPTS) break
        await delay(LAZY_RETRY_BASE_MS * attempt)
      }
    }
    if (reloadOnceForStaleChunk(lastError, storageKey)) {
      // 页面正在刷新：返回一个永不落定的 Promise，避免路由在卸载前渲染出半截界面。
      return new Promise<T>(() => {})
    }
    throw lastError
  }
}
