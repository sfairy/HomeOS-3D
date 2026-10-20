/* 复制备份选择器（实体/灯光/弹窗选择器、检查器同步） */
import type { EditorContext } from "../editor-context";
import { loadNavigationIconOptionsCore, positionTitleButtonIconMenuCore, stopHoverScrollCore, iconTooltipElementValueCore } from "../../menus/title-button-menu";
import { syncComponentActionControlsCore, applyTransformToInspectorCore, previewModeForIconCore, sharedReferenceIdCore } from "../../inspectors/inspector-sync";
import { nudgeDeltaXCore } from "../../selection/nudge";
import { EDITOR_PICKER_PAGE_SIZES as EDITOR_PICKER_PAGE_SIZES2, editorEntityPickerInitialPage as editorEntityPickerInitialPage2, editorEntityPickerPage as editorEntityPickerPage2 } from "../../picker/editor-picker-pagination";
import { lightStatisticsEntitySupport as lightStatisticsEntitySupport2 } from "../../../renderer/registry";
import { popupModuleEntityRecommended as popupModuleEntityRecommended2 } from "../../editor-document-management";

export interface CopyBackupPickersDeps {
  editorCtx: EditorContext;
  ICON_PAGE_SIZE: any;
  airConditionerHeightElement: any;
  airConditionerLayerByComponentId: any;
  airConditionerLeftElement: any;
  airConditionerRotationElement: any;
  airConditionerScaleElement: any;
  airConditionerTopElement: any;
  airConditionerWidthElement: any;
  cameraHeightElement: any;
  cameraLeftElement: any;
  cameraRotationElement: any;
  cameraScaleElement: any;
  cameraTopElement: any;
  cameraWidthElement: any;
  canDeleteAssetFolder: any;
  coverMotorButtonElement: any;
  createEditorEntityPickerOption: any;
  createEditorPickerCurrentEntity: any;
  createIconPickerClearOption: any;
  createIconPickerClearOptionState: any;
  createIconPickerOption: any;
  customSelectsBySelectElement: any;
  dateLeftElement: any;
  dateRotationElement: any;
  dateScaleElement: any;
  dateTopElement: any;
  devicesByDeviceId: any;
  editorEntityMatches: any;
  editorPickerComponentTypeLabel: any;
  effectVariantUrlState: any;
  entitiesByEntityId: any;
  errorPhase: any;
  ibeAssetFolderElement: any;
  ibeHeightElement: any;
  ibeIconButtonElement: any;
  ibeIconOptionsElement: any;
  ibeLeftElement: any;
  ibeRotationElement: any;
  ibeScaleElement: any;
  ibeTopElement: any;
  ibeWidthElement: any;
  iconButtonEntityButtonElement: any;
  iconButtonHeightElement: any;
  iconButtonIconButtonElement: any;
  iconButtonIconOptionsElement: any;
  iconButtonLeftElement: any;
  iconButtonRotationElement: any;
  iconButtonScaleElement: any;
  iconButtonTopElement: any;
  iconButtonWidthElement: any;
  imageAssetFolderSelectElement: any;
  imageEntityButtonElement: any;
  imageLeftInputElement: any;
  imageRotationInputElement: any;
  imageScaleInputElement: any;
  imageTopInputElement: any;
  initActionPopupConfig: any;
  inspectorSyncDeps: any;
  lightStatisticsActionNoteElement: any;
  lightStatisticsEntityButtonElement: any;
  lightStatisticsEntityOptionsElement: any;
  lightStatisticsHeightElement: any;
  lightStatisticsIconButtonElement: any;
  lightStatisticsIconOptionsElement: any;
  lightStatisticsLeftElement: any;
  lightStatisticsRotationElement: any;
  lightStatisticsScaleElement: any;
  lightStatisticsTopElement: any;
  lightStatisticsWidthElement: any;
  lineChartHeightInputElement: any;
  lineChartLeftInputElement: any;
  lineChartRotationInputElement: any;
  lineChartScaleInputElement: any;
  lineChartTopInputElement: any;
  lineChartWidthInputElement: any;
  loadNavigationIconOptions: any;
  mutateDocument: any;
  navigationEntityButtonElement: any;
  navigationHeightElement: any;
  navigationIconButtonElement: any;
  navigationIconOptionsElement: any;
  navigationLabelTextInputElement: any;
  navigationLeftElement: any;
  navigationRotationElement: any;
  navigationScaleElement: any;
  navigationTopElement: any;
  navigationWidthElement: any;
  navigatorElement: any;
  nudgeDeps: any;
  pageSelectElement: any;
  panelFrameHeightInputElement: any;
  panelFrameLeftInputElement: any;
  panelFrameRotationInputElement: any;
  panelFrameScaleInputElement: any;
  panelFrameTopInputElement: any;
  panelFrameWidthInputElement: any;
  popupBeingRenamed: any;
  entityPickerHintText: any;
  popupModuleDialogElement: any;
  popupModuleEntityButtonElement: any;
  popupModuleEntityOptionsElement: any;
  popupModuleFormElement: any;
  positionPopupEntityMenu: any;
  removalPageEntry: any;
  removedComponent: any;
  renderNavigationIconPreview: any;
  renderPopupEntityOptions: any;
  requestJson: any;
  resolveAssetPreviewUrl: any;
  runConfig: any;
  runCopyBackup: any;
  runCopyLast: any;
  runCopyTwin: any;
  runExtraAlt: any;
  runExtraVariant: any;
  runMode: any;
  runOuter: any;
  runPortion: any;
  runSegment: any;
  runShadow: any;
  runState: any;
  selectedComponentIdsFromDom: any;
  setComponentsRotation: any;
  syncPopupEntityButton: any;
  timeLeftElement: any;
  timeRotationElement: any;
  timeScaleElement: any;
  timeTopElement: any;
  titleButtonHeightElement: any;
  titleButtonIconButtonElement: any;
  titleButtonIconOptionsElement: any;
  titleButtonLeftElement: any;
  titleButtonMenuDeps: any;
  titleButtonRotationElement: any;
  titleButtonScaleElement: any;
  titleButtonTopElement: any;
  titleButtonWidthElement: any;
  vacuumMapLeftElement: any;
  vacuumMapRotationElement: any;
  vacuumMapScaleElement: any;
  vacuumMapTopElement: any;
  value: any;
  weatherLeftElement: any;
  weatherRotationElement: any;
  weatherScaleElement: any;
  weatherTopElement: any;
}

