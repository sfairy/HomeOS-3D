import { validatePlacementChange } from "./studio-placement.js?v=20260927-overlap-v1";
import {
  enhanceStudioSelect,
  initializeNumberInputs,
  disposeStudioSelects,
} from "./studio-widgets.js?v=20260927-courtyard-controls-v1";
import {
  snapCourtyardPoint,
  trimCourtyardArea,
  isCourtyardDrawing,
  DRAWING_STYLES,
  normalizeCourtyardDrawing,
  packDrawingPoints,
  drawingPlanPoints,
  pathPoints,
  samplePath,
  validLoop,
  validHole,
  segmentDistance,
  surfaceRegions,
  surfaceExclusions,
  fenceSegments,
  fenceOpenings,
  hedgeSamples,
} from "./courtyard-drawing.js?v=20260927-drawing-v5";
import { courtyardPalette } from "./courtyard-models.js";
export function createCourtyardDrawingEditor(host) {
  const { canvas: canvasElement, toolbar: toolbarElement, inspector: inspectorElement } = host,
    toolOptionsElement = document.createElement("div");
  ((toolOptionsElement.className = "courtyard-tool-options"),
    (toolOptionsElement.hidden = true),
    (toolOptionsElement.innerHTML =
      '<label>样式 <select aria-label="绘制样式"></select></label><label class="area-mode">方式 <select aria-label="地面绘制方式"><option value="polygon">逐点围合</option><option value="rectangle">拖画矩形</option></select></label><button type="button" data-action="finish">完成绘制</button><button type="button" data-action="cancel">取消</button><span>连续点击画边线，点起点闭合；Enter 完成，Esc 取消，Shift 锁轴</span>'),
    toolbarElement.append(toolOptionsElement));
  const fieldsElement = document.createElement("div");
  ((fieldsElement.className = "courtyard-fields field-section"),
    (fieldsElement.hidden = true),
    inspectorElement.append(fieldsElement));
  const styleSelect = toolOptionsElement.querySelector("select"),
    areaModeSelect = toolOptionsElement.querySelector('[aria-label="地面绘制方式"]');
  let renderedSignature = "",
    renderedItem = null,
    trimTargetId = null,
    snapFeedback = null,
    redoPoints = [],
    activeTool = "select",
    draftPoints = [],
    previewPoint = null,
    dragState = null,
    holeTargetId = null,
    selectedNodeIndex = -1,
    selectedRingIndex = -1,
    isNodeEditing = false,
    inspectedItemId = null;
  const drawingDefaultsByType = {};
  for (const drawingType of Object.keys(DRAWING_STYLES))
    drawingDefaultsByType[drawingType] = normalizeCourtyardDrawing({
      type: drawingType,
    }).drawing;
  const normalizeItemAngle = (item) =>
      ((((item.drawing.angle + (item.rotation || 0) + 180) % 360) + 360) % 360) - 180,
    getSelectedItem = () => host.selected(),
    isDrawingTool = () => Object.hasOwn(DRAWING_STYLES, activeTool),
    planPointAt = (pointerEvent) => host.point(pointerEvent),
    snapPoint = (inputPoint, anchorPoint, shouldLockAxis) => (
      (snapFeedback = snapCourtyardPoint(inputPoint, {
        base: host.snap(inputPoint, anchorPoint, shouldLockAxis),
        walls: host.scene().walls,
        items: host.scene().items,
        draft: draftPoints,
        ppm: host.ppm(),
        tolerance: (host.scene().settings?.snapTolerance || 13) / host.zoom(),
        enabled: host.snapping(),
        anchor: anchorPoint,
        forceAxis: shouldLockAxis,
        excludeId: dragState?.id,
        settings: host.scene().settings,
      })),
      host.feedback?.(snapFeedback),
      snapFeedback.point
    );
  function fillStyleOptions(selectElement, drawingStyleType, currentStyle) {
    ((selectElement.innerHTML = Object.entries(DRAWING_STYLES[drawingStyleType])
      .map(
        ([styleKey, styleLabel]) => '<option value="' + styleKey + '">' + styleLabel + "</option>",
      )
      .join("")),
      Object.hasOwn(DRAWING_STYLES[drawingStyleType], currentStyle) ||
        selectElement.insertAdjacentHTML(
          "beforeend",
          '<option value="' + currentStyle + '" disabled>旧款围挡（可切换）</option>',
        ),
      (selectElement.value = currentStyle));
  }
  function resetDraft() {
    if (dragState) {
      try {
        canvasElement.releasePointerCapture(dragState.pointerId);
      } catch {}
      dragState.original && dragState.item && Object.assign(dragState.item, dragState.original);
    }
    ((draftPoints = []),
      (redoPoints = []),
      (previewPoint = null),
      (holeTargetId = null),
      (trimTargetId = null),
      (snapFeedback = null),
      (dragState = null),
      host.feedback?.(null));
  }
  function setTool(toolId) {
    (resetDraft(),
      (activeTool = toolId),
      (toolOptionsElement.hidden = !isDrawingTool()),
      (isNodeEditing = false),
      isDrawingTool() &&
        ((styleSelect.closest("label").hidden = false),
        (toolOptionsElement.querySelector('[data-action="finish"]').disabled = false),
        (toolOptionsElement.querySelector("span").textContent =
          "连续点击画边线，点起点闭合；Enter 完成，Esc 取消，Shift 锁轴（矩形为正方形）"),
        fillStyleOptions(styleSelect, activeTool, drawingDefaultsByType[activeTool].style),
        (toolOptionsElement.querySelector(".area-mode").hidden = activeTool !== "courtyard-area")),
      host.draw());
  }
  function validatePlacement(plannedItem) {
    const placementError = validatePlacementChange(plannedItem, host.scene(), host.ppm());
    return placementError
      ? ((renderedSignature = ""), host.toast(placementError), host.refresh(), false)
      : true;
  }
  function finishDrawing() {
    if (!isDrawingTool()) return;
    if (trimTargetId) {
      host.toast("先点两点画裁剪线，再点击要裁掉的一侧。");
      return;
    }
    const isAreaTool = activeTool === "courtyard-area",
      minimumNodeCount = isAreaTool ? 3 : 2;
    if (draftPoints.length < minimumNodeCount) {
      host.toast(isAreaTool ? "至少绘制三个节点，或切换为拖画矩形。" : "至少绘制两个节点。");
      return;
    }
    if (isAreaTool && !validLoop(draftPoints)) {
      host.toast("轮廓不能交叉或重叠，请调整节点。");
      return;
    }
    if (holeTargetId) {
      const holeTargetItem = host
        .scene()
        .items.find((holeItemCandidate) => holeItemCandidate.id === holeTargetId);
      if (!holeTargetItem) return;
      if (holeTargetItem.drawing.holes.length >= 16) {
        host.toast("单块地面最多支持 16 处留空。");
        return;
      }
      const outerRingPoints = drawingPlanPoints(holeTargetItem, host.ppm()),
        holeRingPoints = holeTargetItem.drawing.holes.map((holeRing) =>
          drawingPlanPoints(holeTargetItem, host.ppm(), holeRing),
        );
      if (!validHole(draftPoints, outerRingPoints, holeRingPoints)) {
        host.toast("留空范围须完整位于地面内部，且不能与其他留空相交。");
        return;
      }
      host.snapshot();
      const packedHoleDrawing = packDrawingPoints(outerRingPoints, host.ppm(), [
        ...holeRingPoints,
        draftPoints,
      ]);
      ((holeTargetItem.drawing.angle = normalizeItemAngle(holeTargetItem)),
        Object.assign(holeTargetItem, {
          x: packedHoleDrawing.x,
          y: packedHoleDrawing.y,
          width: packedHoleDrawing.width,
          depth: packedHoleDrawing.depth,
          rotation: 0,
        }),
        (holeTargetItem.drawing.points = packedHoleDrawing.points),
        (holeTargetItem.drawing.holes = packedHoleDrawing.holes),
        resetDraft(),
        host.setTool("select"),
        (isNodeEditing = true),
        host.changed(),
        host.refresh());
      return;
    }
    const packedDraft = packDrawingPoints(draftPoints, host.ppm()),
      objectType = activeTool,
      drawingTemplate = structuredClone(drawingDefaultsByType[objectType]);
    if (
      ((drawingTemplate.style = styleSelect.value),
      (drawingTemplate.points = packedDraft.points),
      (drawingTemplate.holes = []),
      packedDraft.width > 200 || packedDraft.depth > 200)
    ) {
      host.toast("单个绘制对象不能超过 200 米，请分区绘制。");
      return;
    }
    const newItem = {
        id: host.id(),
        type: objectType,
        x: packedDraft.x,
        y: packedDraft.y,
        width: packedDraft.width,
        depth: packedDraft.depth,
        rotation: 0,
        elevation: 0,
        height:
          objectType === "courtyard-area"
            ? drawingTemplate.style === "deck"
              ? 0.16
              : drawingTemplate.style === "paving"
                ? 0.06
                : 0.04
            : objectType === "courtyard-path"
              ? 0.08
              : 1.2,
        color: "#7d8799",
        drawing: drawingTemplate,
      },
      sceneClone = host.clone();
    (host.scene().items.push(newItem),
      validatePlacement(sceneClone) &&
        (host.push(sceneClone),
        resetDraft(),
        host.select(newItem.id),
        host.setTool("select"),
        (isNodeEditing = true),
        host.changed(),
        host.refresh()));
  }
  ((styleSelect.onchange = () => {
    ((drawingDefaultsByType[activeTool].style = styleSelect.value),
      activeTool === "courtyard-area" &&
        (drawingDefaultsByType[activeTool].patternWidth =
          styleSelect.value === "deck" ? 0.16 : 0.6));
  }),
    (areaModeSelect.onchange = () => {
      ((draftPoints = []), (previewPoint = null), host.draw());
    }),
    (toolOptionsElement.querySelector('[data-action="finish"]').onclick = finishDrawing),
    (toolOptionsElement.querySelector('[data-action="cancel"]').onclick = () =>
      host.setTool("select")));
  function applyOutlineToItem(targetItem, outlinePoints, holeRings) {
    if (
      targetItem.type === "courtyard-area" &&
      (!validLoop(outlinePoints) ||
        holeRings.some(
          (checkedHole, checkedHoleIndex) =>
            !validHole(
              checkedHole,
              outlinePoints,
              holeRings.filter((otherHole, otherHoleIndex) => otherHoleIndex !== checkedHoleIndex),
            ),
        ))
    )
      return false;
    const packedRegion = packDrawingPoints(outlinePoints, host.ppm(), holeRings);
    return packedRegion.width > 200 || packedRegion.depth > 200
      ? false
      : ((targetItem.drawing.angle = normalizeItemAngle(targetItem)),
        Object.assign(targetItem, {
          x: packedRegion.x,
          y: packedRegion.y,
          width: packedRegion.width,
          depth: packedRegion.depth,
          rotation: 0,
        }),
        (targetItem.drawing.points = packedRegion.points),
        (targetItem.drawing.holes = packedRegion.holes),
        true);
  }
  function findOutlineHandle(handleItem, probePoint) {
    for (const [ringIndex, sampleRingPoints] of [
      -1,
      ...handleItem.drawing.holes.map((hole, holeMapIndex) => holeMapIndex),
    ].map((ringKey) => [
      ringKey,
      drawingPlanPoints(
        handleItem,
        host.ppm(),
        ringKey < 0 ? handleItem.drawing.points : handleItem.drawing.holes[ringKey],
      ),
    ])) {
      const nodeIndex = sampleRingPoints.findIndex(
        (candidatePoint) =>
          Math.hypot(candidatePoint.x - probePoint.x, candidatePoint.y - probePoint.y) *
            host.zoom() <
          10,
      );
      if (nodeIndex >= 0)
        return {
          index: nodeIndex,
          ring: ringIndex,
        };
    }
    return null;
  }
  function handlePointerDown(downEvent) {
    if (downEvent.button !== 0 || host.panning()) return;
    if (isDrawingTool()) {
      if (!host.calibrated()) return;
      (downEvent.preventDefault(),
        downEvent.stopImmediatePropagation(),
        canvasElement.focus({
          preventScroll: true,
        }),
        (redoPoints = []));
      const currentPlanPoint =
        trimTargetId && draftPoints.length === 2
          ? planPointAt(downEvent)
          : snapPoint(planPointAt(downEvent), draftPoints.at(-1), downEvent.shiftKey);
      if (trimTargetId) {
        if (draftPoints.length < 2) {
          ((!draftPoints.length ||
            Math.hypot(
              currentPlanPoint.x - draftPoints[0].x,
              currentPlanPoint.y - draftPoints[0].y,
            ) >
              host.ppm() * 0.01) &&
            draftPoints.push(currentPlanPoint),
            draftPoints.length === 2 && host.toast("点击裁剪线要去掉的一侧；Esc 取消。"),
            host.draw());
          return;
        }
        const trimTargetItem = host
            .scene()
            .items.find((trimItemCandidate) => trimItemCandidate.id === trimTargetId),
          trimmedRegions =
            trimTargetItem &&
            trimCourtyardArea(
              trimTargetItem,
              draftPoints[0],
              draftPoints[1],
              currentPlanPoint,
              host.ppm(),
            );
        if (!trimmedRegions?.length) {
          host.toast("裁剪会移除整块地面，请选择另一侧，或按 Esc 取消。");
          return;
        }
        if (
          trimmedRegions.length > 16 ||
          trimmedRegions.some(
            (complexRegion) =>
              complexRegion.outline.length > 128 ||
              complexRegion.holes.length > 16 ||
              complexRegion.holes.some((complexHole) => complexHole.length > 128),
          )
        ) {
          host.toast("裁剪结果过于复杂，请分段裁剪。");
          return;
        }
        const trimmedItems = trimmedRegions.map((trimRegion, trimRegionIndex) => {
          const packedTrimmed = packDrawingPoints(trimRegion.outline, host.ppm(), trimRegion.holes);
          return {
            ...structuredClone(trimTargetItem),
            id: trimRegionIndex ? host.id() : trimTargetItem.id,
            x: packedTrimmed.x,
            y: packedTrimmed.y,
            width: packedTrimmed.width,
            depth: packedTrimmed.depth,
            rotation: 0,
            drawing: {
              ...structuredClone(trimTargetItem.drawing),
              angle: normalizeItemAngle(trimTargetItem),
              points: packedTrimmed.points,
              holes: packedTrimmed.holes,
            },
          };
        });
        host.snapshot();
        const trimTargetPosition = host.scene().items.indexOf(trimTargetItem);
        (host.scene().items.splice(trimTargetPosition, 1, ...trimmedItems),
          resetDraft(),
          host.setTool("select"),
          host.select(trimmedItems[0].id),
          (isNodeEditing = true),
          host.changed(),
          host.refresh());
        return;
      }
      if (
        activeTool === "courtyard-area" &&
        areaModeSelect.value === "rectangle" &&
        !holeTargetId
      ) {
        ((dragState = {
          rectangle: true,
          start: currentPlanPoint,
          current: currentPlanPoint,
          pointerId: downEvent.pointerId,
        }),
          canvasElement.setPointerCapture(downEvent.pointerId));
        return;
      }
      if (
        draftPoints.length >= 3 &&
        Math.hypot(currentPlanPoint.x - draftPoints[0].x, currentPlanPoint.y - draftPoints[0].y) *
          host.zoom() <
          12 &&
        activeTool === "courtyard-area"
      ) {
        finishDrawing();
        return;
      }
      ((!draftPoints.length ||
        Math.hypot(
          currentPlanPoint.x - draftPoints.at(-1).x,
          currentPlanPoint.y - draftPoints.at(-1).y,
        ) >
          0.04 * host.ppm()) &&
        draftPoints.push(currentPlanPoint),
        draftPoints.length >= 128 &&
          ((draftPoints = draftPoints.slice(0, 128)),
          host.toast("已达到单条轮廓 128 个节点，请完成绘制。")),
        host.draw());
      return;
    }
    const selectedItem = getSelectedItem();
    if (activeTool !== "select" || !isNodeEditing || !isCourtyardDrawing(selectedItem)) return;
    const clickPoint = planPointAt(downEvent),
      originalItem = structuredClone(selectedItem),
      beforeClone = host.clone();
    let hitHandle = findOutlineHandle(selectedItem, clickPoint),
      isHandleInserted = false;
    if (!hitHandle) {
      const outlineRings = [
        drawingPlanPoints(selectedItem, host.ppm()),
        ...selectedItem.drawing.holes.map((ringHole) =>
          drawingPlanPoints(selectedItem, host.ppm(), ringHole),
        ),
      ];
      for (let ringCursor = 0; ringCursor < outlineRings.length && !hitHandle; ringCursor++)
        for (
          let segmentCursor = 0;
          segmentCursor <
          outlineRings[ringCursor].length -
            (selectedItem.type === "courtyard-area" || selectedItem.drawing.closed ? 0 : 1);
          segmentCursor++
        ) {
          const segmentStart = outlineRings[ringCursor][segmentCursor],
            segmentEnd =
              outlineRings[ringCursor][(segmentCursor + 1) % outlineRings[ringCursor].length],
            segmentMidpoint = {
              x: (segmentStart.x + segmentEnd.x) / 2,
              y: (segmentStart.y + segmentEnd.y) / 2,
            };
          if (!(
            Math.hypot(segmentStart.x - segmentEnd.x, segmentStart.y - segmentEnd.y) * host.zoom() <
              30 ||
            Math.hypot(clickPoint.x - segmentMidpoint.x, clickPoint.y - segmentMidpoint.y) *
              host.zoom() >
              8 ||
            outlineRings[ringCursor].length >= 128
          )) {
            (outlineRings[ringCursor].splice(segmentCursor + 1, 0, segmentMidpoint),
              applyOutlineToItem(selectedItem, outlineRings[0], outlineRings.slice(1)) &&
                ((hitHandle = {
                  index: segmentCursor + 1,
                  ring: ringCursor - 1,
                }),
                (isHandleInserted = true)));
            break;
          }
        }
    }
    hitHandle &&
      (downEvent.preventDefault(),
      downEvent.stopImmediatePropagation(),
      canvasElement.focus({
        preventScroll: true,
      }),
      (selectedNodeIndex = hitHandle.index),
      (selectedRingIndex = hitHandle.ring),
      (dragState = {
        id: selectedItem.id,
        item: selectedItem,
        pointerId: downEvent.pointerId,
        before: beforeClone,
        original: originalItem,
        outline: drawingPlanPoints(selectedItem, host.ppm()),
        holes: selectedItem.drawing.holes.map((dragHoleRing) =>
          drawingPlanPoints(selectedItem, host.ppm(), dragHoleRing),
        ),
        moved: isHandleInserted,
        inserted: isHandleInserted,
      }),
      (dragState.patternAngle = normalizeItemAngle(selectedItem)),
      canvasElement.setPointerCapture(downEvent.pointerId),
      renderFields(selectedItem),
      host.draw());
  }
  function handlePointerMove(moveEvent) {
    if (dragState?.pointerId === moveEvent.pointerId) {
      if ((moveEvent.preventDefault(), moveEvent.stopImmediatePropagation(), dragState.rectangle)) {
        const movePoint = snapPoint(planPointAt(moveEvent), null, false),
          rectangleStart = dragState.start;
        if (moveEvent.shiftKey) {
          const squareSize = Math.max(
            Math.abs(movePoint.x - rectangleStart.x),
            Math.abs(movePoint.y - rectangleStart.y),
          );
          ((dragState.current = {
            x: rectangleStart.x + Math.sign(movePoint.x - rectangleStart.x || 1) * squareSize,
            y: rectangleStart.y + Math.sign(movePoint.y - rectangleStart.y || 1) * squareSize,
          }),
            (snapFeedback = {
              point: dragState.current,
              kind: "axis",
              label: "正方形",
            }));
        } else dragState.current = movePoint;
        host.draw();
        return;
      }
      const dragItem = host
        .scene()
        .items.find((dragItemCandidate) => dragItemCandidate.id === dragState.id);
      if (!dragItem) return;
      const dragItemAngle = dragItem.drawing.angle,
        dragItemRotation = dragItem.rotation;
      ((dragItem.drawing.angle = dragState.patternAngle), (dragItem.rotation = 0));
      const dragOutline = structuredClone(dragState.outline),
        dragHoles = structuredClone(dragState.holes),
        activeRing = selectedRingIndex < 0 ? dragOutline : dragHoles[selectedRingIndex];
      ((activeRing[selectedNodeIndex] = snapPoint(
        planPointAt(moveEvent),
        activeRing[(selectedNodeIndex + activeRing.length - 1) % activeRing.length],
        moveEvent.shiftKey,
      )),
        (dragState.invalid = !applyOutlineToItem(dragItem, dragOutline, dragHoles)),
        dragState.invalid
          ? ((dragItem.drawing.angle = dragItemAngle), (dragItem.rotation = dragItemRotation))
          : (dragState.moved = true),
        host.draw());
      return;
    }
    isDrawingTool() &&
      (moveEvent.stopImmediatePropagation(),
      (previewPoint =
        trimTargetId && draftPoints.length === 2
          ? planPointAt(moveEvent)
          : snapPoint(planPointAt(moveEvent), draftPoints.at(-1), moveEvent.shiftKey)),
      host.draw());
  }
  function handlePointerRelease(releaseEvent) {
    if (dragState?.pointerId !== releaseEvent.pointerId) return;
    (releaseEvent.preventDefault(), releaseEvent.stopImmediatePropagation());
    const releasedDrag = dragState;
    dragState = null;
    try {
      canvasElement.releasePointerCapture(releaseEvent.pointerId);
    } catch {}
    if (releasedDrag.rectangle) {
      if (releaseEvent.type === "pointercancel") {
        host.draw();
        return;
      }
      const dragStartPoint = releasedDrag.start,
        dragCurrentPoint = releasedDrag.current;
      if (
        Math.abs(dragStartPoint.x - dragCurrentPoint.x) < host.ppm() * 0.1 ||
        Math.abs(dragStartPoint.y - dragCurrentPoint.y) < host.ppm() * 0.1
      ) {
        host.draw();
        return;
      }
      ((draftPoints = [
        dragStartPoint,
        {
          x: dragCurrentPoint.x,
          y: dragStartPoint.y,
        },
        dragCurrentPoint,
        {
          x: dragStartPoint.x,
          y: dragCurrentPoint.y,
        },
      ]),
        finishDrawing());
      return;
    }
    if (releaseEvent.type === "pointercancel") {
      (Object.assign(
        host
          .scene()
          .items.find((cancelItemCandidate) => cancelItemCandidate.id === releasedDrag.id),
        releasedDrag.original,
      ),
        host.refresh());
      return;
    }
    (releasedDrag.moved &&
      validatePlacement(releasedDrag.before) &&
      (host.push(releasedDrag.before), host.changed()),
      releasedDrag.invalid && host.toast("该位置会使轮廓交叉或留空越界，已保留最后有效位置。"),
      host.refresh());
  }
  (canvasElement.addEventListener("pointerdown", handlePointerDown, true),
    canvasElement.addEventListener("pointermove", handlePointerMove, true));
  for (const pointerEventName of ["pointerup", "pointercancel"])
    canvasElement.addEventListener(pointerEventName, handlePointerRelease, true);
  (canvasElement.addEventListener(
    "dblclick",
    (doubleClickEvent) => {
      if (isDrawingTool()) {
        (doubleClickEvent.preventDefault(),
          doubleClickEvent.stopImmediatePropagation(),
          activeTool !== "courtyard-area" && finishDrawing());
        return;
      }
      const doubleClickItem = getSelectedItem();
      if (!isNodeEditing || !isCourtyardDrawing(doubleClickItem)) return;
      const doubleClickPoint = planPointAt(doubleClickEvent),
        doubleClickRings = [
          drawingPlanPoints(doubleClickItem, host.ppm()),
          ...doubleClickItem.drawing.holes.map((doubleClickHoleRing) =>
            drawingPlanPoints(doubleClickItem, host.ppm(), doubleClickHoleRing),
          ),
        ];
      for (
        let doubleClickRingCursor = 0;
        doubleClickRingCursor < doubleClickRings.length;
        doubleClickRingCursor++
      )
        for (
          let doubleClickSegmentCursor = 0;
          doubleClickSegmentCursor <
          doubleClickRings[doubleClickRingCursor].length -
            (doubleClickItem.type === "courtyard-area" || doubleClickItem.drawing.closed ? 0 : 1);
          doubleClickSegmentCursor++
        ) {
          const doubleClickSegmentStart =
              doubleClickRings[doubleClickRingCursor][doubleClickSegmentCursor],
            doubleClickSegmentEnd =
              doubleClickRings[doubleClickRingCursor][
                (doubleClickSegmentCursor + 1) % doubleClickRings[doubleClickRingCursor].length
              ];
          if (
            segmentDistance(doubleClickPoint, doubleClickSegmentStart, doubleClickSegmentEnd) *
              host.zoom() >
            10
          )
            continue;
          if (doubleClickRings[doubleClickRingCursor].length >= 128) return;
          const segmentDeltaX = doubleClickSegmentEnd.x - doubleClickSegmentStart.x,
            segmentDeltaY = doubleClickSegmentEnd.y - doubleClickSegmentStart.y,
            segmentT = Math.max(
              0,
              Math.min(
                1,
                ((doubleClickPoint.x - doubleClickSegmentStart.x) * segmentDeltaX +
                  (doubleClickPoint.y - doubleClickSegmentStart.y) * segmentDeltaY) /
                  (segmentDeltaX * segmentDeltaX + segmentDeltaY * segmentDeltaY || 1),
              ),
            ),
            insertClone = host.clone();
          if (
            (doubleClickRings[doubleClickRingCursor].splice(doubleClickSegmentCursor + 1, 0, {
              x: doubleClickSegmentStart.x + segmentT * segmentDeltaX,
              y: doubleClickSegmentStart.y + segmentT * segmentDeltaY,
            }),
            !applyOutlineToItem(doubleClickItem, doubleClickRings[0], doubleClickRings.slice(1)) ||
              !validatePlacement(insertClone))
          )
            return;
          (host.push(insertClone),
            (selectedNodeIndex = doubleClickSegmentCursor + 1),
            (selectedRingIndex = doubleClickRingCursor - 1),
            host.changed(),
            host.refresh(),
            doubleClickEvent.preventDefault(),
            doubleClickEvent.stopImmediatePropagation());
          return;
        }
    },
    true,
  ),
    window.addEventListener(
      "keydown",
      (keyEvent) => {
        if (!keyEvent.target.closest?.('input,select,textarea,[contenteditable="true"]')) {
          if (
            dragState &&
            (keyEvent.key === "Escape" ||
              ((keyEvent.metaKey || keyEvent.ctrlKey) && keyEvent.key.toLowerCase() === "z"))
          ) {
            (keyEvent.preventDefault(),
              keyEvent.stopImmediatePropagation(),
              handlePointerRelease({
                pointerId: dragState.pointerId,
                type: "pointercancel",
                preventDefault() {},
                stopImmediatePropagation() {},
              }));
            return;
          }
          if (
            !isDrawingTool() &&
            isNodeEditing &&
            selectedNodeIndex >= 0 &&
            isCourtyardDrawing(getSelectedItem()) &&
            ["Delete", "Backspace"].includes(keyEvent.key)
          ) {
            (keyEvent.preventDefault(),
              keyEvent.stopImmediatePropagation(),
              fieldsElement.querySelector('[data-action="remove-node"]').onclick?.());
            return;
          }
          if (
            isDrawingTool() &&
            (keyEvent.metaKey || keyEvent.ctrlKey) &&
            keyEvent.key.toLowerCase() === "z" &&
            (draftPoints.length || redoPoints.length)
          ) {
            (keyEvent.preventDefault(),
              keyEvent.stopImmediatePropagation(),
              keyEvent.shiftKey
                ? redoPoints.length && draftPoints.push(redoPoints.pop())
                : draftPoints.length && redoPoints.push(draftPoints.pop()),
              host.draw());
            return;
          }
          isDrawingTool() &&
            ["Enter", "Escape", "Backspace", "Delete"].includes(keyEvent.key) &&
            (keyEvent.preventDefault(),
            keyEvent.stopImmediatePropagation(),
            keyEvent.key === "Enter"
              ? finishDrawing()
              : keyEvent.key === "Escape"
                ? host.setTool("select")
                : (draftPoints.length && redoPoints.push(draftPoints.pop()), host.draw()));
        }
      },
      true,
    ));
  function drawItem(drawnItem, painter) {
    const pixelsPerMeter = host.ppm(),
      palette = courtyardPalette(
        drawnItem.type === "courtyard-area"
          ? "garden-" + drawnItem.drawing.style
          : drawnItem.type === "courtyard-path"
            ? "garden-stepping"
            : "garden-fence",
        "default",
      ),
      planColor = host.planColor?.(drawnItem),
      isSelected = host.isSelected(drawnItem.id),
      planOutline = drawingPlanPoints(drawnItem, pixelsPerMeter),
      traceRing = (ringPoints) => {
        ringPoints.forEach((ringPoint, ringPointIndex) => {
          const screenPoint = host.screen(ringPoint);
          ringPointIndex
            ? painter.lineTo(screenPoint.x, screenPoint.y)
            : painter.moveTo(screenPoint.x, screenPoint.y);
        });
      };
    if (
      (painter.save(),
      (painter.strokeStyle = isSelected ? "#ff9d2e" : planColor || "#c7d0d7"),
      (painter.lineWidth = isSelected ? 2.5 : 1.5),
      drawnItem.type === "courtyard-area")
    ) {
      painter.fillStyle =
        (planColor ||
          "#" +
            (drawnItem.drawing.style === "lawn"
              ? palette.leaf
              : drawnItem.drawing.style === "deck"
                ? palette.base
                : palette.light
            )
              .toString(16)
              .padStart(6, "0")) + "66";
      const surfaceRegionList = surfaceRegions(
        drawnItem,
        surfaceExclusions(drawnItem, host.scene().items, host.buildings(), pixelsPerMeter),
      );
      painter.beginPath();
      for (const surfaceRegion of surfaceRegionList)
        for (const surfaceRing of [surfaceRegion.outline, ...surfaceRegion.holes])
          (traceRing(
            drawingPlanPoints(
              drawnItem,
              pixelsPerMeter,
              surfaceRing.map((normalizedPoint) => ({
                x: normalizedPoint.x / drawnItem.width,
                y: normalizedPoint.y / drawnItem.depth,
              })),
            ),
          ),
            painter.closePath());
      (painter.fill("evenodd"), painter.stroke());
    } else {
      const rotationRad = ((drawnItem.rotation || 0) * Math.PI) / 180,
        cosRotation = Math.cos(rotationRad),
        sinRotation = Math.sin(rotationRad),
        modelToScreen = (modelPoint) =>
          host.screen({
            x:
              drawnItem.x +
              (modelPoint.x * cosRotation - modelPoint.y * sinRotation) * pixelsPerMeter,
            y:
              drawnItem.y +
              (modelPoint.x * sinRotation + modelPoint.y * cosRotation) * pixelsPerMeter,
          });
      if (drawnItem.type === "courtyard-path")
        for (const pathSample of samplePath(
          pathPoints(drawnItem),
          Math.max(drawnItem.drawing.spacing, drawnItem.drawing.stoneDepth + 0.05),
        )) {
          const pathScreenPoint = modelToScreen(pathSample);
          (painter.save(),
            painter.translate(pathScreenPoint.x, pathScreenPoint.y),
            painter.rotate(pathSample.angle + rotationRad),
            (painter.fillStyle = planColor || "#" + palette.light.toString(16).padStart(6, "0")),
            painter.beginPath());
          const stoneDepthPx = drawnItem.drawing.stoneDepth * pixelsPerMeter * host.zoom(),
            stoneWidthPx = drawnItem.drawing.stoneWidth * pixelsPerMeter * host.zoom();
          (drawnItem.drawing.style === "square"
            ? painter.rect(-stoneDepthPx / 2, -stoneWidthPx / 2, stoneDepthPx, stoneWidthPx)
            : painter.ellipse(0, 0, stoneDepthPx / 2, stoneWidthPx / 2, 0, 0, Math.PI * 2),
            painter.fill(),
            painter.stroke(),
            painter.restore());
        }
      else {
        if (drawnItem.drawing.style === "hedge") {
          painter.fillStyle =
            (planColor || "#" + palette.leaf.toString(16).padStart(6, "0")) + "99";
          for (const hedgeSample of hedgeSamples(
            drawnItem,
            fenceOpenings(drawnItem, host.scene().items),
          )) {
            const hedgeScreenPoint = modelToScreen(hedgeSample);
            (painter.beginPath(),
              painter.arc(
                hedgeScreenPoint.x,
                hedgeScreenPoint.y,
                drawnItem.drawing.thickness * 1.5 * pixelsPerMeter * host.zoom(),
                0,
                Math.PI * 2,
              ),
              painter.fill(),
              painter.stroke());
          }
        } else {
          ((painter.lineWidth = Math.max(
            3,
            drawnItem.drawing.thickness * pixelsPerMeter * host.zoom(),
          )),
            painter.beginPath());
          for (const [fenceStart, fenceEnd] of fenceSegments(
            drawnItem,
            fenceOpenings(drawnItem, host.scene().items),
          )) {
            const fenceStartScreen = modelToScreen(fenceStart),
              fenceEndScreen = modelToScreen(fenceEnd);
            (painter.moveTo(fenceStartScreen.x, fenceStartScreen.y),
              painter.lineTo(fenceEndScreen.x, fenceEndScreen.y));
          }
          painter.stroke();
        }
      }
    }
    if (isSelected && isNodeEditing) {
      for (const [handleRingKey, handleRingPoints] of [
        [-1, planOutline],
        ...drawnItem.drawing.holes.map((handleHoleRing, handleHoleIndex) => [
          handleHoleIndex,
          drawingPlanPoints(drawnItem, pixelsPerMeter, handleHoleRing),
        ]),
      ])
        handleRingPoints.forEach((handlePoint, handlePointIndex) => {
          const handleScreenPoint = host.screen(handlePoint);
          ((painter.fillStyle =
            selectedNodeIndex === handlePointIndex && selectedRingIndex === handleRingKey
              ? "#ff9d2e"
              : "#edf2f7"),
            painter.beginPath(),
            painter.arc(handleScreenPoint.x, handleScreenPoint.y, 5, 0, Math.PI * 2),
            painter.fill(),
            painter.stroke());
        });
      for (const outlineRingList of [
        planOutline,
        ...drawnItem.drawing.holes.map((outlineHoleRing) =>
          drawingPlanPoints(drawnItem, pixelsPerMeter, outlineHoleRing),
        ),
      ])
        for (
          let outlineRingCursor = 0;
          outlineRingCursor <
          outlineRingList.length -
            (drawnItem.type === "courtyard-area" || drawnItem.drawing.closed ? 0 : 1);
          outlineRingCursor++
        ) {
          const outlineSegmentStart = outlineRingList[outlineRingCursor],
            outlineSegmentEnd = outlineRingList[(outlineRingCursor + 1) % outlineRingList.length];
          if (
            Math.hypot(
              outlineSegmentStart.x - outlineSegmentEnd.x,
              outlineSegmentStart.y - outlineSegmentEnd.y,
            ) *
              host.zoom() <
            30
          )
            continue;
          const outlineSegmentMidScreen = host.screen({
            x: (outlineSegmentStart.x + outlineSegmentEnd.x) / 2,
            y: (outlineSegmentStart.y + outlineSegmentEnd.y) / 2,
          });
          ((painter.fillStyle = "#17202b"),
            painter.fillRect(outlineSegmentMidScreen.x - 3, outlineSegmentMidScreen.y - 3, 6, 6),
            painter.strokeRect(outlineSegmentMidScreen.x - 3, outlineSegmentMidScreen.y - 3, 6, 6));
        }
    }
    painter.restore();
  }
  function drawPreview(previewPainter) {
    if (!isDrawingTool() && !dragState) return;
    let previewPoints = [...draftPoints];
    if (dragState?.rectangle) {
      const previewRectangleStart = dragState.start,
        previewRectangleEnd = dragState.current;
      previewPoints = [
        previewRectangleStart,
        {
          x: previewRectangleEnd.x,
          y: previewRectangleStart.y,
        },
        previewRectangleEnd,
        {
          x: previewRectangleStart.x,
          y: previewRectangleEnd.y,
        },
        previewRectangleStart,
      ];
    } else
      previewPoint &&
        !(trimTargetId && draftPoints.length === 2) &&
        previewPoints.push(previewPoint);
    if (!previewPoints.length && !snapFeedback) return;
    (previewPainter.save(),
      (previewPainter.strokeStyle = "#ff9d2e"),
      (previewPainter.lineWidth = 2),
      previewPainter.setLineDash([6, 4]),
      previewPainter.beginPath(),
      previewPoints.forEach((previewVertex, previewVertexIndex) => {
        const previewScreenPoint = host.screen(previewVertex);
        previewVertexIndex
          ? previewPainter.lineTo(previewScreenPoint.x, previewScreenPoint.y)
          : previewPainter.moveTo(previewScreenPoint.x, previewScreenPoint.y);
      }),
      activeTool === "courtyard-area" &&
        !trimTargetId &&
        previewPoints.length >= 3 &&
        (previewPainter.closePath(),
        (previewPainter.fillStyle = "#ff9d2e16"),
        previewPainter.fill()),
      previewPainter.stroke(),
      previewPainter.setLineDash([]));
    for (const draftVertex of draftPoints) {
      const draftScreenPoint = host.screen(draftVertex);
      (previewPainter.beginPath(),
        previewPainter.arc(draftScreenPoint.x, draftScreenPoint.y, 4, 0, Math.PI * 2),
        (previewPainter.fillStyle = "#ff9d2e"),
        previewPainter.fill());
    }
    const drawPlanLabel = (
      labelAnchorPlan,
      labelText,
      labelColor = "#43d2e6",
      labelOffsetY = -25,
    ) => {
      const labelAnchorScreen = host.screen(labelAnchorPlan);
      previewPainter.font = "12px sans-serif";
      const labelWidthPx = previewPainter.measureText(labelText).width,
        labelX = Math.max(
          4,
          Math.min(labelAnchorScreen.x + 10, canvasElement.clientWidth - labelWidthPx - 16),
        ),
        labelY = Math.max(
          4,
          Math.min(labelAnchorScreen.y + labelOffsetY, canvasElement.clientHeight - 26),
        );
      ((previewPainter.fillStyle = "#17202b"),
        previewPainter.fillRect(labelX, labelY, labelWidthPx + 12, 22),
        (previewPainter.fillStyle = labelColor),
        previewPainter.fillText(labelText, labelX + 6, labelY + 15));
    };
    if (snapFeedback?.kind && !(trimTargetId && draftPoints.length === 2)) {
      const feedbackScreenPoint = host.screen(snapFeedback.point);
      ((previewPainter.strokeStyle = "#43d2e6"),
        (previewPainter.lineWidth = 2),
        previewPainter.strokeRect(feedbackScreenPoint.x - 5, feedbackScreenPoint.y - 5, 10, 10),
        drawPlanLabel(snapFeedback.point, snapFeedback.label));
    }
    if (previewPoints.length >= 2) {
      const lastSegmentStart = previewPoints.at(-2),
        lastSegmentEnd = previewPoints.at(-1);
      drawPlanLabel(
        {
          x: (lastSegmentStart.x + lastSegmentEnd.x) / 2,
          y: (lastSegmentStart.y + lastSegmentEnd.y) / 2,
        },
        (
          Math.hypot(lastSegmentEnd.x - lastSegmentStart.x, lastSegmentEnd.y - lastSegmentStart.y) /
          host.ppm()
        ).toFixed(2) + " m",
        "#ff9d2e",
        10,
      );
    }
    if (trimTargetId && draftPoints.length === 2 && previewPoint) {
      const previewTrimItem = host
          .scene()
          .items.find((previewTrimCandidate) => previewTrimCandidate.id === trimTargetId),
        previewTrimRegions =
          previewTrimItem &&
          trimCourtyardArea(
            previewTrimItem,
            draftPoints[0],
            draftPoints[1],
            previewPoint,
            host.ppm(),
          ),
        trimLineStartScreen = host.screen(draftPoints[0]),
        trimLineEndScreen = host.screen(draftPoints[1]),
        trimLineDeltaX = trimLineEndScreen.x - trimLineStartScreen.x,
        trimLineDeltaY = trimLineEndScreen.y - trimLineStartScreen.y;
      ((previewPainter.strokeStyle = "#ff9d2e"),
        previewPainter.setLineDash([6, 4]),
        previewPainter.beginPath(),
        previewPainter.moveTo(
          trimLineStartScreen.x - trimLineDeltaX * 100,
          trimLineStartScreen.y - trimLineDeltaY * 100,
        ),
        previewPainter.lineTo(
          trimLineStartScreen.x + trimLineDeltaX * 100,
          trimLineStartScreen.y + trimLineDeltaY * 100,
        ),
        previewPainter.stroke(),
        previewPainter.setLineDash([]),
        (previewPainter.fillStyle = "#43d2e633"),
        (previewPainter.strokeStyle = "#43d2e6"),
        previewPainter.beginPath());
      for (const previewTrimRegion of previewTrimRegions || [])
        for (const previewTrimRing of [previewTrimRegion.outline, ...previewTrimRegion.holes])
          (previewTrimRing.forEach((previewRingPoint, previewRingPointIndex) => {
            const trimScreenPoint = host.screen(previewRingPoint);
            previewRingPointIndex
              ? previewPainter.lineTo(trimScreenPoint.x, trimScreenPoint.y)
              : previewPainter.moveTo(trimScreenPoint.x, trimScreenPoint.y);
          }),
            previewPainter.closePath());
      (previewPainter.fill("evenodd"),
        previewPainter.stroke(),
        drawPlanLabel(previewPoint, "裁掉此侧，蓝色保留"));
    }
    previewPainter.restore();
  }
  function renderFields(inspectedItem) {
    if (((fieldsElement.hidden = !isCourtyardDrawing(inspectedItem)), fieldsElement.hidden))
      return ((inspectedItemId = null), (renderedSignature = ""), false);
    inspectedItemId !== inspectedItem.id &&
      ((selectedNodeIndex = -1),
      (selectedRingIndex = -1),
      (isNodeEditing = true),
      (inspectedItemId = inspectedItem.id));
    const itemSignature = JSON.stringify([
      inspectedItem.id,
      inspectedItem.type,
      inspectedItem.height,
      inspectedItem.elevation,
      inspectedItem.rotation,
      inspectedItem.drawing,
      isNodeEditing,
      selectedNodeIndex,
      selectedRingIndex,
    ]);
    if (renderedSignature === itemSignature && renderedItem === inspectedItem) return true;
    ((renderedSignature = itemSignature), (renderedItem = inspectedItem));
    const itemType = inspectedItem.type,
      itemDrawing = inspectedItem.drawing,
      numberFieldMarkup = (fieldLabel, fieldName, fieldValue, fieldMin, fieldMax, fieldStep) =>
        "<label>" +
        fieldLabel +
        '<input aria-label="' +
        fieldLabel +
        '" data-field="' +
        fieldName +
        '" type="number" value="' +
        fieldValue +
        '" min="' +
        fieldMin +
        '" max="' +
        fieldMax +
        '" step="' +
        fieldStep +
        '"></label>';
    (disposeStudioSelects(fieldsElement),
      (fieldsElement.innerHTML =
        '<label>样式<select aria-label="庭院对象样式" data-field="style"></select></label><div class="field-grid">' +
        (itemType === "courtyard-area" && itemDrawing.style === "lawn"
          ? ""
          : numberFieldMarkup(
              itemType === "courtyard-area" ? "面层厚度（m）" : "高度（m）",
              "height",
              inspectedItem.height,
              0.01,
              6,
              0.01,
            )) +
        numberFieldMarkup(
          itemType === "courtyard-area" ? "整体抬高（m）" : "离地（m）",
          "elevation",
          inspectedItem.elevation,
          0,
          6,
          0.01,
        ) +
        numberFieldMarkup("整体旋转（°）", "rotation", inspectedItem.rotation, -360, 360, 1) +
        (itemType === "courtyard-area" && itemDrawing.style !== "lawn"
          ? numberFieldMarkup("铺设方向（°）", "angle", itemDrawing.angle, -180, 180, 5) +
            numberFieldMarkup(
              itemDrawing.style === "deck" ? "木板宽（m）" : "砖宽（m）",
              "patternWidth",
              itemDrawing.patternWidth,
              0.08,
              2,
              0.01,
            ) +
            (itemDrawing.style === "paving"
              ? numberFieldMarkup(
                  "砖长（m）",
                  "patternLength",
                  itemDrawing.patternLength,
                  0.1,
                  3,
                  0.05,
                )
              : "")
          : "") +
        (itemType !== "courtyard-area"
          ? numberFieldMarkup(
              itemType === "courtyard-path"
                ? "步距（m）"
                : itemDrawing.style === "hedge"
                  ? "绿篱株距（m）"
                  : "立柱间距（m）",
              itemDrawing.style === "hedge" ? "hedgeSpacing" : "spacing",
              itemDrawing.style === "hedge" ? itemDrawing.hedgeSpacing : itemDrawing.spacing,
              0.2,
              5,
              0.05,
            )
          : "") +
        (itemType === "courtyard-path"
          ? numberFieldMarkup(
              "石头宽（m）",
              "stoneWidth",
              itemDrawing.stoneWidth,
              0.15,
              1.5,
              0.05,
            ) +
            numberFieldMarkup("石头长（m）", "stoneDepth", itemDrawing.stoneDepth, 0.15, 1.5, 0.05)
          : "") +
        (itemType === "courtyard-fence"
          ? numberFieldMarkup("围挡厚度（m）", "thickness", itemDrawing.thickness, 0.06, 0.8, 0.01)
          : "") +
        "</div>" +
        (itemType === "courtyard-path"
          ? '<label class="courtyard-toggle"><input type="checkbox" data-field="curve" ' +
            (itemDrawing.curve ? "checked" : "") +
            ">平滑曲线</label>"
          : "") +
        (itemType === "courtyard-fence"
          ? '<label class="courtyard-toggle"><input type="checkbox" data-field="closed" ' +
            (itemDrawing.closed ? "checked" : "") +
            ">闭合围挡</label>"
          : "") +
        (itemType === "courtyard-fence"
          ? '<div class="courtyard-subsection"><p class="courtyard-section-title">预留门洞</p><div class="field-grid">' +
            numberFieldMarkup("门洞宽（m）", "gateWidth", itemDrawing.gateWidth, 0, 4, 0.1) +
            numberFieldMarkup("距起点（m）", "gateOffset", itemDrawing.gateOffset, 0, 200, 0.1) +
            '</div><p class="muted">宽度设为 0 关闭；放置庭院门也会自动留口。</p></div>'
          : "") +
        ('<div class="courtyard-subsection"><p class="courtyard-section-title">轮廓编辑</p><div class="courtyard-actions"><button type="button" data-action="nodes">' +
          (isNodeEditing ? "完成节点编辑" : "编辑节点") +
          '</button><button type="button" data-action="remove-node" ' +
          (selectedNodeIndex < 0 ? "disabled" : "") +
          ">删除选中节点</button>") +
        (itemType === "courtyard-area"
          ? '<button type="button" data-action="trim">画线裁剪</button><button type="button" data-action="hole">绘制留空</button><button type="button" data-action="remove-hole">移除选中留空</button>'
          : "") +
        '</div><p class="muted">' +
        (itemType === "courtyard-fence" && itemDrawing.style === "hedge"
          ? "株距是相邻植株中心的距离；越小越密，越大越疏。"
          : "") +
        "拖动圆点改形，拖动边中点加节点；选中圆点后按 Delete 删除。完成节点编辑后可整体拖动。" +
        (itemType === "courtyard-area" ? "画线裁剪：画一条线，再点要裁掉的一侧。" : "") +
        "</p></div>"),
      fillStyleOptions(fieldsElement.querySelector("select"), itemType, itemDrawing.style),
      fieldsElement.querySelectorAll("[data-field]").forEach(
        (fieldElement) =>
          (fieldElement.onchange = () => {
            const fieldClone = host.clone(),
              fieldKey = fieldElement.dataset.field,
              fieldInputValue =
                fieldElement.type === "checkbox"
                  ? fieldElement.checked
                  : fieldElement.tagName === "SELECT"
                    ? fieldElement.value
                    : Number(fieldElement.value);
            if (["height", "elevation", "rotation"].includes(fieldKey))
              inspectedItem[fieldKey] = Math.max(
                Number(fieldElement.min),
                Math.min(
                  Number(fieldElement.max),
                  Number.isFinite(fieldInputValue) ? fieldInputValue : 0,
                ),
              );
            else {
              if (fieldKey === "style" && itemType === "courtyard-area") {
                const defaultHeightsByStyle = {
                  lawn: 0.04,
                  deck: 0.16,
                  paving: 0.06,
                };
                (Math.abs(inspectedItem.height - defaultHeightsByStyle[itemDrawing.style]) <
                  0.001 && (inspectedItem.height = defaultHeightsByStyle[fieldInputValue]),
                  (itemDrawing.patternWidth = fieldInputValue === "deck" ? 0.16 : 0.6));
              }
              ((itemDrawing[fieldKey] = fieldInputValue),
                Object.assign(inspectedItem, normalizeCourtyardDrawing(inspectedItem)));
            }
            validatePlacement(fieldClone) &&
              (host.push(fieldClone), host.changed(), host.refresh());
          }),
      ),
      (fieldsElement.querySelector('[data-action="nodes"]').onclick = () => {
        ((isNodeEditing = !isNodeEditing), renderFields(inspectedItem), host.draw());
      }),
      (fieldsElement.querySelector('[data-action="remove-node"]').onclick = () => {
        const removeNodeOutline = drawingPlanPoints(inspectedItem, host.ppm()),
          removeNodeHoles = itemDrawing.holes.map((removeNodeHoleRing) =>
            drawingPlanPoints(inspectedItem, host.ppm(), removeNodeHoleRing),
          ),
          removeNodeRing =
            selectedRingIndex < 0 ? removeNodeOutline : removeNodeHoles[selectedRingIndex];
        if (!removeNodeRing || removeNodeRing.length <= (itemType === "courtyard-area" ? 3 : 2))
          return;
        const removeClone = host.clone();
        if (
          (removeNodeRing.splice(selectedNodeIndex, 1),
          !applyOutlineToItem(inspectedItem, removeNodeOutline, removeNodeHoles))
        ) {
          host.toast("删除后轮廓无效，已保留原节点。");
          return;
        }
        validatePlacement(removeClone) &&
          (host.push(removeClone), (selectedNodeIndex = -1), host.changed(), host.refresh());
      }),
      fieldsElement.querySelector('[data-action="hole"]')?.addEventListener("click", () => {
        (host.setTool("courtyard-area"),
          (holeTargetId = inspectedItem.id),
          (areaModeSelect.value = "polygon"),
          host.toast("在所选地面内部围出留空范围，点击起点或按 Enter 完成。"));
      }),
      fieldsElement.querySelector('[data-action="trim"]')?.addEventListener("click", () => {
        (host.setTool("courtyard-area"),
          (trimTargetId = inspectedItem.id),
          (areaModeSelect.value = "polygon"),
          (styleSelect.closest("label").hidden = true),
          (toolOptionsElement.querySelector(".area-mode").hidden = true),
          (toolOptionsElement.querySelector('[data-action="finish"]').disabled = true),
          (toolOptionsElement.querySelector("span").textContent =
            "点两点确定裁剪直线（两端延伸），再点击要裁掉的一侧；蓝色区域保留，Esc 取消"),
          host.toast("点两点画裁剪线，再点击要裁掉的一侧。蓝色预览保留区域，Esc 取消。"));
      }));
    const removeHoleButton = fieldsElement.querySelector('[data-action="remove-hole"]');
    removeHoleButton &&
      ((removeHoleButton.disabled = selectedRingIndex < 0),
      (removeHoleButton.onclick = () => {
        selectedRingIndex < 0 ||
          (host.snapshot(),
          itemDrawing.holes.splice(selectedRingIndex, 1),
          (selectedRingIndex = -1),
          (selectedNodeIndex = -1),
          host.changed(),
          host.refresh());
      }));
    for (const fieldSelect of fieldsElement.querySelectorAll("select"))
      enhanceStudioSelect(fieldSelect);
    return (initializeNumberInputs(fieldsElement), true);
  }
  return {
    setTool: setTool,
    refresh: renderFields,
    draw: drawPreview,
    drawItem: drawItem,
    editing: () => isNodeEditing && isCourtyardDrawing(getSelectedItem()),
  };
}
