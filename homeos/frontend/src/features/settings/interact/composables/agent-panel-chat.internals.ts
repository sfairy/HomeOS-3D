/**
 * @file agent-panel-chat.internals.ts
 * @module frontend/src/features/settings/interact/composables
 */
/** 智能管家设置面板：对话 / 语音输入 */
import { computed, nextTick, ref, watch, type Ref, type ComponentPublicInstance } from 'vue'
import { useAgentSpeech } from '@/composables/voice/useAgentSpeech'
import { useSpeechToText } from '@/composables/voice/useSpeechToText'
import { clipAgentChatMessage, AGENT_CHAT_MAX_LENGTH } from '@/shared/agent/utils/chat-limit.util'
import {
  agentChatStream,
  type AgentChatAttachment,
  type AgentChatConfirmation,
  type AgentStreamHandle,
} from '@/services/api/agent'
import { getApiErrorMessage } from '@/shared/utils/core/error-message'
import {
  chatOutcomeLabel,
  chatOutcomeTone,
} from '@/features/settings/interact/composables/agent-panel-helpers.internals'
import type { AgentPingResult } from '@/services/api/agent'

export type ChatLogEntry = {
  role: 'user' | 'assistant'
  text: string
  meta?: string
  outcome?: string
  provider?: string
  totalMs?: number
  /** 流式生成中：文本持续追加 */
  streaming?: boolean
  /** 摄像头快照等附件 */
  attachments?: AgentChatAttachment[]
  /** 需要用户点按钮确认的批量控制 */
  confirmation?: AgentChatConfirmation
  /** 已点过确认/取消或已开始新一轮，按钮不再可点 */
  confirmationAnswered?: boolean
}

