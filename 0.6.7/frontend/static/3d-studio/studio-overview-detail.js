import { createReflectionDetail } from "./studio-reflection-detail.js?v=20260929-runtime-surface-v1-20260928-overview-detail-v1";
function createFloorMetric(metricThree) {
  return {
    matrix: new metricThree.Matrix4(),
    sphere: new metricThree.Sphere(),
    lengths: [0, 0],
    wr: 0,
  };
}
function refreshFloorMetric(floorMetric, viewCamera) {
  const projectionElements = floorMetric.matrix.multiplyMatrices(
    viewCamera.projectionMatrix,
    viewCamera.matrixWorldInverse,
  ).elements;
  floorMetric.wr = Math.hypot(projectionElements[3], projectionElements[7], projectionElements[11]);
  for (let axisIndex = 0; axisIndex < 2; axisIndex++)
    floorMetric.lengths[axisIndex] = Math.hypot(
      projectionElements[axisIndex],
      projectionElements[axisIndex + 4],
      projectionElements[axisIndex + 8],
    );
  return floorMetric;
}
function computeMeshPixelError(errorMesh, errorMetric, viewportWidth, viewportHeight, worldError) {
  const meshGeometry = errorMesh.geometry;
  meshGeometry.boundingSphere || meshGeometry.computeBoundingSphere();
  const worldSphere = errorMetric.sphere
      .copy(meshGeometry.boundingSphere)
      .applyMatrix4(errorMesh.matrixWorld),
    frustumElements = errorMetric.matrix.elements,
    sphereCenter = worldSphere.center,
    wRowLength = errorMetric.wr,
    viewDepth =
      frustumElements[3] * sphereCenter.x +
      frustumElements[7] * sphereCenter.y +
      frustumElements[11] * sphereCenter.z +
      frustumElements[15],
    depthMargin = Math.abs(viewDepth) - worldSphere.radius * wRowLength;
  if (depthMargin <= 0.001) return Infinity;
  const axisPixelError = (axis, viewportExtent) => {
    const axisLength = errorMetric.lengths[axis],
      axisExtent =
        Math.abs(
          frustumElements[axis] * sphereCenter.x +
            frustumElements[axis + 4] * sphereCenter.y +
            frustumElements[axis + 8] * sphereCenter.z +
            frustumElements[axis + 12],
        ) +
        worldSphere.radius * axisLength;
    return (
      viewportExtent *
      0.5 *
      worldError *
      (axisLength / depthMargin + (axisExtent * wRowLength) / (depthMargin * depthMargin))
    );
  };
  return Math.max(axisPixelError(0, viewportWidth), axisPixelError(1, viewportHeight));
}
export function detailPixelError(
  detailThree,
  targetMesh,
  detailCamera,
  outputWidth,
  outputHeight,
  pixelWorldError,
) {
  return computeMeshPixelError(
    targetMesh,
    refreshFloorMetric(createFloorMetric(detailThree), detailCamera),
    outputWidth,
    outputHeight,
    pixelWorldError,
  );
}
export function createOverviewDetail({
  THREE: three,
  renderer: renderer,
  scene: scene,
  getCamera: getCamera,
  getFloorCamera: getFloorCamera = (floorMesh, floorCamera) => floorCamera,
  getFloorId: getFloorId = () => "",
  enabled: isEnabled,
  requestFrame: requestFrame = () => {},
  detail: detail,
}) {
  const reflectionDetail =
      detail ||
      createReflectionDetail({
        THREE: three,
        worldError: 0.003,
        ratio: 0.55,
        maxBytes: 8388608,
        requestFrame: requestFrame,
      }),
    originalRender = renderer.render,
    originalRenderBufferDirect = renderer.renderBufferDirect;
  let renderedGeometrySet = new WeakSet();
  const savedGeometryByMesh = new Map(),
    resetRenderedGeometrySet = () => {
      renderedGeometrySet = new WeakSet();
    };
  renderer.domElement?.addEventListener?.("webglcontextlost", resetRenderedGeometrySet);
  let simplifiableMeshes = [],
    lastPreparedScene,
    lastPreparedCamera,
    isDisposed = false;
  const stats = {
      active: false,
      meshes: 0,
      savedTriangles: 0,
      cache: reflectionDetail.stats,
    },
    drawingBufferSize = new three.Vector2(),
    metricByFloorId = new Map();
  let frameCount = 0;
  function restoreSavedGeometries() {
    for (const [cachedMesh, cachedGeometry] of savedGeometryByMesh)
      cachedMesh.geometry = cachedGeometry;
    savedGeometryByMesh.clear();
  }
  return (
    (renderer.render = function (...renderArgs) {
      const savedGeometrySnapshot = [...savedGeometryByMesh].map(
        ([snapshotMesh, snapshotGeometry]) => [
          snapshotMesh,
          snapshotGeometry,
          snapshotMesh.geometry,
        ],
      );
      restoreSavedGeometries();
      try {
        return originalRender.apply(this, renderArgs);
      } finally {
        restoreSavedGeometries();
        for (const [
          restoreMesh,
          restoreSavedGeometry,
          restoreOriginalGeometry,
        ] of savedGeometrySnapshot)
          (savedGeometryByMesh.set(restoreMesh, restoreSavedGeometry),
            (restoreMesh.geometry = restoreOriginalGeometry));
      }
    }),
    (renderer.renderBufferDirect = function (
      drawCamera,
      drawScene,
      drawGeometry,
      drawMaterial,
      renderObject,
      renderGroup,
    ) {
      const savedMeshGeometry = savedGeometryByMesh.get(renderObject);
      savedMeshGeometry &&
        (drawMaterial.isMeshDepthMaterial || drawMaterial.isMeshDistanceMaterial) &&
        (drawGeometry = savedMeshGeometry);
      const renderResult = originalRenderBufferDirect.call(
        this,
        drawCamera,
        drawScene,
        drawGeometry,
        drawMaterial,
        renderObject,
        renderGroup,
      );
      return (
        !savedMeshGeometry &&
          renderObject.geometry === drawGeometry &&
          renderedGeometrySet.add(drawGeometry),
        renderResult
      );
    }),
    {
      stats: stats,
      prepare(prepareScene, prepareCamera) {
        isDisposed ||
          (prepareScene === lastPreparedScene && prepareCamera === lastPreparedCamera) ||
          ((lastPreparedScene = prepareScene),
          (lastPreparedCamera = prepareCamera),
          (simplifiableMeshes = []),
          metricByFloorId.clear(),
          prepareScene?.traverse((sceneChild) => {
            sceneChild.userData?.reflectionSimplifiable &&
              sceneChild.isMesh &&
              simplifiableMeshes.push({
                mesh: sceneChild,
                floor: getFloorId(sceneChild),
              });
          }),
          prepareScene && reflectionDetail.prepare(prepareScene));
      },
      begin(beginCamera) {
        if (
          (restoreSavedGeometries(),
          (stats.active = false),
          (stats.meshes = stats.savedTriangles = 0),
          (stats.ready = 0),
          (stats.near = 0),
          (stats.enabled = isEnabled()),
          !(isDisposed || beginCamera !== getCamera() || !stats.enabled))
        ) {
          (renderer.getDrawingBufferSize(drawingBufferSize), frameCount++);
          for (const { mesh: candidateMesh, floor: candidateFloorId } of simplifiableMeshes) {
            if (!renderedGeometrySet.has(candidateMesh.geometry)) continue;
            let isVisible = true;
            for (let scopeNode = candidateMesh; scopeNode; scopeNode = scopeNode.parent)
              if (!scopeNode.visible) {
                isVisible = false;
                break;
              }
            if (!isVisible) continue;
            const detailGeometry = reflectionDetail.get(candidateMesh);
            if (!detailGeometry) continue;
            stats.ready++;
            let cachedFloorMetric = metricByFloorId.get(candidateFloorId);
            if (
              (cachedFloorMetric ||
                ((cachedFloorMetric = createFloorMetric(three)),
                metricByFloorId.set(candidateFloorId, cachedFloorMetric)),
              cachedFloorMetric.frame !== frameCount &&
                (refreshFloorMetric(cachedFloorMetric, getFloorCamera(candidateMesh, beginCamera)),
                (cachedFloorMetric.frame = frameCount)),
              computeMeshPixelError(
                candidateMesh,
                cachedFloorMetric,
                drawingBufferSize.x,
                drawingBufferSize.y,
                0.003,
              ) > 0.55)
            ) {
              stats.near++;
              continue;
            }
            const originalMeshGeometry = candidateMesh.geometry;
            (savedGeometryByMesh.set(candidateMesh, originalMeshGeometry),
              (candidateMesh.geometry = detailGeometry),
              stats.meshes++,
              (stats.savedTriangles +=
                (originalMeshGeometry.index.count - detailGeometry.index.count) / 3));
          }
          stats.active = stats.meshes > 0;
        }
      },
      dispose() {
        ((isDisposed = true),
          restoreSavedGeometries(),
          reflectionDetail.dispose(),
          (simplifiableMeshes = []),
          metricByFloorId.clear(),
          renderer.domElement?.removeEventListener?.("webglcontextlost", resetRenderedGeometrySet),
          (renderer.render = originalRender),
          (renderer.renderBufferDirect = originalRenderBufferDirect));
      },
    }
  );
}
