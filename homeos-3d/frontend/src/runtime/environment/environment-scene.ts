import { bathHeaterState as bathHeaterState2 } from "../bath-heater/bath-heater";
import { createEnvironmentHalos as createEnvironmentHalos2 } from "./environment-halos";
import {
  GENERIC_DEVICE_KINDS as GENERIC_DEVICE_KINDS2,
  genericDeviceProfile as genericDeviceProfile2,
} from "../device/device-profiles";
export function pageDimming(config, activeModule, isFocusMode = false) {
  const moduleKey =
    {
      "water-heater": "devices",
      airer: "devices",
      fan: "environment",
      purifier: "environment",
      climate: "environment",
      cover: "environment",
      "temperature-humidity": "environment",
      nas: "devices",
      speaker: "devices",
      television: "devices",
      "vacuum-shortcut": "vacuum",
      ...Object.fromEntries(
        GENERIC_DEVICE_KINDS2.map((genericDeviceKind) => [genericDeviceKind, "devices"]),
      ),
    }[activeModule] || activeModule;
  if (!["overview", "light", "environment", "devices", "vacuum", "security"].includes(moduleKey))
    return {
      page: moduleKey,
      strength: 0,
      enabled: false,
    };
  const clampPercent = (candidateValue, fallbackValue) =>
      Number.isFinite(candidateValue) ? Math.max(0, Math.min(100, candidateValue)) : fallbackValue,
    dimStrengthPercent = clampPercent(
      config.pageDimStrength?.[moduleKey],
      moduleKey === "overview" ? 0 : clampPercent(config.environment?.dimStrength, 70),
    ),
    saturationPercent = clampPercent(
      config.pageSaturation?.[moduleKey],
      moduleKey === "overview" ? 100 : 75,
    );
  return {
    page: moduleKey,
    saturation: saturationPercent,
    enabled: moduleKey !== "overview" || dimStrengthPercent > 0 || saturationPercent < 100,
    strength: Math.min(
      100,
      dimStrengthPercent +
        (isFocusMode && moduleKey !== "overview" ? clampPercent(config.focusDimStrength, 15) : 0),
    ),
  };
}
const MODEL_TYPE_TO_PAGE = {
    entry: "security",
    door: "security",
    storagewaterheater: "devices",
    gaswaterheater: "devices",
    airer: "devices",
    fan: "environment",
    airpurifier: "environment",
    wallac: "environment",
    floorac: "environment",
    airoutlet: "environment",
    curtain: "environment",
    nas: "devices",
    speaker: "devices",
    tv: "devices",
    robotvacuum: "vacuum",
    camera: "security",
    presence: "security",
    ...Object.fromEntries(
      GENERIC_DEVICE_KINDS2.flatMap((profileDeviceKind) =>
        (
          genericDeviceProfile2(profileDeviceKind).modelTypes || [
            genericDeviceProfile2(profileDeviceKind).modelType,
          ]
        ).map((profileModelType) => [profileModelType, "devices"]),
      ),
    ),
  },
  MODEL_TYPE_TO_DEVICE_KIND = {
    entry: "lock",
    door: "lock",
    storagewaterheater: "climate",
    gaswaterheater: "climate",
    airer: "cover",
    fan: "climate",
    airpurifier: "climate",
    wallac: "climate",
    floorac: "climate",
    airoutlet: "climate",
    curtain: "cover",
    nas: "nas",
    speaker: "speaker",
    tv: "television",
    robotvacuum: "vacuum",
    camera: "camera",
    presence: "presence",
    ...Object.fromEntries(
      GENERIC_DEVICE_KINDS2.flatMap((mappedDeviceKind) =>
        (
          genericDeviceProfile2(mappedDeviceKind).modelTypes || [
            genericDeviceProfile2(mappedDeviceKind).modelType,
          ]
        ).map((mappedModelType) => [mappedModelType, mappedDeviceKind]),
      ),
    ),
  };
