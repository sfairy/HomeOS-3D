import { type EditorContext } from './editor-context'
import { syncProjectTemplateOptions } from '../bindings'
import { greatestCommonDivisor as greatestCommonDivisor2, clampNumber as clampNumber2, roundField as roundField2, clone as clone2, componentLabel as componentLabel2 } from '../editor'
import { navigateInShell } from '@/studio/platform/shell-navigation'
import { normalizeBaseLighting as normalizeBaseLighting2 } from '../../../authoring/loaders/studio-normalization'
import { findComponent as findComponent2 } from '../component-tree'
import { confirmAction } from '../../shared/ui'
import { navigationPreviewClickComponentIdState, onNavigationStyleApplyConfirmButtonClickState, onNavigationStyleApplyConfirmButtonClickValue, onNavigationStyleApplyDialogCloseValue, styleSourceComponentIdState, styleComponentTypeState, styleComponentTypeValue, styleComponentTypeConfig, navigationIconOptionState, navigationIconOptionLabels, navigationIconDraftDocumentValue, navigationIconDraftDocumentConfig, entryStateRef, entryStateEntry, navigationVisibilityComponentValue } from '../metadata/editor-navigation-style-metadata'
import { DEFAULT_PERSPECTIVE_CORNERS } from '../metadata/editor-perspective-constants'
import { renderNavigationStyleApplyTargets as runVariantLowerCore, createNavigationStyleApplyOption } from '../navigation-style-apply/target-options'
import { normalizeFlowLine as normalizeFlowLine2, FLOW_LINE_FIELDS as FLOW_LINE_FIELDS2 } from '../../shared/flow-line-model'
import { renderPagedPickerDialog } from '../copy-backup/run-copy-backup'

/* 灯光面板（灯光输入、自动灯光、资源删除、弹窗） */

export interface LightingPanelDeps {
  editorCtx: EditorContext
  buttonVisibilityDraftDocument: any
  currentPage: any
  floorplanAutoLightingPanelElement: any
  floorplanAutoLightingStatusElement: any
  floorplanBaseLightElements: any
  handleOperationError: any
  imageEntityDraftDocument: any
  lightFieldElement: any
  lightStatisticsEntityListClickEvent: any
  lightingPayload: any
  mutateDocument: any
  openLightingPanel: any
  pageDialogElement: any
  pageDialogKickerElement: any
  pageDialogTitleElement: any
  pageFormElement: any
  pageMessageElement: any
  pageSubmitElement: any
  popupId: any
  projectAspectLockElement: any
  projectAspectLockLabelElement: any
  projectAspectRatioElement: any
  projectCanvasFieldsElement: any
  projectCanvasHeightElement: any
  projectCanvasHintElement: any
  projectCanvasWidthElement: any
  projectContentLockElement: any
  projectContentLockFieldsElement: any
  projectDialogElement: any
  projectDialogKickerElement: any
  projectDialogTitleElement: any
  projectFormElement: any
  projectMessageElement: any
  projectPreviewCountElement: any
  projectPreviewDialogElement: any
  projectPreviewImageElement: any
  projectPreviewTitleElement: any
  projectResizeWarningDialogElement: any
  projectResizeWarningTextElement: any
  projectSubmitElement: any
  projectTemplateFieldsElement: any
  projectTemplateOptionsElement: any
  reloadAssetCatalog: any
  requestJson: any
  setSettingsMessage: any
  syncAspectLockButton: any
  targetPageCandidate: any
  titleButtonIconOptionClickEvent: any
}

export async function actionDraftDocument(deps: LightingPanelDeps) {
  return deps.syncAspectLockButton()
}

export function targetPageCandidate(deps: LightingPanelDeps) {
  deps.editorCtx.resizeWarningResolveState = ''
  const cameraCommandState = [
    {
      id: '',
      name: '空白仪表盘',
      description: '创建空白画布，不预置页面、控件或弹窗。',
      previewUrls: [] as any[],
      previewLabels: [] as any[],
      canvasWidth: null as any,
      canvasHeight: null as any,
    },
  ]
  syncProjectTemplateOptions({
    get projectTemplateOptionsElement() {
      return deps.projectTemplateOptionsElement
    },
    cameraCommandState,
    get resizeWarningResolveState() {
      return deps.editorCtx.resizeWarningResolveState
    },
    get projectCanvasFieldsElement() {
      return deps.projectCanvasFieldsElement
    },
    get projectDialogMode() {
      return deps.editorCtx.projectDialogMode
    },
    get projectFormElement() {
      return deps.projectFormElement
    },
    get projectCanvasWidthElement() {
      return deps.projectCanvasWidthElement
    },
    get projectCanvasHeightElement() {
      return deps.projectCanvasHeightElement
    },
    get isAspectLockedState() {
      return deps.editorCtx.isAspectLockedState
    },
    get isAspectLockedValue() {
      return deps.editorCtx.isAspectLockedValue
    },
    get projectCanvasHintElement() {
      return deps.projectCanvasHintElement
    },
    get lightStatisticsEntityListClickEvent() {
      return deps.lightStatisticsEntityListClickEvent
    },
    get imageEntityDraftDocument() {
      return deps.imageEntityDraftDocument
    },
  })
}

export function buttonVisibilityDraftDocument(_deps: LightingPanelDeps, iconPreviewStateClickEventElement: any) {
  try {
    return {
      urls: JSON.parse(iconPreviewStateClickEventElement.dataset.previewUrls || '[]'),
      labels: JSON.parse(iconPreviewStateClickEventElement.dataset.previewLabels || '[]'),
    }
  } catch {
    return {
      urls: [] as any[],
      labels: [] as any[],
    }
  }
}

export function titleButtonIconOptionClickEvent(deps: LightingPanelDeps) {
  deps.editorCtx.lockedCanvasWidthValue.length &&
    ((deps.editorCtx.lockedCanvasHeight =
      ((deps.editorCtx.lockedCanvasHeight % deps.editorCtx.lockedCanvasWidthValue.length) +
        deps.editorCtx.lockedCanvasWidthValue.length) %
      deps.editorCtx.lockedCanvasWidthValue.length),
    (deps.projectPreviewImageElement.src = deps.editorCtx.lockedCanvasWidthValue[deps.editorCtx.lockedCanvasHeight]),
    (deps.projectPreviewImageElement.alt =
      deps.editorCtx.lockedCanvasHeightState[deps.editorCtx.lockedCanvasHeight] ||
      'HomeOS预览 ' + (deps.editorCtx.lockedCanvasHeight + 1)),
    (deps.projectPreviewTitleElement.textContent =
      deps.editorCtx.lockedCanvasHeightState[deps.editorCtx.lockedCanvasHeight] || 'HomeOS预览'),
    (deps.projectPreviewCountElement.textContent =
      deps.editorCtx.lockedCanvasHeight + 1 + ' / ' + deps.editorCtx.lockedCanvasWidthValue.length))
}

export function titleButtonIconDraftDocument(deps: LightingPanelDeps, lightStatisticsIconClickEventElement: any) {
  const { urls: qw4, labels: qw5 } = deps.buttonVisibilityDraftDocument(lightStatisticsIconClickEventElement)
  qw4.length &&
    ((deps.editorCtx.lockedCanvasWidthValue = qw4),
    (deps.editorCtx.lockedCanvasHeightState = qw5),
    (deps.editorCtx.lockedCanvasHeight = Number(lightStatisticsIconClickEventElement.dataset.previewIndex || 0)),
    deps.titleButtonIconOptionClickEvent(),
    deps.projectPreviewDialogElement.showModal())
}

export function lightStatisticsIconCopyError(deps: LightingPanelDeps, lightStatisticsIconOptionClickEvent = 'create') {
  deps.editorCtx.projectDialogMode = lightStatisticsIconOptionClickEvent
  const isClosed = lightStatisticsIconOptionClickEvent === 'edit',
    isPreviewActiveActive = lightStatisticsIconOptionClickEvent === 'resize'
  if (
    (deps.projectFormElement.reset(),
    (deps.projectDialogKickerElement.textContent = isPreviewActiveActive
      ? 'RESIZE DASHBOARD'
      : isClosed
        ? 'EDIT PROJECT'
        : 'NEW PROJECT'),
    (deps.projectDialogTitleElement.textContent = isPreviewActiveActive
      ? '修改仪表盘分辨率'
      : isClosed
        ? '修改仪表盘'
        : '创建仪表盘项目'),
    (deps.projectSubmitElement.textContent = isPreviewActiveActive ? '应用修改' : isClosed ? '保存修改' : '创建项目'),
    (deps.projectFormElement.elements.name.value =
      isClosed || isPreviewActiveActive ? deps.editorCtx.activeProject?.document?.name || '' : '我的仪表盘'),
    (deps.projectTemplateFieldsElement.hidden = isClosed || isPreviewActiveActive),
    (deps.projectCanvasWidthElement.readOnly = false),
    (deps.projectCanvasHeightElement.readOnly = false),
    (deps.projectContentLockElement.checked = false),
    (deps.projectContentLockFieldsElement.hidden = !isPreviewActiveActive),
    deps.projectCanvasFieldsElement.classList.remove('fixed', 'name-only'),
    !isClosed && !isPreviewActiveActive)
  )
    (deps.editorCtx.isAspectLockedState = 2778),
      (deps.editorCtx.isAspectLockedValue = 1940),
      (deps.editorCtx.isAspectLocked = false),
      (deps.editorCtx.lockedCanvasWidthState = 2778),
      (deps.editorCtx.lockedCanvasWidth = 1940),
      (deps.projectCanvasWidthElement.value = '2778'),
      (deps.projectCanvasHeightElement.value = '1940'),
      deps.lightStatisticsEntityListClickEvent(),
      deps.targetPageCandidate()
  else {
    if (isClosed)
      (deps.projectCanvasFieldsElement.hidden = false), deps.projectCanvasFieldsElement.classList.add('name-only')
    else {
      deps.editorCtx.resizeWarningResolveState = ''
      const lightStatisticsIconOptionElement = Number(deps.editorCtx.activeProject?.document?.canvas?.width || 2778),
        lightStatisticsEntityOptionElement = Number(deps.editorCtx.activeProject?.document?.canvas?.height || 1940)
      ;(deps.editorCtx.isAspectLockedState = lightStatisticsIconOptionElement),
        (deps.editorCtx.isAspectLockedValue = lightStatisticsEntityOptionElement),
        (deps.editorCtx.isAspectLocked = true),
        (deps.editorCtx.lockedCanvasWidthState = lightStatisticsIconOptionElement),
        (deps.editorCtx.lockedCanvasWidth = lightStatisticsEntityOptionElement),
        (deps.projectCanvasFieldsElement.hidden = false),
        (deps.projectCanvasWidthElement.value = String(lightStatisticsIconOptionElement)),
        (deps.projectCanvasHeightElement.value = String(lightStatisticsEntityOptionElement)),
        (deps.projectCanvasHintElement.textContent =
          '默认会同步调整所有页面、控件和弹窗；勾选“锁定控件大小及位置”后保留普通控件的位置和尺寸，3D 交互外框始终跟随画布宽高。'),
        deps.lightStatisticsEntityListClickEvent(),
        deps.imageEntityDraftDocument(false)
    }
  }
  deps.setSettingsMessage(deps.projectMessageElement, ''), deps.projectDialogElement.showModal()
}

