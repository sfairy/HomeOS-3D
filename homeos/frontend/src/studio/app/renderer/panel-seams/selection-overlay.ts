import { airflowLayerGeometry as airflowLayerGeometry2 } from "../geometry/transform-geometry";
import { doorWindowPerspectiveCorners as doorWindowPerspectiveCorners2, doorWindowPerspectiveMatrix as doorWindowPerspectiveMatrix2 } from "../registry";
import { syncInteraction3dUiScale as syncInteraction3dUiScale2 } from "../../bridge/bridge";
import type { PanelRenderer } from "../panel-renderer";

export function createComponentSelectionOverlay(self: PanelRenderer, overlayHostElement: any, overlayComponentRecord: any) {
    if (
      !overlayHostElement ||
      !overlayComponentRecord ||
      !overlayHostElement.parentElement ||
      (overlayHostElement.parentElement !== self.canvas && !overlayHostElement.hidden)
    )
      return null;
    const parentElement2 = overlayHostElement.parentElement,
      componentOverlayElement = document.createElement("div");
    return (
      (componentOverlayElement.className = "hb-component-selection-overlay"),
      overlayComponentRecord.type === "light-statistics" &&
        componentOverlayElement.classList.add("hb-light-statistics-selection-overlay"),
      overlayComponentRecord.type === "floorplan-auto-diagram" &&
        overlayComponentRecord.properties?.interactionMode === "view" &&
        componentOverlayElement.classList.add("hb-floorplan-auto-diagram-view-overlay"),
      (componentOverlayElement.dataset.selectionFor = overlayComponentRecord.id),
      Object.assign(componentOverlayElement.style, {
        left: overlayHostElement.style.left,
        top: overlayHostElement.style.top,
        width: overlayHostElement.style.width,
        height: overlayHostElement.style.height,
        transform: overlayHostElement.style.transform,
      }),
      overlayComponentRecord.type !== "light-statistics" &&
        componentOverlayElement.addEventListener("pointerdown", (overlayPointerEvent) =>
          self.startComponentMove(
            overlayPointerEvent,
            overlayComponentRecord,
            overlayHostElement,
            componentOverlayElement,
          ),
        ),
      parentElement2.append(componentOverlayElement),
      self.componentSelectionOverlays.set(overlayComponentRecord.id, componentOverlayElement),
      componentOverlayElement
    );
  }
export function createAirflowSelectionOverlay(self: PanelRenderer, airflowLayerHostElement: any, airflowComponentRecord: any) {
    if (
      !airflowLayerHostElement ||
      !airflowComponentRecord ||
      !airflowLayerHostElement.parentElement
    )
      return null;
    const airflowSelectionOverlayElement = document.createElement("div");
    return (
      (airflowSelectionOverlayElement.className =
        "hb-component-selection-overlay hb-airflow-selection-overlay"),
      (airflowSelectionOverlayElement.dataset.selectionFor = airflowComponentRecord.id),
      Object.assign(airflowSelectionOverlayElement.style, {
        left: airflowLayerHostElement.style.left,
        top: airflowLayerHostElement.style.top,
        width: airflowLayerHostElement.style.width,
        height: airflowLayerHostElement.style.height,
        transform: airflowLayerHostElement.style.transform,
      }),
      airflowLayerHostElement.parentElement.append(airflowSelectionOverlayElement),
      self.componentSelectionOverlays.set(
        airflowComponentRecord.id,
        airflowSelectionOverlayElement,
      ),
      airflowSelectionOverlayElement
    );
  }
export function syncAirflowLayerGeometry(self: PanelRenderer, airflowLayerTargetElement: any,
    geometryComponentRecord: any,
    geometryOverlayElement: any = null,) {
    if (!airflowLayerTargetElement || !geometryComponentRecord) return;
    const airflowGroupRect = airflowLayerGeometry2(geometryComponentRecord, {
        grouped: airflowLayerTargetElement.parentElement !== self.canvas,
      }),
      airflowStyleRecord = {
        left: airflowGroupRect.left + "px",
        top: airflowGroupRect.top + "px",
        width: airflowGroupRect.width + "px",
        height: airflowGroupRect.height + "px",
        transform:
          "rotate(" + airflowGroupRect.rotation + "deg) scale(" + airflowGroupRect.scale + ")",
      };
    (Object.assign(airflowLayerTargetElement.style, airflowStyleRecord),
      geometryOverlayElement && Object.assign(geometryOverlayElement.style, airflowStyleRecord));
  }
