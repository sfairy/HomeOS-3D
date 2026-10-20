/* 工作区与文档（仪表盘预览、页面/组件树、分组、选择与文档变更） */
import type { EditorContext } from "../editor-context";
import { PanelRenderer as PanelRenderer2 } from "../../../renderer/panel-renderer";
import { canGroupComponents as canGroupComponents2, groupNameForCollection as groupNameForCollection2, applyCollectionLayerOrder as applyCollectionLayerOrder2, syncSharedComponentReferenceOrder as syncSharedComponentReferenceOrder2, componentLabel as componentLabel2, ensureSharedComponentReference as ensureSharedComponentReference2 } from "../../editor-component-collections";
import { newId as newId2, clone as clone2 } from "../../editor-utils";
import { componentDirectLocation as componentDirectLocation2, findComponentLocation as findComponentLocation2, findComponent as findComponent2 } from "../../component-tree";
import { componentBounds as componentBounds2 } from "../../editor-selection-tools";
import { documentSignature as documentSignature2 } from "../../editor-history";

export interface WorkspaceDocumentDeps {
  editorCtx: EditorContext;
  airConditionerPreviewStateByComponentId: any;
  buttonSoundController: any;
  clearComponentSelection: any;
  collectComponentsByType: (...args: any[]) => any[];
  componentGroupRenameDialogElement: any;
  componentGroupRenameInputElement: any;
  componentGroupRenameMessageElement: any;
  componentListForScope: any;
  coverMotorButtonElement: any;
  currentPage: any;
  customPopupEditorElement: any;
  dashboardDisplayHintElement: any;
  dashboardDisplayLinkElement: any;
  dashboardPreviewElement: any;
  defaultPageActionElement: any;
  displayDeviceCountElement: any;
  editorCanvasElement: any;
  ensureEditorRenderer: any;
  findPageComponentsByType: any;
  handleOperationError: any;
  historySeriesCacheById: any;
  iconButtonEffectPreviewStateByComponentId: any;
  iconButtonPreviewStateByComponentId: any;
  loadNavigationIconOptions: any;
  mutateDocument: any;
  navigationPreviewStateByComponentId: any;
  navigatorContentElement: any;
  pageActionsButtonElement: any;
  pageNewButtonElement: any;
  pageSelectElement: any;
  projectSummary: any;
  refreshSoundToggle: any;
  renderComponentLists: any;
  renderCustomPopupEditor: any;
  renderWorkspaceResolution: any;
  resetPreviewStates: any;
  resizeWorkspaceCanvas: any;
  runAuxBackup: any;
  runCase: any;
  runSlot: any;
  runtimeStateCacheById: any;
  setComponentScope: any;
  setSettingsMessage: any;
  showDashboardPreviewButtonElement: any;
  showEditorPreviewButtonElement: any;
  showPageEditorElement: any;
  showPopupEditorButtonElement: any;
  showPopupEditorElement: any;
  syncAddComponentButton: any;
  syncDefaultPageAction: any;
  syncRendererSelection: any;
  unbindDisplayDeviceError: any;
  value: any;
  virtualEntityStateCacheById: any;
  workspaceResolutionElement: any;
  workspaceTitleElement: any;
}

export function destroyDashboardPreviewRenderer(deps: WorkspaceDocumentDeps) {
  (deps.editorCtx.dashboardPreviewRenderer?.destroy(), (deps.editorCtx.dashboardPreviewRenderer = null));
}

