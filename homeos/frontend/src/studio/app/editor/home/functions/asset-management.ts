/* 资源管理（文件夹/删除、弹窗模块、会话、颜色选择器） */
import type { EditorContext } from "../editor-context";
import { EDITOR_PICKER_PAGE_SIZES as EDITOR_PICKER_PAGE_SIZES2 } from "../../picker/editor-picker-pagination";
import { findCustomPopup as findCustomPopup2 } from "../../editor-document-management";
import { findComponent as findComponent2 } from "../../component-tree";
import { applyPercentageBarChange as applyPercentageBarChange2, percentageBarDefaults as percentageBarDefaults2 } from "../../../shared/percentage-bar-model";
import { clone as clone2 } from "../../editor-utils";
import { createNavigationStyleApplyOption } from "../../navigation-style-apply/target-options";

export interface AssetManagementDeps {
  editorCtx: EditorContext;
  assetMatchesId: any;
  canDeleteAssetFolder: any;
  createAssetOptionButton: (...args: any[]) => HTMLElement;
  createEditorEntityPickerOption: any;
  createEditorPickerCurrentAsset: any;
  createIconPickerOption: any;
  deleteAssetDialogElement: any;
  deleteAssetFolderCountElement: any;
  deleteAssetFolderDialogElement: any;
  deleteAssetFolderNameElement: any;
  deleteAssetNameElement: any;
  deletePopupDialogElement: any;
  destroyDashboardPreview: any;
  editorAssetMatcher: any;
  editorAssetToolbar: any;
  ensureEntitiesLoaded: any;
  exportedAssetsInFolder: any;
  findAssetById: any;
  findReplaceableComponents: any;
  formatLastSeen: any;
  handleOperationError: any;
  ibeAssetButtonElement: any;
  ibeAssetMenuElement: any;
  ibeAssetOptionsElement: any;
  ibeAssetSearchElement: any;
  ibeAssetUploadElement: any;
  imageAssetButtonElement: any;
  imageAssetLargePreviewImageElement: any;
  imageAssetMenuElement: any;
  imageAssetOptionsElement: any;
  imageAssetSearchInputElement: any;
  imageAssetUploadButtonElement: any;
  leftFolderName: any;
  mutateDocument: any;
  mutationRecord: any;
  navigationStyleApplyDialogElement: any;
  navigationStyleApplyMessageElement: any;
  navigationStyleApplyPropertiesElement: any;
  navigationStyleApplySummaryElement: any;
  navigationStyleApplyTargetHeadingElement: any;
  navigationStyleApplyTargetScopeElement: any;
  navigationStyleApplyTitleElement: any;
  popupNameDialogElement: any;
  popupNameDialogTitleElement: any;
  popupNameFormElement: any;
  positionEffectAssetMenu: any;
  positionImageAssetMenu: any;
  reloadAssetCatalog: any;
  removedComponent: any;
  renderEffectAssetOptions: any;
  renderImageAssetOptions: any;
  requestJson: any;
  runCopyBackup: any;
  runCopyFirst: any;
  runCopyLower: any;
  runCopyTwin: any;
  runMode: any;
  runShadow: any;
  runSnapshot: any;
  runVariantLower: any;
  saturationPointerMoveEventState: any;
  scheduleAssetPreview: any;
  selectableEntities: any;
  selectedComponentIdsFromDom: any;
  setComponentsRotation: any;
  syncAssetFolderOptions: any;
}

