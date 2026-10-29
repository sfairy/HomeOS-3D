/* 样式应用（样式差异收集/格式化、尺寸、资源上传） */
import type { EditorContext } from "../editor-context";
import { findComponent as findComponent2 } from "../../component-tree";
import { navigationPreviewClickComponentIdState, onNavigationStyleApplyConfirmButtonClickState, onNavigationStyleApplyConfirmButtonClickValue, onNavigationStyleApplyDialogCloseValue, styleSourceComponentIdState, styleComponentTypeState, styleComponentTypeValue, styleComponentTypeConfig, navigationIconOptionState, navigationIconOptionLabels, navigationIconDraftDocumentValue, navigationIconDraftDocumentConfig, entryStateRef, entryStateEntry } from "../../metadata/editor-navigation-style-metadata";
import { roundField as roundField2, clone as clone2 } from "../../editor-utils";
import { DEFAULT_PERSPECTIVE_CORNERS } from "../../metadata/editor-perspective-constants";

export interface StyleApplyDeps {
  editorCtx: EditorContext;
  airConditionerBaselineByComponentId: any;
  iconButtonBaselineByComponentId: any;
  iconButtonEffectBaselineByComponentId: any;
  navigationButtonSavedSettingsByComponentId: any;
  onNavigationStyleApplyConfirmButtonClick: any;
  panelFrameBaselineByComponentId: any;
  runAltNew: any;
  runAltPeer: any;
  runAuxBackup: any;
  runAuxInner: any;
  runAuxOld: any;
  runAuxPeer: any;
  runVariantFallback: any;
  styleTargetCheckbox: any;
}

export function collectChangedTitleButtonStyleKeys(deps: StyleApplyDeps, component: any) {
  if (!component || component.type !== "title-button") return [];
  const navigationPreviewDatasetState =
    findComponent2(deps.editorCtx.baselineDocument, component.id)?.component || component;
  return Object.keys(navigationPreviewClickComponentIdState).filter(
    (onNavigationStyleApplyCloseButtonClick) =>
      JSON.stringify(deps.runAltPeer(component, onNavigationStyleApplyCloseButtonClick)) !==
      JSON.stringify(
        deps.runAltPeer(navigationPreviewDatasetState, onNavigationStyleApplyCloseButtonClick),
      ),
  );
}

export function onNavigationStyleApplyCancelButtonClick(deps: StyleApplyDeps, 
  onNavigationStyleApplyDialogClick: any,
  styleDialogClickEvent: any,
  onNavigationStyleApplyDialogClose = deps.editorCtx.activeProject?.document,
) {
  if (typeof styleDialogClickEvent == "boolean") return styleDialogClickEvent ? "显示" : "隐藏";
  if (
    onNavigationStyleApplyDialogClick === "width" ||
    onNavigationStyleApplyDialogClick === "height"
  ) {
    const onNavigationStyleApplyDialogCloseState = Number(
      onNavigationStyleApplyDialogClose?.canvas?.[onNavigationStyleApplyDialogClick] ||
        (onNavigationStyleApplyDialogClick === "width" ? 2778 : 1940),
    );
    return (
      roundField2(
        (Number(styleDialogClickEvent || 0) / onNavigationStyleApplyDialogCloseState) * 100,
      ) + "%"
    );
  }
  return onNavigationStyleApplyDialogClick === "scale"
    ? roundField2(Number(styleDialogClickEvent || 0) * 100) + "%"
    : onNavigationStyleApplyDialogClick === "rotation"
      ? roundField2(Number(styleDialogClickEvent || 0)) + "°"
      : [
            "mainSize",
            "secondarySize",
            "mainSpacing",
            "secondarySpacing",
            "secondaryLineGap",
            "mainTextLeft",
            "mainTextTop",
            "secondaryTextLeft",
            "secondaryTextTop",
            "iconSize",
            "iconLeft",
            "iconTop",
            "frameSize",
            "frameSpacing",
            "frameOffsetX",
            "frameOffsetY",
            "markerSize",
            "markerLeft",
            "markerTop",
          ].includes(onNavigationStyleApplyDialogClick)
        ? roundField2(Number(styleDialogClickEvent || 0)) + "%"
        : String(styleDialogClickEvent ?? "");
}

