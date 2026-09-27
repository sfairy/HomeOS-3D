/**
 * 自 studio-app.ts 外提的独立单元（Phase A：安全外提）。
 * 对本模块之外的 studio-app.ts 内部零依赖：只引用 import 与自身成员，故不存在循环引用。
 */
import { state } from "./studio-state.js";
import {
  PLAN_PAPER,
  convertBetweenFloors,
  drawMarqueeOverlay,
  isSnapClosingSpace,
  openingPlacementInfo,
  referenceWallsForAlignment,
  renderPlanView,
  rotateScreenPoint,
  screenToPlan,
  selectedDoorType
} from "./studio-plan-draw.js";
import {
  axisLockedPoint,
  clamp,
  clampWindowT,
  closedWallPolygons,
  distance,
  itemRotationFromPointers,
  nearestWall,
  pointInRotatedRectangle,
  projectPointToSegment,
  resizeRotatedItemFromCorner,
  snapPoint,
  uncoveredCollinearWallSegments,
  wallIntersections
} from "../plan/geometry.js";
import {
  currentPixelsPerMeter,
  getCurrentFloor,
  planCanvasElement,
  planContext,
  selectElement
} from "./studio-plan-render.js";
import {
  activeToolLabelElement,
  carItems,
  clearSelection,
  ensureActiveLightGroup,
  findSelectedEntity,
  finishWallButton,
  refreshStudio,
  renderFloorList,
  renderInspector,
  resetScaleInteractionState,
  televisionItems,
  toolHelpElement,
  updateFloorAlignmentControls
} from "./studio-ui-refresh.js";
import {
  finite,
  itemMinimumFootprint,
  itemMinimumHeight
} from "../loaders/studio-normalization.js";
import {
  createId,
  itemFromPlanFootprintResize,
  itemPlanFootprint,
  pillarIsLying,
  pointInBounds,
  segmentIntersectsBounds,
  splitWallsWithOpenings,
  stripIsStanding
} from "./studio-plan-geometry.js";
import {
  curtainFootprintDepth,
  normalizeCurtainTrack
} from "../loaders/studio-curtain-track.js";
import { snapIndicatorElement } from "./studio-control-sync.js";
import {
  DEFAULT_LIGHT_SETTINGS,
  DOOR_TYPE_DIMENSIONS,
  ITEM_TYPE_DEFINITIONS,
  TELEVISION_MOUNT_DEPTHS,
  TELEVISION_MOUNT_ELEVATIONS,
  TOOL_HELP_TEXT
} from "./studio-config-tables.js";
import {
  isSelected,
  wallDerivedData
} from "./studio-architecture.js";
import {
  LIGHT_ITEM_TYPES,
  ROUND_TABLE_TURNTABLE_ITEM_TYPES,
  STAIR_DIRECTION_ITEM_TYPES
} from "./studio-item-types.js";
import {
  applySceneRefresh,
  pendingSceneUpdateScopes,
  scheduleLightCacheBuild,
  schedulePreviewRebuild
} from "./studio-render-pipeline.js";
import {
  capturePointer,
  releasePointer
} from "../../utils/pointer-capture.js";
import {
  markDocumentDirty,
  showToast
} from "./studio-document-save.js";
import {
  cloneSceneForHistory,
  pushHistorySnapshot
} from "./studio-camera-mode.js";
import { floorPointToScenePoint } from "./studio-overview-center.js";

export const toolButtons = [...document.querySelectorAll("[data-tool]")];

export const cursorPositionElement = selectElement("#cursor-position");

export const scaleDialogElement = selectElement("#scale-dialog");

export const referencePixelsElement = selectElement("#reference-pixels");

export const referenceMetersInput = selectElement("#reference-meters");

export const metricsCanvas = document.createElement("canvas");

export const metricsContext = metricsCanvas.getContext("2d");

/**
 * 放弃楼层对齐流程，恢复画布光标与工具状态。用户按 Esc、或点了别的楼层导致流程失效时
 */
export function cancelFloorAlignment() {
  if (state.floorAlignState) {
    state.floorAlignState = null;
    planCanvasElement.style.cursor = "";
    activateTool("select");
    updateFloorAlignmentControls();
    renderPlanView();
    showToast("已取消楼层对齐。", "success");
  }
}

/**
 * 处理楼层对齐的两阶段画布点击：先在参照层按 18/zoom 平面像素吸附取参照点并换算到参照层坐标系，
 */
export function handleFloorAlignClick(clickPoint: any) {
  if (!state.floorAlignState) {
    return false;
  }
  const alignmentTargetFloor = getCurrentFloor();
  if (!alignmentTargetFloor || alignmentTargetFloor.id !== state.floorAlignState.floorId) {
    cancelFloorAlignment();
    return true;
  }
  if (state.floorAlignState.stage === "reference") {
    const referenceWalls = referenceWallsForAlignment();
    const snappedReferencePoint =
      nearestWall(clickPoint, referenceWalls, 18 / state.viewTransform.zoom)?.point || clickPoint;
    state.floorAlignState.referencePoint = convertBetweenFloors(
      snappedReferencePoint,
      alignmentTargetFloor,
      state.floorAlignState.referenceFloor
    );
    state.floorAlignState.stage = "current";
    updateFloorAlignmentControls();
    renderPlanView();
    showToast("现在点击" + alignmentTargetFloor.name + "上的同一个位置。");
    return true;
  }
  const alignPoint =
    nearestWall(clickPoint, alignmentTargetFloor.scene.walls, 18 / state.viewTransform.zoom)?.point ||
    clickPoint;
  const referenceOffset = floorPointToScenePoint(
    state.floorAlignState.referenceFloor,
    state.floorAlignState.referencePoint
  );
  alignmentTargetFloor.originX = alignPoint.x;
  alignmentTargetFloor.originY = alignPoint.y;
  alignmentTargetFloor.originInitialized = true;
  alignmentTargetFloor.offsetX = referenceOffset.x;
  alignmentTargetFloor.offsetZ = referenceOffset.z;
  alignmentTargetFloor.rotation = state.floorAlignState.referenceFloor.rotation || 0;
  alignmentTargetFloor.aligned = true;
  alignmentTargetFloor.alignmentPending = false;
  alignmentTargetFloor.alignment = {
    referenceFloorId: state.floorAlignState.referenceFloor.id,
    referencePoint: {
      ...state.floorAlignState.referencePoint
    },
    currentPoint: {
      ...alignPoint
    }
  };
  state.floorAlignState = null;
  planCanvasElement.style.cursor = "";
  activateTool("select");
  renderFloorList();
  renderPlanView();
  applySceneRefresh({
    force: true
  });
  markDocumentDirty();
  showToast(alignmentTargetFloor.name + "已与下层参照点对齐。", "success");
  return true;
}

/**
 * 给新增 / 粘贴进来的电视分配唯一的「电视画面 N」图层名：已用名取自当前楼层全部电视，
 */
export function assignTelevisionLayerNames(televisionItemsToName: any) {
  const usedTelevisionLayerNames = new Set(
    televisionItems().map((televisionLayerItem: any) => televisionLayerItem.screenLayerName)
  );
  let televisionLayerCounter = 1;
  for (const televisionLayerTarget of televisionItemsToName) {
    if (televisionLayerTarget.type === "tv") {
      while (usedTelevisionLayerNames.has("电视画面 " + televisionLayerCounter)) {
        televisionLayerCounter += 1;
      }
      televisionLayerTarget.screenLayerName = "电视画面 " + televisionLayerCounter;
      televisionLayerTarget.screenEnabled = televisionLayerTarget.screenEnabled !== false;
      usedTelevisionLayerNames.add(televisionLayerTarget.screenLayerName);
      televisionLayerCounter += 1;
    }
  }
}

/**
 * 给新增 / 粘贴进来的小汽车分配唯一的「汽车充电 N」图层名，与 assignTelevisionLayerNames
 */
export function assignCarLayerNames(carItemsToName: any) {
  const usedCarLayerNames = new Set(carItems().map((carLayerItem: any) => carLayerItem.chargingLayerName));
  let carLayerCounter = 1;
  for (const carLayerTarget of carItemsToName) {
    if (carLayerTarget.type === "smallcar") {
      while (usedCarLayerNames.has("汽车充电 " + carLayerCounter)) {
        carLayerCounter += 1;
      }
      carLayerTarget.chargingLayerName = "汽车充电 " + carLayerCounter;
      carLayerTarget.chargingEnabled = carLayerTarget.chargingEnabled === true;
      usedCarLayerNames.add(carLayerTarget.chargingLayerName);
      carLayerCounter += 1;
    }
  }
}

/**
 * 统一补齐电视 / 小汽车的图层名，供新增与粘贴物件后调用。
 */
export function normalizeLayerNames(itemsToName: any) {
  assignTelevisionLayerNames(itemsToName);
  assignCarLayerNames(itemsToName);
}

