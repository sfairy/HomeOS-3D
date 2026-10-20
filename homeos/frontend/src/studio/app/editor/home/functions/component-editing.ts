/* 组件编辑（选择、复制/删除、列表与模板、组件菜单） */
import type { EditorContext } from "../editor-context";
import { findComponent as findComponent2, findComponentLocation as findComponentLocation2 } from "../../component-tree";
import { clampNumber as clampNumber2, visibilityIconSvg as visibilityIconSvg2 } from "../../editor-utils";
import { componentBounds as componentBounds2 } from "../../editor-selection-tools";
import { canGroupComponents as canGroupComponents2, componentLabel as componentLabel2, applyCollectionLayerOrder as applyCollectionLayerOrder2, syncSharedComponentReferenceOrder as syncSharedComponentReferenceOrder2 } from "../../editor-component-collections";
import { copyComponentTargets as copyComponentTargets2 } from "../../component-page-copy";
import { duplicateComponent } from "../../editor-component-collections";
import { listComponentTemplates as listComponentTemplates2 } from "../../component-templates";
import { renderInteraction3dThumbnail as renderInteraction3dThumbnail2, updateInteraction3dCard as updateInteraction3dCard2 } from "../../../bridge/editor";

export interface ComponentEditingDeps {
  editorCtx: EditorContext;
  addComponentButtonElement: any;
  clearComponentSelection: any;
  componentMenuElement: any;
  componentTemplateListElement: any;
  componentTemplateScopeElement: any;
  copyComponentPageDialogElement: any;
  copyComponentPageFormElement: any;
  copyComponentPageMessageElement: any;
  copyComponentPageNameElement: any;
  copyComponentPageProjectFieldElement: any;
  copyComponentPageProjectSelectElement: any;
  copyComponentPageScopeSelectElement: any;
  copyComponentPageSubmitElement: any;
  copyComponentPageTargetElement: any;
  copyComponentPageTargetLabelElement: any;
  copyComponentResolutionSummaryElement: any;
  copyComponentScaleOptionsElement: any;
  copyComponentSuccessDialogElement: any;
  copyComponentSuccessMessageElement: any;
  copyTargetsForDocument: any;
  coverMotorButtonElement: any;
  currentPage: any;
  deleteComponentDialogElement: any;
  deleteComponentNameElement: any;
  findCommonCopyTargets: any;
  getDocumentCanvasSize: any;
  handleOperationError: any;
  historyEntry: any;
  loadNavigationIconOptions: any;
  mutateDocument: any;
  openComponentMenu: any;
  pageComponentListElement: any;
  pageSelectElement: any;
  prependGroupBackButton: any;
  removalPageEntry: (...args: any[]) => any[];
  renderComponentList: any;
  renderComponentLists: any;
  renderCopyComponentDialog: any;
  renderCopyScaleOptions: any;
  renderCopyTargetOptions: any;
  requestJson: any;
  runStore: any;
  selectComponent: any;
  setComponentScope: any;
  setComponentsVisibility: any;
  setSettingsMessage: any;
  sharedComponentListElement: any;
  showPageComponentsElement: any;
  showSharedComponentsElement: any;
  syncAddComponentButton: any;
  syncRendererSelection: any;
}

export function scaledSelectionPlacements(deps: ComponentEditingDeps, targetSelectionScale: any) {
  if (deps.editorCtx.selectedComponentIdsSet.size < 2 || !deps.editorCtx.activeProject || !deps.editorCtx.selectedComponentId) return [];
  const selectedComponentsList = [...deps.editorCtx.selectedComponentIdsSet]
      .map(
        (selectedComponentIdItem) =>
          findComponent2(deps.editorCtx.activeProject.document, selectedComponentIdItem)?.component,
      )
      .filter(Boolean),
    primarySelectedComponent = selectedComponentsList.find(
      (primaryCandidateComponent) => primaryCandidateComponent.id === deps.editorCtx.selectedComponentId,
    );
  if (
    !primarySelectedComponent ||
    selectedComponentsList.length !== deps.editorCtx.selectedComponentIdsSet.size ||
    selectedComponentsList.some(
      (fillModeComponent) => fillModeComponent.properties?.layoutMode === "fill",
    )
  )
    return [];
  const primaryComponentScale = Math.max(
      0.01,
      Math.min(5, Number(primarySelectedComponent.style?.scale || 1)),
    ),
    requestedScaleRatio =
      Math.max(0.01, Math.min(5, Number(targetSelectionScale))) / primaryComponentScale,
    minAllowedRatio = Math.max(
      ...selectedComponentsList.map(
        (minRatioComponent) => 0.01 / Math.max(0.01, Number(minRatioComponent.style?.scale || 1)),
      ),
    ),
    maxAllowedRatio = Math.min(
      ...selectedComponentsList.map(
        (maxRatioComponent) => 5 / Math.max(0.01, Number(maxRatioComponent.style?.scale || 1)),
      ),
    ),
    appliedScaleRatio = clampNumber2(requestedScaleRatio, minAllowedRatio, maxAllowedRatio),
    selectionBoundsList = selectedComponentsList.map(componentBounds2),
    selectionAnchorX =
      (Math.min(...selectionBoundsList.map((leftBoundsItem) => leftBoundsItem.left)) +
        Math.max(...selectionBoundsList.map((rightBoundsItem) => rightBoundsItem.right))) /
      2,
    selectionAnchorY =
      (Math.min(...selectionBoundsList.map((topBoundsItem) => topBoundsItem.top)) +
        Math.max(...selectionBoundsList.map((bottomBoundsItem) => bottomBoundsItem.bottom))) /
      2;
  return selectedComponentsList.map((scaledComponent) => {
    const scaledComponentPosition = scaledComponent.position || {},
      scaledComponentWidth = Number(scaledComponentPosition.width || 100),
      scaledComponentHeight = Number(scaledComponentPosition.height || 100),
      scaledComponentCenterX = Number(scaledComponentPosition.x || 0) + scaledComponentWidth / 2,
      scaledComponentCenterY = Number(scaledComponentPosition.y || 0) + scaledComponentHeight / 2;
    return {
      componentId: scaledComponent.id,
      x:
        selectionAnchorX +
        (scaledComponentCenterX - selectionAnchorX) * appliedScaleRatio -
        scaledComponentWidth / 2,
      y:
        selectionAnchorY +
        (scaledComponentCenterY - selectionAnchorY) * appliedScaleRatio -
        scaledComponentHeight / 2,
      scale: Math.max(
        0.01,
        Math.min(5, Number(scaledComponent.style?.scale || 1) * appliedScaleRatio),
      ),
    };
  });
}

