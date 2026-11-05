/** 智能管家对话的数据模型与纯函数（从 AgentChatPalette.vue 拆出，控制单文件体积） */
import type { AgentChatAttachment, AgentChatConfirmation, AgentChatResult } from '@/services/api/agent'

type ChatRole = 'user' | 'assistant'

export type ChatMessage = {
  role: ChatRole
  text: string
  tools?: string
  /** 后端执行结论（success / answer / blocked / failed / error），用于安全拦截提示 */
  outcome?: string
  /** 流式生成中：文本持续追加，不展示拦截提示 */
  streaming?: boolean
  /** 本轮总耗时（ms）与 completion token，对应源码气泡右侧的 assistant-meta */
  ms?: number
  tokens?: number
  /** 摄像头快照等附件；只存同源 URL，不含凭证 */
  attachments?: AgentChatAttachment[]
  /** 结构化确认（批量控制）；60 秒内有效，新消息发出后清空 */
  confirmation?: AgentChatConfirmation
}

/** 安全拦截提示文案：管线判定为 blocked 时明确告知用户操作被安全策略拦截 */
export const BLOCKED_NOTICE = '出于安全考虑，这个操作被拦截了。'

/** 流式结束后的兜底文案（无回复时） */
export function fallbackReplyOf(outcome: string | undefined): string {
  if (outcome === 'success') return '已执行'
  if (outcome === 'blocked') return '该指令未被执行。'
  return '无回复'
}

/** 把工具轨迹合并进气泡（保持首次调用顺序，去重） */
export function mergeToolTrace(bubble: ChatMessage, toolNames: string[]) {
  if (!toolNames.length) return
  bubble.tools = toolNames.join(' → ')
}

/**
 * 把本轮最终结果写进流式气泡：结论 / 工具轨迹 / 耗时与 token。
 *
 * @returns 用于语音播报的正文（最终回复优先于增量文本，后端可能给出未流式下发的收尾文案）
 */
export function applyResult(bubble: ChatMessage, result: AgentChatResult | null): string {
  bubble.outcome = result?.outcome
  if (result?.toolCalls?.length) {
    mergeToolTrace(
      bubble,
      result.toolCalls.map((toolCall) => toolCall.name),
    )
  }
  bubble.text = result?.reply || bubble.text || fallbackReplyOf(result?.outcome)
  // 附件与确认信息只跟随最终结果：流式 token 里没有它们，且确认按钮 60 秒就过期
  bubble.attachments = result?.attachments
  bubble.confirmation = result?.confirmation
  // 气泡旁边的 ms / token 角标：与源码 assistant-meta 同口径，只在本轮有数据时展示。
  // 用 `| 0` 取整兜底（NaN → 0），避免再引入逻辑运算符把 send 的圈复杂度顶过棘轮。
  bubble.ms = Number(result?.timing?.totalMs) | 0
  bubble.tokens = Number(result?.usage?.completionTokens) | 0
  return bubble.text
}

/** 组装发给后端的历史：有正文、非流式，限最近 16 条 */
export function buildSentHistory(messages: ReadonlyArray<ChatMessage>) {
  return messages
    .filter((message) => message.text.trim() && !message.streaming)
    .map((message) => ({ role: message.role, content: message.text }))
    .slice(-16)
}

/** 新指令发出：旧确认按钮立刻失效（后端待确认计划一次性，且 60 秒过期） */
export function expireConfirmations(messages: ChatMessage[]): void {
  for (const item of messages) {
    if (item.confirmation) item.confirmation = undefined
  }
}
