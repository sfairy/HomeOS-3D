import {
  captureContactShadowSnapshot,
  createContactShadowPersistentCache,
  restoreContactShadowSnapshot,
} from "./contact-shadow-persistent-cache";
import { createContactShadowPoseResolver } from "./studio-contact-shadow-pose";
import { stableModelTextureKey } from "../model-texture-cache";

/** 持久缓存实例（由 stage-startup 注入）。 */
type ContactShadowPersistentCache = ReturnType<typeof createContactShadowPersistentCache>;

function findUserFieldInAncestors(startObject: any, userFieldKey: any) {
  for (let ancestorObject = startObject; ancestorObject; ancestorObject = ancestorObject.parent)
    if (ancestorObject.userData?.[userFieldKey] !== undefined)
      return ancestorObject.userData[userFieldKey];
}
function isVisibleWithAncestors(rootObject3d: any) {
  for (let ancestorNode = rootObject3d; ancestorNode; ancestorNode = ancestorNode.parent)
    if (!ancestorNode.visible) return false;
  return true;
}
function isContactCasterMaterial(candidateMaterial: any) {
  return !!(
    candidateMaterial &&
    candidateMaterial.visible !== false &&
    candidateMaterial.opacity >= 0.98 &&
    !(candidateMaterial.transmission > 0) &&
    (!candidateMaterial.transparent || candidateMaterial.alphaTest > 0)
  );
}

function computeSurfaceLevels(threeApi: any, meshList: any, floorY: any, levelLimit = 32) {
  const map = new Map(),
    vector = new threeApi.Vector3(),
    vertexB = new threeApi.Vector3(),
    vertexC = new threeApi.Vector3(),
    edgeAB = new threeApi.Vector3(),
    edgeAC = new threeApi.Vector3(),
    faceNormal = new threeApi.Vector3(),
    meshMatrix = new threeApi.Matrix4(),
    instanceMatrix = new threeApi.Matrix4();
  for (const mesh of meshList) {
    const material = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    if (
      material.length &&
      material.every((materialEntry: any) => materialEntry?.userData?.plan2SurfaceContact === false)
    )
      continue;
    const geometry = mesh.geometry,
      positionAttribute = geometry?.attributes?.position;
    if (!positionAttribute) continue;
    const index = geometry.index,
      count = index?.count ?? positionAttribute.count,
      start = geometry.drawRange.start,
      min = Math.min(count, start + geometry.drawRange.count);
    for (let num = 0; num < (mesh.isInstancedMesh ? mesh.count : 1); num++) {
      (meshMatrix.copy(mesh.matrixWorld),
        mesh.isInstancedMesh &&
          (mesh.getMatrixAt(num, instanceMatrix), meshMatrix.multiply(instanceMatrix)));
      for (let vertexCursor = start; vertexCursor + 2 < min; vertexCursor += 3) {
        (vector
          .fromBufferAttribute(positionAttribute, index ? index.getX(vertexCursor) : vertexCursor)
          .applyMatrix4(meshMatrix),
          vertexB
            .fromBufferAttribute(
              positionAttribute,
              index ? index.getX(vertexCursor + 1) : vertexCursor + 1,
            )
            .applyMatrix4(meshMatrix),
          vertexC
            .fromBufferAttribute(
              positionAttribute,
              index ? index.getX(vertexCursor + 2) : vertexCursor + 2,
            )
            .applyMatrix4(meshMatrix),
          faceNormal.crossVectors(
            edgeAB.subVectors(vertexB, vector),
            edgeAC.subVectors(vertexC, vector),
          ));
        const triangleArea = faceNormal.length() * 0.5,
          surfaceHeight = (vector.y + vertexB.y + vertexC.y) / 3 - floorY,
          minSurfaceHeight = mesh.userData?.regionReceiverKind === "floor" ? 0.015 : 0.12;
        if (
          triangleArea < 0.004 ||
          faceNormal.y < triangleArea * 1.9998 ||
          surfaceHeight <= minSurfaceHeight
        )
          continue;
        const round = Math.round(surfaceHeight * 100),
          options = map.get(round) || {
            height: 0,
            area: 0,
            top: -Infinity,
          };
        ((options.height += surfaceHeight * triangleArea),
          (options.area += triangleArea),
          (options.top = Math.max(
            options.top,
            vector.y - floorY,
            vertexB.y - floorY,
            vertexC.y - floorY,
          )),
          map.set(round, options));
      }
    }
  }
  return [...map.values()]
    .sort((levelA, levelB) => levelB.area - levelA.area)
    .slice(0, levelLimit)
    .map((levelEntry) => ({
      height: levelEntry.height / levelEntry.area,
      top: levelEntry.top,
    }))
    .sort((levelLeft, levelRight) => levelLeft.height - levelRight.height);
}
/** 缓存的 uniform 槽位。 */
type CachedUniformLike = { value?: any };

/** collectSceneGroups 的收景范围过滤。 */
type SceneGroupFilter = {
  /** 运动态：只处理需要跟着地面一起动的组。 */
  motion?: boolean;
  /** 全部楼层都重建； */
  allFloors?: boolean;
  /** 本次只需要这些楼层； */
  affectedFloors?: Set<any>;
};

