import { type EditorContext } from './editor-context'
import { type UserImageUploader } from '../../shared/user-image-upload'
import { EDITOR_PICKER_PAGE_SIZES as EDITOR_PICKER_PAGE_SIZES2 } from '@app/shared/picker/editor-picker-pagination'
import { findCustomPopup as findCustomPopup2, clone as clone2, clampNumber as clampNumber2 } from '../editor'
import { findComponent as findComponent2 } from '../component-tree'
import {
  applyPercentageBarChange as applyPercentageBarChange2,
  percentageBarDefaults as percentageBarDefaults2,
} from '../../shared/percentage-bar-model'
import { createNavigationStyleApplyOption } from '../navigation-style-apply/target-options'
import { confirmAction } from '../../shared/ui'
import { TOGGLE_ENTITY_DOMAINS as TOGGLE_ENTITY_DOMAINS2 } from '../../shared/action-rules'
import { updateRelatedPopup } from '../home-related-popup'
import { positionFloatingMenu } from '../../shared/util/editor-floating-layout'
import { domElement } from '@app/shared/util/dom-factory'

/* 资源管理（文件夹/删除、弹窗模块、会话、颜色选择器） */

export interface AssetManagementDeps {
  editorCtx: EditorContext
  assetMatchesId: any
  canDeleteAssetFolder: any
  createAssetOptionButton: (...args: any[]) => HTMLElement
  createEditorEntityPickerOption: any
  createEditorPickerCurrentAsset: any
  createIconPickerOption: any
  deleteAssetDialogElement: any
  deleteAssetFolderCountElement: any
  deleteAssetFolderDialogElement: any
  deleteAssetFolderNameElement: any
  deleteAssetNameElement: any
  deletePopupDialogElement: any
  destroyDashboardPreview: any
  editorAssetMatcher: any
  editorAssetToolbar: any
  ensureEntitiesLoaded: any
  exportedAssetsInFolder: any
  findAssetById: any
  findReplaceableComponents: any
  formatLastSeen: any
  handleOperationError: any
  ibeAssetButtonElement: any
  ibeAssetMenuElement: any
  ibeAssetOptionsElement: any
  ibeAssetSearchElement: any
  ibeAssetUploadElement: any
  imageAssetButtonElement: any
  imageAssetLargePreviewImageElement: any
  imageAssetMenuElement: any
  imageAssetOptionsElement: any
  imageAssetSearchInputElement: any
  imageAssetUploadButtonElement: any
  leftFolderName: any
  mutateDocument: any
  mutationRecord: any
  navigationStyleApplyDialogElement: any
  navigationStyleApplyMessageElement: any
  navigationStyleApplyPropertiesElement: any
  navigationStyleApplySummaryElement: any
  navigationStyleApplyTargetHeadingElement: any
  navigationStyleApplyTargetScopeElement: any
  navigationStyleApplyTitleElement: any
  popupNameDialogElement: any
  popupNameDialogTitleElement: any
  popupNameFormElement: any
  positionEffectAssetMenu: any
  positionImageAssetMenu: any
  refreshAssetPickers: () => void
  reloadAssetCatalog: any
  removedComponent: any
  renderEffectAssetOptions: any
  renderImageAssetOptions: any
  requestJson: any
  runCopyBackup: any
  runCopyFirst: any
  runCopyLower: any
  runCopyTwin: any
  runMode: any
  runShadow: any
  runSnapshot: any
  runVariantLower: any
  saturationPointerMoveEventState: any
  scheduleAssetPreview: any
  selectableEntities: any
  selectedComponentIdsFromDom: any
  setComponentsRotation: any
  syncAssetFolderOptions: any
  userImageUploader: UserImageUploader
}

export function onPopupModuleClimateDeviceTypeClick(deps: AssetManagementDeps, climateDeviceTypeClickEvent: any) {
  const climateDeviceTypeClickEventState =
    climateDeviceTypeClickEvent === deps.imageAssetButtonElement
      ? 'image'
      : climateDeviceTypeClickEvent === deps.ibeAssetButtonElement
        ? 'ibe'
        : ''
  if (!climateDeviceTypeClickEventState) return false
  const isClimateDeviceTypeClickEvent = climateDeviceTypeClickEventState === 'image',
    climateDeviceTypeElementState = deps.removedComponent(),
    climateDeviceTypeElementValue = isClimateDeviceTypeClickEvent
      ? climateDeviceTypeElementState?.properties?.assetId || ''
      : climateDeviceTypeElementState?.properties?.effectAssetId || '',
    sn5 = deps.findAssetById(climateDeviceTypeElementValue)
  deps
    .reloadAssetCatalog({
      refreshInspector: false,
    })
    .then(() => {
      deps.editorCtx.popupBeingRenamedValue?.triggerButton === climateDeviceTypeClickEvent &&
        (deps.editorCtx.popupBeingRenamedValue.syncAssetToolbar?.(), deps.editorCtx.popupBeingRenamedValue.refresh())
    })
    .catch(deps.handleOperationError)
  const climateDeviceTypeElement = deps
    .editorAssetMatcher(climateDeviceTypeClickEventState)
    .findIndex((climateDeviceTypeElementConfig: any) =>
      deps.assetMatchesId(climateDeviceTypeElementConfig, climateDeviceTypeElementValue),
    )
  return (
    deps
      .runCopyBackup({
        kind: climateDeviceTypeClickEventState + '-asset',
        title: isClimateDeviceTypeClickEvent ? '选择控件图片' : '选择效果图片',
        subtitle: '我的图片与HomeOS素材 · 固定分页加载',
        searchPlaceholder: '搜索图片名称',
        triggerButton: climateDeviceTypeClickEvent,
        pageSize: EDITOR_PICKER_PAGE_SIZES2.asset,
        initialPage:
          climateDeviceTypeElement < 0 ? 1 : Math.floor(climateDeviceTypeElement / EDITOR_PICKER_PAGE_SIZES2.asset) + 1,
        selectedText: sn5?.name || climateDeviceTypeElementValue || '不使用图片',
        emptyText: '没有匹配的图片',
        itemClass: 'asset-grid',
        getPage({ query: onTargetChangeState, page: onTargetChange, pageSize: onPopupModuleFormSubmit }: any) {
          const vw2 = deps.editorAssetMatcher(climateDeviceTypeClickEventState, onTargetChangeState),
            popupModuleSubmitEventState = (onTargetChange - 1) * onPopupModuleFormSubmit
          return {
            items: vw2.slice(popupModuleSubmitEventState, popupModuleSubmitEventState + onPopupModuleFormSubmit),
            total: vw2.length,
          }
        },
        renderSelectedContent: () => [deps.createEditorPickerCurrentAsset(sn5)],
        renderSelectedActions: () => [
          deps.createEditorEntityPickerOption('不使用图片', !climateDeviceTypeElementValue),
        ],
        renderItem(popupModuleSubmitEvent: any) {
          const nm2 = deps.createAssetOptionButton(popupModuleSubmitEvent, climateDeviceTypeElementValue),
            popupModuleTargetPopupIdElement = nm2.matches?.('[data-asset-id]')
              ? nm2
              : nm2.querySelector<HTMLElement>('[data-asset-id]')
          return (
            popupModuleTargetPopupIdElement &&
              (popupModuleTargetPopupIdElement.dataset.editorPickerValue = popupModuleSubmitEvent.assetId),
            nm2
          )
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
            'assetId',
            popupModuleTypeState,
          ),
      })
      ?.dialog.append(deps.imageAssetLargePreviewImageElement),
    true
  )
}

export function selectAssetFolder(deps: AssetManagementDeps, assetKind: any, folderKind: any) {
  const popupModuleType = folderKind === 'user' ? 'user' : 'builtin'
  assetKind === 'image'
    ? ((deps.editorCtx.imageAssetFolder = popupModuleType),
      (deps.imageAssetSearchInputElement.value = ''),
      deps.leftFolderName('image'),
      deps.syncAssetFolderOptions('image'),
      deps.editorCtx.popupBeingRenamedValue?.kind === 'image-asset'
        ? (deps.editorCtx.popupBeingRenamedValue.rebuildToolbar(),
          deps.editorCtx.popupBeingRenamedValue.refresh({
            resetPage: true,
          }))
        : (deps.renderImageAssetOptions(), deps.positionImageAssetMenu()))
    : ((deps.editorCtx.effectAssetFolder = popupModuleType),
      (deps.ibeAssetSearchElement.value = ''),
      deps.leftFolderName('ibe'),
      deps.syncAssetFolderOptions('ibe'),
      deps.editorCtx.popupBeingRenamedValue?.kind === 'ibe-asset'
        ? (deps.editorCtx.popupBeingRenamedValue.rebuildToolbar(),
          deps.editorCtx.popupBeingRenamedValue.refresh({
            resetPage: true,
          }))
        : (deps.renderEffectAssetOptions(), deps.positionEffectAssetMenu()))
}

export async function popupModuleTypeValue(
  deps: AssetManagementDeps,
  popupModuleTypeConfig: any,
  popupModuleTypeRef: any,
) {
  const popupModuleTypeEntry = [...(popupModuleTypeConfig || [])]
  if (!popupModuleTypeEntry.length) return
  const Rf2 = popupModuleTypeRef === 'image' ? deps.imageAssetUploadButtonElement : deps.ibeAssetUploadElement,
    uploadResult = await (async () => {
      Rf2.disabled = true
      try {
        return await deps.userImageUploader.upload(popupModuleTypeEntry, popupModuleTypeRef)
      } finally {
        Rf2.disabled = false
      }
    })()
  if (uploadResult.uploadedAssetIds.length) deps.runCopyLower(popupModuleTypeRef, 'user')
  uploadResult.errors.length && deps.handleOperationError(new Error(uploadResult.errors.join('\n')))
}

export async function requestDeleteUserAsset(deps: AssetManagementDeps, assetId: any) {
  const sn6 = deps.findAssetById(assetId)
  if (!sn6 || sn6.source !== 'user') return
  const popupModuleSubmitEntityIdHandler = (popupModuleSubmitEntityIdState: any) =>
    Array.isArray(popupModuleSubmitEntityIdState)
      ? popupModuleSubmitEntityIdState.some(popupModuleSubmitEntityIdHandler)
      : popupModuleSubmitEntityIdState && typeof popupModuleSubmitEntityIdState == 'object'
        ? Object.values(popupModuleSubmitEntityIdState).some(popupModuleSubmitEntityIdHandler)
        : popupModuleSubmitEntityIdState === sn6.assetId
  if (popupModuleSubmitEntityIdHandler(deps.editorCtx.activeProject?.document)) {
    deps.runShadow(),
      deps.handleOperationError(new Error('这张图片正在被当前仪表盘或弹窗使用，请先替换或移除后再删除。'))
    return
  }
  deps.runShadow()
  const confirmed = await confirmAction({
    title: '删除上传图片',
    message: '确认删除“' + sn6.name + '”？\n正在被仪表盘或弹窗使用的图片不能删除。',
    confirmLabel: '确认删除',
    cancelLabel: '取消',
    tone: 'danger',
  })
  if (!confirmed) return
  const replace5 = String(sn6.assetId || '').replace(/^user:/, '')
  if (!/^[0-9a-f]{32}$/.test(replace5)) return
  try {
    await deps.requestJson('/assets/user/' + replace5, { method: 'DELETE' })
    deps.editorCtx.pendingDeleteAssetId = null
    await deps.reloadAssetCatalog()
  } catch (caughtErrorIndex) {
    ;(caughtErrorIndex as { code?: string } | null)?.code === 'ASSET_IN_USE'
      ? deps.handleOperationError(new Error('这张图片仍被户型图绘制或仪表盘使用，请先移除引用后再删除。'))
      : deps.handleOperationError(caughtErrorIndex)
  }
}

