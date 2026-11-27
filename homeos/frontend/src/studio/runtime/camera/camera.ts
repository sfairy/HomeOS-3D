import { clampNumber, finiteNumberOr } from '@app/shared/util/number'
import { cameraSourceConfigured } from '../../platform/camera-binding-source'

/** 公网模块 URL 契约：实现位于 `platform/camera/camera-budget.ts`（platform 叶子层）。 */
export {
  createCameraRequestBudget,
  cameraRequestBudget,
  createCameraStreamBudget,
  cameraStreamBudget,
  withCameraHttpSlot,
} from '../../platform/camera/camera-budget'

/** 公网模块 URL 契约：实现位于 `platform/camera/camera-mjpeg.ts`（platform 叶子层）。 */
export {
  CAMERA_MJPEG_ERRORS,
  CameraMjpegError,
  parseMultipartBoundary,
  readMjpegFrames,
  createCameraMjpegStream,
} from '../../platform/camera/camera-mjpeg'

function clonePose(pose: any) {
  return Object.fromEntries(
    Object.entries(pose).map(([poseKey, poseField]) => [
      poseKey,
      Array.isArray(poseField) ? [...poseField] : poseField,
    ]),
  )
}
function readVector(three: any, sourceArray: any, fallbackArray: any) {
  return new three.Vector3(
    ...[0, 1, 2].map((axisIndex) => finiteNumberOr(sourceArray?.[axisIndex], fallbackArray[axisIndex])),
  )
}
function resolveCameraPose(threePose: any, poseConfig: any) {
  const targetVector = readVector(threePose, poseConfig.target, [0, 0, 0]),
    offsetVector = readVector(threePose, poseConfig.position, [0, 3, 6]).clone().sub(targetVector),
    distanceValue = Math.max(offsetVector.length(), 1e-8)
  offsetVector.lengthSq() < 1e-8 * 1e-8 && offsetVector.set(0, 0, 1), offsetVector.normalize()
  const upVector = readVector(threePose, poseConfig.up, [0, 1, 0])
  upVector.addScaledVector(offsetVector, -upVector.dot(offsetVector)),
    upVector.lengthSq() < 1e-8 * 1e-8 &&
      (upVector.set(0, Math.abs(offsetVector.y) < 0.9 ? 1 : 0, Math.abs(offsetVector.y) < 0.9 ? 0 : -1),
      upVector.addScaledVector(offsetVector, -upVector.dot(offsetVector))),
    upVector.normalize()
  const rightVector = upVector.clone().cross(offsetVector).normalize()
  upVector.crossVectors(offsetVector, rightVector).normalize()
  const rotationQuaternion = new threePose.Quaternion().setFromRotationMatrix(
    new threePose.Matrix4().makeBasis(rightVector, upVector, offsetVector),
  )
  return {
    target: targetVector,
    distance: distanceValue,
    rotation: rotationQuaternion,
  }
}
function readOrbitAngles(threeOrbit: any, viewPose: any, resolvedPose: any) {
  if (viewPose.view === 'top') return null
  const forwardVector = new threeOrbit.Vector3(0, 0, 1).applyQuaternion(resolvedPose.rotation)
  return Math.hypot(forwardVector.x, forwardVector.z) < 0.00001 ||
    new threeOrbit.Quaternion()
      .setFromRotationMatrix(
        new threeOrbit.Matrix4().lookAt(forwardVector, new threeOrbit.Vector3(), new threeOrbit.Vector3(0, 1, 0)),
      )
      .angleTo(resolvedPose.rotation) > 0.00001
    ? null
    : {
        theta: Math.atan2(forwardVector.x, forwardVector.z),
        phi: Math.acos(clampNumber(forwardVector.y, -1, 1)),
      }
}
function cameraMotionProgress(progressElapsedMs: any, progressDurationMs: any) {
  return progressDurationMs <= 0 || progressElapsedMs >= progressDurationMs
    ? 1
    : 1 - (1 - clampNumber(Number.isNaN(progressElapsedMs) ? 0 : progressElapsedMs / progressDurationMs, 0, 1)) ** 3
}
const DEFAULT_SETTLE_EPSILON = 0.0001,
  SETTLE_WINDOW_MS = 500,
  FLOOR_SETTLE_MS = 900,
  FLOOR_SETTLE_WINDOW_MS = 300,
  RELEASE_WINDOW_MS = 80
