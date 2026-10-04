/**
 * 通用列表响应归一化工具。
 *
 * 职责：把后端 CRUD 列表响应的多种形态（数组 / { items } / { data }）统一为 { rows, total }。
 * 依赖：无。
 */

/** CRUD 列表归一化结果 */
export interface CrudListNormalized {
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
