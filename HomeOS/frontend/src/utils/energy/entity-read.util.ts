/**
 * @module energy-entity-read.util
 * @description 能源实体属性读取工具模块。
 *
 * 职责：从 HA 实体映射中读取指定实体的属性值，
 * 兼容属性位于顶层 `attributes` 或嵌套 `attributes.data` 两种结构。
 *
 * 依赖：`entity-store` 类型定义。
 */
import type { HaEntityState } from '@/types/entity-store'

type EntityAttrMap = Record<string, HaEntityState | undefined> | null | undefined

/**
 * 从 HA 实体映射中读取指定实体的属性值。
 *
 * 读取顺序：
 * 1. 优先取 `attributes[attrName]`（顶层属性）。
 * 2. 若顶层不存在，则尝试从 `attributes.data` 对象中取同名属性（嵌套结构）。
 *
 * @param entities 实体 ID 到实体状态的映射表。
 * @param entityId 实体 ID。
 * @param attrName 属性名。
 * @returns 属性值；实体不存在、属性不存在时返回 undefined。
 */
export function readEntityAttr(
  entities: EntityAttrMap,
  entityId: string | null | undefined,
  attrName: string | null | undefined,
) {
  if (!entityId || !attrName) return undefined
  const ent = entities?.[entityId]
  if (!ent?.attributes) return undefined
  if (ent.attributes[attrName] !== undefined) return ent.attributes[attrName]
  const data = ent.attributes.data
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    return (data as Record<string, unknown>)[attrName]
  }
  return undefined
}
