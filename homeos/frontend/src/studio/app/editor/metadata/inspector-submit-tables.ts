/**
 * 「检查器表单 → 提交事件」映射表 —— 从 home.ts 单体切出。
 *
 * 纯查表数据（元素 → 提交事件名 / 属性配置），无闭包捕获、无 store。
 * 元素引用按 ctx 注入，调用点零改写。与 `*-input-tables` 同族。
 */

interface InspectorSubmitElementRefs {
  airConditionerLabelElement: any;
  airConditionerMainTextElement: any;
  airConditionerSecondaryTextElement: any;
  cameraLabelElement: any;
  dateLabelElement: any;
  ibeLabelElement: any;
  iconButtonLabelElement: any;
  iconButtonMainTextElement: any;
  iconButtonSecondaryTextElement: any;
  imageLabelElement: any;
  lightStatisticsLabelElement: any;
  lightStatisticsTitleElement: any;
  lineChartLabelElement: any;
  navigationLabelElement: any;
  navigationMainTextElement: any;
  navigationSecondaryTextElement: any;
  panelFrameLabelTextInputElement: any;
  panelFrameMainTextInputElement: any;
  panelFrameSecondaryTextInputElement: any;
  timeLabelElement: any;
  titleButtonLabelElement: any;
  titleButtonMainTextElement: any;
  titleButtonSecondaryLine1Element: any;
  titleButtonSecondaryLine2Element: any;
  vacuumMapLabelElement: any;
  weatherLabelElement: any;
}

/**
 * 建表一次（与 `setupEventLogWallInspector` 等同一形态：表单元素引用按 ctx 注入）。
 * 正文逐字保留，只有「残留依赖显式化」这一处人工改动。
 */
export function createInspectorSubmitTables(
  ctx: InspectorSubmitElementRefs,
) {
  const {
    airConditionerLabelElement,
    airConditionerMainTextElement,
    airConditionerSecondaryTextElement,
    cameraLabelElement,
    dateLabelElement,
    ibeLabelElement,
    iconButtonLabelElement,
    iconButtonMainTextElement,
    iconButtonSecondaryTextElement,
    imageLabelElement,
    lightStatisticsLabelElement,
    lightStatisticsTitleElement,
    lineChartLabelElement,
    navigationLabelElement,
    navigationMainTextElement,
    navigationSecondaryTextElement,
    panelFrameLabelTextInputElement,
    panelFrameMainTextInputElement,
    panelFrameSecondaryTextInputElement,
    timeLabelElement,
    titleButtonLabelElement,
    titleButtonMainTextElement,
    titleButtonSecondaryLine1Element,
    titleButtonSecondaryLine2Element,
    vacuumMapLabelElement,
    weatherLabelElement,
  } = ctx;
  const airConditionerInspectorSubmitEventById = new Map([
      [
        imageLabelElement,
        {
          componentType: "image",
          property: "label",
          trim: true,
        },
      ],
      [
        ibeLabelElement,
        {
          componentType: "icon-button-effect",
          property: "label",
          trim: true,
        },
      ],
      [
        titleButtonLabelElement,
        {
          componentType: "title-button",
          property: "label",
          trim: true,
        },
      ],
      [
        titleButtonMainTextElement,
        {
          componentType: "title-button",
          property: "mainText",
          trim: false,
        },
      ],
      [
        titleButtonSecondaryLine1Element,
        {
          componentType: "title-button",
          property: "secondaryText",
          trim: false,
          getValue: () =>
            titleButtonSecondaryLine1Element.value + "\n" + titleButtonSecondaryLine2Element.value,
        },
      ],
      [
        titleButtonSecondaryLine2Element,
        {
          componentType: "title-button",
          property: "secondaryText",
          trim: false,
          getValue: () =>
            titleButtonSecondaryLine1Element.value + "\n" + titleButtonSecondaryLine2Element.value,
        },
      ],
      [
        lightStatisticsLabelElement,
        {
          componentType: "light-statistics",
          property: "label",
          trim: true,
        },
      ],
      [
        lightStatisticsTitleElement,
        {
          componentType: "light-statistics",
          property: "title",
          trim: false,
        },
      ],
      [
        iconButtonLabelElement,
        {
          componentType: "icon-button",
          componentTypes: ["icon-button", "device-button", "presence-sensor"],
          property: "label",
          trim: true,
        },
      ],
      [
        iconButtonMainTextElement,
        {
          componentType: "icon-button",
          componentTypes: ["icon-button", "device-button", "presence-sensor"],
          property: "mainText",
          trim: false,
        },
      ],
      [
        iconButtonSecondaryTextElement,
        {
          componentType: "icon-button",
          componentTypes: ["icon-button", "device-button", "presence-sensor"],
          property: "secondaryText",
          trim: false,
        },
      ],
      [
        vacuumMapLabelElement,
        {
          componentType: "vacuum-map",
          property: "label",
          trim: true,
        },
      ],
      [
        cameraLabelElement,
        {
          componentType: "camera",
          property: "label",
          trim: true,
        },
      ],
      [
        airConditionerLabelElement,
        {
          componentType: "air-conditioner",
          property: "label",
          trim: true,
        },
      ],
      [
        airConditionerMainTextElement,
        {
          componentType: "air-conditioner",
          property: "mainText",
          trim: false,
        },
      ],
      [
        airConditionerSecondaryTextElement,
        {
          componentType: "air-conditioner",
          property: "secondaryText",
          trim: false,
        },
      ],
      [
        timeLabelElement,
        {
          componentType: "time",
          property: "label",
          trim: true,
        },
      ],
      [
        dateLabelElement,
        {
          componentType: "date",
          property: "label",
          trim: true,
        },
      ],
      [
        weatherLabelElement,
        {
          componentType: "weather",
          property: "label",
          trim: true,
        },
      ],
      [
        lineChartLabelElement,
        {
          componentType: "line-chart",
          property: "label",
          trim: true,
        },
      ],
      [
        panelFrameLabelTextInputElement,
        {
          componentType: "panel-frame",
          property: "label",
          trim: true,
        },
      ],
      [
        panelFrameMainTextInputElement,
        {
          componentType: "panel-frame",
          property: "mainText",
          trim: false,
        },
      ],
      [
        panelFrameSecondaryTextInputElement,
        {
          componentType: "panel-frame",
          property: "secondaryText",
          trim: false,
        },
      ],
      [
        navigationLabelElement,
        {
          componentType: "navigation-button",
          componentTypes: ["navigation-button", "scene-mode"],
          property: "label",
          trim: true,
        },
      ],
      [
        navigationMainTextElement,
        {
          componentType: "navigation-button",
          componentTypes: ["navigation-button", "scene-mode"],
          property: "mainText",
          trim: false,
        },
      ],
      [
        navigationSecondaryTextElement,
        {
          componentType: "navigation-button",
          componentTypes: ["navigation-button", "scene-mode"],
          property: "secondaryText",
          trim: false,
        },
      ],
    ]),
    onTimeInspectorFormSubmitById = new WeakMap();

  return {
    airConditionerInspectorSubmitEventById,
    onTimeInspectorFormSubmitById,
  };
}
