/**
 * @module core/local-storage
 * @description 浏览器 localStorage 的安全读写封装（前端唯一入口）。
 *
 * 背景：Safari 隐私模式、企业策略禁用存储、配额写满等场景下，localStorage 的读写会直接抛出
 * `SecurityError` / `QuotaExceededError`；业务代码此前散落 30+ 处裸调用，一旦抛错会中断
 * store 首次 hydrate 等初始化流程。此处统一收敛并提供 JSON 便捷方法。
 *
 * 约定：
 * - 读失败返回 fallback / null，写失败返回 false，一律静默降级，由调用方决定是否兜底提示；
 * - 仅负责字符串与 JSON 存取，不做 schema 校验与数据迁移；
 * - 需要监听跨标签页变更时直接使用 `window.addEventListener('storage', ...)`，本模块不代理事件。
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