export function lightStatisticsEntityListClickEvent(deps: LightingPanelDeps) {
  const statisticsReplaceElement = Number(deps.projectCanvasWidthElement.value),
    statisticsRemoveElement = Number(deps.projectCanvasHeightElement.value)
  if (
    !Number.isInteger(statisticsReplaceElement) ||
    !Number.isInteger(statisticsRemoveElement) ||
    statisticsReplaceElement <= 0 ||
    statisticsRemoveElement <= 0
  ) {
    deps.projectAspectRatioElement.textContent = '等待输入有效分辨率'
    return
  }
  const $a2 =
      !deps.editorCtx.resizeWarningResolveState && deps.editorCtx.isAspectLocked
        ? deps.editorCtx.lockedCanvasWidthState
        : statisticsReplaceElement,
    Fa2 =
      !deps.editorCtx.resizeWarningResolveState && deps.editorCtx.isAspectLocked
        ? deps.editorCtx.lockedCanvasWidth
        : statisticsRemoveElement,
    imageEntityOptionElement = greatestCommonDivisor2($a2, Fa2)
  deps.projectAspectRatioElement.textContent = $a2 / imageEntityOptionElement + ' : ' + Fa2 / imageEntityOptionElement
}

export function imageEntityDraftDocument(
  deps: LightingPanelDeps,
  imageActionKey = !!deps.editorCtx.resizeWarningResolveState,
) {
  const Sn2 = imageActionKey || deps.editorCtx.isAspectLocked
  ;(deps.projectAspectLockElement.disabled = imageActionKey),
    deps.projectAspectLockElement.setAttribute('aria-pressed', String(Sn2)),
    deps.projectAspectLockElement.classList.toggle('locked', Sn2),
    (deps.projectAspectLockLabelElement.textContent = imageActionKey ? '固定' : Sn2 ? '已锁定' : '锁定'),
    (deps.projectAspectLockElement.title = imageActionKey
      ? 'HomeOS画布使用固定比例'
      : Sn2
        ? '点击解锁画布比例'
        : '锁定当前画布比例')
}

export function openAssetPicker(deps: LightingPanelDeps, assetTriggerButton: any) {
  if (deps.editorCtx.resizeWarningResolveState || !deps.editorCtx.isAspectLocked) return
  const assetCurrentRecord = Number(deps.editorCtx.lockedCanvasWidthState),
    assetInitialIndex = Number(deps.editorCtx.lockedCanvasWidth)
  if (!(!assetCurrentRecord || !assetInitialIndex)) {
    if (assetTriggerButton === 'width') {
      let assetMatches = Number(deps.projectCanvasWidthElement.value)
      if (!Number.isInteger(assetMatches) || assetMatches < 320 || assetMatches > 7680) return
      let round = Math.round((assetMatches * assetInitialIndex) / assetCurrentRecord)
      ;(round < 240 || round > 4320) &&
        ((round = Math.max(240, Math.min(4320, round))),
        (assetMatches = Math.max(320, Math.min(7680, Math.round((round * assetCurrentRecord) / assetInitialIndex)))),
        (deps.projectCanvasWidthElement.value = String(assetMatches))),
        (deps.projectCanvasHeightElement.value = String(round))
    } else {
      let assetOptionButtonElement = Number(deps.projectCanvasHeightElement.value)
      if (
        !Number.isInteger(assetOptionButtonElement) ||
        assetOptionButtonElement < 240 ||
        assetOptionButtonElement > 4320
      )
        return
      let round2 = Math.round((assetOptionButtonElement * assetCurrentRecord) / assetInitialIndex)
      ;(round2 < 320 || round2 > 7680) &&
        ((round2 = Math.max(320, Math.min(7680, round2))),
        (assetOptionButtonElement = Math.max(
          240,
          Math.min(4320, Math.round((round2 * assetInitialIndex) / assetCurrentRecord)),
        )),
        (deps.projectCanvasHeightElement.value = String(assetOptionButtonElement))),
        (deps.projectCanvasWidthElement.value = String(round2))
    }
  }
}

export async function assetIdToDelete(
  _deps: LightingPanelDeps,
  assetDocumentNode: any,
  requestDeleteAssetFolder: any,
  folderKind: any,
) {
  return confirmAction({
    title: '控件可能超出画布',
    message:
      '当前分辨率为 ' +
      requestDeleteAssetFolder +
      ' × ' +
      folderKind +
      '，预计有 ' +
      assetDocumentNode +
      ' 个控件会部分或全部位于画布范围之外。\n\n继续后，锁定的控件不会自动缩放或移动。你可以在编辑器中手动把它们移回画布范围内。',
    confirmLabel: '继续修改',
    cancelLabel: '返回修改',
  })
}

export function folderDocumentNode(deps: LightingPanelDeps, refreshAssetPickerViews: any) {
  const rp2 = deps.editorCtx.resizeWarningResolve
  deps.editorCtx.resizeWarningResolve = null
  deps.projectResizeWarningDialogElement?.open && deps.projectResizeWarningDialogElement.close()
  rp2?.(refreshAssetPickerViews)
}

export function closeDeletePopupDialog(deps: LightingPanelDeps, popupDeleteUsageEntries = 'create') {
  if (!deps.editorCtx.activeProject) return
  deps.editorCtx.pageDialogMode = popupDeleteUsageEntries
  const isImageAssetPicker = popupDeleteUsageEntries === 'rename'
  deps.pageFormElement.reset(),
    (deps.pageDialogKickerElement.textContent = isImageAssetPicker ? 'EDIT PAGE' : 'NEW PAGE'),
    (deps.pageDialogTitleElement.textContent = isImageAssetPicker ? '重命名页面' : '新建页面'),
    (deps.pageSubmitElement.textContent = isImageAssetPicker ? '保存修改' : '创建页面'),
    (deps.pageFormElement.elements.name.value = (isImageAssetPicker && deps.currentPage()?.name) || ''),
    deps.setSettingsMessage(deps.pageMessageElement, ''),
    deps.pageDialogElement.showModal()
}

export function documentSource(deps: LightingPanelDeps) {
  return deps.editorCtx.hasUnsavedChanges
    ? (deps.handleOperationError(new Error('当前有未保存修改，请先点击顶部的“保存”。')), true)
    : false
}

export function popupId(_deps: LightingPanelDeps, _entityLabelFor: any) {}

export async function triggerKey(deps: LightingPanelDeps) {
  const documentPages = await deps.requestJson('/license/status')
  if (documentPages?.required && !documentPages.allowed) return (navigateInShell('/activate'), documentPages)
  const sharedUsages = JSON.stringify([...(documentPages?.features || [])].sort()),
    sharedScopeText =
      deps.editorCtx.lastLicenseFeatureSignature !== null && deps.editorCtx.lastLicenseFeatureSignature !== sharedUsages
  deps.editorCtx.lastLicenseFeatureSignature = sharedUsages
  return (
    sharedScopeText && (await deps.reloadAssetCatalog({ refreshInspector: false })),
    deps.popupId(documentPages),
    documentPages
  )
}

export function findDiagramPreviewFrame(
  _deps: LightingPanelDeps,
  lightingComponentId: any,
  applyBaseLightingToPanel: any,
  baseLighting: any = null,
) {
  const normalizedLightingElement = document.querySelector<HTMLIFrameElement>(
    '.hb-component[data-component-id="' + CSS.escape(lightingComponentId) + '"] .hb-floorplan-auto-diagram-preview',
  )
  return normalizedLightingElement?.contentWindow
    ? (normalizedLightingElement.contentWindow.postMessage(
        {
          type: 'homeos-floorplan-auto-diagram-camera',
          componentId: lightingComponentId,
          command: applyBaseLightingToPanel,
          value: baseLighting,
        },
        window.location.origin,
      ),
      true)
    : false
}

export function lightInputElement(_deps: LightingPanelDeps, openAutoDiagramDialog: any, dialogComponentId: any) {
  const cancelRemovesComponentElement = document.querySelector<HTMLIFrameElement>(
    '.hb-component[data-component-id="' + CSS.escape(openAutoDiagramDialog) + '"] .hb-floorplan-auto-diagram-preview',
  )
  return cancelRemovesComponentElement?.contentWindow
    ? (cancelRemovesComponentElement.contentWindow.postMessage(
        {
          type: 'homeos-floorplan-auto-diagram-floor',
          componentId: openAutoDiagramDialog,
          command: 'set-floor',
          value: dialogComponentId,
        },
        window.location.origin,
      ),
      true)
    : false
}

export function cancelRemovesComponent(_deps: LightingPanelDeps, bindFloorplanSection: any) {
  if (!bindFloorplanSection?.isConnected) return
  const onElement = bindFloorplanSection.closest('.hb-floorplan-auto-diagram')
  if (!onElement) return
  bindFloorplanSection.classList.remove('is-ready')
  let onWindowPageshowElement = onElement.querySelector('.hb-floorplan-auto-diagram-loading')
  onWindowPageshowElement ||
    ((onWindowPageshowElement = document.createElement('div')),
    (onWindowPageshowElement.className = 'hb-floorplan-auto-diagram-loading'),
    (onWindowPageshowElement.innerHTML = '<i aria-hidden="true"></i><strong>正在重新载入3D户型…</strong>'),
    onElement.append(onWindowPageshowElement))
  const pageshowEvent = new URL(bindFloorplanSection.src, window.location.origin)
  pageshowEvent.searchParams.set('auto-diagram-refresh', String(Date.now())),
    (bindFloorplanSection.src = pageshowEvent.toString())
}

export function lightingPayload(
  deps: LightingPanelDeps,
  readBaseLightingFromPanel = deps.editorCtx.baseLightingComponentId,
) {
  return readBaseLightingFromPanel
    ? document.querySelector<HTMLIFrameElement>(
        '.hb-component[data-component-id="' +
          CSS.escape(readBaseLightingFromPanel) +
          '"] .hb-floorplan-auto-diagram-preview',
      )
    : null
}

export function lightFieldElement(deps: LightingPanelDeps, closeLightingPanel: any, cancelLightingPreview: any = null) {
  const gm2 = deps.lightingPayload()
  return gm2?.contentWindow
    ? (gm2.contentWindow.postMessage(
        {
          type: 'homeos-floorplan-auto-diagram-base-lighting',
          componentId: deps.editorCtx.baseLightingComponentId,
          command: closeLightingPanel,
          ...(cancelLightingPreview
            ? {
                lighting: cancelLightingPreview,
              }
            : {}),
        },
        window.location.origin,
      ),
      true)
    : false
}

export function openLightingPanel(deps: LightingPanelDeps, lightingHostComponentId: any) {
  const lightingPreviewFrame = normalizeBaseLighting2(lightingHostComponentId)
  for (const interactionModeDraftDocumentElement of deps.floorplanBaseLightElements) {
    const interactionModeComponent = (lightingPreviewFrame as any)[
      interactionModeDraftDocumentElement.dataset.floorplanBaseLight!
    ]
    interactionModeDraftDocumentElement.value =
      interactionModeDraftDocumentElement.step === '5'
        ? String(Math.round(interactionModeComponent))
        : String(Number(interactionModeComponent.toFixed(2)))
  }
  return lightingPreviewFrame
}

