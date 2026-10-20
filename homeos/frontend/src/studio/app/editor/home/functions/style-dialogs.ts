/* 样式对话框（样式应用弹窗、资源删除、复制备份） */
import type { EditorContext } from "../editor-context";
import { roundField as roundField2, clone as clone2 } from "../../editor-utils";
import { renderNavigationStyleApplyTargets as runVariantLowerCore, createNavigationStyleApplyOption } from "../../navigation-style-apply/target-options";
import { componentLabel as componentLabel2 } from "../../editor-component-collections";
import { entryStateEntry, navigationIconDraftDocumentConfig, navigationIconOptionLabels, navigationPreviewClickComponentIdState, styleSourceComponentIdState, onNavigationStyleApplyConfirmButtonClickValue, navigationVisibilityComponentValue } from "../../metadata/editor-navigation-style-metadata";
import { normalizeFlowLine as normalizeFlowLine2, FLOW_LINE_FIELDS as FLOW_LINE_FIELDS2 } from "../../../shared/flow-line-model";
import { renderPagedPickerDialog } from "../../copy-backup/run-copy-backup";

export interface StyleDialogsDeps {
  editorCtx: EditorContext;
  appliedStylePropertyKey: any;
  applyInspectorDimensionChange: any;
  entryStateRecord: any;
  findReplaceableComponents: any;
  handleOperationError: any;
  hideAssetLargePreview: any;
  imageAssetLargePreviewImageElement: any;
  navigationButtonSavedSettingsByComponentId: any;
  navigationIconCopyError: any;
  navigationLabelTextInputElement: any;
  navigationStyleApplyDialogElement: any;
  navigationStyleApplyMessageElement: any;
  navigationStyleApplyPropertiesElement: any;
  navigationStyleApplySummaryElement: any;
  navigationStyleApplyTargetDeps: any;
  navigationStyleApplyTargetHeadingElement: any;
  navigationStyleApplyTargetScopeElement: any;
  navigationStyleApplyTitleElement: any;
  onAssetOptionsClick: any;
  onDeleteAssetCancelButtonClick: any;
  onImageAssetFolderSelectChange: any;
  onNavigationIconCopyButtonClick: any;
  onNavigationStyleApplyCancelButtonClick: any;
  onNavigationStyleApplyConfirmButtonClick: any;
  removedComponent: any;
  runAltBackup: any;
  runAltCopy: any;
  runAltFirst: any;
  runAltLeft: any;
  runAltNew: any;
  runAltOuter: any;
  runAltPeer: any;
  runAltTwin: any;
  runAuxAlt: any;
  runAuxInner: any;
  runAuxLower: any;
  runAuxOld: any;
  runAuxRight: any;
  runAuxTwin: any;
  runAuxVariant: any;
  runCopyBackupDeps: any;
  runCopyFallback: any;
  runExtraLocal: any;
  runShadow: any;
  runVariantAux: any;
  runVariantExtra: any;
  runVariantFallback: any;
  runVariantLower: any;
  runVariantTwin: any;
  styleTargetCheckbox: any;
}

export function collectPendingNavigationStyleKeys(deps: StyleDialogsDeps, component: any) {
  return (
    deps.onAssetOptionsClick(component),
    [...(deps.navigationButtonSavedSettingsByComponentId.get(component?.id)?.entries() || [])]
      .filter(
        ([filteredItemsRecord, filteredItemsName]) =>
          !deps.runVariantFallback(
            deps.entryStateRecord(component, filteredItemsRecord),
            filteredItemsName,
          ),
      )
      .map(([onDeleteAssetCloseButtonClick]) => onDeleteAssetCloseButtonClick)
  );
}

