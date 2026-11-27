/*
 * 工作区外壳：项目 / 页面 / 弹窗 / 组件列表 / 全局按钮与它们引起的对话框。
 *
 * 由 `./editor-elements` 汇总为 `queryEditorElements`；本文件只负责这一族面板的
 * 元素查询，新增元素请加到对应族而不是汇总文件里。
 */
export function chromeEditorElements(findElement: ElementQuery) {
  const saveButtonElement = findElement('#save')
  const projectNewElement = findElement('#project-new')
  const projectSelectElement = findElement('#project-select')
  const projectActionsButtonElement = findElement('#project-actions-button')
  const projectActionsMenuElement = findElement('#project-actions-menu')
  const projectFloorplanOpenElement = findElement('#project-floorplan-open')
  const navigatorContentElement = findElement('#navigator-content')
  const showPopupEditorButtonElement = findElement('.page-control')
  const pageNewButtonElement = findElement('.popup-control')
  const showPageEditorElement = findElement('#show-page-editor')
  const showPopupEditorElement = findElement('#show-popup-editor')
  const pageNewElement = findElement('#page-new')
  const pageSelectElement = findElement('#page-select')
  const pageActionsButtonElement = findElement('#page-actions-button')
  const pageActionsMenuElement = findElement('#page-actions-menu')
  const defaultPageActionElement = findElement('#default-page-action')
  const popupNewElement = findElement('#popup-new')
  const popupSelectElement = findElement('#popup-select')
  const popupListElement = findElement('#popup-list')
  const popupActionsButtonElement = findElement('#popup-actions-button')
  const popupActionsMenuElement = findElement('#popup-actions-menu')
  const showSharedComponentsElement = findElement('#show-shared-components')
  const showPageComponentsElement = findElement('#show-page-components')
  const addComponentButtonElement = findElement('#add-component-button')
  const componentTemplateDialogElement = findElement('#component-template-dialog')
  const componentTemplateCloseElement = findElement('#component-template-close')
  const componentTemplateScopeElement = findElement('#component-template-scope')
  const componentTemplateListElement = findElement('#component-template-list')
  const sharedComponentListElement = findElement('#shared-component-list')
  const pageComponentListElement = findElement('#page-component-list')
  const componentMenuElement = findElement('#component-context-menu')
  const projectDialogElement = findElement('#project-dialog')
  const projectDialogKickerElement = findElement('#project-dialog-kicker')
  const projectDialogTitleElement = findElement('#project-dialog-title')
  const projectCloseElement = findElement('#project-close')
  const projectCancelElement = findElement('#project-cancel')
  const projectFormElement = findElement('#project-form')
  const projectSubmitElement = findElement('#project-submit')
  const projectMessageElement = findElement('#project-message')
  const projectTemplateFieldsElement = findElement('#project-template-fields')
  const projectTemplateOptionsElement = findElement('#project-template-options')
  const projectPreviewDialogElement = findElement('#project-preview-dialog')
  const projectPreviewTitleElement = findElement('#project-preview-title')
  const projectPreviewCountElement = findElement('#project-preview-count')
  const projectPreviewImageElement = findElement('#project-preview-image')
  const projectPreviewPreviousElement = findElement('#project-preview-previous')
  const projectPreviewNextElement = findElement('#project-preview-next')
  const projectPreviewCloseElement = findElement('#project-preview-close')
  const projectCanvasFieldsElement = findElement('#project-canvas-fields')
  const projectCanvasWidthElement = findElement('#project-canvas-width')
  const projectCanvasHeightElement = findElement('#project-canvas-height')
  const projectAspectRatioElement = findElement('#project-aspect-ratio')
  const projectAspectLockElement = findElement('#project-aspect-lock')
  const projectAspectLockLabelElement = findElement('#project-aspect-lock-label')
  const projectCanvasHintElement = findElement('#project-canvas-hint')
  const projectContentLockFieldsElement = findElement('#project-content-lock-fields')
  const projectContentLockElement = findElement('#project-content-lock')
  const projectResizeWarningDialogElement = findElement('#project-resize-warning-dialog')
  const projectResizeWarningTextElement = findElement('#project-resize-warning-text')
  const projectResizeWarningCloseElement = findElement('#project-resize-warning-close')
  const projectResizeWarningCancelElement = findElement('#project-resize-warning-cancel')
  const projectResizeWarningConfirmElement = findElement('#project-resize-warning-confirm')
  const pageDialogElement = findElement('#page-dialog')
  const pageDialogKickerElement = findElement('#page-dialog-kicker')
  const pageDialogTitleElement = findElement('#page-dialog-title')
  const pageCloseElement = findElement('#page-close')
  const pageCancelElement = findElement('#page-cancel')
  const pageFormElement = findElement('#page-form')
  const pageSubmitElement = findElement('#page-submit')
  const pageMessageElement = findElement('#page-message')
  const componentGroupRenameDialogElement = findElement('#component-group-rename-dialog')
  const componentGroupRenameCloseElement = findElement('#component-group-rename-close')
  const componentGroupRenameCancelElement = findElement('#component-group-rename-cancel')
  const componentGroupRenameFormElement = findElement('#component-group-rename-form')
  const componentGroupRenameInputElement = findElement('#component-group-rename-input')
  const componentGroupRenameMessageElement = findElement('#component-group-rename-message')
  const editorCanvasElement = findElement('#editor-canvas')
  const displayDeviceCountElement = findElement('.workspace')
  const workspaceTitleElement = findElement('#workspace-title')
  const workspaceResolutionElement = findElement('#workspace-resolution')
  const deleteProjectDialogElement = findElement('#delete-project-dialog')
  const deleteProjectCloseButtonElement = findElement('#delete-project-close')
  const deleteProjectCancelButtonElement = findElement('#delete-project-cancel')
  const deleteProjectFormElement = findElement('#delete-project-form')
  const deleteProjectNameElement = findElement('#delete-project-name')
  const deleteProjectMessageElement = findElement('#delete-project-message')
  const deletePageDialogElement = findElement('#delete-page-dialog')
  const deletePageCloseButtonElement = findElement('#delete-page-close')
  const deletePageCancelButtonElement = findElement('#delete-page-cancel')
  const deletePageConfirmButtonElement = findElement('#delete-page-confirm')
  const deletePageNameElement = findElement('#delete-page-name')
  const deletePageMessageElement = findElement('#delete-page-message')
  const deleteComponentDialogElement = findElement('#delete-component-dialog')
  const deleteComponentCloseButtonElement = findElement('#delete-component-close')
  const deleteComponentCancelButtonElement = findElement('#delete-component-cancel')
  const deleteComponentConfirmButtonElement = findElement('#delete-component-confirm')
  const deleteComponentNameElement = findElement('#delete-component-name')
  const copyComponentPageDialogElement = findElement('#copy-component-page-dialog')
  const copyComponentPageCloseButtonElement = findElement('#copy-component-page-close')
  const copyComponentPageCancelButtonElement = findElement('#copy-component-page-cancel')
  const copyComponentPageFormElement = findElement('#copy-component-page-form')
  const copyComponentPageNameElement = findElement('#copy-component-page-name')
  const copyComponentPageScopeSelectElement = findElement('#copy-component-page-scope')
  const copyComponentPageProjectFieldElement = findElement('#copy-component-page-project-field')
  const copyComponentPageProjectSelectElement = findElement('#copy-component-page-project')
  const copyComponentPageTargetLabelElement = findElement('#copy-component-page-target-label')
  const copyComponentPageTargetElement = findElement('#copy-component-page-target')
  const copyComponentScaleOptionsElement = findElement('#copy-component-scale-options')
  const copyComponentResolutionSummaryElement = findElement('#copy-component-resolution-summary')
  const copyComponentPageMessageElement = findElement('#copy-component-page-message')
  const copyComponentPageSubmitElement = findElement('#copy-component-page-submit')
  const copyComponentSuccessDialogElement = findElement('#copy-component-success-dialog')
  const copyComponentSuccessMessageElement = findElement('#copy-component-success-message')
  const copyComponentSuccessStayElement = findElement('#copy-component-success-stay')
  const copyComponentSuccessGoElement = findElement('#copy-component-success-go')
  const errorDialogCloseButtonElement = findElement('#error-dialog')
  const errorDialogCloseElement = findElement('#error-dialog-close')
  const errorDialogConfirmElement = findElement('#error-dialog-confirm')
  const errorDialogMessageElement = findElement('#error-dialog-message')
  const undoElement = findElement('#undo')
  const redoElement = findElement('#redo')
  const inspectorEmptyElement = findElement('#inspector-empty')
  const navigatorElement = findElement('.inspector')
  const globalColorPickerElement = findElement('#global-color-picker')
  const globalColorPickerSvElement = findElement('#global-color-picker-sv')
  const globalColorPickerMarkerElement = findElement('#global-color-picker-marker')
  const globalColorPickerHueRangeInputElement = findElement('#global-color-picker-hue')
  const globalColorPickerSwatchElement = findElement('#global-color-picker-swatch')
  const globalColorPickerHexTextInputElement = findElement('#global-color-picker-hex')
  const globalColorPickerCopyButtonElement = findElement('#global-color-picker-copy')
  const globalColorPickerPasteButtonElement = findElement('#global-color-picker-paste')
  const globalColorPickerRedInputElement = findElement('#global-color-picker-r')
  const globalColorPickerGreenInputElement = findElement('#global-color-picker-g')
  const globalColorPickerBlueInputElement = findElement('#global-color-picker-b')
  const componentActionControlsElement = findElement('#component-action-controls')
  const sceneModeControlElement = findElement('#scene-mode-control')
  const sceneModeHintElement = findElement('#scene-mode-hint')
  const popupNameDialogElement = findElement('#popup-name-dialog')
  const popupNameDialogTitleElement = findElement('#popup-name-dialog-title')
  const popupNameFormElement = findElement('#popup-name-form')
  const popupNameCloseElement = findElement('#popup-name-close')
  const popupNameCancelElement = findElement('#popup-name-cancel')
  const popupModuleDialogElement = findElement('#popup-module-dialog')
  const popupModuleDialogTitleElement = findElement('#popup-module-dialog-title')
  const popupModuleFormElement = findElement('#popup-module-form')
  const popupModuleCloseElement = findElement('#popup-module-close')
  const popupModuleCancelElement = findElement('#popup-module-cancel')
  const popupModuleEntityButtonElement = findElement('#popup-module-entity-button')
  const popupModuleEntityMenuElement = findElement('#popup-module-entity-menu')
  const popupModuleEntitySearchElement = findElement('#popup-module-entity-search')
  const popupModuleEntityOptionsElement = findElement('#popup-module-entity-options')
  const popupModuleClimateDeviceTypeElement = findElement('#popup-module-climate-device-type')
  const deletePopupDialogElement = findElement('#delete-popup-dialog')
  const deletePopupCloseElement = findElement('#delete-popup-close')
  const deletePopupCancelElement = findElement('#delete-popup-cancel')
  const deletePopupConfirmElement = findElement('#delete-popup-confirm')
  const deletePopupNameElement = findElement('#delete-popup-name')
  const deleteAssetDialogElement = findElement('#delete-asset-dialog')
  const deleteAssetCloseButtonElement = findElement('#delete-asset-close')
  const deleteAssetCancelButtonElement = findElement('#delete-asset-cancel')
  const deleteAssetConfirmButtonElement = findElement('#delete-asset-confirm')
  const deleteAssetNameElement = findElement('#delete-asset-name')
  const deleteAssetFolderDialogElement = findElement('#delete-asset-folder-dialog')
  const deleteAssetFolderCloseButtonElement = findElement('#delete-asset-folder-close')
  const deleteAssetFolderCancelButtonElement = findElement('#delete-asset-folder-cancel')
  const deleteAssetFolderConfirmButtonElement = findElement('#delete-asset-folder-confirm')
  const deleteAssetFolderNameElement = findElement('#delete-asset-folder-name')
  const deleteAssetFolderCountElement = findElement('#delete-asset-folder-count')
  return {
    saveButtonElement,
    projectNewElement,
    projectSelectElement,
    projectActionsButtonElement,
    projectActionsMenuElement,
    projectFloorplanOpenElement,
    navigatorContentElement,
    showPopupEditorButtonElement,
    pageNewButtonElement,
    showPageEditorElement,
    showPopupEditorElement,
    pageNewElement,
    pageSelectElement,
    pageActionsButtonElement,
    pageActionsMenuElement,
    defaultPageActionElement,
    popupNewElement,
    popupSelectElement,
    popupListElement,
    popupActionsButtonElement,
    popupActionsMenuElement,
    showSharedComponentsElement,
    showPageComponentsElement,
    addComponentButtonElement,
    componentTemplateDialogElement,
    componentTemplateCloseElement,
    componentTemplateScopeElement,
    componentTemplateListElement,
    sharedComponentListElement,
    pageComponentListElement,
    componentMenuElement,
    projectDialogElement,
    projectDialogKickerElement,
    projectDialogTitleElement,
    projectCloseElement,
    projectCancelElement,
    projectFormElement,
    projectSubmitElement,
    projectMessageElement,
    projectTemplateFieldsElement,
    projectTemplateOptionsElement,
    projectPreviewDialogElement,
    projectPreviewTitleElement,
    projectPreviewCountElement,
    projectPreviewImageElement,
    projectPreviewPreviousElement,
    projectPreviewNextElement,
    projectPreviewCloseElement,
    projectCanvasFieldsElement,
    projectCanvasWidthElement,
    projectCanvasHeightElement,
    projectAspectRatioElement,
    projectAspectLockElement,
    projectAspectLockLabelElement,
    projectCanvasHintElement,
    projectContentLockFieldsElement,
    projectContentLockElement,
    projectResizeWarningDialogElement,
    projectResizeWarningTextElement,
    projectResizeWarningCloseElement,
    projectResizeWarningCancelElement,
    projectResizeWarningConfirmElement,
    pageDialogElement,
    pageDialogKickerElement,
    pageDialogTitleElement,
    pageCloseElement,
    pageCancelElement,
    pageFormElement,
    pageSubmitElement,
    pageMessageElement,
    componentGroupRenameDialogElement,
    componentGroupRenameCloseElement,
    componentGroupRenameCancelElement,
    componentGroupRenameFormElement,
    componentGroupRenameInputElement,
    componentGroupRenameMessageElement,
    editorCanvasElement,
    displayDeviceCountElement,
    workspaceTitleElement,
    workspaceResolutionElement,
    deleteProjectDialogElement,
    deleteProjectCloseButtonElement,
    deleteProjectCancelButtonElement,
    deleteProjectFormElement,
    deleteProjectNameElement,
    deleteProjectMessageElement,
    deletePageDialogElement,
    deletePageCloseButtonElement,
    deletePageCancelButtonElement,
    deletePageConfirmButtonElement,
    deletePageNameElement,
    deletePageMessageElement,
    deleteComponentDialogElement,
    deleteComponentCloseButtonElement,
    deleteComponentCancelButtonElement,
    deleteComponentConfirmButtonElement,
    deleteComponentNameElement,
    copyComponentPageDialogElement,
    copyComponentPageCloseButtonElement,
    copyComponentPageCancelButtonElement,
    copyComponentPageFormElement,
    copyComponentPageNameElement,
    copyComponentPageScopeSelectElement,
    copyComponentPageProjectFieldElement,
    copyComponentPageProjectSelectElement,
    copyComponentPageTargetLabelElement,
    copyComponentPageTargetElement,
    copyComponentScaleOptionsElement,
    copyComponentResolutionSummaryElement,
    copyComponentPageMessageElement,
    copyComponentPageSubmitElement,
    copyComponentSuccessDialogElement,
    copyComponentSuccessMessageElement,
    copyComponentSuccessStayElement,
    copyComponentSuccessGoElement,
    errorDialogCloseButtonElement,
    errorDialogCloseElement,
    errorDialogConfirmElement,
    errorDialogMessageElement,
    undoElement,
    redoElement,
    inspectorEmptyElement,
    navigatorElement,
    globalColorPickerElement,
    globalColorPickerSvElement,
    globalColorPickerMarkerElement,
    globalColorPickerHueRangeInputElement,
    globalColorPickerSwatchElement,
    globalColorPickerHexTextInputElement,
    globalColorPickerCopyButtonElement,
    globalColorPickerPasteButtonElement,
    globalColorPickerRedInputElement,
    globalColorPickerGreenInputElement,
    globalColorPickerBlueInputElement,
    componentActionControlsElement,
    sceneModeControlElement,
    sceneModeHintElement,
    popupNameDialogElement,
    popupNameDialogTitleElement,
    popupNameFormElement,
    popupNameCloseElement,
    popupNameCancelElement,
    popupModuleDialogElement,
    popupModuleDialogTitleElement,
    popupModuleFormElement,
    popupModuleCloseElement,
    popupModuleCancelElement,
    popupModuleEntityButtonElement,
    popupModuleEntityMenuElement,
    popupModuleEntitySearchElement,
    popupModuleEntityOptionsElement,
    popupModuleClimateDeviceTypeElement,
    deletePopupDialogElement,
    deletePopupCloseElement,
    deletePopupCancelElement,
    deletePopupConfirmElement,
    deletePopupNameElement,
    deleteAssetDialogElement,
    deleteAssetCloseButtonElement,
    deleteAssetCancelButtonElement,
    deleteAssetConfirmButtonElement,
    deleteAssetNameElement,
    deleteAssetFolderDialogElement,
    deleteAssetFolderCloseButtonElement,
    deleteAssetFolderCancelButtonElement,
    deleteAssetFolderConfirmButtonElement,
    deleteAssetFolderNameElement,
    deleteAssetFolderCountElement,
  }
}

