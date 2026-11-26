/**
 * 按实际显示尺寸请求图片（0.8.9 `display-images.js`）—— 纯计算部分。
 *
 * 放在 `app/shared` 的原因：`studio/runtime` 只允许依赖 app 的**叶子层**
 * （`app/shared` / `app/bridge` / `platform`），不允许依赖 `app/renderer`。
 * 视频屏/电脑屏的取图在 runtime 里，所以 URL/尺寸/绘制这些纯函数必须落在叶子层；
 * `app/renderer/controls/display-images.ts` 再把它转出去给 2D 渲染侧使用
 * （那边额外带着 ResizeObserver + rAF 的挂载逻辑）。
 *
 * 解决的问题：一块 200×120 的控件去下 4000×3000 的原图，浏览器解出来的位图约 48 MB，
 * 而屏幕上只用其中 1/1600。这里把元素的**实际像素尺寸**（含 DPR）折算成
 * `displaySize=WxH`，交给后端出副本（见 `platform/core/http/display_images.py`）。
 *
 * 三条必须保持的口径：
 *
 * 1. **只对可派生的 URL 加参数**：内置素材与用户素材 / 导图。其它地址（外链、data:、
 *    SVG）一律原样返回 —— 加了参数反而会 404 或破坏缓存键。
 * 2. **尺寸取整到 64 的倍数、上限 4096**：同尺寸族命中同一份后端缓存。不取整会让
 *    「窗口拖动 1px」也变成一次新派生。
 * 3. **居中裁切用分带表达**（`displayCropBand`）：前端只知道容器宽高比的
 *    `floor(log2(aspect) * 16)`，量化后相邻容器落进同一档 —— 这正是不让缓存爆炸的关键。
 */

/** 可派生副本的 URL 前缀（与后端 `_served_image` 的接入点一一对应）。 */
const DERIVABLE_URL = /^\/(?:assets\/builtin\/|api\/v1\/assets\/(?:user|studio3d-export)\/)/

