/* 导航与预览（导航预览、自动图表、空调/窗帘/日期/天气） */
import type { EditorContext } from "../editor-context";
import { removeComponent } from "../../editor-component-collections";
import { componentLabel as componentLabel2 } from "../../editor-component-collections";
import { roundField as roundField2, clone as clone2 } from "../../editor-utils";
import { timeComponentDimensions as timeComponentDimensions2, dateComponentDimensions as dateComponentDimensions2, weatherComponentDimensions as weatherComponentDimensions2 } from "../../component-templates";
import { entryStateEntry, navigationVisibilityComponentState, navigationVisibilityComponentValue, navigationPreviewClickComponentId } from "../../metadata/editor-navigation-style-metadata";
import { findComponent as findComponent2 } from "../../component-tree";

export interface NavigationPreviewDeps {
  editorCtx: EditorContext;
  airConditionerPreviewStateByComponentId: any;
  airflowSectionEvent: any;
  airflowSectionEventById: any;
  applyNavigationPreviewState: any;
  bindMessageSection: any;
  closeAutoDiagramDialog: any;
  collectPageImages: any;
  createImageAlignOption: any;
  currentPage: any;
  effectImageAlignConfirmElement: any;
  effectImageAlignDialogElement: any;
  effectImageAlignMessageElement: any;
  effectImageAlignOptionsElement: any;
  exportSpliceErrorByIdById: any;
  findAssetById: any;
  floorplanAutoDiagramDialogElement: any;
  floorplanAutoDiagramGuideElement: any;
  ibePreviewStateElement: any;
  iconButtonEffectPreviewStateByComponentId: any;
  iconButtonIconColorElement: any;
  iconButtonPreviewStateByComponentId: any;
  iconButtonPreviewStateElement: any;
  lineChartBaselineByComponentId: any;
  mutateDocument: any;
  navigationColorPropertiesByElement: any;
  navigationHeightElement: any;
  navigationLabelTextInputElement: any;
  navigationPreviewStateByComponentId: any;
  navigationPreviewStateElement: any;
  navigationPropertyConfigsByElement: any;
  navigationRotationElement: any;
  navigationScaleElement: any;
  navigationToggleStateByElement: any;
  navigationWidthElement: any;
  previewSyncEventName: any;
  removedComponent: any;
  runAltCopy: any;
  runExtraTwin: any;
  setNavigationPreviewState: any;
}

export function closeAutoDiagramDialog(deps: NavigationPreviewDeps) {
  (deps.floorplanAutoDiagramDialogElement.open && deps.floorplanAutoDiagramDialogElement.close(),
    (deps.floorplanAutoDiagramDialogElement.dataset.componentId = ""),
    (deps.floorplanAutoDiagramDialogElement.dataset.cancelRemovesComponent = "false"),
    (deps.floorplanAutoDiagramGuideElement.hidden = false));
}

export function settleAutoDiagramDialog(deps: NavigationPreviewDeps, 
  componentId: any,
  { cancelRemovesComponent: cancelRemovesComponentValue = false } = {},
) {
  componentId &&
    ((deps.floorplanAutoDiagramDialogElement.dataset.componentId = componentId),
    (deps.floorplanAutoDiagramDialogElement.dataset.cancelRemovesComponent = String(cancelRemovesComponentValue)),
    (deps.floorplanAutoDiagramGuideElement.hidden = false),
    deps.floorplanAutoDiagramDialogElement.open || deps.floorplanAutoDiagramDialogElement.showModal());
}

