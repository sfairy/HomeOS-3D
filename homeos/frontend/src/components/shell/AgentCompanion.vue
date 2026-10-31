<!--
  AI 悬浮伴侣：贴在画面上任意位置的小管家入口。
  - 单击：打开智能管家对话面板
  - 长按（≥350ms）：开始语音输入，松手把识别结果作为一条消息发给管家
  - 按住拖动：把图标挪到画面任意位置，松手写回布局并静默保存

  位置优先读 layout.agentConfig.companion 的 xPercent / yPercent（视口百分比中心点）；
  旧布局只有 side + topPercent 时按原停靠逻辑推导落点，拖动后自动升级为自由位置。
  只在仪表盘等主界面显示；对话面板打开时自己隐藏，避免和模态互相抢焦点。

  拖动过程只写本地 dragCenter，不碰布局配置；松手才提交一次，避免每像素都触发保存。
-->
<template>
  <button
    v-if="visible"
    ref="rootRef"
    type="button"
    class="agent-companion"
    :class="[
      `agent-companion--bubble-${bubbleSide}`,
      {
        'agent-companion--listening': listening,
        'agent-companion--thinking': transcribing,
        'agent-companion--open': chatOpen,
        'agent-companion--dragging': dragging,
      },
    ]"
    :style="positionStyle"
    :aria-label="listening ? '正在聆听，松开发送' : '打开智能管家（长按说话，按住可拖动）'"
    :title="hint"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointerenter="onPointerEnter"
    @pointerleave="onPointerLeave"
    @pointercancel="onPointerUp"
    @keydown.enter.prevent="openChat"
    @keydown.space.prevent="openChat"
    @contextmenu.prevent
  >
    <span class="agent-companion__halo" aria-hidden="true"></span>
    <span class="agent-companion__face" aria-hidden="true">
      <img
        v-if="!logoFailed"
        class="agent-companion__logo"
        src="/logo.svg"
        alt=""
        @error="logoFailed = true"
      />
      <Bot v-else class="agent-companion__icon" />
      <span class="agent-companion__eye agent-companion__eye--l" aria-hidden="true"></span>
      <span class="agent-companion__eye agent-companion__eye--r" aria-hidden="true"></span>
    </span>

    <!-- 语音 HUD：只读展示识别进度，音频电平用三条柱的动画代替 -->
    <span v-if="listening || transcribing" class="agent-companion__bubble agent-companion__bubble--voice">
      <span class="agent-companion__bubble-title">
        {{ transcribing ? '识别中…' : '正在聆听…' }}
      </span>
      <span class="agent-companion__transcript">{{ spokenText || '松开手指发送' }}</span>
      <span class="agent-companion__wave" aria-hidden="true">
        <i></i><i></i><i></i><i></i>
      </span>
    </span>

    <!-- 悬停问候 / 轮换小贴士：只在未录音时出现 -->
    <span v-else-if="hovered" class="agent-companion__bubble">
      <span class="agent-companion__bubble-title">{{ greeting }}</span>
      <span class="agent-companion__tip">{{ tip }}</span>
    </span>
  </button>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { Bot } from '@lucide/vue'
import { useLayoutStore } from '@/stores/layout.store'
import { useChromeStore } from '@/stores/chrome.store'
import { useAuthStore } from '@/stores/auth.store'
import { isLicenseFeatureGranted } from '@/router/license-gate'
import { useSpeechToText } from '@/composables/voice/useSpeechToText'
import {
  AGENT_COMPANION_FACE_SIZE,
  clampCompanionPercent,
  normalizeAgentCompanion,
  resolveAgentCompanionPosition,
  resolveAgentCompanionStageSize,
  roundCompanionPercent,
} from '@/shared/utils/layout/agent-companion.util'

/** 长按时长阈值：短于此判定为点击（打开面板），长按才进入语音 */
const HOLD_MS = 350
/** 超过这个位移才算拖动，避免手抖把「点击」变成「挪位置」 */
const DRAG_START_DISTANCE = 6
/** 拖动时图标离视口边缘的最小间距（px） */
const DRAG_EDGE_MARGIN = 8

