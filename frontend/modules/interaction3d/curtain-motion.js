const {
  normalizeCurtainTrack: normalizeTrack,
  createCurtainTrack: createTrack,
  createTrackClothGeometry: buildTrackClothGeometry,
  poseTrackCloth: poseClothGeometry,
  curtainPanelRanges: samplePanelRanges,
  createDreamBladeGeometry: createBladeGeometry,
  poseDreamBlades: poseBladeGeometry
} = await (import.meta.url.startsWith("file:")
  ? import(
      new URL(
        "../../static/3d-studio/studio-curtain-track.js?v=20260915211726",
        import.meta.url
      )
    )
  : import("/static/3d-studio/studio-curtain-track.js?v=20260915211726"));
const DIRECTION_SET = new Set(["left", "right", "split"]);
const CLOTH_PART_SET = new Set(["cloth", "band"]);
const TRACK_PART_SET = new Set(["rod", "cap", ...CLOTH_PART_SET]);
const FRAME_INTERVAL_MS = 1000 / 30;
const MOTION_DURATION_MS = 420;
const MIN_PANEL_SCALE = 0.12;
const CLOTH_FOLD_SPACING_METERS = 0.15;
const resolveCurtainFabric = fabricBinding =>
  fabricBinding.curtainFabric === "sheer" ? "sheer" : "cloth";
const resolveUnboundPosition = unboundBinding =>
  !unboundBinding.entityId && Number.isFinite(unboundBinding.unboundPosition)
    ? Math.max(0, Math.min(100, unboundBinding.unboundPosition))
    : 0;
const resolveFoldCount = widthBinding =>
  Math.max(
    4,
    Math.min(
      96,
      Math.round(
        (Number(widthBinding.curtainWidth) || 1.8) /
          (resolveCurtainDirection(widthBinding) === "split" ? 2 : 1) /
          (resolveCurtainFabric(widthBinding) === "sheer" ? 0.1 : CLOTH_FOLD_SPACING_METERS)
      )
    )
  );
const locationKey = (floorId, modelId) =>
  JSON.stringify([String(floorId ?? ""), String(modelId ?? "")]);
const resolveCurtainDirection = directionBinding =>
  DIRECTION_SET.has(directionBinding.coverDirection)
    ? directionBinding.coverDirection
    : DIRECTION_SET.has(directionBinding.curtainPosition)
      ? directionBinding.curtainPosition
      : "split";
const resolveStatePosition = receivedState =>
  typeof receivedState?.position == "number" && Number.isFinite(receivedState.position)
    ? Math.max(0, Math.min(100, receivedState.position))
    : null;
const resolveRigBasis = rigAnchor =>
  Array.isArray(rigAnchor.userData?.curtainRigBasis) &&
  rigAnchor.userData.curtainRigBasis.length === 3 &&
  rigAnchor.userData.curtainRigBasis.every(
    basisComponent =>
      typeof basisComponent == "number" && Number.isFinite(basisComponent) && basisComponent > 0
  )
    ? [...rigAnchor.userData.curtainRigBasis]
    : [1.8, 2.4, 0.18];
