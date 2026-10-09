/**
 * 智能管家设置面板组合式函数（SettingsAgentPanel.vue 逻辑抽取）。
 *
 * 职责：
 *   - 管理 AI 模型配置草稿（provider / apiKey / base_url / 模型选择）；
 *   - 提供密钥脱敏判定与「更换密钥」交互；
 *   - 维护通知渠道（邮件 / WebPush / 企微）配置草稿与连通性测试；
 *   - 驱动管家对话（agentChat）与快捷提示、ping 连通性检测；
 *   - 派生统计卡片色调与渠道状态展示。
 * 依赖：
 *   - vue（computed / nextTick / onMounted / reactive / ref / watch）
 *   - @lucide/vue（图标）
 *   - @/composables/voice/useSpeechToText（语音输入）
 *   - @/stores/chrome.store / layout.store
 *   - @/services/api/agent（agentChat / agentPing / channelsStatus）
 *   - @/utils/agent/chat-limit.util（消息长度截断）
 *   - @/utils/registry/settings-route.util（设置路由）
 */
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
import {
  CircleCheck,
  Languages,
  MessageCircle,
  MessageSquare,
  Sparkles,
  Wrench,
  Zap,
} from '@lucide/vue'
import { useSpeechToText } from '@/composables/voice/useSpeechToText'
import { useChromeStore } from '@/stores/chrome.store'
import { useLayoutStore } from '@/stores/layout.store'
import { clonePlain } from '@/utils/core/clone-plain.util'
import { getApiErrorMessage } from '@/utils/core/error-message'
import { getDefaultLayout } from '@/stores/defaults'
import { SETTINGS_ROUTES } from '@/utils/registry/settings-route.util'
import { clipAgentChatMessage, AGENT_CHAT_MAX_LENGTH } from '@/utils/agent/chat-limit.util'
import {
  agentChat,
  agentPing,
  channelsStatus,
  type AgentPingResult,
  type ChannelsStatusResult,
} from '@/services/api/agent'
import type { AgentConfig, ChannelConfig, SceneVoiceControl } from '@/types/layout'

/** 统计卡片色调（与 SettingsFlowStat.vue 的 FlowStatTone 保持对齐） */
type FlowStatTone =
  | 'accent'
  | 'secondary'
  | 'emerald'
  | 'amber'
  | 'sky'
  | 'rose'
  | 'violet'

type ChannelDraft = {
  email: NonNullable<ChannelConfig['email']>
  webpush: NonNullable<ChannelConfig['webpush']>
  wecom: NonNullable<ChannelConfig['wecom']>
}

function mapFlowStatTone(cls: string): FlowStatTone {
  if (cls.includes('emerald') || cls.includes('green')) return 'emerald'
  if (cls.includes('amber') || cls.includes('yellow') || cls.includes('warn')) return 'amber'
  if (cls.includes('rose') || cls.includes('red') || cls.includes('danger')) return 'rose'
  if (cls.includes('violet') || cls.includes('indigo') || cls.includes('purple')) return 'violet'
  if (cls.includes('secondary') || cls.includes('slate') || cls.includes('muted')) return 'secondary'
  if (cls.includes('accent')) return 'accent'
  return 'sky'
}

type ChatLogEntry = {
  role: 'user' | 'assistant'
  text: string
  meta?: string
  outcome?: string
  provider?: string
  totalMs?: number
}

/** GET 脱敏占位符（与后端 CONFIG_MASK_PLACEHOLDER 对齐） */
const AGENT_SECRET_MASK = '••••••••'

/** 是否为脱敏占位（接口不会回传明文密钥） */
function isAgentSecretMasked(val: unknown): boolean {
  const key = String(val ?? '').trim()
  return key === AGENT_SECRET_MASK || key === '********'
}

/** Agent Mock / 演示模式判定（设置页与单测共用） */
function isAgentMockProvider(opts: {
  draftProvider?: string | null
  pingProvider?: string | null
  pingReady?: boolean | null
  apiKey?: string | null
  apiKeyConfigured?: boolean | null
}): boolean {
  if (String(opts.draftProvider || '').toLowerCase() === 'mock') return true
  if (String(opts.pingProvider || '').toLowerCase() === 'mock') return true
  const hasKey =
    opts.apiKeyConfigured === true ||
    (Boolean(String(opts.apiKey || '').trim()) && !isAgentSecretMasked(opts.apiKey))
  if (opts.pingReady === false && !hasKey) return true
  return false
}

