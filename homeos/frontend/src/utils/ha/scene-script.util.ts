/**
 * HA 场景 / 脚本实体工具。
 *
 * 职责：
 * - 从记录解析 HA `scene.*` / `script.*` 实体 ID（兼容旧 HomeOS 场景记录的 haConfigId / name）。
 * - 从实体缓存中收集 scene / script 记录，供设置页下拉选择。
 *
 * 依赖：@/utils/entity/derived.util（实体展示名）。
 */
import { getEntityDisplayName } from '@/utils/entity/derived.util'
import type { EntitySnapshot } from '@/types/entity'

/** HA 场景 / 脚本记录（最小行形状） */
export interface HaSceneScriptRecord {
  id: string
  name?: string
  haConfigId?: string
  runOnHa?: boolean
}

/** 场景实体 ID（HA scene.*） */
function sceneEntityId(sceneId: string | null | undefined) {
  const id = String(sceneId || '').trim()
  if (!id) return ''
  return id.includes('.') ? id : `scene.${id}`
}

/** 脚本实体 ID（HA script.*） */
function scriptEntityId(scriptId: string | null | undefined) {
  const id = String(scriptId || '').trim()
  if (!id) return ''
  return id.includes('.') ? id : `script.${id}`
}

/** 从已保存场景记录解析 entity_id */
export function sceneEntityIdFromRecord(
  s: { haConfigId?: string | null; name?: string | null } | null | undefined,
) {
  if (s?.haConfigId) return sceneEntityId(String(s.haConfigId).replace(/^homeos_/, ''))
  return s?.name ? sceneEntityId(s.name) : ''
}

/** 从已保存脚本记录解析 entity_id */
export function scriptEntityIdFromRecord(
  s: { haConfigId?: string | null; name?: string | null } | null | undefined,
) {
  if (s?.haConfigId) return scriptEntityId(String(s.haConfigId).replace(/^homeos_/, ''))
  return s?.name ? scriptEntityId(s.name) : ''
}

type EntityLike = {
  entity_id?: string
  state?: string
  attributes?: EntitySnapshot['attributes']
}

/**
 * 从实体缓存收集指定域的 scene / script 记录。
 *
 * @param entities 实体缓存（entity_id → 实体状态）
 * @param domain 'scene' | 'script'
 * @returns 记录数组（id = entity_id）
 */
export function collectHaSceneScriptRecords(
  entities: Record<string, EntityLike | undefined> | undefined,
  domain: 'scene' | 'script',
): HaSceneScriptRecord[] {
  if (!entities) return []
  const prefix = `${domain}.`
  return Object.keys(entities)
    .filter((id) => id.startsWith(prefix))
    .map((id) => ({
      id,
      name: getEntityDisplayName(id, entities[id]),
      haConfigId: id,
      runOnHa: true,
    }))
}
