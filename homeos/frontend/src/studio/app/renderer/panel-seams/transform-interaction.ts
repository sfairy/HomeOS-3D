import type { DraggedComponentEntry } from "../renderer-types";
import { airflowCanvasOffsetBounds as airflowCanvasOffsetBounds2, groupedComponentLocalDelta as groupedComponentLocalDelta2, rotateMultiSelectionTransforms as rotateMultiSelectionTransforms2 } from "../geometry/transform-geometry";
import { assignComponentIdentifiers, isPrimaryModifierPressed } from "../renderer-helpers";
import { doorWindowPerspectiveCorners as doorWindowPerspectiveCorners2 } from "../registry";
import type { PanelRenderer } from "../panel-renderer";

export function startComponentsScale(self: PanelRenderer, scalePointerEvent: any,
    scaleEntries: any,
    selectionBounds: any,
    measurementHostElement: any,) {
    (scalePointerEvent.preventDefault(), scalePointerEvent.stopPropagation());
    const hostBoundingRect = measurementHostElement.getBoundingClientRect(),
      hostCenterX = hostBoundingRect.left + hostBoundingRect.width / 2,
      hostCenterY = hostBoundingRect.top + hostBoundingRect.height / 2,
      initialPointerDistance = Math.max(
        1,
        Math.hypot(
          scalePointerEvent.clientX - hostCenterX,
          scalePointerEvent.clientY - hostCenterY,
        ),
      ),
      groupCenterX = (selectionBounds.left + selectionBounds.right) / 2,
      groupCenterY = (selectionBounds.top + selectionBounds.bottom) / 2,
      scaledEntries = scaleEntries.map((entryRecord: any) => {
        const scaledEntryPosition = entryRecord.component.position || {},
          scaledEntryWidth = Number(scaledEntryPosition.width || 100),
          scaledEntryHeight = Number(scaledEntryPosition.height || 100);
        return {
          ...entryRecord,
          width: scaledEntryWidth,
          height: scaledEntryHeight,
          centerX: Number(scaledEntryPosition.x || 0) + scaledEntryWidth / 2,
          centerY: Number(scaledEntryPosition.y || 0) + scaledEntryHeight / 2,
          scale: Math.max(0.01, Math.min(5, Number(entryRecord.component.style?.scale || 1))),
        };
      }),
      minScaleFactor = Math.max(...scaledEntries.map((scaleEntry: any) => 0.01 / scaleEntry.scale)),
      maxScaleFactor = Math.min(
        ...scaledEntries.map((scaleEntryLimit: any) => 5 / scaleEntryLimit.scale),
      );
    let appliedScaleFactor = 1,
      transformPreviewEntries: any = [],
      hasStartedScaling = false;
    const pointerId = scalePointerEvent.pointerId;
    scalePointerEvent.currentTarget.setPointerCapture(pointerId);
    const scaleMoveHandler = (scaleMoveEvent: any) => {
        if (scaleMoveEvent.pointerId !== pointerId) return;
        const hypot = Math.hypot(
          scaleMoveEvent.clientX - hostCenterX,
          scaleMoveEvent.clientY - hostCenterY,
        );
        ((appliedScaleFactor = Math.max(
          minScaleFactor,
          Math.min(maxScaleFactor, hypot / initialPointerDistance),
        )),
          (transformPreviewEntries = scaledEntries.map((scaledEntry: any) => {
            const previewCenterX =
                groupCenterX + (scaledEntry.centerX - groupCenterX) * appliedScaleFactor,
              previewCenterY =
                groupCenterY + (scaledEntry.centerY - groupCenterY) * appliedScaleFactor,
              previewScale = scaledEntry.scale * appliedScaleFactor,
              previewX = previewCenterX - scaledEntry.width / 2,
              previewY = previewCenterY - scaledEntry.height / 2;
            return (
              (scaledEntry.component.position = {
                ...(scaledEntry.component.position || {}),
                x: previewX,
                y: previewY,
              }),
              (scaledEntry.component.style = {
                ...(scaledEntry.component.style || {}),
                scale: previewScale,
              }),
              (scaledEntry.host.style.left = previewX + "px"),
              (scaledEntry.host.style.top = previewY + "px"),
              (scaledEntry.host.style.transform =
                "rotate(" +
                Number(scaledEntry.component.position?.rotation || 0) +
                "deg) scale(" +
                previewScale +
                ")"),
              {
                componentId: scaledEntry.component.id,
                x: previewX,
                y: previewY,
                scale: previewScale,
              }
            );
          })),
          Object.assign(measurementHostElement.style, {
            left: groupCenterX + (selectionBounds.left - groupCenterX) * appliedScaleFactor + "px",
            top: groupCenterY + (selectionBounds.top - groupCenterY) * appliedScaleFactor + "px",
            width:
              Math.max(1, (selectionBounds.right - selectionBounds.left) * appliedScaleFactor) +
              "px",
            height:
              Math.max(1, (selectionBounds.bottom - selectionBounds.top) * appliedScaleFactor) +
              "px",
          }),
          self.updateMultiSelectionHandleScale(measurementHostElement),
          self.options.onComponentsTransformPreview?.(
            transformPreviewEntries,
            self.selectedComponentId,
          ));
      },
      scaleEndHandler = (scaleEndEvent: any = null) => {
        hasStartedScaling ||
          (scaleEndEvent?.pointerId != null && scaleEndEvent.pointerId !== pointerId) ||
          ((hasStartedScaling = true),
          window.removeEventListener("pointermove", scaleMoveHandler, true),
          window.removeEventListener("pointerup", scaleEndHandler, true),
          window.removeEventListener("pointercancel", scaleEndHandler, true),
          window.removeEventListener("blur", scaleEndHandler),
          appliedScaleFactor !== 1 &&
            transformPreviewEntries.length &&
            self.options.onComponentsTransform?.(
              transformPreviewEntries,
              self.selectedComponentId,
            ));
      };
    (window.addEventListener("pointermove", scaleMoveHandler, true),
      window.addEventListener("pointerup", scaleEndHandler, true),
      window.addEventListener("pointercancel", scaleEndHandler, true),
      window.addEventListener("blur", scaleEndHandler));
  }
