import type { PanelRenderer } from "./renderer";

export interface PanelRendererGeometry {
  componentParentTransform(transformChainComponentId: any): any;
  componentTransformChain(chainStartComponentId: any): any;
  componentWorldTransform(worldTransformComponentId: any): any;
  worldPointToComponentLocal(localPointComponentId: any, worldPointX: any, worldPointY: any): any;
  componentLocalPointToWorld(worldPointComponentKey: any, localPointX: any, localPointY: any): any;
  componentVisualBounds(boundsComponentRecord: any, boundsHostElement?: any): any;
  scaleRecordsBounds(componentSelectionEntries: any): any;
  refreshMultiSelectionBounds(): any;
  updateMultiSelectionHandleScale(multiSelectionHandleElement: any): any;
  appendMultiSelectionBounds(): any;
}

export function componentParentTransform(this: PanelRenderer, transformChainComponentId: any) {
    let ancestorComponentId = this.componentParentIds?.get(transformChainComponentId) || null,
      accumulatedRotation = 0,
      accumulatedScale = 1;
    const set = new Set();
    for (; ancestorComponentId && !set.has(ancestorComponentId);) {
      set.add(ancestorComponentId);
      const ancestorComponentRecord = this.componentRecords.get(ancestorComponentId);
      if (!ancestorComponentRecord) break;
      ((accumulatedRotation += Number(ancestorComponentRecord.position?.rotation || 0)),
        (accumulatedScale *= Math.max(
          0.01,
          Math.min(5, Number(ancestorComponentRecord.style?.scale || 1)),
        )),
        (ancestorComponentId = this.componentParentIds?.get(ancestorComponentId) || null));
    }
    return {
      rotation: accumulatedRotation,
      scale: accumulatedScale,
    };
}

export function componentTransformChain(this: PanelRenderer, chainStartComponentId: any) {
    const transformChainRecords: any[] = [];
    let chainComponentId = chainStartComponentId;
    const visitedChainComponentIdSet = new Set();
    for (; chainComponentId && !visitedChainComponentIdSet.has(chainComponentId);) {
      visitedChainComponentIdSet.add(chainComponentId);
      const chainComponentRecord = this.componentRecords.get(chainComponentId);
      if (!chainComponentRecord) break;
      (transformChainRecords.push(chainComponentRecord),
        (chainComponentId = this.componentParentIds?.get(chainComponentId) || null));
    }
    return transformChainRecords;
}

export function componentWorldTransform(this: PanelRenderer, worldTransformComponentId: any) {
    return this.componentTransformChain(worldTransformComponentId).reduce(
      (accumulatedTransform: any, chainEntryRecord: any) => ({
        rotation: accumulatedTransform.rotation + Number(chainEntryRecord.position?.rotation || 0),
        scale:
          accumulatedTransform.scale *
          Math.max(0.01, Math.min(5, Number(chainEntryRecord.style?.scale || 1))),
      }),
      {
        rotation: 0,
        scale: 1,
      },
    );
}

export function worldPointToComponentLocal(this: PanelRenderer, localPointComponentId: any, worldPointX: any, worldPointY: any) {
    let localPoint = {
      x: Number(worldPointX || 0),
      y: Number(worldPointY || 0),
    };
    const reverse = this.componentTransformChain(localPointComponentId).reverse();
    for (const reverseChainEntry of reverse) {
      const entryPosition = reverseChainEntry.position || {},
        entryWidth = Number(entryPosition.width || 100),
        entryHeight = Number(entryPosition.height || 100),
        entryScale = Math.max(0.01, Math.min(5, Number(reverseChainEntry.style?.scale || 1))),
        entryRotationRad = (Number(entryPosition.rotation || 0) * Math.PI) / 180,
        cos = Math.cos(entryRotationRad),
        sin = Math.sin(entryRotationRad),
        entryCenterX = Number(entryPosition.x || 0) + entryWidth / 2,
        entryCenterY = Number(entryPosition.y || 0) + entryHeight / 2,
        offsetAlongX = (localPoint.x - entryCenterX) / entryScale,
        offsetAlongY = (localPoint.y - entryCenterY) / entryScale;
      localPoint = {
        x: entryWidth / 2 + offsetAlongX * cos + offsetAlongY * sin,
        y: entryHeight / 2 - offsetAlongX * sin + offsetAlongY * cos,
      };
    }
    return localPoint;
}

