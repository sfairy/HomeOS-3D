/**
 * 统一 FPS rAF 调度器：adaptive tier 监控 + 可选诊断采样 + 动画 tick（单 rAF 循环）
 *
 * 自适应监控只在「有人在用」时测帧：启动后与每次用户输入后的 ACTIVE_WINDOW_MS 内出帧，
 * 窗口过了就停。墙面平板 7×24 静置时这条空转的 rAF 会让整机每秒唤醒 60 次，而静置画面
 * 掉帧本来也没人看得到。诊断采样是显式开关，开着时不受窗口限制。
 */

type AdaptiveFpsTick = (deltaMs: number, ts: number) => void
type DiagnosticsFpsTick = (ts: number) => void

const ACTIVE_WINDOW_MS = 5000
const ACTIVITY_EVENTS = ['pointerdown', 'pointermove', 'wheel', 'keydown', 'touchstart'] as const

let schedulerStarted = false
let schedulerPaused = false
let lastFrameTs = 0
let activeUntil = 0

let adaptiveTick: AdaptiveFpsTick | null = null

let diagnosticsTick: DiagnosticsFpsTick | null = null
let diagnosticsActive = false

let visibilityBound = false
let activityBound = false

function tick(ts: number): void {
  if (schedulerPaused || (!diagnosticsActive && performance.now() > activeUntil)) {
    schedulerStarted = false
    return
  }
  if (lastFrameTs) {
    const delta = ts - lastFrameTs
    adaptiveTick?.(delta, ts)
  }
  if (diagnosticsActive && diagnosticsTick) {
    diagnosticsTick(ts)
  }
  lastFrameTs = ts
  requestAnimationFrame(tick)
}

function ensureSchedulerRunning() {
  if (schedulerStarted || schedulerPaused || typeof requestAnimationFrame !== 'function') return
  schedulerStarted = true
  lastFrameTs = 0
  requestAnimationFrame(tick)
}

function markActive() {
  activeUntil = performance.now() + ACTIVE_WINDOW_MS
  ensureSchedulerRunning()
}

function bindActivityWake() {
  if (activityBound || typeof window === 'undefined') return
  activityBound = true
  // activityBound 保证只注册一次；调度器是模块级单例，监听无归属对象可挂。
  for (const type of ACTIVITY_EVENTS) window.addEventListener(type, markActive, { capture: true, passive: true })
}

export function registerAdaptiveFpsTick(fn: AdaptiveFpsTick): void {
  adaptiveTick = fn
  markActive()
}

export function registerDiagnosticsFpsTick(fn: DiagnosticsFpsTick): void {
  diagnosticsTick = fn
}

export function startDiagnosticsFpsSampling() {
  diagnosticsActive = true
  ensureSchedulerRunning()
}

export function stopDiagnosticsFpsSampling() {
  diagnosticsActive = false
}

export function startFpsScheduler() {
  bindActivityWake()
  markActive()
}

export function isFpsSchedulerRunning() {
  return schedulerStarted
}

export function isDiagnosticsFpsSamplingActive() {
  return diagnosticsActive
}

export function pauseFpsScheduler(): void {
  schedulerPaused = true
}

export function resumeFpsScheduler(): void {
  schedulerPaused = false
  markActive()
}

/**
 * 页面隐藏时暂停全局 rAF 调度器，回到前台时恢复：
 * 后台标签页 rAF 被浏览器节流但仍低频触发，常驻调度持续空转浪费 CPU。
 * 复用 screensaver 的 pause/resume 通道，visibilitychange 仅作额外暂停源。
 */
export function bindFpsSchedulerVisibilityPause(): void {
  if (visibilityBound || typeof document === 'undefined') return
  visibilityBound = true
  // visibilityBound 保证只注册一次；调度器是模块级单例，监听无归属对象可挂。
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pauseFpsScheduler()
    else resumeFpsScheduler()
  })
}

export function unregisterDiagnosticsFpsTick() {
  diagnosticsTick = null
  diagnosticsActive = false
}