export function onNavigationStyleApplyConfirmButtonClick(deps: StyleApplyDeps, styleSourceComponentId: any, propertyKey: any) {
  if (styleSourceComponentId)
    return propertyKey === "width" || propertyKey === "height"
      ? Number(styleSourceComponentId.position?.[propertyKey] || 100)
      : propertyKey === "scale"
        ? Number(styleSourceComponentId.style?.scale || 1)
        : propertyKey === "rotation"
          ? Number(styleSourceComponentId.position?.rotation || 0)
          : (styleSourceComponentId.properties?.[propertyKey] ??
            (onNavigationStyleApplyConfirmButtonClickState as any)[propertyKey]);
}

export function collectChangedAirConditionerStyleKeys(deps: StyleApplyDeps, component: any) {
  if (!component || component.type !== "air-conditioner") return [];
  let selectedStylePropertyKeys = deps.airConditionerBaselineByComponentId.get(component.id);
  return (
    selectedStylePropertyKeys ||
      ((selectedStylePropertyKeys = clone2(
        findComponent2(deps.editorCtx.baselineDocument, component.id)?.component || component,
      )),
      deps.airConditionerBaselineByComponentId.set(component.id, selectedStylePropertyKeys)),
    Object.keys(onNavigationStyleApplyConfirmButtonClickValue).filter(
      (onNavigationStyleApplyConfirmButtonClickConfig) =>
        JSON.stringify(
          deps.onNavigationStyleApplyConfirmButtonClick(
            component,
            onNavigationStyleApplyConfirmButtonClickConfig,
          ),
        ) !==
        JSON.stringify(
          deps.onNavigationStyleApplyConfirmButtonClick(
            selectedStylePropertyKeys,
            onNavigationStyleApplyConfirmButtonClickConfig,
          ),
        ),
    )
  );
}

export function formatAirConditionerStyleValue(deps: StyleApplyDeps, propertyKey: any, value: any, projectDocument = deps.editorCtx.activeProject?.document) {
  if (typeof value == "boolean") return value ? "显示" : "隐藏";
  if (propertyKey === "width" || propertyKey === "height") {
    const selectedTargetComponentIdsState = Number(
      projectDocument?.canvas?.[propertyKey] || (propertyKey === "width" ? 2778 : 1940),
    );
    return roundField2((Number(value || 0) / selectedTargetComponentIdsState) * 100) + "%";
  }
  return ["scale", "airflowScale", "badgeOpacity"].includes(propertyKey)
    ? roundField2(Number(value || 0) * 100) + "%"
    : ["rotation", "airflowRotation", "airflowAngle"].includes(propertyKey)
      ? roundField2(Number(value || 0)) + "°"
      : propertyKey === "airflowMotion"
        ? value === "static"
          ? "静态"
          : "动态"
        : typeof value == "number"
          ? roundField2(value)
          : String(value ?? "");
}

export function resolveAirConditionerStyleValue(deps: StyleApplyDeps, styleTypeLabel: any, propertyKey: any) {
  if (styleTypeLabel)
    return propertyKey === "width" || propertyKey === "height"
      ? Number(styleTypeLabel.position?.[propertyKey] || 100)
      : propertyKey === "scale"
        ? Number(styleTypeLabel.style?.scale || 1)
        : propertyKey === "rotation"
          ? Number(styleTypeLabel.position?.rotation || 0)
          : (styleTypeLabel.properties?.[propertyKey] ??
            (onNavigationStyleApplyDialogCloseValue as any)[propertyKey]);
}

export function collectChangedIconButtonEffectStyleKeys(deps: StyleApplyDeps, component: any) {
  if (!component || component.type !== "icon-button-effect") return [];
  let navigationPreviousVisibilityValue = deps.iconButtonEffectBaselineByComponentId.get(component.id);
  return (
    navigationPreviousVisibilityValue ||
      ((navigationPreviousVisibilityValue = clone2(
        findComponent2(deps.editorCtx.baselineDocument, component.id)?.component || component,
      )),
      deps.iconButtonEffectBaselineByComponentId.set(component.id, navigationPreviousVisibilityValue)),
    Object.keys(styleSourceComponentIdState).filter(
      (styleSourceComponentIdValue) =>
        JSON.stringify(deps.runAltNew(component, styleSourceComponentIdValue)) !==
        JSON.stringify(deps.runAltNew(navigationPreviousVisibilityValue, styleSourceComponentIdValue)),
    )
  );
}

