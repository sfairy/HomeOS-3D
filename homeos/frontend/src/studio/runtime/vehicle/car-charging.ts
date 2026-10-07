import { carState } from "./car-state";
export function createCarCharging({ requestFrame: requestFrame = () => {} } = {}) {
  let currentRoot: any,
    currentRevision: any,
    currentRetainedRoots: any = [],
    chargingEntries: any = [],
    isChargeAnimating = false,
    isDisposed = false,
    presentationGain = 1;
  const detectReducedMotion = () =>
      globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true,
    clearChargingEntries = () => {
      for (const chargingEntry of chargingEntries) disposeChargingEntry(chargingEntry);
      ((chargingEntries = []), (isChargeAnimating = false));
    },
    disposeChargingEntry = (recordToDispose: any) => {
      recordToDispose.on.value = 0;
      for (const surfacePart of recordToDispose.parts)
        (surfacePart.mesh.material === surfacePart.replacement &&
          (surfacePart.mesh.material = surfacePart.original),
          surfacePart.materials.forEach((disposedMaterial: any) => disposedMaterial.dispose()));
    },
    isVisibleUnderRoot = (candidateObject: any) => {
      for (
        let ancestorObject = candidateObject;
        ancestorObject;
        ancestorObject = ancestorObject.parent
      ) {
        if (ancestorObject.visible === false) return false;
        if (ancestorObject === currentRoot) return true;
      }
      return false;
    };
  return {
    setPresentationGain(gain: any) {
      const clampedGain = Number.isFinite(gain) ? Math.min(1, Math.max(0, gain)) : 1;
      if (isDisposed || clampedGain === presentationGain) return;
      ((presentationGain = clampedGain), clampedGain === 0 && (isChargeAnimating = false));
      let hasChanged = false;
      for (const gainEntry of chargingEntries) {
        const targetGain = gainEntry.charging ? clampedGain : 0;
        gainEntry.on.value !== targetGain &&
          ((gainEntry.on.value = targetGain), (hasChanged = true));
      }
      hasChanged && requestFrame();
    },
    sync({
      root: root,
      revision: revision,
      retainedRoots: retainedRoots = [],
      bindings: bindings = [],
      states: states = {},
    }: any) {
      if (!isDisposed) {
        if (
          currentRoot !== root ||
          currentRevision !== revision ||
          currentRetainedRoots.length !== retainedRoots.length ||
          currentRetainedRoots.some((retainedRoot: any, index: any) => retainedRoot !== retainedRoots[index])
        ) {
          const retainedRootSet = new Set([root, ...retainedRoots].filter(Boolean));
          ((chargingEntries = chargingEntries.filter((retainedEntry: any) => {
            for (
              let ancestorModel = retainedEntry.model;
              ancestorModel;
              ancestorModel = ancestorModel.parent
            )
              if (retainedRootSet.has(ancestorModel)) return true;
            return (disposeChargingEntry(retainedEntry), false);
          })),
            (currentRoot = root),
            (currentRevision = revision),
            (currentRetainedRoots = [...retainedRoots]),
            currentRoot?.traverse((sceneObject: any) => {
              if (
                sceneObject.userData?.environmentModelType !== "smallcar" ||
                chargingEntries.some((existingRecord: any) => existingRecord.model === sceneObject)
              )
                return;
              const chargeRecord = {
                model: sceneObject,
                parts: [] as any[],
                on: {
                  value: 0,
                },
                time: {
                  value: 0,
                },
              };
              (sceneObject.traverse((partMesh: any) => {
                if (!partMesh.isMesh || !partMesh.material) return;
                const sourceMaterial = partMesh.material,
                  clonedMaterials: any = [],
                  hasVehicleLength = !!partMesh.geometry?.getAttribute("hbVehicleLength"),
                  createChargedMaterial = (materialToClone: any) => {
                    if (!materialToClone.isMeshStandardMaterial) return materialToClone;
                    const clonedMaterial = materialToClone.clone(),
                      originalOnBeforeCompile = materialToClone.onBeforeCompile,
                      originalCacheKey =
                        materialToClone.customProgramCacheKey?.call(materialToClone) || "";
                    return (
                      Object.defineProperty(clonedMaterial, "runtimeSourceMaterial", {
                        value: materialToClone,
                        configurable: true,
                      }),
                      (clonedMaterial.onBeforeCompile = function (shader: any, renderer: any) {
                        (originalOnBeforeCompile?.call(this, shader, renderer),
                          (shader.uniforms.hbChargeOn = chargeRecord.on),
                          (shader.uniforms.hbChargeTime = chargeRecord.time),
                          (shader.vertexShader =
                            (hasVehicleLength ? "attribute float hbVehicleLength;\n" : "") +
                            "varying float hbChargeLength;\n" +
                            shader.vertexShader),
                          (shader.vertexShader = shader.vertexShader.replace(
                            "#include <begin_vertex>",
                            "#include <begin_vertex>\nhbChargeLength = " +
                              (hasVehicleLength ? "hbVehicleLength" : "-position.y") +
                              ";",
                          )),
                          (shader.fragmentShader =
                            "varying float hbChargeLength;\nuniform float hbChargeOn;\nuniform float hbChargeTime;\n" +
                            shader.fragmentShader),
                          (shader.fragmentShader = shader.fragmentShader.replace(
                            "#include <opaque_fragment>",
                            "\n                  float hbPhase = fract(hbChargeTime * .36);\n                  float hbBehind = mix(-3.4, 4.1, hbPhase) - hbChargeLength;\n                  float hbFlow = exp(-max(hbBehind, 0.0) * 1.9)\n                    * (1.0 - smoothstep(0.0, .20, -hbBehind)) * (1.0 - smoothstep(.90, 1.0, hbPhase));\n                  float hbRim = pow(1.0 - abs(dot(normal, normalize(vViewPosition))), 2.2);\n                  outgoingLight += vec3(.12, 1.2, .69) * hbRim * hbFlow * hbChargeOn * 3.2;\n                  #include <opaque_fragment>",
                          )));
                      }),
                      (clonedMaterial.customProgramCacheKey = () =>
                        originalCacheKey + "|hb-car-charge-surface-v2:" + Number(hasVehicleLength)),
                      clonedMaterials.push(clonedMaterial),
                      clonedMaterial
                    );
                  },
                  chargedMaterial = Array.isArray(sourceMaterial)
                    ? sourceMaterial.map(createChargedMaterial)
                    : createChargedMaterial(sourceMaterial);
                ((partMesh.material = chargedMaterial),
                  chargeRecord.parts.push({
                    mesh: partMesh,
                    original: sourceMaterial,
                    replacement: chargedMaterial,
                    materials: clonedMaterials,
                  }));
              }),
                chargingEntries.push(chargeRecord));
            }));
        }
        for (const syncEntry of chargingEntries) {
          const matchedBinding = bindings.find(
            (binding: any) =>
              binding.floorId === syncEntry.model.userData.environmentFloorId &&
              binding.modelId === syncEntry.model.userData.environmentModelId,
          );
          syncEntry.charging = !!(
            matchedBinding &&
            matchedBinding.visible !== false &&
            carState(matchedBinding, states).charging === true
          );
          const targetChargeGain = syncEntry.charging ? presentationGain : 0;
          syncEntry.on.value !== targetChargeGain &&
            ((syncEntry.on.value = targetChargeGain), requestFrame());
        }
      }
    },
    tick(deltaMs: any) {
      isChargeAnimating = false;
      for (const tickEntry of chargingEntries)
        tickEntry.on.value &&
          isVisibleUnderRoot(tickEntry.model) &&
          ((tickEntry.time.value = detectReducedMotion() ? 1.4 : deltaMs / 1000),
          (isChargeAnimating ||= !detectReducedMotion()));
      return (isChargeAnimating && requestFrame(), isChargeAnimating);
    },
    nextDelay() {
      return isChargeAnimating ? 1000 / 30 : Infinity;
    },
    dispose() {
      isDisposed ||
        ((isDisposed = true),
        clearChargingEntries(),
        (currentRoot = null),
        (currentRetainedRoots = []));
    },
  };
}
