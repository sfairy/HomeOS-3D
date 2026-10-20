/* 灯光面板（灯光输入、自动灯光、资源删除、弹窗） */
import type { EditorContext } from "../editor-context";
import { syncProjectTemplateOptions } from "../../bindings/project-template-options-render";
import { greatestCommonDivisor as greatestCommonDivisor2 } from "../../editor-document-management";
import { navigateInShell } from "@/studio/platform/shell-navigation";
import { normalizeBaseLighting as normalizeBaseLighting2 } from "../../../3d-studio/loaders/studio-normalization";
import { findComponent as findComponent2 } from "../../component-tree";
import { clampNumber as clampNumber2 } from "../../editor-utils";

export interface LightingPanelDeps {
  editorCtx: EditorContext;
  buttonVisibilityDraftDocument: any;
  currentPage: any;
  floorplanAutoLightingPanelElement: any;
  floorplanAutoLightingStatusElement: any;
  floorplanBaseLightElements: any;
  handleOperationError: any;
  imageEntityDraftDocument: any;
  lightFieldElement: any;
  lightStatisticsEntityListClickEvent: any;
  lightingPayload: any;
  mutateDocument: any;
  openLightingPanel: any;
  pageDialogElement: any;
  pageDialogKickerElement: any;
  pageDialogTitleElement: any;
  pageFormElement: any;
  pageMessageElement: any;
  pageSubmitElement: any;
  popupId: any;
  projectAspectLockElement: any;
  projectAspectLockLabelElement: any;
  projectAspectRatioElement: any;
  projectCanvasFieldsElement: any;
  projectCanvasHeightElement: any;
  projectCanvasHintElement: any;
  projectCanvasWidthElement: any;
  projectContentLockElement: any;
  projectContentLockFieldsElement: any;
  projectDialogElement: any;
  projectDialogKickerElement: any;
  projectDialogTitleElement: any;
  projectFormElement: any;
  projectMessageElement: any;
  projectPreviewCountElement: any;
  projectPreviewDialogElement: any;
  projectPreviewImageElement: any;
  projectPreviewTitleElement: any;
  projectResizeWarningDialogElement: any;
  projectResizeWarningTextElement: any;
  projectSubmitElement: any;
  projectTemplateFieldsElement: any;
  projectTemplateOptionsElement: any;
  reloadAssetCatalog: any;
  requestJson: any;
  setSettingsMessage: any;
  syncAspectLockButton: any;
  targetPageCandidate: any;
  titleButtonIconOptionClickEvent: any;
}

export async function actionDraftDocument(deps: LightingPanelDeps) {
  return deps.syncAspectLockButton();
}

export function targetPageCandidate(deps: LightingPanelDeps) {
  deps.editorCtx.resizeWarningResolveState = "";
  const cameraCommandState = [
    {
      id: "",
      name: "空白仪表盘",
      description: "创建空白画布，不预置页面、控件或弹窗。",
      previewUrls: [] as any[],
      previewLabels: [] as any[],
      canvasWidth: null as any,
      canvasHeight: null as any,
    },
  ];
  syncProjectTemplateOptions({
  get projectTemplateOptionsElement() { return deps.projectTemplateOptionsElement; },
  get cameraCommandState() { return cameraCommandState; },
  get resizeWarningResolveState() { return deps.editorCtx.resizeWarningResolveState; },
  get projectCanvasFieldsElement() { return deps.projectCanvasFieldsElement; },
  get projectDialogMode() { return deps.editorCtx.projectDialogMode; },
  get projectFormElement() { return deps.projectFormElement; },
  get projectCanvasWidthElement() { return deps.projectCanvasWidthElement; },
  get projectCanvasHeightElement() { return deps.projectCanvasHeightElement; },
  get isAspectLockedState() { return deps.editorCtx.isAspectLockedState; },
  get isAspectLockedValue() { return deps.editorCtx.isAspectLockedValue; },
  get projectCanvasHintElement() { return deps.projectCanvasHintElement; },
  get lightStatisticsEntityListClickEvent() { return deps.lightStatisticsEntityListClickEvent; },
  get imageEntityDraftDocument() { return deps.imageEntityDraftDocument; },
  });

}