export function onPopupModuleClimateDeviceTypeClick(deps: AssetManagementDeps, climateDeviceTypeClickEvent: any) {
  const climateDeviceTypeClickEventState =
    climateDeviceTypeClickEvent === deps.imageAssetButtonElement
      ? "image"
      : climateDeviceTypeClickEvent === deps.ibeAssetButtonElement
        ? "ibe"
        : "";
  if (!climateDeviceTypeClickEventState) return false;
  const isClimateDeviceTypeClickEvent = climateDeviceTypeClickEventState === "image",
    climateDeviceTypeElementState = deps.removedComponent(),
    climateDeviceTypeElementValue = isClimateDeviceTypeClickEvent
      ? climateDeviceTypeElementState?.properties?.assetId || ""
      : climateDeviceTypeElementState?.properties?.effectAssetId || "",
    sn5 = deps.findAssetById(climateDeviceTypeElementValue);
  deps.reloadAssetCatalog({
    refreshInspector: false,
  })
    .then(() => {
      deps.editorCtx.popupBeingRenamedValue?.triggerButton === climateDeviceTypeClickEvent &&
        (deps.editorCtx.popupBeingRenamedValue.syncAssetToolbar?.(), deps.editorCtx.popupBeingRenamedValue.refresh());
    })
    .catch(deps.handleOperationError);
  const climateDeviceTypeElement = deps.editorAssetMatcher(climateDeviceTypeClickEventState).findIndex(
    (climateDeviceTypeElementConfig: any) =>
      deps.assetMatchesId(climateDeviceTypeElementConfig, climateDeviceTypeElementValue),
  );
  return (
    deps.runCopyBackup({
      kind: climateDeviceTypeClickEventState + "-asset",
      title: isClimateDeviceTypeClickEvent ? "选择控件图片" : "选择效果图片",
      subtitle: "我的图片与HomeOS素材 · 固定分页加载",
      searchPlaceholder: "搜索图片名称",
      triggerButton: climateDeviceTypeClickEvent,
      pageSize: EDITOR_PICKER_PAGE_SIZES2.asset,
      initialPage:
        climateDeviceTypeElement < 0
          ? 1
          : Math.floor(climateDeviceTypeElement / EDITOR_PICKER_PAGE_SIZES2.asset) + 1,
      selectedText: sn5?.name || climateDeviceTypeElementValue || "不使用图片",
      emptyText: "没有匹配的图片",
      itemClass: "asset-grid",
      getPage({
        query: onTargetChangeState,
        page: onTargetChange,
        pageSize: onPopupModuleFormSubmit,
      }: any) {
        const vw2 = deps.editorAssetMatcher(climateDeviceTypeClickEventState, onTargetChangeState),
          popupModuleSubmitEventState = (onTargetChange - 1) * onPopupModuleFormSubmit;
        return {
          items: vw2.slice(
            popupModuleSubmitEventState,
            popupModuleSubmitEventState + onPopupModuleFormSubmit,
          ),
          total: vw2.length,
        };
      },
      renderSelectedContent: () => [deps.createEditorPickerCurrentAsset(sn5)],
      renderSelectedActions: () => [
        deps.createEditorEntityPickerOption("不使用图片", !climateDeviceTypeElementValue),
      ],
      renderItem(popupModuleSubmitEvent: any) {
        const nm2 = deps.createAssetOptionButton(popupModuleSubmitEvent, climateDeviceTypeElementValue),
          popupModuleTargetPopupIdElement = nm2.matches?.("[data-asset-id]")
            ? nm2
            : nm2.querySelector<HTMLElement>("[data-asset-id]");
        return (
          popupModuleTargetPopupIdElement &&
            (popupModuleTargetPopupIdElement.dataset.editorPickerValue =
              popupModuleSubmitEvent.assetId),
          nm2
        );
      },
      buildToolbar: (popupModuleTargetPopupId: any) =>
        deps.editorAssetToolbar(climateDeviceTypeClickEventState, popupModuleTargetPopupId),
      onItemHover: (popupModuleTargetPopupIdState: any, popupModuleTargetPopupIdValue: any) =>
        deps.scheduleAssetPreview(
          deps.findAssetById(popupModuleTargetPopupIdState),
          popupModuleTargetPopupIdValue,
          deps.editorCtx.popupBeingRenamedValue?.dialog,
        ),
      onDelete: deps.runCopyFirst,
      onSelect: (popupModuleTypeState: any) =>
        deps.runCopyTwin(
          isClimateDeviceTypeClickEvent ? deps.imageAssetOptionsElement : deps.ibeAssetOptionsElement,
          "assetId",
          popupModuleTypeState,
        ),
    })?.dialog.append(deps.imageAssetLargePreviewImageElement),
    true
  );
}

