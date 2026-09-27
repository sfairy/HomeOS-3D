/**
 * 自 studio-app.ts 外提的独立单元（Phase A：安全外提）。
 * 对本模块之外的 studio-app.ts 内部零依赖：只引用 import 与自身成员，故不存在循环引用。
 */
import * as threeModuleMin from "/static/vendor/three/0.186.0/three.module.min.js";
import { mergeGeometries } from "/static/vendor/three/0.186.0/BufferGeometryUtils.js";
import { clamp } from "../plan/geometry.js";
import { RoundedBoxGeometry } from "/static/vendor/three/0.186.0/RoundedBoxGeometry.js";
import { finite } from "../loaders/studio-normalization.js";

export function buildMergedWallGeometry(wallBandSpecs: any) {
  const validWallBands = wallBandSpecs
    .map(normalizePartSpec)
    .filter((wallBandSpec: any) =>
      [wallBandSpec.width, wallBandSpec.height, wallBandSpec.depth].every(
        wallDimension => Number.isFinite(wallDimension) && wallDimension > 0.0001
      )
    );
  if (!validWallBands.length) {
    return null;
  }
  const wallBandCacheKey = JSON.stringify(
    validWallBands.map((cachedWallBand: any) => [
      cachedWallBand.width,
      cachedWallBand.height,
      cachedWallBand.depth,
      cachedWallBand.x,
      cachedWallBand.y,
      cachedWallBand.z,
      cachedWallBand.rotationY
    ])
  );
  if (!mergedWallBandGeometryCache.has(wallBandCacheKey)) {
    const wallBandGeometries = validWallBands.map((wallBandEntry: any) => {
      const wallBandBox = new threeModuleMin.BoxGeometry(
        wallBandEntry.width,
        wallBandEntry.height,
        wallBandEntry.depth
      );
      const wallBandMatrix = new threeModuleMin.Matrix4().compose(
        new threeModuleMin.Vector3(wallBandEntry.x, wallBandEntry.y, wallBandEntry.z),
        new threeModuleMin.Quaternion().setFromEuler(
          new threeModuleMin.Euler(0, wallBandEntry.rotationY, 0)
        ),
        new threeModuleMin.Vector3(1, 1, 1)
      );
      return wallBandBox.applyMatrix4(wallBandMatrix);
    });
    const mergedWallBandGeometry = mergeGeometries(wallBandGeometries);
    wallBandGeometries.forEach((wallBandGeometry: any) => wallBandGeometry.dispose());
    if (!mergedWallBandGeometry) {
      return null;
    }
    mergedWallBandGeometryCache.set(wallBandCacheKey, mergedWallBandGeometry);
  }
  return mergedWallBandGeometryCache.get(wallBandCacheKey);
}

export const mergedWallBandGeometryCache = new Map();

export function normalizePartSpec(partSpec: any) {
  if (Array.isArray(partSpec)) {
    const [specWidth, specHeight, specDepth, specX = 0, specY = 0, specZ = 0, specRotationY = 0] =
      partSpec;
    return {
      width: specWidth,
      height: specHeight,
      depth: specDepth,
      x: specX,
      y: specY,
      z: specZ,
      rotationY: specRotationY
    };
  }
  return {
    width: partSpec.width,
    height: partSpec.height,
    depth: partSpec.depth,
    x: partSpec.x || 0,
    y: partSpec.y || 0,
    z: partSpec.z || 0,
    rotationY: partSpec.rotationY || 0
  };
}

/**
 * @returns {THREE.MeshStandardMaterial} 共享材质实例。
 */
export function resolveRugMaterial(rugColor: any, isRugInset = false) {
  const rugMaterialKey = (isRugInset ? "inset" : "base") + ":" + rugColor;
  if (!rugMaterialByColorKey.has(rugMaterialKey)) {
    rugMaterialByColorKey.set(
      rugMaterialKey,
      new threeModuleMin.MeshStandardMaterial({
        color: rugColor,
        roughness: 1,
        metalness: 0,
        ...(isRugInset
          ? {
              polygonOffset: true,
              polygonOffsetFactor: -2,
              polygonOffsetUnits: -4
            }
          : {})
      })
    );
  }
  return rugMaterialByColorKey.get(rugMaterialKey);
}

