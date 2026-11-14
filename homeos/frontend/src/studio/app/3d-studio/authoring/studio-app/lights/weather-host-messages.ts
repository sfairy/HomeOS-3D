/**
 * 舞台侧天气消息入口：把宿主发来的 `weather-atmosphere` / `weather-flash` 交给天气大气控制器。
 *
 * 为什么单独一个监听器，而不是塞进 `stage.ts` 的 `handleHostMessage`：
 * 那条分支链已经到复杂度上限（门禁按函数圈复杂度计），而这两条消息本身是低频、
 * 无状态的（换天气一次、每次放电一次），完全可以在渲染器侧自成一条通路。
 *
 * 校验口径与 `stage.ts` 一致：必须是同源、且来自父窗口 —— 不能只凭 `channel` 就相信。
 */
import type { StudioAppContext } from '../studio-app-context'

type WeatherAtmosphereHost = Pick<StudioAppContext, 'weatherAtmosphere' | 'threeRenderer'>

const CHANNEL = 'hb-i3d-v1'

/**
 * 注册天气消息监听。
 *
 * @returns 反注册函数（由渲染器的统一回收路径调用）。
 */
export function installWeatherHostMessages(appCtx: WeatherAtmosphereHost) {
  function onMessage(messageEvent: MessageEvent) {
    if (messageEvent.origin !== location.origin || messageEvent.source !== window.parent) return
    const data = messageEvent.data
    if (data?.channel !== CHANNEL) return
    if (data.type === 'weather-atmosphere') {
      const weather = typeof data.weather === 'string' ? data.weather : ''
      appCtx.weatherAtmosphere?.setWeather(weather)
      // 观察窗：现场排障时能在元素面板里直接看到舞台当前跟随哪种天气
      // （2D 层早已用 `canvas.dataset.weather` 暴露同一件事）。
      const domElement = appCtx.threeRenderer?.domElement
      if (domElement) domElement.dataset.weatherAtmosphere = weather
      return
    }
    if (data.type === 'weather-flash') {
      appCtx.weatherAtmosphere?.pulseStrike(Number.isFinite(data.intensity) ? data.intensity : 1)
    }
  }
  window.addEventListener('message', onMessage)
  return () => window.removeEventListener('message', onMessage)
}