export function selectAssetFolder(deps: AssetManagementDeps, assetKind: any, folderKind: any) {
  const popupModuleType = folderKind === "user" ? "user" : "builtin";
  assetKind === "image"
    ? ((deps.editorCtx.imageAssetFolder = popupModuleType),
      (deps.imageAssetSearchInputElement.value = ""),
      deps.leftFolderName("image"),
      deps.syncAssetFolderOptions("image"),
      deps.editorCtx.popupBeingRenamedValue?.kind === "image-asset"
        ? (deps.editorCtx.popupBeingRenamedValue.rebuildToolbar(),
          deps.editorCtx.popupBeingRenamedValue.refresh({
            resetPage: true,
          }))
        : (deps.renderImageAssetOptions(), deps.positionImageAssetMenu()))
    : ((deps.editorCtx.effectAssetFolder = popupModuleType),
      (deps.ibeAssetSearchElement.value = ""),
      deps.leftFolderName("ibe"),
      deps.syncAssetFolderOptions("ibe"),
      deps.editorCtx.popupBeingRenamedValue?.kind === "ibe-asset"
        ? (deps.editorCtx.popupBeingRenamedValue.rebuildToolbar(),
          deps.editorCtx.popupBeingRenamedValue.refresh({
            resetPage: true,
          }))
        : (deps.renderEffectAssetOptions(), deps.positionEffectAssetMenu()));
}

export async function popupModuleTypeValue(deps: AssetManagementDeps, popupModuleTypeConfig: any, popupModuleTypeRef: any) {
  const popupModuleTypeEntry = [...(popupModuleTypeConfig || [])];
  if (!popupModuleTypeEntry.length) return;
  const Rf2 =
    popupModuleTypeRef === "image" ? deps.imageAssetUploadButtonElement : deps.ibeAssetUploadElement;
  Rf2.disabled = true;
  const popupModuleTypeRecord: any[] = [];
  try {
    for (const popupModuleTypeName of popupModuleTypeEntry) {
      if (!/\.(png|jpe?g|webp|svg)$/i.test(popupModuleTypeName.name)) {
        popupModuleTypeRecord.push(
          popupModuleTypeName.name + "：仅支持 PNG、JPG、JPEG、WebP 和 SVG",
        );
        continue;
      }
      try {
        await deps.requestJson("/assets/user", {
          method: "POST",

          timeoutMs: 120000,
          body: popupModuleTypeName,
          headers: {
            "Content-Type": popupModuleTypeName.type || "application/octet-stream",
            "X-File-Name": encodeURIComponent(popupModuleTypeName.name),
          },
        });
      } catch (caughtErrorCount: any) {
        popupModuleTypeRecord.push(popupModuleTypeName.name + "：" + caughtErrorCount.message);
      }
    }
    (await deps.reloadAssetCatalog({
      refreshInspector: false,
    }),
      deps.runCopyLower(popupModuleTypeRef, "user"),
      popupModuleTypeRecord.length &&
        deps.handleOperationError(new Error(popupModuleTypeRecord.join("\n"))));
  } finally {
    Rf2.disabled = false;
  }
}

export function requestDeleteUserAsset(deps: AssetManagementDeps, assetId: any) {
  const sn6 = deps.findAssetById(assetId);
  if (!sn6 || sn6.source !== "user") return;
  const popupModuleSubmitEntityIdHandler = (popupModuleSubmitEntityIdState: any) =>
    Array.isArray(popupModuleSubmitEntityIdState)
      ? popupModuleSubmitEntityIdState.some(popupModuleSubmitEntityIdHandler)
      : popupModuleSubmitEntityIdState && typeof popupModuleSubmitEntityIdState == "object"
        ? Object.values(popupModuleSubmitEntityIdState).some(popupModuleSubmitEntityIdHandler)
        : popupModuleSubmitEntityIdState === sn6.assetId;
  if (popupModuleSubmitEntityIdHandler(deps.editorCtx.activeProject?.document)) {
    (deps.runShadow(),
      deps.handleOperationError(
        new Error("这张图片正在被当前仪表盘或弹窗使用，请先替换或移除后再删除。"),
      ));
    return;
  }
  ((deps.editorCtx.pendingDeleteAssetId = sn6.assetId),
    (deps.deleteAssetNameElement.textContent = "“" + sn6.name + "”"),
    deps.runShadow(),
    deps.deleteAssetDialogElement.showModal());
}

