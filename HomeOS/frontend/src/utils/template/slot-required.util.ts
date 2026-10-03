/**
 * 模板槽位必填校验工具。
 *
 * 职责：基于 @homeos/shared 的必填槽位分组，提供必填键集合、
 * 缺失分组、单个槽位是否必填等查询，供 Builder 表单实时高亮未完成项。
 *
 * 依赖：@homeos/shared 的 getRequiredSlotGroups。
 */

import { getRequiredSlotGroups } from '@homeos/shared'

/**
 * 获取指定家电类型的全部必填槽位键集合。
 * yaml_import / trigger_sensor 无必填槽位概念，直接返回空集合。
 *
 * @param typeId 家电类型 ID
 * @returns 必填槽位键集合
 */
export function getRequiredSlotKeySet(typeId: string): Set<string> {
  if (!typeId || typeId === 'yaml_import' || typeId === 'trigger_sensor') return new Set()
  return new Set(getRequiredSlotGroups(typeId).flat())
}

/**
 * 判断指定槽位是否已填写（非空白）。
 * @param slots 槽位映射
 * @param slotKey 槽位键
 * @returns 已填写返回 true
 */
export function isSlotFilled(slots: Record<string, string>, slotKey: string): boolean {
  return !!String(slots[slotKey] || '').trim()
}

/**
 * 返回尚未满足的必填槽位组。
 * 语义与 validateApplianceSlotMapping 一致：任一组「全部填满」即通过；
 * 全部未通过时返回各组中未填满的组，供 UI 提示。
 */
export function getMissingRequiredGroups(
  typeId: string,
  slots: Record<string, string>,
): string[][] {
  if (!typeId || typeId === 'yaml_import' || typeId === 'trigger_sensor') return []
  const groups = getRequiredSlotGroups(typeId)
  if (!groups.length) return []
  const groupComplete = (group: string[]) => group.every((key) => isSlotFilled(slots, key))
  if (groups.some(groupComplete)) return []
  return groups.filter((group) => !groupComplete(group))
}

/**
 * 判断指定槽位在当前类型下是否必填。
 * @param typeId 家电类型 ID
 * @param slotKey 槽位键
 * @returns 必填返回 true
 */
export function isSlotRequired(typeId: string, slotKey: string): boolean {
  return getRequiredSlotKeySet(typeId).has(slotKey)
}