export function lightInputNode(deps: LightingPanelDeps) {
  const onLightInputNodeState: Record<string, any> = {}
  for (const onLightInputNodeInput of deps.floorplanBaseLightElements)
    onLightInputNodeState[onLightInputNodeInput.dataset.floorplanBaseLight!] = Number(onLightInputNodeInput.value)
  return normalizeBaseLighting2(onLightInputNodeState)
}

export function onFloorplanAutoLightingResetButtonClick(
  deps: LightingPanelDeps,
  { cancelPreview: onFloorplanAutoLightingSaveButtonClick = true } = {},
) {
  deps.floorplanAutoLightingPanelElement.hidden ||
    (onFloorplanAutoLightingSaveButtonClick && deps.lightFieldElement('cancel'),
    (deps.floorplanAutoLightingPanelElement.hidden = true),
    deps.floorplanAutoLightingPanelElement.setAttribute('aria-busy', 'false'),
    (deps.editorCtx.baseLightingComponentId = ''),
    (deps.editorCtx.lightingPanelDragStateState = null))
}

export function onFloorplanAutoLightingCloseButtonClick(
  deps: LightingPanelDeps,
  onFloorplanAutoLightingHandlePointerdown: any,
) {
  const gm3 = deps.lightingPayload(onFloorplanAutoLightingHandlePointerdown)
  if (!onFloorplanAutoLightingHandlePointerdown || !gm3?.contentWindow) return
  ;(deps.editorCtx.baseLightingComponentId = onFloorplanAutoLightingHandlePointerdown),
    gm3.classList.remove('is-position-mode'),
    gm3.classList.add('is-view-mode'),
    deps.mutateDocument((lightingDragEvent: any) => {
      const lightingDragEventState = findComponent2(
        lightingDragEvent,
        onFloorplanAutoLightingHandlePointerdown,
      )?.component
      lightingDragEventState?.type === 'floorplan-auto-diagram' &&
        (lightingDragEventState.properties = {
          ...(lightingDragEventState.properties || {}),
          interactionMode: 'view',
        })
    }),
    deps.openLightingPanel(deps.editorCtx.baseLightingSettings),
    (deps.floorplanAutoLightingStatusElement.textContent = '正在读取当前光照设置…'),
    (deps.floorplanAutoLightingPanelElement.hidden = false),
    deps.floorplanAutoLightingPanelElement.setAttribute('aria-busy', 'true')
  const lightingPanelBounds = deps.floorplanAutoLightingPanelElement.getBoundingClientRect()
  ;(lightingPanelBounds.right > window.innerWidth - 8 ||
    lightingPanelBounds.bottom > window.innerHeight - 8 ||
    lightingPanelBounds.left < 8 ||
    lightingPanelBounds.top < 8) &&
    ((deps.floorplanAutoLightingPanelElement.style.right = 'auto'),
    (deps.floorplanAutoLightingPanelElement.style.left =
      clampNumber2(lightingPanelBounds.left, 8, Math.max(8, window.innerWidth - lightingPanelBounds.width - 8)) + 'px'),
    (deps.floorplanAutoLightingPanelElement.style.top =
      clampNumber2(lightingPanelBounds.top, 8, Math.max(8, window.innerHeight - lightingPanelBounds.height - 8)) +
      'px')),
    deps.lightFieldElement('request-state')
}

export function applyLightingPanelDragMove(deps: LightingPanelDeps) {
  if (!deps.editorCtx.lightingPanelDragPending) return
  ;(deps.floorplanAutoLightingPanelElement.style.right = 'auto'),
    (deps.floorplanAutoLightingPanelElement.style.left = deps.editorCtx.lightingPanelDragPending.x + 'px'),
    (deps.floorplanAutoLightingPanelElement.style.top = deps.editorCtx.lightingPanelDragPending.y + 'px')
}

/* 样式应用（样式差异收集/格式化、尺寸、资源上传） */

export interface StyleApplyDeps {
  editorCtx: EditorContext
  airConditionerBaselineByComponentId: any
  iconButtonBaselineByComponentId: any
  iconButtonEffectBaselineByComponentId: any
  navigationButtonSavedSettingsByComponentId: any
  onNavigationStyleApplyConfirmButtonClick: any
  panelFrameBaselineByComponentId: any
  runAltNew: any
  runAltPeer: any
  runAuxBackup: any
  runAuxInner: any
  runAuxOld: any
  runAuxPeer: any
  runVariantFallback: any
  styleTargetCheckbox: any
}

export function collectChangedTitleButtonStyleKeys(deps: StyleApplyDeps, component: any) {
  if (!component || component.type !== 'title-button') return []
  const navigationPreviewDatasetState =
    findComponent2(deps.editorCtx.baselineDocument, component.id)?.component || component
  return Object.keys(navigationPreviewClickComponentIdState).filter(
    (onNavigationStyleApplyCloseButtonClick) =>
      JSON.stringify(deps.runAltPeer(component, onNavigationStyleApplyCloseButtonClick)) !==
      JSON.stringify(deps.runAltPeer(navigationPreviewDatasetState, onNavigationStyleApplyCloseButtonClick)),
  )
}

export function onNavigationStyleApplyCancelButtonClick(
  deps: StyleApplyDeps,
  onNavigationStyleApplyDialogClick: any,
  styleDialogClickEvent: any,
  onNavigationStyleApplyDialogClose = deps.editorCtx.activeProject?.document,
) {
  if (typeof styleDialogClickEvent == 'boolean') return styleDialogClickEvent ? '显示' : '隐藏'
  if (onNavigationStyleApplyDialogClick === 'width' || onNavigationStyleApplyDialogClick === 'height') {
    const onNavigationStyleApplyDialogCloseState = Number(
      onNavigationStyleApplyDialogClose?.canvas?.[onNavigationStyleApplyDialogClick] ||
        (onNavigationStyleApplyDialogClick === 'width' ? 2778 : 1940),
    )
    return roundField2((Number(styleDialogClickEvent || 0) / onNavigationStyleApplyDialogCloseState) * 100) + '%'
  }
  return onNavigationStyleApplyDialogClick === 'scale'
    ? roundField2(Number(styleDialogClickEvent || 0) * 100) + '%'
    : onNavigationStyleApplyDialogClick === 'rotation'
      ? roundField2(Number(styleDialogClickEvent || 0)) + '°'
      : [
            'mainSize',
            'secondarySize',
            'mainSpacing',
            'secondarySpacing',
            'secondaryLineGap',
            'mainTextLeft',
            'mainTextTop',
            'secondaryTextLeft',
            'secondaryTextTop',
            'iconSize',
            'iconLeft',
            'iconTop',
            'frameSize',
            'frameSpacing',
            'frameOffsetX',
            'frameOffsetY',
            'markerSize',
            'markerLeft',
            'markerTop',
          ].includes(onNavigationStyleApplyDialogClick)
        ? roundField2(Number(styleDialogClickEvent || 0)) + '%'
        : String(styleDialogClickEvent ?? '')
}

export function onNavigationStyleApplyConfirmButtonClick(
  _deps: StyleApplyDeps,
  styleSourceComponentId: any,
  propertyKey: any,
) {
  if (styleSourceComponentId)
    return propertyKey === 'width' || propertyKey === 'height'
      ? Number(styleSourceComponentId.position?.[propertyKey] || 100)
      : propertyKey === 'scale'
        ? Number(styleSourceComponentId.style?.scale || 1)
        : propertyKey === 'rotation'
          ? Number(styleSourceComponentId.position?.rotation || 0)
          : (styleSourceComponentId.properties?.[propertyKey] ??
            (onNavigationStyleApplyConfirmButtonClickState as any)[propertyKey])
}

export function collectChangedAirConditionerStyleKeys(deps: StyleApplyDeps, component: any) {
  if (!component || component.type !== 'air-conditioner') return []
  let selectedStylePropertyKeys = deps.airConditionerBaselineByComponentId.get(component.id)
  return (
    selectedStylePropertyKeys ||
      ((selectedStylePropertyKeys = clone2(
        findComponent2(deps.editorCtx.baselineDocument, component.id)?.component || component,
      )),
      deps.airConditionerBaselineByComponentId.set(component.id, selectedStylePropertyKeys)),
    Object.keys(onNavigationStyleApplyConfirmButtonClickValue).filter(
      (onNavigationStyleApplyConfirmButtonClickConfig) =>
        JSON.stringify(
          deps.onNavigationStyleApplyConfirmButtonClick(component, onNavigationStyleApplyConfirmButtonClickConfig),
        ) !==
        JSON.stringify(
          deps.onNavigationStyleApplyConfirmButtonClick(
            selectedStylePropertyKeys,
            onNavigationStyleApplyConfirmButtonClickConfig,
          ),
        ),
    )
  )
}

export function formatAirConditionerStyleValue(
  deps: StyleApplyDeps,
  propertyKey: any,
  value: any,
  projectDocument = deps.editorCtx.activeProject?.document,
) {
  if (typeof value == 'boolean') return value ? '显示' : '隐藏'
  if (propertyKey === 'width' || propertyKey === 'height') {
    const selectedTargetComponentIdsState = Number(
      projectDocument?.canvas?.[propertyKey] || (propertyKey === 'width' ? 2778 : 1940),
    )
    return roundField2((Number(value || 0) / selectedTargetComponentIdsState) * 100) + '%'
  }
  return ['scale', 'airflowScale', 'badgeOpacity'].includes(propertyKey)
    ? roundField2(Number(value || 0) * 100) + '%'
    : ['rotation', 'airflowRotation', 'airflowAngle'].includes(propertyKey)
      ? roundField2(Number(value || 0)) + '°'
      : propertyKey === 'airflowMotion'
        ? value === 'static'
          ? '静态'
          : '动态'
        : typeof value == 'number'
          ? roundField2(value)
          : String(value ?? '')
}

export function resolveAirConditionerStyleValue(_deps: StyleApplyDeps, styleTypeLabel: any, propertyKey: any) {
  if (styleTypeLabel)
    return propertyKey === 'width' || propertyKey === 'height'
      ? Number(styleTypeLabel.position?.[propertyKey] || 100)
      : propertyKey === 'scale'
        ? Number(styleTypeLabel.style?.scale || 1)
        : propertyKey === 'rotation'
          ? Number(styleTypeLabel.position?.rotation || 0)
          : (styleTypeLabel.properties?.[propertyKey] ?? (onNavigationStyleApplyDialogCloseValue as any)[propertyKey])
}

export function collectChangedIconButtonEffectStyleKeys(deps: StyleApplyDeps, component: any) {
  if (!component || component.type !== 'icon-button-effect') return []
  let navigationPreviousVisibilityValue = deps.iconButtonEffectBaselineByComponentId.get(component.id)
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
  )
}