export function requestDeleteAssetFolder(deps: AssetManagementDeps, assetKind: any, folderName: any) {
  if (
    !deps.canDeleteAssetFolder(assetKind === "image" ? deps.editorCtx.imageAssetFolder : deps.editorCtx.effectAssetFolder, folderName)
  )
    return;
  const hL2 = deps.exportedAssetsInFolder(folderName),
    popupModuleSubmitEntityId = "studio3d:" + folderName + "/",
    popupModuleSubmitEntityIdCallback = (popupModuleSubmitEntityIdValue: any) =>
      Array.isArray(popupModuleSubmitEntityIdValue)
        ? popupModuleSubmitEntityIdValue.some(popupModuleSubmitEntityIdCallback)
        : popupModuleSubmitEntityIdValue && typeof popupModuleSubmitEntityIdValue == "object"
          ? Object.values(popupModuleSubmitEntityIdValue).some(popupModuleSubmitEntityIdCallback)
          : typeof popupModuleSubmitEntityIdValue == "string" &&
            popupModuleSubmitEntityIdValue.startsWith(popupModuleSubmitEntityId);
  if (popupModuleSubmitEntityIdCallback(deps.editorCtx.activeProject?.document)) {
    deps.handleOperationError(
      new Error("这个文件夹中的图片正在被当前仪表盘或弹窗使用，请先替换或移除后再删除。"),
    );
    return;
  }
  ((deps.editorCtx.pendingDeleteAssetFolder = {
    kind: assetKind,
    folderName: folderName,
  }),
    (deps.deleteAssetFolderNameElement.textContent = "“" + folderName + "”"),
    (deps.deleteAssetFolderCountElement.textContent = String(hL2.length)),
    deps.deleteAssetFolderDialogElement.showModal());
}

export function refreshAssetPickers(deps: AssetManagementDeps) {
  (deps.leftFolderName("image"),
    deps.leftFolderName("ibe"),
    deps.renderImageAssetOptions(deps.imageAssetSearchInputElement.value),
    deps.renderEffectAssetOptions(deps.ibeAssetSearchElement.value),
    (deps.editorCtx.popupBeingRenamedValue?.kind === "image-asset" ||
      deps.editorCtx.popupBeingRenamedValue?.kind === "ibe-asset") &&
      (deps.editorCtx.popupBeingRenamedValue.syncAssetToolbar?.(),
      deps.editorCtx.popupBeingRenamedValue.refresh({
        resetPage: true,
      })),
    deps.imageAssetMenuElement.hidden || deps.positionImageAssetMenu(),
    deps.ibeAssetMenuElement.hidden || deps.positionEffectAssetMenu());
}

export function scaleDraftDocument(deps: AssetManagementDeps, scaledPlacement: any) {
  deps.editorCtx.popupDialogMode = scaledPlacement;
  const popupToDuplicateEntry = findCustomPopup2(deps.editorCtx.activeProject?.document, deps.editorCtx.selectedPopupId);
  ((deps.popupNameDialogTitleElement.textContent =
    scaledPlacement === "rename" ? "重命名组合弹窗" : "新建组合弹窗"),
    (deps.popupNameFormElement.elements.name.value =
      scaledPlacement === "rename" ? popupToDuplicateEntry?.name || "" : "新建组合弹窗"),
    deps.popupNameDialogElement.showModal(),
    deps.popupNameFormElement.elements.name.select());
}

export function cancelDeletePopupDialog(deps: AssetManagementDeps) {
  ((deps.editorCtx.popupModuleDraft = null), deps.deletePopupDialogElement.close());
}

