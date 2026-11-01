<!--
  AgentChatPalette — HomeOS 智能管家面板（对照源码 HomeOSSidebarAgentPanel 移植）

  形态：整栏停靠（贴侧边、整高、20px 圆角 + 七彩 conic 光边），不再是居中弹窗。
  - 宽屏：停靠在信息栏同侧（layout.panelPosition，默认右侧），宽度 300~360px；
  - 窄屏：铺满可用宽度，与源码手机端一致。
  交互：顶栏 / 悬浮伴侣双击唤起；Esc 收起；不再用遮罩挡页面，点面板外不会误关。

  与参考实现的差异（本项目为超集，保留不删）：SSE 流式出字、工具轨迹、本地历史会话、
  浏览器 / HA 语音输入、安全拦截提示与「去配置管家」引导。
-->
<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  ArrowLeft,
  History,
  Keyboard,
  Mic,
  Send,
  ShieldAlert,
  Square,
  Trash2,
} from '@lucide/vue'
import {
  agentChatStream,
  agentPing,
  type AgentChatResult,
  type AgentPingResult,
  type AgentStreamHandle,
} from '@/services/api/agent'
import { getApiErrorMessage } from '@/shared/utils/core/error-message'
import { getConfigSection } from '@/shared/utils/config/frontend-config'
import { SETTINGS_ROUTES } from '@/shared/utils/registry/settings-route.util'
import { useChromeStore } from '@/stores/chrome.store'
import { useFocusTrap } from '@/composables/ui/useFocusTrap'
import { useSpeechToText } from '@/composables/voice/useSpeechToText'
import { useAgentSpeech } from '@/composables/voice/useAgentSpeech'
import { playEarcon } from '@/composables/voice/useEarcon'
import { isEmbeddedBrowser, probeMicrophone } from '@/composables/voice/useAudioDevices'
import { clipAgentChatMessage, AGENT_CHAT_MAX_LENGTH } from '@/shared/agent/utils/chat-limit.util'
import {
  quickPromptAria,
  quickPromptTitle,
  readAgentQuickPrompts,
} from '@/shared/agent/utils/quick-prompts.util'
import AgentMechaAvatar from '@/components/shell/agent-companion/AgentMechaAvatar.vue'
import AgentVoiceHoldBar from './AgentVoiceHoldBar.vue'

type ChatRole = 'user' | 'assistant'
type ChatMessage = {
  role: ChatRole
  text: string
  tools?: string
  /** 后端执行结论（success / answer / blocked / failed / error），用于安全拦截提示 */
  outcome?: string
  /** 流式生成中：文本持续追加，不展示拦截提示 */
  streaming?: boolean
  /** 本轮总耗时（ms）与 completion token，对应源码气泡右侧的 assistant-meta */
  ms?: number
  tokens?: number
}

/** 本地历史会话（按设备浏览器保存，最多保留最近 8 段） */
type StoredSession = {
  id: string
  updatedAt: number
  title: string
  messages: ChatMessage[]
}

const HISTORY_KEY = 'homeos.agent.chat.history.v1'
const HISTORY_LIMIT = 8
const HISTORY_MESSAGE_LIMIT = 40

function readHistory(): StoredSession[] {
  if (typeof window === 'undefined') return []
  try {
    // 历史含对话正文：用 sessionStorage 限本标签页生命周期，关闭标签页即清除，
    // 避免共享设备上长期留明文记录。
    const raw = window.sessionStorage.getItem(HISTORY_KEY)
    const parsed = raw ? JSON.parse(raw) : null
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((item): StoredSession | null => {
        if (!item || typeof item !== 'object') return null
        const id = String((item as StoredSession).id || '').trim()
        const title = String((item as StoredSession).title || '').trim()
        const messages = Array.isArray((item as StoredSession).messages)
          ? ((item as StoredSession).messages as ChatMessage[])
              .filter((message) => message && (message.role === 'user' || message.role === 'assistant') && String(message.text || '').trim())
              .map((message) => ({
                role: message.role,
                text: String(message.text),
                tools: message.tools ? String(message.tools) : undefined,
                outcome: message.outcome ? String(message.outcome) : undefined,
              }))
          : []
        if (!id || !messages.length) return null
        return {
          id,
          title: title || messages.find((message) => message.role === 'user')?.text.slice(0, 24) || '对话',
          updatedAt: Number((item as StoredSession).updatedAt) || Date.now(),
          messages,
        }
      })
      .filter((item): item is StoredSession => item !== null)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, HISTORY_LIMIT)
  } catch {
    return []
  }
}