export function titleButtonMenuDeps(deps: CopyBackupPickersDeps) {
  return ({
    get customSelectsBySelectElement() {
      return deps.customSelectsBySelectElement;
    },
    get imageAssetFolderSelectElement() {
      return deps.imageAssetFolderSelectElement;
    },
    get ibeAssetFolderElement() {
      return deps.ibeAssetFolderElement;
    },
    get imageAssetFolder() {
      return deps.editorCtx.imageAssetFolder;
    },
    get effectAssetFolder() {
      return deps.editorCtx.effectAssetFolder;
    },
    get canDeleteAssetFolder() {
      return deps.canDeleteAssetFolder;
    },
    get runState() {
      return deps.runState;
    },
    get runConfig() {
      return deps.runConfig;
    },
    get errorPhase() {
      return deps.errorPhase;
    },
    get value() {
      return deps.value;
    },
    get openCustomSelect() {
      return deps.editorCtx.openCustomSelect;
    },
    set openCustomSelect(value) {
      deps.editorCtx.openCustomSelect = value;
    },
    get runCopyLast() {
      return deps.runCopyLast;
    },
    get runOuter() {
      return deps.runOuter;
    },
    get effectVariantUrlState() {
      return deps.effectVariantUrlState;
    },
    get requestJson() {
      return deps.requestJson;
    },
    get ICON_PAGE_SIZE() {
      return deps.ICON_PAGE_SIZE;
    },
    get createIconPickerClearOptionState() {
      return deps.createIconPickerClearOptionState;
    },
  });
}

export function loadNavigationIconOptions(deps: CopyBackupPickersDeps, loadTitleButtonIconOptionsElement: any) {
  return loadNavigationIconOptionsCore(deps.titleButtonMenuDeps(), loadTitleButtonIconOptionsElement);
}

export function positionTitleButtonIconMenu(deps: CopyBackupPickersDeps, registerOverflowPreviewRow: any) {
  return positionTitleButtonIconMenuCore(deps.titleButtonMenuDeps(), registerOverflowPreviewRow);
}

export function stopHoverScroll(deps: CopyBackupPickersDeps, syncEntityPickerValue: any) {
  return stopHoverScrollCore(deps.titleButtonMenuDeps(), syncEntityPickerValue);
}

export function iconTooltipElementValue(deps: CopyBackupPickersDeps, { optionsElement: iconTooltipElementCard, query: iconTooltipElementConfig = "", currentIcon: iconTooltipElementRef = "", clearLabel: iconTooltipElementEntry = "不使用图标", datasetKey: iconTooltipElementRecord = "iconName", append: iconTooltipElementName = false, }: any) {
  return iconTooltipElementValueCore(deps.titleButtonMenuDeps(), { optionsElement: iconTooltipElementCard, query: iconTooltipElementConfig, currentIcon: iconTooltipElementRef, clearLabel: iconTooltipElementEntry, datasetKey: iconTooltipElementRecord, append: iconTooltipElementName });
}

