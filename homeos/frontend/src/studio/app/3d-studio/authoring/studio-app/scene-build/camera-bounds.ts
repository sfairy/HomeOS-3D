import type { StudioAppRuntime } from '../runtime/studio-app-runtime'
import * as ns2 from '/static/vendor/three/0.187.0/three.module.min.js'
import {
  axisLockedPoint as axisLockedPoint2,
  clamp as clamp2,
  distance as distance2,
  snapPoint as snapPoint2,
} from '../../../plan/geometry'
import { finite as finite2 } from '../../../loaders/studio-normalization'
import type { UpdateCameraViewOptions } from '../../types/studio-app-types'
import { minPointDistance } from '../../scene/payload/studio-scene-payload'

export function isDescendantOfRoot(runtime: StudioAppRuntime, ancestorStartNode: any, ancestorStopSet: any) {
  for (
    let isDescendantOfRootAncestorNode = ancestorStartNode;
    isDescendantOfRootAncestorNode && isDescendantOfRootAncestorNode !== runtime.appCtx.sceneRootNode;
    isDescendantOfRootAncestorNode = isDescendantOfRootAncestorNode.parent
  )
    if (ancestorStopSet.has(isDescendantOfRootAncestorNode.userData?.modelLayer)) return true
  return false
}

export function computeSceneBounds(
  runtime: StudioAppRuntime,
  { excludeModelLayers: excludeModelLayers = null }: any = {},
) {
  const sceneBoundsBox = new ns2.Box3()
  return (
    runtime.appCtx.sceneRootNode.updateWorldMatrix(true, true),
    runtime.appCtx.sceneRootNode.traverse((boundsMeshNode: any) => {
      if (
        !(
          !boundsMeshNode.isMesh ||
          ['background', 'grid', 'light-source-preview'].includes(boundsMeshNode.userData?.exportRole)
        ) &&
        !(excludeModelLayers && runtime.isDescendantOfRoot(boundsMeshNode, excludeModelLayers))
      ) {
        if (boundsMeshNode.isInstancedMesh) {
          boundsMeshNode.computeBoundingBox(),
            boundsMeshNode.boundingBox &&
              sceneBoundsBox.union(boundsMeshNode.boundingBox.clone().applyMatrix4(boundsMeshNode.matrixWorld))
          return
        }
        boundsMeshNode.geometry.computeBoundingBox(),
          boundsMeshNode.geometry.boundingBox &&
            sceneBoundsBox.union(boundsMeshNode.geometry.boundingBox.clone().applyMatrix4(boundsMeshNode.matrixWorld))
      }
    }),
    sceneBoundsBox
  )
}

