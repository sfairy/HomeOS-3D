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
  { THREE: three, mergeGeometries: mergeGeometries, materialKey: materialKey },
) {
  const meshesBySurfaceKey = new Map(),
    probeMaterialsByMaterial = new Map(),
    // 待释放的几何 / 材质：迭代时要能直接调 dispose()，所以显式收窄元素类型。
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
          // 材质上挂着贴图的不能合批（合批会丢贴图）；材质属性是任意键，逐个看 isTexture。
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
    const transformedGeometries = surfaceMeshGroup.map(({ mesh: groupedMesh }) => {
        const sourceGeometry = groupedMesh.geometry,
          rebuiltGeometry = new three.BufferGeometry(),
          vertexCount = sourceGeometry.attributes.position.count;
        for (const attributeName of ["position", "normal"]) {
          const sourceAttribute = sourceGeometry.attributes[attributeName],
            attributeArray = new Float32Array(vertexCount * 3);
          for (
            let positionVertexIndex = 0;
            positionVertexIndex < vertexCount;
            positionVertexIndex++
          )
            ((attributeArray[positionVertexIndex * 3] = sourceAttribute.getX(positionVertexIndex)),
              (attributeArray[positionVertexIndex * 3 + 1] =
                sourceAttribute.getY(positionVertexIndex)),
              (attributeArray[positionVertexIndex * 3 + 2] =
                sourceAttribute.getZ(positionVertexIndex)));
          rebuiltGeometry.setAttribute(attributeName, new three.BufferAttribute(attributeArray, 3));
        }
        const colorArray = new Float32Array(vertexCount * 3),
          surfaceArray = new Float32Array(vertexCount * 2),
          sourceMaterial = groupedMesh.material,
          vertexColorAttribute = sourceGeometry.attributes.color;
        for (let surfaceVertexIndex = 0; surfaceVertexIndex < vertexCount; surfaceVertexIndex++)
          ((colorArray[surfaceVertexIndex * 3] =
            sourceMaterial.color.r *
            (sourceMaterial.vertexColors ? vertexColorAttribute.getX(surfaceVertexIndex) : 1)),
            (colorArray[surfaceVertexIndex * 3 + 1] =
              sourceMaterial.color.g *
              (sourceMaterial.vertexColors ? vertexColorAttribute.getY(surfaceVertexIndex) : 1)),
            (colorArray[surfaceVertexIndex * 3 + 2] =
              sourceMaterial.color.b *
              (sourceMaterial.vertexColors ? vertexColorAttribute.getZ(surfaceVertexIndex) : 1)),
            (surfaceArray[surfaceVertexIndex * 2] = sourceMaterial.roughness),
            (surfaceArray[surfaceVertexIndex * 2 + 1] = sourceMaterial.metalness));
        (rebuiltGeometry.setAttribute("color", new three.BufferAttribute(colorArray, 3)),
          rebuiltGeometry.setAttribute(
            "runtimeSurface",
            new three.BufferAttribute(surfaceArray, 2),
          ));
        const indexArray = new Uint32Array(
          sourceGeometry.index ? sourceGeometry.index.count : vertexCount,
        );
        for (let elementIndex = 0; elementIndex < indexArray.length; elementIndex++)
          indexArray[elementIndex] = sourceGeometry.index
            ? sourceGeometry.index.getX(elementIndex)
            : elementIndex;
        return (
          rebuiltGeometry.setIndex(new three.BufferAttribute(indexArray, 1)),
          rebuiltGeometry.applyMatrix4(
            new three.Matrix4().multiplyMatrices(rootInverseMatrix, groupedMesh.matrixWorld),
          )
        );
      }),
      mergedGeometry = mergeGeometries(transformedGeometries);
    if (
      (transformedGeometries.forEach((transformedGeometry) => transformedGeometry.dispose()),
      !mergedGeometry)
    )
      continue;
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
