/**
 * 智能体聊天消息长度限制
 *
 * 职责：约束用户输入的聊天文本长度，与后端 ChatDto 的 @MaxLength(500) 校验对齐，
 *   避免超长请求被后端拒绝。
 */

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
