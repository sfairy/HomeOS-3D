/** 智能代理与消息通道 REST API 封装 */
import { apiGet, apiPost } from './client'
import { withCsrf } from './csrf'

/** 代理心跳检测结果 */
export interface AgentPingResult {
  /** 后端是否可达 */
  ok: boolean
  /** 实际使用的 LLM 供应商标识 */
  provider: string
  /** 实际使用的模型名（mock / 未配置时为空） */
  model?: string
  /** 代理是否就绪可对话 */
  ready: boolean
  /** 计费口径（元 / 百万 token），source 说明来源 */
  pricing?: {
    inputMissCNY: number
    inputHitCNY: number
    outputCNY: number
    /** provider-default / fallback-deepseek / env */
    source: string
  }
  /** 每日预算配置 */
  budget?: {
    dailyTokenBudget: number
    dailyCostBudgetCNY: number
    source: string
  } | null
  /** 当前登录用户今日用量 */
  usageToday?: {
    day: string
    promptTokens: number
    completionTokens: number
    totalTokens: number
    costCNY: number
    llmRuns: number
    dailyTokenBudget: number
    dailyCostBudgetCNY: number
    budgetSource: string
  } | null
}

/** 单次工具调用轨迹 */
export interface AgentToolCallTrace {
  name: string
  arguments: Record<string, unknown>
  resultPreview: string
}

/** 代理对话结局 */
export type AgentOutcome = 'answer' | 'success' | 'failed' | 'blocked'

