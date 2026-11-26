/**
 * 3D 图形中断恢复层（0.8.9 `.i3d-graphics-recovery`）。
 *
 * ## 为什么运行时需要它，编辑器却不需要
 *
 * 编辑器侧的上下文丢失由 `#webgl-message` 承担（`frame-driver.ts`）；而运行时舞台
 * （中控 / 嵌入页面）没有那条提示，GPU 进程崩掉后画布就定格在那里 —— 用户看到的是
 * 「点什么都没反应」，且没有任何重试入口。
 *
 * ## 为什么延迟显示
 *
 * 上下文丢失后浏览器**通常**会在几百毫秒内自动恢复并触发 `webglcontextrestored`
 * （重编译着色器）。立刻弹「不可用」会让一次正常恢复变成惊吓。这里等
 * `RESTORE_GRACE_MS`，期间恢复就什么都不显示。
 *
 * ## 为什么要 `preventDefault`
 *
 * 不阻止默认行为，浏览器**不会**派发 `webglcontextrestored`（规范如此）。编辑器侧的
 * `webgl-context-loss-guard.util.ts` 已经这么做了；这里对运行时宿主再做一次，
 * 因为两处挂载路径互不依赖（独立渲染器可能没有装那个守卫）。
 */

/** 等浏览器自己恢复的窗口；超过它基本可以认定 GPU 进程没能重建。 */
const RESTORE_GRACE_MS = 1500

/**
 * 三阶段文案与按钮（与上游 0.8.9 逐字一致）。
 *
 * `lost` 是「还在等浏览器自己恢复」，`reloading` 是用户点了重新加载之后的过渡态，
 * `failed` 是重载后仍拿不到上下文。上游在同一处还有 4.5 秒后**自动**重载的行为，
 * 本项目保留「用户点按钮才重载」——中控页面上无人值守的自动刷新会打断正在看的画面。
 */
export const GRAPHICS_RECOVERY_TEXT = Object.freeze({
  lost: '3D 画面暂时中断，正在等待恢复。',
  reloading: '正在重新加载 3D 画面…',
  failed: '3D 画面未能重新加载。',
})
export const GRAPHICS_RECOVERY_ACTION = '重新加载 3D'
/** 点「重新加载 3D」后等多久算失败（够一次完整重编译着色器）。 */
const RELOAD_TIMEOUT_MS = 10_000

export type GraphicsRecoveryPhase = keyof typeof GRAPHICS_RECOVERY_TEXT

export type GraphicsRecoveryOptions = {
  /** 运行时宿主（`.hb-interaction3d-runtime`）。 */
  host: HTMLElement
  /** 重新载入的动作；缺省整页刷新。 */
  onReload?: () => void
  /** 延迟窗口（测试可缩短）。 */
  graceMs?: number
}

/** 覆盖层的三阶段控制器：只管 DOM 与阶段切换，不关心事件从哪来。 */
function createRecoveryOverlay(host: HTMLElement, requestReload: () => void) {
  let overlay: HTMLElement | null = null
  let reloadTimer: ReturnType<typeof setTimeout> | null = null
  let phase: GraphicsRecoveryPhase | null = null

  const buildOverlay = () => {
    // 惰性创建：绝大多数会话不会丢上下文，不为它付 DOM 成本。
    if (overlay) return overlay
    const element = document.createElement('div')
    element.className = 'i3d-graphics-recovery'
    const message = document.createElement('p')
    message.setAttribute('role', 'status')
    const action = document.createElement('button')
    action.type = 'button'
    action.textContent = GRAPHICS_RECOVERY_ACTION
    action.addEventListener('click', () => {
      // 只有「等待恢复」和「重载失败」两个阶段允许点：重载中重复点会叠多次刷新。
      if (phase !== 'lost' && phase !== 'failed') return
      setPhase('reloading')
      reloadTimer = setTimeout(() => {
        reloadTimer = null
        if (phase === 'reloading') setPhase('failed')
      }, RELOAD_TIMEOUT_MS)
      requestReload()
    })
    element.append(message, action)
    overlay = element
    return element
  }

  const clearReloadTimer = () => {
    if (reloadTimer === null) return
    clearTimeout(reloadTimer)
    reloadTimer = null
  }

  const hide = () => {
    clearReloadTimer()
    if (!overlay) return
    overlay.hidden = true
    delete overlay.dataset.graphicsRecovery
    overlay.removeAttribute('aria-busy')
  }

  const paint = (element: HTMLElement, nextPhase: GraphicsRecoveryPhase) => {
    const messageElement = element.querySelector('p') as HTMLParagraphElement,
      actionElement = element.querySelector('button') as HTMLButtonElement
    messageElement.textContent = GRAPHICS_RECOVERY_TEXT[nextPhase]
    // 等待浏览器自恢复的那一段不给按钮：点了会和浏览器自己的恢复打架（上游同口径）。
    actionElement.hidden = nextPhase === 'reloading'
    actionElement.disabled = nextPhase === 'reloading'
    element.dataset.graphicsRecovery = nextPhase
    nextPhase === 'failed' ? element.removeAttribute('aria-busy') : element.setAttribute('aria-busy', 'true')
    if (!element.isConnected) host.append(element)
    element.hidden = false
  }

  const setPhase = (nextPhase: GraphicsRecoveryPhase | null) => {
    phase = nextPhase
    if (nextPhase === null) return hide()
    paint(buildOverlay(), nextPhase)
  }

  return {
    setPhase,
    /** 回收覆盖层（dispose 时调用）。 */
    destroy() {
      clearReloadTimer()
      overlay?.remove()
      overlay = null
      phase = null
    },
  }
}

export function createGraphicsRecovery({ host, onReload, graceMs = RESTORE_GRACE_MS }: GraphicsRecoveryOptions) {
  let graceTimer: ReturnType<typeof setTimeout> | null = null
  let disposed = false
  const overlay = createRecoveryOverlay(host, () => (onReload ? onReload() : window.location.reload()))

  const show = () => {
    if (!disposed) overlay.setPhase('lost')
  }
  const hide = () => {
    if (graceTimer !== null) {
      clearTimeout(graceTimer)
      graceTimer = null
    }
    overlay.setPhase(null)
  }

  const handleLost = (event: Event) => {
    // 规范要求：阻止默认行为才会收到 restored。
    event.preventDefault()
    if (graceTimer !== null) clearTimeout(graceTimer)
    graceTimer = setTimeout(() => {
      graceTimer = null
      show()
    }, graceMs)
  }
  const handleRestored = () => hide()

  // `webglcontextlost` 不冒泡，但**捕获阶段**仍然会经过祖先：宿主是画布的祖先，
  // 挂在这里可以覆盖宿主内任何一块画布（包括后来才创建的那块）。
  host.addEventListener('webglcontextlost', handleLost, true)
  host.addEventListener('webglcontextrestored', handleRestored, true)
  // 编辑器守卫派发的全局事件：独立小渲染器（窗型预览等）丢上下文时也能提示。
  window.addEventListener('homeos:webgl-context-lost', show)
  window.addEventListener('homeos:webgl-context-restored', hide)

  return {
    show,
    hide,
    dispose() {
      disposed = true
      hide()
      host.removeEventListener('webglcontextlost', handleLost, true)
      host.removeEventListener('webglcontextrestored', handleRestored, true)
      window.removeEventListener('homeos:webgl-context-lost', show)
      window.removeEventListener('homeos:webgl-context-restored', hide)
      overlay.destroy()
    },
  }
}