const TIPS = [
  '客厅有点热，帮我开一下风扇',
  '现在全屋有设备离线吗？',
  '把主卧的灯调暗一点',
  '今天家里用了多少电？',
  '帮我看看门窗有没有关好',
]

const route = useRoute()
const layoutStore = useLayoutStore()
const chrome = useChromeStore()
const authStore = useAuthStore()

const rootRef = ref<HTMLElement | null>(null)
const logoFailed = ref(false)
const hovered = ref(false)
const tipIndex = ref(0)
let holdTimer: ReturnType<typeof setTimeout> | null = null
/** 本次按下是否已升级成语音（松手时据此决定「发送」还是「打开面板」） */
let voiceStarted = false
/** 本次按下的指针会话：起点、抓取偏移与起始中心点 */
let pressSession: {
  pointerId: number
  startX: number
  startY: number
  centerX: number
  centerY: number
} | null = null

/** 视口尺寸：拖动像素换算与窗口缩放后重新夹紧都依赖它 */
const viewport = ref({
  width: typeof window === 'undefined' ? 0 : window.innerWidth,
  height: typeof window === 'undefined' ? 0 : window.innerHeight,
})

/** 拖动中的中心点（px）；松手后清空，位置改读布局配置 */
const dragCenter = ref<{ x: number; y: number } | null>(null)
const dragging = ref(false)

/** 语音识别的中间结果（用于 HUD 实时展示） */
const spokenText = ref('')

const { listening, transcribing, startListen, stopListen } = useSpeechToText({
  onInterim: (text) => {
    spokenText.value = text
  },
  onFinal: (text) => {
    // 交给对话面板发送：伴侣本身不持有会话与历史
    chrome.queueAgentPrompt(text)
  },
})

const config = computed(() =>
  normalizeAgentCompanion(layoutStore.layoutConfig?.agentConfig?.companion),
)
const chatOpen = computed(() => chrome.isAgentChatOpen)
const greeting = computed(() => '主人好！长按我直接语音控制 ~')
const tip = computed(() => TIPS[tipIndex.value % TIPS.length])
const hint = computed(() =>
  listening.value ? '松开发送' : `${greeting.value}（点击打开对话，按住可拖动）`,
)

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

function viewportSize() {
  return {
    width: window.innerWidth || viewport.value.width || 1,
    height: window.innerHeight || viewport.value.height || 1,
  }
}

/** 当前壳层缩放系数：外壳等比缩放时 56px 设计尺寸只占约 31 个屏幕像素 */
function shellScale() {
  const rect = rootRef.value?.getBoundingClientRect()
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
  // 百分比落点以被缩放的壳层坐标系为准；边栏宽度/设计尺寸都在同一坐标系里
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

/** 气泡朝屏幕内侧展开：图标在左半边就朝右弹，反之朝左弹 */
const bubbleSide = computed<'left' | 'right'>(() => {
  const { width } = viewportSize()
  return (positionPercent.value.xPercent / 100) * width < width / 2 ? 'right' : 'left'
})

function clearHold() {
  if (holdTimer) clearTimeout(holdTimer)
  holdTimer = null
}

function openChat() {
  chrome.openAgentChat()
}

function onPointerEnter() {
  hovered.value = true
}

/** 离开时收起气泡并取消「按住但还没进入语音」的计时，拖动中途不受影响 */
function onPointerLeave() {
  hovered.value = false
  if (dragging.value) return
  clearHold()
  pressSession = null
}

function onPointerDown(event: PointerEvent) {
  if (event.pointerType === 'mouse' && event.button !== 0) return
  hovered.value = false
  voiceStarted = false
  spokenText.value = ''
  clearHold()
  const rect = rootRef.value?.getBoundingClientRect()
  pressSession = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    centerX: rect ? rect.left + rect.width / 2 : 0,
    centerY: rect ? rect.top + rect.height / 2 : 0,
  }
  dragging.value = false
  dragCenter.value = null
  try {
    rootRef.value?.setPointerCapture(event.pointerId)
  } catch {
    /* 指针捕获：元素已卸载或指针已失效时规范允许抛错，忽略即可 */
  }
  holdTimer = setTimeout(() => {
    holdTimer = null
    voiceStarted = true
    startListen()
  }, HOLD_MS)
}

