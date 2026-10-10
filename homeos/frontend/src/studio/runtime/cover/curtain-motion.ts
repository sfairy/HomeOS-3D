const {
    normalizeCurtainTrack: normalizeTrack,
    createCurtainTrack: createTrack,
    createTrackClothGeometry: buildTrackClothGeometry,
    poseTrackCloth: poseClothGeometry,
    curtainPanelRanges: samplePanelRanges,
    createDreamBladeGeometry: createBladeGeometry,
    poseDreamBlades: poseBladeGeometry,
    createRollerCurtain: createRollerCurtain,
  } = await (import("@app/3d-studio/loaders/studio-curtain-track")),
  coverDirectionSet = new Set(["left", "right", "split"]),
  clothPartSet = new Set(["cloth", "band"]),
  trackPartSet = new Set(["rod", "cap", ...clothPartSet]),
  MOTION_DURATION_MS = 420,
  MIN_PANEL_SCALE = 0.12,
  CLOTH_FOLD_SPACING_METERS = 0.15,
  resolveCurtainFabric = (fabricBinding: any) =>
    fabricBinding.curtainFabric === "sheer" ? "sheer" : "cloth",
  resolveUnboundPosition = (unboundBinding: any) =>
    !unboundBinding.entityId && Number.isFinite(unboundBinding.unboundPosition)
      ? Math.max(0, Math.min(100, unboundBinding.unboundPosition))
      : 0,
  resolveFoldCount = (widthBinding: any) =>
    Math.max(
      4,
      Math.min(
        96,
        Math.round(
          (Number(widthBinding.curtainWidth) || 1.8) /
            (resolveCoverDirection(widthBinding) === "split" ? 2 : 1) /
            (resolveCurtainFabric(widthBinding) === "sheer" ? 0.1 : CLOTH_FOLD_SPACING_METERS),
        ),
      ),
    ),
  sceneModelKey = (floorId: any, modelId: any) =>
    JSON.stringify([String(floorId ?? ""), String(modelId ?? "")]),
  resolveCoverDirection = (directionBinding: any) =>
    coverDirectionSet.has(directionBinding.coverDirection)
      ? directionBinding.coverDirection
      : coverDirectionSet.has(directionBinding.curtainPosition)
        ? directionBinding.curtainPosition
        : "split",
  resolveStatePosition = (receivedState: any) =>
    typeof receivedState?.position == "number" && Number.isFinite(receivedState.position)
      ? Math.max(0, Math.min(100, receivedState.position))
      : null,
  // 取归一化状态里的「状态推断位置」：设备只报 opened / closed 而没报 current_position 时，
  // 仍能让 3D 窗帘摆到对应的那一端，而不是一律当作全关。
  resolveStatePositionHint = (receivedState: any) =>
    typeof receivedState?.statePositionHint == "number" &&
    Number.isFinite(receivedState.statePositionHint)
      ? Math.max(0, Math.min(100, receivedState.statePositionHint))
      : null,
  // 位置未知时骨架该摆在哪儿（0–100），三层优先级：状态推断值 → 已绑定全关 → 未绑定配置值。
  resolvePoseFallback = (posedRig: any) =>
    posedRig.statePositionHint ??
    (posedRig.binding.entityId ? 0 : resolveUnboundPosition(posedRig.binding)),
  resolveRigBasis = (rigAnchor: any) =>
    Array.isArray(rigAnchor.userData?.curtainRigBasis) &&
    rigAnchor.userData.curtainRigBasis.length === 3 &&
    rigAnchor.userData.curtainRigBasis.every(
      (basisComponent: any) =>
        typeof basisComponent == "number" && Number.isFinite(basisComponent) && basisComponent > 0,
    )
      ? [...rigAnchor.userData.curtainRigBasis]
      : [1.8, 2.4, 0.18];
