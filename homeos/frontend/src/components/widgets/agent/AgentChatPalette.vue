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
  Copy,
  History,
  Keyboard,
  Mic,
  RefreshCw,
  Send,
  ShieldAlert,
  Square,
  Trash2,
  Volume2,
  Wrench,
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
import {
  agentDurationLabel,
  agentFootTitle,
  agentReplyText,
} from '@/shared/agent/utils/reply-format.util'
import { agentModelLabel } from '@/shared/agent/utils/model-label.util'
import {
  newAgentChatSessionId,
  readAgentChatCurrentId,
  readAgentChatSessions,
  writeAgentChatCurrentId,
  type AgentChatSession,
} from '@/shared/agent/utils/chat-history.util'
import { toolLabels } from '@/shared/agent/utils/tool-label.util'
import AgentMechaAvatar from '@/components/shell/agent-companion/AgentMechaAvatar.vue'
import AgentVoiceHoldBar from './AgentVoiceHoldBar.vue'
import {
  BLOCKED_NOTICE,
  applyResult,
  buildSentHistory,
  expireConfirmations,
  mergeToolTrace,
  type ChatMessage,
} from './agent-chat-model.internals'
import { useAgentChatSessions } from './agent-chat-sessions.internals'

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
const storedSessions = readAgentChatSessions()
/** 只恢复「上次正在聊的那一条」；指针缺失 / 指向已删除的会话时从空白开始 */
const initialSession =
  storedSessions.find((item) => item.id === readAgentChatCurrentId()) ?? null
const sessionId = ref(initialSession?.id || newAgentChatSessionId())
if (initialSession) writeAgentChatCurrentId(initialSession.id)
const input = ref('')
const busy = ref(false)
/**
 * 语音输入形态：true = 按住说话（圆环 + HUD），false = 键盘输入。
 * 默认键盘 —— 桌面端以打字为主，与源码 MobileAgentChatSheet 的 `d=true` 初值一致。
 */
const voiceMode = ref(false)
/** 本轮语音已被上滑取消：识别结果回来时丢弃，不落进输入框也不发送 */
const discardVoice = ref(false)
const messages = ref<ChatMessage[]>(initialSession?.messages ?? [])
const sessions = ref<AgentChatSession[]>(storedSessions)
const historyOpen = ref(false)
const inputRef = ref<HTMLInputElement | null>(null)
const rootRef = ref<HTMLElement | null>(null)
const logRef = ref<HTMLElement | null>(null)
const ping = ref<AgentPingResult | null>(null)
const pinging = ref(false)
const micHint = ref('')
/** 当前进行中的流式请求句柄：关闭弹层 / 新对话 / 手动停止时用于取消 */
let streamHandle: AgentStreamHandle | null = null
const { speak, speakReply, stop: stopSpeech } = useAgentSpeech()

/** 快捷指令：来自 `ui.agentQuickPrompts`（设置页可改），清空则整行不渲染 */
const quickPrompts = computed(() => readAgentQuickPrompts())

const agentBlocked = computed(() => {
  if (pinging.value && !ping.value) return true
  if (!ping.value) return false
  const provider = String(ping.value.provider || '').toLowerCase()
  return provider === 'mock' || provider === 'unavailable' || ping.value.ready === false
})

/** 流式气泡是否已有可展示内容 —— 空气泡占位不占一行，等首 token 的阶段交给「处理中」气泡 */
function bubbleHasContent(message: ChatMessage): boolean {
  return Boolean(message.text.trim() || message.tools)
}

/** 等首 token 的阶段才显示「处理中」气泡；出字后由流式气泡本身承载（按「有内容」判，不按「存在流式气泡」） */
const showTyping = computed(
  () =>
    busy.value && !messages.value.some((message) => message.streaming && bubbleHasContent(message)),
)

/**
 * 管家动态状态：与源码面板顶栏同一口径 —— 聆听 / 响应优先，其余显示**后台设置的模型**。
 * 文案由 `agentModelLabel` 统一产出（只认 `/agent/ping` 的 provider + model），
 * 这里不再写死任何型号，否则换了模型界面会一直报旧名字。
 */
const headerStatus = computed(() => {
  if (listening.value) return '正在聆听...'
  if (busy.value) return '正在响应...'
  if (!ping.value) return pinging.value ? '正在检测...' : '未连接'
  return agentModelLabel(ping.value)
})