const AGENT_PROVIDER_PRESETS = [
  { id: 'deepseek', label: 'DeepSeek', apiBase: 'https://api.deepseek.com', model: 'deepseek-v4-flash' },
  { id: 'doubao', label: '豆包', apiBase: 'https://ark.cn-beijing.volces.com/api/v3', model: '' },
  { id: 'minimax', label: 'MiniMax', apiBase: 'https://api.minimax.chat/v1', model: '' },
  { id: 'qwen', label: '通义千问', apiBase: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: '' },
  { id: 'moonshot', label: 'Moonshot', apiBase: 'https://api.moonshot.cn/v1', model: '' },
  { id: 'custom', label: '自定义', apiBase: '', model: '' },
  { id: 'mock', label: '演示（无密钥）', apiBase: '', model: '' },
]

const AGENT_CHAT_QUICK_PROMPTS = ['打开客厅灯', '现在家里温度多少', '那把它关掉']

/** 智能管家设置面板：聚合模型配置草稿、通知渠道、管家对话与连通性检测，供 SettingsAgentPanel.vue 使用 */
export function useSettingsAgentPanel(props: { activeTab: string }) {
  const layoutStore = useLayoutStore()
  const chrome = useChromeStore()
  const showApiKey = ref(false)
  /** 已配置密钥时默认展示「已加密存储」；点「更换」后进入明文输入 */
  const editingApiKey = ref(false)
  const section = ref('model')
  const subnavSections = [
    { id: 'model', label: '模型配置' },
    { id: 'scene-voice', label: '场景语音' },
    { id: 'channels', label: '消息通道' },
    { id: 'chat', label: '对话' },
  ]

  const providerPresets = AGENT_PROVIDER_PRESETS
  const chatQuickPrompts = AGENT_CHAT_QUICK_PROMPTS

  function emptyAgent(): AgentConfig {
    return { ...getDefaultLayout().agentConfig! }
  }

  /** 场景语音控制草稿：字段缺失或格式非法时回退为「全禁 + 空清单」 */
  function readSceneVoiceControl(): SceneVoiceControl {
    const raw = layoutStore.layoutConfig?.agentConfig?.sceneVoiceControl
    if (!raw || typeof raw !== 'object') return { enabled: false, allow: [] }
    const allow = Array.isArray(raw.allow)
      ? raw.allow.map((id) => String(id ?? '').trim()).filter(Boolean)
      : []
    return { enabled: raw.enabled === true, allow }
  }

  function readAgent(): AgentConfig {
    return {
      ...emptyAgent(),
      ...(layoutStore.layoutConfig?.agentConfig || {}),
      sceneVoiceControl: readSceneVoiceControl(),
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
    () =>
      !editingApiKey.value &&
      (agentDraft.apiKeyConfigured === true || isAgentSecretMasked(agentDraft.apiKey)),
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

  const chatSessionId = ref(`settings-agent-${Date.now().toString(36)}`)
  const chatInput = ref('')
  const chatting = ref(false)
  const chatLog = ref<ChatLogEntry[]>([])
  const chatLogEl = ref<HTMLElement | null>(null)

  function scrollChatToBottom() {
    void nextTick(() => {
      const el = chatLogEl.value
      if (!el) return
      el.scrollTop = el.scrollHeight
    })
  }

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
    set: (val) => {
      if (!agentDraft.sceneVoiceControl) agentDraft.sceneVoiceControl = { enabled: false, allow: [] }
      agentDraft.sceneVoiceControl.enabled = val === true
    },
  })

  /** 允许语音触发的场景 / 脚本实体清单（v-model 绑定 EntityMultiSelect） */
  const sceneVoiceAllow = computed<string[]>({
    get: () => agentDraft.sceneVoiceControl?.allow ?? [],
    set: (val) => {
      if (!agentDraft.sceneVoiceControl) agentDraft.sceneVoiceControl = { enabled: false, allow: [] }
      agentDraft.sceneVoiceControl.allow = Array.isArray(val) ? [...val] : []
    },
  })

  /** 清单内可被语音触发的数量（供面板统计展示） */
  const sceneVoiceAllowCount = computed(() => sceneVoiceAllow.value.length)

  type FlowTone = FlowStatTone

  function toneFromAgentClass(cls: string): FlowTone {
    if (cls.includes('emerald')) return 'emerald'
    if (cls.includes('amber')) return 'amber'
    if (cls.includes('violet') || cls.includes('indigo') || cls.includes('purple')) return 'violet'
    if (cls.includes('rose') || cls.includes('danger')) return 'rose'
    if (cls.includes('accent')) return 'sky'
    if (cls.includes('secondary') || cls.includes('slate')) return 'secondary'
    return mapFlowStatTone(cls)
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

  const modelStatProvider = computed(() => {
    if (pending.value > 0) return providerLabel.value
    return pingInfo.value?.provider ?? providerLabel.value
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

  const chatFlowModelLabel = computed(() => agentDraft.model || providerLabel.value)

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

  function chatOutcomeLabel(outcome: string) {
    if (outcome === 'success') return '已执行'
    if (outcome === 'answer') return '已回复'
    if (outcome === 'blocked') return '已拦截'
    if (outcome === 'failed') return '失败'
    if (outcome === 'error') return '错误'
    return outcome
  }

  function chatOutcomeTone(outcome?: string) {
    if (outcome === 'success' || outcome === 'answer') return 'emerald'
    if (outcome === 'blocked') return 'amber'
    if (outcome === 'failed' || outcome === 'error') return 'rose'
    return 'sky'
  }

  function sendQuickPrompt(prompt: string) {
    if (chatting.value || isMockProvider.value) return
    chatInput.value = prompt
    void sendChat()
  }

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

  async function saveConfig() {
    saving.value = true
    saveTip.value = ''
    try {
      if (!layoutStore.layoutConfig) {
        throw new Error('布局未加载，请稍后重试')
      }
      layoutStore.layoutConfig.agentConfig = {
        provider: agentDraft.provider,
        // 「更换」后未输入新密钥时回传脱敏占位，避免空串覆盖服务端明文
        apiKey:
          editingApiKey.value && !String(agentDraft.apiKey || '').trim()
            ? AGENT_SECRET_MASK
            : agentDraft.apiKey,
        apiBase: agentDraft.apiBase,
        model: agentDraft.model,
        language: agentDraft.language,
        systemPrompt: agentDraft.systemPrompt || '',
        mcpGatewaySecret: agentDraft.mcpGatewaySecret || '',
        mcpActorUserId: agentDraft.mcpActorUserId || '',
        // 场景语音控制：清单原样保留（含总开关关闭时）。
        // 放行与否只看 enabled —— 后端闸门 isSceneVoiceAllowed 已强制要求 enabled===true，
        // 关闭时清单一律无效，因此保留清单不降低安全性，却能避免「误触开关→保存」丢数据。
        sceneVoiceControl: {
          enabled: agentDraft.sceneVoiceControl?.enabled === true,
          allow: (agentDraft.sceneVoiceControl?.allow ?? [])
            .map((id) => String(id ?? '').trim())
            .filter(Boolean),
        },
      }
      layoutStore.layoutConfig.channelConfig = {
        email: { ...channelDraft.email },
        webpush: { ...channelDraft.webpush },
        wecom: { ...channelDraft.wecom },
      }
      const ok = await layoutStore.saveLayout(true)
      if (!ok) throw new Error('保存失败')
      // 保存成功后恢复锁定态：接口不会回传明文，避免误以为「显示」能看到原密钥
      const keyKeptOrSet =
        Boolean(String(agentDraft.apiKey || '').trim()) || agentDraft.apiKeyConfigured === true
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
        chrome.notify(
          `智能管家未就绪（${info.provider}）。请确认已保存有效接口密钥后再试。`,
          'warning',
          6000,
        )
      }
    } catch (e: unknown) {
      pingInfo.value = { ok: false, provider: 'unknown', ready: false }
      chrome.notify(`检测失败：${getApiErrorMessage(e, '请稍后重试')}`, 'error')
    } finally {
      pinging.value = false
    }
  }

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

  watch(
    () => props.activeTab,
    (tab) => {
      if (tab === 'agent') {
        resetDraft()
      }
    },
  )

  onMounted(() => {
    resetDraft()
    void refreshPing()
    void refreshChannelStatus()
  })

  return {
    showApiKey,
    apiKeyLocked,
    beginEditApiKey,
    section,
    subnavSections,
    providerPresets,
    chatQuickPrompts,
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
    chatInput,
    chatting,
    AGENT_CHAT_MAX_LENGTH,
    chatLog,
    chatLogEl,
    envHealthHref,
    isMockProvider,
    languageLabel,
    sceneVoiceEnabled,
    sceneVoiceAllow,
    sceneVoiceAllowCount,
    toneFromAgentClass,
    modelFlowSteps,
    chatFlowSteps,
    modelStatProvider,
    modelStatReadyLabel,
    modelStatReadyClass,
    modelStatReadyValClass,
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
    applyPreset,
    resetDraft,
    saveConfig,
    refreshPing,
    sendChat,
    voiceListening,
    voiceTranscribing,
    voiceError,
    toggleVoiceListen,
    chatPlaceholder,
  }
}