export function formatIconButtonEffectStyleValue(deps: StyleApplyDeps, propertyKey: any, value: any, projectDocument = deps.editorCtx.activeProject?.document) {
  if (typeof value == "boolean") return value ? "显示" : "隐藏";
  if (propertyKey === "width" || propertyKey === "height") {
    const navigationPreviewButtonElementState = Number(
      projectDocument?.canvas?.[propertyKey] || (propertyKey === "width" ? 2778 : 1940),
    );
    return (
      roundField2((Number(value || 0) / navigationPreviewButtonElementState) * 100) + "%"
    );
  }
  return [
    "buttonOpacity",
    "frameOpacity",
    "glowOffStrength",
    "glowOnStrength",
    "effectOpacity",
    "effectScale",
    "scale",
  ].includes(propertyKey)
    ? roundField2(Number(value || 0) * 100) + "%"
    : ["iconSize", "radius", "effectLeft", "effectTop"].includes(propertyKey)
      ? roundField2(Number(value || 0)) + "%"
      : ["effectRotation", "rotation"].includes(propertyKey)
        ? roundField2(Number(value || 0)) + "°"
        : ["effectFadeDuration", "onFillFadeDuration"].includes(propertyKey)
          ? roundField2(Number(value || 0)) + " 秒"
          : propertyKey === "effectLayoutMode"
            ? value === "fill"
              ? "铺满"
              : "自由"
            : String(value || "不使用");
}

export function normalizeSensorKind(deps: StyleApplyDeps, component: any) {
  const styleComponentType = component?.properties?.sensorKind;
  return ["presence", "door-window", "water-leak", "smoke", "natural-gas"].includes(
    styleComponentType,
  )
    ? styleComponentType
    : "presence";
}

export function formatSensorKindLabel(deps: StyleApplyDeps, sensorKind: any) {
  return ({
    presence: "人体/人在传感器",
    "door-window": "门窗传感器",
    "water-leak": "水浸传感器",
    smoke: "烟雾传感器",
    "natural-gas": "天然气传感器",
  } as any)[deps.runAuxBackup(sensorKind)];
}

export function resolvePresenceSensorStyleKeys(deps: StyleApplyDeps, stylePropertyCheckbox: any) {
  const selectedTargetComponentIds = ["width", "height", "scale", "rotation"],
    rr3 = deps.runAuxBackup(stylePropertyCheckbox);
  return rr3 === "presence"
    ? [
        "iconColor",
        "iconOnColor",
        "haloVisible",
        "haloScaleX",
        "haloScaleY",
        "haloRotation",
        "haloOpacity",
        "personVisible",
        "personScale",
        "personRotation",
        "personOpacity",
        "orbitDuration",
        ...selectedTargetComponentIds,
      ]
    : rr3 === "door-window"
      ? ["iconOnColor", "perspectiveCorners", ...selectedTargetComponentIds]
      : rr3 === "water-leak"
        ? ["waterLeakColor", ...selectedTargetComponentIds]
        : rr3 === "smoke"
          ? ["smokeColor", ...selectedTargetComponentIds]
          : ["naturalGasColor", ...selectedTargetComponentIds];
}