export async function requestDeleteAssetFolder(deps: AssetManagementDeps, assetKind: string, folderName: string) {
  if (
    !deps.canDeleteAssetFolder(
      assetKind === 'image' ? deps.editorCtx.imageAssetFolder : deps.editorCtx.effectAssetFolder,
      folderName,
    )
  )
    return
  const hL2 = deps.exportedAssetsInFolder(folderName),
    popupModuleSubmitEntityId = 'studio3d:' + folderName + '/',
    popupModuleSubmitEntityIdCallback = (popupModuleSubmitEntityIdValue: any) =>
      Array.isArray(popupModuleSubmitEntityIdValue)
        ? popupModuleSubmitEntityIdValue.some(popupModuleSubmitEntityIdCallback)
        : popupModuleSubmitEntityIdValue && typeof popupModuleSubmitEntityIdValue == 'object'
          ? Object.values(popupModuleSubmitEntityIdValue).some(popupModuleSubmitEntityIdCallback)
          : typeof popupModuleSubmitEntityIdValue == 'string' &&
            popupModuleSubmitEntityIdValue.startsWith(popupModuleSubmitEntityId)
  if (popupModuleSubmitEntityIdCallback(deps.editorCtx.activeProject?.document)) {
    deps.handleOperationError(new Error('这个文件夹中的图片正在被当前仪表盘或弹窗使用，请先替换或移除后再删除。'))
    return
  }
  const confirmed = await confirmAction({
    title: '删除自动导图文件夹',
    message:
      '确认删除“' +
      folderName +
      '”？\n该文件夹中的 ' +
      hL2.length +
      ' 张导图会一起删除，且无法恢复。正在被仪表盘或弹窗使用时不会删除。',
    confirmLabel: '确认删除',
    cancelLabel: '取消',
    tone: 'danger',
  })
  if (!confirmed) return
  try {
    await deps.requestJson('/studio3d/exports', {
      method: 'DELETE',
      headers: { 'X-Export-Folder': encodeURIComponent(folderName) },
    })
    deps.editorCtx.pendingDeleteAssetFolder = null
    await deps.reloadAssetCatalog({ refreshInspector: false })
    deps.refreshAssetPickers()
  } catch (caughtErrorTotal) {
    ;(caughtErrorTotal as { code?: string } | null)?.code === 'STUDIO3D_EXPORT_IN_USE'
      ? deps.handleOperationError(
          new Error('这个文件夹中的图片仍被仪表盘、弹窗或户型图绘制使用，请先移除引用后再删除。'),
        )
      : deps.handleOperationError(caughtErrorTotal)
  }
}

export function refreshAssetPickers(deps: AssetManagementDeps) {
  deps.leftFolderName('image'),
    deps.leftFolderName('ibe'),
    deps.renderImageAssetOptions(deps.imageAssetSearchInputElement.value),
    deps.renderEffectAssetOptions(deps.ibeAssetSearchElement.value),
    (deps.editorCtx.popupBeingRenamedValue?.kind === 'image-asset' ||
      deps.editorCtx.popupBeingRenamedValue?.kind === 'ibe-asset') &&
      (deps.editorCtx.popupBeingRenamedValue.syncAssetToolbar?.(),
      deps.editorCtx.popupBeingRenamedValue.refresh({
        resetPage: true,
      })),
    deps.imageAssetMenuElement.hidden || deps.positionImageAssetMenu(),
    deps.ibeAssetMenuElement.hidden || deps.positionEffectAssetMenu()
}

export function scaleDraftDocument(deps: AssetManagementDeps, scaledPlacement: any) {
  deps.editorCtx.popupDialogMode = scaledPlacement
  const popupToDuplicateEntry = findCustomPopup2(deps.editorCtx.activeProject?.document, deps.editorCtx.selectedPopupId)
  ;(deps.popupNameDialogTitleElement.textContent = scaledPlacement === 'rename' ? '重命名组合弹窗' : '新建组合弹窗'),
    (deps.popupNameFormElement.elements.name.value =
      scaledPlacement === 'rename' ? popupToDuplicateEntry?.name || '' : '新建组合弹窗'),
    deps.popupNameDialogElement.showModal(),
    deps.popupNameFormElement.elements.name.select()
}

export function cancelDeletePopupDialog(deps: AssetManagementDeps) {
  deps.editorCtx.popupModuleDraft = null
  deps.deletePopupDialogElement?.close?.()
}

export async function onSessionsRevokeOthersConfirmButtonClick(
  deps: AssetManagementDeps,
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
      deps.removedComponent()?.properties?.controlMode === 'entity-sign'
  revokeOtherSessionsError.disabled = true
  try {
    if (
      (deps.editorCtx.isAreEntitiesLoaded || (await deps.ensureEntitiesLoaded()),
      !revokedSessionIdHandler() || !revokeOtherSessionsError.isConnected)
    )
      return
    const revokedSessionId = await deps.requestJson('/ha/numeric-sources')
    if (!revokedSessionIdHandler() || !revokeOtherSessionsError.isConnected) return
    const mappedItemByIdByName = new Map(
        deps.editorCtx.entities.map((revokeSessionError: any) => [revokeSessionError.entityId, revokeSessionError]),
      ),
      availableItemsValue = (revokedSessionId.items || []).map((onDisplayPairingCustomCodeTextInputInput: any) => ({
        ...(mappedItemByIdByName.get(onDisplayPairingCustomCodeTextInputInput.entityId) || {}),
        ...onDisplayPairingCustomCodeTextInputInput,
        name:
          (mappedItemByIdByName.get(onDisplayPairingCustomCodeTextInputInput.entityId) as any)?.name ||
          onDisplayPairingCustomCodeTextInputInput.name ||
          onDisplayPairingCustomCodeTextInputInput.entityId,
      }))
    deps.runCopyBackup({
      kind: 'entity',
      title: '选择流水线条数值实体',
      subtitle: '正数正向，负数反向，0 或不可用时只显示底线',
      searchPlaceholder: '搜索实体名称或 ID',
      triggerButton: revokeOtherSessionsError,
      pageSize: 20,
      selectedText: onSessionsRevokeCancelButtonClick || '未绑定',
      emptyText: '没有匹配的实体',
      itemClass: 'entity-list',
      getPage({
        query: onLogoutButtonClick,
        page: onGlobalColorPickerSaturationValuePointerdown,
        pageSize: saturationPointerDownEvent,
      }: any) {
        const split = String(onLogoutButtonClick || '')
            .toLowerCase()
            .trim()
            .split(/\s+/),
          filteredItemsText = availableItemsValue.filter((onGlobalColorPickerSaturationValuePointermove: any) =>
            split.every((saturationPointerMoveEvent) =>
              (
                deps.runMode(onGlobalColorPickerSaturationValuePointermove) +
                ' ' +
                onGlobalColorPickerSaturationValuePointermove.entityId
              )
                .toLowerCase()
                .includes(saturationPointerMoveEvent),
            ),
          )
        return {
          items: filteredItemsText.slice(
            (onGlobalColorPickerSaturationValuePointerdown - 1) * saturationPointerDownEvent,
            onGlobalColorPickerSaturationValuePointerdown * saturationPointerDownEvent,
          ),
          total: filteredItemsText.length,
        }
      },
      renderSelectedActions: () => [
        deps.createEditorEntityPickerOption('清除绑定', !onSessionsRevokeCancelButtonClick),
      ],
      renderItem: (onGlobalColorPickerSaturationValuePointerup: any) => {
        const qt2 = deps.createIconPickerOption(
          onGlobalColorPickerSaturationValuePointerup,
          onSessionsRevokeCancelButtonClick,
        )
        return (
          onGlobalColorPickerSaturationValuePointerup.unavailable &&
            qt2.querySelector('.inspector-entity-name')!.prepend('暂不可用 · '),
          qt2
        )
      },
      onSelect: (saturationPointerUpEvent: any) => {
        if (revokedSessionIdHandler()) return onSessionsRevokeConfirmButtonClick(saturationPointerUpEvent)
      },
    })
  } catch (onGlobalColorPickerHueRangeInputInput: any) {
    revokedSessionIdHandler() &&
      revokeOtherSessionsError.isConnected &&
      deps.handleOperationError(onGlobalColorPickerHueRangeInputInput)
  } finally {
    revokeOtherSessionsError.disabled = false
  }
}

export function onGlobalColorPickerHexTextInputInput(deps: AssetManagementDeps, component: any) {
  const hexColorInputValue = component?.id
  return {
    document: deps.editorCtx.activeProject?.document,
    entities: deps.editorCtx.entities,
    entityName: deps.runSnapshot,
    enhance: (onSessionsRevokeCloseButtonClickState: any) => {
      deps.selectableEntities(onSessionsRevokeCloseButtonClickState),
        deps.destroyDashboardPreview(onSessionsRevokeCloseButtonClickState),
        deps.formatLastSeen(onSessionsRevokeCloseButtonClickState)
    },
    change: (onSessionsRevokeCancelButtonClickState: any) => {
      const il4 =
        onSessionsRevokeCancelButtonClickState.geometry === 'rotation' ? deps.selectedComponentIdsFromDom() : []
      return deps.mutateDocument((onSessionsRevokeConfirmButtonClickValue: any) => {
        const revokedSessionIdState = findComponent2(
          onSessionsRevokeConfirmButtonClickValue,
          hexColorInputValue,
        )?.component
        revokedSessionIdState?.type === 'percentage-bar' &&
          (onSessionsRevokeCancelButtonClickState.geometry === 'rotation' && il4.length > 1
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
              ))
      })
    },
    canApplyStyle: component?.type === 'percentage-bar' && deps.findReplaceableComponents(component).length > 0,
    applyStyle: deps.mutationRecord,
    previewProperty: (onGlobalColorPickerHexTextInputChangeState: any, onGlobalColorPickerHexTextInputChange: any) => {
      const hexColorChangeInput = clone2(component)
      applyPercentageBarChange2(
        hexColorChangeInput,
        {
          property: onGlobalColorPickerHexTextInputChangeState,
          value: onGlobalColorPickerHexTextInputChange,
        },
        deps.editorCtx.activeProject.document.canvas,
      ),
        deps.editorCtx.editorRenderer?.previewComponentTransform(hexColorInputValue, hexColorChangeInput.position),
        deps.editorCtx.editorRenderer?.previewComponentProperties(hexColorInputValue, hexColorChangeInput.properties)
    },
    previewGeometry: (onDisplayPairingCustomCodeTextInputInputState: any, onLogoutButtonClickState: any) => {
      const canvas = deps.editorCtx.activeProject.document.canvas,
        position = component.position
      if (onDisplayPairingCustomCodeTextInputInputState === 'rotation' && deps.selectedComponentIdsFromDom().length > 1)
        return
      const hexColorChangeInputState =
        onDisplayPairingCustomCodeTextInputInputState === 'left'
          ? {
              x: (canvas.width * onLogoutButtonClickState) / 100 - position.width / 2,
            }
          : onDisplayPairingCustomCodeTextInputInputState === 'top'
            ? {
                y: (canvas.height * onLogoutButtonClickState) / 100 - position.height / 2,
              }
            : onDisplayPairingCustomCodeTextInputInputState === 'scale'
              ? {
                  scale: onLogoutButtonClickState / 100,
                }
              : {
                  rotation: onLogoutButtonClickState,
                }
      deps.editorCtx.editorRenderer?.previewComponentTransform(hexColorInputValue, hexColorChangeInputState)
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
  }
}

