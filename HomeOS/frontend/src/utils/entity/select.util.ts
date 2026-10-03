/**
 * 实体下拉选项构建工具
 *
 * 职责：
 * - 把 HA entity_id + 实体状态解析为下拉选项（value / label / hint）。
 * - label 优先使用实体的预计算 name，否则回退 getEntityDisplayName 推断的友好名。
 * - hint 优先使用显式 hint，否则对合法 HA entity_id 显示完整 ID。
 *
 * 依赖：@/utils/entity/derived.util 提供实体友好名推断；@/types/entity-store。
 *
 * 注意：entity_id（domain.object_id）为 HA 标识符，不翻译。
 */
import { getEntityDisplayName } from '@/utils/entity/derived.util'
import type { HaEntityState } from '@/types/entity-store'

/** 是否为 Home Assistant 风格的 entity_id（domain.object_id） */
function isHaEntityId(value: unknown): boolean {
  const s = String(value ?? '').trim()
  if (!s.includes('.')) return false
  const [domain, objectId] = s.split('.', 2)
  if (!domain || !objectId) return false
  return /^[a-z_][a-z0-9_]*$/i.test(domain)
}

/**
 * 下拉副标题：优先显式 hint，否则对合法 HA entity_id 使用完整 ID。
 *
 * @param value 输入值（通常为 entity_id）
 * @param explicitHint 显式 hint，非空时优先使用
 * @returns 副标题字符串；非合法 entity_id 且无显式 hint 时返回空串
 */
export function entitySelectHint(value: unknown, explicitHint?: string | null): string {
  if (explicitHint != null && String(explicitHint).trim() !== '') return String(explicitHint).trim()
  return isHaEntityId(value) ? String(value).trim() : ''
}

/** 实体下拉选项结构：value / label / hint 三段 */
interface EntitySelectOption {
  value: string
  label: string
  hint: string
}

/**
 * 解析实体下拉 label：预计算 name 优先，否则回退到 getEntityDisplayName。
 *
 * @param entityId 实体 id
 * @param entity 实体状态对象（可能含预计算 name 字段）
 * @returns 显示用 label 字符串
 */
function resolveEntitySelectLabel(
  entityId: string,
  entity?: HaEntityState | Record<string, unknown> | null,
): string {
  const precomputed =
    entity && typeof entity === 'object' && 'name' in entity
      ? String((entity as { name?: unknown }).name ?? '').trim()
      : ''
  if (precomputed) return precomputed
  return getEntityDisplayName(entityId, entity as HaEntityState | undefined)
}

/** 构建实体下拉选项：label=友好名，hint=完整 entity_id */
export function formatEntitySelectOption(
  entityId: string,
  entity?: HaEntityState | Record<string, unknown> | null,
): EntitySelectOption {
  return {
    value: entityId,
    label: resolveEntitySelectLabel(entityId, entity),
    hint: entityId,
  }
}
