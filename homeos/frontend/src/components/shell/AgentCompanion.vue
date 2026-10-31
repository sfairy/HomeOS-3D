<!--
  AI 悬浮伴侣：贴在画面上任意位置的小管家入口（造型 / 气泡 / 状态机移植自源码 HomeOSPeekingMascot）。
  - 双击：打开智能管家对话面板
  - 单击：展开「灵感指令」气泡，再单击换一条（6 秒无操作自动收起）
  - 长按（≥350ms）：开始语音输入，松手把识别结果就地发给管家并显示回复气泡（上滑 45px 取消）
  - 按住拖动：把图标挪到画面任意位置，松手写回布局并静默保存

  位置优先读 layout.agentConfig.companion 的 xPercent / yPercent（视口百分比中心点）；
  旧布局只有 side + topPercent 时按原停靠逻辑推导落点，拖动后自动升级为自由位置。
  只在仪表盘等主界面显示；对话面板打开时自己隐藏，避免和模态互相抢焦点。

  拖动过程只写本地 dragCenter，不碰布局配置；松手才提交一次，避免每像素都触发保存。
  气泡不贴屏幕边缘：按当前落点算出水平位移夹在视口内，顶部空间不足时翻到机器人下方。
-->
<template>
  <div
    v-if="visible"
    ref="rootRef"
    class="companion-root"
    :class="[`companion-root--${state}`, { 'companion-root--dragging': dragging }]"
    :style="positionStyle"
  >
    <Transition name="bubble-pop">
      <div
        v-if="state === 'greeting'"
        key="greeting"
        class="companion-bubble"
        :class="{ 'companion-bubble--below': bubbleFlipped }"
        :style="bubbleStyle"
      >
        <div class="companion-bubble__header">
          <span class="companion-bubble__title">HomeOS AI</span>
        </div>
        <div class="companion-bubble__body">{{ GREETING }}</div>
        <div class="companion-bubble__arrow" aria-hidden="true"></div>
      </div>

      <div
        v-else-if="state === 'tips'"
        key="tips"
        class="companion-bubble"
        :class="{ 'companion-bubble--below': bubbleFlipped }"
        :style="bubbleStyle"
      >
        <div class="companion-bubble__header">
          <div class="companion-bubble__title-group">
            <span class="companion-tips-dot" aria-hidden="true"></span>
            <span class="companion-bubble__title">
              灵感指令 ({{ tipIndex + 1 }}/{{ TIPS.length }})
            </span>
          </div>
          <button
            type="button"
            class="companion-bubble__close"
            aria-label="收起灵感指令"
            @click.stop="collapseToIdle"
            @keydown.stop
          >
            <X :size="14" />
          </button>
        </div>
        <div class="companion-bubble__body companion-bubble__body--strong">
          “{{ currentTip }}”
        </div>
        <div class="companion-bubble__footer">
          <span>单击换一条 · 长按直接说 · 双击开视窗</span>
        </div>
        <div class="companion-bubble__arrow" aria-hidden="true"></div>
      </div>

      <div
        v-else-if="state === 'listening'"
        key="listening"
        class="companion-bubble companion-bubble--voice"
        :class="{ 'companion-bubble--below': bubbleFlipped }"
        :style="bubbleStyle"
      >
        <div class="companion-hud__header">
          <span
            class="companion-hud__dot"
            :class="{ 'companion-hud__dot--cancel': slideCancel }"
            aria-hidden="true"
          ></span>
          <span class="companion-hud__title" :class="{ 'is-cancel': slideCancel }">
            {{ hudTitle }}
          </span>
        </div>
        <div class="companion-hud__transcript">{{ hudTranscript }}</div>
        <div class="companion-hud__wave" aria-hidden="true">
          <span
            v-for="(bar, index) in waveBars"
            :key="index"
            class="companion-hud__bar"
            :class="{ 'companion-hud__bar--cancel': slideCancel }"
            :style="{ height: `${bar}px` }"
          ></span>
        </div>
        <div class="companion-hud__footer" :class="{ 'is-cancel': slideCancel }">
          {{ hudFooter }}
        </div>
        <div class="companion-bubble__arrow" aria-hidden="true"></div>
      </div>

      <div
        v-else-if="state === 'thinking'"
        key="thinking"
        class="companion-bubble companion-bubble--thinking"
        :class="{ 'companion-bubble--below': bubbleFlipped }"
        :style="bubbleStyle"
      >
        <div class="companion-thinking">
          <span class="companion-thinking__spinner" aria-hidden="true"></span>
          <span class="companion-thinking__text">HomeOS 正在执行指令...</span>
        </div>
        <div class="companion-bubble__arrow" aria-hidden="true"></div>
      </div>

      <div
        v-else-if="state === 'replying'"
        key="replying"
        class="companion-bubble companion-bubble--reply"
        :class="{ 'companion-bubble--below': bubbleFlipped }"
        :style="bubbleStyle"
      >
        <div class="companion-bubble__header">
          <div class="companion-bubble__title-group">
            <span class="companion-reply-badge">HomeOS AI</span>
            <span class="companion-reply-time">刚刚</span>
          </div>
          <button
            type="button"
            class="companion-bubble__close"
            aria-label="收起回复"
            @click.stop="collapseToIdle"
            @keydown.stop
          >
            <X :size="14" />
          </button>
        </div>
        <div class="companion-reply-content">{{ replyText }}</div>
        <div class="companion-bubble__arrow" aria-hidden="true"></div>
      </div>
    </Transition>

    <div
      ref="triggerRef"
      class="companion-trigger"
      :class="{
        'is-waving': state === 'greeting',
        'is-recording': state === 'listening',
        'is-cancel': slideCancel,
        'is-lifted': dragging,
        'is-busy': state === 'thinking' || state === 'replying',
      }"
      role="button"
      tabindex="0"
      :aria-label="ariaLabel"
      :title="hint"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
      @pointerleave="onPointerLeave"
      @keydown.enter.prevent="openChat"
      @keydown.space.prevent="openChat"
      @contextmenu.prevent
    >
      <span class="companion-halo" aria-hidden="true"></span>
      <AgentMechaAvatar
        class="companion-avatar"
        :mode="isSleeping ? 'sleep' : 'active'"
        :is-active="!isSleeping"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { X } from '@lucide/vue'
