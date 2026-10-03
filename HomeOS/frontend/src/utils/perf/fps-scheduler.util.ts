/**
 * 统一 FPS rAF 调度器：adaptive tier 监控 + 可选诊断采样 + 动画 tick（单 rAF 循环）
 */

type AdaptiveFpsTick = (deltaMs: number, ts: number) => void
type DiagnosticsFpsTick = (ts: number) => void

let schedulerStarted = false
let schedulerPaused = false
let lastFrameTs = 0

let adaptiveTick: AdaptiveFpsTick | null = null

let diagnosticsTick: DiagnosticsFpsTick | null = null
let diagnosticsActive = false

let visibilityBound = false

function tick(ts: number): void {
  if (schedulerPaused) {
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
  if (schedulerStarted || typeof requestAnimationFrame !== 'function') return
  schedulerStarted = true
  lastFrameTs = 0
  requestAnimationFrame(tick)
}

/** registerAdaptiveFpsTick：函数，按签名入参返回处理结果。 */
export function registerAdaptiveFpsTick(fn: AdaptiveFpsTick): void {
  adaptiveTick = fn
  ensureSchedulerRunning()
}

/** registerDiagnosticsFpsTick：函数，按签名入参返回处理结果。 */
export function registerDiagnosticsFpsTick(fn: DiagnosticsFpsTick): void {
  diagnosticsTick = fn
}

/** startDiagnosticsFpsSampling：函数，按签名入参返回处理结果。 */
export function startDiagnosticsFpsSampling() {
  diagnosticsActive = true
  ensureSchedulerRunning()
}

/** stopDiagnosticsFpsSampling：函数，按签名入参返回处理结果。 */
export function stopDiagnosticsFpsSampling() {
  diagnosticsActive = false
}

/** startFpsScheduler：函数，按签名入参返回处理结果。 */
export function startFpsScheduler() {
  ensureSchedulerRunning()
}

/** isFpsSchedulerRunning：函数，按签名入参返回处理结果。 */
export function isFpsSchedulerRunning() {
  return schedulerStarted
}

/** isDiagnosticsFpsSamplingActive：函数，按签名入参返回处理结果。 */
export function isDiagnosticsFpsSamplingActive() {
  return diagnosticsActive
}

/** pauseFpsScheduler：函数，按签名入参返回处理结果。 */
export function pauseFpsScheduler(): void {
  schedulerPaused = true
}

/** resumeFpsScheduler：函数，按签名入参返回处理结果。 */
export function resumeFpsScheduler(): void {
  schedulerPaused = false
  ensureSchedulerRunning()
}

/**
 * 页面隐藏时暂停全局 rAF 调度器，回到前台时恢复：
 * 后台标签页 rAF 被浏览器节流但仍低频触发，常驻调度持续空转浪费 CPU。
 * 复用 screensaver 的 pause/resume 通道，visibilitychange 仅作额外暂停源。
 */
export function bindFpsSchedulerVisibilityPause(): void {
  if (visibilityBound || typeof document === 'undefined') return
  visibilityBound = true
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pauseFpsScheduler()
    else resumeFpsScheduler()
  })
}

/** unregisterDiagnosticsFpsTick：函数，按签名入参返回处理结果。 */
export function unregisterDiagnosticsFpsTick() {
  diagnosticsTick = null
  diagnosticsActive = false
}
