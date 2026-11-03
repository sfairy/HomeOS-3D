/**
 * 管家回复的播报：服务端合成音频优先，失败回落本机 / HA。
 *
 * 为什么单独成 composable 而不是在调用点内联：对话面板与悬浮伴侣都要这套
 * 「先试 mp3、不行再让本机说话」的逻辑，且两处都卡在文件规模上限里 ——
 * 抽出来既避免两处各写一遍回落分支，也不给那两个大文件加行。
 */
import { useServerTts } from '@/composables/voice/useServerTts'
import { useTtsSpeak } from '@/composables/voice/useTtsSpeak'
import { getConfigSection } from '@/shared/utils/config/frontend-config'
import { logger } from '@/shared/utils/core/logger'

export function useAgentSpeech() {
  const { play, stop: stopServer } = useServerTts()
  const { speak } = useTtsSpeak()

  /** 语音播报是否开启（`voice.ttsEnabled` 默认开启） */
  function enabled(): boolean {
    return getConfigSection('voice')?.ttsEnabled !== false
  }

  /**
   * 播报一句回复：先试后端签发的音频，拿不到（或播放失败）再回落既有链路。
   *
   * @param ttsUrl 后端 `ttsUrl`；空值直接走回落
   * @param text   回复正文，回落播报用
   */
  async function speakReply(ttsUrl: string | undefined | null, text: string): Promise<boolean> {
    if (!enabled() || !String(text || '').trim()) return false
    if (await play(ttsUrl)) return true
    try {
      const result = await speak(text)
      return result.ok
    } catch (error) {
      logger.debug('播报回落失败', error)
      return false
    }
  }

  /**
   * 停止当前播报：服务端音频与浏览器本机合成都要停。
   *
   * 只停服务端会留下「点了停止但本机还在念」的割裂感；``speechSynthesis`` 在部分环境
   * 不存在（SSR / 旧内核），因此做存在性判断而不是直接调用。
   */
  function stop(): void {
    try {
      stopServer()
    } catch (error) {
      logger.debug('停止服务端播报失败', error)
    }
    try {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel()
      }
    } catch (error) {
      logger.debug('停止本机播报失败', error)
    }
  }

  return { speak, speakReply, stop }
}