import { useLayoutStore } from '@/stores/layout.store'
import { useChromeStore } from '@/stores/chrome.store'
import { useAuthStore } from '@/stores/auth.store'
import { isLicenseFeatureGranted } from '@/router/license-gate'
import { useSpeechToText } from '@/composables/voice/useSpeechToText'
import { logger } from '@/shared/utils/core/logger'
import AgentMechaAvatar from './agent-companion/AgentMechaAvatar.vue'
import { askCompanion } from './agent-companion/useCompanionChat'
import {
  AGENT_COMPANION_FACE_SIZE,
  clampCompanionPercent,
  normalizeAgentCompanion,
  resolveAgentCompanionPosition,
  resolveAgentCompanionStageSize,
  roundCompanionPercent,
} from '@/shared/utils/layout/agent-companion.util'

/** 伴侣的展示状态：dormant 是刚挂载的静默期，idle 是静止待机（收缩形态） */
type CompanionState = 'dormant' | 'greeting' | 'idle' | 'tips' | 'listening' | 'thinking' | 'replying'
/** 可挂起的定时任务名（集中清理，避免卸载后回调改写状态） */
type TimerKey = 'hold' | 'tap' | 'tips' | 'reply' | 'greeting' | 'settle'

/** 长按时长阈值：短于此判定为点击（换灵感 / 双击开窗），长按才进入语音 */
const HOLD_MS = 350
/** 双击窗口：第一次松手等这么久没有第二次才算单击 */
const DOUBLE_TAP_MS = 280
/** 挂载后多久冒问候气泡（源码 1400ms） */
const GREETING_DELAY_MS = 1400
/** 问候气泡停留时长（源码 4600ms） */
const GREETING_HOLD_MS = 4600
/** 灵感指令气泡无操作自动收起（源码 6000ms） */
const TIPS_HOLD_MS = 6000
/** 回复气泡停留时长（源码 3800ms） */
const REPLY_HOLD_MS = 3800
/** 语音中上滑超过该距离即进入「松开取消」（源码 45px） */
const CANCEL_UP_PX = 45
/** 超过这个位移才算拖动，避免手抖把「点击」变成「挪位置」 */
const DRAG_START_DISTANCE = 6
/** 拖动时图标离视口边缘的最小间距（px） */
const DRAG_EDGE_MARGIN = 8
/** 气泡与视口边缘的最小留白（px，设计坐标系） */
const BUBBLE_EDGE_GAP = 10
/** 气泡宽度区间（px，设计坐标系） */
const BUBBLE_MIN_WIDTH = 236
const BUBBLE_MAX_WIDTH = 300
/** 机器人中心低于该高度（px）就认为上方放不下气泡，改到下方展开 */
const BUBBLE_FLIP_TOP = 236
/** 停止录音后多久没拿到识别结果就回到待机，避免 HUD 卡死 */
const VOICE_SETTLE_MS = 1000
/** 问候语（与源码 page.mascotGreeting 同文案） */
const GREETING = '主人好！长按我直接语音控制 ~'

/** 灵感指令：逐条对齐源码，顺序一致 */
const TIPS = [
  '关闭家里所有开启的灯',
  '把客厅空调调至 26 度',
  '今天和明天的天气如何？',
  '客厅有点热，帮我开一下风扇',
  '开启全屋睡眠模式',
  '查看当前所有离线设备与告警',
  '把主卧窗帘拉上一半',
  '播放一些轻松的爵士音乐',
  '现在的全屋总用电功率是多少',
  '把玄关射灯调到 50% 亮度',
  '全屋空气质量怎么样？',
  '开启离家安防布防',
]

