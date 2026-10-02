const clampNumber = (inputNumber, minimumNumber, maximumNumber) =>
    Math.max(minimumNumber, Math.min(maximumNumber, inputNumber)),
  finiteNumberOr = (candidateNumber, fallbackNumber) =>
    Number.isFinite(candidateNumber) ? candidateNumber : fallbackNumber;
function clonePose(pose) {
  return Object.fromEntries(
    Object.entries(pose).map(([poseKey, poseField]) => [
      poseKey,
      Array.isArray(poseField) ? [...poseField] : poseField,
    ]),
  );
}
function readVector(three, sourceArray, fallbackArray) {
  return new three.Vector3(
    ...[0, 1, 2].map((axisIndex) =>
      finiteNumberOr(sourceArray?.[axisIndex], fallbackArray[axisIndex]),
    ),
  );
}
function resolveCameraPose(threePose, poseConfig) {
  const targetVector = readVector(threePose, poseConfig.target, [0, 0, 0]),
    offsetVector = readVector(threePose, poseConfig.position, [0, 3, 6]).clone().sub(targetVector),
    distanceValue = Math.max(offsetVector.length(), 1e-8);
  (offsetVector.lengthSq() < 1e-8 * 1e-8 && offsetVector.set(0, 0, 1), offsetVector.normalize());
  const upVector = readVector(threePose, poseConfig.up, [0, 1, 0]);
  (upVector.addScaledVector(offsetVector, -upVector.dot(offsetVector)),
    upVector.lengthSq() < 1e-8 * 1e-8 &&
      (upVector.set(
        0,
        Math.abs(offsetVector.y) < 0.9 ? 1 : 0,
        Math.abs(offsetVector.y) < 0.9 ? 0 : -1,
      ),
      upVector.addScaledVector(offsetVector, -upVector.dot(offsetVector))),
    upVector.normalize());
  const rightVector = upVector.clone().cross(offsetVector).normalize();
  upVector.crossVectors(offsetVector, rightVector).normalize();
  const rotationQuaternion = new threePose.Quaternion().setFromRotationMatrix(
    new threePose.Matrix4().makeBasis(rightVector, upVector, offsetVector),
  );
  return {
    target: targetVector,
    distance: distanceValue,
    rotation: rotationQuaternion,
  };
}
function readOrbitAngles(threeOrbit, viewPose, resolvedPose) {
  if (viewPose.view === "top") return null;
  const forwardVector = new threeOrbit.Vector3(0, 0, 1).applyQuaternion(resolvedPose.rotation);
  return Math.hypot(forwardVector.x, forwardVector.z) < 0.00001 ||
    new threeOrbit.Quaternion()
      .setFromRotationMatrix(
        new threeOrbit.Matrix4().lookAt(
          forwardVector,
          new threeOrbit.Vector3(),
          new threeOrbit.Vector3(0, 1, 0),
        ),
      )
      .angleTo(resolvedPose.rotation) > 0.00001
    ? null
    : {
        theta: Math.atan2(forwardVector.x, forwardVector.z),
        phi: Math.acos(clampNumber(forwardVector.y, -1, 1)),
      };
}
function cameraMotionProgress(progressElapsedMs, progressDurationMs) {
  return progressDurationMs <= 0 || progressElapsedMs >= progressDurationMs
    ? 1
    : 1 -
        (1 -
          clampNumber(
            Number.isNaN(progressElapsedMs) ? 0 : progressElapsedMs / progressDurationMs,
            0,
            1,
          )) **
          3;
}
const DEFAULT_SETTLE_EPSILON = 0.0001,
  SETTLE_WINDOW_MS = 500,
  FLOOR_SETTLE_MS = 900,
  FLOOR_SETTLE_WINDOW_MS = 300,
  RELEASE_WINDOW_MS = 80;
function computeReleaseEasing(releaseElapsedMs) {
  const clampedElapsedMs = Math.max(0, finiteNumberOr(releaseElapsedMs, 0));
  if (clampedElapsedMs >= RELEASE_WINDOW_MS) return clampedElapsedMs - RELEASE_WINDOW_MS / 2;
  const releaseRatio = clampedElapsedMs / RELEASE_WINDOW_MS;
  return RELEASE_WINDOW_MS * releaseRatio ** 3 * (1 - releaseRatio / 2);
}