/*
 * 编辑器元素查询链的**汇总入口**（853 项）。
 *
 * 为什么拆成按面板族的多个文件：这里原本是单个 1,727 行的函数，前半是 853 条
 * `const x = findElement(...)`、后半是 853 项 `return`，两半严格一一对应。
 * 单个函数体没有任何分组，改一处要在 1,727 行里定位；按面板族拆开后，
 * 「这个元素属于哪个面板」由所在文件回答，新增元素只改对应族。
 *
 * 调用面不变：仍从本文件导入 `queryEditorElements(findElement)`，返回对象形状一致。
 */

export function queryEditorElements(findElement: ElementQuery) {
  return {
    ...chromeEditorElements(findElement),
    ...inspectorsNavigationElements(findElement),
    ...inspectorsClimateElements(findElement),
    ...inspectorsChartsElements(findElement),
    ...inspectorsDevicesElements(findElement),
  }
}

/*
 * 图表族检视面板：折线图 / 事件日志 / 日期 / 时间 / 图片。
 *
 * 由 `./editor-elements` 汇总为 `queryEditorElements`；本文件只负责这一族面板的
 * 元素查询，新增元素请加到对应族而不是汇总文件里。
 */
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
  // 页面背景（0.9.0）：它的「选择图片」复用图片资产拾取器，锚点换成自己这一格。
  const pageBackgroundAssetButtonElement = findElement('#page-background-asset-button')
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
    pageBackgroundAssetButtonElement,
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

