import { toRaw, defineAsyncComponent, type Component } from 'vue'
import { HTTP_MESSAGE_PATTERNS, HTTP_MESSAGE_TEXTS } from '@homeos/shared'

/** 场景：页面首次加载时，后端可能尚未就绪（网关返回 502/503/504 或网络错误）。 */

/** 后端冷启动 / Nest 热重载窗口内，网关 502 时的重试上限与间隔（约 2 分钟） */
const API_BOOT_RETRY_MAX = 40
const API_BOOT_RETRY_DELAY_MS = 3000

/** 重试可选项：覆盖默认最大次数与间隔 */
interface BackendBootRetryOptions {
  /** 最大尝试次数（含首次），默认 API_BOOT_RETRY_MAX */
  maxAttempts?: number
  /** 两次尝试之间的间隔（毫秒），默认 API_BOOT_RETRY_DELAY_MS */
  delayMs?: number
}

/**
 * 在后端不可达（502/503/504/网络错误）时重试，用于页面首次加载。
 * @param fn 实际要执行的异步操作
 * @param options 重试参数覆盖
 * @returns fn 的成功返回值
 * @throws 当错误不属于后端不可达，或达到最大次数仍失败时抛出最近一次错误
 */
export async function withBackendBootRetry<T>(fn: () => Promise<T>, options: BackendBootRetryOptions = {}): Promise<T> {
  const maxAttempts = options.maxAttempts ?? API_BOOT_RETRY_MAX
  const delayMs = options.delayMs ?? API_BOOT_RETRY_DELAY_MS
  let lastError: unknown
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err
      // 非后端不可达错误，或已是最后一次尝试，直接抛出，不重试
      if (!isBackendUnreachableError(err) || attempt >= maxAttempts - 1) throw err
      await new Promise((r) => setTimeout(r, delayMs))
    }
  }
  throw lastError
}

/** 背景与选型： */

/**
 * 深拷贝可序列化纯数据。
 *
 * @param value 待拷贝数据（建议为纯数据 / Vue ref 内部值）
 * @returns 与原值无引用关联的深拷贝；structuredClone 失败时回退 JSON 拷贝
 */
export function clonePlain<T>(value: T): T {
  try {
    return structuredClone(toRaw(value)) as T
  } catch {
    return JSON.parse(JSON.stringify(value)) as T
  }
}

/**
 * 统计两个 JSON 可序列化值之间变更的叶子节点数量的工具。
 * 用途：在实体状态 / 配置 diff 场景，量化「变化幅度」而非简单相等判断，
 * 用于决定是否触发重渲染、缓存失效或事件上报。
 */
/** 判定值类型标签（区分 null / array / 普通 object / 标量） */
function valueKind(value: unknown) {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  return typeof value
}

/** 是否为普通对象（非 null、非数组） */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return valueKind(value) === 'object'
}

/** 叶子节点相等性比较（基于 JSON 序列化，保证标量与结构都可比） */
function leafEqual(a: unknown, b: unknown) {
  return JSON.stringify(a) === JSON.stringify(b)
}

/**
 * 递归统计两个 JSON 可序列化值之间变更的叶子节点数量。
 * 对象按字段、数组按元素递归；标量/ null 不等时计 1。
 * @param left 基线值（可为 JSON 字符串，会自动 parse）
 * @param right 当前值（可为 JSON 字符串，会自动 parse）
 * @returns 变更叶子节点数
 */
export function countJsonLeafDiff(left: unknown, right: unknown) {
  const a = typeof left === 'string' ? JSON.parse(left) : left
  const b = typeof right === 'string' ? JSON.parse(right) : right
  return walk(a, b)
}

/** 递归核心：返回 a/b 之间的变更叶子数 */
function walk(a: unknown, b: unknown): number {
  if (leafEqual(a, b)) return 0

  const aMissing = a === undefined
  const bMissing = b === undefined
  if (aMissing && bMissing) return 0

  // 一侧缺失时，对存在的一侧递归统计其叶子数（空值视为 0 变更）
  if (aMissing || bMissing) {
    const sole = aMissing ? b : a
    if (sole === null || sole === '') return sole === (aMissing ? a : b) ? 0 : 1
    const kind = valueKind(sole)
    if (kind === 'array') {
      return (sole as unknown[]).reduce(
        (n: number, item) => n + walk(aMissing ? undefined : item, bMissing ? undefined : item),
        0,
      )
    }
    if (isPlainObject(sole)) {
      return Object.keys(sole).reduce(
        (n: number, key) => n + walk(aMissing ? undefined : sole[key], bMissing ? undefined : sole[key]),
        0,
      )
    }
    return 1
  }

  const kindA = valueKind(a)
  const kindB = valueKind(b)
  // 类型不同直接计 1（无法递归对齐）
  if (kindA !== kindB) return 1

  if (kindA === 'array') {
    const arrA = a as unknown[]
    const arrB = b as unknown[]
    const maxLen = Math.max(arrA.length, arrB.length)
    let count = 0
    for (let i = 0; i < maxLen; i++) {
      count += walk(arrA[i], arrB[i])
    }
    return count
  }

  if (isPlainObject(a) && isPlainObject(b)) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)])
    let count = 0
    for (const key of keys) {
      count += walk(a[key], b[key])
    }
    return count
  }

  return 1
}