/**
 * 设置单选：把指定对象设为主选中并清空多选。
 */
export function setSelection(setSelectionKind: any, selectionId: any) {
  state.primarySelection =
    setSelectionKind && selectionId
      ? {
          kind: setSelectionKind,
          id: selectionId
        }
      : null;
  state.multiSelection = [];
}

export function scopeForItem(scopedItem: any) {
  if (scopedItem?.type === "flooropening") {
    return "all";
  } else if (LIGHT_ITEM_TYPES.has(scopedItem?.type)) {
    return "lights";
  } else {
    return "items";
  }
}

/**
 * 推断选中集合对应的最小刷新作用域，供选中联动与属性修改后重绘。规则：全是门窗栏杆等
 */
export function scopeForSelection(selection: any) {
  if (
    selection.length &&
    selection.every((kindEntry: any) => ["door", "window", "railing"].includes(kindEntry.kind))
  ) {
    return "architecture";
  }
  if (!selection.length || selection.some((itemEntry: any) => itemEntry.kind !== "item")) {
    return "all";
  }
  const selectedItemIds = new Set(selection.map((selectionIdEntry: any) => selectionIdEntry.id));
  const selectedItems = state.activeScene.items.filter((matchedItem: any) =>
    selectedItemIds.has(matchedItem.id)
  );
  if (
    !selectedItems.length ||
    selectedItems.some((flaggedItem: any) => flaggedItem.type === "flooropening")
  ) {
    return "all";
  }
  const selectionLightCount = selectedItems.filter((lightFlagItem: any) =>
    LIGHT_ITEM_TYPES.has(lightFlagItem.type)
  ).length;
  if (selectionLightCount === selectedItems.length) {
    return "lights";
  } else if (selectionLightCount === 0) {
    return "items";
  } else {
    return "all";
  }
}

/**
 * 取当前选中（优先多选，其次主选中）的刷新作用域。
 */
export function currentSelectionScope() {
  return scopeForSelection(
    state.multiSelection.length ? state.multiSelection : state.primarySelection ? [state.primarySelection] : []
  );
}

/**
 * 推断选中集合中与光照相关的刷新作用域。与 scopeForSelection 的差别在「没有灯」时：
 */
export function lightScopeForSelection(lightSelection: any) {
  if (!lightSelection.length) {
    return null;
  }
  if (
    lightSelection.every((architectureEntry: any) =>
      ["wall", "door", "window", "railing"].includes(architectureEntry.kind)
    )
  ) {
    return "architecture";
  }
  if (lightSelection.some((nonItemEntry: any) => nonItemEntry.kind !== "item")) {
    return "all";
  }
  const lightSelectedIds = new Set(lightSelection.map((itemIdEntry: any) => itemIdEntry.id));
  const matchedItems = state.activeScene.items.filter((matchedLightItem: any) =>
    lightSelectedIds.has(matchedLightItem.id)
  );
  if (!matchedItems.length) {
    return null;
  }
  const lightItems = matchedItems.filter(
    (nonLightItem: any) => !LIGHT_ITEM_TYPES.has(nonLightItem.type) || nonLightItem.type === "striplight"
  );
  if (!lightItems.length) {
    return null;
  }
  const lightItemCount = lightItems.filter((lightOnlyItem: any) =>
    LIGHT_ITEM_TYPES.has(lightOnlyItem.type)
  ).length;
  if (lightItemCount === lightItems.length) {
    return "lights";
  } else if (lightItemCount === 0) {
    return "items";
  } else {
    return "all";
  }
}

/**
 * 取当前选中（优先多选，其次主选中）中与光照相关的作用域。
 */
export function currentLightScope() {
  return lightScopeForSelection(
    state.multiSelection.length ? state.multiSelection : state.primarySelection ? [state.primarySelection] : []
  );
}

/**
 * 请求刷新场景，作用域取「调用方想要的」与「当前选中实际需要的」并集：选中状态会影响哪些对象
 */
export function requestSceneRefresh(refreshScope: any) {
  const detectedScope = currentLightScope();
  const scopes = new Set([refreshScope, detectedScope].filter(Boolean));
  if (scopes.size) {
    if (scopes.has("all")) {
      applySceneRefresh({
        scope: "all",
        preserveLightCache: true
      });
      return;
    }
    for (const pendingScope of scopes) {
      applySceneRefresh({
        scope: pendingScope,
        preserveLightCache: true
      });
    }
  }
}

/**
 * 按几何交点重新切分墙体，并把门窗栏杆重挂到切分后的墙上（原地改写场景）。每次墙体几何
 */
export function refreshSplitGeometry() {
  const recomputedGeometry = splitWallsWithOpenings(
    state.activeScene.walls,
    state.activeScene.windows,
    state.activeScene.doors,
    currentPixelsPerMeter() || 1,
    state.activeScene.railings
  );
  state.activeScene.walls = recomputedGeometry.walls;
  state.activeScene.windows = recomputedGeometry.windows;
  state.activeScene.doors = recomputedGeometry.doors;
  state.activeScene.railings = recomputedGeometry.railings;
}

export function pushHistoryEntry(snapshotScene: any) {
  state.undoStack.push(snapshotScene);
  if (state.undoStack.length > 40) {
    state.undoStack.shift();
  }
  state.redoStack = [];
}

/**
 * 把指针事件的 client 坐标换算成画布局部坐标。用 getBoundingClientRect 而不是
 */
export function canvasPointFromEvent(pointerEvent: any) {
  const canvasRect = planCanvasElement.getBoundingClientRect();
  return {
    x: pointerEvent.clientX - canvasRect.left,
    y: pointerEvent.clientY - canvasRect.top
  };
}

/**
 * 以某个屏幕点为锚点缩放平面视图（滚轮缩放）。记下锚点对应的平面坐标与旋转后屏幕坐标，改完
 */
export function zoomViewAt(
  factor: any,
  anchorPoint = {
    x: state.viewportWidthPx / 2,
    y: state.viewportHeightPx / 2
  }
) {
  const planAnchor = screenToPlan(anchorPoint);
  const screenAnchor = rotateScreenPoint(anchorPoint);
  state.viewTransform.zoom = clamp(state.viewTransform.zoom * factor, 0.03, 12);
  state.viewTransform.offsetX = screenAnchor.x - planAnchor.x * state.viewTransform.zoom;
  state.viewTransform.offsetY = screenAnchor.y - planAnchor.y * state.viewTransform.zoom;
  renderPlanView();
}

/**
 * 取（并缓存）墙体两两之间的交点，供墙端清理与绘制吸附使用。
 */
export function wallIntersectionsForWalls(intersectionToleranceMeters: any) {
  const intersectionDerived = wallDerivedData(intersectionToleranceMeters);
  intersectionDerived.intersections ||= wallIntersections(state.activeScene.walls);
  return intersectionDerived.intersections;
}

/**
 * 把物件的局部坐标（以物件中心为原点、未旋转）换算成平面坐标，就是一次绕物件中心的
 */
export function rotateLocalToPlan(rotatingItem: any, localX: any, localY: any) {
  const rotationRad = ((Number(rotatingItem.rotation) || 0) * Math.PI) / 180;
  return {
    x: rotatingItem.x + localX * Math.cos(rotationRad) - localY * Math.sin(rotationRad),
    y: rotatingItem.y + localX * Math.sin(rotationRad) + localY * Math.cos(rotationRad)
  };
}

/**
 * 算出选中物件在平面上的控制点：四角缩放手柄 + 顶部旋转手柄。手柄位置先按物件半宽 / 半深算出
 */
export function itemControlHandles(handleItem: any) {
  const pixelsPerMeter = currentPixelsPerMeter() || 100;
  const handleFootprint = itemPlanFootprint(handleItem);
  /**
   * 控制点相对物件中心的横向半宽，单位像素。
   */
  const controlHalfWidthPlan = (handleFootprint.width * pixelsPerMeter) / 2;
  /**
   * 控制点相对物件中心的纵向半深，单位像素。
   */
  const halfDepthPlan = (handleFootprint.depth * pixelsPerMeter) / 2;
  return {
    corners: [
      {
        x: -1,
        y: -1
      },
      {
        x: 1,
        y: -1
      },
      {
        x: 1,
        y: 1
      },
      {
        x: -1,
        y: 1
      }
    ].map(corner => ({
      ...corner,
      point: rotateLocalToPlan(
        handleItem,
        corner.x * controlHalfWidthPlan,
        corner.y * halfDepthPlan
      ),
      opposite: rotateLocalToPlan(
        handleItem,
        -corner.x * controlHalfWidthPlan,
        -corner.y * halfDepthPlan
      )
    })),
    rotationStem: rotateLocalToPlan(handleItem, 0, -halfDepthPlan),
    rotationHandle: rotateLocalToPlan(
      handleItem,
      0,
      -halfDepthPlan - 17 / Math.max(state.viewTransform.zoom, 0.01)
    )
  };
}

