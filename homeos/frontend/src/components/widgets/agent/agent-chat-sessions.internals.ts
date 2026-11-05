/** 智能管家对话的本地会话管理（历史归档 / 切换 / 新建 / 删除） */
import type { Ref } from 'vue'
import {
  AGENT_CHAT_HISTORY_LIMIT,
  buildAgentChatSession,
  newAgentChatSessionId,
  writeAgentChatCurrentId,
  writeAgentChatSessions,
  type AgentChatSession,
} from '@/shared/agent/utils/chat-history.util'
import type { ChatMessage } from './agent-chat-model.internals'

/** 会话管理依赖：都是面板自己的 ref 与副作用，集中注入便于测试与复用 */
export type AgentChatSessionDeps = {
  sessionId: Ref<string>
  messages: Ref<ChatMessage[]>
  sessions: Ref<AgentChatSession[]>
  input: Ref<string>
  historyOpen: Ref<boolean>
  busy: Ref<boolean>
  stopListen: () => void
  stopGenerating: () => void
  scrollToBottom: () => void
}

export function useAgentChatSessions(deps: AgentChatSessionDeps) {
  const { sessionId, messages, sessions, input, historyOpen, busy } = deps

  /** 把当前对话写进历史并更新指针（关面板 / 新对话 / 切会话前调用） */
  function persistCurrent() {
    const current = buildAgentChatSession(sessionId.value, messages.value)
    if (!current) return
    sessions.value = [current, ...sessions.value.filter((item) => item.id !== current.id)].slice(
      0,
      AGENT_CHAT_HISTORY_LIMIT,
    )
    writeAgentChatSessions(sessions.value)
    writeAgentChatCurrentId(current.id)
  }

  /** 历史会话时间：今天只显示时分，更早显示月日 */
  function sessionTimeLabel(updatedAt: number): string {
    const date = new Date(updatedAt)
    const now = new Date()
    const sameDay =
      date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate()
    if (sameDay) {
      return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
    }
    return `${date.getMonth() + 1}/${date.getDate()}`
  }

  function openSession(session: AgentChatSession) {
    if (busy.value) return
    deps.stopListen()
    // 切走前先把当前这段存好，否则从历史里跳来跳去会丢掉未归档的对话
    persistCurrent()
    sessionId.value = session.id
    writeAgentChatCurrentId(session.id)
    messages.value = session.messages.map((message) => ({ ...message }))
    historyOpen.value = false
    deps.scrollToBottom()
  }

  /** 清空成一个全新会话：只动内存 + 指针，历史由调用方决定留还是删 */
  function startFreshConversation() {
    sessionId.value = newAgentChatSessionId()
    messages.value = []
    input.value = ''
    writeAgentChatCurrentId(sessionId.value)
  }

  /** 新对话：把当前对话归档进历史，再开一条空会话（历史里还能翻回来） */
  function newConversation() {
    deps.stopGenerating()
    deps.stopListen()
    persistCurrent()
    startFreshConversation()
    historyOpen.value = false
  }

  /** 删除对话：连历史一起删 —— 否则关掉面板再打开会被历史兜底恢复成「没删掉」 */
  function deleteConversation() {
    deps.stopGenerating()
    deps.stopListen()
    const removedId = sessionId.value
    sessions.value = sessions.value.filter((item) => item.id !== removedId)
    writeAgentChatSessions(sessions.value)
    startFreshConversation()
    historyOpen.value = false
  }

  return {
    persistCurrent,
    sessionTimeLabel,
    openSession,
    newConversation,
    deleteConversation,
  }
}