export function inspectorSyncDeps(deps: CopyBackupPickersDeps) {
  return ({
    get initActionPopupConfig() {
      return deps.initActionPopupConfig;
    },
    get lightStatisticsActionNoteElement() {
      return deps.lightStatisticsActionNoteElement;
    },
    get activeProject() {
      return deps.editorCtx.activeProject;
    },
    get Option() {
      return Option;
    },
    get pageSelectElement() {
      return deps.pageSelectElement;
    },
    get loadNavigationIconOptions() {
      return deps.loadNavigationIconOptions;
    },
    get entities() {
      return deps.editorCtx.entities;
    },
    get syncPopupEntityButton() {
      return deps.syncPopupEntityButton;
    },
    get renderPopupEntityOptions() {
      return deps.renderPopupEntityOptions;
    },
    get positionPopupEntityMenu() {
      return deps.positionPopupEntityMenu;
    },
    get selectedComponentId() {
      return deps.editorCtx.selectedComponentId;
    },
    get navigatorElement() {
      return deps.navigatorElement;
    },
    get titleButtonLeftElement() {
      return deps.titleButtonLeftElement;
    },
    get lightStatisticsLeftElement() {
      return deps.lightStatisticsLeftElement;
    },
    get iconButtonLeftElement() {
      return deps.iconButtonLeftElement;
    },
    get airConditionerLeftElement() {
      return deps.airConditionerLeftElement;
    },
    get vacuumMapLeftElement() {
      return deps.vacuumMapLeftElement;
    },
    get cameraLeftElement() {
      return deps.cameraLeftElement;
    },
    get ibeLeftElement() {
      return deps.ibeLeftElement;
    },
    get navigationLabelTextInputElement() {
      return deps.navigationLabelTextInputElement;
    },
    get navigationLeftElement() {
      return deps.navigationLeftElement;
    },
    get timeLeftElement() {
      return deps.timeLeftElement;
    },
    get dateLeftElement() {
      return deps.dateLeftElement;
    },
    get weatherLeftElement() {
      return deps.weatherLeftElement;
    },
    get lineChartLeftInputElement() {
      return deps.lineChartLeftInputElement;
    },
    get panelFrameLeftInputElement() {
      return deps.panelFrameLeftInputElement;
    },
    get imageLeftInputElement() {
      return deps.imageLeftInputElement;
    },
    get titleButtonTopElement() {
      return deps.titleButtonTopElement;
    },
    get lightStatisticsTopElement() {
      return deps.lightStatisticsTopElement;
    },
    get iconButtonTopElement() {
      return deps.iconButtonTopElement;
    },
    get airConditionerTopElement() {
      return deps.airConditionerTopElement;
    },
    get vacuumMapTopElement() {
      return deps.vacuumMapTopElement;
    },
    get cameraTopElement() {
      return deps.cameraTopElement;
    },
    get ibeTopElement() {
      return deps.ibeTopElement;
    },
    get navigationTopElement() {
      return deps.navigationTopElement;
    },
    get timeTopElement() {
      return deps.timeTopElement;
    },
    get dateTopElement() {
      return deps.dateTopElement;
    },
    get weatherTopElement() {
      return deps.weatherTopElement;
    },
    get lineChartTopInputElement() {
      return deps.lineChartTopInputElement;
    },
    get panelFrameTopInputElement() {
      return deps.panelFrameTopInputElement;
    },
    get imageTopInputElement() {
      return deps.imageTopInputElement;
    },
    get titleButtonScaleElement() {
      return deps.titleButtonScaleElement;
    },
    get lightStatisticsScaleElement() {
      return deps.lightStatisticsScaleElement;
    },
    get iconButtonScaleElement() {
      return deps.iconButtonScaleElement;
    },
    get airConditionerScaleElement() {
      return deps.airConditionerScaleElement;
    },
    get vacuumMapScaleElement() {
      return deps.vacuumMapScaleElement;
    },
    get cameraScaleElement() {
      return deps.cameraScaleElement;
    },
    get ibeScaleElement() {
      return deps.ibeScaleElement;
    },
    get navigationScaleElement() {
      return deps.navigationScaleElement;
    },
    get timeScaleElement() {
      return deps.timeScaleElement;
    },
    get dateScaleElement() {
      return deps.dateScaleElement;
    },
    get weatherScaleElement() {
      return deps.weatherScaleElement;
    },
    get lineChartScaleInputElement() {
      return deps.lineChartScaleInputElement;
    },
    get panelFrameScaleInputElement() {
      return deps.panelFrameScaleInputElement;
    },
    get imageScaleInputElement() {
      return deps.imageScaleInputElement;
    },
    get titleButtonRotationElement() {
      return deps.titleButtonRotationElement;
    },
    get lightStatisticsRotationElement() {
      return deps.lightStatisticsRotationElement;
    },
    get iconButtonRotationElement() {
      return deps.iconButtonRotationElement;
    },
    get airConditionerRotationElement() {
      return deps.airConditionerRotationElement;
    },
    get vacuumMapRotationElement() {
      return deps.vacuumMapRotationElement;
    },
    get cameraRotationElement() {
      return deps.cameraRotationElement;
    },
    get ibeRotationElement() {
      return deps.ibeRotationElement;
    },
    get navigationRotationElement() {
      return deps.navigationRotationElement;
    },
    get timeRotationElement() {
      return deps.timeRotationElement;
    },
    get dateRotationElement() {
      return deps.dateRotationElement;
    },
    get weatherRotationElement() {
      return deps.weatherRotationElement;
    },
    get lineChartRotationInputElement() {
      return deps.lineChartRotationInputElement;
    },
    get panelFrameRotationInputElement() {
      return deps.panelFrameRotationInputElement;
    },
    get imageRotationInputElement() {
      return deps.imageRotationInputElement;
    },
    get navigationWidthElement() {
      return deps.navigationWidthElement;
    },
    get navigationHeightElement() {
      return deps.navigationHeightElement;
    },
    get ibeWidthElement() {
      return deps.ibeWidthElement;
    },
    get ibeHeightElement() {
      return deps.ibeHeightElement;
    },
    get titleButtonWidthElement() {
      return deps.titleButtonWidthElement;
    },
    get titleButtonHeightElement() {
      return deps.titleButtonHeightElement;
    },
    get lightStatisticsWidthElement() {
      return deps.lightStatisticsWidthElement;
    },
    get lightStatisticsHeightElement() {
      return deps.lightStatisticsHeightElement;
    },
    get iconButtonWidthElement() {
      return deps.iconButtonWidthElement;
    },
    get iconButtonHeightElement() {
      return deps.iconButtonHeightElement;
    },
    get cameraWidthElement() {
      return deps.cameraWidthElement;
    },
    get cameraHeightElement() {
      return deps.cameraHeightElement;
    },
    get airConditionerWidthElement() {
      return deps.airConditionerWidthElement;
    },
    get airConditionerHeightElement() {
      return deps.airConditionerHeightElement;
    },
    get lineChartWidthInputElement() {
      return deps.lineChartWidthInputElement;
    },
    get lineChartHeightInputElement() {
      return deps.lineChartHeightInputElement;
    },
    get panelFrameWidthInputElement() {
      return deps.panelFrameWidthInputElement;
    },
    get panelFrameHeightInputElement() {
      return deps.panelFrameHeightInputElement;
    },
    get removedComponent() {
      return deps.removedComponent;
    },
    get editorRenderer() {
      return deps.editorCtx.editorRenderer;
    },
    get selectedComponentIdsFromDom() {
      return deps.selectedComponentIdsFromDom;
    },
    get coverMotorButtonElement() {
      return deps.coverMotorButtonElement;
    },
    get mutateDocument() {
      return deps.mutateDocument;
    },
    get setComponentsRotation() {
      return deps.setComponentsRotation;
    },
    get runExtraAlt() {
      return deps.runExtraAlt;
    },
    get runShadow() {
      return deps.runShadow;
    },
    get runExtraVariant() {
      return deps.runExtraVariant;
    },
    get resolveAssetPreviewUrl() {
      return deps.resolveAssetPreviewUrl;
    },
    get entitiesByEntityId() {
      return deps.entitiesByEntityId;
    },
    get devicesByDeviceId() {
      return deps.devicesByDeviceId;
    },
  });
}

