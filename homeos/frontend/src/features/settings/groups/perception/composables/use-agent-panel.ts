import { computed, nextTick, ref, watch, type Ref, type ComponentPublicInstance, onMounted, reactive } from 'vue'
import { useAgentSpeech } from '@/features/voice/composables/use-agent-speech'
import { useSpeechToText } from '@/features/voice/composables/use-speech-to-text'
import { clipAgentChatMessage, AGENT_CHAT_MAX_LENGTH } from '@/features/agent/model/utils/chat-limit.util'
import { agentChatStream, clearAgentSession, type AgentChatAttachment, type AgentChatConfirmation, type AgentStreamHandle, type AgentPingResult, agentPing, channelsStatus, type ChannelsStatusResult } from '@/domain/api/agent'
import { getApiErrorMessage } from '@/kernel/utils/core/error-message'
import { AGENT_PROVIDER_LABELS, agentProviderLabel } from '@/features/agent/model/utils/model-label.util'
import { Activity, BellRing, Bot, Brain, CalendarClock, CircleCheck, GraduationCap, Languages, MessageCircle, MessageSquare, ScrollText, ShieldAlert, ShieldCheck, Sparkles, Wrench, Zap } from '@lucide/vue'
import { useChromeStore } from '@/kernel/ui/chrome/chrome-store'
import { useLayoutStore } from '@/domain/layout/store/layout.store'
import { clonePlain } from '@/kernel/utils/core/clone-plain.util'
import { useRegisterSettingsTabPending } from '@/features/settings/kernel/pending.internals'
import { getDefaultLayout } from '@/domain/layout/store/defaults'
import { SETTINGS_ROUTES } from '@/kernel/utils/registry/settings-route.util'
import { type AgentCompanionConfig, type AgentConfig, type AgentProactiveConfig, type ChannelConfig, type SceneVoiceControl } from '@/kernel/types/layout'
import { normalizeAgentCompanion, resolveAgentCompanionPosition } from '@/kernel/utils/layout/agent-companion.util'
import { readAgentQuickPrompts as AGENT_CHAT_QUICK_PROMPTS } from '@/features/agent/model/utils/quick-prompts.util'

/**
 * @file agent-panel-chat.internals.ts
 * @module frontend/src/features/settings/interact/composables
 */