export function styleTargetCheckbox(deps: StyleApplyDeps, styleApplyDraftDocument: any, styleTargetComponentId: any) {
  if (!styleApplyDraftDocument) return;
  if (styleTargetComponentId === "width" || styleTargetComponentId === "height")
    return Number(styleApplyDraftDocument.position?.[styleTargetComponentId] || 100);
  if (styleTargetComponentId === "scale") return Number(styleApplyDraftDocument.style?.scale || 1);
  if (styleTargetComponentId === "rotation")
    return Number(styleApplyDraftDocument.position?.rotation || 0);
  const styleTargetComponentDraft = styleApplyDraftDocument.properties || {};
  return styleTargetComponentId === "iconColor"
    ? (styleTargetComponentDraft.iconColor ??
        styleTargetComponentDraft.clearColor ??
        styleTargetComponentDraft.iconOffColor ??
        styleTargetComponentDraft.iconOnColor ??
        styleComponentTypeState.iconColor)
    : styleTargetComponentId === "iconOnColor"
      ? (styleTargetComponentDraft.iconOnColor ??
        styleTargetComponentDraft.occupiedColor ??
        styleComponentTypeState.iconOnColor)
      : styleTargetComponentId === "mainColor"
        ? (styleTargetComponentDraft.mainColor ??
          styleTargetComponentDraft.mainOffColor ??
          styleTargetComponentDraft.mainOnColor ??
          styleComponentTypeState.mainColor)
        : styleTargetComponentId === "secondaryColor"
          ? (styleTargetComponentDraft.secondaryColor ??
            styleTargetComponentDraft.secondaryOffColor ??
            styleTargetComponentDraft.secondaryOnColor ??
            styleComponentTypeState.secondaryColor)
          : (styleTargetComponentDraft[styleTargetComponentId] ??
            (styleComponentTypeState as any)[styleTargetComponentId]);
}

export function appliedStylePropertyKey(deps: StyleApplyDeps, styleApplyButton: any) {
  if (
    !styleApplyButton ||
    !["icon-button", "device-button", "presence-sensor"].includes(styleApplyButton.type)
  )
    return [];
  let styleFeedbackTimeoutId = deps.iconButtonBaselineByComponentId.get(styleApplyButton.id);
  return (
    styleFeedbackTimeoutId ||
      ((styleFeedbackTimeoutId = clone2(
        findComponent2(deps.editorCtx.baselineDocument, styleApplyButton.id)?.component || styleApplyButton,
      )),
      deps.iconButtonBaselineByComponentId.set(styleApplyButton.id, styleFeedbackTimeoutId)),
    (styleApplyButton.type === "presence-sensor"
      ? deps.runAuxPeer(styleApplyButton)
      : styleApplyButton.type === "device-button"
        ? [
            "iconColor",
            "iconOnColor",
            "badgeColor",
            "badgeOpacity",
            "symbolSize",
            "badgeSize",
            "iconLeft",
            "iconTop",
            "mainColor",
            "mainSize",
            "mainWeight",
            "mainSpacing",
            "mainTextLeft",
            "mainTextTop",
            "secondaryColor",
            "secondarySize",
            "secondaryWeight",
            "secondarySpacing",
            "secondaryTextLeft",
            "secondaryTextTop",
            "width",
            "height",
            "scale",
            "rotation",
          ]
        : Object.keys(styleComponentTypeValue)
    ).filter(
      (onNavigationIconButtonClick: any) =>
        JSON.stringify(deps.styleTargetCheckbox(styleApplyButton, onNavigationIconButtonClick)) !==
        JSON.stringify(deps.styleTargetCheckbox(styleFeedbackTimeoutId, onNavigationIconButtonClick)),
    )
  );
}

export function onNavigationIconCopyButtonClick(deps: StyleApplyDeps, navigationSelectedIconName: any, styleKey: any) {
  return navigationSelectedIconName?.type === "presence-sensor"
    ? (styleComponentTypeConfig as any)[styleKey]
    : navigationSelectedIconName?.type !== "device-button"
      ? (styleComponentTypeValue as any)[styleKey]
      : styleKey.startsWith("main")
        ? {
            group: "标题",
            label:
              styleKey === "mainOnOpacity"
                ? "透明度"
                : (styleComponentTypeValue as any)[styleKey]?.label?.replace("中文", ""),
          }
        : styleKey.startsWith("secondary")
          ? {
              group: "状态",
              label:
                styleKey === "secondaryOnOpacity"
                  ? "透明度"
                  : (styleComponentTypeValue as any)[styleKey]?.label?.replace("英文", ""),
            }
          : (styleComponentTypeValue as any)[styleKey];
}