export function syncComponentActionControls(deps: CopyBackupPickersDeps, editedActionComponent: any, actionControlsRoot: any) {
  return syncComponentActionControlsCore(deps.inspectorSyncDeps(), editedActionComponent, actionControlsRoot);
}

export function applyTransformToInspector(deps: CopyBackupPickersDeps, syncedComponentId: any, transform: any) {
  return applyTransformToInspectorCore(deps.inspectorSyncDeps(), syncedComponentId, transform);
}

export function previewModeForIcon(deps: CopyBackupPickersDeps, resetPreviewForInput: any, resetInputElement: any, bindDeviceSection: any, onDeviceButtonStatePrecisionSelectChange: any,
) {
  return previewModeForIconCore(deps.inspectorSyncDeps(), resetPreviewForInput, resetInputElement, bindDeviceSection, onDeviceButtonStatePrecisionSelectChange);
}

export function sharedReferenceId(deps: CopyBackupPickersDeps, onShowEditorPreviewButtonClick: any, onShowDashboardPreviewButtonClick = [onShowEditorPreviewButtonClick],
) {
  return sharedReferenceIdCore(deps.inspectorSyncDeps(), onShowEditorPreviewButtonClick, onShowDashboardPreviewButtonClick);
}

export function nudgeDeps(deps: CopyBackupPickersDeps) {
  return ({
    get removalPageEntry() {
      return deps.removalPageEntry;
    },
    get selectedComponentIdsSet() {
      return deps.editorCtx.selectedComponentIdsSet;
    },
    get mutateDocument() {
      return deps.mutateDocument;
    },
    get airConditionerLayerByComponentId() {
      return deps.airConditionerLayerByComponentId;
    },
  });
}

export function nudgeDeltaX(deps: CopyBackupPickersDeps, nudgeDeltaY: any, nudgedComponentIds: any) {
  return nudgeDeltaXCore(deps.nudgeDeps(), nudgeDeltaY, nudgedComponentIds);
}

export function clickPopupListOption(deps: CopyBackupPickersDeps, popupListItemElementPanel: any, dataKey: any, dataValue: any) {
  const popupMenuRectElement = document.createElement("button");
  ((popupMenuRectElement.type = "button"),
    (popupMenuRectElement.dataset[dataKey] = dataValue),
    popupListItemElementPanel.replaceChildren(popupMenuRectElement),
    popupMenuRectElement.click(),
    popupListItemElementPanel.replaceChildren());
}

