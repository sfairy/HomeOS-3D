/**
 * WebGL 上下文丢失 / 恢复守卫（B22）。
 *
 * 舞台渲染器已有自恢复实现（authoring 的 bindFrameDriver），这里补齐两类缺口：
 * 1. 独立小渲染器（窗型预览等）：丢失时 `preventDefault()`（不阻止默认行为浏览器就
 *    不会发 restored），暂停自己的渲染循环并给出可恢复提示；恢复后重绘。
 * 2. 全局兜底：`webglcontextlost` 不冒泡，只能在 capture 阶段监听；同时向 RUM 派发
 *    事件（采集端把 lost 计为 error），便于线上判断上下文丢失频率。
 *
 * `?webgl-guard=0` 可整体关闭本守卫回退旧行为。
 */

const CONTEXT_LOST_EVENT = 'homeos:webgl-context-lost'
const CONTEXT_RESTORED_EVENT = 'homeos:webgl-context-restored'

let globalGuardInstalled = false

function isGuardEnabled(): boolean {
  try {
    const flag = String(new URLSearchParams(window.location.search).get('webgl-guard') || '').toLowerCase()
    return flag !== '0' && flag !== 'false' && flag !== 'off'
  } catch {
    return true
  }
}

function dispatchContextEvent(eventName: string, label: string): void {
  try {
    window.dispatchEvent(new CustomEvent(eventName, { detail: { label } }))
  } catch {
    /* 事件派发失败不影响恢复流程 */
  }
}

export type WebglContextLossGuardOptions = {
  label: string
  onLost?: () => void
  onRestored?: () => void
}

type GuardedRenderer = { domElement?: EventTarget | null }

/** 给单个渲染器挂丢失/恢复监听；返回解绑函数（renderer dispose 时调用）。 */
export function installWebglContextLossGuard(
  renderer: GuardedRenderer | null | undefined,
  options: WebglContextLossGuardOptions,
): () => void {
  const canvas = renderer?.domElement
  if (!isGuardEnabled() || !canvas?.addEventListener) return () => {}
  const handleLost = (event: Event) => {
    // 必须阻止默认行为，否则浏览器不会触发 webglcontextrestored。
    event.preventDefault()
    try {
      options.onLost?.()
    } catch {
      /* 暂停失败也要派发事件给 RUM */
    }
    dispatchContextEvent(CONTEXT_LOST_EVENT, options.label)
  }
  const handleRestored = () => {
    try {
      options.onRestored?.()
    } catch {
      /* 恢复回调失败仍要通知全局 */
    }
    dispatchContextEvent(CONTEXT_RESTORED_EVENT, options.label)
  }
  canvas.addEventListener('webglcontextlost', handleLost, false)
  canvas.addEventListener('webglcontextrestored', handleRestored, false)
  return () => {
    try {
      canvas.removeEventListener('webglcontextlost', handleLost, false)
      canvas.removeEventListener('webglcontextrestored', handleRestored, false)
    } catch {
      /* 元素已移除时忽略 */
    }
  }
}

/**
 * 全局兜底监听（capture 阶段）：只派发事件给 RUM，不接管任何渲染器的恢复逻辑
 * （舞台的恢复仍由它自己的 bindFrameDriver 负责，避免双重恢复）。
 */
export function installGlobalWebglContextLossGuard(): () => void {
  if (typeof window === 'undefined' || !isGuardEnabled() || globalGuardInstalled) return () => {}
  globalGuardInstalled = true
  const handleLost = (event: Event) => {
    try {
      event.preventDefault()
    } catch {
      /* 忽略 */
    }
    dispatchContextEvent(CONTEXT_LOST_EVENT, 'global')
  }
  const handleRestored = () => dispatchContextEvent(CONTEXT_RESTORED_EVENT, 'global')
  window.addEventListener('webglcontextlost', handleLost, true)
  window.addEventListener('webglcontextrestored', handleRestored, true)
  return () => {
    window.removeEventListener('webglcontextlost', handleLost, true)
    window.removeEventListener('webglcontextrestored', handleRestored, true)
  }
}
