import { createRenderLightIndex } from "../modules/interaction3d/render-light-index.js?v=20260907-focus-work-v1";
const DEFAULT_TILE_GUTTER = 1;
function toPositiveInt(input, fallback = 0) {
  const parsed = Math.floor(Number(input));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
function nextPowerOfTwo(requestedValue) {
  let result = 1;
  const powerOfTwo = Math.max(1, Math.ceil(Number(requestedValue) || 1));
  for (; result < powerOfTwo;) result *= 2;
  return result;
}
function packTilesIntoAtlas(tiles, atlasSize, gutter) {
  let cursorX = gutter,
    cursorY = gutter,
    rowHeight = 0;
  const placed = [];
  for (const tile of tiles) {
    const tileSize = tile.size;
    if (
      (cursorX + tileSize + gutter > atlasSize &&
        ((cursorX = gutter), (cursorY += rowHeight + gutter * 2), (rowHeight = 0)),
      cursorY + tileSize + gutter > atlasSize)
    )
      return null;
    (placed.push({
      ...tile,
      x: cursorX,
      y: cursorY,
    }),
      (cursorX += tileSize + gutter * 2),
      (rowHeight = Math.max(rowHeight, tileSize)));
  }
  return placed;
}
export function packSpotShadowAtlasTiles(
  tileSizes = [],
  maxAtlasSize = 4096,
  tileGutter = DEFAULT_TILE_GUTTER,
) {
  const atlasLimit = toPositiveInt(maxAtlasSize, 4096),
    gutterPx = Math.max(0, Math.floor(Number(tileGutter) || 0)),
    entries = tileSizes
      .map((size, index) => ({
        index: index,
        size: toPositiveInt(size),
      }))
      .filter((entry) => entry.size > 0 && entry.size + gutterPx * 2 <= atlasLimit)
      .sort((entryA, entryB) => entryB.size - entryA.size || entryA.index - entryB.index);
  if (entries.length !== tileSizes.length) return null;
  if (!entries.length)
    return {
      size: 1,
      tiles: [],
    };
  const totalArea = entries.reduce(
    (sum, tileEntry) => sum + (tileEntry.size + gutterPx * 2) ** 2,
    0,
  );
  let atlasSizeCandidate = nextPowerOfTwo(
    Math.max(entries[0].size + gutterPx * 2, Math.sqrt(totalArea)),
  );
  for (; atlasSizeCandidate <= atlasLimit;) {
    const candidateLayout = packTilesIntoAtlas(entries, atlasSizeCandidate, gutterPx);
    if (candidateLayout) {
      const orderedTiles = Array(tileSizes.length);
      for (const placedTile of candidateLayout) orderedTiles[placedTile.index] = placedTile;
      return {
        size: atlasSizeCandidate,
        tiles: orderedTiles,
      };
    }
    atlasSizeCandidate *= 2;
  }
  return null;
}
function spotLightKey(lightObject) {
  const floorId = String(lightObject?.userData?.lightFloorId || ""),
    itemId = String(lightObject?.userData?.lightItemId || "");
  return itemId ? floorId + ":" + itemId : "";
}
function collectShadowLights(searchRoot, { includeHidden: includeHidden = true } = {}) {
  const lights = [];
  return (
    searchRoot?.traverse((object) => {
      !object.isSpotLight ||
        object.userData?.shadowCandidate !== true ||
        !spotLightKey(object) ||
        (!includeHidden && object.visible === false) ||
        (Number(object.userData?.lightBrightness || 0) <= 0 &&
          object.userData?.prewarmShadow !== true) ||
        lights.push(object);
    }),
    lights
  );
}
function isShadowableMaterial(material) {
  return !!(
    material &&
    (material.isMeshStandardMaterial ||
      material.isMeshPhysicalMaterial ||
      material.isMeshLambertMaterial ||
      material.isMeshPhongMaterial ||
      material.isMeshToonMaterial)
  );
}
function buildAtlasFragmentChunk() {
  return "\n#if NUM_SPOT_LIGHTS > 0\n  uniform sampler2D userSpotShadowAtlas;\n  uniform float userSpotShadowAtlasEnabled;\n  uniform vec4 userSpotShadowRect[ NUM_SPOT_LIGHTS ];\n  uniform vec4 userSpotShadowParams[ NUM_SPOT_LIGHTS ];\n  varying vec4 vUserSpotShadowCoord[ NUM_SPOT_LIGHTS ];\n\n  float getUserSpotAtlasShadow( vec4 atlasRect, vec4 shadowParams, vec4 shadowCoord ) {\n    if ( userSpotShadowAtlasEnabled < 0.5 || shadowParams.z < 0.5 ) return 1.0;\n    shadowCoord.xyz /= shadowCoord.w;\n    shadowCoord.z += shadowParams.x;\n    bool inFrustum = shadowCoord.x >= 0.0 && shadowCoord.x <= 1.0\n      && shadowCoord.y >= 0.0 && shadowCoord.y <= 1.0;\n    if ( ! inFrustum || shadowCoord.z > 1.0 ) return 1.0;\n    vec2 atlasUv = atlasRect.xy + clamp( shadowCoord.xy, 0.0, 1.0 ) * atlasRect.zw;\n    vec2 distribution = texture2D( userSpotShadowAtlas, atlasUv ).rg;\n    float mean = distribution.x;\n    // The stock VSM Chebyshev tail turns half-float depth steps from a\n    // 256px local-light map into several visible contour rings. Preserve the\n    // authored VSM blur, but use its deviation only to size one bounded edge\n    // transition. This keeps the same single texture sample and removes the\n    // long probability tail that made furniture shadows look layered.\n    float softness = clamp( abs( distribution.y ) * 0.35, 0.0007, 0.004 );\n    // A slope-scaled receiver guard keeps the newly bounded edge from\n    // exposing quantized self-shadow stripes on cabinet fronts and tabletops.\n    // It changes only the depth comparison, not the map resolution or sample\n    // count, and is capped tightly so real contact shadows stay attached.\n    // Cover the complete soft transition at equal depth, then add only a\n    // small slope allowance. This prevents the half-float map's depth bands\n    // from reappearing on large floors or through transparent glass, while\n    // keeping the allowance proportional to the authored penumbra.\n    float receiverGuard = softness + clamp( fwidth( shadowCoord.z ) * 1.5, 0.0002, 0.0015 );\n    #ifdef USE_REVERSED_DEPTH_BUFFER\n      float occludedDistance = mean - shadowCoord.z;\n    #else\n      float occludedDistance = shadowCoord.z - mean;\n    #endif\n    // The atlas contains only solid architectural occluders. Once a receiver\n    // is safely behind a wall, collapse the remaining VSM depth transition\n    // quickly instead of letting it extend through nearby cabinet backs and\n    // reveal half-float depth rows. The authored blur in atlas UV space still\n    // keeps the wall silhouette soft; this only removes light bleeding behind\n    // the blocker. Equality and the complete receiver guard remain lit.\n    float blockerTransition = max( softness * 0.5, 0.00035 );\n    float shadow = 1.0 - smoothstep(\n      receiverGuard,\n      receiverGuard + blockerTransition,\n      occludedDistance\n    );\n    return mix( 1.0, shadow, shadowParams.y );\n  }\n#endif\n";
}
function buildAtlasVertexParsChunk() {
  return "\n#if NUM_SPOT_LIGHTS > 0\n  uniform mat4 userSpotShadowMatrix[ NUM_SPOT_LIGHTS ];\n  uniform vec4 userSpotShadowParams[ NUM_SPOT_LIGHTS ];\n  varying vec4 vUserSpotShadowCoord[ NUM_SPOT_LIGHTS ];\n#endif\n";
}
function buildAtlasVertexChunk() {
  return "\n#if NUM_SPOT_LIGHTS > 0\n  vec3 userShadowWorldNormal = inverseTransformDirection( transformedNormal, viewMatrix );\n  vec4 userShadowWorldPosition;\n  #pragma unroll_loop_start\n  for ( int i = 0; i < NUM_SPOT_LIGHTS; i ++ ) {\n    userShadowWorldPosition = worldPosition + vec4( userShadowWorldNormal * userSpotShadowParams[ i ].w, 0.0 );\n    vUserSpotShadowCoord[ i ] = userSpotShadowMatrix[ i ] * userShadowWorldPosition;\n  }\n  #pragma unroll_loop_end\n#endif\n";
}
export function guardZeroContributionSpotLights(lightsShader) {
  const spotBlockStart = lightsShader.indexOf("#if ( NUM_SPOT_LIGHTS > 0 )"),
    nextLightBlock = lightsShader.indexOf("#if ( NUM_DIR_LIGHTS > 0 )", spotBlockStart),
    directLightCall =
      "RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );",
    spotLightBranch = lightsShader.slice(spotBlockStart, nextLightBlock);
  if (
    spotBlockStart < 0 ||
    nextLightBlock < 0 ||
    spotLightBranch.split(directLightCall).length !== 2
  )
    throw new Error("当前 Three.js 聚光灯反射 Shader 与零贡献优化不兼容。");
  const guardedCall =
    "\n    #ifdef HB_SKIP_ZERO_SPOT_LIGHT\n      if ( any( notEqual( directLight.color, vec3( 0.0 ) ) ) ) {\n    #endif\n      " +
    directLightCall +
    "\n    #ifdef HB_SKIP_ZERO_SPOT_LIGHT\n      }\n    #endif";
  return (
    lightsShader.slice(0, spotBlockStart) +
    spotLightBranch.replace(directLightCall, guardedCall) +
    lightsShader.slice(nextLightBlock)
  );
}
function patchLightsFragmentBegin(THREE) {
  const spotShadowLoopSnippet =
      "\n\t\t#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS )",
    atlasShadowPatch =
      "\n    #if defined( USE_USER_SPOT_SHADOW_ATLAS )\n      directLight.color *= ( directLight.visible && receiveShadow )\n        ? getUserSpotAtlasShadow( userSpotShadowRect[ i ], userSpotShadowParams[ i ], vUserSpotShadowCoord[ i ] )\n        : 1.0;\n    #endif\n",
    lightsFragmentBegin = THREE.ShaderChunk.lights_fragment_begin;
  if (!lightsFragmentBegin.includes(spotShadowLoopSnippet))
    throw new Error("当前 Three.js 灯光 Shader 与阴影图集不兼容。");
  return guardZeroContributionSpotLights(
    lightsFragmentBegin.replace(
      spotShadowLoopSnippet,
      "" + atlasShadowPatch + spotShadowLoopSnippet,
    ),
  );
}
function disposeShadowTargets(disposedLight) {
  (disposedLight?.shadow?.map?.dispose?.(),
    disposedLight?.shadow?.mapPass?.dispose?.(),
    disposedLight?.shadow &&
      ((disposedLight.shadow.map = null), (disposedLight.shadow.mapPass = null)));
}
export function createSpotShadowAtlasController({
  THREE: three,
  renderer: renderer,
  scene: scene,
  camera: camera,
  requestFrame: requestFrame = () => {},
  canBuild: canBuild = () => true,
  buildDelay: buildDelay = 80,
  syncBeforeRender: syncBeforeRender = false,
} = {}) {
  if (!three || !renderer || !scene || !camera)
    throw new Error("创建阴影图集时缺少 Three.js 渲染上下文。");
  const uniforms = {
      userSpotShadowAtlas: {
        value: null,
      },
      userSpotShadowAtlasEnabled: {
        value: 0,
      },
      userSpotShadowMatrix: {
        value: [],
      },
      userSpotShadowRect: {
        value: [],
      },
      userSpotShadowParams: {
        value: [],
      },
    },
    patchedLightsFragment = patchLightsFragmentBegin(three),
    entryByLightKey = new Map();
  let atlasTarget = null,
    scratchTarget = null,
    preparedMaterialSet = new WeakSet(),
    pendingRoot = null,
    buildTimer = 0,
    revision = 0,
    isBuilding = false,
    isDirty = false,
    isDisposed = false,
    isWebglLost = false,
    isEnabled = true,
    syncedLights = null,
    syncedEntries = [],
    previousLights = [],
    previousEntries = [];
  const scratchMatrix = new three.Matrix4(),
    scratchVector = new three.Vector4(),
    lightIndex = syncBeforeRender ? createRenderLightIndex() : null;
  let lastLightIndexStats = "";
  function setAtlasEnabled(enabled) {
    uniforms.userSpotShadowAtlasEnabled.value =
      enabled && isEnabled && entryByLightKey.size ? 1 : 0;
  }
  function prepareMaterial(materialToPrepare) {
    if (!isShadowableMaterial(materialToPrepare) || preparedMaterialSet.has(materialToPrepare))
      return;
    if (
      materialToPrepare.environmentSourceMaterial &&
      preparedMaterialSet.has(materialToPrepare.environmentSourceMaterial) &&
      materialToPrepare.defines?.USE_USER_SPOT_SHADOW_ATLAS === 1
    ) {
      preparedMaterialSet.add(materialToPrepare);
      return;
    }
    preparedMaterialSet.add(materialToPrepare);
    const previousOnBeforeCompile = materialToPrepare.onBeforeCompile,
      previousCacheKey = materialToPrepare.customProgramCacheKey?.bind(materialToPrepare);
    ((materialToPrepare.defines = {
      ...(materialToPrepare.defines || {}),
      USE_USER_SPOT_SHADOW_ATLAS: 1,
    }),
      syncBeforeRender &&
        materialToPrepare.isMeshStandardMaterial &&
        (materialToPrepare.defines.HB_SKIP_ZERO_SPOT_LIGHT = 1),
      (materialToPrepare.onBeforeCompile = (shader, rendererInstance) => {
        (previousOnBeforeCompile?.call(materialToPrepare, shader, rendererInstance),
          Object.assign(shader.uniforms, uniforms),
          (shader.vertexShader = shader.vertexShader
            .replace(
              "#include <shadowmap_pars_vertex>",
              "#include <shadowmap_pars_vertex>\n" + buildAtlasVertexParsChunk(),
            )
            .replace("#include <worldpos_vertex>", "#include <worldpos_vertex>")
            .replace(
              "#include <shadowmap_vertex>",
              "#include <shadowmap_vertex>\n" + buildAtlasVertexChunk(),
            )),
          (shader.fragmentShader = shader.fragmentShader
            .replace(
              "#include <shadowmap_pars_fragment>",
              "#include <shadowmap_pars_fragment>\n" + buildAtlasFragmentChunk(),
            )
            .replace("#include <lights_fragment_begin>", patchedLightsFragment)));
      }),
      (materialToPrepare.customProgramCacheKey = () =>
        (previousCacheKey?.() || "") + "|user-spot-shadow-atlas-v7-zero-contribution"),
      (materialToPrepare.needsUpdate = true));
  }
  const materialCloneBySource = new WeakMap(),
    materialCloneSet = new Set();
  function cloneSharedMaterial(sourceMaterial) {
    if (!isShadowableMaterial(sourceMaterial) || materialCloneSet.has(sourceMaterial))
      return sourceMaterial;
    let materialClone = materialCloneBySource.get(sourceMaterial);
    return (
      materialClone ||
        ((materialClone = sourceMaterial.clone()),
        (materialClone.onBeforeCompile = sourceMaterial.onBeforeCompile),
        (materialClone.customProgramCacheKey = sourceMaterial.customProgramCacheKey),
        materialCloneBySource.set(sourceMaterial, materialClone),
        materialCloneSet.add(materialClone)),
      materialClone
    );
  }
  function prepareRoot(root) {
    isDisposed ||
      root?.traverse((child) => {
        if (!child.isMesh || child.receiveShadow === false) return;
        (child.userData.externalModelSharedMaterial ||
          child.userData.sofaSharedMaterial ||
          child.userData.rugSharedMaterial ||
          child.userData.architectureSharedMaterial) &&
          (child.material = Array.isArray(child.material)
            ? child.material.map(cloneSharedMaterial)
            : cloneSharedMaterial(child.material));
        const materials = Array.isArray(child.material)
          ? child.material
          : child.material
            ? [child.material]
            : [];
        for (const candidateMaterial of materials) prepareMaterial(candidateMaterial);
      });
  }
  function collectActiveLights(activeRoot) {
    return collectShadowLights(activeRoot, {
      includeHidden: false,
    });
  }
  function syncUniforms(syncRoot = pendingRoot) {
    if (isDisposed) return 0;
    (prepareRoot(syncRoot), (syncedLights = null));
    const matrixUniforms = uniforms.userSpotShadowMatrix.value,
      rectUniforms = uniforms.userSpotShadowRect.value,
      paramUniforms = uniforms.userSpotShadowParams.value;
    ((matrixUniforms.length = 0), (rectUniforms.length = 0), (paramUniforms.length = 0));
    for (const light of collectActiveLights(syncRoot)) {
      const lightEntry = entryByLightKey.get(spotLightKey(light));
      (matrixUniforms.push(lightEntry?.matrix || new three.Matrix4()),
        rectUniforms.push(lightEntry?.rect || new three.Vector4()),
        paramUniforms.push(
          lightEntry
            ? new three.Vector4(lightEntry.bias, lightEntry.intensity, 1, lightEntry.normalBias)
            : new three.Vector4(0, 0, 0, 0),
        ),
        (light.castShadow = false));
    }
    ((uniforms.userSpotShadowAtlas.value = atlasTarget?.texture || null), setAtlasEnabled(true));
    const enabledLightCount = paramUniforms.filter((lightParam) => lightParam.z > 0.5).length;
    return (
      (renderer.domElement.dataset.activeSpotShadows = String(enabledLightCount)),
      enabledLightCount
    );
  }
  function syncRenderLights(renderedScene, renderedCamera) {
    if (isDisposed || !syncBeforeRender || !renderedScene) return;
    const renderLights = previousLights,
      renderEntries = previousEntries;
    renderLights.length = renderEntries.length = 0;
    for (const renderLight of lightIndex.read(renderedScene, renderedCamera))
      renderLights.push(renderLight);
    const lightIndexStats = lightIndex.stats.builds + ":" + lightIndex.stats.sorts;
    lightIndexStats !== lastLightIndexStats &&
      ((lastLightIndexStats = lightIndexStats),
      (renderer.domElement.dataset.lightIndexBuilds = String(lightIndex.stats.builds)),
      (renderer.domElement.dataset.lightIndexSorts = String(lightIndex.stats.sorts)));
    let isSame = syncedLights?.length === renderLights.length;
    for (let changeIndex = 0; changeIndex < renderLights.length; changeIndex++)
      (renderEntries.push(entryByLightKey.get(spotLightKey(renderLights[changeIndex]))),
        (renderLights[changeIndex] !== syncedLights?.[changeIndex] ||
          renderEntries[changeIndex] !== syncedEntries[changeIndex]) &&
          (isSame = false));
    if (isSame) return;
    ((previousLights = syncedLights || []),
      (previousEntries = syncedEntries),
      (syncedLights = renderLights),
      (syncedEntries = renderEntries));
    const matrixValues = uniforms.userSpotShadowMatrix.value,
      rectValues = uniforms.userSpotShadowRect.value,
      paramValues = uniforms.userSpotShadowParams.value;
    matrixValues.length = rectValues.length = paramValues.length = 0;
    for (const lightSource of renderEntries)
      (matrixValues.push(lightSource?.matrix || scratchMatrix),
        rectValues.push(lightSource?.rect || scratchVector),
        paramValues.push(
          lightSource
            ? (lightSource.uniformParams ||= new three.Vector4(
                lightSource.bias,
                lightSource.intensity,
                1,
                lightSource.normalBias,
              ))
            : scratchVector,
        ));
  }
  function createAtlasTarget(targetSize) {
    const textureTarget = new three.WebGLRenderTarget(targetSize, targetSize, {
      format: three.RGFormat,
      type: three.HalfFloatType,
      minFilter: three.LinearFilter,
      magFilter: three.LinearFilter,
      depthBuffer: false,
      stencilBuffer: false,
    });
    return (
      (textureTarget.texture.name = "HA Bridge shared spot shadow atlas"),
      (textureTarget.texture.generateMipmaps = false),
      textureTarget
    );
  }
  function clearAtlasTarget(target) {
    const previousTarget = renderer.getRenderTarget(),
      previousClearColor = renderer.getClearColor(new three.Color()).clone(),
      previousClearAlpha = renderer.getClearAlpha();
    (renderer.setRenderTarget(target),
      renderer.setClearColor(16777215, 1),
      renderer.clear(true, false, false),
      renderer.setRenderTarget(previousTarget),
      renderer.setClearColor(previousClearColor, previousClearAlpha));
  }
  async function yieldToScheduler() {
    return globalThis.scheduler?.yield
      ? globalThis.scheduler.yield()
      : new Promise((resolve) => setTimeout(resolve, 0));
  }
  async function rebuildAtlas(buildRoot, buildRevision) {
    if (isDisposed || isWebglLost || isBuilding || buildRevision !== revision) return;
    if (!buildRoot) {
      isDirty = false;
      return;
    }
    if (!canBuild()) {
      scheduleBuild(160);
      return;
    }
    isDirty = false;
    const shadowLights = collectShadowLights(buildRoot);
    if (!shadowLights.length) {
      (entryByLightKey.clear(),
        atlasTarget?.dispose?.(),
        (atlasTarget = null),
        (uniforms.userSpotShadowAtlas.value = null),
        setAtlasEnabled(false),
        requestFrame());
      return;
    }
    const maxTextureSize = toPositiveInt(renderer.capabilities?.maxTextureSize, 4096),
      lightMapSizes = shadowLights.map((shadowLight) =>
        toPositiveInt(shadowLight.shadow?.mapSize?.x, 256),
      ),
      layout = packSpotShadowAtlasTiles(lightMapSizes, maxTextureSize);
    if (!layout)
      throw new Error(
        "当前设备最大阴影图集 " + maxTextureSize + "px 无法容纳 " + shadowLights.length + " 盏灯。",
      );
    let nextAtlasTarget = null;
    const nextEntryByLightKey = new Map(),
      previousRenderTarget = renderer.getRenderTarget(),
      lightStates = shadowLights.map((capturedLight) => ({
        light: capturedLight,
        visible: capturedLight.visible,
        intensity: capturedLight.intensity,
        castShadow: capturedLight.castShadow,
      }));
    isBuilding = true;
    try {
      (prepareRoot(buildRoot),
        (nextAtlasTarget = createAtlasTarget(layout.size)),
        renderer.initRenderTarget(nextAtlasTarget),
        clearAtlasTarget(nextAtlasTarget),
        (scratchTarget ||= new three.WebGLRenderTarget(1, 1, {
          depthBuffer: true,
          stencilBuffer: false,
        })),
        setAtlasEnabled(false));
      for (const lightState of lightStates)
        ((lightState.light.visible = false), (lightState.light.castShadow = false));
      for (let lightCursor = 0; lightCursor < shadowLights.length; lightCursor += 1) {
        if (buildRevision !== revision) return;
        const activeLight = shadowLights[lightCursor],
          targetTile = layout.tiles[lightCursor];
        ((activeLight.visible = true),
          (activeLight.intensity = Math.max(
            Number(activeLight.userData?.lightOnIntensity || activeLight.intensity || 1),
            0.001,
          )),
          syncUniforms(buildRoot),
          setAtlasEnabled(false),
          (activeLight.castShadow = true),
          (activeLight.shadow.autoUpdate = false),
          (activeLight.shadow.needsUpdate = true),
          renderer.setRenderTarget(scratchTarget),
          renderer.render(scene, camera));
        const shadowTexture = activeLight.shadow?.map?.texture;
        if (!shadowTexture)
          throw new Error("灯光 " + spotLightKey(activeLight) + " 未生成阴影贴图。");
        renderer.copyTextureToTexture(
          shadowTexture,
          nextAtlasTarget.texture,
          new three.Box2(
            new three.Vector2(0, 0),
            new three.Vector2(targetTile.size, targetTile.size),
          ),
          new three.Vector2(targetTile.x, targetTile.y),
        );
        const halfPixelInset = 0.5;
        (nextEntryByLightKey.set(spotLightKey(activeLight), {
          tile: {
            ...targetTile,
          },
          matrix: activeLight.shadow.matrix.clone(),
          rect: new three.Vector4(
            (targetTile.x + halfPixelInset) / layout.size,
            (targetTile.y + halfPixelInset) / layout.size,
            Math.max(0, targetTile.size - halfPixelInset * 2) / layout.size,
            Math.max(0, targetTile.size - halfPixelInset * 2) / layout.size,
          ),
          bias: Number(activeLight.shadow.bias || 0),
          normalBias: Number(activeLight.shadow.normalBias || 0),
          intensity: Number(activeLight.shadow.intensity ?? 1),
        }),
          (activeLight.castShadow = false),
          (activeLight.visible = false),
          disposeShadowTargets(activeLight),
          await yieldToScheduler());
      }
      if (buildRevision !== revision) return;
      (atlasTarget?.dispose?.(), (atlasTarget = nextAtlasTarget), entryByLightKey.clear());
      for (const [lightKey, atlasEntry] of nextEntryByLightKey)
        entryByLightKey.set(lightKey, atlasEntry);
      uniforms.userSpotShadowAtlas.value = atlasTarget.texture;
      const domElement = renderer.domElement;
      ((domElement.dataset.spotShadowMode = "atlas"),
        (domElement.dataset.spotShadowAtlasSize = String(layout.size)),
        (domElement.dataset.spotShadowAtlasLights = String(entryByLightKey.size)));
    } finally {
      renderer.setRenderTarget(previousRenderTarget);
      for (const previousState of lightStates)
        ((previousState.light.visible = previousState.visible),
          (previousState.light.intensity = previousState.intensity),
          (previousState.light.castShadow = false));
      (atlasTarget !== nextAtlasTarget && nextAtlasTarget?.dispose(),
        (isBuilding = false),
        isDisposed || isWebglLost
          ? disposeAtlases()
          : (syncUniforms(pendingRoot),
            isDirty && !buildTimer && scheduleBuild(0),
            requestFrame()));
    }
  }
  function scheduleBuild(delay) {
    isDisposed ||
      isWebglLost ||
      !isDirty ||
      (clearTimeout(buildTimer),
      (buildTimer = setTimeout(
        () => {
          ((buildTimer = 0),
            !(isDisposed || isBuilding || !isDirty) &&
              rebuildAtlas(pendingRoot, revision).catch((error) => {
                isDisposed ||
                  (console.error(error), (renderer.domElement.dataset.spotShadowMode = "fallback"));
              }));
        },
        Math.max(0, Number(delay) || 0),
      )));
  }
  function schedule(scheduledRoot, { delay: scheduleDelay = buildDelay } = {}) {
    if (isDisposed) return 0;
    if (((pendingRoot = scheduledRoot), isWebglLost)) return ((isDirty = !!scheduledRoot), 0);
    prepareRoot(scheduledRoot);
    for (const scheduledLight of collectShadowLights(scheduledRoot))
      scheduledLight.castShadow = false;
    return (
      syncUniforms(scheduledRoot),
      (revision += 1),
      (isDirty = true),
      scheduleBuild(scheduleDelay),
      collectShadowLights(scheduledRoot).length
    );
  }
  let lastRoot = null,
    lastRevision = -1,
    lastLightIndexBuilds = -1,
    trackedLights = [];
  function refreshGeometry(refreshRoot = pendingRoot, viewBoxes = null) {
    if (isDisposed) return true;
    if (isBuilding || buildTimer || isDirty) return false;
    if (!atlasTarget || !entryByLightKey.size) return true;
    const lightIndexBuilds = lightIndex?.stats.builds || 0;
    (lastRoot !== refreshRoot ||
      lastRevision !== revision ||
      lastLightIndexBuilds !== lightIndexBuilds) &&
      ((lastRoot = refreshRoot),
      (lastRevision = revision),
      (lastLightIndexBuilds = lightIndexBuilds),
      (trackedLights = []),
      refreshRoot?.traverse((trackedLight) => {
        trackedLight.isSpotLight &&
          trackedLight.shadow &&
          entryByLightKey.has(spotLightKey(trackedLight)) &&
          trackedLights.push(trackedLight);
      }));
    const frustumBoxes =
        viewBoxes === null ? null : viewBoxes.filter((box) => box?.isBox3 && !box.isEmpty()),
      updates = [];
    refreshRoot?.updateWorldMatrix(true, true);
    for (const updateLight of trackedLights) {
      const geometryEntry = entryByLightKey.get(spotLightKey(updateLight));
      geometryEntry?.tile &&
        (updateLight.target?.updateWorldMatrix(true, false),
        updateLight.shadow.updateMatrices(updateLight),
        !(
          frustumBoxes &&
          !frustumBoxes.some((viewBox) => updateLight.shadow.getFrustum().intersectsBox(viewBox))
        ) &&
          updates.push({
            light: updateLight,
            entry: geometryEntry,
            matrix: updateLight.shadow.matrix.clone(),
            cast: updateLight.castShadow,
            visible: updateLight.visible,
            autoUpdate: updateLight.shadow.autoUpdate,
            needsUpdate: updateLight.shadow.needsUpdate,
            map: updateLight.shadow.map,
            mapPass: updateLight.shadow.mapPass,
          }));
    }
    if (!updates.length) return true;
    const rendererState = {
      target: renderer.getRenderTarget(),
      face: renderer.getActiveCubeFace(),
      mip: renderer.getActiveMipmapLevel(),
      viewport: renderer.getViewport(new three.Vector4()),
      scissor: renderer.getScissor(new three.Vector4()),
      scissorTest: renderer.getScissorTest(),
      clear: renderer.getClearColor(new three.Color()),
      alpha: renderer.getClearAlpha(),
      enabled: renderer.shadowMap.enabled,
      autoUpdate: renderer.shadowMap.autoUpdate,
      needsUpdate: renderer.shadowMap.needsUpdate,
    };
    try {
      renderer.shadowMap.enabled = true;
      for (const update of updates) {
        const { light: refreshLight } = update;
        try {
          if (
            ((refreshLight.castShadow = true),
            (refreshLight.visible = true),
            (refreshLight.shadow.autoUpdate = false),
            (refreshLight.shadow.needsUpdate = true),
            (renderer.shadowMap.needsUpdate = true),
            renderer.shadowMap.render([refreshLight], scene, camera),
            !refreshLight.shadow.map?.texture)
          )
            return false;
          ((update.texture = refreshLight.shadow.map.texture),
            update.matrix.copy(refreshLight.shadow.matrix));
        } finally {
          ((refreshLight.castShadow = update.cast), (refreshLight.visible = update.visible));
        }
      }
      for (const { texture: texture, entry: updatedEntry, matrix: lightMatrix } of updates) {
        const tileDefinition = updatedEntry.tile;
        (renderer.copyTextureToTexture(
          texture,
          atlasTarget.texture,
          new three.Box2(
            new three.Vector2(0, 0),
            new three.Vector2(tileDefinition.size, tileDefinition.size),
          ),
          new three.Vector2(tileDefinition.x, tileDefinition.y),
        ),
          updatedEntry.matrix.copy(lightMatrix));
      }
    } finally {
      for (const previousUpdate of updates) {
        const { light: restoreLight } = previousUpdate;
        ((restoreLight.castShadow = previousUpdate.cast),
          (restoreLight.visible = previousUpdate.visible),
          (restoreLight.shadow.autoUpdate = previousUpdate.autoUpdate),
          (restoreLight.shadow.needsUpdate = previousUpdate.needsUpdate),
          restoreLight.shadow.map !== previousUpdate.map && restoreLight.shadow.map?.dispose(),
          restoreLight.shadow.mapPass !== previousUpdate.mapPass &&
            restoreLight.shadow.mapPass?.dispose(),
          (restoreLight.shadow.map = previousUpdate.map),
          (restoreLight.shadow.mapPass = previousUpdate.mapPass));
      }
      ((renderer.shadowMap.enabled = rendererState.enabled),
        (renderer.shadowMap.autoUpdate = rendererState.autoUpdate),
        (renderer.shadowMap.needsUpdate = rendererState.needsUpdate),
        renderer.setViewport(rendererState.viewport),
        renderer.setScissor(rendererState.scissor),
        renderer.setScissorTest(rendererState.scissorTest),
        renderer.setRenderTarget(rendererState.target, rendererState.face, rendererState.mip),
        renderer.setClearColor(rendererState.clear, rendererState.alpha));
    }
    return (
      (renderer.domElement.dataset.curtainShadowUpdates = String(
        Number(renderer.domElement.dataset.curtainShadowUpdates || 0) + 1,
      )),
      true
    );
  }
  function setEnabled(nextEnabled) {
    isDisposed || ((isEnabled = nextEnabled !== false), setAtlasEnabled(true), requestFrame());
  }
  function disposeAtlases() {
    (atlasTarget?.dispose(),
      scratchTarget?.dispose(),
      (atlasTarget = null),
      (scratchTarget = null),
      entryByLightKey.clear(),
      (uniforms.userSpotShadowAtlas.value = null),
      setAtlasEnabled(false));
  }
  function setWebglLost(webglLost) {
    isDisposed ||
      isWebglLost === !!webglLost ||
      ((isWebglLost = !!webglLost),
      isWebglLost
        ? ((revision += 1),
          (isDirty = !!pendingRoot),
          clearTimeout(buildTimer),
          (buildTimer = 0),
          disposeAtlases())
        : pendingRoot &&
          schedule(pendingRoot, {
            delay: 0,
          }));
  }
  function dispose() {
    if (!isDisposed) {
      ((isDisposed = true), (revision += 1), (isDirty = false));
      for (const clonedMaterial of materialCloneSet) clonedMaterial.dispose();
      (materialCloneSet.clear(),
        clearTimeout(buildTimer),
        (buildTimer = 0),
        (pendingRoot = null),
        lightIndex?.dispose(),
        (lastRoot = null),
        (trackedLights = []),
        (syncedLights = null),
        (syncedEntries = []),
        (previousLights = []),
        (previousEntries = []),
        isBuilding || disposeAtlases());
    }
  }
  if (syncBeforeRender) {
    const previousOnBeforeRender = scene.onBeforeRender;
    scene.onBeforeRender = function (...args) {
      (previousOnBeforeRender?.apply(this, args),
        syncRenderLights(args[1] || scene, args[2] || camera));
    };
  }
  return {
    prepareRoot: prepareRoot,
    refreshGeometry: refreshGeometry,
    schedule: schedule,
    sync: syncUniforms,
    setEnabled: setEnabled,
    setContextLost: setWebglLost,
    dispose: dispose,
    activeCount: () => entryByLightKey.size,
    isBuilding: () => isBuilding,
    isPending: () => !!buildTimer || isDirty,
    releaseRenderIndex: () => lightIndex?.dispose(),
  };
}
