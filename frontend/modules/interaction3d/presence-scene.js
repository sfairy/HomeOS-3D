import { createWalker, animateWalker, disposeWalker } from "./presence-character.js";
import {
  validPresenceRoute,
  createPresenceTriggers,
  closedPath,
  sampleClosedPath,
  presenceVisibleOnPage
} from "./presence-motion.js?v=20260915211726";
export function createPresenceScene(sceneOptions, wakeFrameLoop = () => {}, nowProvider) {
  const actorsByBindingId = new Map();
  const progressByBindingId = new Map();
  let elapsedSeconds = 0;
  const triggers = createPresenceTriggers(nowProvider);
  const dirtyFloorIds = new Set();
  let footShadowAssets = null;
  function createFootShadow() {
    if (!footShadowAssets) {
      const shadowPixels = new Uint8Array(16384);
      for (let pixelY = 0; pixelY < 64; pixelY++) {
        for (let pixelX = 0; pixelX < 64; pixelX++) {
          const radialDistance = Math.hypot(
            ((pixelX + 0.5) / 64) * 2 - 1,
            ((pixelY + 0.5) / 64) * 2 - 1
          );
          shadowPixels[(pixelY * 64 + pixelX) * 4 + 3] = Math.round(
            Math.max(0, 1 - radialDistance * radialDistance) ** 2 * 255
          );
        }
      }
      const shadowTexture = new sceneOptions.THREE.DataTexture(shadowPixels, 64, 64);
      shadowTexture.magFilter = shadowTexture.minFilter = sceneOptions.THREE.LinearFilter;
      shadowTexture.needsUpdate = true;
      footShadowAssets = {
        texture: shadowTexture,
        geometry: new sceneOptions.THREE.PlaneGeometry(1.05, 0.8)
      };
    }
    const shadowMaterial = new sceneOptions.THREE.MeshBasicMaterial({
      map: footShadowAssets.texture,
      transparent: true,
      opacity: 0.62,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
      toneMapped: false
    });
    const shadowMesh = new sceneOptions.THREE.Mesh(footShadowAssets.geometry, shadowMaterial);
    shadowMesh.name = "presence-foot-shadow";
    shadowMesh.rotation.x = -Math.PI / 2;
    shadowMesh.renderOrder = 2;
    shadowMesh.userData.environmentEffect = true;
    shadowMesh.raycast = () => {};
    return shadowMesh;
  }
  function flushReflectionFloors() {
    if (dirtyFloorIds.size) {
      sceneOptions.invalidateReflections?.([...dirtyFloorIds]);
      dirtyFloorIds.clear();
      sceneOptions.requestRender?.();
    }
  }
  function applyActorOpacity(actor, targetOpacity) {
    actor.opacity = targetOpacity;
    for (const [material, originalMaterialState] of actor.materials) {
      material.opacity = originalMaterialState.opacity * targetOpacity;
      material.depthWrite = targetOpacity < 1 ? false : originalMaterialState.depthWrite;
      const shouldBeTransparent = originalMaterialState.transparent || targetOpacity < 1;
      if (material.transparent !== shouldBeTransparent) {
        material.transparent = shouldBeTransparent;
        material.needsUpdate = true;
      }
    }
    actor.shadow.material.opacity = targetOpacity * 0.62;
    dirtyFloorIds.add(actor.floorId);
  }
  function measureActorBounds(measuredActor) {
    const bounds = new sceneOptions.THREE.Box3();
    measuredActor.root.updateWorldMatrix(true, true);
    for (const childObject of measuredActor.root.children) {
      if (childObject !== measuredActor.shadow) {
        bounds.expandByObject(childObject);
      }
    }
    return bounds;
  }
  const scratchFootPosition = new sceneOptions.THREE.Vector3();
  const removeActor = removalBindingId => {
    const removedActor = actorsByBindingId.get(removalBindingId);
    progressByBindingId.set(removalBindingId, {
      key: removedActor.progressKey,
      distance: removedActor.distance
    });
    dirtyFloorIds.add(removedActor.floorId);
    removedActor.shadow.removeFromParent();
    removedActor.shadow.material.dispose();
    disposeWalker(removedActor.root);
    if (removedActor.routeLine) {
      removedActor.routeLine.geometry.dispose();
      removedActor.routeLine.material.dispose();
      removedActor.routeLine.removeFromParent();
    }
    actorsByBindingId.delete(removalBindingId);
  };
  function placeActor(placedActor) {
    const pathSample = sampleClosedPath(placedActor.path, placedActor.distance);
    if (!pathSample) {
      return;
    }
    placedActor.root.position.set(pathSample.x, pathSample.y, pathSample.z);
    placedActor.root.rotation.y = pathSample.heading;
    animateWalker(
      placedActor.root,
      (placedActor.distance / placedActor.size) * 12,
      placedActor.preview ? 0 : 1,
      elapsedSeconds
    );
    placedActor.root.updateMatrixWorld(true);
    const groundOffsetY = Math.min(
      ...placedActor.root.userData.parts.legs.map(legRig => {
        legRig.foot.getWorldPosition(scratchFootPosition);
        return scratchFootPosition.y - placedActor.root.userData.soleHeight * placedActor.size;
      })
    );
    placedActor.root.position.y += pathSample.y + placedActor.size * 0.014 - groundOffsetY;
    placedActor.shadow.position.y =
      (pathSample.y + 0.008 - placedActor.root.position.y) / placedActor.size;
  }
  function computeHitRects(renderCamera, hitCanvasElement, sensorBindings) {
    const hitCanvasRect = hitCanvasElement.getBoundingClientRect();
    const hitRects = [];
    for (const [hitBindingId, hitActor] of actorsByBindingId) {
      const hitBinding = sensorBindings.find(hitProbe => hitProbe.id === hitBindingId);
      if (!hitBinding?.clickToFocus || hitActor.exiting || hitActor.opacity <= 0) {
        continue;
      }
      const actorBounds = measureActorBounds(hitActor);
      const projectedCorners = [];
      for (const boundX of [actorBounds.min.x, actorBounds.max.x]) {
        for (const boundY of [actorBounds.min.y, actorBounds.max.y]) {
          for (const boundZ of [actorBounds.min.z, actorBounds.max.z]) {
            projectedCorners.push(
              new sceneOptions.THREE.Vector3(boundX, boundY, boundZ).project(renderCamera)
            );
          }
        }
      }
      if (projectedCorners.every(cornerPoint => cornerPoint.z < -1 || cornerPoint.z > 1)) {
        continue;
      }
      const screenXList = projectedCorners.map(
        cornerForX => hitCanvasRect.left + ((cornerForX.x + 1) * hitCanvasRect.width) / 2
      );
      const screenYList = projectedCorners.map(
        cornerForY => hitCanvasRect.top + ((1 - cornerForY.y) * hitCanvasRect.height) / 2
      );
      const leftPx = Math.min(...screenXList);
      const topPx = Math.min(...screenYList);
      const widthPx = Math.max(...screenXList) - leftPx;
      const heightPx = Math.max(...screenYList) - topPx;
      const paddingPx = hitBinding.hitPadding ?? 8;
      hitRects.push({
        id: hitBindingId,
        left: leftPx,
        top: topPx,
        width: widthPx,
        height: heightPx,
        padding: paddingPx
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
      activeModule = "light"
    ) {
      triggers.sync(bindings, states);
      const liveBindingIds = new Set();
      let didChange = false;
      if (sceneOptions.overlayScene && sceneOptions.worldPoint) {
        for (const binding of bindings) {
          if (
            binding.routeClosed === false ||
            (!isEditing && !binding.entityId) ||
            !validPresenceRoute(binding.route) ||
            !enabled ||
            (floorId !== "all" && binding.floorId !== floorId) ||
            (!isEditing &&
              (!triggers.visible(binding.id) || !presenceVisibleOnPage(binding, activeModule)))
          ) {
            continue;
          }
          const worldPoints = binding.route.map(routePoint =>
            sceneOptions.worldPoint(binding.floorId, routePoint.x, routePoint.y, 0)
          );
          if (
            worldPoints.some(
              pointProbe =>
                !pointProbe || ![pointProbe.x, pointProbe.y, pointProbe.z].every(Number.isFinite)
            )
          ) {
            continue;
          }
          const actorSignature = JSON.stringify([binding, worldPoints, isEditing, isPreviewWalk]);
          let actorRecord = actorsByBindingId.get(binding.id);
          if (actorRecord && actorRecord.signature !== actorSignature) {
            removeActor(binding.id);
            actorRecord = null;
          }
          if (!actorRecord) {
            const walkerRoot = createWalker(
              sceneOptions.THREE,
              binding.color === "orange" ? 15376452 : 5421233,
              binding.character
            );
            const actorMaterialSet = new Set();
            walkerRoot.traverse(meshObject => {
              if (meshObject.isMesh) {
                actorMaterialSet.add(meshObject.material);
              }
            });
            for (const actorMaterial of actorMaterialSet) {
              if (!actorMaterial.emissive?.getHex()) {
                actorMaterial.emissive.copy(actorMaterial.color);
                actorMaterial.emissiveIntensity = 0.55;
              }
            }
            const walkerSize = binding.size ?? 1;
            walkerRoot.scale.setScalar(walkerSize);
            walkerRoot.userData.presenceId = binding.id;
            walkerRoot.userData.environmentFloorId = binding.floorId;
            sceneOptions.overlayScene.add(walkerRoot);
            const progressSignature = JSON.stringify([
              binding.entityId,
              binding.floorId,
              binding.route,
              isEditing
            ]);
            const savedProgress = progressByBindingId.get(binding.id);
            actorRecord = {
              root: walkerRoot,
              size: walkerSize,
              floorId: binding.floorId,
              shadow: createFootShadow(),
              materials: new Map(
                [...actorMaterialSet].map(materialItem => [
                  materialItem,
                  {
                    opacity: materialItem.opacity,
                    transparent: materialItem.transparent,
                    depthWrite: materialItem.depthWrite
                  }
                ])
              ),
              opacity: 1,
              exiting: false,
              path: closedPath(worldPoints),
              distance: savedProgress?.key === progressSignature ? savedProgress.distance : 0,
              progressKey: progressSignature,
              speed: binding.speed ?? 0.45,
              signature: actorSignature,
              simulated: isEditing,
              preview: isEditing && !isPreviewWalk
            };
            walkerRoot.add(actorRecord.shadow);
            applyActorOpacity(actorRecord, isEditing ? 1 : 0);
            if (isEditing) {
              const routeLinePoints = [...worldPoints, worldPoints[0]].map(
                linePoint =>
                  new sceneOptions.THREE.Vector3(linePoint.x, linePoint.y + 0.025, linePoint.z)
              );
              actorRecord.routeLine = new sceneOptions.THREE.Line(
                new sceneOptions.THREE.BufferGeometry().setFromPoints(routeLinePoints),
                new sceneOptions.THREE.LineBasicMaterial({
                  color: binding.color === "orange" ? 15376452 : 5421233,
                  depthTest: true
                })
              );
              actorRecord.routeLine.name = "presence-route-preview";
              actorRecord.routeLine.userData.environmentFloorId = binding.floorId;
              actorRecord.routeLine.userData.environmentEffect = true;
              sceneOptions.overlayScene.add(actorRecord.routeLine);
            }
            actorsByBindingId.set(binding.id, actorRecord);
            placeActor(actorRecord);
            didChange = true;
          }
          if (actorRecord.exiting) {
            actorRecord.exiting = false;
            didChange = true;
          }
          liveBindingIds.add(binding.id);
        }
      }
      for (const [staleBindingId, staleActor] of actorsByBindingId) {
        if (!liveBindingIds.has(staleBindingId)) {
          const bindingMatch = bindings.find(bindingProbe => bindingProbe.id === staleBindingId);
          if (
            !isEditing &&
            enabled &&
            bindingMatch &&
            triggers.visible(staleBindingId) &&
            (floorId === "all" || staleActor.floorId === floorId) &&
            !presenceVisibleOnPage(bindingMatch, activeModule)
          ) {
            if (!staleActor.exiting) {
              staleActor.exiting = true;
              didChange = true;
            }
          } else {
            removeActor(staleBindingId);
            didChange = true;
          }
        }
      }
      for (const progressBindingId of progressByBindingId.keys()) {
        if (
          !bindings.some(bindingEntry => bindingEntry.id === progressBindingId) ||
          (!isEditing && !triggers.visible(progressBindingId))
        ) {
          progressByBindingId.delete(progressBindingId);
        }
      }
      flushReflectionFloors();
      if (didChange) {
        sceneOptions.requestRender?.();
        wakeFrameLoop();
      }
    },
    tick(deltaSeconds) {
      const stepSeconds = Math.max(0, Math.min(0.1, Number(deltaSeconds) || 0));
      elapsedSeconds += stepSeconds;
      let needsRender = false;
      for (const trackedBindingId of actorsByBindingId.keys()) {
        if (
          !actorsByBindingId.get(trackedBindingId).simulated &&
          !triggers.visible(trackedBindingId)
        ) {
          removeActor(trackedBindingId);
          progressByBindingId.delete(trackedBindingId);
          needsRender = true;
        }
      }
      for (const [actorBindingId, tickedActor] of actorsByBindingId) {
        const fadeTargetOpacity = tickedActor.exiting ? 0 : 1;
        if (tickedActor.opacity !== fadeTargetOpacity && stepSeconds > 0) {
          applyActorOpacity(
            tickedActor,
            fadeTargetOpacity > tickedActor.opacity
              ? Math.min(1, tickedActor.opacity + stepSeconds / 0.22)
              : Math.max(0, tickedActor.opacity - stepSeconds / 0.22)
          );
        }
        if (tickedActor.exiting) {
          if (tickedActor.opacity === 0) {
            removeActor(actorBindingId);
          }
          continue;
        }
        if (!tickedActor.preview && stepSeconds !== 0) {
          tickedActor.distance =
            (tickedActor.distance + stepSeconds * tickedActor.speed) % tickedActor.path.length;
          placeActor(tickedActor);
          dirtyFloorIds.add(tickedActor.floorId);
        }
      }
      const isAnimating = [...actorsByBindingId.values()].some(
        trackedActor => !trackedActor.preview || trackedActor.opacity !== 1
      );
      flushReflectionFloors();
      if (isAnimating || needsRender) {
        sceneOptions.requestRender?.();
      }
      return isAnimating;
    },
    anchor(bindingId) {
      const anchoredActor = actorsByBindingId.get(bindingId);
      if (anchoredActor) {
        return {
          center: [
            anchoredActor.root.position.x,
            anchoredActor.root.position.y + anchoredActor.size * 0.7,
            anchoredActor.root.position.z
          ]
        };
      } else {
        return null;
      }
    },
    hitRects: computeHitRects,
    pick(clientX, clientY, camera, canvasElement, pickBindings) {
      const pickCanvasRect = canvasElement.getBoundingClientRect();
      if (!pickCanvasRect.width || !pickCanvasRect.height) {
        return null;
      }
      const clickableActors = [...actorsByBindingId.entries()].filter(
        ([pickBindingId, entryActor]) =>
          !entryActor.exiting &&
          entryActor.opacity > 0 &&
          pickBindings.find(clickBinding => clickBinding.id === pickBindingId)?.clickToFocus ===
            true
      );
      const raycaster = new sceneOptions.THREE.Raycaster();
      raycaster.setFromCamera(
        new sceneOptions.THREE.Vector2(
          ((clientX - pickCanvasRect.left) / pickCanvasRect.width) * 2 - 1,
          1 - ((clientY - pickCanvasRect.top) / pickCanvasRect.height) * 2
        ),
        camera
      );
      for (const [, clickableActor] of clickableActors) {
        clickableActor.root.updateMatrixWorld(true);
      }
      const intersections = raycaster.intersectObjects(
        clickableActors.map(([, raycastActor]) => raycastActor.root),
        true
      );
      if (intersections.length) {
        return (
          clickableActors.find(([, candidateActor]) => {
            let sceneNode = intersections[0].object;
            while (sceneNode) {
              if (sceneNode === candidateActor.root) {
                return true;
              }
              sceneNode = sceneNode.parent;
            }
            return false;
          })?.[0] || null
        );
      }
      const paddingHits = [];
      for (const {
        id: rectId,
        left: rectLeft,
        top: rectTop,
        width: rectWidth,
        height: rectHeight,
        padding: rectPadding
      } of computeHitRects(camera, canvasElement, pickBindings)) {
        if (!rectPadding) {
          continue;
        }
        const dxPx = Math.max(rectLeft - clientX, 0, clientX - rectLeft - rectWidth);
        const dyPx = Math.max(rectTop - clientY, 0, clientY - rectTop - rectHeight);
        if (Math.hypot(dxPx, dyPx) <= rectPadding) {
          paddingHits.push({
            id: rectId,
            distance: Math.hypot(dxPx, dyPx)
          });
        }
      }
      return (
        paddingHits.sort((firstHit, secondHit) => firstHit.distance - secondHit.distance)[0]?.id ||
        null
      );
    },
    dispose() {
      for (const disposedBindingId of actorsByBindingId.keys()) {
        removeActor(disposedBindingId);
      }
      progressByBindingId.clear();
      flushReflectionFloors();
      footShadowAssets?.geometry.dispose();
      footShadowAssets?.texture.dispose();
      footShadowAssets = null;
    }
  };
}
export function createPresenceWaves(waveOptions) {
  const { THREE: THREE } = waveOptions;
  const waveRecordsByBindingId = new Map();
  const ringGeometry = new THREE.RingGeometry(0.965, 1, 48);
  ringGeometry.rotateX(-Math.PI / 2);
  let cachedModelRoot;
  let cachedRevision;
  let cachedSignature = "";
  let isDisposed = false;
  let hasVisibleWave = false;
  const removeWaveRecord = removedWave => {
    removedWave.group.removeFromParent();
    removedWave.rings.forEach(disposedRing => disposedRing.material.dispose());
  };
  function syncWaves({
    bindings: waveBindings = [],
    states: waveStates = {},
    enabled: wavesEnabled = false,
    floorId: waveFloorId = "",
    preview: wavePreview = false
  }) {
    if (isDisposed) {
      return;
    }
    const revision = waveOptions.environmentRevision ?? waveOptions.sceneRevision;
    const bindingSignature = JSON.stringify(
      waveBindings.map(waveBinding => [
        waveBinding.id,
        waveBinding.floorId,
        waveBinding.modelId,
        waveBinding.width,
        waveBinding.height,
        waveBinding.depth
      ])
    );
    if (
      cachedModelRoot !== waveOptions.modelRoot ||
      cachedRevision !== revision ||
      cachedSignature !== bindingSignature
    ) {
      cachedModelRoot = waveOptions.modelRoot;
      cachedRevision = revision;
      cachedSignature = bindingSignature;
      const presenceModelsByKey = new Map();
      cachedModelRoot?.traverse(modelNode => {
        if (modelNode.userData?.environmentModelType === "presence") {
          presenceModelsByKey.set(
            JSON.stringify([
              modelNode.userData.environmentFloorId,
              modelNode.userData.environmentModelId
            ]),
            modelNode
          );
        }
      });
      const visibleBindingIds = new Set();
      for (const waveBindingItem of waveBindings) {
        const matchedModelNode = presenceModelsByKey.get(
          JSON.stringify([waveBindingItem.floorId, waveBindingItem.modelId])
        );
        if (!matchedModelNode || !waveOptions.overlayScene) {
          continue;
        }
        visibleBindingIds.add(waveBindingItem.id);
        let waveRecord = waveRecordsByBindingId.get(waveBindingItem.id);
        if (waveRecord?.model !== matchedModelNode) {
          if (waveRecord) {
            removeWaveRecord(waveRecord);
          }
          const waveGroup = new THREE.Group();
          waveGroup.name = "presence-waves-" + waveBindingItem.id;
          waveGroup.matrixAutoUpdate = false;
          waveGroup.userData.environmentEffect = true;
          const ringMeshes = Array.from(
            {
              length: 3
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
                  toneMapped: false
                })
              );
              createdRingMesh.raycast = () => {};
              waveGroup.add(createdRingMesh);
              return createdRingMesh;
            }
          );
          waveOptions.overlayScene.add(waveGroup);
          waveRecord = {
            group: waveGroup,
            rings: ringMeshes,
            model: matchedModelNode
          };
          waveRecordsByBindingId.set(waveBindingItem.id, waveRecord);
        }
        waveRecord.radius = Math.max(0.02, (waveBindingItem.width || 0.16) * 0.5);
        waveRecord.depthRatio =
          (waveBindingItem.depth || waveBindingItem.width || 0.16) /
          (waveBindingItem.width || 0.16);
        for (const ringMesh of waveRecord.rings) {
          ringMesh.position.y = (waveBindingItem.height || 0.2) * 0.755;
        }
      }
      for (const [waveBindingId, staleWave] of waveRecordsByBindingId) {
        if (!visibleBindingIds.has(waveBindingId)) {
          removeWaveRecord(staleWave);
          waveRecordsByBindingId.delete(waveBindingId);
        }
      }
    }
    hasVisibleWave = false;
    for (const waveBindingEntry of waveBindings) {
      const activeWaveRecord = waveRecordsByBindingId.get(waveBindingEntry.id);
      if (!activeWaveRecord) {
        continue;
      }
      activeWaveRecord.scale = Number.isFinite(waveBindingEntry.waveScale)
        ? Math.max(0.25, Math.min(3, waveBindingEntry.waveScale))
        : 1;
      activeWaveRecord.opacity = Number.isFinite(waveBindingEntry.waveOpacity)
        ? Math.max(0, Math.min(100, waveBindingEntry.waveOpacity)) / 100
        : 0.68;
      const stateEntry =
        waveStates?.get?.(waveBindingEntry.entityId) ?? waveStates[waveBindingEntry.entityId];
      const stateData = stateEntry?.newState || stateEntry;
      const isActiveState =
        stateData?.available !== false &&
        !!stateData?.state &&
        !["unknown", "unavailable"].includes(stateData.state);
      activeWaveRecord.group.visible =
        wavesEnabled &&
        waveBindingEntry.waveEnabled !== false &&
        activeWaveRecord.opacity > 0 &&
        (wavePreview || isActiveState) &&
        waveBindingEntry.floorId === waveFloorId;
      hasVisibleWave ||= activeWaveRecord.group.visible;
    }
    waveOptions.requestRender?.();
  }
  function tickWaves(elapsedMs) {
    if (isDisposed || !hasVisibleWave) {
      return false;
    }
    const prefersReducedMotion =
      globalThis.window?.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
    for (const visibleWave of waveRecordsByBindingId.values()) {
      if (visibleWave.group.visible) {
        visibleWave.model.updateWorldMatrix(true, false);
        visibleWave.group.matrix.copy(visibleWave.model.matrixWorld);
        visibleWave.group.matrixWorldNeedsUpdate = true;
        for (let ringIndex = 0; ringIndex < visibleWave.rings.length; ringIndex++) {
          const ringPhase = prefersReducedMotion ? 0.35 : (elapsedMs / 2400 + ringIndex / 3) % 1;
          const ringScale = visibleWave.radius * (1.05 + ringPhase * 20) * visibleWave.scale;
          visibleWave.rings[ringIndex].visible = !prefersReducedMotion || ringIndex === 0;
          visibleWave.rings[ringIndex].scale.set(ringScale, 1, ringScale * visibleWave.depthRatio);
          visibleWave.rings[ringIndex].material.opacity =
            visibleWave.opacity * Math.pow(1 - ringPhase, 0.7);
        }
      }
    }
    waveOptions.requestRender?.();
    return !prefersReducedMotion;
  }
  return {
    sync: syncWaves,
    tick: tickWaves,
    dispose() {
      if (!isDisposed) {
        isDisposed = true;
        for (const disposedWave of waveRecordsByBindingId.values()) {
          removeWaveRecord(disposedWave);
        }
        waveRecordsByBindingId.clear();
        ringGeometry.dispose();
      }
    }
  };
}
