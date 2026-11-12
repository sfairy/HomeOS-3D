/** 天气预报弹窗接缝：把 `weather-forecast.ts` 的会话挂到面板渲染器的弹窗生命周期上。 */
import { showRuntimeDialog } from './runtime-dialogs'
import type { PanelRenderer } from '../../panel-renderer'
import { createWeatherForecast, requestWeatherForecast, weatherSceneStyle } from '../../weather-forecast'

/** 弹窗设计尺寸（0.8.4 上游 760×540）：卡片 CSS 高 538，缩放基准必须一致，否则会被裁切/拉伸。 */
const WEATHER_DIALOG_DESIGN_WIDTH = 760
const WEATHER_DIALOG_DESIGN_HEIGHT = 540

export function showWeatherForecast(
  this: PanelRenderer,
  weatherDetailsComponent: any,
  // `preview` 只为调用方签名兼容保留：上游天气弹窗没有预览分支，一律挂在渲染器容器里。
  _options: { preview?: boolean } = {},
) {
  this.closeRuntimeDialog()
  const weatherEntityId = weatherDetailsComponent?.bindings?.entity?.entityId
  if (!/^weather\.[a-z0-9_]+$/.test(weatherEntityId || '')) throw new Error('请先为天气控件选择天气实体。')
  const weatherSceneTheme = weatherSceneStyle(this.document, this.page),
    weatherForecast = createWeatherForecast({
      component: weatherDetailsComponent,
      state: this.states.get(weatherEntityId),
      sceneStyle: weatherSceneTheme,
      fetchForecast: requestWeatherForecast,
    }),
    { dialog: weatherDialog, card: weatherCard } = weatherForecast,
    weatherOverlay = document.createElement('div')
  ;(weatherOverlay.className = 'hb-renderer-runtime-dialog-layer hb-runtime-no-select'),
    (weatherOverlay.dataset.runtimeDialogTheme = weatherSceneTheme),
    (weatherOverlay.tabIndex = -1),
    weatherOverlay.append(weatherDialog),
    this.container.append(weatherOverlay),
    (this.detailsDialog = weatherDialog)
  this.detailsStateSync = {
    dialog: weatherDialog,
    handlers: new Map([[weatherEntityId, [weatherForecast.syncState]]]),
  }
  this.registerRuntimeDialogScale(
    weatherOverlay,
    weatherDialog,
    WEATHER_DIALOG_DESIGN_WIDTH,
    WEATHER_DIALOG_DESIGN_HEIGHT,
  )
  this.bindRuntimeDialogOutsideDismiss(weatherOverlay, weatherDialog, weatherCard)
  const handleWeatherKeydown = (weatherKeyEvent: KeyboardEvent) => {
    weatherKeyEvent.key === 'Escape' &&
      weatherDialog.open &&
      this.detailsDialog === weatherDialog &&
      (weatherKeyEvent.preventDefault(), weatherKeyEvent.stopPropagation(), weatherDialog.close())
  }
  document.addEventListener('keydown', handleWeatherKeydown, true),
    weatherDialog.addEventListener(
      'close',
      () => {
        document.removeEventListener('keydown', handleWeatherKeydown, true),
          weatherForecast.dispose(),
          this.clearRuntimeDialogScale(weatherDialog),
          this.detailsDialog === weatherDialog && (this.detailsDialog = null),
          this.detailsStateSync?.dialog === weatherDialog && (this.detailsStateSync = null),
          weatherOverlay.remove()
      },
      { once: true },
    ),
    showRuntimeDialog(weatherDialog),
    void weatherForecast.load()
}
