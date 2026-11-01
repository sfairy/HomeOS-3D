/**
 * 服务端 TTS 播放：把后端签发的 `ttsUrl` 用 `<audio>` 放出来。
 *
 * 为什么不复用 `useTtsSpeak`：那条链路是「让谁说话」（本机 SpeechSynthesis / HA
 * 音箱），这条是「后端已经合成好了 mp3，直接播」。两者的失败语义也不同 ——
 * 这里失败就返回 `false`，调用方回落 `useTtsSpeak`，绝不向用户报错。
 */
import { getCurrentScope, onScopeDispose, ref } from 'vue'
import { applyOutputSink } from '@/composables/voice/useAudioDevices'
import { logger } from '@/shared/utils/core/logger'

export function useServerTts() {
  const speaking = ref(false)
  // 同一时刻只保留一个播放器，避免连续两轮回复的声音叠在一起
  let player: HTMLAudioElement | null = null

  function reset(target: HTMLAudioElement) {
    if (player !== target) return
    player = null
    speaking.value = false
  }

  function stop() {
    if (!player) return
    const current = player
    player = null
    speaking.value = false
    try {
      current.pause()
      current.removeAttribute('src')
      current.load()
    } catch (error) {
      logger.debug('停止服务端 TTS 播放失败', error)
    }
  }

  /**
   * 播放一段服务端音频。
   *
   * 起点返回：`play()` 只等到「真的开始出声」就 resolve，不等整段放完 ——
   * 调用点后面还排着状态收尾（气泡、busy 标记），不能被几十秒的音频钉住。
   * 中途解码失败只静默停播，不再回落（此时用户已经在听了）。
   *
   * @param url 后端 `ttsUrl`（相对路径或绝对地址）
   * @returns 是否真的开始播放；`false` 时调用方应回落本机 / HA 播报
   */
  async function play(url: string | undefined | null): Promise<boolean> {
    const target = String(url || '').trim()
    if (!target) return false
    stop()
    const audio = new Audio(target)
    // 不预加载：用户可能立刻切走，白下载一段没听的音频
    audio.preload = 'none'
    audio.addEventListener('ended', () => reset(audio), { once: true })
    audio.addEventListener(
      'error',
      () => {
        logger.debug('服务端 TTS 播放中断', audio.error?.code)
        reset(audio)
      },
      { once: true },
    )
    player = audio
    speaking.value = true
    // 设置页选的「本机扬声器」只对支持 setSinkId 的媒体元素生效：
    // 必须在 play() 之前应用，播放中途换 sink 会有一次可听见的断音。
    try {
      await applyOutputSink(audio)
    } catch (error) {
      logger.debug('服务端 TTS 切换输出设备失败', error)
    }
    try {
      // 自动播放策略拦截（用户手势之外触发）会在这里 reject
      await audio.play()
      return true
    } catch (error) {
      logger.debug('服务端 TTS 启动失败', error)
      reset(audio)
      return false
    }
  }

  // 模块级单例（伙伴语音）没有 effect scope，跳过注册避免告警
  if (getCurrentScope()) onScopeDispose(stop)

  return { speaking, play, stop }
}