export function cancelRemoveDraftDocument(deps: NavigationPreviewDeps) {
  const componentId = deps.floorplanAutoDiagramDialogElement.dataset.componentId,
    shouldRemoveOnCancel =
      deps.floorplanAutoDiagramDialogElement.dataset.cancelRemovesComponent === "true";
  (deps.closeAutoDiagramDialog(),
    !(!shouldRemoveOnCancel || !componentId) &&
      (deps.editorCtx.selectedComponentIdsSet.delete(componentId),
      deps.editorCtx.selectedComponentId === componentId &&
        (deps.editorCtx.selectedComponentId = deps.editorCtx.selectedComponentIdsSet.values().next().value || null),
      deps.editorCtx.selectionAnchorComponentId === componentId &&
        (deps.editorCtx.selectionAnchorComponentId = deps.editorCtx.selectedComponentId),
      deps.mutateDocument((onFloorplanAutoDiagramOpenStudioButtonClick: any) => {
        removeComponent(onFloorplanAutoDiagramOpenStudioButtonClick, componentId);
      })));
}

export function bindMessageSection(deps: NavigationPreviewDeps) {
  const zr2 = deps.editorCtx.lightingPanelDragState;
  zr2 && ((deps.editorCtx.lightingPanelDragState = null), zr2.remove());
}

export function onWindowMessage(deps: NavigationPreviewDeps, 
  messageEvent: any,
  { buttonCount: effectButtonCount = 0, imageCount: generatedImageCount = 0 } = {},
) {
  deps.bindMessageSection();
  const isMessage = messageEvent?.overwritten === true,
    lightingStateComponentIdElement = document.createElement("div");
  ((lightingStateComponentIdElement.className = "floorplan-auto-diagram-complete-overlay"),
    lightingStateComponentIdElement.setAttribute("role", "dialog"),
    lightingStateComponentIdElement.setAttribute("aria-modal", "true"),
    lightingStateComponentIdElement.setAttribute(
      "aria-label",
      isMessage ? "导图覆盖完成" : "导图保存完成",
    ),
    (lightingStateComponentIdElement.innerHTML =
      '<section class="settings-dialog floorplan-auto-diagram-dialog floorplan-auto-diagram-complete-dialog" tabindex="-1"><div class="dialog-heading"><div><span>EXPORT COMPLETE</span><h2 data-export-complete-title></h2></div><button type="button" class="icon-button" data-export-complete-close aria-label="关闭导图完成提示">×</button></div>\n    <div class="floorplan-auto-diagram-guide">\n      <p data-export-complete-message></p>\n      <div class="export-notice-summary"><span>保存位置</span><strong data-export-complete-path></strong></div>\n      <div class="dialog-actions"><button type="button" class="primary" data-export-complete-confirm>完成</button></div>\n    </div></section>'),
    (lightingStateComponentIdElement.querySelector("[data-export-complete-title]")!.textContent =
      isMessage ? "导图覆盖完成" : "导图保存完成"),
    (lightingStateComponentIdElement.querySelector("[data-export-complete-message]")!.textContent =
      isMessage
        ? "新导图已安全替换，并更新 " + generatedImageCount + " 张图片和 " + effectButtonCount + " 个效果按钮。"
        : "导图已置入仪表盘，共生成 " + generatedImageCount + " 张图片和 " + effectButtonCount + " 个效果按钮。"),
    (lightingStateComponentIdElement.querySelector("[data-export-complete-path]")!.textContent =
      "data/" + (messageEvent?.relativePath || "exports")));
  let isMessageActive = false;
  const lightingStateComponentId = () => {
      isMessageActive ||
        ((isMessageActive = true),
        window.removeEventListener("pagehide", lightingStateComponentId),
        document.removeEventListener("keydown", lightingStateComponentIdHandler, true),
        lightingStateComponentIdElement.remove(),
        deps.editorCtx.lightingPanelDragState === lightingStateComponentIdElement &&
          (deps.editorCtx.lightingPanelDragState = null));
    },
    lightingStateComponentIdHandler = (lightingStateComponentIdState: any) => {
      lightingStateComponentIdState.key === "Escape" &&
        (lightingStateComponentIdState.preventDefault(), lightingStateComponentId());
    };
  lightingStateComponentIdElement.addEventListener("click", (onWindowMessageState) => {
    onWindowMessageState.target === lightingStateComponentIdElement && lightingStateComponentId();
  });
  for (const messageEventState of lightingStateComponentIdElement.querySelectorAll(
    "[data-export-complete-close], [data-export-complete-confirm]",
  ))
    messageEventState.addEventListener("click", lightingStateComponentId);
  (window.addEventListener("pagehide", lightingStateComponentId),
    document.addEventListener("keydown", lightingStateComponentIdHandler, true),
    (deps.editorCtx.lightingPanelDragState = lightingStateComponentIdElement),
    document.body.append(lightingStateComponentIdElement),
    lightingStateComponentIdElement.querySelector<HTMLElement>("[data-export-complete-confirm]")?.focus());
}