export function renderDashboardPreview(deps: WorkspaceDocumentDeps, displayDeviceUnbindButtonElement = deps.pageSelectElement.value) {
  if (deps.editorCtx.editorMode !== "dashboard") {
    deps.runSlot();
    return;
  }
  if (!deps.editorCtx.activeProject?.document?.pages?.length) {
    (deps.runSlot(),
      (deps.dashboardPreviewElement.innerHTML =
        '<div class="canvas-message"><strong>' +
        (deps.editorCtx.activeProject ? "请从左侧新建页面。" : "请从左侧新建仪表盘。") +
        "</strong></div>"));
    return;
  }
  (deps.editorCtx.dashboardPreviewRenderer ||
    ((deps.editorCtx.dashboardPreviewRenderer = new PanelRenderer2(deps.dashboardPreviewElement, {
      editable: false,
      editorWorkspace: true,
      historySeriesCache: deps.historySeriesCacheById,
      runtimeStateCache: deps.runtimeStateCacheById,
      virtualEntityStateCache: deps.virtualEntityStateCacheById,
      onError: deps.handleOperationError,
      onRuntimeButtonPress() {
        deps.buttonSoundController.play();
      },
      onPageChange(confirmedUnbind: any) {
        ((deps.pageSelectElement.value = confirmedUnbind.path),
          deps.loadNavigationIconOptions(deps.pageSelectElement));
      },
    })),
    deps.editorCtx.dashboardPreviewRenderer.setEntityCatalog(deps.editorCtx.entities, deps.editorCtx.entityResourcesByDeviceId, deps.editorCtx.devices)),
    deps.editorCtx.dashboardPreviewRenderer.setDocument(deps.editorCtx.activeProject.document, displayDeviceUnbindButtonElement));
}

export function unbindDisplayDeviceError(deps: WorkspaceDocumentDeps) {
  const trim = String(deps.editorCtx.activeProject?.document?.name || "").trim(),
    openDisplayDevicesDialogState = deps.editorCtx.editorMode === "dashboard" && !!trim;
  if (
    ((deps.dashboardDisplayHintElement.hidden = !openDisplayDevicesDialogState),
    !openDisplayDevicesDialogState)
  ) {
    (deps.dashboardDisplayLinkElement.removeAttribute("href"),
      (deps.dashboardDisplayLinkElement.textContent = ""));
    return;
  }
  // 用仪表盘名称寻址（/homeos/{name}）：地址简洁、可手抄/做书签；后端 named_display_page 与
  // /display/{project_id} 同一套鉴权。projectId 形态留给展示页内部按主键定位。
  const uRL = new URL("/homeos/" + encodeURIComponent(trim), window.location.origin);
  ((deps.dashboardDisplayLinkElement.href = uRL.href),
    (deps.dashboardDisplayLinkElement.textContent = decodeURI(uRL.href)),
    (deps.dashboardDisplayLinkElement.title = uRL.href));
}

export function renderWorkspaceResolution(deps: WorkspaceDocumentDeps) {
  const documentCanvas = deps.editorCtx.activeProject?.document?.canvas,
    canvasWidthValue = Number(documentCanvas?.width),
    canvasHeightValue = Number(documentCanvas?.height),
    finite =
      deps.editorCtx.editorMode !== "popup" &&
      Number.isFinite(canvasWidthValue) &&
      canvasWidthValue > 0 &&
      Number.isFinite(canvasHeightValue) &&
      canvasHeightValue > 0;
  ((deps.workspaceResolutionElement.hidden = !finite),
    (deps.workspaceResolutionElement.textContent = finite
      ? Math.round(canvasWidthValue) + " × " + Math.round(canvasHeightValue)
      : ""));
}

