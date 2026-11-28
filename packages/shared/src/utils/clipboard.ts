/** 策略： */
/**
 * 跨 HTTP/HTTPS 复制文本：优先 Clipboard API，HTTP 非安全上下文降级 execCommand。
 * @param text 待复制文本
 * @returns 是否复制成功
 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  const value = String(text ?? '')
  if (!value) return false

  // 1) 安全上下文下优先使用原生 Clipboard API
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(value)
      return true
    } catch {
      /* 失败则降级到 execCommand 路径 */
    }
  }

  if (typeof document === 'undefined') return false

  // 2) 降级：隐藏 textarea + execCommand('copy')，兼容 HTTP 非安全上下文
  // 清理放在 `finally`：`execCommand` / `select` / `focus` 任一抛错（kiosk / WebView）
  // 都会跳过后面的 remove，留下一个 fixed 定位、`left:-9999px` 的节点挂在 body 上。
  let ta: HTMLTextAreaElement | null = null
  try {
    ta = document.createElement('textarea')
    ta.value = value
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.left = '-9999px'
    ta.style.top = '0'
    document.body.appendChild(ta)
    ta.focus()
    ta.select()
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    ta?.remove()
  }
}
