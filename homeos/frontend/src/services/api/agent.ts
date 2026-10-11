/** 智能代理与消息通道 REST API 封装 */
import { apiGet, apiPost } from './client'

/** 代理心跳检测结果 */
export interface AgentPingResult {
  /** 后端是否可达 */
  ok: boolean
  /** 实际使用的 LLM 供应商标识 */
  provider: string
  /** 代理是否就绪可对话 */
  ready: boolean
}

/** 代理对话返回结果 */
export interface AgentChatResult {
  /** 回复正文 */
  reply: string
  /** 是否需要语音播报 */
  speak: boolean
  /** 对话结局：answer(直接回答) / success(任务成功) / failed(失败) / blocked(被拦截) */
  outcome: 'answer' | 'success' | 'failed' | 'blocked'
  /** 提示音类型：success / error / null */
  earcon: 'success' | 'error' | null
  /** 实际使用的 LLM 供应商标识 */
  provider: string
  /** 对话总轮数 */
  rounds: number
  /** 本轮工具调用明细 */
  toolCalls: Array<{
    name: string
    arguments: Record<string, unknown>
    resultPreview: string
  }>
  /** 耗时分布（毫秒） */
  timing: { llmMs: number; toolMs: number; totalMs: number }
  /** Token 用量与预估成本 */
  usage: {
    promptTokens: number
    completionTokens: number
    cachedTokens: number
    estimatedCostCNY: number
  }
}

/** 消息通道状态结果 */
export interface ChannelsStatusResult {
  email: {
    enabled: boolean
    configured: boolean
    error?: string
  }
  webpush: {
    enabled: boolean
    configured: boolean
    subscriptionCount?: number
    vapidPublicKey?: string
    error?: string
  }
  wecom?: {
    enabled: boolean
    configured: boolean
    corpId?: string
    agentId?: number
    error?: string
  }
}

/** 探测代理服务心跳。 */
export async function agentPing() {
  const res = await apiGet<AgentPingResult>('/agent/ping')
  return res.data
}

/** 发送对话消息给 AI 代理。 */
export async function agentChat(
  message: string,
  history?: Array<{ role: 'user' | 'assistant'; content: string }>,
  sessionId?: string,
) {
  const res = await apiPost<AgentChatResult>('/agent/chat', {
    message,
    ...(history?.length ? { history } : {}),
    ...(sessionId ? { sessionId } : {}),
  })
  return res.data
}

/** 查询消息通道状态。 */
export async function channelsStatus() {
  const res = await apiGet<ChannelsStatusResult>('/channels/status')
  return res.data
}