export function formatIconButtonEffectStyleValue(
  deps: StyleApplyDeps,
  propertyKey: any,
  value: any,
  projectDocument = deps.editorCtx.activeProject?.document,
) {
  if (typeof value == 'boolean') return value ? '显示' : '隐藏'
  if (propertyKey === 'width' || propertyKey === 'height') {
    const navigationPreviewButtonElementState = Number(
      projectDocument?.canvas?.[propertyKey] || (propertyKey === 'width' ? 2778 : 1940),
    )
    return roundField2((Number(value || 0) / navigationPreviewButtonElementState) * 100) + '%'
  }
  return [
    'buttonOpacity',
    'frameOpacity',
    'glowOffStrength',
    'glowOnStrength',
    'effectOpacity',
    'effectScale',
    'scale',
  ].includes(propertyKey)
    ? roundField2(Number(value || 0) * 100) + '%'
    : ['iconSize', 'radius', 'effectLeft', 'effectTop'].includes(propertyKey)
      ? roundField2(Number(value || 0)) + '%'
      : ['effectRotation', 'rotation'].includes(propertyKey)
        ? roundField2(Number(value || 0)) + '°'
        : ['effectFadeDuration', 'onFillFadeDuration'].includes(propertyKey)
          ? roundField2(Number(value || 0)) + ' 秒'
          : propertyKey === 'effectLayoutMode'
            ? value === 'fill'
              ? '铺满'
              : '自由'
            : String(value || '不使用')
}

export function normalizeSensorKind(_deps: StyleApplyDeps, component: any) {
  const styleComponentType = component?.properties?.sensorKind
  return ['presence', 'door-window', 'water-leak', 'smoke', 'natural-gas'].includes(styleComponentType)
    ? styleComponentType
    : 'presence'
}

export function formatSensorKindLabel(deps: StyleApplyDeps, sensorKind: any) {
  return (
    {
      presence: '人体/人在传感器',
      'door-window': '门窗传感器',
      'water-leak': '水浸传感器',
      smoke: '烟雾传感器',
      'natural-gas': '天然气传感器',
    } as any
  )[deps.runAuxBackup(sensorKind)]
}

export function resolvePresenceSensorStyleKeys(deps: StyleApplyDeps, stylePropertyCheckbox: any) {
  const selectedTargetComponentIds = ['width', 'height', 'scale', 'rotation'],
    rr3 = deps.runAuxBackup(stylePropertyCheckbox)
  return rr3 === 'presence'
    ? [
        'iconColor',
        'iconOnColor',
        'haloVisible',
        'haloScaleX',
        'haloScaleY',
        'haloRotation',
        'haloOpacity',
        'personVisible',
        'personScale',
        'personRotation',
        'personOpacity',
        'orbitDuration',
        ...selectedTargetComponentIds,
      ]
    : rr3 === 'door-window'
      ? ['iconOnColor', 'perspectiveCorners', ...selectedTargetComponentIds]
      : rr3 === 'water-leak'
        ? ['waterLeakColor', ...selectedTargetComponentIds]
        : rr3 === 'smoke'
          ? ['smokeColor', ...selectedTargetComponentIds]
          : ['naturalGasColor', ...selectedTargetComponentIds]
}

export function styleTargetCheckbox(_deps: StyleApplyDeps, styleApplyDraftDocument: any, styleTargetComponentId: any) {
  if (!styleApplyDraftDocument) return
  if (styleTargetComponentId === 'width' || styleTargetComponentId === 'height')
    return Number(styleApplyDraftDocument.position?.[styleTargetComponentId] || 100)
  if (styleTargetComponentId === 'scale') return Number(styleApplyDraftDocument.style?.scale || 1)
  if (styleTargetComponentId === 'rotation') return Number(styleApplyDraftDocument.position?.rotation || 0)
  const styleTargetComponentDraft = styleApplyDraftDocument.properties || {}
  return styleTargetComponentId === 'iconColor'
    ? (styleTargetComponentDraft.iconColor ??
        styleTargetComponentDraft.clearColor ??
        styleTargetComponentDraft.iconOffColor ??
        styleTargetComponentDraft.iconOnColor ??
        styleComponentTypeState.iconColor)
    : styleTargetComponentId === 'iconOnColor'
      ? (styleTargetComponentDraft.iconOnColor ??
        styleTargetComponentDraft.occupiedColor ??
        styleComponentTypeState.iconOnColor)
      : styleTargetComponentId === 'mainColor'
        ? (styleTargetComponentDraft.mainColor ??
          styleTargetComponentDraft.mainOffColor ??
          styleTargetComponentDraft.mainOnColor ??
          styleComponentTypeState.mainColor)
        : styleTargetComponentId === 'secondaryColor'
          ? (styleTargetComponentDraft.secondaryColor ??
            styleTargetComponentDraft.secondaryOffColor ??
            styleTargetComponentDraft.secondaryOnColor ??
            styleComponentTypeState.secondaryColor)
          : (styleTargetComponentDraft[styleTargetComponentId] ??
            (styleComponentTypeState as any)[styleTargetComponentId])
}

export function appliedStylePropertyKey(deps: StyleApplyDeps, styleApplyButton: any) {
  if (!styleApplyButton || !['icon-button', 'device-button', 'presence-sensor'].includes(styleApplyButton.type))
    return []
  let styleFeedbackTimeoutId = deps.iconButtonBaselineByComponentId.get(styleApplyButton.id)
  return (
    styleFeedbackTimeoutId ||
      ((styleFeedbackTimeoutId = clone2(
        findComponent2(deps.editorCtx.baselineDocument, styleApplyButton.id)?.component || styleApplyButton,
      )),
      deps.iconButtonBaselineByComponentId.set(styleApplyButton.id, styleFeedbackTimeoutId)),
    (styleApplyButton.type === 'presence-sensor'
      ? deps.runAuxPeer(styleApplyButton)
      : styleApplyButton.type === 'device-button'
        ? [
            'iconColor',
            'iconOnColor',
            'badgeColor',
            'badgeOpacity',
            'symbolSize',
            'badgeSize',
            'iconLeft',
            'iconTop',
            'mainColor',
            'mainSize',
            'mainWeight',
            'mainSpacing',
            'mainTextLeft',
            'mainTextTop',
            'secondaryColor',
            'secondarySize',
            'secondaryWeight',
            'secondarySpacing',
            'secondaryTextLeft',
            'secondaryTextTop',
            'width',
            'height',
            'scale',
            'rotation',
          ]
        : Object.keys(styleComponentTypeValue)
    ).filter(
      (onNavigationIconButtonClick: any) =>
        JSON.stringify(deps.styleTargetCheckbox(styleApplyButton, onNavigationIconButtonClick)) !==
        JSON.stringify(deps.styleTargetCheckbox(styleFeedbackTimeoutId, onNavigationIconButtonClick)),
    )
  )
}

export function onNavigationIconCopyButtonClick(_deps: StyleApplyDeps, navigationSelectedIconName: any, styleKey: any) {
  return navigationSelectedIconName?.type === 'presence-sensor'
    ? (styleComponentTypeConfig as any)[styleKey]
    : navigationSelectedIconName?.type !== 'device-button'
      ? (styleComponentTypeValue as any)[styleKey]
      : styleKey.startsWith('main')
        ? {
            group: '标题',
            label:
              styleKey === 'mainOnOpacity'
                ? '透明度'
                : (styleComponentTypeValue as any)[styleKey]?.label?.replace('中文', ''),
          }
        : styleKey.startsWith('secondary')
          ? {
              group: '状态',
              label:
                styleKey === 'secondaryOnOpacity'
                  ? '透明度'
                  : (styleComponentTypeValue as any)[styleKey]?.label?.replace('英文', ''),
            }
          : (styleComponentTypeValue as any)[styleKey]
}

export function navigationIconCopyError(
  deps: StyleApplyDeps,
  onNavigationIconSearchInputInput: any,
  onNavigationIconOptionsClick: any,
  navigationIconOptionClickEvent = deps.editorCtx.activeProject?.document,
) {
  if (typeof onNavigationIconOptionsClick == 'boolean') return onNavigationIconOptionsClick ? '显示' : '隐藏'
  if (onNavigationIconSearchInputInput === 'width' || onNavigationIconSearchInputInput === 'height') {
    const navigationIconOptionElement = Number(
      navigationIconOptionClickEvent?.canvas?.[onNavigationIconSearchInputInput] ||
        (onNavigationIconSearchInputInput === 'width' ? 2778 : 1940),
    )
    return roundField2((Number(onNavigationIconOptionsClick || 0) / navigationIconOptionElement) * 100) + '%'
  }
  return onNavigationIconSearchInputInput === 'scale'
    ? roundField2(Number(onNavigationIconOptionsClick || 0) * 100) + '%'
    : onNavigationIconSearchInputInput === 'perspectiveCorners'
      ? JSON.stringify(onNavigationIconOptionsClick) === JSON.stringify(DEFAULT_PERSPECTIVE_CORNERS)
        ? '默认透视'
        : '自定义透视'
      : onNavigationIconSearchInputInput === 'orbitDuration'
        ? roundField2(Number(onNavigationIconOptionsClick || 0)) + ' 秒'
        : onNavigationIconSearchInputInput === 'onFillFadeDuration'
          ? roundField2(Number(onNavigationIconOptionsClick || 0)) + ' 秒'
          : ['rotation', 'frameAngle', 'softLightAngle', 'glowAngle', 'haloRotation', 'personRotation'].includes(
                onNavigationIconSearchInputInput,
              )
            ? roundField2(Number(onNavigationIconOptionsClick || 0)) + '°'
            : [
                  'iconOffOpacity',
                  'iconOnOpacity',
                  'mainOffOpacity',
                  'mainOnOpacity',
                  'secondaryOffOpacity',
                  'secondaryOnOpacity',
                  'badgeOpacity',
                  'onFillStrength',
                  'frameOffOpacity',
                  'frameOnOpacity',
                  'softLightStrength',
                  'softLightSize',
                  'glowStrength',
                  'glowSize',
                  'haloScaleX',
                  'haloScaleY',
                  'haloOpacity',
                  'personScale',
                  'personOpacity',
                ].includes(onNavigationIconSearchInputInput)
              ? roundField2(Number(onNavigationIconOptionsClick || 0) * 100) + '%'
              : [
                    'iconSize',
                    'symbolSize',
                    'badgeSize',
                    'iconLeft',
                    'iconTop',
                    'mainTextLeft',
                    'mainTextTop',
                    'secondaryTextLeft',
                    'secondaryTextTop',
                    'cutCorner',
                  ].includes(onNavigationIconSearchInputInput)
                ? roundField2(Number(onNavigationIconOptionsClick || 0)) + '%'
                : String(onNavigationIconOptionsClick ?? '')
}