/** 语音波形柱的基准权重（源码同一组数字） */
const WAVE_WEIGHTS = [0.45, 0.75, 1, 0.85, 1, 0.7, 0.4]

const route = useRoute()
const layoutStore = useLayoutStore()
const chrome = useChromeStore()
const authStore = useAuthStore()

const rootRef = ref<HTMLElement | null>(null)
const triggerRef = ref<HTMLElement | null>(null)

const state = ref<CompanionState>('dormant')
const tipIndex = ref(0)
const replyText = ref('')
const spokenText = ref('')
const slideCancel = ref(false)
const waveBars = ref<number[]>(WAVE_WEIGHTS.map(() => 6))
const viewport = ref({
  width: typeof window === 'undefined' ? 0 : window.innerWidth,
  height: typeof window === 'undefined' ? 0 : window.innerHeight,
})
const stageSize = ref(
  typeof window === 'undefined' ? { width: 0, height: 0 } : resolveAgentCompanionStageSize(),
)

const dragging = ref(false)
/** 拖动中的中心点（px）；松手后清空，位置改读布局配置 */
const dragCenter = ref<{ x: number; y: number } | null>(null)

const timers: Record<TimerKey, ReturnType<typeof setTimeout> | null> = {
  hold: null,
  tap: null,
  tips: null,
  reply: null,
  greeting: null,
  settle: null,
}

/** 本次按下的指针会话：起点、抓取偏移与起始中心点 */
let pressSession: {
  pointerId: number
  startX: number
  startY: number
  centerX: number
  centerY: number
} | null = null
/** 本次按下是否已升级成语音（松手时据此决定「发送」还是「单击」） */
let voiceStarted = false
/** 识别回调是否应被丢弃（上滑取消后浏览器仍可能吐出结果） */
let discardVoice = false
let lastTapAt = 0
let waveFrame = 0
let wavePhase = 0

const { listening, transcribing, startListen, stopListen } = useSpeechToText({
  // 尊重设置里的 voice.sttMode：选浏览器识别时才能拿到实时字幕，
  // HA 录音模式下仍只有最终结果（HUD 期间显示占位文案）。
  preferHa: false,
  onInterim: (text) => {
    spokenText.value = text
  },
  onFinal: (text) => void handleVoiceResult(text),
})

const config = computed(() =>
  normalizeAgentCompanion(layoutStore.layoutConfig?.agentConfig?.companion),
)
const chatOpen = computed(() => chrome.isAgentChatOpen)
const currentTip = computed(() => TIPS[tipIndex.value % TIPS.length])
const isSleeping = computed(() => state.value === 'idle' || state.value === 'dormant')

const ariaLabel = computed(() => {
  if (state.value === 'listening') return '正在聆听，松开发送'
  return 'HomeOS 智能管家（长按语音 · 单击灵感 · 双击展开）'
})
const hint = computed(() => 'HomeOS 智能管家 (长按语音 · 单击灵感 · 双击展开)')

const hudTitle = computed(() => {
  if (slideCancel.value) return '松开手指，取消发送'
  if (transcribing.value) return '识别整理中...'
  return '正在倾听您的吩咐...'
})
const hudTranscript = computed(() => {
  if (spokenText.value) return spokenText.value
  return transcribing.value ? '正在识别语音...' : '请说出控制指令...'
})
const hudFooter = computed(() => (slideCancel.value ? '已准备取消' : '松开自动发送 · 上滑取消'))

/**
 * 只在仪表盘显示：设置 / 编辑器等页面本身就有成片的表单与浮层，
 * 贴边小管家会持续遮住控件，收益远低于干扰。
 */
const visible = computed(
  () =>
    config.value.enabled &&
    authStore.isAuthenticated &&
    isLicenseFeatureGranted('module.agent') &&
    route.name === 'dashboard' &&
    !chatOpen.value,
)

/* ------------------------------------------------------------------ 定时器 */

function clearTimer(name: TimerKey) {
  const timer = timers[name]
  if (timer) clearTimeout(timer)
  timers[name] = null
}

function setTimer(name: TimerKey, fn: () => void, ms: number) {
  clearTimer(name)
  timers[name] = setTimeout(() => {
    timers[name] = null
    fn()
  }, ms)
}

function clearAllTimers() {
  for (const name of Object.keys(timers) as TimerKey[]) clearTimer(name)
}

/* ------------------------------------------------------------------ 位置 */

function viewportSize() {
  return {
    width: window.innerWidth || viewport.value.width || 1,
    height: window.innerHeight || viewport.value.height || 1,
  }
}

