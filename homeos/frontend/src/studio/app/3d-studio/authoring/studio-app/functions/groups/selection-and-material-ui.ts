import type { StudioAppRuntime } from "../../runtime/studio-app-runtime";
import { describeDoorMaterials } from "../../materials/door-materials";
import { doorMaterialPartRolesForType, materialRoleLabel } from "../../../../materials/studio-model-material-roles";
import { MATERIAL_STYLE_AUTO, isMaterialStyleCapable, materialStyleAutoLabel, materialStyleLabel, materialStyleOptionsFor, materialStyleOptionsSignature, materialStylePresetSwatchColors, normalizeMaterialStyle, registerCustomMaterialStyles } from "../../../../materials/studio-material-presets";
import { materialSlotGroupOf } from "../../../../materials/studio-material-slot-groups";
import { syncHtmlRangeProgress as syncHtmlRangeProgress2 } from "../../../../../shared/util/range-progress";
import { clamp as clamp2, distance as distance2, pointInRotatedRectangle as pointInRotatedRectangle2 } from "../../../../plan/geometry";
import { syncControlValue as syncControlValue2 } from "../../../ui/ui-controls";
import { isCourtyardDrawing as isCourtyardDrawing2, finite as finite2 } from "../../../../loaders/studio-normalization";
import { itemPlanFootprint as itemPlanFootprint2, itemWithPlanFootprint as itemWithPlanFootprint2 } from "../../../items/studio-item-posture";
import { materialSlabLabel } from "../../../ui/studio-app-helpers";
import { normalizeMaterialSurfaceOverrides } from "../../../scene/studio-scene-payload";
import { isPointInBounds } from "../../scene/bounds";
import { boundsIntersectSegment } from "../../scene/bounds";
import { createMaterialStyleChip } from "../../materials/style-chip";
import { createMaterialSlotSurfacePanel } from "../../materials/surface-panel";
import { refreshStepChecklist } from "../../ui/step-checklist";
import { materialSlotGroupView } from "../../ui/slot-group-view";

export function hitTestHandle(runtime: StudioAppRuntime, pointerPoint: any) {
  if (runtime.appCtx.activeToolName !== "select" || runtime.appCtx.selectedItem?.kind !== "item" || runtime.appCtx.selectedItems.length)
    return null;
  const at3 = runtime.getSelectedObject();
  if (!at3 || isCourtyardDrawing2(at3)) return null;
  const ky2 = runtime.buildHandleGeometry(at3),
    handleHitRadius = 9 / Math.max(runtime.appCtx.planView.zoom, 0.01);
  if (distance2(pointerPoint, ky2.rotationHandle) <= handleHitRadius)
    return {
      type: "rotate-item",
      item: at3,
      controls: ky2,
    };
  if (
    at3.type === "smart-socket-86" &&
    Math.min(at3.width, at3.depth) * runtime.getPixelsPerMeter() * runtime.appCtx.planView.zoom < 18
  )
    return null;
  const hitCorner = ky2.corners.find(
    (cornerCandidate: any) => distance2(pointerPoint, cornerCandidate.point) <= handleHitRadius,
  );
  return hitCorner
    ? {
        type: "resize-item",
        item: at3,
        controls: ky2,
        corner: hitCorner,
      }
    : null;
}

export function boundsFromCorners(runtime: StudioAppRuntime, cornerA: any, cornerB: any) {
  return {
    minX: Math.min(cornerA.x, cornerB.x),
    minY: Math.min(cornerA.y, cornerB.y),
    maxX: Math.max(cornerA.x, cornerB.x),
    maxY: Math.max(cornerA.y, cornerB.y),
  };
}

export function marqueeDelta(runtime: StudioAppRuntime, marqueeStartPoint: any, marqueeCurrentPoint: any) {
  const ry2 = runtime.boundsFromCorners(marqueeStartPoint, marqueeCurrentPoint),
    scenePixelsPerMeter = runtime.getPixelsPerMeter() || 100,
    intersectingWalls: any[] = [];
  if (!(runtime.appCtx.activeLibraryCategory === "light") && runtime.appCtx.activeLibraryCategory !== "courtyard") {
    for (const wallHit of runtime.appCtx.studioState.walls)
      boundsIntersectSegment(wallHit.start, wallHit.end, ry2) &&
        intersectingWalls.push({
          kind: "wall",
          id: wallHit.id,
        });
    for (const windowHit of runtime.appCtx.studioState.windows) {
      const xo4 = runtime.wallWindowSpan(windowHit);
      xo4 &&
        boundsIntersectSegment(xo4.start, xo4.end, ry2) &&
        intersectingWalls.push({
          kind: "window",
          id: windowHit.id,
        });
    }
    for (const doorHit of runtime.appCtx.studioState.doors) {
      const xo5 = runtime.wallWindowSpan(doorHit);
      xo5 &&
        boundsIntersectSegment(xo5.start, xo5.end, ry2) &&
        intersectingWalls.push({
          kind: "door",
          id: doorHit.id,
        });
    }
    for (const railingHit of runtime.appCtx.studioState.railings) {
      const xo6 = runtime.wallWindowSpan(railingHit);
      xo6 &&
        boundsIntersectSegment(xo6.start, xo6.end, ry2) &&
        intersectingWalls.push({
          kind: "railing",
          id: railingHit.id,
        });
    }
  }
  const marqueeCorners = [
    {
      x: ry2.minX,
      y: ry2.minY,
    },
    {
      x: ry2.maxX,
      y: ry2.minY,
    },
    {
      x: ry2.maxX,
      y: ry2.maxY,
    },
    {
      x: ry2.minX,
      y: ry2.maxY,
    },
  ];
  for (const itemBoundsRecord of runtime.appCtx.studioState.items) {
    if (!runtime.isPlanItemVisible(itemBoundsRecord)) continue;
    const itemRotationRad = (itemBoundsRecord.rotation * Math.PI) / 180,
      cos2 = Math.cos(itemRotationRad),
      sin2 = Math.sin(itemRotationRad),
      itemBoundsFootprint = itemPlanFootprint2(itemBoundsRecord),
      halfWidthPx = (itemBoundsFootprint.width * scenePixelsPerMeter) / 2,
      halfDepthPx = (itemBoundsFootprint.depth * scenePixelsPerMeter) / 2,
      itemCornerPoints = [
        [-halfWidthPx, -halfDepthPx],
        [halfWidthPx, -halfDepthPx],
        [halfWidthPx, halfDepthPx],
        [-halfWidthPx, halfDepthPx],
      ].map(([cornerLocalX, cornerLocalY]) => ({
        x: itemBoundsRecord.x + cornerLocalX * cos2 - cornerLocalY * sin2,
        y: itemBoundsRecord.y + cornerLocalX * sin2 + cornerLocalY * cos2,
      }));
    (isPointInBounds(itemBoundsRecord, ry2) ||
      itemCornerPoints.some((cornerPoint) => isPointInBounds(cornerPoint, ry2)) ||
      marqueeCorners.some((cornerTestPoint) =>
        pointInRotatedRectangle2(
          cornerTestPoint,
          itemWithPlanFootprint2(itemBoundsRecord),
          scenePixelsPerMeter,
        ),
      )) &&
      intersectingWalls.push({
        kind: "item",
        id: itemBoundsRecord.id,
      });
  }
  return intersectingWalls;
}

export function updateMarqueeOverlay(runtime: StudioAppRuntime, ) {
  return !runtime.planCanvasElement.width || !runtime.planCanvasElement.height || !runtime.overlayCanvasRenderer
    ? false
    : (runtime.overlayCanvasElement.width !== runtime.planCanvasElement.width &&
        (runtime.overlayCanvasElement.width = runtime.planCanvasElement.width),
      runtime.overlayCanvasElement.height !== runtime.planCanvasElement.height &&
        (runtime.overlayCanvasElement.height = runtime.planCanvasElement.height),
      runtime.overlayCanvasRenderer.setTransform(1, 0, 0, 1, 0, 0),
      runtime.overlayCanvasRenderer.clearRect(
        0,
        0,
        runtime.overlayCanvasElement.width,
        runtime.overlayCanvasElement.height,
      ),
      runtime.overlayCanvasRenderer.drawImage(runtime.planCanvasElement, 0, 0),
      true);
}