export function startComponentsRotate(self: PanelRenderer, airflowComponentRotateEvent: any,
    rotateEntries: any,
    rotationBounds: any,
    rotationHostElement: any,) {
    (airflowComponentRotateEvent.preventDefault(), airflowComponentRotateEvent.stopPropagation());
    const rotationHostRect = rotationHostElement.getBoundingClientRect(),
      rotationCenterX = rotationHostRect.left + rotationHostRect.width / 2,
      rotationCenterY = rotationHostRect.top + rotationHostRect.height / 2,
      rotationBoundsCenterX = (rotationBounds.left + rotationBounds.right) / 2,
      rotationBoundsCenterY = (rotationBounds.top + rotationBounds.bottom) / 2,
      rotatableEntries = rotateEntries.map((rotatableEntry: any) => {
        const rotatableEntryPosition = rotatableEntry.component.position || {},
          rotatableEntryWidth = Number(rotatableEntryPosition.width || 100),
          rotatableEntryHeight = Number(rotatableEntryPosition.height || 100);
        return {
          ...rotatableEntry,
          componentId: rotatableEntry.component.id,
          width: rotatableEntryWidth,
          height: rotatableEntryHeight,
          centerX: Number(rotatableEntryPosition.x || 0) + rotatableEntryWidth / 2,
          centerY: Number(rotatableEntryPosition.y || 0) + rotatableEntryHeight / 2,
          rotation: Number(rotatableEntryPosition.rotation || 0),
        };
      });
    let startAngle = Math.atan2(
        airflowComponentRotateEvent.clientY - rotationCenterY,
        airflowComponentRotateEvent.clientX - rotationCenterX,
      ),
      totalRotationDeg = 0,
      rotatedPreviewEntries: any = [],
      hasRotated = false;
    const pointerId2 = airflowComponentRotateEvent.pointerId;
    airflowComponentRotateEvent.currentTarget.setPointerCapture(pointerId2);
    const rotateMoveHandler = (rotateMoveEvent: any) => {
        if (rotateMoveEvent.pointerId !== pointerId2) return;
        const currentAngle = Math.atan2(
          rotateMoveEvent.clientY - rotationCenterY,
          rotateMoveEvent.clientX - rotationCenterX,
        );
        let angleDelta = currentAngle - startAngle;
        (angleDelta > Math.PI
          ? (angleDelta -= Math.PI * 2)
          : angleDelta < -Math.PI && (angleDelta += Math.PI * 2),
          (totalRotationDeg += (angleDelta * 180) / Math.PI),
          (startAngle = currentAngle),
          (rotatedPreviewEntries = rotateMultiSelectionTransforms2(
            rotatableEntries,
            rotationBoundsCenterX,
            rotationBoundsCenterY,
            totalRotationDeg,
          )));
        for (const rotatedPreviewEntry of rotatedPreviewEntries) {
          const rotatedComponentRecord = rotatableEntries.find(
            (rotationMatchEntry: any) =>
              rotationMatchEntry.componentId === rotatedPreviewEntry.componentId,
          );
          rotatedComponentRecord &&
            ((rotatedComponentRecord.component.position = {
              ...(rotatedComponentRecord.component.position || {}),
              x: rotatedPreviewEntry.x,
              y: rotatedPreviewEntry.y,
              rotation: rotatedPreviewEntry.rotation,
            }),
            (rotatedComponentRecord.host.style.left = rotatedPreviewEntry.x + "px"),
            (rotatedComponentRecord.host.style.top = rotatedPreviewEntry.y + "px"),
            (rotatedComponentRecord.host.style.transform =
              "rotate(" +
              rotatedPreviewEntry.rotation +
              "deg) scale(" +
              Number(rotatedComponentRecord.component.style?.scale || 1) +
              ")"));
        }
        ((rotationHostElement.style.transform = "rotate(" + totalRotationDeg + "deg)"),
          (rotationHostElement.style.transformOrigin = "center center"),
          self.options.onComponentsTransformPreview?.(
            rotatedPreviewEntries,
            self.selectedComponentId,
          ));
      },
      rotateEndHandler = (rotateEndEvent: any = null) => {
        hasRotated ||
          (rotateEndEvent?.pointerId != null && rotateEndEvent.pointerId !== pointerId2) ||
          ((hasRotated = true),
          window.removeEventListener("pointermove", rotateMoveHandler, true),
          window.removeEventListener("pointerup", rotateEndHandler, true),
          window.removeEventListener("pointercancel", rotateEndHandler, true),
          window.removeEventListener("blur", rotateEndHandler),
          totalRotationDeg !== 0 &&
            rotatedPreviewEntries.length &&
            self.options.onComponentsTransform?.(rotatedPreviewEntries, self.selectedComponentId));
      };
    (window.addEventListener("pointermove", rotateMoveHandler, true),
      window.addEventListener("pointerup", rotateEndHandler, true),
      window.addEventListener("pointercancel", rotateEndHandler, true),
      window.addEventListener("blur", rotateEndHandler));
  }
