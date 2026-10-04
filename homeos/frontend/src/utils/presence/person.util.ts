/**
 * 在家人员配置工具模块。
 *
 * 职责：
 * - 规范化前端人员配置（生成缺失 ID、补默认字段）；
 * - 从安防配置中提取并归一化人员列表；
 * - 提供人员排序、保存前清洗、空对象构造等辅助能力。
 *
 * 依赖：
 * - @homeos/shared（normalizePresencePersonsShared、PresencePerson 类型）
 * - @/utils/core/random-uuid.util（UUID 生成）
 */
import {
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