/**
 * 手柄拾取：判断平面点击是否落在选中物件的旋转手柄或角点缩放手柄上。只在「选择工具 + 恰好单选一个物件」时生效
 */
export function hitTestItemHandle(hitPlanPoint: any) {
  if (state.activeTool !== "select" || state.primarySelection?.kind !== "item" || state.multiSelection.length) {
    return null;
  }
  const hitItem = findSelectedEntity();
  if (!hitItem) {
    return null;
  }
  const itemControls = itemControlHandles(hitItem);
  const handleHitRadiusPx = 9 / Math.max(state.viewTransform.zoom, 0.01);
  if (distance(hitPlanPoint, itemControls.rotationHandle) <= handleHitRadiusPx) {
    return {
      type: "rotate-item",
      item: hitItem,
      controls: itemControls
    };
  }
  const cornerHandle = itemControls.corners.find(
    handleCandidate => distance(hitPlanPoint, handleCandidate.point) <= handleHitRadiusPx
  );
  if (cornerHandle) {
    return {
      type: "resize-item",
      item: hitItem,
      controls: itemControls,
      corner: cornerHandle
    };
  } else {
    return null;
  }
}

/**
 * 由任意两个点构造轴对齐包围盒（不要求两点有序）。框选、橡皮筋矩形等都从「按下点 +
 */
export function boundsFromPoints(firstPoint: any, secondPoint: any) {
  return {
    minX: Math.min(firstPoint.x, secondPoint.x),
    minY: Math.min(firstPoint.y, secondPoint.y),
    maxX: Math.max(firstPoint.x, secondPoint.x),
    maxY: Math.max(firstPoint.y, secondPoint.y)
  };
}

/**
 * 框选命中测试：列出与矩形框相交 / 落入框内的所有实体。线性实体（墙、门窗、栏杆）用
 */
export function collectEntitiesInMarquee(marqueeStart: any, marqueeEnd: any) {
  const marqueeBounds = boundsFromPoints(marqueeStart, marqueeEnd);
  const marqueePixelsPerMeter = currentPixelsPerMeter() || 100;
  const hitEntities = [];
  const isLightPlanTab = state.activeAssetTab === "light";
  if (!isLightPlanTab) {
    for (const marqueeWall of state.activeScene.walls) {
      if (segmentIntersectsBounds(marqueeWall.start, marqueeWall.end, marqueeBounds)) {
        hitEntities.push({
          kind: "wall",
          id: marqueeWall.id
        });
      }
    }
    for (const marqueeWindow of state.activeScene.windows) {
      const marqueeWindowPlacement = openingPlacementInfo(marqueeWindow);
      if (
        marqueeWindowPlacement &&
        segmentIntersectsBounds(
          marqueeWindowPlacement.start,
          marqueeWindowPlacement.end,
          marqueeBounds
        )
      ) {
        hitEntities.push({
          kind: "window",
          id: marqueeWindow.id
        });
      }
    }
    for (const marqueeDoor of state.activeScene.doors) {
      const marqueeDoorPlacement = openingPlacementInfo(marqueeDoor);
      if (
        marqueeDoorPlacement &&
        segmentIntersectsBounds(marqueeDoorPlacement.start, marqueeDoorPlacement.end, marqueeBounds)
      ) {
        hitEntities.push({
          kind: "door",
          id: marqueeDoor.id
        });
      }
    }
    for (const marqueeRailing of state.activeScene.railings) {
      const marqueeRailingPlacement = openingPlacementInfo(marqueeRailing);
      if (
        marqueeRailingPlacement &&
        segmentIntersectsBounds(
          marqueeRailingPlacement.start,
          marqueeRailingPlacement.end,
          marqueeBounds
        )
      ) {
        hitEntities.push({
          kind: "railing",
          id: marqueeRailing.id
        });
      }
    }
  }
  const marqueeCorners = [
    {
      x: marqueeBounds.minX,
      y: marqueeBounds.minY
    },
    {
      x: marqueeBounds.maxX,
      y: marqueeBounds.minY
    },
    {
      x: marqueeBounds.maxX,
      y: marqueeBounds.maxY
    },
    {
      x: marqueeBounds.minX,
      y: marqueeBounds.maxY
    }
  ];
  for (const marqueeItem of state.activeScene.items) {
    if (LIGHT_ITEM_TYPES.has(marqueeItem.type) !== isLightPlanTab) {
      continue;
    }
    const marqueeItemRotationRad = (marqueeItem.rotation * Math.PI) / 180;
    const marqueeCosRotation = Math.cos(marqueeItemRotationRad);
    const marqueeSinRotation = Math.sin(marqueeItemRotationRad);
    const marqueeItemFootprint = itemPlanFootprint(marqueeItem);
    const marqueeHalfWidthPlan = (marqueeItemFootprint.width * marqueePixelsPerMeter) / 2;
    const marqueeHalfDepthPlan = (marqueeItemFootprint.depth * marqueePixelsPerMeter) / 2;
    const marqueeItemCorners = [
      [-marqueeHalfWidthPlan, -marqueeHalfDepthPlan],
      [marqueeHalfWidthPlan, -marqueeHalfDepthPlan],
      [marqueeHalfWidthPlan, marqueeHalfDepthPlan],
      [-marqueeHalfWidthPlan, marqueeHalfDepthPlan]
    ].map(([cornerLocalX, cornerLocalY]) => ({
      x: marqueeItem.x + cornerLocalX * marqueeCosRotation - cornerLocalY * marqueeSinRotation,
      y: marqueeItem.y + cornerLocalX * marqueeSinRotation + cornerLocalY * marqueeCosRotation
    }));
    if (
      pointInBounds(marqueeItem, marqueeBounds) ||
      marqueeItemCorners.some(itemCorner => pointInBounds(itemCorner, marqueeBounds)) ||
      marqueeCorners.some(marqueeCorner =>
        pointInRotatedRectangle(
          marqueeCorner,
          itemWithPlanFootprint(marqueeItem),
          marqueePixelsPerMeter
        )
      )
    ) {
      hitEntities.push({
        kind: "item",
        id: marqueeItem.id
      });
    }
  }
  return hitEntities;
}

export function syncMetricsCanvas() {
  if (!planCanvasElement.width || !planCanvasElement.height || !metricsContext) {
    return false;
  } else {
    if (metricsCanvas.width !== planCanvasElement.width) {
      metricsCanvas.width = planCanvasElement.width;
    }
    if (metricsCanvas.height !== planCanvasElement.height) {
      metricsCanvas.height = planCanvasElement.height;
    }
    metricsContext.setTransform(1, 0, 0, 1, 0, 0);
    metricsContext.clearRect(0, 0, metricsCanvas.width, metricsCanvas.height);
    metricsContext.drawImage(planCanvasElement, 0, 0);
    return true;
  }
}

export function blitMetricsCanvas({ offsetX: metricsOffsetX = 0, offsetY: metricsOffsetY = 0 } = {}) {
  if (
    !metricsCanvas.width ||
    !metricsCanvas.height ||
    metricsCanvas.width !== planCanvasElement.width ||
    metricsCanvas.height !== planCanvasElement.height
  ) {
    return false;
  }
  const metricsScaleX = planCanvasElement.width / Math.max(state.viewportWidthPx, 1);
  const metricsScaleY = planCanvasElement.height / Math.max(state.viewportHeightPx, 1);
  planContext.save();
  planContext.setTransform(1, 0, 0, 1, 0, 0);
  planContext.fillStyle = PLAN_PAPER();
  planContext.fillRect(0, 0, planCanvasElement.width, planCanvasElement.height);
  planContext.drawImage(
    metricsCanvas,
    Math.round(metricsOffsetX * metricsScaleX),
    Math.round(metricsOffsetY * metricsScaleY)
  );
  planContext.restore();
  return true;
}