export function createContactShadowController({
  THREE: THREE,
  renderer: renderer,
  getRoot: getRoot,
  canBuild: canBuild = () => true,
  requestFrame: requestFrame = () => {},
  maxCapturesPerSync: maxCapturesPerSync = Infinity,
  deferSurfaceBake: deferSurfaceBake = false,
  deferInitialBake: deferInitialBake = false,
  surfaceBatchSize: surfaceBatchSize = 2,
  surfaceBudgetMs: surfaceBudgetMs = 4,
  now: now = () => performance.now(),
  followMotion: followMotion = false,
  persistentCache: persistentCache = null as ContactShadowPersistentCache | null,
}: any) {
  const settings = {
      enabled: true,
      opacity: 0.78,
      resolution: 1024,
      maxHeight: 2.5,
      heightFalloff: 1.2,
      blurMeters: 0.055,
      offsetX: 0.28,
      offsetZ: -0.22,
      surfaceEnabled: true,
      surfaceOpacity: 0.75,
      surfaceResolution: 256,
      maxSurfaceLevels: 32,
    },
    stats = {
      builds: 0,
      capturePasses: 0,
      floors: 0,
      casters: 0,
      instancedCasters: 0,
      receivers: 0,
      surfaceCaptures: 0,
      surfacePasses: 0,
      testedCasters: 0,
      culledCasters: 0,
      cacheHits: 0,
      cachedFloors: 0,
      cachedBytes: 0,
      persistentHits: 0,
      cachedLayouts: 0,
      disposed: false,
    },
    floorStatesById = new Map(),
    depthMaterialsByKey = new Map(),
    weakMap = new WeakMap(),
    detailGeometryKeyByGeometry = new WeakMap(),
    receiverBoundsCacheByGeometry = new WeakMap(),
    cachedLayoutsByKey = new Map(),
    placeholderTexture = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
  placeholderTexture.needsUpdate = true;
  let shouldRebuild = true,
    isDisposed = false,
    isSuspended = false,
    isMotionSuspended = false,
    value: any = null,
    frameProvider: any = null,
    isIncrementalUpdate = false,
    shouldReuseLayout = false,
    shouldRefreshMotion = true,
    isInitialBakeDeferred = deferInitialBake === true,
    shouldDeferSurfaceBake = deferInitialBake && deferSurfaceBake,
    isSurfaceBakeDeferred = deferSurfaceBake === true,
    isEntranceTransition = false,
    bakeGeneration = 0,
    isSyncEnabled = true;
  const pendingSurfaceBakesByFloorId = new Map();
  function disposePendingSurfaceBakes(floorIdFilter: any = null) {
    for (const [surfaceBakeFloorId, surfaceBakeEntry] of pendingSurfaceBakesByFloorId)
      if (!floorIdFilter || floorIdFilter.has(surfaceBakeFloorId))
        try {
          surfaceBakeEntry.iterator.return();
        } finally {
          (surfaceBakeEntry.dispose(), pendingSurfaceBakesByFloorId.delete(surfaceBakeFloorId));
        }
  }
  const set = new Set();
  let visibleFloorId: any = null;
  const matchesVisibleFloor = (candidateFloorId: any) =>
      visibleFloorId === null || candidateFloorId === visibleFloorId,
    blurScene = new THREE.Scene(),
    blurCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1),
    blurMaterial = new THREE.ShaderMaterial({
      uniforms: {
        source: {
          value: placeholderTexture,
        },
        stepSize: {
          value: new THREE.Vector2(),
        },
        spread: {
          value: 0,
        },
      },
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      vertexShader:
        "varying vec2 shadowUv; void main() { shadowUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }",
      fragmentShader:
        "uniform sampler2D source; uniform vec2 stepSize; uniform float spread; varying vec2 shadowUv;\n      void main() {\n        float center = texture2D(source, shadowUv).r;\n        float nearA = texture2D(source, shadowUv + stepSize * 1.384615).r;\n        float nearB = texture2D(source, shadowUv - stepSize * 1.384615).r;\n        float farA = texture2D(source, shadowUv + stepSize * 3.230769).r;\n        float farB = texture2D(source, shadowUv - stepSize * 3.230769).r;\n        float value = mix(center * 0.227027 + (nearA + nearB) * 0.316216 + (farA + farB) * 0.070270,\n          max(center, max(max(nearA, nearB), max(farA, farB))), spread);\n        gl_FragColor = vec4(vec3(value), 1.0);\n      }",
    }),
    blurQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), blurMaterial);
  ((blurQuad.frustumCulled = false), blurScene.add(blurQuad));
  function getFloorState(floorId: any) {
    const floorIdKey = String(floorId);
    return (
      floorStatesById.has(floorIdKey) ||
        floorStatesById.set(floorIdKey, {
          id: floorIdKey,
          target: null as any,
          ping: null as any,
          surface: null as any,
          lookup: null as any,
          casters: 0,
          instancedCasters: 0,
          receivers: 0,
          uniforms: {
            plan2ContactTransform: {
              value: new THREE.Matrix4(),
            },
            plan2ContactMap: {
              value: placeholderTexture,
            },
            plan2ContactBounds: {
              value: new THREE.Vector4(0, 0, 1, 1),
            },
            plan2ContactY: {
              value: 0,
            },
            plan2ContactOpacity: {
              value: 0,
            },
            plan2SurfaceMap: {
              value: placeholderTexture,
            },
            plan2SurfaceBounds: {
              value: new THREE.Vector4(),
            },
            plan2SurfaceLookup: {
              value: placeholderTexture,
            },
            plan2SurfaceLayout: {
              value: new THREE.Vector2(1, 1),
            },
            plan2SurfaceOpacity: {
              value: 0,
            },
          },
        }),
      floorStatesById.get(floorIdKey)
    );
  }
  function invalidate(floorIds?: any, keepLayoutCache = false) {
    if (!isDisposed) {
      if (
        (bakeGeneration++,
        (shouldRefreshMotion = true),
        disposePendingSurfaceBakes(
          floorIds == null ? null : new Set(typeof floorIds == "string" ? [floorIds] : floorIds),
        ),
        !keepLayoutCache)
      ) {
        shouldReuseLayout = false;
        const targetFloorIdSet =
          floorIds == null ? null : new Set(typeof floorIds == "string" ? [floorIds] : floorIds);
        for (const [iteratedLayoutKey, detachedState] of cachedLayoutsByKey)
          (!targetFloorIdSet || targetFloorIdSet.has(detachedState.id)) &&
            (disposeFloorState(detachedState), cachedLayoutsByKey.delete(iteratedLayoutKey));
      }
      if (floorIds == null) ((shouldRebuild = true), set.clear());
      else {
        if (!shouldRebuild) {
          const list = typeof floorIds == "string" ? [floorIds] : floorIds;
          for (const floorIdValue of list) floorIdValue != null && set.add(String(floorIdValue));
        }
      }
      (shouldRebuild || set.size) && requestFrame();
    }
  }
  function invalidateAllFloors() {
    if (!isDisposed) {
      for (const clearedFloorState of floorStatesById.values())
        disposeFloorState(clearedFloorState);
      ((stats.floors = 0), invalidate());
    }
  }
  function setEnabled(enabled: any) {
    ((settings.enabled = !!enabled), (stats.floors = 0));
    for (const enabledFloor of floorStatesById.values()) {
      enabledFloor.fade = null;
      const motionReady = isMotionSuspended
        ? followMotion && enabledFloor.motionReady
        : matchesVisibleFloor(enabledFloor.id);
      ((enabledFloor.uniforms.plan2ContactOpacity.value =
        settings.enabled && !isSuspended && motionReady && enabledFloor.target
          ? settings.opacity
          : 0),
        (enabledFloor.uniforms.plan2SurfaceOpacity.value =
          settings.enabled &&
          !isSuspended &&
          motionReady &&
          settings.surfaceEnabled &&
          enabledFloor.surface &&
          !enabledFloor.surfacePending
            ? settings.surfaceOpacity
            : 0),
        enabledFloor.target &&
          enabledFloor.uniforms.plan2ContactOpacity.value > 0 &&
          stats.floors++);
    }
    requestFrame();
  }
  function setSuspended(suspended: any) {
    const isNextSuspended = suspended === true;
    if (isNextSuspended !== isSuspended) {
      isSuspended = isNextSuspended;
      for (const suspendedFloor of floorStatesById.values())
        ((suspendedFloor.uniforms.plan2ContactOpacity.value = 0),
          (suspendedFloor.uniforms.plan2SurfaceOpacity.value = 0));
      ((stats.floors = 0), invalidate());
    }
  }
  function setMotion(motionEnabled: any) {
    if (isMotionSuspended !== (motionEnabled === true)) {
      if (((isMotionSuspended = motionEnabled === true), isMotionSuspended)) {
        for (const resumedFloor of floorStatesById.values())
          ((resumedFloor.motionReady = false),
            (resumedFloor.fade = followMotion
              ? null
              : {
                  started: performance.now(),
                  from: resumedFloor.uniforms.plan2ContactOpacity.value,
                  fromSurface: resumedFloor.uniforms.plan2SurfaceOpacity.value,
                  to: 0,
                  toSurface: 0,
                }));
      }
      if (!isMotionSuspended) {
        for (const clearedFloor of floorStatesById.values()) clearedFloor.fade = null;
        ((isIncrementalUpdate = true), (shouldReuseLayout = true));
      }
      invalidate(null, true);
    }
  }
  function updateBakedTransforms() {
    for (const bakedFloorState of floorStatesById.values()) {
      if (!bakedFloorState.bakedFrame) continue;
      bakedFloorState.anchor?.updateWorldMatrix(true, false);
      const anchorMatrix =
        frameProvider?.(bakedFloorState.id) || bakedFloorState.anchor?.matrixWorld;
      anchorMatrix &&
        bakedFloorState.uniforms.plan2ContactTransform.value
          .copy(anchorMatrix)
          .invert()
          .premultiply(bakedFloorState.bakedFrame);
    }
  }
  function getDepthMaterial(sourceMaterial: any, isSurfaceBake = false) {
    const stringify = JSON.stringify([
      isSurfaceBake,
      sourceMaterial.map?.uuid,
      sourceMaterial.alphaMap?.uuid,
      sourceMaterial.alphaTest,
      sourceMaterial.displacementMap?.uuid,
      sourceMaterial.displacementScale,
      sourceMaterial.displacementBias,
      settings.maxHeight,
      settings.heightFalloff,
      settings.offsetX,
      settings.offsetZ,
    ]);
    if (depthMaterialsByKey.has(stringify)) {
      const reusedMaterial = depthMaterialsByKey.get(stringify);
      return (
        depthMaterialsByKey.delete(stringify),
        depthMaterialsByKey.set(stringify, reusedMaterial),
        reusedMaterial
      );
    }
    const depthMaterial = new THREE.MeshDepthMaterial({
      depthPacking: THREE.BasicDepthPacking,
      side: THREE.DoubleSide,
      map: sourceMaterial.map ?? null,
      alphaMap: sourceMaterial.alphaMap ?? null,
      alphaTest: sourceMaterial.alphaTest ?? 0,
      displacementMap: sourceMaterial.displacementMap ?? null,
      displacementScale: sourceMaterial.displacementScale ?? 1,
      displacementBias: sourceMaterial.displacementBias ?? 0,
    });
    return (
      (depthMaterial.onBeforeCompile = (shader: any) => {
        ((shader.uniforms.contactNear = {
          value: 0.001,
        }),
          (shader.uniforms.contactFar = {
            value: isSurfaceBake ? 1.5 : settings.maxHeight + 0.06,
          }),
          (shader.uniforms.contactFalloff = {
            value: isSurfaceBake ? 0.5 : settings.heightFalloff,
          }),
          (shader.uniforms.contactOffset = {
            value: new THREE.Vector2(settings.offsetX, settings.offsetZ),
          }),
          (shader.vertexShader = "uniform vec2 contactOffset;\n" + shader.vertexShader));
        const text = "#include <project_vertex>";
        if (!shader.vertexShader.includes(text)) throw new Error("接触阴影材质缺少 project_vertex");
        ((shader.vertexShader = shader.vertexShader.replace(
          text,
          text +
            "\n        // The capture looks up from 6cm below this floor. project_vertex has\n        // already applied instancing, skinning and the mesh world transform.\n        // Ground contact stays fixed; elevated surfaces reveal a short shadow\n        // beside the furniture using the same cached map and depth falloff.\n        float contactHeight = max(-mvPosition.z - " +
            (isSurfaceBake ? "0.0" : "0.06") +
            ", 0.0);\n        gl_Position.xy += vec2(projectionMatrix[0][0], projectionMatrix[1][1]) * contactHeight * contactOffset;",
        )),
          (shader.fragmentShader =
            "uniform float contactNear, contactFar, contactFalloff;\n" + shader.fragmentShader),
          (shader.fragmentShader = shader.fragmentShader.replace(
            "gl_FragColor = vec4( vec3( 1.0 - fragCoordZ ), opacity );",
            "float height = max(mix(contactNear, contactFar, fragCoordZ) - " +
              (isSurfaceBake ? "0.0" : "0.06") +
              ", 0.0);\n         float density = exp(-height / contactFalloff) * (1.0 - smoothstep(" +
              (isSurfaceBake ? 0.8 : 1.8) +
              ", " +
              (isSurfaceBake ? 1.5 : 2.5) +
              ", height));\n         gl_FragColor = vec4(vec3(density), 1.0);",
          )));
      }),
      (depthMaterial.customProgramCacheKey = () =>
        isSurfaceBake ? "plan2-surface-bake-v1" : "plan2-contact-depth-v2-short-shadow"),
      depthMaterialsByKey.set(stringify, depthMaterial),
      depthMaterial
    );
  }
  function trimMaterialCache() {
    for (; depthMaterialsByKey.size > 64;) {
      const oldestMaterialKey = depthMaterialsByKey.keys().next().value;
      (depthMaterialsByKey.get(oldestMaterialKey).dispose(),
        depthMaterialsByKey.delete(oldestMaterialKey));
    }
  }
  function disposeFloorState(targetState: any) {
    ((targetState.surfacePending = false),
      (targetState.fade = null),
      (targetState.anchor = null),
      (targetState.bakedFrame = null),
      targetState.target?.dispose(),
      targetState.ping?.dispose(),
      targetState.surface?.dispose(),
      targetState.lookup?.dispose(),
      (targetState.target = null),
      (targetState.ping = null),
      (targetState.surface = null),
      (targetState.lookup = null),
      (targetState.uniforms.plan2ContactMap.value = placeholderTexture),
      (targetState.uniforms.plan2ContactOpacity.value = 0),
      (targetState.uniforms.plan2SurfaceMap.value = placeholderTexture),
      (targetState.uniforms.plan2SurfaceLookup.value = placeholderTexture),
      (targetState.uniforms.plan2SurfaceOpacity.value = 0));
  }
  function ensureRenderTargets(floorEntry: any, sizePx: any) {
    return (
      (floorEntry.target?.width !== sizePx || floorEntry.target?.height !== sizePx) &&
        (disposeFloorState(floorEntry),
        (floorEntry.target = new THREE.WebGLRenderTarget(sizePx, sizePx, {
          format: THREE.RedFormat,
          generateMipmaps: false,
        }))),
      floorEntry.ping ||
        (floorEntry.ping = new THREE.WebGLRenderTarget(sizePx, sizePx, {
          format: THREE.RedFormat,
          depthBuffer: false,
          generateMipmaps: false,
        })),
      {
        target: floorEntry.target,
        ping: floorEntry.ping,
      }
    );
  }
  function* bakeSurfaceLevels(
    surfaceEntry: any,
    casterMeshes: any,
    overrideByCaster: any,
    renderScene: any,
    casterBounds: any,
    floorBaseY: any,
    fallbackMaterial: any,
    refreshCasterVisibility: any,
  ) {
    const $e2 = computeSurfaceLevels(THREE, casterMeshes, floorBaseY, settings.maxSurfaceLevels),
      levelHeights = $e2.map((surfaceLevel) => surfaceLevel.height);
    if (((surfaceEntry.uniforms.plan2SurfaceOpacity.value = 0), !levelHeights.length)) {
      (surfaceEntry.surface?.dispose(),
        surfaceEntry.lookup?.dispose(),
        (surfaceEntry.surface = surfaceEntry.lookup = null),
        (surfaceEntry.uniforms.plan2SurfaceMap.value = placeholderTexture),
        (surfaceEntry.uniforms.plan2SurfaceLookup.value = placeholderTexture));
      return;
    }
    const ceil = Math.ceil(Math.sqrt(levelHeights.length)),
      tileSizePx = Math.min(
        settings.surfaceResolution,
        Math.floor(renderer.capabilities.maxTextureSize / ceil),
      ),
      atlasSizePx = ceil * tileSizePx;
    surfaceEntry.surface?.width !== atlasSizePx &&
      (surfaceEntry.surface?.dispose(),
      (surfaceEntry.surface = new THREE.WebGLRenderTarget(atlasSizePx, atlasSizePx, {
        format: THREE.RedFormat,
        depthBuffer: false,
        generateMipmaps: false,
      })));
    const clone = casterBounds.clone();
    clone.expandByVector(new THREE.Vector3(0.5, 0, 0.5));
    const surfaceWidth = clone.max.x - clone.min.x,
      surfaceDepth = clone.max.z - clone.min.z,
      surfaceCenterX = (clone.min.x + clone.max.x) / 2,
      surfaceCenterZ = (clone.min.z + clone.max.z) / 2,
      bakeCamera = new THREE.OrthographicCamera(
        -surfaceWidth / 2,
        surfaceWidth / 2,
        surfaceDepth / 2,
        -surfaceDepth / 2,
        0.001,
        1.5,
      );
    bakeCamera.up.set(0, 0, 1);
    const bakeTarget = new THREE.WebGLRenderTarget(tileSizePx, tileSizePx, {
        format: THREE.RedFormat,
        generateMipmaps: false,
      }),
      blurTarget = new THREE.WebGLRenderTarget(tileSizePx, tileSizePx, {
        format: THREE.RedFormat,
        depthBuffer: false,
        generateMipmaps: false,
      }),
      surfaceMaterialsByCaster = new Map(),
      toSurfaceMaterial = (surfaceSourceMaterial: any) =>
        isContactCasterMaterial(surfaceSourceMaterial)
          ? (surfaceMaterialsByCaster.has(surfaceSourceMaterial) ||
              surfaceMaterialsByCaster.set(
                surfaceSourceMaterial,
                getDepthMaterial(surfaceSourceMaterial, true),
              ),
            surfaceMaterialsByCaster.get(surfaceSourceMaterial))
          : fallbackMaterial;
    try {
      overrideByCaster.forEach((overrideMaterial: any, overrideIndex: any) => {
        const originalMaterial = casterMeshes[overrideIndex].material;
        overrideMaterial.material = Array.isArray(originalMaterial)
          ? originalMaterial.map(toSurfaceMaterial)
          : toSurfaceMaterial(originalMaterial);
      });
      let batchStartedAt = now(),
        batchPassCount = 0;
      for (let levelIndex = 0; levelIndex < levelHeights.length; levelIndex++) {
        (bakeCamera.position.set(
          surfaceCenterX,
          floorBaseY + $e2[levelIndex].top + 0.003,
          surfaceCenterZ,
        ),
          bakeCamera.lookAt(surfaceCenterX, bakeCamera.position.y + 1, surfaceCenterZ),
          bakeCamera.updateMatrixWorld(true),
          refreshCasterVisibility(bakeCamera),
          (renderer.autoClear = true),
          renderer.setClearColor(0, 1),
          renderer.setRenderTarget(bakeTarget),
          renderer.render(renderScene, bakeCamera),
          stats.surfacePasses++);
        const blurPass = (sourceTarget: any, destTarget: any, stepX: any, stepY: any, spread = 0) => {
          ((blurMaterial.uniforms.source.value = sourceTarget.texture),
            blurMaterial.uniforms.stepSize.value.set(stepX, stepY),
            (blurMaterial.uniforms.spread.value = spread),
            renderer.setRenderTarget(destTarget),
            renderer.render(blurScene, blurCamera));
        };
        (blurPass(bakeTarget, blurTarget, 0.006 / surfaceWidth, 0, 1),
          blurPass(blurTarget, bakeTarget, 0, 0.006 / surfaceDepth, 1),
          blurPass(bakeTarget, blurTarget, 0.012 / surfaceWidth, 0),
          blurPass(blurTarget, bakeTarget, 0, 0.012 / surfaceDepth),
          surfaceEntry.surface.viewport.set(
            (levelIndex % ceil) * tileSizePx,
            Math.floor(levelIndex / ceil) * tileSizePx,
            tileSizePx,
            tileSizePx,
          ),
          (renderer.autoClear = false),
          blurPass(bakeTarget, surfaceEntry.surface, 0, 0),
          batchPassCount++,
          (batchPassCount >=
            (isEntranceTransition ? Math.min(2, surfaceBatchSize) : surfaceBatchSize) ||
            now() - batchStartedAt >= surfaceBudgetMs) &&
            levelIndex + 1 < levelHeights.length &&
            (yield, (batchStartedAt = now()), (batchPassCount = 0)));
      }
      surfaceEntry.surface.viewport.set(0, 0, atlasSizePx, atlasSizePx);
      const maxLookupHeight = levelHeights.at(-1)! + 0.05,
        lookupSize = 2048,
        uint8Array = new Uint8Array(lookupSize * 4);
      for (let lookupIndex = 0; lookupIndex < lookupSize; lookupIndex++) {
        const lookupHeight = ((lookupIndex + 0.5) / lookupSize) * maxLookupHeight;
        let nearestLevelIndex = -1,
          nearestLevelDistance = 0.018;
        if (
          (levelHeights.forEach((levelHeight, heightIndex) => {
            const abs = Math.abs(levelHeight - lookupHeight);
            abs < nearestLevelDistance &&
              ((nearestLevelDistance = abs), (nearestLevelIndex = heightIndex));
          }),
          nearestLevelIndex < 0)
        )
          continue;
        const max = Math.max(
          1,
          Math.min(
            65535,
            Math.floor((($e2[nearestLevelIndex].top + 0.003) / maxLookupHeight) * 65535),
          ),
        );
        ((uint8Array[lookupIndex * 4] = nearestLevelIndex % ceil),
          (uint8Array[lookupIndex * 4 + 1] = Math.floor(nearestLevelIndex / ceil)),
          (uint8Array[lookupIndex * 4 + 2] = max >> 8),
          (uint8Array[lookupIndex * 4 + 3] = max & 255));
      }
      (surfaceEntry.lookup?.dispose(),
        (surfaceEntry.lookup = new THREE.DataTexture(uint8Array, lookupSize, 1)),
        (surfaceEntry.lookup.needsUpdate = true),
        (surfaceEntry.uniforms.plan2SurfaceMap.value = surfaceEntry.surface.texture),
        (surfaceEntry.uniforms.plan2SurfaceLookup.value = surfaceEntry.lookup),
        surfaceEntry.uniforms.plan2SurfaceLayout.value.set(ceil, maxLookupHeight),
        surfaceEntry.uniforms.plan2SurfaceBounds.value.set(
          clone.min.x,
          clone.min.z,
          surfaceWidth,
          surfaceDepth,
        ),
        (surfaceEntry.uniforms.plan2SurfaceOpacity.value = settings.enabled
          ? settings.surfaceOpacity
          : 0),
        stats.surfaceCaptures++);
    } finally {
      (bakeTarget.dispose(),
        blurTarget.dispose(),
        trimMaterialCache(),
        (blurMaterial.uniforms.source.value = placeholderTexture),
        (blurMaterial.uniforms.spread.value = 0));
    }
  }
  function snapshotRenderState() {
    return {
      target: renderer.getRenderTarget(),
      face: renderer.getActiveCubeFace(),
      mip: renderer.getActiveMipmapLevel(),
      clear: renderer.getClearColor(new THREE.Color()),
      alpha: renderer.getClearAlpha(),
      autoClear: renderer.autoClear,
      shadows: renderer.shadowMap.enabled,
      xr: renderer.xr.enabled,
      viewport: renderer.getViewport(new THREE.Vector4()),
      scissor: renderer.getScissor(new THREE.Vector4()),
      scissorTest: renderer.getScissorTest(),
    };
  }
  function restoreRenderState(renderState: any) {
    (renderer.setViewport(renderState.viewport),
      renderer.setScissor(renderState.scissor),
      renderer.setScissorTest(renderState.scissorTest),
      renderer.setRenderTarget(renderState.target, renderState.face, renderState.mip),
      renderer.setClearColor(renderState.clear, renderState.alpha),
      (renderer.autoClear = renderState.autoClear),
      (renderer.shadowMap.enabled = renderState.shadows),
      (renderer.xr.enabled = renderState.xr),
      (blurMaterial.uniforms.source.value = placeholderTexture),
      (blurMaterial.uniforms.spread.value = 0));
  }
  function buildContactMap(contactEntry: any, receivers: any, casters: any) {
    const boundsBox = new THREE.Box3();
    let floorTopY = Infinity;
    for (const receiverMesh of receivers) {
      const setFromObject = new THREE.Box3().setFromObject(receiverMesh);
      (boundsBox.union(setFromObject),
        setFromObject.isEmpty() || (floorTopY = Math.min(floorTopY, setFromObject.max.y)));
    }
    if (boundsBox.isEmpty() || !casters.length) {
      disposeFloorState(contactEntry);
      return;
    }
    ((boundsBox.min.x -= 0.25),
      (boundsBox.min.z -= 0.25),
      (boundsBox.max.x += 0.25),
      (boundsBox.max.z += 0.25));
    const boundsWidth = Math.max(boundsBox.max.x - boundsBox.min.x, 0.1),
      boundsDepth = Math.max(boundsBox.max.z - boundsBox.min.z, 0.1),
      captureSizePx = Math.min(settings.resolution, renderer.capabilities.maxTextureSize),
      { target: contactTarget, ping: contactPingTarget } = ensureRenderTargets(
        contactEntry,
        captureSizePx,
      ),
      captureCamera = new THREE.OrthographicCamera(
        -boundsWidth / 2,
        boundsWidth / 2,
        boundsDepth / 2,
        -boundsDepth / 2,
        0.001,
        settings.maxHeight + 0.06,
      ),
      centerX = (boundsBox.min.x + boundsBox.max.x) / 2,
      centerZ = (boundsBox.min.z + boundsBox.max.z) / 2;
    (captureCamera.position.set(centerX, floorTopY - 0.06, centerZ),
      captureCamera.up.set(0, 0, 1),
      captureCamera.lookAt(centerX, floorTopY + 1, centerZ),
      captureCamera.updateMatrixWorld(true));
    const captureScene = new THREE.Scene(),
      depthMaterialsByCaster = new Map(),
      clonedCasters: any = [],
      fallbackDepthMaterial = new THREE.MeshDepthMaterial();
    fallbackDepthMaterial.visible = false;
    const toDepthMaterial = (casterMaterialForClone: any) =>
      isContactCasterMaterial(casterMaterialForClone)
        ? (depthMaterialsByCaster.has(casterMaterialForClone) ||
            depthMaterialsByCaster.set(
              casterMaterialForClone,
              getDepthMaterial(casterMaterialForClone),
            ),
          depthMaterialsByCaster.get(casterMaterialForClone))
        : fallbackDepthMaterial;
    for (const casterSource of casters) {
      const clone2 = casterSource.clone(false);
      ((clone2.material = Array.isArray(casterSource.material)
        ? casterSource.material.map(toDepthMaterial)
        : toDepthMaterial(casterSource.material)),
        clone2.matrix.copy(casterSource.matrixWorld),
        clone2.matrixWorld.copy(casterSource.matrixWorld),
        (clone2.matrixAutoUpdate = false),
        (clone2.matrixWorldAutoUpdate = true),
        (clone2.castShadow = false),
        (clone2.receiveShadow = false),
        clone2.layers.set(0),
        (clone2.frustumCulled = false),
        captureScene.add(clone2),
        clonedCasters.push(clone2));
    }
    const geometryBoundsByGeometry = new Map(),
      instanceTransformMatrix = new THREE.Matrix4(),
      transformedGeometryBox = new THREE.Box3(),
      casterBoundsList = casters.map((casterMesh: any) => {
        const materialList = Array.isArray(casterMesh.material)
          ? casterMesh.material
          : [casterMesh.material];
        if (
          casterMesh.isSkinnedMesh ||
          casterMesh.isBatchedMesh ||
          casterMesh.morphTexture ||
          casterMesh.morphTargetInfluences?.length ||
          materialList.some(
            (materialCandidate: any) =>
              materialCandidate?.isShaderMaterial || materialCandidate?.displacementMap,
          ) ||
          !casterMesh.geometry?.attributes.position
        )
          return null;
        geometryBoundsByGeometry.has(casterMesh.geometry) ||
          (casterMesh.geometry.computeBoundingBox(),
          geometryBoundsByGeometry.set(casterMesh.geometry, casterMesh.geometry.boundingBox));
        const geometryBounds = geometryBoundsByGeometry.get(casterMesh.geometry);
        if (!geometryBounds) return null;
        const paddedCasterBounds = new THREE.Box3();
        if (casterMesh.isInstancedMesh) {
          for (let instanceIndex = 0; instanceIndex < casterMesh.count; instanceIndex++)
            (casterMesh.getMatrixAt(instanceIndex, instanceTransformMatrix),
              instanceTransformMatrix.premultiply(casterMesh.matrixWorld),
              paddedCasterBounds.union(
                transformedGeometryBox.copy(geometryBounds).applyMatrix4(instanceTransformMatrix),
              ));
        } else paddedCasterBounds.copy(geometryBounds).applyMatrix4(casterMesh.matrixWorld);
        const maxOffsetHeight = Math.max(settings.maxHeight + 0.06, 1.5);
        return (
          paddedCasterBounds?.expandByVector(
            new THREE.Vector3(
              Math.abs(settings.offsetX) * maxOffsetHeight + 0.0001,
              0.0001,
              Math.abs(settings.offsetZ) * maxOffsetHeight + 0.0001,
            ),
          ),
          paddedCasterBounds &&
          Number.isFinite(
            paddedCasterBounds.min.x +
              paddedCasterBounds.min.y +
              paddedCasterBounds.min.z +
              paddedCasterBounds.max.x +
              paddedCasterBounds.max.y +
              paddedCasterBounds.max.z,
          )
            ? paddedCasterBounds
            : null
        );
      }),
      casterFrustum = new THREE.Frustum(),
      viewProjectionMatrix = new THREE.Matrix4(),
      mainCaptureCamera = captureCamera,
      applyCasterVisibility = (activeCamera: any) => {
        casterFrustum.setFromProjectionMatrix(
          viewProjectionMatrix.multiplyMatrices(
            activeCamera.projectionMatrix,
            activeCamera.matrixWorldInverse,
          ),
        );
        for (let casterIndex = 0; casterIndex < clonedCasters.length; casterIndex++) {
          const casterBoundsEntry = casterBoundsList[casterIndex],
            isHiddenFloorReceiver =
              activeCamera === mainCaptureCamera &&
              casters[casterIndex].userData?.regionReceiverKind === "floor" &&
              casterBoundsEntry &&
              casterBoundsEntry.max.y <= floorTopY + 0.003;
          ((clonedCasters[casterIndex].visible =
            !isHiddenFloorReceiver &&
            (!casterBoundsEntry || casterFrustum.intersectsBox(casterBoundsEntry))),
            casterBoundsEntry &&
              (stats.testedCasters++, clonedCasters[casterIndex].visible || stats.culledCasters++));
        }
      },
      savedRenderState = snapshotRenderState();
    let hasDeferredSurfaceBake = false;
    const disposeCaptureResources = () => {
      fallbackDepthMaterial.dispose();
      for (const disposableCaster of clonedCasters)
        (disposableCaster.isInstancedMesh || disposableCaster.isBatchedMesh) &&
          disposableCaster.dispose();
      captureScene.clear();
    };
    try {
      ((renderer.xr.enabled = false),
        (renderer.shadowMap.enabled = false),
        (renderer.autoClear = true),
        renderer.setScissorTest(false),
        renderer.setClearColor(0, 1),
        applyCasterVisibility(captureCamera),
        renderer.setRenderTarget(contactTarget),
        renderer.render(captureScene, captureCamera),
        (stats.capturePasses += 1));
      const blurOnce = (blurScale: any) => {
        ((blurMaterial.uniforms.source.value = contactTarget.texture),
          blurMaterial.uniforms.stepSize.value.set(
            (settings.blurMeters * blurScale) / boundsWidth,
            0,
          ),
          renderer.setRenderTarget(contactPingTarget),
          renderer.render(blurScene, blurCamera),
          (blurMaterial.uniforms.source.value = contactPingTarget.texture),
          blurMaterial.uniforms.stepSize.value.set(
            0,
            (settings.blurMeters * blurScale) / boundsDepth,
          ),
          renderer.setRenderTarget(contactTarget),
          renderer.render(blurScene, blurCamera));
      };
      if ((blurOnce(1), blurOnce(0.4), settings.surfaceEnabled)) {
        const surfaceBakeIterator = bakeSurfaceLevels(
          contactEntry,
          casters,
          clonedCasters,
          captureScene,
          boundsBox,
          floorTopY,
          fallbackDepthMaterial,
          applyCasterVisibility,
        );
        if (isSurfaceBakeDeferred || shouldDeferSurfaceBake)
          (disposePendingSurfaceBakes(new Set([contactEntry.id])),
            (contactEntry.surfacePending = true),
            (contactEntry.uniforms.plan2SurfaceOpacity.value = 0),
            pendingSurfaceBakesByFloorId.set(contactEntry.id, {
              record: contactEntry,
              iterator: surfaceBakeIterator,
              dispose: disposeCaptureResources,
            }),
            (hasDeferredSurfaceBake = true));
        else {
          for (const _surfaceBakeStep of surfaceBakeIterator);
          contactEntry.surfacePending = false;
        }
      } else
        ((contactEntry.surfacePending = false),
          (contactEntry.uniforms.plan2SurfaceOpacity.value = 0));
      ((contactEntry.uniforms.plan2ContactMap.value = contactTarget.texture),
        contactEntry.uniforms.plan2ContactBounds.value.set(
          boundsBox.min.x,
          boundsBox.min.z,
          boundsWidth,
          boundsDepth,
        ),
        (contactEntry.uniforms.plan2ContactY.value = floorTopY),
        (contactEntry.uniforms.plan2ContactOpacity.value = settings.enabled
          ? settings.opacity
          : 0));
    } catch (caughtError: any) {
      throw (
        disposePendingSurfaceBakes(new Set([contactEntry.id])),
        disposeFloorState(contactEntry),
        caughtError
      );
    } finally {
      (restoreRenderState(savedRenderState),
        hasDeferredSurfaceBake || disposeCaptureResources(),
        trimMaterialCache());
    }
  }
  function computeGeometryKey(bufferGeometry: any, detail = false) {
    const uvAttributes = detail
        ? ["uv", "uv1", "uv2", "uv3"].map((uvName) => bufferGeometry.attributes[uvName])
        : [],
      attributeVersions =
        bufferGeometry.attributes.position?.version +
        ":" +
        bufferGeometry.index?.version +
        (detail
          ? JSON.stringify([
              bufferGeometry.groups,
              bufferGeometry.drawRange,
              uvAttributes.map(
                (uvAttribute) => uvAttribute?.version ?? uvAttribute?.data?.version,
              ),
            ])
          : ""),
      geometryKeyCache = detail ? detailGeometryKeyByGeometry : weakMap,
      cachedGeometryKey = geometryKeyCache.get(bufferGeometry);
    if (
      cachedGeometryKey?.version === attributeVersions &&
      cachedGeometryKey.position === bufferGeometry.attributes.position &&
      cachedGeometryKey.index === bufferGeometry.index &&
      uvAttributes.every(
        (uvAttribute, uvIndex) => cachedGeometryKey.uvs[uvIndex] === uvAttribute,
      )
    )
      return cachedGeometryKey.key;
    let geometryKey;
    if (
      !detail &&
      bufferGeometry.parameters &&
      bufferGeometry.attributes.position?.version === 0 &&
      !(bufferGeometry.index?.version > 0)
    )
      try {
        geometryKey = JSON.stringify(
          [bufferGeometry.type, bufferGeometry.parameters],
          (jsonKey, jsonValue) => (jsonKey === "uuid" ? undefined : jsonValue),
        );
      } catch {}
    if (!geometryKey) {
      const hashAttribute = (attribute: any) => {
        if (!attribute) return null;
        const array = attribute.array || attribute.data?.array;
        if (!array) return [attribute.count, attribute.version];
        const attributeBytes = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
        let hashA = 2166136261,
          hashB = 3339675911;
        for (const byte of attributeBytes)
          ((hashA = Math.imul(hashA ^ byte, 16777619)),
            (hashB = Math.imul(hashB ^ byte, 2246822519)));
        return [
          attribute.itemSize,
          attribute.count,
          attribute.offset,
          attribute.data?.stride,
          hashA >>> 0,
          hashB >>> 0,
          ...(detail ? [array.constructor.name, attribute.normalized] : []),
        ];
      };
      geometryKey = JSON.stringify([
        hashAttribute(bufferGeometry.attributes.position),
        hashAttribute(bufferGeometry.index),
        (bufferGeometry.morphAttributes.position || []).map(hashAttribute),
        bufferGeometry.groups,
        bufferGeometry.drawRange,
        ...(detail ? [uvAttributes.map(hashAttribute)] : []),
      ]);
    }
    return (
      geometryKeyCache.set(bufferGeometry, {
        version: attributeVersions,
        key: geometryKey,
        position: bufferGeometry.attributes.position,
        index: bufferGeometry.index,
        uvs: uvAttributes,
      }),
      geometryKey
    );
  }
  function computeLayoutKey(layout: any, bakeFrame: any, detail = false) {
    const invert = bakeFrame.clone().invert(),
      poseResolver = createContactShadowPoseResolver(),
      describeObjectMatrix = (object: any) => {
        const multiply = invert.clone().multiply(poseResolver(object)),
          describeMatrixElements = (matrix: any) =>
            detail
              ? matrix.elements.slice()
              : matrix.elements.map((element: any) => Math.round(element * 10000));
        if (!object.isInstancedMesh) return describeMatrixElements(multiply);
        const instanceWorldMatrix = new THREE.Matrix4(),
          instancedMatrices: any[] = [];
        for (let instanceCursor = 0; instanceCursor < object.count; instanceCursor++)
          (object.getMatrixAt(instanceCursor, instanceWorldMatrix),
            instancedMatrices.push(
              describeMatrixElements(instanceWorldMatrix.premultiply(multiply)),
            ));
        return instancedMatrices;
      },
      normalizeEntries = (matrixEntries: any) =>
        matrixEntries.map((matrixValues: any) => JSON.stringify(matrixValues)).sort();
    return JSON.stringify([
      settings,
      normalizeEntries(
        layout.receivers.map((receiver: any) => {
          const geometry2 = receiver.geometry,
            position = geometry2.attributes.position,
            cachedEntry = receiverBoundsCacheByGeometry.get(geometry2);
          (!cachedEntry ||
            cachedEntry.position !== position ||
            cachedEntry.version !== position?.version) &&
            (geometry2.computeBoundingBox(),
            receiverBoundsCacheByGeometry.set(geometry2, {
              position: position,
              version: position?.version,
              box: geometry2.boundingBox?.clone(),
            }));
          const receiverBounds = receiverBoundsCacheByGeometry
            .get(geometry2)
            .box?.clone()
            .applyMatrix4(invert.clone().multiply(receiver.matrixWorld));
          return receiverBounds
            ? [...receiverBounds.min.toArray(), ...receiverBounds.max.toArray()].map((boundValue) =>
                detail ? boundValue : Math.round(boundValue * 10000),
              )
            : null;
        }),
      ),
      normalizeEntries(
        layout.casters.map((caster: any) => {
          const casterMaterialSignatures = (
              Array.isArray(caster.material) ? caster.material : [caster.material]
            ).map((casterMaterial: any) => {
              const materialAlphaTest = casterMaterial.alphaTest || 0,
                displacementMap = casterMaterial.displacementMap,
                describeTexture = (texture: any) =>
                  texture
                    ? detail
                      ? stableModelTextureKey(texture)
                      : [texture.uuid, texture.version]
                    : null;
              return [
                isContactCasterMaterial(casterMaterial),
                materialAlphaTest,
                materialAlphaTest > 0 ? describeTexture(casterMaterial.map) : null,
                materialAlphaTest > 0 ? describeTexture(casterMaterial.alphaMap) : null,
                describeTexture(displacementMap),
                displacementMap ? (casterMaterial.displacementScale ?? 1) : 0,
                displacementMap ? (casterMaterial.displacementBias ?? 0) : 0,
                ...(detail ? [casterMaterial.userData?.plan2SurfaceContact !== false] : []),
              ];
            }),
            every = casterMaterialSignatures.every(
              (materialSignature: any) =>
                JSON.stringify(materialSignature) === JSON.stringify(casterMaterialSignatures[0]),
            );
          return [
            computeGeometryKey(caster.geometry, detail),
            caster.isInstancedMesh ? caster.count : null,
            caster.morphTargetInfluences,
            describeObjectMatrix(caster),
            every ? casterMaterialSignatures.slice(0, 1) : casterMaterialSignatures,
            ...(detail ? [caster.userData?.regionReceiverKind || ""] : []),
          ];
        }),
      ),
    ]);
  }
  function persistentSignatureFor(floorEntry: any, bakeFrame: any) {
    return !persistentCache ||
      !bakeFrame ||
      !floorEntry.casters.length ||
      !floorEntry.receivers.length ||
      floorEntry.casters.some(
        (caster: any) =>
          caster.isSkinnedMesh ||
          caster.isBatchedMesh ||
          caster.morphTexture ||
          caster.morphTargetInfluences?.length ||
          Object.keys(caster.geometry.morphAttributes || {}).length ||
          (Array.isArray(caster.material) ? caster.material : [caster.material]).some(
            (casterMaterial: any) =>
              casterMaterial.displacementMap ||
              (casterMaterial.alphaTest > 0 &&
                [casterMaterial.map, casterMaterial.alphaMap].some(
                  (texture) => texture && !stableModelTextureKey(texture),
                )),
          ),
      )
      ? null
      : JSON.stringify([
          THREE.REVISION,
          renderer.capabilities.maxTextureSize,
          renderer.capabilities.precision,
          renderer.capabilities.logarithmicDepthBuffer === true,
          renderer.capabilities.reversedDepthBuffer === true,
          bakeFrame.elements,
          computeLayoutKey(floorEntry, bakeFrame, true),
        ]);
  }
  function restoreFromPersistentCache(floorEntry: any, signature: any, contentKey: any) {
    if (!persistentCache || !signature || floorEntry.target) return false;
    const persistedSnapshot = persistentCache.peek(floorEntry.id, signature);
    if (
      !persistedSnapshot ||
      persistedSnapshot.target.width > renderer.capabilities.maxTextureSize ||
      (persistedSnapshot.surface &&
        persistedSnapshot.surface.width > renderer.capabilities.maxTextureSize)
    )
      return false;
    const restoredSnapshot = restoreContactShadowSnapshot(THREE, persistedSnapshot);
    if (!restoredSnapshot) return false;
    disposeFloorState(floorEntry);
    for (const restoredProperty of ["target", "surface", "lookup", "bakedFrame"])
      floorEntry[restoredProperty] = restoredSnapshot[restoredProperty];
    for (const [valueName, uniformValue] of Object.entries(restoredSnapshot.values))
      floorEntry.uniforms[valueName].value = uniformValue;
    return (
      (floorEntry.uniforms.plan2ContactMap.value = floorEntry.target.texture),
      (floorEntry.uniforms.plan2SurfaceMap.value =
        floorEntry.surface?.texture || placeholderTexture),
      (floorEntry.uniforms.plan2SurfaceLookup.value = floorEntry.lookup || placeholderTexture),
      (floorEntry.contentKey = contentKey),
      floorEntry.uniforms.plan2ContactTransform.value.identity(),
      stats.persistentHits++,
      true
    );
  }
  function enqueuePersistentCapture(floorEntry: any) {
    if (
      !persistentCache ||
      !floorEntry.persistentSignature ||
      !floorEntry.target ||
      floorEntry.target.restored ||
      floorEntry.surfacePending
    )
      return;
    const captureGeneration = bakeGeneration,
      capturedTarget = floorEntry.target,
      capturedSurface = floorEntry.surface,
      capturedContentKey = floorEntry.contentKey,
      capturedSignature = floorEntry.persistentSignature,
      canCapture = () =>
        !isDisposed &&
        !isSuspended &&
        !isMotionSuspended &&
        canBuild() &&
        captureGeneration === bakeGeneration &&
        floorEntry.target === capturedTarget &&
        floorEntry.surface === capturedSurface &&
        floorEntry.contentKey === capturedContentKey &&
        floorEntry.persistentSignature === capturedSignature &&
        !floorEntry.surfacePending &&
        (typeof document > "u" || !document.hidden);
    persistentCache.enqueue(
      floorEntry.id,
      floorEntry.persistentSignature,
      () => captureContactShadowSnapshot(THREE, renderer, floorEntry, canCapture),
      canCapture,
    );
  }

  const estimateStateBytes = (cachedFloorState: any) =>
    (cachedFloorState.target
      ? cachedFloorState.target.width *
        cachedFloorState.target.height *
        (cachedFloorState.target.texture.format === THREE.RedFormat ? 5 : 8)
      : 0) +
    (cachedFloorState.ping
      ? cachedFloorState.ping.width *
        cachedFloorState.ping.height *
        (cachedFloorState.ping.texture.format === THREE.RedFormat ? 1 : 4)
      : 0) +
    (cachedFloorState.surface
      ? cachedFloorState.surface.width *
        cachedFloorState.surface.height *
        (cachedFloorState.surface.texture.format === THREE.RedFormat ? 1 : 4)
      : 0) +
    (cachedFloorState.lookup?.image?.data?.byteLength || 0);
  function storeCachedLayout(builtEntry: any) {
    if (!builtEntry.target || !builtEntry.contentKey || builtEntry.surfacePending) return;
    const layoutKey = JSON.stringify([builtEntry.id, builtEntry.contentKey]),
      displacedEntry = cachedLayoutsByKey.get(layoutKey);
    (displacedEntry && disposeFloorState(displacedEntry),
      builtEntry.ping?.dispose(),
      (builtEntry.ping = null));
    const storedEntry = {
      id: builtEntry.id,
      contentKey: builtEntry.contentKey,
      bakedFrame: builtEntry.bakedFrame,
      target: builtEntry.target,
      ping: builtEntry.ping,
      surface: builtEntry.surface,
      lookup: builtEntry.lookup,
      uniforms: Object.fromEntries(
        Object.entries(builtEntry.uniforms as Record<string, CachedUniformLike>).map(
          ([uniformName, uniform]) => [
          uniformName,
          {
            value:
              uniform.value?.clone && !uniform.value.isTexture
                ? uniform.value.clone()
                : uniform.value,
          },
        ]),
      ),
    };
    (cachedLayoutsByKey.delete(layoutKey),
      cachedLayoutsByKey.set(layoutKey, storedEntry),
      (builtEntry.target = builtEntry.ping = builtEntry.surface = builtEntry.lookup = null),
      (builtEntry.uniforms.plan2ContactOpacity.value =
        builtEntry.uniforms.plan2SurfaceOpacity.value =
          0),
      (builtEntry.fade = null));
  }
  function restoreCachedLayout(restoredEntry: any, contentKey: any) {
    const restoreKey = JSON.stringify([restoredEntry.id, contentKey]),
      restoredLayout = cachedLayoutsByKey.get(restoreKey);
    if (!restoredLayout) return false;
    (cachedLayoutsByKey.delete(restoreKey),
      storeCachedLayout(restoredEntry),
      restoredEntry.surfacePending && disposeFloorState(restoredEntry));
    for (const propertyName of ["target", "ping", "surface", "lookup", "contentKey", "bakedFrame"])
      restoredEntry[propertyName] = restoredLayout[propertyName];
    for (const [cachedUniformName, cachedUniform] of Object.entries(
      restoredLayout.uniforms as Record<string, CachedUniformLike>,
    ))
      restoredEntry.uniforms[cachedUniformName].value = cachedUniform.value;
    return (
      (restoredEntry.uniforms.plan2ContactOpacity.value =
        restoredEntry.uniforms.plan2SurfaceOpacity.value =
          0),
      true
    );
  }
  function evictCaches(protectedIds: any) {
    const sort = [...floorStatesById.values()]
      .filter((candidateState) => candidateState.target && !protectedIds.has(candidateState.id))
      .sort((stateA, stateB) => (stateB.lastUsed || 0) - (stateA.lastUsed || 0));
    let retainedBytes = 0,
      retainedFloorCount = 0;
    for (const evictedFloor of sort) {
      (evictedFloor.ping?.dispose(), (evictedFloor.ping = null));
      const stateBytes = estimateStateBytes(evictedFloor);
      retainedBytes + stateBytes > 32 * 1024 * 1024
        ? disposeFloorState(evictedFloor)
        : ((retainedBytes += stateBytes), retainedFloorCount++);
    }
    let reduce = [...cachedLayoutsByKey.values()].reduce(
      (totalBytes, cachedState) => totalBytes + estimateStateBytes(cachedState),
      0,
    );
    for (; cachedLayoutsByKey.size > 8 || retainedBytes + reduce > 32 * 1024 * 1024;) {
      const evictedLayoutKey = cachedLayoutsByKey.keys().next().value,
        evictedLayout = cachedLayoutsByKey.get(evictedLayoutKey);
      if (!evictedLayout) break;
      ((reduce -= estimateStateBytes(evictedLayout)),
        disposeFloorState(evictedLayout),
        cachedLayoutsByKey.delete(evictedLayoutKey));
    }
    ((stats.cachedFloors = retainedFloorCount),
      (stats.cachedLayouts = cachedLayoutsByKey.size),
      (stats.cachedBytes = retainedBytes + reduce));
  }
  function pumpDeferredSurfaceBake() {
    if (
      isSurfaceBakeDeferred ||
      !pendingSurfaceBakesByFloorId.size ||
      isMotionSuspended ||
      !canBuild() ||
      !settings.enabled
    )
      return;
    const [deferredFloorId, queuedSurfaceBake] = pendingSurfaceBakesByFloorId
        .entries()
        .next().value!,
      previousRenderState = snapshotRenderState();
    try {
      ((renderer.xr.enabled = false),
        (renderer.shadowMap.enabled = false),
        renderer.setScissorTest(false),
        queuedSurfaceBake.iterator.next().done &&
          ((queuedSurfaceBake.record.surfacePending = false),
          queuedSurfaceBake.dispose(),
          pendingSurfaceBakesByFloorId.delete(deferredFloorId),
          enqueuePersistentCapture(queuedSurfaceBake.record)));
    } catch (pumpError: any) {
      throw (
        disposePendingSurfaceBakes(new Set([deferredFloorId])),
        disposeFloorState(queuedSurfaceBake.record),
        invalidate(deferredFloorId),
        pumpError
      );
    } finally {
      restoreRenderState(previousRenderState);
    }
    pendingSurfaceBakesByFloorId.size && requestFrame();
  }
  function collectSceneGroups(
    rootNode: any,
    {
      motion: isMotion = false,
      allFloors: isAllFloors = true,
      affectedFloors: affectedFloorSet,
    }: SceneGroupFilter = {},
  ) {
    rootNode.updateWorldMatrix(true, true);
    const sceneGroupsById = new Map();
    return (
      rootNode.traverse((sceneNode: any) => {
        if (
          !sceneNode.isMesh ||
          !isVisibleWithAncestors(sceneNode) ||
          (!isMotion && findUserFieldInAncestors(sceneNode, "floorTransitionLeaving"))
        )
          return;
        const groupFloorId = String(
          findUserFieldInAncestors(sceneNode, "regionFloorId") ??
            findUserFieldInAncestors(sceneNode, "floorId") ??
            "default",
        );
        if (
          (!isMotion && !matchesVisibleFloor(groupFloorId)) ||
          (!isAllFloors && !affectedFloorSet!.has(groupFloorId))
        )
          return;
        const isFloorReceiver = sceneNode.userData?.regionReceiverKind === "floor",
          some =
            sceneNode.castShadow &&
            !findUserFieldInAncestors(sceneNode, "disableContactShadow") &&
            findUserFieldInAncestors(sceneNode, "modelLayer") === "items" &&
            (Array.isArray(sceneNode.material) ? sceneNode.material : [sceneNode.material]).some(
              isContactCasterMaterial,
            );
        (!isFloorReceiver && !some) ||
          (sceneGroupsById.has(groupFloorId) ||
            sceneGroupsById.set(groupFloorId, {
              receivers: [] as any[],
              casters: [] as any[],
            }),
          isFloorReceiver && sceneGroupsById.get(groupFloorId).receivers.push(sceneNode),
          some && sceneGroupsById.get(groupFloorId).casters.push(sceneNode));
      }),
      sceneGroupsById
    );
  }
  function refreshMotionFloors(motionRootObject: any) {
    const motionSceneGroups = collectSceneGroups(motionRootObject, {
      motion: true,
    });
    for (const motionFloor of floorStatesById.values())
      ((motionFloor.motionReady = false),
        (motionFloor.fade = null),
        (motionFloor.uniforms.plan2ContactOpacity.value =
          motionFloor.uniforms.plan2SurfaceOpacity.value =
            0));
    for (const [motionFloorId, sceneGroup] of motionSceneGroups) {
      const motionFloorState = getFloorState(motionFloorId),
        motionAnchorObject = sceneGroup.receivers[0],
        motionAnchorFrame = frameProvider?.(motionFloorId) || motionAnchorObject?.matrixWorld;
      if (
        !motionAnchorFrame ||
        (!motionFloorState.target &&
          ![...cachedLayoutsByKey.values()].some(
            (cachedLayoutState) => cachedLayoutState.id === motionFloorId,
          ))
      )
        continue;
      const motionLayoutHash = computeLayoutKey(sceneGroup, motionAnchorFrame);
      (motionFloorState.contentKey !== motionLayoutHash &&
        restoreCachedLayout(motionFloorState, motionLayoutHash),
        !(
          !motionFloorState.target ||
          motionFloorState.surfacePending ||
          !motionFloorState.bakedFrame ||
          motionFloorState.contentKey !== motionLayoutHash
        ) &&
          ((motionFloorState.anchor = motionAnchorObject),
          (motionFloorState.motionReady = true),
          (motionFloorState.uniforms.plan2ContactOpacity.value = settings.enabled
            ? settings.opacity
            : 0),
          (motionFloorState.uniforms.plan2SurfaceOpacity.value =
            settings.enabled && settings.surfaceEnabled && motionFloorState.surface
              ? settings.surfaceOpacity
              : 0)));
    }
    ((shouldRefreshMotion = false), evictCaches(motionSceneGroups));
  }
  function syncFloors() {
    if (isDisposed || isSuspended || isInitialBakeDeferred || !isSyncEnabled) return;
    (!shouldRebuild &&
      !set.size &&
      !pendingSurfaceBakesByFloorId.size &&
      (shouldDeferSurfaceBake = false),
      (stats.floors = 0));
    for (const fadingFloor of floorStatesById.values()) {
      if (fadingFloor.fade) {
        const fadeProgress = Math.min(
          1,
          Math.max(
            0,
            (performance.now() - fadingFloor.fade.started) / (fadingFloor.fade.to > 0 ? 160 : 240),
          ),
        );
        ((fadingFloor.uniforms.plan2ContactOpacity.value =
          fadingFloor.fade.from + (fadingFloor.fade.to - fadingFloor.fade.from) * fadeProgress),
          (fadingFloor.uniforms.plan2SurfaceOpacity.value =
            fadingFloor.fade.fromSurface +
            (fadingFloor.fade.toSurface - fadingFloor.fade.fromSurface) * fadeProgress),
          fadeProgress === 1 ? (fadingFloor.fade = null) : requestFrame());
      }
      fadingFloor.target && fadingFloor.uniforms.plan2ContactOpacity.value > 0 && stats.floors++;
    }
    updateBakedTransforms();
    const rootObject = getRoot();
    if (rootObject !== value) {
      disposePendingSurfaceBakes();
      for (const staleLayout of cachedLayoutsByKey.values()) disposeFloorState(staleLayout);
      (cachedLayoutsByKey.clear(),
        (value = rootObject),
        (shouldReuseLayout = false),
        (shouldRebuild = true),
        set.clear(),
        (shouldRefreshMotion = true));
    }
    if (
      (isMotionSuspended &&
        followMotion &&
        rootObject &&
        shouldRefreshMotion &&
        (refreshMotionFloors(rootObject),
        updateBakedTransforms(),
        (stats.floors = [...floorStatesById.values()].filter(
          (stateWithVisibleTarget) =>
            stateWithVisibleTarget.target &&
            stateWithVisibleTarget.uniforms.plan2ContactOpacity.value > 0,
        ).length)),
      (!shouldRebuild && !set.size) || isMotionSuspended || !canBuild() || !rootObject)
    ) {
      rootObject && !shouldRebuild && !set.size && pumpDeferredSurfaceBake();
      return;
    }
    const rebuildAllFloors = shouldRebuild,
      pendingFloorIdSnapshotSet = new Set(set),
      sceneGroups = collectSceneGroups(rootObject, {
        allFloors: rebuildAllFloors,
        affectedFloors: pendingFloorIdSnapshotSet,
      });
    for (const staleFloorState of floorStatesById.values())
      !isMotionSuspended &&
        (rebuildAllFloors || pendingFloorIdSnapshotSet.has(staleFloorState.id)) &&
        !sceneGroups.has(staleFloorState.id) &&
        (shouldReuseLayout
          ? ((staleFloorState.uniforms.plan2ContactOpacity.value = 0),
            (staleFloorState.uniforms.plan2SurfaceOpacity.value = 0),
            (staleFloorState.fade = null))
          : disposeFloorState(staleFloorState),
        (staleFloorState.casters =
          staleFloorState.instancedCasters =
          staleFloorState.receivers =
            0));
    const deferredFloorIds: any[] = [],
      maxBuildsThisSync = isIncrementalUpdate ? 1 : Math.max(1, maxCapturesPerSync);
    let buildCount = 0;
    for (const [groupId, group] of sceneGroups) {
      if (!shouldReuseLayout && buildCount >= maxBuildsThisSync) {
        deferredFloorIds.push(groupId);
        continue;
      }
      const floorState = getFloorState(groupId),
        anchorObject = group.receivers[0] || null,
        anchorFrame = frameProvider?.(groupId)?.clone() || anchorObject?.matrixWorld.clone(),
        layoutHash = anchorFrame ? computeLayoutKey(group, anchorFrame) : null;
      shouldReuseLayout &&
        layoutHash &&
        floorState.contentKey !== layoutHash &&
        restoreCachedLayout(floorState, layoutHash);
      const persistentSignature = persistentSignatureFor(group, anchorFrame),
        bakedFrame =
          (restoreFromPersistentCache(floorState, persistentSignature, layoutHash) ||
            shouldReuseLayout) &&
          layoutHash &&
          floorState.target &&
          !floorState.surfacePending &&
          floorState.contentKey === layoutHash &&
          floorState.bakedFrame;
      if (!bakedFrame && buildCount >= maxBuildsThisSync) {
        deferredFloorIds.push(groupId);
        continue;
      }
      floorState.lastUsed = performance.now();
      const previousContactOpacity = floorState.uniforms.plan2ContactOpacity.value,
        previousSurfaceOpacity = floorState.uniforms.plan2SurfaceOpacity.value;
      (bakedFrame
        ? (stats.cacheHits++,
          (floorState.uniforms.plan2ContactOpacity.value = settings.enabled ? settings.opacity : 0),
          (floorState.uniforms.plan2SurfaceOpacity.value =
            settings.enabled && settings.surfaceEnabled && floorState.surface
              ? settings.surfaceOpacity
              : 0))
        : (buildCount++,
          shouldReuseLayout && storeCachedLayout(floorState),
          buildContactMap(floorState, group.receivers, group.casters),
          (floorState.contentKey = layoutHash),
          (floorState.bakedFrame = anchorFrame),
          floorState.uniforms.plan2ContactTransform.value.identity()),
        floorState.fade
          ? ((floorState.fade.to = floorState.uniforms.plan2ContactOpacity.value),
            (floorState.fade.toSurface = floorState.uniforms.plan2SurfaceOpacity.value),
            (floorState.uniforms.plan2ContactOpacity.value = previousContactOpacity),
            (floorState.uniforms.plan2SurfaceOpacity.value = previousSurfaceOpacity),
            requestFrame())
          : isIncrementalUpdate &&
            previousContactOpacity < floorState.uniforms.plan2ContactOpacity.value &&
            ((floorState.fade = {
              started: performance.now(),
              from: previousContactOpacity,
              fromSurface: previousSurfaceOpacity,
              to: floorState.uniforms.plan2ContactOpacity.value,
              toSurface: floorState.uniforms.plan2SurfaceOpacity.value,
            }),
            (floorState.uniforms.plan2ContactOpacity.value = previousContactOpacity),
            (floorState.uniforms.plan2SurfaceOpacity.value = previousSurfaceOpacity),
            requestFrame()),
        (floorState.anchor = anchorObject),
        (floorState.persistentSignature = persistentSignature),
        enqueuePersistentCapture(floorState),
        (floorState.casters = group.casters.length),
        (floorState.receivers = group.receivers.length),
        (floorState.instancedCasters = group.casters.filter(
          (casterObject: any) => casterObject.isInstancedMesh,
        ).length));
    }
    (updateBakedTransforms(),
      evictCaches(
        rebuildAllFloors
          ? sceneGroups
          : new Map(
              [...floorStatesById.values()]
                .filter((stateWithReceivers) => stateWithReceivers.receivers > 0)
                .map((stateWithTarget) => [stateWithTarget.id, true]),
            ),
      ),
      (stats.casters = stats.instancedCasters = stats.receivers = stats.floors = 0));
    for (const stateForStats of floorStatesById.values())
      ((stats.casters += stateForStats.casters),
        (stats.instancedCasters += stateForStats.instancedCasters),
        (stats.receivers += stateForStats.receivers),
        stateForStats.target &&
          stateForStats.uniforms.plan2ContactOpacity.value > 0 &&
          stats.floors++);
    ((stats.builds += 1),
      (shouldRebuild = false),
      set.clear(),
      deferredFloorIds.forEach((deferredId) => set.add(deferredId)),
      (isIncrementalUpdate = isIncrementalUpdate && deferredFloorIds.length > 0),
      (deferredFloorIds.length || (!isSurfaceBakeDeferred && pendingSurfaceBakesByFloorId.size)) &&
        requestFrame());
  }
  function disposeAll() {
    if (!isDisposed) {
      ((isDisposed = true),
        (stats.disposed = true),
        (stats.floors = 0),
        disposePendingSurfaceBakes());
      for (const disposedFloorState of floorStatesById.values())
        disposeFloorState(disposedFloorState);
      for (const disposedLayout of cachedLayoutsByKey.values()) disposeFloorState(disposedLayout);
      (cachedLayoutsByKey.clear(), set.clear(), (value = null), floorStatesById.clear());
      for (const disposedDepthMaterial of depthMaterialsByKey.values())
        disposedDepthMaterial.dispose();
      (depthMaterialsByKey.clear(),
        placeholderTexture.dispose(),
        blurQuad.geometry.dispose(),
        blurMaterial.dispose());
    }
  }
  const controller = {
    sync: syncFloors,
    invalidate: invalidate,
    invalidateContext: invalidateAllFloors,
    dispose: disposeAll,
    stats: stats,
    settings: settings,
    setEnabled: setEnabled,
    setSuspended: setSuspended,
    setMotion: setMotion,
    allowPersistence() {
      isDisposed || persistentCache?.presented();
    },
    persistentKey(floorId: any = null) {
      if (
        isDisposed ||
        shouldRebuild ||
        set.size ||
        isSuspended ||
        isMotionSuspended ||
        pendingSurfaceBakesByFloorId.size
      )
        return null;
      const floorStates = [...floorStatesById.values()].filter(
        (floorState) =>
          matchesVisibleFloor(floorState.id) &&
          floorState.target &&
          (floorId === null || !floorState.id || floorState.id === floorId),
      );
      return floorStates.some(
        (floorState) => !floorState.persistentSignature || floorState.surfacePending,
      )
        ? null
        : [
            settings,
            floorStates.map((floorState) => [floorState.id, floorState.persistentSignature]),
          ];
    },
    prepareMotion() {
      !isDisposed &&
        followMotion &&
        isMotionSuspended &&
        ((shouldRefreshMotion = true), requestFrame());
    },
    prepareDuringEntrance(isEntranceActive: any) {
      isDisposed ||
        ((isEntranceTransition = true),
        (isSyncEnabled = isEntranceActive === true),
        isSyncEnabled &&
          ((isInitialBakeDeferred = false),
          (isSurfaceBakeDeferred = false),
          (pendingSurfaceBakesByFloorId.size || shouldRebuild || set.size) && requestFrame()));
    },
    finishDeferredSurfaceBake() {
      ((isEntranceTransition = false),
        (isSyncEnabled = true),
        (isInitialBakeDeferred = false),
        (isSurfaceBakeDeferred = false),
        (pendingSurfaceBakesByFloorId.size || shouldRebuild || set.size) && requestFrame());
    },
    hasPendingSurfaces: () => !isDisposed && pendingSurfaceBakesByFloorId.size > 0,
    isPending: () => !isDisposed && !isInitialBakeDeferred && (shouldRebuild || set.size > 0),
    setVisibleFloor(floorIdInput: any) {
      const nextVisibleFloorId = floorIdInput == null ? null : String(floorIdInput);
      if (nextVisibleFloorId !== visibleFloorId) {
        (!shouldRebuild && !set.size && (shouldReuseLayout = true),
          (visibleFloorId = nextVisibleFloorId),
          (stats.floors = 0));
        for (const floorStateToHide of floorStatesById.values())
          (!isMotionSuspended &&
            !matchesVisibleFloor(floorStateToHide.id) &&
            ((floorStateToHide.fade = null),
            (floorStateToHide.uniforms.plan2ContactOpacity.value =
              floorStateToHide.uniforms.plan2SurfaceOpacity.value =
                0)),
            floorStateToHide.target &&
              floorStateToHide.uniforms.plan2ContactOpacity.value > 0 &&
              stats.floors++);
        invalidate(null, true);
      }
    },
    setFrameProvider(provider: any) {
      ((frameProvider = provider), invalidate());
    },
    getUniforms: (floorKey: any) => getFloorState(floorKey).uniforms,
  };
  return (typeof window < "u" && (window.__plan2Contact = controller), controller);
}