export function onDeleteAssetCancelButtonClick(deps: StyleDialogsDeps, 
  onDeleteAssetDialogClick: any,
  deleteAssetDialogClickEvent: any,
  onDeleteAssetConfirmButtonClick = deps.editorCtx.activeProject?.document,
) {
  if (typeof deleteAssetDialogClickEvent == "boolean")
    return deleteAssetDialogClickEvent ? "显示" : "隐藏";
  if (onDeleteAssetDialogClick === "width" || onDeleteAssetDialogClick === "height") {
    const deleteAssetRequestId = Number(
      onDeleteAssetConfirmButtonClick?.canvas?.[onDeleteAssetDialogClick] ||
        (onDeleteAssetDialogClick === "width" ? 2778 : 1940),
    );
    return (
      roundField2((Number(deleteAssetDialogClickEvent || 0) / deleteAssetRequestId) * 100) + "%"
    );
  }
  return onDeleteAssetDialogClick === "scale"
    ? roundField2(Number(deleteAssetDialogClickEvent || 0) * 100) + "%"
    : onDeleteAssetDialogClick === "rotation"
      ? roundField2(Number(deleteAssetDialogClickEvent || 0)) + "°"
      : [
            "textIdleOpacity",
            "textActiveOpacity",
            "iconIdleOpacity",
            "iconActiveOpacity",
            "frameIdleOpacity",
            "frameActiveOpacity",
            "radius",
            "glowIdleStrength",
            "glowIdleSize",
            "glowActiveStrength",
            "glowActiveSize",
          ].includes(onDeleteAssetDialogClick)
        ? roundField2(Number(deleteAssetDialogClickEvent || 0) * 100) + "%"
        : [
              "mainTextLeft",
              "mainTextTop",
              "secondaryTextLeft",
              "secondaryTextTop",
              "iconLeft",
              "iconTop",
            ].includes(onDeleteAssetDialogClick)
          ? roundField2(Number(deleteAssetDialogClickEvent || 0)) + "%"
          : onDeleteAssetDialogClick === "frameAngle" || onDeleteAssetDialogClick === "glowAngle"
            ? roundField2(Number(deleteAssetDialogClickEvent || 0)) + "°"
            : String(deleteAssetDialogClickEvent ?? "");
}

export function applyNavigationStyleToTargets(deps: StyleDialogsDeps, targets: any, formatDetail: any) {
  return runVariantLowerCore(deps.navigationStyleApplyTargetDeps(), targets, formatDetail);
}

export function openNavigationStyleApplyDialog(deps: StyleDialogsDeps) {
  const createdInstanceName = deps.removedComponent();
  if (!deps.navigationLabelTextInputElement(createdInstanceName)) return;
  const mC2 = deps.runVariantTwin(createdInstanceName),
    styleFeedbackTimeoutIdValue = deps.findReplaceableComponents(createdInstanceName);
  !mC2.length ||
    !styleFeedbackTimeoutIdValue.length ||
    ((deps.navigationStyleApplyTitleElement.textContent =
      createdInstanceName.type === "scene-mode" ? "应用情景模式设置" : "应用导航按钮设置"),
    (deps.navigationStyleApplyTargetHeadingElement.textContent =
      createdInstanceName.type === "scene-mode" ? "应用到情景模式" : "应用到导航按钮"),
    (deps.navigationStyleApplyTargetScopeElement.textContent = "按区域与页面区分"),
    (deps.navigationStyleApplySummaryElement.textContent =
      "将“" +
      componentLabel2(createdInstanceName) +
      "”中选定的修改应用到选中的" +
      (createdInstanceName.type === "scene-mode" ? "情景模式" : "导航按钮") +
      "。图标名称、文字内容、目标页面、备注和位置不会改变。"),
    deps.navigationStyleApplyPropertiesElement.replaceChildren(
      ...mC2.map((deleteAssetFolderError: any) => {
        const isNavigationIconMenuHidden = (entryStateEntry as any)[deleteAssetFolderError],
          $e8 = deps.entryStateRecord(createdInstanceName, deleteAssetFolderError);
        return createNavigationStyleApplyOption({
          value: deleteAssetFolderError,
          label: isNavigationIconMenuHidden.label,
          detail:
            isNavigationIconMenuHidden.group +
            " · " +
            deps.onDeleteAssetCancelButtonClick(deleteAssetFolderError, $e8),
        });
      }),
    ),
    deps.runVariantLower(styleFeedbackTimeoutIdValue, (onImageAssetButtonClick: any) => {
      const isImageAssetMenuHidden =
          onImageAssetButtonClick.properties?.targetPage ||
          onImageAssetButtonClick.actions?.tap?.target ||
          "",
        imageAssetCatalogErrorState = deps.editorCtx.activeProject.document.pages.find(
          (imageAssetCatalogError: any) => imageAssetCatalogError.path === isImageAssetMenuHidden,
        );
      return createdInstanceName.type === "scene-mode"
        ? onImageAssetButtonClick.bindings?.entity?.entityId || "未绑定实体"
        : imageAssetCatalogErrorState
          ? "跳转到：" + imageAssetCatalogErrorState.name
          : "未设置目标页面";
    }),
    (deps.navigationStyleApplyMessageElement.hidden = true),
    (deps.navigationStyleApplyMessageElement.textContent = ""),
    (deps.editorCtx.appliedStyleRecord = {
      sourceId: createdInstanceName.id,
      type: createdInstanceName.type,
    }),
    deps.navigationStyleApplyDialogElement.showModal());
}

