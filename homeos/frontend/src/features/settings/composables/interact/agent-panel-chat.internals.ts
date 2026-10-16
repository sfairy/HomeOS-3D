/**
 * @file agent-panel-chat.internals.ts
 * @module frontend/src/features/settings/composables/interact
 */
/** 智能管家设置面板：对话 / 语音输入 */
import { computed, nextTick, ref, watch, type Ref } from 'vue'
import { useSpeechToText } from '@/composables/voice/useSpeechToText'
import { clipAgentChatMessage, AGENT_CHAT_MAX_LENGTH } from '@/shared/agent/utils/chat-limit.util'
import { agentChat } from '@/services/api/agent'
import { getApiErrorMessage } from '@/shared/utils/core/error-message'
import {
  chatOutcomeLabel,
  chatOutcomeTone,
} from '@/features/settings/composables/interact/agent-panel-helpers.internals'
import type { AgentPingResult } from '@/services/api/agent'

export type ChatLogEntry = {
  role: 'user' | 'assistant'
  text: string
  meta?: string
  outcome?: string
  provider?: string
  totalMs?: number
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

  async function sendChat() {
    const message = clipAgentChatMessage(chatInput.value)
    if (!message || chatting.value || isMockProvider.value) return
    chatting.value = true
    const history = chatLog.value
      .filter((m) => (m.role === 'user' || m.role === 'assistant') && m.text.trim())
      .map((m) => ({ role: m.role, content: m.text }))
      .slice(-16)
    chatLog.value.push({ role: 'user', text: message })
    chatInput.value = ''
    scrollChatToBottom()
    try {
      const res = await agentChat(message, history, chatSessionId.value)
      const text =
        res.reply ||
        (res.outcome === 'success'
          ? '（已执行，静默成功）'
          : res.outcome === 'blocked'
            ? '（已拦截）'
            : '（无回复）')
      chatLog.value.push({
        role: 'assistant',
        text,
        meta: [
          res.provider,
          res.outcome,
          `${res.timing?.totalMs ?? '?'}ms`,
          res.toolCalls?.length ? res.toolCalls.map((c) => c.name).join(' → ') : '',
        ]
          .filter(Boolean)
          .join(' · '),
        provider: res.provider,
        outcome: res.outcome,
        totalMs: res.timing?.totalMs,
      })
    } catch (e: unknown) {
      chatLog.value.push({
        role: 'assistant',
        text: getApiErrorMessage(e, '请求失败'),
        meta: 'error',
        outcome: 'error',
      })
    } finally {
      chatting.value = false
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
    voiceListening,
    voiceTranscribing,
    voiceError,
    toggleVoiceListen,
    chatPlaceholder,
  }
}
