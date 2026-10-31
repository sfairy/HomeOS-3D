/**
 * 悬浮伴侣的「原地对话」：不打开对话面板，直接把一句话发给智能管家并拿到回复文本。
 *
 * 语义对齐源码 AuraPeekingMascot：气泡里先显示「正在执行指令」，成功后用回复正文
 * 替换成回复气泡；失败给一句可重试的短提示，而不是抛错到控制台让气泡卡在思考态。
 */
import { agentChat } from '@/services/api/agent'
import { getApiErrorMessage } from '@/shared/utils/core/error-message'
import { logger } from '@/shared/utils/core/logger'

/** 后端已执行但没给文案时的兜底，按 outcome 区分「做完了」与「被拦下」 */
const OUTCOME_FALLBACK: Record<string, string> = {
  success: '好的，这就为您处理完毕。',
  blocked: '出于安全考虑，该操作被拦截。',
}

/** 网络 / 服务异常时的提示（与源码同一句文案） */
const FAILURE_REPLY = '抱歉，管家连接异常，请重试。'

/**
 * 把一条指令发给智能管家，返回可直接放进气泡的回复文本。
 * @param message 用户指令（已 trim，空串由调用方拦截）
 * @param timeoutMs 兜底超时：伴侣没有会话面板，卡住的请求必须自己收尾
 */
export async function askCompanion(message: string, timeoutMs = 30_000): Promise<string> {
  let timer: ReturnType<typeof setTimeout> | null = null
  try {
    const result = await Promise.race([
      agentChat(message),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('companion-chat-timeout')), timeoutMs)
      }),
    ])
    return result.reply || OUTCOME_FALLBACK[result.outcome] || '好的，已为您执行。'
  } catch (caughtError) {
    logger.error('悬浮伴侣原地对话失败', caughtError)
    return getApiErrorMessage(caughtError, FAILURE_REPLY)
  } finally {
    if (timer) clearTimeout(timer)
  }
}