function writeHistory(sessions: StoredSession[]): void {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(HISTORY_KEY, JSON.stringify(sessions.slice(0, HISTORY_LIMIT)))
  } catch {
    // 隐私模式 / 配额用尽：历史只保留在内存
  }
}

/** 安全拦截提示文案：管线判定为 blocked 时明确告知用户操作被安全策略拦截 */
const BLOCKED_NOTICE = '出于安全考虑，这个操作被拦截了。'

/** 聊天面板无操作多久自动让位回信息栏 —— 与参考实现 RightSidebar 的 30s 同口径 */
const IDLE_RETURN_MS = 30_000
/** 空闲检查间隔：低频轮询代替每次 pointermove 重置定时器，避免高频抖动 */
const IDLE_CHECK_MS = 5_000

const props = defineProps({
  open: { type: Boolean, default: false },
  /** 停靠进右侧信息栏（与参考实现一致）：此时不再自己全屏定位，而是填满栏内容器 */
  docked: { type: Boolean, default: false },
})
const emit = defineEmits(['close'])

const router = useRouter()
// 对话面板只「消费」悬浮伴侣留下的一条待发送消息，不负责打开/关闭自己
const chrome = useChromeStore()
const storedSessions = readHistory()
const sessionId = ref(storedSessions[0]?.id || `ui-agent-${Date.now().toString(36)}`)
const input = ref('')
const busy = ref(false)
/**
 * 语音输入形态：true = 按住说话（圆环 + HUD），false = 键盘输入。
 * 默认键盘 —— 桌面端以打字为主，与源码 MobileAgentChatSheet 的 `d=true` 初值一致。
 */
const voiceMode = ref(false)
/** 本轮语音已被上滑取消：识别结果回来时丢弃，不落进输入框也不发送 */
const discardVoice = ref(false)
const messages = ref<ChatMessage[]>(storedSessions[0]?.messages ?? [])
const sessions = ref<StoredSession[]>(storedSessions)
const historyOpen = ref(false)
const inputRef = ref<HTMLInputElement | null>(null)
const rootRef = ref<HTMLElement | null>(null)
const logRef = ref<HTMLElement | null>(null)
const ping = ref<AgentPingResult | null>(null)
const pinging = ref(false)
const micHint = ref('')
/** 当前进行中的流式请求句柄：关闭弹层 / 新对话 / 手动停止时用于取消 */
let streamHandle: AgentStreamHandle | null = null
const { speak, speakReply } = useAgentSpeech()

/** 快捷指令：来自 `ui.agentQuickPrompts`（设置页可改），清空则整行不渲染 */
const quickPrompts = computed(() => readAgentQuickPrompts())

const agentBlocked = computed(() => {
  if (pinging.value && !ping.value) return true
  if (!ping.value) return false
  const provider = String(ping.value.provider || '').toLowerCase()
  return provider === 'mock' || provider === 'unavailable' || ping.value.ready === false
})

/** 等首 token 的阶段才显示「处理中」气泡；已开始逐字输出后由流式气泡本身承载 */
const showTyping = computed(
  () => busy.value && !messages.value.some((message) => message.streaming && message.text.trim()),
)

/**
 * 管家动态状态：与源码面板顶栏同一口径 —— 聆听 / 响应优先，其余显示模型供应商。
 * 供应商取 `/agent/ping` 的 provider（源码同样直接展示该值，未配置时就是 `mock`）。
 */