export function selectedComponentIdsFromDom(deps: ComponentEditingDeps) {
  const domSelectedIds = [...document.querySelectorAll<HTMLElement>(".element-item.selected[data-component-id]")]
    .map((elementItemElement) => elementItemElement.dataset.componentId)
    .filter(Boolean);
  return deps.editorCtx.selectedComponentIdsSet.size > 1 ? [...deps.editorCtx.selectedComponentIdsSet] : domSelectedIds;
}

export function setComponentsRotation(deps: ComponentEditingDeps, 
  rotationDocument: any,
  rotationComponentId: any,
  rotationDegrees: any,
  rotationComponentIds: any[] = [],
) {
  const rotationTargetIds =
    rotationComponentIds.length > 1 ? rotationComponentIds : [rotationComponentId];
  for (const rotationTargetId of rotationTargetIds) {
    const rotationComponent = findComponent2(rotationDocument, rotationTargetId)?.component;
    rotationComponent &&
      (rotationComponent.position = {
        ...(rotationComponent.position || {}),
        rotation: rotationDegrees,
      });
  }
}

export function setComponentsVisibility(deps: ComponentEditingDeps, visibilityComponentIds: any, visibilityTarget: any) {
  const nl3 = deps.removalPageEntry(visibilityComponentIds);
  nl3.length &&
    deps.mutateDocument((visibilityDocument: any) => {
      for (const visibilityComponentId of nl3) {
        const visibilityComponent = findComponent2(
          visibilityDocument,
          visibilityComponentId,
        )?.component;
        visibilityComponent &&
          (visibilityComponent.style = {
            ...(visibilityComponent.style || {}),
            visible: visibilityTarget,
          });
      }
    });
}

export function closeComponentMenu(deps: ComponentEditingDeps) {
  ((deps.componentMenuElement.hidden = true), (deps.editorCtx.menuComponentId = null));
}

export function openComponentMenu(deps: ComponentEditingDeps, menuEvent: any, openedMenuComponentId: any) {
  (menuEvent.preventDefault(), menuEvent.stopPropagation());
  (deps.selectComponent(openedMenuComponentId, {
    preserveGroup: true,
  }),
    (deps.editorCtx.menuComponentId = openedMenuComponentId));
  const menuCount = deps.editorCtx.selectedComponentIdsSet.has(openedMenuComponentId)
      ? [...deps.editorCtx.selectedComponentIdsSet]
      : [openedMenuComponentId],
    copyMenuButtonElement = menuCount.length,
    selector = deps.componentMenuElement.querySelector('[data-component-action="copy"]'),
    copyToPageMenuButtonElement = deps.componentMenuElement.querySelector(
      '[data-component-action="copy-to-page"]',
    ),
    visibilityMenuButtonElement = deps.componentMenuElement.querySelector(
      '[data-component-action="visibility"]',
    ),
    deleteMenuButtonElement = deps.componentMenuElement.querySelector(
      '[data-component-action="delete"]',
    ),
    groupMenuButtonElement = deps.componentMenuElement.querySelector('[data-component-action="group"]'),
    ungroupMenuButtonElement = deps.componentMenuElement.querySelector(
      '[data-component-action="ungroup"]',
    ),
    renameGroupMenuButtonElement = deps.componentMenuElement.querySelector(
      '[data-component-action="rename-group"]',
    ),
    menuTitleTextElement = deps.componentMenuElement.querySelector(":scope > strong");
  selector.textContent =
    copyMenuButtonElement > 1 ? "复制 " + copyMenuButtonElement + " 个控件" : "复制控件";
  const menuComponent = findComponent2(deps.editorCtx.activeProject?.document, openedMenuComponentId)?.component,
    menuVisibilityList = menuCount
      .map(
        (menuComponentIdItem) =>
          findComponent2(deps.editorCtx.activeProject?.document, menuComponentIdItem)?.component,
      )
      .filter(Boolean)
      .map((menuComponentItem) => menuComponentItem.style?.visible !== false),
    every =
      menuVisibilityList.length === menuCount.length &&
      menuVisibilityList.every((visibility) => visibility === menuVisibilityList[0]);
  ((visibilityMenuButtonElement.disabled = !every),
    (visibilityMenuButtonElement.textContent = every
      ? menuVisibilityList[0]
        ? copyMenuButtonElement > 1
          ? "批量隐藏 " + copyMenuButtonElement + " 个"
          : "隐藏控件"
        : copyMenuButtonElement > 1
          ? "批量显示 " + copyMenuButtonElement + " 个"
          : "显示控件"
      : "批量隐藏/显示"),
    (visibilityMenuButtonElement.title = every
      ? ""
      : "选中的控件包含隐藏和显示状态，无法批量处理"));
  const hasOtherProject = canGroupComponents2(menuCount, deps.editorCtx.activeProject?.document);
  ((groupMenuButtonElement.hidden = !hasOtherProject),
    (ungroupMenuButtonElement.hidden =
      menuComponent?.type !== "group" || copyMenuButtonElement !== 1),
    (renameGroupMenuButtonElement.hidden =
      menuComponent?.type !== "group" || copyMenuButtonElement !== 1),
    (copyToPageMenuButtonElement.textContent = "复制到其他区域"));
  const some = deps.editorCtx.projects.some(
      (menuProjectEntry: any) => menuProjectEntry.id !== deps.editorCtx.activeProject?.projectId,
    ),
    copyTargets = deps.findCommonCopyTargets(deps.editorCtx.activeProject?.document, menuCount);
  ((copyToPageMenuButtonElement.disabled = copyTargets.length === 0 && !some),
    (copyToPageMenuButtonElement.title = copyToPageMenuButtonElement.disabled
      ? "当前没有可复制的目标区域"
      : copyMenuButtonElement > 1
        ? "完整复制选中的 " + copyMenuButtonElement + " 个控件到其他页面、侧边栏或其他仪表盘"
        : "完整复制当前控件到其他页面、侧边栏或其他仪表盘"),
    (deleteMenuButtonElement.textContent =
      copyMenuButtonElement > 1 ? "删除 " + copyMenuButtonElement + " 个控件" : "删除控件"),
    (menuTitleTextElement.textContent =
      copyMenuButtonElement > 1 ? "颜色标签（" + copyMenuButtonElement + " 个控件）" : "颜色标签"));
  const labelColorValues = menuCount.map((labelColorComponentId) => {
      const labelColorComponent = findComponent2(
        deps.editorCtx.activeProject?.document,
        labelColorComponentId,
      )?.component;
      return deps.runStore(labelColorComponent?.style?.editorLabelColor);
    }),
    sharedLabelColor = labelColorValues.every(
      (labelColorValue) => labelColorValue === labelColorValues[0],
    )
      ? labelColorValues[0]
      : null;
  for (const labelColorButton of deps.componentMenuElement.querySelectorAll("[data-label-color]"))
    labelColorButton.classList.toggle(
      "active",
      sharedLabelColor !== null && labelColorButton.dataset.labelColor === sharedLabelColor,
    );
  ((deps.componentMenuElement.hidden = false),
    (deps.componentMenuElement.style.left = "0px"),
    (deps.componentMenuElement.style.top = "0px"),
    window.requestAnimationFrame(() => {
      const menuRect = deps.componentMenuElement.getBoundingClientRect(),
        menuLeftPx = clampNumber2(
          menuEvent.clientX,
          8,
          Math.max(8, window.innerWidth - menuRect.width - 8),
        ),
        menuTopPx = clampNumber2(
          menuEvent.clientY,
          8,
          Math.max(8, window.innerHeight - menuRect.height - 8),
        );
      ((deps.componentMenuElement.style.left = menuLeftPx + "px"),
        (deps.componentMenuElement.style.top = menuTopPx + "px"));
    }));
}

