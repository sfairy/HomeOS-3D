export function overviewFloorId(node) {
  for (let currentNode = node; currentNode; currentNode = currentNode.parent) {
    const resolvedFloorId =
      currentNode.userData?.floorId ||
      currentNode.userData?.regionFloorId ||
      currentNode.userData?.environmentFloorId ||
      currentNode.userData?.lightFloorId;
    if (resolvedFloorId) return String(resolvedFloorId);
  }
  return "";
}
export function stackProjection(
  THREE,
  camera,
  stackedHeight,
  projectionOffsetY,
  targetMatrix = new THREE.Matrix4(),
) {
  const translationMatrix = new THREE.Matrix4().makeTranslation(0, projectionOffsetY, 0);
  return targetMatrix
    .copy(translationMatrix)
    .multiply(camera.projectionMatrix)
    .multiply(camera.matrixWorldInverse)
    .multiply(new THREE.Matrix4().makeTranslation(0, -stackedHeight, 0))
    .multiply(camera.matrixWorld);
}
export function createOverviewStack({
  THREE: three,
  renderer: renderer,
  scene: scene,
  getCamera: getCamera,
  getLayout: getLayout,
}) {
  const originalRenderBufferDirect = renderer.renderBufferDirect,
    originalRender = renderer.render,
    stackByFloorId = new Map(),
    frustumCulledByNode = new Map();
  let stackedLayerCamera = null,
    lastLayoutSignature = "",
    layout = null,
    renderRevision = 0,
    syncedRevision = -1,
    lastBounds = null,
    maxBoundHeight = 0;
  const lastProjectionMatrix = new three.Matrix4(),
    lastWorldInverse = new three.Matrix4(),
    scratchViewPosition = new three.Vector3(),
    scratchMatrix = new three.Matrix4(),
    stats = {
      active: false,
      floorCount: 0,
      preparations: 0,
    };
  let entryProgress = 1,
    entryScale = 1;
  const entryOffsetByFloorId = new Map(),
    entryCameraByFloorId = new Map(),
    entryOffsetMatrix = new three.Matrix4();
  function getActiveLayout() {
    const currentLayout = getLayout();
    if (!currentLayout.enabled || currentLayout.floors.length < 2 || currentLayout.amount <= 0)
      return null;
    const layoutSignature = JSON.stringify([
      currentLayout.gap,
      currentLayout.amount,
      currentLayout.center,
      currentLayout.floors.map((floor) => [floor.id, floor.elevation]),
    ]);
    return (
      layoutSignature !== lastLayoutSignature &&
        ((lastLayoutSignature = layoutSignature), (syncedRevision = -1)),
      (layout = currentLayout),
      currentLayout
    );
  }
  function restoreFrustumCulled() {
    for (const [culledNode, frustumCulled] of frustumCulledByNode)
      culledNode.frustumCulled = frustumCulled;
    frustumCulledByNode.clear();
  }
  function syncFloorCameras(renderCamera) {
    if (
      !layout ||
      (syncedRevision === renderRevision &&
        lastProjectionMatrix.equals(renderCamera.projectionMatrix) &&
        lastWorldInverse.equals(renderCamera.matrixWorldInverse))
    )
      return;
    (lastProjectionMatrix.copy(renderCamera.projectionMatrix),
      lastWorldInverse.copy(renderCamera.matrixWorldInverse),
      (syncedRevision = renderRevision));
    const sortedFloors = [...layout.floors].sort(
      (floorA, floorB) => floorA.elevation - floorB.elevation,
    );
    if (lastBounds !== layout.bounds) {
      ((lastBounds = layout.bounds), (maxBoundHeight = 0));
      for (const boundsList of layout.bounds?.values() || [])
        for (const boundsBox of boundsList) maxBoundHeight = Math.max(maxBoundHeight, boundsBox[1]);
    }
    const stackCenter = new three.Vector3(layout.center[0], maxBoundHeight / 2, layout.center[2]),
      topCenter = stackCenter.clone();
    ((topCenter.y += (sortedFloors.at(-1).elevation - sortedFloors[0].elevation) / 2),
      scratchViewPosition.copy(topCenter).applyMatrix4(renderCamera.matrixWorldInverse));
    const projectionElements = renderCamera.projectionMatrix.elements,
      projectedDepth =
        projectionElements[3] * scratchViewPosition.x +
        projectionElements[7] * scratchViewPosition.y +
        projectionElements[11] * scratchViewPosition.z +
        projectionElements[15],
      verticalScale = projectionElements[5] / Math.max(Math.abs(projectedDepth), 0.001),
      activeFloorIdSet = new Set();
    for (const [floorIndex, floorEntry] of sortedFloors.entries()) {
      activeFloorIdSet.add(floorEntry.id);
      let stackRecord = stackByFloorId.get(floorEntry.id);
      ((!stackRecord || stackRecord.camera.type !== renderCamera.type) &&
        ((stackRecord = {
          camera: renderCamera.clone(false),
          reflection: renderCamera.clone(false),
        }),
        stackByFloorId.set(floorEntry.id, stackRecord)),
        (stackRecord.height = floorIndex * layout.gap * layout.amount),
        stackRecord.camera.copy(renderCamera, false),
        stackProjection(
          three,
          renderCamera,
          stackRecord.height,
          0,
          stackRecord.camera.projectionMatrix,
        ),
        stackRecord.camera.projectionMatrixInverse
          .copy(stackRecord.camera.projectionMatrix)
          .invert(),
        stackRecord.reflection.copy(renderCamera, false),
        (stackRecord.reflection.position.y += stackRecord.height),
        stackRecord.reflection.updateMatrixWorld(true));
    }
    const layerOffset = Math.max(0, layout.gap) * Math.abs(verticalScale),
      middleIndex = (sortedFloors.length - 1) / 2,
      baseScreenPosition = stackCenter.project(renderCamera),
      topScreenPosition = topCenter.project(renderCamera),
      screenOffsetX = (topScreenPosition.x - baseScreenPosition.x) * layout.amount,
      screenOffsetY = (topScreenPosition.y - baseScreenPosition.y) * layout.amount;
    for (const [layerIndex, layerFloor] of sortedFloors.entries()) {
      const layerRecord = stackByFloorId.get(layerFloor.id),
        layerOffsetY = (layerIndex - middleIndex) * layerOffset * layout.amount;
      (layerRecord.camera.projectionMatrix.premultiply(
        scratchMatrix.makeTranslation(screenOffsetX, screenOffsetY + layerOffsetY, 0),
      ),
        layerRecord.camera.projectionMatrixInverse
          .copy(layerRecord.camera.projectionMatrix)
          .invert());
    }
    for (const staleFloorId of stackByFloorId.keys())
      activeFloorIdSet.has(staleFloorId) || stackByFloorId.delete(staleFloorId);
    (stats.preparations++, (stats.floorCount = stackByFloorId.size));
  }
  function cameraForFloor(floorId, sourceCamera = getCamera()) {
    return getActiveLayout()
      ? (sourceCamera.updateWorldMatrix(true, false),
        syncFloorCameras(sourceCamera),
        stackByFloorId.get(floorId)?.camera || sourceCamera)
      : sourceCamera;
  }
  return (
    (renderer.render = function (renderScene, layerCamera, ...renderRest) {
      const previousLayerCamera = stackedLayerCamera,
        isStackedLayer = renderScene === scene && layerCamera === getCamera(),
        originalOnBeforeRender = scene.onBeforeRender;
      let stackedOnBeforeRender;
      if (isStackedLayer) {
        if (entryProgress < 1) {
          const entryLayoutSnapshot = getLayout(),
            entrySortedFloors = [...entryLayoutSnapshot.floors].sort(
              (entryFloorA, entryFloorB) => entryFloorA.elevation - entryFloorB.elevation,
            ),
            isEntryStacked = entryLayoutSnapshot.amount > 0 && entrySortedFloors.length > 1;
          ((entryScale = isEntryStacked ? 1 : 0.96 + 0.04 * entryProgress),
            entryOffsetByFloorId.clear(),
            entrySortedFloors.forEach((entryFloor, entryFloorIndex) =>
              entryOffsetByFloorId.set(
                String(entryFloor.id),
                isEntryStacked
                  ? (entryFloorIndex - (entrySortedFloors.length - 1) / 2) *
                      0.035 *
                      (1 - entryProgress)
                  : 0,
              ),
            ));
        }
        ((stats.active = !!getActiveLayout()),
          renderRevision++,
          stats.active
            ? ((stackedOnBeforeRender = function (...hookArgs) {
                (originalOnBeforeRender?.apply(this, hookArgs),
                  hookArgs[2] === layerCamera &&
                    (syncFloorCameras(layerCamera),
                    scene.traverse((childNode) => {
                      !(
                        childNode.isMesh ||
                        childNode.isLine ||
                        childNode.isPoints ||
                        childNode.isSprite
                      ) ||
                        !overviewFloorId(childNode) ||
                        (frustumCulledByNode.has(childNode) ||
                          frustumCulledByNode.set(childNode, childNode.frustumCulled),
                        (childNode.frustumCulled = false));
                    })));
              }),
              (scene.onBeforeRender = stackedOnBeforeRender))
            : restoreFrustumCulled());
      }
      stackedLayerCamera = isStackedLayer ? layerCamera : null;
      try {
        return originalRender.call(this, renderScene, layerCamera, ...renderRest);
      } finally {
        ((stackedLayerCamera = previousLayerCamera),
          isStackedLayer &&
            (scene.onBeforeRender === stackedOnBeforeRender &&
              (scene.onBeforeRender = originalOnBeforeRender),
            restoreFrustumCulled()));
      }
    }),
    (renderer.renderBufferDirect = function (
      drawCamera,
      drawScene,
      geometry,
      material,
      object,
      group,
    ) {
      if (
        stackedLayerCamera === drawCamera &&
        drawScene === scene &&
        (stats.active &&
          (syncFloorCameras(drawCamera),
          (drawCamera = stackByFloorId.get(overviewFloorId(object))?.camera || drawCamera)),
        entryProgress < 1 && overviewFloorId(object))
      ) {
        const objectFloorId = overviewFloorId(object);
        let entryCameraRecord = entryCameraByFloorId.get(objectFloorId);
        ((!entryCameraRecord || entryCameraRecord.camera.type !== drawCamera.type) &&
          ((entryCameraRecord = {
            camera: drawCamera.clone(false),
            frame: -1,
          }),
          entryCameraByFloorId.set(objectFloorId, entryCameraRecord)),
          entryCameraRecord.frame !== renderRevision &&
            (entryCameraRecord.camera.copy(drawCamera, false),
            (entryCameraRecord.frame = renderRevision),
            entryOffsetMatrix.makeScale(entryScale, entryScale, 1),
            (entryOffsetMatrix.elements[13] = entryOffsetByFloorId.get(objectFloorId) || 0),
            entryCameraRecord.camera.projectionMatrix.premultiply(entryOffsetMatrix),
            entryCameraRecord.camera.projectionMatrixInverse
              .copy(entryCameraRecord.camera.projectionMatrix)
              .invert()),
          (drawCamera = entryCameraRecord.camera));
      }
      return originalRenderBufferDirect.call(
        this,
        drawCamera,
        drawScene,
        geometry,
        material,
        object,
        group,
      );
    }),
    {
      stats: stats,
      cameraForFloor: cameraForFloor,
      setEntryProgress(progressValue) {
        ((entryProgress = Math.max(0, Math.min(1, progressValue))),
          entryProgress === 1 && entryCameraByFloorId.clear());
      },
      rayForFloor(rayFloorId, pointer, ray) {
        const activeCamera = getCamera(),
          targetCamera = cameraForFloor(rayFloorId, activeCamera);
        if (targetCamera === activeCamera) return (ray.setFromCamera(pointer, activeCamera), ray);
        const nearPoint = new three.Vector3(pointer.x, pointer.y, -1).unproject(targetCamera),
          rayDirection = new three.Vector3(pointer.x, pointer.y, 1)
            .unproject(targetCamera)
            .sub(nearPoint)
            .normalize();
        return (ray.set(nearPoint, rayDirection), (ray.camera = targetCamera), ray);
      },
      reflectionCamera(baseCamera, objectRoot) {
        return baseCamera !== getCamera() || !getActiveLayout()
          ? baseCamera
          : (syncFloorCameras(baseCamera),
            stackByFloorId.get(overviewFloorId(objectRoot))?.reflection || baseCamera);
      },
      presentationPoint(projectFloorId, point) {
        const referenceCamera = getCamera(),
          floorCamera = cameraForFloor(projectFloorId, referenceCamera);
        return floorCamera === referenceCamera
          ? point
          : point.project(floorCamera).unproject(referenceCamera);
      },
      dispose() {
        (restoreFrustumCulled(),
          stackByFloorId.clear(),
          (renderer.render = originalRender),
          (renderer.renderBufferDirect = originalRenderBufferDirect));
      },
    }
  );
}
