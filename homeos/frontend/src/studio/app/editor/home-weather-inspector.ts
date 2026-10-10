/** Weather inspector sync */
import { clampNumber as clampNumber2, normalizedFontWeight as normalizedFontWeight2, roundField as roundField2 } from "./editor-utils";
import { inspectorComponentMetrics as inspectorComponentMetrics2 } from "./editor-basic-inspectors";

export interface WeatherInspectorContext { [key: string]: any }

export function syncWeatherInspector(ctx: WeatherInspectorContext, weatherComponent: any) {
  const availablePropertiesEntry = weatherComponent.properties || {},
    {
      left: LINE_CHART_DEFAULT_THRESHOLD_VALUES,
      top: LINE_CHART_DEFAULT_THRESHOLD_VALUESState,
      scale: LINE_CHART_DEFAULT_THRESHOLD_TOKENS,
      rotation: LINE_CHART_DEFAULT_THRESHOLD_TOKENSState,
    }: any = inspectorComponentMetrics2(weatherComponent, ctx.activeProject.document);
  (ctx.runExtraFallback(weatherComponent),
    (ctx.weatherTypeElement.value = "天气"),
    (ctx.weatherLabelElement.value = availablePropertiesEntry.label || ""));
  const LINE_CHART_DEFAULT_THRESHOLD_FALLBACKS = [
    [
      ctx.weatherIconVisibleElement,
      "weatherIconVisible",
      availablePropertiesEntry.iconVisible !== false,
    ],
    [
      ctx.weatherTemperatureVisibleElement,
      "weatherTemperatureVisible",
      availablePropertiesEntry.temperatureVisible !== false,
    ],
    [
      ctx.weatherConditionVisibleElement,
      "weatherConditionVisible",
      availablePropertiesEntry.conditionVisible !== false,
    ],
    [
      ctx.weatherHumidityVisibleElement,
      "weatherHumidityVisible",
      availablePropertiesEntry.humidityVisible !== false,
    ],
  ];
  for (const [
    LINE_CHART_DEFAULT_THRESHOLD_TOKENSElement,
    LINE_CHART_DEFAULT_THRESHOLD_FALLBACKSState,
    defaultLineChartThresholds,
  ] of LINE_CHART_DEFAULT_THRESHOLD_FALLBACKS)
    for (const thresholdValueElement of LINE_CHART_DEFAULT_THRESHOLD_TOKENSElement.querySelectorAll(
      "[data-" +
        LINE_CHART_DEFAULT_THRESHOLD_FALLBACKSState.replace(
          /[A-Z]/g,
          (thresholdIndexState: any) => "-" + thresholdIndexState.toLowerCase(),
        ) +
        "]",
    )) {
      const syncLineChartInspectorState =
        thresholdValueElement.dataset[LINE_CHART_DEFAULT_THRESHOLD_FALLBACKSState];
      (thresholdValueElement.classList.toggle(
        "active",
        syncLineChartInspectorState === (defaultLineChartThresholds ? "on" : "off"),
      ),
        thresholdValueElement.setAttribute(
          "aria-pressed",
          String(syncLineChartInspectorState === (defaultLineChartThresholds ? "on" : "off")),
        ));
    }
  ((ctx.weatherIconSizeElement.value = roundField2(
    clampNumber2(Number(availablePropertiesEntry.iconSize ?? 64), 12, 500),
  )),
    (ctx.weatherIconGapElement.value = roundField2(
      clampNumber2(Number(availablePropertiesEntry.iconGap ?? 22), 0, 300),
    )),
    (ctx.weatherTemperatureColorElement.value = availablePropertiesEntry.temperatureColor || "#aeb3b7"),
    (ctx.weatherTemperatureSizeElement.value = roundField2(
      clampNumber2(Number(availablePropertiesEntry.temperatureSize ?? 32), 12, 500),
    )),
    (ctx.weatherTemperatureWeightElement.value = roundField2(
      normalizedFontWeight2(availablePropertiesEntry.temperatureWeight),
    )),
    (ctx.weatherTemperatureSpacingElement.value = roundField2(
      clampNumber2(Number(availablePropertiesEntry.temperatureSpacing ?? 1), -20, 100),
    )),
    (ctx.weatherSecondaryColorElement.value = availablePropertiesEntry.secondaryColor || "#8d9296"),
    (ctx.weatherSecondarySizeElement.value = roundField2(
      clampNumber2(Number(availablePropertiesEntry.secondarySize ?? 18), 10, 500),
    )),
    (ctx.weatherSecondaryWeightElement.value = roundField2(
      normalizedFontWeight2(availablePropertiesEntry.secondaryWeight),
    )),
    (ctx.weatherSecondarySpacingElement.value = roundField2(
      clampNumber2(Number(availablePropertiesEntry.secondarySpacing ?? 1), -20, 100),
    )),
    (ctx.weatherLineGapElement.value = roundField2(
      clampNumber2(Number(availablePropertiesEntry.lineGap ?? 7), 0, 200),
    )),
    (ctx.weatherOpacityElement.value = roundField2(
      clampNumber2(Number(availablePropertiesEntry.opacity ?? 1) * 100, 0, 100),
    )),
    (ctx.weatherLeftElement.value = LINE_CHART_DEFAULT_THRESHOLD_VALUES),
    (ctx.weatherTopElement.value = LINE_CHART_DEFAULT_THRESHOLD_VALUESState),
    (ctx.weatherScaleElement.value = LINE_CHART_DEFAULT_THRESHOLD_TOKENS),
    (ctx.weatherRotationElement.value = LINE_CHART_DEFAULT_THRESHOLD_TOKENSState),
    (ctx.weatherScaleElement.disabled = false),
    (ctx.weatherRotationElement.disabled = false));
}
