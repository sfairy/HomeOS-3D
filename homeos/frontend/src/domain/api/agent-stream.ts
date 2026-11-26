/**
 * 智能代理的对话结果归一与 SSE 流式通道。
 *
 * 从 `agent.ts` 拆出：流式实现要自己解析 SSE 帧、处理 CSRF 与中止信号，和其余 REST
 * 封装的关注点不同（合在一起也会让 `agent.ts` 继续变长）。
 *
 * 依赖方向是单向的：本模块只从 `agent.ts` 取**类型**（编译后消失），`agent.ts` 从本模块
 * 取 `agentChatStream` / `normalizeResult` 两个值 —— 不构成值循环。
 */
import { withCsrf } from '../../kernel/http/csrf'
import type {
  AgentChatAttachment,
  AgentChatConfirmation,
  AgentChatResult,
  AgentOutcome,
  AgentToolCallTrace,
} from './agent'

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

/** 服务端返回的 ``ttsUrl``：空串 / 非字符串一律当「没有」 */
function pickTtsUrl(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined
}

/** 计时字段归一：缺字段 / 非数字一律按 0，避免气泡角标出现 NaN */
function normalizeTiming(raw: unknown): AgentChatResult['timing'] {
  const data = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  return {
    llmMs: Number(data.llmMs) || 0,
    toolMs: Number(data.toolMs) || 0,
    totalMs: Number(data.totalMs) || 0,
  }
}

/** 用量字段归一：缺字段 / 非数字一律按 0 */
function normalizeUsage(raw: unknown): AgentChatResult['usage'] {
  const data = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  return {
    promptTokens: Number(data.promptTokens) || 0,
    completionTokens: Number(data.completionTokens) || 0,
    cachedTokens: Number(data.cachedTokens) || 0,
    estimatedCostCNY: Number(data.estimatedCostCNY) || 0,
  }
}

/** 附件归一：只接受 image + 同源相对路径 / http(s)，丢掉畸形项 */
function normalizeAttachments(raw: unknown): AgentChatAttachment[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const items: AgentChatAttachment[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const data = item as Record<string, unknown>
    const url = typeof data.url === 'string' ? data.url : ''
    if (!url) continue
    items.push({
      kind: 'image',
      url,
      entityId: typeof data.entityId === 'string' ? data.entityId : undefined,
      name: typeof data.name === 'string' ? data.name : undefined,
    })
  }
  return items.length ? items : undefined
}

/** 确认信息归一：字段缺一即视为没有（宁可只显示文本，也不渲染坏按钮） */
function normalizeConfirmation(raw: unknown): AgentChatConfirmation | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const data = raw as Record<string, unknown>
  const confirmText = typeof data.confirmText === 'string' ? data.confirmText : ''
  const cancelText = typeof data.cancelText === 'string' ? data.cancelText : ''
  if (!confirmText || !cancelText) return undefined
  return {
    kind: typeof data.kind === 'string' ? data.kind : 'batch',
    summary: typeof data.summary === 'string' ? data.summary : '',
    confirmText,
    cancelText,
    expiresInSeconds: typeof data.expiresInSeconds === 'number' ? data.expiresInSeconds : undefined,
  }
}

export function normalizeResult(raw: unknown): AgentChatResult {
  if (!raw || typeof raw !== 'object') return emptyResult()
  const data = raw as Record<string, unknown>
  return emptyResult({
    reply: typeof data.reply === 'string' ? data.reply : '',
    speak: data.speak === true,
    ttsUrl: pickTtsUrl(data.ttsUrl),
    outcome: (['answer', 'success', 'failed', 'blocked'] as const).includes(data.outcome as AgentOutcome)
      ? (data.outcome as AgentOutcome)
      : 'answer',
    earcon: data.earcon === 'success' || data.earcon === 'error' || data.earcon === 'confirm' ? data.earcon : null,
    provider: typeof data.provider === 'string' ? data.provider : '',
    model: typeof data.model === 'string' ? data.model : undefined,
    rounds: typeof data.rounds === 'number' ? data.rounds : 0,
    toolCalls: Array.isArray(data.toolCalls)
      ? (data.toolCalls as AgentToolCallTrace[]).filter(
          (item) => item && typeof item === 'object' && typeof item.name === 'string',
        )
      : [],
    attachments: normalizeAttachments(data.attachments),
    confirmation: normalizeConfirmation(data.confirmation),
    timing: normalizeTiming(data.timing),
    usage: normalizeUsage(data.usage),
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
                item.arguments && typeof item.arguments === 'object' ? (item.arguments as Record<string, unknown>) : {},
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
          throw new Error(typeof messageText === 'string' && messageText.trim() ? messageText.trim() : '管家暂时不可用')
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
      const messageText = error instanceof Error && error.message ? error.message : '管家暂时不可用'
      callbacks.onError?.(messageText)
      throw error
    }
  })()

  return handle
}
