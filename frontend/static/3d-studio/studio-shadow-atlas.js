import { createRenderLightIndex } from "../modules/interaction3d/render-light-index.js?v=20260916013557";
const DEFAULT_TILE_GUTTER = 1;
function toPositiveInt(input, fallback = 0) {
  const parsed = Math.floor(Number(input));
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  } else {
    return fallback;
  }
}
function nextPowerOfTwo(requestedValue) {
  let result = 1;
  const powerOfTwo = Math.max(1, Math.ceil(Number(requestedValue) || 1));
  while (result < powerOfTwo) {
    result *= 2;
  }
  return result;
}
function packTilesIntoAtlas(tiles, atlasSize, gutter) {
  let cursorX = gutter;
  let cursorY = gutter;
  let rowHeight = 0;
  const placed = [];
  for (const tile of tiles) {
    const tileSize = tile.size;
    if (cursorX + tileSize + gutter > atlasSize) {
      cursorX = gutter;
      cursorY += rowHeight + gutter * 2;
      rowHeight = 0;
    }
    if (cursorY + tileSize + gutter > atlasSize) {
      return null;
    }
    placed.push({
      ...tile,
      x: cursorX,
      y: cursorY
    });
    cursorX += tileSize + gutter * 2;
    rowHeight = Math.max(rowHeight, tileSize);
  }
  return placed;
}
export function packSpotShadowAtlasTiles(tileSizes = [], maxAtlasSize = 4096, tileGutter = DEFAULT_TILE_GUTTER) {
  const atlasLimit = toPositiveInt(maxAtlasSize, 4096);
  const gutterPx = Math.max(0, Math.floor(Number(tileGutter) || 0));
  const entries = tileSizes
    .map((size, index) => ({
      index: index,
      size: toPositiveInt(size)
    }))
    .filter(entry => entry.size > 0 && entry.size + gutterPx * 2 <= atlasLimit)
    .sort((entryA, entryB) => entryB.size - entryA.size || entryA.index - entryB.index);
  if (entries.length !== tileSizes.length) {
    return null;
  }
  if (!entries.length) {
    return {
      size: 1,
      tiles: []
    };
  }
  const totalArea = entries.reduce((sum, tileEntry) => sum + (tileEntry.size + gutterPx * 2) ** 2, 0);
  let atlasSizeCandidate = nextPowerOfTwo(Math.max(entries[0].size + gutterPx * 2, Math.sqrt(totalArea)));
  while (atlasSizeCandidate <= atlasLimit) {
    const candidateLayout = packTilesIntoAtlas(entries, atlasSizeCandidate, gutterPx);
    if (candidateLayout) {
      const orderedTiles = Array(tileSizes.length);
      for (const placedTile of candidateLayout) {
        orderedTiles[placedTile.index] = placedTile;
      }
      return {
        size: atlasSizeCandidate,
        tiles: orderedTiles
      };
    }
    atlasSizeCandidate *= 2;
  }
  return null;
}
function spotLightKey(lightObject) {
  const floorId = String(lightObject?.userData?.lightFloorId || "");
  const itemId = String(lightObject?.userData?.lightItemId || "");
  if (itemId) {
    return floorId + ":" + itemId;
  } else {
    return "";
  }
}
function collectShadowLights(searchRoot, { includeHidden: includeHidden = true } = {}) {
  const lights = [];
  searchRoot?.traverse(object => {
    if (
      !!object.isSpotLight &&
      object.userData?.shadowCandidate === true &&
      !!spotLightKey(object) &&
      (!!includeHidden || object.visible !== false) &&
      (!(Number(object.userData?.lightBrightness || 0) <= 0) ||
        object.userData?.prewarmShadow === true)
    ) {
      lights.push(object);
    }
  });
  return lights;
}
function isShadowableMaterial(material) {
  return (
    !!material &&
    (!!material.isMeshStandardMaterial ||
      !!material.isMeshPhysicalMaterial ||
      !!material.isMeshLambertMaterial ||
      !!material.isMeshPhongMaterial ||
      !!material.isMeshToonMaterial)
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
  const spotLightBranchStart = lightsShader.indexOf("#if ( NUM_SPOT_LIGHTS > 0 )");
  const dirLightBranchStart = lightsShader.indexOf("#if ( NUM_DIR_LIGHTS > 0 )", spotLightBranchStart);
  const directLightCall =
    "RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );";
  const spotLightBranch = lightsShader.slice(spotLightBranchStart, dirLightBranchStart);
  if (spotLightBranchStart < 0 || dirLightBranchStart < 0 || spotLightBranch.split(directLightCall).length !== 2) {
    throw new Error("当前 Three.js 聚光灯反射 Shader 与零贡献优化不兼容。");
  }
  const guardedCall =
    "\n    #ifdef HB_SKIP_ZERO_SPOT_LIGHT\n      if ( any( notEqual( directLight.color, vec3( 0.0 ) ) ) ) {\n    #endif\n      " +
    directLightCall +
    "\n    #ifdef HB_SKIP_ZERO_SPOT_LIGHT\n      }\n    #endif";
  return lightsShader.slice(0, spotLightBranchStart) + spotLightBranch.replace(directLightCall, guardedCall) + lightsShader.slice(dirLightBranchStart);
}
function patchLightsFragmentBegin(THREE) {
  const spotShadowLoopMarker =
    "\n\t\t#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS )";
  const atlasShadowPatch =
    "\n    #if defined( USE_USER_SPOT_SHADOW_ATLAS )\n      directLight.color *= ( directLight.visible && receiveShadow )\n        ? getUserSpotAtlasShadow( userSpotShadowRect[ i ], userSpotShadowParams[ i ], vUserSpotShadowCoord[ i ] )\n        : 1.0;\n    #endif\n";
  const lightsFragmentBegin = THREE.ShaderChunk.lights_fragment_begin;
  if (!lightsFragmentBegin.includes(spotShadowLoopMarker)) {
    throw new Error("当前 Three.js 灯光 Shader 与阴影图集不兼容。");
  }
  return guardZeroContributionSpotLights(lightsFragmentBegin.replace(spotShadowLoopMarker, "" + atlasShadowPatch + spotShadowLoopMarker));
}
function disposeShadowTargets(disposedLight) {
  disposedLight?.shadow?.map?.dispose?.();
  disposedLight?.shadow?.mapPass?.dispose?.();
  if (disposedLight?.shadow) {
    disposedLight.shadow.map = null;
    disposedLight.shadow.mapPass = null;
  }
}
export function createSpotShadowAtlasController({
  THREE: three,
  renderer: renderer,
  scene: scene,
  camera: camera,
  requestFrame: requestFrame = () => {},
  canBuild: canBuild = () => true,
  buildDelay: buildDelay = 80,
  syncBeforeRender: syncBeforeRender = false
} = {}) {
  if (!three || !renderer || !scene || !camera) {
    throw new Error("创建阴影图集时缺少 Three.js 渲染上下文。");
  }
  const uniforms = {
    userSpotShadowAtlas: {
      value: null
    },
    userSpotShadowAtlasEnabled: {
      value: 0
    },
    userSpotShadowMatrix: {
      value: []
    },
    userSpotShadowRect: {
      value: []
    },
    userSpotShadowParams: {
      value: []
    }
  };
  const patchedLightsFragment = patchLightsFragmentBegin(three);
  const entryByLightKey = new Map();
  let atlasTarget = null;
  let scratchTarget = null;
  let preparedMaterials = new WeakSet();
  let pendingRoot = null;
  let buildTimer = 0;
  let revision = 0;
  let isBuilding = false;
  let isDirty = false;
  let isDisposed = false;
  let isEnabled = true;
  let syncedLights = null;
  let syncedEntries = [];
  let previousLights = [];
  let previousEntries = [];
  const scratchMatrix4 = new three.Matrix4();
  const scratchVector4 = new three.Vector4();
  const lightIndex = syncBeforeRender ? createRenderLightIndex() : null;
  let lastIndexSignature = "";
  // Mesh onBeforeRender fires during the color pass, after Three.js has a live
  // currentRenderState. scene.onBeforeRender is too early in r182 (state is still
  // null), which is why forced shadowMap.render() must not run from that hook.
  const bakeProbeMesh = new three.Mesh(
    new three.BufferGeometry().setAttribute(
      "position",
      new three.Float32BufferAttribute([], 3)
    ),
    new three.MeshBasicMaterial({
      colorWrite: false,
      depthWrite: false,
      depthTest: false
    })
  );
  bakeProbeMesh.name = "spot-shadow-atlas-bake-probe";
  bakeProbeMesh.frustumCulled = false;
  bakeProbeMesh.layers.enableAll();
  bakeProbeMesh.onBeforeRender = () => {};
  function setAtlasEnabled(enabled) {
    uniforms.userSpotShadowAtlasEnabled.value = enabled && isEnabled && entryByLightKey.size ? 1 : 0;
  }
  function areShadowUpdatesFrozen() {
    // The renderer freezes shadow updates (autoUpdate and needsUpdate both false)
    // while a floor transition slides floors between stacked positions. A bake in
    // that window would sample moving world matrices and would be superseded by
    // nothing once the floors settle, so it waits for the freeze to lift.
    return renderer.shadowMap.autoUpdate === false && renderer.shadowMap.needsUpdate === false;
  }
  function prepareMaterial(materialToPrepare) {
    if (!isShadowableMaterial(materialToPrepare) || preparedMaterials.has(materialToPrepare)) {
      return;
    }
    if (
      materialToPrepare.environmentSourceMaterial &&
      preparedMaterials.has(materialToPrepare.environmentSourceMaterial) &&
      materialToPrepare.defines?.USE_USER_SPOT_SHADOW_ATLAS === 1
    ) {
      preparedMaterials.add(materialToPrepare);
      return;
    }
    preparedMaterials.add(materialToPrepare);
    const previousOnBeforeCompile = materialToPrepare.onBeforeCompile;
    const previousCacheKey = materialToPrepare.customProgramCacheKey?.bind(materialToPrepare);
    materialToPrepare.defines = {
      ...(materialToPrepare.defines || {}),
      USE_USER_SPOT_SHADOW_ATLAS: 1
    };
    if (syncBeforeRender && materialToPrepare.isMeshStandardMaterial) {
      materialToPrepare.defines.HB_SKIP_ZERO_SPOT_LIGHT = 1;
    }
    materialToPrepare.onBeforeCompile = (shader, rendererInstance) => {
      previousOnBeforeCompile?.call(materialToPrepare, shader, rendererInstance);
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace("#include <shadowmap_pars_vertex>", "#include <shadowmap_pars_vertex>\n" + buildAtlasVertexParsChunk())
        .replace("#include <worldpos_vertex>", "#include <worldpos_vertex>")
        .replace("#include <shadowmap_vertex>", "#include <shadowmap_vertex>\n" + buildAtlasVertexChunk());
      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <shadowmap_pars_fragment>",
          "#include <shadowmap_pars_fragment>\n" + buildAtlasFragmentChunk()
        )
        .replace("#include <lights_fragment_begin>", patchedLightsFragment);
    };
    materialToPrepare.customProgramCacheKey = () =>
      (previousCacheKey?.() || "") + "|user-spot-shadow-atlas-v7-zero-contribution";
    materialToPrepare.needsUpdate = true;
  }
  function prepareRoot(root) {
    if (!isDisposed) {
      root?.traverse(child => {
        if (!child.isMesh || child.receiveShadow === false) {
          return;
        }
        const materials = Array.isArray(child.material)
          ? child.material
          : child.material
            ? [child.material]
            : [];
        for (const candidateMaterial of materials) {
          prepareMaterial(candidateMaterial);
        }
      });
    }
  }
  function collectActiveLights(activeRoot) {
    return collectShadowLights(activeRoot, {
      includeHidden: false
    });
  }
  function syncUniforms(syncRoot = pendingRoot) {
    if (isDisposed) {
      return 0;
    }
    prepareRoot(syncRoot);
    syncedLights = null;
    const matrixUniforms = uniforms.userSpotShadowMatrix.value;
    const rectUniforms = uniforms.userSpotShadowRect.value;
    const paramUniforms = uniforms.userSpotShadowParams.value;
    matrixUniforms.length = 0;
    rectUniforms.length = 0;
    paramUniforms.length = 0;
    for (const light of collectActiveLights(syncRoot)) {
      const lightEntry = entryByLightKey.get(spotLightKey(light));
      matrixUniforms.push(lightEntry?.matrix || new three.Matrix4());
      rectUniforms.push(lightEntry?.rect || new three.Vector4());
      paramUniforms.push(
        lightEntry
          ? new three.Vector4(lightEntry.bias, lightEntry.intensity, 1, lightEntry.normalBias)
          : new three.Vector4(0, 0, 0, 0)
      );
      light.castShadow = false;
    }
    uniforms.userSpotShadowAtlas.value = atlasTarget?.texture || null;
    setAtlasEnabled(true);
    const enabledLightCount = paramUniforms.filter(lightParam => lightParam.z > 0.5).length;
    renderer.domElement.dataset.activeSpotShadows = String(enabledLightCount);
    return enabledLightCount;
  }
  function syncRenderLights(renderedScene, renderedCamera) {
    if (isDisposed || !syncBeforeRender || !renderedScene) {
      return;
    }
    const renderLights = previousLights;
    const renderEntries = previousEntries;
    renderLights.length = renderEntries.length = 0;
    for (const renderLight of lightIndex.read(renderedScene, renderedCamera)) {
      renderLights.push(renderLight);
    }
    const indexSignature = lightIndex.stats.builds + ":" + lightIndex.stats.sorts;
    if (indexSignature !== lastIndexSignature) {
      lastIndexSignature = indexSignature;
      renderer.domElement.dataset.lightIndexBuilds = String(lightIndex.stats.builds);
      renderer.domElement.dataset.lightIndexSorts = String(lightIndex.stats.sorts);
    }
    let isSame = syncedLights?.length === renderLights.length;
    for (let changeIndex = 0; changeIndex < renderLights.length; changeIndex++) {
      renderEntries.push(entryByLightKey.get(spotLightKey(renderLights[changeIndex])));
      if (renderLights[changeIndex] !== syncedLights?.[changeIndex] || renderEntries[changeIndex] !== syncedEntries[changeIndex]) {
        isSame = false;
      }
    }
    if (isSame) {
      return;
    }
    previousLights = syncedLights || [];
    previousEntries = syncedEntries;
    syncedLights = renderLights;
    syncedEntries = renderEntries;
    const matrixValues = uniforms.userSpotShadowMatrix.value;
    const rectValues = uniforms.userSpotShadowRect.value;
    const paramValues = uniforms.userSpotShadowParams.value;
    matrixValues.length = rectValues.length = paramValues.length = 0;
    for (const lightSource of renderEntries) {
      matrixValues.push(lightSource?.matrix || scratchMatrix4);
      rectValues.push(lightSource?.rect || scratchVector4);
      paramValues.push(
        lightSource
          ? (lightSource.uniformParams ||= new three.Vector4(
              lightSource.bias,
              lightSource.intensity,
              1,
              lightSource.normalBias
            ))
          : scratchVector4
      );
    }
  }
  function createAtlasTarget(targetSize) {
    const textureTarget = new three.WebGLRenderTarget(targetSize, targetSize, {
      format: three.RGFormat,
      type: three.HalfFloatType,
      minFilter: three.LinearFilter,
      magFilter: three.LinearFilter,
      depthBuffer: false,
      stencilBuffer: false
    });
    textureTarget.texture.name = "HomeOS shared spot shadow atlas";
    textureTarget.texture.generateMipmaps = false;
    return textureTarget;
  }
  function clearAtlasTarget(target) {
    const previousTarget = renderer.getRenderTarget();
    const previousClearColor = renderer.getClearColor(new three.Color()).clone();
    const previousClearAlpha = renderer.getClearAlpha();
    renderer.setRenderTarget(target);
    renderer.setClearColor(16777215, 1);
    renderer.clear(true, false, false);
    renderer.setRenderTarget(previousTarget);
    renderer.setClearColor(previousClearColor, previousClearAlpha);
  }
  async function yieldToScheduler() {
    if (globalThis.scheduler?.yield) {
      return globalThis.scheduler.yield();
    } else {
      return new Promise(resolve => setTimeout(resolve, 0));
    }
  }
  async function rebuildAtlas(buildRoot, buildRevision) {
    if (isDisposed || isBuilding || buildRevision !== revision) {
      return;
    }
    if (!buildRoot) {
      isDirty = false;
      return;
    }
    if (!canBuild() || areShadowUpdatesFrozen()) {
      renderer.domElement.dataset.spotShadowBakeState = "paused";
      scheduleBuild(160);
      return;
    }
    isDirty = false;
    const shadowLights = collectShadowLights(buildRoot);
    if (!shadowLights.length) {
      entryByLightKey.clear();
      atlasTarget?.dispose?.();
      atlasTarget = null;
      uniforms.userSpotShadowAtlas.value = null;
      setAtlasEnabled(false);
      requestFrame();
      return;
    }
    const maxTextureSize = toPositiveInt(renderer.capabilities?.maxTextureSize, 4096);
    const lightMapSizes = shadowLights.map(shadowLight => toPositiveInt(shadowLight.shadow?.mapSize?.x, 256));
    const layout = packSpotShadowAtlasTiles(lightMapSizes, maxTextureSize);
    if (!layout) {
      throw new Error(
        "当前设备最大阴影图集 " + maxTextureSize + "px 无法容纳 " + shadowLights.length + " 盏灯。"
      );
    }
    let nextAtlasTarget = null;
    const nextEntryByLightKey = new Map();
    const missingLightKeys = [];
    const previousRenderTarget = renderer.getRenderTarget();
    const previousShadowMapEnabled = renderer.shadowMap.enabled;
    const previousShadowMapNeedsUpdate = renderer.shadowMap.needsUpdate;
    const lightStates = shadowLights.map(capturedLight => ({
      light: capturedLight,
      visible: capturedLight.visible,
      intensity: capturedLight.intensity,
      castShadow: capturedLight.castShadow
    }));
    isBuilding = true;
    const previousSuppressOverviewStack = renderer.userData?.suppressOverviewStack;
    renderer.userData = renderer.userData || {};
    renderer.userData.suppressOverviewStack = true;
    try {
      prepareRoot(buildRoot);
      nextAtlasTarget = createAtlasTarget(layout.size);
      renderer.initRenderTarget(nextAtlasTarget);
      clearAtlasTarget(nextAtlasTarget);
      scratchTarget ||= new three.WebGLRenderTarget(1, 1, {
        depthBuffer: true,
        stencilBuffer: false
      });
      setAtlasEnabled(false);
      for (const lightState of lightStates) {
        lightState.light.visible = false;
        lightState.light.castShadow = false;
      }
      // The bake renders its own off-screen shadow pass, so it must not be
      // skipped by the app's global shadow state: three.js bails out of the
      // shadow pass while shadowMap.autoUpdate and shadowMap.needsUpdate are both
      // false, and also while shadowMap.enabled is false. The freeze that floor
      // transitions use is normally waited out by areShadowUpdatesFrozen(); this
      // covers the remaining states. Both values are restored in the finally.
      renderer.shadowMap.enabled = true;
      for (let lightCursor = 0; lightCursor < shadowLights.length; lightCursor += 1) {
        if (buildRevision !== revision) {
          return;
        }
        if (areShadowUpdatesFrozen()) {
          // A floor transition started while this bake was yielding between two
          // lights. Drop the partial atlas and rebuild once the floors settle.
          isDirty = true;
          scheduleBuild(160);
          return;
        }
        const activeLight = shadowLights[lightCursor];
        const targetTile = layout.tiles[lightCursor];
        activeLight.visible = true;
        activeLight.intensity = Math.max(
          Number(activeLight.userData?.lightOnIntensity || activeLight.intensity || 1),
          0.001
        );
        syncUniforms(buildRoot);
        setAtlasEnabled(false);
        activeLight.castShadow = true;
        activeLight.shadow.autoUpdate = false;
        activeLight.shadow.needsUpdate = true;
        renderer.shadowMap.needsUpdate = true;
        // CollectShadowLights may include lights whose parents are hidden.
        // Three.js only puts visible-in-hierarchy lights into the shadow list.
        const restoredVisibility = [];
        for (let visibilityNode = activeLight; visibilityNode; visibilityNode = visibilityNode.parent) {
          if (visibilityNode.visible === false) {
            restoredVisibility.push(visibilityNode);
            visibilityNode.visible = true;
          }
        }
        activeLight.visible = true;
        activeLight.target?.updateWorldMatrix(true, false);
        activeLight.updateWorldMatrix(true, false);
        // Force-bake from the probe mesh's onBeforeRender so currentRenderState
        // is live (see bakeProbeMesh note above). An explicit light list also
        // covers spots that projectObject would skip (layer / hierarchy edge
        // cases). The stock shadow pass may bake the same light first; a second
        // pass here is cheap and keeps the atlas path deterministic.
        let forcedShadowBake = false;
        let shadowBakeError = null;
        bakeProbeMesh.onBeforeRender = () => {
          if (forcedShadowBake) {
            return;
          }
          forcedShadowBake = true;
          try {
            activeLight.shadow.needsUpdate = true;
            renderer.shadowMap.needsUpdate = true;
            renderer.shadowMap.render([activeLight], scene, camera);
          } catch (shadowError) {
            shadowBakeError = shadowError;
          }
        };
        if (!bakeProbeMesh.parent) {
          scene.add(bakeProbeMesh);
        }
        renderer.setRenderTarget(scratchTarget);
        try {
          renderer.render(scene, camera);
        } catch (renderError) {
          shadowBakeError ||= renderError;
        } finally {
          bakeProbeMesh.onBeforeRender = () => {};
          for (const visibilityNode of restoredVisibility) {
            visibilityNode.visible = false;
          }
        }
        if (shadowBakeError) {
          console.warn(
            "阴影图集: 单灯阴影烘焙失败，已按无阴影处理。",
            spotLightKey(activeLight),
            shadowBakeError
          );
        }
        const shadowTexture = activeLight.shadow?.map?.texture;
        if (shadowTexture) {
          renderer.copyTextureToTexture(
            shadowTexture,
            nextAtlasTarget.texture,
            new three.Box2(new three.Vector2(0, 0), new three.Vector2(targetTile.size, targetTile.size)),
            new three.Vector2(targetTile.x, targetTile.y)
          );
          const halfPixelInset = 0.5;
          nextEntryByLightKey.set(spotLightKey(activeLight), {
            tile: {
              ...targetTile
            },
            matrix: activeLight.shadow.matrix.clone(),
            rect: new three.Vector4(
              (targetTile.x + halfPixelInset) / layout.size,
              (targetTile.y + halfPixelInset) / layout.size,
              Math.max(0, targetTile.size - halfPixelInset * 2) / layout.size,
              Math.max(0, targetTile.size - halfPixelInset * 2) / layout.size
            ),
            bias: Number(activeLight.shadow.bias || 0),
            normalBias: Number(activeLight.shadow.normalBias || 0),
            intensity: Number(activeLight.shadow.intensity ?? 1)
          });
        } else {
          // Never discard the whole atlas for one light: a skipped light simply
          // renders unshadowed through userSpotShadowParams.z = 0.
          missingLightKeys.push(spotLightKey(activeLight));
        }
        activeLight.castShadow = false;
        activeLight.visible = false;
        disposeShadowTargets(activeLight);
        await yieldToScheduler();
      }
      if (buildRevision !== revision) {
        return;
      }
      atlasTarget?.dispose?.();
      atlasTarget = nextAtlasTarget;
      entryByLightKey.clear();
      for (const [lightKey, atlasEntry] of nextEntryByLightKey) {
        entryByLightKey.set(lightKey, atlasEntry);
      }
      uniforms.userSpotShadowAtlas.value = atlasTarget.texture;
      const domElement = renderer.domElement;
      domElement.dataset.spotShadowMode = "atlas";
      domElement.dataset.spotShadowBakeState = "ready";
      domElement.dataset.spotShadowAtlasSize = String(layout.size);
      domElement.dataset.spotShadowAtlasLights = String(entryByLightKey.size);
      domElement.dataset.spotShadowMissedLights = String(missingLightKeys.length);
      if (missingLightKeys.length) {
        console.warn(
          "阴影图集: " + missingLightKeys.length + " 盏灯未生成阴影贴图，已按无阴影处理。",
          missingLightKeys
        );
      }
    } finally {
      renderer.userData.suppressOverviewStack = previousSuppressOverviewStack;
      renderer.setRenderTarget(previousRenderTarget);
      renderer.shadowMap.enabled = previousShadowMapEnabled;
      renderer.shadowMap.needsUpdate = previousShadowMapNeedsUpdate;
      for (const previousState of lightStates) {
        previousState.light.visible = previousState.visible;
        previousState.light.intensity = previousState.intensity;
        previousState.light.castShadow = false;
      }
      if (atlasTarget !== nextAtlasTarget) {
        nextAtlasTarget?.dispose();
      }
      isBuilding = false;
      if (isDisposed) {
        disposeAtlases();
      } else {
        syncUniforms(pendingRoot);
        if (isDirty && !buildTimer) {
          scheduleBuild(0);
        }
        requestFrame();
      }
    }
  }
  function scheduleBuild(delay) {
    if (!isDisposed && !!isDirty) {
      clearTimeout(buildTimer);
      buildTimer = setTimeout(
        () => {
          buildTimer = 0;
          if (!isDisposed && !isBuilding && !!isDirty) {
            rebuildAtlas(pendingRoot, revision).catch(error => {
              if (!isDisposed) {
                console.error(error);
                renderer.domElement.dataset.spotShadowMode = "fallback";
              }
            });
          }
        },
        Math.max(0, Number(delay) || 0)
      );
    }
  }
  function schedule(scheduledRoot, { delay: scheduleDelay = buildDelay } = {}) {
    if (isDisposed) {
      return 0;
    }
    pendingRoot = scheduledRoot;
    prepareRoot(scheduledRoot);
    for (const scheduledLight of collectShadowLights(scheduledRoot)) {
      scheduledLight.castShadow = false;
    }
    syncUniforms(scheduledRoot);
    revision += 1;
    isDirty = true;
    scheduleBuild(scheduleDelay);
    return collectShadowLights(scheduledRoot).length;
  }
  let lastRoot = null;
  let lastRevision = -1;
  let lastLightIndexBuilds = -1;
  let trackedLights = [];
  function refreshGeometry(refreshRoot = pendingRoot, viewBoxes = null) {
    if (isDisposed) {
      return true;
    }
    if (isBuilding || buildTimer || isDirty) {
      return false;
    }
    if (!atlasTarget || !entryByLightKey.size) {
      return true;
    }
    const lightIndexBuilds = lightIndex?.stats.builds || 0;
    if (lastRoot !== refreshRoot || lastRevision !== revision || lastLightIndexBuilds !== lightIndexBuilds) {
      lastRoot = refreshRoot;
      lastRevision = revision;
      lastLightIndexBuilds = lightIndexBuilds;
      trackedLights = [];
      refreshRoot?.traverse(trackedLight => {
        if (trackedLight.isSpotLight && trackedLight.shadow && entryByLightKey.has(spotLightKey(trackedLight))) {
          trackedLights.push(trackedLight);
        }
      });
    }
    const frustumBoxes =
      viewBoxes === null ? null : viewBoxes.filter(box => box?.isBox3 && !box.isEmpty());
    const updates = [];
    refreshRoot?.updateWorldMatrix(true, true);
    for (const updateLight of trackedLights) {
      const geometryEntry = entryByLightKey.get(spotLightKey(updateLight));
      if (geometryEntry?.tile) {
        updateLight.target?.updateWorldMatrix(true, false);
        updateLight.shadow.updateMatrices(updateLight);
        if (!frustumBoxes || !!frustumBoxes.some(viewBox => updateLight.shadow.getFrustum().intersectsBox(viewBox))) {
          updates.push({
            light: updateLight,
            entry: geometryEntry,
            matrix: updateLight.shadow.matrix.clone(),
            cast: updateLight.castShadow,
            visible: updateLight.visible,
            autoUpdate: updateLight.shadow.autoUpdate,
            needsUpdate: updateLight.shadow.needsUpdate,
            map: updateLight.shadow.map,
            mapPass: updateLight.shadow.mapPass
          });
        }
      }
    }
    if (!updates.length) {
      return true;
    }
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
      needsUpdate: renderer.shadowMap.needsUpdate
    };
    try {
      renderer.shadowMap.enabled = true;
      for (const update of updates) {
        const { light: refreshLight } = update;
        try {
          refreshLight.castShadow = true;
          refreshLight.visible = true;
          refreshLight.shadow.autoUpdate = false;
          refreshLight.shadow.needsUpdate = true;
          renderer.shadowMap.needsUpdate = true;
          // Safe here: refreshGeometry runs from an onBeforeRender probe while
          // WebGLRenderer still has a live currentRenderState.
          renderer.shadowMap.render([refreshLight], scene, camera);
          if (!refreshLight.shadow.map?.texture) {
            return false;
          }
          update.texture = refreshLight.shadow.map.texture;
          update.matrix.copy(refreshLight.shadow.matrix);
        } catch (refreshError) {
          console.warn(
            "阴影图集: 几何刷新烘焙失败。",
            spotLightKey(refreshLight),
            refreshError
          );
          return false;
        } finally {
          refreshLight.castShadow = update.cast;
          refreshLight.visible = update.visible;
        }
      }
      for (const { texture: texture, entry: updatedEntry, matrix: lightMatrix } of updates) {
        const tileDefinition = updatedEntry.tile;
        renderer.copyTextureToTexture(
          texture,
          atlasTarget.texture,
          new three.Box2(new three.Vector2(0, 0), new three.Vector2(tileDefinition.size, tileDefinition.size)),
          new three.Vector2(tileDefinition.x, tileDefinition.y)
        );
        updatedEntry.matrix.copy(lightMatrix);
      }
    } finally {
      for (const previousUpdate of updates) {
        const { light: restoreLight } = previousUpdate;
        restoreLight.castShadow = previousUpdate.cast;
        restoreLight.visible = previousUpdate.visible;
        restoreLight.shadow.autoUpdate = previousUpdate.autoUpdate;
        restoreLight.shadow.needsUpdate = previousUpdate.needsUpdate;
        if (restoreLight.shadow.map !== previousUpdate.map) {
          restoreLight.shadow.map?.dispose();
        }
        if (restoreLight.shadow.mapPass !== previousUpdate.mapPass) {
          restoreLight.shadow.mapPass?.dispose();
        }
        restoreLight.shadow.map = previousUpdate.map;
        restoreLight.shadow.mapPass = previousUpdate.mapPass;
      }
      renderer.shadowMap.enabled = rendererState.enabled;
      renderer.shadowMap.autoUpdate = rendererState.autoUpdate;
      renderer.shadowMap.needsUpdate = rendererState.needsUpdate;
      renderer.setViewport(rendererState.viewport);
      renderer.setScissor(rendererState.scissor);
      renderer.setScissorTest(rendererState.scissorTest);
      renderer.setRenderTarget(rendererState.target, rendererState.face, rendererState.mip);
      renderer.setClearColor(rendererState.clear, rendererState.alpha);
    }
    renderer.domElement.dataset.curtainShadowUpdates = String(
      Number(renderer.domElement.dataset.curtainShadowUpdates || 0) + 1
    );
    return true;
  }
  function setEnabled(nextEnabled) {
    if (!isDisposed) {
      isEnabled = nextEnabled !== false;
      setAtlasEnabled(true);
      requestFrame();
    }
  }
  function disposeAtlases() {
    atlasTarget?.dispose();
    scratchTarget?.dispose();
    atlasTarget = null;
    scratchTarget = null;
    entryByLightKey.clear();
    uniforms.userSpotShadowAtlas.value = null;
    setAtlasEnabled(false);
  }
  function dispose() {
    if (!isDisposed) {
      isDisposed = true;
      revision += 1;
      isDirty = false;
      clearTimeout(buildTimer);
      buildTimer = 0;
      pendingRoot = null;
      lightIndex?.dispose();
      lastRoot = null;
      trackedLights = [];
      syncedLights = null;
      syncedEntries = [];
      previousLights = [];
      previousEntries = [];
      bakeProbeMesh.onBeforeRender = () => {};
      bakeProbeMesh.removeFromParent();
      bakeProbeMesh.geometry.dispose();
      bakeProbeMesh.material.dispose();
      if (!isBuilding) {
        disposeAtlases();
      }
    }
  }
  if (syncBeforeRender) {
    const previousOnBeforeRender = scene.onBeforeRender;
    scene.onBeforeRender = function (...args) {
      previousOnBeforeRender?.apply(this, args);
      syncRenderLights(args[1] || scene, args[2] || camera);
    };
  }
  return {
    prepareRoot: prepareRoot,
    refreshGeometry: refreshGeometry,
    schedule: schedule,
    sync: syncUniforms,
    setEnabled: setEnabled,
    dispose: dispose,
    activeCount: () => entryByLightKey.size,
    isBuilding: () => isBuilding,
    isPending: () => !!buildTimer || isDirty,
    releaseRenderIndex: () => lightIndex?.dispose()
  };
}