export function navigationIconCopyError(deps: StyleApplyDeps, 
  onNavigationIconSearchInputInput: any,
  onNavigationIconOptionsClick: any,
  navigationIconOptionClickEvent = deps.editorCtx.activeProject?.document,
) {
  if (typeof onNavigationIconOptionsClick == "boolean")
    return onNavigationIconOptionsClick ? "显示" : "隐藏";
  if (
    onNavigationIconSearchInputInput === "width" ||
    onNavigationIconSearchInputInput === "height"
  ) {
    const navigationIconOptionElement = Number(
      navigationIconOptionClickEvent?.canvas?.[onNavigationIconSearchInputInput] ||
        (onNavigationIconSearchInputInput === "width" ? 2778 : 1940),
    );
    return (
      roundField2((Number(onNavigationIconOptionsClick || 0) / navigationIconOptionElement) * 100) +
      "%"
    );
  }
  return onNavigationIconSearchInputInput === "scale"
    ? roundField2(Number(onNavigationIconOptionsClick || 0) * 100) + "%"
    : onNavigationIconSearchInputInput === "perspectiveCorners"
      ? JSON.stringify(onNavigationIconOptionsClick) === JSON.stringify(DEFAULT_PERSPECTIVE_CORNERS)
        ? "默认透视"
        : "自定义透视"
      : onNavigationIconSearchInputInput === "orbitDuration"
        ? roundField2(Number(onNavigationIconOptionsClick || 0)) + " 秒"
        : onNavigationIconSearchInputInput === "onFillFadeDuration"
          ? roundField2(Number(onNavigationIconOptionsClick || 0)) + " 秒"
          : [
                "rotation",
                "frameAngle",
                "softLightAngle",
                "glowAngle",
                "haloRotation",
                "personRotation",
              ].includes(onNavigationIconSearchInputInput)
            ? roundField2(Number(onNavigationIconOptionsClick || 0)) + "°"
            : [
                  "iconOffOpacity",
                  "iconOnOpacity",
                  "mainOffOpacity",
                  "mainOnOpacity",
                  "secondaryOffOpacity",
                  "secondaryOnOpacity",
                  "badgeOpacity",
                  "onFillStrength",
                  "frameOffOpacity",
                  "frameOnOpacity",
                  "softLightStrength",
                  "softLightSize",
                  "glowStrength",
                  "glowSize",
                  "haloScaleX",
                  "haloScaleY",
                  "haloOpacity",
                  "personScale",
                  "personOpacity",
                ].includes(onNavigationIconSearchInputInput)
              ? roundField2(Number(onNavigationIconOptionsClick || 0) * 100) + "%"
              : [
                    "iconSize",
                    "symbolSize",
                    "badgeSize",
                    "iconLeft",
                    "iconTop",
                    "mainTextLeft",
                    "mainTextTop",
                    "secondaryTextLeft",
                    "secondaryTextTop",
                    "cutCorner",
                  ].includes(onNavigationIconSearchInputInput)
                ? roundField2(Number(onNavigationIconOptionsClick || 0)) + "%"
                : String(onNavigationIconOptionsClick ?? "");
}

export function resolveCameraStyleValue(deps: StyleApplyDeps, component: any, propertyKey: any) {
  if (!component) return;
  if (propertyKey === "width" || propertyKey === "height")
    return Number(component.position?.[propertyKey] || 100);
  if (propertyKey === "scale") return Number(component.style?.scale || 1);
  if (propertyKey === "rotation") return Number(component.position?.rotation || 0);
  const navigationIconComponentId = component.properties || {};
  if (propertyKey === "displayMode")
    return navigationIconComponentId.displayMode === "snapshot" ? "snapshot" : "live";
  if (propertyKey === "refreshInterval") {
    const navigationIconComponentIdState = Number(navigationIconComponentId.refreshInterval);
    return Number.isFinite(navigationIconComponentIdState)
      ? Math.max(6, Math.round(navigationIconComponentIdState))
      : 10;
  }
  if (propertyKey === "fit")
    return navigationIconComponentId.fit === "contain" ? "contain" : "fill";
  if (propertyKey === "radius") {
    const styleFeedbackTimeoutIdState = Number(
      navigationIconComponentId.radius ?? navigationIconOptionState.radius,
    );
    return Math.max(
      0,
      Math.min(
        0.5,
        styleFeedbackTimeoutIdState > 0.5
          ? styleFeedbackTimeoutIdState / 100
          : styleFeedbackTimeoutIdState,
      ),
    );
  }
  return navigationIconComponentId[propertyKey] ?? (navigationIconOptionState as any)[propertyKey];
}