export function hitTestEntityAt(hitTestPlanPoint: any) {
  const hitPixelsPerMeter = currentPixelsPerMeter() || 100;
  const hitLightTab = state.activeAssetTab === "light";
  for (const hitItemEntity of [...state.activeScene.items].reverse()) {
    if (
      LIGHT_ITEM_TYPES.has(hitItemEntity.type) === hitLightTab &&
      pointInRotatedRectangle(
        hitTestPlanPoint,
        itemWithPlanFootprint(hitItemEntity),
        hitPixelsPerMeter
      )
    ) {
      return {
        kind: "item",
        id: hitItemEntity.id
      };
    }
  }
  if (hitLightTab) {
    return null;
  }
  for (const hitWindow of [...state.activeScene.windows].reverse()) {
    const hitWindowPlacement = openingPlacementInfo(hitWindow);
    if (
      hitWindowPlacement &&
      projectPointToSegment(hitTestPlanPoint, hitWindowPlacement.start, hitWindowPlacement.end)
        .distance <=
        10 / state.viewTransform.zoom
    ) {
      return {
        kind: "window",
        id: hitWindow.id
      };
    }
  }
  for (const hitDoor of [...state.activeScene.doors].reverse()) {
    const hitDoorPlacement = openingPlacementInfo(hitDoor);
    if (
      hitDoorPlacement &&
      projectPointToSegment(hitTestPlanPoint, hitDoorPlacement.start, hitDoorPlacement.end)
        .distance <=
        12 / state.viewTransform.zoom
    ) {
      return {
        kind: "door",
        id: hitDoor.id
      };
    }
  }
  for (const hitRailing of [...state.activeScene.railings].reverse()) {
    const hitRailingPlacement = openingPlacementInfo(hitRailing);
    if (
      hitRailingPlacement &&
      projectPointToSegment(hitTestPlanPoint, hitRailingPlacement.start, hitRailingPlacement.end)
        .distance <=
        12 / state.viewTransform.zoom
    ) {
      return {
        kind: "railing",
        id: hitRailing.id
      };
    }
  }
  for (const hitWall of [...state.activeScene.walls].reverse()) {
    const hitWallHalfWidthPx = Math.max(
      (hitWall.thickness * hitPixelsPerMeter) / 2,
      8 / state.viewTransform.zoom
    );
    if (
      projectPointToSegment(hitTestPlanPoint, hitWall.start, hitWall.end).distance <=
      hitWallHalfWidthPx
    ) {
      return {
        kind: "wall",
        id: hitWall.id
      };
    }
  }
  return null;
}

/**
 * 吸附当前是否生效：用户没在设置里关掉吸附，且没有按住临时关闭键
 */
export function isSnapEnabled() {
  return state.activeScene.settings.snapEnabled !== false && !state.isSnapTemporarilyDisabled;
}

export function activateTool(toolName: any) {
  if (!(TOOL_HELP_TEXT as any)[toolName]) {
    return;
  }
  if (state.activeAssetTab === "light" && toolName !== "select") {
    showToast("灯光编辑中户型已锁定，请先切回家居或电器。");
    return;
  }
  const shouldWarnUnclosedWall =
    state.activeTool === "wall" && toolName !== "wall" && state.scalePointCount > 0;
  state.activeTool = toolName;
  planCanvasElement.dataset.tool = toolName;
  planCanvasElement.style.cursor = "";
  for (const toolButton of toolButtons) {
    toolButton.classList.toggle("active", (toolButton as any).dataset.tool === toolName);
  }
  [activeToolLabelElement.textContent, toolHelpElement.textContent] =
    state.activeAssetTab === "light"
      ? ["灯光编辑", "户型已锁定；框选多盏灯后可整体拖动，Shift 锁轴，Option/Alt 复制"]
      : (TOOL_HELP_TEXT as any)[toolName];
  finishWallButton.hidden = toolName !== "wall" || !state.scaleStartPoint;
  if (toolName !== "wall") {
    resetScaleInteractionState();
  }
  if (toolName !== "scale") {
    state.scalePreviewStart = null;
  }
  state.snapTarget = null;
  state.windowSnapTarget = null;
  state.doorSnapTarget = null;
  state.railingSnapTarget = null;
  renderPlanView();
  if (shouldWarnUnclosedWall) {
    showToast("当前墙线未闭合，不会生成地面；如果绘制的是隔墙，可以忽略此提醒。", "warning");
  }
}

export function ensureCalibration(fallbackTool = "scale") {
  if (currentPixelsPerMeter()) {
    return true;
  } else {
    showToast("请先画一条参考线并填写真实长度。", "error");
    activateTool(fallbackTool);
    return false;
  }
}

export function createSceneItem(newItemType: any, itemPosition: any, overrides: any = {}) {
  const typeDefinition = (ITEM_TYPE_DEFINITIONS as any)[newItemType];
  if (!typeDefinition || !ensureCalibration()) {
    return;
  }
  const newLightDefaults = (DEFAULT_LIGHT_SETTINGS as any)[newItemType] || DEFAULT_LIGHT_SETTINGS.downlight;
  const itemLightGroup = LIGHT_ITEM_TYPES.has(newItemType) ? ensureActiveLightGroup() : null;
  pushHistorySnapshot();
  const newItem = {
    id: createId("item"),
    type: newItemType,
    x: itemPosition.x,
    y: itemPosition.y,
    rotation: 0,
    width: overrides.width ?? typeDefinition.width,
    depth: overrides.depth ?? typeDefinition.depth,
    height: typeDefinition.height,
    elevation: typeDefinition.elevation || 0,
    color: typeDefinition.color,
    ...(newItemType === "planlabel"
      ? {
          title: "家庭总览",
          subtitle: "HOME PLAN",
          titleSpacing: 1.05,
          subtitleSpacing: 0.08,
          lineLength: 0.86
        }
      : {}),
    ...(["camera", "presence"].includes(newItemType)
      ? {
          verticalRotation: 0
        }
      : {}),
    ...(newItemType === "tv"
      ? {
          screenEnabled: true,
          screenLayerName: "电视画面 " + (televisionItems().length + 1),
          tvMountStyle: "standard",
          // 新电视默认壁挂：进深与离地高度都按挂装档位给（壁挂 60mm / 面板下沿 0.70m），
          depth: TELEVISION_MOUNT_DEPTHS.standard,
          elevation: TELEVISION_MOUNT_ELEVATIONS.standard
        }
      : {}),
    ...(newItemType === "smallcar"
      ? {
          chargingEnabled: false,
          chargingLayerName: "汽车充电 " + (carItems().length + 1)
        }
      : {}),
    ...(newItemType === "curtain"
      ? {
          curtainPosition: "split",
          ...normalizeCurtainTrack({
            curtainFabric: "cloth"
          })
        }
      : {}),
    ...(newItemType === "mural"
      ? {
          muralStyle: typeDefinition.muralStyle
        }
      : {}),
    ...(newItemType === "featurewall"
      ? {
          wallStyle: typeDefinition.wallStyle
        }
      : {}),
    ...(newItemType === "pillar"
      ? {
          pillarShape: typeDefinition.pillarShape,
          pillarAxis: typeDefinition.pillarAxis
        }
      : {}),
    ...(STAIR_DIRECTION_ITEM_TYPES.has(newItemType)
      ? {
          stairDirection: "right"
        }
      : {}),
    ...(newItemType === "shoecabinet"
      ? {
          shoeCabinetMirrored: false
        }
      : {}),
    ...(ROUND_TABLE_TURNTABLE_ITEM_TYPES.has(newItemType)
      ? {
          roundTableTurntable: false
        }
      : {}),
    ...(LIGHT_ITEM_TYPES.has(newItemType)
      ? {
          lightGroupId: itemLightGroup.id,
          verticalRotation: 0,
          ...(newItemType === "striplight"
            ? {
                stripAxis: "horizontal",
                stripRollRotation: 0,
                lightSourceVisible: true
              }
            : {}),
          lightTemperature: newLightDefaults.temperature,
          lightBrightness: newLightDefaults.brightness,
          lightRange: newLightDefaults.range,
          lightAngle: newLightDefaults.angle
        }
      : {})
  };
  normalizeLayerNames([newItem]);
  state.activeScene.items.push(newItem);
  setSelection("item", newItem.id);
  activateTool("select");
  refreshStudio(scopeForItem(newItem));
  markDocumentDirty();
}

export function beginExportRender() {
  window.clearTimeout(state.sceneUpdateTimer);
  state.sceneUpdateTimer = null;
  state.isExportRendering = true;
  window.clearTimeout(state.lightCacheSettleTimer);
  state.lightCacheSettleTimer = null;
  if (state.isLightCacheBuilding) {
    state.lightCacheRevision += 1;
    state.needsLightCacheRefresh = true;
  }
}

export function endExportRender() {
  window.clearTimeout(state.sceneUpdateTimer);
  state.sceneUpdateTimer = window.setTimeout(() => {
    state.sceneUpdateTimer = null;
    state.isExportRendering = false;
    if (pendingSceneUpdateScopes.size && !state.isSceneUpdateQueued) {
      const pendingRefreshScopes = [...pendingSceneUpdateScopes];
      const nextRefreshScope = pendingRefreshScopes.includes("all")
        ? "all"
        : pendingRefreshScopes[0];
      applySceneRefresh({
        scope: nextRefreshScope,
        preserveLightCache: !state.shouldInvalidateLightCache
      });
    }
    if (state.needsLightCacheRefresh) {
      scheduleLightCacheBuild(420);
    }
    if (state.isPrecompilePending) {
      schedulePreviewRebuild();
    }
  }, 120);
}

/** 平面占位是否无法直接用「宽 x 深」表示、必须另行推导。 */
export function itemFootprintSwapped(item: any) {
  return pillarIsLying(item) || stripIsStanding(item);
}