export function findCommonCopyTargets(deps: ComponentEditingDeps, copyTargetDocument: any, copySourceComponentIds: any) {
  const copySourceIds = [...new Set(copySourceComponentIds || [])].filter(Boolean);
  if (!copyTargetDocument || !copySourceIds.length) return [];
  const copyTargetKeysBySource = copySourceIds.map(
      (copySourceId) =>
        new Set(
          copyComponentTargets2(copyTargetDocument, copySourceId).map(
            (copyTargetEntry: any) => copyTargetEntry.key,
          ),
        ),
    ),
    commonCopyTargetKeys = [...(copyTargetKeysBySource[0] || [])].filter((copyTargetKey) =>
      copyTargetKeysBySource.every((copyTargetKeySet) => copyTargetKeySet.has(copyTargetKey)),
    ),
    copyTargetsOfFirst = copyComponentTargets2(copyTargetDocument, copySourceIds[0]);
  return commonCopyTargetKeys
    .map((matchedCopyTargetKey) =>
      copyTargetsOfFirst.find(
        (matchedCopyTargetEntry: any) => matchedCopyTargetEntry.key === matchedCopyTargetKey,
      ),
    )
    .filter(Boolean);
}

export function showCopySuccessDialog(deps: ComponentEditingDeps, copySuccessMessage: any, copySuccessTarget: any) {
  ((deps.editorCtx.copySuccessNavigationTarget = copySuccessTarget || null),
    (deps.copyComponentSuccessMessageElement.textContent = copySuccessMessage),
    deps.copyComponentSuccessDialogElement.showModal());
}

export async function handleCopySuccessConfirm(deps: ComponentEditingDeps) {
  const Ha2 = deps.editorCtx.copySuccessNavigationTarget;
  ((deps.editorCtx.copySuccessNavigationTarget = null),
    deps.copyComponentSuccessDialogElement.close(),
    Ha2 &&
      (Ha2.projectId && Ha2.projectId !== deps.editorCtx.activeProject?.projectId
        ? await deps.historyEntry(Ha2.projectId, Ha2.pagePath)
        : Ha2.pagePath &&
          Ha2.pagePath !== deps.pageSelectElement.value &&
          ((deps.pageSelectElement.value = Ha2.pagePath),
          deps.loadNavigationIconOptions(deps.pageSelectElement),
          deps.editorCtx.editorRenderer?.navigate(Ha2.pagePath),
          deps.editorCtx.dashboardPreviewRenderer?.navigate(Ha2.pagePath),
          deps.renderComponentLists(),
          deps.coverMotorButtonElement()),
      deps.setComponentScope(Ha2.scope)));
}

export function duplicateComponents(deps: ComponentEditingDeps, 
  duplicatedComponentIds: any,
  duplicateFocusComponentId = deps.editorCtx.selectedComponentId,
) {
  const nl4 = deps.removalPageEntry(duplicatedComponentIds);
  nl4.length &&
    deps.mutateDocument((duplicateDocument: any) => {
      const copyLocationByComponentId = new Map(
          nl4.map((duplicateComponentId) => [
            duplicateComponentId,
            findComponentLocation2(duplicateDocument, duplicateComponentId),
          ]),
        ),
        sort2 = nl4
          .filter((sortedDuplicateComponentId) =>
            copyLocationByComponentId.get(sortedDuplicateComponentId),
          )
          .sort((duplicateIdA, duplicateIdB) => {
            const locationOfA = copyLocationByComponentId.get(duplicateIdA),
              locationOfB = copyLocationByComponentId.get(duplicateIdB);
            return locationOfA.collection === locationOfB.collection
              ? locationOfA.index - locationOfB.index
              : 0;
          }),
        createdDuplicateIds: any[] = [],
        newIdBySourceId = new Map();
      for (const duplicateSourceId of sort2) {
        const tp2 = duplicateComponent(duplicateDocument, duplicateSourceId);
        tp2 && (createdDuplicateIds.push(tp2.id), newIdBySourceId.set(duplicateSourceId, tp2.id));
      }
      createdDuplicateIds.length &&
        ((deps.editorCtx.selectedComponentId =
          newIdBySourceId.get(duplicateFocusComponentId) || createdDuplicateIds[0]),
        (deps.editorCtx.selectedComponentIdsSet = new Set(createdDuplicateIds)),
        (deps.editorCtx.selectionAnchorComponentId = deps.editorCtx.selectedComponentId));
    });
}