export function collectChangedCameraStyleKeys(deps: StyleApplyDeps, component: any) {
  if (!component || component.type !== "camera") return [];
  const navigationIconDatasetName =
    findComponent2(deps.editorCtx.baselineDocument, component.id)?.component || component;
  return Object.keys(navigationIconOptionLabels).filter(
    (navigationIconDatasetNameState) =>
      JSON.stringify(deps.runAuxInner(component, navigationIconDatasetNameState)) !==
      JSON.stringify(deps.runAuxInner(navigationIconDatasetName, navigationIconDatasetNameState)),
  );
}

export function formatCameraStyleValue(deps: StyleApplyDeps, propertyKey: any, value: any, projectDocument = deps.editorCtx.activeProject?.document) {
  if (typeof value == "boolean") return value ? "显示" : "隐藏";
  if (propertyKey === "displayMode") return value === "snapshot" ? "快照" : "实时";
  if (propertyKey === "refreshInterval") return roundField2(Number(value || 10)) + " 秒";
  if (propertyKey === "fit") return value === "contain" ? "原始比例" : "压缩 16:9";
  if (propertyKey === "width" || propertyKey === "height") {
    const navigationIconDraftDocumentState = Number(
      projectDocument?.canvas?.[propertyKey] || (propertyKey === "width" ? 2778 : 1940),
    );
    return roundField2((Number(value || 0) / navigationIconDraftDocumentState) * 100) + "%";
  }
  return propertyKey === "scale" || propertyKey === "radius" || propertyKey === "frameOpacity"
    ? roundField2(Number(value || 0) * 100) + "%"
    : propertyKey === "rotation" || propertyKey === "frameAngle"
      ? roundField2(Number(value || 0)) + "°"
      : String(value ?? "");
}

export function resolvePanelFrameStyleValue(deps: StyleApplyDeps, component: any, navigationIconDraftDocument: any) {
  if (!component) return;
  if (navigationIconDraftDocument === "width" || navigationIconDraftDocument === "height")
    return Number(component.position?.[navigationIconDraftDocument] || 100);
  if (navigationIconDraftDocument === "scale") return Number(component.style?.scale || 1);
  if (navigationIconDraftDocument === "rotation") return Number(component.position?.rotation || 0);
  const navigationIconComponent = component.properties || {};
  if (
    navigationIconDraftDocument === "mainTextLeft" ||
    navigationIconDraftDocument === "secondaryTextLeft"
  )
    return (
      navigationIconComponent[navigationIconDraftDocument] ??
      navigationIconComponent.textLeft ??
      (navigationIconDraftDocumentValue as any)[navigationIconDraftDocument]
    );
  if (navigationIconDraftDocument === "mainTextTop") {
    const navigationIconPreviousValue = Math.max(1, Number(component.position?.height || 100));
    return (
      navigationIconComponent.mainTextTop ??
      Number(navigationIconComponent.textTop ?? 28) -
        (Number(navigationIconComponent.lineGap ?? 24) / navigationIconPreviousValue) * 100
    );
  }
  return navigationIconDraftDocument === "secondaryTextTop"
    ? (navigationIconComponent.secondaryTextTop ??
        navigationIconComponent.textTop ??
        navigationIconDraftDocumentValue.secondaryTextTop)
    : (navigationIconComponent[navigationIconDraftDocument] ??
        (navigationIconDraftDocumentValue as any)[navigationIconDraftDocument]);
}

