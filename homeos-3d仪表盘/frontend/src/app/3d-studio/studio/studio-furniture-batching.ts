import { mergeGeometries } from "/static/vendor/three/0.186.0/BufferGeometryUtils.js";
const indexCompactionTypeSet = new Set([
    "drawer-chest",
    "bunk-bed",
    "wardrobe",
    "office-chair",
    "router",
    "humidifier",
    "dehumidifier",
    "heater",
    "pool-table",
    "tea-table-set",
    "bed",
    "chair",
    "coffeetable",
    "rounddiningtable",
    "rounddiningtable_turntable",
    "sofa",
    "squarecoffeetable",
    "table",
    "tvstand",
  ]),
  batchableFurnitureTypeSet = new Set([
    "drawer-chest",
    "steelstairs",
    "tea_bar_machine",
    "pipelinewaterpurifier",
    "bunk-bed",
    "wardrobe",
    "office-chair",
    "router",
    "humidifier",
    "dehumidifier",
    "heater",
    "pool-table",
    "tea-table-set",
    "bed",
    "coffeetable",
    "rounddiningtable",
    "rounddiningtable_turntable",
    "squarecoffeetable",
    "table",
    "plant",
    "nightstand",
    "vanity",
    "desk",
    "bookcase",
    "piano",
    "bar",
    "sideboard",
    "shoecabinet",
    "cabinet",
    "glasscabinet",
    "shelf",
    "wallcabinet",
    "kitchenbase",
    "kitchensink",
    "kitchencooktop",
    "basin",
    "toilet",
    "squattoilet",
    "urinal",
    "shower",
    "bathtub",
    "floorac",
    "airpurifier",
    "fridge",
    "freezer",
    "rangehood",
    "dishwasher",
    "steamoven",
    "microwave",
    "ricecooker",
    "washer",
    "dryer",
    "desktop",
    "laptop",
  ]);
