/**
 * 区域灯（轻量柔光）的纯数据与着色片段。
 *
 * 从 `studio-plan2-region-lights.ts` 拆出来的一半：只放不依赖渲染器状态的东西 ——
 * 标定常量、灯键/覆盖清洗、受光体分类、注入材质的 GLSL 片段，以及给 `sample()`
 * 和体检用的 CPU 版体积采样。放在一起是因为 shader 与 CPU 采样必须逐字对应，
 * 分到两个文件后就没人拦得住它们漂移了。
 */
import { REGION_GRID_SIZE } from './studio-region-grid'

/** 单个区域的覆盖参数； */
export type RegionLightOverride = {
  /** 形状标识：circle / square / ellipse / strip，白名单在下面用 includes 校验。 */
  shape?: string
  width?: number
  depth?: number
  rotation?: number
  softness?: number
  offsetX?: number
  offsetZ?: number
  heightAbove?: number
  heightBelow?: number
  heightMin?: number
  heightMax?: number
  moveCenterEnabled?: boolean
}
export const REGION_KINDS = ['floor', 'wall', 'furniture'],
  coercedFiniteNumberOr = (numericInput: any, fallbackNumber = 0) =>
    Number.isFinite(Number(numericInput)) ? Number(numericInput) : fallbackNumber,
  clamp = (clampedInput: any, lowerBound: any, upperBound: any) =>
    Math.min(upperBound, Math.max(lowerBound, clampedInput)),
  alignTo16 = (sizeValue: any) => Math.max(16, Math.ceil(sizeValue / 16) * 16)

/**
 * 简化分支（烘焙基底）的三个标定常量。它们决定「环境基底 : 太阳 : 灯」的比例，
 * 是这个模式里唯一该调的三个数，别再往别处塞魔法数。
 *
 * `PLAIN_BASE_LEVEL`：常数环境基底的系数。原来基底吃满 `0.42 + 0.34·up + 0.14·key`，
 * 白墙自身就已经落到 linear 0.6 附近，再叠灯就直接进 tone mapping 的压缩段 —— 灯核心
 * 与周边差不到 5% sRGB，看起来就是「一片死白 + 没有光斑」。压到 0.72 之后墙面落到
 * linear 0.3~0.45（sRGB 0.6~0.7），灯才有地方把亮度堆上去。
 *
 * `PLAIN_WALL_SUN_GAIN`：立面补的柔和方向项，只给墙（`materialKind === 'wall'`）。
 * 之前 0.85 是加在**所有**简化材质的公共段上的：地板靠 `1-|n.y|` 免疫，但家具立面板
 * 白拿了将近一个基底亮度的增量。0.30 乘 `1-|n.y|` 只作用在立面上，NdotL = 1 的墙
 * 约 +0.25 线性，刚好把「哪面朝太阳」拉出来又不至于过曝。
 *
 * `PLAIN_BASE_SHADOW_WEIGHT`：太阳阴影对常数基底的压暗比例。基底里含天空/环境那一份，
 * 被遮挡时不该整份消失（那是 AO，不是直射光），但也不能完全不动，否则家具影在墙上
 * 没有落点。太阳项本身吃满 1.0。
 */
export const PLAIN_BASE_LEVEL = '0.72'
export const PLAIN_WALL_SUN_GAIN = '0.30'
export const PLAIN_BASE_SHADOW_WEIGHT = '0.40'

export const regionLightKey = (floorKeyId: any, lightKeyId: any) =>
  JSON.stringify([String(floorKeyId), String(lightKeyId)])
