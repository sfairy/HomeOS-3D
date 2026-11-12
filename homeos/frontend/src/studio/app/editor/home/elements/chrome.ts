/*
 * 工作区外壳：项目 / 页面 / 弹窗 / 组件列表 / 全局按钮与它们引起的对话框。
 *
 * 由 `./editor-elements` 汇总为 `queryEditorElements`；本文件只负责这一族面板的
 * 元素查询，新增元素请加到对应族而不是汇总文件里。
 */
import type { ElementQuery } from './types'
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
