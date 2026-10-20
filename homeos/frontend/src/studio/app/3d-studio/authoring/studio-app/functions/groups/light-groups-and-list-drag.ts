import type { StudioAppRuntime } from "../../runtime/studio-app-runtime";
import { isCourtyardPlanItem as isCourtyardPlanItem2 } from "../../../../plan/courtyard-plan";
import { isCourtyardGate as isCourtyardGate2 } from "../../../../plan/courtyard-drawing";
import { remapOpeningsToWalls } from "../../../../plan/studio-wall-openings";
import { clampWindowT as clampWindowT2, mergeCollinearWallSegments as mergeCollinearWallSegments2, remapWallAttachment as remapWallAttachment2 } from "../../../../plan/geometry";
import { syncStudioSelect as syncStudioSelect2 } from "../../../ui/studio-widgets";
import { isCourtyardDrawing as isCourtyardDrawing2, finite as finite2 } from "../../../../loaders/studio-normalization";
import { lampItemTypeSet } from "../../../items/item-catalog";
import type { ListDragRowSession } from "../../../types/studio-app-types";
import { generateId } from "../../../ui/studio-app-helpers";
import { resolveListDragDrop } from "../../../ui/studio-list-drag-drop";
import { classifyLightingScope } from "../../ui/lighting-scope";

export function getLightGroups(runtime: StudioAppRuntime, ) {
  const lightGroups = runtime.appCtx.studioState.lightGroups || (runtime.appCtx.studioState.lightGroups = []);
  return (
    lightGroups.length ||
      lightGroups.push({
        id: generateId("light-group"),
        name: "默认灯组",
        enabled: true,
        areaId: null as any,
      }),
    lightGroups.some((lightGroupIdMatch) => lightGroupIdMatch.id === runtime.appCtx.activeLightGroupId) ||
      (runtime.appCtx.activeLightGroupId = lightGroups[0].id),
    lightGroups.find((lightGroupByName) => lightGroupByName.id === runtime.appCtx.activeLightGroupId) ||
      lightGroups[0]
  );
}

export function syncLightGroupSelect(runtime: StudioAppRuntime, lightGroupSourceItem: any) {
  const lightGroupSelectElement = runtime.selectElement("#light-group");
  lightGroupSelectElement.replaceChildren();
  for (const lightGroupOption of runtime.appCtx.studioState.lightGroups || []) {
    const lightGroupOptionElement = document.createElement("option");
    ((lightGroupOptionElement.value = lightGroupOption.id),
      (lightGroupOptionElement.textContent = lightGroupOption.name),
      lightGroupSelectElement.append(lightGroupOptionElement));
  }
  ((lightGroupSelectElement.value =
    runtime.resolveLightGroup(lightGroupSourceItem)?.id || runtime.getLightGroups().id),
    syncStudioSelect2(lightGroupSelectElement));
}

export function hideLightGroupActionMenu(runtime: StudioAppRuntime, ) {
  ((runtime.lightGroupActionMenuElement.hidden = true), (runtime.appCtx.pendingLightGroupId = ""));
}

export function showLightGroupActionMenu(runtime: StudioAppRuntime, lightGroupRow: any, lightGroupMenuEvent: any) {
  ((runtime.appCtx.pendingLightGroupId = lightGroupRow.id),
    (runtime.appCtx.activeLightGroupId = lightGroupRow.id),
    runtime.syncLightGroupList());
  const lightGroupDeleteControl = runtime.lightGroupActionMenuElement.querySelector(
    '[data-light-group-action="delete"]',
  );
  ((lightGroupDeleteControl.disabled = runtime.appCtx.studioState.lightGroups.length <= 1),
    (runtime.lightGroupActionMenuElement.hidden = false),
    (runtime.lightGroupActionMenuElement.style.left =
      Math.min(lightGroupMenuEvent.clientX, window.innerWidth - 116) + "px"),
    (runtime.lightGroupActionMenuElement.style.top =
      Math.min(lightGroupMenuEvent.clientY, window.innerHeight - 148) + "px"));
}

export function deleteLightGroup(runtime: StudioAppRuntime, lightGroupToDelete: any) {
  if (!lightGroupToDelete || runtime.appCtx.studioState.lightGroups.length <= 1) return;
  runtime.deselectAll();
  const fallbackLightGroup = runtime.appCtx.studioState.lightGroups.find(
      (otherLightGroup) => otherLightGroup.id !== lightGroupToDelete.id,
    ),
    deletedLampIdSet = new Set(
      runtime.appCtx.studioState.items
        .filter(
          (lampInGroup) =>
            lampItemTypeSet.has(lampInGroup.type) &&
            lampInGroup.lightGroupId === lightGroupToDelete.id,
        )
        .map((lampInGroupId) => lampInGroupId.id),
    );
  ((runtime.appCtx.studioState.items = runtime.appCtx.studioState.items.filter(
    (remainingItem) => !deletedLampIdSet.has(remainingItem.id),
  )),
    (runtime.appCtx.studioState.lightGroups = runtime.appCtx.studioState.lightGroups.filter(
      (remainingLightGroup) => remainingLightGroup.id !== lightGroupToDelete.id,
    )),
    runtime.appCtx.selectedItem?.kind === "item" && deletedLampIdSet.has(runtime.appCtx.selectedItem.id) && (runtime.appCtx.selectedItem = null),
    (runtime.appCtx.selectedItems = runtime.appCtx.selectedItems.filter(
      (remainingSelection: any) =>
        remainingSelection.kind !== "item" || !deletedLampIdSet.has(remainingSelection.id),
    )),
    runtime.appCtx.activeLightGroupId === lightGroupToDelete.id && (runtime.appCtx.activeLightGroupId = fallbackLightGroup!.id),
    runtime.refreshScopeItems("lights"),
    runtime.markDocumentDirty(),
    runtime.showToast(
      "已删除“" + lightGroupToDelete.name + "”及组内 " + deletedLampIdSet.size + " 盏灯。",
      "success",
    ));
}

export function uniqueLightGroupName(runtime: StudioAppRuntime, lightGroupBaseName: any) {
  const lightGroupNameSet = new Set(
    runtime.appCtx.studioState.lightGroups.map((existingGroupName) => existingGroupName.name),
  );
  if (!lightGroupNameSet.has(lightGroupBaseName)) return lightGroupBaseName;
  let duplicateNameSuffix = 2;
  for (; lightGroupNameSet.has(lightGroupBaseName + " " + duplicateNameSuffix);)
    duplicateNameSuffix += 1;
  return lightGroupBaseName + " " + duplicateNameSuffix;
}

