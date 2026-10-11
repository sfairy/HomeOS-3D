// 从 studio/app/editor/home.ts 迁出（P4 studio 拆分，声明级切片）。
// 检查器同步：变换回填、图标预览模式、共享引用预览按钮、动作控件同步。

import { ACTION_TYPES as ACTION_TYPES2, actionNeedsCurrentEntity as actionNeedsCurrentEntity2, actionPopupData as actionPopupData2, componentActionIsSupported as componentActionIsSupported2, entityIdSupportsToggle as entityIdSupportsToggle2 } from "../../shared/action-rules";
import { clampNumber as clampNumber2, roundField as roundField2 } from "../editor-utils";
import { findComponent as findComponent2 } from "../component-tree";
import { manualRelatedEntityConfig as manualRelatedEntityConfig2, relatedPopupContext as relatedPopupContext2 } from "../../shared/related-entities";
import { previewFlowLineInspectorTransform as previewFlowLineInspectorTransform2 } from "./flow-line-inspector";
import { previewPercentageBarInspector as previewPercentageBarInspector2 } from "./percentage-bar-inspector";

/** 依赖袋（宿主 `bootEditor` 作用域）：**每次调用现取**的普通对象，等价于闭包读值。
 * 本族切片只读不写（外层写入 0），所以不需要 getter / state 袋；宿主侧每个函数一个同名
 * 薄转发器，调用点零改写（函数声明保持提升语义）。族内互调留在模块内，不进依赖袋。
 */
export interface InspectorSyncDeps {
  initActionPopupConfig: any;
  lightStatisticsActionNoteElement: any;
  activeProject: any;
  Option: any;
  pageSelectElement: any;
  loadNavigationIconOptions: any;
  entities: any;
  syncPopupEntityButton: any;
  renderPopupEntityOptions: any;
  positionPopupEntityMenu: any;
  selectedComponentId: any;
  navigatorElement: any;
  titleButtonLeftElement: any;
  lightStatisticsLeftElement: any;
  iconButtonLeftElement: any;
  airConditionerLeftElement: any;
  vacuumMapLeftElement: any;
  cameraLeftElement: any;
  ibeLeftElement: any;
  navigationLabelTextInputElement: any;
  navigationLeftElement: any;
  timeLeftElement: any;
  dateLeftElement: any;
  weatherLeftElement: any;
  lineChartLeftInputElement: any;
  panelFrameLeftInputElement: any;
  imageLeftInputElement: any;
  titleButtonTopElement: any;
  lightStatisticsTopElement: any;
  iconButtonTopElement: any;
  airConditionerTopElement: any;
  vacuumMapTopElement: any;
  cameraTopElement: any;
  ibeTopElement: any;
  navigationTopElement: any;
  timeTopElement: any;
  dateTopElement: any;
  weatherTopElement: any;
  lineChartTopInputElement: any;
  panelFrameTopInputElement: any;
  imageTopInputElement: any;
  titleButtonScaleElement: any;
  lightStatisticsScaleElement: any;
  iconButtonScaleElement: any;
  airConditionerScaleElement: any;
  vacuumMapScaleElement: any;
  cameraScaleElement: any;
  ibeScaleElement: any;
  navigationScaleElement: any;
  timeScaleElement: any;
  dateScaleElement: any;
  weatherScaleElement: any;
  lineChartScaleInputElement: any;
  panelFrameScaleInputElement: any;
  imageScaleInputElement: any;
  titleButtonRotationElement: any;
  lightStatisticsRotationElement: any;
  iconButtonRotationElement: any;
  airConditionerRotationElement: any;
  vacuumMapRotationElement: any;
  cameraRotationElement: any;
  ibeRotationElement: any;
  navigationRotationElement: any;
  timeRotationElement: any;
  dateRotationElement: any;
  weatherRotationElement: any;
  lineChartRotationInputElement: any;
  panelFrameRotationInputElement: any;
  imageRotationInputElement: any;
  navigationWidthElement: any;
  navigationHeightElement: any;
  ibeWidthElement: any;
  ibeHeightElement: any;
  titleButtonWidthElement: any;
  titleButtonHeightElement: any;
  lightStatisticsWidthElement: any;
  lightStatisticsHeightElement: any;
  iconButtonWidthElement: any;
  iconButtonHeightElement: any;
  cameraWidthElement: any;
  cameraHeightElement: any;
  airConditionerWidthElement: any;
  airConditionerHeightElement: any;
  lineChartWidthInputElement: any;
  lineChartHeightInputElement: any;
  panelFrameWidthInputElement: any;
  panelFrameHeightInputElement: any;
  removedComponent: any;
  editorRenderer: any;
  selectedComponentIdsFromDom: any;
  coverMotorButtonElement: any;
  mutateDocument: any;
  setComponentsRotation: any;
  runExtraAlt: any;
  runShadow: any;
  runExtraVariant: any;
  resolveAssetPreviewUrl: any;
  entitiesByEntityId: any;
  devicesByDeviceId: any;
}