export async function saturationPointerMoveEventState(
  deps: AssetManagementDeps,
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
      deps.editorCtx.selectedComponentId === onGlobalColorPickerCopyButtonClick
  colorChannelInput.disabled = true
  const textContent = colorChannelInput.textContent
  colorChannelInput.textContent = '正在筛选百分比实体…'
  try {
    if (!deps.editorCtx.isAreEntitiesLoaded) {
      if ((await deps.ensureEntitiesLoaded(), !clipboardHexColor())) return
      colorChannelInput =
        document.querySelector('#percentage-bar-inspector button[aria-label="选择百分比实体"]') || colorChannelInput
    }
    const clipboardRawTextValue = await deps.requestJson('/ha/percentage-sources')
    if (!clipboardHexColor() || !colorChannelInput.isConnected) return
    const mappedItemByIdByCode = new Map(
        deps.editorCtx.entities.map((pasteColorError: any) => [pasteColorError.entityId, pasteColorError]),
      ),
      availableItemsConfig = (clipboardRawTextValue.items || []).map((pickerGuardClickEvent: any) => ({
        ...pickerGuardClickEvent,
        name:
          deps.runSnapshot(mappedItemByIdByCode.get(pickerGuardClickEvent.entityId)) || pickerGuardClickEvent.entityId,
      }))
    deps.runCopyBackup({
      kind: 'entity',
      title: '选择百分比实体',
      subtitle: '百分比状态、窗帘开合度、风扇百分比与湿度属性',
      searchPlaceholder: '搜索实体名称或 ID',
      triggerButton: colorChannelInput,
      pageSize: 20,
      selectedText: copyColorError.entityId
        ? '' + copyColorError.entityId + (copyColorError.attribute ? ' · ' + copyColorError.attribute : '')
        : '未绑定',
      emptyText: '没有匹配的百分比实体',
      itemClass: 'entity-list',
      getPage({
        query: onGlobalColorPickerCopyButtonClickState,
        page: copyColorErrorState,
        pageSize: onGlobalColorPickerPasteButtonClickState,
      }: any) {
        const split2 = String(onGlobalColorPickerCopyButtonClickState || '')
            .toLowerCase()
            .trim()
            .split(/\s+/),
          filteredItemsCount = availableItemsConfig.filter((filteredItemsIndex: any) =>
            split2.every((pickerGuardClickEventState) =>
              (filteredItemsIndex.name + ' ' + filteredItemsIndex.entityId + ' ' + filteredItemsIndex.sourceLabel)
                .toLowerCase()
                .includes(pickerGuardClickEventState),
            ),
          )
        return {
          items: filteredItemsCount.slice(
            (copyColorErrorState - 1) * onGlobalColorPickerPasteButtonClickState,
            copyColorErrorState * onGlobalColorPickerPasteButtonClickState,
          ),
          total: filteredItemsCount.length,
        }
      },
      renderSelectedActions: () => [deps.createEditorEntityPickerOption('清除绑定', !copyColorError.entityId)],
      renderItem(documentPointerDownCaptureEvent: any) {
        const closeEventState = mappedItemByIdByCode.get(documentPointerDownCaptureEvent.entityId) || {
            entityId: documentPointerDownCaptureEvent.entityId,
            name: documentPointerDownCaptureEvent.name,
          },
          qt3 = deps.createIconPickerOption(
            closeEventState,
            copyColorError.entityId === documentPointerDownCaptureEvent.entityId &&
              copyColorError.attribute === documentPointerDownCaptureEvent.attribute
              ? documentPointerDownCaptureEvent.entityId
              : '',
          )
        return (
          (qt3.dataset.editorPickerValue = JSON.stringify([
            documentPointerDownCaptureEvent.entityId,
            documentPointerDownCaptureEvent.attribute,
          ])),
          (qt3.querySelector('.inspector-entity-name')!.textContent +=
            ' · ' + documentPointerDownCaptureEvent.sourceLabel),
          qt3
        )
      },
      onSelect(closeEvent: any) {
        if (!clipboardHexColor()) return
        const [closeEventValue, mutationRecordsState] = closeEvent ? JSON.parse(closeEvent) : ['', '']
        onGlobalColorPickerPasteButtonClick({
          entityId: closeEventValue,
          attribute: mutationRecordsState,
        })
      },
    })
  } catch (mutationRecords: any) {
    deps.handleOperationError(mutationRecords)
  } finally {
    ;(colorChannelInput.disabled = false), (colorChannelInput.textContent = textContent)
  }
}

export function mutationRecord(deps: AssetManagementDeps) {
  const createdInstanceSlot = deps.removedComponent()
  if (createdInstanceSlot?.type !== 'percentage-bar') return
  const mutationRecordState = deps.findReplaceableComponents(createdInstanceSlot)
  if (!mutationRecordState.length) return
  const addedState = {
      variant: '柱体样式',
      orientation: '显示方向',
      thickness: '统一柱宽',
      length: '柱体长度',
      gap: '柱间距',
      valueOffsetX: '数值水平偏移',
      valueOffsetY: '数值垂直偏移',
      labelOffsetX: '备注水平偏移',
      labelOffsetY: '备注垂直偏移',
      valueSize: '数值字号',
      labelSize: '备注字号',
      radius: '柱顶圆角',
      fillOpacity: '填充浓度',
      precision: '小数位数',
      valueVisible: '显示数值',
      labelVisible: '显示备注',
      valueColor: '数值颜色',
      labelColor: '备注颜色',
    },
    addedComponentLabels = {
      gradient: '渐变柱',
      cursor: '内嵌游标柱',
      glass: '玻璃液柱',
      vertical: '纵向',
      horizontal: '横向',
      true: '显示',
      false: '隐藏',
    }
  ;(deps.navigationStyleApplyTitleElement.textContent = '应用百分比柱状图样式'),
    (deps.navigationStyleApplyTargetHeadingElement.textContent = '应用到百分比柱状图'),
    (deps.navigationStyleApplyTargetScopeElement.textContent = '按区域与页面区分'),
    (deps.navigationStyleApplySummaryElement.textContent =
      '选择要应用的样式与目标控件，每根柱子的实体、备注和颜色分别保留。'),
    deps.navigationStyleApplyPropertiesElement.replaceChildren(
      ...Object.entries(addedState).map(([addedNode, onDocumentVisibilitychange]) => {
        const onDocumentVisibilitychangeState =
          createdInstanceSlot.properties?.[addedNode] ?? (percentageBarDefaults2 as any)[addedNode]
        return createNavigationStyleApplyOption({
          value: addedNode,
          label: onDocumentVisibilitychange,
          detail:
            (addedComponentLabels as any)[onDocumentVisibilitychangeState] || String(onDocumentVisibilitychangeState),
        })
      }),
    ),
    deps.runVariantLower(mutationRecordState, '百分比柱状图'),
    (deps.navigationStyleApplyMessageElement.hidden = true),
    (deps.editorCtx.appliedStyleRecord = {
      sourceId: createdInstanceSlot.id,
      type: 'percentage-bar',
    }),
    deps.navigationStyleApplyDialogElement.showModal()
}

/* 资源选择与预览（资源 URL/尺寸/菜单/大图预览、实体选择器配置） */

export interface AssetPickerDeps {
  editorCtx: EditorContext
  airConditionerEntityButtonElement: any
  airConditionerEntityMenuElement: any
  airConditionerEntityOptionsElement: any
  airConditionerEntitySearchElement: any
  allAssets: any
  applyAssetNaturalSize: any
  assetMatchesId: any
  cameraEntityButtonElement: any
  cameraEntityMenuElement: any
  cameraEntityOptionsElement: any
  cameraEntitySearchElement: any
  customSelectsBySelectElement: any
  handleOperationError: any
  ibeAssetFolderElement: any
  ibeAssetMenuElement: any
  ibeAssetUploadHintElement: any
  ibeEntityButtonElement: any
  ibeEntityMenuElement: any
  ibeEntityOptionsElement: any
  ibeEntitySearchElement: any
  iconButtonEntityButtonElement: any
  iconButtonEntityMenuElement: any
  iconButtonEntityOptionsElement: any
  iconButtonEntitySearchElement: any
  imageAssetButtonElement: any
  imageAssetFolderSelectElement: any
  imageAssetLargePreviewImageElement: any
  imageAssetLargePreviewImageElementElement: any
  imageAssetLargePreviewNameElement: any
  imageAssetMenuElement: any
  imageAssetOptionsElement: any
  imageAssetUploadHintElement: any
  imageEntityButtonElement: any
  imageEntityMenuElement: any
  imageEntityOptionsElement: any
  imageEntitySearchElement: any
  lightStatisticsActionEntityButtonElement: any
  lightStatisticsActionEntityMenuElement: any
  lightStatisticsActionEntityOptionsElement: any
  lightStatisticsActionEntitySearchElement: any
  lightStatisticsEntityButtonElement: any
  lightStatisticsEntityMenuElement: any
  lightStatisticsEntityOptionsElement: any
  lightStatisticsIconButtonElement: any
  lightStatisticsIconMenuElement: any
  lightStatisticsIconOptionsElement: any
  lineChartEntityButtonElement: any
  lineChartEntityMenuElement: any
  lineChartEntityOptionsElement: any
  lineChartEntitySearchInputElement: any
  loadNavigationIconOptions: any
  measureAssetImageSize: any
  mutateDocument: any
  navigationEntityButtonElement: any
  navigationEntityMenuElement: any
  navigationEntityOptionsElement: any
  navigationEntitySearchElement: any
  pendingAssetProbeKeysSet: any
  positionAssetLargePreview: any
  removedComponent: any
  renderNavigationIconPreview: any
  resolveAssetPreviewUrl: any
  resolveEffectAssetUrl: any
  runAlt: any
  runExtraAlt: any
  runExtraTwin: any
  runExtraVariant: any
  runMode: any
  runPortion: any
  runQueue: any
  runSnapshot: any
  runState: any
  syncAssetFolderOptions: any
  titleButtonEntityButtonElement: any
  titleButtonEntityMenuElement: any
  titleButtonEntityOptionsElement: any
  titleButtonEntitySearchElement: any
  vacuumMapEntityButtonElement: any
  vacuumMapEntityMenuElement: any
  vacuumMapEntityOptionsElement: any
  vacuumMapEntitySearchElement: any
  weatherEntityButtonElement: any
  weatherEntityMenuElement: any
  weatherEntityOptionsElement: any
  weatherEntitySearchElement: any
}

export function positionLightStatisticsIconMenu(deps: AssetPickerDeps) {
  if (deps.lightStatisticsIconMenuElement.hidden) return
  positionFloatingMenu({
    anchor: deps.lightStatisticsIconButtonElement.parentElement || deps.lightStatisticsIconButtonElement,
    panel: deps.lightStatisticsIconMenuElement,
    optionsElement: deps.lightStatisticsIconOptionsElement,
    optionsReserve: 57,
    optionsMinHeight: 90,
    maxHeight: 390,
    gap: 5,
  })
}

export function positionLightStatisticsEntityMenu(deps: AssetPickerDeps) {
  if (deps.lightStatisticsEntityMenuElement.hidden) return
  positionFloatingMenu({
    anchor: deps.lightStatisticsEntityButtonElement,
    panel: deps.lightStatisticsEntityMenuElement,
    optionsElement: deps.lightStatisticsEntityOptionsElement,
    optionsReserve: 58,
    optionsMinHeight: 90,
    maxHeight: 430,
    maxWidth: Math.min(deps.lightStatisticsEntityButtonElement.getBoundingClientRect().width, window.innerWidth - 16),
    gap: 5,
  })
}