export function exportSpliceError(deps: NavigationPreviewDeps, bindIconButtonEffectSection: any) {
  const entryStateValue = deps.exportSpliceErrorByIdById.get(bindIconButtonEffectSection),
    entryStateConfig = deps.removedComponent();
  if (!(!entryStateValue || entryStateConfig?.type !== "icon-button-effect")) {
    (deps.iconButtonEffectPreviewStateByComponentId.set(entryStateConfig.id, entryStateValue),
      deps.editorCtx.editorRenderer?.setComponentPreviewState(entryStateConfig.id, entryStateValue));
    for (const onElementElement of deps.ibePreviewStateElement.querySelectorAll("[data-ibe-preview]")) {
      const isOnIconButtonEffectInspectorFormInput =
        onElementElement.dataset.ibePreview === entryStateValue;
      (onElementElement.classList.toggle("active", isOnIconButtonEffectInspectorFormInput),
        onElementElement.setAttribute(
          "aria-pressed",
          String(isOnIconButtonEffectInspectorFormInput),
        ));
    }
  }
}

export function collectPageImages(deps: NavigationPreviewDeps, pageSource: any) {
  const pageImages: any = [],
    collectImageComponents = (componentItems: any) => {
      for (const imageItem of componentItems || [])
        (imageItem.type === "image" && pageImages.push(imageItem),
          collectImageComponents(imageItem.children));
    };
  return (collectImageComponents(pageSource?.components), pageImages);
}

export function createImageAlignOption(deps: NavigationPreviewDeps, imageComponentOption: any, isChosenImage: any) {
  const optionLabelElement = document.createElement("label");
  optionLabelElement.className = "effect-image-align-option";
  const optionRadioElement = document.createElement("input");
  ((optionRadioElement.type = "radio"),
    (optionRadioElement.name = "effect-image-align-target"),
    (optionRadioElement.value = imageComponentOption.id),
    (optionRadioElement.checked = isChosenImage));
  const optionPreviewElement = document.createElement("span");
  optionPreviewElement.className = "effect-image-align-option-preview";
  const sn4 = deps.findAssetById(imageComponentOption.properties?.assetId || ""),
    kp2 = deps.runExtraTwin(sn4);
  if (kp2) {
    const optionPreviewImage = document.createElement("img");
    ((optionPreviewImage.src = kp2),
      (optionPreviewImage.alt = ""),
      optionPreviewElement.append(optionPreviewImage));
  } else optionPreviewElement.textContent = "无预览";
  const optionCopyElement = document.createElement("span");
  optionCopyElement.className = "effect-image-align-option-copy";
  const optionTitleElement = document.createElement("strong");
  optionTitleElement.textContent = componentLabel2(imageComponentOption);
  const optionLayoutElement = document.createElement("small"),
    isFillLayout = imageComponentOption.properties?.layoutMode === "fill",
    visibilityLabel = imageComponentOption.style?.visible === false ? "隐藏" : "显示",
    optionCanvasWidth = Number(deps.editorCtx.activeProject?.document?.canvas?.width || 2778),
    optionCanvasHeight = Number(deps.editorCtx.activeProject?.document?.canvas?.height || 1940),
    optionPosition = imageComponentOption.position || {},
    optionWidth = Number(optionPosition.width || 100),
    optionHeight = Number(optionPosition.height || 100),
    centerLeftPercent = roundField2(
      ((Number(optionPosition.x || 0) + optionWidth / 2) / optionCanvasWidth) * 100,
    ),
    centerTopPercent = roundField2(
      ((Number(optionPosition.y || 0) + optionHeight / 2) / optionCanvasHeight) * 100,
    ),
    optionScalePercent = roundField2(Number(imageComponentOption.style?.scale || 1) * 100),
    optionRotationDeg = roundField2(Number(optionPosition.rotation || 0));
  optionLayoutElement.textContent = isFillLayout
    ? "铺满 · 覆盖整个画布"
    : "自由 · 左 " + centerLeftPercent + "% · 上 " + centerTopPercent + "%";
  const optionDetailElement = document.createElement("small");
  return (
    (optionDetailElement.textContent = isFillLayout
      ? visibilityLabel
      : "缩放 " + optionScalePercent + "% · 旋转 " + optionRotationDeg + "° · " + visibilityLabel),
    optionCopyElement.append(optionTitleElement, optionLayoutElement, optionDetailElement),
    optionLabelElement.append(optionRadioElement, optionPreviewElement, optionCopyElement),
    optionLabelElement
  );
}