export function resolveCameraStyleValue(_deps: StyleApplyDeps, component: any, propertyKey: any) {
  if (!component) return
  if (propertyKey === 'width' || propertyKey === 'height') return Number(component.position?.[propertyKey] || 100)
  if (propertyKey === 'scale') return Number(component.style?.scale || 1)
  if (propertyKey === 'rotation') return Number(component.position?.rotation || 0)
  const navigationIconComponentId = component.properties || {}
  if (propertyKey === 'displayMode') return navigationIconComponentId.displayMode === 'snapshot' ? 'snapshot' : 'live'
  if (propertyKey === 'refreshInterval') {
    const navigationIconComponentIdState = Number(navigationIconComponentId.refreshInterval)
    return Number.isFinite(navigationIconComponentIdState)
      ? Math.max(6, Math.round(navigationIconComponentIdState))
      : 10
  }
  if (propertyKey === 'fit') return navigationIconComponentId.fit === 'contain' ? 'contain' : 'fill'
  if (propertyKey === 'radius') {
    const styleFeedbackTimeoutIdState = Number(navigationIconComponentId.radius ?? navigationIconOptionState.radius)
    return Math.max(
      0,
      Math.min(
        0.5,
        styleFeedbackTimeoutIdState > 0.5 ? styleFeedbackTimeoutIdState / 100 : styleFeedbackTimeoutIdState,
      ),
    )
  }
  return navigationIconComponentId[propertyKey] ?? (navigationIconOptionState as any)[propertyKey]
}

export function collectChangedCameraStyleKeys(deps: StyleApplyDeps, component: any) {
  if (!component || component.type !== 'camera') return []
  const navigationIconDatasetName =
    findComponent2(deps.editorCtx.baselineDocument, component.id)?.component || component
  return Object.keys(navigationIconOptionLabels).filter(
    (navigationIconDatasetNameState) =>
      JSON.stringify(deps.runAuxInner(component, navigationIconDatasetNameState)) !==
      JSON.stringify(deps.runAuxInner(navigationIconDatasetName, navigationIconDatasetNameState)),
  )
}

export function formatCameraStyleValue(
  deps: StyleApplyDeps,
  propertyKey: any,
  value: any,
  projectDocument = deps.editorCtx.activeProject?.document,
) {
  if (typeof value == 'boolean') return value ? '显示' : '隐藏'
  if (propertyKey === 'displayMode') return value === 'snapshot' ? '快照' : '实时'
  if (propertyKey === 'refreshInterval') return roundField2(Number(value || 10)) + ' 秒'
  if (propertyKey === 'fit') return value === 'contain' ? '原始比例' : '压缩 16:9'
  if (propertyKey === 'width' || propertyKey === 'height') {
    const navigationIconDraftDocumentState = Number(
      projectDocument?.canvas?.[propertyKey] || (propertyKey === 'width' ? 2778 : 1940),
    )
    return roundField2((Number(value || 0) / navigationIconDraftDocumentState) * 100) + '%'
  }
  return propertyKey === 'scale' || propertyKey === 'radius' || propertyKey === 'frameOpacity'
    ? roundField2(Number(value || 0) * 100) + '%'
    : propertyKey === 'rotation' || propertyKey === 'frameAngle'
      ? roundField2(Number(value || 0)) + '°'
      : String(value ?? '')
}

export function resolvePanelFrameStyleValue(_deps: StyleApplyDeps, component: any, navigationIconDraftDocument: any) {
  if (!component) return
  if (navigationIconDraftDocument === 'width' || navigationIconDraftDocument === 'height')
    return Number(component.position?.[navigationIconDraftDocument] || 100)
  if (navigationIconDraftDocument === 'scale') return Number(component.style?.scale || 1)
  if (navigationIconDraftDocument === 'rotation') return Number(component.position?.rotation || 0)
  const navigationIconComponent = component.properties || {}
  if (navigationIconDraftDocument === 'mainTextLeft' || navigationIconDraftDocument === 'secondaryTextLeft')
    return (
      navigationIconComponent[navigationIconDraftDocument] ??
      navigationIconComponent.textLeft ??
      (navigationIconDraftDocumentValue as any)[navigationIconDraftDocument]
    )
  if (navigationIconDraftDocument === 'mainTextTop') {
    const navigationIconPreviousValue = Math.max(1, Number(component.position?.height || 100))
    return (
      navigationIconComponent.mainTextTop ??
      Number(navigationIconComponent.textTop ?? 28) -
        (Number(navigationIconComponent.lineGap ?? 24) / navigationIconPreviousValue) * 100
    )
  }
  return navigationIconDraftDocument === 'secondaryTextTop'
    ? (navigationIconComponent.secondaryTextTop ??
        navigationIconComponent.textTop ??
        navigationIconDraftDocumentValue.secondaryTextTop)
    : (navigationIconComponent[navigationIconDraftDocument] ??
        (navigationIconDraftDocumentValue as any)[navigationIconDraftDocument])
}

export function collectChangedPanelFrameStyleKeys(deps: StyleApplyDeps, component: any) {
  if (!component || component.type !== 'panel-frame') return []
  let navigationIconVisiblePreviousValue = deps.panelFrameBaselineByComponentId.get(component.id)
  return (
    navigationIconVisiblePreviousValue ||
      ((navigationIconVisiblePreviousValue = clone2(
        findComponent2(deps.editorCtx.baselineDocument, component.id)?.component || component,
      )),
      deps.panelFrameBaselineByComponentId.set(component.id, navigationIconVisiblePreviousValue)),
    Object.keys(navigationIconDraftDocumentConfig).filter((filteredItemsEntry) =>
      !navigationIconVisiblePreviousValue || navigationIconVisiblePreviousValue.type !== 'panel-frame'
        ? true
        : JSON.stringify(deps.runAuxOld(component, filteredItemsEntry)) !==
          JSON.stringify(deps.runAuxOld(navigationIconVisiblePreviousValue, filteredItemsEntry)),
    )
  )
}

export function formatPanelFrameStyleValue(
  deps: StyleApplyDeps,
  propertyKey: any,
  value: any,
  bindAssetSection = deps.editorCtx.activeProject?.document,
) {
  if (typeof value == 'boolean') return value ? '显示' : '隐藏'
  if (propertyKey === 'width' || propertyKey === 'height') {
    const selectedTargetComponentIdsValue = Number(
      bindAssetSection?.canvas?.[propertyKey] || (propertyKey === 'width' ? 2778 : 1940),
    )
    return roundField2((Number(value || 0) / selectedTargetComponentIdsValue) * 100) + '%'
  }
  return propertyKey === 'scale'
    ? roundField2(Number(value || 0) * 100) + '%'
    : propertyKey === 'rotation' || propertyKey === 'edgeAngle' || propertyKey === 'glowAngle'
      ? roundField2(Number(value || 0)) + '°'
      : ['mainOpacity', 'secondaryOpacity', 'edgeOpacity', 'radius', 'glowStrength', 'glowSize'].includes(propertyKey)
        ? roundField2(Number(value || 0) * 100) + '%'
        : ['mainTextLeft', 'mainTextTop', 'secondaryTextLeft', 'secondaryTextTop'].includes(propertyKey)
          ? roundField2(Number(value || 0)) + '%'
          : String(value ?? '')
}

export function entryStateRecord(_deps: StyleApplyDeps, entryStateName: any, propertyKey: any) {
  if (!entryStateName) return
  if (propertyKey === 'width' || propertyKey === 'height') return Number(entryStateName.position?.[propertyKey] || 100)
  if (propertyKey === 'scale') return Number(entryStateName.style?.scale || 1)
  if (propertyKey === 'rotation') return Number(entryStateName.position?.rotation || 0)
  const availablePropertiesKey = entryStateName.properties || {},
    styleTypeLabelState = (entryStateRef as any)[propertyKey]
  return propertyKey === 'textIdleOpacity'
    ? (availablePropertiesKey[propertyKey] ?? availablePropertiesKey.idleOpacity ?? styleTypeLabelState)
    : propertyKey === 'textActiveOpacity'
      ? (availablePropertiesKey[propertyKey] ?? availablePropertiesKey.activeOpacity ?? styleTypeLabelState)
      : propertyKey === 'iconIdleOpacity'
        ? (availablePropertiesKey[propertyKey] ?? availablePropertiesKey.idleOpacity ?? styleTypeLabelState)
        : propertyKey === 'iconActiveOpacity'
          ? (availablePropertiesKey[propertyKey] ?? availablePropertiesKey.activeOpacity ?? styleTypeLabelState)
          : propertyKey === 'mainTextLeft' || propertyKey === 'secondaryTextLeft'
            ? (availablePropertiesKey[propertyKey] ?? availablePropertiesKey.textLeft ?? styleTypeLabelState)
            : propertyKey === 'mainTextTop'
              ? (availablePropertiesKey[propertyKey] ?? Number(availablePropertiesKey.textTop ?? 81.5) - 1800 / 64.36)
              : propertyKey === 'secondaryTextTop'
                ? (availablePropertiesKey[propertyKey] ?? availablePropertiesKey.textTop ?? styleTypeLabelState)
                : (availablePropertiesKey[propertyKey] ?? styleTypeLabelState)
}

export function areStyleValuesEqual(_deps: StyleApplyDeps, leftValue: any, rightValue: any) {
  return JSON.stringify(leftValue) === JSON.stringify(rightValue)
}

export function onImageAssetUploadButtonClick(
  deps: StyleApplyDeps,
  onIconButtonEffectAssetUploadButtonClick: any,
  onImageAssetUploadInputChange: any,
  onIconButtonEffectAssetUploadInputChange: any,
  assetOptionsElement: any,
) {
  if (!onIconButtonEffectAssetUploadButtonClick || !(entryStateEntry as any)[onImageAssetUploadInputChange]) return
  let navigationIconVisiblePreviousValueState = deps.navigationButtonSavedSettingsByComponentId.get(
    onIconButtonEffectAssetUploadButtonClick,
  )
  ;(!navigationIconVisiblePreviousValueState &&
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
      ))
}

export function onAssetOptionsClick(deps: StyleApplyDeps, assetOptionsClickEvent: any) {
  const deleteUserAssetElement = deps.navigationButtonSavedSettingsByComponentId.get(assetOptionsClickEvent?.id)
  if (deleteUserAssetElement) {
    for (const deleteUserAssetElementState of deleteUserAssetElement.keys())
      (entryStateEntry as any)[deleteUserAssetElementState] ||
        deleteUserAssetElement.delete(deleteUserAssetElementState)
    deleteUserAssetElement.size || deps.navigationButtonSavedSettingsByComponentId.delete(assetOptionsClickEvent.id)
  }
}

/** 样式应用会话需要清理的 5 张 baseline 缓存（0.8.1 同款集合）。 */
interface StyleApplyBaselineMaps {
  airConditionerBaselineByComponentId: Map<unknown, unknown>
  iconButtonBaselineByComponentId: Map<unknown, unknown>
  iconButtonEffectBaselineByComponentId: Map<unknown, unknown>
  navigationButtonSavedSettingsByComponentId: Map<unknown, unknown>
  panelFrameBaselineByComponentId: Map<unknown, unknown>
}

interface StyleApplyBaselineDeps extends StyleApplyBaselineMaps {
  editorCtx: EditorContext
}

/**
 * 结束一次样式应用会话：清空 baseline 缓存、关掉脉冲并关闭对话框。
 *
 * baseline 缓存按 componentId 存「上次看到的样式」；切项目/切页面后同一个 id 可能
 * 指向别的控件，不清就会把差异算错（表现为「什么都没改也显示已修改」）。
 */