/** 返回同一个物件，但把平面占位写进 width/depth，供整件级别的辅助函数使用。 */
export function itemWithPlanFootprint(item: any) {
  if (!itemFootprintSwapped(item)) {
    return item;
  }
  const footprint = itemPlanFootprint(item);
  return {
    ...item,
    width: footprint.width,
    depth: footprint.depth
  };
}

export function resolveSnapTarget(snapPointInput: any, anchor: any, forceOrthogonal = false) {
  const snapPixelsPerMeter = currentPixelsPerMeter() || 100;
  if (!isSnapEnabled()) {
    if (forceOrthogonal && anchor) {
      const axisLockedResult = axisLockedPoint(snapPointInput, anchor);
      return {
        ...axisLockedResult,
        kind: "axis",
        distance: distance(snapPointInput, axisLockedResult.point)
      };
    }
    return {
      point: {
        ...snapPointInput
      },
      kind: null,
      label: "",
      distance: 0
    };
  }
  const snapSettings = state.activeScene.settings;
  return snapPoint(snapPointInput, state.activeScene.walls, {
    zoom: state.viewTransform.zoom,
    screenTolerance: clamp(Math.round(finite(snapSettings.snapTolerance, 13)), 6, 24),
    anchor: anchor,
    forceOrthogonalAxis: forceOrthogonal,
    preferVerticalAxis: snapSettings.snapOrthogonal !== false,
    angleStepDegrees: 15,
    gridSize: snapPixelsPerMeter * 0.1,
    intersections:
      snapSettings.snapIntersections === false ? [] : wallIntersectionsForWalls(snapPixelsPerMeter),
    snapEndpoints: snapSettings.snapEndpoints !== false,
    snapIntersections: snapSettings.snapIntersections !== false,
    snapSegments: snapSettings.snapSegments !== false,
    snapOrthogonal: snapSettings.snapOrthogonal !== false,
    snapAngles: snapSettings.snapAngles !== false,
    snapGrid: snapSettings.snapGrid !== false
  });
}

export function updateSnapIndicator(shiftKey = state.snapOverridePoint) {
  if (!state.scaleAnchorPoint) {
    return;
  }
  state.scalePreviewCurrent = {
    ...state.scaleAnchorPoint
  };
  const scalePixelsPerMeter = currentPixelsPerMeter() || 100;
  const snapDisabledLabel = state.isSnapTemporarilyDisabled ? "吸附：临时关闭" : "吸附：关闭";
  if (state.activeTool === "scale" && state.scalePreviewStart && shiftKey) {
    const scaleAxisLocked = axisLockedPoint(state.scaleAnchorPoint, state.scalePreviewStart);
    state.scalePreviewCurrent = scaleAxisLocked.point;
    state.snapTarget = null;
    snapIndicatorElement.textContent = "吸附：" + scaleAxisLocked.label;
  } else if (state.activeTool === "scale") {
    state.snapTarget = null;
    snapIndicatorElement.textContent = "吸附：自由";
  }
  cursorPositionElement.textContent =
    "X " +
    (state.scalePreviewCurrent.x / scalePixelsPerMeter).toFixed(2) +
    " m · Y " +
    (state.scalePreviewCurrent.y / scalePixelsPerMeter).toFixed(2) +
    " m";
  if (state.activeTool === "wall") {
    state.snapTarget = resolveSnapTarget(state.scaleAnchorPoint, state.scaleStartPoint, shiftKey);
    snapIndicatorElement.textContent = isSnapClosingSpace(state.snapTarget)
      ? "闭合：点击闭合空间"
      : state.snapTarget.kind
        ? (!isSnapEnabled() && shiftKey ? "锁定" : "吸附") + "：" + state.snapTarget.label
        : isSnapEnabled()
          ? "吸附：自由"
          : snapDisabledLabel;
  } else if (["window", "door", "railing"].includes(state.activeTool)) {
    const scaleWallHit = nearestWall(
      state.scalePreviewCurrent,
      state.activeScene.walls,
      16 / state.viewTransform.zoom
    );
    if (scaleWallHit) {
      const previewDoorDimensions =
        DOOR_TYPE_DIMENSIONS[selectedDoorType] || DOOR_TYPE_DIMENSIONS.solid;
      const scalePreviewPoint = {
        width:
          state.activeTool === "door" ? previewDoorDimensions.width : state.activeTool === "railing" ? 2 : 1.4,
        t: scaleWallHit.t
      };
      const openingSnapTarget = {
        wall: scaleWallHit.wall,
        t: clampWindowT(scaleWallHit.wall, scalePreviewPoint, scalePixelsPerMeter)
      };
      state.windowSnapTarget = state.activeTool === "window" ? openingSnapTarget : null;
      state.doorSnapTarget = state.activeTool === "door" ? openingSnapTarget : null;
      state.railingSnapTarget = state.activeTool === "railing" ? openingSnapTarget : null;
      snapIndicatorElement.textContent =
        state.activeTool === "door"
          ? "吸附：墙体门洞"
          : state.activeTool === "railing"
            ? "吸附：墙体栏杆"
            : "吸附：墙体";
    } else {
      state.windowSnapTarget = null;
      state.doorSnapTarget = null;
      state.railingSnapTarget = null;
      snapIndicatorElement.textContent = "吸附：未找到墙体";
    }
  } else if (state.activeTool === "pan") {
    state.snapTarget = null;
    state.windowSnapTarget = null;
    state.doorSnapTarget = null;
    state.railingSnapTarget = null;
    snapIndicatorElement.textContent = isSnapEnabled() ? "吸附：开启" : snapDisabledLabel;
    planCanvasElement.style.cursor = "";
  } else if (state.activeTool !== "scale") {
    state.snapTarget = null;
    state.windowSnapTarget = null;
    state.doorSnapTarget = null;
    state.railingSnapTarget = null;
    snapIndicatorElement.textContent = isSnapEnabled() ? "吸附：开启" : snapDisabledLabel;
    const scaleItemHandle = hitTestItemHandle(state.scalePreviewCurrent);
    planCanvasElement.style.cursor =
      scaleItemHandle?.type === "rotate-item"
        ? "grab"
        : scaleItemHandle?.type === "resize-item"
          ? "nwse-resize"
          : "";
  }
}

/**
 * 记录本次指针位置并刷新吸附预览（指针移动过程中每个事件都会调用）。
 * @param {object} snapPointerEvent 指针事件（读 shiftKey 与屏幕坐标）。
 */
export function beginPointerScale(snapPointerEvent: any) {
  state.snapOverridePoint = snapPointerEvent.shiftKey;
  state.scaleAnchorPoint = screenToPlan(canvasPointFromEvent(snapPointerEvent));
  updateSnapIndicator();
}

/**
 * 平面画布按下指针的总分发器（左键 / 中键）。按下先聚焦画布，再按优先级判定命中：平移、楼层对齐、各绘制工具
 */
