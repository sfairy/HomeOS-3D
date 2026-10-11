/**
 * 时间 / 天气 / 折线检查器的「表单输入 → 属性」元数据表 —— 从 home.ts 单体切出。
 *
 * 纯查表数据（元素 → 属性名 / 数值范围 / 变换输入集合），无闭包捕获、无 store：
 * 表单元素引用由宿主按 ctx 注入，取值与写回逻辑仍在 home.ts 的输入监听里。
 * 多声明语句已整条随切片搬出（`--whole-statement`），调用点零改写。
 */

export interface DateTimeWeatherLineChartElementRefs {
  dateLeftElement: any;
  dateLineGapElement: any;
  dateLunarColorElement: any;
  dateLunarSizeElement: any;
  dateLunarSpacingElement: any;
  dateLunarWeightElement: any;
  dateOpacityElement: any;
  datePrimaryColorElement: any;
  datePrimarySizeElement: any;
  datePrimarySpacingElement: any;
  datePrimaryWeightElement: any;
  dateRotationElement: any;
  dateScaleElement: any;
  dateTopElement: any;
  lineChartCurveRadiusInputElement: any;
  lineChartHeightInputElement: any;
  lineChartHoursInputElement: any;
  lineChartLeftInputElement: any;
  lineChartRotationInputElement: any;
  lineChartScaleInputElement: any;
  lineChartStatePrecisionSelectElement: any;
  lineChartThresholdModeSelectElement: any;
  lineChartTopInputElement: any;
  lineChartUpdateIntervalInputElement: any;
  lineChartValueColorInputElement: any;
  lineChartValueOffsetXInputElement: any;
  lineChartValueOffsetYInputElement: any;
  lineChartValueScaleInputElement: any;
  lineChartWidthInputElement: any;
  weatherIconGapElement: any;
  weatherIconSizeElement: any;
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
  weatherTemperatureWeightElement: any;
  weatherTopElement: any;
}

/**
 * 建表一次（与 `setupEventLogWallInspector` 等同一形态：表单元素引用按 ctx 注入）。
 * 正文逐字保留，只有「残留依赖显式化」这一处人工改动。
 */
