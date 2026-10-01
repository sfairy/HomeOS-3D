export const BACKGROUND_THEMES = [
    ["grid", "经典网格"],
    ["dots", "微光星尘"],
  ],
  normalizeBackgroundTheme = (themeName) =>
    themeName === "dots" || themeName === "contours" ? "dots" : "grid";
const groundThemeUniformDeclarations =
    "\nvarying vec2 vHbGround;\nuniform float hbGroundTheme;\nuniform float hbGroundSpan;\nuniform float hbGroundCoverage;\nuniform float hbGroundFallback;\nuniform vec2 hbGroundCenter;\nuniform vec3 hbGroundDeep;\nuniform float hbGroundActivity;\nuniform vec3 hbGroundPulse;\nuniform vec3 hbGroundInk;\nuniform vec3 hbGroundAccent;\n",
  groundThemeShaderSource =
    "\nif (hbGroundTheme > 0.5) {\ndiffuseColor.a = (hbGroundFallback >= 0.0 ? hbGroundFallback : diffuseColor.a) / hbGroundCoverage;\nvec2 bgP = vHbGround - hbGroundCenter;\nvec2 bgUV = bgP / hbGroundSpan;\nfloat bgR2 = dot(bgUV, bgUV);\nfloat bgHalo = exp(-bgR2 * 0.55);\nfloat bgCore = exp(-bgR2 * 2.4);\nfloat bgFade = 1.0 - smoothstep(2.2, 4.2, length(bgUV));\nfloat bgAge = hbGroundPulse.z;\n// A broad, quiet response; never a sharp concentric ring.\nvec2 bgTouch = (vHbGround - hbGroundPulse.xy) / (hbGroundSpan * 0.38);\nfloat bgFeedback = exp(-dot(bgTouch, bgTouch) * 0.6)\n  * max(0.0, 1.0 - bgAge / 1.25);\nvec3 bgBase = mix(diffuseColor.rgb * 0.34, hbGroundDeep, 0.84);\nbgBase *= mix(1.0, 0.62, smoothstep(0.65, 2.8, length(bgUV)));\nvec3 bgLight = hbGroundInk * bgHalo * 0.085 + hbGroundAccent * bgCore * 0.014;\n  // Uneven, widely separated motes. Fixed world size and pixel coverage keep\n  // far points from turning into a dense, equally bright dotted wallpaper.\n  vec2 bgCellP = bgUV / 0.44;\n  vec2 bgCell = floor(bgCellP);\n  float bgSeed = fract(sin(dot(bgCell, vec2(127.1, 311.7))) * 43758.5453);\n  float bgSeed2 = fract(sin(dot(bgCell, vec2(269.5, 183.3))) * 43758.5453);\n  vec2 bgOffset = vec2(bgSeed, bgSeed2) * 0.64 + 0.18;\n  float bgDistance = length(fract(bgCellP) - bgOffset);\n  float bgAA = max(length(fwidth(bgCellP)), 0.0001);\n  float bgRadius = mix(0.004, 0.012, bgSeed2);\n  float bgPoint = (1.0 - smoothstep(bgRadius, bgRadius + bgAA * 0.75, bgDistance))\n    * min(1.0, bgRadius / bgAA) * step(0.66, bgSeed);\n  float bgVeil = (0.2 + 0.8 * exp(-bgR2 * 0.22)) * bgFade;\n  bgLight += hbGroundAccent * bgPoint * bgVeil * (0.32 + hbGroundActivity * 0.06);\ndiffuseColor.rgb = bgBase + bgLight * (1.0 + hbGroundActivity * 0.12)\n  + hbGroundAccent * bgFeedback * bgFade * 0.009;\n}\n";
