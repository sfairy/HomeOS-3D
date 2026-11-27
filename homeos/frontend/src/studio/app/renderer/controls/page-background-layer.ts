/**
 * 页面背景的**渲染层**（0.9.0 `registry.js` 的 `page-background` 分支）——
 * 主页面与侧边栏共用同一个渲染实现。
 *
 * 与 0.9.0 对齐后的结构：
 *
 * - 外层 `.hb-page-background` 铺满组件宿主（位置 / 尺寸由组件 `position` 决定，
 *   `layoutMode=fill` 时由渲染器把组件盒改成整块画布）；
 * - 内置预设渲染 `<img>`，图片素材渲染 `<canvas>`（铺满 `object-fit: cover`，
 *   自由布局 `contain`）；
 * - 透明度文档存 0–1，直接写到外层 `style.opacity`。
 *
 * 三个必须保持的行为：
 *
 * 1. **没有图片也不崩**：返回空层；编辑态给出「尚未选择背景图片」提示。
 * 2. **子节点不参与命中**：`pointer-events: none`。否则它会吃掉控件的点击
 *    （页面背景是"装饰"，不是"表面"）。
 * 3. **图片地址随容器形状切换**：预设图有横 / 竖 / 方三套，按容器盒宽高比挑一套。
 */
import {
  DEFAULT_PAGE_BACKGROUND_OPACITY,
  normalizePageBackground,
  pageBackgroundPresetSource,
  type PageBackground,
  type PageBackgroundPosition,
} from '@app/shared/page-background'

/** 用户素材的 URL 生成（与其它控件共用同一套口径：`user:` 前缀走资产接口）。 */
export type ResolveAssetUrl = (assetId: string) => string | undefined

export type MountPageBackgroundOptions = {
  /** 背景配置（任何来源都要先过 `normalizePageBackground`）。 */
  background: unknown
  /** 组件自身盒（px）。自由布局用它决定背景层的实际尺寸；缺省按画布 / 16:9。 */
  component?: { position?: PageBackgroundPosition } | null
  /** 画布尺寸：铺满模式用它，旧百分比位置也用它折算。 */
  canvas?: { width?: number; height?: number }
  /** 把素材 id 转成可用的图片地址（预设不需要）。 */
  resolveAssetUrl?: ResolveAssetUrl
  /** 额外类名（宿主区分主页面 / 侧边栏）。 */
  className?: string
  /** 编辑态：素材缺失 / 加载失败时把提示写进层里。 */
  editable?: boolean
}

const DEFAULT_CANVAS_WIDTH = 2778
const DEFAULT_CANVAS_HEIGHT = 1940

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value
}

function readPosition(value: unknown): PageBackgroundPosition | undefined {
  if (!value || typeof value !== 'object') return undefined
  const source = value as Record<string, unknown>
  const x = Number(source.x)
  const y = Number(source.y)
  const width = Number(source.width)
  const height = Number(source.height)
  if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return undefined
  return { x, y, width, height }
}

/**
 * 背景盒：铺满 = 画布；自由 = 组件 `position`；旧移植期文档回落到百分比盒。
 *
 * 只用于「挑预设横/竖/方版本」，不负责定位 —— 定位由渲染器给组件宿主的几何决定。
 */
export function resolvePageBackgroundBox(options: {
  background: unknown
  component?: { position?: PageBackgroundPosition } | null
  canvas?: { width?: number; height?: number }
}): PageBackgroundPosition {
  const background = normalizePageBackground(options.background)
  const canvasWidth = Number(options.canvas?.width || DEFAULT_CANVAS_WIDTH)
  const canvasHeight = Number(options.canvas?.height || DEFAULT_CANVAS_HEIGHT)
  if (background.layoutMode === 'fill') {
    return { x: 0, y: 0, width: canvasWidth, height: canvasHeight }
  }
  const componentPosition = readPosition(options.component?.position)
  const legacy = background.legacyPosition
  const canvasBox = { x: 0, y: 0, width: canvasWidth, height: canvasHeight }
  // 旧文档的组件盒仍是「铺满画布」：此时百分比盒才是用户真正设过的位置。
  if (componentPosition && (!legacy || !isFullCanvas(componentPosition, canvasBox))) return componentPosition
  if (legacy) {
    return {
      x: (canvasWidth * legacy.x) / 100,
      y: (canvasHeight * legacy.y) / 100,
      width: (canvasWidth * legacy.width) / 100,
      height: (canvasHeight * legacy.height) / 100,
    }
  }
  return componentPosition ?? canvasBox
}

function isFullCanvas(position: PageBackgroundPosition, canvas: PageBackgroundPosition): boolean {
  return (
    Math.abs(position.x) < 0.5 &&
    Math.abs(position.y) < 0.5 &&
    Math.abs(position.width - canvas.width) < 0.5 &&
    Math.abs(position.height - canvas.height) < 0.5
  )
}