/** 代理对话返回结果 */
export interface AgentChatResult {
  /** 回复正文 */
  reply: string
  /** 是否需要语音播报 */
  speak: boolean
  /** 对话结局：answer(直接回答) / success(任务成功) / failed(失败) / blocked(被拦截) */
  outcome: AgentOutcome
  /** 提示音类型：success / error / null */
  earcon: 'success' | 'error' | null
  /** 实际使用的 LLM 供应商标识 */
  provider: string
  /** 实际使用的模型名（后端可能不返回） */
  model?: string
  /** 对话总轮数 */
  rounds: number
  /** 本轮工具调用明细 */
  toolCalls: AgentToolCallTrace[]
  /** 耗时分布（毫秒） */
  timing: { llmMs: number; toolMs: number; totalMs: number }
  /** Token 用量与预估成本 */
  usage: {
    promptTokens: number
    completionTokens: number
    cachedTokens: number
    estimatedCostCNY: number
    /** 计价口径来源：provider-default / fallback-deepseek / env */
    pricingSource?: string
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

/** 流式对话回调：token 增量 / 工具轨迹 / 最终结果 / 错误 */
export interface AgentStreamCallbacks {
  onToken?: (text: string) => void
  onTool?: (call: AgentToolCallTrace) => void
  onDone?: (result: AgentChatResult) => void
  onError?: (message: string) => void
}

/** 流式对话句柄：`done` 在流结束时兑现，`abort` 可主动取消 */
export interface AgentStreamHandle {
  done: Promise<AgentChatResult | null>
  abort: () => void
}

/** 与后端 ChatDto 一致的 500 字上限之外的兜底（服务端已校验，这里只防止离谱输入） */
const STREAM_ENDPOINT = '/api/v1/agent/chat/stream'

function emptyResult(partial: Partial<AgentChatResult> = {}): AgentChatResult {
  return {
    reply: '',
    speak: false,
    outcome: 'answer',
    earcon: null,
    provider: '',
    rounds: 0,
    toolCalls: [],
    timing: { llmMs: 0, toolMs: 0, totalMs: 0 },
    usage: { promptTokens: 0, completionTokens: 0, cachedTokens: 0, estimatedCostCNY: 0 },
    ...partial,
  }
}

function normalizeResult(raw: unknown): AgentChatResult {
  if (!raw || typeof raw !== 'object') return emptyResult()
  const data = raw as Record<string, unknown>
  return emptyResult({
    reply: typeof data.reply === 'string' ? data.reply : '',
    speak: data.speak === true,
    outcome: (['answer', 'success', 'failed', 'blocked'] as const).includes(
      data.outcome as AgentOutcome,
    )
      ? (data.outcome as AgentOutcome)
      : 'answer',
    earcon: data.earcon === 'success' || data.earcon === 'error' ? data.earcon : null,
    provider: typeof data.provider === 'string' ? data.provider : '',
    model: typeof data.model === 'string' ? data.model : undefined,
    rounds: typeof data.rounds === 'number' ? data.rounds : 0,
    toolCalls: Array.isArray(data.toolCalls)
      ? (data.toolCalls as AgentToolCallTrace[]).filter(
          (item) => item && typeof item === 'object' && typeof item.name === 'string',
        )
      : [],
    timing:
      data.timing && typeof data.timing === 'object'
        ? {
            llmMs: Number((data.timing as Record<string, unknown>).llmMs) || 0,
            toolMs: Number((data.timing as Record<string, unknown>).toolMs) || 0,
            totalMs: Number((data.timing as Record<string, unknown>).totalMs) || 0,
          }
        : { llmMs: 0, toolMs: 0, totalMs: 0 },
    usage:
      data.usage && typeof data.usage === 'object'
        ? {
            promptTokens: Number((data.usage as Record<string, unknown>).promptTokens) || 0,
            completionTokens: Number((data.usage as Record<string, unknown>).completionTokens) || 0,
            cachedTokens: Number((data.usage as Record<string, unknown>).cachedTokens) || 0,
            estimatedCostCNY:
              Number((data.usage as Record<string, unknown>).estimatedCostCNY) || 0,
          }
        : { promptTokens: 0, completionTokens: 0, cachedTokens: 0, estimatedCostCNY: 0 },
  })
}

/** 构造一个可被 `getApiErrorMessage` 识别的 HTTP 风格错误（裸 fetch 无 axios 信封） */
function httpError(status: number, message: string): Error {
  const error = new Error(message) as Error & {
    response?: { status: number; data: { message: string } }
  }
  error.response = { status, data: { message } }
  return error
}

/** 解析单帧 SSE，返回 `[event, data]` */
function parseFrame(frame: string): [string, string] {
  let event = 'message'
  const dataLines: string[] = []
  for (const line of frame.split('\n')) {
    if (line.startsWith('event:')) {
      event = line.slice(6).trim() || 'message'
    } else if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trimStart())
    }
  }
  return [event, dataLines.join('\n')]
}

/** 探测代理服务心跳。 */
export async function agentPing() {
  const pingResponse = await apiGet<AgentPingResult>('/agent/ping')
  return pingResponse.data
}

/** 发送对话消息给 AI 代理。 */
export async function agentChat(
  message: string,
  history?: Array<{ role: 'user' | 'assistant'; content: string }>,
  sessionId?: string,
) {
  const chatResponse = await apiPost<AgentChatResult>('/agent/chat', {
    message,
    ...(history?.length ? { history } : {}),
    ...(sessionId ? { sessionId } : {}),
  })
  return normalizeResult(chatResponse.data)
}

/**
 * 流式发送对话消息（SSE：token / tool / done / error）。
 *
 * 使用裸 `fetch` + `ReadableStream` 而非 EventSource：EventSource 只能 GET，
 * 且无法携带对话体与自定义头。CSRF 头由 `withCsrf` 显式注入（`installFetchCsrf`
 * 只会兜底同源 `/api/**`，这里保持双保险）。
 *
 * 回调语义：
 * - `onToken`：增量文本，可直接追加展示；
 * - `onTool`：一次工具调用完成（含结果预览），用于实时轨迹；
 * - `onDone`：最终完整结果（即使流中没有 token 也会触发）；
 * - `onError`：流内 error 帧或非 2xx / 网络错误。
 */