export function compactFurnitureIndices(three, templateRoot, furnitureType) {
  indexCompactionTypeSet.has(furnitureType) &&
    templateRoot?.traverse?.((mesh) => {
      const meshGeometry = mesh.geometry,
        geometryIndex = meshGeometry?.index;
      geometryIndex?.array instanceof Uint32Array &&
        meshGeometry.attributes.position.count <= 65536 &&
        meshGeometry.setIndex(new three.BufferAttribute(new Uint16Array(geometryIndex.array), 1));
    });
}
export function createFurnitureBatchCache(threeApi) {
  let batchCacheByModel = new WeakMap();
  const disposableResourceSet = new Set<{ dispose: () => void }>();
  function prepareBatches(
    modelClone,
    loadedModel,
    modelType,
    staticMaterialKey,
    shouldTintVertices = true,
  ) {
    if (!batchableFurnitureTypeSet.has(modelType) || !staticMaterialKey) return false;
    modelClone.updateMatrixWorld(true);
    const modelInverseMatrix = modelClone.matrixWorld.clone().invert(),
      meshRecords = [],
      seenMaterialKeySet = new Set();
    let hasDuplicateMaterialKey = false;
    if (
      (modelClone.traverse((childMesh) => {
        if (!childMesh.isMesh) return;
        const exactMaterialKey = staticMaterialKey(childMesh),
          tintedMaterialKey = shouldTintVertices
            ? staticMaterialKey(childMesh, false, true)
            : exactMaterialKey;
        for (let ancestorNode = childMesh; ancestorNode; ancestorNode = ancestorNode.parent)
          if (!ancestorNode.visible) return;
        !exactMaterialKey ||
          !tintedMaterialKey ||
          !childMesh.userData.externalModelSharedGeometry ||
          !childMesh.geometry.attributes.normal ||
          childMesh.geometry.drawRange.start !== 0 ||
          childMesh.geometry.drawRange.count !== Infinity ||
          childMesh.children.length ||
          !Number.isFinite(childMesh.matrixWorld.determinant()) ||
          childMesh.matrixWorld.determinant() === 0 ||
          (childMesh.matrixWorld.determinant() < 0 && modelType !== "steelstairs") ||
          (seenMaterialKeySet.has(exactMaterialKey) && (hasDuplicateMaterialKey = true),
          seenMaterialKeySet.add(exactMaterialKey),
          meshRecords.push({
            object: childMesh,
            exact: exactMaterialKey,
            tinted: tintedMaterialKey,
            matrix: new threeApi.Matrix4().multiplyMatrices(
              modelInverseMatrix,
              childMesh.matrixWorld,
            ),
          }));
      }),
      !hasDuplicateMaterialKey &&
        shouldTintVertices &&
        meshRecords.some(
          (candidateRecord) => candidateRecord.object.material.userData?.plan2SurfaceSlope,
        ) &&
        (hasDuplicateMaterialKey =
          new Set(meshRecords.map((mappedRecord) => mappedRecord.tinted)).size <
          meshRecords.length),
      !hasDuplicateMaterialKey)
    )
      return false;
    const cacheKey = JSON.stringify([
      shouldTintVertices,
      meshRecords.map((sourceRecord) => [
        sourceRecord.object.geometry.uuid,
        sourceRecord.exact,
        sourceRecord.matrix.elements,
      ]),
    ]);
    let batchListByCacheKey = batchCacheByModel.get(loadedModel);
    batchListByCacheKey ||
      ((batchListByCacheKey = new Map()), batchCacheByModel.set(loadedModel, batchListByCacheKey));
    let batchDescriptors = batchListByCacheKey.get(cacheKey);
    if (!batchDescriptors) {
      const recordsByTintedKey = new Map();
      for (const groupedRecord of meshRecords)
        (recordsByTintedKey.has(groupedRecord.tinted) ||
          recordsByTintedKey.set(groupedRecord.tinted, []),
          recordsByTintedKey.get(groupedRecord.tinted).push(groupedRecord));
      batchDescriptors = [];
      for (const tintedGroup of recordsByTintedKey.values()) {
        const preparedGeometries = tintedGroup.map(
            ({ object: sourceMesh, matrix: instanceMatrix }) => {
              const sourceGeometry = sourceMesh.geometry,
                bakedGeometry = new threeApi.BufferGeometry();
              for (const attributeName of ["position", "normal"]) {
                const sourceAttribute = sourceGeometry.attributes[attributeName],
                  attributeArray = new Float32Array(sourceAttribute.count * 3);
                for (let vertexIndex = 0; vertexIndex < sourceAttribute.count; vertexIndex++)
                  ((attributeArray[vertexIndex * 3] = sourceAttribute.getX(vertexIndex)),
                    (attributeArray[vertexIndex * 3 + 1] = sourceAttribute.getY(vertexIndex)),
                    (attributeArray[vertexIndex * 3 + 2] = sourceAttribute.getZ(vertexIndex)));
                bakedGeometry.setAttribute(
                  attributeName,
                  new threeApi.BufferAttribute(attributeArray, 3),
                );
              }
              const vertexCount = sourceGeometry.attributes.position.count;
              if (shouldTintVertices) {
                const materialColor = sourceMesh.material.color,
                  sourceColorAttribute = sourceGeometry.attributes.color,
                  colorArray = new Float32Array(vertexCount * 3);
                for (let colorVertexIndex = 0; colorVertexIndex < vertexCount; colorVertexIndex++)
                  ((colorArray[colorVertexIndex * 3] =
                    materialColor.r *
                    (sourceMesh.material.vertexColors
                      ? sourceColorAttribute.getX(colorVertexIndex)
                      : 1)),
                    (colorArray[colorVertexIndex * 3 + 1] =
                      materialColor.g *
                      (sourceMesh.material.vertexColors
                        ? sourceColorAttribute.getY(colorVertexIndex)
                        : 1)),
                    (colorArray[colorVertexIndex * 3 + 2] =
                      materialColor.b *
                      (sourceMesh.material.vertexColors
                        ? sourceColorAttribute.getZ(colorVertexIndex)
                        : 1)));
                bakedGeometry.setAttribute("color", new threeApi.BufferAttribute(colorArray, 3));
              } else
                sourceMesh.material.vertexColors &&
                  bakedGeometry.setAttribute("color", sourceGeometry.attributes.color.clone());
              const indexCount = sourceGeometry.index?.count ?? vertexCount,
                indexArray =
                  vertexCount <= 65536 ? new Uint16Array(indexCount) : new Uint32Array(indexCount);
              for (let indexCursor = 0; indexCursor < indexCount; indexCursor++)
                indexArray[indexCursor] = sourceGeometry.index
                  ? sourceGeometry.index.getX(indexCursor)
                  : indexCursor;
              if (instanceMatrix.determinant() < 0)
                for (
                  let faceStartIndex = 0;
                  faceStartIndex < indexArray.length;
                  faceStartIndex += 3
                ) {
                  const swappedIndex = indexArray[faceStartIndex + 1];
                  ((indexArray[faceStartIndex + 1] = indexArray[faceStartIndex + 2]),
                    (indexArray[faceStartIndex + 2] = swappedIndex));
                }
              return (
                bakedGeometry.setIndex(new threeApi.BufferAttribute(indexArray, 1)),
                bakedGeometry.applyMatrix4(instanceMatrix)
              );
            },
          ),
          mergedGeometry = mergeGeometries(preparedGeometries);
        if (
          (preparedGeometries.forEach((preparedGeometry) => preparedGeometry.dispose()),
          !mergedGeometry)
        ) {
          for (const batchToDispose of batchDescriptors)
            (batchToDispose.geometry.dispose(), batchToDispose.material.dispose());
          return false;
        }
        const groupMesh = tintedGroup[0].object,
          batchMaterial = groupMesh.material.clone();
        (shouldTintVertices &&
          (batchMaterial.color.setRGB(1, 1, 1), (batchMaterial.vertexColors = true)),
          batchDescriptors.push({
            geometry: mergedGeometry,
            material: batchMaterial,
            castShadow: groupMesh.castShadow,
            receiveShadow: groupMesh.receiveShadow,
            renderOrder: groupMesh.renderOrder,
            layers: groupMesh.layers.mask,
          }));
      }
      batchListByCacheKey.set(cacheKey, batchDescriptors);
      for (const batchToTrack of batchDescriptors)
        (disposableResourceSet.add(batchToTrack.geometry),
          disposableResourceSet.add(batchToTrack.material));
    }
    for (const { object: removedMesh } of meshRecords) removedMesh.removeFromParent();
    for (const batchToInstantiate of batchDescriptors) {
      const batchedMesh = new threeApi.Mesh(
        batchToInstantiate.geometry,
        batchToInstantiate.material,
      );
      ((batchedMesh.castShadow = batchToInstantiate.castShadow),
        (batchedMesh.receiveShadow = batchToInstantiate.receiveShadow),
        (batchedMesh.renderOrder = batchToInstantiate.renderOrder),
        (batchedMesh.layers.mask = batchToInstantiate.layers),
        Object.assign(batchedMesh.userData, {
          furnitureBatchCompiled: true,
          externalModelSharedGeometry: true,
          externalModelSharedMaterial: true,
          externalModelSharedTextures: true,
        }),
        modelClone.add(batchedMesh));
    }
    return true;
  }
  return {
    prepare: prepareBatches,
    dispose() {
      for (const resource of disposableResourceSet) resource.dispose();
      (disposableResourceSet.clear(), (batchCacheByModel = new WeakMap()));
    },
  };
}