export function startComponentMove(self: PanelRenderer, movePointerEvent: any,
    moveComponentRecord: any,
    moveHostElement: any,
    pointerTargetElement = moveHostElement,) {
    if (
      !self.options.editable ||
      moveComponentRecord.properties?.layoutMode === "fill" ||
      movePointerEvent.button !== 0 ||
      movePointerEvent.target.closest(".hb-transform-handle")
    )
      return;
    // 画布点击：未选中则先选中（⌘/Ctrl 切换多选），再进入拖拽
    if (!self.selectedComponentIds.has(moveComponentRecord.id)) {
      const toggle = isPrimaryModifierPressed(movePointerEvent);
      if (toggle) {
        self.selectedComponentIds.add(moveComponentRecord.id);
        self.selectedComponentId = moveComponentRecord.id;
      } else {
        self.selectedComponentIds = new Set([moveComponentRecord.id]);
        self.selectedComponentId = moveComponentRecord.id;
      }
      self.options.onSelectionChange?.(
        [...self.selectedComponentIds],
        self.selectedComponentId,
      );
      self.setSelectedComponents([...self.selectedComponentIds], self.selectedComponentId);
    }
    (movePointerEvent.preventDefault(), movePointerEvent.stopPropagation());
    const clientX = movePointerEvent.clientX,
      clientY = movePointerEvent.clientY,
      draggableEntries = [...self.selectedComponentIds]
        .map((draggableComponentId) => ({
          component: self.componentRecords.get(draggableComponentId),
          host: self.componentHosts.get(draggableComponentId),
        }))
        .filter((draggableEntry) => draggableEntry.component && draggableEntry.host)
        .map((draggableEntryRecord) => ({
          ...draggableEntryRecord,
          initialX: Number(draggableEntryRecord.component.position?.x || 0),
          initialY: Number(draggableEntryRecord.component.position?.y || 0),
          width: Number(draggableEntryRecord.component.position?.width || 100),
          height: Number(draggableEntryRecord.component.position?.height || 100),
          parentId: self.componentParentIds.get(draggableEntryRecord.component.id) || null,
          parentTransform: self.componentParentTransform(draggableEntryRecord.component.id),
          worldCenter: self.componentLocalPointToWorld(
            draggableEntryRecord.component.id,
            Number(draggableEntryRecord.component.position?.width || 100) / 2,
            Number(draggableEntryRecord.component.position?.height || 100) / 2,
          ),
        }));
    if (
      !draggableEntries.some(
        (draggableEntryItem) => draggableEntryItem.component.id === moveComponentRecord.id,
      ) ||
      draggableEntries.some(
        (fillLayoutEntry) => fillLayoutEntry.component.properties?.layoutMode === "fill",
      )
    )
      return;
    let hasGestureStarted = isPrimaryModifierPressed(movePointerEvent),
      isOptimisticToggled =
        !hasGestureStarted &&
        draggableEntries.length === 1 &&
        moveComponentRecord.type === "air-conditioner" &&
        self.componentSelectionLayers.get(moveComponentRecord.id) !== "airflow";
    const airflowOffsetX = Number(moveComponentRecord.properties?.airflowOffsetX ?? -75),
      airflowOffsetY = Number(moveComponentRecord.properties?.airflowOffsetY ?? 34);
    let nextAirflowOffsetX = airflowOffsetX,
      nextAirflowOffsetY = airflowOffsetY;
    const moveCanvasWidth = Number(self.document?.canvas?.width || 2778),
      moveCanvasHeight = Number(self.document?.canvas?.height || 1940),
      reduce = draggableEntries.reduce(
        (dragBounds, dragEntryRecord) => ({
          minX: Math.max(dragBounds.minX, Math.min(0, -dragEntryRecord.worldCenter.x)),
          maxX: Math.min(
            dragBounds.maxX,
            Math.max(0, moveCanvasWidth - dragEntryRecord.worldCenter.x),
          ),
          minY: Math.max(dragBounds.minY, Math.min(0, -dragEntryRecord.worldCenter.y)),
          maxY: Math.min(
            dragBounds.maxY,
            Math.max(0, moveCanvasHeight - dragEntryRecord.worldCenter.y),
          ),
        }),
        {
          minX: -Infinity,
          maxX: Infinity,
          minY: -Infinity,
          maxY: Infinity,
        },
      ),
      initialPositionX = Number(moveComponentRecord.position?.x || 0),
      initialPositionY = Number(moveComponentRecord.position?.y || 0);
    let nextPositionX = initialPositionX,
      nextPositionY = initialPositionY,
      draggedEntries: DraggedComponentEntry[] = draggableEntries,
      duplicatedEntries: any = [],
      dragTransforms = draggableEntries.map((dragEntrySource) => ({
        componentId: dragEntrySource.component.id,
        x: dragEntrySource.initialX,
        y: dragEntrySource.initialY,
      })),
      primaryDraggedComponentId = moveComponentRecord.id,
      hasDuplicatedComponents = false,
      dragDirection = "",
      hasDragCommitted = false;
    const pointerId3 = movePointerEvent.pointerId;
    (pointerTargetElement.setPointerCapture(pointerId3),
      draggableEntries.forEach((movingHostEntry) => movingHostEntry.host.classList.add("moving")));
    const dragMoveHandler = (dragMoveEvent: any) => {
        if (dragMoveEvent.pointerId !== pointerId3) return;
        if (
          !pointerTargetElement.hasPointerCapture?.(pointerId3) &&
          pointerTargetElement.isConnected
        )
          try {
            pointerTargetElement.setPointerCapture(pointerId3);
          } catch {}
        !hasGestureStarted &&
          isPrimaryModifierPressed(dragMoveEvent) &&
          ((hasGestureStarted = true), (isOptimisticToggled = false));
        let dragDeltaX = dragMoveEvent.clientX - clientX,
          dragDeltaY = dragMoveEvent.clientY - clientY;
        if (hasGestureStarted && !hasDuplicatedComponents) {
          if (Math.hypot(dragDeltaX, dragDeltaY) < 3) return;
          ((duplicatedEntries = draggableEntries.map((duplicateSourceEntry) => {
            const copiedComponent = assignComponentIdentifiers(
              structuredClone(duplicateSourceEntry.component),
            );
            return (
              (copiedComponent.position = {
                ...(copiedComponent.position || {}),
                zIndex: Number(copiedComponent.position?.zIndex || 1) + 1,
              }),
              self.renderComponent(copiedComponent, duplicateSourceEntry.host.parentElement),
              {
                sourceComponentId: duplicateSourceEntry.component.id,
                copiedComponent: copiedComponent,
              }
            );
          })),
            (draggedEntries = duplicatedEntries.map((duplicatedEntry: any, duplicatedIndex: any) => ({
              component: duplicatedEntry.copiedComponent,
              host: self.componentHosts.get(duplicatedEntry.copiedComponent.id),
              initialX: draggableEntries[duplicatedIndex].initialX,
              initialY: draggableEntries[duplicatedIndex].initialY,
              width: draggableEntries[duplicatedIndex].width,
              height: draggableEntries[duplicatedIndex].height,
              parentId: draggableEntries[duplicatedIndex].parentId,
              parentTransform: draggableEntries[duplicatedIndex].parentTransform,
            }))),
            (primaryDraggedComponentId =
              duplicatedEntries.find(
                (duplicateMatchEntry: any) =>
                  duplicateMatchEntry.sourceComponentId === moveComponentRecord.id,
              )?.copiedComponent.id || duplicatedEntries[0]?.copiedComponent.id),
            (hasDuplicatedComponents = true),
            draggableEntries.forEach((draggedSourceEntry) =>
              draggedSourceEntry.host.classList.remove("moving"),
            ),
            draggedEntries.forEach((duplicatedEntryItem) =>
              duplicatedEntryItem.host?.classList.add("moving"),
            ),
            (self.selectedComponentId = primaryDraggedComponentId),
            (self.selectedComponentIds = new Set(
              draggedEntries.map((selectedEntry) => selectedEntry.component.id),
            )));
        }
        dragMoveEvent.shiftKey
          ? (!dragDirection &&
              Math.hypot(dragDeltaX, dragDeltaY) >= 1 &&
              (dragDirection =
                Math.abs(dragDeltaX) >= Math.abs(dragDeltaY) ? "horizontal" : "vertical"),
            dragDirection === "horizontal" && (dragDeltaY = 0),
            dragDirection === "vertical" && (dragDeltaX = 0))
          : (dragDirection = "");
        const dragLocalDeltaX = Math.max(
            reduce.minX,
            Math.min(reduce.maxX, dragDeltaX / (self.appliedScaleX || 1)),
          ),
          dragLocalDeltaY = Math.max(
            reduce.minY,
            Math.min(reduce.maxY, dragDeltaY / (self.appliedScaleY || 1)),
          ),
          primaryDragEntry =
            draggableEntries.find(
              (primaryCandidateEntry) =>
                primaryCandidateEntry.component.id === moveComponentRecord.id,
            ) || draggableEntries[0],
          localDelta = groupedComponentLocalDelta2(
            dragLocalDeltaX,
            dragLocalDeltaY,
            primaryDragEntry.parentTransform,
          );
        ((nextPositionX = initialPositionX + localDelta.x),
          (nextPositionY = initialPositionY + localDelta.y),
          isOptimisticToggled &&
            ((nextAirflowOffsetX =
              airflowOffsetX -
              (localDelta.x / Math.max(1, Number(moveComponentRecord.position?.width || 100))) *
                100),
            (nextAirflowOffsetY =
              airflowOffsetY -
              (localDelta.y / Math.max(1, Number(moveComponentRecord.position?.height || 100))) *
                100),
            (moveComponentRecord.properties = {
              ...(moveComponentRecord.properties || {}),
              airflowOffsetX: nextAirflowOffsetX,
              airflowOffsetY: nextAirflowOffsetY,
            }),
            self.options.onComponentPropertiesPreview?.(moveComponentRecord.id, {
              airflowOffsetX: nextAirflowOffsetX,
              airflowOffsetY: nextAirflowOffsetY,
            })));
        const dragResultEntries = draggedEntries.map((dragResultEntry) => {
          const entryLocalDelta = groupedComponentLocalDelta2(
            dragLocalDeltaX,
            dragLocalDeltaY,
            dragResultEntry.parentTransform,
          );
          return {
            componentId: dragResultEntry.component.id,
            x: dragResultEntry.initialX + entryLocalDelta.x,
            y: dragResultEntry.initialY + entryLocalDelta.y,
          };
        });
        dragTransforms = dragResultEntries;
        for (const transformEntry of dragResultEntries) {
          const transformPreviewHostElement = self.componentHosts.get(transformEntry.componentId);
          transformPreviewHostElement &&
            ((transformPreviewHostElement.style.left = transformEntry.x + "px"),
            (transformPreviewHostElement.style.top = transformEntry.y + "px"));
          const transformOverlayElement = self.componentSelectionOverlays.get(
            transformEntry.componentId,
          );
          transformOverlayElement &&
            ((transformOverlayElement.style.left = transformEntry.x + "px"),
            (transformOverlayElement.style.top = transformEntry.y + "px"));
        }
        hasDuplicatedComponents ||
          (dragResultEntries.length > 1
            ? self.options.onComponentsTransformPreview?.(dragResultEntries, moveComponentRecord.id)
            : self.options.onComponentTransformPreview?.(moveComponentRecord.id, {
                x: nextPositionX,
                y: nextPositionY,
              }));
      },
      dragEndHandler = (dragEndEvent: any = null) => {
        if (
          !hasDragCommitted &&
          !(dragEndEvent?.pointerId != null && dragEndEvent.pointerId !== pointerId3) &&
          ((hasDragCommitted = true),
          draggedEntries.forEach((duplicatedCleanupEntry) =>
            duplicatedCleanupEntry.host?.classList.remove("moving"),
          ),
          draggableEntries.forEach((draggedCleanupEntry) =>
            draggedCleanupEntry.host.classList.remove("moving"),
          ),
          window.removeEventListener("pointermove", dragMoveHandler, true),
          window.removeEventListener("pointerup", dragEndHandler, true),
          window.removeEventListener("pointercancel", dragEndHandler, true),
          window.removeEventListener("blur", dragEndHandler),
          nextPositionX !== initialPositionX || nextPositionY !== initialPositionY)
        ) {
          if (hasDuplicatedComponents)
            (draggedEntries.forEach((committedEntry) => {
              const committedTransformRecord = dragTransforms.find(
                (committedMatchEntry) =>
                  committedMatchEntry.componentId === committedEntry.component.id,
              );
              committedEntry.component.position = {
                ...(committedEntry.component.position || {}),
                x: committedTransformRecord?.x ?? committedEntry.initialX,
                y: committedTransformRecord?.y ?? committedEntry.initialY,
              };
            }),
              self.options.onComponentsDuplicate?.(
                duplicatedEntries,
                moveComponentRecord.id,
                primaryDraggedComponentId,
              ));
          else {
            if (draggableEntries.length > 1) {
              const finalTransforms = dragTransforms.map((finalTransformRecord) => {
                const finalDragEntry = draggableEntries.find(
                  (finalMatchEntry) =>
                    finalMatchEntry.component.id === finalTransformRecord.componentId,
                );
                return (
                  finalDragEntry &&
                    (finalDragEntry.component.position = {
                      ...(finalDragEntry.component.position || {}),
                      x: finalTransformRecord.x,
                      y: finalTransformRecord.y,
                    }),
                  finalTransformRecord
                );
              });
              self.options.onComponentsTransform?.(finalTransforms, moveComponentRecord.id);
            } else
              ((moveComponentRecord.position = {
                ...(moveComponentRecord.position || {}),
                x: nextPositionX,
                y: nextPositionY,
              }),
                self.options.onComponentTransform?.(moveComponentRecord.id, {
                  x: nextPositionX,
                  y: nextPositionY,
                  ...(isOptimisticToggled
                    ? {
                        airflowOffsetX: nextAirflowOffsetX,
                        airflowOffsetY: nextAirflowOffsetY,
                      }
                    : {}),
                }));
          }
        }
      };
    (window.addEventListener("pointermove", dragMoveHandler, true),
      window.addEventListener("pointerup", dragEndHandler, true),
      window.addEventListener("pointercancel", dragEndHandler, true),
      window.addEventListener("blur", dragEndHandler));
  }