export async function onSessionsRevokeOthersConfirmButtonClick(deps: AssetManagementDeps, 
  revokeOtherSessionsError: any,
  onSessionsRevokeCloseButtonClick: any,
  onSessionsRevokeCancelButtonClick: any,
  onSessionsRevokeConfirmButtonClick: any,
) {
  const Ie9 = deps.editorCtx.componentScopeState,
    onSessionsRevokeConfirmButtonClickState = deps.editorCtx.activeProject?.projectId,
    revokedSessionIdHandler = () =>
      deps.editorCtx.componentScopeState === Ie9 &&
      deps.editorCtx.activeProject?.projectId === onSessionsRevokeConfirmButtonClickState &&
      deps.editorCtx.selectedComponentId === onSessionsRevokeCloseButtonClick &&
      deps.removedComponent()?.properties?.controlMode === "entity-sign";
  revokeOtherSessionsError.disabled = true;
  try {
    if (
      (deps.editorCtx.isAreEntitiesLoaded || (await deps.ensureEntitiesLoaded()),
      !revokedSessionIdHandler() || !revokeOtherSessionsError.isConnected)
    )
      return;
    const revokedSessionId = await deps.requestJson("/ha/numeric-sources");
    if (!revokedSessionIdHandler() || !revokeOtherSessionsError.isConnected) return;
    const mappedItemByIdByName = new Map(
        deps.editorCtx.entities.map((revokeSessionError: any) => [revokeSessionError.entityId, revokeSessionError]),
      ),
      availableItemsValue = (revokedSessionId.items || []).map(
        (onDisplayPairingCustomCodeTextInputInput: any) => ({
          ...(mappedItemByIdByName.get(onDisplayPairingCustomCodeTextInputInput.entityId) || {}),
          ...onDisplayPairingCustomCodeTextInputInput,
          name:
            (mappedItemByIdByName.get(onDisplayPairingCustomCodeTextInputInput.entityId) as any)
              ?.name ||
            onDisplayPairingCustomCodeTextInputInput.name ||
            onDisplayPairingCustomCodeTextInputInput.entityId,
        }),
      );
    deps.runCopyBackup({
      kind: "entity",
      title: "选择流水线条数值实体",
      subtitle: "正数正向，负数反向，0 或不可用时只显示底线",
      searchPlaceholder: "搜索实体名称或 ID",
      triggerButton: revokeOtherSessionsError,
      pageSize: 20,
      selectedText: onSessionsRevokeCancelButtonClick || "未绑定",
      emptyText: "没有匹配的实体",
      itemClass: "entity-list",
      getPage({
        query: onLogoutButtonClick,
        page: onGlobalColorPickerSaturationValuePointerdown,
        pageSize: saturationPointerDownEvent,
      }: any) {
        const split = String(onLogoutButtonClick || "")
            .toLowerCase()
            .trim()
            .split(/\s+/),
          filteredItemsText = availableItemsValue.filter(
            (onGlobalColorPickerSaturationValuePointermove: any) =>
              split.every((saturationPointerMoveEvent) =>
                (
                  deps.runMode(onGlobalColorPickerSaturationValuePointermove) +
                  " " +
                  onGlobalColorPickerSaturationValuePointermove.entityId
                )
                  .toLowerCase()
                  .includes(saturationPointerMoveEvent),
              ),
          );
        return {
          items: filteredItemsText.slice(
            (onGlobalColorPickerSaturationValuePointerdown - 1) * saturationPointerDownEvent,
            onGlobalColorPickerSaturationValuePointerdown * saturationPointerDownEvent,
          ),
          total: filteredItemsText.length,
        };
      },
      renderSelectedActions: () => [
        deps.createEditorEntityPickerOption("清除绑定", !onSessionsRevokeCancelButtonClick),
      ],
      renderItem: (onGlobalColorPickerSaturationValuePointerup: any) => {
        const qt2 = deps.createIconPickerOption(
          onGlobalColorPickerSaturationValuePointerup,
          onSessionsRevokeCancelButtonClick,
        );
        return (
          onGlobalColorPickerSaturationValuePointerup.unavailable &&
            qt2.querySelector(".inspector-entity-name")!.prepend("暂不可用 · "),
          qt2
        );
      },
      onSelect: (saturationPointerUpEvent: any) => {
        if (revokedSessionIdHandler())
          return onSessionsRevokeConfirmButtonClick(saturationPointerUpEvent);
      },
    });
  } catch (onGlobalColorPickerHueRangeInputInput: any) {
    revokedSessionIdHandler() &&
      revokeOtherSessionsError.isConnected &&
      deps.handleOperationError(onGlobalColorPickerHueRangeInputInput);
  } finally {
    revokeOtherSessionsError.disabled = false;
  }
}

