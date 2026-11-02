/**
 * 对话气泡的正文清洗与指标格式化（纯函数，无副作用）。
 *
 * 气泡是纯文本内插、不渲染富文本（与源码面板同一口径），但模型习惯写
 * `**加粗**` / `__下划线__` / 反引号代码；原样显示会把标记符号露出来。
 * 这里只去标记、不丢文字。
 */
export function agentReplyText(text: string): string {
  return String(text ?? '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
}

/**
 * 耗时角标：过千毫秒换秒，避免 `3139ms` 这种四位数字挤在气泡角落。
 * 精确值留在悬浮提示（`:title`）里，不丢信息。
 */
export function agentDurationLabel(ms: number | undefined): string {
  const value = Number(ms)
  if (!Number.isFinite(value) || value <= 0) return ''
  if (value < 1000) return `${Math.round(value)}ms`
  const seconds = value / 1000
  return `${seconds < 10 ? seconds.toFixed(1) : Math.round(seconds)}s`
}

/** 角标的悬浮提示：角标本身是 `3.1s · 117t` 的压缩写法，精确值放这里 */
export function agentFootTitle(ms: number, tokens: number): string {
  return `耗时 ${ms}ms${tokens ? ` · 生成 ${tokens} tokens` : ''}`
}