export function startDoorWindowPerspective(self: PanelRenderer, perspectivePointerEvent: any,
    perspectiveComponentRecord: any,
    perspectiveLayerElement: any,
    perspectiveHandleBoundsElement: any,
    perspectiveCornerIndex: any,) {
    if (perspectivePointerEvent.button !== 0) return;
    (perspectivePointerEvent.preventDefault(), perspectivePointerEvent.stopPropagation());
    const pointerId4 = perspectivePointerEvent.pointerId,
      clientX2 = perspectivePointerEvent.clientX,
      clientY2 = perspectivePointerEvent.clientY,
      initialCorners = doorWindowPerspectiveCorners2(
        perspectiveComponentRecord.properties?.perspectiveCorners,
      ),
      cornerX = initialCorners[perspectiveCornerIndex * 2],
      cornerY = initialCorners[perspectiveCornerIndex * 2 + 1],
      doorWindowWidth = Math.max(1, Number(perspectiveComponentRecord.position?.width || 100)),
      doorWindowHeight = Math.max(1, Number(perspectiveComponentRecord.position?.height || 100)),
      componentWorldTransform2 = self.componentWorldTransform(perspectiveComponentRecord.id),
      scale2 = componentWorldTransform2.scale,
      rotationRad = (componentWorldTransform2.rotation * Math.PI) / 180,
      cos2 = Math.cos(rotationRad),
      sin2 = Math.sin(rotationRad);
    let nextCorners = initialCorners,
      hasPerspectiveChanged = false;
    const perspectiveMoveHandler = (perspectiveMoveEvent: any) => {
        if (perspectiveMoveEvent.pointerId !== pointerId4) return;
        const moveDeltaX =
            (perspectiveMoveEvent.clientX - clientX2) / Math.max(0.001, self.appliedScaleX || 1),
          moveDeltaY =
            (perspectiveMoveEvent.clientY - clientY2) / Math.max(0.001, self.appliedScaleY || 1),
          localDeltaX = (cos2 * moveDeltaX + sin2 * moveDeltaY) / scale2,
          localDeltaY = (-sin2 * moveDeltaX + cos2 * moveDeltaY) / scale2,
          slice = initialCorners.slice();
        ((slice[perspectiveCornerIndex * 2] = cornerX + localDeltaX / doorWindowWidth),
          (slice[perspectiveCornerIndex * 2 + 1] = cornerY + localDeltaY / doorWindowHeight),
          (nextCorners = doorWindowPerspectiveCorners2(slice)),
          (perspectiveComponentRecord.properties = {
            ...(perspectiveComponentRecord.properties || {}),
            perspectiveCorners: nextCorners,
          }),
          self.applyDoorWindowPerspective(
            perspectiveLayerElement,
            perspectiveComponentRecord,
            nextCorners,
          ),
          self.updateDoorWindowPerspectiveHandles(perspectiveHandleBoundsElement, nextCorners),
          self.options.onComponentPropertiesPreview?.(perspectiveComponentRecord.id, {
            perspectiveCorners: nextCorners,
          }));
      },
      perspectiveEndHandler = (perspectiveEndEvent: any = null) => {
        hasPerspectiveChanged ||
          (perspectiveEndEvent?.pointerId != null &&
            perspectiveEndEvent.pointerId !== pointerId4) ||
          ((hasPerspectiveChanged = true),
          window.removeEventListener("pointermove", perspectiveMoveHandler, true),
          window.removeEventListener("pointerup", perspectiveEndHandler, true),
          window.removeEventListener("pointercancel", perspectiveEndHandler, true),
          window.removeEventListener("blur", perspectiveEndHandler),
          JSON.stringify(nextCorners) !== JSON.stringify(initialCorners) &&
            self.options.onComponentProperties?.(perspectiveComponentRecord.id, {
              perspectiveCorners: nextCorners,
            }));
      };
    (window.addEventListener("pointermove", perspectiveMoveHandler, true),
      window.addEventListener("pointerup", perspectiveEndHandler, true),
      window.addEventListener("pointercancel", perspectiveEndHandler, true),
      window.addEventListener("blur", perspectiveEndHandler));
  }
