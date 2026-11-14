/**
 * 把「天气 + 风速」同步给 3D 舞台。
 *
 * 为什么单独成一个模块：`runtime.ts` 是 2800+ 行的编排宿主，任何新增逻辑
 * 都会让它继续膨胀（仓库有「文件只许变小」的门禁）。这里只做一件事——
 * 把天气输入翻译成一条跨窗口消息，并且**只在变化时发**：
 * `syncWeatherEffects` 会被每条 HA 状态推送命中，每条都 postMessage 会把状态风暴
 * 原样转成跨窗口消息风暴。
 */
import { weatherEffectKey, weatherWindSpeed } from '@/studio/platform/weather-settings'

/** 下发给舞台的天气消息；`weather` 为空串表示「无天气」（舞台据此恢复基线光照）。 */
export type WeatherAtmosphereMessage = {
  type: 'weather-atmosphere'
  weather: string
  windSpeed: number
}

/**
 * @param postMessage 下发通道（宿主是 `postToStageFrame`）
 * @param readInput 取当前天气输入（HA 状态对象或预览用的 `{ state }`）
 * @returns `force` 为 true 时无条件重发（舞台 `ready` / `presented` 后需要补发）
 */
export function createWeatherAtmospherePublisher(
  postMessage: (message: WeatherAtmosphereMessage) => void,
  readInput: () => unknown,
) {
  let lastPublished = ''
  return function publishWeatherAtmosphere(force = false) {
    const input = readInput()
    const weather = weatherEffectKey(input) || ''
    const windSpeed = weatherWindSpeed(input)
    // 风速只保留一位小数：0.1 m/s 以下的变化对雨丝倾角已经不可见，但会让去重失效。
    const payload = `${weather}|${windSpeed.toFixed(1)}`
    if (!force && payload === lastPublished) return
    lastPublished = payload
    postMessage({ type: 'weather-atmosphere', weather, windSpeed })
  }
}