export const rugMaterialByColorKey = new Map();

/**
 * @returns {{base: THREE.BufferGeometry, inset: THREE.BufferGeometry, rugThickness: number}} 底板与贴花几何及实际厚度。
 */
export function buildRugGeometry(rugWidth: any, rugThicknessInput: any, rugDepth: any) {
  const rugThickness = clamp(rugThicknessInput, 0.004, 0.018);
  const rugSizeKey = rugWidth + ":" + rugThickness + ":" + rugDepth;
  if (!rugGeometryBySizeKey.has(rugSizeKey)) {
    const rugMinSize = Math.max(Math.min(rugWidth, rugThickness, rugDepth), 0.001);
    const rugCornerRadius = Math.min(Math.min(rugWidth, rugDepth) * 0.018, rugMinSize * 0.45, 0.08);
    const rugBaseGeometry = new RoundedBoxGeometry(
      rugWidth,
      rugThickness,
      rugDepth,
      2,
      rugCornerRadius
    );
    const rugInsetGeometry = new threeModuleMin.PlaneGeometry(rugWidth * 0.88, rugDepth * 0.84);
    rugGeometryBySizeKey.set(rugSizeKey, {
      base: rugBaseGeometry,
      inset: rugInsetGeometry,
      rugThickness: rugThickness
    });
  }
  return rugGeometryBySizeKey.get(rugSizeKey);
}

export const rugGeometryBySizeKey = new Map();

export function bakeMergedItemMeshes(mergeRoot: any, batchItemType: any) {
  if (!BATCH_MERGE_ITEM_TYPES.has(batchItemType)) {
    return;
  }
  const batchMeshes = collectMeshDescendants(mergeRoot);
  const meshCountBefore = batchMeshes.length;
  const meshesBySignature = new Map();
  for (const batchMesh of batchMeshes) {
    if (batchMesh.userData.televisionScreen || batchMesh.userData.televisionGlow) {
      continue;
    }
    const meshMaterialSignature = computeMaterialSignature(batchMesh);
    if (!meshMaterialSignature) {
      continue;
    }
    const batchKey = meshMaterialSignature + ":" + computeGeometrySignature(batchMesh);
    if (!meshesBySignature.has(batchKey)) {
      meshesBySignature.set(batchKey, []);
    }
    meshesBySignature.get(batchKey).push(batchMesh);
  }
  mergeRoot.updateMatrixWorld(true);
  const inverseRootMatrix = mergeRoot.matrixWorld.clone().invert();
  for (const batchedMeshGroup of meshesBySignature.values()) {
    if (batchedMeshGroup.length < 2) {
      continue;
    }
    const transformedGeometries = batchedMeshGroup.map((batchedMeshSource: any) => {
      const localMatrix = new threeModuleMin.Matrix4().multiplyMatrices(
        inverseRootMatrix,
        batchedMeshSource.matrixWorld
      );
      return batchedMeshSource.geometry.clone().applyMatrix4(localMatrix);
    });
    const mergedBatchGeometry = mergeGeometries(transformedGeometries);
    transformedGeometries.forEach((mergedGeometry: any) => mergedGeometry.dispose());
    if (!mergedBatchGeometry) {
      continue;
    }
    const batchRepresentative = batchedMeshGroup[0];
    const mergedBatchMesh = new threeModuleMin.Mesh(
      mergedBatchGeometry,
      batchRepresentative.material
    );
    mergedBatchMesh.castShadow = batchRepresentative.castShadow;
    mergedBatchMesh.receiveShadow = batchRepresentative.receiveShadow;
    mergedBatchMesh.renderOrder = batchRepresentative.renderOrder;
    mergedBatchMesh.userData = {};
    batchedMeshGroup.forEach((removedMesh: any, removedMeshIndex: any) => {
      removedMesh.parent?.remove(removedMesh);
      if (!removedMesh.userData.externalModelSharedGeometry) {
        removedMesh.geometry.dispose();
      }
      if (removedMeshIndex > 0) {
        removedMesh.material.dispose();
      }
    });
    mergeRoot.add(mergedBatchMesh);
  }
  mergeRoot.userData.optimizationStats = {
    type: batchItemType,
    before: meshCountBefore,
    after: collectMeshDescendants(mergeRoot).length
  };
}