export function startAirflowMove(self: PanelRenderer, airflowMovePointerEvent: any,
    airflowMoveComponent: any,
    airflowMoveLayerElement: any,
    airflowMoveCaptureElement: any,
    airflowMoveOverlayElement: any,) {
    if (
      airflowMovePointerEvent.button !== 0 ||
      airflowMovePointerEvent.target.closest(".hb-transform-handle")
    )
      return;
    (airflowMovePointerEvent.preventDefault(), airflowMovePointerEvent.stopPropagation());
    const clientX3 = airflowMovePointerEvent.clientX,
      clientY3 = airflowMovePointerEvent.clientY,
      airflowLayerWidth = Math.max(1, Number(airflowMoveComponent.position?.width || 100)),
      airflowLayerHeight = Math.max(1, Number(airflowMoveComponent.position?.height || 100)),
      airflowStartOffsetX = Number(airflowMoveComponent.properties?.airflowOffsetX ?? -75),
      airflowStartOffsetY = Number(airflowMoveComponent.properties?.airflowOffsetY ?? 34),
      airflowOffsetBounds = airflowCanvasOffsetBounds2(airflowMoveComponent, self.document?.canvas);
    let airflowNextOffsetX = airflowStartOffsetX,
      airflowNextOffsetY = airflowStartOffsetY,
      airflowMoveDirection = "",
      hasAirflowMoved = false;
    const pointerId5 = airflowMovePointerEvent.pointerId;
    airflowMoveCaptureElement.setPointerCapture(pointerId5);
    const airflowMoveHandler = (airflowMovePointer: any) => {
        if (airflowMovePointer.pointerId !== pointerId5) return;
        if (
          !airflowMoveCaptureElement.hasPointerCapture?.(pointerId5) &&
          airflowMoveCaptureElement.isConnected
        )
          try {
            airflowMoveCaptureElement.setPointerCapture(pointerId5);
          } catch {}
        let airflowDeltaX = airflowMovePointer.clientX - clientX3,
          airflowDeltaY = airflowMovePointer.clientY - clientY3;
        airflowMovePointer.shiftKey
          ? (!airflowMoveDirection &&
              Math.hypot(airflowDeltaX, airflowDeltaY) >= 1 &&
              (airflowMoveDirection =
                Math.abs(airflowDeltaX) >= Math.abs(airflowDeltaY) ? "horizontal" : "vertical"),
            airflowMoveDirection === "horizontal" && (airflowDeltaY = 0),
            airflowMoveDirection === "vertical" && (airflowDeltaX = 0))
          : (airflowMoveDirection = "");
        const airflowLocalDeltaX = airflowDeltaX / Math.max(0.001, self.appliedScaleX || 1),
          airflowLocalDeltaY = airflowDeltaY / Math.max(0.001, self.appliedScaleY || 1),
          airflowLocalDelta = groupedComponentLocalDelta2(
            airflowLocalDeltaX,
            airflowLocalDeltaY,
            self.componentParentTransform(airflowMoveComponent.id),
          );
        ((airflowNextOffsetX = Math.max(
          airflowOffsetBounds.minX,
          Math.min(
            airflowOffsetBounds.maxX,
            airflowStartOffsetX + (airflowLocalDelta.x / airflowLayerWidth) * 100,
          ),
        )),
          (airflowNextOffsetY = Math.max(
            airflowOffsetBounds.minY,
            Math.min(
              airflowOffsetBounds.maxY,
              airflowStartOffsetY + (airflowLocalDelta.y / airflowLayerHeight) * 100,
            ),
          )),
          (airflowMoveComponent.properties = {
            ...(airflowMoveComponent.properties || {}),
            airflowOffsetX: airflowNextOffsetX,
            airflowOffsetY: airflowNextOffsetY,
          }),
          self.syncAirflowLayerGeometry(
            airflowMoveLayerElement,
            airflowMoveComponent,
            airflowMoveOverlayElement,
          ),
          self.options.onComponentPropertiesPreview?.(airflowMoveComponent.id, {
            airflowOffsetX: airflowNextOffsetX,
            airflowOffsetY: airflowNextOffsetY,
          }));
      },
      airflowEndHandler = (airflowEndEvent: any = null) => {
        hasAirflowMoved ||
          (airflowEndEvent?.pointerId != null && airflowEndEvent.pointerId !== pointerId5) ||
          ((hasAirflowMoved = true),
          window.removeEventListener("pointermove", airflowMoveHandler, true),
          window.removeEventListener("pointerup", airflowEndHandler, true),
          window.removeEventListener("pointercancel", airflowEndHandler, true),
          window.removeEventListener("blur", airflowEndHandler),
          (airflowNextOffsetX !== airflowStartOffsetX ||
            airflowNextOffsetY !== airflowStartOffsetY) &&
            self.options.onComponentProperties?.(airflowMoveComponent.id, {
              airflowOffsetX: airflowNextOffsetX,
              airflowOffsetY: airflowNextOffsetY,
            }));
      };
    (window.addEventListener("pointermove", airflowMoveHandler, true),
      window.addEventListener("pointerup", airflowEndHandler, true),
      window.addEventListener("pointercancel", airflowEndHandler, true),
      window.addEventListener("blur", airflowEndHandler));
  }