function computeReleaseEasing(releaseElapsedMs: any) {
  const clampedElapsedMs = Math.max(0, finiteNumberOr(releaseElapsedMs, 0))
  if (clampedElapsedMs >= RELEASE_WINDOW_MS) return clampedElapsedMs - RELEASE_WINDOW_MS / 2
  const releaseRatio = clampedElapsedMs / RELEASE_WINDOW_MS
  return RELEASE_WINDOW_MS * releaseRatio ** 3 * (1 - releaseRatio / 2)
}

export function createDampedCameraMotion(
  threeDamping: any,
  dampedFromPose: any,
  dampedToPose: any,
  { immediate: isImmediateStart = false, owner: ownerKind = 'focus', floorFrame: floorFrame = null }: any = {},
) {
  const isFocusOwner = ownerKind === 'focus',
    moveRatePerSecond = ownerKind === 'floor' ? 8 : isFocusOwner ? 5 : 6,
    turnRatePerSecond = ownerKind === 'floor' ? 7 : isFocusOwner ? 4 : 5,
    settleEpsilon = DEFAULT_SETTLE_EPSILON,
    isFloorOwner = ownerKind === 'floor',
    settleWindowMs = isFloorOwner ? FLOOR_SETTLE_WINDOW_MS : SETTLE_WINDOW_MS,
    decayFactor = (decayElapsedMs: any, decayRatePerSecond: any) =>
      Math.exp((-decayRatePerSecond * Math.max(0, finiteNumberOr(decayElapsedMs, 0))) / 1000),
    isDampingSettled = (dampingElapsedMs: any) =>
      isImmediateStart ||
      (isFloorOwner
        ? dampingElapsedMs >= FLOOR_SETTLE_MS
        : decayFactor(dampingElapsedMs, turnRatePerSecond) <= settleEpsilon),
    dampingTailMs = isFloorOwner
      ? FLOOR_SETTLE_MS - settleWindowMs
      : (-Math.log(settleEpsilon) * 1000) / turnRatePerSecond - settleWindowMs,
    resolveTailEasing = isFocusOwner ? computeReleaseEasing : (easingElapsedMs: any) => easingElapsedMs,
    dampedProgress = (dampedElapsedMs: any, dampedRatePerSecond = moveRatePerSecond) => {
      if (isDampingSettled(dampedElapsedMs)) return 1
      if ((!isFocusOwner && !isFloorOwner) || dampedElapsedMs <= dampingTailMs)
        return 1 - decayFactor(resolveTailEasing(dampedElapsedMs), dampedRatePerSecond)
      const tailRatio = clampNumber((dampedElapsedMs - dampingTailMs) / settleWindowMs, 0, 1),
        tailRemaining = 1 - tailRatio,
        rateWindowRatio = (dampedRatePerSecond * settleWindowMs) / 1000,
        tailEaseValue =
          tailRemaining ** 3 *
          (1 +
            (3 - rateWindowRatio) * tailRatio +
            (6 - 3 * rateWindowRatio + 0.5 * rateWindowRatio * rateWindowRatio) * tailRatio * tailRatio)
      return 1 - decayFactor(resolveTailEasing(dampingTailMs), dampedRatePerSecond) * tailEaseValue
    },
    dampedEasing = {
      settled: isDampingSettled,
      move: (dampedMoveMs: any) => dampedProgress(dampedMoveMs),
      turn: (dampedTurnMs: any) => dampedProgress(dampedTurnMs, turnRatePerSecond),
    }
  return {
    settled: isDampingSettled,
    progress: dampedEasing.move,
    sample: createFocusCameraSampler(
      threeDamping,
      dampedFromPose,
      dampedToPose,
      0,
      isFocusOwner ? 'focus-orbit' : ownerKind,
      floorFrame,
      dampedEasing,
    ),
  }
}

