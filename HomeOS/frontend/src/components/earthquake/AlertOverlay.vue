/**
 * @file AlertOverlay.vue
 * @module components/earthquake
 * @brief 地震预警全屏警报覆盖层
 *
 * 职责：
 * - 当 earthquakeStore 触发 isAlerting 时，通过 Teleport 渲染全屏警报覆盖层
 * - 横屏/竖屏自适应布局：横屏展示倒计时与状态，竖屏展示震源、震中、烈度与避险提示
 * - 倒计时、震动计时、TTS 语音播报均由 store 与 useEarthquakeTts 驱动
 * - 底部嵌入 EewSlideUnlock 滑动解锁交互，由本组件统一管理拖拽进度与解锁判定
 *
 * 依赖：
 * - vue（computed/ref/watch/onMounted/onUnmounted）
 * - @lucide/vue、pinia（storeToRefs）
 * - earthquake.store（预警状态与事件）、layout.store（TTS 开关）
 * - useEarthquakeTts（语音播报）、EewSafetyTips、EewSlideUnlock 子组件
 * - 外部样式 ./styles/AlertOverlay.css
 */
<template>
  <Teleport to="body">
    <div
      v-if="showOverlay"
      class="eew-root"
      role="alertdialog"
      aria-modal="true"
      aria-label="地震预警"
    >
      <div class="eew-pulse-bg" />

      <!-- 横屏 / 大屏布局 -->
      <div v-if="!isPortrait" class="eew-landscape">
        <div class="eew-hero">
          <div
            class="eew-countdown-glow text-[10rem] md:text-[12rem] font-black tabular-nums leading-none tracking-tighter text-white"
            :class="{ 'animate-pulse': countdownUrgent }"
          >
            {{ timerDisplay }}
          </div>
          <div
            class="text-xl md:text-2xl font-bold tracking-widest uppercase opacity-70"
            :class="hasArrived ? 'eew-c-warn' : 'eew-c-danger-soft'"
          >
            {{ statusText }}
          </div>
          <div v-if="hasArrived" class="text-sm text-white/40 mt-1">
            已避险 {{ elapsedShaking }} 秒
          </div>
        </div>

        <div class="eew-info-grid">
          <div class="eew-info-card">
            <MapPin class="w-4 h-4 eew-ic-danger" />
            <span class="eew-info-label eew-c-danger-soft">震中</span>
            <span class="text-sm font-bold text-white truncate max-w-full">{{
              event?.epicenter || '—'
            }}</span>
          </div>
          <div class="eew-info-card">
            <Activity class="w-4 h-4 eew-ic-warn-deep" />
            <span class="eew-info-label eew-c-warn-deep-soft">震级</span>
            <span class="text-sm font-bold text-white">{{ magnitudeText }}</span>
          </div>
          <div class="eew-info-card">
            <ArrowUpDown class="w-4 h-4 eew-ic-warn" />
            <span class="eew-info-label eew-c-warn-soft">深度</span>
            <span class="text-sm font-bold text-white">{{ event?.depth ?? '—' }} km</span>
          </div>
          <div class="eew-info-card">
            <Radio class="w-4 h-4 eew-ic-danger-soft" />
            <span class="eew-info-label eew-c-danger-soft">震中距</span>
            <span class="text-sm font-bold text-white">{{ event?.distance ?? '—' }} km</span>
          </div>
        </div>

        <div class="eew-intensity-block">
          <span class="text-[12px] uppercase tracking-[0.2em] eew-c-danger-faint"
            >本地预估烈度</span
          >
          <div
            class="text-6xl md:text-7xl font-black tabular-nums eew-intensity-glow"
            :class="intensityClass"
          >
            {{ event?.localIntensity ?? '—' }}
          </div>
        </div>

        <EewSafetyTips />
        <EewSlideUnlock :progress="slideProgress" :dragging="slideDragging" @start="onSlideStart" />
      </div>

      <!-- 竖屏紧凑布局 -->
      <div v-else class="eew-portrait">
        <div
          class="eew-countdown-glow text-[7rem] font-black tabular-nums leading-none tracking-tighter text-white"
          :class="{ 'animate-pulse': countdownUrgent }"
        >
          {{ timerDisplay }}
        </div>
        <div
          class="text-lg font-bold tracking-wide"
          :class="hasArrived ? 'eew-c-warn' : 'eew-c-danger-soft'"
        >
          {{ statusText }}
        </div>
        <div v-if="hasArrived" class="text-xs text-white/40 mt-1">
          已避险 {{ elapsedShaking }} 秒
        </div>

        <div class="eew-portrait-grid">
          <div class="eew-info-card eew-info-card--sm">
            <span class="eew-info-label">震级</span>
            <span class="text-sm font-bold text-white">{{ magnitudeText }}</span>
          </div>
          <div class="eew-info-card eew-info-card--sm">
            <span class="eew-info-label">震中距</span>
            <span class="text-sm font-bold text-white">{{ event?.distance ?? '—' }} km</span>
          </div>
          <div class="eew-info-card eew-info-card--sm col-span-2">
            <span class="eew-info-label">震中</span>
            <span class="text-sm font-bold text-white truncate">{{ event?.epicenter || '—' }}</span>
          </div>
        </div>

        <div
          class="text-4xl font-black tabular-nums eew-intensity-glow mt-4"
          :class="intensityClass"
        >
          {{ event?.localIntensity ?? '—' }}
        </div>
        <span class="text-[12px] uppercase tracking-widest eew-c-danger-faint">本地预估烈度</span>

        <EewSafetyTips compact />
        <EewSlideUnlock
          class="eew-slide--portrait"
          :progress="slideProgress"
          :dragging="slideDragging"
          @start="onSlideStart"
        />
      </div>
    </div>
  </Teleport>