export function openImageAlignDialog(deps: NavigationPreviewDeps) {
  const alignableImages = deps.removedComponent(),
    ct5 = deps.currentPage();
  if (!alignableImages || alignableImages.type !== "icon-button-effect" || !ct5) return;
  const aI2 = deps.collectPageImages(ct5),
    referenceImageId = String(alignableImages.properties?.effectReferenceImageId || "");
  (deps.effectImageAlignOptionsElement.replaceChildren(
    ...aI2.map((alignDialogBackdropEvent: any, onEffectImageAlignDialogClose: any) =>
      deps.createImageAlignOption(
        alignDialogBackdropEvent,
        alignDialogBackdropEvent.id === referenceImageId ||
          (!referenceImageId && onEffectImageAlignDialogClose === 0),
      ),
    ),
  ),
    (deps.editorCtx.imageAlignSourceComponentId = alignableImages.id),
    (deps.effectImageAlignMessageElement.hidden = aI2.length > 0),
    (deps.effectImageAlignMessageElement.textContent = aI2.length
      ? ""
      : "本页面没有可以对齐的普通图片。"),
    (deps.effectImageAlignConfirmElement.disabled = aI2.length === 0),
    deps.effectImageAlignDialogElement.showModal());
}

export function applyAirConditionerPreviewState(deps: NavigationPreviewDeps, previewTargetComponentId: any, previewModeRequest = "auto") {
  if (!previewTargetComponentId) return;
  const resolvedPreviewMode = ["on", "off"].includes(previewModeRequest)
    ? previewModeRequest
    : "auto";
  (deps.airConditionerPreviewStateByComponentId.set(previewTargetComponentId, resolvedPreviewMode),
    deps.editorCtx.editorRenderer?.setComponentPreviewState(previewTargetComponentId, resolvedPreviewMode));
}

export function airflowSectionEvent(deps: NavigationPreviewDeps, activatePreviewForInput: any) {
  for (const previewInputElement of deps.iconButtonPreviewStateElement.querySelectorAll(
    "[data-icon-button-preview]",
  )) {
    const isPreviewOwnerComponent =
      previewInputElement.dataset.iconButtonPreview === activatePreviewForInput;
    (previewInputElement.classList.toggle("active", isPreviewOwnerComponent),
      previewInputElement.setAttribute("aria-pressed", String(isPreviewOwnerComponent)));
  }
}