export function duplicateLightGroup(runtime: StudioAppRuntime, lightGroupToDuplicate: any) {
  if (!lightGroupToDuplicate) return;
  runtime.deselectAll();
  const duplicatedLightGroup = {
      ...structuredClone(lightGroupToDuplicate),
      id: generateId("light-group"),
      name: runtime.uniqueLightGroupName(lightGroupToDuplicate.name + " 副本"),
    },
    sourceLightGroupIndex = runtime.appCtx.studioState.lightGroups.findIndex(
      (sourceGroupMatch) => sourceGroupMatch.id === lightGroupToDuplicate.id,
    );
  runtime.appCtx.studioState.lightGroups.splice(sourceLightGroupIndex + 1, 0, duplicatedLightGroup);
  const clonedLampItems = runtime.appCtx.studioState.items
    .filter(
      (lampInSourceGroup) =>
        lampItemTypeSet.has(lampInSourceGroup.type) &&
        lampInSourceGroup.lightGroupId === lightGroupToDuplicate.id,
    )
    .map((clonedLamp) => ({
      ...structuredClone(clonedLamp),
      id: generateId("item"),
      lightGroupId: duplicatedLightGroup.id,
    }));
  (runtime.appCtx.studioState.items.push(...clonedLampItems),
    (runtime.appCtx.activeLightGroupId = duplicatedLightGroup.id),
    (runtime.appCtx.selectedItem =
      clonedLampItems.length === 1
        ? {
            kind: "item",
            id: clonedLampItems[0].id,
          }
        : null),
    (runtime.appCtx.selectedItems =
      clonedLampItems.length > 1
        ? clonedLampItems.map((relinkedLamp) => ({
            kind: "item",
            id: relinkedLamp.id,
          }))
        : []),
    runtime.syncLightGroupList(),
    runtime.refreshScopeItems("lights"),
    runtime.markDocumentDirty(),
    runtime.showToast(
      "已复制“" + lightGroupToDuplicate.name + "”及组内 " + clonedLampItems.length + " 盏灯。",
      "success",
    ));
}

export function clearLightGroupDropIndicator(runtime: StudioAppRuntime, ) {
  for (const lightGroupDropIndicatorElement of runtime.lightGroupListElement.querySelectorAll(
    ".light-group-row",
  ))
    (lightGroupDropIndicatorElement.classList.remove("drop-before", "drop-after"),
      delete lightGroupDropIndicatorElement.dataset.dropPosition);
  for (const areaDropIndicatorElement of runtime.lightGroupListElement.querySelectorAll(".light-area-row"))
    (areaDropIndicatorElement.classList.remove("drop-into", "drop-before", "drop-after"),
      delete areaDropIndicatorElement.dataset.dropPosition);
}

/** 起拖瞬间把所有落点的矩形抓一份快照，之后拖动过程中不再读 DOM：这样即使源行被重绘（同一帧内不会），本次拖动的判定也不会错位。 */
export function collectListDragDropTargets(runtime: StudioAppRuntime, ) {
  const listDragDropTargets: any[] = [];
  for (const areaRowElement of runtime.lightGroupListElement.querySelectorAll(".light-area-row")) {
    const listedAreaId = areaRowElement.dataset.areaId;
    if (!listedAreaId) continue;
    const areaSectionElement = areaRowElement.closest(".light-area-section");
    listDragDropTargets.push({
      kind: "area",
      id: listedAreaId,
      rowElement: areaRowElement,
      rowRect: areaRowElement.getBoundingClientRect(),
      sectionRect: areaSectionElement ? areaSectionElement.getBoundingClientRect() : null,
    });
  }
  for (const groupRowElement of runtime.lightGroupListElement.querySelectorAll(".light-group-row")) {
    const listedGroupId = groupRowElement.dataset.lightGroupId;
    if (!listedGroupId) continue;
    listDragDropTargets.push({
      kind: "group",
      id: listedGroupId,
      areaId: groupRowElement.dataset.lightGroupAreaId || null,
      rowElement: groupRowElement,
      rowRect: groupRowElement.getBoundingClientRect(),
      sectionRect: null as any,
    });
  }
  return listDragDropTargets;
}

/** 指针落点 → 落点语义。 */
export function applyListDragDropIndicator(runtime: StudioAppRuntime, listDragSession: any, pendingListDrop: any) {
  runtime.clearLightGroupDropIndicator();
  if (!pendingListDrop) return;
  const findDropIndicatorRow = (dropIndicatorTargetId: any) =>
    listDragSession.dropTargets.find(
      (dropTargetCandidate: any) => dropTargetCandidate.id === dropIndicatorTargetId,
    )?.rowElement;
  if (pendingListDrop.kind === "area") {
    findDropIndicatorRow(pendingListDrop.targetId)?.classList.add(
      pendingListDrop.insertAfter ? "drop-after" : "drop-before",
    );
    return;
  }
  if (pendingListDrop.anchorGroupId) {
    findDropIndicatorRow(pendingListDrop.anchorGroupId)?.classList.add(
      pendingListDrop.insertAfter ? "drop-after" : "drop-before",
    );
    return;
  }
  pendingListDrop.areaId &&
    findDropIndicatorRow(pendingListDrop.areaId)?.classList.add("drop-into");
}

export function activateListDrag(runtime: StudioAppRuntime, listDragSession: any) {
  (listDragSession.active = true),
    (listDragSession.dropTargets = runtime.collectListDragDropTargets()),
    listDragSession.rowElement.classList.remove("drag-ready"),
    listDragSession.rowElement.classList.add("dragging"),
    document.documentElement.classList.add("list-drag-active");
  const dragGhostElement = document.createElement("div");
  ((dragGhostElement.className = "light-row-drag-ghost"),
    (dragGhostElement.textContent = listDragSession.name || ""),
    document.body.append(dragGhostElement),
    (listDragSession.ghostElement = dragGhostElement));
  try {
    listDragSession.rowElement.setPointerCapture(listDragSession.pointerId);
  } catch { /* 指针捕获：指针已失效（pointercancel / 元素已卸载）时规范要求抛错，忽略即可 */ }
}

