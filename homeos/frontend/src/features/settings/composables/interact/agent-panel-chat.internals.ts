/**
 * @file agent-panel-chat.internals.ts
 * @module frontend/src/features/settings/composables/interact
 */
/** 智能管家设置面板：对话 / 语音输入 */
import { computed, nextTick, ref, watch, type Ref } from 'vue'
import { useSpeechToText } from '@/composables/voice/useSpeechToText'
import { clipAgentChatMessage, AGENT_CHAT_MAX_LENGTH } from '@/shared/agent/utils/chat-limit.util'
import { agentChatStream, type AgentStreamHandle } from '@/services/api/agent'
import { getApiErrorMessage } from '@/shared/utils/core/error-message'
import {
  chatOutcomeLabel,
  chatOutcomeTone,
} from '@/features/settings/composables/interact/agent-panel-helpers.internals'
import type { AgentPingResult } from '@/services/api/agent'

type ChatLogEntry = {
  role: 'user' | 'assistant'
  text: string
  meta?: string
  outcome?: string
  provider?: string
  totalMs?: number
  /** 流式生成中：文本持续追加 */
  streaming?: boolean
}

export function useAgentPanelChat(opts: {
  isMockProvider: Ref<boolean>
  pending: Ref<number>
  pingInfo: Ref<AgentPingResult | null>
}) {
  const { isMockProvider, pending, pingInfo } = opts

  const chatSessionId = ref(`settings-agent-${Date.now().toString(36)}`)
  const chatInput = ref('')
  const chatting = ref(false)
  const chatLog = ref<ChatLogEntry[]>([])
  const chatLogEl = ref<HTMLElement | null>(null)
  /** 当前进行中的流式请求句柄：停止 / 重新发送前取消 */
  let streamHandle: AgentStreamHandle | null = null

  function scrollChatToBottom() {
    void nextTick(() => {
      const el = chatLogEl.value
      if (el) el.scrollTop = el.scrollHeight
    })
  }

  const chatUserRounds = computed(
    () => chatLog.value.filter((m) => m.role === 'user').length,
  )

  const lastAssistantMessage = computed(() =>
    [...chatLog.value].reverse().find((m) => m.role === 'assistant'),
  )

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

  const chatStatRoundLabel = computed(() =>
    chatUserRounds.value ? `${chatUserRounds.value} 轮` : '—',
  )

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
    const history = chatLog.value
      .filter((m) => (m.role === 'user' || m.role === 'assistant') && m.text.trim() && !m.streaming)
      .map((m) => ({ role: m.role, content: m.text }))
      .slice(-16)
    chatLog.value.push({ role: 'user', text: message })
    chatInput.value = ''
    scrollChatToBottom()

    // 先插入流式气泡：token 到达即逐字渲染，工具轨迹实时累积
    const bubble: ChatLogEntry = { role: 'assistant', text: '', streaming: true }
    chatLog.value.push(bubble)
    const toolNames: string[] = []
    let finalProvider = ''
    let finalOutcome: string | undefined
    let finalTotalMs: number | undefined
    let finalReply = ''

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
          finalProvider = res.provider
          finalOutcome = res.outcome
          finalTotalMs = res.timing?.totalMs
          finalReply = res.reply
          if (res.toolCalls?.length) {
            toolNames.length = 0
            for (const call of res.toolCalls) {
              if (!toolNames.includes(call.name)) toolNames.push(call.name)
            }
          }
        },
      })
      streamHandle = handle
      await handle.done

      bubble.outcome = finalOutcome
      bubble.provider = finalProvider
      bubble.totalMs = finalTotalMs
      bubble.text = finalReply || bubble.text || fallbackReplyOf(finalOutcome)
      bubble.meta = [
        finalProvider,
        finalOutcome,
        `${finalTotalMs ?? '?'}ms`,
        toolNames.join(' → '),
      ]
        .filter(Boolean)
        .join(' · ')
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
    chatLogEl,
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
    voiceListening,
    voiceTranscribing,
    voiceError,
    toggleVoiceListen,
    chatPlaceholder,
  }
}