export function appendEffectSelectionBounds(self: PanelRenderer, effectBoundsHostElement: any, effectBoundsComponent: any) {
    if (
      !effectBoundsHostElement ||
      !effectBoundsComponent ||
      !effectBoundsHostElement.parentElement
    )
      return;
    const effectSelectionOverlayElement = document.createElement("div");
    ((effectSelectionOverlayElement.className =
      "hb-component-selection-overlay hb-effect-selection-overlay"),
      (effectSelectionOverlayElement.dataset.selectionFor = effectBoundsComponent.id),
      Object.assign(effectSelectionOverlayElement.style, {
        left: effectBoundsHostElement.style.left,
        top: effectBoundsHostElement.style.top,
        width: effectBoundsHostElement.style.width,
        height: effectBoundsHostElement.style.height,
        transform: effectBoundsHostElement.style.transform,
        pointerEvents: "none",
      }));
    const effectBoundsElement = document.createElement("div");
    effectBoundsElement.className = "hb-selection-bounds hb-effect-selection-bounds";
    for (const cornerPositionName of ["top-left", "top-right", "bottom-left", "bottom-right"]) {
      const effectCornerMarkerElement = document.createElement("i");
      ((effectCornerMarkerElement.className = "hb-corner-marker hb-corner-" + cornerPositionName),
        effectCornerMarkerElement.setAttribute("aria-hidden", "true"),
        effectBoundsElement.append(effectCornerMarkerElement));
    }
    (effectSelectionOverlayElement.append(effectBoundsElement),
      effectBoundsHostElement.parentElement.append(effectSelectionOverlayElement),
      self.componentSelectionOverlays.set(effectBoundsComponent.id, effectSelectionOverlayElement),
      self.updateTransformHandleScale(
        effectBoundsHostElement,
        effectBoundsComponent,
        effectBoundsElement,
      ));
  }
export function syncComponentSelectionOverlay(self: PanelRenderer, overlayComponentId: any) {
    const syncedOverlayElement = self.componentSelectionOverlays.get(overlayComponentId),
      syncedHostElement = self.componentHosts.get(overlayComponentId);
    !syncedOverlayElement ||
      !syncedHostElement ||
      syncedOverlayElement.classList.contains("hb-airflow-selection-overlay") ||
      syncedOverlayElement.classList.contains("hb-effect-selection-overlay") ||
      Object.assign(syncedOverlayElement.style, {
        left: syncedHostElement.style.left,
        top: syncedHostElement.style.top,
        width: syncedHostElement.style.width,
        height: syncedHostElement.style.height,
        transform: syncedHostElement.style.transform,
      });
  }