export function syncComponentActionControlsCore(deps: InspectorSyncDeps, editedActionComponent: any, actionControlsRoot: any) {
  deps.initActionPopupConfig();
  const boundActionEntityId = editedActionComponent.bindings?.entity?.entityId || "",
    isLightStatistics = editedActionComponent.type === "light-statistics";
  isLightStatistics &&
    ((deps.lightStatisticsActionNoteElement.textContent = boundActionEntityId
      ? "切换和“当前实体”弹窗作用于绑定实体；其它实体弹窗、组合弹窗和跳转页面无需绑定动作实体。"
      : "未绑定动作实体时仍可使用其它实体弹窗、组合弹窗和跳转页面。"),
    actionControlsRoot.setAttribute("aria-disabled", "false"));
  const pages = deps.activeProject.document.pages || [],
    pagePathSet = new Set(pages.map((page: any) => page.path)),
    popupIdSet = new Set(
      (deps.activeProject.document.customPopups || []).map((popupRecord: any) => popupRecord.id),
    ),
    hiddenContentControlElement = actionControlsRoot.querySelector(
      "[data-hidden-content-clickable-control]",
    );
  if (hiddenContentControlElement) {
    const isSupportsHiddenContent = [
      "title-button",
      "device-button",
      "icon-button-effect",
    ].includes(editedActionComponent.type);
    hiddenContentControlElement.hidden = !isSupportsHiddenContent;
    for (const hiddenContentToggleElement of hiddenContentControlElement.querySelectorAll(
      "[data-hidden-content-clickable]",
    )) {
      const isHiddenContentActive =
        hiddenContentToggleElement.dataset.hiddenContentClickable ===
        (editedActionComponent.properties?.hiddenContentClickable === true ? "on" : "off");
      (hiddenContentToggleElement.classList.toggle("active", isHiddenContentActive),
        hiddenContentToggleElement.setAttribute("aria-pressed", String(isHiddenContentActive)));
    }
  }
  for (const actionTriggerElement of actionControlsRoot.querySelectorAll("[data-action-trigger]")) {
    const actionTrigger = actionTriggerElement.dataset.actionTrigger,
      actionConfig = editedActionComponent.actions?.[actionTrigger],
      activeActionType = componentActionIsSupported2(editedActionComponent, actionConfig, {
        pagePaths: pagePathSet,
        popupIds: popupIdSet,
      })
        ? actionConfig.type
        : "none";
    for (const actionTypeElement of actionTriggerElement.querySelectorAll("[data-action-type]")) {
      const isActionTypeActive = actionTypeElement.dataset.actionType === activeActionType;
      (actionTypeElement.classList.toggle("active", isActionTypeActive),
        actionTypeElement.setAttribute("aria-pressed", String(isActionTypeActive)),
        (actionTypeElement.disabled =
          (actionTypeElement.dataset.actionType === "toggle" &&
            (!boundActionEntityId || !entityIdSupportsToggle2(boundActionEntityId))) ||
          (isLightStatistics &&
            !["none", "toggle", "more-info", "navigate"].includes(
              actionTypeElement.dataset.actionType,
            ))));
    }
    const actionTargetRowElement = actionTriggerElement.querySelector(".component-action-target"),
      actionTargetSelectElement = actionTriggerElement.querySelector("[data-action-target]"),
      storedTargetPath = editedActionComponent.actions?.[actionTrigger]?.target;
    (actionTargetSelectElement.replaceChildren(
      ...pages.map((pageOption: any) => new deps.Option(pageOption.name, pageOption.path)),
    ),
      (actionTargetSelectElement.value = pagePathSet.has(storedTargetPath)
        ? storedTargetPath
        : deps.pageSelectElement.value || pages[0]?.path || ""),
      deps.loadNavigationIconOptions(actionTargetSelectElement),
      (actionTargetRowElement.hidden = activeActionType !== "navigate"));
    const popupConfigSectionElement = actionTriggerElement.querySelector(".component-popup-config"),
      popupSourceSelectElement = actionTriggerElement.querySelector("[data-popup-source]"),
      popupEntityHiddenInputElement = actionTriggerElement.querySelector("[data-popup-entity]"),
      popupCustomSelectElement = actionTriggerElement.querySelector("[data-popup-custom]"),
      popupEntityRowElement = actionTriggerElement.querySelector("[data-popup-entity-row]"),
      popupCustomRowElement = actionTriggerElement.querySelector("[data-popup-custom-row]"),
      popupPreviewButtonElement = actionTriggerElement.querySelector("[data-popup-preview]"),
      popupState = actionPopupData2(editedActionComponent.actions?.[actionTrigger]);
    popupSourceSelectElement.value = popupState.source;
    const currentSourceOptionElement =
      popupSourceSelectElement.querySelector('option[value="current"]');
    (currentSourceOptionElement && (currentSourceOptionElement.disabled = !boundActionEntityId),
      (popupEntityHiddenInputElement.value = popupState.entityId || deps.entities[0]?.entityId || ""));
    const customPopups = deps.activeProject.document.customPopups || [];
    (popupCustomSelectElement.replaceChildren(
      ...customPopups.map((popupOption: any) => new deps.Option(popupOption.name, popupOption.id)),
    ),
      (popupCustomSelectElement.value = customPopups.some(
        (popupCandidate: any) => popupCandidate.id === popupState.popupId,
      )
        ? popupState.popupId
        : customPopups[0]?.id || ""),
      deps.loadNavigationIconOptions(popupSourceSelectElement),
      deps.loadNavigationIconOptions(popupCustomSelectElement),
      deps.syncPopupEntityButton(actionTriggerElement));
    const popupEntityMenuElement = actionTriggerElement.querySelector("[data-popup-entity-menu]");
    (popupEntityMenuElement &&
      !popupEntityMenuElement.hidden &&
      (deps.renderPopupEntityOptions(
        actionTriggerElement,
        actionTriggerElement.querySelector("[data-popup-entity-search]")?.value || "",
      ),
      window.requestAnimationFrame(() => deps.positionPopupEntityMenu(actionTriggerElement))),
      (popupConfigSectionElement.hidden = activeActionType !== "more-info"),
      (popupEntityRowElement.hidden = popupState.source !== "entity"),
      (popupCustomRowElement.hidden = popupState.source !== "custom"),
      (popupPreviewButtonElement.disabled =
        popupState.source === "current"
          ? !boundActionEntityId
          : popupState.source === "entity"
            ? !popupEntityHiddenInputElement.value
            : !popupCustomSelectElement.value));
  }
}