export function startAirflowScale(self: PanelRenderer, airflowScalePointerEvent: any,
    airflowScaleComponentRecord: any,
    airflowScaleLayerTarget: any,
    airflowScaleHandleElement: any,
    airflowScaleOverlayElement: any,) {
    (airflowScalePointerEvent.preventDefault(), airflowScalePointerEvent.stopPropagation());
    const airflowHandleBounds = airflowScaleHandleElement.getBoundingClientRect(),
      airflowCenterX = airflowHandleBounds.left + airflowHandleBounds.width / 2,
      airflowCenterY = airflowHandleBounds.top + airflowHandleBounds.height / 2,
      airflowInitialDistance = Math.max(
        1,
        Math.hypot(
          airflowScalePointerEvent.clientX - airflowCenterX,
          airflowScalePointerEvent.clientY - airflowCenterY,
        ),
      ),
      airflowStartScale = Math.max(
        0.01,
        Math.min(5, Number(airflowScaleComponentRecord.properties?.airflowScale || 1)),
      );
    let airflowNextScale = airflowStartScale,
      hasAirflowScaled = false;
    const currentTarget = airflowScalePointerEvent.currentTarget;
    currentTarget.setPointerCapture(airflowScalePointerEvent.pointerId);
    const airflowScaleCommit = () => {
        (self.syncAirflowLayerGeometry(
          airflowScaleLayerTarget,
          airflowScaleComponentRecord,
          airflowScaleOverlayElement,
        ),
          self.updateAirflowHandleScale(airflowScaleComponentRecord, airflowScaleHandleElement));
      },
      airflowScaleMoveHandler = (airflowScaleMoveEvent: any) => {
        const hypot2 = Math.hypot(
          airflowScaleMoveEvent.clientX - airflowCenterX,
          airflowScaleMoveEvent.clientY - airflowCenterY,
        );
        ((airflowNextScale = Math.max(
          0.01,
          Math.min(5, (airflowStartScale * hypot2) / airflowInitialDistance),
        )),
          (airflowScaleComponentRecord.properties = {
            ...(airflowScaleComponentRecord.properties || {}),
            airflowScale: airflowNextScale,
          }),
          airflowScaleCommit(),
          self.options.onComponentPropertiesPreview?.(airflowScaleComponentRecord.id, {
            airflowScale: airflowNextScale,
          }));
      },
      airflowScaleEndHandler = () => {
        hasAirflowScaled ||
          ((hasAirflowScaled = true),
          currentTarget.removeEventListener("pointermove", airflowScaleMoveHandler),
          currentTarget.removeEventListener("pointerup", airflowScaleEndHandler),
          currentTarget.removeEventListener("pointercancel", airflowScaleEndHandler),
          currentTarget.removeEventListener("lostpointercapture", airflowScaleEndHandler),
          airflowNextScale !== airflowStartScale &&
            self.options.onComponentProperties?.(airflowScaleComponentRecord.id, {
              airflowScale: airflowNextScale,
            }));
      };
    (currentTarget.addEventListener("pointermove", airflowScaleMoveHandler),
      currentTarget.addEventListener("pointerup", airflowScaleEndHandler),
      currentTarget.addEventListener("pointercancel", airflowScaleEndHandler),
      currentTarget.addEventListener("lostpointercapture", airflowScaleEndHandler));
  }
