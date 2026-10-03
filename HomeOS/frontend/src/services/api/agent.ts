/**
 * 智能代理与消息通道 REST API 封装
 *
 * 所属模块：前端服务层（services/api/）
 * 职责：封装 AI 代理心跳、对话、消息通道状态查询等接口。
 * 依赖：../api-client 提供的 apiGet / apiPost。
 * 端点范围：/agent/ping、/agent/chat、/channels/status。
 */
import { apiGet, apiPost } from '../api-client'

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

/**
 * 探测代理服务心跳。
 * 对应后端 endpoint：GET /agent/ping
 * @returns 代理可用性与就绪状态
 */
export async function agentPing() {
  const res = await apiGet<AgentPingResult>('/agent/ping')
  return res.data
}

/**
 * 发送对话消息给 AI 代理。
 * 对应后端 endpoint：POST /agent/chat
 * @param message 用户输入文本
 * @param history 历史对话记录，用于多轮上下文
 * @param sessionId 连续对话会话 id：同一会话的多轮指令共享后端上下文（免重复唤醒时由前端生成）
 * @returns 代理回复及执行元数据
 */
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

/**
 * 查询消息通道状态。
 * 对应后端 endpoint：GET /channels/status
 * @returns 各通道连接与配置状态
 */
export async function channelsStatus() {
  const res = await apiGet<ChannelsStatusResult>('/channels/status')
  return res.data
}
