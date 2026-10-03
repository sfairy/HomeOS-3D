/**
 * 联动器 HA 同步问题工具
 *
 * 职责：
 * - 提供设置概览 / 漂移修复 / Builder 告警所需的同步问题查询与汇总。
 * - 聚合联动器与 HA 的同步状态、漂移项、占位项，输出同步问题摘要。
 *
 * 依赖：
 * - @/services/api/index 的 apiGet。
 * - ./sync-status-cache.util 的批量同步状态查询。
 * - 相关联动器类型（CrudListNormalized / OrchestratorSavedItem / OrchestratorSyncIssue 等）。
 *
 * 注意：
 * - 同步状态 key 为配置 key，不翻译。
 * - 仅面向用户的问题 / 汇总文案使用简体中文。
 */
/** 联动器 HA 同步工具（设置概览 / 漂移修复 / Builder 告警） */

import { apiGet } from '@/services/api/index'
import { fetchOrchestratorBulkSyncStatuses } from './sync-status-cache.util'
import type {
  CrudListNormalized,
  OrchestratorSavedItem,
  OrchestratorSyncIssue,
  OrchestratorSyncIssueSummary,
  OrchestratorSyncStatusEntry,
  SyncIssueType,
} from '@/types/orchestrator-builder'

/** ORCHESTRATOR_DOMAINS：对象常量，字段 / 方法语义见定义处。 */
export const ORCHESTRATOR_DOMAINS = {
  automation: { apiPrefix: 'automation', listPath: '/automation', label: '自动化' },
  scene: { apiPrefix: 'scene', listPath: '/scene', label: '场景' },
  script: { apiPrefix: 'script', listPath: '/script', label: '脚本' },
  template: { apiPrefix: 'template-entity', listPath: '/template-entity', label: '模板实体' },
}
/** 联动器 domain 配置（动态键索引用） */
interface OrchestratorDomainConfig {
  apiPrefix: string
  listPath: string
  label: string
}

/** 漂移修复向导使用的 domain 键（template 对应 template-entity API） */
const ORCHESTRATOR_WIZARD_DOMAINS = Object.keys(ORCHESTRATOR_DOMAINS)

/** ORCHESTRATOR_DOMAIN_LABELS：常量，取值语义见定义处。 */
export const ORCHESTRATOR_DOMAIN_LABELS = Object.fromEntries(
  Object.entries(ORCHESTRATOR_DOMAINS).map(([key, cfg]) => [key, cfg.label]),
)

/** hasHaLink：函数，按签名入参返回处理结果。 */
export function hasHaLink(item: unknown) {
  if (!item || typeof item !== 'object') return false
  const row = item as Record<string, unknown>
  return !!(row.haConfigId || row.ha_config_id || row.haSyncedAt || row.ha_synced_at)
}

/** 统一解析 CRUD 列表响应（数组或 { items, total } 分页） */
export function normalizeCrudListResponse(data: unknown): CrudListNormalized {
  if (Array.isArray(data)) {
    return { rows: data as Array<Record<string, unknown>>, total: data.length }
  }
  if (data && typeof data === 'object' && Array.isArray((data as { items?: unknown }).items)) {
    const obj = data as { items: Array<Record<string, unknown>>; total?: number }
    return { rows: obj.items, total: obj.total ?? obj.items.length }
  }
  return { rows: [], total: 0 }
}

/** 拉取四域联动器列表（含未关联 HA 的条目） */
export async function fetchOrchestratorDomainLists() {
  const results = await Promise.all(
    ORCHESTRATOR_WIZARD_DOMAINS.map(async (domain: string) => {
      try {
        const cfg = (ORCHESTRATOR_DOMAINS as Record<string, OrchestratorDomainConfig>)[domain]
        const res = await apiGet(cfg.listPath)
        return { domain, ok: true as const, res }
      } catch (error) {
        return { domain, ok: false as const, error }
      }
    }),
  )
  const lists = results.map(({ domain, ok, res }) => {
    if (!ok) return { domain, rows: [], total: 0, fetchError: true }
    const { rows, total } = normalizeCrudListResponse(res.data)
    return { domain, rows, total, fetchError: false }
  })
  const failedDomains = lists
    .filter((entry) => entry.fetchError)
    .map((entry) => entry.domain)
  return { lists, failedDomains }
}

function buildOrchestratorDriftStatusChecks(lists: Array<{ domain: string; rows: unknown[] }>) {
  const checks = []
  for (const { domain, rows } of lists) {
    const { apiPrefix } = (ORCHESTRATOR_DOMAINS as Record<string, OrchestratorDomainConfig>)[domain]
    const linked = rows.filter(hasHaLink) as Array<{ id: string; name?: string }>
    if (!linked.length) continue
    checks.push(
      fetchOrchestratorBulkSyncStatuses(
        apiPrefix,
        linked.map((row: { id: string }) => row.id),
      ).then((statusMap) =>
        linked.map((row: { id: string; name?: string }) => ({
          domain,
          row,
          data: (statusMap as Record<string, unknown>)[row.id] || {},
        })),
      ),
    )
  }
  return checks
}