export function onImageAssetFolderSelectChange(deps: StyleDialogsDeps, 
  onImageAssetSearchInputInput: any,
  onImageAssetOptionsPointerover: any,
) {
  return typeof onImageAssetOptionsPointerover == "boolean"
    ? onImageAssetSearchInputInput === "animated"
      ? onImageAssetOptionsPointerover
        ? "开启"
        : "关闭"
      : onImageAssetOptionsPointerover
        ? "显示"
        : "隐藏"
    : onImageAssetSearchInputInput === "effect"
      ? onImageAssetOptionsPointerover === "energy"
        ? "能量"
        : "水流"
      : onImageAssetSearchInputInput === "shape"
        ? ({
            straight: "折线",
            rounded: "圆角",
            curve: "曲线",
          } as any)[onImageAssetOptionsPointerover]
        : onImageAssetSearchInputInput === "direction"
          ? onImageAssetOptionsPointerover === -1
            ? "反向"
            : "正向"
          : onImageAssetSearchInputInput === "opacity" ||
              onImageAssetSearchInputInput === "baseOpacity"
            ? roundField2(onImageAssetOptionsPointerover * 100) + "%"
            : onImageAssetSearchInputInput === "glow"
              ? onImageAssetOptionsPointerover + "%"
              : String(onImageAssetOptionsPointerover);
}

export function imageAssetPointerOverEvent(deps: StyleDialogsDeps) {
  const imageAssetHoverElement = deps.removedComponent();
  if (imageAssetHoverElement?.type !== "flow-line") return;
  const im2 = deps.runExtraLocal(imageAssetHoverElement),
    pe2 = deps.findReplaceableComponents(imageAssetHoverElement);
  if (!im2.length || !pe2.length) return;
  const hoveredAsset = normalizeFlowLine2(imageAssetHoverElement.properties);
  ((deps.navigationStyleApplyTitleElement.textContent = "应用流水线条设置"),
    (deps.navigationStyleApplyTargetHeadingElement.textContent = "应用到流水线条"),
    (deps.navigationStyleApplyTargetScopeElement.textContent = "按区域与页面区分"),
    (deps.navigationStyleApplySummaryElement.textContent =
      "将“" +
      componentLabel2(imageAssetHoverElement) +
      "”的选定外观修改应用到同类控件。每条线的路径、名称和位置保持各自设置。"),
    deps.navigationStyleApplyPropertiesElement.replaceChildren(
      ...im2.map((onImageAssetOptionsClick: any) =>
        createNavigationStyleApplyOption({
          value: onImageAssetOptionsClick,
          label: (FLOW_LINE_FIELDS2 as any)[onImageAssetOptionsClick],
          detail: deps.onImageAssetFolderSelectChange(
            onImageAssetOptionsClick,
            (hoveredAsset as any)[onImageAssetOptionsClick],
          ),
        }),
      ),
    ),
    deps.runVariantLower(pe2, "流水线条"),
    (deps.navigationStyleApplyMessageElement.hidden = true),
    (deps.editorCtx.appliedStyleRecord = {
      sourceId: imageAssetHoverElement.id,
      type: "flow-line",
    }),
    deps.navigationStyleApplyDialogElement.showModal());
}