export function onGlobalColorPickerHexTextInputInput(deps: AssetManagementDeps, component: any) {
  const hexColorInputValue = component?.id;
  return {
    document: deps.editorCtx.activeProject?.document,
    entities: deps.editorCtx.entities,
    entityName: deps.runSnapshot,
    enhance: (onSessionsRevokeCloseButtonClickState: any) => {
      (deps.selectableEntities(onSessionsRevokeCloseButtonClickState),
        deps.destroyDashboardPreview(onSessionsRevokeCloseButtonClickState),
        deps.formatLastSeen(onSessionsRevokeCloseButtonClickState));
    },
    change: (onSessionsRevokeCancelButtonClickState: any) => {
      const il4 =
        onSessionsRevokeCancelButtonClickState.geometry === "rotation"
          ? deps.selectedComponentIdsFromDom()
          : [];
      return deps.mutateDocument((onSessionsRevokeConfirmButtonClickValue: any) => {
        const revokedSessionIdState = findComponent2(
          onSessionsRevokeConfirmButtonClickValue,
          hexColorInputValue,
        )?.component;
        revokedSessionIdState?.type === "percentage-bar" &&
          (onSessionsRevokeCancelButtonClickState.geometry === "rotation" && il4.length > 1
            ? deps.setComponentsRotation(
                onSessionsRevokeConfirmButtonClickValue,
                hexColorInputValue,
                onSessionsRevokeCancelButtonClickState.value,
                il4,
              )
            : applyPercentageBarChange2(
                revokedSessionIdState,
                onSessionsRevokeCancelButtonClickState,
                onSessionsRevokeConfirmButtonClickValue.canvas,
              ));
      });
    },
    canApplyStyle:
      component?.type === "percentage-bar" && deps.findReplaceableComponents(component).length > 0,
    applyStyle: deps.mutationRecord,
    previewProperty: (
      onGlobalColorPickerHexTextInputChangeState: any,
      onGlobalColorPickerHexTextInputChange: any,
    ) => {
      const hexColorChangeInput = clone2(component);
      (applyPercentageBarChange2(
        hexColorChangeInput,
        {
          property: onGlobalColorPickerHexTextInputChangeState,
          value: onGlobalColorPickerHexTextInputChange,
        },
        deps.editorCtx.activeProject.document.canvas,
      ),
        deps.editorCtx.editorRenderer?.previewComponentTransform(hexColorInputValue, hexColorChangeInput.position),
        deps.editorCtx.editorRenderer?.previewComponentProperties(
          hexColorInputValue,
          hexColorChangeInput.properties,
        ));
    },
    previewGeometry: (onDisplayPairingCustomCodeTextInputInputState: any, onLogoutButtonClickState: any) => {
      const canvas = deps.editorCtx.activeProject.document.canvas,
        position = component.position;
      if (
        onDisplayPairingCustomCodeTextInputInputState === "rotation" &&
        deps.selectedComponentIdsFromDom().length > 1
      )
        return;
      const hexColorChangeInputState =
        onDisplayPairingCustomCodeTextInputInputState === "left"
          ? {
              x: (canvas.width * onLogoutButtonClickState) / 100 - position.width / 2,
            }
          : onDisplayPairingCustomCodeTextInputInputState === "top"
            ? {
                y: (canvas.height * onLogoutButtonClickState) / 100 - position.height / 2,
              }
            : onDisplayPairingCustomCodeTextInputInputState === "scale"
              ? {
                  scale: onLogoutButtonClickState / 100,
                }
              : {
                  rotation: onLogoutButtonClickState,
                };
      deps.editorCtx.editorRenderer?.previewComponentTransform(hexColorInputValue, hexColorChangeInputState);
    },
    pickEntity: (
      onGlobalColorPickerSaturationValuePointerdownState: any,
      saturationPointerDownEventState: any,
      onGlobalColorPickerSaturationValuePointermoveState: any,
    ) =>
      deps.saturationPointerMoveEventState(
        onGlobalColorPickerSaturationValuePointerdownState,
        hexColorInputValue,
        saturationPointerDownEventState,
        onGlobalColorPickerSaturationValuePointermoveState,
      ),
  };
}