/** 解析出最终要用的图片地址；没有可用地址时返回 `null`。 */
export function resolvePageBackgroundImage(
  background: PageBackground,
  options: Pick<MountPageBackgroundOptions, 'resolveAssetUrl' | 'component' | 'canvas'> = {},
): string | null {
  if (background.backgroundSource === 'image') {
    const resolve = options.resolveAssetUrl
    if (!background.assetId || !resolve) return null
    const url = resolve(background.assetId)
    return url || null
  }
  const box = resolvePageBackgroundBox({
    background,
    component: options.component,
    canvas: options.canvas,
  })
  return pageBackgroundPresetSource(background.preset, box.width, box.height)
}

/**
 * 建一个背景层元素。
 *
 * 与 0.9.0 一致，即使图片素材缺失也返回外层节点（编辑态带提示），
 * 由宿主决定是否插入；这样「删掉素材」不会让组件选中态突然消失。
 */
export function mountPageBackgroundLayer(options: MountPageBackgroundOptions): HTMLElement {
  const background = normalizePageBackground(options.background)
  const layer = document.createElement('div')
  layer.className = options.className ? `${LAYER_CLASS} ${options.className}` : LAYER_CLASS
  layer.dataset.pageBackground = background.backgroundSource
  // 装饰层：不进无障碍树（屏幕阅读器不该读出「一张背景图」）。
  layer.setAttribute('aria-hidden', 'true')
  layer.style.opacity = String(clamp(background.opacity, 0, 1))

  if (background.backgroundSource !== 'image') {
    const image = document.createElement('img')
    image.alt = ''
    image.draggable = false
    image.src = resolvePageBackgroundImage(background, options) || ''
    layer.append(image)
    return layer
  }

  const assetUrl = resolvePageBackgroundImage(background, options)
  if (!assetUrl) {
    if (options.editable) layer.textContent = '尚未选择背景图片'
    return layer
  }

  const canvas = document.createElement('canvas')
  canvas.style.objectFit = background.layoutMode === 'fill' ? 'cover' : 'contain'
  canvas.draggable = true
  layer.append(canvas)
  drawPageBackgroundImage(canvas, layer, assetUrl, background, options)
  return layer
}

/**
 * 把图片画进 canvas（与 0.9.0 的 `draw` 同口径：不放大、最长边 1000px 上限）。
 *
 * 用 canvas 而不是 `<img>` 是上游的选择：运行端需要按容器尺寸重新采样，
 * 避免大图在 1080p 画布上每帧走缩放管线。
 */
function drawPageBackgroundImage(
  canvas: HTMLCanvasElement,
  layer: HTMLElement,
  assetUrl: string,
  background: PageBackground,
  options: MountPageBackgroundOptions,
): void {
  const image = new Image()
  const box = resolvePageBackgroundBox({
    background,
    component: options.component,
    canvas: options.canvas,
  })
  const release = () => {
    image.onload = null
    image.onerror = null
  }
  image.onload = () => {
    const naturalWidth = image.naturalWidth
    const naturalHeight = image.naturalHeight
    if (!naturalWidth || !naturalHeight) {
      release()
      return
    }
    const devicePixelRatio = globalThis.devicePixelRatio || 1
    const targetWidth = Number(box.width || naturalWidth) * devicePixelRatio
    const targetHeight = Number(box.height || naturalHeight) * devicePixelRatio
    const ratio =
      background.layoutMode === 'fill'
        ? Math.max(targetWidth / naturalWidth, targetHeight / naturalHeight)
        : Math.min(targetWidth / naturalWidth, targetHeight / naturalHeight)
    const scale = Math.min(1, ratio, 1000 / Math.max(naturalWidth, naturalHeight))
    canvas.width = Math.max(1, Math.round(naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(naturalHeight * scale))
    canvas.getContext('2d')?.drawImage(image, 0, 0, canvas.width, canvas.height)
    release()
  }
  image.onerror = () => {
    release()
    if (options.editable) {
      layer.replaceChildren()
      layer.textContent = '背景图片无法加载'
    }
  }
  image.src = assetUrl
}

/** 背景层的稳定类名（CSS 与测试都依赖它）。 */
export const LAYER_CLASS = 'hb-page-background'

/** 文档组件类型别名（注册表使用同一个常量，避免两处写字符串）。 */
export const PAGE_BACKGROUND_COMPONENT_TYPE = 'page-background'

/** 默认透明度（导出给宿主做兜底）。 */
export const PAGE_BACKGROUND_DEFAULT_OPACITY = DEFAULT_PAGE_BACKGROUND_OPACITY