export function resolveEntityPickerConfig(deps: AssetPickerDeps, componentType = 'image') {
  return componentType === 'light-statistics'
    ? {
        componentType: componentType,
        button: deps.lightStatisticsActionEntityButtonElement,
        menu: deps.lightStatisticsActionEntityMenuElement,
        search: deps.lightStatisticsActionEntitySearchElement,
        options: deps.lightStatisticsActionEntityOptionsElement,
        except: 'light-statistics-action-entity',
        relatedSettings: false,
        recommended: (relatedPopupElementRef: any) =>
          TOGGLE_ENTITY_DOMAINS2.has(deps.renderNavigationIconPreview(relatedPopupElementRef)) ? 2 : 0,
      }
    : ['navigation-button', 'scene-mode'].includes(componentType)
      ? {
          componentType: componentType,
          button: deps.navigationEntityButtonElement,
          menu: deps.navigationEntityMenuElement,
          search: deps.navigationEntitySearchElement,
          options: deps.navigationEntityOptionsElement,
          except: 'navigation-entity',
          relatedSettings: componentType !== 'scene-mode',
          recommended: (relatedPopupElementEntry: any) =>
            relatedPopupElementEntry?.virtual
              ? 3
              : TOGGLE_ENTITY_DOMAINS2.has(deps.renderNavigationIconPreview(relatedPopupElementEntry))
                ? 2
                : 0,
        }
      : componentType === 'title-button'
        ? {
            componentType: componentType,
            button: deps.titleButtonEntityButtonElement,
            menu: deps.titleButtonEntityMenuElement,
            search: deps.titleButtonEntitySearchElement,
            options: deps.titleButtonEntityOptionsElement,
            except: 'title-button-entity',
            recommended: (relatedPopupElementRecord: any) =>
              relatedPopupElementRecord?.virtual
                ? 3
                : TOGGLE_ENTITY_DOMAINS2.has(deps.renderNavigationIconPreview(relatedPopupElementRecord))
                  ? 2
                  : 0,
          }
        : componentType === 'vacuum-map'
          ? {
              componentType: componentType,
              button: deps.vacuumMapEntityButtonElement,
              menu: deps.vacuumMapEntityMenuElement,
              search: deps.vacuumMapEntitySearchElement,
              options: deps.vacuumMapEntityOptionsElement,
              except: 'vacuum-map-entity',
              recommended: (relatedPopupElementName: any) =>
                ['camera', 'image'].includes(deps.renderNavigationIconPreview(relatedPopupElementName))
                  ? /(?:^|[_.\s-])map(?:$|[_.\s-])|地图/i.test(
                      (relatedPopupElementName.entityId || '') + ' ' + (relatedPopupElementName.name || ''),
                    )
                    ? 2
                    : 1
                  : 0,
            }
          : componentType === 'camera'
            ? {
                componentType: componentType,
                button: deps.cameraEntityButtonElement,
                menu: deps.cameraEntityMenuElement,
                search: deps.cameraEntitySearchElement,
                options: deps.cameraEntityOptionsElement,
                except: 'camera-entity',
                recommended: (relatedPopupElementKey: any) =>
                  deps.renderNavigationIconPreview(relatedPopupElementKey) === 'camera',
              }
            : componentType === 'air-conditioner'
              ? {
                  componentType: componentType,
                  button: deps.airConditionerEntityButtonElement,
                  menu: deps.airConditionerEntityMenuElement,
                  search: deps.airConditionerEntitySearchElement,
                  options: deps.airConditionerEntityOptionsElement,
                  except: 'air-conditioner-entity',
                  recommended: (relatedPopupElementPath: any) =>
                    deps.renderNavigationIconPreview(relatedPopupElementPath) === 'climate'
                      ? 2
                      : deps.renderNavigationIconPreview(relatedPopupElementPath) === 'fan'
                        ? 1
                        : 0,
                }
              : componentType === 'device-button'
                ? {
                    componentType: componentType,
                    button: deps.iconButtonEntityButtonElement,
                    menu: deps.iconButtonEntityMenuElement,
                    search: deps.iconButtonEntitySearchElement,
                    options: deps.iconButtonEntityOptionsElement,
                    except: 'icon-button-entity',
                    recommended: (relatedPopupElementText: any) =>
                      TOGGLE_ENTITY_DOMAINS2.has(deps.renderNavigationIconPreview(relatedPopupElementText)),
                  }
                : componentType === 'presence-sensor'
                  ? {
                      componentType: componentType,
                      button: deps.iconButtonEntityButtonElement,
                      menu: deps.iconButtonEntityMenuElement,
                      search: deps.iconButtonEntitySearchElement,
                      options: deps.iconButtonEntityOptionsElement,
                      except: 'icon-button-entity',
                      recommended: (relatedPopupElementCount: any) => {
                        const relatedPopupElementIndex =
                            (relatedPopupElementCount.entityId || '') +
                            ' ' +
                            (relatedPopupElementCount.name || '') +
                            ' ' +
                            (relatedPopupElementCount.originalName || '') +
                            ' ' +
                            (relatedPopupElementCount.translationKey || ''),
                          relatedPopupElementTotal = deps.removedComponent()?.properties?.sensorKind || 'presence',
                          be3 = deps.renderNavigationIconPreview(relatedPopupElementCount)
                        return be3 === 'event'
                          ? relatedPopupElementTotal === 'presence' &&
                            /motion|occupancy|presence|pir|moving|移动|运动|人体|有人/i.test(relatedPopupElementIndex)
                            ? 4
                            : 0
                          : be3 !== 'binary_sensor'
                            ? 0
                            : relatedPopupElementTotal === 'water-leak'
                              ? /moisture|water|leak|flood|wet|水浸|漏水|积水|湿/i.test(relatedPopupElementIndex)
                                ? 3
                                : 1
                              : relatedPopupElementTotal === 'smoke'
                                ? /smoke|fire|烟雾|烟感|火警/i.test(relatedPopupElementIndex)
                                  ? 3
                                  : 1
                                : relatedPopupElementTotal === 'natural-gas'
                                  ? /natural[_ -]?gas|combustible|gas|燃气|天然气|可燃气/i.test(
                                      relatedPopupElementIndex,
                                    )
                                    ? 3
                                    : 1
                                  : relatedPopupElementTotal === 'door-window'
                                    ? /door|window|contact|opening|门|窗|接触/i.test(relatedPopupElementIndex)
                                      ? 3
                                      : 1
                                    : /presence|occupancy|人在|有人|存在|人体/i.test(relatedPopupElementIndex)
                                      ? 3
                                      : /motion|移动|运动/i.test(relatedPopupElementIndex)
                                        ? 1
                                        : 2
                      },
                    }
                  : componentType === 'icon-button'
                    ? {
                        componentType: componentType,
                        button: deps.iconButtonEntityButtonElement,
                        menu: deps.iconButtonEntityMenuElement,
                        search: deps.iconButtonEntitySearchElement,
                        options: deps.iconButtonEntityOptionsElement,
                        except: 'icon-button-entity',
                        recommended: (relatedPopupElementFlag: any) =>
                          deps.renderNavigationIconPreview(relatedPopupElementFlag) === 'light',
                      }
                    : componentType === 'icon-button-effect'
                      ? {
                          componentType: componentType,
                          button: deps.ibeEntityButtonElement,
                          menu: deps.ibeEntityMenuElement,
                          search: deps.ibeEntitySearchElement,
                          options: deps.ibeEntityOptionsElement,
                          except: 'ibe-entity',
                          recommended: (relatedPopupElementSlot: any) =>
                            deps.renderNavigationIconPreview(relatedPopupElementSlot) === 'light',
                        }
                      : componentType === 'weather'
                        ? {
                            componentType: componentType,
                            button: deps.weatherEntityButtonElement,
                            menu: deps.weatherEntityMenuElement,
                            search: deps.weatherEntitySearchElement,
                            options: deps.weatherEntityOptionsElement,
                            except: 'weather-entity',
                            recommended: (relatedPopupElementCase: any) =>
                              deps.renderNavigationIconPreview(relatedPopupElementCase) === 'weather',
                          }
                        : componentType === 'line-chart'
                          ? {
                              componentType: componentType,
                              button: deps.lineChartEntityButtonElement,
                              menu: deps.lineChartEntityMenuElement,
                              search: deps.lineChartEntitySearchInputElement,
                              options: deps.lineChartEntityOptionsElement,
                              except: 'line-chart-entity',
                              recommended: (relatedPopupElementStep: any) =>
                                deps.renderNavigationIconPreview(relatedPopupElementStep) === 'sensor',
                            }
                          : {
                              componentType: 'image',
                              button: deps.imageEntityButtonElement,
                              menu: deps.imageEntityMenuElement,
                              search: deps.imageEntitySearchElement,
                              options: deps.imageEntityOptionsElement,
                              except: 'entity',
                              recommended: (relatedPopupElementPhase: any) =>
                                ['image', 'camera'].includes(
                                  deps.renderNavigationIconPreview(relatedPopupElementPhase),
                                ),
                            }
}

export function renderRelatedPopupEntityOptions(deps: AssetPickerDeps, description = '', componentType = 'image') {
  const ao2 = deps.runExtraAlt(componentType),
    relatedPopupElementView = deps.removedComponent()?.bindings?.entity?.entityId || '',
    relatedPopupElementStore = description.trim().toLocaleLowerCase('zh-CN'),
    relatedPopupElementCache = deps
      .runPortion(componentType)
      .map((mappedItemsFlag: any, mappedItemsSlot: any) => ({
        entity: mappedItemsFlag,
        index: mappedItemsSlot,
      }))
      .filter(
        ({ entity: relatedPopupElementQueue }: any) =>
          !relatedPopupElementStore ||
          (deps.runMode(relatedPopupElementQueue) + ' ' + deps.renderNavigationIconPreview(relatedPopupElementQueue))
            .toLocaleLowerCase('zh-CN')
            .includes(relatedPopupElementStore),
      )
      .sort((relatedPopupElementBuffer: any, relatedPopupElementCursor: any) => {
        const relatedPopupElementHandler = (relatedPopupElementPointer: any) =>
          relatedPopupElementPointer?.virtual ? 100 : Number(ao2.recommended(relatedPopupElementPointer))
        return (
          relatedPopupElementHandler(relatedPopupElementCursor.entity) -
            relatedPopupElementHandler(relatedPopupElementBuffer.entity) ||
          relatedPopupElementBuffer.index - relatedPopupElementCursor.index
        )
      })
      .map(({ entity: mappedItemsCase }: any) => mappedItemsCase),
    relatedPopupElementElement = document.createElement('button')
  ;(relatedPopupElementElement.type = 'button'),
    (relatedPopupElementElement.className =
      'inspector-entity-option inspector-entity-clear' + (relatedPopupElementView ? '' : ' selected')),
    (relatedPopupElementElement.dataset.entityId = ''),
    relatedPopupElementElement.setAttribute('role', 'option'),
    relatedPopupElementElement.setAttribute('aria-selected', String(!relatedPopupElementView)),
    (relatedPopupElementElement.textContent = '不使用实体')
  const mappedItemsStep = relatedPopupElementCache.map((mappedItemsPhase: any) => {
      const relatedPopupElementPanel = document.createElement('button')
      ;(relatedPopupElementPanel.type = 'button'),
        (relatedPopupElementPanel.className =
          'inspector-entity-option' + (mappedItemsPhase.entityId === relatedPopupElementView ? ' selected' : '')),
        (relatedPopupElementPanel.dataset.entityId = mappedItemsPhase.entityId),
        relatedPopupElementPanel.setAttribute('role', 'option'),
        relatedPopupElementPanel.setAttribute(
          'aria-selected',
          String(mappedItemsPhase.entityId === relatedPopupElementView),
        )
      const relatedPopupElementSection = document.createElement('span')
      ;(relatedPopupElementSection.className = 'inspector-entity-option-content'),
        (relatedPopupElementSection.title = deps.runMode(mappedItemsPhase))
      const relatedPopupElementCard = document.createElement('span')
      relatedPopupElementCard.className = 'inspector-entity-option-line inspector-entity-name-line'
      const relatedPopupElementBar = document.createElement('span')
      ;(relatedPopupElementBar.className = 'inspector-entity-kind'),
        (relatedPopupElementBar.textContent = '[' + deps.runQueue(mappedItemsPhase) + '] ')
      const relatedPopupElementList = document.createElement('span')
      ;(relatedPopupElementList.className = 'inspector-entity-name'),
        (relatedPopupElementList.textContent = deps.runSnapshot(mappedItemsPhase)),
        relatedPopupElementCard.append(relatedPopupElementBar, relatedPopupElementList)
      const relatedPopupElementRow = document.createElement('span')
      return (
        (relatedPopupElementRow.className = 'inspector-entity-option-line inspector-entity-id'),
        (relatedPopupElementRow.textContent = mappedItemsPhase.entityId),
        (relatedPopupElementRow.title = mappedItemsPhase.entityId),
        relatedPopupElementSection.append(relatedPopupElementCard, relatedPopupElementRow),
        deps.runAlt(relatedPopupElementPanel, relatedPopupElementCard),
        relatedPopupElementPanel.append(relatedPopupElementSection),
        relatedPopupElementPanel
      )
    }),
    relatedPopupElementBox = document.createElement('div')
  ;(relatedPopupElementBox.className = 'inspector-picker-empty'),
    relatedPopupElementCache.length || (relatedPopupElementBox.textContent = '没有匹配的实体'),
    ao2.options.replaceChildren(
      relatedPopupElementElement,
      ...mappedItemsStep,
      ...(relatedPopupElementBox.textContent ? [relatedPopupElementBox] : []),
    ),
    (ao2.options.scrollTop = 0)
}