export function previewSyncEventName(deps: NavigationPreviewDeps, onIconButtonInspectorForm: any, previewSyncEvent = "auto") {
  if (!onIconButtonInspectorForm) return;
  const onCoverSettingsKindClickState = ["on", "off"].includes(previewSyncEvent)
    ? previewSyncEvent
    : "auto";
  (onCoverSettingsKindClickState === "auto"
    ? deps.iconButtonPreviewStateByComponentId.delete(onIconButtonInspectorForm)
    : deps.iconButtonPreviewStateByComponentId.set(
        onIconButtonInspectorForm,
        onCoverSettingsKindClickState,
      ),
    deps.editorCtx.editorRenderer?.setComponentPreviewState(
      onIconButtonInspectorForm,
      onCoverSettingsKindClickState,
    ),
    onIconButtonInspectorForm === deps.editorCtx.selectedComponentId &&
      deps.airflowSectionEvent(onCoverSettingsKindClickState));
}

export function onCoverSettingsKindClick(deps: NavigationPreviewDeps, coverKindClickEvent: any) {
  const coverKindOption = deps.removedComponent(),
    requestedCoverKind =
      deps.airflowSectionEventById.get(coverKindClickEvent) ||
      (coverKindOption?.type === "device-button" &&
      coverKindClickEvent === deps.iconButtonIconColorElement
        ? "off"
        : null);
  !requestedCoverKind ||
    !["icon-button", "device-button", "presence-sensor"].includes(coverKindOption?.type) ||
    deps.previewSyncEventName(coverKindOption.id, requestedCoverKind);
}

export function coverKindDraftDocument(deps: NavigationPreviewDeps, colorInput: any) {
  const coverKindComponent = deps.removedComponent();
  (!deps.airflowSectionEventById.has(colorInput) &&
    !(
      coverKindComponent?.type === "device-button" && colorInput === deps.iconButtonIconColorElement
    )) ||
    (["icon-button", "device-button", "presence-sensor"].includes(coverKindComponent?.type) &&
      deps.previewSyncEventName(coverKindComponent.id, "auto"));
}

export function navigationSavedPropertyKey(deps: NavigationPreviewDeps, bindInspectorSection: any, onTimeInspectorFormInput: any) {
  const measuredBoundsSlot = Number(bindInspectorSection.position?.width || 100),
    measuredBoundsCase = Number(bindInspectorSection.position?.height || 100),
    onTimeInspectorFormInputState =
      Number(bindInspectorSection.position?.x || 0) + measuredBoundsSlot / 2,
    timeInputEventState = Number(bindInspectorSection.position?.y || 0) + measuredBoundsCase / 2,
    { width: timeInputEventValue, height: onTimeInspectorFormInputValue } =
      timeComponentDimensions2(onTimeInspectorFormInput);
  deps.editorCtx.editorRenderer?.previewComponentTransform(bindInspectorSection.id, {
    x: onTimeInspectorFormInputState - timeInputEventValue / 2,
    y: timeInputEventState - onTimeInspectorFormInputValue / 2,
    width: timeInputEventValue,
    height: onTimeInspectorFormInputValue,
  });
}

export function previewDateResize(deps: NavigationPreviewDeps, resizedDateComponent: any, dateDimensionProperties: any) {
  const dateWidth = Number(resizedDateComponent.position?.width || 100),
    dateHeight = Number(resizedDateComponent.position?.height || 100),
    dateCenterX = Number(resizedDateComponent.position?.x || 0) + dateWidth / 2,
    dateCenterY = Number(resizedDateComponent.position?.y || 0) + dateHeight / 2,
    { width: nextDateWidth, height: nextDateHeight } =
      dateComponentDimensions2(dateDimensionProperties);
  deps.editorCtx.editorRenderer?.previewComponentTransform(resizedDateComponent.id, {
    x: dateCenterX - nextDateWidth / 2,
    y: dateCenterY - nextDateHeight / 2,
    width: nextDateWidth,
    height: nextDateHeight,
  });
}