export function onPlanCanvasPointerDown(canvasPointerEvent: any) {
  if (canvasPointerEvent.button !== 0 && canvasPointerEvent.button !== 1) {
    return;
  }
  planCanvasElement.focus({
    preventScroll: true
  });
  const downScreenPoint = canvasPointFromEvent(canvasPointerEvent);
  const pointerPlanPoint = screenToPlan(downScreenPoint);
  if (canvasPointerEvent.button === 1 || state.isPanning || state.activeTool === "pan") {
    canvasPointerEvent.preventDefault();
    beginExportRender();
    state.pointerInteraction = {
      type: "pan",
      pointerId: canvasPointerEvent.pointerId,
      screen: rotateScreenPoint(downScreenPoint),
      visibleScreen: downScreenPoint,
      offsetX: state.viewTransform.offsetX,
      offsetY: state.viewTransform.offsetY
    };
    planCanvasElement.classList.add("panning");
    syncMetricsCanvas();
    capturePointer(planCanvasElement, canvasPointerEvent.pointerId);
    return;
  }
  if (state.floorAlignState && handleFloorAlignClick(pointerPlanPoint)) {
    return;
  }
  if (state.activeTool === "flooropening") {
    if (!ensureCalibration()) {
      return;
    }
    canvasPointerEvent.preventDefault();
    beginExportRender();
    state.pointerInteraction = {
      type: "draw-flooropening",
      pointerId: canvasPointerEvent.pointerId,
      start: pointerPlanPoint,
      current: pointerPlanPoint
    };
    capturePointer(planCanvasElement, canvasPointerEvent.pointerId);
    return;
  }
  if (state.activeTool === "scale") {
    if (!state.scalePreviewStart) {
      state.scalePreviewStart = pointerPlanPoint;
      renderPlanView();
      return;
    }
    const axisLockedPlanPoint = canvasPointerEvent.shiftKey
      ? axisLockedPoint(pointerPlanPoint, state.scalePreviewStart).point
      : pointerPlanPoint;
    if (distance(state.scalePreviewStart, axisLockedPlanPoint) < 12 / state.viewTransform.zoom) {
      showToast("参考线太短，请重新选择终点。", "error");
      return;
    }
    state.scaleReferenceLine = {
      start: state.scalePreviewStart,
      end: axisLockedPlanPoint
    };
    state.scalePreviewStart = null;
    referencePixelsElement.textContent =
      Math.round(distance(state.scaleReferenceLine.start, state.scaleReferenceLine.end)) + " px";
    referenceMetersInput.value = state.activeScene.calibration?.reference?.meters || 3;
    scaleDialogElement.showModal();
    requestAnimationFrame(() => referenceMetersInput.select());
    renderPlanView();
    return;
  }
  if (state.activeTool === "wall") {
    if (!ensureCalibration()) {
      return;
    }
    const snapResult = resolveSnapTarget(
      pointerPlanPoint,
      state.scaleStartPoint,
      canvasPointerEvent.shiftKey
    );
    if (!state.scaleStartPoint) {
      state.scaleStartPoint = {
        ...snapResult.point
      };
      state.snapEndpointCandidate = {
        ...snapResult.point
      };
      state.scalePointCount = 0;
      finishWallButton.hidden = false;
      renderPlanView();
      return;
    }
    if (distance(state.scaleStartPoint, snapResult.point) < currentPixelsPerMeter() * 0.08) {
      showToast("墙段太短，请选择更远的终点。", "error");
      return;
    }
    const wallDraft = {
      id: createId("wall"),
      start: {
        ...state.scaleStartPoint
      },
      end: {
        ...snapResult.point
      },
      height: state.activeScene.settings.wallHeight,
      thickness: state.activeScene.settings.wallThickness
    };
    const minSegmentLength = Math.max(0.75, currentPixelsPerMeter() * 0.01);
    const uncoveredSegments = uncoveredCollinearWallSegments(
      wallDraft,
      state.activeScene.walls,
      minSegmentLength
    );
    if (!uncoveredSegments.length) {
      state.scaleStartPoint = {
        ...snapResult.point
      };
      showToast("该位置已有墙体，已跳过重复墙段。");
      renderPlanView();
      return;
    }
    const shouldAutoCloseWall =
      uncoveredSegments.length !== 1 ||
      distance(uncoveredSegments[0].start, wallDraft.start) > minSegmentLength ||
      distance(uncoveredSegments[0].end, wallDraft.end) > minSegmentLength;
    pushHistorySnapshot();
    const mergeTolerance = Math.max(1, currentPixelsPerMeter() * 0.01);
    const closedPolygonCount = closedWallPolygons(state.activeScene.walls, mergeTolerance).length;
    const newWalls = uncoveredSegments.map((segment, segmentIndex) => ({
      ...wallDraft,
      id: segmentIndex === 0 ? wallDraft.id : createId("wall"),
      start: segment.start,
      end: segment.end
    }));
    state.activeScene.walls.push(...newWalls);
    refreshSplitGeometry();
    state.scalePointCount += 1;
    const didCloseWalls =
      closedWallPolygons(state.activeScene.walls, mergeTolerance).length > closedPolygonCount;
    if (didCloseWalls) {
      resetScaleInteractionState();
    } else {
      state.scaleStartPoint = {
        ...snapResult.point
      };
    }
    setSelection("wall", newWalls[0].id);
    finishWallButton.hidden = didCloseWalls;
    refreshStudio();
    markDocumentDirty();
    if (didCloseWalls) {
      showToast("空间已闭合，地面已生成。可继续绘制下一个空间。", "success");
    } else if (shouldAutoCloseWall) {
      showToast("已跳过与现有墙体重合的部分。", "success");
    }
    return;
  }
  if (state.activeTool === "window") {
    if (!ensureCalibration()) {
      return;
    }
    const windowWallHit = nearestWall(pointerPlanPoint, state.activeScene.walls, 18 / state.viewTransform.zoom);
    if (!windowWallHit) {
      showToast("请靠近一段墙体放置窗户。", "error");
      return;
    }
    pushHistorySnapshot();
    const newWindow = {
      id: createId("window"),
      wallId: windowWallHit.wall.id,
      t: windowWallHit.t,
      width: 1.4,
      height: 1.35,
      sill: 0.85
    };
    newWindow.t = clampWindowT(windowWallHit.wall, newWindow, currentPixelsPerMeter());
    state.activeScene.windows.push(newWindow);
    const windowScope = currentLightScope();
    setSelection("window", newWindow.id);
    refreshStudio("architecture");
    requestSceneRefresh(windowScope);
    markDocumentDirty();
    return;
  }
  if (state.activeTool === "door") {
    if (!ensureCalibration()) {
      return;
    }
    const doorWallHit = nearestWall(pointerPlanPoint, state.activeScene.walls, 18 / state.viewTransform.zoom);
    if (!doorWallHit) {
      showToast("请靠近一段墙体放置门。", "error");
      return;
    }
    pushHistorySnapshot();
    const placedDoorDimensions =
      DOOR_TYPE_DIMENSIONS[selectedDoorType] || DOOR_TYPE_DIMENSIONS.solid;
    const newDoor = {
      id: createId("door"),
      wallId: doorWallHit.wall.id,
      t: doorWallHit.t,
      width: placedDoorDimensions.width,
      height: placedDoorDimensions.height,
      sill: 0,
      doorType: selectedDoorType,
      hinge: "left",
      swing: 1
    };
    newDoor.t = clampWindowT(doorWallHit.wall, newDoor, currentPixelsPerMeter());
    state.activeScene.doors.push(newDoor);
    const doorScope = currentLightScope();
    setSelection("door", newDoor.id);
    refreshStudio("architecture");
    requestSceneRefresh(doorScope);
    markDocumentDirty();
    return;
  }
  if (state.activeTool === "railing") {
    if (!ensureCalibration()) {
      return;
    }
    const railingWallHit = nearestWall(
      pointerPlanPoint,
      state.activeScene.walls,
      18 / state.viewTransform.zoom
    );
    if (!railingWallHit) {
      showToast("请靠近一段墙体放置栏杆。", "error");
      return;
    }
    pushHistorySnapshot();
    const newRailing = {
      id: createId("railing"),
      wallId: railingWallHit.wall.id,
      t: railingWallHit.t,
      width: 2,
      height: 1.1,
      sill: 0
    };
    newRailing.t = clampWindowT(railingWallHit.wall, newRailing, currentPixelsPerMeter());
    state.activeScene.railings.push(newRailing);
    const railingScope = currentLightScope();
    setSelection("railing", newRailing.id);
    refreshStudio("architecture");
    requestSceneRefresh(railingScope);
    markDocumentDirty();
    return;
  }
  if (state.activeTool === "label") {
    createSceneItem("planlabel", pointerPlanPoint);
    return;
  }
  const downItemHandle: any = hitTestItemHandle(pointerPlanPoint);
  if (downItemHandle) {
    beginExportRender();
    const originalItemSnapshot = {
      ...downItemHandle.item
    };
    state.pointerInteraction =
      downItemHandle.type === "resize-item"
        ? {
            type: "resize-item",
            pointerId: canvasPointerEvent.pointerId,
            originalItem: originalItemSnapshot,
            handle: {
              x: downItemHandle.corner.x,
              y: downItemHandle.corner.y
            },
            anchor: {
              ...downItemHandle.corner.opposite
            },
            before: cloneSceneForHistory(),
            moved: false
          }
        : {
            type: "rotate-item",
            pointerId: canvasPointerEvent.pointerId,
            originalItem: originalItemSnapshot,
            center: {
              x: originalItemSnapshot.x,
              y: originalItemSnapshot.y
            },
            startPointer: {
              ...pointerPlanPoint
            },
            before: cloneSceneForHistory(),
            moved: false
          };
    capturePointer(planCanvasElement, canvasPointerEvent.pointerId);
    return;
  }
  const dragScope = currentLightScope();
  const hitEntity = hitTestEntityAt(pointerPlanPoint);
  if (!hitEntity) {
    beginExportRender();
    if (!canvasPointerEvent.shiftKey) {
      clearSelection();
    }
    state.pointerInteraction = {
      type: "marquee",
      pointerId: canvasPointerEvent.pointerId,
      start: pointerPlanPoint,
      current: pointerPlanPoint,
      additive: canvasPointerEvent.shiftKey,
      moved: false
    };
    renderInspector();
    renderPlanView();
    syncMetricsCanvas();
    if (!canvasPointerEvent.shiftKey) {
      requestSceneRefresh(dragScope);
    }
    capturePointer(planCanvasElement, canvasPointerEvent.pointerId);
    return;
  }
  beginExportRender();
  const historySnapshot = hitEntity.kind === "item" ? cloneSceneForHistory() : null;
  const isMultiItemDrag =
    hitEntity.kind === "item" && state.multiSelection.length > 0 && isSelected("item", hitEntity.id);
  let draggedItems: any = [];
  let didCopyItems = false;
  if (hitEntity.kind === "item") {
    if (isMultiItemDrag) {
      const multiSelectedItemIds = new Set(
        state.multiSelection
          .filter((filteredSelection: any) => filteredSelection.kind === "item")
          .map((mappedSelection: any) => mappedSelection.id)
      );
      draggedItems = state.activeScene.items.filter((selectedIdItem: any) =>
        multiSelectedItemIds.has(selectedIdItem.id)
      );
    } else {
      setSelection("item", hitEntity.id);
      const hitSceneItem = state.activeScene.items.find(
        (hitItemRecord: any) => hitItemRecord.id === hitEntity.id
      );
      if (hitSceneItem) {
        draggedItems = [hitSceneItem];
      }
    }
    if (canvasPointerEvent.altKey && draggedItems.length) {
      const clonedItems = draggedItems.map((draggedItem: any) => ({
        ...structuredClone(draggedItem),
        id: createId("item")
      }));
      normalizeLayerNames(clonedItems);
      state.activeScene.items.push(...clonedItems);
      draggedItems = clonedItems;
      if (clonedItems.length === 1) {
        setSelection("item", clonedItems[0].id);
      } else {
        state.primarySelection = null;
        state.multiSelection = clonedItems.map((clonedSelectionItem: any) => ({
          kind: "item",
          id: clonedSelectionItem.id
        }));
      }
      didCopyItems = true;
    }
  } else {
    setSelection(hitEntity.kind, hitEntity.id);
  }
  renderInspector();
  renderPlanView();
  requestSceneRefresh(dragScope);
  const previewScope = currentSelectionScope();
  if (hitEntity.kind === "item") {
    state.pointerInteraction = {
      type: "move-items",
      pointerId: canvasPointerEvent.pointerId,
      start: pointerPlanPoint,
      originals: draggedItems.map((draggedOriginal: any) => ({
        id: draggedOriginal.id,
        x: draggedOriginal.x,
        y: draggedOriginal.y
      })),
      before: historySnapshot,
      copied: didCopyItems,
      previewScope: previewScope,
      moved: false
    };
  } else if (["window", "door", "railing"].includes(hitEntity.kind)) {
    state.pointerInteraction = {
      type: "move-opening",
      pointerId: canvasPointerEvent.pointerId,
      start: pointerPlanPoint,
      before: cloneSceneForHistory(),
      previewScope: "architecture",
      moved: false
    };
  }
  if (state.pointerInteraction) {
    capturePointer(planCanvasElement, canvasPointerEvent.pointerId);
  } else {
    endExportRender();
  }
}

