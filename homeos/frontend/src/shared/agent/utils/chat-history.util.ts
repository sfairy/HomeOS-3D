/**
 * 智能管家对话的本地会话历史（sessionStorage）。
 *
 * 为什么用 sessionStorage：历史含对话正文，限本标签页生命周期，关闭标签页即清除，
 * 避免共享设备上长期留明文记录。
 *
 * 为什么还要单独存「当前会话指针」：面板关闭时 `v-if` 会把对话组件卸载，重新挂载时
 * 如果只按「历史里最新的一条」兜底，刚被删掉的对话就会又被恢复回来。指针记住用户
 * 真正在聊的那一条：删除后指针指向一个不在历史里的新 id，重新挂载就是空白会话。
 */

/** 一条回放用的附件（只用 URL，不落任何凭证） */
export type AgentChatStoredAttachment = {
  kind: 'image'
  url: string
  entityId?: string
  name?: string
}

/** 可序列化的一条消息：只保留历史回放需要的字段 */
export type AgentChatStoredMessage = {
  role: 'user' | 'assistant'
  text: string
  tools?: string
  outcome?: string
  /** 摄像头快照等附件：URL 为同源地址、不含 token，可以安全写入 sessionStorage */
  attachments?: AgentChatStoredAttachment[]
}

/** 本地历史会话（最多保留最近 8 段） */
export type AgentChatSession = {
  id: string
  updatedAt: number
  title: string
  messages: AgentChatStoredMessage[]
}

/** 历史里最多保留几段会话 */
export const AGENT_CHAT_HISTORY_LIMIT = 8
/** 单段会话最多回放多少条消息 */
export const AGENT_CHAT_HISTORY_MESSAGE_LIMIT = 40

const HISTORY_KEY = 'homeos.agent.chat.history.v1'
const CURRENT_KEY = 'homeos.agent.chat.current.v1'

/** 生成一个新的会话 id（时间戳 + 随机后缀，避免同毫秒内重复） */
export function newAgentChatSessionId(): string {
  return `ui-agent-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

function safeStorage(): Storage | null {
  if (typeof window === 'undefined') return null
  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

/** 读当前会话指针；读不到返回空串 */
export function readAgentChatCurrentId(): string {
  try {
    return String(safeStorage()?.getItem(CURRENT_KEY) || '').trim()
  } catch {
    return ''
  }
}

/** 写当前会话指针（隐私模式 / 配额用尽时静默放弃，只留内存） */
export function writeAgentChatCurrentId(id: string): void {
  try {
    safeStorage()?.setItem(CURRENT_KEY, id)
  } catch {
    // 隐私模式 / 配额用尽：指针只保留在内存
  }
}

/** 可选的字符串字段：空值统一收敛成 undefined，避免脏数据写回历史 */
function optionalText(value: unknown): string | undefined {
  return value ? String(value) : undefined
}

/** 单条附件：只认有 URL 的图片，其余字段做字符串兜底 */
function normalizeAttachment(item: Partial<AgentChatStoredAttachment> | null): AgentChatStoredAttachment | null {
  const url = typeof item?.url === 'string' ? item.url : ''
  if (!url) return null
  return {
    kind: 'image',
    url,
    entityId: optionalText(item?.entityId),
    name: optionalText(item?.name),
  }
}

/** 附件只保留可安全回放的图片 URL；脏条目逐条丢弃 */
function normalizeAttachments(raw: unknown): AgentChatStoredAttachment[] {
  if (!Array.isArray(raw)) return []
  return (raw as Array<Partial<AgentChatStoredAttachment> | null>)
    .map(normalizeAttachment)
    .filter((item): item is AgentChatStoredAttachment => item !== null)
}

function normalizeMessage(raw: unknown): AgentChatStoredMessage | null {
  if (!raw || typeof raw !== 'object') return null
  const message = raw as Partial<AgentChatStoredMessage>
  if (message.role !== 'user' && message.role !== 'assistant') return null
  const text = String(message.text || '')
  const attachments = normalizeAttachments(message.attachments)
  if (!text.trim() && !attachments.length) return null
  return {
    role: message.role,
    text,
    tools: optionalText(message.tools),
    outcome: optionalText(message.outcome),
    attachments: attachments.length ? attachments : undefined,
  }
}

/** 会话标题：优先已存的标题，其次首条用户消息前 24 字，最后兜底「对话」。 */
function resolveSessionTitle(title: string, messages: AgentChatStoredMessage[]): string {
  if (title) return title
  const firstUser = messages.find((message) => message.role === 'user')
  return firstUser?.text.slice(0, 24) || '对话'
}

function normalizeSession(raw: unknown): AgentChatSession | null {
  if (!raw || typeof raw !== 'object') return null
  const session = raw as Partial<AgentChatSession>
  const id = String(session.id || '').trim()
  const messages = Array.isArray(session.messages)
    ? session.messages.map(normalizeMessage).filter((item): item is AgentChatStoredMessage => item !== null)
    : []
  if (!id || !messages.length) return null
  const title = String(session.title || '').trim()
  return {
    id,
    title: resolveSessionTitle(title, messages),
    updatedAt: Number(session.updatedAt) || Date.now(),
    messages,
  }
}

/** 读历史会话：脏数据逐条丢弃，按更新时间倒序，最多 HISTORY_LIMIT 段 */
export function readAgentChatSessions(): AgentChatSession[] {
  try {
    const raw = safeStorage()?.getItem(HISTORY_KEY)
    const parsed = raw ? JSON.parse(raw) : null
    if (!Array.isArray(parsed)) return []
    return parsed
      .map(normalizeSession)
      .filter((item): item is AgentChatSession => item !== null)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, AGENT_CHAT_HISTORY_LIMIT)
  } catch {
    return []
  }
}

/** 写历史会话（隐私模式 / 配额用尽时静默放弃，历史只留内存） */
export function writeAgentChatSessions(sessions: AgentChatSession[]): void {
  try {
    safeStorage()?.setItem(HISTORY_KEY, JSON.stringify(sessions.slice(0, AGENT_CHAT_HISTORY_LIMIT)))
  } catch {
    // 隐私模式 / 配额用尽：历史只保留在内存
  }
}

/**
 * 把当前消息快照成一条可持久化的会话。
 *
 * @returns 没有可保存内容（全空 / 只有流式中气泡）时返回 null
 */
export function buildAgentChatSession(
  id: string,
  messages: ReadonlyArray<AgentChatStoredMessage & { streaming?: boolean }>,
): AgentChatSession | null {
  const snapshot = messages
    .filter(
      (message) => !message.streaming && (String(message.text || '').trim() || (message.attachments?.length ?? 0) > 0),
    )
    .slice(-AGENT_CHAT_HISTORY_MESSAGE_LIMIT)
    .map((message) => ({
      role: message.role,
      text: message.text,
      tools: message.tools,
      outcome: message.outcome,
      attachments: message.attachments,
    }))
  if (!snapshot.length) return null
  return {
    id,
    updatedAt: Date.now(),
    title: snapshot.find((message) => message.role === 'user')?.text.slice(0, 24) || '对话',
    messages: snapshot,
  }
}