export function buttonVisibilityDraftDocument(deps: LightingPanelDeps, iconPreviewStateClickEventElement: any) {
  try {
    return {
      urls: JSON.parse(iconPreviewStateClickEventElement.dataset.previewUrls || "[]"),
      labels: JSON.parse(iconPreviewStateClickEventElement.dataset.previewLabels || "[]"),
    };
  } catch {
    return {
      urls: [] as any[],
      labels: [] as any[],
    };
  }
}

export function titleButtonIconOptionClickEvent(deps: LightingPanelDeps) {
  deps.editorCtx.lockedCanvasWidthValue.length &&
    ((deps.editorCtx.lockedCanvasHeight =
      ((deps.editorCtx.lockedCanvasHeight % deps.editorCtx.lockedCanvasWidthValue.length) + deps.editorCtx.lockedCanvasWidthValue.length) %
      deps.editorCtx.lockedCanvasWidthValue.length),
    (deps.projectPreviewImageElement.src = deps.editorCtx.lockedCanvasWidthValue[deps.editorCtx.lockedCanvasHeight]),
    (deps.projectPreviewImageElement.alt =
      deps.editorCtx.lockedCanvasHeightState[deps.editorCtx.lockedCanvasHeight] || "HomeOS预览 " + (deps.editorCtx.lockedCanvasHeight + 1)),
    (deps.projectPreviewTitleElement.textContent =
      deps.editorCtx.lockedCanvasHeightState[deps.editorCtx.lockedCanvasHeight] || "HomeOS预览"),
    (deps.projectPreviewCountElement.textContent =
      deps.editorCtx.lockedCanvasHeight + 1 + " / " + deps.editorCtx.lockedCanvasWidthValue.length));
}

export function titleButtonIconDraftDocument(deps: LightingPanelDeps, lightStatisticsIconClickEventElement: any) {
  const { urls: qw4, labels: qw5 } = deps.buttonVisibilityDraftDocument(
    lightStatisticsIconClickEventElement,
  );
  qw4.length &&
    ((deps.editorCtx.lockedCanvasWidthValue = qw4),
    (deps.editorCtx.lockedCanvasHeightState = qw5),
    (deps.editorCtx.lockedCanvasHeight = Number(lightStatisticsIconClickEventElement.dataset.previewIndex || 0)),
    deps.titleButtonIconOptionClickEvent(),
    deps.projectPreviewDialogElement.showModal());
}

