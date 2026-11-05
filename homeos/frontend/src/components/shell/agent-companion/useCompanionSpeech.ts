/**
 * 悬浮伴侣的语音回合：把「问管家」与「播报回答」绑成一次调用。
 *
 * 为什么是模块级函数而不是 composable：伴侣的调用点 `handleVoiceResult` 只需要
 * 「问 + 说」这一件事，做成 composable 就要在调用点多出一个实例化语句；而
 * `AgentCompanion.vue` 正卡在文件规模棘轮上（1273 行，只允许变小）。这里的
 * 播放器是全局单例，反而天然满足「同一时刻只有一段管家声音」。
 *
 * 依赖都是懒创建的：`useTtsSpeak` 会访问 pinia store，模块加载期拿不到实例。
 */
import { getCurrentScope, onScopeDispose } from 'vue'
import { useServerTts } from '@/composables/voice/useServerTts'
import { playEarcon } from '@/composables/voice/useEarcon'
import { useTtsSpeak } from '@/composables/voice/useTtsSpeak'
import { getConfigSection } from '@/shared/utils/config/frontend-config'
import { logger } from '@/shared/utils/core/logger'
import { askCompanion } from './useCompanionChat'

type ServerTts = ReturnType<typeof useServerTts>
type LocalTts = ReturnType<typeof useTtsSpeak>

let deps: { server: ServerTts; local: LocalTts } | null = null

function resolveDeps() {
  if (!deps) {
    deps = { server: useServerTts(), local: useTtsSpeak() }
    // 页面卸载时 audio 会随文档销毁；显式监听只为兜住 bfcache 恢复的场景
    window.addEventListener('pagehide', () => stopCompanionSpeech())
  }
  return deps
}

/** 停止当前播报（新一轮提问、模块自带清理都走这里） */
function stopCompanionSpeech() {
  deps?.server.stop()
}

/**
 * 播报一句回复：先试后端签发的音频，拿不到或播放失败再回落本机 / HA。
 *
 * @param ttsUrl 后端 `ttsUrl`；空值直接走回落
 * @param text   回复正文，回落播报用
 */
async function speakCompanionReply(text: string, ttsUrl?: string): Promise<boolean> {
  if (!String(text || '').trim()) return false
  if (getConfigSection('voice')?.ttsEnabled === false) return false
  const { server, local } = resolveDeps()
  if (await server.play(ttsUrl)) return true
  try {
    const result = await local.speak(text)
    return result.ok
  } catch (error) {
    logger.debug('伴侣播报回落失败', error)
    return false
  }
}

/**
 * 问一轮并播报回答，返回可直接放进气泡的回复正文。
 *
 * 播报用 `void` 发起：音频时长与气泡停留时长互不牵连，长回复不会把气泡钉住。
 */
export async function askCompanionSpoken(message: string): Promise<string> {
  const answer = await askCompanion(message)
  // 音效先出声：它是「已经处理完」的即时反馈，不该排在几十秒的播报后面
  void playEarcon(answer.earcon)
  void speakCompanionReply(answer.reply, answer.ttsUrl)
  return answer.reply
}

/** 组件作用域内使用时自动停播；模块级调用时静默跳过 */
if (getCurrentScope()) onScopeDispose(stopCompanionSpeech)