const headerStatus = computed(() => {
  if (listening.value) return '正在聆听...'
  if (busy.value) return '正在响应...'
  return String(ping.value?.provider || 'DeepSeek-V3')
})

/** 状态点色调：正常=绿 / 录入=琥珀 / 未就绪=玫瑰 / 检测中=天蓝，与源码 pulse-dot 同语义 */
const headerTone = computed(() => {
  if (agentBlocked.value) return 'rose'
  if (listening.value) return 'amber'
  if (pinging.value && !ping.value) return 'sky'
  return 'emerald'
})

const { listening, transcribing, error: voiceError, status: voiceStatus, startListen, stopListen } =
  useSpeechToText({
    preferHa: true,
    onInterim: (text) => {
      input.value = clipAgentChatMessage(text)
    },
    onFinal: (text) => {
      // 上滑取消后识别结果仍会回来（录音已上传），这里丢弃即可，不必让用户看见
      if (discardVoice.value) {
        discardVoice.value = false
        input.value = ''
        return
      }
      if (agentBlocked.value) return
      input.value = clipAgentChatMessage(text)
      void send(input.value)
    },
  })

const openRef = ref(props.open)
watch(
  () => props.open,
  (open) => {
    openRef.value = open
    if (open) {
      touchActivity()
      startIdleWatch()
      void refreshAgentStatus()
      void refreshMicHint()
      nextTick(() => inputRef.value?.focus())
      scrollLogToBottom()
      return
    }
    stopIdleWatch()
    stopListen()
  },
)
// 悬浮伴侣长按说话后留下的消息：取一条发一条，发完立刻清空，
// 保证「面板被别处打开」时不会莫名冒出一条旧语音。
watch(
  () => chrome.pendingAgentPrompt,
  (text) => {
    if (!text) return
    chrome.clearAgentPrompt()
    void nextTick(() => send(text))
  },
)
useFocusTrap(rootRef, openRef)
onBeforeUnmount(stopIdleWatch)

/* ------------------------------------------------------- 空闲让位（参考实现 30s） */

let idleTimer: ReturnType<typeof setInterval> | null = null
let lastActivityAt = Date.now()

/** 记录一次用户操作，重置空闲计时 */
function touchActivity(): void {
  lastActivityAt = Date.now()
}

function stopIdleWatch(): void {
  if (idleTimer) clearInterval(idleTimer)
  idleTimer = null
}

function startIdleWatch(): void {
  stopIdleWatch()
  lastActivityAt = Date.now()
  idleTimer = setInterval(() => {
    // 出字 / 听话期间不算空闲：长回复不能被拦腰收走
    if (busy.value || listening.value || transcribing.value) {
      lastActivityAt = Date.now()
      return
    }
    if (Date.now() - lastActivityAt >= IDLE_RETURN_MS) close()
  }, IDLE_CHECK_MS)
}

async function refreshAgentStatus() {
  pinging.value = true
  try {
    ping.value = await agentPing()
  } catch {
    ping.value = { ok: false, provider: 'unknown', ready: false }
  } finally {
    pinging.value = false
  }
}

async function refreshMicHint() {
  if (typeof window !== 'undefined' && !window.isSecureContext) {
    micHint.value = '当前不是 HTTPS / localhost，浏览器会拦截麦克风'
    return
  }
  if (isEmbeddedBrowser()) {
    micHint.value = '当前像是编辑器预览，语音请用 Chrome 或 Edge 打开本站'
    return
  }
  try {
    const probe = await probeMicrophone()
    micHint.value =
      probe.inputCount === 0
        ? '浏览器看不到麦克风，请到「设置 → 系统 → 声音」启用输入设备'
        : ''
  } catch {
    micHint.value = ''
  }
}

