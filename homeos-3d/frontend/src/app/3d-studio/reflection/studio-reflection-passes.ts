import { mergeGeometries } from "/static/vendor/three/0.186.0/BufferGeometryUtils.js";

/**
 * 做几何签名 / 合批时读到的最小 Attribute 结构。
 * 普通 BufferAttribute 与 InterleavedBufferAttribute 都满足它；交错缓冲多出的 data 用来查内层版本号。
 */
type GeometryAttributeLike = {
  version: number;
  count: number;
  itemSize: number;
  /** 只有交错缓冲有；内层 buffer 改动时 version 会变。 */
  data?: { version?: number };
};

/** 反射合批通道的外部依赖。 */
export type ReflectionPassesOptions = {
  THREE: any;
  /** 一批建完后请求下一帧。 */
  requestFrame?: () => void;
  /** 把建批任务挪到空闲时段；默认 requestIdleCallback，退化成 setTimeout。 */
  scheduleWork?: (task: () => void) => () => void;
  /** 合批代理几何的总字节上限。 */
  maxBytes?: number;
  /** 小物件代理的最大直径（米）。 */
  maxDetailDiameter?: number;
  /** 小物件代理的最大屏幕像素尺寸。 */
  maxDetailPixels?: number;
};

function scheduleIdleTask(task) {
  if (globalThis.requestIdleCallback) {
    const idleCallbackId = requestIdleCallback(task, {
      timeout: 250,
    });
    return () => cancelIdleCallback(idleCallbackId);
  }
  const timeoutId = setTimeout(task, 0);
  return () => clearTimeout(timeoutId);
}
export function createReflectionPasses({
  THREE: three,
  requestFrame: requestFrame = () => {},
  scheduleWork: scheduleWork = scheduleIdleTask,
  maxBytes: maxBytes = 8 * 1024 * 1024,
  maxDetailDiameter: maxDetailDiameter = 0.14,
  maxDetailPixels: maxDetailPixels = 2.5,
}: ReflectionPassesOptions) {
  const options = {
      batch: true,
      small: true,
      material: true,
    },
    stats = {
      batches: 0,
      bytes: 0,
      pending: 0,
      savedDraws: 0,
      omitted: 0,
      materials: 0,
    },
    materialCopyMap = new Map(),
    batchRecords = [],
    smallEntries = [],
    smallEntriesByFloorId = new Map(),
    hiddenObjects = [],
    proxyMeshes = [],
    materialAliasMap = new WeakMap(),
    inverseOwnerMatrix = new three.Matrix4(),
    expectedLocalMatrix = new three.Matrix4(),
    worldScaleVector = new three.Vector3(),
    projectedCenter = new three.Vector4(),
    viewProjectionMatrix = new three.Matrix4();
  let screenScaleFactor = 0,
    geometryMatchMap = null,
    pendingBatches = [],
    cancelScheduledWork = null,
    isDisposed = false;
  const defaultMaterialCacheKey = three.Material.prototype.customProgramCacheKey.call(
      new three.Material(),
    ),
    createGeometryKey = (geometry) => ({
      index: geometry.index,
      version: geometry.index?.version,
      start: geometry.drawRange.start,
      count: geometry.drawRange.count,
      attributes: Object.entries(
        geometry.attributes as Record<string, GeometryAttributeLike>,
      ).map(([attributeName, sourceAttribute]) => ({
        name: attributeName,
        attribute: sourceAttribute,
        version: sourceAttribute.version,
        dataVersion: sourceAttribute.data?.version,
        count: sourceAttribute.count,
      })),
    }),
    isGeometryKeyCurrent = (entry) => {
      const objectGeometry = entry.object.geometry,
        geometryKey = entry.key;
      if (objectGeometry !== entry.geometry) return false;
      if (geometryMatchMap?.has(geometryKey)) return geometryMatchMap.get(geometryKey);
      const isKeyMatch =
        geometryKey.index === objectGeometry.index &&
        geometryKey.version === objectGeometry.index?.version &&
        geometryKey.start === objectGeometry.drawRange.start &&
        geometryKey.count === objectGeometry.drawRange.count &&
        Object.keys(objectGeometry.attributes).length === geometryKey.attributes.length &&
        geometryKey.attributes.every((attributeKey) => {
          const liveAttribute = objectGeometry.attributes[attributeKey.name];
          return (
            liveAttribute === attributeKey.attribute &&
            liveAttribute.version === attributeKey.version &&
            liveAttribute.data?.version === attributeKey.dataVersion &&
            liveAttribute.count === attributeKey.count
          );
        });
      return (geometryMatchMap?.set(geometryKey, isKeyMatch), isKeyMatch);
    },
    isVisibleInHierarchy = (sceneObject) => {
      for (let node = sceneObject; node; node = node.parent) if (!node.visible) return false;
      return true;
    };
  function findFloorOwner(startObject) {
    for (let ancestor = startObject.parent; ancestor; ancestor = ancestor.parent) {
      const floorId = ancestor.userData.floorId || ancestor.userData.regionFloorId;
      if (floorId)
        return {
          object: ancestor,
          id: String(floorId),
        };
    }
    return null;
  }
  function isSimpleMesh(candidateMesh) {
    const candidateGeometry = candidateMesh.geometry,
      candidateMaterial = candidateMesh.material;
    return (
      candidateMesh.isMesh &&
      !candidateMesh.children.length &&
      !candidateMesh.isInstancedMesh &&
      !candidateMesh.isBatchedMesh &&
      !candidateMesh.isSkinnedMesh &&
      !candidateMesh.morphTargetInfluences?.length &&
      !Object.keys(candidateGeometry?.morphAttributes || {}).length &&
      candidateMesh.onBeforeRender === three.Object3D.prototype.onBeforeRender &&
      candidateGeometry?.attributes.position &&
      candidateGeometry.drawRange.start === 0 &&
      candidateGeometry.drawRange.count === Infinity &&
      candidateMaterial?.isMeshStandardMaterial &&
      !candidateMaterial.transparent &&
      !candidateMaterial.alphaTest &&
      !candidateMaterial.alphaHash &&
      !candidateMaterial.displacementMap &&
      !(candidateMaterial.transmission > 0) &&
      !candidateMaterial.clippingPlanes?.length &&
      !candidateMesh.userData.reflectionOverlay &&
      !candidateMesh.userData.regionReceiverKind &&
      !["background", "grid", "outline"].includes(candidateMesh.userData.exportRole)
    );
  }
  function isPlainMaterial(checkedMaterial) {
    return (
      checkedMaterial.onBeforeCompile === three.Material.prototype.onBeforeCompile ||
      (checkedMaterial.userData.plan2RegionMaterial &&
        !checkedMaterial.userData.plan2DetailedSurface &&
        checkedMaterial.customProgramCacheKey().split("|plan2-")[0] === defaultMaterialCacheKey)
    );
  }
  function getReflectionMaterial(sourceMaterialNode) {
    if (
      !options.material ||
      !sourceMaterialNode?.isMeshStandardMaterial ||
      sourceMaterialNode.transparent ||
      sourceMaterialNode.transmission > 0 ||
      sourceMaterialNode.userData.alphaWallBand ||
      sourceMaterialNode.displacementMap ||
      sourceMaterialNode.clippingPlanes?.length ||
      (sourceMaterialNode.userData.plan2RegionMaterial &&
        !sourceMaterialNode.userData.plan2DetailedSurface &&
        !sourceMaterialNode.normalMap &&
        !sourceMaterialNode.bumpMap &&
        !sourceMaterialNode.roughnessMap &&
        !sourceMaterialNode.metalnessMap) ||
      (!sourceMaterialNode.userData.plan2RegionMaterial && !isPlainMaterial(sourceMaterialNode))
    )
      return sourceMaterialNode;
    let materialCacheEntry = materialCopyMap.get(sourceMaterialNode);
    if (
      (materialCacheEntry &&
        materialCacheEntry.version !== sourceMaterialNode.version &&
        (materialCacheEntry.release(), (materialCacheEntry = null)),
      !materialCacheEntry)
    ) {
      const newReflectionMaterial = sourceMaterialNode.clone();
      ((newReflectionMaterial.roughness = 1),
        (newReflectionMaterial.metalness = 0),
        (newReflectionMaterial.envMap = null),
        (newReflectionMaterial.normalMap =
          newReflectionMaterial.bumpMap =
          newReflectionMaterial.roughnessMap =
          newReflectionMaterial.metalnessMap =
            null),
        newReflectionMaterial.isMeshPhysicalMaterial &&
          ((newReflectionMaterial.clearcoat = 0),
          (newReflectionMaterial.sheen = 0),
          (newReflectionMaterial.iridescence = 0),
          (newReflectionMaterial.anisotropy = 0)),
        (newReflectionMaterial.onBeforeCompile = function (shader, renderer) {
          (sourceMaterialNode.onBeforeCompile.call(this, shader, renderer),
            sourceMaterialNode.userData.plan2DetailedSurface &&
              ((shader.fragmentShader = "uniform mat4 plan2ViewToWorld;\n" + shader.fragmentShader),
              (shader.fragmentShader = shader.fragmentShader
                .replace(
                  "#include <lights_fragment_begin>",
                  "\n            vec3 reflectionNormal = normalize(mat3(plan2MotionToLayout) * mat3(plan2ViewToWorld) * normal);\n            float reflectionUp = reflectionNormal.y * 0.5 + 0.5;\n            float reflectionKey = max(dot(reflectionNormal, normalize(vec3(-0.4, 0.85, 0.32))), 0.0);\n            vec3 reflectionTint = mix(vec3(0.82, 0.85, 0.91), vec3(1.0), reflectionUp);\n            reflectedLight.indirectDiffuse = diffuseColor.rgb * reflectionTint * (0.30 + 0.40 * reflectionUp + 0.18 * reflectionKey);\n          ",
                )
                .replace("#include <lights_fragment_maps>", "")
                .replace("#include <lights_fragment_end>", ""))));
        }),
        (newReflectionMaterial.customProgramCacheKey = () =>
          sourceMaterialNode.customProgramCacheKey() + "|reflection-light-v1"),
        (materialCacheEntry = {
          copy: newReflectionMaterial,
          version: sourceMaterialNode.version,
          release() {
            (sourceMaterialNode.removeEventListener("dispose", materialCacheEntry.release),
              newReflectionMaterial.dispose(),
              materialCopyMap.delete(sourceMaterialNode),
              (stats.materials = materialCopyMap.size));
          },
        }),
        sourceMaterialNode.addEventListener("dispose", materialCacheEntry.release),
        materialCopyMap.set(sourceMaterialNode, materialCacheEntry),
        (stats.materials = materialCopyMap.size));
    }
    const reflectionMaterial = materialCacheEntry.copy;
    return (
      reflectionMaterial.color.copy(sourceMaterialNode.color),
      reflectionMaterial.emissive.copy(sourceMaterialNode.emissive),
      (reflectionMaterial.emissiveIntensity = sourceMaterialNode.emissiveIntensity),
      (reflectionMaterial.opacity = sourceMaterialNode.opacity),
      (reflectionMaterial.map = sourceMaterialNode.map),
      (reflectionMaterial.alphaMap = sourceMaterialNode.alphaMap),
      (reflectionMaterial.lightMap = sourceMaterialNode.lightMap),
      (reflectionMaterial.lightMapIntensity = sourceMaterialNode.lightMapIntensity),
      (reflectionMaterial.aoMap = sourceMaterialNode.aoMap),
      (reflectionMaterial.aoMapIntensity = sourceMaterialNode.aoMapIntensity),
      reflectionMaterial
    );
  }
  function clearPreparedBatches() {
    (cancelScheduledWork?.(),
      (cancelScheduledWork = null),
      (pendingBatches = []),
      (stats.pending = 0));
    for (const staleBatch of batchRecords) staleBatch.dispose();
    ((batchRecords.length = 0),
      (smallEntries.length = 0),
      smallEntriesByFloorId.clear(),
      (stats.batches = stats.bytes = 0));
  }
  function scheduleQueuedBatches() {
    ((stats.pending = pendingBatches.length),
      !(isDisposed || cancelScheduledWork || !pendingBatches.length) &&
        (cancelScheduledWork = scheduleWork(() => {
          cancelScheduledWork = null;
          const nextBatch = pendingBatches.shift();
          stats.pending = pendingBatches.length;
          try {
            buildBatchProxy(nextBatch);
          } catch {
            nextBatch.dispose();
          } finally {
            pendingBatches.length ? scheduleQueuedBatches() : requestFrame();
          }
        })));
  }
  function buildBatchProxy(buildingBatch) {
    if (isDisposed || buildingBatch.dead || !buildingBatch.entries.every(isGeometryKeyCurrent))
      return;
    const batchBytes = buildingBatch.entries.reduce(
      (accumulatedBytes, sourceEntry) =>
        accumulatedBytes +
        Object.values(
          sourceEntry.geometry.attributes as Record<string, GeometryAttributeLike>,
        ).reduce(
          (attributeBytes, countedAttribute) =>
            attributeBytes + countedAttribute.count * countedAttribute.itemSize * 4,
          0,
        ) +
        (sourceEntry.geometry.index?.count ?? sourceEntry.geometry.attributes.position.count) * 8,
      0,
    );
    if (stats.bytes + batchBytes > maxBytes) return;
    const geometryParts = [];
    try {
      for (const buildEntry of buildingBatch.entries) {
        const partGeometry = new three.BufferGeometry();
        geometryParts.push(partGeometry);
        for (const [mergedAttributeName, mergedAttribute] of Object.entries(
          buildEntry.geometry.attributes as Record<string, GeometryAttributeLike>,
        )) {
          const attributeFloatArray = new Float32Array(
              mergedAttribute.count * mergedAttribute.itemSize,
            ),
            componentGetters = ["getX", "getY", "getZ", "getW"];
          for (let vertexIndex = 0; vertexIndex < mergedAttribute.count; vertexIndex++)
            for (
              let componentIndex = 0;
              componentIndex < mergedAttribute.itemSize;
              componentIndex++
            )
              attributeFloatArray[vertexIndex * mergedAttribute.itemSize + componentIndex] =
                mergedAttribute[componentGetters[componentIndex]](vertexIndex);
          partGeometry.setAttribute(
            mergedAttributeName,
            new three.BufferAttribute(attributeFloatArray, mergedAttribute.itemSize),
          );
        }
        const vertexCount =
            buildEntry.geometry.index?.count ?? buildEntry.geometry.attributes.position.count,
          vertexIndexArray = new Uint32Array(vertexCount);
        for (let sourceVertexIndex = 0; sourceVertexIndex < vertexCount; sourceVertexIndex++)
          vertexIndexArray[sourceVertexIndex] = buildEntry.geometry.index
            ? buildEntry.geometry.index.getX(sourceVertexIndex)
            : sourceVertexIndex;
        (partGeometry.setIndex(new three.BufferAttribute(vertexIndexArray, 1)),
          partGeometry.applyMatrix4(buildEntry.matrix));
      }
      const mergedGeometry = mergeGeometries(geometryParts);
      if (!mergedGeometry) return;
      ((buildingBatch.geometry = mergedGeometry),
        (buildingBatch.partialGeometry = new three.BufferGeometry()));
      for (const [partialAttributeName, partialAttribute] of Object.entries(
        mergedGeometry.attributes,
      ))
        buildingBatch.partialGeometry.setAttribute(partialAttributeName, partialAttribute);
      (buildingBatch.partialGeometry.setIndex(
        new three.BufferAttribute(new Uint32Array(mergedGeometry.index.count), 1).setUsage(
          three.DynamicDrawUsage,
        ),
      ),
        (buildingBatch.selected = []),
        (buildingBatch.selection = new Uint8Array(buildingBatch.entries.length)));
      let vertexOffset = 0;
      for (const builtEntry of buildingBatch.entries)
        ((builtEntry.offset = vertexOffset),
          (builtEntry.count =
            builtEntry.geometry.index?.count ?? builtEntry.geometry.attributes.position.count),
          (vertexOffset += builtEntry.count));
      ((buildingBatch.proxy = new three.Mesh(mergedGeometry, buildingBatch.material)),
        (buildingBatch.proxy.matrixAutoUpdate = false),
        (buildingBatch.proxy.frustumCulled = false),
        (buildingBatch.proxy.receiveShadow = buildingBatch.entries[0].object.receiveShadow),
        (buildingBatch.proxy.layers.mask = buildingBatch.entries[0].object.layers.mask),
        (buildingBatch.proxy.renderOrder = buildingBatch.entries[0].object.renderOrder),
        (buildingBatch.proxy.userData.floorId = buildingBatch.owner.id),
        (buildingBatch.proxy.userData.reflectionBatch = true),
        (buildingBatch.bytes = batchBytes),
        (stats.bytes += buildingBatch.bytes),
        stats.batches++);
    } finally {
      for (const disposableGeometry of geometryParts) disposableGeometry.dispose();
    }
  }
  function prepareBatches(rootObject) {
    if (isDisposed) return;
    (restoreSceneObjects(), clearPreparedBatches());
    const batchBySignature = new Map(),
      geometryKeyByGeometry = new Map(),
      resolveGeometryKey = (queryGeometry) => (
        geometryKeyByGeometry.has(queryGeometry) ||
          geometryKeyByGeometry.set(queryGeometry, createGeometryKey(queryGeometry)),
        geometryKeyByGeometry.get(queryGeometry)
      );
    rootObject.traverse((traversedObject) => {
      if (!isSimpleMesh(traversedObject) || !isPlainMaterial(traversedObject.material)) return;
      const meshGeometry = traversedObject.geometry,
        floorOwner = findFloorOwner(traversedObject);
      if (!floorOwner) return;
      meshGeometry.boundingSphere || meshGeometry.computeBoundingSphere();
      const smallCandidate =
        !traversedObject.userData.reflectionRole && !traversedObject.material.emissive.getHex()
          ? {
              object: traversedObject,
              geometry: meshGeometry,
              key: resolveGeometryKey(meshGeometry),
              radius: meshGeometry.boundingSphere.radius,
              center: meshGeometry.boundingSphere.center.clone(),
            }
          : null;
      if (
        (smallCandidate &&
          (smallEntries.push(smallCandidate),
          smallEntriesByFloorId.has(floorOwner.id) || smallEntriesByFloorId.set(floorOwner.id, []),
          smallEntriesByFloorId.get(floorOwner.id).push(smallCandidate)),
        traversedObject.userData.reflectionSimplifiable ||
          traversedObject.userData.reflectionRole ||
          !isVisibleInHierarchy(traversedObject))
      )
        return;
      const attributeSignature = Object.entries(
        meshGeometry.attributes as Record<string, GeometryAttributeLike>,
      )
        .map(([surfaceAttributeName, surfaceAttribute]) => [
          surfaceAttributeName,
          surfaceAttribute.itemSize,
        ])
        .sort();
      if (
        Object.values(
          meshGeometry.attributes as Record<string, GeometryAttributeLike>,
        ).some((checkedAttribute) => checkedAttribute.itemSize > 4)
      )
        return;
      const batchSignature = JSON.stringify([
        floorOwner.object.id,
        traversedObject.material.uuid,
        traversedObject.receiveShadow,
        traversedObject.renderOrder,
        traversedObject.layers.mask,
        attributeSignature,
      ]);
      (batchBySignature.has(batchSignature) ||
        batchBySignature.set(batchSignature, {
          owner: floorOwner,
          material: traversedObject.material,
          entries: [],
        }),
        batchBySignature.get(batchSignature).entries.push({
          object: traversedObject,
          geometry: meshGeometry,
          key: resolveGeometryKey(meshGeometry),
          small: smallCandidate,
          matrix: new three.Matrix4()
            .copy(floorOwner.object.matrixWorld)
            .invert()
            .multiply(traversedObject.matrixWorld),
        }));
    });
    for (const batchRecord of batchBySignature.values())
      if (!(batchRecord.entries.length < 2)) {
        batchRecord.dispose = () => {
          if (!batchRecord.dead) {
            batchRecord.dead = true;
            for (const batchEntry of batchRecord.entries)
              batchEntry.geometry.removeEventListener("dispose", batchRecord.dispose);
            (batchRecord.material.removeEventListener("dispose", batchRecord.dispose),
              batchRecord.proxy &&
                (batchRecord.proxy.removeFromParent(),
                batchRecord.geometry.dispose(),
                batchRecord.partialGeometry?.dispose(),
                (stats.bytes -= batchRecord.bytes),
                stats.batches--));
          }
        };
        for (const disposeEntry of batchRecord.entries)
          disposeEntry.geometry.addEventListener("dispose", batchRecord.dispose);
        (batchRecord.material.addEventListener("dispose", batchRecord.dispose),
          batchRecords.push(batchRecord),
          pendingBatches.push(batchRecord));
      }
    scheduleQueuedBatches();
  }
  function measureWorldDiameter(measuredEntry) {
    return (
      worldScaleVector.setFromMatrixScale(measuredEntry.object.matrixWorld),
      measuredEntry.radius *
        2 *
        Math.max(
          Math.abs(worldScaleVector.x),
          Math.abs(worldScaleVector.y),
          Math.abs(worldScaleVector.z),
        )
    );
  }
  function shouldOmitDetail(detailCandidate, _cullingCamera, _viewportHeightPx) {
    const measuredObject = detailCandidate.object,
      worldDiameter = measureWorldDiameter(detailCandidate);
    if (
      worldDiameter > maxDetailDiameter ||
      !isGeometryKeyCurrent(detailCandidate) ||
      !isSimpleMesh(measuredObject) ||
      measuredObject.material.emissive?.getHex()
    )
      return false;
    projectedCenter
      .set(detailCandidate.center.x, detailCandidate.center.y, detailCandidate.center.z, 1)
      .applyMatrix4(measuredObject.matrixWorld)
      .applyMatrix4(viewProjectionMatrix);
    const projectedPixels = (worldDiameter * screenScaleFactor) / projectedCenter.w;
    return projectedCenter.w > 0 && projectedPixels <= maxDetailPixels;
  }
  function beginReflection(targetScene, renderCamera, renderHeight, floorFilter) {
    if (
      (restoreSceneObjects(),
      (geometryMatchMap = new Map()),
      viewProjectionMatrix.multiplyMatrices(
        renderCamera.projectionMatrix,
        renderCamera.matrixWorldInverse,
      ),
      (screenScaleFactor =
        (Math.max(
          Math.abs(renderCamera.projectionMatrix.elements[0]),
          Math.abs(renderCamera.projectionMatrix.elements[5]),
        ) *
          renderHeight) /
        2),
      options.batch)
    )
      for (const activeBatch of batchRecords) {
        if (
          activeBatch.dead ||
          !activeBatch.proxy ||
          (floorFilter != null && activeBatch.owner.id !== floorFilter) ||
          !isVisibleInHierarchy(activeBatch.owner.object)
        )
          continue;
        (inverseOwnerMatrix.copy(activeBatch.owner.object.matrixWorld).invert(),
          (activeBatch.selected.length = 0));
        let isBatchDirty = false,
          visibleVertexCount = 0;
        for (let entryIndex = 0; entryIndex < activeBatch.entries.length; entryIndex++) {
          const frameEntry = activeBatch.entries[entryIndex],
            isEntryUsable =
              isVisibleInHierarchy(frameEntry.object) &&
              isGeometryKeyCurrent(frameEntry) &&
              (frameEntry.object.material === activeBatch.material ||
                frameEntry.object.material === materialCopyMap.get(activeBatch.material)?.copy ||
                materialAliasMap.get(frameEntry.object.material) === activeBatch.material) &&
              frameEntry.object.receiveShadow === activeBatch.proxy.receiveShadow &&
              frameEntry.object.layers.mask === activeBatch.proxy.layers.mask &&
              frameEntry.object.renderOrder === activeBatch.proxy.renderOrder &&
              expectedLocalMatrix
                .copy(inverseOwnerMatrix)
                .multiply(frameEntry.object.matrixWorld)
                .equals(frameEntry.matrix),
            isEntryOmitted =
              isEntryUsable &&
              options.small &&
              frameEntry.small &&
              shouldOmitDetail(frameEntry.small, renderCamera, renderHeight),
            selectionState = isEntryUsable ? (isEntryOmitted ? 2 : 1) : 0;
          ((frameEntry.omitted = isEntryOmitted),
            (isBatchDirty ||= activeBatch.selection[entryIndex] !== selectionState),
            (activeBatch.selection[entryIndex] = selectionState),
            selectionState &&
              (activeBatch.selected.push(frameEntry),
              isEntryOmitted || (visibleVertexCount += frameEntry.count)));
        }
        if (activeBatch.selected.length < 2) {
          activeBatch.partialValid = false;
          continue;
        }
        if (
          ((activeBatch.proxy.geometry =
            visibleVertexCount === activeBatch.geometry.index.count
              ? activeBatch.geometry
              : activeBatch.partialGeometry),
          activeBatch.proxy.geometry === activeBatch.partialGeometry &&
            (isBatchDirty || !activeBatch.partialValid))
        ) {
          const partialIndex = activeBatch.partialGeometry.index;
          let writeOffset = 0;
          for (const selectedEntry of activeBatch.selected)
            selectedEntry.omitted ||
              (partialIndex.array.set(
                activeBatch.geometry.index.array.subarray(
                  selectedEntry.offset,
                  selectedEntry.offset + selectedEntry.count,
                ),
                writeOffset,
              ),
              (writeOffset += selectedEntry.count));
          ((partialIndex.needsUpdate = true),
            activeBatch.partialGeometry.setDrawRange(0, visibleVertexCount),
            (activeBatch.partialValid = true));
        }
        for (const hiddenEntry of activeBatch.selected)
          (hiddenObjects.push(hiddenEntry.object),
            (hiddenEntry.object.visible = false),
            hiddenEntry.omitted && stats.omitted++);
        visibleVertexCount !== 0 &&
          ((activeBatch.proxy.material = activeBatch.selected[0].object.material),
          activeBatch.proxy.matrix.copy(activeBatch.owner.object.matrixWorld),
          activeBatch.proxy.matrixWorld.copy(activeBatch.owner.object.matrixWorld),
          targetScene.add(activeBatch.proxy),
          proxyMeshes.push(activeBatch.proxy),
          (stats.savedDraws += activeBatch.selected.length - 1));
      }
    if (options.small)
      for (const candidateEntry of floorFilter == null
        ? smallEntries
        : smallEntriesByFloorId.get(String(floorFilter)) || []) {
        const candidateObject = candidateEntry.object;
        candidateObject.geometry !== candidateEntry.geometry ||
          !isVisibleInHierarchy(candidateObject) ||
          candidateObject.material.emissive?.getHex() ||
          (shouldOmitDetail(candidateEntry, renderCamera, renderHeight) &&
            (hiddenObjects.push(candidateObject),
            (candidateObject.visible = false),
            stats.omitted++));
      }
  }
  function restoreSceneObjects() {
    geometryMatchMap = null;
    for (const proxyMesh of proxyMeshes) proxyMesh.removeFromParent();
    proxyMeshes.length = 0;
    for (const hiddenObject of hiddenObjects) hiddenObject.visible = true;
    hiddenObjects.length = 0;
  }
  return {
    options: options,
    stats: stats,
    prepare: prepareBatches,
    material: getReflectionMaterial,
    begin: beginReflection,
    restore: restoreSceneObjects,
    aliasMaterial(aliasMaterial, materialToAlias) {
      materialAliasMap.set(materialToAlias, aliasMaterial);
    },
    dispose() {
      ((isDisposed = true), restoreSceneObjects(), clearPreparedBatches());
      for (const cachedEntry of [...materialCopyMap.values()]) cachedEntry.release();
    },
  };
}