export function isRegionLightKey(keyString: any) {
  try {
    const parsedKey = JSON.parse(keyString)
    return (
      Array.isArray(parsedKey) &&
      parsedKey.length === 2 &&
      parsedKey.every((keyPart) => typeof keyPart == 'string') &&
      regionLightKey(parsedKey[0], parsedKey[1]) === keyString
    )
  } catch {
    return false
  }
}
export function sanitizeRegionOverrides(rawOverrides: any) {
  const normalizedOverrides = Object.create(null)
  if (!rawOverrides || typeof rawOverrides != 'object' || Array.isArray(rawOverrides)) return normalizedOverrides
  for (const [regionKey, override] of Object.entries(rawOverrides as Record<string, RegionLightOverride>)) {
    if (
      !isRegionLightKey(regionKey) ||
      !override ||
      typeof override != 'object' ||
      Array.isArray(override) ||
      !['circle', 'square', 'ellipse', 'strip'].includes(override.shape ?? '') ||
      !['width', 'depth'].every(
        (dimensionField) =>
          typeof (override as any)[dimensionField] == 'number' && Number.isFinite((override as any)[dimensionField]),
      ) ||
      ['rotation', 'softness'].some(
        (numericField) =>
          (override as any)[numericField] !== undefined &&
          (typeof (override as any)[numericField] != 'number' || !Number.isFinite((override as any)[numericField])),
      ) ||
      ['offsetX', 'offsetZ'].some(
        (offsetField) =>
          (override as any)[offsetField] !== undefined &&
          (typeof (override as any)[offsetField] != 'number' || !Number.isFinite((override as any)[offsetField])),
      ) ||
      ['heightAbove', 'heightBelow', 'heightMin', 'heightMax'].some(
        (heightField) =>
          (override as any)[heightField] !== undefined &&
          (typeof (override as any)[heightField] != 'number' || !Number.isFinite((override as any)[heightField])),
      ) ||
      (override.heightMin !== undefined &&
        override.heightMax !== undefined &&
        override.heightMin > override.heightMax) ||
      (override.moveCenterEnabled !== undefined && typeof override.moveCenterEnabled != 'boolean')
    )
      continue
    const rotationDeg = override.rotation ?? 0,
      clampedWidth = clamp(override.width, 0.5, 20)
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
    }
  }
  return normalizedOverrides
}
export function findAncestorField(startObject: any, fieldName: any) {
  for (let ancestorObject = startObject; ancestorObject; ancestorObject = ancestorObject.parent)
    if (ancestorObject.userData?.[fieldName] !== undefined) return ancestorObject.userData[fieldName]
}
/**
 * 该受光体要不要注入「上方家具顶面」的烘焙阴影采样。
 *
 * 墙面只吃地面接触图里的低带（踢脚/墙根暗部），不吃顶面 LUT —— 那张表是给桌面、床面
 * 准备的，拿它去查 1.2m 以上的墙面只会把衣柜顶的影子糊到整面墙上。
 */