export function handleListDragPointerMove(runtime: StudioAppRuntime, listDragPointerMoveEvent: any) {
  const listDragSession = runtime.appCtx.activeListDragSession;
  if (!listDragSession || listDragPointerMoveEvent.pointerId !== listDragSession.pointerId) return;
  const movedDistance = Math.hypot(
    listDragPointerMoveEvent.clientX - listDragSession.startX,
    listDragPointerMoveEvent.clientY - listDragSession.startY,
  );
  if (!listDragSession.active) {

    if (!listDragSession.armed) {
      movedDistance > runtime.LIST_DRAG_TOUCH_GIVE_UP_DISTANCE && runtime.finishListDrag(false);
      return;
    }
    if (movedDistance < runtime.LIST_DRAG_START_DISTANCE) return;
    runtime.activateListDrag(listDragSession);
  }
  (listDragPointerMoveEvent.cancelable && listDragPointerMoveEvent.preventDefault(),
    listDragSession.ghostElement &&
      ((listDragSession.ghostElement.style.left = listDragPointerMoveEvent.clientX + "px"),
      (listDragSession.ghostElement.style.top = listDragPointerMoveEvent.clientY + "px")),
    (listDragSession.pendingDrop = resolveListDragDrop(
      listDragSession,
      listDragPointerMoveEvent.clientX,
      listDragPointerMoveEvent.clientY,
    )),
    runtime.applyListDragDropIndicator(listDragSession, listDragSession.pendingDrop));
}

export function handleListDragPointerUp(runtime: StudioAppRuntime, listDragPointerUpEvent: any) {
  const listDragSession = runtime.appCtx.activeListDragSession;
  if (!listDragSession || listDragPointerUpEvent.pointerId !== listDragSession.pointerId) return;
  runtime.finishListDrag(true);
}

export function handleListDragPointerCancel(runtime: StudioAppRuntime, ) {
  runtime.finishListDrag(false);
}

/** 触摸拖动期间必须吃掉 touchmove，否则面板会跟着手指一起滚动。 */
export function handleListDragTouchMove(runtime: StudioAppRuntime, listDragTouchMoveEvent: any) {
  runtime.appCtx.activeListDragSession?.active &&
    listDragTouchMoveEvent.cancelable &&
    listDragTouchMoveEvent.preventDefault();
}

export function finishListDrag(runtime: StudioAppRuntime, commitListDropFlag: any) {
  const listDragSession = runtime.appCtx.activeListDragSession;
  if (!listDragSession) return;
  (runtime.appCtx.activeListDragSession = null),
    listDragSession.holdTimeoutId && clearTimeout(listDragSession.holdTimeoutId),
    window.removeEventListener("pointermove", runtime.handleListDragPointerMove),
    window.removeEventListener("pointerup", runtime.handleListDragPointerUp),
    window.removeEventListener("pointercancel", runtime.handleListDragPointerCancel),
    window.removeEventListener("touchmove", runtime.handleListDragTouchMove),
    listDragSession.ghostElement?.remove(),
    listDragSession.rowElement.classList.remove("dragging", "drag-ready"),
    document.documentElement.classList.remove("list-drag-active"),
    runtime.clearLightGroupDropIndicator();

  if (!listDragSession.active) return;
  runtime.appCtx.listDragEndedAt = Date.now();
  const pendingListDrop = listDragSession.pendingDrop;
  pendingListDrop &&
    commitListDropFlag &&
    (pendingListDrop.kind === "area"
      ? runtime.moveAreaRow(listDragSession.id, pendingListDrop.targetId, pendingListDrop.insertAfter)
      : runtime.moveLightGroupToArea(
          listDragSession.id,
          pendingListDrop.areaId,
          pendingListDrop.anchorGroupId,
          pendingListDrop.insertAfter,
        ));
}

/** 行上的 pointerdown 入口。 */
export function beginListRowDrag(runtime: StudioAppRuntime, 
  listDragRowSession: ListDragRowSession | null,
  listDragPointerDownEvent: any,
) {
  runtime.appCtx.activeListDragSession && runtime.finishListDrag(false);
  ((listDragRowSession!.pointerId = listDragPointerDownEvent.pointerId),
    (listDragRowSession!.pointerType = listDragPointerDownEvent.pointerType || "mouse"),
    (listDragRowSession!.startX = listDragPointerDownEvent.clientX),
    (listDragRowSession!.startY = listDragPointerDownEvent.clientY),
    (listDragRowSession!.armed = listDragRowSession!.pointerType !== "touch"),
    (listDragRowSession!.active = false),
    (listDragRowSession!.pendingDrop = null),
    (listDragRowSession!.ghostElement = null),
    (listDragRowSession!.dropTargets = []),
    (listDragRowSession!.holdTimeoutId = null),
    (runtime.appCtx.activeListDragSession = listDragRowSession));
  listDragRowSession!.armed ||
    (listDragRowSession!.holdTimeoutId = setTimeout(() => {
      ((listDragRowSession!.holdTimeoutId = null),
        runtime.appCtx.activeListDragSession === listDragRowSession &&
          ((listDragRowSession!.armed = true),
          listDragRowSession!.rowElement.classList.add("drag-ready")));
    }, runtime.LIST_DRAG_TOUCH_HOLD_MS));
  (window.addEventListener("pointermove", runtime.handleListDragPointerMove, { passive: false }),
    window.addEventListener("pointerup", runtime.handleListDragPointerUp),
    window.addEventListener("pointercancel", runtime.handleListDragPointerCancel),
    window.addEventListener("touchmove", runtime.handleListDragTouchMove, { passive: false }));
}

/** 按区域头的拖放结果重排区域顺序。 */
export function moveAreaRow(runtime: StudioAppRuntime, draggedAreaId: any, targetAreaId: any, insertAfterFlag: any) {
  const draggedAreaIndex = runtime.appCtx.lightAreaRecords.findIndex(
      (draggedAreaMatch) => draggedAreaMatch.areaId === draggedAreaId,
    ),
    targetAreaIndex = runtime.appCtx.lightAreaRecords.findIndex(
      (targetAreaMatch) => targetAreaMatch.areaId === targetAreaId,
    );
  if (draggedAreaIndex < 0 || targetAreaIndex < 0 || draggedAreaIndex === targetAreaIndex) return;
  const reorderedAreas = [...runtime.appCtx.lightAreaRecords],
    [draggedArea] = reorderedAreas.splice(draggedAreaIndex, 1),
    insertAreaIndex = reorderedAreas.findIndex(
      (insertTargetMatch) => insertTargetMatch.areaId === targetAreaId,
    );
  if (insertAreaIndex < 0) return;
  reorderedAreas.splice(insertAreaIndex + (insertAfterFlag ? 1 : 0), 0, draggedArea);
  if (
    reorderedAreas.every(
      (orderedArea, orderedAreaIndex) =>
        orderedArea.areaId === runtime.appCtx.lightAreaRecords[orderedAreaIndex]?.areaId,
    )
  )
    return;
  runtime.appCtx.lightAreaRecords = reorderedAreas;
  runtime.persistLightAreaOrder();
  runtime.syncLightGroupList();
}

