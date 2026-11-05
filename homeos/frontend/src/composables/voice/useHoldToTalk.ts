/**
 * 「按住说话」手势状态机（对照源码面板内 circle-voice-hud 的 web 侧子集）。
 *
 * 只负责手势与视觉：什么时候算「按住」、上滑多远算取消、波形怎么动、
 * 哪些瞬间该给触觉反馈。录音 / 识别仍由 `useSpeechToText` 负责，
 * 通过 `onStart` / `onStop` 回调交给调用方 —— 这样桌面端点按切换与
 * 面板内按住说话可以共用同一套识别流程，不必各写一份。
 */
import { getCurrentScope, onScopeDispose, ref } from 'vue'
import type { Ref } from 'vue'
import { hapticHold, hapticTap } from '@/shared/utils/ui/haptics.util'

/** 按住多久才进入录音：更短会把「点一下按钮」也误判成长按 */
const HOLD_MS = 300
/**
 * 上滑多少像素算取消。面板内触点比悬浮伴侣大（60px vs 66px 但贴着屏幕底边），
 * 源码这里给的是 60px，悬浮伴侣是 45px —— 两处数值本来就不同，不要合并。
 */
const CANCEL_PX = 60
/** 波形权重：与源码同一组，7 根竖条看起来才像频谱而不是随机噪声 */
const WAVE_WEIGHTS = [0.45, 0.75, 1, 0.85, 1, 0.7, 0.4]
/** 静息高度 / 振幅：与源码 `6 + min(1, level*w*1.35) * 18` 同一口径 */
const WAVE_FLOOR = 6
const WAVE_GAIN = 18
/** 波形推进速度（弧度/帧）：0.22 接近源码 60fps 下的自然摆动 */
const WAVE_STEP = 0.22

/** idle=未按 / holding=录音中 / cancel=已上滑、松手即丢弃 */
type HoldPhase = 'idle' | 'holding' | 'cancel'

interface HoldToTalkOptions {
  /** 允许开始的条件（忙 / 未配置时按不动） */
  enabled?: () => boolean
  /** 按住达标：调用方启动录音 */
  onStart: () => void
  /** 松手：canceled=true 表示已上滑取消，调用方应丢弃本次识别结果 */
  onStop: (canceled: boolean) => void
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return true
  return Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
}

/**
 * 波形竖条的逐帧动画。
 *
 * 源码的竖条高度来自原生音频 amplitude；web 端拿不到同一份电平，
 * 用同一组权重叠加正弦摆动，视觉上与「有人在说话」一致。
 *
 * @returns bars 当前高度数组 / start 起振 / stop 归位
 */
function useWaveBars() {
  const bars = ref<number[]>(WAVE_WEIGHTS.map(() => WAVE_FLOOR))
  let frame = 0
  let phase = 0

  function reset() {
    bars.value = WAVE_WEIGHTS.map(() => WAVE_FLOOR)
  }

  function stop() {
    if (frame) cancelAnimationFrame(frame)
    frame = 0
    reset()
  }

  function tick() {
    phase += WAVE_STEP
    bars.value = WAVE_WEIGHTS.map((weight, index) => {
      const wobble = 0.55 + 0.45 * Math.abs(Math.sin(phase + index * 0.7))
      return Math.round(WAVE_FLOOR + Math.min(1, weight * wobble * 1.35) * WAVE_GAIN)
    })
    frame = requestAnimationFrame(tick)
  }

  function start() {
    stop()
    if (prefersReducedMotion()) return
    frame = requestAnimationFrame(tick)
  }

  return { bars, start, stop }
}

interface HoldGestureOptions extends HoldToTalkOptions {
  /** 对外暴露的手势相位 */
  phase: Ref<HoldPhase>
  /** 长按达标时起振 */
  startWave: () => void
  /** 松手 / 取消时停下波形 */
  stopWave: () => void
}

/**
 * 指针手势：按下计时、上滑取消、松手收口。
 *
 * 与波形动画分开，是为了让「判定」和「画」各自小到可以一眼读完 ——
 * 两者的测试/阅读需求完全不同（前者关心阈值，后者关心手感）。
 */
function useHoldGesture(options: HoldGestureOptions) {
  const { phase, startWave, stopWave } = options
  let holdTimer: ReturnType<typeof setTimeout> | null = null
  let pressY = 0
  let pointerId: number | null = null
  /** 长按是否已达标：达标前松手只是「点了一下」，不该触发录音 */
  let holding = false

  function clearHoldTimer() {
    if (holdTimer) clearTimeout(holdTimer)
    holdTimer = null
  }

  function reset() {
    clearHoldTimer()
    stopWave()
    phase.value = 'idle'
    holding = false
    pointerId = null
  }

  function capturePointer(event: PointerEvent) {
    const target = event.currentTarget as HTMLElement | null
    try {
      target?.setPointerCapture(event.pointerId)
    } catch {
      /* 指针已失效时浏览器会抛错，忽略即可 */
    }
  }

  /** 长按达标：接管手势并通知调用方开始录音 */
  function beginHold() {
    holdTimer = null
    holding = true
    phase.value = 'holding'
    hapticHold()
    startWave()
    options.onStart()
  }

  function onPointerDown(event: PointerEvent) {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    if (options.enabled && !options.enabled()) return
    reset()
    pressY = event.clientY
    pointerId = event.pointerId
    capturePointer(event)
    holdTimer = setTimeout(beginHold, HOLD_MS)
  }

  function onPointerMove(event: PointerEvent) {
    if (!holding || event.pointerId !== pointerId) return
    const next: HoldPhase = pressY - event.clientY >= CANCEL_PX ? 'cancel' : 'holding'
    if (next === phase.value) return
    // 越过阈值给一次轻触：手指盖住了波纹区，视觉提示看不到，靠触感确认
    if (next === 'cancel') hapticTap()
    phase.value = next
  }

  function onPointerUp(event: PointerEvent) {
    if (event.pointerId !== pointerId) return
    const canceled = phase.value === 'cancel'
    const started = holding
    reset()
    if (started) options.onStop(canceled)
  }

  function onPointerCancel(event: PointerEvent) {
    if (event.pointerId !== pointerId) return
    const started = holding
    reset()
    // 指针被系统收走（来电、手势返回）按「取消」处理，避免留下一条没人停的麦克风
    if (started) options.onStop(true)
  }

  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel, reset }
}

/**
 * 按住说话手势。
 *
 * @param options 启停回调与可用性判定
 * @returns phase / bars（波形高度数组）与四个指针事件处理器
 */
export function useHoldToTalk(options: HoldToTalkOptions) {
  const phase = ref<HoldPhase>('idle')
  const wave = useWaveBars()
  const gesture = useHoldGesture({
    ...options,
    phase,
    startWave: wave.start,
    stopWave: wave.stop,
  })

  // 组件作用域内使用时自动收尾；模块级调用时静默跳过
  if (getCurrentScope()) onScopeDispose(gesture.reset)

  return {
    phase,
    bars: wave.bars,
    onPointerDown: gesture.onPointerDown,
    onPointerMove: gesture.onPointerMove,
    onPointerUp: gesture.onPointerUp,
    onPointerCancel: gesture.onPointerCancel,
  }
}