export function createDampedCameraMotion(
  threeDamping,
  dampedFromPose,
  dampedToPose,
  {
    immediate: isImmediateStart = false,
    owner: ownerKind = "focus",
    floorFrame: floorFrame = null,
  } = {},
) {
  const isFocusOwner = ownerKind === "focus",
    moveRatePerSecond = ownerKind === "floor" ? 8 : isFocusOwner ? 5 : 6,
    turnRatePerSecond = ownerKind === "floor" ? 7 : isFocusOwner ? 4 : 5,
    settleEpsilon = DEFAULT_SETTLE_EPSILON,
    isFloorOwner = ownerKind === "floor",
    settleWindowMs = isFloorOwner ? FLOOR_SETTLE_WINDOW_MS : SETTLE_WINDOW_MS,
    decayFactor = (decayElapsedMs, decayRatePerSecond) =>
      Math.exp((-decayRatePerSecond * Math.max(0, finiteNumberOr(decayElapsedMs, 0))) / 1000),
    isDampingSettled = (dampingElapsedMs) =>
      isImmediateStart ||
      (isFloorOwner
        ? dampingElapsedMs >= FLOOR_SETTLE_MS
        : decayFactor(dampingElapsedMs, turnRatePerSecond) <= settleEpsilon),
    dampingTailMs = isFloorOwner
      ? FLOOR_SETTLE_MS - settleWindowMs
      : (-Math.log(settleEpsilon) * 1000) / turnRatePerSecond - settleWindowMs,
    resolveTailEasing = isFocusOwner ? computeReleaseEasing : (easingElapsedMs) => easingElapsedMs,
    dampedProgress = (dampedElapsedMs, dampedRatePerSecond = moveRatePerSecond) => {
      if (isDampingSettled(dampedElapsedMs)) return 1;
      if ((!isFocusOwner && !isFloorOwner) || dampedElapsedMs <= dampingTailMs)
        return 1 - decayFactor(resolveTailEasing(dampedElapsedMs), dampedRatePerSecond);
      const tailRatio = clampNumber((dampedElapsedMs - dampingTailMs) / settleWindowMs, 0, 1),
        tailRemaining = 1 - tailRatio,
        rateWindowRatio = (dampedRatePerSecond * settleWindowMs) / 1000,
        tailEaseValue =
          tailRemaining ** 3 *
          (1 +
            (3 - rateWindowRatio) * tailRatio +
            (6 - 3 * rateWindowRatio + 0.5 * rateWindowRatio * rateWindowRatio) *
              tailRatio *
              tailRatio);
      return 1 - decayFactor(resolveTailEasing(dampingTailMs), dampedRatePerSecond) * tailEaseValue;
    },
    dampedEasing = {
      settled: isDampingSettled,
      move: (dampedMoveMs) => dampedProgress(dampedMoveMs),
      turn: (dampedTurnMs) => dampedProgress(dampedTurnMs, turnRatePerSecond),
    };
  return {
    settled: isDampingSettled,
    progress: dampedEasing.move,
    sample: createFocusCameraSampler(
      threeDamping,
      dampedFromPose,
      dampedToPose,
      0,
      isFocusOwner ? "focus-orbit" : ownerKind,
      floorFrame,
      dampedEasing,
    ),
  };
}