/** 气泡定位用的设计坐标系尺寸（整页等比缩放时百分比相对壳层解析） */
function stagePx() {
  const stage = stageSize.value
  return {
    width: stage.width || viewport.value.width || 1,
    height: stage.height || viewport.value.height || 1,
  }
}

/** 当前壳层缩放系数：外壳等比缩放时 66px 设计尺寸只占约 40 个屏幕像素 */
function shellScale() {
  const rect = triggerRef.value?.getBoundingClientRect()
  return rect && rect.width > 0 ? rect.width / AGENT_COMPANION_FACE_SIZE : 1
}

/** 把中心点夹在视口内，保证圆脸完整可见（边距同样按壳层缩放换算） */
function clampCenter(center: { x: number; y: number }) {
  const { width, height } = viewportSize()
  const margin = (AGENT_COMPANION_FACE_SIZE / 2 + DRAG_EDGE_MARGIN) * shellScale()
  return {
    x: Math.min(Math.max(center.x, margin), Math.max(margin, width - margin)),
    y: Math.min(Math.max(center.y, margin), Math.max(margin, height - margin)),
  }
}

/** 当前落点（视口百分比）：拖动中读 dragCenter，否则读布局配置 / 旧版停靠回退 */
const positionPercent = computed(() => {
  if (dragCenter.value) {
    const { width, height } = viewportSize()
    const center = clampCenter(dragCenter.value)
    return {
      xPercent: roundCompanionPercent((center.x / width) * 100),
      yPercent: roundCompanionPercent((center.y / height) * 100),
    }
  }
  const stage = resolveAgentCompanionStageSize()
  const resolved = resolveAgentCompanionPosition(config.value, {
    panelPosition: layoutStore.layoutConfig?.panelPosition,
    panelWidth: Number(layoutStore.layoutConfig?.rightPanelWidth) || 0,
    viewportWidth: stage.width,
    viewportHeight: stage.height,
  })
  const { width, height } = viewportSize()
  const center = clampCenter({
    x: (resolved.xPercent / 100) * width,
    y: (resolved.yPercent / 100) * height,
  })
  return {
    xPercent: roundCompanionPercent((center.x / width) * 100),
    yPercent: roundCompanionPercent((center.y / height) * 100),
  }
})

const positionStyle = computed(() => ({
  left: `${positionPercent.value.xPercent}%`,
  top: `${positionPercent.value.yPercent}%`,
}))

/** 气泡宽度：随画面宽度收缩，但保持在可读区间 */
const bubbleWidth = computed(() => {
  const { width } = stagePx()
  return Math.min(BUBBLE_MAX_WIDTH, Math.max(BUBBLE_MIN_WIDTH, width * 0.46))
})

/** 气泡水平位移：让气泡整体留在视口内，又不离开机器人太远 */
const bubbleShift = computed(() => {
  const { width } = stagePx()
  const half = bubbleWidth.value / 2
  const anchorX = (positionPercent.value.xPercent / 100) * width
  const min = BUBBLE_EDGE_GAP - (anchorX - half)
  const max = width - BUBBLE_EDGE_GAP - (anchorX + half)
  if (min > max) return (min + max) / 2
  return Math.min(Math.max(0, min), max)
})

/** 箭头始终指向机器人，而不是跟着气泡一起被推走 */
const bubbleArrowLeft = computed(() => {
  const offset = bubbleWidth.value / 2 - bubbleShift.value
  return Math.min(Math.max(offset, 18), bubbleWidth.value - 18)
})

const bubbleStyle = computed(() => ({
  width: `${bubbleWidth.value}px`,
  '--bubble-shift': `${bubbleShift.value}px`,
  '--bubble-arrow-left': `${bubbleArrowLeft.value}px`,
}))

/** 顶部放不下气泡就翻到机器人下方（箭头同步翻面） */
const bubbleFlipped = computed(() => {
  const { height } = stagePx()
  const anchorY = (positionPercent.value.yPercent / 100) * height
  return anchorY - AGENT_COMPANION_FACE_SIZE / 2 < BUBBLE_FLIP_TOP
})

/* ------------------------------------------------------------------ 状态切换 */

/** 收起当前气泡回到待机（正在思考 / 录音时不打断） */
function collapseToIdle() {
  if (state.value === 'thinking' || state.value === 'listening') return
  clearTimer('tips')
  clearTimer('reply')
  state.value = 'idle'
}

/** 展开灵感指令；已在 tips 时换下一条 */
function enterTips() {
  if (state.value === 'thinking' || state.value === 'listening' || state.value === 'replying') return
  if (state.value === 'tips') tipIndex.value = (tipIndex.value + 1) % TIPS.length
  state.value = 'tips'
  setTimer('tips', closeTips, TIPS_HOLD_MS)
}

function closeTips() {
  if (state.value === 'tips') state.value = 'idle'
}