export function appendTransformHandles(self: PanelRenderer, handleHostElement: any,
    handleComponentRecord: any,
    shouldAddResizeHandle = true,
    handleTargetElement = handleHostElement,) {
    if (!handleHostElement || !handleComponentRecord) return;
    const transformSelectionBoundsElement = document.createElement("div");
    transformSelectionBoundsElement.className = "hb-selection-bounds";
    for (const boundsCornerName of ["top-left", "top-right", "bottom-left", "bottom-right"]) {
      const boundsCornerMarkerElement = document.createElement("i");
      ((boundsCornerMarkerElement.className = "hb-corner-marker hb-corner-" + boundsCornerName),
        boundsCornerMarkerElement.setAttribute("aria-hidden", "true"),
        transformSelectionBoundsElement.append(boundsCornerMarkerElement));
    }
    if (shouldAddResizeHandle && handleComponentRecord.properties?.layoutMode !== "fill") {
      const resizeHandleElement = document.createElement("button");
      ((resizeHandleElement.type = "button"),
        (resizeHandleElement.className = "hb-transform-handle hb-resize-handle"),
        (resizeHandleElement.title = "拖动缩放"),
        resizeHandleElement.addEventListener("pointerdown", (resizeHandleEvent) =>
          self.startComponentScale(
            resizeHandleEvent,
            handleComponentRecord,
            handleHostElement,
            transformSelectionBoundsElement,
          ),
        ));
      const rotateHandleElement = document.createElement("button");
      ((rotateHandleElement.type = "button"),
        (rotateHandleElement.className = "hb-transform-handle hb-rotate-handle"),
        (rotateHandleElement.title = "拖动旋转"),
        rotateHandleElement.addEventListener("pointerdown", (rotateHandleEvent) =>
          self.startComponentRotate(
            rotateHandleEvent,
            handleComponentRecord,
            handleHostElement,
            transformSelectionBoundsElement,
          ),
        ),
        transformSelectionBoundsElement.append(resizeHandleElement, rotateHandleElement));
    }
    (handleTargetElement.append(transformSelectionBoundsElement),
      handleComponentRecord.type === "light-statistics" &&
        handleTargetElement.classList?.contains("hb-light-statistics-selection-overlay") &&
        transformSelectionBoundsElement.addEventListener("pointerdown", (boundsPointerEvent) =>
          self.startComponentMove(
            boundsPointerEvent,
            handleComponentRecord,
            handleHostElement,
            transformSelectionBoundsElement,
          ),
        ),
      self.updateImageSelectionBounds(
        handleHostElement,
        handleComponentRecord,
        transformSelectionBoundsElement,
      ),
      self.updateTextSelectionBounds(
        handleHostElement,
        handleComponentRecord,
        transformSelectionBoundsElement,
      ),
      self.updateTitleButtonSelectionBounds(
        handleHostElement,
        handleComponentRecord,
        transformSelectionBoundsElement,
      ),
      self.updateDeviceButtonSelectionBounds(
        handleHostElement,
        handleComponentRecord,
        transformSelectionBoundsElement,
      ));
    const lightStatisticsSelectionBounds2 = self.updateLightStatisticsSelectionBounds(
      handleHostElement,
      handleComponentRecord,
      transformSelectionBoundsElement,
    );
    (handleComponentRecord.type === "light-statistics" &&
      !lightStatisticsSelectionBounds2 &&
      Object.assign(transformSelectionBoundsElement.style, {
        left: "0",
        top: "0",
        width: "100%",
        height: "100%",
      }),
      self.updateAirConditionerButtonSelectionBounds(
        handleHostElement,
        handleComponentRecord,
        transformSelectionBoundsElement,
      ),
      self.updateTransformHandleScale(
        handleHostElement,
        handleComponentRecord,
        transformSelectionBoundsElement,
      ));
  }
export function withSelectionMeasurementHost(self: PanelRenderer, measurementRootElement: any, measurementTask: any) {
    const hiddenElements: any[] = [];
    let walkedElement = measurementRootElement;
    for (; walkedElement && walkedElement !== self.canvas;)
      (walkedElement.hidden && (hiddenElements.push(walkedElement), (walkedElement.hidden = false)),
        (walkedElement = walkedElement.parentElement));
    try {
      return measurementTask();
    } finally {
      for (const hiddenElement of hiddenElements) hiddenElement.hidden = true;
    }
  }
export function selectionElementIsVisible(self: PanelRenderer, measuredElement: any) {
    if (!measuredElement || measuredElement.hidden) return false;
    const computedStyle = window.getComputedStyle?.(measuredElement);
    return computedStyle?.display === "none" || computedStyle?.visibility === "hidden"
      ? false
      : Number(
          measuredElement.offsetWidth || measuredElement.getBoundingClientRect?.().width || 0,
        ) > 0 &&
          Number(
            measuredElement.offsetHeight || measuredElement.getBoundingClientRect?.().height || 0,
          ) > 0;
  }
