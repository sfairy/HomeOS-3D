<!--
  AgentChatPalette — 智能管家对话弹层
  顶栏入口唤起，交互与全局搜索一致：遮罩弹窗、Esc / 点击背景关闭，不占用页面布局。
-->
<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  History,
  Loader2,
  MessageCircle,
  Mic,
  Plus,
  Send,
  ShieldAlert,
  Sparkles,
  Square,
  X,
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
import { useShellTeleportTarget } from '@/composables/ui/useShellTeleportTarget'
import { useFocusTrap } from '@/composables/ui/useFocusTrap'
import { useSpeechToText } from '@/composables/voice/useSpeechToText'
import { useTtsSpeak } from '@/composables/voice/useTtsSpeak'
import { isEmbeddedBrowser, probeMicrophone } from '@/composables/voice/useAudioDevices'
import { clipAgentChatMessage, AGENT_CHAT_MAX_LENGTH } from '@/shared/agent/utils/chat-limit.util'

type ChatRole = 'user' | 'assistant'
type ChatMessage = {
  role: ChatRole
  text: string
  tools?: string
  /** 后端执行结论（success / answer / blocked / failed / error），用于安全拦截提示 */
  outcome?: string
  /** 流式生成中：文本持续追加，不展示拦截提示 */
  streaming?: boolean
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
    const raw = window.localStorage.getItem(HISTORY_KEY)
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
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(sessions.slice(0, HISTORY_LIMIT)))
  } catch {
    // 隐私模式 / 配额用尽：历史只保留在内存
  }
}

/** 快捷指令：覆盖安防 / 空调 / 灯光 / 能耗查询四类高频场景 */
const QUICK_PROMPTS = [
  '开启离家安防警戒',
  '客厅空调调至25度',
  '全关所有开启的灯光',
  '现在全屋能耗与温度怎样',
]

/** 安全拦截提示文案：管线判定为 blocked 时明确告知用户操作被安全策略拦截 */
const BLOCKED_NOTICE = '出于安全考虑，这个操作被拦截了。'

const props = defineProps({
  open: { type: Boolean, default: false },
})
const emit = defineEmits(['close'])

const { teleportTarget, shellTeleportPending } = useShellTeleportTarget()
const teleportDisabled = shellTeleportPending

const router = useRouter()
const storedSessions = readHistory()
const sessionId = ref(storedSessions[0]?.id || `ui-agent-${Date.now().toString(36)}`)
const input = ref('')
const busy = ref(false)
const voiceTurn = ref(false)
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
const { speak } = useTtsSpeak()

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
 * 管家动态状态：检测中 / 思考中 / 未配置 / 在线就绪。
 *
 * 与设置页「检测状态」同源（agentPing 的 provider + ready），
 * 仪表板入口与对话抽屉共用同一口径，避免状态文案不一致。
 */
const agentStatusLabel = computed(() => {
  if (pinging.value && !ping.value) return '检测中'
  if (busy.value) return '思考中'
  if (agentBlocked.value) return '未配置'
  return '在线就绪'
})

/** 状态色调：就绪=emerald / 思考=sky / 检测中=amber / 未配置=rose */
const agentStatusTone = computed(() => {
  if (agentBlocked.value) return 'rose'
  if (busy.value) return 'sky'
  if (pinging.value && !ping.value) return 'amber'
  return 'emerald'
})

const { listening, transcribing, error: voiceError, status: voiceStatus, toggleListen, stopListen } =
  useSpeechToText({
    preferHa: true,
    onInterim: (text) => {
      input.value = clipAgentChatMessage(text)
    },
    onFinal: (text) => {
      if (agentBlocked.value) return
      voiceTurn.value = true
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
      void refreshAgentStatus()
      void refreshMicHint()
      nextTick(() => inputRef.value?.focus())
      scrollLogToBottom()
      return
    }
    stopListen()
  },
)
useFocusTrap(rootRef, openRef)

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
  voiceTurn.value = false
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
  persistCurrent()
  emit('close')
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
  return '问问管家，或点麦克风说话'
}