/** 把灯组移动到目标区域，可插到某组之前 / 之后（targetGroupId 为空表示只换区域、不改顺序）。 */
export function moveLightGroupToArea(runtime: StudioAppRuntime, 
  draggedGroupId: any,
  targetAreaId: any,
  targetGroupId: any = null,
  insertAfterFlag = false,
) {
  const movedLightGroup = runtime.appCtx.studioState.lightGroups.find(
    (draggedGroupMatch) => draggedGroupMatch.id === draggedGroupId,
  );
  if (!movedLightGroup) return;
  const nextAreaId = targetAreaId || null,
    areaChanged = (movedLightGroup.areaId || null) !== nextAreaId;
  let reorderedLightGroups = runtime.appCtx.studioState.lightGroups;
  if (targetGroupId) {
    const remainingLightGroups = runtime.appCtx.studioState.lightGroups.filter(
        (remainingGroupMatch) => remainingGroupMatch.id !== draggedGroupId,
      ),
      anchorGroupIndex = remainingLightGroups.findIndex(
        (anchorGroupMatch) => anchorGroupMatch.id === targetGroupId,
      );
    if (anchorGroupIndex >= 0) {
      reorderedLightGroups = [...remainingLightGroups];
      reorderedLightGroups.splice(
        anchorGroupIndex + (insertAfterFlag ? 1 : 0),
        0,
        movedLightGroup,
      );
    }
  }
  const orderChanged = reorderedLightGroups.some(
    (orderedGroup, orderedGroupIndex) =>
      orderedGroup.id !== runtime.appCtx.studioState.lightGroups[orderedGroupIndex]?.id,
  );
  if (!areaChanged && !orderChanged) return;
  (runtime.deselectAll(),
    (movedLightGroup.areaId = nextAreaId),
    orderChanged && (runtime.appCtx.studioState.lightGroups = reorderedLightGroups),
    nextAreaId && runtime.appCtx.expandedAreaIds.add(nextAreaId),
    runtime.syncLightGroupList(),
    runtime.refreshStudioUi(),
    runtime.markDocumentDirty());
}

/** 拉取 HA 区域注册表，作为灯光面板唯一的区域来源（只读，但展示顺序可在本地拖动调整）。 */
export async function refreshLightAreasFromHa(runtime: StudioAppRuntime, ) {
  let fetchedAreaRecords: { areaId: string; name: string }[] = [];
  try {
    const areaApiPayload = await runtime.fetchStudioApi("/ha/areas"),
      listedAreaItems = Array.isArray(areaApiPayload?.items) ? areaApiPayload.items : [];
    fetchedAreaRecords = listedAreaItems
      .map((areaItem: any) => ({
        areaId: String(areaItem?.areaId || areaItem?.id || "").trim(),
        name: String(areaItem?.name || "").trim(),
      }))
      .filter((areaRecord: any) => areaRecord.areaId && areaRecord.name);
  } catch (lightAreaError: any) {
    fetchedAreaRecords = [];
  }
  runtime.appCtx.lightAreaRecords = runtime.applySavedLightAreaOrder(fetchedAreaRecords);
  runtime.syncLightGroupList();
}

export function readSavedLightAreaOrder(runtime: StudioAppRuntime, ): string[] {
  try {
    const savedOrder = JSON.parse(
      window.localStorage.getItem(runtime.LIGHT_AREA_ORDER_STORAGE_KEY) || "[]",
    );
    return Array.isArray(savedOrder) ? savedOrder.map((areaIdItem) => String(areaIdItem)) : [];
  } catch (lightAreaOrderError: any) {
    return [];
  }
}

export function persistLightAreaOrder(runtime: StudioAppRuntime, ) {
  try {
    window.localStorage.setItem(
      runtime.LIGHT_AREA_ORDER_STORAGE_KEY,
      JSON.stringify(runtime.appCtx.lightAreaRecords.map((areaRecord) => areaRecord.areaId)),
    );
  } catch(lightAreaOrderError: any) { /* 存储写入是 best-effort：隐私模式 / 配额 / 序列化失败都不应影响本次渲染 */ }
}

/** 按本地记录的 areaId 顺序重排 HA 区域； */
export function applySavedLightAreaOrder(runtime: StudioAppRuntime, areaRecords: { areaId: string; name: string }[]) {
  const areaRecordById = new Map(areaRecords.map((areaRecord) => [areaRecord.areaId, areaRecord])),
    orderedAreaRecords: any[] = [];
  for (const savedAreaId of runtime.readSavedLightAreaOrder()) {
    const savedAreaRecord = areaRecordById.get(savedAreaId);
    savedAreaRecord && (orderedAreaRecords.push(savedAreaRecord), areaRecordById.delete(savedAreaId));
  }
  for (const remainingAreaRecord of areaRecords)
    areaRecordById.has(remainingAreaRecord.areaId) &&
      (orderedAreaRecords.push(remainingAreaRecord), areaRecordById.delete(remainingAreaRecord.areaId));
  return orderedAreaRecords;
}

/** 该 areaId 是否为当前 HA 里的有效区域（渲染分组 / 分配校验用）。 */
export function isKnownLightAreaId(runtime: StudioAppRuntime, areaId: any) {
  return !!areaId && runtime.appCtx.lightAreaRecords.some((areaRecord) => areaRecord.areaId === areaId);
}

/** 重建「所属区域」下拉框：「未分类」恒在首位，其后是 HA 区域注册表里的全部区域。 */
export function syncAreaAssignOptions(runtime: StudioAppRuntime, selectedAreaId: any) {
  const areaOptionRecords = [
    {
      value: "",
      label: "未分类",
    },
  ];
  for (const listedArea of runtime.appCtx.lightAreaRecords)
    areaOptionRecords.push({
      value: listedArea.areaId,
      label: listedArea.name,
    });
  (runtime.lightGroupAreaSelectElement.replaceChildren(
    ...areaOptionRecords.map((areaOptionRecord) => {
      const areaOptionElement = document.createElement("option");
      return (
        (areaOptionElement.value = areaOptionRecord.value),
        (areaOptionElement.textContent = areaOptionRecord.label),
        areaOptionElement
      );
    }),
  ),
    (runtime.lightGroupAreaSelectElement.value = areaOptionRecords.some(
      (areaOptionRecord) => areaOptionRecord.value === selectedAreaId,
    )
      ? selectedAreaId
      : ""),
    syncStudioSelect2(runtime.lightGroupAreaSelectElement));
}

/** 打开灯组的「设置区域」对话框，按该灯组当前所属区域回填下拉框。 */
export function openLightGroupAreaDialog(runtime: StudioAppRuntime, assignTargetGroup: any) {
  assignTargetGroup &&
    ((runtime.appCtx.areaAssignGroupId = assignTargetGroup.id),
    (runtime.lightGroupAreaNameElement.textContent = assignTargetGroup.name),
    runtime.syncAreaAssignOptions(assignTargetGroup.areaId || ""),
    runtime.lightGroupAreaDialogElement.showModal());
}