export function computeSceneExtent(runtime: StudioAppRuntime) {
  if (
    !runtime.appCtx.isGroundShadowEnabled ||
    !runtime.appCtx.mainDirectionalLight?.shadow?.camera ||
    !runtime.appCtx.sceneRootNode
  )
    return false
  const qu4 = runtime.computeSceneBounds()
  if (qu4.isEmpty()) return false
  runtime.appCtx.sceneRootNode.updateWorldMatrix(true, true),
    runtime.appCtx.mainDirectionalLight.updateWorldMatrix(true, false),
    runtime.appCtx.mainDirectionalLight.target.updateWorldMatrix(true, false)
  const camera3 = runtime.appCtx.mainDirectionalLight.shadow.camera,
    setFromMatrixPosition = new ns2.Vector3().setFromMatrixPosition(runtime.appCtx.mainDirectionalLight.matrixWorld),
    setFromMatrixPosition2 = new ns2.Vector3().setFromMatrixPosition(
      runtime.appCtx.mainDirectionalLight.target.matrixWorld,
    )
  camera3.position.copy(setFromMatrixPosition), camera3.lookAt(setFromMatrixPosition2), camera3.updateMatrixWorld(true)
  const sceneMinPoint = new ns2.Vector3(Infinity, Infinity, Infinity),
    sceneMaxPoint = new ns2.Vector3(-Infinity, -Infinity, -Infinity)
  for (const sceneBoundsX of [qu4.min.x, qu4.max.x])
    for (const sceneBoundsY of [qu4.min.y, qu4.max.y])
      for (const sceneBoundsZ of [qu4.min.z, qu4.max.z]) {
        const matrix4 = new ns2.Vector3(sceneBoundsX, sceneBoundsY, sceneBoundsZ).applyMatrix4(
          camera3.matrixWorldInverse,
        )
        sceneMinPoint.min(matrix4), sceneMaxPoint.max(matrix4)
      }
  const sceneSpan = Math.max(sceneMaxPoint.x - sceneMinPoint.x, sceneMaxPoint.y - sceneMinPoint.y, 1),
    groundExtent = Math.max(minPointDistance, sceneSpan * 0.05),
    sceneMinDepth = -sceneMaxPoint.z,
    sceneMaxDepth = -sceneMinPoint.z,
    shadowExtent = Math.max(minPointDistance, (sceneMaxDepth - sceneMinDepth) * 0.08)
  return (
    (camera3.left = sceneMinPoint.x - groundExtent),
    (camera3.right = sceneMaxPoint.x + groundExtent),
    (camera3.bottom = sceneMinPoint.y - groundExtent),
    (camera3.top = sceneMaxPoint.y + groundExtent),
    (camera3.near = Math.max(0.1, sceneMinDepth - shadowExtent)),
    (camera3.far = Math.max(camera3.near + 1, sceneMaxDepth + shadowExtent)),
    camera3.updateProjectionMatrix(),
    (runtime.appCtx.mainDirectionalLight.shadow.needsUpdate = true),
    true
  )
}

export function updateCameraView(runtime: StudioAppRuntime, cameraViewOptions: UpdateCameraViewOptions = {}) {
  if (!runtime.appCtx.threeCamera || !runtime.appCtx.orbitControls) return
  const viewMode =
      cameraViewOptions.view === 'top' ? 'top' : cameraViewOptions.view === 'free' ? 'free' : runtime.getCameraView(),
    qn3 = runtime.getCameraTopRotation(),
    isShowingAllFloors = runtime.getPreviewFloorMode() === 'all',
    cameraViewPpm = runtime.getPixelsPerMeter() || 100,
    qu5 = runtime.getSceneContentBounds(),
    ug2 = runtime.computeCourtyardBounds(),
    qu6 =
      ug2 ||
      runtime.computeSceneBounds({
        excludeModelLayers: new Set(['items', 'lights']),
      }),
    size2 = (isShowingAllFloors || ug2) && !qu6.isEmpty() ? qu6.getSize(new ns2.Vector3()) : null,
    sceneCenterVector = qu6.isEmpty() ? null : qu6.getCenter(new ns2.Vector3()),
    cameraTargetRadius = size2
      ? clamp2(Math.max(size2.x, size2.z), 5, 100)
      : clamp2(Math.max(qu5.width, qu5.height) / cameraViewPpm, 5, 35),
    sceneHeight = size2
      ? size2.y
      : Math.max(0, ...runtime.appCtx.studioState.walls.map((viewWall) => viewWall.height || 0)),
    cameraViewOptionsCameraDistance = Math.max(cameraTargetRadius * 1.18, cameraTargetRadius + sceneHeight * 0.32)
  ;(runtime.appCtx.threeCamera.userData.frameSize = cameraViewOptionsCameraDistance),
    (runtime.appCtx.threeCamera.userData.cameraView = viewMode),
    (runtime.appCtx.threeCamera.userData.topRotation = qn3)
  const cameraTarget = sceneCenterVector
    ? new ns2.Vector3(sceneCenterVector.x, sceneCenterVector.y, sceneCenterVector.z)
    : new ns2.Vector3(0, Math.min(0.78, cameraTargetRadius * 0.055), 0)
  let cameraDistanceResult
  if (runtime.appCtx.threeCamera.isPerspectiveCamera) {
    ;(runtime.appCtx.threeCamera.aspect = runtime.appCtx.threeCamera.userData.viewportAspect || 1),
      runtime.applyCameraFocalLength()
    const cameraFovDistance =
      cameraViewOptionsCameraDistance /
      (2 * Math.tan(ns2.MathUtils.degToRad(runtime.appCtx.threeCamera.getEffectiveFOV()) / 2))
    cameraDistanceResult = Math.max(cameraFovDistance * 1.04, cameraTargetRadius * 1.65, 8)
  } else
    runtime.applyOrthoFrame(cameraViewOptionsCameraDistance, runtime.appCtx.threeCamera.userData.viewportAspect || 1),
      (cameraDistanceResult = Math.max(cameraTargetRadius * 3.2, 18))
  if (viewMode === 'top')
    runtime.appCtx.threeCamera.up.copy(runtime.buildCameraUpVector(qn3)),
      runtime.appCtx.threeCamera.position.set(cameraTarget.x, cameraTarget.y + cameraDistanceResult, cameraTarget.z)
  else {
    runtime.appCtx.threeCamera.up.set(0, 1, 0)
    const normalize2 = new ns2.Vector3(1.08, 1.7, 1.12).normalize()
    runtime.appCtx.threeCamera.position.copy(cameraTarget).addScaledVector(normalize2, cameraDistanceResult)
  }
  runtime.updateCameraPlanes(runtime.appCtx.threeCamera, cameraTarget),
    (runtime.appCtx.threeCamera.zoom = 1),
    runtime.appCtx.threeCamera.lookAt(cameraTarget),
    runtime.appCtx.threeCamera.updateProjectionMatrix(),
    runtime.appCtx.orbitControls.target.copy(cameraTarget),
    runtime.requestStudioRender(),
    runtime.appCtx.orbitControls.update()
}

