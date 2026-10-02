/** 单个区域的覆盖参数；字段全部可选，实际取值由 sanitizeRegionOverrides 运行时校验。 */
type RegionLightOverride = {
  /** 形状标识：circle / square / ellipse / strip，白名单在下面用 includes 校验。 */
  shape?: string;
  width?: number;
  depth?: number;
  rotation?: number;
  softness?: number;
  offsetX?: number;
  offsetZ?: number;
  heightAbove?: number;
  heightBelow?: number;
  heightMin?: number;
  heightMax?: number;
  moveCenterEnabled?: boolean;
};

/** 监听子节点增删的场景节点；three 的 Object3D 都满足这个结构。 */
type EventTargetNodeLike = {
  addEventListener: (eventName: string, listener: () => void) => void;
  removeEventListener: (eventName: string, listener: () => void) => void;
};

/** 需要整体遍历的场景根 / 子树。 */
type TraversableNodeLike = {
  traverse: (visitor: (node: any) => void) => void;
};

/** 统计「明细材质」时用到的材质结构。 */
type SurfaceMaterialLike = {
  userData: { plan2DetailedSurface?: boolean; alphaWallBand?: boolean };
  transmission?: number;
};

const REGION_KINDS = ["floor", "wall", "furniture"],
  coercedFiniteNumberOr = (numericInput, fallbackNumber = 0) =>
    Number.isFinite(Number(numericInput)) ? Number(numericInput) : fallbackNumber,
  clamp = (clampedInput, lowerBound, upperBound) =>
    Math.min(upperBound, Math.max(lowerBound, clampedInput)),
  alignTo16 = (sizeValue) => Math.max(16, Math.ceil(sizeValue / 16) * 16);
const regionLightKey = (floorKeyId, lightKeyId) =>
  JSON.stringify([String(floorKeyId), String(lightKeyId)]);
