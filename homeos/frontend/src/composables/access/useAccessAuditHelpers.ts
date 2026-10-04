/**
 * @file 访问控制 — 命令审计辅助函数
 * @module composables/access/useAccessAuditHelpers
 * @description
 *   提供命令审计查询的纯函数工具：分页大小常量、筛选参数构建、查询 URL 构建，
 *   以及复用的 formatAuditTime 时间格式化函数。
 *   依赖：@/utils/format/locale-format.util 的时间格式化能力。
 */
/** 访问控制 — 命令审计辅助函数 */
import { formatAuditTime } from '@/utils/format/locale-format.util'
import type { AccessAuditQueryOpts } from '@/types/access'

/** 命令审计默认每页条数 */
const AUDIT_PAGE_SIZE = 50
/** 登录审计默认每页条数 */
export const LOGIN_AUDIT_PAGE_SIZE = 20

// 透传导出时间格式化函数，供调用方统一引用
export { formatAuditTime }

/**
 * 构建审计筛选的 URLSearchParams
 * @param auditEntityFilter 实体筛选（entity_id），空字符串视为不过滤
 * @param auditUserFilter   用户筛选（username），空字符串视为不过滤
 * @returns 仅包含非空条件的 URLSearchParams
 */
export function buildAuditFilterParams(
  auditEntityFilter: string,
  auditUserFilter: string,
): URLSearchParams {
  const params = new URLSearchParams()
  const entity = auditEntityFilter.trim()
  const user = auditUserFilter.trim()
  if (entity) params.set('entityId', entity)
  if (user) params.set('username', user)
  return params
}

/**
 * 构建命令审计查询 URL（含 limit 与可选 page）
 * @param auditEntityFilter 实体筛选
 * @param auditUserFilter   用户筛选
 * @param opts.limit 单页条数，默认 AUDIT_PAGE_SIZE
 * @param opts.page  页码，未传则不附加 page 参数
 * @returns 形如 `/audit/commands?limit=50&page=1&...` 的查询 URL
 */
export function buildAuditQuery(
  auditEntityFilter: string,
  auditUserFilter: string,
  { limit = AUDIT_PAGE_SIZE, page }: AccessAuditQueryOpts = {},
): string {
  const params = buildAuditFilterParams(auditEntityFilter, auditUserFilter)
  params.set('limit', String(limit))
  if (page != null) params.set('page', String(page))
  return `/audit/commands?${params.toString()}`
}