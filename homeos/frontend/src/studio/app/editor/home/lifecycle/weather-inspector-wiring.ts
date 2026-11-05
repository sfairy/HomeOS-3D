/**
 * 天气组件检查器的开关接线（0.8.4）：可见性四按钮 + 预报开关。
 *
 * 两者都是「点一下改 weather 组件属性」，与 `attachLineChartInspectorInput` 那类
 * 绑处理器同一层，搬出宿主是为了让 `editor/home/lifecycle/boot.ts` 保持在拆分预算内。
 * 依赖袋由 `boot.ts` 原地提供（DOM 常量、编辑上下文与写库入口都留在宿主）。
 */
export function bindWeatherInspectorToggles(deps: any): void {
  for (const weatherVisibilityElement of deps.visibilityElements)
    weatherVisibilityElement.addEventListener('click', (weatherVisibilityEvent: any) => {
      const weatherVisibilityComponentId = deps.getSelectedComponentId(),
        weatherVisibilityButtonElement = weatherVisibilityEvent.target.closest('button')
      if (!weatherVisibilityComponentId || !weatherVisibilityButtonElement) return
      const weatherVisibilityEntry = [
        ['weatherIconVisible', 'iconVisible'],
        ['weatherTemperatureVisible', 'temperatureVisible'],
        ['weatherConditionVisible', 'conditionVisible'],
        ['weatherHumidityVisible', 'humidityVisible'],
      ].find(
        ([weatherVisibilityDatasetKey]: any) =>
          weatherVisibilityButtonElement.dataset[weatherVisibilityDatasetKey] !== undefined,
      )
      if (!weatherVisibilityEntry) return
      const [weatherVisibilityDatasetKeyName, weatherVisibilityPropertyName] = weatherVisibilityEntry
      deps.mutateDocument((weatherVisibilityDraftDocument: any) => {
        const weatherVisibilityComponent = deps.findComponent(
          weatherVisibilityDraftDocument,
          weatherVisibilityComponentId,
        )?.component
        !weatherVisibilityComponent ||
          weatherVisibilityComponent.type !== 'weather' ||
          ((weatherVisibilityComponent.properties = {
            ...(weatherVisibilityComponent.properties || {}),
            [weatherVisibilityPropertyName]:
              weatherVisibilityButtonElement.dataset[weatherVisibilityDatasetKeyName] === 'on',
          }),
          deps.fitWeatherComponent(weatherVisibilityComponent, weatherVisibilityComponent.properties))
      })
    })
  deps.forecastEnabledElement.addEventListener('click', (weatherForecastEvent: any) => {
    const weatherForecastComponentId = deps.getSelectedComponentId(),
      weatherForecastButtonElement = weatherForecastEvent.target.closest('[data-weather-forecast-enabled]')
    if (!weatherForecastComponentId || !weatherForecastButtonElement) return
    const weatherForecastEnabledValue = weatherForecastButtonElement.dataset.weatherForecastEnabled === 'on'
    deps.mutateDocument((weatherForecastDraftDocument: any) => {
      const weatherForecastComponent = deps.findComponent(
        weatherForecastDraftDocument,
        weatherForecastComponentId,
      )?.component
      weatherForecastComponent?.type === 'weather' &&
        (weatherForecastComponent.properties = {
          ...(weatherForecastComponent.properties || {}),
          forecastEnabled: weatherForecastEnabledValue,
        })
    })
  })
}