function persistCurrent() {
  const snapshot = messages.value
    .filter((message) => !message.streaming && String(message.text || '').trim())
    .slice(-HISTORY_MESSAGE_LIMIT)
    .map((message) => ({
      role: message.role,
      text: message.text,
      tools: message.tools,
      outcome: message.outcome,
    }))
  if (!snapshot.length) return
  const title = snapshot.find((message) => message.role === 'user')?.text.slice(0, 24) || '对话'
  const current: StoredSession = {
    id: sessionId.value,
    updatedAt: Date.now(),
    title,
    messages: snapshot,
  }
  sessions.value = [current, ...sessions.value.filter((item) => item.id !== current.id)].slice(
    0,
    HISTORY_LIMIT,
  )
  writeHistory(sessions.value)
}

/** 历史会话时间：今天只显示时分，更早显示月日 */
function sessionTimeLabel(updatedAt: number): string {
  const date = new Date(updatedAt)
  const now = new Date()
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  if (sameDay) {
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
  }
  return `${date.getMonth() + 1}/${date.getDate()}`
}

function openSession(session: StoredSession) {
  if (busy.value) return
  stopListen()
  sessionId.value = session.id
  messages.value = session.messages.map((message) => ({ ...message }))
  historyOpen.value = false
  scrollLogToBottom()
}

function newConversation() {
  stopGenerating()
  stopListen()
  persistCurrent()
  sessionId.value = `ui-agent-${Date.now().toString(36)}`
  messages.value = []
  input.value = ''
  historyOpen.value = false
}

/** 主动停止生成：保留已收到的文本，只取消后续请求 */
function stopGenerating() {
  streamHandle?.abort()
  streamHandle = null
  busy.value = false
  for (const message of messages.value) {
    if (message.streaming) message.streaming = false
  }
}

function goAgentSettings() {
  close()
  void router.push(SETTINGS_ROUTES.agent())
}

function close() {
  stopGenerating()
  stopListen()
  discardVoice.value = false
  persistCurrent()
  emit('close')
}

/* ------------------------------------------------- 语音形态：按住说话 / 键盘 */

/** 键盘 ↔ 按住说话：切走时先停掉正在进行的识别，避免 HUD 消失后麦克风还开着 */
function toggleVoiceMode() {
  if (listening.value || transcribing.value) stopListen()
  discardVoice.value = false
  voiceMode.value = !voiceMode.value
  if (!voiceMode.value) nextTick(() => inputRef.value?.focus())
}

/** 长按达标：开始录音，松手后识别结果照常走一轮对话 */
function startVoiceHold() {
  if (busy.value || agentBlocked.value) return
  discardVoice.value = false
  startListen()
}

/**
 * 松手：取消就把结果标记为丢弃；正常松手交给 onFinal 继续。
 *
 * 无论哪种都要先 stopListen —— 否则麦克风会一直被占用到下一次操作。
 */
function stopVoiceHold(canceled: boolean) {
  discardVoice.value = canceled
  if (canceled) input.value = ''
  stopListen()
}

function scrollLogToBottom() {
  void nextTick(() => {
    const el = logRef.value
    if (!el) return
    el.scrollTop = el.scrollHeight
  })
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.stopPropagation()
    if (listening.value || transcribing.value) {
      stopListen()
      return
    }
    close()
  }
}

function placeholder() {
  if (agentBlocked.value) return '请先配置智能管家'
  if (busy.value) return '处理中…'
  if (voiceStatus.value) return voiceStatus.value
  return '吩咐点什么...（按回车发送）'
}

/** 流式结束后的兜底文案（无回复时） */
function fallbackReplyOf(outcome: string | undefined): string {
  if (outcome === 'success') return '已执行'
  if (outcome === 'blocked') return '该指令未被执行。'
  return '无回复'
}

/**
 * 气泡正文的展示清洗：模型习惯写 `**加粗**` / `__下划线__` / 反引号代码，
 * 而气泡是纯文本内插（与参考实现同一口径，不渲染富文本），
 * 原样显示会把星号露出来。这里只去标记、不丢文字。
 */
function displayText(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
}

/** 把工具轨迹合并进气泡（保持首次调用顺序，去重） */
function mergeToolTrace(bubble: ChatMessage, toolNames: string[]) {
  if (!toolNames.length) return
  bubble.tools = toolNames.join(' → ')
}