export function imageAssetClickEvent(deps: StyleDialogsDeps) {
  const imageAssetElement = deps.removedComponent();
  if (!imageAssetElement || imageAssetElement.type !== "panel-frame") return;
  const pC2 = deps.runVariantExtra(imageAssetElement),
    pe3 = deps.findReplaceableComponents(imageAssetElement);
  !pC2.length ||
    !pe3.length ||
    ((deps.navigationStyleApplyTitleElement.textContent = "应用底图框设置"),
    (deps.navigationStyleApplyTargetHeadingElement.textContent = "应用到底图框"),
    (deps.navigationStyleApplyTargetScopeElement.textContent = "按区域与页面区分"),
    (deps.navigationStyleApplySummaryElement.textContent =
      "将“" +
      componentLabel2(imageAssetElement) +
      "”中选定的修改应用到选中的底图框。文字内容、备注和位置不会改变。"),
    deps.navigationStyleApplyPropertiesElement.replaceChildren(
      ...pC2.map((mappedItemsOrigin: any) => {
        const imageAssetComponentId = (navigationIconDraftDocumentConfig as any)[mappedItemsOrigin],
          kl2 = deps.runAuxOld(imageAssetElement, mappedItemsOrigin);
        return createNavigationStyleApplyOption({
          value: mappedItemsOrigin,
          label: imageAssetComponentId.label,
          detail: imageAssetComponentId.group + " · " + deps.runVariantAux(mappedItemsOrigin, kl2),
        });
      }),
    ),
    deps.runVariantLower(pe3, "底图框"),
    (deps.navigationStyleApplyMessageElement.hidden = true),
    (deps.navigationStyleApplyMessageElement.textContent = ""),
    (deps.editorCtx.appliedStyleRecord = {
      sourceId: imageAssetElement.id,
      type: "panel-frame",
    }),
    deps.navigationStyleApplyDialogElement.showModal());
}

export function openCameraStyleApplyDialog(deps: StyleDialogsDeps) {
  const createdInstanceKey = deps.removedComponent();
  if (!createdInstanceKey || createdInstanceKey.type !== "camera") return;
  const tC2 = deps.runAuxLower(createdInstanceKey),
    pe4 = deps.findReplaceableComponents(createdInstanceKey);
  !tC2.length ||
    !pe4.length ||
    ((deps.navigationStyleApplyTitleElement.textContent = "应用摄像头实时预览设置"),
    (deps.navigationStyleApplyTargetHeadingElement.textContent = "应用到摄像头实时预览"),
    (deps.navigationStyleApplyTargetScopeElement.textContent = "按区域与页面区分"),
    (deps.navigationStyleApplySummaryElement.textContent =
      "将“" +
      componentLabel2(createdInstanceKey) +
      "”中选定的修改应用到选中的摄像头实时预览。实体、备注、动作和控件位置不会改变。"),
    deps.navigationStyleApplyPropertiesElement.replaceChildren(
      ...tC2.map((mappedItemsDraft: any) => {
        const imageAssetId = (navigationIconOptionLabels as any)[mappedItemsDraft],
          pl2 = deps.runAuxInner(createdInstanceKey, mappedItemsDraft);
        return createNavigationStyleApplyOption({
          value: mappedItemsDraft,
          label: imageAssetId.label,
          detail: imageAssetId.group + " · " + deps.runAuxRight(mappedItemsDraft, pl2),
        });
      }),
    ),
    deps.runVariantLower(pe4, "摄像头实时预览"),
    (deps.navigationStyleApplyMessageElement.hidden = true),
    (deps.navigationStyleApplyMessageElement.textContent = ""),
    (deps.editorCtx.appliedStyleRecord = {
      sourceId: createdInstanceKey.id,
      type: "camera",
    }),
    deps.navigationStyleApplyDialogElement.showModal());
}

