/**
 * @module core/misc
 * @description 前端通用杂项工具：数值钳制、Blob 下载、请求竞态序号、宽松 JSON 解析等。
 *
 * 依赖：浏览器 DOM（downloadBlob）。
 */

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
