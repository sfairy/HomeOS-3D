/*
 * 环境族检视面板：空调 / 天气 / 存在 / 窗帘 / 门。
 *
 * 由 `./editor-elements` 汇总为 `queryEditorElements`；本文件只负责这一族面板的
 * 元素查询，新增元素请加到对应族而不是汇总文件里。
 */
import type { ElementQuery } from './types'
export function inspectorsClimateElements(findElement: ElementQuery) {
  const presenceSensorKindLabelElement = findElement('#presence-sensor-kind-label')
  const presenceSensorKindElement = findElement('#presence-sensor-kind')
  const coverSettingsInspectorElement = findElement('#cover-settings-inspector')
  const coverSettingsKindElement = findElement('#cover-settings-kind')
  const coverSettingsDirectionElement = findElement('#cover-settings-direction')
  const coverSettingsMotorDirectionElement = findElement('#cover-settings-motor-direction')
  const presenceMotionSectionElement = findElement('#presence-motion-section')
  const doorWindowPerspectiveSectionElement = findElement('#door-window-perspective-section')
  const doorWindowPerspectiveEditElement = findElement('#door-window-perspective-edit')
  const doorWindowPerspectiveResetElement = findElement('#door-window-perspective-reset')
  const doorWindowPerspectiveSaveElement = findElement('#door-window-perspective-save')
  const presenceHaloVisibleElement = findElement('#presence-halo-visible')
  const presenceHaloScaleXElement = findElement('#presence-halo-scale-x')
  const presenceHaloScaleYElement = findElement('#presence-halo-scale-y')
  const presenceHaloRotationElement = findElement('#presence-halo-rotation')
  const presenceHaloOpacityElement = findElement('#presence-halo-opacity')
  const presencePersonVisibleElement = findElement('#presence-person-visible')
  const presencePersonScaleElement = findElement('#presence-person-scale')
  const presencePersonRotationElement = findElement('#presence-person-rotation')
  const presencePersonOpacityElement = findElement('#presence-person-opacity')
  const presenceOrbitDurationElement = findElement('#presence-orbit-duration')
  const airConditionerInspectorElement = findElement('#air-conditioner-inspector')
  const airConditionerLabelElement = findElement('#air-conditioner-label')
  const airConditionerDeviceTypeElement = findElement('#air-conditioner-device-type')
  const airConditionerEntityButtonElement = findElement('#air-conditioner-entity-button')
  const airConditionerEntityMenuElement = findElement('#air-conditioner-entity-menu')
  const airConditionerEntitySearchElement = findElement('#air-conditioner-entity-search')
  const airConditionerEntityOptionsElement = findElement('#air-conditioner-entity-options')
  const airConditionerPreviewStateElement = findElement('#air-conditioner-preview-state')
  const airConditionerLayerOptionsElement = findElement('#air-conditioner-layer-options')
  const airConditionerButtonSectionElement = findElement('#air-conditioner-button-section')
  const airConditionerAirflowSectionElement = findElement('#air-conditioner-airflow-section')
  const airConditionerTransformSectionElement = findElement('#air-conditioner-transform-section')
  const airConditionerActionSectionElement = findElement('#air-conditioner-action-section')
  const airConditionerIconVisibleElement = findElement('#air-conditioner-icon-visible')
  const airConditionerIconOffColorElement = findElement('#air-conditioner-icon-off-color')
  const airConditionerIconOnColorElement = findElement('#air-conditioner-icon-on-color')
  const airConditionerBadgeColorElement = findElement('#air-conditioner-badge-color')
  const airConditionerBadgeOpacityElement = findElement('#air-conditioner-badge-opacity')
  const airConditionerSymbolSizeElement = findElement('#air-conditioner-symbol-size')
  const airConditionerBadgeSizeElement = findElement('#air-conditioner-badge-size')
  const airConditionerIconLeftElement = findElement('#air-conditioner-icon-left')
  const airConditionerIconTopElement = findElement('#air-conditioner-icon-top')
  const airConditionerMainVisibleElement = findElement('#air-conditioner-main-visible')
  const airConditionerMainTextElement = findElement('#air-conditioner-main-text')
  const airConditionerMainColorElement = findElement('#air-conditioner-main-color')
  const airConditionerMainSizeElement = findElement('#air-conditioner-main-size')
  const airConditionerMainWeightElement = findElement('#air-conditioner-main-weight')
  const airConditionerMainSpacingElement = findElement('#air-conditioner-main-spacing')
  const airConditionerMainLeftElement = findElement('#air-conditioner-main-left')
  const airConditionerMainTopElement = findElement('#air-conditioner-main-top')
  const airConditionerSecondaryVisibleElement = findElement('#air-conditioner-secondary-visible')
  const airConditionerSecondaryTextElement = findElement('#air-conditioner-secondary-text')
  const airConditionerSecondaryColorElement = findElement('#air-conditioner-secondary-color')
  const airConditionerSecondarySizeElement = findElement('#air-conditioner-secondary-size')
  const airConditionerSecondaryWeightElement = findElement('#air-conditioner-secondary-weight')
  const airConditionerSecondarySpacingElement = findElement('#air-conditioner-secondary-spacing')
  const airConditionerSecondaryLeftElement = findElement('#air-conditioner-secondary-left')
  const airConditionerSecondaryTopElement = findElement('#air-conditioner-secondary-top')
  const airConditionerAirflowVisibleElement = findElement('#air-conditioner-airflow-visible')
  const airConditionerAirflowMotionElement = findElement('#air-conditioner-airflow-motion')
  const airConditionerAirflowCoolColorElement = findElement('#air-conditioner-airflow-cool-color')
  const airConditionerAirflowHeatColorElement = findElement('#air-conditioner-airflow-heat-color')
  const airConditionerAirflowOtherColorElement = findElement('#air-conditioner-airflow-other-color')
  const airConditionerAirflowAngleElement = findElement('#air-conditioner-airflow-angle')
  const airConditionerAirflowCurveElement = findElement('#air-conditioner-airflow-curve')
  const airConditionerAirflowLengthElement = findElement('#air-conditioner-airflow-length')
  const airConditionerAirflowFadeElement = findElement('#air-conditioner-airflow-fade')
  const airConditionerAirflowSpreadElement = findElement('#air-conditioner-airflow-spread')
  const airConditionerAirflowDensityElement = findElement('#air-conditioner-airflow-density')
  const airConditionerAirflowIrregularityElement = findElement('#air-conditioner-airflow-irregularity')
  const airConditionerAirflowThicknessElement = findElement('#air-conditioner-airflow-thickness')
  const airConditionerAirflowStrengthElement = findElement('#air-conditioner-airflow-strength')
  const airConditionerAirflowBlurElement = findElement('#air-conditioner-airflow-blur')
  const airConditionerAirflowSpeedElement = findElement('#air-conditioner-airflow-speed')
  const airConditionerAirflowOffsetXElement = findElement('#air-conditioner-airflow-offset-x')
  const airConditionerAirflowOffsetYElement = findElement('#air-conditioner-airflow-offset-y')
  const airConditionerAirflowWidthElement = findElement('#air-conditioner-airflow-width')
  const airConditionerAirflowHeightElement = findElement('#air-conditioner-airflow-height')
  const airConditionerAirflowScaleElement = findElement('#air-conditioner-airflow-scale')
  const airConditionerAirflowRotationElement = findElement('#air-conditioner-airflow-rotation')
  const airConditionerLeftElement = findElement('#air-conditioner-left')
  const airConditionerTopElement = findElement('#air-conditioner-top')
  const airConditionerWidthElement = findElement('#air-conditioner-width')
  const airConditionerHeightElement = findElement('#air-conditioner-height')
  const airConditionerScaleElement = findElement('#air-conditioner-scale')
  const airConditionerRotationElement = findElement('#air-conditioner-rotation')
  const airConditionerActionControlsElement = findElement('#air-conditioner-action-controls')
  const airConditionerPreviewDetailsElement = findElement('#air-conditioner-preview-details')
  const airConditionerApplyStyleElement = findElement('#air-conditioner-apply-style')
  const airConditionerApplyCountElement = findElement('#air-conditioner-apply-count')
  const weatherInspectorElement = findElement('#weather-inspector')
  const weatherTypeElement = findElement('#weather-type')
  const weatherLabelElement = findElement('#weather-label')
  const weatherEntityButtonElement = findElement('#weather-entity-button')
  const weatherEntityMenuElement = findElement('#weather-entity-menu')
  const weatherEntitySearchElement = findElement('#weather-entity-search')
  const weatherEntityOptionsElement = findElement('#weather-entity-options')
  const weatherIconVisibleElement = findElement('#weather-icon-visible')
  const weatherTemperatureVisibleElement = findElement('#weather-temperature-visible')
  const weatherConditionVisibleElement = findElement('#weather-condition-visible')
  const weatherHumidityVisibleElement = findElement('#weather-humidity-visible')
  const weatherForecastEnabledElement = findElement('#weather-forecast-enabled')
  const weatherIconSizeElement = findElement('#weather-icon-size')
  const weatherIconGapElement = findElement('#weather-icon-gap')
  const weatherTemperatureColorElement = findElement('#weather-temperature-color')
  const weatherTemperatureSizeElement = findElement('#weather-temperature-size')
  const weatherTemperatureWeightElement = findElement('#weather-temperature-weight')
  const weatherTemperatureSpacingElement = findElement('#weather-temperature-spacing')
  const weatherSecondaryColorElement = findElement('#weather-secondary-color')
  const weatherSecondarySizeElement = findElement('#weather-secondary-size')
  const weatherSecondaryWeightElement = findElement('#weather-secondary-weight')
  const weatherSecondarySpacingElement = findElement('#weather-secondary-spacing')
  const weatherLineGapElement = findElement('#weather-line-gap')
  const weatherOpacityElement = findElement('#weather-opacity')
  const weatherLeftElement = findElement('#weather-left')
  const weatherTopElement = findElement('#weather-top')
  const weatherScaleElement = findElement('#weather-scale')
  const weatherRotationElement = findElement('#weather-rotation')
  return {
    presenceSensorKindLabelElement,
    presenceSensorKindElement,
    coverSettingsInspectorElement,
    coverSettingsKindElement,
    coverSettingsDirectionElement,
    coverSettingsMotorDirectionElement,
    presenceMotionSectionElement,
    doorWindowPerspectiveSectionElement,
    doorWindowPerspectiveEditElement,
    doorWindowPerspectiveResetElement,
    doorWindowPerspectiveSaveElement,
    presenceHaloVisibleElement,
    presenceHaloScaleXElement,
    presenceHaloScaleYElement,
    presenceHaloRotationElement,
    presenceHaloOpacityElement,
    presencePersonVisibleElement,
    presencePersonScaleElement,
    presencePersonRotationElement,
    presencePersonOpacityElement,
    presenceOrbitDurationElement,
    airConditionerInspectorElement,
    airConditionerLabelElement,
    airConditionerDeviceTypeElement,
    airConditionerEntityButtonElement,
    airConditionerEntityMenuElement,
    airConditionerEntitySearchElement,
    airConditionerEntityOptionsElement,
    airConditionerPreviewStateElement,
    airConditionerLayerOptionsElement,
    airConditionerButtonSectionElement,
    airConditionerAirflowSectionElement,
    airConditionerTransformSectionElement,
    airConditionerActionSectionElement,
    airConditionerIconVisibleElement,
    airConditionerIconOffColorElement,
    airConditionerIconOnColorElement,
    airConditionerBadgeColorElement,
    airConditionerBadgeOpacityElement,
    airConditionerSymbolSizeElement,
    airConditionerBadgeSizeElement,
    airConditionerIconLeftElement,
    airConditionerIconTopElement,
    airConditionerMainVisibleElement,
    airConditionerMainTextElement,
    airConditionerMainColorElement,
    airConditionerMainSizeElement,
    airConditionerMainWeightElement,
    airConditionerMainSpacingElement,
    airConditionerMainLeftElement,
    airConditionerMainTopElement,
    airConditionerSecondaryVisibleElement,
    airConditionerSecondaryTextElement,
    airConditionerSecondaryColorElement,
    airConditionerSecondarySizeElement,
    airConditionerSecondaryWeightElement,
    airConditionerSecondarySpacingElement,
    airConditionerSecondaryLeftElement,
    airConditionerSecondaryTopElement,
    airConditionerAirflowVisibleElement,
    airConditionerAirflowMotionElement,
    airConditionerAirflowCoolColorElement,
    airConditionerAirflowHeatColorElement,
    airConditionerAirflowOtherColorElement,
    airConditionerAirflowAngleElement,
    airConditionerAirflowCurveElement,
    airConditionerAirflowLengthElement,
    airConditionerAirflowFadeElement,
    airConditionerAirflowSpreadElement,
    airConditionerAirflowDensityElement,
    airConditionerAirflowIrregularityElement,
    airConditionerAirflowThicknessElement,
    airConditionerAirflowStrengthElement,
    airConditionerAirflowBlurElement,
    airConditionerAirflowSpeedElement,
    airConditionerAirflowOffsetXElement,
    airConditionerAirflowOffsetYElement,
    airConditionerAirflowWidthElement,
    airConditionerAirflowHeightElement,
    airConditionerAirflowScaleElement,
    airConditionerAirflowRotationElement,
    airConditionerLeftElement,
    airConditionerTopElement,
    airConditionerWidthElement,
    airConditionerHeightElement,
    airConditionerScaleElement,
    airConditionerRotationElement,
    airConditionerActionControlsElement,
    airConditionerPreviewDetailsElement,
    airConditionerApplyStyleElement,
    airConditionerApplyCountElement,
    weatherInspectorElement,
    weatherTypeElement,
    weatherLabelElement,
    weatherEntityButtonElement,
    weatherEntityMenuElement,
    weatherEntitySearchElement,
    weatherEntityOptionsElement,
    weatherIconVisibleElement,
    weatherTemperatureVisibleElement,
    weatherConditionVisibleElement,
    weatherHumidityVisibleElement,
    weatherForecastEnabledElement,
    weatherIconSizeElement,
    weatherIconGapElement,
    weatherTemperatureColorElement,
    weatherTemperatureSizeElement,
    weatherTemperatureWeightElement,
    weatherTemperatureSpacingElement,
    weatherSecondaryColorElement,
    weatherSecondarySizeElement,
    weatherSecondaryWeightElement,
    weatherSecondarySpacingElement,
    weatherLineGapElement,
    weatherOpacityElement,
    weatherLeftElement,
    weatherTopElement,
    weatherScaleElement,
    weatherRotationElement,
  }
}
