/**
 * 「预览态 / 效果可见性 / 图标预览」的「表单输入 → 元数据」表 —— 从 home.ts 单体切出。
 *
 * 与 `navigation-input-tables` / `date-weather-linechart-input-tables` 同族：纯查表数据
 * （元素 → 属性名 / 预览键），无闭包捕获、无 store。源文件里它们是**一条多声明语句**，
 * 故整条搬出（`--whole-statement`）；表单元素引用按 ctx 注入，调用点零改写。
 */

import { airflowCanvasOffsetBounds as airflowCanvasOffsetBounds2 } from "../../renderer/core/renderer";

export interface EffectPreviewInputElementRefs {
  airConditionerAirflowAngleElement: any;
  airConditionerAirflowBlurElement: any;
  airConditionerAirflowCoolColorElement: any;
  airConditionerAirflowCurveElement: any;
  airConditionerAirflowDensityElement: any;
  airConditionerAirflowFadeElement: any;
  airConditionerAirflowHeatColorElement: any;
  airConditionerAirflowHeightElement: any;
  airConditionerAirflowIrregularityElement: any;
  airConditionerAirflowLengthElement: any;
  airConditionerAirflowOffsetXElement: any;
  airConditionerAirflowOffsetYElement: any;
  airConditionerAirflowOtherColorElement: any;
  airConditionerAirflowRotationElement: any;
  airConditionerAirflowScaleElement: any;
  airConditionerAirflowSpeedElement: any;
  airConditionerAirflowSpreadElement: any;
  airConditionerAirflowStrengthElement: any;
  airConditionerAirflowThicknessElement: any;
  airConditionerAirflowWidthElement: any;
  airConditionerBadgeColorElement: any;
  airConditionerBadgeOpacityElement: any;
  airConditionerBadgeSizeElement: any;
  airConditionerHeightElement: any;
  airConditionerIconLeftElement: any;
  airConditionerIconOffColorElement: any;
  airConditionerIconOnColorElement: any;
  airConditionerIconTopElement: any;
  airConditionerLeftElement: any;
  airConditionerMainColorElement: any;
  airConditionerMainLeftElement: any;
  airConditionerMainSizeElement: any;
  airConditionerMainSpacingElement: any;
  airConditionerMainTopElement: any;
  airConditionerMainWeightElement: any;
  airConditionerRotationElement: any;
  airConditionerScaleElement: any;
  airConditionerSecondaryColorElement: any;
  airConditionerSecondaryLeftElement: any;
  airConditionerSecondarySizeElement: any;
  airConditionerSecondarySpacingElement: any;
  airConditionerSecondaryTopElement: any;
  airConditionerSecondaryWeightElement: any;
  airConditionerSymbolSizeElement: any;
  airConditionerTopElement: any;
  airConditionerWidthElement: any;
  cameraFrameAngleElement: any;
  cameraFrameColorElement: any;
  cameraFrameOpacityElement: any;
  cameraFrameWidthElement: any;
  cameraHeightElement: any;
  cameraLeftElement: any;
  cameraRadiusElement: any;
  cameraRotationElement: any;
  cameraScaleElement: any;
  cameraTopElement: any;
  cameraWidthElement: any;
  deviceButtonBadgeColorElement: any;
  deviceButtonBadgeOpacityElement: any;
  deviceButtonBadgeSizeElement: any;
  deviceButtonIconOnColorElement: any;
  deviceButtonSymbolSizeElement: any;
  iconButtonCutCornerElement: any;
  iconButtonFrameAngleElement: any;
  iconButtonFrameOffOpacityElement: any;
  iconButtonFrameOnOpacityElement: any;
  iconButtonFrameWidthElement: any;
  iconButtonGlowAngleElement: any;
  iconButtonGlowColorElement: any;
  iconButtonGlowSizeElement: any;
  iconButtonGlowStrengthElement: any;
  iconButtonHeightElement: any;
  iconButtonIconColorElement: any;
  iconButtonIconLeftElement: any;
  iconButtonIconOffOpacityElement: any;
  iconButtonIconOnOpacityElement: any;
  iconButtonIconSizeElement: any;
  iconButtonIconTopElement: any;
  iconButtonLeftElement: any;
  iconButtonMainColorElement: any;
  iconButtonMainLeftElement: any;
  iconButtonMainOffOpacityElement: any;
  iconButtonMainOnOpacityElement: any;
  iconButtonMainSizeElement: any;
  iconButtonMainSpacingElement: any;
  iconButtonMainTopElement: any;
  iconButtonMainWeightElement: any;
  iconButtonOnFillColorElement: any;
  iconButtonOnFillFadeDurationElement: any;
  iconButtonOnFillStrengthElement: any;
  iconButtonRotationElement: any;
  iconButtonScaleElement: any;
  iconButtonSecondaryColorElement: any;
  iconButtonSecondaryLeftElement: any;
  iconButtonSecondaryOffOpacityElement: any;
  iconButtonSecondaryOnOpacityElement: any;
  iconButtonSecondarySizeElement: any;
  iconButtonSecondarySpacingElement: any;
  iconButtonSecondaryTopElement: any;
  iconButtonSecondaryWeightElement: any;
  iconButtonSoftLightAngleElement: any;
  iconButtonSoftLightColorElement: any;
  iconButtonSoftLightSizeElement: any;
  iconButtonSoftLightStrengthElement: any;
  iconButtonTopElement: any;
  iconButtonWidthElement: any;
  lightStatisticsCountActiveColorElement: any;
  lightStatisticsCountColorElement: any;
  lightStatisticsCountGapElement: any;
  lightStatisticsCountSizeElement: any;
  lightStatisticsCountSpacingElement: any;
  lightStatisticsCountWeightElement: any;
  lightStatisticsHeightElement: any;
  lightStatisticsIconActiveColorElement: any;
  lightStatisticsIconColorElement: any;
  lightStatisticsIconGapElement: any;
  lightStatisticsIconSizeElement: any;
  lightStatisticsLeftElement: any;
  lightStatisticsRotationElement: any;
  lightStatisticsScaleElement: any;
  lightStatisticsTitleColorElement: any;
  lightStatisticsTitleSizeElement: any;
  lightStatisticsTitleSpacingElement: any;
  lightStatisticsTitleWeightElement: any;
  lightStatisticsTopElement: any;
  lightStatisticsWidthElement: any;
  presenceHaloOpacityElement: any;
  presenceHaloRotationElement: any;
  presenceHaloScaleXElement: any;
  presenceHaloScaleYElement: any;
  presenceOrbitDurationElement: any;
  presencePersonOpacityElement: any;
  presencePersonRotationElement: any;
  presencePersonScaleElement: any;
  titleButtonFrameColorElement: any;
  titleButtonFrameOffsetXElement: any;
  titleButtonFrameOffsetYElement: any;
  titleButtonFrameSizeElement: any;
  titleButtonFrameSpacingElement: any;
  titleButtonFrameWidthElement: any;
  titleButtonHeightElement: any;
  titleButtonIconColorElement: any;
  titleButtonIconLeftElement: any;
  titleButtonIconSizeElement: any;
  titleButtonIconTopElement: any;
  titleButtonLeftElement: any;
  titleButtonMainColorElement: any;
  titleButtonMainLeftElement: any;
  titleButtonMainSizeElement: any;
  titleButtonMainSpacingElement: any;
  titleButtonMainTopElement: any;
  titleButtonMainWeightElement: any;
  titleButtonMarkerColorElement: any;
  titleButtonMarkerLeftElement: any;
  titleButtonMarkerSizeElement: any;
  titleButtonMarkerTopElement: any;
  titleButtonRotationElement: any;
  titleButtonScaleElement: any;
  titleButtonSecondaryColorElement: any;
  titleButtonSecondaryLeftElement: any;
  titleButtonSecondaryLineGapElement: any;
  titleButtonSecondarySizeElement: any;
  titleButtonSecondarySpacingElement: any;
  titleButtonSecondaryTopElement: any;
  titleButtonSecondaryWeightElement: any;
  titleButtonTopElement: any;
  titleButtonWidthElement: any;
  vacuumMapLeftElement: any;
  vacuumMapOpacityElement: any;
  vacuumMapRotationElement: any;
  vacuumMapScaleElement: any;
  vacuumMapTopElement: any;
}