export function drawMarqueeOverlay(runtime: StudioAppRuntime, { offsetX: overlayDrawX = 0, offsetY: overlayDrawY = 0 } = {}) {
  if (
    !runtime.overlayCanvasElement.width ||
    !runtime.overlayCanvasElement.height ||
    runtime.overlayCanvasElement.width !== runtime.planCanvasElement.width ||
    runtime.overlayCanvasElement.height !== runtime.planCanvasElement.height
  )
    return false;
  const overlayScaleX = runtime.planCanvasElement.width / Math.max(runtime.appCtx.planViewWidth, 1),
    overlayScaleY = runtime.planCanvasElement.height / Math.max(runtime.appCtx.planViewHeight, 1);
  return (
    runtime.planCanvasRenderer.save(),
    runtime.planCanvasRenderer.setTransform(1, 0, 0, 1, 0, 0),
    (runtime.planCanvasRenderer.fillStyle = "#0d1319"),
    runtime.planCanvasRenderer.fillRect(0, 0, runtime.planCanvasElement.width, runtime.planCanvasElement.height),
    runtime.planCanvasRenderer.drawImage(
      runtime.overlayCanvasElement,
      Math.round(overlayDrawX * overlayScaleX),
      Math.round(overlayDrawY * overlayScaleY),
    ),
    runtime.planCanvasRenderer.restore(),
    true
  );
}

export function renderPlanScene(runtime: StudioAppRuntime, ) {
  if (runtime.appCtx.marqueeBox?.type !== "marquee") return;
  const zr4 = runtime.planToScreen(runtime.appCtx.marqueeBox.start),
    zr5 = runtime.planToScreen(runtime.appCtx.marqueeBox.current),
    marqueeLeft = Math.min(zr4.x, zr5.x),
    marqueeTop = Math.min(zr4.y, zr5.y),
    abs = Math.abs(zr5.x - zr4.x),
    abs2 = Math.abs(zr5.y - zr4.y);
  (runtime.planCanvasRenderer.save(),
    runtime.planCanvasRenderer.translate(runtime.appCtx.planViewWidth / 2, runtime.appCtx.planViewHeight / 2),
    runtime.planCanvasRenderer.rotate((runtime.appCtx.planView.rotation * Math.PI) / 180),
    runtime.planCanvasRenderer.translate(-runtime.appCtx.planViewWidth / 2, -runtime.appCtx.planViewHeight / 2),
    (runtime.planCanvasRenderer.fillStyle = "rgba(255, 157, 46, .10)"),
    (runtime.planCanvasRenderer.strokeStyle = "rgba(255, 176, 74, .92)"),
    (runtime.planCanvasRenderer.lineWidth = 1),
    runtime.planCanvasRenderer.setLineDash([6, 4]),
    runtime.planCanvasRenderer.fillRect(marqueeLeft, marqueeTop, abs, abs2),
    runtime.planCanvasRenderer.strokeRect(
      marqueeLeft + 0.5,
      marqueeTop + 0.5,
      Math.max(abs - 1, 0),
      Math.max(abs2 - 1, 0),
    ),
    runtime.planCanvasRenderer.restore());
}

export function getSelectedObject(runtime: StudioAppRuntime, ) {
  if (!runtime.appCtx.selectedItem) return null;
  const selectedObjectRecord = (
    ({
      wall: runtime.appCtx.studioState.walls,
      window: runtime.appCtx.studioState.windows,
      door: runtime.appCtx.studioState.doors,
      railing: runtime.appCtx.studioState.railings,
      item: runtime.appCtx.studioState.items,
    } as any)[runtime.appCtx.selectedItem.kind] || []
  ).find((selectedMatch: any) => selectedMatch.id === runtime.appCtx.selectedItem.id);
  return (selectedObjectRecord || (runtime.appCtx.selectedItem = null), selectedObjectRecord || null);
}

export function getPanelRatioLimits(runtime: StudioAppRuntime, ) {
  const detailsPanelRect = runtime.detailsPanelElement.getBoundingClientRect(),
    studioShellRect = runtime.studioShellElement.getBoundingClientRect(),
    panelMaxHeight = detailsPanelRect.height || Math.max(window.innerHeight - 90, 340),
    shellMaxWidth = studioShellRect.width || Math.max(window.innerWidth - 20, 860),
    resizerHeight = runtime.detailsResizerElement.parentElement?.getBoundingClientRect().height || 14,
    libraryPanelWidth =
      runtime.studioShellElement.querySelector(".library-panel")?.getBoundingClientRect().width || 168;
  return {
    minimumHeightRatio: clamp2(320 / panelMaxHeight, 0.08, 0.5),
    maximumHeightRatio: clamp2((panelMaxHeight - resizerHeight - 170) / panelMaxHeight, 0.5, 0.94),
    minimumWidthRatio: clamp2(360 / shellMaxWidth, 0.08, 0.45),
    maximumWidthRatio: clamp2(
      (shellMaxWidth - libraryPanelWidth - 20 - 320) / shellMaxWidth,
      0.45,
      0.86,
    ),
  };
}

export function applyPanelRatios(runtime: StudioAppRuntime, ) {
  const yl2 = runtime.getPanelRatioLimits(),
    previewPanelRatio = clamp2(
      finite2(runtime.appCtx.studioState.settings?.previewPanelRatio, 0.52),
      yl2.minimumHeightRatio,
      yl2.maximumHeightRatio,
    );
  ((runtime.appCtx.studioState.settings.previewPanelRatio = previewPanelRatio),
    runtime.detailsPanelElement.style.setProperty(
      "--preview-panel-height",
      (previewPanelRatio * 100).toFixed(2) + "%",
    ),
    runtime.detailsResizerElement.setAttribute(
      "aria-valuemin",
      String(Math.round(yl2.minimumHeightRatio * 100)),
    ),
    runtime.detailsResizerElement.setAttribute(
      "aria-valuemax",
      String(Math.round(yl2.maximumHeightRatio * 100)),
    ),
    runtime.detailsResizerElement.setAttribute(
      "aria-valuenow",
      String(Math.round(previewPanelRatio * 100)),
    ));
}

export function applyDetailsRatio(runtime: StudioAppRuntime, ) {
  const yl3 = runtime.getPanelRatioLimits(),
    detailsPanelWidthRatio = clamp2(
      finite2(runtime.appCtx.studioState.settings?.detailsPanelWidthRatio, 0.29),
      yl3.minimumWidthRatio,
      yl3.maximumWidthRatio,
    );
  ((runtime.appCtx.studioState.settings.detailsPanelWidthRatio = detailsPanelWidthRatio),
    runtime.studioShellElement.style.setProperty(
      "--details-panel-width",
      (detailsPanelWidthRatio * 100).toFixed(2) + "%",
    ));
}

export function isSnapEnabled(runtime: StudioAppRuntime, ) {
  return runtime.appCtx.studioState.settings.snapEnabled !== false && !runtime.appCtx.isSnapTemporarilyOff;
}

export function setSnapSettingsOpen(runtime: StudioAppRuntime, settingsOpen: any) {
  ((runtime.snapSettingsPanel.hidden = !settingsOpen),
    runtime.snapSettingsToggleButton.setAttribute("aria-expanded", String(settingsOpen)));
}

export function syncSnapControls(runtime: StudioAppRuntime, ) {
  const isSnapOn = runtime.appCtx.studioState.settings.snapEnabled !== false;
  (runtime.snapToggleButton.classList.toggle("active", isSnapOn),
    runtime.snapToggleButton.setAttribute("aria-pressed", String(isSnapOn)),
    (runtime.snapToggleStateElement.textContent = isSnapOn ? "开" : "关"));
  for (const snapSettingInput of runtime.snapSettingControls)
    snapSettingInput.checked = (runtime.appCtx.studioState.settings as any)[snapSettingInput.dataset.snapSetting!] !== false;
  (syncControlValue2(
    runtime.snapToleranceInput,
    clamp2(Math.round(finite2(runtime.appCtx.studioState.settings.snapTolerance, 13)), 6, 24),
  ),
    /* `hos-range-ui` 的左侧金色段靠 `--progress-pct` 裁切：每次回填数值都要同步一次，
       否则改档位后条子还停在旧进度。 */
    syncHtmlRangeProgress2(runtime.snapToleranceInput),
    (runtime.snapToleranceValueElement.textContent = runtime.snapToleranceInput.value + " px"),
    runtime.appCtx.activeSnapTarget ||
      (runtime.snapIndicatorElement.textContent = isSnapOn ? "吸附：开启" : "吸附：关闭"));
}