/** 挂载静默期结束：冒问候气泡并挥手 */
function wakeUp() {
  if (state.value !== 'dormant') return
  state.value = 'greeting'
  setTimer('greeting', closeGreeting, GREETING_HOLD_MS)
}

function closeGreeting() {
  if (state.value === 'greeting') state.value = 'idle'
}

/* ------------------------------------------------------------------ 语音 */

function stopWave() {
  if (waveFrame) cancelAnimationFrame(waveFrame)
  waveFrame = 0
  waveBars.value = WAVE_WEIGHTS.map(() => 6)
}

function tickWave() {
  wavePhase += 0.22
  waveBars.value = WAVE_WEIGHTS.map((weight, index) => {
    const wobble = 0.55 + 0.45 * Math.abs(Math.sin(wavePhase + index * 0.7))
    return Math.round(6 + Math.min(1, weight * wobble * 1.35) * 18)
  })
  waveFrame = requestAnimationFrame(tickWave)
}

function startWave() {
  stopWave()
  if (typeof window === 'undefined') return
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
  waveFrame = requestAnimationFrame(tickWave)
}

/** 长按达标：接管本次手势并开始录音 */
function beginVoice() {
  timers.hold = null
  clearTimer('tap')
  lastTapAt = 0
  voiceStarted = true
  discardVoice = false
  slideCancel.value = false
  spokenText.value = ''
  state.value = 'listening'
  startListen()
  startWave()
}

/** 语音中上滑超过阈值：松开即取消 */
function updateSlideCancel(event: PointerEvent) {
  const session = pressSession
  if (!session) return
  slideCancel.value = event.clientY - session.startY < -CANCEL_UP_PX
}

/** 松手：取消则丢弃结果，否则交给识别流程（onFinal / settle 兜底） */
function finishVoice() {
  const canceled = slideCancel.value
  slideCancel.value = false
  if (canceled) {
    discardVoice = true
    stopListen()
    stopWave()
    state.value = 'idle'
    return
  }
  stopListen()
  stopWave()
  // 主动排一次收尾检查：识别引擎根本没启动（权限被拒 / 非安全上下文）时不会触发 listening 变化
  watchVoiceSettle()
}

/** 识别出文本：就地发给管家，先思考后回复 */
async function handleVoiceResult(text: string) {
  if (discardVoice) {
    discardVoice = false
    return
  }
  const message = text.trim()
  if (!message) {
    state.value = 'idle'
    return
  }
  clearTimer('settle')
  state.value = 'thinking'
  replyText.value = await askCompanion(message)
  // 等待期间用户可能又开了新一轮语音 / 关了气泡，别把状态抢回来
  if (state.value !== 'thinking') return
  state.value = 'replying'
  setTimer('reply', collapseToIdle, REPLY_HOLD_MS)
}

/* ------------------------------------------------------------------ 手势 */

/** 单击 / 双击仲裁：窗口内第二次按下算双击开窗，否则延迟展开灵感指令 */
function registerTap() {
  const now = Date.now()
  const isDouble = now - lastTapAt <= DOUBLE_TAP_MS
  if (isDouble) {
    lastTapAt = 0
    clearTimer('tap')
    openChat()
    return
  }
  lastTapAt = now
  setTimer('tap', enterTips, DOUBLE_TAP_MS)
}

function openChat() {
  collapseToIdle()
  chrome.openAgentChat()
}

function capturePointer(pointerId: number) {
  try {
    triggerRef.value?.setPointerCapture(pointerId)
  } catch {
    /* 指针捕获：元素已卸载或指针已失效时规范允许抛错，忽略即可 */
  }
}

function releasePointer(pointerId: number) {
  try {
    triggerRef.value?.releasePointerCapture(pointerId)
  } catch {
    /* 指针捕获：指针已失效时规范要求抛错，忽略即可 */
  }
}

function onPointerDown(event: PointerEvent) {
  if (event.pointerType === 'mouse' && event.button !== 0) return
  clearTimer('hold')
  voiceStarted = false
  discardVoice = false
  slideCancel.value = false
  const rect = triggerRef.value?.getBoundingClientRect()
  pressSession = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    centerX: rect ? rect.left + rect.width / 2 : 0,
    centerY: rect ? rect.top + rect.height / 2 : 0,
  }
  dragging.value = false
  dragCenter.value = null
  capturePointer(event.pointerId)
  setTimer('hold', beginVoice, HOLD_MS)
}

/** 进入拖动：收起气泡并取消尚未触发的长按 / 单击 */
function startDrag(event: PointerEvent) {
  dragging.value = true
  clearTimer('hold')
  clearTimer('tap')
  lastTapAt = 0
  collapseToIdle()
  if (event.cancelable) event.preventDefault()
}

