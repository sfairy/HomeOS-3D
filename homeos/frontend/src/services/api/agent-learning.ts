/** 智能管家「学习与观测」REST 封装：已学配置、习惯候选、意图门影子回放。
 *
 * 从 `agent.ts` 拆出：那个文件已经承担对话 / 流式 / 会话 / 家规 / 计划任务，接近文件规模
 * 上限；这一族是设置页「学习」区块自己的读写口，独立成模块后 `agent.ts` 继续做聚合出口
 * （与 `agent-memory.ts` 同一做法，调用方 import 路径不变）。
 */
import { apiDelete, apiGet, apiPost } from './client'

/** 已学习的配置（别名 / 房间默认）；`isActive=false` 表示暂停参与解析。 */
export interface AgentLearningConfig {
  id: string
  scope: string
  kind: string
  key: string
  entityId: string
  value: unknown
  isActive: boolean
  revision: number
  updatedAt: string | null
}

/** 习惯候选（基于重复操作序列）。 */
export interface AgentHabitCandidate {
  id: string
  scope: string
  candidateType: string
  contextKey: string
  entityId: string
  evidenceCount: number
  status: string
  lastPromptAt: string | null
  lastSeenAt: string | null
}

/** 意图门影子回放统计。 */
export interface AgentIntentReplay {
  total: number
  verdicts: Record<string, number>
  reasons: Record<string, number>
  blockedSamples: Array<{ utterance?: string; verdict?: string; reason?: string; mode?: string }>
}

/** 列出已学习配置。 */
export async function listAgentLearning(scope = '') {
  const response = await apiGet<{ items: AgentLearningConfig[] }>('/agent/learning', { params: { scope } })
  return response.data?.items ?? []
}

/** 回滚一条学习配置（revision 用于防止覆盖后续修改）。 */
export async function revertAgentLearning(configId: string, revision?: number) {
  const response = await apiPost<Record<string, unknown>>('/agent/learning/revert', {
    configId,
    ...(typeof revision === 'number' ? { revision } : {}),
  })
  return response.data
}

/** 暂停 / 恢复一条学习配置。 */
export async function setAgentLearningActive(configId: string, active: boolean) {
  const response = await apiPost<Record<string, unknown>>('/agent/learning/active', { configId, active })
  return response.data
}

/** 删除一条学习配置。 */
export async function deleteAgentLearning(configId: string) {
  const response = await apiDelete<Record<string, unknown>>(`/agent/learning/${encodeURIComponent(configId)}`)
  return response.data
}

/** 列出习惯候选（可按状态过滤）。 */
export async function listAgentHabits(status = '') {
  const response = await apiGet<{ items: AgentHabitCandidate[] }>('/agent/habits', { params: { status } })
  return response.data?.items ?? []
}

/** 处理习惯候选：dismiss / accept / reset。 */
export async function actOnAgentHabit(candidateId: string, action: 'dismiss' | 'accept' | 'reset') {
  const response = await apiPost<Record<string, unknown>>(`/agent/habits/${encodeURIComponent(candidateId)}/${action}`)
  return response.data
}

/** 意图门影子回放：切 enforce 前确认没有正常口令被误判为规则。 */
export async function getAgentIntentReplay(limit = 100) {
  const response = await apiGet<AgentIntentReplay>('/agent/intent/replay', { params: { limit } })
  return response.data
}

/** 命令缓存运行指标（命中率 / LLM 调用 / 纠正次数）。 */
export interface AgentCommandMetrics {
  totalRequests: number
  fastPathHits: number
  cacheHits: number
  llmCalls: number
  success: number
  failed: number
  partial: number
  corrections: number
  correctionsAfterSuccess: number
  correctionsAfterFailure: number
}

/** 已学会的「原话 → 工具」映射。 */
export interface AgentCommandCacheEntry {
  key: string
  toolName: string
  toolArgs: Record<string, unknown>
  hitCount: number
  confirmed: boolean
}

/** 读取命令缓存指标。 */
export async function getAgentCommandMetrics() {
  const response = await apiGet<{ metrics: AgentCommandMetrics }>('/agent/metrics')
  return response.data?.metrics ?? null
}

/** 列出当前账号已学会的指令映射。 */
export async function listAgentCommandCache(limit = 100) {
  const response = await apiGet<{ items: AgentCommandCacheEntry[] }>('/agent/command-cache', { params: { limit } })
  return response.data?.items ?? []
}

/** 删除一条学错的指令映射。 */
export async function deleteAgentCommandCache(key: string) {
  const response = await apiDelete<{ ok: boolean }>('/agent/command-cache', { params: { key } })
  return response.data?.ok === true
}
