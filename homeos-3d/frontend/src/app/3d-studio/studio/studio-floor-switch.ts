/**
 * 自 studio-app.ts 外提的独立单元（Phase A：安全外提）。
 * 对本模块之外的 studio-app.ts 内部零依赖：只引用 import 与自身成员，故不存在循环引用。
 */
import {
  markDocumentDirty,
  showToast
} from "./studio-document-save.js";
import { pushHistorySnapshot } from "./studio-camera-mode.js";
import { createId } from "./studio-plan-geometry.js";
import { state } from "./studio-state.js";
import {
  activateFloor,
  clearSelection,
  expandedAreaIds,
  renderLightGroupList,
  syncPreviewFloorButtons,
  updateFloorAlignmentControls
} from "./studio-ui-refresh.js";
import { syncStudioSelect } from "./studio-widgets.js";
import {
  currentPreviewFloorMode,
  getCurrentFloor,
  planCanvasElement,
  selectElement
} from "./studio-plan-render.js";
import {
  finite,
  normalizeLabelText
} from "../loaders/studio-normalization.js";
import { activateTool } from "./studio-plan-interaction.js";
import { renderPlanView } from "./studio-plan-draw.js";
import { previewFloors } from "./studio-export-dialogs.js";
import * as threeModuleMin from "/static/vendor/three/0.186.0/three.module.min.js";
import {
  clamp,
  modelBounds
} from "../plan/geometry.js";
import {
  applyShadowBudget,
  fitDirectionalShadowCamera,
  rebuildPreviewScene,
  refreshPreviewScene
} from "./studio-render-pipeline.js";
import { isStageViewerMode } from "./studio-architecture.js";
import { disposeSceneSubtree } from "./studio-mesh-geometry.js";

export const floorDeleteDialogElement = selectElement("#floor-delete-dialog");

export const lightGroupAreaSelectElement = selectElement("#light-group-area-select");

export const lightGroupAreaNewNameElement = selectElement("#light-group-area-new-name");

/**
 * 关闭删除楼层对话框并清掉待删目标。
 */
export function closeFloorDeleteDialog() {
  state.floorDeleteTargetId = "";
  if (floorDeleteDialogElement.open) {
    floorDeleteDialogElement.close();
  }
}

/**
 * 执行删除楼层：移除记录、重排标高、切到相邻层并落盘。删后按 defaultFloorHeight 重排
 */
export async function deleteFloor() {
  const floorToDelete = state.studioDocument.floors.find(
    (deletedFloor: any) => deletedFloor.id === state.floorDeleteTargetId
  );
  closeFloorDeleteDialog();
  if (!floorToDelete || state.studioDocument.floors.length <= 1) {
    return;
  }
  const floorIndex = state.studioDocument.floors.findIndex(
    (indexedFloor: any) => indexedFloor.id === floorToDelete.id
  );
  state.studioDocument.floors.splice(floorIndex, 1);
  state.studioDocument.floors.forEach((renumberedFloor: any, orderedIndex: any) => {
    renumberedFloor.elevation = orderedIndex * state.studioDocument.defaultFloorHeight;
  });
  const nextFloor = state.studioDocument.floors[Math.max(0, floorIndex - 1)] || state.studioDocument.floors[0];
  await activateFloor(nextFloor.id, {
    persist: false
  });
  syncPreviewFloorButtons();
  markDocumentDirty();
  showToast("已删除“" + floorToDelete.name + "”。", "success");
}

/**
 * 进入楼层对齐流程的第一阶段（在参照层上点参照点）。参照层固定取楼层列表中的上一层，
 */
export function startFloorAlignment() {
  const alignmentSourceFloor = getCurrentFloor();
  const currentFloorIndex =
    state.studioDocument?.floors.findIndex((listFloor: any) => listFloor.id === alignmentSourceFloor?.id) ?? -1;
  const referenceFloor =
    currentFloorIndex > 0 ? state.studioDocument.floors[currentFloorIndex - 1] : null;
  if (!!alignmentSourceFloor && !!referenceFloor) {
    if (!alignmentSourceFloor.scene.calibration || !referenceFloor.scene.calibration) {
      showToast("当前层和参照层都需要先完成比例校准。", "error");
      return;
    }
    state.floorAlignState = {
      floorId: alignmentSourceFloor.id,
      referenceFloor: referenceFloor,
      stage: "reference",
      referencePoint: null
    };
    clearSelection();
    activateTool("select");
    planCanvasElement.style.cursor = "crosshair";
    updateFloorAlignmentControls();
    renderPlanView();
    showToast("先在半透明的" + referenceFloor.name + "上点击一个参照点。");
  }
}