export function lightStatisticsIconCopyError(deps: LightingPanelDeps, lightStatisticsIconOptionClickEvent = "create") {
  deps.editorCtx.projectDialogMode = lightStatisticsIconOptionClickEvent;
  const isClosed = lightStatisticsIconOptionClickEvent === "edit",
    isPreviewActiveActive = lightStatisticsIconOptionClickEvent === "resize";
  if (
    (deps.projectFormElement.reset(),
    (deps.projectDialogKickerElement.textContent = isPreviewActiveActive
      ? "RESIZE DASHBOARD"
      : isClosed
        ? "EDIT PROJECT"
        : "NEW PROJECT"),
    (deps.projectDialogTitleElement.textContent = isPreviewActiveActive
      ? "修改仪表盘分辨率"
      : isClosed
        ? "修改仪表盘"
        : "创建仪表盘项目"),
    (deps.projectSubmitElement.textContent = isPreviewActiveActive
      ? "应用修改"
      : isClosed
        ? "保存修改"
        : "创建项目"),
    (deps.projectFormElement.elements.name.value =
      isClosed || isPreviewActiveActive ? deps.editorCtx.activeProject?.document?.name || "" : "我的仪表盘"),
    (deps.projectTemplateFieldsElement.hidden = isClosed || isPreviewActiveActive),
    (deps.projectCanvasWidthElement.readOnly = false),
    (deps.projectCanvasHeightElement.readOnly = false),
    (deps.projectContentLockElement.checked = false),
    (deps.projectContentLockFieldsElement.hidden = !isPreviewActiveActive),
    deps.projectCanvasFieldsElement.classList.remove("fixed", "name-only"),
    !isClosed && !isPreviewActiveActive)
  )
    ((deps.editorCtx.isAspectLockedState = 2778),
      (deps.editorCtx.isAspectLockedValue = 1940),
      (deps.editorCtx.isAspectLocked = false),
      (deps.editorCtx.lockedCanvasWidthState = 2778),
      (deps.editorCtx.lockedCanvasWidth = 1940),
      (deps.projectCanvasWidthElement.value = "2778"),
      (deps.projectCanvasHeightElement.value = "1940"),
      deps.lightStatisticsEntityListClickEvent(),
      deps.targetPageCandidate());
  else {
    if (isClosed)
      ((deps.projectCanvasFieldsElement.hidden = false),
        deps.projectCanvasFieldsElement.classList.add("name-only"));
    else {
      deps.editorCtx.resizeWarningResolveState = "";
      const lightStatisticsIconOptionElement = Number(
          deps.editorCtx.activeProject?.document?.canvas?.width || 2778,
        ),
        lightStatisticsEntityOptionElement = Number(
          deps.editorCtx.activeProject?.document?.canvas?.height || 1940,
        );
      ((deps.editorCtx.isAspectLockedState = lightStatisticsIconOptionElement),
        (deps.editorCtx.isAspectLockedValue = lightStatisticsEntityOptionElement),
        (deps.editorCtx.isAspectLocked = true),
        (deps.editorCtx.lockedCanvasWidthState = lightStatisticsIconOptionElement),
        (deps.editorCtx.lockedCanvasWidth = lightStatisticsEntityOptionElement),
        (deps.projectCanvasFieldsElement.hidden = false),
        (deps.projectCanvasWidthElement.value = String(lightStatisticsIconOptionElement)),
        (deps.projectCanvasHeightElement.value = String(lightStatisticsEntityOptionElement)),
        (deps.projectCanvasHintElement.textContent =
          "默认会同步调整所有页面、控件和弹窗；勾选“锁定控件大小及位置”后保留普通控件的位置和尺寸，3D 交互外框始终跟随画布宽高。"),
        deps.lightStatisticsEntityListClickEvent(),
        deps.imageEntityDraftDocument(false));
    }
  }
  (deps.setSettingsMessage(deps.projectMessageElement, ""), deps.projectDialogElement.showModal());
}

export function lightStatisticsEntityListClickEvent(deps: LightingPanelDeps) {
  const statisticsReplaceElement = Number(deps.projectCanvasWidthElement.value),
    statisticsRemoveElement = Number(deps.projectCanvasHeightElement.value);
  if (
    !Number.isInteger(statisticsReplaceElement) ||
    !Number.isInteger(statisticsRemoveElement) ||
    statisticsReplaceElement <= 0 ||
    statisticsRemoveElement <= 0
  ) {
    deps.projectAspectRatioElement.textContent = "等待输入有效分辨率";
    return;
  }
  const $a2 =
      !deps.editorCtx.resizeWarningResolveState && deps.editorCtx.isAspectLocked
        ? deps.editorCtx.lockedCanvasWidthState
        : statisticsReplaceElement,
    Fa2 =
      !deps.editorCtx.resizeWarningResolveState && deps.editorCtx.isAspectLocked ? deps.editorCtx.lockedCanvasWidth : statisticsRemoveElement,
    imageEntityOptionElement = greatestCommonDivisor2($a2, Fa2);
  deps.projectAspectRatioElement.textContent =
    $a2 / imageEntityOptionElement + " : " + Fa2 / imageEntityOptionElement;
}

export function imageEntityDraftDocument(deps: LightingPanelDeps, imageActionKey = !!deps.editorCtx.resizeWarningResolveState) {
  const Sn2 = imageActionKey || deps.editorCtx.isAspectLocked;
  ((deps.projectAspectLockElement.disabled = imageActionKey),
    deps.projectAspectLockElement.setAttribute("aria-pressed", String(Sn2)),
    deps.projectAspectLockElement.classList.toggle("locked", Sn2),
    (deps.projectAspectLockLabelElement.textContent = imageActionKey ? "固定" : Sn2 ? "已锁定" : "锁定"),
    (deps.projectAspectLockElement.title = imageActionKey
      ? "HomeOS画布使用固定比例"
      : Sn2
        ? "点击解锁画布比例"
        : "锁定当前画布比例"));
}

