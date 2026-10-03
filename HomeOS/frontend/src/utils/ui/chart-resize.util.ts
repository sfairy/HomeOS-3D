/**
 * 图表容器 ResizeObserver（比 window.resize 更准，适配整页 scale）
 * ECharts 须在布局完成后的帧中调用 setOption / resize，避免 main process 警告。
 */
import {
  isScreensaverBackgroundIdle,
  registerScreensaverFlushDraw,
} from '@/utils/ui/screensaver-background-idle.util'

/** owner → 待执行 rAF 句柄（outer 外层、inner 内层），用于按 owner 取消 */
const pendingTasks = new WeakMap<object, { outer?: number; inner?: number }>()
/** owner → 屏保后台 idle 期间暂存的待执行任务，离开 idle 时统一 flush */
const deferredWhileIdle = new Map<object, () => void>()

registerScreensaverFlushDraw(() => {
  if (deferredWhileIdle.size === 0) return
  const copy = new Map(deferredWhileIdle)
  deferredWhileIdle.clear()
  for (const [owner, fn] of copy) scheduleEchartsTask(owner, fn)
})

/** 推迟到下一绘制帧之后执行（双 rAF，避开 Vue 同步更新周期） */
export function scheduleEchartsTask(owner: object, fn: () => void) {
  if (isScreensaverBackgroundIdle()) {
    deferredWhileIdle.set(owner, fn)
    return
  }
  cancelScheduledEchartsTask(owner)
  const pending: { outer?: number; inner?: number } = {}
  pendingTasks.set(owner, pending)
  pending.outer = requestAnimationFrame(() => {
    pending.inner = requestAnimationFrame(() => {
      pendingTasks.delete(owner)
      fn()
    })
  })
}

/**
 * 取消指定 owner 已调度的 ECharts 任务（同时清理 idle 暂存）。
 * @param owner 任务归属对象
 */
export function cancelScheduledEchartsTask(owner: object) {
  deferredWhileIdle.delete(owner)
  const pending = pendingTasks.get(owner)
  if (!pending) return
  if (pending.outer) cancelAnimationFrame(pending.outer)
  if (pending.inner) cancelAnimationFrame(pending.inner)
  pendingTasks.delete(owner)
}

/**
 * 为图表容器挂载 ResizeObserver，尺寸变化时按双 rAF 调度回调。
 *
 * 副作用：创建 ResizeObserver 并 observe(el)；返回的销毁函数会取消调度并 disconnect。
 *
 * @param el 图表容器元素
 * @param onResize 尺寸变化回调
 * @param owner 任务归属对象，默认取 el
 * @returns 销毁函数；el 非法或环境无 ResizeObserver 时返回 null
 */
export function observeChartResize(
  el: HTMLElement | null | undefined,
  onResize: () => void,
  owner: object = el ?? {},
): (() => void) | null {
  if (!(el instanceof Element) || typeof ResizeObserver === 'undefined') return null
  const ro = new ResizeObserver(() => scheduleEchartsTask(owner, onResize))
  ro.observe(el)
  return () => {
    cancelScheduledEchartsTask(owner)
    ro.disconnect()
  }
}