export function resetStyleApplyBaselines(deps: StyleApplyBaselineDeps, dialogElement?: HTMLDialogElement | null) {
  for (const baselineMap of [
    deps.airConditionerBaselineByComponentId,
    deps.iconButtonBaselineByComponentId,
    deps.iconButtonEffectBaselineByComponentId,
    deps.navigationButtonSavedSettingsByComponentId,
    deps.panelFrameBaselineByComponentId,
  ])
    baselineMap?.clear?.()
  deps.editorCtx.appliedStyleRecord = null
  const pulseTimeouts = deps.editorCtx.styleApplyPulseByButton
  if (pulseTimeouts) {
    for (const pulseTimeout of pulseTimeouts.values()) window.clearTimeout(pulseTimeout)
    pulseTimeouts.clear()
  }
  dialogElement?.open && dialogElement.close()
}

/* 样式对话框（样式应用弹窗、资源删除、复制备份） */

export interface StyleDialogsDeps {
  editorCtx: EditorContext
  appliedStylePropertyKey: any
  applyInspectorDimensionChange: any
  entryStateRecord: any
  findReplaceableComponents: any
  handleOperationError: any
  hideAssetLargePreview: any
  imageAssetLargePreviewImageElement: any
  navigationButtonSavedSettingsByComponentId: any
  navigationIconCopyError: any
  navigationLabelTextInputElement: any
  navigationStyleApplyDialogElement: any
  navigationStyleApplyMessageElement: any
  navigationStyleApplyPropertiesElement: any
  navigationStyleApplySummaryElement: any
  navigationStyleApplyTargetDeps: any
  navigationStyleApplyTargetHeadingElement: any
  navigationStyleApplyTargetScopeElement: any
  navigationStyleApplyTitleElement: any
  onAssetOptionsClick: any
  onDeleteAssetCancelButtonClick: any
  onImageAssetFolderSelectChange: any
  onNavigationIconCopyButtonClick: any
  onNavigationStyleApplyCancelButtonClick: any
  onNavigationStyleApplyConfirmButtonClick: any
  removedComponent: any
  runAltBackup: any
  runAltCopy: any
  runAltFirst: any
  runAltLeft: any
  runAltNew: any
  runAltOuter: any
  runAltPeer: any
  runAltTwin: any
  runAuxAlt: any
  runAuxInner: any
  runAuxLower: any
  runAuxOld: any
  runAuxRight: any
  runAuxTwin: any
  runAuxVariant: any
  runCopyBackupDeps: any
  runCopyFallback: any
  runExtraLocal: any
  runShadow: any
  runVariantAux: any
  runVariantExtra: any
  runVariantFallback: any
  runVariantLower: any
  runVariantTwin: any
  styleTargetCheckbox: any
}

export function collectPendingNavigationStyleKeys(deps: StyleDialogsDeps, component: any) {
  return (
    deps.onAssetOptionsClick(component),
    [...(deps.navigationButtonSavedSettingsByComponentId.get(component?.id)?.entries() || [])]
      .filter(
        ([filteredItemsRecord, filteredItemsName]) =>
          !deps.runVariantFallback(deps.entryStateRecord(component, filteredItemsRecord), filteredItemsName),
      )
      .map(([onDeleteAssetCloseButtonClick]) => onDeleteAssetCloseButtonClick)
  )
}

export function onDeleteAssetCancelButtonClick(
  deps: StyleDialogsDeps,
  onDeleteAssetDialogClick: any,
  deleteAssetDialogClickEvent: any,
  onDeleteAssetConfirmButtonClick = deps.editorCtx.activeProject?.document,
) {
  if (typeof deleteAssetDialogClickEvent == 'boolean') return deleteAssetDialogClickEvent ? '显示' : '隐藏'
  if (onDeleteAssetDialogClick === 'width' || onDeleteAssetDialogClick === 'height') {
    const deleteAssetRequestId = Number(
      onDeleteAssetConfirmButtonClick?.canvas?.[onDeleteAssetDialogClick] ||
        (onDeleteAssetDialogClick === 'width' ? 2778 : 1940),
    )
    return roundField2((Number(deleteAssetDialogClickEvent || 0) / deleteAssetRequestId) * 100) + '%'
  }
  return onDeleteAssetDialogClick === 'scale'
    ? roundField2(Number(deleteAssetDialogClickEvent || 0) * 100) + '%'
    : onDeleteAssetDialogClick === 'rotation'
      ? roundField2(Number(deleteAssetDialogClickEvent || 0)) + '°'
      : [
            'textIdleOpacity',
            'textActiveOpacity',
            'iconIdleOpacity',
            'iconActiveOpacity',
            'frameIdleOpacity',
            'frameActiveOpacity',
            'radius',
            'glowIdleStrength',
            'glowIdleSize',
            'glowActiveStrength',
            'glowActiveSize',
          ].includes(onDeleteAssetDialogClick)
        ? roundField2(Number(deleteAssetDialogClickEvent || 0) * 100) + '%'
        : ['mainTextLeft', 'mainTextTop', 'secondaryTextLeft', 'secondaryTextTop', 'iconLeft', 'iconTop'].includes(
              onDeleteAssetDialogClick,
            )
          ? roundField2(Number(deleteAssetDialogClickEvent || 0)) + '%'
          : onDeleteAssetDialogClick === 'frameAngle' || onDeleteAssetDialogClick === 'glowAngle'
            ? roundField2(Number(deleteAssetDialogClickEvent || 0)) + '°'
            : String(deleteAssetDialogClickEvent ?? '')
}

export function applyNavigationStyleToTargets(deps: StyleDialogsDeps, targets: any, formatDetail: any) {
  return runVariantLowerCore(deps.navigationStyleApplyTargetDeps(), targets, formatDetail)
}

export function openNavigationStyleApplyDialog(deps: StyleDialogsDeps) {
  const createdInstanceName = deps.removedComponent()
  if (!deps.navigationLabelTextInputElement(createdInstanceName)) return
  const mC2 = deps.runVariantTwin(createdInstanceName),
    styleFeedbackTimeoutIdValue = deps.findReplaceableComponents(createdInstanceName)
  !mC2.length ||
    !styleFeedbackTimeoutIdValue.length ||
    ((deps.navigationStyleApplyTitleElement.textContent =
      createdInstanceName.type === 'scene-mode' ? '应用情景模式设置' : '应用导航按钮设置'),
    (deps.navigationStyleApplyTargetHeadingElement.textContent =
      createdInstanceName.type === 'scene-mode' ? '应用到情景模式' : '应用到导航按钮'),
    (deps.navigationStyleApplyTargetScopeElement.textContent = '按区域与页面区分'),
    (deps.navigationStyleApplySummaryElement.textContent =
      '将“' +
      componentLabel2(createdInstanceName) +
      '”中选定的修改应用到选中的' +
      (createdInstanceName.type === 'scene-mode' ? '情景模式' : '导航按钮') +
      '。图标名称、文字内容、目标页面、备注和位置不会改变。'),
    deps.navigationStyleApplyPropertiesElement.replaceChildren(
      ...mC2.map((deleteAssetFolderError: any) => {
        const isNavigationIconMenuHidden = (entryStateEntry as any)[deleteAssetFolderError],
          $e8 = deps.entryStateRecord(createdInstanceName, deleteAssetFolderError)
        return createNavigationStyleApplyOption({
          value: deleteAssetFolderError,
          label: isNavigationIconMenuHidden.label,
          detail:
            isNavigationIconMenuHidden.group + ' · ' + deps.onDeleteAssetCancelButtonClick(deleteAssetFolderError, $e8),
        })
      }),
    ),
    deps.runVariantLower(styleFeedbackTimeoutIdValue, (onImageAssetButtonClick: any) => {
      const isImageAssetMenuHidden =
          onImageAssetButtonClick.properties?.targetPage || onImageAssetButtonClick.actions?.tap?.target || '',
        imageAssetCatalogErrorState = deps.editorCtx.activeProject.document.pages.find(
          (imageAssetCatalogError: any) => imageAssetCatalogError.path === isImageAssetMenuHidden,
        )
      return createdInstanceName.type === 'scene-mode'
        ? onImageAssetButtonClick.bindings?.entity?.entityId || '未绑定实体'
        : imageAssetCatalogErrorState
          ? '跳转到：' + imageAssetCatalogErrorState.name
          : '未设置目标页面'
    }),
    (deps.navigationStyleApplyMessageElement.hidden = true),
    (deps.navigationStyleApplyMessageElement.textContent = ''),
    (deps.editorCtx.appliedStyleRecord = {
      sourceId: createdInstanceName.id,
      type: createdInstanceName.type,
    }),
    deps.navigationStyleApplyDialogElement.showModal())
}

export function onImageAssetFolderSelectChange(
  _deps: StyleDialogsDeps,
  onImageAssetSearchInputInput: any,
  onImageAssetOptionsPointerover: any,
) {
  return typeof onImageAssetOptionsPointerover == 'boolean'
    ? onImageAssetSearchInputInput === 'animated'
      ? onImageAssetOptionsPointerover
        ? '开启'
        : '关闭'
      : onImageAssetOptionsPointerover
        ? '显示'
        : '隐藏'
    : onImageAssetSearchInputInput === 'effect'
      ? onImageAssetOptionsPointerover === 'energy'
        ? '能量'
        : '水流'
      : onImageAssetSearchInputInput === 'shape'
        ? (
            {
              straight: '折线',
              rounded: '圆角',
              curve: '曲线',
            } as any
          )[onImageAssetOptionsPointerover]
        : onImageAssetSearchInputInput === 'direction'
          ? onImageAssetOptionsPointerover === -1
            ? '反向'
            : '正向'
          : onImageAssetSearchInputInput === 'opacity' || onImageAssetSearchInputInput === 'baseOpacity'
            ? roundField2(onImageAssetOptionsPointerover * 100) + '%'
            : onImageAssetSearchInputInput === 'glow'
              ? onImageAssetOptionsPointerover + '%'
              : String(onImageAssetOptionsPointerover)
}

export function imageAssetPointerOverEvent(deps: StyleDialogsDeps) {
  const imageAssetHoverElement = deps.removedComponent()
  if (imageAssetHoverElement?.type !== 'flow-line') return
  const im2 = deps.runExtraLocal(imageAssetHoverElement),
    pe2 = deps.findReplaceableComponents(imageAssetHoverElement)
  if (!im2.length || !pe2.length) return
  const hoveredAsset = normalizeFlowLine2(imageAssetHoverElement.properties)
  ;(deps.navigationStyleApplyTitleElement.textContent = '应用流水线条设置'),
    (deps.navigationStyleApplyTargetHeadingElement.textContent = '应用到流水线条'),
    (deps.navigationStyleApplyTargetScopeElement.textContent = '按区域与页面区分'),
    (deps.navigationStyleApplySummaryElement.textContent =
      '将“' +
      componentLabel2(imageAssetHoverElement) +
      '”的选定外观修改应用到同类控件。每条线的路径、名称和位置保持各自设置。'),
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
    deps.runVariantLower(pe2, '流水线条'),
    (deps.navigationStyleApplyMessageElement.hidden = true),
    (deps.editorCtx.appliedStyleRecord = {
      sourceId: imageAssetHoverElement.id,
      type: 'flow-line',
    }),
    deps.navigationStyleApplyDialogElement.showModal()
}