export function openAssetPicker(deps: LightingPanelDeps, assetTriggerButton: any) {
  if (deps.editorCtx.resizeWarningResolveState || !deps.editorCtx.isAspectLocked) return;
  const assetCurrentRecord = Number(deps.editorCtx.lockedCanvasWidthState),
    assetInitialIndex = Number(deps.editorCtx.lockedCanvasWidth);
  if (!(!assetCurrentRecord || !assetInitialIndex)) {
    if (assetTriggerButton === "width") {
      let assetMatches = Number(deps.projectCanvasWidthElement.value);
      if (!Number.isInteger(assetMatches) || assetMatches < 320 || assetMatches > 7680) return;
      let round = Math.round((assetMatches * assetInitialIndex) / assetCurrentRecord);
      ((round < 240 || round > 4320) &&
        ((round = Math.max(240, Math.min(4320, round))),
        (assetMatches = Math.max(
          320,
          Math.min(7680, Math.round((round * assetCurrentRecord) / assetInitialIndex)),
        )),
        (deps.projectCanvasWidthElement.value = String(assetMatches))),
        (deps.projectCanvasHeightElement.value = String(round)));
    } else {
      let assetOptionButtonElement = Number(deps.projectCanvasHeightElement.value);
      if (
        !Number.isInteger(assetOptionButtonElement) ||
        assetOptionButtonElement < 240 ||
        assetOptionButtonElement > 4320
      )
        return;
      let round2 = Math.round((assetOptionButtonElement * assetCurrentRecord) / assetInitialIndex);
      ((round2 < 320 || round2 > 7680) &&
        ((round2 = Math.max(320, Math.min(7680, round2))),
        (assetOptionButtonElement = Math.max(
          240,
          Math.min(4320, Math.round((round2 * assetInitialIndex) / assetCurrentRecord)),
        )),
        (deps.projectCanvasHeightElement.value = String(assetOptionButtonElement))),
        (deps.projectCanvasWidthElement.value = String(round2)));
    }
  }
}

export function assetIdToDelete(deps: LightingPanelDeps, assetDocumentNode: any, requestDeleteAssetFolder: any, folderKind: any) {
  return (
    (deps.projectResizeWarningTextElement.textContent =
      "当前分辨率为 " +
      requestDeleteAssetFolder +
      " × " +
      folderKind +
      "，预计有 " +
      assetDocumentNode +
      " 个控件会部分或全部位于画布范围之外。"),
    new Promise((folderName) => {
      ((deps.editorCtx.resizeWarningResolve = folderName), deps.projectResizeWarningDialogElement.showModal());
    })
  );
}

export function folderDocumentNode(deps: LightingPanelDeps, refreshAssetPickerViews: any) {
  const rp2 = deps.editorCtx.resizeWarningResolve;
  ((deps.editorCtx.resizeWarningResolve = null),
    deps.projectResizeWarningDialogElement.open && deps.projectResizeWarningDialogElement.close(),
    rp2?.(refreshAssetPickerViews));
}

export function closeDeletePopupDialog(deps: LightingPanelDeps, popupDeleteUsageEntries = "create") {
  if (!deps.editorCtx.activeProject) return;
  deps.editorCtx.pageDialogMode = popupDeleteUsageEntries;
  const isImageAssetPicker = popupDeleteUsageEntries === "rename";
  (deps.pageFormElement.reset(),
    (deps.pageDialogKickerElement.textContent = isImageAssetPicker ? "EDIT PAGE" : "NEW PAGE"),
    (deps.pageDialogTitleElement.textContent = isImageAssetPicker ? "重命名页面" : "新建页面"),
    (deps.pageSubmitElement.textContent = isImageAssetPicker ? "保存修改" : "创建页面"),
    (deps.pageFormElement.elements.name.value = (isImageAssetPicker && deps.currentPage()?.name) || ""),
    deps.setSettingsMessage(deps.pageMessageElement, ""),
    deps.pageDialogElement.showModal());
}

export function documentSource(deps: LightingPanelDeps) {
  return deps.editorCtx.hasUnsavedChanges
    ? (deps.handleOperationError(new Error("当前有未保存修改，请先点击顶部的“保存”。")), true)
    : false;
}

export function popupId(deps: LightingPanelDeps, _entityLabelFor: any) {}