/**
 * 计算几何的「可合并签名」：属性名、itemSize、是否归一化与底层数组类型的组合。只比对元信息而不比对顶点数据，
 * @returns {string} 签名 JSON。
 */
export function computeGeometrySignature(signatureObject: any) {
  const attributeSignatures = Object.entries(signatureObject.geometry?.attributes || {})
    .sort(([attrNameA], [attrNameB]) => attrNameA.localeCompare(attrNameB))
    .map(([attributeName, attribute]: any) => [
      attributeName,
      attribute.itemSize,
      attribute.normalized,
      attribute.array?.constructor?.name
    ]);
  return JSON.stringify([
    !!signatureObject.geometry?.index,
    attributeSignatures,
    Object.keys(signatureObject.geometry?.morphAttributes || {}).sort()
  ]);
}

/**
 * 计算一份材质的「可合并签名」：只有渲染表现完全等价的材质才会得到同一串签名。无法用签名稳妥表达的一律返回空串（拒绝参与
 */
export function computeMaterialSignature(signatureMesh: any, ignoreTextures = false, normalizeColor = false) {
  const signatureMaterial = signatureMesh.material;
  if (
    !signatureMesh.isMesh ||
    signatureMesh.isSkinnedMesh ||
    signatureMesh.isBatchedMesh ||
    signatureMesh.morphTargetInfluences ||
    Array.isArray(signatureMaterial) ||
    !signatureMaterial?.isMeshStandardMaterial ||
    signatureMaterial.transparent ||
    signatureMaterial.opacity < 1 ||
    signatureMaterial.transmission > 0 ||
    signatureMaterial.alphaHash ||
    signatureMaterial.displacementMap ||
    signatureMaterial.onBeforeCompile !== threeModuleMin.Material.prototype.onBeforeCompile ||
    signatureMaterial.customProgramCacheKey !==
      threeModuleMin.Material.prototype.customProgramCacheKey ||
    signatureMesh.onBeforeRender !== threeModuleMin.Object3D.prototype.onBeforeRender ||
    signatureMaterial.clippingPlanes?.length ||
    (!ignoreTextures &&
      Object.values(signatureMaterial).some((materialValue: any) => materialValue?.isTexture))
  ) {
    return "";
  }
  const signatureEntries = [];
  for (const materialPropertyKey of Object.keys(signatureMaterial).sort()) {
    if (["id", "uuid", "name", "userData", "version", "_listeners"].includes(materialPropertyKey)) {
      continue;
    }
    const materialPropertyValue = signatureMaterial[materialPropertyKey];
    if (materialPropertyKey === "color" && normalizeColor) {
      signatureEntries.push([materialPropertyKey, [1, 1, 1]]);
      continue;
    }
    if (
      materialPropertyValue == null ||
      ["number", "boolean", "string"].includes(typeof materialPropertyValue)
    ) {
      signatureEntries.push([materialPropertyKey, materialPropertyValue]);
    } else if (materialPropertyValue.isTexture) {
      signatureEntries.push([materialPropertyKey, materialPropertyValue.uuid]);
    } else if (
      materialPropertyValue.isColor ||
      materialPropertyValue.isVector2 ||
      materialPropertyValue.isVector3 ||
      materialPropertyValue.isVector4 ||
      materialPropertyValue.isMatrix3 ||
      materialPropertyValue.isMatrix4 ||
      materialPropertyValue.isEuler
    ) {
      signatureEntries.push([materialPropertyKey, materialPropertyValue.toArray()]);
    } else if (
      Array.isArray(materialPropertyValue) &&
      materialPropertyValue.every(arrayEntry =>
        ["number", "boolean", "string"].includes(typeof arrayEntry)
      )
    ) {
      signatureEntries.push([materialPropertyKey, materialPropertyValue]);
    } else if (materialPropertyKey === "defines") {
      signatureEntries.push([
        materialPropertyKey,
        Object.entries(materialPropertyValue).sort(([keyA], [keyB]) => keyA.localeCompare(keyB))
      ]);
    } else {
      return "";
    }
  }
  return JSON.stringify([
    signatureEntries,
    signatureMesh.castShadow,
    signatureMesh.receiveShadow,
    signatureMesh.renderOrder,
    signatureMesh.layers.mask
  ]);
}

