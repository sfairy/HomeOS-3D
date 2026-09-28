import { clampNumber, coercedFiniteNumberOr } from "../../utils/numbers.js";
import { isFrontendDebugMode } from "../../utils/debug-log.js";
import { sanitizeRegionOverrides, ensureLightGroup, getRegionMaterial, registerLight, inspect } from "./region-light-passes.js";
import { findUserDataInAncestors, isVisibleWithin } from "../scene-tree-utils.js";

// 本地沿用短名 clamp：它在本文件的 JS 代码里出现二十余处，而下方 GLSL 源码字符串里还有**同名的
const clamp = clampNumber;

// 区域灯所在的自定义层号：studio-app.js 的 region-light 分支与灯控制器都用它，
export const REGION_LIGHT_LAYER = 30;
// 接收面分类：floor / wall / furniture。同一盏灯对不同类别用不同的增益与体积高度，
const REGION_KINDS = ["floor", "wall", "furniture"];
// uniform 数组长度向上取到 16 的整数倍：GPU 对 uniform 数组的布局更友好，
const alignTo16 = (sizeValue: any) => Math.max(16, Math.ceil(sizeValue / 16) * 16);
/**
 * 区域灯的稳定键：把楼层 ID 与灯 ID 编码成一个字符串，形如 `["3F","abc-uuid"]`。
 */
const regionLightKey = (floorKeyId: any, lightKeyId: any) =>
  JSON.stringify([String(floorKeyId), String(lightKeyId)]);
/**
 * 校验一个字符串是不是本模块生成的合法区域灯键。
 */
function isRegionLightKey(keyString: any) {
  try {
    const parsedKey = JSON.parse(keyString);
    return (
      Array.isArray(parsedKey) &&
      parsedKey.length === 2 &&
      parsedKey.every(keyPart => typeof keyPart == "string") &&
      regionLightKey(...(parsedKey as [string, string])) === keyString
    );
  } catch {
    return false;
  }
}

function isRegionReceiverMaterial(materialCandidate: any) {
  return (
    materialCandidate &&
    (materialCandidate.userData?.hbDedicatedWall ||
      materialCandidate.isMeshStandardMaterial ||
      materialCandidate.isMeshPhysicalMaterial ||
      materialCandidate.isMeshPhongMaterial ||
      materialCandidate.isMeshLambertMaterial)
  );
}
function classifyReceiverKind(candidateMesh: any) {
  const declaredKind = findUserDataInAncestors(candidateMesh, "regionReceiverKind");
  if (REGION_KINDS.includes(declaredKind)) {
    return declaredKind;
  }
  const modelLayer = findUserDataInAncestors(candidateMesh, "modelLayer");
  if (modelLayer === "items" || modelLayer === "lights") {
    return "furniture";
  }
  if (modelLayer === "walls" || /wall/i.test(candidateMesh.name || "")) {
    return "wall";
  }
  if (/floor/i.test(candidateMesh.name || "")) {
    return "floor";
  }
  const geometry = candidateMesh.geometry;
  if (geometry) {
    if (!geometry.boundingBox) {
      geometry.computeBoundingBox?.();
    }
    const boundingBox = geometry.boundingBox;
    if (boundingBox) {
      const sortedExtent = [
        boundingBox.max.x - boundingBox.min.x,
        boundingBox.max.y - boundingBox.min.y,
        boundingBox.max.z - boundingBox.min.z
      ].sort((sizeA, sizeB) => sizeA - sizeB);
      if (!modelLayer && sortedExtent[0] < 0.18 && sortedExtent[1] > 1.5) {
        return "floor";
      }
    }
  }
  if (modelLayer) {
    return "furniture";
  } else {
    return "wall";
  }
}
/**
 * 比较并按需写入 Vector4，返回是否发生变化。
 */