export function closeLightGroupAreaDialog(runtime: StudioAppRuntime, ) {
  ((runtime.appCtx.areaAssignGroupId = ""), runtime.lightGroupAreaDialogElement.close());
}

/** 展开 / 收起某个区域。 */
export function toggleAreaExpanded(runtime: StudioAppRuntime, toggledAreaId: any) {
  (runtime.appCtx.expandedAreaIds.has(toggledAreaId)
    ? runtime.appCtx.expandedAreaIds.delete(toggledAreaId)
    : runtime.appCtx.expandedAreaIds.add(toggledAreaId),
    runtime.syncLightGroupList());
}

/** 创建一个灯组列表行（长按拖动排序 / 移入区域 + 右键菜单）。 */
export function createLightGroupRow(runtime: StudioAppRuntime, listedLightGroup: any) {
  const lightGroupRowElement = document.createElement("div");
  ((lightGroupRowElement.className =
    "light-group-row" + (listedLightGroup.id === runtime.appCtx.activeLightGroupId ? " active" : "")),
    (lightGroupRowElement.dataset.lightGroupId = listedLightGroup.id),
    (lightGroupRowElement.dataset.lightGroupAreaId = listedLightGroup.areaId || ""),
    lightGroupRowElement.setAttribute(
      "aria-label",
      listedLightGroup.name + "，拖动可排序或移入区域，右键可设置区域、重命名、复制或删除",
    ));
  const listDragRowSession: ListDragRowSession = {
    kind: "group",
    id: listedLightGroup.id,
    name: listedLightGroup.name,
    rowElement: lightGroupRowElement,
    pointerId: -1,
    pointerType: "mouse",
    startX: 0,
    startY: 0,
    armed: false,
    active: false,
    holdTimeoutId: null as any,
    ghostElement: null as any,
    dropTargets: [] as any[],
    pendingDrop: null as any,
  };
  (lightGroupRowElement.addEventListener("pointerdown", (groupPointerDownEvent) => {
    groupPointerDownEvent.button === 0 &&
      !(
        groupPointerDownEvent.target instanceof Element &&
        groupPointerDownEvent.target.closest("button")
      ) &&
      runtime.beginListRowDrag(listDragRowSession, groupPointerDownEvent);
  }),
    lightGroupRowElement.addEventListener("click", () => {
      ((runtime.appCtx.activeLightGroupId = listedLightGroup.id), runtime.syncLightGroupList());
    }),
    lightGroupRowElement.addEventListener("contextmenu", (groupActionMenuEvent) => {
      (groupActionMenuEvent.preventDefault(),
        runtime.showLightGroupActionMenu(listedLightGroup, groupActionMenuEvent));
    }));
  const groupToggleButton = document.createElement("button");
  ((groupToggleButton.type = "button"),
    (groupToggleButton.className = listedLightGroup.enabled ? "on" : ""),
    (groupToggleButton.textContent = listedLightGroup.enabled ? "◉" : "○"),
    (groupToggleButton.title = listedLightGroup.enabled ? "关闭这个灯组" : "开启这个灯组"),
    groupToggleButton.addEventListener("click", (groupToggleClickEvent) => {
      (groupToggleClickEvent.stopPropagation(),
        runtime.deselectAll(),
        (listedLightGroup.enabled = !listedLightGroup.enabled),
        runtime.transitionLightGroups([listedLightGroup.id]),
        runtime.markDocumentDirty());
    }));
  const groupNameLabel = document.createElement("span");
  ((groupNameLabel.className = "light-group-name"),
    (groupNameLabel.textContent = listedLightGroup.name),
    (groupNameLabel.title = "拖动灯组可排序或移入区域，右键可设置区域、重命名、复制或删除"));
  const groupLampCountNote = document.createElement("small");
  ((groupLampCountNote.textContent = String(
    runtime.appCtx.studioState.items.filter(
      (lampInRowGroup) =>
        lampItemTypeSet.has(lampInRowGroup.type) &&
        lampInRowGroup.lightGroupId === listedLightGroup.id,
    ).length,
  )),
    lightGroupRowElement.append(groupToggleButton, groupNameLabel, groupLampCountNote));
  return lightGroupRowElement;
}

/** 创建一个「区域」区块：区域来自 HA，可折叠、可拖动排序，也是拖放目标（灯组拖到头上即挂进该区域）。 */
export function createAreaSection(runtime: StudioAppRuntime, listedArea: any, memberLightGroups: any) {
  const isAreaExpanded = runtime.appCtx.expandedAreaIds.has(listedArea.areaId),
    areaSectionElement = document.createElement("div");
  ((areaSectionElement.className = "light-area-section"),
    (areaSectionElement.dataset.areaId = listedArea.areaId));
  const areaHeaderElement = document.createElement("div");
  ((areaHeaderElement.className = "light-area-row" + (isAreaExpanded ? " expanded" : "")),
    (areaHeaderElement.dataset.areaId = listedArea.areaId),
    areaHeaderElement.setAttribute(
      "aria-label",
      listedArea.name + "，单击展开或收起，拖动可调整区域顺序；区域来自 HA，不可新建或删除",
    ));
  const areaDragRowSession: ListDragRowSession = {
    kind: "area",
    id: listedArea.areaId,
    name: listedArea.name,
    rowElement: areaHeaderElement,
    pointerId: -1,
    pointerType: "mouse",
    startX: 0,
    startY: 0,
    armed: false,
    active: false,
    holdTimeoutId: null as any,
    ghostElement: null as any,
    dropTargets: [] as any[],
    pendingDrop: null as any,
  };
  (areaHeaderElement.addEventListener("pointerdown", (areaPointerDownEvent) => {
    areaPointerDownEvent.button === 0 &&
      !(
        areaPointerDownEvent.target instanceof Element &&
        areaPointerDownEvent.target.closest("button")
      ) &&
      runtime.beginListRowDrag(areaDragRowSession, areaPointerDownEvent);
  }),
    areaHeaderElement.addEventListener("click", () => runtime.toggleAreaExpanded(listedArea.areaId)));
  const areaCaretButton = document.createElement("button");
  ((areaCaretButton.type = "button"),
    (areaCaretButton.className = "light-area-caret"),
    (areaCaretButton.textContent = isAreaExpanded ? "▾" : "▸"),
    (areaCaretButton.title = isAreaExpanded ? "收起区域" : "展开区域"),
    areaCaretButton.addEventListener("click", (areaCaretEvent) => {
      (areaCaretEvent.stopPropagation(), runtime.toggleAreaExpanded(listedArea.areaId));
    }));
  const areaNameLabel = document.createElement("span");
  ((areaNameLabel.className = "light-area-name"), (areaNameLabel.textContent = listedArea.name));
  const areaCountNote = document.createElement("small");
  ((areaCountNote.textContent = String(memberLightGroups.length)),
    areaHeaderElement.append(areaCaretButton, areaNameLabel, areaCountNote),
    areaSectionElement.append(areaHeaderElement));
  if (isAreaExpanded) {
    if (!memberLightGroups.length) {
      const emptyAreaNote = document.createElement("div");
      ((emptyAreaNote.className = "light-area-empty"),
        (emptyAreaNote.textContent = "暂无灯组"),
        areaSectionElement.append(emptyAreaNote));
    } else {
      const areaGroupsContainer = document.createElement("div");
      ((areaGroupsContainer.className = "light-area-groups"),
        memberLightGroups.forEach((memberLightGroup: any) =>
          areaGroupsContainer.append(runtime.createLightGroupRow(memberLightGroup)),
        ),
        areaSectionElement.append(areaGroupsContainer));
    }
  }
  return areaSectionElement;
}