export function startAirflowRotate(self: PanelRenderer, airflowRotatePointerEvent: any,
    airflowRotateComponent: any,
    airflowRotateLayerElement: any,
    airflowRotateTargetElement: any,
    airflowRotateOverlayElement: any,) {
    (airflowRotatePointerEvent.preventDefault(), airflowRotatePointerEvent.stopPropagation());
    const airflowRotateRect = airflowRotateTargetElement.getBoundingClientRect(),
      airflowRotateCenterX = airflowRotateRect.left + airflowRotateRect.width / 2,
      airflowRotateCenterY = airflowRotateRect.top + airflowRotateRect.height / 2,
      startRotateAngle = Math.atan2(
        airflowRotatePointerEvent.clientY - airflowRotateCenterY,
        airflowRotatePointerEvent.clientX - airflowRotateCenterX,
      ),
      airflowStartRotation = Number(airflowRotateComponent.properties?.airflowRotation || 0);
    let airflowNextRotation = airflowStartRotation,
      hasAirflowRotated = false;
    const currentTarget2 = airflowRotatePointerEvent.currentTarget;
    currentTarget2.setPointerCapture(airflowRotatePointerEvent.pointerId);
    const airflowRotateMoveHandler = (airflowRotateMoveEvent: any) => {
        const currentRotateAngle = Math.atan2(
          airflowRotateMoveEvent.clientY - airflowRotateCenterY,
          airflowRotateMoveEvent.clientX - airflowRotateCenterX,
        );
        ((airflowNextRotation =
          airflowStartRotation + ((currentRotateAngle - startRotateAngle) * 180) / Math.PI),
          (airflowRotateComponent.properties = {
            ...(airflowRotateComponent.properties || {}),
            airflowRotation: airflowNextRotation,
          }),
          self.syncAirflowLayerGeometry(
            airflowRotateLayerElement,
            airflowRotateComponent,
            airflowRotateOverlayElement,
          ),
          self.options.onComponentPropertiesPreview?.(airflowRotateComponent.id, {
            airflowRotation: airflowNextRotation,
          }));
      },
      airflowRotateEndHandler = () => {
        hasAirflowRotated ||
          ((hasAirflowRotated = true),
          currentTarget2.removeEventListener("pointermove", airflowRotateMoveHandler),
          currentTarget2.removeEventListener("pointerup", airflowRotateEndHandler),
          currentTarget2.removeEventListener("pointercancel", airflowRotateEndHandler),
          currentTarget2.removeEventListener("lostpointercapture", airflowRotateEndHandler),
          airflowNextRotation !== airflowStartRotation &&
            self.options.onComponentProperties?.(airflowRotateComponent.id, {
              airflowRotation: airflowNextRotation,
            }));
      };
    (currentTarget2.addEventListener("pointermove", airflowRotateMoveHandler),
      currentTarget2.addEventListener("pointerup", airflowRotateEndHandler),
      currentTarget2.addEventListener("pointercancel", airflowRotateEndHandler),
      currentTarget2.addEventListener("lostpointercapture", airflowRotateEndHandler));
  }