export function componentLocalPointToWorld(this: PanelRenderer, worldPointComponentKey: any, localPointX: any, localPointY: any) {
    let worldPoint = {
      x: Number(localPointX || 0),
      y: Number(localPointY || 0),
    };
    for (const forwardChainEntry of this.componentTransformChain(worldPointComponentKey)) {
      const forwardEntryPosition = forwardChainEntry.position || {},
        forwardEntryWidth = Number(forwardEntryPosition.width || 100),
        forwardEntryHeight = Number(forwardEntryPosition.height || 100),
        forwardEntryScale = Math.max(
          0.01,
          Math.min(5, Number(forwardChainEntry.style?.scale || 1)),
        ),
        forwardEntryRotationRad = (Number(forwardEntryPosition.rotation || 0) * Math.PI) / 180,
        forwardOffsetX = (worldPoint.x - forwardEntryWidth / 2) * forwardEntryScale,
        forwardOffsetY = (worldPoint.y - forwardEntryHeight / 2) * forwardEntryScale;
      worldPoint = {
        x:
          Number(forwardEntryPosition.x || 0) +
          forwardEntryWidth / 2 +
          forwardOffsetX * Math.cos(forwardEntryRotationRad) -
          forwardOffsetY * Math.sin(forwardEntryRotationRad),
        y:
          Number(forwardEntryPosition.y || 0) +
          forwardEntryHeight / 2 +
          forwardOffsetX * Math.sin(forwardEntryRotationRad) +
          forwardOffsetY * Math.cos(forwardEntryRotationRad),
      };
    }
    return worldPoint;
}

export function componentVisualBounds(this: PanelRenderer, boundsComponentRecord: any, boundsHostElement: any = null) {
    const boundsPosition = boundsComponentRecord.position || {},
      boundsWidth = Math.max(0.01, Number(boundsPosition.width || 100)),
      boundsHeight = Math.max(0.01, Number(boundsPosition.height || 100));
    let layerWidth = boundsWidth,
      layerHeight = boundsHeight,
      layerOffsetX = 0,
      layerOffsetY = 0;
    if (boundsComponentRecord.type === "light-statistics" && boundsHostElement) {
      const selectionBoundsElement = boundsHostElement.querySelector(
          ":scope > .hb-selection-bounds",
        ),
        boundsInsetValues = selectionBoundsElement
          ? [
              Number.parseFloat(selectionBoundsElement.style.left),
              Number.parseFloat(selectionBoundsElement.style.top),
              Number.parseFloat(selectionBoundsElement.style.width),
              Number.parseFloat(selectionBoundsElement.style.height),
            ]
          : [];
      boundsInsetValues.every(Number.isFinite) &&
        boundsInsetValues[2] > 0 &&
        boundsInsetValues[3] > 0 &&
        ([layerOffsetX, layerOffsetY, layerWidth, layerHeight] = boundsInsetValues);
    }
    const boundsScale = Math.max(
        0.01,
        Math.min(5, Number(boundsComponentRecord.style?.scale || 1)),
      ),
      boundsRotationRad = (Number(boundsPosition.rotation || 0) * Math.PI) / 180,
      scaledWidth = layerWidth * boundsScale,
      scaledHeight = layerHeight * boundsScale,
      rotatedHalfWidth =
        (Math.abs(Math.cos(boundsRotationRad)) * scaledWidth +
          Math.abs(Math.sin(boundsRotationRad)) * scaledHeight) /
        2,
      rotatedHalfHeight =
        (Math.abs(Math.sin(boundsRotationRad)) * scaledWidth +
          Math.abs(Math.cos(boundsRotationRad)) * scaledHeight) /
        2,
      boundsCenterX = Number(boundsPosition.x || 0) + boundsWidth / 2,
      boundsCenterY = Number(boundsPosition.y || 0) + boundsHeight / 2,
      layerCenterX = Number(boundsPosition.x || 0) + layerOffsetX + layerWidth / 2,
      layerCenterY = Number(boundsPosition.y || 0) + layerOffsetY + layerHeight / 2,
      centerDeltaX = (layerCenterX - boundsCenterX) * boundsScale,
      centerDeltaY = (layerCenterY - boundsCenterY) * boundsScale,
      rotatedCenterX =
        boundsCenterX +
        centerDeltaX * Math.cos(boundsRotationRad) -
        centerDeltaY * Math.sin(boundsRotationRad),
      rotatedCenterY =
        boundsCenterY +
        centerDeltaX * Math.sin(boundsRotationRad) +
        centerDeltaY * Math.cos(boundsRotationRad);
    return {
      left: rotatedCenterX - rotatedHalfWidth,
      top: rotatedCenterY - rotatedHalfHeight,
      right: rotatedCenterX + rotatedHalfWidth,
      bottom: rotatedCenterY + rotatedHalfHeight,
    };
}

export function scaleRecordsBounds(this: PanelRenderer, componentSelectionEntries: any) {
    const boundsEntries = componentSelectionEntries.map((selectionEntryRecord: any) =>
      this.componentVisualBounds(selectionEntryRecord.component, selectionEntryRecord.host),
    );
    return {
      left: Math.min(...boundsEntries.map((leftBoundEntry: any) => leftBoundEntry.left)),
      top: Math.min(...boundsEntries.map((topBoundEntry: any) => topBoundEntry.top)),
      right: Math.max(...boundsEntries.map((rightBoundEntry: any) => rightBoundEntry.right)),
      bottom: Math.max(...boundsEntries.map((bottomBoundEntry: any) => bottomBoundEntry.bottom)),
    };
}