export function selectionElementBox(self: PanelRenderer, boxElement: any, boxStopElement: any) {
    let boxOffsetX = 0,
      boxOffsetY = 0,
      walkedBoxElement = boxElement;
    const visitedElementSet = new Set();
    for (
      ;
      walkedBoxElement &&
      walkedBoxElement !== boxStopElement &&
      !visitedElementSet.has(walkedBoxElement);
    )
      (visitedElementSet.add(walkedBoxElement),
        (boxOffsetX += Number(walkedBoxElement.offsetLeft || 0)),
        (boxOffsetY += Number(walkedBoxElement.offsetTop || 0)),
        (walkedBoxElement = walkedBoxElement.offsetParent || walkedBoxElement.parentElement));
    const elementRect = boxElement.getBoundingClientRect?.(),
      elementWidth = Number(boxElement.offsetWidth || elementRect?.width || 0),
      elementHeight = Number(boxElement.offsetHeight || elementRect?.height || 0);
    return {
      left: boxOffsetX,
      top: boxOffsetY,
      width: elementWidth,
      height: elementHeight,
    };
  }
export function applyDoorWindowPerspective(self: PanelRenderer, doorWindowHostElement: any,
    doorWindowComponentRecord: any,
    perspectiveCornersArray: any,) {
    const doorWindowVisualElement = doorWindowHostElement?.querySelector(".hb-door-window-visual");
    if (!doorWindowVisualElement || !doorWindowComponentRecord) return;
    const doorWindowComponentScale = Math.max(
        0.01,
        Number(self.document?.canvas?.componentScale || 1),
      ),
      doorWindowWidthScale = Math.max(
        1,
        Number(doorWindowComponentRecord.position?.width || 100) / doorWindowComponentScale,
      ),
      doorWindowHeightScale = Math.max(
        1,
        Number(doorWindowComponentRecord.position?.height || 100) / doorWindowComponentScale,
      );
    doorWindowVisualElement.style.transform = doorWindowPerspectiveMatrix2(
      doorWindowWidthScale,
      doorWindowHeightScale,
      perspectiveCornersArray,
    );
  }
export function updateDoorWindowPerspectiveHandles(self: PanelRenderer, perspectiveBoundsElement: any, perspectiveCornerValues: any) {
    if (!perspectiveBoundsElement) return;
    const cornerCoordinates = doorWindowPerspectiveCorners2(perspectiveCornerValues);
    (perspectiveBoundsElement
      .querySelector(".hb-door-window-perspective-guide polygon")
      ?.setAttribute(
        "points",
        [0, 1, 2, 3]
          .map(
            (cornerIndex) =>
              cornerCoordinates[cornerIndex * 2] + "," + cornerCoordinates[cornerIndex * 2 + 1],
          )
          .join(" "),
      ),
      perspectiveBoundsElement
        .querySelectorAll(".hb-door-window-perspective-handle")
        .forEach((perspectiveHandleElement: any) => {
          const handleCornerIndex = Number(
            perspectiveHandleElement.dataset.perspectiveCornerIndex || 0,
          );
          ((perspectiveHandleElement.style.left =
            cornerCoordinates[handleCornerIndex * 2] * 100 + "%"),
            (perspectiveHandleElement.style.top =
              cornerCoordinates[handleCornerIndex * 2 + 1] * 100 + "%"));
        }));
  }