export function openTitleButtonStyleApplyDialog(deps: StyleDialogsDeps) {
  const createdInstancePath = deps.removedComponent();
  if (!createdInstancePath || createdInstancePath.type !== "title-button") return;
  const wC2 = deps.runAltOuter(createdInstancePath),
    pe5 = deps.findReplaceableComponents(createdInstancePath);
  !wC2.length ||
    !pe5.length ||
    ((deps.navigationStyleApplyTitleElement.textContent = "应用标题按钮设置"),
    (deps.navigationStyleApplyTargetHeadingElement.textContent = "应用到标题按钮"),
    (deps.navigationStyleApplyTargetScopeElement.textContent = "按区域与页面区分"),
    (deps.navigationStyleApplySummaryElement.textContent =
      "将“" +
      componentLabel2(createdInstancePath) +
      "”中选定的修改应用到选中的标题按钮。文字内容、图标名称、备注、动作和控件中心位置不会改变。"),
    deps.navigationStyleApplyPropertiesElement.replaceChildren(
      ...wC2.map((imageAssetDraftDocument: any) => {
        const imageAssetComponent = (navigationPreviewClickComponentIdState as any)[imageAssetDraftDocument],
          ll2 = deps.runAltPeer(createdInstancePath, imageAssetDraftDocument);
        return createNavigationStyleApplyOption({
          value: imageAssetDraftDocument,
          label: imageAssetComponent.label,
          detail:
            imageAssetComponent.group +
            " · " +
            deps.onNavigationStyleApplyCancelButtonClick(imageAssetDraftDocument, ll2),
        });
      }),
    ),
    deps.runVariantLower(pe5, "标题按钮"),
    (deps.navigationStyleApplyMessageElement.hidden = true),
    (deps.navigationStyleApplyMessageElement.textContent = ""),
    (deps.editorCtx.appliedStyleRecord = {
      sourceId: createdInstancePath.id,
      type: "title-button",
    }),
    deps.navigationStyleApplyDialogElement.showModal());
}

export function openIconButtonEffectStyleApplyDialog(deps: StyleDialogsDeps) {
  const imageAssetRecord = deps.removedComponent();
  if (!imageAssetRecord || imageAssetRecord.type !== "icon-button-effect") return;
  const nC2 = deps.runAuxAlt(imageAssetRecord),
    pe6 = deps.findReplaceableComponents(imageAssetRecord);
  !nC2.length ||
    !pe6.length ||
    ((deps.navigationStyleApplyTitleElement.textContent = "应用图标按钮（效果）设置"),
    (deps.navigationStyleApplyTargetHeadingElement.textContent = "应用到同类型控件"),
    (deps.navigationStyleApplyTargetScopeElement.textContent = "按区域与页面区分"),
    (deps.navigationStyleApplySummaryElement.textContent =
      "将“" +
      componentLabel2(imageAssetRecord) +
      "”中选定的修改应用到选中的图标按钮（效果）。实体、备注、动作和按钮位置不会改变。"),
    deps.navigationStyleApplyPropertiesElement.replaceChildren(
      ...nC2.map((mappedItemsSnapshot: any) => {
        const imageAssetSize = (styleSourceComponentIdState as any)[mappedItemsSnapshot],
          tl2 = deps.runAltNew(imageAssetRecord, mappedItemsSnapshot);
        return createNavigationStyleApplyOption({
          value: mappedItemsSnapshot,
          label: imageAssetSize.label,
          detail: imageAssetSize.group + " · " + deps.runAuxVariant(mappedItemsSnapshot, tl2),
        });
      }),
    ),
    deps.runVariantLower(pe6, "图标按钮（效果）"),
    (deps.navigationStyleApplyMessageElement.hidden = true),
    (deps.navigationStyleApplyMessageElement.textContent = ""),
    (deps.editorCtx.appliedStyleRecord = {
      sourceId: imageAssetRecord.id,
      type: "icon-button-effect",
    }),
    deps.navigationStyleApplyDialogElement.showModal());
}

export function openAirConditionerStyleApplyDialog(deps: StyleDialogsDeps) {
  const createdInstanceText = deps.removedComponent();
  if (!createdInstanceText || createdInstanceText.type !== "air-conditioner") return;
  const sC2 = deps.runAltLeft(createdInstanceText),
    pe7 = deps.findReplaceableComponents(createdInstanceText);
  !sC2.length ||
    !pe7.length ||
    ((deps.navigationStyleApplyTitleElement.textContent = "应用空调设置"),
    (deps.navigationStyleApplyTargetHeadingElement.textContent = "应用到同类型控件"),
    (deps.navigationStyleApplyTargetScopeElement.textContent = "按区域与页面区分"),
    (deps.navigationStyleApplySummaryElement.textContent =
      "将“" +
      componentLabel2(createdInstanceText) +
      "”中选定的修改应用到选中的空调控件。实体、备注、文字内容、动作和按钮位置不会改变。"),
    deps.navigationStyleApplyPropertiesElement.replaceChildren(
      ...sC2.map((imageAssetSizeDraftDocument: any) => {
        const imageAssetSizeComponent =
            (onNavigationStyleApplyConfirmButtonClickValue as any)[imageAssetSizeDraftDocument],
          il3 = deps.onNavigationStyleApplyConfirmButtonClick(
            createdInstanceText,
            imageAssetSizeDraftDocument,
          );
        return createNavigationStyleApplyOption({
          value: imageAssetSizeDraftDocument,
          label: imageAssetSizeComponent.label,
          detail:
            imageAssetSizeComponent.group + " · " + deps.runAltFirst(imageAssetSizeDraftDocument, il3),
        });
      }),
    ),
    deps.runVariantLower(pe7, "空调"),
    (deps.navigationStyleApplyMessageElement.hidden = true),
    (deps.navigationStyleApplyMessageElement.textContent = ""),
    (deps.editorCtx.appliedStyleRecord = {
      sourceId: createdInstanceText.id,
      type: "air-conditioner",
    }),
    deps.navigationStyleApplyDialogElement.showModal());
}