export function previewWeatherComponentResize(deps: NavigationPreviewDeps, weatherResizeComponent: any, weatherResizeProperties: any) {
  const weatherResizeWidth = Number(weatherResizeComponent.position?.width || 100),
    weatherResizeHeight = Number(weatherResizeComponent.position?.height || 100),
    weatherResizeCenterX = Number(weatherResizeComponent.position?.x || 0) + weatherResizeWidth / 2,
    weatherResizeCenterY =
      Number(weatherResizeComponent.position?.y || 0) + weatherResizeHeight / 2,
    { width: weatherResizeTargetWidth, height: weatherResizeTargetHeight } =
      weatherComponentDimensions2(weatherResizeProperties);
  deps.editorCtx.editorRenderer?.previewComponentTransform(weatherResizeComponent.id, {
    x: weatherResizeCenterX - weatherResizeTargetWidth / 2,
    y: weatherResizeCenterY - weatherResizeTargetHeight / 2,
    width: weatherResizeTargetWidth,
    height: weatherResizeTargetHeight,
  });
}

export function setNavigationPreviewState(deps: NavigationPreviewDeps, navigationPreviewState: any) {
  if (navigationPreviewState) {
    for (const navigationPreviewButton of deps.navigationPreviewStateElement.querySelectorAll(
      "[data-navigation-preview]",
    ))
      navigationPreviewButton.classList.toggle(
        "active",
        navigationPreviewButton.dataset.navigationPreview === navigationPreviewState,
      );
  }
}

export function applyNavigationPreviewState(deps: NavigationPreviewDeps, navigationPreviewComponentId: any, navigationPreviewStateValue: any) {
  if (!navigationPreviewComponentId) return;
  const navigationNormalizedPreviewState = ["on", "off"].includes(navigationPreviewStateValue)
    ? navigationPreviewStateValue
    : "auto";
  (navigationNormalizedPreviewState === "auto"
    ? deps.navigationPreviewStateByComponentId.delete(navigationPreviewComponentId)
    : deps.navigationPreviewStateByComponentId.set(
        navigationPreviewComponentId,
        navigationNormalizedPreviewState,
      ),
    deps.editorCtx.editorRenderer?.setComponentPreviewState(
      navigationPreviewComponentId,
      navigationNormalizedPreviewState,
    ),
    navigationPreviewComponentId === deps.editorCtx.selectedComponentId &&
      deps.setNavigationPreviewState(navigationNormalizedPreviewState));
}

export function syncNavigationPreviewFromElement(deps: NavigationPreviewDeps, navigationPreviewInputElement: any) {
  const navigationToggleState = deps.navigationToggleStateByElement.get(navigationPreviewInputElement),
    navigationPreviewComponent = deps.removedComponent();
  return !navigationToggleState || !deps.navigationLabelTextInputElement(navigationPreviewComponent)
    ? null
    : (deps.applyNavigationPreviewState(navigationPreviewComponent.id, navigationToggleState),
      navigationToggleState);
}

export function navigationPropertyNameFromElement(deps: NavigationPreviewDeps, navigationPropertyInputElement: any) {
  const navigationColorPropertyName = deps.navigationColorPropertiesByElement.get(
    navigationPropertyInputElement,
  );
  if (navigationColorPropertyName && (entryStateEntry as any)[navigationColorPropertyName])
    return navigationColorPropertyName;
  const navigationConfigPropertyName = deps.navigationPropertyConfigsByElement.get(
    navigationPropertyInputElement,
  )?.property;
  return navigationConfigPropertyName && (entryStateEntry as any)[navigationConfigPropertyName]
    ? navigationConfigPropertyName
    : navigationPropertyInputElement === deps.navigationWidthElement
      ? "width"
      : navigationPropertyInputElement === deps.navigationHeightElement
        ? "height"
        : navigationPropertyInputElement === deps.navigationScaleElement
          ? "scale"
          : navigationPropertyInputElement === deps.navigationRotationElement
            ? "rotation"
            : "";
}