function createFocusCameraSampler(
  threeFrame: any,
  initialPose: any,
  targetPose: any,
  motionDurationMs = 1100,
  motionMode = 'focus',
  floorPivotFrame: any = null,
  easingHooks: any = null,
) {
  ;(initialPose = clonePose(initialPose)), (targetPose = clonePose(targetPose))
  const resolvedDurationMs = Math.max(0, finiteNumberOr(motionDurationMs, 1100))
  let fromPose, toPose, pivotFrame: any, orbitAngles: any
  return function (sampleTimeMs: any) {
    const sampleElapsed = Number.isNaN(sampleTimeMs) ? 0 : sampleTimeMs
    if (
      easingHooks ? easingHooks.settled(sampleElapsed) : resolvedDurationMs === 0 || sampleElapsed >= resolvedDurationMs
    )
      return clonePose(targetPose)
    if (!(sampleElapsed > 0)) return clonePose(initialPose)
    ;(fromPose ||= resolveCameraPose(threeFrame, initialPose)), (toPose ||= resolveCameraPose(threeFrame, targetPose))
    const moveProgress = easingHooks
        ? easingHooks.move(sampleElapsed)
        : cameraMotionProgress(sampleElapsed, resolvedDurationMs),
      turnProgress = easingHooks ? easingHooks.turn(sampleElapsed) : moveProgress,
      slerpedRotation = fromPose.rotation.clone().slerp(toPose.rotation, turnProgress).normalize()
    if (motionMode === 'focus-orbit') {
      if (orbitAngles === undefined) {
        const fromOrbitAngles = readOrbitAngles(threeFrame, initialPose, fromPose),
          toOrbitAngles = readOrbitAngles(threeFrame, targetPose, toPose)
        orbitAngles =
          fromOrbitAngles && toOrbitAngles
            ? {
                start: fromOrbitAngles,
                end: toOrbitAngles,
                deltaTheta: Math.atan2(
                  Math.sin(toOrbitAngles.theta - fromOrbitAngles.theta),
                  Math.cos(toOrbitAngles.theta - fromOrbitAngles.theta),
                ),
              }
            : null
      }
      if (orbitAngles) {
        const { start: startOrbitAngles, end: endOrbitAngles, deltaTheta: orbitDeltaTheta } = orbitAngles,
          orbitDirection = new threeFrame.Vector3().setFromSphericalCoords(
            1,
            startOrbitAngles.phi + (endOrbitAngles.phi - startOrbitAngles.phi) * turnProgress,
            startOrbitAngles.theta + orbitDeltaTheta * turnProgress,
          )
        slerpedRotation.setFromRotationMatrix(
          new threeFrame.Matrix4().lookAt(orbitDirection, new threeFrame.Vector3(), new threeFrame.Vector3(0, 1, 0)),
        )
      }
    }
    let interpolatedTarget = fromPose.target.clone().lerp(toPose.target, moveProgress)
    const interpolatedDistance = Math.max(
      1e-8,
      fromPose.distance + (toPose.distance - fromPose.distance) * moveProgress,
    )
    let interpolatedPosition = new threeFrame.Vector3(0, 0, interpolatedDistance)
      .applyQuaternion(slerpedRotation)
      .add(interpolatedTarget)
    if (motionMode === 'floor' && floorPivotFrame?.fromPivot && floorPivotFrame?.toPivot) {
      if (!pivotFrame) {
        const fromPivotVector = readVector(threeFrame, floorPivotFrame.fromPivot, [0, 0, 0]),
          toPivotVector = readVector(threeFrame, floorPivotFrame.toPivot, [0, 0, 0]),
          toPivotLocalPoint = (worldPoint: any, pivotPoint: any, pivotRotation: any) =>
            readVector(threeFrame, worldPoint, [0, 0, 0])
              .sub(pivotPoint)
              .applyQuaternion(pivotRotation.clone().invert())
        pivotFrame = {
          fromPivot: fromPivotVector,
          toPivot: toPivotVector,
          fromPosition: toPivotLocalPoint(initialPose.position, fromPivotVector, fromPose.rotation),
          toPosition: toPivotLocalPoint(targetPose.position, toPivotVector, toPose.rotation),
          fromTarget: toPivotLocalPoint(initialPose.target, fromPivotVector, fromPose.rotation),
          toTarget: toPivotLocalPoint(targetPose.target, toPivotVector, toPose.rotation),
        }
      }
      const pivotVector = pivotFrame.fromPivot.clone().lerp(pivotFrame.toPivot, moveProgress)
      ;(interpolatedPosition = pivotFrame.fromPosition
        .clone()
        .lerp(pivotFrame.toPosition, moveProgress)
        .applyQuaternion(slerpedRotation)
        .add(pivotVector)),
        (interpolatedTarget = pivotFrame.fromTarget
          .clone()
          .lerp(pivotFrame.toTarget, moveProgress)
          .applyQuaternion(slerpedRotation)
          .add(pivotVector))
    }
    const animatedUpVector = new threeFrame.Vector3(0, 1, 0).applyQuaternion(slerpedRotation).normalize(),
      sampledPose = {
        ...clonePose(initialPose),
        ...clonePose(targetPose),
        position: interpolatedPosition.toArray(),
        target: interpolatedTarget.toArray(),
        up: animatedUpVector.toArray(),
      }
    for (const [poseKeyName, poseKeyDefault] of [
      ['zoom', 1],
      ['focalLength', 50],
      ['frameSize', 10],
    ])
      if (poseKeyName in initialPose || poseKeyName in targetPose) {
        const fromKeyValue = finiteNumberOr(initialPose[poseKeyName], poseKeyDefault),
          toKeyValue = finiteNumberOr(targetPose[poseKeyName], poseKeyDefault)
        ;(sampledPose as any)[poseKeyName] = fromKeyValue + (toKeyValue - fromKeyValue) * moveProgress
      }
    return sampledPose
  }
}
function clipRayToBounds(threeModule: any, rayOrigin: any, rayDirection: any, maxTravelDistance: any): any {
  let travelDistance = maxTravelDistance
  for (const axisName of ['x', 'y', 'z'])
    if (Math.abs(rayDirection[axisName]) > 1e-8) {
      const axisLimit = Math.sign(rayDirection[axisName]) * 10000
      travelDistance = Math.min(travelDistance, Math.max(0, (axisLimit - rayOrigin[axisName]) / rayDirection[axisName]))
    }
  return travelDistance < 1e-8
    ? (rayDirection.copy(rayOrigin).negate(),
      rayDirection.lengthSq() < 1e-8 && rayDirection.set(0, 0, 1),
      rayDirection.normalize(),
      clipRayToBounds(threeModule, rayOrigin, rayDirection, Math.min(maxTravelDistance, 10000)))
    : rayOrigin.clone().addScaledVector(rayDirection, travelDistance)
}
export function automaticLightCamera(threeLight: any, lightConfig: any, lightTarget: any) {
  const lightOptions = lightConfig || {},
    { distance: lightDistance, rotation: lightRotation } = resolveCameraPose(threeLight, lightOptions),
    lightTargetPoint = readVector(threeLight, lightTarget, [0, 0, 0]).clampScalar(-10000, 10000),
    isPerspectiveMode = lightOptions.mode === 'perspective',
    lightForwardDirection = new threeLight.Vector3(0, 0, 1).applyQuaternion(lightRotation).normalize(),
    lightRayLength = isPerspectiveMode ? Math.max(3, lightDistance * 0.5) : Math.max(3, lightDistance),
    lightPositionPoint = clipRayToBounds(threeLight, lightTargetPoint, lightForwardDirection, lightRayLength),
    lightViewDirection = lightPositionPoint.clone().sub(lightTargetPoint).normalize(),
    lightUpCandidate = readVector(threeLight, lightOptions.up, [0, 1, 0]),
    lightUpLength = lightUpCandidate.length(),
    hasUsableUp =
      lightUpLength > 1e-8 &&
      lightUpCandidate.clone().divideScalar(lightUpLength).cross(lightViewDirection).lengthSq() > 1e-8 * 1e-8,
    lightUpVector = hasUsableUp
      ? lightUpCandidate
      : new threeLight.Vector3(0, 1, 0).applyQuaternion(lightRotation).normalize(),
    lightCameraPose = {
      mode: isPerspectiveMode ? 'perspective' : 'orthographic',
      position: lightPositionPoint.toArray(),
      target: lightTargetPoint.toArray(),
      up: lightUpVector.toArray(),
      zoom: clampNumber(finiteNumberOr(lightOptions.zoom, 1) * (isPerspectiveMode ? 1 : 2.2), 0.01, 100),
      frameSize: clampNumber(finiteNumberOr(lightOptions.frameSize, 10), 0.001, 20000),
      focalLength: clampNumber(finiteNumberOr(lightOptions.focalLength, 50), 18, 120),
      view: lightOptions.view === 'top' ? 'top' : 'free',
      topRotation: clampNumber(finiteNumberOr(lightOptions.topRotation, 0), 0, 360),
    }
  if (!hasUsableUp) {
    const correctedLightPose = resolveCameraPose(threeLight, lightCameraPose)
    lightCameraPose.up = new threeLight.Vector3(0, 1, 0)
      .applyQuaternion(correctedLightPose.rotation)
      .normalize()
      .toArray()
  }
  return lightCameraPose
}
export function automaticAirConditionerCamera(
  threeConditioner: any,
  conditionerConfig: any,
  conditionerTarget: any,
  conditionerDirection: any,
  conditionerFrameWeight: any,
  { minimumFrameSize: minimumFrameSize = 3, minimumDistance: minimumDistance = 3 } = {},
) {
  const conditionerOptions = conditionerConfig || {},
    conditionerTargetPoint = readVector(threeConditioner, conditionerTarget, [0, 0, 0]).clampScalar(-10000, 10000),
    flatDirection = readVector(threeConditioner, conditionerDirection, [0, 0, 1])
  flatDirection.y = 0
  const directionMagnitude = Math.max(Math.abs(flatDirection.x), Math.abs(flatDirection.z))
  directionMagnitude < 1e-8 ? flatDirection.set(0, 0, 1) : flatDirection.divideScalar(directionMagnitude).normalize()
  const unitUpVector = new threeConditioner.Vector3(0, 1, 0),
    elevatedDirection = flatDirection.clone().addScaledVector(unitUpVector, 0.38).normalize(),
    lateralDirection = unitUpVector.clone().cross(elevatedDirection).normalize(),
    verticalDirection = elevatedDirection.clone().cross(lateralDirection).normalize(),
    frameWeightVector = readVector(threeConditioner, conditionerFrameWeight, [0.9, 0.28, 0.22])
  for (const weightAxisName of ['x', 'y', 'z'])
    frameWeightVector[weightAxisName] = clampNumber(Math.abs(frameWeightVector[weightAxisName]), 0.01, 10000)
  const weightedExtent = (extentDirection: any) =>
      Math.abs(extentDirection.x) * frameWeightVector.x +
      Math.abs(extentDirection.y) * frameWeightVector.y +
      Math.abs(extentDirection.z) * frameWeightVector.z,
    viewportAspect = clampNumber(
      finiteNumberOr(conditionerOptions.aspect, finiteNumberOr(conditionerOptions.viewportAspect, 1.6)),
      0.25,
      4,
    ),
    verticalExtent = weightedExtent(verticalDirection),
    lateralExtent = weightedExtent(lateralDirection),
    forwardExtent = weightedExtent(elevatedDirection),
    frameSizeValue = clampNumber(
      Math.max(minimumFrameSize, verticalExtent * 2.1, (lateralExtent / viewportAspect) * 1.8),
      minimumFrameSize,
      20000,
    ),
    isConditionerPerspective = conditionerOptions.mode === 'perspective',
    focalLengthMm = 35,
    cameraDistance = clampNumber(
      isConditionerPerspective
        ? frameSizeValue * Math.max(viewportAspect, 1) + forwardExtent * 0.5
        : forwardExtent * 0.5 + 2,
      minimumDistance,
      10000,
    )
  let conditionerPosition = clipRayToBounds(
    threeConditioner,
    conditionerTargetPoint,
    elevatedDirection.clone(),
    cameraDistance,
  )
  if (conditionerPosition.distanceTo(conditionerTargetPoint) < minimumDistance - 1e-8) {
    const fallbackDirection = new threeConditioner.Vector3(
      -Math.sign(conditionerTargetPoint.x),
      -Math.sign(conditionerTargetPoint.y) * 0.38,
      -Math.sign(conditionerTargetPoint.z),
    )
    Math.abs(fallbackDirection.x) + Math.abs(fallbackDirection.z) < 1e-8 && (fallbackDirection.z = 1),
      (conditionerPosition = clipRayToBounds(
        threeConditioner,
        conditionerTargetPoint,
        fallbackDirection.normalize(),
        cameraDistance,
      ))
  }
  return {
    mode: isConditionerPerspective ? 'perspective' : 'orthographic',
    position: conditionerPosition.toArray(),
    target: conditionerTargetPoint.toArray(),
    up: unitUpVector.toArray(),
    zoom: 1,
    frameSize: frameSizeValue,
    focalLength: focalLengthMm,
    view: 'free',
    topRotation: 0,
  }
}