export function agentChatStream(
  message: string,
  history: Array<{ role: 'user' | 'assistant'; content: string }> | undefined,
  sessionId: string | undefined,
  callbacks: AgentStreamCallbacks = {},
): AgentStreamHandle {
  const controller = new AbortController()
  const handle: AgentStreamHandle = {
    done: Promise.resolve(null),
    abort: () => controller.abort(),
  }

  const body = JSON.stringify({
    message,
    ...(history?.length ? { history } : {}),
    ...(sessionId ? { sessionId } : {}),
  })

  handle.done = (async () => {
    let finalResult: AgentChatResult | null = null
    let buffer = ''

    try {
      const response = await fetch(STREAM_ENDPOINT, {
        method: 'POST',
        credentials: 'same-origin',
        headers: withCsrf({ 'Content-Type': 'application/json', Accept: 'text/event-stream' }),
        body,
        signal: controller.signal,
      })

      if (!response.ok) {
        let detail = `请求失败（${response.status}）`
        try {
          const text = await response.text()
          if (text) {
            try {
              const parsed = JSON.parse(text) as { message?: unknown; detail?: unknown }
              const candidate = parsed?.message ?? parsed?.detail
              if (typeof candidate === 'string' && candidate.trim()) detail = candidate.trim()
            } catch {
              detail = text.slice(0, 200)
            }
          }
        } catch {
          // 读取错误正文失败时保留状态码兜底文案
        }
        throw httpError(response.status, detail)
      }
      if (!response.body) throw new Error('当前浏览器不支持流式响应')

      const reader = response.body.getReader()
      const decoder = new TextDecoder()

      const flushFrame = (frame: string) => {
        const trimmed = frame.trim()
        if (!trimmed) return
        const [event, data] = parseFrame(trimmed)
        if (!data) return
        let payload: unknown
        try {
          payload = JSON.parse(data)
        } catch {
          // 非 JSON 帧（心跳注释等）直接忽略
          return
        }
        if (event === 'token') {
          const text = (payload as { text?: unknown })?.text
          if (typeof text === 'string' && text) callbacks.onToken?.(text)
          return
        }
        if (event === 'tool') {
          const item = payload as Record<string, unknown>
          if (typeof item.name === 'string') {
            callbacks.onTool?.({
              name: item.name,
              arguments:
                item.arguments && typeof item.arguments === 'object'
                  ? (item.arguments as Record<string, unknown>)
                  : {},
              resultPreview: typeof item.resultPreview === 'string' ? item.resultPreview : '',
            })
          }
          return
        }
        if (event === 'done') {
          finalResult = normalizeResult(payload)
          callbacks.onDone?.(finalResult)
          return
        }
        if (event === 'error') {
          const messageText = (payload as { message?: unknown })?.message
          throw new Error(
            typeof messageText === 'string' && messageText.trim()
              ? messageText.trim()
              : '管家暂时不可用',
          )
        }
      }

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        // SSE 帧以空行分隔；兼容 \r\n
        let index = buffer.search(/\r?\n\r?\n/)
        while (index >= 0) {
          const frame = buffer.slice(0, index)
          buffer = buffer.slice(index).replace(/^\r?\n\r?\n/, '')
          flushFrame(frame)
          index = buffer.search(/\r?\n\r?\n/)
        }
      }
      buffer += decoder.decode()
      if (buffer.trim()) flushFrame(buffer)

      return finalResult
    } catch (error) {
      // 主动取消不算错误，直接返回已拿到的结果
      if (controller.signal.aborted) return finalResult
      const messageText =
        error instanceof Error && error.message ? error.message : '管家暂时不可用'
      callbacks.onError?.(messageText)
      throw error
    }
  })()

  return handle
}

/** 查询消息通道状态。 */
export async function channelsStatus() {
  const channelsResponse = await apiGet<ChannelsStatusResult>('/channels/status')
  return channelsResponse.data
}
