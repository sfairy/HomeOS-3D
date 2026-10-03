<!--
  AgentChatPalette — 智能管家对话弹层
  顶栏入口唤起，交互与全局搜索一致：遮罩弹窗、Esc / 点击背景关闭，不占用页面布局。
-->
<script setup lang="ts">
/**
 * 所属模块：frontend/components
 * 职责：实现 AgentChatPalette 组件的界面渲染、用户交互与 props/emit 通信。
 * 关键依赖：Vue 3 `<script setup>`、Pinia stores（按需）、类型定义、Lucide 图标与 i18n 标签。
 * 约定：- 所有对外属性统一走 defineProps 泛型，emit 使用 defineEmits<...>()；
  - 不直接操作 DOM，响应式数据变化通过 v-model 或乐观锁写回 store。
 */
import { computed, nextTick, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Loader2, MessageCircle, Mic, Plus, Send, ShieldAlert, Sparkles, X } from '@lucide/vue'
import { agentChat, agentPing, type AgentPingResult } from '@/services/api/agent'
import { getApiErrorMessage } from '@/utils/core/error-message'
import { getConfigSection } from '@/utils/config/frontend-config'
import { SETTINGS_ROUTES } from '@/utils/registry/settings-route.util'
import { useShellTeleportTarget } from '@/composables/ui/useShellTeleportTarget'
import { useFocusTrap } from '@/composables/ui/useFocusTrap'
import { useSpeechToText } from '@/composables/voice/useSpeechToText'
import { useTtsSpeak } from '@/composables/voice/useTtsSpeak'
import { isEmbeddedBrowser, probeMicrophone } from '@/composables/voice/useAudioDevices'
import { clipAgentChatMessage, AGENT_CHAT_MAX_LENGTH } from '@/utils/agent/chat-limit.util'

type ChatRole = 'user' | 'assistant'
type ChatMessage = {
  role: ChatRole
  text: string
  tools?: string
  /** 后端执行结论（success / answer / blocked / failed / error），用于安全拦截提示 */
  outcome?: string
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
const sessionId = ref(`ui-agent-${Date.now().toString(36)}`)
const input = ref('')
const busy = ref(false)
const voiceTurn = ref(false)
const messages = ref<ChatMessage[]>([])
const inputRef = ref<HTMLInputElement | null>(null)
const rootRef = ref<HTMLElement | null>(null)
const logRef = ref<HTMLElement | null>(null)
const ping = ref<AgentPingResult | null>(null)
const pinging = ref(false)
const micHint = ref('')
const { speak } = useTtsSpeak()

const agentBlocked = computed(() => {
  if (pinging.value && !ping.value) return true
  if (!ping.value) return false
  const provider = String(ping.value.provider || '').toLowerCase()
  return provider === 'mock' || provider === 'unavailable' || ping.value.ready === false
})

/**
 * 管家动态状态：检测中 / 思考中 / 未配置 / 在线就绪。
 *
 * 与设置页「检测状态」同源（agentPing 的 provider + ready），
 * 移动端首页卡片与对话抽屉共用同一口径，避免状态文案不一致。
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

function newConversation() {
  stopListen()
  sessionId.value = `ui-agent-${Date.now().toString(36)}`
  messages.value = []
  input.value = ''
  voiceTurn.value = false
}

function goAgentSettings() {
  close()
  void router.push(SETTINGS_ROUTES.agent())
}

function close() {
  stopListen()
  emit('close')
}

function scrollLogToBottom() {
  void nextTick(() => {
    const el = logRef.value
    if (!el) return
    el.scrollTop = el.scrollHeight
  })
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.stopPropagation()
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

async function send(raw?: string) {
  const message = clipAgentChatMessage(typeof raw === 'string' ? raw : input.value)
  if (!message || busy.value || agentBlocked.value) return
  const fromVoice = voiceTurn.value
  voiceTurn.value = false
  const history = messages.value
    .filter((m) => m.text.trim())
    .map((m) => ({ role: m.role, content: m.text }))
    .slice(-16)
  messages.value.push({ role: 'user', text: message })
  input.value = ''
  busy.value = true
  scrollLogToBottom()
  try {
    const res = await agentChat(message, history, sessionId.value)
    const reply =
      res.reply ||
      (res.outcome === 'success' ? '已执行' : res.outcome === 'blocked' ? '该指令未被执行。' : '无回复')
    messages.value.push({
      role: 'assistant',
      text: reply,
      tools: res.toolCalls?.length ? res.toolCalls.map((c) => c.name).join(' → ') : '',
      outcome: res.outcome,
    })
    const ttsOn = getConfigSection('voice')?.ttsEnabled !== false
    if (fromVoice && ttsOn && reply) await speak(reply)
  } catch (e: unknown) {
    const fail = getApiErrorMessage(e, '管家暂时不可用')
    messages.value.push({ role: 'assistant', text: fail })
    if (fromVoice && getConfigSection('voice')?.ttsEnabled !== false) await speak(fail)
  } finally {
    busy.value = false
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
            <p class="acp-bubble__text">{{ m.text }}</p>
            <p v-if="m.outcome === 'blocked'" class="acp-bubble__blocked">
              <ShieldAlert class="acp-bubble__blocked-icon" aria-hidden="true" />
              {{ BLOCKED_NOTICE }}
            </p>
            <p v-if="m.tools" class="acp-bubble__tools">{{ m.tools }}</p>
          </article>
          <article v-if="busy" class="acp-bubble acp-bubble--assistant">
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
            type="submit"
            class="acp-send"
            :disabled="busy || agentBlocked || !input.trim()"
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

.acp-head__text {
  flex: 1;
  min-width: 0;
}

.acp-head__title {
  margin: 0;
  font-size: 15px;
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

/* 快捷指令 chips：竖屏窄屏下自动换行，避免横向溢出 */
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