export function syncPopupEntityPickerButton(deps: AssetPickerDeps, triggerElement: any) {
  const ao3 = deps.runExtraAlt(triggerElement.type),
    relatedPopupElementTarget = triggerElement.bindings?.entity?.entityId || '',
    relatedPopupElementSource = deps
      .runPortion(triggerElement.type)
      .find((relatedPopupElementOrigin: any) => relatedPopupElementOrigin.entityId === relatedPopupElementTarget),
    rt2 = relatedPopupElementSource
      ? deps.runMode(relatedPopupElementSource)
      : relatedPopupElementTarget || '不使用实体'
  let relatedPopupElementDraft = ao3.button.querySelector('.inspector-picker-value')
  relatedPopupElementDraft ||
    ((relatedPopupElementDraft = document.createElement('span')),
    (relatedPopupElementDraft.className = 'inspector-picker-value'),
    ao3.button.replaceChildren(relatedPopupElementDraft),
    deps.runAlt(ao3.button, relatedPopupElementDraft)),
    (relatedPopupElementDraft.textContent = rt2),
    (relatedPopupElementDraft.title = rt2),
    (ao3.button.dataset.entityId = relatedPopupElementTarget),
    ao3.button._entityCopySync?.(),
    (ao3.search.value = ''),
    ao3.menu.hidden || deps.runExtraVariant('', triggerElement.type),
    updateRelatedPopup(triggerElement, ao3.relatedSettings === false ? null : ao3.button.closest('.inspector-picker'))
}

export function resolveAssetPreviewUrl(deps: AssetPickerDeps, asset = 'image') {
  const ao4 = deps.runExtraAlt(asset)
  if (ao4.menu.hidden) return
  const assetIdText = ao4.button.getBoundingClientRect(),
    userAssetId = 5,
    assetMenuHorizontalMarginPx = 8,
    availableSizeName = Math.min(assetIdText.width, window.innerWidth - assetMenuHorizontalMarginPx * 2),
    availableSizeKey = window.innerHeight - assetIdText.bottom - userAssetId - assetMenuHorizontalMarginPx,
    measuredBoundsName = assetIdText.top - userAssetId - assetMenuHorizontalMarginPx,
    assetRelativePathState = availableSizeKey >= 250 || availableSizeKey >= measuredBoundsName,
    assetRelativePath = Math.max(150, Math.min(430, assetRelativePathState ? availableSizeKey : measuredBoundsName)),
    left2 = assetIdText.left
  ;(ao4.menu.style.left =
    clampNumber2(
      left2,
      assetMenuHorizontalMarginPx,
      Math.max(assetMenuHorizontalMarginPx, window.innerWidth - availableSizeName - assetMenuHorizontalMarginPx),
    ) + 'px'),
    (ao4.menu.style.width = availableSizeName + 'px'),
    (ao4.menu.style.maxHeight = assetRelativePath + 'px'),
    (ao4.options.style.maxHeight = Math.max(90, assetRelativePath - 58) + 'px'),
    (ao4.menu.style.top = assetRelativePathState
      ? assetIdText.bottom + userAssetId + 'px'
      : Math.max(assetMenuHorizontalMarginPx, assetIdText.top - assetRelativePath - userAssetId) + 'px')
}

export function refreshImageAssetPickerPreview(deps: AssetPickerDeps) {
  deps.resolveAssetPreviewUrl('image')
}