function moveDrag(event: PointerEvent) {
  const session = pressSession
  if (!session) return
  dragCenter.value = clampCenter({
    x: session.centerX + (event.clientX - session.startX),
    y: session.centerY + (event.clientY - session.startY),
  })
}

function onPointerMove(event: PointerEvent) {
  const session = pressSession
  if (!session || event.pointerId !== session.pointerId) return
  if (voiceStarted) {
    updateSlideCancel(event)
    return
  }
  const distance = Math.hypot(event.clientX - session.startX, event.clientY - session.startY)
  if (!dragging.value && distance < DRAG_START_DISTANCE) return
  if (!dragging.value) startDrag(event)
  moveDrag(event)
}

function onPointerUp(event?: PointerEvent) {
  const session = pressSession
  if (event && session && event.pointerId !== session.pointerId) return
  const wasVoice = voiceStarted
  const wasDragging = dragging.value
  const droppedCenter = dragCenter.value

  clearTimer('hold')
  if (session) releasePointer(session.pointerId)
  pressSession = null
  voiceStarted = false
  dragging.value = false
  dragCenter.value = null

  if (wasDragging) {
    if (droppedCenter) persistPosition(droppedCenter)
    return
  }
  if (wasVoice) {
    finishVoice()
    return
  }
  registerTap()
}

/** 离开元素只收起拖动中的会话，不打断已开始的语音 */
function onPointerLeave() {
  if (dragging.value || voiceStarted) return
  clearTimer('hold')
  pressSession = null
}

/** 松手落库：写回布局配置并静默保存一次，失败仍由 saveLayout 统一提示 */
function persistPosition(center: { x: number; y: number }) {
  const agentConfig = layoutStore.layoutConfig?.agentConfig
  if (!agentConfig || !layoutStore.isConfigLoaded) return
  const { width, height } = viewportSize()
  const clamped = clampCenter(center)
  const current = normalizeAgentCompanion(agentConfig.companion)
  agentConfig.companion = {
    ...current,
    xPercent: clampCompanionPercent((clamped.x / width) * 100, 50),
    yPercent: clampCompanionPercent((clamped.y / height) * 100, 60),
  }
  void layoutStore.saveLayout(true)
}

/* ------------------------------------------------------------------ 生命周期 */

/** 录音结束后迟迟没有结果（未识别到语音 / 识别失败）时兜底回待机 */
function watchVoiceSettle() {
  const settled = !listening.value && !transcribing.value
  if (!settled) {
    clearTimer('settle')
    return
  }
  if (state.value !== 'listening') return
  setTimer(
    'settle',
    () => {
      if (state.value === 'listening') {
        logger.debug('悬浮伴侣语音未返回识别结果，回到待机')
        state.value = 'idle'
      }
    },
    VOICE_SETTLE_MS,
  )
}

watch([listening, transcribing], watchVoiceSettle)

/** 录音意外恢复（权限弹窗在松手后才通过）时立刻收口，避免留下一条没人停的麦克风 */
watch(listening, (value) => {
  if (value && state.value !== 'listening') stopListen()
})

watch(visible, (value) => {
  clearAllTimers()
  stopWave()
  slideCancel.value = false
  if (!value) {
    pressSession = null
    voiceStarted = false
    dragging.value = false
    dragCenter.value = null
    stopListen()
    state.value = 'idle'
    return
  }
  if (state.value === 'dormant') setTimer('greeting', wakeUp, GREETING_DELAY_MS)
})

function syncViewport() {
  viewport.value = { width: window.innerWidth, height: window.innerHeight }
  stageSize.value = resolveAgentCompanionStageSize()
}

onMounted(() => {
  syncViewport()
  window.addEventListener('resize', syncViewport, { passive: true })
  if (visible.value && state.value === 'dormant') setTimer('greeting', wakeUp, GREETING_DELAY_MS)
})

onUnmounted(() => {
  window.removeEventListener('resize', syncViewport)
  clearAllTimers()
  stopWave()
  stopListen()
})
</script>

<style scoped>
/* 动画中的自定义属性必须先注册成 <angle>，否则 conic-gradient 无法逐帧插值 */
@property --chroma-angle {
  syntax: '<angle>';
  inherits: false;
  initial-value: 0deg;
}

@keyframes chroma-flow {
  0% {
    --chroma-angle: 0deg;
  }
  100% {
    --chroma-angle: 360deg;
  }
}

/* 根节点就是机器人本体：气泡绝对定位在上下，拖动时尺寸不会因气泡出现而抖动 */
.companion-root {
  position: fixed;
  z-index: var(--z-modal);
  width: 66px;
  height: 66px;
  transform: translate(-50%, -50%);
  pointer-events: none;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
}