function setVector4IfChanged(targetVector: any, xComponent: any, yComponent: any, zComponent: any, wComponent: any) {
  const didChange =
    targetVector.x !== xComponent ||
    targetVector.y !== yComponent ||
    targetVector.z !== zComponent ||
    targetVector.w !== wComponent;
  targetVector.set(xComponent, yComponent, zComponent, wComponent);
  return didChange;
}
function buildShaderChunk(volumeGroup: any) {
  return (
    "\n#define PLAN2_LIGHT_CAPACITY " +
    volumeGroup.capacity +
    "\n#define PLAN2_TEXTURE_DATA " +
    (volumeGroup.textureMode ? 1 : 0) +
    "\nuniform int plan2LightCount;\nuniform float plan2Gain;\nuniform float plan2SunShadowStrength;\nuniform mat4 plan2MotionToLayout;\nvarying vec3 vPlan2WorldPosition;\n#if PLAN2_TEXTURE_DATA\nuniform sampler2D plan2LightData;\nvec4 plan2ReadData(int slot, float column) {\n  return texture2D(plan2LightData, vec2((column + 0.5) / 4.0, (float(slot) + 0.5) / float(PLAN2_LIGHT_CAPACITY)));\n}\n#else\nuniform vec4 plan2Centers[PLAN2_LIGHT_CAPACITY];\nuniform vec4 plan2Extents[PLAN2_LIGHT_CAPACITY];\nuniform vec4 plan2Colors[PLAN2_LIGHT_CAPACITY];\nuniform vec4 plan2Axes[PLAN2_LIGHT_CAPACITY];\n#endif\nvec3 plan2SurfaceLight(vec3 worldPoint) {\n  worldPoint = (plan2MotionToLayout * vec4(worldPoint, 1.0)).xyz;\n  vec3 weightedColor = vec3(0.0);\n  float totalWeight = 0.0;\n  float coverage = 0.0;\n  for (int slot = 0; slot < PLAN2_LIGHT_CAPACITY; slot++) {\n    if (slot >= plan2LightCount) break;\n    #if PLAN2_TEXTURE_DATA\n      vec4 center = plan2ReadData(slot, 0.0);\n    #else\n      vec4 center = plan2Centers[slot];\n    #endif\n    if (center.w < 0.00001) continue;\n    #if PLAN2_TEXTURE_DATA\n      vec4 extent = plan2ReadData(slot, 1.0);\n      vec4 axis = plan2ReadData(slot, 3.0);\n    #else\n      vec4 extent = plan2Extents[slot];\n      vec4 axis = plan2Axes[slot];\n    #endif\n    vec3 offset = worldPoint - center.xyz;\n    vec3 localPoint = vec3(dot(offset.xz, axis.xy), offset.y, dot(offset.xz, vec2(-axis.y, axis.x)));\n    float verticalDistance = max(abs(localPoint.y) - extent.y, 0.0);\n    if (verticalDistance >= extent.w) continue;\n    float fadeStart = axis.z > 1.5 ? 1.0 - clamp(axis.w, 0.05, 1.0) : 0.0;\n    float squareFalloff = 1.0;\n    float radialDistance;\n    if (axis.z > 3.5) {\n      // Retain straight zero-light edges, but fade each axis independently.\n      // Using max(x,z) for brightness changes derivatives on the diagonals,\n      // making four visible triangular wedges. max is only a bounds check.\n      vec2 fromCenter = abs(localPoint.xz) / max(extent.xz, vec2(0.001));\n      radialDistance = max(fromCenter.x, fromCenter.y);\n      vec2 edgeFade = vec2(1.0) - smoothstep(vec2(fadeStart), vec2(1.0), fromCenter);\n      squareFalloff = edgeFade.x * edgeFade.y;\n    } else if (axis.z > 2.5) {\n      // Edited strips are rounded rectangles with their zero-light boundary\n      // exactly at the requested width/depth, including both rounded ends.\n      float radius = max(min(extent.x, extent.z), 0.001);\n      vec2 fromCore = max(abs(localPoint.xz) - (extent.xz - vec2(radius)), vec2(0.0));\n      radialDistance = length(fromCore) / radius;\n    } else if (axis.z > 0.5 && axis.z < 1.5) {\n      // A strip is a line source. Brightness falls away from the line, rather\n      // than remaining constant throughout a wide rectangular room volume.\n      vec2 fromSegment = vec2(max(abs(localPoint.x) - extent.x, 0.0), localPoint.z);\n      radialDistance = length(fromSegment) / max(extent.z, 0.001);\n    } else {\n      radialDistance = length(localPoint.xz / max(extent.xz, vec2(0.001)));\n    }\n    if (radialDistance >= 1.0) continue;\n    float horizontalFalloff = axis.z > 3.5 ? squareFalloff : 1.0 - smoothstep(fadeStart, 1.0, radialDistance);\n    float influence = horizontalFalloff\n      * (1.0 - smoothstep(0.0, extent.w, verticalDistance)) * clamp(center.w, 0.0, 1.5);\n    #if PLAN2_TEXTURE_DATA\n      vec3 lightColor = plan2ReadData(slot, 2.0).rgb;\n    #else\n      vec3 lightColor = plan2Colors[slot].rgb;\n    #endif\n    weightedColor += lightColor * influence;\n    totalWeight += influence;\n    coverage += (1.0 - coverage) * influence;\n  }\n  // Smooth bounded union: max() produced a derivative crease wherever two\n  // lamps exchanged dominance. This preserves single-lamp falloff and blends\n  // overlaps continuously, with coverage capped at one rather than added HDR.\n  return weightedColor / max(totalWeight, 0.00001) * coverage;\n}\n"
  );
}
/**
 * 在 CPU 侧求某点被一组光照体积照亮的颜色（着色器 plan2SurfaceLight 的等价实现）。
 */
function sampleRegionVolumes(volumes: any, worldPoint: any, gain: any = 1) {
  let coverage = 0;
  let totalWeight = 0;
  const accumulatedColor = [0, 0, 0];
  for (const volume of volumes) {
    const { center: center, extent: extent, color: color, axis: axis } = volume;
    if (center.w <= 0) {
      continue;
    }
    const offsetX = worldPoint.x - center.x;
    const offsetY = worldPoint.y - center.y;
    const offsetZ = worldPoint.z - center.z;
    // 把偏移投到体积的局部水平轴上：localX 沿轴线（条灯的长边方向），localZ 垂直轴线。
    const localX = offsetX * axis.x + offsetZ * axis.y;
    const localZ = -offsetX * axis.y + offsetZ * axis.x;
    // 圆角半径取短边，用于 axis.z > 2.5 的圆角矩形（条灯）分支。
    const cornerRadius = Math.max(Math.min(extent.x, extent.z), 0.001);
    const radialDistance =
      axis.z > 3.5
        ? Math.max(
            Math.abs(localX) / Math.max(extent.x, 0.001),
            Math.abs(localZ) / Math.max(extent.z, 0.001)
          )
        : axis.z > 2.5
          ? Math.hypot(
              Math.max(Math.abs(localX) - (extent.x - cornerRadius), 0),
              Math.max(Math.abs(localZ) - (extent.z - cornerRadius), 0)
            ) / cornerRadius
          : axis.z > 0.5 && axis.z < 1.5
            ? Math.hypot(Math.max(Math.abs(localX) - extent.x, 0), localZ) /
              Math.max(extent.z, 0.001)
            : Math.hypot(localX / Math.max(extent.x, 0.001), localZ / Math.max(extent.z, 0.001));
    const fadeStart = axis.z > 1.5 ? 1 - clamp(axis.w, 0.05, 1) : 0;
    const normalizedDistance = clamp((radialDistance - fadeStart) / (1 - fadeStart), 0, 1);
    // 垂直衰减：超出半高 extent.y 的部分按 extent.w 的厚度过渡，归一化到 [0,1]。
    const verticalRatio = clamp(Math.max(Math.abs(offsetY) - extent.y, 0) / extent.w, 0, 1);
    // smoothstep 的多项式展开：1 - t²(3 - 2t)，与着色器里的 smoothstep 完全一致。
    let horizontalFalloff =
      1 - normalizedDistance * normalizedDistance * (3 - normalizedDistance * 2);
    // axis.z > 3.5（方形）：两个轴独立柔化。用「各轴独立」而不是 max(x,z)，
    if (axis.z > 3.5) {
      const xEdgeRatio = clamp(
        (Math.abs(localX) / Math.max(extent.x, 0.001) - fadeStart) / (1 - fadeStart),
        0,
        1
      );
      const zEdgeRatio = clamp(
        (Math.abs(localZ) / Math.max(extent.z, 0.001) - fadeStart) / (1 - fadeStart),
        0,
        1
      );
      horizontalFalloff =
        (1 - xEdgeRatio * xEdgeRatio * (3 - xEdgeRatio * 2)) *
        (1 - zEdgeRatio * zEdgeRatio * (3 - zEdgeRatio * 2));
    }
    const influence =
      horizontalFalloff *
      (1 - verticalRatio * verticalRatio * (3 - verticalRatio * 2)) *
      clamp(center.w, 0, 1.5);
    totalWeight += influence;
    // 有界并集：新体积只在「尚未被覆盖」的部分叠加，覆盖度天然封顶在 1，
    coverage += (1 - coverage) * influence;
    accumulatedColor[0] += color.x * influence;
    accumulatedColor[1] += color.y * influence;
    accumulatedColor[2] += color.z * influence;
  }
  return accumulatedColor.map(channelValue =>
    totalWeight > 0 ? (channelValue / totalWeight) * coverage * gain : 0
  );
}
/**
 * 创建区域灯控制器（一个场景一份；内部的状态与材质克隆缓存跨帧复用）。
 */
