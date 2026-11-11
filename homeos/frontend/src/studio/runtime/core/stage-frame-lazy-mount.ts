/**
 * 舞台 iframe 懒挂载闸门（B11）。
 *
 * 宿主（编辑器 / 展示页）里 3D 舞台 iframe 一直是首屏同步挂载：runtime 初始化完就赋
 * src → stage.html、three、模型全压进首屏关键路径。这里把「第一次赋 src」推迟到宿主
 * 真正可见且浏览器空闲之后：看不见的控件不做任何加载，看得见的控件也让出首屏长任务。
 * iframe 元素本身仍留在 DOM（透明占位）。
 *
 * 语义保持：45s 加载超时、预览挂起（isPreviewSuspended）、失败重试退避都仍然只在
 * 「真正赋 src 之后」生效；未挂载前的 reload 只更新待加载 URL。
 */

// idle 回调在主线程空闲时会立即触发，这里只是「一直不空闲」时的上限；舞台加载本身
// 在 iframe 里另起事件循环，等太久只会把可见的 3D 白白推迟。
const LAZY_MOUNT_IDLE_TIMEOUT_MS = 250

/** requestIdleCallback 在部分宿主（Safari 旧版 / 测试环境）不存在，按可选能力访问。 */
type IdleCapableGlobal = typeof globalThis & {
  requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number
  cancelIdleCallback?: (handle: number) => void
}

function idleCapableGlobal(): IdleCapableGlobal {
  return globalThis as IdleCapableGlobal
}

function requestIdleMount(run: () => void, timeoutMs: number): number | null {
  const idleGlobal = idleCapableGlobal()
  return typeof idleGlobal.requestIdleCallback === 'function'
    ? idleGlobal.requestIdleCallback(run, { timeout: timeoutMs })
    : null
}

function cancelIdleMount(handle: number | null): void {
  if (handle !== null) idleCapableGlobal().cancelIdleCallback?.(handle)
}

export type StageFrameLazyMountGate = {
  /** 请求加载（首次 = 等可见 + idle；已挂载 = 立即执行，等价旧 reload 语义）。 */
  begin: (assign: () => void) => void
  dispose: () => void
}

type StageFrameVisibilityWatcher = {
  start: () => void
  stop: () => void
}

/**
 * 等宿主真正可见：IntersectionObserver 首次相交 / visibilitychange / bfcache pageshow。
 * 与闸门状态解耦，便于把 createStageFrameLazyMountGate 控制在文件规模与复杂度阈值内。
 */
function createStageFrameVisibilityWatcher({
  hostElement,
  isHostVisible,
  shouldStop,
  onVisible,
}: {
  hostElement: HTMLElement
  isHostVisible: () => boolean
  shouldStop: () => boolean
  onVisible: () => void
}): StageFrameVisibilityWatcher {
  let waiting = false
  let intersectionObserver: IntersectionObserver | null = null

  const handleVisibilityChange = () => {
    if (shouldStop() || !isHostVisible()) return
    onVisible()
  }

  const stop = () => {
    if (!waiting) return
    waiting = false
    intersectionObserver?.disconnect()
    intersectionObserver = null
    document.removeEventListener('visibilitychange', handleVisibilityChange)
    window.removeEventListener('pageshow', handleVisibilityChange)
  }

  const start = () => {
    if (shouldStop() || waiting) return
    waiting = true
    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('pageshow', handleVisibilityChange)
    if (typeof IntersectionObserver !== 'function') {
      // 没有 IO（极老宿主）时保守加载，避免舞台永远不出现。
      onVisible()
      return
    }
    intersectionObserver = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return
        stop()
        onVisible()
      },
      { threshold: 0.01 },
    )
    intersectionObserver.observe(hostElement)
  }

  return { start, stop }
}

export function createStageFrameLazyMountGate({
  hostElement,
  isHostVisible,
  idleTimeoutMs = LAZY_MOUNT_IDLE_TIMEOUT_MS,
}: {
  hostElement: HTMLElement
  isHostVisible: () => boolean
  idleTimeoutMs?: number
}): StageFrameLazyMountGate {
  let disposed = false
  let mounted = false
  let pendingAssignment: (() => void) | null = null
  let idleCallbackId: number | null = null

  const visibilityWatcher = createStageFrameVisibilityWatcher({
    hostElement,
    isHostVisible,
    shouldStop: () => disposed || mounted,
    onVisible: () => scheduleIdleMount(),
  })

  function mountNow() {
    if (disposed || mounted || !pendingAssignment) return
    mounted = true
    visibilityWatcher.stop()
    const runAssignment = pendingAssignment
    pendingAssignment = null
    runAssignment()
  }

  function scheduleIdleMount() {
    if (disposed || mounted || idleCallbackId !== null) return
    idleCallbackId = requestIdleMount(() => {
      idleCallbackId = null
      if (disposed || mounted) return
      // idle 期间宿主又不可见了（切换路由/切后台）：回到等待，不白白加载舞台。
      if (!isHostVisible()) {
        visibilityWatcher.start()
        return
      }
      mountNow()
    }, idleTimeoutMs)
    if (idleCallbackId === null) mountNow()
  }

  function begin(assign: () => void) {
    if (disposed) return
    pendingAssignment = assign
    if (mounted) {
      pendingAssignment = null
      assign()
      return
    }
    if (isHostVisible()) scheduleIdleMount()
    else visibilityWatcher.start()
  }

  function dispose() {
    if (disposed) return
    disposed = true
    pendingAssignment = null
    visibilityWatcher.stop()
    cancelIdleMount(idleCallbackId)
    idleCallbackId = null
  }

  return { begin, dispose }
}

/**
 * 舞台 GPU 上下文丢失 / 恢复时更新宿主 loading 占位提示（B22）。
 *
 * 舞台内部（authoring 的 bindFrameDriver）已经负责上下文恢复本身，这里只补宿主的可见提示：
 * lost 时把 loading 文案换成「正在自动恢复」，restored 时收起，避免用户以为页面卡死。
 */
export function applyStageGpuHint(loadingElement: HTMLElement, eventCode: string): void {
  if (eventCode === 'gpu-lost') {
    loadingElement.hidden = false
    loadingElement.textContent = '3D 画面显卡上下文丢失，正在自动恢复…'
  } else if (eventCode === 'gpu-restored') {
    loadingElement.hidden = true
  }
}

/**
 * 45s 还没出图只显示提示，不能走 failSceneLoad：那会清掉 isReloadPending，
 * 之后迟到的 presented 被丢弃，画面永远卡在提示上。
 */
export function scheduleSlowLoadHint(loadingElement: HTMLElement, isSettled: () => boolean) {
  return setTimeout(() => {
    if (!isSettled()) loadingElement.textContent = '3D 户型加载较慢，请稍候；若一直没有画面，请重新载入户型。'
  }, 45000)
}