/**
 * 车辆聚焦相机（0.8.1）：车模比室内机小得多，先按空调相机的算法收紧取景，
 * 再在「竖屏 + 打开弹窗」时沿竖直方向把画面下移，让车落在弹窗上方的可视区。
 * `portraitPanel` 由调用方判定（车辆、非仅聚焦、弹窗无自定义锚点、画布竖屏）。
 */
export function automaticVehicleCamera(
  threeVehicle: unknown,
  vehicleConfig: { aspect?: unknown; viewportAspect?: unknown } | null | undefined,
  vehicleTarget: unknown,
  vehicleDirection: unknown,
  vehicleFrameWeight: unknown,
  { portraitPanel: portraitPanel = false }: { portraitPanel?: boolean } = {},
) {
  const vehicleCamera = automaticAirConditionerCamera(
    threeVehicle,
    vehicleConfig,
    vehicleTarget,
    vehicleDirection,
    vehicleFrameWeight,
    { minimumFrameSize: 0.7, minimumDistance: 0.6 },
  )
  if (!portraitPanel) return vehicleCamera
  const cameraPosition = readVector(threeVehicle, vehicleCamera.position, [0, 3, 6]),
    cameraTargetPoint = readVector(threeVehicle, vehicleCamera.target, [0, 0, 0]),
    viewDirection = cameraPosition.clone().sub(cameraTargetPoint).normalize(),
    cameraUpVector = readVector(threeVehicle, vehicleCamera.up, [0, 1, 0])
  // 相机 up 未必与视线正交：先投影掉视线分量，否则偏移会把画面带歪。
  cameraUpVector.addScaledVector(viewDirection, -cameraUpVector.dot(viewDirection)).normalize()
  const viewportAspect = clampNumber(
      finiteNumberOr(vehicleConfig?.aspect, finiteNumberOr(vehicleConfig?.viewportAspect, 1.6)),
      0.25,
      4,
    ),
    shiftLength =
      vehicleCamera.mode === 'perspective'
        ? (cameraPosition.distanceTo(cameraTargetPoint) * 35) /
          (Math.max(viewportAspect, 1) * (vehicleCamera.focalLength || 35))
        : vehicleCamera.frameSize,
    verticalShift = cameraUpVector.multiplyScalar(-shiftLength * 0.22)
  // 偏移量要夹在场景 ±10000 的世界边界内（按分量比例缩放，方向不变）。
  let shiftRatio = 1
  for (const shiftPoint of [cameraPosition, cameraTargetPoint])
    for (const shiftAxis of ['x', 'y', 'z'])
      Math.abs(verticalShift[shiftAxis]) > 1e-8 &&
        (shiftRatio = Math.min(
          shiftRatio,
          Math.max(0, (Math.sign(verticalShift[shiftAxis]) * 10000 - shiftPoint[shiftAxis]) / verticalShift[shiftAxis]),
        ))
  return {
    ...vehicleCamera,
    position: cameraPosition.addScaledVector(verticalShift, shiftRatio).toArray(),
    target: cameraTargetPoint.addScaledVector(verticalShift, shiftRatio).toArray(),
  }
}


