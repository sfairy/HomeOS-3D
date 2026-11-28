/**
 * 按实际显示尺寸请求图片（0.8.9 `display-images.js`）—— 挂载与监听部分。
 *
 * 纯计算（URL 加参、尺寸取整、裁切分带、屏幕绘制）在
 * [`app/shared/display-image-source.ts`](../../shared/display-image-source.ts)：
 * `studio/runtime` 的屏幕贴图要用同一套函数，而 runtime 只允许依赖 app 的叶子层。
 *
 * 这里保留的是必须碰 DOM 的部分：`ResizeObserver` + 一帧一次批量提交。
 * 尺寸监听按帧合并：一屏几十张图同时回调时，逐张改 `src` 会触发几十次重排。
 */
import {
  displayImageCropBand,
  displayImageSource,
  isDerivableImageUrl,
  quantizeDisplaySize,
} from '@app/shared/display-image-source'

// 公开契约保持原样：2D 渲染侧与上层组件都从这里导入。
export {
  DISPLAY_IMAGE_CROP_BANDS_PER_OCTAVE,
  DISPLAY_IMAGE_MAX_EDGE,
  DISPLAY_IMAGE_ROUND,
  type DisplayImageSizing,
  displayImageCropBand,
  displayImageSource,
  drawContainedScreenImage,
  drawCoveredScreenImage,
  isDerivableImageUrl,
  quantizeDisplaySize,
  screenUploadSource,
} from '@app/shared/display-image-source'

type SizingEnv = {
  devicePixelRatio?: number
  requestAnimationFrame?: (callback: FrameRequestCallback) => number
  cancelAnimationFrame?: (handle: number) => void
}

type ObservedTarget = {
  element: Element
  cover: boolean
  apply: (source: string, width: number, height: number) => void
  source: string
  lastKey: string
}

/**
 * 尺寸监听器：一批元素共用一次 rAF 提交。
 *
 * `observe` 返回取消函数；元素离屏（`isConnected === false`）时自动跳过，
 * 因此列表虚拟化/弹窗关闭后残留的观察者不会继续跑。
 */
export function createDisplayImageSizing(env: SizingEnv = {}) {
  const targets = new Map<Element, ObservedTarget>()
  const schedule =
    env.requestAnimationFrame ??
    ((callback: FrameRequestCallback) => setTimeout(() => callback(0), 16) as unknown as number)
  const cancel =
    env.cancelAnimationFrame ?? ((handle: number) => clearTimeout(handle as unknown as ReturnType<typeof setTimeout>))
  let frame: number | null = null

  const flush = () => {
    frame = null
    const dpr = env.devicePixelRatio ?? 1
    for (const [element, target] of targets) {
      // 已脱离文档 = 调用方没交清理函数（或先移除了元素）：顺手摘掉登记。
      // 只 `continue` 会让这条记录永久留在**进程级**共享控制器里，每次重排都被遍历一遍。
      if (!element.isConnected) {
        targets.delete(element)
        continue
      }
      const size = quantizeDisplaySize(element.clientWidth, element.clientHeight, dpr)
      if (!size) continue
      const band = target.cover ? displayImageCropBand(size.width, size.height) : null
      const key = `${size.width}x${size.height}|${band ?? ''}|${target.source}`
      if (key === target.lastKey) continue
      target.lastKey = key
      target.apply(
        displayImageSource(target.source, { ...size, cover: target.cover, cropBand: band }),
        size.width,
        size.height,
      )
    }
  }

  const requestFlush = () => {
    if (frame !== null) return
    frame = schedule(flush)
  }

  return {
    /** 开始观察一个元素；返回停止观察的函数。 */
    observe(
      element: Element,
      options: { source: string; cover?: boolean },
      apply: (source: string, width: number, height: number) => void,
    ) {
      targets.set(element, {
        element,
        cover: options.cover === true,
        source: options.source,
        apply,
        lastKey: '',
      })
      requestFlush()
      return () => {
        targets.delete(element)
      }
    },
    /** 元素尺寸变化后调用（由 ResizeObserver 或窗口 resize 触发）。 */
    invalidate() {
      requestFlush()
    },
    /** 立即同步跑一轮（首屏不想等一帧时用）。 */
    flushNow() {
      if (frame !== null) {
        cancel(frame)
        frame = null
      }
      flush()
    },
    /** 停止全部观察并取消挂起的帧。 */
    dispose() {
      targets.clear()
      if (frame !== null) {
        cancel(frame)
        frame = null
      }
    },
  }
}

export type DisplayImageSizingController = ReturnType<typeof createDisplayImageSizing>

/**
 * 进程内共享的尺寸监听器。
 *
 * 一屏可能有几十张图，每个元素各建一个 rAF 循环会让「一次重排」变成几十次提交；
 * 共享一个控制器后，同一帧内的所有元素合并成一次 flush。
 *
 * 用可变对象而不是模块级 `let`：项目有「模块级 let 计数」的棘轮，且这里确实只需要
 * 一个惰性初始化的容器。
 */
const sharedSizing: { controller: DisplayImageSizingController | null } = { controller: null }

/** 取（或惰性创建）共享控制器。只能在浏览器环境调用。 */
export function sharedDisplayImageSizing(): DisplayImageSizingController {
  if (!sharedSizing.controller) {
    sharedSizing.controller = createDisplayImageSizing({
      devicePixelRatio: typeof window === 'undefined' ? 1 : window.devicePixelRatio,
      requestAnimationFrame: (callback) =>
        typeof window === 'undefined'
          ? (setTimeout(() => callback(0), 16) as unknown as number)
          : window.requestAnimationFrame(callback),
      cancelAnimationFrame: (handle) =>
        typeof window === 'undefined'
          ? clearTimeout(handle as unknown as ReturnType<typeof setTimeout>)
          : window.cancelAnimationFrame(handle),
    })
  }
  return sharedSizing.controller
}

/**
 * 给一个 `<img>` 挂上按尺寸取图：设定初值后持续跟随元素尺寸。
 *
 * 返回停止观察的函数（元素被移出文档后应当调用，避免残留观察者）。
 */
export function mountDisplayImage(
  element: HTMLImageElement,
  source: string,
  options: { cover?: boolean } = {},
): () => void {
  element.src = source
  if (!isDerivableImageUrl(source)) return () => undefined
  const controller = sharedDisplayImageSizing()
  const stop = controller.observe(element, { source, cover: options.cover }, (nextSource) => {
    if (element.src !== nextSource) element.src = nextSource
  })
  const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => controller.invalidate())
  observer?.observe(element)
  return () => {
    observer?.disconnect()
    stop()
  }
}