/**
 * 按指定顶层字段统计变更数（字段级，不递归展开）。
 * @param baseline 基线对象
 * @param current 当前对象
 * @param keys 需要比较的字段名列表
 * @returns 发生变更的字段数
 */
export function countObjectFieldDiff(
  baseline: Record<string, unknown> | null | undefined,
  current: Record<string, unknown> | null | undefined,
  keys: string[],
) {
  let count = 0
  for (const key of keys) {
    if (!leafEqual(baseline?.[key], current?.[key])) count++
  }
  return count
}

/** 通用列表响应归一化工具。 */

/** CRUD 列表归一化结果 */
interface CrudListNormalized {
  rows: Array<Record<string, unknown>>
  total: number
}

/**
 * 归一化 CRUD 列表响应。
 *
 * @param data 原始响应体（数组 / { items, total } / { data }）
 * @returns 统一的 { rows, total }；无法识别时返回空列表。
 */
export function normalizeCrudListResponse(data: unknown): CrudListNormalized {
  if (Array.isArray(data)) {
    return { rows: data as Array<Record<string, unknown>>, total: data.length }
  }
  if (data && typeof data === 'object') {
    const obj = data as { items?: unknown; data?: unknown; total?: unknown }
    if (Array.isArray(obj.items)) {
      return {
        rows: obj.items as Array<Record<string, unknown>>,
        total: Number(obj.total) || obj.items.length,
      }
    }
    if (Array.isArray(obj.data)) {
      return {
        rows: obj.data as Array<Record<string, unknown>>,
        total: Number(obj.total) || obj.data.length,
      }
    }
  }
  return { rows: [], total: 0 }
}

/** - 识别后端不可达错误（502/503/504/网络错误/超时）； */
/** Axios 风格错误的最小结构（无需引入 axios 类型） */
type AxiosLikeError = {
  response?: {
    data?: {
      message?: string | string[]
      /** 后端口径的补充字段：``{"detail": "…"}``（备份 / 系统备份等端点直接返回它）。 */
      detail?: unknown
      traceId?: string
      apiErrorCode?: string
    }
    status?: number
    headers?: Record<string, unknown>
  }
  code?: string
  message?: string
}

function readRetryAfterSeconds(headers?: Record<string, unknown>): number | null {
  if (!headers) return null
  const raw =
    headers['retry-after'] ?? headers['Retry-After'] ?? headers['retry-after-default'] ?? headers['Retry-After-default']
  const n = Number(Array.isArray(raw) ? raw[0] : raw)
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.ceil(n)
}

/** 限流提示：尽量带上等待时间（无 Retry-After 时回退到共享默认文案） */
function formatRateLimitMessage(retryAfterSec?: number | null): string {
  if (retryAfterSec != null && retryAfterSec > 0) {
    if (retryAfterSec < 60) return `操作过于频繁，请约 ${retryAfterSec} 秒后再试`
    const mins = Math.max(1, Math.ceil(retryAfterSec / 60))
    return `操作过于频繁，请约 ${mins} 分钟后再试`
  }
  return HTTP_MESSAGE_TEXTS.rateLimited
}

/**
 * 判断错误是否属于「后端不可达」。
 * 涵盖 502/503/504、网络错误（ERR_NETWORK）、连接中断（ECONNABORTED）、
 * 以及 message 含 network error / timeout 的场景。
 * @param error 任意错误对象
 * @returns 是否后端不可达
 */
export function isBackendUnreachableError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const e = error as AxiosLikeError
  const status = e.response?.status
  if (status === 502 || status === 503 || status === 504) return true
  // Vite 开发代理在后端挂掉时历史上会回落成空 500；有明确业务 message 的 500 不当作不可达
  if (status === 500) {
    const flattenedMessage = flattenApiMessage(e.response?.data?.message)
    if (
      !flattenedMessage ||
      /internal server error|无法连接后端|无法连接服务器|无法连接 HomeOS|后端暂未就绪|服务暂时不可用/i.test(
        flattenedMessage,
      )
    ) {
      return true
    }
  }
  if (e.code === 'ERR_NETWORK' || e.code === 'ECONNABORTED') return true
  if (typeof e.message === 'string') {
    if (/network error/i.test(e.message)) return true
    if (/timeout/i.test(e.message)) return true
  }
  return false
}

/** 后端不可达时给出面向用户的提示（开发环境附带启动命令） */
export function getBackendUnreachableHint(): string {
  if (typeof import.meta !== 'undefined' && import.meta.env?.DEV) {
    return '后端暂未就绪，请先运行 bun run dev:backend，稍后刷新'
  }
  return '服务暂时不可用，请稍后刷新重试'
}

function backendUnreachableHint(): string {
  return getBackendUnreachableHint()
}

/** 展平 Nest ValidationPipe 等返回的 string | string[] | { message } */
function flattenApiMessage(raw: unknown): string {
  if (Array.isArray(raw)) {
    return raw
      .map((x) => flattenApiMessage(x))
      .filter(Boolean)
      .join('；')
  }
  if (typeof raw === 'string') return raw.trim()
  if (raw && typeof raw === 'object' && 'message' in raw) {
    return flattenApiMessage((raw as { message: unknown }).message)
  }
  if (raw == null) return ''
  return String(raw).trim()
}