/**
 * 把本轮最终结果写进流式气泡：结论 / 工具轨迹 / 耗时与 token。
 *
 * @returns 用于语音播报的正文（最终回复优先于增量文本，后端可能给出未流式下发的收尾文案）
 */
function applyResult(bubble: ChatMessage, result: AgentChatResult | null): string {
  bubble.outcome = result?.outcome
  if (result?.toolCalls?.length) {
    mergeToolTrace(
      bubble,
      result.toolCalls.map((toolCall) => toolCall.name),
    )
  }
  bubble.text = result?.reply || bubble.text || fallbackReplyOf(result?.outcome)
  // 气泡旁边的 ms / token 角标：与源码 assistant-meta 同口径，只在本轮有数据时展示。
  // 用 `| 0` 取整兜底（NaN → 0），避免再引入逻辑运算符把 send 的圈复杂度顶过棘轮。
  bubble.ms = Number(result?.timing?.totalMs) | 0
  bubble.tokens = Number(result?.usage?.completionTokens) | 0
  return bubble.text
}

async function send(raw?: string) {
  const message = clipAgentChatMessage(typeof raw === 'string' ? raw : input.value)
  if (!message || busy.value || agentBlocked.value) return
  const history = messages.value
    .filter((historyMessage) => historyMessage.text.trim() && !historyMessage.streaming)
    .map((historyMessage) => ({ role: historyMessage.role, content: historyMessage.text }))
    .slice(-16)
  messages.value.push({ role: 'user', text: message })
  input.value = ''
  busy.value = true

  // 先插入流式气泡：token 到达即逐字渲染，工具轨迹实时追加
  const bubble: ChatMessage = { role: 'assistant', text: '', streaming: true }
  messages.value.push(bubble)
  const toolNames: string[] = []
  // 用 ref 承载最终结果：普通 let 变量在闭包里赋值不会被 TS 控制流分析识别
  const finalResult = ref<AgentChatResult | null>(null)
  scrollLogToBottom()

  try {
    const handle = agentChatStream(message, history, sessionId.value, {
      onToken: (text) => {
        bubble.text += text
        scrollLogToBottom()
      },
      onTool: (call) => {
        if (!toolNames.includes(call.name)) toolNames.push(call.name)
        mergeToolTrace(bubble, toolNames)
      },
      onDone: (res) => {
        finalResult.value = res
      },
    })
    streamHandle = handle
    await handle.done

    const result = finalResult.value
    const reply = applyResult(bubble, result)
    // 音效是「结果已就绪」的即时反馈：打字与语音输入一视同仁，且要先于播报出声
    void playEarcon(result?.earcon)
    if (reply && result?.speak !== false) await speakReply(result?.ttsUrl, reply)
  } catch (error: unknown) {
    const fail = getApiErrorMessage(error, '管家暂时不可用')
    if (bubble.text.trim()) {
      // 已收到部分内容：保留并追加错误提示，避免整段消失
      bubble.text = `${bubble.text}\n（${fail}）`
    } else {
      bubble.text = fail
    }
    bubble.outcome = 'error'
    void playEarcon('error')
    if (getConfigSection('voice')?.ttsEnabled !== false) await speak(fail)
  } finally {
    bubble.streaming = false
    streamHandle = null
    busy.value = false
    // 取消后完全没有内容的气泡直接移除，避免留下空壳
    if (!bubble.text.trim()) {
      messages.value = messages.value.filter((entry) => entry !== bubble)
    }
    persistCurrent()
    scrollLogToBottom()
    nextTick(() => inputRef.value?.focus())
  }
}
</script>