export function appendDoorWindowPerspectiveHandles(self: PanelRenderer, doorWindowHandleHost: any,
    doorWindowHandleComponent: any,
    doorWindowHandleTargetElement = doorWindowHandleHost,) {
    if (
      !doorWindowHandleHost ||
      !doorWindowHandleComponent ||
      doorWindowHandleComponent.properties?.sensorKind !== "door-window"
    )
      return;
    const doorWindowCorners = doorWindowPerspectiveCorners2(
        doorWindowHandleComponent.properties?.perspectiveCorners,
      ),
      doorWindowPerspectiveBoundsElement = document.createElement("div");
    doorWindowPerspectiveBoundsElement.className =
      "hb-selection-bounds hb-door-window-perspective-bounds";
    const elementNS = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    (elementNS.classList.add("hb-door-window-perspective-guide"),
      elementNS.setAttribute("viewBox", "0 0 1 1"),
      elementNS.setAttribute("preserveAspectRatio", "none"),
      elementNS.append(document.createElementNS("http://www.w3.org/2000/svg", "polygon")),
      doorWindowPerspectiveBoundsElement.append(elementNS));
    const cornerLabels = ["左上角", "右上角", "右下角", "左下角"];
    for (let cornerOffsetIndex = 0; cornerOffsetIndex < 4; cornerOffsetIndex += 1) {
      const perspectiveCornerHandleElement = document.createElement("button");
      ((perspectiveCornerHandleElement.type = "button"),
        (perspectiveCornerHandleElement.className = "hb-door-window-perspective-handle"),
        (perspectiveCornerHandleElement.dataset.perspectiveCornerIndex = String(cornerOffsetIndex)),
        (perspectiveCornerHandleElement.title =
          "拖动" + cornerLabels[cornerOffsetIndex] + "调整透视"),
        perspectiveCornerHandleElement.setAttribute(
          "aria-label",
          perspectiveCornerHandleElement.title,
        ),
        perspectiveCornerHandleElement.addEventListener("pointerdown", (cornerHandleEvent) =>
          self.startDoorWindowPerspective(
            cornerHandleEvent,
            doorWindowHandleComponent,
            doorWindowHandleHost,
            doorWindowPerspectiveBoundsElement,
            cornerOffsetIndex,
          ),
        ),
        doorWindowPerspectiveBoundsElement.append(perspectiveCornerHandleElement));
    }
    (doorWindowHandleTargetElement.append(doorWindowPerspectiveBoundsElement),
      self.updateDoorWindowPerspectiveHandles(
        doorWindowPerspectiveBoundsElement,
        doorWindowCorners,
      ),
      self.updateTransformHandleScale(
        doorWindowHandleHost,
        doorWindowHandleComponent,
        doorWindowPerspectiveBoundsElement,
      ));
  }
export function updateAirflowHandleScale(self: PanelRenderer, airflowScaleComponent: any, airflowScaleLayerElement: any) {
    if (!airflowScaleComponent || !airflowScaleLayerElement) return;
    const airflowAppliedMinScale = Math.min(self.appliedScaleX || 1, self.appliedScaleY || 1),
      airflowScaleValue = Math.max(
        0.01,
        Math.min(5, Number(airflowScaleComponent.properties?.airflowScale || 1)),
      ),
      scale3 = self.componentParentTransform(airflowScaleComponent.id).scale,
      airflowUiScale = 1 / Math.max(0.001, airflowAppliedMinScale * airflowScaleValue * scale3);
    (airflowScaleLayerElement.style.setProperty("--hb-ui-scale", String(airflowUiScale)),
      airflowScaleLayerElement.style.setProperty("--hb-handle-outset", 30 * airflowUiScale + "px"));
    const airflowHandleRect = airflowScaleLayerElement.getBoundingClientRect();
    airflowScaleLayerElement.classList.toggle(
      "handles-outside",
      airflowHandleRect.width < 132 || airflowHandleRect.height < 112,
    );
  }
export function updateTransformHandleScale(self: PanelRenderer, transformHandleHostElement: any,
    transformHandleComponent: any,
    transformHandleBoundsElement: any = null,) {
    if (!transformHandleHostElement || !transformHandleComponent) return;
    const handleAppliedMinScale = Math.min(self.appliedScaleX || 1, self.appliedScaleY || 1),
      handleComponentScale = Math.max(
        0.01,
        Math.min(5, Number(transformHandleComponent.style?.scale || 1)),
      ),
      scale4 = self.componentParentTransform(transformHandleComponent.id).scale,
      handleUiScale = 1 / Math.max(0.001, handleAppliedMinScale * handleComponentScale * scale4),
      transformBoundsElement =
        transformHandleBoundsElement ||
        self.componentSelectionOverlays
          .get(transformHandleComponent.id)
          ?.querySelector(":scope > .hb-selection-bounds") ||
        transformHandleHostElement.querySelector(":scope > .hb-selection-bounds");


    syncInteraction3dUiScale2(transformHandleHostElement);
    if (!transformBoundsElement) return;
    (transformBoundsElement.style.setProperty("--hb-ui-scale", String(handleUiScale)),
      transformBoundsElement.style.setProperty("--hb-handle-outset", 30 * handleUiScale + "px"));
    const transformBoundsRect = transformBoundsElement.getBoundingClientRect();
    transformBoundsElement.classList.toggle(
      "handles-outside",
      transformBoundsRect.width < 132 || transformBoundsRect.height < 112,
    );
  }