/**
 * 读取 ``detail`` 里的**字符串**文案。
 *
 * 备份 / 系统备份 / 维护类端点刻意返回精简的 ``{"detail": "备份密码不正确…"}``（不套 Nest
 * 信封），这些文案是用户唯一能看懂的部分。只认字符串：``detail`` 为 pydantic 校验数组时
 * 由 ``message`` 承载可读文案，这里再拼一次只会得到一串 ``[object Object]``。
 */
function detailMessage(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim() : ''
}

/** 商业授权未激活导致的 401（勿当登录过期处理）
 *
 * 主判据是门禁下发的结构化 ``apiErrorCode``；再用信封文案兜底一层：
 * 一旦 ``apiErrorCode`` 被代理 / 包装层丢掉，只认结构化码就会把「未激活」
 * 误判成「登录过期」，走进刷新会话 → 重试 → 再 401 的循环。
 */
export function isLicenseInactiveError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const e = error as AxiosLikeError
  if (e.response?.status !== 401) return false
  // 结构化码优先：信封里有两个字段（``apiErrorCode`` 是给客户端判定的分类码，
  // ``errorCode`` 是 Nest 形状的稳定码），任一命中即可，不必解析文案。
  if (e.response?.data?.apiErrorCode === 'LICENSE_INACTIVE') return true
  if ((e.response?.data as { errorCode?: unknown } | undefined)?.errorCode === 'LICENSE_INACTIVE') return true
  // 文案兜底仅用于「码被代理 / 包装层丢掉」的场景：不要把它当成主判据。
  const text = flattenApiMessage(e.response?.data?.message)
  return text.includes('LICENSE_INACTIVE') || text.includes('未激活')
}

/**
 * 判断错误是否为 401 未授权（会话失效 / 未登录）。
 * 登录表单凭据错误也会是 401，调用方若需区分请结合请求 URL。
 */
export function isUnauthorizedError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  return (error as AxiosLikeError).response?.status === 401
}

/**
 * 判断错误是否为 409 版本冲突（乐观锁拒绝写入）。
 * 用于布局保存：`expectedUpdatedAt` 与服务端 `updatedAt` 不一致说明别的终端先写过。
 */
export function isConflictError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const e = error as AxiosLikeError & { status?: number }
  const status = e.response?.status ?? e.status
  return status === 409
}

/**
 * 从任意错误中提取面向用户的可读消息。
 * 优先级：后端业务文案 > 后端不可达提示 > 本地化后的 message > 未知错误。
 * @param error 任意错误
 * @returns 本地化后的错误消息字符串
 */
export function extractErrorMessage(error: unknown): string {
  if (!error) return '未知错误'
  if (typeof error === 'string') return localizeAxiosishMessage(error)
  if (typeof error === 'object') {
    const e = error as AxiosLikeError
    const data = e.response?.data
    // 后端两种错误形状并存：Nest 信封读 ``message``，备份类端点读 ``detail``。
    // 只读 ``message`` 会让后者退化成 axios 的英文 "Request failed with status code 400"，
    // 真正原因（密码不对 / 不是有效备份 / 版本不兼容）被整条丢掉。
    const apiMsg = flattenApiMessage(data?.message) || detailMessage(data?.detail)
    const status = e.response?.status
    const retryAfter = readRetryAfterSeconds(e.response?.headers)

    // 429：优先用带等待时间的提示（覆盖后端笼统中文/英文）
    if (status === 429 || /throttler|too many requests|操作过于频繁/i.test(apiMsg)) {
      return formatRateLimitMessage(retryAfter)
    }

    // 业务文案优先（含 503 服务暂不可用等）；Vite 代理空/笼统 500 除外
    const proxyishEmpty500 = status === 500 && (!apiMsg || /^(internal server error|服务器内部错误)$/i.test(apiMsg))
    if (apiMsg && !proxyishEmpty500) {
      return localizeAxiosishMessage(apiMsg, status)
    }
    if (isBackendUnreachableError(e)) return backendUnreachableHint()
    if (e.message) return localizeAxiosishMessage(String(e.message), status)
  }
  return '未知错误'
}

/**
 * 将 Axios 风格的英文错误消息本地化为简体中文。
 * 已含中文的消息原样返回；按 HTTP 状态码与关键词匹配对应中文文案。
 * @param message 原始消息
 * @param status HTTP 状态码（可选，用于精确匹配）
 * @returns 本地化后的消息
 */