/**
 * 收集子树里除根节点之外的所有 mesh，供后续的共享 / 合并优化使用。
 * @returns {Array<THREE.Mesh>} 后代 mesh 列表（不含根自身）。
 */
export function collectMeshDescendants(subtreeRoot: any) {
  const descendantMeshes: any = [];
  subtreeRoot.traverse((descendantNode: any) => {
    if (descendantNode !== subtreeRoot && descendantNode.isMesh) {
      descendantMeshes.push(descendantNode);
    }
  });
  return descendantMeshes;
}

export const BATCH_MERGE_ITEM_TYPES = new Set([
  "coffeetable",
  "squarecoffeetable",
  "tvstand",
  "plant",
  "bed",
  "nightstand",
  "curtain",
  "vanity",
  "desk",
  "bookcase",
  "piano",
  "table",
  "rounddiningtable",
  "rounddiningtableturntable",
  "bar",
  "sideboard",
  "shoecabinet",
  "chair",
  "cabinet",
  "glasscabinet",
  "shelf",
  "wallcabinet",
  "kitchenbase",
  "kitchensink",
  "kitchencooktop",
  "fridge",
  "freezer",
  "washer",
  "dryer",
  "dishwasher",
  "steamoven",
  "microwave",
  "ricecooker",
  "rangehood",
  "wallac",
  "floorac",
  "nas",
  "airpurifier",
  "tv",
  "desktop",
  "laptop",
  "toilet",
  "squattoilet",
  "urinal",
  "bathtub",
  "shower",
  "basin"
]);

export function shareGeometryAndMaterials(sharedRoot: any, mergeItemType: any) {
  if (!INSTANCE_MERGE_ITEM_TYPES.has(mergeItemType)) {
    return;
  }
  const shareCandidates = collectMeshDescendants(sharedRoot);
  const geometryBySignature = new Map();
  const materialBySignature = new Map();
  for (const shareMesh of shareCandidates) {
    const geometryParameters = shareMesh.geometry?.parameters;
    const geometrySignature = geometryParameters
      ? shareMesh.geometry.type + ":" + JSON.stringify(geometryParameters)
      : "";
    if (geometrySignature && geometryBySignature.has(geometrySignature)) {
      shareMesh.geometry.dispose();
      shareMesh.geometry = geometryBySignature.get(geometrySignature);
    } else if (geometrySignature) {
      geometryBySignature.set(geometrySignature, shareMesh.geometry);
    }
    const materialSignature = computeMaterialKey(shareMesh);
    if (materialSignature && materialBySignature.has(materialSignature)) {
      shareMesh.material.dispose();
      shareMesh.material = materialBySignature.get(materialSignature);
    } else if (materialSignature) {
      materialBySignature.set(materialSignature, shareMesh.material);
    }
  }
  sharedRoot.userData.optimizationStats = {
    type: mergeItemType,
    before: shareCandidates.length,
    after: shareCandidates.length,
    uniqueGeometries: new Set(shareCandidates.map((candidateGeometry: any) => candidateGeometry.geometry))
      .size,
    uniqueMaterials: new Set(shareCandidates.map((candidateMaterial: any) => candidateMaterial.material))
      .size
  };
}

/**
 * 计算材质的「可共享键」：只取影响外观的字段（颜色、粗糙度、金属度、自发光、面剔除、透明与深度 / 混合设置、
 */