</template>

<script setup>
/**
 * 所属模块：frontend/components
 * 职责：实现 AlertOverlay 组件的界面渲染、用户交互与 props/emit 通信。
 * 关键依赖：Vue 3 `<script setup>`、Pinia stores（按需）、类型定义、Lucide 图标与 i18n 标签。
 * 约定：- 所有对外属性统一走 defineProps 泛型，emit 使用 defineEmits<...>()；
  - 不直接操作 DOM，响应式数据变化通过 v-model 或乐观锁写回 store。
 */
import { computed, ref, watch, onMounted, onUnmounted } from 'vue'
import { Activity, ArrowUpDown, MapPin, Radio } from '@lucide/vue'
import { storeToRefs } from 'pinia'
import { useEarthquakeStore } from '@/stores/earthquake.store'
import { useLayoutStore } from '@/stores/layout.store'
import { useEarthquakeTts } from '@/composables/earthquake/useEarthquakeTts'
import EewSafetyTips from '@/components/earthquake/EewSafetyTips.vue'
import EewSlideUnlock from '@/components/earthquake/EewSlideUnlock.vue'

const earthquakeStore = useEarthquakeStore()
const layoutStore = useLayoutStore()

const {
  isAlerting,
  showOverlay,
  activeEvent,
  currentCountdown,
  elapsedShaking,
  hasArrived,
  statusText,
  timerDisplay,
  countdownUrgent,
} = storeToRefs(earthquakeStore)
const event = computed(() => activeEvent.value)
const magnitudeText = computed(() => {
  const m = event.value?.magnitude
  return m != null ? `${Number(m).toFixed(1)} M` : '—'
})

const intensityClass = computed(() => {
  const val = event.value?.localIntensity ?? 0
  if (val >= 6) return 'eew-c-danger-pulse'
  if (val >= 4) return 'eew-c-warn-deep'
  return 'eew-c-white'
})

const ttsEnabled = computed(() => layoutStore.layoutConfig?.earthquakeConfig?.enableTts !== false)

useEarthquakeTts(
  () => ttsEnabled.value,
  isAlerting,
  () => activeEvent.value,
  currentCountdown,
)

