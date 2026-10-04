/**
 * @module core/clipboard
 * @description 跨 HTTP/HTTPS 复制文本工具。
 *
 * 策略：
 *  - 优先使用 Clipboard API（需安全上下文 window.isSecureContext）；
 *  - HTTP 非安全上下文下降级到 execCommand('copy')（通过隐藏 textarea）。
 *
 * 依赖：浏览器 navigator.clipboard / document.execCommand。
 */
/**
 * 跨 HTTP/HTTPS 复制文本：优先 Clipboard API，HTTP 非安全上下文降级 execCommand。
 * @param text 待复制文本
 * @returns 是否复制成功
 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  const value = String(text ?? '')
  if (!value) return false

  // 1) 安全上下文下优先使用原生 Clipboard API
  if (
    typeof navigator !== 'undefined' &&
    navigator.clipboard?.writeText &&
    window.isSecureContext
  ) {
    try {
      await navigator.clipboard.writeText(value)
      return true
    } catch {
      /* 失败则降级到 execCommand 路径 */
    }
  }

  if (typeof document === 'undefined') return false

  // 2) 降级：隐藏 textarea + execCommand('copy')，兼容 HTTP 非安全上下文
  try {
    const ta = document.createElement('textarea')
    ta.value = value
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.left = '-9999px'
    ta.style.top = '0'
    document.body.appendChild(ta)
    ta.focus()
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}