/**
 * 灯光性能提示：当前楼层（或「全部楼层」）已开启的灯具 ≥ 6 盏时提醒一次。
 *
 * 判定与 0.7.8 一致：灯具条目亮度和 > 0，且所属灯组未被关闭；只统计当前预览范围，
 * 因此切到「全部楼层」时计数会包含所有楼层的灯。
 */
export function maybeShowDrawingLightNotice(runtime: StudioAppRuntime, ) {
  if (runtime.hasShownDrawingLightNotice) return;
  const litLightCount = runtime.collectLampEntries().filter(
    (lampEntry: any) =>
      finite2(lampEntry.item.lightBrightness, 0) > 0 && lampEntry.group?.enabled !== false,
  ).length;
  if (litLightCount < runtime.DRAWING_LIGHT_NOTICE_THRESHOLD) return;
  runtime.hasShownDrawingLightNotice = true;
  runtime.drawingLightNoticeCountElement.textContent = litLightCount + " 盏";
  runtime.drawingLightNoticeDialogElement.showModal();
}

export function syncLightGroupList(runtime: StudioAppRuntime, ) {
  if (
    ((runtime.lightLayerPanelElement.hidden = runtime.appCtx.activeLibraryCategory !== "light"),
    !runtime.lightLayerPanelElement.hidden)
  ) {
    (runtime.getLightGroups(), runtime.maybeShowDrawingLightNotice(), runtime.lightGroupListElement.replaceChildren());
    const sceneAreas = runtime.appCtx.lightAreaRecords,
      knownAreaIdSet = new Set(sceneAreas.map((areaRef) => areaRef.areaId)),
      areaMemberGroupMap = new Map(),
      unassignedLightGroups: any[] = [];
    for (const listedLightGroup of runtime.appCtx.studioState.lightGroups) {
      const listedAreaId = knownAreaIdSet.has(listedLightGroup.areaId)
        ? listedLightGroup.areaId
        : null;
      listedAreaId
        ? (areaMemberGroupMap.has(listedAreaId) || areaMemberGroupMap.set(listedAreaId, []),
          areaMemberGroupMap.get(listedAreaId).push(listedLightGroup))
        : unassignedLightGroups.push(listedLightGroup);
    }
    for (const listedArea of sceneAreas)
      runtime.lightGroupListElement.append(
        runtime.createAreaSection(listedArea, areaMemberGroupMap.get(listedArea.areaId) || []),
      );
    for (const unassignedLightGroup of unassignedLightGroups)
      runtime.lightGroupListElement.append(runtime.createLightGroupRow(unassignedLightGroup));
    for (const [screenRowIndex, screenLayerItem] of runtime.getScreenLightGroups().entries()) {
      const screenLayerRowElement = document.createElement("div");
      ((screenLayerRowElement.className = "light-group-row tv-screen-layer-row"),
        screenLayerRowElement.setAttribute(
          "aria-label",
          (screenLayerItem.screenLayerName || "电视画面 " + (screenRowIndex + 1)) +
            "，可独立开启或关闭",
        ));
      const screenToggleButton = document.createElement("button");
      ((screenToggleButton.type = "button"),
        (screenToggleButton.className = screenLayerItem.screenEnabled !== false ? "on" : ""),
        (screenToggleButton.textContent = screenLayerItem.screenEnabled !== false ? "◉" : "○"),
        (screenToggleButton.title =
          screenLayerItem.screenEnabled !== false ? "关闭电视画面" : "开启电视画面"),
        screenToggleButton.addEventListener("click", () => {
          (runtime.deselectAll(),
            (screenLayerItem.screenEnabled = screenLayerItem.screenEnabled === false),
            runtime.refreshScopeItems("items"),
            runtime.markDocumentDirty());
        }));
      const screenNameLabel = document.createElement("span");
      ((screenNameLabel.className = "light-group-name"),
        (screenNameLabel.textContent =
          screenLayerItem.screenLayerName || "电视画面 " + (screenRowIndex + 1)),
        (screenNameLabel.title = "电视开启画面"));
      const screenLayerIndexNote = document.createElement("small");
      ((screenLayerIndexNote.textContent = "1"),
        screenLayerRowElement.append(screenToggleButton, screenNameLabel, screenLayerIndexNote),
        runtime.lightGroupListElement.append(screenLayerRowElement));
    }
    for (const [chargingRowIndex, chargingLayerItem] of runtime.getChargingLightGroups().entries()) {
      const chargingLayerRowElement = document.createElement("div");
      ((chargingLayerRowElement.className = "light-group-row car-charging-layer-row"),
        chargingLayerRowElement.setAttribute(
          "aria-label",
          (chargingLayerItem.chargingLayerName || "汽车充电 " + (chargingRowIndex + 1)) +
            "，可独立开启或关闭",
        ));
      const chargingToggleButton = document.createElement("button");
      ((chargingToggleButton.type = "button"),
        (chargingToggleButton.className = chargingLayerItem.chargingEnabled === true ? "on" : ""),
        (chargingToggleButton.textContent = chargingLayerItem.chargingEnabled === true ? "◉" : "○"),
        (chargingToggleButton.title =
          chargingLayerItem.chargingEnabled === true ? "关闭汽车充电状态" : "开启汽车充电状态"),
        chargingToggleButton.addEventListener("click", () => {
          (runtime.deselectAll(),
            (chargingLayerItem.chargingEnabled = chargingLayerItem.chargingEnabled !== true),
            runtime.refreshScopeItems("items"),
            runtime.markDocumentDirty());
        }));
      const chargingNameLabel = document.createElement("span");
      ((chargingNameLabel.className = "light-group-name"),
        (chargingNameLabel.textContent =
          chargingLayerItem.chargingLayerName || "汽车充电 " + (chargingRowIndex + 1)),
        (chargingNameLabel.title = "汽车充电中状态图层"));
      const chargingIndexNote = document.createElement("small");
      ((chargingIndexNote.textContent = "1"),
        chargingLayerRowElement.append(chargingToggleButton, chargingNameLabel, chargingIndexNote),
        runtime.lightGroupListElement.append(chargingLayerRowElement));
    }
  }
}