/**
 * 建表一次（与 `setupEventLogWallInspector` 等同一形态：表单元素引用按 ctx 注入）。
 * 正文逐字保留，只有「残留依赖显式化」这一处人工改动。
 */
export function createEffectPreviewInputTables(
  ctx: EffectPreviewInputElementRefs,
) {
  const {
    airConditionerAirflowAngleElement,
    airConditionerAirflowBlurElement,
    airConditionerAirflowCoolColorElement,
    airConditionerAirflowCurveElement,
    airConditionerAirflowDensityElement,
    airConditionerAirflowFadeElement,
    airConditionerAirflowHeatColorElement,
    airConditionerAirflowHeightElement,
    airConditionerAirflowIrregularityElement,
    airConditionerAirflowLengthElement,
    airConditionerAirflowOffsetXElement,
    airConditionerAirflowOffsetYElement,
    airConditionerAirflowOtherColorElement,
    airConditionerAirflowRotationElement,
    airConditionerAirflowScaleElement,
    airConditionerAirflowSpeedElement,
    airConditionerAirflowSpreadElement,
    airConditionerAirflowStrengthElement,
    airConditionerAirflowThicknessElement,
    airConditionerAirflowWidthElement,
    airConditionerBadgeColorElement,
    airConditionerBadgeOpacityElement,
    airConditionerBadgeSizeElement,
    airConditionerHeightElement,
    airConditionerIconLeftElement,
    airConditionerIconOffColorElement,
    airConditionerIconOnColorElement,
    airConditionerIconTopElement,
    airConditionerLeftElement,
    airConditionerMainColorElement,
    airConditionerMainLeftElement,
    airConditionerMainSizeElement,
    airConditionerMainSpacingElement,
    airConditionerMainTopElement,
    airConditionerMainWeightElement,
    airConditionerRotationElement,
    airConditionerScaleElement,
    airConditionerSecondaryColorElement,
    airConditionerSecondaryLeftElement,
    airConditionerSecondarySizeElement,
    airConditionerSecondarySpacingElement,
    airConditionerSecondaryTopElement,
    airConditionerSecondaryWeightElement,
    airConditionerSymbolSizeElement,
    airConditionerTopElement,
    airConditionerWidthElement,
    cameraFrameAngleElement,
    cameraFrameColorElement,
    cameraFrameOpacityElement,
    cameraFrameWidthElement,
    cameraHeightElement,
    cameraLeftElement,
    cameraRadiusElement,
    cameraRotationElement,
    cameraScaleElement,
    cameraTopElement,
    cameraWidthElement,
    deviceButtonBadgeColorElement,
    deviceButtonBadgeOpacityElement,
    deviceButtonBadgeSizeElement,
    deviceButtonIconOnColorElement,
    deviceButtonSymbolSizeElement,
    iconButtonCutCornerElement,
    iconButtonFrameAngleElement,
    iconButtonFrameOffOpacityElement,
    iconButtonFrameOnOpacityElement,
    iconButtonFrameWidthElement,
    iconButtonGlowAngleElement,
    iconButtonGlowColorElement,
    iconButtonGlowSizeElement,
    iconButtonGlowStrengthElement,
    iconButtonHeightElement,
    iconButtonIconColorElement,
    iconButtonIconLeftElement,
    iconButtonIconOffOpacityElement,
    iconButtonIconOnOpacityElement,
    iconButtonIconSizeElement,
    iconButtonIconTopElement,
    iconButtonLeftElement,
    iconButtonMainColorElement,
    iconButtonMainLeftElement,
    iconButtonMainOffOpacityElement,
    iconButtonMainOnOpacityElement,
    iconButtonMainSizeElement,
    iconButtonMainSpacingElement,
    iconButtonMainTopElement,
    iconButtonMainWeightElement,
    iconButtonOnFillColorElement,
    iconButtonOnFillFadeDurationElement,
    iconButtonOnFillStrengthElement,
    iconButtonRotationElement,
    iconButtonScaleElement,
    iconButtonSecondaryColorElement,
    iconButtonSecondaryLeftElement,
    iconButtonSecondaryOffOpacityElement,
    iconButtonSecondaryOnOpacityElement,
    iconButtonSecondarySizeElement,
    iconButtonSecondarySpacingElement,
    iconButtonSecondaryTopElement,
    iconButtonSecondaryWeightElement,
    iconButtonSoftLightAngleElement,
    iconButtonSoftLightColorElement,
    iconButtonSoftLightSizeElement,
    iconButtonSoftLightStrengthElement,
    iconButtonTopElement,
    iconButtonWidthElement,
    lightStatisticsCountActiveColorElement,
    lightStatisticsCountColorElement,
    lightStatisticsCountGapElement,
    lightStatisticsCountSizeElement,
    lightStatisticsCountSpacingElement,
    lightStatisticsCountWeightElement,
    lightStatisticsHeightElement,
    lightStatisticsIconActiveColorElement,
    lightStatisticsIconColorElement,
    lightStatisticsIconGapElement,
    lightStatisticsIconSizeElement,
    lightStatisticsLeftElement,
    lightStatisticsRotationElement,
    lightStatisticsScaleElement,
    lightStatisticsTitleColorElement,
    lightStatisticsTitleSizeElement,
    lightStatisticsTitleSpacingElement,
    lightStatisticsTitleWeightElement,
    lightStatisticsTopElement,
    lightStatisticsWidthElement,
    presenceHaloOpacityElement,
    presenceHaloRotationElement,
    presenceHaloScaleXElement,
    presenceHaloScaleYElement,
    presenceOrbitDurationElement,
    presencePersonOpacityElement,
    presencePersonRotationElement,
    presencePersonScaleElement,
    titleButtonFrameColorElement,
    titleButtonFrameOffsetXElement,
    titleButtonFrameOffsetYElement,
    titleButtonFrameSizeElement,
    titleButtonFrameSpacingElement,
    titleButtonFrameWidthElement,
    titleButtonHeightElement,
    titleButtonIconColorElement,
    titleButtonIconLeftElement,
    titleButtonIconSizeElement,
    titleButtonIconTopElement,
    titleButtonLeftElement,
    titleButtonMainColorElement,
    titleButtonMainLeftElement,
    titleButtonMainSizeElement,
    titleButtonMainSpacingElement,
    titleButtonMainTopElement,
    titleButtonMainWeightElement,
    titleButtonMarkerColorElement,
    titleButtonMarkerLeftElement,
    titleButtonMarkerSizeElement,
    titleButtonMarkerTopElement,
    titleButtonRotationElement,
    titleButtonScaleElement,
    titleButtonSecondaryColorElement,
    titleButtonSecondaryLeftElement,
    titleButtonSecondaryLineGapElement,
    titleButtonSecondarySizeElement,
    titleButtonSecondarySpacingElement,
    titleButtonSecondaryTopElement,
    titleButtonSecondaryWeightElement,
    titleButtonTopElement,
    titleButtonWidthElement,
    vacuumMapLeftElement,
    vacuumMapOpacityElement,
    vacuumMapRotationElement,
    vacuumMapScaleElement,
    vacuumMapTopElement,
  } = ctx;

  const effectVisibleComponentById = new Map([
      [
        titleButtonMainColorElement,
        {
          property: "mainColor",
        },
      ],
      [
        titleButtonSecondaryColorElement,
        {
          property: "secondaryColor",
        },
      ],
      [
        titleButtonMainSizeElement,
        {
          property: "mainSize",
          min: 8,
          max: 200,
        },
      ],
      [
        titleButtonSecondarySizeElement,
        {
          property: "secondarySize",
          min: 6,
          max: 100,
        },
      ],
      [
        titleButtonMainWeightElement,
        {
          property: "mainWeight",
          min: 0,
          max: 1,
        },
      ],
      [
        titleButtonSecondaryWeightElement,
        {
          property: "secondaryWeight",
          min: 0,
          max: 1,
        },
      ],
      [
        titleButtonMainSpacingElement,
        {
          property: "mainSpacing",
          min: -20,
          max: 100,
        },
      ],
      [
        titleButtonSecondarySpacingElement,
        {
          property: "secondarySpacing",
          min: -20,
          max: 100,
        },
      ],
      [
        titleButtonSecondaryLineGapElement,
        {
          property: "secondaryLineGap",
          min: 0,
          max: 100,
        },
      ],
      [
        titleButtonMainLeftElement,
        {
          property: "mainTextLeft",
          min: -100,
          max: 200,
        },
      ],
      [
        titleButtonMainTopElement,
        {
          property: "mainTextTop",
          min: -100,
          max: 200,
        },
      ],
      [
        titleButtonSecondaryLeftElement,
        {
          property: "secondaryTextLeft",
          min: -100,
          max: 200,
        },
      ],
      [
        titleButtonSecondaryTopElement,
        {
          property: "secondaryTextTop",
          min: -100,
          max: 200,
        },
      ],
      [
        titleButtonIconColorElement,
        {
          property: "iconColor",
        },
      ],
      [
        titleButtonIconSizeElement,
        {
          property: "iconSize",
          min: 1,
          max: 100,
        },
      ],
      [
        titleButtonIconLeftElement,
        {
          property: "iconLeft",
          min: -100,
          max: 200,
        },
      ],
      [
        titleButtonIconTopElement,
        {
          property: "iconTop",
          min: -100,
          max: 200,
        },
      ],
      [
        titleButtonFrameColorElement,
        {
          property: "frameColor",
        },
      ],
      [
        titleButtonFrameWidthElement,
        {
          property: "frameWidth",
          min: 0,
          max: 12,
        },
      ],
      [
        titleButtonFrameSizeElement,
        {
          property: "frameSize",
          min: 10,
          max: 300,
        },
      ],
      [
        titleButtonFrameSpacingElement,
        {
          property: "frameSpacing",
          min: 0,
          max: 300,
        },
      ],
      [
        titleButtonFrameOffsetXElement,
        {
          property: "frameOffsetX",
          min: -100,
          max: 100,
        },
      ],
      [
        titleButtonFrameOffsetYElement,
        {
          property: "frameOffsetY",
          min: -100,
          max: 100,
        },
      ],
      [
        titleButtonMarkerColorElement,
        {
          property: "markerColor",
        },
      ],
      [
        titleButtonMarkerSizeElement,
        {
          property: "markerSize",
          min: 2,
          max: 60,
        },
      ],
      [
        titleButtonMarkerLeftElement,
        {
          property: "markerLeft",
          min: -100,
          max: 200,
        },
      ],
      [
        titleButtonMarkerTopElement,
        {
          property: "markerTop",
          min: -100,
          max: 200,
        },
      ],
    ]),
    effectVisibleComponentByIdById = new Map([
      [titleButtonLeftElement, "left"],
      [titleButtonTopElement, "top"],
      [titleButtonWidthElement, "width"],
      [titleButtonHeightElement, "height"],
      [titleButtonScaleElement, "scale"],
      [titleButtonRotationElement, "rotation"],
    ]),
    previewStateByInputElementById = new Map([
      [
        lightStatisticsIconColorElement,
        {
          property: "iconColor",
        },
      ],
      [
        lightStatisticsIconActiveColorElement,
        {
          property: "iconActiveColor",
        },
      ],
      [
        lightStatisticsIconSizeElement,
        {
          property: "iconSize",
          min: 8,
          max: 100,
        },
      ],
      [
        lightStatisticsTitleColorElement,
        {
          property: "titleColor",
        },
      ],
      [
        lightStatisticsTitleSizeElement,
        {
          property: "titleSize",
          min: 8,
          max: 100,
        },
      ],
      [
        lightStatisticsTitleWeightElement,
        {
          property: "titleWeight",
          min: 0,
          max: 1,
        },
      ],
      [
        lightStatisticsTitleSpacingElement,
        {
          property: "titleSpacing",
          min: -20,
          max: 100,
        },
      ],
      [
        lightStatisticsCountColorElement,
        {
          property: "countColor",
        },
      ],
      [
        lightStatisticsCountActiveColorElement,
        {
          property: "countActiveColor",
        },
      ],
      [
        lightStatisticsCountSizeElement,
        {
          property: "countSize",
          min: 8,
          max: 140,
        },
      ],
      [
        lightStatisticsCountWeightElement,
        {
          property: "countWeight",
          min: 0,
          max: 1,
        },
      ],
      [
        lightStatisticsCountSpacingElement,
        {
          property: "countSpacing",
          min: -20,
          max: 100,
        },
      ],
      [
        lightStatisticsIconGapElement,
        {
          property: "iconGap",
          min: 0,
          max: 40,
        },
      ],
      [
        lightStatisticsCountGapElement,
        {
          property: "countGap",
          min: 0,
          max: 40,
        },
      ],
    ]),
    previewStateByInputElementByKey = new Map([
      [lightStatisticsLeftElement, "left"],
      [lightStatisticsTopElement, "top"],
      [lightStatisticsWidthElement, "width"],
      [lightStatisticsHeightElement, "height"],
      [lightStatisticsScaleElement, "scale"],
      [lightStatisticsRotationElement, "rotation"],
    ]),
    previewStateByInputElement = new Map<any, any>([
      [
        presenceHaloScaleXElement,
        {
          property: "haloScaleX",
          min: 20,
          max: 300,
          divisor: 100,
        },
      ],
      [
        presenceHaloScaleYElement,
        {
          property: "haloScaleY",
          min: 20,
          max: 300,
          divisor: 100,
        },
      ],
      [
        presenceHaloRotationElement,
        {
          property: "haloRotation",
          min: -360,
          max: 360,
        },
      ],
      [
        presenceHaloOpacityElement,
        {
          property: "haloOpacity",
          min: 0,
          max: 100,
          divisor: 100,
        },
      ],
      [
        presencePersonScaleElement,
        {
          property: "personScale",
          min: 20,
          max: 300,
          divisor: 100,
        },
      ],
      [
        presencePersonRotationElement,
        {
          property: "personRotation",
          min: -360,
          max: 360,
        },
      ],
      [
        presencePersonOpacityElement,
        {
          property: "personOpacity",
          min: 0,
          max: 100,
          divisor: 100,
        },
      ],
      [
        presenceOrbitDurationElement,
        {
          property: "orbitDuration",
          min: 2,
          max: 60,
        },
      ],
      [
        iconButtonIconColorElement,
        {
          property: "iconColor",
        },
      ],
      [
        deviceButtonIconOnColorElement,
        {
          property: (syncIconButtonPreviewButtons: any) =>
            syncIconButtonPreviewButtons.type !== "presence-sensor"
              ? "iconOnColor"
              : syncIconButtonPreviewButtons.properties?.sensorKind === "water-leak"
                ? "waterLeakColor"
                : syncIconButtonPreviewButtons.properties?.sensorKind === "smoke"
                  ? "smokeColor"
                  : syncIconButtonPreviewButtons.properties?.sensorKind === "natural-gas"
                    ? "naturalGasColor"
                    : "iconOnColor",
        },
      ],
      [
        deviceButtonBadgeColorElement,
        {
          property: "badgeColor",
        },
      ],
      [
        deviceButtonBadgeOpacityElement,
        {
          property: "badgeOpacity",
          min: 0,
          max: 100,
          divisor: 100,
        },
      ],
      [
        deviceButtonSymbolSizeElement,
        {
          property: "symbolSize",
          min: 1,
          max: 100,
        },
      ],
      [
        deviceButtonBadgeSizeElement,
        {
          property: "badgeSize",
          min: 1,
          max: 100,
        },
      ],
      [
        iconButtonIconSizeElement,
        {
          property: "iconSize",
          min: 1,
          max: 100,
        },
      ],
      [
        iconButtonIconOffOpacityElement,
        {
          property: "iconOffOpacity",
          min: 0,
          max: 100,
          divisor: 100,
        },
      ],
      [
        iconButtonIconOnOpacityElement,
        {
          property: "iconOnOpacity",
          min: 0,
          max: 100,
          divisor: 100,
        },
      ],
      [
        iconButtonIconLeftElement,
        {
          property: "iconLeft",
          min: -100,
          max: 200,
        },
      ],
      [
        iconButtonIconTopElement,
        {
          property: "iconTop",
          min: -100,
          max: 200,
        },
      ],
      [
        iconButtonMainColorElement,
        {
          property: "mainColor",
        },
      ],
      [
        iconButtonSecondaryColorElement,
        {
          property: "secondaryColor",
        },
      ],
      [
        iconButtonMainOffOpacityElement,
        {
          property: "mainOffOpacity",
          min: 0,
          max: 100,
          divisor: 100,
        },
      ],
      [
        iconButtonMainOnOpacityElement,
        {
          property: "mainOnOpacity",
          min: 0,
          max: 100,
          divisor: 100,
        },
      ],
      [
        iconButtonSecondaryOffOpacityElement,
        {
          property: "secondaryOffOpacity",
          min: 0,
          max: 100,
          divisor: 100,
        },
      ],
      [
        iconButtonSecondaryOnOpacityElement,
        {
          property: "secondaryOnOpacity",
          min: 0,
          max: 100,
          divisor: 100,
        },
      ],
      [
        iconButtonMainSizeElement,
        {
          property: "mainSize",
          min: 6,
          max: 120,
        },
      ],
      [
        iconButtonSecondarySizeElement,
        {
          property: "secondarySize",
          min: 5,
          max: 80,
        },
      ],
      [
        iconButtonMainWeightElement,
        {
          property: "mainWeight",
          min: 0,
          max: 1,
        },
      ],
      [
        iconButtonSecondaryWeightElement,
        {
          property: "secondaryWeight",
          min: 0,
          max: 1,
        },
      ],
      [
        iconButtonMainSpacingElement,
        {
          property: "mainSpacing",
          min: -20,
          max: 100,
        },
      ],
      [
        iconButtonSecondarySpacingElement,
        {
          property: "secondarySpacing",
          min: -20,
          max: 100,
        },
      ],
      [
        iconButtonMainLeftElement,
        {
          property: "mainTextLeft",
          min: -100,
          max: 200,
        },
      ],
      [
        iconButtonMainTopElement,
        {
          property: "mainTextTop",
          min: -100,
          max: 200,
        },
      ],
      [
        iconButtonSecondaryLeftElement,
        {
          property: "secondaryTextLeft",
          min: -100,
          max: 200,
        },
      ],
      [
        iconButtonSecondaryTopElement,
        {
          property: "secondaryTextTop",
          min: -100,
          max: 200,
        },
      ],
      [
        iconButtonOnFillColorElement,
        {
          property: "onFillColor",
        },
      ],
      [
        iconButtonOnFillStrengthElement,
        {
          property: "onFillStrength",
          min: 0,
          max: 100,
          divisor: 100,
        },
      ],
      [
        iconButtonOnFillFadeDurationElement,
        {
          property: "onFillFadeDuration",
          min: 0,
          max: 3,
        },
      ],
      [
        iconButtonFrameWidthElement,
        {
          property: "frameWidth",
          min: 0,
          max: 12,
        },
      ],
      [
        iconButtonFrameAngleElement,
        {
          property: "frameAngle",
          min: 0,
          max: 360,
        },
      ],
      [
        iconButtonFrameOffOpacityElement,
        {
          property: "frameOffOpacity",
          min: 0,
          max: 100,
          divisor: 100,
        },
      ],
      [
        iconButtonFrameOnOpacityElement,
        {
          property: "frameOnOpacity",
          min: 0,
          max: 100,
          divisor: 100,
        },
      ],
      [
        iconButtonCutCornerElement,
        {
          property: "cutCorner",
          min: 0,
          max: 50,
        },
      ],
      [
        iconButtonSoftLightColorElement,
        {
          property: "softLightColor",
        },
      ],
      [
        iconButtonSoftLightStrengthElement,
        {
          property: "softLightStrength",
          min: 0,
          max: 500,
          divisor: 100,
        },
      ],
      [
        iconButtonSoftLightSizeElement,
        {
          property: "softLightSize",
          min: 0,
          max: 300,
          divisor: 100,
        },
      ],
      [
        iconButtonSoftLightAngleElement,
        {
          property: "softLightAngle",
          min: 0,
          max: 360,
        },
      ],
      [
        iconButtonGlowColorElement,
        {
          property: "glowColor",
        },
      ],
      [
        iconButtonGlowStrengthElement,
        {
          property: "glowStrength",
          min: 0,
          max: 500,
          divisor: 100,
        },
      ],
      [
        iconButtonGlowSizeElement,
        {
          property: "glowSize",
          min: 0,
          max: 300,
          divisor: 100,
        },
      ],
      [
        iconButtonGlowAngleElement,
        {
          property: "glowAngle",
          min: 0,
          max: 360,
        },
      ],
    ]),
    effectVisibleComponentByIdByKey = new Map([
      [iconButtonLeftElement, "left"],
      [iconButtonTopElement, "top"],
      [iconButtonWidthElement, "width"],
      [iconButtonHeightElement, "height"],
      [iconButtonScaleElement, "scale"],
      [iconButtonRotationElement, "rotation"],
    ]),
    previewStateByInputElementByName = new Map<any, any>([
      [
        airConditionerIconOffColorElement,
        {
          property: "iconOffColor",
        },
      ],
      [
        airConditionerIconOnColorElement,
        {
          property: "iconOnColor",
        },
      ],
      [
        airConditionerBadgeColorElement,
        {
          property: "badgeColor",
        },
      ],
      [
        airConditionerBadgeOpacityElement,
        {
          property: "badgeOpacity",
          min: 0,
          max: 100,
          divisor: 100,
        },
      ],
      [
        airConditionerSymbolSizeElement,
        {
          property: "symbolSize",
          min: 1,
          max: 100,
        },
      ],
      [
        airConditionerBadgeSizeElement,
        {
          property: "badgeSize",
          min: 1,
          max: 100,
        },
      ],
      [
        airConditionerIconLeftElement,
        {
          property: "iconLeft",
          min: -100,
          max: 200,
        },
      ],
      [
        airConditionerIconTopElement,
        {
          property: "iconTop",
          min: -100,
          max: 200,
        },
      ],
      [
        airConditionerMainColorElement,
        {
          property: "mainColor",
        },
      ],
      [
        airConditionerMainSizeElement,
        {
          property: "mainSize",
          min: 6,
          max: 120,
        },
      ],
      [
        airConditionerMainWeightElement,
        {
          property: "mainWeight",
          min: 0,
          max: 1,
        },
      ],
      [
        airConditionerMainSpacingElement,
        {
          property: "mainSpacing",
          min: -20,
          max: 100,
        },
      ],
      [
        airConditionerMainLeftElement,
        {
          property: "mainTextLeft",
          min: -100,
          max: 200,
        },
      ],
      [
        airConditionerMainTopElement,
        {
          property: "mainTextTop",
          min: -100,
          max: 200,
        },
      ],
      [
        airConditionerSecondaryColorElement,
        {
          property: "secondaryColor",
        },
      ],
      [
        airConditionerSecondarySizeElement,
        {
          property: "secondarySize",
          min: 5,
          max: 80,
        },
      ],
      [
        airConditionerSecondaryWeightElement,
        {
          property: "secondaryWeight",
          min: 0,
          max: 1,
        },
      ],
      [
        airConditionerSecondarySpacingElement,
        {
          property: "secondarySpacing",
          min: -20,
          max: 100,
        },
      ],
      [
        airConditionerSecondaryLeftElement,
        {
          property: "secondaryTextLeft",
          min: -100,
          max: 200,
        },
      ],
      [
        airConditionerSecondaryTopElement,
        {
          property: "secondaryTextTop",
          min: -100,
          max: 200,
        },
      ],
      [
        airConditionerAirflowCoolColorElement,
        {
          property: "airflowCoolColor",
        },
      ],
      [
        airConditionerAirflowHeatColorElement,
        {
          property: "airflowHeatColor",
        },
      ],
      [
        airConditionerAirflowOtherColorElement,
        {
          property: "airflowOtherColor",
        },
      ],
      [
        airConditionerAirflowAngleElement,
        {
          property: "airflowAngle",
          min: -360,
          max: 360,
        },
      ],
      [
        airConditionerAirflowCurveElement,
        {
          property: "airflowCurve",
          min: -200,
          max: 200,
        },
      ],
      [
        airConditionerAirflowLengthElement,
        {
          property: "airflowLength",
          min: 10,
          max: 300,
        },
      ],
      [
        airConditionerAirflowFadeElement,
        {
          property: "airflowFadePosition",
          min: 15,
          max: 100,
        },
      ],
      [
        airConditionerAirflowSpreadElement,
        {
          property: "airflowSpread",
          min: 10,
          max: 300,
        },
      ],
      [
        airConditionerAirflowDensityElement,
        {
          property: "airflowDensity",
          min: 20,
          max: 200,
        },
      ],
      [
        airConditionerAirflowIrregularityElement,
        {
          property: "airflowIrregularity",
          min: 0,
          max: 200,
        },
      ],
      [
        airConditionerAirflowThicknessElement,
        {
          property: "airflowThickness",
          min: 5,
          max: 300,
        },
      ],
      [
        airConditionerAirflowStrengthElement,
        {
          property: "airflowStrength",
          min: 0,
          max: 500,
        },
      ],
      [
        airConditionerAirflowBlurElement,
        {
          property: "airflowBlur",
          min: 0,
          max: 30,
        },
      ],
      [
        airConditionerAirflowSpeedElement,
        {
          property: "airflowSpeed",
          min: 0.3,
          max: 12,
        },
      ],
      [
        airConditionerAirflowOffsetXElement,
        {
          property: "airflowOffsetX",
          limits: (previewStateValue: any, previewButtonNode: any) => {
            const isButtonActive = airflowCanvasOffsetBounds2(
              previewStateValue,
              previewButtonNode.canvas,
            );
            return {
              min: isButtonActive.minX,
              max: isButtonActive.maxX,
            };
          },
        },
      ],
      [
        airConditionerAirflowOffsetYElement,
        {
          property: "airflowOffsetY",
          limits: (applyIconButtonPreviewState: any, previewComponentIdForIcon: any) => {
            const previewComponentIdForIconState = airflowCanvasOffsetBounds2(
              applyIconButtonPreviewState,
              previewComponentIdForIcon.canvas,
            );
            return {
              min: previewComponentIdForIconState.minY,
              max: previewComponentIdForIconState.maxY,
            };
          },
        },
      ],
      [
        airConditionerAirflowWidthElement,
        {
          property: "airflowWidth",
          min: 1,
          max: 500,
        },
      ],
      [
        airConditionerAirflowHeightElement,
        {
          property: "airflowHeight",
          min: 1,
          max: 500,
        },
      ],
      [
        airConditionerAirflowScaleElement,
        {
          property: "airflowScale",
          min: 1,
          max: 500,
          divisor: 100,
        },
      ],
      [
        airConditionerAirflowRotationElement,
        {
          property: "airflowRotation",
          min: -360,
          max: 360,
        },
      ],
    ]),
    previewComponentIdForIconById = new Map([
      [airConditionerLeftElement, "left"],
      [airConditionerTopElement, "top"],
      [airConditionerWidthElement, "width"],
      [airConditionerHeightElement, "height"],
      [airConditionerScaleElement, "scale"],
      [airConditionerRotationElement, "rotation"],
    ]),
    previewComponentIdForIconByIdById = new Map([
      [
        cameraFrameColorElement,
        {
          property: "frameColor",
        },
      ],
      [
        cameraFrameWidthElement,
        {
          property: "frameWidth",
          min: 0,
          max: 20,
        },
      ],
      [
        cameraRadiusElement,
        {
          property: "radius",
          min: 0,
          max: 50,
          divisor: 100,
        },
      ],
      [
        cameraFrameAngleElement,
        {
          property: "frameAngle",
          min: 0,
          max: 360,
        },
      ],
      [
        cameraFrameOpacityElement,
        {
          property: "frameOpacity",
          min: 0,
          max: 100,
          divisor: 100,
        },
      ],
    ]),
    previewModeForIconById = new Map([
      [
        vacuumMapOpacityElement,
        {
          property: "opacity",
          min: 0,
          max: 100,
          divisor: 100,
        },
      ],
    ]),
    previewModeForIconByIdById = new Map([
      [vacuumMapLeftElement, "left"],
      [vacuumMapTopElement, "top"],
      [vacuumMapScaleElement, "scale"],
      [vacuumMapRotationElement, "rotation"],
    ]),
    previewModeForIconByIdByKey = new Map([
      [cameraLeftElement, "left"],
      [cameraTopElement, "top"],
      [cameraWidthElement, "width"],
      [cameraHeightElement, "height"],
      [cameraScaleElement, "scale"],
      [cameraRotationElement, "rotation"],
    ]);

  return {
    effectVisibleComponentById,
    effectVisibleComponentByIdById,
    previewStateByInputElementById,
    previewStateByInputElementByKey,
    previewStateByInputElement,
    effectVisibleComponentByIdByKey,
    previewStateByInputElementByName,
    previewComponentIdForIconById,
    previewComponentIdForIconByIdById,
    previewModeForIconById,
    previewModeForIconByIdById,
    previewModeForIconByIdByKey,
  };
}