export function onPopupListContextmenu(deps: CopyBackupPickersDeps, popupListMenuEvent: any) {
  const popupItemElement = deps.removedComponent(),
    popupMenuRect = [
      {
        button: deps.navigationIconButtonElement,
        title: popupItemElement?.type === "scene-mode" ? "选择情景图标" : "选择导航图标",
        options: deps.navigationIconOptionsElement,
        datasetKey: "iconName",
        current: popupItemElement?.properties?.icon || "",
        clear: "不使用图标",
      },
      {
        button: deps.ibeIconButtonElement,
        title: "选择效果按钮图标",
        options: deps.ibeIconOptionsElement,
        datasetKey: "iconName",
        current: popupItemElement?.properties?.icon || "",
        clear: "不使用图标",
      },
      {
        button: deps.iconButtonIconButtonElement,
        title: "选择按钮图标",
        options: deps.iconButtonIconOptionsElement,
        datasetKey: "iconName",
        current: popupItemElement?.properties?.icon || "",
        clear: popupItemElement?.type === "device-button" ? "跟随实体图标" : "不使用图标",
      },
      {
        button: deps.titleButtonIconButtonElement,
        title: "选择标题图标",
        options: deps.titleButtonIconOptionsElement,
        datasetKey: "iconName",
        current: popupItemElement?.properties?.icon || "",
        clear: "不使用图标",
      },
      {
        button: deps.lightStatisticsIconButtonElement,
        title: "选择统计图标",
        options: deps.lightStatisticsIconOptionsElement,
        datasetKey: "lightStatisticsIconName",
        current: String(
          Object.hasOwn(popupItemElement?.properties || {}, "icon")
            ? popupItemElement?.properties?.icon || ""
            : "mdi:lightbulb-group-outline",
        ),
        clear: "不使用图标",
      },
    ].find((onPopupActionsButtonClick) => onPopupActionsButtonClick.button === popupListMenuEvent);
  if (!popupMenuRect) return false;
  deps.runCopyBackup({
    kind: "icon",
    title: popupMenuRect.title,
    searchPlaceholder: "搜索图标名称",
    triggerButton: popupListMenuEvent,
    pageSize: EDITOR_PICKER_PAGE_SIZES2.icon,
    selectedText: "",
    emptyText: "没有匹配的图标",
    itemClass: "icon-grid",
    async getPage({
      query: isPopupActionsMenuHidden,
      page: onPopupActionsMenuClick,
      pageSize: popupActionsClickEvent,
    }: any) {
      const popupActionName = (onPopupActionsMenuClick - 1) * popupActionsClickEvent,
        popupActionTargetId = await deps.requestJson(
          "/icons?query=" +
            encodeURIComponent(isPopupActionsMenuHidden) +
            "&limit=" +
            popupActionsClickEvent +
            "&offset=" +
            popupActionName,
        );
      return {
        items: popupActionTargetId.items || [],
        total: Number(popupActionTargetId.total) || 0,
      };
    },
    renderLeadingItems: () => [],
    renderSelectedActions: () => [
      Object.assign(document.createElement("span"), {
        className: "editor-paged-picker-current-label",
        textContent: "当前选择",
      }),
      deps.createIconPickerClearOption(popupMenuRect.current, popupMenuRect.clear),
      deps.createEditorEntityPickerOption(popupMenuRect.clear, !popupMenuRect.current),
    ],
    renderItem(popupActionTargetIdState: any) {
      const qp2 = deps.createIconPickerClearOptionState(
        popupActionTargetIdState,
        popupMenuRect.current,
        "editorPickerValue",
      );
      return ((qp2.dataset.editorPickerValue = popupActionTargetIdState.name), qp2);
    },
    onSelect: (popupActionTargetIdValue: any) =>
      deps.runCopyTwin(popupMenuRect.options, popupMenuRect.datasetKey, popupActionTargetIdValue),
  });
  return true;
}