/** 流式结束后的兜底文案（无回复时） */
function fallbackReplyOf(outcome: string | undefined): string {
  if (outcome === 'success') return '已执行'
  if (outcome === 'blocked') return '该指令未被执行。'
  return '无回复'
}

/** 把工具轨迹合并进气泡（保持首次调用顺序，去重） */
function mergeToolTrace(bubble: ChatMessage, toolNames: string[]) {
  if (!toolNames.length) return
  bubble.tools = toolNames.join(' → ')
}

async function send(raw?: string) {
  const message = clipAgentChatMessage(typeof raw === 'string' ? raw : input.value)
  if (!message || busy.value || agentBlocked.value) return
  const fromVoice = voiceTurn.value
  voiceTurn.value = false
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
    bubble.outcome = result?.outcome
    if (result?.toolCalls?.length) {
      mergeToolTrace(
        bubble,
        result.toolCalls.map((toolCall) => toolCall.name),
      )
    }
    // 最终回复优先于增量文本：后端可能给出未流式下发的收尾文案
    const reply = result?.reply || bubble.text || fallbackReplyOf(bubble.outcome)
    bubble.text = reply
    const ttsOn = getConfigSection('voice')?.ttsEnabled !== false
    if (fromVoice && ttsOn && reply) await speak(reply)
  } catch (error: unknown) {
    const fail = getApiErrorMessage(error, '管家暂时不可用')
    if (bubble.text.trim()) {
      // 已收到部分内容：保留并追加错误提示，避免整段消失
      bubble.text = `${bubble.text}\n（${fail}）`
    } else {
      bubble.text = fail
    }
    bubble.outcome = 'error'
    if (fromVoice && getConfigSection('voice')?.ttsEnabled !== false) await speak(fail)
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
  <Teleport v-if="open" :to="teleportTarget" :disabled="teleportDisabled">
    <div
      ref="rootRef"
      class="acp-root"
      role="dialog"
      aria-modal="true"
      aria-label="智能管家"
      @keydown="onKeydown"
      @click.self="close"
    >
      <div class="acp-panel">
        <header class="acp-head">
          <MessageCircle class="acp-head__icon" aria-hidden="true" />
          <div class="acp-head__text">
            <h2 class="acp-head__title">{{ '智能管家' }}</h2>
            <p class="acp-head__hint">
              <span class="acp-status" :class="`acp-status--${agentStatusTone}`">
                <span class="acp-status__dot" aria-hidden="true" />
                {{ agentStatusLabel }}
              </span>
              <span class="acp-head__desc">{{ '自然语言控制设备、场景与模式' }}</span>
            </p>
          </div>
          <button
            v-if="sessions.length"
            type="button"
            class="acp-close"
            :aria-label="'历史会话'"
            :title="'历史会话'"
            @click="historyOpen = !historyOpen"
          >
            <History class="w-4 h-4" />
          </button>
          <button
            v-if="messages.length"
            type="button"
            class="acp-close"
            :aria-label="'新对话'"
            :title="'新对话'"
            @click="newConversation"
          >
            <Plus class="w-4 h-4" />
          </button>
          <button type="button" class="acp-close" :aria-label="'关闭智能管家'" @click="close">
            <X class="w-4 h-4" />
          </button>
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
          <div v-if="!messages.length && !busy" class="acp-empty">
            <Sparkles class="acp-empty__icon" aria-hidden="true" />
            <template v-if="pinging && !ping">
              <p class="acp-empty__title">{{ '正在检查管家状态…' }}</p>
            </template>
            <template v-else-if="agentBlocked">
              <p class="acp-empty__title">{{ '管家未就绪' }}</p>
              <p class="acp-empty__desc">
                {{
                  ping?.provider === 'mock'
                    ? '当前为演示模式，请先配置并保存有效接口密钥'
                    : '请先在设置中配置智能管家模型'
                }}
              </p>
              <button type="button" class="acp-setup" @click="goAgentSettings">
                {{ '去配置智能管家' }}
              </button>
            </template>
            <template v-else>
              <p class="acp-empty__title">{{ '我是您的全屋智能管家' }}</p>
              <p class="acp-empty__desc">
                {{ '用一句话控制灯光、空调、场景与安防模式，也能查询全屋能耗与温湿度' }}
              </p>
              <div class="acp-quick" role="group" aria-label="快捷指令">
                <button
                  v-for="q in QUICK_PROMPTS"
                  :key="q"
                  type="button"
                  class="acp-quick__chip"
                  :disabled="busy"
                  @click="send(q)"
                >
                  {{ q }}
                </button>
              </div>
              <p v-if="micHint" class="acp-empty__desc acp-empty__warn">{{ micHint }}</p>
            </template>
          </div>
          <article
            v-for="(m, i) in messages"
            :key="i"
            class="acp-bubble"
            :class="`acp-bubble--${m.role}`"
          >
            <p class="acp-bubble__name">{{ m.role === 'user' ? '你' : '管家' }}</p>
            <p
              class="acp-bubble__text"
              :class="{ 'acp-bubble__text--streaming': m.streaming }"
            >{{ m.text }}</p>
            <p v-if="m.outcome === 'blocked'" class="acp-bubble__blocked">
              <ShieldAlert class="acp-bubble__blocked-icon" aria-hidden="true" />
              {{ BLOCKED_NOTICE }}
            </p>
            <p v-if="m.tools" class="acp-bubble__tools">{{ m.tools }}</p>
          </article>
          <article v-if="showTyping" class="acp-bubble acp-bubble--assistant">
            <p class="acp-bubble__name">{{ '管家' }}</p>
            <p class="acp-bubble__typing" aria-label="处理中">
              <Loader2 class="acp-bubble__spin" aria-hidden="true" />
              {{ '处理中…' }}
            </p>
          </article>
        </div>

        <form class="acp-composer" @submit.prevent="send()">
          <button
            type="button"
            class="acp-mic"
            :class="{ 'acp-mic--on': listening || transcribing }"
            :disabled="busy || agentBlocked"
            :aria-label="listening || transcribing ? '停止语音输入' : '语音输入'"
            :title="listening || transcribing ? '停止语音输入' : '点按说话，再说完点一次结束'"
            @click="toggleListen"
          >
            <Mic class="w-4 h-4" :class="{ 'acp-mic__pulse': listening }" />
          </button>
          <input
            ref="inputRef"
            v-model="input"
            class="acp-input"
            type="text"
            :maxlength="AGENT_CHAT_MAX_LENGTH"
            :placeholder="placeholder()"
            :disabled="busy || agentBlocked"
            :aria-label="'智能管家指令'"
          />
          <button
            v-if="busy"
            type="button"
            class="acp-send acp-send--stop"
            :aria-label="'停止生成'"
            :title="'停止生成'"
            @click="stopGenerating"
          >
            <Square class="w-4 h-4" />
          </button>
          <button
            v-else
            type="submit"
            class="acp-send"
            :disabled="agentBlocked || !input.trim()"
            :aria-label="'发送'"
          >
            <Send class="w-4 h-4" />
          </button>
        </form>
        <p v-if="voiceError || (micHint && messages.length)" class="acp-voice-err">
          {{ voiceError || micHint }}
        </p>

        <footer class="acp-foot">
          <span><kbd>↵</kbd> 发送</span>
          <span>{{ '麦克风说话' }}</span>
          <span><kbd>Esc</kbd> 关闭</span>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.acp-root {
  position: fixed;
  inset: 0;
  z-index: var(--z-search);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: min(10vh, 96px) 16px 16px;
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(6px);
}

.acp-panel {
  width: min(560px, 100%);
  max-height: min(72vh, 640px);
  display: flex;
  flex-direction: column;
  position: relative;
  border-radius: var(--hos-radius-panel);
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(16, 19, 27, 0.96);
  box-shadow:
    0 24px 64px rgba(0, 0, 0, 0.5),
    inset 0 1px 0 rgba(255, 255, 255, 0.06);
  overflow: hidden;
}

.acp-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.acp-head__icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  color: color-mix(in srgb, var(--page-accent, #34d399) 80%, #fff);
}

/* 历史会话下拉：盖在消息区上方，不挤压弹层高度 */
.acp-history {
  position: absolute;
  top: 58px;
  left: 16px;
  right: 16px;
  z-index: 2;
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 240px;
  overflow-y: auto;
  padding: 8px;
  border-radius: var(--hos-radius-card);
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(22, 26, 36, 0.98);
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.45);
}

.acp-history__title {
  margin: 2px 6px 6px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  color: var(--hos-text-secondary);
}

.acp-history__row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 7px 8px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: rgba(255, 255, 255, 0.85);
  font-size: 12px;
  text-align: left;
  cursor: pointer;
}