export function copyTargetsForDocument(deps: ComponentEditingDeps, 
  copyTargetSourceDocument: any,
  {
    includeShared: includeSharedTargets = true,
    sourceComponentId: explicitSourceComponentId = null,
  }: any = {},
) {
  if (!copyTargetSourceDocument) return [];
  if (explicitSourceComponentId)
    return copyComponentTargets2(copyTargetSourceDocument, explicitSourceComponentId);
  const pageCopyTargets = (copyTargetSourceDocument.pages || []).map((copyTargetPage: any) => ({
    key: "page:" + copyTargetPage.path,
    name: copyTargetPage.name,
    scope: "page",
    page: copyTargetPage,
  }));
  return includeSharedTargets
    ? [
        {
          key: "shared",
          name: "侧边栏",
          scope: "shared",
        },
        ...pageCopyTargets,
      ]
    : pageCopyTargets;
}

export function renderCopyTargetOptions(deps: ComponentEditingDeps, copyTargetOptionList: any) {
  (deps.copyComponentPageTargetElement.replaceChildren(
    ...copyTargetOptionList.map(
      (copyTargetOption: any) => new Option(copyTargetOption.name, copyTargetOption.key),
    ),
  ),
    (deps.copyComponentPageTargetElement.disabled = !copyTargetOptionList.length),
    (deps.copyComponentPageTargetElement.value = copyTargetOptionList[0]?.key || ""),
    deps.loadNavigationIconOptions(deps.copyComponentPageTargetElement));
}

export function getDocumentCanvasSize(deps: ComponentEditingDeps, canvasSizeDocument: any) {
  return {
    width: Number(canvasSizeDocument?.canvas?.width || 2778),
    height: Number(canvasSizeDocument?.canvas?.height || 1940),
  };
}

export function renderCopyScaleOptions(deps: ComponentEditingDeps) {
  if (!(deps.copyComponentPageScopeSelectElement.value === "other" && deps.editorCtx.copyTargetDraft)) {
    ((deps.copyComponentScaleOptionsElement.hidden = true),
      (deps.copyComponentResolutionSummaryElement.textContent = ""));
    return;
  }
  const sourceCanvasSize = deps.getDocumentCanvasSize(deps.editorCtx.activeProject?.document),
    targetCanvasSize = deps.getDocumentCanvasSize(deps.editorCtx.copyTargetDraft.document),
    canvasSizeMismatch =
      sourceCanvasSize.width !== targetCanvasSize.width ||
      sourceCanvasSize.height !== targetCanvasSize.height;
  ((deps.copyComponentScaleOptionsElement.hidden = !canvasSizeMismatch),
    (deps.copyComponentResolutionSummaryElement.textContent = canvasSizeMismatch
      ? sourceCanvasSize.width +
        " × " +
        sourceCanvasSize.height +
        " → " +
        targetCanvasSize.width +
        " × " +
        targetCanvasSize.height
      : ""));
}

export async function renderCopyComponentDialog(deps: ComponentEditingDeps) {
  const isOtherProjectTarget = deps.copyComponentPageScopeSelectElement.value === "other";
  let copyDialogComponentIds: any[] = [];
  try {
    copyDialogComponentIds = JSON.parse(
      deps.copyComponentPageDialogElement.dataset.componentIds || "[]",
    );
  } catch {
    copyDialogComponentIds = [];
  }
  const copyDialogFirstLocation = findComponent2(
      deps.editorCtx.activeProject?.document,
      copyDialogComponentIds[0],
    ),
    copyDialogComponentCount = copyDialogComponentIds.length,
    copyDialogDescriptionElement = deps.copyComponentPageDialogElement.querySelector(
      "[data-copy-component-description]",
    );
  if (
    ((deps.copyComponentPageProjectFieldElement.hidden = !isOtherProjectTarget),
    (deps.copyComponentPageTargetLabelElement.textContent = isOtherProjectTarget
      ? "其他仪表盘目标页面"
      : "本仪表盘目标页面"),
    (deps.copyComponentPageSubmitElement.textContent = isOtherProjectTarget
      ? "复制到目标仪表盘"
      : "复制并前往"),
    (copyDialogDescriptionElement.textContent = isOtherProjectTarget
      ? "将选中的 " +
        copyDialogComponentCount +
        " 个控件完整复制到其他仪表盘的目标页面或侧边栏，源控件不受影响。"
      : copyDialogFirstLocation?.scope === "shared"
        ? "将选中的 " +
          copyDialogComponentCount +
          " 个侧边栏控件完整复制到指定主页面，复制后为该页面的独立控件。"
        : "将选中的 " +
          copyDialogComponentCount +
          " 个控件完整复制到侧边栏或其他主页面，保留位置、尺寸、样式、实体绑定和动作配置。"),
    (deps.editorCtx.copyTargetDraft = null),
    (deps.copyComponentScaleOptionsElement.hidden = true),
    deps.setSettingsMessage(deps.copyComponentPageMessageElement, ""),
    !isOtherProjectTarget)
  ) {
    const localCopyTargets = deps.findCommonCopyTargets(deps.editorCtx.activeProject?.document, copyDialogComponentIds);
    (deps.renderCopyTargetOptions(localCopyTargets),
      (deps.copyComponentPageSubmitElement.disabled = !localCopyTargets.length));
    return;
  }
  const targetProjectId = deps.copyComponentPageProjectSelectElement.value;
  if (!targetProjectId) {
    (deps.renderCopyTargetOptions([]),
      (deps.copyComponentPageSubmitElement.disabled = true),
      deps.setSettingsMessage(deps.copyComponentPageMessageElement, "当前没有其他仪表盘可以复制。"));
    return;
  }
  const copyTargetLoadTokenSnapshot = ++deps.editorCtx.copyTargetLoadToken;
  (deps.renderCopyTargetOptions([]),
    (deps.copyComponentPageSubmitElement.disabled = true),
    deps.setSettingsMessage(deps.copyComponentPageMessageElement, "正在读取目标仪表盘…"));
  try {
    const targetDraftResponse = await deps.requestJson(
      "/projects/" + encodeURIComponent(targetProjectId) + "/draft",
    );
    if (
      copyTargetLoadTokenSnapshot !== deps.editorCtx.copyTargetLoadToken ||
      deps.copyComponentPageScopeSelectElement.value !== "other"
    )
      return;
    deps.editorCtx.copyTargetDraft = targetDraftResponse;
    const wE2 = deps.copyTargetsForDocument(targetDraftResponse.document);
    (deps.renderCopyTargetOptions(wE2),
      deps.renderCopyScaleOptions(),
      deps.setSettingsMessage(
        deps.copyComponentPageMessageElement,
        wE2.length ? "" : "目标仪表盘还没有可复制到的区域。",
      ),
      (deps.copyComponentPageSubmitElement.disabled = !wE2.length));
  } catch (copyTargetLoadError: any) {
    if (copyTargetLoadTokenSnapshot !== deps.editorCtx.copyTargetLoadToken) return;
    deps.setSettingsMessage(deps.copyComponentPageMessageElement, copyTargetLoadError.message, "error");
  }
}

