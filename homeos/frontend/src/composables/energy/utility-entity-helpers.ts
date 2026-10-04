/**
 * 公用事业实体辅助函数：从 HA 实体读取并解析弹窗属性值。
 *
 * 模块职责：
 *  - 提供 HA 实体 attributes / 嵌套 data 字段的统一读取入口；
 *  - 提供宽松 JSON 与数值解析工具，供水/电/气/通信弹窗复用。
 *
 * 依赖：
 *  - @/utils/core/misc.util 中的 parseJsonLoose（容忍非标准 JSON）；
 *  - @/types/entity-store 中的 HaEntityState 类型。
 */
import { parseJsonLoose } from '@/utils/core/misc.util'
import type { HaEntityState } from '@/types/entity-store'

/**
 * 从 HA 实体读取弹窗属性值。
 *
 * 查找顺序：
 *  1. 实体顶层 attributes[name]；
 *  2. 嵌套 attributes.data[name]（部分集成会将数据包裹在 data 子对象中）。
 *
 * @param entity HA 实体状态，可为 null/undefined
 * @param name   属性名（与 HA 集成原始 payload key 一致，不做转换）
 * @returns 属性值；不存在时返回 undefined
 */
export function readPopupAttr(entity: HaEntityState | null | undefined, name: string) {
  if (!entity?.attributes) return undefined
  if (entity.attributes[name] !== undefined) return entity.attributes[name]
  const data = entity.attributes.data
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    return (data as Record<string, unknown>)[name]
  }
  return undefined
}

/**
 * 解析 JSON 字符串；若已是数组或对象则原样返回。
 * 使用 'null' 容错策略：解析失败时返回 null，避免抛错中断 UI 渲染。
 * @param value 待解析的值（可能是 JSON 字符串、数组、对象或其他类型）
 * @returns 解析后的数组/对象，或 null
 */
export const parseJsonAttr = (value: unknown) => parseJsonLoose(value, 'null')

/**
 * 解析数值字符串。
 * @param value 待解析的值（字符串、数字等）
 * @returns 解析得到的数字；非数字时返回 null（不抛异常）
 */
export function parseNumAttr(value: unknown) {
  const v = parseFloat(String(value ?? ''))
  return Number.isNaN(v) ? null : v
}