export function applySnapTolerance(runtime: StudioAppRuntime, resizeMoveEvent: any) {
  if (!runtime.appCtx.dragStart) return;
  const draggedDetailsPanelRect = runtime.detailsPanelElement.getBoundingClientRect(),
    draggedStudioShellRect = runtime.studioShellElement.getBoundingClientRect();
  if (draggedDetailsPanelRect.height <= 0 || draggedStudioShellRect.width <= 0) return;
  const yl4 = runtime.getPanelRatioLimits(),
    dragDeltaX = resizeMoveEvent.clientX - runtime.appCtx.dragStart.startX,
    dragDeltaY = resizeMoveEvent.clientY - runtime.appCtx.dragStart.startY;
  if (Math.hypot(dragDeltaX, dragDeltaY) < 2) return;
  runtime.detailsResizerElement.dataset.resizeAxis = "both";
  const heightRatioDelta = dragDeltaY / draggedDetailsPanelRect.height,
    widthRatioDelta = dragDeltaX / draggedStudioShellRect.width;
  ((runtime.appCtx.studioState.settings.previewPanelRatio = clamp2(
    runtime.appCtx.dragStart.startPreviewRatio + heightRatioDelta,
    yl4.minimumHeightRatio,
    yl4.maximumHeightRatio,
  )),
    (runtime.appCtx.studioState.settings.detailsPanelWidthRatio = clamp2(
      runtime.appCtx.dragStart.startWidthRatio - widthRatioDelta,
      yl4.minimumWidthRatio,
      yl4.maximumWidthRatio,
    )),
    runtime.applyPanelRatios(),
    runtime.applyDetailsRatio());
}

export function refreshBackground(runtime: StudioAppRuntime, ) {
  const planTitleText = runtime.appCtx.studioState.items.some(
    (drawingItem) => isCourtyardDrawing2(drawingItem) || drawingItem.type.startsWith("garden-"),
  )
    ? runtime.appCtx.studioState.walls.length
      ? "户型与庭院绘制"
      : "庭院绘制"
    : "户型图绘制";
  ((runtime.projectNameElement.textContent = planTitleText),
    (document.title = planTitleText),
    runtime.syncSnapControls(),
    runtime.syncGlobalControls(),
    (runtime.toggleBackgroundButton.disabled = !runtime.appCtx.studioState.background),
    (runtime.toggleBackgroundButton.textContent = runtime.appCtx.studioState.settings.backgroundVisible ? "隐藏" : "显示"),
    (runtime.removePlanButton.disabled = !runtime.appCtx.studioState.background),
    syncControlValue2(runtime.globalWallHeightInput, runtime.appCtx.studioState.settings.wallHeight.toFixed(2)),
    syncControlValue2(runtime.globalWallThicknessInput, runtime.appCtx.studioState.settings.wallThickness.toFixed(2)),
    syncControlValue2(runtime.globalWallOpacityInput, Math.round(runtime.appCtx.studioState.settings.wallOpacity * 100)),
    (runtime.toggleFloorEdgeButton.textContent =
      runtime.appCtx.studioState.settings.floorEdgeVisible === false ? "隐藏" : "显示"),
    runtime.toggleFloorEdgeButton.setAttribute(
      "aria-pressed",
      String(runtime.appCtx.studioState.settings.floorEdgeVisible !== false),
    ),
    (runtime.canvasEmptyElement.hidden = !!(
      runtime.appCtx.studioState.background ||
      runtime.appCtx.studioState.walls.length ||
      runtime.appCtx.studioState.items.length
    )),
    (runtime.sceneCountsElement.textContent =
      runtime.appCtx.studioState.walls.length +
      " 墙 · " +
      runtime.appCtx.studioState.windows.length +
      " 窗 · " +
      runtime.appCtx.studioState.doors.length +
      " 门 · " +
      runtime.appCtx.studioState.railings.length +
      " 栏杆 · " +
      runtime.appCtx.studioState.items.length +
      " 物件"),
    runtime.syncLightGroupList(),
    runtime.applyPanelRatios(),
    runtime.applyDetailsRatio(),
    runtime.setCameraMode(runtime.getCameraMode()),
    runtime.setCameraView(runtime.getCameraView()),
    runtime.refreshPreviewSync(),
    runtime.refreshFloorControls(),
    runtime.refreshBaseLighting(),
    refreshStepChecklist(runtime.appCtx));
}

/** 刷新整个属性检查器：先跑「按选中类型逐个开关字段」的逻辑，再统一收敛一次分组。 */
export function refreshStudioUi(runtime: StudioAppRuntime, shouldClearActiveElement = false) {
  runtime.refreshStudioUiInner(shouldClearActiveElement);
  runtime.syncInspectorGroups();
  // 复制按钮跟随选择：属性和选择都在这里刷新，剪贴板可用性也搭同一趟车。
  runtime.syncStudioClipboardFacade();
}

export function readInspectorGroupCollapseState(runtime: StudioAppRuntime, ) {
  try {
    const storedState = JSON.parse(
      window.localStorage.getItem(runtime.INSPECTOR_GROUP_STORAGE_KEY) || "{}",
    );
    return storedState && typeof storedState == "object" ? storedState : {};
  } catch {
    return {};
  }
}

export function writeInspectorGroupCollapseState(runtime: StudioAppRuntime, collapseState: any) {
  try {
    window.localStorage.setItem(runtime.INSPECTOR_GROUP_STORAGE_KEY, JSON.stringify(collapseState));
  } catch { /* 存储写入是 best-effort：隐私模式 / 配额 / 序列化失败都不应影响本次渲染 */ }
}

/** 组内是否还有可见字段。 */
export function inspectorGroupHasVisibleField(runtime: StudioAppRuntime, inspectorGroupElement: any) {
  const groupBodyElement = inspectorGroupElement.querySelector(".inspector-group-body");
  if (!groupBodyElement) return false;
  for (const groupUnitElement of groupBodyElement.children)
    if (!groupUnitElement.hasAttribute("hidden")) return true;
  return false;
}

/** 折叠徽标里的字段条数：只数组内当前可见的字段行。 */
export function countInspectorGroupFields(runtime: StudioAppRuntime, inspectorGroupElement: any) {
  const groupBodyElement = inspectorGroupElement.querySelector(".inspector-group-body");
  if (!groupBodyElement) return 0;
  let visibleFieldCount = 0;
  for (const groupUnitElement of groupBodyElement.children) {
    if (groupUnitElement.hasAttribute("hidden")) continue;
    const leafFieldElements = groupUnitElement.matches("label")
      ? [groupUnitElement]
      : [...groupUnitElement.querySelectorAll("label")];
    visibleFieldCount += leafFieldElements.filter(
      (leafFieldElement) => !leafFieldElement.hasAttribute("hidden"),
    ).length;
  }
  return visibleFieldCount;
}

/** 收敛分组：空组整组隐藏、组标题随选中类型换说法、折叠态回放、计数徽标只在折叠时出现。 */
export function syncInspectorGroups(runtime: StudioAppRuntime, ) {
  const architectureKind = (runtime.INSPECTOR_GROUP_TITLE_BY_ARCHITECTURE_KIND as any)[runtime.appCtx.selectedItem?.kind]
    ? runtime.appCtx.selectedItem.kind
    : "";
  for (const inspectorGroupElement of runtime.inspectorGroupsElement) {
    const groupName = inspectorGroupElement.dataset.inspectorGroup,
      isCollapsed = runtime.appCtx.inspectorGroupCollapseState[groupName!] === true,
      hasVisibleField = runtime.inspectorGroupHasVisibleField(inspectorGroupElement);
    inspectorGroupElement.hidden = !hasVisibleField;
    inspectorGroupElement.classList.toggle("is-collapsed", isCollapsed);
    const groupTitleElement = inspectorGroupElement.querySelector(".inspector-group-title"),
      groupCountElement = inspectorGroupElement.querySelector(".inspector-group-count") as HTMLElement | null;
    groupName === "geometry" &&
      architectureKind &&
      groupTitleElement &&
      (groupTitleElement.textContent = (runtime.INSPECTOR_GROUP_TITLE_BY_ARCHITECTURE_KIND as any)[architectureKind]);
    inspectorGroupElement
      .querySelector(".inspector-group-header")
      ?.setAttribute("aria-expanded", String(!isCollapsed));
    if (groupCountElement) {
      const visibleFieldCount = hasVisibleField
        ? runtime.countInspectorGroupFields(inspectorGroupElement)
        : 0;
      ((groupCountElement.textContent = visibleFieldCount ? visibleFieldCount + " 项" : ""),
        (groupCountElement.hidden = !isCollapsed || !visibleFieldCount));
    }
  }
}