export function computeMaterialKey(keyedMesh: any) {
  const keyedMaterial = keyedMesh.material;
  if (Array.isArray(keyedMaterial) || !keyedMaterial?.isMeshStandardMaterial) {
    return "";
  } else {
    return JSON.stringify([
      keyedMaterial.color?.getHex(),
      keyedMaterial.roughness,
      keyedMaterial.metalness,
      keyedMaterial.emissive?.getHex(),
      keyedMaterial.emissiveIntensity,
      keyedMaterial.side,
      keyedMaterial.transparent,
      keyedMaterial.opacity,
      keyedMaterial.depthWrite,
      keyedMaterial.depthTest,
      keyedMaterial.depthFunc,
      keyedMaterial.blending,
      keyedMaterial.polygonOffset,
      keyedMaterial.polygonOffsetFactor,
      keyedMaterial.polygonOffsetUnits,
      keyedMaterial.map?.uuid || ""
    ]);
  }
}

export const INSTANCE_MERGE_ITEM_TYPES = new Set();

/**
 * 把一个家具组摊平成「可实例化描述」列表，供跨实例批量合并。只要有一项不满足实例化条件就整体放弃（返回 null）：
 */
export function collectMeshDescriptors(descriptorRoot: any) {
  descriptorRoot.updateMatrixWorld(true);
  descriptorRoot.updateMatrix();
  if (descriptorRoot.matrix.determinant() < 0) {
    return null;
  }
  const descriptorRootInverse = descriptorRoot.matrixWorld.clone().invert();
  const collectedMeshDescriptors: any = [];
  let isBatchable = true;
  descriptorRoot.traverse((descriptorChildObject: any) => {
    if (!isBatchable || !descriptorChildObject.isMesh) {
      return;
    }
    const childMaterial = descriptorChildObject.material;
    if (
      !descriptorChildObject.userData.externalModelSharedGeometry ||
      Array.isArray(childMaterial) ||
      !childMaterial ||
      childMaterial.transparent === true ||
      finite(childMaterial.opacity, 1) < 0.999 ||
      descriptorChildObject.isSkinnedMesh ||
      descriptorChildObject.morphTargetInfluences
    ) {
      isBatchable = false;
      return;
    }
    const instanceRelativeMatrix = new threeModuleMin.Matrix4().multiplyMatrices(
      descriptorRootInverse,
      descriptorChildObject.matrixWorld
    );
    const materialKey = computeMaterialKey(descriptorChildObject);
    if (!materialKey) {
      isBatchable = false;
      return;
    }
    collectedMeshDescriptors.push({
      mesh: descriptorChildObject,
      relativeMatrix: instanceRelativeMatrix,
      signature: JSON.stringify([
        descriptorChildObject.geometry.uuid,
        materialKey,
        instanceRelativeMatrix.elements.map(
          (matrixElement: any) => Math.round(matrixElement * 1000000) / 1000000
        ),
        descriptorChildObject.castShadow,
        descriptorChildObject.receiveShadow,
        descriptorChildObject.renderOrder
      ])
    });
  });
  if (isBatchable && collectedMeshDescriptors.length) {
    return collectedMeshDescriptors;
  } else {
    return null;
  }
}

export function disposeSceneSubtree(disposedRoot: any) {
  const disposedGeometries = new Set();
  const disposedMaterials = new Set();
  disposedRoot.traverse((disposedNode: any) => {
    disposedNode.shadow?.dispose?.();
    if (
      disposedNode.geometry &&
      !disposedGeometries.has(disposedNode.geometry) &&
      !disposedNode.userData.externalModelSharedGeometry &&
      !disposedNode.userData.rugSharedGeometry &&
      !disposedNode.userData.architectureSharedGeometry
    ) {
      disposedGeometries.add(disposedNode.geometry);
      disposedNode.geometry.dispose?.();
    }
    const nodeMaterials = Array.isArray(disposedNode.material)
      ? disposedNode.material
      : disposedNode.material
        ? [disposedNode.material]
        : [];
    for (const nodeMaterial of nodeMaterials) {
      if (!disposedMaterials.has(nodeMaterial)) {
        disposedMaterials.add(nodeMaterial);
        if (!disposedNode.userData.externalModelSharedTextures) {
          nodeMaterial.map?.dispose?.();
        }
        if (
          !disposedNode.userData.rugSharedMaterial &&
          !disposedNode.userData.architectureSharedMaterial &&
          !disposedNode.userData.externalModelSharedMaterial
        ) {
          nodeMaterial.dispose?.();
        }
      }
    }
  });
}