export function openCopyComponentDialog(deps: ComponentEditingDeps, copyComponentSelectionIds: any) {
  const copySourceDocument = deps.editorCtx.activeProject?.document,
    validCopyComponentIds = [...new Set(copyComponentSelectionIds || [])].filter(
      (copyComponentId) => findComponent2(copySourceDocument, copyComponentId),
    ),
    copyAnchorLocation = findComponent2(copySourceDocument, validCopyComponentIds[0]);
  if (!copyAnchorLocation || !validCopyComponentIds.length) {
    deps.handleOperationError(new Error("没有找到要复制的控件。"));
    return;
  }
  ((deps.copyComponentPageDialogElement.dataset.componentIds = JSON.stringify(validCopyComponentIds)),
    (deps.copyComponentPageNameElement.textContent =
      validCopyComponentIds.length > 1
        ? "已选择 " + validCopyComponentIds.length + " 个控件"
        : "“" + componentLabel2(copyAnchorLocation.component) + "”"),
    (deps.copyComponentPageDialogElement.querySelector("[data-copy-component-description]").textContent =
      validCopyComponentIds.length > 1
        ? "将选中的 " + validCopyComponentIds.length + " 个控件完整复制到目标区域。"
        : copyAnchorLocation.scope === "shared"
          ? "将侧边栏控件完整复制到指定主页面，复制后为该页面的独立控件。"
          : "将当前控件完整复制到侧边栏或其他主页面，保留位置、尺寸、样式、实体绑定和动作配置。"),
    (deps.copyComponentPageScopeSelectElement.value = "current"),
    deps.loadNavigationIconOptions(deps.copyComponentPageScopeSelectElement));
  const otherProjectList = deps.editorCtx.projects.filter(
    (otherProjectOption: any) => otherProjectOption.id !== deps.editorCtx.activeProject.projectId,
  );
  (deps.copyComponentPageProjectSelectElement.replaceChildren(
    ...otherProjectList.map(
      (openDeleteComponentDialog: any) =>
        new Option(openDeleteComponentDialog.name, openDeleteComponentDialog.id),
    ),
  ),
    (deps.copyComponentPageProjectSelectElement.disabled = !otherProjectList.length),
    deps.loadNavigationIconOptions(deps.copyComponentPageProjectSelectElement),
    (deps.copyComponentPageFormElement.elements.copyScaleMode.value = "proportional"),
    deps.copyComponentPageDialogElement.showModal(),
    deps.renderCopyComponentDialog());
}

export function deleteComponentIds(deps: ComponentEditingDeps, deleteComponentId: any) {
  const nl5 = deps.removalPageEntry(deleteComponentId);
  if (!nl5.length) {
    deps.handleOperationError(new Error("没有找到要删除的控件。"));
    return;
  }
  if (((deps.deleteComponentDialogElement.dataset.componentIds = JSON.stringify(nl5)), nl5.length > 1))
    deps.deleteComponentNameElement.textContent = "“已选择的 " + nl5.length + " 个控件”";
  else {
    const deleteAnchorComponent = findComponent2(deps.editorCtx.activeProject?.document, nl5[0])?.component;
    deps.deleteComponentNameElement.textContent =
      "“" +
      componentLabel2(
        deleteAnchorComponent || {
          type: "控件",
        },
      ) +
      "”";
  }
  deps.deleteComponentDialogElement.showModal();
}

export function setComponentsLabelColor(deps: ComponentEditingDeps, labelColorComponentIds: any, newLabelColorValue: any) {
  const labelColorTargetIds = [...new Set(labelColorComponentIds || [])];
  if (!labelColorTargetIds.length) return;
  const pp2 = deps.runStore(newLabelColorValue);
  deps.mutateDocument((labelColorDocument: any) => {
    for (const sortedLabelColorComponentId of labelColorTargetIds) {
      const targetLabelColorComponent = findComponent2(
        labelColorDocument,
        sortedLabelColorComponentId,
      )?.component;
      targetLabelColorComponent &&
        ((targetLabelColorComponent.style = {
          ...(targetLabelColorComponent.style || {}),
        }),
        pp2
          ? (targetLabelColorComponent.style.editorLabelColor = pp2)
          : delete targetLabelColorComponent.style.editorLabelColor);
    }
  });
}