export async function saturationPointerMoveEventState(deps: AssetManagementDeps, 
  colorChannelInput: any,
  onGlobalColorPickerCopyButtonClick: any,
  copyColorError: any,
  onGlobalColorPickerPasteButtonClick: any,
) {
  const clipboardRawText = deps.editorCtx.componentScopeState,
    clipboardRawTextState = deps.editorCtx.activeProject?.projectId,
    clipboardHexColor = () =>
      deps.editorCtx.componentScopeState === clipboardRawText &&
      deps.editorCtx.activeProject?.projectId === clipboardRawTextState &&
      deps.editorCtx.selectedComponentId === onGlobalColorPickerCopyButtonClick;
  colorChannelInput.disabled = true;
  const textContent = colorChannelInput.textContent;
  colorChannelInput.textContent = "正在筛选百分比实体…";
  try {
    if (!deps.editorCtx.isAreEntitiesLoaded) {
      if ((await deps.ensureEntitiesLoaded(), !clipboardHexColor())) return;
      colorChannelInput =
        document.querySelector('#percentage-bar-inspector button[aria-label="选择百分比实体"]') ||
        colorChannelInput;
    }
    const clipboardRawTextValue = await deps.requestJson("/ha/percentage-sources");
    if (!clipboardHexColor() || !colorChannelInput.isConnected) return;
    const mappedItemByIdByCode = new Map(
        deps.editorCtx.entities.map((pasteColorError: any) => [pasteColorError.entityId, pasteColorError]),
      ),
      availableItemsConfig = (clipboardRawTextValue.items || []).map((pickerGuardClickEvent: any) => ({
        ...pickerGuardClickEvent,
        name:
          deps.runSnapshot(mappedItemByIdByCode.get(pickerGuardClickEvent.entityId)) ||
          pickerGuardClickEvent.entityId,
      }));
    deps.runCopyBackup({
      kind: "entity",
      title: "选择百分比实体",
      subtitle: "百分比状态、窗帘开合度、风扇百分比与湿度属性",
      searchPlaceholder: "搜索实体名称或 ID",
      triggerButton: colorChannelInput,
      pageSize: 20,
      selectedText: copyColorError.entityId
        ? "" +
          copyColorError.entityId +
          (copyColorError.attribute ? " · " + copyColorError.attribute : "")
        : "未绑定",
      emptyText: "没有匹配的百分比实体",
      itemClass: "entity-list",
      getPage({
        query: onGlobalColorPickerCopyButtonClickState,
        page: copyColorErrorState,
        pageSize: onGlobalColorPickerPasteButtonClickState,
      }: any) {
        const split2 = String(onGlobalColorPickerCopyButtonClickState || "")
            .toLowerCase()
            .trim()
            .split(/\s+/),
          filteredItemsCount = availableItemsConfig.filter((filteredItemsIndex: any) =>
            split2.every((pickerGuardClickEventState) =>
              (
                filteredItemsIndex.name +
                " " +
                filteredItemsIndex.entityId +
                " " +
                filteredItemsIndex.sourceLabel
              )
                .toLowerCase()
                .includes(pickerGuardClickEventState),
            ),
          );
        return {
          items: filteredItemsCount.slice(
            (copyColorErrorState - 1) * onGlobalColorPickerPasteButtonClickState,
            copyColorErrorState * onGlobalColorPickerPasteButtonClickState,
          ),
          total: filteredItemsCount.length,
        };
      },
      renderSelectedActions: () => [
        deps.createEditorEntityPickerOption("清除绑定", !copyColorError.entityId),
      ],
      renderItem(documentPointerDownCaptureEvent: any) {
        const closeEventState = mappedItemByIdByCode.get(
            documentPointerDownCaptureEvent.entityId,
          ) || {
            entityId: documentPointerDownCaptureEvent.entityId,
            name: documentPointerDownCaptureEvent.name,
          },
          qt3 = deps.createIconPickerOption(
            closeEventState,
            copyColorError.entityId === documentPointerDownCaptureEvent.entityId &&
              copyColorError.attribute === documentPointerDownCaptureEvent.attribute
              ? documentPointerDownCaptureEvent.entityId
              : "",
          );
        return (
          (qt3.dataset.editorPickerValue = JSON.stringify([
            documentPointerDownCaptureEvent.entityId,
            documentPointerDownCaptureEvent.attribute,
          ])),
          (qt3.querySelector(".inspector-entity-name")!.textContent +=
            " · " + documentPointerDownCaptureEvent.sourceLabel),
          qt3
        );
      },
      onSelect(closeEvent: any) {
        if (!clipboardHexColor()) return;
        const [closeEventValue, mutationRecordsState] = closeEvent
          ? JSON.parse(closeEvent)
          : ["", ""];
        onGlobalColorPickerPasteButtonClick({
          entityId: closeEventValue,
          attribute: mutationRecordsState,
        });
      },
    });
  } catch (mutationRecords: any) {
    deps.handleOperationError(mutationRecords);
  } finally {
    ((colorChannelInput.disabled = false), (colorChannelInput.textContent = textContent));
  }
}