// 判定本体在 platform（app 侧也要用），这里再导出一次，runtime 内部沿用同一入口。
export { cameraSourceConfigured }

export function cameraOnline(entityStateOrEvent: any) {
  const entityState = entityStateOrEvent?.newState || entityStateOrEvent,
    normalizedState = String(entityState?.state || '')
      .trim()
      .toLowerCase()
  return (
    entityState?.available !== false &&
    !!normalizedState &&
    !['unknown', 'unavailable', 'none'].includes(normalizedState)
  )
}
export function createCameraStatus({ THREE: three, requestFrame: onRequestFrame = () => {} }: any) {
  const statusByBindingId = new Map(),
    meshGeometry = new three.SphereGeometry(1, 10, 8),
    makeFloorModelKey = (floorId: any, modelId: any) => JSON.stringify([floorId, modelId])
  let previousRoot: any,
    previousRevision: any,
    previousSignature: any,
    isDisposed = false
  const disposeStatusEntry = (statusEntry: any) => {
    statusEntry.mesh.removeFromParent(), statusEntry.mesh.material.dispose()
  }
  function syncCameraStatus({
    root: modelRoot,
    revision: sceneRevision,
    bindings: cameraBindings = [],
    states: statesByEntityId = {},
    enabled: isEnabled = false,
    brightness: brightnessLevel = 1,
  }: any) {
    if (isDisposed) return
    let hasChanged = false
    const bindingsSignature = JSON.stringify(
      cameraBindings.map((binding: any) => [
        binding.id,
        binding.floorId,
        binding.modelId,
        binding.width,
        binding.height,
        binding.depth,
        // 换来源（entity ↔ go2rtc）或改地址都必须重新同步，否则同一模型上会留着旧状态。
        binding.cameraSource,
        binding.go2rtcUrl,
      ]),
    )
    if (previousRoot !== modelRoot || previousRevision !== sceneRevision || previousSignature !== bindingsSignature) {
      ;(previousRoot = modelRoot), (previousRevision = sceneRevision), (previousSignature = bindingsSignature)
      const modelsByFloorModelKey = new Map()
      previousRoot?.traverse((sceneObject: any) => {
        if (sceneObject.userData?.environmentModelType !== 'camera') return
        let resolvedFloorId = sceneObject.userData.environmentFloorId
        for (
          let ancestorObject = sceneObject.parent;
          resolvedFloorId == null && ancestorObject;
          ancestorObject = ancestorObject.parent
        )
          resolvedFloorId = ancestorObject.userData.environmentFloorId
        modelsByFloorModelKey.set(
          makeFloorModelKey(resolvedFloorId, sceneObject.userData.environmentModelId),
          sceneObject,
        )
      })
      const matchedBindingIdSet = new Set()
      for (const activeBinding of cameraBindings) {
        const modelObject = modelsByFloorModelKey.get(makeFloorModelKey(activeBinding.floorId, activeBinding.modelId))
        if (!modelObject) continue
        matchedBindingIdSet.add(activeBinding.id)
        let existingStatusEntry = statusByBindingId.get(activeBinding.id)
        if (existingStatusEntry?.model !== modelObject) {
          existingStatusEntry && disposeStatusEntry(existingStatusEntry)
          const statusMaterial = new three.MeshBasicMaterial({
              color: 7830916,
              toneMapped: false,
              transparent: true,
              depthWrite: false,
            }),
            statusMesh = new three.Mesh(meshGeometry, statusMaterial)
          ;(statusMesh.name = 'camera-status-' + activeBinding.id),
            Object.assign(statusMesh.userData, {
              environmentEffect: true,
              cameraStatus: true,
              externalModelSharedGeometry: true,
              externalModelSharedMaterial: true,
            }),
            (statusMesh.raycast = () => {}),
            modelObject.add(statusMesh),
            (existingStatusEntry = {
              model: modelObject,
              mesh: statusMesh,
            }),
            statusByBindingId.set(activeBinding.id, existingStatusEntry),
            (hasChanged = true)
        }
        existingStatusEntry.mesh.position.set(0, activeBinding.height * 0.84, activeBinding.depth * 0.475),
          existingStatusEntry.mesh.scale.setScalar(Math.max(0.003, activeBinding.width * 0.027))
      }
      for (const [bindingId, staleStatusEntry] of statusByBindingId)
        matchedBindingIdSet.has(bindingId) ||
          (disposeStatusEntry(staleStatusEntry), statusByBindingId.delete(bindingId), (hasChanged = true))
    }
    for (const renderBinding of cameraBindings) {
      const renderStatusEntry = statusByBindingId.get(renderBinding.id)
      if (!renderStatusEntry) continue
      const isVisible = isEnabled && cameraSourceConfigured(renderBinding),
        // go2rtc 来源没有 HA 实体状态可用，在线色只在实体来源上叠加。
        statusColorHex =
          renderBinding.cameraSource !== 'go2rtc' && cameraOnline(statesByEntityId[renderBinding.entityId])
            ? 8571275
            : 7830916
      ;(hasChanged =
        hasChanged ||
        renderStatusEntry.mesh.visible !== isVisible ||
        renderStatusEntry.mesh.material.color.getHex() !== statusColorHex ||
        renderStatusEntry.mesh.material.opacity !== brightnessLevel),
        (renderStatusEntry.mesh.visible = isVisible),
        renderStatusEntry.mesh.material.color.setHex(statusColorHex),
        (renderStatusEntry.mesh.material.opacity = brightnessLevel)
    }
    hasChanged && onRequestFrame()
  }
  return {
    sync: syncCameraStatus,
    dispose() {
      if (!isDisposed) {
        isDisposed = true
        for (const disposedStatusEntry of statusByBindingId.values()) disposeStatusEntry(disposedStatusEntry)
        statusByBindingId.clear(), meshGeometry.dispose()
      }
    },
  }
}

/**
 * 摄像头弹窗里 go2rtc 播放地址的前端预校验（运行时入口）。
 *
 * 实现在 `platform/go2rtc-url.ts` —— 保存草稿前的整体预校验（app 层）与运行时摄像头挂载
 * 都要用同一份规则，而 app ↛ runtime 是硬边界，所以事实放在 platform。这里保留同名模块
 * 只是为了让 `modules/runtime/camera/go2rtc-url.js` 继续作为构建入口存在
 * （清单白名单按文件生成，路径不能消失）。
 */
export { validateGo2rtcDocument, validateGo2rtcUrl } from '@/studio/platform/go2rtc-url'
