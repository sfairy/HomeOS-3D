/**
 * 「导出面板 → 属性 / 拼接错误」映射表 —— 从 home.ts 单体切出。
 *
 * 纯查表数据（元素 → 属性名 / 数值范围），无闭包捕获、无 store。
 * 元素引用按 ctx 注入，调用点零改写。
 */

export interface ExportSpliceElementRefs {
  ibeBrightnessRealtimeElement: any;
  ibeButtonOffColorElement: any;
  ibeButtonOnColorElement: any;
  ibeButtonOpacityElement: any;
  ibeColorTemperatureRealtimeElement: any;
  ibeEffectFadeDurationElement: any;
  ibeEffectLeftElement: any;
  ibeEffectOpacityElement: any;
  ibeEffectRotationElement: any;
  ibeEffectScaleElement: any;
  ibeEffectTopElement: any;
  ibeFrameColorElement: any;
  ibeFrameOpacityElement: any;
  ibeFrameWidthElement: any;
  ibeGlowColorElement: any;
  ibeGlowOffStrengthElement: any;
  ibeGlowOnStrengthElement: any;
  ibeHeightElement: any;
  ibeIconOffColorElement: any;
  ibeIconOnColorElement: any;
  ibeIconSizeElement: any;
  ibeLeftElement: any;
  ibeRadiusElement: any;
  ibeRotationElement: any;
  ibeScaleElement: any;
  ibeTopElement: any;
  ibeWidthElement: any;
}

/**
 * 建表一次（与 `setupEventLogWallInspector` 等同一形态：表单元素引用按 ctx 注入）。
 * 正文逐字保留，只有「残留依赖显式化」这一处人工改动。
 */
export function createExportSpliceTables(
  ctx: ExportSpliceElementRefs,
) {
  const {
    ibeBrightnessRealtimeElement,
    ibeButtonOffColorElement,
    ibeButtonOnColorElement,
    ibeButtonOpacityElement,
    ibeColorTemperatureRealtimeElement,
    ibeEffectFadeDurationElement,
    ibeEffectLeftElement,
    ibeEffectOpacityElement,
    ibeEffectRotationElement,
    ibeEffectScaleElement,
    ibeEffectTopElement,
    ibeFrameColorElement,
    ibeFrameOpacityElement,
    ibeFrameWidthElement,
    ibeGlowColorElement,
    ibeGlowOffStrengthElement,
    ibeGlowOnStrengthElement,
    ibeHeightElement,
    ibeIconOffColorElement,
    ibeIconOnColorElement,
    ibeIconSizeElement,
    ibeLeftElement,
    ibeRadiusElement,
    ibeRotationElement,
    ibeScaleElement,
    ibeTopElement,
    ibeWidthElement,
  } = ctx;
  const exportSpliceErrorById = new Map([
      [
        ibeColorTemperatureRealtimeElement,
        {
          property: "effectColorTemperatureRealtime",
          type: "boolean",
        },
      ],
      [
        ibeBrightnessRealtimeElement,
        {
          property: "effectBrightnessRealtime",
          type: "boolean",
        },
      ],
      [
        ibeIconOffColorElement,
        {
          property: "iconOffColor",
        },
      ],
      [
        ibeIconOnColorElement,
        {
          property: "iconOnColor",
        },
      ],
      [
        ibeIconSizeElement,
        {
          property: "iconSize",
          min: 1,
          max: 100,
        },
      ],
      [
        ibeButtonOffColorElement,
        {
          property: "buttonOffColor",
        },
      ],
      [
        ibeButtonOnColorElement,
        {
          property: "buttonOnColor",
        },
      ],
      [
        ibeButtonOpacityElement,
        {
          property: "buttonOpacity",
          min: 0,
          max: 100,
          divisor: 100,
        },
      ],
      [
        ibeFrameColorElement,
        {
          property: "frameColor",
        },
      ],
      [
        ibeFrameWidthElement,
        {
          property: "frameWidth",
          min: 0,
          max: 20,
        },
      ],
      [
        ibeFrameOpacityElement,
        {
          property: "frameOpacity",
          min: 0,
          max: 100,
          divisor: 100,
        },
      ],
      [
        ibeRadiusElement,
        {
          property: "radius",
          min: 0,
          max: 50,
        },
      ],
      [
        ibeGlowColorElement,
        {
          property: "glowColor",
        },
      ],
      [
        ibeGlowOffStrengthElement,
        {
          property: "glowOffStrength",
          min: 0,
          max: 300,
          divisor: 100,
        },
      ],
      [
        ibeGlowOnStrengthElement,
        {
          property: "glowOnStrength",
          min: 0,
          max: 300,
          divisor: 100,
        },
      ],
      [
        ibeEffectOpacityElement,
        {
          property: "effectOpacity",
          min: 0,
          max: 100,
          divisor: 100,
        },
      ],
      [
        ibeEffectFadeDurationElement,
        {
          property: "effectFadeDuration",
          min: 0,
          max: 3,
        },
      ],
      [
        ibeEffectLeftElement,
        {
          property: "effectLeft",
          min: -100,
          max: 200,
        },
      ],
      [
        ibeEffectTopElement,
        {
          property: "effectTop",
          min: -100,
          max: 200,
        },
      ],
      [
        ibeEffectScaleElement,
        {
          property: "effectScale",
          min: 1,
          max: 500,
          divisor: 100,
        },
      ],
      [
        ibeEffectRotationElement,
        {
          property: "effectRotation",
          min: -360,
          max: 360,
        },
      ],
    ]),
    exportSpliceErrorByIdById = new Map([
      [ibeIconOffColorElement, "off"],
      [ibeButtonOffColorElement, "off"],
      [ibeGlowOffStrengthElement, "off"],
      [ibeIconOnColorElement, "on"],
      [ibeButtonOnColorElement, "on"],
      [ibeGlowOnStrengthElement, "on"],
    ]),
    exportSpliceErrorSet = new Set([
      ibeLeftElement,
      ibeTopElement,
      ibeWidthElement,
      ibeHeightElement,
      ibeScaleElement,
      ibeRotationElement,
    ]);

  return {
    exportSpliceErrorById,
    exportSpliceErrorByIdById,
    exportSpliceErrorSet,
  };
}