export function applyTransformToInspectorCore(deps: InspectorSyncDeps, syncedComponentId: any, transform: any) {
  const inspectorComponent = findComponent2(deps.activeProject?.document, syncedComponentId)?.component;
  if (!inspectorComponent || syncedComponentId !== deps.selectedComponentId) return;
  if (inspectorComponent.type === "flow-line") {
    previewFlowLineInspectorTransform2(
      deps.navigatorElement,
      inspectorComponent,
      deps.activeProject.document.canvas,
      transform,
    );
    return;
  }
  if (inspectorComponent.type === "percentage-bar") {
    previewPercentageBarInspector2(
      deps.navigatorElement,
      {
        ...inspectorComponent,
        position: {
          ...inspectorComponent.position,
          ...transform,
        },
        style: {
          ...inspectorComponent.style,
          ...(Number.isFinite(transform.scale)
            ? {
                scale: transform.scale,
              }
            : {}),
        },
      },
      deps.activeProject.document,
    );
    return;
  }
  const stageCanvasWidthPx = Number(deps.activeProject.document.canvas.width || 2778),
    stageCanvasHeightPx = Number(deps.activeProject.document.canvas.height || 1940),
    currentWidthPx = Number(inspectorComponent.position?.width || 100),
    currentHeightPx = Number(inspectorComponent.position?.height || 100),
    width2 = Number.isFinite(transform.width) ? transform.width : currentWidthPx,
    height2 = Number.isFinite(transform.height) ? transform.height : currentHeightPx,
    isIconButtonKind = ["icon-button", "device-button", "presence-sensor"].includes(
      inspectorComponent.type,
    ),
    zd2 =
      inspectorComponent.type === "title-button"
        ? deps.titleButtonLeftElement
        : inspectorComponent.type === "light-statistics"
          ? deps.lightStatisticsLeftElement
          : isIconButtonKind
            ? deps.iconButtonLeftElement
            : inspectorComponent.type === "air-conditioner"
              ? deps.airConditionerLeftElement
              : inspectorComponent.type === "vacuum-map"
                ? deps.vacuumMapLeftElement
                : inspectorComponent.type === "camera"
                  ? deps.cameraLeftElement
                  : inspectorComponent.type === "icon-button-effect"
                    ? deps.ibeLeftElement
                    : deps.navigationLabelTextInputElement(inspectorComponent)
                      ? deps.navigationLeftElement
                      : inspectorComponent.type === "time"
                        ? deps.timeLeftElement
                        : inspectorComponent.type === "date"
                          ? deps.dateLeftElement
                          : inspectorComponent.type === "weather"
                            ? deps.weatherLeftElement
                            : inspectorComponent.type === "line-chart"
                              ? deps.lineChartLeftInputElement
                              : inspectorComponent.type === "panel-frame"
                                ? deps.panelFrameLeftInputElement
                                : deps.imageLeftInputElement,
    Vd2 =
      inspectorComponent.type === "title-button"
        ? deps.titleButtonTopElement
        : inspectorComponent.type === "light-statistics"
          ? deps.lightStatisticsTopElement
          : isIconButtonKind
            ? deps.iconButtonTopElement
            : inspectorComponent.type === "air-conditioner"
              ? deps.airConditionerTopElement
              : inspectorComponent.type === "vacuum-map"
                ? deps.vacuumMapTopElement
                : inspectorComponent.type === "camera"
                  ? deps.cameraTopElement
                  : inspectorComponent.type === "icon-button-effect"
                    ? deps.ibeTopElement
                    : deps.navigationLabelTextInputElement(inspectorComponent)
                      ? deps.navigationTopElement
                      : inspectorComponent.type === "time"
                        ? deps.timeTopElement
                        : inspectorComponent.type === "date"
                          ? deps.dateTopElement
                          : inspectorComponent.type === "weather"
                            ? deps.weatherTopElement
                            : inspectorComponent.type === "line-chart"
                              ? deps.lineChartTopInputElement
                              : inspectorComponent.type === "panel-frame"
                                ? deps.panelFrameTopInputElement
                                : deps.imageTopInputElement,
    Yr2 =
      inspectorComponent.type === "title-button"
        ? deps.titleButtonScaleElement
        : inspectorComponent.type === "light-statistics"
          ? deps.lightStatisticsScaleElement
          : isIconButtonKind
            ? deps.iconButtonScaleElement
            : inspectorComponent.type === "air-conditioner"
              ? deps.airConditionerScaleElement
              : inspectorComponent.type === "vacuum-map"
                ? deps.vacuumMapScaleElement
                : inspectorComponent.type === "camera"
                  ? deps.cameraScaleElement
                  : inspectorComponent.type === "icon-button-effect"
                    ? deps.ibeScaleElement
                    : deps.navigationLabelTextInputElement(inspectorComponent)
                      ? deps.navigationScaleElement
                      : inspectorComponent.type === "time"
                        ? deps.timeScaleElement
                        : inspectorComponent.type === "date"
                          ? deps.dateScaleElement
                          : inspectorComponent.type === "weather"
                            ? deps.weatherScaleElement
                            : inspectorComponent.type === "line-chart"
                              ? deps.lineChartScaleInputElement
                              : inspectorComponent.type === "panel-frame"
                                ? deps.panelFrameScaleInputElement
                                : deps.imageScaleInputElement,
    sc2 =
      inspectorComponent.type === "title-button"
        ? deps.titleButtonRotationElement
        : inspectorComponent.type === "light-statistics"
          ? deps.lightStatisticsRotationElement
          : isIconButtonKind
            ? deps.iconButtonRotationElement
            : inspectorComponent.type === "air-conditioner"
              ? deps.airConditionerRotationElement
              : inspectorComponent.type === "vacuum-map"
                ? deps.vacuumMapRotationElement
                : inspectorComponent.type === "camera"
                  ? deps.cameraRotationElement
                  : inspectorComponent.type === "icon-button-effect"
                    ? deps.ibeRotationElement
                    : deps.navigationLabelTextInputElement(inspectorComponent)
                      ? deps.navigationRotationElement
                      : inspectorComponent.type === "time"
                        ? deps.timeRotationElement
                        : inspectorComponent.type === "date"
                          ? deps.dateRotationElement
                          : inspectorComponent.type === "weather"
                            ? deps.weatherRotationElement
                            : inspectorComponent.type === "line-chart"
                              ? deps.lineChartRotationInputElement
                              : inspectorComponent.type === "panel-frame"
                                ? deps.panelFrameRotationInputElement
                                : deps.imageRotationInputElement;
  (Number.isFinite(transform.x) &&
    (zd2.value = roundField2(
      clampNumber2(((transform.x + width2 / 2) / stageCanvasWidthPx) * 100, 0, 100),
    )),
    Number.isFinite(transform.y) &&
      (Vd2.value = roundField2(
        clampNumber2(((transform.y + height2 / 2) / stageCanvasHeightPx) * 100, 0, 100),
      )),
    deps.navigationLabelTextInputElement(inspectorComponent) &&
      Number.isFinite(transform.width) &&
      (deps.navigationWidthElement.value = roundField2(
        clampNumber2((transform.width / stageCanvasWidthPx) * 100, 0.1, 100),
      )),
    deps.navigationLabelTextInputElement(inspectorComponent) &&
      Number.isFinite(transform.height) &&
      (deps.navigationHeightElement.value = roundField2(
        clampNumber2((transform.height / stageCanvasHeightPx) * 100, 0.1, 100),
      )),
    inspectorComponent.type === "icon-button-effect" &&
      Number.isFinite(transform.width) &&
      (deps.ibeWidthElement.value = roundField2(
        clampNumber2((transform.width / stageCanvasWidthPx) * 100, 0.1, 100),
      )),
    inspectorComponent.type === "icon-button-effect" &&
      Number.isFinite(transform.height) &&
      (deps.ibeHeightElement.value = roundField2(
        clampNumber2((transform.height / stageCanvasHeightPx) * 100, 0.1, 100),
      )),
    inspectorComponent.type === "title-button" &&
      Number.isFinite(transform.width) &&
      (deps.titleButtonWidthElement.value = roundField2(
        clampNumber2((transform.width / stageCanvasWidthPx) * 100, 0.1, 100),
      )),
    inspectorComponent.type === "title-button" &&
      Number.isFinite(transform.height) &&
      (deps.titleButtonHeightElement.value = roundField2(
        clampNumber2((transform.height / stageCanvasHeightPx) * 100, 0.1, 100),
      )),
    inspectorComponent.type === "light-statistics" &&
      Number.isFinite(transform.width) &&
      (deps.lightStatisticsWidthElement.value = roundField2(
        clampNumber2((transform.width / stageCanvasWidthPx) * 100, 0.1, 100),
      )),
    inspectorComponent.type === "light-statistics" &&
      Number.isFinite(transform.height) &&
      (deps.lightStatisticsHeightElement.value = roundField2(
        clampNumber2((transform.height / stageCanvasHeightPx) * 100, 0.1, 100),
      )),
    isIconButtonKind &&
      Number.isFinite(transform.width) &&
      (deps.iconButtonWidthElement.value = roundField2(
        clampNumber2((transform.width / stageCanvasWidthPx) * 100, 0.1, 100),
      )),
    isIconButtonKind &&
      Number.isFinite(transform.height) &&
      (deps.iconButtonHeightElement.value = roundField2(
        clampNumber2((transform.height / stageCanvasHeightPx) * 100, 0.1, 100),
      )),
    inspectorComponent.type === "camera" &&
      Number.isFinite(transform.width) &&
      (deps.cameraWidthElement.value = roundField2(
        clampNumber2((transform.width / stageCanvasWidthPx) * 100, 0.1, 100),
      )),
    inspectorComponent.type === "camera" &&
      Number.isFinite(transform.height) &&
      (deps.cameraHeightElement.value = roundField2(
        clampNumber2((transform.height / stageCanvasHeightPx) * 100, 0.1, 100),
      )),
    inspectorComponent.type === "air-conditioner" &&
      Number.isFinite(transform.width) &&
      (deps.airConditionerWidthElement.value = roundField2(
        clampNumber2((transform.width / stageCanvasWidthPx) * 100, 0.1, 100),
      )),
    inspectorComponent.type === "air-conditioner" &&
      Number.isFinite(transform.height) &&
      (deps.airConditionerHeightElement.value = roundField2(
        clampNumber2((transform.height / stageCanvasHeightPx) * 100, 0.1, 100),
      )),
    inspectorComponent.type === "line-chart" &&
      Number.isFinite(transform.width) &&
      (deps.lineChartWidthInputElement.value = roundField2(
        clampNumber2((transform.width / stageCanvasWidthPx) * 100, 0.1, 100),
      )),
    inspectorComponent.type === "line-chart" &&
      Number.isFinite(transform.height) &&
      (deps.lineChartHeightInputElement.value = roundField2(
        clampNumber2((transform.height / stageCanvasHeightPx) * 100, 0.1, 100),
      )),
    inspectorComponent.type === "panel-frame" &&
      Number.isFinite(transform.width) &&
      (deps.panelFrameWidthInputElement.value = roundField2(
        clampNumber2((transform.width / stageCanvasWidthPx) * 100, 0.1, 100),
      )),
    inspectorComponent.type === "panel-frame" &&
      Number.isFinite(transform.height) &&
      (deps.panelFrameHeightInputElement.value = roundField2(
        clampNumber2((transform.height / stageCanvasHeightPx) * 100, 0.1, 100),
      )),
    Number.isFinite(transform.scale) && (Yr2.value = roundField2(transform.scale * 100)),
    Number.isFinite(transform.rotation) && (sc2.value = roundField2(transform.rotation)));
}

