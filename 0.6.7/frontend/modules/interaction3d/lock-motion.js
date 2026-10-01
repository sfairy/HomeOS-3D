import { lockState } from "./lock-state.js";
export function createLockMotion(options) {
  const motionByMesh = new Map(),
    outlineFlaggedMeshSet = new Set(),
    bumpOutlineRevision = (outlineObject) => {
      outlineObject?.userData &&
        (outlineObject.userData.environmentOutlineRevision =
          (outlineObject.userData.environmentOutlineRevision || 0) + 1);
    },
    stashedMotionByMesh = new WeakMap();
  let modelRoot = options.modelRoot,
    lastTickTime = null,
    meshListRevision,
    doorMeshList = null;
  const isUnderModelRoot = (node) => {
    for (let walkNode = node; walkNode; walkNode = walkNode.parent)
      if (walkNode === modelRoot) return true;
    return false;
  };
  function applyRollerTranslation(rollerMesh, translationValue) {
    rollerMesh.position.y = translationValue;
    const openTranslation = Number(
      rollerMesh.userData?.doorRollerOpenTranslation ??
        rollerMesh.parent?.userData?.doorRollerOpenTranslation,
    );
    rollerMesh.scale &&
      openTranslation > 0 &&
      (rollerMesh.scale.y = Math.max(0.001, 1 - translationValue / openTranslation));
  }
  function reset() {
    for (const [mesh, motion] of motionByMesh)
      (motion.kind === "slide"
        ? (mesh.position.x = motion.rest)
        : motion.kind === "roller"
          ? applyRollerTranslation(mesh, motion.rest)
          : (mesh.rotation.y = motion.rest),
        bumpOutlineRevision(mesh.parent));
    for (const flaggedMesh of outlineFlaggedMeshSet)
      delete flaggedMesh.userData.environmentOutlineMoving;
    (outlineFlaggedMeshSet.clear(),
      motionByMesh.clear(),
      (lastTickTime = null),
      (doorMeshList = null));
  }
  function findDoorModel(parentObject, candidateDoorModels) {
    return candidateDoorModels.find(
      (model) =>
        model.modelId === parentObject?.userData?.environmentModelId &&
        model.floorId === parentObject?.userData?.environmentFloorId,
    );
  }
  function resolveTarget(doorModel, parent, meshObject, entityStates) {
    const animationType = parent.userData?.doorAnimationType || "entry";
    if (animationType === "static") return null;
    const doorOpen = lockState(doorModel, entityStates).doorOpen;
    if (doorOpen === null) return null;
    if (animationType === "sliding") {
      if (Number.isFinite(meshObject.userData?.doorSlideSide)) {
        const direction = doorModel.openDirection === -1 ? -1 : 1;
        return {
          kind: "slide",
          value:
            doorOpen && meshObject.userData.doorSlideSide === -direction
              ? direction * meshObject.userData.doorSlideTravel
              : 0,
        };
      }
      const slideOpenTranslation = Number(parent.userData?.doorSlideOpenTranslation),
        slideClosedTranslation = Number(parent.userData?.doorSlideClosedTranslation ?? 0);
      return Number.isFinite(slideOpenTranslation)
        ? {
            kind: "slide",
            value: doorOpen
              ? slideOpenTranslation * (doorModel.openDirection ?? 1)
              : slideClosedTranslation,
          }
        : null;
    }
    if (animationType === "roller") {
      const rollerOpenTranslation = Number(
          parent.userData?.doorRollerOpenTranslation ??
            meshObject.userData?.doorRollerOpenTranslation,
        ),
        rollerClosedTranslation = Number(parent.userData?.doorRollerClosedTranslation ?? 0);
      return Number.isFinite(rollerOpenTranslation)
        ? {
            kind: "roller",
            value: doorOpen ? rollerOpenTranslation : rollerClosedTranslation,
          }
        : null;
    }
    const doorOpenRotation = Number(
      meshObject.userData?.doorOpenRotation ?? parent.userData?.doorOpenRotation,
    );
    if (Number.isFinite(doorOpenRotation)) {
      const openAngle = Number(doorModel.openAngle),
        angleRadians = Number.isFinite(openAngle)
          ? (Math.abs(openAngle) * Math.PI) / 180
          : Math.abs(doorOpenRotation);
      return {
        kind: "hinge",
        value: doorOpen
          ? Math.sign(doorOpenRotation) * angleRadians * (doorModel.openDirection ?? 1)
          : Number(parent.userData?.doorClosedRotation ?? 0),
      };
    }
    const fallbackAngle = ((doorModel.openAngle ?? 80) * Math.PI) / 180,
      hingeSign = doorModel.hinge === "right" ? 1 : -1;
    return {
      kind: "hinge",
      value: doorOpen
        ? fallbackAngle * (doorModel.openDirection ?? 1) * hingeSign
        : Number(parent.userData?.doorClosedRotation ?? 0),
    };
  }
  function tick(time, doorModels, states, forceSync = false) {
    if (
      (modelRoot !== options.modelRoot && (reset(), (modelRoot = options.modelRoot)),
      !doorModels?.length && !forceSync)
    ) {
      const hasAnyMotion = motionByMesh.size > 0;
      return (
        reset(),
        hasAnyMotion && (options.invalidateReflections?.(), options.requestRender?.()),
        false
      );
    }
    const environmentRevision = options.environmentRevision ?? options.sceneRevision;
    (!doorMeshList || forceSync || meshListRevision !== environmentRevision) &&
      ((meshListRevision = environmentRevision),
      (doorMeshList = []),
      modelRoot?.traverse((traversedMesh) => {
        (traversedMesh.userData?.doorHingePivot ||
          traversedMesh.userData?.entryDoorPivot ||
          traversedMesh.userData?.doorSlidePivot ||
          traversedMesh.userData?.doorRollerPivot) &&
          doorMeshList.push(traversedMesh);
      }));
    const deltaSeconds =
      forceSync || lastTickTime === null
        ? 0
        : Math.min(0.1, Math.max(0, (time - lastTickTime) / 1000));
    lastTickTime = time;
    const seenMeshSet = new Set(),
      parentHasMotionByMesh = new Map();
    let hasMotion = false,
      shouldRedraw = false;
    ((doorMeshList = doorMeshList.filter(isUnderModelRoot)),
      doorMeshList.forEach((doorMesh) => {
        const hingePivot = doorMesh.userData?.doorHingePivot || doorMesh.userData?.entryDoorPivot,
          slidePivot = doorMesh.userData?.doorSlidePivot,
          rollerPivot = doorMesh.userData?.doorRollerPivot;
        if (!hingePivot && !slidePivot && !rollerPivot) return;
        const doorParent = doorMesh.parent,
          matchedDoorModel = findDoorModel(doorParent, doorModels || []),
          stashedMotion = stashedMotionByMesh.get(doorMesh);
        if (
          (stashedMotion && stashedMotionByMesh.delete(doorMesh), !doorParent || !matchedDoorModel)
        ) {
          stashedMotion &&
            (stashedMotion.kind === "slide"
              ? (doorMesh.position.x = stashedMotion.rest)
              : stashedMotion.kind === "roller"
                ? applyRollerTranslation(doorMesh, stashedMotion.rest)
                : (doorMesh.rotation.y = stashedMotion.rest),
            (shouldRedraw = true),
            bumpOutlineRevision(doorParent));
          return;
        }
        seenMeshSet.add(doorMesh);
        const poseBefore = [
            doorMesh.position?.x,
            doorMesh.position?.y,
            doorMesh.rotation?.y,
            doorMesh.scale?.y,
          ],
          target = resolveTarget(matchedDoorModel, doorParent, doorMesh, states),
          kind = slidePivot ? "slide" : rollerPivot ? "roller" : "hinge";
        let trackedMotion = motionByMesh.get(doorMesh);
        if (
          ((!trackedMotion || trackedMotion.kind !== kind) &&
            ((trackedMotion = {
              kind: kind,
              rest:
                stashedMotion?.rest ??
                (kind === "slide"
                  ? Number(doorMesh.userData?.doorRestTranslation ?? doorMesh.position.x) || 0
                  : kind === "roller"
                    ? Number(doorMesh.userData?.doorRestTranslation ?? doorMesh.position.y) || 0
                    : Number(doorMesh.userData?.doorRestRotation ?? doorMesh.rotation.y) || 0),
              target:
                target?.value ??
                (kind === "slide"
                  ? doorMesh.position.x
                  : kind === "roller"
                    ? doorMesh.position.y
                    : doorMesh.rotation.y),
            }),
            motionByMesh.set(doorMesh, trackedMotion),
            target &&
              (kind === "slide"
                ? (doorMesh.position.x = target.value)
                : kind === "roller"
                  ? applyRollerTranslation(doorMesh, target.value)
                  : (doorMesh.rotation.y = target.value),
              (shouldRedraw = true))),
          hingePivot && !doorMesh.userData?.doorFixedHinge)
        ) {
          const leafWidth = Number(
            doorParent.userData?.doorLeafWidth ?? doorParent.userData?.entryDoorLeafWidth ?? 0.8,
          );
          doorMesh.position.x =
            ((matchedDoorModel.hinge === "right" ? 1 : -1) * Math.abs(leafWidth)) / 2;
        }
        target && (trackedMotion.target = target.value);
        const current =
            kind === "slide"
              ? doorMesh.position.x
              : kind === "roller"
                ? doorMesh.position.y
                : doorMesh.rotation.y,
          difference = trackedMotion.target - current,
          duration = Math.max(0.2, Number(matchedDoorModel.duration) || 0.7),
          maxStep =
            (Math.max(
              kind === "slide"
                ? Math.abs(Number(doorParent.userData?.doorSlideOpenTranslation) || 0)
                : kind === "roller"
                  ? Math.abs(
                      Number(
                        doorParent.userData?.doorRollerOpenTranslation ??
                          doorMesh.userData?.doorRollerOpenTranslation,
                      ) || 0,
                    )
                  : (Math.abs(Number(matchedDoorModel.openAngle) || 80) * Math.PI) / 180,
              0.01,
            ) *
              deltaSeconds) /
            duration;
        if (Math.abs(difference) > 0.0001) {
          const next = current + Math.sign(difference) * Math.min(Math.abs(difference), maxStep);
          (kind === "slide"
            ? (doorMesh.position.x = next)
            : kind === "roller"
              ? applyRollerTranslation(doorMesh, next)
              : (doorMesh.rotation.y = next),
            (hasMotion = true),
            (shouldRedraw = true));
        }
        const poseAfter = [
          doorMesh.position?.x,
          doorMesh.position?.y,
          doorMesh.rotation?.y,
          doorMesh.scale?.y,
        ];
        poseBefore.some((beforeValue, axisIndex) => beforeValue !== poseAfter[axisIndex]) &&
          bumpOutlineRevision(doorParent);
        const latestPosition =
          kind === "slide"
            ? doorMesh.position.x
            : kind === "roller"
              ? doorMesh.position.y
              : doorMesh.rotation.y;
        parentHasMotionByMesh.set(
          doorParent,
          !!parentHasMotionByMesh.get(doorParent) ||
            Math.abs(trackedMotion.target - latestPosition) > 0.0001,
        );
      }));
    for (const [departingMesh, departingMotion] of motionByMesh)
      seenMeshSet.has(departingMesh) ||
        (findDoorModel(departingMesh.parent, doorModels || [])
          ? stashedMotionByMesh.set(departingMesh, {
              kind: departingMotion.kind,
              rest: departingMotion.rest,
            })
          : departingMotion.kind === "slide"
            ? (departingMesh.position.x = departingMotion.rest)
            : departingMotion.kind === "roller"
              ? applyRollerTranslation(departingMesh, departingMotion.rest)
              : (departingMesh.rotation.y = departingMotion.rest),
        bumpOutlineRevision(departingMesh.parent),
        motionByMesh.delete(departingMesh),
        (shouldRedraw = true));
    for (const candidateOutlineMesh of new Set([
      ...outlineFlaggedMeshSet,
      ...parentHasMotionByMesh.keys(),
    ])) {
      const shouldOutlineMove = parentHasMotionByMesh.get(candidateOutlineMesh) === true;
      (candidateOutlineMesh.userData.environmentOutlineMoving !== shouldOutlineMove &&
        (shouldRedraw = true),
        (candidateOutlineMesh.userData.environmentOutlineMoving = shouldOutlineMove));
    }
    outlineFlaggedMeshSet.clear();
    for (const movingOutlineMesh of parentHasMotionByMesh.keys())
      outlineFlaggedMeshSet.add(movingOutlineMesh);
    return (
      shouldRedraw && (options.invalidateReflections?.(), options.requestRender?.()),
      hasMotion
    );
  }
  return {
    tick: tick,
    sync(syncDoorModels, syncStates) {
      return tick(null, syncDoorModels, syncStates, true);
    },
    dispose: reset,
  };
}