/**
 * 创建一个圆柱 mesh 挂到父节点上（灯杆、筒灯外壳等回转体零件），返回新建 mesh。
 * @param {THREE.Object3D} cylinderParent 挂载父节点。
 * @param {number} cylinderTopRadius 顶面半径。
 */
export function addCylinderMesh(
  cylinderParent: any,
  cylinderTopRadius: any,
  cylinderBottomRadius: any,
  cylinderHeight: any,
  cylinderX: any,
  cylinderY: any,
  cylinderZ: any,
  cylinderColor: any,
  cylinderOptions: any = {}
) {
  const cylinderMaterial = new threeModuleMin.MeshStandardMaterial({
    color: cylinderColor,
    // 显式贴图（如大理石台面）优先，语义同 addBoxMesh。
    map: cylinderOptions.map ?? null,
    roughness: cylinderOptions.roughness ?? 0.62,
    metalness: cylinderOptions.metalness ?? 0.03,
    transparent: !!cylinderOptions.transparent,
    opacity: cylinderOptions.opacity ?? 1,
    depthWrite: cylinderOptions.depthWrite ?? true
  });
  const cylinderMesh = new threeModuleMin.Mesh(
    new threeModuleMin.CylinderGeometry(
      cylinderTopRadius,
      cylinderBottomRadius,
      cylinderHeight,
      cylinderOptions.segments ?? 24
    ),
    cylinderMaterial
  );
  cylinderMesh.position.set(cylinderX, cylinderY, cylinderZ);
  if (cylinderOptions.rotationX) {
    cylinderMesh.rotation.x = cylinderOptions.rotationX;
  }
  if (cylinderOptions.rotationZ) {
    cylinderMesh.rotation.z = cylinderOptions.rotationZ;
  }
  cylinderMesh.castShadow = cylinderOptions.castShadow !== false;
  cylinderMesh.receiveShadow = cylinderOptions.receiveShadow !== false;
  cylinderParent.add(cylinderMesh);
  return cylinderMesh;
}

export function addBoxMesh(
  parentObject: any,
  boxWidth: any,
  boxHeight: any,
  boxDepth: any,
  boxX: any,
  boxY: any,
  boxZ: any,
  boxColor: any,
  boxOptions: any = {}
) {
  const boxMaterial = new threeModuleMin.MeshStandardMaterial({
    color: boxColor,
    // 显式贴图（如大理石台面）优先：有 map 时基色多作为乘色用，调用方一般传白。
    map: boxOptions.map ?? null,
    roughness: boxOptions.roughness ?? 0.8,
    metalness: boxOptions.metalness ?? 0.01,
    transparent: !!boxOptions.transparent,
    opacity: boxOptions.opacity ?? 1,
    depthWrite: boxOptions.depthWrite ?? true,
    depthFunc: boxOptions.depthFunc ?? threeModuleMin.LessEqualDepth,
    side: boxOptions.side ?? threeModuleMin.FrontSide,
    emissive: boxOptions.emissive ?? 0,
    emissiveIntensity: boxOptions.emissiveIntensity ?? 0
  });
  const maxBoxSize = Math.max(Math.min(boxWidth, boxHeight, boxDepth), 0.001);
  const boxRadius = Math.min(boxOptions.radius ?? maxBoxSize * 0.14, maxBoxSize * 0.45, 0.08);
  const boxGeometry =
    boxOptions.rounded === false || parentObject.userData.squareEdges
      ? new threeModuleMin.BoxGeometry(boxWidth, boxHeight, boxDepth)
      : new RoundedBoxGeometry(boxWidth, boxHeight, boxDepth, boxOptions.segments ?? 2, boxRadius);
  const boxMesh = new threeModuleMin.Mesh(boxGeometry, boxMaterial);
  boxMesh.position.set(boxX, boxY, boxZ);
  boxMesh.castShadow = boxOptions.castShadow !== false;
  boxMesh.receiveShadow = boxOptions.receiveShadow !== false;
  boxMesh.renderOrder = boxOptions.renderOrder ?? 0;
  parentObject.add(boxMesh);
  return boxMesh;
}
