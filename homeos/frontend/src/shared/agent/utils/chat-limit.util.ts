/** 智能体聊天消息长度限制 */

/** 与后端 ChatDto @MaxLength(500) 对齐 */
export const AGENT_CHAT_MAX_LENGTH = 500

/**
 * 裁剪聊天消息到最大长度。
 *
 * @param text 原始输入文本（可能为空 / null）
 * @returns 去除首尾空白后截断到 AGENT_CHAT_MAX_LENGTH 的字符串
 */
export function clipAgentChatMessage(text: string): string {
  return String(text || '').trim().slice(0, AGENT_CHAT_MAX_LENGTH)
}