export function setEditorMode(deps: WorkspaceDocumentDeps, editorModeValue: any) {
  deps.editorCtx.editorMode = ["edit", "dashboard", "popup"].includes(editorModeValue) ? editorModeValue : "edit";
  const isEditingPage = deps.editorCtx.editorMode === "edit",
    isDashboardMode = deps.editorCtx.editorMode === "dashboard",
    isPopupMode = deps.editorCtx.editorMode === "popup";
  ((deps.showPopupEditorButtonElement.hidden = isPopupMode),
    (deps.pageNewButtonElement.hidden = !isPopupMode),
    deps.navigatorContentElement.classList.toggle("popup-mode", isPopupMode),
    deps.showPageEditorElement.classList.toggle("active", !isPopupMode),
    deps.showPageEditorElement.setAttribute("aria-selected", String(!isPopupMode)),
    deps.showPopupEditorElement.classList.toggle("active", isPopupMode),
    deps.showPopupEditorElement.setAttribute("aria-selected", String(isPopupMode)),
    isEditingPage || deps.resetPreviewStates(),
    (deps.editorCanvasElement.hidden = !isEditingPage),
    (deps.dashboardPreviewElement.hidden = !isDashboardMode),
    (deps.customPopupEditorElement.hidden = !isPopupMode),
    deps.displayDeviceCountElement.classList.toggle("empty", !deps.editorCtx.activeProject),
    (deps.workspaceTitleElement.textContent = isDashboardMode
      ? "仪表盘"
      : isPopupMode
        ? "组合弹窗"
        : "页面画布"),
    deps.renderWorkspaceResolution(),
    deps.unbindDisplayDeviceError(),
    deps.refreshSoundToggle());
  for (const [modeToggleButton, modeToggleActive] of [
    [deps.showEditorPreviewButtonElement, isEditingPage],
    [deps.showDashboardPreviewButtonElement, isDashboardMode],
  ])
    (modeToggleButton.classList.toggle("active", modeToggleActive),
      modeToggleButton.setAttribute("aria-selected", String(modeToggleActive)));
  isEditingPage
    ? (deps.runSlot(),
      deps.editorCtx.activeProject?.document?.pages?.length &&
        (deps.ensureEditorRenderer().setDocument(deps.editorCtx.activeProject.document, deps.pageSelectElement.value),
        deps.editorCtx.editorRenderer.setSelectedComponents([...deps.editorCtx.selectedComponentIdsSet], deps.editorCtx.selectedComponentId)),
      window.requestAnimationFrame(deps.resizeWorkspaceCanvas))
    : isDashboardMode
      ? (deps.editorCtx.editorRenderer?.destroy(),
        (deps.editorCtx.editorRenderer = null),
        deps.runCase(),
        window.requestAnimationFrame(() => deps.editorCtx.dashboardPreviewRenderer?.resize()))
      : isPopupMode &&
        (deps.clearComponentSelection(),
        deps.renderComponentLists(),
        deps.coverMotorButtonElement(),
        deps.editorCtx.editorRenderer?.destroy(),
        (deps.editorCtx.editorRenderer = null),
        deps.runSlot(),
        deps.renderCustomPopupEditor());
}

export function syncDefaultPageAction(deps: WorkspaceDocumentDeps, hasPages = !!deps.editorCtx.activeProject?.document?.pages?.length) {
  if (deps.defaultPageActionElement) {
    const ct2 = deps.currentPage(),
      isCurrentDefaultPage = !!(ct2 && deps.editorCtx.activeProject?.document?.defaultPagePath === ct2.path);
    ((deps.defaultPageActionElement.textContent = isCurrentDefaultPage
      ? "已是默认首屏"
      : "设为默认首屏"),
      (deps.defaultPageActionElement.disabled = !hasPages || isCurrentDefaultPage));
  }
}

export function setPageControlsEnabled(deps: WorkspaceDocumentDeps, controlsEnabled: any) {
  ((deps.pageSelectElement.disabled = !controlsEnabled),
    (deps.pageActionsButtonElement.disabled = !controlsEnabled),
    deps.syncDefaultPageAction(controlsEnabled),
    deps.syncAddComponentButton(),
    deps.loadNavigationIconOptions(deps.pageSelectElement),
    controlsEnabled || deps.value());
}

export function resizeWorkspaceCanvas(deps: WorkspaceDocumentDeps) {
  if (!deps.editorCtx.activeProject) return;
  const computedStyle = window.getComputedStyle(deps.displayDeviceCountElement),
    availableWidthPx =
      deps.displayDeviceCountElement.clientWidth -
      Number.parseFloat(computedStyle.paddingLeft) -
      Number.parseFloat(computedStyle.paddingRight),
    availableHeightPx =
      deps.displayDeviceCountElement.clientHeight -
      Number.parseFloat(computedStyle.paddingTop) -
      Number.parseFloat(computedStyle.paddingBottom),
    canvasWidthPx = deps.editorCtx.activeProject.document.canvas.width || 2778,
    canvasHeightPx = deps.editorCtx.activeProject.document.canvas.height || 1940,
    canvasAspectRatio = canvasWidthPx / canvasHeightPx,
    isHeightLimited = availableWidthPx / availableHeightPx > canvasAspectRatio,
    renderWidthPx = isHeightLimited ? availableHeightPx * canvasAspectRatio : availableWidthPx,
    renderHeightPx = isHeightLimited ? availableHeightPx : availableWidthPx / canvasAspectRatio;
  ((deps.editorCanvasElement.style.width = Math.max(1, renderWidthPx) + "px"),
    (deps.editorCanvasElement.style.height = Math.max(1, renderHeightPx) + "px"),
    (deps.dashboardPreviewElement.style.width = Math.max(1, renderWidthPx) + "px"),
    (deps.dashboardPreviewElement.style.height = Math.max(1, renderHeightPx) + "px"),
    window.requestAnimationFrame(() => {
      (deps.editorCtx.editorRenderer?.resize(), deps.editorCtx.dashboardPreviewRenderer?.resize());
    }));
}

