import { AGENT_QUICK_PROMPTS, normalizeAgentQuickPrompts, type AgentQuickPrompt } from '@/kernel/index'
import { configEpoch, getConfigSection } from '@/kernel/config/frontend-config'

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
type AgentChatStoredAttachment = {
  kind: 'image'
  url: string
  entityId?: string
  name?: string
}

/** 可序列化的一条消息：只保留历史回放需要的字段 */
type AgentChatStoredMessage = {
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
const AGENT_CHAT_HISTORY_MESSAGE_LIMIT = 40

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

/** 智能体聊天消息长度限制 */

/** 与后端 ChatDto @MaxLength(500) 对齐 */
export const AGENT_CHAT_MAX_LENGTH = 500

/**
 * 裁剪聊天消息到最大长度。
 *
 * @param text 原始输入文本（可能为空 / null）
 * @returns 去除首尾空白后截断到 AGENT_CHAT_MAX_LENGTH 的字符串
 */
export function clipAgentChatMessage(text: string): string {
  return String(text || '')
    .trim()
    .slice(0, AGENT_CHAT_MAX_LENGTH)
}

/**
 * 管家顶栏「当前是谁在回话」的展示口径（纯函数，无副作用）。
 *
 * 这个标签必须和设置页「当前生效」同源：只认 `/agent/ping` 回来的 provider + model，
 * 也就是后端**真正在用**的那套配置。早先这里写死 `DeepSeek-V3`，用户把模型换成
 * `deepseek-v4-flash` 之后界面还在报一个后端根本没在用的型号，属于自说自话。
 *
 * 未探测到 / 探测失败时如实说「未连接」，不要拿一个好看的默认值糊过去。
 */

/** provider id → 人读名；与设置页 `AGENT_PROVIDER_PRESETS` 的 id 一一对应 */
export const AGENT_PROVIDER_LABELS: Record<string, string> = {
  deepseek: 'DeepSeek',
  doubao: '豆包',
  minimax: 'MiniMax',
  qwen: '通义千问',
  moonshot: 'Moonshot',
  openai: 'OpenAI',
  custom: '自定义',
}

/** `/agent/ping` 里本模块用到的字段（结构化声明，避免 shared 反向依赖 services） */
interface AgentModelSource {
  ok?: boolean
  provider?: string
  model?: string
  ready?: boolean
}

/** 厂商展示名；未登记的 id 原样返回，不猜厂商 */
export function agentProviderLabel(provider?: string | null): string {
  const raw = String(provider || '').trim()
  if (!raw) return ''
  return AGENT_PROVIDER_LABELS[raw.toLowerCase()] || raw
}

/**
 * 顶栏第二行的文案。
 *
 * @param ping `/agent/ping` 结果；为 `null` 表示还没探测过
 * @returns 后台设置里的模型名；退化成厂商名 / 状态词，绝不写死型号
 */
export function agentModelLabel(ping?: AgentModelSource | null): string {
  if (!ping) return ''
  const provider = String(ping.provider || '').trim()
  const model = String(ping.model || '').trim()
  const id = provider.toLowerCase()
  // 探测请求本身失败时面板塞的是占位值 provider='unknown'，不能当模型名显示
  if (ping.ok === false || id === 'unknown') return '未连接'
  // 演示模式没有真实模型，model 天然是空串
  if (id === 'mock') return '演示模式'
  if (id === 'unavailable') return '未配置模型'
  // model 才是「设置里填的那个值」；没填就退回厂商名
  return model || agentProviderLabel(provider) || provider
}

/**
 * 读取当前生效的智能管家快捷指令（`ui.agentQuickPrompts`）。
 *
 * 为什么单独一个 util 而不是直接写下组件里：
 * - 主页对话面板与「设置 → 智能管家 → 对话」两处都要渲染这排按钮，各自解析配置
 *   迟早会出现两套不同的兜底规则；
 * - 「字段缺省」与「显式清空」必须是两种行为：缺省回落到内置默认，`[]` 才是
 *   「用户不要快捷入口」。这条语义只在这里实现一次。
 *
 * 返回的数组里每一项都是纯数据，可以在 `computed` 里直接当快照用。
 */

/**
 * 当前生效的快捷指令。
 *
 * 内部读了一次 `configEpoch`：配置热更新（保存后 `reloadFrontendConfig`、
 * WS 推送配置变更）会递增它，在 `computed` / 模板里调用本函数即可自动重算，
 * 不需要额外订阅。
 */
export function readAgentQuickPrompts(): AgentQuickPrompt[] {
  void configEpoch.value
  const configured = normalizeAgentQuickPrompts(getConfigSection('ui')?.agentQuickPrompts)
  // 缺省（null）才用内置默认；用户显式存了空数组就是「关掉这排按钮」
  return configured ?? AGENT_QUICK_PROMPTS.map((item) => ({ ...item }))
}

/**
 * chips 的悬浮提示：提示语是可选的（用户自定义时常省略），别拼出「｜发送…」这种孤立分隔符。
 * 放在这里是因为主页面板与设置页共用同一套按钮。
 */
export function quickPromptTitle(item: AgentQuickPrompt): string {
  const sent = `发送「${item.prompt}」`
  return item.hint ? `${item.hint}｜${sent}` : sent
}

/** 读屏文案：有 hint 才补括号说明，否则读出来就是「全关所有灯（）」 */
export function quickPromptAria(item: AgentQuickPrompt): string {
  return item.hint ? `${item.label}（${item.hint}）` : item.label
}

/**
 * 对话气泡的正文清洗与指标格式化（纯函数，无副作用）。
 *
 * 气泡是纯文本内插、不渲染富文本（与源码面板同一口径），但模型习惯写
 * `**加粗**` / `__下划线__` / 反引号代码；原样显示会把标记符号露出来。
 * 这里只去标记、不丢文字。
 */
export function agentReplyText(text: string): string {
  return String(text ?? '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
}

/**
 * 耗时角标：过千毫秒换秒，避免 `3139ms` 这种四位数字挤在气泡角落。
 * 精确值留在悬浮提示（`:title`）里，不丢信息。
 */
export function agentDurationLabel(ms: number | undefined): string {
  const value = Number(ms)
  if (!Number.isFinite(value) || value <= 0) return ''
  if (value < 1000) return `${Math.round(value)}ms`
  const seconds = value / 1000
  return `${seconds < 10 ? seconds.toFixed(1) : Math.round(seconds)}s`
}

/** 角标的悬浮提示：角标本身是 `3.1s · 117t` 的压缩写法，精确值放这里 */
export function agentFootTitle(ms: number, tokens: number): string {
  return `耗时 ${ms}ms${tokens ? ` · 生成 ${tokens} tokens` : ''}`
}

/**
 * 工具轨迹的中文短标签。
 *
 * 气泡里只该给人看「管家做了什么」，而不是 `get_home_status` 这类内部函数名 ——
 * 原名对用户没有意义，还会让回复看起来像调试输出。未收录的工具（第三方 MCP、
 * 后续新增但没来得及补标签的）回落成「去下划线的原名」，至少不露出蛇形命名。
 */

/** 工具名 → 中文短标签；与后端 `home_tools_schemas.py` 的工具名一一对应 */
const TOOL_LABELS: Record<string, string> = {
  search_entities: '搜索设备',
  get_entity_state: '设备状态',
  control_device: '控制设备',
  list_areas: '房间列表',
  get_area_snapshot: '房间快照',
  control_room: '房间控制',
  activate_scene: '执行场景',
  list_scenes: '场景列表',
  activate_home_mode: '切换模式',
  list_home_modes: '模式列表',
  get_home_status: '全屋状态',
  get_weather: '天气',
  get_weather_forecast: '天气预报',
  get_calendar: '日程',
  get_notifications: '通知',
  get_energy_usage: '能耗',
  query_events: '事件查询',
  query_device_timeline: '设备轨迹',
  query_system_logs: '系统日志',
  query_camera: '摄像头',
  set_light_brightness: '灯光亮度',
  set_cover_position: '窗帘位置',
  media_control: '媒体控制',
  run_proactive_patrol: '主动巡检',
  schedule_task: '创建计划',
  list_scheduled_tasks: '计划列表',
  cancel_scheduled_task: '取消计划',
  manage_user_policy: '用户规则',
  send_notification: '发送通知',
  manage_todo: '待办清单',
  manage_calendar: '日历事件',
  manage_memory: '长期记忆',
  web_search: '联网搜索',
}

/** 单个工具名的展示文案（空名返回空串，调用方据此不渲染） */
function toolLabel(name: string): string {
  const key = String(name || '').trim()
  if (!key) return ''
  return TOOL_LABELS[key] || key.replace(/_/g, ' ')
}

/**
 * 把气泡里保存的 `a → b` 轨迹串拆成标签数组。
 *
 * 轨迹串是历史会话的持久化格式（见 `ChatMessage.tools`），这里只做展示层拆解，
 * 不去改动存储形态；重复项保持首次出现的位置，避免同一轮里工具多次调用刷屏。
 */
export function toolLabels(trace: string | undefined): string[] {
  const seen = new Set<string>()
  for (const name of String(trace || '').split('→')) {
    const label = toolLabel(name)
    if (label) seen.add(label)
  }
  return [...seen]
}