export function openIconButtonStyleApplyDialog(deps: StyleDialogsDeps) {
  const createdInstanceCount = deps.removedComponent();
  if (
    !createdInstanceCount ||
    !["icon-button", "device-button", "presence-sensor"].includes(createdInstanceCount.type)
  )
    return;
  const fI2 =
      createdInstanceCount.type === "presence-sensor"
        ? deps.runAuxTwin(createdInstanceCount)
        : createdInstanceCount.type === "device-button"
          ? "设备按钮"
          : "图标按钮",
    eC2 = deps.appliedStylePropertyKey(createdInstanceCount),
    pe8 = deps.findReplaceableComponents(createdInstanceCount);
  !eC2.length ||
    !pe8.length ||
    ((deps.navigationStyleApplyTitleElement.textContent = "应用" + fI2 + "设置"),
    (deps.navigationStyleApplyTargetHeadingElement.textContent = "应用到同类型控件"),
    (deps.navigationStyleApplyTargetScopeElement.textContent = "按区域与页面区分"),
    (deps.navigationStyleApplySummaryElement.textContent =
      "将“" +
      componentLabel2(createdInstanceCount) +
      "”中选定的修改应用到选中的" +
      fI2 +
      "。实体、备注、图标名称、文字内容和位置不会改变。"),
    deps.navigationStyleApplyPropertiesElement.replaceChildren(
      ...eC2.map((mappedItemsSample: any) => {
        const zI2 = deps.onNavigationIconCopyButtonClick(createdInstanceCount, mappedItemsSample),
          al2 = deps.styleTargetCheckbox(createdInstanceCount, mappedItemsSample);
        return createNavigationStyleApplyOption({
          value: mappedItemsSample,
          label: zI2.label,
          detail: zI2.group + " · " + deps.navigationIconCopyError(mappedItemsSample, al2),
        });
      }),
    ),
    deps.runVariantLower(pe8, fI2),
    (deps.navigationStyleApplyMessageElement.hidden = true),
    (deps.navigationStyleApplyMessageElement.textContent = ""),
    (deps.editorCtx.appliedStyleRecord = {
      sourceId: createdInstanceCount.id,
      type: createdInstanceCount.type,
    }),
    deps.navigationStyleApplyDialogElement.showModal());
}

export function imageAssetMeasureError(deps: StyleDialogsDeps) {
  const createdInstanceIndex = deps.removedComponent();
  if (!createdInstanceIndex || createdInstanceIndex.type !== "line-chart") return;
  const yC2 = deps.runAltBackup(createdInstanceIndex),
    pe9 = deps.findReplaceableComponents(createdInstanceIndex);
  !yC2.length ||
    !pe9.length ||
    ((deps.navigationStyleApplyTitleElement.textContent = "应用折线图设置"),
    (deps.navigationStyleApplyTargetHeadingElement.textContent = "应用到折线图"),
    (deps.navigationStyleApplyTargetScopeElement.textContent = "按区域与页面区分"),
    (deps.navigationStyleApplySummaryElement.textContent =
      "将“" +
      componentLabel2(createdInstanceIndex) +
      "”中选定的修改应用到选中的折线图。数值实体、备注、动作和位置不会改变。"),
    deps.navigationStyleApplyPropertiesElement.replaceChildren(
      ...yC2.map((onIconButtonEffectAssetButtonClick: any) => {
        const isEffectAssetMenuHidden =
            (navigationVisibilityComponentValue as any)[onIconButtonEffectAssetButtonClick],
          el2 = deps.runAltCopy(createdInstanceIndex, onIconButtonEffectAssetButtonClick);
        return createNavigationStyleApplyOption({
          value: onIconButtonEffectAssetButtonClick,
          label: isEffectAssetMenuHidden.label,
          detail:
            isEffectAssetMenuHidden.group +
            " · " +
            deps.runAltTwin(onIconButtonEffectAssetButtonClick, el2),
        });
      }),
    ),
    deps.runVariantLower(
      pe9,
      (effectAssetCatalogError: any) =>
        effectAssetCatalogError.bindings?.entity?.entityId || "未设置数值实体",
    ),
    (deps.navigationStyleApplyMessageElement.hidden = true),
    (deps.navigationStyleApplyMessageElement.textContent = ""),
    (deps.editorCtx.appliedStyleRecord = {
      sourceId: createdInstanceIndex.id,
      type: "line-chart",
    }),
    deps.navigationStyleApplyDialogElement.showModal());
}