export function ensureMarqueeOverlay(deps: WorkspaceDocumentDeps) {
  let overlay = deps.editorCanvasElement.querySelector(".sc-marquee") as HTMLDivElement | null;
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.className = "sc-marquee";
    overlay.hidden = true;
    deps.editorCanvasElement.appendChild(overlay);
  }
  return overlay;
}

export function currentPage(deps: WorkspaceDocumentDeps) {
  return (
    deps.editorCtx.activeProject?.document?.pages?.find(
      (pageEntryCandidate: any) => pageEntryCandidate.path === deps.pageSelectElement.value,
    ) ||
    deps.editorCtx.activeProject?.document?.pages?.[0] ||
    null
  );
}

export function groupSelectedComponents(deps: WorkspaceDocumentDeps, requestedComponentIds: any) {
  const groupedComponentIds = [...new Set(requestedComponentIds || [])];
  if (!canGroupComponents2(groupedComponentIds, deps.editorCtx.activeProject?.document)) {
    deps.handleOperationError(new Error("请选择同一页面或同一侧边栏中的两个或更多控件后再成组。"));
    return;
  }
  const newGroupId = newId2("group");
  return (
    (deps.editorCtx.selectedComponentId = newGroupId),
    (deps.editorCtx.selectedComponentIdsSet = new Set([newGroupId])),
    (deps.editorCtx.selectionAnchorComponentId = newGroupId),
    (deps.editorCtx.activeGroupId = null),
    deps.mutateDocument((groupDocument: any) => {
      const groupComponentLocations = groupedComponentIds.map((groupIdItem) =>
        componentDirectLocation2(groupDocument, groupIdItem),
      );
      if (groupComponentLocations.some((resolvedLocation) => !resolvedLocation)) return;
      const collection = groupComponentLocations[0].collection,
        sort = groupComponentLocations
          .map((componentLocationItem) => componentLocationItem.component)
          .sort(
            (componentA, componentB) =>
              collection.indexOf(componentA) - collection.indexOf(componentB),
          ),
        memberBounds = sort.map((boundsMemberComponent) => componentBounds2(boundsMemberComponent)),
        groupMinLeft = Math.min(...memberBounds.map((minLeftBounds) => minLeftBounds.left)),
        groupMinTop = Math.min(...memberBounds.map((minTopBounds) => minTopBounds.top)),
        groupMaxRight = Math.max(...memberBounds.map((maxRightBounds) => maxRightBounds.right)),
        groupMaxBottom = Math.max(...memberBounds.map((maxBottomBounds) => maxBottomBounds.bottom)),
        groupInsertIndex = Math.min(
          ...sort.map((insertMemberComponent) => collection.indexOf(insertMemberComponent)),
        ),
        groupChildComponents = sort.map((childSourceComponent) => ({
          ...childSourceComponent,
          position: {
            ...(childSourceComponent.position || {}),
            x: Number(childSourceComponent.position?.x || 0) - groupMinLeft,
            y: Number(childSourceComponent.position?.y || 0) - groupMinTop,
          },
        })),
        groupComponent = {
          id: newGroupId,
          type: "group",
          componentVersion: 1,
          position: {
            x: groupMinLeft,
            y: groupMinTop,
            width: Math.max(1, groupMaxRight - groupMinLeft),
            height: Math.max(1, groupMaxBottom - groupMinTop),
            rotation: 0,
            zIndex: 1,
          },
          properties: {
            label: groupNameForCollection2(collection),
          },
          bindings: {} as Record<string, any>,
          actions: {} as Record<string, any>,
          style: {} as Record<string, any>,
          children: groupChildComponents,
        },
        set = new Set(groupedComponentIds),
        filter = collection.filter((collectionComponent: any) => !set.has(collectionComponent.id));
      if (
        (filter.splice(Math.min(groupInsertIndex, filter.length), 0, groupComponent),
        collection.splice(0, collection.length, ...filter),
        applyCollectionLayerOrder2(collection),
        groupComponentLocations[0].scope === "shared")
      ) {
        for (const sharedSyncPageEntry of groupDocument.pages || []) {
          const pageSharedIds = sharedSyncPageEntry.sharedComponentIds || [],
            matchedSharedIndexes = pageSharedIds
              .map((sharedIdEntry: any, sharedIdIndex: any) => (set.has(sharedIdEntry) ? sharedIdIndex : -1))
              .filter((sharedIndex: any) => sharedIndex >= 0);
          if (!matchedSharedIndexes.length) continue;
          const firstSharedIndex = Math.min(...matchedSharedIndexes),
            remainingSharedIds = pageSharedIds.filter(
              (remainingSharedIdEntry: any) => !set.has(remainingSharedIdEntry),
            );
          (remainingSharedIds.splice(
            Math.min(firstSharedIndex, remainingSharedIds.length),
            0,
            newGroupId,
          ),
            (sharedSyncPageEntry.sharedComponentIds = [...new Set(remainingSharedIds)]));
        }
        syncSharedComponentReferenceOrder2(groupDocument);
      }
    })
  );
}