export function resolveAssetFileUrl(_deps: AssetPickerDeps, asset: any) {
  if (asset?.url) return String(asset.url)
  const encodedAssetPath = String(asset?.assetId || '')
  if (encodedAssetPath.startsWith('user:')) {
    const slice2 = encodedAssetPath.slice(5)
    return /^[0-9a-f]{32}$/.test(slice2) ? '/api/v1/assets/user/' + slice2 : ''
  }
  const replace2 = String(asset?.relativePath || encodedAssetPath).replace(/^builtin:/, ''),
    join = (
      replace2.startsWith('v1/2D/') || replace2.startsWith('v1/3D/')
        ? replace2.replace(/^v1\//, 'v1/户型图示例/')
        : replace2
    )
      .split('/')
      .filter(Boolean)
      .map((pathSegment) => encodeURIComponent(pathSegment))
      .join('/')
  if (!join) return ''
  return '/assets/builtin/' + join
}

export function resolveEffectAssetUrl(deps: AssetPickerDeps, effectAsset: any) {
  const effectVariantUrl = effectAsset?.effectVariant?.url
  return typeof effectVariantUrl == 'string' && effectVariantUrl.startsWith('/api/v1/assets/effect-variant?')
    ? effectVariantUrl
    : deps.runExtraTwin(effectAsset)
}

export function assetMatchesId(_deps: AssetPickerDeps, assetRecord: any, targetAssetId: any) {
  return assetRecord?.assetId === targetAssetId
}

export function allAssets(deps: AssetPickerDeps) {
  return [...deps.editorCtx.userAssetsState, ...deps.editorCtx.userAssets]
}

export function findAssetById(deps: AssetPickerDeps, wantedAssetId: any) {
  return deps.allAssets().find((assetCandidate: any) => deps.assetMatchesId(assetCandidate, wantedAssetId))
}

export function assetDisplayName(_deps: AssetPickerDeps, namedAsset: any) {
  return String(namedAsset?.name || namedAsset?.relativePath || namedAsset?.assetId || '').replace(
    /\.(?:png|jpe?g|webp|gif|svg)$/i,
    '',
  )
}

export function exportedAssetsInFolder(deps: AssetPickerDeps, targetFolderName: any) {
  return deps.editorCtx.userAssets.filter(
    (folderAsset: any) => folderAsset.folder === targetFolderName && folderAsset.source === 'studio3d-export',
  )
}

export function canDeleteAssetFolder(deps: AssetPickerDeps, folderSource: any, assetFolderName: any) {
  if (folderSource !== 'user' || !assetFolderName) return false
  const folderAssets = deps.editorCtx.userAssets.filter(
    (folderAssetRecord: any) => folderAssetRecord.folder === assetFolderName,
  )
  return folderAssets.length > 0 && folderAssets.every((checkedAsset: any) => checkedAsset.source === 'studio3d-export')
}

export function syncAssetFolderOptions(deps: AssetPickerDeps, assetSourceKind: any) {
  const isImageKind = assetSourceKind === 'image',
    Zt3 = isImageKind ? deps.editorCtx.imageAssetFolder : deps.editorCtx.effectAssetFolder,
    et2 = isImageKind ? deps.imageAssetMenuElement : deps.ibeAssetMenuElement,
    Ao2 = isImageKind ? deps.imageAssetFolderSelectElement : deps.ibeAssetFolderElement,
    folderSelectInputElement = isImageKind ? deps.imageAssetUploadHintElement : deps.ibeAssetUploadHintElement,
    folderSelectInput = isImageKind ? '[data-image-asset-source]' : '[data-ibe-asset-source]'
  for (const folderNamesElement of et2.querySelectorAll(folderSelectInput))
    folderNamesElement.classList.toggle(
      'active',
      folderNamesElement.dataset[isImageKind ? 'imageAssetSource' : 'ibeAssetSource'] === Zt3,
    )
  const folderNames = deps.customSelectsBySelectElement.get(Ao2)
  if (folderNames) {
    const Nt2 = Zt3 === 'user' ? deps.editorCtx.userAssets : deps.editorCtx.userAssetsState
    ;(folderNames.wrapper.hidden = !Nt2.some((sourceAssetItem: any) => sourceAssetItem.folder)),
      folderNames.wrapper.hidden && deps.runState(folderNames)
  }
  folderSelectInputElement.hidden = Zt3 !== 'user'
}

export function leftFolderName(deps: AssetPickerDeps, rightFolderName: any) {
  const isCurrentFolder = rightFolderName === 'image',
    Zt4 = isCurrentFolder ? deps.editorCtx.imageAssetFolder : deps.editorCtx.effectAssetFolder,
    Ao3 = isCurrentFolder ? deps.imageAssetFolderSelectElement : deps.ibeAssetFolderElement,
    Nt3 = Zt4 === 'user' ? deps.editorCtx.userAssets : deps.editorCtx.userAssetsState,
    sort3 = [
      ...new Set<string>(Nt3.map((mappedItemsView: any) => String(mappedItemsView.folder ?? '')).filter(Boolean)),
    ].sort((leftFolderLabel: string, rightFolderLabel: string) =>
      leftFolderLabel.localeCompare(rightFolderLabel, 'zh-CN'),
    ),
    xn2 = isCurrentFolder ? deps.editorCtx.imageAssetFolderState : deps.editorCtx.effectAssetFolderState,
    nextFolder = sort3.includes(xn2) ? xn2 : sort3[0] || ''
  isCurrentFolder
    ? (deps.editorCtx.imageAssetFolderState = nextFolder)
    : (deps.editorCtx.effectAssetFolderState = nextFolder),
    Ao3.replaceChildren(
      ...sort3.map(
        (folderNameToOption) =>
          new Option(folderNameToOption === '.' ? '根目录' : String(folderNameToOption), String(folderNameToOption)),
      ),
    ),
    (Ao3.value = nextFolder),
    deps.loadNavigationIconOptions(Ao3),
    deps.syncAssetFolderOptions(rightFolderName)
}

export function measureAssetImageSize(deps: AssetPickerDeps, measuredAsset: any) {
  return Number(measuredAsset?.width) > 0 && Number(measuredAsset?.height) > 0
    ? Promise.resolve({
        width: Number(measuredAsset.width),
        height: Number(measuredAsset.height),
      })
    : new Promise<{ width: number; height: number }>((resolveImageSize, rejectImageSize) => {
        const image = new Image()
        ;(image.decoding = 'async'),
          image.addEventListener(
            'load',
            () => {
              ;(measuredAsset.width = image.naturalWidth),
                (measuredAsset.height = image.naturalHeight),
                resolveImageSize({
                  width: measuredAsset.width,
                  height: measuredAsset.height,
                })
            },
            {
              once: true,
            },
          ),
          image.addEventListener(
            'error',
            () => rejectImageSize(new Error('无法读取图片尺寸：' + (measuredAsset?.name || ''))),
            {
              once: true,
            },
          ),
          (image.src = deps.runExtraTwin(measuredAsset))
      })
}

export function applyAssetNaturalSize(
  _deps: AssetPickerDeps,
  assetComponent: any,
  appliedAssetId: any,
  naturalSize: any,
) {
  const buildAssetLayout = (layoutPosition: any, layoutScale: any) => {
    const naturalWidth = Number(layoutPosition?.width || naturalSize.width),
      naturalHeight = Number(layoutPosition?.height || naturalSize.height),
      scaleFactor = clampNumber2(Number(layoutScale || 1), 0.01, 5),
      centerY = Number(layoutPosition?.x || 0) + naturalWidth / 2,
      centerYState = Number(layoutPosition?.y || 0) + naturalHeight / 2
    return {
      position: {
        ...(layoutPosition || {}),
        x: centerY - naturalSize.width / 2,
        y: centerYState - naturalSize.height / 2,
        width: naturalSize.width,
        height: naturalSize.height,
      },
      scale: clampNumber2((naturalWidth * scaleFactor) / naturalSize.width, 0.01, 5),
    }
  }
  if (
    ((assetComponent.properties = {
      ...(assetComponent.properties || {}),
    }),
    assetComponent.properties.layoutMode === 'fill')
  ) {
    const freeLayout = assetComponent.properties.freeLayout
    if (freeLayout?.position) {
      const filledLayout = buildAssetLayout(freeLayout.position, freeLayout.scale)
      assetComponent.properties.freeLayout = filledLayout
    }
  } else {
    const computedLayout = buildAssetLayout(assetComponent.position, assetComponent.style?.scale)
    ;(assetComponent.position = computedLayout.position),
      (assetComponent.style = {
        ...(assetComponent.style || {}),
        scale: computedLayout.scale,
      })
  }
  assetComponent.properties = {
    ...(assetComponent.properties || {}),
    assetId: appliedAssetId,
    fit: 'contain',
    naturalWidth: naturalSize.width,
    naturalHeight: naturalSize.height,
  }
}

export function readEffectNaturalSize(_deps: AssetPickerDeps, effectSourceComponent: any, fallbackSize: any = null) {
  const effectNaturalWidth = Number(effectSourceComponent?.effectNaturalWidth || fallbackSize?.width || 0),
    effectNaturalHeight = Number(effectSourceComponent?.effectNaturalHeight || fallbackSize?.height || 0)
  return effectNaturalWidth > 0 && effectNaturalHeight > 0
    ? {
        width: effectNaturalWidth,
        height: effectNaturalHeight,
      }
    : null
}

export function probeAssetNaturalSize(deps: AssetPickerDeps, probedComponent: any, probedAsset: any) {
  if (!probedComponent || !probedAsset) return
  const probeKey = probedComponent.id + ':' + probedAsset.assetId
  deps.pendingAssetProbeKeysSet.has(probeKey) ||
    (deps.pendingAssetProbeKeysSet.add(probeKey),
    deps
      .measureAssetImageSize(probedAsset)
      .then((measuredSize: any) => {
        const liveComponent = findComponent2(deps.editorCtx.activeProject?.document, probedComponent.id)?.component
        !liveComponent ||
          liveComponent.properties?.assetId !== probedAsset.assetId ||
          ((liveComponent.properties?.layoutMode === 'fill' ||
            (Number(liveComponent.position?.width) === measuredSize.width &&
              Number(liveComponent.position?.height) === measuredSize.height)) &&
            Number(liveComponent.properties?.naturalWidth) === measuredSize.width &&
            Number(liveComponent.properties?.naturalHeight) === measuredSize.height) ||
          deps.mutateDocument((mutatedDocument: any) => {
            const matchedDocumentComponent = findComponent2(mutatedDocument, probedComponent.id)?.component
            !matchedDocumentComponent ||
              matchedDocumentComponent.properties?.assetId !== probedAsset.assetId ||
              deps.applyAssetNaturalSize(matchedDocumentComponent, probedAsset.assetId, measuredSize)
          })
      })
      .catch(deps.handleOperationError)
      .finally(() => deps.pendingAssetProbeKeysSet.delete(probeKey)))
}

export function positionImageAssetMenu(deps: AssetPickerDeps) {
  if (deps.imageAssetMenuElement.hidden) return
  positionFloatingMenu({
    anchor: deps.imageAssetButtonElement,
    panel: deps.imageAssetMenuElement,
    optionsElement: deps.imageAssetOptionsElement,
    optionsReserve: 150,
    optionsMinHeight: 80,
    maxHeight: 470,
    gap: 8,
  })
}

export function positionAssetLargePreview(
  deps: AssetPickerDeps,
  hoveredOptionElement: any,
  assetMenuElement = deps.imageAssetMenuElement,
) {
  if (deps.imageAssetLargePreviewImageElement.hidden || !hoveredOptionElement?.isConnected) return
  const optionRect = hoveredOptionElement.getBoundingClientRect(),
    menuRectState = assetMenuElement.getBoundingClientRect(),
    previewRect = deps.imageAssetLargePreviewImageElement.getBoundingClientRect(),
    previewGapPx = 18,
    previewLeftPx =
      menuRectState.left < window.innerWidth / 2
        ? menuRectState.right + previewGapPx
        : menuRectState.left - previewRect.width - previewGapPx
  ;(deps.imageAssetLargePreviewImageElement.style.left =
    clampNumber2(previewLeftPx, 12, Math.max(12, window.innerWidth - previewRect.width - 12)) + 'px'),
    (deps.imageAssetLargePreviewImageElement.style.top =
      clampNumber2(optionRect.top, 12, Math.max(12, window.innerHeight - previewRect.height - 12)) + 'px')
}

export function scheduleAssetPreview(
  deps: AssetPickerDeps,
  previewAsset: any,
  previewAnchorElement: any,
  previewMenuElement = deps.imageAssetMenuElement,
) {
  !previewAsset ||
    !previewAnchorElement ||
    (clearTimeout(deps.editorCtx.assetPreviewTimeoutId),
    (deps.editorCtx.assetPreviewTimeoutId = window.setTimeout(() => {
      const jp2 = deps.resolveEffectAssetUrl(previewAsset)
      !jp2 ||
        previewMenuElement.hidden ||
        !previewAnchorElement.isConnected ||
        ((deps.imageAssetLargePreviewImageElementElement.onload = () =>
          deps.positionAssetLargePreview(previewAnchorElement, previewMenuElement)),
        (deps.imageAssetLargePreviewImageElementElement.src = jp2),
        (deps.imageAssetLargePreviewNameElement.textContent = previewAsset.name || previewAsset.relativePath),
        (deps.imageAssetLargePreviewImageElement.hidden = false),
        window.requestAnimationFrame(() => deps.positionAssetLargePreview(previewAnchorElement, previewMenuElement)))
    }, 300)))
}

export function hideAssetLargePreview(deps: AssetPickerDeps) {
  clearTimeout(deps.editorCtx.assetPreviewTimeoutId),
    (deps.editorCtx.assetPreviewTimeoutId = null),
    (deps.imageAssetLargePreviewImageElement.hidden = true),
    (deps.imageAssetLargePreviewImageElementElement.onload = null)
}

/* 图标与工具提示（图标按钮/菜单、提示、剪贴板） */

export interface IconPickersDeps {
  editorCtx: EditorContext
  airConditionerEntityButtonElement: any
  airConditionerEntityMenuElement: any
  cameraEntityButtonElement: any
  cameraEntityMenuElement: any
  copyTextToClipboard: any
  customSelectsBySelectElement: any
  enhanceEntityCopyButton: any
  handleOperationError: any
  hideAssetLargePreview: any
  ibeAssetButtonElement: any
  ibeAssetFolderElement: any
  ibeAssetMenuElement: any
  ibeEntityButtonElement: any
  ibeEntityMenuElement: any
  ibeIconButtonElement: any
  ibeIconCopyElement: any
  ibeIconMenuElement: any
  ibeIconOptionsElement: any
  iconButtonEntityButtonElement: any
  iconButtonEntityMenuElement: any
  iconButtonIconButtonElement: any
  iconButtonIconCopyElement: any
  iconButtonIconMenuElement: any
  iconButtonIconOptionsElement: any
  iconListStateByElement: any
  iconTooltipElementValue: any
  imageAssetButtonElement: any
  imageAssetFolderSelectElement: any
  imageAssetMenuElement: any
  imageEntityButtonElement: any
  imageEntityMenuElement: any
  lightStatisticsActionEntityButtonElement: any
  lightStatisticsActionEntityMenuElement: any
  lightStatisticsEntityButtonElement: any
  lightStatisticsEntityMenuElement: any
  lightStatisticsIconButtonElement: any
  lightStatisticsIconCopyElement: any
  lightStatisticsIconMenuElement: any
  lightStatisticsIconOptionsElement: any
  lineChartEntityButtonElement: any
  lineChartEntityMenuElement: any
  navigationEntityButtonElement: any
  navigationEntityMenuElement: any
  navigationIconButtonElement: any
  navigationIconCopyElement: any
  navigationIconMenuElement: any
  navigationIconOptionsElement: any
  removedComponent: any
  runDual: any
  runFallback: any
  runLeft: any
  runLimit: any
  runLower: any
  runPrimary: any
  runState: any
  titleButtonEntityButtonElement: any
  titleButtonEntityMenuElement: any
  titleButtonIconButtonElement: any
  titleButtonIconCopyElement: any
  titleButtonIconMenuElement: any
  titleButtonIconOptionsElement: any
  vacuumMapEntityButtonElement: any
  vacuumMapEntityMenuElement: any
  weatherEntityButtonElement: any
  weatherEntityMenuElement: any
}

export function closePickerMenu(deps: IconPickersDeps, iconButtonFollowsEntityElement: any, triggerButton: any) {
  ;(iconButtonFollowsEntityElement.hidden = true),
    triggerButton.setAttribute('aria-expanded', 'false'),
    iconButtonFollowsEntityElement === deps.imageAssetMenuElement &&
      (deps.hideAssetLargePreview(),
      deps.runState(deps.customSelectsBySelectElement.get(deps.imageAssetFolderSelectElement))),
    iconButtonFollowsEntityElement === deps.ibeAssetMenuElement &&
      (deps.hideAssetLargePreview(), deps.runState(deps.customSelectsBySelectElement.get(deps.ibeAssetFolderElement)))
}

export function closeOtherPickerMenus(deps: IconPickersDeps, excludedKind: any = null) {
  if (
    (excludedKind !== 'entity' && deps.runPrimary(deps.imageEntityMenuElement, deps.imageEntityButtonElement),
    excludedKind !== 'weather-entity' &&
      deps.runPrimary(deps.weatherEntityMenuElement, deps.weatherEntityButtonElement),
    excludedKind !== 'line-chart-entity' &&
      deps.runPrimary(deps.lineChartEntityMenuElement, deps.lineChartEntityButtonElement),
    excludedKind !== 'ibe-entity' && deps.runPrimary(deps.ibeEntityMenuElement, deps.ibeEntityButtonElement),
    excludedKind !== 'icon-button-entity' &&
      deps.runPrimary(deps.iconButtonEntityMenuElement, deps.iconButtonEntityButtonElement),
    excludedKind !== 'vacuum-map-entity' &&
      deps.runPrimary(deps.vacuumMapEntityMenuElement, deps.vacuumMapEntityButtonElement),
    excludedKind !== 'camera-entity' && deps.runPrimary(deps.cameraEntityMenuElement, deps.cameraEntityButtonElement),
    excludedKind !== 'air-conditioner-entity' &&
      deps.runPrimary(deps.airConditionerEntityMenuElement, deps.airConditionerEntityButtonElement),
    excludedKind !== 'title-button-entity' &&
      deps.runPrimary(deps.titleButtonEntityMenuElement, deps.titleButtonEntityButtonElement),
    excludedKind !== 'light-statistics-entity')
  ) {
    const isIconButtonFollowsEntity = !deps.lightStatisticsEntityMenuElement.hidden
    deps.runPrimary(deps.lightStatisticsEntityMenuElement, deps.lightStatisticsEntityButtonElement),
      isIconButtonFollowsEntity && deps.runLimit()
  }
  excludedKind !== 'light-statistics-action-entity' &&
    deps.runPrimary(deps.lightStatisticsActionEntityMenuElement, deps.lightStatisticsActionEntityButtonElement),
    excludedKind !== 'navigation-entity' &&
      deps.runPrimary(deps.navigationEntityMenuElement, deps.navigationEntityButtonElement),
    excludedKind !== 'asset' && deps.runPrimary(deps.imageAssetMenuElement, deps.imageAssetButtonElement),
    excludedKind !== 'ibe-asset' && deps.runPrimary(deps.ibeAssetMenuElement, deps.ibeAssetButtonElement),
    excludedKind !== 'ibe-icon' && deps.runPrimary(deps.ibeIconMenuElement, deps.ibeIconButtonElement),
    excludedKind !== 'icon-button-icon' &&
      deps.runPrimary(deps.iconButtonIconMenuElement, deps.iconButtonIconButtonElement),
    excludedKind !== 'title-button-icon' &&
      deps.runPrimary(deps.titleButtonIconMenuElement, deps.titleButtonIconButtonElement),
    excludedKind !== 'light-statistics-icon' &&
      deps.runPrimary(deps.lightStatisticsIconMenuElement, deps.lightStatisticsIconButtonElement),
    excludedKind !== 'navigation-icon' &&
      deps.runPrimary(deps.navigationIconMenuElement, deps.navigationIconButtonElement)
}

export function resolveMdiIconUrl(_deps: IconPickersDeps, iconName: any) {
  const replace = String(iconName || '')
    .trim()
    .replace(/^mdi:/, '')
  return /^[a-z0-9-]+$/.test(replace) ? '/static/vendor/mdi/7.4.47/svg/' + replace + '.svg' : ''
}

export function renderNavigationIconButton(deps: IconPickersDeps, iconName: any) {
  const iconButtonIconPreviewElement = String(iconName || ''),
    iconButtonIconLabelElement = deps.navigationIconButtonElement.querySelector('i'),
    iconButtonIconUrl = deps.navigationIconButtonElement.querySelector('span'),
    zi2 = deps.runDual(iconButtonIconPreviewElement)
  ;(iconButtonIconLabelElement.hidden = !zi2),
    (iconButtonIconLabelElement.style.maskImage = zi2 ? 'url("' + zi2 + '")' : ''),
    (iconButtonIconLabelElement.style.webkitMaskImage = zi2 ? 'url("' + zi2 + '")' : ''),
    (iconButtonIconUrl.textContent = iconButtonIconPreviewElement || '不使用图标'),
    (deps.navigationIconCopyElement.disabled = !iconButtonIconPreviewElement),
    (deps.navigationIconCopyElement.title = iconButtonIconPreviewElement
      ? '复制 ' + iconButtonIconPreviewElement
      : '当前未使用图标')
}

export function renderTitleButtonIconPreview(deps: IconPickersDeps, titleButtonIconName: any) {
  const effectIconValueValue = String(titleButtonIconName || ''),
    effectIconPreviewElementBar = deps.ibeIconButtonElement.querySelector('i'),
    titleButtonIconValue = deps.ibeIconButtonElement.querySelector('span'),
    zi3 = deps.runDual(effectIconValueValue)
  ;(effectIconPreviewElementBar.hidden = !zi3),
    (effectIconPreviewElementBar.style.maskImage = zi3 ? 'url("' + zi3 + '")' : ''),
    (effectIconPreviewElementBar.style.webkitMaskImage = zi3 ? 'url("' + zi3 + '")' : ''),
    (titleButtonIconValue.textContent = effectIconValueValue || '不使用图标'),
    (deps.ibeIconCopyElement.disabled = !effectIconValueValue),
    (deps.ibeIconCopyElement.title = effectIconValueValue ? '复制 ' + effectIconValueValue : '当前未使用图标')
}

export function renderEntityIconButtonPreview(deps: IconPickersDeps, iconName: any) {
  const titleIconPreviewElement = String(iconName || ''),
    includes = ['device-button', 'presence-sensor'].includes(deps.removedComponent()?.type),
    titleIconLabelElement = deps.iconButtonIconButtonElement.querySelector('i'),
    titleIconUrl = deps.iconButtonIconButtonElement.querySelector('span'),
    zi4 = deps.runDual(titleIconPreviewElement)
  ;(titleIconLabelElement.hidden = !zi4),
    (titleIconLabelElement.style.maskImage = zi4 ? 'url("' + zi4 + '")' : ''),
    (titleIconLabelElement.style.webkitMaskImage = zi4 ? 'url("' + zi4 + '")' : ''),
    (titleIconUrl.textContent = titleIconPreviewElement || (includes ? '跟随实体图标' : '不使用图标')),
    (deps.iconButtonIconCopyElement.disabled = !titleIconPreviewElement),
    (deps.iconButtonIconCopyElement.title = titleIconPreviewElement
      ? '复制 ' + titleIconPreviewElement
      : '当前未使用图标')
}

export function renderLightStatisticsIconPreview(deps: IconPickersDeps, iconName: any) {
  const titleButtonIconValueState = String(iconName || ''),
    titleIconPreviewElementElement = deps.titleButtonIconButtonElement.querySelector('i'),
    statisticsIconValue = deps.titleButtonIconButtonElement.querySelector('span'),
    zi5 = deps.runDual(titleButtonIconValueState)
  ;(titleIconPreviewElementElement.hidden = !zi5),
    (titleIconPreviewElementElement.style.maskImage = zi5 ? 'url("' + zi5 + '")' : ''),
    (titleIconPreviewElementElement.style.webkitMaskImage = zi5 ? 'url("' + zi5 + '")' : ''),
    (statisticsIconValue.textContent = titleButtonIconValueState || '不使用图标'),
    (deps.titleButtonIconCopyElement.disabled = !titleButtonIconValueState),
    (deps.titleButtonIconCopyElement.title = titleButtonIconValueState
      ? '复制 ' + titleButtonIconValueState
      : '当前未使用图标')
}

export function renderLightStatisticsButtonIcon(deps: IconPickersDeps, iconName: any) {
  const statisticsIconPreviewElement = String(iconName ?? 'mdi:lightbulb-group-outline'),
    statisticsIconLabelElement = deps.lightStatisticsIconButtonElement.querySelector('i'),
    statisticsIconUrl = deps.lightStatisticsIconButtonElement.querySelector('span'),
    zi6 = deps.runDual(statisticsIconPreviewElement)
  ;(statisticsIconLabelElement.hidden = !zi6),
    (statisticsIconLabelElement.style.maskImage = zi6 ? 'url("' + zi6 + '")' : ''),
    (statisticsIconLabelElement.style.webkitMaskImage = zi6 ? 'url("' + zi6 + '")' : ''),
    (statisticsIconUrl.textContent = statisticsIconPreviewElement || '不使用图标'),
    (deps.lightStatisticsIconCopyElement.disabled = !statisticsIconPreviewElement),
    (deps.lightStatisticsIconCopyElement.title = statisticsIconPreviewElement
      ? '复制 ' + statisticsIconPreviewElement
      : '当前未使用图标')
}

export async function copyTextToClipboard(_deps: IconPickersDeps, clipboardText: any) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(clipboardText)
    return
  }
  const clipboardTextAreaElement = document.createElement('textarea')
  ;(clipboardTextAreaElement.value = clipboardText),
    clipboardTextAreaElement.setAttribute('readonly', ''),
    (clipboardTextAreaElement.style.position = 'fixed'),
    (clipboardTextAreaElement.style.opacity = '0'),
    document.body.append(clipboardTextAreaElement),
    clipboardTextAreaElement.select()
  const execCommand = document.execCommand('copy')
  if ((clipboardTextAreaElement.remove(), !execCommand)) throw new Error('复制失败。')
}

