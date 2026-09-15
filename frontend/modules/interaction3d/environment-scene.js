import { createEnvironmentHalos } from "./environment-halos.js?v=20260915211726";
export function pageDimming(config, activeModule, isFocusMode = false) {
  const moduleKey =
    {
      climate: "environment",
      cover: "environment",
      nas: "devices",
      television: "devices",
      "vacuum-shortcut": "vacuum"
    }[activeModule] || activeModule;
  if (!["overview", "light", "environment", "devices", "vacuum", "security"].includes(moduleKey)) {
    return {
      page: moduleKey,
      strength: 0,
      enabled: false
    };
  }
  const clampPercent = (candidateValue, fallbackValue) =>
    Number.isFinite(candidateValue) ? Math.max(0, Math.min(100, candidateValue)) : fallbackValue;
  const dimStrengthPercent = clampPercent(
    config.pageDimStrength?.[moduleKey],
    moduleKey === "overview" ? 0 : clampPercent(config.environment?.dimStrength, 70)
  );
  const saturationPercent = clampPercent(
    config.pageSaturation?.[moduleKey],
    moduleKey === "overview" ? 100 : 75
  );
  return {
    page: moduleKey,
    saturation: saturationPercent,
    enabled: moduleKey !== "overview" || dimStrengthPercent > 0 || saturationPercent < 100,
    strength: Math.min(
      100,
      dimStrengthPercent +
        (isFocusMode && moduleKey !== "overview" ? clampPercent(config.focusDimStrength, 15) : 0)
    )
  };
}
const MODEL_TYPE_TO_PAGE = {
  wallac: "environment",
  floorac: "environment",
  airoutlet: "environment",
  curtain: "environment",
  nas: "devices",
  tv: "devices",
  robotvacuum: "vacuum",
  camera: "security",
  presence: "security"
};
const MODEL_TYPE_TO_DEVICE_KIND = {
  wallac: "climate",
  floorac: "climate",
  airoutlet: "climate",
  curtain: "cover",
  nas: "nas",
  tv: "television",
  robotvacuum: "vacuum",
  camera: "camera",
  presence: "presence"
};
export function pageModelBindings(floors, sceneBindings, page, floorId) {
  const bindingsByKey = new Map(
    sceneBindings.map(sceneBinding => [
      JSON.stringify([sceneBinding.floorId, sceneBinding.modelId]),
      sceneBinding
    ])
  );
  return floors
    .filter(floor => floorId === "all" || floor.id === floorId)
    .flatMap(floorOfScene =>
      (floorOfScene.scene?.items || []).flatMap(sceneItem => {
        const itemPage = MODEL_TYPE_TO_PAGE[sceneItem.type];
        if (!itemPage || (page !== "overview" && itemPage !== page)) {
          return [];
        }
        const modelBindingKey = JSON.stringify([floorOfScene.id, sceneItem.id]);
        const existingBinding = bindingsByKey.get(modelBindingKey);
        return [
          {
            ...existingBinding,
            id: existingBinding?.id || "presentation:" + modelBindingKey,
            floorId: floorOfScene.id,
            modelId: sceneItem.id,
            deviceKind: MODEL_TYPE_TO_DEVICE_KIND[sceneItem.type],
            modelType: sceneItem.type,
            modelAvailable: true,
            visible: true,
            previewOnly: !existingBinding
          }
        ];
      })
    );
}
export function createEnvironmentScene({ THREE: THREE, requestFrame: requestFrame = () => {} }) {
  const amountUniform = {
    value: 0
  };
  const modeUniform = {
    value: 0
  };
  const saturationUniform = {
    value: 0.75
  };
  const patchedMaterials = new Map();
  const variantsBySourceMaterial = new Map();
  const fadingEntries = new Set();
  const retainedRoots = new Set();
  const retainedMeshEntries = new Map();
  const prefersReducedMotion = () =>
    globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true ||
    globalThis.window?.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
  const halos = createEnvironmentHalos({
    THREE: THREE,
    modeAmount: modeUniform
  });
  const stateColors = {
    cool: new THREE.Color("#c8e2eb"),
    heat: new THREE.Color("#efd1ae"),
    other: new THREE.Color("#eee9df"),
    selected: new THREE.Color("#ffe1aa")
  };
  let sceneRoot = null;
  let rootRevision;
  let meshEntries = [];
  let isDisposed = false;
  let isEnabled = false;
  let hasTraversedScene = false;
  let bindings = [];
  let bindingsSignature = "[]";
  let entityStates = {};
  let focusedId = "";
  let selectedId = "";
  const retiredBindings = new Map();
  const activeBindings = () => [...bindings, ...retiredBindings.values()];
  let targetDimStrength = 0;
  let previousDimStrength = 0;
  let targetModeAmount = 0;
  let previousModeAmount = 0;
  let modeFadeStartMs = null;
  let materialsApplied = false;
  let configuredDimStrength = 0.7;
  const composeModelKey = (keyFloorId, modelId) =>
    JSON.stringify([String(keyFloorId ?? ""), String(modelId ?? "")]);
  const composeBindingKey = binding =>
    JSON.stringify([String(binding.id ?? ""), binding.floorId, binding.modelId]);
  const toArray = arrayCandidate =>
    Array.isArray(arrayCandidate) ? arrayCandidate : arrayCandidate ? [arrayCandidate] : [];
  const isSupportedMaterial = materialCandidate =>
    materialCandidate?.isMaterial &&
    !materialCandidate.isShaderMaterial &&
    (materialCandidate.isMeshStandardMaterial ||
      materialCandidate.isMeshPhysicalMaterial ||
      materialCandidate.isMeshBasicMaterial ||
      materialCandidate.isMeshLambertMaterial ||
      materialCandidate.isMeshPhongMaterial ||
      materialCandidate.isMeshToonMaterial);
  const createUniforms = () => ({
    amount: amountUniform,
    retain: {
      value: 0
    },
    glow: {
      value: new THREE.Color(0, 0, 0)
    },
    lift: {
      value: new THREE.Vector2(0.12, 0.8)
    }
  });
  const baseUniforms = createUniforms();
  function patchMaterial(material, uniforms, sourceMaterial = null) {
    if (!isSupportedMaterial(material) || patchedMaterials.has(material)) {
      return;
    }
    const previousOnBeforeCompile = material.onBeforeCompile;
    const previousProgramCacheKey = material.customProgramCacheKey;
    const hadOnBeforeCompile = Object.hasOwn(material, "onBeforeCompile");
    const hadProgramCacheKey = Object.hasOwn(material, "customProgramCacheKey");
    const existingPatch = sourceMaterial ? patchedMaterials.get(sourceMaterial) : null;
    const priorCompile = existingPatch?.priorCompile || previousOnBeforeCompile;
    const priorKey = existingPatch?.priorKey || previousProgramCacheKey;
    const originalOwner = sourceMaterial || material;
    const patchedOnBeforeCompile = function (shaderParameters, renderer) {
      priorCompile?.call(this, shaderParameters, renderer);
      const opaqueFragmentChunk = "#include <opaque_fragment>";
      if (
        !shaderParameters.fragmentShader.includes(opaqueFragmentChunk) ||
        ((shaderParameters.uniforms.hbEnvironmentAmount = uniforms.amount),
        (shaderParameters.uniforms.hbEnvironmentMode = modeUniform),
        (shaderParameters.uniforms.hbEnvironmentSaturation = saturationUniform),
        (shaderParameters.uniforms.hbEnvironmentRetain = uniforms.retain),
        (shaderParameters.uniforms.hbEnvironmentGlow = uniforms.glow),
        (shaderParameters.uniforms.hbEnvironmentLift = uniforms.lift),
        shaderParameters.fragmentShader.includes("uniform float hbEnvironmentAmount;"))
      ) {
        return;
      }
      shaderParameters.fragmentShader =
        "uniform float hbEnvironmentAmount;\nuniform float hbEnvironmentMode;\nuniform float hbEnvironmentSaturation;\nuniform float hbEnvironmentRetain;\nuniform vec3 hbEnvironmentGlow;\nuniform vec2 hbEnvironmentLift;\n" +
        shaderParameters.fragmentShader.replace(
          opaqueFragmentChunk,
          "float hbEnvironmentLuma = dot(outgoingLight, vec3(0.2126, 0.7152, 0.0722));\noutgoingLight = mix(outgoingLight, vec3(hbEnvironmentLuma) * vec3(1.005, 1.0, 0.99), hbEnvironmentMode * (1.0 - hbEnvironmentRetain) * (1.0 - hbEnvironmentSaturation));\noutgoingLight += hbEnvironmentGlow * hbEnvironmentMode * (vec3(hbEnvironmentLift.x) + clamp(outgoingLight, 0.0, 1.0) * hbEnvironmentLift.y);\n" +
            opaqueFragmentChunk
        );
      const colorSpaceFragmentChunk = "#include <colorspace_fragment>";
      shaderParameters.fragmentShader = shaderParameters.fragmentShader.replace(
        colorSpaceFragmentChunk,
        colorSpaceFragmentChunk +
          "\ngl_FragColor.rgb *= mix(1.0, 0.15, hbEnvironmentAmount * (1.0 - hbEnvironmentRetain));"
      );
    };
    const patchedProgramCacheKey = function () {
      return (
        (priorKey === THREE.Material.prototype.customProgramCacheKey
          ? priorCompile?.toString() || ""
          : priorKey?.call(originalOwner) || "") + "|hb-environment-saturation-v7"
      );
    };
    patchedMaterials.set(material, {
      oldCompile: previousOnBeforeCompile,
      oldKey: previousProgramCacheKey,
      hasCompile: hadOnBeforeCompile,
      hasKey: hadProgramCacheKey,
      priorCompile: priorCompile,
      priorKey: priorKey,
      compile: patchedOnBeforeCompile,
      key: patchedProgramCacheKey,
      source: sourceMaterial
    });
    material.onBeforeCompile = patchedOnBeforeCompile;
    material.customProgramCacheKey = patchedProgramCacheKey;
    material.needsUpdate = true;
  }
  function detachAppliedMaterials() {
    halos.setVisible(false);
    for (const entry of meshEntries) {
      if (entry.applied && entry.mesh.material === entry.applied) {
        entry.mesh.material = entry.original;
      }
    }
    materialsApplied = false;
  }
  function resetScene() {
    for (const retainedEntry of retainedMeshEntries.values()) {
      if (retainedEntry.applied && retainedEntry.mesh.material === retainedEntry.applied) {
        retainedEntry.mesh.material = retainedEntry.original;
      }
    }
    retainedMeshEntries.clear();
    retainedRoots.clear();
    detachAppliedMaterials();
    halos.clear();
    fadingEntries.clear();
    retiredBindings.clear();
    for (const [patchedMaterial, materialPatch] of patchedMaterials) {
      unpatchMaterial(patchedMaterial, materialPatch);
    }
    for (const variantsOfMaterial of variantsBySourceMaterial.values()) {
      for (const variant of variantsOfMaterial.values()) {
        variant.material.dispose();
      }
    }
    patchedMaterials.clear();
    variantsBySourceMaterial.clear();
    meshEntries = [];
    hasTraversedScene = false;
  }
  function unpatchMaterial(targetMaterial, patch) {
    let didRestore = false;
    if (targetMaterial.onBeforeCompile === patch.compile) {
      if (patch.hasCompile) {
        targetMaterial.onBeforeCompile = patch.oldCompile;
      } else {
        delete targetMaterial.onBeforeCompile;
      }
      didRestore = true;
    }
    if (targetMaterial.customProgramCacheKey === patch.key) {
      if (patch.hasKey) {
        targetMaterial.customProgramCacheKey = patch.oldKey;
      } else {
        delete targetMaterial.customProgramCacheKey;
      }
      didRestore = true;
    }
    if (didRestore) {
      if (!patch.source) {
        targetMaterial.dispose();
      }
      targetMaterial.needsUpdate = true;
    }
  }
  function resolveVariantMaterial(baseMaterial, targetBinding) {
    if (!isSupportedMaterial(baseMaterial)) {
      return baseMaterial;
    }
    let variantsBySource = variantsBySourceMaterial.get(baseMaterial);
    if (!variantsBySource) {
      variantsBySource = new Map();
      variantsBySourceMaterial.set(baseMaterial, variantsBySource);
    }
    const bindingKey = composeBindingKey(targetBinding);
    let resolvedVariant = variantsBySource.get(bindingKey);
    if (!resolvedVariant) {
      const variantMaterial = baseMaterial.clone();
      const variantUniforms = createUniforms();
      if (baseMaterial.defines) {
        variantMaterial.defines = {
          ...baseMaterial.defines
        };
      }
      Object.defineProperty(variantMaterial, "environmentSourceMaterial", {
        value: baseMaterial,
        configurable: true
      });
      patchMaterial(variantMaterial, variantUniforms, baseMaterial);
      resolvedVariant = {
        material: variantMaterial,
        uniforms: variantUniforms,
        binding: targetBinding
      };
      variantsBySource.set(bindingKey, resolvedVariant);
    }
    resolvedVariant.binding = targetBinding;
    resolvedVariant.uniforms.lift.value.set(
      ...(targetBinding.deviceKind === "cover"
        ? [0.025, 0.9]
        : targetBinding.deviceKind === "climate"
          ? [0.16, 1.05]
          : [0.12, 0.8])
    );
    return resolvedVariant.material;
  }
  function applyBindingMaterials() {
    if (!sceneRoot || (!isEnabled && amountUniform.value === 0 && modeUniform.value === 0)) {
      detachAppliedMaterials();
      pruneMaterialVariants();
      return;
    }
    halos.sync(
      sceneRoot,
      activeBindings(),
      rootRevision,
      new Map(
        meshEntries
          .filter(filteredEntry => filteredEntry.modelNode)
          .map(entryWithModel => [entryWithModel.modelKey, entryWithModel.modelNode])
      )
    );
    halos.setVisible(true);
    const bindingsByModelKey = new Map();
    for (const pageBinding of activeBindings()) {
      if (pageBinding.modelId != null && pageBinding.visible !== false) {
        const modelKey = composeModelKey(pageBinding.floorId, pageBinding.modelId);
        if (!bindingsByModelKey.has(modelKey)) {
          bindingsByModelKey.set(modelKey, pageBinding);
        }
      }
    }
    for (const meshEntry of meshEntries) {
      const bindingForEntry = bindingsByModelKey.get(meshEntry.modelKey);
      if (bindingForEntry) {
        const appliedMaterials = toArray(meshEntry.original).map(mappedMaterial =>
          resolveVariantMaterial(mappedMaterial, bindingForEntry)
        );
        meshEntry.applied = Array.isArray(meshEntry.original)
          ? appliedMaterials
          : appliedMaterials[0];
        meshEntry.mesh.material = meshEntry.applied;
      } else {
        if (meshEntry.applied && meshEntry.mesh.material === meshEntry.applied) {
          meshEntry.mesh.material = meshEntry.original;
        }
        meshEntry.applied = null;
      }
    }
    materialsApplied = true;
    pruneMaterialVariants();
  }
  function pruneMaterialVariants() {
    const activeBindingKeys = new Set(activeBindings().map(composeBindingKey));
    for (const [staleSourceMaterial, variantsOfSource] of variantsBySourceMaterial) {
      for (const [candidateBindingKey, removedVariant] of variantsOfSource) {
        if (!activeBindingKeys.has(candidateBindingKey)) {
          fadingEntries.delete(removedVariant);
          patchedMaterials.delete(removedVariant.material);
          removedVariant.material.dispose();
          variantsOfSource.delete(candidateBindingKey);
        }
      }
      if (!variantsOfSource.size) {
        variantsBySourceMaterial.delete(staleSourceMaterial);
      }
    }
  }
  function updateMaterialTargets(shouldAnimate = false, changedFloorIdsTarget = new Set()) {
    const highlightId = selectedId || focusedId;
    const isHighlightVisible =
      !!highlightId && bindings.some(listedBinding => listedBinding.id === highlightId);
    let didChange = false;
    for (const variantMap of variantsBySourceMaterial.values()) {
      for (const materialVariant of variantMap.values()) {
        const materialBinding = materialVariant.binding;
        const targetAmount =
          !retiredBindings.has(composeBindingKey(materialBinding)) &&
          (!isHighlightVisible || materialBinding.id === highlightId)
            ? 1
            : 0;
        const entityId =
          materialBinding.entityId ||
          (materialBinding.deviceKind === "nas"
            ? materialBinding.statusSource?.primaryEntityId
            : "");
        const stateRecord =
          entityStates instanceof Map ? entityStates.get(entityId) : entityStates?.[entityId];
        const state = stateRecord?.newState || stateRecord || {};
        const stateKey = String(state.state || "").toLowerCase();
        const isStateActive = !["", "off", "unknown", "unavailable"].includes(stateKey);
        const isSelected = materialBinding.id === selectedId;
        const intensity = targetAmount
          ? isSelected
            ? 1.45
            : materialBinding.deviceKind === "cover"
              ? 1.2
              : materialBinding.deviceKind === "climate"
                ? isStateActive
                  ? 1.35
                  : 1
                : isStateActive
                  ? 1.125
                  : 0.325
          : 0;
        const displayColor = isSelected
          ? stateColors.selected
          : (isStateActive && stateColors[stateKey]) || stateColors.other;
        const tintedRed = intensity * displayColor.r;
        const tintedGreen = intensity * displayColor.g;
        const tintedBlue = intensity * displayColor.b;
        const materialUniforms = materialVariant.uniforms;
        const glowColor = materialUniforms.glow.value;
        const nextTarget = [targetAmount, tintedRed, tintedGreen, tintedBlue];
        if (
          !materialVariant.target?.every((targetValue, index) => targetValue === nextTarget[index])
        ) {
          didChange = true;
          changedFloorIdsTarget.add(materialBinding.floorId);
          if (shouldAnimate && modeUniform.value > 0 && !prefersReducedMotion()) {
            materialVariant.fade = {
              from: [materialUniforms.retain.value, glowColor.r, glowColor.g, glowColor.b],
              started: null
            };
            fadingEntries.add(materialVariant);
          } else {
            fadingEntries.delete(materialVariant);
            materialVariant.fade = null;
            materialUniforms.retain.value = targetAmount;
            glowColor.setRGB(tintedRed, tintedGreen, tintedBlue);
            halos.setColor(materialBinding.id, glowColor);
          }
          materialVariant.target = nextTarget;
        }
      }
    }
    return didChange;
  }
  function setRoot(nextRoot, revision) {
    if (!isDisposed && (sceneRoot !== nextRoot || rootRevision !== revision)) {
      if (sceneRoot !== nextRoot) {
        resetScene();
      }
      sceneRoot = nextRoot || null;
      rootRevision = revision;
      if (!!hasTraversedScene || !!isEnabled || !!bindings.length) {
        indexSceneGraph();
        applyBindingMaterials();
        updateMaterialTargets();
        requestFrame();
      }
    }
  }
  function indexSceneGraph() {
    if (!sceneRoot?.traverse) {
      return;
    }
    const entriesByMesh = new Map([
      ...retainedMeshEntries,
      ...meshEntries.map(indexedEntry => [indexedEntry.mesh, indexedEntry])
    ]);
    const nextMeshEntries = [];
    const usedMaterials = new Set();
    sceneRoot?.traverse?.(node => {
      if (!node.isMesh || !node.material || node.userData?.environmentEffect) {
        return;
      }
      let foundModelId;
      let foundFloorId;
      let modelNode;
      for (
        let ancestorNode = node;
        ancestorNode &&
        (foundModelId == null &&
          ancestorNode.userData?.environmentModelId != null &&
          ((foundModelId = ancestorNode.userData.environmentModelId), (modelNode = ancestorNode)),
        foundFloorId == null &&
          ancestorNode.userData?.environmentFloorId != null &&
          (foundFloorId = ancestorNode.userData.environmentFloorId),
        ancestorNode !== sceneRoot);
        ancestorNode = ancestorNode.parent
      );
      const existingEntry = entriesByMesh.get(node);
      const originalMaterial =
        existingEntry?.applied && node.material === existingEntry.applied
          ? existingEntry.original
          : node.material;
      const materialEntry =
        existingEntry && originalMaterial === existingEntry.original
          ? existingEntry
          : {
              mesh: node,
              original: originalMaterial,
              applied: null
            };
      materialEntry.modelNode = modelNode;
      materialEntry.modelKey =
        foundModelId == null ? null : composeModelKey(foundFloorId, foundModelId);
      nextMeshEntries.push(materialEntry);
      entriesByMesh.delete(node);
      for (const entryOriginalMaterial of toArray(originalMaterial)) {
        usedMaterials.add(entryOriginalMaterial);
        patchMaterial(entryOriginalMaterial, baseUniforms);
      }
    });
    for (const staleEntry of entriesByMesh.values()) {
      let isRetainedSubtree = false;
      for (
        let ancestorOfStale = staleEntry.mesh;
        ancestorOfStale;
        ancestorOfStale = ancestorOfStale.parent
      ) {
        if (retainedRoots.has(ancestorOfStale)) {
          isRetainedSubtree = true;
          break;
        }
      }
      if (
        !isRetainedSubtree &&
        staleEntry.applied &&
        staleEntry.mesh.material === staleEntry.applied
      ) {
        staleEntry.mesh.material = staleEntry.original;
      }
    }
    retainedMeshEntries.clear();
    const isUnderRetainedRoot = startNode => {
      for (let ancestorOfMesh = startNode; ancestorOfMesh; ancestorOfMesh = ancestorOfMesh.parent) {
        if (retainedRoots.has(ancestorOfMesh)) {
          return true;
        }
      }
      return false;
    };
    for (const keptEntry of entriesByMesh.values()) {
      if (isUnderRetainedRoot(keptEntry.mesh)) {
        retainedMeshEntries.set(keptEntry.mesh, keptEntry);
        for (const retainedMaterial of toArray(keptEntry.original)) {
          usedMaterials.add(retainedMaterial);
        }
      }
    }
    meshEntries = nextMeshEntries;
    for (const [orphanSourceMaterial, variantsOfOrphan] of variantsBySourceMaterial) {
      if (!usedMaterials.has(orphanSourceMaterial)) {
        for (const discardedVariant of variantsOfOrphan.values()) {
          fadingEntries.delete(discardedVariant);
          patchedMaterials.delete(discardedVariant.material);
          discardedVariant.material.dispose();
        }
        variantsBySourceMaterial.delete(orphanSourceMaterial);
      }
    }
    for (const [unusedMaterial, stalePatch] of patchedMaterials) {
      if (!stalePatch.source && !usedMaterials.has(unusedMaterial)) {
        unpatchMaterial(unusedMaterial, stalePatch);
        patchedMaterials.delete(unusedMaterial);
      }
    }
    hasTraversedScene = true;
  }
  function setMode(options = {}) {
    if (isDisposed) {
      return;
    }
    if (Number.isFinite(options.saturation)) {
      const saturationRatio = Math.max(0, Math.min(100, options.saturation)) / 100;
      if (saturationRatio !== saturationUniform.value) {
        saturationUniform.value = saturationRatio;
        requestFrame();
      }
    }
    const isEnabledNext = Object.hasOwn(options, "enabled") ? options.enabled === true : isEnabled;
    if (Object.hasOwn(options, "dimStrength")) {
      const parsedDimStrength = Number(options.dimStrength);
      configuredDimStrength = Number.isFinite(parsedDimStrength)
        ? Math.max(0, Math.min(100, parsedDimStrength)) / 100
        : 0.7;
    }
    const nextBindings = Object.hasOwn(options, "bindings")
      ? Array.isArray(options.bindings)
        ? options.bindings
        : []
      : bindings;
    const nextSignature = JSON.stringify(
      nextBindings.map(
        ({
          id: bindingId,
          floorId: bindingFloorId,
          modelId: bindingModelId,
          entityId: bindingEntityId,
          visible: isVisible
        }) => [bindingId, bindingFloorId, bindingModelId, bindingEntityId, isVisible]
      )
    );
    const didBindingsChange = bindingsSignature !== nextSignature;
    const didEnabledChange = isEnabled !== isEnabledNext;
    const shouldAnimateBindings =
      didBindingsChange &&
      options.animateBindings === true &&
      modeUniform.value > 0 &&
      !prefersReducedMotion();
    if (didBindingsChange) {
      if (shouldAnimateBindings) {
        const nextBindingKeys = new Set(nextBindings.map(composeBindingKey));
        const nextModelKeys = new Set(
          nextBindings.map(nextBinding => composeModelKey(nextBinding.floorId, nextBinding.modelId))
        );
        for (const retiredBinding of bindings) {
          if (!nextBindingKeys.has(composeBindingKey(retiredBinding))) {
            retiredBindings.set(composeBindingKey(retiredBinding), retiredBinding);
          }
        }
        for (const [retiredKey, pendingBinding] of retiredBindings) {
          if (
            nextBindingKeys.has(retiredKey) ||
            nextModelKeys.has(composeModelKey(pendingBinding.floorId, pendingBinding.modelId))
          ) {
            retiredBindings.delete(retiredKey);
          }
        }
      } else {
        retiredBindings.clear();
      }
    }
    isEnabled = isEnabledNext;
    bindings = nextBindings;
    bindingsSignature = nextSignature;
    if (Object.hasOwn(options, "states")) {
      entityStates = options.states || {};
    }
    const shouldAnimateFocus =
      Object.hasOwn(options, "focusedId") &&
      (options.focusedId || "") !== focusedId &&
      !(options.selectedId ?? selectedId);
    if (Object.hasOwn(options, "focusedId")) {
      focusedId = options.focusedId || "";
    }
    if (Object.hasOwn(options, "selectedId")) {
      selectedId = options.selectedId || "";
    }
    const nextDimStrength = isEnabled ? configuredDimStrength : 0;
    const nextModeAmount = isEnabled ? 1 : 0;
    const didMotionChange =
      nextDimStrength !== targetDimStrength || nextModeAmount !== targetModeAmount;
    if (didMotionChange) {
      previousDimStrength = amountUniform.value;
      previousModeAmount = modeUniform.value;
      targetDimStrength = nextDimStrength;
      targetModeAmount = nextModeAmount;
      modeFadeStartMs = null;
    }
    if (!hasTraversedScene && (isEnabled || bindings.length)) {
      indexSceneGraph();
    }
    if (didBindingsChange || didEnabledChange || (!materialsApplied && isEnabled)) {
      applyBindingMaterials();
    }
    const changedFloorIds = new Set();
    const didMaterialTargetsChange = updateMaterialTargets(
      shouldAnimateFocus || shouldAnimateBindings,
      changedFloorIds
    );
    if (retiredBindings.size && !fadingEntries.size) {
      retiredBindings.clear();
      applyBindingMaterials();
    }
    if (didEnabledChange || didMotionChange || didBindingsChange) {
      requestFrame();
    } else if (didMaterialTargetsChange && (isEnabled || modeUniform.value > 0)) {
      requestFrame([...changedFloorIds]);
    }
  }
  function tick(timestampMs) {
    if (isDisposed) {
      return false;
    }
    halos.update();
    const isModeAnimating =
      amountUniform.value !== targetDimStrength || modeUniform.value !== targetModeAmount;
    if (!isModeAnimating && !fadingEntries.size) {
      return false;
    }
    if (!Number.isFinite(timestampMs)) {
      timestampMs = globalThis.performance?.now() ?? Date.now();
    }
    let didTickChange = false;
    const tickChangedFloorIds = new Set();
    if (isModeAnimating) {
      if (modeFadeStartMs === null) {
        modeFadeStartMs = timestampMs;
      }
      const modeFadeProgress = prefersReducedMotion()
        ? 1
        : Math.max(0, Math.min(1, (timestampMs - modeFadeStartMs) / 400));
      const dimStrengthBeforeTick = amountUniform.value;
      const modeAmountBeforeTick = modeUniform.value;
      amountUniform.value =
        modeFadeProgress === 1
          ? targetDimStrength
          : previousDimStrength +
            (targetDimStrength - previousDimStrength) * (1 - (1 - modeFadeProgress) ** 2);
      modeUniform.value =
        modeFadeProgress === 1
          ? targetModeAmount
          : previousModeAmount +
            (targetModeAmount - previousModeAmount) * (1 - (1 - modeFadeProgress) ** 2);
      didTickChange ||=
        dimStrengthBeforeTick !== amountUniform.value || modeAmountBeforeTick !== modeUniform.value;
    }
    for (const fadingEntry of fadingEntries) {
      const fade = fadingEntry.fade;
      if (fade.started === null) {
        fade.started = timestampMs;
      }
      const fadeProgress = prefersReducedMotion()
        ? 1
        : Math.max(0, Math.min(1, (timestampMs - fade.started) / 360));
      const easedProgress = fadeProgress * fadeProgress * (3 - fadeProgress * 2);
      const interpolatedTarget = fadingEntry.target.map((targetComponent, targetIndex) =>
        fadeProgress === 1
          ? targetComponent
          : fade.from[targetIndex] + (targetComponent - fade.from[targetIndex]) * easedProgress
      );
      const fadeGlowColor = fadingEntry.uniforms.glow.value;
      if (
        fadingEntry.uniforms.retain.value !== interpolatedTarget[0] ||
        fadeGlowColor.r !== interpolatedTarget[1] ||
        fadeGlowColor.g !== interpolatedTarget[2] ||
        fadeGlowColor.b !== interpolatedTarget[3]
      ) {
        didTickChange = true;
        tickChangedFloorIds.add(fadingEntry.binding.floorId);
      }
      fadingEntry.uniforms.retain.value = interpolatedTarget[0];
      fadeGlowColor.setRGB(interpolatedTarget[1], interpolatedTarget[2], interpolatedTarget[3]);
      halos.setColor(fadingEntry.binding.id, fadeGlowColor);
      if (fadeProgress === 1) {
        fadingEntries.delete(fadingEntry);
        fadingEntry.fade = null;
      }
    }
    if (retiredBindings.size && !fadingEntries.size) {
      retiredBindings.clear();
      applyBindingMaterials();
    }
    if (!isEnabled && amountUniform.value === 0 && modeUniform.value === 0) {
      detachAppliedMaterials();
    }
    if (didTickChange) {
      requestFrame(isModeAnimating ? undefined : [...tickChangedFloorIds]);
    }
    return (
      amountUniform.value !== targetDimStrength ||
      modeUniform.value !== targetModeAmount ||
      fadingEntries.size > 0
    );
  }
  return {
    setRoot: setRoot,
    setMode: setMode,
    tick: tick,
    retainRoot(root) {
      retainedRoots.add(root);
    },
    releaseRoot(releasedRoot) {
      retainedRoots.delete(releasedRoot);
    },
    get isActive() {
      return !isDisposed && (isEnabled || modeUniform.value > 0);
    },
    dispose() {
      if (!isDisposed) {
        amountUniform.value = 0;
        modeUniform.value = 0;
        isEnabled = false;
        resetScene();
        halos.dispose();
        sceneRoot = null;
        bindings = [];
        entityStates = {};
        isDisposed = true;
      }
    }
  };
}