/** 折叠 / 展开某个分组并记住选择。 */
export function toggleInspectorGroup(runtime: StudioAppRuntime, inspectorGroupElement: any) {
  const groupName = inspectorGroupElement?.dataset.inspectorGroup;
  if (!groupName) return;
  runtime.appCtx.inspectorGroupCollapseState = {
    ...runtime.appCtx.inspectorGroupCollapseState,
    [groupName]: !inspectorGroupElement.classList.contains("is-collapsed"),
  };
  runtime.writeInspectorGroupCollapseState(runtime.appCtx.inspectorGroupCollapseState);
  runtime.syncInspectorGroups();
}

export function materialSlotPanelSignatureFor(runtime: StudioAppRuntime, modelItem: any, materialSlotEntries: any) {
  return [
    modelItem?.id || "",
    runtime.appCtx.sceneStyle,
    materialSlotEntries === null ? "pending" : "ready",
    JSON.stringify(modelItem?.materialOverrides || {}),
    JSON.stringify(normalizeMaterialSurfaceOverrides(modelItem?.materialSurfaceOverrides)),
    String(modelItem?.materialStyle || ""),
    runtime.appCtx.materialSlotGroupFilter,
    runtime.appCtx.materialStyleOptionSignature,
    materialSlotEntries ? materialSlotEntries.map((slotEntry: any) => slotEntry.name).join(",") : "",
  ].join("|");
}

/** 一枚色卡上排的 3–4 格调色板缩略。 */
export function materialStyleSwatchColors(runtime: StudioAppRuntime, preset: any, fallbackPalette: any, slotRoles: any) {
  return materialStylePresetSwatchColors(preset, fallbackPalette || runtime.backgroundSettings(), {
    roles: slotRoles,
  });
}

/** 重建「材质风格」色卡条：档位表随模型类型变化（沙发是布艺 / 皮革组、柜类是木作组…），所以色卡不写死在标记里； */
export function syncMaterialStyleStrip(runtime: StudioAppRuntime, modelItem: any, modelType: any, slotRoles: any) {
  if (!runtime.materialStyleStripElement) return;
  runtime.ensureCustomMaterialStylesLoaded();
  const presetOptions = isMaterialStyleCapable(modelType) ? materialStyleOptionsFor(modelType) : [],

    optionSignature = materialStyleOptionsSignature(modelType, slotRoles),
    itemPalette = runtime.backgroundSettings();
  if (optionSignature !== runtime.appCtx.materialStyleOptionSignature) {
    runtime.appCtx.materialStyleOptionSignature = optionSignature;
    const chipFragment = document.createDocumentFragment(),
      autoChip = createMaterialStyleChip(
        MATERIAL_STYLE_AUTO,
        materialStyleAutoLabel(modelType),
        runtime.materialStyleSwatchColors(null, itemPalette, slotRoles),
        false,
      );
    chipFragment.append(autoChip);
    for (const presetOption of presetOptions)
      chipFragment.append(
        createMaterialStyleChip(
          presetOption.id,
          presetOption.label,
          runtime.materialStyleSwatchColors(presetOption, itemPalette, slotRoles),
          presetOption.id.startsWith("custom:"),
        ),
      );
    runtime.materialStyleStripElement.replaceChildren(chipFragment);
  }
  const selectedStyle = normalizeMaterialStyle(modelType, modelItem?.materialStyle);
  for (const styleChip of runtime.materialStyleStripElement.children) {
    const isActive = styleChip.dataset.materialStyleId === selectedStyle;
    (styleChip.classList.toggle("is-active", isActive),
      styleChip.setAttribute("aria-checked", String(isActive)),
      styleChip.setAttribute("tabindex", isActive ? "0" : "-1"));
  }
  const hasPresets = presetOptions.length > 0;
  runtime.materialStyleStripElement.hidden = !hasPresets;
  runtime.materialStyleFieldElement && (runtime.materialStyleFieldElement.hidden = !hasPresets);
  runtime.materialStyleDeleteButton &&
    (runtime.materialStyleDeleteButton.hidden = !selectedStyle.startsWith("custom:"));
}

/** 一枚色卡：上方调色板缩略，下方档位名。 */

/** 过滤后的槽位 + 当前可选的族（少于两族时不给筛选条，避免为 5 个槽位加一排芯片）。 */
export function renderMaterialSlotGroupChips(runtime: StudioAppRuntime, groupView: any) {
  if (!runtime.materialSlotGroupsElement) return;
  if (!groupView.isFilterable) {
    ((runtime.materialSlotGroupsElement.hidden = true), runtime.materialSlotGroupsElement.replaceChildren());
    return;
  }
  const chipFragment = document.createDocumentFragment(),
    chipEntries = [{ id: "", label: "全部" }, ...groupView.groups];
  for (const chipEntry of chipEntries) {
    const groupChip = document.createElement("button");
    ((groupChip.type = "button"),
      (groupChip.className =
        "material-slot-group-chip" +
        (chipEntry.id === groupView.activeGroupId ? " is-active" : "")),
      (groupChip.dataset.materialSlotGroup = chipEntry.id),
      (groupChip.textContent = chipEntry.label),
      groupChip.addEventListener("click", () => runtime.setMaterialSlotGroupFilter(chipEntry.id)),
      chipFragment.append(groupChip));
  }
  (runtime.materialSlotGroupsElement.replaceChildren(chipFragment),
    (runtime.materialSlotGroupsElement.hidden = false),
    runtime.materialSlotGroupsElement.classList.toggle("is-filtering", Boolean(groupView.activeGroupId)));
}

/** 切槽位筛选：清面板签名逼下一次刷新重画（筛选是纯展示状态，不进文档、不进撤销）。 */
export function setMaterialSlotGroupFilter(runtime: StudioAppRuntime, groupId: any) {
  groupId === runtime.appCtx.materialSlotGroupFilter ||
    ((runtime.appCtx.materialSlotGroupFilter = groupId),
    (runtime.appCtx.materialSlotPanelSignature = ""),
    runtime.refreshStudioUi());
}

/** 一行只读表面参数：粗糙 / 金属 / 透明 / 自发光。 */
export function materialSlotMetaText(runtime: StudioAppRuntime, slotEntry: any) {
  const metaParts = [
    "粗糙 " + slotEntry.roughness.toFixed(2),
    "金属 " + slotEntry.metalness.toFixed(2),
  ];
  slotEntry.slab && metaParts.push(materialSlabLabel(slotEntry.slab) + "整图");
  (slotEntry.transparent || slotEntry.opacity < 1) &&
    metaParts.push("透明 " + Math.round(slotEntry.opacity * 100) + "%");
  slotEntry.emissive &&
    slotEntry.emissive !== "#000000" &&
    slotEntry.emissiveIntensity > 0 &&
    metaParts.push("自发光 " + Math.round(slotEntry.emissiveIntensity * 100) + "%");
  return metaParts.join(" · ");
}

/** 门的材质部件表（部件顺序 `DOOR_MATERIAL_PARTS` / 各门型部件 / 部件索引）统一放在`materials/studio-model-material-roles.ts`：运行时出图、材质面板与 CI 校验脚本共用同一份事实（门没有 GLB 可扫，槽位全靠这张表定义），门型增删部件时不会两边各… */