export function resolveComponentStyleValue(deps: NavigationPreviewDeps, component: any, propertyKey: any) {
  if (component)
    return propertyKey === "width" || propertyKey === "height"
      ? Number(component.position?.[propertyKey] || 100)
      : propertyKey === "scale"
        ? Number(component.style?.scale || 1)
        : propertyKey === "rotation"
          ? Number(component.position?.rotation || 0)
          : (component.properties?.[propertyKey] ??
            clone2((navigationVisibilityComponentState as any)[propertyKey]));
}

export function collectChangedLineChartStyleKeys(deps: NavigationPreviewDeps, component: any) {
  if (!component || component.type !== "line-chart") return [];
  let navigationPreviousVisibility = deps.lineChartBaselineByComponentId.get(component.id);
  return (
    navigationPreviousVisibility ||
      ((navigationPreviousVisibility = clone2(
        findComponent2(deps.editorCtx.baselineDocument, component.id)?.component || component,
      )),
      deps.lineChartBaselineByComponentId.set(component.id, navigationPreviousVisibility)),
    Object.keys(navigationVisibilityComponentValue).filter(
      (navigationPreviousVisibilityState) =>
        JSON.stringify(deps.runAltCopy(component, navigationPreviousVisibilityState)) !==
        JSON.stringify(deps.runAltCopy(navigationPreviousVisibility, navigationPreviousVisibilityState)),
    )
  );
}

export function formatLineChartStyleValue(deps: NavigationPreviewDeps, 
  propertyKey: any,
  onNavigationPreviewStateClick: any,
  navigationPreviewClickEvent = deps.editorCtx.activeProject?.document,
) {
  if (typeof onNavigationPreviewStateClick == "boolean")
    return onNavigationPreviewStateClick ? "显示" : "隐藏";
  if (propertyKey === "width" || propertyKey === "height") {
    const navigationPreviewButtonElement = Number(
      navigationPreviewClickEvent?.canvas?.[propertyKey] ||
        (propertyKey === "width" ? 2778 : 1940),
    );
    return (
      roundField2(
        (Number(onNavigationPreviewStateClick || 0) / navigationPreviewButtonElement) * 100,
      ) + "%"
    );
  }
  return propertyKey === "scale"
    ? roundField2(Number(onNavigationPreviewStateClick || 0) * 100) + "%"
    : propertyKey === "rotation"
      ? roundField2(Number(onNavigationPreviewStateClick || 0)) + "°"
      : ["valueScale", "valueOffsetX", "valueOffsetY", "cornerRadius"].includes(propertyKey)
        ? roundField2(Number(onNavigationPreviewStateClick || 0)) + "%"
        : propertyKey === "updateInterval"
          ? roundField2(Number(onNavigationPreviewStateClick || 0)) + " 秒"
          : propertyKey === "hours"
            ? roundField2(Number(onNavigationPreviewStateClick || 0)) + " 小时"
            : propertyKey === "thresholds"
              ? (Array.isArray(onNavigationPreviewStateClick)
                  ? onNavigationPreviewStateClick.length
                  : 0) + " 段配色"
              : String(onNavigationPreviewStateClick ?? "");
}

export function resolveNavigationStyleValue(deps: NavigationPreviewDeps, component: any, propertyKey: any) {
  if (component)
    return propertyKey === "width" || propertyKey === "height"
      ? Number(component.position?.[propertyKey] || 100)
      : propertyKey === "scale"
        ? Number(component.style?.scale || 1)
        : propertyKey === "rotation"
          ? Number(component.position?.rotation || 0)
          : (component.properties?.[propertyKey] ??
            (navigationPreviewClickComponentId as any)[propertyKey]);
}