export function createDateTimeWeatherLineChartInputTables(
  ctx: DateTimeWeatherLineChartElementRefs,
) {
  const {
    dateLeftElement,
    dateLineGapElement,
    dateLunarColorElement,
    dateLunarSizeElement,
    dateLunarSpacingElement,
    dateLunarWeightElement,
    dateOpacityElement,
    datePrimaryColorElement,
    datePrimarySizeElement,
    datePrimarySpacingElement,
    datePrimaryWeightElement,
    dateRotationElement,
    dateScaleElement,
    dateTopElement,
    lineChartCurveRadiusInputElement,
    lineChartHeightInputElement,
    lineChartHoursInputElement,
    lineChartLeftInputElement,
    lineChartRotationInputElement,
    lineChartScaleInputElement,
    lineChartStatePrecisionSelectElement,
    lineChartThresholdModeSelectElement,
    lineChartTopInputElement,
    lineChartUpdateIntervalInputElement,
    lineChartValueColorInputElement,
    lineChartValueOffsetXInputElement,
    lineChartValueOffsetYInputElement,
    lineChartValueScaleInputElement,
    lineChartWidthInputElement,
    weatherIconGapElement,
    weatherIconSizeElement,
    weatherLeftElement,
    weatherLineGapElement,
    weatherOpacityElement,
    weatherRotationElement,
    weatherScaleElement,
    weatherSecondaryColorElement,
    weatherSecondarySizeElement,
    weatherSecondarySpacingElement,
    weatherSecondaryWeightElement,
    weatherTemperatureColorElement,
    weatherTemperatureSizeElement,
    weatherTemperatureSpacingElement,
    weatherTemperatureWeightElement,
    weatherTopElement,
  } = ctx;
  const dateColorPropertyByElement = new Map([
      [datePrimaryColorElement, "primaryColor"],
      [dateLunarColorElement, "lunarColor"],
    ]),
    datePropertyConfigsByElement = new Map([
      [
        datePrimarySizeElement,
        {
          property: "primarySize",
          minimum: 12,
          maximum: 500,
          divisor: 1,
          resizes: true,
        },
      ],
      [
        datePrimaryWeightElement,
        {
          property: "primaryWeight",
          minimum: 0,
          maximum: 1,
          divisor: 1,
          resizes: true,
        },
      ],
      [
        datePrimarySpacingElement,
        {
          property: "primarySpacing",
          minimum: -20,
          maximum: 100,
          divisor: 1,
          resizes: true,
        },
      ],
      [
        dateLunarSizeElement,
        {
          property: "lunarSize",
          minimum: 10,
          maximum: 500,
          divisor: 1,
          resizes: true,
        },
      ],
      [
        dateLunarWeightElement,
        {
          property: "lunarWeight",
          minimum: 0,
          maximum: 1,
          divisor: 1,
          resizes: true,
        },
      ],
      [
        dateLunarSpacingElement,
        {
          property: "lunarSpacing",
          minimum: -20,
          maximum: 100,
          divisor: 1,
          resizes: true,
        },
      ],
      [
        dateLineGapElement,
        {
          property: "lineGap",
          minimum: 0,
          maximum: 200,
          divisor: 1,
          resizes: true,
        },
      ],
      [
        dateOpacityElement,
        {
          property: "opacity",
          minimum: 0,
          maximum: 100,
          divisor: 100,
          resizes: false,
        },
      ],
    ]),
    dateTransformInputSet = new Set([
      dateLeftElement,
      dateTopElement,
      dateScaleElement,
      dateRotationElement,
    ]);

  const weatherColorPropertiesByElement = new Map([
      [weatherTemperatureColorElement, "temperatureColor"],
      [weatherSecondaryColorElement, "secondaryColor"],
    ]),
    weatherPropertyConfigsByElement = new Map([
      [
        weatherIconSizeElement,
        {
          property: "iconSize",
          minimum: 12,
          maximum: 500,
          divisor: 1,
          resizes: true,
        },
      ],
      [
        weatherIconGapElement,
        {
          property: "iconGap",
          minimum: 0,
          maximum: 300,
          divisor: 1,
          resizes: true,
        },
      ],
      [
        weatherTemperatureSizeElement,
        {
          property: "temperatureSize",
          minimum: 12,
          maximum: 500,
          divisor: 1,
          resizes: true,
        },
      ],
      [
        weatherTemperatureWeightElement,
        {
          property: "temperatureWeight",
          minimum: 0,
          maximum: 1,
          divisor: 1,
          resizes: true,
        },
      ],
      [
        weatherTemperatureSpacingElement,
        {
          property: "temperatureSpacing",
          minimum: -20,
          maximum: 100,
          divisor: 1,
          resizes: true,
        },
      ],
      [
        weatherSecondarySizeElement,
        {
          property: "secondarySize",
          minimum: 10,
          maximum: 500,
          divisor: 1,
          resizes: true,
        },
      ],
      [
        weatherSecondaryWeightElement,
        {
          property: "secondaryWeight",
          minimum: 0,
          maximum: 1,
          divisor: 1,
          resizes: true,
        },
      ],
      [
        weatherSecondarySpacingElement,
        {
          property: "secondarySpacing",
          minimum: -20,
          maximum: 100,
          divisor: 1,
          resizes: true,
        },
      ],
      [
        weatherLineGapElement,
        {
          property: "lineGap",
          minimum: 0,
          maximum: 200,
          divisor: 1,
          resizes: true,
        },
      ],
      [
        weatherOpacityElement,
        {
          property: "opacity",
          minimum: 0,
          maximum: 100,
          divisor: 100,
          resizes: false,
        },
      ],
    ]),
    weatherTransformInputSet = new Set([
      weatherLeftElement,
      weatherTopElement,
      weatherScaleElement,
      weatherRotationElement,
    ]);

  const lineChartColorPropertiesByElement = new Map([
      [lineChartValueColorInputElement, "valueColor"],
      [lineChartStatePrecisionSelectElement, "statePrecision"],
      [lineChartThresholdModeSelectElement, "thresholdMode"],
    ]),
    lineChartPropertyConfigsByElement = new Map([
      [
        lineChartValueScaleInputElement,
        {
          property: "valueScale",
          minimum: 10,
          maximum: 500,
          divisor: 1,
        },
      ],
      [
        lineChartValueOffsetXInputElement,
        {
          property: "valueOffsetX",
          minimum: -100,
          maximum: 100,
          divisor: 1,
        },
      ],
      [
        lineChartValueOffsetYInputElement,
        {
          property: "valueOffsetY",
          minimum: -100,
          maximum: 100,
          divisor: 1,
        },
      ],
      [
        lineChartUpdateIntervalInputElement,
        {
          property: "updateInterval",
          minimum: 30,
          maximum: 86400,
          divisor: 1,
        },
      ],
      [
        lineChartHoursInputElement,
        {
          property: "hours",
          minimum: 1,
          maximum: 168,
          divisor: 1,
        },
      ],
      [
        lineChartCurveRadiusInputElement,
        {
          property: "cornerRadius",
          minimum: 0,
          maximum: 50,
          divisor: 1,
        },
      ],
    ]),
    lineChartTransformInputSet = new Set([
      lineChartLeftInputElement,
      lineChartTopInputElement,
      lineChartWidthInputElement,
      lineChartHeightInputElement,
      lineChartScaleInputElement,
      lineChartRotationInputElement,
    ]);

  return {
    dateColorPropertyByElement,
    datePropertyConfigsByElement,
    dateTransformInputSet,
    weatherColorPropertiesByElement,
    weatherPropertyConfigsByElement,
    weatherTransformInputSet,
    lineChartColorPropertiesByElement,
    lineChartPropertyConfigsByElement,
    lineChartTransformInputSet,
  };
}