/** 门部件「跟随主题」时读的调色板键（返回色号）。 */
/** 门的逐部件材质 —— 出图与面板**同源**的那一份（改这里就等于同时改画面与检查面板）。 */
/** 画面上的门部件色：选中时叠一层主题 accent（沿用架构构件「选中即高亮」的老规矩），但**只叠一半** —— 从前的写法是把整扇门刷成 accent，于是编辑材质时画面上永远是一片高亮色，看不出自己改了什么（「选了风格没变化」）。 */
export function doorPartDisplayColor(runtime: StudioAppRuntime, partMaterial: any, isSelected: boolean, themePalette: any) {
  const partColorValue = partMaterial?.colorValue;
  if (!isSelected || typeof partColorValue !== "number") return partColorValue;
  const accentColor = themePalette?.accent;
  if (typeof accentColor !== "number") return partColorValue;
  const mixChannel = (shift: number) => {
    const partChannel = (partColorValue >> shift) & 255,
      accentChannel = (accentColor >> shift) & 255;
    return Math.round(partChannel + (accentChannel - partChannel) * 0.5);
  };
  return (mixChannel(16) << 16) | (mixChannel(8) << 8) | mixChannel(0);
}

/** 门部件材质 → `addArchitectureMesh` 的 options。 */
export function doorPartMeshOptions(runtime: StudioAppRuntime, partMaterial: any, baseOptions: any) {
  if (!partMaterial) return baseOptions;
  const meshOptions = { ...baseOptions };
  partMaterial.roughness !== undefined && (meshOptions.roughness = partMaterial.roughness);
  partMaterial.metalness !== undefined && (meshOptions.metalness = partMaterial.metalness);
  partMaterial.transparent &&
    ((meshOptions.transparent = true),
    (meshOptions.opacity = partMaterial.opacity),
    (meshOptions.depthWrite = partMaterial.depthWrite));
  partMaterial.emissiveValue !== undefined &&
    ((meshOptions.emissive = partMaterial.emissiveValue),
    (meshOptions.emissiveIntensity = partMaterial.emissiveIntensity ?? 0.5));
  return meshOptions;
}

/** 门的「材质属性」槽位表：形状与 `loader.describeItemMaterials` 的输出一致，于是同一块面板 DOM、同一套写入函数与同一份色卡逻辑都能直接复用。 */
/** 同款门（同 doorType）的其它扇数：面板上「应用到同类」的可点状态。 */
export function doorMaterialPeerCount(runtime: StudioAppRuntime, doorRecord: any) {
  return runtime.materialSameModelPeerCount({ kind: "door", record: doorRecord });
}

/** 重建「材质属性」面板的门版本：与 `renderMaterialSlotPanel` 共用色卡条 / 槽位行 / 动作按钮，只有槽位来源不同（门是程序化部件，家具是 GLB 材质槽）。 */
export function renderDoorMaterialPanel(runtime: StudioAppRuntime, doorRecord: any) {
  if (!runtime.materialFieldsElement || !runtime.materialSlotListElement || !doorRecord) return;
  const doorPartRoles = doorMaterialPartRolesForType(doorRecord.doorType);
  runtime.materialFieldsElement.hidden = false;
  runtime.syncMaterialStyleStrip(doorRecord, "door", doorPartRoles);
  const materialSlotEntries = describeDoorMaterials(runtime.backgroundSettings, doorRecord),
    panelSignature = runtime.materialSlotPanelSignatureFor(doorRecord, materialSlotEntries);
  if (panelSignature === runtime.appCtx.materialSlotPanelSignature) return;
  runtime.appCtx.materialSlotPanelSignature = panelSignature;
  runtime.appCtx.isMaterialSlotPanelPending = false;

  for (const expandedSlotName of [...runtime.appCtx.expandedMaterialSurfaceSlots])
    materialSlotEntries.some((slotEntry) => slotEntry.name === expandedSlotName) ||
      runtime.appCtx.expandedMaterialSurfaceSlots.delete(expandedSlotName);
  const overrideCount = materialSlotEntries.filter((slotEntry) => Boolean(slotEntry.overrideColor))
      .length,
    surfaceOverrideCount = materialSlotEntries.filter((slotEntry) =>
      Boolean(slotEntry.surfaceOverride),
    ).length,
    doorMaterialStyle = normalizeMaterialStyle("door", doorRecord.materialStyle),
    hasMaterialStyle = doorMaterialStyle !== MATERIAL_STYLE_AUTO,
    peerCount = runtime.doorMaterialPeerCount(doorRecord),
    groupView = materialSlotGroupView(runtime.appCtx, materialSlotEntries);
  runtime.materialSummaryElement.textContent =
    (hasMaterialStyle ? materialStyleLabel("door", doorMaterialStyle) + " · " : "") +
    materialSlotEntries.length +
    " 个材质部件 · " +
    runtime.materialCoverageSummary(overrideCount, surfaceOverrideCount);
  ((runtime.materialResetAllButton.disabled = !overrideCount && !surfaceOverrideCount && !hasMaterialStyle),
    (runtime.materialSavePresetButton.disabled = false),
    (runtime.materialApplySameButton.disabled = !peerCount),
    (runtime.materialApplySameButton.title = peerCount
      ? "把当前档位与逐部件改动复制给其它 " + peerCount + " 扇同款门"
      : "场景里没有其它同款门"));
  runtime.renderMaterialSlotGroupChips(groupView);
  const slotRowFragment = document.createDocumentFragment();
  for (const slotEntry of groupView.visibleSlotEntries)
    slotRowFragment.append(runtime.createMaterialSlotRow(slotEntry));
  if (!groupView.visibleSlotEntries.length) {
    const emptyElement = document.createElement("p");
    ((emptyElement.className = "material-slot-empty"),
      (emptyElement.textContent = "这一族里没有部件。"),
      slotRowFragment.append(emptyElement));
  }
  runtime.materialSlotListElement.replaceChildren(slotRowFragment);
}