export function applyInspectorDimensionChange(deps: StyleDialogsDeps, 
  nextValue: any,
  target: any,
  dimension: string,
) {
  const next = clone2(nextValue);
  if (dimension === "width") {
    const centerX =
      Number(target.position?.x || 0) + Number(target.position?.width || 100) / 2;
    target.position = {
      ...(target.position || {}),
      x: centerX - Number(next) / 2,
      width: Number(next),
    };
    return;
  }
  if (dimension === "height") {
    const centerY =
      Number(target.position?.y || 0) + Number(target.position?.height || 100) / 2;
    target.position = {
      ...(target.position || {}),
      y: centerY - Number(next) / 2,
      height: Number(next),
    };
    return;
  }
  if (dimension === "scale") {
    target.style = {
      ...(target.style || {}),
      scale: Number(next),
    };
    return;
  }
  if (dimension === "rotation") {
    target.position = {
      ...(target.position || {}),
      rotation: Number(next),
    };
    return;
  }
  target.properties = {
    ...(target.properties || {}),
    [dimension]: next,
  };
}

export function onIconButtonEffectAssetFolderSelectChange(deps: StyleDialogsDeps, 
  onIconButtonEffectAssetSearchInputInput: any,
  onIconButtonEffectAssetOptionsPointerover: any,
  effectAssetPointerOverEvent: any,
) {
  deps.applyInspectorDimensionChange(
    deps.entryStateRecord(onIconButtonEffectAssetSearchInputInput, effectAssetPointerOverEvent),
    onIconButtonEffectAssetOptionsPointerover, effectAssetPointerOverEvent);
}

export function applyEffectAssetDimensionChange(deps: StyleDialogsDeps, component: any, onIconButtonEffectAssetOptionsClick: any, effectAssetClickEvent: any) {
  deps.applyInspectorDimensionChange(deps.runAuxOld(component, effectAssetClickEvent), onIconButtonEffectAssetOptionsClick, effectAssetClickEvent);
}

export function applyCameraDimensionChange(deps: StyleDialogsDeps, component: any, effectAssetMeasureError: any, effectAssetDraftDocument: any) {
  deps.applyInspectorDimensionChange(deps.runAuxInner(component, effectAssetDraftDocument), effectAssetMeasureError, effectAssetDraftDocument);
}

export function applyLineChartDimensionChange(deps: StyleDialogsDeps, onUndoButtonClick: any, onRedoButtonClick: any, onRecoveryRestoreButtonClick: any) {
  deps.applyInspectorDimensionChange(
    deps.runAltCopy(onUndoButtonClick, onRecoveryRestoreButtonClick),
    onRedoButtonClick, onRecoveryRestoreButtonClick);
}

export function recoveredComponentId(deps: StyleDialogsDeps, 
  onRecoveryDiscardButtonClick: any,
  onRecoveryDialogCancel: any,
  recoveryCancelEvent: any,
) {
  deps.applyInspectorDimensionChange(
    deps.runAltNew(onRecoveryDiscardButtonClick, recoveryCancelEvent),
    onRecoveryDialogCancel, recoveryCancelEvent);
}