export function enhanceEntityCopyButton(
  deps: IconPickersDeps,
  copyButtonHostElement: any,
  entityIdGetter = () => copyButtonHostElement.dataset.entityId || '',
) {
  if (!copyButtonHostElement || copyButtonHostElement.dataset.entityCopyReady === 'true')
    return copyButtonHostElement._entityCopySync
  deps.runFallback(copyButtonHostElement)
  const entityCopyRowElement = domElement(document, 'div', 'entity-picker-field-row')
  const entityCopyButtonElement = document.createElement('button')
  ;(entityCopyButtonElement.type = 'button'),
    (entityCopyButtonElement.className = 'navigation-icon-copy entity-picker-copy'),
    (entityCopyButtonElement.title = '复制实体 ID'),
    entityCopyButtonElement.setAttribute('aria-label', '复制实体 ID'),
    (entityCopyButtonElement.disabled = true),
    (entityCopyButtonElement.innerHTML =
      '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="5" y="5" width="8" height="8" rx="1.3"></rect><path d="M10.5 5V3.5A1.5 1.5 0 0 0 9 2H3.5A1.5 1.5 0 0 0 2 3.5V9A1.5 1.5 0 0 0 3.5 10.5H5"></path></svg><span aria-hidden="true">✓</span>')
  const syncEntityCopyButton = () => {
    const currentEntityId = String(entityIdGetter() || '')
    ;(entityCopyButtonElement.dataset.entityId = currentEntityId),
      (entityCopyButtonElement.disabled = !currentEntityId),
      (entityCopyButtonElement.title = currentEntityId ? '复制 ' + currentEntityId : '当前未选择实体')
  }
  return (
    entityCopyButtonElement.addEventListener('click', async (entityCopyClickEvent) => {
      entityCopyClickEvent.preventDefault(), entityCopyClickEvent.stopPropagation()
      const clickedEntityId = entityCopyButtonElement.dataset.entityId || ''
      if (clickedEntityId)
        try {
          await deps.copyTextToClipboard(clickedEntityId),
            entityCopyButtonElement.classList.add('copied'),
            window.setTimeout(() => entityCopyButtonElement.classList.remove('copied'), 1000)
        } catch (entityCopyError: any) {
          deps.handleOperationError(entityCopyError)
        }
    }),
    copyButtonHostElement.replaceWith(entityCopyRowElement),
    entityCopyRowElement.append(copyButtonHostElement, entityCopyButtonElement),
    (copyButtonHostElement.dataset.entityCopyReady = 'true'),
    (copyButtonHostElement._entityCopySync = syncEntityCopyButton),
    syncEntityCopyButton(),
    syncEntityCopyButton
  )
}

export function enhanceEntityCopyButtons(deps: IconPickersDeps) {
  for (const entityButtonId of [
    'image-entity-button',
    'ibe-entity-button',
    'icon-button-entity-button',
    'air-conditioner-entity-button',
    'vacuum-map-entity-button',
    'camera-entity-button',
    'weather-entity-button',
    'line-chart-entity-button',
    'navigation-entity-button',
    'popup-module-entity-button',
  ]) {
    const elementById = document.getElementById(entityButtonId)
    elementById && deps.enhanceEntityCopyButton(elementById)
  }
}

export function ensureIconListPaginationState(deps: IconPickersDeps, element: any) {
  let iconTooltipElementState = deps.iconListStateByElement.get(element)
  return (
    iconTooltipElementState ||
      ((iconTooltipElementState = {
        query: '',
        offset: 0,
        total: 0,
        loading: false,
        complete: false,
        generation: 0,
      }),
      deps.iconListStateByElement.set(element, iconTooltipElementState)),
    iconTooltipElementState
  )
}