/** 智能管家设置面板：对话 / 语音输入 */

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

  /**
   * 会话 id + 气泡记录一起存在 sessionStorage：刷新设置页不会换一条会话，
   * 后端保存的上文与用户眼前看到的记录才对得上（服务端按 id 取历史，10 分钟 TTL）。
   */
  const CHAT_SESSION_KEY = 'homeos.agent.settingsChatSession'
  function newSettingsSessionId(): string {
    return `settings-agent-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  }
  function readStoredChat(): { id: string; log: ChatLogEntry[] } | null {
    try {
      const raw = window.sessionStorage.getItem(CHAT_SESSION_KEY)
      const parsed = raw ? (JSON.parse(raw) as { id?: unknown; log?: unknown }) : null
      if (!parsed || typeof parsed.id !== 'string' || !parsed.id) return null
      return { id: parsed.id, log: Array.isArray(parsed.log) ? (parsed.log as ChatLogEntry[]) : [] }
    } catch {
      return null
    }
  }
  const storedChat = readStoredChat()
  const chatSessionId = ref(storedChat?.id || newSettingsSessionId())

  /** 气泡最多存 40 条，避免把长对话整段塞进 sessionStorage。 */
  function persistChatState(): void {
    try {
      const log = chatLog.value
        .filter((entry) => !entry.streaming && (entry.text.trim() || entry.attachments?.length))
        .slice(-40)
      window.sessionStorage.setItem(CHAT_SESSION_KEY, JSON.stringify({ id: chatSessionId.value, log }))
    } catch {
      // 隐私模式禁用存储时按每次进入新建会话处理，不影响对话
    }
  }
  const chatInput = ref('')
  const chatting = ref(false)
  const chatLog = ref<ChatLogEntry[]>(
    // 恢复时清掉流式标记与确认按钮：确认计划只有 60 秒有效，刷新后按钮早已过期，
    // 保留下来只会让用户点了没反应（或被当成新指令「确认」发出去）。
    (storedChat?.log ?? []).map((entry) => ({ ...entry, streaming: false, confirmation: undefined })),
  )
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
    persistChatState()
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
      persistChatState()
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

  /**
   * 清空对话：UI 记录清空的同时删掉服务端会话，并换一条新 sessionId。
   *
   * 只清前端数组是不够的：服务端按 sessionId 保存了最近 16 条历史与短时记忆，
   * 下一句仍会带着「已经清掉」的上文回答，看起来像清空没生效。
   */
  async function clearChatLog() {
    stopChat()
    const previous = chatSessionId.value
    chatLog.value = []
    chatSessionId.value = newSettingsSessionId()
    persistChatState()
    try {
      await clearAgentSession(previous)
    } catch {
      // 服务端清理失败不阻塞本地清空：会话最多 10 分钟后自然过期
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
    clearChatLog,
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

/**
 * @file agent-panel-helpers.internals.ts
 * @module frontend/src/features/settings/interact/composables
 */
/** 智能管家设置面板：纯辅助 / 常量 */

/** 统计卡片色调（与 SettingsFlowStat.vue 的 FlowStatTone 保持对齐） */
export type FlowStatTone = 'accent' | 'secondary' | 'emerald' | 'amber' | 'sky' | 'rose' | 'violet'

function mapFlowStatTone(cls: string): FlowStatTone {
  if (cls.includes('emerald') || cls.includes('green')) return 'emerald'
  if (cls.includes('amber') || cls.includes('yellow') || cls.includes('warn')) return 'amber'
  if (cls.includes('rose') || cls.includes('red') || cls.includes('danger')) return 'rose'
  if (cls.includes('violet') || cls.includes('indigo') || cls.includes('purple')) return 'violet'
  if (cls.includes('secondary') || cls.includes('slate') || cls.includes('muted')) return 'secondary'
  if (cls.includes('accent')) return 'accent'
  return 'sky'
}

/** GET 脱敏占位符（与后端 CONFIG_MASK_PLACEHOLDER 对齐） */
export const AGENT_SECRET_MASK = '••••••••'

/** 是否为脱敏占位（接口不会回传明文密钥） */
export function isAgentSecretMasked(val: unknown): boolean {
  const key = String(val ?? '').trim()
  return key === AGENT_SECRET_MASK || key === '********'
}

/** Agent Mock / 演示模式判定（设置页与单测共用） */
export function isAgentMockProvider(opts: {
  draftProvider?: string | null
  pingProvider?: string | null
  pingReady?: boolean | null
  apiKey?: string | null
  apiKeyConfigured?: boolean | null
}): boolean {
  if (String(opts.draftProvider || '').toLowerCase() === 'mock') return true
  if (String(opts.pingProvider || '').toLowerCase() === 'mock') return true
  const hasKey =
    opts.apiKeyConfigured === true || (Boolean(String(opts.apiKey || '').trim()) && !isAgentSecretMasked(opts.apiKey))
  if (opts.pingReady === false && !hasKey) return true
  return false
}

/** 厂商展示名与对话面板顶栏共用一张表，避免同一家在两个页面叫不同名字 */
export const AGENT_PROVIDER_PRESETS = [
  {
    id: 'deepseek',
    label: AGENT_PROVIDER_LABELS.deepseek,
    apiBase: 'https://api.deepseek.com',
    model: 'deepseek-v4-flash',
  },
  {
    id: 'doubao',
    label: AGENT_PROVIDER_LABELS.doubao,
    apiBase: 'https://ark.cn-beijing.volces.com/api/v3',
    model: '',
  },
  { id: 'minimax', label: AGENT_PROVIDER_LABELS.minimax, apiBase: 'https://api.minimax.chat/v1', model: '' },
  {
    id: 'qwen',
    label: AGENT_PROVIDER_LABELS.qwen,
    apiBase: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: '',
  },
  { id: 'moonshot', label: AGENT_PROVIDER_LABELS.moonshot, apiBase: 'https://api.moonshot.cn/v1', model: '' },
  { id: 'custom', label: AGENT_PROVIDER_LABELS.custom, apiBase: '', model: '' },
  { id: 'mock', label: '演示（无密钥）', apiBase: '', model: '' },
]

/**
 * 快捷指令：与主页对话面板共用同一份来源（`ui.agentQuickPrompts`，缺省用
 * `shared/agent/constants/agent-quick-prompts` 的内置清单）。
 *
 * 之前这里另有一份「打开客厅灯 / 现在家里温度多少 / 那把它关掉」的演示句子，
 * 导致同一个管家在设置页和主页给出两套入口、文案也不一致；现在设置页只调
 * `readAgentQuickPrompts()`，用户在设置里改完立即两边同时生效。
 * 多轮理解的引导改为面板上的文字提示，不再靠预设凑句子。
 */
export { readAgentQuickPrompts as AGENT_CHAT_QUICK_PROMPTS } from '@/features/agent/model/utils/quick-prompts.util'

/**
 * 快捷指令子卡（存在 app config `ui` 分区）的未保存状态与回滚入口。
 *
 * 为什么用模块级状态而不是 props/emits：子卡在「对话」子页里，由面板统一注册
 * 设置页的离开确认（`useRegisterSettingsTabPending('agent', …)`）。如果子卡自己
 * 用同一个 tab id 再注册一次，两个 watch 会互相覆盖 pendingByTab，出现「明明改了
 * 却提示没有未保存」。让子卡只往这两个槽里写状态，注册只发生一次。
 */
export const agentQuickPromptsDirty = ref(false)
export const agentQuickPromptsRevert = ref<(() => void) | null>(null)

export function chatOutcomeLabel(outcome: string) {
  if (outcome === 'success') return '已执行'
  if (outcome === 'answer') return '已回复'
  if (outcome === 'blocked') return '已拦截'
  if (outcome === 'failed') return '失败'
  if (outcome === 'error') return '错误'
  return outcome
}

export function chatOutcomeTone(outcome?: string): FlowStatTone {
  if (outcome === 'success' || outcome === 'answer') return 'emerald'
  if (outcome === 'blocked') return 'amber'
  if (outcome === 'failed' || outcome === 'error') return 'rose'
  return 'sky'
}

export function toneFromAgentClass(cls: string): FlowStatTone {
  if (cls.includes('emerald')) return 'emerald'
  if (cls.includes('amber')) return 'amber'
  if (cls.includes('violet') || cls.includes('indigo') || cls.includes('purple')) return 'violet'
  if (cls.includes('rose') || cls.includes('danger')) return 'rose'
  if (cls.includes('accent')) return 'sky'
  if (cls.includes('secondary') || cls.includes('slate')) return 'secondary'
  return mapFlowStatTone(cls)
}

/**
 * @file agent-panel-stats.internals.ts
 * @module frontend/src/features/settings/interact/composables
 */
/** 智能管家设置：模型就绪统计派生 */

type AgentUsageToday = NonNullable<AgentPingResult['usageToday']>

/** 今日 token 预算使用率（0-100）；未配置预算时返回 null，侧栏进度条据此隐藏 */
function usagePercentOf(usage: AgentUsageToday | null | undefined): number | null {
  const budget = usage?.dailyTokenBudget ?? 0
  return budget > 0 && usage ? Math.round((usage.totalTokens / budget) * 100) : null
}

export function useAgentModelStats(opts: {
  pending: Ref<number>
  pingInfo: Ref<AgentPingResult | null>
  providerLabel: Ref<string>
}) {
  const { pending, pingInfo, providerLabel } = opts
  const modelStatProvider = computed(() => {
    if (pending.value > 0) return providerLabel.value
    // ping 回的是 provider id（deepseek），卡片标题要与预设同一个人读名
    return agentProviderLabel(pingInfo.value?.provider) || providerLabel.value
  })
  const modelStatReadyLabel = computed(() => {
    if (pending.value > 0) return '待保存'
    if (!pingInfo.value) return '—'
    return pingInfo.value.ready ? '就绪' : '未就绪'
  })
  const modelStatReadyClass = computed(() => {
    if (pending.value > 0) return 'agent-stat--amber'
    if (!pingInfo.value) return 'agent-stat--sky'
    return pingInfo.value.ready ? 'agent-stat--emerald' : 'agent-stat--amber'
  })
  const modelStatReadyValClass = computed(() => {
    if (pending.value > 0) return 'agent-stat-val--amber'
    if (!pingInfo.value) return 'agent-stat-val--sky'
    return pingInfo.value.ready ? 'agent-stat-val--emerald' : 'agent-stat-val--amber'
  })

  //: 计价来源文案：区分「provider 默认价」与「未知 provider 回退 DeepSeek 估算」
  const PRICING_SOURCE_LABELS: Record<string, string> = {
    'provider-default': '官方价',
    'fallback-deepseek': '按 DeepSeek 估算',
    env: '环境变量指定',
  }

  /** 当前模型 + 计价口径（设置页用于避免「显示 deepseek 却在用豆包」的误判） */
  const modelStatDetail = computed(() => {
    const info = pingInfo.value
    if (!info) return ''
    const model = (info.model || '').trim()
    const pricing = info.pricing
    const parts: string[] = []
    if (model) parts.push(`模型 ${model}`)
    if (pricing) {
      const source = PRICING_SOURCE_LABELS[pricing.source] || pricing.source
      // 官方价带上 provider 名：用户切到豆包后，这里必须能看出单价来自哪一家
      const scope = pricing.source === 'provider-default' && info.provider ? `${info.provider} ` : ''
      parts.push(`计价 ${scope}${source}（入 ¥${pricing.inputMissCNY}/百万 · 出 ¥${pricing.outputCNY}/百万）`)
    }
    return parts.join(' · ')
  })

  /** 今日用量（token / 成本 / 预算），无配额配置时只显示已用 */
  const usageTodayLabel = computed(() => {
    const usage = pingInfo.value?.usageToday
    if (!usage) return ''
    const parts = [`今日 ${usage.totalTokens.toLocaleString()} token`, `¥${usage.costCNY.toFixed(4)}`]
    if (usage.dailyTokenBudget > 0) {
      parts.push(`额度 ${Math.round((usage.totalTokens / usage.dailyTokenBudget) * 100)}%`)
    }
    if (usage.dailyCostBudgetCNY > 0) {
      parts.push(`预算 ¥${usage.dailyCostBudgetCNY.toFixed(2)}`)
    }
    return parts.join(' · ')
  })

  /** 今日 token 预算使用率（0-100；未配置预算时为 null，用于侧栏进度条） */
  const modelUsagePercent = computed(() => usagePercentOf(pingInfo.value?.usageToday))

  return {
    modelStatProvider,
    modelStatReadyLabel,
    modelStatReadyClass,
    modelStatReadyValClass,
    modelStatDetail,
    usageTodayLabel,
    modelUsagePercent,
  }
}

/** 智能管家设置面板组合式函数（SettingsAgentPanel.vue 逻辑抽取）。 */

type ChannelDraft = {
  email: NonNullable<ChannelConfig['email']>
  webpush: NonNullable<ChannelConfig['webpush']>
  wecom: NonNullable<ChannelConfig['wecom']>
}

/** 意图门模式白名单：非法值一律回落 shadow（与后端 normalize_mode 同义）。 */
export type IntentGateMode = 'off' | 'shadow' | 'enforce'

export function normalizeIntentGateMode(value: unknown): IntentGateMode {
  const mode = String(value ?? '')
  return mode === 'off' || mode === 'enforce' ? mode : 'shadow'
}

/** 数字兜底：空值 / 非法值回退默认；0 是合法值，不能用 `||` 代替。 */
function numberOr(value: unknown, fallback: number): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

/** 整数夹紧到 `[minimum, maximum]`（布局 / 表单 / 请求体共用一套口径）。 */
function clampInt(value: unknown, fallback: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, Math.round(numberOr(value, fallback))))
}

/** 小数夹紧（下限 + 上限）。 */
function clampNumber(value: unknown, fallback: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, numberOr(value, fallback)))
}

/** 看门狗字段兜底（区间与后端 AgentConfigService 的夹紧保持一致） */ function readWatchdog(
  raw: Partial<AgentProactiveConfig>,
  defaults: AgentProactiveConfig,
): Pick<
  AgentProactiveConfig,
  | 'watchdogEnabled'
  | 'motionIdleMinutes'
  | 'idleDeviceMinutes'
  | 'idleSwitchMinutes'
  | 'autoCloseEnabled'
  | 'maxAutoCloseDevices'
> {
  return {
    watchdogEnabled: raw.watchdogEnabled === true,
    motionIdleMinutes: clampInt(raw.motionIdleMinutes, defaults.motionIdleMinutes, 1, 1440),
    idleDeviceMinutes: clampInt(raw.idleDeviceMinutes, defaults.idleDeviceMinutes, 1, 1440),
    idleSwitchMinutes: clampInt(raw.idleSwitchMinutes, defaults.idleSwitchMinutes, 1, 1440),
    autoCloseEnabled: raw.autoCloseEnabled === true,
    maxAutoCloseDevices: clampInt(raw.maxAutoCloseDevices, defaults.maxAutoCloseDevices, 1, 20),
  }
}

/** 智能管家设置面板：聚合模型配置草稿、通知渠道、管家对话与连通性检测，供 SettingsAgentPanel.vue 使用 */
export function useSettingsAgentPanel(props: { activeTab: string }) {
  const layoutStore = useLayoutStore()
  const chrome = useChromeStore()
  const showApiKey = ref(false)
  /** 已配置密钥时默认展示「已加密存储」；点「更换」后进入明文输入 */
  const editingApiKey = ref(false)
  const section = ref('model')
  const subnavSections = [
    { id: 'model', label: '模型配置', icon: Sparkles },
    { id: 'scene-voice', label: '场景语音', icon: ShieldAlert },
    { id: 'device-scope', label: '设备范围', icon: ShieldCheck },
    { id: 'companion', label: '悬浮伴侣', icon: Bot },
    { id: 'proactive', label: '主动管家', icon: BellRing },
    { id: 'policies', label: '家规', icon: ScrollText },
    { id: 'schedules', label: '计划任务', icon: CalendarClock },
    { id: 'diagnostics', label: '诊断日志', icon: Activity },
    { id: 'memory', label: '长期记忆', icon: Brain },
    { id: 'learning', label: '学习调优', icon: GraduationCap },
    { id: 'channels', label: '消息通道', icon: MessageSquare },
    { id: 'chat', label: '对话', icon: MessageCircle },
  ]

  const providerPresets = AGENT_PROVIDER_PRESETS
  /** 快捷指令随 `ui.agentQuickPrompts` 热更新：设置页改完保存后这里立刻跟着变 */
  const chatQuickPrompts = computed(() => AGENT_CHAT_QUICK_PROMPTS())
  /** 会话空态提示：清单被用户清空时，不能再让人去「点一条预设」 */
  const chatEmptyHint = computed(() =>
    chatQuickPrompts.value.length
      ? '先点一条预设执行，再追问「那把它关掉」，验证多轮理解'
      : '直接输入指令开始对话；快捷指令已在下方「快捷指令」卡片里清空',
  )

  function emptyAgent(): AgentConfig {
    return { ...getDefaultLayout().agentConfig! }
  }

  /** 场景语音控制草稿：字段缺失或格式非法时回退为「全禁 + 空清单」 */
  function readSceneVoiceControl(): SceneVoiceControl {
    const raw = layoutStore.layoutConfig?.agentConfig?.sceneVoiceControl
    if (!raw || typeof raw !== 'object') return { enabled: false, allow: [] }
    const allow = Array.isArray(raw.allow) ? raw.allow.map((id) => String(id ?? '').trim()).filter(Boolean) : []
    return { enabled: raw.enabled === true, allow }
  }

  /** 主动管家草稿：嵌套字段逐个兜底，避免旧布局缺字段导致 NaN */
  function readProactive(): AgentProactiveConfig {
    const d = getDefaultLayout().agentConfig!.proactive!
    const raw = layoutStore.layoutConfig?.agentConfig?.proactive
    if (!raw || typeof raw !== 'object') return { ...d }
    return {
      enabled: raw.enabled === true,
      intervalSeconds: Math.max(60, numberOr(raw.intervalSeconds, d.intervalSeconds)),
      cooldownSeconds: Math.max(60, numberOr(raw.cooldownSeconds, d.cooldownSeconds)),
      quietStart: clampInt(raw.quietStart, d.quietStart, 0, 23),
      // 分钟粒度：旧布局缺字段时沿用默认（23:30），不能在保存时静默写回整点
      quietStartMinute: clampInt(raw.quietStartMinute, d.quietStartMinute, 0, 59),
      quietEnd: clampInt(raw.quietEnd, d.quietEnd, 0, 23),
      quietEndMinute: clampInt(raw.quietEndMinute, d.quietEndMinute, 0, 59),
      energyMultiplier: Math.max(1, numberOr(raw.energyMultiplier, d.energyMultiplier)),
      minEnergyKwh: Math.max(0, numberOr(raw.minEnergyKwh, d.minEnergyKwh)),
      forecastSlots: clampInt(raw.forecastSlots, d.forecastSlots, 1, 12),
      forecastPopThreshold: clampNumber(raw.forecastPopThreshold, d.forecastPopThreshold, 0, 1),
      ...readWatchdog(raw, d),
    }
  }

  /** 悬浮伴侣草稿：这里只做展示配置，关掉只是收起入口，不影响后端能力 */
  function readCompanion(): AgentCompanionConfig {
    return normalizeAgentCompanion(layoutStore.layoutConfig?.agentConfig?.companion)
  }

  /** Agent 专属设备白名单：非法项丢弃，空列表 = 不额外限制 */
  function readDeviceAllowlist(): string[] {
    const raw = layoutStore.layoutConfig?.agentConfig?.deviceAllowlist
    if (!Array.isArray(raw)) return []
    const seen = new Set<string>()
    for (const item of raw) {
      const id = String(item ?? '').trim()
      if (id) seen.add(id)
    }
    return [...seen].slice(0, 200)
  }

  function readAgent(): AgentConfig {
    return {
      ...emptyAgent(),
      ...(layoutStore.layoutConfig?.agentConfig || {}),
      sceneVoiceControl: readSceneVoiceControl(),
      proactive: readProactive(),
      companion: readCompanion(),
      deviceAllowlist: readDeviceAllowlist(),
    }
  }

  function emptyChannels(): ChannelDraft {
    const d = getDefaultLayout().channelConfig!
    return {
      email: { ...d.email! },
      webpush: { ...d.webpush! },
      wecom: { ...d.wecom! },
    }
  }

  function readChannels(): ChannelDraft {
    const base = emptyChannels()
    const cur = layoutStore.layoutConfig?.channelConfig
    return {
      email: { ...base.email, ...(cur?.email || {}) },
      webpush: { ...base.webpush, ...(cur?.webpush || {}) },
      wecom: { ...base.wecom, ...(cur?.wecom || {}) },
    }
  }

  /** 用户是否已动过悬浮伴侣表单：动过就不再被异步到达的布局覆盖 */
  const companionTouched = ref(false)

  const agentDraft = reactive<AgentConfig>(readAgent())
  const channelDraft = reactive<ChannelDraft>(readChannels())
  const channelStatus = ref<ChannelsStatusResult | null>(null)
  const statusLoading = ref(false)
  const baseline = ref('')
  const pending = computed(() =>
    JSON.stringify({ agent: agentDraft, channels: channelDraft }) !== baseline.value ? 1 : 0,
  )
  /** 服务端已存密钥（脱敏占位或 apiKeyConfigured），且用户未点「更换」 */
  const apiKeyLocked = computed(
    () => !editingApiKey.value && (agentDraft.apiKeyConfigured === true || isAgentSecretMasked(agentDraft.apiKey)),
  )

  /** 进入更换模式：清空占位符，避免「显示」只能看到 •••••••• */
  function beginEditApiKey() {
    editingApiKey.value = true
    agentDraft.apiKey = ''
    showApiKey.value = false
  }
  const saving = ref(false)
  const saveTip = ref('')
  const saveTipOk = ref(true)
  const pinging = ref(false)
  const pingInfo = ref<AgentPingResult | null>(null)

  const envHealthHref = computed(() => SETTINGS_ROUTES.envHealth())

  const providerLabel = computed(
    () => providerPresets.find((p) => p.id === agentDraft.provider)?.label ?? agentDraft.provider,
  )
  const isMockProvider = computed(() =>
    isAgentMockProvider({
      draftProvider: agentDraft.provider,
      pingProvider: pingInfo.value?.provider,
      pingReady: pingInfo.value?.ready,
      apiKey: agentDraft.apiKey,
      apiKeyConfigured: agentDraft.apiKeyConfigured,
    }),
  )
  const languageLabel = computed(() => (agentDraft.language === 'zh' ? '中文' : 'English'))
  const chatFlowModelLabel = computed(() => agentDraft.model || providerLabel.value)

  const chat = useAgentPanelChat({
    isMockProvider,
    pending,
    pingInfo,
  })

  const {
    modelStatProvider,
    modelStatReadyLabel,
    modelStatReadyClass,
    modelStatReadyValClass,
    modelStatDetail,
    usageTodayLabel,
    modelUsagePercent,
  } = useAgentModelStats({ pending, pingInfo, providerLabel })

  /**
   * 场景语音控制总开关。
   *
   * 关闭时**不**清空草稿里的清单：那会让「误触关→再开」在下次保存时静默丢掉
   * 用户精心勾选的全部场景（数据丢失不可撤销）。保留清单是安全的——后端闸门
   * `isSceneVoiceAllowed` 要求 `enabled === true` 且实体命中清单才放行，
   * 总开关关闭时清单一律无效，因此这里是 fail-closed 的，不存在「残留项被静默放行」。
   */
  const sceneVoiceEnabled = computed<boolean>({
    get: () => agentDraft.sceneVoiceControl?.enabled === true,
    set: (enabledValue) => {
      if (!agentDraft.sceneVoiceControl) agentDraft.sceneVoiceControl = { enabled: false, allow: [] }
      agentDraft.sceneVoiceControl.enabled = enabledValue === true
    },
  })

  /** 允许语音触发的场景 / 脚本实体清单（v-model 绑定 EntityMultiSelect） */
  const sceneVoiceAllow = computed<string[]>({
    get: () => agentDraft.sceneVoiceControl?.allow ?? [],
    set: (allowListValue) => {
      if (!agentDraft.sceneVoiceControl) agentDraft.sceneVoiceControl = { enabled: false, allow: [] }
      agentDraft.sceneVoiceControl.allow = Array.isArray(allowListValue) ? [...allowListValue] : []
    },
  })

  /** 清单内可被语音触发的数量（供面板统计展示） */
  const sceneVoiceAllowCount = computed(() => sceneVoiceAllow.value.length)

  /** Agent 专属设备白名单（空 = 不额外限制，v-model 绑定 EntityMultiSelect） */
  const deviceAllowlist = computed<string[]>({
    get: () => agentDraft.deviceAllowlist ?? [],
    set: (deviceAllowlistValue) => {
      agentDraft.deviceAllowlist = Array.isArray(deviceAllowlistValue) ? [...deviceAllowlistValue] : []
    },
  })
  const deviceAllowlistCount = computed(() => deviceAllowlist.value.length)

  /** 意图门模式（默认 shadow：只记录不拦截；切 enforce 前先看 /agent/intent/replay） */
  const intentGateMode = computed<IntentGateMode>({
    get: () => normalizeIntentGateMode(agentDraft.intentGate?.mode),
    set: (modeValue) => {
      agentDraft.intentGate = { mode: normalizeIntentGateMode(modeValue) }
    },
  })

  /** 联网搜索开关（默认开启：后两级搜索源无需密钥；关闭后工具直接返回未启用） */
  const webSearchEnabled = computed<boolean>({
    get: () => agentDraft.webSearchEnabled !== false,
    set: (enabledValue) => {
      agentDraft.webSearchEnabled = enabledValue === true
    },
  })

  /**
   * 悬浮伴侣当前值：没动过表单就读布局里的真实值，动过就读草稿。
   * 面板可能先于布局加载挂载（硬刷新 /settings），只读草稿会显示成默认值，
   * 和仪表盘上实际停靠的位置对不上。
   */
  function effectiveCompanion(): AgentCompanionConfig {
    return companionTouched.value ? normalizeAgentCompanion(agentDraft.companion) : readCompanion()
  }

  /** 改一项就把整份配置写回草稿：夹紧规则统一走 normalizeAgentCompanion */
  function patchCompanion(patch: Partial<AgentCompanionConfig>): void {
    companionTouched.value = true
    agentDraft.companion = normalizeAgentCompanion({ ...effectiveCompanion(), ...patch })
  }

  /** 悬浮伴侣开关：写入草稿，保存时随 agentConfig 一起落库 */
  const companionEnabled = computed<boolean>({
    get: () => effectiveCompanion().enabled,
    set: (enabledValue) => patchCompanion({ enabled: enabledValue === true }),
  })

  /** 当前落点（两轴都已归一到 0-100） */
  function effectiveCompanionPosition() {
    return resolveAgentCompanionPosition(effectiveCompanion())
  }

  /** 是否已经拖过 / 自定义过位置（决定设置页是否提示「恢复默认位置」） */
  const companionPositionCustomized = computed(() => {
    const cfg = effectiveCompanion()
    const defaults = getDefaultLayout().agentConfig!.companion!
    return cfg.xPercent !== defaults.xPercent || cfg.yPercent !== defaults.yPercent
  })

  /** 水平位置：改一轴时把另一轴也落成数字，避免只存了一半的自由位置 */
  const companionXPercent = computed<number>({
    get: () => Math.round(effectiveCompanionPosition().xPercent),
    set: (value) =>
      patchCompanion({
        xPercent: Number(value),
        yPercent: effectiveCompanionPosition().yPercent,
      }),
  })

  /** 垂直位置：0% 贴顶、100% 贴底，与仪表盘拖动共用同一坐标 */
  const companionYPercent = computed<number>({
    get: () => Math.round(effectiveCompanionPosition().yPercent),
    set: (value) =>
      patchCompanion({
        xPercent: effectiveCompanionPosition().xPercent,
        yPercent: Number(value),
      }),
  })

  /** 恢复默认位置：左侧 3%、垂直 60% */
  function resetCompanionPosition(): void {
    companionTouched.value = true
    const defaults = getDefaultLayout().agentConfig!.companion!
    agentDraft.companion = {
      enabled: effectiveCompanion().enabled,
      xPercent: defaults.xPercent,
      yPercent: defaults.yPercent,
    }
  }

  function buildAgentPayload() {
    return {
      provider: agentDraft.provider,
      // 「更换」后未输入新密钥时回传脱敏占位，避免空串覆盖服务端明文
      apiKey: editingApiKey.value && !String(agentDraft.apiKey || '').trim() ? AGENT_SECRET_MASK : agentDraft.apiKey,
      apiBase: agentDraft.apiBase,
      model: agentDraft.model,
      language: agentDraft.language,
      // 只用于本地展示「密钥已就绪」，后端保存时会 pop 掉；一起写入是为了避免保存瞬间
      // layoutConfig.agentConfig 少一个字段、被全局快照记成「未保存」。
      apiKeyConfigured: Boolean(String(agentDraft.apiKey || '').trim()) || agentDraft.apiKeyConfigured === true,
      systemPrompt: agentDraft.systemPrompt || '',
      mcpGatewaySecret: agentDraft.mcpGatewaySecret || '',
      mcpActorUserId: agentDraft.mcpActorUserId || '',
      // 场景语音控制：清单原样保留（含总开关关闭时）。
      // 放行与否只看 enabled —— 后端闸门 isSceneVoiceAllowed 已强制要求 enabled===true，
      // 关闭时清单一律无效，因此保留清单不降低安全性，却能避免「误触开关→保存」丢数据。
      sceneVoiceControl: {
        enabled: agentDraft.sceneVoiceControl?.enabled === true,
        allow: (agentDraft.sceneVoiceControl?.allow ?? []).map((id) => String(id ?? '').trim()).filter(Boolean),
      },
      // 主动管家：保留完整频控参数；back-end 默认关闭，只有 enabled===true 才巡检
      proactive: buildProactivePayload(),
      // 联网搜索：默认开启；关闭后 web_search 工具直接返回未启用
      webSearchEnabled: webSearchEnabled.value,
      // 悬浮伴侣：与 agentConfig 同一次保存，避免改完位置又被旧 payload 覆盖
      companion: effectiveCompanion(),
      // Agent 专属设备白名单：空 = 不额外限制；后端与用户 ACL 取交集
      deviceAllowlist: (agentDraft.deviceAllowlist ?? [])
        .map((id) => String(id ?? '').trim())
        .filter(Boolean)
        .slice(0, 200),
      // 意图门：默认 shadow；enforce 会拦截规则型表达的一次性执行
      intentGate: { mode: normalizeIntentGateMode(intentGateMode.value) },
    }
  }

  /** 主动管家 + 看门狗：保存前的夹紧快照（保持 saveConfig 线性） */
  function buildProactivePayload(): AgentProactiveConfig {
    const raw = agentDraft.proactive
    const d = getDefaultLayout().agentConfig!.proactive!
    return {
      enabled: raw?.enabled === true,
      intervalSeconds: clampInt(raw?.intervalSeconds, d.intervalSeconds, 60, 86400),
      cooldownSeconds: clampInt(raw?.cooldownSeconds, d.cooldownSeconds, 60, 86400),
      quietStart: clampInt(raw?.quietStart, d.quietStart, 0, 23),
      quietStartMinute: clampInt(raw?.quietStartMinute, d.quietStartMinute, 0, 59),
      quietEnd: clampInt(raw?.quietEnd, d.quietEnd, 0, 23),
      quietEndMinute: clampInt(raw?.quietEndMinute, d.quietEndMinute, 0, 59),
      // 缺字段时回退真实默认值：旧实现用 `|| 0`，第一次保存就把「最低用电量 1kWh」
      // 静默改成 0（小基数天天误报），把预报时段数也抹平成 0。
      energyMultiplier: Math.max(1, numberOr(raw?.energyMultiplier, d.energyMultiplier)),
      minEnergyKwh: Math.max(0, numberOr(raw?.minEnergyKwh, d.minEnergyKwh)),
      forecastSlots: clampInt(raw?.forecastSlots, d.forecastSlots, 1, 12),
      forecastPopThreshold: clampNumber(raw?.forecastPopThreshold, d.forecastPopThreshold, 0, 1),
      watchdogEnabled: raw?.watchdogEnabled === true,
      motionIdleMinutes: clampInt(raw?.motionIdleMinutes, d.motionIdleMinutes, 1, 1440),
      idleDeviceMinutes: clampInt(raw?.idleDeviceMinutes, d.idleDeviceMinutes, 1, 1440),
      idleSwitchMinutes: clampInt(raw?.idleSwitchMinutes, d.idleSwitchMinutes, 1, 1440),
      autoCloseEnabled: raw?.autoCloseEnabled === true,
      maxAutoCloseDevices: clampInt(raw?.maxAutoCloseDevices, d.maxAutoCloseDevices, 1, 20),
    }
  }

  /** 主动管家草稿：readAgent 已补全默认值，这里只做非空断言供模板 v-model 使用 */
  const proactive = computed(() => {
    if (!agentDraft.proactive) {
      agentDraft.proactive = { ...getDefaultLayout().agentConfig!.proactive! }
    }
    return agentDraft.proactive
  })

  /** 分钟输入 → 秒存储（Vue 模板只负责把 Event 交进来） */
  function setProactiveMinutes(field: 'intervalSeconds' | 'cooldownSeconds', event: Event): void {
    const minutes = Number((event.target as HTMLInputElement).value)
    if (!Number.isFinite(minutes)) return
    proactive.value[field] = Math.min(1440, Math.max(1, minutes)) * 60
  }

  /** 百分比输入 → 0-1 存储 */
  function setProactivePercent(event: Event): void {
    const percent = Number((event.target as HTMLInputElement).value)
    if (!Number.isFinite(percent)) return
    proactive.value.forecastPopThreshold = Math.min(100, Math.max(0, percent)) / 100
  }

  /** 免打扰时间：小时 + 分钟合成 `<input type="time">` 的 HH:MM */
  function quietTimeLabel(kind: 'start' | 'end'): string {
    const hour = kind === 'start' ? proactive.value.quietStart : proactive.value.quietEnd
    const minute = kind === 'start' ? proactive.value.quietStartMinute : proactive.value.quietEndMinute
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
  }

  /** 时间输入 → 小时 + 分钟两个字段（后端按家庭时区判定，分钟粒度必须落库） */
  function setQuietTime(kind: 'start' | 'end', event: Event): void {
    const match = /^(\d{1,2}):(\d{1,2})$/.exec(String((event.target as HTMLInputElement).value || '').trim())
    if (!match) return
    const hour = Math.min(23, Math.max(0, Number(match[1])))
    const minute = Math.min(59, Math.max(0, Number(match[2])))
    if (kind === 'start') {
      proactive.value.quietStart = hour
      proactive.value.quietStartMinute = minute
      return
    }
    proactive.value.quietEnd = hour
    proactive.value.quietEndMinute = minute
  }

  const modelFlowSteps = computed(() => [
    { label: '自然语言', meta: languageLabel.value, icon: Languages, tone: 'in' as const },
    {
      label: '大模型',
      meta: agentDraft.model || providerLabel.value,
      icon: Sparkles,
      tone: 'mid' as const,
    },
    { label: '工具调用', meta: 'HA 实体 · 场景', icon: Wrench, tone: 'amber' as const },
    { label: '智能回复', meta: '多轮追问', icon: MessageCircle, tone: 'out' as const },
  ])

  const chatFlowSteps = computed(() => [
    { label: '自然语言', meta: '输入指令', icon: MessageSquare, tone: 'in' as const },
    { label: '快路径', meta: '缓存 · 温湿度', icon: Zap, tone: 'sky' as const },
    { label: '大模型', meta: chatFlowModelLabel.value, icon: Sparkles, tone: 'mid' as const },
    { label: '执行反馈', meta: '工具 · 播报', icon: CircleCheck, tone: 'out' as const },
  ])

  function applyPreset(providerId?: string | number) {
    const id = String(providerId ?? agentDraft.provider)
    const p = providerPresets.find((x) => x.id === id)
    if (!p || id === 'custom') return
    if (p.apiBase) agentDraft.apiBase = p.apiBase
    if (p.model) agentDraft.model = p.model
  }

  function snapshotBaseline() {
    baseline.value = JSON.stringify({
      agent: clonePlain(agentDraft),
      channels: clonePlain(channelDraft),
    })
  }

  function resetDraft() {
    Object.assign(agentDraft, readAgent())
    companionTouched.value = false
    const ch = readChannels()
    Object.assign(channelDraft.email, ch.email)
    Object.assign(channelDraft.webpush, ch.webpush)
    Object.assign(channelDraft.wecom, ch.wecom)
    editingApiKey.value = false
    showApiKey.value = false
    snapshotBaseline()
    saveTip.value = ''
  }

  async function refreshChannelStatus() {
    statusLoading.value = true
    try {
      channelStatus.value = await channelsStatus()
    } catch {
      channelStatus.value = null
    } finally {
      statusLoading.value = false
    }
  }

  /** 保存成功后的密钥收尾：接口 / MCP 网关都不在内存里留明文。 */
  function maskSavedMcpSecret(): void {
    if (!String(agentDraft.mcpGatewaySecret || '').trim()) return
    agentDraft.mcpGatewaySecret = AGENT_SECRET_MASK
    const saved = layoutStore.layoutConfig.agentConfig
    if (saved) saved.mcpGatewaySecret = AGENT_SECRET_MASK
  }

  async function saveConfig() {
    saving.value = true
    saveTip.value = ''
    try {
      // 布局未加载完成时 layoutConfig 还是默认值：此时保存会把默认的 provider / model
      // 写回服务端（apiKey 虽然会被后端密钥兜底保留，其它字段仍会被静默覆盖）。
      if (!layoutStore.isConfigLoaded) {
        throw new Error('布局尚未加载完成，请稍后再保存')
      }
      layoutStore.layoutConfig.agentConfig = buildAgentPayload()
      layoutStore.layoutConfig.channelConfig = {
        email: { ...channelDraft.email },
        webpush: { ...channelDraft.webpush },
        wecom: { ...channelDraft.wecom },
      }
      const ok = await layoutStore.saveLayout(true)
      if (!ok) throw new Error('保存失败')
      // 保存成功后恢复锁定态：接口不会回传明文，避免误以为「显示」能看到原密钥
      const keyKeptOrSet = Boolean(String(agentDraft.apiKey || '').trim()) || agentDraft.apiKeyConfigured === true
      if (keyKeptOrSet || editingApiKey.value) {
        if (keyKeptOrSet) {
          agentDraft.apiKey = AGENT_SECRET_MASK
          agentDraft.apiKeyConfigured = true
          if (layoutStore.layoutConfig.agentConfig) {
            layoutStore.layoutConfig.agentConfig.apiKey = AGENT_SECRET_MASK
            layoutStore.layoutConfig.agentConfig.apiKeyConfigured = true
          }
        } else {
          agentDraft.apiKey = ''
          agentDraft.apiKeyConfigured = false
        }
        editingApiKey.value = false
        showApiKey.value = false
      }
      // MCP 网关密钥同样不回显明文：保存成功后换成占位符，避免长期留在内存 / DOM 里。
      maskSavedMcpSecret()
      snapshotBaseline()
      saveTipOk.value = true
      saveTip.value = '已保存。大模型与消息通道将自动热更新。'
      chrome.notify('智能管家配置已保存', 'success')
      await Promise.all([refreshPing(), refreshChannelStatus()])
    } catch (e: unknown) {
      saveTipOk.value = false
      const msg = getApiErrorMessage(e, '保存失败')
      saveTip.value = msg
      chrome.notify(msg, 'error')
    } finally {
      saving.value = false
    }
  }

  async function refreshPing() {
    pinging.value = true
    try {
      const info = await agentPing()
      pingInfo.value = info
      if (pending.value > 0) {
        chrome.notify(
          `检测完成：当前生效的仍是上次已保存配置（${info.provider}，${info.ready ? '已就绪' : '未就绪'}）。请先保存表单后再检测。`,
          'warning',
          6000,
        )
      } else if (info.ready) {
        chrome.notify(`智能管家就绪（${info.provider}）`, 'success')
      } else {
        chrome.notify(`智能管家未就绪（${info.provider}）。请确认已保存有效接口密钥后再试。`, 'warning', 6000)
      }
    } catch (e: unknown) {
      pingInfo.value = { ok: false, provider: 'unknown', ready: false }
      chrome.notify(`检测失败：${getApiErrorMessage(e, '请稍后重试')}`, 'error')
    } finally {
      pinging.value = false
    }
  }

  watch(
    () => props.activeTab,
    (tab) => {
      if (tab === 'agent') {
        resetDraft()
      }
    },
  )

  /**
   * 布局加载完成 = 配置真源可用（硬刷新 / 切换显示方案 / 断线后重载）。
   * 面板可能先于 loadConfig 挂载，此时 readAgent() 读到的是默认值；
   * 不重读草稿的话，界面会显示默认配置（保存还会把默认值写回服务端）。
   * 切方案同理：旧方案留下的草稿绝不能跟着存进新方案。
   */
  watch(
    () => layoutStore.isConfigLoaded,
    (loaded) => {
      if (loaded) resetDraft()
    },
    { immediate: true },
  )

  onMounted(() => {
    void refreshPing()
    void refreshChannelStatus()
  })

  /**
   * 未保存确认：layout 表单 + 快捷指令子卡（app config，另一条保存链路）。
   * 只在这里注册一次 —— 子卡自己再按同一个 tab id 注册，两个 watch 会互相覆盖
   * pendingByTab，出现「明明改了却提示没有未保存」。
   */
  useRegisterSettingsTabPending(
    'agent',
    () => pending.value > 0 || agentQuickPromptsDirty.value,
    () => {
      resetDraft()
      agentQuickPromptsRevert.value?.()
    },
  )

  return {
    showApiKey,
    apiKeyLocked,
    beginEditApiKey,
    section,
    subnavSections,
    providerPresets,
    chatQuickPrompts,
    chatEmptyHint,
    agentDraft,
    channelDraft,
    channelStatus,
    statusLoading,
    refreshChannelStatus,
    pending,
    saving,
    saveTip,
    saveTipOk,
    pinging,
    ...chat,
    envHealthHref,
    isMockProvider,
    languageLabel,
    sceneVoiceEnabled,
    companionEnabled,
    companionXPercent,
    companionYPercent,
    companionPositionCustomized,
    resetCompanionPosition,
    sceneVoiceAllow,
    sceneVoiceAllowCount,
    deviceAllowlist,
    deviceAllowlistCount,
    webSearchEnabled,
    intentGateMode,
    proactive,
    setProactiveMinutes,
    setProactivePercent,
    quietTimeLabel,
    setQuietTime,
    toneFromAgentClass,
    modelFlowSteps,
    chatFlowSteps,
    modelStatProvider,
    modelStatReadyLabel,
    modelStatReadyClass,
    modelStatReadyValClass,
    modelStatDetail,
    usageTodayLabel,
    modelUsagePercent,
    applyPreset,
    resetDraft,
    saveConfig,
    refreshPing,
  }
}
