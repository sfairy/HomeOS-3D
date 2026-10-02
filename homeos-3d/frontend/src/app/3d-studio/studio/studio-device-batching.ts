import { mergeGeometries } from "/static/vendor/three/0.186.0/BufferGeometryUtils.js";
const batchableDeviceTypeSet = new Set([
  "camera",
  "presence",
  "speaker",
  "fan",
  "airer",
  "plant",
  "wallac",
  "floorac",
  "airpurifier",
  "nas",
  "storagewaterheater",
  "gaswaterheater",
  "fridge",
  "freezer",
  "dishwasher",
  "washer",
  "dryer",
]);
export function compactStaticDeviceParts(three, deviceRoot, deviceType, canBatchPart) {
  const batchStats = {
    before: 0,
    after: 0,
  };
  if (!batchableDeviceTypeSet.has(deviceType)) return batchStats;
  const candidateGroups = [],
    // 这两组存的是待释放的几何 / 材质，统一按「有 dispose()」收窄，避免迭代时是 unknown。
    disposableGeometrySet = new Set<{ dispose: () => void }>(),
    disposableMaterialSet = new Set<{ dispose: () => void }>();
  deviceRoot.traverse((candidateNode) => {
    !candidateNode.isMesh &&
      (deviceType !== "airer" || candidateNode.name === "moving-rack") &&
      candidateGroups.push(candidateNode);
  });
  for (const containerNode of candidateGroups) {
    const meshesBySignature = new Map();
    for (const mesh of containerNode.children) {
      const meshGeometry = mesh.geometry;
      if (
        !mesh.isMesh ||
        mesh.isInstancedMesh ||
        mesh.children.length ||
        !mesh.visible ||
        !meshGeometry?.attributes.position ||
        Object.keys(meshGeometry.morphAttributes).length ||
        meshGeometry.drawRange.start !== 0 ||
        meshGeometry.drawRange.count !== Infinity ||
        mesh.customDepthMaterial ||
        mesh.customDistanceMaterial ||
        mesh.onAfterRender !== three.Object3D.prototype.onAfterRender ||
        Object.keys(mesh.userData).some(
          (propertyKey) => !/^externalModelShared(Geometry|Material|Textures)$/.test(propertyKey),
        ) ||
        (mesh.updateMatrix(), mesh.matrix.determinant() <= 0)
      )
        continue;
      const hasNoVertexColors = !mesh.material?.vertexColors,
        isBatchablePart = canBatchPart(mesh, true, hasNoVertexColors);
      if (!isBatchablePart) continue;
      const attributeSignatures = Object.entries(meshGeometry.attributes)
          .sort(([leftAttributeName], [rightAttributeName]) =>
            leftAttributeName.localeCompare(rightAttributeName),
          )
          .map(([attributeName, attributeEntry]) => {
            const bufferAttribute = attributeEntry as {
              itemSize: number;
              normalized: boolean;
              array?: { constructor: { name: string } };
            };
            return [
              attributeName,
              bufferAttribute.itemSize,
              bufferAttribute.normalized,
              bufferAttribute.array?.constructor.name,
            ];
          }),
        batchSignature = JSON.stringify([
          isBatchablePart,
          !!meshGeometry.index,
          attributeSignatures,
          mesh.frustumCulled,
          hasNoVertexColors,
        ]);
      (meshesBySignature.has(batchSignature) || meshesBySignature.set(batchSignature, []),
        meshesBySignature.get(batchSignature).push(mesh));
    }
    for (const meshGroup of meshesBySignature.values()) {
      if (meshGroup.length < 2) continue;
      const hasNoGroupVertexColors = !meshGroup[0].material.vertexColors,
        transformedGeometries = meshGroup.map((groupedMesh) => {
          const transformedGeometry = groupedMesh.geometry.clone().applyMatrix4(groupedMesh.matrix);
          if (hasNoGroupVertexColors) {
            const vertexCount = transformedGeometry.attributes.position.count,
              vertexColorArray = new Float32Array(vertexCount * 3),
              materialColor = groupedMesh.material.color;
            for (let vertexIndex = 0; vertexIndex < vertexCount; vertexIndex++)
              vertexColorArray.set(
                [materialColor.r, materialColor.g, materialColor.b],
                vertexIndex * 3,
              );
            transformedGeometry.setAttribute(
              "color",
              new three.BufferAttribute(vertexColorArray, 3),
            );
          }
          return transformedGeometry;
        }),
        mergedGeometry = mergeGeometries(transformedGeometries);
      if (
        (transformedGeometries.forEach((clonedGeometry) => clonedGeometry.dispose()),
        !mergedGeometry)
      )
        continue;
      const sourceMesh = meshGroup[0],
        mergedMaterial = hasNoGroupVertexColors ? sourceMesh.material.clone() : sourceMesh.material;
      hasNoGroupVertexColors &&
        (mergedMaterial.color.setRGB(1, 1, 1), (mergedMaterial.vertexColors = true));
      const mergedMesh = new three.Mesh(mergedGeometry, mergedMaterial);
      ((mergedMesh.name = "static-device-parts"),
        (mergedMesh.userData.reflectionSimplifiable = true),
        (mergedMesh.userData.runtimeDetail = true),
        (mergedMesh.castShadow = sourceMesh.castShadow),
        (mergedMesh.receiveShadow = sourceMesh.receiveShadow),
        (mergedMesh.renderOrder = sourceMesh.renderOrder),
        (mergedMesh.layers.mask = sourceMesh.layers.mask),
        (mergedMesh.frustumCulled = sourceMesh.frustumCulled),
        (mergedMesh.userData.externalModelSharedMaterial =
          !hasNoGroupVertexColors && sourceMesh.userData.externalModelSharedMaterial === true),
        (mergedMesh.userData.externalModelSharedTextures =
          sourceMesh.userData.externalModelSharedTextures === true));
      for (const removedMesh of meshGroup)
        (containerNode.remove(removedMesh),
          removedMesh.userData.externalModelSharedGeometry ||
            disposableGeometrySet.add(removedMesh.geometry),
          removedMesh.userData.externalModelSharedMaterial ||
            disposableMaterialSet.add(removedMesh.material));
      (containerNode.add(mergedMesh), (batchStats.before += meshGroup.length), batchStats.after++);
    }
  }
  deviceRoot.traverse((retainedNode) => {
    disposableGeometrySet.delete(retainedNode.geometry);
    for (const referencedMaterial of Array.isArray(retainedNode.material)
      ? retainedNode.material
      : [retainedNode.material])
      disposableMaterialSet.delete(referencedMaterial);
  });
  for (const disposableGeometry of disposableGeometrySet) disposableGeometry.dispose();
  for (const disposableMaterial of disposableMaterialSet) disposableMaterial.dispose();
  return (
    deviceRoot.traverse((cleanupNode) => {
      cleanupNode.isMesh &&
        cleanupNode.userData.externalModelSharedGeometry &&
        !cleanupNode.children.length &&
        Object.keys(cleanupNode.userData).every(
          (remainingPropertyKey) =>
            /^externalModelShared(Geometry|Material|Textures)$/.test(remainingPropertyKey) ||
            remainingPropertyKey === "furnitureBatchCompiled",
        ) &&
        !cleanupNode.customDepthMaterial &&
        !cleanupNode.customDistanceMaterial &&
        cleanupNode.onBeforeRender === three.Object3D.prototype.onBeforeRender &&
        Object.assign(cleanupNode.userData, {
          reflectionSimplifiable: true,
          runtimeDetail: true,
        });
    }),
    (deviceRoot.userData.staticDeviceBatchStats = batchStats),
    batchStats
  );
}