export function ungroupComponent(deps: WorkspaceDocumentDeps, groupIdToUngroup: any) {
  const groupLocationEntry = findComponentLocation2(deps.editorCtx.activeProject?.document, groupIdToUngroup);
  if (!groupLocationEntry || groupLocationEntry.component.type !== "group") return;
  const groupChildIds = (groupLocationEntry.component.children || []).map(
    (groupChildComponent: any) => groupChildComponent.id,
  );
  ((deps.editorCtx.selectedComponentId = groupChildIds[0] || null),
    (deps.editorCtx.selectedComponentIdsSet = new Set(groupChildIds)),
    (deps.editorCtx.selectionAnchorComponentId = deps.editorCtx.selectedComponentId),
    (deps.editorCtx.activeGroupId = null),
    deps.mutateDocument((ungroupDocument: any) => {
      const ungroupLocation = findComponentLocation2(ungroupDocument, groupIdToUngroup);
      if (!ungroupLocation || ungroupLocation.component.type !== "group") return;
      const groupPosition = ungroupLocation.component.position || {},
        groupStyle = ungroupLocation.component.style || {},
        groupRotationDeg = Number(groupPosition.rotation || 0),
        groupScale = Math.max(0.01, Math.min(5, Number(groupStyle.scale || 1))),
        groupRotationRad = (groupRotationDeg * Math.PI) / 180,
        cos = Math.cos(groupRotationRad),
        sin = Math.sin(groupRotationRad),
        groupWidthPx = Number(groupPosition.width || 100),
        groupHeightPx = Number(groupPosition.height || 100),
        groupCenterX = Number(groupPosition.x || 0) + groupWidthPx / 2,
        groupCenterY = Number(groupPosition.y || 0) + groupHeightPx / 2,
        ungroupedChildren = (ungroupLocation.component.children || []).map(
          (ungroupChildComponent: any) => {
            const childPosition = ungroupChildComponent.position || {},
              childWidthPx = Number(childPosition.width || 100),
              childHeightPx = Number(childPosition.height || 100),
              childOffsetX = Number(childPosition.x || 0) + childWidthPx / 2 - groupWidthPx / 2,
              childOffsetY = Number(childPosition.y || 0) + childHeightPx / 2 - groupHeightPx / 2,
              childScaledOffsetX = childOffsetX * groupScale,
              childScaledOffsetY = childOffsetY * groupScale,
              childRotatedX = groupCenterX + childScaledOffsetX * cos - childScaledOffsetY * sin,
              childRotatedY = groupCenterY + childScaledOffsetX * sin + childScaledOffsetY * cos,
              childStyle = {
                ...(ungroupChildComponent.style || {}),
              },
              childNextScale = Math.max(
                0.01,
                Math.min(5, Number(childStyle.scale || 1) * groupScale),
              );
            return (
              groupStyle.visible === false && (childStyle.visible = false),
              (childStyle.scale = childNextScale),
              {
                ...ungroupChildComponent,
                position: {
                  ...childPosition,
                  x: childRotatedX - childWidthPx / 2,
                  y: childRotatedY - childHeightPx / 2,
                  rotation: Number(childPosition.rotation || 0) + groupRotationDeg,
                },
                style: childStyle,
              }
            );
          },
        );
      if (
        (ungroupLocation.collection.splice(ungroupLocation.index, 1, ...ungroupedChildren),
        applyCollectionLayerOrder2(ungroupLocation.collection),
        ungroupLocation.scope === "shared" && ungroupLocation.root)
      ) {
        for (const ungroupPageEntry of ungroupDocument.pages || []) {
          const ungroupPageSharedIds = ungroupPageEntry.sharedComponentIds || [],
            indexOf2 = ungroupPageSharedIds.indexOf(groupIdToUngroup);
          indexOf2 < 0 ||
            (ungroupPageSharedIds.splice(
              indexOf2,
              1,
              ...ungroupedChildren.map((ungroupedChild: any) => ungroupedChild.id),
            ),
            (ungroupPageEntry.sharedComponentIds = [...new Set(ungroupPageSharedIds)]));
        }
        syncSharedComponentReferenceOrder2(ungroupDocument);
      }
    }));
}