function isModelTypeBound(modelType, bindingCandidate) {
  if (!bindingCandidate) return false;
  const deviceKind = MODEL_TYPE_TO_DEVICE_KIND[modelType];
  return GENERIC_DEVICE_KINDS2.includes(deviceKind)
    ? !!bindingCandidate.deviceId
    : deviceKind === "lock"
      ? [
          "doorEntityId",
          "batteryEntityId",
          "entityId",
          "doorEventEntityId",
          "doorOpenEntityId",
          "doorCloseEntityId",
        ].some((entityFieldName) => bindingCandidate[entityFieldName])
      : deviceKind === "nas"
        ? !!(bindingCandidate.entityId || bindingCandidate.statusSource?.deviceId)
        : deviceKind === "television"
          ? !!(bindingCandidate.entityId || bindingCandidate.powerEntityId)
          : (["airpurifier", "storagewaterheater", "gaswaterheater"].includes(modelType) ||
                (["wallac", "floorac", "airoutlet"].includes(modelType) &&
                  bindingCandidate.climateType === "bath-heater")) &&
              bindingCandidate.deviceId
            ? true
            : !!bindingCandidate.entityId;
}
export function pageModelBindings(floors, sceneBindings, page, floorId) {

  const map = new Map<string, any>(
    sceneBindings.map((sceneBinding) => [
      JSON.stringify([sceneBinding.floorId, sceneBinding.modelId]),
      sceneBinding,
    ]),
  );
  return floors
    .filter((floor) => floorId === "all" || floor.id === floorId)
    .flatMap((floorOfScene) =>
      [
        ...(floorOfScene.scene?.items || []),
        ...(floorOfScene.scene?.doors || []).map((doorItem) => ({
          ...doorItem,
          id: "door:" + doorItem.id,
          type: "door",
        })),
      ].flatMap((sceneItem) => {
        const itemPage = MODEL_TYPE_TO_PAGE[sceneItem.type];
        if (!itemPage || (page !== "overview" && itemPage !== page)) return [];
        const stringify = JSON.stringify([floorOfScene.id, sceneItem.id]),
          existingBinding = map.get(stringify);
        return isModelTypeBound(sceneItem.type, existingBinding)
          ? [
              {
                ...existingBinding,
                id: existingBinding?.id || "presentation:" + stringify,
                floorId: floorOfScene.id,
                modelId: sceneItem.id,
                deviceKind: MODEL_TYPE_TO_DEVICE_KIND[sceneItem.type],
                modelType: sceneItem.type,
                modelAvailable: true,
                visible: true,
                previewOnly: !existingBinding,
              },
            ]
          : [];
      }),
    );
}
export function createEnvironmentScene({
  THREE: THREE,
  requestFrame: requestFrame = (_changedFloorIds?: unknown) => {},
  prepareMaterials: prepareMaterials = () => {},
}) {
  const options = {
      value: 0,
    },
    modeUniform = {
      value: 0,
    },
    saturationUniform = {
      value: 0.75,
    },
    patchesByMaterial = new Map(),
    variantsBySourceMaterial = new Map(),
    set = new Set<any>(),
    retainedRootSet = new Set(),

    retainedEntriesByMesh = new Map<any, any>(),
    modelKeysByRetainedRoot = new Map(),
    retainedKeySet = new Set(),
    releasedKeySet = new Set(),
    prefersReducedMotion = () =>
      globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true ||
      globalThis.window?.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true,
    halos = createEnvironmentHalos2({
      THREE: THREE,
      modeAmount: modeUniform,
    }),
    stateColors = {
      cool: new THREE.Color("#c8e2eb"),
      heat: new THREE.Color("#efd1ae"),
      other: new THREE.Color("#eee9df"),
      selected: new THREE.Color("#ffe1aa"),
    };
  let value = null,
    rootRevision,
    list = [],
    isDisposed = false,
    isEnabled = false,
    hasTraversedScene = false,
    currentBindings = [],
    text = "[]",
    entityStates = {},
    focusedId = "",
    selectedId = "";
  const retiredBindingsByKey = new Map(),
    activeBindings = () => [...currentBindings, ...retiredBindingsByKey.values()];
  let num = 0,
    previousDimStrength = 0,
    targetModeAmount = 0,
    previousModeAmount = 0,
    modeFadeStartMs = null,
    hasMaterialsApplied = false,
    configuredDimStrength = 0.7;
  const composeScopeKey = (scopeFloorId, scopeModelId) =>
      JSON.stringify([String(scopeFloorId ?? ""), String(scopeModelId ?? "")]),
    composeBindingKey = (bindingRecord) =>
      JSON.stringify([
        String(bindingRecord.id ?? ""),
        bindingRecord.floorId,
        bindingRecord.modelId,
      ]),
    toArray = (arrayCandidate) =>
      Array.isArray(arrayCandidate) ? arrayCandidate : arrayCandidate ? [arrayCandidate] : [],
    isSupportedMaterial = (materialCandidate) =>
      materialCandidate?.isMaterial &&
      !materialCandidate.isShaderMaterial &&
      (materialCandidate.isMeshStandardMaterial ||
        materialCandidate.isMeshPhysicalMaterial ||
        materialCandidate.isMeshBasicMaterial ||
        materialCandidate.isMeshLambertMaterial ||
        materialCandidate.isMeshPhongMaterial ||
        materialCandidate.isMeshToonMaterial),
    createUniforms = () => ({
      amount: options,
      retain: {
        value: 0,
      },
      glow: {
        value: new THREE.Color(0, 0, 0),
      },
      lift: {
        value: new THREE.Vector2(0.12, 0.8),
      },
    }),
    baseUniforms = createUniforms();
  function patchMaterial(material, patchUniforms, sourceMaterial = null) {
    if (!isSupportedMaterial(material) || patchesByMaterial.has(material)) return;
    const onBeforeCompile = material.onBeforeCompile,
      customProgramCacheKey = material.customProgramCacheKey,
      own = Object.hasOwn(material, "onBeforeCompile"),
      own2 = Object.hasOwn(material, "customProgramCacheKey"),
      existingPatch = sourceMaterial ? patchesByMaterial.get(sourceMaterial) : null,
      priorCompile = existingPatch?.priorCompile || onBeforeCompile,
      priorKey = existingPatch?.priorKey || customProgramCacheKey,
      originalOwner = sourceMaterial || material,
      patchedOnBeforeCompile = function (shaderParameters, renderer) {
        priorCompile?.call(this, shaderParameters, renderer);
        const opaqueFragmentChunk = "#include <opaque_fragment>";
        if (
          !shaderParameters.fragmentShader.includes(opaqueFragmentChunk) ||
          ((shaderParameters.uniforms.hbEnvironmentAmount = patchUniforms.amount),
          (shaderParameters.uniforms.hbEnvironmentMode = modeUniform),
          (shaderParameters.uniforms.hbEnvironmentSaturation = saturationUniform),
          (shaderParameters.uniforms.hbEnvironmentRetain = patchUniforms.retain),
          (shaderParameters.uniforms.hbEnvironmentGlow = patchUniforms.glow),
          (shaderParameters.uniforms.hbEnvironmentLift = patchUniforms.lift),
          shaderParameters.fragmentShader.includes("uniform float hbEnvironmentAmount;"))
        )
          return;
        shaderParameters.fragmentShader =
          "uniform float hbEnvironmentAmount;\nuniform float hbEnvironmentMode;\nuniform float hbEnvironmentSaturation;\nuniform float hbEnvironmentRetain;\nuniform vec3 hbEnvironmentGlow;\nuniform vec2 hbEnvironmentLift;\n" +
          shaderParameters.fragmentShader.replace(
            opaqueFragmentChunk,
            "float hbEnvironmentLuma = dot(outgoingLight, vec3(0.2126, 0.7152, 0.0722));\noutgoingLight = mix(outgoingLight, vec3(hbEnvironmentLuma) * vec3(1.005, 1.0, 0.99), hbEnvironmentMode * (1.0 - hbEnvironmentRetain) * (1.0 - hbEnvironmentSaturation));\noutgoingLight += hbEnvironmentGlow * hbEnvironmentMode * (vec3(hbEnvironmentLift.x) + clamp(outgoingLight, 0.0, 1.0) * hbEnvironmentLift.y);\n" +
              opaqueFragmentChunk,
          );
        const colorSpaceFragmentChunk = "#include <colorspace_fragment>";
        shaderParameters.fragmentShader = shaderParameters.fragmentShader.replace(
          colorSpaceFragmentChunk,
          colorSpaceFragmentChunk +
            ("\ngl_FragColor.rgb *= mix(1.0, " +
              (material.userData.environmentWallTop ? "1.0" : "0.15") +
              ", hbEnvironmentAmount * (1.0 - hbEnvironmentRetain));"),
        );
      },
      patchedProgramCacheKey = function () {
        return (
          (priorKey === THREE.Material.prototype.customProgramCacheKey
            ? priorCompile?.toString() || ""
            : priorKey?.call(originalOwner) || "") +
          "|hb-environment-saturation-v8:" +
          (material.userData.environmentWallTop ? "wall-top" : "ordinary")
        );
      };
    (patchesByMaterial.set(material, {
      oldCompile: onBeforeCompile,
      oldKey: customProgramCacheKey,
      hasCompile: own,
      hasKey: own2,
      priorCompile: priorCompile,
      priorKey: priorKey,
      compile: patchedOnBeforeCompile,
      key: patchedProgramCacheKey,
      source: sourceMaterial,
    }),
      (material.onBeforeCompile = patchedOnBeforeCompile),
      (material.customProgramCacheKey = patchedProgramCacheKey),
      (material.needsUpdate = true));
  }
  function detachAppliedMaterials() {
    halos.setVisible(false);
    for (const entry of list)
      entry.applied &&
        entry.mesh.material === entry.applied &&
        (entry.mesh.material = entry.original);
    hasMaterialsApplied = false;
  }
  function resetScene() {
    for (const retainedEntry of retainedEntriesByMesh.values())
      retainedEntry.applied &&
        retainedEntry.mesh.material === retainedEntry.applied &&
        (retainedEntry.mesh.material = retainedEntry.original);
    (retainedEntriesByMesh.clear(),
      retainedRootSet.clear(),
      modelKeysByRetainedRoot.clear(),
      retainedKeySet.clear(),
      releasedKeySet.clear(),
      detachAppliedMaterials(),
      halos.clear(),
      set.clear(),
      retiredBindingsByKey.clear());
    for (const [patchedMaterial, materialPatch] of patchesByMaterial)
      unpatchMaterial(patchedMaterial, materialPatch);
    for (const variantsOfMaterial of variantsBySourceMaterial.values())
      for (const variant of variantsOfMaterial.values()) variant.material.dispose();
    (patchesByMaterial.clear(),
      variantsBySourceMaterial.clear(),
      (list = []),
      (hasTraversedScene = false));
  }
  function unpatchMaterial(targetMaterial, patch) {
    let hasRestoredPatch = false;
    (targetMaterial.onBeforeCompile === patch.compile &&
      (patch.hasCompile
        ? (targetMaterial.onBeforeCompile = patch.oldCompile)
        : delete targetMaterial.onBeforeCompile,
      (hasRestoredPatch = true)),
      targetMaterial.customProgramCacheKey === patch.key &&
        (patch.hasKey
          ? (targetMaterial.customProgramCacheKey = patch.oldKey)
          : delete targetMaterial.customProgramCacheKey,
        (hasRestoredPatch = true)),
      hasRestoredPatch &&
        (patch.source || targetMaterial.dispose(), (targetMaterial.needsUpdate = true)));
  }
  function resolveVariantMaterial(baseMaterial, targetBinding) {
    if (!isSupportedMaterial(baseMaterial)) return baseMaterial;
    let variantsBySource = variantsBySourceMaterial.get(baseMaterial);
    variantsBySource ||
      ((variantsBySource = new Map()),
      variantsBySourceMaterial.set(baseMaterial, variantsBySource));
    const bindingKey = composeBindingKey(targetBinding);
    let resolvedVariant = variantsBySource.get(bindingKey);
    if (!resolvedVariant) {
      const clone = baseMaterial.clone(),
        variantUniforms = createUniforms();
      (baseMaterial.defines &&
        (clone.defines = {
          ...baseMaterial.defines,
        }),
        Object.defineProperty(clone, "environmentSourceMaterial", {
          value: baseMaterial,
          configurable: true,
        }),
        patchMaterial(clone, variantUniforms, baseMaterial),
        (resolvedVariant = {
          material: clone,
          uniforms: variantUniforms,
          binding: targetBinding,
        }),
        variantsBySource.set(bindingKey, resolvedVariant));
    }
    return (
      (resolvedVariant.binding = targetBinding),
      resolvedVariant.uniforms.lift.value.set(
        ...(targetBinding.deviceKind === "cover"
          ? [0.025, 0.9]
          : targetBinding.deviceKind === "climate"
            ? [0.16, 1.05]
            : [0.12, 0.8]),
      ),
      halos.setColor(targetBinding.id, resolvedVariant.uniforms.glow.value),
      resolvedVariant.material
    );
  }
  function applyBindingMaterials() {
    if (!value || (!isEnabled && options.value === 0 && modeUniform.value === 0)) {
      (detachAppliedMaterials(), pruneMaterialVariants());
      return;
    }
    (halos.sync(
      value,
      activeBindings(),
      rootRevision,
      new Map(
        list
          .filter((filteredEntry) => filteredEntry.modelNode)
          .map((entryWithModel) => [entryWithModel.modelKey, entryWithModel.modelNode]),
      ),
    ),
      halos.setVisible(true));
    const bindingsByModelKey = new Map();
    for (const pageBinding of activeBindings())
      if (pageBinding.modelId != null && pageBinding.visible !== false) {
        const modelKey = composeScopeKey(pageBinding.floorId, pageBinding.modelId);
        bindingsByModelKey.has(modelKey) || bindingsByModelKey.set(modelKey, pageBinding);
      }
    for (const meshEntry of list) {
      const bindingForEntry = bindingsByModelKey.get(meshEntry.modelKey);
      if (bindingForEntry) {
        const appliedMaterials = toArray(meshEntry.original).map((mappedMaterial) =>
          resolveVariantMaterial(mappedMaterial, bindingForEntry),
        );
        ((meshEntry.applied = Array.isArray(meshEntry.original)
          ? appliedMaterials
          : appliedMaterials[0]),
          (meshEntry.mesh.material = meshEntry.applied));
      } else
        (meshEntry.applied &&
          meshEntry.mesh.material === meshEntry.applied &&
          (meshEntry.mesh.material = meshEntry.original),
          (meshEntry.applied = null));
    }
    ((hasMaterialsApplied = true), pruneMaterialVariants());
  }
  function pruneMaterialVariants() {
    const activeBindingKeySet = new Set(activeBindings().map(composeBindingKey));
    for (const [staleSourceMaterial, variantsOfSource] of variantsBySourceMaterial) {
      for (const [candidateBindingKey, removedVariant] of variantsOfSource) {
        const scopeKey = composeScopeKey(
          removedVariant.binding.floorId,
          removedVariant.binding.modelId,
        );
        retainedKeySet.has(scopeKey)
          ? (set.delete(removedVariant),
            (removedVariant.fade = null),
            (removedVariant.target = null))
          : !activeBindingKeySet.has(candidateBindingKey) &&
            !releasedKeySet.has(scopeKey) &&
            (set.delete(removedVariant),
            patchesByMaterial.delete(removedVariant.material),
            removedVariant.material.dispose(),
            variantsOfSource.delete(candidateBindingKey));
      }
      variantsOfSource.size || variantsBySourceMaterial.delete(staleSourceMaterial);
    }
  }
  function updateMaterialTargets(shouldAnimate = false, changedFloorIdTargetSet = new Set()) {
    const highlightId = selectedId || focusedId,
      some =
        !!highlightId &&
        currentBindings.some(
          (listedBinding) => (listedBinding.entryId || listedBinding.id) === highlightId,
        );
    let hasTargetChanged = false;
    for (const variantMap of variantsBySourceMaterial.values())
      for (const materialVariant of variantMap.values()) {
        const binding = materialVariant.binding;
        if (retainedKeySet.has(composeScopeKey(binding.floorId, binding.modelId))) continue;
        const targetAmount =
            !retiredBindingsByKey.has(composeBindingKey(binding)) &&
            (!some || (binding.entryId || binding.id) === highlightId)
              ? 1
              : 0,
          entityId =
            binding.entityId ||
            (binding.deviceKind === "nas" ? binding.statusSource?.primaryEntityId : ""),
          stateRecord =
            entityStates instanceof Map ? entityStates.get(entityId) : entityStates?.[entityId],
          state = stateRecord?.newState || stateRecord || {},
          lowerCase = String(state.state || "").toLowerCase(),
          bathHeaterFeedback =
            binding.climateType === "bath-heater" ? bathHeaterState2(binding, entityStates) : null,
          isStateActive = bathHeaterFeedback
            ? bathHeaterFeedback.on
            : !["", "off", "unknown", "unavailable"].includes(lowerCase),
          isSelected = (binding.entryId || binding.id) === selectedId,
          intensity = targetAmount
            ? isSelected
              ? 1.45
              : binding.deviceKind === "cover"
                ? 1.2
                : binding.deviceKind === "climate"
                  ? isStateActive
                    ? 1.35
                    : 1
                  : isStateActive
                    ? 1.125
                    : 0.325
            : 0,
          selected = isSelected
            ? stateColors.selected
            : (isStateActive && stateColors[bathHeaterFeedback?.visualMode || lowerCase]) ||
              stateColors.other,
          tintedRed = intensity * selected.r,
          tintedGreen = intensity * selected.g,
          tintedBlue = intensity * selected.b,
          uniforms = materialVariant.uniforms,
          glowColor = uniforms.glow.value,
          nextTarget = [targetAmount, tintedRed, tintedGreen, tintedBlue];
        materialVariant.target?.every((targetValue, index) => targetValue === nextTarget[index]) ||
          ((hasTargetChanged = true),
          changedFloorIdTargetSet.add(binding.floorId),
          shouldAnimate && modeUniform.value > 0 && !prefersReducedMotion()
            ? ((materialVariant.fade = {
                from: [uniforms.retain.value, glowColor.r, glowColor.g, glowColor.b],
                started: null,
              }),
              set.add(materialVariant))
            : (set.delete(materialVariant),
              (materialVariant.fade = null),
              (uniforms.retain.value = targetAmount),
              glowColor.setRGB(tintedRed, tintedGreen, tintedBlue),
              halos.setColor(binding.id, glowColor)),
          (materialVariant.target = nextTarget));
      }
    return hasTargetChanged;
  }
  function setRoot(nextRoot, revision) {
    isDisposed ||
      (value === nextRoot && rootRevision === revision) ||
      (value !== nextRoot && resetScene(),
      (value = nextRoot || null),
      (rootRevision = revision),
      !(!hasTraversedScene && !isEnabled && !currentBindings.length) &&
        (indexSceneGraph(), applyBindingMaterials(), updateMaterialTargets(), requestFrame()));
  }
  function preparePresentationMaterials(targetRoot, targetRevision) {
    isDisposed || (setRoot(targetRoot, targetRevision), hasTraversedScene || indexSceneGraph());
  }
  function indexSceneGraph() {
    if (!value?.traverse) return;
    prepareMaterials();
    const entriesByMesh = new Map<any, any>([
        ...retainedEntriesByMesh,
        ...list.map((indexedEntry): [any, any] => [indexedEntry.mesh, indexedEntry]),
      ]),
      nextMeshEntries = [],
      usedMaterialSet = new Set();
    value?.traverse?.((node) => {
      if (!node.isMesh || !node.material || node.userData?.environmentEffect) return;
      for (let exportRoleNode = node; exportRoleNode; exportRoleNode = exportRoleNode.parent) {
        if (["background", "grid"].includes(exportRoleNode.userData?.exportRole)) return;
        if (exportRoleNode === value) break;
      }
      let foundModelId, foundFloorId, modelNode;
      for (
        let ancestorNode = node;
        ancestorNode &&
        (foundModelId == null &&
          ancestorNode.userData?.environmentModelId != null &&
          ((foundModelId = ancestorNode.userData.environmentModelId), (modelNode = ancestorNode)),
        foundFloorId == null &&
          ancestorNode.userData?.environmentFloorId != null &&
          (foundFloorId = ancestorNode.userData.environmentFloorId),
        ancestorNode !== value);
        ancestorNode = ancestorNode.parent
      );
      const existingEntry = entriesByMesh.get(node),
        original =
          existingEntry?.applied && node.material === existingEntry.applied
            ? existingEntry.original
            : node.material,
        materialEntry =
          existingEntry && original === existingEntry.original
            ? existingEntry
            : {
                mesh: node,
                original: original,
                applied: null,
              };
      ((materialEntry.modelNode = modelNode),
        (materialEntry.modelKey =
          foundModelId == null ? null : composeScopeKey(foundFloorId, foundModelId)),
        nextMeshEntries.push(materialEntry),
        entriesByMesh.delete(node));
      for (const entryOriginalMaterial of toArray(original))
        (usedMaterialSet.add(entryOriginalMaterial),
          patchMaterial(entryOriginalMaterial, baseUniforms));
    });
    for (const staleEntry of entriesByMesh.values()) {
      let isRetainedSubtree = false;
      for (let mesh = staleEntry.mesh; mesh; mesh = mesh.parent)
        if (retainedRootSet.has(mesh)) {
          isRetainedSubtree = true;
          break;
        }
      !isRetainedSubtree &&
        staleEntry.applied &&
        staleEntry.mesh.material === staleEntry.applied &&
        (staleEntry.mesh.material = staleEntry.original);
    }
    retainedEntriesByMesh.clear();
    const isUnderRetainedRoot = (startNode) => {
      for (let ancestorOfMesh = startNode; ancestorOfMesh; ancestorOfMesh = ancestorOfMesh.parent)
        if (retainedRootSet.has(ancestorOfMesh)) return true;
      return false;
    };
    for (const keptEntry of entriesByMesh.values())
      if (isUnderRetainedRoot(keptEntry.mesh)) {
        retainedEntriesByMesh.set(keptEntry.mesh, keptEntry);
        for (const retainedMaterial of toArray(keptEntry.original))
          usedMaterialSet.add(retainedMaterial);
      }
    list = nextMeshEntries;
    for (const [orphanSourceMaterial, variantsOfOrphan] of variantsBySourceMaterial)
      if (!usedMaterialSet.has(orphanSourceMaterial)) {
        for (const discardedVariant of variantsOfOrphan.values())
          (set.delete(discardedVariant),
            patchesByMaterial.delete(discardedVariant.material),
            discardedVariant.material.dispose());
        variantsBySourceMaterial.delete(orphanSourceMaterial);
      }
    for (const [unusedMaterial, stalePatch] of patchesByMaterial)
      !stalePatch.source &&
        !usedMaterialSet.has(unusedMaterial) &&
        (unpatchMaterial(unusedMaterial, stalePatch), patchesByMaterial.delete(unusedMaterial));
    hasTraversedScene = true;
  }
  function setMode(modeOptions: Record<string, any> = {}) {
    if (isDisposed) return;
    if (Number.isFinite(modeOptions.saturation)) {
      const saturationRatio = Math.max(0, Math.min(100, modeOptions.saturation)) / 100;
      saturationRatio !== saturationUniform.value &&
        ((saturationUniform.value = saturationRatio), requestFrame());
    }
    const isEnabledNext = Object.hasOwn(modeOptions, "enabled")
      ? modeOptions.enabled === true
      : isEnabled;
    if (Object.hasOwn(modeOptions, "dimStrength")) {
      const parsedDimStrength = Number(modeOptions.dimStrength);
      configuredDimStrength = Number.isFinite(parsedDimStrength)
        ? Math.max(0, Math.min(100, parsedDimStrength)) / 100
        : 0.7;
    }
    const own3 = Object.hasOwn(modeOptions, "bindings") && releasedKeySet.size > 0;
    own3 && releasedKeySet.clear();
    const bindings = Object.hasOwn(modeOptions, "bindings")
        ? Array.isArray(modeOptions.bindings)
          ? modeOptions.bindings
          : []
        : currentBindings,
      nextSignature = JSON.stringify(
        bindings.map(
          ({
            id: bindingId,
            entryId: bindingEntryId,
            floorId: bindingFloorId,
            modelId: bindingModelId,
            entityId: bindingEntityId,
            visible: isVisible,
          }) => [
            bindingId,
            bindingEntryId,
            bindingFloorId,
            bindingModelId,
            bindingEntityId,
            isVisible,
          ],
        ),
      ),
      hasBindingsChanged = text !== nextSignature,
      hasEnabledChanged = isEnabled !== isEnabledNext,
      shouldAnimateBindings =
        hasBindingsChanged &&
        modeOptions.animateBindings === true &&
        modeUniform.value > 0 &&
        !prefersReducedMotion();
    if (hasBindingsChanged) {
      if (shouldAnimateBindings) {
        const nextBindingKeySet = new Set(bindings.map(composeBindingKey)),
          nextModelKeySet = new Set(
            bindings.map((nextBinding) =>
              composeScopeKey(nextBinding.floorId, nextBinding.modelId),
            ),
          );
        for (const retiredBinding of currentBindings)
          nextBindingKeySet.has(composeBindingKey(retiredBinding)) ||
            retiredBindingsByKey.set(composeBindingKey(retiredBinding), retiredBinding);
        for (const [retiredKey, pendingBinding] of retiredBindingsByKey)
          (nextBindingKeySet.has(retiredKey) ||
            nextModelKeySet.has(composeScopeKey(pendingBinding.floorId, pendingBinding.modelId))) &&
            retiredBindingsByKey.delete(retiredKey);
      } else retiredBindingsByKey.clear();
    }
    ((isEnabled = isEnabledNext),
      (currentBindings = bindings),
      (text = nextSignature),
      Object.hasOwn(modeOptions, "states") && (entityStates = modeOptions.states || {}));
    const own4 =
      Object.hasOwn(modeOptions, "focusedId") &&
      (modeOptions.focusedId || "") !== focusedId &&
      !(modeOptions.selectedId ?? selectedId);
    (Object.hasOwn(modeOptions, "focusedId") && (focusedId = modeOptions.focusedId || ""),
      Object.hasOwn(modeOptions, "selectedId") && (selectedId = modeOptions.selectedId || ""));
    const nextDimStrength = isEnabled ? configuredDimStrength : 0,
      nextModeAmount = isEnabled ? 1 : 0,
      hasMotionChanged = nextDimStrength !== num || nextModeAmount !== targetModeAmount;
    (hasMotionChanged &&
      ((previousDimStrength = options.value),
      (previousModeAmount = modeUniform.value),
      (num = nextDimStrength),
      (targetModeAmount = nextModeAmount),
      (modeFadeStartMs = null)),
      !hasTraversedScene && (isEnabled || currentBindings.length) && indexSceneGraph(),
      (hasBindingsChanged || hasEnabledChanged || (!hasMaterialsApplied && isEnabled)) &&
        applyBindingMaterials());
    const changedFloorIdSet = new Set();
    own3 && pruneMaterialVariants();
    const hasMaterialTargetsChanged = updateMaterialTargets(
      own4 || shouldAnimateBindings,
      changedFloorIdSet,
    );
    (retiredBindingsByKey.size &&
      !set.size &&
      (retiredBindingsByKey.clear(), applyBindingMaterials()),
      hasEnabledChanged || hasMotionChanged || hasBindingsChanged
        ? requestFrame()
        : hasMaterialTargetsChanged &&
          (isEnabled || modeUniform.value > 0) &&
          requestFrame([...changedFloorIdSet]));
  }
  function tick(timestampMs) {
    if (isDisposed) return false;
    halos.update();
    const isModeAnimating = options.value !== num || modeUniform.value !== targetModeAmount;
    if (!isModeAnimating && !set.size) return false;
    Number.isFinite(timestampMs) || (timestampMs = globalThis.performance?.now() ?? Date.now());
    let hasTickChanged = false;
    const tickChangedFloorIdSet = new Set();
    if (isModeAnimating) {
      modeFadeStartMs === null && (modeFadeStartMs = timestampMs);
      const modeFadeProgress = prefersReducedMotion()
          ? 1
          : Math.max(0, Math.min(1, (timestampMs - modeFadeStartMs) / 400)),
        dimStrengthBeforeTick = options.value,
        modeAmountBeforeTick = modeUniform.value;
      ((options.value =
        modeFadeProgress === 1
          ? num
          : previousDimStrength + (num - previousDimStrength) * (1 - (1 - modeFadeProgress) ** 2)),
        (modeUniform.value =
          modeFadeProgress === 1
            ? targetModeAmount
            : previousModeAmount +
              (targetModeAmount - previousModeAmount) * (1 - (1 - modeFadeProgress) ** 2)),
        (hasTickChanged ||=
          dimStrengthBeforeTick !== options.value || modeAmountBeforeTick !== modeUniform.value));
    }
    for (const fadingEntry of set) {
      const fade = fadingEntry.fade;
      fade.started === null && (fade.started = timestampMs);
      const fadeProgress = prefersReducedMotion()
          ? 1
          : Math.max(0, Math.min(1, (timestampMs - fade.started) / 360)),
        easedProgress = fadeProgress * fadeProgress * (3 - 2 * fadeProgress),
        interpolatedTarget = fadingEntry.target.map((targetComponent, targetIndex) =>
          fadeProgress === 1
            ? targetComponent
            : fade.from[targetIndex] + (targetComponent - fade.from[targetIndex]) * easedProgress,
        ),
        fadeGlowColor = fadingEntry.uniforms.glow.value;
      ((fadingEntry.uniforms.retain.value !== interpolatedTarget[0] ||
        fadeGlowColor.r !== interpolatedTarget[1] ||
        fadeGlowColor.g !== interpolatedTarget[2] ||
        fadeGlowColor.b !== interpolatedTarget[3]) &&
        ((hasTickChanged = true), tickChangedFloorIdSet.add(fadingEntry.binding.floorId)),
        (fadingEntry.uniforms.retain.value = interpolatedTarget[0]),
        fadeGlowColor.setRGB(interpolatedTarget[1], interpolatedTarget[2], interpolatedTarget[3]),
        halos.setColor(fadingEntry.binding.id, fadeGlowColor),
        fadeProgress === 1 && (set.delete(fadingEntry), (fadingEntry.fade = null)));
    }
    return (
      retiredBindingsByKey.size &&
        !set.size &&
        (retiredBindingsByKey.clear(), applyBindingMaterials()),
      !isEnabled && options.value === 0 && modeUniform.value === 0 && detachAppliedMaterials(),
      hasTickChanged && requestFrame(isModeAnimating ? undefined : [...tickChangedFloorIdSet]),
      options.value !== num || modeUniform.value !== targetModeAmount || set.size > 0
    );
  }
  function retainRoot(root) {
    retainedRootSet.add(root);
    const retainedModelKeySet = new Set();
    (root.traverse((traversedNode) => {
      traversedNode.userData?.environmentModelId != null &&
        retainedModelKeySet.add(
          composeScopeKey(
            traversedNode.userData.environmentFloorId,
            traversedNode.userData.environmentModelId,
          ),
        );
    }),
      modelKeysByRetainedRoot.set(root, retainedModelKeySet));
    for (const retainedModelKey of retainedModelKeySet)
      (retainedKeySet.add(retainedModelKey), releasedKeySet.delete(retainedModelKey));
    pruneMaterialVariants();
  }
  function releaseRoot(releasedRoot, { dispose: shouldDispose = false } = {}) {
    const releasedModelKeySet = modelKeysByRetainedRoot.get(releasedRoot) || new Set();
    (retainedRootSet.delete(releasedRoot),
      modelKeysByRetainedRoot.delete(releasedRoot),
      retainedKeySet.clear());
    for (const modelKeySet of modelKeysByRetainedRoot.values())
      for (const nestedModelKey of modelKeySet) retainedKeySet.add(nestedModelKey);
    for (const releasedModelKey of releasedModelKeySet)
      shouldDispose
        ? releasedKeySet.delete(releasedModelKey)
        : releasedKeySet.add(releasedModelKey);
    if (shouldDispose) {
      indexSceneGraph();
      const activeModelKeySet = new Set(list.map((listedMeshEntry) => listedMeshEntry.modelKey));
      for (const [prunedSourceMaterial, variantsOfPrunedSource] of variantsBySourceMaterial) {
        for (const [variantBindingKey, variantEntry] of variantsOfPrunedSource) {
          const variantScopeKey = composeScopeKey(
            variantEntry.binding.floorId,
            variantEntry.binding.modelId,
          );
          !releasedModelKeySet.has(variantScopeKey) ||
            retainedKeySet.has(variantScopeKey) ||
            activeModelKeySet.has(variantScopeKey) ||
            (set.delete(variantEntry),
            patchesByMaterial.delete(variantEntry.material),
            variantEntry.material.dispose(),
            variantsOfPrunedSource.delete(variantBindingKey));
        }
        variantsOfPrunedSource.size || variantsBySourceMaterial.delete(prunedSourceMaterial);
      }
      pruneMaterialVariants();
    }
  }
  return {
    setRoot: setRoot,
    setMode: setMode,
    tick: tick,
    preparePresentationMaterials: preparePresentationMaterials,
    retainRoot: retainRoot,
    releaseRoot: releaseRoot,
    get isActive() {
      return !isDisposed && (isEnabled || modeUniform.value > 0);
    },
    dispose() {
      isDisposed ||
        ((options.value = 0),
        (modeUniform.value = 0),
        (isEnabled = false),
        resetScene(),
        halos.dispose(),
        (value = null),
        (currentBindings = []),
        (entityStates = {}),
        (isDisposed = true));
    },
  };
}