.companion-trigger {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 66px;
  height: 66px;
  border-radius: 50%;
  cursor: pointer;
  pointer-events: auto;
  filter: drop-shadow(0 4px 14px rgba(0, 0, 0, 0.45));
  touch-action: none;
  transition:
    transform 0.65s cubic-bezier(0.34, 1.56, 0.64, 1),
    scale 0.3s ease,
    filter 0.3s ease;
}

.companion-root--dragging .companion-trigger {
  cursor: grabbing;
}

.companion-trigger.is-lifted {
  scale: 1.08;
  filter: drop-shadow(0 14px 30px rgba(0, 0, 0, 0.6));
}

.companion-trigger.is-recording,
.companion-trigger.is-busy {
  scale: 1.05;
}

.companion-trigger:focus-visible {
  outline: 2px solid rgba(0, 240, 255, 0.75);
  outline-offset: 4px;
}

/* 麦克风开启时的外发光；取消态换红色 */
.companion-halo {
  position: absolute;
  inset: -6px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(0, 240, 255, 0.35) 0%, transparent 70%);
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.3s ease;
}

.companion-root--listening .companion-halo {
  opacity: 1;
  animation: companion-halo-pulse 1.2s ease-in-out infinite;
}

.companion-trigger.is-cancel .companion-halo {
  background: radial-gradient(circle, rgba(244, 63, 94, 0.45) 0%, transparent 70%);
}

@keyframes companion-halo-pulse {
  0%,
  100% {
    opacity: 0.6;
    transform: scale(1);
  }
  50% {
    opacity: 1;
    transform: scale(1.2);
  }
}

/* 问候时左右挥手；用独立的 rotate 属性，避免和 scale 互相覆盖 */
.companion-trigger.is-waving {
  animation: companion-wave 2.2s ease-in-out infinite;
}

@keyframes companion-wave {
  0%,
  100% {
    rotate: 0deg;
  }
  25% {
    rotate: -10deg;
    scale: 1.06;
  }
  50% {
    rotate: 10deg;
    scale: 1.06;
  }
  75% {
    rotate: -6deg;
    scale: 1.02;
  }
}

/* ------------------------------------------------------------------ 气泡 */

.companion-bubble {
  position: absolute;
  bottom: calc(100% + 14px);
  left: 50%;
  transform: translateX(calc(-50% + var(--bubble-shift, 0px)));
  padding: 12px 14px;
  border-radius: 18px;
  pointer-events: auto;
  text-align: left;
  user-select: none;
}

.companion-bubble--below {
  bottom: auto;
  top: calc(100% + 14px);
}

/* 外发光：模糊后的七彩描边，透出气泡边缘 */
.companion-bubble::before {
  content: '';
  position: absolute;
  inset: -3px;
  z-index: 1;
  border-radius: 21px;
  background: conic-gradient(
    from var(--chroma-angle),
    #4285f4 0deg,
    #9b51e0 72deg,
    #ea4335 144deg,
    #fbbc05 216deg,
    #34a853 288deg,
    #4285f4 360deg
  );
  filter: blur(8px);
  opacity: 0.75;
  pointer-events: none;
  animation: chroma-flow 4.8s linear infinite;
}

/* 面板本体：深色底 + 同一条渐变做 border-box 描边 */
.companion-bubble::after {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 2;
  border: 1.5px solid transparent;
  border-radius: 18px;
  background:
    linear-gradient(rgba(15, 23, 42, 0.96), rgba(15, 23, 42, 0.96)) padding-box,
    conic-gradient(
        from var(--chroma-angle),
        #4285f4 0deg,
        #9b51e0 72deg,
        #ea4335 144deg,
        #fbbc05 216deg,
        #34a853 288deg,
        #4285f4 360deg
      )
      border-box;
  backdrop-filter: blur(24px);
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.75);
  pointer-events: none;
  animation: chroma-flow 4.8s linear infinite;
}

.companion-bubble > * {
  position: relative;
  z-index: 3;
}

/* 气泡指向机器人的小三角 */
.companion-bubble__arrow {
  position: absolute;
  left: var(--bubble-arrow-left, 50%);
  bottom: -6px;
  z-index: 4;
  width: 12px;
  height: 12px;
  transform: translateX(-50%) rotate(45deg);
  background: rgba(15, 23, 42, 0.96);
  border-right: 1.5px solid rgba(66, 133, 244, 0.45);
  border-bottom: 1.5px solid rgba(52, 168, 83, 0.45);
}

.companion-bubble--below .companion-bubble__arrow {
  bottom: auto;
  top: -6px;
  border-right: none;
  border-bottom: none;
  border-top: 1.5px solid rgba(66, 133, 244, 0.45);
  border-left: 1.5px solid rgba(52, 168, 83, 0.45);
}

.companion-bubble__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}

.companion-bubble__title-group {
  display: flex;
  align-items: center;
  gap: 6px;
}

.companion-bubble__title {
  color: #00f0ff;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.06em;
}

