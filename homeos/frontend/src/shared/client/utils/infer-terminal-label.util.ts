/** 从 UA / 屏幕尺寸推断终端可读标签（绑定 display profile 时使用） */
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