export function mutationRecord(deps: AssetManagementDeps) {
  const createdInstanceSlot = deps.removedComponent();
  if (createdInstanceSlot?.type !== "percentage-bar") return;
  const mutationRecordState = deps.findReplaceableComponents(createdInstanceSlot);
  if (!mutationRecordState.length) return;
  const addedState = {
      variant: "柱体样式",
      orientation: "显示方向",
      thickness: "统一柱宽",
      length: "柱体长度",
      gap: "柱间距",
      valueOffsetX: "数值水平偏移",
      valueOffsetY: "数值垂直偏移",
      labelOffsetX: "备注水平偏移",
      labelOffsetY: "备注垂直偏移",
      valueSize: "数值字号",
      labelSize: "备注字号",
      radius: "柱顶圆角",
      fillOpacity: "填充浓度",
      precision: "小数位数",
      valueVisible: "显示数值",
      labelVisible: "显示备注",
      valueColor: "数值颜色",
      labelColor: "备注颜色",
    },
    addedComponentLabels = {
      gradient: "渐变柱",
      cursor: "内嵌游标柱",
      glass: "玻璃液柱",
      vertical: "纵向",
      horizontal: "横向",
      true: "显示",
      false: "隐藏",
    };
  ((deps.navigationStyleApplyTitleElement.textContent = "应用百分比柱状图样式"),
    (deps.navigationStyleApplyTargetHeadingElement.textContent = "应用到百分比柱状图"),
    (deps.navigationStyleApplyTargetScopeElement.textContent = "按区域与页面区分"),
    (deps.navigationStyleApplySummaryElement.textContent =
      "选择要应用的样式与目标控件，每根柱子的实体、备注和颜色分别保留。"),
    deps.navigationStyleApplyPropertiesElement.replaceChildren(
      ...Object.entries(addedState).map(([addedNode, onDocumentVisibilitychange]) => {
        const onDocumentVisibilitychangeState =
          createdInstanceSlot.properties?.[addedNode] ?? (percentageBarDefaults2 as any)[addedNode];
        return createNavigationStyleApplyOption({
          value: addedNode,
          label: onDocumentVisibilitychange,
          detail:
            (addedComponentLabels as any)[onDocumentVisibilitychangeState] ||
            String(onDocumentVisibilitychangeState),
        });
      }),
    ),
    deps.runVariantLower(mutationRecordState, "百分比柱状图"),
    (deps.navigationStyleApplyMessageElement.hidden = true),
    (deps.editorCtx.appliedStyleRecord = {
      sourceId: createdInstanceSlot.id,
      type: "percentage-bar",
    }),
    deps.navigationStyleApplyDialogElement.showModal());
}

