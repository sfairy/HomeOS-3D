import { createReflectionDetail } from "../reflection/studio-reflection-detail";
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
/**
 * 「远景网格简化」控制器的外部依赖。
 * 除 THREE / renderer / scene 外都是回调：本模块只负责判断「哪些网格离得够近、值得换用简化几何」，
 * 取景与楼层归属都交给调用方，所以这里一律按回调描述。
 */
export type OverviewDetailOptions = {
  THREE: any;
  renderer: any;
  scene: any;
  /** 主相机；只有主相机渲染时才替换几何，阴影 / 反射等旁路渲染不受影响。 */
  getCamera: () => any;
  /** 网格所属楼层 id，用来复用同一层的投影矩阵。 */
  getFloorId?: (meshForFloor: any) => string;
  /** 某楼层对应的相机；默认复用主相机。 */
  getFloorCamera?: (meshForCamera: any, fallbackCamera: any) => any;
  /** 本帧是否启用简化。 */
  enabled: () => boolean;
  /** 简化几何准备就绪后请求下一帧。 */
  requestFrame?: () => void;
  /** 复用的反射简化器；不传则内部新建一个。 */
  detail?: any;
};

/** 诊断统计：前四项在构造时就存在，后三项由 begin() 每帧写入。 */
type OverviewDetailStats = {
  active: boolean;
  meshes: number;
  savedTriangles: number;
  cache: unknown;
  /** 本帧拿到简化几何的网格数。 */
  ready?: number;
  /** 本帧因像素误差超阈值被判定为近景、不该简化的网格数。 */
  near?: number;
  /** 本帧的开关状态快照。 */
  enabled?: boolean;
};

export function createOverviewDetail({
  THREE: three,
  renderer: renderer,
  getCamera: getCamera,
  getFloorCamera: getFloorCamera = (_floorMesh, floorCamera) => floorCamera,
  getFloorId: getFloorId = () => "",
  enabled: isEnabled,
  requestFrame: requestFrame = () => {},
  detail: detail,
}: OverviewDetailOptions) {
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
  const stats: OverviewDetailStats = {
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