export function collectChangedPanelFrameStyleKeys(deps: StyleApplyDeps, component: any) {
  if (!component || component.type !== "panel-frame") return [];
  let navigationIconVisiblePreviousValue = deps.panelFrameBaselineByComponentId.get(component.id);
  return (
    navigationIconVisiblePreviousValue ||
      ((navigationIconVisiblePreviousValue = clone2(
        findComponent2(deps.editorCtx.baselineDocument, component.id)?.component || component,
      )),
      deps.panelFrameBaselineByComponentId.set(component.id, navigationIconVisiblePreviousValue)),
    Object.keys(navigationIconDraftDocumentConfig).filter((filteredItemsEntry) =>
      !navigationIconVisiblePreviousValue ||
      navigationIconVisiblePreviousValue.type !== "panel-frame"
        ? true
        : JSON.stringify(deps.runAuxOld(component, filteredItemsEntry)) !==
          JSON.stringify(deps.runAuxOld(navigationIconVisiblePreviousValue, filteredItemsEntry)),
    )
  );
}

export function formatPanelFrameStyleValue(deps: StyleApplyDeps, 
  propertyKey: any,
  value: any,
  bindAssetSection = deps.editorCtx.activeProject?.document,
) {
  if (typeof value == "boolean") return value ? "显示" : "隐藏";
  if (propertyKey === "width" || propertyKey === "height") {
    const selectedTargetComponentIdsValue = Number(
      bindAssetSection?.canvas?.[propertyKey] ||
        (propertyKey === "width" ? 2778 : 1940),
    );
    return roundField2((Number(value || 0) / selectedTargetComponentIdsValue) * 100) + "%";
  }
  return propertyKey === "scale"
    ? roundField2(Number(value || 0) * 100) + "%"
    : propertyKey === "rotation" ||
        propertyKey === "edgeAngle" ||
        propertyKey === "glowAngle"
      ? roundField2(Number(value || 0)) + "°"
      : [
            "mainOpacity",
            "secondaryOpacity",
            "edgeOpacity",
            "radius",
            "glowStrength",
            "glowSize",
          ].includes(propertyKey)
        ? roundField2(Number(value || 0) * 100) + "%"
        : ["mainTextLeft", "mainTextTop", "secondaryTextLeft", "secondaryTextTop"].includes(
              propertyKey,
            )
          ? roundField2(Number(value || 0)) + "%"
          : String(value ?? "");
}

export function entryStateRecord(deps: StyleApplyDeps, entryStateName: any, propertyKey: any) {
  if (!entryStateName) return;
  if (propertyKey === "width" || propertyKey === "height")
    return Number(entryStateName.position?.[propertyKey] || 100);
  if (propertyKey === "scale") return Number(entryStateName.style?.scale || 1);
  if (propertyKey === "rotation") return Number(entryStateName.position?.rotation || 0);
  const availablePropertiesKey = entryStateName.properties || {},
    styleTypeLabelState = (entryStateRef as any)[propertyKey];
  return propertyKey === "textIdleOpacity"
    ? (availablePropertiesKey[propertyKey] ??
        availablePropertiesKey.idleOpacity ??
        styleTypeLabelState)
    : propertyKey === "textActiveOpacity"
      ? (availablePropertiesKey[propertyKey] ??
        availablePropertiesKey.activeOpacity ??
        styleTypeLabelState)
      : propertyKey === "iconIdleOpacity"
        ? (availablePropertiesKey[propertyKey] ??
          availablePropertiesKey.idleOpacity ??
          styleTypeLabelState)
        : propertyKey === "iconActiveOpacity"
          ? (availablePropertiesKey[propertyKey] ??
            availablePropertiesKey.activeOpacity ??
            styleTypeLabelState)
          : propertyKey === "mainTextLeft" || propertyKey === "secondaryTextLeft"
            ? (availablePropertiesKey[propertyKey] ??
              availablePropertiesKey.textLeft ??
              styleTypeLabelState)
            : propertyKey === "mainTextTop"
              ? (availablePropertiesKey[propertyKey] ??
                Number(availablePropertiesKey.textTop ?? 81.5) - 1800 / 64.36)
              : propertyKey === "secondaryTextTop"
                ? (availablePropertiesKey[propertyKey] ??
                  availablePropertiesKey.textTop ??
                  styleTypeLabelState)
                : (availablePropertiesKey[propertyKey] ?? styleTypeLabelState);
}