function localizeAxiosishMessage(message: string, status?: number): string {
  let m = message.trim()
  if (!m) return '未知错误'
  m = m.replace(/^[A-Za-z][A-Za-z0-9]*Exception:\s*/i, '').trim() || m
  // 会话失效类文案统一为可行动提示（保留密码错误等具体业务中文）
  if (
    /^(未登录或登录已过期|会话已失效|会话已失效，请重新登录)$/.test(m) ||
    (status === 401 && /会话已失效|登录已过期|未登录或登录已过期/.test(m) && !/密码|用户名|验证码|凭证/.test(m))
  ) {
    return HTTP_MESSAGE_TEXTS.tokenExpired
  }
  // 历史/代理侧冗长「无法连接后端…」文案统一为短提示
  if (/无法连接后端|无法连接 HomeOS 后端|无法连接服务器/.test(m)) {
    return backendUnreachableHint()
  }
  if (/[\u4e00-\u9fff]/.test(m)) return m
  const statusMatch = m.match(/status code\s+(\d+)/i)
  const code = status ?? (statusMatch ? Number(statusMatch[1]) : undefined)
  // 仅映射「笼统」英文状态名；带细节的校验/业务英文文案保留原文（中文业务文案已在上方返回）
  if (HTTP_MESSAGE_PATTERNS.badRequest.test(m)) return HTTP_MESSAGE_TEXTS.badRequest
  // unauthorized 关键词（前端口径与 tokenExpired 一致；后端为「未登录或登录已过期」，故不进共享表）
  if (/^unauthorized$/i.test(m)) {
    return HTTP_MESSAGE_TEXTS.tokenExpired
  }
  if (HTTP_MESSAGE_PATTERNS.forbidden.test(m) || HTTP_MESSAGE_PATTERNS.forbiddenResource.test(m)) {
    return HTTP_MESSAGE_TEXTS.forbidden
  }
  if (code === 401) return HTTP_MESSAGE_TEXTS.tokenExpired
  if (code === 403) return HTTP_MESSAGE_TEXTS.forbidden
  if (code === 404 || HTTP_MESSAGE_PATTERNS.notFound.test(m)) return HTTP_MESSAGE_TEXTS.notFound
  if (code === 408 || HTTP_MESSAGE_PATTERNS.timeout.test(m)) return HTTP_MESSAGE_TEXTS.timeout
  if (code === 409 || HTTP_MESSAGE_PATTERNS.conflict.test(m)) return HTTP_MESSAGE_TEXTS.conflict
  if (code === 429 || HTTP_MESSAGE_PATTERNS.throttler.test(m)) {
    return formatRateLimitMessage(null)
  }
  if (code === 400) {
    // 有具体校验细节时保留（多为 class-validator 英文），仅空/笼统时回退。
    // axios 自己的样板文案（响应体里压根没有可读原因）没有信息量，直接换成中文提示。
    if (/^request failed with status code/i.test(m)) return HTTP_MESSAGE_TEXTS.badRequest
    return m || HTTP_MESSAGE_TEXTS.badRequest
  }
  if (code === 500 || HTTP_MESSAGE_PATTERNS.internalServerError.test(m)) {
    return HTTP_MESSAGE_TEXTS.internalServerError
  }
  if (code === 502 || code === 503 || code === 504) return backendUnreachableHint()
  if (/network error/i.test(m)) return backendUnreachableHint()
  if (HTTP_MESSAGE_PATTERNS.csrf.test(m)) return HTTP_MESSAGE_TEXTS.csrf
  if (HTTP_MESSAGE_PATTERNS.tokenExpired.test(m)) {
    return HTTP_MESSAGE_TEXTS.tokenExpired
  }
  if (/request failed/i.test(m) && code) return `请求失败（${code}）`
  if (/request failed/i.test(m)) return '请求失败'
  return m
}

/**
 * axios 错误消息 + 回退文案（composable 返回值常用）。
 * @param error 任意错误
 * @param fallback extractErrorMessage 无有效文案时的回退，默认「操作失败」
 * @returns 面向用户的错误消息
 */
export function getApiErrorMessage(error: unknown, fallback?: string): string {
  const fb = fallback ?? '操作失败'
  const extractedMessage = extractErrorMessage(error)
  return extractedMessage && extractedMessage !== '未知错误' ? extractedMessage : fb
}

/** 提供两个能力： */

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

/**
 * 浏览器 localStorage 的安全读写封装（前端唯一入口）。
 * Safari 隐私模式、企业策略禁用存储、配额写满等场景下读写会直接抛出
 * `SecurityError` / `QuotaExceededError`，一旦抛出会中断 store 首次 hydrate 等初始化流程，
 * 故统一收敛并提供 JSON 便捷方法。
 */

/** 读取字符串：键不存在、存储不可用或抛错时返回 fallback（默认 null） */
export function readLocalStorage(key: string, fallback: string | null = null): string | null {
  try {
    const raw = window.localStorage.getItem(key)
    return raw == null ? fallback : raw
  } catch {
    return fallback
  }
}

/** 读取布尔开关：仅字符串 '1' / 'true' 视为真；读失败返回 fallback */
export function readLocalStorageFlag(key: string, fallback = false): boolean {
  const raw = readLocalStorage(key)
  if (raw == null) return fallback
  return raw === '1' || raw.toLowerCase() === 'true'
}

/** 写入字符串：成功返回 true，存储不可用 / 超配额返回 false */
export function writeLocalStorage(key: string, value: string): boolean {
  try {
    window.localStorage.setItem(key, value)
    return true
  } catch {
    return false
  }
}

/** 删除键：成功返回 true，存储不可用返回 false */
export function removeLocalStorage(key: string): boolean {
  try {
    window.localStorage.removeItem(key)
    return true
  } catch {
    return false
  }
}