export async function triggerKey(deps: LightingPanelDeps) {
  const documentPages = await deps.requestJson("/license/status");
  if (documentPages?.required && !documentPages.allowed)
    return (navigateInShell("/activate"), documentPages);
  const sharedUsages = JSON.stringify([...(documentPages?.features || [])].sort()),
    sharedScopeText =
      deps.editorCtx.lastLicenseFeatureSignature !== null && deps.editorCtx.lastLicenseFeatureSignature !== sharedUsages;
  deps.editorCtx.lastLicenseFeatureSignature = sharedUsages;
  return (
    sharedScopeText && (await deps.reloadAssetCatalog({ refreshInspector: false })),
    deps.popupId(documentPages),
    documentPages
  );
}

export function findDiagramPreviewFrame(deps: LightingPanelDeps, 
  lightingComponentId: any,
  applyBaseLightingToPanel: any,
  baseLighting: any = null,
) {
  const normalizedLightingElement = document.querySelector<HTMLIFrameElement>(
    '.hb-component[data-component-id="' +
      CSS.escape(lightingComponentId) +
      '"] .hb-floorplan-auto-diagram-preview',
  );
  return normalizedLightingElement?.contentWindow
    ? (normalizedLightingElement.contentWindow.postMessage(
        {
          type: "homeos-floorplan-auto-diagram-camera",
          componentId: lightingComponentId,
          command: applyBaseLightingToPanel,
          value: baseLighting,
        },
        window.location.origin,
      ),
      true)
    : false;
}

export function lightInputElement(deps: LightingPanelDeps, openAutoDiagramDialog: any, dialogComponentId: any) {
  const cancelRemovesComponentElement = document.querySelector<HTMLIFrameElement>(
    '.hb-component[data-component-id="' +
      CSS.escape(openAutoDiagramDialog) +
      '"] .hb-floorplan-auto-diagram-preview',
  );
  return cancelRemovesComponentElement?.contentWindow
    ? (cancelRemovesComponentElement.contentWindow.postMessage(
        {
          type: "homeos-floorplan-auto-diagram-floor",
          componentId: openAutoDiagramDialog,
          command: "set-floor",
          value: dialogComponentId,
        },
        window.location.origin,
      ),
      true)
    : false;
}

export function cancelRemovesComponent(deps: LightingPanelDeps, bindFloorplanSection: any) {
  if (!bindFloorplanSection?.isConnected) return;
  const onElement = bindFloorplanSection.closest(".hb-floorplan-auto-diagram");
  if (!onElement) return;
  bindFloorplanSection.classList.remove("is-ready");
  let onWindowPageshowElement = onElement.querySelector(".hb-floorplan-auto-diagram-loading");
  onWindowPageshowElement ||
    ((onWindowPageshowElement = document.createElement("div")),
    (onWindowPageshowElement.className = "hb-floorplan-auto-diagram-loading"),
    (onWindowPageshowElement.innerHTML =
      '<i aria-hidden="true"></i><strong>正在重新载入3D户型…</strong>'),
    onElement.append(onWindowPageshowElement));
  const pageshowEvent = new URL(bindFloorplanSection.src, window.location.origin);
  (pageshowEvent.searchParams.set("auto-diagram-refresh", String(Date.now())),
    (bindFloorplanSection.src = pageshowEvent.toString()));
}

export function lightingPayload(deps: LightingPanelDeps, readBaseLightingFromPanel = deps.editorCtx.baseLightingComponentId) {
  return readBaseLightingFromPanel
    ? document.querySelector<HTMLIFrameElement>(
        '.hb-component[data-component-id="' +
          CSS.escape(readBaseLightingFromPanel) +
          '"] .hb-floorplan-auto-diagram-preview',
      )
    : null;
}