export function openEntityCopyBackupPicker(deps: CopyBackupPickersDeps, triggerElement: any) {
  const duplicatedPopupId = deps.removedComponent(),
    duplicatedPopupIdState = ["icon-button", "device-button", "presence-sensor"],
    duplicatedPopupIdValue =
      triggerElement === deps.imageEntityButtonElement
        ? "image"
        : triggerElement === deps.navigationEntityButtonElement && duplicatedPopupId?.type === "scene-mode"
          ? "scene-mode"
          : triggerElement === deps.iconButtonEntityButtonElement &&
              duplicatedPopupIdState.includes(duplicatedPopupId?.type)
            ? duplicatedPopupId.type
            : [
                "weather",
                "line-chart",
                "title-button",
                "light-statistics",
                "icon-button-effect",
                "vacuum-map",
                "camera",
                "air-conditioner",
                "navigation-button",
              ].find(
                (templatePageMatchValue) =>
                  deps.runExtraAlt(templatePageMatchValue).button === triggerElement,
              );
  if (!duplicatedPopupIdValue) return false;
  const draftGroupEntryState = deps.editorCtx.selectedComponentId;
  if (
    deps.popupBeingRenamed(
      triggerElement,
      () => openEntityCopyBackupPicker(deps, triggerElement),
      () => deps.editorCtx.selectedComponentId === draftGroupEntryState,
    )
  )
    return true;
  const ao7 = deps.runExtraAlt(duplicatedPopupIdValue),
    draftGroupComponentValue = duplicatedPopupId?.bindings?.entity?.entityId || "",
    targetComponentCollectionState =
      deps.runPortion(duplicatedPopupIdValue).find(
        (popupDuplicateDraftDocument: any) =>
          popupDuplicateDraftDocument.entityId === draftGroupComponentValue,
      ) || null,
    insertionCollectionState =
      duplicatedPopupIdValue === "scene-mode" ? null : deps.runSegment()[0] || null,
    popupToDuplicate = deps.editorEntityMatches(duplicatedPopupIdValue, "").findIndex(
      (popupToDuplicateState: any) => popupToDuplicateState.entityId === draftGroupComponentValue,
    );
  return (
    deps.runCopyBackup({
      kind: "entity",
      title: "选择实体",
      subtitle:
        deps.editorPickerComponentTypeLabel(duplicatedPopupIdValue) + " · " + deps.entityPickerHintText,
      searchPlaceholder: "搜索实体名称或 ID",
      triggerButton: triggerElement,
      pageSize: EDITOR_PICKER_PAGE_SIZES2.entity,
      initialPage: editorEntityPickerInitialPage2(popupToDuplicate, insertionCollectionState),
      selectedText: draftGroupComponentValue || "不使用实体",
      emptyText: "没有匹配的实体",
      itemClass: "entity-list",
      getPage({ query: popupToDuplicateValue, page: popupToDuplicateConfig }: any) {
        const yw2 = deps.editorEntityMatches(duplicatedPopupIdValue, popupToDuplicateValue);
        return editorEntityPickerPage2(yw2, popupToDuplicateConfig, insertionCollectionState);
      },
      renderLeadingItems: (popupToDuplicateRef: any) =>
        popupToDuplicateRef.page === 1 && insertionCollectionState
          ? [deps.createIconPickerOption(insertionCollectionState, draftGroupComponentValue)]
          : [],
      renderSelectedContent: () => [
        deps.createEditorPickerCurrentEntity(targetComponentCollectionState),
      ],
      renderSelectedActions: () => [
        deps.createEditorEntityPickerOption("不使用实体", !draftGroupComponentValue),
      ],
      renderItem: (popupDuplicateMatchState: any) =>
        deps.createIconPickerOption(popupDuplicateMatchState, draftGroupComponentValue),
      onSelect: (popupDuplicateMatchValue: any) =>
        deps.runCopyTwin(ao7.options, "entityId", popupDuplicateMatchValue),
    }),
    true
  );
}

export function openLightStatisticsCopyBackupPicker(deps: CopyBackupPickersDeps) {
  if (deps.removedComponent()?.type !== "light-statistics") return false;
  const templateLabelState = deps.editorCtx.selectedComponentId;
  if (
    deps.popupBeingRenamed(
      deps.lightStatisticsEntityButtonElement,
      (...selfArgs: any[]) => (openLightStatisticsCopyBackupPicker as any)(deps, ...selfArgs),
      () =>
        deps.editorCtx.selectedComponentId === templateLabelState &&
        deps.removedComponent()?.type === "light-statistics",
    )
  )
    return true;
  const popupDuplicateMatchHandler = (popupDuplicateMatch: any) => {
      const duplicatedPopup = String(popupDuplicateMatch || "")
        .trim()
        .toLocaleLowerCase("zh-CN");
      return deps.runPortion("light-statistics")
        .map((mappedItemsOrder: any, mappedItemsScope: any) => ({
          entity: mappedItemsOrder,
          index: mappedItemsScope,
          support: lightStatisticsEntitySupport2(mappedItemsOrder),
        }))
        .filter(
          ({ entity: popupModuleCopyState }: any) =>
            !duplicatedPopup ||
            (
              deps.runMode(popupModuleCopyState) +
              " " +
              deps.renderNavigationIconPreview(popupModuleCopyState)
            )
              .toLocaleLowerCase("zh-CN")
              .includes(duplicatedPopup),
        )
        .sort(
          (popupModuleCopyValue: any, popupModuleCopyConfig: any) =>
            Number(popupModuleCopyConfig.support.supported) -
              Number(popupModuleCopyValue.support.supported) ||
            +(deps.renderNavigationIconPreview(popupModuleCopyConfig.entity) === "light") -
              +(deps.renderNavigationIconPreview(popupModuleCopyValue.entity) === "light") ||
            popupModuleCopyValue.index - popupModuleCopyConfig.index,
        )
        .map(({ entity: popupModuleCopy }: any) => popupModuleCopy);
    },
    popupToDelete = popupDuplicateMatchHandler("").findIndex(
      (popupToDeleteState: any) => popupToDeleteState.entityId === deps.editorCtx.statisticsEntityId,
    ),
    popupDeleteCandidateState = deps.runSegment()[0] || null;
    deps.runCopyBackup({
      kind: "entity",
      title: deps.editorCtx.statisticsReplaceIndex >= 0 ? "选择替换实体" : "添加统计实体",
      subtitle: deps.entityPickerHintText,
      searchPlaceholder: "搜索实体名称或 ID",
      triggerButton: deps.lightStatisticsEntityButtonElement,
      pageSize: EDITOR_PICKER_PAGE_SIZES2.entity,
      initialPage: editorEntityPickerInitialPage2(popupToDelete, popupDeleteCandidateState),
      selectedText: deps.editorCtx.statisticsEntityId || "不使用实体",
      emptyText: "没有匹配的实体",
      itemClass: "entity-list",
      closeLegacyPickers: false,
      getPage({ query: popupDeleteCandidate, page: bindPopupModuleSection }: any) {
        const createdComponentState = popupDuplicateMatchHandler(popupDeleteCandidate);
        return editorEntityPickerPage2(
          createdComponentState,
          bindPopupModuleSection,
          popupDeleteCandidateState,
        );
      },
      renderLeadingItems: (onDeletePopupDialogClose: any) =>
        onDeletePopupDialogClose.page === 1 && popupDeleteCandidateState
          ? [deps.createIconPickerOption(popupDeleteCandidateState, deps.editorCtx.statisticsEntityId)]
          : [],
      renderItem: (onDeletePopupConfirmButtonClick: any) =>
        deps.createIconPickerOption(onDeletePopupConfirmButtonClick, deps.editorCtx.statisticsEntityId),
      onSelect: (popupIdToDelete: any) =>
        deps.runCopyTwin(
          deps.lightStatisticsEntityOptionsElement,
          "lightStatisticsEntityId",
          popupIdToDelete,
        ),
    });
  return true;
}

