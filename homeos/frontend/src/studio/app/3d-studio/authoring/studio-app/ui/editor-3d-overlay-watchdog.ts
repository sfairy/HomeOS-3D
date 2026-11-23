/**
 * 3D 编辑叠层的兜底看门狗（相机签名 + 降频轮询）。
 *
 * 从 `editor-3d-wiring` 拆出的原因有两个：
 * 1. 长度 —— 它自带一整套定时器 / 帧句柄状态，混在绑定函数里会把两者都顶过复杂度门禁的长度阈值；
 * 2. 职责 —— 这里只回答「叠层该不该重排」，不关心叠层由谁画、画了什么。
 */
import type { StudioAppRuntime } from '../runtime/studio-app-runtime'

/**
 * 相机 / 画布签名：任何一个数变了，叠层的投影就不再成立。
 *
 * 用三组 16 元矩阵（`matrixWorld` / `matrixWorldInverse` / `projectionMatrix`）+ 画布布局尺寸
 * + 场景修订号，比「监听某个事件」可靠 —— OrbitControls 会因相机模式切换被重建、
 * 帧循环有提前 return 的分支、`topRotation` 动画直接改矩阵而不发事件。
 *
 * `projectionMatrix` 不能漏：正交 ↔ 透视、改焦段、`resize` 都只动投影矩阵，
 * `matrixWorld` 可以一个字节都不变。
 *
 * 只做数值比较，不分配对象：调用方传入固定长度的 scratch 数组（3 项标量 + 3×16 矩阵）。
 * 早期版本每 tick 都 `push` 出一个 51 元素数组 —— 看门狗按帧跑，等于每秒 60 次纯分配。
 */
const SIGNATURE_SCALARS = 3
export const SIGNATURE_LENGTH = SIGNATURE_SCALARS + 3 * 16

export function writeCameraSignature(runtime: StudioAppRuntime, out: number[]): number[] {
  const camera = runtime.appCtx.threeCamera as {
    matrixWorld?: { elements?: ArrayLike<number> }
    matrixWorldInverse?: { elements?: ArrayLike<number> }
    projectionMatrix?: { elements?: ArrayLike<number> }
  } | null
  const canvas = runtime.appCtx.threeRenderer?.domElement as HTMLCanvasElement | undefined
  out[0] = canvas?.clientWidth ?? 0
  out[1] = canvas?.clientHeight ?? 0
  out[2] = runtime.appCtx.sceneRevisionCount
  let cursor = SIGNATURE_SCALARS
  for (const matrix of [camera?.matrixWorld, camera?.matrixWorldInverse, camera?.projectionMatrix]) {
    const elements = matrix?.elements
    if (elements) {
      for (let index = 0; index < 16; index += 1) out[cursor + index] = elements[index]
    } else {
      // 缺失时补 0 而不是缩短数组：长度一变就会被判成「变了」，每帧白白重排一次叠层。
      for (let index = 0; index < 16; index += 1) out[cursor + index] = 0
    }
    cursor += 16
  }
  return out
}

export function signatureChanged(previous: number[], next: number[]): boolean {
  if (previous.length !== next.length) return true
  for (let index = 0; index < next.length; index += 1) {
    // 相机矩阵有浮点抖动，1e-6 以内视为没动（否则松手后每帧都重排一次叠层）。
    // 前 3 项是画布宽高与场景修订号（整数），同一容差即可 —— 早期给它们 0.5 的余量，
    // 顺带把矩阵前三个元素也放过了一次，顶视旋转 90° 那种整元素变化会被吞掉。
    if (Math.abs(previous[index] - next[index]) > 1e-6) return true
  }
  return false
}

/** 交互窗口内按帧、静置后降到 5Hz 的排程器（帧句柄与定时器互斥，只有一个在跑）。 */
const IDLE_POLL_MS = 200
const ACTIVE_WINDOW_MS = 1500

function createWatchdogScheduler(tick: () => void) {
  let frame = 0
  let timer: ReturnType<typeof setTimeout> | null = null
  return {
    /** tick 入口先调：清掉「已触发」的句柄，避免重复排程。 */
    consume: () => {
      frame = 0
      timer = null
    },
    clear: () => {
      if (frame) cancelAnimationFrame(frame)
      frame = 0
      if (timer !== null) clearTimeout(timer)
      timer = null
    },
    schedule: (isActive: boolean) => {
      if (isActive) {
        frame = requestAnimationFrame(tick)
        return
      }
      timer = setTimeout(tick, IDLE_POLL_MS)
    },
  }
}

