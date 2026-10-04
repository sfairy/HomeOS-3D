/**
 * @module comma-entity-ids.util
 * @description 逗号 / 空白分隔的 entity_id 列表工具模块。
 *
 * 职责：在 entity_id 字符串与数组之间互转，兼容半角逗号、全角逗号、空白分隔。
 * 用于排风等多实体字符串字段，以及关阀等单选字段。
 */

/**
 * 将逗号 / 空白分隔的字符串解析为 entity_id 数组。
 *
 * @param raw 原始值（字符串或其他类型）。
 * @returns 去除空段后的 entity_id 数组；raw 为空时返回空数组。
 */
export function parseCommaEntityIds(raw: unknown): string[] {
  const text = String(raw ?? '').trim()
  if (!text) return []
  return text
    .split(/[,，\s]+/)
    .map((part) => part.trim())
    .filter(Boolean)
}

/**
 * 将 entity_id 数组拼接为半角逗号 + 空格分隔的字符串。
 *
 * @param ids entity_id 数组。
 * @returns 拼接后的字符串；非数组或空数组返回空字符串。
 */
export function joinCommaEntityIds(ids: unknown[]): string {
  if (!Array.isArray(ids)) return ''
  return ids
    .map((id) => String(id ?? '').trim())
    .filter(Boolean)
    .join(', ')
}

/**
 * 单 entity_id 字符串转数组（关阀等单选字段用）。
 *
 * @param raw 原始值。
 * @returns 非空时返回单元素数组，否则返回空数组。
 */
export function singleEntityToIds(raw: unknown): string[] {
  const id = String(raw ?? '').trim()
  return id ? [id] : []
}

/**
 * 数组转单 entity_id 字符串（取首个元素）。
 *
 * @param ids entity_id 数组。
 * @returns 首个非空 entity_id；空数组返回空字符串。
 */
export function idsToSingleEntity(ids: unknown[]): string {
  if (!Array.isArray(ids) || !ids.length) return ''
  return String(ids[0] ?? '').trim()
}