const isPortrait = ref(false)
const slideProgress = ref(0)
const slideDragging = ref(false)
const slideUnlocked = ref(false)
const trackRef = ref(null)
let slideListenerCleanup = null
let activePointerId = null

function detachSlideListeners() {
  slideListenerCleanup?.()
  slideListenerCleanup = null
}

function updateOrientation() {
  isPortrait.value = window.innerHeight > window.innerWidth
}

const SLIDE_HANDLE_SIZE = 50
const SLIDE_TRACK_INSET = 4
/** 与 EewSlideUnlock CSS（handle + inset×2）一致 */
const SLIDE_TRAVEL_RESERVE = SLIDE_HANDLE_SIZE + SLIDE_TRACK_INSET * 2
const SLIDE_UNLOCK_THRESHOLD = 100

function getSlideTrackEl() {
  return trackRef.value?.$el ?? trackRef.value
}

function getSlideMaxTravel() {
  const el = getSlideTrackEl()
  if (!el) return 0
  return Math.max(0, el.getBoundingClientRect().width - SLIDE_TRAVEL_RESERVE)
}

function clientXFromEvent(e) {
  if ('touches' in e && e.touches?.[0]) return e.touches[0].clientX
  if ('changedTouches' in e && e.changedTouches?.[0]) return e.changedTouches[0].clientX
  return e.clientX
}

function onSlideStart(e, trackEl) {
  if (slideUnlocked.value) return
  if (e.cancelable) e.preventDefault()
  if ('pointerId' in e && activePointerId != null && e.pointerId !== activePointerId) return

  detachSlideListeners()
  trackRef.value = trackEl
  slideDragging.value = true
  if ('pointerId' in e) activePointerId = e.pointerId

  const startClientX = clientXFromEvent(e)
  const startProgress = slideProgress.value
  const maxTravel = getSlideMaxTravel()

  const move = (ev) => {
    if (!slideDragging.value || slideUnlocked.value) return
    if (activePointerId != null && 'pointerId' in ev && ev.pointerId !== activePointerId) return
    if (ev.cancelable) ev.preventDefault()
    if (maxTravel <= 0) return
    const deltaX = clientXFromEvent(ev) - startClientX
    slideProgress.value = Math.max(0, Math.min(100, startProgress + (deltaX / maxTravel) * 100))
  }
  const end = (ev) => {
    if (activePointerId != null && ev && 'pointerId' in ev && ev.pointerId !== activePointerId)
      return
    slideDragging.value = false
    activePointerId = null
    detachSlideListeners()
    if (slideUnlocked.value) return
    if (slideProgress.value >= SLIDE_UNLOCK_THRESHOLD) {
      finishSlide()
      return
    }
    slideProgress.value = 0
  }
  slideListenerCleanup = () => {
    document.removeEventListener('pointermove', move)
    document.removeEventListener('pointerup', end)
    document.removeEventListener('pointercancel', end)
  }
  document.addEventListener('pointermove', move)
  document.addEventListener('pointerup', end)
  document.addEventListener('pointercancel', end)
}

function finishSlide() {
  if (slideUnlocked.value) return
  slideUnlocked.value = true
  slideDragging.value = false
  slideProgress.value = 100
  activePointerId = null
  detachSlideListeners()
  const eventId = activeEvent.value?.eventId
  earthquakeStore.dismissAlert(eventId)
}

watch(showOverlay, (v) => {
  if (v) {
    slideUnlocked.value = false
    slideProgress.value = 0
    slideDragging.value = false
    activePointerId = null
    detachSlideListeners()
    updateOrientation()
  }
})

onMounted(() => {
  updateOrientation()
  window.addEventListener('resize', updateOrientation)
})

onUnmounted(() => {
  window.removeEventListener('resize', updateOrientation)
  detachSlideListeners()
  slideDragging.value = false
  activePointerId = null
})
</script>

<style scoped src="./styles/AlertOverlay.css"></style>
