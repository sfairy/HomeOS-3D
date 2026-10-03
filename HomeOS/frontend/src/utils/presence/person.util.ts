/**
 * 在家人员配置工具模块。
 *
 * 职责：
 * - 规范化前端人员配置（生成缺失 ID、补默认字段）；
 * - 从安防配置中提取并归一化人员列表；
 * - 提供人员排序、保存前清洗、空对象构造等辅助能力。
 *
 * 依赖：
 * - @homeos/shared（computePersonAtHome、normalizePresencePersonsShared、PresencePerson 类型）
 * - @/utils/core/random-uuid.util（UUID 生成）
 */
import {
  computePersonAtHome,
  normalizePresencePersons as normalizePresencePersonsShared,
  type PresencePerson as SharedPresencePerson,
} from '@homeos/shared'
import { randomUUID } from '@/utils/core/random-uuid.util'

/** 前端人员配置类型：在共享类型基础上补充 userId 字段 */
export type PresencePerson = SharedPresencePerson & { userId: string }

/**
 * 规范化人员配置（缺 id 时用 UUID，适配设置页编辑）。
 *
 * 委托 shared 层完成主体归一化，传入 UUID 生成器；
 * 额外补齐 userId 字段（缺失时置为空字符串）。
 *
 * @param raw 原始人员数据（可能为任意结构）
 * @returns 归一化后的人员数组
 */
function normalizePresencePersons(raw: unknown): PresencePerson[] {
  return normalizePresencePersonsShared(raw, {
    generateId: () => randomUUID(),
  }).map((p) => ({
    ...p,
    userId: p.userId ?? '',
  }))
}

/**
 * 从安防配置对象中提取并归一化人员列表。
 *
 * @param security 安防配置对象，可能包含 presencePersons 字段
 * @returns 归一化后的人员数组
 */
export function getPresencePersonsFromSecurity(security: { presencePersons?: unknown } = {}) {
  return normalizePresencePersons(security.presencePersons)
}

export { computePersonAtHome }

/**
 * 创建一个空白的人员配置对象，供设置页「新增人员」使用。
 *
 * @returns 带 UUID 的新人员对象，所有集合字段初始化为空
 */
export function createEmptyPresencePerson(): PresencePerson {
  return {
    id: randomUUID(),
    name: '',
    entityIds: [],
    userId: '',
  }
}

/**
 * 调整人员列表顺序（用于 UI 排序）。
 *
 * 采用 splice 移除再插入的方式实现拖拽排序；
 * 越界或相同索引时直接返回原顺序的拷贝，不抛异常。
 *
 * @param list 当前人员列表（非数组时视为空）
 * @param fromIndex 起始索引
 * @param toIndex 目标索引
 * @returns 排序后的新数组（不修改原数组）
 */
export function reorderPresencePersons(
  list: PresencePerson[] | unknown,
  fromIndex: number,
  toIndex: number,
): PresencePerson[] {
  const next = [...(Array.isArray(list) ? list : [])] as PresencePerson[]
  if (fromIndex < 0 || toIndex < 0 || fromIndex >= next.length || toIndex >= next.length)
    return next
  if (fromIndex === toIndex) return next
  const [item] = next.splice(fromIndex, 1)
  next.splice(toIndex, 0, item)
  return next
}

/**
 * 保存前清洗人员列表：去空白、补 ID、过滤无效项。
 *
 * 规则：
 * - id 缺失时生成新 UUID；
 * - name 与 entityIds 做字符串清洗；
 * - 过滤掉 name 为空或 entityIds 为空的项。
 *
 * @param persons 原始人员数据
 * @returns 清洗后可直接提交后端的人员数组
 */
export function sanitizePresencePersonsForSave(persons: unknown): PresencePerson[] {
  return (Array.isArray(persons) ? persons : [])
    .map((p) => {
      const row = (p && typeof p === 'object' ? p : {}) as Record<string, unknown>
      return {
        id: String(row.id ?? randomUUID()).trim(),
        name: String(row.name ?? '').trim(),
        entityIds: (Array.isArray(row.entityIds) ? row.entityIds : [])
          .map((id) => String(id).trim())
          .filter(Boolean),
        userId: String(row.userId ?? '').trim(),
      }
    })
    .filter((p) => p.name && p.entityIds.length > 0)
}