export function openPopupEntityCopyBackupPicker(deps: CopyBackupPickersDeps, popupDeleteDraftDocumentElement: any) {
  const groupWidth = popupDeleteDraftDocumentElement.closest("[data-action-trigger]"),
    popupDeleteDraftDocument = groupWidth?.querySelector("[data-popup-entity]"),
    popupEntityOptionsElement = groupWidth?.querySelector("[data-popup-entity-options]");
  if (!groupWidth || !popupDeleteDraftDocument || !popupEntityOptionsElement) return false;
  if (
    deps.popupBeingRenamed(
      popupDeleteDraftDocumentElement,
      () => openPopupEntityCopyBackupPicker(deps, popupDeleteDraftDocumentElement),
      () => groupWidth.isConnected,
    )
  )
    return true;
  const popupIdMatchValue = popupDeleteDraftDocument.value || "",
    popupIdMatchConfig =
      deps.editorCtx.entities.find((popupIdMatch: any) => popupIdMatch.entityId === popupIdMatchValue) || null,
    clearPopupModuleReferencesState = deps.runSegment()[0] || null,
    clearPopupModuleReferences = (clearPopupModuleReferencesValue: any) => {
      const groupHeight = String(clearPopupModuleReferencesValue || "")
        .trim()
        .toLocaleLowerCase("zh-CN");
      return deps.editorCtx.entities.filter(
        (componentNodesState: any) =>
          !componentNodesState.virtual &&
          (!groupHeight ||
            (deps.runMode(componentNodesState) + " " + componentNodesState.entityId)
              .toLocaleLowerCase("zh-CN")
              .includes(groupHeight)),
      );
    },
    createdWidthState = clearPopupModuleReferences("").findIndex(
      (componentNodes: any) => componentNodes.entityId === popupIdMatchValue,
    );
  return (
    deps.runCopyBackup({
      kind: "entity",
      title: "选择弹窗实体",
      subtitle: deps.entityPickerHintText,
      searchPlaceholder: "搜索实体名称或 ID",
      triggerButton: popupDeleteDraftDocumentElement,
      pageSize: EDITOR_PICKER_PAGE_SIZES2.entity,
      initialPage: editorEntityPickerInitialPage2(
        createdWidthState,
        clearPopupModuleReferencesState,
      ),
      selectedText: popupIdMatchValue || "不使用实体",
      emptyText: "没有匹配的实体",
      itemClass: "entity-list",
      getPage({ query: componentNode, page: componentActionKey }: any) {
        const createdHeightValue = clearPopupModuleReferences(componentNode);
        return editorEntityPickerPage2(
          createdHeightValue,
          componentActionKey,
          clearPopupModuleReferencesState,
        );
      },
      renderItem: (componentActionValue: any) =>
        deps.createIconPickerOption(componentActionValue, popupIdMatchValue),
      renderLeadingItems: (popupPage: any) =>
        popupPage.page === 1 && clearPopupModuleReferencesState
          ? [deps.createIconPickerOption(clearPopupModuleReferencesState, popupIdMatchValue)]
          : [],
      renderSelectedContent: () => [deps.createEditorPickerCurrentEntity(popupIdMatchConfig)],
      renderSelectedActions: () => [
        deps.createEditorEntityPickerOption("不使用实体", !popupIdMatchValue),
      ],
      onSelect: (onPopupModuleCloseButtonClick: any) =>
        deps.runCopyTwin(popupEntityOptionsElement, "popupActionEntityId", onPopupModuleCloseButtonClick),
    }),
    true
  );
}

