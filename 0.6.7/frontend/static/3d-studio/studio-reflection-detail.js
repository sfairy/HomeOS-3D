function scheduleIdleWork(workCallback) {
  if (globalThis.requestIdleCallback) {
    const idleCallbackHandle = requestIdleCallback(workCallback, {
      timeout: 250,
    });
    return () => cancelIdleCallback(idleCallbackHandle);
  }
  const timeoutId = setTimeout(workCallback, 0);
  return () => clearTimeout(timeoutId);
}
export function createReflectionDetail({
  THREE: three,
  requestFrame: requestFrame = () => {},
  makeWorker: makeWorker = () =>
    new Worker(
      new URL(
        "./studio-reflection-detail-worker.js?v=20260928-overview-detail-v1",
        import.meta.url,
      ),
      {
        type: "module",
      },
    ),
  scheduleWork: scheduleWork = scheduleIdleWork,
  maxBytes: maxBytes = 16 * 1024 * 1024,
  worldError: worldError = 0.02,
  ratio: targetRatio = 0.35,
  includeRuntime: shouldIncludeRuntime = true,
  runtimeWorldError: runtimeWorldError = worldError,
}) {
  const recordsByGeometry = new Map(),
    prepareQueue = [],
    scaleVector = new three.Vector3();
  let worker,
    inFlightRecord = null,
    cancelScheduledWork = null,
    nextRecordId = 0,
    isDisposed = false,
    hasFailed = false,
    hasNewDetail = false;
  const stats = {
      prepared: 0,
      pending: 0,
      failed: 0,
      sourceTriangles: 0,
      detailTriangles: 0,
      bytes: 0,
    },
    buildGeometrySignature = (signatureGeometry) =>
      [["index", signatureGeometry.index], ...Object.entries(signatureGeometry.attributes)].map(
        ([attributeKey, signatureAttribute]) => ({
          name: attributeKey,
          attribute: signatureAttribute,
          version: signatureAttribute.version,
          dataVersion: signatureAttribute.data?.version,
          count: signatureAttribute.count,
        }),
      ),
    isSignatureCurrent = (record) =>
      Object.keys(record.source.attributes).length + 1 === record.signature.length &&
      record.signature.every((signatureEntry) => {
        const liveAttribute =
          signatureEntry.name === "index"
            ? record.source.index
            : record.source.attributes[signatureEntry.name];
        return (
          liveAttribute === signatureEntry.attribute &&
          liveAttribute.version === signatureEntry.version &&
          liveAttribute.data?.version === signatureEntry.dataVersion &&
          liveAttribute.count === signatureEntry.count
        );
      }),
    isReflectionSimplifiable = (mesh) => {
      const meshMaterial = mesh.material,
        meshGeometry = mesh.geometry;
      return (
        mesh.isMesh &&
        mesh.userData?.reflectionSimplifiable &&
        (shouldIncludeRuntime || !mesh.userData.runtimeDetail) &&
        !mesh.isSkinnedMesh &&
        !mesh.isInstancedMesh &&
        !mesh.isBatchedMesh &&
        !mesh.morphTargetInfluences?.length &&
        !Object.keys(meshGeometry?.morphAttributes || {}).length &&
        meshMaterial?.isMeshStandardMaterial &&
        !meshMaterial.transparent &&
        !meshMaterial.alphaTest &&
        !meshMaterial.displacementMap &&
        !(meshMaterial.transmission > 0) &&
        !mesh.customDepthMaterial &&
        !mesh.customDistanceMaterial &&
        meshGeometry?.drawRange.start === 0 &&
        meshGeometry.drawRange.count === Infinity
      );
    },
    computeGeometryBytes = (measuredGeometry) =>
      [
        ...new Set(
          Object.values(measuredGeometry.attributes).map(
            (geometryAttribute) => geometryAttribute.array,
          ),
        ),
      ].reduce((byteSum, attributeArray) => byteSum + attributeArray.byteLength, 0),
    updatePendingCount = () => {
      stats.pending =
        prepareQueue.length +
        (inFlightRecord && recordsByGeometry.get(inFlightRecord.source) === inFlightRecord ? 1 : 0);
    };
  function releaseRecord(sourceGeometry) {
    const releasedRecord = recordsByGeometry.get(sourceGeometry);
    if (!releasedRecord) return;
    (sourceGeometry.removeEventListener("dispose", releasedRecord.release),
      recordsByGeometry.delete(sourceGeometry));
    const queueIndex = prepareQueue.indexOf(releasedRecord);
    (queueIndex !== -1 && prepareQueue.splice(queueIndex, 1),
      releasedRecord.geometry &&
        (releasedRecord.geometry.dispose(),
        (stats.bytes -= releasedRecord.bytes),
        stats.prepared--,
        (stats.sourceTriangles -= releasedRecord.sourceTriangles),
        (stats.detailTriangles -= releasedRecord.detailTriangles)),
      updatePendingCount());
  }
  function handleWorkerError() {
    ((hasFailed = true),
      (stats.failed += prepareQueue.length + (inFlightRecord ? 1 : 0)),
      (prepareQueue.length = 0),
      (inFlightRecord = null),
      updatePendingCount(),
      worker?.terminate(),
      (worker = null),
      hasNewDetail && !isDisposed && ((hasNewDetail = false), requestFrame()));
  }
  function scheduleNextPrepare() {
    if (
      (updatePendingCount(), !(isDisposed || hasFailed || inFlightRecord || cancelScheduledWork))
    ) {
      if (!prepareQueue.length) {
        hasNewDetail && ((hasNewDetail = false), requestFrame());
        return;
      }
      cancelScheduledWork = scheduleWork(() => {
        ((cancelScheduledWork = null), processNextRecord());
      });
    }
  }
  function ensureWorker() {
    if (!(worker || hasFailed))
      try {
        ((worker = makeWorker()),
          (worker.onerror = handleWorkerError),
          (worker.onmessage = ({ data: workerMessage }) => {
            if (isDisposed || !inFlightRecord || workerMessage.id !== inFlightRecord.id) return;
            const processingRecord = inFlightRecord;
            ((inFlightRecord = null), updatePendingCount());
            try {
              if (recordsByGeometry.get(processingRecord.source) !== processingRecord) return;
              if (!isSignatureCurrent(processingRecord)) {
                releaseRecord(processingRecord.source);
                return;
              }
              if (workerMessage.failed) {
                stats.failed++;
                return;
              }
              if (
                !workerMessage.indices?.length ||
                workerMessage.indices.length >= processingRecord.source.index.count * 0.9
              )
                return;
              const totalBytes =
                computeGeometryBytes(processingRecord.source) + workerMessage.indices.byteLength;
              if (stats.bytes + totalBytes > maxBytes) return;
              const simplifiedGeometry = processingRecord.source.clone();
              (simplifiedGeometry.setIndex(new three.BufferAttribute(workerMessage.indices, 1)),
                (processingRecord.geometry = simplifiedGeometry),
                (processingRecord.bytes = totalBytes),
                (stats.bytes += totalBytes),
                stats.prepared++,
                (processingRecord.sourceTriangles = processingRecord.source.index.count / 3),
                (processingRecord.detailTriangles = workerMessage.indices.length / 3),
                (stats.sourceTriangles += processingRecord.sourceTriangles),
                (stats.detailTriangles += processingRecord.detailTriangles),
                (hasNewDetail = true));
            } finally {
              scheduleNextPrepare();
            }
          }));
      } catch {
        handleWorkerError();
      }
  }
  function processNextRecord() {
    if (isDisposed || hasFailed || inFlightRecord) return;
    const queuedRecord = prepareQueue.shift();
    if ((updatePendingCount(), !queuedRecord)) {
      scheduleNextPrepare();
      return;
    }
    const recordGeometry = queuedRecord.source;
    if (!isSignatureCurrent(queuedRecord)) {
      (releaseRecord(recordGeometry), scheduleNextPrepare());
      return;
    }
    if (
      stats.bytes + computeGeometryBytes(recordGeometry) + recordGeometry.index.count * 4 >
      maxBytes
    ) {
      scheduleNextPrepare();
      return;
    }
    if (((inFlightRecord = queuedRecord), updatePendingCount(), ensureWorker(), !!worker))
      try {
        const packedAttributeNames = ["position", "normal", "color", "uv", "runtimeSurface"].filter(
            (attributeName) => recordGeometry.attributes[attributeName],
          ),
          attributeCopies = Object.fromEntries(
            packedAttributeNames.map((packedAttributeName) => {
              const sourceAttribute = recordGeometry.attributes[packedAttributeName],
                attributeCopy = new Float32Array(sourceAttribute.count * sourceAttribute.itemSize),
                componentGetterNames = ["getX", "getY", "getZ", "getW"];
              for (
                let sourceVertexIndex = 0;
                sourceVertexIndex < sourceAttribute.count;
                sourceVertexIndex++
              )
                for (
                  let componentIndex = 0;
                  componentIndex < sourceAttribute.itemSize;
                  componentIndex++
                )
                  attributeCopy[sourceVertexIndex * sourceAttribute.itemSize + componentIndex] =
                    sourceAttribute[componentGetterNames[componentIndex]](sourceVertexIndex);
              return [packedAttributeName, attributeCopy];
            }),
          ),
          interleavedAttributeNames = packedAttributeNames.filter(
            (remainingAttributeName) => remainingAttributeName !== "position",
          ),
          vertexStride = interleavedAttributeNames.reduce(
            (strideSum, strideAttributeName) =>
              strideSum + recordGeometry.attributes[strideAttributeName].itemSize,
            0,
          ),
          interleavedAttributes = new Float32Array(
            recordGeometry.attributes.position.count * vertexStride,
          ),
          attributeWeights = [];
        let attributeOffset = 0;
        for (const interleavedName of interleavedAttributeNames) {
          const attributeItemSize = recordGeometry.attributes[interleavedName].itemSize;
          for (let weightIndex = 0; weightIndex < attributeItemSize; weightIndex++)
            attributeWeights.push(
              interleavedName === "normal" ? 0.2 : interleavedName === "color" ? 1 : 2,
            );
          for (
            let targetVertexIndex = 0;
            targetVertexIndex < recordGeometry.attributes.position.count;
            targetVertexIndex++
          )
            interleavedAttributes.set(
              attributeCopies[interleavedName].subarray(
                targetVertexIndex * attributeItemSize,
                (targetVertexIndex + 1) * attributeItemSize,
              ),
              targetVertexIndex * vertexStride + attributeOffset,
            );
          attributeOffset += attributeItemSize;
        }
        const sourceIndices = new Uint32Array(recordGeometry.index.array),
          sourcePositions = attributeCopies.position;
        worker.postMessage(
          {
            id: queuedRecord.id,
            indices: sourceIndices,
            positions: sourcePositions,
            attributes: interleavedAttributes,
            stride: vertexStride,
            weights: attributeWeights,
            error: queuedRecord.error,
            ratio: targetRatio,
          },
          [sourceIndices.buffer, sourcePositions.buffer, interleavedAttributes.buffer],
        );
      } catch {
        (stats.failed++, (inFlightRecord = null), scheduleNextPrepare());
      }
  }
  function prepareRecords(sceneRoot) {
    if (isDisposed || hasFailed) return;
    const sceneGeometrySet = new Set();
    sceneRoot.traverse((existingMesh) => {
      isReflectionSimplifiable(existingMesh) && sceneGeometrySet.add(existingMesh.geometry);
    });
    for (const staleGeometry of recordsByGeometry.keys())
      sceneGeometrySet.has(staleGeometry) || releaseRecord(staleGeometry);
    (sceneRoot.traverse((traversedMesh) => {
      const geometry = traversedMesh.geometry;
      if (
        !isReflectionSimplifiable(traversedMesh) ||
        !geometry.index ||
        !geometry.attributes.position ||
        geometry.index.count < 900
      )
        return;
      const existingRecord = recordsByGeometry.get(geometry);
      existingRecord && !isSignatureCurrent(existingRecord) && releaseRecord(geometry);
      const worldScaleVector = new three.Vector3();
      traversedMesh.getWorldScale(worldScaleVector);
      const maxWorldScale = Math.max(
          Math.abs(worldScaleVector.x),
          Math.abs(worldScaleVector.y),
          Math.abs(worldScaleVector.z),
          0.001,
        ),
        scaledErrorTolerance =
          (traversedMesh.userData.runtimeDetail ? runtimeWorldError : worldError) / maxWorldScale;
      if (
        (recordsByGeometry.has(geometry) &&
          recordsByGeometry.get(geometry).error > scaledErrorTolerance * 1.000001 &&
          releaseRecord(geometry),
        recordsByGeometry.has(geometry))
      )
        return;
      const createdRecord = {
        id: ++nextRecordId,
        source: geometry,
        signature: buildGeometrySignature(geometry),
        geometry: null,
        bytes: 0,
        maxScale: maxWorldScale,
        error: scaledErrorTolerance,
        release: () => releaseRecord(geometry),
      };
      (geometry.addEventListener("dispose", createdRecord.release),
        recordsByGeometry.set(geometry, createdRecord),
        prepareQueue.push(createdRecord));
    }),
      scheduleNextPrepare());
  }
  return {
    stats: stats,
    prepare: prepareRecords,
    get(queryMesh) {
      if (!isReflectionSimplifiable(queryMesh)) return null;
      const cachedRecord = recordsByGeometry.get(queryMesh.geometry);
      if (!cachedRecord || !isSignatureCurrent(cachedRecord)) return null;
      const meshScaleVector = scaleVector.setFromMatrixScale(queryMesh.matrixWorld);
      return Math.max(
        Math.abs(meshScaleVector.x),
        Math.abs(meshScaleVector.y),
        Math.abs(meshScaleVector.z),
      ) *
        cachedRecord.error <=
        (queryMesh.userData.runtimeDetail ? runtimeWorldError : worldError) * 1.000001
        ? cachedRecord.geometry
        : null;
    },
    dispose() {
      ((isDisposed = true),
        cancelScheduledWork?.(),
        (cancelScheduledWork = null),
        worker?.terminate(),
        (inFlightRecord = null));
      for (const disposedGeometry of [...recordsByGeometry.keys()]) releaseRecord(disposedGeometry);
      ((prepareQueue.length = 0), updatePendingCount());
    },
  };
}
