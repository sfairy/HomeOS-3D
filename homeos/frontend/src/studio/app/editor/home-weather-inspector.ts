/** Weather inspector sync */
import { clampNumber as clampNumber2, normalizedFontWeight as normalizedFontWeight2, roundField as roundField2 } from "./editor-utils";
import { inspectorComponentMetrics as inspectorComponentMetrics2 } from "./editor-basic-inspectors";

interface WeatherInspectorContext {
  /** 字段清单 = 本文件里出现过的袋子取值（`ctx.<key>` / 别名访问 / 解构），由
   *  `ops/studio/studio_context_bag_typing.mjs` 从**真实使用**生成，一个不多一个不少。
   *
   * 类型暂为 `any`：宿主 `home.ts` 的 `findElement()` 仍返回宽类型，控件语义（`.value` /
   * `.checked` / `.options`）由注入点保证。**但开放索引签名已去掉** —— 键名拼错、宿主漏传
   * 一个键现在会被 `tsc` 拦下。下一步是给 `findElement` 建「选择器 → 元素类型」映射，
   * 再把这批字段换成具体类型。 */
  activeProject: any;
  runExtraFallback: any;
  weatherConditionVisibleElement: any;
  weatherHumidityVisibleElement: any;
  weatherIconGapElement: any;
  weatherIconSizeElement: any;
  weatherIconVisibleElement: any;
  weatherLabelElement: any;
  weatherLeftElement: any;
  weatherLineGapElement: any;
  weatherOpacityElement: any;
  weatherRotationElement: any;
  weatherScaleElement: any;
  weatherSecondaryColorElement: any;
  weatherSecondarySizeElement: any;
  weatherSecondarySpacingElement: any;
  weatherSecondaryWeightElement: any;
  weatherTemperatureColorElement: any;
  weatherTemperatureSizeElement: any;
  weatherTemperatureSpacingElement: any;
  weatherTemperatureVisibleElement: any;
  weatherTemperatureWeightElement: any;
  weatherTopElement: any;
  weatherTypeElement: any;
}

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