export function startComponentScale(self: PanelRenderer, scaleComponentPointerEvent: any,
    scalingComponentRecord: any,
    scalingHostElement: any,
    scalingBoundsElement: any,) {
    (scaleComponentPointerEvent.preventDefault(), scaleComponentPointerEvent.stopPropagation());
    const scalingBoundsRect =
        scalingBoundsElement?.getBoundingClientRect() || scalingHostElement.getBoundingClientRect(),
      scalingCenterX = scalingBoundsRect.left + scalingBoundsRect.width / 2,
      scalingCenterY = scalingBoundsRect.top + scalingBoundsRect.height / 2,
      scaleInitialDistance = Math.max(
        1,
        Math.hypot(
          scaleComponentPointerEvent.clientX - scalingCenterX,
          scaleComponentPointerEvent.clientY - scalingCenterY,
        ),
      ),
      scaleStartValue = Math.max(
        0.01,
        Math.min(5, Number(scalingComponentRecord.style?.scale || 1)),
      );
    let scaleNextValue = scaleStartValue,
      hasScaled = false;
    const pointerId6 = scaleComponentPointerEvent.pointerId;
    scaleComponentPointerEvent.currentTarget.setPointerCapture(pointerId6);
    const componentScaleMoveHandler = (componentScaleMoveEvent: any) => {
        if (componentScaleMoveEvent.pointerId !== pointerId6) return;
        const hypot3 = Math.hypot(
          componentScaleMoveEvent.clientX - scalingCenterX,
          componentScaleMoveEvent.clientY - scalingCenterY,
        );
        ((scaleNextValue = Math.max(
          0.01,
          Math.min(5, (scaleStartValue * hypot3) / scaleInitialDistance),
        )),
          (scalingComponentRecord.style = {
            ...(scalingComponentRecord.style || {}),
            scale: scaleNextValue,
          }),
          (scalingHostElement.style.transform =
            "rotate(" +
            Number(scalingComponentRecord.position?.rotation || 0) +
            "deg) scale(" +
            scaleNextValue +
            ")"));
        const scaleOverlayElement = self.componentSelectionOverlays.get(scalingComponentRecord.id);
        (scaleOverlayElement &&
          (scaleOverlayElement.style.transform = scalingHostElement.style.transform),
          self.updateTransformHandleScale(
            scalingHostElement,
            scalingComponentRecord,
            scalingBoundsElement,
          ),
          self.options.onComponentTransformPreview?.(scalingComponentRecord.id, {
            scale: scaleNextValue,
          }));
      },
      componentScaleEndHandler = (componentScaleEndEvent: any = null) => {
        hasScaled ||
          (componentScaleEndEvent?.pointerId != null &&
            componentScaleEndEvent.pointerId !== pointerId6) ||
          ((hasScaled = true),
          window.removeEventListener("pointermove", componentScaleMoveHandler, true),
          window.removeEventListener("pointerup", componentScaleEndHandler, true),
          window.removeEventListener("pointercancel", componentScaleEndHandler, true),
          window.removeEventListener("blur", componentScaleEndHandler),
          (scalingComponentRecord.style = {
            ...(scalingComponentRecord.style || {}),
            scale: scaleNextValue,
          }),
          scaleNextValue !== scaleStartValue &&
            self.options.onComponentTransform?.(scalingComponentRecord.id, {
              scale: scaleNextValue,
            }));
      };
    (window.addEventListener("pointermove", componentScaleMoveHandler, true),
      window.addEventListener("pointerup", componentScaleEndHandler, true),
      window.addEventListener("pointercancel", componentScaleEndHandler, true),
      window.addEventListener("blur", componentScaleEndHandler));
  }
export function startComponentRotate(self: PanelRenderer, rotateComponentPointerEvent: any,
    rotatingComponentRecord: any,
    rotatingHostElement: any,
    rotatingBoundsElement: any,) {
    (rotateComponentPointerEvent.preventDefault(), rotateComponentPointerEvent.stopPropagation());
    const rotatingBoundsRect =
        rotatingBoundsElement?.getBoundingClientRect() ||
        rotatingHostElement.getBoundingClientRect(),
      rotatingCenterX = rotatingBoundsRect.left + rotatingBoundsRect.width / 2,
      rotatingCenterY = rotatingBoundsRect.top + rotatingBoundsRect.height / 2,
      startComponentAngle = Math.atan2(
        rotateComponentPointerEvent.clientY - rotatingCenterY,
        rotateComponentPointerEvent.clientX - rotatingCenterX,
      ),
      componentStartRotation = Number(rotatingComponentRecord.position?.rotation || 0);
    let componentNextRotation = componentStartRotation,
      hasRotatedComponent = false;
    const pointerId7 = rotateComponentPointerEvent.pointerId;
    rotateComponentPointerEvent.currentTarget.setPointerCapture(pointerId7);
    const componentRotateMoveHandler = (componentRotateMoveEvent: any) => {
        if (componentRotateMoveEvent.pointerId !== pointerId7) return;
        const currentComponentAngle = Math.atan2(
          componentRotateMoveEvent.clientY - rotatingCenterY,
          componentRotateMoveEvent.clientX - rotatingCenterX,
        );
        ((componentNextRotation =
          componentStartRotation + ((currentComponentAngle - startComponentAngle) * 180) / Math.PI),
          (rotatingHostElement.style.transform =
            "rotate(" +
            componentNextRotation +
            "deg) scale(" +
            Number(rotatingComponentRecord.style?.scale || 1) +
            ")"));
        const rotateOverlayElement = self.componentSelectionOverlays.get(
          rotatingComponentRecord.id,
        );
        (rotateOverlayElement &&
          (rotateOverlayElement.style.transform = rotatingHostElement.style.transform),
          self.options.onComponentTransformPreview?.(rotatingComponentRecord.id, {
            rotation: componentNextRotation,
          }));
      },
      componentRotateEndHandler = (componentRotateEndEvent: any = null) => {
        hasRotatedComponent ||
          (componentRotateEndEvent?.pointerId != null &&
            componentRotateEndEvent.pointerId !== pointerId7) ||
          ((hasRotatedComponent = true),
          window.removeEventListener("pointermove", componentRotateMoveHandler, true),
          window.removeEventListener("pointerup", componentRotateEndHandler, true),
          window.removeEventListener("pointercancel", componentRotateEndHandler, true),
          window.removeEventListener("blur", componentRotateEndHandler),
          (rotatingComponentRecord.position = {
            ...(rotatingComponentRecord.position || {}),
            rotation: componentNextRotation,
          }),
          componentNextRotation !== componentStartRotation &&
            self.options.onComponentTransform?.(rotatingComponentRecord.id, {
              rotation: componentNextRotation,
            }));
      };
    (window.addEventListener("pointermove", componentRotateMoveHandler, true),
      window.addEventListener("pointerup", componentRotateEndHandler, true),
      window.addEventListener("pointercancel", componentRotateEndHandler, true),
      window.addEventListener("blur", componentRotateEndHandler));
  }