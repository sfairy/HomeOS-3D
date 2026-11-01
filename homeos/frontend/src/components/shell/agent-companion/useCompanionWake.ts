/**
 * 悬浮伴侣的唤醒词监听。
 *
 * 伴侣本身只有「长按说话」一个入口，而屏保态与语音组件早就接好了唤醒词 ——
 * 用户在设置里打开 `voice.wakeWordEnabled` 却发现对着管家喊没反应，是能力不一致。
 * 这里把同一条 `useWakeWord` 链路接到伴侣上：
 *
 * - 只在**伴侣可见**且**未在录音**时监听：不然后台常驻麦克风，且会和长按抢麦；
 * - 开关跟随 `configEpoch` 重算：设置页改完立刻生效，不必刷新；
 * - 识别到「唤醒词 + 指令」时直接把指令交给一轮原地对话（用户已经说完了，
 *   再让他重新长按一次是多余的动作）；只说唤醒词时不抢占，交给长按流程。
 *
 * 抽成独立模块而不是写进组件：`AgentCompanion.vue` 卡在文件规模棘轮上。
 */
import { computed, watch } from 'vue'
import type { Ref } from 'vue'
import { useWakeWord } from '@/composables/voice/useWakeWord'
import { configEpoch, getConfigSection } from '@/shared/utils/config/frontend-config'

export interface CompanionWakeOptions {
  /** 伴侣是否可见（不可见时不该占用麦克风） */
  visible: Ref<boolean>
  /** 是否正在录音 / 处理中（此时让位给长按流程） */
  busy?: () => boolean
  /** 收到唤醒词后的指令文本 */
  onCommand: (command: string) => void
  /** 可选：识别错误的中文提示（挂到气泡 / 日志用） */
  onError?: (message: string) => void
}

export interface CompanionWakeHandle {
  /** 当前是否在监听唤醒词（模板可用来显示提示） */
  listening: Ref<boolean>
  /** 最近一次错误（空串表示无） */
  lastError: Ref<string>
}

/**
 * 绑定唤醒词监听；组件卸载时 `useWakeWord` 自带清理。
 *
 * @param options 可见性 / 忙碌判定与回调
 */
export function useCompanionWake(options: CompanionWakeOptions): CompanionWakeHandle {
  /** 是否允许监听：可见 + 交互模式为唤醒词 + 唤醒词开启 + 不在录音 */
  const enabled = computed(() => {
    // 读 configEpoch 建立依赖：设置页保存后 enabled 重算，watch 才会补上 start/stop
    void configEpoch.value
    if (!options.visible.value) return false
    if (options.busy?.()) return false
    const voice = getConfigSection('voice')
    // 与屏保同一口径：交互模式不是「唤醒词待命」时不该常驻麦克风
    return voice?.interactionMode === 'wake' && voice?.wakeWordEnabled === true
  })

  const { listening, lastError, start, stop } = useWakeWord(
    (command: string) => {
      const text = String(command || '').trim()
      if (!text) return
      options.onCommand(text)
    },
    {
      enabled: () => enabled.value,
      onError: (message: string) => {
        if (message) options.onError?.(message)
      },
    },
  )

  watch(
    enabled,
    (active) => {
      if (active) start()
      else stop()
    },
    { immediate: true },
  )

  return { listening, lastError }
}