.companion-bubble__close {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #64748b;
  cursor: pointer;
  transition:
    color 0.2s ease,
    background-color 0.2s ease;
}

.companion-bubble__close:hover {
  color: #fff;
  background: rgba(255, 255, 255, 0.1);
}

.companion-bubble__body {
  color: #f1f5f9;
  font-size: 13px;
  line-height: 1.45;
}

.companion-bubble__body--strong {
  font-weight: 500;
}

.companion-bubble__footer {
  margin-top: 8px;
  color: #64748b;
  font-size: 12px;
  letter-spacing: 0.02em;
}

.companion-tips-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #00f0ff;
  box-shadow: 0 0 8px #00f0ff;
}

/* ------------------------------------------------------------------ 语音 HUD */

.companion-bubble--voice {
  border-color: rgba(0, 240, 255, 0.45);
  box-shadow:
    0 12px 36px rgba(0, 0, 0, 0.7),
    0 0 24px rgba(0, 240, 255, 0.25);
}

.companion-hud__header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.companion-hud__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #00f0ff;
  box-shadow: 0 0 10px #00f0ff;
  animation: companion-dot-pulse 1s infinite;
}

.companion-hud__dot--cancel {
  background: #f43f5e;
  box-shadow: 0 0 10px #f43f5e;
}

.companion-hud__title {
  color: #00f0ff;
  font-size: 12px;
  font-weight: 700;
}

.companion-hud__title.is-cancel {
  color: #fb7185;
}

.companion-hud__transcript {
  min-height: 20px;
  margin-bottom: 10px;
  color: #e2e8f0;
  font-size: 13px;
  line-height: 1.45;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.companion-hud__wave {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  height: 38px;
  margin-bottom: 8px;
  padding: 0 12px;
  border-radius: 10px;
  background: rgba(0, 0, 0, 0.35);
}

.companion-hud__bar {
  width: 3.5px;
  border-radius: 3px;
  background: #00f0ff;
  box-shadow: 0 0 8px rgba(0, 240, 255, 0.6);
  transition: height 80ms linear;
}

.companion-hud__bar--cancel {
  background: #f43f5e;
  box-shadow: 0 0 8px rgba(244, 63, 94, 0.6);
}

.companion-hud__footer {
  color: #94a3b8;
  font-size: 12px;
  text-align: center;
}

.companion-hud__footer.is-cancel {
  color: #fb7185;
}

@keyframes companion-dot-pulse {
  0%,
  100% {
    opacity: 0.6;
    transform: scale(0.9);
  }
  50% {
    opacity: 1;
    transform: scale(1.1);
  }
}

/* ------------------------------------------------------------------ 思考 / 回复 */

.companion-bubble--thinking {
  min-width: 180px;
  padding: 10px 14px;
}

.companion-thinking {
  display: flex;
  align-items: center;
  gap: 8px;
}

.companion-thinking__spinner {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(0, 240, 255, 0.2);
  border-top-color: #00f0ff;
  border-radius: 50%;
  animation: companion-spin 0.8s linear infinite;
}

.companion-thinking__text {
  color: #67e8f9;
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.02em;
}

@keyframes companion-spin {
  to {
    transform: rotate(360deg);
  }
}

.companion-bubble--reply {
  border-color: rgba(52, 211, 153, 0.35);
  box-shadow:
    0 12px 36px rgba(0, 0, 0, 0.65),
    0 0 20px rgba(52, 211, 153, 0.15);
}

.companion-reply-badge {
  padding: 2px 6px;
  border: 1px solid rgba(52, 211, 153, 0.35);
  border-radius: 6px;
  background: rgba(52, 211, 153, 0.15);
  color: #34d399;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.04em;
}

.companion-reply-time {
  color: #94a3b8;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
}

.companion-reply-content {
  color: #f1f5f9;
  font-size: 12.5px;
  line-height: 1.5;
  max-height: 132px;
  overflow-y: auto;
  word-break: break-word;
}

/* ------------------------------------------------------------------ 进出场 */

.bubble-pop-enter-active,
.bubble-pop-leave-active {
  transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.bubble-pop-enter-from {
  opacity: 0;
  transform: translateX(calc(-50% + var(--bubble-shift, 0px))) scale(0.9) translateY(10px);
}

.bubble-pop-leave-to {
  opacity: 0;
  transform: translateX(calc(-50% + var(--bubble-shift, 0px))) scale(0.95) translateY(4px);
}

/* 低性能模式 / 用户偏好减少动效时，只保留静态形态 */
@media (prefers-reduced-motion: reduce) {
  .companion-trigger,
  .companion-halo,
  .companion-hud__dot,
  .companion-thinking__spinner,
  .companion-bubble::before,
  .companion-bubble::after {
    animation: none !important;
  }

  .bubble-pop-enter-active,
  .bubble-pop-leave-active {
    transition: none;
  }
}
</style>