/** 读取 JSON：解析失败、存储不可用或抛错时返回 fallback */
export function readLocalStorageJson<T>(key: string, fallback: T): T {
  const raw = readLocalStorage(key)
  if (raw == null || raw === '') return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

/** 写入 JSON：序列化失败（循环引用等）或存储不可用返回 false */
export function writeLocalStorageJson(key: string, value: unknown): boolean {
  try {
    return writeLocalStorage(key, JSON.stringify(value))
  } catch {
    return false
  }
}

/** 输出策略： */
/* console 封装层：Biome 的 noConsole 已在 biome.json 中按文件豁免，此处无需再声明 */

/** 是否为开发环境（生产环境下降级只输出 error） */
const isDev = import.meta.env?.DEV ?? false

/** 日志附加参数类型 */
type LogArgs = unknown[]

/** 控制台日志全角标点 → 半角 */
function toHalfWidthPunct(text: string): string {
  return text
    .replaceAll('…', '...')
    .replaceAll('——', '--')
    .replaceAll('：', ':')
    .replaceAll('，', ',')
    .replaceAll('。', '.')
    .replaceAll('（', '(')
    .replaceAll('）', ')')
    .replaceAll('！', '!')
    .replaceAll('？', '?')
    .replaceAll('；', ';')
    .replaceAll('、', ',')
    .replaceAll('【', '[')
    .replaceAll('】', ']')
    .replaceAll('「', '"')
    .replaceAll('」', '"')
    .replaceAll('『', '"')
    .replaceAll('』', '"')
    .replaceAll('—', '-')
    .replaceAll('～', '~')
    .replaceAll('．', '.')
}

/** 统一拼接 [HomeOS:LEVEL] 前缀,便于控制台检索 */
function prefix(level: string, msg: string): string {
  return `[HomeOS:${level}] ${toHalfWidthPunct(msg)}`
}

/** logger：对象常量，字段 / 方法语义见定义处。 */
export const logger = {
  /** 错误日志：始终输出（dev/prod 均输出），用于需要现场排查的严重问题 */
  error(msg: string, ...args: LogArgs): void {
    console.error(prefix('ERROR', msg), ...args)
  },
  /** 警告日志：仅 dev 输出 */
  warn(msg: string, ...args: LogArgs): void {
    if (isDev) console.warn(prefix('WARN', msg), ...args)
  },
  /** 信息日志：仅 dev 输出 */
  info(msg: string, ...args: LogArgs): void {
    if (isDev) console.log(prefix('INFO', msg), ...args)
  },
  /** 调试日志：仅 dev 输出 */
  debug(msg: string, ...args: LogArgs): void {
    if (isDev) console.debug(prefix('DEBUG', msg), ...args)
  },
}

/** 前端通用杂项工具：数值钳制、Blob 下载、请求竞态序号、宽松 JSON 解析等。 */

/**
 * 解析用户输入的数值。
 * 空串/空白返回 null，避免 `Number('') === 0` 被当成有效输入。
 * @param raw 输入框原始值
 * @returns 有限数字，或 null（空/非法）
 */
export function parseOptionalNumber(raw: unknown): number | null {
  if (raw == null) return null
  const s = String(raw).trim()
  if (s === '') return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

/**
 * 将任意值钳制到 [min, max] 区间。
 * @param value 输入值（会尝试 Number 转换）
 * @param min 最小值（非有限数时回退到此值）
 * @param max 最大值
 * @returns 钳制后的数值
 */
export function clampNum(value: unknown, min: number, max: number): number {
  const n = parseOptionalNumber(value)
  if (n == null) return min
  return Math.min(max, Math.max(min, n))
}

/**
 * 将任意值钳制到 0–100 的百分比，并保留两位小数。
 * @param value 输入值
 * @returns 百分比数值（0–100）
 */
export function clampPct(value: unknown): number {
  return Number(clampNum(value, 0, 100).toFixed(2))
}

/**
 * 下载 Blob 为本地文件（通过临时 a 标签触发）。
 * @param blob 文件内容
 * @param filename 保存的文件名
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

/**
 * 防止异步请求竞态：仅最新序号可写回状态。
 * @returns {next, isCurrent} — next 返回新序号，isCurrent 判断给定序号是否为最新
 */
export function createFetchSequence() {
  let seq = 0
  return {
    next(): number {
      seq += 1
      return seq
    },
    isCurrent(s: number): boolean {
      return s === seq
    },
  }
}

/** 宽松 JSON 解析回退策略：'null' 返回 null；'raw' 返回原始字符串 */
type JsonLooseFallback = 'null' | 'raw'

/**
 * 宽松 JSON 解析：数组/对象原样返回；字符串尝试 JSON.parse。
 * @param value 输入值
 * @param fallback 解析失败时的回退策略，默认 'null'
 * @returns 解析结果；失败时按 fallback 返回 null 或原始值
 */
export function parseJsonLoose<T = unknown>(
  value: unknown,
  fallback: JsonLooseFallback = 'null',
): T | string | null | unknown {
  if (value == null || value === '') return fallback === 'null' ? null : value
  if (Array.isArray(value) || typeof value === 'object') return value
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback === 'raw' ? value : null
  }
}

/** 设计要点： */
/** 单个轮询任务定义 */
interface PollJob {
  fn: () => void
  intervalMs: number
  lastRun: number
  /** 是否感知页面可见性：true 时页面隐藏暂停；false 时后台常驻运行 */
  visibilityAware: boolean
}

/** sharedFetch 缓存条目 */
interface SharedCacheEntry {
  at: number
  data: unknown
}

/** 已注册的轮询任务表（key -> job） */
const jobs = new Map<string, PollJob>()
/** 全局刻度定时器句柄 */
let tickTimer: ReturnType<typeof setInterval> | null = null
/** 任务序号，用于错峰分配 */
let jobSeq = 0
/** 刻度间隔（毫秒），最小 1000 */
let tickMs = 1000

/**
 * 调整刻度间隔（最小 1000ms）。已在运行时重启定时器以应用新间隔。
 * @param ms 新的刻度间隔
 */
export function setPollTickMs(ms: number): void {
  const next = Math.max(1000, Number(ms) || 1000)
  if (next === tickMs) return
  tickMs = next
  if (tickTimer) {
    stopTick()
    ensureTick()
  }
}

/** 当前页面是否隐藏（隐藏时暂停轮询以节省资源） */
function pageHidden() {
  return typeof document !== 'undefined' && document.hidden
}

/** 执行所有到期任务；页面隐藏时跳过 visibilityAware 任务（后台常驻任务不受影响） */
function runDue() {
  const hidden = pageHidden()
  const now = Date.now()
  for (const job of jobs.values()) {
    // 页面隐藏时仅暂停感知可见性的任务；后台常驻任务（如会话刷新）继续按周期运行
    if (hidden && job.visibilityAware) continue
    if (now - job.lastRun < job.intervalMs) continue
    job.lastRun = now
    try {
      job.fn()
    } catch {
      /* 单任务失败不影响调度器，避免拖垮其他任务 */
    }
  }
}

/** 确保刻度定时器运行（无任务时不启动） */
function ensureTick() {
  if (tickTimer || jobs.size === 0) return
  tickTimer = setInterval(runDue, tickMs)
}

/** 停止刻度定时器 */
function stopTick() {
  if (!tickTimer) return
  clearInterval(tickTimer)
  tickTimer = null
}

// 页面从隐藏恢复可见时立即跑一次，保证数据及时刷新
// 模块顶层一次性注册（模块本体只求值一次）：调度器是模块级单例，不配对移除。
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (!pageHidden()) runDue()
  })
}