export function onErrorDialogCloseButtonClick(deps: StyleDialogsDeps, 
  onErrorDialogConfirmButtonClick: any,
  onErrorDialogClick: any,
  errorDialogClickEvent: any,
) {
  deps.applyInspectorDimensionChange(
    deps.runAltPeer(onErrorDialogConfirmButtonClick, errorDialogClickEvent),
    onErrorDialogClick, errorDialogClickEvent);
}

export function onShowSharedComponentsButtonClick(deps: StyleDialogsDeps, 
  onShowPageComponentsButtonClick: any,
  onAddComponentButtonClick: any,
  onComponentTemplateCloseButtonClick: any,
) {
  deps.applyInspectorDimensionChange(
    deps.styleTargetCheckbox(onShowPageComponentsButtonClick, onComponentTemplateCloseButtonClick),
    onAddComponentButtonClick, onComponentTemplateCloseButtonClick);
}

export function onComponentTemplateDialogClick(deps: StyleDialogsDeps, 
  templateDialogClickEvent: any,
  onComponentTemplateListClick: any,
  templateListClickEvent: any,
) {
  deps.applyInspectorDimensionChange(
    deps.onNavigationStyleApplyConfirmButtonClick(templateDialogClickEvent, templateListClickEvent),
    onComponentTemplateListClick, templateListClickEvent);
}

export function closePopupRenameDialog(deps: StyleDialogsDeps) {
  deps.editorCtx.popupBeingRenamedValue?.close();
}

export function createCopyBackupDeps(deps: StyleDialogsDeps) {
  return ({
    get runCopyFallback() {
      return deps.runCopyFallback;
    },
    get runShadow() {
      return deps.runShadow;
    },
    get imageAssetLargePreviewImageElement() {
      return deps.imageAssetLargePreviewImageElement;
    },
    get popupBeingRenamedValue() {
      return deps.editorCtx.popupBeingRenamedValue;
    },
    set popupBeingRenamedValue(value) {
      deps.editorCtx.popupBeingRenamedValue = value;
    },
    get hideAssetLargePreview() {
      return deps.hideAssetLargePreview;
    },
    get handleOperationError() {
      return deps.handleOperationError;
    },
  });
}

export function renderCopyBackupDialog(deps: StyleDialogsDeps, { kind: popupBeingRenamedConfig, title: popupBeingRenamedRef, subtitle: popupBeingRenamedEntry = "", searchPlaceholder: popupBeingRenamedRecord, triggerButton: popupBeingRenamedName, pageSize: recoveredComponentIdState, initialPage: initialPageNumber = 1, selectedText: selectedTextValue = "", emptyText: recoveryCancelEventState, itemClass: itemClassName = "", getPage: onErrorDialogConfirmButtonClickState, renderItem: onErrorDialogClickState, renderLeadingItems: errorDialogClickEventValue = null, renderTrailingItems: onShowSharedComponentsButtonClickState = null, buildToolbar: onShowPageComponentsButtonClickState = null, onSelect: onAddComponentButtonClickState, onDelete: onPopupNewButtonClick = null, onItemHover: onPopupNameCloseButtonClick = null, closeLegacyPickers: onPopupNameCancelButtonClick = true, renderSelectedActions: onPopupNameFormSubmit = null, renderSelectedContent: popupNameSubmitEvent = null, }: any) {
  return renderPagedPickerDialog(deps.runCopyBackupDeps(), { kind: popupBeingRenamedConfig, title: popupBeingRenamedRef, subtitle: popupBeingRenamedEntry, searchPlaceholder: popupBeingRenamedRecord, triggerButton: popupBeingRenamedName, pageSize: recoveredComponentIdState, initialPage: initialPageNumber, selectedText: selectedTextValue, emptyText: recoveryCancelEventState, itemClass: itemClassName, getPage: onErrorDialogConfirmButtonClickState, renderItem: onErrorDialogClickState, renderLeadingItems: errorDialogClickEventValue, renderTrailingItems: onShowSharedComponentsButtonClickState, buildToolbar: onShowPageComponentsButtonClickState, onSelect: onAddComponentButtonClickState, onDelete: onPopupNewButtonClick, onItemHover: onPopupNameCloseButtonClick, closeLegacyPickers: onPopupNameCancelButtonClick, renderSelectedActions: onPopupNameFormSubmit, renderSelectedContent: popupNameSubmitEvent });
}

