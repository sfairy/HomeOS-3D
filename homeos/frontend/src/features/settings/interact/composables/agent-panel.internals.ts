/** 智能管家设置面板组合式函数（SettingsAgentPanel.vue 逻辑抽取）。 */
import { computed, onMounted, reactive, ref, watch } from 'vue'
import {
  Activity,
  BellRing,
  Bot,
  CalendarClock,
  CircleCheck,
  Languages,
  MessageCircle,
  MessageSquare,
  ScrollText,
  ShieldAlert,
  ShieldCheck,
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
import { useAgentPanelChat } from '@/features/settings/interact/composables/agent-panel-chat.internals'
import { useAgentModelStats } from '@/features/settings/interact/composables/agent-panel-stats.internals'
import type {
  AgentCompanionConfig,
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
} from '@/features/settings/interact/composables/agent-panel-helpers.internals'
import {
  normalizeAgentCompanion,
  resolveAgentCompanionPosition,
  resolveAgentCompanionStageSize,
} from '@/shared/utils/layout/agent-companion.util'

type ChannelDraft = {
  email: NonNullable<ChannelConfig['email']>
  webpush: NonNullable<ChannelConfig['webpush']>
  wecom: NonNullable<ChannelConfig['wecom']>
}

/** 看门狗字段兜底（区间与后端 AgentConfigService 的夹紧保持一致） */
function readWatchdog(
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
  const int = (value: unknown, fallback: number, min: number, max: number) => {
    const n = Number(value)
    return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback
  }
  return {
    watchdogEnabled: raw.watchdogEnabled === true,
    motionIdleMinutes: int(raw.motionIdleMinutes, defaults.motionIdleMinutes, 1, 1440),
    idleDeviceMinutes: int(raw.idleDeviceMinutes, defaults.idleDeviceMinutes, 1, 1440),
    idleSwitchMinutes: int(raw.idleSwitchMinutes, defaults.idleSwitchMinutes, 1, 1440),
    autoCloseEnabled: raw.autoCloseEnabled === true,
    maxAutoCloseDevices: int(raw.maxAutoCloseDevices, defaults.maxAutoCloseDevices, 1, 20),
  }
}


/** 智能管家设置面板：聚合模型配置草稿、通知渠道、管家对话与连通性检测，供 SettingsAgentPanel.vue 使用 */
export function useSettingsAgentPanel(props: { activeTab: string }) {  const layoutStore = useLayoutStore()
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
    { id: 'channels', label: '消息通道', icon: MessageSquare },
    { id: 'chat', label: '对话', icon: MessageCircle },
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

  /** 落点坐标系（整页等比缩放时是壳层尺寸而不是窗口尺寸） */
  function companionViewport() {
    const stage = resolveAgentCompanionStageSize()
    return {
      viewportWidth: stage.width,
      viewportHeight: stage.height,
      panelPosition: layoutStore.layoutConfig?.panelPosition,
      panelWidth: Number(layoutStore.layoutConfig?.rightPanelWidth) || 0,
    }
  }

  /** 当前落点：自由位置优先，旧版停靠配置回退 */
  function effectiveCompanionPosition() {
    return resolveAgentCompanionPosition(effectiveCompanion(), companionViewport())
  }

  /** 是否已经拖过 / 自定义过位置（决定设置页是否提示「恢复默认停靠」） */
  const companionPositionCustomized = computed(() => {
    const cfg = effectiveCompanion()
    return cfg.xPercent != null && cfg.yPercent != null
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

  /** 恢复默认停靠：清掉自由位置，回到左侧 60% 的旧版停靠口径 */
  function resetCompanionPosition(): void {
    companionTouched.value = true
    const defaults = getDefaultLayout().agentConfig!.companion!
    agentDraft.companion = {
      enabled: effectiveCompanion().enabled,
      side: defaults.side,
      topPercent: defaults.topPercent,
    }
  }

  /** 主动管家 + 看门狗：保存前的夹紧快照（保持 saveConfig 线性） */
  function buildProactivePayload(): AgentProactiveConfig {
    const raw = agentDraft.proactive
    const int = (value: unknown, fallback: number, min: number, max: number) => {
      const n = Number(value)
      return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback
    }
    return {
      enabled: raw?.enabled === true,
      intervalSeconds: Math.max(60, Number(raw?.intervalSeconds) || 900),
      cooldownSeconds: Math.max(60, Number(raw?.cooldownSeconds) || 1800),
      quietStart: Math.min(23, Math.max(0, Number(raw?.quietStart) || 0)),
      quietEnd: Math.min(23, Math.max(0, Number(raw?.quietEnd) || 0)),
      energyMultiplier: Math.max(1, Number(raw?.energyMultiplier) || 1.5),
      minEnergyKwh: Math.max(0, Number(raw?.minEnergyKwh) || 0),
      forecastSlots: Math.min(12, Math.max(1, Number(raw?.forecastSlots) || 4)),
      forecastPopThreshold: Math.min(1, Math.max(0, Number(raw?.forecastPopThreshold) || 0.6)),
      watchdogEnabled: raw?.watchdogEnabled === true,
      motionIdleMinutes: int(raw?.motionIdleMinutes, 20, 1, 1440),
      idleDeviceMinutes: int(raw?.idleDeviceMinutes, 60, 1, 1440),
      idleSwitchMinutes: int(raw?.idleSwitchMinutes, 120, 1, 1440),
      autoCloseEnabled: raw?.autoCloseEnabled === true,
      maxAutoCloseDevices: int(raw?.maxAutoCloseDevices, 3, 1, 20),
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

  async function saveConfig() {
    saving.value = true
    saveTip.value = ''
    try {
      // 布局未加载完成时 layoutConfig 还是默认值：此时保存会把默认的 provider / model
      // 写回服务端（apiKey 虽然会被后端密钥兜底保留，其它字段仍会被静默覆盖）。
      if (!layoutStore.isConfigLoaded) {
        throw new Error('布局尚未加载完成，请稍后再保存')
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
        // 只用于本地展示「密钥已就绪」，后端保存时会 pop 掉；一起写入是为了避免保存瞬间
        // layoutConfig.agentConfig 少一个字段、被全局快照记成「未保存」。
        apiKeyConfigured:
          Boolean(String(agentDraft.apiKey || '').trim()) || agentDraft.apiKeyConfigured === true,
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
    modelUsagePercent,
    applyPreset,
    resetDraft,
    saveConfig,
    refreshPing,
  }
}