export function hideIconNameTooltip(deps: IconPickersDeps) {
  deps.editorCtx.iconTooltipElement?.remove(), (deps.editorCtx.iconTooltipElement = null)
}

export function showIconNameTooltip(deps: IconPickersDeps, iconTooltipElementElement: any, tooltipLabel: any) {
  deps.runLower()
  const iconTooltipElementPanel = iconTooltipElementElement.closest('dialog')
  if (!iconTooltipElementPanel?.open || !tooltipLabel) return
  const iconTooltipElementSection = document.createElement('div')
  ;(iconTooltipElementSection.className = 'editor-icon-name-tooltip'),
    (iconTooltipElementSection.textContent = tooltipLabel),
    iconTooltipElementPanel.append(iconTooltipElementSection)
  const targetBounds = iconTooltipElementElement.getBoundingClientRect(),
    targetBoundsState = iconTooltipElementSection.getBoundingClientRect(),
    clampedUpper = Math.min(
      window.innerWidth - targetBoundsState.width - 8,
      Math.max(8, targetBounds.left + (targetBounds.width - targetBoundsState.width) / 2),
    )
  let measuredBounds = targetBounds.top - targetBoundsState.height - 8
  measuredBounds < 8 && (measuredBounds = targetBounds.bottom + 8),
    (iconTooltipElementSection.style.left = clampedUpper + 'px'),
    (iconTooltipElementSection.style.top = measuredBounds + 'px'),
    (deps.editorCtx.iconTooltipElement = iconTooltipElementSection)
}

export function bindIconNameTooltipEvents(deps: IconPickersDeps, hostElement: any, tooltipLabel: any) {
  hostElement.addEventListener('pointerenter', () => deps.runLeft(hostElement, tooltipLabel)),
    hostElement.addEventListener('pointerleave', deps.runLower),
    hostElement.addEventListener('focus', () => deps.runLeft(hostElement, tooltipLabel)),
    hostElement.addEventListener('blur', deps.runLower)
}

export function bindIconListInfiniteScroll(deps: IconPickersDeps, iconTooltipElementList: any, loadMore: any) {
  iconTooltipElementList.addEventListener('scroll', () => {
    iconTooltipElementList.scrollHeight - iconTooltipElementList.scrollTop - iconTooltipElementList.clientHeight >
      120 || loadMore().catch(deps.handleOperationError)
  })
}

export async function iconTooltipElementCount(
  deps: IconPickersDeps,
  iconTooltipElementIndex = '',
  { append: iconTooltipElementTotal = false } = {},
) {
  return deps.iconTooltipElementValue({
    optionsElement: deps.navigationIconOptionsElement,
    query: iconTooltipElementIndex,
    currentIcon: deps.removedComponent()?.properties?.icon || '',
    append: iconTooltipElementTotal,
  })
}

export async function iconTooltipElementFlag(
  deps: IconPickersDeps,
  iconTooltipElementSlot = '',
  { append: iconTooltipElementCase = false } = {},
) {
  return deps.iconTooltipElementValue({
    optionsElement: deps.ibeIconOptionsElement,
    query: iconTooltipElementSlot,
    currentIcon: deps.removedComponent()?.properties?.icon || '',
    append: iconTooltipElementCase,
  })
}

export async function iconTooltipElementStep(
  deps: IconPickersDeps,
  iconTooltipElementPhase = '',
  { append: iconTooltipElementView = false } = {},
) {
  const createdInstanceValue = deps.removedComponent()
  return deps.iconTooltipElementValue({
    optionsElement: deps.iconButtonIconOptionsElement,
    query: iconTooltipElementPhase,
    currentIcon: createdInstanceValue?.properties?.icon || '',
    clearLabel: createdInstanceValue?.type === 'device-button' ? '跟随实体图标' : '不使用图标',
    append: iconTooltipElementView,
  })
}

export async function iconTooltipElementStore(
  deps: IconPickersDeps,
  iconTooltipElementCache = '',
  { append: iconTooltipElementQueue = false } = {},
) {
  return deps.iconTooltipElementValue({
    optionsElement: deps.titleButtonIconOptionsElement,
    query: iconTooltipElementCache,
    currentIcon: deps.removedComponent()?.properties?.icon || '',
    append: iconTooltipElementQueue,
  })
}

export async function iconTooltipElementBuffer(
  deps: IconPickersDeps,
  iconTooltipElementCursor = '',
  { append: iconTooltipElementPointer = false } = {},
) {
  const availableProperties = deps.removedComponent()?.properties || {},
    iconTooltipElementTarget = String(
      Object.hasOwn(availableProperties, 'icon') ? availableProperties.icon || '' : 'mdi:lightbulb-group-outline',
    )
  return deps.iconTooltipElementValue({
    optionsElement: deps.lightStatisticsIconOptionsElement,
    query: iconTooltipElementCursor,
    currentIcon: iconTooltipElementTarget,
    datasetKey: 'lightStatisticsIconName',
    append: iconTooltipElementPointer,
  })
}

export function positionNavigationIconMenu(deps: IconPickersDeps) {
  if (deps.navigationIconMenuElement.hidden) return
  const parentBounds = deps.navigationIconButtonElement.parentElement.getBoundingClientRect(),
    iconTooltipMarginPx = 5,
    iconTooltipGapPx = 8,
    availableSize = window.innerHeight - parentBounds.bottom - iconTooltipMarginPx - iconTooltipGapPx,
    measuredBoundsState = parentBounds.top - iconTooltipMarginPx - iconTooltipGapPx,
    iconTooltipElementSource = availableSize >= 250 || availableSize >= measuredBoundsState,
    clampedLower = Math.max(150, Math.min(390, iconTooltipElementSource ? availableSize : measuredBoundsState))
  ;(deps.navigationIconMenuElement.style.left =
    clampNumber2(
      parentBounds.left,
      iconTooltipGapPx,
      Math.max(iconTooltipGapPx, window.innerWidth - parentBounds.width - iconTooltipGapPx),
    ) + 'px'),
    (deps.navigationIconMenuElement.style.top = iconTooltipElementSource
      ? parentBounds.bottom + iconTooltipMarginPx + 'px'
      : Math.max(iconTooltipGapPx, parentBounds.top - clampedLower - iconTooltipMarginPx) + 'px'),
    (deps.navigationIconMenuElement.style.width = parentBounds.width + 'px'),
    (deps.navigationIconMenuElement.style.maxHeight = clampedLower + 'px'),
    (deps.navigationIconOptionsElement.style.maxHeight = Math.max(90, clampedLower - 57) + 'px')
}

export function positionIbeIconMenu(deps: IconPickersDeps) {
  if (deps.ibeIconMenuElement.hidden) return
  const parentBoundsState = deps.ibeIconButtonElement.parentElement.getBoundingClientRect(),
    iconTooltipStateValue = 5,
    iconTooltipStateConfig = 8,
    availableSizeState = window.innerHeight - parentBoundsState.bottom - iconTooltipStateValue - iconTooltipStateConfig,
    measuredBoundsValue = parentBoundsState.top - iconTooltipStateValue - iconTooltipStateConfig,
    iconTooltipElementOrigin = availableSizeState >= 250 || availableSizeState >= measuredBoundsValue,
    clampedLowerState = Math.max(
      150,
      Math.min(390, iconTooltipElementOrigin ? availableSizeState : measuredBoundsValue),
    )
  ;(deps.ibeIconMenuElement.style.left =
    clampNumber2(
      parentBoundsState.left,
      iconTooltipStateConfig,
      Math.max(iconTooltipStateConfig, window.innerWidth - parentBoundsState.width - iconTooltipStateConfig),
    ) + 'px'),
    (deps.ibeIconMenuElement.style.top = iconTooltipElementOrigin
      ? parentBoundsState.bottom + iconTooltipStateValue + 'px'
      : Math.max(iconTooltipStateConfig, parentBoundsState.top - clampedLowerState - iconTooltipStateValue) + 'px'),
    (deps.ibeIconMenuElement.style.width = parentBoundsState.width + 'px'),
    (deps.ibeIconMenuElement.style.maxHeight = clampedLowerState + 'px'),
    (deps.ibeIconOptionsElement.style.maxHeight = Math.max(90, clampedLowerState - 57) + 'px')
}

export function positionIconButtonIconMenu(deps: IconPickersDeps) {
  if (deps.iconButtonIconMenuElement.hidden) return
  const parentBoundsValue = deps.iconButtonIconButtonElement.parentElement.getBoundingClientRect(),
    iconTooltipStateRef = 5,
    iconTooltipStateEntry = 8,
    availableSizeValue = window.innerHeight - parentBoundsValue.bottom - iconTooltipStateRef - iconTooltipStateEntry,
    measuredBoundsConfig = parentBoundsValue.top - iconTooltipStateRef - iconTooltipStateEntry,
    iconTooltipElementDraft = availableSizeValue >= 250 || availableSizeValue >= measuredBoundsConfig,
    clampedLowerValue = Math.max(
      150,
      Math.min(390, iconTooltipElementDraft ? availableSizeValue : measuredBoundsConfig),
    )
  ;(deps.iconButtonIconMenuElement.style.left =
    clampNumber2(
      parentBoundsValue.left,
      iconTooltipStateEntry,
      Math.max(iconTooltipStateEntry, window.innerWidth - parentBoundsValue.width - iconTooltipStateEntry),
    ) + 'px'),
    (deps.iconButtonIconMenuElement.style.top = iconTooltipElementDraft
      ? parentBoundsValue.bottom + iconTooltipStateRef + 'px'
      : Math.max(iconTooltipStateEntry, parentBoundsValue.top - clampedLowerValue - iconTooltipStateRef) + 'px'),
    (deps.iconButtonIconMenuElement.style.width = parentBoundsValue.width + 'px'),
    (deps.iconButtonIconMenuElement.style.maxHeight = clampedLowerValue + 'px'),
    (deps.iconButtonIconOptionsElement.style.maxHeight = Math.max(90, clampedLowerValue - 57) + 'px')
}

export function layoutTitleButtonIconMenu(deps: IconPickersDeps) {
  if (deps.titleButtonIconMenuElement.hidden) return
  const parentBoundsConfig = deps.titleButtonIconButtonElement.parentElement.getBoundingClientRect(),
    relatedPopupMarginPx = 5,
    relatedPopupGapPx = 8,
    availableSizeConfig = window.innerHeight - parentBoundsConfig.bottom - relatedPopupMarginPx - relatedPopupGapPx,
    measuredBoundsRef = parentBoundsConfig.top - relatedPopupMarginPx - relatedPopupGapPx,
    relatedPopupElementState = availableSizeConfig >= 250 || availableSizeConfig >= measuredBoundsRef,
    clampedLowerConfig = Math.max(
      150,
      Math.min(390, relatedPopupElementState ? availableSizeConfig : measuredBoundsRef),
    )
  ;(deps.titleButtonIconMenuElement.style.left =
    clampNumber2(
      parentBoundsConfig.left,
      relatedPopupGapPx,
      Math.max(relatedPopupGapPx, window.innerWidth - parentBoundsConfig.width - relatedPopupGapPx),
    ) + 'px'),
    (deps.titleButtonIconMenuElement.style.top = relatedPopupElementState
      ? parentBoundsConfig.bottom + relatedPopupMarginPx + 'px'
      : Math.max(relatedPopupGapPx, parentBoundsConfig.top - clampedLowerConfig - relatedPopupMarginPx) + 'px'),
    (deps.titleButtonIconMenuElement.style.width = parentBoundsConfig.width + 'px'),
    (deps.titleButtonIconMenuElement.style.maxHeight = clampedLowerConfig + 'px'),
    (deps.titleButtonIconOptionsElement.style.maxHeight = Math.max(90, clampedLowerConfig - 57) + 'px')
}