/** 重建「材质属性」检查面板：先给「材质风格」预设下拉（选一档 = 整套角色换料），再列出选中物件的每个 GLB 材质槽位 → 角色 → 当前显色与表面。 */
export function renderMaterialSlotPanel(runtime: StudioAppRuntime, modelItem: any) {
  if (!runtime.materialFieldsElement || !runtime.materialSlotListElement) return;
  const hasExternalModel = Boolean(
    modelItem && runtime.externalModelRegistry.hasExternalModelForItem(modelItem),
  );
  runtime.materialFieldsElement.hidden = !hasExternalModel;
  if (!hasExternalModel) {
    ((runtime.appCtx.materialSlotPanelSignature = ""),
      (runtime.appCtx.materialStyleOptionSignature = ""),
      runtime.materialSlotListElement.replaceChildren());
    return;
  }
  const itemModelType = runtime.externalModelRegistry.modelTypeForItem(modelItem);

  const materialSlotEntries = runtime.externalModelRegistry.describeItemMaterials(
      modelItem,
      runtime.materialLoadOptionsForItem(modelItem),
    ),
    slotRoles = materialSlotEntries
      ? materialSlotEntries.map((slotEntry: any) => slotEntry.role)
      : null;
  runtime.syncMaterialStyleStrip(modelItem, itemModelType, slotRoles);
  const panelSignature = runtime.materialSlotPanelSignatureFor(modelItem, materialSlotEntries);
  if (panelSignature === runtime.appCtx.materialSlotPanelSignature) return;
  runtime.appCtx.materialSlotPanelSignature = panelSignature;
  if (!materialSlotEntries) {
    ((runtime.appCtx.isMaterialSlotPanelPending = true),
      (runtime.materialSummaryElement.textContent = "模型加载中，稍后自动刷新…"),
      runtime.materialSlotListElement.replaceChildren(),
      (runtime.materialResetAllButton.disabled = true),
      (runtime.materialSavePresetButton.disabled = true),
      (runtime.materialApplySameButton.disabled = true),
      runtime.materialSlotGroupsElement && (runtime.materialSlotGroupsElement.hidden = true));
    return;
  }
  runtime.appCtx.isMaterialSlotPanelPending = false;

  for (const expandedSlotName of [...runtime.appCtx.expandedMaterialSurfaceSlots])
    materialSlotEntries.some((slotEntry: any) => slotEntry.name === expandedSlotName) ||
      runtime.appCtx.expandedMaterialSurfaceSlots.delete(expandedSlotName);
  const overrideCount = materialSlotEntries.reduce(
      (count: number, slotEntry: any) =>
        count +
        (Array.isArray(slotEntry.variants) && slotEntry.variants.length
          ? slotEntry.variants.filter((slotVariant: any) => Boolean(slotVariant.overrideColor)).length
          : Number(Boolean(slotEntry.overrideColor))),
      0,
    ),
    surfaceOverrideCount = materialSlotEntries.reduce(
      (count: number, slotEntry: any) =>
        count +
        (Array.isArray(slotEntry.variants) && slotEntry.variants.length
          ? slotEntry.variants.filter((slotVariant: any) => Boolean(slotVariant.surfaceOverride))
              .length
          : Number(Boolean(slotEntry.surfaceOverride))),
      0,
    ),
    itemMaterialStyle = normalizeMaterialStyle(itemModelType, modelItem?.materialStyle),
    hasMaterialStyle = itemMaterialStyle !== MATERIAL_STYLE_AUTO,
    peerCount = runtime.materialSameModelPeerCount({ kind: "item", record: modelItem }),
    groupView = materialSlotGroupView(runtime.appCtx, materialSlotEntries);
  runtime.materialSummaryElement.textContent =
    (hasMaterialStyle ? materialStyleLabel(itemModelType, itemMaterialStyle) + " · " : "") +
    materialSlotEntries.length +
    " 个材质槽位 · " +
    runtime.materialCoverageSummary(overrideCount, surfaceOverrideCount);
  ((runtime.materialResetAllButton.disabled = !overrideCount && !surfaceOverrideCount && !hasMaterialStyle),
    (runtime.materialSavePresetButton.disabled = false),
    (runtime.materialApplySameButton.disabled = !peerCount),
    (runtime.materialApplySameButton.title = peerCount
      ? "把当前档位与逐槽改动复制给其它 " + peerCount + " 件同模型物件"
      : "场景里没有其它同模型物件"));
  runtime.renderMaterialSlotGroupChips(groupView);
  const showGroupLabels =
      !groupView.activeGroupId &&
      groupView.isFilterable &&
      materialSlotEntries.length >= 8,
    slotRowFragment = document.createDocumentFragment();
  let lastGroupId = "";
  for (const slotEntry of groupView.visibleSlotEntries) {
    const slotGroup = materialSlotGroupOf(slotEntry);
    if (showGroupLabels && slotGroup.id !== lastGroupId) {
      lastGroupId = slotGroup.id;
      const groupLabelElement = document.createElement("div");
      ((groupLabelElement.className = "material-slot-group-label"),
        (groupLabelElement.textContent = slotGroup.label),
        slotRowFragment.append(groupLabelElement));
    }
    slotRowFragment.append(runtime.createMaterialSlotRow(slotEntry));
  }
  if (!groupView.visibleSlotEntries.length) {
    const emptyElement = document.createElement("p");
    ((emptyElement.className = "material-slot-empty"),
      (emptyElement.textContent = "这一族里没有槽位。"),
      slotRowFragment.append(emptyElement));
  }
  runtime.materialSlotListElement.replaceChildren(slotRowFragment);
}

/** 一行覆盖情况的说法：颜色改了几处、表面参数改了几处，都没改就说跟随主题。 */
export function materialCoverageSummary(runtime: StudioAppRuntime, overrideCount: any, surfaceOverrideCount: any) {
  const changeParts: any[] = [];
  overrideCount && changeParts.push("改色 " + overrideCount);
  surfaceOverrideCount && changeParts.push("改参数 " + surfaceOverrideCount);
  return changeParts.length ? changeParts.join(" · ") : "全部跟随主题";
}

/** 一条槽位行：左边角色 / 槽位号 / GLB 名，右边色块 + 十六进制 + 参数 + 复位。 */
export function createMaterialSlotRow(runtime: StudioAppRuntime, slotEntry: any) {
  /**
   * 归并行（车辆语义槽位）里一个色块可能代表多个 GLB 材质：
   * 主控件绑第一格，其余分格各出一组小色块，写回按分格展开（见 `materialSlotWriteTargets`）。
   */
  const slotVariants = Array.isArray(slotEntry.variants) && slotEntry.variants.length
      ? slotEntry.variants
      : null,
    primaryVariant = slotVariants?.[0] || slotEntry,
    /** 控件上的写入键：分格里第一个真实材质名（`setItemMaterialOverride` 会展开整格）。 */
    slotWriteName = primaryVariant.name || slotEntry.name,
    displayedColor = (slotEntry.overrideColor || slotEntry.color || "#000000").toLowerCase(),
    surfaceOverride = slotEntry.surfaceOverride || null,
    hasOverride = Boolean(slotEntry.overrideColor),
    hasSurfaceOverride = Boolean(surfaceOverride),
    isSurfaceExpanded = runtime.appCtx.expandedMaterialSurfaceSlots.has(slotEntry.name),
    slotRow = document.createElement("div"),
    slotLineElement = document.createElement("div"),
    slotTextElement = document.createElement("span"),
    roleElement = document.createElement("span"),
    nameElement = document.createElement("span"),
    slabBadgeElement = document.createElement("span"),
    atlasBadgeElement = document.createElement("span"),
    controlsElement = document.createElement("span"),
    colorInputElement = document.createElement("input"),
    hexInputElement = document.createElement("input"),
    surfaceToggleButton = document.createElement("button"),
    resetButtonElement = document.createElement("button");
  return (
    (slotRow.className =
      "material-slot" +
      (hasOverride ? " is-overridden" : "") +
      (hasSurfaceOverride ? " has-surface-override" : "")),
    (slotRow.dataset.materialSlot = slotEntry.name),
    (slotRow.title = runtime.materialSlotMetaText(slotEntry)),
    (slotLineElement.className = "material-slot-line"),
    (slotTextElement.className = "material-slot-text"),
    (roleElement.className = "material-slot-role"),
    (roleElement.textContent =
      (slotEntry.label || materialRoleLabel(slotEntry.role)) +
      (Number.isFinite(slotEntry.slot) ? " · #" + slotEntry.slot : "")),
    (nameElement.className = "material-slot-name"),
    (nameElement.textContent =
      Array.isArray(slotEntry.members) && slotEntry.members.length > 1
        ? slotEntry.members.join(" / ")
        : slotEntry.name),
    (nameElement.title =
      (Array.isArray(slotEntry.members) && slotEntry.members.length
        ? slotEntry.members.join(" / ")
        : slotEntry.name) +
      (slotEntry.fromPalette ? "（跟随主题调色板）" : "（沿用模型自带颜色）")),
    (slabBadgeElement.className = "material-slot-slab"),
    (slabBadgeElement.textContent = materialSlabLabel(slotEntry.slab)),
    (slabBadgeElement.title =
      materialSlabLabel(slotEntry.slab) +
      "整图：这一槽会贴一张自带的石材纹路（颜色仍可调，纹路不受影响）"),
    slotEntry.slab || (slabBadgeElement.hidden = true),
    /**
     * 图集槽位：颜色是贴图烘焙出来的（车漆 / 玻璃 / 尾灯 / 轮毂都在同一张 UV 图集里），
     * 换一个纯色只会把整张图集盖掉 —— 所以这里**不给改色**，只留表面参数。
     */
    (atlasBadgeElement.className = "material-slot-slab"),
    (atlasBadgeElement.textContent = "图集"),
    (atlasBadgeElement.title =
      "该槽位的颜色由模型自带的 UV 图集贴图提供（车漆 / 玻璃 / 灯组等都在同一张图上），" +
      "改色会覆盖整张图集，因此只开放粗糙度与金属度"),
    slotEntry.hasAtlas || (atlasBadgeElement.hidden = true),
    (controlsElement.className = "material-slot-controls"),
    (colorInputElement.type = "color"),
    (colorInputElement.className = "material-slot-color"),
    (colorInputElement.dataset.materialSlotColor = slotWriteName),
    (colorInputElement.value = displayedColor),
    (colorInputElement.disabled = Boolean(slotEntry.hasAtlas)),
    (colorInputElement.title = slotEntry.hasAtlas
      ? "该槽位颜色来自模型自带图集，不能改色；可展开「参数」调粗糙度 / 金属度"
      : "点开取色器给这个槽位指定颜色；改完写进当前物件"),
    (hexInputElement.type = "text"),
    (hexInputElement.className = "material-slot-hex"),
    (hexInputElement.dataset.materialSlotHex = slotWriteName),
    (hexInputElement.value = displayedColor),
    (hexInputElement.spellcheck = false),
    (hexInputElement.maxLength = 7),
    (hexInputElement.disabled = Boolean(slotEntry.hasAtlas)),
    (hexInputElement.title = slotEntry.hasAtlas
      ? "该槽位颜色来自模型自带图集，不能改色"
      : "可以直接粘贴十六进制色值，回车或离开输入框生效"),
    (surfaceToggleButton.type = "button"),
    (surfaceToggleButton.className = "material-slot-surface-toggle"),
    (surfaceToggleButton.dataset.materialSlotSurfaceToggle = slotEntry.name),
    (surfaceToggleButton.setAttribute("aria-expanded", String(isSurfaceExpanded))),
    (surfaceToggleButton.textContent = hasSurfaceOverride ? "参数 •" : "参数"),
    (surfaceToggleButton.title =
      "调整该槽位的粗糙度与金属度（当前 " + runtime.materialSlotMetaText(slotEntry) + "）"),
    (resetButtonElement.type = "button"),
    (resetButtonElement.className = "material-slot-reset"),
    (resetButtonElement.dataset.materialSlotReset = slotWriteName),
    (resetButtonElement.textContent = "↺"),
    (resetButtonElement.disabled = !hasOverride || Boolean(slotEntry.hasAtlas)),
    (resetButtonElement.title = slotEntry.hasAtlas
      ? "该槽位颜色来自模型自带图集，没有可清除的手动颜色"
      : hasOverride
        ? "清除该槽位的手动颜色"
        : "该槽位当前就跟随主题"),
    controlsElement.append(
      colorInputElement,
      hexInputElement,
      surfaceToggleButton,
      resetButtonElement,
    ),
    slotTextElement.append(roleElement, nameElement, slabBadgeElement, atlasBadgeElement),
    slotLineElement.append(slotTextElement, controlsElement),
    slotRow.append(slotLineElement),
    slotVariants &&
      slotVariants.length > 1 &&
      slotRow.append(createMaterialSlotVariantList(runtime, slotVariants.slice(1))),
    slotRow.append(createMaterialSlotSurfacePanel(slotEntry, isSurfaceExpanded)),
    slotRow
  );
}

