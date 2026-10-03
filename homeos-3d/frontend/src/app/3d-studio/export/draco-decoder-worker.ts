

type DracoWorkerScope = {
  onmessage: ((event: { data: any }) => void) | null;
  postMessage: (message: any, transfer?: Transferable[]) => void;
  importScripts: (...scriptUrls: string[]) => void;
  DracoDecoderModule: (moduleConfig: any) => any;
  [injectedGlobalName: string]: any;
};
const workerScope = globalThis as unknown as DracoWorkerScope;
let decoderPending = null;
workerScope.onmessage = (event) => {
  const payload = event.data || {};
  if (payload.type === "init") {
    decoderPending = initializeDecoder(payload);
    return;
  }
  if (payload.type !== "decode") return;
  (decoderPending || Promise.reject(new Error("Draco decoder is not initialized")))
    .then(({ draco: dracoModule }) => {
      const dracoDecoder = new dracoModule.Decoder();
      try {
        const geometryPayload = decodeGeometry(
            dracoModule,
            dracoDecoder,
            new Int8Array(payload.buffer),
            payload.taskConfig,
          ),
          transferables = geometryPayload.attributes.map((attribute) => attribute.array.buffer);
        (geometryPayload.index && transferables.push(geometryPayload.index.array.buffer),
          workerScope.postMessage(
            {
              type: "decode",
              id: payload.id,
              geometry: geometryPayload,
            },
            transferables,
          ));
      } catch (decodeError) {
        workerScope.postMessage({
          type: "error",
          id: payload.id,
          error: decodeError?.message || String(decodeError),
        });
      } finally {
        dracoModule.destroy(dracoDecoder);
      }
    })
    .catch((workerError) => {
      workerScope.postMessage({
        type: "error",
        id: payload.id,
        error: workerError?.message || String(workerError),
      });
    });
};
function initializeDecoder(options) {
  const decoderPath = String(options.decoderPath || ""),
    decoderConfig = {
      ...(options.decoderConfig || {}),
    },
    wrapperFileName = decoderConfig.type === "js" ? "draco_decoder.js" : "draco_wasm_wrapper.js";
  try {
    workerScope.importScripts("" + decoderPath + wrapperFileName);
  } catch (importError) {
    return Promise.reject(importError);
  }
  return (
    (decoderConfig.locateFile = (fileName) =>
      "" +
      decoderPath +
      (fileName === "draco_decoder_gltf.wasm" ? "draco_decoder.wasm" : fileName)),
    new Promise((resolve, reject) => {
      let isModuleLoaded = false;
      decoderConfig.onModuleLoaded = (module) => {
        ((isModuleLoaded = true),
          resolve({
            draco: module,
          }));
      };
      try {
        const modulePromise = workerScope.DracoDecoderModule(decoderConfig);
        modulePromise &&
          typeof modulePromise.then == "function" &&
          modulePromise.then((dracoInstance) => {
            isModuleLoaded ||
              resolve({
                draco: dracoInstance,
              });
          }, reject);
      } catch (moduleError) {
        reject(moduleError);
      }
    })
  );
}
function decodeGeometry(draco, decoder, decodeBuffer, taskConfig) {
  const attributeIds = taskConfig.attributeIDs,
    attributeTypes = taskConfig.attributeTypes;
  let dracoGeometry, decodeResult;
  const geometryType = decoder.GetEncodedGeometryType(decodeBuffer);
  if (geometryType === draco.TRIANGULAR_MESH)
    ((dracoGeometry = new draco.Mesh()),
      (decodeResult = decoder.DecodeArrayToMesh(
        decodeBuffer,
        decodeBuffer.byteLength,
        dracoGeometry,
      )));
  else {
    if (geometryType === draco.POINT_CLOUD)
      ((dracoGeometry = new draco.PointCloud()),
        (decodeResult = decoder.DecodeArrayToPointCloud(
          decodeBuffer,
          decodeBuffer.byteLength,
          dracoGeometry,
        )));
    else throw new Error("THREE.DRACOLoader: Unexpected geometry type.");
  }
  if (!decodeResult.ok() || dracoGeometry.ptr === 0)
    throw new Error("THREE.DRACOLoader: Decoding failed: " + decodeResult.error_msg());
  const geometrySource = {
    index: null,
    attributes: [],
  };
  for (const attributeKey in attributeIds) {
    const attributeType = workerScope[attributeTypes[attributeKey]];
    let dracoAttribute;
    if (taskConfig.useUniqueIDs)
      dracoAttribute = decoder.GetAttributeByUniqueId(dracoGeometry, attributeIds[attributeKey]);
    else {
      const attributeId = decoder.GetAttributeId(dracoGeometry, draco[attributeIds[attributeKey]]);
      if (attributeId === -1) continue;
      dracoAttribute = decoder.GetAttribute(dracoGeometry, attributeId);
    }
    const decodedAttribute = decodeAttribute(
      draco,
      decoder,
      dracoGeometry,
      attributeKey,
      attributeType,
      dracoAttribute,
    );
    (attributeKey === "color" && (decodedAttribute.vertexColorSpace = taskConfig.vertexColorSpace),
      geometrySource.attributes.push(decodedAttribute));
  }
  return (
    geometryType === draco.TRIANGULAR_MESH &&
      (geometrySource.index = decodeIndex(draco, decoder, dracoGeometry)),
    draco.destroy(dracoGeometry),
    geometrySource
  );
}
function decodeIndex(dracoDecoderModule, meshDecoder, mesh) {
  const indexCount = mesh.num_faces() * 3,
    indexByteLength = indexCount * 4,
    indexPointer = dracoDecoderModule._malloc(indexByteLength);
  meshDecoder.GetTrianglesUInt32Array(mesh, indexByteLength, indexPointer);
  const indexArray = new Uint32Array(
    dracoDecoderModule.HEAPF32.buffer,
    indexPointer,
    indexCount,
  ).slice();
  return (
    dracoDecoderModule._free(indexPointer),
    {
      array: indexArray,
      itemSize: 1,
    }
  );
}
/** 解码后交给主线程的顶点属性描述（与 three 的 InterleavedBufferAttribute 形状对齐）。 */
type DecodedAttribute = {
  name: string;
  count: number;
  itemSize: number;
  array: unknown;
  stride: number;
  vertexColorSpace?: string;
};
function decodeAttribute(
  dracoApi,
  attributeDecoder,
  meshOrPointCloud,
  attributeName,
  arrayType,
  sourceAttribute,
): DecodedAttribute {
  const pointCount = meshOrPointCloud.num_points(),
    componentCount = sourceAttribute.num_components(),
    dracoAttributeType = getDracoDataType(dracoApi, arrayType),
    componentByteLength = componentCount * arrayType.BYTES_PER_ELEMENT,
    alignedByteLength = Math.ceil(componentByteLength / 4) * 4,
    alignedComponentCount = alignedByteLength / arrayType.BYTES_PER_ELEMENT,
    bufferByteLength = pointCount * componentByteLength,
    paddedByteLength = pointCount * alignedByteLength,
    bufferOffset = dracoApi._malloc(bufferByteLength);
  attributeDecoder.GetAttributeDataArrayForAllPoints(
    meshOrPointCloud,
    sourceAttribute,
    dracoAttributeType,
    bufferByteLength,
    bufferOffset,
  );
  const rawAttributeArray = new arrayType(
    dracoApi.HEAPF32.buffer,
    bufferOffset,
    bufferByteLength / arrayType.BYTES_PER_ELEMENT,
  );
  let packedAttributeArray;
  if (componentByteLength === alignedByteLength) packedAttributeArray = rawAttributeArray.slice();
  else {
    packedAttributeArray = new arrayType(paddedByteLength / arrayType.BYTES_PER_ELEMENT);
    let targetOffset = 0;
    for (
      let sourceOffset = 0;
      sourceOffset < rawAttributeArray.length;
      sourceOffset += componentCount
    ) {
      for (let componentIndex = 0; componentIndex < componentCount; componentIndex += 1)
        packedAttributeArray[targetOffset + componentIndex] =
          rawAttributeArray[sourceOffset + componentIndex];
      targetOffset += alignedComponentCount;
    }
  }
  return (
    dracoApi._free(bufferOffset),
    {
      name: attributeName,
      count: pointCount,
      itemSize: componentCount,
      array: packedAttributeArray,
      stride: alignedComponentCount,
    }
  );
}
function getDracoDataType(dracoApiInstance, arrayConstructor) {
  if (arrayConstructor === Float32Array) return dracoApiInstance.DT_FLOAT32;
  if (arrayConstructor === Int8Array) return dracoApiInstance.DT_INT8;
  if (arrayConstructor === Int16Array) return dracoApiInstance.DT_INT16;
  if (arrayConstructor === Int32Array) return dracoApiInstance.DT_INT32;
  if (arrayConstructor === Uint8Array) return dracoApiInstance.DT_UINT8;
  if (arrayConstructor === Uint16Array) return dracoApiInstance.DT_UINT16;
  if (arrayConstructor === Uint32Array) return dracoApiInstance.DT_UINT32;
  throw new Error("THREE.DRACOLoader: Unsupported attribute array type.");
}