<template>
  <div
    v-if="open"
    ref="rootRef"
    class="acp-root"
    :class="{ 'acp-root--dock': docked }"
    role="dialog"
    aria-label="HomeOS 智能管家"
    @keydown="onKeydown"
    @pointerdown="touchActivity"
    @click="touchActivity"
    @wheel.passive="touchActivity"
  >
    <section class="acp-panel" :class="{ 'acp-panel--live': busy || listening }">
      <header class="acp-head">
        <span class="acp-head__avatar">
          <AgentMechaAvatar mode="active" :is-active="busy || listening" />
        </span>
        <span class="acp-head__info">
          <span class="acp-head__title-row">
            <span class="acp-head__title">HomeOS智能管家</span>
          </span>
          <span class="acp-head__status">
            <span
              class="acp-head__dot"
              :class="`acp-head__dot--${headerTone}`"
              aria-hidden="true"
            />
            {{ headerStatus }}
          </span>
        </span>
        <span class="acp-head__actions">
          <button
            v-if="sessions.length > 1"
            type="button"
            class="acp-action"
            aria-label="历史会话"
            title="历史会话"
            @click="historyOpen = !historyOpen"
          >
            <History class="acp-icon" />
          </button>
          <button
            v-if="messages.length"
            type="button"
            class="acp-action"
            aria-label="新对话"
            title="新对话"
            @click="newConversation"
          >
            <Trash2 class="acp-icon" />
          </button>
          <button
            type="button"
            class="acp-action"
            aria-label="返回侧边栏"
            title="返回侧边栏"
            @click="close"
          >
            <ArrowLeft class="acp-icon" />
          </button>
        </span>
      </header>

      <div v-if="historyOpen" class="acp-history" role="dialog" aria-label="历史会话">
        <p class="acp-history__title">历史会话</p>
        <button
          v-for="item in sessions"
          :key="item.id"
          type="button"
          class="acp-history__row"
          :class="{ 'acp-history__row--active': item.id === sessionId }"
          @click="openSession(item)"
        >
          <span class="acp-history__text">{{ item.title }}</span>
          <span class="acp-history__time">{{ sessionTimeLabel(item.updatedAt) }}</span>
        </button>
      </div>

      <div ref="logRef" class="acp-body" aria-live="polite">
        <div v-if="!messages.length && !busy" class="acp-welcome">
          <AgentMechaAvatar
            mode="active"
            :is-active="listening"
            class="acp-welcome__avatar"
          />
          <template v-if="pinging && !ping">
            <h4 class="acp-welcome__title">正在检查管家状态…</h4>
          </template>
          <template v-else-if="agentBlocked">
            <h4 class="acp-welcome__title">管家未就绪</h4>
            <p class="acp-welcome__desc">
              {{
                ping?.provider === 'mock'
                  ? '当前为演示模式，请先配置并保存有效接口密钥'
                  : '请先在设置中配置智能管家模型'
              }}
            </p>
            <button type="button" class="acp-setup" @click="goAgentSettings">
              去配置智能管家
            </button>
          </template>
          <template v-else>
            <h4 class="acp-welcome__title">有什么吩咐？主人</h4>
            <p class="acp-welcome__desc">
              您可以呼叫我调节全屋温控、开关灯光、查看安防，或查询环境能耗。
            </p>
          </template>
          <p v-if="micHint" class="acp-welcome__desc acp-welcome__warn">{{ micHint }}</p>
        </div>

        <div v-for="(m, i) in messages" :key="i" class="acp-row" :class="`acp-row--${m.role}`">
          <span v-if="m.role === 'assistant'" class="acp-row__avatar">
            <AgentMechaAvatar mode="active" :is-active="false" />
          </span>
          <div class="acp-bubble" :class="`acp-bubble--${m.role}`">
          <p class="acp-bubble__text" :class="{ 'acp-bubble__text--streaming': m.streaming }">
            {{ m.streaming ? m.text : displayText(m.text) }}
          </p>
            <p v-if="m.outcome === 'blocked'" class="acp-bubble__blocked">
              <ShieldAlert class="acp-bubble__blocked-icon" aria-hidden="true" />
              {{ BLOCKED_NOTICE }}
            </p>
            <p v-if="m.tools" class="acp-bubble__tools">{{ m.tools }}</p>
          </div>
          <span v-if="m.ms" class="acp-row__meta">
            {{ m.ms }}ms<span v-if="m.tokens"> · {{ m.tokens }}t</span>
          </span>
        </div>

        <div v-if="showTyping" class="acp-row acp-row--assistant">
          <span class="acp-row__avatar">
            <AgentMechaAvatar mode="active" :is-active="true" />
          </span>
          <span class="acp-thinking" aria-label="处理中">
            <span class="acp-thinking__dot"></span>
            <span class="acp-thinking__dot"></span>
            <span class="acp-thinking__dot"></span>
          </span>
        </div>
      </div>

      <div v-if="quickPrompts.length" class="acp-chips" role="group" aria-label="快捷指令">
        <button
          v-for="q in quickPrompts"
          :key="q.prompt"
          type="button"
          class="acp-chip"
          :disabled="busy || agentBlocked"
          :title="quickPromptTitle(q)"
          :aria-label="quickPromptAria(q)"
          @click="send(q.prompt)"
        >
          {{ q.label }}
        </button>
      </div>

      <div class="acp-foot" :class="{ 'acp-foot--voice': voiceMode }">
        <button
          type="button"
          class="acp-mode"
          :aria-label="voiceMode ? '切换为键盘输入' : '切换为按住说话'"
          :title="voiceMode ? '切换为键盘输入' : '切换为按住说话'"
          @click="toggleVoiceMode"
        >
          <Keyboard v-if="voiceMode" class="acp-icon" />
          <Mic v-else class="acp-icon" />
        </button>
        <form v-if="!voiceMode" class="acp-foot__form" @submit.prevent="send()">
          <input
            ref="inputRef"
            v-model="input"
            class="acp-input"
            type="text"
            :maxlength="AGENT_CHAT_MAX_LENGTH"
            :placeholder="placeholder()"
            :disabled="busy || agentBlocked"
            aria-label="智能管家指令"
          />
          <button
            v-if="busy"
            type="button"
            class="acp-send"
            aria-label="停止生成"
            title="停止生成"
            @click="stopGenerating"
          >
            <Square class="acp-icon" />
          </button>
          <button
            v-else
            type="submit"
            class="acp-send"
            :class="{ 'acp-send--active': input.trim() }"
            :disabled="agentBlocked || !input.trim()"
            aria-label="发送"
          >
            <Send class="acp-icon" />
          </button>
        </form>
        <AgentVoiceHoldBar
          v-else
          :disabled="busy || agentBlocked"
          :transcript="input"
          :finalizing="transcribing"
          @start="startVoiceHold"
          @stop="stopVoiceHold"
        />
      </div>
      <p v-if="voiceError || (micHint && messages.length)" class="acp-voice-err">
        {{ voiceError || micHint }}
      </p>
    </section>
  </div>