/**
 * 注册一个轮询任务。
 * @param key 任务唯一标识（同 key 会覆盖旧任务）
 * @param fn 任务回调
 * @param intervalMs 轮询间隔（最小 1000ms）
 * @param opts.visibilityAware 是否感知页面可见性，默认 true：
 *   - true：页面隐藏时该任务暂停（UI 时钟、倒计时等）；
 *   - false：页面隐藏时仍按周期运行（会话刷新、上报心跳等后台常驻服务）。
 * @param opts.runImmediately 是否错峰后立即执行一次，默认 true；
 *   设为 false 时跳过首跑（调用方已显式触发时避免双发）。
 * @returns 取消订阅函数（调用后移除该任务）
 */
export function schedulePoll(
  key: string,
  fn: () => void,
  intervalMs: number,
  opts?: { visibilityAware?: boolean; runImmediately?: boolean },
): () => void {
  const ms = Math.max(1000, Number(intervalMs) || 60_000)
  // 是否感知页面可见性（默认 true：页面隐藏时暂停该任务）
  const visibilityAware = opts?.visibilityAware !== false
  const runImmediately = opts?.runImmediately !== false
  // 错峰：按序号取模 8 槽，每槽错开 350ms，避免集中触发
  const stagger = (jobSeq++ % 8) * 350
  // 跳过首跑时把 lastRun 设为「刚跑过」，等满一个 interval 再触发；
  // 需要首跑时把 lastRun 设为「在错峰点刚跑过」——不能设成 `now + stagger - ms`
  // （那等于宣布任务「现在就到期」），否则错峰点晚于 1s 的任务会先被刻度跑一次、
  // 再被错峰回调跑一次：每个任务在启动阶段多发一次请求。
  const startedAt = Date.now()
  jobs.set(key, {
    fn,
    intervalMs: ms,
    lastRun: runImmediately ? startedAt + stagger : startedAt,
    visibilityAware,
  })
  ensureTick()
  // 首次触发：可见时（或后台常驻任务不受隐藏限制）按错峰时间立即执行一次
  if (runImmediately && (!pageHidden() || !visibilityAware)) {
    setTimeout(() => {
      // 必须比对回调身份：同 key 在这段错峰窗口内被重新注册时，`jobs.has(key)` 仍为 true，
      // 只查 has 会把**旧**任务的 fn 再跑一遍（旧任务已经被覆盖，等于双发 + 重复请求）。
      const job = jobs.get(key)
      if (job?.fn !== fn || (pageHidden() && visibilityAware)) return
      job.lastRun = Date.now()
      fn()
    }, stagger)
  }
  return () => {
    // 必须比对回调身份：同 key 在这之后被重新注册（例如挂载了第二个使用同一显式 key
    // 的小组件）时，旧订阅的取消只能移除自己那一份，不能把新任务的 job 一起删掉，
    // 否则新任务会在无人察觉的情况下永久停止轮询。
    if (jobs.get(key)?.fn !== fn) return
    jobs.delete(key)
    if (jobs.size === 0) stopTick()
  }
}