export function renderComponentList(deps: ComponentEditingDeps, componentListElement: any, listComponents: any, listEmptyText: any, listScope: any) {
  if ((componentListElement.replaceChildren(), !listComponents.length)) {
    const listEmptyElement = document.createElement("div");
    ((listEmptyElement.className = "element-list-empty"),
      (listEmptyElement.textContent = listEmptyText),
      componentListElement.append(listEmptyElement));
    return;
  }
  for (const listComponent of listComponents) {
    const componentItemElement = document.createElement("div");
    ((componentItemElement.className = "element-item"),
      (componentItemElement.dataset.componentId = listComponent.id),
      (componentItemElement.dataset.scope = listScope),
      (componentItemElement.draggable = !deps.editorCtx.activeGroupId),
      componentItemElement.classList.toggle(
        "selected",
        deps.editorCtx.selectedComponentIdsSet.has(listComponent.id),
      ),
      componentItemElement.classList.toggle(
        "selection-primary",
        listComponent.id === deps.editorCtx.selectedComponentId,
      ),
      componentItemElement.classList.toggle("group-item", listComponent.type === "group"));
    const pp3 = deps.runStore(listComponent.style?.editorLabelColor);
    (componentItemElement.classList.toggle("has-color-label", !!pp3),
      pp3 && componentItemElement.style.setProperty("--element-label-color", pp3));
    const itemIconElement = document.createElement("i");
    ((itemIconElement.className =
      listComponent.type === "group" ? "element-group-icon" : "element-label-color"),
      itemIconElement.setAttribute("aria-hidden", "true"),
      listComponent.type === "group" &&
        (itemIconElement.innerHTML =
          '<svg viewBox="0 0 24 24" focusable="false"><path d="M3.5 7.5h6l1.8 2h9.2v9.5h-17z"/><path d="M3.5 7.5v-1h6l1.8 2"/></svg>'));
    const itemLabelElement = document.createElement("span");
    itemLabelElement.textContent = componentLabel2(listComponent);
    const isItemIsVisible = listComponent.style?.visible !== false,
      itemVisibilityButtonElement = document.createElement("button");
    ((itemVisibilityButtonElement.type = "button"),
      (itemVisibilityButtonElement.className =
        "element-visibility" + (isItemIsVisible ? "" : " hidden-element")),
      itemVisibilityButtonElement.setAttribute(
        "aria-label",
        isItemIsVisible
          ? "隐藏" + componentLabel2(listComponent)
          : "显示" + componentLabel2(listComponent),
      ),
      (itemVisibilityButtonElement.innerHTML = visibilityIconSvg2(isItemIsVisible)));
    const stopItemEventPropagation = (itemEvent: any) => {
      ((deps.editorCtx.lastComponentClick = {
        componentId: listComponent.id,
        at: Date.now(),
      }),
        itemEvent.stopPropagation());
    };
    (itemVisibilityButtonElement.addEventListener("pointerdown", stopItemEventPropagation),
      itemVisibilityButtonElement.addEventListener("click", (visibilityClickEvent) => {
        ((deps.editorCtx.lastComponentClick = {
          componentId: listComponent.id,
          at: Date.now(),
        }),
          visibilityClickEvent.stopPropagation(),
          deps.selectComponent(listComponent.id, {
            preserveGroup: true,
          }),
          deps.setComponentsVisibility([listComponent.id], !isItemIsVisible));
      }),
      itemVisibilityButtonElement.addEventListener("dblclick", stopItemEventPropagation),
      componentItemElement.append(itemIconElement, itemLabelElement, itemVisibilityButtonElement),
      componentItemElement.addEventListener("click", (itemClickEvent) => {
        deps.selectComponent(listComponent.id, {
          toggle: itemClickEvent.metaKey || itemClickEvent.ctrlKey,
          range: itemClickEvent.shiftKey,
        });
      }),
      componentItemElement.addEventListener("dblclick", (itemDoubleClickEvent) => {
        if (
          listComponent.type !== "group" ||
          (itemDoubleClickEvent.target as Element).closest(".element-visibility")
        )
          return;
        if (
          deps.editorCtx.lastComponentClick.componentId === listComponent.id &&
          Date.now() - deps.editorCtx.lastComponentClick.at < 600
        ) {
          (itemDoubleClickEvent.preventDefault(), itemDoubleClickEvent.stopPropagation());
          return;
        }
        (itemDoubleClickEvent.preventDefault(),
          itemDoubleClickEvent.stopPropagation(),
          (deps.editorCtx.activeGroupId = listComponent.id),
          deps.clearComponentSelection(),
          deps.renderComponentLists(),
          deps.syncRendererSelection(),
          deps.coverMotorButtonElement());
      }),
      componentItemElement.addEventListener("contextmenu", (itemMenuEvent) =>
        deps.openComponentMenu(itemMenuEvent, listComponent.id),
      ),
      componentItemElement.addEventListener("dragstart", (itemDragStartEvent) => {
        deps.editorCtx.selectedComponentIdsSet.has(listComponent.id)
          ? (deps.editorCtx.selectedComponentId = listComponent.id)
          : ((deps.editorCtx.selectedComponentIdsSet = new Set([listComponent.id])),
            (deps.editorCtx.selectedComponentId = listComponent.id),
            (deps.editorCtx.selectionAnchorComponentId = listComponent.id));
        const draggingComponentIds = [...deps.editorCtx.selectedComponentIdsSet];
        ((itemDragStartEvent.dataTransfer!.effectAllowed = "move"),
          itemDragStartEvent.dataTransfer!.setData(
            "text/plain",
            JSON.stringify({
              scope: listScope,
              sourceId: listComponent.id,
              movingIds: draggingComponentIds,
            }),
          ),
          componentListElement.querySelectorAll(".element-item").forEach((listItemElement: any) => {
            listItemElement.classList.toggle(
              "dragging",
              draggingComponentIds.includes(listItemElement.dataset.componentId),
            );
          }));
      }),
      componentItemElement.addEventListener("dragend", () => {
        (componentListElement
          .querySelectorAll(".dragging")
          .forEach((draggingElement: any) => draggingElement.classList.remove("dragging")),
          componentListElement
            .querySelectorAll(".drop-before, .drop-after")
            .forEach((dropMarkerElement: any) =>
              dropMarkerElement.classList.remove("drop-before", "drop-after"),
            ));
      }),
      componentItemElement.addEventListener("dragover", (itemDragOverEvent) => {
        if (!itemDragOverEvent.dataTransfer!.types.includes("text/plain")) return;
        (itemDragOverEvent.preventDefault(), (itemDragOverEvent.dataTransfer!.dropEffect = "move"));
        const isDropAfter =
          itemDragOverEvent.clientY >=
          componentItemElement.getBoundingClientRect().top +
            componentItemElement.getBoundingClientRect().height / 2;
        (componentItemElement.classList.toggle("drop-before", !isDropAfter),
          componentItemElement.classList.toggle("drop-after", isDropAfter));
      }),
      componentItemElement.addEventListener("dragleave", () =>
        componentItemElement.classList.remove("drop-before", "drop-after"),
      ),
      componentItemElement.addEventListener("drop", (itemDropEvent) => {
        itemDropEvent.preventDefault();
        let dragPayload;
        try {
          dragPayload = JSON.parse(itemDropEvent.dataTransfer!.getData("text/plain"));
        } catch {
          return;
        }
        const { scope: payloadSourceId, sourceId: payloadMovingIds } = dragPayload,
          movingIds = Array.isArray(dragPayload.movingIds)
            ? dragPayload.movingIds
            : [payloadMovingIds],
          contains3 = componentItemElement.classList.contains("drop-after");
        (componentItemElement.classList.remove("drop-before", "drop-after"),
          !(
            payloadSourceId !== listScope ||
            !payloadMovingIds ||
            movingIds.includes(listComponent.id)
          ) &&
            ((deps.editorCtx.selectedComponentId = payloadMovingIds),
            (deps.editorCtx.selectedComponentIdsSet = new Set(movingIds)),
            deps.mutateDocument((dropDocument: any) => {
              const sharedComponents =
                listScope === "shared"
                  ? dropDocument.sharedComponents
                  : dropDocument.pages.find(
                      (dropPageEntry: any) => dropPageEntry.path === deps.pageSelectElement.value,
                    )?.components;
              if (!sharedComponents) return;
              const payloadMovingIdSet = new Set(movingIds),
                movedDropComponents = sharedComponents.filter((movedDropCollectionComponent: any) =>
                  payloadMovingIdSet.has(movedDropCollectionComponent.id),
                );
              if (!movedDropComponents.length) return;
              const remainingDropComponents = sharedComponents.filter(
                  (remainingDropCollectionComponent: any) =>
                    !payloadMovingIdSet.has(remainingDropCollectionComponent.id),
                ),
                dropTargetIndex = remainingDropComponents.findIndex(
                  (dropIndexCollectionComponent: any) =>
                    dropIndexCollectionComponent.id === listComponent.id,
                );
              dropTargetIndex < 0 ||
                (remainingDropComponents.splice(
                  dropTargetIndex + (contains3 ? 1 : 0),
                  0,
                  ...movedDropComponents,
                ),
                sharedComponents.splice(0, sharedComponents.length, ...remainingDropComponents),
                applyCollectionLayerOrder2(sharedComponents),
                listScope === "shared" && syncSharedComponentReferenceOrder2(dropDocument));
            })));
      }),
      componentListElement.append(componentItemElement));
  }
}