/** 扫描已关联 HA 条目的漂移项 */
export async function collectOrchestratorDriftItems(
  lists: Array<{ domain: string; rows: unknown[] }>,
) {
  const grouped = await Promise.all(buildOrchestratorDriftStatusChecks(lists))
  const results = grouped.flat()
  return results
    .filter((r) => (r.data as { drift?: boolean })?.drift)
    .map((r) => ({
      domain: r.domain as keyof typeof ORCHESTRATOR_DOMAINS,
      id: r.row.id,
      name: r.row.name,
      status: r.data as Record<string, unknown>,
    }))
}

/** 统计已关联 HA 条目的漂移数量 */
export async function countOrchestratorDrift(lists: Array<{ domain: string; rows: unknown[] }>) {
  const grouped = await Promise.all(buildOrchestratorDriftStatusChecks(lists))
  const results = grouped.flat()
  return results.filter((r) => (r.data as { drift?: boolean })?.drift).length
}

const ISSUE_TYPE_LABELS: Record<string, string> = {
  drift: '配置漂移',
  missing: 'HA 侧缺失',
  pending: '待推送',
  blocked: '执行阻塞',
}

function issueTypeLabel(type: SyncIssueType | string) {
  return ISSUE_TYPE_LABELS[type] ?? type
}

/** summarizeOrchestratorSyncIssues：函数，按签名入参返回处理结果。 */
export function summarizeOrchestratorSyncIssues(
  items: OrchestratorSavedItem[] | null | undefined,
  syncStatusMap: Record<string, OrchestratorSyncStatusEntry> = {},
): OrchestratorSyncIssueSummary {
  const issues: OrchestratorSyncIssue[] = []
  for (const item of items || []) {
    const id = item?.id
    if (!id) continue
    const name = String(item.name || item.entity_id || id)
    const status = syncStatusMap[id]

    if (item.blockedReason) {
      issues.push({
        id,
        name,
        type: 'blocked',
        label: issueTypeLabel('blocked'),
        message: String(item.blockedReason),
      })
    }

    if (status?.unknown) {
      issues.push({
        id,
        name,
        type: 'pending',
        label: '同步未知',
        message: '未能读取 HA 同步状态，请稍后重试',
      })
      continue
    }

    if (status?.lastSyncError) {
      issues.push({
        id,
        name,
        type: 'pending',
        label: '同步失败',
        message: String(status.lastSyncError),
      })
    }

    if (status?.drift) {
      issues.push({
        id,
        name,
        type: 'drift',
        label: issueTypeLabel('drift'),
        message: status.lastSyncError
          ? String(status.lastSyncError)
          : '本地 YAML 与 HA configuration 不一致',
      })
      continue
    }

    const haLinked = !!(item.haConfigId || item.ha_config_id)
    if (haLinked && status && status.synced === false) {
      issues.push({
        id,
        name,
        type: 'missing',
        label: issueTypeLabel('missing'),
        message: 'HA 中未找到关联配置，推送或重新导入',
      })
      continue
    }

    if (haLinked && !item.haSyncedAt && !item.ha_synced_at && status?.synced !== true) {
      issues.push({
        id,
        name,
        type: 'pending',
        label: issueTypeLabel('pending'),
        message: '尚未成功推送到 HA',
      })
    }
  }

  const byType: Record<string, OrchestratorSyncIssue[]> = {
    drift: issues.filter((i) => i.type === 'drift'),
    missing: issues.filter((i) => i.type === 'missing'),
    pending: issues.filter((i) => i.type === 'pending'),
    blocked: issues.filter((i) => i.type === 'blocked'),
  }

  return {
    issues,
    byType,
    driftCount: byType.drift.length,
    missingCount: byType.missing.length,
    pendingCount: byType.pending.length,
    blockedCount: byType.blocked.length,
    hasIssues: issues.length > 0,
  }
}

/** formatSyncIssueSummary：函数，按签名入参返回处理结果。 */
export function formatSyncIssueSummary(summary: OrchestratorSyncIssueSummary | null | undefined) {
  if (!summary?.hasIssues) return ''
  const parts = []
  if (summary.driftCount) parts.push(`${summary.driftCount} 条漂移`)
  if (summary.missingCount) parts.push(`${summary.missingCount} 条 HA 缺失`)
  if (summary.pendingCount) parts.push(`${summary.pendingCount} 条待推送`)
  if (summary.blockedCount) parts.push(`${summary.blockedCount} 条阻塞`)
  return parts.join(' · ')
}
