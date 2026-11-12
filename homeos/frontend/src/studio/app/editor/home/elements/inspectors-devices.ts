/*
 * 设备族检视面板：灯光统计 / 扫地机 / 设备 / 相机 / 户型图 / 效果 / 恢复。
 *
 * 由 `./editor-elements` 汇总为 `queryEditorElements`；本文件只负责这一族面板的
 * 元素查询，新增元素请加到对应族而不是汇总文件里。
 */
import type { ElementQuery } from './types'
export function inspectorsDevicesElements(findElement: ElementQuery) {
  const recoveryDialogElement = findElement('#recovery-dialog')
  const recoveryMessageTitleElement = findElement('#recovery-message-title')
  const recoveryMessageDetailElement = findElement('#recovery-message-detail')
  const recoveryDownloadElement = findElement('#recovery-download')
  const recoveryDiscardElement = findElement('#recovery-discard')
  const recoveryRestoreElement = findElement('#recovery-restore')
  const floorplanAutoDiagramInspectorFormElement = findElement('#floorplan-auto-diagram-inspector')
  const floorplanAutoDiagramStatusElement = findElement('#floorplan-auto-diagram-status')
  const floorplanAutoDiagramOpenStudioButtonElement = findElement('#floorplan-auto-diagram-open-studio')
  const floorplanAutoDiagramViewToggleButtonElement = findElement('#floorplan-auto-diagram-view-toggle')
  const floorplanAutoDiagramLabelTextInputElement = findElement('#floorplan-auto-diagram-label')
  const floorplanAutoDiagramFolderTextInputElement = findElement('#floorplan-auto-diagram-folder')
  const floorplanAutoDiagramLayoutElement = findElement('#floorplan-auto-diagram-layout')
  const floorplanAutoDiagramLeftInputElement = findElement('#floorplan-auto-diagram-left')
  const floorplanAutoDiagramTopInputElement = findElement('#floorplan-auto-diagram-top')
  const floorplanAutoDiagramWidthInputElement = findElement('#floorplan-auto-diagram-width')
  const floorplanAutoDiagramHeightInputElement = findElement('#floorplan-auto-diagram-height')
  const floorplanAutoDiagramScaleInputElement = findElement('#floorplan-auto-diagram-scale')
  const floorplanAutoDiagramRotationInputElement = findElement('#floorplan-auto-diagram-rotation')
  const floorplanAutoDiagramFloorSelectElement = findElement('#floorplan-auto-diagram-floor')
  const floorplanAutoDiagramCameraViewElement = findElement('#floorplan-auto-diagram-camera-view')
  const floorplanAutoDiagramCameraModeElement = findElement('#floorplan-auto-diagram-camera-mode')
  const floorplanAutoDiagramFocalLengthInputElement = findElement('#floorplan-auto-diagram-focal-length')
  const floorplanAutoDiagramRotateTopButtonElement = findElement('#floorplan-auto-diagram-rotate-top')
  const floorplanAutoDiagramOpenBaseLightingButtonElement = findElement('#floorplan-auto-diagram-open-base-lighting')
  const floorplanAutoDiagramBindingsElement = findElement('#floorplan-auto-diagram-bindings')
  const floorplanAutoDiagramBindingListElement = findElement('#floorplan-auto-diagram-binding-list')
  const floorplanAutoLightingPanelElement = findElement('#floorplan-auto-lighting-panel')
  const floorplanAutoLightingHandleElement = findElement('#floorplan-auto-lighting-handle')
  const floorplanAutoLightingCloseButtonElement = findElement('#floorplan-auto-lighting-close')
  const floorplanAutoLightingResetButtonElement = findElement('#floorplan-auto-lighting-reset')
  const floorplanAutoLightingSaveButtonElement = findElement('#floorplan-auto-lighting-save')
  const floorplanAutoLightingStatusElement = findElement('#floorplan-auto-lighting-status')
  const floorplanBaseLightElements = [...document.querySelectorAll<HTMLInputElement>('[data-floorplan-base-light]')]
  const floorplanAutoDiagramDialogElement = findElement('#floorplan-auto-diagram-dialog')
  const floorplanAutoDiagramCloseButtonElement = findElement('#floorplan-auto-diagram-close')
  const floorplanAutoDiagramGuideElement = findElement('#floorplan-auto-diagram-guide')
  const floorplanAutoDiagramLaterButtonElement = findElement('#floorplan-auto-diagram-later')
  const floorplanAutoDiagramContinueElement = findElement('#floorplan-auto-diagram-continue')
  const effectImageAlignDialogElement = findElement('#effect-image-align-dialog')
  const effectImageAlignCloseElement = findElement('#effect-image-align-close')
  const effectImageAlignCancelElement = findElement('#effect-image-align-cancel')
  const effectImageAlignConfirmElement = findElement('#effect-image-align-confirm')
  const effectImageAlignOptionsElement = findElement('#effect-image-align-options')
  const effectImageAlignMessageElement = findElement('#effect-image-align-message')
  const lightStatisticsInspectorElement = findElement('#light-statistics-inspector')
  const lightStatisticsLabelElement = findElement('#light-statistics-label')
  const lightStatisticsTitleElement = findElement('#light-statistics-title')
  const lightStatisticsEntityButtonElement = findElement('#light-statistics-entity-button')
  const lightStatisticsEntityMenuElement = findElement('#light-statistics-entity-menu')
  const lightStatisticsEntitySearchElement = findElement('#light-statistics-entity-search')
  const lightStatisticsEntityOptionsElement = findElement('#light-statistics-entity-options')
  const lightStatisticsEntityPendingElement = findElement('#light-statistics-entity-pending')
  const lightStatisticsEntityConfirmElement = findElement('#light-statistics-entity-confirm')
  const lightStatisticsEntityMessageElement = findElement('#light-statistics-entity-message')
  const lightStatisticsEntityListElement = findElement('#light-statistics-entity-list')
  const lightStatisticsEntityCountElement = findElement('#light-statistics-entity-count')
  const lightStatisticsActionEntityButtonElement = findElement('#light-statistics-action-entity-button')
  const lightStatisticsActionEntityMenuElement = findElement('#light-statistics-action-entity-menu')
  const lightStatisticsActionEntitySearchElement = findElement('#light-statistics-action-entity-search')
  const lightStatisticsActionEntityOptionsElement = findElement('#light-statistics-action-entity-options')
  const lightStatisticsActionNoteElement = findElement('#light-statistics-action-note')
  const lightStatisticsActionControlsElement = findElement('#light-statistics-action-controls')
  const lightStatisticsIconButtonElement = findElement('#light-statistics-icon-button')
  const lightStatisticsIconCopyElement = findElement('#light-statistics-icon-copy')
  const lightStatisticsIconMenuElement = findElement('#light-statistics-icon-menu')
  const lightStatisticsIconSearchElement = findElement('#light-statistics-icon-search')
  const lightStatisticsIconOptionsElement = findElement('#light-statistics-icon-options')
  const lightStatisticsIconVisibleElement = findElement('#light-statistics-icon-visible')
  const lightStatisticsIconColorElement = findElement('#light-statistics-icon-color')
  const lightStatisticsIconActiveColorElement = findElement('#light-statistics-icon-active-color')
  const lightStatisticsIconSizeElement = findElement('#light-statistics-icon-size')
  const lightStatisticsTitleVisibleElement = findElement('#light-statistics-title-visible')
  const lightStatisticsTitleColorElement = findElement('#light-statistics-title-color')
  const lightStatisticsTitleSizeElement = findElement('#light-statistics-title-size')
  const lightStatisticsTitleWeightElement = findElement('#light-statistics-title-weight')
  const lightStatisticsTitleSpacingElement = findElement('#light-statistics-title-spacing')
  const lightStatisticsCountVisibleElement = findElement('#light-statistics-count-visible')
  const lightStatisticsCountColorElement = findElement('#light-statistics-count-color')
  const lightStatisticsCountActiveColorElement = findElement('#light-statistics-count-active-color')
  const lightStatisticsCountSizeElement = findElement('#light-statistics-count-size')
  const lightStatisticsCountWeightElement = findElement('#light-statistics-count-weight')
  const lightStatisticsCountSpacingElement = findElement('#light-statistics-count-spacing')
  const lightStatisticsIconGapElement = findElement('#light-statistics-icon-gap')
  const lightStatisticsCountGapElement = findElement('#light-statistics-count-gap')
  const lightStatisticsLeftElement = findElement('#light-statistics-left')
  const lightStatisticsTopElement = findElement('#light-statistics-top')
  const lightStatisticsWidthElement = findElement('#light-statistics-width')
  const lightStatisticsHeightElement = findElement('#light-statistics-height')
  const lightStatisticsScaleElement = findElement('#light-statistics-scale')
  const lightStatisticsRotationElement = findElement('#light-statistics-rotation')
  const deviceButtonIconVisibleElement = findElement('#device-button-icon-visible')
  const deviceButtonIconOnColorElement = findElement('#device-button-icon-on-color')
  const deviceButtonIconOnColorLabelElement = findElement('#device-button-icon-on-color-label')
  const deviceButtonBadgeColorElement = findElement('#device-button-badge-color')
  const deviceButtonBadgeColorLabelElement = findElement('#device-button-badge-color-label')
  const deviceButtonBadgeOpacityElement = findElement('#device-button-badge-opacity')
  const deviceButtonBadgeOpacityLabelElement = findElement('#device-button-badge-opacity-label')
  const deviceButtonSymbolSizeElement = findElement('#device-button-symbol-size')
  const deviceButtonSymbolSizeLabelElement = findElement('#device-button-symbol-size-label')
  const deviceButtonBadgeSizeElement = findElement('#device-button-badge-size')
  const deviceButtonBadgeSizeLabelElement = findElement('#device-button-badge-size-label')
  const deviceButtonStatePrecisionElement = findElement('#device-button-state-precision')
  const deviceButtonStatePrecisionLabelElement = findElement('#device-button-state-precision-label')
  const deviceButtonMainVisibleElement = findElement('#device-button-main-visible')
  const deviceButtonSecondaryVisibleElement = findElement('#device-button-secondary-visible')
  const vacuumMapInspectorElement = findElement('#vacuum-map-inspector')
  const vacuumMapLabelElement = findElement('#vacuum-map-label')
  const vacuumMapEntityButtonElement = findElement('#vacuum-map-entity-button')
  const vacuumMapEntityMenuElement = findElement('#vacuum-map-entity-menu')
  const vacuumMapEntitySearchElement = findElement('#vacuum-map-entity-search')
  const vacuumMapEntityOptionsElement = findElement('#vacuum-map-entity-options')
  const vacuumMapOpacityElement = findElement('#vacuum-map-opacity')
  const vacuumMapLeftElement = findElement('#vacuum-map-left')
  const vacuumMapTopElement = findElement('#vacuum-map-top')
  const vacuumMapScaleElement = findElement('#vacuum-map-scale')
  const vacuumMapRotationElement = findElement('#vacuum-map-rotation')
  const cameraInspectorElement = findElement('#camera-inspector')
  const cameraLabelElement = findElement('#camera-label')
  const cameraSourceOptionsElement = findElement('#camera-source-options')
  const cameraEntityPickerElement = findElement('#camera-entity-picker')
  const cameraGo2rtcUrlFieldElement = findElement('#camera-go2rtc-url-field')
  const cameraGo2rtcUrlElement = findElement('#camera-go2rtc-url')
  const cameraGo2rtcNoteElement = findElement('#camera-go2rtc-note')
  const cameraEntityButtonElement = findElement('#camera-entity-button')
  const cameraEntityMenuElement = findElement('#camera-entity-menu')
  const cameraEntitySearchElement = findElement('#camera-entity-search')
  const cameraEntityOptionsElement = findElement('#camera-entity-options')
  const cameraFitOptionsElement = findElement('#camera-fit-options')
  const cameraDisplayModeOptionsElement = findElement('#camera-display-mode-options')
  const cameraRefreshIntervalFieldElement = findElement('#camera-refresh-interval-field')
  const cameraRefreshIntervalElement = findElement('#camera-refresh-interval')
  const cameraMediaVisibleElement = findElement('#camera-media-visible')
  const cameraFrameVisibleElement = findElement('#camera-frame-visible')
  const cameraFrameColorElement = findElement('#camera-frame-color')
  const cameraFrameWidthElement = findElement('#camera-frame-width')
  const cameraRadiusElement = findElement('#camera-radius')
  const cameraFrameAngleElement = findElement('#camera-frame-angle')
  const cameraFrameOpacityElement = findElement('#camera-frame-opacity')
  const cameraLeftElement = findElement('#camera-left')
  const cameraTopElement = findElement('#camera-top')
  const cameraWidthElement = findElement('#camera-width')
  const cameraHeightElement = findElement('#camera-height')
  const cameraScaleElement = findElement('#camera-scale')
  const cameraRotationElement = findElement('#camera-rotation')
  const cameraActionControlsElement = findElement('#camera-action-controls')
  const cameraApplyStyleElement = findElement('#camera-apply-style')
  const cameraApplyCountElement = findElement('#camera-apply-count')
  return {
    recoveryDialogElement,
    recoveryMessageTitleElement,
    recoveryMessageDetailElement,
    recoveryDownloadElement,
    recoveryDiscardElement,
    recoveryRestoreElement,
    floorplanAutoDiagramInspectorFormElement,
    floorplanAutoDiagramStatusElement,
    floorplanAutoDiagramOpenStudioButtonElement,
    floorplanAutoDiagramViewToggleButtonElement,
    floorplanAutoDiagramLabelTextInputElement,
    floorplanAutoDiagramFolderTextInputElement,
    floorplanAutoDiagramLayoutElement,
    floorplanAutoDiagramLeftInputElement,
    floorplanAutoDiagramTopInputElement,
    floorplanAutoDiagramWidthInputElement,
    floorplanAutoDiagramHeightInputElement,
    floorplanAutoDiagramScaleInputElement,
    floorplanAutoDiagramRotationInputElement,
    floorplanAutoDiagramFloorSelectElement,
    floorplanAutoDiagramCameraViewElement,
    floorplanAutoDiagramCameraModeElement,
    floorplanAutoDiagramFocalLengthInputElement,
    floorplanAutoDiagramRotateTopButtonElement,
    floorplanAutoDiagramOpenBaseLightingButtonElement,
    floorplanAutoDiagramBindingsElement,
    floorplanAutoDiagramBindingListElement,
    floorplanAutoLightingPanelElement,
    floorplanAutoLightingHandleElement,
    floorplanAutoLightingCloseButtonElement,
    floorplanAutoLightingResetButtonElement,
    floorplanAutoLightingSaveButtonElement,
    floorplanAutoLightingStatusElement,
    floorplanBaseLightElements,
    floorplanAutoDiagramDialogElement,
    floorplanAutoDiagramCloseButtonElement,
    floorplanAutoDiagramGuideElement,
    floorplanAutoDiagramLaterButtonElement,
    floorplanAutoDiagramContinueElement,
    effectImageAlignDialogElement,
    effectImageAlignCloseElement,
    effectImageAlignCancelElement,
    effectImageAlignConfirmElement,
    effectImageAlignOptionsElement,
    effectImageAlignMessageElement,
    lightStatisticsInspectorElement,
    lightStatisticsLabelElement,
    lightStatisticsTitleElement,
    lightStatisticsEntityButtonElement,
    lightStatisticsEntityMenuElement,
    lightStatisticsEntitySearchElement,
    lightStatisticsEntityOptionsElement,
    lightStatisticsEntityPendingElement,
    lightStatisticsEntityConfirmElement,
    lightStatisticsEntityMessageElement,
    lightStatisticsEntityListElement,
    lightStatisticsEntityCountElement,
    lightStatisticsActionEntityButtonElement,
    lightStatisticsActionEntityMenuElement,
    lightStatisticsActionEntitySearchElement,
    lightStatisticsActionEntityOptionsElement,
    lightStatisticsActionNoteElement,
    lightStatisticsActionControlsElement,
    lightStatisticsIconButtonElement,
    lightStatisticsIconCopyElement,
    lightStatisticsIconMenuElement,
    lightStatisticsIconSearchElement,
    lightStatisticsIconOptionsElement,
    lightStatisticsIconVisibleElement,
    lightStatisticsIconColorElement,
    lightStatisticsIconActiveColorElement,
    lightStatisticsIconSizeElement,
    lightStatisticsTitleVisibleElement,
    lightStatisticsTitleColorElement,
    lightStatisticsTitleSizeElement,
    lightStatisticsTitleWeightElement,
    lightStatisticsTitleSpacingElement,
    lightStatisticsCountVisibleElement,
    lightStatisticsCountColorElement,
    lightStatisticsCountActiveColorElement,
    lightStatisticsCountSizeElement,
    lightStatisticsCountWeightElement,
    lightStatisticsCountSpacingElement,
    lightStatisticsIconGapElement,
    lightStatisticsCountGapElement,
    lightStatisticsLeftElement,
    lightStatisticsTopElement,
    lightStatisticsWidthElement,
    lightStatisticsHeightElement,
    lightStatisticsScaleElement,
    lightStatisticsRotationElement,
    deviceButtonIconVisibleElement,
    deviceButtonIconOnColorElement,
    deviceButtonIconOnColorLabelElement,
    deviceButtonBadgeColorElement,
    deviceButtonBadgeColorLabelElement,
    deviceButtonBadgeOpacityElement,
    deviceButtonBadgeOpacityLabelElement,
    deviceButtonSymbolSizeElement,
    deviceButtonSymbolSizeLabelElement,
    deviceButtonBadgeSizeElement,
    deviceButtonBadgeSizeLabelElement,
    deviceButtonStatePrecisionElement,
    deviceButtonStatePrecisionLabelElement,
    deviceButtonMainVisibleElement,
    deviceButtonSecondaryVisibleElement,
    vacuumMapInspectorElement,
    vacuumMapLabelElement,
    vacuumMapEntityButtonElement,
    vacuumMapEntityMenuElement,
    vacuumMapEntitySearchElement,
    vacuumMapEntityOptionsElement,
    vacuumMapOpacityElement,
    vacuumMapLeftElement,
    vacuumMapTopElement,
    vacuumMapScaleElement,
    vacuumMapRotationElement,
    cameraInspectorElement,
    cameraLabelElement,
    cameraSourceOptionsElement,
    cameraEntityPickerElement,
    cameraGo2rtcUrlFieldElement,
    cameraGo2rtcUrlElement,
    cameraGo2rtcNoteElement,
    cameraEntityButtonElement,
    cameraEntityMenuElement,
    cameraEntitySearchElement,
    cameraEntityOptionsElement,
    cameraFitOptionsElement,
    cameraDisplayModeOptionsElement,
    cameraRefreshIntervalFieldElement,
    cameraRefreshIntervalElement,
    cameraMediaVisibleElement,
    cameraFrameVisibleElement,
    cameraFrameColorElement,
    cameraFrameWidthElement,
    cameraRadiusElement,
    cameraFrameAngleElement,
    cameraFrameOpacityElement,
    cameraLeftElement,
    cameraTopElement,
    cameraWidthElement,
    cameraHeightElement,
    cameraScaleElement,
    cameraRotationElement,
    cameraActionControlsElement,
    cameraApplyStyleElement,
    cameraApplyCountElement,
  }
}