export function onPopupModuleCancelButtonClick(deps: CopyBackupPickersDeps) {
  if (!deps.popupModuleDialogElement.open) return false;
  if (
    deps.popupBeingRenamed(
      deps.popupModuleEntityButtonElement,
      (...selfArgs: any[]) => (onPopupModuleCancelButtonClick as any)(deps, ...selfArgs),
      () => deps.popupModuleDialogElement.open,
    )
  )
    return true;
  const onPopupModuleCancelButtonClickState = deps.popupModuleFormElement.elements.entityId.value || "",
    onPopupModuleEntityButtonClickState =
      deps.editorCtx.entities.find(
        (onPopupModuleEntityButtonClick: any) =>
          onPopupModuleEntityButtonClick.entityId === onPopupModuleCancelButtonClickState,
      ) || null,
    isPopupModuleEntityMenuHidden = deps.runSegment()[0] || null,
    isPopupModuleEntityMenuHiddenHandler = (onSoundToggleButtonClickState: any) => {
      const soundToggleDocument = String(onSoundToggleButtonClickState || "")
        .trim()
        .toLocaleLowerCase("zh-CN");
      return deps.editorCtx.entities
        .map((mappedItemsRange: any, mappedItemsSpan: any) => ({
          entity: mappedItemsRange,
          index: mappedItemsSpan,
        }))
        .filter(
          ({ entity: onShowPageEditorButtonClickValue }: any) =>
            !onShowPageEditorButtonClickValue.virtual &&
            (!soundToggleDocument ||
              (
                deps.runMode(onShowPageEditorButtonClickValue) +
                " " +
                onShowPageEditorButtonClickValue.entityId
              )
                .toLocaleLowerCase("zh-CN")
                .includes(soundToggleDocument)),
        )
        .sort(
          (onShowPopupEditorButtonClickState: any, onProjectSelectChangeState: any) =>
            Number(
              popupModuleEntityRecommended2(
                onProjectSelectChangeState.entity,
                deps.popupModuleFormElement.elements.type.value,
              ),
            ) -
              Number(
                popupModuleEntityRecommended2(
                  onShowPopupEditorButtonClickState.entity,
                  deps.popupModuleFormElement.elements.type.value,
                ),
              ) || onShowPopupEditorButtonClickState.index - onProjectSelectChangeState.index,
        )
        .map(({ entity: mappedItemsOffset }: any) => mappedItemsOffset);
    },
    selectedPageComponentState = isPopupModuleEntityMenuHiddenHandler("").findIndex(
      (onPopupModuleEntitySearchInputInput: any) =>
        onPopupModuleEntitySearchInputInput.entityId === onPopupModuleCancelButtonClickState,
    );
  return (
    deps.runCopyBackup({
      kind: "entity",
      title: "选择模块实体",
      subtitle: deps.entityPickerHintText,
      searchPlaceholder: "搜索实体名称或 ID",
      triggerButton: deps.popupModuleEntityButtonElement,
      pageSize: EDITOR_PICKER_PAGE_SIZES2.entity,
      initialPage: editorEntityPickerInitialPage2(
        selectedPageComponentState,
        isPopupModuleEntityMenuHidden,
      ),
      selectedText: onPopupModuleCancelButtonClickState || "不使用实体",
      emptyText: "没有匹配的实体",
      itemClass: "entity-list",
      getPage({ query: onPopupModuleEntityOptionsClick, page: popupModuleEntityClickEvent }: any) {
        const popupModuleEntityElement = isPopupModuleEntityMenuHiddenHandler(
          onPopupModuleEntityOptionsClick,
        );
        return editorEntityPickerPage2(
          popupModuleEntityElement,
          popupModuleEntityClickEvent,
          isPopupModuleEntityMenuHidden,
        );
      },
      renderItem: (onPopupNewButtonClickState: any) =>
        deps.createIconPickerOption(onPopupNewButtonClickState, onPopupModuleCancelButtonClickState),
      renderLeadingItems: (onPopupNameCloseButtonClickState: any) =>
        onPopupNameCloseButtonClickState.page === 1 && isPopupModuleEntityMenuHidden
          ? [
              deps.createIconPickerOption(
                isPopupModuleEntityMenuHidden,
                onPopupModuleCancelButtonClickState,
              ),
            ]
          : [],
      renderSelectedContent: () => [
        deps.createEditorPickerCurrentEntity(onPopupModuleEntityButtonClickState),
      ],
      renderSelectedActions: () => [
        deps.createEditorEntityPickerOption("不使用实体", !onPopupModuleCancelButtonClickState),
      ],
      onSelect: (onPopupNameCancelButtonClickState: any) =>
        deps.runCopyTwin(
          deps.popupModuleEntityOptionsElement,
          "popupModuleEntityId",
          onPopupNameCancelButtonClickState,
        ),
    }),
    true
  );
}