export function previewModeForIconCore(deps: InspectorSyncDeps, 
  resetPreviewForInput: any,
  resetInputElement: any,
  bindDeviceSection: any,
  onDeviceButtonStatePrecisionSelectChange: any,
) {
  const statePrecisionComponentId = Array.isArray(resetInputElement)
    ? resetInputElement
    : [resetInputElement];
  (resetPreviewForInput.addEventListener("input", (statePrecisionDraftDocument: any) => {
    const createdInstanceRef = deps.removedComponent();
    if (!createdInstanceRef || !statePrecisionComponentId.includes(createdInstanceRef.type)) return;
    const statePrecisionComponentState = bindDeviceSection.get(statePrecisionDraftDocument.target);
    if (statePrecisionComponentState) {
      const property =
        typeof statePrecisionComponentState.property == "function"
          ? statePrecisionComponentState.property(createdInstanceRef)
          : statePrecisionComponentState.property;
      let statePrecisionComponent =
        statePrecisionDraftDocument.target.type === "color"
          ? statePrecisionDraftDocument.target.value
          : Number(statePrecisionDraftDocument.target.value);
      if (statePrecisionDraftDocument.target.type !== "color") {
        if (!Number.isFinite(statePrecisionComponent)) return;
        const statePrecisionValue =
          statePrecisionComponentState.limits?.(createdInstanceRef, deps.activeProject.document) ||
          statePrecisionComponentState;
        statePrecisionComponent =
          clampNumber2(statePrecisionComponent, statePrecisionValue.min, statePrecisionValue.max) /
          (statePrecisionComponentState.divisor || 1);
      }
      deps.editorRenderer?.previewComponentProperties(createdInstanceRef.id, {
        [property]: statePrecisionComponent,
      });
      return;
    }
    const statePrecisionValueState = onDeviceButtonStatePrecisionSelectChange.get(
        statePrecisionDraftDocument.target,
      ),
      statePrecisionValueValue = Number(statePrecisionDraftDocument.target.value);
    if (!statePrecisionValueState || !Number.isFinite(statePrecisionValueValue)) return;
    const measuredBoundsCount = Number(deps.activeProject.document.canvas.width || 2778),
      measuredBoundsIndex = Number(deps.activeProject.document.canvas.height || 1940),
      measuredBoundsTotal = Number(createdInstanceRef.position?.width || 100),
      measuredBoundsFlag = Number(createdInstanceRef.position?.height || 100);
    statePrecisionValueState === "left"
      ? deps.editorRenderer?.previewComponentTransform(createdInstanceRef.id, {
          x:
            (measuredBoundsCount * clampNumber2(statePrecisionValueValue, 0, 100)) / 100 -
            measuredBoundsTotal / 2,
        })
      : statePrecisionValueState === "top"
        ? deps.editorRenderer?.previewComponentTransform(createdInstanceRef.id, {
            y:
              (measuredBoundsIndex * clampNumber2(statePrecisionValueValue, 0, 100)) / 100 -
              measuredBoundsFlag / 2,
          })
        : statePrecisionValueState === "width"
          ? deps.editorRenderer?.previewComponentTransform(createdInstanceRef.id, {
              width: (measuredBoundsCount * clampNumber2(statePrecisionValueValue, 0.1, 100)) / 100,
            })
          : statePrecisionValueState === "height"
            ? deps.editorRenderer?.previewComponentTransform(createdInstanceRef.id, {
                height:
                  (measuredBoundsIndex * clampNumber2(statePrecisionValueValue, 0.1, 100)) / 100,
              })
            : statePrecisionValueState === "scale"
              ? deps.editorRenderer?.previewComponentTransform(createdInstanceRef.id, {
                  scale: clampNumber2(statePrecisionValueValue, 1, 500) / 100,
                })
              : statePrecisionValueState === "rotation" &&
                deps.selectedComponentIdsFromDom().length < 2 &&
                deps.editorRenderer?.previewComponentTransform(createdInstanceRef.id, {
                  rotation: clampNumber2(statePrecisionValueValue, -360, 360),
                });
  }),
    resetPreviewForInput.addEventListener("change", (onPresenceSensorKindSelectChange: any) => {
      const onPresenceSensorKindSelectChangeState = bindDeviceSection.get(
          onPresenceSensorKindSelectChange.target,
        ),
        resetOwnerComponent = onDeviceButtonStatePrecisionSelectChange.get(
          onPresenceSensorKindSelectChange.target,
        );
      if (!onPresenceSensorKindSelectChangeState && !resetOwnerComponent) return;
      if (
        onPresenceSensorKindSelectChange.target.type === "number" &&
        !Number.isFinite(Number(onPresenceSensorKindSelectChange.target.value))
      ) {
        deps.coverMotorButtonElement();
        return;
      }
      const sensorKindComponentId = deps.selectedComponentId,
        il2 = resetOwnerComponent === "rotation" ? deps.selectedComponentIdsFromDom() : [];
      deps.mutateDocument((sensorKindDraftDocument: any) => {
        const sensorKindComponent = findComponent2(
          sensorKindDraftDocument,
          sensorKindComponentId,
        )?.component;
        if (!sensorKindComponent || !statePrecisionComponentId.includes(sensorKindComponent.type))
          return;
        if (
          ((sensorKindComponent.properties = {
            ...(sensorKindComponent.properties || {}),
          }),
          (sensorKindComponent.position = {
            ...(sensorKindComponent.position || {}),
          }),
          (sensorKindComponent.style = {
            ...(sensorKindComponent.style || {}),
          }),
          onPresenceSensorKindSelectChangeState)
        ) {
          const property2 =
              typeof onPresenceSensorKindSelectChangeState.property == "function"
                ? onPresenceSensorKindSelectChangeState.property(sensorKindComponent)
                : onPresenceSensorKindSelectChangeState.property,
            requestedSensorKind =
              onPresenceSensorKindSelectChangeState.limits?.(
                sensorKindComponent,
                sensorKindDraftDocument,
              ) || onPresenceSensorKindSelectChangeState;
          sensorKindComponent.properties[property2] =
            onPresenceSensorKindSelectChange.target.type === "color"
              ? onPresenceSensorKindSelectChange.target.value
              : clampNumber2(
                  Number(onPresenceSensorKindSelectChange.target.value),
                  requestedSensorKind.min,
                  requestedSensorKind.max,
                ) / (onPresenceSensorKindSelectChangeState.divisor || 1);
          return;
        }
        const perspectiveEditComponent = Number(sensorKindDraftDocument.canvas.width || 2778),
          onDoorWindowPerspectiveSaveButtonClick = Number(
            sensorKindDraftDocument.canvas.height || 1940,
          ),
          perspectiveSaveComponent = Number(onPresenceSensorKindSelectChange.target.value);
        resetOwnerComponent === "left"
          ? (sensorKindComponent.position.x =
              (perspectiveEditComponent * clampNumber2(perspectiveSaveComponent, 0, 100)) / 100 -
              Number(sensorKindComponent.position.width || 100) / 2)
          : resetOwnerComponent === "top"
            ? (sensorKindComponent.position.y =
                (onDoorWindowPerspectiveSaveButtonClick *
                  clampNumber2(perspectiveSaveComponent, 0, 100)) /
                  100 -
                Number(sensorKindComponent.position.height || 100) / 2)
            : resetOwnerComponent === "width"
              ? (sensorKindComponent.position.width =
                  (perspectiveEditComponent * clampNumber2(perspectiveSaveComponent, 0.1, 100)) /
                  100)
              : resetOwnerComponent === "height"
                ? (sensorKindComponent.position.height =
                    (onDoorWindowPerspectiveSaveButtonClick *
                      clampNumber2(perspectiveSaveComponent, 0.1, 100)) /
                    100)
                : resetOwnerComponent === "scale"
                  ? (sensorKindComponent.style.scale =
                      clampNumber2(perspectiveSaveComponent, 1, 500) / 100)
                  : resetOwnerComponent === "rotation" &&
                    deps.setComponentsRotation(
                      sensorKindDraftDocument,
                      sensorKindComponentId,
                      clampNumber2(perspectiveSaveComponent, -360, 360),
                      il2,
                    );
      });
    }));
}