export function createRegionLightController({
  THREE: THREE,
  renderer: renderer,
  scene: scene,
  getRoot: getRoot,
  contactShadows: contactShadows = null,
  requestFrame: requestFrame = () => {}
}: any) {
  // 被外提到同目录的新模块（见其文件头）：惰性上下文，调用点传 regionLightContext()。
  const regionLightContext = () => ({
    isRegionLightKey,
    clamp,
    groupsByKey,
    viewToWorldUniform,
    THREE,
    contactShadows,
    renderer,
    alignTo16,
    RangeError,
    sourceMaterialByClone,
    clonesByMaterial,
    isRegionReceiverMaterial,
    floorBrightnessUniform,
    buildShaderChunk,
    stats,
    isDisposed,
    registrationsByLight,
    shouldRescanStructure,
    REGION_LIGHT_LAYER,
    settings,
    getOverrides,
    previewKeys,
    listRegions,
    registrationsByFloorId,
    isVisibleWithin,
    rootObject,
  });

  const registrationsByLight = new Map();
  const listenedNodes = new Set<any>();
  const assignmentsByMesh = new Map();
  // 克隆材质 → 原始材质：用于还原（导出 / 释放时把场景恢复成原样）。
  const sourceMaterialByClone = new WeakMap();
  // 原始材质 → (变体键 → 克隆材质)：同一份材质在不同楼层 / 分类 / 变体下各有一份克隆，
  const clonesByMaterial = new Map();
  const groupsByKey = new Map();
  const retainedRoots = new Set<any>();
  const lightWorldPosition = new THREE.Vector3();
  const floorRootPosition = new THREE.Vector3();
  const sampleWorldPoint = new THREE.Vector3();
  const lightWorldMatrix = new THREE.Matrix4();
  let motionTransformProvider: any = null;
  const viewToWorldUniform = {
    value: new THREE.Matrix4()
  };
  const floorBrightnessUniform = {
    value: 1
  };
  const volumeInputsScratch: any[] = [];
  const settings: any = {
    // 全局总增益。3 是让区域灯的推导亮度与旧版逐盏实时光照对齐的标定值，
    gain: 3,
    floorGain: 1,
    // 墙面略暗（0.9）：墙是大面积浅色，按地面同等增益会显得发灰、失去层次。
    wallGain: 0.9,
    furnitureGain: 1,
    rangeScale: 0.8,
    // 区域灯仍复用场景里唯一投射阴影的平行光（太阳）的阴影图，
    sunShadowStrength: 0.6
  };
  const stats = {
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
    disposed: false
  };
  let rootObject: any = null;
  let shouldRescanStructure = true;
  let isDisposed = false;
  let nativeLights: any[] = [];
  let registrationsByFloorId: Map<any, any> = new Map();
  let overrides = Object.create(null);
  let previewKeys: any = null;
  let isMotionEnabled = false;
  let isMotionInstant = false;
  // 退出运动模式后的「亮度淡回」起点时间戳（280ms）；null 表示当前不需要淡回。
  let motionFadeStartMs: any = null;
  // 结构脏标记：任何「场景里多/少了一个节点」的事件都会把它置位，
  const markStructureDirty = () => {
    shouldRescanStructure = true;
  };
  const originalOnBeforeRender = scene.onBeforeRender;
  /**
   * 取（必要时创建）某个「楼层 + 接收面分类」的灯组，并把容量对齐到 16 的倍数。
   */
  
  /**
   * 取（必要时克隆并注入）区域灯材质。
   */
  
  /**
   * 重新扫描整个场景结构（材质替换、分组容量、监听器、统计的唯一重算入口）。
   */
  function rebuildStructure() {
    stats.structureScans += 1;
    const currentNodes = new Set<any>();
    const meshList: any[] = [];
    const registeredLights = new Set<any>();
    rootObject?.traverse((node: any) => {
      currentNodes.add(node);
      if (registrationsByLight.has(node)) {
        registeredLights.add(node);
      }
      if (node.isMesh) {
        meshList.push(node);
      }
    });
    for (const staleNode of listenedNodes) {
      if (!currentNodes.has(staleNode)) {
        staleNode.removeEventListener("childadded", markStructureDirty);
        staleNode.removeEventListener("childremoved", markStructureDirty);
        listenedNodes.delete(staleNode);
      }
    }
    for (const newNode of currentNodes) {
      if (!listenedNodes.has(newNode)) {
        newNode.addEventListener("childadded", markStructureDirty);
        newNode.addEventListener("childremoved", markStructureDirty);
        listenedNodes.add(newNode);
      }
    }
    for (const [registeredLight, registrationRecord] of registrationsByLight) {
      if (!registeredLights.has(registeredLight)) {
        // 灯被移出场景了：把图层掩码还原，让它在别处仍按原生灯工作，
        registeredLight.layers.mask = registrationRecord.originalLayers;
        registrationsByLight.delete(registeredLight);
      }
    }
    registrationsByFloorId = new Map();
    for (const registration of registrationsByLight.values()) {
      registration.floorId = String(
        registration.light.userData?.regionFloorId ??
          registration.light.userData?.lightFloorId ??
          findUserDataInAncestors(registration.light, "regionFloorId") ??
          findUserDataInAncestors(registration.light, "floorId") ??
          "default"
      );
      registration.id = String(registration.item.id ?? registration.light.uuid);
      registration.key = regionLightKey(registration.floorId, registration.id);
      let floorRoot = rootObject;
      // 向上找第一个带楼层字段的祖先作为「楼层根」：灯的高度是相对楼层算的
      for (
        let ancestor = registration.light.parent;
        ancestor && ancestor !== rootObject;
        ancestor = ancestor.parent
      ) {
        if (
          ancestor.userData?.regionFloorId !== undefined ||
          ancestor.userData?.floorId !== undefined
        ) {
          floorRoot = ancestor;
          break;
        }
      }
      registration.floorRoot = floorRoot;
      const floorRecords = registrationsByFloorId.get(registration.floorId) || [];
      floorRecords.push(registration);
      registrationsByFloorId.set(registration.floorId, floorRecords);
    }
    const defaultFloorId =
      registrationsByFloorId.size === 1 ? registrationsByFloorId.keys().next().value : "default";
    if (!registrationsByFloorId.size) {
      registrationsByFloorId.set(defaultFloorId, []);
    }
    for (const [entryFloorId, floorRegistrations] of registrationsByFloorId) {
      for (const groupKindName of REGION_KINDS) {
        ensureLightGroup(entryFloorId, groupKindName, floorRegistrations.length, regionLightContext());
      }
    }
    const liveMaterials = new Set<any>();
    const swappedMeshes = new Set<any>();
    for (const mesh of meshList) {
      // 辅助物件（背景、网格线、轮廓、灯的示意外观）不接收区域光：
      if (
        ["background", "grid", "outline", "light-source-preview"].includes(
          findUserDataInAncestors(mesh, "exportRole")
        )
      ) {
        continue;
      }
      const meshFloorId = String(
        findUserDataInAncestors(mesh, "regionFloorId") ??
          findUserDataInAncestors(mesh, "floorId") ??
          defaultFloorId
      );
      if (!registrationsByFloorId.has(meshFloorId)) {
        // 网格的楼层没有灯：仍然要建 0 容量的灯组，让这些接收面也有 uniform
        registrationsByFloorId.set(meshFloorId, []);
        for (const emptyKindName of REGION_KINDS) {
          ensureLightGroup(meshFloorId, emptyKindName, 0, regionLightContext());
        }
      }
      const receiverKind = classifyReceiverKind(mesh);
      const material = mesh.material;
      // 外部模型需要保留自己的 PBR 细节，用这个字段声明后跳过「廉价光照」分支。
      const shouldPreserveDetailed = findUserDataInAncestors(mesh, "preserveDetailedSurface") === true;
      const isFloorReceiver = findUserDataInAncestors(mesh, "regionReceiverKind") === "floor";
      const assignedMaterial = Array.isArray(material)
        ? material.map((sourceMaterialItem: any) =>
            getRegionMaterial(
              sourceMaterialItem,
              meshFloorId,
              receiverKind,
              liveMaterials,
              shouldPreserveDetailed,
              isFloorReceiver
            , regionLightContext())
          )
        : getRegionMaterial(
            material,
            meshFloorId,
            receiverKind,
            liveMaterials,
            shouldPreserveDetailed,
            isFloorReceiver
          , regionLightContext());
      // 只在真的换了材质时才写回：receiverKind / 楼层变了但克隆恰好相同的情况
      if (
        Array.isArray(material)
          ? assignedMaterial.some(
              (swappedMaterial: any, materialIndex: any) => swappedMaterial !== material[materialIndex]
            )
          : assignedMaterial !== material
      ) {
        mesh.material = assignedMaterial;
      }
      if (
        Array.isArray(assignedMaterial)
          ? assignedMaterial.some(regionMaterial => sourceMaterialByClone.has(regionMaterial))
          : sourceMaterialByClone.has(assignedMaterial)
      ) {
        swappedMeshes.add(mesh);
        assignmentsByMesh.set(mesh, {
          assigned: mesh.material
        });
      }
    }
    const stillAssignedMeshes = new Set<any>();
    // retainedRoots 里的子树可能是「被楼层缓存保留、没挂回主场景」的：
    for (const trackedRoot of retainedRoots) {
      trackedRoot.traverse((traversedNode: any) => {
        if (assignmentsByMesh.has(traversedNode)) {
          stillAssignedMeshes.add(traversedNode);
          for (const meshMaterial of Array.isArray(traversedNode.material)
            ? traversedNode.material
            : [traversedNode.material]) {
            const environmentMaterial = meshMaterial?.environmentSourceMaterial || meshMaterial;
            if (sourceMaterialByClone.has(environmentMaterial)) {
              liveMaterials.add(environmentMaterial);
            }
          }
        }
      });
    }
    for (const [assignedMesh, meshAssignment] of assignmentsByMesh) {
      if (!swappedMeshes.has(assignedMesh) && !stillAssignedMeshes.has(assignedMesh)) {
        restoreMeshMaterial(assignedMesh, meshAssignment);
        assignmentsByMesh.delete(assignedMesh);
      }
    }
    for (const [cloneSourceMaterial, cloneMap] of clonesByMaterial) {
      for (const [staleVariantKey, staleClone] of cloneMap) {
        if (!liveMaterials.has(staleClone)) {
          // 变体键形如 `楼层\0分类\0变体`，取最后一个 \0 之前的部分即所属灯组，
          groupsByKey
            .get(staleVariantKey.slice(0, staleVariantKey.lastIndexOf("\0")))
            ?.materials.delete(staleClone);
          staleClone.dispose();
          cloneMap.delete(staleVariantKey);
        }
      }
      if (!cloneMap.size) {
        clonesByMaterial.delete(cloneSourceMaterial);
      }
    }
    for (const [staleGroupKey, staleGroup] of groupsByKey) {
      if (!registrationsByFloorId.has(staleGroup.floorId) && !staleGroup.materials.size) {
        staleGroup.texture?.dispose();
        groupsByKey.delete(staleGroupKey);
      }
    }
    nativeLights = [];
    scene.traverse((sceneNode: any) => {
      // 未登记的灯会继续走 three.js 的实时光照。收集它们是为了 stat 里能报警，
      if (sceneNode.isLight && !registrationsByLight.has(sceneNode)) {
        nativeLights.push(sceneNode);
      }
    });
    stats.registered = stats.slotCount = registrationsByLight.size;
    stats.materials = liveMaterials.size;
    stats.meshCount = swappedMeshes.size;
    stats.floorCount = registrationsByFloorId.size;
    // 「细节材质」= 保留了原生 PBR 光照的材质：外部模型、带 alpha 渐变的墙、透明玻璃。
    stats.detailedMaterials = [...liveMaterials].filter(
      surfaceMaterial =>
        surfaceMaterial.userData.plan2DetailedSurface ||
        surfaceMaterial.userData.alphaWallBand ||
        surfaceMaterial.transmission > 0
    ).length;
    stats.capacity = [...registrationsByFloorId].reduce(
      (totalCapacity, [, floorEntryList]) => totalCapacity + alignTo16(floorEntryList.length),
      0
    );
    stats.textureFloors = [...registrationsByFloorId.keys()].filter(
      floorKey => groupsByKey.get(floorKey + "\0floor")?.textureMode
    ).length;
    shouldRescanStructure = false;
  }
  /**
   * 把网格的材质还原成区域灯克隆之前的原始材质。
   */
  function restoreMeshMaterial(swappedMesh: any, assignmentRecord: any) {
    if (swappedMesh.material === assignmentRecord.assigned) {
      swappedMesh.material = Array.isArray(swappedMesh.material)
        ? swappedMesh.material.map(
            (restoredMaterial: any) => sourceMaterialByClone.get(restoredMaterial) || restoredMaterial
          )
        : sourceMaterialByClone.get(swappedMesh.material) || swappedMesh.material;
    }
  }
  /**
   * 登记一盏灯，让它由区域灯接管。
   * @param {object} lightObject 灯对象（必须 isLight）。
   */
  
  /**
   * 记录当前相机的世界矩阵，供注入的着色器把 mvPosition 还原成世界坐标。
   */
  function syncCamera(camera: any) {
    if (!isDisposed && camera?.matrixWorld) {
      viewToWorldUniform.value = camera.matrixWorld;
    }
  }
  /**
   * 每帧入口：必要时重建结构，然后把每盏灯的体积参数写进 uniform / 数据纹理。
   */
  function sync(activeCamera: any, skipStructureScan: any = false) {
    if (isDisposed) {
      return;
    }
    if (!skipStructureScan) {
      // 先推进接触阴影：区域灯材质会采样它的 uniform，晚一帧就会读到过期贴图。
      contactShadows?.sync();
      const nextRootObject = getRoot?.() || null;
      if (nextRootObject !== rootObject) {
        rootObject = nextRootObject;
        shouldRescanStructure = true;
      }
      // 运动模式（且非瞬时）下不重扫：过渡中场景每帧都在变，重扫会不断换材质、
      if (shouldRescanStructure && (!isMotionEnabled || isMotionInstant)) {
        rebuildStructure();
      }
    }
    syncCamera(activeCamera);
    // 运动模式：亮度直接归零（见 setMotion），这里不再更新 uniform，直接返回。
    if (isMotionEnabled && !isMotionInstant) {
      return;
    }
    // 280ms 的淡回：退出运动模式时亮度不是瞬间跳回，而是平滑过渡，
    const motionFadeProgress =
      motionFadeStartMs === null
        ? 1
        : Math.min(1, Math.max(0, (performance.now() - motionFadeStartMs) / 280));
    if (motionFadeProgress < 1) {
      requestFrame();
    } else {
      motionFadeStartMs = null;
    }
    stats.active = 0;
    let shouldUpdateUniforms = false;
    for (const [loopFloorId, loopRegistrations] of registrationsByFloorId) {
      const loopGroups = REGION_KINDS.map(groupKind =>
        groupsByKey.get(loopFloorId + "\0" + groupKind)
      );
      const motionMatrix =
        isMotionEnabled && isMotionInstant ? motionTransformProvider?.(loopFloorId) : null;
      for (const activeLightGroup of loopGroups) {
        if (motionMatrix) {
          activeLightGroup.uniforms.plan2MotionToLayout.value.copy(motionMatrix);
        } else {
          activeLightGroup.uniforms.plan2MotionToLayout.value.identity();
        }
        // 总增益 × 分类增益 × 淡回进度：三者相乘得到该灯组本帧的最终增益，
        const gainValue =
          settings.gain * settings[activeLightGroup.kind + "Gain"] * motionFadeProgress;
        shouldUpdateUniforms ||= activeLightGroup.uniforms.plan2Gain.value !== gainValue;
        activeLightGroup.uniforms.plan2Gain.value = gainValue;
        const sunShadowStrength =
          activeLightGroup.kind === "wall"
            ? 0
            : clamp(coercedFiniteNumberOr(settings.sunShadowStrength, 0.6), 0, 1) * motionFadeProgress;
        shouldUpdateUniforms ||=
          activeLightGroup.uniforms.plan2SunShadowStrength.value !== sunShadowStrength;
        activeLightGroup.uniforms.plan2SunShadowStrength.value = sunShadowStrength;
        activeLightGroup.changed = false;
      }
      loopRegistrations.forEach((floorEntry: any, slotIndex: any) => {
        const { light: light, item: lightItem } = floorEntry;
        // 只刷新自身与祖先的世界矩阵（不递归子节点）：灯通常没有子节点，
        light.updateWorldMatrix(true, false);
        lightWorldMatrix.copy(light.matrixWorld);
        if (motionMatrix) {
          lightWorldMatrix.premultiply(motionMatrix);
        }
        lightWorldPosition.setFromMatrixPosition(lightWorldMatrix);
        if (floorEntry.floorRoot) {
          floorEntry.floorRoot.updateWorldMatrix(true, false);
          floorRootPosition.setFromMatrixPosition(floorEntry.floorRoot.matrixWorld);
        }
        if (motionMatrix) {
          floorRootPosition.applyMatrix4(motionMatrix);
        }
        const floorElevation = floorEntry.floorRoot ? floorRootPosition.y : 0;
        // 可见性两重判断：灯被隐藏 / 移出场景时 amount 直接为 0；
        const actualAmount = isVisibleWithin(light, rootObject)
          ? clamp(coercedFiniteNumberOr(light.intensity, 0) / floorEntry.fullIntensity, 0, 1.5)
          : 0;
        // 预览模式：只亮被选中的灯（并把暗着的也提到 0.6 便于看形状），其余全灭。
        const effectiveAmount =
          previewKeys === null
            ? actualAmount
            : previewKeys.has(floorEntry.key)
              ? Math.max(0.6, actualAmount)
              : 0;
        if (effectiveAmount > 0.00001) {
          stats.active += 1;
        }
        volumeInputsScratch.length = 0;
        volumeInputsScratch.push(
          ...lightWorldMatrix.elements,
          floorElevation,
          effectiveAmount,
          actualAmount,
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
          stats.structureScans
        );
        // 体积参数签名逐项比对：全部一致就说明这盏灯的输入没变，
        if (
          floorEntry.volumeInputs &&
          volumeInputsScratch.every(
            (signatureValue, signatureIndex) =>
              signatureValue === floorEntry.volumeInputs[signatureIndex]
          )
        ) {
          stats.volumeCacheHits++;
          return;
        }
        floorEntry.volumeInputs = volumeInputsScratch.slice();
        const scaledRange =
          clamp(coercedFiniteNumberOr(lightItem.lightRange, 3.5), 0.5, 10) *
          clamp(coercedFiniteNumberOr(settings.rangeScale, 1), 0.2, 3);
        const isStripLight = lightItem.type === "striplight" || light.isRectAreaLight;
        // 默认半径 = 灯范围 × 类型系数：吸顶灯 0.45（更宽的光斑），其余 0.33。
        const defaultRadius = scaledRange * (lightItem.type === "ceilinglight" ? 0.45 : 0.33);
        const halfWidth = Math.max(0.05, coercedFiniteNumberOr(lightItem.width, light.width || 2) / 2);
        const halfDepth = Math.max(0.025, coercedFiniteNumberOr(lightItem.depth, light.height || 0.2) / 2);
        const matrixElements = lightWorldMatrix.elements;
        // 从世界矩阵的第 0 / 2 列取水平朝向（灯的前方在 XZ 平面的投影），
        const horizontalDistance = Math.hypot(matrixElements[0], matrixElements[2]);
        const directionX =
          horizontalDistance > 0.00001 ? matrixElements[0] / horizontalDistance : 1;
        const directionZ =
          horizontalDistance > 0.00001 ? matrixElements[2] / horizontalDistance : 0;
        const lightOverride = overrides[floorEntry.key];
        // 用户设定的是角度制；这里转成弧度做二维旋转，结果写进 region.axis（不写回 override）。
        const rotationRad = ((lightOverride?.rotation || 0) * Math.PI) / 180;
        const rotatedDirectionX = rotationRad
          ? directionX * Math.cos(rotationRad) - directionZ * Math.sin(rotationRad)
          : directionX;
        const rotatedDirectionZ = rotationRad
          ? directionX * Math.sin(rotationRad) + directionZ * Math.cos(rotationRad)
          : directionZ;
        // softEdgeSize 给体积留出一圈软边：取范围与 0.3m 的较大值，
        const softEdgeSize = Math.max(0.3, scaledRange * 0.23);
        // 条灯以「短边的一半 + 少量余量 + 软边」为基准半径；其它灯用 defaultRadius + 软边。
        const baseRadius = isStripLight
          ? halfDepth + scaledRange * 0.07 + softEdgeSize
          : defaultRadius + softEdgeSize;
        const region = (floorEntry.region ||= {
          center: [0, 0, 0],
          lampCenter: [0, 0, 0],
          axis: [1, 0],
          defaults: {
            axis: [1, 0],
            rotation: 0,
            softness: 1
          }
        });
        const regionDefaults = region.defaults;
        regionDefaults.width = (isStripLight ? halfWidth + baseRadius : baseRadius) * 2;
        regionDefaults.depth = baseRadius * 2;
        regionDefaults.shape = isStripLight ? "strip" : "ellipse";
        regionDefaults.axis[0] = directionX;
        regionDefaults.axis[1] = directionZ;
        region.floorId = loopFloorId;
        region.id = floorEntry.id;
        region.key = floorEntry.key;
        region.type = lightItem.type;
        region.lampCenter[0] = lightWorldPosition.x;
        region.lampCenter[1] = lightWorldPosition.y;
        region.lampCenter[2] = lightWorldPosition.z;
        region.offsetX = lightOverride?.offsetX ?? 0;
        region.offsetZ = lightOverride?.offsetZ ?? 0;
        region.moveCenterEnabled = lightOverride?.moveCenterEnabled === true;
        region.center[0] = lightWorldPosition.x + region.offsetX;
        region.center[1] = lightWorldPosition.y;
        region.center[2] = lightWorldPosition.z + region.offsetZ;
        region.axis[0] = rotatedDirectionX;
        region.axis[1] = rotatedDirectionZ;
        region.width = lightOverride?.width ?? regionDefaults.width;
        region.depth = lightOverride?.depth ?? regionDefaults.depth;
        region.rotation = lightOverride?.rotation ?? 0;
        region.softness = lightOverride?.softness ?? 1;
        region.shape = lightOverride?.shape ?? regionDefaults.shape;
        region.overridden = !!lightOverride;
        region.amount = effectiveAmount;
        region.realAmount = actualAmount;
        // heightAbove / heightBelow 是「相对灯的高度」写法，换算成绝对高度区间；
        region.heightAbove = lightOverride?.heightAbove;
        region.heightBelow = lightOverride?.heightBelow;
        region.lampHeight = lightWorldPosition.y - floorElevation;
        region.heightMin =
          lightOverride?.heightMin ??
          (lightOverride?.heightBelow === undefined
            ? undefined
            : region.lampHeight - lightOverride.heightBelow);
        region.heightMax =
          lightOverride?.heightMax ??
          (lightOverride?.heightAbove === undefined
            ? undefined
            : region.lampHeight + lightOverride.heightAbove);
        for (const loopLightGroup of loopGroups) {
          const loopSlot = loopLightGroup.slots[slotIndex];
          const loopKind = loopLightGroup.kind;
          // 垂直范围按分类微调：地面略微下沉 0.18（把地板下沿也包住），
          let bottomY = floorElevation - (loopKind === "floor" ? 0.18 : 0.1);
          // 上沿至少比地面高 0.2m，保证体积不会退化成零高度；
          let topY = Math.max(
            floorElevation + 0.2,
            lightWorldPosition.y + (loopKind === "wall" ? 0.55 : 0.2)
          );
          // 边缘柔化厚度按分类取不同系数：地面 0.23（最大，贴近真实的地面溢光）、
          let edgeFade = Math.max(
            0.3,
            scaledRange * (loopKind === "floor" ? 0.23 : loopKind === "wall" ? 0.18 : 0.2)
          );
          let slotAmount = effectiveAmount;
          if (
            lightOverride?.heightAbove !== undefined ||
            lightOverride?.heightBelow !== undefined ||
            lightOverride?.heightMin !== undefined ||
            lightOverride?.heightMax !== undefined
          ) {
            // 给了高度限制就重算 [bottomLimit, topLimit]：heightMin/Max 是绝对高度，
            const bottomLimit =
              lightOverride.heightMin !== undefined
                ? lightOverride.heightMin === 0
                  ? floorElevation - 0.18 - edgeFade
                  : floorElevation + lightOverride.heightMin
                : lightOverride.heightBelow === undefined
                  ? bottomY - edgeFade
                  : lightWorldPosition.y - lightOverride.heightBelow;
            const topLimit =
              lightOverride.heightMax !== undefined
                ? floorElevation + lightOverride.heightMax
                : lightOverride.heightAbove === undefined
                  ? topY + edgeFade
                  : lightWorldPosition.y + lightOverride.heightAbove;
            const heightSpan = Math.max(0, topLimit - bottomLimit);
            edgeFade = Math.max(0.00001, Math.min(edgeFade, heightSpan / 2));
            bottomY = bottomLimit + edgeFade;
            topY = Math.max(bottomY, topLimit - edgeFade);
            if (heightSpan <= 0.00001) {
              // 区间退化（min >= max）→ 这盏灯在该分类下不产生光照，直接灭掉。
              slotAmount = 0;
            }
          }
          const slotHalfWidth = lightOverride
            ? lightOverride.width / 2
            : isStripLight
              ? halfWidth
              : defaultRadius + edgeFade;
          const slotHalfDepth = lightOverride
            ? lightOverride.depth / 2
            : isStripLight
              ? halfDepth + scaledRange * 0.07 + edgeFade
              : defaultRadius + edgeFade;
          let slotChanged = setVector4IfChanged(
            loopSlot.center,
            region.center[0],
            (bottomY + topY) / 2,
            region.center[2],
            slotAmount
          );
          slotChanged =
            setVector4IfChanged(
              loopSlot.extent,
              slotHalfWidth,
              (topY - bottomY) / 2,
              slotHalfDepth,
              edgeFade
            ) || slotChanged;
          slotChanged =
            setVector4IfChanged(loopSlot.color, light.color.r, light.color.g, light.color.b, 0) ||
            slotChanged;
          // 形状码（axis.z）：覆盖模式 4 = 方形、3 = 条灯（圆角矩形）、2 = 椭圆（circle 也走椭圆）；
          slotChanged =
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
              lightOverride?.softness ?? 0
            ) || slotChanged;
          loopLightGroup.changed ||= slotChanged;
          if (slotChanged && loopLightGroup.texture) {
            // 纹理模式下数据不会自动跟着 Vector4 变：必须把四个 vec4 按 16 个 float
            const textureData = loopLightGroup.texture.image.data;
            const slotByteOffset = slotIndex * 16;
            loopSlot.center.toArray(textureData, slotByteOffset);
            loopSlot.extent.toArray(textureData, slotByteOffset + 4);
            loopSlot.color.toArray(textureData, slotByteOffset + 8);
            loopSlot.axis.toArray(textureData, slotByteOffset + 12);
          }
        }
      });
      for (const dirtyLightGroup of loopGroups) {
        if (dirtyLightGroup.changed && dirtyLightGroup.texture) {
          dirtyLightGroup.texture.needsUpdate = true;
        }
        shouldUpdateUniforms ||= dirtyLightGroup.changed;
      }
    }
    if (shouldUpdateUniforms) {
      // 统计「本帧是否真的写过 uniform」：长期居高不下说明体积签名命中率太低，
      stats.uniformUpdates += 1;
    }
    // 只统计「可见且落在相机图层里」的原生灯：图层不匹配的灯虽然存在但不会被渲染，
    stats.nativeLights = nativeLights.filter(
      sceneLight =>
        isVisibleWithin(sceneLight, scene) &&
        (!activeCamera || sceneLight.layers.test(activeCamera.layers))
    ).length;
  }
  /**
   * 导出一份「本帧区域灯状态」的快照，供调试面板 / 自动化测试读取。
   */
  
  /**
   * 设置区域覆盖表（编辑器里给某盏灯画的形状）。
   */
  function setOverrides(rawOverrideInput: any) {
    overrides = sanitizeRegionOverrides(rawOverrideInput, regionLightContext());
    sync(undefined, true);
    return getOverrides();
  }
  function getOverrides() {
    return Object.fromEntries(
      Object.entries(overrides as Record<string, any>).map(([overrideKey, overrideValue]) => [
        overrideKey,
        {
          ...overrideValue
        }
      ])
    );
  }
  /**
   * 列出所有「已经算出体积」的灯（即至少 sync 过一次的灯）。
   */
  function listRegions() {
    return [...registrationsByLight.values()]
      .filter(regionEntry => regionEntry.region)
      .map(({ region: regionRecord }) => ({
        ...regionRecord,
        center: [...regionRecord.center],
        lampCenter: [...regionRecord.lampCenter],
        axis: [...regionRecord.axis],
        defaults: {
          ...regionRecord.defaults,
          axis: [...regionRecord.defaults.axis]
        }
      }));
  }
  function setPreview(previewKeyList: any) {
    previewKeys = Array.isArray(previewKeyList)
      ? new Set(
          previewKeyList.filter(
            (previewKey: any) => typeof previewKey == "string" && isRegionLightKey(previewKey)
          )
        )
      : null;
    sync(undefined, true);
  }
  /**
   * 在 CPU 侧采样某楼层某个分类的区域光照结果（走 sampleRegionVolumes）。
   */
  function sampleFloorVolume(
    samplePoint: any,
    sampleFloorId: any = registrationsByFloorId.keys().next().value,
    sampleKind: any = "floor"
  ) {
    const sampleGroup = groupsByKey.get(sampleFloorId + "\0" + sampleKind);
    if (sampleGroup) {
      return sampleRegionVolumes(
        sampleGroup.slots.slice(0, sampleGroup.uniforms.plan2LightCount.value),
        sampleWorldPoint
          .copy(samplePoint)
          .applyMatrix4(sampleGroup.uniforms.plan2MotionToLayout.value),
        sampleGroup.uniforms.plan2Gain.value
      );
    } else {
      return [0, 0, 0];
    }
  }
  /**
   * 释放控制器：还原所有被换掉的材质与灯的图层掩码，销毁克隆材质与数据纹理。
   */
  function dispose() {
    if (!isDisposed) {
      isDisposed = true;
      stats.disposed = true;
      if (scene.onBeforeRender === onBeforeRender) {
        scene.onBeforeRender = originalOnBeforeRender;
      }
      for (const listenedNode of listenedNodes) {
        listenedNode.removeEventListener("childadded", markStructureDirty);
        listenedNode.removeEventListener("childremoved", markStructureDirty);
      }
      for (const [swappedMeshEntry, meshAssignmentRecord] of assignmentsByMesh) {
        restoreMeshMaterial(swappedMeshEntry, meshAssignmentRecord);
      }
      for (const cloneMapToDispose of clonesByMaterial.values()) {
        for (const cloneToDispose of cloneMapToDispose.values()) {
          cloneToDispose.dispose();
        }
      }
      for (const disposedLightGroup of groupsByKey.values()) {
        disposedLightGroup.texture?.dispose();
      }
      for (const restoredLight of registrationsByLight.values()) {
        restoredLight.light.layers.mask = restoredLight.originalLayers;
      }
      listenedNodes.clear();
      assignmentsByMesh.clear();
      clonesByMaterial.clear();
      registrationsByLight.clear();
      groupsByKey.clear();
      retainedRoots.clear();
      if (typeof window !== "undefined" && (window as any).__plan2Region === controller) {
        delete (window as any).__plan2Region;
      }
    }
  }
  /**
   * 场景的 onBeforeRender 钩子：借渲染前的时机做一次同步。
   */
  function onBeforeRender(this: any, ...renderArgs: any[]) {
    originalOnBeforeRender?.apply(this, renderArgs);
    sync(renderArgs[2]);
  }
  /**
   * 设置地面亮度百分比（100 = 原样，50~150 之间夹取）。
   */
  const setFloorBrightness = (brightnessPercent: any) => {
    const brightnessRatio = clamp(coercedFiniteNumberOr(brightnessPercent, 100), 50, 150) / 100;
    if (brightnessRatio === floorBrightnessUniform.value) {
      return false;
    } else {
      floorBrightnessUniform.value = brightnessRatio;
      stats.uniformUpdates += 1;
      return true;
    }
  };
  /**
   * 进入 / 退出运动模式。两种粒度：
   */
  function setMotion(motionEnabled: any, motionInstant: any = false) {
    if (isMotionEnabled === (motionEnabled === true) && isMotionInstant === motionInstant) {
      return;
    }
    const previousMotionInstant = isMotionInstant;
    isMotionInstant = motionInstant;
    isMotionEnabled = motionEnabled === true;
    motionFadeStartMs =
      isMotionEnabled || motionInstant || previousMotionInstant ? null : performance.now();
    if (isMotionEnabled && !isMotionInstant) {
      // 普通运动模式下把增益与阴影强度都清零：宁可短暂没有区域光，
      for (const frozenLightGroup of groupsByKey.values()) {
        frozenLightGroup.uniforms.plan2Gain.value = 0;
        frozenLightGroup.uniforms.plan2SunShadowStrength.value = 0;
      }
    }
    shouldRescanStructure = true;
    requestFrame();
  }
  // 对外接口。sync 由 studio-app 的渲染循环调用，也通过 scene.onBeforeRender 兜底；
  const controller = {
    register: registerLight,
    sync: sync,
    syncCamera: syncCamera,
    dispose: dispose,
    stats: stats,
    settings: settings,
    inspect: inspect,
    sample: sampleFloorVolume,
    invalidate: markStructureDirty,
    setFloorBrightness: setFloorBrightness,
    setMotion: setMotion,
    setMotionTransformProvider(provider: any) {
      motionTransformProvider = provider;
    },
    setOverrides: setOverrides,
    getOverrides: getOverrides,
    listRegions: listRegions,
    setPreview: setPreview,
    retainRoot(retainedRoot: any) {
      retainedRoots.add(retainedRoot);
      markStructureDirty();
    },
    releaseRoot(releasedRoot: any) {
      retainedRoots.delete(releasedRoot);
      markStructureDirty();
    }
  };
  scene.onBeforeRender = onBeforeRender;
  if (typeof window !== "undefined" && isFrontendDebugMode()) {
    (window as any).__plan2Region = controller;
  }
  return controller;
}
