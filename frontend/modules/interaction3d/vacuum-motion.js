import {
  mapSource,
  vacuumStatusPresentation,
  vacuumBindingsForMap
} from "./vacuum-map.js?v=20260915211726";
const isFiniteNumber = candidateValue =>
  typeof candidateValue == "number" && Number.isFinite(candidateValue);
const asValidMapPoint = pointCandidate =>
  pointCandidate && isFiniteNumber(pointCandidate.x) && isFiniteNumber(pointCandidate.y)
    ? pointCandidate
    : null;
export function vacuumMapPoint(mapPoint, calibrationPoints, mapPixelSize, mapConfig) {
  if (
    !asValidMapPoint(mapPoint) ||
    !Array.isArray(calibrationPoints) ||
    calibrationPoints.length < 3 ||
    !(mapPixelSize?.width > 0) ||
    !(mapPixelSize?.height > 0) ||
    !(mapConfig?.width > 0) ||
    !(mapConfig?.depth > 0)
  ) {
    return null;
  }
  const [firstCalibration, secondCalibration, thirdCalibration] = calibrationPoints;
  if (
    ![firstCalibration, secondCalibration, thirdCalibration].every(
      calibrationPoint =>
        asValidMapPoint(calibrationPoint?.vacuum) && asValidMapPoint(calibrationPoint?.map)
    )
  ) {
    return null;
  }
  const vacuumDelta2X = secondCalibration.vacuum.x - firstCalibration.vacuum.x;
  const vacuumDelta2Y = secondCalibration.vacuum.y - firstCalibration.vacuum.y;
  const vacuumDelta3X = thirdCalibration.vacuum.x - firstCalibration.vacuum.x;
  const vacuumDelta3Y = thirdCalibration.vacuum.y - firstCalibration.vacuum.y;
  const barycentricDeterminant = vacuumDelta2X * vacuumDelta3Y - vacuumDelta2Y * vacuumDelta3X;
  if (Math.abs(barycentricDeterminant) < 1e-8) {
    return null;
  }
  const pointDeltaX = mapPoint.x - firstCalibration.vacuum.x;
  const pointDeltaY = mapPoint.y - firstCalibration.vacuum.y;
  const secondWeight =
    (pointDeltaX * vacuumDelta3Y - pointDeltaY * vacuumDelta3X) / barycentricDeterminant;
  const thirdWeight =
    (vacuumDelta2X * pointDeltaY - vacuumDelta2Y * pointDeltaX) / barycentricDeterminant;
  const mapX =
    firstCalibration.map.x +
    secondWeight * (secondCalibration.map.x - firstCalibration.map.x) +
    thirdWeight * (thirdCalibration.map.x - firstCalibration.map.x);
  const mapY =
    firstCalibration.map.y +
    secondWeight * (secondCalibration.map.y - firstCalibration.map.y) +
    thirdWeight * (thirdCalibration.map.y - firstCalibration.map.y);
  const localX = (mapX / mapPixelSize.width - 0.5) * mapConfig.width;
  const localY = (mapY / mapPixelSize.height - 0.5) * mapConfig.depth;
  const rotationRad = ((mapConfig.rotation || 0) * Math.PI) / 180;
  return {
    x: (mapConfig.x || 0) + localX * Math.cos(rotationRad) - localY * Math.sin(rotationRad),
    y: (mapConfig.y || 0) + localX * Math.sin(rotationRad) + localY * Math.cos(rotationRad)
  };
}
export function vacuumTelemetry(vacuumBinding, statesByEntityId, mapResolution) {
  if (
    vacuumBinding.map?.sourceMapId &&
    !vacuumBindingsForMap([vacuumBinding], statesByEntityId).length
  ) {
    return null;
  }
  const entityState =
    statesByEntityId[vacuumBinding.entityId]?.newState || statesByEntityId[vacuumBinding.entityId];
  const statusPresentation = vacuumStatusPresentation(vacuumBinding, statesByEntityId);
  const mapStateEntry = statesByEntityId[vacuumBinding.map?.entityId];
  const mapAttributes = (mapStateEntry?.newState || mapStateEntry)?.attributes || {};
  const chargerPoint = asValidMapPoint(mapAttributes.charger_position);
  const robotPoint = asValidMapPoint(mapAttributes.vacuum_position || mapAttributes.robot_position);
  if (!statusPresentation.available || !chargerPoint || !mapResolution) {
    return null;
  }
  const isCleaningState = ["cleaning", "sweeping", "mopping", "returning", "mapping"].includes(
    entityState?.state
  );
  const isDocked =
    ["docked", "charging", "charging_completed"].includes(entityState?.state) ||
    (!isCleaningState && entityState?.attributes?.charging === true);
  const posePoint = isDocked ? chargerPoint : robotPoint;
  const chargerMapPoint = vacuumMapPoint(
    chargerPoint,
    mapAttributes.calibration_points,
    mapResolution,
    vacuumBinding.map
  );
  const poseMapPoint = vacuumMapPoint(
    posePoint,
    mapAttributes.calibration_points,
    mapResolution,
    vacuumBinding.map
  );
  if (!chargerMapPoint || !poseMapPoint) {
    return null;
  }
  const headingAngle = headingSource => {
    if (!isFiniteNumber(headingSource?.a)) {
      return null;
    }
    const headingRad = (headingSource.a * Math.PI) / 180;
    const headingOriginPoint = vacuumMapPoint(
      headingSource,
      mapAttributes.calibration_points,
      mapResolution,
      vacuumBinding.map
    );
    const headingTargetPoint = vacuumMapPoint(
      {
        x: headingSource.x + Math.cos(headingRad) * 100,
        y: headingSource.y + Math.sin(headingRad) * 100
      },
      mapAttributes.calibration_points,
      mapResolution,
      vacuumBinding.map
    );
    if (headingOriginPoint && headingTargetPoint) {
      return Math.atan2(
        headingTargetPoint.y - headingOriginPoint.y,
        headingTargetPoint.x - headingOriginPoint.x
      );
    } else {
      return null;
    }
  };
  const poseHeading = headingAngle(posePoint);
  const chargerHeading = headingAngle(chargerPoint);
  return {
    x: poseMapPoint.x - chargerMapPoint.x,
    y: poseMapPoint.y - chargerMapPoint.y,
    angle:
      poseHeading !== null && chargerHeading !== null
        ? Math.atan2(Math.sin(poseHeading - chargerHeading), Math.cos(poseHeading - chargerHeading))
        : 0,
    docked: isDocked,
    paused: entityState?.state === "paused",
    active: statusPresentation.active
  };
}
export const VACUUM_CHAT = {
  working: [
    "我真勤快！",
    "主人真懒，还好有我。",
    "好累啊，再坚持一小会儿。",
    "灰尘别跑，我来啦！",
    "今天也在认真营业。",
    "这一片，交给我！"
  ],
  returning: ["电量告急，回家吃饭！", "打工结束，回窝充电。", "基站，我回来啦！"],
  washing: ["洗个拖布，继续加油。", "爱干净，也要洗洗自己。"]
};
export function vacuumQuip(quipComponent, quipStates, timestampMs) {
  if (quipComponent.funMessages === false) {
    return "";
  }
  const quipState =
    quipStates[quipComponent.entityId]?.newState || quipStates[quipComponent.entityId];
  const quipAttributes = quipState?.attributes || {};
  const quipMessages =
    quipState?.state === "returning" || quipAttributes.returning
      ? VACUUM_CHAT.returning
      : quipAttributes.washing || quipAttributes.drying
        ? VACUUM_CHAT.washing
        : VACUUM_CHAT.working;
  return quipMessages[Math.floor(timestampMs / 7000) % quipMessages.length];
}
export function createVacuumMotion(sceneContext, requestRender) {
  const { THREE: THREE } = sceneContext;
  const motionEntriesByItemId = new Map();
  const mapSizesByEntityId = new Map();
  let motionItems = [];
  let entityStates = {};
  let isMotionEnabled = false;
  let isDisposed = false;
  const findModelObject = item => {
    let foundObject;
    sceneContext.modelRoot?.traverse(childObject => {
      if (
        childObject.userData?.environmentFloorId === item.floorId &&
        childObject.userData?.environmentModelId === item.modelId
      ) {
        foundObject = childObject;
      }
    });
    return foundObject;
  };
  function createMotionEntry(modelRoot, motionItem) {
    modelRoot.updateWorldMatrix(true, true);
    const inverseWorldMatrix = modelRoot.matrixWorld.clone().invert();
    const floorMeshes = [];
    const floorItem = sceneContext.document.floors
      .find(floor => floor.id === motionItem.floorId)
      ?.scene.items.find(sceneItem => sceneItem.id === motionItem.modelId);
    const modelHeight = floorItem?.height || 0.85;
    const modelDepth = floorItem?.depth || 0.5;
    modelRoot.traverse(mesh => {
      if (!mesh.isMesh || !mesh.geometry || mesh.userData?.environmentEffect) {
        return;
      }
      mesh.geometry.computeBoundingBox();
      const meshBounds = mesh.geometry.boundingBox
        ?.clone()
        .applyMatrix4(inverseWorldMatrix.clone().multiply(mesh.matrixWorld));
      if (
        meshBounds &&
        meshBounds.max.y < modelHeight * 0.3 &&
        meshBounds.getCenter(new THREE.Vector3()).z > modelDepth * 0.05
      ) {
        floorMeshes.push(mesh);
      }
    });
    if (!floorMeshes.length) {
      return null;
    }
    const combinedBounds = new THREE.Box3();
    floorMeshes.forEach(floorMesh => combinedBounds.expandByObject(floorMesh));
    const centerPoint = modelRoot.worldToLocal(combinedBounds.getCenter(new THREE.Vector3()));
    centerPoint.y = 0;
    const bodyGroup = new THREE.Group();
    bodyGroup.name = "vacuum-mobile-body";
    bodyGroup.position.copy(centerPoint);
    modelRoot.add(bodyGroup);
    modelRoot.updateWorldMatrix(true, true);
    const originalTransforms = floorMeshes.map(sourceMesh => ({
      mesh: sourceMesh,
      parent: sourceMesh.parent,
      position: sourceMesh.position.clone(),
      quaternion: sourceMesh.quaternion.clone(),
      scale: sourceMesh.scale.clone()
    }));
    floorMeshes.forEach(bodyMesh => bodyGroup.attach(bodyMesh));
    const restPosition = bodyGroup.position.clone();
    modelRoot.userData.vacuumMobileRoot = bodyGroup;
    return {
      model: modelRoot,
      mobile: bodyGroup,
      rest: restPosition,
      originals: originalTransforms,
      x: 0,
      y: 0,
      angle: 0,
      target: null,
      initialized: false
    };
  }
  function disposeMotionEntry(motionEntry) {
    for (const transform of motionEntry.originals) {
      transform.parent.add(transform.mesh);
      transform.mesh.position.copy(transform.position);
      transform.mesh.quaternion.copy(transform.quaternion);
      transform.mesh.scale.copy(transform.scale);
    }
    motionEntry.mobile.removeFromParent();
    delete motionEntry.model.userData.vacuumMobileRoot;
    sceneContext.invalidateReflections?.([motionEntry.item.floorId]);
    sceneContext.setVacuumMoving?.(true);
    sceneContext.requestRender?.();
  }
  function ensureMapSize(sizeItem) {
    const mapEntityId = sizeItem.map?.entityId;
    if (!mapEntityId || !mapSource(mapEntityId)) {
      return null;
    }
    const mapState = entityStates[mapEntityId];
    const sizeAttributes = (mapState?.newState || mapState)?.attributes || {};
    if (!sizeAttributes.calibration_points || !sizeAttributes.charger_position) {
      return null;
    }
    const cacheKey = JSON.stringify([mapEntityId, sizeAttributes.calibration_points]);
    let sizeCacheEntry = mapSizesByEntityId.get(mapEntityId);
    if (
      sizeCacheEntry?.key === cacheKey &&
      (!sizeCacheEntry.retryAt || performance.now() < sizeCacheEntry.retryAt)
    ) {
      return sizeCacheEntry.size;
    }
    const failureCount = (sizeCacheEntry?.key === cacheKey && sizeCacheEntry.failures) || 0;
    if (sizeCacheEntry) {
      clearTimeout(sizeCacheEntry.timer);
      sizeCacheEntry.image.onload = sizeCacheEntry.image.onerror = null;
      sizeCacheEntry.image.src = "";
    }
    const mapImage = new Image();
    sizeCacheEntry = {
      key: cacheKey,
      image: mapImage,
      size: null,
      failures: failureCount,
      retryAt: 0,
      timer: null
    };
    mapSizesByEntityId.set(mapEntityId, sizeCacheEntry);
    mapImage.onload = () => {
      if (!isDisposed && mapSizesByEntityId.get(mapEntityId) === sizeCacheEntry) {
        clearTimeout(sizeCacheEntry.timer);
        sizeCacheEntry.timer = null;
        sizeCacheEntry.retryAt = 0;
        sizeCacheEntry.failures = 0;
        sizeCacheEntry.size = {
          width: mapImage.naturalWidth,
          height: mapImage.naturalHeight
        };
        updateMotionEntries();
        requestRender();
      }
    };
    mapImage.onerror = () => {
      if (isDisposed || mapSizesByEntityId.get(mapEntityId) !== sizeCacheEntry) {
        return;
      }
      const retryDelayMs = Math.min(5000, 2 ** Math.min(sizeCacheEntry.failures++, 3) * 1000);
      sizeCacheEntry.retryAt = performance.now() + retryDelayMs;
      sizeCacheEntry.timer = setTimeout(() => {
        sizeCacheEntry.timer = null;
        if (
          !isDisposed &&
          isMotionEnabled &&
          mapSizesByEntityId.get(mapEntityId) === sizeCacheEntry
        ) {
          sizeCacheEntry.retryAt = performance.now();
          updateMotionEntries();
          requestRender();
        }
      }, retryDelayMs);
    };
    mapImage.src = mapSource(mapEntityId);
    return null;
  }
  function updateMotionEntries() {
    for (const trackedItem of motionItems) {
      if (
        trackedItem.motionEnabled === false ||
        trackedItem.visible === false ||
        !isMotionEnabled
      ) {
        continue;
      }
      const matchedModel = findModelObject(trackedItem);
      let trackedEntry = motionEntriesByItemId.get(trackedItem.id);
      if (trackedEntry?.model !== matchedModel) {
        if (trackedEntry) {
          disposeMotionEntry(trackedEntry);
        }
        motionEntriesByItemId.delete(trackedItem.id);
        trackedEntry = null;
      }
      if (!matchedModel) {
        continue;
      }
      const telemetry = vacuumTelemetry(trackedItem, entityStates, ensureMapSize(trackedItem));
      if (!telemetry) {
        if (trackedEntry) {
          trackedEntry.target = null;
        }
        continue;
      }
      if (!trackedEntry) {
        trackedEntry = createMotionEntry(matchedModel, trackedItem);
        if (!trackedEntry) {
          continue;
        }
        motionEntriesByItemId.set(trackedItem.id, trackedEntry);
      }
      trackedEntry.item = trackedItem;
      if (telemetry.paused) {
        trackedEntry.target = null;
        continue;
      }
      if (
        trackedEntry.target?.x !== telemetry.x ||
        trackedEntry.target?.y !== telemetry.y ||
        trackedEntry.target?.angle !== telemetry.angle
      ) {
        trackedEntry.target = telemetry;
        if (!trackedEntry.initialized) {
          trackedEntry.x = telemetry.x;
          trackedEntry.y = telemetry.y;
          trackedEntry.angle = telemetry.angle;
          trackedEntry.initialized = true;
          trackedEntry.dirty = true;
        }
      }
    }
  }
  return {
    sync(items, syncStates, enabled) {
      motionItems = items;
      entityStates = syncStates;
      isMotionEnabled = enabled && !isDisposed;
      const activeItemIds = new Set(
        items
          .filter(listedItem => listedItem.motionEnabled !== false && listedItem.visible !== false)
          .map(mappedItem => mappedItem.id)
      );
      for (const [itemId, entry] of motionEntriesByItemId) {
        if (!activeItemIds.has(itemId) || !isMotionEnabled) {
          disposeMotionEntry(entry);
          motionEntriesByItemId.delete(itemId);
        }
      }
      if (isMotionEnabled) {
        updateMotionEntries();
      } else {
        sceneContext.setVacuumMoving?.(false);
      }
    },
    offset(offsetEntityId) {
      const offsetEntry = motionEntriesByItemId.get(offsetEntityId.replace(/^vacuum:/, ""));
      if (offsetEntry) {
        return {
          x: offsetEntry.x,
          y: offsetEntry.y
        };
      } else {
        return null;
      }
    },
    worldPosition(worldEntityId) {
      const worldEntry = motionEntriesByItemId.get(worldEntityId.replace(/^vacuum:/, ""));
      if (worldEntry) {
        return worldEntry.mobile.getWorldPosition(new THREE.Vector3());
      } else {
        return null;
      }
    },
    tick(deltaSeconds) {
      if (!isMotionEnabled) {
        return false;
      }
      let isMoving = false;
      let didUpdate = false;
      for (const animatedEntry of motionEntriesByItemId.values()) {
        const target = animatedEntry.target;
        if (!target) {
          continue;
        }
        let deltaX = target.x - animatedEntry.x;
        let deltaY = target.y - animatedEntry.y;
        let distance = Math.hypot(deltaX, deltaY);
        if (
          sceneContext
            .worldPoint(animatedEntry.item.floorId, target.x, target.y, 0)
            ?.distanceTo(
              sceneContext.worldPoint(
                animatedEntry.item.floorId,
                animatedEntry.x,
                animatedEntry.y,
                0
              )
            ) > 2.5
        ) {
          animatedEntry.x = target.x;
          animatedEntry.y = target.y;
          deltaX = deltaY = distance = 0;
          animatedEntry.dirty = true;
        }
        const smoothingFactor = 1 - Math.exp(-Math.min(deltaSeconds, 0.1) * 5);
        animatedEntry.x += deltaX * smoothingFactor;
        animatedEntry.y += deltaY * smoothingFactor;
        let angleDelta = Math.atan2(
          Math.sin(target.angle - animatedEntry.angle),
          Math.cos(target.angle - animatedEntry.angle)
        );
        animatedEntry.angle += angleDelta * smoothingFactor;
        if (distance > 0.02 || Math.abs(angleDelta) > 0.002) {
          isMoving = true;
        } else {
          animatedEntry.x = target.x;
          animatedEntry.y = target.y;
          animatedEntry.angle = target.angle;
        }
        if (distance < 0.000001 && Math.abs(angleDelta) < 0.000001 && !animatedEntry.dirty) {
          continue;
        }
        animatedEntry.dirty = false;
        didUpdate = true;
        const floorOrigin = sceneContext.worldPoint(animatedEntry.item.floorId, 0, 0, 0);
        const floorTarget = sceneContext.worldPoint(
          animatedEntry.item.floorId,
          animatedEntry.x,
          animatedEntry.y,
          0
        );
        if (!floorOrigin || !floorTarget) {
          continue;
        }
        animatedEntry.model.updateWorldMatrix(true, false);
        const restWorldPosition = animatedEntry.model.localToWorld(animatedEntry.rest.clone());
        const targetWorldPosition = restWorldPosition.add(floorTarget.sub(floorOrigin));
        animatedEntry.mobile.position.copy(animatedEntry.model.worldToLocal(targetWorldPosition));
        animatedEntry.mobile.rotation.y = -animatedEntry.angle;
        animatedEntry.mobile.updateWorldMatrix(true, true);
        sceneContext.invalidateReflections?.([animatedEntry.item.floorId]);
      }
      sceneContext.setVacuumMoving?.(isMoving || didUpdate);
      if (didUpdate) {
        sceneContext.requestRender?.();
      }
      return isMoving || didUpdate;
    },
    hasTracking(trackedEntityId) {
      return motionEntriesByItemId.has(trackedEntityId.replace(/^vacuum:/, ""));
    },
    dispose() {
      isDisposed = true;
      for (const disposedEntry of motionEntriesByItemId.values()) {
        disposeMotionEntry(disposedEntry);
      }
      motionEntriesByItemId.clear();
      for (const cacheEntry of mapSizesByEntityId.values()) {
        clearTimeout(cacheEntry.timer);
        cacheEntry.image.onload = cacheEntry.image.onerror = null;
        cacheEntry.image.src = "";
      }
      mapSizesByEntityId.clear();
      sceneContext.setVacuumMoving?.(false);
    }
  };
}
export function vacuumBirdCamera(camera, focusPoint) {
  const offsetX = (camera?.position?.[0] || 0) - (camera?.target?.[0] || 0);
  const offsetZ = (camera?.position?.[2] || 1) - (camera?.target?.[2] || 0);
  const horizontalDistance = Math.hypot(offsetX, offsetZ) || 1;
  return {
    ...camera,
    mode: "perspective",
    position: [
      focusPoint[0] + (offsetX / horizontalDistance) * 2.5,
      focusPoint[1] + 6,
      focusPoint[2] + (offsetZ / horizontalDistance) * 2.5
    ],
    target: [...focusPoint],
    up: [0, 1, 0],
    zoom: 1,
    focalLength: 40,
    frameSize: 5
  };
}
export function vacuumFollowPose(sourceCamera, followTarget) {
  return {
    ...sourceCamera,
    target: [...followTarget],
    position: sourceCamera.position.map(
      (componentValue, axisIndex) =>
        followTarget[axisIndex] + componentValue - sourceCamera.target[axisIndex]
    )
  };
}
export function createVacuumFollowCamera(threeNamespace) {
  const raycaster = new threeNamespace.Raycaster();
  const hiddenMaterialsByMesh = new Map();
  let cachedModelRoot = null;
  let cachedSceneRevision = null;
  let cachedOccluderKey = "";
  let occluderMeshes = [];
  function collectOccluders(occluderContext, occlusionItem) {
    const occluderKey = JSON.stringify([occlusionItem.floorId, occlusionItem.modelId]);
    if (
      cachedModelRoot !== occluderContext.modelRoot ||
      cachedSceneRevision !== occluderContext.sceneRevision ||
      cachedOccluderKey !== occluderKey
    ) {
      restoreHiddenMaterials();
      cachedModelRoot = occluderContext.modelRoot;
      cachedSceneRevision = occluderContext.sceneRevision;
      cachedOccluderKey = occluderKey;
      occluderMeshes = [];
      cachedModelRoot?.traverse(object => {
        if (!!object.isMesh && !!object.geometry) {
          for (
            let ancestorObject = object;
            ancestorObject;
            ancestorObject = ancestorObject.parent
          ) {
            if (
              ancestorObject.userData?.environmentEffect ||
              (ancestorObject.userData?.environmentFloorId === occlusionItem.floorId &&
                ancestorObject.userData?.environmentModelId === occlusionItem.modelId)
            ) {
              return;
            }
          }
          occluderMeshes.push(object);
        }
      });
    }
  }
  function restoreHiddenMaterials() {
    for (const [occluderMesh, hiddenMaterialEntry] of hiddenMaterialsByMesh) {
      if (occluderMesh.material === hiddenMaterialEntry.replacement) {
        occluderMesh.material = hiddenMaterialEntry.original;
      }
      hiddenMaterialEntry.clones.forEach(disposedClone => disposedClone.dispose());
    }
    hiddenMaterialsByMesh.clear();
  }
  function revealFurniture(revealContext, revealItem, revealFocus, cameraPosition) {
    collectOccluders(revealContext, revealItem);
    const visibleMeshes = new Set();
    for (const [sampleOffsetX, sampleOffsetZ] of [
      [0, 0],
      [0.18, 0],
      [-0.18, 0],
      [0, 0.18],
      [0, -0.18]
    ]) {
      const samplePoint = revealFocus
        .clone()
        .add(new threeNamespace.Vector3(sampleOffsetX, 0, sampleOffsetZ));
      const rayDirection = samplePoint.sub(cameraPosition);
      const rayDistance = rayDirection.length();
      raycaster.set(cameraPosition, rayDirection.normalize());
      raycaster.near = 0;
      raycaster.far = Math.max(0, rayDistance - 0.015);
      for (const intersection of raycaster.intersectObjects(occluderMeshes, false)) {
        let isVisible = true;
        for (
          let visibleAncestor = intersection.object;
          visibleAncestor;
          visibleAncestor = visibleAncestor.parent
        ) {
          if (!visibleAncestor.visible) {
            isVisible = false;
          }
        }
        if (isVisible) {
          visibleMeshes.add(intersection.object);
        }
      }
    }
    for (const [hiddenMesh, staleMaterialEntry] of hiddenMaterialsByMesh) {
      if (!visibleMeshes.has(hiddenMesh)) {
        if (hiddenMesh.material === staleMaterialEntry.replacement) {
          hiddenMesh.material = staleMaterialEntry.original;
        }
        staleMaterialEntry.clones.forEach(staleClone => staleClone.dispose());
        hiddenMaterialsByMesh.delete(hiddenMesh);
      }
    }
    for (const visibleMesh of visibleMeshes) {
      let materialEntry = hiddenMaterialsByMesh.get(visibleMesh);
      if (!materialEntry) {
        const originalMaterial = visibleMesh.material;
        const materialList = Array.isArray(originalMaterial)
          ? originalMaterial
          : [originalMaterial];
        const clonedMaterials = materialList.map(material => material.clone());
        materialEntry = {
          original: originalMaterial,
          clones: clonedMaterials,
          replacement: Array.isArray(originalMaterial) ? clonedMaterials : clonedMaterials[0]
        };
        hiddenMaterialsByMesh.set(visibleMesh, materialEntry);
        visibleMesh.material = materialEntry.replacement;
      }
      const originalMaterials = Array.isArray(materialEntry.original)
        ? materialEntry.original
        : [materialEntry.original];
      materialEntry.clones.forEach((materialClone, materialIndex) => {
        materialClone.copy(originalMaterials[materialIndex]);
        materialClone.transparent = true;
        materialClone.opacity = Math.min(originalMaterials[materialIndex].opacity, 0.1);
        materialClone.depthWrite = false;
      });
    }
  }
  return {
    reset: restoreHiddenMaterials,
    reveal: revealFurniture
  };
}