/**
 * 归并行里的其余色块：一行「灯罩与灯组」里前灯罩是白的、尾灯罩是红的、灯组外壳是暗的，
 * 三格各自一格色块，改哪格只写哪格里的材质（不会把尾灯刷成前灯色）。
 */
export function createMaterialSlotVariantList(runtime: StudioAppRuntime, slotVariants: any[]) {
  const variantListElement = document.createElement("div");
  variantListElement.className = "material-slot-variants";
  for (const slotVariant of slotVariants) {
    const variantElement = document.createElement("span"),
      variantNameElement = document.createElement("span"),
      variantColorInput = document.createElement("input"),
      variantHexInput = document.createElement("input"),
      variantColor = (slotVariant.overrideColor || slotVariant.color || "#000000").toLowerCase(),
      variantAtlas = Boolean(slotVariant.hasAtlas),
      variantWriteName = slotVariant.name;
    ((variantElement.className =
      "material-slot-variant" + (slotVariant.overrideColor ? " is-overridden" : "")),
      (variantNameElement.className = "material-slot-variant-name"),
      (variantNameElement.textContent = slotVariant.names?.join(" / ") || variantWriteName),
      (variantNameElement.title =
        (slotVariant.names?.join(" / ") || variantWriteName) +
        " · " +
        runtime.materialSlotMetaText(slotVariant)),
      (variantColorInput.type = "color"),
      (variantColorInput.className = "material-slot-color"),
      (variantColorInput.dataset.materialSlotColor = variantWriteName),
      (variantColorInput.value = variantColor),
      (variantColorInput.disabled = variantAtlas),
      (variantColorInput.title = variantAtlas
        ? "该格颜色来自模型自带图集，不能改色"
        : "点开取色器改这一格的颜色（只会写到这一格里的材质）"),
      (variantHexInput.type = "text"),
      (variantHexInput.className = "material-slot-hex"),
      (variantHexInput.dataset.materialSlotHex = variantWriteName),
      (variantHexInput.value = variantColor),
      (variantHexInput.spellcheck = false),
      (variantHexInput.maxLength = 7),
      (variantHexInput.disabled = variantAtlas),
      (variantHexInput.title = variantAtlas ? "该格颜色来自模型自带图集，不能改色" : "直接填十六进制色值"),
      variantElement.append(variantNameElement, variantColorInput, variantHexInput),
      variantListElement.append(variantElement));
  }
  return variantListElement;
}

/** 场景里同款物件的其它数量（「应用到同类」的按钮状态与提示用）：家具按模型比，门按门型比。 */
export function materialSameModelPeerCount(runtime: StudioAppRuntime, target: any) {
  return runtime.materialSameModelPeerRecords(target).length;
}

/** 材质编辑用的「模型类型」：家具取注册表里的模型类型，门就是 `door` —— 门的档位组与角色表都以 `door` 为键（门型差异由部件表处理，不另开模型类型）。 */
export function materialEditModelType(runtime: StudioAppRuntime, record: any, kind: any) {
  return kind === "door" ? "door" : runtime.externalModelRegistry.modelTypeForItem(record);
}

/** 当前选中对象里那一个「可做材质编辑」的：家具（GLB 模型）或门（户型洞口）。 */
export function selectedMaterialEditTarget(runtime: StudioAppRuntime, ) {
  const selectedObject = runtime.getSelectedObject();
  if (!selectedObject || !runtime.isSelectionAllowed(runtime.appCtx.selectedItem)) return null;
  if (runtime.appCtx.selectedItem?.kind === "item") return { kind: "item", record: selectedObject };
  if (runtime.appCtx.selectedItem?.kind === "door") return { kind: "door", record: selectedObject };
  return null;
}

/** 同款物件的其它成员：家具按 itemType 比，门按 **doorType** 比 —— 门的「同款」就是同一种门型（实木门与推拉门的部件都不一样，互相套用材质只会套出一堆无主的覆盖色）。 */
export function materialSameModelPeerRecords(runtime: StudioAppRuntime, target: any) {
  if (!target) return [];
  if (target.kind === "door") {
    const doorType = target.record?.doorType || "solid";
    return runtime.appCtx.studioState.doors.filter(
      (sceneDoor) => sceneDoor.id !== target.record.id && (sceneDoor.doorType || "solid") === doorType,
    );
  }
  const modelType = runtime.materialEditModelType(target.record, target.kind);
  if (!modelType) return [];
  return runtime.appCtx.studioState.items.filter(
    (sceneItem) =>
      sceneItem !== target.record &&
      sceneItem?.id !== target.record?.id &&
      runtime.externalModelRegistry.modelTypeForItem(sceneItem) === modelType,
  );
}

/** 逐物件材质编辑的公共收尾：只调用一次 `captureUndoSnapshot`，改动为真才落撤销 / 重建。 */
export function commitItemMaterialEdit(runtime: StudioAppRuntime, mutationFunction: any) {
  const materialEditTarget = runtime.selectedMaterialEditTarget();
  if (!materialEditTarget) return false;
  const undoSnapshot = runtime.captureUndoSnapshot();
  if (!mutationFunction(materialEditTarget.record, materialEditTarget.kind)) return false;
  return (
    (runtime.appCtx.materialSlotPanelSignature = ""),
    runtime.applyPlacementChange(undoSnapshot),
    runtime.refreshScopeItems(
      materialEditTarget.kind === "door"
        ? "architecture"
        : runtime.resolvePreviewScope(materialEditTarget.record),
    ),
    runtime.markDocumentDirty(),
    true
  );
}