export function openGroupRenameDialog(deps: WorkspaceDocumentDeps, renameGroupId: any) {
  const groupComponentForRename = findComponent2(deps.editorCtx.activeProject?.document, renameGroupId)?.component;
  !groupComponentForRename ||
    groupComponentForRename.type !== "group" ||
    ((deps.componentGroupRenameDialogElement.dataset.groupId = renameGroupId),
    (deps.componentGroupRenameInputElement.value = componentLabel2(groupComponentForRename)),
    deps.setSettingsMessage(deps.componentGroupRenameMessageElement, ""),
    deps.componentGroupRenameDialogElement.showModal(),
    window.setTimeout(() => deps.componentGroupRenameInputElement.focus(), 0));
}

export function normalizeHexColor(deps: WorkspaceDocumentDeps, colorValue: any) {
  const lowerCase = String(colorValue || "")
    .trim()
    .toLowerCase();
  return /^#[\da-f]{6}$/.test(lowerCase) ? lowerCase : "";
}

export function removedComponent(deps: WorkspaceDocumentDeps) {
  return findComponent2(deps.editorCtx.activeProject?.document, deps.editorCtx.selectedComponentId)?.component || null;
}

export function removalPageEntry(deps: WorkspaceDocumentDeps, remainingSharedId: any) {
  return [...new Set(remainingSharedId || [])].filter(
    (selectedComponent) => !!findComponent2(deps.editorCtx.activeProject?.document, selectedComponent)?.component,
  );
}

export function componentListForScope(deps: WorkspaceDocumentDeps, groupListScope: any) {
  if (deps.editorCtx.activeGroupId) {
    const groupScopeComponent = findComponent2(deps.editorCtx.activeProject?.document, deps.editorCtx.activeGroupId)?.component;
    if (groupScopeComponent?.type === "group") return groupScopeComponent.children || [];
  }
  return groupListScope === "shared"
    ? deps.editorCtx.activeProject?.document?.sharedComponents || []
    : deps.currentPage()?.components || [];
}

export function collectComponentsByType(deps: WorkspaceDocumentDeps, componentTreeNode: any, componentTypeFilter: any, collectedComponents: any[] = []) {
  for (const treeComponent of componentTreeNode || [])
    (treeComponent?.type === componentTypeFilter && collectedComponents.push(treeComponent),
      collectComponentsByType(deps, treeComponent?.children, componentTypeFilter, collectedComponents));
  return collectedComponents;
}