/** 状态点色调：正常=绿 / 录入=琥珀 / 未就绪=玫瑰 / 探测中或未探测=蓝，与源码 pulse-dot 同语义 */
const headerTone = computed(() => {
  if (agentBlocked.value) return 'rose'
  if (listening.value) return 'amber'
  // 还没拿到探测结果时不能先亮绿灯：那会和「未连接」的文案自相矛盾
  if (!ping.value) return 'sky'
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

/**
 * 空闲让位：必须声明在下面那个 `immediate: true` 的 watch **之前**。
 * 该 watch 在 setup 里同步跑一次（面板带着 open=true 挂载），会立刻调 `startIdleWatch()`；
 * 若 `idleTimer` 的 `let` 声明写在后面，就是 TDZ —— "Cannot access 'idleTimer' before initialization"。
 */
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
  // 面板可能是**带着 open=true 挂载**的（悬浮伴侣 / 快捷键直接拉起），此时 watch
  // 不会触发 —— 于是 ping 永远是 null，顶栏一路显示「未连接」。首次也要探测一次。
  { immediate: true },
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

/** 主动停止生成：保留已收到的文本，只取消后续请求 */
function stopGenerating() {
  streamHandle?.abort()
  streamHandle = null
  busy.value = false
  for (const message of messages.value) {
    if (message.streaming) message.streaming = false
  }
}

const { persistCurrent, sessionTimeLabel, openSession, newConversation, deleteConversation } =
  useAgentChatSessions({
    sessionId,
    messages,
    sessions,
    input,
    historyOpen,
    busy,
    stopListen,
    stopGenerating,
    scrollToBottom: scrollLogToBottom,
  })

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

/** 复制气泡正文：失败时只在提示行说一句，不弹系统权限框 */
function copyBubble(text: string): void {
  const content = String(text || '').trim()
  if (!content) return
  try {
    void navigator.clipboard
      ?.writeText(content)
      .then(() => {
        micHint.value = '已复制'
      })
      .catch(() => {
        micHint.value = '复制失败，请手动选择文本'
      })
  } catch {
    micHint.value = '复制失败，请手动选择文本'
  }
}

/**
 * 重新生成：从目标助手气泡往前找到最近一条用户消息，删掉这一轮之后的所有消息再重发。
 * 同时保留用户原话，避免出现「重发后上下文对不上」。
 */
async function regenerate(index: number): Promise<void> {
  if (busy.value) return
  const target = messages.value[index]
  if (!target || target.role !== 'assistant') return
  let userIndex = -1
  for (let i = index - 1; i >= 0; i--) {
    if (messages.value[i].role === 'user') {
      userIndex = i
      break
    }
  }
  if (userIndex < 0) return
  const prompt = messages.value[userIndex].text
  messages.value.splice(userIndex)
  persistCurrent()
  await send(prompt)
}

/** 点击确认 / 取消按钮：等价于用户输入对应口令，走同一条批量确认链路 */
function answerConfirmation(message: ChatMessage, text?: string): void {
  if (busy.value || !text) return
  message.confirmation = undefined
  void send(text)
}

/** 失败收尾：已收到部分文本就追加提示，否则整段显示错误 */
async function handleSendError(bubble: ChatMessage, error: unknown): Promise<void> {
  const fail = getApiErrorMessage(error, '管家暂时不可用')
  bubble.text = bubble.text.trim() ? `${bubble.text}\n（${fail}）` : fail
  bubble.outcome = 'error'
  void playEarcon('error')
  if (getConfigSection('voice')?.ttsEnabled !== false) await speak(fail)
}

async function send(raw?: string) {
  const message = clipAgentChatMessage(typeof raw === 'string' ? raw : input.value)
  if (!message || busy.value || agentBlocked.value) return
  expireConfirmations(messages.value)
  const history = buildSentHistory(messages.value)
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
    await handleSendError(bubble, error)
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
          <span class="acp-head__status" :title="headerStatus">
            <span
              class="acp-head__dot"
              :class="`acp-head__dot--${headerTone}`"
              aria-hidden="true"
            />
            <span class="acp-head__status-text">{{ headerStatus }}</span>
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
            aria-label="删除对话"
            title="删除对话"
            @click="deleteConversation"
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
        <button type="button" class="acp-history__row acp-history__row--new" @click="newConversation">
          <span class="acp-history__text">＋ 新对话</span>
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
                  : ping?.provider === 'unknown'
                    ? '状态检测失败（登录状态或后端连接异常），稍后重试'
                    : '请先在设置中配置智能管家模型'
              }}
            </p>
            <button v-if="ping?.provider === 'unknown'" type="button" class="acp-setup" @click="refreshAgentStatus">
              重新检测
            </button>
            <button v-else type="button" class="acp-setup" @click="goAgentSettings">
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

        <template v-for="(m, i) in messages" :key="i">
          <div
            v-if="m.role === 'user' || !m.streaming || bubbleHasContent(m)"
            class="acp-row"
            :class="`acp-row--${m.role}`"
          >
            <span v-if="m.role === 'assistant'" class="acp-row__avatar">
              <AgentMechaAvatar mode="active" :is-active="false" />
            </span>
            <div class="acp-bubble" :class="`acp-bubble--${m.role}`">
              <p class="acp-bubble__text" :class="{ 'acp-bubble__text--streaming': m.streaming }">
                {{ m.streaming ? m.text : agentReplyText(m.text) }}
              </p>
              <p v-if="m.outcome === 'blocked'" class="acp-bubble__blocked">
                <ShieldAlert class="acp-bubble__blocked-icon" aria-hidden="true" />
                {{ BLOCKED_NOTICE }}
              </p>
              <div v-if="m.attachments?.length" class="acp-bubble__attachments">
                <a
                  v-for="(attachment, ai) in m.attachments"
                  :key="`${attachment.url}-${ai}`"
                  class="acp-attachment"
                  :href="attachment.url"
                  target="_blank"
                  rel="noopener noreferrer"
                  :title="attachment.name || '查看原图'"
                >
                  <img
                    class="acp-attachment__img"
                    :src="attachment.url"
                    :alt="attachment.name || '摄像头快照'"
                    loading="lazy"
                  />
                </a>
              </div>
              <div v-if="m.confirmation" class="acp-confirm">
                <button
                  type="button"
                  class="acp-confirm__btn acp-confirm__btn--ok"
                  :disabled="busy"
                  @click="answerConfirmation(m, m.confirmation?.confirmText)"
                >
                  {{ m.confirmation.confirmText }}
                </button>
                <button
                  type="button"
                  class="acp-confirm__btn"
                  :disabled="busy"
                  @click="answerConfirmation(m, m.confirmation?.cancelText)"
                >
                  {{ m.confirmation.cancelText }}
                </button>
              </div>
              <div v-if="m.role === 'assistant' && !m.streaming" class="acp-bubble__actions">
                <button
                  type="button"
                  class="acp-action"
                  aria-label="复制"
                  title="复制"
                  @click="copyBubble(m.text)"
                >
                  <Copy class="acp-action__icon" />
                </button>
                <button
                  v-if="!m.attachments?.length"
                  type="button"
                  class="acp-action"
                  aria-label="重新生成"
                  title="重新生成"
                  :disabled="busy"
                  @click="regenerate(i)"
                >
                  <RefreshCw class="acp-action__icon" />
                </button>
                <button
                  v-if="m.text.trim()"
                  type="button"
                  class="acp-action"
                  aria-label="停止朗读"
                  title="停止朗读"
                  @click="stopSpeech()"
                >
                  <Volume2 class="acp-action__icon" />
                </button>
              </div>
              <div v-if="m.tools || m.ms" class="acp-bubble__foot">
                <span v-if="m.tools" class="acp-bubble__tools">
                  <span v-for="label in toolLabels(m.tools)" :key="label" class="acp-tool">
                    <Wrench class="acp-tool__icon" aria-hidden="true" />
                    {{ label }}
                  </span>
                </span>
                <span v-if="m.ms" class="acp-bubble__meta" :title="agentFootTitle(m.ms, m.tokens || 0)">
                  {{ agentDurationLabel(m.ms) }}<template v-if="m.tokens"> · {{ m.tokens }}t</template>
                </span>
              </div>
            </div>
          </div>
        </template>

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

<!-- scoped 外置样式：令牌块与规则都在 styles/agent-chat-panel.css -->
<style scoped src="./styles/agent-chat-panel.css"></style>