/** 写入 / 清除逐物件材质覆盖色。 */
/**
 * 一条面板行可能代表**多个 GLB 材质**：车辆按语义槽位归并后，同一行里颜色/参数一致的
 * 材质并成了一个色块（见 `VEHICLE_MATERIAL_SLOTS`）。写回时按色块展开成真实材质名列表，
 * 否则改色只会命中分格里的第一个材质。
 */
export function materialSlotWriteTargets(slotEntries: any, materialName: any) {
  const slotEntry = Array.isArray(slotEntries)
    ? slotEntries.find(
        (candidate: any) =>
          candidate.name === materialName || candidate.members?.includes(materialName),
      )
    : null;
  const variant = slotEntry?.variants?.find(
    (candidate: any) => candidate.name === materialName || candidate.names?.includes(materialName),
  );
  return {
    names: variant?.names?.length ? variant.names : [materialName],
    hasAtlas: Boolean(variant ? variant.hasAtlas : slotEntry?.hasAtlas),
  };
}

export function setItemMaterialOverride(runtime: StudioAppRuntime, materialName: any, overrideColor: any) {
  runtime.commitItemMaterialEdit((modelItem: any) => {
    // 图集槽位不接受手动改色：颜色由整张 UV 图集提供，写进去只会把图集盖成一块纯色。
    const slotEntries = materialName
        ? runtime.externalModelRegistry.describeItemMaterials(
            modelItem,
            runtime.materialLoadOptionsForItem(modelItem),
          )
        : null,
      writeTargets = materialName
        ? materialSlotWriteTargets(slotEntries, materialName)
        : { names: [], hasAtlas: false };
    if (materialName && writeTargets.hasAtlas) return false;
    const previousOverrides =
        modelItem.materialOverrides &&
        typeof modelItem.materialOverrides == "object" &&
        !Array.isArray(modelItem.materialOverrides)
          ? { ...modelItem.materialOverrides }
          : {},
      nextOverrides = { ...previousOverrides },
      isOverrideColor =
        typeof overrideColor == "string" && /^#[0-9a-f]{6}$/i.test(overrideColor);
    if (!materialName)
      for (const overrideKey of Object.keys(nextOverrides)) delete nextOverrides[overrideKey];
    else if (isOverrideColor)
      for (const targetName of writeTargets.names)
        nextOverrides[targetName] = overrideColor.toLowerCase();
    else for (const targetName of writeTargets.names) delete nextOverrides[targetName];
    const touchedKeys = new Set([
      ...Object.keys(previousOverrides),
      ...Object.keys(nextOverrides),
    ]);
    if (
      ![...touchedKeys].some(
        (touchedKey) => previousOverrides[touchedKey] !== nextOverrides[touchedKey],
      )
    )
      return false;
    const normalizedOverrides = Object.fromEntries(
      Object.entries(nextOverrides).sort(([keyA], [keyB]) => (keyA < keyB ? -1 : keyA > keyB ? 1 : 0)),
    );
    Object.keys(normalizedOverrides).length
      ? (modelItem.materialOverrides = normalizedOverrides)
      : delete modelItem.materialOverrides;
    return true;
  });
}

/** 写入 / 清除「材质风格」档位（`item.materialStyle`）。 */
export function setItemMaterialStyle(runtime: StudioAppRuntime, styleValue: any) {
  runtime.commitItemMaterialEdit((modelItem: any, materialEditTargetKind: any) => {
    const modelType = runtime.materialEditModelType(modelItem, materialEditTargetKind),
      previousStyle = normalizeMaterialStyle(modelType, modelItem.materialStyle),
      nextStyle = normalizeMaterialStyle(modelType, styleValue);
    if (nextStyle === previousStyle) return false;
    nextStyle === MATERIAL_STYLE_AUTO
      ? delete modelItem.materialStyle
      : (modelItem.materialStyle = nextStyle);
    return true;
  });
}

/** 「全部跟随主题」：档位与逐槽覆盖色一起清掉（面板上那颗按钮的语义就是全复位）。 */
export function resetItemMaterialAll(runtime: StudioAppRuntime, ) {
  runtime.commitItemMaterialEdit((modelItem: any, materialEditTargetKind: any) => {
    const modelType = runtime.materialEditModelType(modelItem, materialEditTargetKind),
      hasOverrides = Boolean(
        modelItem.materialOverrides &&
          typeof modelItem.materialOverrides == "object" &&
          Object.keys(modelItem.materialOverrides).length,
      ),
      hasSurfaceOverrides = Boolean(
        Object.keys(normalizeMaterialSurfaceOverrides(modelItem.materialSurfaceOverrides)).length,
      ),
      hasMaterialStyle =
        normalizeMaterialStyle(modelType, modelItem.materialStyle) !== MATERIAL_STYLE_AUTO;
    if (!hasOverrides && !hasSurfaceOverrides && !hasMaterialStyle) return false;
    (delete modelItem.materialOverrides,
      delete modelItem.materialSurfaceOverrides,
      delete modelItem.materialStyle);
    return true;
  });
}

/** 写入 / 清除某个槽位的表面参数覆盖（`item.materialSurfaceOverrides`）。 */
export function setItemMaterialSurfaceOverride(runtime: StudioAppRuntime, materialName: any, surfaceKey: any, surfaceValue: any) {
  if (!materialName || !["roughness", "metalness"].includes(surfaceKey)) return;
  runtime.commitItemMaterialEdit((modelItem: any) => {
    // 归并后的色块代表多个真实材质，参数要写到该格的全部材质上。
    const surfaceTargetNames = materialSlotWriteTargets(
        runtime.externalModelRegistry.describeItemMaterials(
          modelItem,
          runtime.materialLoadOptionsForItem(modelItem),
        ),
        materialName,
      ).names,
      previousSurfaceOverrides = normalizeMaterialSurfaceOverrides(
        modelItem.materialSurfaceOverrides,
      ),
      isSurfaceNumber =
        typeof surfaceValue == "number" && Number.isFinite(surfaceValue),
      nextSurfaceOverrides = { ...previousSurfaceOverrides };
    for (const targetName of surfaceTargetNames) {
      const previousSlotOverride = previousSurfaceOverrides[targetName] || {},
        nextSlotOverride = { ...previousSlotOverride };
      isSurfaceNumber
        ? (nextSlotOverride[surfaceKey] =
            Math.round(Math.min(1, Math.max(0, surfaceValue)) * 100) / 100)
        : delete nextSlotOverride[surfaceKey];
      Object.keys(nextSlotOverride).length
        ? (nextSurfaceOverrides[targetName] = nextSlotOverride)
        : delete nextSurfaceOverrides[targetName];
    }
    const normalizedSurfaceOverrides = normalizeMaterialSurfaceOverrides(nextSurfaceOverrides);
    if (
      JSON.stringify(normalizedSurfaceOverrides) === JSON.stringify(previousSurfaceOverrides)
    )
      return false;
    return (
      Object.keys(normalizedSurfaceOverrides).length
        ? (modelItem.materialSurfaceOverrides = normalizedSurfaceOverrides)
        : delete modelItem.materialSurfaceOverrides,
      true
    );
  });
}

export function readStoredCustomMaterialStyles(runtime: StudioAppRuntime, ) {
  try {
    return JSON.parse(window.localStorage.getItem(runtime.MATERIAL_STYLE_CUSTOM_STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

/** 把存储里的个人预设装进档位表； */
export function loadCustomMaterialStyles(runtime: StudioAppRuntime, ) {
  const acceptedRecords = registerCustomMaterialStyles(runtime.readStoredCustomMaterialStyles());
  return acceptedRecords;
}

/** 个人预设只装一次：档位表的查询是热路径（每次刷新面板都要走），不能每次读 localStorage。 */
export function ensureCustomMaterialStylesLoaded(runtime: StudioAppRuntime, ) {
  runtime.appCtx.areCustomMaterialStylesLoaded ||
    ((runtime.appCtx.areCustomMaterialStylesLoaded = true), runtime.loadCustomMaterialStyles());
}

export function writeStoredCustomMaterialStyles(runtime: StudioAppRuntime, records: any) {
  try {
    window.localStorage.setItem(runtime.MATERIAL_STYLE_CUSTOM_STORAGE_KEY, JSON.stringify(records));
  } catch { /* 存储写入是 best-effort：隐私模式 / 配额 / 序列化失败都不应影响本次渲染 */ }
}
