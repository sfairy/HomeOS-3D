/** 智能管家设置面板组合式函数（SettingsAgentPanel.vue 逻辑抽取）。 */
import { computed, onMounted, reactive, ref, watch } from 'vue'
import {
  CircleCheck,
  Languages,
  MessageCircle,
  MessageSquare,
  Sparkles,
  Wrench,
  Zap,
} from '@lucide/vue'
import { useChromeStore } from '@/stores/chrome.store'
import { useLayoutStore } from '@/stores/layout.store'
import { clonePlain } from '@/shared/utils/core/clone-plain.util'
import { getApiErrorMessage } from '@/shared/utils/core/error-message'
import { getDefaultLayout } from '@/stores/defaults'
import { SETTINGS_ROUTES } from '@/shared/utils/registry/settings-route.util'
import {
  agentPing,
  channelsStatus,
  type AgentPingResult,
  type ChannelsStatusResult,
} from '@/services/api/agent'
import { useAgentPanelChat } from '@/features/settings/composables/interact/agent-panel-chat.internals'
import { useAgentModelStats } from '@/features/settings/composables/interact/agent-panel-stats.internals'
import type {
  AgentConfig,
  AgentProactiveConfig,
  ChannelConfig,
  SceneVoiceControl,
} from '@/shared/types/layout'
import {
  AGENT_CHAT_QUICK_PROMPTS,
  AGENT_PROVIDER_PRESETS,
  AGENT_SECRET_MASK,
  isAgentMockProvider,
  isAgentSecretMasked,
  toneFromAgentClass,
} from '@/features/settings/composables/interact/agent-panel-helpers.internals'

type ChannelDraft = {
  email: NonNullable<ChannelConfig['email']>
  webpush: NonNullable<ChannelConfig['webpush']>
  wecom: NonNullable<ChannelConfig['wecom']>
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
    { id: 'model', label: '模型配置' },
    { id: 'scene-voice', label: '场景语音' },
    { id: 'device-scope', label: '设备范围' },
    { id: 'proactive', label: '主动管家' },
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

  /** 主动管家草稿：嵌套字段逐个兜底，避免旧布局缺字段导致 NaN */
  function readProactive(): AgentProactiveConfig {
    const d = getDefaultLayout().agentConfig!.proactive!
    const raw = layoutStore.layoutConfig?.agentConfig?.proactive
    if (!raw || typeof raw !== 'object') return { ...d }
    const num = (value: unknown, fallback: number) => {
      const n = Number(value)
      return Number.isFinite(n) ? n : fallback
    }
    return {
      enabled: raw.enabled === true,
      intervalSeconds: Math.max(60, num(raw.intervalSeconds, d.intervalSeconds)),
      cooldownSeconds: Math.max(60, num(raw.cooldownSeconds, d.cooldownSeconds)),
      quietStart: Math.min(23, Math.max(0, num(raw.quietStart, d.quietStart))),
      quietEnd: Math.min(23, Math.max(0, num(raw.quietEnd, d.quietEnd))),
      energyMultiplier: Math.max(1, num(raw.energyMultiplier, d.energyMultiplier)),
      minEnergyKwh: Math.max(0, num(raw.minEnergyKwh, d.minEnergyKwh)),
      forecastSlots: Math.min(12, Math.max(1, num(raw.forecastSlots, d.forecastSlots))),
      forecastPopThreshold: Math.min(
        1,
        Math.max(0, num(raw.forecastPopThreshold, d.forecastPopThreshold)),
      ),
    }
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

  /** Agent 专属设备白名单（空 = 不额外限制，v-model 绑定 EntityMultiSelect） */
  const deviceAllowlist = computed<string[]>({
    get: () => agentDraft.deviceAllowlist ?? [],
    set: (val) => {
      agentDraft.deviceAllowlist = Array.isArray(val) ? [...val] : []
    },
  })
  const deviceAllowlistCount = computed(() => deviceAllowlist.value.length)

  /** 主动管家草稿：readAgent 已补全默认值，这里只做非空断言供模板 v-model 使用 */
  const proactive = computed(() => {
    if (!agentDraft.proactive) {
      agentDraft.proactive = { ...getDefaultLayout().agentConfig!.proactive! }
    }
    return agentDraft.proactive
  })

  /** 分钟输入 → 秒存储（Vue 模板只负责把 Event 交进来） */
  function setProactiveMinutes(
    field: 'intervalSeconds' | 'cooldownSeconds',
    event: Event,
  ): void {
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
        // 主动管家：保留完整频控参数；back-end 默认关闭，只有 enabled===true 才巡检
        proactive: {
          enabled: agentDraft.proactive?.enabled === true,
          intervalSeconds: Math.max(60, Number(agentDraft.proactive?.intervalSeconds) || 900),
          cooldownSeconds: Math.max(60, Number(agentDraft.proactive?.cooldownSeconds) || 1800),
          quietStart: Math.min(23, Math.max(0, Number(agentDraft.proactive?.quietStart) || 0)),
          quietEnd: Math.min(23, Math.max(0, Number(agentDraft.proactive?.quietEnd) || 0)),
          energyMultiplier: Math.max(1, Number(agentDraft.proactive?.energyMultiplier) || 1.5),
          minEnergyKwh: Math.max(0, Number(agentDraft.proactive?.minEnergyKwh) || 0),
          forecastSlots: Math.min(12, Math.max(1, Number(agentDraft.proactive?.forecastSlots) || 4)),
          forecastPopThreshold: Math.min(
            1,
            Math.max(0, Number(agentDraft.proactive?.forecastPopThreshold) || 0.6),
          ),
        },
        // Agent 专属设备白名单：空 = 不额外限制；后端与用户 ACL 取交集
        deviceAllowlist: (agentDraft.deviceAllowlist ?? [])
          .map((id) => String(id ?? '').trim())
          .filter(Boolean)
          .slice(0, 200),
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
    ...chat,
    envHealthHref,
    isMockProvider,
    languageLabel,
    sceneVoiceEnabled,
    sceneVoiceAllow,
    sceneVoiceAllowCount,
    deviceAllowlist,
    deviceAllowlistCount,
    proactive,
    setProactiveMinutes,
    setProactivePercent,
    toneFromAgentClass,
    modelFlowSteps,
    chatFlowSteps,
    modelStatProvider,
    modelStatReadyLabel,
    modelStatReadyClass,
    modelStatReadyValClass,
    modelStatDetail,
    usageTodayLabel,
    applyPreset,
    resetDraft,
    saveConfig,
    refreshPing,
  }
}
