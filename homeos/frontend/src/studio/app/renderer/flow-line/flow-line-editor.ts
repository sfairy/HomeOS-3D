import {
  normalizeFlowLine as normalizeFlowLine2,
  flowLinePath as flowLinePath2,
  constrainFlowPoint as constrainFlowPoint2,
  fitFlowLinePath as fitFlowLinePath2,
} from "../../shared/flow-line-model";
import { renderFlowLine as renderFlowLine2 } from "../core/registry/flow-line";
import { createSvgElement as createSvgElementFromFactory } from "@app/utils/svg-factory";
let activeEditorInstance: any = null;
/** 路径编辑器选项：由 inspector 的 pathEditorContext 动态拼装后透传。 */
/** 路径下拉增强器的返回句柄（inspector 提供，含 sync/keydown/destroy）。 */
type FlowLinePathEnhancer = {
  sync: () => void;
  keydown: (event: KeyboardEvent) => boolean;
  destroy: () => void;
};
type FlowLinePathEditorOptions = {
  canvas?: HTMLElement;
  host?: HTMLElement;
  container?: HTMLElement;
  states?: Map<string, unknown>;
  lockTargets?: HTMLElement[];
  enhancePathSelect?: (selectElement: Element | null) => FlowLinePathEnhancer | null | undefined;
  onLayoutChange?: () => void;
  onSave?: (options: unknown) => unknown;
  onError?: (error: unknown) => void;
  onClose?: () => void;
};
export function openFlowLinePathEditor(
  flowLineItem: any,
  {
    canvas: canvasElement,
    host: hostElement,
    container: containerElement,
    states: sceneStates,
    lockTargets: lockTargetElements = [],
    enhancePathSelect: enhancePathSelect,
    onLayoutChange: onLayoutChange,
    onSave: onSave,
    onError: onError,
    onClose: onClose,
  }: FlowLinePathEditorOptions = {},
) {
  if (!canvasElement?.isConnected || !hostElement?.isConnected || !containerElement?.isConnected)
    throw new Error("请先在仪表盘编辑画布选择流水线条。");
  activeEditorInstance?.close();
  const flowLineProperties = normalizeFlowLine2(flowLineItem.properties),
    clientWidth = canvasElement.clientWidth,
    clientHeight = canvasElement.clientHeight,
    num = Number(flowLineItem.position?.width) || 600,
    flowHeight = Number(flowLineItem.position?.height) || 300;
  let list: any = [],
    isDrawing = false,
    value: any = null,
    selectedNodeIndex = -1,
    pointerPoint: any = null,
    isShiftPressed = false,
    activeDragState: any = null,
    previewNode: any = null,
    historyEntries: any = [],
    isSaving = false,
    isDestroyed = false;
  const editorRootElement = document.createElement("div");
  ((editorRootElement.className = "flow-line-canvas-editor"),
    editorRootElement.setAttribute("role", "region"),
    editorRootElement.setAttribute("aria-label", "画布路径编辑"),
    (editorRootElement.innerHTML =
      '<div class="flow-line-draw-stage"><div data-preview></div><svg tabindex="0" aria-label="仪表盘路径画布"></svg></div><div class="flow-line-draw-tools"><strong>绘制流水线条</strong><button type="button" data-draw>重新绘制</button><button type="button" data-finish>完成绘制</button><button type="button" data-undo>撤销</button><button type="button" data-insert>插入节点</button><button type="button" data-delete>删除节点</button><label>路径形态 <select data-shape id="flow-line-path-shape" aria-label="路径形态"><option value="straight">折线</option><option value="rounded">圆角</option><option value="curve">曲线</option></select></label><button type="button" data-cancel>取消</button><button type="button" data-save>确认路径</button><p data-hint></p><p data-error role="alert" hidden></p><span data-count></span></div>'));
  const queryEditor = (selector: any) => editorRootElement.querySelector(selector),
    drawingSvgElement = queryEditor("svg"),
    drawStageElement = queryEditor(".flow-line-draw-stage");
  (drawingSvgElement.setAttribute("viewBox", "0 0 " + clientWidth + " " + clientHeight),
    drawingSvgElement.setAttribute("preserveAspectRatio", "none"),
    Object.assign(drawStageElement.style, {
      width: clientWidth + "px",
      height: clientHeight + "px",
    }),
    containerElement.append(editorRootElement),
    containerElement.classList.add("flow-line-path-editing"));
  const propertyValue = containerElement.style.getPropertyValue("--flow-line-toolbar-space");
  function syncToolbarSpace() {
    const toolbarSpaceValue = queryEditor(".flow-line-draw-tools").offsetHeight + 20 + "px";
    containerElement!.style.getPropertyValue("--flow-line-toolbar-space") !== toolbarSpaceValue &&
      (containerElement!.style.setProperty("--flow-line-toolbar-space", toolbarSpaceValue),
      onLayoutChange?.());
  }
  const restoreEditingLayout = () => {
    (containerElement.classList.remove("flow-line-path-editing"),
      propertyValue
        ? containerElement.style.setProperty("--flow-line-toolbar-space", propertyValue)
        : containerElement.style.removeProperty("--flow-line-toolbar-space"),
      onLayoutChange?.());
  };
  syncToolbarSpace();
  function syncStageTransform() {
    const boundingClientRect = canvasElement!.getBoundingClientRect(),
      editorRect = editorRootElement.getBoundingClientRect();
    Object.assign(drawStageElement.style, {
      left: boundingClientRect.left - editorRect.left + "px",
      top: boundingClientRect.top - editorRect.top + "px",
      transform:
        "scale(" +
        boundingClientRect.width / clientWidth +
        "," +
        boundingClientRect.height / clientHeight +
        ")",
    });
    const scaleFactor =
      Math.min(boundingClientRect.width / clientWidth, boundingClientRect.height / clientHeight) ||
      1;
    for (const nodeElement of drawingSvgElement.querySelectorAll(".flow-line-draw-node"))
      (nodeElement.children[0].setAttribute("r", 14 / scaleFactor),
        nodeElement.children[1].setAttribute("r", 5 / scaleFactor));
  }
  syncStageTransform();
  const elementNS = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  (elementNS.setAttribute("viewBox", "0 0 " + num + " " + flowHeight),
    elementNS.setAttribute("preserveAspectRatio", "none"),
    Object.assign(elementNS.style, {
      position: "absolute",
      inset: "0",
      width: "100%",
      height: "100%",
      pointerEvents: "none",
      visibility: "hidden",
    }),
    hostElement.append(elementNS));
  const hidden = hostElement.hidden;
  hostElement.hidden = false;
  let canvasToOverlayTransform: any, overlayToCanvasTransform;
  try {
    ((canvasToOverlayTransform = drawingSvgElement
      .getScreenCTM()
      .inverse()
      .multiply(elementNS.getScreenCTM())),
      (overlayToCanvasTransform = canvasToOverlayTransform.inverse()));
  } catch (error: any) {
    throw (editorRootElement.remove(), restoreEditingLayout(), error);
  } finally {
    (elementNS.remove(), (hostElement.hidden = hidden));
  }
  const transformPoint = (sourcePoint: any, transformMatrix: any) => {
    const matrixTransform = new DOMPoint(...sourcePoint).matrixTransform(transformMatrix);
    return [matrixTransform.x, matrixTransform.y];
  };
  list = flowLineProperties.points.map(([storedPointX, storedPointY]) =>
    transformPoint([storedPointX * num, storedPointY * flowHeight], canvasToOverlayTransform).map(
      (coordinateValue, axisIndex) => coordinateValue / [clientWidth, clientHeight][axisIndex],
    ),
  );
  const stringify = JSON.stringify(list),
    visibility = hostElement.style.visibility,
    activeElement = document.activeElement;
  hostElement.style.visibility = "hidden";
  const map = lockTargetElements.filter(Boolean).map((lockTargetElement) => ({
    element: lockTargetElement,
    inert: lockTargetElement.inert,
  }));
  map.forEach(({ element: inertTargetNode }) => (inertTargetNode.inert = true));
  const createSvgElement = (tagName: any, attributes: any, parentElement = drawingSvgElement) =>
      createSvgElementFromFactory(tagName, attributes, parentElement, document),
    axisGuidePathElement = createSvgElement("path", {
      class: "flow-line-axis-guide",
      fill: "none",
    }),
    drawGhostPathElement = createSvgElement("path", {
      class: "flow-line-draw-ghost",
      fill: "none",
    }),
    nodeGroupElement = createSvgElement("g", {}),
    toNormalizedPoint = (pointerEvent: any) => {
      const matrixTransform2 = new DOMPoint(
        pointerEvent.clientX,
        pointerEvent.clientY,
      ).matrixTransform(drawingSvgElement.getScreenCTM().inverse());
      return [matrixTransform2.x / clientWidth, matrixTransform2.y / clientHeight];
    },
    pushUndoSnapshot = () => {
      (historyEntries.push({
        points: list.map((undoPoint: any) => [...undoPoint]),
        shape: flowLineProperties.shape,
      }),
        historyEntries.length > 100 && historyEntries.shift());
    },
    updateAxisGuide = (guideAnchorPoint: any, guideAxis: any) =>
      axisGuidePathElement.setAttribute(
        "d",
        !guideAnchorPoint || !guideAxis
          ? ""
          : guideAxis === "x"
            ? "M 0 " + guideAnchorPoint[1] * clientHeight + " H " + clientWidth
            : "M " + guideAnchorPoint[0] * clientWidth + " 0 V " + clientHeight,
      ),
    buildFittedPath = () =>
      fitFlowLinePath2(
        flowLineItem,
        list.map(([fitPointX, fitPointY]: any) =>
          transformPoint(
            [fitPointX * clientWidth, fitPointY * clientHeight],
            overlayToCanvasTransform,
          ),
        ),
      );
  function renderEditorPreview() {
    if (
      (previewNode?.destroyFlowLine?.(),
      queryEditor("[data-preview]").replaceChildren(),
      list.length)
    ) {
      const fittedPath = buildFittedPath(),
        translate = canvasToOverlayTransform.translate(...fittedPath.origin);
      ((previewNode = renderFlowLine2(
        {
          ...flowLineItem,
          position: {
            ...flowLineItem.position,
            ...fittedPath.position,
          },
          properties: {
            ...flowLineProperties,
            points: fittedPath.points,
          },
        },
        {
          states: sceneStates,
        },
      )),
        Object.assign(previewNode.style, {
          position: "absolute",
          left: "0",
          top: "0",
          width: fittedPath.position.width + "px",
          height: fittedPath.position.height + "px",
          transformOrigin: "0 0",
          transform:
            "matrix(" +
            translate.a +
            "," +
            translate.b +
            "," +
            translate.c +
            "," +
            translate.d +
            "," +
            translate.e +
            "," +
            translate.f +
            ")",
        }),
        queryEditor("[data-preview]").append(previewNode));
    }
    if (
      ((queryEditor("[data-count]").textContent = list.length + " / 256 个节点"),
      (queryEditor("[data-hint]").textContent = isDrawing
        ? "直接在底图上点击加点，双击 / Enter 完成；Shift 锁轴，Backspace 撤回，Esc 取消重画。"
        : "拖动节点调整，Shift 锁轴，方向键微调；确认路径后可用编辑历史撤销。"),
      (queryEditor("[data-finish]").hidden = !isDrawing),
      (queryEditor("[data-draw]").hidden = isDrawing),
      (queryEditor("[data-finish]").disabled = list.length < 2),
      (queryEditor("[data-delete]").disabled =
        isDrawing || selectedNodeIndex < 0 || list.length <= 2),
      (queryEditor("[data-insert]").disabled =
        isDrawing || selectedNodeIndex < 0 || list.length >= 256),
      (queryEditor("[data-undo]").disabled = isDrawing ? !list.length : !historyEntries.length),
      (queryEditor("[data-save]").disabled = isSaving || isDrawing || list.length < 2),
      drawingSvgElement.classList.toggle("drawing", isDrawing),
      (nodeGroupElement.style.pointerEvents = isDrawing ? "none" : ""),
      [...nodeGroupElement.children].forEach((nodeMarkerElement, nodeMarkerIndex) => {
        (nodeMarkerElement.setAttribute(
          "transform",
          "translate(" +
            list[nodeMarkerIndex][0] * clientWidth +
            " " +
            list[nodeMarkerIndex][1] * clientHeight +
            ")",
        ),
          nodeMarkerElement.classList.toggle("selected", selectedNodeIndex === nodeMarkerIndex));
      }),
      isDrawing && pointerPoint && list.length)
    ) {
      const constrainedPoint = constrainFlowPoint2(
        pointerPoint,
        list.at(-1),
        isShiftPressed,
        null,
        [clientWidth, clientHeight],
      );
      (drawGhostPathElement.setAttribute(
        "d",
        flowLinePath2(
          [...list, constrainedPoint.point],
          flowLineProperties.shape,
          clientWidth,
          clientHeight,
          flowLineProperties.radius,
        ),
      ),
        updateAxisGuide(list.at(-1), constrainedPoint.axis));
    } else (drawGhostPathElement.setAttribute("d", ""), updateAxisGuide(null, null));
  }
  function rebuildNodeHandles() {
    (nodeGroupElement.replaceChildren(),
      list.forEach((_nodePoint: any, nodeIndex: any) => {
        const draggableNodeElement = createSvgElement(
          "g",
          {
            role: "button",
            tabindex: "0",
            "aria-label": "路径节点 " + (nodeIndex + 1),
            class: "flow-line-draw-node",
          },
          nodeGroupElement,
        );
        (createSvgElement(
          "circle",
          {
            r: 14,
            fill: "transparent",
          },
          draggableNodeElement,
        ),
          createSvgElement(
            "circle",
            {
              r: 5,
              class: "flow-line-node-handle",
              "vector-effect": "non-scaling-stroke",
            },
            draggableNodeElement,
          ),
          draggableNodeElement.addEventListener("pointerdown", (pointerDownEvent: any) => {
            isDrawing ||
              pointerDownEvent.button !== 0 ||
              isSaving ||
              (pointerDownEvent.preventDefault(),
              pointerDownEvent.stopPropagation(),
              (selectedNodeIndex = nodeIndex),
              (activeDragState = {
                index: nodeIndex,
                id: pointerDownEvent.pointerId,
                node: draggableNodeElement,
                origin: [...list[nodeIndex]],
                raw: [...list[nodeIndex]],
                axis: null as any,
                remembered: false,
              }),
              draggableNodeElement.setPointerCapture(pointerDownEvent.pointerId),
              draggableNodeElement.focus(),
              renderEditorPreview());
          }),
          draggableNodeElement.addEventListener("pointermove", (pointerMoveEvent: any) => {
            !activeDragState ||
              activeDragState.id !== pointerMoveEvent.pointerId ||
              ((activeDragState.raw = toNormalizedPoint(pointerMoveEvent)),
              (isShiftPressed = pointerMoveEvent.shiftKey),
              updateDragPoint());
          }));
        const finishDrag = (releaseEvent: any) => {
          activeDragState?.id === releaseEvent.pointerId &&
            (activeDragState.remembered &&
              list[activeDragState.index].every(
                (movedPointValue: any, movedAxisIndex: any) =>
                  Math.abs(movedPointValue - activeDragState.origin[movedAxisIndex]) < 1e-9,
              ) &&
              (historyEntries.pop(), renderEditorPreview()),
            (activeDragState = null),
            updateAxisGuide(null, null));
        };
        (draggableNodeElement.addEventListener("pointerup", finishDrag),
          draggableNodeElement.addEventListener("pointercancel", finishDrag),
          draggableNodeElement.addEventListener("lostpointercapture", finishDrag),
          draggableNodeElement.addEventListener("focus", () => {
            ((selectedNodeIndex = nodeIndex), renderEditorPreview());
          }));
      }),
      syncStageTransform(),
      renderEditorPreview());
  }
  function updateDragPoint() {
    const constrainedDragPoint = constrainFlowPoint2(
      activeDragState.raw,
      activeDragState.origin,
      isShiftPressed,
      activeDragState.axis,
      [clientWidth, clientHeight],
    );
    ((activeDragState.axis = constrainedDragPoint.axis),
      constrainedDragPoint.point.some(
        (dragPointValue: any, dragAxisIndex: any) =>
          Math.abs(dragPointValue - list[activeDragState.index][dragAxisIndex]) > 1e-9,
      ) &&
        (activeDragState.remembered || (pushUndoSnapshot(), (activeDragState.remembered = true)),
        (list[activeDragState.index] = constrainedDragPoint.point),
        renderEditorPreview()),
      updateAxisGuide(activeDragState.origin, constrainedDragPoint.axis));
  }
  function finishDrawing() {
    list.length < 2 ||
      ((isDrawing = false),
      (pointerPoint = null),
      (selectedNodeIndex = list.length - 1),
      rebuildNodeHandles(),
      drawingSvgElement.focus());
  }
  function deleteSelectedNode() {
    isDrawing ||
      selectedNodeIndex < 0 ||
      list.length <= 2 ||
      (pushUndoSnapshot(),
      list.splice(selectedNodeIndex, 1),
      (selectedNodeIndex = Math.min(selectedNodeIndex, list.length - 1)),
      rebuildNodeHandles());
  }
  function undoLastStep() {
    if (isDrawing) list.pop();
    else {
      const pop = historyEntries.pop();
      if (!pop) return;
      ((list = pop.points),
        (flowLineProperties.shape = pop.shape),
        (queryEditor("[data-shape]").value = pop.shape),
        pathSelectEnhancer?.sync());
    }
    ((selectedNodeIndex = -1), rebuildNodeHandles(), drawingSvgElement.focus());
  }
  ((queryEditor("[data-draw]").onclick = () => {
    ((value = {
      points: list.map((snapshotPoint: any) => [...snapshotPoint]),
      shape: flowLineProperties.shape,
      undo: historyEntries.slice(),
    }),
      pushUndoSnapshot(),
      (isDrawing = true),
      (list = []),
      (selectedNodeIndex = -1),
      (pointerPoint = null),
      rebuildNodeHandles(),
      drawingSvgElement.focus());
  }),
    (queryEditor("[data-finish]").onclick = finishDrawing),
    (queryEditor("[data-undo]").onclick = undoLastStep),
    (queryEditor("[data-delete]").onclick = deleteSelectedNode),
    (queryEditor("[data-insert]").onclick = () => {
      if (selectedNodeIndex < 0 || list.length >= 256) return;
      pushUndoSnapshot();
      const insertBasePoint = list[selectedNodeIndex],
        insertAnchorPoint = list[selectedNodeIndex + 1] || list[Math.max(0, selectedNodeIndex - 1)],
        insertIndex =
          selectedNodeIndex === list.length - 1 ? selectedNodeIndex : selectedNodeIndex + 1;
      (list.splice(
        insertIndex,
        0,
        insertBasePoint.map(
          (averagePointValue: any, averageAxisIndex: any) =>
            (averagePointValue + insertAnchorPoint[averageAxisIndex]) / 2,
        ),
      ),
        (selectedNodeIndex = insertIndex),
        rebuildNodeHandles());
    }),
    (queryEditor("[data-shape]").value = flowLineProperties.shape),
    (queryEditor("[data-shape]").onchange = (shapeSelectEvent: any) => {
      isSaving ||
        (pushUndoSnapshot(),
        (flowLineProperties.shape = shapeSelectEvent.target.value),
        renderEditorPreview());
    }));
  const pathSelectEnhancer = enhancePathSelect?.(queryEditor("[data-shape]"));
  (drawingSvgElement.addEventListener("pointermove", (svgPointerEvent: any) => {
    !isDrawing ||
      isSaving ||
      ((pointerPoint = toNormalizedPoint(svgPointerEvent)),
      (isShiftPressed = svgPointerEvent.shiftKey),
      renderEditorPreview());
  }),
    drawingSvgElement.addEventListener("pointerleave", () => {
      isDrawing && ((pointerPoint = null), renderEditorPreview());
    }),
    drawingSvgElement.addEventListener("click", (svgClickEvent: any) => {
      if (
        !isDrawing ||
        isSaving ||
        svgClickEvent.button !== 0 ||
        svgClickEvent.detail > 1 ||
        list.length >= 256
      )
        return;
      const point = constrainFlowPoint2(
        toNormalizedPoint(svgClickEvent),
        list.at(-1),
        svgClickEvent.shiftKey,
        null,
        [clientWidth, clientHeight],
      ).point;
      (list.length &&
        Math.hypot(
          (point[0] - list.at(-1)[0]) * clientWidth,
          (point[1] - list.at(-1)[1]) * clientHeight,
        ) < 2) ||
        (list.push(point), (pointerPoint = null), rebuildNodeHandles(), drawingSvgElement.focus());
    }),
    drawingSvgElement.addEventListener("dblclick", (svgDoubleClickEvent: any) => {
      isDrawing && (svgDoubleClickEvent.preventDefault(), finishDrawing());
    }));
  function handleDocumentKeyDown(keyEvent: any) {
    if ((keyEvent.stopImmediatePropagation(), isSaving)) {
      keyEvent.preventDefault();
      return;
    }
    if (pathSelectEnhancer?.keydown(keyEvent)) return;
    if (keyEvent.key === "Escape") {
      (keyEvent.preventDefault(),
        isDrawing
          ? ((list = value.points),
            (flowLineProperties.shape = value.shape),
            (historyEntries = value.undo),
            (queryEditor("[data-shape]").value = flowLineProperties.shape),
            pathSelectEnhancer?.sync(),
            (isDrawing = false),
            (selectedNodeIndex = -1),
            (pointerPoint = null),
            rebuildNodeHandles())
          : destroyEditor());
      return;
    }
    if (
      (keyEvent.key === "Shift" &&
        ((isShiftPressed = true),
        activeDragState ? updateDragPoint() : isDrawing && renderEditorPreview()),
      keyEvent.target.closest("input,select,textarea"))
    )
      return;
    if ((keyEvent.metaKey || keyEvent.ctrlKey) && keyEvent.key.toLowerCase() === "z") {
      (keyEvent.preventDefault(), undoLastStep());
      return;
    }
    (keyEvent.key === "Enter" &&
      keyEvent.target === drawingSvgElement &&
      isDrawing &&
      (keyEvent.preventDefault(), finishDrawing()),
      ["Delete", "Backspace"].includes(keyEvent.key) &&
        keyEvent.target.closest("svg") &&
        (keyEvent.preventDefault(),
        isDrawing ? (list.pop(), rebuildNodeHandles()) : deleteSelectedNode()));
    const arrowKeyDelta = ({
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    } as any)[keyEvent.key];
    if (arrowKeyDelta && !isDrawing && selectedNodeIndex >= 0 && keyEvent.target.closest("svg")) {
      keyEvent.preventDefault();
      const moveStepPx = keyEvent.shiftKey ? 10 : 1,
        point2 = constrainFlowPoint2(
          [
            list[selectedNodeIndex][0] + (arrowKeyDelta[0] * moveStepPx) / clientWidth,
            list[selectedNodeIndex][1] + (arrowKeyDelta[1] * moveStepPx) / clientHeight,
          ],
          null,
          false,
        ).point;
      point2.some(
        (nudgedValue: any, nudgedAxisIndex: any) => nudgedValue !== list[selectedNodeIndex][nudgedAxisIndex],
      ) && (pushUndoSnapshot(), (list[selectedNodeIndex] = point2), renderEditorPreview());
    }
  }
  function handleDocumentKeyUp(keyUpEvent: any) {
    (keyUpEvent.stopImmediatePropagation(),
      keyUpEvent.key === "Shift" &&
        ((isShiftPressed = false), activeDragState ? updateDragPoint() : renderEditorPreview()));
  }
  const resetInteraction = () => {
      ((isShiftPressed = false), (activeDragState = null), updateAxisGuide(null, null));
    },
    resizeObserver = new ResizeObserver(() => {
      (syncToolbarSpace(), syncStageTransform());
    });
  (resizeObserver.observe(canvasElement),
    resizeObserver.observe(containerElement),
    resizeObserver.observe(queryEditor(".flow-line-draw-tools")));
  const mutationObserver = new MutationObserver(syncStageTransform);
  mutationObserver.observe(canvasElement, {
    attributes: true,
    attributeFilter: ["style"],
  });
  const mutationObserver2 = new MutationObserver(() => {
    !isSaving &&
      (!canvasElement.isConnected || !hostElement.isConnected || !editorRootElement.isConnected) &&
      destroyEditor();
  });
  (mutationObserver2.observe(containerElement, {
    childList: true,
    subtree: true,
  }),
    document.addEventListener("keydown", handleDocumentKeyDown, true),
    document.addEventListener("keyup", handleDocumentKeyUp, true),
    window.addEventListener("blur", resetInteraction),
    window.addEventListener("resize", syncStageTransform));
  function destroyEditor() {
    isSaving ||
      isDestroyed ||
      ((isDestroyed = true),
      pathSelectEnhancer?.destroy(),
      previewNode?.destroyFlowLine?.(),
      resizeObserver.disconnect(),
      mutationObserver.disconnect(),
      mutationObserver2.disconnect(),
      document.removeEventListener("keydown", handleDocumentKeyDown, true),
      document.removeEventListener("keyup", handleDocumentKeyUp, true),
      window.removeEventListener("blur", resetInteraction),
      window.removeEventListener("resize", syncStageTransform),
      (hostElement!.style.visibility = visibility),
      map.forEach(
        ({ element: restoredNodeElement, inert: savedInert }) =>
          (restoredNodeElement.inert = savedInert),
      ),
      editorRootElement.remove(),
      restoreEditingLayout(),
      (activeEditorInstance = null),
      activeElement?.isConnected &&
        (activeElement as HTMLElement).focus({
          preventScroll: true,
        }),
      onClose?.());
  }
  return (
    (queryEditor("[data-cancel]").onclick = destroyEditor),
    (queryEditor("[data-save]").onclick = async () => {
      if (isSaving || isDrawing || list.length < 2) return;
      if (
        list.every(
          (savedPoint: any) =>
            Math.hypot(savedPoint[0] - list[0][0], savedPoint[1] - list[0][1]) < 0.00001,
        )
      ) {
        ((queryEditor("[data-error]").hidden = false),
          (queryEditor("[data-error]").textContent = "请至少绘制两个不同位置的节点。"));
        return;
      }
      const options =
        JSON.stringify(list) === stringify
          ? {
              properties: {
                points: flowLineProperties.points,
                shape: flowLineProperties.shape,
              },
            }
          : (() => {
              const fittedSaveOptions = buildFittedPath();
              return {
                position: fittedSaveOptions.position,
                properties: {
                  points: fittedSaveOptions.points,
                  shape: flowLineProperties.shape,
                },
              };
            })();
      ((isSaving = true),
        renderEditorPreview(),
        (queryEditor(".flow-line-draw-tools").inert = true));
      try {
        (await onSave?.(options), (isSaving = false), destroyEditor());
      } catch (saveError: any) {
        ((isSaving = false),
          (queryEditor(".flow-line-draw-tools").inert = false),
          (queryEditor("[data-error]").hidden = false),
          (queryEditor("[data-error]").textContent = saveError.message || "保存失败，请重试。"),
          onError?.(saveError),
          renderEditorPreview());
      }
    }),
    (activeEditorInstance = {
      close: destroyEditor,
    }),
    rebuildNodeHandles(),
    drawingSvgElement.focus(),
    activeEditorInstance
  );
}