export function refreshMultiSelectionBounds(this: PanelRenderer) {
    const existingMultiBoundsElement =
      this.canvas?.querySelector<HTMLElement>(".hb-multi-selection-bounds");
    if (
      !existingMultiBoundsElement ||
      !this.selectedComponentIds ||
      this.selectedComponentIds.size < 2
    )
      return;
    const edScaleRecords = this.selectedScaleRecords();
    if (!edScaleRecords.length) {
      existingMultiBoundsElement.remove();
      return;
    }
    const scaleRecordsBounds = this.scaleRecordsBounds(edScaleRecords);
    (Object.assign(existingMultiBoundsElement.style, {
      left: scaleRecordsBounds.left + "px",
      top: scaleRecordsBounds.top + "px",
      width: Math.max(1, scaleRecordsBounds.right - scaleRecordsBounds.left) + "px",
      height: Math.max(1, scaleRecordsBounds.bottom - scaleRecordsBounds.top) + "px",
    }),
      this.updateMultiSelectionHandleScale(existingMultiBoundsElement));
}

export function updateMultiSelectionHandleScale(this: PanelRenderer, multiSelectionHandleElement: any) {
    if (!multiSelectionHandleElement) return;
    const appliedMinScale = Math.min(this.appliedScaleX || 1, this.appliedScaleY || 1),
      handleComponentId = multiSelectionHandleElement.parentElement?.dataset?.componentId || null,
      scale = handleComponentId ? this.componentWorldTransform(handleComponentId).scale : 1,
      multiHandleUiScale = 1 / Math.max(0.001, appliedMinScale * scale);
    (multiSelectionHandleElement.style.setProperty("--hb-ui-scale", String(multiHandleUiScale)),
      multiSelectionHandleElement.style.setProperty(
        "--hb-handle-outset",
        30 * multiHandleUiScale + "px",
      ));
    const boundingClientRect = multiSelectionHandleElement.getBoundingClientRect();
    multiSelectionHandleElement.classList.toggle(
      "handles-outside",
      boundingClientRect.width < 132 || boundingClientRect.height < 112,
    );
}

export function appendMultiSelectionBounds(this: PanelRenderer) {
    const edScaleRecords2 = this.selectedScaleRecords();
    if (!edScaleRecords2.length) return;
    const scaleRecordsBounds2 = this.scaleRecordsBounds(edScaleRecords2),
      multiSelectionBoundsElement = document.createElement("div");
    ((multiSelectionBoundsElement.className = "hb-selection-bounds hb-multi-selection-bounds"),
      Object.assign(multiSelectionBoundsElement.style, {
        left: scaleRecordsBounds2.left + "px",
        top: scaleRecordsBounds2.top + "px",
        width: Math.max(1, scaleRecordsBounds2.right - scaleRecordsBounds2.left) + "px",
        height: Math.max(1, scaleRecordsBounds2.bottom - scaleRecordsBounds2.top) + "px",
      }));
    for (const cornerName of ["top-left", "top-right", "bottom-left", "bottom-right"]) {
      const cornerMarkerElement = document.createElement("i");
      ((cornerMarkerElement.className = "hb-corner-marker hb-corner-" + cornerName),
        cornerMarkerElement.setAttribute("aria-hidden", "true"),
        multiSelectionBoundsElement.append(cornerMarkerElement));
    }
    const multiResizeHandleElement = document.createElement("button");
    ((multiResizeHandleElement.type = "button"),
      (multiResizeHandleElement.className = "hb-transform-handle hb-resize-handle"),
      (multiResizeHandleElement.title = "拖动整体缩放"),
      multiResizeHandleElement.addEventListener("pointerdown", (resizePointerEvent) =>
        this.startComponentsScale(
          resizePointerEvent,
          edScaleRecords2,
          scaleRecordsBounds2,
          multiSelectionBoundsElement,
        ),
      ));
    const multiRotateHandleElement = document.createElement("button");
    ((multiRotateHandleElement.type = "button"),
      (multiRotateHandleElement.className = "hb-transform-handle hb-rotate-handle"),
      (multiRotateHandleElement.title = "拖动整体旋转"),
      multiRotateHandleElement.addEventListener("pointerdown", (rotatePointerEvent) =>
        this.startComponentsRotate(
          rotatePointerEvent,
          edScaleRecords2,
          scaleRecordsBounds2,
          multiSelectionBoundsElement,
        ),
      ),
      multiSelectionBoundsElement.append(multiResizeHandleElement, multiRotateHandleElement),
      (edScaleRecords2[0]?.host?.parentElement || this.canvas).append(multiSelectionBoundsElement),
      this.updateMultiSelectionHandleScale(multiSelectionBoundsElement));
}