export function createBackgroundTheme(
  sceneHost,
  onThemeChanged = () => {},
  clock = () => performance.now(),
) {
  const { THREE: three } = sceneHost,
    recordsByMesh = new Map(),
    hiddenGridMeshSet = new Set(),
    uniformsByMaterial = new WeakMap(),
    raycaster = new three.Raycaster(),
    pointerNdc = new three.Vector2(),
    inkColor = new three.Color("#6b8199"),
    accentColor = new three.Color("#b5cbd8"),
    deepColor = new three.Color("#182431"),
    shouldReduceMotion =
      globalThis.window?.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
  let currentTheme = "grid",
    isSyncEnabled = true,
    isDisposed = false,
    isActive = false,
    lastInteractionMs = -Infinity,
    lastHitMs = -Infinity,
    hoveredMesh = null,
    primaryMesh = null;
  const pulsePosition = new three.Vector2(),
    blendPropertyNames = [
      "blending",
      "blendEquation",
      "blendSrc",
      "blendDst",
      "blendEquationAlpha",
      "blendSrcAlpha",
      "blendDstAlpha",
    ],
    isBackgroundVisible = (testedMesh) =>
      !(
        testedMesh.userData.floorBackgroundHidden && !testedMesh.userData.backgroundThemeKeepVisible
      );
  function restoreMeshRecord(meshRecord) {
    const {
      material: meshMaterial,
      beforeCompile: savedBeforeCompile,
      programKey: savedProgramKey,
    } = meshRecord;
    ((meshRecord.uniforms.hbGroundTheme.value = 0),
      delete meshRecord.object.userData.backgroundThemeKeepVisible);
    for (const blendName of blendPropertyNames)
      meshMaterial[blendName] = meshRecord.blend[blendName];
    (meshMaterial.onBeforeCompile === meshRecord.compile &&
      (meshMaterial.onBeforeCompile = savedBeforeCompile),
      meshMaterial.customProgramCacheKey === meshRecord.key &&
        (meshMaterial.customProgramCacheKey = savedProgramKey),
      (meshMaterial.needsUpdate = true));
  }
  function buildMeshRecord(targetMesh) {
    const targetMaterial = targetMesh.material;
    if (!targetMaterial?.isMeshBasicMaterial || !targetMesh.geometry?.parameters?.width) return;
    const themeRecord = {
        object: targetMesh,
        material: targetMaterial,
        beforeCompile: targetMaterial.onBeforeCompile,
        programKey: targetMaterial.customProgramCacheKey,
        blend: Object.fromEntries(
          blendPropertyNames.map((blendKey) => [blendKey, targetMaterial[blendKey]]),
        ),
        uniforms: {
          hbGroundTheme: {
            value: currentTheme === "dots" ? 1 : 0,
          },
          hbGroundCoverage: {
            value: 1,
          },
          hbGroundFallback: {
            value: -1,
          },
          hbGroundSpan: {
            value: Math.max(6, (targetMesh.geometry.parameters.width / 16) * 0.7),
          },
          hbGroundCenter: {
            value: new three.Vector2(),
          },
          hbGroundDeep: {
            value: deepColor,
          },
          hbGroundActivity: {
            value: 0,
          },
          hbGroundPulse: {
            value: new three.Vector3(0, 0, 2),
          },
          hbGroundInk: {
            value: inkColor,
          },
          hbGroundAccent: {
            value: accentColor,
          },
        },
      },
      existingUniforms = uniformsByMaterial.get(targetMaterial);
    (existingUniforms
      ? (themeRecord.uniforms = existingUniforms)
      : uniformsByMaterial.set(targetMaterial, themeRecord.uniforms),
      (themeRecord.uniforms.hbGroundTheme.value = currentTheme === "dots" ? 1 : 0),
      (themeRecord.uniforms.hbGroundCoverage.value = 1),
      (themeRecord.uniforms.hbGroundFallback.value = -1));
    const cleanedProgramKey = themeRecord.programKey
      .call(targetMaterial)
      .replace(/:hb-ground-theme-v[0-9]+/g, "");
    ((themeRecord.compile = function (shader, renderer) {
      (themeRecord.beforeCompile.call(this, shader, renderer),
        Object.assign(shader.uniforms, themeRecord.uniforms),
        !shader.fragmentShader.includes("uniform float hbGroundTheme;") &&
          ((shader.vertexShader = shader.vertexShader
            .replace("#include <common>", "#include <common>\nvarying vec2 vHbGround;")
            .replace(
              "#include <begin_vertex>",
              "#include <begin_vertex>\nvHbGround = vec2(position.x, -position.y);",
            )),
          (shader.fragmentShader = shader.fragmentShader
            .replace("#include <common>", "#include <common>\n" + groundThemeUniformDeclarations)
            .replace(
              "#include <color_fragment>",
              "#include <color_fragment>\n" + groundThemeShaderSource,
            ))));
    }),
      (themeRecord.key = () => cleanedProgramKey + ":hb-ground-theme-v5"),
      (targetMaterial.onBeforeCompile = themeRecord.compile),
      (targetMaterial.customProgramCacheKey = themeRecord.key),
      (targetMaterial.needsUpdate = true),
      recordsByMesh.set(targetMesh, themeRecord));
  }
  function resetActivity() {
    ((lastInteractionMs = lastHitMs = -Infinity), (hoveredMesh = null));
    for (const animatedRecord of recordsByMesh.values())
      ((animatedRecord.uniforms.hbGroundActivity.value = 0),
        (animatedRecord.uniforms.hbGroundPulse.value.z = 2));
    isActive && ((isActive = false), sceneHost.backgroundFrame?.(false));
  }
  return {
    get theme() {
      return currentTheme;
    },
    get active() {
      return isActive;
    },
    get materialCount() {
      return recordsByMesh.size;
    },
    configure(requestedTheme) {
      const normalizedTheme = normalizeBackgroundTheme(requestedTheme);
      if (isDisposed || normalizedTheme === currentTheme) return false;
      (resetActivity(), (currentTheme = normalizedTheme));
      for (const syncedRecord of recordsByMesh.values())
        syncedRecord.uniforms.hbGroundTheme.value = normalizedTheme === "dots" ? 1 : 0;
      return (onThemeChanged(), true);
    },
    sync(syncedMeshes, enabled) {
      if (isDisposed) return;
      ((isSyncEnabled = enabled !== false), isSyncEnabled || resetActivity());
      const keptMeshSet = new Set();
      for (const syncedMesh of syncedMeshes)
        if (syncedMesh.userData.exportRole === "grid")
          ((syncedMesh.userData.backgroundThemeHidden = currentTheme !== "grid"),
            hiddenGridMeshSet.add(syncedMesh));
        else {
          if (syncedMesh.userData.exportRole === "background" && currentTheme !== "grid") {
            keptMeshSet.add(syncedMesh);
            const staleRecord = recordsByMesh.get(syncedMesh);
            (staleRecord &&
              staleRecord.material !== syncedMesh.material &&
              (restoreMeshRecord(staleRecord), recordsByMesh.delete(syncedMesh)),
              recordsByMesh.has(syncedMesh) || buildMeshRecord(syncedMesh));
            const activeRecord = recordsByMesh.get(syncedMesh),
              orbitCenter = sceneHost.getOrbitCenter?.();
            if (activeRecord && orbitCenter?.length === 3 && orbitCenter.every(Number.isFinite)) {
              syncedMesh.updateWorldMatrix(true, false);
              const localCenter = syncedMesh.worldToLocal(new three.Vector3(...orbitCenter));
              activeRecord.uniforms.hbGroundCenter.value.set(localCenter.x, -localCenter.y);
            }
          }
        }
      for (const [mapKeyMesh, mapValueRecord] of recordsByMesh)
        (!keptMeshSet.has(mapKeyMesh) || mapValueRecord.material !== mapKeyMesh.material) &&
          (restoreMeshRecord(mapValueRecord), recordsByMesh.delete(mapKeyMesh));
      for (const removedGridMesh of hiddenGridMeshSet)
        syncedMeshes.includes(removedGridMesh) ||
          (delete removedGridMesh.userData.backgroundThemeHidden,
          hiddenGridMeshSet.delete(removedGridMesh));
      for (const clearedRecord of recordsByMesh.values())
        (delete clearedRecord.object.userData.backgroundThemeKeepVisible,
          (clearedRecord.uniforms.hbGroundFallback.value = -1));
      const visibleRecords = [...recordsByMesh.values()].filter((candidateRecord) =>
        isBackgroundVisible(candidateRecord.object),
      );
      let totalOpacity = visibleRecords.reduce(
        (opacitySum, summedRecord) => opacitySum + summedRecord.material.opacity,
        0,
      );
      const primaryRecord = recordsByMesh.get(primaryMesh),
        fallbackRecord =
          primaryRecord?.material.transparent &&
          !visibleRecords.includes(primaryRecord) &&
          primaryRecord.material.opacity > 0
            ? primaryRecord
            : [...recordsByMesh.values()]
                .filter(
                  (transparentCandidate) =>
                    transparentCandidate.material.transparent &&
                    !visibleRecords.includes(transparentCandidate),
                )
                .sort((recordA, recordB) => recordB.material.opacity - recordA.material.opacity)[0];
      (fallbackRecord?.material.transparent &&
      !visibleRecords.includes(fallbackRecord) &&
      totalOpacity < 1
        ? ((fallbackRecord.object.userData.backgroundThemeKeepVisible = true),
          (fallbackRecord.uniforms.hbGroundFallback.value = 1 - totalOpacity),
          (totalOpacity = 1))
        : visibleRecords.length === 1 &&
          visibleRecords[0].material.opacity > 0.999 &&
          (primaryMesh = visibleRecords[0].object),
        (totalOpacity = Math.max(1, totalOpacity)));
      for (const blendedRecord of recordsByMesh.values()) {
        const { material: blendedMaterial, uniforms: blendedUniforms } = blendedRecord;
        ((blendedUniforms.hbGroundCoverage.value = blendedMaterial.transparent ? totalOpacity : 1),
          blendedMaterial.transparent &&
            ((blendedMaterial.blending = three.CustomBlending),
            (blendedMaterial.blendEquation = blendedMaterial.blendEquationAlpha =
              three.AddEquation),
            (blendedMaterial.blendSrc = blendedMaterial.premultipliedAlpha
              ? three.OneFactor
              : three.SrcAlphaFactor),
            (blendedMaterial.blendDst =
              blendedMaterial.blendSrcAlpha =
              blendedMaterial.blendDstAlpha =
                three.OneFactor)));
      }
    },
    interact(pointerEvent, shouldPick = false) {
      if (
        isDisposed ||
        !isSyncEnabled ||
        currentTheme === "grid" ||
        shouldReduceMotion ||
        !recordsByMesh.size
      )
        return;
      const interactionTimeMs = clock();
      if (((lastInteractionMs = interactionTimeMs), shouldPick)) {
        const canvasRect = sceneHost.canvas.getBoundingClientRect();
        if (canvasRect.width && canvasRect.height) {
          (pointerNdc.set(
            ((pointerEvent.clientX - canvasRect.left) / canvasRect.width) * 2 - 1,
            1 - ((pointerEvent.clientY - canvasRect.top) / canvasRect.height) * 2,
          ),
            raycaster.setFromCamera(pointerNdc, sceneHost.camera));
          const candidateMeshes = [...recordsByMesh.keys()].filter((candidateMesh) => {
              for (let ancestor = candidateMesh; ancestor; ancestor = ancestor.parent)
                if (!ancestor.visible) return false;
              return (candidateMesh.updateWorldMatrix(true, false), true);
            }),
            nearestHit = raycaster.intersectObjects(candidateMeshes, false)[0];
          if (nearestHit) {
            const localHitPoint = nearestHit.object.worldToLocal(nearestHit.point);
            (pulsePosition.set(localHitPoint.x, -localHitPoint.y),
              (hoveredMesh = nearestHit.object),
              (lastHitMs = interactionTimeMs));
          }
        }
      }
      onThemeChanged();
    },
    tick(nowMs) {
      if (isDisposed || !isSyncEnabled || currentTheme === "grid" || shouldReduceMotion)
        return (resetActivity(), Infinity);
      const interactionStrength = Math.max(0, 1 - (nowMs - lastInteractionMs) / 400),
        hitAge = Math.min(2, Math.max(0, (nowMs - lastHitMs) / 1000)),
        shouldAnimate = interactionStrength > 0 || hitAge < 1.25;
      if (!shouldAnimate && !isActive) return Infinity;
      for (const [animatedMesh, animatedEntry] of recordsByMesh)
        ((animatedEntry.uniforms.hbGroundActivity.value = interactionStrength),
          animatedEntry.uniforms.hbGroundPulse.value.set(
            pulsePosition.x,
            pulsePosition.y,
            animatedMesh === hoveredMesh ? hitAge : 2,
          ));
      return (
        (isActive = shouldAnimate),
        sceneHost.backgroundFrame?.(shouldAnimate),
        shouldAnimate ? 1000 / 30 : Infinity
      );
    },
    suspend() {
      resetActivity();
    },
    dispose() {
      (resetActivity(), (isDisposed = true));
      for (const restoredEntry of recordsByMesh.values()) restoreMeshRecord(restoredEntry);
      for (const clearedGridMesh of hiddenGridMeshSet)
        delete clearedGridMesh.userData.backgroundThemeHidden;
      (recordsByMesh.clear(), hiddenGridMeshSet.clear());
    },
  };
}