export function setAllLightGroupsEnabled(runtime: StudioAppRuntime, enabledFlag: any) {
  const bl2 = runtime.getScreenLightGroups(),
    gl2 = runtime.getChargingLightGroups();
  if (!(
    (runtime.appCtx.studioState.lightGroups || []).every(
      (lightGroupEnabledCheck) => lightGroupEnabledCheck.enabled === enabledFlag,
    ) &&
    bl2.every(
      (screenEnabledCheck: any) => (screenEnabledCheck.screenEnabled !== false) === enabledFlag,
    ) &&
    gl2.every(
      (chargingEnabledCheck: any) => (chargingEnabledCheck.chargingEnabled === true) === enabledFlag,
    )
  )) {
    runtime.deselectAll();
    for (const lightGroupToggleTarget of runtime.appCtx.studioState.lightGroups)
      lightGroupToggleTarget.enabled = enabledFlag;
    for (const screenToggleTarget of bl2) screenToggleTarget.screenEnabled = enabledFlag;
    for (const chargingToggleTarget of gl2) chargingToggleTarget.chargingEnabled = enabledFlag;
    (runtime.transitionLightGroups(runtime.appCtx.studioState.lightGroups.map((lightGroupIdItem) => lightGroupIdItem.id)),
      (bl2.length || gl2.length) &&
        runtime.requestSceneRebuild({
          scope: "items",
          preserveLightCache: true,
        }),
      runtime.markDocumentDirty());
  }
}

export function createSelectionRef(runtime: StudioAppRuntime, selectionKind: any, selectionId: any) {
  return (
    (runtime.appCtx.selectedItem?.kind === selectionKind && runtime.appCtx.selectedItem.id === selectionId) ||
    runtime.appCtx.selectedItems.some(
      (selectionCandidate: any) =>
        selectionCandidate.kind === selectionKind && selectionCandidate.id === selectionId,
    )
  );
}

export function refreshSelection(runtime: StudioAppRuntime, ) {
  ((runtime.appCtx.selectedItem = null), (runtime.appCtx.selectedItems = []));
}

export function isPlanItemVisible(runtime: StudioAppRuntime, planItemRef: any) {
  return runtime.appCtx.activeLibraryCategory === "courtyard"
    ? isCourtyardPlanItem2(planItemRef)
    : lampItemTypeSet.has(planItemRef.type) === (runtime.appCtx.activeLibraryCategory === "light");
}

export function isSelectionAllowed(runtime: StudioAppRuntime, selectionObject: any) {
  return selectionObject
    ? selectionObject.kind === "item"
      ? runtime.isPlanItemVisible(
          runtime.appCtx.studioState.items.find((itemLookupMatch) => itemLookupMatch.id === selectionObject.id) ||
            {},
        )
      : !["courtyard", "light"].includes(runtime.appCtx.activeLibraryCategory)
    : false;
}

export function selectSceneObject(runtime: StudioAppRuntime, objectKind: any, objectId: any) {
  ((runtime.appCtx.selectedItem =
    objectKind && objectId
      ? {
          kind: objectKind,
          id: objectId,
        }
      : null),
    (runtime.appCtx.selectedItems = []));
}

export function getDefaultSelectionScope(runtime: StudioAppRuntime, ) {
  return runtime.appCtx.studioState.walls?.length >= 3 && runtime.closedWallLoops(runtime.getPixelsPerMeter()).length
    ? "items"
    : "all";
}

export function resolvePreviewScope(runtime: StudioAppRuntime, scopeItem: any) {
  return scopeItem?.type === "flooropening"
    ? "all"
    : isCourtyardDrawing2(scopeItem) || isCourtyardGate2(scopeItem)
      ? runtime.getDefaultSelectionScope()
      : lampItemTypeSet.has(scopeItem?.type)
        ? "lights"
        : "items";
}

export function classifySelectionScope(runtime: StudioAppRuntime, selectionList: any) {
  if (
    selectionList.length &&
    selectionList.every((archElementSelection: any) =>
      ["door", "window", "railing"].includes(archElementSelection.kind),
    )
  )
    return "architecture";
  if (
    !selectionList.length ||
    selectionList.some((nonItemSelection: any) => nonItemSelection.kind !== "item")
  )
    return "all";
  const selectedIdSet = new Set(selectionList.map((selectionIdEntry: any) => selectionIdEntry.id)),
    scopedSelectedItems = runtime.appCtx.studioState.items.filter((selectedItemRef) =>
      selectedIdSet.has(selectedItemRef.id),
    );
  if (
    !scopedSelectedItems.length ||
    scopedSelectedItems.some((floorOpeningItem) => floorOpeningItem.type === "flooropening")
  )
    return "all";
  if (
    scopedSelectedItems.some(
      (courtyardItem) => isCourtyardDrawing2(courtyardItem) || isCourtyardGate2(courtyardItem),
    )
  )
    return scopedSelectedItems.some((lampSelectedItem) =>
      lampItemTypeSet.has(lampSelectedItem.type),
    )
      ? "all"
      : runtime.getDefaultSelectionScope();
  const lampCount = scopedSelectedItems.filter((lampCountItem) =>
    lampItemTypeSet.has(lampCountItem.type),
  ).length;
  return lampCount === scopedSelectedItems.length ? "lights" : lampCount === 0 ? "items" : "all";
}

export function getCurrentPreviewScope(runtime: StudioAppRuntime, ) {
  return runtime.classifySelectionScope(
    runtime.appCtx.selectedItems.length ? runtime.appCtx.selectedItems : runtime.appCtx.selectedItem ? [runtime.appCtx.selectedItem] : [],
  );
}

export function getPreviewScopeSelection(runtime: StudioAppRuntime, ) {
  return classifyLightingScope(
    runtime.appCtx, runtime.appCtx.selectedItems.length ? runtime.appCtx.selectedItems : runtime.appCtx.selectedItem ? [runtime.appCtx.selectedItem] : [],
  );
}