/**
 * 归一区域名（去首尾空白、限长，空名等同于「未填写」）。
 */
export function normalizeAreaName(requestedAreaName: any) {
  return normalizeLabelText(requestedAreaName, "", 16);
}

/**
 * 判断区域名是否已被占用。
 */
export function areaNameTaken(areaName: any, excludeAreaId: any = null) {
  return (state.activeScene.areas || []).some(
    (namedArea: any) => namedArea.id !== excludeAreaId && namedArea.name === areaName
  );
}

/**
 * 重建「所属区域」下拉框：「未分类」恒在首位，其后是当前场景的全部区域。选项少，
 */
export function syncAreaAssignOptions(selectedAreaId: any) {
  const areaOptions = [
    {
      value: "",
      label: "未分类"
    }
  ];
  for (const listedArea of state.activeScene.areas || []) {
    areaOptions.push({
      value: listedArea.id,
      label: listedArea.name
    });
  }
  lightGroupAreaSelectElement.replaceChildren(
    ...areaOptions.map(areaOption => {
      const optionElement = document.createElement("option");
      optionElement.value = areaOption.value;
      optionElement.textContent = areaOption.label;
      return optionElement;
    })
  );
  lightGroupAreaSelectElement.value = areaOptions.some(
    areaOption => areaOption.value === selectedAreaId
  )
    ? selectedAreaId
    : "";
  syncStudioSelect(lightGroupAreaSelectElement);
}

/**
 * 在「分配区域」对话框里直接新建区域，并立即把它设为当前选项。名字先过 normalizeAreaName
 */
export function createAreaFromAssignDialog() {
  const newAreaName = normalizeAreaName(lightGroupAreaNewNameElement.value);
  if (!newAreaName) {
    showToast("请输入新区域名称。", "error");
    return;
  }
  if (areaNameTaken(newAreaName)) {
    showToast("已存在同名区域。", "error");
    return;
  }
  pushHistorySnapshot();
  const createdArea = {
    id: createId("area"),
    name: newAreaName
  };
  (state.activeScene.areas ||= []).push(createdArea);
  expandedAreaIds.add(createdArea.id);
  syncAreaAssignOptions(createdArea.id);
  lightGroupAreaNewNameElement.value = "";
  renderLightGroupList();
  markDocumentDirty();
  showToast("已新建区域“" + newAreaName + "”并选中。", "success");
}

/**
 * 把某个锚点（灯光 / 设备）投影到当前相机画面，返回 0~1 的归一化屏幕坐标。全楼合并模式下先把「平面像素 + 楼层
 */
export function projectAnchorToFloorPlan(anchorItem: any, anchorFloor: any, floorCandidates = previewFloors()) {
  if (!anchorItem || !anchorFloor || !state.previewCamera) {
    return null;
  }
  const anchorPixelsPerMeter = anchorFloor.scene?.calibration?.pixelsPerMeter || 1;
  let anchorOffsetX = 0;
  let anchorElevation =
    Math.max(0, finite(anchorItem.elevation, 0)) +
    Math.max(0.02, finite(anchorItem.height, 0.1)) / 2;
  let anchorOffsetZ = 0;
  if (currentPreviewFloorMode() === "all") {
    const floorLocalX =
      (finite(anchorItem.x, 0) - finite(anchorFloor.originX, 0)) / anchorPixelsPerMeter;
    const floorLocalY =
      (finite(anchorItem.y, 0) - finite(anchorFloor.originY, 0)) / anchorPixelsPerMeter;
    const floorRotationRadians = -threeModuleMin.MathUtils.degToRad(
      finite(anchorFloor.rotation, 0)
    );
    anchorOffsetX =
      floorLocalX * Math.cos(floorRotationRadians) +
      floorLocalY * Math.sin(floorRotationRadians) +
      finite(anchorFloor.offsetX, 0);
    anchorOffsetZ =
      -floorLocalX * Math.sin(floorRotationRadians) +
      floorLocalY * Math.cos(floorRotationRadians) +
      finite(anchorFloor.offsetZ, 0);
    const floorsSortedByElevation = [...floorCandidates].sort(
      (floorEntryA, floorEntryB) => floorEntryA.elevation - floorEntryB.elevation
    );
    const floorStackIndex = Math.max(
      0,
      floorsSortedByElevation.findIndex(stackFloorEntry => stackFloorEntry.id === anchorFloor.id)
    );
    anchorElevation += floorStackIndex * finite(state.studioDocument.exportFloorGap, 3);
  } else {
    const singleFloorScene = anchorFloor.scene;
    const singleFloorBounds = singleFloorScene.walls?.length
      ? modelBounds({
          background: null,
          walls: singleFloorScene.walls,
          items: []
        })
      : singleFloorScene.items?.length
        ? modelBounds({
            background: null,
            walls: [],
            items: singleFloorScene.items
          })
        : modelBounds(singleFloorScene);
    anchorOffsetX =
      (finite(anchorItem.x, 0) - (singleFloorBounds.minX + singleFloorBounds.maxX) / 2) /
      anchorPixelsPerMeter;
    anchorOffsetZ =
      (finite(anchorItem.y, 0) - (singleFloorBounds.minY + singleFloorBounds.maxY) / 2) /
      anchorPixelsPerMeter;
  }
  state.previewCamera.updateMatrixWorld(true);
  const projectedAnchorPoint = new threeModuleMin.Vector3(
    anchorOffsetX,
    anchorElevation,
    anchorOffsetZ
  ).project(state.previewCamera);
  if (
    ![projectedAnchorPoint.x, projectedAnchorPoint.y, projectedAnchorPoint.z].every(
      Number.isFinite
    ) ||
    projectedAnchorPoint.z < -1 ||
    projectedAnchorPoint.z > 1
  ) {
    return null;
  } else {
    return {
      x: clamp((projectedAnchorPoint.x + 1) / 2, 0, 1),
      y: clamp((1 - projectedAnchorPoint.y) / 2, 0, 1)
    };
  }
}