export function prependGroupBackButton(deps: ComponentEditingDeps, groupBackListElement: any, groupBackComponent: any) {
  if (!groupBackComponent) return;
  const groupBackButtonElement = document.createElement("button");
  ((groupBackButtonElement.type = "button"),
    (groupBackButtonElement.className = "element-group-back"),
    (groupBackButtonElement.textContent = "← 返回" + componentLabel2(groupBackComponent)),
    groupBackButtonElement.addEventListener("click", () => {
      ((deps.editorCtx.activeGroupId = null),
        deps.clearComponentSelection(),
        deps.renderComponentLists(),
        deps.syncRendererSelection(),
        deps.coverMotorButtonElement());
    }),
    groupBackListElement.prepend(groupBackButtonElement));
}

export function renderComponentLists(deps: ComponentEditingDeps) {
  const ct3 = deps.currentPage(),
    activeGroupComponent = deps.editorCtx.activeGroupId
      ? findComponent2(deps.editorCtx.activeProject?.document, deps.editorCtx.activeGroupId)
      : null,
    component2 =
      activeGroupComponent?.component?.type === "group" ? activeGroupComponent.component : null;
  deps.editorCtx.activeGroupId && !component2 && (deps.editorCtx.activeGroupId = null);
  const sharedListComponents =
      component2 && activeGroupComponent!.scope === "shared"
        ? component2.children || []
        : deps.editorCtx.activeProject?.document?.sharedComponents || [],
    pageListComponents =
      component2 && activeGroupComponent!.scope === "page"
        ? component2.children || []
        : ct3?.components || [];
  (deps.renderComponentList(
    deps.sharedComponentListElement,
    sharedListComponents,
    "暂无侧边栏控件",
    "shared",
  ),
    deps.renderComponentList(deps.pageComponentListElement, pageListComponents, "暂无主页面控件", "page"),
    component2 &&
      deps.prependGroupBackButton(
        activeGroupComponent!.scope === "shared"
          ? deps.sharedComponentListElement
          : deps.pageComponentListElement,
        component2,
      ));
}

export function setComponentScope(deps: ComponentEditingDeps, componentScopeName: any) {
  deps.editorCtx.componentScope = componentScopeName === "page" ? "page" : "shared";
  const isSharedScope = deps.editorCtx.componentScope === "shared";
  (deps.showSharedComponentsElement.classList.toggle("active", isSharedScope),
    deps.showPageComponentsElement.classList.toggle("active", !isSharedScope),
    (deps.sharedComponentListElement.hidden = !isSharedScope),
    (deps.pageComponentListElement.hidden = isSharedScope),
    deps.syncAddComponentButton());
}

export function syncAddComponentButton(deps: ComponentEditingDeps) {
  const hasCurrentPage = !!deps.currentPage(),
    some2 = ["shared", "page"].some(
      (templateScope) => listComponentTemplates2(templateScope).length > 0,
    );
  ((deps.addComponentButtonElement.disabled = !hasCurrentPage || !some2),
    (deps.addComponentButtonElement.title = hasCurrentPage
      ? some2
        ? "从模板库添加控件"
        : "该区域暂无可用控件模板"
      : "请先新建页面"));
}