/** 获取调度器运行状态（用于调试 / 监控） */
export function getPollSchedulerStats() {
  return { activeJobs: jobs.size, ticking: !!tickTimer, hidden: pageHidden(), tickMs }
}

/** sharedFetch 进行中的 Promise 表（同 key 去重） */
const sharedInflight = new Map<string, Promise<unknown>>()
/** sharedFetch 内存缓存表 */
const sharedCache = new Map<string, SharedCacheEntry>()
/** 缓存最大条目数，超出后清理旧条目 */
const MAX_CACHE_ENTRIES = 100
/** 缓存清理定时器句柄 */
let cacheCleanupTimer: ReturnType<typeof setTimeout> | null = null

/** 清理过期（>60s）与超量缓存条目；若仍有残留则继续调度下一轮清理 */
function cleanupExpiredCache() {
  const now = Date.now()
  let deleted = 0
  for (const [key, entry] of sharedCache) {
    if (now - entry.at > 60_000) {
      sharedCache.delete(key)
      deleted++
    }
  }
  if (sharedCache.size > MAX_CACHE_ENTRIES) {
    let count = 0
    for (const key of sharedCache.keys()) {
      sharedCache.delete(key)
      deleted++
      count++
      if (count >= sharedCache.size - MAX_CACHE_ENTRIES) break
    }
  }
  if (deleted > 0 && sharedCache.size > 0) {
    scheduleCacheCleanup()
  } else {
    cacheCleanupTimer = null
  }
}

/** 安排一次缓存清理（30s 后执行，已存在则跳过） */
function scheduleCacheCleanup() {
  if (cacheCleanupTimer) return
  cacheCleanupTimer = setTimeout(cleanupExpiredCache, 30_000)
}

/**
 * 清除 sharedFetch 内存缓存（配置保存后避免读到旧快照）。
 * @param key 指定 key 时只清该条；不传则清空全部
 */
export function invalidateSharedFetch(key?: string): void {
  if (key) {
    sharedCache.delete(key)
    sharedInflight.delete(key)
    return
  }
  sharedCache.clear()
  sharedInflight.clear()
}

/** 按前缀清除 sharedFetch 缓存（如 IAQ map 变更后失效全部 iaq key） */
export function invalidateSharedFetchPrefix(prefix: string): void {
  if (!prefix) return
  for (const key of sharedCache.keys()) {
    if (key.startsWith(prefix)) sharedCache.delete(key)
  }
  for (const key of sharedInflight.keys()) {
    if (key.startsWith(prefix)) sharedInflight.delete(key)
  }
}

/**
 * 共享 fetch：同 key 请求去重 + TTL 内存缓存。
 * @param key 缓存键
 * @param fetcher 实际请求函数
 * @param ttlMs 缓存存活时间，默认 5000ms
 * @returns 命中缓存则直接返回；否则等待 fetcher 结果并缓存
 */
export async function sharedFetch<T>(key: string, fetcher: () => Promise<T>, ttlMs = 5000): Promise<T> {
  const now = Date.now()
  const cached = sharedCache.get(key)
  if (cached && now - cached.at < ttlMs) return cached.data as T

  // 同 key 并发请求复用同一 inflight Promise，避免重复打接口
  let inflight = sharedInflight.get(key)
  if (!inflight) {
    inflight = Promise.resolve()
      .then(fetcher)
      .then((data) => {
        sharedCache.set(key, { at: Date.now(), data })
        sharedInflight.delete(key)
        scheduleCacheCleanup()
        return data
      })
      .catch((err) => {
        sharedInflight.delete(key)
        throw err
      })
    sharedInflight.set(key, inflight)
  }
  return inflight as Promise<T>
}

/**
 * 全量恢复成功后的导航锁。
 *
 * 恢复成功的那一刻，当前页面的会话与授权都已失效：设置页上仍在跑的后台请求会陆续撞上
 * 401 / 授权失效，各自触发「去登录页（带 redirect 回设置页）」或「去激活页」。它们一旦
 * 抢在恢复流程的整页跳转之前生效，用户就会先落到激活页而不是登录页。
 *
 * 上锁后上述自动跳转一律让路，只留恢复流程自己的 `location.replace`。本模块不得引入
 * 任何依赖：api client、路由守卫、运行时导航桥都要读它，引入依赖即成环。
 */
let locked = false

/** 恢复成功后立即上锁；页面随后整页跳走，锁随文档一起销毁，无需解锁。 */
export function lockNavigationAfterRestore(): void {
  locked = true
}

/** 是否处于恢复后的跳转窗口（为 true 时自动跳转应直接放弃）。 */
export function isNavigationLockedAfterRestore(): boolean {
  return locked
}

/** - 注册 /sw.js 并监听 updatefound / controllerchange，在 SW 更新就绪时回调提示用户刷新； */
/** sessionStorage key：标记本会话已确认 SW 无法注册，避免反复重试刷屏 */
const SW_SKIP_KEY = 'homeos:sw-skip'