function createFocusCameraSampler(
  threeFrame,
  initialPose,
  targetPose,
  motionDurationMs = 1100,
  motionMode = "focus",
  floorPivotFrame = null,
  easingHooks = null,
) {
  ((initialPose = clonePose(initialPose)), (targetPose = clonePose(targetPose)));
  const resolvedDurationMs = Math.max(0, finiteNumberOr(motionDurationMs, 1100));
  let fromPose, toPose, pivotFrame, orbitAngles;
  return function (sampleTimeMs) {
    const sampleElapsed = Number.isNaN(sampleTimeMs) ? 0 : sampleTimeMs;
    if (
      easingHooks
        ? easingHooks.settled(sampleElapsed)
        : resolvedDurationMs === 0 || sampleElapsed >= resolvedDurationMs
    )
      return clonePose(targetPose);
    if (!(sampleElapsed > 0)) return clonePose(initialPose);
    ((fromPose ||= resolveCameraPose(threeFrame, initialPose)),
      (toPose ||= resolveCameraPose(threeFrame, targetPose)));
    const moveProgress = easingHooks
        ? easingHooks.move(sampleElapsed)
        : cameraMotionProgress(sampleElapsed, resolvedDurationMs),
      turnProgress = easingHooks ? easingHooks.turn(sampleElapsed) : moveProgress,
      slerpedRotation = fromPose.rotation.clone().slerp(toPose.rotation, turnProgress).normalize();
    if (motionMode === "focus-orbit") {
      if (orbitAngles === undefined) {
        const fromOrbitAngles = readOrbitAngles(threeFrame, initialPose, fromPose),
          toOrbitAngles = readOrbitAngles(threeFrame, targetPose, toPose);
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
            : null;
      }
      if (orbitAngles) {
        const {
            start: startOrbitAngles,
            end: endOrbitAngles,
            deltaTheta: orbitDeltaTheta,
          } = orbitAngles,
          orbitDirection = new threeFrame.Vector3().setFromSphericalCoords(
            1,
            startOrbitAngles.phi + (endOrbitAngles.phi - startOrbitAngles.phi) * turnProgress,
            startOrbitAngles.theta + orbitDeltaTheta * turnProgress,
          );
        slerpedRotation.setFromRotationMatrix(
          new threeFrame.Matrix4().lookAt(
            orbitDirection,
            new threeFrame.Vector3(),
            new threeFrame.Vector3(0, 1, 0),
          ),
        );
      }
    }
    let interpolatedTarget = fromPose.target.clone().lerp(toPose.target, moveProgress);
    const interpolatedDistance = Math.max(
      1e-8,
      fromPose.distance + (toPose.distance - fromPose.distance) * moveProgress,
    );
    let interpolatedPosition = new threeFrame.Vector3(0, 0, interpolatedDistance)
      .applyQuaternion(slerpedRotation)
      .add(interpolatedTarget);
    if (motionMode === "floor" && floorPivotFrame?.fromPivot && floorPivotFrame?.toPivot) {
      if (!pivotFrame) {
        const fromPivotVector = readVector(threeFrame, floorPivotFrame.fromPivot, [0, 0, 0]),
          toPivotVector = readVector(threeFrame, floorPivotFrame.toPivot, [0, 0, 0]),
          toPivotLocalPoint = (worldPoint, pivotPoint, pivotRotation) =>
            readVector(threeFrame, worldPoint, [0, 0, 0])
              .sub(pivotPoint)
              .applyQuaternion(pivotRotation.clone().invert());
        pivotFrame = {
          fromPivot: fromPivotVector,
          toPivot: toPivotVector,
          fromPosition: toPivotLocalPoint(initialPose.position, fromPivotVector, fromPose.rotation),
          toPosition: toPivotLocalPoint(targetPose.position, toPivotVector, toPose.rotation),
          fromTarget: toPivotLocalPoint(initialPose.target, fromPivotVector, fromPose.rotation),
          toTarget: toPivotLocalPoint(targetPose.target, toPivotVector, toPose.rotation),
        };
      }
      const pivotVector = pivotFrame.fromPivot.clone().lerp(pivotFrame.toPivot, moveProgress);
      ((interpolatedPosition = pivotFrame.fromPosition
        .clone()
        .lerp(pivotFrame.toPosition, moveProgress)
        .applyQuaternion(slerpedRotation)
        .add(pivotVector)),
        (interpolatedTarget = pivotFrame.fromTarget
          .clone()
          .lerp(pivotFrame.toTarget, moveProgress)
          .applyQuaternion(slerpedRotation)
          .add(pivotVector)));
    }
    const animatedUpVector = new threeFrame.Vector3(0, 1, 0)
        .applyQuaternion(slerpedRotation)
        .normalize(),
      sampledPose = {
        ...clonePose(initialPose),
        ...clonePose(targetPose),
        position: interpolatedPosition.toArray(),
        target: interpolatedTarget.toArray(),
        up: animatedUpVector.toArray(),
      };
    for (const [poseKeyName, poseKeyDefault] of [
      ["zoom", 1],
      ["focalLength", 50],
      ["frameSize", 10],
    ])
      if (poseKeyName in initialPose || poseKeyName in targetPose) {
        const fromKeyValue = finiteNumberOr(initialPose[poseKeyName], poseKeyDefault),
          toKeyValue = finiteNumberOr(targetPose[poseKeyName], poseKeyDefault);
        sampledPose[poseKeyName] = fromKeyValue + (toKeyValue - fromKeyValue) * moveProgress;
      }
    return sampledPose;
  };
}
function clipRayToBounds(threeModule, rayOrigin, rayDirection, maxTravelDistance) {
  let travelDistance = maxTravelDistance;
  for (const axisName of ["x", "y", "z"])
    if (Math.abs(rayDirection[axisName]) > 1e-8) {
      const axisLimit = Math.sign(rayDirection[axisName]) * 10000;
      travelDistance = Math.min(
        travelDistance,
        Math.max(0, (axisLimit - rayOrigin[axisName]) / rayDirection[axisName]),
      );
    }
  return travelDistance < 1e-8
    ? (rayDirection.copy(rayOrigin).negate(),
      rayDirection.lengthSq() < 1e-8 && rayDirection.set(0, 0, 1),
      rayDirection.normalize(),
      clipRayToBounds(threeModule, rayOrigin, rayDirection, Math.min(maxTravelDistance, 10000)))
    : rayOrigin.clone().addScaledVector(rayDirection, travelDistance);
}
export function automaticLightCamera(threeLight, lightConfig, lightTarget) {
  const lightOptions = lightConfig || {},
    { distance: lightDistance, rotation: lightRotation } = resolveCameraPose(
      threeLight,
      lightOptions,
    ),
    lightTargetPoint = readVector(threeLight, lightTarget, [0, 0, 0]).clampScalar(-10000, 10000),
    isPerspectiveMode = lightOptions.mode === "perspective",
    lightForwardDirection = new threeLight.Vector3(0, 0, 1)
      .applyQuaternion(lightRotation)
      .normalize(),
    lightRayLength = isPerspectiveMode
      ? Math.max(3, lightDistance * 0.5)
      : Math.max(3, lightDistance),
    lightPositionPoint = clipRayToBounds(
      threeLight,
      lightTargetPoint,
      lightForwardDirection,
      lightRayLength,
    ),
    lightViewDirection = lightPositionPoint.clone().sub(lightTargetPoint).normalize(),
    lightUpCandidate = readVector(threeLight, lightOptions.up, [0, 1, 0]),
    lightUpLength = lightUpCandidate.length(),
    hasUsableUp =
      lightUpLength > 1e-8 &&
      lightUpCandidate.clone().divideScalar(lightUpLength).cross(lightViewDirection).lengthSq() >
        1e-8 * 1e-8,
    lightUpVector = hasUsableUp
      ? lightUpCandidate
      : new threeLight.Vector3(0, 1, 0).applyQuaternion(lightRotation).normalize(),
    lightCameraPose = {
      mode: isPerspectiveMode ? "perspective" : "orthographic",
      position: lightPositionPoint.toArray(),
      target: lightTargetPoint.toArray(),
      up: lightUpVector.toArray(),
      zoom: clampNumber(
        finiteNumberOr(lightOptions.zoom, 1) * (isPerspectiveMode ? 1 : 2.2),
        0.01,
        100,
      ),
      frameSize: clampNumber(finiteNumberOr(lightOptions.frameSize, 10), 0.001, 20000),
      focalLength: clampNumber(finiteNumberOr(lightOptions.focalLength, 50), 18, 120),
      view: lightOptions.view === "top" ? "top" : "free",
      topRotation: clampNumber(finiteNumberOr(lightOptions.topRotation, 0), 0, 360),
    };
  if (!hasUsableUp) {
    const correctedLightPose = resolveCameraPose(threeLight, lightCameraPose);
    lightCameraPose.up = new threeLight.Vector3(0, 1, 0)
      .applyQuaternion(correctedLightPose.rotation)
      .normalize()
      .toArray();
  }
  return lightCameraPose;
}
export function automaticAirConditionerCamera(
  threeConditioner,
  conditionerConfig,
  conditionerTarget,
  conditionerDirection,
  conditionerFrameWeight,
  { minimumFrameSize: minimumFrameSize = 3, minimumDistance: minimumDistance = 3 } = {},
) {
  const conditionerOptions = conditionerConfig || {},
    conditionerTargetPoint = readVector(threeConditioner, conditionerTarget, [0, 0, 0]).clampScalar(
      -10000,
      10000,
    ),
    flatDirection = readVector(threeConditioner, conditionerDirection, [0, 0, 1]);
  flatDirection.y = 0;
  const directionMagnitude = Math.max(Math.abs(flatDirection.x), Math.abs(flatDirection.z));
  directionMagnitude < 1e-8
    ? flatDirection.set(0, 0, 1)
    : flatDirection.divideScalar(directionMagnitude).normalize();
  const unitUpVector = new threeConditioner.Vector3(0, 1, 0),
    elevatedDirection = flatDirection.clone().addScaledVector(unitUpVector, 0.38).normalize(),
    lateralDirection = unitUpVector.clone().cross(elevatedDirection).normalize(),
    verticalDirection = elevatedDirection.clone().cross(lateralDirection).normalize(),
    frameWeightVector = readVector(threeConditioner, conditionerFrameWeight, [0.9, 0.28, 0.22]);
  for (const weightAxisName of ["x", "y", "z"])
    frameWeightVector[weightAxisName] = clampNumber(
      Math.abs(frameWeightVector[weightAxisName]),
      0.01,
      10000,
    );
  const weightedExtent = (extentDirection) =>
      Math.abs(extentDirection.x) * frameWeightVector.x +
      Math.abs(extentDirection.y) * frameWeightVector.y +
      Math.abs(extentDirection.z) * frameWeightVector.z,
    viewportAspect = clampNumber(
      finiteNumberOr(
        conditionerOptions.aspect,
        finiteNumberOr(conditionerOptions.viewportAspect, 1.6),
      ),
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
    isConditionerPerspective = conditionerOptions.mode === "perspective",
    focalLengthMm = 35,
    cameraDistance = clampNumber(
      isConditionerPerspective
        ? frameSizeValue * Math.max(viewportAspect, 1) + forwardExtent * 0.5
        : forwardExtent * 0.5 + 2,
      minimumDistance,
      10000,
    );
  let conditionerPosition = clipRayToBounds(
    threeConditioner,
    conditionerTargetPoint,
    elevatedDirection.clone(),
    cameraDistance,
  );
  if (conditionerPosition.distanceTo(conditionerTargetPoint) < minimumDistance - 1e-8) {
    const fallbackDirection = new threeConditioner.Vector3(
      -Math.sign(conditionerTargetPoint.x),
      -Math.sign(conditionerTargetPoint.y) * 0.38,
      -Math.sign(conditionerTargetPoint.z),
    );
    (Math.abs(fallbackDirection.x) + Math.abs(fallbackDirection.z) < 1e-8 &&
      (fallbackDirection.z = 1),
      (conditionerPosition = clipRayToBounds(
        threeConditioner,
        conditionerTargetPoint,
        fallbackDirection.normalize(),
        cameraDistance,
      )));
  }
  return {
    mode: isConditionerPerspective ? "perspective" : "orthographic",
    position: conditionerPosition.toArray(),
    target: conditionerTargetPoint.toArray(),
    up: unitUpVector.toArray(),
    zoom: 1,
    frameSize: frameSizeValue,
    focalLength: focalLengthMm,
    view: "free",
    topRotation: 0,
  };
}