/** 指针 / 可见性监听：指针或滚轮一到就回到逐帧模式（交互期响应与原实现一致）。 */
function bindWatchdogListeners(
  doc: Document | undefined,
  canvas: HTMLCanvasElement,
  onPointerActive: () => void,
  onVisibility: () => void,
): () => void {
  doc?.addEventListener('visibilitychange', onVisibility)
  canvas.addEventListener('pointerdown', onPointerActive, { passive: true })
  canvas.addEventListener('pointermove', onPointerActive, { passive: true })
  canvas.addEventListener('wheel', onPointerActive, { passive: true })
  return () => {
    doc?.removeEventListener('visibilitychange', onVisibility)
    canvas.removeEventListener('pointerdown', onPointerActive)
    canvas.removeEventListener('pointermove', onPointerActive)
    canvas.removeEventListener('wheel', onPointerActive)
  }
}

export interface OverlayWatchdog {
  start: () => void
  /** 叠层刚被刷新过（由 `update()` 调用）。 */
  touch: () => void
  dispose: () => void
}

/**
 * 交互窗口内按帧检查、静置后降到 5Hz 的看门狗。
 *
 * 为什么必须降频：SPA 里这个 rAF 永不停止，一台 24/7 的墙上平板光看门狗就是每天五百万次
 * 唤醒，而它绝大部分时间只是在比对 51 个浮点数。画面一旦真的变化（相机被拖 / 视角动画 /
 * 场景重建）都会有主相机出图，`installOverlayRefreshHook` 会先一步调用 `update()` 并
 * `touch()` 这里，所以降频不会让叠层变迟钝。
 */
export function createOverlayWatchdog(
  runtime: StudioAppRuntime,
  doc: Document | undefined,
  canvas: HTMLCanvasElement,
  previousSignature: number[],
  update: () => void,
): OverlayWatchdog {
  const probeSignature: number[] = new Array<number>(SIGNATURE_LENGTH).fill(0)
  const scheduler = createWatchdogScheduler(tick)
  let lastActivityAt = performance.now()
  let running = true
  let unbind: (() => void) | null = null

  const isActive = (): boolean => performance.now() - lastActivityAt < ACTIVE_WINDOW_MS

  function refreshIfCameraMoved(): void {
    writeCameraSignature(runtime, probeSignature)
    if (!signatureChanged(previousSignature, probeSignature)) return
    // 检测到变化就立刻回到逐帧模式：静置降频只是省唤醒，不能让「画面在动」也按 5Hz 追。
    // 主相机出图时 `installOverlayRefreshHook` 已经先一步刷过叠层，这里是它的兜底 ——
    // 兜底最多晚一个轮询间隔（200ms）发现变化，之后按帧跟上，不会持续滞后。
    lastActivityAt = performance.now()
    // 不在这里改 `previousSignature`：`update()` 会按它自己读到的签名记录，
    // 这样「本帧已经刷过」时看门狗自动跳过，叠层每帧只写一次 DOM。
    try {
      update()
    } catch (overlayError) {
      console.warn('[studio] 编辑叠层刷新失败', overlayError)
    }
  }

  function tick(): void {
    scheduler.consume()
    if (!running) return
    // 页面不可见时不比对也不排程：`visibilitychange` 回来时重新启动。
    if (!doc?.hidden) refreshIfCameraMoved()
    scheduler.schedule(isActive())
  }

  const markActive = (): void => {
    lastActivityAt = performance.now()
    if (!running) return
    scheduler.clear()
    scheduler.schedule(true)
  }

  const handleVisibility = (): void => {
    scheduler.clear()
    if (!running || doc?.hidden) return
    lastActivityAt = performance.now()
    scheduler.schedule(true)
  }

  return {
    start: () => {
      unbind = bindWatchdogListeners(doc, canvas, markActive, handleVisibility)
      scheduler.schedule(isActive())
    },
    touch: () => {
      lastActivityAt = performance.now()
    },
    dispose: () => {
      running = false
      scheduler.clear()
      unbind?.()
      unbind = null
    },
  }
}
