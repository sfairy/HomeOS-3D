/**
 * 天气预览态：面板点「雨 / 雷雨…」先看 12 秒，到点自动恢复真实天气。
 *
 * 单独成模块的原因：这段状态（预览键、超时句柄、订阅者）原先散在 2800 行的
 * `runtime.ts` 里，而仓库有「文件只许变小」的门禁。抽出来之后运行时只保留一个
 * 入口，预览的合法性判断也集中在一处。
 */
import { WEATHER_EFFECTS, WEATHER_PREVIEW_TIMEOUT_MS, weatherEffectKey } from '@/studio/platform/weather-settings'

/** 预览态订阅者：参数是当前预览键（空串表示没有预览）。 */
export type WeatherPreviewListener = (previewState: string) => void

type WeatherPreviewOptions = {
  /** 运行时是否已销毁。 */
  isDisposed: () => boolean
  /**
   * 除「已销毁」之外的全部前置条件（授权 / 场景已呈现 / 编辑态 / 页面可见性 / 区域编辑 …）。
   *
   * **不能**把可见性重算也算进来：不可见时结束预览会让「点预览按钮」在不可见的那一帧
   * 自我了断——按钮已高亮、画面却什么都没发生。
   */
  canPreview: () => boolean
  /** 预览态变化后通知运行时同步天气层与舞台光照。 */
  onSync: () => void
}

export function createWeatherPreview({ isDisposed, canPreview, onSync }: WeatherPreviewOptions) {
  /** 当前预览的天气键；空串表示没有预览。 */
  let condition = ''
  let timeoutId: ReturnType<typeof setTimeout> | null = null
  const listeners = new Set<WeatherPreviewListener>()

  function notify() {
    for (const listener of listeners) listener(condition)
  }

  function clearTimer() {
    if (timeoutId === null) return
    clearTimeout(timeoutId)
    timeoutId = null
  }

  /** 结束预览（含 12 秒超时到点）。空态直接返回，避免与同步逻辑相互递归。 */
  function close() {
    clearTimer()
    if (!condition) return
    condition = ''
    notify()
    onSync()
  }

  /** 进入预览态。合法态与可预览性都从 `WEATHER_EFFECTS` 派生：新增天气不必再改这里。 */
  function preview(weatherState: unknown) {
    const previewKey = weatherEffectKey(weatherState)
    if (isDisposed() || !canPreview() || !previewKey || !WEATHER_EFFECTS[previewKey].preview) return false
    clearTimer()
    condition = previewKey
    timeoutId = setTimeout(close, WEATHER_PREVIEW_TIMEOUT_MS)
    notify()
    onSync()
    return true
  }

  return {
    get condition() {
      return condition
    },
    preview,
    close,
    /** 订阅预览态；订阅即回报当前值（面板重开时仍能对上正在进行的预览）。 */
    subscribe(listener: WeatherPreviewListener) {
      listeners.add(listener)
      listener(condition)
      return () => {
        listeners.delete(listener)
      }
    },
    /** 运行时回收：定时器、预览态与订阅者都不该活过运行时。 */
    dispose() {
      clearTimer()
      condition = ''
      listeners.clear()
    },
  }
}

export type WeatherPreview = ReturnType<typeof createWeatherPreview>