export function axisLockedDistance(
  runtime: StudioAppRuntime,
  dragStartPoint: any,
  dragEndPoint: any,
  isShiftPressed = false,
) {
  const measurePpm = runtime.getPixelsPerMeter() || 100
  if (!runtime.isSnapEnabled()) {
    if (isShiftPressed && dragEndPoint) {
      const axisLockedPoint = axisLockedPoint2(dragStartPoint, dragEndPoint)
      return {
        ...axisLockedPoint,
        kind: 'axis',
        distance: distance2(dragStartPoint, axisLockedPoint.point),
      }
    }
    return {
      point: {
        ...dragStartPoint,
      },
      kind: null as any,
      label: '',
      distance: 0,
    }
  }
  const settings = runtime.appCtx.studioState.settings
  return snapPoint2(dragStartPoint, runtime.appCtx.studioState.walls, {
    zoom: runtime.appCtx.planView.zoom,
    screenTolerance: clamp2(Math.round(finite2(settings.snapTolerance, 13)), 6, 24),
    anchor: dragEndPoint,
    forceOrthogonalAxis: isShiftPressed,
    preferVerticalAxis: settings.snapOrthogonal !== false,
    angleStepDegrees: 15,
    gridSize: measurePpm * 0.1,
    intersections: settings.snapIntersections === false ? [] : runtime.computeWallIntersections(measurePpm),
    snapEndpoints: settings.snapEndpoints !== false,
    snapIntersections: settings.snapIntersections !== false,
    snapSegments: settings.snapSegments !== false,
    snapOrthogonal: settings.snapOrthogonal !== false,
    snapAngles: settings.snapAngles !== false,
    snapGrid: settings.snapGrid !== false,
  })
}

export function formatMeasurement(runtime: StudioAppRuntime, measurementRecord = runtime.appCtx.snapHit) {
  if (!runtime.appCtx.snapEndpointPoint || runtime.appCtx.wallSegmentCount < 2 || !measurementRecord?.point)
    return false
  const measurementTolerance = Math.max(1, (runtime.getPixelsPerMeter() || 100) * 0.01)
  return (
    measurementRecord.kind === 'endpoint' &&
    distance2(measurementRecord.point, runtime.appCtx.snapEndpointPoint) <= measurementTolerance
  )
}
