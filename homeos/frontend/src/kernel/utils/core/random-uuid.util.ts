/** 实现优先级： */

/**
 * 生成 RFC4122 v4 UUID，兼容非 HTTPS 等无 crypto.randomUUID 的环境。
 *
 * @returns 符合 v4 格式的 UUID 字符串
 */
export function randomUUID(): string {
  // 1) 优先使用原生 randomUUID（最快且最安全）
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  // 2) 退化：用 getRandomValues 填充 16 字节，并按 v4 规范设置 version/variant 位
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(16)
    crypto.getRandomValues(bytes)
    bytes[6] = (bytes[6] & 0x0f) | 0x40 // version 位固定为 0x40（表示 v4）
    bytes[8] = (bytes[8] & 0x3f) | 0x80 // variant 位固定为 0x80（RFC4122）
    const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
  }

  // 3) 最终兜底：Math.random 拼接（非安全上下文，不可用于安全敏感场景）
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}