/** SVG 是矢量：缩放无损，不需要派生。 */
const SVG_URL = /\.svg(?:[?#]|$)/i

/** 尺寸取整粒度。后端按此量化缓存键。 */
export const DISPLAY_IMAGE_ROUND = 64

/** 单边上限（与后端 `MAX_EDGE` 一致）。 */
export const DISPLAY_IMAGE_MAX_EDGE = 4096

/** 宽高比分带的每倍频程档数（与后端 `CROP_BANDS_PER_OCTAVE` 一致）。 */
export const DISPLAY_IMAGE_CROP_BANDS_PER_OCTAVE = 16

export type DisplayImageSizing = {
  /** 目标像素宽（已含 DPR、已取整）。 */
  width: number
  /** 目标像素高。 */
  height: number
  /** 铺满：后端裁到目标宽高比并缩放到精确尺寸。 */
  cover?: boolean
  /** 静帧：动图只取第一帧（3D 屏幕贴图用）。 */
  still?: boolean
  /** 居中裁切分带；`null` 表示不裁切。 */
  cropBand?: number | null
}

/** 这个 URL 能否加派生参数（外链 / data: / SVG 都不行）。 */
export function isDerivableImageUrl(url: string): boolean {
  if (!url || SVG_URL.test(url)) return false
  // 带 origin 的绝对地址先剥掉 origin 再判定，避免 `https://host/api/...` 被漏掉。
  const path = url.startsWith('data:') ? '' : url.replace(/^[a-z]+:\/\/[^/]+/i, '')
  return DERIVABLE_URL.test(path)
}

/**
 * 把元素尺寸折算成取整后的目标像素。
 *
 * `devicePixelRatio` 必须参与：200 CSS px 在 2× 屏上是 400 物理像素，按 200 请求
 * 会明显发虚。取整后再夹到 `[MIN, MAX]`，保证「同族尺寸命中同一份缓存」。
 */
export function quantizeDisplaySize(
  cssWidth: number,
  cssHeight: number,
  devicePixelRatio = 1,
): { width: number; height: number } | null {
  const ratio = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1
  const rawWidth = Math.ceil(Number(cssWidth) * ratio)
  const rawHeight = Math.ceil(Number(cssHeight) * ratio)
  if (!Number.isFinite(rawWidth) || !Number.isFinite(rawHeight) || rawWidth <= 0 || rawHeight <= 0) return null
  const quantize = (value: number) =>
    Math.min(
      DISPLAY_IMAGE_MAX_EDGE,
      // 下限取一个粒度单位：既保证结果是 64 的整数倍（同族命中同一份后端缓存），
      // 也避免极小元素算出 0（0 宽高在后端会被当成非法参数而回落整张原图）。
      Math.max(DISPLAY_IMAGE_ROUND, Math.round(value / DISPLAY_IMAGE_ROUND) * DISPLAY_IMAGE_ROUND),
    )
  return { width: quantize(rawWidth), height: quantize(rawHeight) }
}

/**
 * 宽高比 → 裁切分带（`floor(log2(aspect) * 16)`）。
 *
 * 之所以要分带而不是直接传宽高比：分带后相邻容器的宽高比落在同一整数档，
 * 后端只需按档出图，缓存键空间从「连续值」收敛成「几十个整数」。
 */
export function displayImageCropBand(width: number, height: number): number | null {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null
  const band = Math.floor(Math.log2(width / height) * DISPLAY_IMAGE_CROP_BANDS_PER_OCTAVE)
  if (!Number.isFinite(band)) return null
  // 与后端一致的上下限（±64 档 ≈ 宽高比 16:1 ~ 1:16）。
  return Math.max(-64, Math.min(64, band))
}

/** 取 URL 上已有的查询串（保留素材的 `?v=` 版本号）。 */
function existingQuery(url: string): URLSearchParams {
  const [base] = url.split('#', 2)
  const [, query = ''] = base.split('?', 2)
  return new URLSearchParams(query)
}

/** 把 sizing 折成查询参数（不做 URL 判定；调用方已确认可派生）。 */
function sizingQuery(sizing: DisplayImageSizing): URLSearchParams {
  const params = new URLSearchParams(`displaySize=${Math.round(sizing.width)}x${Math.round(sizing.height)}`)
  if (sizing.cover) params.set('displayFit', 'cover')
  if (sizing.still) params.set('displayStill', '1')
  if (sizing.cropBand !== null && sizing.cropBand !== undefined && Number.isInteger(sizing.cropBand)) {
    params.set('displayCrop', '1')
    params.set('displayCropBand', String(sizing.cropBand))
  }
  return params
}

/**
 * 生成最终的图片地址。
 *
 * - 不可派生的 URL 原样返回；
 * - 已带 `displaySize` 的地址**替换**而不是追加（否则会拼出两个参数）；
 * - `still` 只用于 3D 屏幕贴图这类「只要一帧」的位置。
 */
export function displayImageSource(url: string, sizing: DisplayImageSizing): string {
  if (!isDerivableImageUrl(url)) return url
  const { width, height } = sizing
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return url
  const merged = existingQuery(url)
  for (const [key, value] of sizingQuery(sizing)) merged.set(key, value)
  // 手拼而不是 URL：需要保留原始查询串与 hash 片段。
  const [base, hash = ''] = url.split('#', 2)
  const [path] = base.split('?', 2)
  return `${path}?${merged.toString()}${hash ? `#${hash}` : ''}`
}

/**
 * 3D 屏幕贴图按**画布像素**取图（0.8.9 `screenUploadSource`）。
 *
 * 与网页里的 `<img>` 不同，屏幕贴图的尺寸由模型屏幕面决定，且画布本身就是纹理像素
 * （已经乘过倍率），所以这里 `devicePixelRatio` 固定为 1，避免二次放大。
 *
 * - `fit: 'cover'` 用于电视（画面铺满，宁可裁边也不留黑边）；
 * - `fit: 'contain'` 用于电脑屏（桌面截图不能裁，留边由画布底色承担）；
 * - `still: true` 让后端只出静帧 —— 纹理每帧重传一张动图既没意义也浪费带宽。
 */
export function screenUploadSource(
  url: string,
  canvasWidth: number,
  canvasHeight: number,
  options: { fit?: 'cover' | 'contain'; still?: boolean } = {},
): string {
  const size = quantizeDisplaySize(canvasWidth, canvasHeight, 1)
  if (!size) return url
  const cover = options.fit === 'cover'
  return displayImageSource(url, {
    ...size,
    cover,
    still: options.still === true,
    cropBand: cover ? displayImageCropBand(size.width, size.height) : null,
  })
}

/**
 * 把图片画到画布：`fit` 决定「铺满裁边」还是「等比留边」。
 *
 * 抽成公共函数的原因：电视屏与电脑屏此前各写一份 `Math.min/Math.max` + 居中偏移，
 * 一旦有人改了归一逻辑，另一处就会漏改（0.8.9 的 `drawContainedScreenImage` 同源）。
 */
function drawScreenImage(
  context: CanvasRenderingContext2D,
  image: { naturalWidth: number; naturalHeight: number },
  width: number,
  height: number,
  fit: 'cover' | 'contain',
): void {
  const scale =
    fit === 'cover'
      ? Math.max(width / image.naturalWidth, height / image.naturalHeight)
      : Math.min(width / image.naturalWidth, height / image.naturalHeight)
  const drawnWidth = image.naturalWidth * scale
  const drawnHeight = image.naturalHeight * scale
  context.drawImage(
    image as CanvasImageSource,
    (width - drawnWidth) / 2,
    (height - drawnHeight) / 2,
    drawnWidth,
    drawnHeight,
  )
}

/** 等比内嵌（contain，留边）：电脑屏 / 摄像头截图。 */
export function drawContainedScreenImage(
  context: CanvasRenderingContext2D,
  image: { naturalWidth: number; naturalHeight: number },
  width: number,
  height: number,
): void {
  drawScreenImage(context, image, width, height, 'contain')
}

/** 铺满（cover，超出裁掉）：电视 / 宣传画。 */
export function drawCoveredScreenImage(
  context: CanvasRenderingContext2D,
  image: { naturalWidth: number; naturalHeight: number },
  width: number,
  height: number,
): void {
  drawScreenImage(context, image, width, height, 'cover')
}

/**
 * 屏幕图加载器工厂（0.8.9 `createScreenImageLoader`）。
 *
 * 电视屏与电脑屏各自写了「new Image + 退避重试 + 离屏暂停」，两份策略细节不同
 * （电视固定 2 次退避、电脑屏指数退避且离线暂停）。这里只统一**可统一的部分**：
 * 生成带 `displaySize` 的源、按画布尺寸绘制、取消加载。重试策略仍由各自宿主决定 ——
 * 强行合并会把两套策略压成最大公倍数，反而退化。
 */
export function createScreenImageLoader(options: { createImage?: () => HTMLImageElement } = {}) {
  const createImage = options.createImage ?? (() => new Image())
  return {
    /** 取源（带 displaySize / displayStill），调用方决定何时赋给 img.src。 */
    source(url: string, canvasWidth: number, canvasHeight: number, fit: 'cover' | 'contain' = 'contain') {
      return screenUploadSource(url, canvasWidth, canvasHeight, { fit, still: true })
    },
    /** 加载一帧：成功给 image，失败给 error；`signal` 中止时不回调。 */
    load(url: string, canvasWidth: number, canvasHeight: number, fit: 'cover' | 'contain' = 'contain') {
      return new Promise<HTMLImageElement>((resolve, reject) => {
        const image = createImage()
        image.onload = () => resolve(image)
        image.onerror = () => reject(new Error('screen image load failed'))
        image.src = screenUploadSource(url, canvasWidth, canvasHeight, { fit, still: true })
      })
    },
  }
}