export function onPlanCanvasPointerMove(moveEvent: any) {
  const moveScreenPoint = canvasPointFromEvent(moveEvent);
  const movePlanPoint = screenToPlan(moveScreenPoint);
  if (state.pointerInteraction?.pointerId === moveEvent.pointerId) {
    if (state.pointerInteraction.type === "draw-flooropening") {
      state.pointerInteraction.current = moveEvent.shiftKey
        ? (() => {
            const pointerDeltaX = movePlanPoint.x - state.pointerInteraction.start.x;
            const pointerDeltaY = movePlanPoint.y - state.pointerInteraction.start.y;
            const axisDelta = Math.max(Math.abs(pointerDeltaX), Math.abs(pointerDeltaY));
            return {
              x: state.pointerInteraction.start.x + Math.sign(pointerDeltaX || 1) * axisDelta,
              y: state.pointerInteraction.start.y + Math.sign(pointerDeltaY || 1) * axisDelta
            };
          })()
        : movePlanPoint;
      renderPlanView();
      return;
    }
    if (state.pointerInteraction.type === "marquee") {
      state.pointerInteraction.current = movePlanPoint;
      state.pointerInteraction.moved =
        distance(state.pointerInteraction.start, movePlanPoint) * state.viewTransform.zoom >= 4;
      if (blitMetricsCanvas()) {
        drawMarqueeOverlay();
      } else {
        renderPlanView();
      }
      return;
    }
    if (state.pointerInteraction.type === "pan") {
      const rotatedScreenPoint = rotateScreenPoint(moveScreenPoint);
      state.viewTransform.offsetX =
        state.pointerInteraction.offsetX + rotatedScreenPoint.x - state.pointerInteraction.screen.x;
      state.viewTransform.offsetY =
        state.pointerInteraction.offsetY + rotatedScreenPoint.y - state.pointerInteraction.screen.y;
      const panDeltaX = moveScreenPoint.x - state.pointerInteraction.visibleScreen.x;
      const panDeltaY = moveScreenPoint.y - state.pointerInteraction.visibleScreen.y;
      if (
        !blitMetricsCanvas({
          offsetX: panDeltaX,
          offsetY: panDeltaY
        })
      ) {
        renderPlanView();
      }
      return;
    }
    if (state.pointerInteraction.type === "move-items") {
      if (
        !state.pointerInteraction.moved &&
        distance(movePlanPoint, state.pointerInteraction.start) * state.viewTransform.zoom < 3
      ) {
        return;
      }
      const gridStep = currentPixelsPerMeter() * 0.05;
      const shouldSnapToGrid = isSnapEnabled() && state.activeScene.settings.snapGrid !== false;
      let moveDeltaX = movePlanPoint.x - state.pointerInteraction.start.x;
      let moveDeltaY = movePlanPoint.y - state.pointerInteraction.start.y;
      if (moveEvent.shiftKey) {
        if (Math.abs(moveDeltaX) >= Math.abs(moveDeltaY)) {
          moveDeltaY = 0;
        } else {
          moveDeltaX = 0;
        }
      }
      const itemsById = new Map<any, any>(
        state.activeScene.items.map((indexedItem: any) => [indexedItem.id, indexedItem])
      );
      for (const originalItem of state.pointerInteraction.originals) {
        const draggedLiveItem = itemsById.get(originalItem.id);
        if (draggedLiveItem) {
          draggedLiveItem.x = shouldSnapToGrid
            ? Math.round((originalItem.x + moveDeltaX) / gridStep) * gridStep
            : originalItem.x + moveDeltaX;
          draggedLiveItem.y = shouldSnapToGrid
            ? Math.round((originalItem.y + moveDeltaY) / gridStep) * gridStep
            : originalItem.y + moveDeltaY;
        }
      }
      state.pointerInteraction.moved = state.pointerInteraction.originals.some((original: any) => {
        const comparedLiveItem = itemsById.get(original.id);
        return (
          comparedLiveItem &&
          (Math.abs(comparedLiveItem.x - original.x) > 0.000001 ||
            Math.abs(comparedLiveItem.y - original.y) > 0.000001)
        );
      });
      renderPlanView();
      return;
    }
    if (state.pointerInteraction.type === "resize-item") {
      if (
        !state.pointerInteraction.moved &&
        distance(movePlanPoint, state.pointerInteraction.handle) * state.viewTransform.zoom < 3
      ) {
        return;
      }
      const resizedSelectedItem = findSelectedEntity();
      if (!resizedSelectedItem) {
        return;
      }
      // 平躺的立柱按平面足迹（宽 × 长）缩放，因此先取带足迹的副本参与缩放，
      const resizeSourceItem = itemWithPlanFootprint(state.pointerInteraction.originalItem);
      const originalHeight = Math.max(finite(resizeSourceItem.height, 0.05), 0.001);
      const minFootprint = itemMinimumFootprint(resizeSourceItem.type);
      const resizeConstraints = moveEvent.shiftKey
        ? {
            minimum: Math.max(
              minFootprint / Math.max(resizeSourceItem.width, minFootprint),
              minFootprint / Math.max(resizeSourceItem.depth, minFootprint),
              itemMinimumHeight(resizeSourceItem.type) / originalHeight
            ),
            maximum: Math.min(
              8 / Math.max(resizeSourceItem.width, minFootprint),
              8 / Math.max(resizeSourceItem.depth, minFootprint),
              6 / originalHeight
            )
          }
        : undefined;
      const resizedItem = resizeRotatedItemFromCorner(
        resizeSourceItem,
        state.pointerInteraction.handle,
        state.pointerInteraction.anchor,
        movePlanPoint,
        currentPixelsPerMeter() || 1,
        moveEvent.shiftKey,
        {
          ...resizeConstraints,
          minimumDimension: minFootprint
        }
      );
      Object.assign(
        resizedSelectedItem,
        itemFromPlanFootprintResize(state.pointerInteraction.originalItem, resizedItem)
      );
      if (
        resizedSelectedItem.type === "curtain" &&
        normalizeCurtainTrack(resizedSelectedItem).curtainTrack !== "straight"
      ) {
        const resizeOriginalItem = state.pointerInteraction.originalItem;
        const dragCurtainTrack = normalizeCurtainTrack(resizeOriginalItem);
        const curtainScaleRatio =
          Math.max(0.2, resizedSelectedItem.depth - 0.18) /
          Math.max(0.2, resizeOriginalItem.depth - 0.18);
        Object.assign(
          resizedSelectedItem,
          normalizeCurtainTrack({
            ...resizedSelectedItem,
            curtainLeftLength: dragCurtainTrack.curtainLeftLength * curtainScaleRatio,
            curtainRightLength: dragCurtainTrack.curtainRightLength * curtainScaleRatio
          })
        );
        resizedSelectedItem.depth = curtainFootprintDepth(resizedSelectedItem);
      }
      state.pointerInteraction.moved =
        Math.abs(resizedSelectedItem.x - state.pointerInteraction.originalItem.x) > 0.000001 ||
        Math.abs(resizedSelectedItem.y - state.pointerInteraction.originalItem.y) > 0.000001 ||
        Math.abs(resizedSelectedItem.width - state.pointerInteraction.originalItem.width) > 0.000001 ||
        Math.abs(resizedSelectedItem.depth - state.pointerInteraction.originalItem.depth) > 0.000001 ||
        Math.abs(resizedSelectedItem.height - state.pointerInteraction.originalItem.height) > 0.000001;
      renderPlanView();
      return;
    }
    if (state.pointerInteraction.type === "rotate-item") {
      if (
        !state.pointerInteraction.moved &&
        distance(movePlanPoint, state.pointerInteraction.startPointer) * state.viewTransform.zoom < 3
      ) {
        return;
      }
      const rotatedItem = findSelectedEntity();
      if (!rotatedItem) {
        return;
      }
      rotatedItem.rotation = itemRotationFromPointers(
        state.pointerInteraction.originalItem.rotation,
        state.pointerInteraction.center,
        state.pointerInteraction.startPointer,
        movePlanPoint,
        moveEvent.shiftKey ? 15 : 0
      );
      state.pointerInteraction.moved =
        Math.abs(rotatedItem.rotation - state.pointerInteraction.originalItem.rotation) > 0.000001;
      renderPlanView();
      return;
    }
    if (state.pointerInteraction.type === "move-opening") {
      if (
        !state.pointerInteraction.moved &&
        distance(movePlanPoint, state.pointerInteraction.start) * state.viewTransform.zoom < 3
      ) {
        return;
      }
      const openingEntity = findSelectedEntity();
      const openingWall = state.activeScene.walls.find(
        (openingWallRecord: any) => openingWallRecord.id === openingEntity?.wallId
      );
      if (!openingEntity || !openingWall) {
        return;
      }
      openingEntity.t = clampWindowT(
        openingWall,
        {
          ...openingEntity,
          t: projectPointToSegment(movePlanPoint, openingWall.start, openingWall.end).t
        },
        currentPixelsPerMeter()
      );
      const originalOpening = state.pointerInteraction.before?.[state.primarySelection?.kind + "s"]?.find?.(
        (openingSnapshot: any) => openingSnapshot.id === openingEntity.id
      );
      state.pointerInteraction.moved =
        !originalOpening || Math.abs(openingEntity.t - originalOpening.t) > 0.000001;
      renderPlanView();
      return;
    }
  }
  beginPointerScale(moveEvent);
  if (state.floorAlignState || ["scale", "wall", "window", "door", "railing"].includes(state.activeTool)) {
    renderPlanView();
  }
}

