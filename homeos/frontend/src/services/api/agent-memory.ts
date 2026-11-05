/** 智能管家长期记忆 REST API 封装（从 agent.ts 拆出，避免主文件越过行数门禁） */
import { apiDelete, apiGet, apiPost } from './client'

/** 长期记忆条目：别名（alias）或长期偏好（preference） */
export interface AgentMemoryItem {
  kind: 'alias' | 'preference'
  key: string
  value: string
}

/** 新增 / 覆盖一条长期记忆 */
export interface AgentMemoryPayload {
  kind: 'alias' | 'preference'
  /** 偏好可省略：后端按内容前 40 字生成稳定 key */
  alias?: string
  value: string
}

/** 列出当前用户的长期记忆（别名 + 偏好）。 */
export async function listAgentMemories() {
  const response = await apiGet<{ items: AgentMemoryItem[] }>('/agent/memories')
  return response.data?.items ?? []
}

/** 新增 / 覆盖一条长期记忆；返回更新后的完整列表。 */
export async function saveAgentMemory(payload: AgentMemoryPayload) {
  const response = await apiPost<{ ok: boolean; items: AgentMemoryItem[] }>('/agent/memories', payload)
  return response.data?.items ?? []
}

/** 删除一条长期记忆。 */
export async function forgetAgentMemory(kind: AgentMemoryItem['kind'], key: string) {
  const response = await apiDelete<{ ok: boolean }>(`/agent/memories/${encodeURIComponent(key)}`, {
    params: { kind },
  })
  return response.data?.ok === true
}

/** 清空当前用户的全部长期记忆。 */
export async function clearAgentMemories() {
  const response = await apiDelete<{ ok: boolean }>('/agent/memories')
  return response.data?.ok === true
}