export function imageAssetClickEvent(deps: StyleDialogsDeps) {
  const imageAssetElement = deps.removedComponent()
  if (!imageAssetElement || imageAssetElement.type !== 'panel-frame') return
  const pC2 = deps.runVariantExtra(imageAssetElement),
    pe3 = deps.findReplaceableComponents(imageAssetElement)
  !pC2.length ||
    !pe3.length ||
    ((deps.navigationStyleApplyTitleElement.textContent = '应用底图框设置'),
    (deps.navigationStyleApplyTargetHeadingElement.textContent = '应用到底图框'),
    (deps.navigationStyleApplyTargetScopeElement.textContent = '按区域与页面区分'),
    (deps.navigationStyleApplySummaryElement.textContent =
      '将“' + componentLabel2(imageAssetElement) + '”中选定的修改应用到选中的底图框。文字内容、备注和位置不会改变。'),
    deps.navigationStyleApplyPropertiesElement.replaceChildren(
      ...pC2.map((mappedItemsOrigin: any) => {
        const imageAssetComponentId = (navigationIconDraftDocumentConfig as any)[mappedItemsOrigin],
          kl2 = deps.runAuxOld(imageAssetElement, mappedItemsOrigin)
        return createNavigationStyleApplyOption({
          value: mappedItemsOrigin,
          label: imageAssetComponentId.label,
          detail: imageAssetComponentId.group + ' · ' + deps.runVariantAux(mappedItemsOrigin, kl2),
        })
      }),
    ),
    deps.runVariantLower(pe3, '底图框'),
    (deps.navigationStyleApplyMessageElement.hidden = true),
    (deps.navigationStyleApplyMessageElement.textContent = ''),
    (deps.editorCtx.appliedStyleRecord = {
      sourceId: imageAssetElement.id,
      type: 'panel-frame',
    }),
    deps.navigationStyleApplyDialogElement.showModal())
}

export function openCameraStyleApplyDialog(deps: StyleDialogsDeps) {
  const createdInstanceKey = deps.removedComponent()
  if (!createdInstanceKey || createdInstanceKey.type !== 'camera') return
  const tC2 = deps.runAuxLower(createdInstanceKey),
    pe4 = deps.findReplaceableComponents(createdInstanceKey)
  !tC2.length ||
    !pe4.length ||
    ((deps.navigationStyleApplyTitleElement.textContent = '应用摄像头实时预览设置'),
    (deps.navigationStyleApplyTargetHeadingElement.textContent = '应用到摄像头实时预览'),
    (deps.navigationStyleApplyTargetScopeElement.textContent = '按区域与页面区分'),
    (deps.navigationStyleApplySummaryElement.textContent =
      '将“' +
      componentLabel2(createdInstanceKey) +
      '”中选定的修改应用到选中的摄像头实时预览。实体、备注、动作和控件位置不会改变。'),
    deps.navigationStyleApplyPropertiesElement.replaceChildren(
      ...tC2.map((mappedItemsDraft: any) => {
        const imageAssetId = (navigationIconOptionLabels as any)[mappedItemsDraft],
          pl2 = deps.runAuxInner(createdInstanceKey, mappedItemsDraft)
        return createNavigationStyleApplyOption({
          value: mappedItemsDraft,
          label: imageAssetId.label,
          detail: imageAssetId.group + ' · ' + deps.runAuxRight(mappedItemsDraft, pl2),
        })
      }),
    ),
    deps.runVariantLower(pe4, '摄像头实时预览'),
    (deps.navigationStyleApplyMessageElement.hidden = true),
    (deps.navigationStyleApplyMessageElement.textContent = ''),
    (deps.editorCtx.appliedStyleRecord = {
      sourceId: createdInstanceKey.id,
      type: 'camera',
    }),
    deps.navigationStyleApplyDialogElement.showModal())
}

export function openTitleButtonStyleApplyDialog(deps: StyleDialogsDeps) {
  const createdInstancePath = deps.removedComponent()
  if (!createdInstancePath || createdInstancePath.type !== 'title-button') return
  const wC2 = deps.runAltOuter(createdInstancePath),
    pe5 = deps.findReplaceableComponents(createdInstancePath)
  !wC2.length ||
    !pe5.length ||
    ((deps.navigationStyleApplyTitleElement.textContent = '应用标题按钮设置'),
    (deps.navigationStyleApplyTargetHeadingElement.textContent = '应用到标题按钮'),
    (deps.navigationStyleApplyTargetScopeElement.textContent = '按区域与页面区分'),
    (deps.navigationStyleApplySummaryElement.textContent =
      '将“' +
      componentLabel2(createdInstancePath) +
      '”中选定的修改应用到选中的标题按钮。文字内容、图标名称、备注、动作和控件中心位置不会改变。'),
    deps.navigationStyleApplyPropertiesElement.replaceChildren(
      ...wC2.map((imageAssetDraftDocument: any) => {
        const imageAssetComponent = (navigationPreviewClickComponentIdState as any)[imageAssetDraftDocument],
          ll2 = deps.runAltPeer(createdInstancePath, imageAssetDraftDocument)
        return createNavigationStyleApplyOption({
          value: imageAssetDraftDocument,
          label: imageAssetComponent.label,
          detail:
            imageAssetComponent.group +
            ' · ' +
            deps.onNavigationStyleApplyCancelButtonClick(imageAssetDraftDocument, ll2),
        })
      }),
    ),
    deps.runVariantLower(pe5, '标题按钮'),
    (deps.navigationStyleApplyMessageElement.hidden = true),
    (deps.navigationStyleApplyMessageElement.textContent = ''),
    (deps.editorCtx.appliedStyleRecord = {
      sourceId: createdInstancePath.id,
      type: 'title-button',
    }),
    deps.navigationStyleApplyDialogElement.showModal())
}

export function openIconButtonEffectStyleApplyDialog(deps: StyleDialogsDeps) {
  const imageAssetRecord = deps.removedComponent()
  if (!imageAssetRecord || imageAssetRecord.type !== 'icon-button-effect') return
  const nC2 = deps.runAuxAlt(imageAssetRecord),
    pe6 = deps.findReplaceableComponents(imageAssetRecord)
  !nC2.length ||
    !pe6.length ||
    ((deps.navigationStyleApplyTitleElement.textContent = '应用图标按钮（效果）设置'),
    (deps.navigationStyleApplyTargetHeadingElement.textContent = '应用到同类型控件'),
    (deps.navigationStyleApplyTargetScopeElement.textContent = '按区域与页面区分'),
    (deps.navigationStyleApplySummaryElement.textContent =
      '将“' +
      componentLabel2(imageAssetRecord) +
      '”中选定的修改应用到选中的图标按钮（效果）。实体、备注、动作和按钮位置不会改变。'),
    deps.navigationStyleApplyPropertiesElement.replaceChildren(
      ...nC2.map((mappedItemsSnapshot: any) => {
        const imageAssetSize = (styleSourceComponentIdState as any)[mappedItemsSnapshot],
          tl2 = deps.runAltNew(imageAssetRecord, mappedItemsSnapshot)
        return createNavigationStyleApplyOption({
          value: mappedItemsSnapshot,
          label: imageAssetSize.label,
          detail: imageAssetSize.group + ' · ' + deps.runAuxVariant(mappedItemsSnapshot, tl2),
        })
      }),
    ),
    deps.runVariantLower(pe6, '图标按钮（效果）'),
    (deps.navigationStyleApplyMessageElement.hidden = true),
    (deps.navigationStyleApplyMessageElement.textContent = ''),
    (deps.editorCtx.appliedStyleRecord = {
      sourceId: imageAssetRecord.id,
      type: 'icon-button-effect',
    }),
    deps.navigationStyleApplyDialogElement.showModal())
}

export function openAirConditionerStyleApplyDialog(deps: StyleDialogsDeps) {
  const createdInstanceText = deps.removedComponent()
  if (!createdInstanceText || createdInstanceText.type !== 'air-conditioner') return
  const sC2 = deps.runAltLeft(createdInstanceText),
    pe7 = deps.findReplaceableComponents(createdInstanceText)
  !sC2.length ||
    !pe7.length ||
    ((deps.navigationStyleApplyTitleElement.textContent = '应用空调设置'),
    (deps.navigationStyleApplyTargetHeadingElement.textContent = '应用到同类型控件'),
    (deps.navigationStyleApplyTargetScopeElement.textContent = '按区域与页面区分'),
    (deps.navigationStyleApplySummaryElement.textContent =
      '将“' +
      componentLabel2(createdInstanceText) +
      '”中选定的修改应用到选中的空调控件。实体、备注、文字内容、动作和按钮位置不会改变。'),
    deps.navigationStyleApplyPropertiesElement.replaceChildren(
      ...sC2.map((imageAssetSizeDraftDocument: any) => {
        const imageAssetSizeComponent = (onNavigationStyleApplyConfirmButtonClickValue as any)[
            imageAssetSizeDraftDocument
          ],
          il3 = deps.onNavigationStyleApplyConfirmButtonClick(createdInstanceText, imageAssetSizeDraftDocument)
        return createNavigationStyleApplyOption({
          value: imageAssetSizeDraftDocument,
          label: imageAssetSizeComponent.label,
          detail: imageAssetSizeComponent.group + ' · ' + deps.runAltFirst(imageAssetSizeDraftDocument, il3),
        })
      }),
    ),
    deps.runVariantLower(pe7, '空调'),
    (deps.navigationStyleApplyMessageElement.hidden = true),
    (deps.navigationStyleApplyMessageElement.textContent = ''),
    (deps.editorCtx.appliedStyleRecord = {
      sourceId: createdInstanceText.id,
      type: 'air-conditioner',
    }),
    deps.navigationStyleApplyDialogElement.showModal())
}