.acp-history__row:hover,
.acp-history__row--active {
  background: rgba(255, 255, 255, 0.08);
}

.acp-history__text {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.acp-history__time {
  flex-shrink: 0;
  font-size: 11px;
  color: var(--hos-text-secondary);
}

.acp-head__text {
  flex: 1;
  min-width: 0;
}

.acp-head__title {
  margin: 0;
  font-size: var(--premium-fs-body);
  font-weight: 700;
  color: rgba(255, 255, 255, 0.95);
}

.acp-head__hint {
  margin: 2px 0 0;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  font-size: 12px;
  color: var(--hos-text-secondary);
}

.acp-head__desc {
  min-width: 0;
}

/* 管家动态状态胶囊：在线就绪 / 思考中 / 检测中 / 未配置 */
.acp-status {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  padding: 1px 7px;
  border-radius: var(--hos-radius-pill);
  font-size: 11px;
  line-height: 16px;
  border: 1px solid currentColor;
  color: var(--hos-text-secondary);
}

.acp-status__dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: currentColor;
}

.acp-status--emerald {
  color: #34d399;
}

.acp-status--sky {
  color: #38bdf8;
}

.acp-status--amber {
  color: #fbbf24;
}

.acp-status--rose {
  color: #fb7185;
}

.acp-close {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.05);
  color: rgba(255, 255, 255, 0.6);
  cursor: pointer;
}

