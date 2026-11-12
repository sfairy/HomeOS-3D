/*
 * 导航族检视面板：导航按钮 / 标题按钮 / 图标按钮 / 图标按钮（效果）/ 底图框。
 *
 * 由 `./editor-elements` 汇总为 `queryEditorElements`；本文件只负责这一族面板的
 * 元素查询，新增元素请加到对应族而不是汇总文件里。
 */
import type { ElementQuery } from './types'
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
