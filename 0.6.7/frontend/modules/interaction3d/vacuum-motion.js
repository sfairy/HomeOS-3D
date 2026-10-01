import {
  mapSource,
  vacuumStatusPresentation,
  vacuumBindingsForMap,
} from "./vacuum-map.js?v=20260925-vacuum-state-v2-reload-diagnostics-v2";
const isFiniteNumber = (candidateValue) =>
    typeof candidateValue == "number" && Number.isFinite(candidateValue),
  asValidMapPoint = (pointCandidate) =>
    pointCandidate && isFiniteNumber(pointCandidate.x) && isFiniteNumber(pointCandidate.y)
      ? pointCandidate
      : null;
export function vacuumMapPoint(mapPoint, calibrationPoints, mapPixelSize, mapConfig) {
  if (
    !asValidMapPoint(mapPoint) ||
    !Array.isArray(calibrationPoints) ||
    calibrationPoints.length < 3 ||
    !(
      mapPixelSize?.width > 0 &&
      mapPixelSize?.height > 0 &&
      mapConfig?.width > 0 &&
      mapConfig?.depth > 0
    )
  )
    return null;
  const [firstCalibration, secondCalibration, thirdCalibration] = calibrationPoints;
  if (
    ![firstCalibration, secondCalibration, thirdCalibration].every(
      (calibrationPoint) =>
        asValidMapPoint(calibrationPoint?.vacuum) && asValidMapPoint(calibrationPoint?.map),
    )
  )
    return null;
  const vacuumDelta2X = secondCalibration.vacuum.x - firstCalibration.vacuum.x,
    vacuumDelta2Y = secondCalibration.vacuum.y - firstCalibration.vacuum.y,
    vacuumDelta3X = thirdCalibration.vacuum.x - firstCalibration.vacuum.x,
    vacuumDelta3Y = thirdCalibration.vacuum.y - firstCalibration.vacuum.y,
    barycentricDeterminant = vacuumDelta2X * vacuumDelta3Y - vacuumDelta2Y * vacuumDelta3X;
  if (Math.abs(barycentricDeterminant) < 1e-8) return null;
  const pointDeltaX = mapPoint.x - firstCalibration.vacuum.x,
    pointDeltaY = mapPoint.y - firstCalibration.vacuum.y,
    secondWeight =
      (pointDeltaX * vacuumDelta3Y - pointDeltaY * vacuumDelta3X) / barycentricDeterminant,
    thirdWeight =
      (vacuumDelta2X * pointDeltaY - vacuumDelta2Y * pointDeltaX) / barycentricDeterminant,
    mapX =
      firstCalibration.map.x +
      secondWeight * (secondCalibration.map.x - firstCalibration.map.x) +
      thirdWeight * (thirdCalibration.map.x - firstCalibration.map.x),
    mapY =
      firstCalibration.map.y +
      secondWeight * (secondCalibration.map.y - firstCalibration.map.y) +
      thirdWeight * (thirdCalibration.map.y - firstCalibration.map.y),
    localX = (mapX / mapPixelSize.width - 0.5) * mapConfig.width,
    localY = (mapY / mapPixelSize.height - 0.5) * mapConfig.depth,
    rotationRad = ((mapConfig.rotation || 0) * Math.PI) / 180;
  return {
    x: (mapConfig.x || 0) + localX * Math.cos(rotationRad) - localY * Math.sin(rotationRad),
    y: (mapConfig.y || 0) + localX * Math.sin(rotationRad) + localY * Math.cos(rotationRad),
  };
}
export function vacuumTelemetry(vacuumBinding, statesByEntityId, mapResolution) {
  if (
    vacuumBinding.map?.sourceMapId &&
    !vacuumBindingsForMap([vacuumBinding], statesByEntityId).length
  )
    return null;
  const statusPresentation = vacuumStatusPresentation(vacuumBinding, statesByEntityId),
    mapStateEntry = statesByEntityId[vacuumBinding.map?.entityId],
    mapAttributes = (mapStateEntry?.newState || mapStateEntry)?.attributes || {},
    chargerPoint = asValidMapPoint(mapAttributes.charger_position),
    robotPoint = asValidMapPoint(mapAttributes.vacuum_position || mapAttributes.robot_position);
  if (!statusPresentation.available || !chargerPoint || !mapResolution) return null;
  const isDocked = statusPresentation.docked,
    posePoint = isDocked ? chargerPoint : robotPoint,
    chargerMapPoint = vacuumMapPoint(
      chargerPoint,
      mapAttributes.calibration_points,
      mapResolution,
      vacuumBinding.map,
    ),
    poseMapPoint = vacuumMapPoint(
      posePoint,
      mapAttributes.calibration_points,
      mapResolution,
      vacuumBinding.map,
    );
  if (!chargerMapPoint || !poseMapPoint) return null;
  const headingAngle = (headingSource) => {
      if (!isFiniteNumber(headingSource?.a)) return null;
      const headingRad = (headingSource.a * Math.PI) / 180,
        headingOriginPoint = vacuumMapPoint(
          headingSource,
          mapAttributes.calibration_points,
          mapResolution,
          vacuumBinding.map,
        ),
        headingTargetPoint = vacuumMapPoint(
          {
            x: headingSource.x + Math.cos(headingRad) * 100,
            y: headingSource.y + Math.sin(headingRad) * 100,
          },
          mapAttributes.calibration_points,
          mapResolution,
          vacuumBinding.map,
        );
      return headingOriginPoint && headingTargetPoint
        ? Math.atan2(
            headingTargetPoint.y - headingOriginPoint.y,
            headingTargetPoint.x - headingOriginPoint.x,
          )
        : null;
    },
    poseHeading = headingAngle(posePoint),
    chargerHeading = headingAngle(chargerPoint);
  return {
    x: poseMapPoint.x - chargerMapPoint.x,
    y: poseMapPoint.y - chargerMapPoint.y,
    angle:
      poseHeading !== null && chargerHeading !== null
        ? Math.atan2(Math.sin(poseHeading - chargerHeading), Math.cos(poseHeading - chargerHeading))
        : 0,
    docked: isDocked,
    paused: statusPresentation.paused,
    active: statusPresentation.active,
  };
}
export const VACUUM_CHAT = {
  working: [
    "我真勤快！",
    "主人真懒，还好有我。",
    "好累啊，再坚持一小会儿。",
    "灰尘别跑，我来啦！",
    "今天也在认真营业。",
    "这一片，交给我！",
  ],
  returning: ["电量告急，回家吃饭！", "打工结束，回窝充电。", "基站，我回来啦！"],
  washing: ["洗个拖布，继续加油。", "爱干净，也要洗洗自己。"],
};
export function vacuumQuip(quipComponent, quipStates, timestampMs) {
  if (quipComponent.funMessages === false) return "";
  const quipStatusPresentation = vacuumStatusPresentation(quipComponent, quipStates);
  if (!quipStatusPresentation.active) return "";
  const quipMessages =
    quipStatusPresentation.key === "returning_to_wash" || quipStatusPresentation.key === "washing"
      ? VACUUM_CHAT.washing
      : ["returning", "intelligent_recharging"].includes(quipStatusPresentation.key)
        ? VACUUM_CHAT.returning
        : quipStatusPresentation.returning
          ? ["基站，我回来啦！"]
          : quipStatusPresentation.stationWorking
            ? ["基站维护中，稍等我一下。"]
            : VACUUM_CHAT.working;
  return quipMessages[Math.floor(timestampMs / 7000) % quipMessages.length];
}
export function createVacuumMotion(sceneHost, requestRender) {
  const { THREE: three } = sceneHost,
    motionEntriesByItemId = new Map(),
    mapSizesByEntityId = new Map();
  let motionItems = [],
    entityStates = {},
    isMotionEnabled = false,
    isDisposed = false;
  const findModelObject = (lookupItem) => {
    let foundObject;
    return (
      sceneHost.modelRoot?.traverse((childObject) => {
        childObject.userData?.environmentFloorId === lookupItem.floorId &&
          childObject.userData?.environmentModelId === lookupItem.modelId &&
          (foundObject = childObject);
      }),
      foundObject
    );
  };
  function createMotionEntry(modelRoot, motionItem) {
    modelRoot.updateWorldMatrix(true, true);
    const inverseWorldMatrix = modelRoot.matrixWorld.clone().invert(),
      floorMeshes = [],
      floorItem = sceneHost.document.floors
        .find((floor) => floor.id === motionItem.floorId)
        ?.scene.items.find((sceneItem) => sceneItem.id === motionItem.modelId),
      modelHeight = floorItem?.height || 0.85,
      modelDepth = floorItem?.depth || 0.5;
    let robotPart = null;
    if (
      (modelRoot.traverse((partCandidate) => {
        partCandidate.userData?.vacuumPart === "robot" && (robotPart = partCandidate);
      }),
      robotPart
        ? robotPart.traverse((partMesh) => {
            partMesh.isMesh &&
              partMesh.geometry &&
              !partMesh.userData?.environmentEffect &&
              floorMeshes.push(partMesh);
          })
        : modelRoot.traverse((mesh) => {
            if (!mesh.isMesh || !mesh.geometry || mesh.userData?.environmentEffect) return;
            mesh.geometry.computeBoundingBox();
            const meshBounds = mesh.geometry.boundingBox
              ?.clone()
              .applyMatrix4(inverseWorldMatrix.clone().multiply(mesh.matrixWorld));
            meshBounds &&
              meshBounds.max.y < modelHeight * 0.3 &&
              meshBounds.getCenter(new three.Vector3()).z > modelDepth * 0.05 &&
              floorMeshes.push(mesh);
          }),
      !floorMeshes.length)
    )
      return null;
    const combinedBounds = new three.Box3();
    floorMeshes.forEach((floorMesh) => combinedBounds.expandByObject(floorMesh));
    const centerPoint = modelRoot.worldToLocal(
      robotPart
        ? robotPart.getWorldPosition(new three.Vector3())
        : combinedBounds.getCenter(new three.Vector3()),
    );
    centerPoint.y = 0;
    const bodyGroup = new three.Group();
    ((bodyGroup.name = "vacuum-mobile-body"),
      bodyGroup.position.copy(centerPoint),
      modelRoot.add(bodyGroup),
      modelRoot.updateWorldMatrix(true, true));
    const originalTransforms = floorMeshes.map((sourceMesh) => ({
      mesh: sourceMesh,
      parent: sourceMesh.parent,
      position: sourceMesh.position.clone(),
      quaternion: sourceMesh.quaternion.clone(),
      scale: sourceMesh.scale.clone(),
    }));
    floorMeshes.forEach((bodyMesh) => bodyGroup.attach(bodyMesh));
    const restPosition = bodyGroup.position.clone();
    return (
      (modelRoot.userData.vacuumMobileRoot = bodyGroup),
      {
        model: modelRoot,
        mobile: bodyGroup,
        rest: restPosition,
        originals: originalTransforms,
        x: 0,
        y: 0,
        angle: 0,
        target: null,
        initialized: false,
      }
    );
  }
  function disposeMotionEntry(motionEntry) {
    for (const transform of motionEntry.originals)
      (transform.parent.add(transform.mesh),
        transform.mesh.position.copy(transform.position),
        transform.mesh.quaternion.copy(transform.quaternion),
        transform.mesh.scale.copy(transform.scale));
    (motionEntry.mobile.removeFromParent(),
      delete motionEntry.model.userData.vacuumMobileRoot,
      sceneHost.invalidateReflections?.([motionEntry.item.floorId]),
      sceneHost.setVacuumMoving?.(true),
      sceneHost.requestRender?.());
  }
  function ensureMapSize(sizeItem) {
    const mapEntityId = sizeItem.map?.entityId;
    if (!mapEntityId || !mapSource(mapEntityId)) return null;
    const mapState = entityStates[mapEntityId],
      sizeAttributes = (mapState?.newState || mapState)?.attributes || {};
    if (!sizeAttributes.calibration_points || !sizeAttributes.charger_position) return null;
    const cacheKey = JSON.stringify([mapEntityId, sizeAttributes.calibration_points]);
    let sizeCacheEntry = mapSizesByEntityId.get(mapEntityId);
    if (
      sizeCacheEntry?.key === cacheKey &&
      (!sizeCacheEntry.retryAt || performance.now() < sizeCacheEntry.retryAt)
    )
      return sizeCacheEntry.size;
    const failureCount = (sizeCacheEntry?.key === cacheKey && sizeCacheEntry.failures) || 0;
    sizeCacheEntry &&
      (clearTimeout(sizeCacheEntry.timer),
      (sizeCacheEntry.image.onload = sizeCacheEntry.image.onerror = null),
      (sizeCacheEntry.image.src = ""));
    const mapImage = new Image();
    return (
      (sizeCacheEntry = {
        key: cacheKey,
        image: mapImage,
        size: null,
        failures: failureCount,
        retryAt: 0,
        timer: null,
      }),
      mapSizesByEntityId.set(mapEntityId, sizeCacheEntry),
      (mapImage.onload = () => {
        isDisposed ||
          mapSizesByEntityId.get(mapEntityId) !== sizeCacheEntry ||
          (clearTimeout(sizeCacheEntry.timer),
          (sizeCacheEntry.timer = null),
          (sizeCacheEntry.retryAt = 0),
          (sizeCacheEntry.failures = 0),
          (sizeCacheEntry.size = {
            width: mapImage.naturalWidth,
            height: mapImage.naturalHeight,
          }),
          updateMotionEntries(),
          requestRender());
      }),
      (mapImage.onerror = () => {
        if (isDisposed || mapSizesByEntityId.get(mapEntityId) !== sizeCacheEntry) return;
        const retryDelayMs = Math.min(5000, 1000 * 2 ** Math.min(sizeCacheEntry.failures++, 3));
        ((sizeCacheEntry.retryAt = performance.now() + retryDelayMs),
          (sizeCacheEntry.timer = setTimeout(() => {
            ((sizeCacheEntry.timer = null),
              !isDisposed &&
                isMotionEnabled &&
                mapSizesByEntityId.get(mapEntityId) === sizeCacheEntry &&
                ((sizeCacheEntry.retryAt = performance.now()),
                updateMotionEntries(),
                requestRender()));
          }, retryDelayMs)));
      }),
      (mapImage.src = mapSource(mapEntityId)),
      null
    );
  }
  function updateMotionEntries() {
    for (const trackedItem of motionItems) {
      if (trackedItem.motionEnabled === false || trackedItem.visible === false || !isMotionEnabled)
        continue;
      const matchedModel = findModelObject(trackedItem);
      let trackedEntry = motionEntriesByItemId.get(trackedItem.id);
      if (
        (trackedEntry?.model !== matchedModel &&
          (trackedEntry && disposeMotionEntry(trackedEntry),
          motionEntriesByItemId.delete(trackedItem.id),
          (trackedEntry = null)),
        !matchedModel)
      )
        continue;
      const telemetry = vacuumTelemetry(trackedItem, entityStates, ensureMapSize(trackedItem));
      if (!telemetry) {
        trackedEntry && (trackedEntry.target = null);
        continue;
      }
      if (!trackedEntry) {
        if (((trackedEntry = createMotionEntry(matchedModel, trackedItem)), !trackedEntry))
          continue;
        motionEntriesByItemId.set(trackedItem.id, trackedEntry);
      }
      if (
        ((trackedEntry.item = trackedItem),
        trackedEntry.initialized ||
          ((trackedEntry.x = telemetry.x),
          (trackedEntry.y = telemetry.y),
          (trackedEntry.angle = telemetry.angle),
          (trackedEntry.initialized = true),
          (trackedEntry.dirty = true)),
        telemetry.paused)
      ) {
        trackedEntry.target = null;
        continue;
      }
      (trackedEntry.target?.x === telemetry.x &&
        trackedEntry.target?.y === telemetry.y &&
        trackedEntry.target?.angle === telemetry.angle) ||
        (trackedEntry.target = telemetry);
    }
  }
  return {
    sync(items, syncStates, enabled) {
      ((motionItems = items),
        (entityStates = syncStates),
        (isMotionEnabled = enabled && !isDisposed));
      const activeItemIdSet = new Set(
        items
          .filter(
            (listedItem) => listedItem.motionEnabled !== false && listedItem.visible !== false,
          )
          .map((mappedItem) => mappedItem.id),
      );
      for (const [itemId, entry] of motionEntriesByItemId)
        (!activeItemIdSet.has(itemId) || !isMotionEnabled) &&
          (disposeMotionEntry(entry), motionEntriesByItemId.delete(itemId));
      isMotionEnabled ? updateMotionEntries() : sceneHost.setVacuumMoving?.(false);
    },
    offset(offsetEntityId) {
      const offsetEntry = motionEntriesByItemId.get(offsetEntityId.replace(/^vacuum:/, ""));
      return offsetEntry
        ? {
            x: offsetEntry.x,
            y: offsetEntry.y,
          }
        : null;
    },
    worldPosition(worldEntityId) {
      const worldEntry = motionEntriesByItemId.get(worldEntityId.replace(/^vacuum:/, ""));
      return worldEntry ? worldEntry.mobile.getWorldPosition(new three.Vector3()) : null;
    },
    tick(deltaSeconds) {
      if (!isMotionEnabled) return false;
      let isMoving = false,
        hasUpdated = false;
      for (const animatedEntry of motionEntriesByItemId.values()) {
        const target =
          animatedEntry.target ||
          (animatedEntry.dirty
            ? {
                x: animatedEntry.x,
                y: animatedEntry.y,
                angle: animatedEntry.angle,
              }
            : null);
        if (!target) continue;
        let deltaX = target.x - animatedEntry.x,
          deltaY = target.y - animatedEntry.y,
          distance = Math.hypot(deltaX, deltaY);
        sceneHost
          .worldPoint(animatedEntry.item.floorId, target.x, target.y, 0)
          ?.distanceTo(
            sceneHost.worldPoint(animatedEntry.item.floorId, animatedEntry.x, animatedEntry.y, 0),
          ) > 2.5 &&
          ((animatedEntry.x = target.x),
          (animatedEntry.y = target.y),
          (deltaX = deltaY = distance = 0),
          (animatedEntry.dirty = true));
        const smoothingFactor = 1 - Math.exp(-Math.min(deltaSeconds, 0.1) * 5);
        ((animatedEntry.x += deltaX * smoothingFactor),
          (animatedEntry.y += deltaY * smoothingFactor));
        let angleDelta = Math.atan2(
          Math.sin(target.angle - animatedEntry.angle),
          Math.cos(target.angle - animatedEntry.angle),
        );
        if (
          ((animatedEntry.angle += angleDelta * smoothingFactor),
          distance > 0.02 || Math.abs(angleDelta) > 0.002
            ? (isMoving = true)
            : ((animatedEntry.x = target.x),
              (animatedEntry.y = target.y),
              (animatedEntry.angle = target.angle)),
          distance < 0.000001 && Math.abs(angleDelta) < 0.000001 && !animatedEntry.dirty)
        )
          continue;
        ((animatedEntry.dirty = false), (hasUpdated = true));
        const floorOrigin = sceneHost.worldPoint(animatedEntry.item.floorId, 0, 0, 0),
          floorTarget = sceneHost.worldPoint(
            animatedEntry.item.floorId,
            animatedEntry.x,
            animatedEntry.y,
            0,
          );
        if (!floorOrigin || !floorTarget) continue;
        animatedEntry.model.updateWorldMatrix(true, false);
        const restWorldPosition = animatedEntry.model.localToWorld(animatedEntry.rest.clone()),
          targetWorldPosition = restWorldPosition.add(floorTarget.sub(floorOrigin));
        (animatedEntry.mobile.position.copy(animatedEntry.model.worldToLocal(targetWorldPosition)),
          (animatedEntry.mobile.rotation.y = -animatedEntry.angle),
          animatedEntry.mobile.updateWorldMatrix(true, true),
          sceneHost.invalidateReflections?.([animatedEntry.item.floorId]));
      }
      return (
        sceneHost.setVacuumMoving?.(isMoving || hasUpdated),
        hasUpdated && sceneHost.requestRender?.(),
        isMoving || hasUpdated
      );
    },
    hasTracking(trackedEntityId) {
      return motionEntriesByItemId.has(trackedEntityId.replace(/^vacuum:/, ""));
    },
    dispose() {
      isDisposed = true;
      for (const disposedEntry of motionEntriesByItemId.values()) disposeMotionEntry(disposedEntry);
      motionEntriesByItemId.clear();
      for (const cacheEntry of mapSizesByEntityId.values())
        (clearTimeout(cacheEntry.timer),
          (cacheEntry.image.onload = cacheEntry.image.onerror = null),
          (cacheEntry.image.src = ""));
      (mapSizesByEntityId.clear(), sceneHost.setVacuumMoving?.(false));
    },
  };
}
export function vacuumBirdCamera(camera, focusPoint) {
  const offsetX = (camera?.position?.[0] || 0) - (camera?.target?.[0] || 0),
    offsetZ = (camera?.position?.[2] || 1) - (camera?.target?.[2] || 0),
    horizontalDistance = Math.hypot(offsetX, offsetZ) || 1;
  return {
    ...camera,
    mode: "perspective",
    position: [
      focusPoint[0] + (offsetX / horizontalDistance) * 2.5,
      focusPoint[1] + 6,
      focusPoint[2] + (offsetZ / horizontalDistance) * 2.5,
    ],
    target: [...focusPoint],
    up: [0, 1, 0],
    zoom: 1,
    focalLength: 40,
    frameSize: 5,
  };
}
export function vacuumFollowPose(sourceCamera, followTarget) {
  return {
    ...sourceCamera,
    target: [...followTarget],
    position: sourceCamera.position.map(
      (componentValue, axisIndex) =>
        followTarget[axisIndex] + componentValue - sourceCamera.target[axisIndex],
    ),
  };
}
export function createVacuumFollowCamera(cameraThree) {
  const raycaster = new cameraThree.Raycaster(),
    hiddenMaterialsByMesh = new Map();
  let cachedModelRoot = null,
    cachedSceneRevision = null,
    cachedOccluderKey = "",
    occluderMeshes = [];
  function collectOccluders(occluderSceneHost, occlusionItem) {
    const occluderKey = JSON.stringify([occlusionItem.floorId, occlusionItem.modelId]);
    (cachedModelRoot === occluderSceneHost.modelRoot &&
      cachedSceneRevision === occluderSceneHost.sceneRevision &&
      cachedOccluderKey === occluderKey) ||
      (restoreHiddenMaterials(),
      (cachedModelRoot = occluderSceneHost.modelRoot),
      (cachedSceneRevision = occluderSceneHost.sceneRevision),
      (cachedOccluderKey = occluderKey),
      (occluderMeshes = []),
      cachedModelRoot?.traverse((traversedObject) => {
        if (!(!traversedObject.isMesh || !traversedObject.geometry)) {
          for (
            let ancestorObject = traversedObject;
            ancestorObject;
            ancestorObject = ancestorObject.parent
          )
            if (
              ancestorObject.userData?.environmentEffect ||
              (ancestorObject.userData?.environmentFloorId === occlusionItem.floorId &&
                ancestorObject.userData?.environmentModelId === occlusionItem.modelId)
            )
              return;
          occluderMeshes.push(traversedObject);
        }
      }));
  }
  function restoreHiddenMaterials() {
    for (const [occluderMesh, hiddenMaterialEntry] of hiddenMaterialsByMesh)
      (occluderMesh.material === hiddenMaterialEntry.replacement &&
        (occluderMesh.material = hiddenMaterialEntry.original),
        hiddenMaterialEntry.clones.forEach((disposedClone) => disposedClone.dispose()));
    hiddenMaterialsByMesh.clear();
  }
  function revealFurniture(revealSceneHost, revealItem, revealFocus, cameraPosition) {
    collectOccluders(revealSceneHost, revealItem);
    const visibleMeshSet = new Set();
    for (const [sampleOffsetX, sampleOffsetZ] of [
      [0, 0],
      [0.18, 0],
      [-0.18, 0],
      [0, 0.18],
      [0, -0.18],
    ]) {
      const samplePoint = revealFocus
          .clone()
          .add(new cameraThree.Vector3(sampleOffsetX, 0, sampleOffsetZ)),
        rayDirection = samplePoint.sub(cameraPosition),
        rayDistance = rayDirection.length();
      (raycaster.set(cameraPosition, rayDirection.normalize()),
        (raycaster.near = 0),
        (raycaster.far = Math.max(0, rayDistance - 0.015)));
      for (const intersection of raycaster.intersectObjects(occluderMeshes, false)) {
        let isVisible = true;
        for (
          let visibleAncestor = intersection.object;
          visibleAncestor;
          visibleAncestor = visibleAncestor.parent
        )
          visibleAncestor.visible || (isVisible = false);
        isVisible && visibleMeshSet.add(intersection.object);
      }
    }
    for (const [hiddenMesh, staleMaterialEntry] of hiddenMaterialsByMesh)
      visibleMeshSet.has(hiddenMesh) ||
        (hiddenMesh.material === staleMaterialEntry.replacement &&
          (hiddenMesh.material = staleMaterialEntry.original),
        staleMaterialEntry.clones.forEach((staleClone) => staleClone.dispose()),
        hiddenMaterialsByMesh.delete(hiddenMesh));
    for (const visibleMesh of visibleMeshSet) {
      let materialEntry = hiddenMaterialsByMesh.get(visibleMesh);
      if (!materialEntry) {
        const originalMaterial = visibleMesh.material,
          materialList = Array.isArray(originalMaterial) ? originalMaterial : [originalMaterial],
          clonedMaterials = materialList.map((material) => material.clone());
        ((materialEntry = {
          original: originalMaterial,
          clones: clonedMaterials,
          replacement: Array.isArray(originalMaterial) ? clonedMaterials : clonedMaterials[0],
        }),
          hiddenMaterialsByMesh.set(visibleMesh, materialEntry),
          (visibleMesh.material = materialEntry.replacement));
      }
      const originalMaterials = Array.isArray(materialEntry.original)
        ? materialEntry.original
        : [materialEntry.original];
      materialEntry.clones.forEach((materialClone, materialIndex) => {
        (materialClone.copy(originalMaterials[materialIndex]),
          (materialClone.transparent = true),
          (materialClone.opacity = Math.min(originalMaterials[materialIndex].opacity, 0.1)),
          (materialClone.depthWrite = false));
      });
    }
  }
  return {
    reset: restoreHiddenMaterials,
    reveal: revealFurniture,
  };
}