export function findPageComponentsByType(deps: WorkspaceDocumentDeps, typeFilter: any) {
  return (deps.editorCtx.activeProject?.document?.pages || []).flatMap((typeMatchPage: any) =>
    deps.collectComponentsByType(typeMatchPage.components, typeFilter).map((matchedComponent) => ({
      component: matchedComponent,
      page: typeMatchPage,
    })),
  );
}

export function findReplaceableComponents(deps: WorkspaceDocumentDeps, sourceComponent: any) {
  if (!sourceComponent) return [];
  const rr2 = deps.runAuxBackup(sourceComponent);
  return [
    ...deps.collectComponentsByType(deps.editorCtx.activeProject?.document?.sharedComponents, sourceComponent.type).map(
      (sharedComponent) => ({
        component: sharedComponent,
        scope: "shared",
      }),
    ),
    ...deps.findPageComponentsByType(sourceComponent.type).map((pageMatch: any) => ({
      ...pageMatch,
      scope: "page",
    })),
  ].filter(
    ({ component: filterMatch }) =>
      filterMatch.id !== sourceComponent.id &&
      (sourceComponent.type !== "presence-sensor" || deps.runAuxBackup(filterMatch) === rr2),
  );
}

export function syncRendererSelection(deps: WorkspaceDocumentDeps) {
  (deps.editorCtx.editorRenderer?.setActiveGroup(deps.editorCtx.activeGroupId),
    deps.editorCtx.editorRenderer?.setSelectedComponents([...deps.editorCtx.selectedComponentIdsSet], deps.editorCtx.selectedComponentId));
}

export function clearComponentSelection(deps: WorkspaceDocumentDeps) {
  (deps.resetPreviewStates(),
    (deps.editorCtx.selectedComponentId = null),
    (deps.editorCtx.selectedComponentIdsSet = new Set()),
    (deps.editorCtx.selectionAnchorComponentId = null));
}

export function resetPreviewStates(deps: WorkspaceDocumentDeps) {
  for (const previewStateMap of [
    deps.navigationPreviewStateByComponentId,
    deps.iconButtonEffectPreviewStateByComponentId,
    deps.iconButtonPreviewStateByComponentId,
    deps.airConditionerPreviewStateByComponentId,
  ]) {
    for (const previewStateComponentId of previewStateMap.keys())
      deps.editorCtx.editorRenderer?.setComponentPreviewState(previewStateComponentId, "auto");
    previewStateMap.clear();
  }
}