export function useAgentPanelChat(opts: {
  isMockProvider: Ref<boolean>
  pending: Ref<number>
  pingInfo: Ref<AgentPingResult | null>
}) {
  const { isMockProvider, pending, pingInfo } = opts
  // 对话页与仪表板面板同一口径：回复回来就播报（受 `voice.ttsEnabled` 总开关约束）
  const { speakReply } = useAgentSpeech()

  const chatSessionId = ref(`settings-agent-${Date.now().toString(36)}`)
  const chatInput = ref('')
  const chatting = ref(false)
  const chatLog = ref<ChatLogEntry[]>([])
  const chatLogEl = ref<HTMLElement | null>(null)
  /**
   * 函数式模板 ref。不用 `ref="chatLogEl"` 字符串形式：vue-tsc 不把字符串 ref 当作
   * 对脚本变量的读取，开启 `noUnusedLocals` 后会误报「声明但未使用」。
   * 换 `useTemplateRef('chatLogEl')` 同样报 TS6133（vue-tsc 3.3.14 实测），别改。
   */
  const bindChatLog = (el: Element | ComponentPublicInstance | null) => {
    chatLogEl.value = el instanceof HTMLElement ? el : null
  }
  /** 当前进行中的流式请求句柄：停止 / 重新发送前取消 */
  let streamHandle: AgentStreamHandle | null = null

  function scrollChatToBottom() {
    void nextTick(() => {
      const el = chatLogEl.value
      if (el) el.scrollTop = el.scrollHeight
    })
  }

  const chatUserRounds = computed(() => chatLog.value.filter((m) => m.role === 'user').length)

  const lastAssistantMessage = computed(() => [...chatLog.value].reverse().find((m) => m.role === 'assistant'))

  const chatStatReadyLabel = computed(() => {
    if (pending.value > 0) return '待保存'
    if (!pingInfo.value) return '—'
    return pingInfo.value.ready ? '就绪' : '未就绪'
  })

  const chatStatReadyClass = computed(() => {
    if (pending.value > 0) return 'agent-stat--amber'
    if (!pingInfo.value) return 'agent-stat--sky'
    return pingInfo.value.ready ? 'agent-stat--emerald' : 'agent-stat--amber'
  })

  const chatStatReadyValClass = computed(() => {
    if (pending.value > 0) return 'agent-stat-val--amber'
    if (!pingInfo.value) return 'agent-stat-val--sky'
    return pingInfo.value.ready ? 'agent-stat-val--emerald' : 'agent-stat-val--amber'
  })

  const chatStatRoundLabel = computed(() => (chatUserRounds.value ? `${chatUserRounds.value} 轮` : '—'))

  const chatStatLastMsLabel = computed(() => {
    const ms = lastAssistantMessage.value?.totalMs
    return ms != null ? `${ms}ms` : '—'
  })

  const chatStatOutcomeLabel = computed(() => {
    const outcome = lastAssistantMessage.value?.outcome
    if (!outcome) return '—'
    return chatOutcomeLabel(outcome)
  })

  const chatStatOutcomeClass = computed(() => {
    const tone = chatOutcomeTone(lastAssistantMessage.value?.outcome)
    if (tone === 'emerald') return 'agent-stat--emerald'
    if (tone === 'amber') return 'agent-stat--amber'
    if (tone === 'rose') return 'agent-stat--rose'
    return 'agent-stat--sky'
  })

  const chatStatOutcomeValClass = computed(() => {
    const tone = chatOutcomeTone(lastAssistantMessage.value?.outcome)
    if (tone === 'emerald') return 'agent-stat-val--emerald'
    if (tone === 'amber') return 'agent-stat-val--amber'
    if (tone === 'rose') return 'agent-stat-val--rose'
    return 'agent-stat-val--sky'
  })

  function fallbackReplyOf(outcome?: string): string {
    if (outcome === 'success') return '（已执行，静默成功）'
    if (outcome === 'blocked') return '（已拦截）'
    return '（无回复）'
  }

  /** 回复播报：后端只对「需要朗读」的回合置 `speak=true`（缓存/快路径命中时是静默的） */
  function speakIfNeeded(speak: boolean, text: string, ttsUrl?: string) {
    if (!speak || !text) return
    void speakReply(ttsUrl, text)
  }

  type ChatFinal = {
    provider: string
    outcome?: string
    totalMs?: number
    reply: string
    ttsUrl?: string
    speak: boolean
    attachments?: AgentChatAttachment[]
    confirmation?: AgentChatConfirmation
  }

  /** 发给模型的历史：只保留有正文、非流式的消息，限最近 16 条 */
  function buildChatHistory(log: ChatLogEntry[]) {
    return log
      .filter((entry) => entry.text.trim() && !entry.streaming)
      .map((entry) => ({ role: entry.role, content: entry.text }))
      .slice(-16)
  }

  /** 新一轮开始：旧确认按钮失效，避免重复点「确认」把旧批次执行两次 */
  function expireChatConfirmations(log: ChatLogEntry[]) {
    for (const entry of log) {
      if (entry.confirmation && !entry.confirmationAnswered) entry.confirmationAnswered = true
    }
  }

  /** 用最终结果里的工具轨迹覆盖流式阶段收集的顺序（同一批以服务端为准） */
  function mergeToolNames(target: string[], calls?: Array<{ name: string }>) {
    target.length = 0
    for (const call of calls ?? []) {
      if (!target.includes(call.name)) target.push(call.name)
    }
  }

  /** 收尾：正文 / 附件 / 确认信息 / 角标一次写进气泡 */
  function finalizeChatBubble(bubble: ChatLogEntry, final: ChatFinal, toolNames: string[]) {
    bubble.outcome = final.outcome
    bubble.provider = final.provider
    bubble.totalMs = final.totalMs
    bubble.text = final.reply || bubble.text || fallbackReplyOf(final.outcome)
    bubble.attachments = final.attachments
    bubble.confirmation = final.confirmation
    bubble.meta = [final.provider, final.outcome, `${final.totalMs ?? '?'}ms`, toolNames.join(' → ')]
      .filter(Boolean)
      .join(' · ')
  }

  /** 主动停止生成：保留已收到的文本，只取消后续请求 */
  function stopChat() {
    streamHandle?.abort()
    streamHandle = null
    chatting.value = false
    for (const entry of chatLog.value) {
      if (entry.streaming) entry.streaming = false
    }
  }

  async function sendChat() {
    const message = clipAgentChatMessage(chatInput.value)
    if (!message || chatting.value || isMockProvider.value) return
    chatting.value = true
    const history = buildChatHistory(chatLog.value)
    chatLog.value.push({ role: 'user', text: message })
    chatInput.value = ''
    scrollChatToBottom()

    // 先插入流式气泡：token 到达即逐字渲染，工具轨迹实时累积
    const bubble: ChatLogEntry = { role: 'assistant', text: '', streaming: true }
    chatLog.value.push(bubble)
    const toolNames: string[] = []
    const final: ChatFinal = { provider: '', reply: '', speak: false }
    expireChatConfirmations(chatLog.value)

    try {
      const handle = agentChatStream(message, history, chatSessionId.value, {
        onToken: (text) => {
          bubble.text += text
          scrollChatToBottom()
        },
        onTool: (call) => {
          if (!toolNames.includes(call.name)) toolNames.push(call.name)
        },
        onDone: (res) => {
          final.provider = res.provider
          final.outcome = res.outcome
          final.totalMs = res.timing?.totalMs
          final.reply = res.reply
          final.ttsUrl = res.ttsUrl
          final.speak = res.speak
          final.attachments = res.attachments
          final.confirmation = res.confirmation
          mergeToolNames(toolNames, res.toolCalls)
        },
      })
      streamHandle = handle
      await handle.done

      finalizeChatBubble(bubble, final, toolNames)
      // 播报放在气泡收尾之后：异步出声，不拖慢下一轮输入
      speakIfNeeded(final.speak, bubble.text, final.ttsUrl)
    } catch (e: unknown) {
      const fail = getApiErrorMessage(e, '请求失败')
      bubble.text = bubble.text.trim() ? `${bubble.text}\n（${fail}）` : fail
      bubble.meta = 'error'
      bubble.outcome = 'error'
    } finally {
      bubble.streaming = false
      streamHandle = null
      chatting.value = false
      // 取消后完全没有内容的气泡直接移除
      if (!bubble.text.trim()) {
        chatLog.value = chatLog.value.filter((entry) => entry !== bubble)
      }
      scrollChatToBottom()
    }
  }

  function sendQuickPrompt(prompt: string) {
    if (chatting.value || isMockProvider.value) return
    chatInput.value = prompt
    void sendChat()
  }

  /** 复制气泡正文：失败静默，不打断对话 */
  function copyChat(entry: ChatLogEntry) {
    const content = String(entry.text || '').trim()
    if (!content) return
    try {
      void navigator.clipboard?.writeText(content)
    } catch {
      /* 无剪贴板权限时忽略 */
    }
  }

  /** 重新生成：删掉最后一轮助手回复与用户提问，用同一句原话重发 */
  function regenerateChat() {
    if (chatting.value || isMockProvider.value) return
    const log = chatLog.value
    let userIndex = -1
    for (let i = log.length - 1; i >= 0; i -= 1) {
      if (log[i].role === 'user' && log[i].text.trim()) {
        userIndex = i
        break
      }
    }
    if (userIndex < 0) return
    const prompt = log[userIndex].text
    chatLog.value = log.slice(0, userIndex)
    chatInput.value = prompt
    void sendChat()
  }

  /** 点击确认 / 取消按钮：等价于用户输入对应口令，走同一条批量确认链路 */
  function answerChatConfirmation(entry: ChatLogEntry, accepted: boolean) {
    const confirmation = entry.confirmation
    if (!confirmation || chatting.value || isMockProvider.value) return
    entry.confirmationAnswered = true
    chatInput.value = clipAgentChatMessage(accepted ? confirmation.confirmText : confirmation.cancelText)
    void sendChat()
  }

  const {
    listening: voiceListening,
    transcribing: voiceTranscribing,
    error: voiceError,
    status: voiceStatus,
    toggleListen: toggleVoiceListen,
    stopListen: stopVoiceListen,
  } = useSpeechToText({
    preferHa: true,
    onInterim: (text) => {
      chatInput.value = clipAgentChatMessage(text)
    },
    onFinal: (text) => {
      if (isMockProvider.value || chatting.value) return
      chatInput.value = clipAgentChatMessage(text)
      void sendChat()
    },
  })

  const chatPlaceholder = computed(() => {
    if (isMockProvider.value) return '演示模式已禁用发送，请先配置接口密钥…'
    if (voiceStatus.value) return voiceStatus.value
    return '输入自然语言指令，或点麦克风说话…'
  })

  watch([isMockProvider, chatting], ([mock, busy]) => {
    if (mock || busy) stopVoiceListen()
    if (mock && busy) stopChat()
  })

  watch(
    () => chatLog.value.length,
    () => scrollChatToBottom(),
  )

  watch(chatting, (active) => {
    if (active) scrollChatToBottom()
  })

  return {
    chatInput,
    chatting,
    AGENT_CHAT_MAX_LENGTH,
    chatLog,
    bindChatLog,
    chatStatReadyLabel,
    chatStatReadyClass,
    chatStatReadyValClass,
    chatStatRoundLabel,
    chatStatLastMsLabel,
    chatStatOutcomeLabel,
    chatStatOutcomeClass,
    chatStatOutcomeValClass,
    chatOutcomeLabel,
    chatOutcomeTone,
    sendQuickPrompt,
    sendChat,
    stopChat,
    copyChat,
    regenerateChat,
    answerChatConfirmation,
    voiceListening,
    voiceTranscribing,
    voiceError,
    toggleVoiceListen,
    chatPlaceholder,
  }
}