function isRegionLightKey(keyString) {
  try {
    const parsedKey = JSON.parse(keyString);
    return (
      Array.isArray(parsedKey) &&
      parsedKey.length === 2 &&
      parsedKey.every((keyPart) => typeof keyPart == "string") &&
      regionLightKey(parsedKey[0], parsedKey[1]) === keyString
    );
  } catch {
    return false;
  }
}
function sanitizeRegionOverrides(rawOverrides) {
  const normalizedOverrides = Object.create(null);
  if (!rawOverrides || typeof rawOverrides != "object" || Array.isArray(rawOverrides))
    return normalizedOverrides;
  for (const [regionKey, override] of Object.entries(
    rawOverrides as Record<string, RegionLightOverride>,
  )) {
    if (
      !isRegionLightKey(regionKey) ||
      !override ||
      typeof override != "object" ||
      Array.isArray(override) ||
      !["circle", "square", "ellipse", "strip"].includes(override.shape ?? "") ||
      !["width", "depth"].every(
        (dimensionField) =>
          typeof override[dimensionField] == "number" && Number.isFinite(override[dimensionField]),
      ) ||
      ["rotation", "softness"].some(
        (numericField) =>
          override[numericField] !== undefined &&
          (typeof override[numericField] != "number" || !Number.isFinite(override[numericField])),
      ) ||
      ["offsetX", "offsetZ"].some(
        (offsetField) =>
          override[offsetField] !== undefined &&
          (typeof override[offsetField] != "number" || !Number.isFinite(override[offsetField])),
      ) ||
      ["heightAbove", "heightBelow", "heightMin", "heightMax"].some(
        (heightField) =>
          override[heightField] !== undefined &&
          (typeof override[heightField] != "number" || !Number.isFinite(override[heightField])),
      ) ||
      (override.heightMin !== undefined &&
        override.heightMax !== undefined &&
        override.heightMin > override.heightMax) ||
      (override.moveCenterEnabled !== undefined && typeof override.moveCenterEnabled != "boolean")
    )
      continue;
    const rotationDeg = override.rotation ?? 0,
      clampedWidth = clamp(override.width, 0.5, 20);
    normalizedOverrides[regionKey] = {
      width: clampedWidth,
      depth: clamp(override.depth, 0.5, 20),
      rotation: (((rotationDeg % 360) + 540) % 360) - 180,
      softness: clamp(override.softness ?? 1, 0.05, 1),
      shape: override.shape,
      ...(override.heightMin !== undefined
        ? {
            heightMin: clamp(override.heightMin, 0, 20),
          }
        : {}),
      ...(override.heightMax !== undefined
        ? {
            heightMax: clamp(override.heightMax, 0, 20),
          }
        : {}),
      ...(override.heightAbove !== undefined
        ? {
            heightAbove: clamp(override.heightAbove, 0, 20),
          }
        : {}),
      ...(override.heightBelow !== undefined
        ? {
            heightBelow: clamp(override.heightBelow, 0, 20),
          }
        : {}),
      ...(override.offsetX !== undefined
        ? {
            offsetX: clamp(override.offsetX, -100, 100),
          }
        : {}),
      ...(override.offsetZ !== undefined
        ? {
            offsetZ: clamp(override.offsetZ, -100, 100),
          }
        : {}),
      ...(override.moveCenterEnabled !== undefined
        ? {
            moveCenterEnabled: override.moveCenterEnabled,
          }
        : {}),
    };
  }
  return normalizedOverrides;
}
function findAncestorField(startObject, fieldName) {
  for (let ancestorObject = startObject; ancestorObject; ancestorObject = ancestorObject.parent)
    if (ancestorObject.userData?.[fieldName] !== undefined)
      return ancestorObject.userData[fieldName];
}
function isRegionReceiverMaterial(materialCandidate) {
  return (
    materialCandidate &&
    (materialCandidate.userData?.hbDedicatedWall ||
      materialCandidate.isMeshStandardMaterial ||
      materialCandidate.isMeshPhysicalMaterial ||
      materialCandidate.isMeshPhongMaterial ||
      materialCandidate.isMeshLambertMaterial)
  );
}
function isVisibleWithin(startNode, rootNode) {
  for (let currentNode = startNode; currentNode; currentNode = currentNode.parent) {
    if (currentNode.visible === false) return false;
    if (currentNode === rootNode) return true;
  }
  return false;
}
function classifyReceiverKind(candidateMesh) {
  const declaredKind = findAncestorField(candidateMesh, "regionReceiverKind");
  if (REGION_KINDS.includes(declaredKind)) return declaredKind;
  const modelLayer = findAncestorField(candidateMesh, "modelLayer");
  if (modelLayer === "items" || modelLayer === "lights") return "furniture";
  if (modelLayer === "walls" || /wall/i.test(candidateMesh.name || "")) return "wall";
  if (/floor/i.test(candidateMesh.name || "")) return "floor";
  const geometry = candidateMesh.geometry;
  if (geometry) {
    geometry.boundingBox || geometry.computeBoundingBox?.();
    const boundingBox = geometry.boundingBox;
    if (boundingBox) {
      const sortedExtent = [
        boundingBox.max.x - boundingBox.min.x,
        boundingBox.max.y - boundingBox.min.y,
        boundingBox.max.z - boundingBox.min.z,
      ].sort((sizeA, sizeB) => sizeA - sizeB);
      if (!modelLayer && sortedExtent[0] < 0.18 && sortedExtent[1] > 1.5) return "floor";
    }
  }
  return modelLayer ? "furniture" : "wall";
}
function setVector4IfChanged(targetVector, xComponent, yComponent, zComponent, wComponent) {
  const didChange =
    targetVector.x !== xComponent ||
    targetVector.y !== yComponent ||
    targetVector.z !== zComponent ||
    targetVector.w !== wComponent;
  return (targetVector.set(xComponent, yComponent, zComponent, wComponent), didChange);
}
function buildShaderChunk(volumeGroup) {
  return (
    "\n#define PLAN2_LIGHT_CAPACITY " +
    volumeGroup.capacity +
    "\n#define PLAN2_TEXTURE_DATA " +
    (volumeGroup.textureMode ? 1 : 0) +
    "\nuniform int plan2LightCount;\nuniform float plan2Gain;\nuniform float plan2ShadowPresentation;\nuniform float plan2AlbedoLift;\nuniform float plan2SunShadowStrength;\nuniform mat4 plan2MotionToLayout;\nvarying vec3 vPlan2WorldPosition;\n#if PLAN2_TEXTURE_DATA\nuniform sampler2D plan2LightData;\nvec4 plan2ReadData(int slot, float column) {\n  return texture2D(plan2LightData, vec2((column + 0.5) / 4.0, (float(slot) + 0.5) / float(PLAN2_LIGHT_CAPACITY)));\n}\n#else\nuniform vec4 plan2Centers[PLAN2_LIGHT_CAPACITY];\nuniform vec4 plan2Extents[PLAN2_LIGHT_CAPACITY];\nuniform vec4 plan2Colors[PLAN2_LIGHT_CAPACITY];\nuniform vec4 plan2Axes[PLAN2_LIGHT_CAPACITY];\n#endif\nvec3 plan2SurfaceLight(vec3 worldPoint) {\n  worldPoint = (plan2MotionToLayout * vec4(worldPoint, 1.0)).xyz;\n  vec3 weightedColor = vec3(0.0);\n  float totalWeight = 0.0;\n  float coverage = 0.0;\n  for (int slot = 0; slot < PLAN2_LIGHT_CAPACITY; slot++) {\n    if (slot >= plan2LightCount) break;\n    #if PLAN2_TEXTURE_DATA\n      vec4 center = plan2ReadData(slot, 0.0);\n    #else\n      vec4 center = plan2Centers[slot];\n    #endif\n    if (center.w < 0.00001) continue;\n    #if PLAN2_TEXTURE_DATA\n      vec4 extent = plan2ReadData(slot, 1.0);\n      vec4 axis = plan2ReadData(slot, 3.0);\n    #else\n      vec4 extent = plan2Extents[slot];\n      vec4 axis = plan2Axes[slot];\n    #endif\n    vec3 offset = worldPoint - center.xyz;\n    vec3 localPoint = vec3(dot(offset.xz, axis.xy), offset.y, dot(offset.xz, vec2(-axis.y, axis.x)));\n    float verticalDistance = max(abs(localPoint.y) - extent.y, 0.0);\n    if (verticalDistance >= extent.w) continue;\n    float fadeStart = axis.w > 0.0 ? 1.0 - clamp(axis.w, 0.05, 1.0) : 0.0;\n    float squareFalloff = 1.0;\n    float radialDistance;\n    if (axis.z > 3.5) {\n      // Retain straight zero-light edges, but fade each axis independently.\n      // Using max(x,z) for brightness changes derivatives on the diagonals,\n      // making four visible triangular wedges. max is only a bounds check.\n      vec2 fromCenter = abs(localPoint.xz) / max(extent.xz, vec2(0.001));\n      radialDistance = max(fromCenter.x, fromCenter.y);\n      vec2 edgeFade = vec2(1.0) - smoothstep(vec2(fadeStart), vec2(1.0), fromCenter);\n      squareFalloff = edgeFade.x * edgeFade.y;\n    } else if (axis.z > 2.5) {\n      // Edited strips are rounded rectangles with their zero-light boundary\n      // exactly at the requested width/depth, including both rounded ends.\n      float radius = max(min(extent.x, extent.z), 0.001);\n      vec2 fromCore = max(abs(localPoint.xz) - (extent.xz - vec2(radius)), vec2(0.0));\n      radialDistance = length(fromCore) / radius;\n    } else if (axis.z > 0.5 && axis.z < 1.5) {\n      // A strip is a line source. Brightness falls away from the line, rather\n      // than remaining constant throughout a wide rectangular room volume.\n      vec2 fromSegment = vec2(max(abs(localPoint.x) - extent.x, 0.0), localPoint.z);\n      radialDistance = length(fromSegment) / max(extent.z, 0.001);\n    } else {\n      radialDistance = length(localPoint.xz / max(extent.xz, vec2(0.001)));\n    }\n    if (radialDistance >= 1.0) continue;\n    float horizontalFalloff = axis.z > 3.5 ? squareFalloff : 1.0 - smoothstep(fadeStart, 1.0, radialDistance);\n    float influence = horizontalFalloff\n      * (1.0 - smoothstep(0.0, extent.w, verticalDistance)) * clamp(center.w, 0.0, 1.5);\n    #if PLAN2_TEXTURE_DATA\n      vec3 lightColor = plan2ReadData(slot, 2.0).rgb;\n    #else\n      vec3 lightColor = plan2Colors[slot].rgb;\n    #endif\n    weightedColor += lightColor * influence;\n    totalWeight += influence;\n    coverage += (1.0 - coverage) * influence;\n  }\n  // Smooth bounded union: max() produced a derivative crease wherever two\n  // lamps exchanged dominance. This preserves single-lamp falloff and blends\n  // overlaps continuously, with coverage capped at one rather than added HDR.\n  return weightedColor / max(totalWeight, 0.00001) * coverage;\n}\n"
  );
}
function sampleRegionVolumes(volumes, worldPoint, gain = 1) {
  let coverage = 0,
    totalWeight = 0;
  const accumulatedColor = [0, 0, 0];
  for (const volume of volumes) {
    const { center: center, extent: extent, color: color, axis: axis } = volume;
    if (center.w <= 0) continue;
    const offsetX = worldPoint.x - center.x,
      offsetY = worldPoint.y - center.y,
      offsetZ = worldPoint.z - center.z,
      localX = offsetX * axis.x + offsetZ * axis.y,
      localZ = -offsetX * axis.y + offsetZ * axis.x,
      cornerRadius = Math.max(Math.min(extent.x, extent.z), 0.001),
      radialDistance =
        axis.z > 3.5
          ? Math.max(
              Math.abs(localX) / Math.max(extent.x, 0.001),
              Math.abs(localZ) / Math.max(extent.z, 0.001),
            )
          : axis.z > 2.5
            ? Math.hypot(
                Math.max(Math.abs(localX) - (extent.x - cornerRadius), 0),
                Math.max(Math.abs(localZ) - (extent.z - cornerRadius), 0),
              ) / cornerRadius
            : axis.z > 0.5 && axis.z < 1.5
              ? Math.hypot(Math.max(Math.abs(localX) - extent.x, 0), localZ) /
                Math.max(extent.z, 0.001)
              : Math.hypot(localX / Math.max(extent.x, 0.001), localZ / Math.max(extent.z, 0.001)),
      fadeStart = axis.w > 0 ? 1 - clamp(axis.w, 0.05, 1) : 0,
      normalizedDistance = clamp((radialDistance - fadeStart) / (1 - fadeStart), 0, 1),
      verticalRatio = clamp(Math.max(Math.abs(offsetY) - extent.y, 0) / extent.w, 0, 1);
    let horizontalFalloff =
      1 - normalizedDistance * normalizedDistance * (3 - 2 * normalizedDistance);
    if (axis.z > 3.5) {
      const xEdgeRatio = clamp(
          (Math.abs(localX) / Math.max(extent.x, 0.001) - fadeStart) / (1 - fadeStart),
          0,
          1,
        ),
        zEdgeRatio = clamp(
          (Math.abs(localZ) / Math.max(extent.z, 0.001) - fadeStart) / (1 - fadeStart),
          0,
          1,
        );
      horizontalFalloff =
        (1 - xEdgeRatio * xEdgeRatio * (3 - 2 * xEdgeRatio)) *
        (1 - zEdgeRatio * zEdgeRatio * (3 - 2 * zEdgeRatio));
    }
    const influence =
      horizontalFalloff *
      (1 - verticalRatio * verticalRatio * (3 - 2 * verticalRatio)) *
      clamp(center.w, 0, 1.5);
    ((totalWeight += influence),
      (coverage += (1 - coverage) * influence),
      (accumulatedColor[0] += color.x * influence),
      (accumulatedColor[1] += color.y * influence),
      (accumulatedColor[2] += color.z * influence));
  }
  return accumulatedColor.map((channelValue) =>
    totalWeight > 0 ? (channelValue / totalWeight) * coverage * gain : 0,
  );
}
export function createRegionLightController({
  THREE: THREE,
  renderer: renderer,
  scene: scene,
  getRoot: getRoot,
  contactShadows: contactShadows = null,
  requestFrame: requestFrame = () => {},
}) {
  const registrationsByLight = new Map(),
    listenedNodeSet = new Set<EventTargetNodeLike>(),
    assignmentsByMesh = new Map(),
    sourceMaterialByClone = new WeakMap(),
    clonesByMaterial = new Map(),
    groupsByKey = new Map(),
    retainedRootSet = new Set<TraversableNodeLike>(),
    lightWorldPosition = new THREE.Vector3(),
    floorRootPosition = new THREE.Vector3(),
    sampleWorldPoint = new THREE.Vector3(),
    lightWorldMatrix = new THREE.Matrix4();
  let motionTransformProvider = null;
  const viewToWorldUniform = {
      value: new THREE.Matrix4(),
    },
    floorBrightnessUniform = {
      value: 1,
    },
    volumeInputsScratch = [],
    albedoLiftUniform = {
      value: 0.6,
    },
    contactContrastUniform = {
      value: 0,
    };
  let sceneStyleGain = 0.8,
    presentationGain = 1;
  const shadowPresentationUniform = {
      value: 1,
    },
    settings = {
      gain: 3,
      floorGain: 1,
      wallGain: 0.9,
      furnitureGain: 1,
      rangeScale: 0.8,
      sunShadowStrength: 0.6,
    },
    stats = {
      mode: "region",
      registered: 0,
      slotCount: 0,
      active: 0,
      capacity: 0,
      floorCount: 0,
      materials: 0,
      detailedMaterials: 0,
      meshCount: 0,
      nativeLights: 0,
      structureScans: 0,
      uniformUpdates: 0,
      volumeCacheHits: 0,
      shaderCompiles: 0,
      textureFloors: 0,
      disposed: false,
    };
  let rootObject = null,
    shouldRescanStructure = true,
    isDisposed = false,
    nativeLights = [],
    registrationsByFloorId = new Map(),
    overrides = Object.create(null),
    previewKeys = null,
    isMotionEnabled = false,
    isMotionInstant = false,
    motionFadeStartMs = null;
  const markStructureDirty = () => {
      shouldRescanStructure = true;
    },
    originalOnBeforeRender = scene.onBeforeRender;
  function ensureLightGroup(groupFloorId, requestedKind, lightCount) {
    const groupKey = groupFloorId + "\0" + requestedKind;
    let lightGroup = groupsByKey.get(groupKey);
    lightGroup ||
      ((lightGroup = {
        key: groupKey,
        floorId: groupFloorId,
        kind: requestedKind,
        capacity: 0,
        textureMode: false,
        slots: [],
        materials: new Set(),
        uniforms: {
          plan2LightCount: {
            value: lightCount,
          },
          plan2Gain: {
            value: 1,
          },
          plan2ShadowPresentation: shadowPresentationUniform,
          plan2AlbedoLift: albedoLiftUniform,
          plan2ContactContrast: contactContrastUniform,
          plan2SunShadowStrength: {
            value: 0,
          },
          plan2Centers: {
            value: [],
          },
          plan2Extents: {
            value: [],
          },
          plan2Colors: {
            value: [],
          },
          plan2Axes: {
            value: [],
          },
          plan2ViewToWorld: viewToWorldUniform,
          plan2MotionToLayout: {
            value: new THREE.Matrix4(),
          },
          plan2LightData: {
            value: null,
          },
        },
      }),
      requestedKind !== "wall" &&
        contactShadows &&
        Object.assign(lightGroup.uniforms, contactShadows.getUniforms(groupFloorId)),
      groupsByKey.set(groupKey, lightGroup));
    const capacity = alignTo16(lightCount);
    if (lightGroup.capacity !== capacity) {
      lightGroup.capacity = capacity;
      const maxFragmentUniforms = coercedFiniteNumberOr(
        renderer?.capabilities?.maxFragmentUniforms,
        1024,
      );
      ((lightGroup.textureMode = capacity * 4 + 128 > maxFragmentUniforms),
        lightGroup.texture?.dispose(),
        (lightGroup.texture = null),
        (lightGroup.slots = Array.from(
          {
            length: capacity,
          },
          () => ({
            center: new THREE.Vector4(),
            extent: new THREE.Vector4(),
            color: new THREE.Vector4(),
            axis: new THREE.Vector4(),
          }),
        )));
      for (const [uniformName, slotProperty] of [
        ["plan2Centers", "center"],
        ["plan2Extents", "extent"],
        ["plan2Colors", "color"],
        ["plan2Axes", "axis"],
      ])
        lightGroup.uniforms[uniformName].value = lightGroup.slots.map((slot) => slot[slotProperty]);
      if (lightGroup.textureMode) {
        const maxTextureSize = coercedFiniteNumberOr(renderer?.capabilities?.maxTextureSize, 4096);
        if (capacity > maxTextureSize)
          throw new RangeError(
            "区域灯数量 " + lightCount + " 超出本机数据纹理容量 " + maxTextureSize,
          );
        ((lightGroup.texture = new THREE.DataTexture(
          new Float32Array(capacity * 16),
          4,
          capacity,
          THREE.RGBAFormat,
          THREE.FloatType,
        )),
          (lightGroup.texture.minFilter = lightGroup.texture.magFilter = THREE.NearestFilter),
          (lightGroup.texture.generateMipmaps = false),
          (lightGroup.texture.needsUpdate = true));
      }
      lightGroup.uniforms.plan2LightData.value = lightGroup.texture;
      for (const cachedMaterial of lightGroup.materials) cachedMaterial.needsUpdate = true;
    }
    return ((lightGroup.uniforms.plan2LightCount.value = lightCount), lightGroup);
  }
  function findTrackedSourceMaterial(startMaterial) {
    const visitedMaterialSet = new Set();
    for (
      let candidateMaterial = startMaterial;
      candidateMaterial && !visitedMaterialSet.has(candidateMaterial);
    )
      if (
        (visitedMaterialSet.add(candidateMaterial),
        (candidateMaterial =
          candidateMaterial.runtimeSourceMaterial || candidateMaterial.environmentSourceMaterial),
        sourceMaterialByClone.has(candidateMaterial))
      )
        return candidateMaterial;
    return null;
  }
  function getRegionMaterial(
    sourceMaterial,
    materialFloorId,
    materialKind,
    resultMaterials,
    isDetailedSurface = false,
    isFloorTone = false,
  ) {
    const trackedSourceMaterial = findTrackedSourceMaterial(sourceMaterial);
    if (trackedSourceMaterial) return (resultMaterials.add(trackedSourceMaterial), sourceMaterial);
    if (
      ((sourceMaterial = sourceMaterialByClone.get(sourceMaterial) || sourceMaterial),
      !isRegionReceiverMaterial(sourceMaterial))
    )
      return sourceMaterial;
    let clonesByVariantKey = clonesByMaterial.get(sourceMaterial);
    clonesByVariantKey ||
      ((clonesByVariantKey = new Map()), clonesByMaterial.set(sourceMaterial, clonesByVariantKey));
    const materialGroupKey = materialFloorId + "\0" + materialKind,
      variantKey =
        materialGroupKey +
        "\0" +
        (isDetailedSurface ? "detailed" : "simple") +
        (isFloorTone ? "-floor-tone" : "");
    let cloneMaterial = clonesByVariantKey.get(variantKey);
    const materialGroup = groupsByKey.get(materialGroupKey);
    if (!cloneMaterial) {
      ((cloneMaterial = sourceMaterial.clone()),
        sourceMaterial.userData.hbDedicatedWall &&
          (cloneMaterial.color = sourceMaterial.color.clone()),
        (cloneMaterial.name =
          (sourceMaterial.name || sourceMaterial.type || "material") +
          " / region " +
          materialKind));
      const originalOnBeforeCompile = sourceMaterial.onBeforeCompile;
      cloneMaterial.onBeforeCompile = function (shader, webglRenderer) {
        (originalOnBeforeCompile?.call(this, shader, webglRenderer),
          Object.assign(shader.uniforms, materialGroup.uniforms),
          isFloorTone &&
            ((shader.uniforms.plan2FloorBrightness = floorBrightnessUniform),
            (shader.fragmentShader =
              "uniform float plan2FloorBrightness;\n" + shader.fragmentShader),
            (shader.fragmentShader = shader.fragmentShader.replace(
              "#include <color_fragment>",
              "#include <color_fragment>\ndiffuseColor.rgb *= plan2FloorBrightness;",
            ))),
          (shader.uniforms.plan2ContactViewToWorld = materialGroup.uniforms.plan2ViewToWorld),
          (shader.vertexShader =
            "uniform mat4 plan2ViewToWorld;\nvarying vec3 vPlan2WorldPosition;\n" +
            shader.vertexShader));
        const PROJECT_VERTEX_INCLUDE = "#include <project_vertex>";
        if (!shader.vertexShader.includes(PROJECT_VERTEX_INCLUDE))
          throw new Error("区域灯材质缺少 project_vertex");
        if (
          ((shader.vertexShader = shader.vertexShader.replace(
            PROJECT_VERTEX_INCLUDE,
            PROJECT_VERTEX_INCLUDE + "\nvPlan2WorldPosition = (plan2ViewToWorld * mvPosition).xyz;",
          )),
          (shader.fragmentShader = buildShaderChunk(materialGroup) + shader.fragmentShader),
          sourceMaterial.userData.hbDedicatedWall)
        ) {
          ((shader.uniforms.diffuse = {
            value: cloneMaterial.color,
          }),
            (shader.uniforms.opacity = {
              get value() {
                return cloneMaterial.opacity;
              },
            }),
            (stats.shaderCompiles += 1));
          return;
        }
        const LIGHTS_FRAGMENT_END_INCLUDE = "#include <lights_fragment_end>";
        if (!shader.fragmentShader.includes(LIGHTS_FRAGMENT_END_INCLUDE))
          throw new Error("区域灯材质缺少 lights_fragment_end");
        const sunShadowSnippet =
          materialKind === "wall"
            ? ""
            : "\n          #if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0\n            if (receiveShadow && plan2SunShadowStrength > 0.0 && directionalLightShadows[0].shadowIntensity > 0.0) {\n              // The studio's single shadow-casting directional light is the\n              // first shadow slot. Reuse its resident VSM map; no new capture.\n              DirectionalLightShadow plan2SunShadow = directionalLightShadows[0];\n              plan2ShadowMask = getShadow(directionalShadowMap[0], plan2SunShadow.shadowMapSize,\n                min(1.0, plan2SunShadow.shadowIntensity * plan2SunShadowStrength / 0.18),\n                plan2SunShadow.shadowBias, plan2SunShadow.shadowRadius, vDirectionalShadowCoord[0]);\n            }\n          #endif";
        ((shader.fragmentShader = shader.fragmentShader.replace(
          LIGHTS_FRAGMENT_END_INCLUDE,
          LIGHTS_FRAGMENT_END_INCLUDE +
            "\nvec3 plan2ReceivingColor = mix(diffuseColor.rgb, sqrt(max(diffuseColor.rgb, vec3(0.0))), plan2AlbedoLift);\n          #ifdef HB_CAR_GLASS_FINISH\n            // Keep moderate fill on glass while avoiding the full furniture\n            // albedo lift, which exaggerates the atlas' photographed lighting.\n            plan2ReceivingColor = mix(plan2ReceivingColor, diffuseColor.rgb, hbCarGlass * 0.6);\n          #endif\n          float plan2ShadowMask = 1.0;" +
            sunShadowSnippet +
            "\n          reflectedLight.indirectDiffuse += plan2ReceivingColor * plan2SurfaceLight(vPlan2WorldPosition) * plan2Gain * plan2ShadowMask;",
        )),
          materialKind !== "wall" &&
            contactShadows &&
            ((shader.fragmentShader =
              "uniform sampler2D plan2ContactMap;\n            uniform mat4 plan2ContactTransform;\n            uniform vec4 plan2ContactBounds;\n            uniform float plan2ContactY, plan2ContactOpacity;\n            uniform sampler2D plan2SurfaceMap;\n            uniform vec4 plan2SurfaceBounds;\n            uniform sampler2D plan2SurfaceLookup;\n            uniform vec2 plan2SurfaceLayout;\n            uniform mat4 plan2ContactViewToWorld;\n            uniform float plan2SurfaceOpacity, plan2ContactContrast;\n            // Deepen soft contact midtones without changing clear pixels or\n            // maximum occlusion. Opacity and motion fades stay linear outside.\n            float plan2ContactCoverage(float coverage, float weight) {\n              return coverage + plan2ContactContrast * weight * coverage * (1.0 - coverage);\n            }\n" +
              shader.fragmentShader),
            (shader.fragmentShader = shader.fragmentShader.replace(
              "#include <opaque_fragment>",
              "\n            float plan2ContactTransmission = 1.0;\n            vec3 contactPosition = (plan2ContactTransform * vec4(vPlan2WorldPosition, 1.0)).xyz;\n            // Derivatives must be evaluated outside the height/tile branches.\n            float contactFaceUp = abs(normalize(cross(dFdx(contactPosition), dFdy(contactPosition))).y);\n            float contactNormalUp = normalize(mat3(plan2ContactTransform) * mat3(plan2ContactViewToWorld) * normal).y;\n            vec2 contactUv = (contactPosition.xz - plan2ContactBounds.xy) / plan2ContactBounds.zw;\n            float contactHeight = contactPosition.y - plan2ContactY;\n            if (contactHeight >= -0.015 && contactHeight < 0.12" +
                (isFloorTone ? " && contactHeight <= 0.015" : "") +
                "\n                && all(greaterThanEqual(contactUv, vec2(0.0))) && all(lessThanEqual(contactUv, vec2(1.0)))) {\n              // Rugs and the lowest furniture surfaces also receive contact\n              // shading. Fade it over the first 12cm; upper surfaces stay lit.\n              float contactWeight = 1.0 - smoothstep(0.035, 0.12, max(contactHeight, 0.0));\n              plan2ContactTransmission *= 1.0 - plan2ContactCoverage(texture2D(plan2ContactMap, contactUv).r, 1.0) * plan2ContactOpacity * contactWeight * plan2ShadowPresentation;\n            }\n            " +
                (sourceMaterial.userData?.plan2SurfaceContact === false
                  ? ""
                  : "if (contactHeight > " +
                    (isFloorTone ? "0.015" : "0.12") +
                    " && plan2SurfaceOpacity > 0.0) {\n              // These are already baked shadow pixels, not an occluder depth\n              // map. No shadow comparison or light-space projection per frame.\n              vec4 tile = texture2D(plan2SurfaceLookup, vec2(clamp(contactHeight / plan2SurfaceLayout.y, 0.0, 1.0), 0.5));\n              float surfaceCaptureCode = dot(floor(tile.ba * 255.0 + 0.5), vec2(256.0, 1.0));\n              float surfaceCaptureHeight = surfaceCaptureCode * (plan2SurfaceLayout.y / 65535.0);\n              vec2 localUv = (contactPosition.xz - plan2SurfaceBounds.xy) / plan2SurfaceBounds.zw;\n              if (surfaceCaptureCode > 0.0 && contactHeight <= surfaceCaptureHeight\n                  && all(greaterThanEqual(localUv, vec2(0.0))) && all(lessThanEqual(localUv, vec2(1.0)))) {\n                // Keep cushion self-shadow rejection. Wide cloth shoulders instead fade\n                // with slope and height, with a softer contact than rigid tabletops.\n                float upward = " +
                    (sourceMaterial.userData?.plan2SurfaceSlope === true
                      ? "0.5 * smoothstep(0.8, 0.98, contactNormalUp) * smoothstep(0.9, 0.999, contactFaceUp) * (1.0 - smoothstep(0.006, 0.018, surfaceCaptureHeight - contactHeight))"
                      : "step(0.8, contactNormalUp) * smoothstep(0.999, 0.9999, contactFaceUp)") +
                    ";\n                vec2 tileOrigin = floor(tile.rg * 255.0 + 0.5);\n                vec2 surfaceUv = (tileOrigin + clamp(localUv, vec2(0.002), vec2(0.998))) / plan2SurfaceLayout.x;\n                plan2ContactTransmission *= 1.0 - plan2ContactCoverage(texture2D(plan2SurfaceMap, surfaceUv).r, 0.75) * plan2SurfaceOpacity * upward * plan2ShadowPresentation;\n              }\n            }") +
                "\n            #include <opaque_fragment>",
            )),
            (shader.fragmentShader = shader.fragmentShader.replace(
              "#include <tonemapping_fragment>",
              "#include <tonemapping_fragment>\ngl_FragColor.rgb *= plan2ContactTransmission;",
            ))),
          !isDetailedSurface &&
            !sourceMaterial.userData.alphaWallBand &&
            (sourceMaterial.transmission == null || sourceMaterial.transmission === 0) &&
            ((shader.fragmentShader = "uniform mat4 plan2ViewToWorld;\n" + shader.fragmentShader),
            (shader.fragmentShader = shader.fragmentShader
              .replace(
                "#include <lights_fragment_begin>",
                "\n              vec3 simpleNormal = normalize(mat3(plan2MotionToLayout) * mat3(plan2ViewToWorld) * normal);\n              float simpleUp = simpleNormal.y * 0.5 + 0.5;\n              float simpleKey = max(dot(simpleNormal, normalize(vec3(-0.4, 0.85, 0.32))), 0.0);\n              vec3 simpleTint = mix(vec3(0.82, 0.85, 0.91), vec3(1.0, 1.0, 1.0), simpleUp);\n              reflectedLight.indirectDiffuse = diffuseColor.rgb * simpleTint * (0.30 + 0.40 * simpleUp + 0.18 * simpleKey);\n            ",
              )
              .replace("#include <lights_fragment_maps>", "")
              .replace("#include <lights_fragment_end>", ""))),
          (stats.shaderCompiles += 1));
      };
      const baseProgramCacheKey = sourceMaterial.customProgramCacheKey?.call(sourceMaterial) || "";
      ((cloneMaterial.customProgramCacheKey = () =>
        baseProgramCacheKey +
        "|plan2-baked-surface-v17-sloped-duvet|" +
        +(sourceMaterial.userData?.plan2SurfaceContact !== false) +
        "|" +
        +(sourceMaterial.userData?.plan2SurfaceSlope === true) +
        "|" +
        +!!sourceMaterial.userData.alphaWallBand +
        "|" +
        Number(isDetailedSurface) +
        "|" +
        Number(isFloorTone) +
        "|" +
        materialKind +
        "|" +
        materialGroup.capacity +
        "|" +
        Number(materialGroup.textureMode) +
        "|" +
        !!contactShadows),
        (cloneMaterial.userData.plan2RegionMaterial = true),
        (cloneMaterial.userData.plan2DetailedSurface = isDetailedSurface),
        sourceMaterialByClone.set(cloneMaterial, sourceMaterial),
        clonesByVariantKey.set(variantKey, cloneMaterial),
        materialGroup.materials.add(cloneMaterial));
    }
    return (resultMaterials.add(cloneMaterial), cloneMaterial);
  }
  function rebuildStructure() {
    stats.structureScans += 1;
    const currentNodeSet = new Set<EventTargetNodeLike>(),
      meshNodes = [],
      registeredLightSet = new Set();
    rootObject?.traverse((visitedNode) => {
      (currentNodeSet.add(visitedNode),
        registrationsByLight.has(visitedNode) && registeredLightSet.add(visitedNode),
        visitedNode.isMesh && meshNodes.push(visitedNode));
    });
    for (const staleNode of listenedNodeSet)
      currentNodeSet.has(staleNode) ||
        (staleNode.removeEventListener("childadded", markStructureDirty),
        staleNode.removeEventListener("childremoved", markStructureDirty),
        listenedNodeSet.delete(staleNode));
    for (const newNode of currentNodeSet)
      listenedNodeSet.has(newNode) ||
        (newNode.addEventListener("childadded", markStructureDirty),
        newNode.addEventListener("childremoved", markStructureDirty),
        listenedNodeSet.add(newNode));
    for (const [registeredLight, registrationRecord] of registrationsByLight)
      registeredLightSet.has(registeredLight) ||
        ((registeredLight.layers.mask = registrationRecord.originalLayers),
        registrationsByLight.delete(registeredLight));
    registrationsByFloorId = new Map();
    for (const registration of registrationsByLight.values()) {
      ((registration.floorId = String(
        registration.light.userData?.regionFloorId ??
          registration.light.userData?.lightFloorId ??
          findAncestorField(registration.light, "regionFloorId") ??
          findAncestorField(registration.light, "floorId") ??
          "default",
      )),
        (registration.id = String(registration.item.id ?? registration.light.uuid)),
        (registration.key = regionLightKey(registration.floorId, registration.id)));
      let floorRoot = rootObject;
      for (
        let ancestor = registration.light.parent;
        ancestor && ancestor !== rootObject;
        ancestor = ancestor.parent
      )
        if (
          ancestor.userData?.regionFloorId !== undefined ||
          ancestor.userData?.floorId !== undefined
        ) {
          floorRoot = ancestor;
          break;
        }
      registration.floorRoot = floorRoot;
      const floorRecords = registrationsByFloorId.get(registration.floorId) || [];
      (floorRecords.push(registration),
        registrationsByFloorId.set(registration.floorId, floorRecords));
    }
    const defaultFloorId =
      registrationsByFloorId.size === 1 ? registrationsByFloorId.keys().next().value : "default";
    registrationsByFloorId.size || registrationsByFloorId.set(defaultFloorId, []);
    for (const [entryFloorId, floorRegistrations] of registrationsByFloorId)
      for (const groupKindName of REGION_KINDS)
        ensureLightGroup(entryFloorId, groupKindName, floorRegistrations.length);
    const liveMaterialSet = new Set<SurfaceMaterialLike>(),
      swappedMeshSet = new Set();
    for (const mesh of meshNodes) {
      if (
        ["background", "grid", "outline", "light-source-preview"].includes(
          findAncestorField(mesh, "exportRole"),
        )
      )
        continue;
      const meshFloorId = String(
        findAncestorField(mesh, "regionFloorId") ??
          findAncestorField(mesh, "floorId") ??
          defaultFloorId,
      );
      if (!registrationsByFloorId.has(meshFloorId)) {
        registrationsByFloorId.set(meshFloorId, []);
        for (const emptyKindName of REGION_KINDS) ensureLightGroup(meshFloorId, emptyKindName, 0);
      }
      const receiverKind = classifyReceiverKind(mesh),
        material = mesh.material,
        shouldPreserveDetailed = findAncestorField(mesh, "preserveDetailedSurface") === true,
        isFloorReceiver = findAncestorField(mesh, "regionReceiverKind") === "floor",
        assignedMaterial = Array.isArray(material)
          ? material.map((sourceMaterialItem) =>
              getRegionMaterial(
                sourceMaterialItem,
                meshFloorId,
                receiverKind,
                liveMaterialSet,
                shouldPreserveDetailed,
                isFloorReceiver,
              ),
            )
          : getRegionMaterial(
              material,
              meshFloorId,
              receiverKind,
              liveMaterialSet,
              shouldPreserveDetailed,
              isFloorReceiver,
            );
      ((Array.isArray(material)
        ? assignedMaterial.some(
            (swappedMaterial, materialIndex) => swappedMaterial !== material[materialIndex],
          )
        : assignedMaterial !== material) && (mesh.material = assignedMaterial),
        (Array.isArray(assignedMaterial)
          ? assignedMaterial.some((regionMaterial) => sourceMaterialByClone.has(regionMaterial))
          : sourceMaterialByClone.has(assignedMaterial)) &&
          (swappedMeshSet.add(mesh),
          assignmentsByMesh.set(mesh, {
            assigned: mesh.material,
          })));
    }
    const stillAssignedMeshSet = new Set();
    for (const trackedRoot of retainedRootSet)
      trackedRoot.traverse((trackedNode) => {
        if (assignmentsByMesh.has(trackedNode)) {
          stillAssignedMeshSet.add(trackedNode);
          for (const meshMaterial of Array.isArray(trackedNode.material)
            ? trackedNode.material
            : [trackedNode.material]) {
            const environmentMaterial = findTrackedSourceMaterial(meshMaterial) || meshMaterial;
            sourceMaterialByClone.has(environmentMaterial) &&
              liveMaterialSet.add(environmentMaterial);
          }
        }
      });
    for (const [assignedMesh, meshAssignment] of assignmentsByMesh)
      !swappedMeshSet.has(assignedMesh) &&
        !stillAssignedMeshSet.has(assignedMesh) &&
        (restoreMeshMaterial(assignedMesh, meshAssignment), assignmentsByMesh.delete(assignedMesh));
    for (const [cloneSourceMaterial, cloneMap] of clonesByMaterial) {
      for (const [staleVariantKey, staleClone] of cloneMap)
        liveMaterialSet.has(staleClone) ||
          (groupsByKey
            .get(staleVariantKey.slice(0, staleVariantKey.lastIndexOf("\0")))
            ?.materials.delete(staleClone),
          staleClone.dispose(),
          cloneMap.delete(staleVariantKey));
      cloneMap.size || clonesByMaterial.delete(cloneSourceMaterial);
    }
    for (const [staleGroupKey, staleGroup] of groupsByKey)
      !registrationsByFloorId.has(staleGroup.floorId) &&
        !staleGroup.materials.size &&
        (staleGroup.texture?.dispose(), groupsByKey.delete(staleGroupKey));
    ((nativeLights = []),
      scene.traverse((sceneNode) => {
        sceneNode.isLight && !registrationsByLight.has(sceneNode) && nativeLights.push(sceneNode);
      }),
      (stats.registered = stats.slotCount = registrationsByLight.size),
      (stats.materials = liveMaterialSet.size),
      (stats.meshCount = swappedMeshSet.size),
      (stats.floorCount = registrationsByFloorId.size),
      (stats.detailedMaterials = [...liveMaterialSet].filter(
        (surfaceMaterial) =>
          surfaceMaterial.userData.plan2DetailedSurface ||
          surfaceMaterial.userData.alphaWallBand ||
          surfaceMaterial.transmission > 0,
      ).length),
      (stats.capacity = [...registrationsByFloorId].reduce(
        (totalCapacity, [, floorEntryList]) => totalCapacity + alignTo16(floorEntryList.length),
        0,
      )),
      (stats.textureFloors = [...registrationsByFloorId.keys()].filter(
        (floorKey) => groupsByKey.get(floorKey + "\0floor")?.textureMode,
      ).length),
      (shouldRescanStructure = false));
  }
  function restoreMeshMaterial(swappedMesh, assignmentRecord) {
    swappedMesh.material === assignmentRecord.assigned &&
      (swappedMesh.material = Array.isArray(swappedMesh.material)
        ? swappedMesh.material.map(
            (restoredMaterial) => sourceMaterialByClone.get(restoredMaterial) || restoredMaterial,
          )
        : sourceMaterialByClone.get(swappedMesh.material) || swappedMesh.material);
  }
  function registerLight(lightObject, lightConfig = {}) {
    if (isDisposed || !lightObject?.isLight) return;
    (registrationsByLight.get(lightObject) ||
      registrationsByLight.set(lightObject, {
        light: lightObject,
        item: {
          ...lightConfig,
        },
        originalLayers: lightObject.layers.mask,
        fullIntensity: Math.max(
          0.00001,
          coercedFiniteNumberOr(
            lightObject.userData?.regionFullIntensity,
            coercedFiniteNumberOr(lightObject.userData?.lightOnIntensity, lightObject.intensity) ||
              1,
          ),
        ),
      }),
      lightObject.layers.set(30),
      (lightObject.castShadow = false),
      (shouldRescanStructure = true));
  }
  function syncCamera(camera) {
    !isDisposed && camera?.matrixWorld && (viewToWorldUniform.value = camera.matrixWorld);
  }
  function refreshWorldMatrices(matrixNode, readyNodeSet) {
    readyNodeSet.has(matrixNode) ||
      (matrixNode.parent && refreshWorldMatrices(matrixNode.parent, readyNodeSet),
      matrixNode.updateWorldMatrix(false, false),
      readyNodeSet.add(matrixNode));
  }
  function prepareMaterials() {
    if (isDisposed) return;
    const preparedRootObject = getRoot?.() || null;
    (preparedRootObject !== rootObject &&
      ((rootObject = preparedRootObject), (shouldRescanStructure = true)),
      shouldRescanStructure && rebuildStructure());
  }
  function sync(activeCamera, skipStructureScan = false) {
    if (isDisposed) return;
    if (!skipStructureScan) {
      contactShadows?.sync();
      const nextRootObject = getRoot?.() || null;
      (nextRootObject !== rootObject &&
        ((rootObject = nextRootObject), (shouldRescanStructure = true)),
        shouldRescanStructure && (!isMotionEnabled || isMotionInstant) && rebuildStructure());
    }
    if ((syncCamera(activeCamera), isMotionEnabled && !isMotionInstant)) return;
    const motionFadeProgress =
      motionFadeStartMs === null
        ? 1
        : Math.min(1, Math.max(0, (performance.now() - motionFadeStartMs) / 280));
    (motionFadeProgress < 1 ? requestFrame() : (motionFadeStartMs = null), (stats.active = 0));
    let shouldUpdateUniforms = false;
    const updatedNodeSet = new Set();
    for (const [loopFloorId, loopRegistrations] of registrationsByFloorId) {
      const loopGroups = REGION_KINDS.map((groupKind) =>
          groupsByKey.get(loopFloorId + "\0" + groupKind),
        ),
        motionMatrix =
          isMotionEnabled && isMotionInstant ? motionTransformProvider?.(loopFloorId) : null;
      isMotionEnabled && isMotionInstant && updatedNodeSet.clear();
      for (const activeLightGroup of loopGroups) {
        (motionMatrix
          ? activeLightGroup.uniforms.plan2MotionToLayout.value.copy(motionMatrix)
          : activeLightGroup.uniforms.plan2MotionToLayout.value.identity(),
          (activeLightGroup.presentationBaseGain =
            settings.gain *
            settings[activeLightGroup.kind + "Gain"] *
            sceneStyleGain *
            motionFadeProgress));
        const gainValue = activeLightGroup.presentationBaseGain * presentationGain;
        ((shouldUpdateUniforms ||= activeLightGroup.uniforms.plan2Gain.value !== gainValue),
          (activeLightGroup.uniforms.plan2Gain.value = gainValue));
        const sunShadowStrength =
          activeLightGroup.kind === "wall"
            ? 0
            : clamp(coercedFiniteNumberOr(settings.sunShadowStrength, 0.6), 0, 1) *
              motionFadeProgress;
        ((shouldUpdateUniforms ||=
          activeLightGroup.uniforms.plan2SunShadowStrength.value !== sunShadowStrength),
          (activeLightGroup.uniforms.plan2SunShadowStrength.value = sunShadowStrength),
          (activeLightGroup.changed = false));
      }
      loopRegistrations.forEach((floorEntry, slotIndex) => {
        const { light: light, item: lightItem } = floorEntry;
        (refreshWorldMatrices(light, updatedNodeSet),
          lightWorldMatrix.copy(light.matrixWorld),
          motionMatrix && lightWorldMatrix.premultiply(motionMatrix),
          lightWorldPosition.setFromMatrixPosition(lightWorldMatrix),
          floorEntry.floorRoot &&
            (refreshWorldMatrices(floorEntry.floorRoot, updatedNodeSet),
            floorRootPosition.setFromMatrixPosition(floorEntry.floorRoot.matrixWorld)),
          motionMatrix && floorRootPosition.applyMatrix4(motionMatrix));
        const floorElevation = floorEntry.floorRoot ? floorRootPosition.y : 0,
          actualAmount = isVisibleWithin(light, rootObject)
            ? clamp(coercedFiniteNumberOr(light.intensity) / floorEntry.fullIntensity, 0, 1.5)
            : 0,
          effectiveAmount =
            previewKeys === null
              ? actualAmount
              : previewKeys.has(floorEntry.key)
                ? Math.max(0.6, actualAmount)
                : 0,
          initialSlotAmount = effectiveAmount;
        if (
          (effectiveAmount > 0.00001 && (stats.active += 1),
          (volumeInputsScratch.length = 0),
          volumeInputsScratch.push(
            ...lightWorldMatrix.elements,
            floorElevation,
            effectiveAmount,
            actualAmount,
            initialSlotAmount,
            settings.rangeScale,
            lightItem.type,
            lightItem.lightRange,
            lightItem.width,
            lightItem.depth,
            light.width,
            light.height,
            light.color.r,
            light.color.g,
            light.color.b,
            overrides[floorEntry.key],
            stats.structureScans,
          ),
          floorEntry.volumeInputs &&
            volumeInputsScratch.every(
              (signatureValue, signatureIndex) =>
                signatureValue === floorEntry.volumeInputs[signatureIndex],
            ))
        ) {
          stats.volumeCacheHits++;
          return;
        }
        floorEntry.volumeInputs = volumeInputsScratch.slice();
        const scaledRange =
            clamp(coercedFiniteNumberOr(lightItem.lightRange, 3.5), 0.5, 10) *
            clamp(coercedFiniteNumberOr(settings.rangeScale, 1), 0.2, 3),
          isStripLight = lightItem.type === "striplight" || light.isRectAreaLight,
          defaultRadius = scaledRange * (lightItem.type === "ceilinglight" ? 0.45 : 0.33),
          halfWidth = Math.max(0.05, coercedFiniteNumberOr(lightItem.width, light.width || 2) / 2),
          halfDepth = Math.max(
            0.025,
            coercedFiniteNumberOr(lightItem.depth, light.height || 0.2) / 2,
          ),
          matrixElements = lightWorldMatrix.elements,
          horizontalDistance = Math.hypot(matrixElements[0], matrixElements[2]),
          directionX = horizontalDistance > 0.00001 ? matrixElements[0] / horizontalDistance : 1,
          directionZ = horizontalDistance > 0.00001 ? matrixElements[2] / horizontalDistance : 0,
          lightOverride = overrides[floorEntry.key],
          rotationRad = ((lightOverride?.rotation || 0) * Math.PI) / 180,
          rotatedDirectionX = rotationRad
            ? directionX * Math.cos(rotationRad) - directionZ * Math.sin(rotationRad)
            : directionX,
          rotatedDirectionZ = rotationRad
            ? directionX * Math.sin(rotationRad) + directionZ * Math.cos(rotationRad)
            : directionZ,
          softEdgeSize = Math.max(0.3, scaledRange * 0.23),
          baseRadius = isStripLight
            ? halfDepth + scaledRange * 0.07 + softEdgeSize
            : defaultRadius + softEdgeSize,
          region = (floorEntry.region ||= {
            center: [0, 0, 0],
            lampCenter: [0, 0, 0],
            axis: [1, 0],
            defaults: {
              axis: [1, 0],
              rotation: 0,
              softness: 1,
            },
          }),
          regionDefaults = region.defaults;
        ((regionDefaults.width = 2 * (isStripLight ? halfWidth + baseRadius : baseRadius)),
          (regionDefaults.depth = 2 * baseRadius),
          (regionDefaults.shape = isStripLight ? "strip" : "ellipse"),
          (regionDefaults.axis[0] = directionX),
          (regionDefaults.axis[1] = directionZ),
          (region.floorId = loopFloorId),
          (region.id = floorEntry.id),
          (region.key = floorEntry.key),
          (region.type = lightItem.type),
          (region.lampCenter[0] = lightWorldPosition.x),
          (region.lampCenter[1] = lightWorldPosition.y),
          (region.lampCenter[2] = lightWorldPosition.z),
          (region.offsetX = lightOverride?.offsetX ?? 0),
          (region.offsetZ = lightOverride?.offsetZ ?? 0),
          (region.moveCenterEnabled = lightOverride?.moveCenterEnabled === true),
          (region.center[0] = lightWorldPosition.x + region.offsetX),
          (region.center[1] = lightWorldPosition.y),
          (region.center[2] = lightWorldPosition.z + region.offsetZ),
          (region.axis[0] = rotatedDirectionX),
          (region.axis[1] = rotatedDirectionZ),
          (region.width = lightOverride?.width ?? regionDefaults.width),
          (region.depth = lightOverride?.depth ?? regionDefaults.depth),
          (region.rotation = lightOverride?.rotation ?? 0),
          (region.softness = lightOverride?.softness ?? 1),
          (region.shape = lightOverride?.shape ?? regionDefaults.shape),
          (region.overridden = !!lightOverride),
          (region.amount = effectiveAmount),
          (region.realAmount = actualAmount),
          (region.heightAbove = lightOverride?.heightAbove),
          (region.heightBelow = lightOverride?.heightBelow),
          (region.lampHeight = lightWorldPosition.y - floorElevation),
          (region.heightMin =
            lightOverride?.heightMin ??
            (lightOverride?.heightBelow === undefined
              ? undefined
              : region.lampHeight - lightOverride.heightBelow)),
          (region.heightMax =
            lightOverride?.heightMax ??
            (lightOverride?.heightAbove === undefined
              ? undefined
              : region.lampHeight + lightOverride.heightAbove)));
        for (const loopLightGroup of loopGroups) {
          const loopSlot = loopLightGroup.slots[slotIndex],
            loopKind = loopLightGroup.kind;
          let bottomY = floorElevation - (loopKind === "floor" ? 0.18 : 0.1),
            topY = Math.max(
              floorElevation + 0.2,
              lightWorldPosition.y + (loopKind === "wall" ? 0.55 : 0.2),
            ),
            edgeFade = Math.max(
              0.3,
              scaledRange * (loopKind === "floor" ? 0.23 : loopKind === "wall" ? 0.18 : 0.2),
            ),
            slotAmount = initialSlotAmount;
          if (
            lightOverride?.heightAbove !== undefined ||
            lightOverride?.heightBelow !== undefined ||
            lightOverride?.heightMin !== undefined ||
            lightOverride?.heightMax !== undefined
          ) {
            const bottomLimit =
                lightOverride.heightMin !== undefined
                  ? lightOverride.heightMin === 0
                    ? floorElevation - 0.18 - edgeFade
                    : floorElevation + lightOverride.heightMin
                  : lightOverride.heightBelow === undefined
                    ? bottomY - edgeFade
                    : lightWorldPosition.y - lightOverride.heightBelow,
              topLimit =
                lightOverride.heightMax !== undefined
                  ? floorElevation + lightOverride.heightMax
                  : lightOverride.heightAbove === undefined
                    ? topY + edgeFade
                    : lightWorldPosition.y + lightOverride.heightAbove,
              heightSpan = Math.max(0, topLimit - bottomLimit);
            ((edgeFade = Math.max(0.00001, Math.min(edgeFade, heightSpan / 2))),
              (bottomY = bottomLimit + edgeFade),
              (topY = Math.max(bottomY, topLimit - edgeFade)),
              heightSpan <= 0.00001 && (slotAmount = 0));
          }
          const slotHalfWidth = lightOverride
              ? lightOverride.width / 2
              : isStripLight
                ? halfWidth
                : defaultRadius + edgeFade,
            slotHalfDepth = lightOverride
              ? lightOverride.depth / 2
              : isStripLight
                ? halfDepth + scaledRange * 0.07 + edgeFade
                : defaultRadius + edgeFade;
          let slotChanged = setVector4IfChanged(
            loopSlot.center,
            region.center[0],
            (bottomY + topY) / 2,
            region.center[2],
            slotAmount,
          );
          ((slotChanged =
            setVector4IfChanged(
              loopSlot.extent,
              slotHalfWidth,
              (topY - bottomY) / 2,
              slotHalfDepth,
              edgeFade,
            ) || slotChanged),
            (slotChanged =
              setVector4IfChanged(loopSlot.color, light.color.r, light.color.g, light.color.b, 0) ||
              slotChanged));
          const cornerFade = clamp((2 * Math.min(slotHalfWidth, slotHalfDepth) - 4) / 4, 0, 1),
            effectiveSoftness = (lightOverride?.softness ?? 1) * (1 - 0.3 * cornerFade);
          if (
            ((slotChanged =
              setVector4IfChanged(
                loopSlot.axis,
                rotatedDirectionX,
                rotatedDirectionZ,
                lightOverride
                  ? lightOverride.shape === "square"
                    ? 4
                    : lightOverride.shape === "strip"
                      ? 3
                      : 2
                  : isStripLight
                    ? 1
                    : 0,
                effectiveSoftness,
              ) || slotChanged),
            (loopLightGroup.changed ||= slotChanged),
            slotChanged && loopLightGroup.texture)
          ) {
            const texturePixels = loopLightGroup.texture.image.data,
              slotByteOffset = slotIndex * 16;
            (loopSlot.center.toArray(texturePixels, slotByteOffset),
              loopSlot.extent.toArray(texturePixels, slotByteOffset + 4),
              loopSlot.color.toArray(texturePixels, slotByteOffset + 8),
              loopSlot.axis.toArray(texturePixels, slotByteOffset + 12));
          }
        }
      });
      for (const dirtyLightGroup of loopGroups)
        (dirtyLightGroup.changed &&
          dirtyLightGroup.texture &&
          (dirtyLightGroup.texture.needsUpdate = true),
          (shouldUpdateUniforms ||= dirtyLightGroup.changed));
    }
    (shouldUpdateUniforms && (stats.uniformUpdates += 1),
      (stats.nativeLights = nativeLights.filter(
        (sceneLight) =>
          isVisibleWithin(sceneLight, scene) &&
          (!activeCamera || sceneLight.layers.test(activeCamera.layers)),
      ).length));
  }
  function inspect() {
    return {
      ...stats,
      settings: {
        ...settings,
      },
      overrides: getOverrides(),
      previewKeys: previewKeys ? [...previewKeys] : null,
      regions: listRegions(),
      floors: [...registrationsByFloorId].map(([inspectFloorId, inspectRegistrations]) => ({
        floorId: inspectFloorId,
        slots: inspectRegistrations.length,
        capacity: groupsByKey.get(inspectFloorId + "\0floor")?.capacity,
        lights: inspectRegistrations.map((inspectEntry) => ({
          id: inspectEntry.item.id || inspectEntry.light.uuid,
          type: inspectEntry.item.type,
          intensity: inspectEntry.light.intensity,
          fullIntensity: inspectEntry.fullIntensity,
          amount: clamp(
            coercedFiniteNumberOr(inspectEntry.light.intensity) / inspectEntry.fullIntensity,
            0,
            1.5,
          ),
          effectiveAmount: inspectEntry.region?.amount ?? 0,
          regionKey: inspectEntry.key,
          visible: isVisibleWithin(inspectEntry.light, rootObject),
        })),
      })),
    };
  }
  function setOverrides(rawOverrideInput) {
    return (
      (overrides = sanitizeRegionOverrides(rawOverrideInput)),
      sync(undefined, true),
      getOverrides()
    );
  }
  function getOverrides() {
    return Object.fromEntries(
      Object.entries(overrides as Record<string, Record<string, unknown>>).map(
        ([overrideKey, overrideValue]) => [
          overrideKey,
          {
            ...overrideValue,
          },
        ],
      ),
    );
  }
  function listRegions() {
    return [...registrationsByLight.values()]
      .filter((regionEntry) => regionEntry.region)
      .map(({ region: regionRecord }) => ({
        ...regionRecord,
        center: [...regionRecord.center],
        lampCenter: [...regionRecord.lampCenter],
        axis: [...regionRecord.axis],
        defaults: {
          ...regionRecord.defaults,
          axis: [...regionRecord.defaults.axis],
        },
      }));
  }
  function setPreview(previewKeyList) {
    ((previewKeys = Array.isArray(previewKeyList)
      ? new Set(
          previewKeyList.filter(
            (previewKey) => typeof previewKey == "string" && isRegionLightKey(previewKey),
          ),
        )
      : null),
      sync(undefined, true));
  }
  function sampleFloorVolume(
    samplePoint,
    sampleFloorId = registrationsByFloorId.keys().next().value,
    sampleKind = "floor",
  ) {
    const sampleGroup = groupsByKey.get(sampleFloorId + "\0" + sampleKind);
    return sampleGroup
      ? sampleRegionVolumes(
          sampleGroup.slots.slice(0, sampleGroup.uniforms.plan2LightCount.value),
          sampleWorldPoint
            .copy(samplePoint)
            .applyMatrix4(sampleGroup.uniforms.plan2MotionToLayout.value),
          sampleGroup.uniforms.plan2Gain.value,
        )
      : [0, 0, 0];
  }
  function dispose() {
    if (!isDisposed) {
      ((isDisposed = true),
        (stats.disposed = true),
        scene.onBeforeRender === onBeforeRender && (scene.onBeforeRender = originalOnBeforeRender));
      for (const listenedNode of listenedNodeSet)
        (listenedNode.removeEventListener("childadded", markStructureDirty),
          listenedNode.removeEventListener("childremoved", markStructureDirty));
      for (const [swappedMeshEntry, meshAssignmentRecord] of assignmentsByMesh)
        restoreMeshMaterial(swappedMeshEntry, meshAssignmentRecord);
      for (const cloneMapToDispose of clonesByMaterial.values())
        for (const cloneToDispose of cloneMapToDispose.values()) cloneToDispose.dispose();
      for (const disposedLightGroup of groupsByKey.values()) disposedLightGroup.texture?.dispose();
      for (const restoredLight of registrationsByLight.values())
        restoredLight.light.layers.mask = restoredLight.originalLayers;
      (listenedNodeSet.clear(),
        assignmentsByMesh.clear(),
        clonesByMaterial.clear(),
        registrationsByLight.clear(),
        groupsByKey.clear(),
        retainedRootSet.clear(),
        typeof window < "u" && window.__plan2Region === controller && delete window.__plan2Region);
    }
  }
  function onBeforeRender(...renderArgs) {
    (originalOnBeforeRender?.apply(this, renderArgs), sync(renderArgs[2]));
  }
  const setFloorBrightness = (brightnessPercent) => {
    const brightnessRatio = clamp(coercedFiniteNumberOr(brightnessPercent, 100), 50, 150) / 100;
    return brightnessRatio === floorBrightnessUniform.value
      ? false
      : ((floorBrightnessUniform.value = brightnessRatio), (stats.uniformUpdates += 1), true);
  };
  function setSceneStyle(sceneStyleName) {
    const isWarmWoodStyle = sceneStyleName === "warm-wood",
      nextSceneStyleGain = isWarmWoodStyle ? 0.65 : 0.8;
    return sceneStyleGain === nextSceneStyleGain
      ? false
      : ((sceneStyleGain = nextSceneStyleGain),
        (albedoLiftUniform.value = isWarmWoodStyle ? 0 : 0.6),
        (contactContrastUniform.value = isWarmWoodStyle ? 0.28 : 0),
        requestFrame(),
        true);
  }
  function setMotion(motionEnabled, motionInstant = false) {
    if (isMotionEnabled === (motionEnabled === true) && isMotionInstant === motionInstant) return;
    const previousMotionInstant = isMotionInstant;
    if (
      ((isMotionInstant = motionInstant),
      (isMotionEnabled = motionEnabled === true),
      (motionFadeStartMs =
        isMotionEnabled || motionInstant || previousMotionInstant ? null : performance.now()),
      isMotionEnabled && !isMotionInstant)
    ) {
      for (const frozenLightGroup of groupsByKey.values())
        ((frozenLightGroup.uniforms.plan2Gain.value = 0),
          (frozenLightGroup.uniforms.plan2SunShadowStrength.value = 0));
    }
    ((shouldRescanStructure = true), requestFrame());
  }
  function applyPresentationGain(nextPresentationGain) {
    presentationGain = nextPresentationGain;
    for (const scaledLightGroup of groupsByKey.values())
      scaledLightGroup.uniforms.plan2Gain.value =
        (scaledLightGroup.presentationBaseGain ?? 1) * nextPresentationGain;
  }
  const controller = {
    register: registerLight,
    sync: sync,
    syncCamera: syncCamera,
    prepareMaterials: prepareMaterials,
    dispose: dispose,
    stats: stats,
    settings: settings,
    inspect: inspect,
    sample: sampleFloorVolume,
    invalidate: markStructureDirty,
    setFloorBrightness: setFloorBrightness,
    setMotion: setMotion,
    setPresentationGain(requestedPresentationGain) {
      const clampedPresentationGain = clamp(
        coercedFiniteNumberOr(requestedPresentationGain, 1),
        0,
        1,
      );
      isDisposed ||
        presentationGain === clampedPresentationGain ||
        (applyPresentationGain(clampedPresentationGain), requestFrame());
    },
    setShadowPresentationGain(requestedShadowGain) {
      const clampedShadowGain = clamp(coercedFiniteNumberOr(requestedShadowGain, 1), 0, 1);
      isDisposed ||
        clampedShadowGain === shadowPresentationUniform.value ||
        ((shadowPresentationUniform.value = clampedShadowGain), requestFrame());
    },
    withPresentationGain(scopedGain, scopedAction) {
      const previousPresentationGain = presentationGain,
        previousShadowGain = shadowPresentationUniform.value;
      ((shadowPresentationUniform.value = 1),
        applyPresentationGain(clamp(coercedFiniteNumberOr(scopedGain, 1), 0, 1)));
      try {
        return scopedAction();
      } finally {
        (applyPresentationGain(previousPresentationGain),
          (shadowPresentationUniform.value = previousShadowGain));
      }
    },
    setMotionTransformProvider(provider) {
      motionTransformProvider = provider;
    },
    setOverrides: setOverrides,
    getOverrides: getOverrides,
    listRegions: listRegions,
    setPreview: setPreview,
    setSceneStyle: setSceneStyle,
    retainRoot(retainedRoot) {
      (retainedRootSet.add(retainedRoot), markStructureDirty());
    },
    releaseRoot(releasedRoot) {
      (retainedRootSet.delete(releasedRoot), markStructureDirty());
    },
  };
  return (
    (scene.onBeforeRender = onBeforeRender),
    typeof window < "u" && (window.__plan2Region = controller),
    controller
  );
}