export function openIconButtonStyleApplyDialog(deps: StyleDialogsDeps) {
  const createdInstanceCount = deps.removedComponent()
  if (!createdInstanceCount || !['icon-button', 'device-button', 'presence-sensor'].includes(createdInstanceCount.type))
    return
  const fI2 =
      createdInstanceCount.type === 'presence-sensor'
        ? deps.runAuxTwin(createdInstanceCount)
        : createdInstanceCount.type === 'device-button'
          ? '设备按钮'
          : '图标按钮',
    eC2 = deps.appliedStylePropertyKey(createdInstanceCount),
    pe8 = deps.findReplaceableComponents(createdInstanceCount)
  !eC2.length ||
    !pe8.length ||
    ((deps.navigationStyleApplyTitleElement.textContent = '应用' + fI2 + '设置'),
    (deps.navigationStyleApplyTargetHeadingElement.textContent = '应用到同类型控件'),
    (deps.navigationStyleApplyTargetScopeElement.textContent = '按区域与页面区分'),
    (deps.navigationStyleApplySummaryElement.textContent =
      '将“' +
      componentLabel2(createdInstanceCount) +
      '”中选定的修改应用到选中的' +
      fI2 +
      '。实体、备注、图标名称、文字内容和位置不会改变。'),
    deps.navigationStyleApplyPropertiesElement.replaceChildren(
      ...eC2.map((mappedItemsSample: any) => {
        const zI2 = deps.onNavigationIconCopyButtonClick(createdInstanceCount, mappedItemsSample),
          al2 = deps.styleTargetCheckbox(createdInstanceCount, mappedItemsSample)
        return createNavigationStyleApplyOption({
          value: mappedItemsSample,
          label: zI2.label,
          detail: zI2.group + ' · ' + deps.navigationIconCopyError(mappedItemsSample, al2),
        })
      }),
    ),
    deps.runVariantLower(pe8, fI2),
    (deps.navigationStyleApplyMessageElement.hidden = true),
    (deps.navigationStyleApplyMessageElement.textContent = ''),
    (deps.editorCtx.appliedStyleRecord = {
      sourceId: createdInstanceCount.id,
      type: createdInstanceCount.type,
    }),
    deps.navigationStyleApplyDialogElement.showModal())
}

export function imageAssetMeasureError(deps: StyleDialogsDeps) {
  const createdInstanceIndex = deps.removedComponent()
  if (!createdInstanceIndex || createdInstanceIndex.type !== 'line-chart') return
  const yC2 = deps.runAltBackup(createdInstanceIndex),
    pe9 = deps.findReplaceableComponents(createdInstanceIndex)
  !yC2.length ||
    !pe9.length ||
    ((deps.navigationStyleApplyTitleElement.textContent = '应用折线图设置'),
    (deps.navigationStyleApplyTargetHeadingElement.textContent = '应用到折线图'),
    (deps.navigationStyleApplyTargetScopeElement.textContent = '按区域与页面区分'),
    (deps.navigationStyleApplySummaryElement.textContent =
      '将“' +
      componentLabel2(createdInstanceIndex) +
      '”中选定的修改应用到选中的折线图。数值实体、备注、动作和位置不会改变。'),
    deps.navigationStyleApplyPropertiesElement.replaceChildren(
      ...yC2.map((onIconButtonEffectAssetButtonClick: any) => {
        const isEffectAssetMenuHidden = (navigationVisibilityComponentValue as any)[onIconButtonEffectAssetButtonClick],
          el2 = deps.runAltCopy(createdInstanceIndex, onIconButtonEffectAssetButtonClick)
        return createNavigationStyleApplyOption({
          value: onIconButtonEffectAssetButtonClick,
          label: isEffectAssetMenuHidden.label,
          detail: isEffectAssetMenuHidden.group + ' · ' + deps.runAltTwin(onIconButtonEffectAssetButtonClick, el2),
        })
      }),
    ),
    deps.runVariantLower(
      pe9,
      (effectAssetCatalogError: any) => effectAssetCatalogError.bindings?.entity?.entityId || '未设置数值实体',
    ),
    (deps.navigationStyleApplyMessageElement.hidden = true),
    (deps.navigationStyleApplyMessageElement.textContent = ''),
    (deps.editorCtx.appliedStyleRecord = {
      sourceId: createdInstanceIndex.id,
      type: 'line-chart',
    }),
    deps.navigationStyleApplyDialogElement.showModal())
}

export function applyInspectorDimensionChange(_deps: StyleDialogsDeps, nextValue: any, target: any, dimension: string) {
  const next = clone2(nextValue)
  if (dimension === 'width') {
    const centerX = Number(target.position?.x || 0) + Number(target.position?.width || 100) / 2
    target.position = {
      ...(target.position || {}),
      x: centerX - Number(next) / 2,
      width: Number(next),
    }
    return
  }
  if (dimension === 'height') {
    const centerY = Number(target.position?.y || 0) + Number(target.position?.height || 100) / 2
    target.position = {
      ...(target.position || {}),
      y: centerY - Number(next) / 2,
      height: Number(next),
    }
    return
  }
  if (dimension === 'scale') {
    target.style = {
      ...(target.style || {}),
      scale: Number(next),
    }
    return
  }
  if (dimension === 'rotation') {
    target.position = {
      ...(target.position || {}),
      rotation: Number(next),
    }
    return
  }
  target.properties = {
    ...(target.properties || {}),
    [dimension]: next,
  }
}

export function onIconButtonEffectAssetFolderSelectChange(
  deps: StyleDialogsDeps,
  onIconButtonEffectAssetSearchInputInput: any,
  onIconButtonEffectAssetOptionsPointerover: any,
  effectAssetPointerOverEvent: any,
) {
  deps.applyInspectorDimensionChange(
    deps.entryStateRecord(onIconButtonEffectAssetSearchInputInput, effectAssetPointerOverEvent),
    onIconButtonEffectAssetOptionsPointerover,
    effectAssetPointerOverEvent,
  )
}

export function applyEffectAssetDimensionChange(
  deps: StyleDialogsDeps,
  component: any,
  onIconButtonEffectAssetOptionsClick: any,
  effectAssetClickEvent: any,
) {
  deps.applyInspectorDimensionChange(
    deps.runAuxOld(component, effectAssetClickEvent),
    onIconButtonEffectAssetOptionsClick,
    effectAssetClickEvent,
  )
}

export function applyCameraDimensionChange(
  deps: StyleDialogsDeps,
  component: any,
  effectAssetMeasureError: any,
  effectAssetDraftDocument: any,
) {
  deps.applyInspectorDimensionChange(
    deps.runAuxInner(component, effectAssetDraftDocument),
    effectAssetMeasureError,
    effectAssetDraftDocument,
  )
}

export function applyLineChartDimensionChange(
  deps: StyleDialogsDeps,
  onUndoButtonClick: any,
  onRedoButtonClick: any,
  onRecoveryRestoreButtonClick: any,
) {
  deps.applyInspectorDimensionChange(
    deps.runAltCopy(onUndoButtonClick, onRecoveryRestoreButtonClick),
    onRedoButtonClick,
    onRecoveryRestoreButtonClick,
  )
}

export function recoveredComponentId(
  deps: StyleDialogsDeps,
  onRecoveryDiscardButtonClick: any,
  onRecoveryDialogCancel: any,
  recoveryCancelEvent: any,
) {
  deps.applyInspectorDimensionChange(
    deps.runAltNew(onRecoveryDiscardButtonClick, recoveryCancelEvent),
    onRecoveryDialogCancel,
    recoveryCancelEvent,
  )
}

export function onErrorDialogCloseButtonClick(
  deps: StyleDialogsDeps,
  onErrorDialogConfirmButtonClick: any,
  onErrorDialogClick: any,
  errorDialogClickEvent: any,
) {
  deps.applyInspectorDimensionChange(
    deps.runAltPeer(onErrorDialogConfirmButtonClick, errorDialogClickEvent),
    onErrorDialogClick,
    errorDialogClickEvent,
  )
}

export function onShowSharedComponentsButtonClick(
  deps: StyleDialogsDeps,
  onShowPageComponentsButtonClick: any,
  onAddComponentButtonClick: any,
  onComponentTemplateCloseButtonClick: any,
) {
  deps.applyInspectorDimensionChange(
    deps.styleTargetCheckbox(onShowPageComponentsButtonClick, onComponentTemplateCloseButtonClick),
    onAddComponentButtonClick,
    onComponentTemplateCloseButtonClick,
  )
}

export function onComponentTemplateDialogClick(
  deps: StyleDialogsDeps,
  templateDialogClickEvent: any,
  onComponentTemplateListClick: any,
  templateListClickEvent: any,
) {
  deps.applyInspectorDimensionChange(
    deps.onNavigationStyleApplyConfirmButtonClick(templateDialogClickEvent, templateListClickEvent),
    onComponentTemplateListClick,
    templateListClickEvent,
  )
}

export function closePopupRenameDialog(deps: StyleDialogsDeps) {
  deps.editorCtx.popupBeingRenamedValue?.close()
}

export function createCopyBackupDeps(deps: StyleDialogsDeps) {
  return {
    get runCopyFallback() {
      return deps.runCopyFallback
    },
    get runShadow() {
      return deps.runShadow
    },
    get imageAssetLargePreviewImageElement() {
      return deps.imageAssetLargePreviewImageElement
    },
    get popupBeingRenamedValue() {
      return deps.editorCtx.popupBeingRenamedValue
    },
    set popupBeingRenamedValue(value) {
      deps.editorCtx.popupBeingRenamedValue = value
    },
    get hideAssetLargePreview() {
      return deps.hideAssetLargePreview
    },
    get handleOperationError() {
      return deps.handleOperationError
    },
  }
}

export function renderCopyBackupDialog(
  deps: StyleDialogsDeps,
  {
    kind: popupBeingRenamedConfig,
    title: popupBeingRenamedRef,
    subtitle: popupBeingRenamedEntry = '',
    searchPlaceholder: popupBeingRenamedRecord,
    triggerButton: popupBeingRenamedName,
    pageSize: recoveredComponentIdState,
    initialPage: initialPageNumber = 1,
    selectedText: selectedTextValue = '',
    emptyText: recoveryCancelEventState,
    itemClass: itemClassName = '',
    getPage: onErrorDialogConfirmButtonClickState,
    renderItem: onErrorDialogClickState,
    renderLeadingItems: errorDialogClickEventValue = null,
    renderTrailingItems: onShowSharedComponentsButtonClickState = null,
    buildToolbar: onShowPageComponentsButtonClickState = null,
    onSelect: onAddComponentButtonClickState,
    onDelete: onPopupNewButtonClick = null,
    onItemHover: onPopupNameCloseButtonClick = null,
    closeLegacyPickers: onPopupNameCancelButtonClick = true,
    renderSelectedActions: onPopupNameFormSubmit = null,
    renderSelectedContent: popupNameSubmitEvent = null,
  }: any,
) {
  return renderPagedPickerDialog(deps.runCopyBackupDeps(), {
    kind: popupBeingRenamedConfig,
    title: popupBeingRenamedRef,
    subtitle: popupBeingRenamedEntry,
    searchPlaceholder: popupBeingRenamedRecord,
    triggerButton: popupBeingRenamedName,
    pageSize: recoveredComponentIdState,
    initialPage: initialPageNumber,
    selectedText: selectedTextValue,
    emptyText: recoveryCancelEventState,
    itemClass: itemClassName,
    getPage: onErrorDialogConfirmButtonClickState,
    renderItem: onErrorDialogClickState,
    renderLeadingItems: errorDialogClickEventValue,
    renderTrailingItems: onShowSharedComponentsButtonClickState,
    buildToolbar: onShowPageComponentsButtonClickState,
    onSelect: onAddComponentButtonClickState,
    onDelete: onPopupNewButtonClick,
    onItemHover: onPopupNameCloseButtonClick,
    closeLegacyPickers: onPopupNameCancelButtonClick,
    renderSelectedActions: onPopupNameFormSubmit,
    renderSelectedContent: popupNameSubmitEvent,
  })
}