.acp-close:hover {
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
}

.acp-body {
  flex: 1;
  min-height: 180px;
  overflow-y: auto;
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.acp-empty {
  margin: auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 6px;
  padding: 24px 8px;
}

.acp-empty__icon {
  width: 22px;
  height: 22px;
  color: var(--hos-text-secondary);
}

.acp-empty__title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.7);
}

.acp-empty__desc {
  margin: 0;
  font-size: 12px;
  color: var(--hos-text-secondary);
}

.acp-empty__warn {
  color: #fbbf24;
}

/* 快捷指令 chips：窄屏下自动换行，避免横向溢出 */
.acp-quick {
  margin-top: 10px;
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 6px;
}

.acp-quick__chip {
  padding: 6px 10px;
  border-radius: var(--hos-radius-pill);
  border: 1px solid color-mix(in srgb, var(--page-accent, #34d399) 32%, transparent);
  background: color-mix(in srgb, var(--page-accent, #34d399) 10%, transparent);
  color: rgba(255, 255, 255, 0.85);
  font-size: 12px;
  line-height: 16px;
  cursor: pointer;
}

.acp-quick__chip:hover:not(:disabled) {
  background: color-mix(in srgb, var(--page-accent, #34d399) 22%, transparent);
}

.acp-quick__chip:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.acp-setup {
  margin-top: 10px;
  padding: 7px 12px;
  border-radius: var(--hos-radius-card);
  border: 1px solid color-mix(in srgb, var(--page-accent, #34d399) 40%, transparent);
  background: color-mix(in srgb, var(--page-accent, #34d399) 16%, transparent);
  color: #fff;
  font-size: 13px;
  cursor: pointer;
}

.acp-bubble {
  max-width: 92%;
}

.acp-bubble--user {
  align-self: flex-end;
}

.acp-bubble--assistant {
  align-self: flex-start;
}

.acp-bubble__name {
  margin: 0 0 4px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  color: var(--hos-text-secondary);
}

.acp-bubble--user .acp-bubble__name {
  text-align: right;
}

.acp-bubble__text,
.acp-bubble__typing {
  margin: 0;
  padding: 9px 12px;
  border-radius: var(--hos-radius-card);
  font-size: 13px;
  line-height: 1.45;
  color: rgba(255, 255, 255, 0.92);
}

.acp-bubble--user .acp-bubble__text {
  background: color-mix(in srgb, var(--page-accent, #34d399) 22%, rgba(255, 255, 255, 0.08));
}

.acp-bubble__tools {
  margin: 6px 0 0;
  padding: 0;
  font-size: 11px;
  line-height: 1.4;
  color: var(--hos-text-secondary);
}

/* 安全拦截提示：管家判定操作越权 / 涉险时显式说明，避免用户误以为执行成功 */
.acp-bubble__blocked {
  margin: 6px 0 0;
  display: flex;
  align-items: flex-start;
  gap: 6px;
  font-size: 12px;
  line-height: 1.5;
  color: #fbbf24;
}

.acp-bubble__blocked-icon {
  flex-shrink: 0;
  width: 14px;
  height: 14px;
  margin-top: 2px;
}

.acp-bubble--assistant .acp-bubble__text,
.acp-bubble--assistant .acp-bubble__typing {
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.acp-bubble__typing {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: rgba(255, 255, 255, 0.55);
}

.acp-bubble__spin {
  width: 14px;
  height: 14px;
  animation: acp-spin 1s linear infinite;
}

@keyframes acp-spin {
  to {
    transform: rotate(360deg);
  }
}

.acp-composer {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px 8px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.acp-mic {
  width: 40px;
  height: 40px;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  border-radius: var(--hos-radius-card);
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.05);
  color: rgba(255, 255, 255, 0.7);
  cursor: pointer;
}

.acp-mic:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

.acp-mic:disabled {
  opacity: 0.45;
  cursor: default;
}

.acp-mic--on {
  border-color: color-mix(in srgb, var(--page-accent, #34d399) 45%, transparent);
  background: color-mix(in srgb, var(--page-accent, #34d399) 18%, transparent);
  color: #fff;
}

.acp-mic__pulse {
  animation: acp-pulse 1.1s ease-in-out infinite;
}

@keyframes acp-pulse {
  50% {
    opacity: 0.45;
  }
}

.acp-voice-err {
  margin: 0 16px 4px;
  font-size: 12px;
  color: #fca5a5;
}

.acp-input {
  flex: 1;
  min-width: 0;
  height: 40px;
  padding: 0 12px;
  border-radius: var(--hos-radius-card);
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(0, 0, 0, 0.25);
  color: rgba(255, 255, 255, 0.95);
  font-size: 14px;
  font-family: inherit;
  outline: none;
}

.acp-input::placeholder {
  color: var(--hos-text-secondary);
}

.acp-input:focus {
  border-color: color-mix(in srgb, var(--page-accent, #34d399) 45%, transparent);
}

.acp-send {
  width: 40px;
  height: 40px;
  display: grid;
  place-items: center;
  border: none;
  border-radius: var(--hos-radius-card);
  background: var(--page-accent, #34d399);
  color: #052e16;
  cursor: pointer;
}

.acp-send:disabled {
  opacity: 0.45;
  cursor: default;
}

/* 停止生成：与发送按钮同尺寸，换成中性色以区分「发送」与「中断」 */
.acp-send--stop {
  background: rgba(255, 255, 255, 0.14);
  color: rgba(255, 255, 255, 0.9);
}

/* 流式生成中的光标：放在文本尾部，提示仍在输出 */
.acp-bubble__text--streaming::after {
  content: '';
  display: inline-block;
  width: 2px;
  height: 1em;
  margin-left: 2px;
  vertical-align: -0.15em;
  background: currentColor;
  animation: acp-caret 1s steps(2, start) infinite;
}

@keyframes acp-caret {
  50% {
    opacity: 0;
  }
}

.acp-foot {
  display: flex;
  gap: 14px;
  padding: 8px 16px 12px;
  font-size: 11px;
  color: var(--hos-text-secondary);
}

.acp-foot kbd {
  padding: 1px 5px;
  border-radius: 4px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(255, 255, 255, 0.06);
  font-family: inherit;
  font-size: 10px;
}
</style>