export function sharedReferenceIdCore(deps: InspectorSyncDeps, 
  onShowEditorPreviewButtonClick: any,
  onShowDashboardPreviewButtonClick = [onShowEditorPreviewButtonClick],
) {
  const ao5 = deps.runExtraAlt(onShowEditorPreviewButtonClick);
  (ao5.button.addEventListener("click", () => {
    const effectAssetIdState = onShowDashboardPreviewButtonClick.includes(deps.removedComponent()?.type)
        ? deps.removedComponent().type
        : onShowEditorPreviewButtonClick,
      ao6 = deps.runExtraAlt(effectAssetIdState),
      hidden12 = ao5.menu.hidden;
    (deps.runShadow(hidden12 ? ao6.except : null),
      (ao5.menu.hidden = !hidden12),
      ao5.button.setAttribute("aria-expanded", String(hidden12)),
      hidden12 &&
        (deps.runExtraVariant(ao5.search.value, effectAssetIdState),
        deps.resolveAssetPreviewUrl(effectAssetIdState),
        window.requestAnimationFrame(() => {
          (deps.resolveAssetPreviewUrl(effectAssetIdState),
            ao5.search.focus({
              preventScroll: true,
            }));
        })));
  }),
    ao5.search.addEventListener("input", () => {
      const effectAssetRecordState = onShowDashboardPreviewButtonClick.includes(
        deps.removedComponent()?.type,
      )
        ? deps.removedComponent().type
        : onShowEditorPreviewButtonClick;
      deps.runExtraVariant(ao5.search.value, effectAssetRecordState);
    }),
    ao5.options.addEventListener("click", (onSoundToggleButtonClick: any) => {
      const soundToggleDocumentElement =
          onSoundToggleButtonClick.target.closest("[data-entity-id]"),
        effectAssetSize = deps.selectedComponentId;
      if (!soundToggleDocumentElement || !effectAssetSize) return;
      const entityId2 = soundToggleDocumentElement.dataset.entityId;
      (deps.runShadow(),
        deps.mutateDocument((soundToggleError: any) => {
          const soundToggleErrorState = findComponent2(
            soundToggleError,
            effectAssetSize,
          )?.component;
          if (
            !soundToggleErrorState ||
            !onShowDashboardPreviewButtonClick.includes(soundToggleErrorState.type)
          )
            return;
          const onShowPageEditorButtonClickState = String(
            soundToggleErrorState.bindings?.entity?.entityId || "",
          );
          if (
            ((soundToggleErrorState.bindings = {
              ...(soundToggleErrorState.bindings || {}),
            }),
            (soundToggleErrorState.actions = {
              ...(soundToggleErrorState.actions || {}),
            }),
            entityId2)
          ) {
            if (
              ((soundToggleErrorState.bindings.entity = {
                entityId: entityId2,
              }),
              soundToggleErrorState.type === "light-statistics")
            )
              for (const onShowPageEditorButtonClick of ["tap", "doubleTap", "hold"]) {
                const effectAssetComponentState =
                  soundToggleErrorState.actions?.[onShowPageEditorButtonClick];
                ((effectAssetComponentState?.type === "toggle" &&
                  !entityIdSupportsToggle2(entityId2)) ||
                  (effectAssetComponentState &&
                    !ACTION_TYPES2.includes(effectAssetComponentState.type))) &&
                  delete soundToggleErrorState.actions[onShowPageEditorButtonClick];
              }
            soundToggleErrorState.type === "air-conditioner" &&
              !Object.keys(soundToggleErrorState.actions || {}).length &&
              (soundToggleErrorState.actions = {
                tap: {
                  type: "more-info",
                },
                doubleTap: {
                  type: "toggle",
                },
              });
          } else {
            (delete soundToggleErrorState.bindings.entity,
              soundToggleErrorState.type === "light-statistics" &&
                (soundToggleErrorState.actions = Object.fromEntries(
                  Object.entries(soundToggleErrorState.actions || {}).filter(
                    ([, onShowPopupEditorButtonClick]) =>
                      !actionNeedsCurrentEntity2(onShowPopupEditorButtonClick),
                  ),
                )));
            let isOnProjectSelectChange = false;
            for (const onProjectSelectChange of ["tap", "doubleTap", "hold"])
              actionNeedsCurrentEntity2(soundToggleErrorState.actions?.[onProjectSelectChange]) &&
                (delete soundToggleErrorState.actions[onProjectSelectChange],
                (isOnProjectSelectChange = true));
            if (
              soundToggleErrorState.type === "navigation-button" &&
              isOnProjectSelectChange &&
              !soundToggleErrorState.actions.tap
            ) {
              const targetPage = new Set(
                soundToggleError.pages.map((onPageSelectChange: any) => onPageSelectChange.path),
              ).has(soundToggleErrorState.properties?.targetPage)
                ? soundToggleErrorState.properties.targetPage
                : deps.pageSelectElement.value || soundToggleError.pages[0]?.path || "";
              targetPage &&
                (soundToggleErrorState.actions.tap = {
                  type: "navigate",
                  target: targetPage,
                });
            }
          }
          if (onShowEditorPreviewButtonClick === "weather") {
            const selectedPageComponent = deps.entities.find(
              (onRedoButtonClickState: any) => onRedoButtonClickState.entityId === "sun.sun",
            )?.entityId;
            selectedPageComponent
              ? (soundToggleErrorState.bindings.sun = {
                  entityId: selectedPageComponent,
                })
              : delete soundToggleErrorState.bindings.sun;
          }
          if (soundToggleErrorState.type === "scene-mode") {
            ((soundToggleErrorState.actions = {}),
              delete soundToggleErrorState.properties.relatedEntities);
            return;
          }
          if (entityId2 !== onShowPageEditorButtonClickState) {
            if (
              ((soundToggleErrorState.properties = {
                ...(soundToggleErrorState.properties || {}),
              }),
              soundToggleErrorState.type === "light-statistics")
            ) {
              delete soundToggleErrorState.properties.relatedEntities;
              return;
            }
            (
              entityId2
                ? relatedPopupContext2(
                    soundToggleErrorState,
                    deps.entitiesByEntityId(),
                    deps.devicesByDeviceId(),
                  )
                : null
            )
              ? (soundToggleErrorState.properties.relatedEntities = manualRelatedEntityConfig2([]))
              : delete soundToggleErrorState.properties.relatedEntities;
          }
        }));
    }));
}