export function lightFieldElement(deps: LightingPanelDeps, closeLightingPanel: any, cancelLightingPreview: any = null) {
  const gm2 = deps.lightingPayload();
  return gm2?.contentWindow
    ? (gm2.contentWindow.postMessage(
        {
          type: "homeos-floorplan-auto-diagram-base-lighting",
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
    : false;
}

export function openLightingPanel(deps: LightingPanelDeps, lightingHostComponentId: any) {
  const lightingPreviewFrame = normalizeBaseLighting2(lightingHostComponentId);
  for (const interactionModeDraftDocumentElement of deps.floorplanBaseLightElements) {
    const interactionModeComponent =
      (lightingPreviewFrame as any)[interactionModeDraftDocumentElement.dataset.floorplanBaseLight!];
    interactionModeDraftDocumentElement.value =
      interactionModeDraftDocumentElement.step === "5"
        ? String(Math.round(interactionModeComponent))
        : String(Number(interactionModeComponent.toFixed(2)));
  }
  return lightingPreviewFrame;
}

export function lightInputNode(deps: LightingPanelDeps) {
  const onLightInputNodeState: Record<string, any> = {};
  for (const onLightInputNodeInput of deps.floorplanBaseLightElements)
    onLightInputNodeState[onLightInputNodeInput.dataset.floorplanBaseLight!] = Number(
      onLightInputNodeInput.value,
    );
  return normalizeBaseLighting2(onLightInputNodeState);
}

export function onFloorplanAutoLightingResetButtonClick(deps: LightingPanelDeps, {
  cancelPreview: onFloorplanAutoLightingSaveButtonClick = true,
} = {}) {
  deps.floorplanAutoLightingPanelElement.hidden ||
    (onFloorplanAutoLightingSaveButtonClick && deps.lightFieldElement("cancel"),
    (deps.floorplanAutoLightingPanelElement.hidden = true),
    deps.floorplanAutoLightingPanelElement.setAttribute("aria-busy", "false"),
    (deps.editorCtx.baseLightingComponentId = ""),
    (deps.editorCtx.lightingPanelDragStateState = null));
}

export function onFloorplanAutoLightingCloseButtonClick(deps: LightingPanelDeps, onFloorplanAutoLightingHandlePointerdown: any) {
  const gm3 = deps.lightingPayload(onFloorplanAutoLightingHandlePointerdown);
  if (!onFloorplanAutoLightingHandlePointerdown || !gm3?.contentWindow) return;
  ((deps.editorCtx.baseLightingComponentId = onFloorplanAutoLightingHandlePointerdown),
    gm3.classList.remove("is-position-mode"),
    gm3.classList.add("is-view-mode"),
    deps.mutateDocument((lightingDragEvent: any) => {
      const lightingDragEventState = findComponent2(
        lightingDragEvent,
        onFloorplanAutoLightingHandlePointerdown,
      )?.component;
      lightingDragEventState?.type === "floorplan-auto-diagram" &&
        (lightingDragEventState.properties = {
          ...(lightingDragEventState.properties || {}),
          interactionMode: "view",
        });
    }),
    deps.openLightingPanel(deps.editorCtx.baseLightingSettings),
    (deps.floorplanAutoLightingStatusElement.textContent = "正在读取当前光照设置…"),
    (deps.floorplanAutoLightingPanelElement.hidden = false),
    deps.floorplanAutoLightingPanelElement.setAttribute("aria-busy", "true"));
  const lightingPanelBounds = deps.floorplanAutoLightingPanelElement.getBoundingClientRect();
  ((lightingPanelBounds.right > window.innerWidth - 8 ||
    lightingPanelBounds.bottom > window.innerHeight - 8 ||
    lightingPanelBounds.left < 8 ||
    lightingPanelBounds.top < 8) &&
    ((deps.floorplanAutoLightingPanelElement.style.right = "auto"),
    (deps.floorplanAutoLightingPanelElement.style.left =
      clampNumber2(
        lightingPanelBounds.left,
        8,
        Math.max(8, window.innerWidth - lightingPanelBounds.width - 8),
      ) + "px"),
    (deps.floorplanAutoLightingPanelElement.style.top =
      clampNumber2(
        lightingPanelBounds.top,
        8,
        Math.max(8, window.innerHeight - lightingPanelBounds.height - 8),
      ) + "px")),
    deps.lightFieldElement("request-state"));
}

export function applyLightingPanelDragMove(deps: LightingPanelDeps) {
  if (!deps.editorCtx.lightingPanelDragPending) return;
  (deps.floorplanAutoLightingPanelElement.style.right = "auto"),
    (deps.floorplanAutoLightingPanelElement.style.left = deps.editorCtx.lightingPanelDragPending.x + "px"),
    (deps.floorplanAutoLightingPanelElement.style.top = deps.editorCtx.lightingPanelDragPending.y + "px");
}