export function usesSurfaceCaptureLookup(
  materialKind: string,
  sourceMaterial: { userData?: { plan2SurfaceContact?: boolean } },
) {
  return materialKind !== 'wall' && sourceMaterial.userData?.plan2SurfaceContact !== false
}
export function isRegionReceiverMaterial(materialCandidate: any) {
  return (
    materialCandidate &&
    (materialCandidate.userData?.hbDedicatedWall ||
      materialCandidate.isMeshStandardMaterial ||
      materialCandidate.isMeshPhysicalMaterial ||
      materialCandidate.isMeshPhongMaterial ||
      materialCandidate.isMeshLambertMaterial)
  )
}
export function isVisibleWithin(startNode: any, rootNode: any) {
  for (let currentNode = startNode; currentNode; currentNode = currentNode.parent) {
    if (currentNode.visible === false) return false
    if (currentNode === rootNode) return true
  }
  return false
}
export function classifyReceiverKind(candidateMesh: any) {
  const declaredKind = findAncestorField(candidateMesh, 'regionReceiverKind')
  if (REGION_KINDS.includes(declaredKind)) return declaredKind
  const modelLayer = findAncestorField(candidateMesh, 'modelLayer')
  if (modelLayer === 'items' || modelLayer === 'lights') return 'furniture'
  if (modelLayer === 'walls' || /wall/i.test(candidateMesh.name || '')) return 'wall'
  if (/floor/i.test(candidateMesh.name || '')) return 'floor'
  const geometry = candidateMesh.geometry
  if (geometry) {
    geometry.boundingBox || geometry.computeBoundingBox?.()
    const boundingBox = geometry.boundingBox
    if (boundingBox) {
      const sortedExtent = [
        boundingBox.max.x - boundingBox.min.x,
        boundingBox.max.y - boundingBox.min.y,
        boundingBox.max.z - boundingBox.min.z,
      ].sort((sizeA, sizeB) => sizeA - sizeB)
      if (!modelLayer && sortedExtent[0] < 0.18 && sortedExtent[1] > 1.5) return 'floor'
    }
  }
  return modelLayer ? 'furniture' : 'wall'
}
export function setVector4IfChanged(
  targetVector: any,
  xComponent: any,
  yComponent: any,
  zComponent: any,
  wComponent: any,
) {
  const didChange =
    targetVector.x !== xComponent ||
    targetVector.y !== yComponent ||
    targetVector.z !== zComponent ||
    targetVector.w !== wComponent
  return (targetVector.set(xComponent, yComponent, zComponent, wComponent), didChange)
}
export function buildShaderChunk(volumeGroup: any) {
  return (
    '\n#define PLAN2_LIGHT_CAPACITY ' +
    volumeGroup.capacity +
    '\n#define PLAN2_TEXTURE_DATA ' +
    (volumeGroup.textureMode ? 1 : 0) +
    '\n#define PLAN2_SPATIAL_GRID ' +
    (volumeGroup.gridSupported ? 1 : 0) +
    '\nuniform int plan2LightCount;\n#if PLAN2_SPATIAL_GRID\nuniform sampler2D plan2Grid;\nuniform vec4 plan2GridBounds;\nuniform bool plan2GridEnabled;\n#endif\nuniform float plan2Gain;\nuniform float plan2ShadowPresentation;\nuniform float plan2AlbedoLift;\nuniform float plan2SunShadowStrength;\nuniform float plan2SunShadowScale;\nuniform vec3 plan2SunDirection;\nuniform mat4 plan2MotionToLayout;\nvarying vec3 vPlan2WorldPosition;\n#if PLAN2_TEXTURE_DATA\nuniform sampler2D plan2LightData;\nvec4 plan2ReadData(int slot, float column) {\n  return texture2D(plan2LightData, vec2((column + 0.5) / 4.0, (float(slot) + 0.5) / float(PLAN2_LIGHT_CAPACITY)));\n}\n#else\nuniform vec4 plan2Centers[PLAN2_LIGHT_CAPACITY];\nuniform vec4 plan2Extents[PLAN2_LIGHT_CAPACITY];\nuniform vec4 plan2Colors[PLAN2_LIGHT_CAPACITY];\nuniform vec4 plan2Axes[PLAN2_LIGHT_CAPACITY];\n#endif\nvec3 plan2SurfaceLight(vec3 worldPoint, vec3 layoutNormal) {\n  worldPoint = (plan2MotionToLayout * vec4(worldPoint, 1.0)).xyz;\n  // 只有立面吃「朝向灯」的权重：地板/墙顶的水平法线扫过全部灯位，按灯位加权等于\n  // 把灯池挪走。`1 - |n.y|` 是那个开关。\n  float plan2VerticalWeight = 1.0 - clamp(abs(layoutNormal.y), 0.0, 1.0);\n  vec3 weightedColor = vec3(0.0);\n  float totalWeight = 0.0;\n  float coverage = 0.0;\n  int candidates = plan2LightCount;\n  #if PLAN2_SPATIAL_GRID\n    float row = 0.0;\n    if (plan2GridEnabled) {\n      vec2 cell = floor((worldPoint.xz - plan2GridBounds.xy) * plan2GridBounds.zw);\n      if (any(lessThan(cell, vec2(0.0))) || any(greaterThanEqual(cell, vec2(' +
    REGION_GRID_SIZE +
    '.0)))) return vec3(0.0);\n      row = (cell.y * ' +
    REGION_GRID_SIZE +
    '.0 + cell.x + .5) / ' +
    REGION_GRID_SIZE * REGION_GRID_SIZE +
    '.0;\n      candidates = int(texture2D(plan2Grid, vec2(.5 / float(PLAN2_LIGHT_CAPACITY + 1), row)).r + .5);\n    }\n  #endif\n  for (int candidate = 0; candidate < PLAN2_LIGHT_CAPACITY; candidate++) {\n    if (candidate >= candidates) break;\n    int slot = candidate;\n    #if PLAN2_SPATIAL_GRID\n      if (plan2GridEnabled) slot = int(texture2D(plan2Grid, vec2((float(candidate) + 1.5) / float(PLAN2_LIGHT_CAPACITY + 1), row)).r + .5);\n    #endif\n    #if PLAN2_TEXTURE_DATA\n      vec4 center = plan2ReadData(slot, 0.0);\n    #else\n      vec4 center = plan2Centers[slot];\n    #endif\n    if (center.w < 0.00001) continue;\n    #if PLAN2_TEXTURE_DATA\n      vec4 extent = plan2ReadData(slot, 1.0);\n      vec4 axis = plan2ReadData(slot, 3.0);\n    #else\n      vec4 extent = plan2Extents[slot];\n      vec4 axis = plan2Axes[slot];\n    #endif\n    vec3 offset = worldPoint - center.xyz;\n    vec3 localPoint = vec3(dot(offset.xz, axis.xy), offset.y, dot(offset.xz, vec2(-axis.y, axis.x)));\n    float verticalDistance = max(abs(localPoint.y) - extent.y, 0.0);\n    if (verticalDistance >= extent.w) continue;\n    float fadeStart = axis.w > 0.0 ? 1.0 - clamp(axis.w, 0.05, 1.0) : 0.0;\n    float squareFalloff = 1.0;\n    float radialDistance;\n    if (axis.z > 3.5) {\n      // Retain straight zero-light edges, but fade each axis independently.\n      // Using max(x,z) for brightness changes derivatives on the diagonals,\n      // making four visible triangular wedges. max is only a bounds check.\n      vec2 fromCenter = abs(localPoint.xz) / max(extent.xz, vec2(0.001));\n      radialDistance = max(fromCenter.x, fromCenter.y);\n      vec2 edgeFade = vec2(1.0) - smoothstep(vec2(fadeStart), vec2(1.0), fromCenter);\n      squareFalloff = edgeFade.x * edgeFade.y;\n    } else if (axis.z > 2.5) {\n      // Edited strips are rounded rectangles with their zero-light boundary\n      // exactly at the requested width/depth, including both rounded ends.\n      float radius = max(min(extent.x, extent.z), 0.001);\n      vec2 fromCore = max(abs(localPoint.xz) - (extent.xz - vec2(radius)), vec2(0.0));\n      radialDistance = length(fromCore) / radius;\n    } else if (axis.z > 0.5 && axis.z < 1.5) {\n      // A strip is a line source. Brightness falls away from the line, rather\n      // than remaining constant throughout a wide rectangular room volume.\n      vec2 fromSegment = vec2(max(abs(localPoint.x) - extent.x, 0.0), localPoint.z);\n      radialDistance = length(fromSegment) / max(extent.z, 0.001);\n    } else {\n      radialDistance = length(localPoint.xz / max(extent.xz, vec2(0.001)));\n    }\n    if (radialDistance >= 1.0) continue;\n    float horizontalFalloff = axis.z > 3.5 ? squareFalloff : 1.0 - smoothstep(fadeStart, 1.0, radialDistance);\n    // 立面朝向灯的一侧更亮：只对水平法线生效，且下限 0.60 —— 背对灯的一面仍然有光\n    // （柔光里墙面不能被算成黑的），但与正对灯的一面拉开 ~1.7:1。同一面墙内部的空间\n    // 梯度（射灯锥）完全不动。\n    float plan2FaceWeight = 1.0;\n    if (plan2VerticalWeight > 0.0001) {\n      vec2 plan2ToLamp = center.xz - worldPoint.xz;\n      float plan2ToLampLength = length(plan2ToLamp);\n      if (plan2ToLampLength > 0.0001) {\n        plan2FaceWeight = mix(1.0, mix(0.60, 1.0, clamp(dot(normalize(layoutNormal.xz), plan2ToLamp / plan2ToLampLength), 0.0, 1.0)), plan2VerticalWeight);\n      }\n    }\n    float influence = horizontalFalloff\n      * (1.0 - smoothstep(0.0, extent.w, verticalDistance)) * clamp(center.w, 0.0, 1.5) * plan2FaceWeight;\n    #if PLAN2_TEXTURE_DATA\n      vec3 lightColor = plan2ReadData(slot, 2.0).rgb;\n    #else\n      vec3 lightColor = plan2Colors[slot].rgb;\n    #endif\n    weightedColor += lightColor * influence;\n    totalWeight += influence;\n    coverage += (1.0 - coverage) * influence;\n  }\n  // Smooth bounded union: max() produced a derivative crease wherever two\n  // lamps exchanged dominance. This preserves single-lamp falloff and blends\n  // overlaps continuously, with coverage capped at one rather than added HDR.\n  return weightedColor / max(totalWeight, 0.00001) * coverage;\n}\n'
  )
}
export function sampleRegionVolumes(
  volumes: any,
  worldPoint: any,
  gain = 1,
  layoutNormal?: { x: number; y: number; z: number },
) {
  let coverage = 0,
    totalWeight = 0
  const accumulatedColor = [0, 0, 0],
    verticalWeight = layoutNormal ? 1 - clamp(Math.abs(layoutNormal.y), 0, 1) : 0,
    horizontalNormalLength = layoutNormal ? Math.hypot(layoutNormal.x, layoutNormal.z) : 0
  for (const volume of volumes) {
    const { center: center, extent: extent, color: color, axis: axis } = volume
    if (center.w <= 0) continue
    const offsetX = worldPoint.x - center.x,
      offsetY = worldPoint.y - center.y,
      offsetZ = worldPoint.z - center.z,
      localX = offsetX * axis.x + offsetZ * axis.y,
      localZ = -offsetX * axis.y + offsetZ * axis.x,
      cornerRadius = Math.max(Math.min(extent.x, extent.z), 0.001),
      radialDistance =
        axis.z > 3.5
          ? Math.max(Math.abs(localX) / Math.max(extent.x, 0.001), Math.abs(localZ) / Math.max(extent.z, 0.001))
          : axis.z > 2.5
            ? Math.hypot(
                Math.max(Math.abs(localX) - (extent.x - cornerRadius), 0),
                Math.max(Math.abs(localZ) - (extent.z - cornerRadius), 0),
              ) / cornerRadius
            : axis.z > 0.5 && axis.z < 1.5
              ? Math.hypot(Math.max(Math.abs(localX) - extent.x, 0), localZ) / Math.max(extent.z, 0.001)
              : Math.hypot(localX / Math.max(extent.x, 0.001), localZ / Math.max(extent.z, 0.001)),
      fadeStart = axis.w > 0 ? 1 - clamp(axis.w, 0.05, 1) : 0,
      normalizedDistance = clamp((radialDistance - fadeStart) / (1 - fadeStart), 0, 1),
      verticalRatio = clamp(Math.max(Math.abs(offsetY) - extent.y, 0) / extent.w, 0, 1)
    let horizontalFalloff = 1 - normalizedDistance * normalizedDistance * (3 - 2 * normalizedDistance)
    if (axis.z > 3.5) {
      const xEdgeRatio = clamp((Math.abs(localX) / Math.max(extent.x, 0.001) - fadeStart) / (1 - fadeStart), 0, 1),
        zEdgeRatio = clamp((Math.abs(localZ) / Math.max(extent.z, 0.001) - fadeStart) / (1 - fadeStart), 0, 1)
      horizontalFalloff =
        (1 - xEdgeRatio * xEdgeRatio * (3 - 2 * xEdgeRatio)) * (1 - zEdgeRatio * zEdgeRatio * (3 - 2 * zEdgeRatio))
    }
    // 立面朝向权重 —— 与 `plan2SurfaceLight` 里的 shader 版本逐字对应，
    // 否则 `sample()` 读数和画面上的灯池会是两回事。
    let faceWeight = 1
    if (verticalWeight > 0.0001 && horizontalNormalLength > 0.0001) {
      const toLampX = center.x - worldPoint.x,
        toLampZ = center.z - worldPoint.z,
        toLampLength = Math.hypot(toLampX, toLampZ)
      if (toLampLength > 0.0001) {
        const facing = clamp(
          ((layoutNormal as { x: number; z: number }).x * toLampX + (layoutNormal as { z: number }).z * toLampZ) /
            (horizontalNormalLength * toLampLength),
          0,
          1,
        )
        faceWeight = 1 + (0.6 + 0.4 * facing - 1) * verticalWeight
      }
    }
    const influence =
      horizontalFalloff *
      (1 - verticalRatio * verticalRatio * (3 - 2 * verticalRatio)) *
      clamp(center.w, 0, 1.5) *
      faceWeight
    ;(totalWeight += influence),
      (coverage += (1 - coverage) * influence),
      (accumulatedColor[0] += color.x * influence),
      (accumulatedColor[1] += color.y * influence),
      (accumulatedColor[2] += color.z * influence)
  }
  return accumulatedColor.map((channelValue) => (totalWeight > 0 ? (channelValue / totalWeight) * coverage * gain : 0))
}
