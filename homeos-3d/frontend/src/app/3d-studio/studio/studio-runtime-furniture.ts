const RUNTIME_FURNITURE_TYPES = new Set([
  "bed",
  "sofa",
  "cabinet",
  "desk",
  "nightstand",
  "bookcase",
  "tvstand",
  "sideboard",
  "wallcabinet",
  "shoecabinet",
  "table",
  "chair",
  "coffeetable",
  "squarecoffeetable",
  "wardrobe",
  "drawer-chest",
  "shelf",
  "bar",
  "piano",
  "rounddiningtable",
  "vanity",
  "kitchenbase",
]);
export function compactRuntimeFurniture(
  furnitureRoot,
  furnitureEntries,
  { THREE: three, mergeGeometries: _unusedMergeGeometries, materialKey: materialKey },
) {
  const meshesBySurfaceKey = new Map(),
    probeMaterialsByMaterial = new Map(),

    disposableGeometrySet = new Set<{ dispose: () => void }>(),
    disposableMaterialSet = new Set<{ dispose: () => void }>(),
    batchStats = {
      before: 0,
      after: 0,
      triangles: 0,
      vertexBytes: 0,
      types: [],
    },
    furnitureTypeSet = new Set();
  furnitureRoot.updateMatrixWorld(true);
  const rootInverseMatrix = furnitureRoot.matrixWorld.clone().invert();
  for (const { item: furnitureItem, group: furnitureGroup } of furnitureEntries)
    !RUNTIME_FURNITURE_TYPES.has(furnitureItem.type) ||
      furnitureGroup.parent !== furnitureRoot ||
      furnitureGroup.traverse((candidateMesh) => {
        const meshMaterial = candidateMesh.material,
          meshGeometry = candidateMesh.geometry,
          triangleCount =
            (meshGeometry?.index?.count ?? meshGeometry?.attributes.position?.count ?? 0) / 3;
        if (
          !candidateMesh.isMesh ||
          candidateMesh.isInstancedMesh ||
          candidateMesh.children.length ||
          !meshGeometry?.attributes.position ||
          !meshGeometry.attributes.normal ||
          triangleCount > 512 ||
          meshGeometry.drawRange.start !== 0 ||
          meshGeometry.drawRange.count !== Infinity ||
          candidateMesh.matrixWorld.determinant() <= 0 ||
          candidateMesh.customDepthMaterial ||
          candidateMesh.customDistanceMaterial ||
          Object.keys(meshGeometry.morphAttributes).length ||
          candidateMesh.onAfterRender !== three.Object3D.prototype.onAfterRender ||
          meshMaterial?.anisotropy > 0 ||
          !materialKey(candidateMesh, true, true) ||

          Object.values(meshMaterial).some(
            (materialValue) => (materialValue as { isTexture?: boolean } | undefined)?.isTexture,
          ) ||
          (meshMaterial.vertexColors && meshGeometry.attributes.color?.itemSize !== 3)
        )
          return;
        for (
          let ancestorNode = candidateMesh;
          ancestorNode && ancestorNode !== furnitureRoot;
          ancestorNode = ancestorNode.parent
        )
          if (!ancestorNode.visible) return;
        let probeMaterial = probeMaterialsByMaterial.get(meshMaterial);
        probeMaterial ||
          ((probeMaterial = meshMaterial.clone()),
          probeMaterial.color.setRGB(1, 1, 1),
          (probeMaterial.vertexColors = true),
          (probeMaterial.roughness = probeMaterial.metalness = 1),
          probeMaterialsByMaterial.set(meshMaterial, probeMaterial));
        const probeMesh = Object.create(candidateMesh);
        probeMesh.material = probeMaterial;
        const surfaceKey = materialKey(probeMesh, true, false);
        surfaceKey &&
          (meshesBySurfaceKey.has(surfaceKey) || meshesBySurfaceKey.set(surfaceKey, []),
          meshesBySurfaceKey.get(surfaceKey).push({
            mesh: candidateMesh,
            type: furnitureItem.type,
            id: furnitureItem.id,
          }));
      });
  for (const surfaceMeshGroup of meshesBySurfaceKey.values()) {
    if (surfaceMeshGroup.length < 2) continue;
    let vertexCount = 0,
      indexCount = 0,
      maxVertexIndex = 0;
    for (const { mesh: groupedMesh } of surfaceMeshGroup) {
      const sourceGeometry = groupedMesh.geometry,
        meshVertexCount = sourceGeometry.attributes.position.count;
      if (sourceGeometry.index) {
        for (let elementIndex = 0; elementIndex < sourceGeometry.index.count; elementIndex++)
          maxVertexIndex = Math.max(
            maxVertexIndex,
            vertexCount + sourceGeometry.index.getX(elementIndex),
          );
      } else maxVertexIndex = Math.max(maxVertexIndex, vertexCount + meshVertexCount - 1);
      ((vertexCount += meshVertexCount),
        (indexCount += sourceGeometry.index?.count ?? meshVertexCount));
    }
    const positionArray = new Float32Array(vertexCount * 3),
      normalArray = new Float32Array(vertexCount * 3),
      colorArray = new Float32Array(vertexCount * 3),
      surfaceArray = new Float32Array(vertexCount * 2),
      indexArray =
        maxVertexIndex >= 65535 ? new Uint32Array(indexCount) : new Uint16Array(indexCount),
      geometryMatrix = new three.Matrix4(),
      normalMatrix = new three.Matrix3(),
      vertexVector = new three.Vector3();
    let vertexOffset = 0,
      indexOffset = 0;
    for (const { mesh: groupedMesh } of surfaceMeshGroup) {
      const sourceGeometry = groupedMesh.geometry,
        meshVertexCount = sourceGeometry.attributes.position.count,
        sourcePosition = sourceGeometry.attributes.position,
        sourceNormal = sourceGeometry.attributes.normal,
        sourceMaterial = groupedMesh.material,
        vertexColorAttribute = sourceGeometry.attributes.color;
      (geometryMatrix.multiplyMatrices(rootInverseMatrix, groupedMesh.matrixWorld),
        normalMatrix.getNormalMatrix(geometryMatrix));
      for (let meshVertexIndex = 0; meshVertexIndex < meshVertexCount; meshVertexIndex++) {
        const mergedVertexIndex = vertexOffset + meshVertexIndex,
          mergedArrayIndex = mergedVertexIndex * 3;
        (vertexVector
          .set(
            Math.fround(sourcePosition.getX(meshVertexIndex)),
            Math.fround(sourcePosition.getY(meshVertexIndex)),
            Math.fround(sourcePosition.getZ(meshVertexIndex)),
          )
          .applyMatrix4(geometryMatrix),
          (positionArray[mergedArrayIndex] = vertexVector.x),
          (positionArray[mergedArrayIndex + 1] = vertexVector.y),
          (positionArray[mergedArrayIndex + 2] = vertexVector.z),
          vertexVector
            .set(
              Math.fround(sourceNormal.getX(meshVertexIndex)),
              Math.fround(sourceNormal.getY(meshVertexIndex)),
              Math.fround(sourceNormal.getZ(meshVertexIndex)),
            )
            .applyNormalMatrix(normalMatrix),
          (normalArray[mergedArrayIndex] = vertexVector.x),
          (normalArray[mergedArrayIndex + 1] = vertexVector.y),
          (normalArray[mergedArrayIndex + 2] = vertexVector.z),
          (colorArray[mergedArrayIndex] =
            sourceMaterial.color.r *
            (sourceMaterial.vertexColors ? vertexColorAttribute.getX(meshVertexIndex) : 1)),
          (colorArray[mergedArrayIndex + 1] =
            sourceMaterial.color.g *
            (sourceMaterial.vertexColors ? vertexColorAttribute.getY(meshVertexIndex) : 1)),
          (colorArray[mergedArrayIndex + 2] =
            sourceMaterial.color.b *
            (sourceMaterial.vertexColors ? vertexColorAttribute.getZ(meshVertexIndex) : 1)),
          (surfaceArray[mergedVertexIndex * 2] = sourceMaterial.roughness),
          (surfaceArray[mergedVertexIndex * 2 + 1] = sourceMaterial.metalness));
      }
      const meshIndexCount = sourceGeometry.index?.count ?? meshVertexCount;
      for (let elementIndex = 0; elementIndex < meshIndexCount; elementIndex++)
        indexArray[indexOffset + elementIndex] =
          vertexOffset +
          (sourceGeometry.index ? sourceGeometry.index.getX(elementIndex) : elementIndex);
      ((vertexOffset += meshVertexCount), (indexOffset += meshIndexCount));
    }
    const mergedGeometry = new three.BufferGeometry();
    for (const [attributeName, attributeArray, itemSize] of [
      ["position", positionArray, 3],
      ["normal", normalArray, 3],
      ["color", colorArray, 3],
      ["runtimeSurface", surfaceArray, 2],
    ])
      mergedGeometry.setAttribute(
        attributeName,
        new three.BufferAttribute(attributeArray, itemSize),
      );
    mergedGeometry.setIndex(new three.BufferAttribute(indexArray, 1));
    const sourceMesh = surfaceMeshGroup[0].mesh,
      mergedMaterial = probeMaterialsByMaterial.get(sourceMesh.material).clone();
    ((mergedMaterial.onBeforeCompile = (shader) => {
      ((shader.vertexShader =
        "attribute vec2 runtimeSurface;\nvarying vec2 vRuntimeSurface;\n" + shader.vertexShader),
        (shader.vertexShader = shader.vertexShader.replace(
          "#include <begin_vertex>",
          "#include <begin_vertex>\nvRuntimeSurface = runtimeSurface;",
        )),
        (shader.fragmentShader = "varying vec2 vRuntimeSurface;\n" + shader.fragmentShader),
        (shader.fragmentShader = shader.fragmentShader.replace(
          "#include <roughnessmap_fragment>",
          "#include <roughnessmap_fragment>\nroughnessFactor *= vRuntimeSurface.x;",
        )),
        (shader.fragmentShader = shader.fragmentShader.replace(
          "#include <metalnessmap_fragment>",
          "#include <metalnessmap_fragment>\nmetalnessFactor *= vRuntimeSurface.y;",
        )));
    }),
      (mergedMaterial.customProgramCacheKey = () => "runtime-furniture-surface-v1"));
    const mergedMesh = new three.Mesh(mergedGeometry, mergedMaterial);
    ((mergedMesh.name = "runtime-compact-furniture"),
      (mergedMesh.matrixAutoUpdate = false),
      (mergedMesh.castShadow = sourceMesh.castShadow),
      (mergedMesh.receiveShadow = sourceMesh.receiveShadow),
      (mergedMesh.renderOrder = sourceMesh.renderOrder),
      (mergedMesh.layers.mask = sourceMesh.layers.mask),
      (mergedMesh.userData.modelLayer = "items"),
      (mergedMesh.userData.exportRole = "plan"),
      (mergedMesh.userData.reflectionSimplifiable = true),
      (mergedMesh.userData.runtimeFurnitureItemIds = surfaceMeshGroup.map(
        (surfaceMeshRecord) => surfaceMeshRecord.id,
      )),
      (mergedMesh.userData.runtimeFurnitureStats = {
        before: surfaceMeshGroup.length,
        after: 1,
        triangles: mergedGeometry.index.count / 3,
      }));
    for (const { mesh: removedMesh, type: furnitureType } of surfaceMeshGroup)
      (furnitureTypeSet.add(furnitureType),
        removedMesh.removeFromParent(),
        Object.entries(removedMesh.userData).some(
          ([geometryPropertyKey, geometryPropertyValue]) =>
            geometryPropertyKey.endsWith("SharedGeometry") && geometryPropertyValue,
        ) || disposableGeometrySet.add(removedMesh.geometry),
        Object.entries(removedMesh.userData).some(
          ([materialPropertyKey, materialPropertyValue]) =>
            materialPropertyKey.endsWith("SharedMaterial") && materialPropertyValue,
        ) || disposableMaterialSet.add(removedMesh.material));
    ((batchStats.before += surfaceMeshGroup.length),
      batchStats.after++,
      (batchStats.triangles += mergedGeometry.index.count / 3),
      (batchStats.vertexBytes += Object.values(mergedGeometry.attributes).reduce<number>(
        (byteTotal, attributeEntry) =>
          byteTotal + (attributeEntry as { array: { byteLength: number } }).array.byteLength,
        mergedGeometry.index.array.byteLength,
      )),
      furnitureRoot.add(mergedMesh));
  }
  for (const cachedProbeMaterial of probeMaterialsByMaterial.values())
    cachedProbeMaterial.dispose();
  furnitureRoot.traverse((retainedNode) => {
    retainedNode.geometry && disposableGeometrySet.delete(retainedNode.geometry);
    for (const retainedMaterial of Array.isArray(retainedNode.material)
      ? retainedNode.material
      : retainedNode.material
        ? [retainedNode.material]
        : [])
      disposableMaterialSet.delete(retainedMaterial);
  });
  for (const disposableGeometry of disposableGeometrySet) disposableGeometry.dispose();
  for (const disposableMaterial of disposableMaterialSet) disposableMaterial.dispose();
  return (
    (batchStats.types = [...furnitureTypeSet]),
    (furnitureRoot.userData.runtimeFurnitureBatchStats = batchStats),
    batchStats
  );
}