/*
 * 环境族检视面板：空调 / 天气 / 存在 / 窗帘 / 门。
 *
 * 由 `./editor-elements` 汇总为 `queryEditorElements`；本文件只负责这一族面板的
 * 元素查询，新增元素请加到对应族而不是汇总文件里。
 */
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

/*
 * 设备族检视面板：灯光统计 / 扫地机 / 设备 / 相机 / 户型图 / 效果 / 恢复。
 *
 * 由 `./editor-elements` 汇总为 `queryEditorElements`；本文件只负责这一族面板的
 * 元素查询，新增元素请加到对应族而不是汇总文件里。
 */
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

/*
 * 导航族检视面板：导航按钮 / 标题按钮 / 图标按钮 / 图标按钮（效果）/ 底图框。
 *
 * 由 `./editor-elements` 汇总为 `queryEditorElements`；本文件只负责这一族面板的
 * 元素查询，新增元素请加到对应族而不是汇总文件里。
 */
export function inspectorsNavigationElements(findElement: ElementQuery) {
  const iconButtonEffectInspectorElement = findElement('#icon-button-effect-inspector')
  const ibeLabelElement = findElement('#ibe-label')
  const ibeEntityButtonElement = findElement('#ibe-entity-button')
  const ibeEntityMenuElement = findElement('#ibe-entity-menu')
  const ibeEntitySearchElement = findElement('#ibe-entity-search')
  const ibeEntityOptionsElement = findElement('#ibe-entity-options')
  const ibeColorTemperatureRealtimeElement = findElement('#ibe-color-temperature-realtime')
  const ibeBrightnessRealtimeElement = findElement('#ibe-brightness-realtime')
  const ibePreviewStateElement = findElement('#ibe-preview-state')
  const ibeLayerOptionsElement = findElement('#ibe-layer-options')
  const ibeButtonSectionElement = findElement('#ibe-button-section')
  const ibeEffectSectionElement = findElement('#ibe-effect-section')
  const ibeButtonVisibleElement = findElement('#ibe-button-visible')
  const ibeEffectVisibleElement = findElement('#ibe-effect-visible')
  const ibeButtonTransformSectionElement = findElement('#ibe-button-transform-section')
  const ibeActionSectionElement = findElement('#ibe-action-section')
  const ibeIconButtonElement = findElement('#ibe-icon-button')
  const ibeIconCopyElement = findElement('#ibe-icon-copy')
  const ibeIconMenuElement = findElement('#ibe-icon-menu')
  const ibeIconSearchElement = findElement('#ibe-icon-search')
  const ibeIconOptionsElement = findElement('#ibe-icon-options')
  const ibeIconOffColorElement = findElement('#ibe-icon-off-color')
  const ibeIconOnColorElement = findElement('#ibe-icon-on-color')
  const ibeIconSizeElement = findElement('#ibe-icon-size')
  const ibeButtonOffColorElement = findElement('#ibe-button-off-color')
  const ibeButtonOnColorElement = findElement('#ibe-button-on-color')
  const ibeButtonOpacityElement = findElement('#ibe-button-opacity')
  const ibeFrameColorElement = findElement('#ibe-frame-color')
  const ibeFrameWidthElement = findElement('#ibe-frame-width')
  const ibeFrameOpacityElement = findElement('#ibe-frame-opacity')
  const ibeRadiusElement = findElement('#ibe-radius')
  const ibeGlowColorElement = findElement('#ibe-glow-color')
  const ibeGlowOffStrengthElement = findElement('#ibe-glow-off-strength')
  const ibeGlowOnStrengthElement = findElement('#ibe-glow-on-strength')
  const ibeAssetButtonElement = findElement('#ibe-asset-button')
  const ibeAssetMenuElement = findElement('#ibe-asset-menu')
  const ibeAssetFolderElement = findElement('#ibe-asset-folder')
  const ibeAssetSearchElement = findElement('#ibe-asset-search')
  const ibeAssetOptionsElement = findElement('#ibe-asset-options')
  const ibeAssetUploadElement = findElement('#ibe-asset-upload')
  const ibeAssetUploadInputElement = findElement('#ibe-asset-upload-input')
  const ibeAssetUploadHintElement = findElement('#ibe-asset-upload-hint')
  const ibeEffectOpacityElement = findElement('#ibe-effect-opacity')
  const ibeEffectFadeDurationElement = findElement('#ibe-effect-fade-duration')
  const ibeEffectLayoutOptionsElement = findElement('#ibe-effect-layout-options')
  const ibeEffectAlignImageElement = findElement('#ibe-effect-align-image')
  const ibeEffectLeftElement = findElement('#ibe-effect-left')
  const ibeEffectTopElement = findElement('#ibe-effect-top')
  const ibeEffectScaleElement = findElement('#ibe-effect-scale')
  const ibeEffectRotationElement = findElement('#ibe-effect-rotation')
  const ibeEffectSizeHintElement = findElement('#ibe-effect-size-hint')
  const ibeLeftElement = findElement('#ibe-left')
  const ibeTopElement = findElement('#ibe-top')
  const ibeWidthElement = findElement('#ibe-width')
  const ibeHeightElement = findElement('#ibe-height')
  const ibeScaleElement = findElement('#ibe-scale')
  const ibeRotationElement = findElement('#ibe-rotation')
  const ibeActionControlsElement = findElement('#ibe-action-controls')
  const ibeApplyStyleElement = findElement('#ibe-apply-style')
  const ibeApplyCountElement = findElement('#ibe-apply-count')
  const titleButtonInspectorElement = findElement('#title-button-inspector')
  const titleButtonLabelElement = findElement('#title-button-label')
  const titleButtonEntityButtonElement = findElement('#title-button-entity-button')
  const titleButtonEntityMenuElement = findElement('#title-button-entity-menu')
  const titleButtonEntitySearchElement = findElement('#title-button-entity-search')
  const titleButtonEntityOptionsElement = findElement('#title-button-entity-options')
  const titleButtonMainVisibleElement = findElement('#title-button-main-visible')
  const titleButtonSecondaryVisibleElement = findElement('#title-button-secondary-visible')
  const titleButtonMainTextElement = findElement('#title-button-main-text')
  const titleButtonSecondaryLine1Element = findElement('#title-button-secondary-line-1')
  const titleButtonSecondaryLine2Element = findElement('#title-button-secondary-line-2')
  const titleButtonMainColorElement = findElement('#title-button-main-color')
  const titleButtonSecondaryColorElement = findElement('#title-button-secondary-color')
  const titleButtonMainSizeElement = findElement('#title-button-main-size')
  const titleButtonSecondarySizeElement = findElement('#title-button-secondary-size')
  const titleButtonMainWeightElement = findElement('#title-button-main-weight')
  const titleButtonSecondaryWeightElement = findElement('#title-button-secondary-weight')
  const titleButtonMainSpacingElement = findElement('#title-button-main-spacing')
  const titleButtonSecondarySpacingElement = findElement('#title-button-secondary-spacing')
  const titleButtonSecondaryLineGapElement = findElement('#title-button-secondary-line-gap')
  const titleButtonMainLeftElement = findElement('#title-button-main-left')
  const titleButtonMainTopElement = findElement('#title-button-main-top')
  const titleButtonSecondaryLeftElement = findElement('#title-button-secondary-left')
  const titleButtonSecondaryTopElement = findElement('#title-button-secondary-top')
  const titleButtonIconVisibleElement = findElement('#title-button-icon-visible')
  const titleButtonIconButtonElement = findElement('#title-button-icon-button')
  const titleButtonIconCopyElement = findElement('#title-button-icon-copy')
  const titleButtonIconMenuElement = findElement('#title-button-icon-menu')
  const titleButtonIconSearchElement = findElement('#title-button-icon-search')
  const titleButtonIconOptionsElement = findElement('#title-button-icon-options')
  const titleButtonIconColorElement = findElement('#title-button-icon-color')
  const titleButtonIconSizeElement = findElement('#title-button-icon-size')
  const titleButtonIconLeftElement = findElement('#title-button-icon-left')
  const titleButtonIconTopElement = findElement('#title-button-icon-top')
  const titleButtonFrameColorElement = findElement('#title-button-frame-color')
  const titleButtonFrameVisibleElement = findElement('#title-button-frame-visible')
  const titleButtonFrameWidthElement = findElement('#title-button-frame-width')
  const titleButtonFrameSizeElement = findElement('#title-button-frame-size')
  const titleButtonFrameSpacingElement = findElement('#title-button-frame-spacing')
  const titleButtonFrameOffsetXElement = findElement('#title-button-frame-offset-x')
  const titleButtonFrameOffsetYElement = findElement('#title-button-frame-offset-y')
  const titleButtonMarkerVisibleElement = findElement('#title-button-marker-visible')
  const titleButtonMarkerColorElement = findElement('#title-button-marker-color')
  const titleButtonMarkerSizeElement = findElement('#title-button-marker-size')
  const titleButtonMarkerLeftElement = findElement('#title-button-marker-left')
  const titleButtonMarkerTopElement = findElement('#title-button-marker-top')
  const titleButtonLeftElement = findElement('#title-button-left')
  const titleButtonTopElement = findElement('#title-button-top')
  const titleButtonWidthElement = findElement('#title-button-width')
  const titleButtonHeightElement = findElement('#title-button-height')
  const titleButtonScaleElement = findElement('#title-button-scale')
  const titleButtonRotationElement = findElement('#title-button-rotation')
  const titleButtonActionControlsElement = findElement('#title-button-action-controls')
  const titleButtonApplyStyleElement = findElement('#title-button-apply-style')
  const titleButtonApplyCountElement = findElement('#title-button-apply-count')
  const iconButtonInspectorElement = findElement('#icon-button-inspector')
  const iconButtonTypeLabelElement = findElement('#icon-button-type-label')
  const iconButtonTypeElement = findElement('#icon-button-type')
  const iconButtonLabelElement = findElement('#icon-button-label')
  const iconButtonEntityButtonElement = findElement('#icon-button-entity-button')
  const iconButtonEntityMenuElement = findElement('#icon-button-entity-menu')
  const iconButtonEntitySearchElement = findElement('#icon-button-entity-search')
  const iconButtonEntityOptionsElement = findElement('#icon-button-entity-options')
  const iconButtonPreviewStateElement = findElement('#icon-button-preview-state')
  const iconButtonPreviewControlElement = findElement('#icon-button-preview-control')
  const iconButtonIconButtonElement = findElement('#icon-button-icon-button')
  const iconButtonIconCopyElement = findElement('#icon-button-icon-copy')
  const iconButtonIconMenuElement = findElement('#icon-button-icon-menu')
  const iconButtonIconSearchElement = findElement('#icon-button-icon-search')
  const iconButtonIconOptionsElement = findElement('#icon-button-icon-options')
  const iconButtonIconColorElement = findElement('#icon-button-icon-color')
  const iconButtonIconColorLabelElement = findElement('#icon-button-icon-color-label')
  const iconButtonIconSizeElement = findElement('#icon-button-icon-size')
  const iconButtonIconSizeLabelElement = findElement('#icon-button-icon-size-label')
  const iconButtonIconOffOpacityElement = findElement('#icon-button-icon-off-opacity')
  const iconButtonIconOnOpacityElement = findElement('#icon-button-icon-on-opacity')
  const iconButtonIconOffOpacityLabelElement = findElement('#icon-button-icon-off-opacity-label')
  const iconButtonIconOnOpacityLabelElement = findElement('#icon-button-icon-on-opacity-label')
  const iconButtonIconLeftElement = findElement('#icon-button-icon-left')
  const iconButtonIconTopElement = findElement('#icon-button-icon-top')
  const iconButtonMainTextElement = findElement('#icon-button-main-text')
  const iconButtonSecondaryTextElement = findElement('#icon-button-secondary-text')
  const iconButtonMainHeadingElement = findElement('#icon-button-main-heading')
  const iconButtonSecondaryHeadingElement = findElement('#icon-button-secondary-heading')
  const iconButtonMainContentLabelElement = findElement('#icon-button-main-content-label')
  const iconButtonSecondaryContentLabelElement = findElement('#icon-button-secondary-content-label')
  const iconButtonMainColorElement = findElement('#icon-button-main-color')
  const iconButtonSecondaryColorElement = findElement('#icon-button-secondary-color')
  const iconButtonMainOffOpacityElement = findElement('#icon-button-main-off-opacity')
  const iconButtonMainOnOpacityElement = findElement('#icon-button-main-on-opacity')
  const iconButtonSecondaryOffOpacityElement = findElement('#icon-button-secondary-off-opacity')
  const iconButtonSecondaryOnOpacityElement = findElement('#icon-button-secondary-on-opacity')
  const iconButtonMainOffOpacityLabelElement = findElement('#icon-button-main-off-opacity-label')
  const iconButtonMainOnOpacityLabelElement = findElement('#icon-button-main-on-opacity-label')
  const iconButtonSecondaryOffOpacityLabelElement = findElement('#icon-button-secondary-off-opacity-label')
  const iconButtonSecondaryOnOpacityLabelElement = findElement('#icon-button-secondary-on-opacity-label')
  const iconButtonMainSizeElement = findElement('#icon-button-main-size')
  const iconButtonSecondarySizeElement = findElement('#icon-button-secondary-size')
  const iconButtonMainWeightElement = findElement('#icon-button-main-weight')
  const iconButtonSecondaryWeightElement = findElement('#icon-button-secondary-weight')
  const iconButtonMainSpacingElement = findElement('#icon-button-main-spacing')
  const iconButtonSecondarySpacingElement = findElement('#icon-button-secondary-spacing')
  const iconButtonMainLeftElement = findElement('#icon-button-main-left')
  const iconButtonMainTopElement = findElement('#icon-button-main-top')
  const iconButtonSecondaryLeftElement = findElement('#icon-button-secondary-left')
  const iconButtonSecondaryTopElement = findElement('#icon-button-secondary-top')
  const iconButtonOnFillVisibleElement = findElement('#icon-button-on-fill-visible')
  const iconButtonFillSectionElement = findElement('#icon-button-fill-section')
  const iconButtonOnFillColorElement = findElement('#icon-button-on-fill-color')
  const iconButtonOnFillStrengthElement = findElement('#icon-button-on-fill-strength')
  const iconButtonOnFillFadeDurationElement = findElement('#icon-button-on-fill-fade-duration')
  const iconButtonFrameVisibleElement = findElement('#icon-button-frame-visible')
  const iconButtonFrameSectionElement = findElement('#icon-button-frame-section')
  const iconButtonFrameWidthElement = findElement('#icon-button-frame-width')
  const iconButtonFrameAngleElement = findElement('#icon-button-frame-angle')
  const iconButtonFrameOffOpacityElement = findElement('#icon-button-frame-off-opacity')
  const iconButtonFrameOnOpacityElement = findElement('#icon-button-frame-on-opacity')
  const iconButtonCutCornerElement = findElement('#icon-button-cut-corner')
  const iconButtonSoftLightVisibleElement = findElement('#icon-button-soft-light-visible')
  const iconButtonSoftLightSectionElement = findElement('#icon-button-soft-light-section')
  const iconButtonSoftLightColorElement = findElement('#icon-button-soft-light-color')
  const iconButtonSoftLightStrengthElement = findElement('#icon-button-soft-light-strength')
  const iconButtonSoftLightSizeElement = findElement('#icon-button-soft-light-size')
  const iconButtonSoftLightAngleElement = findElement('#icon-button-soft-light-angle')
  const iconButtonGlowVisibleElement = findElement('#icon-button-glow-visible')
  const iconButtonGlowSectionElement = findElement('#icon-button-glow-section')
  const iconButtonGlowColorElement = findElement('#icon-button-glow-color')
  const iconButtonGlowStrengthElement = findElement('#icon-button-glow-strength')
  const iconButtonGlowSizeElement = findElement('#icon-button-glow-size')
  const iconButtonGlowAngleElement = findElement('#icon-button-glow-angle')
  const iconButtonLeftElement = findElement('#icon-button-left')
  const iconButtonTopElement = findElement('#icon-button-top')
  const iconButtonWidthElement = findElement('#icon-button-width')
  const iconButtonHeightElement = findElement('#icon-button-height')
  const iconButtonScaleElement = findElement('#icon-button-scale')
  const iconButtonRotationElement = findElement('#icon-button-rotation')
  const iconButtonActionControlsElement = findElement('#icon-button-action-controls')
  const iconButtonActionSectionElement = findElement('#icon-button-action-section')
  const iconButtonPreviewDetailsElement = findElement('#icon-button-preview-details')
  const iconButtonApplyStyleElement = findElement('#icon-button-apply-style')
  const iconButtonApplyCountElement = findElement('#icon-button-apply-count')
  const panelFrameInspectorFormElement = findElement('#panel-frame-inspector')
  const panelFrameTypeTextInputElement = findElement('#panel-frame-type')
  const panelFrameLabelTextInputElement = findElement('#panel-frame-label')
  const panelFrameMainVisibleButtonElement = findElement('#panel-frame-main-visible')
  const panelFrameMainTextInputElement = findElement('#panel-frame-main-text')
  const panelFrameMainColorInputElement = findElement('#panel-frame-main-color')
  const panelFrameMainSizeInputElement = findElement('#panel-frame-main-size')
  const panelFrameMainWeightInputElement = findElement('#panel-frame-main-weight')
  const panelFrameMainOpacityInputElement = findElement('#panel-frame-main-opacity')
  const panelFrameMainSpacingInputElement = findElement('#panel-frame-main-spacing')
  const panelFrameMainLeftInputElement = findElement('#panel-frame-main-left')
  const panelFrameMainTopInputElement = findElement('#panel-frame-main-top')
  const panelFrameSecondaryVisibleButtonElement = findElement('#panel-frame-secondary-visible')
  const panelFrameSecondaryTextInputElement = findElement('#panel-frame-secondary-text')
  const panelFrameSecondaryColorInputElement = findElement('#panel-frame-secondary-color')
  const panelFrameSecondarySizeInputElement = findElement('#panel-frame-secondary-size')
  const panelFrameSecondaryWeightInputElement = findElement('#panel-frame-secondary-weight')
  const panelFrameSecondaryOpacityInputElement = findElement('#panel-frame-secondary-opacity')
  const panelFrameSecondarySpacingInputElement = findElement('#panel-frame-secondary-spacing')
  const panelFrameSecondaryLeftInputElement = findElement('#panel-frame-secondary-left')
  const panelFrameSecondaryTopInputElement = findElement('#panel-frame-secondary-top')
  const panelFrameEdgeVisibleButtonElement = findElement('#panel-frame-edge-visible')
  const panelFrameEdgeColorInputElement = findElement('#panel-frame-edge-color')
  const panelFrameEdgeWidthInputElement = findElement('#panel-frame-edge-width')
  const panelFrameEdgeOpacityInputElement = findElement('#panel-frame-edge-opacity')
  const panelFrameRadiusInputElement = findElement('#panel-frame-radius')
  const panelFrameEdgeAngleInputElement = findElement('#panel-frame-edge-angle')
  const panelFrameGlowVisibleButtonElement = findElement('#panel-frame-glow-visible')
  const panelFrameGlowColorInputElement = findElement('#panel-frame-glow-color')
  const panelFrameGlowStrengthInputElement = findElement('#panel-frame-glow-strength')
  const panelFrameGlowSizeInputElement = findElement('#panel-frame-glow-size')
  const panelFrameGlowAngleInputElement = findElement('#panel-frame-glow-angle')
  const panelFrameLeftInputElement = findElement('#panel-frame-left')
  const panelFrameTopInputElement = findElement('#panel-frame-top')
  const panelFrameWidthInputElement = findElement('#panel-frame-width')
  const panelFrameHeightInputElement = findElement('#panel-frame-height')
  const panelFrameScaleInputElement = findElement('#panel-frame-scale')
  const panelFrameRotationInputElement = findElement('#panel-frame-rotation')
  const panelFrameApplyStyleButtonElement = findElement('#panel-frame-apply-style')
  const panelFrameApplyCountElement = findElement('#panel-frame-apply-count')
  const navigationInspectorFormElement = findElement('#navigation-inspector')
  const navigationLabelTextInputElement = (navigationPreviewStateElementState: any) =>
    ['navigation-button', 'scene-mode'].includes(navigationPreviewStateElementState?.type)
  const navigationTypeElement = findElement('#navigation-type')
  const navigationLabelElement = findElement('#navigation-label')
  const navigationPreviewStateElement = findElement('#navigation-preview-state')
  const navigationEntityButtonElement = findElement('#navigation-entity-button')
  const navigationEntityMenuElement = findElement('#navigation-entity-menu')
  const navigationEntitySearchElement = findElement('#navigation-entity-search')
  const navigationEntityOptionsElement = findElement('#navigation-entity-options')
  const navigationMainTextElement = findElement('#navigation-main-text')
  const navigationSecondaryTextElement = findElement('#navigation-secondary-text')
  const navigationMainVisibleElement = findElement('#navigation-main-visible')
  const navigationSecondaryVisibleElement = findElement('#navigation-secondary-visible')
  const navigationIconVisibleElement = findElement('#navigation-icon-visible')
  const navigationFrameVisibleElement = findElement('#navigation-frame-visible')
  const navigationGlowVisibleElement = findElement('#navigation-glow-visible')
  const navigationIconButtonElement = findElement('#navigation-icon-button')
  const navigationIconCopyElement = findElement('#navigation-icon-copy')
  const navigationIconMenuElement = findElement('#navigation-icon-menu')
  const navigationIconSearchElement = findElement('#navigation-icon-search')
  const navigationIconOptionsElement = findElement('#navigation-icon-options')
  const navigationMainColorElement = findElement('#navigation-main-color')
  const navigationSecondaryColorElement = findElement('#navigation-secondary-color')
  const navigationMainSizeElement = findElement('#navigation-main-size')
  const navigationSecondarySizeElement = findElement('#navigation-secondary-size')
  const navigationMainWeightElement = findElement('#navigation-main-weight')
  const navigationSecondaryWeightElement = findElement('#navigation-secondary-weight')
  const navigationMainSpacingElement = findElement('#navigation-main-spacing')
  const navigationSecondarySpacingElement = findElement('#navigation-secondary-spacing')
  const navigationMainTextLeftElement = findElement('#navigation-main-text-left')
  const navigationMainTextTopElement = findElement('#navigation-main-text-top')
  const navigationSecondaryTextLeftElement = findElement('#navigation-secondary-text-left')
  const navigationSecondaryTextTopElement = findElement('#navigation-secondary-text-top')
  const navigationTextIdleOpacityElement = findElement('#navigation-text-idle-opacity')
  const navigationTextActiveOpacityElement = findElement('#navigation-text-active-opacity')
  const navigationIconColorElement = findElement('#navigation-icon-color')
  const navigationIconSizeElement = findElement('#navigation-icon-size')
  const navigationIconLeftElement = findElement('#navigation-icon-left')
  const navigationIconTopElement = findElement('#navigation-icon-top')
  const navigationIconIdleOpacityElement = findElement('#navigation-icon-idle-opacity')
  const navigationIconActiveOpacityElement = findElement('#navigation-icon-active-opacity')
  const navigationFrameColorElement = findElement('#navigation-frame-color')
  const navigationFrameWidthElement = findElement('#navigation-frame-width')
  const navigationFrameIdleOpacityElement = findElement('#navigation-frame-idle-opacity')
  const navigationFrameActiveOpacityElement = findElement('#navigation-frame-active-opacity')
  const navigationFrameAngleElement = findElement('#navigation-frame-angle')
  const navigationGlowColorElement = findElement('#navigation-glow-color')
  const navigationGlowAngleElement = findElement('#navigation-glow-angle')
  const navigationGlowIdleStrengthElement = findElement('#navigation-glow-idle-strength')
  const navigationGlowIdleSizeElement = findElement('#navigation-glow-idle-size')
  const navigationGlowActiveStrengthElement = findElement('#navigation-glow-active-strength')
  const navigationGlowActiveSizeElement = findElement('#navigation-glow-active-size')
  const navigationRadiusElement = findElement('#navigation-radius')
  const navigationLeftElement = findElement('#navigation-left')
  const navigationTopElement = findElement('#navigation-top')
  const navigationWidthElement = findElement('#navigation-width')
  const navigationHeightElement = findElement('#navigation-height')
  const navigationScaleElement = findElement('#navigation-scale')
  const navigationRotationElement = findElement('#navigation-rotation')
  const navigationActionControlsElement = findElement('#navigation-action-controls')
  const navigationApplyStyleElement = findElement('#navigation-apply-style')
  const navigationApplyCountElement = findElement('#navigation-apply-count')
  const navigationStyleApplyDialogElement = findElement('#navigation-style-apply-dialog')
  const navigationStyleApplyCloseElement = findElement('#navigation-style-apply-close')
  const navigationStyleApplyTitleElement = findElement('#navigation-style-apply-title')
  const navigationStyleApplySummaryElement = findElement('#navigation-style-apply-summary')
  const navigationStyleApplyPropertiesElement = findElement('#navigation-style-apply-properties')
  const navigationStyleApplyTargetHeadingElement = findElement('#navigation-style-apply-target-heading')
  const navigationStyleApplyTargetScopeElement = findElement('#navigation-style-apply-target-scope')
  const navigationStyleApplyTargetsElement = findElement('#navigation-style-apply-targets')
  const navigationStyleApplyMessageElement = findElement('#navigation-style-apply-message')
  const navigationStyleApplyCancelElement = findElement('#navigation-style-apply-cancel')
  const navigationStyleApplyConfirmElement = findElement('#navigation-style-apply-confirm')
  return {
    iconButtonEffectInspectorElement,
    ibeLabelElement,
    ibeEntityButtonElement,
    ibeEntityMenuElement,
    ibeEntitySearchElement,
    ibeEntityOptionsElement,
    ibeColorTemperatureRealtimeElement,
    ibeBrightnessRealtimeElement,
    ibePreviewStateElement,
    ibeLayerOptionsElement,
    ibeButtonSectionElement,
    ibeEffectSectionElement,
    ibeButtonVisibleElement,
    ibeEffectVisibleElement,
    ibeButtonTransformSectionElement,
    ibeActionSectionElement,
    ibeIconButtonElement,
    ibeIconCopyElement,
    ibeIconMenuElement,
    ibeIconSearchElement,
    ibeIconOptionsElement,
    ibeIconOffColorElement,
    ibeIconOnColorElement,
    ibeIconSizeElement,
    ibeButtonOffColorElement,
    ibeButtonOnColorElement,
    ibeButtonOpacityElement,
    ibeFrameColorElement,
    ibeFrameWidthElement,
    ibeFrameOpacityElement,
    ibeRadiusElement,
    ibeGlowColorElement,
    ibeGlowOffStrengthElement,
    ibeGlowOnStrengthElement,
    ibeAssetButtonElement,
    ibeAssetMenuElement,
    ibeAssetFolderElement,
    ibeAssetSearchElement,
    ibeAssetOptionsElement,
    ibeAssetUploadElement,
    ibeAssetUploadInputElement,
    ibeAssetUploadHintElement,
    ibeEffectOpacityElement,
    ibeEffectFadeDurationElement,
    ibeEffectLayoutOptionsElement,
    ibeEffectAlignImageElement,
    ibeEffectLeftElement,
    ibeEffectTopElement,
    ibeEffectScaleElement,
    ibeEffectRotationElement,
    ibeEffectSizeHintElement,
    ibeLeftElement,
    ibeTopElement,
    ibeWidthElement,
    ibeHeightElement,
    ibeScaleElement,
    ibeRotationElement,
    ibeActionControlsElement,
    ibeApplyStyleElement,
    ibeApplyCountElement,
    titleButtonInspectorElement,
    titleButtonLabelElement,
    titleButtonEntityButtonElement,
    titleButtonEntityMenuElement,
    titleButtonEntitySearchElement,
    titleButtonEntityOptionsElement,
    titleButtonMainVisibleElement,
    titleButtonSecondaryVisibleElement,
    titleButtonMainTextElement,
    titleButtonSecondaryLine1Element,
    titleButtonSecondaryLine2Element,
    titleButtonMainColorElement,
    titleButtonSecondaryColorElement,
    titleButtonMainSizeElement,
    titleButtonSecondarySizeElement,
    titleButtonMainWeightElement,
    titleButtonSecondaryWeightElement,
    titleButtonMainSpacingElement,
    titleButtonSecondarySpacingElement,
    titleButtonSecondaryLineGapElement,
    titleButtonMainLeftElement,
    titleButtonMainTopElement,
    titleButtonSecondaryLeftElement,
    titleButtonSecondaryTopElement,
    titleButtonIconVisibleElement,
    titleButtonIconButtonElement,
    titleButtonIconCopyElement,
    titleButtonIconMenuElement,
    titleButtonIconSearchElement,
    titleButtonIconOptionsElement,
    titleButtonIconColorElement,
    titleButtonIconSizeElement,
    titleButtonIconLeftElement,
    titleButtonIconTopElement,
    titleButtonFrameColorElement,
    titleButtonFrameVisibleElement,
    titleButtonFrameWidthElement,
    titleButtonFrameSizeElement,
    titleButtonFrameSpacingElement,
    titleButtonFrameOffsetXElement,
    titleButtonFrameOffsetYElement,
    titleButtonMarkerVisibleElement,
    titleButtonMarkerColorElement,
    titleButtonMarkerSizeElement,
    titleButtonMarkerLeftElement,
    titleButtonMarkerTopElement,
    titleButtonLeftElement,
    titleButtonTopElement,
    titleButtonWidthElement,
    titleButtonHeightElement,
    titleButtonScaleElement,
    titleButtonRotationElement,
    titleButtonActionControlsElement,
    titleButtonApplyStyleElement,
    titleButtonApplyCountElement,
    iconButtonInspectorElement,
    iconButtonTypeLabelElement,
    iconButtonTypeElement,
    iconButtonLabelElement,
    iconButtonEntityButtonElement,
    iconButtonEntityMenuElement,
    iconButtonEntitySearchElement,
    iconButtonEntityOptionsElement,
    iconButtonPreviewStateElement,
    iconButtonPreviewControlElement,
    iconButtonIconButtonElement,
    iconButtonIconCopyElement,
    iconButtonIconMenuElement,
    iconButtonIconSearchElement,
    iconButtonIconOptionsElement,
    iconButtonIconColorElement,
    iconButtonIconColorLabelElement,
    iconButtonIconSizeElement,
    iconButtonIconSizeLabelElement,
    iconButtonIconOffOpacityElement,
    iconButtonIconOnOpacityElement,
    iconButtonIconOffOpacityLabelElement,
    iconButtonIconOnOpacityLabelElement,
    iconButtonIconLeftElement,
    iconButtonIconTopElement,
    iconButtonMainTextElement,
    iconButtonSecondaryTextElement,
    iconButtonMainHeadingElement,
    iconButtonSecondaryHeadingElement,
    iconButtonMainContentLabelElement,
    iconButtonSecondaryContentLabelElement,
    iconButtonMainColorElement,
    iconButtonSecondaryColorElement,
    iconButtonMainOffOpacityElement,
    iconButtonMainOnOpacityElement,
    iconButtonSecondaryOffOpacityElement,
    iconButtonSecondaryOnOpacityElement,
    iconButtonMainOffOpacityLabelElement,
    iconButtonMainOnOpacityLabelElement,
    iconButtonSecondaryOffOpacityLabelElement,
    iconButtonSecondaryOnOpacityLabelElement,
    iconButtonMainSizeElement,
    iconButtonSecondarySizeElement,
    iconButtonMainWeightElement,
    iconButtonSecondaryWeightElement,
    iconButtonMainSpacingElement,
    iconButtonSecondarySpacingElement,
    iconButtonMainLeftElement,
    iconButtonMainTopElement,
    iconButtonSecondaryLeftElement,
    iconButtonSecondaryTopElement,
    iconButtonOnFillVisibleElement,
    iconButtonFillSectionElement,
    iconButtonOnFillColorElement,
    iconButtonOnFillStrengthElement,
    iconButtonOnFillFadeDurationElement,
    iconButtonFrameVisibleElement,
    iconButtonFrameSectionElement,
    iconButtonFrameWidthElement,
    iconButtonFrameAngleElement,
    iconButtonFrameOffOpacityElement,
    iconButtonFrameOnOpacityElement,
    iconButtonCutCornerElement,
    iconButtonSoftLightVisibleElement,
    iconButtonSoftLightSectionElement,
    iconButtonSoftLightColorElement,
    iconButtonSoftLightStrengthElement,
    iconButtonSoftLightSizeElement,
    iconButtonSoftLightAngleElement,
    iconButtonGlowVisibleElement,
    iconButtonGlowSectionElement,
    iconButtonGlowColorElement,
    iconButtonGlowStrengthElement,
    iconButtonGlowSizeElement,
    iconButtonGlowAngleElement,
    iconButtonLeftElement,
    iconButtonTopElement,
    iconButtonWidthElement,
    iconButtonHeightElement,
    iconButtonScaleElement,
    iconButtonRotationElement,
    iconButtonActionControlsElement,
    iconButtonActionSectionElement,
    iconButtonPreviewDetailsElement,
    iconButtonApplyStyleElement,
    iconButtonApplyCountElement,
    panelFrameInspectorFormElement,
    panelFrameTypeTextInputElement,
    panelFrameLabelTextInputElement,
    panelFrameMainVisibleButtonElement,
    panelFrameMainTextInputElement,
    panelFrameMainColorInputElement,
    panelFrameMainSizeInputElement,
    panelFrameMainWeightInputElement,
    panelFrameMainOpacityInputElement,
    panelFrameMainSpacingInputElement,
    panelFrameMainLeftInputElement,
    panelFrameMainTopInputElement,
    panelFrameSecondaryVisibleButtonElement,
    panelFrameSecondaryTextInputElement,
    panelFrameSecondaryColorInputElement,
    panelFrameSecondarySizeInputElement,
    panelFrameSecondaryWeightInputElement,
    panelFrameSecondaryOpacityInputElement,
    panelFrameSecondarySpacingInputElement,
    panelFrameSecondaryLeftInputElement,
    panelFrameSecondaryTopInputElement,
    panelFrameEdgeVisibleButtonElement,
    panelFrameEdgeColorInputElement,
    panelFrameEdgeWidthInputElement,
    panelFrameEdgeOpacityInputElement,
    panelFrameRadiusInputElement,
    panelFrameEdgeAngleInputElement,
    panelFrameGlowVisibleButtonElement,
    panelFrameGlowColorInputElement,
    panelFrameGlowStrengthInputElement,
    panelFrameGlowSizeInputElement,
    panelFrameGlowAngleInputElement,
    panelFrameLeftInputElement,
    panelFrameTopInputElement,
    panelFrameWidthInputElement,
    panelFrameHeightInputElement,
    panelFrameScaleInputElement,
    panelFrameRotationInputElement,
    panelFrameApplyStyleButtonElement,
    panelFrameApplyCountElement,
    navigationInspectorFormElement,
    navigationLabelTextInputElement,
    navigationTypeElement,
    navigationLabelElement,
    navigationPreviewStateElement,
    navigationEntityButtonElement,
    navigationEntityMenuElement,
    navigationEntitySearchElement,
    navigationEntityOptionsElement,
    navigationMainTextElement,
    navigationSecondaryTextElement,
    navigationMainVisibleElement,
    navigationSecondaryVisibleElement,
    navigationIconVisibleElement,
    navigationFrameVisibleElement,
    navigationGlowVisibleElement,
    navigationIconButtonElement,
    navigationIconCopyElement,
    navigationIconMenuElement,
    navigationIconSearchElement,
    navigationIconOptionsElement,
    navigationMainColorElement,
    navigationSecondaryColorElement,
    navigationMainSizeElement,
    navigationSecondarySizeElement,
    navigationMainWeightElement,
    navigationSecondaryWeightElement,
    navigationMainSpacingElement,
    navigationSecondarySpacingElement,
    navigationMainTextLeftElement,
    navigationMainTextTopElement,
    navigationSecondaryTextLeftElement,
    navigationSecondaryTextTopElement,
    navigationTextIdleOpacityElement,
    navigationTextActiveOpacityElement,
    navigationIconColorElement,
    navigationIconSizeElement,
    navigationIconLeftElement,
    navigationIconTopElement,
    navigationIconIdleOpacityElement,
    navigationIconActiveOpacityElement,
    navigationFrameColorElement,
    navigationFrameWidthElement,
    navigationFrameIdleOpacityElement,
    navigationFrameActiveOpacityElement,
    navigationFrameAngleElement,
    navigationGlowColorElement,
    navigationGlowAngleElement,
    navigationGlowIdleStrengthElement,
    navigationGlowIdleSizeElement,
    navigationGlowActiveStrengthElement,
    navigationGlowActiveSizeElement,
    navigationRadiusElement,
    navigationLeftElement,
    navigationTopElement,
    navigationWidthElement,
    navigationHeightElement,
    navigationScaleElement,
    navigationRotationElement,
    navigationActionControlsElement,
    navigationApplyStyleElement,
    navigationApplyCountElement,
    navigationStyleApplyDialogElement,
    navigationStyleApplyCloseElement,
    navigationStyleApplyTitleElement,
    navigationStyleApplySummaryElement,
    navigationStyleApplyPropertiesElement,
    navigationStyleApplyTargetHeadingElement,
    navigationStyleApplyTargetScopeElement,
    navigationStyleApplyTargetsElement,
    navigationStyleApplyMessageElement,
    navigationStyleApplyCancelElement,
    navigationStyleApplyConfirmElement,
  }
}

/**
 * 编辑器元素查询的类型契约。
 *
 * `findElement` 由 `lifecycle/boot.ts` 注入，包装的是 `document.querySelector` 一类的选择器
 * 查询（含少量 `querySelectorAll` 与派生映射）。元素的具体类型由各检视面板自己收窄，
 * 这里只声明「选择器 → 元素」这一层，避免在 5 个面板族文件 + 汇总入口里各写一遍同样的签名。
 */
export type ElementQuery = (selectorState: any) => any