function createClothGeometry(three, folds, fabric) {
  const isSheer = fabric === "sheer";
  const segmentCount = Math.max(64, folds * 6);
  const panelHeight = 2.28168;
  const foldAmplitude = isSheer ? 0.023 : 0.046;
  const clothThickness = 0.003;
  const positionArray = [];
  const normalArray = [];
  const uvArray = [];
  const indexArray = [];
  const foldDisplacement = seamRatio => foldAmplitude * Math.sin(seamRatio * folds * Math.PI * 2);
  const foldSlope = seamSlopeRatio =>
    foldAmplitude * folds * Math.PI * 2 * Math.cos(seamSlopeRatio * folds * Math.PI * 2);
  const pushVertex = (
    positionX,
    positionY,
    positionZ,
    normalX,
    normalY,
    normalZ,
    textureU,
    textureV
  ) => {
    positionArray.push(positionX, positionY, positionZ);
    normalArray.push(normalX, normalY, normalZ);
    uvArray.push(textureU, textureV);
  };
  for (const face of isSheer ? ["front"] : ["front", "back", "top", "bottom"]) {
    const faceVertexOffset = positionArray.length / 3;
    for (let segmentIndex = 0; segmentIndex <= segmentCount; segmentIndex++) {
      const alongRatio = segmentIndex / segmentCount;
      const foldOffset = foldDisplacement(alongRatio);
      const foldSlopeSample = foldSlope(alongRatio);
      const normalLength = Math.hypot(foldSlopeSample, 1);
      if (face === "front" || face === "back") {
        const outwardSign = face === "front" ? 1 : -1;
        for (const vertexHeight of [0, panelHeight]) {
          pushVertex(
            alongRatio,
            vertexHeight,
            foldOffset + (outwardSign * clothThickness) / 2,
            (-outwardSign * foldSlopeSample) / normalLength,
            0,
            outwardSign / normalLength,
            alongRatio,
            vertexHeight / panelHeight
          );
        }
      } else {
        const verticalSign = face === "top" ? 1 : -1;
        for (const thicknessOffset of [-clothThickness / 2, clothThickness / 2]) {
          pushVertex(
            alongRatio,
            verticalSign > 0 ? panelHeight : 0,
            foldOffset + thicknessOffset,
            0,
            verticalSign,
            0,
            alongRatio,
            thicknessOffset > 0 ? 1 : 0
          );
        }
      }
      if (segmentIndex < segmentCount) {
        const segmentVertexIndex = faceVertexOffset + segmentIndex * 2;
        if (face === "front" || face === "bottom") {
          indexArray.push(
            segmentVertexIndex,
            segmentVertexIndex + 2,
            segmentVertexIndex + 1,
            segmentVertexIndex + 1,
            segmentVertexIndex + 2,
            segmentVertexIndex + 3
          );
        } else {
          indexArray.push(
            segmentVertexIndex,
            segmentVertexIndex + 1,
            segmentVertexIndex + 2,
            segmentVertexIndex + 1,
            segmentVertexIndex + 3,
            segmentVertexIndex + 2
          );
        }
      }
    }
  }
  for (const edgeX of isSheer ? [] : [0, 1]) {
    const capVertexOffset = positionArray.length / 3;
    const edgeNormalSign = edgeX === 0 ? -1 : 1;
    for (const edgeHeight of [0, panelHeight]) {
      for (const edgeThicknessOffset of [-clothThickness / 2, clothThickness / 2]) {
        pushVertex(
          edgeX,
          edgeHeight,
          foldDisplacement(edgeX) + edgeThicknessOffset,
          edgeNormalSign,
          0,
          0,
          edgeThicknessOffset > 0 ? 1 : 0,
          edgeHeight / panelHeight
        );
      }
    }
    if (edgeNormalSign > 0) {
      indexArray.push(
        capVertexOffset,
        capVertexOffset + 2,
        capVertexOffset + 1,
        capVertexOffset + 1,
        capVertexOffset + 2,
        capVertexOffset + 3
      );
    } else {
      indexArray.push(
        capVertexOffset,
        capVertexOffset + 1,
        capVertexOffset + 2,
        capVertexOffset + 1,
        capVertexOffset + 3,
        capVertexOffset + 2
      );
    }
  }
  const geometry = new three.BufferGeometry();
  geometry.setAttribute("position", new three.Float32BufferAttribute(positionArray, 3));
  geometry.setAttribute("normal", new three.Float32BufferAttribute(normalArray, 3));
  geometry.setAttribute("uv", new three.Float32BufferAttribute(uvArray, 2));
  geometry.setIndex(indexArray);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}