export function areStyleValuesEqual(deps: StyleApplyDeps, leftValue: any, rightValue: any) {
  return JSON.stringify(leftValue) === JSON.stringify(rightValue);
}

export function onImageAssetUploadButtonClick(deps: StyleApplyDeps, 
  onIconButtonEffectAssetUploadButtonClick: any,
  onImageAssetUploadInputChange: any,
  onIconButtonEffectAssetUploadInputChange: any,
  assetOptionsElement: any,
) {
  if (!onIconButtonEffectAssetUploadButtonClick || !(entryStateEntry as any)[onImageAssetUploadInputChange])
    return;
  let navigationIconVisiblePreviousValueState = deps.navigationButtonSavedSettingsByComponentId.get(
    onIconButtonEffectAssetUploadButtonClick,
  );
  (!navigationIconVisiblePreviousValueState &&
    deps.runVariantFallback(onIconButtonEffectAssetUploadInputChange, assetOptionsElement)) ||
    (navigationIconVisiblePreviousValueState ||
      ((navigationIconVisiblePreviousValueState = new Map()),
      deps.navigationButtonSavedSettingsByComponentId.set(
        onIconButtonEffectAssetUploadButtonClick,
        navigationIconVisiblePreviousValueState,
      )),
    navigationIconVisiblePreviousValueState.has(onImageAssetUploadInputChange) ||
      navigationIconVisiblePreviousValueState.set(
        onImageAssetUploadInputChange,
        clone2(onIconButtonEffectAssetUploadInputChange),
      ));
}

export function onAssetOptionsClick(deps: StyleApplyDeps, assetOptionsClickEvent: any) {
  const deleteUserAssetElement = deps.navigationButtonSavedSettingsByComponentId.get(
    assetOptionsClickEvent?.id,
  );
  if (deleteUserAssetElement) {
    for (const deleteUserAssetElementState of deleteUserAssetElement.keys())
      (entryStateEntry as any)[deleteUserAssetElementState] ||
        deleteUserAssetElement.delete(deleteUserAssetElementState);
    deleteUserAssetElement.size ||
      deps.navigationButtonSavedSettingsByComponentId.delete(assetOptionsClickEvent.id);
  }
}


/** 样式应用会话需要清理的 5 张 baseline 缓存（0.8.1 同款集合）。 */
export interface StyleApplyBaselineMaps {
  airConditionerBaselineByComponentId: Map<unknown, unknown>;
  iconButtonBaselineByComponentId: Map<unknown, unknown>;
  iconButtonEffectBaselineByComponentId: Map<unknown, unknown>;
  navigationButtonSavedSettingsByComponentId: Map<unknown, unknown>;
  panelFrameBaselineByComponentId: Map<unknown, unknown>;
}

export interface StyleApplyBaselineDeps extends StyleApplyBaselineMaps {
  editorCtx: EditorContext;
}

/**
 * 结束一次样式应用会话：清空 baseline 缓存、关掉脉冲并关闭对话框。
 *
 * baseline 缓存按 componentId 存「上次看到的样式」；切项目/切页面后同一个 id 可能
 * 指向别的控件，不清就会把差异算错（表现为「什么都没改也显示已修改」）。
 */
export function resetStyleApplyBaselines(
  deps: StyleApplyBaselineDeps,
  dialogElement?: HTMLDialogElement | null,
) {
  for (const baselineMap of [
    deps.airConditionerBaselineByComponentId,
    deps.iconButtonBaselineByComponentId,
    deps.iconButtonEffectBaselineByComponentId,
    deps.navigationButtonSavedSettingsByComponentId,
    deps.panelFrameBaselineByComponentId,
  ])
    baselineMap?.clear?.();
  deps.editorCtx.appliedStyleRecord = null;
  const pulseTimeouts = deps.editorCtx.styleApplyPulseByButton;
  if (pulseTimeouts) {
    for (const pulseTimeout of pulseTimeouts.values()) window.clearTimeout(pulseTimeout);
    pulseTimeouts.clear();
  }
  dialogElement?.open && dialogElement.close();
}