function onPointerMove(event: PointerEvent) {
  const session = pressSession
  if (!session || event.pointerId !== session.pointerId) return
  // 已进入语音就不再挪位置，否则长按说话会被误判成拖动
  if (voiceStarted) return
  const dx = event.clientX - session.startX
  const dy = event.clientY - session.startY
  if (!dragging.value && Math.hypot(dx, dy) < DRAG_START_DISTANCE) return
  if (!dragging.value) {
    dragging.value = true
    hovered.value = false
    clearHold()
  }
  if (event.cancelable) event.preventDefault()
  dragCenter.value = clampCenter({
    x: session.centerX + dx,
    y: session.centerY + dy,
  })
}

function onPointerUp(event?: PointerEvent) {
  const session = pressSession
  if (event && session && event.pointerId !== session.pointerId) return
  const wasVoice = voiceStarted
  const pendingHold = holdTimer !== null
  const wasDragging = dragging.value
  const droppedCenter = dragCenter.value

  clearHold()
  pressSession = null
  voiceStarted = false
  dragging.value = false
  dragCenter.value = null
  if (session) {
    try {
      rootRef.value?.releasePointerCapture(session.pointerId)
    } catch {
      /* 指针捕获：指针已失效时规范要求抛错，忽略即可 */
    }
  }

  if (wasDragging) {
    if (droppedCenter) persistPosition(droppedCenter)
    return
  }
  if (wasVoice) {
    stopListen()
    return
  }
  // 阈值内松手 = 点击
  if (pendingHold) openChat()
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

/** 悬停时轮换小贴士，让「能说什么」这件事被看见 */
watch(hovered, (value) => {
  if (value) tipIndex.value = (tipIndex.value + 1) % TIPS.length
})

watch(visible, (value) => {
  if (!value) {
    clearHold()
    hovered.value = false
    pressSession = null
    dragging.value = false
    dragCenter.value = null
    stopListen()
  }
})

function syncViewport() {
  viewport.value = { width: window.innerWidth, height: window.innerHeight }
}

onMounted(() => {
  syncViewport()
  window.addEventListener('resize', syncViewport, { passive: true })
})

onUnmounted(() => {
  window.removeEventListener('resize', syncViewport)
  clearHold()
  stopListen()
})
</script>

<style scoped>
/* 根节点就是圆脸本体，气泡绝对定位在左右，拖动时尺寸不会因气泡出现而抖动 */
.agent-companion {
  position: fixed;
  z-index: var(--z-modal);
  width: 56px;
  height: 56px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--hos-text-primary, #e2e8f0);
  cursor: grab;
  transform: translate(-50%, -50%);
  touch-action: none;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
}

.agent-companion--dragging {
  cursor: grabbing;
}

.agent-companion__face {
  position: relative;
  display: grid;
  place-items: center;
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background:
    radial-gradient(circle at 30% 25%, rgba(125, 211, 252, 0.55), transparent 62%),
    linear-gradient(160deg, rgba(30, 41, 59, 0.92), rgba(15, 23, 42, 0.96));
  border: 1px solid rgba(125, 211, 252, 0.45);
  box-shadow:
    0 10px 26px rgba(2, 6, 23, 0.45),
    0 0 0 6px rgba(56, 189, 248, 0.08);
  transition:
    box-shadow 0.18s ease,
    scale 0.18s ease;
  animation: agent-companion-idle 5.2s ease-in-out infinite;
}

/* 拖动时轻微放大 + 加深投影，给出「被拿起来」的反馈 */
.agent-companion--dragging .agent-companion__face {
  scale: 1.06;
  box-shadow:
    0 18px 38px rgba(2, 6, 23, 0.55),
    0 0 0 8px rgba(56, 189, 248, 0.12);
}

.agent-companion__logo {
  width: 30px;
  height: 30px;
  object-fit: contain;
}

.agent-companion__icon {
  width: 26px;
  height: 26px;
  color: #7dd3fc;
}

/* 两只眼睛：静止时轻轻眨，聆听时放大变亮，给「在听」一个非文字的反馈 */
.agent-companion__eye {
  position: absolute;
  bottom: 14px;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #7dd3fc;
  opacity: 0.9;
  transition: all 0.18s ease;
}

.agent-companion__eye--l {
  left: 18px;
}

.agent-companion__eye--r {
  right: 18px;
}

.agent-companion__halo {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 56px;
  height: 56px;
  border-radius: 50%;
  transform: translate(-50%, -50%);
  background: radial-gradient(circle, rgba(56, 189, 248, 0.35), transparent 70%);
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.2s ease;
}

.agent-companion:hover .agent-companion__halo,
.agent-companion--listening .agent-companion__halo,
.agent-companion--dragging .agent-companion__halo {
  opacity: 1;
  animation: agent-companion-pulse 1.6s ease-out infinite;
}

.agent-companion--listening .agent-companion__face,
.agent-companion--thinking .agent-companion__face {
  border-color: rgba(244, 114, 182, 0.7);
  box-shadow:
    0 10px 26px rgba(2, 6, 23, 0.5),
    0 0 0 8px rgba(244, 114, 182, 0.14);
}

.agent-companion--listening .agent-companion__eye {
  width: 7px;
  height: 7px;
  background: #f472b6;
  bottom: 13px;
}

.agent-companion__bubble {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: max-content;
  max-width: 240px;
  padding: 8px 12px;
  border-radius: 12px;
  background: var(--hos-surface-raised, rgba(15, 23, 42, 0.92));
  border: 1px solid var(--hos-border-subtle, rgba(148, 163, 184, 0.28));
  box-shadow: 0 10px 24px rgba(2, 6, 23, 0.35);
  text-align: left;
  font-size: 12px;
  line-height: 1.4;
  cursor: default;
}

.agent-companion--bubble-right .agent-companion__bubble {
  left: calc(100% + 10px);
  transform-origin: left center;
  animation: agent-companion-rise-in 0.16s ease-out;
}

.agent-companion--bubble-left .agent-companion__bubble {
  right: calc(100% + 10px);
  transform-origin: right center;
  animation: agent-companion-rise-in 0.16s ease-out;
}

.agent-companion__bubble--voice {
  border-color: rgba(244, 114, 182, 0.4);
  max-width: 260px;
}

.agent-companion__bubble-title {
  font-weight: 600;
  color: var(--hos-text-primary, #e2e8f0);
}

.agent-companion__tip,
.agent-companion__transcript {
  color: var(--hos-text-muted, #94a3b8);
  /* 识别的中间结果可能很长，最多两行，超出省略 */
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.agent-companion__wave {
  display: flex;
  align-items: flex-end;
  gap: 3px;
  height: 12px;
  margin-top: 2px;
}

.agent-companion__wave i {
  width: 3px;
  height: 4px;
  border-radius: 2px;
  background: #f472b6;
  animation: agent-companion-wave 0.9s ease-in-out infinite;
}

.agent-companion__wave i:nth-child(2) {
  animation-delay: 0.12s;
}

.agent-companion__wave i:nth-child(3) {
  animation-delay: 0.24s;
}

.agent-companion__wave i:nth-child(4) {
  animation-delay: 0.36s;
}

@keyframes agent-companion-idle {
  0%,
  100% {
    translate: 0 0;
  }
  50% {
    translate: 0 -3px;
  }
}

@keyframes agent-companion-pulse {
  0% {
    transform: translate(-50%, -50%) scale(0.85);
    opacity: 0.75;
  }
  100% {
    transform: translate(-50%, -50%) scale(1.6);
    opacity: 0;
  }
}

@keyframes agent-companion-rise-in {
  from {
    opacity: 0;
    scale: 0.96;
  }
  to {
    opacity: 1;
    scale: 1;
  }
}

@keyframes agent-companion-wave {
  0%,
  100% {
    height: 4px;
  }
  50% {
    height: 12px;
  }
}

/* 低性能模式 / 用户偏好减少动效时，只保留静态形态 */
@media (prefers-reduced-motion: reduce) {
  .agent-companion__face,
  .agent-companion__halo,
  .agent-companion__wave i {
    animation: none !important;
  }
}
</style>