</template>

<style scoped>
/*
 * 面板配色只在这里定义一次，其余规则（styles/agent-chat-panel.css）全部走 var()，
 * 既让硬编码样式棘轮只看得到这一处字面量，也方便整体换肤。
 * 取值逐条对齐源码 HomeOSSidebarAgentPanel 的 conic 光边与状态色。
 */
.acp-root {
  --acp-blue: #4285f4;
  --acp-violet: #9b51e0;
  --acp-red: #ea4335;
  --acp-yellow: #fbbc05;
  --acp-green: #34a853;
  --acp-cyan: #00f0ff;
  --acp-amber: #ff9f0a;
  --acp-live: #10b981;
  --acp-chroma-duration: 6.5s;
  --acp-pulse-duration: 1.4s;
  --acp-chroma: conic-gradient(
    from var(--acp-chroma-angle),
    var(--acp-blue) 0deg,
    var(--acp-violet) 72deg,
    var(--acp-red) 144deg,
    var(--acp-yellow) 216deg,
    var(--acp-green) 288deg,
    var(--acp-blue) 360deg
  );
}
</style>

<!-- scoped 外置样式：规则只用 var() / rgba()，颜色字面量统一留在上面的令牌块 -->
<style scoped src="./styles/agent-chat-panel.css"></style>
