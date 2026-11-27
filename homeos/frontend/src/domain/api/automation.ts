/** 自动化草案 API（默认只预览；用户显式确认后可由 apply 落成本机计划任务）。 */
import type { AxiosRequestConfig } from 'axios'
import { apiDelete, apiGet, apiPost } from '../../kernel/http'

export interface AutomationDraftTarget {
  entityId?: string
  name?: string
  area?: string
  risk?: 'HIGH' | 'LOW' | string
  resolved?: boolean
}

export interface AutomationDraftConflict {
  kind?: string
  entityId?: string
  name?: string
  existingId?: string
  existingSource?: string
  existingName?: string
  existingAction?: string[]
  proposedAction?: string
  reason?: string
  source?: string
  count?: number
  refs?: string[]
}

export interface AutomationDraftTriggerSpec {
  type?: string
  at?: string
  cron?: string
  days?: string
  entityId?: string
  from?: string
  to?: string
  description?: string
  triggers?: Array<Record<string, unknown>>
  conditions?: Array<Record<string, unknown> | string>
  forDuration?: string
  mode?: string
  timezone?: string
  [key: string]: unknown
}

export interface AutomationDraftPreview {
  targetBackend?: string
  targetEntities?: AutomationDraftTarget[]
  intentSummary?: string
  triggerAndConditionSpec?: AutomationDraftTriggerSpec
  configDiff?: { before?: unknown; after?: unknown; humanDiff?: string[] }
  runtimeAndRestartImpact?: string[]
  conflictAndBlindspotReport?: {
    certain?: AutomationDraftConflict[]
    possible?: AutomationDraftConflict[]
    unknown?: AutomationDraftConflict[]
  }
  unresolvedTargets?: AutomationDraftTarget[]
  landing?: { available?: boolean; reason?: string }
  highRisk?: string[]
  phase?: number
}

export interface AutomationDraft {
  draftId: string
  status: string
  revSeq: number
  createdAt?: string
  expiresAt?: string
  appliedTaskId?: string | null
  spec?: Record<string, unknown>
  preview?: AutomationDraftPreview
  rawPrompt?: string
}

export function listAutomationDrafts(sessionKey?: string, config?: AxiosRequestConfig) {
  return apiGet<{ items: AutomationDraft[] }>('/automation/drafts', {
    params: { sessionKey, limit: 50 },
    ...config,
  })
}

export function getAutomationDraft(draftId: string, config?: AxiosRequestConfig) {
  return apiGet<AutomationDraft>(`/automation/drafts/${draftId}`, config)
}

export function deleteAutomationDraft(draftId: string, config?: AxiosRequestConfig) {
  return apiDelete<{ success: boolean; status?: string }>(`/automation/drafts/${draftId}`, config)
}

export interface AutomationDraftApplyResult {
  success: boolean
  draftId: string
  taskId?: string
  task?: { id?: string; name?: string; nextRunAt?: string | null } & Record<string, unknown>
}

/** 把多目标草案拆成每个目标一条单目标草案（原草案会被替代）。 */
export function splitAutomationDraft(draftId: string, config?: AxiosRequestConfig) {
  return apiPost<{
    success: boolean
    supersededId: string
    items: Array<{ draftId: string; status: string; target: string }>
  }>(`/automation/drafts/${draftId}/split`, undefined, config)
}

/** 改写草案的目标设备（新增 / 移除）；返回更新后的草案。 */
export function setAutomationDraftTargets(draftId: string, entityIds: string[], config?: AxiosRequestConfig) {
  return apiPost<AutomationDraft>(`/automation/drafts/${draftId}/targets`, { entityIds }, config)
}

/** 把待确认草案落成一条本机计划任务（用户显式确认后才会发生）。 */
export function applyAutomationDraft(draftId: string, acknowledgeConflicts = false, config?: AxiosRequestConfig) {
  return apiPost<AutomationDraftApplyResult>(`/automation/drafts/${draftId}/apply`, { acknowledgeConflicts }, config)
}

/**
 * 把草案写成一条 **HA 自动化**（写进 HA 自己的 automation 配置）。
 *
 * 与 `applyAutomationDraft` 的区别：那边生成 HomeOS 本机计划任务，这边由 HA 执行，
 * 自动化列表里可见、换机后仍留在 HA；`automationId` 由 draft 派生，重复导出是覆盖。
 */
export function exportAutomationDraftToHa(draftId: string, acknowledgeConflicts = false, config?: AxiosRequestConfig) {
  return apiPost<{
    success: boolean
    draftId: string
    automationId: string
    automation: Record<string, unknown>
    reloaded: boolean
  }>(`/automation/drafts/${draftId}/export-ha`, { acknowledgeConflicts }, config)
}

export function discoverAutomations(sources?: string[], config?: AxiosRequestConfig) {
  return apiGet<{ success: boolean; rules: Array<Record<string, unknown>> }>('/automation/discover', {
    params: sources?.length ? { sources: sources.join(',') } : undefined,
    ...config,
  })
}