export function selectComponent(deps: WorkspaceDocumentDeps, 
  clickedComponentId: any,
  {
    toggle: toggleSelection = false,
    range: rangeSelection = false,
    preserveGroup: preserveGroupSelection = false,
  } = {},
) {
  const clickedLocation = findComponent2(deps.editorCtx.activeProject?.document, clickedComponentId);
  if (!clickedLocation) {
    (deps.clearComponentSelection(),
      deps.syncRendererSelection(),
      deps.renderComponentLists(),
      deps.coverMotorButtonElement());
    return;
  }
  const anchorComponentLocation = findComponent2(deps.editorCtx.activeProject?.document, deps.editorCtx.selectedComponentId),
    isSameComponentScope =
      anchorComponentLocation?.scope === clickedLocation.scope &&
      (clickedLocation.scope !== "page" ||
        anchorComponentLocation.page?.path === clickedLocation.page?.path);
  if (preserveGroupSelection && deps.editorCtx.selectedComponentIdsSet.has(clickedComponentId))
    deps.editorCtx.selectedComponentId = clickedComponentId;
  else {
    if (rangeSelection && isSameComponentScope && deps.editorCtx.selectionAnchorComponentId) {
      const bE2 = deps.componentListForScope(clickedLocation.scope),
        index = bE2.findIndex(
          (anchorListComponent: any) => anchorListComponent.id === deps.editorCtx.selectionAnchorComponentId,
        ),
        clickedIndexInList = bE2.findIndex(
          (clickedListComponent: any) => clickedListComponent.id === clickedComponentId,
        );
      if (index >= 0 && clickedIndexInList >= 0) {
        const [rangeStartIndex, rangeEndIndex] =
          index <= clickedIndexInList ? [index, clickedIndexInList] : [clickedIndexInList, index];
        ((deps.editorCtx.selectedComponentIdsSet = new Set(
          bE2
            .slice(rangeStartIndex, rangeEndIndex + 1)
            .map((rangedComponent: any) => rangedComponent.id),
        )),
          (deps.editorCtx.selectedComponentId = clickedComponentId));
      } else
        ((deps.editorCtx.selectedComponentIdsSet = new Set([clickedComponentId])),
          (deps.editorCtx.selectedComponentId = clickedComponentId),
          (deps.editorCtx.selectionAnchorComponentId = clickedComponentId));
    } else {
      if (toggleSelection && isSameComponentScope) {
        const toggledSelectionSet = new Set(deps.editorCtx.selectedComponentIdsSet);
        (toggledSelectionSet.has(clickedComponentId)
          ? toggledSelectionSet.delete(clickedComponentId)
          : toggledSelectionSet.add(clickedComponentId),
          (deps.editorCtx.selectedComponentIdsSet = toggledSelectionSet),
          (deps.editorCtx.selectedComponentId = toggledSelectionSet.has(clickedComponentId)
            ? clickedComponentId
            : toggledSelectionSet.values().next().value || null),
          (deps.editorCtx.selectionAnchorComponentId = clickedComponentId));
      } else
        !toggleSelection &&
        !rangeSelection &&
        deps.editorCtx.selectedComponentIdsSet.size === 1 &&
        deps.editorCtx.selectedComponentIdsSet.has(clickedComponentId)
          ? deps.clearComponentSelection()
          : ((deps.editorCtx.selectedComponentIdsSet = new Set([clickedComponentId])),
            (deps.editorCtx.selectedComponentId = clickedComponentId),
            (deps.editorCtx.selectionAnchorComponentId = clickedComponentId));
    }
  }
  if (clickedLocation.scope === "shared" && deps.currentPage()?.path) {
    const pendingDocument = clone2(deps.editorCtx.activeProject.document);
    ensureSharedComponentReference2(pendingDocument, clickedComponentId, deps.currentPage().path) &&
      deps.projectSummary(pendingDocument, deps.currentPage().path).catch(deps.handleOperationError);
  }
  (deps.editorCtx.selectedComponentId && deps.setComponentScope(clickedLocation.scope),
    deps.syncRendererSelection(),
    deps.renderComponentLists(),
    deps.coverMotorButtonElement());
}

export function mutateDocument(deps: WorkspaceDocumentDeps, 
  documentMutator: any,
  writePagePath = deps.pageSelectElement.value,
  { throwOnError: throwOnWriteError = false } = {},
) {
  const throwOnWriteErrorState = deps.editorCtx.activeProject?.projectId,
    Ie2 = deps.editorCtx.componentScopeState,
    queuedWriteHandler = () =>
      deps.editorCtx.componentScopeState === Ie2 && deps.editorCtx.activeProject?.projectId === throwOnWriteErrorState,
    caughtError = deps.editorCtx.writeQueuePromise
      .catch(() => {})
      .then(async () => {
        if (!queuedWriteHandler()) return;
        if (!deps.editorCtx.activeProject) throw new Error("请先选择仪表盘。");
        const queuedWrite = documentSignature2(deps.editorCtx.activeProject.document),
          workingDocument = clone2(deps.editorCtx.activeProject.document),
          mutatorResult = await documentMutator(workingDocument);
        if (!(
          !queuedWriteHandler() ||
          !(await deps.projectSummary(workingDocument, writePagePath, {
            expectedSignature: queuedWrite,
          }))
        ))
          return mutatorResult;
      })
      .catch((nudgeSelectedComponents: any) => {
        if (queuedWriteHandler()) throw nudgeSelectedComponents;
      });
  return (
    (deps.editorCtx.writeQueuePromise = caughtError.catch(deps.handleOperationError)),
    throwOnWriteError ? caughtError : deps.editorCtx.writeQueuePromise
  );
}

