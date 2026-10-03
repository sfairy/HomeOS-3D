/**
 * 户型图宽高比工具
 *
 * 职责：
 * - 由底图像素尺寸生成约分后的 CSS aspect-ratio 字符串。
 * - 判定是否应自动从底图推导宽高比（占位值或未手动锁定时）。
 * - 解析用于 CSS 的 aspect-ratio 字符串，自动场景回退到 fallback。
 *
 * 依赖：无外部依赖，纯函数。
 *
 * 注意：占位值（'auto' / '1556 / 1313' 等）与 fallback 字符串为 CSS aspect-ratio
 *   字面量，不翻译。
 */

/** 视为「自动按底图比例」的占位值（未手动锁定宽高比时） */
const AUTO_ASPECT_RATIO_PLACEHOLDERS = new Set(['', 'auto', '1 / 1', '1556 / 1313'])

/**
 * 求两数最大公约数（用于约分宽高比）。
 *
 * @param a 输入 a
 * @param b 输入 b
 * @returns 最大公约数；两者均为 0 时返回 1 避免除零
 */
function gcd(a: number, b: number): number {
  let x = Math.abs(Math.round(a))
  let y = Math.abs(Math.round(b))
  while (y) {
    const t = y
    y = x % y
    x = t
  }
  return x || 1
}

/**
 * 由像素尺寸生成 CSS aspect-ratio 字符串（约分后）。
 *
 * @param width 底图宽度（像素）
 * @param height 底图高度（像素）
 * @returns 形如 `W / H` 的字符串；非法尺寸回退 `1556 / 1313`
 */
export function formatAspectRatioFromPixels(width: number, height: number): string {
  if (!width || !height || !Number.isFinite(width) || !Number.isFinite(height)) {
    return '1556 / 1313'
  }
  const g = gcd(width, height)
  return `${Math.round(width / g)} / ${Math.round(height / g)}`
}

/**
 * 是否应自动从底图推导宽高比。
 *
 * @param ratio 当前宽高比字符串
 * @param manualLocked 是否手动锁定；为 true 时一律返回 false
 * @returns true 表示应使用 fallback / 自动推导
 */
export function isAutoAspectRatio(ratio: unknown, manualLocked?: boolean): boolean {
  if (manualLocked) return false
  const s = String(ratio ?? '')
    .trim()
    .toLowerCase()
  return AUTO_ASPECT_RATIO_PLACEHOLDERS.has(s)
}

/**
 * 解析用于 CSS 的 aspect-ratio 字符串。
 *
 * @param ratio 当前宽高比字符串
 * @param manualLocked 是否手动锁定
 * @param fallback 自动场景下的回退值，默认 `1556 / 1313`
 * @returns 可直接写入 CSS aspect-ratio 的字符串
 */
export function resolveFloorAspectRatio(
  ratio: unknown,
  manualLocked?: boolean,
  fallback = '1556 / 1313',
): string {
  const s = String(ratio ?? '').trim()
  if (isAutoAspectRatio(s, manualLocked)) return fallback
  return s || fallback
}

/** 加载图片并返回推导的 aspect-ratio */
export function probeImageAspectRatio(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!url) {
      reject(new Error('URL 为空'))
      return
    }
    const img = new Image()
    img.onload = () => {
      resolve(formatAspectRatioFromPixels(img.naturalWidth, img.naturalHeight))
    }
    img.onerror = () => reject(new Error('图片加载失败'))
    img.src = url
  })
}
