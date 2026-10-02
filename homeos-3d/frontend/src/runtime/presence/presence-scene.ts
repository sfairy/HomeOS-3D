// @ts-nocheck  (0.6.7 JS→TS 全量迁移：该文件保留原生 JS 写法，类型基线暂不收紧)
import { createWalker, animateWalker, disposeWalker } from "./presence-character";
import {
  validPresenceRoute,
  createPresenceTriggers,
  closedPath,
  sampleClosedPath,
  presenceVisibleOnPage,
} from "./presence-motion";
export function createPresenceScene(sceneOptions, wakeFrameLoop = () => {}, nowProvider) {
  const actorsByBindingId = new Map(),
    progressByBindingId = new Map();
  let elapsedSeconds = 0;
  const triggers = createPresenceTriggers(nowProvider);
  let hasDirtyReflections = false,
    footShadowAssets = null;
  function createFootShadow() {
    if (!footShadowAssets) {
      const shadowPixels = new Uint8Array(16384);
      for (let pixelY = 0; pixelY < 64; pixelY++)
        for (let pixelX = 0; pixelX < 64; pixelX++) {
          const radialDistance = Math.hypot(
            ((pixelX + 0.5) / 64) * 2 - 1,
            ((pixelY + 0.5) / 64) * 2 - 1,
          );
          shadowPixels[(pixelY * 64 + pixelX) * 4 + 3] = Math.round(
            255 * Math.max(0, 1 - radialDistance * radialDistance) ** 2,
          );
        }
      const shadowTexture = new sceneOptions.THREE.DataTexture(shadowPixels, 64, 64);
      ((shadowTexture.magFilter = shadowTexture.minFilter = sceneOptions.THREE.LinearFilter),
        (shadowTexture.needsUpdate = true),
        (footShadowAssets = {
          texture: shadowTexture,
          geometry: new sceneOptions.THREE.PlaneGeometry(1.05, 0.8),
        }));
    }
    const shadowMaterial = new sceneOptions.THREE.MeshBasicMaterial({
        map: footShadowAssets.texture,
        transparent: true,
        opacity: 0.62,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
        toneMapped: false,
      }),
      shadowMesh = new sceneOptions.THREE.Mesh(footShadowAssets.geometry, shadowMaterial);
    return (
      (shadowMesh.name = "presence-foot-shadow"),
      (shadowMesh.rotation.x = -Math.PI / 2),
      (shadowMesh.renderOrder = 2),
      (shadowMesh.userData.environmentEffect = true),
      (shadowMesh.raycast = () => {}),
      shadowMesh
    );
  }
  function flushReflectionFloors() {
    hasDirtyReflections && ((hasDirtyReflections = false), sceneOptions.requestRender?.());
  }
  function applyActorOpacity(actor, targetOpacity) {
    actor.opacity = targetOpacity;
    for (const [material, originalMaterialState] of actor.materials) {
      ((material.opacity = originalMaterialState.opacity * targetOpacity),
        (material.depthWrite = targetOpacity < 1 ? false : originalMaterialState.depthWrite));
      const shouldBeTransparent = originalMaterialState.transparent || targetOpacity < 1;
      material.transparent !== shouldBeTransparent &&
        ((material.transparent = shouldBeTransparent), (material.needsUpdate = true));
    }
    ((actor.shadow.material.opacity = 0.62 * targetOpacity), (hasDirtyReflections = true));
  }
  function measureActorBounds(measuredActor) {
    const bounds = new sceneOptions.THREE.Box3();
    measuredActor.root.updateWorldMatrix(true, true);
    for (const childObject of measuredActor.root.children)
      childObject !== measuredActor.shadow && bounds.expandByObject(childObject);
    return bounds;
  }
  const scratchFootPosition = new sceneOptions.THREE.Vector3();
  let cachedSceneModelRoot,
    cachedSceneRevision,
    cachedBackgroundFloor,
    cachedDocument,
    rugPlacements = [];
  function resolveGroundHeight(samplePoint, sampleFloorId) {
    if (
      cachedSceneModelRoot !== sceneOptions.modelRoot ||
      cachedSceneRevision !== sceneOptions.sceneRevision ||
      cachedBackgroundFloor !== sceneOptions.backgroundFloor ||
      cachedDocument !== sceneOptions.document
    ) {
      ((cachedSceneModelRoot = sceneOptions.modelRoot),
        (cachedSceneRevision = sceneOptions.sceneRevision),
        (cachedBackgroundFloor = sceneOptions.backgroundFloor),
        (cachedDocument = sceneOptions.document),
        (rugPlacements = []));
      for (const floor of sceneOptions.document?.floors || [])
        for (const sceneItem of floor.scene?.items || []) {
          if (sceneItem.type !== "rug") continue;
          const pixelsPerMeter = floor.scene.calibration?.pixelsPerMeter || 1,
            rotationRad = ((sceneItem.rotation || 0) * Math.PI) / 180,
            cosRotation = Math.cos(rotationRad),
            sinRotation = Math.sin(rotationRad),
            rugCenter = sceneOptions.worldPoint(
              floor.id,
              sceneItem.x,
              sceneItem.y,
              sceneItem.elevation || 0,
            ),
            rugXAxisPoint = sceneOptions.worldPoint(
              floor.id,
              sceneItem.x + cosRotation * pixelsPerMeter,
              sceneItem.y + sinRotation * pixelsPerMeter,
              sceneItem.elevation || 0,
            ),
            rugZAxisPoint = sceneOptions.worldPoint(
              floor.id,
              sceneItem.x - sinRotation * pixelsPerMeter,
              sceneItem.y + cosRotation * pixelsPerMeter,
              sceneItem.elevation || 0,
            );
          !rugCenter ||
            !rugXAxisPoint ||
            !rugZAxisPoint ||
            rugPlacements.push({
              floorId: floor.id,
              center: rugCenter,
              x: rugXAxisPoint.sub(rugCenter).normalize(),
              z: rugZAxisPoint.sub(rugCenter).normalize(),
              width: sceneItem.width,
              depth: sceneItem.depth,
              height: Math.max(0.004, Math.min(0.018, sceneItem.height ?? 0.012)) + 0.001,
            });
        }
    }
    let groundHeightY = samplePoint.y;
    for (const rugPlacement of rugPlacements) {
      if (rugPlacement.floorId !== sampleFloorId) continue;
      const offsetX = samplePoint.x - rugPlacement.center.x,
        offsetZ = samplePoint.z - rugPlacement.center.z;
      if (
        Math.abs(offsetX * rugPlacement.x.x + offsetZ * rugPlacement.x.z) >
          rugPlacement.width / 2 ||
        Math.abs(offsetX * rugPlacement.z.x + offsetZ * rugPlacement.z.z) > rugPlacement.depth / 2
      )
        continue;
      const rugTopY = rugPlacement.center.y + rugPlacement.height;
      rugTopY >= groundHeightY && rugTopY - samplePoint.y <= 0.05 && (groundHeightY = rugTopY);
    }
    return groundHeightY;
  }
  const removeActor = (removalBindingId) => {
    const removedActor = actorsByBindingId.get(removalBindingId);
    (progressByBindingId.set(removalBindingId, {
      key: removedActor.progressKey,
      distance: removedActor.distance,
    }),
      (hasDirtyReflections = true),
      removedActor.shadow.removeFromParent(),
      removedActor.shadow.material.dispose(),
      disposeWalker(removedActor.root),
      removedActor.routeLine &&
        (removedActor.routeLine.geometry.dispose(),
        removedActor.routeLine.material.dispose(),
        removedActor.routeLine.removeFromParent()),
      actorsByBindingId.delete(removalBindingId));
  };
  function placeActor(placedActor) {
    const pathSample = sampleClosedPath(placedActor.path, placedActor.distance);
    if (!pathSample) return;
    const resolvedGroundY = resolveGroundHeight(pathSample, placedActor.floorId);
    (placedActor.root.position.set(pathSample.x, resolvedGroundY, pathSample.z),
      (placedActor.root.rotation.y = pathSample.heading),
      animateWalker(
        placedActor.root,
        (placedActor.distance / placedActor.size) * 12,
        placedActor.preview ? 0 : 1,
        elapsedSeconds,
      ),
      placedActor.root.updateMatrixWorld(true));
    const groundOffsetY = Math.min(
      ...placedActor.root.userData.parts.legs.map(
        (legRig) => (
          legRig.foot.getWorldPosition(scratchFootPosition),
          scratchFootPosition.y - placedActor.root.userData.soleHeight * placedActor.size
        ),
      ),
    );
    ((placedActor.root.position.y += resolvedGroundY + 0.014 * placedActor.size - groundOffsetY),
      (placedActor.shadow.position.y =
        (resolvedGroundY + 0.008 - placedActor.root.position.y) / placedActor.size));
  }
  function computeHitRects(renderCamera, hitCanvasElement, sensorBindings, layoutSize) {
    const hitCanvasRect = hitCanvasElement.getBoundingClientRect(),
      hitRects = [];
    for (const [hitBindingId, hitActor] of actorsByBindingId) {
      const hitBinding = sensorBindings.find((hitProbe) => hitProbe.id === hitBindingId);
      if (!hitBinding?.clickToFocus || hitActor.exiting || hitActor.opacity <= 0) continue;
      const actorBounds = measureActorBounds(hitActor),
        projectedCorners = [];
      for (const boundX of [actorBounds.min.x, actorBounds.max.x])
        for (const boundY of [actorBounds.min.y, actorBounds.max.y])
          for (const boundZ of [actorBounds.min.z, actorBounds.max.z])
            projectedCorners.push(
              new sceneOptions.THREE.Vector3(boundX, boundY, boundZ).project(renderCamera),
            );
      if (projectedCorners.every((cornerPoint) => cornerPoint.z < -1 || cornerPoint.z > 1))
        continue;
      const screenXList = projectedCorners.map(
          (cornerForX) => hitCanvasRect.left + ((cornerForX.x + 1) * hitCanvasRect.width) / 2,
        ),
        screenYList = projectedCorners.map(
          (cornerForY) => hitCanvasRect.top + ((1 - cornerForY.y) * hitCanvasRect.height) / 2,
        ),
        leftPx = Math.min(...screenXList),
        topPx = Math.min(...screenYList),
        widthPx = Math.max(...screenXList) - leftPx,
        heightPx = Math.max(...screenYList) - topPx,
        paddingPx = hitBinding.hitPadding ?? 8,
        scaleX = layoutSize?.width > 0 ? hitCanvasRect.width / layoutSize.width : 1,
        scaleY = layoutSize?.height > 0 ? hitCanvasRect.height / layoutSize.height : 1;
      hitRects.push({
        id: hitBindingId,
        left: leftPx,
        top: topPx,
        width: widthPx,
        height: heightPx,
        padding: paddingPx,
        scaleX: scaleX,
        scaleY: scaleY,
      });
    }
    return hitRects;
  }
  return {
    sync(
      bindings = [],
      states = {},
      enabled = false,
      floorId = "all",
      isEditing = false,
      isPreviewWalk = false,
      activeModule = "light",
    ) {
      triggers.sync(bindings, states);
      const liveBindingIdSet = new Set();
      let hasSceneChanges = false;
      if (sceneOptions.overlayScene && sceneOptions.worldPoint)
        for (const binding of bindings) {
          if (
            binding.routeClosed === false ||
            (!isEditing && !binding.entityId) ||
            !validPresenceRoute(binding.route) ||
            !enabled ||
            (floorId !== "all" && binding.floorId !== floorId) ||
            (!isEditing &&
              (!triggers.visible(binding.id) || !presenceVisibleOnPage(binding, activeModule)))
          )
            continue;
          const worldPoints = binding.route.map((routePoint) =>
            sceneOptions.worldPoint(binding.floorId, routePoint.x, routePoint.y, 0),
          );
          if (
            worldPoints.some(
              (pointProbe) =>
                !pointProbe || ![pointProbe.x, pointProbe.y, pointProbe.z].every(Number.isFinite),
            )
          )
            continue;
          const actorSignature = JSON.stringify([binding, worldPoints, isEditing, isPreviewWalk]);
          let actorRecord = actorsByBindingId.get(binding.id);
          if (
            (actorRecord &&
              actorRecord.signature !== actorSignature &&
              (removeActor(binding.id), (actorRecord = null)),
            !actorRecord)
          ) {
            const walkerRoot = createWalker(
                sceneOptions.THREE,
                binding.color === "orange" ? 15376452 : 5421233,
                binding.character,
              ),
              actorMaterialSet = new Set();
            walkerRoot.traverse((meshObject) => {
              meshObject.isMesh && actorMaterialSet.add(meshObject.material);
            });
            for (const actorMaterial of actorMaterialSet)
              actorMaterial.emissive?.getHex() ||
                (actorMaterial.emissive.copy(actorMaterial.color),
                (actorMaterial.emissiveIntensity = 0.55));
            const walkerSize = binding.size ?? 1;
            (walkerRoot.scale.setScalar(walkerSize),
              (walkerRoot.userData.presenceId = binding.id),
              (walkerRoot.userData.environmentFloorId = binding.floorId),
              sceneOptions.overlayScene.add(walkerRoot));
            const progressSignature = JSON.stringify([
                binding.entityId,
                binding.floorId,
                binding.route,
                isEditing,
              ]),
              savedProgress = progressByBindingId.get(binding.id);
            if (
              ((actorRecord = {
                root: walkerRoot,
                size: walkerSize,
                floorId: binding.floorId,
                shadow: createFootShadow(),
                materials: new Map(
                  [...actorMaterialSet].map((materialItem) => [
                    materialItem,
                    {
                      opacity: materialItem.opacity,
                      transparent: materialItem.transparent,
                      depthWrite: materialItem.depthWrite,
                    },
                  ]),
                ),
                opacity: 1,
                exiting: false,
                path: closedPath(worldPoints),
                distance: savedProgress?.key === progressSignature ? savedProgress.distance : 0,
                progressKey: progressSignature,
                speed: binding.speed ?? 0.45,
                signature: actorSignature,
                simulated: isEditing,
                preview: isEditing && !isPreviewWalk,
              }),
              walkerRoot.add(actorRecord.shadow),
              applyActorOpacity(actorRecord, isEditing ? 1 : 0),
              isEditing)
            ) {
              const routeLinePoints = [...worldPoints, worldPoints[0]].map(
                (linePoint) =>
                  new sceneOptions.THREE.Vector3(linePoint.x, linePoint.y + 0.025, linePoint.z),
              );
              ((actorRecord.routeLine = new sceneOptions.THREE.Line(
                new sceneOptions.THREE.BufferGeometry().setFromPoints(routeLinePoints),
                new sceneOptions.THREE.LineBasicMaterial({
                  color: binding.color === "orange" ? 15376452 : 5421233,
                  depthTest: true,
                }),
              )),
                (actorRecord.routeLine.name = "presence-route-preview"),
                (actorRecord.routeLine.userData.environmentFloorId = binding.floorId),
                (actorRecord.routeLine.userData.environmentEffect = true),
                sceneOptions.overlayScene.add(actorRecord.routeLine));
            }
            (actorsByBindingId.set(binding.id, actorRecord),
              placeActor(actorRecord),
              (hasSceneChanges = true));
          }
          (actorRecord.exiting && ((actorRecord.exiting = false), (hasSceneChanges = true)),
            liveBindingIdSet.add(binding.id));
        }
      for (const [staleBindingId, staleActor] of actorsByBindingId)
        if (!liveBindingIdSet.has(staleBindingId)) {
          const bindingMatch = bindings.find((bindingProbe) => bindingProbe.id === staleBindingId);
          !isEditing &&
          enabled &&
          bindingMatch &&
          triggers.visible(staleBindingId) &&
          (floorId === "all" || staleActor.floorId === floorId) &&
          !presenceVisibleOnPage(bindingMatch, activeModule)
            ? staleActor.exiting || ((staleActor.exiting = true), (hasSceneChanges = true))
            : (removeActor(staleBindingId), (hasSceneChanges = true));
        }
      for (const progressBindingId of progressByBindingId.keys())
        (!bindings.some((bindingEntry) => bindingEntry.id === progressBindingId) ||
          (!isEditing && !triggers.visible(progressBindingId))) &&
          progressByBindingId.delete(progressBindingId);
      (flushReflectionFloors(),
        hasSceneChanges && (sceneOptions.requestRender?.(), wakeFrameLoop()));
    },
    tick(deltaSeconds) {
      const stepSeconds = Math.max(0, Math.min(0.1, Number(deltaSeconds) || 0));
      elapsedSeconds += stepSeconds;
      let shouldRender = false;
      for (const trackedBindingId of actorsByBindingId.keys())
        !actorsByBindingId.get(trackedBindingId).simulated &&
          !triggers.visible(trackedBindingId) &&
          (removeActor(trackedBindingId),
          progressByBindingId.delete(trackedBindingId),
          (shouldRender = true));
      for (const [actorBindingId, tickedActor] of actorsByBindingId) {
        const fadeTargetOpacity = tickedActor.exiting ? 0 : 1;
        if (
          (tickedActor.opacity !== fadeTargetOpacity &&
            stepSeconds > 0 &&
            applyActorOpacity(
              tickedActor,
              fadeTargetOpacity > tickedActor.opacity
                ? Math.min(1, tickedActor.opacity + stepSeconds / 0.22)
                : Math.max(0, tickedActor.opacity - stepSeconds / 0.22),
            ),
          tickedActor.exiting)
        ) {
          tickedActor.opacity === 0 && removeActor(actorBindingId);
          continue;
        }
        tickedActor.preview ||
          stepSeconds === 0 ||
          ((tickedActor.distance =
            (tickedActor.distance + stepSeconds * tickedActor.speed) % tickedActor.path.length),
          placeActor(tickedActor),
          (hasDirtyReflections = true));
      }
      const isAnimating = [...actorsByBindingId.values()].some(
        (trackedActor) => !trackedActor.preview || trackedActor.opacity !== 1,
      );
      return (
        flushReflectionFloors(),
        (isAnimating || shouldRender) && sceneOptions.requestRender?.(),
        isAnimating
      );
    },
    anchor(bindingId) {
      const anchoredActor = actorsByBindingId.get(bindingId);
      return anchoredActor
        ? {
            center: [
              anchoredActor.root.position.x,
              anchoredActor.root.position.y + 0.7 * anchoredActor.size,
              anchoredActor.root.position.z,
            ],
          }
        : null;
    },
    hitRects: computeHitRects,
    pick(clientX, clientY, camera, canvasElement, pickBindings, pickLayoutSize) {
      const pickCanvasRect = canvasElement.getBoundingClientRect();
      if (!pickCanvasRect.width || !pickCanvasRect.height) return null;
      const clickableActors = [...actorsByBindingId.entries()].filter(
          ([pickBindingId, entryActor]) =>
            !entryActor.exiting &&
            entryActor.opacity > 0 &&
            pickBindings.find((clickBinding) => clickBinding.id === pickBindingId)?.clickToFocus ===
              true,
        ),
        raycaster = new sceneOptions.THREE.Raycaster();
      raycaster.setFromCamera(
        new sceneOptions.THREE.Vector2(
          ((clientX - pickCanvasRect.left) / pickCanvasRect.width) * 2 - 1,
          1 - ((clientY - pickCanvasRect.top) / pickCanvasRect.height) * 2,
        ),
        camera,
      );
      for (const [, clickableActor] of clickableActors) clickableActor.root.updateMatrixWorld(true);
      const intersections = raycaster.intersectObjects(
        clickableActors.map(([, raycastActor]) => raycastActor.root),
        true,
      );
      if (intersections.length)
        return (
          clickableActors.find(([, candidateActor]) => {
            let sceneNode = intersections[0].object;
            for (; sceneNode;) {
              if (sceneNode === candidateActor.root) return true;
              sceneNode = sceneNode.parent;
            }
            return false;
          })?.[0] || null
        );
      const paddingHits = [];
      for (const {
        id: rectId,
        left: rectLeft,
        top: rectTop,
        width: rectWidth,
        height: rectHeight,
        padding: rectPadding,
        scaleX: rectScaleX,
        scaleY: rectScaleY,
      } of computeHitRects(camera, canvasElement, pickBindings, pickLayoutSize)) {
        if (!rectPadding) continue;
        const dxPx = Math.max(rectLeft - clientX, 0, clientX - rectLeft - rectWidth),
          dyPx = Math.max(rectTop - clientY, 0, clientY - rectTop - rectHeight),
          distancePx = Math.hypot(dxPx / rectScaleX, dyPx / rectScaleY);
        distancePx <= rectPadding &&
          paddingHits.push({
            id: rectId,
            distance: distancePx,
          });
      }
      return (
        paddingHits.sort((firstHit, secondHit) => firstHit.distance - secondHit.distance)[0]?.id ||
        null
      );
    },
    dispose() {
      for (const disposedBindingId of actorsByBindingId.keys()) removeActor(disposedBindingId);
      (progressByBindingId.clear(),
        flushReflectionFloors(),
        footShadowAssets?.geometry.dispose(),
        footShadowAssets?.texture.dispose(),
        (footShadowAssets = null),
        (rugPlacements = []),
        (cachedSceneModelRoot = null),
        (cachedSceneRevision = null),
        (cachedDocument = null),
        (cachedBackgroundFloor = null));
    },
  };
}
export function createPresenceWaves(waveOptions, wakeWaveFrameLoop = () => {}) {
  const { THREE: THREE } = waveOptions,
    waveRecordsByBindingId = new Map(),
    ringGeometry = new THREE.RingGeometry(0.965, 1, 48);
  ringGeometry.rotateX(-Math.PI / 2);
  let cachedWaveModelRoot,
    cachedRevision,
    cachedSignature = "",
    isDisposed = false,
    hasVisibleWave = false;
  const requestWaveRender = () => {
      (waveOptions.requestRender?.(), wakeWaveFrameLoop());
    },
    reducedMotionQuery =
      globalThis.matchMedia?.("(prefers-reduced-motion: reduce)") ??
      globalThis.window?.matchMedia?.("(prefers-reduced-motion: reduce)"),
    handleMotionPreferenceChange = () => {
      !isDisposed && hasVisibleWave && requestWaveRender();
    };
  reducedMotionQuery?.addEventListener?.("change", handleMotionPreferenceChange);
  const isNodeVisibleInModel = (probedModel) => {
      for (let ancestorNode = probedModel; ancestorNode; ancestorNode = ancestorNode.parent) {
        if (ancestorNode.visible === false) return false;
        if (ancestorNode === cachedWaveModelRoot) return true;
      }
      return false;
    },
    removeWaveRecord = (removedWave) => {
      (removedWave.group.removeFromParent(),
        removedWave.rings.forEach((disposedRing) => disposedRing.material.dispose()));
    };
  function syncWaves({
    bindings: waveBindings = [],
    states: waveStates = {},
    enabled: wavesEnabled = false,
    floorId: waveFloorId = "",
    preview: wavePreview = false,
  }) {
    if (isDisposed) return;
    let hasWaveChanges = false;
    const revision = waveOptions.environmentRevision ?? waveOptions.sceneRevision,
      bindingSignature = JSON.stringify(
        waveBindings.map((waveBinding) => [
          waveBinding.id,
          waveBinding.floorId,
          waveBinding.modelId,
          waveBinding.width,
          waveBinding.height,
          waveBinding.depth,
        ]),
      );
    if (
      cachedWaveModelRoot !== waveOptions.modelRoot ||
      cachedRevision !== revision ||
      cachedSignature !== bindingSignature
    ) {
      ((cachedWaveModelRoot = waveOptions.modelRoot),
        (cachedRevision = revision),
        (cachedSignature = bindingSignature));
      const presenceModelsByKey = new Map();
      cachedWaveModelRoot?.traverse((modelNode) => {
        modelNode.userData?.environmentModelType === "presence" &&
          presenceModelsByKey.set(
            JSON.stringify([
              modelNode.userData.environmentFloorId,
              modelNode.userData.environmentModelId,
            ]),
            modelNode,
          );
      });
      const visibleBindingIdSet = new Set();
      for (const waveBindingItem of waveBindings) {
        const matchedModelNode = presenceModelsByKey.get(
          JSON.stringify([waveBindingItem.floorId, waveBindingItem.modelId]),
        );
        if (!matchedModelNode || !waveOptions.overlayScene) continue;
        visibleBindingIdSet.add(waveBindingItem.id);
        let waveRecord = waveRecordsByBindingId.get(waveBindingItem.id);
        if (waveRecord?.model !== matchedModelNode) {
          ((hasWaveChanges = true), waveRecord && removeWaveRecord(waveRecord));
          const waveGroup = new THREE.Group();
          ((waveGroup.name = "presence-waves-" + waveBindingItem.id),
            (waveGroup.matrixAutoUpdate = false),
            (waveGroup.userData.environmentEffect = true));
          const ringMeshes = Array.from(
            {
              length: 3,
            },
            () => {
              const createdRingMesh = new THREE.Mesh(
                ringGeometry,
                new THREE.MeshBasicMaterial({
                  color: 12838102,
                  transparent: true,
                  opacity: 0,
                  side: THREE.DoubleSide,
                  depthWrite: false,
                  toneMapped: false,
                }),
              );
              return (
                (createdRingMesh.raycast = () => {}),
                waveGroup.add(createdRingMesh),
                createdRingMesh
              );
            },
          );
          (waveOptions.overlayScene.add(waveGroup),
            (waveRecord = {
              group: waveGroup,
              rings: ringMeshes,
              model: matchedModelNode,
            }),
            waveRecordsByBindingId.set(waveBindingItem.id, waveRecord));
        }
        const radius = Math.max(0.02, (waveBindingItem.width || 0.16) * 0.5),
          depthRatio =
            (waveBindingItem.depth || waveBindingItem.width || 0.16) /
            (waveBindingItem.width || 0.16),
          ringHeight = (waveBindingItem.height || 0.2) * 0.755;
        ((waveRecord.radius !== radius ||
          waveRecord.depthRatio !== depthRatio ||
          waveRecord.rings[0].position.y !== ringHeight) &&
          (hasWaveChanges = true),
          (waveRecord.radius = radius),
          (waveRecord.depthRatio = depthRatio));
        for (const ringMesh of waveRecord.rings) ringMesh.position.y = ringHeight;
      }
      for (const [waveBindingId, staleWave] of waveRecordsByBindingId)
        visibleBindingIdSet.has(waveBindingId) ||
          ((hasWaveChanges = true),
          removeWaveRecord(staleWave),
          waveRecordsByBindingId.delete(waveBindingId));
    }
    hasVisibleWave = false;
    for (const waveBindingEntry of waveBindings) {
      const activeWaveRecord = waveRecordsByBindingId.get(waveBindingEntry.id);
      if (!activeWaveRecord) continue;
      const waveScale = Number.isFinite(waveBindingEntry.waveScale)
          ? Math.max(0.25, Math.min(3, waveBindingEntry.waveScale))
          : 1,
        waveOpacity = Number.isFinite(waveBindingEntry.waveOpacity)
          ? Math.max(0, Math.min(100, waveBindingEntry.waveOpacity)) / 100
          : 0.68;
      ((activeWaveRecord.scale !== waveScale || activeWaveRecord.opacity !== waveOpacity) &&
        (hasWaveChanges = true),
        (activeWaveRecord.scale = waveScale),
        (activeWaveRecord.opacity = waveOpacity));
      const stateEntry =
          waveStates?.get?.(waveBindingEntry.entityId) ?? waveStates[waveBindingEntry.entityId],
        resolvedState = stateEntry?.newState || stateEntry,
        isActiveState =
          resolvedState?.available !== false &&
          !!resolvedState?.state &&
          !["unknown", "unavailable"].includes(resolvedState.state);
      activeWaveRecord.enabled =
        wavesEnabled &&
        waveBindingEntry.waveEnabled !== false &&
        activeWaveRecord.opacity > 0 &&
        (wavePreview || isActiveState) &&
        waveBindingEntry.floorId === waveFloorId;
      const isWaveActive = activeWaveRecord.enabled && isNodeVisibleInModel(activeWaveRecord.model);
      (activeWaveRecord.group.visible !== isWaveActive && (hasWaveChanges = true),
        (activeWaveRecord.group.visible = isWaveActive),
        (hasVisibleWave ||= activeWaveRecord.enabled));
    }
    hasWaveChanges && requestWaveRender();
  }
  function tickWaves(elapsedMs) {
    if (isDisposed || !hasVisibleWave) return false;
    const isReducedMotion = reducedMotionQuery?.matches === true;
    let hasRingChanges = false,
      shouldAnimate = false;
    for (const visibleWave of waveRecordsByBindingId.values()) {
      const isWaveVisible = visibleWave.enabled && isNodeVisibleInModel(visibleWave.model);
      if (
        (visibleWave.group.visible !== isWaveVisible &&
          ((visibleWave.group.visible = isWaveVisible), (hasRingChanges = true)),
        !!isWaveVisible)
      ) {
        ((shouldAnimate ||= !isReducedMotion),
          visibleWave.model.updateWorldMatrix(true, false),
          visibleWave.group.matrix.equals(visibleWave.model.matrixWorld) ||
            (visibleWave.group.matrix.copy(visibleWave.model.matrixWorld),
            (visibleWave.group.matrixWorldNeedsUpdate = true),
            (hasRingChanges = true)));
        for (let ringIndex = 0; ringIndex < visibleWave.rings.length; ringIndex++) {
          const ringPhase = isReducedMotion ? 0.35 : (elapsedMs / 2400 + ringIndex / 3) % 1,
            ringScale = visibleWave.radius * (1.05 + ringPhase * 20) * visibleWave.scale,
            ringObject = visibleWave.rings[ringIndex],
            isRingVisible = !isReducedMotion || ringIndex === 0,
            ringOpacity = visibleWave.opacity * Math.pow(1 - ringPhase, 0.7),
            ringScaleZ = ringScale * visibleWave.depthRatio;
          ((ringObject.visible !== isRingVisible ||
            ringObject.scale.x !== ringScale ||
            ringObject.scale.z !== ringScaleZ ||
            ringObject.material.opacity !== ringOpacity) &&
            (hasRingChanges = true),
            (ringObject.visible = isRingVisible),
            ringObject.scale.set(ringScale, 1, ringScaleZ),
            (ringObject.material.opacity = ringOpacity));
        }
      }
    }
    return (hasRingChanges && requestWaveRender(), shouldAnimate);
  }
  return {
    sync: syncWaves,
    tick: tickWaves,
    dispose() {
      if (!isDisposed) {
        ((isDisposed = true),
          reducedMotionQuery?.removeEventListener?.("change", handleMotionPreferenceChange));
        for (const disposedWave of waveRecordsByBindingId.values()) removeWaveRecord(disposedWave);
        (waveRecordsByBindingId.clear(), ringGeometry.dispose());
      }
    },
  };
}
