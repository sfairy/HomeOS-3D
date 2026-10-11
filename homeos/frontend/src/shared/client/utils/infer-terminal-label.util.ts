/**
 * 从 UA / 屏幕尺寸推断终端可读标签（绑定 display profile 时使用）
 *
 * 职责：从 navigator.userAgent / platform / 视口宽度推断终端的可读标签
 *   （如 "iPad · 1024px"），在绑定 display profile 时作为默认名。
 * 依赖：浏览器 navigator / window API。
 */
export function inferTerminalLabel(): string {
  if (typeof navigator === 'undefined') return '未知终端'
  const ua = navigator.userAgent || ''
  const platform = navigator.platform || ''
  const width = typeof window !== 'undefined' ? window.innerWidth : 0

  let kind = '浏览器'
  if (/iPad/i.test(ua) || (platform === 'MacIntel' && (navigator.maxTouchPoints ?? 0) > 1)) {
    kind = 'iPad'
  } else if (/Android/i.test(ua)) {
    kind = 'Android 平板'
  } else if (/iPhone/i.test(ua)) {
    kind = 'iPhone'
  } else if (/Windows/i.test(ua)) {
    kind = 'Windows'
  } else if (/Mac/i.test(platform)) {
    kind = 'Mac'
  }

  return width > 0 ? `${kind} · ${width}px` : kind
}