/**
 * 相机手势的合并帧回调：把一帧内的多次指针移动合成一次处理。先清帧句柄再取状态，这样回调过程中再次调度不会被覆盖 ——
 */
export function onCameraGestureFrame() {
  state.cameraGestureFrame = 0;
  const gestureState = state.cameraGestureState;
  state.cameraGestureState = null;
  if (gestureState) {
    onPlanCanvasPointerMove(gestureState);
  }
}

export function endCameraGesture(pointerId: any) {
  if (!!state.cameraGestureState && state.cameraGestureState.pointerId === pointerId) {
    if (state.cameraGestureFrame) {
      cancelAnimationFrame(state.cameraGestureFrame);
    }
    onCameraGestureFrame();
  }
}

/**
 * 滚轮缩放的沉降帧回调：把累积的目标缩放一次性应用到视图。
 * @returns {void}
 */
export function onCameraSettleFrame() {
  state.cameraSettleFrame = 0;
  const targetZoom = state.cameraTargetZoom;
  const settleTargetPoint = state.cameraTargetPoint;
  state.cameraTargetZoom = 1;
  state.cameraTargetPoint = null;
  if (settleTargetPoint && Math.abs(targetZoom - 1) > 1e-8) {
    zoomViewAt(targetZoom, settleTargetPoint);
  }
}

export function onPlanCanvasWheel(wheelEvent: any) {
  state.cameraTargetZoom *= Math.exp(-wheelEvent.deltaY * 0.0012);
  state.cameraTargetPoint = canvasPointFromEvent(wheelEvent);
  beginExportRender();
  state.cameraSettleFrame ||= requestAnimationFrame(onCameraSettleFrame);
  window.clearTimeout(state.cameraSettleTimer);
  state.cameraSettleTimer = window.setTimeout(() => {
    state.cameraSettleTimer = null;
    if (state.cameraSettleFrame) {
      cancelAnimationFrame(state.cameraSettleFrame);
      onCameraSettleFrame();
    }
    endExportRender();
  }, 90);
}

export function onPlanCanvasPointerUp(releaseEvent: any) {
  if (!state.pointerInteraction || state.pointerInteraction.pointerId !== releaseEvent.pointerId) {
    return;
  }
  if (state.pointerInteraction.type === "draw-flooropening") {
    const { start: marqueeStartPoint, current: currentPoint } = state.pointerInteraction;
    releasePointer(planCanvasElement, releaseEvent.pointerId);
    state.pointerInteraction = null;
    endExportRender();
    const marqueeWidth = Math.abs(currentPoint.x - marqueeStartPoint.x) / currentPixelsPerMeter();
    const marqueeDepth = Math.abs(currentPoint.y - marqueeStartPoint.y) / currentPixelsPerMeter();
    if (releaseEvent.type !== "pointercancel" && marqueeWidth >= 0.1 && marqueeDepth >= 0.1) {
      createSceneItem(
        "flooropening",
        {
          x: (marqueeStartPoint.x + currentPoint.x) / 2,
          y: (marqueeStartPoint.y + currentPoint.y) / 2
        },
        {
          width: Math.min(20, marqueeWidth),
          depth: Math.min(20, marqueeDepth)
        }
      );
    } else {
      renderPlanView();
    }
    return;
  }
  if (state.pointerInteraction.type === "marquee") {
    const marqueeScope = currentLightScope();
    const additiveEntities = state.pointerInteraction.additive
      ? [...(state.primarySelection ? [state.primarySelection] : []), ...state.multiSelection]
      : [];
    const marqueeEntities = state.pointerInteraction.moved
      ? collectEntitiesInMarquee(state.pointerInteraction.start, state.pointerInteraction.current)
      : [];
    const selectedEntities = [
      ...new Map(
        [...additiveEntities, ...marqueeEntities].map(entity => [
          entity.kind + ":" + entity.id,
          entity
        ])
      ).values()
    ];
    if (selectedEntities.length === 1) {
      setSelection(selectedEntities[0].kind, selectedEntities[0].id);
    } else {
      state.primarySelection = null;
      state.multiSelection = selectedEntities;
    }
    releasePointer(planCanvasElement, releaseEvent.pointerId);
    state.pointerInteraction = null;
    renderInspector();
    renderPlanView();
    requestSceneRefresh(marqueeScope);
    endExportRender();
    return;
  }
  const interaction = state.pointerInteraction;
  const didChangeScene = interaction.moved || interaction.copied;
  if (didChangeScene) {
    pushHistoryEntry(state.pointerInteraction.before);
    markDocumentDirty();
  }
  if (["move-items", "resize-item", "rotate-item", "move-opening"].includes(interaction.type)) {
    renderInspector();
  }
  if (didChangeScene && interaction.type === "move-opening") {
    applySceneRefresh({
      scope: "architecture"
    });
  } else if (
    didChangeScene &&
    ["move-items", "resize-item", "rotate-item"].includes(interaction.type)
  ) {
    const previewedSelectedItem = findSelectedEntity();
    applySceneRefresh({
      scope:
        interaction.previewScope ||
        (previewedSelectedItem ? scopeForItem(previewedSelectedItem) : currentSelectionScope())
    });
  }
  if (state.pointerInteraction.type === "pan") {
    planCanvasElement.classList.remove("panning");
  }
  releasePointer(planCanvasElement, releaseEvent.pointerId);
  state.pointerInteraction = null;
  if (interaction.type === "pan") {
    renderPlanView();
  }
  endExportRender();
}

/**
 * 指针结束的统一入口：先结束相机手势，再走抬起的收尾逻辑。
 * @param {PointerEvent} endEvent 指针事件（pointerup / pointercancel）。
 */
export function onPlanCanvasPointerEnd(endEvent: any) {
  endCameraGesture(endEvent.pointerId);
  onPlanCanvasPointerUp(endEvent);
}