export function setPreviewScope(runtime: StudioAppRuntime, scopeRequest: any) {
  const defaultScope = runtime.getPreviewScopeSelection(),
    previewScopeSet = new Set([scopeRequest, defaultScope].filter(Boolean));
  if (previewScopeSet.size) {
    if (previewScopeSet.has("all")) {
      runtime.requestSceneRebuild({
        scope: "all",
        preserveLightCache: true,
      });
      return;
    }
    for (const previewScopeEntry of previewScopeSet)
      runtime.requestSceneRebuild({
        scope: previewScopeEntry,
        preserveLightCache: true,
      });
  }
}

export function markWallsChanged(runtime: StudioAppRuntime, ) {
  const tf3 = remapOpeningsToWalls(
    runtime.appCtx.studioState.walls,
    runtime.appCtx.studioState.windows,
    runtime.appCtx.studioState.doors,
    runtime.getPixelsPerMeter() || 1,
    runtime.appCtx.studioState.railings,
  );
  ((runtime.appCtx.studioState.walls = tf3.walls),
    (runtime.appCtx.studioState.windows = tf3.windows),
    (runtime.appCtx.studioState.doors = tf3.doors),
    (runtime.appCtx.studioState.railings = tf3.railings));
}

export function rebuildWallIndex(runtime: StudioAppRuntime, ) {
  const wallByIdBeforeMerge = new Map(
      runtime.appCtx.studioState.walls.map((wallEntry) => [wallEntry.id, wallEntry]),
    ),
    mergedWallResult = mergeCollinearWallSegments2(runtime.appCtx.studioState.walls, 0.000001);
  if (mergedWallResult.walls.length === runtime.appCtx.studioState.walls.length) return 0;
  const wallByIdAfterMerge = new Map(
      mergedWallResult.walls.map((mergedWallEntry: any) => [mergedWallEntry.id, mergedWallEntry]),
    ),
    remapWallAttachment = (attachmentRecord: any) => {
      const mergedWallId = mergedWallResult.wallIdMap.get(attachmentRecord.wallId),
        sourceWallRecord = wallByIdBeforeMerge.get(attachmentRecord.wallId),
        targetWallRecord = wallByIdAfterMerge.get(mergedWallId);
      if (!mergedWallId || !sourceWallRecord || !targetWallRecord) return attachmentRecord;
      const remappedAttachment = remapWallAttachment2(
        attachmentRecord,
        sourceWallRecord,
        targetWallRecord,
      );
      return (
        (remappedAttachment.t = clampWindowT2(
          targetWallRecord,
          remappedAttachment,
          runtime.getPixelsPerMeter() || 1,
        )),
        remappedAttachment
      );
    },
    removedWallCount = runtime.appCtx.studioState.walls.length - mergedWallResult.walls.length;
  return (
    (runtime.appCtx.studioState.walls = mergedWallResult.walls),
    (runtime.appCtx.studioState.windows = runtime.appCtx.studioState.windows.map(remapWallAttachment)),
    (runtime.appCtx.studioState.doors = runtime.appCtx.studioState.doors.map(remapWallAttachment)),
    (runtime.appCtx.studioState.railings = runtime.appCtx.studioState.railings.map(remapWallAttachment)),
    removedWallCount
  );
}

export function getPixelsPerMeter(runtime: StudioAppRuntime, ) {
  return runtime.appCtx.studioState.calibration?.pixelsPerMeter || 0;
}

export function historyUndoDepth(runtime: StudioAppRuntime, ): number {
  return runtime.studioHistoryStore?.undoDepth ?? 0;
}

export function historyRedoDepth(runtime: StudioAppRuntime, ): number {
  return runtime.studioHistoryStore?.redoDepth ?? 0;
}

export function isStudioDraftReadonly(runtime: StudioAppRuntime, ): boolean {
  return runtime.studioDraftReadonly;
}

/** 保存草稿副本：409 第三出口、只读横幅入口共用（纯本地下载，不动服务器状态）。 */
export function downloadStudioLocalCopy(runtime: StudioAppRuntime, localSceneOverride?: any): boolean {
  try {
    let localScene = localSceneOverride;
    if (localScene === undefined) {
      try {
        localScene = runtime.getLocalSaveRevision();
      } catch {
        localScene = runtime.appCtx.studioProject || null;
      }
    }
    const exportedCopy = {
      revision: runtime.studioDocumentStore.getLoadedRevision(),
      exportedAt: new Date().toISOString(),
      scene: localScene,
    };
    const localCopyBlob = new Blob([JSON.stringify(exportedCopy, null, 2)], {
      type: "application/json",
    });
    const localCopyUrl = URL.createObjectURL(localCopyBlob);
    const downloadAnchor = document.createElement("a");
    downloadAnchor.href = localCopyUrl;
    downloadAnchor.download =
      "studio-draft-" + new Date().toISOString().replace(/[:.]/g, "-") + ".json";
    downloadAnchor.rel = "noopener";
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(localCopyUrl), 1000);
    runtime.showToast("本地副本已导出。", "success");
    return true;
  } catch (exportFailure: any) {
    runtime.showToast(exportFailure?.message || "导出本地副本失败。", "error");
    return false;
  }
}

export function renderStudioReadonlyBanner(runtime: StudioAppRuntime, bannerMessage: string): void {
  if (runtime.isEmbeddedStage) return;
  if (!runtime.studioReadonlyBannerElement) {
    const banner = document.createElement("div");
    banner.id = "studio-readonly-banner";
    banner.setAttribute("role", "status");
    banner.style.cssText =
      "position:fixed;left:0;right:0;bottom:0;z-index:80;display:flex;gap:12px;align-items:center;" +
      "justify-content:center;padding:8px 16px;background:#7a2e2e;color:#fff;font-size:13px;";
    const bannerLabel = document.createElement("span");
    bannerLabel.className = "studio-readonly-message";
    const retryLoadButton = document.createElement("button");
    retryLoadButton.type = "button";
    retryLoadButton.textContent = "重试载入";
    retryLoadButton.addEventListener("click", () => {
      void runtime.retryStudioDraftLoad();
    });
    const exportCopyButton = document.createElement("button");
    exportCopyButton.type = "button";
    exportCopyButton.textContent = "导出本地副本";
    exportCopyButton.addEventListener("click", () => {
      runtime.downloadStudioLocalCopy();
    });
    banner.append(bannerLabel, retryLoadButton, exportCopyButton);
    document.body.appendChild(banner);
    runtime.studioReadonlyBannerElement = banner;
  }
  const bannerMessageElement = runtime.studioReadonlyBannerElement.querySelector(".studio-readonly-message");
  bannerMessageElement && (bannerMessageElement.textContent = bannerMessage);
  runtime.studioReadonlyBannerElement.hidden = false;
}
