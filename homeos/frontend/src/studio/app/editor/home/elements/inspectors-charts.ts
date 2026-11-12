/*
 * 图表族检视面板：折线图 / 事件日志 / 日期 / 时间 / 图片。
 *
 * 由 `./editor-elements` 汇总为 `queryEditorElements`；本文件只负责这一族面板的
 * 元素查询，新增元素请加到对应族而不是汇总文件里。
 */
import type { ElementQuery } from './types'
export function inspectorsChartsElements(findElement: ElementQuery) {
  const imageInspectorElement = findElement('#image-inspector')
  const imageTypeElement = findElement('#image-type')
  const imageLabelElement = findElement('#image-label')
  const imageEntityButtonElement = findElement('#image-entity-button')
  const imageEntityMenuElement = findElement('#image-entity-menu')
  const imageEntitySearchElement = findElement('#image-entity-search')
  const imageEntityOptionsElement = findElement('#image-entity-options')
  const imageAssetButtonElement = findElement('#image-asset-button')
  const imageAssetMenuElement = findElement('#image-asset-menu')
  const imageAssetFolderSelectElement = findElement('#image-asset-folder')
  const imageAssetSearchInputElement = findElement('#image-asset-search')
  const imageAssetOptionsElement = findElement('#image-asset-options')
  const imageAssetUploadButtonElement = findElement('#image-asset-upload')
  const imageAssetUploadInputElement = findElement('#image-asset-upload-input')
  const imageAssetUploadHintElement = findElement('#image-asset-upload-hint')
  const imageAssetLargePreviewImageElement = findElement('#image-asset-large-preview')
  const imageAssetLargePreviewImageElementElement = findElement('#image-asset-large-preview-image')
  const imageAssetLargePreviewNameElement = findElement('#image-asset-large-preview-name')
  const imageOpacityInputElement = findElement('#image-opacity')
  const imageLayoutOptionsElement = findElement('#image-layout-options')
  const imageLeftInputElement = findElement('#image-left')
  const imageTopInputElement = findElement('#image-top')
  const imageScaleInputElement = findElement('#image-scale')
  const imageRotationInputElement = findElement('#image-rotation')
  const timeInspectorElement = findElement('#time-inspector')
  const timeTypeElement = findElement('#time-type')
  const timeLabelElement = findElement('#time-label')
  const timeHourFormatElement = findElement('#time-hour-format')
  const timeSecondsElement = findElement('#time-seconds')
  const timeColorElement = findElement('#time-color')
  const timeFontSizeElement = findElement('#time-font-size')
  const timeFontWeightElement = findElement('#time-font-weight')
  const timeLetterSpacingElement = findElement('#time-letter-spacing')
  const timeOpacityElement = findElement('#time-opacity')
  const timeLeftElement = findElement('#time-left')
  const timeTopElement = findElement('#time-top')
  const timeScaleElement = findElement('#time-scale')
  const timeRotationElement = findElement('#time-rotation')
  const dateInspectorElement = findElement('#date-inspector')
  const dateTypeElement = findElement('#date-type')
  const dateLabelElement = findElement('#date-label')
  const dateWeekdayElement = findElement('#date-weekday')
  const dateLunarElement = findElement('#date-lunar')
  const datePrimaryColorElement = findElement('#date-primary-color')
  const datePrimarySizeElement = findElement('#date-primary-size')
  const datePrimaryWeightElement = findElement('#date-primary-weight')
  const datePrimarySpacingElement = findElement('#date-primary-spacing')
  const dateLunarColorElement = findElement('#date-lunar-color')
  const dateLunarSizeElement = findElement('#date-lunar-size')
  const dateLunarWeightElement = findElement('#date-lunar-weight')
  const dateLunarSpacingElement = findElement('#date-lunar-spacing')
  const dateLineGapElement = findElement('#date-line-gap')
  const dateOpacityElement = findElement('#date-opacity')
  const dateLeftElement = findElement('#date-left')
  const dateTopElement = findElement('#date-top')
  const dateScaleElement = findElement('#date-scale')
  const dateRotationElement = findElement('#date-rotation')
  const lineChartInspectorElement = findElement('#line-chart-inspector')
  const eventLogWallInspectorElement = findElement('#event-log-wall-inspector')
  const eventLogWallTypeElement = findElement('#event-log-wall-type')
  const eventLogWallLabelElement = findElement('#event-log-wall-label')
  const eventLogWallEnabledElement = findElement('#event-log-wall-enabled')
  const eventLogWallTitleElement = findElement('#event-log-wall-title')
  const eventLogWallTitleVisibleElement = findElement('#event-log-wall-title-visible')
  const eventLogWallTitleSizeElement = findElement('#event-log-wall-title-size')
  const eventLogWallTitleColorElement = findElement('#event-log-wall-title-color')
  const eventLogWallTitleAlignElement = findElement('#event-log-wall-title-align')
  const eventLogWallMaxEntriesElement = findElement('#event-log-wall-max-entries')
  const eventLogWallDisplayDurationElement = findElement('#event-log-wall-display-duration')
  const eventLogWallWatchScopeElement = findElement('#event-log-wall-watch-scope')
  const eventLogWallEntityIdsElement = findElement('#event-log-wall-entity-ids')
  const eventLogWallFontSizeElement = findElement('#event-log-wall-font-size')
  const eventLogWallRadiusElement = findElement('#event-log-wall-radius')
  const eventLogWallBgOpacityElement = findElement('#event-log-wall-bg-opacity')
  const eventLogWallBlurElement = findElement('#event-log-wall-blur')
  const eventLogWallClickModeElement = findElement('#event-log-wall-click-mode')
  const eventLogWallShowFooterElement = findElement('#event-log-wall-show-footer')
  const eventLogWallFooterTextElement = findElement('#event-log-wall-footer-text')
  const eventLogWallOnColorElement = findElement('#event-log-wall-on-color')
  const eventLogWallOffColorElement = findElement('#event-log-wall-off-color')
  const eventLogWallAttrColorElement = findElement('#event-log-wall-attr-color')
  const eventLogWallClimateColorElement = findElement('#event-log-wall-climate-color')
  const eventLogWallAlertColorElement = findElement('#event-log-wall-alert-color')
  const eventLogWallMutedColorElement = findElement('#event-log-wall-muted-color')
  const lineChartTypeElement = findElement('#line-chart-type')
  const lineChartLabelElement = findElement('#line-chart-label')
  const lineChartEntityButtonElement = findElement('#line-chart-entity-button')
  const lineChartEntityMenuElement = findElement('#line-chart-entity-menu')
  const lineChartEntitySearchInputElement = findElement('#line-chart-entity-search')
  const lineChartEntityOptionsElement = findElement('#line-chart-entity-options')
  const lineChartValueVisibleElement = findElement('#line-chart-value-visible')
  const lineChartValueScaleInputElement = findElement('#line-chart-value-scale')
  const lineChartValueColorInputElement = findElement('#line-chart-value-color')
  const lineChartStatePrecisionSelectElement = findElement('#line-chart-state-precision')
  const lineChartValueOffsetXInputElement = findElement('#line-chart-value-offset-x')
  const lineChartValueOffsetYInputElement = findElement('#line-chart-value-offset-y')
  const lineChartUpdateIntervalInputElement = findElement('#line-chart-update-interval')
  const lineChartHoursInputElement = findElement('#line-chart-hours')
  const lineChartCurveRadiusInputElement = findElement('#line-chart-curve-radius')
  const lineChartThresholdModeSelectElement = findElement('#line-chart-threshold-mode')
  const lineChartThresholdInputs = [1, 2, 3, 4].map((thresholdIndex) => ({
    value: findElement('#line-chart-threshold-' + thresholdIndex + '-value'),
    color: findElement('#line-chart-threshold-' + thresholdIndex + '-color'),
  }))
  const lineChartLeftInputElement = findElement('#line-chart-left')
  const lineChartTopInputElement = findElement('#line-chart-top')
  const lineChartWidthInputElement = findElement('#line-chart-width')
  const lineChartHeightInputElement = findElement('#line-chart-height')
  const lineChartScaleInputElement = findElement('#line-chart-scale')
  const lineChartRotationInputElement = findElement('#line-chart-rotation')
  const lineChartActionControlsElement = findElement('#line-chart-action-controls')
  const lineChartApplyStyleButtonElement = findElement('#line-chart-apply-style')
  const lineChartApplyCountElement = findElement('#line-chart-apply-count')
  return {
    imageInspectorElement,
    imageTypeElement,
    imageLabelElement,
    imageEntityButtonElement,
    imageEntityMenuElement,
    imageEntitySearchElement,
    imageEntityOptionsElement,
    imageAssetButtonElement,
    imageAssetMenuElement,
    imageAssetFolderSelectElement,
    imageAssetSearchInputElement,
    imageAssetOptionsElement,
    imageAssetUploadButtonElement,
    imageAssetUploadInputElement,
    imageAssetUploadHintElement,
    imageAssetLargePreviewImageElement,
    imageAssetLargePreviewImageElementElement,
    imageAssetLargePreviewNameElement,
    imageOpacityInputElement,
    imageLayoutOptionsElement,
    imageLeftInputElement,
    imageTopInputElement,
    imageScaleInputElement,
    imageRotationInputElement,
    timeInspectorElement,
    timeTypeElement,
    timeLabelElement,
    timeHourFormatElement,
    timeSecondsElement,
    timeColorElement,
    timeFontSizeElement,
    timeFontWeightElement,
    timeLetterSpacingElement,
    timeOpacityElement,
    timeLeftElement,
    timeTopElement,
    timeScaleElement,
    timeRotationElement,
    dateInspectorElement,
    dateTypeElement,
    dateLabelElement,
    dateWeekdayElement,
    dateLunarElement,
    datePrimaryColorElement,
    datePrimarySizeElement,
    datePrimaryWeightElement,
    datePrimarySpacingElement,
    dateLunarColorElement,
    dateLunarSizeElement,
    dateLunarWeightElement,
    dateLunarSpacingElement,
    dateLineGapElement,
    dateOpacityElement,
    dateLeftElement,
    dateTopElement,
    dateScaleElement,
    dateRotationElement,
    lineChartInspectorElement,
    eventLogWallInspectorElement,
    eventLogWallTypeElement,
    eventLogWallLabelElement,
    eventLogWallEnabledElement,
    eventLogWallTitleElement,
    eventLogWallTitleVisibleElement,
    eventLogWallTitleSizeElement,
    eventLogWallTitleColorElement,
    eventLogWallTitleAlignElement,
    eventLogWallMaxEntriesElement,
    eventLogWallDisplayDurationElement,
    eventLogWallWatchScopeElement,
    eventLogWallEntityIdsElement,
    eventLogWallFontSizeElement,
    eventLogWallRadiusElement,
    eventLogWallBgOpacityElement,
    eventLogWallBlurElement,
    eventLogWallClickModeElement,
    eventLogWallShowFooterElement,
    eventLogWallFooterTextElement,
    eventLogWallOnColorElement,
    eventLogWallOffColorElement,
    eventLogWallAttrColorElement,
    eventLogWallClimateColorElement,
    eventLogWallAlertColorElement,
    eventLogWallMutedColorElement,
    lineChartTypeElement,
    lineChartLabelElement,
    lineChartEntityButtonElement,
    lineChartEntityMenuElement,
    lineChartEntitySearchInputElement,
    lineChartEntityOptionsElement,
    lineChartValueVisibleElement,
    lineChartValueScaleInputElement,
    lineChartValueColorInputElement,
    lineChartStatePrecisionSelectElement,
    lineChartValueOffsetXInputElement,
    lineChartValueOffsetYInputElement,
    lineChartUpdateIntervalInputElement,
    lineChartHoursInputElement,
    lineChartCurveRadiusInputElement,
    lineChartThresholdModeSelectElement,
    lineChartThresholdInputs,
    lineChartLeftInputElement,
    lineChartTopInputElement,
    lineChartWidthInputElement,
    lineChartHeightInputElement,
    lineChartScaleInputElement,
    lineChartRotationInputElement,
    lineChartActionControlsElement,
    lineChartApplyStyleButtonElement,
    lineChartApplyCountElement,
  }
}