/**
 * 只重建指定楼层（楼层内容变化时的增量切换）。叠放模式下若目标楼层对应的 Group 尚未建出（或楼层列表与场景不同步），
 */
export function switchPreviewFloor(targetFloorIds: any) {
  if (!targetFloorIds.size || !state.previewModelRoot) {
    return;
  }
  if (currentPreviewFloorMode() !== "all") {
    if (targetFloorIds.has(state.activeFloorId)) {
      refreshPreviewScene();
    }
    return;
  }
  const switchRootSnapshot = state.previewModelRoot;
  const switchSceneSnapshot = state.activeScene;
  const switchFloorIdSnapshot = state.activeFloorId;
  const switchFocusSnapshot = state.floorFocusPoint;
  const switchSortedFloors = [...state.studioDocument.floors].sort(
    (switchFloorA, switchFloorB) => switchFloorA.elevation - switchFloorB.elevation
  );
  if (
    switchSortedFloors.some(
      candidateFloorRecord =>
        !switchRootSnapshot.children.some(
          (matchedFloorChild: any) => matchedFloorChild.userData?.floorId === candidateFloorRecord.id
        )
    )
  ) {
    refreshPreviewScene();
    return;
  }
  try {
    for (const [targetFloorIndex, targetFloorRecord] of switchSortedFloors.entries()) {
      if (
        targetFloorIds.has(targetFloorRecord.id) &&
        ((state.previewModelRoot = switchRootSnapshot.children.find(
          (foundFloorChild: any) => foundFloorChild.userData?.floorId === targetFloorRecord.id
        )),
        (state.activeScene = targetFloorRecord.scene),
        (state.activeFloorId = targetFloorRecord.id),
        (state.floorFocusPoint = {
          x: finite(targetFloorRecord.originX, 0),
          y: finite(targetFloorRecord.originY, 0)
        }),
        state.previewModelRoot.position.set(
          finite(targetFloorRecord.offsetX, 0),
          targetFloorIndex * state.studioDocument.previewFloorGap,
          finite(targetFloorRecord.offsetZ, 0)
        ),
        state.previewModelRoot.rotation.set(
          0,
          -threeModuleMin.MathUtils.degToRad(finite(targetFloorRecord.rotation, 0)),
          0
        ),
        state.previewModelRoot.scale.set(1, 1, 1),
        rebuildPreviewScene(),
        targetFloorIndex > 0)
      ) {
        for (const hiddenFloorChild of [...state.previewModelRoot.children]) {
          if (["background", "grid"].includes(hiddenFloorChild.userData?.exportRole)) {
            if (isStageViewerMode) {
              hiddenFloorChild.userData.floorBackgroundHidden = true;
              hiddenFloorChild.visible = false;
              continue;
            }
            state.previewModelRoot.remove(hiddenFloorChild);
            disposeSceneSubtree(hiddenFloorChild);
          }
        }
      }
    }
  } finally {
    state.previewModelRoot = switchRootSnapshot;
    state.activeScene = switchSceneSnapshot;
    state.activeFloorId = switchFloorIdSnapshot;
    state.floorFocusPoint = switchFocusSnapshot;
  }
  applyShadowBudget(switchRootSnapshot);
  fitDirectionalShadowCamera();
}
