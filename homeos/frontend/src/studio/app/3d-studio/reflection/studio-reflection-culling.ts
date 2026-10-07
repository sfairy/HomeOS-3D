export function createReflectionCulling(THREE: any, planeCullThreshold = 0) {
  const boundsCacheByGeometry = new WeakMap(),
    boxCacheByMesh = new WeakMap(),
    entryCacheByMesh = new WeakMap(),
    candidateEntries: any = [],
    entriesByGroupKey = new Map(),
    hiddenMeshes: any = [],
    scratchClipVector = new THREE.Vector4(),
    scratchNdcMatrix = new THREE.Matrix4(),
    scratchProjectionMatrix = new THREE.Matrix4(),
    scratchFrustum = new THREE.Frustum(),
    scratchInstanceMatrix = new THREE.Matrix4(),
    scratchInstanceBox = new THREE.Box3();
  let reflectionPlane: any = null;
  const stats = {
      tested: 0,
      culled: 0,
      skippedCaptures: 0,
    },
    isUnsupportedMaterial = (material: any) =>
      !material || material.isShaderMaterial || material.displacementMap;
  function getGeometryBounds(geometry: any) {
    const positionAttribute = geometry.attributes.position,
      cachedBounds = boundsCacheByGeometry.get(geometry);
    return (
      (!cachedBounds ||
        cachedBounds.attribute !== positionAttribute ||
        cachedBounds.version !== positionAttribute?.version ||
        cachedBounds.dataVersion !== positionAttribute?.data?.version) &&
        (geometry.computeBoundingBox(),
        boundsCacheByGeometry.set(geometry, {
          attribute: positionAttribute,
          version: positionAttribute?.version,
          dataVersion: positionAttribute?.data?.version,
        })),
      geometry.boundingBox
    );
  }
  function getWorldBounds(mesh: any) {
    const localBounds = getGeometryBounds(mesh.geometry);
    if (!localBounds || localBounds.isEmpty()) return null;
    let cachedBox = boxCacheByMesh.get(mesh);
    cachedBox ||
      ((cachedBox = {
        box: new THREE.Box3(),
        local: new THREE.Box3(),
        matrix: new THREE.Matrix4(),
        ready: false,
      }),
      boxCacheByMesh.set(mesh, cachedBox));
    const isInstanceCacheStale =
      mesh.isInstancedMesh &&
      (cachedBox.instanceAttribute !== mesh.instanceMatrix ||
        cachedBox.instanceVersion !== mesh.instanceMatrix.version ||
        cachedBox.instanceCount !== mesh.count);
    if (
      !cachedBox.ready ||
      !cachedBox.local.equals(localBounds) ||
      !cachedBox.matrix.equals(mesh.matrixWorld) ||
      isInstanceCacheStale
    ) {
      if (
        (cachedBox.local.copy(localBounds),
        cachedBox.matrix.copy(mesh.matrixWorld),
        mesh.isInstancedMesh)
      ) {
        cachedBox.box.makeEmpty();
        for (let instanceIndex = 0; instanceIndex < mesh.count; instanceIndex++)
          (mesh.getMatrixAt(instanceIndex, scratchInstanceMatrix),
            cachedBox.box.union(
              scratchInstanceBox.copy(localBounds).applyMatrix4(scratchInstanceMatrix),
            ));
        (cachedBox.box.applyMatrix4(mesh.matrixWorld),
          (cachedBox.instanceAttribute = mesh.instanceMatrix),
          (cachedBox.instanceVersion = mesh.instanceMatrix.version),
          (cachedBox.instanceCount = mesh.count));
      } else cachedBox.box.copy(localBounds).applyMatrix4(mesh.matrixWorld);
      cachedBox.ready = true;
    }
    return cachedBox.box;
  }
  function reset() {
    (restore(),
      (candidateEntries.length = 0),
      entriesByGroupKey.clear(),
      (stats.tested = stats.culled = stats.skippedCaptures = 0));
  }
  function add(candidateMesh: any, skipShadowCasters = false, entryGroupKey = "") {
    if (
      !candidateMesh.isMesh ||
      !candidateMesh.visible ||
      !candidateMesh.frustumCulled ||
      (skipShadowCasters && candidateMesh.castShadow) ||
      candidateMesh.children.length ||
      candidateMesh.isSkinnedMesh ||
      candidateMesh.isBatchedMesh ||
      candidateMesh.morphTexture ||
      candidateMesh.morphTargetInfluences?.length ||
      !candidateMesh.geometry?.attributes.position ||
      (Array.isArray(candidateMesh.material)
        ? candidateMesh.material.some(isUnsupportedMaterial)
        : isUnsupportedMaterial(candidateMesh.material))
    )
      return;
    const worldBounds = getWorldBounds(candidateMesh);
    if (
      worldBounds &&
      Number.isFinite(
        worldBounds.min.x +
          worldBounds.min.y +
          worldBounds.min.z +
          worldBounds.max.x +
          worldBounds.max.y +
          worldBounds.max.z,
      )
    ) {
      let entry = entryCacheByMesh.get(candidateMesh);
      (entry ||
        ((entry = {
          object: candidateMesh,
          box: worldBounds,
        }),
        entryCacheByMesh.set(candidateMesh, entry)),
        candidateEntries.push(entry),
        entriesByGroupKey.has(entryGroupKey) || entriesByGroupKey.set(entryGroupKey, []),
        entriesByGroupKey.get(entryGroupKey).push(entry));
    }
  }
  function prepare(capture: any, camera: any) {
    (restore(), (reflectionPlane = capture.plane));
    const sourceBounds = getWorldBounds(capture.source);
    let minU = Infinity,
      minV = Infinity,
      maxU = -Infinity,
      maxV = -Infinity,
      isInsideFrustum = !!sourceBounds;
    if (sourceBounds)
      for (let cornerIndex = 0; cornerIndex < 8; cornerIndex++) {
        if (
          (scratchClipVector
            .set(
              cornerIndex & 1 ? sourceBounds.max.x : sourceBounds.min.x,
              cornerIndex & 2 ? sourceBounds.max.y : sourceBounds.min.y,
              cornerIndex & 4 ? sourceBounds.max.z : sourceBounds.min.z,
              1,
            )
            .applyMatrix4(capture.matrix),
          scratchClipVector.w <= 0.00001)
        ) {
          isInsideFrustum = false;
          break;
        }
        const projectedX = scratchClipVector.x / scratchClipVector.w,
          projectedY = scratchClipVector.y / scratchClipVector.w;
        ((minU = Math.min(minU, projectedX)),
          (maxU = Math.max(maxU, projectedX)),
          (minV = Math.min(minV, projectedY)),
          (maxV = Math.max(maxV, projectedY)));
      }
    if ((scratchProjectionMatrix.copy(camera.projectionMatrix), isInsideFrustum)) {
      const edgePadding = 0.013671875 + 2 / capture.map.width;
      if (
        ((minU = Math.max(0, minU - edgePadding)),
        (minV = Math.max(0, minV - edgePadding)),
        (maxU = Math.min(1, maxU + edgePadding)),
        (maxV = Math.min(1, maxV + edgePadding)),
        maxU <= minU || maxV <= minV)
      )
        return (stats.skippedCaptures++, false);
      const uSpan = maxU - minU,
        vSpan = maxV - minV;
      (scratchNdcMatrix.set(
        1 / uSpan,
        0,
        0,
        -(minU + maxU - 1) / uSpan,
        0,
        1 / vSpan,
        0,
        -(minV + maxV - 1) / vSpan,
        0,
        0,
        1,
        0,
        0,
        0,
        0,
        1,
      ),
        scratchProjectionMatrix.premultiply(scratchNdcMatrix));
    }
    return (
      scratchFrustum.setFromProjectionMatrix(
        scratchProjectionMatrix.multiply(camera.matrixWorldInverse),
      ),
      true
    );
  }
  function cullEntries(entries: any) {
    for (const { object: entryObject, box: entryBounds } of entries || []) {
      stats.tested++;
      const planeNormal = reflectionPlane?.normal;
      ((planeCullThreshold > 0 &&
        planeNormal &&
        planeNormal.x * (planeNormal.x >= 0 ? entryBounds.min.x : entryBounds.max.x) +
          planeNormal.y * (planeNormal.y >= 0 ? entryBounds.min.y : entryBounds.max.y) +
          planeNormal.z * (planeNormal.z >= 0 ? entryBounds.min.z : entryBounds.max.z) +
          reflectionPlane.constant >
          planeCullThreshold + 0.0001) ||
        !scratchFrustum.intersectsBox(entryBounds)) &&
        (hiddenMeshes.push(entryObject), (entryObject.visible = false), stats.culled++);
    }
  }
  function apply(applyGroupKey: any = null) {
    return (
      applyGroupKey === null
        ? cullEntries(candidateEntries)
        : (cullEntries(entriesByGroupKey.get("")),
          applyGroupKey !== "" && cullEntries(entriesByGroupKey.get(applyGroupKey))),
      true
    );
  }
  function begin(targetCapture: any, targetCamera: any, beginGroupKey: any = null) {
    return prepare(targetCapture, targetCamera) && apply(beginGroupKey);
  }
  function restore() {
    for (const hiddenMesh of hiddenMeshes) hiddenMesh.visible = true;
    hiddenMeshes.length = 0;
  }
  return {
    reset: reset,
    add: add,
    prepare: prepare,
    apply: apply,
    begin: begin,
    restore: restore,
    stats: stats,
  };
}