/** 是否应跳过 Service Worker 注册（不支持 / 非安全上下文 / 之前已失败） */
function shouldSkipServiceWorker(): boolean {
  if (!('serviceWorker' in navigator)) return true
  // 非安全上下文（http + 非 localhost）下浏览器本就不允许注册 SW
  if (typeof window !== 'undefined' && window.isSecureContext === false) return true
  try {
    return sessionStorage.getItem(SW_SKIP_KEY) === '1'
  } catch {
    return false
  }
}

/** 标记本会话跳过 SW 注册（写入 sessionStorage） */
function markServiceWorkerSkipped() {
  try {
    sessionStorage.setItem(SW_SKIP_KEY, '1')
  } catch {
    /* ignore storage 不可用 */
  }
}

/**
 * 当通过自签 / 不受信任证书的 HTTPS 访问时，浏览器会抛出
 * "An SSL certificate error occurred when fetching the script."
 * 这类错误属于 SecurityError，无法被 JS 完全屏蔽，但我们可以：
 * 1) 仅在安全上下文尝试注册；
 * 2) 失败后给出明确指引，并在本会话内不再重试，避免反复刷屏。
 */
function isSslOrSecurityError(err: unknown): boolean {
  if (!err) return false
  const name = (err as { name?: string }).name ?? ''
  const message = (err as { message?: string }).message ?? ''
  return name === 'SecurityError' || /SSL|certificate|insecure/i.test(message)
}

/**
 * 监听 Service Worker 更新并提示用户确认刷新。
 *
 * 更新模型（用户确认式）：
 *  - sw.js 不再自动 skipWaiting；新版本 SW 安装后进入 waiting 态；
 *  - 检测到 waiting 即回调 onUpdate(applyUpdate)，由用户确认后调用 applyUpdate()
 *    向 waiting worker 发送 SKIP_WAITING；
 *  - 新 SW 接管（controllerchange）后刷新页面加载新版本；
 *  - 首次安装（无 controller）直接激活，不打扰用户也不触发刷新。
 *
 * @param onUpdate 检测到新版本就绪时的回调，参数为激活更新的函数
 * @returns 卸载函数：移除监听并触发一次 update 检查
 */
export function setupPwaUpdatePrompt(onUpdate?: ((applyUpdate: () => void) => void) | null) {
  if (shouldSkipServiceWorker()) return () => {}

  let refreshing = false
  /** 仅在用户确认更新后才于 controllerchange 时刷新；首次安装激活不刷新 */
  let reloadOnControllerChange = false
  const onControllerChange = () => {
    if (refreshing || !reloadOnControllerChange) return
    refreshing = true
    window.location.reload()
  }
  navigator.serviceWorker.addEventListener('controllerchange', onControllerChange)

  let registration: ServiceWorkerRegistration | undefined
  const postSkipWaiting = (worker?: ServiceWorker | null) => {
    worker?.postMessage({ type: 'SKIP_WAITING' })
  }
  navigator.serviceWorker
    .register('/sw.js', { scope: '/' })
    .then((reg) => {
      registration = reg
      const applyUpdate = () => {
        reloadOnControllerChange = true
        postSkipWaiting(reg.waiting)
      }
      if (reg.waiting) {
        if (!navigator.serviceWorker.controller) postSkipWaiting(reg.waiting)
        else onUpdate?.(applyUpdate)
      }
      // 每次 register() 都拿到**新的** registration / worker 对象，监听随对象成为垃圾，
      // 不会跨版本累积；控制器换代的监听（controllerchange）已在上面的清理函数里摘除。
      reg.addEventListener('updatefound', () => {
        const worker = reg.installing
        if (!worker) return
        worker.addEventListener('statechange', () => {
          if (worker.state !== 'installed') return
          if (!navigator.serviceWorker.controller) postSkipWaiting(worker)
          else onUpdate?.(applyUpdate)
        })
      })
    })
    .catch((err: unknown) => {
      if (isSslOrSecurityError(err)) {
        markServiceWorkerSkipped()
        if (import.meta.env.DEV) {
          console.warn(
            '[HomeOS] Service Worker 注册失败:当前 HTTPS 证书不受信任,离线/更新功能已禁用.' +
              '请在本设备信任 Caddy 内置根 CA(/data/caddy/pki/authorities/local/root.crt),' +
              '或改用 localhost / 受信任证书访问.',
          )
        }
      }
      // 其它错误静默忽略，PWA 功能缺失不影响应用主流程
    })

  return () => {
    navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange)
    registration?.update?.()
  }
}

/** 实现优先级： */

/**
 * 生成 RFC4122 v4 UUID，兼容非 HTTPS 等无 crypto.randomUUID 的环境。
 *
 * @returns 符合 v4 格式的 UUID 字符串
 */
export function randomUUID(): string {
  // 1) 优先使用原生 randomUUID（最快且最安全）
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  // 2) 退化：用 getRandomValues 填充 16 字节，并按 v4 规范设置 version/variant 位
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(16)
    crypto.getRandomValues(bytes)
    bytes[6] = (bytes[6] & 0x0f) | 0x40 // version 位固定为 0x40（表示 v4）
    bytes[8] = (bytes[8] & 0x3f) | 0x80 // variant 位固定为 0x80（RFC4122）
    const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
  }

  // 3) 最终兜底：Math.random 拼接（非安全上下文，不可用于安全敏感场景）
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}