export function renderComponentTemplates(deps: ComponentEditingDeps) {
  const componentTemplates = [
      ...listComponentTemplates2("shared"),
      ...listComponentTemplates2("page"),
    ].filter(
      (templateEntry, templateIndex, templateList) =>
        templateList.findIndex((templateEntryItem) => templateEntryItem.id === templateEntry.id) ===
        templateIndex,
    );
  if (
    ((deps.componentTemplateScopeElement.textContent =
      deps.editorCtx.componentScope === "shared"
        ? "当前添加到侧边栏，添加后会在所有页面显示。"
        : "当前添加到主页面，仅在“" + (deps.currentPage()?.name || "当前页面") + "”显示。"),
    !componentTemplates.length)
  ) {
    const templateEmptyElement = document.createElement("div");
    ((templateEmptyElement.className = "component-template-empty"),
      (templateEmptyElement.textContent = "暂无可用控件模板。"),
      deps.componentTemplateListElement.replaceChildren(templateEmptyElement));
    return;
  }
  deps.componentTemplateListElement.replaceChildren(
    ...componentTemplates.map((componentTemplate) => {
      const templateCardElement = document.createElement("button");
      ((templateCardElement.type = "button"),
        (templateCardElement.className = "component-template-card"),
        (templateCardElement.dataset.templateId = componentTemplate.id));
      const templatePreviewElement = document.createElement("span");
      if (
        ((templatePreviewElement.className = "component-template-preview"),
        templatePreviewElement.setAttribute("aria-hidden", "true"),
        componentTemplate.id === "interaction3d")
      )
        renderInteraction3dThumbnail2(templatePreviewElement);
      else {
        if (componentTemplate.id === "flow-line")
          (templatePreviewElement.classList.add("flow-line-template-preview"),
            (templatePreviewElement.innerHTML =
              '<svg viewBox="0 0 180 100"><path d="M 15 78 H 65 Q 75 78 75 68 V 32 Q 75 22 85 22 H 165" fill="none" stroke="#42d9ef" stroke-opacity=".2" stroke-width="4"/><path d="M 15 78 H 65 Q 75 78 75 68 V 32 Q 75 22 85 22 H 165" fill="none" stroke="#42d9ef" stroke-width="3" stroke-linecap="round" stroke-dasharray="18 18"/></svg>'));
        else {
          if (componentTemplate.id === "scene-mode")
            (templatePreviewElement.classList.add("scene-mode-template-preview"),
              (templatePreviewElement.innerHTML =
                '<span class="scene-mode-template-content"><span class="scene-mode-template-icon"></span><span class="scene-mode-template-text"><strong>情景模式</strong><small>SCENE</small></span></span>'));
          else {
            if (componentTemplate.id === "percentage-bar")
              templatePreviewElement.innerHTML =
                '<svg class="percentage-template-chart" viewBox="0 0 520 260" aria-hidden="true">\n        <defs>\n          <linearGradient id="percentage-thumb-amber" x2="0" y2="1"><stop stop-color="#f2a20d" stop-opacity=".75"/><stop offset="1" stop-color="#f2a20d" stop-opacity=".08"/></linearGradient>\n          <linearGradient id="percentage-thumb-green" x2="0" y2="1"><stop stop-color="#68cc3e" stop-opacity=".75"/><stop offset="1" stop-color="#68cc3e" stop-opacity=".08"/></linearGradient>\n          <linearGradient id="percentage-thumb-gray" x2="0" y2="1"><stop stop-color="#94a5b3" stop-opacity=".75"/><stop offset="1" stop-color="#94a5b3" stop-opacity=".08"/></linearGradient>\n        </defs>\n        <g fill="#dce1e5" font-family="Helvetica Neue, sans-serif" font-size="42" text-anchor="middle" font-weight="300">\n          <text x="130" y="85">68<tspan font-size="22">%</tspan></text><text x="260" y="43">92<tspan font-size="22">%</tspan></text><text x="390" y="126">46<tspan font-size="22">%</tspan></text>\n        </g>\n        <rect x="94" y="99" width="72" height="123" rx="4" fill="url(#percentage-thumb-amber)" stroke="#f2a20d" stroke-opacity=".7" stroke-width="2"/>\n        <rect x="224" y="56" width="72" height="166" rx="4" fill="url(#percentage-thumb-green)" stroke="#68cc3e" stroke-opacity=".7" stroke-width="2"/>\n        <rect x="354" y="139" width="72" height="83" rx="4" fill="url(#percentage-thumb-gray)" stroke="#94a5b3" stroke-opacity=".7" stroke-width="2"/>\n        <g fill="#94a5b3" font-family="sans-serif" font-size="24" text-anchor="middle"><text x="130" y="251">液位</text><text x="260" y="251">电量</text><text x="390" y="251">湿度</text></g>\n      </svg>';
            else {
              const templateThumbnailElement = document.createElement("img"),
                thumbnailId = componentTemplate.thumbnailId || componentTemplate.id;
              ((templateThumbnailElement.src =
                "/static/component-thumbnails/" +
                encodeURIComponent(thumbnailId) +
                ".jpg"),
                (templateThumbnailElement.alt = ""),
                templatePreviewElement.append(templateThumbnailElement));
            }
          }
        }
      }
      const templateCopyElement = document.createElement("span");
      templateCopyElement.className = "component-template-copy";
      const templateNameElement = document.createElement("strong");
      templateNameElement.textContent = componentTemplate.name;
      const templateDescriptionElement = document.createElement("span");
      return (
        (templateDescriptionElement.textContent = componentTemplate.description),
        templateCopyElement.append(templateNameElement, templateDescriptionElement),
        templateCardElement.append(templatePreviewElement, templateCopyElement),
        componentTemplate.id === "interaction3d" && updateInteraction3dCard2(templateCardElement),
        templateCardElement
      );
    }),
  );
}

export function renderNavigationIconPreview(deps: ComponentEditingDeps, navigationIconName: any) {
  return navigationIconName?.domain || String(navigationIconName?.entityId || "").split(".")[0];
}