function isDescendantOf(descendant, ancestor) {
  for (let walkedNode = descendant; walkedNode; walkedNode = walkedNode.parent) {
    if (walkedNode === ancestor) {
      return true;
    }
  }
  return false;
}
function locateCurtainRig(environmentRoot) {
  const curtainParts = [];
  const rigRoots = [];
  function collectRigParts(visitedNode) {
    if (
      !visitedNode.userData?.curtainMotionRig &&
      !visitedNode.userData?.curtainMotionPanel &&
      (visitedNode === environmentRoot || visitedNode.userData?.environmentModelId == null)
    ) {
      if (visitedNode.userData?.curtainRigRoot === true) {
        rigRoots.push(visitedNode);
      }
      if (visitedNode.isMesh && TRACK_PART_SET.has(visitedNode.userData?.curtainPart)) {
        curtainParts.push(visitedNode);
      }
      for (const child of visitedNode.children || []) {
        collectRigParts(child);
      }
    }
  }
  collectRigParts(environmentRoot);
  if (
    !curtainParts.some(curtainPartNode => CLOTH_PART_SET.has(curtainPartNode.userData.curtainPart))
  ) {
    return null;
  }
  let anchor = rigRoots.find(anchorCandidate =>
    curtainParts.every(partNode => isDescendantOf(partNode, anchorCandidate))
  );
  if (!anchor) {
    for (
      anchor = curtainParts[0].parent;
      anchor && !curtainParts.every(candidatePart => isDescendantOf(candidatePart, anchor));
    ) {
      anchor = anchor.parent;
    }
  }
  if (anchor && isDescendantOf(anchor, environmentRoot)) {
    return {
      anchor: anchor,
      parts: curtainParts
    };
  } else {
    return null;
  }
}
export function createCurtainMotion({
  THREE: THREE,
  requestRender: requestRender = () => {}
} = {}) {
  let syncedModelRoot = null;
  let syncedSceneRevision;
  let syncedBindingsSignature = "";
  let isDisposed = false;
  const clothGeometryCache = new Map();
  function getClothGeometry(foldCount, fabricName) {
    const cacheKey = fabricName + ":" + foldCount;
    if (!clothGeometryCache.has(cacheKey)) {
      clothGeometryCache.set(cacheKey, createClothGeometry(THREE, foldCount, fabricName));
    }
    return clothGeometryCache.get(cacheKey);
  }
  let rigsByBindingId = new Map();
  let coverStatesByEntityId = new Map();
  let lastUpdateMs = -Infinity;
  let isPoseKeyDirty = true;
  let cachedPoseKey = "";
  let previousEntityIdByBindingId = new Map();
  let generationCounter = 1;
  let isStructureKeyDirty = true;
  let cachedStructureKey = "";
  function markPoseDirty() {
    isPoseKeyDirty = true;
    requestRender();
  }
  function createRig(model, binding, located) {
    const coveredParts = located.parts.filter(coveredPart =>
      CLOTH_PART_SET.has(coveredPart.userData.curtainPart)
    );
    const clothMaterials = coveredParts
      .filter(clothOnlyPart => clothOnlyPart.userData.curtainPart === "cloth")
      .flatMap(partMesh =>
        Array.isArray(partMesh.material) ? partMesh.material : [partMesh.material]
      )
      .filter(Boolean);
    const materialBrightness = material =>
      material.color ? material.color.r + material.color.g + material.color.b : 0;
    const brightestMaterial = clothMaterials.reduce(
      (bestMaterial, candidateMaterial) =>
        !bestMaterial || materialBrightness(candidateMaterial) > materialBrightness(bestMaterial)
          ? candidateMaterial
          : bestMaterial,
      null
    );
    const fabricKind = resolveCurtainFabric(binding);
    const isSheerPanel = fabricKind === "sheer";
    const panelMaterial = isSheerPanel
      ? new THREE.MeshStandardMaterial({
          color: 16118766,
          roughness: 1,
          metalness: 0,
          transparent: true,
          opacity: 0.48,
          depthWrite: false
        })
      : brightestMaterial?.clone?.() ||
        new THREE.MeshStandardMaterial({
          color: 13094354,
          roughness: 0.94,
          metalness: 0
        });
    panelMaterial.color?.lerp(new THREE.Color(16777215), 0.2);
    panelMaterial.side = THREE.DoubleSide;
    panelMaterial.forceSinglePass = true;
    const isDream = binding.coverKind === "dream";
    const trackModel =
      located.anchor.userData.curtainTrackModel || isDream ? createTrack(binding) : null;
    const rigFolds = resolveFoldCount(binding);
    const sharedGeometry = trackModel ? null : getClothGeometry(rigFolds, fabricKind);
    const rigGroup = new THREE.Group();
    const basis = resolveRigBasis(located.anchor);
    rigGroup.name = "curtain-motion-" + binding.id;
    rigGroup.userData.curtainMotionRig = true;
    rigGroup.scale.set(
      ...(trackModel ? [1, 1, 1] : [basis[0] / 1.8, basis[1] / 2.4, basis[2] / 0.18])
    );
    located.anchor.add(rigGroup);
    const panels = ["left", "right"].map(side => {
      const panelMesh = new THREE.Mesh(
        isDream
          ? createBladeGeometry(THREE, trackModel, basis[1])
          : trackModel
            ? buildTrackClothGeometry(THREE, trackModel, basis[1], fabricKind)
            : sharedGeometry,
        panelMaterial
      );
      panelMesh.name = "curtain-motion-" + binding.id + "-" + side;
      panelMesh.userData.curtainMotionPanel = true;
      panelMesh.userData.curtainSide = side;
      panelMesh.userData.externalModelSharedGeometry = true;
      panelMesh.userData.externalModelSharedTextures = true;
      panelMesh.userData.externalModelSharedMaterial = true;
      if (!trackModel) {
        panelMesh.position.set(side === "left" ? -0.9 : 0.9, 0.06, 0);
      }
      panelMesh.castShadow =
        !isSheerPanel && coveredParts.some(shadowCastingPart => shadowCastingPart.castShadow);
      panelMesh.receiveShadow = coveredParts.some(
        shadowReceivingPart => shadowReceivingPart.receiveShadow
      );
      panelMesh.visible = false;
      rigGroup.add(panelMesh);
      return panelMesh;
    });
    return {
      model: model,
      binding: binding,
      dream: isDream,
      fabric: fabricKind,
      folds: rigFolds,
      track: trackModel,
      anchor: located.anchor,
      parts: located.parts,
      rig: rigGroup,
      basis: basis,
      generation: generationCounter++,
      panels: panels,
      material: panelMaterial,
      originals: new Map(coveredParts.map(sourcePart => [sourcePart, sourcePart.visible])),
      direction: resolveCurtainDirection(binding),
      position: null,
      target: null,
      motionFrom: null,
      motionStart: null
    };
  }
  function disposeRig(discardedRig) {
    for (const [restoredPart, wasVisible] of discardedRig.originals) {
      restoredPart.visible = wasVisible;
    }
    discardedRig.rig.removeFromParent();
    if (discardedRig.track) {
      for (const panelToDispose of discardedRig.panels) {
        panelToDispose.geometry.dispose();
      }
    }
    discardedRig.material.dispose();
  }
  function resetRigMotion(resetTargetRig) {
    resetTargetRig.position = null;
    resetTargetRig.target = null;
    resetTargetRig.motionFrom = null;
    resetTargetRig.motionStart = null;
    resetTargetRig.bladePosition = null;
    applyRigPose(resetTargetRig);
  }
  function applyRigPose(posedRig) {
    const positionRatio = posedRig.position ?? resolveUnboundPosition(posedRig.binding);
    if (posedRig.track) {
      for (const originalPart of posedRig.originals.keys()) {
        originalPart.visible = false;
      }
      samplePanelRanges(posedRig.track, positionRatio, posedRig.direction).forEach(
        (panelRange, sideIndex) => {
          const panel = posedRig.panels[sideIndex];
          panel.visible = panelRange.visible;
          const panelPose = {
            ...panelRange,
            side: sideIndex,
            split: posedRig.direction === "split"
          };
          if (posedRig.dream) {
            poseBladeGeometry(
              panel.geometry,
              posedRig.track,
              panelPose,
              posedRig.bladePosition ?? 50
            );
          } else {
            poseClothGeometry(panel.geometry, posedRig.track, panelPose);
          }
        }
      );
      isPoseKeyDirty = true;
      return;
    }
    const isSplit = posedRig.direction === "split";
    const panelWidth = isSplit ? (posedRig.fabric === "sheer" ? 0.9 : 0.906) : 1.8;
    const clothScale = 1 - ((1 - MIN_PANEL_SCALE) * positionRatio) / 100;
    for (const hiddenPart of posedRig.originals.keys()) {
      hiddenPart.visible = false;
    }
    for (const posedPanel of posedRig.panels) {
      const isLeftPanel = posedPanel.userData.curtainSide === "left";
      posedPanel.visible = isSplit || posedRig.direction === (isLeftPanel ? "left" : "right");
      posedPanel.scale.x = (isLeftPanel ? 1 : -1) * panelWidth * clothScale;
      posedPanel.updateMatrix();
    }
    isPoseKeyDirty = true;
  }
  function updateRigTarget(motionRig, receivedMotionState, immediate = false) {
    const incomingPosition = resolveStatePosition(receivedMotionState);
    const bladeChanged = motionRig.bladePosition !== receivedMotionState.bladePosition;
    motionRig.bladePosition = receivedMotionState.bladePosition;
    if (bladeChanged && motionRig.dream) {
      applyRigPose(motionRig);
    }
    if (incomingPosition === null) {
      const hadPendingMotion = motionRig.target !== motionRig.position;
      motionRig.target = motionRig.position;
      motionRig.motionStart = null;
      return hadPendingMotion || bladeChanged;
    }
    if (motionRig.position === null || immediate) {
      const positionChanged =
        motionRig.position !== incomingPosition || motionRig.target !== incomingPosition;
      motionRig.position = incomingPosition;
      motionRig.target = incomingPosition;
      motionRig.motionStart = null;
      if (positionChanged) {
        applyRigPose(motionRig);
      }
      return positionChanged || bladeChanged;
    }
    if (motionRig.target === incomingPosition) {
      return bladeChanged;
    } else {
      motionRig.target = incomingPosition;
      motionRig.motionFrom = motionRig.position;
      motionRig.motionStart = null;
      return true;
    }
  }
  function setBindings(modelRoot, bindings = [], sceneRevision) {
    if (isDisposed) {
      return;
    }
    const seenBindingIds = new Set();
    const seenModelKeys = new Set();
    const normalizedBindings = (Array.isArray(bindings) ? bindings : [])
      .filter(candidateBinding => {
        if (!candidateBinding || candidateBinding.id == null || candidateBinding.modelId == null) {
          return false;
        }
        const bindingIdKey = String(candidateBinding.id);
        const rawLocationKey = locationKey(candidateBinding.floorId, candidateBinding.modelId);
        if (seenBindingIds.has(bindingIdKey) || seenModelKeys.has(rawLocationKey)) {
          return false;
        } else {
          seenBindingIds.add(bindingIdKey);
          seenModelKeys.add(rawLocationKey);
          return true;
        }
      })
      .map(rawBinding => ({
        id: String(rawBinding.id),
        entityId: String(rawBinding.entityId ?? ""),
        floorId: String(rawBinding.floorId ?? ""),
        modelId: String(rawBinding.modelId),
        curtainWidth: Number(rawBinding.curtainWidth) > 0 ? Number(rawBinding.curtainWidth) : 1.8,
        coverDirection: rawBinding.coverDirection || "auto",
        curtainPosition: rawBinding.curtainPosition || "split",
        coverKind: rawBinding.coverKind === "dream" ? "dream" : "standard",
        ...normalizeTrack(rawBinding),
        curtainFabric: resolveCurtainFabric(rawBinding),
        unboundPosition: resolveUnboundPosition(rawBinding)
      }));
    const bindingsSignature = JSON.stringify(normalizedBindings);
    if (
      syncedModelRoot === modelRoot &&
      syncedSceneRevision === sceneRevision &&
      syncedBindingsSignature === bindingsSignature
    ) {
      return;
    }
    const entityIdByBindingId = new Map(
      normalizedBindings.map(normalizedEntry => [normalizedEntry.id, normalizedEntry.entityId])
    );
    for (const staleBindingId of coverStatesByEntityId.keys()) {
      if (
        !entityIdByBindingId.has(staleBindingId) ||
        (previousEntityIdByBindingId.has(staleBindingId) &&
          previousEntityIdByBindingId.get(staleBindingId) !==
            entityIdByBindingId.get(staleBindingId))
      ) {
        coverStatesByEntityId.delete(staleBindingId);
      }
    }
    previousEntityIdByBindingId = entityIdByBindingId;
    syncedModelRoot = modelRoot || null;
    syncedSceneRevision = sceneRevision;
    syncedBindingsSignature = bindingsSignature;
    const modelsByLocationKey = new Map();
    if (normalizedBindings.length) {
      syncedModelRoot?.traverse?.(sceneNode => {
        if (
          sceneNode.userData?.environmentModelType !== "curtain" ||
          sceneNode.userData?.environmentModelId == null
        ) {
          return;
        }
        let nodeFloorId = sceneNode.userData.environmentFloorId;
        for (
          let parentNode = sceneNode.parent;
          nodeFloorId == null && parentNode;
          parentNode = parentNode.parent
        ) {
          nodeFloorId = parentNode.userData?.environmentFloorId;
        }
        modelsByLocationKey.set(
          locationKey(nodeFloorId, sceneNode.userData.environmentModelId),
          sceneNode
        );
      });
    }
    const locatedEntries = normalizedBindings
      .map(locatedBinding => {
        const environmentModel = modelsByLocationKey.get(
          locationKey(locatedBinding.floorId, locatedBinding.modelId)
        );
        const locatedRig = environmentModel ? locateCurtainRig(environmentModel) : null;
        if (locatedRig) {
          return {
            binding: locatedBinding,
            model: environmentModel,
            located: locatedRig
          };
        } else {
          return null;
        }
      })
      .filter(Boolean);
    const reusedRigsByBindingId = new Map();
    for (const entry of locatedEntries) {
      const existingRig = rigsByBindingId.get(entry.binding.id);
      if (
        existingRig &&
        existingRig.dream === (entry.binding.coverKind === "dream") &&
        (!existingRig.track ||
          JSON.stringify([
            normalizeTrack(existingRig.binding),
            existingRig.binding.curtainWidth
          ]) === JSON.stringify([normalizeTrack(entry.binding), entry.binding.curtainWidth])) &&
        existingRig.fabric === resolveCurtainFabric(entry.binding) &&
        existingRig.model === entry.model &&
        existingRig.anchor === entry.located.anchor &&
        existingRig.parts.length === entry.located.parts.length &&
        existingRig.parts.every((part, partIndex) => part === entry.located.parts[partIndex])
      ) {
        reusedRigsByBindingId.set(entry.binding.id, existingRig);
      }
    }
    for (const [removedBindingId, removedRig] of rigsByBindingId) {
      if (!reusedRigsByBindingId.has(removedBindingId)) {
        disposeRig(removedRig);
      }
    }
    const previousRigsByBindingId = rigsByBindingId;
    rigsByBindingId = new Map();
    for (const {
      binding: entryBinding,
      model: entryModel,
      located: entryLocated
    } of locatedEntries) {
      const nextRig =
        reusedRigsByBindingId.get(entryBinding.id) ||
        createRig(entryModel, entryBinding, entryLocated);
      const previousRig = previousRigsByBindingId.get(entryBinding.id);
      if (
        previousRig &&
        previousRig !== nextRig &&
        previousRig.model === entryModel &&
        previousRig.binding.entityId === entryBinding.entityId
      ) {
        for (const motionFieldName of [
          "position",
          "target",
          "motionFrom",
          "motionStart",
          "bladePosition"
        ]) {
          nextRig[motionFieldName] = previousRig[motionFieldName];
        }
        applyRigPose(nextRig);
      }
      const nextDirection = resolveCurtainDirection(entryBinding);
      if (nextRig.binding.entityId !== entryBinding.entityId) {
        resetRigMotion(nextRig);
      }
      nextRig.binding = entryBinding;
      const nextFolds = resolveFoldCount(entryBinding);
      if (!nextRig.track && nextRig.folds !== nextFolds) {
        nextRig.folds = nextFolds;
        for (const panelToRefold of nextRig.panels) {
          panelToRefold.geometry = getClothGeometry(nextFolds, nextRig.fabric);
        }
      }
      nextRig.basis = resolveRigBasis(nextRig.anchor);
      nextRig.rig.scale.set(
        ...(nextRig.track
          ? [1, 1, 1]
          : [nextRig.basis[0] / 1.8, nextRig.basis[1] / 2.4, nextRig.basis[2] / 0.18])
      );
      if (nextRig.direction !== nextDirection) {
        nextRig.direction = nextDirection;
        applyRigPose(nextRig);
      }
      rigsByBindingId.set(entryBinding.id, nextRig);
      if (coverStatesByEntityId.has(entryBinding.id)) {
        updateRigTarget(nextRig, coverStatesByEntityId.get(entryBinding.id));
      }
      if (nextRig.position === null) {
        applyRigPose(nextRig);
      }
    }
    isStructureKeyDirty = true;
    markPoseDirty();
  }
  function setState(
    coverBindingId,
    receivedCoverState,
    { immediate: immediateState = false } = {}
  ) {
    if (isDisposed || coverBindingId == null) {
      return;
    }
    const coverBindingIdKey = String(coverBindingId);
    const nextMotionState = {
      position: resolveStatePosition(receivedCoverState),
      bladePosition: Number.isFinite(receivedCoverState?.tiltPosition)
        ? receivedCoverState.tiltPosition
        : null
    };
    coverStatesByEntityId.set(coverBindingIdKey, nextMotionState);
    const boundRig = rigsByBindingId.get(coverBindingIdKey);
    if (boundRig && updateRigTarget(boundRig, nextMotionState, immediateState)) {
      markPoseDirty();
    }
  }
  function isMoving() {
    return (
      !isDisposed &&
      [...rigsByBindingId.values()].some(
        pendingRig => pendingRig.position !== null && pendingRig.target !== pendingRig.position
      )
    );
  }
  function update(timestampMs) {
    if (
      !isMoving() ||
      (Number.isFinite(timestampMs) || (timestampMs = globalThis.performance?.now() ?? Date.now()),
      timestampMs >= lastUpdateMs && timestampMs - lastUpdateMs < FRAME_INTERVAL_MS)
    ) {
      return false;
    }
    lastUpdateMs =
      Number.isFinite(lastUpdateMs) && timestampMs >= lastUpdateMs
        ? timestampMs - ((timestampMs - lastUpdateMs) % FRAME_INTERVAL_MS)
        : timestampMs;
    let didAnimate = false;
    for (const movingRig of rigsByBindingId.values()) {
      if (movingRig.position === null || movingRig.target === movingRig.position) {
        continue;
      }
      if (movingRig.motionStart === null || timestampMs < movingRig.motionStart) {
        movingRig.motionStart = timestampMs;
      }
      const progressRatio = Math.min(1, (timestampMs - movingRig.motionStart) / MOTION_DURATION_MS);
      const easingFactor = progressRatio * progressRatio * (3 - progressRatio * 2);
      const nextPosition =
        progressRatio === 1
          ? movingRig.target
          : movingRig.motionFrom + (movingRig.target - movingRig.motionFrom) * easingFactor;
      if (nextPosition !== movingRig.position) {
        movingRig.position = nextPosition;
        applyRigPose(movingRig);
        didAnimate = true;
      }
    }
    return didAnimate;
  }
  function poseKey() {
    if (isPoseKeyDirty) {
      cachedPoseKey = JSON.stringify(
        [...rigsByBindingId.values()]
          .map(poseRig => [
            poseRig.binding.id,
            poseRig.binding.floorId,
            poseRig.binding.modelId,
            poseRig.binding.entityId,
            poseRig.generation,
            poseRig.direction,
            poseRig.basis,
            poseRig.folds,
            poseRig.bladePosition,
            poseRig.position === null
              ? "preview-" + resolveUnboundPosition(poseRig.binding)
              : Math.round(poseRig.position * 100) / 100
          ])
          .sort((leftPoseEntry, rightPoseEntry) =>
            leftPoseEntry[0].localeCompare(rightPoseEntry[0])
          )
      );
      isPoseKeyDirty = false;
    }
    return cachedPoseKey;
  }
  function structureKey() {
    if (isStructureKeyDirty) {
      cachedStructureKey = JSON.stringify(
        [...rigsByBindingId.values()]
          .map(structureRig => [
            structureRig.binding.id,
            structureRig.binding.floorId,
            structureRig.binding.modelId,
            structureRig.generation,
            structureRig.direction,
            structureRig.basis,
            structureRig.folds
          ])
          .sort((leftStructureEntry, rightStructureEntry) =>
            leftStructureEntry[0].localeCompare(rightStructureEntry[0])
          )
      );
      isStructureKeyDirty = false;
    }
    return cachedStructureKey;
  }
  function dispose() {
    if (!isDisposed) {
      isDisposed = true;
      for (const disposedRig of rigsByBindingId.values()) {
        disposeRig(disposedRig);
      }
      rigsByBindingId.clear();
      coverStatesByEntityId.clear();
      previousEntityIdByBindingId.clear();
      for (const cachedGeometry of clothGeometryCache.values()) {
        cachedGeometry.dispose();
      }
      clothGeometryCache.clear();
      syncedModelRoot = null;
      isPoseKeyDirty = true;
      isStructureKeyDirty = true;
      requestRender();
    }
  }
  return {
    setBindings: setBindings,
    setState: setState,
    update: update,
    isMoving: isMoving,
    poseKey: poseKey,
    structureKey: structureKey,
    dispose: dispose
  };
}