function createClothGeometry(clothThree: any, folds: any, fabric: any) {
  const isSheer = fabric === "sheer",
    segmentCount = Math.max(64, folds * 6),
    panelHeight = 2.28168,
    foldAmplitude = isSheer ? 0.023 : 0.046,
    clothThickness = 0.003,
    positionArray: any = [],
    normalArray: any = [],
    uvArray: any = [],
    colorArray: any = [],
    indexArray: any[] = [],
    foldDisplacement = (seamRatio: any) => foldAmplitude * Math.sin(seamRatio * folds * Math.PI * 2),
    foldSlope = (seamSlopeRatio: any) =>
      foldAmplitude * folds * Math.PI * 2 * Math.cos(seamSlopeRatio * folds * Math.PI * 2),
    pushVertex = (
      positionX: any,
      positionY: any,
      positionZ: any,
      normalX: any,
      normalY: any,
      normalZ: any,
      textureU: any,
      textureV: any,
    ) => {
      (positionArray.push(positionX, positionY, positionZ),
        normalArray.push(normalX, normalY, normalZ),
        uvArray.push(textureU, textureV));
      const foldDarkness = 0.5 - 0.5 * Math.sin(positionX * folds * Math.PI * 2),
        foldShade = 1 - (isSheer ? 0.16 : 0.34) * foldDarkness * foldDarkness;
      colorArray.push(foldShade, foldShade, foldShade);
    };
  for (const face of isSheer ? ["front"] : ["front", "back", "top", "bottom"]) {
    const faceVertexOffset = positionArray.length / 3;
    for (let segmentIndex = 0; segmentIndex <= segmentCount; segmentIndex++) {
      const alongRatio = segmentIndex / segmentCount,
        foldOffset = foldDisplacement(alongRatio),
        foldSlopeSample = foldSlope(alongRatio),
        normalLength = Math.hypot(foldSlopeSample, 1);
      if (face === "front" || face === "back") {
        const outwardSign = face === "front" ? 1 : -1;
        for (const vertexHeight of [0, panelHeight])
          pushVertex(
            alongRatio,
            vertexHeight,
            foldOffset + (outwardSign * clothThickness) / 2,
            (-outwardSign * foldSlopeSample) / normalLength,
            0,
            outwardSign / normalLength,
            alongRatio,
            vertexHeight / panelHeight,
          );
      } else {
        const verticalSign = face === "top" ? 1 : -1;
        for (const thicknessOffset of [-clothThickness / 2, clothThickness / 2])
          pushVertex(
            alongRatio,
            verticalSign > 0 ? panelHeight : 0,
            foldOffset + thicknessOffset,
            0,
            verticalSign,
            0,
            alongRatio,
            thicknessOffset > 0 ? 1 : 0,
          );
      }
      if (segmentIndex < segmentCount) {
        const segmentVertexIndex = faceVertexOffset + segmentIndex * 2;
        face === "front" || face === "bottom"
          ? indexArray.push(
              segmentVertexIndex,
              segmentVertexIndex + 2,
              segmentVertexIndex + 1,
              segmentVertexIndex + 1,
              segmentVertexIndex + 2,
              segmentVertexIndex + 3,
            )
          : indexArray.push(
              segmentVertexIndex,
              segmentVertexIndex + 1,
              segmentVertexIndex + 2,
              segmentVertexIndex + 1,
              segmentVertexIndex + 3,
              segmentVertexIndex + 2,
            );
      }
    }
  }
  for (const edgeX of isSheer ? [] : [0, 1]) {
    const capVertexOffset = positionArray.length / 3,
      edgeNormalSign = edgeX === 0 ? -1 : 1;
    for (const edgeHeight of [0, panelHeight])
      for (const edgeThicknessOffset of [-clothThickness / 2, clothThickness / 2])
        pushVertex(
          edgeX,
          edgeHeight,
          foldDisplacement(edgeX) + edgeThicknessOffset,
          edgeNormalSign,
          0,
          0,
          edgeThicknessOffset > 0 ? 1 : 0,
          edgeHeight / panelHeight,
        );
    edgeNormalSign > 0
      ? indexArray.push(
          capVertexOffset,
          capVertexOffset + 2,
          capVertexOffset + 1,
          capVertexOffset + 1,
          capVertexOffset + 2,
          capVertexOffset + 3,
        )
      : indexArray.push(
          capVertexOffset,
          capVertexOffset + 1,
          capVertexOffset + 2,
          capVertexOffset + 1,
          capVertexOffset + 3,
          capVertexOffset + 2,
        );
  }
  const geometry = new clothThree.BufferGeometry();
  return (
    geometry.setAttribute("position", new clothThree.Float32BufferAttribute(positionArray, 3)),
    geometry.setAttribute("normal", new clothThree.Float32BufferAttribute(normalArray, 3)),
    geometry.setAttribute("uv", new clothThree.Float32BufferAttribute(uvArray, 2)),
    geometry.setAttribute("color", new clothThree.Float32BufferAttribute(colorArray, 3)),
    geometry.setIndex(indexArray),
    geometry.computeBoundingBox(),
    geometry.computeBoundingSphere(),
    geometry
  );
}
function isDescendantOf(descendant: any, ancestor: any) {
  for (let walkedNode = descendant; walkedNode; walkedNode = walkedNode.parent)
    if (walkedNode === ancestor) return true;
  return false;
}
function locateCurtainRig(environmentRoot: any) {
  const curtainParts: any = [],
    rigRoots: any = [];
  function collectRigParts(visitedNode: any) {
    if (
      !(visitedNode.userData?.curtainMotionRig || visitedNode.userData?.curtainMotionPanel) &&
      !(visitedNode !== environmentRoot && visitedNode.userData?.environmentModelId != null)
    ) {
      (visitedNode.userData?.curtainRigRoot === true && rigRoots.push(visitedNode),
        visitedNode.isMesh &&
          trackPartSet.has(visitedNode.userData?.curtainPart) &&
          curtainParts.push(visitedNode));
      for (const child of visitedNode.children || []) collectRigParts(child);
    }
  }
  if (
    (collectRigParts(environmentRoot),
    !curtainParts.some((curtainPartNode: any) => clothPartSet.has(curtainPartNode.userData.curtainPart)))
  )
    return null;
  let anchor = rigRoots.find((anchorCandidate: any) =>
    curtainParts.every((partNode: any) => isDescendantOf(partNode, anchorCandidate)),
  );
  if (!anchor) {
    for (
      anchor = curtainParts[0].parent;
      anchor && !curtainParts.every((candidatePart: any) => isDescendantOf(candidatePart, anchor));
    )
      anchor = anchor.parent;
  }
  return anchor && isDescendantOf(anchor, environmentRoot)
    ? {
        anchor: anchor,
        parts: curtainParts,
      }
    : null;
}
export function createCurtainMotion({
  THREE: three,
  requestRender: requestRender = () => {},
}: {
  THREE?: typeof import("three");
  requestRender?: () => void;
} = {}) {
  let syncedModelRoot: any = null,
    syncedSceneRevision: any,
    syncedBindingsSignature = "",
    isDisposed = false;
  const clothGeometryMap = new Map();
  function getClothGeometry(foldCount: any, fabricName: any) {
    const cacheKey = fabricName + ":" + foldCount;
    return (
      clothGeometryMap.has(cacheKey) ||
        clothGeometryMap.set(cacheKey, createClothGeometry(three, foldCount, fabricName)),
      clothGeometryMap.get(cacheKey)
    );
  }
  let rigsByBindingId = new Map(),
    coverStatesByEntityId = new Map(),
    isPoseKeyDirty = true,
    cachedPoseKey = "",
    previousEntityIdByBindingId = new Map(),
    generationCounter = 1,
    isStructureKeyDirty = true,
    cachedStructureKey = "";
  function markPoseDirty() {
    ((isPoseKeyDirty = true), requestRender());
  }
  function createRig(model: any, binding: any, located: any) {
    const isRoller = binding.coverKind === "roller",
      coveredParts = located.parts.filter(
        (coveredPart: any) =>
          isRoller ||
          located.anchor.userData.curtainRollerModel ||
          clothPartSet.has(coveredPart.userData.curtainPart),
      ),
      clothMaterials = coveredParts
        .filter((clothOnlyPart: any) => clothOnlyPart.userData.curtainPart === "cloth")
        .flatMap((partMesh: any) =>
          Array.isArray(partMesh.material) ? partMesh.material : [partMesh.material],
        )
        .filter(Boolean),
      materialBrightness = (material: any) =>
        material.color ? material.color.r + material.color.g + material.color.b : 0,
      brightestMaterial = clothMaterials.reduce(
        (bestMaterial: any, candidateMaterial: any) =>
          !bestMaterial || materialBrightness(candidateMaterial) > materialBrightness(bestMaterial)
            ? candidateMaterial
            : bestMaterial,
        null,
      ),
      fabricKind = resolveCurtainFabric(binding),
      isSheerPanel = fabricKind === "sheer",
      panelMaterial = isSheerPanel
        ? new three!.MeshStandardMaterial({
            color: 16118766,
            roughness: 1,
            metalness: 0,
            transparent: true,
            opacity: 0.68,
            depthWrite: false,
          })
        : brightestMaterial?.clone?.() ||
          new three!.MeshStandardMaterial({
            color: 13094354,
            roughness: 0.94,
            metalness: 0,
          });
    if (
      (panelMaterial.color?.lerp(new three!.Color(16777215), 0.2),
      (panelMaterial.emissiveIntensity = Math.min(panelMaterial.emissiveIntensity ?? 0, 0.06)),
      (panelMaterial.vertexColors = true),
      (panelMaterial.side = three!.DoubleSide),
      (panelMaterial.forceSinglePass = true),
      isRoller)
    ) {
      const rigBasis = resolveRigBasis(located.anchor),
        rollerCurtain = createRollerCurtain(
          three,
          {
            width: rigBasis[0],
            height: rigBasis[1],
            curtainFabric: fabricKind,
          },
          {
            material: panelMaterial,
          },
        ),
        rollerRigGroup = rollerCurtain.group;
      rollerRigGroup.userData.curtainMotionRig = true;
      for (const rollerMesh of rollerCurtain.meshes)
        Object.assign(rollerMesh.userData, {
          curtainMotionPanel: true,
          externalModelSharedGeometry: true,
          externalModelSharedMaterial: true,
          externalModelSharedTextures: true,
        });
      return (
        located.anchor.add(rollerRigGroup),
        {
          model: model,
          binding: binding,
          roller: rollerCurtain,
          fabric: fabricKind,
          anchor: located.anchor,
          parts: located.parts,
          rig: rollerRigGroup,
          basis: rigBasis,
          generation: generationCounter++,
          panels: rollerCurtain.meshes,
          material: panelMaterial,
          direction: resolveCoverDirection(binding),
          originals: new Map(
            coveredParts.map((rollerSourcePart: any) => [rollerSourcePart, rollerSourcePart.visible]),
          ),
          position: null as any,
          target: null as any,
          motionFrom: null as any,
          motionStart: null as any,
          statePositionHint: null as any,
        }
      );
    }
    const isDream = binding.coverKind === "dream",
      trackModel =
        located.anchor.userData.curtainTrackModel || isDream ? createTrack(binding) : null,
      rigFolds = resolveFoldCount(binding),
      sharedGeometry = trackModel ? null : getClothGeometry(rigFolds, fabricKind),
      rigGroup = new three!.Group(),
      basis = resolveRigBasis(located.anchor);
    ((rigGroup.name = "curtain-motion-" + binding.id),
      (rigGroup.userData.curtainMotionRig = true),
      rigGroup.scale.set(
        ...(trackModel ? [1, 1, 1] : [basis[0] / 1.8, basis[1] / 2.4, basis[2] / 0.18]),
      ),
      located.anchor.add(rigGroup));
    const panels = ["left", "right"].map((side) => {
      const panelMesh = new three!.Mesh(
        isDream
          ? createBladeGeometry(three, trackModel, basis[1])
          : trackModel
            ? buildTrackClothGeometry(three, trackModel, basis[1], fabricKind)
            : sharedGeometry,
        panelMaterial,
      );
      return (
        (panelMesh.name = "curtain-motion-" + binding.id + "-" + side),
        (panelMesh.userData.curtainMotionPanel = true),
        (panelMesh.userData.curtainSide = side),
        (panelMesh.userData.externalModelSharedGeometry = true),
        (panelMesh.userData.externalModelSharedTextures = true),
        (panelMesh.userData.externalModelSharedMaterial = true),
        trackModel || panelMesh.position.set(side === "left" ? -0.9 : 0.9, 0.06, 0),
        (panelMesh.castShadow =
          !isSheerPanel && coveredParts.some((shadowCastingPart: any) => shadowCastingPart.castShadow)),
        (panelMesh.receiveShadow = coveredParts.some(
          (shadowReceivingPart: any) => shadowReceivingPart.receiveShadow,
        )),
        (panelMesh.visible = false),
        rigGroup.add(panelMesh),
        panelMesh
      );
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
      originals: new Map(
        coveredParts.map((clothSourcePart: any) => [clothSourcePart, clothSourcePart.visible]),
      ),
      direction: resolveCoverDirection(binding),
      position: null as any,
      target: null as any,
      motionFrom: null as any,
      motionStart: null as any,
      statePositionHint: null as any,
    };
  }
  function disposeRig(discardedRig: any) {
    for (const [restoredPart, wasVisible] of discardedRig.originals)
      restoredPart.visible = wasVisible;
    if (
      (discardedRig.rig.removeFromParent(),
      discardedRig.roller?.dispose({
        keepMaterial: true,
      }),
      discardedRig.track)
    ) {
      for (const panelToDispose of discardedRig.panels) panelToDispose.geometry.dispose();
    }
    discardedRig.material.dispose();
  }
  function resetRigMotion(resetTargetRig: any) {
    ((resetTargetRig.position = null),
      (resetTargetRig.target = null),
      (resetTargetRig.motionFrom = null),
      (resetTargetRig.motionStart = null),
      (resetTargetRig.bladePosition = null),
      (resetTargetRig.statePositionHint = null),
      applyRigPose(resetTargetRig));
  }
  function applyRigPose(posedRig: any) {
    const positionRatio = posedRig.position ?? resolvePoseFallback(posedRig);
    if (posedRig.roller) {
      for (const rollerHiddenPart of posedRig.originals.keys()) rollerHiddenPart.visible = false;
      (posedRig.roller.pose(positionRatio), (isPoseKeyDirty = true));
      return;
    }
    if (posedRig.track) {
      for (const trackHiddenPart of posedRig.originals.keys()) trackHiddenPart.visible = false;
      const trackPoseKey =
        positionRatio + ":" + posedRig.direction + ":" + (posedRig.bladePosition ?? 50);
      if (posedRig.geometryPose === trackPoseKey) return;
      (samplePanelRanges(posedRig.track, positionRatio, posedRig.direction).forEach(
        (panelRange, sideIndex) => {
          const panel = posedRig.panels[sideIndex];
          panel.visible = panelRange.visible;
          const panelPose = {
            ...panelRange,
            side: sideIndex,
            split: posedRig.direction === "split",
          };
          posedRig.dream
            ? poseBladeGeometry(
                panel.geometry,
                posedRig.track,
                panelPose,
                posedRig.bladePosition ?? 50,
              )
            : poseClothGeometry(panel.geometry, posedRig.track, panelPose);
        },
      ),
        (posedRig.geometryPose = trackPoseKey),
        (isPoseKeyDirty = true));
      return;
    }
    const isSplit = posedRig.direction === "split",
      panelWidth = isSplit ? (posedRig.fabric === "sheer" ? 0.9 : 0.906) : 1.8,
      clothScale = 1 - ((1 - MIN_PANEL_SCALE) * positionRatio) / 100;
    for (const clothHiddenPart of posedRig.originals.keys()) clothHiddenPart.visible = false;
    for (const posedPanel of posedRig.panels) {
      const isLeftPanel = posedPanel.userData.curtainSide === "left";
      ((posedPanel.visible = isSplit || posedRig.direction === (isLeftPanel ? "left" : "right")),
        (posedPanel.scale.x = (isLeftPanel ? 1 : -1) * panelWidth * clothScale),
        posedPanel.updateMatrix());
    }
    isPoseKeyDirty = true;
  }
  function updateRigTarget(motionRig: any, receivedMotionState: any, immediate = false) {
    const incomingPosition = resolveStatePosition(receivedMotionState),
      nextStatePositionHint = resolveStatePositionHint(receivedMotionState),
      hasStatePositionHintChanged = motionRig.statePositionHint !== nextStatePositionHint,
      hasBladeChanged = motionRig.bladePosition !== receivedMotionState.bladePosition;
    (motionRig.bladePosition = receivedMotionState.bladePosition),
      (motionRig.statePositionHint = nextStatePositionHint),
      // 叶片角度变化要立即生效（梦幻帘调叶片不该有 420ms 的滞后）。
      hasBladeChanged && motionRig.dream && applyRigPose(motionRig);
    if (incomingPosition === null) {
      // 位置未知（设备未上报 / 掉线）：保持在当前位置不动，而不是跳回 0。
      const hasPendingMotion = motionRig.target !== motionRig.position;
      return (
        (motionRig.target = motionRig.position),
        (motionRig.motionStart = null),
        // 例外：骨架本来就没有位置、只能靠状态推断时，状态变了要按新推断重摆一次。
        hasStatePositionHintChanged && motionRig.position === null
          ? (applyRigPose(motionRig), true)
          : hasPendingMotion || hasBladeChanged
      );
    }
    if (motionRig.position === null || immediate) {
      const positionChanged =
        motionRig.position !== incomingPosition || motionRig.target !== incomingPosition;
      return (
        (motionRig.position = incomingPosition),
        (motionRig.target = incomingPosition),
        (motionRig.motionStart = null),
        positionChanged && applyRigPose(motionRig),
        positionChanged || hasBladeChanged
      );
    }
    return (
      motionRig.target === incomingPosition
        ? hasBladeChanged
        : ((motionRig.target = incomingPosition),
          (motionRig.motionFrom = motionRig.position),
          (motionRig.motionStart = null),
          true)
    );
  }
  function setBindings(modelRoot: any, bindings: any[] = [], sceneRevision: any) {
    if (isDisposed) return;
    const seenBindingIdSet = new Set(),
      seenModelKeySet = new Set(),
      normalizedBindings = (Array.isArray(bindings) ? bindings : [])
        .filter((candidateBinding) => {
          if (!candidateBinding || candidateBinding.id == null || candidateBinding.modelId == null)
            return false;
          const bindingIdKey = String(candidateBinding.id),
            rawLocationKey = sceneModelKey(candidateBinding.floorId, candidateBinding.modelId);
          return seenBindingIdSet.has(bindingIdKey) || seenModelKeySet.has(rawLocationKey)
            ? false
            : (seenBindingIdSet.add(bindingIdKey), seenModelKeySet.add(rawLocationKey), true);
        })
        .map((rawBinding) => ({
          id: String(rawBinding.id),
          entityId: String(rawBinding.entityId ?? ""),
          floorId: String(rawBinding.floorId ?? ""),
          modelId: String(rawBinding.modelId),
          curtainWidth: Number(rawBinding.curtainWidth) > 0 ? Number(rawBinding.curtainWidth) : 1.8,
          coverDirection: rawBinding.coverDirection || "auto",
          curtainPosition: rawBinding.curtainPosition || "split",
          coverKind: ["dream", "roller"].includes(rawBinding.coverKind)
            ? rawBinding.coverKind
            : "standard",
          ...normalizeTrack(rawBinding),
          curtainFabric: resolveCurtainFabric(rawBinding),
          unboundPosition: resolveUnboundPosition(rawBinding),
        })),
      bindingsSignature = JSON.stringify(normalizedBindings);
    if (
      syncedModelRoot === modelRoot &&
      syncedSceneRevision === sceneRevision &&
      syncedBindingsSignature === bindingsSignature
    )
      return;
    const entityIdByBindingId = new Map(
      normalizedBindings.map((normalizedEntry) => [normalizedEntry.id, normalizedEntry.entityId]),
    );
    for (const staleBindingId of coverStatesByEntityId.keys())
      (!entityIdByBindingId.has(staleBindingId) ||
        (previousEntityIdByBindingId.has(staleBindingId) &&
          previousEntityIdByBindingId.get(staleBindingId) !==
            entityIdByBindingId.get(staleBindingId))) &&
        coverStatesByEntityId.delete(staleBindingId);
    ((previousEntityIdByBindingId = entityIdByBindingId),
      (syncedModelRoot = modelRoot || null),
      (syncedSceneRevision = sceneRevision),
      (syncedBindingsSignature = bindingsSignature));
    const modelsByLocationKey = new Map();
    normalizedBindings.length &&
      syncedModelRoot?.traverse?.((sceneNode: any) => {
        if (
          sceneNode.userData?.environmentModelType !== "curtain" ||
          sceneNode.userData?.environmentModelId == null
        )
          return;
        let nodeFloorId = sceneNode.userData.environmentFloorId;
        for (
          let parentNode = sceneNode.parent;
          nodeFloorId == null && parentNode;
          parentNode = parentNode.parent
        )
          nodeFloorId = parentNode.userData?.environmentFloorId;
        modelsByLocationKey.set(
          sceneModelKey(nodeFloorId, sceneNode.userData.environmentModelId),
          sceneNode,
        );
      });
    const locatedEntries = normalizedBindings
        .map((locatedBinding) => {
          const environmentModel = modelsByLocationKey.get(
              sceneModelKey(locatedBinding.floorId, locatedBinding.modelId),
            ),
            locatedRig = environmentModel ? locateCurtainRig(environmentModel) : null;
          return locatedRig
            ? {
                binding: locatedBinding,
                model: environmentModel,
                located: locatedRig,
              }
            : null;
        })
        .filter(Boolean) as any[],
      reusedRigsByBindingId = new Map();
    for (const entry of locatedEntries) {
      const existingRig = rigsByBindingId.get(entry!.binding.id);
      existingRig &&
        existingRig.binding.coverKind === entry!.binding.coverKind &&
        JSON.stringify(existingRig.basis) ===
          JSON.stringify(resolveRigBasis(entry!.located.anchor)) &&
        (!existingRig.track ||
          JSON.stringify([
            normalizeTrack(existingRig.binding),
            existingRig.binding.curtainWidth,
          ]) === JSON.stringify([normalizeTrack(entry!.binding), entry!.binding.curtainWidth])) &&
        existingRig.fabric === resolveCurtainFabric(entry!.binding) &&
        existingRig.model === entry!.model &&
        existingRig.anchor === entry!.located.anchor &&
        existingRig.parts.length === entry!.located.parts.length &&
        existingRig.parts.every((part: any, partIndex: any) => part === entry!.located.parts[partIndex]) &&
        reusedRigsByBindingId.set(entry!.binding.id, existingRig);
    }
    for (const [removedBindingId, removedRig] of rigsByBindingId)
      reusedRigsByBindingId.has(removedBindingId) || disposeRig(removedRig);
    const previousRigsByBindingId = rigsByBindingId;
    rigsByBindingId = new Map();
    for (const {
      binding: entryBinding,
      model: entryModel,
      located: entryLocated,
    } of locatedEntries) {
      const nextRig =
          reusedRigsByBindingId.get(entryBinding.id) ||
          createRig(entryModel, entryBinding, entryLocated),
        previousRig = previousRigsByBindingId.get(entryBinding.id);
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
          "bladePosition",
          "statePositionHint",
        ])
          nextRig[motionFieldName] = previousRig[motionFieldName];
        applyRigPose(nextRig);
      }
      const nextDirection = resolveCoverDirection(entryBinding);
      (nextRig.binding.entityId !== entryBinding.entityId && resetRigMotion(nextRig),
        (nextRig.binding = entryBinding));
      const nextFolds = resolveFoldCount(entryBinding);
      if (!nextRig.track && !nextRig.roller && nextRig.folds !== nextFolds) {
        nextRig.folds = nextFolds;
        for (const panelToRefold of nextRig.panels)
          panelToRefold.geometry = getClothGeometry(nextFolds, nextRig.fabric);
      }
      ((nextRig.basis = resolveRigBasis(nextRig.anchor)),
        nextRig.rig.scale.set(
          ...(nextRig.track || nextRig.roller
            ? [1, 1, 1]
            : [nextRig.basis[0] / 1.8, nextRig.basis[1] / 2.4, nextRig.basis[2] / 0.18]),
        ),
        nextRig.direction !== nextDirection &&
          ((nextRig.direction = nextDirection), applyRigPose(nextRig)),
        rigsByBindingId.set(entryBinding.id, nextRig),
        coverStatesByEntityId.has(entryBinding.id) &&
          updateRigTarget(nextRig, coverStatesByEntityId.get(entryBinding.id)),
        nextRig.position === null && applyRigPose(nextRig));
    }
    ((isStructureKeyDirty = true), markPoseDirty());
  }
  function setState(
    coverBindingId: any,
    receivedCoverState: any,
    { immediate: immediateState = false } = {},
  ) {
    if (isDisposed || coverBindingId == null) return;
    const coverBindingIdKey = String(coverBindingId),
      nextMotionState = {
        position: resolveStatePosition(receivedCoverState),
        statePositionHint: resolveStatePositionHint(receivedCoverState),
        bladePosition: Number.isFinite(receivedCoverState?.tiltPosition)
          ? receivedCoverState.tiltPosition
          : null,
      };
    coverStatesByEntityId.set(coverBindingIdKey, nextMotionState);
    const boundRig = rigsByBindingId.get(coverBindingIdKey);
    boundRig && updateRigTarget(boundRig, nextMotionState, immediateState) && markPoseDirty();
  }
  function isMoving() {
    return (
      !isDisposed &&
      [...rigsByBindingId.values()].some(
        (pendingRig) => pendingRig.position !== null && pendingRig.target !== pendingRig.position,
      )
    );
  }
  function update(timestampMs: any) {
    if (!isMoving()) return false;
    Number.isFinite(timestampMs) || (timestampMs = globalThis.performance?.now() ?? Date.now());
    let hasAnimated = false;
    for (const movingRig of rigsByBindingId.values()) {
      if (movingRig.position === null || movingRig.target === movingRig.position) continue;
      (movingRig.motionStart === null || timestampMs < movingRig.motionStart) &&
        (movingRig.motionStart = timestampMs);
      const progressRatio = Math.min(1, (timestampMs - movingRig.motionStart) / MOTION_DURATION_MS),
        easingFactor = progressRatio * progressRatio * (3 - 2 * progressRatio),
        nextPosition =
          progressRatio === 1
            ? movingRig.target
            : movingRig.motionFrom + (movingRig.target - movingRig.motionFrom) * easingFactor;
      nextPosition !== movingRig.position &&
        ((movingRig.position = nextPosition), applyRigPose(movingRig), (hasAnimated = true));
    }
    return hasAnimated;
  }
  function poseKey() {
    return (
      isPoseKeyDirty &&
        ((cachedPoseKey = JSON.stringify(
          [...rigsByBindingId.values()]
            .map((poseRig) => [
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
                ? "preview-" + resolvePoseFallback(poseRig)
                : Math.round(poseRig.position * 100) / 100,
            ])
            .sort((leftPoseEntry, rightPoseEntry) =>
              leftPoseEntry[0].localeCompare(rightPoseEntry[0]),
            ),
        )),
        (isPoseKeyDirty = false)),
      cachedPoseKey
    );
  }
  function structureKey() {
    return (
      isStructureKeyDirty &&
        ((cachedStructureKey = JSON.stringify(
          [...rigsByBindingId.values()]
            .map((structureRig) => [
              structureRig.binding.id,
              structureRig.binding.floorId,
              structureRig.binding.modelId,
              structureRig.generation,
              structureRig.direction,
              structureRig.basis,
              structureRig.folds,
            ])
            .sort((leftStructureEntry, rightStructureEntry) =>
              leftStructureEntry[0].localeCompare(rightStructureEntry[0]),
            ),
        )),
        (isStructureKeyDirty = false)),
      cachedStructureKey
    );
  }
  function dispose() {
    if (!isDisposed) {
      isDisposed = true;
      for (const disposedRig of rigsByBindingId.values()) disposeRig(disposedRig);
      (rigsByBindingId.clear(), coverStatesByEntityId.clear(), previousEntityIdByBindingId.clear());
      for (const cachedGeometry of clothGeometryMap.values()) cachedGeometry.dispose();
      (clothGeometryMap.clear(),
        (syncedModelRoot = null),
        (isPoseKeyDirty = true),
        (isStructureKeyDirty = true),
        requestRender());
    }
  }
  return {
    setBindings: setBindings,
    setState: setState,
    update: update,
    isMoving: isMoving,
    poseKey: poseKey,
    structureKey: structureKey,
    dispose: dispose,
  };
}
