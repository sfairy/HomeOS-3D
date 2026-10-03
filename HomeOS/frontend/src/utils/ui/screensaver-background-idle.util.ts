/**
 * 屏保可见性与后台展示层 idle 状态。
 * enter：visible 后立即绘制屏保，双 rAF 后再 notify idle（节流后台 Canvas/FPS 等）。
 * leave：同步取消 idle 并 flush 延迟重绘。数据层（WS/轮询/store）不受影响。
 */
import { ref } from 'vue'
import { pauseFpsScheduler, resumeFpsScheduler } from '@/utils/perf/fps-scheduler.util'

const screensaverVisible = ref(false)
/** screensaverBackgroundIdle：响应式常量（ref / computed），取值语义见定义。 */
export const screensaverBackgroundIdle = ref(false)

const idleListeners = new Set<(idle: boolean) => void>()
const flushListeners = new Set<() => void>()

let idleRaf1 = 0
let idleRaf2 = 0

function notifyIdle(idle: boolean) {
  if (screensaverBackgroundIdle.value === idle) return
  screensaverBackgroundIdle.value = idle
  if (typeof document !== 'undefined') {
    document.documentElement.toggleAttribute('data-screensaver-idle', idle)
  }
  if (idle) pauseFpsScheduler()
  else resumeFpsScheduler()
  idleListeners.forEach((fn) => {
    try {
      fn(idle)
    } catch {
      /* 忽略 */
    }
  })
}

/** isScreensaverBackgroundIdle：函数，按签名入参返回处理结果。 */
export function isScreensaverBackgroundIdle(): boolean {
  return screensaverBackgroundIdle.value
}

/** onScreensaverBackgroundIdle：函数，按签名入参返回处理结果。 */
export function onScreensaverBackgroundIdle(cb: (idle: boolean) => void): () => void {
  idleListeners.add(cb)
  cb(screensaverBackgroundIdle.value)
  return () => idleListeners.delete(cb)
}

/** registerScreensaverFlushDraw：函数，按签名入参返回处理结果。 */
export function registerScreensaverFlushDraw(cb: () => void): () => void {
  flushListeners.add(cb)
  return () => flushListeners.delete(cb)
}

function flushScreensaverDeferredDraws(): void {
  flushListeners.forEach((fn) => {
    try {
      fn()
    } catch {
      /* 忽略 */
    }
  })
}

/** setScreensaverVisible：函数，按签名入参返回处理结果。 */
export function setScreensaverVisible(visible: boolean): void {
  if (screensaverVisible.value === visible) return
  screensaverVisible.value = visible

  if (idleRaf1) cancelAnimationFrame(idleRaf1)
  if (idleRaf2) cancelAnimationFrame(idleRaf2)
  idleRaf1 = 0
  idleRaf2 = 0

  if (visible) {
    notifyIdle(false)
    if (typeof requestAnimationFrame !== 'function') {
      notifyIdle(true)
      return
    }
    idleRaf1 = requestAnimationFrame(() => {
      idleRaf2 = requestAnimationFrame(() => {
        idleRaf1 = 0
        idleRaf2 = 0
        if (screensaverVisible.value) notifyIdle(true)
      })
    })
    return
  }

  notifyIdle(false)
  flushScreensaverDeferredDraws()
  if (typeof window !== 'undefined' && typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => {
      window.dispatchEvent(new Event('resize'))
    })
  }
}
